import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudFunctionTransport,withRequestDeadline} from '../src/cloud-function-transport.js';
import {createPostgresRPC} from '../server/cloudbase/postgres.mjs';
import {createCloudBaseService,sanitizeTelemetry} from '../server/cloudbase/service.mjs';
import {createTicketHandler} from '../server/cos-tickets.mjs';
import {createSearchService} from '../server/cloudbase/search.mjs';
const token='synthetic-test-token-00000000';
const session={data:{session:{access_token:token}}};
const success={result:{version:1,status:200,body:{ok:true},requestId:'test-request'}};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('timed out authentication cannot issue a late cloud function invocation',async()=>{
 let release,invocations=0;
 const auth=new Promise(resolve=>{release=resolve;});
 const request=createCloudFunctionTransport({timeoutMs:5,getSession:()=>auth,
   invoke:async()=>{invocations++;return success;}});
 await assert.rejects(request('/api/platform-health'),{code:'SHIYE_API_TIMEOUT'});
 release(session);await sleep(15);
 assert.equal(invocations,0,'No remote request may start after its local deadline');
});

test('declared oversized database response is rejected before JSON allocation',async()=>{
 const rpc=createPostgresRPC({envId:'shiye-test',fetcher:async()=>new Response('{"ok":true}',{
   status:200,headers:{'content-length':'9999999','content-type':'application/json'}})});
 await assert.rejects(rpc('shiye_platform_capabilities_v1',token),{code:'DATABASE_RESPONSE_SIZE'});
});

