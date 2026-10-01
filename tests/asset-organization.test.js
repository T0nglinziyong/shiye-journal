import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createAssetOrganization,mountOrganizationBadges,syncOrganizationBadges,updateOrganizedAssetView} from '../src/asset-organization.js';
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
test('a finished asset updates only its visible card, detail, and matching title without replacing images',async()=>{
  const window=new Window(),root=window.document.createElement('main');window.document.body.append(root);
  root.innerHTML='<button class="card batch-selected" data-id="a"><div class="card-image"><img data-asset-image-id="a" src="test.png"></div><div class="card-body"><h3>素材 1<span class="basket-card-check">✓</span></h3><p>贴纸 · 尺寸待确认</p><span class="chip warn">待检查</span></div></button><button class="card" data-id="b"><div class="card-body"><h3>素材 2</h3></div></button><div class="match-basket-item"><img data-asset-image-id="a" src="test.png"><strong>素材 1</strong></div><section class="detail-page"><img data-asset-image-id="a" src="test.png"><div class="detail-copy"><h1>素材 1</h1><div class="detail-facts"><div></div><div></div><div><span>贴纸</span></div><div><span>陪衬</span></div><div><span>待记录</span></div></div><div class="detail-tags"></div></div></section>';
  const image=root.querySelector('.card img'),other=root.querySelector('.card[data-id=b]');
  updateOrganizedAssetView(root,{id:'a',title:'蓝色纸片',kind:'paper',role:'background',texture:'纸张',tags:['蓝色'],contentTags:['星星'],physicalWidthMM:20,physicalHeightMM:30,reviewStatus:'ready'},{kindName:()=> '纸张',formatSize:n=>String(n)});
  assert.equal(root.querySelector('.card[data-id=a] h3').textContent,'蓝色纸片✓');assert.equal(root.querySelector('.card[data-id=a] .chip').textContent,'已整理');
  assert.equal(root.querySelector('.detail-page h1').textContent,'蓝色纸片');assert.equal(root.querySelector('.detail-tags').textContent,'蓝色星星');assert.equal(root.querySelector('.match-basket-item strong').textContent,'蓝色纸片');
  assert.equal(root.querySelector('.card[data-id=a] img'),image);assert.equal(root.querySelector('.card[data-id=b]'),other);assert.ok(root.querySelector('.card[data-id=a]').classList.contains('batch-selected'));
  await window.happyDOM.abort();
});
