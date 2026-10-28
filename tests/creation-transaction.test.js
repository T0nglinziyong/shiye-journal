import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {worldBox} from '../src/scene-spatial.js';
import {craftSceneHash} from '../src/craft-fingerprint.js';
const at={reference:'page',at:[40,50],unit:'mm'};
const batch=(doc,operations,id='tx')=>({protocolVersion:2,transactionId:id,baseSceneRevision:creationSceneRevision(doc),operations});
test('browser-safe transaction shares the CLI byte revision, atomicity and retry receipts',async()=>{
 const doc=await createCreationDocument({draft:draft(),assets:[]});
 assert.equal(creationSceneRevision(doc),'sha256:'+createHash('sha256').update(JSON.stringify(doc)).digest('hex'));
 const input=batch(doc,[{op:'text.add',id:'note',content:'一页新的想法',place:at,size:{width:60,unit:'mm'}}]);
 const dry=applyCreationTransaction(doc,input,[],{dryRun:true});assert.equal(dry.document,doc);assert.equal(doc.page.layers.length,0);assert.equal(dry.proposed.page.layers.length,1);
 const applied=applyCreationTransaction(doc,input,[]);assert.equal(applied.changed,true);assert.equal(applied.document.page.layers.length,1);
 assert.equal(creationSceneRevision(applied.document),applied.result.sceneRevision);
 const repeat=applyCreationTransaction(applied.document,input,[]);assert.equal(repeat.document,applied.document);assert.equal(repeat.result.replayed,true);
 assert.throws(()=>applyCreationTransaction(applied.document,{...input,operations:[{op:'page.update',paperColor:'#ffffff'}]},[]),e=>e.code==='TRANSACTION_CONFLICT');
 assert.throws(()=>applyCreationTransaction(applied.document,{...input,transactionId:'stale'},[]),e=>e.code==='REVISION_CONFLICT');
 const saved=JSON.stringify(applied.document);
 assert.throws(()=>applyCreationTransaction(applied.document,batch(applied.document,[{op:'page.update',paperColor:'#aabbcc'},{op:'layer.delete',target:'missing'}],'bad'),[]));
 assert.equal(JSON.stringify(applied.document),saved);
});
test('shared document respects real local groups, linked placement, source sizes and locked nodes',async()=>{
 const asset={id:'paper',title:'纸片',kind:'paper',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1}};
 const doc=await createCreationDocument({draft:draft(),assets:[asset],aliases:{m1:'paper'}});
 const made=applyCreationTransaction(doc,batch(doc,[{op:'group.compose',id:'card',place:{...at,rotationDeg:30},layoutBox:{width:80,height:70,unit:'mm'},children:[
  {op:'material.add',id:'photo',asset:'m1',place:{reference:'parent',at:[.5,.4],unit:'ratio'}},
  {op:'text.add',id:'note',content:'纸边的小记',size:{width:30,unit:'mm'},place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,3],unit:'mm'},behavior:'linked'}}]}]),[asset]).document;
 const before=worldBox(made.page,'note'),width=worldBox(made.page,'photo').w;
 const moved=applyCreationTransaction(made,batch(made,[{op:'layer.update',target:'card',place:{...at,at:[70,80],rotationDeg:-15}}],'move'),[asset]).document;
 assert.notEqual(worldBox(moved.page,'note').cx,before.cx);assert.equal(worldBox(moved.page,'photo').w,width);
 const reopened=structuredClone(moved),locked=applyCreationTransaction(reopened,batch(reopened,[{op:'layer.update',target:'card',locked:true}],'lock'),[asset]).document;
 const hash=craftSceneHash(locked.page);
 assert.throws(()=>applyCreationTransaction(locked,batch(locked,[{op:'layer.update',target:'note',content:'不能覆盖'}],'no'),[asset]),/锁定/);
 assert.equal(craftSceneHash(locked.page),hash);
});

