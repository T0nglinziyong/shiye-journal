import test from 'node:test';
import assert from 'node:assert/strict';
import {solveHomography,mapPoint,validateCorners} from '../src/perspective.js';

test('inverse projective map keeps four reference corners',()=>{
  const from=[{x:0,y:0},{x:210,y:0},{x:210,y:297},{x:0,y:297}];
  const to=[{x:22,y:9},{x:241,y:30},{x:215,y:321},{x:4,y:275}];
  const h=solveHomography(from,to);
  for(let i=0;i<4;i++){
    const p=mapPoint(h,from[i].x,from[i].y);
    assert.ok(Math.abs(p.x-to[i].x)<1e-7);
    assert.ok(Math.abs(p.y-to[i].y)<1e-7);
  }
});
test('degenerate paper boundary is rejected',()=>{
  assert.throws(()=>validateCorners(Array(4).fill({x:.5,y:.5})));
});
