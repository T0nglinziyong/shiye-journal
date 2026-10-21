import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch,validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {describeCreationCommand,creationCommandRegistry} from '../src/creation-v2-contract.js';
import {creationNode} from '../src/creation-scene-core.js';
import {attachSceneV2} from '../src/scene-v2.js';
import {worldBox} from '../src/scene-spatial.js';
import {solveSceneLayout} from '../src/scene-layout.js';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {localGlyphOutline} from '../src/creation-font-resolver.mjs';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {createCanvas,loadImage} from 'canvas';
import {tinyPNG} from './offline-canvas-test-support.mjs';
const at=(x=70,y=70)=>({reference:'page',at:[x,y],unit:'mm'});
const batch=operations=>({protocolVersion:2,transactionId:'canonical',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
const asset=(id,w=60,h=80)=>({id,title:id,kind:'paper',physicalWidthMM:w,physicalHeightMM:h,supply:{quantity:1}});
const add=(id='paper',alias='m1',place=at())=>({op:'material.add',id,asset:alias,place});
const text=(extra={})=>({op:'text.add',id:'text',content:'第一行\n第二行中英文 text 重复文字'.repeat(3),size:{width:45,unit:'mm'},place:at(),style:{fontSizePt:10,lineHeight:1.4},...extra});
async function fixture(list=[asset('paper'),asset('second')]){
 const p=project('共用编辑管线',{mode:'spread',ratio:'a5'});p.processing='自由拆解';
 const task=await createOfflineHandoff({project:p,assets:list,aliases:Object.fromEntries(list.map((a,i)=>['m'+(i+1),a.id])),previews:list.map((_,i)=>({alias:'m'+(i+1),bytes:tinyPNG}))});
 const doc=webSceneDocument(task.source,task.source.baseDraft,'统一编辑'),assets=task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
 return {doc,assets,run:(ops,base=doc)=>applyCreationV2Batch(base,batch(ops),assets,{glyphOutline:localGlyphOutline})};
}
const node=(d,id='text')=>creationNode(d,id);
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('creation, specialized and generic text edits produce exactly the same geometry and retained sizing intent',async()=>{
 const {run}=await fixture(),initial=run([text()]);
 for(const change of [{style:{fontSizePt:20}},{size:{width:20,unit:'mm'}},{content:'新的短句'},{style:{lineHeight:2,letterSpacingMm:.2}},{size:{width:80,height:70,unit:'mm'},style:{fontSizePt:14}}]){
  const specialized=run([{op:'text.update',target:'text',...change}],initial),generic=run([{op:'layer.update',target:'text',...change}],initial);
  assert.deepEqual(node(specialized),node(generic));
  const original=text(),created=run([text({...change,size:{...original.size,...change.size},style:{...original.style,...change.style}})]);
  for(const key of ['fontSize','width','height','fixedLineHeight','textLayout'])assert.deepEqual(node(created)[key],node(generic)[key],key);
  assert.deepEqual(run([{op:'layer.update',target:'text',style:{fontSizePt:node(generic).fontSize/(generic.page.canvas.height/generic.page.physicalPageHeightMM)*72/25.4}}],generic).page,generic.page);
 }
});
test('minimum text height and relative line height persist after serialization and content changes',async()=>{
 const {run,assets}=await fixture();let d=run([text({content:'一行',size:{width:80,height:60,unit:'mm'}})]);
 d=JSON.parse(JSON.stringify(d));d=run([{op:'text.update',target:'text',style:{fontSizePt:20}}],d);
 const s=d.page.canvas.height/d.page.physicalPageHeightMM;approx(node(d).fixedLineHeight,node(d).fontSize*1.4);assert.ok(node(d).height>=60*s);
 const imported=importEditableWork(JSON.stringify(d),assets);assert.ok(imported.drafts[0].layers.some(n=>n.textLayout?.minimumHeight===60*s));
});
test('reflow precedes anchoring and a linked follower sees the new height in the same transaction',async()=>{
 const {run}=await fixture();const relation={reference:'node:text',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'},behavior:'linked'};
 const initial=run([text({place:{...at(),rotationDeg:25}}),{op:'shape.add',id:'follower',kind:'ellipse',size:{width:4,unit:'mm'},place:relation}]);
 const a=run([{op:'text.update',target:'text',style:{fontSizePt:20}}],initial),b=run([{op:'layer.update',target:'text',style:{fontSizePt:20}}],initial);
 assert.deepEqual(a.page,b.page);assert.notEqual(worldBox(a.page,'follower').cy,worldBox(initial.page,'follower').cy);
 const stable=JSON.stringify(a.page);for(let i=0;i<5;i++)solveSceneLayout(a.page);assert.equal(JSON.stringify(a.page),stable);
});
test('curved text and full-content fitting share reflow, fail atomically when impossible',async()=>{
 const {run}=await fixture();const d=run([text({content:'A short arc',size:{width:70,unit:'mm'},style:{fontSizePt:18,curveHeightMm:8,italic:true,underline:true}})]);
 assert.ok(node(d).curveHeight>0);const fit=run([{op:'text.fit',target:'text',size:{width:35,height:30,unit:'mm'},fit:{minFontSizePt:6,maxFontSizePt:18}}],d);
 assert.equal(node(fit).content,'A short arc');assert.ok(node(fit).fontSize<node(d).fontSize);
 const before=JSON.stringify(d);assert.throws(()=>run([{op:'text.fit',target:'text',size:{width:1,height:1,unit:'mm'},fit:{minFontSizePt:18,maxFontSizePt:18}}],d),/放不下/);assert.equal(JSON.stringify(d),before);
});
test('compact discovery stays bounded and preserves recursive help only in explicit full mode',()=>{
 const brief=describeCreationCommand('group.compose'),full=describeCreationCommand('group.compose',{full:true});
 assert.ok(Buffer.byteLength(JSON.stringify(brief))<8000);assert.ok(full.schema.$defs.Operation);assert.equal(brief.schema,undefined);
 for(const topic of ['region','geometry','relation'])assert.ok(describeCreationCommand(topic).variants.length>1);
 for(const key of Object.keys(creationCommandRegistry))assert.ok(Buffer.byteLength(JSON.stringify(describeCreationCommand(key)))<10000,key);
 for(const op of ['native.material.add','native.text.add','advanced.v1.material.craft'])assert.throws(()=>validateCreationV2Commands(batch([{op}])),/未知/);
 for(const bad of [{xMm:5},{font_size:12},{set:{x:1}}])assert.throws(()=>validateCreationV2Commands(batch([{op:'layer.update',target:'text',...bad}])),/commands/);
});
test('digital geometry update, stroke style and repeat keep editable identities',async()=>{
 const {run}=await fixture();let d=run([{op:'vector.add',id:'v',paths:[{d:'M0 0 L10 10',style:{stroke:'#334455'}}],viewBox:[0,0,10,10],size:{width:20,unit:'mm'},place:at()},
 {op:'ink.add',id:'ink',points:[{x:0,y:0,pressure:.2},{x:20,y:0,pressure:.8}],unit:'mm',place:{...at(),rotationDeg:30},style:{color:'#334455',strokeWidthMm:1,penStyle:'pressure'}}]);
 d=run([{op:'layer.update',target:'v',geometry:{kind:'vector',paths:[{d:'M0 0 L20 0 L10 10 Z',style:{fill:'#FF0000'}}],viewBox:[0,0,20,10]},style:{strokeWidthMm:1}},
 {op:'layer.update',target:'ink',geometry:{kind:'ink',points:[{x:0,y:0,pressure:.1},{x:30,y:0,pressure:.9}],unit:'mm'}},
 {op:'layer.repeat',target:'v',copies:[{id:'copy',place:at(120,70),style:{opacity:.5}}]}],d);
 assert.equal(node(d,'copy').svgPaths[0].d,node(d,'v').svgPaths[0].d);assert.equal(node(d,'copy').opacity,.5);approx(worldBox(d.page,'ink').rotation,30);assert.deepEqual(node(d,'ink').points.map(p=>p.p),[.1,.9]);
});
for(const style of ['torn','ticket_notch','postage','fringe','partial_tear'])test('edge capability '+style+' remains available without raw plan parameters',async()=>{
 const {run}=await fixture();const d=run([add(),{op:'material.edge',target:'paper',edge:{style,edges:['bottom'],depthMm:1,periodMm:16,seed:42}}]);assert.equal(node(d,'paper').materialSteps.at(-1).style,style);
});
test('trim diagonal contour and restore remain bounded by real source ledger',async()=>{
 const {run,assets}=await fixture();let d=run([add(),{op:'material.trim',target:'paper',edge:'left',quantity:{value:5,unit:'mm',mode:'remove'}},{op:'material.contour',target:'paper',shape:'rounded',radiusRatio:.1},{op:'material.diagonal',target:'paper',line:{from:[0,0],to:[1,1],unit:'ratio',space:'local'},keep:'left'}]);
 assert.ok(node(d,'paper').materialMask);d=run([{op:'material.restore',target:'paper'}],d);approx(buildMaterialLedger(attachSceneV2(d.page),assets).units[0].usedAreaMM2,4800);
});
test('glyph outlines use actual fonts and real transparent cut geometry, unavailable font never changes the input',async()=>{
 const {run}=await fixture();let d=run([add()]);const command={op:'material.glyphKnockout',target:'paper',text:'HI',style:{fontFamily:'Liberation Sans',fontSizePt:20},place:{reference:'node:paper',at:[.5,.5],unit:'ratio',rotationSpace:'reference',rotationDeg:0}};
 const output=run([command],d);assert.ok(node(output,'paper').materialMask);const before=JSON.stringify(d);
 assert.throws(()=>run([{...command,style:{...command.style,fontFamily:'ShiyeMissingFont20261022'}}],d),/字体/);assert.equal(JSON.stringify(d),before);
 const canvas=await renderSceneCanvas(output.page,{createCanvas:()=>createCanvas(1,1),loadMaterialImage:async()=>loadImage(Buffer.from(tinyPNG)),waitForFonts:false});assert.ok(canvas.canvas.toBuffer('image/png').length>100);
});
test('complex tape path, texture and caps retain all points and one physical strip',async()=>{
 const tape={...asset('tape',80,8),kind:'tape',supply:{quantity:0}}, {run,assets}=await fixture([tape]);
 const d=run([{op:'material.tape',id:'tape-piece',asset:'m1',path:{points:[[0,0],[20,5],[40,0]],unit:'mm'},widthMm:8,texture:{mode:'stretch',reverse:true},caps:{start:'angled',end:'torn',depthMm:1},place:{...at(),rotationDeg:15}}]);
 const t=node(d,'tape-piece').tapeStrip;assert.equal(t.points.length,3);assert.equal(t.textureMode,'stretch');assert.equal(t.reverseTexture,true);assert.equal(t.startCap,'angled');assert.ok(t.pathLengthMM>40);assert.equal(buildMaterialLedger(attachSceneV2(d.page),assets).rolls[0].pieces.length,1);
});
test('layout reuse maps distinct physical sources and internal linked references without copying source occupancy',async()=>{
 const {run,assets}=await fixture();const group={op:'group.compose',id:'card',layoutBox:{width:80,height:100,unit:'mm'},place:at(),children:[add('p','m1',{reference:'parent',at:[.5,.4],unit:'ratio'}),text({id:'label',content:'新组合',size:{width:70,unit:'mm'},place:{reference:'node:p',referenceAnchor:'bottom-center',anchor:'top-center',behavior:'linked'}})]};
 const d=run([group,{op:'layout.reuse',target:'card',id:'card2',materialMap:{m1:'m2'},place:at(180,70)}]);
 assert.equal(node(d,'card2-p').assetID,assets[1].id);assert.equal(node(d,'card2-label').layoutConstraint.place.reference,'node:card2-p');assert.equal(buildMaterialLedger(attachSceneV2(d.page),assets).units.length,2);
});
test('replacement, flip, layout alignment and material relationship use current public fields',async()=>{
 const {run}=await fixture([asset('a'),asset('b'),asset('c')]);const d=run([add('a','m1',at(50,70)),add('b','m2',at(120,90)),{op:'material.relate',target:'b',relation:{kind:'underlay',reference:'node:a',offset:{value:[3,3],unit:'mm'}}},{op:'material.replace',target:'a',asset:'m3',style:{flipHorizontal:true}},{op:'layout.align',targets:['a','b'],axis:'y',align:'center'}]);
 assert.equal(node(d,'a').assetID,'c');assert.equal(node(d,'a').isFlippedHorizontally,true);approx(worldBox(d.page,'a').cy,worldBox(d.page,'b').cy);
});
test('separate tape segments allocate independent units, paper ruling is actual physical geometry',async()=>{
 const {run,assets}=await fixture([{...asset('tape',80,8),kind:'tape',supply:{quantity:0}}]);
 const d=run([{op:'material.tape',id:'t1',asset:'m1',lengthMm:20,place:at()}, {op:'material.tape',id:'t2',asset:'m1',lengthMm:25,place:at(100,70)}, {op:'page.update',paperPattern:'lines',rulingMm:6}]);
 assert.equal(buildMaterialLedger(attachSceneV2(d.page),assets).rolls[0].pieces.length,2);
 approx(d.page.paperRuling.rowPositions[0]*d.page.physicalPageHeightMM,6);
});
