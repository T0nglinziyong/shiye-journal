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

test('decoded node cache does not steal preview-owned DOM images',()=>{
 const env=environment();const root=document.createElement('div');document.body.append(root);
 try{
  root.innerHTML='<div data-preview-cache-owned><img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="></div>';
  const img=root.querySelector('img');
  Object.defineProperties(img,{complete:{value:true},naturalWidth:{value:10},naturalHeight:{value:10}});
  const nodes=new ImageNodeCache();
  nodes.remember([img]);assert.equal(nodes.pixels,0);nodes.dispose();
 }finally{env.close();}
});

test('works list keeps its decoded sheet when navigating away and back',()=>{
 const env=environment();try{
  const view=document.createElement('div'),state={accountId:'a',route:'works'};document.body.append(view);
  const markup='<div class="works-grid"><button data-act="open-project" data-id="p"><div class="thumb-sheet"><img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="cover"></div></button></div>';
  view.innerHTML=markup;reusePagePreviews({view,state});const first=view.querySelector('.thumb-sheet');
  view.innerHTML='';view.innerHTML=markup;reusePagePreviews({view,state});
  assert.equal(view.querySelector('.thumb-sheet'),first);
 }finally{env.close();}
});

test('image loader accepts exact display pixels without applying DPR or screen scaling twice',async()=>{
  const env=environment(),root=document.createElement('div'),requests=[];document.body.append(root);
  const loader=mountPrivateImages({root,db:{
    previewBlob:async(_id,pixels)=>{requests.push(pixels);return new Blob(['image']);},
    get:async()=>({data:new Blob(['original'])})
  },urls:new Map(),onError:()=>{}});
  try{await loader.load('display',721);assert.deepEqual(requests,[960]);}
  finally{loader.dispose();env.close();}
});
test('route cover signature is stable from image placeholder to hydrated Blob URL',()=>{
  const env=environment(),view=document.createElement('div');document.body.append(view);
  const hydrated='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=#asset';
  const unbind=bindImageResources({
    source:id=>id==='asset'?hydrated:'',
    identity:source=>source===hydrated?{id:'asset',version:1}:null
  });
  const markup=src=>'<div class="works-grid"><button data-act="open-project" data-id="work"><div class="thumb-sheet"><img src="'+src+'" alt="作品封面"></div></button></div>';
  try{
    view.innerHTML=markup('data:image/svg+xml,%3Csvg/%3E#shiye-image=asset');
    reusePagePreviews({view,state:{accountId:'a',route:'works'}});
    view.innerHTML=markup(hydrated);
    reusePagePreviews({view,state:{accountId:'a',route:'works'}});
    assert.equal(view.querySelector('img').getAttribute('src'),hydrated);
    const warmed=view.querySelector('.thumb-sheet');
    view.innerHTML=markup(hydrated);
    reusePagePreviews({view,state:{accountId:'a',route:'works'}});
    assert.ok(view.querySelector('.thumb-sheet')===warmed,'cached preview node should be reused');
  }finally{unbind();env.close();}
});

