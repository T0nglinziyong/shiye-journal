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
 assert.equal(view.layerTree[0].id,'card');assert.equal(view.layerTree[0].children[0].id,'table');
 assert.match(view.stacking,/back-to-front/);
 const b=worldBox(made.page,'table'),s=made.page.canvas.height/made.page.physicalPageHeightMM;
 assert.ok(table.world.centerMm.every((v,i)=>Math.abs(v-[b.cx/s,b.cy/s][i])<.00001));assert.notEqual(full.x,b.cx);assert.ok(Math.abs(full.world.rotationDeg-30)<1e-9);
 assert.equal(view.sceneRevision,creationSceneRevision(made));assert.equal(creationHelp().operations.some(op=>op.name==='material.weave'),true);
 const index=creationHelp(),familyCommands=index.families.flatMap(row=>row.commands);
 assert.equal(new Set(familyCommands).size,familyCommands.length);
 assert.ok(familyCommands.every(name=>index.operations.some(row=>row.name===name)));
 assert.equal(creationHelp({topics:['layer.update'],full:true}).descriptions[0].schema.properties.op.const,'layer.update');
 assert.throws(()=>inspectCreationDocument(made,{ids:['missing']}),/不存在/);
});

test('large filled dots and painted tape stay editable while a late backing moves behind them',async()=>{
 const {inspectCreationDocument}=await import('../src/creation-inspection.js');
 let doc=await createCreationDocument({draft:draft(),assets:[]});
 doc=applyCreationTransaction(doc,batch(doc,[
  {op:'graphic.add',id:'dot',geometry:{kind:'ellipse'},place:{reference:'page',at:[40,45],unit:'mm'},size:{width:18,height:18,unit:'mm'},style:{fill:'#D8A257',stroke:null}},
  {op:'graphic.add',id:'painted-tape',geometry:{kind:'rect'},place:{reference:'page',at:[47,45],unit:'mm',rotationDeg:-8},size:{width:28,height:5,unit:'mm'},style:{fill:'#86A8BF',stroke:null,opacity:.75}},
  {op:'graphic.add',id:'backing',geometry:{kind:'rect'},place:{reference:'page',at:[45,45],unit:'mm'},size:{width:65,height:72,unit:'mm'},style:{fill:'#F4EEDC',stroke:null}}
 ],'colored-layers'),[]).document;
 assert.deepEqual(inspectCreationDocument(doc).layerTree.map(row=>row.id),['dot','painted-tape','backing']);
 doc=applyCreationTransaction(doc,batch(doc,[{op:'layer.update',target:'backing',order:{edge:'back'}}],'lower-backing'),[]).document;
 const view=inspectCreationDocument(doc);
 assert.deepEqual(view.layerTree.map(row=>row.id),['backing','dot','painted-tape']);
 assert.equal(view.layers.find(row=>row.id==='dot').fill,'#D8A257');
 assert.equal(view.layers.find(row=>row.id==='painted-tape').world.rotationDeg,-8);
});

