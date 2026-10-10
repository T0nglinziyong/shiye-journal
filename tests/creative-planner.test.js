import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeQualityProfile} from '../src/creative-quality-mode.js';
import {creativeRequestLimit,createCreativeBudget} from '../src/ai-budget.js';
import {normalizeDesignPlan,designPlanningMessages,planCreativeDirections,selectedDesignBrief} from '../src/creative-planner.js';

const asset={id:'asset-1',title:'猫咪造型饼干',kind:'sticker',role:'focal',tags:['猫咪','下午茶'],physicalWidthMM:40,physicalHeightMM:55,supply:{quantity:1}};
const options={qualityMode:'balanced',assets:[asset],aliases:{m1:asset.id},styles:['韩系清新'],
 pagePurposes:['日常记录'],prompt:'围绕小点心做温柔的手帐',
 contentPolicy:'original',requiredAssetIDs:[asset.id],
 images:[{asset:'m1',url:'data:image/png;base64,aGVsbG8='}],
 key:'test-key',endpoint:'https://example.invalid/chat',model:'test-model'};
const valid={
 concepts:[
  {title:'手工剪贴',concept:'有机叠层',visualHierarchy:'猫咪突出',composition:'斜向错层与短句相互连接',consideredAssets:['m1','forged']},
  {title:'文具笔记',concept:'留白的慢日记',composition:'不对称书写卡'},
  {title:'杂志排版',concept:'现代扉页',composition:'图文分栏'}
 ],winner:1
};

test('quality is independent of tools/JSON/PDF and quick costs no extra planning requests',()=>{
 assert.equal(creativeQualityProfile('quick').plan,false);
 assert.equal(creativeQualityProfile('balanced').conceptCount,3);
 assert.equal(creativeQualityProfile('studio').conceptCount,4);
 assert.equal(creativeRequestLimit(999),30);
});

test('chosen creative concept is sanitized and cannot add unknown real assets',()=>{
 const plan=normalizeDesignPlan(valid,{availableAliases:['m1'],requiredAliases:['m1'],conceptCount:3});
 assert.equal(plan.selected.title,'文具笔记');
 assert.deepEqual(plan.concepts[0].consideredAssets,['m1']);
 assert.deepEqual(plan.concepts[1].consideredAssets,['m1']);
 assert.match(selectedDesignBrief(plan),/只有用户明确必用/);
 assert.throws(()=>normalizeDesignPlan({concepts:[]}),/缺少/);
});

test('planning explicitly reasons about contrasting layouts before any tool coordinates',()=>{
 const messages=designPlanningMessages({...options,conceptCount:3});
 assert.match(messages[0].content,/不同的视觉表达/);
 assert.match(messages[0].content,/不生成 JSON 图层、工具或坐标/);
 assert.ok(messages[1].content.some(x=>x.type==='image_url'));
 assert.match(messages[1].content[0].text,/猫咪造型饼干/);
});

test('an internal concept call can return a winning design without user follow-up',async()=>{
 let requests=0;
 const request=async(url,req)=>{
  requests++;
  assert.equal(url,options.endpoint);
  assert.equal(JSON.parse(req.body).response_format.type,'json_object');
  return {ok:true,headers:{get:()=>null},json:async()=>({choices:[{message:{content:JSON.stringify(valid)},finish_reason:'stop'}]})};
 };
 const plan=await planCreativeDirections({...options,request,requestTimeout:20});
 assert.equal(requests,1);
 assert.equal(plan.concepts.length,3);
 assert.equal(plan.winner,1);
});

test('visual review reserve prevents format repairs consuming the final review budget',()=>{
 const b=createCreativeBudget(7,{reservedVisualRequests:2});
 b.begin('planning');
 for(let i=0;i<4;i++)b.begin('creation');
 assert.throws(()=>b.begin('format-repair'),error=>error.code==='request-limit');
 assert.equal(b.snapshot().totalRequests,5);
 assert.equal(b.begin('visual-review').visualReviewRequests,1);
 assert.equal(b.begin('visual-review').totalRequests,7);
 assert.throws(()=>b.begin('visual-review'),/上限|预算/);
});
