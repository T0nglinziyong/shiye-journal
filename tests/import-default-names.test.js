import test from 'node:test';
import assert from 'node:assert/strict';
import {importDefaultTitle,importFileStem,isGeneratedImportAssetTitle} from '../src/import-default-names.js';

const date=new Date('2026-10-20T08:00:00Z');

test('meaningful file names become editable work and material suggestions',()=>{
  assert.equal(importFileStem('浅蓝波浪边便签纸.png'),'浅蓝波浪边便签纸');
  assert.equal(importDefaultTitle('浅蓝波浪边便签纸.png','material',{candidateIndex:1,date}),'浅蓝波浪边便签纸 · 2');
  assert.equal(importDefaultTitle('十月手帐.jpg','work',{date}),'十月手帐');
});

test('camera and numeric names get readable defaults that AI may replace',()=>{
  const title=importDefaultTitle('IMG_270607.JPG','material',{sourceIndex:1,candidateIndex:2,date});
  assert.equal(title,'素材 · 2026-10-20 · 2-3');
  assert.equal(isGeneratedImportAssetTitle(title),true);
  assert.equal(importDefaultTitle('270607.jpg','work',{sourceIndex:1,date}),'导入作品 · 2026-10-20 · 2');
  assert.equal(isGeneratedImportAssetTitle('用户起的名字'),false);
});
