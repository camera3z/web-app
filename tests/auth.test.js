import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBackend} from '../src/backend.js';
test('password authentication uses Supabase Auth, with correct callback URLs',async()=>{
 const original=globalThis.location;globalThis.location={origin:'https://menu.example.test',pathname:'/'};
 try{
 const calls=[];const record=(name,result={data:{},error:null})=>async value=>{calls.push([name,value]);return result};
 const client={auth:{signInWithPassword:record('signin'),signUp:record('signup'),resetPasswordForEmail:async(email,options)=>{calls.push(['reset',{email,options}]);return{data:{},error:null}},updateUser:record('update')}};
 const backend=createBackend(client);
 await backend.signIn('owner@example.test','test-password');await backend.signUp('owner@example.test','test-password');await backend.resetPassword('owner@example.test');await backend.setPassword('new-password');
 assert.deepEqual(calls[0],['signin',{email:'owner@example.test',password:'test-password'}]);
 assert.equal(calls[1][1].options.emailRedirectTo,'https://menu.example.test/');
 assert.equal(calls[2][1].options.redirectTo,'https://menu.example.test/?reset=1');
 assert.deepEqual(calls[3],['update',{password:'new-password'}]);
 client.auth.signInWithPassword=record('signin',{data:null,error:new Error('Invalid login credentials')});await assert.rejects(()=>backend.signIn('owner@example.test','wrong'),/Invalid login credentials/);
 }finally{if(original===undefined)delete globalThis.location;else globalThis.location=original}
});
