import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorageGarbageCollector} from '../server/cloudbase/storage-gc.mjs';
import {createCloudBaseService} from '../server/cloudbase/service.mjs';

const user='account-123',token='valid-token-for-account-gc-test';
const envId='test-env-123';
const name=user+'/reset-old/'+ 'a'.repeat(64);

test('GC accepts only server planned owner paths and deletes through Storage API',async()=>{
 const requests=[];
 const collect=createStorageGarbageCollector({envId,
   rpc:async rpcName=>rpcName==='shiye_gc_plan_v1'
     ?{names:[name],resetPending:true,scanned:0}:{complete:true,remaining:0},
   fetcher:async(url,options)=>{requests.push({url,options});return new Response('ok');}});
 const result=await collect(token,user);
 assert.deepEqual(result,{deleted:1,resetComplete:true,remaining:0,more:false,scanned:0});
 assert.equal(requests.length,1);
 assert.equal(requests[0].options.method,'DELETE');
 assert.ok(requests[0].url.endsWith('/v1/storages/object/shiye-private/'+name));
 assert.equal(requests[0].options.headers.Authorization,'Bearer '+token);
});

test('GC refuses a foreign or traversal path before making a storage request',async()=>{
 for(const unsafe of ['other-user/file',user+'/../file']){
   let calls=0;
   const collect=createStorageGarbageCollector({envId,
     rpc:async()=>({names:[unsafe]}),fetcher:async()=>{calls++;return new Response('ok');}});
   await assert.rejects(collect(token,user),{code:'GC_SCOPE_INVALID'});
   assert.equal(calls,0);
 }
});

test('account reset requires explicit confirmation and forwards only validated identity',async()=>{
 const calls=[];
 const handle=createCloudBaseService({verifyUser:async()=>({userID:user}),
   garbageCollect:async()=>({deleted:0,resetComplete:true}),
   rpc:async(name,received,args)=>{calls.push({name,received,args});return {accepted:true,resetId:args.operation_id};},
   logger:()=>{}});
 const base={version:1,route:'/api/account-reset',method:'POST',authorization:'Bearer '+token};
 assert.equal((await handle({...base,body:{}})).status,400);
 assert.equal(calls.length,0);
 const body={confirmation:'清空账号',operation_id:'11111111-1111-4111-8111-111111111111',
   expected_epoch:'22222222-2222-4222-8222-222222222222',expected_revision:12};
 const response=await handle({...base,body});
 assert.equal(response.status,202);
 assert.equal(calls[0].name,'shiye_reset_account_v1');
 assert.equal(calls[0].received,token);
 assert.deepEqual(calls[0].args,body);
});
