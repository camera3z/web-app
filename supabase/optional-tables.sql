-- Restore remote ordering from common QR and add tables individually. Run after tables.sql.
-- Common QR accepts remote orders without a table.
create or replace function public.place_menu_order(menu_slug text, order_items jsonb, order_note text, request_token uuid, client_token uuid, expected_total numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return public.place_menu_order_base(menu_slug,order_items,order_note,request_token,client_token,expected_total);
end;
$$;
revoke all on function public.place_menu_order(text,jsonb,text,uuid,uuid,numeric) from public;
grant execute on function public.place_menu_order(text,jsonb,text,uuid,uuid,numeric) to anon,authenticated;


-- Create exactly one requested table; never create preceding numbers.
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
 insert into public.restaurant_tables(restaurant_id,table_number) values(r.id,new_table_number) on conflict(restaurant_id,table_number) do nothing;
end;
$$;
revoke all on function public.add_restaurant_table(integer) from public,anon;
grant execute on function public.add_restaurant_table(integer) to authenticated;
