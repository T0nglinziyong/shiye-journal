import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {createCreativeHarness,initialHarnessState} from '../compute-server/harness/agent.mjs';
import {loadCreationSkills} from '../compute-server/harness/skills.mjs';
import {JournalCheckpointSaver,fileCheckpointJournal} from '../compute-server/harness/checkpoints.mjs';
import {createDeepSeekCreativeModel} from '../compute-server/harness/deepseek.mjs';

const pngHash='sha256:'+'a'.repeat(64);
const call=(name,args,id=name)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const answer=(...calls)=>({message:{role:'assistant',content:null,reasoning_content:'test',tool_calls:calls}});
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'shiye-harness-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const document=await createCreationDocument({draft:draft(),assets:[]}),skills=await loadCreationSkills();
  const journal=fileCheckpointJournal(join(dir,'journal.jsonl'));
  const render=async doc=>({pngHash,sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA=='});
  return {document,skills,journal,render,state:initialHarnessState({document,skills,brief:{title:'测试'}})};
}
const plan=()=>call('creation_plan',{intent:'图文共同构图',steps:[{task:'试摆并看图',status:'in_progress'}]});
const skill=()=>call('read_skill',{name:'journal-composition'});
const add=doc=>call('creation_apply',{protocolVersion:2,transactionId:'first',baseSceneRevision:creationSceneRevision(doc),operations:[{op:'text.add',id:'text',content:'一页新的想法',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:60,unit:'mm'}}]});
const lastScene=messages=>{
  const entry=[...messages].reverse().find(m=>m.role==='user'&&Array.isArray(m.content)&&m.content[0]?.text.startsWith('当前真实画面：'));
  return JSON.parse(entry.content[0].text.split('\n')[0].replace('当前真实画面：',''));
};

