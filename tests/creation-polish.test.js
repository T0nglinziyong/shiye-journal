import test from 'node:test';
import assert from 'node:assert/strict';
import {project,draft} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch,validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {applyToolCalls} from '../src/creative.js';
import {findSceneNode,attachSceneV2} from '../src/scene-v2.js';
import {worldBox} from '../src/scene-spatial.js';
import {solveSceneLayout} from '../src/scene-layout.js';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
const at={reference:'page',unit:'mm',at:[70,90]},local={reference:'parent',unit:'ratio',at:[.5,.5]};
const text={op:'text.add',id:'title',content:'拾页随记',size:{width:60,unit:'mm'},place:at};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
async function setup(){
 const asset={id:'paper',title:'test paper',kind:'paper',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('artistic defaults'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}]});
 const assets=task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'regression');
 return {assets,run:(ops,base=doc)=>applyCreationV2Batch(base,{protocolVersion:2,transactionId:'test',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:ops},assets)};
}
test('new offline text defaults to artistic preset while explicit font and body preset remain authoritative',async()=>{
 const {run}=await setup();const made=run([text,{...text,id:'body',style:{fontPreset:'sans'}}]);
 assert.equal(findSceneNode(made.page,'title').style,'hand');assert.equal(findSceneNode(made.page,'body').style,'sans');
 const named=run([{op:'text.update',target:'title',style:{fontFamily:'Example Explicit Font'}}],made);
 assert.equal(findSceneNode(named.page,'title').fontName,'Example Explicit Font');
 const changed=run([{op:'text.update',target:'title',style:{fontPreset:'hand'}}],named);
 assert.equal(findSceneNode(changed.page,'title').fontName,null);
 const explicit=run([{op:'text.update',target:'title',style:{fontPreset:'hand',fontFamily:'Specific Font'}}],changed);
 assert.equal(findSceneNode(explicit.page,'title').fontName,'Specific Font');
});
for(const kind of ['ellipse','star','sparkle','dots'])test(`AI ${kind} graphic is editable, deterministic, linked and cannot allocate physical inventory`,async()=>{
 const {run,assets}=await setup();const ops=[{op:'group.compose',id:'card',layoutBox:{width:90,height:100,unit:'mm'},place:{...at,rotationDeg:23},children:[{...text,place:local},{op:'material.add',id:'paper',asset:'m1',place:{...local,at:[.8,.8]}},{op:'graphic.add',id:'accent',geometry:{kind},size:{width:8,height:8,unit:'mm'},place:{reference:'node:title',referenceAnchor:'top-right',rotationSpace:'reference',rotationDeg:0,behavior:'linked'},style:{stroke:'#C48860',strokeWidthMm:.6}}]}];
 const first=run(ops),second=run(ops);assert.deepEqual(findSceneNode(first.page,'accent'),findSceneNode(second.page,'accent'));
 const accent=findSceneNode(first.page,'accent');assert.equal(accent.type,'shape');assert.equal(accent.kind,kind);assert.equal(accent.stroke,'#C48860');
 assert.equal(accent.layoutConstraint.place.reference,'node:title');
 const before=worldBox(first.page,'accent');const moved=run([{op:'layer.place',target:'title',place:{...local,at:[.3,.6]}}],first);
 const after=worldBox(moved.page,'accent');assert.ok(Math.abs(after.cx-before.cx)>1);near(after.rotation,23);
 const saved=JSON.stringify(moved.page);for(let i=0;i<5;i++)solveSceneLayout(moved.page);assert.equal(JSON.stringify(moved.page),saved);
 attachSceneV2(moved.page);assert.equal(buildMaterialLedger(moved.page,assets).units.length,1);
 const reopened=importEditableWork(JSON.stringify(moved),assets);assert.ok(findSceneNode(reopened.drafts[0],'accent'));
 const revised=run([{op:'layer.update',target:'accent',style:{opacity:.5}}],moved);assert.equal(findSceneNode(revised.page,'accent').opacity,.5);
});
test('circle can use explicit placement and size without silently rewriting the target',async()=>{
 const {run}=await setup();const made=run([text]);const original=structuredClone(findSceneNode(made.page,'title'));
 const next=run([{op:'graphic.add',id:'circle',geometry:{kind:'ellipse'},size:{width:12,height:18,unit:'mm'},place:{reference:'page',at:[30,40],unit:'mm'},style:{stroke:'#78918A',strokeWidthMm:.5,fill:null},order:{after:'title'}}],made);
 const updated=structuredClone(findSceneNode(next.page,'title'));for(const n of [updated,original]){delete n.aiManaged;delete n.zIndex;}assert.deepEqual(updated,original);near(worldBox(next.page,'circle').cx,30*next.page.canvas.height/next.page.physicalPageHeightMM);
});
test('provider text preserves artistic defaults and effects across content changes, supports explicit clearing',()=>{
 const call=(items,base=draft())=>applyToolCalls({tools:[{name:'upsert_text',arguments:{items}}]},base,[]);
 const effect={outline:{color:'#224466',widthMm:.5,offsetMm:[.5,1]},gradient:{angleDeg:90,stops:[{offset:0,color:'#CC6633'},{offset:1,color:'#3377CC'}]},shadow:{color:'#667788',offsetMm:[1,1],blurMm:.3}};
 const created=call([{key:'title',content:'艺术文字',width:.6,font_size:26,effects:effect}]);assert.equal(created.results[0].ok,true,JSON.stringify(created.results));
 const node=created.draft.textBlocks[0];assert.equal(node.style,'hand');assert.ok(node.textOutline&&node.textGradient&&node.shadow);
 const s=created.draft.canvas.height/created.draft.physicalPageHeightMM;near(node.textOutline.width,.5*s);
 const edited=call([{key:'title',content:'更新后的艺术文字',width:.6}],created.draft);assert.equal(edited.results[0].ok,true,JSON.stringify(edited.results));
 const next=edited.draft.textBlocks[0];assert.deepEqual(next.textOutline,node.textOutline);assert.deepEqual(next.textGradient,node.textGradient);assert.deepEqual(next.shadow,node.shadow);
 const cleared=call([{key:'title',content:'清除效果',width:.6,font_style:'sans',effects:{outline:null,gradient:null,shadow:null}}],edited.draft);assert.equal(cleared.results[0].ok,true,JSON.stringify(cleared.results));
 assert.equal(cleared.draft.textBlocks[0].style,'sans');assert.equal(cleared.draft.textBlocks[0].textOutline,null);assert.equal(cleared.draft.textBlocks[0].textGradient,null);assert.equal(cleared.draft.textBlocks[0].shadow,null);
 const bad=call([{key:'title',content:'bad',effects:{outline:{color:'red',widthMm:4,offsetMm:[0,0]}}}],edited.draft);assert.equal(bad.results[0].ok,false);assert.deepEqual(bad.draft.textBlocks[0],edited.draft.textBlocks[0]);
});
