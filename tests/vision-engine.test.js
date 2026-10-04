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
  assert.equal(card.edgeMethod,'edge-rectangle','complete physical card should be straightened from its outer enclosure');
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


test('boundary completion restores a pale physical oval from an inner rough mask and rejects a tiny page-edge artifact',async()=>{
  const cv=await cvModule,width=220,height=260,pixels=new Uint8ClampedArray(width*height*4);
  const cx=112,cy=132,outerX=54,outerY=88,innerX=43,innerY=72;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,n=((x-cx)/outerX)**2+((y-cy)/outerY)**2,edge=Math.abs(n-1)<.045;
    const value=n<=1?edge?145:235:246;pixels.set([value,value,value,255],p);
  }
  const mw=innerX*2+5,mh=innerY*2+5,alpha=new Uint8Array(mw*mh);
  for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)if(((x-mw/2)/innerX)**2+((y-mh/2)/innerY)**2<=1)alpha[y*mw+x]=255;
  const oval={x:(cx-mw/2)/width,y:(cy-mh/2)/height,w:mw/width,h:mh/height,edgeMethod:'watershed-grabcut',mask:{width:mw,height:mh,alpha,polygons:[]}};
  const edgeArtifact={x:.30,y:.004,w:.10,h:.025,edgeMethod:'watershed-grabcut',mask:{width:22,height:7,alpha:new Uint8Array(154).fill(255),polygons:[]}};
  const result=await processVision(cv,'complete-boundaries',{pixels,width,height,candidates:[oval,edgeArtifact]});
  assert.equal(result.length,1);assert.equal(result[0].edgeMethod,'ellipse-completed');
  assert.ok(result[0].w>oval.w*1.12&&result[0].h>oval.h*1.10,'physical outer ellipse must expand beyond the rough inner mask');
  assert.ok(result[0].mask.polygons[0].length>8,'completed ellipse should preserve a smooth editable boundary');
});
