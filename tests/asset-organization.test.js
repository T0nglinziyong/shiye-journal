import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createAssetOrganization,mountOrganizationBadges,syncOrganizationBadges} from '../src/asset-organization.js';
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('organization tracks each saved asset, waits for cloud ACK without blocking, continues after a model failure',async()=>{
  const activity=createAssetOrganization(),saved=gate(),first=gate(),second=gate();let calls=0,errors=0;
  const task=activity.run([{id:'a'},{id:'b'}],{waitForSave:()=>saved.promise,organize:async()=>{calls++;await(calls===1?first:second).promise;},onError:()=>errors++});
  assert.equal(activity.status('a'),'queued');assert.equal(activity.status('b'),'queued');assert.equal(calls,0);
  saved.resolve();await Promise.resolve();assert.equal(activity.status('a'),'running');assert.equal(activity.status('b'),'queued');
  first.reject(Error('offline'));await new Promise(r=>setImmediate(r));assert.equal(activity.status('a'),'failed');assert.equal(activity.status('b'),'running');
  second.resolve();await task;assert.equal(activity.status('b'),undefined);assert.equal(errors,1);
});
test('failed save does not call the paid model or leave indefinite busy badges',async()=>{
  const activity=createAssetOrganization();let calls=0;
  await activity.run([{id:'a'},{id:'b'}],{waitForSave:async()=>{throw Error('upload');},organize:async()=>calls++});
  assert.equal(calls,0);assert.equal(activity.status('a'),'failed');assert.equal(activity.status('b'),'failed');
});
test('preview badges survive route replacement and update without replacing images or breaking selection',async()=>{
  const window=new Window(),root=window.document.createElement('main');window.document.body.append(root);
  root.innerHTML='<button class="card batch-selected"><div class="card-image"><img data-asset-image-id="a" src="test.png"></div></button>';
  const activity=createAssetOrganization(),save=gate(),model=gate(),dispose=mountOrganizationBadges(root,activity);
  const task=activity.run([{id:'a'}],{waitForSave:()=>save.promise,organize:()=>model.promise});
  const image=root.querySelector('img');assert.equal(root.querySelector('[role=status]').textContent,'等待整理');
  save.resolve();await Promise.resolve();assert.equal(root.querySelector('[role=status]').textContent,'正在整理');assert.equal(root.querySelector('img'),image);assert.ok(root.querySelector('.batch-selected'));
  root.innerHTML='<div class="detail-picture"><img data-asset-image-id="a" src="test.png"></div>';
  await new Promise(r=>setTimeout(r,10));assert.equal(root.querySelector('[role=status]').textContent,'正在整理');
  model.resolve();await task;assert.equal(root.querySelector('[role=status]'),null);
  syncOrganizationBadges(root,activity);dispose();await window.happyDOM.abort();
});
