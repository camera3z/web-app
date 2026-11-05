-- Correct workflow: prepare -> optional print -> served. No mandatory cash payment.
-- Preserve all orders and existing payment records.
drop trigger if exists enforce_order_payment_transition on public.menu_orders;

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