test('matching another object rotation and stacking across groups preserve world geometry',async()=>{
 const {inspectCreationDocument}=await import('../src/creation-inspection.js');
 let doc=await createCreationDocument({draft:draft(),assets:[]});
 doc=applyCreationTransaction(doc,batch(doc,[
  {op:'group.compose',id:'card',place:{reference:'page',at:[65,75],unit:'mm',rotationDeg:17},layoutBox:{width:75,height:70,unit:'mm'},children:[
   {op:'graphic.add',id:'reference',geometry:{kind:'rect'},place:{reference:'parent',at:[.5,.5],unit:'ratio',rotationDeg:8},size:{width:30,height:35,unit:'mm'},style:{fill:'#AABBDD'}},
   {op:'graphic.add',id:'foreground',geometry:{kind:'ellipse'},place:{reference:'parent',at:[.65,.7],unit:'ratio'},size:{width:10,height:10,unit:'mm'},style:{fill:'#CCAA88'}}
  ]},
  {op:'graphic.add',id:'note',geometry:{kind:'rect'},place:{reference:'page',at:[45,55],unit:'mm',rotationDeg:-5},size:{width:20,height:24,unit:'mm'},style:{fill:'#FFEEDD'}}
 ],'setup-rotation-stack'),[]).document;
 const original=worldBox(doc.page,'note'),angle=worldBox(doc.page,'reference').rotation;
 doc=applyCreationTransaction(doc,batch(doc,[{op:'layout.matchRotation',targets:['note'],reference:'reference',offsetDeg:2}],'match-angle'),[]).document;
 const rotated=worldBox(doc.page,'note');
 assert.ok(Math.abs(rotated.rotation-angle-2)<1e-8);
 assert.ok(Math.abs(rotated.cx-original.cx)<1e-8&&Math.abs(rotated.cy-original.cy)<1e-8);
 assert.equal(rotated.w,original.w);assert.equal(rotated.h,original.h);
 doc=applyCreationTransaction(doc,batch(doc,[{op:'layer.stack',target:'note',reference:'reference',side:'before'}],'stack-note'),[]).document;
 const stacked=worldBox(doc.page,'note'),tree=inspectCreationDocument(doc).layerTree;
 assert.ok(Math.abs(stacked.cx-original.cx)<1e-8&&Math.abs(stacked.cy-original.cy)<1e-8);
 assert.ok(Math.abs(stacked.rotation-angle-2)<1e-8);
 assert.deepEqual(tree[0].children.map(row=>row.id),['note','reference','foreground']);
 assert.throws(()=>applyCreationTransaction(doc,batch(doc,[{op:'layer.stack',target:'card',reference:'note',side:'after'}],'invalid-stack'),[]),/子节点/);
 const beforeNudge=worldBox(doc.page,'note'),scale=doc.page.canvas.height/doc.page.physicalPageHeightMM;
 doc=applyCreationTransaction(doc,batch(doc,[{op:'layout.nudge',targets:['note'],deltaMm:[3,-2],rotationDeg:-4}],'nudge-note'),[]).document;
 const nudged=worldBox(doc.page,'note');
 assert.ok(Math.abs(nudged.cx-beforeNudge.cx-3*scale)<1e-8);
 assert.ok(Math.abs(nudged.cy-beforeNudge.cy+2*scale)<1e-8);
 assert.ok(Math.abs(nudged.rotation-beforeNudge.rotation+4)<1e-8);
});

