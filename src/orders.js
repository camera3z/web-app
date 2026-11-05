import { withLoadTimeout } from './session.js';
export const ORDER_LABELS={new:'Mới',accepted:'Đã nhận',preparing:'Đang chuẩn bị',served:'Đã phục vụ',rejected:'Từ chối'};
export function pendingTotals(orders) {
 const totals=new Map();
 for(const order of orders.filter(o=>['new','accepted','preparing'].includes(o.status)))for(const item of order.items){
   // Keep differently named snapshots separate if a dish is renamed.
   const key=JSON.stringify([item.id,item.name]);const old=totals.get(key)||{name:item.name,quantity:0};old.quantity+=item.quantity;totals.set(key,old);
 }
 return [...totals.values()];
}
export function createOrderCart({backend,slug,getDishes,escape,money,toast}) {
 const storageKey='qrmenu-cart-'+slug;
 let state={quantities:{},note:'',attempt:null,receipt:null};
 try{
   const saved=JSON.parse(localStorage.getItem(storageKey));
   if(saved?.receipt)state.receipt=saved.receipt;
   // Only restore an already-submitted request whose outcome is uncertain.
   // A new menu visit must not silently select items from an older draft.
   if(saved?.attempt&&typeof saved.quantities==='object'&&saved.quantities)state={...state,...saved};
 }catch{}
 let clientId;try{clientId=localStorage.getItem('qrmenu-order-client')}catch{}
 if(!/^[0-9a-f-]{36}$/i.test(clientId||'')){clientId=crypto.randomUUID();try{localStorage.setItem('qrmenu-order-client',clientId)}catch{}}
 let busy=false;
 const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify({...state,quantities:state.attempt?state.quantities:{},note:state.attempt?state.note:''}))}catch{}};
 const lines=()=>Object.entries(state.quantities).filter(([,n])=>Number.isInteger(n)&&n>0).map(([id,quantity])=>({dish:getDishes().find(d=>d.id===id),id,quantity}));
 const total=()=>lines().reduce((n,l)=>n+(l.dish?.price||0)*l.quantity,0);
 const locked=()=>busy||Boolean(state.attempt);
 function mount(){
  const root=document.querySelector('#customer-cart');if(!root)return;
  root.innerHTML=`<div class="cart-heading"><h2>Giỏ món của bạn</h2><button type="button" class="button secondary" id="clear-cart" ${locked()||!lines().length?'disabled':''}>Xóa giỏ</button></div><p class="muted">Không cần số bàn. Sau khi gửi, đưa mã đơn cho nhân viên để đối chiếu. Thanh toán trực tiếp với quán.</p>${!backend?'<p class="muted">Đây là menu demo. Chỉ menu đã kết nối online mới gửi đơn được.</p>':''}${state.receipt?`<div class="order-receipt" role="status"><strong>Đã gửi yêu cầu · ${escape(state.receipt.code)}</strong><p>${escape(new Date(state.receipt.created_at).toLocaleString('vi-VN'))} · ${money(state.receipt.total)}</p><small>Đang chờ quán tiếp nhận. Lưu mã đơn để đối chiếu.</small></div>`:''}${lines().map(l=>`<div class="cart-line"><div><strong>${escape(l.dish?.name||'Món không còn trong menu')}</strong><small>${l.dish?money(l.dish.price):'Vui lòng bỏ món này'}</small></div><div class="quantity"><button data-quantity="${escape(l.id)}" data-delta="-1" aria-label="Giảm số lượng" ${locked()?'disabled':''}>−</button><span>${l.quantity}</span><button data-quantity="${escape(l.id)}" data-delta="1" aria-label="Tăng số lượng" ${locked()?'disabled':''}>+</button></div><strong>${money((l.dish?.price||0)*l.quantity)}</strong></div>`).join('')||'<p class="muted">Chưa chọn món. Nhấn + trên món bạn muốn chọn.</p>'}<label class="field">Ghi chú cho quán<textarea id="order-note" maxlength="500" rows="2" ${locked()?'disabled':''}>${escape(state.note)}</textarea></label><div class="cart-footer"><strong>Tổng cộng: ${money(total())}</strong><button class="button primary" id="send-order" ${busy||!backend||!lines().length?'disabled':''}>${busy?'Đang gửi…':state.attempt?'Thử lại yêu cầu cũ':'Gửi đơn'}</button></div>${state.attempt&&!busy?'<p class="muted" role="alert">Chưa xác nhận được kết quả. Thử lại cùng yêu cầu để tránh tạo đơn trùng; giỏ món được giữ nguyên.</p>':''}`;
  root.querySelectorAll('[data-quantity]').forEach(b=>b.onclick=()=>change(b.dataset.quantity,Number(b.dataset.delta)));
  root.querySelector('#order-note').oninput=e=>{state.note=e.target.value;persist()};
  root.querySelector('#send-order').onclick=send;
  root.querySelector('#clear-cart').onclick=()=>{if(locked())return;state.quantities={};state.note='';persist();mount()};
  document.querySelectorAll('[data-cart-count]').forEach(el=>{el.textContent=state.quantities[el.dataset.cartCount]||0});
  document.querySelectorAll('[data-cart-change]').forEach(b=>{
    const id=b.dataset.cartChange,delta=Number(b.dataset.delta),quantity=state.quantities[id]||0;
    b.disabled=locked()||(delta>0?(!getDishes().find(d=>d.id===id)?.available||quantity>=99):quantity<=0);
    b.onclick=()=>change(id,delta);
  });
 }
 function change(id,delta){
  if(locked())return;
  const dish=getDishes().find(d=>d.id===id);
  if(delta>0&&!dish?.available)return toast('Món này hiện không phục vụ.');
  const next=Math.max(0,Math.min(99,(state.quantities[id]||0)+delta));
  if(next)state.quantities[id]=next;else delete state.quantities[id];
  persist();mount();
 }
 async function send(){
  if(busy||!backend)return;
  if(!state.attempt){
   const chosen=lines();
   if(!chosen.length)return;
   if(chosen.length>50||chosen.reduce((n,l)=>n+l.quantity,0)>500)return toast('Mỗi đơn tối đa 50 món khác nhau và 500 phần.');
   if(chosen.some(l=>!l.dish?.available))return toast('Có món đã hết hoặc không còn trong menu. Hãy bỏ món đó trước khi gửi.');
   state.attempt={id:crypto.randomUUID(),items:chosen.map(l=>({id:l.id,quantity:l.quantity})),note:state.note,total:total()};persist();
  }
  busy=true;mount();
  try{
   const a=state.attempt;
   const receipt=await withLoadTimeout(backend.placeOrder(slug,a.items,a.note,a.id,clientId,a.total));
   state={quantities:{},note:'',attempt:null,receipt};persist();toast('Đã gửi đơn. Vui lòng chờ quán tiếp nhận.');
  }catch(error){
   if(error.code){state.attempt=null;persist()}
   toast(error.message||'Chưa xác nhận được kết quả. Vui lòng thử lại cùng yêu cầu.');
  }finally{busy=false;mount()}
 }
 return {mount};
}
export function mountOrderManager({backend,restaurantId,escape,money,toast}) {
 const root=document.querySelector('#orders-content');
 let stopped=false,loading=false,mutating=false,history=false,rows=[],pending=[],filter='all',search='',lastUpdate='',lastError='';
 const stamp=date=>new Date(date).toLocaleString('vi-VN');
 function draw(){
  if(stopped||!root.isConnected)return;
  const focus=root.querySelector('#order-search')===document.activeElement;
  const caret=root.querySelector('#order-search')?.selectionStart;
  const shown=rows.filter(o=>(filter==='all'||o.status===filter)&&[o.order_code,o.note,...o.items.map(i=>i.name)].join(' ').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  root.innerHTML=`<section class="order-kpis" aria-label="Tình trạng đơn đang chờ">${[['Đang chờ xử lý',pending.length,'all'],['Đơn mới',pending.filter(o=>o.status==='new').length,'new'],['Đã tiếp nhận',pending.filter(o=>o.status==='accepted').length,'accepted'],['Đang chuẩn bị',pending.filter(o=>o.status==='preparing').length,'preparing']].map(([label,count,status])=>`<button data-kpi="${status}" class="order-kpi ${!history&&filter===status?'selected':''}"><span>${label}</span><strong>${count}</strong></button>`).join('')}</section><section class="order-workbench"><div class="order-toolbar"><div class="order-controls"><button class="button ${history?'secondary':'primary'}" id="pending-orders">Đang xử lý</button><button class="button ${history?'primary':'secondary'}" id="history-orders">Lịch sử</button></div><label class="order-search-label">Tìm đơn<input id="order-search" type="search" placeholder="Mã đơn, món, ghi chú…" value="${escape(search)}"></label><button class="button secondary" id="refresh-orders" ${loading||mutating?'disabled':''}>${loading?'Đang tải…':'Làm mới'}</button></div><div class="order-filterbar">${(history?['all','served','rejected']:['all','new','accepted','preparing']).map(status=>`<button data-order-filter="${status}" class="${filter===status?'active':''}">${status==='all'?'Tất cả':ORDER_LABELS[status]}</button>`).join('')}<span>${shown.length} / ${rows.length} đơn</span></div><div class="order-sync ${lastError?'sync-error':''}" role="status">${lastError?escape(lastError):lastUpdate?'Cập nhật '+escape(lastUpdate)+' · Tự làm mới mỗi 10 giây khi đang mở trang.':'Đang tải dữ liệu đơn…'}</div><div class="order-table-scroll"><table class="orders-table"><thead><tr><th>Đơn / Thời gian</th><th>Món đã đặt</th><th>SL</th><th>Tổng tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${shown.map(o=>`<tr><td data-label="Đơn"><strong class="order-code">${escape(o.order_code)}</strong><time>${escape(stamp(o.created_at))}</time><small>Cập nhật: ${escape(stamp(o.updated_at))}</small></td><td data-label="Món">${o.items.map(i=>`<div class="order-item"><span>${escape(i.name)} <b>× ${i.quantity}</b></span><small>${money(i.price)} / phần · ${money(i.subtotal)}</small></div>`).join('')}${o.note?`<p class="order-note"><b>Ghi chú:</b> ${escape(o.note)}</p>`:''}</td><td data-label="Số lượng">${o.items.reduce((n,i)=>n+i.quantity,0)}</td><td data-label="Tổng tiền"><strong>${money(o.total)}</strong></td><td data-label="Trạng thái"><span class="order-status status-${o.status}">${ORDER_LABELS[o.status]}</span></td><td data-label="Thao tác"><div class="order-actions">${(o.status==='new'?[['accepted','Nhận đơn']]:o.status==='accepted'?[['preparing','Bắt đầu chuẩn bị']]:o.status==='preparing'?[['served','Đã phục vụ']]:[]).map(([status,label])=>`<button class="button primary" data-order="${o.id}" data-status="${status}" ${mutating||loading?'disabled':''}>${label}</button>`).join('')}${['new','accepted','preparing'].includes(o.status)?`<button class="button secondary" data-order="${o.id}" data-status="rejected" ${mutating||loading?'disabled':''}>Từ chối</button>`:'<span class="muted">Đã kết thúc</span>'}</div></td></tr>`).join('')||`<tr><td colspan="6" class="empty">${loading&&!lastUpdate?'Đang tải đơn…':'Chưa có đơn trong danh sách này.'}</td></tr>`}</tbody></table></div><div class="order-list-note">${history?'200 đơn hoàn tất gần nhất, mới nhất trước.':'Tối đa 200 đơn đang chờ, đơn cũ nhất trước. Các số tổng hợp tính trong danh sách này.'}</div></section>${!history?`<section class="order-prep"><h2>Tổng món cần chuẩn bị</h2><div class="pending-totals">${pendingTotals(shown).map(i=>`<span>${escape(i.name)} <b>× ${i.quantity}</b></span>`).join('')||'<span>Không có món trong bộ lọc hiện tại.</span>'}</div></section>`:''}`;
  const switchList=value=>{if(mutating)return;history=value;filter='all';rows=[];draw();load()};
  root.querySelector('#pending-orders').onclick=()=>switchList(false);
  root.querySelector('#history-orders').onclick=()=>switchList(true);
  root.querySelector('#refresh-orders').onclick=()=>load();
  root.querySelectorAll('[data-order-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.orderFilter;draw()});
  root.querySelectorAll('[data-kpi]').forEach(b=>b.onclick=()=>{if(mutating)return;const wasHistory=history;history=false;filter=b.dataset.kpi;if(wasHistory){rows=pending;draw();load()}else draw()});
  root.querySelector('#order-search').oninput=e=>{search=e.target.value;draw()};
  if(focus){const input=root.querySelector('#order-search');input.focus({preventScroll:true});if(caret!==null&&caret!==undefined)try{input.setSelectionRange(caret,caret)}catch{}}
  root.querySelectorAll('[data-order]').forEach(b=>b.onclick=async()=>{
   if(loading||mutating)return;
   if(b.dataset.status==='rejected'&&!confirm('Từ chối đơn này?'))return;
   const o=rows.find(o=>o.id===b.dataset.order);mutating=true;draw();
   try{await withLoadTimeout(backend.setOrderStatus(o.id,o.status,b.dataset.status))}catch(error){toast(error.message)}finally{mutating=false;await load()}
  });
 }
 async function load(){
  if(stopped||loading||mutating)return;loading=true;draw();const requestedHistory=history;
  try{
   const results=await withLoadTimeout(Promise.all([backend.orders(restaurantId,false),...(requestedHistory?[backend.orders(restaurantId,true)]:[])]));
   if(requestedHistory===history){pending=results[0];rows=requestedHistory?results[1]:pending;lastUpdate=new Date().toLocaleTimeString('vi-VN');lastError=''}
  }catch(error){lastError='Không cập nhật được dữ liệu. '+error.message}
  finally{loading=false;draw();if(!stopped&&requestedHistory!==history)load()}
 }
 draw();load();
 const timer=setInterval(()=>{if(document.visibilityState==='visible')load()},10000);
 return ()=>{stopped=true;clearInterval(timer)};
}
