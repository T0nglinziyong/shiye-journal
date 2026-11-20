import test from 'node:test';
import assert from 'node:assert/strict';
import {modelContext,preloadCreationSkills,iterationAdvice} from '../compute-server/harness/context.mjs';
import {loadCreationSkills} from '../compute-server/harness/skills.mjs';

test('an outdated task contract fails before any model invocation',async()=>{
  const {createCreationDocument}=await import('../src/creation-document.js');
  const {draft}=await import('../src/domain.js');
  const {initialHarnessState}=await import('../compute-server/harness/agent.mjs');
  const {taskFingerprint}=await import('../src/task-fingerprint.js');
  const document=await createCreationDocument({draft:draft(),assets:[]});
  document.source.schemaHash='sha256:'+'0'.repeat(64);
  document.source.taskHash=await taskFingerprint(document.source);
  assert.throws(()=>initialHarnessState({document,skills:{catalog(){throw Error('must not load');}},brief:{}}),/合同已变化/);
});

test('only superseded automatic previews are pruned; sources, tool pairs and reasoning remain unchanged',()=>{
  const source={role:'user',content:[{type:'image_url',image_url:{url:'source'}}]};
  const reasoning={role:'assistant',reasoning_content:'required provider reasoning',tool_calls:[{id:'call'}]};
  const receipt={role:'tool',tool_call_id:'call',content:'receipt'};
  const previews=Array.from({length:5},(_,i)=>({role:'user',content:[{type:'text',text:'当前真实画面：'+i+'\n最新 Scene：many coordinates'},{type:'image_url',image_url:{url:'preview'+i}}]}));
  const input=[source,reasoning,receipt,...previews],before=JSON.stringify(input),out=modelContext(input);
  assert.equal(out[0],source);assert.equal(out[1],reasoning);assert.equal(out[2],receipt);assert.equal(out.at(-1),previews.at(-1));assert.equal(out.at(-2),previews.at(-2));
  assert.equal(out.filter(m=>Array.isArray(m.content)).length,3);assert.equal(JSON.stringify(input),before);
  assert.match(out[3].content,/历史预览/);assert.doesNotMatch(out[3].content,/many coordinates/);
});

test('skill routing uses explicit direction and respects no-text tasks',async()=>{
  const skills=await loadCreationSkills();
  const selected=preloadCreationSkills(skills,{source:{textMode:'none',styles:[]}},{styles:['童趣可爱'],intent:'复古旧物'}).map(s=>s.name);
  assert.deepEqual(selected,['journal-composition','paper-layering','playful-journal']);
  assert.ok(!selected.includes('vintage-journal'));
  assert.ok(preloadCreationSkills(skills,{source:{styles:['复古旧物']}}).some(s=>s.name==='vintage-journal'));
});

test('repeated local edits get a batch correction hint without forcing acceptance',()=>{
  const message=target=>({role:'assistant',tool_calls:[{function:{name:'creation_apply',arguments:JSON.stringify({operations:[{op:'layer.update',target}]})}}]});
  assert.equal(iterationAdvice([message('a'),message('b')]),'');
  assert.match(iterationAdvice([message('a'),message('a'),message('a')]),/近期反复修改 a/);
});

test('automatic material facts retain physical dimensions and expose missing required sources before finish',async()=>{
  const {createCreationDocument}=await import('../src/creation-document.js');
  const {draft}=await import('../src/domain.js');
  const {materialBrief,automaticSceneFeedback}=await import('../compute-server/harness/context.mjs');
  const asset={id:'paper',title:'必用纸片',kind:'paper',physicalWidthMM:55.7,physicalHeightMM:69.6};
  const document=await createCreationDocument({draft:draft(),assets:[asset],aliases:{m1:asset.id},requiredAssetIDs:[asset.id]});
  const [fact]=materialBrief(document);assert.equal(fact.widthMM,55.7);assert.equal(fact.heightMM,69.6);assert.equal(fact.required,true);assert.equal(fact.priority,'required');
  const feedback=automaticSceneFeedback(document);assert.equal(feedback.required[0].present,false);assert.equal(feedback.finalValidation.ok,false);assert.match(feedback.finalValidation.issue,/必用素材/);
});

test('failed parameter validation supplies targeted help without changing the operation',async()=>{
  const {failureGuidance}=await import('../compute-server/harness/context.mjs');
  const args={operations:[{op:'material.add',style:{shadow:{color:'#00000033'}}}]},before=JSON.stringify(args);
  const guide=failureGuidance('creation_apply',args,{path:'/operations/0/style/shadow/color'});
  assert.equal(guide.operation.descriptions[0].name,'material.add');assert.equal(guide.fieldDefinitions.Color.pattern,'^#[0-9A-Fa-f]{6}$');assert.equal(JSON.stringify(args),before);
  assert.ok(failureGuidance('creation_help',{},{}).available.topics.includes('place'));
});

test('invalid stroke styling reports all mismatched fields and valid alternatives together',async()=>{
  const {styleFor}=await import('../src/scene-node-properties.js');
  assert.throws(()=>styleFor('ink',{fill:null,strokeOpacity:.5},{canvas:{height:100},physicalPageHeightMM:100}),error=>/style.fill/.test(error.message)&&/style.strokeOpacity/.test(error.message)&&/可用：.*opacity/.test(error.message));
});