test('alignment can use a node reference across nested groups',async()=>{
 const {inspectCreationDocument}=await import('../src/creation-inspection.js');
 let doc=await createCreationDocument({draft:draft(),assets:[]});
 doc=applyCreationTransaction(doc,batch(doc,[
  {op:'group.compose',id:'left',place:{reference:'page',at:[40,60],unit:'mm',rotationDeg:8},layoutBox:{width:50,height:50,unit:'mm'},children:[
   {op:'graphic.add',id:'left-shape',geometry:{kind:'rect'},place:{reference:'parent',at:[.5,.5],unit:'ratio'},size:{width:15,height:12,unit:'mm'},style:{fill:'#AAAAAA'}}]},
  {op:'group.compose',id:'right',place:{reference:'page',at:[90,60],unit:'mm',rotationDeg:-6},layoutBox:{width:50,height:50,unit:'mm'},children:[
   {op:'graphic.add',id:'right-shape',geometry:{kind:'rect'},place:{reference:'parent',at:[.5,.5],unit:'ratio'},size:{width:12,height:11,unit:'mm'},style:{fill:'#BBBBBB'}}]},
  {op:'graphic.add',id:'anchor',geometry:{kind:'ellipse'},place:{reference:'page',at:[60,100],unit:'mm'},size:{width:9,height:9,unit:'mm'},style:{fill:'#CCCCCC'}}
 ],'alignment-setup'),[]).document;
 assert.doesNotThrow(()=>applyCreationTransaction(doc,batch(doc,[{op:'layout.align',targets:['left-shape','right-shape'],reference:'node:anchor',axis:'x',align:'center'}],'cross-group-align'),[]));
 doc=applyCreationTransaction(doc,batch(doc,[{op:'layout.align',targets:['left-shape','right-shape'],reference:'node:anchor',axis:'x',align:'center'}],'cross-group-align'),[]).document;
 const anchor=worldBox(doc.page,'anchor');
 assert.ok(Math.abs(worldBox(doc.page,'left-shape').cx-anchor.cx)<1e-8);
 assert.ok(Math.abs(worldBox(doc.page,'right-shape').cx-anchor.cx)<1e-8);
 doc=applyCreationTransaction(doc,batch(doc,[{op:'layout.align',targets:['left-shape'],reference:'node:anchor',axis:'y',align:'center'}],'single-align'),[]).document;
 assert.ok(Math.abs(worldBox(doc.page,'left-shape').cy-anchor.cy)<1e-8);
 const before=[worldBox(doc.page,'left-shape'),worldBox(doc.page,'right-shape')];
 doc=applyCreationTransaction(doc,batch(doc,[{op:'group.create',id:'combined',targets:['left-shape','right-shape']}],'cross-group'),[]).document;
 const children=inspectCreationDocument(doc).layerTree.find(row=>row.id==='combined')?.children.map(row=>row.id);
 assert.deepEqual(children,['left-shape','right-shape']);
 for(const [i,id] of ['left-shape','right-shape'].entries()){
  const current=worldBox(doc.page,id);assert.ok(Math.abs(current.cx-before[i].cx)<1e-8);assert.ok(Math.abs(current.cy-before[i].cy)<1e-8);
 }
});

test('visible edge alignment follows observed quadrilateral edges instead of layout boxes',async()=>{
 const {visibleQuad}=await import('../src/creation-edge-alignment.js');
 let doc=await createCreationDocument({draft:draft(),assets:[]});
 doc=applyCreationTransaction(doc,batch(doc,[
  {op:'graphic.add',id:'base',geometry:{kind:'rect'},place:{reference:'page',at:[65,80],unit:'mm',rotationDeg:14},size:{width:40,height:30,unit:'mm'},style:{fill:'#EEDDBB'}},
  {op:'graphic.add',id:'note',geometry:{kind:'rect'},place:{reference:'page',at:[35,40],unit:'mm',rotationDeg:-12},size:{width:25,height:20,unit:'mm'},style:{fill:'#BBDDEE'}}
 ],'edge-setup'),[]).document;
 const targetQuad=[[.06,.12],[.93,.02],[1,.94],[.03,1]],referenceQuad=[[0,.06],[.94,0],[1,.93],[.05,1]],scale=doc.page.canvas.height/doc.page.physicalPageHeightMM;
 doc=applyCreationTransaction(doc,batch(doc,[{op:'layout.alignEdge',target:'note',reference:'base',targetEdge:'top',referenceEdge:'bottom',targetQuad,referenceQuad,gapMm:2,alongMm:3}],'edge-match'),[]).document;
 const target=visibleQuad(doc.page,'note',targetQuad).world,reference=visibleQuad(doc.page,'base',referenceQuad).world;
 const targetEdge=[target[0],target[1]],referenceEdge=[reference[3],reference[2]];
 const midpoint=pair=>({x:(pair[0].x+pair[1].x)/2,y:(pair[0].y+pair[1].y)/2});
 const a=midpoint(targetEdge),b=midpoint(referenceEdge),dx=referenceEdge[1].x-referenceEdge[0].x,dy=referenceEdge[1].y-referenceEdge[0].y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
 assert.ok(Math.abs((a.x-b.x)*ux+(a.y-b.y)*uy-3*scale)<1e-7);
 assert.ok(Math.abs(-(a.x-b.x)*uy+(a.y-b.y)*ux-2*scale)<1e-7);
 const tx=targetEdge[1].x-targetEdge[0].x,ty=targetEdge[1].y-targetEdge[0].y;
 assert.ok(Math.abs(tx*uy-ty*ux)<1e-7);
 const angled=applyCreationTransaction(doc,batch(doc,[{op:'layout.alignEdge',target:'note',reference:'base',targetEdge:'top',referenceEdge:'bottom',targetQuad,referenceQuad,offsetDeg:7}],'edge-offset'),[]).document;
 const angledEdge=visibleQuad(angled.page,'note',targetQuad).world;
 const angledVector={x:angledEdge[1].x-angledEdge[0].x,y:angledEdge[1].y-angledEdge[0].y};
 assert.ok(Math.abs(Math.atan2(angledVector.y,angledVector.x)-Math.atan2(dy,dx)-7*Math.PI/180)<1e-7);
 assert.throws(()=>applyCreationTransaction(doc,batch(doc,[{op:'layout.alignEdge',target:'note',reference:'base',targetEdge:'top',referenceEdge:'bottom',targetQuad:[[0,0],[1,1],[1,0],[0,1]]}],'bad-quad'),[]),/四边形/);
 const parked=applyCreationTransaction(doc,batch(doc,[{op:'layer.update',target:'note',place:{surface:'tray',reference:'page',at:[35,40],unit:'mm'}}],'park-edge-target'),[]).document;
 assert.throws(()=>applyCreationTransaction(parked,batch(parked,[{op:'layout.alignEdge',target:'note',reference:'base',targetEdge:'top',referenceEdge:'bottom',targetQuad,referenceQuad}],'cross-space-edge'),[]),/同一工作空间/);
});