test('catalog source remains COS thumbnail even after the original has been loaded',async()=>{
 const env=environment(),root=document.createElement('div'),calls={original:0,low:0,high:0};document.body.append(root);
 const loader=mountPrivateImages({root,urls:new Map(),onError:()=>{},db:{
   get:async()=>{calls.original++;return {data:new Blob(['original'])};},
   previewBlob:async(_id,pixels)=>{if(pixels===480)calls.low++;else calls.high++;return new Blob(['thumbnail-'+pixels]);}
 }});
 try{
   const original=await loader.load('material',true);
   assert.ok(original.startsWith('blob:'));
   assert.match(imagePlaceholder('material'),/#shiye-image=/,'a full original cannot become a catalog cover');
   const low=await loader.load('material',false);
   assert.ok(low.startsWith('blob:'));assert.notEqual(low,original);
   assert.equal(imagePlaceholder('material'),low);
   assert.deepEqual(calls,{original:1,low:1,high:0});
   assert.equal(await loader.load('material',false),low,'returning to a list reuses its low cover');
 }finally{loader.dispose();env.close();}
});


test('a cached higher variant satisfies all smaller tiers without network and survives viewport downsizing',async()=>{
 const env=environment(),root=document.createElement('div'),requests=[];document.body.append(root);
 const loader=mountPrivateImages({root,urls:new Map(),onError:()=>{},db:{
   previewBlob:async(_id,pixels)=>{requests.push(pixels);return new Blob(['image-'+pixels]);},
   get:async()=>({data:new Blob(['original'])})
 }});
 try{
   const large=await loader.load('already-big',1200);
   assert.equal(await loader.load('already-big',600),large);
   const cover=await loader.load('already-big',false);
   assert.notEqual(cover,large,'the existing high image is converted to a compact card cover');
   assert.deepEqual(requests,[1200,480]);
 }finally{loader.dispose();env.close();}
});
test('a low-tier cached preview is displayed until one correctly quantized higher tier completes',async()=>{
 const env=environment(),root=document.createElement('div'),requests=[];document.body.append(root);
 let releaseHigh;
 const gate=new Promise(resolve=>releaseHigh=resolve);
 const loader=mountPrivateImages({root,urls:new Map(),onError:()=>{},db:{
   previewBlob:async(_id,pixels)=>{requests.push(pixels);if(pixels===960)await gate;return new Blob(['image-'+pixels]);},
   get:async()=>({data:new Blob(['original'])})
 }});
 try{
   const low=await loader.load('upgrade',360);
   const highPending=loader.load('upgrade',721); // snaps up to 960
   await tick();
   assert.equal(imagePlaceholder('upgrade'),low,'best cached 360px remains available during upgrade');
   releaseHigh();
   const high=await highPending;
   assert.notEqual(high,low);
   assert.equal(imagePlaceholder('upgrade'),high,'high tier takes precedence as soon as available');
   assert.equal(await loader.load('upgrade',720),high,'a 720px request uses cached 960px');
   assert.deepEqual(requests,[360,960]);
 }finally{releaseHigh?.();loader.dispose();env.close();}
});

test('selected detail starts while two tablet gallery reads are still occupied',async()=>{
 const env=environment(),root=document.createElement('div'),started=[],releases=new Map();
 document.body.append(root);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
 Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:query=>({matches:query.includes('min-width: 700px')})});
 const loader=mountPrivateImages({root,urls:new Map(),onError:()=>{},db:{
   previewBlob:(id,pixels)=>{started.push([id,pixels]);return new Promise(resolve=>releases.set(id+':'+pixels,()=>resolve(new Blob([id]))));},
   get:async()=>null
 }});
 try{
   const a=loader.load('first'),b=loader.load('second');
   await until(()=>started.length===2);
   const stale=loader.load('old-list');
   loader.focus('selected');
   const sharp=loader.load('selected',960);
   assert.deepEqual(started[2],['selected',480],'the detail cover starts immediately in its reserved slot');
   await until(()=>started.some(([id,pixels])=>id==='selected'&&pixels===960));
   assert.equal(started[3][1],960,'sharp detail starts without waiting for its cover download');
   assert.ok(!started.some(([id])=>id==='old-list'));
   releases.get('selected:480')();
   assert.ok(!started.some(([id])=>id==='old-list'),'the old gallery request remains queued');
   for(const key of ['first:480','second:480','selected:960'])releases.get(key)();
   await until(()=>started.some(([id])=>id==='old-list'));
   releases.get('old-list:480')();
   await Promise.all([a,b,stale,sharp]);
 }finally{
   for(const release of releases.values())release();loader.dispose();env.close();
   if(previous)Object.defineProperty(globalThis,'matchMedia',previous);else delete globalThis.matchMedia;
 }
});

test('fast scrolling starts the new visible cover ahead of offscreen reads',async()=>{
 const env=environment(),root=document.createElement('div'),started=[],releases=new Map();document.body.append(root);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
 Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:query=>({matches:query.includes('min-width: 700px')})});
 const image=(id,top)=>{const img=document.createElement('img');img.dataset.privateImageId=id;
   img.getBoundingClientRect=()=>({top,bottom:top+100,left:0,right:100,width:100,height:100});root.append(img);};
 const loader=mountPrivateImages({root,urls:new Map(),onError:()=>{},db:{
   previewBlob:id=>{started.push(id);return new Promise(resolve=>releases.set(id,()=>resolve(new Blob([id]))));},
   get:async()=>null
 }});
 try{
   image('old-a',-900);image('old-b',-900);image('new-a',50);image('new-b',150);
   const a=loader.load('old-a'),b=loader.load('old-b');await until(()=>started.length===2);
   const near=loader.load('new-a'),next=loader.load('new-b');
   await until(()=>started.includes('new-b'));
   assert.deepEqual(started,['old-a','old-b','new-a','new-b']);
   releases.get('new-a')();await near;
   for(const id of ['old-a','old-b','new-b'])releases.get(id)();
   await Promise.all([a,b,next]);
 }finally{for(const release of releases.values())release();loader.dispose();env.close();
   if(previous)Object.defineProperty(globalThis,'matchMedia',previous);else delete globalThis.matchMedia;}
});

test('page switch drops queued covers for detached cards before starting the new page',async()=>{
 const env=environment(),root=document.createElement('div'),started=[],releases=new Map();document.body.append(root);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
 Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:query=>({matches:query.includes('min-width: 700px')})});
 const image=(id,top)=>{const img=document.createElement('img');img.dataset.privateImageId=id;
   img.getBoundingClientRect=()=>({top,bottom:top+100,left:0,right:100,width:100,height:100});root.append(img);return img;};
 const loader=mountPrivateImages({root,urls:new Map(),onError:()=>{},db:{
   previewBlob:id=>{started.push(id);return new Promise(resolve=>releases.set(id,()=>resolve(new Blob([id]))));},
   get:async()=>null
 }});
 try{
   const a=loader.load('active-a'),b=loader.load('active-b');await until(()=>started.length===2);
   const oldCard=image('old-page',-900),old=loader.load('old-page',false,{ephemeral:true});
   oldCard.remove();image('new-page',30);const fresh=loader.load('new-page');
   assert.equal(await old,'');
   releases.get('active-a')();releases.get('active-b')();
   await until(()=>started.includes('new-page'));
   assert.ok(!started.includes('old-page'));
   releases.get('new-page')();await Promise.all([a,b,fresh]);
 }finally{for(const release of releases.values())release();loader.dispose();env.close();
   if(previous)Object.defineProperty(globalThis,'matchMedia',previous);else delete globalThis.matchMedia;}
});
