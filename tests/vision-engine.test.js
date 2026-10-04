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
test('GrabCut treats attached low-chroma shadow as background without clipping coloured paper',async()=>{
  const cv=await cvModule,width=160,height=180,pixels=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height),foregroundSeeds=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,p=i*4,paper=x>=40&&x<110&&y>=40&&y<140,shadow=x>=40&&x<125&&y>=40&&y<150;
    pixels.set(paper?[60,140,210,255]:shadow?[205,205,205,255]:[245,245,245,255],p);
    mask[i]=shadow?1:0;evidence[i]=foregroundSeeds[i]=paper?1:0;shadowLikelihood[i]=shadow&&!paper?1:0;
  }
  const before=pixels.slice(),result=await processVision(cv,'components',{mask,evidence,foregroundSeeds,shadowLikelihood,pixels,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(result.length,1);const r=result[0],a=r.mask,at=(x,y)=>a.alpha[(y-Math.round(r.y*height))*a.width+x-Math.round(r.x*width)];
  assert.equal(at(70,80),255);assert.equal(at(118,80),0);assert.equal(at(70,146),0);assert.deepEqual(pixels,before);
  assert.ok(a.polygons[0].length<=8,'straight paper must not have a staircase contour');
});

test('high-fill pale paper recovers a complete rectangle but a circular sticker is never squared',async()=>{
  const cv=await cvModule,width=160,height=160,pixels=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height),seeds=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*4;pixels.set([242,242,242,255],p);}
  for(let y=30;y<125;y++)for(let x=35;x<130;x++){
    if(x>105&&y<55)continue;
    const i=y*width+x,p=i*4;pixels.set([218,225,205,255],p);mask[i]=1;evidence[i]=seeds[i]=1;
  }
  const rectangular=await processVision(cv,'components',{mask,evidence,foregroundSeeds:seeds,pixels,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(rectangular.length,1);assert.equal(rectangular[0].edgeMethod,'rectangular-reconstruction');
  const rr=rectangular[0],rx=Math.round(rr.x*width),ry=Math.round(rr.y*height);
  assert.equal(rr.mask.alpha[(40-ry)*rr.mask.width+118-rx],255,'missing pale corner is recovered inside the physical rectangle');

  const circleMask=new Uint8Array(width*height),circleEvidence=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const dx=x-80,dy=y-80;if(dx*dx+dy*dy<=42*42){const i=y*width+x;circleMask[i]=circleEvidence[i]=1;}}
  const circle=await processVision(cv,'components',{mask:circleMask,evidence:circleEvidence,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(circle.length,1);assert.notEqual(circle[0].edgeMethod,'rectangular-reconstruction');
});

test('OpenCV contours preserve candidate bounds, fill printed detail and reject page-sized components',async()=>{
  const cv=await cvModule,width=100,height=150,mask=new Uint8Array(width*height);for(let y=30;y<110;y++)for(let x=20;x<65;x++)mask[y*width+x]=1;for(let y=45;y<60;y++)for(let x=30;x<40;x++)mask[y*width+x]=0;
  const result=await processVision(cv,'components',{mask,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});assert.equal(result.length,1);assert.equal(result[0].mask.width,51);assert.equal(result[0].mask.height,86);assert.equal(result[0].mask.alpha[25*51+15],255);assert.equal(result[0].mask.alpha[0],0);
  const empty=await processVision(cv,'components',{mask:new Uint8Array(width*height).fill(1),width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});assert.deepEqual(empty,[]);
});
test('OpenCV local light balance is effective without changing source or alpha',async()=>{
  const cv=await cvModule,width=80,height=80,pixels=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=40+x*2;pixels[i+3]=x%2?128:255;}const original=pixels.slice(),out=await processVision(cv,'balance',{pixels,width,height});assert.deepEqual(pixels,original);assert.ok(out.pixels.some((v,i)=>i%4!==3&&v!==pixels[i]));for(let i=3;i<pixels.length;i+=4)assert.equal(out.pixels[i],pixels[i]);
});
test('OpenCV detects actual paper corners and refuses a featureless full photograph',async()=>{
  const cv=await cvModule,width=180,height=240,pixels=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,value=x>=20&&x<=160&&y>=20&&y<=220?240:60;pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}const corners=await processVision(cv,'quad',{pixels,width,height,paperRatio:140/200});assert.equal(corners.length,4);assert.ok(Math.abs(corners[0].x-20/180)<.01);assert.ok(Math.abs(corners[2].y-220/240)<.01);assert.equal(await processVision(cv,'quad',{pixels:new Uint8ClampedArray(width*height*4).fill(255),width,height,paperRatio:140/200}),null);
});
test('shadow-only components are excluded while a colored object remains intact',async()=>{
 const cv=await cvModule,width=100,height=150,mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height);
 for(let y=20;y<55;y++)for(let x=10;x<30;x++)mask[y*width+x]=1;
 for(let y=70;y<120;y++)for(let x=50;x<80;x++)mask[y*width+x]=evidence[y*width+x]=1;
 const result=await processVision(cv,'components',{mask,evidence,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});assert.equal(result.length,1);assert.ok(result[0].y>.4);
});

