-- Upgrade existing installations: custom categories, preserving all menus and licenses.
alter table public.restaurants add column if not exists categories text[] not null default '{}';
update public.restaurants r set categories=array(select distinct trim(c) from (select unnest(r.categories) c union all select value->>'category' from jsonb_array_elements(r.dishes)) names where length(trim(c)) between 1 and 80 order by trim(c));

create or replace function public.save_restaurant(
  restaurant_name text, restaurant_tagline text, restaurant_address text,
  menu_dishes jsonb, expected_version bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.restaurants; dish jsonb; ids text[] := '{}'; new_categories text[];
begin
  if auth.uid() is null then raise exception 'Vui lòng đăng nhập'; end if;
  -- Serialize saves and license changes for this owner.
  perform 1 from public.licenses where user_id = auth.uid() and not revoked and expires_at > now() for share;
  if not found then raise exception 'Bản quyền chưa kích hoạt hoặc đã hết hạn'; end if;
  if restaurant_name is null or length(trim(restaurant_name)) not between 1 and 80
    or restaurant_tagline is null or length(restaurant_tagline) > 180
    or restaurant_address is null or length(restaurant_address) > 200 then
    raise exception 'Thông tin quán không hợp lệ';
  end if;
  if menu_dishes is null or jsonb_typeof(menu_dishes) <> 'array' then raise exception 'Thực đơn không hợp lệ'; end if;
  if jsonb_array_length(menu_dishes) > 500 then raise exception 'Tối đa 500 món'; end if;
  for dish in select value from jsonb_array_elements(menu_dishes) loop
    if jsonb_typeof(dish) <> 'object' or not (dish ?& array['id','name','category','price','description','image','available','best'])
      or jsonb_typeof(dish->'id') <> 'string' or length(dish->>'id') not between 1 and 80
      or jsonb_typeof(dish->'name') <> 'string' or length(trim(dish->>'name')) not between 1 and 100
      or jsonb_typeof(dish->'category') <> 'string' or length(trim(dish->>'category')) not between 1 and 80
      or jsonb_typeof(dish->'price') <> 'number'
      or jsonb_typeof(dish->'description') <> 'string' or length(dish->>'description') > 300
      or jsonb_typeof(dish->'image') <> 'string' or length(dish->>'image') > 2048
      or (dish->>'image' !~ '^https://[^[:space:]]+$' and dish->>'image' !~ '^/images/[a-zA-Z0-9._-]+$')
      or jsonb_typeof(dish->'available') <> 'boolean' or jsonb_typeof(dish->'best') <> 'boolean' then
      raise exception 'Dữ liệu món không hợp lệ';
    end if;
    if (dish->>'price')::numeric < 0 or (dish->>'price')::numeric > 100000000
      or (dish->>'price')::numeric <> trunc((dish->>'price')::numeric) then raise exception 'Giá món không hợp lệ'; end if;
    if dish->>'id' = any(ids) then raise exception 'Mã món bị trùng'; end if;
    ids := array_append(ids,dish->>'id');
  end loop;
  -- Serializes initial creation as well as subsequent writes for one account.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into item from public.restaurants where owner_id = auth.uid() for update;
  new_categories := array(select distinct trim(c) from (select unnest(coalesce(item.categories,'{}')) as c union all select value->>'category' from jsonb_array_elements(menu_dishes)) names where length(trim(c))>0 order by trim(c));
  if item.id is null then
    if expected_version is distinct from 0 then raise exception 'Dữ liệu đã thay đổi. Hãy tải lại trang'; end if;
    insert into public.restaurants(owner_id,name,tagline,address,dishes,categories)
      values(auth.uid(),trim(restaurant_name),restaurant_tagline,restaurant_address,menu_dishes,new_categories) returning * into item;
  else
    if expected_version is distinct from item.version then raise exception 'Dữ liệu đã thay đổi trên thiết bị khác. Hãy tải lại trang'; end if;
    update public.restaurants set name=trim(restaurant_name),tagline=restaurant_tagline,address=restaurant_address,
      dishes=menu_dishes,categories=new_categories,version=version+1,updated_at=now() where id=item.id returning * into item;
  end if;
  return jsonb_build_object('id',item.id,'slug',item.slug,'name',item.name,'tagline',item.tagline,
    'address',item.address,'dishes',item.dishes,'categories',item.categories,'version',item.version);
end;
$$;
revoke all on function public.save_restaurant(text,text,text,jsonb,bigint) from public,anon;
grant execute on function public.save_restaurant(text,text,text,jsonb,bigint) to authenticated;

