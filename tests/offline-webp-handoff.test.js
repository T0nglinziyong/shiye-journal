import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {offlinePreviewBytes,isWebpBytes,OFFLINE_MATERIAL_EDGE,
  OFFLINE_REFERENCE_EDGE,OFFLINE_IMAGE_QUALITY} from '../src/offline-preview.js';

test('WebP header and dedicated resolution budgets',()=>{
 const ok=new Uint8Array([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,32]);
 assert.equal(isWebpBytes(ok),true);
 assert.equal(isWebpBytes(new Uint8Array([137,80,78,71])),false);
 assert.equal(OFFLINE_MATERIAL_EDGE,512);
 assert.equal(OFFLINE_REFERENCE_EDGE,768);
 assert.equal(OFFLINE_IMAGE_QUALITY,.86);
});
test('encoder produces WebP and never silently labels PNG as WebP',async()=>{
 const save={bitmap:globalThis.createImageBitmap,document:globalThis.document};
 const riff=new Uint8Array([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,32]);
 const calls=[];
 globalThis.createImageBitmap=async()=>({width:1200,height:900,close(){}});
 globalThis.document={createElement:()=>({
   width:0,height:0,
   getContext(){return {clearRect(){},drawImage(){}};},
   toBlob(callback,type,quality){
     calls.push({width:this.width,height:this.height,type,quality});
     callback(new Blob([riff],{type:'image/webp'}));
   }
 })};
 try{
   const result=await offlinePreviewBytes(new Blob([riff],{type:'image/png'}));
   assert.deepEqual(result,riff);
   assert.deepEqual(calls,[{width:512,height:384,type:'image/webp',quality:.86}]);
 }finally{globalThis.createImageBitmap=save.bitmap;globalThis.document=save.document;}
});
test('SVG, HTML and standalone runtime support WebP with visible CJK fallback',async()=>{
 const files=['offline-preview-svg.js','offline-browser-page.js','offline-runtime-entry.mjs','offline-creation.js'];
 const [svg,html,runtime,creation]=await Promise.all(files.map(async name=>readFile(new URL('../src/'+name,import.meta.url),'utf8')));
 assert.ok(svg.includes('data:image/webp;base64'));
 assert.ok(html.includes('data:image/webp;base64'));
 assert.ok(svg.includes('Noto Sans CJK SC'));
 assert.ok(svg.includes('Noto Serif CJK SC'));
 assert.ok(runtime.includes('.webp'));
 assert.ok(creation.includes('materials/${item.alias}.webp'));
 assert.ok(creation.includes('UTF-8 中文字符'));
 assert.ok(!html.includes('data:image/png;base64'));
});
