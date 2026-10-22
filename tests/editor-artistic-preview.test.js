import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {project,textBlock} from '../src/domain.js';
import {textFontFamily} from '../src/editor-tools-model.js';
import {DEFAULT_TEXT_PRESET,textFontPresets} from '../src/text-font-presets.js';
import {textEffectPresets,textEffectStyle,textEffectName,editTextEffectStyle} from '../src/text-effect-presets.js';
import {paintPieceThumbnail,materialPieceSource,materialPieceSignature} from '../src/material-piece-thumbnail.js';
import {paintSceneMaterial} from '../src/scene-material-painter.js';
import {applySceneNodeChange} from '../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch} from '../src/creation-v2-commands.js';
import {creationNode} from '../src/creation-scene-core.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {offlineFontCatalog} from '../src/offline-font-catalog.mjs';
import {worldBox} from '../src/scene-spatial.js';
import {solveSceneLayout} from '../src/scene-layout.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
const at={reference:'page',at:[50,65],unit:'mm'};
const batch=operations=>({protocolVersion:2,transactionId:'artistic',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
async function fixture(){
 const asset={id:'source',title:'test paper',kind:'paper',physicalWidthMM:30,physicalHeightMM:30};
 const task=await createOfflineHandoff({project:project('艺术字与裁片'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}]});
 const assets=task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
 const initial=webSceneDocument(task.source,task.source.baseDraft);
 return {assets,run:(ops,doc=initial)=>applyCreationV2Batch(doc,batch(ops),assets)};
}
const text={op:'text.add',id:'title',content:'艺术手帐',size:{width:70,unit:'mm'},place:at};
test('new UI and AI text share artistic defaults, while explicit existing font choices stay untouched',async()=>{
 const p=project('defaults'),manual=textBlock('art',p.drafts[0]);const {run}=await fixture(),doc=run([text]),node=creationNode(doc,'title');
 assert.equal(manual.style,DEFAULT_TEXT_PRESET);assert.equal(node.style,manual.style);assert.equal(manual.fontName,null);
 assert.match(textFontFamily(node),/^"Ma Shan Zheng",/);assert.equal(textFontPresets[0].id,'hand');
 const old=run([{...text,style:{fontPreset:'serif',fontFamily:'Chosen Serif'}}]);
 const edited=run([{op:'text.update',target:'title',content:'still serif'}],old);assert.equal(creationNode(edited,'title').fontName,'Chosen Serif');
 const switched=run([{op:'text.update',target:'title',style:{fontPreset:'hand'}}],old);assert.equal(creationNode(switched,'title').fontName,null);
 assert.ok(textFontFamily({style:'hand',fontName:'Explicit Font'}).startsWith('"Explicit Font",'));
});
test('font discovery reports artistic preference and installed recommendations without claiming bundled offline font files',()=>{
 const fonts=offlineFontCatalog();assert.equal(fonts.defaultPreset,'hand');assert.ok(Array.isArray(fonts.recommendations));
 for(const row of fonts.recommendations)for(const family of row.installed)assert.ok(fonts.families.includes(family));
 assert.match(fonts.note,/不打包字体/);
});
test('every UI effect preset uses the same public style, native fields and editable export as AI',async()=>{
 const {run,assets}=await fixture(),base=run([text]);
 for(const [id] of textEffectPresets){
  const style=textEffectStyle(id),ai=run([{op:'text.update',target:'title',style}],base),manual=structuredClone(base.page);
  applySceneNodeChange(manual,'title',{style},{policy:USER_SCENE_POLICY});
  const a=creationNode(ai,'title'),b=manual.layers[0];for(const field of ['textOutline','textGradient','shadow','height','fontSize'])assert.deepEqual(a[field],b[field],id+':'+field);
  assert.equal(textEffectName(a),id);const imported=importEditableWork(JSON.stringify(ai),assets);assert.equal(imported.drafts[0].layers[0].type,'text');
 }
});
test('granular effect controls preserve middle gradient stops and convert only the changed outline value',async()=>{
 const {run}=await fixture(),d=run([{...text,style:{outline:{color:'#113355',widthMm:.4,offsetMm:[.2,.3]},gradient:{angleDeg:20,stops:[{offset:0,color:'#FF0000'},{offset:.5,color:'#00FF00'},{offset:1,color:'#0000FF'}]}}}]);
 const node=creationNode(d,'title'),scale=d.page.canvas.height/d.page.physicalPageHeightMM;
 const g=editTextEffectStyle(node,'gradient-end','#AA00FF',scale);assert.deepEqual(g.gradient.stops[1],node.textGradient.stops[1]);assert.equal(node.textGradient.stops.at(-1).color,'#0000FF');
 const o=editTextEffectStyle(node,'outline-width',.8,scale);assert.equal(o.outline.widthMm,.8);assert.deepEqual(o.outline.offsetMm,[.2,.3]);
 assert.throws(()=>textEffectStyle('fake'));assert.throws(()=>editTextEffectStyle({},'outline-width',1,scale));
});
for(const kind of ['circle','star'])test(kind+' decoration is deterministic, closed, editable, attached and bounded without consuming sources',async()=>{
 const {run}=await fixture(),ops=[{op:'group.compose',id:'g',layoutBox:{width:80,height:80,unit:'mm'},place:{...at,rotationDeg:20},children:[{...text,place:{reference:'parent',at:[.5,.5],unit:'ratio'}},{op:'draw.decorate',id:'accent',target:'title',kind,seed:34}]}];
 const a=run(ops),b=run(ops),n=creationNode(a,'accent'),points=n.points;assert.deepEqual(points,creationNode(b,'accent').points);assert.equal(n.type,'ink');
 assert.ok(Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<1e-6);
 assert.ok(worldBox(a.page,'accent').w/(a.page.canvas.height/a.page.physicalPageHeightMM)<11);assert.equal(a.materialDecisions?.length||0,0);
 const old=worldBox(a.page,'accent'),moved=run([{op:'layer.place',target:'title',place:{reference:'parent',at:[.7,.5],unit:'ratio'}}],a);
 assert.notEqual(worldBox(moved.page,'accent').cx,old.cx);const stable=JSON.stringify(moved.page);for(let i=0;i<10;i++)solveSceneLayout(moved.page);assert.equal(JSON.stringify(moved.page),stable);
});
const source=()=>{const c=createCanvas(300,100),x=c.getContext('2d');for(const [i,color] of ['#ff0000','#00ff00','#0000ff'].entries()){x.fillStyle=color;x.fillRect(i*100,0,100,100);}return c;};
const piece=extra=>({id:'piece',type:'material',width:100,height:100,rotation:0,opacity:1,...extra});
const preview=node=>{const c=createCanvas(144,112);paintPieceThumbnail(c.getContext('2d'),node,source());return c;};
const pixel=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];
test('an AI-cropped used piece with no splitParentId shows the cropped pixels, not its source cover',()=>{
 const n=piece({cropRect:{x:2/3,y:0,width:1/3,height:1}}),before=JSON.stringify(n),c=preview(n);
 assert.deepEqual(pixel(c,72,56),[0,0,255,255]);assert.equal(JSON.stringify(n),before);
 const original=preview(piece({width:300,height:100}));assert.deepEqual(pixel(original,72,56),[0,255,0,255]);
});
test('physical aperture and display mask are both transparent in used-piece previews',()=>{
 const n=piece({cropRect:{x:2/3,y:0,width:1/3,height:1},materialMask:{shape:'region',outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[.4,.4],[.6,.4],[.6,.6],[.4,.6]]]},vectorMask:{outer:[[0,0],[.7,0],[.7,1],[0,1]],holes:[]}});
 const c=preview(n);assert.equal(pixel(c,72,56)[3],0);assert.equal(pixel(c,112,56)[3],0);assert.deepEqual(pixel(c,36,56),[0,0,255,255]);
});
test('thumbnail painter shares canonical source clipping, flip and opacity without mutating Scene',()=>{
 const n=piece({width:300,height:100,isFlippedHorizontally:true,opacity:.5}),c=preview(n);
 assert.equal(pixel(c,25,56)[2],255);assert.equal(pixel(c,25,56)[0],0);assert.ok(pixel(c,25,56)[3]>=127&&pixel(c,25,56)[3]<=128);
 const direct=createCanvas(144,112),ctx=direct.getContext('2d'),fit=Math.min(140/n.width,108/n.height);ctx.translate(72,56);ctx.scale(fit,fit);ctx.globalAlpha=.5;paintSceneMaterial(ctx,n,source());assert.deepEqual(c.toBuffer(),direct.toBuffer());
});
test('used-instance images prefer pinned source and signature changes after geometry, masks and source updates',()=>{
 const asset={blobId:'new-source'},source=id=>'blob:'+id,n=piece({sourceBlobId:'pinned'});assert.equal(materialPieceSource(asset,n,source),'blob:pinned');assert.equal(materialPieceSource(asset,null,source),'blob:new-source');
 assert.equal(materialPieceSource(asset,n,()=>''),'');
 for(const edit of [{cropRect:{x:0,y:0,width:.5,height:1}},{vectorMask:{outer:[[0,0],[1,0],[0,1]],holes:[]}},{isFlippedHorizontally:true},{sourceBlobId:'another'},{opacity:.4}])assert.notEqual(materialPieceSignature({...n,...edit}),materialPieceSignature(n));
});
