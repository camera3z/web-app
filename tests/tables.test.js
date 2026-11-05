import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {tableMenuURL} from '../src/tables.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const dish={id:'water',name:'Nước lọc',category:'Đồ uống',price:10000,description:'',image:'/images/menu.svg',available:true,best:false};
test('table QR isolation, creation, ordering and shared-menu restrictions',async t=>{
 const db=new PGlite();let r,other,tables,otherTable,legacy;
 const legacyRequest=randomUUID(),client=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users values('${A}'),('${B}');`);
 for(const file of ['schema.sql','orders.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
 await db.query("insert into public.licenses(key_hash,user_id,expires_at) values('a',$1,now()+interval '1 year'),('b',$2,now()+interval '1 year')",[A,B]);
 const role=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role '+(user?'authenticated':'anon'))};
 const save=async()=> (await db.query('select public.save_restaurant($1,$2,$3,$4::jsonb,0) r',['Quán','','',JSON.stringify([dish])])).rows[0].r;
 await role(A);r=await save();await role(B);other=await save();
 const args=(token=randomUUID(),slug=r.slug)=>[slug,JSON.stringify([{id:'water',quantity:1}]),'Đơn bàn',token,client,10000];
 const placeOld=(token)=>db.query('select public.place_menu_order($1,$2::jsonb,$3,$4,$5,$6) o',args(token));
 await role(null);legacy=(await placeOld(legacyRequest)).rows[0].o;
 await db.exec('reset role');const sql=await readFile(new URL('../supabase/tables.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await t.test('owner creates 50 stable table codes without duplicates',async()=>{
  await role(A);await db.query('select public.ensure_restaurant_tables(50)');tables=(await db.query('select * from public.restaurant_tables order by table_number')).rows;assert.equal(tables.length,50);assert.equal(new Set(tables.map(t=>t.qr_token)).size,50);
  await db.query('select public.ensure_restaurant_tables(50)');assert.deepEqual((await db.query('select qr_token from public.restaurant_tables order by table_number')).rows.map(t=>t.qr_token),tables.map(t=>t.qr_token));
 });
 await t.test('table codes and list are private to the owner',async()=>{
  await role(B);assert.equal((await db.query('select * from public.restaurant_tables')).rows.length,0);await db.query('select public.ensure_restaurant_tables(1)');otherTable=(await db.query('select * from public.restaurant_tables')).rows[0];
  await role(null);await assert.rejects(()=>db.query('select * from public.restaurant_tables'),/permission denied/);
 });
 await t.test('public QR context belongs to matching menu only',async()=>{
  const context=await db.query('select public.get_table_context($1,$2) c',[r.slug,tables[0].qr_token]);assert.deepEqual(context.rows[0].c,{number:1,label:'Bàn 01'});
  assert.equal((await db.query('select public.get_table_context($1,$2) c',[r.slug,otherTable.qr_token])).rows[0].c,null);
 });
 await t.test('common QR cannot create new orders; original retry still works',async()=>{
  await assert.rejects(()=>placeOld(randomUUID()),/Mã chung chỉ dùng xem menu/);
  assert.equal((await placeOld(legacyRequest)).rows[0].o.code,legacy.code);
  await assert.rejects(()=>db.query('select public.place_menu_order_base($1,$2::jsonb,$3,$4,$5,$6)',args()),/permission denied/);
 });
 await t.test('order receives server table number and retries cannot move it',async()=>{
  const request=randomUUID();const call=token=>db.query('select public.place_menu_order($1,$2::jsonb,$3,$4,$5,$6,$7) o',[...args(request),token]);
  const first=(await call(tables[0].qr_token)).rows[0].o;assert.equal(first.table_number,1);assert.equal((await call(tables[0].qr_token)).rows[0].o.code,first.code);await assert.rejects(()=>call(tables[1].qr_token),/bàn khác/);
  await assert.rejects(()=>db.query('select public.place_menu_order($1,$2::jsonb,$3,$4,$5,$6,$7)',[...args(),otherTable.qr_token]),/không hợp lệ/);
  await role(A);const order=(await db.query('select table_number,table_id from public.menu_orders where order_code=$1',[first.code])).rows[0];assert.equal(order.table_number,1);assert.equal(order.table_id,tables[0].id);
  const old=(await db.query('select table_number from public.menu_orders where order_code=$1',[legacy.code])).rows[0];assert.equal(old.table_number,null);
 });
 await t.test('disabled table cannot accept new orders',async()=>{
  await db.exec('reset role');await db.query('update public.restaurant_tables set active=false where id=$1',[tables[0].id]);await role(null);await assert.rejects(()=>db.query('select public.place_menu_order($1,$2::jsonb,$3,$4,$5,$6,$7)',[...args(),tables[0].qr_token]),/không nhận đơn/);
 });
 }finally{await db.close()}
});
test('table QR URL keeps menu and token and removes stale fragments',()=>{
 const url=new URL(tableMenuURL('quan-abc','table-token','https://menu.example.test/?menu=old#access_token=old'));
 assert.equal(url.searchParams.get('menu'),'quan-abc');assert.equal(url.searchParams.get('table'),'table-token');assert.equal(url.hash,'');
});
