import test from 'node:test';
import assert from 'node:assert/strict';
import {containBox} from '../src/preview-geometry.js';
import {commonShapes,advancedShapes,configureShape,shapeSVG,straightStroke,eraseStrokes,resizeObject,textLines,textFont,textFontFamily} from '../src/editor-tools-model.js';

test('R-08: editor, cover, and canvas export share the installed artistic font decision',()=>{
  for(const style of ['hand','serif','rounded','sans']){
    const block={style,fontSize:28,fontName:null},family=textFontFamily(block);
    assert.ok(textFont(block).endsWith(`28px ${family}`));
    assert.match(family,style==='hand'?/^"Ma Shan Zheng",/:style==='serif'?/^"Songti SC",/:style==='rounded'?/^"Arial Rounded MT Bold",/:/^"PingFang SC",/);
  }
  assert.equal(textFontFamily({fontSize:20}),textFontFamily({style:'hand',fontSize:20}));
  const named={style:'serif',fontName:'Ma Shan Zheng',fontSize:20};
  assert.ok(textFontFamily(named).startsWith('"Ma Shan Zheng","Songti SC",'));
  assert.ok(textFont(named).endsWith(`20px ${textFontFamily(named)}`));
});
import {composeCrop,validateCrop} from '../src/material-processing-editor.js';
import {onDialogClosed} from '../src/dialog-lifecycle.js';
import {ImageNodeCache} from '../src/image-node-cache.js';
test('compound PDF vector paths preserve hollow frames instead of filling each contour',()=>{const svg=shapeSVG({kind:'vector',width:100,height:100,fill:'#123456',vectorPaths:[[[0,0],[1,0],[1,1],[0,1]],[[.2,.2],[.8,.2],[.8,.8],[.2,.8]]]});assert.match(svg,/fill-rule="evenodd"/);assert.equal((svg.match(/<path /g)||[]).length,1);assert.equal((svg.match(/M[\d.-]/g)||[]).length,2);});
test('extreme tall/wide preview fits every pixel with the original aspect ratio',()=>{for(const [w,h] of [[80,4000],[4000,80],[4000,4000]])for(const [aw,ah] of [[300,300],[640,480]]){const b=containBox(w,h,aw,ah);assert.ok(b.left>=12&&b.top>=12);assert.ok(b.left+b.width<=aw-12+1e-8&&b.top+b.height<=ah-12+1e-8);assert.ok(Math.abs(b.width/b.height-w/h)<1e-8);}});
test('common and advanced shape presets, including freeform, produce editable SVG geometry',()=>{assert.ok(commonShapes.length>=19);assert.ok(advancedShapes.length>=16);for(const [kind] of [...commonShapes,...advancedShapes]){const shape=configureShape({id:kind},kind);assert.match(shapeSVG(shape),/^<svg/);assert.ok(shape.width>0&&shape.height>0);}assert.deepEqual(configureShape({},'vector').vectorPaths,[[[.1,.1],[.9,.1],[.8,.9],[.2,.9]]]);assert.notEqual(shapeSVG(configureShape({},'heart')),shapeSVG(configureShape({},'rectangle')));assert.ok(!shapeSVG({width:10,height:10,vectorPaths:[[['<foreignObject>',0],[1,1]]],stroke:'"<script>'}).includes('<foreignObject>'));assert.ok(!shapeSVG({kind:'dots',width:10,height:10,stroke:'"/><script>'}).includes('<script>'));});
test('straight marker changes only the new stroke, retaining pressure samples',()=>{const old={points:[{x:0,y:0,p:.2},{x:1,y:5,p:.8},{x:6,y:3,p:.5}]},next=straightStroke(old);assert.deepEqual(next.points[1],{x:3,y:1.5,p:.8});assert.equal(old.points[1].y,5);});
test('eraser detects between samples; whole and local erase preserve other strokes',()=>{const a={width:2,points:[{x:0,y:0},{x:40,y:0},{x:80,y:0},{x:120,y:0}]},b={width:2,points:[{x:0,y:100},{x:100,y:100}]};assert.deepEqual(eraseStrokes([a,b],{x:20,y:0},4),[b]);const local=eraseStrokes([a,b],{x:40,y:0},4,false);assert.ok(local.some(s=>s.points.some(p=>p.x===120)));assert.ok(local.includes(b));assert.equal(a.points.length,4);});
test('decoded image cache evicts by pixel budget and reuses matching source nodes',()=>{const node=(src,w=10)=>({complete:true,naturalWidth:w,naturalHeight:10,alt:'a',attributes:[],getAttribute:()=>src,hasAttribute:()=>true,setAttribute(){},removeAttribute(){}});const a=node('a'),b=node('b'),cache=new ImageNodeCache(2,150);cache.remember([a,b]);assert.equal(cache.take(node('a')),null);assert.equal(cache.take(node('b')),b);assert.equal(cache.pixels,0);});
test('corner resize preserves the opposite rotated corner and aspect ratio',()=>{const start={x:100,y:120,width:80,height:40,rotation:30},next=resizeObject(start,1,1,30,20),corner=o=>({x:o.x-o.width*Math.cos(Math.PI/6)/2+o.height*Math.sin(Math.PI/6)/2,y:o.y-o.width*Math.sin(Math.PI/6)/2-o.height*Math.cos(Math.PI/6)/2});assert.ok(Math.abs(next.width/next.height-2)<1e-8);const a=corner(start),b=corner(next);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8);});
test('continued material cut composes inside the current piece and rejects tiny results',()=>{const next=composeCrop({x:0,y:0,width:.5,height:1},{x:.5,y:0,width:.5,height:1});assert.deepEqual(next,{x:.25,y:0,width:.25,height:1});assert.equal(validateCrop(next,20,30),next);assert.throws(()=>validateCrop(next,NaN,30),/实物尺寸/);assert.throws(()=>validateCrop(next,4,30),/2 mm/);assert.throws(()=>validateCrop({x:.8,y:0,width:.4,height:1},20,30),/范围/);});
test('text layout retains explicit newlines and paragraph gaps while wrapping',()=>{const result=textLines({content:'abcd\nef',width:16,fontSize:10,paragraphSpacing:3},text=>text.length*8);assert.deepEqual(result.lines.map(l=>l.text),['ab','cd','ef']);assert.ok(result.lines[2].y>26);});
test('a queued close from the previous dialog cannot cancel the newly opened editor',()=>{const dialog=new EventTarget();dialog.open=true;let closed=0;onDialogClosed(dialog,()=>closed++);dialog.dispatchEvent(new Event('close'));assert.equal(closed,0);dialog.open=false;dialog.dispatchEvent(new Event('close'));dialog.dispatchEvent(new Event('close'));assert.equal(closed,1);});
test('reusable multicolor vectors keep every color layer, holes and opacity in shared preview/export',()=>{const svg=shapeSVG({kind:'vector',vectorLayers:[{fill:'#abcdef',opacity:.5,paths:[[[0,0],[1,0],[1,1]]]},{fill:'#fedcba',opacity:1,paths:[[[0,0],[.5,0],[.5,.5]]]}]});assert.match(svg,/#abcdef/);assert.match(svg,/#fedcba/);assert.match(svg,/opacity="0.5"/);assert.equal((svg.match(/<path /g)||[]).length,2);assert.ok(!shapeSVG({vectorLayers:[{fill:'<script>',paths:[[['bad',0]]]}]}).includes('<script>'));});

test('highlighter-only eraser retains pen strokes',()=>{
  const pen={penStyle:'fountain',width:3,points:[{x:0,y:0},{x:50,y:0}]};
  const marker={penStyle:'marker',width:8,points:[{x:0,y:0},{x:50,y:0}]};
  assert.deepEqual(eraseStrokes([pen,marker],{x:25,y:0},5,true,true),[pen]);
});

test('journal shapes and WPS-like paint settings render as separate editable SVG properties',()=>{
  for(const kind of ['raindrop','cloud','sun','moon','flower','leaf','sparkle','ticket','postage','washi','wave','zigzag','bracket']){
    const shape=configureShape({id:kind},kind),svg=shapeSVG(shape);
    assert.match(svg,/<svg /);assert.match(svg,/<path /);
  }
  const svg=shapeSVG({kind:'heart',fill:'#ee7788',stroke:'#236655',lineWidth:6,width:100,height:100,fillOpacity:.28,strokeOpacity:.73});
  assert.match(svg,/fill="#ee7788"/);
  assert.match(svg,/stroke="#236655"/);
  assert.match(svg,/fill-opacity="0.28"/);
  assert.match(svg,/stroke-opacity="0.73"/);
  const invisible=shapeSVG({kind:'wave',fill:null,stroke:'#000000',lineWidth:2,width:100,height:30,strokeOpacity:0});
  assert.match(invisible,/stroke-opacity="0"/);
});
