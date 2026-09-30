import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewCreativeDraft} from '../src/creative-quality.js';
import {creativeTypographyGuide} from '../src/creative-typography.js';
import {buildCreativeMessages} from '../src/creative-runner.js';
const draft=size=>({canvas:{width:700,height:1000},physicalPageHeightMM:210,paperColor:'#ffffff',items:[],primitives:[],textBlocks:[{id:'body',content:'真实毫米尺寸对应的正文',x:350,y:200,width:600,height:200,fontSize:size,color:'#000000'}]});
test('AI review offers print-size advice without making it a completion threshold',()=>{
 assert.ok(reviewCreativeDraft(draft(9)).warnings.some(w=>w.includes('文字可能偏小')));
 assert.ok(!reviewCreativeDraft(draft(14)).warnings.some(w=>w.includes('文字可能偏小')));
});
test('AI review reports overlapping full text boxes rather than declaring finish',()=>{
 const d=draft(14);d.textBlocks.push({...d.textBlocks[0],id:'second',y:210});
 assert.ok(reviewCreativeDraft(d).warnings.some(w=>w.includes('文字框相互遮挡')));
});
test('creative review does not impose density, word-count or material-count quotas',()=>{
 const sparse=draft(14);
 for(const purpose of ['旅途记录','主题封面'])assert.ok(!reviewCreativeDraft(sparse,{purposes:[purpose],materialPriority:{preferred:['a','b','c']}}).warnings.some(w=>/稀疏|正文内容不足|素材使用不足|实际占页/.test(w)));
 const graphics={...sparse,textBlocks:[],primitives:[{x:350,y:500,width:120,height:80,fill:'#98b0a2'}]};
 assert.deepEqual(reviewCreativeDraft(graphics).warnings,[]);
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
test('API receives four anonymous style-and-purpose studies without referencing saved private works',()=>{
 const messages=buildCreativeMessages({draft:{...draft(14),style:'复古旧物',pageMode:'single'},assets:[],aliases:{},styles:['复古旧物'],pagePurposes:['旅途记录'],referenceImages:['data:image/png;base64,one','data:image/png;base64,two','data:image/png;base64,three','data:image/png;base64,four']});
 assert.match(messages[0].content,/简洁方案/);
 assert.match(messages[0].content,/复古旧物 × 旅途记录/);
 assert.equal(messages[1].content.filter(part=>part.type==='image_url').length,4);
 assert.doesNotMatch(messages[0].content,/私人日记原图|已保存作品/);
});
test('text-only API receives the matching preset descriptions without image payloads',()=>{
 const messages=buildCreativeMessages({draft:{...draft(14),style:'韩系清新',pageMode:'single'},assets:[],aliases:{},styles:['韩系清新'],pagePurposes:['清单计划'],sendPresetReferences:true});
 assert.match(messages[0].content,/韩系清新 × 清单计划/);
 assert.match(messages[0].content,/实验方案/);
 assert.equal(messages[1].content.filter(part=>part.type==='image_url').length,0);
});
test('API labels material priorities and has a meaningful-content rule for sparse non-cover pages',()=>{
 const assets=['required','preferred','available','excluded'].map((id,i)=>({id,title:id,kind:'sticker',role:'focal',physicalWidthMM:20,physicalHeightMM:20,supply:{quantity:1},tags:[]}));
 const aliases={m1:'required',m2:'preferred',m3:'available'};
 const messages=buildCreativeMessages({draft:{...draft(14),pageRatio:'a5',pageMode:'single'},assets,aliases,requiredAssetIDs:['required'],materialPriority:{required:['required'],preferred:['preferred'],available:['available'],excluded:['excluded']}});
 const text=messages[1].content[0].text;
 assert.match(text,/优先级 必须使用/);assert.match(text,/优先级 优先使用/);assert.match(text,/优先级 可以使用（仅备选）/);
 assert.doesNotMatch(text,/excluded/);
 assert.match(messages[0].content,/留白是否服务于主题/);
 assert.match(messages[1].content[0].text,/不按数量或覆盖率评分/);
 assert.doesNotMatch(messages[1].content[0].text,/至少\d+字|覆盖约 \d+%/);
});
