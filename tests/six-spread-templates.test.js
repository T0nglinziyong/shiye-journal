import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {compileTemplateDraft,listTemplateDrafts} from '../creative-agent/library/template-draft.js';
import {compileSixSpreadTemplate,describeSixSpreadTemplate,listSixSpreadTemplates,matchSixSpreadMaterials,selectSixSpreadTemplate,SPREAD_LEAF_MM} from '../creative-agent/library/six-spread-templates.js';

test('six spread templates expose measured page graphs and editable operations',async()=>{
 const ids=listSixSpreadTemplates();
 assert.equal(ids.length,6);
 for(const id of ids){
  assert.ok(listTemplateDrafts().includes(id));
  const graph=describeSixSpreadTemplate(id);
  assert.deepEqual(graph.leafMm,SPREAD_LEAF_MM);
  assert.ok(graph.nodes.length>=10);
  const compiled=compileTemplateDraft({templateId:id});
  assert.equal(compiled.operations.filter(op=>op.op==='page.update').length,2);
  assert.equal(compiled.operations.some(op=>op.op==='material.add'),false);
  const page=draft({mode:'spread',ratio:'personal'});
  let document=await createCreationDocument({draft:page,assets:[],aliases:{},title:id,prompt:'template check'});
  for(let i=0;i<compiled.operations.length;i+=10)document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`${id.slice(0,3)}-${i}`,baseSceneRevision:creationSceneRevision(document),operations:compiled.operations.slice(i,i+10)},[]).document;
  const layers=new Map(document.page.layers.map(layer=>[layer.creativePieceID,layer]));
  for(const [front,back] of graph.occlusion){
   if(layers.has(front)&&layers.has(back))assert.ok(layers.get(front).zIndex>layers.get(back).zIndex,`${id}: ${front} above ${back}`);
  }
 }
});

test('matching preserves physical material size and accepts explicit slot choice',()=>{
 const id='S02-青黄面包';
 const asset={id:'asset-1',alias:'bread',title:'面包贴纸',visualRoles:['photo'],physicalWidthMM:82,physicalHeightMM:75,preservation:'whole'};
 const plan=matchSixSpreadMaterials(id,[asset],{overrides:{'L-bread-photo':'bread'}});
 assert.equal(plan.assignments.find(a=>a.slot==='L-bread-photo').asset,'bread');
 const compiled=compileTemplateDraft({templateId:id,assets:[asset],bindings:{'L-bread-photo':'bread'}});
 const placed=compiled.operations.find(op=>op.op==='material.add'&&op.id==='L-bread-photo');
 assert.equal(placed.asset,'bread');
 assert.equal('size' in placed,false);
});

test('case calibration material never enters an ordinary template draft',()=>{
 const templateId='S02-青黄面包';
 const bread={id:'case-bread',alias:'case-bread',title:'面包照片',visualRoles:['photo'],physicalWidthMM:82,physicalHeightMM:75,usage:'calibration-only'};
 const ordinary=matchSixSpreadMaterials(templateId,[bread],{overrides:{'L-bread-photo':'case-bread'}});
 assert.equal(ordinary.assignments.find(a=>a.slot==='L-bread-photo').asset,null);
 assert.equal(ordinary.compatible,false);
 assert.ok(ordinary.missingCritical.includes('L-bread-photo'));
 const calibrated=matchSixSpreadMaterials(templateId,[bread],{calibrationMode:true});
 assert.equal(calibrated.assignments.find(a=>a.slot==='L-bread-photo').asset,'case-bread');
 assert.throws(()=>compileSixSpreadTemplate({templateId,assets:[bread],plan:calibrated}),/校准案例素材不能用于用户作品/);
 const draft=compileTemplateDraft({templateId,assets:[bread],bindings:{'L-bread-photo':'case-bread'}});
 assert.equal(draft.operations.some(op=>op.op==='material.add'&&op.asset==='case-bread'),false);
 assert.equal(draft.report.compatible,false);
 assert.equal(selectSixSpreadTemplate([bread]).selected,null);
});