test('inspection distinguishes world millimetres from local fields and exposes advanced settings',async()=>{
 const {inspectCreationDocument,creationHelp}=await import('../src/creation-inspection.js');
 const doc=await createCreationDocument({draft:draft(),assets:[]});
 const made=applyCreationTransaction(doc,batch(doc,[{op:'group.compose',id:'card',place:{...at,rotationDeg:30},layoutBox:{width:80,height:70,unit:'mm'},children:[
  {op:'graphic.add',id:'table',geometry:{kind:'weeklyTable',options:{rows:4,columns:3,showOuterBorder:false}},place:{reference:'parent',at:[.5,.4],unit:'ratio'},size:{width:55,height:40,unit:'mm'},style:{fill:null,stroke:'#556655',strokeWidthMm:.5}}]}]),[]).document;
 const view=inspectCreationDocument(made),table=view.layers.find(n=>n.id==='table'),full=inspectCreationDocument(made,{ids:['table'],full:true}).layers[0];
 assert.equal(table.parent,'card');assert.equal(table.shapeOptions.rows,4);assert.equal(table.shapeOptions.columns,3);assert.equal(table.stroke,'#556655');
 const b=worldBox(made.page,'table'),s=made.page.canvas.height/made.page.physicalPageHeightMM;
 assert.ok(table.world.centerMm.every((v,i)=>Math.abs(v-[b.cx/s,b.cy/s][i])<.00001));assert.notEqual(full.x,b.cx);assert.ok(Math.abs(full.world.rotationDeg-30)<1e-9);
 assert.equal(view.sceneRevision,creationSceneRevision(made));assert.equal(creationHelp().operations.some(op=>op.name==='material.weave'),true);
 assert.equal(creationHelp({topics:['layer.update'],full:true}).descriptions[0].schema.properties.op.const,'layer.update');
 assert.throws(()=>inspectCreationDocument(made,{ids:['missing']}),/不存在/);
});

test('physical retention follows nested local masks and checks later frame changes',async()=>{
 const {validateWebScene}=await import('../src/web-scene-workbench.js');
 const {rigidMatrix}=await import('../src/scene-spatial.js');
 const asset={id:'paper',title:'纸片',kind:'paper',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1}};
 const doc=await createCreationDocument({draft:draft(),assets:[asset],aliases:{m1:'paper'},processing:'保留完整'});
 const made=applyCreationTransaction(doc,batch(doc,[{op:'group.compose',id:'frame',place:{...at,at:[70,80],rotationDeg:30},layoutBox:{width:80,height:70,unit:'mm'},children:[
  {op:'group.compose',id:'inner',place:{reference:'parent',at:[.5,.5],unit:'ratio',rotationDeg:-20},layoutBox:{width:40,height:30,unit:'mm'},children:[
   {op:'material.add',id:'photo',asset:'m1',place:{reference:'parent',at:[.5,.5],unit:'ratio'}}]}]}]),[asset]).document;
 const inner=made.page.layers[0].children[0];inner.vectorMask={outer:[[0,0],[1,0],[1,1],[0,1]],holes:[]};
 assert.doesNotThrow(()=>validateWebScene(made.page,made.source,[asset],{final:false}));
 const clipped=structuredClone(made);clipped.page.layers[0].children[0].vectorMask.outer=[[0,0],[.5,0],[.5,1],[0,1]];
 assert.throws(()=>validateWebScene(clipped.page,clipped.source,[asset],{final:false}),/保留完整/);
 // A frozen edit task must recheck a parent layoutBox change, even if its
 // normalized mask and the child's own coordinates are unchanged.
 const frozen=await createCreationDocument({draft:made.page,assets:[asset],aliases:{m1:'paper'},processing:'保留完整'});
 const shrunk=structuredClone(frozen);shrunk.page.layers[0].children[0].layoutBox.width*=.3;
 assert.throws(()=>validateWebScene(shrunk.page,shrunk.source,[asset],{final:false}),/保留完整/);
 // A parent mask and a translated child group are in different local frames.
 const escaped=structuredClone(made);escaped.page.layers[0].vectorMask={outer:[[0,0],[1,0],[1,1],[0,1]],holes:[]};
 escaped.page.layers[0].children[0].localTransform=rigidMatrix(1000,1000,0);
 assert.throws(()=>validateWebScene(escaped.page,escaped.source,[asset],{final:false}),/保留完整/);
});

