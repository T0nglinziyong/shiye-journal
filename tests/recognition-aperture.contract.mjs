import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';

test('checker-printed carrier keeps white print while carving repeated physical punch holes',async()=>{
  const cv=await cvModule,width=620,height=860,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const box={x:120,y:120,w:280,h:560},cell=56,holeX=150,holeYs=[205,300,395,490,585],holeR=14;
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
  const material=out[0];assert.ok(material.apertureCount>=4&&material.apertureCount<=6,'expected repeated physical punches, not printed cells: '+JSON.stringify({count:material.apertureCount,diag:material.apertureDiagnostics}));
  const left=Math.round(material.x*width),top=Math.round(material.y*height),at=(gx,gy)=>{const lx=Math.round(gx-left),ly=Math.round(gy-top);return lx>=0&&ly>=0&&lx<material.mask.width&&ly<material.mask.height?material.mask.alpha[ly*material.mask.width+lx]:0;};
  assert.equal(at(box.x+cell/2,box.y+cell/2),255,'white printed cell must remain opaque material');
  assert.equal(at(box.x+cell*2.5,box.y+cell*2.5),255,'interior white print must remain opaque material');
  for(const hy of holeYs)assert.equal(at(holeX,hy),0,'physical punch hole must be transparent');
});
