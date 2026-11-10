import { createIcons, ScanLine, ChevronsUpDown, LayoutDashboard, Utensils, QrCode, Store, Sparkles, ArrowUpRight, CircleHelp, Settings2, ChevronRight, Bell, ExternalLink, Sprout, ArrowRight, Heart, CircleCheck, Layers2, Plus, Search, LayoutGrid, List, Lightbulb, CheckCheck, Download, Copy, Check, KeyRound, Coffee, X, Pencil, ShoppingBag, House, ChartNoAxesColumnIncreasing, UserRound, ClipboardList } from 'lucide';
const icons = { ScanLine, ChevronsUpDown, LayoutDashboard, Utensils, QrCode, Store, Sparkles, ArrowUpRight, CircleHelp, Settings2, ChevronRight, Bell, ExternalLink, Sprout, ArrowRight, Heart, CircleCheck, Layers2, Plus, Search, LayoutGrid, List, Lightbulb, CheckCheck, Download, Copy, Check, KeyRound, Coffee, X, Pencil, ShoppingBag, House, ChartNoAxesColumnIncreasing, UserRound, ClipboardList };
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import './style.css';
import './brand.css';
import { mountOverview } from './overview.js';
let stopOverview;
import { watchNewOrders } from './notifications.js';
let alerts=null,alertsKey='',alertState={count:0,error:false},showNewOrders=false;
import { mountRevenue } from './revenue.js';
let stopRevenue;
import { mountTables } from './tables.js';
let publicTable=null,stopTables;
import { createOrderCart, mountOrderManager } from './orders.js';
let orderCart, stopOrders;
import { authFailure, createAuthCooldowns } from './auth-feedback.js';
const authCooldowns=createAuthCooldowns({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)});
let authCooldownTimer;
import { sessionObserver, withLoadTimeout } from './session.js';
import { categoryNames, canonicalCategory } from './categories.js';
import { prepareImage, imageDataURL } from './images.js';
import { createBackend, hasActiveLicense } from './backend.js';

