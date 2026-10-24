import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssetOrganization} from '../src/asset-organization.js';
import {createClassificationQueue} from '../src/classification-queue.js';
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('organization waits for cloud ACK, runs three requests at once, and settles each badge independently',async()=>{
  const activity=createAssetOrganization(),saved=gate(),gates=Object.fromEntries('abcd'.split('').map(id=>[id,gate()]));let calls=0,errors=0;
  const task=activity.run('abcd'.split('').map(id=>({id})),{queue:createClassificationQueue(3),waitForSave:()=>saved.promise,organize:async record=>{calls++;await gates[record.id].promise;},onError:()=>errors++});
  assert.deepEqual('abcd'.split('').map(id=>activity.status(id)),['queued','queued','queued','queued']);assert.equal(calls,0);
  saved.resolve();await new Promise(r=>setImmediate(r));assert.deepEqual('abcd'.split('').map(id=>activity.status(id)),['running','running','running','queued']);assert.equal(calls,3);
  gates.b.resolve();await new Promise(r=>setImmediate(r));assert.equal(activity.status('b'),undefined);assert.equal(activity.status('d'),'running');assert.equal(calls,4);
  gates.a.reject(Error('offline'));await new Promise(r=>setImmediate(r));assert.equal(activity.status('a'),'failed');assert.equal(activity.status('c'),'running');
  gates.c.resolve();gates.d.resolve();await task;assert.equal(activity.status('c'),undefined);assert.equal(activity.status('d'),undefined);assert.equal(errors,1);
});
test('manual classifications take the next free slot ahead of queued background calls',async()=>{
  const queue=createClassificationQueue(1),first=gate(),order=[];
  const a=queue.schedule(async()=>{order.push('active');await first.promise;});
  const background=queue.schedule(()=>order.push('background'));
  const manual=queue.schedule(()=>order.push('manual'),{priority:'foreground'});
  first.resolve();await Promise.all([a,background,manual]);assert.deepEqual(order,['active','manual','background']);
});
test('failed save does not call the paid model or leave indefinite busy badges',async()=>{
  const activity=createAssetOrganization();let calls=0;
  await activity.run([{id:'a'},{id:'b'}],{waitForSave:async()=>{throw Error('upload');},organize:async()=>calls++});
  assert.equal(calls,0);assert.equal(activity.status('a'),'failed');assert.equal(activity.status('b'),'failed');
});
test('queued classification is removed on cancellation and frees no network slot',async()=>{
  const queue=createClassificationQueue(1),first=gate(),controller=new AbortController();let calls=0;
  const running=queue.schedule(async()=>{await first.promise;});
  const cancelled=queue.schedule(()=>{calls++;},{signal:controller.signal});
  controller.abort();
  await assert.rejects(cancelled,{name:'AbortError'});
  const next=queue.schedule(()=>{calls++;});
  first.resolve();await Promise.all([running,next]);
  assert.equal(calls,1);
});
test('clearing organization during save prevents later model requests',async()=>{
  const activity=createAssetOrganization(),saved=gate();let calls=0;
  const task=activity.run([{id:'a'}],{waitForSave:()=>saved.promise,organize:async()=>{calls++;}});
  activity.clear();saved.resolve();await task;
  assert.equal(calls,0);assert.equal(activity.status('a'),undefined);
});
