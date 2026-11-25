import {canvasFixtureCall} from './lib/canvas-model-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {createCreativeHarness,initialHarnessState,canonicalToolRevision} from '../creative-agent/runtime/agent.mjs';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {JournalCheckpointSaver,fileCheckpointJournal} from '../creative-agent/runtime/checkpoints.mjs';
import {searchLibraryReferences,matchLibraryTemplates,templateDetails} from '../creative-agent/runtime/library.mjs';
import {createDeepSeekCreativeModel} from '../creative-agent/runtime/deepseek.mjs';
import {isManagedUnchanged} from '../src/craft-fingerprint.js';

test('the single-writer harness repairs one copied revision digit but rejects stale hashes',()=>{
 const current='sha256:'+'a'.repeat(64);
 assert.equal(canonicalToolRevision('sha256:'+'b'+'a'.repeat(63),current),current);
 assert.equal(canonicalToolRevision('sha256:'+'bb'+'a'.repeat(62),current),'sha256:'+'bb'+'a'.repeat(62));
 assert.equal(canonicalToolRevision('not-a-revision',current),'not-a-revision');
});

const call=(name,args)=>{({name,args}=canvasFixtureCall(name,args));return {id:name+'-'+Math.random().toString(36).slice(2),type:'function',function:{name,arguments:JSON.stringify(args)}};};
const answer=(...calls)=>({message:{role:'assistant',content:calls.find(c=>c.declaration)?.declaration||null,tool_calls:calls.filter(c=>!c.declaration)}});
const phase=(to,observations)=>({declaration:'阶段：'+({direction:'构思与计划',layout:'打底与构图',craft:'标题与内容',accents:'装饰与点缀',review:'最终检查'})[to]+'\n'+observations});
const plan=()=>call('creation_plan',{intent:'记录具体日常',themeEvidence:{supportedBy:['用户要求制作手帐'],conflicts:[],response:'以短文记录具体小事'},palette:{source:'纸张和标题',main:'#465D54',secondary:'#E8DFC2',relationship:'echo',distribution:'浅底深字，少量绿色呼应'},composition:{visualAnchors:'标题、正文和色块形成多处视觉锚点',layout:'标题偏上，正文穿插在底纸上',connector:'绿色小点连接'},writingZones:[{role:'title',surface:'page',anchor:'左上',capacity:'short',legibility:'深字浅底'},{role:'body',surface:'page',anchor:'中下',capacity:'medium',legibility:'浅底'}],steps:[{task:'构图',status:'in_progress'}]});
const edit=(revision,transactionId,operations)=>call('creation_apply',{protocolVersion:2,transactionId,baseSceneRevision:revision,operations});
const text=(id,content,at)=>({op:'text.add',id,content,size:{width:55,unit:'mm'},place:{reference:'page',at,unit:'mm'},style:{fontSizePt:id==='title'?20:11}});
const previewOf=messages=>{
  const entry=messages.findLast(message=>message.role==='user'&&Array.isArray(message.content)&&message.content[0]?.text?.startsWith('当前真实画面：'));
  if(entry)return JSON.parse(entry.content[0].text.split('\n')[0].slice('当前真实画面：'.length));
  const summary=messages.findLast(message=>message.role==='user'&&typeof message.content==='string'&&message.content.startsWith('当前创作状态'));
  return summary&&JSON.parse(summary.content.slice(summary.content.indexOf('：')+1)).preview;
};
async function fixture(t,model,{clock,afterRender,reasoningPolicy}={}){
  const dir=await mkdtemp(join(tmpdir(),'shiye-new-harness-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const document=await createCreationDocument({draft:draft(),assets:[]}),skills=await loadCreationSkills();
  const state=initialHarnessState({document,skills,brief:{style:'丰富层叠',intent:'写一页周末记录'}});
  const checkpointer=await new JournalCheckpointSaver(fileCheckpointJournal(join(dir,'checkpoint.jsonl'))).restore();
  let renders=0;
  const harness=createCreativeHarness({skills,checkpointer,clock,reasoningPolicy,render:async doc=>{const result={pngHash:'sha256:'+String(++renders).padStart(64,'a'),sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA=='};afterRender?.(renders);return result;},model});
  return {harness,state,document,renders:()=>renders};
}

test('reference lookup exposes sourced templates only as layout guidance',async()=>{
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const templates=searchLibraryReferences(document,{kind:'templates',limit:3}).results;
  assert.ok(templates.length>0);
  assert.ok(templates.every(row=>row.kind==='template'&&row.source?.id&&row.readWith.tool==='read_template'));
  const first=templateDetails(templates[0].id);
  assert.equal(first.available,true);
  assert.ok(first.slots?.every(slot=>slot.role&&slot.box.length===4));
});

test('a concise direction plan accepts an exploratory skill name without extra required fields',async t=>{
  let turn=0;const f=await fixture(t,async()=>{
    if(++turn===1)return answer(call('creation_plan',{intent:'用蓝灰纸承托两件素材，留出短文区域',methods:[{id:'paper-layering',purpose:'考虑叠层'}],writingZones:[{role:'title',surface:'跨原页与纹样纸的空边',legibility:'两侧均为深字浅底'}]}));
    throw Error('stop after direction');
  });
  await assert.rejects(f.harness.run({id:'concise-plan',state:f.state}),/stop after direction/);
  const saved=await f.harness.state('concise-plan');
  assert.equal(saved.phase,'direction');
  assert.equal(saved.plan.intent,'用蓝灰纸承托两件素材，留出短文区域');
  assert.equal(saved.plan.methods[0].id,'paper-layering');
  assert.equal(saved.plan.writingZones[0].surface,'跨原页与纹样纸的空边');
});

test('LangGraph asks for a shorter corrected call after malformed model JSON',async t=>{
  let turn=0;const f=await fixture(t,async({messages})=>{
    if(++turn===1)return answer({id:'broken',type:'function',function:{name:'creation_plan',arguments:'{"intent":"unfinished" trailing'}});
    if(turn===2){
      assert.ok(messages.some(message=>message.role==='tool'&&String(message.content).includes('工具参数不是完整的 JSON')));
      assert.ok(messages.some(message=>message.role==='tool'&&String(message.content).includes('数组用 ]、对象用 }')));
      assert.ok(messages.some(message=>message.role==='assistant'&&message.tool_calls?.some(call=>call.id==='broken')));
      return answer(call('creation_plan',{intent:'在浅色纸面写一页短文'}));
    }
    throw Error('stop after corrected call');
  });
  await assert.rejects(f.harness.run({id:'malformed-call',state:f.state}),/stop after corrected call/);
  const saved=await f.harness.state('malformed-call');
  assert.equal(saved.plan.intent,'在浅色纸面写一页短文');
  assert.ok(saved.trace.some(event=>event.kind==='tool'&&event.name==='creation_plan'&&!event.ok));
});

test('methods learned from Skills execute together with the same methodId field',async t=>{
  let turn=0;const f=await fixture(t,async()=>{
    if(++turn===1)return answer(call('creation_plan',{intent:'用一枚星芒连接标题和正文'}));
    if(turn===2)return answer(call('creation_recipe',{methodId:'graphic-loop',transactionId:'method-id-star',baseSceneRevision:creationSceneRevision(f.document),parameters:{id:'star',place:{at:[72,88],unit:'mm',reference:'page'},size:{width:12,height:12,unit:'mm'},colors:['#D5A45B']},with:[{methodId:'graphic-loop',parameters:{id:'star-small',place:{at:[94,102],unit:'mm',reference:'page'},size:{width:7,height:7,unit:'mm'},colors:['#8AACC3']}}]}));
    throw Error('stop after recipe');
  });
  await assert.rejects(f.harness.run({id:'method-id-recipe',state:f.state}),/stop after recipe/);
  const saved=await f.harness.state('method-id-recipe');
  assert.ok(saved.document.page.layers.some(layer=>layer.id==='star'));
  assert.ok(saved.document.page.layers.some(layer=>layer.id==='star-small'));
  assert.ok(saved.trace.some(event=>event.kind==='tool'&&event.name==='creation_recipe'&&event.ok));
});

test('read_skill returns a directly usable method example with the current Scene revision',async t=>{
  let turn=0;const f=await fixture(t,async({messages})=>{
    if(++turn===1)return answer(call('creation_plan',{intent:'用手绘星芒点缀空白'}));
    if(turn===2)return answer(call('read_skill',{name:'journal-graphics',level:'detail',methodId:'graphic-loop'}));
    if(turn===3){
      const result=JSON.parse(messages.findLast(message=>message.role==='tool').content);
      assert.equal(result.ok,true);
      const args=result.data.methods[0].tool.arguments;
      assert.equal(args.methodId,'graphic-loop');
      assert.equal(args.baseSceneRevision,creationSceneRevision(f.document));
      assert.match(args.transactionId,/^skill-/);
      return answer(call('creation_recipe',args));
    }
    throw Error('stop after Skill example');
  });
  await assert.rejects(f.harness.run({id:'skill-example',state:f.state}),/stop after Skill example/);
  const saved=await f.harness.state('skill-example');
  assert.ok(saved.document.page.layers.some(layer=>layer.id==='demo'));
});

test('elapsed time does not hide search or editing tools',async t=>{
  let now=0,turn=0;const f=await fixture(t,async({messages,tools})=>{
    turn++;const p=previewOf(messages);
    if(turn===1)return answer(plan());
    if(turn===2)return answer(edit(creationSceneRevision(f.document),'layout-a',[text('title','夏日手帐',[35,30])]));
    if(turn===3)return answer(edit(p.sceneRevision,'layout-b',[text('note','在路上',[42,75])]));
    if(turn===4){
      assert.ok(tools.some(tool=>tool.function.name==='creation_apply'));
      assert.ok(tools.some(tool=>tool.function.name==='knowledge'));
      assert.ok(tools.some(tool=>tool.function.name==='knowledge'));
      return answer(phase('craft','标题和短句已建立两个区域，装饰书写继续补齐'));
    }
    throw Error('paced stop');
  },{clock:()=>now,afterRender:count=>{if(count===2)now=250000;}});
  f.state.startedAt=0;f.state.deadlineAt=570000;
  await assert.rejects(f.harness.run({id:'paced-layout',state:f.state}),/paced stop/);
  const saved=await f.harness.state('paced-layout');
  assert.equal(saved.phase,'craft');
  assert.deepEqual(saved.results.map(result=>result.ok),[]);
  assert.ok(!saved.document.page.layers.some(layer=>layer.id==='late'));
});

test('the delivery window leaves editing and skill lookup available',async t=>{
 let now=0,turn=0;const f=await fixture(t,async({messages,tools})=>{
  turn++;const p=previewOf(messages);
  if(turn===1)return answer(plan());
  if(turn===2)return answer(edit(creationSceneRevision(f.document),'delivery-page',[text('title','一页小记',[35,30])]));
  if(turn===3){
   assert.ok(tools.some(tool=>tool.function.name==='creation_apply'));
   assert.ok(tools.some(tool=>tool.function.name==='knowledge'));
   return answer(edit(p.sceneRevision,'delivery-repair',[text('body','把今天的小事认真记下来。',[45,85])]));
  }
  assert.ok(tools.some(tool=>tool.function.name==='creation_finish'));
  return answer(call('creation_finish',{review:{observations:'标题位于纸面上方，文字清楚',issues:[],pngHash:p.pngHash,sceneRevision:p.sceneRevision}}));
 },{clock:()=>now,afterRender:()=>{now=320000;}});
 f.state.startedAt=0;f.state.deadlineAt=570000;
 const result=await f.harness.run({id:'delivery-window',state:f.state});
 assert.equal(result.status,'completed');
});

test('review pacing presents finish after five further edits',async t=>{
  let turn=0;const f=await fixture(t,async({messages,tools})=>{
    turn++;const p=previewOf(messages);
    if(turn===1)return answer(plan());
    if(turn===2)return answer(edit(creationSceneRevision(f.document),'review-layout',[text('title','记一页',[35,30])]));
    if(turn===3)return answer(phase('craft','标题构成左上视觉入口，正文区域留在下方'));
    if(turn===4)return answer(edit(p.sceneRevision,'review-craft',[text('body','下午茶和窗边的风。',[45,75])]));
    if(turn===5)return answer(phase('review','标题与正文形成可读的图文层级'));
    if(turn<=10)return answer(edit(p.sceneRevision,'review-edit-'+turn,[text('accent-'+turn,'小记',[35+turn,100+turn*3])]));
    assert.ok(tools.some(tool=>tool.function.name==='creation_finish'));
    assert.ok(tools.some(tool=>tool.function.name==='creation_apply'));
    return answer(call('creation_finish',{review:{observations:'标题、正文和多处边注分布在纸面，文字层级清楚',issues:[]}}));
  });
  const result=await f.harness.run({id:'paced-finish',state:f.state});
  assert.equal(result.status,'completed');
  assert.equal(result.turns,11);
});

test('a complete page can finish without mandatory phase transitions',async t=>{
  let turn=0;const f=await fixture(t,async({messages,tools})=>{
    turn++;const p=previewOf(messages);
    if(turn===1)return answer(plan());
    if(turn===2){assert.ok(tools.some(tool=>tool.function.name==='creation_finish'));return answer(edit(creationSceneRevision(f.document),'whole-page',[
      text('title','周末手记',[35,30]),text('body','午后的小雨落在窗沿，我把散开的纸片重新收好。',[45,85])
    ]));}
    return answer(call('creation_finish',{review:{observations:'标题在上方，正文位于下方的可读区域，留出纸边',issues:[],pngHash:p.pngHash,sceneRevision:p.sceneRevision}}));
  });
  const result=await f.harness.run({id:'no-required-phases',state:f.state});
  assert.equal(result.status,'completed');
  assert.deepEqual(result.phaseReviews.map(item=>item.to),[]);
});

test('an off-page text placement is translated before its transaction receipt is returned',async t=>{
  let turn=0;const f=await fixture(t,async({messages})=>{
    turn++;
    if(turn===1)return answer(plan());
    if(turn===2)return answer(edit(creationSceneRevision(f.document),'snapped-title',[text('title','周末手记',[0,32])]));
    throw Error('stop after snapped preview');
  });
  await assert.rejects(f.harness.run({id:'snapped-title',state:f.state}),/stop after snapped preview/);
  const saved=await f.harness.state('snapped-title');
  const receipt=saved.document.v3Transactions['snapped-title'];
  assert.equal(receipt.sceneRevision,creationSceneRevision(saved.document));
  assert.ok(saved.messages.some(message=>message.role==='tool'&&message.content.includes('layoutCorrections')));
  assert.equal(isManagedUnchanged(saved.document.page.layers.find(layer=>layer.id==='title')),true);
  assert.ok(saved.results[0]?.ok||saved.qualityFrames.length===1);
  assert.equal(saved.qualityFrames.length,1);
});

test('rich layered spreads rank a layered reference above sparse diary cases',async()=>{
  const document=await createCreationDocument({draft:draft({mode:'spread'}),assets:[]});
  document.source.styles=['丰富层叠'];
  const cases=searchLibraryReferences(document,{kind:'cases',limit:3}).results;
  assert.equal(cases[0].id,'user-layered-spread');
  assert.ok(cases.every(item=>item.why.pageMode==='spread'));
});

test('wrong source labels do not change the creative case and template shortlist',async()=>{
  const asset={id:'sample',title:'同一素材',kind:'sticker',role:'focal',physicalWidthMM:40,physicalHeightMM:55};
  const original=await createCreationDocument({draft:draft({mode:'spread'}),assets:[asset],aliases:{m1:asset.id}});
  const misleading=structuredClone(original);
  Object.assign(misleading.source.sourceSnapshots[0],{kind:'paper',role:'background',tags:['旅行','复古','标题'],journalRoles:['headline']});
  const cases=document=>searchLibraryReferences(document,{kind:'cases',limit:5}).results.map(({id,score})=>({id,score}));
  assert.deepEqual(cases(original),cases(misleading));
  const templates=document=>matchLibraryTemplates(document,{limit:5}).map(({id,score})=>({id,score}));
  assert.deepEqual(templates(original),templates(misleading));
});

test('model stage declarations do not require previous stages to pass',async t=>{
  let turn=0;const f=await fixture(t,async()=>{
    turn++;
    if(turn===1)return answer(phase('layout','没有实际计划也想进入布局'));
    if(turn===2)return answer(plan(),phase('review','想跳过布局和书写'));
    if(turn===3)return answer(phase('craft','仍有构图问题未解决',['颜色未决定']));
    throw Error('intentional stop');
  });
  await assert.rejects(f.harness.run({id:'invalid-stage',state:f.state}),/intentional stop/);
  const saved=await f.harness.state('invalid-stage');
  assert.equal(saved.phase,'craft');
  assert.deepEqual(saved.results.map(item=>item.ok),[]);
  assert.equal(saved.plan.intent,'记录具体日常');
});

test('stage-specific guidance arrives when needed and repeated edits need no separate review',async t=>{
  let turn=0;const instructions=[];const f=await fixture(t,async({messages,tools,reasoningEffort})=>{
    turn++;instructions.push(messages.filter(m=>m.role==='user'&&typeof m.content==='string'&&!m.content.startsWith('当前创作状态')).map(m=>m.content).join('\n'));
    assert.equal(messages.filter(m=>m.role==='system').length,1,'only the fixed system prompt precedes history');
    const p=previewOf(messages),names=tools.map(item=>item.function.name);
    if(turn===1){assert.equal(reasoningEffort,'low');assert.ok(names.includes('creation_apply'));return answer(plan(),phase('layout','素材主题与配色已经明确，采用多锚点布局'));}
    if(turn===2){
      assert.ok(names.includes('knowledge'),'参考读取工具从首轮可用，不依赖查询或阶段');
      const title={...text('title','周末小记',[45,40]),place:{reference:'page',at:[45,40],unit:'mm'}};
      title.style.letterSpacingMm=.53;title.style.textAlign='center';title.place.rotationDeg=2;
      return answer(edit(creationSceneRevision(f.document),'first',[
        {op:'graphic.add',id:'paper',geometry:{kind:'rect'},place:{reference:'page',at:[40,35],unit:'mm'},size:{width:50,height:20,unit:'mm'},style:{fill:'#F7F0E3'}},
        {op:'graphic.add',id:'paper-accent',geometry:{kind:'rect'},place:{reference:'page',at:[50,50],unit:'mm'},size:{width:4,height:4,unit:'mm'},style:{fill:'#465D54'}},title
      ]));
    }
    if(turn===3){assert.equal(reasoningEffort,'low');assert.ok(names.includes('creation_apply'));return answer(edit(p.sceneRevision,'second',[text('note','雨后的第一杯茶',[48,70])]));}
    if(turn===4)return answer(phase('craft','两处文字形成基础结构，还有空间可加手写点缀'));
    if(turn===5)return answer(edit(p.sceneRevision,'third',[text('body','把潮湿的风留在这一页。',[45,100])]));
    if(turn===6){assert.equal(reasoningEffort,'low');return answer(phase('review','三段文字层级清楚，纸面有内容和节奏'));}
    return answer(call('creation_finish',{review:{observations:'标题、边注和正文分布在三个位置，文字清晰',issues:[]}}));
  });
  const result=await f.harness.run({id:'stage-guidance',state:f.state});
  assert.equal(result.status,'completed');
  assert.ok(result.trace.some(item=>item.kind==='model'&&item.phase==='craft'));
  assert.ok(result.trace.some(item=>item.kind==='model'&&item.phase==='review'));
  assert.ok(!instructions[0].includes('表达方法卡'));
  assert.ok(instructions.some(text=>text.includes('表达方法卡候选')),'the stable prompt keeps creative techniques available');
  assert.ok(instructions.every(text=>!text.includes('当前关注：')),'stage cues belong only to the replaceable snapshot tail');
  assert.equal(f.renders(),3);
});

test('finish refuses an old screenshot hash and then accepts the current revision',async t=>{
  let turn=0;const f=await fixture(t,async({messages})=>{
    turn++;const p=previewOf(messages);
    if(turn===1)return answer(plan(),phase('layout','主题配色及多锚点布局已决定'));
    if(turn===2)return answer(edit(creationSceneRevision(f.document),'layout',[text('title','一页记录',[50,45])]));
    if(turn===3)return answer(phase('craft','标题已形成构图，正文位置仍可用'));
    if(turn===4)return answer(edit(p.sceneRevision,'craft',[text('body','今天终于等到一场雨。',[50,85])]));
    if(turn===5)return answer(phase('review','标题和正文构成可读的两层内容'));
    if(turn===6)return answer(call('creation_finish',{review:{observations:'已看标题和正文的当前图',issues:[],pngHash:'sha256:'+'0'.repeat(64)}}));
    return answer(call('creation_finish',{review:{observations:'标题和正文清楚，层次与颜色协调',issues:[],pngHash:p.pngHash,sceneRevision:p.sceneRevision}}));
  });
  const result=await f.harness.run({id:'stale-review',state:f.state});
  assert.equal(result.status,'completed');
  assert.equal(result.review.pngHash,result.preview.pngHash);
  assert.ok(result.trace.some(item=>item.name==='creation_finish'&&item.ok===false));
});

test('layout remains editable after four previews and the unified ordering and workspace fields work in craft',async t=>{
  let turn=0;const f=await fixture(t,async({messages,tools})=>{
    turn++;const p=previewOf(messages),names=tools.map(item=>item.function.name);
    if(turn===1)return answer(plan());
    if(turn>=2&&turn<=5)return answer(edit(p?.sceneRevision||creationSceneRevision(f.document),'pass-'+turn,[text('note-'+turn,'第 '+turn+' 段文字',[40,20+turn*14])]));
    if(turn===6){assert.ok(names.includes('creation_apply'));return answer(phase('craft','四版构图已建立文字阅读路线，细节交由下一阶段'));}
    if(turn===7){assert.ok(names.includes('creation_apply'));return answer(edit(p.sceneRevision,'craft-order',[{op:'layer.update',target:'note-2',order:{after:'note-3'}},{...text('tray-note','暂存的标题',[30,30]),place:{reference:'page',surface:'tray',at:[30,30],unit:'mm'}},text('body','今天写下一段新的记录。',[65,105]),{op:'graphic.add',id:'backing-paper',geometry:{kind:'rect'},size:{width:18,height:12,unit:'mm'},place:{reference:'page',at:[25,110],unit:'mm'},style:{fill:'#FBF6EC'}}]));}
    if(turn===8)return answer(phase('review','纸面文字与暂存对象各在正确空间，层序已调整'));
    return answer(call('creation_finish',{review:{observations:'纸面四段文字可读，暂存标题没有进入纸面',issues:[]}}));
  });
  const result=await f.harness.run({id:'layout-handoff',state:f.state});
  assert.equal(result.status,'completed');
  assert.equal(result.qualityFrames.length,5);
  assert.ok(result.qualityFrames.some(frame=>frame.phase==='craft'));
  assert.ok(!result.qualityFrames.some(frame=>frame.phase==='accents'));
  assert.equal(result.phase,'review');
  assert.ok(result.trace.some(item=>item.name==='creation_apply'&&item.turn===7&&item.ok));
});

test('a timed-out DeepSeek call retries without repeating long reasoning after a timeout',async()=>{
  const bodies=[];
  const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async(_url,options)=>{
    bodies.push(JSON.parse(options.body));
    if(bodies.length===1)throw Object.assign(Error('timeout'),{code:23});
    return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'继续创作'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200});
  }});
  const result=await model({messages:[{role:'user',content:'测试'}],tools:[],remainingMs:60000});
  assert.equal(result.message.content,'继续创作');
  assert.equal(bodies.length,2);
  assert.equal(bodies[1].thinking.type,'disabled');
  assert.equal(bodies[1].max_tokens,16000);
});

test('a timeout while reading a DeepSeek response body retries without reasoning',async()=>{
  const bodies=[];
  const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async(_url,options)=>{
    bodies.push(JSON.parse(options.body));
    if(bodies.length===1)return {status:200,ok:true,json:async()=>{throw Object.assign(Error('body stalled'),{name:'TimeoutError',code:23});}};
    return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'继续创作'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200});
  }});
  const result=await model({messages:[{role:'user',content:'测试'}],tools:[],remainingMs:60000});
  assert.equal(result.message.content,'继续创作');
  assert.equal(bodies.length,2);
  assert.equal(bodies[1].thinking.type,'disabled');
});

