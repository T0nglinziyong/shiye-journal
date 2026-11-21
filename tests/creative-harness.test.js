import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {createCreativeHarness,initialHarnessState} from '../compute-server/harness/agent.mjs';
import {loadCreationSkills} from '../compute-server/harness/skills.mjs';
import {JournalCheckpointSaver,fileCheckpointJournal} from '../compute-server/harness/checkpoints.mjs';
import {createDeepSeekCreativeModel} from '../compute-server/harness/deepseek.mjs';
import {searchLibraryReferences,caseDetails,matchJournalCases} from '../compute-server/harness/library.mjs';

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
const revise=(messages,issue='当前排版需要调整')=>call('creation_review',{...lastScene(messages),approved:false,observations:'已检查当前真实预览',issues:[issue],nextStep:'合批修正后重新看图'});

test('reference search returns sourced, actionable matches with stable page fit',async t=>{
 const f=await fixture(t);
 const templates=searchLibraryReferences(f.document,{query:'旅行票据模板',kind:'templates',limit:6});
 assert.ok(templates.results.length>0);
 assert.ok(templates.results.every(row=>row.kind==='template'&&row.source?.id&&row.readWith.tool==='read_template'));
 const titleSources=searchLibraryReferences(f.document,{query:'标题',kind:'templates',limit:6});
 assert.ok(new Set(titleSources.results.map(row=>row.source.id)).size>1);
 const methods=searchLibraryReferences(f.document,{query:'标题',kind:'techniques',limit:4});
 assert.ok(methods.results.length>0);
 assert.ok(methods.results.every(row=>row.readWith.tool==='read_skill'&&row.readWith.methodId===row.id));
 assert.deepEqual(searchLibraryReferences(f.document,{query:'毫无关系的唯一关键词',kind:'techniques'}).results,[]);
 const cases=searchLibraryReferences(f.document,{query:'照片',kind:'cases',limit:8});
 assert.ok(cases.results.length>0);
 assert.ok(cases.results.every(row=>row.kind==='case'&&row.why.pageMode==='single'&&row.readWith.tool==='read_case'&&row.source.url.startsWith('https://')));
 assert.ok(!cases.results.some(row=>row.id==='digital-two-page-mirror'));
 assert.match(caseDetails(cases.results[0].id,f.document).usage,/不得直接放入作品/);
 assert.throws(()=>caseDetails('digital-two-page-mirror',f.document),/页面模式/);
 assert.deepEqual(matchJournalCases(f.document,{limit:2}).map(row=>row.kind),['case','case']);
 assert.match(f.state.messages[1].content[0].text,/电子手帐案例候选/);
 assert.match(f.state.messages[1].content[0].text,/电子手帐案例候选（可用 read_case 查看）：\[\]/);
 const spread=await createCreationDocument({draft:draft({mode:'spread'}),assets:[],styles:['丰富层叠']});
 const spreadCases=matchJournalCases(spread,{limit:3});
 assert.ok(spreadCases.some(row=>row.id==='digital-ephemera-spread'));
 assert.ok(spreadCases.every(row=>row.why.pageMode==='spread'));
});

test('model can read a sourced case before editing and retain its advice through the turn',async t=>{
 const f=await fixture(t);let calls=0;
 const model=async({messages})=>{
  calls++;
  if(calls===1)return answer(call('read_case',{id:'digital-focal-photo-strip'}),plan(),add(f.document));
  const caseReply=messages.find(message=>message.role==='tool'&&message.content.includes('digital-focal-photo-strip'));
  assert.ok(caseReply);
  assert.match(caseReply.content,/构图、配色与对象关系/);
  const p=lastScene(messages);
  return answer(call('creation_review',{...p,approved:true,observations:'已查看一页预览',issues:[]}),call('creation_finish',{}));
 };
 const harness=createCreativeHarness({...f,model,checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
 const done=await harness.run({id:'case-reference',state:f.state});
 assert.equal(done.status,'completed');
 assert.ok(done.trace.some(event=>event.kind==='tool'&&event.name==='read_case'&&event.ok));
});

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
  if(turns===2)return answer(revise(messages,'第一版不满意'),call('creation_undo',{}));
  if(turns===3){const scene=lastScene(messages);assert.equal(scene.sceneRevision,creationSceneRevision(f.document));
   return answer(revise(messages,'空白纸面需重新排版'),call('creation_apply',{protocolVersion:2,transactionId:'replacement',baseSceneRevision:scene.sceneRevision,operations:[{op:'text.add',id:'replacement',content:'重排之后',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:60,unit:'mm'}}]}));}
  return answer(call('creation_finish',{review:{observations:'已检查重排后的纸面',issues:[]}}));
 },checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
 const result=await harness.run({id:'undo-rebuild',state:f.state});
 assert.equal(result.status,'completed');assert.deepEqual(result.document.page.layers.map(node=>node.id),['replacement']);assert.equal(turns,4);
});

