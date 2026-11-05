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
 try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&typeof saved.quantities==='object'&&saved.quantities)state={...state,...saved}}catch{}
 let clientId;try{clientId=localStorage.getItem('qrmenu-order-client')}catch{}
 if(!/^[0-9a-f-]{36}$/i.test(clientId||'')){clientId=crypto.randomUUID();try{localStorage.setItem('qrmenu-order-client',clientId)}catch{}}
 let busy=false;
 const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state))}catch{}};
 const lines=()=>Object.entries(state.quantities).filter(([,n])=>Number.isInteger(n)&&n>0).map(([id,quantity])=>({dish:getDishes().find(d=>d.id===id),id,quantity}));
 const total=()=>lines().reduce((n,l)=>n+(l.dish?.price||0)*l.quantity,0);
 const locked=()=>busy||Boolean(state.attempt);
 function mount(){
  const root=document.querySelector('#customer-cart');if(!root)return;
  root.innerHTML=`<h2>Giỏ món của bạn</h2><p class="muted">Không cần số bàn. Sau khi gửi, đưa mã đơn cho nhân viên để đối chiếu. Thanh toán trực tiếp với quán.</p>${!backend?'<p class="muted">Đây là menu demo. Chỉ menu đã kết nối online mới gửi đơn được.</p>':''}${state.receipt?`<div class="order-receipt" role="status"><strong>Đã gửi yêu cầu · ${escape(state.receipt.code)}</strong><p>${escape(new Date(state.receipt.created_at).toLocaleString('vi-VN'))} · ${money(state.receipt.total)}</p><small>Đang chờ quán tiếp nhận. Lưu mã đơn để đối chiếu.</small></div>`:''}${lines().map(l=>`<div class="cart-line"><div><strong>${escape(l.dish?.name||'Món không còn trong menu')}</strong><small>${l.dish?money(l.dish.price):'Vui lòng bỏ món này'}</small></div><div class="quantity"><button data-quantity="${escape(l.id)}" data-delta="-1" aria-label="Giảm số lượng" ${locked()?'disabled':''}>−</button><span>${l.quantity}</span><button data-quantity="${escape(l.id)}" data-delta="1" aria-label="Tăng số lượng" ${locked()?'disabled':''}>+</button></div><strong>${money((l.dish?.price||0)*l.quantity)}</strong></div>`).join('')||'<p class="muted">Chưa chọn món. Nhấn Thêm món bên dưới món bạn thích.</p>'}<label class="field">Ghi chú cho quán<textarea id="order-note" maxlength="500" rows="2" ${locked()?'disabled':''}>${escape(state.note)}</textarea></label><div class="cart-footer"><strong>Tổng cộng: ${money(total())}</strong><button class="button primary" id="send-order" ${busy||!backend||!lines().length?'disabled':''}>${busy?'Đang gửi…':state.attempt?'Thử lại yêu cầu cũ':'Gửi đơn'}</button></div>${state.attempt&&!busy?'<p class="muted" role="alert">Chưa xác nhận được kết quả. Thử lại cùng yêu cầu để tránh tạo đơn trùng; giỏ món được giữ nguyên.</p>':''}`;
  root.querySelectorAll('[data-quantity]').forEach(b=>b.onclick=()=>change(b.dataset.quantity,Number(b.dataset.delta)));
  root.querySelector('#order-note').oninput=e=>{state.note=e.target.value;persist()};
  root.querySelector('#send-order').onclick=send;
  document.querySelectorAll('[data-cart-add]').forEach(b=>{b.disabled=locked()||!getDishes().find(d=>d.id===b.dataset.cartAdd)?.available;b.onclick=()=>change(b.dataset.cartAdd,1)});
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
 const root=document.querySelector('#orders-content');let stopped=false,loading=false,history=false,rows=[];
 function draw(error=''){
  if(stopped||!root.isConnected)return;
  root.innerHTML=`<div class="order-controls"><button class="button ${history?'secondary':'primary'}" id="pending-orders">Đang chờ xử lý</button><button class="button ${history?'primary':'secondary'}" id="history-orders">Lịch sử</button><button class="button secondary" id="refresh-orders">Làm mới</button></div><p class="muted">${history?'200 đơn hoàn tất gần nhất, mới nhất trước.':'Tối đa 200 đơn đang chờ, đơn cũ nhất trước. Tự làm mới mỗi 10 giây khi đang mở trang.'} ${error?escape(error):''}</p>${!history&&rows.length?`<section class="panel"><h2>Tổng món đang chờ</h2><div class="pending-totals">${pendingTotals(rows).map(i=>`<span>${escape(i.name)} <b>× ${i.quantity}</b></span>`).join('')}</div></section>`:''}${rows.map(o=>`<article class="panel order-card"><div class="order-card-title"><h2>${escape(o.order_code)}</h2><span>${ORDER_LABELS[o.status]}</span></div><p class="muted">${escape(new Date(o.created_at).toLocaleString('vi-VN'))}</p>${o.items.map(i=>`<div class="cart-line"><span>${escape(i.name)} <b>× ${i.quantity}</b></span><strong>${money(i.subtotal)}</strong></div>`).join('')}<p>${escape(o.note||'Không có ghi chú')}</p><div class="cart-footer"><strong>${money(o.total)}</strong><div>${(o.status==='new'?[['accepted','Nhận đơn']]:o.status==='accepted'?[['preparing','Bắt đầu chuẩn bị']]:o.status==='preparing'?[['served','Đã phục vụ']]:[]).map(([status,label])=>`<button class="button primary" data-order="${o.id}" data-status="${status}">${label}</button>`).join('')} ${['new','accepted','preparing'].includes(o.status)?`<button class="button secondary" data-order="${o.id}" data-status="rejected">Từ chối</button>`:''}</div></div></article>`).join('')||'<p class="empty">Chưa có đơn trong danh sách này.</p>'}`;
  root.querySelector('#pending-orders').onclick=()=>{history=false;rows=[];load()};root.querySelector('#history-orders').onclick=()=>{history=true;rows=[];load()};root.querySelector('#refresh-orders').onclick=()=>load();
  root.querySelectorAll('[data-order]').forEach(b=>b.onclick=async()=>{
   if(loading)return;
   if(b.dataset.status==='rejected'&&!confirm('Từ chối đơn này?'))return;
   const o=rows.find(o=>o.id===b.dataset.order);loading=true;b.disabled=true;
   try{await backend.setOrderStatus(o.id,o.status,b.dataset.status)}catch(error){toast(error.message)}finally{loading=false;await load()}
  });
 }
 async function load(){
  if(stopped||loading)return;loading=true;
  const requestedHistory=history;
  try{const result=await withLoadTimeout(backend.orders(restaurantId,requestedHistory));if(requestedHistory===history){rows=result;draw()}}
  catch(error){draw('Không cập nhật được: '+error.message)}finally{loading=false;if(!stopped&&requestedHistory!==history)load()}
 }
 root.textContent='Đang tải đơn…';load();
 const timer=setInterval(()=>{if(document.visibilityState==='visible')load()},10000);
 return ()=>{stopped=true;clearInterval(timer)};
}