test('malformed model response JSON retries instead of ending the creative job',async()=>{
  let calls=0;
  const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async()=>{
    calls++;
    if(calls===1)return new Response('{"choices":[]} trailing bytes',{status:200});
    return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'继续创作'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200});
  }});
  const result=await model({messages:[{role:'user',content:'测试'}],tools:[],remainingMs:60000});
  assert.equal(result.message.content,'继续创作');
  assert.equal(calls,2);
});

test('an explicit non-thinking request remains available for auxiliary calls',async()=>{
 let request;
 const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async(_url,options)=>{
   request=JSON.parse(options.body);
   return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[]},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200});
 }});
 await model({messages:[{role:'user',content:'调整刚才画面'}],tools:[],reasoningEffort:'none',remainingMs:60000});
 assert.equal(request.thinking.type,'disabled');
 assert.equal(request.reasoning_effort,undefined);
 assert.equal(request.max_tokens,16000);
});

test('a truncated creative answer retains requested thinking and the provider output allowance',async()=>{
 let request;
 const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async(_url,options)=>{
   request=JSON.parse(options.body);
   return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[]},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200});
 }});
 await model({messages:[{role:'user',content:'只提交计划'}],tools:[],recoveringFromTruncation:true,remainingMs:60000});
 assert.equal(request.thinking.type,'enabled');
 assert.equal(request.reasoning_effort,'high');
 assert.equal(Object.hasOwn(request,'max_tokens'),false);
});

