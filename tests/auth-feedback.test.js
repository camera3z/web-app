import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authFailure, createAuthCooldowns } from '../src/auth-feedback.js';
test('email quota and general request limits have distinct feedback',()=>{
 const email=authFailure({code:'over_email_send_rate_limit',status:429,message:'email rate limit exceeded'});
 assert.match(email.message,/Dịch vụ gửi email/);assert.equal(email.cooldownSeconds,60);
 const requests=authFailure({status:429,message:'Too many requests',retryAfter:120});
 assert.match(requests.message,/tần suất/);assert.equal(requests.cooldownSeconds,120);
 assert.match(authFailure({code:'email_address_not_authorized',message:'Email address not authorized'}).message,/chưa cho phép/);
 assert.equal(authFailure({message:'Invalid login credentials'}).cooldownSeconds,undefined);
});
test('email cooldown persists across forms and reload but does not block password login',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};let now=1000;
 const cooldown=createAuthCooldowns(storage,()=>now);cooldown.start('signup',60);
 assert.equal(cooldown.remaining('link'),60);assert.equal(cooldown.remaining('forgot'),60);assert.equal(cooldown.remaining('signin'),0);
 assert.equal(createAuthCooldowns(storage,()=>now).remaining('signup'),60);
 now+=60001;assert.equal(cooldown.remaining('signup'),0);
 cooldown.start('signin',30);assert.equal(cooldown.remaining('signup'),0);assert.equal(cooldown.remaining('signin'),30);
});
test('cooldown works even when browser storage is unavailable',()=>{
 const cooldown=createAuthCooldowns({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},()=>1000);
 cooldown.start('signup',60);assert.equal(cooldown.remaining('signup'),60);
});
