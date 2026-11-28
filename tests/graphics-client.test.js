import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateGraphics} from '../src/graphics-client.js';

test('graphics worker cleans up constructor, clone, cancel and timeout failures',async()=>{
 const OldWorker=globalThis.Worker,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 let created=0,revoked=0,terminated=0,listener=null,mode='clone';
 URL.createObjectURL=()=>{created++;return 'blob:fixture';};URL.revokeObjectURL=()=>revoked++;
 globalThis.Worker=class{constructor(){if(mode==='constructor')throw Error('worker unavailable');listener=this;}postMessage(){if(mode==='clone')throw Error('not cloneable');}terminate(){terminated++;}};
 try{
  const already=new AbortController();already.abort(Error('pre-aborted'));await assert.rejects(calculateGraphics({}, {signal:already.signal}),/pre-aborted/);assert.equal(created,0);
  mode='constructor';await assert.rejects(calculateGraphics({}),/worker unavailable/);assert.equal(revoked,1);
  mode='clone';await assert.rejects(calculateGraphics({}),/not cloneable/);assert.equal(terminated,1);assert.equal(revoked,2);
  mode='hang';const abort=new AbortController(),p=calculateGraphics({}, {signal:abort.signal});abort.abort(Error('cancelled'));await assert.rejects(p,/cancelled/);assert.equal(terminated,2);
  listener.onmessage({data:{ok:true,result:{}}});assert.equal(terminated,2);
  await assert.rejects(calculateGraphics({}, {timeout:5}),/超时/);assert.equal(terminated,3);assert.equal(created,revoked);
 }finally{globalThis.Worker=OldWorker;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
