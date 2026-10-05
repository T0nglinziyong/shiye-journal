import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';

async function runSheet({printed=false}={}){
  const cv=await cvModule,width=620,height=860,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const box={x:120,y:120,w:280,h:560},cx=150,ys=[205,300,395,490,585],r=14;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,inside=x>=box.x&&x<box.x+box.w&&y>=box.y&&y<box.y+box.h;let color=[242,242,242],hole=false,rim=false;
    if(inside)color=[125,175,215];
    for(const hy of ys){
      const d=Math.hypot(x-cx,y-hy);
      if(d<=r){hole=true;color=printed?[255,218,170]:[242,242,242];}
      else if(!printed&&d<=r+3){rim=true;color=[118,118,118];}
    }
    pixels.set([...color,255],p);
    backgroundConnected[at]=inside?0:1;
    if(inside&&!hole&&!rim){evidence[at]=1;score[at]=95;}
  }
  return processVision(cv,'materials-fast',{pixels,width,height,backgroundConnected,evidence,shadowLikelihood,score,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
}

test('fast aperture detector carves only a repeated physical-hole pattern',async()=>{
  const out=await runSheet({printed:false});assert.equal(out.length,1,JSON.stringify(out.map(x=>({method:x.edgeMethod,holes:x.apertureCount,bbox:[x.x,x.y,x.w,x.h]}))));
  assert.ok(out[0].apertureCount>=4,'expected repeated physical holes: '+JSON.stringify(out[0]));
});

test('repeated printed circles are not punched out when their fill is not paper-like',async()=>{
  const out=await runSheet({printed:true});assert.equal(out.length,1);
  assert.equal(out[0].apertureCount,0,'false holes are more costly than misses');
});
