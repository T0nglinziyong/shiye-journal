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
const plan=()=>call('creation_plan',{intent:'图文共同构图',steps:[{task:'试摆并看图',status:'active'}]});
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
    return answer(call('creation_review',{...p,approved:true,observations:'测试预览已查看',issues:[]}),call('creation_finish',{sceneRevision:p.sceneRevision}));
  };
  const first=createCreativeHarness({...f,model,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),render:async()=>{throw Error('renderer offline');}});
  await assert.rejects(first.run({id:'restore',state:f.state}),/renderer offline/);
  const saved=await first.state('restore');assert.equal(saved.document.page.layers.length,1);
  const second=createCreativeHarness({...f,model,checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
  const done=await second.run({id:'restore'});
  assert.equal(done.status,'completed');assert.equal(modelCalls,2);assert.equal(done.document.page.layers.length,1);
  assert.equal(Object.keys(done.document.v3Transactions).length,1);
});

test('finish cannot pass when a new edit invalidates a viewed preview',async t=>{
  const f=await fixture(t);let n=0;
  const model=async({messages})=>{
    if(++n===1)return answer(skill(),plan(),add(f.document));
    if(n===2){const p=lastScene(messages);return answer(call('creation_apply',{protocolVersion:2,transactionId:'move',baseSceneRevision:p.sceneRevision,operations:[{op:'layer.update',target:'text',content:'新的文字'}]}),call('creation_review',{...p,approved:true,observations:'旧图',issues:[]}),call('creation_finish',{sceneRevision:p.sceneRevision}));}
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

test('DeepSeek adapter enables thinking and round-trips reasoning without exposing credentials in errors',async()=>{
  const messages=[{role:'assistant',reasoning_content:'earlier reasoning',content:null,tool_calls:[]}];let payload;
  const model=createDeepSeekCreativeModel({key:'private-key',fetcher:async(url,request)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');payload=JSON.parse(request.body);
    return Response.json({choices:[{finish_reason:'stop',message:{content:null,reasoning_content:'new reasoning',tool_calls:[]}}]});
  }});
  const result=await model({messages,tools:[],remainingMs:1000});
  assert.deepEqual(payload.thinking,{type:'enabled'});assert.equal(payload.reasoning_effort,'high');assert.deepEqual(payload.messages,messages);
  assert.equal(result.message.reasoning_content,'new reasoning');
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
    return answer(call('creation_finish',{sceneRevision:p.sceneRevision,review:{pngHash:p.pngHash,observations:'文字清晰，已检查最新图',issues:[]}}));
  }});
  const done=await harness.run({id:'automatic',state:f.state});assert.equal(done.status,'completed');assert.equal(n,2);assert.equal(renders,1);assert.ok(done.usage.every(u=>Number.isFinite(u.modelMs)));
});

test('combined finish rejects unseen edits and nonempty blocking issues',async t=>{
  const f=await fixture(t);let n=0;
  const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
    if(++n===1)return answer(plan(),add(f.document));
    const p=lastScene(messages);
    if(n===2)return answer(call('creation_finish',{sceneRevision:p.sceneRevision,review:{pngHash:p.pngHash,observations:'发现问题',issues:['文字遮挡']}}));
    if(n===3){assert.equal(JSON.parse(messages.at(-1).content).ok,false);return answer(call('creation_apply',{protocolVersion:2,transactionId:'edit',baseSceneRevision:p.sceneRevision,operations:[{op:'layer.update',target:'text',content:'已修改'}]}),call('creation_finish',{sceneRevision:p.sceneRevision,review:{pngHash:p.pngHash,observations:'旧图',issues:[]}}));}
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
    const p=lastScene(messages);return answer(call('creation_finish',{sceneRevision:p.sceneRevision,review:{pngHash:p.pngHash,observations:'同版本预览',issues:[]}}));
  }});
  assert.equal((await harness.run({id:'reuse',state:f.state})).status,'completed');assert.equal(renders,1);
});