test('harness restores after an actual render failure without replaying model or material transaction',async t=>{
  const f=await fixture(t);let modelCalls=0;
  const model=async({messages})=>{
    modelCalls++;
    if(modelCalls===1)return answer(skill(),plan(),add(f.document));
    const p=lastScene(messages);
    assert.equal(messages.filter(m=>m.role==='assistant').length,1);
    assert.equal(messages.find(m=>m.role==='assistant').reasoning_content,'test');
    return answer(call('creation_review',{...p,approved:true,observations:'测试预览已查看',issues:[]}),call('creation_finish',{}));
  };
  const first=createCreativeHarness({...f,model,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),render:async()=>{throw Error('renderer offline');}});
  await assert.rejects(first.run({id:'restore',state:f.state}),/renderer offline/);
  const saved=await first.state('restore');assert.equal(saved.document.page.layers.length,1);
  const second=createCreativeHarness({...f,model,checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
  const done=await second.run({id:'restore'});
  assert.equal(done.status,'completed');assert.equal(modelCalls,2);assert.equal(done.document.page.layers.length,1);
  assert.equal(Object.keys(done.document.v3Transactions).length,1);
});

test('an unsatisfactory batch can be undone and rebuilt from the restored scene',async t=>{
 const f=await fixture(t);let turns=0;
 const harness=createCreativeHarness({...f,model:async({messages})=>{
  if(++turns===1)return answer(plan(),add(f.document));
  if(turns===2)return answer(call('creation_undo',{}));
  if(turns===3){const scene=lastScene(messages);assert.equal(scene.sceneRevision,creationSceneRevision(f.document));
   return answer(call('creation_apply',{protocolVersion:2,transactionId:'replacement',baseSceneRevision:scene.sceneRevision,operations:[{op:'text.add',id:'replacement',content:'重排之后',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:60,unit:'mm'}}]}));}
  return answer(call('creation_finish',{review:{observations:'已检查重排后的纸面',issues:[]}}));
 },checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
 const result=await harness.run({id:'undo-rebuild',state:f.state});
 assert.equal(result.status,'completed');assert.deepEqual(result.document.page.layers.map(node=>node.id),['replacement']);assert.equal(turns,4);
});

test('a separate workspace sends only changed nonempty images and can move its group to the page',async t=>{
 const f=await fixture(t);let turns=0;
 const render=async(document,_signal,spaces)=>{
  const root=document.page.layers,view=id=>root.filter(node=>(node.workspaceId||(node.isParked?'tray':'page'))===id);
  return {pngHash,sceneRevision:creationSceneRevision(document),imageURL:'data:image/png;base64,cGFnZQ==',spaceViews:spaces.map(space=>({id:space.id,signature:JSON.stringify(view(space.id)),imageURL:view(space.id).length?'data:image/png;base64,'+Buffer.from(space.id).toString('base64'):null,items:view(space.id).map(node=>node.id)}))};
 };
 const harness=createCreativeHarness({...f,render,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
  if(++turns===1)return answer(plan(),call('workspace_create',{id:'study',title:'局部试摆'}));
  if(turns===2)return answer(call('creation_apply',{protocolVersion:2,transactionId:'study-add',baseSceneRevision:creationSceneRevision(f.document),operations:[{op:'text.add',id:'title',content:'试排标题',place:{reference:'page',at:[50,50],unit:'mm',surface:'study'},size:{width:45,unit:'mm'}}]}));
  if(turns===3){const latest=messages.findLast(m=>m.role==='user'&&Array.isArray(m.content)&&m.content[0]?.text.startsWith('当前真实画面：'));
   assert.deepEqual(latest.content.filter(part=>part.type==='image_url').map(part=>Buffer.from(part.image_url.url.split(',')[1],'base64').toString()),['study']);
   return answer(call('creation_apply',{protocolVersion:2,transactionId:'study-to-page',baseSceneRevision:lastScene(messages).sceneRevision,operations:[{op:'layer.update',target:'title',place:{reference:'page',at:[70,70],unit:'mm',surface:'page'}}]}));}
  const latest=messages.findLast(m=>m.role==='user'&&Array.isArray(m.content)&&m.content[0]?.text.startsWith('当前真实画面：'));
  assert.deepEqual(latest.content.filter(part=>part.type==='image_url').map(part=>Buffer.from(part.image_url.url.split(',')[1],'base64').toString()),['page']);
  assert.equal(JSON.parse(latest.content[0].text.split('\n')[1].replace('工作空间状态：','')).changed.find(space=>space.id==='study').empty,true);
  return answer(call('creation_finish',{review:{observations:'试摆后移入纸面',issues:[]}}));
 }});
 const result=await harness.run({id:'study-flow',state:f.state});assert.equal(result.status,'completed');assert.equal(turns,4);
});

test('finish cannot pass when a new edit invalidates a viewed preview',async t=>{
  const f=await fixture(t);let n=0;
  const model=async({messages})=>{
    if(++n===1)return answer(skill(),plan(),add(f.document));
    if(n===2){const p=lastScene(messages);return answer(call('creation_apply',{protocolVersion:2,transactionId:'move',baseSceneRevision:p.sceneRevision,operations:[{op:'layer.update',target:'text',content:'新的文字'}]}),call('creation_review',{...p,approved:true,observations:'旧图',issues:[]}),call('creation_finish',{}));}
    const replies=messages.filter(m=>m.role==='tool').slice(-3).map(m=>JSON.parse(m.content));
    assert.equal(replies[0].ok,true);assert.equal(replies[1].ok,false);assert.equal(replies[2].ok,false);
    throw Error('verified stale guard');
  };
  const harness=createCreativeHarness({...f,model,checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
  await assert.rejects(harness.run({id:'stale',state:f.state}),/verified stale guard/);
  assert.equal((await harness.state('stale')).status,'running');
});

test('unauthorized source inspection and skill paths never reach host tools',async t=>{
  const f=await fixture(t);let n=0,inspections=0;
  const model=async({messages})=>{
    if(++n===1)return answer(call('inspect_materials',{keys:['other-user-material']}),call('read_skill',{name:'../../secret'}));
    const replies=messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));
    assert.ok(replies.every(r=>!r.ok));throw Error('verified isolation');
  };
  const harness=createCreativeHarness({...f,model,inspectMaterials:async()=>{inspections++;},checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
  await assert.rejects(harness.run({id:'isolated',state:f.state}),/verified isolation/);assert.equal(inspections,0);
});

test('recovery keeps original deadline and does not call a model after expiry',async t=>{
  const f=await fixture(t);let calls=0;
  const harness=createCreativeHarness({...f,model:async()=>{calls++;},clock:()=>f.state.deadlineAt+1,checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
  await assert.rejects(harness.run({id:'deadline',state:f.state}),e=>e.code==='CREATIVE_DEADLINE');assert.equal(calls,0);
});

test('cancellation cannot mark a result finished',async t=>{
  const f=await fixture(t),controller=new AbortController();
  const harness=createCreativeHarness({...f,model:async()=>{controller.abort(Error('cancelled'));return answer(skill());},checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
  await assert.rejects(harness.run({id:'cancel',state:f.state,signal:controller.signal}),/cancelled/);
  assert.notEqual((await harness.state('cancel'))?.status,'completed');
});

test('truncated output requests a smaller recovery call without executing or losing state',async t=>{
  const f=await fixture(t);let n=0;
  const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages,recoveringFromTruncation})=>{
    if(++n===1){assert.equal(recoveringFromTruncation,false);return {truncated:true};}
    if(n===2){assert.equal(recoveringFromTruncation,true);assert.match(messages.at(-1).content,/一个完整的小工具调用/);return answer(plan(),add(f.document));}
    assert.equal(recoveringFromTruncation,true);
    return answer(call('creation_finish',{review:{observations:'检查当前完整预览',issues:[]}}));
  }});
  const result=await harness.run({id:'recover-truncated',state:f.state});
  assert.equal(result.status,'completed');assert.equal(result.document.page.layers.length,1);
  assert.equal(result.usage[0].truncated,true);
});

test('DeepSeek adapter enables thinking and round-trips reasoning without exposing credentials in errors',async()=>{
  const messages=[{role:'assistant',reasoning_content:'earlier reasoning',content:null,tool_calls:[]}];let payload;
  const model=createDeepSeekCreativeModel({key:'private-key',fetcher:async(url,request)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');payload=JSON.parse(request.body);
    return Response.json({choices:[{finish_reason:'stop',message:{content:null,reasoning_content:'new reasoning',tool_calls:[]}}]});
  }});
  const result=await model({messages,tools:[],remainingMs:1000});
  assert.deepEqual(payload.thinking,{type:'enabled'});assert.equal(payload.reasoning_effort,'high');assert.deepEqual(payload.messages,messages);
  assert.equal(result.message.reasoning_content,'new reasoning');
  await model({messages,tools:[],remainingMs:1000,recoveringFromTruncation:true});
  assert.equal(payload.reasoning_effort,'low');assert.deepEqual(payload.thinking,{type:'enabled'});
  const failing=createDeepSeekCreativeModel({key:'private-key',fetcher:async()=>new Response('private-key',{status:401})});
  await assert.rejects(failing({messages,tools:[],remainingMs:1000}),e=>!e.message.includes('private-key')&&e.code==='CREATIVE_MODEL_HTTP');
});

test('automatic bootstrap allows first-turn editing and combined visual review/finish without discovery calls',async t=>{
  const f=await fixture(t);let n=0,renders=0;
  assert.ok(f.state.loadedSkills.some(s=>s.name==='journal-composition'));
  assert.match(f.state.messages[0].content,/常用工具合同/);
  const harness=createCreativeHarness({...f,render:async doc=>{renders++;return f.render(doc);},checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
    if(++n===1)return answer(plan(),add(f.document));
    const p=lastScene(messages),feedback=messages.at(-1).content[0].text;
    assert.match(feedback,/自动交付检查/);assert.match(feedback,/自动视觉检查任务/);
    return answer(call('creation_finish',{review:{observations:'文字清晰，已检查最新图',issues:[]}}));
  }});
  const done=await harness.run({id:'automatic',state:f.state});assert.equal(done.status,'completed');assert.equal(n,2);assert.equal(renders,1);assert.equal(done.review.pngHash,pngHash);assert.equal(done.review.sceneRevision,creationSceneRevision(done.document));assert.ok(done.usage.every(u=>Number.isFinite(u.modelMs)));
});

test('combined finish rejects unseen edits and nonempty blocking issues',async t=>{
  const f=await fixture(t);let n=0;
  const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
    if(++n===1)return answer(plan(),add(f.document));
    const p=lastScene(messages);
    if(n===2)return answer(call('creation_finish',{review:{observations:'发现问题',issues:['文字遮挡']}}));
    if(n===3){assert.equal(JSON.parse(messages.at(-1).content).ok,false);return answer(call('creation_apply',{protocolVersion:2,transactionId:'edit',baseSceneRevision:p.sceneRevision,operations:[{op:'layer.update',target:'text',content:'已修改'}]}),call('creation_finish',{review:{observations:'旧图',issues:[]}}));}
    assert.ok(messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content)).some(v=>v.detail==='请先查看当前版本的真实预览'));throw Error('stale inline verified');
  }});
  await assert.rejects(harness.run({id:'inline-stale',state:f.state}),/stale inline verified/);
});

