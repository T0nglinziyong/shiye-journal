import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  isImageImportFile,imageFilesFromDrop,acceptsDesktopFileDrag,imageImportDestination
} from '../src/desktop-image-drop.js';
import {colorFallbackEvidence} from '../src/recognition-empty-fallback.js';
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

test('chromatic zero-box fallback sees blue and green real items but not grey shadows',()=>{
 const w=120,h=180,pixels=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<pixels.length;i+=4) pixels.set([245,245,245,255],i);
 const rect=(x,y,width,height,color)=>{for(let iy=y;iy<y+height;iy++)for(let ix=x;ix<x+width;ix++)pixels.set([...color,255],(iy*w+ix)*4);};
 rect(12,30,25,50,[77,131,197]);rect(67,70,37,50,[86,185,112]);
 rect(12,120,22,30,[225,225,225]);
 const result=colorFallbackEvidence(pixels,w,h);
 assert.ok(result,'saturated real items should yield conservative evidence');
 assert.equal(result.mask[45*w+22],1);
 assert.equal(result.mask[82*w+87],1);
 assert.equal(result.mask[130*w+22],0);
 assert.equal(result.mask[3*w+3],0);
 assert.ok(result.fraction<.43);
});
test('neutral A4 and broad tinted background do not become an invented sticker',()=>{
 const w=100,h=160,blank=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<blank.length;i+=4)blank.set([222,222,222,255],i);
 assert.equal(colorFallbackEvidence(blank,w,h),null);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x>4&&x<95&&y>4&&y<155)blank.set([40,170,85,255],(y*w+x)*4);
 assert.equal(colorFallbackEvidence(blank,w,h),null,'whole-page colour cast must not create fake material');
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

test('manual adjustment is enabled while auto recognition runs and stale candidates cannot overwrite it',async()=>{
 const code=await source('app.js');
 assert.match(code,/el\.matches\('\[data-act="manual-import-box"\]'\)&&state\.importBitmap/);
 assert.match(code,/state\.importRecognitionRevision=\(state\.importRecognitionRevision\|\|0\)\+1/);
 assert.match(code,/if\(!canApply\(\)\|\|record!==state\.importRecords\[state\.importIndex\]\)/);
 assert.match(code,/importScroll=state\.route==='import'/);
 assert.match(code,/inspector\.scrollTop=importScroll\.inspector/);
});
test('leaving Materials and returning from Works restores its active tab and selected series',async()=>{
 const code=await source('app.js');
 assert.match(code,/const lastMaterialLocation=/);
 assert.match(code,/restoreMaterial=false/);
 assert.match(code,/route\(lastMaterialLocation\.route\|\|'series',\{restoreMaterial:true\}\)/);
});
