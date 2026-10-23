import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import * as fabric from 'fabric/node';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch,validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {creationNode} from '../src/creation-scene-core.js';
import {creationCommandRegistry,describeCreationCommand} from '../src/creation-v2-contract.js';
import {drawSceneText} from '../src/editor-tools-model.js';
import {measureSceneText} from '../src/scene-text-layout.js';
import {validateTextEffects,textEffectInsets} from '../src/text-effects.js';
import {createFabricSceneBridge} from '../src/fabric-scene-bridge.js';
import {worldBox} from '../src/scene-spatial.js';
import {solveSceneLayout} from '../src/scene-layout.js';
import {auditCreationDesign} from '../src/creation-design-audit.js';
import {sketchGeometry} from '../src/graphic-geometry.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {applySceneNodeChange} from '../src/scene-edit-kernel.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
const at=(x=65,y=65)=>({reference:'page',at:[x,y],unit:'mm'});
const outline={color:'#35516A',widthMm:.7,offsetMm:[.5,.4]},gradient={angleDeg:90,stops:[{offset:0,color:'#E58A50'},{offset:1,color:'#556EA4'}]};
const text={op:'text.add',id:'word',content:'未来',size:{width:50,unit:'mm'},place:at(),style:{fontSizePt:23,fontPreset:'serif'}};
const batch=operations=>({protocolVersion:2,transactionId:'effects',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
async function fixture(width=30,height=20,mode='single'){
 const asset={id:'paper',title:'synthetic paper',kind:'paper',physicalWidthMM:width,physicalHeightMM:height};const p=project('Art lettering',{mode});p.processing='自由拆解';
 const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}]});
 const assets=task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true})),doc=webSceneDocument(task.source,task.source.baseDraft,'editable effects');
 return {assets,doc,run:(ops,base=doc)=>applyCreationV2Batch(base,batch(ops),assets)};
}
const node=(d,id='word')=>creationNode(d,id),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function pixels(extra){const c=createCanvas(220,160),ctx=c.getContext('2d');ctx.translate(110,80);drawSceneText(ctx,{type:'text',width:160,height:100,content:'A',fontSize:64,fontName:'DejaVu Sans',alignment:'center',color:'#FFFFFF',...extra});return ctx.getImageData(0,0,220,160).data;}
const ink=data=>{let count=0;for(let i=3;i<data.length;i+=4)if(data[i])count++;return count;};
test('one graphic command compiles a stable editable hand-drawn path and supports local replacement',async()=>{
 const {run}=await fixture();
 const add={op:'graphic.add',id:'edge',geometry:{kind:'sketch',motif:'corner',seed:23},place:at(50,50),size:{width:40,height:30,unit:'mm'},style:{fill:null,stroke:'#799897',strokeWidthMm:.55}};
 const made=run([add]),shape=node(made,'edge');
 assert.equal(shape.kind,'vector');assert.equal(shape.svgPaths.length,1);
 assert.equal(shape.svgPaths[0].d,sketchGeometry(add.geometry).paths[0].d);
 assert.equal(node(run([add]),'edge').svgPaths[0].d,shape.svgPaths[0].d);
 const revised=run([{op:'layer.update',target:'edge',geometry:{kind:'sketch',motif:'loop',seed:23}}],made);
 assert.notEqual(node(revised,'edge').svgPaths[0].d,shape.svgPaths[0].d);
 assert.equal(node(revised,'edge').id,'edge');
});
test('outline paints full glyph boundaries and gradient paints real multiple colors, not an offset duplicate',()=>{
 const plain=pixels({}),border=pixels({textOutline:{color:'#000000',width:5,offsetX:0,offsetY:0}}),offset=pixels({textOutline:{color:'#000000',width:5,offsetX:8,offsetY:4}}),grad=pixels({textGradient:gradient});
 assert.ok(ink(border)>ink(plain));assert.notDeepEqual(border,offset);let red=0,blue=0;for(let i=0;i<grad.length;i+=4)if(grad[i+3]>200){if(grad[i]>grad[i+2]+20)red++;if(grad[i+2]>grad[i]+20)blue++;}assert.ok(red>10&&blue>10,JSON.stringify({red,blue}));
});
test('effects are real native Scene fields shared by create/update, manual update and import',async()=>{
 const {run,assets}=await fixture(),original=run([text]);const viaText=run([{op:'layer.update',target:'word',style:{outline,gradient}}],original),viaLayer=run([{op:'layer.update',target:'word',style:{outline,gradient}}],original),created=run([{...text,style:{...text.style,outline,gradient}}]);
 assert.deepEqual(node(viaText),node(viaLayer));for(const k of ['height','width','textGradient','textOutline','fontSize'])assert.deepEqual(node(viaText)[k],node(created)[k]);
 const manual=structuredClone(original.page);applySceneNodeChange(manual,'word',{style:{outline,gradient}},{policy:USER_SCENE_POLICY});assert.deepEqual(manual.layers[0].textOutline,node(created).textOutline);
 const reopened=importEditableWork(JSON.stringify(created),assets).drafts[0];assert.deepEqual(reopened.layers[0].textGradient,gradient);
 const cleared=run([{op:'layer.update',target:'word',style:{outline:null,gradient:null}}],created);assert.equal(node(cleared).textOutline,null);assert.equal(node(cleared).textGradient,null);
});
test('invalid unsorted colors, non-text effects and excessive offsets fail atomically',async()=>{
 const {run}=await fixture(),initial=run([text]),before=JSON.stringify(initial);
 for(const bad of [{...gradient,stops:[{offset:1,color:'#000000'},{offset:0,color:'#FFFFFF'}]},{...gradient,stops:[{offset:0,color:'url(private)'},{offset:1,color:'#FFFFFF'}]}])assert.throws(()=>run([{op:'layer.update',target:'word',style:{gradient:bad}}],initial));
 assert.equal(JSON.stringify(initial),before);assert.throws(()=>validateTextEffects({type:'shape',textGradient:gradient}));assert.throws(()=>validateTextEffects({type:'text',textOutline:{width:2,color:'#000000',offsetX:Infinity,offsetY:0}}));
});
test('effects preserve a conservative layout frame and reflow linked followers without angle drift',async()=>{
 const {run}=await fixture();let d=run([text,{op:'graphic.add',id:'tail',geometry:{kind:'ellipse'},size:{width:4,height:4,unit:'mm'},place:{reference:'node:word',referenceAnchor:'bottom-center',anchor:'top-center',behavior:'linked'}}]);const y=worldBox(d.page,'tail').cy;
 d=run([{op:'layer.update',target:'word',style:{outline}}],d);assert.ok(worldBox(d.page,'tail').cy>y);const stable=JSON.stringify(d.page);for(let i=0;i<10;i++)solveSceneLayout(d.page);assert.equal(JSON.stringify(d.page),stable);
 assert.ok(measureSceneText(node(d)).height>=node(d).fontSize*1.6);assert.ok(textEffectInsets(node(d)).bottom>0);
});
test('lettering creates independent editable text children with per-character fonts and effects',async()=>{
 const {run,assets}=await fixture();const d=run([{op:'text.lettering',id:'title',content:'去玩',place:at(),style:{fontSizePt:26,outline},letters:[{index:0,style:{fontPreset:'serif'}},{index:1,style:{fontPreset:'sans',gradient},rotationDeg:5,offsetMm:[0,1]}]}]);
 const title=node(d,'title');assert.equal(title.type,'group');assert.equal(title.children.length,2);assert.equal(node(d,'title-g1').style,'serif');assert.equal(node(d,'title-g2').style,'sans');assert.equal(node(d,'title-g2').rotation,5);assert.ok(node(d,'title-g2').textGradient);
 const changed=run([{op:'layer.update',target:'title-g2',content:'看',style:{color:'#112233',gradient:null}}],d);assert.equal(node(changed,'title-g1').content,'去');assert.equal(node(changed,'title-g2').content,'看');assert.equal(importEditableWork(JSON.stringify(changed),assets).drafts[0].layers[0].children[1].content,'看');
});
test('lettering respects graphemes and rejects invalid indices or duplicate IDs before any commit',async()=>{
 const {run}=await fixture();const a=run([{op:'text.lettering',id:'t',content:'e\u0301好',place:at()}]);assert.equal(node(a,'t').children.length,2);assert.equal(node(a,'t-g1').content,'e\u0301');
 assert.throws(()=>run([{op:'text.lettering',id:'t',content:'好',place:at(),letters:[{index:1,rotationDeg:4}]}]));assert.throws(()=>run([{op:'text.lettering',id:'t',content:'好\n看',place:at()}]));assert.throws(()=>run([{op:'text.lettering',id:'t',content:'新',place:at()}],a));
});
test('ordinary stroke geometry is deterministic, explicitly ordered behind text and locally linked',async()=>{
 const {run}=await fixture();const ops=[{op:'group.compose',id:'card',layoutBox:{width:80,height:80,unit:'mm'},place:{...at(),rotationDeg:20},children:[{...text,place:{reference:'parent',at:[.5,.5],unit:'ratio'}},{op:'graphic.add',id:'mark',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:1,y:0}]},size:{reference:'node:word',width:.85,unit:'ratio'},place:{reference:'node:word',at:[.5,.45],unit:'ratio',anchor:'center',rotationSpace:'reference',rotationDeg:0,behavior:'linked'},style:{stroke:'#E8D66B',strokeWidthMm:4,penStyle:'marker',opacity:.45,blendMode:'multiply'},order:{before:'word'}}]}];
 const a=run(ops),b=run(ops);assert.deepEqual(node(a,'mark').points,node(b,'mark').points);assert.equal(node(a,'mark').type,'ink');assert.equal(node(a,'mark').penStyle,'marker');assert.equal(node(a,'card').children[0].id,'mark');
 near(worldBox(a.page,'mark').rotation,worldBox(a.page,'word').rotation);const x=worldBox(a.page,'mark').cx;
 const moved=run([{op:'layer.update',target:'word',place:{reference:'parent',at:[.7,.5],unit:'ratio'}}],a);assert.notEqual(worldBox(moved.page,'mark').cx,x);
 const multiline=run([{op:'layer.update',target:'word',content:'两行\n文字'},{op:'graphic.add',id:'bad',parent:'card',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:1,y:0}]},size:{reference:'node:word',width:.85,unit:'ratio'},place:{reference:'node:word',at:[.5,.45],unit:'ratio',anchor:'center',rotationSpace:'reference',rotationDeg:0,behavior:'linked'},style:{stroke:'#E8D66B',strokeWidthMm:4,penStyle:'marker',opacity:.45,blendMode:'multiply'},order:{before:'word'}}],a);assert.equal(node(multiline,'bad').type,'ink'); // No semantic keyword/decoration command remains.
});
test('Fabric and export use the same painter; text scaling preserves effect units',async()=>{
 const {run}=await fixture(),d=run([{...text,content:'ABC',style:{...text.style,outline,gradient}}]),n=node(d),bridge=createFabricSceneBridge(fabric),object=await bridge.fromNode(n);
 assert.deepEqual(object.sceneTextNode.textGradient,n.textGradient);
 const before=n.textOutline.width;object.set({scaleX:1.25,scaleY:1.25});bridge.applyObject(d.page,object,{policy:USER_SCENE_POLICY});near(n.textOutline.width,before*1.25);
});
test('design audit is read-only, distinguishes geometry from visual evidence and diagnoses sparse layouts',async()=>{
 const {run}=await fixture(),d=run([text]);const before=JSON.stringify(d);const report=auditCreationDesign(d.page);assert.equal(report.visualReviewPerformed,false);assert.equal(report.layers.text,1);assert.equal(JSON.stringify(d),before);assert.ok(report.pages[0].uncoveredRectangleFraction>.2);assert.ok(report.observations.some(s=>s.includes('文字块')));
 const bg=run([{op:'graphic.add',id:'bg',geometry:{kind:'rect'},size:{reference:'page',width:1,height:1,unit:'ratio'},place:{reference:'page',at:[.5,.5],unit:'ratio'}}]);assert.equal(auditCreationDesign(bg.page).pages[0].estimatedFrameCoverage,1);assert.match(report.limitations,/不是像素/);
});
test('design audit points out a large material frame with no added writing',async()=>{
 const {run}=await fixture(120,150),material={op:'material.add',id:'paper-layer',asset:'m1',place:at()};
 const bare=run([material]),withoutWriting=auditCreationDesign(bare.page,{materials:[{alias:'m1',assetID:'paper',title:'synthetic paper'}]});
 const bareRich=auditCreationDesign(bare.page,{styles:['丰富层叠']});
 assert.ok(bareRich.observations.some(line=>line.includes('没有新增图形')));
 assert.equal(bareRich.observations.some(line=>line.includes('仅使用基础圆')),false);
 assert.equal(withoutWriting.materialFrames[0].assetAlias,'m1');
 assert.equal(withoutWriting.materialFrames[0].annotationFrames,0);
 assert.ok(withoutWriting.observations.some(line=>line.includes('大素材框')));
 assert.ok(withoutWriting.observations.some(line=>line.includes('大素材占据')));
 const written=run([material,text]),withWriting=auditCreationDesign(written.page,{materials:[{alias:'m1',assetID:'paper'}]});
 assert.ok(withWriting.materialFrames[0].annotationFrames>0);
 assert.equal(withWriting.visualReviewPerformed,false);
 const smallCaption=run([material,{...text,style:{...text.style,fontSizePt:12}}]);
 const printed=auditCreationDesign(smallCaption.page,{materials:[{alias:'m1',assetID:'paper',journalRoles:['headline']}],styles:['丰富层叠']});
 assert.ok(printed.observations.some(line=>line.includes('印刷标题框')));
});
test('rich composition preview identifies a limited graphic vocabulary without claiming visual failure',async()=>{
 const {run}=await fixture();
 const circles=run([{op:'graphic.add',id:'ring',geometry:{kind:'ellipse'},size:{width:8,height:8,unit:'mm'},place:at(),style:{fill:null,stroke:'#556677'}}]);
 const report=auditCreationDesign(circles.page,{styles:['丰富层叠']});
 assert.deepEqual(report.graphicVocabulary,{kinds:['ellipse'],inkStrokes:0,pages:{page:1}});
 assert.ok(report.observations.some(line=>line.includes('图形')));
 assert.match(report.limitations,/不是质量或数量评分/);
 const withInk=run([{op:'graphic.add',id:'stroke',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:12,y:3}]},place:at(),style:{stroke:'#556677'}}],circles);
 assert.equal(auditCreationDesign(withInk.page,{styles:['丰富层叠']}).observations.some(line=>line.includes('仅使用基础圆')),false);
 const smallOnly=auditCreationDesign(withInk.page,{styles:['丰富层叠']});
 assert.ok(smallOnly.observations.some(line=>line.includes('较小范围')),'a short stroke must not silence the scale advisory');
 assert.ok(smallOnly.graphicScale.maxWidthFraction<.33);
 const longFaint=run([{op:'graphic.add',id:'long-faint',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:80,y:0}]},place:at(),style:{stroke:'#AABBCC',strokeWidthMm:2,opacity:.25}}]);
 const faintReport=auditCreationDesign(longFaint.page,{styles:['丰富层叠']});
 assert.ok(faintReport.graphicScale.maxWidthFraction>.33);
 assert.ok(faintReport.observations.some(line=>line.includes('笔触面积')),'a long faint line must not stand in for graphic structure');
});
test('design audit warns when a later marker frame crosses earlier text without claiming pixel proof',async()=>{
 const {run}=await fixture();
 const d=run([text,{op:'graphic.add',id:'front-marker',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:20,y:0}]},place:{reference:'page',at:[60,65],unit:'mm'},style:{stroke:'#E8D66B',strokeWidthMm:4,penStyle:'marker'}}]);
 const report=auditCreationDesign(d.page,{styles:['丰富层叠']});
 assert.ok(report.observations.some(line=>line.includes('front-marker→word')));
 assert.match(report.limitations,/不是像素留白率/);
 const behind=run([text,{op:'graphic.add',id:'back-marker',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:20,y:0}]},place:{reference:'page',at:[60,65],unit:'mm'},style:{stroke:'#E8D66B',strokeWidthMm:4,penStyle:'marker'},order:{before:'word'}}]);
 assert.equal(auditCreationDesign(behind.page).observations.some(line=>line.includes('荧光笔在文字图层上方')),false);
});
test('rich spread advisory reports where graphics were placed without treating one-sided marks as a failure',async()=>{
 const {run}=await fixture(30,20,'spread');
 const d=run([{op:'graphic.add',id:'left-mark',geometry:{kind:'ellipse'},size:{width:8,height:8,unit:'mm'},place:at(45,55),style:{fill:null,stroke:'#556677'}}]);
 const report=auditCreationDesign(d.page,{styles:['丰富层叠']});
 assert.deepEqual(report.graphicVocabulary.pages,{'page.left':1,'page.right':0});
 assert.ok(report.observations.some(line=>line.includes('只在一页')));
 assert.equal(report.visualReviewPerformed,false);
});
test('current help stays compact and describes the exact executable examples',()=>{
 for(const name of ['text.lettering','graphic.add']){const help=describeCreationCommand(name);assert.ok(JSON.stringify(help).length<7000);assert.equal(help.schema,undefined);for(const example of creationCommandRegistry[name].examples)validateCreationV2Commands(batch([example]));}
});
