import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {normalizeMatchingDirection,styleGroups,purposeGroups,matchingContentOptions} from '../src/matching-directions.js';
import {creativeRunParameters} from '../src/ai-creation-session.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {buildCreativeMessages} from '../src/creative-runner.js';
import {imagePrompt} from '../src/ai-image-generation.js';

test('four current directions replace obsolete choices without reviving processing or lettering pickers',()=>{
  const state={matchStyles:['不存在'],matchPurposes:['旅途记录'],matchContentPolicy:'collection'};
  normalizeMatchingDirection(state);
  assert.deepEqual(state,{matchRatio:'a4',matchStyles:['随材而定','自动安排'],matchStyle:'随材而定',matchPurposes:['自由创作'],matchPurpose:'自由创作',matchContentPolicy:'original'});
  assert.equal(styleGroups.length+purposeGroups.length+1,4);
  for(const label of [...styleGroups,...purposeGroups].flatMap(g=>[g.label,...g.options]).concat(Object.values(matchingContentOptions)))assert.equal(label.length,4);
});

test('API, editable ZIP and image routes use the same material-dependent and expressive contract',async()=>{
  const p=project('测试');p.styles=['随材而定','自动安排'];p.purposes=['自由创作'];
  const assets=[{id:'letter',title:'印刷标题 JOURNEY',kind:'text',physicalWidthMM:60,physicalHeightMM:25,tags:['字母']}];
  const params=creativeRunParameters({project:p,draft:p.drafts[0],assets,ids:['letter'],settings:{}});
  assert.equal(params.contentPolicy,'original');assert.equal(params.textPresentation,'mixed');assert.equal(params.processing,'自由拆解');
  const api=buildCreativeMessages(params)[1].content[0].text;
  const bundle=await createOfflineHandoff({project:p,assets,aliases:params.aliases,settings:{includeThumbnails:false}});
  const files=unzipSync(new Uint8Array(await bundle.blob.arrayBuffer()));
  const guide=strFromU8(files['task/GUIDE.txt']);
  const image=imagePrompt({project:p,draft:p.drafts[0],assets,ids:['letter'],includeImages:false});
  for(const text of [api,guide,image]){
    assert.match(text,/灵感随写/);assert.match(text,/俏皮态度/);assert.match(text,/长、中、短版本/);
    assert.match(text,/图文对话/);assert.match(text,/window 开窗/);assert.match(text,/不无限缩小字号/);
    assert.doesNotMatch(text,/只能写客观观察/);
  }
  const knowledge=JSON.parse(strFromU8(files['task/knowledge.json']));
  assert.equal(knowledge.caseStudies.families[0].id,'dialogue');
  assert.equal(bundle.source.processing,'自由拆解');
  assert.equal(bundle.source.contentPolicy,'original');
  assert.equal(bundle.source.capabilities.previewOffline,'node-canvas');
  assert.match(strFromU8(files['START_HERE.txt']),/PNG|preview.png/);
});
