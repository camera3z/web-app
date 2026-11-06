import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const root=new URL('../',import.meta.url).pathname;
const children=[];
let browser;
const start=async(port,online)=>{
 const env={...process.env,VITE_SUPABASE_URL:online?'https://qrmenu-test.supabase.co':'',VITE_SUPABASE_ANON_KEY:online?'test-public-key':''};
 const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 children.push(child);let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error('Vite failed: '+logs);
   try{const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok)return `http://127.0.0.1:${port}`;}catch{}
   await new Promise(r=>setTimeout(r,100));
 }
 throw Error('Vite readiness timeout: '+logs);
};
const user={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const dish={id:'1',name:'Món online',category:'Cà phê',price:42000,description:'Từ server',image:'/images/coffee.svg',available:true,best:false};
let cloud={id:'restaurant-1',slug:'quan-test',name:'Quán Online',tagline:'Xin chào',address:'Hà Nội',dishes:[dish],version:1};
let active=true,failSave=false,offline=false,restaurantReads=0,signupRequests=0;
const tableToken='55555555-5555-4555-8555-555555555555';let tables=[];const errors=[];const orders=[];let dropOrderResponse=true;
try {
 const demo=await start(5186,false);const online=await start(5187,true);
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(demo);await page.locator('nav [data-nav=menu]').click();await page.locator('#add').click();await page.locator('[name=name]').fill('Món kiểm thử');await page.locator('[name=category]').fill('Món chính');const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=20;c.height=20;c.getContext('2d').fillRect(0,0,20,20);return c.toDataURL('image/png').split(',')[1]});await page.locator('#dish-photo-file').setInputFiles({name:'mon-an.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByText(/Đã chọn mon-an.png/).waitFor();await page.getByRole('button',{name:'Lưu món',exact:true}).click();await page.locator('.dish').filter({hasText:'Món kiểm thử'}).waitFor();await page.reload();await page.locator('nav [data-nav=menu]').click();await page.locator('#search').fill('Món kiểm thử');assert.equal(await page.locator('.dish').count(),1);assert.match(await page.locator('.dish-photo img').getAttribute('src'),/^data:image\/webp/);await page.locator('[data-toggle]').uncheck();await page.locator('.sold-out').waitFor();
 await page.locator('[data-edit]').click();page.once('dialog',d=>d.accept());await page.locator('#delete-dish').click();await page.locator('.empty').waitFor();await page.locator('#add').click();assert.ok(await page.locator('#dish-categories option[value="Món chính"]').count());await page.locator('#cancel-modal').click();
 console.log('PASS demo: create, persistence, search, availability, delete');
 const mockRoute=async route=>{
  const path=new URL(route.request().url()).pathname;
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(offline)return route.abort();
  if(path.startsWith('/storage/v1/object/menu-images/'))return json({Key:path});
  if(path.startsWith('/storage/v1/object/public/menu-images/'))return route.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')});
  if(path==='/auth/v1/user')return json(user);
  if(path==='/auth/v1/signup'){signupRequests++;return signupRequests===1?json({msg:'email rate limit exceeded',error_code:'over_email_send_rate_limit'},429):json(user);}
  if(path==='/auth/v1/recover')return json({});
  if(path==='/auth/v1/token'){
   const body=route.request().postDataJSON();
   if(body.password!=='Test-password-123!')return json({msg:'Invalid login credentials',error_code:'invalid_credentials'},400);
   const payload=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})).toString('base64url');
   return json({access_token:`e30.${payload}.test`,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
  }
  if(path==='/auth/v1/otp')return json({});
  if(path==='/auth/v1/logout')return json({});
  if(path==='/rest/v1/rpc/get_revenue_report'){
   const b=route.request().postDataJSON();const count=b.report_kind==='day'?24:b.report_kind==='month'?30:12;
   return json({kind:b.report_kind,start:b.chosen_date,end_exclusive:'2026-12-01',timezone:'Asia/Ho_Chi_Minh',completed_total:140000,completed_count:2,average_order:70000,cash_total:0,cash_count:0,pending_total:35000,pending_count:1,rejected_count:1,buckets:Array.from({length:count},(_,i)=>({period:String(i),label:String(i+1).padStart(2,'0'),completed_total:i===0?140000:0,completed_count:i===0?2:0,cash_total:0}))});
  }
  if(path==='/rest/v1/restaurant_tables')return json(tables.filter(t=>t.active));
  if(path==='/rest/v1/rpc/remove_restaurant_table'){const id=route.request().postDataJSON().target_table_id;tables.find(t=>t.id===id).active=false;return json(null);}
  if(path==='/rest/v1/rpc/add_restaurant_table'){
   const number=route.request().postDataJSON().new_table_number;
   if(!tables.some(t=>t.table_number===number))tables.push({id:'table-'+number,table_number:number,qr_token:number===3?tableToken:`77777777-7777-4777-8777-${String(number).padStart(12,'0')}`,active:true});return json(null);
  }
  if(path==='/rest/v1/rpc/get_table_context'){const b=route.request().postDataJSON();return json(b.menu_slug==='quan-test'&&b.table_token===tableToken?{number:3,label:'Bàn 03'}:null)}
  if(path==='/rest/v1/rpc/place_menu_order'){
   const b=route.request().postDataJSON();if(b.table_token)assert.equal(b.table_token,tableToken);let existing=orders.find(o=>o.request_token===b.request_token);
   if(!existing){existing={id:'33333333-3333-4333-8333-333333333333',request_token:b.request_token,order_code:b.table_token?'Q-TEST123':'Q-REMOTE',table_number:b.table_token?3:null,table_id:b.table_token?'table-3':null,items:b.order_items.map(i=>{const d=cloud.dishes.find(d=>d.id===i.id);return{id:d.id,name:d.name,price:d.price,quantity:i.quantity,subtotal:d.price*i.quantity}}),total:b.expected_total,note:b.order_note,status:'new',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};orders.push(existing)}
   if(dropOrderResponse&&b.table_token){dropOrderResponse=false;return route.abort()}
   return json({code:existing.order_code,total:existing.total,created_at:existing.created_at,status:existing.status,table_number:existing.table_number});
  }
  if(path==='/rest/v1/menu_orders'){
   if(route.request().method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':'*/'+orders.filter(o=>o.status==='new').length,'access-control-expose-headers':'content-range','access-control-allow-origin':'*'},body:''});
   const filter=new URL(route.request().url()).searchParams.get('status');return json(orders.filter(o=>filter.includes(o.status)));
  }
  if(path==='/rest/v1/rpc/pay_menu_order_cash'){
   const b=route.request().postDataJSON();const o=orders.find(o=>o.id===b.order_id);assert.ok(b.cash_amount>=o.total);o.payment_status='paid';o.payment_method='cash';o.cash_received=b.cash_amount;o.paid_at=new Date().toISOString();return json({payment_status:'paid',paid_at:o.paid_at,cash_received:o.cash_received,change:o.cash_received-o.total});
  }
  if(path==='/rest/v1/rpc/set_menu_order_status'){
   const b=route.request().postDataJSON();const o=orders.find(o=>o.id===b.order_id);assert.equal(o.status,b.expected_status);o.status=b.next_status;return json({status:o.status});
  }
  if(path==='/rest/v1/licenses')return json(active?[{id:'license-1',expires_at:'2099-01-01T00:00:00Z',revoked:false}]:[]);
  if(path==='/rest/v1/restaurants'){restaurantReads++;return json(cloud);}
  if(path==='/rest/v1/rpc/save_restaurant'){
   if(failSave)return json({message:'Dữ liệu đã thay đổi trên thiết bị khác. Hãy tải lại trang',code:'P0001'},400);
   const body=route.request().postDataJSON();assert.equal(body.expected_version,cloud.version);
   cloud={...cloud,name:body.restaurant_name,tagline:body.restaurant_tagline,address:body.restaurant_address,dishes:body.menu_dishes,version:cloud.version+1};return json(cloud);
  }
  if(path==='/rest/v1/rpc/get_public_menu')return json(active&&route.request().postDataJSON().menu_slug===cloud.slug?{name:cloud.name,tagline:cloud.tagline,address:cloud.address,dishes:cloud.dishes}:null);
  if(path==='/rest/v1/rpc/activate_license'){active=true;return json({message:'Đã kích hoạt bản quyền'})}
  throw Error('Unexpected request: '+path);
 };
 await context.route('https://qrmenu-test.supabase.co/**',mockRoute);
 // Configured environment without a session must show login, never an auth error or demo.
 await page.goto(online);await page.getByRole('heading',{name:'Đăng nhập',exact:true}).waitFor();assert.equal(await page.locator('.dish').count(),0);
 await page.clock.install();await page.locator('[data-auth-mode=signup]').click();
 await page.locator('[name=email]').fill(user.email);await page.locator('[name=password]').fill('Test-password-123!');await page.locator('[name=confirm_password]').fill('Mismatch-password!');await page.locator('#auth-submit').click();await page.getByText('Hai mật khẩu chưa khớp. Vui lòng nhập lại.').waitFor();
 await page.locator('[name=confirm_password]').fill('Test-password-123!');await page.locator('#auth-submit').click();await page.getByText(/Dịch vụ gửi email đang đạt giới hạn/).waitFor();assert.equal(await page.locator('#auth-submit').isDisabled(),true);
 await page.evaluate(()=>document.querySelector('#auth-form').requestSubmit());assert.equal(signupRequests,1);
 await page.reload();await page.locator('[data-auth-mode=signup]').click();assert.equal(await page.locator('#auth-submit').isDisabled(),true);await page.clock.fastForward(61000);
 await page.locator('[name=email]').fill(user.email);await page.locator('[name=password]').fill('Test-password-123!');await page.locator('[name=confirm_password]').fill('Test-password-123!');await page.locator('#auth-submit').click();await page.getByText(/Nếu email đủ điều kiện đăng ký/).waitFor();await page.clock.fastForward(61000);
 console.log('PASS auth limits: specific quota feedback, blocked duplicate submit, reload persistence, cooldown expiry');
 await page.locator('[data-auth-mode=signin]').click();await page.locator('[data-auth-mode=forgot]').click();await page.locator('[name=email]').fill(user.email);await page.locator('#auth-submit').click();await page.getByText(/Nếu email có tài khoản/).waitFor();
 await page.locator('[data-auth-mode=signin]').click();await page.locator('[name=email]').fill(user.email);await page.locator('[name=password]').fill('wrong-password');await page.locator('#auth-submit').click();await page.getByText('Email hoặc mật khẩu không đúng.').waitFor();
 await page.locator('[name=password]').fill('Test-password-123!');await page.locator('#auth-submit').click();await page.getByRole('heading',{name:'Điều hành gọi món',exact:true}).waitFor();assert.equal(await page.locator('#orders-content').count(),1);
 orders.push({id:'44444444-4444-4444-8444-444444444444',order_code:'Q-AUTO',items:[{id:'1',name:'Món online',quantity:1,price:42000,subtotal:42000}],total:42000,note:'Đơn mới tự cập nhật',status:'new',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});await page.clock.fastForward(11000);await page.locator('.order-code').filter({hasText:'Q-AUTO'}).waitFor();try{await page.waitForFunction(()=>document.querySelector('#notification')?.classList.contains('has-new-orders'),null,{timeout:15000})}catch(error){console.error('Bell diagnostic:',await page.locator('#notification').evaluate(el=>({title:el.title,label:el.getAttribute('aria-label'),html:el.innerHTML})));throw error}assert.equal(await page.locator('.notification-count').textContent(),'1');await page.locator('nav [data-nav=menu]').click();assert.equal(await page.locator('#notification').getAttribute('aria-label'),'1 đơn gọi món mới');await page.locator('#notification').click();await page.locator('.order-code').filter({hasText:'Q-AUTO'}).waitFor();assert.equal(await page.locator('[data-order-filter=new]').getAttribute('class'),'active');await page.getByRole('button',{name:'Nhận đơn',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#notification')?.classList.contains('has-new-orders'));orders.pop();await page.clock.fastForward(11000);await page.getByText('Chưa có đơn trong danh sách này.').waitFor();
 console.log('PASS dashboard: home shows live order queue and polls new orders without tab navigation');
 await page.locator('nav [data-nav=license]').click();await page.getByRole('heading',{name:'Tài khoản của bạn',exact:true}).waitFor();
 await page.locator('[data-auth-mode=password]').click();await page.locator('[name=password]').fill('Test-password-456!');await page.locator('[name=confirm_password]').fill('Test-password-456!');await page.locator('#auth-submit').click();await page.getByRole('heading',{name:'Tài khoản của bạn',exact:true}).waitFor();
 await page.goto(online+'/?reset=1');await page.getByRole('heading',{name:'Đặt mật khẩu',exact:true}).waitFor();await page.locator('[name=password]').fill('Test-password-456!');await page.locator('[name=confirm_password]').fill('Test-password-456!');await page.locator('#auth-submit').click();await page.getByRole('heading',{name:'Tài khoản của bạn',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.has('reset'),false);
 console.log('PASS auth (mock API): signup, mismatch validation, recovery request, invalid password, password login, set password, recovery form');
 await page.locator('nav [data-nav=menu]').click();await page.getByRole('heading',{name:'Món online',exact:true}).waitFor();assert.equal(await page.locator('.dish').count(),1);
 await page.locator('#add').click();await page.locator('[name=name]').fill('Nội dung đang nhập');await page.locator('[name=category]').fill('Món chính');
 const readsBeforeFocus=restaurantReads;
 await page.evaluate(async()=>{for(let i=0;i<3;i++){document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('visibilitychange'))}await new Promise(r=>setTimeout(r,300))});
 assert.equal(await page.locator('[name=name]').inputValue(),'Nội dung đang nhập');assert.equal(restaurantReads,readsBeforeFocus);assert.equal(await page.locator('.status-screen').count(),0);await page.locator('#cancel-modal').click();
 console.log('PASS session focus: same-account revalidation preserves unsaved form without reloading data');
 await page.locator('[data-edit]').click();await page.locator('[name=price]').fill('57000');await page.locator('#dish-photo-file').setInputFiles({name:'online.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByText(/Đã chọn online.png/).waitFor();await page.getByRole('button',{name:'Lưu món',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.dish-bottom strong')?.textContent==='57.000đ');assert.equal(cloud.dishes[0].price,57000);assert.match(cloud.dishes[0].image,/storage\/v1\/object\/public\/menu-images\/11111111-1111-4111-8111-111111111111\//);
 failSave=true;await page.locator('[data-toggle]').click();await page.getByText('Dữ liệu đã thay đổi trên thiết bị khác. Hãy tải lại trang',{exact:true}).waitFor();assert.equal(await page.locator('[data-toggle]').isChecked(),true);assert.equal(cloud.dishes[0].available,true);failSave=false;
 console.log('PASS online UI (mock API): signed-out login, server data, save, failed-write rollback');
 await page.locator('[data-nav=revenue]').click();await page.getByRole('heading',{name:'Thống kê doanh thu',exact:true}).waitFor();await page.locator('.report-kpis strong').first().waitFor();assert.equal(await page.locator('.report-kpis strong').first().textContent(),'140.000đ');assert.equal(await page.locator('.report-table tbody tr').count(),24);
 await page.locator('[name=kind]').selectOption('month');await page.locator('[name=period]').fill('2026-11');await page.locator('#report-form button').click();await page.waitForFunction(()=>document.querySelectorAll('.report-table tbody tr').length===30);
 await page.locator('[name=kind]').selectOption('year');await page.locator('[name=period]').fill('2026');await page.locator('#report-form button').click();await page.waitForFunction(()=>document.querySelectorAll('.report-table tbody tr').length===12);
 await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1280,height:720});console.log('PASS revenue UI: daily/monthly/yearly lookup, totals, detail buckets and mobile layout');
 await page.locator('[data-nav=qr]').click();assert.equal(await page.locator('#qr-url').inputValue(),online+'/?menu=quan-test');await page.waitForFunction(()=>document.querySelector('#qr-canvas')?.width>0);
 assert.equal(tables.length,0);assert.equal(await page.locator('#optional-table-qr').getAttribute('open'),null);
 await page.locator('#optional-table-qr summary').click();await page.getByText('Chưa có bàn phù hợp. Thêm bàn bằng ô bên trên.').waitFor();
 for(const number of ['1','2','3']){await page.locator('[name=table_number]').fill(number);await page.locator('#single-table-form button').click();await page.locator(`[data-saved-table="${number}"]`).waitFor();}
 assert.equal(tables.length,3);assert.equal(new Set(tables.map(t=>t.qr_token)).size,3);assert.equal(await page.locator('[data-saved-table]').count(),3);assert.equal(await page.locator('[data-saved-table="1"]').count(),1);assert.equal(await page.locator('[data-saved-table="2"]').count(),1);
 await page.locator('[name=table_number]').fill('2');await page.locator('#single-table-form button').click();await page.waitForFunction(()=>document.querySelector('[name=table_number]')?.value==='');assert.equal(tables.length,3);assert.equal(await page.locator('[data-saved-table]').count(),3);
 await page.locator('nav [data-nav=menu]').click();await page.locator('[data-nav=qr]').click();await page.locator('#optional-table-qr summary').click();await page.locator('[data-saved-table="3"]').waitFor();assert.equal(await page.locator('[data-saved-table]').count(),3);
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-saved-table="2"] [data-delete-table]').click();assert.equal(await page.locator('[data-saved-table="2"]').count(),1);
 page.once('dialog',dialog=>dialog.accept());await page.locator('[data-saved-table="2"] [data-delete-table]').click();await page.waitForFunction(()=>!document.querySelector('[data-saved-table="2"]'));assert.equal(await page.locator('[data-saved-table="1"]').count(),1);assert.equal(await page.locator('[data-saved-table="3"]').count(),1);
 console.log('PASS remove table: confirmation cancel preserves table; delete removes only chosen table');
 const labelsPromise=page.waitForEvent('popup');await page.locator('[data-saved-table="3"] [data-print-table]').click();const labels=await labelsPromise;await labels.getByRole('heading',{name:'BÀN 03',exact:true}).waitFor();assert.equal(await labels.locator('.label').count(),1);await labels.close();
 console.log('PASS saved tables: add 1/2/3 cumulatively, duplicate stays unique, reopening restores list, per-table print');
 const guestContext=await browser.newContext();await guestContext.route('https://qrmenu-test.supabase.co/**',mockRoute);const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));await guest.goto(online+'/?menu=quan-test');await guest.getByText('Đặt món từ xa · Không số bàn',{exact:true}).waitFor();assert.equal(await guest.locator('[data-cart-change][data-delta="1"]').isDisabled(),false);await guest.locator('[data-cart-change][data-delta="1"]').click();assert.equal(await guest.locator('#send-order').isDisabled(),false);await guest.locator('#send-order').click();await guest.getByText(/Đã gửi yêu cầu · Q-REMOTE/).waitFor();assert.equal(orders[0].table_number,null);assert.equal(orders[0].items[0].quantity,1);orders.length=0;console.log('PASS shared QR: remote order submitted without table');await guest.goto(online+'/?menu=quan-test&table='+tableToken);await guest.getByRole('heading',{name:'Món online',exact:true}).waitFor();assert.equal(await guest.locator('[data-edit]').count(),0);assert.equal(await guest.locator('.dish-bottom strong').textContent(),'57.000đ');await guest.setViewportSize({width:375,height:812});assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await guest.evaluate(()=>localStorage.setItem('qrmenu-cart-quan-test-55555555-5555-4555-8555-555555555555',JSON.stringify({quantities:{'1':1},note:'Lựa chọn cũ'})));await guest.reload();await guest.getByRole('heading',{name:'Món online',exact:true}).waitFor();
 const plus=guest.locator('[data-cart-change="1"][data-delta="1"]'),minus=guest.locator('[data-cart-change="1"][data-delta="-1"]');
 assert.equal(await minus.isDisabled(),true);assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'0');
 await plus.click();await plus.click();await plus.click();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'3');
 await guest.locator('#customer-cart [data-delta="-1"]').click();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'2');
 await minus.click();await minus.click();assert.equal(await guest.locator('#customer-cart .cart-line').count(),0);assert.equal(await minus.isDisabled(),true);
 await plus.click();await plus.click();await guest.reload();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'0');await plus.click();await guest.locator('#clear-cart').click();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'0');assert.equal(await guest.locator('#customer-cart .cart-line').count(),0);await plus.click();await plus.click();await guest.locator('#order-note').fill('Không lấy đá');await guest.locator('#send-order').click();await guest.getByText(/Chưa xác nhận được kết quả. Thử lại cùng yêu cầu/).waitFor();assert.equal(orders.length,1);assert.equal(orders[0].items[0].quantity,2);assert.equal(orders[0].total,114000);
 await guest.reload();await guest.getByText(/Chưa xác nhận được kết quả. Thử lại cùng yêu cầu/).waitFor();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'2');await guest.locator('#send-order').click();await guest.getByText(/Đã gửi yêu cầu · Q-TEST123/).waitFor();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'0');assert.equal(orders.length,1);await guest.reload();await guest.getByText(/Đã gửi yêu cầu · Q-TEST123/).waitFor();
 await page.locator('nav [data-nav=revenue]').click();await page.locator('.report-kpis').waitFor();await page.clock.fastForward(11000);await page.waitForFunction(()=>document.querySelector('#notification')?.classList.contains('has-new-orders'));assert.equal(await page.locator('.notification-count').textContent(),'1');console.log('PASS bell: yellow/count updates on statistics, navigation preserves count, click filters new orders, acceptance clears alert');
 await page.locator('nav [data-nav=overview]').click();assert.equal(await page.locator('.welcome-banner').count(),0);await page.locator('.order-code').filter({hasText:'Q-TEST123'}).waitFor();await page.locator('.order-table-badge').filter({hasText:'Bàn 03'}).waitFor();await page.locator('#order-table-filter').selectOption('0');await page.getByText('Chưa có đơn trong danh sách này.').waitFor();await page.locator('#order-table-filter').selectOption('3');await page.locator('.order-code').filter({hasText:'Q-TEST123'}).waitFor();await page.locator('#order-table-filter').selectOption('all');assert.equal(await page.locator('.order-kpi').count(),4);await page.locator('#order-search').fill('không-khớp');await page.getByText('Chưa có đơn trong danh sách này.').waitFor();await page.locator('#order-search').fill('Q-TEST123');await page.locator('.order-code').filter({hasText:'Q-TEST123'}).waitFor();await page.locator('#order-search').fill('');await page.screenshot({path:'/tmp/qrmenu-dashboard-desktop.png',fullPage:true});await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/qrmenu-dashboard-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:720});assert.equal(await page.locator('.welcome-banner').count(),0);assert.equal(await page.locator('[data-print-order]').count(),0);await page.getByRole('button',{name:'Nhận đơn',exact:true}).click();assert.equal(await page.locator('[data-print-order]').count(),0);await page.getByRole('button',{name:'Bắt đầu chuẩn bị',exact:true}).click();assert.equal(await page.locator('[data-pay-order]').count(),0);
 const printed=page.waitForEvent('popup');await page.getByRole('button',{name:'In đơn',exact:true}).click();const printPage=await printed;await printPage.getByRole('heading',{name:'PHIẾU GỌI MÓN',exact:true}).waitFor();assert.ok((await printPage.locator('body').textContent()).includes('114.000đ'));assert.ok((await printPage.locator('body').textContent()).includes('BÀN 03'));await printPage.close();
 await page.getByRole('button',{name:'Đã phục vụ',exact:true}).click();await page.getByText('Chưa có đơn trong danh sách này.').waitFor();await page.locator('#history-orders').click();await page.locator('.order-code').filter({hasText:'Q-TEST123'}).waitFor();await page.locator('.order-table-badge').filter({hasText:'Bàn 03'}).waitFor();await page.locator('#order-table-filter').selectOption('0');await page.getByText('Chưa có đơn trong danh sách này.').waitFor();await page.locator('#order-table-filter').selectOption('3');await page.locator('.order-code').filter({hasText:'Q-TEST123'}).waitFor();await page.locator('#order-table-filter').selectOption('all');assert.equal(orders[0].status,'served');
 console.log('PASS orders: public cart, quantities, note, ambiguous retry deduplication, persisted receipt, owner queue, status processing/history');
 await guest.goto(online+'/?menu=unknown');await guest.getByRole('heading',{name:'Menu chưa sẵn sàng'}).waitFor();assert.equal(await guest.locator('.dish').count(),0);
 active=false;await page.goto(online);await page.locator('nav [data-nav=menu]').click();await page.locator('#add').click();await page.getByRole('heading',{name:'Tài khoản của bạn',exact:true}).waitFor();assert.equal(await page.locator('#dish-form').count(),0);
 await page.locator('[name=key]').fill('QRM-test-key-0123456789');await page.locator('#license-form').getByRole('button',{name:'Kích hoạt bản quyền',exact:true}).click();await page.getByText(/Bản quyền đang hoạt động · Hạn/).waitFor();
 await page.setViewportSize({width:375,height:812});await page.locator('nav [data-nav=menu]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 active=false;await guest.goto(online+'/?menu=quan-test&table='+tableToken);await guest.getByRole('heading',{name:'Menu chưa sẵn sàng'}).waitFor();
 offline=true;await page.reload();await page.getByRole('heading',{name:'Không tải được dữ liệu'}).waitFor();assert.equal(await page.locator('.dish').count(),0);
 console.log('PASS online UI (mock API): stable QR, public menu, mobile, missing/revoked menu, license gate/activation, network failure without demo fallback');
 assert.deepEqual(errors,[]);console.log('PASS: no uncaught browser errors');
} finally {await browser?.close();for(const child of children)child.kill('SIGTERM')}
