import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {expandWhiteCarrier} from '../src/white-carrier.js';
import {robustPaperLab} from '../src/paper-reference.js';

test('printed foreground expands to a brighter white carrier and snaps to its physical edge',async()=>{
  const cv=await cvModule,width=260,height=340,pixels=new Uint8ClampedArray(width*height*4),page=cv.Mat.zeros(height,width,cv.CV_8UC1);
  const carrier=[[82,65],[160,55],[185,95],[169,132],[196,168],[170,205],[181,265],[133,282],[97,250],[70,208],[84,164],[62,122]];
  const inside=(x,y,pts)=>{let hit=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}return hit;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,p=i*4,inCarrier=inside(x,y,carrier),printed=inCarrier&&((x-125)**2+(y-145)**2<29**2||(x>105&&x<155&&y>155&&y<235));
    const color=printed?[72,72,72]:inCarrier?[237,237,237]:[205,205,205];pixels.set([...color,255],p);page.data[i]=inCarrier?0:255;
  }
  const rgba=cv.matFromArray(height,width,cv.CV_8UC4,pixels),rgb=new cv.Mat(),lab=new cv.Mat(),gray=new cv.Mat(),edges=new cv.Mat();
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);cv.Canny(gray,edges,8,28);
  const roughMask=cv.Mat.zeros(height,width,cv.CV_8UC1);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const inCarrier=inside(x,y,carrier),printed=inCarrier&&((x-125)**2+(y-145)**2<29**2||(x>105&&x<155&&y>155&&y<235));if(printed)roughMask.data[y*width+x]=255;}
  const k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(31,31));cv.morphologyEx(roughMask,roughMask,cv.MORPH_CLOSE,k);
  const cs=new cv.MatVector(),hh=new cv.Mat();cv.findContours(roughMask,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);let rough=null,area=0;for(let i=0;i<cs.size();i++){const q=cs.get(i),a=cv.contourArea(q);if(a>area){rough?.delete?.();rough=q;area=a;}else q.delete();}
  const paperRef=robustPaperLab(lab,page,width,height),out=expandWhiteCarrier(cv,{contour:rough,page,edges,lab,w:width,h:height,pxPerMM:width/210,paperRef});
  assert.ok(out.expanded,JSON.stringify(out));assert.ok(out.areaRatio>1.05,'carrier must expand beyond printed seed: '+JSON.stringify({ratio:out.areaRatio,support:out.edgeSupport}));
  assert.ok(out.seedCoverage>=.90,'expanded carrier must contain almost all printed seed: '+JSON.stringify(out));
  assert.ok(out.edgeSupport>=.22,'soft photographed carrier may have weak edge segments, but must retain measured support: '+JSON.stringify(out));
  const b=cv.boundingRect(out.contour);assert.ok(b.x<88&&b.x+b.width>178&&b.y<75&&b.y+b.height>270,JSON.stringify(b));
  if(out.owned)out.contour.delete();rough.delete();cs.delete();hh.delete();k.delete();roughMask.delete();rgba.delete();rgb.delete();lab.delete();gray.delete();edges.delete();page.delete();
});
