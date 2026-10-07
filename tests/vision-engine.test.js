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


test('edge enclosure recovers a curved pale physical carrier without an ellipse class',async()=>{
  const cv=await cvModule,width=220,height=260,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const cx=112,cy=132,rx=54,ry=88;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,n=((x-cx)/rx)**2+((y-cy)/ry)**2,inside=n<=1,border=inside&&Math.abs(n-1)<.05;
    const value=inside?border?145:235:246;pixels.set([value,value,value,255],p);backgroundConnected[at]=inside?0:1;
    if(border||inside&&((x-cx)/18)**2+((y-cy)/34)**2<1){evidence[at]=1;score[at]=100;}
  }
  const result=await processVision(cv,'enclosures',{pixels,evidence,backgroundConnected,shadowLikelihood,score,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  const carrier=result.sort((a,b)=>b.pixels-a.pixels)[0];assert.ok(carrier,'curved physical enclosure should be found');
  assert.notEqual(carrier.edgeMethod,'edge-rectangle');
  assert.ok(Math.abs(carrier.w-rx*2/width)<.07&&Math.abs(carrier.h-ry*2/height)<.07,'curved boundary should follow the visible outer carrier');
});

test('generic topology refinement preserves circular and rectangular page apertures without shape-specific rules',async()=>{
  const cv=await cvModule,width=220,height=260,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height);
  const cx=112,cy=132,rx=58,ry=92,circle=[112,86,11],rect=[88,145,99,156],print=[124,148,140,165];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,n=((x-cx)/rx)**2+((y-cy)/ry)**2,inside=n<=1,border=inside&&Math.abs(n-1)<.045;
    const circular=(x-circle[0])**2+(y-circle[1])**2<=circle[2]**2,rectangular=x>=rect[0]&&x<=rect[2]&&y>=rect[1]&&y<=rect[3],printed=x>=print[0]&&x<=print[2]&&y>=print[1]&&y<=print[3],aperture=inside&&(circular||rectangular);
    const color=!inside||aperture?[246,246,246]:printed?[236,232,224]:border?[145,145,145]:[224,232,226];pixels.set([...color,255],p);backgroundConnected[at]=inside?0:1;
    if(inside&&!aperture&&(border||x<cx-20||x>cx+20))evidence[at]=1;
  }
  const mw=rx*2+1,mh=ry*2+1,alpha=new Uint8Array(mw*mh);
  for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)if(((x-mw/2)/rx)**2+((y-mh/2)/ry)**2<=1)alpha[y*mw+x]=255;
  const outer={x:(cx-mw/2)/width,y:(cy-mh/2)/height,w:mw/width,h:mh/height,evidenceDensity:.4,edgeMethod:'edge-enclosure',mask:{width:mw,height:mh,alpha,polygons:[]}};
  const [out]=await processVision(cv,'complete-boundaries',{pixels,evidence,backgroundConnected,shadowLikelihood,width,height,candidates:[outer],smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.ok(out?.mask?.topologyPreserved);
  const left=Math.round(out.x*width),top=Math.round(out.y*height),at=(gx,gy)=>out.mask.alpha[(gy-top)*out.mask.width+gx-left];
  assert.equal(at(circle[0],circle[1]),0,'circular page aperture should remain transparent');
  assert.equal(at((rect[0]+rect[2])>>1,(rect[1]+rect[3])>>1),0,'rectangular page aperture should remain transparent');
  assert.equal(at((print[0]+print[2])>>1,(print[1]+print[3])>>1),255,'off-page-colour printed region should remain material');
});

