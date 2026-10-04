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

test('generic topology refinement can retain an enclosed page aperture without a punch-hole rule',async()=>{
  const cv=await cvModule,width=220,height=260,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height);
  const cx=112,cy=132,rx=58,ry=92,hx=112,hy=92,hr=12;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,n=((x-cx)/rx)**2+((y-cy)/ry)**2,inside=n<=1,border=inside&&Math.abs(n-1)<.045,hole=(x-hx)**2+(y-hy)**2<=hr**2;
    const color=!inside||hole?[246,246,246]:border?[145,145,145]:[224,232,226];pixels.set([...color,255],p);backgroundConnected[at]=inside?0:1;
    if(inside&&!hole&&(border||x<cx-20||x>cx+20))evidence[at]=1;
  }
  const mw=rx*2+1,mh=ry*2+1,alpha=new Uint8Array(mw*mh);
  for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)if(((x-mw/2)/rx)**2+((y-mh/2)/ry)**2<=1)alpha[y*mw+x]=255;
  const outer={x:(cx-mw/2)/width,y:(cy-mh/2)/height,w:mw/width,h:mh/height,evidenceDensity:.4,edgeMethod:'edge-enclosure',mask:{width:mw,height:mh,alpha,polygons:[]}};
  const [out]=await processVision(cv,'complete-boundaries',{pixels,evidence,backgroundConnected,shadowLikelihood,width,height,candidates:[outer],smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.ok(out?.mask?.topologyPreserved);
  const left=Math.round(out.x*width),top=Math.round(out.y*height),mx=hx-left,my=hy-top;
  assert.ok(mx>=0&&my>=0&&mx<out.mask.width&&my<out.mask.height);
  assert.equal(out.mask.alpha[my*out.mask.width+mx],0,'page-like enclosed aperture should remain transparent');
  const solidX=cx-left,solidY=cy+30-top;assert.equal(out.mask.alpha[solidY*out.mask.width+solidX],255,'ordinary material interior should remain foreground');
});

test('clean high-contact rectangular enclosure is represented by fitted straight physical edges',async()=>{
  const cv=await cvModule,width=180,height=180,pixels=new Uint8ClampedArray(width*height*4),evidence=new Uint8Array(width*height),backgroundConnected=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,p=at*4,card=x>=42&&x<132&&y>=35&&y<145;
    const color=card?[210,226,218]:[245,245,245];pixels.set([...color,255],p);backgroundConnected[at]=card?0:1;
    if(card&&(x<52||x>=122||y<45||y>=135))evidence[at]=1;
  }
  const result=await processVision(cv,'enclosures',{pixels,evidence,backgroundConnected,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  const card=result.filter(r=>r.x<.3&&r.x+r.w>.7&&r.y<.25&&r.y+r.h>.78).sort((a,b)=>b.pixels-a.pixels)[0];
  assert.ok(card,'clean rectangular physical enclosure should be found');
  assert.equal(card.edgeMethod,'edge-rectangle',JSON.stringify({rectFill:card.rectFill,rectangularPrior:card.rectangularPrior,vertices:card.mask.polygons[0].length,paperContactRatio:card.paperContactRatio,insideEvidenceRatio:card.insideEvidenceRatio}));
  assert.equal(card.mask.polygons[0].length,4);
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
