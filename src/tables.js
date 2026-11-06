import QRCode from 'qrcode';
import { withLoadTimeout } from './session.js';
export function tableMenuURL(slug,token,base=location.href){const url=new URL(base);url.search='';url.hash='';url.searchParams.set('menu',slug);url.searchParams.set('table',token);return url.href}
export async function printTableLabels(tables,restaurant,slug,escape){
 const popup=window.open('','_blank','width=900,height=750');
 if(!popup)throw new Error('Cho phép cửa sổ bật lên để in nhãn bàn.');
 popup.opener=null;popup.document.write('<p>Đang tạo nhãn QR…</p>');
 try{
 const labels=await Promise.all(tables.map(async t=>({number:t.table_number,image:await QRCode.toDataURL(tableMenuURL(slug,t.qr_token),{width:330,margin:4,errorCorrectionLevel:'M'})})));
 if(popup.closed)return;
 popup.document.open();popup.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Nhãn QR bàn · ${escape(restaurant.name)}</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font:14px Arial;margin:0;color:#18342a}.labels{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}.label{break-inside:avoid;border:1px dashed #9ba88d;text-align:center;padding:4mm}.label h1{font-size:28px;margin:2mm 0}.label h2{font-size:15px;margin:0}.label img{width:48mm;height:48mm}.label p{margin:2mm 0;font-size:11px}.tools{text-align:center;padding:20px}@media print{.tools{display:none}}</style></head><body><div class="tools"><p>Kiểm tra số bàn trước khi dán nhãn. Mỗi nhãn có mã riêng, không dùng lẫn giữa các bàn.</p><button onclick="window.print()">In nhãn QR</button></div><div class="labels">${labels.map(t=>`<article class="label"><h2>${escape(restaurant.name)}</h2><h1>BÀN ${String(t.number).padStart(2,'0')}</h1><img src="${t.image}" alt="QR Bàn ${t.number}"><p>Quét để xem menu và gọi món</p><p>Kiểm tra số bàn trên điện thoại trước khi gửi đơn.</p></article>`).join('')}</div></body></html>`);popup.document.close();
 }catch(error){popup.close();throw error}
}
export function mountTables({backend,restaurant,restaurantId,slug,escape,toast}){
 const root=document.querySelector('#table-manager');let stopped=false,rows=[],busy=false,loaded=false,page=0,search='',selected=null;
 const pageSize=12;
 root.innerHTML=`<details id="optional-table-qr"><summary>QR theo bàn (tùy chọn)</summary><p class="muted">QR chung vẫn đặt món từ xa. Thêm từng bàn bên dưới; các bàn đã tạo được lưu và giữ nguyên mã QR.</p><form id="single-table-form" class="single-table-form"><label class="field">Số bàn<input name="table_number" type="number" min="1" max="200" step="1" required placeholder="Ví dụ: 1"></label><button class="button primary">Thêm bàn</button></form><p id="table-error" role="alert"></p><label class="field saved-table-search">Tìm bàn đã lưu<input id="saved-table-search" type="search" placeholder="Nhập số bàn…"></label><div id="saved-tables"></div></details>`;
 const form=root.querySelector('form'),message=root.querySelector('#table-error'),result=root.querySelector('#saved-tables');
 function draw(){
  if(stopped||!root.isConnected)return;
  const filtered=rows.filter(t=>!search||String(t.table_number)===search||('Bàn '+String(t.table_number).padStart(2,'0')).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.max(0,Math.min(page,pages-1));
  const visible=filtered.slice(page*pageSize,(page+1)*pageSize);
  result.innerHTML=`<div class="saved-table-count"><strong>${rows.length} bàn đã lưu</strong><span>${filtered.length} kết quả · Trang ${page+1}/${pages}</span></div><div class="saved-table-grid">${visible.map(t=>`<article class="single-table-result ${selected===t.table_number?'just-added':''}" data-saved-table="${t.table_number}"><h3>Bàn ${String(t.table_number).padStart(2,'0')}</h3><p class="muted">${t.active?'Đang sử dụng':'Ngừng nhận đơn'}</p><button class="button secondary" data-copy-table="${t.id}">Sao chép link</button> <button class="button primary" data-print-table="${t.id}">In QR</button></article>`).join('')||`<p class="muted">${loaded?'Chưa có bàn phù hợp. Thêm bàn bằng ô bên trên.':'Đang tải bàn đã lưu…'}</p>`}</div>${pages>1?`<div class="saved-table-pages"><button class="button secondary" id="tables-prev" ${page===0?'disabled':''}>Trang trước</button><button class="button secondary" id="tables-next" ${page===pages-1?'disabled':''}>Trang sau</button></div>`:''}`;
  result.querySelector('#tables-prev')?.addEventListener('click',()=>{page--;draw()});result.querySelector('#tables-next')?.addEventListener('click',()=>{page++;draw()});
  result.querySelectorAll('[data-copy-table]').forEach(b=>b.onclick=async()=>{const t=rows.find(t=>t.id===b.dataset.copyTable);try{await navigator.clipboard.writeText(tableMenuURL(slug,t.qr_token));toast('Đã sao chép link Bàn '+t.table_number)}catch{message.textContent='Không sao chép được liên kết. Kiểm tra quyền clipboard.'}});
  result.querySelectorAll('[data-print-table]').forEach(b=>b.onclick=async()=>{const t=rows.find(t=>t.id===b.dataset.printTable);try{await printTableLabels([t],restaurant,slug,escape)}catch(error){message.textContent=error.message}});
 }
 async function load(){rows=await withLoadTimeout(backend.tables(restaurantId));if(stopped)return;loaded=true;rows.sort((a,b)=>a.table_number-b.table_number);draw()}
 root.querySelector('details').addEventListener('toggle',async e=>{if(e.target.open&&!loaded&&!busy){busy=true;form.querySelector('button').disabled=true;draw();try{await load()}catch(error){if(!stopped)message.textContent=error.message}finally{busy=false;form.querySelector('button').disabled=false}}});
 root.querySelector('#saved-table-search').oninput=e=>{search=e.target.value.trim();page=0;draw()};
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;const number=Number(form.elements.table_number.value);if(!Number.isInteger(number)||number<1||number>200)return;
  busy=true;form.querySelector('button').disabled=true;message.textContent='';
  try{
   await withLoadTimeout(backend.addTable(number));await load();if(stopped)return;
   selected=number;search='';root.querySelector('#saved-table-search').value='';page=Math.max(0,Math.floor(rows.findIndex(t=>t.table_number===number)/pageSize));draw();form.elements.table_number.value='';toast('Đã lưu Bàn '+String(number).padStart(2,'0')+'. Các bàn khác được giữ nguyên.');
  }catch(error){if(!stopped)message.textContent=error.message}
  finally{busy=false;form.querySelector('button').disabled=false}
 };
 return ()=>{stopped=true};
}
