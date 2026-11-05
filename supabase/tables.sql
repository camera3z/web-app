-- Per-table QR codes. Run after orders.sql and order-workflow.sql (if installed).
create table if not exists public.restaurant_tables (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id),
 table_number integer not null check(table_number between 1 and 200),
 qr_token uuid not null unique default gen_random_uuid(),
 active boolean not null default true,
 unique(restaurant_id,table_number)
);
alter table public.restaurant_tables enable row level security;
revoke all on public.restaurant_tables from anon,authenticated;
grant select on public.restaurant_tables to authenticated;
grant all on public.restaurant_tables to service_role;
drop policy if exists "Owner reads tables" on public.restaurant_tables;
create policy "Owner reads tables" on public.restaurant_tables for select to authenticated
using(exists(select 1 from public.restaurants r where r.id=restaurant_id and r.owner_id=(select auth.uid())));
alter table public.menu_orders add column if not exists table_id uuid references public.restaurant_tables(id);
alter table public.menu_orders add column if not exists table_number integer;
grant select(table_id,table_number) on public.menu_orders to authenticated;

create or replace function public.ensure_restaurant_tables(table_count integer default 50)
returns void language plpgsql security definer set search_path='' as $$
declare r public.restaurants;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập'; end if;
 if table_count is null or table_count not between 1 and 200 then raise exception 'Số bàn từ 1 đến 200'; end if;
 select * into r from public.restaurants where owner_id=auth.uid();
 if not found then raise exception 'Hãy lưu thông tin quán trước'; end if;
 perform 1 from public.licenses where user_id=auth.uid() and not revoked and expires_at>now() for share;
 if not found then raise exception 'Bản quyền không còn hiệu lực'; end if;
 insert into public.restaurant_tables(restaurant_id,table_number) select r.id,n from generate_series(1,table_count) n on conflict(restaurant_id,table_number) do nothing;
end;
$$;
revoke all on function public.ensure_restaurant_tables(integer) from public,anon;
grant execute on function public.ensure_restaurant_tables(integer) to authenticated;

create or replace function public.get_table_context(menu_slug text, table_token uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('number',t.table_number,'label','Bàn '||case when t.table_number<10 then '0' else '' end||t.table_number::text)
 from public.restaurant_tables t join public.restaurants r on r.id=t.restaurant_id
 where r.slug=menu_slug and t.qr_token=table_token and t.active
 and exists(select 1 from public.licenses l where l.user_id=r.owner_id and not l.revoked and l.expires_at>now());
$$;
revoke all on function public.get_table_context(text,uuid) from public;
grant execute on function public.get_table_context(text,uuid) to anon,authenticated;

-- Preserve the original order validator as a private implementation.
do $$begin
 if to_regprocedure('public.place_menu_order_base(text,jsonb,text,uuid,uuid,numeric)') is null then
  alter function public.place_menu_order(text,jsonb,text,uuid,uuid,numeric) rename to place_menu_order_base;
 end if;
end$$;
revoke all on function public.place_menu_order_base(text,jsonb,text,uuid,uuid,numeric) from public,anon,authenticated;

-- Old/common QR may only retry an already-submitted request. It cannot create a new order.
create or replace function public.place_menu_order(menu_slug text, order_items jsonb, order_note text, request_token uuid, client_token uuid, expected_total numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.menu_orders where request_id=request_token) then raise exception 'Vui lòng quét mã QR tại bàn để gọi món. Mã chung chỉ dùng xem menu'; end if;
 return public.place_menu_order_base(menu_slug,order_items,order_note,request_token,client_token,expected_total);
end;
$$;
revoke all on function public.place_menu_order(text,jsonb,text,uuid,uuid,numeric) from public;
grant execute on function public.place_menu_order(text,jsonb,text,uuid,uuid,numeric) to anon,authenticated;

create or replace function public.place_menu_order(menu_slug text, order_items jsonb, order_note text, request_token uuid, client_token uuid, expected_total numeric, table_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.restaurant_tables; r_id uuid; existing public.menu_orders; receipt jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(request_token::text,1));
 select id into r_id from public.restaurants where slug=menu_slug;
 select * into t from public.restaurant_tables where restaurant_id=r_id and qr_token=table_token for share;
 if not found then raise exception 'Mã bàn không hợp lệ. Hãy quét lại QR tại bàn'; end if;
 select * into existing from public.menu_orders where request_id=request_token;
 if found then
  if existing.table_id is distinct from t.id then raise exception 'Yêu cầu đã được sử dụng cho bàn khác'; end if;
 elsif not t.active then raise exception 'Bàn hiện không nhận đơn'; end if;
 receipt:=public.place_menu_order_base(menu_slug,order_items,order_note,request_token,client_token,expected_total);
 update public.menu_orders set table_id=t.id,table_number=t.table_number where request_id=request_token and table_id is null;
 return receipt||jsonb_build_object('table_number',t.table_number);
end;
$$;
revoke all on function public.place_menu_order(text,jsonb,text,uuid,uuid,numeric,uuid) from public;
grant execute on function public.place_menu_order(text,jsonb,text,uuid,uuid,numeric,uuid) to anon,authenticated;
