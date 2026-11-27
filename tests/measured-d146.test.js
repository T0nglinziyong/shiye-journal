import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMeasuredD146} from '../creative-agent/library/measured-d146.js';
import {resolveD146Graph} from '../creative-agent/library/d146-template-graph.js';

const a=(alias,title,kind,w,h,numberValue)=>({alias,title,kind,physicalWidthMM:w,physicalHeightMM:h,numberValue});
const basket=[
 a('m2','LifeWear printed text card','paper',84.5,65.7),
 a('m3','small Chinese typographic card','sticker',24.1,26.7),
 a('m6','gray star-pattern paper','paper',70.3,108.3)
];

test('D146 keeps measured composition while cropping unprinted source backing',()=>{
 const result=compileMeasuredD146({assets:basket});
 assert.equal(result.report.modelCalls,0);
 assert.deepEqual(result.report.used,['m6','m3']);
 assert.ok(result.operations.some(o=>o.op==='material.split'&&o.asset==='m6'&&o.pieces[0].id==='gray-dot-paper'));
 assert.ok(result.operations.some(o=>o.op==='paper.add'&&o.id==='main-paper'));
 assert.ok(result.operations.some(o=>o.op==='material.add'&&o.asset==='m3'&&o.id==='stamp-material'));
 assert.ok(!result.operations.some(o=>o.op==='material.add'&&o.asset==='m2'));
 assert.ok(result.operations.some(o=>o.op==='text.add'&&o.id==='q3'));
});

test('explicit matching digit asset replaces editable fallback without changing its slot',()=>{
 const result=compileMeasuredD146({assets:[...basket,a('digit-4','blue number 4','sticker',14,26,'4')],bindings:{topFour:'digit-4'}});
 assert.ok(result.operations.some(o=>o.op==='material.add'&&o.asset==='digit-4'&&o.id==='top-four'));
 assert.ok(!result.operations.some(o=>o.op==='text.add'&&o.id==='top-four'));
});

test('the same inputs yield identical editable operations',()=>{
 const x=compileMeasuredD146({assets:basket,texts:{q1:'一件小事'}});
 const y=compileMeasuredD146({assets:basket,texts:{q1:'一件小事'}});
 assert.deepEqual(x,y);
});

test('children follow their paper reference while unrelated paper stays in place',()=>{
 const base=resolveD146Graph(),moved=resolveD146Graph({overrides:{'main-paper':{shiftMm:[5,0]}}});
 for(const id of ['bottom-writing','q3','gray-dot-paper','star-bottom'])assert.ok(Math.abs(moved.boxes[id][0]-base.boxes[id][0]-5*630/110)<1e-8,id);
 assert.deepEqual(moved.boxes['yellow-top'],base.boxes['yellow-top']);
 assert.ok(moved.boxes['bottom-writing'][0]>moved.boxes['main-paper'][0]);
});

test('slot values replace digit, paper color and accent; oversized paper offers mask or reusable crop',()=>{
 const big=a('big','plain white paper','paper',95,140);
 const custom=compileMeasuredD146({assets:[big],slotValues:{'top-one':{value:'7'},'bottom-writing':{color:'#D8C8B5'},'star-left':{kind:'ellipse'},'main-paper':{asset:'big',fit:'mask'}}});
 assert.ok(custom.operations.some(o=>o.id==='top-one'&&o.content==='7'));
 assert.ok(custom.operations.some(o=>o.id==='bottom-writing'&&o.style.fill==='#D8C8B5'));
 assert.ok(custom.operations.some(o=>o.id==='star-left'&&o.geometry.kind==='ellipse'));
 assert.ok(custom.operations.some(o=>o.op==='layer.mask'&&o.target==='main-paper'));
 const cropped=compileMeasuredD146({assets:[big],slotValues:{'main-paper':{asset:'big',fit:'crop'}}});
 assert.ok(cropped.operations.some(o=>o.op==='material.split'&&o.asset==='big'&&o.keepRemainder===true));
});

test('explicit generated paper color and card text take priority over automatic material matching',()=>{
 const result=compileMeasuredD146({assets:basket,slotValues:{'gray-dot-paper':{color:'#AACCEE'},'stamp-material':{text:'今天'}}});
 assert.ok(result.operations.some(o=>o.op==='paper.add'&&o.id==='gray-dot-paper'&&o.style.fill==='#AACCEE'));
 assert.ok(!result.operations.some(o=>o.asset==='m6'));
 assert.ok(result.operations.some(o=>o.op==='text.add'&&o.id==='stamp-word'&&o.content==='今天'));
 assert.ok(!result.operations.some(o=>o.asset==='m3'));
});
