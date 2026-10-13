import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {saveImportBatch} from '../src/import-save.js';
import {renderImportReview} from '../src/import-workspace-ui.js';

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
    workTitle:'十月手帐',workPaperPattern:'grid',workPaperColor:'#faf1ea',
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
 assert.equal(d.paperPattern,'grid');assert.equal(d.paperColor,'#faf1ea');
 assert.equal(p.seriesID,null);assert.equal(p.isDraft,false);
 assert.equal(p.source,'imported');assert.equal(d.items.length,1);
 assert.equal(saved.assets.length,1,'No internal full-sheet photo may be added');
 assert.equal(saved.assets[0].isProjectInternal,true);
 assert.equal(saved.blobs.filter(x=>x.data.type==='image/jpeg').length,1);
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
test('work confirmation shows editable background as first tile plus consistent series controls',()=>{
 const {state}=fixture(true);state.series=[{id:'series-A',title:'花园'}];state.importRecords[0].url='blob:fixture';state.importRecords[0].selectedCandidates[0].url='blob:piece';
 const html=renderImportReview({state,esc:value=>String(value),fmt:x=>x.toFixed(1)});
 const first=html.indexOf('review-background-card'),second=html.indexOf('data-candidate="0"');
 assert.ok(first>=0&&second>first);
 assert.ok(html.includes('不归入素材库'));
 assert.ok(!html.includes('record-work-save-assets'));
 assert.ok(!html.includes('batch-work-save-assets'));
 assert.ok(html.includes('class="review-paper-control"'));
 assert.ok(html.includes('data-import-paper-options="0"'));
 assert.ok(!html.includes('record-work-paper-pattern'));
 assert.ok(html.includes('record-series'));
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
test('material review has no background card; work review preserves one square background tile',()=>{
  const {state}=fixture(true);state.series=[{id:'series-A',title:'花园'}];state.importRecords[0].url='blob:original';
  state.importRecords[0].selectedCandidates[0].url='blob:sticker';
  const html=renderImportReview({state,esc:String,fmt:String});
  assert.equal((html.match(/review-background-card/g)||[]).length,1);
  assert.equal((html.match(/data-import-paper-options=/g)||[]).length,1);
  assert.ok(html.indexOf('data-import-paper-options="0"')<html.indexOf('data-candidate="0"'));
  assert.ok(html.indexOf('不归入系列')<html.indexOf('不归入素材库'));
  state.importMode='material';
  const plain=renderImportReview({state,esc:String,fmt:String});
  assert.ok(!plain.includes('review-background-card'));
  assert.ok(!plain.includes('页面背景'));
  assert.ok(!plain.includes('作品名称'));
});
test('snapshot review shows the corrected full page and no material classification',()=>{
  const {state}=fixture(true);state.importMode='snapshot';
  state.importRecords[0].url='blob:raw';
  state.importRecords[0].correctedURL='blob:rectified';
  state.importRecords[0].selectedCandidates=[];
  const html=renderImportReview({state,esc:String,fmt:String});
  assert.ok(html.includes('保存 1 个快照'));
  assert.ok(html.includes('src="blob:rectified" alt="校正后完整页面"'));
  assert.ok(!html.includes('record-series'));
  assert.ok(!html.includes('review-background-card'));
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

test('work confirmation contains no style-tag or usage-marker controls, including mounted enhancements',async()=>{
  const {state}=fixture(true);
  state.series=[{id:'series-A',title:'花园'}];
  state.importRecords[0].url='blob:original';
  state.importRecords[0].selectedCandidates[0].url='blob:piece';
  const html=renderImportReview({state,esc:String,fmt:String});
  assert.ok(html.includes('class="record-work-title"'));
  assert.ok(html.includes('class="record-series"'));
  assert.ok(html.includes('review-background-card'));
  assert.doesNotMatch(html,/风格标签|使用标记|import-work-tags|class="import-used"/u);
  // Previous regression was caused by post-render insertion in workflow-ui.
  const workflow=await readFile(new URL('../src/workflow-ui.js',import.meta.url),'utf8');
  assert.doesNotMatch(workflow,/import-work-tags|import-used|风格标签|使用标记/u);
});


test('material and work batch / per-photo series choices pin New Series first but keep no-series defaults',async()=>{
  const {state}=fixture(true);
  state.series=[{id:'series-B',title:'既有系列'}];
  state.importRecords[0].url='blob:source';state.importRecords[0].selectedCandidates[0].url='blob:piece';
  for(const mode of ['material','work']){
    state.importMode=mode;state.importRecords[0].seriesID='';
    const html=renderImportReview({state,esc:String,fmt:String});
    const batch=html.match(/<select id="batch-series">([\s\S]*?)<\/select>/)?.[1];
    const each=html.match(/<select class="record-series" data-index="0">([\s\S]*?)<\/select>/)?.[1];
    assert.ok(batch&&each,mode+' series controls are present');
    assert.match(batch,/^<option value="__new__">＋ 新建系列…<\/option><option value="">不归入系列<\/option>/);
    assert.match(each,/^<option value="__new__">＋ 新建系列…<\/option><option value="">沿用本批默认<\/option>/);
    assert.equal((batch.match(/value="__new__"/g)||[]).length,1);
    assert.equal((each.match(/value="__new__"/g)||[]).length,1);
    assert.ok(batch.indexOf('新建系列')<batch.indexOf('既有系列'));
    assert.ok(each.indexOf('新建系列')<each.indexOf('既有系列'));
    // The select's first option is not its default after app.js applies ''.
    assert.match(await readFile(new URL('../src/app.js',import.meta.url),'utf8'),
      /batchSeries\.value=state\.importBatchSeriesID\|\|''/);
  }
});
