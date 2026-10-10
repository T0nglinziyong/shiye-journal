import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalWorkCovers} from '../src/work-cover-local-cache.js';
import {needsWorkCover} from '../src/work-cover-backfill.js';

const work=(updatedAt='2026-10-09T13:00:00Z')=>({
  id:'work-A',updatedAt,activeDraftID:'page-A',
  drafts:[{id:'page-A',canvas:{width:650,height:1000},items:[{assetID:'p'}],strokes:[]}]
});
const factory=({state,device,draw,ready,error})=>createLocalWorkCovers({
  state,deviceRecords:device,loadDocument:async p=>p,renderCover:draw,
  onReady:ready||(()=>{}),onError:error||(()=>{}),
  createURL:()=> 'blob:local-cover',revokeURL:()=>{}
});
test('new blank or imported work shows local 720px snapshot independent of cloud upload',async()=>{
  const original=work(),state={accountId:'account',projects:[original],route:'works'};
  const saved=new Map(),calls=[],events=[],preview=new Blob(['720px scene'],{type:'image/webp'});
  const device={get:async(_a,id)=>saved.get(id),put:async(_a,item)=>saved.set(item.id,item)};
  const covers=factory({state,device,draw:async p=>{calls.push(p.id);return preview;},
    ready:(p,url)=>events.push([p.id,url])});
  assert.equal(needsWorkCover(original),true);
  assert.equal(await covers.ensure(original),preview);
  assert.equal(covers.peek(original),'blob:local-cover');
  assert.deepEqual(events,[['work-A','blob:local-cover']]);
  assert.deepEqual(calls,['work-A']);
  assert.equal(await covers.ensure(original),preview);
  assert.deepEqual(calls,['work-A'],'one render per project revision');
  assert.equal(saved.get('work-cover:720:work-A')?.updatedAt,original.updatedAt);
  assert.equal(saved.get('work-cover:720:work-A')?.blob,preview);
});
test('return visits recover local complete cover after reload; new revision invalidates old thumbnail',async()=>{
  const records=new Map(),device={
    get:async(_account,id)=>records.get(id),
    put:async(_account,item)=>records.set(item.id,item)
  };
  const state={accountId:'account',route:'works',projects:[work()]},rendered=[];
  const covers=factory({state,device,draw:async()=>new Blob(['first'],{type:'image/webp'})});
  await covers.ensure(state.projects[0]);
  await new Promise(resolve=>setImmediate(resolve));
  const reboot=factory({state,device,draw:async()=>{rendered.push('draw');return new Blob(['second']);}});
  await reboot.ensure(state.projects[0]);
  assert.deepEqual(rendered,[],'refresh reuses the local cached WebP');
  state.projects=[work('revision-2')];
  await reboot.ensure(state.projects[0]);
  assert.deepEqual(rendered,['draw'],'changed complete scenes must be rendered again');
});
test('failed COS upload does not prevent local display and never affects project data',async()=>{
  const p=work(),original=structuredClone(p),state={accountId:'account',route:'works',projects:[p]};
  let shown=false;
  const covers=factory({state,device:{get:async()=>null,put:async()=>{}},
    draw:async()=>new Blob(['cover']),ready:()=>{shown=true;}});
  await covers.ensure(p);
  assert.equal(shown,true);
  assert.deepEqual(p,original);
});
