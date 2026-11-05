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
 const root=document.querySelector('#table-manager');let stopped=false,selected=null,busy=false;
 root.innerHTML=`<details id="optional-table-qr"><summary>Thêm QR theo bàn (tùy chọn)</summary><p class="muted">QR chung vẫn đặt món từ xa. Chỉ tạo QR bàn khi quán cần phân biệt vị trí phục vụ.</p><form id="single-table-form" class="single-table-form"><label class="field">Số bàn<input name="table_number" type="number" min="1" max="200" step="1" required placeholder="Ví dụ: 3"></label><button class="button primary">Mở / Tạo QR bàn</button></form><p id="table-error" role="alert"></p><div id="selected-table-qr"></div></details>`;
 const form=root.querySelector('form'),message=root.querySelector('#table-error'),result=root.querySelector('#selected-table-qr');
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;const number=Number(form.elements.table_number.value);if(!Number.isInteger(number)||number<1||number>200)return;
  busy=true;form.querySelector('button').disabled=true;message.textContent='';
  try{
   await withLoadTimeout(backend.addTable(number));
   const rows=await withLoadTimeout(backend.tables(restaurantId));if(stopped)return;
   selected=rows.find(t=>t.table_number===number);if(!selected)throw new Error('Chưa tải được mã bàn. Hãy thử lại.');
   result.innerHTML=`<article class="single-table-result"><h3>Bàn ${String(number).padStart(2,'0')}</h3><p class="muted">${selected.active?'Đang sử dụng':'Ngừng nhận đơn'} · Mã được giữ nguyên khi mở lại.</p><button class="button secondary" id="copy-single-table">Sao chép link</button> <button class="button primary" id="print-single-table">In QR bàn này</button></article>`;
   result.querySelector('#copy-single-table').onclick=async()=>{try{await navigator.clipboard.writeText(tableMenuURL(slug,selected.qr_token));toast('Đã sao chép link Bàn '+number)}catch{message.textContent='Không sao chép được liên kết. Kiểm tra quyền clipboard.'}};
   result.querySelector('#print-single-table').onclick=async()=>{try{await printTableLabels([selected],restaurant,slug,escape)}catch(error){message.textContent=error.message}};
  }catch(error){if(!stopped)message.textContent=error.message}
  finally{busy=false;form.querySelector('button').disabled=false}
 };
 return ()=>{stopped=true};
}
