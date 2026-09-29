import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewCreativeDraft} from '../src/creative-quality.js';
import {creativeTypographyGuide} from '../src/creative-typography.js';
import {buildCreativeMessages} from '../src/creative-runner.js';
const draft=size=>({canvas:{width:700,height:1000},physicalPageHeightMM:210,paperColor:'#ffffff',items:[],primitives:[],textBlocks:[{id:'body',content:'真实毫米尺寸对应的正文',x:350,y:200,width:600,height:200,fontSize:size,color:'#000000'}]});
test('AI review rejects illegibly small print text even when every box fits',()=>{
 assert.ok(reviewCreativeDraft(draft(9)).warnings.some(w=>w.includes('印刷字号过小')));
 assert.ok(!reviewCreativeDraft(draft(14)).warnings.some(w=>w.includes('印刷字号过小')));
});
test('AI review reports overlapping full text boxes rather than declaring finish',()=>{
 const d=draft(14);d.textBlocks.push({...d.textBlocks[0],id:'second',y:210});
 assert.ok(reviewCreativeDraft(d).warnings.some(w=>w.includes('文字框相互遮挡')));
});
test('both creation modes receive role sizes converted to the actual paper, not screen pixels',()=>{
 const a5=draft(14),a4={...a5,physicalPageHeightMM:297},small=creativeTypographyGuide(a5),large=creativeTypographyGuide(a4);
 assert.match(small,/主标题建议18–26pt（本页font_size约31–43/);
 assert.match(large,/主标题建议18–26pt（本页font_size约22–30/);
 for(const mode of ['agent','direct']){
   const text=buildCreativeMessages({draft:a5,assets:[],aliases:{},generationMode:mode})[0].content;
   assert.match(text,/次标题／小节标题/);assert.match(text,/正文建议9–12pt/);assert.match(text,/图片说明／日期／注释建议7–9pt/);
   assert.match(text,/同一作品不因换设备改写字号/);assert.doesNotMatch(text,/文字标题46–90/);
 }
});
