import test from 'node:test';
import assert from 'node:assert/strict';
import {modelContext,creativeCompactionCandidate,creativeCompactionTranscript,recommendCreationSkills,shortlistCreationMethods,iterationAdvice,initialToolGuide} from '../compute-server/harness/context.mjs';
import {loadCreationSkills} from '../compute-server/harness/skills.mjs';

test('initial tape guidance uses frozen source type rather than appearance or title',()=>{
 const source={textMode:'none',materials:[{alias:'long-paper',assetID:'a'},{alias:'real-tape',assetID:'b'}],sourceSnapshots:[{assetID:'a',kind:'paper',title:'胶带图案长条纸'},{assetID:'b',kind:'tape',title:'花纹'}]};
 assert.deepEqual(initialToolGuide({source}).tapeAliases,['real-tape']);
 source.materials.pop();
 const guide=initialToolGuide({source});assert.deepEqual(guide.tapeAliases,[]);assert.ok(guide.notes.some(n=>n.includes('本次没有胶带')));
});

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

test('model context keeps the global index and recent tool pair while dropping superseded previews',()=>{
  const system={role:'system',content:'system'};
  const source={role:'user',content:[{type:'image_url',image_url:{url:'source'}}]};
  const reasoning={role:'assistant',reasoning_content:'required provider reasoning',tool_calls:[{id:'call'}]};
  const receipt={role:'tool',tool_call_id:'call',content:'receipt'};
  const previews=Array.from({length:5},(_,i)=>({role:'user',content:[{type:'text',text:'当前真实画面：'+i+'\n最新 Scene：many coordinates'},{type:'image_url',image_url:{url:'preview'+i}}]}));
  const input=[system,source,reasoning,receipt,...previews],before=JSON.stringify(input),out=modelContext(input);
  assert.equal(out[0],system);assert.deepEqual(out[1],source);assert.equal(out[2],reasoning);assert.equal(out[3],receipt);assert.equal(out.at(-1),previews.at(-1));
  assert.equal(out.filter(m=>Array.isArray(m.content)).length,2);assert.equal(JSON.stringify(input),before);
});

