import test from 'node:test';
import assert from 'node:assert/strict';
import {buildForegroundEvidence,rgbToLab} from '../src/foreground-evidence.js';

const rgba=(w,h,paint)=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=paint(x,y),p=(y*w+x)*4;data.set([c[0],c[1],c[2],255],p);}return data;};

test('Lab conversion separates lightness from chroma',()=>{
  const white=rgbToLab(230,230,230),shadow=rgbToLab(190,190,190),pink=rgbToLab(210,170,180);
  assert.ok(Math.abs(white[1]-shadow[1])<.2&&Math.abs(white[2]-shadow[2])<.2);
  assert.ok(white[0]-shadow[0]>10);
  assert.ok(Math.hypot(pink[1]-white[1],pink[2]-white[2])>8);
});

test('uneven illumination and a cast shadow stay background while a pale coloured material has evidence',()=>{
  const w=144,h=96;
  const data=rgba(w,h,(x,y)=>{
    const base=238-Math.round(x/w*35);
    if(x>=78&&x<126&&y>=18&&y<78)return [base-18,base-18,base-18]; // smooth cast shadow
    if(x>=12&&x<52&&y>=20&&y<76)return [205-Math.round(x/w*10),218-Math.round(x/w*10),232-Math.round(x/w*10)]; // pale blue paper
    return [base,base,base];
  });
  const out=buildForegroundEvidence(data,w,h,{cellSize:24});
  let shadow=0,shadowMask=0,shadowEvidence=0,material=0,materialEvidence=0;
  for(let y=25;y<70;y++)for(let x=84;x<120;x++){const i=y*w+x;shadow++;shadowMask+=out.mask[i];shadowEvidence+=out.evidence[i];}
  for(let y=25;y<70;y++)for(let x=18;x<46;x++){const i=y*w+x;material++;materialEvidence+=out.evidence[i];}
  assert.ok(shadowEvidence/shadow<.08,'smooth neutral shadow must not become strong material evidence');
  assert.ok(shadowMask/shadow<.45,'local background modelling should absorb most smooth illumination changes');
  assert.ok(materialEvidence/material>.65,'pale coloured paper must remain detectable under the same gradient');
});


test('page-connected background removes surrounding paper but preserves a pale rectangular material',()=>{
  const w=120,h=90,data=rgba(w,h,(x,y)=>{
    if(x>=35&&x<92&&y>=20&&y<72)return [226,229,212]; // pale yellow-green material
    return [222,222,222];
  });
  const out=buildForegroundEvidence(data,w,h,{cellSize:24});
  let inside=0,outside=0;
  for(let y=28;y<64;y++)for(let x=44;x<84;x++)inside+=out.mask[y*w+x];
  for(let y=8;y<18;y++)for(let x=15;x<105;x++)outside+=out.mask[y*w+x];
  assert.ok(inside/(36*40)>.9,'pale material interior must remain foreground');
  assert.ok(outside/(10*90)<.08,'surrounding page must remain connected background');
});

test('a closed sticker perimeter protects near-white interior from background flooding',()=>{
  const w=120,h=100,data=rgba(w,h,(x,y)=>{
    const inside=x>=38&&x<=82&&y>=18&&y<=82;
    const edge=inside&&(x<=40||x>=80||y<=20||y>=80);
    if(edge)return [95,95,95];
    if(inside)return [224,224,222]; // deliberately close to page colour
    return [226,226,226];
  });
  const out=buildForegroundEvidence(data,w,h,{cellSize:24});
  let protectedInterior=0,page=0;
  for(let y=32;y<68;y++)for(let x=48;x<72;x++)protectedInterior+=out.mask[y*w+x];
  for(let y=5;y<15;y++)for(let x=10;x<110;x++)page+=out.mask[y*w+x];
  assert.ok(protectedInterior/(36*24)>.9,'near-white sticker interior must be filled as one physical material');
  assert.ok(page/(10*100)<.08,'paper outside the perimeter must stay background');
});


test('protected A4 border band remains background even with a dark corner and warp edge line',()=>{
  const w=210,h=297,data=rgba(w,h,(x,y)=>{
    const warp=x<2||y<2||x>=w-2||y>=h-2;
    const shadow=x<38&&y<42;
    const material=x>=70&&x<135&&y>=95&&y<190;
    if(material)return [125,180,145];
    if(warp)return [145,145,145];
    if(shadow)return [175,175,175];
    return [238,238,238];
  });
  const out=buildForegroundEvidence(data,w,h,{cellSize:32});
  let border=0,total=0,material=0,materialN=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,near=x<3||y<3||x>=w-3||y>=h-3;
    if(near){border+=out.mask[i];total++;}
    if(x>=78&&x<127&&y>=105&&y<180){material+=out.mask[i];materialN++;}
  }
  assert.ok(border/total<.02,'guaranteed border band must never become a material');
  assert.ok(material/materialN>.9,'interior material must remain foreground');
});
