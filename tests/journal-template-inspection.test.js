import test from 'node:test';
import assert from 'node:assert/strict';
import {listCurrentTemplates} from '../creative-agent/library/current-templates.js';
import {inspectJournalTemplateSlot} from '../src/journal-template-inspection.js';
import {scoreSingleTemplateSlot,matchMaterialsToTemplates} from '../creative-agent/library/adaptive-template-matcher.js';
import {scoreThreeLayoutSlot,matchThreeLayoutSpread} from '../creative-agent/library/three-layout-template-matcher.js';

test('each current template object exposes its actual default canvas operations',()=>{
 const templates=listCurrentTemplates();
 assert.equal(templates.length,14);
 for(const template of templates)for(const element of template.elements){
  const view=inspectJournalTemplateSlot(template.id,element.id,[]);
  assert.equal(view.slotId,element.id);
  assert.ok(view.targetMm.every(size=>size>0),`${template.id}/${element.id}: target`);
  assert.ok(view.defaultOperations.length,`${template.id}/${element.id}: default operations`);
  if(view.acceptedRoles.length){
   assert.ok(view.score.minimum>0,`${template.id}/${element.id}: threshold`);
   assert.ok(view.gates.some(gate=>gate.field==='visualRoles'),`${template.id}/${element.id}: role gate`);
   assert.ok(view.replacement?.operations.length,`${template.id}/${element.id}: example replacement`);
  }
 }
});

test('vertical tape matches a vertical slot without an unnecessary quarter-turn',()=>{
 const tape={id:'vertical-tape',title:'竖向胶带',kind:'tape',visualRoles:['strip','tape'],
  physicalWidthMM:7,physicalHeightMM:22.5,preservation:'whole'};
 const candidate=scoreThreeLayoutSlot('XHS-海岛排版','L-lower-tape',tape);
 assert.ok(candidate);
 assert.equal(candidate.rotationDeg,0);
 const assignment=matchThreeLayoutSpread('XHS-海岛排版',[tape]).assignments
  .find(item=>item.slot==='L-lower-tape');
 assert.equal(assignment.asset,tape.id);
 assert.equal(assignment.rotationDeg,0);
});

test('slot inspection uses the same candidate score and compiler as template matching',()=>{
 const asset={id:'test-dark-paper',title:'深色花纹纸',kind:'paper',physicalWidthMM:66,
  physicalHeightMM:77,visualRoles:['pattern-paper','plain-paper'],preservation:'repeatable',
  writableAreaRatio:.8,mainColor:'#20252A',shape:'rect'};
 const result=inspectJournalTemplateSlot('D143','dark-stripe',[asset]);
 const scored=scoreSingleTemplateSlot('D143','dark-stripe',asset);
 assert.ok(scored);
 assert.equal(result.candidates[0].score,scored.score);
 assert.equal(result.replacement.asset,asset.id);
 assert.ok(result.replacement.operations.some(op=>op.op==='material.add'&&op.asset===asset.id));
 const assignment=matchMaterialsToTemplates([asset],{templateIds:['D143']})[0].assignments
  .find(item=>item.slot==='dark-stripe');
 assert.equal(assignment.asset,asset.id);
 assert.equal(assignment.score,result.candidates[0].score);
});

test('inspector keeps the complete compiled operation for a selected object',()=>{
 const view=inspectJournalTemplateSlot('S01-苹果绿白','L-apple-photo',[]);
 const paper=view.defaultOperations.find(op=>op.id==='L-apple-photo');
 assert.equal(paper.style.fill,'#647E41');
 assert.equal(paper.texture,'subtle');
 assert.equal(paper.pattern,'plain');
});
