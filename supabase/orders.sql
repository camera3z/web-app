-- Customer orders: run after schema.sql. No table number or payment integration.
create table if not exists public.menu_orders (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id),
 request_id uuid not null unique,
 client_id uuid not null,
 request_payload jsonb not null,
 order_code text not null unique default ('Q-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 items jsonb not null,
 total numeric(20,0) not null check(total>=0),
 note text not null default '',
 status text not null default 'new' check(status in ('new','accepted','preparing','served','rejected')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists menu_orders_queue on public.menu_orders(restaurant_id,status,created_at);
create index if not exists menu_orders_client on public.menu_orders(restaurant_id,client_id,created_at);
alter table public.menu_orders enable row level security;
revoke all on public.menu_orders from anon,authenticated;
grant select(id,restaurant_id,order_code,items,total,note,status,created_at,updated_at) on public.menu_orders to authenticated;
grant all on public.menu_orders to service_role;
drop policy if exists "Owner reads orders" on public.menu_orders;
create policy "Owner reads orders" on public.menu_orders for select to authenticated
using(exists(select 1 from public.restaurants r where r.id=restaurant_id and r.owner_id=(select auth.uid())));

create or replace function public.place_menu_order(menu_slug text, order_items jsonb, order_note text, request_token uuid, client_token uuid, expected_total numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.restaurants; o public.menu_orders; line jsonb; dish jsonb;
 snapshot jsonb:='[]'; total_price numeric:=0; quantity integer; count_items integer:=0; ids text[]:='{}'; payload jsonb;
begin
 if request_token is null or client_token is null then raise exception 'Mã yêu cầu không hợp lệ'; end if;
 if order_items is null or jsonb_typeof(order_items)<>'array' then raise exception 'Giỏ món không hợp lệ'; end if;
 if jsonb_array_length(order_items) not between 1 and 50 or order_note is null or length(order_note)>500 then raise exception 'Tối đa 50 món và 500 ký tự ghi chú'; end if;
 payload:=jsonb_build_object('items',order_items,'note',trim(order_note),'total',expected_total);
 perform pg_advisory_xact_lock(hashtextextended(request_token::text,1));
 select * into r from public.restaurants where slug=menu_slug for share;
 if not found then raise exception 'Không tìm thấy cửa hàng'; end if;
 select * into o from public.menu_orders where request_id=request_token;
 if found then
  if o.restaurant_id<>r.id or o.client_id<>client_token or o.request_payload<>payload then raise exception 'Mã yêu cầu đã được sử dụng. Vui lòng tải lại trang'; end if;
  return jsonb_build_object('code',o.order_code,'total',o.total,'created_at',o.created_at,'status',o.status);
 end if;
 perform 1 from public.licenses where user_id=r.owner_id and not revoked and expires_at>now() for share;
 if not found then raise exception 'Cửa hàng hiện chưa nhận đơn'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.id::text||client_token::text,2));
 if (select count(*) from public.menu_orders where restaurant_id=r.id and client_id=client_token and created_at>now()-interval '1 minute')>=5 then raise exception 'Bạn gửi đơn quá nhanh. Vui lòng chờ một phút'; end if;
 for line in select value from jsonb_array_elements(order_items) loop
  if jsonb_typeof(line)<>'object' or not(line ?& array['id','quantity']) or jsonb_typeof(line->'id')<>'string' or jsonb_typeof(line->'quantity')<>'number' then raise exception 'Dữ liệu món không hợp lệ'; end if;
  if (line->>'quantity')::numeric not between 1 and 99 or trunc((line->>'quantity')::numeric)<>(line->>'quantity')::numeric then raise exception 'Số lượng phải từ 1 đến 99'; end if;
  quantity:=(line->>'quantity')::integer;count_items:=count_items+quantity;
  if count_items>500 then raise exception 'Mỗi đơn tối đa 500 phần'; end if;
  if line->>'id'=any(ids) then raise exception 'Món bị trùng trong giỏ'; end if;
  ids:=array_append(ids,line->>'id');
  select value into dish from jsonb_array_elements(r.dishes) where value->>'id'=line->>'id';
  if not found or (dish->>'available')::boolean is not true then raise exception 'Một món đã hết hoặc không còn trong thực đơn. Hãy tải lại menu'; end if;
  total_price:=total_price+(dish->>'price')::numeric*quantity;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',dish->>'id','name',dish->>'name','quantity',quantity,'price',(dish->>'price')::numeric,'subtotal',(dish->>'price')::numeric*quantity));
 end loop;
 if expected_total is null or expected_total<>total_price then raise exception 'Giá món đã thay đổi. Hãy tải lại menu và kiểm tra tổng tiền trước khi gửi'; end if;
 insert into public.menu_orders(restaurant_id,request_id,client_id,request_payload,items,total,note)
 values(r.id,request_token,client_token,payload,snapshot,total_price,trim(order_note)) returning * into o;
 return jsonb_build_object('code',o.order_code,'total',o.total,'created_at',o.created_at,'status',o.status);
end;
$$;
revoke all on function public.place_menu_order(text,jsonb,text,uuid,uuid,numeric) from public;
grant execute on function public.place_menu_order(text,jsonb,text,uuid,uuid,numeric) to anon,authenticated;

create or replace function public.set_menu_order_status(order_id uuid, expected_status text, next_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.menu_orders; owner uuid;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập'; end if;
 select * into o from public.menu_orders where id=order_id for update;
 if not found then raise exception 'Không tìm thấy đơn'; end if;
 select owner_id into owner from public.restaurants where id=o.restaurant_id;
 if owner<>auth.uid() then raise exception 'Không có quyền xử lý đơn này'; end if;
 perform 1 from public.licenses where user_id=owner and not revoked and expires_at>now() for share;
 if not found then raise exception 'Bản quyền không còn hiệu lực'; end if;
 if o.status<>expected_status then raise exception 'Đơn đã được xử lý trên thiết bị khác. Hãy làm mới'; end if;
 if not ((o.status='new' and next_status in ('accepted','rejected')) or (o.status='accepted' and next_status in ('preparing','rejected')) or (o.status='preparing' and next_status in ('served','rejected'))) then raise exception 'Chuyển trạng thái không hợp lệ'; end if;
 update public.menu_orders set status=next_status,updated_at=now() where id=o.id;
 return jsonb_build_object('status',next_status);
end;
$$;
revoke all on function public.set_menu_order_status(uuid,text,text) from public,anon;
grant execute on function public.set_menu_order_status(uuid,text,text) to authenticated;