test('independent visual critique uses a short non-thinking image call',async()=>{
  let request;
  const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async(_url,options)=>{
    request=JSON.parse(options.body);
    return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'{"blockingIssues":["右页正文被遮挡"],"notes":["配色可再统一"]}'},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:30}}),{status:200});
  }});
  const result=await model.critique({imageURL:'data:image/png;base64,dGVzdA==',phase:'review',style:'丰富层叠',pageMode:'single',visibleMaterials:[{alias:'asset_card',title:'蓝色卡片'}],visibleTexts:[{id:'closing',text:'捡起来的东西，不必都分类。',centerMm:[50,100]}],remainingMs:30000});
  assert.equal(request.thinking.type,'disabled');
  assert.equal(request.max_tokens,1600);
  assert.ok(request.messages[1].content.some(part=>part.type==='image_url'));
  assert.match(request.messages[1].content[0].text,/蓝色卡片/);
  assert.match(request.messages[1].content[0].text,/捡起来的东西，不必都分类。/);
  assert.match(request.messages[0].content,/单页不要假设有中缝/);
  assert.doesNotMatch(request.messages[0].content,/重要内容越界\/跨中缝/);
  assert.deepEqual(result.blockingIssues,['右页正文被遮挡']);
  assert.deepEqual(result.notes,['配色可再统一']);
  await model.critique({imageURL:'data:image/png;base64,dGVzdA==',phase:'review',style:'丰富层叠',pageMode:'spread',remainingMs:30000});
  assert.match(request.messages[0].content,/双页还要比较左右总重量和中缝/);
  await model.critique({imageURL:'data:image/png;base64,dGVzdA==',phase:'review',style:'童趣可爱、疏朗留白',textMode:'none',remainingMs:30000});
  assert.match(request.messages[0].content,/本次画面疏密为疏朗留白/);
  assert.match(request.messages[0].content,/本次不新增文字/);
  assert.doesNotMatch(request.messages[0].content,/本次画面疏密为丰富层叠/);
  await model.critique({imageURL:'data:image/png;base64,dGVzdA==',phase:'review',style:'清新淡雅、丰富层叠',textMode:'minimal',remainingMs:30000});
  assert.match(request.messages[0].content,/本次画面疏密为丰富层叠/);
  assert.doesNotMatch(request.messages[0].content,/本次不新增文字/);
});

