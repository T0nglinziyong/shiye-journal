import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {analyzeCreationVisualBalance} from '../src/creation-visual-balance.js';

test('rendered pixels reveal an unbalanced top-heavy spread',()=>{
  const png=new PNG({width:240,height:180});
  for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
    const i=(y*png.width+x)*4,ink=x<110&&y<95;
    png.data[i]=ink?30:251;png.data[i+1]=ink?60:249;png.data[i+2]=ink?70:239;png.data[i+3]=255;
  }
  const dataURL='data:image/png;base64,'+PNG.sync.write(png).toString('base64');
  const result=analyzeCreationVisualBalance(dataURL,'spread');
  assert.ok(result.pages[0].share>.9);
  assert.ok(result.notes.some(note=>note.includes('视觉重量')));
  assert.ok(result.notes.some(note=>note.includes('下方')));
  const sample=Buffer.alloc(32*32*3);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const i=(y*32+x)*3,ink=x<14&&y<17;
    sample[i]=ink?30:251;sample[i+1]=ink?60:249;sample[i+2]=ink?70:239;
  }
  const fromSample=analyzeCreationVisualBalance('data:image/jpeg;base64,unused','spread',sample.toString('base64'));
  assert.ok(fromSample.pages[0].share>.9);
});