const images = {
 placeholder:'/images/menu.svg',
 coffee:'/images/coffee.svg',
 latte:'/images/latte.svg',
 matcha:'/images/matcha.svg',
 tea:'/images/tea.svg',
 cake:'/images/cake.svg',
 croissant:'/images/croissant.svg'
};
const seed = [
{id:'1',name:'Cà phê sữa đá',category:'Cà phê',price:35000,description:'Cà phê phin đậm đà, sữa đặc béo ngậy.',image:images.coffee,available:true,best:true},
{id:'2',name:'Latte kem béo',category:'Cà phê',price:55000,description:'Espresso hòa quyện cùng sữa tươi mịn màng.',image:images.latte,available:true,best:false},
{id:'3',name:'Matcha latte',category:'Matcha',price:55000,description:'Matcha Nhật Bản thanh dịu cùng sữa tươi.',image:images.matcha,available:true,best:true},
{id:'4',name:'Trà đào cam sả',category:'Trà trái cây',price:45000,description:'Trà thơm, đào mọng và chút sả tươi mát.',image:images.tea,available:true,best:false},
{id:'5',name:'Cheesecake dâu',category:'Bánh ngọt',price:65000,description:'Bánh phô mai mềm mịn, mứt dâu chua ngọt.',image:images.cake,available:true,best:false},
{id:'6',name:'Croissant bơ Pháp',category:'Bánh ngọt',price:40000,description:'Vỏ bánh ngàn lớp giòn thơm hương bơ.',image:images.croissant,available:false,best:false}
];
let dishes;try{dishes=JSON.parse(localStorage.getItem('qrmenu-dishes'))||seed}catch{dishes=seed}
let restaurant;try{restaurant=JSON.parse(localStorage.getItem('qrmenu-restaurant'))||{name:'Cửa hàng mẫu',tagline:'Khám phá món ngon và lựa chọn yêu thích.',address:'24 Nguyễn Thị Minh Khai, Quận 1, TP. HCM'}}catch{restaurant={name:'Cửa hàng mẫu',tagline:'Khám phá món ngon và lựa chọn yêu thích.',address:''}}
let supabase = null, configurationError = '';
const configuredURL = import.meta.env.VITE_SUPABASE_URL;
const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (configuredURL || configuredKey) {
  try {
    if (!configuredURL || !configuredKey) throw new Error('Thiếu Project URL hoặc publishable/anon key.');
    supabase = createClient(configuredURL, configuredKey);
  } catch { configurationError = 'Cấu hình Supabase chưa hợp lệ. Kiểm tra URL và key công khai rồi khởi động lại ứng dụng.'; }
}
const backend = supabase ? createBackend(supabase) : null;
let authMode='signin', passwordMode=new URLSearchParams(location.search).has('reset');
let account = null, cloudRestaurant = null, licenses = [], saving = false, bootId = 0;
const publicTableToken=new URLSearchParams(location.search).get('table');
const publicSlug = new URLSearchParams(location.search).get('menu');
let category='',search='',view=publicSlug!==null?'public':'overview',layout='grid';
function categories(publicOnly=false){return ['',...categoryNames(dishes,publicOnly?[]:restaurant.categories||[])]}
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('vi-VN').format(n)+'đ';
const icon=(name,cls='')=>`<i data-lucide="${name}" class="${cls}"></i>`;
function canWrite() { return !backend || (account && hasActiveLicense(licenses)); }
async function persist(nextRestaurant = restaurant, nextDishes = dishes) {
  if (saving) { toast('Đang lưu thay đổi trước. Vui lòng chờ một chút.'); return false; }
  saving = true;
  nextRestaurant = {...nextRestaurant,categories:categoryNames(nextDishes,restaurant.categories||[])};
  try {
    if (backend) {
      if (!canWrite()) throw new Error('Vui lòng đăng nhập và kích hoạt bản quyền trước khi chỉnh sửa.');
      cloudRestaurant = await backend.save(nextRestaurant, nextDishes, cloudRestaurant);
      restaurant = { name: cloudRestaurant.name, tagline: cloudRestaurant.tagline, address: cloudRestaurant.address, categories: cloudRestaurant.categories||[] };
      dishes = cloudRestaurant.dishes;
    } else {
      localStorage.setItem('qrmenu-state', JSON.stringify({ restaurant: nextRestaurant, dishes: nextDishes }));
      restaurant = nextRestaurant; dishes = nextDishes;
    }
    return true;
  } catch (error) {
    toast(error.message || 'Không lưu được dữ liệu. Hãy kiểm tra kết nối và thử lại.');
    return false;
  } finally { saving = false; }
}
function accessNotice() {
  if (!backend || (account && hasActiveLicense(licenses) && cloudRestaurant)) return '';
  const text = !account ? 'Đăng nhập để mở không gian quản lý của bạn.' : !hasActiveLicense(licenses) ? 'Kích hoạt bản quyền để tạo hoặc cập nhật thực đơn.' : !cloudRestaurant ? 'Quán chưa xuất bản. Vào Thông tin quán và lưu để tạo đường dẫn QR riêng.' : 'Dữ liệu online · Mọi thay đổi thành công được lưu lên Supabase.';
  return `<div class="cloud-notice"><span>${escape(text)}</span><button class="button secondary" data-nav="${account && hasActiveLicense(licenses) ? 'settings' : 'license'}">${account && hasActiveLicense(licenses) ? 'Thông tin quán' : 'Tài khoản & bản quyền'}</button></div>`;
}
function toast(msg){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.append(el);setTimeout(()=>el.remove(),3500)}
function card(d,publicMode=false){return `<article class="dish ${publicMode?'customer-dish':''} ${!d.available?'sold-out':''}"><div class="dish-photo"><img src="${escape(d.image)}" alt="${escape(d.name)}" loading="lazy">${d.best?'<span class="best">✦ Bán chạy</span>':''}${!d.available?'<span class="out-label">Tạm hết món</span>':''}${!publicMode?`<button class="edit-photo" data-edit="${escape(d.id)}" aria-label="Sửa ${escape(d.name)}">${icon('pencil')}</button>`:''}</div><div class="dish-body"><div class="dish-category">${escape(d.category)}</div><h3>${escape(d.name)}</h3><p>${escape(d.description)}</p><div class="dish-bottom"><strong>${money(d.price)}</strong>${publicMode?`<div class="quantity dish-quantity" data-dish-quantity="${escape(d.id)}"><small>SL:</small><button type="button" data-cart-change="${escape(d.id)}" data-delta="-1" aria-label="Giảm số lượng ${escape(d.name)}" disabled>−</button><span data-cart-count="${escape(d.id)}" aria-live="polite">0</span><button type="button" data-cart-change="${escape(d.id)}" data-delta="1" aria-label="Tăng số lượng ${escape(d.name)}" ${!d.available?'disabled':''}>+</button></div>`:`<label class="availability"><span>${d.available?'Đang bán':'Tạm hết'}</span><input type="checkbox" data-toggle="${escape(d.id)}" ${d.available?'checked':''}><span class="switch"></span></label>`}</div></div></article>`}
function filtered(){return dishes.filter(d=>(category===''||d.category===category)&&d.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))}
function paintOrderAlerts(){
 const bell=$('#notification');if(!bell)return;
 const count=alertState.count;
 bell.classList.toggle('has-new-orders',count>0);
 bell.setAttribute('aria-label',count>0?`${count} đơn gọi món mới`:'Không có đơn gọi món mới');
 bell.title=alertState.error?'Chưa cập nhật được thông báo. Kiểm tra kết nối.':count>0?`Có ${count} đơn mới chờ tiếp nhận`:'Không có đơn mới';
 bell.querySelector('.notification-count').textContent=count>99?'99+':String(count);
 bell.querySelector('.notification-count').hidden=count===0;
}
function haltOrderAlerts(){alerts?.stop();alerts=null;alertsKey='';alertState={count:0,error:false}}
function syncOrderAlerts(){
 if(!backend||!account||!cloudRestaurant||view==='public'){haltOrderAlerts();paintOrderAlerts();return}
 const key=account.id+':'+cloudRestaurant.id;
 if(key!==alertsKey){haltOrderAlerts();alertsKey=key;alerts=watchNewOrders({getCount:()=>backend.newOrderCount(cloudRestaurant.id),onChange:state=>{alertState=state;paintOrderAlerts()}})}
 paintOrderAlerts();
}
function render(){stopOverview?.();stopOverview=null;stopRevenue?.();stopRevenue=null;stopTables?.();stopTables=null;stopOrders?.();stopOrders=null;clearInterval(authCooldownTimer);if(view==='public'){renderPublic();return}$('#app').innerHTML=`<aside class="sidebar"><a class="brand" href="/">${icon('scan-line')}<span>qrmenu<span class="brand-dot">.</span></span></a><div class="workspace"><div class="shop-avatar">M<span>•</span></div><div><strong>${escape(restaurant.name)}</strong><small>Không gian của bạn</small></div>${icon('chevrons-up-down')}</div><div class="nav-label">KHÔNG GIAN QUẢN LÝ</div><nav>${[['overview','house','Tổng quan'],['orders','clipboard-list','Đơn gọi món'],['menu','utensils','Thực đơn'],['revenue','chart-no-axes-column-increasing','Thống kê'],['qr','qr-code','Mã QR'],['settings','store','Thông tin quán'],['license','user-round','Tài khoản & bản quyền']].map(([id,ic,label])=>`<button data-nav="${id}" class="nav-item ${view===id?'active':''}">${icon(ic)}${label}${id==='menu'?`<span class="nav-count">${dishes.length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="plan"><div>${icon('sparkles')}<strong>Bản quyền sử dụng</strong></div><p>${backend ? (hasActiveLicense(licenses) ? "Bản quyền đang hoạt động · Online" : "Cần kích hoạt bản quyền") : "Bản demo · Lưu trên trình duyệt"}</p><button data-nav="license">Kích hoạt bản quyền ${icon('arrow-up-right')}</button></div><button class="help" id="help">${icon('circle-help')}Trung tâm trợ giúp${icon('arrow-up-right')}</button><div class="profile"><div class="profile-avatar">AN</div><div><strong>Chủ cửa hàng</strong><small>Quản trị viên</small></div>${icon('settings-2')}</div></div></aside><div class="main-shell"><header class="topbar"><div class="breadcrumb">${icon('house')} ${icon('chevron-right')}<strong>${({revenue:'Thống kê',orders:'Đơn gọi món',menu:'Thực đơn',overview:'Tổng quan',qr:'Mã QR',settings:'Thông tin quán',license:'Bản quyền'})[view]}</strong></div><div class="top-actions"><span class="online-dot"></span><span>Không gian quản lý</span><span class="header-divider"></span><button class="icon-button" id="notification" aria-label="Thông báo đơn gọi món">${icon('bell')}<span class="notification-count" hidden aria-hidden="true"></span></button><div class="small-avatar">AN</div></div></header><main>${accessNotice()}${view==='revenue'?revenueHTML():view==='orders'?ordersHTML():view==='menu'?menuHTML():view==='overview'?overviewHTML():view==='qr'?qrHTML():view==='settings'?settingsHTML():licenseHTML()}</main><footer><span>© ${new Date().getFullYear()} QRMenu. Quản lý thực đơn và gọi món.</span><span>Quản lý cửa hàng ${icon('heart')}</span></footer></div><div id="modal-root"></div>`;bind();createIcons({icons});syncOrderAlerts();if(view==='qr'){drawQR();if(backend&&account&&cloudRestaurant)stopTables=mountTables({backend,restaurant,restaurantId:cloudRestaurant.id,slug:cloudRestaurant.slug,escape,toast})};if(view==='revenue'&&backend&&account&&cloudRestaurant)stopRevenue=mountRevenue({backend,escape,money});if(view==='overview'&&backend&&account&&cloudRestaurant)stopOverview=mountOverview({backend,restaurantId:cloudRestaurant.id,escape,money,navigate:next=>{view=next;render()}});if(view==='orders'&&backend&&account&&cloudRestaurant)stopOrders=mountOrderManager({backend,restaurantId:cloudRestaurant.id,restaurant,escape,money,toast,initialFilter:showNewOrders?'new':'all'});showNewOrders=false}
function menuHTML(){return `<div class="page-heading"><div><div class="eyebrow">THỰC ĐƠN CỦA BẠN</div><h1>Quản lý thực đơn</h1><p>Thêm món, cập nhật giá, danh mục và trạng thái phục vụ.</p></div><button class="button secondary" id="preview">${icon('external-link')}Xem menu khách</button></div><section class="stats">${[['utensils','Tổng số món',dishes.length,'Trong thực đơn'],['circle-check','Đang phục vụ',dishes.filter(d=>d.available).length,'Sẵn sàng cho khách'],['layers-2','Danh mục',new Set(dishes.map(d=>d.category)).size,'Do bạn xây dựng']].map(([ic,l,n,h])=>`<div class="stat"><div class="stat-icon">${icon(ic)}</div><div><span>${l}</span><strong>${n}<small>${h}</small></strong></div></div>`).join('')}</section><section class="menu-section"><div class="section-heading"><div><h2>Thực đơn của quán <span>${dishes.length} món</span></h2><p>Danh sách món và trạng thái phục vụ.</p></div><button class="button primary" id="add">${icon('plus')}Thêm món mới</button></div><div class="menu-toolbar"><div class="tabs">${categories().map(c=>`<button data-category="${escape(c)}" class="${category===c?'selected':''}">${escape(c||'Tất cả')}${c===''?` <span>${dishes.length}</span>`:''}</button>`).join('')}</div><div class="filter-tools"><label class="search">${icon('search')}<input id="search" placeholder="Tìm món yêu thích..." value="${escape(search)}" aria-label="Tìm món"></label><div class="view-toggle"><button id="grid" class="${layout==='grid'?'chosen':''}" aria-label="Dạng lưới">${icon('layout-grid')}</button><button id="list" class="${layout==='list'?'chosen':''}" aria-label="Dạng danh sách">${icon('list')}</button></div></div></div><div id="dish-grid" class="dish-grid ${layout==='list'?'list-view':''}">${filtered().map(d=>card(d)).join('')||'<div class="empty">Không tìm thấy món. Thử từ khóa khác nhé.</div>'}</div><div class="menu-tip">${icon('lightbulb')}<span>Mẹo nhỏ: Bật hoặc tắt trạng thái để khách biết món nào đang sẵn sàng phục vụ.</span><span>Thay đổi được lưu tự động ${icon('check-check')}</span></div></section>`}
function revenueHTML(){return `<div class="page-heading"><div><div class="eyebrow">BÁO CÁO CỬA HÀNG</div><h1>Thống kê doanh thu</h1><p>Tra cứu theo ngày, tháng, năm trên toàn bộ dữ liệu của quán.</p></div></div>${backend&&account&&cloudRestaurant?'<div id="revenue-root"></div>':'<div class="panel">Đăng nhập và lưu thông tin quán để xem thống kê online.</div>'}`}
function overviewHTML(){return `<div class="page-heading"><div><div class="eyebrow">QUẢN LÝ CỬA HÀNG · ${escape(restaurant.name)}</div><h1>Tổng quan</h1><p>Theo dõi hoạt động của quán hôm nay</p></div></div>${backend&&account&&cloudRestaurant?`<div id="overview-content">${[['orders','Đơn gọi món','Theo dõi đơn đang chờ tiếp nhận và chuẩn bị.','Xem đơn chi tiết'],['menu','Thực đơn','Số món và trạng thái phục vụ của cửa hàng.','Quản lý thực đơn'],['revenue','Thống kê hôm nay','Tóm tắt giá trị đơn hoàn tất trong ngày.','Xem thống kê']].map(([id,title,description,action])=>`<section class="overview-module" data-overview-module="${id}"><div class="overview-module-head"><div><h2>${icon(({orders:'clipboard-list',menu:'utensils',revenue:'chart-no-axes-column-increasing'})[id])}${title}</h2><p>${description}</p></div><button class="button secondary" data-overview-view="${id}">${action} ${icon('arrow-right')}</button></div><div id="overview-${id}"><p class="overview-empty">Đang tải…</p></div></section>`).join('')}</div>`:demoOverviewHTML()}`}
function demoOverviewHTML(){return `<div id="overview-demo" class="overview-layout"><section class="overview-module" data-overview-module="orders"><div class="overview-module-head"><h2>${icon('clipboard-list')}Đơn gọi món</h2><button class="button secondary" data-nav="orders">Xem chi tiết ${icon('arrow-right')}</button></div><div class="overview-order-counts">${['Đang xử lý','Đơn mới','Đã nhận','Đang chuẩn bị'].map(label=>`<div><span>${label}</span><strong>0</strong></div>`).join('')}</div><div class="overview-table-head"><span>Đơn</span><span>Bàn</span><span>Món đã đặt</span><span>Tổng tiền</span><span>Trạng thái</span></div><p class="overview-empty">Chưa có đơn gọi món. Kết nối Supabase để nhận đơn từ khách.</p></section><section class="overview-module" data-overview-module="menu"><div class="overview-module-head"><h2>${icon('utensils')}Thực đơn</h2><button class="button secondary" data-nav="menu">Xem chi tiết ${icon('arrow-right')}</button></div><div class="overview-menu-counts"><span><strong>${dishes.length} món</strong>Tổng số món</span><span><strong>${dishes.filter(d=>d.available).length} món</strong>Đang bán</span></div><div class="overview-menu-photos">${dishes.slice(0,3).map(d=>`<img src="${escape(d.image)}" alt="${escape(d.name)}">`).join('')}</div></section><section class="overview-module" data-overview-module="revenue"><div class="overview-module-head"><h2>${icon('chart-no-axes-column-increasing')}Thống kê hôm nay</h2><button class="button secondary" data-nav="revenue">Xem chi tiết ${icon('arrow-right')}</button></div><div class="overview-revenue-metrics"><div><span>Giá trị đơn hoàn tất</span><strong>—</strong></div><div><span>Đơn hoàn tất</span><strong>—</strong></div></div><p class="overview-footnote">Chế độ demo · Chưa có dữ liệu thống kê online.</p></section></div>`}
function orderWorkspace(){return backend&&account&&cloudRestaurant?'<div id="orders-content"></div>':'<div class="panel"><h2>Chưa có không gian nhận đơn</h2><p>Đăng nhập, kích hoạt bản quyền và lưu thông tin quán để nhận đơn online.</p><button class="button primary" data-nav="settings">Thông tin quán</button></div>'}
function menuURL(){const u=new URL(location.href);u.search='';u.searchParams.set('menu', backend ? cloudRestaurant?.slug || '' : '1');u.hash='';return u.href}
function qrHTML(){return `<div class="page-heading"><div><div class="eyebrow">KẾT NỐI VỚI KHÁCH HÀNG</div><h1>Một lần quét, cả thực đơn.</h1><p>QR chung để xem menu và đặt món từ xa. Có thể thêm QR bàn khi cần.</p></div></div><section class="qr-panel panel"><div class="qr-paper"><div class="eyebrow">CHÀO BẠN ĐẾN VỚI</div><h2>${escape(restaurant.name)}</h2><canvas id="qr-canvas"></canvas><h3>QR chung · Đặt món từ xa</h3><p>Chọn một món ngon, tận hưởng một chút an yên.</p></div><div><h2>Menu luôn trong tầm tay</h2><p>Mã QR dẫn đến menu dành cho khách hàng.</p><label class="field">Đường dẫn menu<input id="qr-url" readonly value="${escape(menuURL())}"></label><p class="muted">${backend ? (cloudRestaurant ? 'Đường dẫn riêng của quán được giữ cố định khi cập nhật món. Dùng tên miền công khai trước khi in mã QR.' : 'Hãy kích hoạt bản quyền và lưu thông tin quán trước khi tải mã QR.') : 'Bản demo lưu dữ liệu trên trình duyệt này. Kết nối Supabase để khách trên thiết bị khác xem đúng menu của quán.'}</p><button class="button primary" id="download-qr">${icon('download')}Tải mã QR PNG</button> <button class="button secondary" id="copy-link">${icon('copy')}Sao chép liên kết</button></div></section>${backend&&account&&cloudRestaurant?'<section class="panel" id="table-manager"></section>':''}`}
async function drawQR(){await QRCode.toCanvas($('#qr-canvas'),$('#qr-url').value,{width:240,margin:2,color:{dark:'#1c3932',light:'#ffffff'}})}
function settingsHTML(){return `<div class="page-heading"><div><div class="eyebrow">DẤU ẤN RIÊNG CỦA BẠN</div><h1>Thông tin quán.</h1><p>Thông tin này sẽ xuất hiện trên menu dành cho khách.</p></div></div><form class="panel settings-form" id="settings-form"><label class="field">Tên quán<input name="name" value="${escape(restaurant.name)}" required maxlength="80"></label><label class="field">Lời chào<input name="tagline" value="${escape(restaurant.tagline)}" maxlength="180"></label><label class="field">Địa chỉ<input name="address" value="${escape(restaurant.address)}" maxlength="200"></label><button class="button primary">${icon('check')}Lưu thông tin</button></form>`}
function authHTML() {
  const mode=passwordMode&&account?'password':authMode;
  const title={signin:'Đăng nhập',signup:'Tạo tài khoản',forgot:'Quên mật khẩu',link:'Đăng nhập bằng liên kết',password:'Đặt mật khẩu'}[mode];
  const needsPassword=['signin','signup','password'].includes(mode);
  const confirmPassword=['signup','password'].includes(mode);
  return `<form id="auth-form" class="panel settings-form" data-mode="${mode}"><h2>${title}</h2><p class="muted">${!backend?'Chế độ demo. Cần kết nối Supabase để sử dụng tài khoản.':mode==='forgot'?'Nhận liên kết để đặt lại mật khẩu. Tài khoản dùng liên kết email trước đây cũng có thể đặt mật khẩu tại đây.':mode==='password'?'Đặt mật khẩu để lần sau đăng nhập trực tiếp bằng email.':mode==='signup'?'Tạo tài khoản cho cửa hàng của bạn. Sau khi đăng ký, xác nhận email rồi kích hoạt key sử dụng.':'Sử dụng tài khoản của bạn để quản lý thực đơn.'}</p><fieldset ${!backend?'disabled':''}>${mode!=='password'?'<label class="field">Email<input type="email" name="email" placeholder="Email của bạn" autocomplete="email" required maxlength="254"></label>':''}${needsPassword?`<label class="field">${mode==='password'?'Mật khẩu mới':'Mật khẩu'}<input type="password" name="password" autocomplete="${mode==='signin'?'current-password':'new-password'}" ${mode==='signin'?'':'minlength="8"'} maxlength="128" required></label>`:''}${confirmPassword?'<label class="field">Nhập lại mật khẩu<input type="password" name="confirm_password" autocomplete="new-password" minlength="8" maxlength="128" required></label><p class="muted">Dùng ít nhất 8 ký tự. Không dùng lại mật khẩu của dịch vụ khác.</p>':''}<div id="auth-message" role="status" aria-live="polite"></div><button class="button primary" id="auth-submit">${{signin:'Đăng nhập',signup:'Đăng ký tài khoản',forgot:'Gửi liên kết đặt lại mật khẩu',link:'Gửi liên kết đăng nhập',password:'Lưu mật khẩu'}[mode]}</button><div class="auth-links">${mode==='password'?'<button type="button" data-auth-mode="cancel">Quay lại tài khoản</button>':`<button type="button" data-auth-mode="${mode==='signin'?'signup':'signin'}">${mode==='signin'?'Chưa có tài khoản? Đăng ký':'Đã có tài khoản? Đăng nhập'}</button>${mode==='signin'?'<button type="button" data-auth-mode="forgot">Quên mật khẩu?</button><button type="button" data-auth-mode="link">Nhận liên kết đăng nhập qua email</button>':''}`}</div></fieldset></form>`;
}
function licenseHTML(){
  const heading=`<div class="page-heading"><div><div class="eyebrow">QRMenu ACCOUNT</div><h1>Không gian dành riêng cho quán.</h1><p>Tài khoản và bản quyền sử dụng của bạn.</p></div></div>`;
  if(!account||passwordMode)return heading+authHTML();
  const active = hasActiveLicense(licenses);
  const expiry = licenses.filter(l => !l.revoked).sort((a,b)=>Date.parse(b.expires_at)-Date.parse(a.expires_at))[0]?.expires_at;
  return heading+`<form class="panel settings-form" id="license-form"><h2>Tài khoản của bạn</h2><p class="muted">Đã đăng nhập: ${escape(account.email)}<br>${active?'Bản quyền đang hoạt động':'Chưa có bản quyền còn hiệu lực'}${expiry?` · Hạn sử dụng: ${escape(new Date(expiry).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}))} (UTC+7)`:''}</p><button type="button" class="button secondary" id="logout">Đăng xuất</button> <button type="button" class="button secondary" data-auth-mode="password">Đặt / đổi mật khẩu</button><label class="field">Key kích hoạt<input name="key" placeholder="Nhập key được cấp" autocomplete="off" minlength="16" maxlength="256"></label><button class="button primary">${icon('key-round')}Kích hoạt bản quyền</button></form>`;
}
function bindAuth() {
 document.querySelectorAll('[data-auth-mode]').forEach(button=>button.onclick=()=>{
   const next=button.dataset.authMode;
   passwordMode=next==='password';authMode=['password','cancel'].includes(next)?'signin':next;
   render();
 });
 const form=$('#auth-form');if(!form)return;
 const submit=form.querySelector('#auth-submit'), defaultLabel=submit.textContent;
 let pending=false;
 const updateCooldown=()=>{
   if(!form.isConnected){clearInterval(authCooldownTimer);return}
   const seconds=authCooldowns.remaining(form.dataset.mode);
   submit.disabled=!backend||pending||seconds>0;
   submit.textContent=pending?'Đang xử lý…':seconds>0?`Thử lại sau ${seconds}s`:defaultLabel;
   if(seconds>0&&!form.querySelector('#auth-message').textContent)form.querySelector('#auth-message').textContent='Tạm chờ giữa các lần gửi yêu cầu. Nếu đã nhận email, hãy dùng liên kết mới nhất.';
 };
 updateCooldown();authCooldownTimer=setInterval(updateCooldown,1000);
 form.onsubmit=async e=>{
   e.preventDefault();if(!backend||pending)return;
   if(authCooldowns.remaining(form.dataset.mode)>0){updateCooldown();return}
   const mode=form.dataset.mode, f=new FormData(form), email=String(f.get('email')||'').trim(), password=String(f.get('password')||'');
   const message=form.querySelector('#auth-message');
   if(['signup','password'].includes(mode)&&password!==f.get('confirm_password')){message.textContent='Hai mật khẩu chưa khớp. Vui lòng nhập lại.';return}
   const fieldset=form.querySelector('fieldset');pending=true;fieldset.disabled=true;updateCooldown();message.textContent='Đang xử lý…';
   try{
     if(mode==='signin'){await backend.signIn(email,password);await boot()}
     else if(mode==='signup'){
       const result=await backend.signUp(email,password);
       if(result.session){await boot()}
       else{authCooldowns.start(mode,60);message.textContent='Nếu email đủ điều kiện đăng ký, bạn sẽ nhận thư xác nhận. Kiểm tra hộp thư và thư rác, xác nhận email rồi quay lại đăng nhập.';form.elements.password.value='';form.elements.confirm_password.value=''}
     }else if(mode==='forgot'){
       await backend.resetPassword(email);authCooldowns.start(mode,60);message.textContent='Nếu email có tài khoản, bạn sẽ nhận liên kết đặt lại mật khẩu. Hãy mở thư mới nhất.';
     }else if(mode==='link'){
       await backend.login(email);authCooldowns.start(mode,60);message.textContent='Đã gửi liên kết. Kiểm tra hộp thư và thư rác.';
     }else if(mode==='password'){
       await backend.setPassword(password);passwordMode=false;authMode='signin';
       const url=new URL(location.href);url.searchParams.delete('reset');history.replaceState(null,'',url);
       render();toast('Đã lưu mật khẩu. Lần sau bạn có thể đăng nhập bằng email và mật khẩu.');
     }
   }catch(error){
     const feedback=authFailure(error);
     message.textContent=feedback.message;
     if(feedback.cooldownSeconds)authCooldowns.start(mode,feedback.cooldownSeconds);
   }finally{pending=false;fieldset.disabled=false;updateCooldown()}

 };
}
function ordersHTML(){return `<div class="page-heading"><div><div class="eyebrow">QUẢN LÝ ĐƠN HÀNG</div><h1>Đơn gọi món</h1><p>Lọc, tra cứu và xử lý từng đơn của cửa hàng.</p></div></div>${orderWorkspace()}`}
function renderPublic(){
 document.title=restaurant.name+' · Menu';
 $('#app').innerHTML=`<main class="public-menu"><header class="customer-header"><a class="public-brand" href="${escape(location.pathname+location.search)}">${icon('utensils')}<span>${escape(restaurant.name)}</span></a><button class="customer-basket-link" type="button" id="customer-basket-link" aria-label="Xem giỏ món">${icon('shopping-bag')}</button></header><section class="public-hero"><span>THỰC ĐƠN CỦA QUÁN</span><h1>Khám phá thực đơn</h1><p>${escape(restaurant.tagline)}</p>${publicTable?`<div class="customer-table">${icon('qr-code')} Bạn đang gọi món tại <strong>${escape(publicTable.label)}</strong></div>`:`<div class="customer-table">${icon('store')} Đặt món từ xa · Không số bàn</div>`}</section><div class="customer-menu-toolbar"><h2>Hôm nay bạn chọn món gì?</h2><span>${dishes.filter(d=>d.available).length} món đang phục vụ</span></div><div class="tabs public-tabs">${categories(true).map(c=>`<button data-category="${escape(c)}" class="${category===c?'selected':''}">${escape(c||'Tất cả')}</button>`).join('')}</div><div class="dish-grid">${filtered().map(d=>card(d,true)).join('')||'<p>Danh mục chưa có món.</p>'}</div><section class="panel customer-cart" id="customer-cart"></section><footer>${escape(restaurant.address)}<br>Menu điện tử bởi QRMenu · Giá hiển thị bằng VNĐ</footer><button type="button" class="public-cart-bar" id="public-cart-bar" hidden><span class="public-cart-bar-title">${icon('shopping-bag')}Giỏ món <b id="public-cart-count">0</b></span><strong id="public-cart-total">0đ</strong>${icon('chevron-right')}</button></main>`;
 document.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{category=el.dataset.category;renderPublic()});
 const showCart=()=>$('#customer-cart')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 $('#customer-basket-link').onclick=showCart;$('#public-cart-bar').onclick=showCart;
 createIcons({icons});if(!orderCart)orderCart=createOrderCart({backend,slug:publicSlug,tableToken:publicTableToken,table:publicTable,getDishes:()=>dishes,escape,money,toast});orderCart.mount();
}
function bindCards(){
 document.querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>openDish(el.dataset.edit));
 document.querySelectorAll('[data-toggle]').forEach(el=>el.onchange=async()=>{
   const checked=el.checked; el.disabled=true;
   const next=dishes.map(d=>d.id===el.dataset.toggle?{...d,available:checked}:d);
   if(await persist(restaurant,next)){render();toast('Đã cập nhật trạng thái món')}else{el.checked=!checked;el.disabled=false}
 });
}
function bind(){bindAuth();document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>{view=el.dataset.nav;render()});document.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{category=el.dataset.category;render()});bindCards();if($('#search'))$('#search').oninput=e=>{search=e.target.value;$('#dish-grid').innerHTML=filtered().map(d=>card(d)).join('')||'<div class="empty">Không tìm thấy món phù hợp.</div>';bindCards();createIcons({icons})};if($('#grid'))$('#grid').onclick=()=>{layout='grid';render()};if($('#list'))$('#list').onclick=()=>{layout='list';render()};if($('#add'))$('#add').onclick=()=>openDish();if($('#preview'))$('#preview').onclick=()=>{if(backend&&!cloudRestaurant)return toast('Hãy lưu thông tin quán để tạo menu online');window.open(menuURL(),'_blank','noopener')};if($('#banner-qr'))$('#banner-qr').onclick=()=>{view='qr';render()};$('#help').onclick=()=>toast(backend?'Cập nhật thông tin quán → thêm món → tải QR. Chỉ thay đổi lưu thành công mới được công khai.':'Thêm món → cập nhật thông tin quán → tải mã QR. Dữ liệu demo được lưu trên trình duyệt.');$('#notification').onclick=()=>{if(!backend||!account||!cloudRestaurant)return toast('Đăng nhập và lưu thông tin quán để nhận thông báo đơn.');view='orders';showNewOrders=true;render();alerts?.refresh()};if($('#settings-form'))$('#settings-form').onsubmit=async e=>{e.preventDefault();const next={...restaurant,...Object.fromEntries(new FormData(e.target))};if(await persist(next,dishes)){render();toast('Đã lưu thông tin quán')}};if($('#download-qr'))$('#download-qr').onclick=()=>{if(backend&&!cloudRestaurant)return toast('Hãy lưu thông tin quán trước khi tạo mã QR');const a=document.createElement('a');a.download='qrmenu.png';a.href=$('#qr-canvas').toDataURL();a.click()};if($('#copy-link'))$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#qr-url').value);toast('Đã sao chép liên kết')}catch{toast('Hãy chọn và sao chép đường dẫn bên trên')}};if($('#logout'))$('#logout').onclick=async()=>{try{passwordMode=false;authMode='signin';await backend.logout();await boot()}catch(error){toast(error.message)}};
if($('#license-form'))$('#license-form').onsubmit=async e=>{
 e.preventDefault();if(!backend||!account)return;
 const key=new FormData(e.target).get('key')?.trim();if(!key)return toast('Vui lòng nhập key');
 const button=e.target.querySelector('button.primary');button.disabled=true;
 try{await backend.activate(key);await boot();view='license';render();toast('Đã kích hoạt bản quyền')}
 catch(error){toast(error.message||'Không kích hoạt được bản quyền')}
 finally{button.disabled=false}
};
}

