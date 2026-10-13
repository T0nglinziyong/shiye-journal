import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGcScope,gcOneBatch,processGc} from '../server/account-gc-worker.mjs';
import {createTicketHandler} from '../server/cos-tickets.mjs';

const owner='78550825-ce3c-4542-95df-434f39937503';
const resetId='7ae18668-19ef-4a3c-b6ee-6f5b803e506e';
const hash='a'.repeat(64);
const base={id:'shiye-reset-barrier',phase:'deleting',resetId,revision:5};
function stubDb(initial=base){
 let record=structuredClone(initial);
 const client={
   from(table){
     assert.equal(table,'shiye_records');
     return {
       select(){return this;},update({record:r}){record=structuredClone(r);return this;},
       eq(){return this;},maybeSingle:async()=>({data:{record},error:null}),
       then(resolve){return resolve({data:[{id:'shiye-reset-barrier'}],error:null});}
     };
   },storage:{from:()=>({list:async()=>({data:[],error:null}),remove:async()=>({error:null})})}
 };
 return {client,get:()=>record};
}
const env={SHIYE_COS_SECRET_ID:'test',SHIYE_COS_SECRET_KEY:'test',
 SHIYE_COS_BUCKET:'test',SHIYE_COS_REGION:'test'};
test('worker deletes only pre-reset COS generation, excluding current reset files',async()=>{
 const deleted=[],db=stubDb();
 const old=owner+'/'+hash,keep=owner+'/reset-'+resetId+'/'+hash;
 const worker=()=>({getBucket:async()=>({Contents:[{Key:old},{Key:keep}],IsTruncated:false}),
   deleteMultipleObject:async params=>{deleted.push(...params.Objects.map(x=>x.Key));return {Error:[]};}});
 const result=await gcOneBatch({client:db.client,user:owner,record:db.get(),env,cosFactory:worker});
 assert.equal(result.phase,'cos');
 assert.deepEqual(deleted,[old]);
 assert.equal(db.get().gcCosDone,true);
 assert.equal(db.get().gcCosDeleted,1);
});
test('the server refuses out-of-account COS results before deleting any object',async()=>{
 const db=stubDb();
 const cosFactory=()=>({getBucket:async()=>({Contents:[{Key:'someone-else/'+hash}],IsTruncated:false}),
   deleteMultipleObject:async()=>{throw Error('should not delete');}});
 await assert.rejects(gcOneBatch({client:db.client,user:owner,record:db.get(),
   cosFactory,env}),/不属于当前账号/);
 assert.equal(db.get().phase,'deleting');
});
test('completed GC persists its marker, rather than depending on a browser session',async()=>{
 const db=stubDb({...base,gcCosDone:true});
 const result=await gcOneBatch({client:db.client,user:owner,record:db.get(),
   env,cosFactory:()=>({})});
 assert.equal(result.complete,true);
 assert.equal(db.get().phase,'complete');
 assert.equal(db.get().resetId,resetId);
});
test('legacy upload generation is rejected after reset even if PWA has not refreshed',async()=>{
 let calls=0;
 const handler=createTicketHandler({ready:true,authenticate:async()=>({
   userID:owner,isAdmin:false,resetId
 }),sign:async()=>{calls++;return 'https://example.test/token';}});
 const request=path=>handler({method:'POST',authorization:'Bearer token-for-tests-long',
   body:{objects:[{path,method:'PUT',type:'image/png'}]}});
 assert.equal((await request(owner+'/'+hash)).status,403);
 assert.equal((await request(owner+'/reset-'+resetId+'/'+hash)).status,200);
 assert.equal(calls,1);
});
