import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorageUsageController,formatStorageBytes} from '../src/storage-usage-ui.js';

function fixture({admin=true,confirm=true,eligible=8}={}){
 const calls=[],session={access_token:'session-token'};
 const client={
  auth:{async getSession(){return {data:{session}};}},
  async rpc(name,args){
   calls.push({name,args});
   if(!admin)return {data:null,error:{message:'仅开发者管理员'}};
   return name==='shiye_storage_admin_stats'
    ?{data:{commits:{eligibleAfter90Days:eligible},tombstones:5},error:null}
    :{data:Math.min(eligible,5000),error:null};
  }
 };
 const fetchCalls=[];
 const fetcher=async(path,opts)=>{
   fetchCalls.push({path,opts});
   return {ok:true,async json(){return {totalBytes:256,inventoryComplete:true,groups:{}};}};
 };
 return {controller:createStorageUsageController({client,fetcher,confirmAction:()=>confirm}),calls,fetchCalls};
}
test('storage figures distinguish row bytes and full object bytes',()=>{
 assert.equal(formatStorageBytes(1024),'1.0 KB');
 assert.equal(formatStorageBytes(1024**3),'1.00 GB');
 assert.equal(formatStorageBytes(null),'0 B');
});
test('only authenticated administrator RPCs can load full statistics',async()=>{
 const {controller}=fixture({admin:false});
 await assert.rejects(controller.getDB(),/仅开发者管理员/);
});
test('COS inventory uses bearer token but no mutation or delete method',async()=>{
 const {controller,fetchCalls}=fixture();
 assert.equal((await controller.getCOS()).totalBytes,256);
 assert.equal(fetchCalls.length,1);
 assert.equal(fetchCalls[0].path,'/api/storage-usage');
 assert.equal(fetchCalls[0].opts.method,'GET');
 assert.equal(fetchCalls[0].opts.headers.Authorization,'Bearer session-token');
});
test('old receipts are pruned only after explicit confirmation and minimum 90-day server policy',async()=>{
 const declined=fixture({confirm:false});
 assert.equal(await declined.controller.prune({eligible:5}),null);
 assert.equal(declined.calls.length,0);
 const accepted=fixture({confirm:true,eligible:8});
 assert.equal(await accepted.controller.prune({eligible:8}),8);
 assert.deepEqual(accepted.calls[0],{name:'shiye_storage_prune_commits',
   args:{retention_days:90,batch_limit:5000}});
 assert.equal(await accepted.controller.prune({eligible:0}),0);
 assert.equal(accepted.calls.length,1);
});
