import test from 'node:test';
import assert from 'node:assert/strict';
import {popupPlacement} from '../src/popover-placement.js';

test('desktop editor toolbar opens picker below, not over the title bar',()=>{
  const result=popupPlacement({anchor:{left:403,top:114,bottom:164},viewportWidth:1440,
    viewportHeight:900,popupWidth:340,popupHeight:440,picker:true});
  assert.equal(result.side,'below');
  assert.equal(result.top,172);
  assert.equal(result.left,403);
  assert.ok(result.top+Math.min(440,result.maxHeight)<=888);
});

test('narrow phone and tablet safely constrain horizontal bounds and picker height',()=>{
  for(const [width,height,left] of [[320,640,280],[390,844,355],[768,1024,690],[1024,768,960],[2560,1440,2450]]){
    const result=popupPlacement({anchor:{left,top:105,bottom:165},viewportWidth:width,
      viewportHeight:height,popupWidth:340,popupHeight:440,picker:true});
    assert.equal(result.side,'below');
    assert.ok(result.left>=12&&result.left+result.width<=width-12,{result,width});
    assert.ok(result.top>=165&&result.top+Math.min(440,result.maxHeight)<=height-12,{result,height});
  }
});

test('buttons near bottom open upward, without leaving screen or covering anchor',()=>{
  const result=popupPlacement({anchor:{left:100,top:700,bottom:750},viewportWidth:1200,
    viewportHeight:800,popupWidth:270,popupHeight:350});
  assert.equal(result.side,'above');
  assert.ok(result.top>=12&&result.top+350<700);
});

test('compact landscape is still usable when no full-height popup fits',()=>{
  const result=popupPlacement({anchor:{left:260,top:75,bottom:110},viewportWidth:380,
    viewportHeight:250,popupWidth:340,popupHeight:440,picker:true});
  assert.ok(result.left>=12&&result.left+result.width<=368);
  assert.ok(result.top>=12);
  assert.ok(result.top+result.maxHeight<=238);
  assert.ok(result.maxHeight>=80);
});
