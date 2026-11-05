import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { hasActiveLicense } from '../src/backend.js';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const raw='QRM-test-0123456789abcdef';
const hash=createHash('sha256').update(raw).digest('hex');
const dish={id:'dish-1',name:'Cà phê sữa',category:'Cà phê',price:35000,description:'Món thử',image:'/images/coffee.svg',available:true,best:false};

test('PostgreSQL: tenant isolation, licenses, validation and public menu',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    insert into auth.users values('${A}'),('${B}');`);
  const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');
  await db.exec(schema);
  await db.exec(schema); // Migration must also work against the previous setup.
  const role=async(user)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
    await db.exec('set role '+(user?'authenticated':'anon'));
  };
  const save=(items=[dish],version=0)=>db.query('select public.save_restaurant($1,$2,$3,$4::jsonb,$5) as menu',['Quán A','Xin chào','Địa chỉ',JSON.stringify(items),version]);
  let saved;
  await t.test('anonymous cannot activate or save',async()=>{
    await role(null);
    await assert.rejects(()=>db.query('select public.activate_license($1)',[raw]),/permission denied/);
    await assert.rejects(()=>save(),/permission denied/);
  });
  await t.test('unlicensed account cannot save',async()=>{
    await role(A);await assert.rejects(()=>save(),/Bản quyền/);
    await assert.rejects(()=>db.exec("insert into public.licenses(key_hash,expires_at) values('fake',now()+interval '1 year')"),/permission denied/);
  });
  await db.exec('reset role');
  await db.query("insert into public.licenses(key_hash,expires_at) values($1,now()+interval '1 year')",[hash]);
  await t.test('activation binds key, is repeatable for same account',async()=>{
    await role(A);
    await db.query('select public.activate_license($1)',[raw]);
    await db.query('select public.activate_license($1)',[raw]);
    await assert.rejects(()=>db.exec('select key_hash from public.licenses'),/permission denied/);
    await assert.rejects(()=>db.query('select public.activate_license($1)',['incorrect-key-0000000']),/Key không hợp lệ/);
  });
  await t.test('different account cannot claim key or read owner license',async()=>{
    await role(B);
    await assert.rejects(()=>db.query('select public.activate_license($1)',[raw]),/đã được sử dụng/);
    assert.equal((await db.query('select id from public.licenses')).rows.length,0);
  });
  await t.test('licensed owner creates a private row with stable public slug',async()=>{
    await role(A);saved=(await save()).rows[0].menu;
    assert.match(saved.slug,/^quan-[a-f0-9]{32}$/);
    assert.equal(saved.version,1);
    assert.equal(saved.dishes[0].price,35000);
    await assert.rejects(()=>db.exec("update public.restaurants set name='bypass'"),/permission denied/);
  });
  await t.test('another account cannot read restaurant or overwrite it',async()=>{
    await role(B);assert.equal((await db.query('select * from public.restaurants')).rows.length,0);
    await assert.rejects(()=>save([],1),/Bản quyền/);
  });
  await t.test('public RPC exposes menu but no ownership or license data',async()=>{
    await role(null);
    await assert.rejects(()=>db.exec('select * from public.restaurants'),/permission denied/);
    await assert.rejects(()=>db.exec('select id from public.licenses'),/permission denied/);
    const menu=(await db.query('select public.get_public_menu($1) as menu',[saved.slug])).rows[0].menu;
    assert.equal(menu.name,'Quán A');assert.equal(menu.dishes[0].name,dish.name);
    assert.deepEqual(Object.keys(menu).sort(),['address','dishes','name','tagline']);
    assert.equal((await db.query("select public.get_public_menu('missing') as menu")).rows[0].menu,null);
  });
  await t.test('updates persist and stale device writes are rejected',async()=>{
    await role(A);
    const updated=(await save([{...dish,price:49000}],1)).rows[0].menu;
    assert.equal(updated.slug,saved.slug);assert.equal(updated.version,2);
    await assert.rejects(()=>save([],1),/thiết bị khác/);
    assert.equal((await db.query('select dishes from public.restaurants')).rows[0].dishes[0].price,49000);
  });
  await t.test('invalid or unsafe menu data rejected on server',async()=>{
    for(const bad of [
      {...dish,price:-1},{...dish,price:0.1},{...dish,price:'35000'},
      {...dish,image:'javascript:alert(1)'},{...dish,name:''},{...dish,available:null},
      {...dish,category:'   '}, {...dish,category:'a'.repeat(81)}, {...dish,id:null},
    ]) await assert.rejects(()=>save([bad],2),/không hợp lệ/);
    await assert.rejects(()=>save([dish,dish],2),/bị trùng/);
    await assert.rejects(()=>save(Array.from({length:501},()=>dish),2),/500/);
  });
  await t.test('custom categories persist after their last dish is removed',async()=>{
    await db.exec('reset role');
    const migration=await readFile(new URL('../supabase/categories.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await role(A);
    const custom=(await save([{...dish,category:'Món chính'}],2)).rows[0].menu;
    assert.ok(custom.categories.includes('Món chính'));
    const empty=(await save([],3)).rows[0].menu;
    assert.ok(empty.categories.includes('Món chính'));
    await save([{...dish,price:49000}],4);
  });
  await t.test('second licensed account gets separate restaurant',async()=>{
    await db.exec('reset role');
    await db.query("insert into public.licenses(key_hash,user_id,expires_at) values('second',$1,now()+interval '1 year')",[B]);
    await role(B);const second=(await save()).rows[0].menu;
    assert.notEqual(second.slug,saved.slug);
    assert.equal((await db.query('select * from public.restaurants')).rows.length,1);
    await role(A);assert.equal((await db.query('select dishes from public.restaurants')).rows[0].dishes[0].price,49000);
  });
  await t.test('revocation immediately blocks writes and hides public menu',async()=>{
    await db.exec('reset role');await db.query('update public.licenses set revoked=true where user_id=$1',[A]);
    await role(A);await assert.rejects(()=>save([],2),/Bản quyền/);
    await assert.rejects(()=>db.query('select public.activate_license($1)',[raw]),/hết hạn/);
    await role(null);assert.equal((await db.query('select public.get_public_menu($1) as menu',[saved.slug])).rows[0].menu,null);
  });
  await t.test('expired license blocks writes and public visibility',async()=>{
    await db.exec('reset role');await db.query("update public.licenses set revoked=false,expires_at=now()-interval '1 day' where user_id=$1",[A]);
    await role(A);await assert.rejects(()=>save([],2),/Bản quyền/);
    await role(null);assert.equal((await db.query('select public.get_public_menu($1) as menu',[saved.slug])).rows[0].menu,null);
  });
 } finally {await db.close()}
});

test('license display handles revoked, expired and invalid expiry values',()=>{
 const now=Date.parse('2026-11-05T00:00:00Z');
 assert.equal(hasActiveLicense([],now),false);
 assert.equal(hasActiveLicense([{expires_at:'invalid',revoked:false}],now),false);
 assert.equal(hasActiveLicense([{expires_at:'2026-11-04',revoked:false}],now),false);
 assert.equal(hasActiveLicense([{expires_at:'2027-01-01',revoked:true}],now),false);
 assert.equal(hasActiveLicense([{expires_at:'2027-01-01',revoked:false}],now),true);
});
