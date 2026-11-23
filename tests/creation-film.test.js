import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {configureShape,shapeSVG} from '../src/editor-tools-model.js';
import {shapeRepeatCountPatch} from '../src/advanced-shape-options.js';
import {compileTechnique} from '../creative-agent/library/techniques.js';
import {exampleMaterials} from '../creative-agent/library/examples.js';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {worldBox} from '../src/scene-spatial.js';

async function renderFilm(options,width=1000,height=400){
 const shape=configureShape({id:'film'},'filmFrame');Object.assign(shape,{fill:'#123456',stroke:null,shapeOptions:options});
 const svg=shapeSVG(shape).replace('<svg ',`<svg width="${width}" height="${height}" `),canvas=createCanvas(width,height);
 canvas.getContext('2d').drawImage(await loadImage(Buffer.from(svg)),0,0);
 return canvas;
}
async function pixels(options){
 const canvas=await renderFilm(options);
 return (x,y)=>[...canvas.getContext('2d').getImageData(Math.round(x*1000),Math.round(y*400),1,1).data];
}
test('film windows and sprockets are transparent, and structure controls change the actual rendered holes',async()=>{
 const two=await pixels({columns:2,count:10,frameInset:.16});
 assert.equal(two(.25,.5)[3],0);assert.equal(two(.05,.08)[3],0);
 assert.deepEqual(two(.5,.5),[18,52,86,255]);assert.deepEqual(two(.10,.08),[18,52,86,255]);
 const one=await pixels({columns:1,count:20,frameInset:.16});
 assert.equal(one(.5,.5)[3],0);assert.equal(one(.05,.08)[3],255);
 const thick=await pixels({columns:1,count:10,frameInset:.25});
 assert.equal(one(.5,.20)[3],0);assert.equal(thick(.5,.20)[3],255);
 const change=shapeRepeatCountPatch({kind:'filmFrame',width:200,height:60,shapeOptions:{count:10}},'count',20);
 assert.equal(change.width,undefined);assert.equal(change.height,undefined);assert.equal(change.shapeOptions.count,20);
});
test('adding film cells in the editor retains the physical width of every photo opening',async()=>{
 const patch=shapeRepeatCountPatch({kind:'filmFrame',width:200,height:60,shapeOptions:{columns:2,frameInset:.18}},'columns',4);
 const widths=async(columns,width)=>{
  const c=await renderFilm({columns,count:10,frameInset:.18},width,60),data=c.getContext('2d').getImageData(0,30,width,1).data;
  const spans=[];let start=null;for(let x=0;x<=width;x++){
   const hole=x<width&&data[x*4+3]===0;
   if(hole&&start===null)start=x;
   if(!hole&&start!==null){spans.push(x-start);start=null;}
  }return spans;
 };
 assert.deepEqual(await widths(2,200),[64,64]);
 assert.deepEqual(await widths(4,patch.width),[64,64,64,64]);
});
let tx=0;
const run=(doc,operations)=>applyCreationTransaction(doc,{protocolVersion:2,transactionId:'film-'+(++tx),baseSceneRevision:creationSceneRevision(doc),operations},exampleMaterials).document;
const make=()=>createCreationDocument({draft:draft({ratio:'a5'}),assets:exampleMaterials,aliases:Object.fromEntries(exampleMaterials.map(a=>[a.alias,a.id]))});
test('bent film groups preserve physical photos, keep frames apart, and allow later native geometry edits',async()=>{
 for(const bendMm of [-40,0,40]){
  let doc=await make();const source=structuredClone(doc.source);
  const result=compileTechnique({methodId:'photo-film',parameters:{id:'film',aliases:['m1','m2','m3'],bendMm,gapMm:4},materials:exampleMaterials});
  doc=run(doc,result.operations);assert.deepEqual(doc.source,source);
  const mm=doc.page.physicalPageHeightMM/doc.page.canvas.height;
  const group=doc.page.layers.find(n=>n.id==='film'),frames=[];
  for(let i=0;i<3;i++){
   const photo=group.children.find(n=>(n.creativePieceID||n.id)==='film-photo'+i),asset=exampleMaterials[i];
   assert.ok(Math.abs(photo.width*mm-asset.physicalWidthMM)<1e-6);
   assert.ok(Math.abs(photo.height*mm-asset.physicalHeightMM)<1e-6);
   const frame=worldBox(doc.page,'film-frame'+i),angle=frame.rotation*Math.PI/180;
   const half=(Math.abs(frame.w*Math.cos(angle))+Math.abs(frame.h*Math.sin(angle)))/2;
   frames.push({left:frame.cx-half,right:frame.cx+half});
  }
  for(let i=1;i<frames.length;i++)assert.ok((frames[i].left-frames[i-1].right)*mm>=4-1e-6);
  const before=worldBox(doc.page,'film-photo0');
  doc=run(doc,[{op:'layer.update',target:'film-frame0',geometry:{kind:'filmFrame',options:{columns:2,count:12,frameInset:.2}}}]);
  assert.deepEqual(worldBox(doc.page,'film-photo0'),before);assert.deepEqual(doc.source,source);
  const frame=doc.page.layers.find(n=>n.id==='film').children.find(n=>n.id==='film-frame0');
  assert.equal(frame.shapeOptions.columns,2);assert.equal(frame.shapeOptions.count,12);
 }
});
test('film recipes reject invalid parameters and duplicate physical material before any scene mutation',()=>{
 for(const patch of [{frameInset:0},{frameInset:.6},{holesPerFrame:1},{holesPerFrame:3.5},{bendMm:NaN},{bendMm:90},{aliases:['m1','m1']},{aliases:['missing']}]){
  assert.throws(()=>compileTechnique({methodId:'photo-film',parameters:{id:'invalid',aliases:['m1'],...patch},materials:exampleMaterials}));
 }
 const one=compileTechnique({methodId:'photo-film',parameters:{id:'single',aliases:['m1'],bendMm:40},materials:exampleMaterials});
 assert.equal(one.operations[0].children.filter(n=>n.op==='material.add').length,1);
 assert.equal(one.operations[0].children[1].place.rotationDeg,0);
});
