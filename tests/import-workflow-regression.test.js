import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {saveImportBatch} from '../src/import-save.js';

const photo=()=>new Blob(['jpeg-fixture-bytes'],{type:'image/jpeg'});
const piece=()=>new Blob(['opaque-png-fixture'],{type:'image/png'});
async function withCutoutPixels(run){
 const bitmap=globalThis.createImageBitmap,document=globalThis.document;
 globalThis.createImageBitmap=async()=>({width:2,height:2,close(){}});
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(16).fill(255)})})})};
 try{return await run();}finally{if(bitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=bitmap;
   if(document===undefined)delete globalThis.document;else globalThis.document=document;}
}
function fixture(copyToLibrary){
 const original=photo(),cutout=piece();
 const c={selected:true,title:'纸片 1',blob:cutout,originalBlob:cutout,
    width:32,height:55,kind:'paper',region:{x:.15,y:.2,w:.24,h:.29,rotation:0}};
 const state={
  importMode:'work',importStep:'review',importSaving:false,importRecords:[{
    confirmed:true,file:{name:'upload.jpg'},originalFile:original,
    bitmap:{width:800,height:1200},paperSize:'a4',paperOrientation:'portrait',
    workTitle:'十月手帐',workPaperPattern:'grid',workPaperColumns:true,workPaperColor:'#faf1ea',
    workSaveAssets:copyToLibrary,seriesID:copyToLibrary?'series-A':'__no_library__',selectedCandidates:[c]
  }],
  importBatchSeriesID:'series-B',importBatchWorkSaveAssets:false,assets:[],projects:[]
 };
 const batches=[],db={stageImport:async batch=>{batches.push(batch);return {pending:true};}};
 return {state,batches,db};
}

test('imported work saves editable paper metadata instead of inpainted photo background',async()=>{
 const {state,batches,db}=fixture(false);
 await withCutoutPixels(()=>saveImportBatch({state,db,urls:new Map(),render:()=>{}}));
 assert.equal(batches.length,1);
 const saved=batches[0],p=saved.projects[0],d=p.drafts[0];
 assert.equal(d.paperPattern,'grid');assert.equal(d.paperColumns,true);assert.equal(d.paperColor,'#faf1ea');
 assert.equal(p.seriesID,null);assert.equal(p.isDraft,false);
 assert.equal(p.source,'imported');assert.equal(d.items.length,1);
 assert.equal(saved.assets.length,1,'No internal full-sheet photo may be added');
 assert.equal(saved.assets[0].isProjectInternal,true);
 assert.equal(saved.blobs.filter(x=>x.data.type==='image/jpeg').length,0,
   'Editable work retains each candidate frame, never the full source photo');
 assert.equal(p.originalImportPhotoBlobID,undefined);
 assert.equal(saved.assets[0].photoBlobId,undefined);
 assert.ok(saved.assets[0].candidateFrameBlobId);
 assert.deepEqual(p.initialEditorSnapshot.drafts[0].layers,d.layers);
 assert.equal(state.importStep,'done');
});
test('per-photo library choice overrides batch default without changing physical positions',async()=>{
 const {state,batches,db}=fixture(true);
 await withCutoutPixels(()=>saveImportBatch({state,db,urls:new Map(),render:()=>{}}));
 assert.equal(batches[0].assets[0].isProjectInternal,false);
 const element=batches[0].projects[0].drafts[0].items[0];
 assert.ok(element.x>0&&element.y>0);
 assert.equal(element.isLocked,false);
});
test('imported work material assigned to library is used, and internal elements remain editable',async()=>{
  const {state,db,batches}=fixture(true);
  await withCutoutPixels(()=>saveImportBatch({state,db,urls:new Map(),render:()=>{}}));
  const candidate=batches[0].assets[0];
  assert.equal(candidate.isProjectInternal,false);
  assert.equal(candidate.usageStatus,'used');
  assert.equal(candidate.seriesID,'series-A');
  assert.equal(batches[0].projects[0].drafts[0].items[0].assetID,candidate.id);
});
test('snapshot save stores one corrected full-page PNG and no materials',async()=>{
  const {state,db,batches}=fixture(true);state.importMode='snapshot';
  state.importRecords[0].balanceLight=false;
  state.importRecords[0].correctedBitmap={width:500,height:700};
  const originalDocument=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext(){return {drawImage(){}};},
    toBlob(fn){fn(new Blob(['corrected page'],{type:'image/png'}));}})};
  try{
    await saveImportBatch({state,db,urls:new Map(),render:()=>{}});
    assert.equal(batches[0].assets.length,0);
    assert.equal(batches[0].projects.length,1);
    assert.equal(batches[0].projects[0].isSnapshot,true);
    assert.equal(batches[0].projects[0].snapshotWidth,500);
    assert.equal(batches[0].blobs[0].data.type,'image/png');
  }finally{globalThis.document=originalDocument;}
});
