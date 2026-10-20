import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeContentBrief} from '../src/creative-content-brief.js';
import {buildCreativeMessages} from '../src/creative-runner.js';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {imagePrompt} from '../src/ai-image-generation.js';
import {unzipSync,strFromU8} from 'fflate';

test('Q-01/Q-02: content policies distinguish documentary facts, originals and no-text work',()=>{
  const empty=creativeContentBrief();
  assert.match(empty,/灵感随写/);assert.match(empty,/没有可核实的个人事实/);
  assert.match(empty,/不冒充用户曾发生的经历/);
  assert.match(empty,/设计说明写到纸上/);
  const original=creativeContentBrief({policy:'original',topic:'春天',userText:'小白去了苏州',providedFacts:'2026 年 4 月拍摄'});
  assert.match(original,/灵感随写/);assert.match(original,/小白去了苏州/);
  assert.match(original,/不冒充用户曾发生的经历/);
  assert.match(creativeContentBrief({policy:'visual'}),/不生成新增的正文、标题、图注/);
  const list=creativeContentBrief({purposes:['清单计划']});
  assert.match(list,/可执行的条目/);
  assert.match(list,/不标成已经完成/);
  const travel=creativeContentBrief({policy:'documentary'});
  assert.match(travel,/不补造日期、地点、人物关系和事件/);
  assert.doesNotMatch(creativeContentBrief({purposes:['日常记录']}),/主要用途「清单计划」/);
});

test('online and offline tasks carry the same chosen content boundary',async()=>{
  const p=project('主题页');p.contentPolicy='original';p.userText='保留专名：小白';p.providedFacts='没有真实旅程';p.intent='想象中的旅行';
  const online=buildCreativeMessages({draft:p.drafts[0],assets:[],aliases:{},contentPolicy:p.contentPolicy,userText:p.userText,providedFacts:p.providedFacts,prompt:p.intent});
  assert.match(online[1].content[0].text,/灵感随写/);
  assert.match(online[1].content[0].text,/保留专名：小白/);
  const asset={id:'a1',title:'纸片',kind:'sticker',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
  const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
  const context=JSON.parse(strFromU8(files['task/context.json']));
  assert.equal(context.source.contentPolicy,'original');
  assert.equal(context.source.userText,'保留专名：小白');
  assert.match(strFromU8(files['START_HERE.txt']),/task\/GUIDE\.txt/);
  assert.match(strFromU8(files['task/GUIDE.txt']),/不冒充用户曾发生的经历/);
  p.contentPolicy='visual';
  const visual=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  assert.equal(visual.source.textMode,'none');
  const onlineVisual=buildCreativeMessages({draft:p.drafts[0],assets:[],aliases:{},contentPolicy:'visual'});
  assert.match(onlineVisual[0].content,/不生成文字/);
  const imageVisual=imagePrompt({project:p,draft:p.drafts[0],assets:[],ids:[],includeImages:false});
  assert.match(imageVisual,/不生成新增的正文、标题、图注/);
});
