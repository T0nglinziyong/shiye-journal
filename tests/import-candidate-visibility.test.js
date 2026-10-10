import test from 'node:test';
import assert from 'node:assert/strict';
import {renderImportInspection} from '../src/import-workspace-ui.js';

const candidates=Array.from({length:12},(_,i)=>({
  region:{x:.01+i*.01,y:.02,w:.12,h:.1},
  url:'blob:cutout-'+i,width:32,height:48,selected:true
}));
function state({processing='',paperNeedsReview=false,items=candidates}={}){
  return {
    route:'import',importMode:'material',importStep:'inspect',
    importProcessing:processing,importIndex:0,
    importRecords:[{url:'blob:photo',confirmed:false,
      paperNeedsReview,candidates:items.map(c=>c.region)}],
    importCandidates:items.map(c=>c.region),importCandidateData:items,
    importCandidateURLs:items.map(c=>c.url),
    importCandidateSelection:new Set(items.map((_,i)=>i)),
    importURL:'blob:photo',importFile:{size:157991,name:'photo.jpg'},
    importBitmap:{width:1706,height:1279},
    importBox:{x:0,y:0,w:1,h:1},importRecognition:'auto',
    showCorrectionPreview:false,showManualBox:false,paperSize:'a4',
    paperOrientation:'auto',preferences:{recognitionPixels:900},series:[]
  };
}
const render=s=>renderImportInspection({state:s,esc:String,fmt:String});
test('all twelve ca0f cutouts and selection positions appear once extraction finishes',()=>{
  const html=render(state());
  assert.match(html,/候选素材 · 12/);
  for(let i=0;i<12;i++)assert.ok(html.includes('src="blob:cutout-'+i+'"'),String(i));
  assert.equal((html.match(/class="candidate-choice"/g)||[]).length,12);
  assert.match(html,/1706 × 1279/);
  assert.match(html,/154 KiB/);
});
test('unrectified phone photo clearly asks for paper-corner review',()=>{
  const html=render(state({items:[],paperNeedsReview:true}));
  assert.match(html,/自动检测未找到可靠纸张/);
  assert.match(html,/暂不对未校正的A4照片进行自动素材识别/);
  assert.match(html,/原始照片/);
});
test('recognized cutouts are not confused with a working progress indicator',()=>{
  const html=render(state({processing:'正在识别中',items:[]}));
  assert.match(html,/aria-busy="true"/);
  assert.match(html,/识别中/);
});