test('a finish near the deadline cannot silently bypass independent review',async t=>{
  let now=0,turn=0,critiques=0;
  const model=async()=>{
    turn++;
    if(turn===1)return answer(plan());
    if(turn===2)return answer(edit(creationSceneRevision(f.document),'deadline-page',[
      text('title','冬日手记',[35,30]),text('body','走出门后才发现风很轻，路边还有一片未融的雪。',[45,85])
    ]));
    if(turn===3)return answer(call('creation_finish',{review:{observations:'标题与正文都已写入，画面可读',issues:[]}}));
    throw Error('stop after rejected finish');
  };
  model.critique=async()=>{critiques++;return {blockingIssues:[],notes:[]};};
  const f=await fixture(t,model,{clock:()=>now,afterRender:()=>{now=562000;}});
  f.state.startedAt=0;f.state.deadlineAt=570000;
  await assert.rejects(f.harness.run({id:'deadline-review',state:f.state}),/stop after rejected finish/);
  const saved=await f.harness.state('deadline-review');
  assert.equal(saved.status,'running');
  assert.equal(critiques,0);
  assert.match(saved.results[0].detail,/独立画面审查尚未完成/);
});

test('DeepSeek gives deep reasoning more time while respecting the remaining task deadline',async t=>{
 const timeouts=[];
 t.mock.method(AbortSignal,'timeout',ms=>{timeouts.push(ms);return new AbortController().signal;});
 const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async()=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'继续'},finish_reason:'stop'}]}),{status:200})});
 await model({messages:[],tools:[],remainingMs:300000,reasoningEffort:'high'});
 await model({messages:[],tools:[],remainingMs:300000,reasoningEffort:'low'});
 await model({messages:[],tools:[],remainingMs:20000,reasoningEffort:'high'});
 assert.ok(timeouts[0]<=300000&&timeouts[0]>299000);assert.equal(timeouts[1],90000);assert.ok(timeouts[2]<=20000&&timeouts[2]>19000);
});