test('straight physical edges are introduced only by the final line-curve regularizer',async()=>{
  const cv=await cvModule,width=180,height=180,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,card=x>=42&&x<132&&y>=35&&y<145;
    const color=card?[210,226,218]:[245,245,245];pixels.set([...color,255],p);backgroundConnected[at]=card?0:1;
    if(card&&(x<52||x>=122||y<45||y>=135))evidence[at]=1;
  }
  const result=await processVision(cv,'enclosures',{pixels,evidence,backgroundConnected,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  const card=result.filter(r=>r.x<.3&&r.x+r.w>.7&&r.y<.25&&r.y+r.h>.78).sort((a,b)=>b.pixels-a.pixels)[0];
  assert.ok(card,'clean physical enclosure should be found');assert.equal(card.edgeMethod,'edge-enclosure');
  const [regular]=await processVision(cv,'complete-boundaries',{pixels,evidence,backgroundConnected,shadowLikelihood,width,height,candidates:[card],smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(regular.boundaryModel,'line-curve');assert.ok(regular.boundaryLineCount>=4);
});


test('physical enclosure geometry stays stable when analysis resolution changes',async()=>{
  const cv=await cvModule;
  const run=async scale=>{
    const width=220*scale,height=260*scale,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
    const cx=.51*width,cy=.51*height,rx=.245*width,ry=.338*height;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const at=y*width+x,p=at*4,n=((x-cx)/rx)**2+((y-cy)/ry)**2,inside=n<=1,border=inside&&Math.abs(n-1)<.05;
      const value=inside?border?150:232:246;pixels.set([value,value,value,255],p);backgroundConnected[at]=inside?0:1;
      if(border||inside&&Math.abs(x-cx)<18*scale){evidence[at]=1;score[at]=105;}
    }
    const out=await processVision(cv,'enclosures',{pixels,evidence,backgroundConnected,shadowLikelihood,score,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
    return out.sort((a,b)=>b.pixels-a.pixels)[0];
  };
  const a=await run(1),b=await run(2);assert.ok(a&&b,JSON.stringify({a,b}));
  for(const key of ['x','y','w','h'])assert.ok(Math.abs(a[key]-b[key])<.035,key+': '+a[key]+' vs '+b[key]);
});


test('fragmented boundary reconstruction closes short physical gaps without knowing the carrier shape',async()=>{
  const cv=await cvModule,width=220,height=180,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const left=34,top=24,right=186,bottom=156;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,inside=x>=left&&x<=right&&y>=top&&y<=bottom;
    const border=inside&&(x-left<3||right-x<3||y-top<3||bottom-y<3);
    const gap=border&&((y<=top+2&&x>88&&x<119)||(x>=right-2&&y>76&&y<104));
    const patch1=inside&&x>55&&x<83&&y>63&&y<101,patch2=inside&&x>132&&x<162&&y>82&&y<122;
    const color=!inside?[246,246,246]:gap?[244,244,242]:border?[145,145,145]:patch1?[88,150,198]:patch2?[205,116,145]:[238,240,236];
    pixels.set([...color,255],p);backgroundConnected[at]=inside?0:1;
    if((border&&!gap)||patch1||patch2){evidence[at]=1;score[at]=105;}
  }
  const instances=[
    {x:55/width,y:63/height,w:28/width,h:38/height},
    {x:132/width,y:82/height,w:30/width,h:40/height}
  ];
  const out=await processVision(cv,'boundary-reconstruction',{pixels,evidence,backgroundConnected,shadowLikelihood,score,instances,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  const carrier=out.filter(r=>r.matchedInstances>=2).sort((a,b)=>b.reconstructionScore-a.reconstructionScore)[0];
  assert.ok(carrier,'short broken perimeter should reconstruct one physical carrier');
  assert.ok(carrier.x<.20&&carrier.x+carrier.w>.82&&carrier.y<.18&&carrier.y+carrier.h>.84,JSON.stringify(carrier));
  assert.ok(carrier.edgeSupportRatio>.42);assert.ok(carrier.closureScaleMM<=3.8);
});

test('fragmented boundary reconstruction does not bridge distant independent carriers',async()=>{
  const cv=await cvModule,width=240,height=160,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,a=x>=20&&x<85&&y>=35&&y<125,b=x>=155&&x<220&&y>=30&&y<120;
    const edge=(a&&(x<23||x>=82||y<38||y>=122))||(b&&(x<158||x>=217||y<33||y>=117));
    const color=a?[195,220,206]:b?[218,184,202]:[246,246,246];pixels.set([...color,255],p);backgroundConnected[at]=a||b?0:1;
    if(edge){evidence[at]=1;score[at]=100;}
  }
  const instances=[{x:28/width,y:45/height,w:45/width,h:65/height},{x:165/width,y:40/height,w:45/width,h:65/height}];
  const out=await processVision(cv,'boundary-reconstruction',{pixels,evidence,backgroundConnected,shadowLikelihood,score,instances,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(out.some(r=>r.matchedInstances>=2),false,'large page gap must not be closed into one material');
});


test('piecewise prior turns a jagged card into long line segments while preserving a concave carrier',async()=>{
  const cv=await cvModule,width=180,height=180,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height);
  for(let i=0;i<width*height;i++){pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=246;pixels[i*4+3]=255;backgroundConnected[i]=1;}
  const mkCandidate=(poly,box)=>{
    const [x,y,w,h]=box,alpha=new Uint8Array(w*h),inside=(gx,gy)=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>gy)!==(yj>gy))&&gx<(xj-xi)*(gy-yi)/(yj-yi)+xi)hit=!hit;}return hit;};
    for(let py=0;py<h;py++)for(let px=0;px<w;px++)if(inside(x+px,y+py))alpha[py*w+px]=255;
    return {x:x/width,y:y/height,w:w/width,h:h/height,evidenceDensity:.3,edgeMethod:'edge-enclosure',mask:{width:w,height:h,alpha,polygons:[]}};
  };
  const cardPoly=[[35,35],[132,35],[132,132],[90,132],[88,129],[86,132],[35,132],[35,92],[37,90],[35,88]];
  const card=mkCandidate(cardPoly,[35,35,98,98]);
  for(let y=35;y<133;y++)for(let x=35;x<133;x++){const at=y*width+x;backgroundConnected[at]=0;evidence[at]=1;pixels.set([210,224,214,255],at*4);}
  const [r]=await processVision(cv,'complete-boundaries',{pixels,evidence,backgroundConnected,shadowLikelihood,width,height,candidates:[card],smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(r.boundaryModel,'line-curve');assert.ok(r.boundaryLineCount>=4);assert.ok(r.mask.polygons[0].length<=16);

  const concavePoly=[[20,20],[80,20],[80,45],[55,45],[55,90],[20,90]],concave=mkCandidate(concavePoly,[20,20,61,71]);
  const [q]=await processVision(cv,'complete-boundaries',{pixels,evidence,backgroundConnected,shadowLikelihood,width,height,candidates:[concave],smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(q.boundaryModel,'line-curve');assert.ok(q.boundaryCornerCount>=2);
  const left=Math.round(q.x*width),top=Math.round(q.y*height),notchX=68-left,notchY=62-top;
  assert.equal(q.mask.alpha[notchY*q.mask.width+notchX],0,'true concavity must not be convex-hulled away');
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



test('multiple repeated apertures are recovered without a fixed count or side template',async()=>{
  const cv=await cvModule,width=220,height=300,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height);
  const left=48,top=32,right=176,bottom=270,hx=66,ys=[72,112,152,192,232],hr=7;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,inside=x>=left&&x<=right&&y>=top&&y<=bottom;
    let hole=-1;for(let k=0;k<ys.length;k++)if((x-hx)**2+(y-ys[k])**2<=hr**2){hole=k;break;}
    const border=inside&&(x-left<3||right-x<3||y-top<3||bottom-y<3);
    const color=!inside?[246,246,246]:hole>=0?[246,246,246]:border?[140,150,145]:[190,216,198];
    pixels.set([...color,255],p);backgroundConnected[at]=inside?0:1;
    if(inside&&hole<0&&(border||x>100&&x<116)){evidence[at]=1;}
  }
  const bw=right-left+1,bh=bottom-top+1,alpha=new Uint8Array(bw*bh).fill(255);
  const carrier={x:left/width,y:top/height,w:bw/width,h:bh/height,evidenceDensity:.3,edgeMethod:'edge-enclosure',mask:{width:bw,height:bh,alpha,polygons:[]}};
  const [out]=await processVision(cv,'complete-boundaries',{pixels,evidence,backgroundConnected,shadowLikelihood,width,height,candidates:[carrier],smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.ok((out?.apertureCount||0)>=5,JSON.stringify({count:out?.apertureCount,regions:out?.mask?.apertureRegions}));
  const at=(gx,gy)=>{const x=Math.round(gx-out.x*width),y=Math.round(gy-out.y*height);return out.mask.alpha[y*out.mask.width+x];};
  for(const y of ys)assert.equal(at(hx,y),0,'every pattern-supported aperture should remain transparent');
});


test('fast shared-pass recognizer keeps a production-size four-material page within the latency budget',async()=>{
  const cv=await cvModule,S=10/7,width=Math.round(500*S),height=1000,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const items=[
    {x:Math.round(45*S),y:Math.round(70*S),w:Math.round(165*S),h:Math.round(190*S),color:[130,185,145],holes:[110,145,180,215].map(v=>Math.round(v*S))},
    {x:Math.round(285*S),y:Math.round(70*S),w:Math.round(135*S),h:Math.round(205*S),color:[232,232,226],holes:[]},
    {x:Math.round(55*S),y:Math.round(390*S),w:Math.round(170*S),h:Math.round(190*S),color:[130,165,215],holes:[]},
    {x:Math.round(290*S),y:Math.round(410*S),w:Math.round(150*S),h:Math.round(155*S),color:[220,155,185],holes:[]}
  ];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4;let color=[246,246,246],inside=false,hole=false;
    for(const item of items){
      if(x>=item.x&&x<item.x+item.w&&y>=item.y&&y<item.y+item.h){
        inside=true;color=item.color;
        for(const hy of item.holes){
          const d=(x-(item.x+Math.round(18*S)))**2+(y-hy)**2;
          if(d<=(Math.round(7*S))**2){hole=true;color=[246,246,246];}
          else if(d<=(Math.round(9*S))**2)color=[105,105,105];
        }
        if(!hole&&(x-item.x<4||item.x+item.w-1-x<4||y-item.y<4||item.y+item.h-1-y<4))color=color.map(v=>Math.max(0,v-35));
      }
    }
    pixels.set([...color,255],p);backgroundConnected[at]=inside?0:1;
    if(inside&&!hole&&Math.max(...color)-Math.min(...color)>12){evidence[at]=1;score[at]=90;}
  }
  const started=performance.now(),out=await processVision(cv,'materials-fast',{pixels,width,height,backgroundConnected,evidence,shadowLikelihood,score,smallestMM:6,paperWidthMM:210,paperHeightMM:297,rectified:true}),elapsed=performance.now()-started;
  assert.equal(out.length,4,JSON.stringify(out.map(x=>({x:x.x,y:x.y,w:x.w,h:x.h,holes:x.apertureCount,method:x.edgeMethod}))));
  assert.ok(out.every(x=>x.recognitionConfidence>=.54));
  assert.ok(elapsed<3000,'shared-pass OpenCV recognition took '+elapsed.toFixed(0)+'ms');
});


test('fast recognizer rejects page-edge strips and preserves smooth/concave carriers',async()=>{
  const cv=await cvModule,width=620,height=860,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const ellipse={cx:430,cy:180,rx:64,ry:105},concave=[[355,470],[470,455],[500,520],[458,548],[488,630],[420,615],[380,680],[355,610],[305,625],[330,550],[292,515]];
  const insidePoly=(x,y,pts)=>{let hit=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}return hit;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,edgeStrip=x<8,oval=((x-ellipse.cx)/ellipse.rx)**2+((y-ellipse.cy)/ellipse.ry)**2<=1,irregular=insidePoly(x,y,concave);
    let color=[246,246,246],inside=false;
    if(edgeStrip){color=[205,205,205];}
    if(oval){inside=true;color=[232,232,226];}
    if(irregular){inside=true;color=[245,245,242];}
    // Printed dark content inside the white irregular carrier.
    if(irregular&&((x-405)**2+(y-565)**2<38**2||(x>390&&x<455&&y>535&&y<605)))color=[80,80,80];
    pixels.set([...color,255],p);backgroundConnected[at]=inside?0:1;
    if(inside&&(Math.max(...color)-Math.min(...color)>4||color[0]<180)){evidence[at]=1;score[at]=95;}
  }
  const out=await processVision(cv,'materials-fast',{pixels,width,height,backgroundConnected,evidence,shadowLikelihood,score,smallestMM:6,paperWidthMM:210,paperHeightMM:297,rectified:true});
  assert.equal(out.some(x=>x.x<.03&&x.h>.45),false,'rectified page-edge strip must not become a material');
  const oval=out.filter(x=>x.y<.38&&x.x>.5).sort((a,b)=>b.pixels-a.pixels)[0];assert.ok(oval,'pale oval carrier should survive');
  assert.equal(oval.edgeMethod,'fast-curve');assert.ok(oval.mask.polygons[0].length>=16,'smooth curve should not collapse into a coarse polygon');
  const irr=out.filter(x=>x.y>.45&&x.x>.4).sort((a,b)=>b.pixels-a.pixels)[0];assert.ok(irr,'irregular white carrier should survive');
  assert.equal(irr.edgeMethod,'fast-curve');
  assert.ok(irr.pixels>500,'irregular carrier seed must remain substantial enough for final refinement');
  assert.ok((irr.mask.polygons?.[0]?.length||0)>=8,'irregular proposal must remain freeform rather than collapse to a rectangle');
});


test('fast recognizer rejects any carrier inside the protected A4 edge-clearance band',async()=>{
  const cv=await cvModule,width=420,height=594,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,edgeItem=x>=1&&x<72&&y>=120&&y<230,center=x>=180&&x<260&&y>=220&&y<340;
    const item=edgeItem||center,color=item?[115,178,142]:[242,242,242];pixels.set([...color,255],p);backgroundConnected[at]=item?0:1;
    if(item){evidence[at]=1;score[at]=95;}
  }
  const out=await processVision(cv,'materials-fast',{pixels,width,height,backgroundConnected,evidence,shadowLikelihood,score,smallestMM:6,paperWidthMM:210,paperHeightMM:297,rectified:true});
  assert.equal(out.length,1,JSON.stringify(out.map(x=>({x:x.x,y:x.y,w:x.w,h:x.h}))));
  assert.ok(out[0].x>.30&&out[0].x<.55,'only the centered legal material should remain');
});


test('fast material recognition rejects unrectified benchmark input',async()=>{
  const cv=await cvModule,width=60,height=80,pixels=new Uint8ClampedArray(width*height*4).fill(255);
  await assert.rejects(()=>processVision(cv,'materials-fast',{pixels,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297}),/rectified A4/);
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
