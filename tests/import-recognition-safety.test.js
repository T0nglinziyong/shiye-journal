import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {detectImportRegions,preserveDiscoveredCandidates} from '../src/import-recognition-safety.js';
import {renderImportInspection} from '../src/import-workspace-ui.js';
import {fixedImportFrameSize,IMPORT_WORKING_LONG_EDGE_PX} from '../src/import-working-size.js';

const boxes=Array.from({length:12},(_,i)=>({
  x:.02+(i%4)*.235,y:.03+Math.floor(i/4)*.31,w:.16,h:.20
}));

test('the exact 12 detected identities survive an empty boundary refiner',async()=>{
  let recovered;
  const result=await detectImportRegions({width:3396,height:2401},{x:0,y:0,w:1,h:1},{
    paperRectified:true,paperWidthMM:297,paperHeightMM:210,
    onDiagnostic:diagnostic=>assert.equal(diagnostic.count,12)
  },{
    detect:async(_bitmap,_box,_min,opts)=>{
      opts.onDiagnostic({phase:'boxes',count:12,dimensions:[900,636],boxes});
      return [];
    },
    onRecovery:info=>{recovered=info;}
  });
  assert.equal(result.length,12);
  assert.equal(result.filter(region=>region.recognitionFallback).length,12);
  assert.equal(recovered.recovered,12);
});

test('keep successful cutout masks, and recover only missing identities',()=>{
  const mask={alpha:new Uint8Array([255]),width:1,height:1};
  const refined=[{...boxes[0],mask},{...boxes[3],mask}];
  const saved=preserveDiscoveredCandidates(refined,boxes);
  assert.equal(saved.length,12);
  assert.equal(saved[0],refined[0]);
  assert.equal(saved[3],refined[1]);
  assert.equal(saved.filter(r=>r.recognitionFallback).length,10);
});
test('if discovery finds no materials, do not invent thumbnails',async()=>{
  const result=await detectImportRegions({width:100,height:100},{x:0,y:0,w:1,h:1},{},{
    detect:async(_source,_box,_small,options)=>{
      options.onDiagnostic({phase:'boxes',count:0});
      return [];
    }
  });
  assert.deepEqual(result,[]);
});
test('paper-check failure is explicit; the app never auto-segments unrectified A4',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/rec\.paperNeedsReview=state\.paperSize!=='none'&&!state\.correctedBitmap&&!rec\.appliedCorners/);
  assert.match(app,/if\(!rec\.paperNeedsReview&&state\.importStep==='inspect'\)/);
  assert.match(app,/prefetchStatus='needs-paper-review'/);
  assert.match(app,/detectImportRegions\(source,b/);
  const html=renderImportInspection({
    state:{
      importMode:'material',importStep:'inspect',importRecords:[{url:'blob:input',confirmed:false,paperNeedsReview:true}],
      importIndex:0,importCandidates:[],importCandidateData:[],importCandidateSelection:new Set(),
      importProcessing:'',importURL:'blob:input',paperSize:'a4',paperOrientation:'auto',
      showCorrectionPreview:false,showManualBox:false,series:[],preferences:{recognitionPixels:900}
    },esc:String,fmt:String
  });
  assert.match(html,/未检测到可靠纸张四角/);
  assert.match(html,/暂不对未校正的整张照片进行素材识别/);
});
test('phone material-select button remains beside the heading',async()=>{
  const css=await readFile(new URL('../src/page-heading.css',import.meta.url),'utf8');
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) max-content/);
  assert.match(css,/grid-column:2;grid-row:1/);
  assert.doesNotMatch(css,/\.unified-page-heading \.actions\{[\s\S]*?flex:1 1 100%/);
});
test('same A4 paper always rectifies to the c6-compatible fixed raster, independent of source megapixels',async()=>{
  assert.equal(IMPORT_WORKING_LONG_EDGE_PX,3396);
  assert.deepEqual(fixedImportFrameSize(297/210),{width:3396,height:2401});
  assert.deepEqual(fixedImportFrameSize(210/297),{width:2401,height:3396});
  const [perspective,app]=await Promise.all([
    readFile(new URL('../src/perspective.js',import.meta.url),'utf8'),
    readFile(new URL('../src/app.js',import.meta.url),'utf8')
  ]);
  assert.match(perspective,/fixedWorkingSize\?fixedImportFrameSize\(paperRatio\)/);
  assert.equal((app.match(/rectifyA4Frame\([^;]+fixedWorkingSize:true/g)||[]).length,3);
});
test('paper-corner overlay uses the exact pinned JPEG decoder orientation',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const ui=await readFile(new URL('../src/import-workspace-ui.js',import.meta.url),'utf8');
  assert.match(app,/importPhotoDisplayURL\(bitmap\)/);
  assert.match(ui,/state\.importDisplayURL\|\|state\.importURL/);
});
test('12 detected boxes without thumbnails are extracted again without rediscovering the page',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/if\(state\.importCandidates\.length&&!state\.importCandidateData\.length\)/);
  assert.match(app,/await refreshImportCandidates\(state\.importCandidates\)/);
});
test('placeholder paper corners remain unaccepted until user confirms correction',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/rec\.paperNeedsReview\|\|!state\.paperCorners/);
  assert.match(app,/!state\.correctedBitmap&&state\.paperCorners&&state\.paperSize!=='none'&&!rec\.paperNeedsReview/);
  assert.match(app,/rec\.backgroundDetected=true;rec\.paperNeedsReview=false/);
  assert.match(app,/rec\.paperNeedsReview\|\|!corners/);
});
