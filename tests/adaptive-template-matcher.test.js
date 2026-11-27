import test from 'node:test';
import assert from 'node:assert/strict';
import {describeTemplateObjects,matchMaterialsToTemplates,compileMatchedTemplate} from '../creative-agent/library/adaptive-template-matcher.js';
import {compileTemplateDraft} from '../creative-agent/library/template-draft.js';

const profile=(alias,kind,w,h,visualRoles,preservation='whole',shape='rectangle',extra={})=>({alias,id:alias,kind,physicalWidthMM:w,physicalHeightMM:h,visualRoles,preservation,shape,mainColor:'#A9A0C7',writableAreaRatio:0,...extra});
const butterfly=profile('butterfly','sticker',56.4,36.7,['figure'],'whole','die-cut');
const pattern=profile('pattern','paper',51.6,50.8,['pattern-paper','plain-paper'],'repeatable','rectangle',{writableAreaRatio:.8});
const photo=profile('photo','photo',43.5,29.9,['photo'],'whole','torn');

test('all five templates describe every object and explicit material decisions',()=>{
 for(const id of ['D143','D146','D153','D158','D162']){
  const record=describeTemplateObjects(id);
  assert.ok(record.objects.length>20,id);
  assert.ok(record.objects.every(o=>o.id&&o.role&&o.parent!==undefined),id);
  assert.ok(record.materialSlots.every(slot=>record.objects.find(o=>o.id===slot)?.target.sizeMm),id);
  assert.ok(record.materialSlots.every(slot=>record.objects.find(o=>o.id===slot)?.purpose),id);
  assert.ok(record.layerRelations.length>0,id);
 }
});

test('an irregular subject stays at its real size and is never masked merely to fill a slot',()=>{
 const plan=matchMaterialsToTemplates([butterfly,pattern,photo],{templateIds:['D162']})[0];
 assert.equal(plan.assignments.find(a=>a.slot==='bear-monday').asset,'butterfly');
 assert.equal(plan.assignments.find(a=>a.slot==='bear-monday').method,'complete');
 const compiled=compileMatchedTemplate(plan,[butterfly,pattern,photo]);
 assert.ok(compiled.operations.some(o=>o.op==='material.add'&&o.id==='bear-monday'&&o.asset==='butterfly'));
 assert.equal(compiled.operations.some(o=>o.op==='layer.mask'&&o.target==='bear-monday'),false);
 assert.equal(compiled.operations.some(o=>o.op==='material.split'&&o.pieces?.some(p=>p.id==='bear-monday')),false);
});

test('only repeatable paper may be physically cut, and unassigned slots stay generated',()=>{
 const plan=matchMaterialsToTemplates([pattern],{templateIds:['D162']})[0];
 const date=plan.assignments.find(a=>a.slot==='heart-memo');
 assert.equal(date.asset,'pattern');
 assert.equal(date.method,'crop');
 assert.equal(plan.assignments.find(a=>a.slot==='bear-monday').method,'generated');
 const compiled=compileMatchedTemplate(plan,[pattern]);
 assert.ok(compiled.operations.some(o=>o.op==='material.split'&&o.asset==='pattern'&&o.pieces?.some(p=>p.id==='heart-memo')));
 assert.equal(compiled.operations.some(o=>o.op==='material.add'&&o.id==='bear-monday'),false);
});

test('bright patterned paper cannot silently replace a dark text backing',()=>{
 const bright=profile('bright','paper',80,110,['pattern-paper'],'repeatable','rectangle',{mainColor:'#EAE3D1'});
 const plan=matchMaterialsToTemplates([bright],{templateIds:['D143']})[0];
 assert.equal(plan.assignments.find(a=>a.slot==='dark-stripe').method,'generated');
});

test('single-page body defaults use 10.5 pt while headings and dates keep their measured sizes',()=>{
 for(const templateId of ['D143','D146','D153','D158','D162']){
  const {operations}=compileTemplateDraft({templateId,assets:[]});
  const body=operations.filter(op=>op.op==='text.add'&&(/body|notes|plant-text|top-notes/.test(op.id)));
  assert.ok(body.length>0,templateId);
  assert.ok(body.every(op=>op.style.fontSizePt===10.5),templateId);
 }
});

test('a printed card without writable space cannot cover the date text',()=>{
 const printed=profile('printed','card',30,30,['printed-card'],'whole','rectangle',{writableAreaRatio:0});
 const plan=matchMaterialsToTemplates([printed],{templateIds:['D162']})[0];
 assert.equal(plan.assignments.find(a=>a.slot==='heart-memo').method,'generated');
 const compiled=compileMatchedTemplate(plan,[printed]);
 assert.equal(compiled.operations.find(op=>op.id==='heart-memo')?.geometry?.kind,'path');
});

test('D158 can place a whole figure without trimming its outline at the page edge',()=>{
 const person=profile('person','sticker',49.2,74.3,['figure'],'whole','die-cut');
 const plan=matchMaterialsToTemplates([person],{templateIds:['D158']})[0];
 const figure=plan.assignments.find(a=>a.slot==='manga-girl');
 assert.equal(figure.asset,'person');
 assert.ok(figure.centerMm[0]+person.physicalWidthMM/2<=plan.template.pageMm[0]+.01);
});
