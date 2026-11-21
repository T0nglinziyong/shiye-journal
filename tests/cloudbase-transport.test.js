import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudFunctionTransport,withRequestDeadline} from '../src/cloud-function-transport.js';
const token='valid-token-for-cloudbase-tests';
const session=async()=>({data:{session:{access_token:token}}});
const success=body=>({result:{version:1,status:200,body,requestId:'trace-id'}});

test('business calls use the CloudBase event function, never the static hosting /api path',async()=>{
 let seen,network=0;
 const request=createCloudFunctionTransport({invoke:async args=>{seen=args;return success({tickets:[]});},getSession:session,network:async()=>{network++;}});
 const response=await request('/api/cos',{method:'POST',body:JSON.stringify({objects:[]})});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{tickets:[]});
 assert.equal(network,0);assert.equal(seen.name,'shiye-api');assert.equal(seen.parse,true);
 assert.equal(seen.data.authorization,'Bearer '+token);assert.equal(seen.data.route,'/api/cos');
 assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('signed COS transfers bypass the function without reading a session',async()=>{
 let auth=0;const image=new Blob(['actual pixel bytes']);
 const request=createCloudFunctionTransport({invoke:async()=>assert.fail(),getSession:async()=>{auth++;},network:async(url,init)=>{
  assert.equal(url,'https://bucket.example/image?signature=signed');assert.equal(init.body,image);return new Response('ok');
 }});
 await request('https://bucket.example/image?signature=signed',{method:'PUT',body:image});assert.equal(auth,0);
});
test('unsupported routes, wrong methods, image bodies and invalid credentials fail closed',async()=>{
 let invocations=0;
 const request=createCloudFunctionTransport({invoke:async()=>{invocations++;},getSession:session});
 await assert.rejects(request('/api/anything',{method:'POST'}),{status:404});
 await assert.rejects(request('/api/cos',{method:'DELETE'}),{status:405});
 await assert.rejects(request('/api/cos',{method:'POST',body:new Blob(['image'])}),{status:400});
 await assert.rejects(request('/api/cos',{method:'POST',headers:{Authorization:'Bearer nope'},body:'{}'}),{status:401});
 await assert.rejects(request('/api/cos',{method:'POST',body:'{"a":"'+ 'a'.repeat(262144)+'"}'}),{status:413});
 assert.equal(invocations,0);
});
test('malformed function output is not treated as successful API JSON',async()=>{
 for(const result of [{},'<html>static fallback</html>',{version:1,status:200,body:[]}]){
  const request=createCloudFunctionTransport({getSession:session,invoke:async()=>({result})});
  await assert.rejects(request('/api/platform-health'),{status:502});
 }
});
test('function API errors retain their status and correlation ID',async()=>{
 const request=createCloudFunctionTransport({getSession:session,invoke:async()=>({result:JSON.stringify({version:1,status:403,body:{error:'拒绝'},requestId:'trace'})})});
 const response=await request('/api/platform-health');assert.equal(response.status,403);
 assert.equal(response.headers.get('X-Shiye-Request-Id'),'trace');
});
test('cancellation and deadline never retry mutating calls or produce unhandled rejections',async()=>{
 let invoke=0,rejectLate;const controller=new AbortController();
 const request=createCloudFunctionTransport({getSession:session,invoke:()=>{invoke++;return new Promise((_,reject)=>{rejectLate=reject;});}});
 const task=request('/api/search-index',{method:'POST',body:'{}',signal:controller.signal});
 await new Promise(resolve=>setTimeout(resolve,2));controller.abort();
 await assert.rejects(task,{name:'AbortError'});rejectLate(Error('late rejection'));
 await new Promise(resolve=>setTimeout(resolve,2));assert.equal(invoke,1);
 await assert.rejects(withRequestDeadline(()=>new Promise(()=>{}),{timeoutMs:2}),{status:504});
 const abort=new AbortController();abort.abort();let called=false;
 await assert.rejects(withRequestDeadline(()=>{called=true;},{signal:abort.signal}),{name:'AbortError'});assert.equal(called,false);
});
