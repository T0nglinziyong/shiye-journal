import test from 'node:test';
import assert from 'node:assert/strict';
import {fillEnclosedAlphaHoles,fillCandidateMaskHoles} from '../src/mask-hole-fill.js';
import {postprocessSamCandidates} from '../src/sam-postprocess.js';

test('fills an enclosed transparent hole without changing the outer edge',()=>{
  const width=9,height=9,alpha=new Uint8Array(width*height);
  for(let y=1;y<8;y++)for(let x=1;x<8;x++)alpha[y*width+x]=255;
  alpha[4*width+4]=0;
  alpha[4*width+3]=180;
  const candidate={pixels:47,mask:{width,height,alpha,topologyPreserved:true}};
  const result=fillCandidateMaskHoles(candidate);
  assert.equal(result.mask.alpha[4*width+4],255);
  assert.equal(result.mask.alpha[4*width+3],255);
  assert.equal(result.mask.alpha[0],0);
  assert.equal(alpha[4*width+4],0);
  assert.equal(result.pixels,49);
});

test('keeps notches and diagonal openings connected to the outside',()=>{
  const width=7,height=7,alpha=new Uint8Array(width*height);
  for(let y=1;y<6;y++)for(let x=1;x<6;x++)alpha[y*width+x]=255;
  alpha[1*width+1]=0;
  alpha[2*width+2]=0;
  alpha[3*width+3]=0;
  const filled=fillEnclosedAlphaHoles(alpha,width,height);
  assert.equal(filled,alpha);
});

test('does not add unsupported foreground when a region has no mask',()=>{
  const region={x:0,y:0,w:1,h:1};
  assert.equal(fillCandidateMaskHoles(region),region);
});

test('SAM result can toggle hole filling from the saved mask without another model pass',async()=>{
  const width=5,height=5,alpha=new Uint8Array(width*height).fill(255);
  alpha[2*width+2]=0;
  const raw=[{x:0,y:0,w:1,h:1,mask:{width,height,alpha}}];
  const source={width,height};
  const filled=await postprocessSamCandidates(raw,source,{mergeSharedCarrier:true,fillMaskHoles:true});
  const original=await postprocessSamCandidates(raw,source,{mergeSharedCarrier:true,fillMaskHoles:false});
  assert.equal(filled[0].mask.alpha[2*width+2],255);
  assert.equal(original[0].mask.alpha[2*width+2],0);
  assert.equal(raw[0].mask.alpha[2*width+2],0);
});
