import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeProtocol} from '../src/creative-delivery.js';
import {directPageContract,validateValue} from '../src/creative-contract.js';
import {creationAgentTools as agentTools} from '../src/creation-agent-session.js';

test('creative provider formats are selected independently of the turn loop', () => {
  const native = creativeProtocol({generationMode:'agent', transport:'auto'});
  assert.equal(native.native, true);
  assert.equal(native.request().tool_choice, 'required');
  assert.equal(native.request({type:'enabled'}).tool_choice, 'auto');
  assert.equal(native.request().tools, agentTools);
  const original = [{id:'one', type:'function', function:{name:'finish_design', arguments:'{}'}}];
  assert.equal(native.calls({tool_calls:original}, 1), original);

  const json = creativeProtocol({generationMode:'agent', transport:'json'});
  assert.equal(json.native, false);
  assert.deepEqual(json.request(), {response_format:{type:'json_object'}});
  assert.deepEqual(json.calls({content:'```json\n{"tools":[{"name":"set_paper","arguments":{"color":"#ffffff"}}]}\n```'}, 3), [
    {id:'json-3-0', type:'function', function:{name:'set_paper', arguments:'{"color":"#ffffff"}'}}
  ]);
  assert.throws(() => json.calls({content:'not JSON'}, 1), SyntaxError);
});

test('all editable generation preferences expose the same unified Command gateway',()=>{
 for(const generationMode of ['agent','direct']){
  const protocol=creativeProtocol({generationMode,transport:'native'});
  assert.deepEqual(protocol.request().tools.map(t=>t.function.name),['creation_apply','creation_help','creation_guide','creation_inspect','inspect_materials','creation_finish']);
  assert.match(protocol.instruction,/creation_apply/);
 }
 const json=creativeProtocol({transport:'json'});
 assert.throws(()=>json.calls({content:JSON.stringify({version:2,layers:[]})},1),/仅接受/);
 assert.throws(()=>json.calls({content:JSON.stringify({format:'shiye-craft-plan',version:2})},1),/仅接受/);
});

test('A-12: auto uses only verified endpoint/model capabilities; explicit override stays possible',()=>{
 const unknown={endpoint:'https://example.test/chat/completions',model:'custom-model',generationMode:'agent',transport:'auto'};
 assert.throws(()=>creativeProtocol(unknown),error=>error.code==='capability-unverified');
 assert.equal(creativeProtocol({...unknown,transport:'native'}).native,true);
 assert.equal(creativeProtocol({...unknown,transport:'json'}).native,false);
 assert.throws(()=>creativeProtocol({...unknown,generationMode:'direct'}),error=>error.code==='capability-unverified');
 assert.equal(creativeProtocol({...unknown,generationMode:'direct',transport:'json'}).native,false);
 assert.equal(creativeProtocol({endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',transport:'auto'}).native,true);
 assert.equal(creativeProtocol({endpoint:'https://open.bigmodel.cn/api/paas/v4/chat/completions',model:'glm-4.6v',generationMode:'direct'}).request().tool_choice,'auto');
 assert.equal(creativeProtocol({endpoint:'https://open.bigmodel.cn/api/paas/v4/chat/completions',model:'glm-4.6v',generationMode:'agent'}).request().tool_choice,'auto');
 assert.deepEqual(creativeProtocol({endpoint:'https://api.siliconflow.cn/v1/chat/completions',model:'Qwen/Qwen2.5-VL-72B-Instruct',generationMode:'agent'}).request(),{});
 assert.equal(creativeProtocol({endpoint:'https://open.bigmodel.cn/api/paas/v4/chat/completions',model:'glm-5.2',generationMode:'direct'}).native,true);
 assert.throws(()=>creativeProtocol({endpoint:'https://api.deepseek.com/chat/completions',model:'unknown',transport:'auto',generationMode:'agent'}),error=>error.code==='capability-unverified');
});

test('freehand drawing retains many independent pressure-aware editable ink strokes',()=>{
 const stroke={points:[{x:.21,y:.29,pressure:.35},{x:.24,y:.32,pressure:.86},{x:.29,y:.34,pressure:.47}],
   width:3,color:'#445566',opacity:.8,pen_style:'brush'};
 const page={version:2,style:'自由构图',intent:null, paper:{color:'#ffffff',pattern:'plain'},
 layers:Array.from({length:40},(_,i)=>({type:'ink',id:'ink-'+i,...stroke,points:stroke.points.map(p=>({...p}))}))};
 assert.doesNotThrow(()=>validateValue(page,directPageContract));
 assert.throws(()=>validateValue({...page,layers:[{type:'ink',id:'bad',...stroke,points:[{x:2,y:0}]}]},directPageContract),/合同不合法|缺少字段/);
});
