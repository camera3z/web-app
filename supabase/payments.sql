-- Cash payment ledger. Run after orders.sql. Existing orders are not assumed paid.
alter table public.menu_orders add column if not exists payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid'));
alter table public.menu_orders add column if not exists payment_method text check(payment_method in ('cash'));
alter table public.menu_orders add column if not exists paid_at timestamptz;
alter table public.menu_orders add column if not exists cash_received numeric(20,0);
grant select(payment_status,payment_method,paid_at,cash_received) on public.menu_orders to authenticated;

-- Keep payment rules enforced even if an older status RPC is reapplied later.
create or replace function public.enforce_order_payment_transition()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.status is distinct from old.status then
  if new.status='served' and new.payment_status<>'paid' then raise exception 'Cần xác nhận thanh toán trước khi hoàn tất phục vụ'; end if;
  if new.status='rejected' and new.payment_status='paid' then raise exception 'Đơn đã thu tiền, không thể từ chối. Cần xử lý hoàn tiền riêng'; end if;
 end if;
 return new;
end;
$$;
revoke all on function public.enforce_order_payment_transition() from public,anon,authenticated;
drop trigger if exists enforce_order_payment_transition on public.menu_orders;
create trigger enforce_order_payment_transition before update of status on public.menu_orders
for each row execute function public.enforce_order_payment_transition();

create or replace function public.pay_menu_order_cash(order_id uuid, cash_amount numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.menu_orders; owner uuid;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập'; end if;
 select * into o from public.menu_orders where id=order_id for update;
 if not found then raise exception 'Không tìm thấy đơn'; end if;
 select owner_id into owner from public.restaurants where id=o.restaurant_id;
 if owner<>auth.uid() then raise exception 'Không có quyền thu tiền đơn này'; end if;
 perform 1 from public.licenses where user_id=owner and not revoked and expires_at>now() for share;
 if not found then raise exception 'Bản quyền không còn hiệu lực'; end if;
 if o.status='rejected' then raise exception 'Không thể thu tiền đơn đã từ chối'; end if;
 if o.payment_status='paid' then
  return jsonb_build_object('payment_status','paid','paid_at',o.paid_at,'cash_received',o.cash_received,'change',o.cash_received-o.total);
 end if;
 if cash_amount is null or cash_amount='NaN'::numeric or cash_amount<o.total or cash_amount>100000000000 or trunc(cash_amount)<>cash_amount then raise exception 'Tiền khách đưa phải là số nguyên và đủ thanh toán'; end if;
 update public.menu_orders set payment_status='paid',payment_method='cash',paid_at=now(),cash_received=cash_amount,updated_at=now() where id=o.id;
 return jsonb_build_object('payment_status','paid','paid_at',now(),'cash_received',cash_amount,'change',cash_amount-o.total);
end;
$$;
revoke all on function public.pay_menu_order_cash(uuid,numeric) from public,anon;
grant execute on function public.pay_menu_order_cash(uuid,numeric) to authenticated;

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
 if next_status='served' and o.payment_status<>'paid' then raise exception 'Cần xác nhận thanh toán trước khi hoàn tất phục vụ'; end if;
 if next_status='rejected' and o.payment_status='paid' then raise exception 'Đơn đã thu tiền, không thể từ chối. Cần xử lý hoàn tiền riêng'; end if;
 if not ((o.status='new' and next_status in ('accepted','rejected')) or (o.status='accepted' and next_status in ('preparing','rejected')) or (o.status='preparing' and next_status in ('served','rejected'))) then raise exception 'Chuyển trạng thái không hợp lệ'; end if;
 update public.menu_orders set status=next_status,updated_at=now() where id=o.id;
 return jsonb_build_object('status',next_status);
end;
$$;
revoke all on function public.set_menu_order_status(uuid,text,text) from public,anon;
grant execute on function public.set_menu_order_status(uuid,text,text) to authenticated;