test('a reusable spread accepts role-compatible user subjects without replacing focal slots with unrelated stickers',()=>{
 const assets=[
  {id:'card',alias:'card',title:'人物插画卡',visualRoles:['printed-card'],physicalWidthMM:40,physicalHeightMM:52},
  {id:'scene',alias:'scene',title:'草地照片',visualRoles:['photo'],physicalWidthMM:44,physicalHeightMM:30},
  {id:'dessert',alias:'dessert',title:'甜点照片',visualRoles:['photo'],physicalWidthMM:59,physicalHeightMM:60},
  {id:'butterfly',alias:'butterfly',title:'蝴蝶贴纸',visualRoles:['figure'],physicalWidthMM:56,physicalHeightMM:37}
 ];
 const chosen=selectSixSpreadTemplate(assets).selected;
 assert.equal(chosen?.templateId,'S05-灰黄甜点');
 assert.deepEqual(chosen.used.sort(),['card','dessert','scene']);
 const compiled=compileSixSpreadTemplate({templateId:chosen.templateId,assets,plan:chosen});
 assert.ok(compiled.operations.filter(op=>op.op==='material.add').every(op=>!('size' in op)));
 const unsuitable=matchSixSpreadMaterials('S01-苹果绿白',assets);
 assert.equal(unsuitable.compatible,false);
 assert.ok(unsuitable.missingCritical.includes('L-apple-photo'));
});

test('vellum and ordinary paper keep distinct transparency and palette roles',()=>{
 const paper=(templateId,id)=>compileTemplateDraft({templateId}).operations.find(op=>op.id===id);
 for(const [templateId,id] of [
  ['S02-青黄面包','R-cyan-card'],
  ['S03-棕蓝爱心','R-translucent-card'],
  ['S04-粉黑百合','L-pink-translucent'],
  ['S04-粉黑百合','R-gray-back'],
  ['S06-白粉果实','L-vellum-overlay']
 ])assert.ok(paper(templateId,id).translucency>0,`${id} should remain translucent`);
 assert.equal(paper('S05-灰黄甜点','R-top-card').style.fill,'#F3D8E2');
 assert.equal(paper('S06-白粉果实','R-order-label').style.fill,'#2D2828');
 assert.equal(paper('S06-白粉果实','R-record-label').style.fill,'#F5F2EA');
});

test('six case-specific anchors retain notes, numbers and writing geometry',()=>{
 const operation=(templateId,id)=>compileTemplateDraft({templateId}).operations.find(op=>op.id===id);
 assert.equal(operation('S01-苹果绿白','L-blue-heading').style.fill,'#476D9B');
 assert.equal(operation('S01-苹果绿白','L-date').style.fill,'#184DA2');
 assert.equal(operation('S02-青黄面包','L-date').geometry.kind,'bubble');
 assert.ok(operation('S02-青黄面包','L-date-text').style.fontSizePt>=45);
 assert.equal(operation('S03-棕蓝爱心','L-date').style.fill,'#F5F1E8');
 assert.ok(operation('S03-棕蓝爱心','R-translucent-card').size.width>=59);
 assert.ok(operation('S04-粉黑百合','L-small-note'));
 assert.ok(operation('S04-粉黑百合','R-bottom-writing'));
 for(const id of ['L-vase-note','L-elephant-note','R-top-card','R-green-sticker','R-label'])assert.ok(operation('S05-灰黄甜点',id));
 assert.ok(operation('S06-白粉果实','L-number').style.fontSizePt>=50);
 assert.ok(operation('S06-白粉果实','R-mid-number'));
 assert.equal(operation('S06-白粉果实','R-lower-paper').pattern,'ruled');
});

test('measured numerals fit one line and decorative dots and stars retain their shape',()=>{
 for(const id of listSixSpreadTemplates()){
  const operations=compileTemplateDraft({templateId:id}).operations;
  for(const op of operations.filter(op=>op.op==='graphic.add'&&/edge-accent/.test(describeSixSpreadTemplate(id).nodes.find(n=>n[0]===op.id)?.[2]||''))){
   const ratio=op.size.width/op.size.height;
   assert.ok(/oval/.test(op.id)?ratio>=1&&ratio<=1.82:Math.abs(ratio-1)<.01,`${id}: ${op.id} must keep its intended aspect`);
  }
  for(const op of operations.filter(op=>op.op==='text.fit'))assert.equal(op.fit.maxLines,1,`${id}: ${op.target} number must fit one line`);
 }
});

