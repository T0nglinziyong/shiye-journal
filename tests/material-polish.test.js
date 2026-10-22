import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {drawMaterialThumbnail,paintMaterialImage,materialPreviewKey} from '../src/material-paint.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {seriesCoverLayout,paintSeriesCover,SERIES_COVER_SIZE} from '../src/series-cover-layout.js';
import {seriesCoverSignature} from '../src/series-cover-snapshot.js';
import {seriesCovers} from '../src/library-model.js';
import {materialKinds,materialRoles,materialTextures,materialKindGroups,materialRoleGroups,materialTextureGroups} from '../src/material-taxonomy.js';
import {textBlock,project} from '../src/domain.js';
import {textFontFamily} from '../src/editor-tools-model.js';
import {journalFontCandidates,configureJournalFontLoader,prepareJournalFont} from '../src/journal-fonts.js';
import {textEffectPresets,textEffectStyle} from '../src/text-effect-presets.js';
import {styleFor} from '../src/scene-node-properties.js';
import {validateTextEffects} from '../src/text-effects.js';
import {offlineFontCatalog} from '../src/offline-font-catalog.mjs';
import {createTapeStrip} from '../src/tape-strip.js';
const image=()=>{const c=createCanvas(120,80),x=c.getContext('2d');x.fillStyle='#FF0000';x.fillRect(0,0,60,80);x.fillStyle='#0000FF';x.fillRect(60,0,60,80);return c;};
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const pixel=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];
const node=extra=>({id:'piece',type:'material',assetID:'source',sourceBlobId:'pinned',x:90,y:72,width:120,height:80,opacity:1,rotation:0,...extra});
const thumb=n=>drawMaterialThumbnail(createCanvas(1,1),n,image());
test('used-piece thumbnail crops the pinned source instead of showing its full cover',()=>{
 const c=thumb(node({cropRect:{x:.5,y:0,width:.5,height:1},width:60,height:80}));
 assert.deepEqual(pixel(c,90,72),[0,0,255,255]);assert.equal(pixel(c,4,72)[3],0);
});
test('physical holes and local vector masks remain transparent in used thumbnails',()=>{
 const full=[[0,0],[1,0],[1,1],[0,1]],hole=[[.35,.35],[.65,.35],[.65,.65],[.35,.65]];
 const c=thumb(node({materialMask:{shape:'region',outer:full,holes:[hole]},vectorMask:{outer:[[0,0],[.8,0],[.8,1],[0,1]],holes:[]}}));
 assert.equal(pixel(c,90,72)[3],0);assert.equal(pixel(c,166,72)[3],0);assert.equal(pixel(c,30,72)[3],255);
});
test('flip and alpha match the material painter rather than a static CSS crop',()=>{
 const c=thumb(node({isFlippedHorizontally:true,opacity:.5}));
 const left=pixel(c,35,72),right=pixel(c,145,72);assert.ok(left[2]>250&&right[0]>250);assert.ok(left[3]>=127&&left[3]<=128);
});
test('canvas renderer and thumbnail use identical material geometry at an identical scale',async()=>{
 const n=node({width:100,height:90,cropRect:{x:.1,y:.1,width:.8,height:.8},materialMask:{shape:'rounded',radius:.25},vectorMask:{outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[.4,.4],[.6,.4],[.6,.6],[.4,.6]]]},isFlippedHorizontally:true});
 const small=drawMaterialThumbnail(createCanvas(1,1),n,image(),{width:180,height:144,padding:27});
 // Thumbnail scale is 1: min(126/100,90/90).
 const page={sceneVersion:2,canvas:{width:180,height:144},physicalPageHeightMM:144,paperColor:'#FFFFFF',paperPattern:'plain',pageMode:'single',layers:[n]};
 const rendered=await renderSceneCanvas(page,{createCanvas:()=>createCanvas(1,1),loadMaterialImage:async()=>image(),waitForFonts:false});
 const flattened=createCanvas(180,144),ctx=flattened.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,180,144);ctx.drawImage(small,0,0);
 assert.deepEqual(pixels(rendered.canvas),pixels(flattened));
});
test('processing signature changes for crops/masks/pinned sources, not position or rotation',()=>{
 const n=node({}),key=materialPreviewKey(n);
 assert.equal(key,materialPreviewKey({...n,x:12,y:28,rotation:45}));
 for(const change of [{cropRect:{x:0,y:0,width:.5,height:1}},{vectorMask:{outer:[[0,0],[1,0],[.5,1]],holes:[]}},{sourceBlobId:'new'},{isFlippedHorizontally:true},{opacity:.5}])assert.notEqual(key,materialPreviewKey({...n,...change}));
});
test('tape uses path geometry and end caps in thumbnail, leaving corners transparent',()=>{
 const page={canvas:{height:800},physicalPageHeightMM:200},asset={id:'tape',kind:'tape',physicalWidthMM:120,physicalHeightMM:8};
 const item={...createTapeStrip(asset,page,[[0,0],[100,60],[200,0]],1,{pathMode:'polyline',textureMode:'stretch',startCap:'angled'}),type:'material'};
 const before=globalThis.document;globalThis.document={createElement:()=>createCanvas(1,1)};
 try{const c=thumb(item),data=pixels(c);assert.ok(data.some((v,i)=>i%4===3&&v>0));assert.equal(pixel(c,1,1)[3],0);}finally{if(before)globalThis.document=before;else delete globalThis.document;}
});
test('taxonomy groups cover each existing value exactly once without changing inventory data',()=>{
 for(const [defs,groups] of [[materialKinds,materialKindGroups],[materialRoles,materialRoleGroups],[materialTextures.map(v=>[v,v]),materialTextureGroups]]){
  const ids=groups.flatMap(g=>g.options.map(([id])=>id));assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.sort(),defs.map(([id])=>id).sort());
 }
});
test('series layout chooses fan, nine-cell grid, then unrestricted pile',()=>{
 assert.equal(seriesCoverLayout(2).kind,'fan');assert.equal(seriesCoverLayout(3).kind,'fan');assert.equal(seriesCoverLayout(4).kind,'grid');assert.equal(seriesCoverLayout(5).kind,'grid');
 assert.equal(seriesCoverLayout(5,'fan').kind,'fan');assert.equal(seriesCoverLayout(2,'grid').kind,'grid');assert.equal(seriesCoverLayout(9).slots.length,9);assert.equal(seriesCoverLayout(10).kind,'pile');assert.equal(seriesCoverLayout(50).slots.length,50);assert.equal(seriesCoverLayout(50,'grid').slots.length,9);assert.equal(seriesCoverLayout(0).slots.length,0);
 for(const mode of ['auto','fan','grid','pile'])for(let n=1;n<=12;n++)for(const slot of seriesCoverLayout(n,mode).slots){
  const a=slot.rotation*Math.PI/180,halfW=(Math.abs(Math.cos(a))*slot.w*360+Math.abs(Math.sin(a))*slot.h*300)/2,halfH=(Math.abs(Math.sin(a))*slot.w*360+Math.abs(Math.cos(a))*slot.h*300)/2;
  assert.ok(slot.x*360-halfW>=0&&slot.x*360+halfW<=360);assert.ok(slot.y*300-halfH>=0&&slot.y*300+halfH<=300);
 }
 for(const slot of seriesCoverLayout(50,'pile').slots){
  const a=slot.rotation*Math.PI/180,halfW=(Math.abs(Math.cos(a))*slot.w*360+Math.abs(Math.sin(a))*slot.h*300)/2,halfH=(Math.abs(Math.sin(a))*slot.w*360+Math.abs(Math.cos(a))*slot.h*300)/2;
  assert.ok(slot.x*360-halfW>=0&&slot.x*360+halfW<=360&&slot.y*300-halfH>=0&&slot.y*300+halfH<=300);
 }
});
test('series matrix keeps selected sources in order and produces a bounded 360px image',()=>{
 const series={id:'s'},assets=Array.from({length:7},(_,i)=>({id:'a'+i,seriesID:'s'}));assert.deepEqual(seriesCovers(series,assets).map(a=>a.id),['a0','a1','a2','a3','a4','a5','a6']);
 assert.deepEqual(seriesCovers({...series,coverAssetIDs:['a6','a1']},assets).map(a=>a.id),['a6','a1']);
 const c=createCanvas(360,300),colors=['#FF0000','#00FF00','#0000FF','#FFFF00','#FF00FF'],images=colors.map(color=>{const i=createCanvas(40,40),x=i.getContext('2d');x.fillStyle=color;x.fillRect(0,0,40,40);return i;});
 const layout=seriesCoverLayout(5);paintSeriesCover(c.getContext('2d'),images,layout,SERIES_COVER_SIZE);
 assert.deepEqual(layout.slots.map(s=>pixel(c,Math.round(s.x*360),Math.round(s.y*300))),[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255],[255,0,255,255]]);
});
test('cover cache includes layout, source revision, real dimensions and tape crop, not title',()=>{
 const s={id:'s'},assets=[{id:'a',seriesID:'s',blobId:'pinned',kind:'tape',physicalWidthMM:100,physicalHeightMM:8}],key=seriesCoverSignature(s,assets);
 assert.equal(key,seriesCoverSignature({...s,title:'changed'},assets));assert.notEqual(key,seriesCoverSignature({...s,coverLayout:'fan'},assets));
 for(const change of [{blobId:'new'},{physicalHeightMM:12},{tapeFlatCrop:{x:0,y:0,width:1,height:.8}}])assert.notEqual(key,seriesCoverSignature(s,[{...assets[0],...change}]));
});
test('new manual text is artistic while explicit old or selected typography is retained',()=>{
 const p=project('font').drafts[0],t=textBlock('手帐',p);assert.equal(t.style,'hand');assert.match(textFontFamily(t),/^"Ma Shan Zheng"/);
 assert.match(textFontFamily({...t,style:'serif'}),/^"Songti SC"/);assert.match(textFontFamily({...t,fontName:'Explicit Font'}),/^"Explicit Font"/);
 assert.ok(journalFontCandidates.hand.includes('KaiTi'));
});
test('font loader is shared, failures are reported and retry does not claim a loaded font',async()=>{
 let calls=0;configureJournalFontLoader(async()=>{calls++;});
 const [a,b]=await Promise.all([prepareJournalFont({style:'hand'}),prepareJournalFont({style:'hand'})]);assert.equal(calls,1);assert.equal(a,'web-artistic-ready');assert.equal(b,a);
 configureJournalFontLoader(async()=>{throw Error('offline');});assert.equal(await prepareJournalFont({style:'hand'}),'web-artistic-unavailable');
 configureJournalFontLoader(undefined);assert.equal(await prepareJournalFont({style:'serif'}),'system-fonts');
});
test('editor effect presets compile to the same physical-unit public style and remain editable',()=>{
 const page={canvas:{height:1000},physicalPageHeightMM:200};
 for(const [id] of textEffectPresets){const source={id:'text',type:'text',content:'艺术',fontSize:30,width:100,height:100},next={...source,...styleFor('text',textEffectStyle(id),page,source)};validateTextEffects(next);assert.equal(next.type,'text');assert.equal(next.content,'艺术');if(id==='outline')assert.equal(next.textOutline.width,2.5);}
 assert.throws(()=>textEffectStyle('invented'),/未知/);
});
test('offline font discovery never falsely reports hosted artistic font as installed',()=>{
 const catalog=offlineFontCatalog();assert.equal(catalog.defaultPreset,'hand');if(catalog.recommended.hand)assert.ok(catalog.families.includes(catalog.recommended.hand));else assert.notEqual(catalog.artisticFontAvailable,true);
});
