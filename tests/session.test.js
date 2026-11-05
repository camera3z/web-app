import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionObserver, withLoadTimeout } from '../src/session.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
test('returning to tab with same account keeps current screen and form',async()=>{
 let loads=0;const observe=sessionObserver(()=>loads++);
 const a={user:{id:'a'}};
 observe('INITIAL_SESSION',a);
 observe('SIGNED_IN',a);observe('SIGNED_IN',a);observe('TOKEN_REFRESHED',a);
 await tick();assert.equal(loads,0);
 observe('SIGNED_OUT',null);observe('SIGNED_OUT',null);await tick();assert.equal(loads,1);
 observe('SIGNED_IN',a);observe('SIGNED_IN',a);await tick();assert.equal(loads,2);
 observe('SIGNED_IN',{user:{id:'b'}});await tick();assert.equal(loads,3);
});
test('login callback before INITIAL_SESSION still loads only once',async()=>{
 let loads=0;const observe=sessionObserver(()=>loads++);const a={user:{id:'a'}};
 observe('SIGNED_IN',a);observe('INITIAL_SESSION',a);observe('SIGNED_IN',a);await tick();assert.equal(loads,1);
});
test('a stuck load fails visibly instead of waiting forever',async()=>{
 await assert.rejects(()=>withLoadTimeout(new Promise(()=>{}),15),/Kết nối quá lâu/);
 assert.equal(await withLoadTimeout(Promise.resolve('ready'),100),'ready');
 await assert.rejects(()=>withLoadTimeout(Promise.reject(new Error('offline')),100),/offline/);
});
