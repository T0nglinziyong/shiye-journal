import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {offlinePreviewBytes,previewImageFormat,isWebpBytes,OFFLINE_MATERIAL_EDGE,
 OFFLINE_REFERENCE_EDGE,OFFLINE_IMAGE_QUALITY} from '../src/offline-preview.js';

const WEBP=new Uint8Array([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,32]);
const PNG=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const JPG=new Uint8Array([255,216,255,224,0,16,0,0]);

function fakeCanvas(encode){
 const calls=[],restore={bitmap:globalThis.createImageBitmap,document:globalThis.document};
 globalThis.createImageBitmap=async()=>({width:1200,height:900,close(){}});
 globalThis.document={createElement:()=>({
   width:0,height:0,
   getContext(){return {clearRect(){},drawImage(){},fillRect(){}};},
   toBlob(callback,type,quality){
     calls.push({width:this.width,height:this.height,type,quality});
     const bytes=encode(type,calls.length,this.width,this.height);
     callback(bytes&&new Blob([bytes],{type:bytes===WEBP?'image/webp':bytes===JPG?'image/jpeg':'image/png'}));
   }
 })};
 return {calls,close(){globalThis.createImageBitmap=restore.bitmap;globalThis.document=restore.document;}};
}
test('identify actual WebP, PNG and JPEG bytes',()=>{
 assert.equal(isWebpBytes(WEBP),true);
 assert.equal(previewImageFormat(PNG).extension,'png');
 assert.equal(previewImageFormat(JPG).mimeType,'image/jpeg');
 assert.equal(previewImageFormat(new Uint8Array([1,2,3])),null);
 assert.equal(OFFLINE_MATERIAL_EDGE,512);
 assert.equal(OFFLINE_REFERENCE_EDGE,768);
 assert.equal(OFFLINE_IMAGE_QUALITY,.86);
});
test('WebP capable browsers keep small WebP preview',async()=>{
 const mock=fakeCanvas(type=>type==='image/webp'?WEBP:null);
 try{
   const out=await offlinePreviewBytes(new Blob([PNG],{type:'image/png'}));
   assert.deepEqual(out,WEBP);
   assert.equal(mock.calls.length,1);
   assert.deepEqual(mock.calls[0],{width:512,height:384,type:'image/webp',quality:.86});
 }finally{mock.close();}
});
test('iPhone WebKit returning PNG for WebP transparently falls back to PNG',async()=>{
 const mock=fakeCanvas(type=>type==='image/webp'?PNG:type==='image/png'?PNG:null);
 try{
   const out=await offlinePreviewBytes(new Blob([PNG],{type:'image/png'}));
   assert.deepEqual(out,PNG);
   assert.equal(previewImageFormat(out).extension,'png');
   assert.deepEqual(mock.calls.map(c=>c.type),['image/webp','image/png']);
   assert.ok(mock.calls.every(c=>c.width<=512));
 }finally{mock.close();}
});
test('unsupported WebP reference uses small JPEG instead of failing export',async()=>{
 const mock=fakeCanvas(type=>type==='image/webp'?null:type==='image/jpeg'?JPG:null);
 try{
   const out=await offlinePreviewBytes(new Blob([PNG],{type:'image/png'}),{maxEdge:768,opaque:true});
   assert.deepEqual(out,JPG);
   assert.deepEqual(mock.calls.map(c=>c.type),['image/webp','image/jpeg']);
   assert.equal(mock.calls[0].width,768);
 }finally{mock.close();}
});
test('PNG transparency fallback shrinks huge previews instead of failing package',async()=>{
 const mock=fakeCanvas((type,index,w)=>{
   if(type==='image/webp')return null;
   // A synthetic large PNG until the canvas is <=320px
   if(w<=320)return PNG;
   const large=new Uint8Array(350000);large.set(PNG);return large;
 });
 try{
   const out=await offlinePreviewBytes(new Blob([PNG],{type:'image/png'}),{maxEdge:512});
   assert.deepEqual(out,PNG);
   assert.ok(mock.calls.some(c=>c.width<=320));
 }finally{mock.close();}
});
test('offline SVG/HTML/runtime support content-based WebP and PNG MIME',async()=>{
 const names=['offline-preview-svg.js','offline-browser-page.js','web-workbench-runtime.mjs','offline-creation.js'];
 const [svg,html,runtime,creation]=await Promise.all(names.map(name=>readFile(new URL('../src/'+name,import.meta.url),'utf8')));
 assert.match(svg,/previewImageFormat\(bytes\)/);
 assert.match(html,/previewImageFormat\(previews\[m.alias\]\)/);
 assert.ok(runtime.includes('(png|webp)'));
 assert.ok(creation.includes('packagePreviewPath'));
 assert.ok(svg.includes('Noto Sans CJK SC'));
});
