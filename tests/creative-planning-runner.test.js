import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {runCreativeAgent} from '../src/creative-runner.js';

const material={id:'asset-1',title:'猫咪饼干',kind:'sticker',role:'focal',tags:['猫咪'],physicalWidthMM:30,physicalHeightMM:35,supply:{quantity:1}};
const plan={concepts:[
 {title:'手工错层',concept:'猫咪与记录',composition:'斜向剪贴，文字贴近图案',consideredAssets:['m1']},
 {title:'安静留白',concept:'小图与大留白',composition:'错位但主体清楚',consideredAssets:['m1']},
 {title:'杂志记录',concept:'图文对比',composition:'不等大的标题和图像',consideredAssets:['m1']}
],winner:0};
const finish={choices:[{message:{role:'assistant',content:'',tool_calls:[
 {id:'place',function:{name:'place_materials',arguments:JSON.stringify({items:[{asset:'m1',piece:'cat',x:.45,y:.42}]})}},
 {id:'title',function:{name:'upsert_text',arguments:JSON.stringify({items:[{key:'title',content:'一份温柔的小日常',x:.5,y:.15,width:.7,font_size:32}]})}},
 {id:'finish',function:{name:'finish_design',arguments:'{}'}}
]}}]};

test('balanced quality uses one internal planning request then a regular editable tool run',async()=>{
 const payloads=[],progress=[];
 const response=index=>index===1?{choices:[{message:{content:JSON.stringify(plan)},finish_reason:'stop'}]}:finish;
 const out=await runCreativeAgent({
   draft:draft(),assets:[material],aliases:{m1:material.id},images:[],
   key:'test-key',endpoint:'https://api.openai.com/v1/chat/completions',model:'gpt-4.1',
   qualityMode:'balanced',generationMode:'agent',maxTurns:8,finalVisualReview:false,
   onPlanning:p=>progress.push(p?.selected.title),
   request:async(_url,req)=>{payloads.push(JSON.parse(req.body));return {ok:true,json:async()=>response(payloads.length)};}
 });
 assert.equal(payloads.length,2);
 assert.equal(payloads[0].response_format.type,'json_object');
 assert.equal(payloads[1].tool_choice,'required');
 assert.ok(JSON.stringify(payloads[1].messages).includes('已选定的艺术构思'));
 assert.deepEqual(progress,['手工错层']);
 assert.equal(out.budget.planningRequests,1);
 assert.equal(out.budget.creationRequests,1);
 assert.equal(out.draft.items.length,1);
 assert.equal(out.draft.textBlocks[0].content,'一份温柔的小日常');
 assert.equal(out.draft.agentRun.designConcept.title,'手工错层');
});

test('planner JSON failure continues with a valid editable scene, no accidental double spending',async()=>{
 let count=0;
 const out=await runCreativeAgent({
  draft:draft(),assets:[material],aliases:{m1:material.id},
  key:'test-key',endpoint:'https://api.openai.com/v1/chat/completions',model:'gpt-4.1',
  qualityMode:'balanced',generationMode:'agent',maxTurns:8,finalVisualReview:false,
  request:async()=>({ok:true,json:async()=>++count===1?
    {choices:[{message:{content:'invalid'}}]}:finish})
 });
 assert.equal(count,2);
 assert.equal(out.budget.planningRequests,1);
 assert.equal(out.draft.items.length,1);
});

test('quick quality does not incur a hidden AI planning request',async()=>{
 let count=0;
 const out=await runCreativeAgent({
  draft:draft(),assets:[material],aliases:{m1:material.id},
  key:'test-key',qualityMode:'quick',generationMode:'agent',
  request:async()=>({ok:true,json:async()=>{count++;return finish;}})
 });
 assert.equal(count,1);
 assert.equal(out.budget.planningRequests,0);
});
