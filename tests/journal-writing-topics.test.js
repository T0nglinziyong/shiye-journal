import test from 'node:test';
import assert from 'node:assert/strict';
import {journalWritingTopics,searchWritingTopics,writingLengthPlan,writingTopicBrief} from '../compute-server/harness/writing-topics.mjs';
import {initialHarnessState,harnessTools} from '../compute-server/harness/agent.mjs';
import {creativePageBrief} from '../src/creative-page-brief.js';
import {loadCreationSkills} from '../compute-server/harness/skills.mjs';
import {createCreationDocument} from '../src/creation-document.js';
import {draft} from '../src/domain.js';

test('PDF topic catalog has exactly 365 ordered, distinct prompts',()=>{
  assert.deepEqual(journalWritingTopics.map(topic=>topic.id),Array.from({length:365},(_,i)=>i+1));
  assert.equal(new Set(journalWritingTopics.map(topic=>topic.prompt)).size,365);
});

test('topic lookup follows material meaning, supports variation and exclusions',()=>{
  const material=[{title:'樱花与绿叶贴纸',tags:['植物','春天']}];
  const first=searchWritingTopics({materials:material,seed:123,limit:4});
  assert.equal(first.length,4);
  assert.ok(first.some(topic=>/花|自然|春天|生长/.test(topic.prompt)));
  assert.ok(new Set(first.map(topic=>topic.form)).size>=2);
  assert.deepEqual(first,searchWritingTopics({materials:material,seed:123,limit:4}));
  assert.ok(searchWritingTopics({materials:material,seed:123,limit:4,exclude:first.map(topic=>topic.id)}).every(topic=>!first.some(old=>old.id===topic.id)));
  assert.notEqual(searchWritingTopics({seed:123,limit:1})[0].id,searchWritingTopics({seed:456,limit:1})[0].id);
});

test('body length responds to available area and policy',()=>{
  const page={canvas:{width:700,height:1000},physicalPageHeightMM:210};
  assert.equal(writingLengthPlan({page}).level,'展开');
  assert.equal(writingLengthPlan({page,materials:[{widthMM:150,heightMM:200}]}).level,'精简');
  assert.equal(writingLengthPlan({page,materials:[{widthMM:150,heightMM:200,title:'浅色留白便签'}]}).level,'展开');
  assert.equal(writingLengthPlan({page,materials:[{widthMM:150,heightMM:200,title:'blue writing card'}]}).level,'展开');
  assert.equal(writingLengthPlan({page,textMode:'minimal'}).level,'简短');
  assert.equal(writingLengthPlan({page,purposes:['主题封面']}).level,'标题为主');
  assert.equal(writingLengthPlan({page,textMode:'none'}).characters[1],40);
  const small={...page,pageMode:'single'};
  const large={...page,canvas:{width:700,height:1000},physicalPageHeightMM:297,pageMode:'single'};
  assert.ok(writingLengthPlan({page:small}).characters[1]<writingLengthPlan({page:large}).characters[1]);
  assert.ok(writingLengthPlan({page:small,textMode:'rich'}).characters[1]<writingLengthPlan({page:large,textMode:'rich'}).characters[1]);
  assert.ok(writingLengthPlan({page:small,materials:[{widthMM:150,heightMM:200}]}).characters[1]<writingLengthPlan({page:small}).characters[1]);
});

test('live harness receives a short topic shortlist and can fetch more on demand',async()=>{
  const skills=await loadCreationSkills();
  assert.ok(skills.catalog().some(item=>item.name==='journal-writing'));
  assert.ok(skills.catalog().some(item=>item.name==='journal-text-layout'));
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const state=initialHarnessState({document,skills,brief:{intent:'为春天写一页'},startedAt:1795266000000});
  assert.match(state.messages[1].content[0].text,/写作选题与篇幅建议/);
  assert.match(state.messages[1].content[0].text,/365 主题 PDF/);
  assert.match(state.messages[0].content,/journal-writing/);
  assert.match(state.messages[0].content,/正文空间须在布局时考虑/);
  const plan=harnessTools.find(tool=>tool.function.name==='creation_plan').function.parameters;
  assert.ok(plan.properties.writingZones.items.properties.flowGroup);
  assert.ok(plan.properties.writingZones.items.properties.sequence);
  assert.ok(plan.properties.composition.properties.layering);
  assert.match(creativePageBrief({}),/一段文字也可按意思分成连续数块/);
  const short=writingTopicBrief(document,{},1795266000000);
  assert.equal(short.alternatives.length,2);
  assert.equal(short.length.level,'展开');
  const visual=await createCreationDocument({draft:draft(),assets:[],contentPolicy:'visual'});
  assert.equal(writingTopicBrief(visual,{},1795266000000),null);
  const material={id:'large-photo',title:'海边日落照片',kind:'photo',tags:['海','晚霞'],physicalWidthMM:160,physicalHeightMM:190};
  const materialDocument=await createCreationDocument({draft:draft({ratio:'a5'}),assets:[material],aliases:{m1:material.id}});
  const suggested=writingTopicBrief(materialDocument,{},1795266000000);
  assert.match(suggested.selected.prompt,/海|天空|日落/);
  assert.ok(suggested.length.characters[1]>suggested.length.characters[0]);
  const documentary=await createCreationDocument({draft:draft(),assets:[],contentPolicy:'documentary'});
  assert.ok(!writingTopicBrief(documentary,{},1795266000000).styles.some(style=>style.startsWith('想象练习')));
});
