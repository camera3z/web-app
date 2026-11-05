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
 const root=document.querySelector('#table-manager');let stopped=false,rows=[],busy=false;
 const error=message=>{const el=root.querySelector('#table-error');if(el)el.textContent=message};
 function draw(){if(stopped||!root.isConnected)return;root.innerHTML=`<div class="table-manager-head"><div><h2>QR riêng từng bàn</h2><p>Mã chung chỉ xem menu. Tạo các bàn, in nhãn rồi dán đúng số bàn.</p></div><button class="button primary" id="make-tables">Tạo Bàn 01–50</button></div><p id="table-error" role="alert"></p>${rows.length?`<div class="table-bulk"><strong>${rows.length} bàn · Mã đã tạo được giữ cố định</strong><button class="button secondary" id="print-all-tables">In toàn bộ nhãn QR</button></div><div class="table-cards">${rows.map(t=>`<article><h3>Bàn ${String(t.table_number).padStart(2,'0')}</h3><small>${t.active?'Đang sử dụng':'Ngừng nhận đơn'}</small><div><button class="button secondary" data-table-copy="${t.id}">Sao chép link</button><button class="button primary" data-table-print="${t.id}">In QR</button></div></article>`).join('')}</div>`:'<p class="muted">Chưa có bàn. Nhấn Tạo Bàn 01–50 để tạo mã riêng cho từng bàn.</p>'}`;
 root.querySelector('#make-tables').onclick=async e=>{if(busy)return;busy=true;e.currentTarget.disabled=true;try{await withLoadTimeout(backend.ensureTables(50));rows=await withLoadTimeout(backend.tables(restaurantId));draw();toast('Đã có Bàn 01–50. Các mã cũ được giữ nguyên.')}catch(e){error(e.message)}finally{busy=false;const b=root.querySelector('#make-tables');if(b)b.disabled=false}};
 const print=async tables=>{try{await printTableLabels(tables,restaurant,slug,escape)}catch(e){error(e.message)}};
 root.querySelector('#print-all-tables')?.addEventListener('click',()=>print(rows.filter(t=>t.active)));
 root.querySelectorAll('[data-table-print]').forEach(b=>b.onclick=()=>print(rows.filter(t=>t.id===b.dataset.tablePrint)));
 root.querySelectorAll('[data-table-copy]').forEach(b=>b.onclick=async()=>{const t=rows.find(t=>t.id===b.dataset.tableCopy);try{await navigator.clipboard.writeText(tableMenuURL(slug,t.qr_token));toast('Đã sao chép link Bàn '+t.table_number)}catch{error('Không sao chép được. Cho phép truy cập clipboard của trình duyệt.')}});
 }
 root.textContent='Đang tải danh sách bàn…';withLoadTimeout(backend.tables(restaurantId)).then(data=>{rows=data;draw()}).catch(e=>{draw();error('Chưa tải được bàn: '+e.message)});
 return ()=>{stopped=true};
}