test('dedicated paper tool requires a plan, commits editable papers and undoes the batch',async t=>{
 let turn=0;const args=()=>({transactionId:'paper-tool',baseSceneRevision:creationSceneRevision(f.document),papers:[{id:'fibrous',style:{fill:'#E8DFC2'},texture:'medium',edge:{style:'torn',seed:42},place:{reference:'page',at:[50,60],unit:'mm'},size:{width:55,height:65,unit:'mm'},order:{edge:'back'}}]});
 const f=await fixture(t,async()=>{
  if(++turn===1)return answer(call('creation_paper',args()));
  if(turn===2)return answer(plan(),call('creation_paper',args()));
  if(turn===3){const saved=await f.harness.state('paper-entry');assert.equal(saved.document.page.layers[0].kind,'paper');return answer(call('creation_undo',{}));}
  throw Error('stop after paper undo');
 });
 await assert.rejects(f.harness.run({id:'paper-entry',state:f.state}),/stop after paper undo/);
 const saved=await f.harness.state('paper-entry');
 assert.equal(saved.document.page.layers.length,0);
 const events=saved.trace.filter(e=>e.kind==='tool'&&e.name==='creation_apply');
 assert.equal(events[0].ok,false);assert.equal(events[1].ok,true);
});

test('dedicated title tool requires a plan, commits editable title groups and undoes the batch',async t=>{
 let turn=0;const args=()=>({transactionId:'title-tool',baseSceneRevision:creationSceneRevision(f.document),titles:[{id:'heading',content:'慢慢生活',layout:'plain',effect:'outline',size:{width:70,unit:'mm'},style:{fontSizePt:20,color:'#354A55',outline:{color:'#FFFFFF',widthMm:.3}},backdrop:{kind:'dots'},place:{reference:'page',at:[50,40],unit:'mm'},order:{edge:'front'}}]});
 const f=await fixture(t,async()=>{
  if(++turn===1)return answer(call('creation_title',args()));
  if(turn===2)return answer(plan(),call('creation_title',args()));
  if(turn===3){const saved=await f.harness.state('title-entry');assert.equal(saved.document.page.layers[0].type,'group');return answer(call('creation_undo',{}));}
  throw Error('stop after title undo');
 });
 await assert.rejects(f.harness.run({id:'title-entry',state:f.state}),/stop after title undo/);
 const saved=await f.harness.state('title-entry');
 assert.equal(saved.document.page.layers.length,0);
 const events=saved.trace.filter(e=>e.kind==='tool'&&e.name==='creation_apply');
 assert.equal(events[0].ok,false);assert.equal(events[1].ok,true);
});


