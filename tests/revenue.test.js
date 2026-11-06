import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {reportingDate} from '../src/revenue.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('reports aggregate all rows by Vietnamese completion and cash dates, isolated by owner',async t=>{
 const db=new PGlite();let a,b;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users values('${A}'),('${B}');`);
 for(const name of ['schema.sql','orders.sql'])await db.exec(await readFile(new URL('../supabase/'+name,import.meta.url),'utf8'));
 a=(await db.query("insert into public.restaurants(owner_id,name) values($1,'A') returning id",[A])).rows[0].id;b=(await db.query("insert into public.restaurants(owner_id,name) values($1,'B') returning id",[B])).rows[0].id;
 // Legacy record: backfill uses updated_at, not creation time.
 await db.query("insert into public.menu_orders(restaurant_id,request_id,client_id,request_payload,items,total,status,created_at,updated_at) values($1,gen_random_uuid(),gen_random_uuid(),'{}','[]',100,'served','2026-11-04T12:00:00Z','2026-11-05T16:59:59Z')",[a]);
 const migration=await readFile(new URL('../supabase/revenue.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 const add=async(shop,total,status,completed,paid=null,created='2026-11-05T00:00:00Z')=>db.query("insert into public.menu_orders(restaurant_id,request_id,client_id,request_payload,items,total,status,created_at,updated_at,completed_at,payment_status,payment_method,paid_at) values($1,gen_random_uuid(),gen_random_uuid(),'{}','[]',$2,$3,$4,now(),$5,$6,$7,$8)",[shop,total,status,created,completed,paid?'paid':'unpaid',paid?'cash':null,paid]);
 await add(a,200,'served','2026-11-05T17:00:00Z'); // Nov 6 local, excluded from Nov 5
 await add(a,300,'served','2026-11-04T17:00:00Z','2026-11-05T10:00:00Z'); // Nov 5 midnight
 await add(a,400,'preparing',null);await add(a,500,'rejected',null);await add(a,600,'new',null,null,'2026-11-05T11:00:00Z');
 await add(a,700,'served','2026-10-31T17:00:00Z'); // Nov 1 local
 await add(a,800,'accepted',null,'2026-11-05T12:00:00Z'); // paid but not served
 await db.query("update public.menu_orders set payment_status='paid',payment_method='cash',paid_at='2026-11-05T12:00:00Z' where restaurant_id=$1 and total=800",[a]);
 await add(b,99999,'served','2026-11-05T00:00:00Z','2026-11-05T00:00:00Z');
 // More than UI's 200-row limit must all be counted.
 await db.query("insert into public.menu_orders(restaurant_id,request_id,client_id,request_payload,items,total,status,created_at,completed_at) select $1,gen_random_uuid(),gen_random_uuid(),'{}','[]',10,'served','2026-11-05T01:00:00Z','2026-11-05T01:00:00Z' from generate_series(1,205)",[a]);
 const role=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role '+(user?'authenticated':'anon'))};
 const report=async(kind,date)=>(await db.query('select public.get_revenue_report($1,$2) r',[kind,date])).rows[0].r;
 await t.test('day total counts completion date, excludes pending/rejected and includes >200 orders',async()=>{
  await role(A);const r=await report('day','2026-11-05');assert.equal(r.completed_total,2450);assert.equal(r.completed_count,207);assert.equal(r.cash_total,1100);assert.equal(r.pending_count,3);assert.equal(r.pending_total,1800);assert.equal(r.rejected_count,1);assert.equal(r.buckets.length,24);assert.equal(r.buckets.reduce((n,b)=>n+b.completed_total,0),r.completed_total);assert.equal(r.buckets[0].completed_total,300);assert.equal(r.buckets[23].completed_total,100);
 });
 await t.test('month and year have exact totals and complete buckets',async()=>{
  const m=await report('month','2026-11-25');assert.equal(m.completed_total,3350);assert.equal(m.buckets.length,30);assert.equal(m.buckets.reduce((n,b)=>n+b.completed_total,0),3350);
  const y=await report('year','2026-01-01');assert.equal(y.completed_total,3350);assert.equal(y.buckets.length,12);assert.equal(y.buckets[10].completed_total,3350);
  const leap=await report('month','2024-02-10');assert.equal(leap.buckets.length,29);assert.equal(leap.completed_total,0);
 });
 await t.test('other owner sees only its own totals; guest cannot query reports',async()=>{
  await role(B);assert.equal((await report('day','2026-11-05')).completed_total,99999);await role(null);await assert.rejects(()=>report('day','2026-11-05'),/permission denied/);
 });
 await t.test('invalid period rejected and completion trigger captures server time once',async()=>{
  await role(A);await assert.rejects(()=>report('invalid','2026-11-05'),/không hợp lệ/);
  await db.exec('reset role');const id=(await db.query("select id from public.menu_orders where restaurant_id=$1 and status='preparing'",[a])).rows[0].id;
  await db.query("update public.menu_orders set status='served' where id=$1",[id]);const first=(await db.query('select completed_at from public.menu_orders where id=$1',[id])).rows[0].completed_at;assert.ok(first);
  await db.query("update public.menu_orders set updated_at=now(),status='served' where id=$1",[id]);assert.equal(String((await db.query('select completed_at from public.menu_orders where id=$1',[id])).rows[0].completed_at),String(first));
 });
 }finally{await db.close()}
});
test('report date uses UTC+7 rather than browser or UTC date',()=>{
 assert.equal(reportingDate(new Date('2026-11-05T17:00:00Z')),'2026-11-06');
 assert.equal(reportingDate(new Date('2026-12-31T18:00:00Z')),'2027-01-01');
});
