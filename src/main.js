import { createIcons, ScanLine, ChevronsUpDown, LayoutDashboard, Utensils, QrCode, Store, Sparkles, ArrowUpRight, CircleHelp, Settings2, ChevronRight, Bell, ExternalLink, Sprout, ArrowRight, Heart, CircleCheck, Layers2, Plus, Search, LayoutGrid, List, Lightbulb, CheckCheck, Download, Copy, Check, KeyRound, Coffee, X, Pencil } from 'lucide';
const icons = { ScanLine, ChevronsUpDown, LayoutDashboard, Utensils, QrCode, Store, Sparkles, ArrowUpRight, CircleHelp, Settings2, ChevronRight, Bell, ExternalLink, Sprout, ArrowRight, Heart, CircleCheck, Layers2, Plus, Search, LayoutGrid, List, Lightbulb, CheckCheck, Download, Copy, Check, KeyRound, Coffee, X, Pencil };
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import './style.css';
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
let account = null, cloudRestaurant = null, licenses = [], saving = false, bootId = 0;
const publicSlug = new URLSearchParams(location.search).get('menu');
let category='',search='',view=publicSlug!==null?'public':'menu',layout='grid';
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
  if (!backend) return '';
  const text = !account ? 'Đăng nhập để mở không gian quản lý của bạn.' : !hasActiveLicense(licenses) ? 'Kích hoạt bản quyền để tạo hoặc cập nhật thực đơn.' : !cloudRestaurant ? 'Quán chưa xuất bản. Vào Thông tin quán và lưu để tạo đường dẫn QR riêng.' : 'Dữ liệu online · Mọi thay đổi thành công được lưu lên Supabase.';
  return `<div class="cloud-notice"><span>${escape(text)}</span><button class="button secondary" data-nav="${account && hasActiveLicense(licenses) ? 'settings' : 'license'}">${account && hasActiveLicense(licenses) ? 'Thông tin quán' : 'Tài khoản & bản quyền'}</button></div>`;
}
function toast(msg){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.append(el);setTimeout(()=>el.remove(),3500)}
function card(d,publicMode=false){return `<article class="dish ${!d.available?'sold-out':''}"><div class="dish-photo"><img src="${escape(d.image)}" alt="${escape(d.name)}" loading="lazy">${d.best?'<span class="best">✦ Bán chạy</span>':''}${!d.available?'<span class="out-label">Tạm hết món</span>':''}${!publicMode?`<button class="edit-photo" data-edit="${escape(d.id)}" aria-label="Sửa ${escape(d.name)}">${icon('pencil')}</button>`:''}</div><div class="dish-body"><div class="dish-category">${escape(d.category)}</div><h3>${escape(d.name)}</h3><p>${escape(d.description)}</p><div class="dish-bottom"><strong>${money(d.price)}</strong>${publicMode?'':`<label class="availability"><span>${d.available?'Đang bán':'Tạm hết'}</span><input type="checkbox" data-toggle="${escape(d.id)}" ${d.available?'checked':''}><span class="switch"></span></label>`}</div></div></article>`}
function filtered(){return dishes.filter(d=>(category===''||d.category===category)&&d.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))}
function render(){if(view==='public'){renderPublic();return}$('#app').innerHTML=`<aside class="sidebar"><a class="brand" href="/">${icon('scan-line')}<span>qrmenu<span class="brand-dot">.</span></span></a><div class="workspace"><div class="shop-avatar">M<span>•</span></div><div><strong>${escape(restaurant.name)}</strong><small>Không gian của bạn</small></div>${icon('chevrons-up-down')}</div><div class="nav-label">KHÔNG GIAN QUẢN LÝ</div><nav>${[['overview','layout-dashboard','Tổng quan'],['menu','utensils','Thực đơn'],['qr','qr-code','Mã QR'],['settings','store','Thông tin quán'],['license','key-round','Tài khoản & bản quyền']].map(([id,ic,label])=>`<button data-nav="${id}" class="nav-item ${view===id?'active':''}">${icon(ic)}${label}${id==='menu'?`<span class="nav-count">${dishes.length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="plan"><div>${icon('sparkles')}<strong>Không gian khởi đầu</strong></div><p>${backend ? (hasActiveLicense(licenses) ? "Bản quyền đang hoạt động · Online" : "Cần kích hoạt bản quyền") : "Bản demo · Lưu trên trình duyệt"}</p><button data-nav="license">Kích hoạt bản quyền ${icon('arrow-up-right')}</button></div><button class="help" id="help">${icon('circle-help')}Trung tâm trợ giúp${icon('arrow-up-right')}</button><div class="profile"><div class="profile-avatar">AN</div><div><strong>Chủ cửa hàng</strong><small>Quản trị viên</small></div>${icon('settings-2')}</div></div></aside><div class="main-shell"><header class="topbar"><div class="breadcrumb">Không gian quản lý ${icon('chevron-right')}<strong>${({menu:'Thực đơn',overview:'Tổng quan',qr:'Mã QR',settings:'Thông tin quán',license:'Bản quyền'})[view]}</strong></div><div class="top-actions"><span class="online-dot"></span><span>Quán đang mở cửa</span><span class="header-divider"></span><button class="icon-button" id="notification" aria-label="Thông báo">${icon('bell')}<b></b></button><div class="small-avatar">AN</div></div></header><main>${accessNotice()}${view==='menu'?menuHTML():view==='overview'?overviewHTML():view==='qr'?qrHTML():view==='settings'?settingsHTML():licenseHTML()}</main><footer><span>© ${new Date().getFullYear()} QRMenu. Chăm chút từng trải nghiệm.</span><span>Được tạo nên cho những quán nhỏ ${icon('heart')}</span></footer></div><div id="modal-root"></div>`;bind();createIcons({icons});if(view==='qr')drawQR()}
function menuHTML(){return `<div class="page-heading"><div><div class="eyebrow">THỰC ĐƠN CỦA BẠN</div><h1>Mỗi món ngon, một câu chuyện<span>.</span></h1><p>Chăm chút thực đơn, để khách hàng dễ dàng tìm thấy món yêu thích.</p></div><button class="button secondary" id="preview">${icon('external-link')}Xem menu khách</button></div><section class="welcome-banner"><div class="banner-copy"><span class="pill">${icon('sprout')} MỘT CHIẾC MENU THẬT RIÊNG</span><h2>Thực đơn của bạn.<br>Theo cách của bạn.</h2><p>Một chiếc QR nhỏ, mở ra cả thực đơn.<br>Luôn mới, luôn đẹp, luôn là bạn.</p><button id="banner-qr">Xem mã QR của quán ${icon('arrow-right')}</button></div><div class="banner-art"><div class="orb orb-one"></div><div class="orb orb-two"></div><div class="coffee-ring"></div><img src="${images.placeholder}" alt="Thực đơn điện tử"><span class="floating-note">${icon('heart')} Made with a little love</span><span class="star star-one">✳</span><span class="star star-two">✦</span></div></section><section class="stats">${[['utensils','Tổng số món',dishes.length,'Trong thực đơn'],['circle-check','Đang phục vụ',dishes.filter(d=>d.available).length,'Sẵn sàng cho khách'],['layers-2','Danh mục',new Set(dishes.map(d=>d.category)).size,'Do bạn xây dựng']].map(([ic,l,n,h])=>`<div class="stat"><div class="stat-icon">${icon(ic)}</div><div><span>${l}</span><strong>${n}<small>${h}</small></strong></div></div>`).join('')}</section><section class="menu-section"><div class="section-heading"><div><h2>Thực đơn của quán <span>${dishes.length} món</span></h2><p>Những hương vị làm nên dấu ấn riêng.</p></div><button class="button primary" id="add">${icon('plus')}Thêm món mới</button></div><div class="menu-toolbar"><div class="tabs">${categories().map(c=>`<button data-category="${escape(c)}" class="${category===c?'selected':''}">${escape(c||'Tất cả')}${c===''?` <span>${dishes.length}</span>`:''}</button>`).join('')}</div><div class="filter-tools"><label class="search">${icon('search')}<input id="search" placeholder="Tìm món yêu thích..." value="${escape(search)}" aria-label="Tìm món"></label><div class="view-toggle"><button id="grid" class="${layout==='grid'?'chosen':''}" aria-label="Dạng lưới">${icon('layout-grid')}</button><button id="list" class="${layout==='list'?'chosen':''}" aria-label="Dạng danh sách">${icon('list')}</button></div></div></div><div id="dish-grid" class="dish-grid ${layout==='list'?'list-view':''}">${filtered().map(d=>card(d)).join('')||'<div class="empty">Không tìm thấy món. Thử từ khóa khác nhé.</div>'}</div><div class="menu-tip">${icon('lightbulb')}<span>Mẹo nhỏ: Bật hoặc tắt trạng thái để khách biết món nào đang sẵn sàng phục vụ.</span><span>Thay đổi được lưu tự động ${icon('check-check')}</span></div></section>`}
function overviewHTML(){return `<div class="page-heading"><div><div class="eyebrow">CHÀO MỪNG TRỞ LẠI</div><h1>Một ngày mới tại ${escape(restaurant.name)}.</h1><p>Tổng quan thực đơn hiện tại của quán.</p></div></div><section class="overview-cards">${[['Tổng số món',dishes.length],['Đang phục vụ',dishes.filter(d=>d.available).length],['Tạm hết',dishes.filter(d=>!d.available).length]].map(([label,n])=>`<div><span>${label}</span><h1>${n}</h1></div>`).join('')}</section><section class="panel"><h2>Sẵn sàng đón khách</h2><p>Cập nhật thực đơn và đặt mã QR tại bàn để khách xem món ngay trên điện thoại.</p><button class="button primary" data-nav="menu">Quản lý thực đơn ${icon('arrow-right')}</button></section>`}
function menuURL(){const u=new URL(location.href);u.search='';u.searchParams.set('menu', backend ? cloudRestaurant?.slug || '' : '1');u.hash='';return u.href}
function qrHTML(){return `<div class="page-heading"><div><div class="eyebrow">KẾT NỐI VỚI KHÁCH HÀNG</div><h1>Một lần quét, cả thực đơn.</h1><p>Tải mã QR và đặt tại bàn hoặc quầy gọi món.</p></div></div><section class="qr-panel panel"><div class="qr-paper"><div class="eyebrow">CHÀO BẠN ĐẾN VỚI</div><h2>${escape(restaurant.name)}</h2><canvas id="qr-canvas"></canvas><h3>Quét mã để xem menu</h3><p>Chọn một món ngon, tận hưởng một chút an yên.</p></div><div><h2>Menu luôn trong tầm tay</h2><p>Mã QR dẫn đến menu dành cho khách hàng.</p><label class="field">Đường dẫn menu<input id="qr-url" readonly value="${escape(menuURL())}"></label><p class="muted">${backend ? (cloudRestaurant ? 'Đường dẫn riêng của quán được giữ cố định khi cập nhật món. Dùng tên miền công khai trước khi in mã QR.' : 'Hãy kích hoạt bản quyền và lưu thông tin quán trước khi tải mã QR.') : 'Bản demo lưu dữ liệu trên trình duyệt này. Kết nối Supabase để khách trên thiết bị khác xem đúng menu của quán.'}</p><button class="button primary" id="download-qr">${icon('download')}Tải mã QR PNG</button> <button class="button secondary" id="copy-link">${icon('copy')}Sao chép liên kết</button></div></section>`}
async function drawQR(){await QRCode.toCanvas($('#qr-canvas'),$('#qr-url').value,{width:240,margin:2,color:{dark:'#1c3932',light:'#ffffff'}})}
function settingsHTML(){return `<div class="page-heading"><div><div class="eyebrow">DẤU ẤN RIÊNG CỦA BẠN</div><h1>Thông tin quán.</h1><p>Thông tin này sẽ xuất hiện trên menu dành cho khách.</p></div></div><form class="panel settings-form" id="settings-form"><label class="field">Tên quán<input name="name" value="${escape(restaurant.name)}" required maxlength="80"></label><label class="field">Lời chào<input name="tagline" value="${escape(restaurant.tagline)}" maxlength="180"></label><label class="field">Địa chỉ<input name="address" value="${escape(restaurant.address)}" maxlength="200"></label><button class="button primary">${icon('check')}Lưu thông tin</button></form>`}
function licenseHTML(){
  const active = hasActiveLicense(licenses);
  const expiry = licenses.filter(l => !l.revoked).sort((a,b)=>Date.parse(b.expires_at)-Date.parse(a.expires_at))[0]?.expires_at;
  return `<div class="page-heading"><div><div class="eyebrow">QRMenu LICENSE</div><h1>Không gian dành riêng cho quán.</h1><p>Đăng nhập và quản lý bản quyền sử dụng của bạn.</p></div></div><form class="panel settings-form" id="license-form"><h2>${!backend?'Đang sử dụng bản demo':account?'Tài khoản của bạn':'Đăng nhập bằng email'}</h2><p class="muted">${!backend?'Chưa kết nối Supabase. Chế độ demo chỉ lưu dữ liệu trên trình duyệt.':account?`Đã đăng nhập: ${escape(account.email)}<br>${active?'Bản quyền đang hoạt động':'Chưa có bản quyền còn hiệu lực'}${expiry?` · Hạn sử dụng: ${escape(new Date(expiry).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}))} (UTC+7)`:''}`:'Nhập email để nhận liên kết đăng nhập. Mở liên kết trên thiết bị bạn muốn sử dụng.'}</p>${account?'<button type="button" class="button secondary" id="logout">Đăng xuất</button>':`<label class="field">Email<input type="email" name="email" placeholder="ban@quancaphe.vn" ${!backend?'disabled':''}></label><button type="button" class="button secondary" id="login" ${!backend?'disabled':''}>Gửi liên kết đăng nhập</button>`}<label class="field">Key kích hoạt<input name="key" placeholder="Nhập key được cấp" autocomplete="off" minlength="16" maxlength="256" ${!account?'disabled':''}></label><button class="button primary" ${!account?'disabled':''}>${icon('key-round')}Kích hoạt bản quyền</button></form>`;
}
function renderPublic(){document.title=restaurant.name+' · Menu';$('#app').innerHTML=`<main class="public-menu"><a class="public-brand" href="/">${icon('utensils')} ${escape(restaurant.name)}</a><div class="public-hero"><span>CHÀO MỪNG BẠN ĐẾN VỚI CỬA HÀNG</span><h1>Khám phá thực đơn</h1><p>${escape(restaurant.tagline)}</p></div><div class="tabs public-tabs">${categories(true).map(c=>`<button data-category="${escape(c)}" class="${category===c?'selected':''}">${escape(c||'Tất cả')}</button>`).join('')}</div><div class="dish-grid">${filtered().map(d=>card(d,true)).join('')||'<p>Danh mục chưa có món.</p>'}</div><footer>${escape(restaurant.address)}<br>Menu bởi QRMenu · Giá đã hiển thị theo VNĐ</footer></main>`;document.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{category=el.dataset.category;renderPublic()});createIcons({icons})}
function bindCards(){
 document.querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>openDish(el.dataset.edit));
 document.querySelectorAll('[data-toggle]').forEach(el=>el.onchange=async()=>{
   const checked=el.checked; el.disabled=true;
   const next=dishes.map(d=>d.id===el.dataset.toggle?{...d,available:checked}:d);
   if(await persist(restaurant,next)){render();toast('Đã cập nhật trạng thái món')}else{el.checked=!checked;el.disabled=false}
 });
}
function bind(){document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>{view=el.dataset.nav;render()});document.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{category=el.dataset.category;render()});bindCards();if($('#search'))$('#search').oninput=e=>{search=e.target.value;$('#dish-grid').innerHTML=filtered().map(d=>card(d)).join('')||'<div class="empty">Không tìm thấy món phù hợp.</div>';bindCards();createIcons({icons})};if($('#grid'))$('#grid').onclick=()=>{layout='grid';render()};if($('#list'))$('#list').onclick=()=>{layout='list';render()};if($('#add'))$('#add').onclick=()=>openDish();if($('#preview'))$('#preview').onclick=()=>{if(backend&&!cloudRestaurant)return toast('Hãy lưu thông tin quán để tạo menu online');window.open(menuURL(),'_blank','noopener')};if($('#banner-qr'))$('#banner-qr').onclick=()=>{view='qr';render()};$('#help').onclick=()=>toast(backend?'Cập nhật thông tin quán → thêm món → tải QR. Chỉ thay đổi lưu thành công mới được công khai.':'Thêm món → cập nhật thông tin quán → tải mã QR. Dữ liệu demo được lưu trên trình duyệt.');$('#notification').onclick=()=>toast('Bạn đã xem hết thông báo. Chúc quán một ngày thật vui!');if($('#settings-form'))$('#settings-form').onsubmit=async e=>{e.preventDefault();const next={...restaurant,...Object.fromEntries(new FormData(e.target))};if(await persist(next,dishes)){render();toast('Đã lưu thông tin quán')}};if($('#download-qr'))$('#download-qr').onclick=()=>{if(backend&&!cloudRestaurant)return toast('Hãy lưu thông tin quán trước khi tạo mã QR');const a=document.createElement('a');a.download='qrmenu.png';a.href=$('#qr-canvas').toDataURL();a.click()};if($('#copy-link'))$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#qr-url').value);toast('Đã sao chép liên kết')}catch{toast('Hãy chọn và sao chép đường dẫn bên trên')}};if($('#login'))$('#login').onclick=async e=>{
 const input=$('[name=email]');if(!input.reportValidity()||!input.value)return toast('Vui lòng nhập email hợp lệ');
 const button=e.currentTarget;button.disabled=true;
 try{await backend.login(input.value.trim());toast('Đã gửi liên kết. Kiểm tra hộp thư của bạn.')}
 catch(error){toast(error.message||'Không gửi được email. Vui lòng thử lại.')}
 finally{button.disabled=false}
};
if($('#logout'))$('#logout').onclick=async()=>{try{await backend.logout();await boot()}catch(error){toast(error.message)}};
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
     const menu=await backend.publicMenu(publicSlug);
     if(id!==bootId)return;
     if(!menu){statusScreen('Menu chưa sẵn sàng','Không tìm thấy menu hoặc bản quyền của quán không còn hiệu lực.');return}
     restaurant={name:menu.name,tagline:menu.tagline,address:menu.address};dishes=menu.dishes;view='public';render();return;
   }
   const state=await backend.load();if(id!==bootId)return;
   account=state.user;cloudRestaurant=state.restaurant;licenses=state.licenses;
   restaurant=cloudRestaurant?{name:cloudRestaurant.name,tagline:cloudRestaurant.tagline,address:cloudRestaurant.address,categories:cloudRestaurant.categories||[]}:{name:'Quán của bạn',tagline:'Chào mừng bạn đến với quán.',address:''};
   dishes=cloudRestaurant?.dishes??[];
   if(!account)view='license';
   render();
 } catch(error){if(id===bootId)statusScreen('Không tải được dữ liệu',error.message||'Kiểm tra kết nối rồi thử lại.',true)}
}
if(supabase)supabase.auth.onAuthStateChange((event)=>{
 if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(()=>boot(),0);
});
boot();
