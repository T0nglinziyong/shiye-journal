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
  assert.match(empty,/真实记录/);assert.match(empty,/用户未提供可核实的个人事实/);
  assert.match(empty,/绝不编造日期、地点、人物和事件/);
  assert.match(empty,/不把“这一页用了什么颜色、纸张、素材、留白、排版”写成正文/);
  const original=creativeContentBrief({policy:'original',topic:'春天',userText:'小白去了苏州',providedFacts:'2026 年 4 月拍摄'});
  assert.match(original,/原创主题短文/);assert.match(original,/小白去了苏州/);
  assert.match(original,/不把虚构经历写成用户真实日记/);
  assert.match(creativeContentBrief({policy:'visual'}),/不生成正文、标题或图注/);
  const list=creativeContentBrief({purposes:['清单计划']});
  assert.match(list,/可以执行或核对的条目/);
  assert.match(list,/不写成已经完成的记录/);
  const travel=creativeContentBrief({purposes:['旅途记录']});
  assert.match(travel,/有用户提供的地点、时间、路线才写行程/);
  assert.doesNotMatch(creativeContentBrief({purposes:['日常记录']}),/主要用途「清单计划」/);
});

test('online and offline tasks carry the same chosen content boundary',async()=>{
  const p=project('主题页');p.contentPolicy='original';p.userText='保留专名：小白';p.providedFacts='没有真实旅程';p.intent='想象中的旅行';
  const online=buildCreativeMessages({draft:p.drafts[0],assets:[],aliases:{},contentPolicy:p.contentPolicy,userText:p.userText,providedFacts:p.providedFacts,prompt:p.intent});
  assert.match(online[1].content[0].text,/原创主题短文/);
  assert.match(online[1].content[0].text,/保留专名：小白/);
  const asset={id:'a1',title:'纸片',kind:'sticker',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
  const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
  const context=JSON.parse(strFromU8(files['task/context.json']));
  assert.equal(context.source.contentPolicy,'original');
  assert.equal(context.source.userText,'保留专名：小白');
  assert.match(strFromU8(files['START_HERE.txt']),/task\/GUIDE\.txt/);
  assert.match(strFromU8(files['task/GUIDE.txt']),/不把虚构经历写成用户真实日记/);
  p.contentPolicy='visual';
  const visual=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  assert.equal(visual.source.textMode,'none');
  const onlineVisual=buildCreativeMessages({draft:p.drafts[0],assets:[],aliases:{},contentPolicy:'visual'});
  assert.match(onlineVisual[0].content,/不生成文字/);
  const imageVisual=imagePrompt({project:p,draft:p.drafts[0],assets:[],ids:[],includeImages:false});
  assert.match(imageVisual,/不生成正文、标题或图注/);
});
