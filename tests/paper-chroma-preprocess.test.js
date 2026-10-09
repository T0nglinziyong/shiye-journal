import test from 'node:test';
import assert from 'node:assert/strict';
import {neutralizePaperChroma} from '../src/paper-chroma-preprocess.js';

test('neutralizes a paper colour gradient on the analysis copy while retaining object colour',()=>{
  const width=120,height=160,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,cast=15-30*y/height;
    pixels[i]=190-cast/2;pixels[i+1]=190;pixels[i+2]=190+cast/2;pixels[i+3]=255;
  }
  for(let y=65;y<95;y++)for(let x=50;x<70;x++){
    const i=(y*width+x)*4;pixels[i]=65;pixels[i+1]=160;pixels[i+2]=85;
  }
  const before=new Uint8ClampedArray(pixels),out=neutralizePaperChroma(pixels,width,height);
  assert.deepEqual(pixels,before,'the source used for final extraction stays byte-identical');
  for(const [x,y] of [[8,8],[111,8],[8,150],[111,150]]){
    const i=(y*width+x)*4;
    assert.ok(Math.abs(out[i]-out[i+2])<=2,'the analysed paper is neutral at each corner');
    assert.equal(out[i+3],255);
  }
  const i=(80*width+60)*4;
  assert.ok(out[i+1]-out[i]>80,'the coloured object remains distinguishable');
});

test('does not infer a white-paper cast from coloured corners',()=>{
  const pixels=new Uint8ClampedArray(120*160*4);
  for(let i=0;i<pixels.length;i+=4){pixels[i]=30;pixels[i+1]=100;pixels[i+2]=200;pixels[i+3]=255;}
  assert.equal(neutralizePaperChroma(pixels,120,160),pixels);
});