test('uncropped source-frame anchors are used without silent edge clamping',()=>{
 const s05=describeSixSpreadTemplate('S05-灰黄甜点');
 assert.deepEqual(s05.nodes.find(node=>node[0]==='L-vase-note')[3],[44,30,59,39]);
 assert.deepEqual(s05.nodes.find(node=>node[0]==='R-white-band')[3],[0,48,100,63]);
 const s06=describeSixSpreadTemplate('S06-白粉果实');
 assert.deepEqual(s06.nodes.find(node=>node[0]==='R-lower-paper')[3],[12,62,97,92]);
 const asset={id:'basket',alias:'basket',title:'苹果果篮',visualRoles:['photo'],physicalWidthMM:70,physicalHeightMM:35,visualBoundsRatio:[0,0,1,1]};
 const matched=matchSixSpreadMaterials('S02-青黄面包',[asset],{overrides:{'R-fruit-basket':'basket'}});
 const choice=matched.assignments.find(item=>item.slot==='R-fruit-basket');
 assert.equal(choice.asset,'basket');
 assert.ok(Math.abs(choice.at[0]-61.275)<.02);
});

test('spread corrections keep distinct paper layers, edge accents and large numerals',()=>{
 const s02=describeSixSpreadTemplate('S02-青黄面包');
 const box=(graph,id)=>graph.nodes.find(node=>node[0]===id)?.[3];
 assert.ok(box(s02,'R-vellum-lower')[1]<box(s02,'R-cyan-card')[3]);
 assert.ok(s02.occlusion.some(([front,back])=>front==='R-cyan-card'&&back==='R-vellum-lower'));
 const s03=describeSixSpreadTemplate('S03-棕蓝爱心');
 assert.equal(s03.nodes.filter(node=>node[1]==='right'&&node[2]==='translucent-paper').length,1);
 assert.equal(s03.nodes.filter(node=>node[0].startsWith('R-star-')).length,3);
 assert.ok(compileTemplateDraft({templateId:s03.id}).operations.find(op=>op.id==='L-date-text').style.fontSizePt>=25);
 const s05=describeSixSpreadTemplate('S05-灰黄甜点');
 assert.equal(s05.nodes.find(node=>node[0]==='L-elephant-note')[2],'body-on-background');
 assert.ok(s05.occlusion.some(([front,back])=>front==='R-green-sticker'&&back==='R-top-card'));
 assert.ok(compileTemplateDraft({templateId:s05.id}).operations.find(op=>op.id==='L-star-1').size.width>=5);
 const s06=compileTemplateDraft({templateId:'S06-白粉果实'}).operations;
 const unmatched=matchSixSpreadMaterials('S06-白粉果实',[]);
 assert.ok(!unmatched.missingCritical.includes('L-flower')&&!unmatched.missingCritical.includes('R-flower'),
  'the two small flower-image cards are editable fallback details, not required focal materials');
 const numeral=s06.find(op=>op.op==='text.fit'&&op.target==='R-mid-number');
 assert.ok(numeral.place.at[0]+numeral.size.width<=SPREAD_LEAF_MM[0]);
 assert.ok(numeral.fit.maxFontSizePt>=45);
});

test('every measured object has a replacement role and writable paper is checked before matching',()=>{
 for(const templateId of listSixSpreadTemplates()){
  const graph=describeSixSpreadTemplate(templateId);
  assert.equal(graph.slots.length,graph.nodes.length);
  for(const slot of graph.slots){
   assert.ok(slot.purpose&&slot.mode&&slot.sourceSize,`${templateId}: ${slot.id}`);
   assert.deepEqual(slot.box,graph.nodes.find(node=>node[0]===slot.id)[3]);
  }
 }
 const printed={id:'printed',alias:'printed',title:'带印刷字的卡片',visualRoles:['writing-card','printed-card'],physicalWidthMM:53,physicalHeightMM:76,writableAreaRatio:.38};
 const open={...printed,id:'open',alias:'open',title:'浅色可写便签',visualRoles:['writing-card'],writableAreaRatio:.7};
 const plan=matchSixSpreadMaterials('S04-粉黑百合',[printed,open]);
 assert.equal(plan.assignments.find(item=>item.slot==='L-writing-card')?.asset,'open');
 assert.ok(!plan.assignments.some(item=>item.slot==='L-writing-card'&&item.asset==='printed'));
});

test('a matched photo keeps its complete contour and card text remains above writable material',()=>{
 const photo={id:'photo',alias:'photo',title:'日常照片',visualRoles:['photo'],physicalWidthMM:54,physicalHeightMM:88};
 const compiled=compileSixSpreadTemplate({templateId:'S03-棕蓝爱心',assets:[photo],plan:matchSixSpreadMaterials('S03-棕蓝爱心',[photo],{overrides:{'L-heart-photo':'photo'}})});
 assert.ok(compiled.operations.some(op=>op.op==='material.add'&&op.id==='L-heart-photo'));
 assert.ok(!compiled.operations.some(op=>op.op==='layer.mask'&&op.target==='L-heart-photo'));
});
