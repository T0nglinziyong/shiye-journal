import test from 'node:test';
import assert from 'node:assert/strict';
import {createTicketHandler} from '../server/cos-tickets.mjs';
import {createCOSStore} from '../src/cos-store.js';
const hash='a'.repeat(64),token='synthetic-token-for-test-only';
test('COS authorizes only authenticated owner hash paths and validates a whole batch before signing',async()=>{
  let signs=0;const run=createTicketHandler({ready:true,origin:'https://shiye-journal-test.vercel.app',authenticate:async t=>t===token?'owner':null,sign:async()=>{signs++;return 'https://example.test/private';}});
  const req={method:'POST',authorization:'Bearer '+token,body:{objects:[{method:'GET',path:'owner/'+hash}]}};
  assert.equal((await run({...req,authorization:''})).status,401);
  assert.equal((await run({...req,origin:'https://attacker.test'})).status,403);
  assert.equal((await run({...req,body:{objects:[...req.body.objects,{method:'GET',path:'other/'+hash}]}})).status,403);assert.equal(signs,0);
  for(const path of ['owner/../'+hash,'owner/'+hash+'/extra','owner/private-name.png'])assert.equal((await run({...req,body:{objects:[{method:'GET',path}]}})).status,403);
  assert.equal((await run(req)).status,200);
  const put=await run({...req,body:{objects:[{method:'PUT',path:'owner/'+hash,type:'image/png'}]}});assert.equal(put.body.tickets[0].headers['x-cos-forbid-overwrite'],'true');
  assert.equal((await run({...req,method:'DELETE'})).status,405);
});
test('COS adapter batches authorization, never exposes credentials, and does not fall back on failure',async()=>{
  let authorizationCalls=0,objectCalls=0;const store=createCOSStore({enabled:true,client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),fetcher:async(url,options)=>{
    if(url==='/api/cos'){authorizationCalls++;assert.equal(options.headers.Authorization,'Bearer '+token);const {objects}=JSON.parse(options.body);return {ok:true,json:async()=>({tickets:objects.map(r=>({...r,url:'https://example.test/'+r.path,headers:{}}))})};}
    objectCalls++;return {ok:true,blob:async()=>new Blob(['image'])};
  }});
  await Promise.all([store.download('owner/'+hash),store.download('owner/'+'b'.repeat(64))]);assert.equal(authorizationCalls,1);assert.equal(objectCalls,2);
  const denied=createCOSStore({client:()=>({auth:{getSession:async()=>({data:{session:null}})}}),fetcher:async()=>{throw Error('should not fetch');}});await assert.rejects(denied.download('owner/'+hash),/请先登录/);
  const failed=createCOSStore({client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),fetcher:async()=>({ok:false,status:503})});await assert.rejects(failed.download('owner/'+hash),/503/);
});