for(const shortVersion of [false,true])test(`mixed tool batches isolate failures and preserve layering (${shortVersion?'current':'hash'})`,async t=>{
 let turn=0;const f=await fixture(t,async()=>{
  if(++turn===1)return answer(plan());
  if(turn===2){const revision=shortVersion?'current':creationSceneRevision(f.document);return answer(
   {id:'malformed',type:'function',function:{name:'creation_apply',arguments:'{broken'}},
   call('read_skill',{name:'paper-layering',level:'overview'}),
   call('creation_apply',{transactionId:'body-first',baseSceneRevision:revision,operations:[text('body','今天在窗边读完了一本书，记下午后的光。',[50,65])]}),
   edit(revision,'bad-atomic',[text('rolled-back','不应留下',[40,40]),{op:'layer.delete',target:'missing'}]),
   call('read_skill',{name:'journal-accents',level:'overview'}),
   call('creation_paper',{transactionId:'backing-later',baseSceneRevision:revision,papers:[{id:'backing',place:{reference:'page',at:[50,65],unit:'mm'},size:{width:65,height:45,unit:'mm'},order:{before:'body'},style:{fill:'#E8DFC2'},texture:'subtle',edge:{style:'torn',seed:42}}]}),
   edit('sha256:'+'0'.repeat(64),'stale-rejected',[text('stale','过期',[40,40])])
  );}
  throw Error('stop mixed');
 });
 // Use an actually stale revision for the final call, while all other valid
 // edits intentionally share the scene revision observed at the turn start.
 const runModel=f.harness;
 await assert.rejects(runModel.run({id:'mixed-batch',state:f.state}),/stop mixed/);
 const saved=await f.harness.state('mixed-batch');
 assert.ok(saved.loadedSkills.some(x=>x.name==='paper-layering'));
 assert.ok(saved.loadedSkills.some(x=>x.name==='journal-accents'));
 const layers=saved.document.page.layers;
 assert.ok(layers.some(x=>x.id==='body'));
 assert.ok(layers.some(x=>x.id==='backing'));
 assert.ok(!layers.some(x=>x.id==='rolled-back'));
 assert.ok(layers.find(x=>x.id==='backing').zIndex<layers.find(x=>x.id==='body').zIndex);
 assert.ok(!layers.some(x=>x.id==='stale'));
 assert.equal(saved.results.filter(x=>!x.ok).length,3);
 assert.equal(f.renders(),1);
});