test('each rendered edit requires a screenshot review before the next mutation',async t=>{
 const f=await fixture(t);let turns=0;
 const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
  if(++turns===1)return answer(plan(),add(f.document));
  const current=lastScene(messages);
  const update=call('creation_apply',{protocolVersion:2,transactionId:'revised',baseSceneRevision:current.sceneRevision,operations:[{op:'layer.update',target:'text',content:'调整后的标题'}],decision:'根据截图审查把标题改短'});
  if(turns===2)return answer(update);
  if(turns===3){assert.match(JSON.parse(messages.at(-1).content).detail,/先审查当前真实预览/);return answer(revise(messages,'标题过长'),update);}
  assert.match(messages.findLast(m=>m.role==='user'&&Array.isArray(m.content))?.content[0]?.text||'',/标题过长/);
  return answer(call('creation_finish',{review:{observations:'标题清晰，版面符合任务',issues:[]}}));
 }});
 const done=await harness.run({id:'review-gate',state:f.state});
 assert.equal(done.status,'completed');assert.equal(turns,4);assert.equal(done.document.page.layers[0].content,'调整后的标题');
 const review=done.decisions.find(entry=>entry.kind==='review'&&!entry.approved);
 assert.deepEqual(review.issues,['标题过长']);assert.equal(review.pngHash,pngHash);
 assert.equal(done.decisions.find(entry=>entry.transactionId==='revised').reason,'根据截图审查把标题改短');
 assert.equal(done.reviewPending,false);
});