test('edge alignment reads an approved alpha silhouette and refuses an unknown material edge',async()=>{
 const {visibleQuad}=await import('../src/creation-edge-alignment.js');
 const {inspectCreationDocument}=await import('../src/creation-inspection.js');
 const shaped={id:'shaped',title:'纸片',kind:'paper',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1},sourceSilhouette:[[[[.08,.1],[.9,.05],[.93,.91],[.06,.96]]]]};
 const unknown={id:'unknown',title:'透明剪片',kind:'sticker',physicalWidthMM:20,physicalHeightMM:20,supply:{quantity:1}};
 let doc=await createCreationDocument({draft:draft(),assets:[shaped,unknown],aliases:{m1:'shaped',m2:'unknown'}});
 doc=applyCreationTransaction(doc,batch(doc,[
  {op:'material.add',id:'paper',asset:'m1',place:{reference:'page',at:[40,55],unit:'mm'}},
  {op:'material.add',id:'sticker',asset:'m2',place:{reference:'page',at:[90,55],unit:'mm'}},
  {op:'graphic.add',id:'base',geometry:{kind:'rect'},place:{reference:'page',at:[65,85],unit:'mm'},size:{width:40,height:30,unit:'mm'},style:{fill:'#EEDDBB'}}
 ],'silhouette-setup'),[shaped,unknown]).document;
 assert.equal(visibleQuad(doc.page,'paper',undefined,doc.source).source,'alphaSilhouette');
 const inspection=inspectCreationDocument(doc,{ids:['paper','sticker']});
 assert.equal(inspection.layers.find(row=>row.alias==='paper').visibleEdge.source,'alphaSilhouette');
 assert.equal(inspection.layers.find(row=>row.alias==='sticker').visibleEdge.source,'observedQuadRequired');
 assert.throws(()=>applyCreationTransaction(doc,batch(doc,[{op:'layout.alignEdge',target:'sticker',reference:'base',targetEdge:'top',referenceEdge:'bottom'}],'unknown-edge'),[shaped,unknown]),/可见四角/);
 assert.doesNotThrow(()=>applyCreationTransaction(doc,batch(doc,[{op:'layout.alignEdge',target:'paper',reference:'base',targetEdge:'top',referenceEdge:'bottom'}],'alpha-edge'),[shaped,unknown]));
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
