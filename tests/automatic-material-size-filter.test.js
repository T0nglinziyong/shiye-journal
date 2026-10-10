import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MIN_AUTOMATIC_SIDE_MM,filterAutomaticMaterialBoxes} from '../src/automatic-material-size-filter.js';

const candidate=(wMM,hMM,paperW=210,paperH=297)=>({
 x:.1,y:.1,w:wMM/paperW,h:hMM/paperH
});
const filter=(regions,extra={})=>filterAutomaticMaterialBoxes(regions,{
 paperWidthMM:210,paperHeightMM:297,...extra
});
test('filter automatic candidates when either side is strictly under 9 mm',()=>{
 const boxes=[candidate(8.99,60),candidate(50,8.99),
  candidate(9,9),candidate(9.01,12),candidate(20,20)];
 assert.deepEqual(filter(boxes),boxes.slice(2));
 assert.equal(MIN_AUTOMATIC_SIDE_MM,9);
});
test('measure the oriented detection frame when available, not the expanded bounding box',()=>{
 const rotated={x:.2,y:.2,w:20/210,h:25/297,
  orientedBox:{width:8/210,height:14/297,rotation:35,autoDeskew:true}};
 assert.deepEqual(filter([rotated]),[]);
 const other={...rotated,orientedBox:{...rotated.orientedBox,width:9/210}};
 assert.deepEqual(filter([other]),[other]);
});
test('portrait, landscape and custom paper sizes yield the same physical 9mm rule',()=>{
 const portrait=[candidate(8.9,11),candidate(9,11)];
 const landscape=[candidate(8.9,11,297,210),candidate(9,11,297,210)];
 const custom=[candidate(8.9,11,180,180),candidate(9,11,180,180)];
 assert.deepEqual(filter(portrait),[portrait[1]]);
 assert.deepEqual(filter(landscape,{paperWidthMM:297,paperHeightMM:210}),[landscape[1]]);
 assert.deepEqual(filter(custom,{paperWidthMM:180,paperHeightMM:180}),[custom[1]]);
});
test('uncalibrated photos are unchanged rather than inventing a 9mm scale',()=>{
 const boxes=[candidate(2,5),candidate(9,9)];
 assert.strictEqual(filter(boxes,{enabled:false}),boxes);
 assert.strictEqual(filterAutomaticMaterialBoxes(boxes,{}),boxes);
});
test('does not modify input, ordering, masks or manual edit objects',()=>{
 const mask={alpha:new Uint8Array([255])};
 const keep={...candidate(10,12),mask},drop=candidate(2,20);
 const input=[keep,drop];
 const out=filter(input);
 assert.deepEqual(out,[keep]);assert.strictEqual(out[0],keep);
 assert.strictEqual(out[0].mask,mask);assert.equal(input.length,2);
});
test('both automatic import entrances apply the filter, never manual box refinement',async()=>{
 const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 const matches=app.match(/filterAutomaticMaterialBoxes\(/g)||[];
 assert.equal(matches.length,2,'foreground and background prefetch should agree');
 assert.match(app,/candidates=filterAutomaticMaterialBoxes\(candidates/);
 assert.match(app,/regions=filterAutomaticMaterialBoxes\(regions/);
 const manual=app.slice(app.indexOf('async function refreshImportCandidates('),
  app.indexOf('async function previewCrop()'));
 assert.doesNotMatch(manual,/filterAutomaticMaterialBoxes/);
});
