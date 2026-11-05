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
const errors=[];const orders=[];let dropOrderResponse=true;
try {
 const demo=await start(5186,false);const online=await start(5187,true);
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(demo);await page.locator('#add').click();await page.locator('[name=name]').fill('Món kiểm thử');await page.locator('[name=category]').fill('Món chính');const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=20;c.height=20;c.getContext('2d').fillRect(0,0,20,20);return c.toDataURL('image/png').split(',')[1]});await page.locator('#dish-photo-file').setInputFiles({name:'mon-an.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByText(/Đã chọn mon-an.png/).waitFor();await page.getByRole('button',{name:'Lưu món',exact:true}).click();await page.locator('.dish').filter({hasText:'Món kiểm thử'}).waitFor();await page.reload();await page.locator('#search').fill('Món kiểm thử');assert.equal(await page.locator('.dish').count(),1);assert.match(await page.locator('.dish-photo img').getAttribute('src'),/^data:image\/webp/);await page.locator('[data-toggle]').uncheck();await page.locator('.sold-out').waitFor();
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
  if(path==='/rest/v1/rpc/place_menu_order'){
   const b=route.request().postDataJSON();let existing=orders.find(o=>o.request_token===b.request_token);
   if(!existing){existing={id:'33333333-3333-4333-8333-333333333333',request_token:b.request_token,order_code:'Q-TEST123',items:b.order_items.map(i=>{const d=cloud.dishes.find(d=>d.id===i.id);return{id:d.id,name:d.name,price:d.price,quantity:i.quantity,subtotal:d.price*i.quantity}}),total:b.expected_total,note:b.order_note,status:'new',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};orders.push(existing)}
   if(dropOrderResponse){dropOrderResponse=false;return route.abort()}
   return json({code:existing.order_code,total:existing.total,created_at:existing.created_at,status:existing.status});
  }
  if(path==='/rest/v1/menu_orders'){
   const filter=new URL(route.request().url()).searchParams.get('status');return json(orders.filter(o=>filter.includes(o.status)));
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
 await page.locator('[name=password]').fill('Test-password-123!');await page.locator('#auth-submit').click();await page.getByRole('heading',{name:'Tài khoản của bạn',exact:true}).waitFor();
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
 await page.locator('[data-nav=qr]').click();assert.equal(await page.locator('#qr-url').inputValue(),online+'/?menu=quan-test');await page.waitForFunction(()=>document.querySelector('#qr-canvas')?.width>0);
 const guestContext=await browser.newContext();await guestContext.route('https://qrmenu-test.supabase.co/**',mockRoute);const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));await guest.goto(online+'/?menu=quan-test');await guest.getByRole('heading',{name:'Món online',exact:true}).waitFor();assert.equal(await guest.locator('[data-edit]').count(),0);assert.equal(await guest.locator('.dish-bottom strong').textContent(),'57.000đ');await guest.setViewportSize({width:375,height:812});assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await guest.evaluate(()=>localStorage.setItem('qrmenu-cart-quan-test',JSON.stringify({quantities:{'1':1},note:'Lựa chọn cũ'})));await guest.reload();await guest.getByRole('heading',{name:'Món online',exact:true}).waitFor();
 const plus=guest.locator('[data-cart-change="1"][data-delta="1"]'),minus=guest.locator('[data-cart-change="1"][data-delta="-1"]');
 assert.equal(await minus.isDisabled(),true);assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'0');
 await plus.click();await plus.click();await plus.click();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'3');
 await guest.locator('#customer-cart [data-delta="-1"]').click();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'2');
 await minus.click();await minus.click();assert.equal(await guest.locator('#customer-cart .cart-line').count(),0);assert.equal(await minus.isDisabled(),true);
 await plus.click();await plus.click();await guest.reload();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'0');await plus.click();await guest.locator('#clear-cart').click();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'0');assert.equal(await guest.locator('#customer-cart .cart-line').count(),0);await plus.click();await plus.click();await guest.locator('#order-note').fill('Không lấy đá');await guest.locator('#send-order').click();await guest.getByText(/Chưa xác nhận được kết quả. Thử lại cùng yêu cầu/).waitFor();assert.equal(orders.length,1);assert.equal(orders[0].items[0].quantity,2);assert.equal(orders[0].total,114000);
 await guest.reload();await guest.getByText(/Chưa xác nhận được kết quả. Thử lại cùng yêu cầu/).waitFor();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'2');await guest.locator('#send-order').click();await guest.getByText(/Đã gửi yêu cầu · Q-TEST123/).waitFor();assert.equal(await guest.locator('[data-cart-count="1"]').textContent(),'0');assert.equal(orders.length,1);await guest.reload();await guest.getByText(/Đã gửi yêu cầu · Q-TEST123/).waitFor();
 await page.locator('nav [data-nav=menu]').click();assert.equal(await page.locator('.welcome-banner').count(),0);await page.locator('.workspace-tabs [data-nav=orders]').click();await page.getByRole('heading',{name:'Q-TEST123',exact:true}).waitFor();assert.equal(await page.locator('.workspace-tabs [data-nav=orders]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.welcome-banner').count(),0);await page.getByRole('button',{name:'Nhận đơn',exact:true}).click();await page.getByRole('button',{name:'Bắt đầu chuẩn bị',exact:true}).click();await page.getByRole('button',{name:'Đã phục vụ',exact:true}).click();await page.getByText('Chưa có đơn trong danh sách này.').waitFor();await page.locator('#history-orders').click();await page.getByRole('heading',{name:'Q-TEST123',exact:true}).waitFor();assert.equal(orders[0].status,'served');
 console.log('PASS orders: public cart, quantities, note, ambiguous retry deduplication, persisted receipt, owner queue, status processing/history');
 await guest.goto(online+'/?menu=unknown');await guest.getByRole('heading',{name:'Menu chưa sẵn sàng'}).waitFor();assert.equal(await guest.locator('.dish').count(),0);
 active=false;await page.goto(online);await page.locator('nav [data-nav=menu]').click();await page.locator('#add').click();await page.getByRole('heading',{name:'Tài khoản của bạn',exact:true}).waitFor();assert.equal(await page.locator('#dish-form').count(),0);
 await page.locator('[name=key]').fill('QRM-test-key-0123456789');await page.locator('#license-form').getByRole('button',{name:'Kích hoạt bản quyền',exact:true}).click();await page.getByText(/Bản quyền đang hoạt động · Hạn/).waitFor();
 await page.setViewportSize({width:375,height:812});await page.locator('nav [data-nav=menu]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 active=false;await guest.goto(online+'/?menu=quan-test');await guest.getByRole('heading',{name:'Menu chưa sẵn sàng'}).waitFor();
 offline=true;await page.reload();await page.getByRole('heading',{name:'Không tải được dữ liệu'}).waitFor();assert.equal(await page.locator('.dish').count(),0);
 console.log('PASS online UI (mock API): stable QR, public menu, mobile, missing/revoked menu, license gate/activation, network failure without demo fallback');
 assert.deepEqual(errors,[]);console.log('PASS: no uncaught browser errors');
} finally {await browser?.close();for(const child of children)child.kill('SIGTERM')}
