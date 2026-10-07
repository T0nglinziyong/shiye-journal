import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
test('almost rectangular paper repairs a small bitten edge without a jagged contour',async()=>{
  const cv=await cvModule,width=120,height=160,alpha=new Uint8Array(width*height);
  for(let y=20;y<140;y++)for(let x=20;x<100;x++)alpha[y*width+x]=255;
  for(let y=110;y<122;y++)for(let x=20;x<26;x++)alpha[y*width+x]=0;
  const r=await processVision(cv,'material-mask',{alpha,width,height});assert.equal(r.edgeMethod,'slimsam-rectangular-prior');assert.equal(r.mask.polygons[0].length,4);
  assert.equal(r.mask.alpha[(115-Math.round(r.y*height))*r.mask.width+22-Math.round(r.x*width)],255);
});
test('model contour fills printed white holes but preserves a concave material boundary',async()=>{
  const cv=await cvModule,width=100,height=100,alpha=new Uint8Array(width*height);
  for(let y=20;y<80;y++)for(let x=20;x<80;x++)if(!(x>55&&y>55))alpha[y*width+x]=255;
  for(let y=30;y<40;y++)for(let x=30;x<40;x++)alpha[y*width+x]=0;
  const r=await processVision(cv,'material-mask',{alpha,width,height}),left=Math.round(r.x*width),top=Math.round(r.y*height),at=(x,y)=>r.mask.alpha[(y-top)*r.mask.width+x-left];
  assert.equal(at(35,35),255);assert.equal(at(70,70),0);assert.equal(at(0+left,0+top),0);
});
test('OpenCV local light balance is effective without changing source or alpha',async()=>{
  const cv=await cvModule,width=80,height=80,pixels=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=40+x*2;pixels[i+3]=x%2?128:255;}const original=pixels.slice(),out=await processVision(cv,'balance',{pixels,width,height});assert.deepEqual(pixels,original);assert.ok(out.pixels.some((v,i)=>i%4!==3&&v!==pixels[i]));for(let i=3;i<pixels.length;i+=4)assert.equal(out.pixels[i],pixels[i]);
});
test('OpenCV detects actual paper corners and refuses a featureless full photograph',async()=>{
  const cv=await cvModule,width=180,height=240,pixels=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,value=x>=20&&x<=160&&y>=20&&y<=220?240:60;pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}const corners=await processVision(cv,'quad',{pixels,width,height,paperRatio:140/200});assert.equal(corners.length,4);assert.ok(Math.abs(corners[0].x-20/180)<.01);assert.ok(Math.abs(corners[2].y-220/240)<.01);assert.equal(await processVision(cv,'quad',{pixels:new Uint8ClampedArray(width*height*4).fill(255),width,height,paperRatio:140/200}),null);
});















test('piecewise curve prior smooths a jagged oval without an ellipse class',async()=>{
  const cv=await cvModule,width=180,height=220,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height);
  for(let i=0;i<width*height;i++){pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=246;pixels[i*4+3]=255;backgroundConnected[i]=1;}
  const x0=48,y0=30,mw=86,mh=150,alpha=new Uint8Array(mw*mh);
  for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const dx=(x-mw/2)/(mw*.46),dy=(y-mh/2)/(mh*.47),n=dx*dx+dy*dy,wobble=(y%17===0&&x>mw*.35&&x<mw*.65);if(n<=1&&!wobble)alpha[y*mw+x]=255;}
  const candidate={x:x0/width,y:y0/height,w:mw/width,h:mh/height,evidenceDensity:.3,edgeMethod:'edge-enclosure',mask:{width:mw,height:mh,alpha,polygons:[]}};
  for(let y=y0;y<y0+mh;y++)for(let x=x0;x<x0+mw;x++){const at=y*width+x;if(alpha[(y-y0)*mw+x-x0]){backgroundConnected[at]=0;evidence[at]=1;pixels.set([232,232,230,255],at*4);}}
  const [r]=await processVision(cv,'complete-boundaries',{pixels,evidence,backgroundConnected,shadowLikelihood,width,height,candidates:[candidate],smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(r.boundaryModel,'line-curve');assert.equal(r.boundaryLineCount,0);assert.ok(r.boundaryCurveCount>=1);assert.ok(r.mask.polygons[0].length>16);
});







