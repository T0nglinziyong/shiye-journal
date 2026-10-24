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
