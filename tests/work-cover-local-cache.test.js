import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalWorkCovers} from '../src/work-cover-local-cache.js';
import {needsWorkCover} from '../src/work-cover-backfill.js';
import {renderWorkCoverSnapshot} from '../src/work-cover-snapshot.js';

const work=(updatedAt='2026-10-09T13:00:00Z')=>({
  id:'work-A',updatedAt,activeDraftID:'page-A',
  drafts:[{id:'page-A',canvas:{width:650,height:1000},items:[{assetID:'p'}],strokes:[]}]
});
const factory=({state,device,draw,ready,error,hasUsableCover})=>createLocalWorkCovers({
  state,deviceRecords:device,loadDocument:async p=>p,renderCover:draw,
  hasUsableCover,
  onReady:ready||(()=>{}),onError:error||(()=>{}),
  createURL:()=> 'blob:local-cover',revokeURL:()=>{}
});
test('an unreadable remote cover triggers a local scene cover for the visible card',async()=>{
  const p=work(),state={accountId:'account',route:'works',projects:[p]};
  p.drafts[0].coverImageID='project-cover:cos:missing-preview480.webp';
  let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
  const covers=factory({state,device:{get:async()=>null,put:async()=>{}},
    hasUsableCover:()=>false,draw:async()=>new Blob(['local cover']),
    ready:()=>resolveReady()});
  const dispose=covers.observe({querySelectorAll:()=>[{dataset:{id:p.id}}]});
  await ready;
  assert.equal(covers.peek(p),'blob:local-cover');
  dispose();covers.dispose();
});
test('new blank or imported work shows local 480px snapshot independent of cloud upload',async()=>{
  const original=work(),state={accountId:'account',projects:[original],route:'works'};
  const saved=new Map(),calls=[],events=[],preview=new Blob(['480px scene'],{type:'image/webp'});
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
  assert.equal(saved.get('work-cover:480:work-A')?.updatedAt,original.updatedAt);
  assert.equal(saved.get('work-cover:480:work-A')?.blob,preview);
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
test('a visible card restores its saved cover before scheduling a scene render',async()=>{
  const p=work(),state={accountId:'account',route:'works',projects:[p]};
  const cached=new Blob(['saved cover'],{type:'image/webp'}),draws=[];
  let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
  const covers=factory({state,device:{
    get:async()=>({updatedAt:p.updatedAt,blob:cached}),put:async()=>{}
  },draw:async()=>{draws.push('render');return new Blob(['rendered']);},
  ready:()=>resolveReady()});
  try{
    const dispose=covers.observe({querySelectorAll:()=>[{dataset:{id:p.id}}]});
    await ready;
    assert.equal(covers.peek(p),'blob:local-cover');
    assert.deepEqual(draws,[]);
    dispose();
  }finally{covers.dispose();}
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
test('partial cover displays immediately but is not persisted as the final thumbnail',async()=>{
  const p=work(),state={accountId:'account',route:'works',projects:[p]};
  const saved=[],events=[];
  let restored=false;
  const covers=factory({state,device:{get:async()=>null,put:async(_owner,row)=>saved.push(row)},
    draw:async()=>renderWorkCoverSnapshot({id:'cover',activeDraftID:'d',drafts:[
      {id:'d',sceneVersion:2,canvas:{width:600,height:800},layers:[{id:'m',type:'material',assetID:'a'}]}]}, {
      resolveAsset:async()=>restored?{id:'a',blobId:'b'}:null,
      previewBlob:async()=>new Blob(['image']),createBitmap:async()=>({width:1,height:1}),
      createMissingImage:()=>({width:1,height:1}),
      renderScene:async(_draft,{loadMaterialImage})=>{
        await loadMaterialImage('a');return {canvas:{toBlob:callback=>callback(new Blob(['cover']))}};
      }
    }),ready:(_project,url)=>events.push(url)});
  try{
    const first=await covers.ensure(p);
    assert.equal(first.size>0,true);
    assert.equal(saved.length,0);
    restored=true;
    const full=await covers.ensure(p,{refresh:true});
    assert.equal(full.size>0,true);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(saved.length,1);
    assert.equal(events.length,2);
  }finally{covers.dispose();}
});
