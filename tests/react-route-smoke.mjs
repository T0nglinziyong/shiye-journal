import {Window} from 'happy-dom';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {stubCanvas} from './dom-canvas-stub.mjs';
import {builtApp,waitFor} from './built-app.mjs';

const root=new URL('../dist/',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
const window=new Window({url:'https://shiye.test/',settings:{enableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true}});
window.document.body.innerHTML=html.match(/<body>([\s\S]*)<\/body>/)[1];
stubCanvas(window);
window.console.warn=window.console.warn.bind(window.console);
Object.defineProperty(window.document,'fonts',{value:{load:async()=>[]},configurable:true});
Object.assign(window,{indexedDB,IDBKeyRange,structuredClone});
window.fetch=async()=>({ok:true,blob:async()=>new Blob(['sample'],{type:'image/png'}),json:async()=>({})});
window.URL.createObjectURL=()=>`blob:shiye-${Math.random()}`;
window.URL.revokeObjectURL=()=>{};

const opened=indexedDB.open('shiye-pwa-full-v1',1);
opened.onupgradeneeded=()=>{
  for(const store of ['assets','blobs','series','projects','meta','trash'])opened.result.createObjectStore(store,{keyPath:'id'});
};
const database=await new Promise((resolve,reject)=>{opened.onsuccess=()=>resolve(opened.result);opened.onerror=()=>reject(opened.error);});
const tx=database.transaction(['assets','series'],'readwrite');
tx.objectStore('series').put({id:'series-1',title:'测试系列'});
const image='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>';
for(let index=1;index<=45;index++)tx.objectStore('assets').put({
  id:`asset-${index}`,blobId:`image-${index}`,title:`素材 ${index}`,
  staticPath:image,seriesID:'series-1',kind:'sticker',reviewStatus:'ready',
  physicalWidthMM:20,physicalHeightMM:20,tags:[]
});
await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
database.close();

window.eval(await builtApp(root,html,window));
await waitFor(()=>!!window.document.querySelector('[data-act="series-detail"][data-id="series-1"]'));
window.document.querySelector('.swift-tabs button:nth-child(2)').click();
await waitFor(()=>window.document.querySelectorAll('.asset-grid [data-act="detail"]').length===40);
const controls=window.document.querySelector('.catalog-page-controls');
controls.querySelector('[aria-label="下一页"]').click();
await waitFor(()=>window.document.querySelectorAll('.asset-grid [data-act="detail"]').length===5);
window.document.querySelector('.asset-grid [data-act="detail"]').click();
await waitFor(()=>!!window.document.querySelector('.detail-page h1'));
assert.match(window.document.querySelector('.detail-page h1').textContent,/素材/);
window.document.querySelector('[data-act="detail-back"]').click();
await waitFor(()=>!!window.document.querySelector('.asset-grid'));
window.document.querySelector('.catalog-page-controls [aria-label="上一页"]').click();
await waitFor(()=>window.document.querySelectorAll('.asset-grid [data-act="detail"]').length===40);
window.document.querySelector('.asset-grid [data-act="detail"]').click();
await waitFor(()=>!!window.document.querySelector('.detail-page h1'));
assert.ok(window.document.querySelector('.detail-heart'));
console.log('React route smoke: series, 45 assets, page 2 detail, back and page 1 detail');
process.exit(0);
