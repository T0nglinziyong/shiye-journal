import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerMayPanCanvas,clampedCanvasOffset,FONT_SIZE_PRESETS,adjacentFontSize} from '../src/canvas-control-behavior.js';

test('single-finger page pans while Pencil and direct material editing stay available',()=>{
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'select',background:true}),true);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'text',background:true}),true);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'shape',background:true}),true);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'pen',background:true,pencilEnabled:true}),true);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'pen',background:true,pencilEnabled:false}),false);
  assert.equal(fingerMayPanCanvas({pointerType:'pen',tool:'pen',background:true,pencilEnabled:true}),false);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'select',background:false}),false);
});
test('a fitted page may move within a bounded region instead of snapping back to exact center',()=>{
  assert.equal(clampedCanvasOffset(100,500,0,600),0);
  assert.equal(clampedCanvasOffset(125,525,0,600),0);
  assert.equal(clampedCanvasOffset(0,400,0,600),0);
  assert.ok(clampedCanvasOffset(-160,240,0,600)>0);
  assert.ok(clampedCanvasOffset(260,660,0,600)<0);
  assert.equal(clampedCanvasOffset(25,725,0,600),-25);
  assert.equal(clampedCanvasOffset(-125,575,0,600),25);
});
test('font size arrows select discrete print-friendly sizes without opening keyboard',()=>{
  assert.ok(FONT_SIZE_PRESETS.includes(22)&&FONT_SIZE_PRESETS.includes(24)&&FONT_SIZE_PRESETS.includes(28));
  assert.equal(adjacentFontSize(22,1),24);
  assert.equal(adjacentFontSize(24,1),28);
  assert.equal(adjacentFontSize(28,-1),24);
  assert.equal(adjacentFontSize(23,1),24);
  assert.equal(adjacentFontSize(23,-1),22);
  assert.equal(adjacentFontSize(400,1),400);
  assert.equal(adjacentFontSize(14,-1),14);
});
