import test from 'node:test';
import assert from 'node:assert/strict';
import {runAccountBrowserLock,isWebKitPatternError,describeSyncError} from '../src/sync-browser-compat.js';

const safariSyntax=()=>new DOMException('The string did not match the expected pattern.','SyntaxError');
test('Safari falls back to a safe ASCII Web Lock without uploading twice',async()=>{
 const names=[];let ran=0;
 const locks={request:async(name,opts,callback)=>{
   names.push(name);
   if(names.length===1)throw safariSyntax();
   assert.match(name,/^shiye-sync-[a-z0-9-]+$/);
   assert.equal(opts.mode,'exclusive');
   return callback();
 }};
 const result=await runAccountBrowserLock('https://foo.supabase.co:8f1e2d13-b399-4476-a28c-85c0049b1cd0',()=>{
  ran++;return Promise.resolve(7);
 },{locks});
 assert.equal(result,7);assert.equal(ran,1);assert.equal(names.length,2);
});
test('a SyntaxError thrown inside the lock callback is NEVER retried',async()=>{
 let acquisitions=0,runs=0;
 const locks={request:async(name,opts,callback)=>{acquisitions++;return callback();}};
 await assert.rejects(runAccountBrowserLock('id',()=>{
   runs++;throw safariSyntax();
 },{locks}),/expected pattern/);
 assert.equal(acquisitions,1);assert.equal(runs,1);
});
test('both invalid lock names fail closed; no unlocked upload is attempted',async()=>{
 let ran=0;
 const locks={request:async()=>{throw safariSyntax();}};
 await assert.rejects(runAccountBrowserLock('id',()=>{ran++;},{locks}),error=>{
   assert.equal(error.syncPhase,'浏览器同步锁参数格式错误');return true;
 });
 assert.equal(ran,0);
});
test('generic errors are not misreported as iOS Safari errors',()=>{
 assert.equal(isWebKitPatternError(new TypeError('invalid')),false);
 assert.match(describeSyncError(safariSyntax()),/Safari/);
 assert.match(describeSyncError(Object.assign(new Error('failed'),{syncPhase:'云端提交事务'})),/云端提交事务/);
});
