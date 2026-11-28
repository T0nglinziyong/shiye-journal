import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {restoreRepeatedApertures,selectRepeatedApertureGroup} from '../src/repeated-apertures.js';

const manufacturedRow=edgeDistance=>[0,1,2,3,4].map(i=>({
  x:18+i*.6,y:40+i*48,r:9,
  edgeDistance,edgeSupport:.91,pageDistance:2.5,ringMaterialFraction:.98
}));

test('repeated aperture grouping accepts a five-hole manufactured lattice',()=>{
  const group=selectRepeatedApertureGroup(manufacturedRow(12),2.5);
  assert.equal(group.length,5);
  assert.deepEqual(group.map(q=>q.y),[40,88,136,184,232]);
});

test('repeated aperture grouping rejects an otherwise regular row deep inside a card',()=>{
  const group=selectRepeatedApertureGroup(manufacturedRow(35),2.5);
  assert.equal(group.length,0);
});

function makeCandidate(x,y,w,h,pageW,pageH){
  return {
    x:x/pageW,y:y/pageH,w:w/pageW,h:h/pageH,
    mask:{width:w,height:h,alpha:new Uint8Array(w*h).fill(255),polygons:[]}
  };
}

test('repeated aperture recovery ignores decorative circles deep inside a card',async()=>{
  const cv=await cvModule,pageW=420,pageH=594,pixels=new Uint8ClampedArray(pageW*pageH*4),
    x0=65,y0=125,mw=285,mh=250;
  for(let i=0;i<pageW*pageH;i++)pixels.set([242,242,242,255],i*4);
  for(let y=y0;y<y0+mh;y++)for(let x=x0;x<x0+mw;x++)pixels.set([220,150,184,255],(y*pageW+x)*4);
  for(const cx of [120,165,210,255,300]){
    const cy=250,r=10;
    for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
      const d=Math.hypot(x-cx,y-cy);
      if(d<=r&&d>=r-2)pixels.set([70,70,70,255],(y*pageW+x)*4);
      else if(d<r-2)pixels.set([242,242,242,255],(y*pageW+x)*4);
    }
  }
  const [out]=restoreRepeatedApertures(cv,{
    pixels,width:pageW,height:pageH,candidates:[makeCandidate(x0,y0,mw,mh,pageW,pageH)],
    paperWidthMM:210,paperHeightMM:297
  });
  assert.equal(out.apertureCount,0);
  assert.ok(Array.from(out.mask.alpha).every(v=>v===255));
});