function openDish(id) {
  if(!canWrite()){view='license';render();toast('Đăng nhập và kích hoạt bản quyền để chỉnh sửa');return}
  const d=dishes.find(d=>d.id===id);
  let selectedImage=null, uploadedURL='', previewURL='', busy=false, processing=false, closed=false, selection=0, imageURLChanged=false;
  $('#modal-root').innerHTML=`<div class="modal-backdrop"><form class="modal" id="dish-form"><div class="modal-heading"><div><div class="eyebrow">MÓN MỚI CỦA BẠN</div><h2>${d?'Chỉnh sửa món':'Thêm món vào thực đơn'}</h2></div><button type="button" id="close-modal" class="icon-button" aria-label="Đóng">${icon('x')}</button></div><label class="field">Tên món<input name="name" required maxlength="100" value="${escape(d?.name||'')}" placeholder="Ví dụ: Phở bò, cơm gà, nước ép"></label><div class="form-row"><label class="field">Danh mục<input name="category" list="dish-categories" required maxlength="80" value="${escape(d?.category||'')}" placeholder="Nhập hoặc chọn danh mục"><datalist id="dish-categories">${categories().slice(1).map(c=>`<option value="${escape(c)}"></option>`).join('')}</datalist><small>Nhập danh mục mới hoặc chọn tên đã dùng.</small></label><label class="field">Giá bán (VNĐ)<input name="price" type="number" min="0" max="100000000" step="1000" required value="${d?.price??35000}"></label></div><label class="field">Mô tả<textarea name="description" maxlength="300" rows="2">${escape(d?.description||'')}</textarea></label><div class="field"><span>Ảnh món ăn</span><div class="image-picker"><img id="image-preview" src="${escape(d?.image||images.placeholder)}" alt="Ảnh xem trước"><div><label class="button secondary" for="dish-photo-file">Chọn ảnh từ thiết bị</label><input id="dish-photo-file" type="file" accept="image/jpeg,image/png,image/webp"><p>JPG, PNG, WebP · Tối đa 5 MB</p><p id="image-status" role="status">${backend?'Ảnh được tải lên khi lưu món.':'Demo: ảnh được lưu trong trình duyệt.'}</p><button type="button" class="image-reset" id="reset-image" hidden>Bỏ ảnh vừa chọn</button></div></div></div><details class="image-url-details"><summary>Hoặc sử dụng đường dẫn ảnh</summary><label class="field">Đường dẫn ảnh (HTTPS hoặc /images/...)<input name="image" type="text" pattern="(https://.*|/images/.*)" value="${escape(d?.image?.startsWith('data:')?images.placeholder:d?.image||images.placeholder)}" required></label></details><label class="checkbox-label"><input name="best" type="checkbox" ${d?.best?'checked':''}> Đánh dấu món bán chạy</label><div class="modal-actions">${d?'<button type="button" class="button danger" id="delete-dish">Xóa món</button>':''}<button type="button" class="button secondary" id="cancel-modal">Hủy</button><button id="save-dish" class="button primary">${icon('check')}Lưu món</button></div></form></div>`;
  const form=$('#dish-form'), fileInput=$('#dish-photo-file'), imageInput=form.elements.image;
  const setBusy=value=>{busy=value;form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=value);$('#save-dish').textContent=value?'Đang lưu…':'Lưu món'};
  const releasePreview=()=>{if(previewURL){URL.revokeObjectURL(previewURL);previewURL=''}};
  const close=()=>{if(busy)return;closed=true;selection++;releasePreview();$('#modal-root').innerHTML='';document.removeEventListener('keydown',esc)};
  const esc=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',esc);
  $('#close-modal').onclick=close;$('#cancel-modal').onclick=close;
  $('.modal-backdrop').onclick=e=>{if(e.target===e.currentTarget)close()};
  const resetImage=()=>{selection++;processing=false;selectedImage=null;uploadedURL='';releasePreview();fileInput.value='';$('#reset-image').hidden=true;$('#image-preview').src=imageInput.value;$('#image-status').textContent='Chưa chọn ảnh mới.'};
  $('#reset-image').onclick=resetImage;
  imageInput.oninput=()=>{imageURLChanged=true;resetImage()};
  fileInput.onchange=async()=>{
    const file=fileInput.files[0];if(!file)return;
    const token=++selection;processing=true;$('#image-status').textContent='Đang xử lý ảnh…';
    try{
      const blob=await prepareImage(file);if(closed||token!==selection)return;
      releasePreview();selectedImage=blob;uploadedURL='';previewURL=URL.createObjectURL(blob);
      $('#image-preview').src=previewURL;$('#image-status').textContent=`Đã chọn ${file.name} · ${Math.ceil(blob.size/1024)} KB`;
      $('#reset-image').hidden=false;
    }catch(error){if(!closed&&token===selection){toast(error.message);fileInput.value='';$('#image-status').textContent=selectedImage?'Giữ ảnh đã chọn trước đó.':'Ảnh chưa hợp lệ. Vui lòng chọn lại.'}}
    finally{if(token===selection)processing=false}
  };
  if($('#delete-dish'))$('#delete-dish').onclick=async()=>{
    if(busy||!confirm('Xóa món này khỏi thực đơn?'))return;
    setBusy(true);const ok=await persist(restaurant,dishes.filter(x=>x.id!==id));setBusy(false);
    if(ok){close();render();toast('Đã xóa món')}
  };
  form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;if(processing)return toast('Vui lòng chờ xử lý ảnh xong.');
    const f=new FormData(form);
    let categoryName;try{categoryName=canonicalCategory(f.get('category'),categories().slice(1))}catch(error){toast(error.message);return}
    const dish={id:id||crypto.randomUUID(),name:f.get('name').trim(),category:categoryName,price:Number(f.get('price')),description:f.get('description').trim(),image:f.get('image'),best:f.has('best'),available:d?.available??true};
    if(!selectedImage&&!imageURLChanged&&d?.image?.startsWith('data:'))dish.image=d.image;
    if(!dish.name)return;setBusy(true);
    try{
      if(selectedImage){
        if(!uploadedURL)uploadedURL=backend?await backend.uploadImage(selectedImage):await imageDataURL(selectedImage);
        dish.image=uploadedURL;
      }
      const next=d?dishes.map(x=>x.id===id?dish:x):[...dishes,dish];
      if(await persist(restaurant,next)){setBusy(false);close();render();toast(d?'Đã cập nhật món':'Đã thêm món mới')}
    }catch(error){toast(error.message||'Không tải được ảnh. Kiểm tra kết nối và cấu hình Storage rồi thử lại.')}
    finally{if(!closed)setBusy(false)}
  };
  createIcons({icons});form.elements.name.focus();
}
function statusScreen(title, message, retry = false) {
 haltOrderAlerts();
 $('#app').innerHTML = `<main class="status-screen panel"><div class="eyebrow">QRMenu</div><h1>${escape(title)}</h1><p>${escape(message)}</p>${retry?'<button id="retry" class="button primary">Thử lại</button>':''}<a class="button secondary" href="/">Về trang quản lý</a></main>`;
 if($('#retry'))$('#retry').onclick=()=>boot();
}
async function boot() {
 const id=++bootId;
 if(configurationError){statusScreen('Chưa kết nối được',configurationError);return}
 if(!backend){
   try{const saved=JSON.parse(localStorage.getItem('qrmenu-state'));if(saved){restaurant=saved.restaurant;dishes=saved.dishes}}catch{}
   render();return;
 }
 statusScreen('Đang tải không gian của bạn…','Đang kết nối Supabase.');
 try {
   if(publicSlug!==null){
     const menu=await withLoadTimeout(backend.publicMenu(publicSlug));
     if(id!==bootId)return;
     if(!menu){statusScreen('Menu chưa sẵn sàng','Không tìm thấy menu hoặc bản quyền của quán không còn hiệu lực.');return}
     publicTable=null;
     if(publicTableToken){
       if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicTableToken)){statusScreen('Mã bàn không hợp lệ','Quét lại mã QR tại bàn.');return}
       publicTable=await withLoadTimeout(backend.tableContext(publicSlug,publicTableToken));if(id!==bootId)return;
       if(!publicTable){statusScreen('Mã bàn không hợp lệ','Quét lại mã QR trên bàn hoặc liên hệ nhân viên.');return}
     }
     restaurant={name:menu.name,tagline:menu.tagline,address:menu.address};dishes=menu.dishes;view='public';render();return;
   }
   const state=await withLoadTimeout(backend.load());if(id!==bootId)return;
   account=state.user;cloudRestaurant=state.restaurant;licenses=state.licenses;
   restaurant=cloudRestaurant?{name:cloudRestaurant.name,tagline:cloudRestaurant.tagline,address:cloudRestaurant.address,categories:cloudRestaurant.categories||[]}:{name:'Quán của bạn',tagline:'Chào mừng bạn đến với quán.',address:''};
   dishes=cloudRestaurant?.dishes??[];
   if(!account||passwordMode)view='license';else if(view==='license'&&hasActiveLicense(licenses)&&cloudRestaurant)view='overview';
   render();
 } catch(error){if(id===bootId)statusScreen('Không tải được dữ liệu',error.message||'Kiểm tra kết nối rồi thử lại.',true)}
}
if(supabase){
 const observe=sessionObserver(()=>boot());
 supabase.auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY')setTimeout(()=>{passwordMode=true;view='license';boot()},0);
   else observe(event,session);
 });
}
boot();
