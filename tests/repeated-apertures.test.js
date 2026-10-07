import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {restoreRepeatedApertures} from '../src/repeated-apertures.js';

function makeCandidate(x,y,w,h,pageW,pageH){
  return {
    x:x/pageW,y:y/pageH,w:w/pageW,h:h/pageH,
    mask:{width:w,height:h,alpha:new Uint8Array(w*h).fill(255),polygons:[]}
  };
}

test('repeated aperture recovery carves an observed five-hole manufactured row',async()=>{
  const cv=await cvModule,pageW=420,pageH=594,pixels=new Uint8ClampedArray(pageW*pageH*4),
    x0=95,y0=95,mw=210,mh=350;
  // Neutral A4 page.
  for(let i=0;i<pageW*pageH;i++)pixels.set([242,242,242,255],i*4);
  // Coloured material.
  for(let y=y0;y<y0+mh;y++)for(let x=x0;x<x0+mw;x++)pixels.set([112,168,140,255],(y*pageW+x)*4);
  // Five real openings: exposed paper centre + dark physical rim.
  const centres=[[118,150],[124,215],[130,280],[136,345],[142,410]],r=9;
  for(const [cx,cy] of centres)for(let y=cy-r-2;y<=cy+r+2;y++)for(let x=cx-r-2;x<=cx+r+2;x++){
    const d=Math.hypot(x-cx,y-cy);
    if(d<=r+1&&d>=r-2)pixels.set([55,55,55,255],(y*pageW+x)*4);
    else if(d<r-2)pixels.set([242,242,242,255],(y*pageW+x)*4);
  }
  const [out]=restoreRepeatedApertures(cv,{
    pixels,width:pageW,height:pageH,candidates:[makeCandidate(x0,y0,mw,mh,pageW,pageH)],
    paperWidthMM:210,paperHeightMM:297
  });
  assert.equal(out.apertureCount,5,JSON.stringify(out.apertureRegions));
  const transparent=Array.from(out.mask.alpha).filter(v=>v===0).length;
  assert.ok(transparent>700,'five physical holes should create a substantial transparent area');
});

test('repeated aperture recovery ignores decorative circles deep inside a card',async()=>{
  const cv=await cvModule,pageW=420,pageH=594,pixels=new Uint8ClampedArray(pageW*pageH*4),
    x0=65,y0=125,mw=285,mh=250;
  for(let i=0;i<pageW*pageH;i++)pixels.set([242,242,242,255],i*4);
  for(let y=y0;y<y0+mh;y++)for(let x=x0;x<x0+mw;x++)pixels.set([220,150,184,255],(y*pageW+x)*4);
  // Repeated white printed dots are intentionally deep in the carrier, not
  // near an outer manufacturing edge.
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
