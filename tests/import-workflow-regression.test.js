import test from 'node:test';
import assert from 'node:assert/strict';
import {saveImportBatch} from '../src/import-save.js';
import {renderImportReview} from '../src/import-workspace-ui.js';

const photo=()=>new Blob(['photo'],{type:'image/jpeg'});
const piece=()=>new Blob(['piece'],{type:'image/png'});
function fixture(copyToLibrary){
 const original=photo(),cutout=piece();
 const c={selected:true,title:'纸片 1',blob:cutout,originalBlob:cutout,
    width:32,height:55,kind:'paper',region:{x:.15,y:.2,w:.24,h:.29,rotation:0}};
 const state={
  importMode:'work',importStep:'review',importSaving:false,importRecords:[{
    confirmed:true,file:{name:'upload.jpg'},originalFile:original,
    bitmap:{width:800,height:1200},paperSize:'a4',paperOrientation:'portrait',
    workTitle:'十月手帐',workPaperPattern:'grid',workPaperColor:'#faf1ea',
    workSaveAssets:copyToLibrary,seriesID:'series-A',selectedCandidates:[c]
  }],
  importBatchSeriesID:'series-B',importBatchWorkSaveAssets:false,assets:[],projects:[]
 };
 const batches=[],db={stageImport:async batch=>{batches.push(batch);return {pending:true};}};
 return {state,batches,db};
}

test('imported work saves editable paper metadata instead of inpainted photo background',async()=>{
 const {state,batches,db}=fixture(false);
 await saveImportBatch({state,db,urls:new Map(),render:()=>{}});
 assert.equal(batches.length,1);
 const saved=batches[0],p=saved.projects[0],d=p.drafts[0];
 assert.equal(d.paperPattern,'grid');assert.equal(d.paperColor,'#faf1ea');
 assert.equal(p.seriesID,'series-A');assert.equal(p.isDraft,false);
 assert.equal(p.source,'imported');assert.equal(d.items.length,1);
 assert.equal(saved.assets.length,1,'No internal full-sheet photo may be added');
 assert.equal(saved.assets[0].isProjectInternal,true);
 assert.equal(saved.blobs.filter(x=>x.data.type==='image/jpeg').length,1);
 assert.deepEqual(p.initialEditorSnapshot.drafts[0].items,d.items);
 assert.equal(state.importStep,'done');
});
test('per-photo library choice overrides batch default without changing physical positions',async()=>{
 const {state,batches,db}=fixture(true);
 await saveImportBatch({state,db,urls:new Map(),render:()=>{}});
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
 assert.ok(html.includes('record-work-save-assets'));
 assert.ok(html.includes('batch-work-save-assets'));
 assert.ok(html.includes('record-work-paper-pattern'));
 assert.ok(html.includes('record-series'));
});
