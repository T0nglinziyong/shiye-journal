import test from 'node:test';
import assert from 'node:assert/strict';
import {journalReferenceCases,selectJournalReferenceCases} from '../src/journal-reference-catalog.js';
import {journalAbstractTemplates,selectJournalAbstractTemplates,journalAbstractTemplateGuide} from '../src/journal-abstract-templates.js';
import {journalSourceAudit,journalVerifiedPairs} from '../src/journal-source-audit.js';

// These numbers were checked against the user's 70-image contact sheet. Real
// pages alone are not evidence of an explicit abstract layout diagram.
const diagramImages=new Set(journalSourceAudit.filter(entry=>entry.kind!=='case').map(entry=>entry.number));

test('every abstract template points to a diagram actually present in the uploaded images',()=>{
  const cases=new Map(journalReferenceCases.map(entry=>[entry.id,entry]));
  assert.equal(new Set(journalAbstractTemplates.map(entry=>entry.id)).size,journalAbstractTemplates.length);
  for(const entry of journalAbstractTemplates){
    const family=cases.get(entry.caseId);
    assert.ok(family,entry.id);
    assert.ok(entry.sourceNumbers.length,entry.id);
    assert.ok(entry.sourceNumbers.every(number=>diagramImages.has(number)&&family.sourceNumbers.includes(number)),entry.id);
    assert.ok((entry.exampleSourceNumbers||[]).every(number=>family.sourceNumbers.includes(number)),entry.id);
    assert.ok(entry.structure.length>20,entry.id);
  }
  assert.deepEqual(new Set(journalAbstractTemplates.flatMap(entry=>entry.sourceNumbers)),diagramImages);
});

test('the provided red time-axis diagram is paired with its real journal case',()=>{
  const template=journalAbstractTemplates.find(entry=>entry.id==='red-market-two-column-timeline');
  assert.deepEqual(template.sourceNumbers,[36]);
  assert.deepEqual(template.exampleSourceNumbers,[35]);
  const context={styles:['密集拼贴'],purposes:['图文收藏'],materials:[{title:'食物照片',tags:['时间轴']}]};
  const selected=selectJournalReferenceCases(context);
  const templates=selectJournalAbstractTemplates(selected,context);
  assert.ok(templates.length<=3);
  assert.ok(templates.some(entry=>entry.id===template.id));
  assert.match(journalAbstractTemplateGuide(templates),/模板原图 36；对应真实案例原图 35/);
});

test('all 70 images are classified; every source diagram remains eligible even without a matched case',()=>{
  assert.deepEqual(journalSourceAudit.map(entry=>entry.number),Array.from({length:70},(_,index)=>index+1));
  assert.equal(journalSourceAudit.filter(entry=>!['case','template','mixed'].includes(entry.kind)).length,0);
  assert.deepEqual(journalSourceAudit.find(entry=>entry.number===35).kind,'case');
  assert.deepEqual(journalSourceAudit.find(entry=>entry.number===36).kind,'template');
  assert.deepEqual(journalSourceAudit.find(entry=>entry.number===30).kind,'mixed');
  assert.deepEqual(journalSourceAudit.find(entry=>entry.number===32).kind,'case');
  assert.ok(journalAbstractTemplates.some(entry=>!entry.exampleSourceNumbers?.length));
  const travel=journalReferenceCases.filter(entry=>entry.id==='travel-route');
  const selected=selectJournalAbstractTemplates(travel,{styles:['旅行票据'],purposes:['旅途记录']});
  assert.ok(selected.length>0&&selected.length<=3);
  assert.ok(selected.some(entry=>!entry.exampleSourceNumbers?.length));
  assert.match(journalAbstractTemplateGuide(selected),/尚无可确认对应成品/);
  for(const entry of journalAbstractTemplates.filter(item=>item.exampleSourceNumbers?.length)){
    const sameImage=entry.sourceNumbers.every(number=>entry.exampleSourceNumbers.includes(number)&&journalSourceAudit[number-1].kind==='mixed');
    const crossImage=journalVerifiedPairs.some(pair=>entry.sourceNumbers.every(number=>pair.templateNumbers.includes(number))&&entry.exampleSourceNumbers.every(number=>pair.caseNumbers.includes(number)));
    assert.ok(sameImage||crossImage,entry.id);
  }
});
