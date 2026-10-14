import assert from 'node:assert/strict';
import test from 'node:test';
import {paperWidthPixels,pressureInkOutline,pressureInkPath,erasePressureStroke} from '../src/pressure-ink.js';
import {inkScenePaths} from '../src/ink-scene-svg.js';

test('new pen widths are measured against the physical sheet, not screen zoom',()=>{
  const draft={canvas:{width:842,height:1191},physicalPageHeightMM:297};
  assert.ok(Math.abs(paperWidthPixels(draft,.5)-1191*.5/297)<1e-9);
  assert.throws(()=>paperWidthPixels(draft,0),/实际宽度/);
});

test('pressure outline and SVG use the same editable Scene points',()=>{
  const stroke={id:'new-ink',type:'ink',penStyle:'pressure',width:3,color:'#123456',
    points:[{x:10,y:20,p:.2},{x:30,y:22,p:.8},{x:50,y:30,p:.4}]};
  const before=structuredClone(stroke);
  const outline=pressureInkOutline(stroke);
  assert.ok(outline.length>6);
  assert.ok(pressureInkPath(stroke).startsWith('M '));
  assert.ok(inkScenePaths(stroke).includes(pressureInkPath(stroke)));
  assert.deepEqual(stroke,before);
});

test('mouse stroke without pressure still renders and stays editable',()=>{
  const stroke={id:'mouse-ink',type:'ink',penStyle:'pressure',width:4,color:'#123456',
    points:[{x:4,y:5},{x:20,y:5},{x:40,y:9}]};
  assert.ok(pressureInkOutline(stroke).length>6);
  assert.ok(pressureInkPath(stroke).endsWith(' Z'));
  assert.ok(stroke.points.every(point=>!Object.hasOwn(point,'p')));
});

test('physical path eraser splits a long stroke between original samples',()=>{
  const stroke={id:'original',type:'ink',penStyle:'pressure',width:2,color:'#123456',
    points:[{x:0,y:0,p:.2},{x:100,y:0,p:.8}]};
  let id=0;
  const result=erasePressureStroke(stroke,[{x:50,y:-20},{x:50,y:20}],3,()=>`part-${++id}`);
  assert.equal(result.length,2);
  assert.ok(result[0].points.at(-1).x<50);
  assert.ok(result[1].points[0].x>50);
  assert.ok(result[0].points.at(-1).p>.2);
  assert.ok(result[1].points[0].p<.8);
  assert.ok(Math.abs(result[0].points.at(-1).x-46)<.02);
  assert.ok(Math.abs(result[1].points[0].x-54)<.02);
  assert.equal(stroke.points.length,2);
});

test('small eraser crossing a very long segment stays bounded and finds the crossing',()=>{
  const stroke={id:'long',type:'ink',penStyle:'pressure',width:2,color:'#123456',
    points:[{x:0,y:0,p:.2},{x:100000,y:0,p:.8}]};
  const result=erasePressureStroke(stroke,[{x:50000,y:-4},{x:50000,y:4}],1,()=>Math.random().toString());
  assert.equal(result.length,2);
  assert.ok(result[0].points.at(-1).x<50000);
  assert.ok(result[1].points[0].x>50000);
  assert.ok(result.flatMap(part=>part.points).length<50);
});
