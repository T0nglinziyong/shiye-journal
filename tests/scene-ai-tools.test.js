import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {applyToolCalls} from '../src/creative.js';

const mask={outer:[[.05,.05],[.95,.05],[.95,.95],[.05,.95]],holes:[]};
const rectangle=(key,x)=>({key,kind:'rectangle',x,y:.5,width:.18,height:.12,
  fill:'#d9e6db',stroke:'#476358',line_width:2});
test('tool agent edits the same saved Draft scene with vector masks, paper blending and groups',()=>{
 const calls=[
  {name:'upsert_primitives',arguments:{items:[rectangle('paper-a',.25),rectangle('paper-b',.65)]}},
  {name:'style_elements',arguments:{items:[{key:'paper-a',blend_mode:'multiply',vector_mask:mask}]}},
  {name:'group_elements',arguments:{id:'paper-group',name:'拼贴小组',keys:['paper-a','paper-b']}},
  {name:'finish_design',arguments:{summary:'完成实体手帐拼贴'}}];
 const result=applyToolCalls({tools:calls},draft(),[],{});
 assert.deepEqual(result.results.map(r=>r.ok),[true,true,true,true]);
 assert.equal(result.draft.primitives[0].blendMode,'multiply');
 assert.deepEqual(result.draft.primitives[0].vectorMask,mask);
 assert.equal(result.draft.primitives[0].creativeGroupID,'paper-group');
 assert.equal(result.draft.primitives[1].creativeGroupID,'paper-group');
 assert.equal(result.draft.layerGroups.length,1);
 assert.equal(result.draft.sceneVersion,2);
 assert.equal(result.draft.agentRun.status,'finished');
});
test('direct page compiles the same physical Scene styling and groups',()=>{
 const page={version:2,style:'自由构图',intent:null,paper:{color:'#fcfaf0',pattern:'plain'},layers:[
   {type:'group',id:'pair',name:'组合',children:[
      {type:'shape',id:'paper-a',...rectangle('paper-a',.25),blend_mode:'multiply',vector_mask:mask},
      {type:'shape',id:'paper-b',...rectangle('paper-b',.65)}
   ]}
 ]};
 const out=applyToolCalls({tools:[{name:'compose_direct_page',arguments:page}]},draft(),[],{});
 assert.deepEqual(out.results.map(r=>r.ok),[true]);
 assert.equal(out.draft.primitives[0].blendMode,'multiply');
 assert.deepEqual(out.draft.primitives[0].vectorMask,mask);
 assert.equal(out.draft.primitives[0].creativeGroupID,'pair');
 assert.equal(out.draft.agentRun.status,'finished');
});
test('malicious nonphysical blend and invalid holes roll back operations',()=>{
 const base=draft();
 const create={name:'upsert_primitives',arguments:{items:[rectangle('a',.5)]}};
 const invalid={name:'style_elements',arguments:{items:[{key:'a',blend_mode:'color-dodge'}]}};
 const out=applyToolCalls({tools:[create,invalid]},base,[],{});
 assert.equal(out.results[0].ok,true);
 assert.equal(out.results[1].ok,false);
 assert.equal(out.draft.primitives.length,1);
 assert.equal(out.draft.primitives[0].blendMode,undefined);
});
