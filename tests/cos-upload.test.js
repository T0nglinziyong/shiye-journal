import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadCOSObject} from '../src/cos-upload.js';
function fixture(){
  let now=0,id=0;const timers=new Map();
  const xhr={upload:{},open(){},setRequestHeader(){},send(){},abort(){this.aborted=true;this.onabort();},getResponseHeader(){return 'safe-request-id';}};
  const setTimer=(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;};
  const clearTimer=id=>timers.delete(id);
  const tick=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
  const task=uploadCOSObject('https://example.test/signed-secret',{
    body:new Blob(['0123456789']),idleTimeoutMs:30,totalTimeoutMs:200,xhrFactory:()=>xhr,setTimer,clearTimer});
  return {xhr,tick,task,timers};
}
test('slow PUT with advancing bytes survives the old total timeout and finishes',async()=>{
  const {xhr,tick,task,timers}=fixture();
  tick(20);xhr.upload.onprogress({loaded:2});
  tick(20);xhr.upload.onprogress({loaded:5});
  tick(20);xhr.upload.onload();
  tick(20);xhr.status=200;xhr.onload();
  const response=await task;
  assert.equal(response.ok,true);assert.equal(response.transfer.loaded,10);
  assert.equal(response.transfer.phase,'response');assert.equal(timers.size,0);
  assert.ok(!xhr.aborted);
});
test('stalled upload stops, reports the actual phase and releases timers',async()=>{
  const {xhr,tick,task,timers}=fixture();
  xhr.upload.onprogress({loaded:4});tick(31);
  await assert.rejects(task,error=>error.name==='TimeoutError'&&error.transfer.loaded===4&&error.transfer.phase==='uploading');
  assert.equal(xhr.aborted,true);assert.equal(timers.size,0);
});
test('completed bytes with no response are reported separately from a connection stall',async()=>{
  const {xhr,tick,task}=fixture();xhr.upload.onload();tick(31);
  await assert.rejects(task,error=>error.transfer.phase==='response'&&error.transfer.loaded===10);
});
test('network failure and HTTP failure retain safe transport details',async()=>{
  const first=fixture();first.xhr.onerror();
  await assert.rejects(first.task,error=>error.name==='NetworkError'&&error.transfer.phase==='connecting');
  const second=fixture();second.xhr.status=403;second.xhr.onload();
  const response=await second.task;assert.equal(response.ok,false);assert.equal(response.status,403);
});

test('full byte PUT with unreadable status is ambiguous and retains a safe diagnostic code',async()=>{
 const {xhr,task}=fixture();xhr.upload.onload();xhr.onerror();
 await assert.rejects(task,error=>error.code==='SHIYE_COS_NO_RESPONSE'&&error.responseUnknown===true&&error.transfer.loaded===10);
});
test('XHR load status zero is treated as an unconfirmed upload, not a successful PUT',async()=>{
 const {xhr,task}=fixture();xhr.upload.onload();xhr.status=0;xhr.onload();
 await assert.rejects(task,error=>error.code==='SHIYE_COS_NO_RESPONSE'&&error.transfer.phase==='response');
});
