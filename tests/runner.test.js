import test from 'node:test';
import assert from 'node:assert/strict';
import {runCreativeAgent} from '../src/creative-runner.js';
import {draft} from '../src/domain.js';

test('multi-turn tool feedback preserves valid prefix after malformed call',async()=>{
  const replies=[
    {choices:[{message:{role:'assistant',content:'',tool_calls:[
      {id:'one',function:{name:'upsert_text',arguments:JSON.stringify({items:[{key:'t1',content:'今天的春风落在纸上',width:.5}]})}},
      {id:'two',function:{name:'upsert_primitives',arguments:'{broken'}}]}}]},
    {choices:[{message:{role:'assistant',content:'',tool_calls:[
      {id:'three',function:{name:'finish_design',arguments:'{}'}}]}}]}
  ];
  const calls=[];const request=async(_url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>replies.shift()};};
  const output=await runCreativeAgent({draft:draft(),assets:[],aliases:{},key:'test-key',request});
  assert.equal(output.turns,2);
  assert.equal(output.draft.textBlocks.length,1);
  assert.equal(output.finished,true);
  assert.equal(calls[0].thinking.type,'disabled');
  assert.equal(calls[0].tool_choice,'required');
  assert.equal(calls[1].messages.filter(x=>x.role==='tool').length,2);
  assert.match(calls[1].messages.at(-1).content,/false/);
});

test('empty model response cannot mark a blank page complete',async()=>{
  const request=async()=>({ok:true,json:async()=>({choices:[{message:{role:'assistant',content:null,tool_calls:[]}}]})});
  await assert.rejects(runCreativeAgent({draft:draft(),assets:[],aliases:{},key:'test-key',request}),/没有返回创作操作/);
});
