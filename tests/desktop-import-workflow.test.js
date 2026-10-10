import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  isImageImportFile,imageFilesFromDrop,acceptsDesktopFileDrag,imageImportDestination
} from '../src/desktop-image-drop.js';
import {renderImportReview} from '../src/import-workspace-ui.js';

const source=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');
test('desktop accepts real image file drops, but not text URL drops, canvas or touch',()=>{
 const picture={name:'day.png',type:'image/png'},second={name:'album.jpeg',type:''},bad={name:'report.json',type:'application/json'};
 assert.ok(isImageImportFile(picture));assert.ok(isImageImportFile(second));
 assert.equal(isImageImportFile(bad),false);
 assert.deepEqual(imageFilesFromDrop({files:[picture,bad,second]},12),[picture,second]);
 assert.equal(imageFilesFromDrop({files:[picture,second]},1).length,1);
 assert.equal(acceptsDesktopFileDrag({pointerFine:true,types:['Files'],route:'library'}),true);
 assert.equal(acceptsDesktopFileDrag({pointerFine:true,types:['text/plain'],route:'library'}),false);
 assert.equal(acceptsDesktopFileDrag({pointerFine:true,types:['Files'],route:'editor'}),false);
 assert.equal(acceptsDesktopFileDrag({pointerFine:false,types:['Files'],route:'library'}),false);
 assert.equal(imageImportDestination({route:'works'}),'work');
 assert.equal(imageImportDestination({route:'import',importMode:'work'}),'work');
 assert.equal(imageImportDestination({route:'library'}),'material');
});

test('work import directly exposes stacked colour and pattern pickers, no background modal button',()=>{
 const state={importMode:'work',importRecords:[{
   file:{name:'sample.jpg'},url:'blob:sample',correctedURL:'blob:corrected',
   confirmed:true,selectedCandidates:[],workPaperPattern:'dots',workPaperColor:'#aabbcc'
 }],series:[],importBatchWorkPaperPattern:'plain',importBatchWorkPaperColor:'#fcfaf0'};
 const html=renderImportReview({state,esc:String,fmt:String});
 assert.match(html,/data-review-paper-pattern="0"/);
 assert.match(html,/data-review-paper-color="0"/);
 assert.match(html,/>底纸样式</);
 assert.match(html,/>底纸颜色</);
 assert.match(html,/value="#aabbcc"/);
 assert.match(html,/value="dots" selected/);
 assert.doesNotMatch(html,/data-import-paper-options/);
});

test('wide import has 2:1 columns; wide catalogs are one row and phones retain stacking',async()=>{
 const css=await source('responsive.css');
 assert.match(css,/@media \(min-width:740px\)[\s\S]*?\.import-inspect \.inspect-columns\{[\s\S]*?grid-template-columns:minmax\(0,2fr\) minmax\(0,1fr\)/);
 assert.match(css,/@media \(min-width:700px\)[\s\S]*?#view \.catalog-toolbar \.filters:has\(\.four-filter-controls\)/);
 assert.match(css,/@media \(max-width:699px\)[\s\S]*?\.filters \{ display:grid/);
 assert.match(css,/\.import-nav[\s\S]*?max-width:none/);
});

test('mobile paper failure pauses c6-equivalent segmentation until user confirmation',async()=>{
  const code=await source('app.js');
  const perspective=await source('perspective.js');
  assert.match(code,/rec\.paperNeedsReview=state\.paperSize!=='none'/);
  assert.match(code,/if\(!rec\.paperNeedsReview&&rec\.prefetchStatus/);
  assert.match(code,/state\.correctedBitmap&&state\.importRecords\[state\.importIndex\]\?\.paperNeedsReview/);
  assert.match(code,/rec\.backgroundDetected=true;rec\.paperNeedsReview=false/);
  assert.match(code,/importScroll=state\.route==='import'/);
  assert.match(code,/inspector\.scrollTop=importScroll\.inspector/);
  assert.match(perspective,/for\(const maxEdge of \[800,1200,1600\]\)/);
  assert.doesNotMatch(perspective,/fixedImportFrameSize|fixedWorkingSize/);
});
test('leaving Materials and returning from Works restores its active tab and selected series',async()=>{
 const code=await source('app.js');
 assert.match(code,/const lastMaterialLocation=/);
 assert.match(code,/restoreMaterial=false/);
 assert.match(code,/route\(lastMaterialLocation\.route\|\|'series',\{restoreMaterial:true\}\)/);
});
