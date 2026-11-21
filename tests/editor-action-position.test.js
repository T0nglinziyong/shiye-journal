import test from 'node:test';
import assert from 'node:assert/strict';
import {editorActionPosition} from '../src/editor-action-position.js';
test('off-paper selections keep touch targets below the toolbar and within all supported viewports',()=>{
 for(const [width,height] of [[320,568],[390,844],[768,1024],[1024,768],[1280,900]])for(const group of [false,true])for(const [x,y] of [[-1000,-1000],[width+1000,height+1000],[width/2,height/2]]){
  const p=editorActionPosition({x,y,width,height,toolbarBottom:112,group}),halfWidth=((group?5:4)*44+((group?5:4)-1)*2+6)/2;
  assert.ok(p.left-halfWidth>=8);assert.ok(p.left+halfWidth<=width-8);
  assert.ok(p.top-25>=120);assert.ok(p.top+25<=height-8);
 }
});