test('abort before invocation neither reads auth nor touches the network',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const request=createCloudFunctionTransport({getSession:async()=>{calls++;return session;},invoke:async()=>{calls++;return success;}});
 await assert.rejects(request('/api/platform-health',{signal:controller.signal}),{name:'AbortError'});
 assert.equal(calls,0);
});
test('a function already started can finish after cancellation without unhandled rejection',async()=>{
 const controller=new AbortController();let rejectInvoke,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const request=createCloudFunctionTransport({getSession:async()=>session,
   invoke:()=>{started();return new Promise((_,reject)=>{rejectInvoke=reject;});}});
 const pending=request('/api/platform-health',{signal:controller.signal});
 await ready;controller.abort();await assert.rejects(pending,{name:'AbortError'});
 rejectInvoke(Error('late transport failure'));await sleep(10);
});
test('deadline validates its configuration',async()=>{
 for(const timeoutMs of [0,-1,NaN,Infinity,180001])await assert.rejects(withRequestDeadline(()=>1,{timeoutMs}),TypeError);
 assert.equal(await withRequestDeadline(()=>42,{timeoutMs:1000}),42);
});
test('unknown business routes and methods never fall back to HTTP',async()=>{
 let calls=0;
 const request=createCloudFunctionTransport({getSession:async()=>session,
  invoke:async()=>{calls++;return success;},network:async()=>{calls++;return new Response('{}');}});
 await assert.rejects(request('/api/old-platform'),{status:404});
 await assert.rejects(request('/api/cos',{method:'DELETE'}),{status:405});
 assert.equal(calls,0);
});
test('signed COS bytes are passed straight through without auth material in their body',async()=>{
 let invoked=0;const bytes=new Blob(['actual test bytes'],{type:'image/png'});
 const request=createCloudFunctionTransport({getSession:async()=>session,invoke:async()=>{invoked++;return success;},
  network:async(url,init)=>{assert.equal(url,'https://cos.example/object?signature=opaque');assert.equal(init.body,bytes);return new Response('',{status:200});}});
 assert.equal((await request('https://cos.example/object?signature=opaque',{method:'PUT',body:bytes})).status,200);
 assert.equal(invoked,0);
});
test('business envelope rejects image blobs and excessive UTF-8 JSON payloads',async()=>{
 let called=0;
 const request=createCloudFunctionTransport({getSession:async()=>session,invoke:async()=>{called++;return success;}});
 await assert.rejects(request('/api/cos',{method:'POST',body:new Blob(['x'])}),{code:'SHIYE_API_BODY'});
 await assert.rejects(request('/api/search',{method:'POST',body:JSON.stringify({query:'中'.repeat(90000)})}),{status:413});
 assert.equal(called,0);
});
test('missing session produces an auth error, never a fake success response',async()=>{
 let called=0;
 const request=createCloudFunctionTransport({getSession:async()=>({data:{session:null}}),invoke:async()=>{called++;return success;}});
 await assert.rejects(request('/api/platform-health'),{status:401});assert.equal(called,0);
});
test('successful CloudBase response retains request correlation and private cache headers',async()=>{
 const request=createCloudFunctionTransport({getSession:async()=>session,invoke:async call=>{
   assert.equal(call.name,'shiye-api');assert.equal(call.data.authorization,'Bearer '+token);return success;
 }});
 const response=await request('/api/platform-health');
 assert.equal(response.headers.get('X-Shiye-Request-Id'),'test-request');
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(await response.json(),{ok:true});
});
test('invalid CloudBase envelopes fail closed',async()=>{
 for(const result of [{version:1,status:200,body:[]},{version:2,status:200,body:{}},'bad json',null]){
  const request=createCloudFunctionTransport({getSession:async()=>session,invoke:async()=>({result})});
  await assert.rejects(request('/api/platform-health'),{code:'SHIYE_API_RESPONSE'});
 }
});
test('database JSON stream is bounded even without Content-Length',async()=>{
 const rpc=createPostgresRPC({envId:'shiye-test',maxResponseBytes:64,fetcher:async()=>new Response(JSON.stringify({s:'x'.repeat(100)}))});
 await assert.rejects(rpc('shiye_platform_capabilities_v1',token),{code:'DATABASE_RESPONSE_SIZE'});
});
for(const [status,code] of [[401,'DATABASE_AUTH'],[403,'DATABASE_AUTH'],[404,'MIGRATION_REQUIRED'],[429,'RATE_LIMITED'],[413,'DATABASE_REQUEST_SIZE']]){
 test(`database HTTP ${status} survives an empty or HTML gateway body`,async()=>{
  const rpc=createPostgresRPC({envId:'shiye-test',fetcher:async()=>new Response('<html>denied</html>',{status})});
  await assert.rejects(rpc('shiye_platform_capabilities_v1',token),{code});
 });
}
test('database RPC rejects unregistered functions, malformed auth and non-object arguments',async()=>{
 let calls=0;const rpc=createPostgresRPC({envId:'shiye-test',fetcher:async()=>{calls++;return new Response('{}');}});
 await assert.rejects(rpc('arbitrary_sql',token,{}),{code:'RPC_NOT_ALLOWED'});
 await assert.rejects(rpc('shiye_account_storage_v1','bad',{}),{code:'AUTH_REQUIRED'});
 await assert.rejects(rpc('shiye_account_storage_v1',token,[]),{code:'INVALID_QUERY'});
 await assert.rejects(rpc('shiye_account_storage_v1',token,{x:'中'.repeat(90000)}),{status:413});assert.equal(calls,0);
});
test('database errors never return raw SQL, credentials or contents',async()=>{
 const secret='sensitive-SQL-diary-key';
 const rpc=createPostgresRPC({envId:'shiye-test',fetcher:async()=>new Response(JSON.stringify({message:secret}),{status:500})});
 await assert.rejects(rpc('shiye_account_storage_v1',token),e=>{assert.ok(!e.message.includes(secret));return e.code==='DATABASE_UNAVAILABLE';});
});
test('database data requires structured JSON',async()=>{
 for(const data of ['not json','null','42','"hello"']){
  const rpc=createPostgresRPC({envId:'shiye-test',fetcher:async()=>new Response(data)});
  await assert.rejects(rpc('shiye_account_storage_v1',token),{code:'DATABASE_RESPONSE'});
 }
});

