import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyJournalMaterial,journalCaseStudyGuide,journalCompositionFamilies,relevantJournalFamilies} from '../src/journal-case-study.js';

test('journal reference vocabulary separates visual role from the stored material kind',()=>{
  assert.deepEqual(classifyJournalMaterial({kind:'paper',title:'旅行票根'}),['ephemera']);
  assert.deepEqual(classifyJournalMaterial({kind:'paper',title:'横线书写底纸'}),['base']);
  assert.deepEqual(classifyJournalMaterial({kind:'tape',title:'点纹纸胶带'}),['connector']);
  assert.deepEqual(classifyJournalMaterial({kind:'sticker',title:'樱花贴纸'}),['accent']);
  assert.equal(new Set(journalCompositionFamilies.map(family=>family.id)).size,journalCompositionFamilies.length);
});

test('selected page purpose changes composition studies without hard quotas',()=>{
  const travel=relevantJournalFamilies({styles:['旅行票据'],purposes:['旅途记录']});
  const list=relevantJournalFamilies({styles:['清单手帐'],purposes:['清单计划']});
  assert.equal(travel[0].id,'route');
  assert.equal(list[0].id,'list');
  const guide=journalCaseStudyGuide({styles:['旅行票据'],purposes:['旅途记录']});
  assert.match(guide,/路线与时间轴/);
  assert.match(guide,/没有真实凭证就不伪造|不生成不存在的票据/);
  assert.match(guide,/故意留白、局部叠压、半藏和出血/);
  assert.doesNotMatch(guide,/至少\d|覆盖率\s*\d|最低图层数\s*\d/);
});

test('the same free direction produces different studies from actual material roles and proportions',()=>{
  const direction={styles:['随材而定','自动安排'],purposes:['自由创作']};
  const top=materials=>relevantJournalFamilies({...direction,materials})[0].id;
  assert.equal(top([{title:'JOURNEY 印刷标题',kind:'text'}]),'dialogue');
  assert.equal(top([{title:'横线便签',kind:'paper'},{title:'方格底纸',kind:'paper'}]),'paper-collage');
  assert.equal(top([{title:'意面餐盘',kind:'photo'}]),'food');
  assert.equal(top([{title:'人物剪影贴纸',kind:'sticker',physicalWidthMM:25,physicalHeightMM:90}]),'silhouette');
  const input={...direction,materials:[{title:'地图票根',kind:'paper'}]};
  assert.deepEqual(relevantJournalFamilies(input),relevantJournalFamilies(input));
  assert.equal(relevantJournalFamilies(input)[0].id,'route');
});