test('unchanged preview reuses the current render without another upload',async t=>{
  const f=await fixture(t);let n=0,renders=0;
  const harness=createCreativeHarness({...f,render:async doc=>{renders++;return f.render(doc);},checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
    if(++n===1)return answer(plan(),add(f.document));
    if(n===2)return answer(call('creation_preview',{}));
    assert.equal(JSON.parse(messages.at(-1).content).data.reused,true);
    const p=lastScene(messages);return answer(call('creation_finish',{review:{observations:'同版本预览',issues:[]}}));
  }});
  assert.equal((await harness.run({id:'reuse',state:f.state})).status,'completed');assert.equal(renders,1);
});

test('recipe discovery is paged, image-backed and does not resend the overview',async t=>{
 const f=await fixture(t);let n=0;
 const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
  if(++n===1)return answer(call('read_skill',{name:'journal-lettering',level:'methods'}));
  const result=JSON.parse(messages.findLast(m=>m.role==='tool').content);assert.equal(result.ok,true);assert.equal(result.data.methods.length,8);assert.equal(messages.at(-1).content.filter(p=>p.type==='image_url').length,8);
  assert.ok(result.data.methods.every(m=>m.tool.name==='creation_recipe'));assert.equal(result.data.guidance,f.skills.read('journal-lettering').content);throw Error('library discovery verified');
 }});
 await assert.rejects(harness.run({id:'method-gallery',state:f.state}),/library discovery verified/);
});
test('recipe edits render automatically and repeated transaction IDs never duplicate groups',async t=>{
 const f=await fixture(t);let n=0,renders=0;
 const args={kind:'technique',recipeId:'title-label',transactionId:'recipe-once',baseSceneRevision:creationSceneRevision(f.document),parameters:{id:'title',text:'今天的小记'}};
 const harness=createCreativeHarness({...f,render:async d=>{renders++;return f.render(d);},checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
  if(++n===1)return answer(plan(),call('creation_recipe',args));
  if(n===2)return answer(call('creation_recipe',args));
  assert.equal(JSON.parse(messages.at(-1).content).data.replayed,true);
  return answer(call('creation_finish',{review:{observations:'已查看标题组合',issues:[]}}));
 }});
 const done=await harness.run({id:'recipe-replay',state:f.state});assert.equal(done.status,'completed');assert.equal(done.document.page.layers.length,1);assert.equal(renders,1);
});
test('recipe failure is atomic and cannot be accepted as a finished artwork',async t=>{
 const f=await fixture(t);let n=0;
 const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
  if(++n===1)return answer(plan(),call('creation_recipe',{kind:'technique',recipeId:'paper-tear',transactionId:'bad',baseSceneRevision:creationSceneRevision(f.document),parameters:{id:'tear',target:'other-account',path:{points:[[0,.5],[1,.5]],unit:'ratio'}}}));
  assert.equal(JSON.parse(messages.at(-1).content).ok,false);throw Error('recipe isolation verified');
 }});
 await assert.rejects(harness.run({id:'recipe-isolation',state:f.state}),/recipe isolation verified/);assert.equal((await harness.state('recipe-isolation')).document.page.layers.length,0);
});

test('deferred template lookup explains the limitation without loading its image or executable recipe',async t=>{
  const f=await fixture(t);let n=0,baseline=0;
  const imageCount=messages=>messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url').length;
  const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
    if(++n===1){baseline=imageCount(messages);return answer(call('read_template',{id:'ac-26'}));}
    const reply=JSON.parse(messages.findLast(m=>m.role==='tool').content);
    assert.equal(reply.ok,true);assert.equal(reply.data.available,false);assert.equal(reply.data.tool,undefined);
    assert.equal(imageCount(messages),baseline);
    throw Error('verified deferred lookup');
  }});
  await assert.rejects(harness.run({id:'deferred-lookup',state:f.state}),/verified deferred lookup/);
  assert.equal((await harness.state('deferred-lookup')).document.page.layers.length,0);
});