const owner='cloudbase-user-A',hash='a'.repeat(64),reset='11111111-1111-4111-8111-111111111111';
const envelope=(route,body={},method='POST')=>({version:1,route,method,authorization:'Bearer '+token,body});
function service(options={}){
 const logs=[],signed=[];
 const handle=createCloudBaseService({verifyUser:async()=>({userID:owner}),cosReady:true,
   sign:async row=>{signed.push(row);return 'https://cos.example/'+row.path+'?signature=secret';},
   rpc:async()=>({schemaVersion:1,keyword:true,vector:false}),logger:line=>logs.push(JSON.parse(line)),...options});
 return {handle,logs,signed};
}
test('image tickets remain functional while optional database migrations are missing',async()=>{
 const {ServiceError}=await import('../server/cloudbase/errors.mjs');
 const {handle}=service({rpc:async()=>{throw new ServiceError(503,'MIGRATION_REQUIRED','missing');}});
 const health=await handle(envelope('/api/platform-health',null,'GET'));
 assert.equal(health.status,200);assert.equal(health.body.capabilities.vector,false);
 const result=await handle(envelope('/api/cos',{objects:[{path:owner+'/'+hash,method:'GET',variant:'preview360'}]}));
 assert.equal(result.status,200);
});
test('COS object owner, traversal, HTTP method and derivative validation remain strict',async()=>{
 const {handle,signed}=service();
 for(const row of [{path:'other/'+hash,method:'GET'},{path:owner+'/../'+hash,method:'GET'},
  {path:owner+'/'+hash,method:'DELETE'},{path:owner+'/'+hash,method:'GET',variant:'preview100000'}]){
  assert.equal((await handle(envelope('/api/cos',{objects:[row]}))).status,403);
 }
 assert.equal(signed.length,0);
});
test('reset generations forbid stale writes and retain immutable-object protection',async()=>{
 const {handle,signed}=service({verifyUser:async()=>({userID:owner,resetId:reset})});
 assert.equal((await handle(envelope('/api/cos',{objects:[{path:owner+'/'+hash,method:'PUT',type:'image/png'}]}))).status,403);
 assert.equal((await handle(envelope('/api/cos',{objects:[{path:owner+'/reset-'+reset+'/'+hash,method:'PUT',type:'image/png'}]}))).status,200);
 assert.equal(signed[0].headers['x-cos-forbid-overwrite'],'true');
});
test('telemetry allowlist removes personal text, object paths and tokens',async()=>{
 const {handle,logs}=service();
 const response=await handle(envelope('/api/telemetry',{events:[{event:'sync-failed',status:413,
  query:'private diary',token,message:'secret',url:'https://signed.example'}]}));
 assert.equal(response.status,200);assert.equal(response.body.accepted,1);
 for(const forbidden of ['private diary',token,'secret','signed.example'])assert.ok(!JSON.stringify(logs).includes(forbidden));
 assert.throws(()=>sanitizeTelemetry({events:[{event:'upload-diary'}]}),{status:400});
});
test('logger failure cannot interrupt a validated image ticket',async()=>{
 const {handle}=service({logger:()=>{throw Error('logging down');}});
 assert.equal((await handle(envelope('/api/cos',{objects:[{path:owner+'/'+hash,method:'GET'}]}))).status,200);
});
test('service failures expose only sanitized request IDs and error messages',async()=>{
 const secret='never-show-this-key';const {handle,logs}=service({verifyUser:async()=>{throw Error(secret);}});
 const response=await handle(envelope('/api/cos',{}));assert.equal(response.status,503);
 assert.ok(!JSON.stringify([response,logs]).includes(secret));assert.ok(response.requestId);
});

