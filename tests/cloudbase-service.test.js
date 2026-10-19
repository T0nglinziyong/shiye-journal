import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudBaseService,sanitizeTelemetry} from '../server/cloudbase/service.mjs';
import {ServiceError} from '../server/cloudbase/errors.mjs';
import {createCloudFunctionTransport} from '../src/cloud-function-transport.js';
import {createCOSStore} from '../src/cos-store.js';
const auth='Bearer valid-token-for-cloudbase-tests';
const hash='a'.repeat(64),owner='cloudbase-user-123',reset='11111111-1111-4111-8111-111111111111';
const envelope=(body,route='/api/cos',method='POST')=>({version:1,route,method,authorization:auth,body});
function setup(options={}){
 const logs=[],signed=[],verified=[];
 const handle=createCloudBaseService({logger:line=>logs.push(JSON.parse(line)),
  verifyUser:async token=>{verified.push(token);return {userID:owner,isAdmin:false,resetId:null};},
  cosReady:true,sign:async request=>{signed.push(request);return 'https://bucket.example/'+request.path+'?signature=secret';},
  rpc:async()=>({schemaVersion:1,keyword:true,vector:false}),...options});
 return {handle,logs,signed,verified};
}

test('authenticated tickets retain existing COS object paths and safe PUT headers',async()=>{
 const {handle,signed,verified}=setup();
 const result=await handle(envelope({objects:[{path:owner+'/'+hash,method:'PUT',type:'image/png'}]}));
 assert.equal(result.status,200);assert.equal(verified.length,1);assert.equal(signed.length,1);
 assert.equal(signed[0].headers['x-cos-forbid-overwrite'],'true');
 assert.equal(signed[0].headers['content-type'],'image/png');
 assert.equal(result.body.expiresIn,60);assert.equal(result.version,1);
});
test('foreign paths, traversal, delete operations and unapproved image variants are rejected',async()=>{
 const {handle,signed}=setup();
 for(const item of [{path:'another-user/'+hash,method:'GET'},
  {path:owner+'/../'+hash,method:'GET'},{path:owner+'/'+hash,method:'DELETE'},
  {path:owner+'/'+hash,method:'GET',variant:'preview100000'},
  {path:owner+'/'+hash,method:'PUT',type:'text/html'}]){
  assert.equal((await handle(envelope({objects:[item]}))).status,403);
 }
 assert.equal(signed.length,0);
});
test('old clients cannot upload into a previous reset generation',async()=>{
 const {handle,signed}=setup({verifyUser:async()=>({userID:owner,resetId:reset})});
 assert.equal((await handle(envelope({objects:[{path:owner+'/'+hash,method:'PUT',type:'image/png'}]}))).status,403);
 assert.equal((await handle(envelope({objects:[{path:owner+'/reset-'+reset+'/'+hash,method:'PUT',type:'image/png'}]}))).status,200);
 assert.equal(signed.length,1);
});
test('auth failures, disabled COS and unknown routes never call the signer',async()=>{
 for(const options of [{verifyUser:async()=>null},{cosReady:false}]){
  const {handle,signed}=setup(options);assert.ok((await handle(envelope({objects:[{path:owner+'/'+hash,method:'GET'}]}))).status>=400);
  assert.equal(signed.length,0);
 }
 const {handle,signed}=setup();
 assert.equal((await handle({...envelope({}),authorization:''})).status,401);
 assert.equal((await handle(envelope({},'/api/account-gc'))).status,404);
 assert.equal((await handle({...envelope({}),version:2})).status,400);
 assert.equal(signed.length,0);
});
test('health distinguishes a missing optional SQL migration from functioning image service',async()=>{
 const {handle}=setup({rpc:async()=>{throw new ServiceError(503,'MIGRATION_REQUIRED','Not applied');}});
 const response=await handle(envelope(null,'/api/platform-health','GET'));
 assert.equal(response.status,200);assert.equal(response.body.cos.configured,true);
 assert.equal(response.body.capabilities.keyword,false);assert.equal(response.body.capabilities.vector,false);
 assert.equal(response.body.accountReset,false);
});
test('service and client metrics log only whitelisted non-content fields',async()=>{
 const {handle,logs}=setup();
 await handle(envelope({objects:[{path:owner+'/'+hash,method:'GET'}]}));
 const data={events:[{event:'sync-failed',status:413,count:3,query:'private diary',token:auth,message:'api-key-secret',url:'https://signed.example'}]};
 const result=await handle(envelope(data,'/api/telemetry'));
 assert.equal(result.body.accepted,1);
 const serialized=JSON.stringify(logs);
 for(const secret of [owner,hash,auth,'private diary','api-key-secret','signed.example','signature=secret'])assert.ok(!serialized.includes(secret),secret);
 assert.ok(logs.some(event=>event.type==='shiye_client_metric'&&event.status===413));
 assert.throws(()=>sanitizeTelemetry({events:[{event:'upload-entire-diary'}]}),{status:400});
});
test('server-side raw error messages cannot leak credentials through API or logs',async()=>{
 const secret='do-not-log-this-server-credential';
 const {handle,logs}=setup({verifyUser:async()=>{throw Error(secret);}});
 const result=await handle(envelope({}));
 assert.equal(result.status,503);assert.ok(!JSON.stringify([result,logs]).includes(secret));
});
test('cross-invocation burst windows are shared and bounded',async()=>{
 const windows=new Map();
 const a=setup({windows}),b=setup({windows});
 for(let index=0;index<4;index++)assert.equal((await (index%2?a:b).handle(envelope({events:[]},'/api/telemetry'))).status,200);
 assert.equal((await a.handle(envelope({events:[]},'/api/telemetry'))).status,429);
});
test('existing COS store uploads and downloads bytes directly through the new CloudBase ticket route',async()=>{
 const {handle,signed}=setup();let functionCalls=0;const files=new Map();
 const client={auth:{getSession:async()=>({data:{session:{access_token:auth.slice(7)}}})}};
 const transport=createCloudFunctionTransport({getSession:client.auth.getSession,
  invoke:async({data,name})=>{assert.equal(name,'shiye-api');functionCalls++;return {result:await handle(data)};},
  network:async(url,init={})=>{
   assert.ok(url.startsWith('https://bucket.example/'));const path=new URL(url).pathname.slice(1);
   if(init.method==='PUT'){
    assert.ok(init.body instanceof Blob);assert.equal(init.headers['x-cos-forbid-overwrite'],'true');
    files.set(path,init.body);return new Response('',{status:200});
   }
   return new Response(files.get(path)||'missing',{status:files.has(path)?200:404});
  }});
 const cos=createCOSStore({client:()=>client,enabled:true,fetcher:transport,uploadRequest:null,ticketBatchDelayMs:0});
 const original=new Blob(['opaque PNG bytes'],{type:'image/png'}),path=owner+'/'+hash;
 await cos.upload(path,original);
 assert.equal(await (await cos.download(path)).text(),await original.text());
 assert.equal(files.size,1);assert.equal(functionCalls,2);assert.equal(signed.length,2);
});
