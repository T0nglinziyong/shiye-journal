import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {BoundedValueCache,reusePagePreviews,clearPreviewContentCache,previewCacheStats} from '../src/preview-content-cache.js';
import {bindImageResources,notifyImageInvalidation,cachedImageSource} from '../src/presentation-resources.js';
import {createMatchingCoverCache} from '../src/matching-cover-cache.js';
import {mountPrivateImages,imagePlaceholder} from '../src/lazy-private-images.js';
import {ImageNodeCache} from '../src/image-node-cache.js';

function environment(){
 const win=new Window({url:'http://localhost:5192'}),keys=['window','document','MutationObserver','ResizeObserver','IntersectionObserver','innerWidth','innerHeight'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='window'?win:key==='innerWidth'?1024:key==='innerHeight'?768:key==='IntersectionObserver'?undefined:win[key]});
 return {win,close(){clearPreviewContentCache();win.happyDOM.abort();win.close();for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check){for(let i=0;i<80;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(check(),'async image state did not settle');}

test('matching cover markup is reused on progress updates and invalidated by mutable content',()=>{
 let calls=0;const state={accountId:'a',assets:[{id:'m',blobId:'image',title:'paper'}]};
 const cache=createMatchingCoverCache({state,workCover:p=>{calls++;return JSON.stringify(p.drafts);}});
 const p={id:'p',title:'work',activeDraftID:'d',drafts:[{id:'d',items:[{assetID:'m',x:1}],textBlocks:[{content:'old'}]}]};
 try{
  const a=cache.render(p);assert.equal(cache.render(p),a);assert.equal(calls,1);
  p.drafts[0].textBlocks[0].content='new';assert.notEqual(cache.render(p),a);assert.equal(calls,2);
  state.assets[0].blobId='new-image';cache.render(p);assert.equal(calls,3);
  state.accountId='b';cache.render(p);assert.equal(calls,4);
  notifyImageInvalidation(['new-image']);cache.render(p);assert.equal(calls,5);
 }finally{cache.dispose();}
});
test('warm preview lookup is synchronous and switching routes does not fetch again',async()=>{
 const env=environment();let reads=0;const root=document.createElement('div');document.body.append(root);
 const loader=mountPrivateImages({root,db:{previewBlob:async()=>{reads++;return new Blob(['preview']);},get:async()=>({data:new Blob(['full'])})},urls:new Map(),onError:()=>{}});
 try{
  const source=await loader.load('m');assert.equal(imagePlaceholder('m'),source);assert.equal(reads,1);
  for(let i=0;i<5;i++){root.innerHTML='<img src="'+imagePlaceholder('m')+'">';await tick();}
  assert.equal(reads,1);assert.equal(loader.stats().previews,1);
  loader.invalidate(['m']);assert.ok(imagePlaceholder('m').includes('#shiye-image='));
  const next=await loader.load('m');assert.notEqual(next,source);assert.ok(reads>=2);
 }finally{loader.dispose();env.close();}
});
test('editor display variants reuse a warm low cover without fetching the raw original',async()=>{
 const env=environment();let originals=0,display=0;const root=document.createElement('div');document.body.append(root);
 const loader=mountPrivateImages({root,db:{
   previewBlob:async(_id,pixels)=>{if(pixels>360)display++;return new Blob(['variant:'+pixels]);},
   get:async()=>{originals++;return {data:new Blob(['raw'])};}
 },urls:new Map(),onError:()=>{}});
 try{
   const preview=await loader.load('m');
   const sharp=await loader.load('m',750);
   assert.notEqual(sharp,preview);
   assert.equal(display,1);
   assert.equal(originals,0);
   assert.equal(loader.stats().displayVariants,1);
   assert.equal(await loader.load('m',750),sharp);
 }finally{loader.dispose();env.close();}
});

test('whole invalidation discards in-flight reads even before they have a cached URL',async()=>{
 const env=environment();let finish;const root=document.createElement('div');document.body.append(root);
 const loader=mountPrivateImages({root,db:{previewBlob:()=>new Promise(resolve=>{finish=resolve;}),get:async()=>null},urls:new Map(),onError:()=>{}});
 try{const pending=loader.load('old');loader.invalidate();finish(new Blob(['old']));assert.equal(await pending,'');assert.ok(imagePlaceholder('old').includes('#shiye-image='));}
 finally{loader.dispose();env.close();}
});
