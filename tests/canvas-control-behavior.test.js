import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerMayPanCanvas,fingerNavigatesCanvas,isIPadPointerDevice,
  clampedCanvasOffset,FONT_SIZE_PRESETS,adjacentFontSize} from '../src/canvas-control-behavior.js';

test('iPad separates finger navigation from Pencil drawing without changing phone drawing',()=>{
  assert.equal(isIPadPointerDevice({userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'}),true);
  assert.equal(isIPadPointerDevice({platform:'MacIntel',maxTouchPoints:5}),true);
  assert.equal(isIPadPointerDevice({userAgent:'Mozilla/5.0 (iPhone)',maxTouchPoints:5}),false);
  for(const tool of ['pen','highlighter','eraser','lasso']){
    assert.equal(fingerNavigatesCanvas({pointerType:'touch',tool,iPad:true}),true);
    assert.equal(fingerNavigatesCanvas({pointerType:'pen',tool,iPad:true}),false);
    assert.equal(fingerNavigatesCanvas({pointerType:'touch',tool,iPad:false}),false);
  }
  assert.equal(fingerNavigatesCanvas({pointerType:'touch',tool:'text',iPad:true}),false);
});

test('single-finger page pans while Pencil and direct material editing stay available',()=>{
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'select',background:true}),true);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'text',background:true}),true);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'shape',background:true}),true);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'pen',background:true,pencilEnabled:true}),true);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'pen',background:true,pencilEnabled:false}),false);
  assert.equal(fingerMayPanCanvas({pointerType:'pen',tool:'pen',background:true,pencilEnabled:true}),false);
  assert.equal(fingerMayPanCanvas({pointerType:'touch',tool:'select',background:false}),false);
});
test('paper always remains visibly anchored in the viewport after panning',()=>{
  assert.equal(clampedCanvasOffset(100,500,0,600),0);
  assert.equal(clampedCanvasOffset(112,512,0,600),0);
  assert.equal(clampedCanvasOffset(125,525,0,600),-1);
  assert.equal(clampedCanvasOffset(0,400,0,600),76);
  assert.ok(clampedCanvasOffset(-160,240,0,600)>0);
  assert.ok(clampedCanvasOffset(260,660,0,600)<0);
  assert.equal(clampedCanvasOffset(25,725,0,600),0);
  assert.equal(clampedCanvasOffset(-125,575,0,600),0);
  assert.equal(clampedCanvasOffset(200,900,0,600),-164);
  assert.equal(clampedCanvasOffset(-300,400,0,600),164);
  assert.ok(clampedCanvasOffset(500,600,0,600)<0);
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

test('proposed viewport is bounded before painting at every zoom and drag position',async()=>{
  const {boundedCanvasViewport}=await import('../src/canvas-control-behavior.js');
  for(const [width,height,hostWidth,hostHeight] of [[550,389,588,1000],[950,672,1024,600],[400,800,430,700]])
    for(const scale of [1,1.1,2,4,8,16])for(const x of [-10000,-100,0,100,10000])for(const y of [-10000,0,10000]){
      const pose=boundedCanvasViewport({scale,x,y},{width,height,hostWidth,hostHeight});
      for(const [size,available,offset] of [[width,hostWidth,pose.x],[height,hostHeight,pose.y]]){
        const start=(available-size*scale)/2+offset*scale,end=start+size*scale;
        if(size*scale<=available)assert.equal(offset,0);
        else {assert.ok(start<=12.001);assert.ok(end>=available-12.001);}
      }
    }
  assert.equal(boundedCanvasViewport({scale:20},{width:400,height:800,hostWidth:430,hostHeight:700}).scale,16);
});
