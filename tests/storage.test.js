import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Storage policies isolate uploads and require active licenses',async t=>{
 const db=new PGlite();const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 insert into auth.users values('${A}'),('${B}');
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;
 grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const sql=await readFile(new URL('../supabase/storage.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await db.query("insert into public.licenses(key_hash,user_id,expires_at) values('test',$1,now()+interval '1 day')",[A]);
 const role=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role '+(user?'authenticated':'anon'))};
 const insert=path=>db.query("insert into storage.objects(bucket_id,name) values('menu-images',$1)",[path]);
 await t.test('bucket restricts file types and file size',async()=>{const b=(await db.query('select * from storage.buckets')).rows[0];assert.equal(b.public,true);assert.equal(b.file_size_limit,5242880);assert.deepEqual(b.allowed_mime_types,['image/jpeg','image/png','image/webp'])});
 await t.test('licensed owner uploads only to own folder',async()=>{await role(A);await insert(A+'/photo.webp');await assert.rejects(()=>insert(B+'/photo.webp'),/row-level security/);assert.equal((await db.query('select * from storage.objects')).rows.length,1)});
 await t.test('unlicensed owner cannot upload or delete another owner image',async()=>{await role(B);await assert.rejects(()=>insert(B+'/photo.webp'),/row-level security/);assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0)});
 await t.test('anonymous upload and expired-license upload denied',async()=>{await role(null);await assert.rejects(()=>insert(A+'/anon.webp'),/permission denied/);await db.exec('reset role');await db.exec("update public.licenses set expires_at=now()-interval '1 day'");await role(A);await assert.rejects(()=>insert(A+'/expired.webp'),/row-level security/)});
 }finally{await db.close()}
});
