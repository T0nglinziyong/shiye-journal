import test from 'node:test';
import assert from 'node:assert/strict';
import {compilePhysicalCase,placeVisibleCenter} from '../creative-agent/library/physical-case-templates.js';
const a=(alias,title,kind,w,h,numberValue)=>({alias,title,kind,physicalWidthMM:w,physicalHeightMM:h,numberValue});
const basket=[a('m3','small Chinese typographic card','sticker',24.1,26.7),a('m6','gray star-pattern paper','paper',70.3,108.3),a('m8','pale blue strip','paper',41.9,14.9)];
test('case function produces editable canvas operations without AI or reference image',()=>{
 const result=compilePhysicalCase({assets:basket,texts:{title:'新标题',body:'今天的记录'}});
 assert.equal(result.report.modelCalls,0);
 assert.equal(result.report.referenceImagesUsed,0);
 assert.ok(result.operations.some(o=>o.op==='material.add'&&o.asset==='m6'));
 assert.ok(result.operations.some(o=>o.op==='text.add'&&o.content==='新标题'));
 assert.ok(result.operations.some(o=>o.op==='text.add'&&o.content==='1'));
 assert.ok(result.operations.some(o=>o.op==='text.add'&&o.content==='4'));
});
test('provided numeral asset replaces only its matching digit',()=>{
 const result=compilePhysicalCase({assets:[...basket,a('digit-1','blue number 1','sticker',13,21,'1')]});
 assert.ok(result.operations.some(o=>o.op==='material.add'&&o.asset==='digit-1'&&o.id==='case-number-1'));
 assert.ok(!result.operations.some(o=>o.op==='text.add'&&o.id==='case-number-1'));
 assert.ok(result.operations.some(o=>o.op==='text.add'&&o.id==='case-number-4'));
});
test('oversized generic backing is physically cropped while a printed label is preserved or omitted',()=>{
 const result=compilePhysicalCase({assets:[a('b','plain pattern paper','paper',95,140),a('l','text label','sticker',60,40)],bindings:{backing:'b',label:'l'}});
 assert.ok(result.operations.some(o=>o.op==='material.split'&&o.asset==='b'));
 assert.ok(result.report.warnings.some(w=>w.includes('标签')));
});
test('transparent source padding does not shift the visible object away from its slot center',()=>{
 const centered=placeVisibleCenter({physicalWidthMM:40,physicalHeightMM:20,opaqueBoundsRatio:[.25,0,1,1]},[100,100,200,200]);
 const ordinary=placeVisibleCenter({physicalWidthMM:40,physicalHeightMM:20},[100,100,200,200]);
 assert.equal(centered.at[0],ordinary.at[0]-5);
 assert.equal(centered.at[1],ordinary.at[1]);
});