test('edge enclosure keeps a pale rectangular card but excludes its offset shadow',async()=>{
  const cv=await cvModule,width=180,height=180,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,card=x>=45&&x<125&&y>=40&&y<130,shadow=x>=52&&x<135&&y>=48&&y<140;
    const color=card?[205,225,205]:shadow?[218,218,218]:[245,245,245];pixels.set([...color,255],p);
    if(card&&(y>95||x<55))evidence[y*width+x]=1;
  }
  const result=await processVision(cv,'enclosures',{pixels,evidence,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  const card=result.filter(r=>r.x<.3&&r.x+r.w>.65&&r.y<.28&&r.y+r.h>.7).sort((a,b)=>(b.structuralConfidence||0)-(a.structuralConfidence||0))[0];assert.ok(card,'card enclosure should be found');
  assert.ok(card.x>.22&&card.x<.28);assert.ok(card.x+card.w<.74,'offset shadow must not set the physical right edge');
});

test('edge enclosure preserves pale interior of an irregular printed sticker',async()=>{
  const cv=await cvModule,width=180,height=200,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height);
  const poly=[[60,25],[110,25],[118,55],[130,75],[120,105],[132,150],[102,178],[78,160],[58,178],[45,145],[54,108],[42,78],[55,52]];
  const inside=(x,y)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*4;pixels.set([246,246,246,255],p);}
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(inside(x,y)){const p=(y*width+x)*4;pixels.set([233,233,229,255],p);}
  // dark printed figures provide evidence, while the pale sticker body does not
  for(const [cx,cy,rx,ry] of [[72,92,8,25],[92,115,9,30],[111,94,8,27]])for(let y=cy-ry;y<=cy+ry;y++)for(let x=cx-rx;x<=cx+rx;x++)if(x>=0&&x<width&&y>=0&&y<height&&inside(x,y)&&((x-cx)/rx)**2+((y-cy)/ry)**2<=1){const p=(y*width+x)*4;pixels.set([80,80,80,255],p);evidence[y*width+x]=1;}
  // explicit cut edge, representative of the visible outline in the real sample
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(inside(x,y)&&(!inside(x-1,y)||!inside(x+1,y)||!inside(x,y-1)||!inside(x,y+1))){const p=(y*width+x)*4;pixels.set([150,150,150,255],p);}
  const result=await processVision(cv,'enclosures',{pixels,evidence,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  const sticker=result.sort((a,b)=>b.pixels-a.pixels)[0];assert.ok(sticker,'sticker enclosure should be found');
  const gx=88,gy=65,l=Math.round(sticker.x*width),t=Math.round(sticker.y*height),lx=gx-l,ly=gy-t;
  assert.ok(lx>=0&&ly>=0&&lx<sticker.mask.width&&ly<sticker.mask.height);
  assert.equal(sticker.mask.alpha[ly*sticker.mask.width+lx],255,'pale physical sticker interior must be retained');
});

test('marker watershed separates two physical items joined by a foreground bridge',async()=>{
  const cv=await cvModule,width=180,height=120,pixels=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*4;pixels.set([245,245,245,255],p);}
  for(let y=25;y<95;y++)for(let x=15;x<75;x++){const i=y*width+x,p=i*4;pixels.set([80,150,205,255],p);mask[i]=evidence[i]=1;}
  for(let y=20;y<100;y++)for(let x=105;x<165;x++){const i=y*width+x,p=i*4;pixels.set([210,120,150,255],p);mask[i]=evidence[i]=1;}
  for(let y=55;y<62;y++)for(let x=75;x<105;x++)mask[y*width+x]=1;
  const result=await processVision(cv,'instances',{mask,evidence,pixels,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(result.length,2);const byX=[...result].sort((a,b)=>a.x-b.x);assert.ok(byX[0].x+byX[0].w<byX[1].x);
});

test('marker watershed rejects a page-only island without material evidence',async()=>{
  const cv=await cvModule,width=120,height=160,pixels=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height);
  for(let i=0;i<width*height;i++){pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=238;pixels[i*4+3]=255;}
  for(let y=20;y<80;y++)for(let x=15;x<60;x++)mask[y*width+x]=1;
  for(let y=95;y<145;y++)for(let x=70;x<110;x++){const i=y*width+x;mask[i]=evidence[i]=1;pixels[i*4]=70;pixels[i*4+1]=150;pixels[i*4+2]=200;}
  const result=await processVision(cv,'instances',{mask,evidence,pixels,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(result.length,1);assert.ok(result[0].y>.5);
});
