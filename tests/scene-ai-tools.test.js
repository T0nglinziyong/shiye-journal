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
 assert.equal(out.draft.primitives[0].blendMode,'normal');
});

test('AI tools group, move and delete editable ink through the canonical Scene tree',()=>{
 const base=draft();
 base.primitives.push({id:'paper-shape',key:'paper-shape',kind:'rectangle',x:90,y:80,width:100,height:40,zIndex:1});
 base.strokes.push({id:'pen-mark',color:'#334455',width:3,points:[{x:10,y:20,p:.2},{x:30,y:40,p:.8}],zIndex:2});
 const commands=[
  {name:'group_elements',arguments:{keys:['pen-mark','paper-shape'],id:'note-group'}},
  {name:'style_elements',arguments:{items:[{key:'pen-mark',opacity:.55}]}},
  {name:'move_elements',arguments:{items:[{key:'pen-mark',x:.6,y:.35,rotation:90,z:8}]}}
 ];
 const result=applyToolCalls({tools:commands},base,[],{});
 assert.deepEqual(result.results.map(item=>item.ok),[true,true,true],JSON.stringify(result.results));
 const ink=result.draft.strokes[0],center=ink.points.reduce((p,q)=>({x:p.x+q.x/ink.points.length,y:p.y+q.y/ink.points.length}),{x:0,y:0});
 assert.ok(Math.abs(center.x-result.draft.canvas.width*.6)<1e-6);
 assert.ok(Math.abs(center.y-result.draft.canvas.height*.35)<1e-6);
 assert.equal(ink.opacity,.55);assert.equal(ink.rotation,90);
 assert.equal(result.draft.layers.find(n=>n.id==='note-group').children.length,2);
 assert.ok(JSON.stringify(result.draft).includes('"type":"ink"'));
 const removed=applyToolCalls({tools:[{name:'delete_elements',arguments:{keys:['pen-mark']}}]},result.draft,[],{});
 assert.deepEqual(removed.results.map(item=>item.ok),[true],JSON.stringify(removed.results));
 assert.equal(removed.draft.strokes.length,0);
 assert.equal(removed.draft.primitives.length,1);
});