test('box discovery keeps independent full-page components as separate material boxes',async()=>{
  const cv=await cvModule,width=420,height=594,mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height),foregroundSeeds=new Uint8Array(width*height);
  const boxes=[[45,60,90,110],[245,70,105,125],[55,325,110,120],[250,335,95,110]];
  for(const [x0,y0,bw,bh] of boxes)for(let y=y0;y<y0+bh;y++)for(let x=x0;x<x0+bw;x++){const i=y*width+x;mask[i]=evidence[i]=foregroundSeeds[i]=1;}
  const out=await processVision(cv,'boxes-simple',{mask,evidence,foregroundSeeds,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(out.length,4,JSON.stringify(out));
  assert.ok(out.every(x=>x.instanceMethod==='connected-component-box'));
});

test('box discovery absorbs a small internal fragment without changing object count',async()=>{
  const cv=await cvModule,width=300,height=420,mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height),foregroundSeeds=new Uint8Array(width*height);
  for(let y=80;y<280;y++)for(let x=55;x<75;x++){const i=y*width+x;mask[i]=evidence[i]=1;}
  for(let y=80;y<280;y++)for(let x=205;x<225;x++){const i=y*width+x;mask[i]=evidence[i]=1;}
  for(let y=245;y<280;y++)for(let x=55;x<225;x++){const i=y*width+x;mask[i]=evidence[i]=1;}
  for(let y=135;y<165;y++)for(let x=125;x<150;x++){const i=y*width+x;mask[i]=evidence[i]=1;}
  const out=await processVision(cv,'boxes-simple',{mask,evidence,foregroundSeeds,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(out.length,1,JSON.stringify(out));
  assert.equal(out[0].absorbedFragments,1);
});

test('box discovery gives sparse-seed pale carriers a small physical safety margin',async()=>{
  const cv=await cvModule,width=420,height=594,mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height),foregroundSeeds=new Uint8Array(width*height);
  // An elliptical/sparse visual body inside a pale carrier: fill stays below
  // 0.8 and only a small portion is a strong seed.
  const cx=210,cy=275,rx=68,ry=112;
  for(let y=cy-ry;y<=cy+ry;y++)for(let x=cx-rx;x<=cx+rx;x++){
    const u=(x-cx)/rx,v=(y-cy)/ry;if(u*u+v*v>1)continue;
    const i=y*width+x;mask[i]=evidence[i]=1;
    if(Math.abs(x-cx)<7&&Math.abs(y-cy)<25)foregroundSeeds[i]=1;
  }
  const out=await processVision(cv,'boxes-simple',{mask,evidence,foregroundSeeds,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(out.length,1);assert.equal(out[0].boxAdjustment,'pale-carrier-margin');
  assert.ok(out[0].x<out[0].rawBox.x&&out[0].y<out[0].rawBox.y);
  assert.ok(out[0].x+out[0].w>out[0].rawBox.x+out[0].rawBox.w);
});

test('box discovery trims broad page-edge residue from a dense frame-touching body',async()=>{
  const cv=await cvModule,width=420,height=594,mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height),foregroundSeeds=new Uint8Array(width*height);
  // Main body x=80..300 is dense. A broad but vertically incomplete residue
  // near the page edge is connected by a top bridge, enlarging the raw bbox.
  for(let y=190;y<450;y++)for(let x=80;x<300;x++){const i=y*width+x;mask[i]=evidence[i]=foregroundSeeds[i]=1;}
  for(let y=195;y<390;y++)for(let x=3;x<70;x++){const i=y*width+x;mask[i]=evidence[i]=1;}
  for(let y=190;y<220;y++)for(let x=60;x<90;x++){const i=y*width+x;mask[i]=evidence[i]=1;}
  const out=await processVision(cv,'boxes-simple',{mask,evidence,foregroundSeeds,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(out.length,1,JSON.stringify(out));assert.equal(out[0].boxAdjustment,'dense-frame-body');
  assert.ok(out[0].x>.12,'dense body should reject the remote frame residue');
  assert.ok(out[0].rawBox.x<.02,'raw bbox should demonstrate the frame residue existed');
});

test('dense frame adjustment preserves a real material that genuinely reaches the page side',async()=>{
  const cv=await cvModule,width=420,height=594,mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height),foregroundSeeds=new Uint8Array(width*height);
  for(let y=130;y<390;y++)for(let x=0;x<150;x++){const i=y*width+x;mask[i]=evidence[i]=foregroundSeeds[i]=1;}
  const out=await processVision(cv,'boxes-simple',{mask,evidence,foregroundSeeds,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(out.length,1);assert.equal(out[0].boxAdjustment,'dense-frame-body');
  assert.equal(out[0].x,0,'a genuinely page-touching dense body must stay on the page edge');
});







test('browser MorphGAC refinement preserves validated repeated apertures',async()=>{
  const cv=await cvModule,width=140,height=180,pixels=new Uint8ClampedArray(width*height*4),x0=28,y0=20,mw=84,mh=140,alpha=new Uint8Array(mw*mh).fill(255),holes=[35,58,81,104,127];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*4,inside=x>=x0&&x<x0+mw&&y>=y0&&y<y0+mh,color=inside?[126,174,210]:[246,246,246];pixels.set([...color,255],p);}
  for(const hy of holes)for(let y=hy-5;y<=hy+5;y++)for(let x=35;x<=45;x++)if((x-40)**2+(y-hy)**2<=25){
    const gx=x0+x,gy=y0+y;if(gx>=0&&gx<width&&gy>=0&&gy<height){pixels.set([246,246,246,255],(gy*width+gx)*4);alpha[y*mw+x]=0;}
  }
  const candidate={x:x0/width,y:y0/height,w:mw/width,h:mh/height,pixels:mw*mh,recognitionConfidence:.5,mask:{width:mw,height:mh,alpha,polygons:[]}};
  const [out]=await processVision(cv,'material-boundary-refine',{pixels,width,height,candidates:[candidate],mode:'quality'});
  assert.ok(out?.mask?.alpha?.length);
  const left=Math.round(out.x*width),top=Math.round(out.y*height),at=(gx,gy)=>out.mask.alpha[(gy-top)*out.mask.width+gx-left];
  for(const hy of holes)assert.equal(at(x0+40,y0+hy),0,'validated punch hole must survive MorphGAC refinement');
  assert.equal(at(x0+65,y0+90),255,'material body must remain opaque');
  assert.equal(out.edgeMethod,'browser-morphgac');
});


test('hybrid browser refinement runs MorphGAC with full-resolution GrabCut polish',async()=>{
  const cv=await cvModule,width=160,height=190,pixels=new Uint8ClampedArray(width*height*4),x0=35,y0=30,mw=88,mh=118,alpha=new Uint8Array(mw*mh).fill(255);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,inside=x>=x0&&x<x0+mw&&y>=y0&&y<y0+mh,border=inside&&(x-x0<2||x0+mw-1-x<2||y-y0<2||y0+mh-1-y<2);
    const v=inside?(border?90:190):246;pixels.set([v,inside?205:v,inside?198:v,255],p);
  }
  const candidate={x:x0/width,y:y0/height,w:mw/width,h:mh/height,pixels:mw*mh,recognitionConfidence:.5,mask:{width:mw,height:mh,alpha,polygons:[]}};
  const [out]=await processVision(cv,'material-boundary-refine',{pixels,width,height,candidates:[candidate],mode:'hybrid'});
  assert.ok(out?.mask?.alpha?.length);
  assert.equal(out.edgeMethod,'browser-morphgac-grabcut');
  assert.ok(out.refinementMS>=0);
});

test('modular postprocess defaults equal explicit all-on and can be disabled',async()=>{
  const cv=await cvModule,width=150,height=180,pixels=new Uint8ClampedArray(width*height*4),x0=30,y0=28,mw=86,mh=120,alpha=new Uint8Array(mw*mh).fill(255);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,inside=x>=x0&&x<x0+mw&&y>=y0&&y<y0+mh,border=inside&&(x-x0<2||x0+mw-1-x<2||y-y0<2||y0+mh-1-y<2);
    const color=inside?(border?[90,120,105]:[150,198,170]):[246,246,246];pixels.set([...color,255],p);
  }
  const candidate={x:x0/width,y:y0/height,w:mw/width,h:mh/height,pixels:mw*mh,recognitionConfidence:.5,mask:{width:mw,height:mh,alpha,polygons:[]}},
    allOn={edgePolish:true,shapeRegularization:true,curveSmooth:true,apertures:true},
    allOff={edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false};
  const [implicit]=await processVision(cv,'material-boundary-refine',{pixels,width,height,candidates:[candidate],mode:'morphgac'});
  const [explicit]=await processVision(cv,'material-boundary-refine',{pixels,width,height,candidates:[candidate],mode:'morphgac',postprocess:allOn});
  const [raw]=await processVision(cv,'material-boundary-refine',{pixels,width,height,candidates:[candidate],mode:'morphgac',postprocess:allOff});
  assert.deepEqual(Array.from(implicit.mask.alpha),Array.from(explicit.mask.alpha),'default postprocess must equal explicit all-on pixel-for-pixel');
  assert.deepEqual(implicit.postprocessed,allOn);
  assert.deepEqual(explicit.postprocessed,allOn);
  assert.deepEqual(raw.postprocessed,allOff);
  assert.equal(raw.edgeMethod,'browser-morphgac');
  assert.ok(raw.mask?.alpha?.length&&implicit.mask?.alpha?.length);
});
