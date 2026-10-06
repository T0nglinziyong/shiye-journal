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
  return processVision(cv,'materials-fast',{pixels,width,height,backgroundConnected,evidence,shadowLikelihood,score,smallestMM:6,paperWidthMM:210,paperHeightMM:297,rectified:true});
}

test('fast aperture detector carves only a repeated physical-hole pattern',async()=>{
  const out=await runSheet({printed:false});assert.equal(out.length,1,JSON.stringify(out.map(x=>({method:x.edgeMethod,holes:x.apertureCount,bbox:[x.x,x.y,x.w,x.h]}))));
  assert.ok(out[0].apertureCount>=4,'expected repeated physical holes: '+JSON.stringify({count:out[0].apertureCount,diag:out[0].apertureDiagnostics,ref:out[0].aperturePaperRef}));
});

test('repeated printed circles are not punched out when their fill is not paper-like',async()=>{
  const out=await runSheet({printed:true});assert.equal(out.length,1);
  assert.equal(out[0].apertureCount,0,'false holes are more costly than misses');
});


test('arbitrary enclosed paper-colour opening is carved without a circle prior',async()=>{
  const cv=await cvModule,width=520,height=720,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const box={x:110,y:100,w:300,h:500},opening=[[165,250],[210,230],[245,258],[230,305],[180,315],[150,285]];
  const insidePoly=(x,y,pts)=>{let hit=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}return hit;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,inside=x>=box.x&&x<box.x+box.w&&y>=box.y&&y<box.y+box.h,hole=inside&&insidePoly(x,y,opening);
    const color=!inside||hole?[242,242,242]:[125,175,215];pixels.set([...color,255],p);backgroundConnected[at]=inside?0:1;
    if(inside&&!hole){evidence[at]=1;score[at]=95;}
  }
  const out=await processVision(cv,'materials-fast',{pixels,width,height,backgroundConnected,evidence,shadowLikelihood,score,smallestMM:6,paperWidthMM:210,paperHeightMM:297,rectified:true});
  assert.equal(out.length,1);assert.ok(out[0].apertureCount>=1,JSON.stringify({count:out[0].apertureCount,diag:out[0].apertureDiagnostics,ref:out[0].aperturePaperRef}));
  const region=out[0].mask.apertureRegions?.[0];assert.ok(region&&region.w>20&&region.h>20,'opening shape should be preserved as a region');
});

test('large pale printed panel is not carved merely because it is light',async()=>{
  const cv=await cvModule,width=520,height=720,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const box={x:110,y:100,w:300,h:500},panel={x:155,y:235,w:175,h:125};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,inside=x>=box.x&&x<box.x+box.w&&y>=box.y&&y<box.y+box.h,inPanel=inside&&x>=panel.x&&x<panel.x+panel.w&&y>=panel.y&&y<panel.y+panel.h;
    const texture=inPanel&&((x+y)%9===0),color=!inside?[242,242,242]:inPanel?(texture?[232,230,226]:[238,237,234]):[205,150,185];
    pixels.set([...color,255],p);backgroundConnected[at]=inside?0:1;if(inside){evidence[at]=1;score[at]=90;}
  }
  const out=await processVision(cv,'materials-fast',{pixels,width,height,backgroundConnected,evidence,shadowLikelihood,score,smallestMM:6,paperWidthMM:210,paperHeightMM:297,rectified:true});
  assert.equal(out.length,1);assert.equal(out[0].apertureCount,0,'a printed panel must remain material');
});


test('checker-printed carrier keeps white print while carving repeated physical punch holes',async()=>{
  const cv=await cvModule,width=620,height=860,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const box={x:120,y:120,w:280,h:560},cell=56,holeX=145,holeYs=[205,300,395,490,585],holeR=13;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,inside=x>=box.x&&x<box.x+box.w&&y>=box.y&&y<box.y+box.h;let color=[242,242,242],hole=false,rim=false;
    if(inside){
      const cx=((x-box.x)/cell)|0,cy=((y-box.y)/cell)|0,white=(cx+cy)%2===0;
      color=white?[238,238,235]:[125,175,135];
    }
    for(const hy of holeYs){
      const d=Math.hypot(x-holeX,y-hy);if(d<=holeR){hole=true;color=[242,242,242];}else if(d<=holeR+3){rim=true;color=[105,105,105];}
    }
    pixels.set([...color,255],p);backgroundConnected[at]=inside?0:1;
    if(inside&&!hole&&!rim&&Math.max(...color)-Math.min(...color)>12){evidence[at]=1;score[at]=95;}
  }
  const out=await processVision(cv,'materials-fast',{pixels,width,height,backgroundConnected,evidence,shadowLikelihood,score,smallestMM:6,paperWidthMM:210,paperHeightMM:297,rectified:true});
  assert.equal(out.length,1,JSON.stringify(out.map(x=>({holes:x.apertureCount,method:x.edgeMethod,bbox:[x.x,x.y,x.w,x.h]}))));
  const material=out[0];assert.ok(material.apertureCount>=4&&material.apertureCount<=6,'expected the repeated physical punch pattern, not printed cells: '+JSON.stringify({count:material.apertureCount,diag:material.apertureDiagnostics}));
  const left=Math.round(material.x*width),top=Math.round(material.y*height),at=(gx,gy)=>{const lx=gx-left,ly=gy-top;return lx>=0&&ly>=0&&lx<material.mask.width&&ly<material.mask.height?material.mask.alpha[ly*material.mask.width+lx]:0;};
  // Centres of two white printed checker cells must stay material.
  assert.equal(at(box.x+cell/2,box.y+cell/2),255,'white printed cell must not become an aperture');
  assert.equal(at(box.x+cell*2.5,box.y+cell*2.5),255,'interior white print must remain opaque material');
  for(const hy of holeYs)assert.equal(at(holeX,hy),0,'physical punch hole must be transparent');
});
