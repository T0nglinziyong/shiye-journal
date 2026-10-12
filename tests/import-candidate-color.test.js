import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractEditableCandidateRGB} from '../src/import-candidate-color.js';

const photo=new Uint8ClampedArray([
  88,102,110,255,
  100,112,120,255,
  120,130,142,255,
  150,160,170,255
]);
const region={x:0,y:0,w:1,h:1,mask:{width:2,height:2,alpha:[255,0,255,0]}};

function mockCrop(calls){
 return async(_source,_paper,candidate,{lighting,raw=false}={})=>{
   calls.push({hasMask:!!candidate.mask,lighting,raw});
   const rgba=new Uint8ClampedArray(photo);
   if(lighting)for(let i=0;i<rgba.length;i+=4){
     rgba[i]+=25;rgba[i+1]+=16;rgba[i+2]+=10;
   }
   if(candidate.mask)for(let i=0;i<4;i++)rgba[i*4+3]=candidate.mask.alpha[i];
   return rgba;
 };
}

test('masked output and its complete candidate frame preserve the same RGB correction',async()=>{
  const calls=[],map={gains:[1.15,1.12,1.1]};
  const {cutout,fullColor}=await extractEditableCandidateRGB({}, {x:0,y:0,w:1,h:1},region,{
    lighting:map,crop:mockCrop(calls)
  });
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(x=>[x.hasMask,x.lighting===map,x.raw]),[
    [true,true,false],[false,true,false]
  ]);
  // The restored pixel was completely transparent in the initial cutout.
  // Hand-painting it back must uncover corrected RGB, not the old photo RGB.
  assert.equal(cutout[7],0);
  assert.equal(fullColor[7],255);
  assert.deepEqual([...fullColor.slice(4,7)],[125,128,130]);
  assert.deepEqual([...cutout.slice(4,7)],[125,128,130]);
  assert.deepEqual([...photo.slice(4,7)],[100,112,120]);
  assert.deepEqual([...fullColor.filter((_,i)=>i%4===3)],[255,255,255,255]);
});

test('explicit original-photo colour mode is unmodified, and no mask avoids extra extraction',async()=>{
  const calls=[];
  const full=await extractEditableCandidateRGB({}, {},region,{lighting:null,crop:mockCrop(calls)});
  assert.deepEqual([...full.fullColor.slice(4,7)],[100,112,120]);
  assert.deepEqual(calls.map(x=>x.lighting),[null,null]);
  const none={...region,mask:null};const next=[];
  const result=await extractEditableCandidateRGB({}, {},none,{lighting:{test:true},crop:mockCrop(next)});
  assert.equal(next.length,1);
  assert.strictEqual(result.cutout,result.fullColor);
});

test('imported work and library candidates align the color-corrected source, never raw RGB',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/extractEditableCandidateRGB\(source,box,region,\{lighting,crop:cropBitmap\}\)/);
  assert.match(app,/originalBlob:fullColor,candidateFrameBlob:fullColor/);
  assert.match(app,/alignMaterialPreview\(cutout,fullColor,/);
  // The export and cutout editor still persist/use the same fields, so reopening
  // a corrected import after saving cannot silently select raw camera bytes.
  const saved=await readFile(new URL('../src/import-save.js',import.meta.url),'utf8');
  assert.match(saved,/data:c\.candidateFrameBlob\|\|c\.originalBlob\|\|c\.blob/);
  const editor=await readFile(new URL('../src/cutout-editor.js',import.meta.url),'utf8');
  assert.match(editor,/imageFrame=new ImageData\(new Uint8ClampedArray\(sourcePixels\.data\),w,h\)/);
});
