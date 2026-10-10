import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderImportInspection} from '../src/import-workspace-ui.js';

const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');
test('verified ca0f import does not invoke the speculative PR88/PR92 recovery algorithms',async()=>{
 const app=await source('app.js');
 const [image,perspective]=await Promise.all([source('image.js'),source('perspective.js')]);
 assert.match(image,/segmentPaperMaterials\(discoveryFrame/);
 assert.match(app,/detectPaperCandidates\(source,box,6/);
 assert.match(app,/await refreshImportCandidates\(regions/);
 assert.doesNotMatch(app,/detectImportRegions\(|recoverImportCandidate\(|fixedWorkingSize:true/);
 assert.doesNotMatch(perspective,/fixedWorkingSize|fixedImportFrameSize/);
});
test('mobile retries quad at higher resolution only after the stable 800px attempt',async()=>{
 const perspective=await source('perspective.js');
 assert.match(perspective,/for\(const maxEdge of \[800,1200,1600\]\)/);
 assert.match(perspective,/if\(corners\)return corners/);
 assert.match(perspective,/if\(ratio===1\)break/);
 assert.match(perspective,/return null/);
});
test('failed mobile A4 detection never produces raw photo pseudo-materials',async()=>{
 const app=await source('app.js'),ui=await source('import-workspace-ui.js');
 assert.match(app,/rec\.prefetchStatus='needs-paper-review'/);
 assert.match(app,/rec\.paperNeedsReview=state\.paperSize!=='none'/);
 assert.match(app,/if\(!rec\.paperNeedsReview&&rec\.prefetchStatus/);
 assert.match(app,/state\.importRecords\[state\.importIndex\]\?\.paperNeedsReview/);
 const html=renderImportInspection({state:{
   route:'import',importMode:'material',importStep:'inspect',
   importRecords:[{url:'blob:source',confirmed:false,paperNeedsReview:true}],
   importIndex:0,importCandidates:[],importCandidateData:[],
   importCandidateSelection:new Set(),importProcessing:'',
   importURL:'blob:source',importBitmap:{width:1706,height:1279},
   importFile:{name:'source.jpg',size:157991},
   paperSize:'a4',paperOrientation:'auto',showCorrectionPreview:false,
   showManualBox:false,series:[],preferences:{recognitionPixels:900}
 },esc:String,fmt:String});
 assert.match(html,/自动检测未找到可靠纸张/);
 assert.match(html,/暂不对未校正的A4照片进行自动素材识别/);
 assert.match(ui,/import-source-summary/);
});
test('no toast-triggered layout reads are performed while extracting candidates',async()=>{
 const [app,toast]=await Promise.all([source('app.js'),source('toast.js')]);
 assert.doesNotMatch(toast,/element\.offsetWidth|getBoundingClientRect\s*\(/);
 assert.match(app,/const label=view\.querySelector\('\.import-processing'\);if\(label\)label\.textContent=text;/);
 assert.doesNotMatch(app,/label\.textContent=text;toast\(text\)/);
});
test('phone catalog selection stays in the heading row',async()=>{
 const css=await source('page-heading.css');
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) max-content/);
 assert.match(css,/grid-column:2;grid-row:1/);
});
