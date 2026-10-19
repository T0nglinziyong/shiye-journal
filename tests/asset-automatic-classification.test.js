import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticAssetClassification} from '../src/asset-automatic-classification.js';
test('AI organized material becomes ready for matching and updates default attributes',()=>{
 const initial={id:'a',title:'素材 1',kind:'sticker',role:'focal',texture:'待记录',reviewStatus:'pendingReview',tags:[]};
 const result=automaticAssetClassification(initial,initial,{title:'车票',kind:'paper',role:'background',texture:'纸张',reviewStatus:'ready',tags:['旅行']});
 assert.equal(result.reviewStatus,'ready');assert.equal(result.kind,'paper');
 assert.equal(result.role,'background');assert.equal(result.texture,'纸张');
 assert.equal(result.title,'车票');assert.deepEqual(result.tags,['旅行']);
});
test('automatic inference does not overwrite intervening manual edits',()=>{
 const initial={id:'a',title:'素材 1',kind:'sticker',role:'focal',texture:'待记录',reviewStatus:'pendingReview',tags:[]};
 const modified={...initial,reviewStatus:'rejected',kind:'photo',texture:'手写备注',tags:['手动标签']};
 const result=automaticAssetClassification(modified,initial,{reviewStatus:'ready',kind:'tape',texture:'纸',tags:['AI']});
 assert.equal(result.reviewStatus,'rejected');assert.equal(result.kind,'photo');
 assert.equal(result.texture,'手写备注');assert.deepEqual(result.tags,['手动标签']);
});
