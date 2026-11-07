import {withLoadTimeout} from './session.js';
import {reportingDate} from './revenue.js';
const labels={new:'Mới',accepted:'Đã nhận',preparing:'Đang chuẩn bị'};
export function mountOverview({backend,restaurantId,escape,money,navigate}){
 const root=document.querySelector('#overview-content');let stopped=false,orderBusy=false,detailBusy=false;
 const orderRoot=root.querySelector('#overview-orders'),menuRoot=root.querySelector('#overview-menu'),reportRoot=root.querySelector('#overview-revenue');
 const active=()=>!stopped&&root.isConnected;
 const open=e=>{const button=e.target.closest('[data-overview-view]');if(button)navigate(button.dataset.overviewView)};
 root.addEventListener('click',open);
 const failure=(el,error)=>{if(active())el.innerHTML=`<p class="overview-error" role="status">Chưa cập nhật được: ${escape(error.message||'Kiểm tra kết nối rồi mở trang chi tiết.')}</p>`};
 async function orders(){
  if(orderBusy||!active())return;orderBusy=true;
  try{
   const data=await withLoadTimeout(backend.orderOverview(restaurantId));if(!active())return;
   const total=Object.values(data.counts).reduce((n,v)=>n+v,0);
   orderRoot.innerHTML=`<div class="overview-order-counts">${[['Đang chờ xử lý',total],['Đơn mới',data.counts.new],['Đã nhận',data.counts.accepted],['Đang chuẩn bị',data.counts.preparing]].map(([label,count])=>`<div><span>${label}</span><strong>${count}</strong></div>`).join('')}</div><div class="overview-rows">${data.orders.map(o=>`<button class="overview-order-row" data-overview-view="orders"><span><strong class="order-code overview-order-code">${escape(o.order_code)}</strong><small>${o.table_number?'Bàn '+String(o.table_number).padStart(2,'0'):'Không số bàn · Từ xa'} · ${escape(new Date(o.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}))}</small></span><span>${o.items.reduce((n,i)=>n+i.quantity,0)} phần</span><strong>${money(o.total)}</strong><span class="order-status status-${o.status}">${labels[o.status]}</span></button>`).join('')||'<p class="overview-empty">Chưa có đơn đang chờ xử lý.</p>'}</div><p class="overview-footnote">Hiển thị tối đa 5 đơn đang chờ lâu nhất · Số đếm tính toàn bộ đơn đang xử lý · Cập nhật ${escape(new Date().toLocaleTimeString('vi-VN'))}</p>`;
  }catch(error){failure(orderRoot,error)}finally{orderBusy=false}
 }
 async function details(){
  if(detailBusy||!active())return;detailBusy=true;
  await Promise.all([
   (async()=>{try{
     const dishes=await withLoadTimeout(backend.menuOverview(restaurantId));if(!active())return;
     const available=dishes.filter(d=>d.available).length;
     menuRoot.innerHTML=`<div class="overview-menu-counts"><span><strong>${dishes.length}</strong> món</span><span><strong>${available}</strong> đang bán</span><span><strong>${dishes.length-available}</strong> tạm hết</span></div><div class="overview-menu-list">${dishes.slice(0,5).map(d=>`<div><span>${escape(d.name)}<small>${escape(d.category)}</small></span><strong>${money(d.price)}</strong><span class="${d.available?'overview-available':'overview-unavailable'}">${d.available?'Đang bán':'Tạm hết'}</span></div>`).join('')||'<p class="overview-empty">Chưa có món. Vào Thực đơn để thêm món.</p>'}</div><p class="overview-footnote">Hiển thị tối đa 5 món · Thêm, sửa và cập nhật trạng thái tại trang Thực đơn.</p>`;
   }catch(error){failure(menuRoot,error)}})(),
   (async()=>{try{
     const date=reportingDate();const report=await withLoadTimeout(backend.revenue('day',date));if(!active())return;
     reportRoot.innerHTML=`<div class="overview-revenue-metrics"><div><span>Giá trị đơn hoàn tất hôm nay</span><strong>${money(report.completed_total)}</strong></div><div><span>Đơn đã phục vụ</span><strong>${report.completed_count}</strong></div><div><span>Trung bình / đơn</span><strong>${money(report.average_order)}</strong></div></div><p class="overview-footnote">${escape(date)} · Giờ Việt Nam UTC+7 · Giá trị đơn hoàn tất không khẳng định đã thu tiền. Tra ngày/tháng/năm tại Thống kê.</p>`;
   }catch(error){failure(reportRoot,error)}})(),
  ]);detailBusy=false;
 }
 const visible=()=>{if(document.visibilityState==='visible'){orders();details()}};
 const changed=()=>orders();document.addEventListener('visibilitychange',visible);document.addEventListener('qrmenu-orders-changed',changed);
 orders();details();
 const orderTimer=setInterval(()=>{if(document.visibilityState==='visible')orders()},10000);
 const detailTimer=setInterval(()=>{if(document.visibilityState==='visible')details()},60000);
 return ()=>{stopped=true;clearInterval(orderTimer);clearInterval(detailTimer);root.removeEventListener('click',open);document.removeEventListener('visibilitychange',visible);document.removeEventListener('qrmenu-orders-changed',changed)};
}