test('model context stays bounded as checkpoint history grows',()=>{
 const system={role:'system',content:'instructions'},index={role:'user',content:[{type:'text',text:'素材索引'},{type:'image_url',image_url:{url:'index'}}]};
 const messages=[system,index];
 for(let i=0;i<80;i++)messages.push({role:'assistant',tool_calls:[{id:'call-'+i,function:{name:'creation_apply'}}]},{role:'tool',tool_call_id:'call-'+i,content:'{"ok":true}'},{role:'user',content:[{type:'text',text:'当前真实画面：'+i},{type:'image_url',image_url:{url:'preview-'+i}}]});
 const out=modelContext(messages);
 assert.equal(out[0],system);assert.deepEqual(out[1],index);
 assert.ok(out.length<=8);assert.equal(out.filter(m=>m.role==='assistant').length,2);
 assert.equal(out.filter(m=>m.role==='tool').length,2);assert.equal(out.filter(m=>m.role==='user'&&Array.isArray(m.content)&&m.content[0].text.startsWith('当前真实画面')).length,1);
 assert.equal(out.filter(m=>m.role==='user').flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url').length,2);
});

test('temporary material detail images leave the model context after they are used',()=>{
 const system={role:'system',content:'instructions'},index={role:'user',content:[{type:'image_url',image_url:{url:'index'}}]};
 const inspect={role:'assistant',tool_calls:[{id:'inspect',function:{name:'inspect_materials'}}]};
 const result={role:'tool',tool_call_id:'inspect',content:'{"ok":true}'};
 const details={role:'user',content:[{type:'text',text:'素材 A'},{type:'image_url',image_url:{url:'detailA'}},{type:'image_url',image_url:{url:'detailB'}}]};
 const before=modelContext([system,index,inspect,result,details]);
 assert.equal(before.filter(message=>message===details).length,1);
 const after=modelContext([system,index,inspect,result,details,{role:'assistant',content:'已看过局部细节'}, {role:'user',content:'下一步'}]);
 assert.equal(after.some(message=>message===details),false);
 assert.equal(after.filter(message=>message.role==='user').flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(part=>part.type==='image_url').length,1);
});

test('creative compaction carries design decisions and rejected attempts into later turns',async()=>{
 const messages=[{role:'system',content:'instructions'},{role:'user',content:[{type:'image_url',image_url:{url:'index'}}]}];
 for(let i=0;i<7;i++)messages.push(
   {role:'assistant',content:i===1?'试过居中排布，但主图太拥挤，改为左侧留白。':null,reasoning_content:'private reasoning',tool_calls:[{id:'c'+i,function:{name:'creation_apply',arguments:JSON.stringify({transactionId:'t'+i,operations:[{op:'layer.update',target:'photo',place:{surface:'page',at:[i,40]}}]})}}]},
   {role:'tool',tool_call_id:'c'+i,content:'{"ok":true}'},
   {role:'user',content:[{type:'text',text:'当前真实画面：'+i},{type:'image_url',image_url:{url:'preview'+i}}]}
 );
 const candidate=creativeCompactionCandidate(messages,{compactedUntil:2});
 assert.ok(candidate);assert.equal(candidate.history.filter(m=>m.role==='assistant').length,5);
 assert.match(JSON.stringify(candidate.history),/主图太拥挤/);
 assert.doesNotMatch(JSON.stringify(candidate.history),/private reasoning|preview0/);
 const {createCreationDocument}=await import('../src/creation-document.js');
 const {draft}=await import('../src/domain.js');
 const state={compactedUntil:candidate.cutoff,creativeMemory:'居中排布拥挤，改为左侧留白。',document:await createCreationDocument({draft:draft(),assets:[]})};
 const out=modelContext(messages,state);
 assert.match(out[2].content,/居中排布拥挤，改为左侧留白/);
 assert.equal(out.filter(m=>m.role==='assistant').length,2);
 assert.equal(out.filter(m=>m.role==='user'&&Array.isArray(m.content)).length,2);
});

test('malformed historical tool arguments cannot break compaction',()=>{
 const history=creativeCompactionTranscript([{role:'assistant',tool_calls:[
   {function:{name:'creation_apply',arguments:'null'}},
   {function:{name:'creation_apply',arguments:'{"operations":{}}'}},
   {function:{name:'creation_apply',arguments:'not json'}}
 ]}]);
 assert.equal(history[0].calls.length,3);
 assert.deepEqual(history[0].calls[0].operations,[]);
 assert.deepEqual(history[0].calls[1].operations,[]);
 assert.equal(history[0].calls[2].invalidArguments,true);
});

test('skill routing uses explicit direction and respects no-text tasks',async()=>{
  const skills=await loadCreationSkills();
  const selected=recommendCreationSkills(skills,{source:{textMode:'none',styles:[]}},{styles:['童趣可爱'],intent:'复古旧物'}).map(s=>s.name);
  assert.deepEqual(selected,['journal-composition','journal-color','paper-layering','journal-accents','playful-journal']);
  assert.ok(!selected.includes('vintage-journal'));
  assert.ok(recommendCreationSkills(skills,{source:{styles:['复古旧物']}}).some(s=>s.name==='vintage-journal'));
});

test('zero-material skill routing offers lettering and drawn graphics without source techniques',async()=>{
  const skills=await loadCreationSkills();
  const {createCreationDocument}=await import('../src/creation-document.js');
  const {draft}=await import('../src/domain.js');
  const {initialHarnessState}=await import('../compute-server/harness/agent.mjs');
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const state=initialHarnessState({document,skills,brief:{styles:['丰富层叠']}});
  assert.deepEqual(state.loadedSkills,[]);
  assert.ok(state.recommendedMethods.some(method=>method.id==='title-phrases'));
  assert.ok(state.recommendedMethods.some(method=>method.id==='graphic-wave'));
  assert.ok(!state.recommendedMethods.some(method=>method.id==='paper-peek'));
  assert.ok(!initialToolGuide(document).common.descriptions.some(item=>item.name==='material.add'));
  assert.match(state.messages[0].content,/零素材创作/);
  assert.ok(!state.messages[0].content.includes('基础 Skill、匹配风格和常用参数已自动提供'));
  assert.ok(state.messages[0].content.length<30000);
  const visual=await createCreationDocument({draft:draft(),assets:[],contentPolicy:'visual'});
  const visualState=initialHarnessState({document:visual,skills,brief:{styles:['丰富层叠']}});
  assert.ok(!visualState.recommendedMethods.some(method=>method.skill==='journal-lettering'));
  assert.ok(!recommendCreationSkills(skills,visual).some(skill=>skill.name==='journal-lettering'));
  assert.deepEqual(shortlistCreationMethods({...document,source:{...document.source,materials:Array(5).fill({})}},{styles:['丰富层叠']}).slice(0,2).map(m=>m.id),['layered-center','layered-diagonal']);
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
