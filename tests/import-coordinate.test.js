import test from 'node:test';
import assert from 'node:assert/strict';
import {paperOverlayRect} from '../src/import-coordinate.js';
test('manual boxes use the same paper-relative coordinates as full-resolution crops',()=>{
  const source={width:3024,height:4032},paper={x:.08,y:.05,w:.84,h:.91},region={x:.27,y:.23,w:.3,h:.42};
  for(const [width,height] of [[330,450],[345,380],[1100,560]]){
    const frame=paperOverlayRect(width,height,source.width,source.height,paper);
    const scale=Math.min(width/source.width,height/source.height);
    const imageLeft=(width-source.width*scale)/2,imageTop=(height-source.height*scale)/2;
    assert.ok(Math.abs(frame.left+region.x*frame.width-(imageLeft+(paper.x+region.x*paper.w)*source.width*scale))<1e-9);
    assert.ok(Math.abs(frame.top+region.y*frame.height-(imageTop+(paper.y+region.y*paper.h)*source.height*scale))<1e-9);
  }
});