test('review request timeout does not pretend the whole creative task is near its deadline',async()=>{
 let sent;
 const model=createDeepSeekCreativeModel({key:'test-key',fetcher:async(url,options)=>{
  sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({blockingIssues:[],notes:[]})}}]}),{status:200});
 }});
 await model.critique({imageURL:'data:image/png;base64,dGVzdA==',phase:'review',style:'丰富层叠',remainingMs:25000,taskRemainingMs:240000});
 assert.doesNotMatch(sent.messages[0].content,/交付时间将至/);
 assert.match(sent.messages[0].content,/局部衬底/);
 await model.critique({imageURL:'data:image/png;base64,dGVzdA==',phase:'review',style:'丰富层叠',remainingMs:25000,taskRemainingMs:45000});
 assert.match(sent.messages[0].content,/交付时间将至/);
});


test('ordinary requests preserve stable history and refresh only the snapshot tail',async t=>{
 let turn=0,prior;const f=await fixture(t,async({messages,reasoningEffort})=>{
  const snapshot=m=>m.role==='user'&&(typeof m.content==='string'?m.content.startsWith('当前创作状态'):Array.isArray(m.content)&&m.content.some(p=>p.text?.includes('当前真实画面：')));
  if(prior)assert.deepEqual(messages.slice(0,prior.length),prior,'all history before the old snapshot must remain unchanged');
  const tail=messages.findIndex(snapshot);prior=structuredClone(tail<0?messages:messages.slice(0,tail));turn++;
  if(turn>1){const current=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('当前创作状态'));const state=JSON.parse(current.content.slice(current.content.indexOf('：')+1));assert.ok(state.scene.layers);assert.equal(state.plan.intent,'记录具体日常');assert.ok(Array.isArray(state.plan.writingZones));assert.ok(state.plan.composition);assert.ok(messages.some(m=>m.role==='assistant'&&JSON.stringify(m.tool_calls).includes('writingZones')),'original full plan remains in stable tool history');if(turn>=3){assert.match(state.notes,/当前真实画面：/);}}
  assert.equal(messages.filter(m=>typeof m.content==='string'&&m.content.startsWith('当前创作状态')).length,turn===1?0:1);
  if(turn<=2)assert.equal(reasoningEffort,'low');else assert.equal(reasoningEffort,'low');
  if(turn===1)return answer(plan());
  if(turn===2)return answer(edit(creationSceneRevision(f.document),'layout-prefix',[text('title','周末',[40,40]),text('body','午后的小雨落在窗沿，我把散开的纸片重新收好。',[45,85])]));
  if(turn===3)return answer(call('creation_help',{topics:['layer.update']}));
  return answer(call('creation_finish',{review:{observations:'文字完整可读，已检查画面',issues:[],pngHash:previewOf(messages).pngHash,sceneRevision:previewOf(messages).sceneRevision}}));
 });
 const result=await f.harness.run({id:'prefix-persistence',state:f.state});
 assert.equal(result.status,'completed');assert.equal(result.firstLayoutTurn,2);
});

