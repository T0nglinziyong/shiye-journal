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


test('local physical-boundary refinement restores a complete oval from a conservative rough mask',async()=>{
  const cv=await cvModule,width=220,height=220,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const cx=122,cy=108,rx=54,ry=78,inside=(x,y)=>((x-cx)/rx)**2+((y-cy)/ry)**2<=1,edge=(x,y)=>{const q=((x-cx)/rx)**2+((y-cy)/ry)**2;return q>.93&&q<1.08;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,p=i*4,isInside=inside(x,y);const value=edge(x,y)?125:isInside?232:242;pixels.set([value,value,value,255],p);backgroundConnected[i]=isInside?0:1;if(edge(x,y))score[i]=80;}
  const bx=73,by=37,bw=98,bh=142,alpha=new Uint8Array(bw*bh);
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++)if(((x-(cx-bx))/(rx-6))**2+((y-(cy-by))/(ry-7))**2<=1)alpha[y*bw+x]=255;
  const candidate={x:bx/width,y:by/height,w:bw/width,h:bh/height,mask:{width:bw,height:bh,alpha,polygons:[]}};
  const [out]=await processVision(cv,'refine-boundaries',{candidates:[candidate],pixels,backgroundConnected,shadowLikelihood,score,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(out.edgeMethod,'local-ellipse');assert.equal(out.boundaryRefined,true);
  assert.ok(Math.abs(out.x*width-(cx-rx))<7);assert.ok(Math.abs((out.x+out.w)*width-(cx+rx))<7);
  assert.ok(Math.abs(out.y*height-(cy-ry))<7);assert.ok(Math.abs((out.y+out.h)*height-(cy+ry))<7);
});

test('local physical-boundary refinement repairs a pale rectangular card without turning an irregular sticker into a box',async()=>{
  const cv=await cvModule,width=260,height=190,pixels=new Uint8ClampedArray(width*height*4),backgroundConnected=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
  const insideCard=(x,y)=>x>=30&&x<=115&&y>=28&&y<=155;
  const sticker=[[157,26],[207,30],[216,58],[232,76],[221,101],[235,145],[207,168],[189,153],[171,169],[151,141],[159,108],[145,78],[154,52]];
  const insidePoly=(x,y)=>{let c=false;for(let i=0,j=sticker.length-1;i<sticker.length;j=i++){const [xi,yi]=sticker[i],[xj,yj]=sticker[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
  const edgePoly=(x,y)=>insidePoly(x,y)&&(!insidePoly(x-1,y)||!insidePoly(x+1,y)||!insidePoly(x,y-1)||!insidePoly(x,y+1));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,p=i*4,card=insideCard(x,y),st=insidePoly(x,y),cardEdge=card&&(x<=32||x>=113||y<=30||y>=153),stEdge=edgePoly(x,y);
    const value=cardEdge||stEdge?130:card||st?232:243;pixels.set([value,value,value,255],p);backgroundConnected[i]=card||st?0:1;if(cardEdge||stEdge)score[i]=85;
  }
  const cardAlpha=new Uint8Array(79*119).fill(255);for(let y=75;y<90;y++)for(let x=0;x<8;x++)cardAlpha[y*79+x]=0;
  const stickerAlpha=new Uint8Array(80*135);for(let y=0;y<135;y++)for(let x=0;x<80;x++)if(insidePoly(x+150,y+30))stickerAlpha[y*80+x]=255;
  const candidates=[
    {x:34/width,y:32/height,w:79/width,h:119/height,mask:{width:79,height:119,alpha:cardAlpha,polygons:[]}},
    {x:150/width,y:30/height,w:80/width,h:135/height,mask:{width:80,height:135,alpha:stickerAlpha,polygons:[]}}
  ];
  const out=await processVision(cv,'refine-boundaries',{candidates,pixels,backgroundConnected,shadowLikelihood,score,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(out[0].edgeMethod,'local-rectangle');assert.equal(out[0].boundaryRefined,true);
  assert.equal(out[1].edgeMethod,'local-contour');assert.equal(out[1].boundaryRefined,true);
  assert.ok(out[1].mask.polygons[0].length>4,'irregular sticker must keep its measured concavity');
});
