import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptHTML} from '../src/receipt.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('receipt distinguishes estimates and payments, escapes user content and shows change',()=>{
 const order={order_code:'Q-TEST',created_at:'2026-11-05T00:00:00Z',items:[{name:'<script>alert(1)</script>',quantity:2,price:35000,subtotal:70000}],total:70000,note:'<img src=x onerror=alert(1)>'};
 const restaurant={name:'Quán <b>test</b>',address:'Địa chỉ'};
 const estimate=receiptHTML(order,restaurant,escape,n=>n+'đ');assert.match(estimate,/PHIẾU TẠM TÍNH/);assert.match(estimate,/CHƯA THANH TOÁN/);assert.ok(!estimate.includes('<script>'));assert.match(estimate,/&lt;script&gt;/);
 const paid=receiptHTML({...order,payment_status:'paid',cash_received:100000,paid_at:'2026-11-05T01:00:00Z'},restaurant,escape,n=>n+'đ');assert.match(paid,/PHIẾU THANH TOÁN/);assert.match(paid,/Tiền thừa: 30000đ/);assert.match(paid,/70000đ/);
});
