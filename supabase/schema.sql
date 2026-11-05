-- Idempotent setup/migration. Run in the Supabase SQL Editor as project administrator.
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  key_hash text unique not null,
  user_id uuid references auth.users(id),
  expires_at timestamptz not null,
  revoked boolean not null default false
);
alter table public.licenses enable row level security;
drop policy if exists "Owner can read license" on public.licenses;
create policy "Owner can read license" on public.licenses for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.licenses from anon, authenticated;
grant select (id,user_id,expires_at,revoked) on public.licenses to authenticated;
grant all on public.licenses to service_role;

create or replace function public.activate_license(license_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.licenses;
begin
  if auth.uid() is null then raise exception 'Vui lòng đăng nhập trước khi kích hoạt'; end if;
  if license_key is null or length(trim(license_key)) < 16 or length(license_key) > 256 then raise exception 'Key không hợp lệ'; end if;
  select * into item from public.licenses
    where key_hash = encode(sha256(convert_to(trim(license_key),'UTF8')),'hex') for update;
  if not found or item.revoked or item.expires_at <= now() then raise exception 'Key không hợp lệ hoặc đã hết hạn'; end if;
  if item.user_id is not null and item.user_id <> auth.uid() then raise exception 'Key đã được sử dụng'; end if;
  update public.licenses set user_id = auth.uid() where id = item.id;
  return jsonb_build_object('message','Đã kích hoạt bản quyền','expires_at',item.expires_at);
end;
$$;
revoke all on function public.activate_license(text) from public, anon;
grant execute on function public.activate_license(text) to authenticated;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id),
  slug text not null unique default ('quan-' || replace(gen_random_uuid()::text,'-','')),
  name text not null check (length(trim(name)) between 1 and 80),
  tagline text not null default '' check (length(tagline) <= 180),
  address text not null default '' check (length(address) <= 200),
  dishes jsonb not null default '[]'::jsonb check (jsonb_typeof(dishes) = 'array'),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.restaurants add column if not exists categories text[] not null default '{}';
alter table public.restaurants enable row level security;
drop policy if exists "Owner can read restaurant" on public.restaurants;
create policy "Owner can read restaurant" on public.restaurants for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.restaurants from anon, authenticated;
grant select on public.restaurants to authenticated;
grant all on public.restaurants to service_role;

-- No client direct writes. This RPC enforces identity + license on every mutation.
-- Optimistic version checks prevent silent overwrites from another tab/device.
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

-- Public projection excludes owner IDs, licenses, hashes and email addresses.
create or replace function public.get_public_menu(menu_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name',r.name,'tagline',r.tagline,'address',r.address,
    'dishes',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',d->>'id','name',d->>'name','category',d->>'category','price',d->'price',
      'description',d->>'description','image',d->>'image','available',d->'available','best',d->'best'
    )), '[]'::jsonb) from jsonb_array_elements(r.dishes) d))
  from public.restaurants r where r.slug=menu_slug
    and exists(select 1 from public.licenses l where l.user_id=r.owner_id and not l.revoked and l.expires_at>now());
$$;
revoke all on function public.get_public_menu(text) from public;
grant execute on function public.get_public_menu(text) to anon,authenticated;
