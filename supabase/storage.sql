-- Run once in Supabase SQL Editor. Re-running is safe.
-- Public images are for customer menus. Never store private documents in this bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('menu-images','menu-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "qrmenu_image_insert" on storage.objects;
create policy "qrmenu_image_insert" on storage.objects for insert to authenticated
with check (
 bucket_id='menu-images'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.licenses where user_id=(select auth.uid()) and not revoked and expires_at>now())
);
-- No UPDATE policy: new images use unique filenames and never overwrite existing menu assets.
drop policy if exists "qrmenu_image_select_owner" on storage.objects;
create policy "qrmenu_image_select_owner" on storage.objects for select to authenticated
using(bucket_id='menu-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "qrmenu_image_delete_owner" on storage.objects;
create policy "qrmenu_image_delete_owner" on storage.objects for delete to authenticated
using(bucket_id='menu-images' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.licenses where user_id=(select auth.uid()) and not revoked and expires_at>now()));
