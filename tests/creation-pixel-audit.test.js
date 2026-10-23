import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRenderedPixels} from '../src/creation-pixel-audit.js';

test('rendered-pixel advisory exposes visually empty space hidden by a transparent material frame',()=>{
 const width=240,height=160,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=(y*width+x)*4,ink=x>20&&x<90&&y>40&&y<120;
  data[index]=ink?50:247;data[index+1]=ink?70:244;data[index+2]=ink?80:236;data[index+3]=255;
 }
 const result=auditRenderedPixels(data,width,height,{paperColor:'#F7F4EC',pageMode:'spread'});
 assert.ok(result.pages[0].estimatedVisibleCoverage>.15);
 assert.ok(result.pages[1].estimatedVisibleCoverage<.01);
 assert.ok(result.pages[1].lowPaintRectangleFraction>.9);
 assert.match(result.observations.join(' '),/page.right/);
});