test('a failed visual review cannot be approved again without a changed render',async t=>{
 const f=await fixture(t);let turns=0;
 const harness=createCreativeHarness({...f,model:async({messages})=>{
  if(++turns===1)return answer(plan(),add(f.document));
  if(turns===2)return answer(revise(messages,'标题遮挡主图'));
  if(turns===3)return answer(call('creation_finish',{review:{observations:'直接改口',issues:[]}}));
  assert.match(JSON.parse(messages.at(-1).content).detail,/待修问题尚未通过修改与重新预览验证/);
  throw Error('unresolved review guarded');
 },checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
 await assert.rejects(harness.run({id:'review-unresolved',state:f.state}),/unresolved review guarded/);
});

test('parallel draft agents keep isolated scenes until a viewed candidate is selected',async t=>{
 const f=await fixture(t);let parentTurns=0,children=0;
 const model=async({messages,tools})=>{
  if(messages[0].content.startsWith('你是拾页的独立构图草稿子 Agent')){
   children++;assert.deepEqual(tools.map(tool=>tool.function.name),['creation_apply']);
   const prompt=messages.at(-1).content[0].text,id=prompt.match(/transactionId：(draft_\d+_[12])/)[1],goal=prompt.match(/独立草稿方向：([^\n]+)/)[1];
   return answer(call('creation_apply',{protocolVersion:2,transactionId:id,baseSceneRevision:creationSceneRevision(f.document),operations:[{op:'text.add',id:id+'_title',content:goal,place:{reference:'page',at:[40,50],unit:'mm'},size:{width:60,unit:'mm'}}]},id));
  }
  if(++parentTurns===1)return answer(plan(),call('explore_drafts',{goals:['左侧文字主导构图','右侧文字主导构图']}));
  if(parentTurns===2){
   const gallery=messages.at(-1).content;assert.equal(gallery.filter(part=>part.type==='image_url').length,2);
   return answer(call('select_draft',{id:'draft_1_2',decision:'右侧版本留白更清晰'}));
  }
  return answer(call('creation_finish',{review:{observations:'比较两个草稿后选定右侧方案，文字可读',issues:[]}}));
 };
 const harness=createCreativeHarness({...f,model,renderDraft:async doc=>({pngHash,sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,ZHJhZnQ='}),checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
 const done=await harness.run({id:'parallel-drafts',state:f.state});
 assert.equal(done.status,'completed');assert.equal(children,2);assert.equal(parentTurns,3);
 assert.equal(done.document.page.layers[0].content,'右侧文字主导构图');
 assert.equal(done.decisions.find(entry=>entry.kind==='select_draft').reason,'右侧版本留白更清晰');
});

test('a separate workspace sends only changed nonempty images and can move its group to the page',async t=>{
 const f=await fixture(t);let turns=0;
 const render=async(document,_signal,spaces)=>{
  const root=document.page.layers,view=id=>root.filter(node=>(node.workspaceId||(node.isParked?'tray':'page'))===id);
  const pageHash='sha256:'+createHash('sha256').update(JSON.stringify(view('page'))).digest('hex');
  return {pngHash:pageHash,sceneRevision:creationSceneRevision(document),imageURL:'data:image/png;base64,cGFnZQ==',spaceViews:spaces.map(space=>({id:space.id,signature:space.id==='page'?pageHash:JSON.stringify(view(space.id)),imageURL:view(space.id).length?'data:image/png;base64,'+Buffer.from(space.id).toString('base64'):null,items:view(space.id).map(node=>node.id)}))};
 };
 const harness=createCreativeHarness({...f,render,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
  if(++turns===1)return answer(plan(),call('workspace_create',{id:'study',title:'局部试摆'}));
  if(turns===2){assert.match(messages[2].content,/"study":\{"signature":"empty","empty":true/);return answer(call('creation_apply',{protocolVersion:2,transactionId:'study-add',baseSceneRevision:creationSceneRevision(f.document),operations:[{op:'text.add',id:'title',content:'试排标题',place:{reference:'page',at:[50,50],unit:'mm',surface:'study'},size:{width:45,unit:'mm'}}]}));}
  if(turns===3){const latest=messages.findLast(m=>m.role==='user'&&Array.isArray(m.content)&&m.content[0]?.text.startsWith('当前真实画面：'));
   assert.deepEqual(latest.content.filter(part=>part.type==='image_url').map(part=>Buffer.from(part.image_url.url.split(',')[1],'base64').toString()),['study']);
   return answer(revise(messages,'标题还在试摆区'),call('creation_apply',{protocolVersion:2,transactionId:'study-to-page',baseSceneRevision:lastScene(messages).sceneRevision,operations:[{op:'layer.update',target:'title',place:{reference:'page',at:[70,70],unit:'mm',surface:'page'}}]}));}
  const latest=messages.findLast(m=>m.role==='user'&&Array.isArray(m.content)&&m.content[0]?.text.startsWith('当前真实画面：'));
  assert.deepEqual(latest.content.filter(part=>part.type==='image_url').map(part=>Buffer.from(part.image_url.url.split(',')[1],'base64').toString()),['page']);
  const stage=JSON.parse(latest.content[0].text.split('\n')[1].replace(/^阶段观察：|^工作空间状态：/,''));
  assert.equal(stage.changed.find(space=>space.id==='study').empty,true);
  return answer(call('creation_finish',{review:{observations:'试摆后移入纸面',issues:[]}}));
 }});
 const result=await harness.run({id:'study-flow',state:f.state});assert.equal(result.status,'completed');assert.equal(turns,4);
});

test('closing an empty workspace removes its visual state without another render',async t=>{
  const f=await fixture(t);let turns=0,renders=0;
  const harness=createCreativeHarness({...f,render:async doc=>{renders++;return f.render(doc);},model:async({messages})=>{
    if(++turns===1)return answer(call('workspace_create',{id:'study',title:'试摆'}));
    if(turns===2){assert.match(messages[2].content,/"study":\{"signature":"empty"/);return answer(call('workspace_close',{id:'study'}));}
    assert.doesNotMatch(messages[2].content,/"study":\{"signature":"empty"/);
    throw Error('closed workspace verified');
  }});
  await assert.rejects(harness.run({id:'close-study',state:f.state}),/closed workspace verified/);
  assert.equal(renders,0);
});

test('finish cannot pass when a new edit invalidates a viewed preview',async t=>{
  const f=await fixture(t);let n=0;
  const model=async({messages})=>{
    if(++n===1)return answer(skill(),plan(),add(f.document));
    if(n===2){const p=lastScene(messages);return answer(revise(messages,'文字需要改写'),call('creation_apply',{protocolVersion:2,transactionId:'move',baseSceneRevision:p.sceneRevision,operations:[{op:'layer.update',target:'text',content:'新的文字'}]}),call('creation_review',{...p,approved:true,observations:'旧图',issues:[]},'stale-review'),call('creation_finish',{}));}
    const replies=messages.filter(m=>m.role==='tool').slice(-4).map(m=>JSON.parse(m.content));
    assert.equal(replies[0].ok,true);assert.equal(replies[1].ok,true);assert.equal(replies[2].ok,false);assert.equal(replies[3].ok,false);
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

test('DeepSeek compaction summarizes earlier creative choices without editing tools',async()=>{
 let payload;
 const model=createDeepSeekCreativeModel({key:'private-key',fetcher:async(_url,request)=>{
   payload=JSON.parse(request.body);
   return Response.json({choices:[{finish_reason:'stop',message:{content:'保留左侧留白；居中方案因主图拥挤已放弃。'}}],usage:{total_tokens:200}});
 }});
 const result=await model.compact({previousSummary:'试过居中',history:[{role:'assistant',text:'左侧更清晰'}],remainingMs:30000});
 assert.match(result.summary,/左侧留白/);assert.equal(result.usage.total_tokens,200);
 assert.equal(payload.reasoning_effort,'low');assert.equal(payload.tools,undefined);
 assert.match(payload.messages[1].content,/试过居中/);
});

test('harness preserves a compacted design decision in the persisted run',async t=>{
 const f=await fixture(t),state=structuredClone(f.state);
 for(let i=0;i<7;i++)state.messages.push({role:'assistant',content:i===1?'居中太拥挤，改为左侧留白。':'完成一次试摆。'},{role:'user',content:'继续检查构图。'});
 state.turns=7;
 let calls=0,compactions=0;
 const model=async({messages})=>{
   calls++;
   assert.match(messages[2].content,/左侧留白/);
   if(calls===1){assert.equal(messages.filter(message=>message.role==='assistant').length,2);return answer(plan());}
   throw Error('verified compacted context');
 };
 model.compact=async({history})=>{compactions++;assert.match(JSON.stringify(history),/居中太拥挤/);return {summary:'居中太拥挤，已决定改为左侧留白，右侧保留给手写文字。',usage:{total_tokens:30}};};
 const harness=createCreativeHarness({...f,model,checkpointer:await new JournalCheckpointSaver(f.journal).restore()});
 await assert.rejects(harness.run({id:'compacted',state}),/verified compacted context/);
 const saved=await harness.state('compacted');
 assert.equal(saved.creativeMemory,'居中太拥挤，已决定改为左侧留白，右侧保留给手写文字。');
 assert.equal(saved.compactions.length,1);
 assert.equal(compactions,1);
});

test('small task allows first-turn editing and combined visual review/finish without discovery calls',async t=>{
  const f=await fixture(t);let n=0,renders=0;
  assert.deepEqual(f.state.loadedSkills,[]);
  assert.ok(f.state.messages[0].content.includes('journal-composition'));
  assert.match(f.state.messages[0].content,/常用工具合同/);
  const harness=createCreativeHarness({...f,render:async doc=>{renders++;return f.render(doc);},checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
    if(++n===1)return answer(plan(),add(f.document));
    const p=lastScene(messages),feedback=messages.at(-1).content[0].text;
    assert.match(feedback,/自动交付检查/);assert.match(feedback,/自动视觉审查/);
    return answer(call('creation_finish',{review:{observations:'文字清晰，已检查最新图',issues:[]}}));
  }});
  const done=await harness.run({id:'automatic',state:f.state});assert.equal(done.status,'completed');assert.equal(n,2);assert.equal(renders,1);assert.equal(done.review.pngHash,pngHash);assert.equal(done.review.sceneRevision,creationSceneRevision(done.document));assert.ok(done.usage.every(u=>Number.isFinite(u.modelMs)));
});

test('rich task makes a specific method and material evidence available before editing',async t=>{
  const f=await fixture(t);
  const assets=Array.from({length:4},(_,i)=>({id:'paper-'+i,title:'纸片 '+i,kind:'paper',physicalWidthMM:30,physicalHeightMM:40}));
  const document=await createCreationDocument({draft:draft(),assets,aliases:Object.fromEntries(assets.map((asset,i)=>['m'+(i+1),asset.id]))});
  const state=initialHarnessState({document,skills:f.skills,brief:{styles:['丰富层叠']}});
  assert.equal(state.methodStudyRequired,true);
  let turns=0;
  const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages,tools})=>{
    if(++turns===1){
      assert.equal(tools.some(tool=>tool.function.name==='creation_apply'),false);
      return answer(call('read_skill',{name:'paper-layering',level:'detail',methodId:'paper-peek'}),call('creation_plan',{intent:'用纸片建立有层次的主体',methods:[{id:'paper-peek',purpose:'用色边区分叠放关系'}],themeEvidence:{supportedBy:['四件纸片的色彩和形态'],conflicts:[],response:'以素材形态构图'},steps:[{task:'试摆纸片',status:'in_progress'}]}));
    }
    if(turns===2){
      assert.ok(tools.some(tool=>tool.function.name==='creation_apply'));
      return answer(call('creation_apply',{protocolVersion:2,transactionId:'rich-start',baseSceneRevision:creationSceneRevision(document),operations:[{op:'text.add',id:'first-note',content:'第一层',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:40,unit:'mm'}}]}));
    }
    if(turns===3){
      assert.deepEqual(new Set(tools.map(tool=>tool.function.name)),new Set(['creation_review','creation_finish']));
      return answer(revise(messages,'缺少纸片之间的实际叠放'));
    }
    assert.ok(tools.some(tool=>tool.function.name==='creation_apply'));
    throw Error('method gate observed');
  }});
  await assert.rejects(harness.run({id:'rich-method',state}),/method gate observed/);
  const saved=await harness.state('rich-method');
  assert.equal(saved.loadedSkills[0].selection,'detail:paper-peek:0');
  assert.equal(saved.plan.methods[0].id,'paper-peek');
  assert.ok(saved.skillReferences[0].principle);
});

test('a many-material first draft cannot cover the page before its first visual check',async t=>{
  const f=await fixture(t);
  const assets=Array.from({length:8},(_,i)=>({id:'sheet-'+i,title:'纸片 '+i,kind:'paper',physicalWidthMM:35,physicalHeightMM:50}));
  const document=await createCreationDocument({draft:draft(),assets,aliases:Object.fromEntries(assets.map((asset,i)=>['m'+(i+1),asset.id]))});
  const state=initialHarnessState({document,skills:f.skills,brief:{styles:['丰富层叠']}});
  let turn=0;
  const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
    if(++turn===1)return answer(call('read_skill',{name:'paper-layering',level:'detail',methodId:'paper-peek'}),call('creation_plan',{intent:'先铺核心',methods:[{id:'paper-peek',purpose:'让底层露边'}],themeEvidence:{supportedBy:['纸片色彩'],conflicts:[],response:'按形态构图'},steps:[{task:'放置纸片',status:'in_progress'}]}));
    if(turn===2)return answer(call('creation_apply',{protocolVersion:2,transactionId:'overfull',baseSceneRevision:creationSceneRevision(document),operations:Array.from({length:5},(_,i)=>({op:'material.add',id:'item-'+i,asset:'m'+(i+1),place:{reference:'page',at:[25+i*20,50],unit:'mm'}}))}));
    assert.match(messages.at(-1).content,/首批最多摆四件/);
    throw Error('first draft limit observed');
  }});
  await assert.rejects(harness.run({id:'many-materials',state}),/first draft limit observed/);
  assert.equal((await harness.state('many-materials')).document.page.layers.length,0);
});

test('a screenshot, edit rationale and final review stay linked in the recoverable run',async t=>{
  const f=await fixture(t);let turns=0;
  const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages,tools})=>{
    assert.ok(tools.find(tool=>tool.function.name==='creation_apply').function.parameters.properties.decision);
    if(++turns===1)return answer(plan(),call('creation_apply',{...JSON.parse(add(f.document).function.arguments),decision:'素材总图显示可用空间较大，先以短标题建立阅读起点'}));
    assert.match(messages[2].content,/素材总图显示可用空间较大/);
    assert.match(messages[2].content,/visualState/);
    assert.match(messages.findLast(message=>message.role==='user'&&Array.isArray(message.content)).content[0].text,/工作空间状态：.*lastSeenTurn/);
    return answer(call('creation_finish',{review:{observations:'标题清晰，留白可供后续手写',issues:[]}}));
  }});
  const done=await harness.run({id:'visual-decision',state:f.state});
  assert.equal(done.status,'completed');assert.equal(done.visualState.page.lastSeenTurn,1);
  assert.equal(done.decisions.find(entry=>entry.kind==='creation_apply').reason,'素材总图显示可用空间较大，先以短标题建立阅读起点');
  assert.equal(done.decisions.at(-1).observations,'标题清晰，留白可供后续手写');
  assert.equal(done.decisions.at(-1).pngHash,pngHash);
  const restored=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async()=>{throw Error('completed run should not resume');}});
  assert.deepEqual((await restored.state('visual-decision')).decisions,done.decisions);
});

