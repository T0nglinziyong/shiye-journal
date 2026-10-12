import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {eraserBehavior,pointerSamples,eraserPathSamples,eraseStrokesAlongPath} from '../src/ink-gesture.js';

const read=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');

test('standard erases only the contacted part; brush erases the entire intersected stroke',()=>{
 const source={id:'ink',penStyle:'fountain',width:2,color:'#30463d',points:Array.from({length:41},(_,i)=>({x:i*5,y:50,p:.5}))};
 const standard=eraserBehavior({eraserStyle:'standard',eraserWidth:20});
 const brush=eraserBehavior({eraserStyle:'brush',eraserWidth:20});
 assert.deepEqual({standard:standard.whole,brush:brush.whole},{standard:false,brush:true});
 const path=[{x:100,y:50}];
 const split=eraseStrokesAlongPath([source],path,standard.radius,standard.whole);
 assert.equal(split.length,2);
 assert.ok(split.every(item=>item.points.length>0));
 assert.equal(split[0].points.at(-1).x<100,true);
 assert.equal(split[1].points[0].x>100,true);
 assert.deepEqual(eraseStrokesAlongPath([source],path,brush.radius,brush.whole),[]);
 assert.equal(source.points.length,41,'the original snapshot must remain intact');
});

test('highlighter-only eraser ignores ordinary ink and preserves pen properties',()=>{
 const pen={id:'p',width:3,penStyle:'ballpoint',color:'#112233',points:[{x:1,y:0},{x:3,y:0}]};
 const marker={...structuredClone(pen),id:'m',penStyle:'marker'};
 const erased=eraseStrokesAlongPath([pen,marker],[{x:2,y:0}],4,true,true);
 assert.equal(erased.length,1);assert.equal(erased[0],pen);
});

test('coalesced Pencil samples and final lift are lossless and de-duplicated',()=>{
 const mk=(x,y,p=.5)=>({clientX:x,clientY:y,pressure:p});
 const event={...mk(15,15),getCoalescedEvents:()=>[mk(10,10),mk(10,10),mk(12,12)]};
 const samples=pointerSamples(event,e=>({x:e.clientX,y:e.clientY,p:e.pressure}),{x:5,y:5});
 assert.deepEqual(samples.map(p=>p.x),[10,12,15]);
 const interpolation=eraserPathSamples({x:0,y:0},{x:80,y:0},7);
 assert.ok(interpolation.length>8&&interpolation.length<40);
 assert.deepEqual(interpolation.at(-1),{x:80,y:0});
});

test('editor uses fast incremental canvas paint with a size-matched eraser circle',async()=>{
 const [editor,viewport,css,tree]=await Promise.all([
   read('canvas-editor-ui.js'),read('canvas-viewport.js'),read('canvas-editor-fixes.css'),read('editor-layer-tree.js')]);
 assert.match(editor,/pts\.slice\(Math\.max\(0,painted-1\)\)/);
 assert.match(editor,/eraserSamples\s*=\s*\[\]/);
 assert.match(editor,/eraseStrokesAlongPath\(d\.strokes,samples/);
 assert.match(editor,/diameter=radius\*2\*scale/);
 assert.match(editor,/canvas-eraser-cursor/);
 assert.match(editor,/prefs\.wholeStroke=id==='brush'/);
 assert.match(editor,/ink\.onpointercancel=e=>/);
 assert.match(viewport,/page\.style\.flexShrink='0'/);
 assert.match(css,/\.canvas-page\.erasing-ink \.scene-ink-object/);
 assert.match(tree,/dismissOnOutside:true/);
 assert.match(tree,/createIcon\(locked\?'lock':'unlock'\)/);
 assert.match(tree,/createIcon\(hidden\?'eyeOff':'eye'\)/);
});