const modelKey='b'.repeat(64),vector=[1,...Array(1023).fill(0)];
const candidate={id:'asset-1',content:'蓝色车票',contentHash:'c'.repeat(32),lease:reset,epoch:reset};
function searchFixture(options={}){
 const calls=[];
 const rpc=async(name,_token,args)=>{
   calls.push([name,args]);
   if(name==='shiye_platform_capabilities_v1')return options.capabilities??{vector:true,vectorModels:[modelKey]};
   if(name==='shiye_search_budget_v1')return {allowed:options.budget!==false};
   if(name==='shiye_search_candidates_v1')return options.candidates??[candidate];
   if(name==='shiye_search_index_put_v1')return options.receipt??{indexed:1,stale:0};
   return {results:[],mode:name.includes('vectors')?'semantic':'keyword'};
 };
 const embed=async input=>{calls.push(['embedding',input]);return input.map(()=>vector);};
 return {calls,search:createSearchService({rpc,embed,modelKey:options.unconfigured?null:modelKey})};
}
test('keyword search never calls a model or consumes embedding quota',async()=>{
 const {calls,search}=searchFixture({unconfigured:true});await search.search(token,{query:'蓝色'});
 assert.deepEqual(calls.map(c=>c[0]),['shiye_search_assets_v1']);
});
test('semantic calls are blocked before billing when vector SQL or model registration is missing',async()=>{
 for(const capabilities of [{vector:false,vectorModels:[]},{vector:true,vectorModels:['a'.repeat(64)]}]){
  const {calls,search}=searchFixture({capabilities});
  await assert.rejects(search.search(token,{query:'蓝色',mode:'semantic'}),{code:'VECTOR_NOT_READY'});
  assert.deepEqual(calls.map(c=>c[0]),['shiye_platform_capabilities_v1']);
 }
});
test('persistent quota is checked before invoking the paid model',async()=>{
 const {calls,search}=searchFixture({budget:false});
 await assert.rejects(search.search(token,{query:'蓝色',mode:'semantic'}),{code:'VECTOR_BUDGET'});
 assert.deepEqual(calls.map(c=>c[0]),['shiye_platform_capabilities_v1','shiye_search_budget_v1']);
});
test('semantic search binds registered model, vector and normalized filters',async()=>{
 const {calls,search}=searchFixture();await search.search(token,{query:' ＡＢＣ ',mode:'hybrid',kind:'paper',limit:7});
 assert.deepEqual(calls.map(c=>c[0]),['shiye_platform_capabilities_v1','shiye_search_budget_v1','embedding','shiye_search_vectors_v1']);
 const args=calls.at(-1)[1];assert.equal(args.p_query,'ABC');assert.equal(args.p_kind,'paper');
 assert.equal(args.p_model_key,modelKey);assert.equal(args.p_limit,7);assert.equal(args.p_hybrid,true);
 assert.deepEqual(JSON.parse(args.p_embedding),vector);
});
test('an empty claim does not call the model',async()=>{
 const {calls,search}=searchFixture({candidates:[]});const result=await search.index(token,{});
 assert.equal(result.claimed,0);assert.ok(!calls.some(c=>c[0]==='embedding'));
});
test('index writeback preserves source hash, lease and account epoch',async()=>{
 const {calls,search}=searchFixture();const result=await search.index(token,{});
 assert.equal(result.indexed,1);const item=calls.at(-1)[1].p_items[0];
 assert.equal(item.content_hash,candidate.contentHash);assert.equal(item.lease,candidate.lease);assert.equal(item.epoch,candidate.epoch);
});
test('stale index acknowledgements are explicit and not counted as indexed',async()=>{
 const {search}=searchFixture({receipt:{indexed:0,stale:1}});assert.equal((await search.index(token)).stale,1);
});
test('incomplete index receipts are errors rather than silent zero-index successes',async()=>{
 for(const receipt of [{},{indexed:0,stale:0},{indexed:-1,stale:2},{indexed:'1',stale:0}]){
  const {search}=searchFixture({receipt});await assert.rejects(search.index(token),{code:'INDEX_RESPONSE'});
 }
});
test('duplicate, oversize or malformed lease candidates do not reach a model',async()=>{
 for(const candidates of [[candidate,candidate],[{...candidate,lease:'bad'}],[{...candidate,content:'x'.repeat(2049)}],[null]]){
  const {calls,search}=searchFixture({candidates});await assert.rejects(search.index(token),{code:'INDEX_RESPONSE'});
  assert.ok(!calls.some(c=>c[0]==='embedding'));
 }
});

test('release audit catches remaining providers without printing source or secrets',async()=>{
 const {auditCloudBase}=await import('../scripts/audit-cloudbase-platform.mjs');
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'shiye-platform-audit-'));
 try{
  await mkdir(join(root,'src'));await writeFile(join(root,'src/old.js'),"const key=process.env.SHIYE_SUPABASE_KEY; // do-not-print-secret\n");
  await writeFile(join(root,'vercel.json'),'{}');const result=await auditCloudBase(root);
  assert.equal(result.ok,false);assert.ok(result.findings.length>=2);
  assert.ok(!JSON.stringify(result).includes('do-not-print-secret'));
 }finally{await rm(root,{recursive:true,force:true});}
});
