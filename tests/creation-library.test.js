import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision,applyCreationTransaction} from '../src/creation-transaction.js';
import {templateCatalog,rankTemplates,scoreTemplate,templateMarginalScores,maximumAssignment,materialSlots} from '../src/creation-library/matcher.js';
import {compileTemplate} from '../src/creation-library/compiler.js';
import {techniqueCatalog,compileTechnique,describeTechnique} from '../src/creation-library/techniques.js';
import {exampleMaterials,techniqueExample} from '../src/creation-library/examples.js';
const document=assets=>createCreationDocument({draft:draft({ratio:'a5'}),assets,aliases:Object.fromEntries(assets.map(a=>[a.alias,a.id]))});
const apply=(doc,operations,assets)=>applyCreationTransaction(doc,{protocolVersion:2,transactionId:'library-test',baseSceneRevision:creationSceneRevision(doc),operations},assets);

test('at least fifty independently sourced, reviewed diagrams have usable typed elements',()=>{
 assert.ok(templateCatalog.templates.length>=50);const panels=new Set();
 for(const t of templateCatalog.templates){assert.equal(t.reviewed,true);assert.ok(templateCatalog.sources.some(s=>s.id===t.sourceId));assert.ok(t.elements.length>2);assert.ok(materialSlots(t).length);assert.ok(t.aspect>0);panels.add(t.sourcePanel.sha256);
  for(const e of t.elements){assert.equal(e.box.length,4);assert.ok(e.box.every(Number.isFinite));assert.ok(e.box[2]>0&&e.box[3]>0);assert.ok(e.accepts.length);}}
 assert.equal(panels.size,templateCatalog.templates.length);
});
test('optimal assignment beats a greedy slot choice and permits omission',()=>{
 assert.deepEqual(maximumAssignment([[.9,.8,.34,.34],[.85,.2,.34,.34]]),[1,0]);
 assert.equal(maximumAssignment([[.2,.34]])[0],1);
});
test('matching distinguishes absolute paper ratios and material-to-material ratios',()=>{
 const t=templateCatalog.templates.find(t=>t.id==='single-04'),paper={width:148,height:210};
 const assets=materialSlots(t).map((s,i)=>({id:'m'+i,kind:s.accepts[0],role:s.role,physicalWidthMM:s.box[2]*148,physicalHeightMM:s.box[3]*210}));
 const exact=scoreTemplate(t,assets,paper),large=scoreTemplate(t,assets,{width:296,height:420});assert.ok(exact.score>large.score+10);assert.ok(Math.abs(exact.components.relationships-1)<1e-10);
 const uneven=assets.map((a,i)=>i?{...a,physicalWidthMM:a.physicalWidthMM*2}:a);assert.ok(scoreTemplate(t,uneven,paper).components.relationships<1);
});
test('adding a missing compatible material improves the same template, duplicate oversize does not',()=>{
 const t=templateCatalog.templates.find(t=>t.id==='single-04'),slots=materialSlots(t),paper={width:148,height:210};
 const make=(s,id)=>({id,kind:s.accepts[0],role:s.role,physicalWidthMM:s.box[2]*148,physicalHeightMM:s.box[3]*210});
 const selected=[make(slots[0],'m1')],good=make(slots[1],'good'),bad={...good,id:'bad',physicalWidthMM:1000};
 const scores=templateMarginalScores({selected,candidates:[good,bad],paper,templates:[t]});assert.ok(scores.get('good').utility>scores.get('bad').utility);assert.equal(scores.get('good').templateId,t.id);
});
for(const template of templateCatalog.templates)test('template compiles through real transaction: '+template.id,async()=>{
 const assets=materialSlots(template).slice(0,5).map((s,i)=>({id:'test-'+i,alias:'m'+i,title:'模板验收素材',kind:'paper',physicalWidthMM:s.box[2]*148,physicalHeightMM:s.box[3]*210,supply:{quantity:1}}));
 const doc=await document(assets),result=compileTemplate({templateId:template.id,id:'layout',paper:{width:148,height:210},materials:assets,title:'今天的小记'});
 const done=apply(doc,result.operations,assets);assert.equal(done.changed,true);assert.ok(result.report.used.length);
 const mats=result.operations[0].children.filter(o=>o.op==='material.add');assert.ok(mats.every(m=>!('size' in m)));assert.equal(new Set(mats.map(m=>m.asset)).size,mats.length);
});
for(const method of techniqueCatalog.methods)test('technique transaction is executable: '+method.id,async()=>{
 const {parameters,before}=techniqueExample(method),doc=await document(exampleMaterials),compiled=compileTechnique({methodId:method.id,parameters,materials:exampleMaterials});
 const result=apply(doc,[...before,...compiled.operations],exampleMaterials);assert.equal(result.changed,true);assert.equal(describeTechnique(method.id).illustration.id,method.id);
});
test('missing slots remain empty; unknown source and repeated material are rejected',()=>{
 const t=templateCatalog.templates[0],paper={width:148,height:210},s=materialSlots(t);
 assert.throws(()=>compileTemplate({templateId:t.id,id:'g',paper,materials:[]}),/没有可放置/);
 assert.throws(()=>compileTemplate({templateId:t.id,id:'g',paper,materials:[],bindings:[{slotId:s[0].id,alias:'secret'}]}),/授权/);
 assert.throws(()=>compileTemplate({templateId:t.id,id:'g',paper,materials:[{alias:'m1'}],bindings:[{slotId:s[0].id,alias:'m1'},{slotId:s[1].id,alias:'m1'}]}),/重复/);
});
test('long titles retain their full content and unsupported parameters are explicit errors',async()=>{
 const text='很长的标题需要根据可用空间分行而不能丢掉后半段'.repeat(3),compiled=compileTechnique({methodId:'title-stack',parameters:{id:'long',text,widthMm:44}});
 assert.equal(compiled.operations[0].children.find(o=>o.op==='text.add').content,text);assert.ok(compiled.report.heightMm>38);
 const doc=await document([]);assert.equal(apply(doc,compiled.operations,[]).changed,true);
 assert.throws(()=>compileTechnique({methodId:'title-label',parameters:{id:'x',text:'你好',dangerous:1}}),/不支持/);
});
test('template ranking is deterministic and does not mutate real material dimensions',()=>{
 const input=structuredClone(exampleMaterials),args={materials:input,paper:{width:148,height:210},limit:5};
 assert.deepEqual(rankTemplates(args),rankTemplates(args));assert.deepEqual(input,exampleMaterials);
});

