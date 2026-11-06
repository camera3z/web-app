import {test} from 'node:test';
import assert from 'node:assert/strict';
import {watchNewOrders} from '../src/notifications.js';
const tick=()=>new Promise(r=>setTimeout(r,10));
test('order notifications update on processing and visibility events and preserve count on failure',async()=>{
 const events=new EventTarget(),states=[];let count=2,fail=false;
 const watcher=watchNewOrders({events,isVisible:()=>true,interval:60000,getCount:async()=>{if(fail)throw Error('offline');return count},onChange:s=>states.push(s)});
 try{
 await tick();assert.deepEqual(states.at(-1),{count:2,error:false});count=0;events.dispatchEvent(new Event('qrmenu-orders-changed'));await tick();assert.deepEqual(states.at(-1),{count:0,error:false});
 count=3;events.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(states.at(-1).count,3);fail=true;await watcher.refresh();assert.deepEqual(states.at(-1),{count:3,error:true});
 }finally{watcher.stop()}
});
test('old account notification requests cannot update UI after watcher stops',async()=>{
 let resolve;const states=[];const watcher=watchNewOrders({events:new EventTarget(),isVisible:()=>true,interval:60000,getCount:()=>new Promise(r=>resolve=r),onChange:s=>states.push(s)});
 watcher.stop();resolve(99);await tick();assert.deepEqual(states,[]);
});