test('combined finish rejects unseen edits and nonempty blocking issues',async t=>{
  const f=await fixture(t);let n=0;
  const harness=createCreativeHarness({...f,checkpointer:await new JournalCheckpointSaver(f.journal).restore(),model:async({messages})=>{
    if(++n===1)return answer(plan(),add(f.document));
    const p=lastScene(messages);
    if(n===2)return answer(call('creation_finish',{review:{observations:'发现问题',issues:['文字遮挡']}}));
    if(n===3){assert.equal(JSON.parse(messages.at(-1).content).ok,false);return answer(revise(messages,'文字遮挡'),call('creation_apply',{protocolVersion:2,transactionId:'edit',baseSceneRevision:p.sceneRevision,operations:[{op:'layer.update',target:'text',content:'已修改'}]}),call('creation_finish',{review:{observations:'旧图',issues:[]}}));}
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
    const p=lastScene(messages);return answer(call('creation_finish',{review:{pngHash:p.pngHash,sceneRevision:p.sceneRevision,observations:'同版本预览',issues:[]}}));
  }});
  assert.equal((await harness.run({id:'reuse',state:f.state})).status,'completed');assert.equal(renders,1);
});

test('finish review accepts a current image hash and rejects a stale one',async t=>{
 const f=await fixture(t);let n=0;
 const harness=createCreativeHarness({...f,model:async({messages})=>{
  if(++n===1)return answer(plan(),add(f.document));
  const p=lastScene(messages);
  if(n===2)return answer(call('creation_finish',{review:{pngHash:'sha256:'+'0'.repeat(64),sceneRevision:p.sceneRevision,observations:'旧图',issues:[]}}));
  assert.match(JSON.parse(messages.at(-1).content).detail,/旧画面/);
  return answer(call('creation_finish',{review:{pngHash:p.pngHash,sceneRevision:p.sceneRevision,observations:'已核对当前图',issues:[]}}));
 }});
 assert.equal((await harness.run({id:'finish-hash',state:f.state})).status,'completed');
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