test('an existing editable title group can occupy a template slot without rasterization',async()=>{
 const assets=exampleMaterials.slice(0,2);let doc=await document(assets);
 doc=apply(doc,compileTechnique({methodId:'title-outline',parameters:{id:'heading',text:'好天气'}}).operations,assets).document;
 const template=templateCatalog.templates.find(t=>t.id==='center-1'),slot=materialSlots(template)[0],heading=template.elements.find(e=>e.role==='title');
 const compiled=compileTemplate({templateId:template.id,id:'page-group',paper:{width:148,height:210},materials:assets,bindings:[{slotId:slot.id,alias:'m1'},{slotId:heading.id,node:'heading'}],nodes:[{id:'heading'}]});
 const result=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'compose-title',baseSceneRevision:creationSceneRevision(doc),operations:compiled.operations},assets).document;
 const group=result.page.layers.find(n=>n.id==='page-group');assert.ok(group.children.some(n=>n.id==='heading'&&n.type==='group'));
});
test('taxonomy and open semantic tags remain available in frozen matching sources',async()=>{
 const asset={...exampleMaterials[0],styleTags:['手绘'],contentTags:['咖啡杯'],contentCategories:['food']};
 const doc=await document([asset]);assert.deepEqual(doc.source.sourceSnapshots[0].styleTags,['手绘']);
});
