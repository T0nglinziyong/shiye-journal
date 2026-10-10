import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {manualBoxGeometry,refineManualBoxes} from '../src/manual-import-recognition.js';

const good=(n)=>({region:{x:.1*n,y:.15,w:.12,h:.13,
  mask:{width:1,height:1,alpha:new Uint8Array([255])}},url:'blob:asset-'+n});
test('removing any existing region keeps its exact other mask/blob without segmenting',async()=>{
  const previous=Array.from({length:6},(_,i)=>good(i));
  const boxes=previous.map((p,i)=>({...p.region,sourceIndex:i,manualChanged:false}));
  boxes.splice(2,1);
  let calls=0;
  const result=await refineManualBoxes(boxes,previous,async()=>{calls++;return null;});
  assert.equal(calls,0);
  assert.deepEqual(result.map(x=>x.original.url),
    ['blob:asset-0','blob:asset-1','blob:asset-3','blob:asset-4','blob:asset-5']);
  assert.equal(result[2].region,previous[3].region);
});
test('deleting all boxes is an empty successful result, not missing recognition',async()=>{
  const result=await refineManualBoxes([],Array.from({length:4},(_,i)=>good(i)),
    async()=>{throw Error('must never segment');});
  assert.deepEqual(result,[]);
});
test('rotated box uses pixel-aspect adjusted axis-aligned ROI but retains original oriented data',()=>{
  const input={x:.12,y:.22,w:.23,h:.15,rotation:12};
  const box=manualBoxGeometry(input,{pagePixelWidth:900,pagePixelHeight:650});
  assert.ok(box.w>input.w&&box.h>input.h);
  assert.equal(box.orientedBox.width,input.w);
  assert.equal(box.orientedBox.height,input.h);
  assert.equal(box.orientedBox.rotation,12);
});
test('changed manual boxes preserve the automatic candidate contract',async()=>{
  const input={x:.12,y:.22,w:.23,h:.15,rotation:0,manualChanged:true};
  let passed=null;
  const result=await refineManualBoxes([input],[],async geometry=>{
    passed=geometry;
    return {...geometry,mask:{width:1,height:1,alpha:new Uint8Array([255])}};
  },{pagePixelWidth:900,pagePixelHeight:650});
  assert.equal(result.length,1);
  for(const key of ['x','y','w','h','orientedBox','seedDensity','fillRatio'])
    assert.ok(Object.hasOwn(passed,key),key);
});
test('manual source has atomic list commit and avoids colour map on pure deletion',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/const allOriginal=manual&&plans\.every\(plan=>!!plan\.original\)/);
  assert.match(app,/const lighting=!allOriginal&&/);
  assert.match(app,/\{pagePixelWidth:source\.width\*b\.w,pagePixelHeight:source\.height\*b\.h\}/);
  assert.match(app,/if\(original\)\{next\.push\(original\);continue;\}/);
});
