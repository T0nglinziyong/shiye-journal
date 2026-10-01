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
  assert.match(calls[1].messages.find(x=>x.role==='tool'&&x.tool_call_id==='two').content,/false/);
});

test('empty model response cannot mark a blank page complete',async()=>{
  const request=async()=>({ok:true,json:async()=>({choices:[{message:{role:'assistant',content:null,tool_calls:[]}}]})});
  await assert.rejects(runCreativeAgent({draft:draft(),assets:[],aliases:{},key:'test-key',request}),/没有返回创作操作/);
});
test('A-06: cancellation during response inspection never executes the returned tools',async()=>{
 const controller=new AbortController(),turns=[];
 const request=async()=>({ok:true,json:async()=>({choices:[{message:{role:'assistant',content:'',tool_calls:[{id:'paper',function:{name:'set_paper',arguments:'{"color":"#cc0000"}'}}]}}]})});
 await assert.rejects(runCreativeAgent({draft:draft(),assets:[],aliases:{},key:'test-key',request,signal:controller.signal,onResponse:async()=>controller.abort(Error('用户停止')),onTurn:value=>turns.push(value)}),/用户停止/);
 assert.equal(turns.length,0);
});

test('inspection images follow ALL native tool replies, including failed calls',async()=>{
 const replies=[{choices:[{message:{tool_calls:[{id:'inspect',function:{name:'inspect_materials',arguments:'{"keys":["m1"]}'}},{id:'bad',function:{name:'set_paper',arguments:'{"color": #fff}'}},{id:'place',function:{name:'place_materials',arguments:'{"items":[{"asset":"m1","x":0.2,"y":0.2}]}' }},{id:'text',function:{name:'upsert_text',arguments:'{"items":[{"key":"t","content":"今天的春风落在纸上","width":0.6}]}'}}]}}]},{choices:[{message:{tool_calls:[{id:'finish',function:{name:'finish_design',arguments:'{}'}}]}}]}];
 const payloads=[],asset={id:'a',title:'绿色叶片',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
 const result=await runCreativeAgent({draft:draft(),assets:[asset],aliases:{m1:'a'},key:'synthetic-test',onInspection:async()=>[{type:'text',text:'inspection image marker'}],request:async(_,options)=>{payloads.push(JSON.parse(options.body));return {ok:true,json:async()=>replies.shift()};}});
 const messages=payloads[1].messages,index=messages.findIndex(x=>x.role==='assistant');assert.deepEqual(messages.slice(index+1,index+5).map(x=>[x.role,x.tool_call_id]),[['tool','inspect'],['tool','bad'],['tool','place'],['tool','text']]);assert.equal(messages[index+5].role,'user');assert.equal(messages[index+5].content[0].text,'inspection image marker');assert.equal(result.finished,true);
});
test('intentional sparse composition may finish; only explicit physical requirements block it',async()=>{
 const assets=Array.from({length:4},(_,i)=>({id:'asset-'+i,title:'纸片 '+i,kind:'sticker',role:'support',physicalWidthMM:20,physicalHeightMM:25,supply:{quantity:1}}));
 const aliases=Object.fromEntries(assets.map((a,i)=>['m'+(i+1),a.id]));
 const tool=(name,args,id)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
 const batches=[[tool('place_materials',{items:[{asset:'m1',piece:'first',x:.2,y:.3}]},'place-one'),tool('upsert_text',{items:[{key:'title',content:'春日收藏',x:.5,y:.1,width:.8,font_size:34}]},'title'),tool('finish_design',{},'finish')]];
 const turns=[];let index=0;const result=await runCreativeAgent({draft:draft({ratio:'a5'}),assets,aliases,styles:['韩系清新'],pagePurposes:['日常记录'],materialPriority:{preferred:assets.map(a=>a.id)},key:'synthetic-test',request:async()=>({ok:true,json:async()=>({choices:[{message:{role:'assistant',content:'',tool_calls:batches[index++]}}]})}),onTurn:value=>turns.push(value)});
 assert.equal(result.finished,true);assert.equal(result.turns,1);assert.equal(result.draft.items.length,1);assert.equal(result.draft.textBlocks.length,1);
 assert.equal(turns[0].results.at(-1).ok,true);
});
