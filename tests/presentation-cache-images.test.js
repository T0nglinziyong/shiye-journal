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
  root.innerHTML='<div data-preview-cache-owned><img src="a"></div>';
  const img=root.querySelector('img');
  Object.defineProperties(img,{complete:{value:true},naturalWidth:{value:10},naturalHeight:{value:10}});
  const nodes=new ImageNodeCache();
  nodes.remember([img]);assert.equal(nodes.pixels,0);nodes.dispose();
 }finally{env.close();}
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

test('catalog source remains COS thumbnail even after the original has been loaded',async()=>{
 const env=environment(),root=document.createElement('div'),calls={original:0,low:0,high:0};document.body.append(root);
 const loader=mountPrivateImages({root,urls:new Map(),onError:()=>{},db:{
   get:async()=>{calls.original++;return {data:new Blob(['original'])};},
   previewBlob:async(_id,pixels)=>{if(pixels===360)calls.low++;else calls.high++;return new Blob(['thumbnail-'+pixels]);}
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
