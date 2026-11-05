import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateImage, MAX_IMAGE_BYTES } from '../src/images.js';
import { createBackend } from '../src/backend.js';
test('image validation rejects unsupported formats, empty and oversized files',()=>{
 for(const type of ['image/jpeg','image/png','image/webp'])assert.doesNotThrow(()=>validateImage({type,size:1024}));
 for(const file of [{type:'image/svg+xml',size:100},{type:'image/jpeg',size:0},{type:'image/png',size:MAX_IMAGE_BYTES+1}])assert.throws(()=>validateImage(file));
});
test('upload uses authenticated user folder and propagates Storage failure',async()=>{
 const calls=[];let fail=false;
 const client={auth:{getUser:async()=>({data:{user:{id:'owner-id'}},error:null})},storage:{from:bucket=>({
 upload:async(path,blob,options)=>{calls.push({bucket,path,options});return{data:{path},error:fail?new Error('Storage denied'):null}},
 getPublicUrl:path=>({data:{publicUrl:'https://project.supabase.co/storage/v1/object/public/menu-images/'+path}})
 })}};
 const backend=createBackend(client);const blob=new Blob(['test'],{type:'image/webp'});
 const url=await backend.uploadImage(blob);
 assert.match(url,/\/owner-id\/[a-f0-9-]+\.webp$/);assert.equal(calls[0].bucket,'menu-images');assert.equal(calls[0].options.upsert,false);
 fail=true;await assert.rejects(()=>backend.uploadImage(blob),/Storage denied/);
 client.auth.getUser=async()=>({data:{user:null},error:null});await assert.rejects(()=>backend.uploadImage(blob),/đăng nhập/);
});
