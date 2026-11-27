import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {compileTemplateDraft,listTemplateDrafts} from '../creative-agent/library/template-draft.js';
import {resolveMeasuredCaseGraph} from '../creative-agent/library/measured-case-templates.js';

test('all five measured templates compile to editable first drafts without a model',async()=>{
 assert.deepEqual(listTemplateDrafts().slice(0,5),['D143','D146','D153','D158','D162']);
 for(const id of ['D143','D153','D158','D162']){
  const compiled=compileTemplateDraft({templateId:id});
  const [width,height]=compiled.report.pageMm,page=draft({ratio:'a5'});
  page.physicalPageHeightMM=height;page.canvas.width=page.canvas.height*width/height;
  let document=await createCreationDocument({draft:page,assets:[],aliases:{},title:id,prompt:'template'});
  for(let i=0;i<compiled.operations.length;i+=12)document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`${id}-${i}`,baseSceneRevision:creationSceneRevision(document),operations:compiled.operations.slice(i,i+12)},[]).document;
  assert.ok(document.page.layers.length>35,id);
  assert.equal(compiled.report.modelCalls,0);
  assert.equal(document.page.layers.some(layer=>/^(?:page-|paper-|binding-)?hole-\d+$/.test(layer.id)),false,`${id} 应去掉本子装订孔`);
 }
});

test('D153 uses the same physical tape for upper right and lower left joins, with open right edge',()=>{
 const tape={id:'tape',alias:'tape',title:'格纹布带',kind:'sticker',physicalWidthMM:52,physicalHeightMM:50};
 const result=compileTemplateDraft({templateId:'D153',assets:[tape],bindings:{'title-tape':'tape'}});
 const split=result.operations.find(o=>o.op==='material.split'&&o.asset==='tape');
 assert.deepEqual(split.pieces.map(p=>p.id),['title-tape','bottom-tape']);
 assert.equal(result.operations.some(o=>o.id==='right-speckled'),false);
 assert.equal(resolveMeasuredCaseGraph('D153').slots['right-speckled'],undefined);
});

test('D153 lower ruled paper retains the large reference sheet, not only its exposed strip',()=>{
 const graph=resolveMeasuredCaseGraph('D153');
 const sheet=graph.boxes['white-ruled'];
 assert.ok(sheet.width>=77&&sheet.height>=90);
 assert.ok(sheet.center[1]<105);
 const compiled=compileTemplateDraft({templateId:'D153'});
 const operation=compiled.operations.find(op=>op.id==='white-ruled');
 assert.ok(Math.abs(operation.size.height-92)<1e-6);
 assert.ok(Math.abs(operation.place.at[0]-67.5)<1e-6&&Math.abs(operation.place.at[1]-102.5)<1e-6);
 assert.ok(compiled.operations.some(op=>op.op==='layer.stack'&&op.target==='gray-paper'&&op.reference==='white-ruled'&&op.side==='after'));
});

test('D162 places the white paper over the lower blue card behind the title',()=>{
 const result=compileTemplateDraft({templateId:'D162'});
 assert.ok(result.operations.some(o=>o.op==='layer.stack'&&o.target==='ruled-middle'&&o.reference==='blue-lower'&&o.side==='after'));
 assert.equal(result.layoutGraph.slots['title-two'].parent,'ruled-middle');
});

test('measured D153 and D162 keep paper, tape, writing and date-card occlusion order',async()=>{
 for(const [id,relationships] of Object.entries({
  D153:[['gray-paper','white-ruled'],['title-tape','title-strip'],['orange-clip','title-strip'],['plant-memo','plant-border'],['banner-girl','plant-memo'],['bottom-tape','white-ruled']],
  D162:[['ruled-middle','blue-lower'],['middle-rule-573','ruled-middle'],['middle-rule-601','ruled-middle'],['middle-rule-629','ruled-middle'],['middle-rule-657','ruled-middle'],['gingham-middle','ruled-middle'],['heart-memo','gingham-middle'],['tea-card','blue-lower'],['clip','tea-card']]
 })){
  const compiled=compileTemplateDraft({templateId:id});
  const [width,height]=compiled.report.pageMm,page=draft({ratio:'a5'});
  page.physicalPageHeightMM=height;page.canvas.width=page.canvas.height*width/height;
  let document=await createCreationDocument({draft:page,assets:[],aliases:{},title:id,prompt:'layer check'});
  for(let i=0;i<compiled.operations.length;i+=12)document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`${id}-layers-${i}`,baseSceneRevision:creationSceneRevision(document),operations:compiled.operations.slice(i,i+12)},[]).document;
  const z=Object.fromEntries(document.page.layers.map(layer=>[layer.id,layer.zIndex]));
  for(const [front,back] of relationships)assert.ok(z[front]>z[back],`${id}: ${front} 应在 ${back} 上方`);
 }
});

test('slot override and parent movement propagate without changing unrelated objects',()=>{
 const base=resolveMeasuredCaseGraph('D162'),changed=resolveMeasuredCaseGraph('D162',{layout:{'ruled-middle':{shiftMm:[4,0]}}});
 assert.ok(Math.abs(changed.boxes['title-two'].center[0]-base.boxes['title-two'].center[0]-4)<1e-6);
 assert.deepEqual(changed.boxes['blue-upper'],base.boxes['blue-upper']);
 const result=compileTemplateDraft({templateId:'D143',slotValues:{q2:{text:'Q7'},'dark-stripe':{color:'#1D2636'}}});
 assert.equal(result.operations.find(o=>o.id==='q2').content,'Q7');
 assert.equal(result.operations.find(o=>o.id==='dark-stripe').style.fill,'#1D2636');
});
