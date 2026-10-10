import test from 'node:test';
import assert from 'node:assert/strict';
import {renderImportInspection} from '../src/import-workspace-ui.js';

function makeState({processing='正在处理第 2 件素材…',candidates=[]}={}){
 return {
  route:'import',importMode:'material',importStep:'inspect',
  importProcessing:processing,importIndex:0,
  importRecords:[{url:'blob:photo',confirmed:false,candidates:candidates.map(c=>c.region),
    candidateData:candidates,candidateURLs:candidates.map(c=>c.url),prefetchStatus:'ready'}],
  importCandidates:candidates.map(c=>c.region),
  importCandidateData:candidates,importCandidateURLs:candidates.map(c=>c.url),
  importCandidateSelection:new Set(candidates.map((_,i)=>i)),
  importURL:'blob:photo',importBitmap:{width:1200,height:1700},
  importBox:{x:0,y:0,w:1,h:1},
  importRecognition:'auto',showCorrectionPreview:false,showManualBox:false,
  paperSize:'a4',paperOrientation:'portrait',preferences:{recognitionPixels:900}
 };
}
test('mobile and desktop candidate thumbnails remain visible while refinement is busy',()=>{
 const a={region:{x:.15,y:.2,w:.2,h:.2},url:'blob:recognized-1',width:42,height:60,selected:true};
 const b={region:{x:.44,y:.3,w:.2,h:.2},url:'blob:recognized-2',width:32,height:25,selected:true};
 const html=renderImportInspection({state:makeState({candidates:[a,b]}),esc:String,fmt:String});
 assert.match(html,/候选素材 · 2/);
 assert.match(html,/src="blob:recognized-1"/);
 assert.match(html,/src="blob:recognized-2"/);
 assert.ok(!html.includes('src=""'));
 assert.equal((html.match(/class="candidate-choice"/g)||[]).length,2);
 assert.match(html,/aria-busy="true"/);
});
test('one raw-crop recovery visibly indicates the boundary requires attention',()=>{
 const candidate={region:{x:.1,y:.2,w:.3,h:.2},url:'blob:raw-recovery',
   previewFallback:true,reviewStatus:'pendingReview',width:63,height:59};
 const html=renderImportInspection({state:makeState({processing:'',candidates:[candidate]}),esc:String,fmt:String});
 assert.match(html,/候选素材 · 1/);
 assert.match(html,/src="blob:raw-recovery"/);
 assert.match(html,/边缘待检查 · 原始裁片/);
});