test('native snapshot cannot move a protected child through its parent transform',async()=>{
 const {validateWebScene}=await import('../src/web-scene-workbench.js');
 const {rigidMatrix}=await import('../src/scene-spatial.js');
 const doc=await createCreationDocument({draft:draft(),assets:[]});
 const made=applyCreationTransaction(doc,batch(doc,[{op:'group.compose',id:'g',place:at,layoutBox:{width:80,height:70,unit:'mm'},children:[
  {op:'text.add',id:'locked',content:'保留位置',size:{width:30,unit:'mm'},place:{reference:'parent',at:[.5,.5],unit:'ratio'}}]},
  {op:'layer.update',target:'locked',locked:true}]),[]).document;
 const frozen=await createCreationDocument({draft:made.page,assets:[]});
 const changed=structuredClone(frozen);changed.page.layers[0].localTransform=rigidMatrix(0,0,0);
 assert.throws(()=>validateWebScene(changed.page,changed.source,[],{final:false}),/锁定或用户接管/);
});

test('real Canvas renders a masked translucent child group in the same world frame as inspection',async()=>{
 const {createCanvas,loadImage}=await import('canvas');
 const {renderSceneCanvas}=await import('../src/scene-renderer.js');
 const {inspectCreationDocument}=await import('../src/creation-inspection.js');
 const asset={id:'red',title:'红色纸片',kind:'paper',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1}};
 const doc=await createCreationDocument({draft:draft(),assets:[asset],aliases:{m1:'red'},processing:'保留完整'});
 const made=applyCreationTransaction(doc,batch(doc,[{op:'group.compose',id:'outer',place:{...at,at:[60,70],rotationDeg:30},layoutBox:{width:90,height:90,unit:'mm'},children:[
  {op:'group.compose',id:'inner',place:{reference:'parent',at:[.5,.5],unit:'ratio',rotationDeg:-30},layoutBox:{width:40,height:30,unit:'mm'},children:[
   {op:'material.add',id:'paper',asset:'m1',place:{reference:'parent',at:[.5,.5],unit:'ratio'}}]}]}]),[asset]).document;
 const inner=made.page.layers[0].children[0];inner.opacity=.8;inner.vectorMask={outer:[[0,0],[1,0],[1,1],[0,1]],holes:[]};
 const red=createCanvas(10,10);red.getContext('2d').fillStyle='#ff0000';red.getContext('2d').fillRect(0,0,10,10);
 const {canvas}=await renderSceneCanvas(made.page,{createCanvas:()=>createCanvas(1,1),loadMaterialImage:()=>red,loadShapeImage:loadImage,waitForFonts:false});
 const s=made.page.canvas.height/made.page.physicalPageHeightMM;
 const center=inspectCreationDocument(made).layers.find(n=>n.alias==='paper').world.centerMm;
 const ctx=canvas.getContext('2d');
 for(const dx of [-10,0,10]){
  const [r,g,b]=ctx.getImageData(Math.round((center[0]+dx)*s),Math.round(center[1]*s),1,1).data;
  assert.ok(r>200&&g<100&&b<100,`world sample ${dx}: ${r},${g},${b}`);
 }
 assert.ok(canvas.toBuffer('image/png').length>100);
});

test('physical splitting can precede other required materials; only final validation requires them all',async()=>{
 const {validateWebScene}=await import('../src/web-scene-workbench.js');
 const assets=['paper','photo'].map(id=>({id,title:id,kind:'paper',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1}}));
 const doc=await createCreationDocument({draft:draft(),assets,aliases:{m1:'paper',m2:'photo'},requiredAssetIDs:['paper','photo']});
 const split=[{op:'material.add',id:'sheet',asset:'m1',place:at},{op:'material.split',target:'sheet',pieces:[{id:'half',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.5,1]}}]}];
 const partial=applyCreationTransaction(doc,batch(doc,split),assets).document;
 assert.throws(()=>validateWebScene(partial.page,partial.source,assets),/必用素材/);
 assert.notEqual(partial.page.agentRun?.status,'finished');
 const complete=applyCreationTransaction(doc,batch(doc,[...split,{op:'material.add',id:'picture',asset:'m2',place:{...at,at:[80,80]}}]),assets).document;
 assert.doesNotThrow(()=>validateWebScene(complete.page,complete.source,assets));
 assert.throws(()=>applyCreationTransaction(doc,batch(doc,[split[0],{op:'material.split',target:'sheet',pieces:[{id:'one',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.8,1]}},{id:'two',region:{shape:'rect',space:'source',unit:'ratio',box:[.4,0,.6,1]}}]}]),assets),/重叠|区域/);
 assert.equal(doc.page.layers.length,0,'invalid partial crafts still roll back atomically');
});
