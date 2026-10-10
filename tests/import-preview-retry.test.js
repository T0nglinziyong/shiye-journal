import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {bindImportCandidatePreviews} from '../src/import-preview-retry.js';

test('a broken iOS candidate thumbnail retries once using the retained Blob',()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');
 root.innerHTML='<div class="candidate-choice"><span class="candidate-thumb">'+
   '<img data-import-preview-index="0" src="blob:revoked"></span></div>';
 doc.body.append(root);
 const image=root.querySelector('img'),item={url:'blob:revoked',
   blob:new Blob(['valid-png-bytes'],{type:'image/png'})},repairs=[];
 try{
   bindImportCandidatePreviews({
     root,candidates:()=>[item],
     createURL:blob=>{assert.equal(blob,item.blob);return 'blob:recovered';},
     onRepair:(index,changed)=>repairs.push({index,url:changed.url})
   });
   image.onerror(new win.Event('error'));
   assert.equal(image.getAttribute('src'),'blob:recovered');
   assert.equal(item.url,'blob:recovered');
   assert.deepEqual(repairs,[{index:0,url:'blob:recovered'}]);
   assert.equal(image.dataset.importPreviewRetry,'1');
   image.onerror(new win.Event('error'));
   assert.equal(root.querySelectorAll('.candidate-preview-error').length,1);
   assert.match(root.textContent,/预览失败，请检查边缘/);
 }finally{win.close();}
});
test('a stale photo-batch image cannot repair or overwrite current candidate URLs',()=>{
 const win=new Window(),root=win.document.createElement('div');
 root.innerHTML='<span class="candidate-thumb"><img data-import-preview-index="0" src="blob:stale"></span>';
 win.document.body.append(root);
 let creates=0,updates=0;
 const image=root.querySelector('img');
 try{
   bindImportCandidatePreviews({
     root,active:()=>false,
     candidates:()=>[{blob:new Blob(['bytes']),url:'blob:stale'}],
     createURL:()=>{creates++;return 'blob:should-not-exist';},
     onRepair:()=>updates++
   });
   image.onerror(new win.Event('error'));
   assert.equal(creates,0);
   assert.equal(updates,0);
   assert.equal(image.getAttribute('src'),'blob:stale');
 }finally{win.close();}
});
