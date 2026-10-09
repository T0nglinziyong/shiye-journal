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

test('presentation LRU uses value signatures and rejects oversized entries',()=>{
 const cache=new BoundedValueCache({maxEntries:2,maxWeight:10});
 cache.set('a','v1','one',4);cache.set('b','v1','two',4);assert.equal(cache.get('a','v1'),'one');
 cache.set('c','v1','three',4);assert.equal(cache.get('b','v1'),undefined);assert.equal(cache.get('a','v2'),undefined);
 cache.set('a','v2','new',2);assert.equal(cache.get('a','v2'),'new');assert.ok(cache.weight<=10);
 cache.set('large','v1','uncached',20);assert.equal(cache.get('large','v1'),undefined);cache.clear();assert.equal(cache.weight,0);
});
test('presentation resources release only their own active registration',()=>{
 const a=bindImageResources({source:()=> 'a',identity:()=>null});
 const b=bindImageResources({source:()=> 'b',identity:()=>null});
 a();assert.equal(cachedImageSource('x'),'b');b();assert.equal(cachedImageSource('x'),'');
});
test('series and work covers reuse detached content but not stale scenes or another account',()=>{
 const env=environment();try{
  const view=document.createElement('div');document.body.append(view);const state={accountId:'alice',route:'series'};
  const show=(title='A')=>{view.innerHTML=`<button data-act="series-detail" data-id="s"><div class="series-cover"><span>${title}</span></div></button>`;reusePagePreviews({view,state});return view.querySelector('.series-cover');};
  const first=show();view.innerHTML='';const second=show();assert.equal(second,first);assert.ok(previewCacheStats().hits>0);
  const changed=show('B');assert.notEqual(changed,first);assert.equal(changed.textContent,'B');
  state.accountId='bob';assert.notEqual(show('B'),changed);
  const cover=view.querySelector('.series-cover');notifyImageInvalidation(null);view.innerHTML='';assert.notEqual(show('B'),cover);
 }finally{env.close();}
});
test('cover dependency invalidation does not release unrelated cached covers',()=>{
 const env=environment();const unbind=bindImageResources({source:id=>'blob:'+id,identity:src=>src.startsWith('blob:')?{id:src.slice(5),version:1}:null});
 try{
  const view=document.createElement('div');document.body.append(view);const state={accountId:'a',route:'works'};
  const markup='<button data-act="open-project" data-id="p"><div class="thumb-inner"><img src="blob:i" alt="preview"></div></button>';
  view.innerHTML=markup;reusePagePreviews({view,state});const first=view.querySelector('.thumb-inner');
  view.innerHTML='';notifyImageInvalidation(['other']);view.innerHTML=markup;reusePagePreviews({view,state});assert.equal(view.querySelector('.thumb-inner'),first);
  view.innerHTML='';notifyImageInvalidation(['i']);view.innerHTML=markup;reusePagePreviews({view,state});assert.notEqual(view.querySelector('.thumb-inner'),first);
 }finally{unbind();env.close();}
});
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
test('returning to the editor upgrades a warm thumbnail to a size-based display variant',async()=>{
 const env=environment();let originals=0,display=0,full=false;const root=document.createElement('div');document.body.append(root);
 const loader=mountPrivateImages({root,db:{previewBlob:async(_id,pixels)=>{if(pixels>360){display++;return new Blob(['display']);}return new Blob(['small']);},get:async()=>{originals++;return {data:new Blob(['large'])};}},urls:new Map(),fullView:()=>full,onError:()=>{}});
 try{
  const preview=await loader.load('m');full=true;root.innerHTML='<img src="'+preview+'">';
  await until(()=>display===1&&root.querySelector('img').getAttribute('src')!==preview);
  assert.equal(originals,0);assert.equal(loader.stats().displayVariants,1);assert.equal(root.querySelector('img').dataset.privateImageId,'m');
 }finally{loader.dispose();env.close();}
});
test('whole invalidation discards in-flight reads even before they have a cached URL',async()=>{
 const env=environment();let finish;const root=document.createElement('div');document.body.append(root);
 const loader=mountPrivateImages({root,db:{previewBlob:()=>new Promise(resolve=>{finish=resolve;}),get:async()=>null},urls:new Map(),onError:()=>{}});
 try{const pending=loader.load('old');loader.invalidate();finish(new Blob(['old']));assert.equal(await pending,'');assert.ok(imagePlaceholder('old').includes('#shiye-image='));}
 finally{loader.dispose();env.close();}
});
test('preview retention is bounded and decoded node cache does not steal owned cover children',async()=>{
 const env=environment();const root=document.createElement('div');document.body.append(root);
 const loader=mountPrivateImages({root,db:{previewBlob:async()=>new Blob(['x']),get:async()=>null},urls:new Map(),onError:()=>{}});
 try{for(let i=0;i<90;i++)await loader.load('m'+i);await tick();assert.ok(loader.stats().previews<=480);
  root.innerHTML='<div data-preview-cache-owned><img src="a"></div>';const img=root.querySelector('img');Object.defineProperties(img,{complete:{value:true},naturalWidth:{value:10},naturalHeight:{value:10}});
  const nodes=new ImageNodeCache();nodes.remember([img]);assert.equal(nodes.pixels,0);nodes.dispose();
 }finally{loader.dispose();env.close();}
});

test('works list keeps its decoded sheet when navigating away and back',()=>{
 const env=environment();try{
  const view=document.createElement('div'),state={accountId:'a',route:'works'};document.body.append(view);
  const markup='<div class="works-grid"><button data-act="open-project" data-id="p"><div class="thumb-sheet"><img src="data:image/png;base64,AA==" alt="cover"></div></button></div>';
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
  try{await loader.load('display',721);assert.deepEqual(requests,[721]);}
  finally{loader.dispose();env.close();}
});
test('route cover signature is stable from image placeholder to hydrated Blob URL',()=>{
  const env=environment(),view=document.createElement('div');document.body.append(view);
  const unbind=bindImageResources({
    source:id=>id==='asset'?'blob:asset':'',
    identity:source=>source==='blob:asset'?{id:'asset',version:1}:null
  });
  const markup=src=>'<button data-act="open-project" data-id="work"><div class="thumb-sheet"><img src="'+src+'" alt="作品封面"></div></button>';
  try{
    view.innerHTML=markup('data:image/svg+xml,%3Csvg/%3E#shiye-image=asset');
    reusePagePreviews({view,state:{accountId:'a',route:'works'}});
    view.innerHTML=markup('blob:asset');
    reusePagePreviews({view,state:{accountId:'a',route:'works'}});
    assert.equal(view.querySelector('img').getAttribute('src'),'blob:asset');
    const warmed=view.querySelector('.thumb-sheet');
    view.innerHTML=markup('blob:asset');
    reusePagePreviews({view,state:{accountId:'a',route:'works'}});
    assert.equal(view.querySelector('.thumb-sheet'),warmed);
  }finally{unbind();env.close();}
});
