import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pendingTotals} from '../src/orders.js';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const dish={id:'water',name:'Nước lọc',category:'Đồ uống',price:10000,description:'',image:'/images/menu.svg',available:true,best:false};
test('customer orders: server pricing, retries, isolation and processing',async t=>{
 const db=new PGlite();let saved,receipt,orderId;
 const client=randomUUID(),request=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users values('${A}'),('${B}');`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const sql=await readFile(new URL('../supabase/orders.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await db.query("insert into public.licenses(key_hash,user_id,expires_at) values('a',$1,now()+interval '1 year'),('b',$2,now()+interval '1 year')",[A,B]);
 const role=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role '+(user?'authenticated':'anon'))};
 await role(A);saved=(await db.query('select public.save_restaurant($1,$2,$3,$4::jsonb,0) as r',['A','','',JSON.stringify([dish,{...dish,id:'soldout',available:false}])])).rows[0].r;
 const place=(items=[{id:'water',quantity:3}],token=randomUUID(),total=30000,note='Ít đá',who=client)=>db.query('select public.place_menu_order($1,$2::jsonb,$3,$4,$5,$6) as o',[saved.slug,JSON.stringify(items),note,token,who,total]);
 await t.test('guest creates order with server snapshots and timestamp',async()=>{await role(null);receipt=(await place(undefined,request)).rows[0].o;assert.equal(receipt.total,30000);assert.match(receipt.code,/^Q-/);assert.equal(receipt.status,'new');assert.ok(Date.parse(receipt.created_at));await assert.rejects(()=>db.query('select * from public.menu_orders'),/permission denied/)});
 await t.test('same request retries return same receipt without duplicate',async()=>{const again=(await place(undefined,request)).rows[0].o;assert.equal(again.code,receipt.code);await assert.rejects(()=>place([{id:'water',quantity:2}],request,20000),/đã được sử dụng/)});
 await t.test('tampered totals, duplicate lines, invalid quantities and unavailable dishes rejected',async()=>{
  await assert.rejects(()=>place(undefined,randomUUID(),1),/Giá món/);
  for(const quantity of [0,-1,100,1.5,null,'3'])await assert.rejects(()=>place([{id:'water',quantity}]),/không hợp lệ|Số lượng/);
  await assert.rejects(()=>place([{id:'soldout',quantity:1}],randomUUID(),10000),/đã hết/);
  await assert.rejects(()=>place([{id:'missing',quantity:1}]),/đã hết/);
  await assert.rejects(()=>place([{id:'water',quantity:1},{id:'water',quantity:1}],randomUUID(),20000),/bị trùng/);
  await assert.rejects(()=>place([],randomUUID(),0),/50 món/);
 });
 await t.test('other owner cannot see order or update it',async()=>{
  await role(A);const rows=(await db.query('select id,items from public.menu_orders')).rows;assert.equal(rows.length,1);orderId=rows[0].id;assert.equal(rows[0].items[0].price,10000);
  await role(B);assert.equal((await db.query('select id from public.menu_orders')).rows.length,0);await assert.rejects(()=>db.query("select public.set_menu_order_status($1,'new','accepted')",[orderId]),/Không có quyền/);
 });
 await t.test('owner transitions are guarded and terminal states cannot be reopened',async()=>{
  await role(A);await db.query("select public.set_menu_order_status($1,'new','accepted')",[orderId]);await assert.rejects(()=>db.query("select public.set_menu_order_status($1,'new','rejected')",[orderId]),/thiết bị khác/);await db.query("select public.set_menu_order_status($1,'accepted','preparing')",[orderId]);await db.query("select public.set_menu_order_status($1,'preparing','served')",[orderId]);await assert.rejects(()=>db.query("select public.set_menu_order_status($1,'served','new')",[orderId]),/không hợp lệ/);
  await assert.rejects(()=>db.query("update public.menu_orders set total=0 where id=$1",[orderId]),/permission denied/);
 });
 await t.test('cash collection, ownership, idempotency and completion guards',async()=>{
    await db.exec('reset role');
    const payments=await readFile(new URL('../supabase/payments.sql',import.meta.url),'utf8');await db.exec(payments);await db.exec(payments);
    await role(null);const cashOrder=(await place(undefined,randomUUID(),30000,'Thanh toán test',randomUUID())).rows[0].o;
    await role(A);const id=(await db.query('select id from public.menu_orders where order_code=$1',[cashOrder.code])).rows[0].id;
    await assert.rejects(()=>db.query('select public.pay_menu_order_cash($1,20000)',[id]),/đủ thanh toán/);
    await assert.rejects(()=>db.query('select public.pay_menu_order_cash($1,30000.5)',[id]),/số nguyên/);
    await role(B);await assert.rejects(()=>db.query('select public.pay_menu_order_cash($1,50000)',[id]),/Không có quyền/);
    await role(A);await db.query("select public.set_menu_order_status($1,'new','accepted')",[id]);await db.query("select public.set_menu_order_status($1,'accepted','preparing')",[id]);
    await assert.rejects(()=>db.query("select public.set_menu_order_status($1,'preparing','served')",[id]),/thanh toán/);
    const paid=(await db.query('select public.pay_menu_order_cash($1,50000) as p',[id])).rows[0].p;assert.equal(paid.change,20000);assert.equal(paid.cash_received,50000);assert.ok(paid.paid_at);
    const retry=(await db.query('select public.pay_menu_order_cash($1,100000) as p',[id])).rows[0].p;assert.equal(retry.cash_received,50000);assert.equal(retry.paid_at,paid.paid_at);
    await assert.rejects(()=>db.query("select public.set_menu_order_status($1,'preparing','rejected')",[id]),/đã thu tiền/);
    await db.query("select public.set_menu_order_status($1,'preparing','served')",[id]);
    const row=(await db.query('select payment_status,payment_method,cash_received,status from public.menu_orders where id=$1',[id])).rows[0];assert.equal(row.payment_status,'paid');assert.equal(row.payment_method,'cash');assert.equal(row.status,'served');
    await assert.rejects(()=>db.query("update public.menu_orders set payment_status='unpaid' where id=$1",[id]),/permission denied/);
    await role(null);await assert.rejects(()=>db.query('select public.pay_menu_order_cash($1,50000)',[id]),/permission denied/);
  });
  await t.test('client submission limit rejects sixth order in a minute',async()=>{await role(null);for(let i=0;i<4;i++)await place();await assert.rejects(()=>place(),/quá nhanh/)});
 await t.test('expired license blocks new orders but retry receipt is retained',async()=>{
  await db.exec('reset role');await db.query("update public.licenses set expires_at=now()-interval '1 day' where user_id=$1",[A]);await role(null);await assert.rejects(()=>place(undefined,randomUUID(),30000,'',randomUUID()),/chưa nhận đơn/);assert.equal((await place(undefined,request)).rows[0].o.code,receipt.code);
 });
 }finally{await db.close()}
});
test('pending summary excludes served and rejected orders',()=>{
 const item={id:'water',name:'Nước lọc',quantity:3};
 assert.deepEqual(pendingTotals([{status:'new',items:[item]},{status:'preparing',items:[{...item,quantity:2}]},{status:'served',items:[item]},{status:'rejected',items:[item]}]),[{name:'Nước lọc',quantity:5}]);
});
