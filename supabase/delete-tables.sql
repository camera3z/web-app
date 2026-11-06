-- Remove a table from active use, retaining all order history.
create or replace function public.remove_restaurant_table(target_table_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare t public.restaurant_tables; owner uuid;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập'; end if;
 select * into t from public.restaurant_tables where id=target_table_id for update;
 if not found then raise exception 'Không tìm thấy bàn'; end if;
 select owner_id into owner from public.restaurants where id=t.restaurant_id;
 if owner<>auth.uid() then raise exception 'Không có quyền xóa bàn này'; end if;
 perform 1 from public.licenses where user_id=owner and not revoked and expires_at>now() for share;
 if not found then raise exception 'Bản quyền không còn hiệu lực'; end if;
 update public.restaurant_tables set active=false where id=t.id;
end;
$$;
revoke all on function public.remove_restaurant_table(uuid) from public,anon;
grant execute on function public.remove_restaurant_table(uuid) to authenticated;

-- Adding an already-active table keeps its QR. Recreating a removed table issues a new QR.
create or replace function public.add_restaurant_table(new_table_number integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.restaurants;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập'; end if;
 if new_table_number is null or new_table_number not between 1 and 200 then raise exception 'Số bàn từ 1 đến 200'; end if;
 select * into r from public.restaurants where owner_id=auth.uid();
 if not found then raise exception 'Hãy lưu thông tin quán trước'; end if;
 perform 1 from public.licenses where user_id=auth.uid() and not revoked and expires_at>now() for share;
 if not found then raise exception 'Bản quyền không còn hiệu lực'; end if;
 insert into public.restaurant_tables(restaurant_id,table_number) values(r.id,new_table_number)
 on conflict(restaurant_id,table_number) do update set
  qr_token=case when public.restaurant_tables.active then public.restaurant_tables.qr_token else gen_random_uuid() end,
  active=true;
end;
$$;
revoke all on function public.add_restaurant_table(integer) from public,anon;
grant execute on function public.add_restaurant_table(integer) to authenticated;
