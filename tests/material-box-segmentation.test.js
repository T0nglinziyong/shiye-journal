import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {segmentationPlanForBox} from '../src/material-box-segmentation.js';

test('box segmentation selector uses MorphGAC only for untruncated pale carriers',()=>{
  assert.equal(segmentationPlanForBox({boxAdjustment:'pale-carrier-margin',touchesProtectedFrame:false}).kind,'morphgac');
  assert.equal(segmentationPlanForBox({boxAdjustment:'pale-carrier-margin',touchesProtectedFrame:true}).kind,'grabcut');
  assert.equal(segmentationPlanForBox({boxAdjustment:'raw',touchesProtectedFrame:false}).kind,'grabcut');
});

test('box-driven rectangle GrabCut recovers a colored material from an automatic safety box',async()=>{
  const cv=await cvModule,width=220,height=300,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inside=x>=62&&x<166&&y>=70&&y<230,p=(y*width+x)*4,
      color=inside?[112,176,142]:[245,245,245];
    pixels.set([...color,255],p);
  }
  const box={x:57/width,y:65/height,w:114/width,h:170/height,boxAdjustment:'raw',touchesProtectedFrame:false};
  const [out]=await processVision(cv,'segment-boxes-classical',{pixels,width,height,boxes:[box],paperWidthMM:210,paperHeightMM:297});
  assert.equal(out.segmentationMethod,'grabcut');
  assert.equal(out.edgeMethod,'box-grabcut-rect');
  assert.ok(Math.abs(out.x-62/width)<.025);
  assert.ok(Math.abs(out.y-70/height)<.025);
  assert.ok(Math.abs(out.w-104/width)<.03);
  assert.ok(out.mask?.alpha?.length>0);
});

test('box-driven MorphGAC shrinks from a safety box to a pale outer carrier',async()=>{
  const cv=await cvModule,width=220,height=300,pixels=new Uint8ClampedArray(width*height*4),
    cx=110,cy=150,rx=55,ry=92;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const q=((x-cx)/rx)**2+((y-cy)/ry)**2,
      ellipse=q<=1,border=ellipse&&q>=.94,p=(y*width+x)*4,
      color=border?[145,145,142]:ellipse?[224,224,218]:[246,246,246];
    pixels.set([...color,255],p);
  }
  const box={x:50/width,y:52/height,w:120/width,h:196/height,boxAdjustment:'pale-carrier-margin',touchesProtectedFrame:false};
  const [out]=await processVision(cv,'segment-boxes-classical',{pixels,width,height,boxes:[box],paperWidthMM:210,paperHeightMM:297});
  assert.equal(out.segmentationMethod,'morphgac');
  assert.equal(out.edgeMethod,'box-morphgac');
  assert.ok(out.x>45/width&&out.x<70/width);
  assert.ok(out.y>45/height&&out.y<75/height);
  assert.ok(out.w>95/width&&out.w<125/width);
  assert.ok(out.mask?.alpha?.length>0);
});