test('one model turn awaits create, skill, failed call, edge cut and inspect in order',async t=>{
 let turn=0;const f=await fixture(t,async()=>{
  if(++turn===1)return answer(plan());
  if(turn===2)return answer(
   call('creation_apply',{transactionId:'ordered-create',baseSceneRevision:'current',operations:[{op:'create',kind:'paper',id:'ordered-paper',size:{width:70,height:100,unit:'mm'},style:{fill:'#CCDDEE',paperSurface:{kind:'torn'}}}]}),
   call('knowledge',{action:'skill',name:'paper-layering',level:'overview'}),
   {id:'ordered-bad',type:'function',function:{name:'creation_apply',arguments:'{broken'}},
   call('creation_apply',{transactionId:'ordered-cut',baseSceneRevision:'current',operations:[{op:'cut',method:'edge',target:'ordered-paper',edge:{style:'torn',edges:['bottom'],depthMm:1,seed:42}}]}),
   call('creation_inspect',{})
  );
  throw Error('stop ordered calls');
 });
 await assert.rejects(f.harness.run({id:'ordered-paper-tools',state:f.state}),/stop ordered calls/);
 const saved=await f.harness.state('ordered-paper-tools');
 const events=saved.trace.filter(e=>e.kind==='tool'&&e.turn===2);
 assert.deepEqual(events.map(e=>[e.name,e.ok]),[['creation_apply',true],['read_skill',true],['creation_apply',false],['creation_apply',true],['creation_inspect',true]]);
 const node=saved.document.page.layers.find(n=>n.id==='ordered-paper');assert.ok(node.vectorMask);assert.equal(node.paperSurface.kind,'torn');
 assert.ok(saved.loadedSkills.some(s=>s.name==='paper-layering'));
});
