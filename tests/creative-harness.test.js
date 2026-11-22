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
import {searchLibraryReferences,templateDetails} from '../compute-server/harness/library.mjs';
import {createDeepSeekCreativeModel} from '../compute-server/harness/deepseek.mjs';

const call=(name,args)=>({id:name+'-'+Math.random().toString(36).slice(2),type:'function',function:{name,arguments:JSON.stringify(args)}});
const answer=(...calls)=>({message:{role:'assistant',content:null,tool_calls:calls}});
const phase=(to,observations,issues=[])=>call('creation_phase',{phase:to,reason:'阶段检查',assessment:{observations,issues}});
const plan=()=>call('creation_plan',{intent:'记录具体日常',themeEvidence:{supportedBy:['用户要求制作手帐'],conflicts:[],response:'以短文记录具体小事'},palette:{source:'纸张和标题',main:'#465D54',secondary:'#E8DFC2',relationship:'echo',distribution:'浅底深字，少量绿色呼应'},composition:{visualAnchors:'标题、正文和色块形成多处视觉锚点',layout:'标题偏上，正文穿插在底纸上',connector:'绿色小点连接'},writingZones:[{role:'title',surface:'page',anchor:'左上',capacity:'short',legibility:'深字浅底'},{role:'body',surface:'page',anchor:'中下',capacity:'medium',legibility:'浅底'}],steps:[{task:'构图',status:'in_progress'}]});
const edit=(revision,transactionId,operations)=>call('creation_apply',{protocolVersion:2,transactionId,baseSceneRevision:revision,operations});
const text=(id,content,at)=>({op:'text.add',id,content,size:{width:55,unit:'mm'},place:{reference:'page',at,unit:'mm'},style:{fontSizePt:id==='title'?20:11}});
const previewOf=messages=>{
  const entry=messages.findLast(message=>message.role==='user'&&Array.isArray(message.content)&&message.content[0]?.text?.startsWith('当前真实画面：'));
  if(entry)return JSON.parse(entry.content[0].text.split('\n')[0].slice('当前真实画面：'.length));
  const summary=messages.find(message=>message.role==='user'&&typeof message.content==='string'&&message.content.startsWith('当前创作状态'));
  return summary&&JSON.parse(summary.content.slice(summary.content.indexOf('：')+1)).preview;
};
async function fixture(t,model){
  const dir=await mkdtemp(join(tmpdir(),'shiye-new-harness-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const document=await createCreationDocument({draft:draft(),assets:[]}),skills=await loadCreationSkills();
  const state=initialHarnessState({document,skills,brief:{style:'丰富层叠',intent:'写一页周末记录'}});
  const checkpointer=await new JournalCheckpointSaver(fileCheckpointJournal(join(dir,'checkpoint.jsonl'))).restore();
  let renders=0;
  const harness=createCreativeHarness({skills,checkpointer,render:async doc=>({pngHash:'sha256:'+String(++renders).padStart(64,'a'),sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA=='}),model});
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

test('rich layered spreads rank a layered reference above sparse diary cases',async()=>{
  const document=await createCreationDocument({draft:draft({mode:'spread'}),assets:[]});
  document.source.styles=['丰富层叠'];
  const cases=searchLibraryReferences(document,{kind:'cases',limit:3}).results;
  assert.equal(cases[0].id,'xhs-wishes-dessert');
  assert.ok(cases.every(item=>item.why.pageMode==='spread'));
});

test('stage transition rejects skipping, unresolved issues and empty plans',async t=>{
  let turn=0;const f=await fixture(t,async()=>{
    turn++;
    if(turn===1)return answer(phase('layout','没有实际计划也想进入布局'));
    if(turn===2)return answer(plan(),phase('review','想跳过布局和书写'));
    if(turn===3)return answer(phase('craft','仍有构图问题未解决',['颜色未决定']));
    throw Error('intentional stop');
  });
  await assert.rejects(f.harness.run({id:'invalid-stage',state:f.state}),/intentional stop/);
  const saved=await f.harness.state('invalid-stage');
  assert.equal(saved.phase,'layout');
  assert.deepEqual(saved.results.map(item=>item.ok),[false]);
  assert.equal(saved.plan.intent,'记录具体日常');
});

test('stage-specific guidance arrives when needed and repeated edits need no separate review',async t=>{
  let turn=0;const instructions=[];const f=await fixture(t,async({messages,tools,reasoningEffort})=>{
    turn++;instructions.push(messages[1].content);
    const p=previewOf(messages),names=tools.map(item=>item.function.name);
    if(turn===1){assert.equal(reasoningEffort,'none');assert.ok(!names.includes('creation_apply'));return answer(plan(),phase('layout','素材主题与配色已经明确，采用多锚点布局'));}
    if(turn===2){
      assert.ok(names.includes('read_template'));
      const title={...text('title','周末小记',[45,40]),place:{at:[45,40],unit:'mm'}};
      title.style.letterSpacing=.3;
      return answer(edit(creationSceneRevision(f.document),'first',[
        {op:'graphic.add',id:'paper',geometry:{kind:'shape',preset:'rect'},place:{at:[40,35],unit:'mm'},size:{width:50,height:20,unit:'mm'},style:{fill:'#F7F0E3'}},title
      ]));
    }
    if(turn===3){assert.ok(names.includes('creation_apply'));return answer(edit(p.sceneRevision,'second',[text('note','雨后的第一杯茶',[48,70])]));}
    if(turn===4)return answer(phase('craft','两处文字形成基础结构，还有空间可加手写点缀'));
    if(turn===5)return answer(edit(p.sceneRevision,'third',[text('body','把潮湿的风留在这一页。',[45,100])]));
    if(turn===6)return answer(phase('review','三段文字层级清楚，纸面有内容和节奏'));
    return answer(call('creation_finish',{review:{observations:'标题、边注和正文分布在三个位置，文字清晰',issues:[]}}));
  });
  const result=await f.harness.run({id:'stage-guidance',state:f.state});
  assert.equal(result.status,'completed');
  assert.deepEqual(result.phaseReviews.map(item=>item.to),['layout','craft','review']);
  assert.ok(!instructions[0].includes('本阶段表达方法卡'));
  assert.ok(instructions[1].includes('匹配案例和轻量模板'));
  assert.ok(instructions[4].includes('本阶段表达方法卡'));
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

test('layout remains editable after four previews and common ordering aliases work in craft',async t=>{
  let turn=0;const f=await fixture(t,async({messages,tools})=>{
    turn++;const p=previewOf(messages),names=tools.map(item=>item.function.name);
    if(turn===1)return answer(plan());
    if(turn>=2&&turn<=5)return answer(edit(p?.sceneRevision||creationSceneRevision(f.document),'pass-'+turn,[text('note-'+turn,'第 '+turn+' 段文字',[40,20+turn*14])]));
    if(turn===6){assert.ok(names.includes('creation_apply'));return answer(phase('craft','四版构图已建立文字阅读路线，细节交由下一阶段'));}
    if(turn===7){assert.ok(names.includes('creation_apply'));return answer(edit(p.sceneRevision,'craft-order',[{op:'order',target:'note-2',after:'note-3'},{...text('tray-note','暂存的标题',[30,30]),place:{reference:'tray',at:[30,30],unit:'mm'}},{op:'graphic.add',id:'backing-paper',geometry:{kind:'rect',options:{radius:0.02}},size:{width:18,height:12,unit:'mm'},place:{reference:'page',at:[25,110],unit:'mm'},style:{fill:'#FBF6EC',shadow:{offsetMm:[1,1],blurMm:2,color:'#00000022'}}}]));}
    if(turn===8)return answer(phase('review','纸面文字与暂存对象各在正确空间，层序已调整'));
    return answer(call('creation_finish',{review:{observations:'纸面四段文字可读，暂存标题没有进入纸面',issues:[]}}));
  });
  const result=await f.harness.run({id:'layout-handoff',state:f.state});
  assert.equal(result.status,'completed');
  assert.equal(result.qualityFrames.filter(frame=>frame.phase==='layout').length,4);
  assert.equal(result.qualityFrames.filter(frame=>frame.phase==='craft').length,1);
  assert.ok(result.trace.some(item=>item.name==='creation_apply'&&item.turn===7&&item.ok));
});

test('a timed-out DeepSeek call retries once with a smaller low-effort response budget',async()=>{
  const bodies=[];
  const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async(_url,options)=>{
    bodies.push(JSON.parse(options.body));
    if(bodies.length===1)throw Object.assign(Error('timeout'),{code:23});
    return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'继续创作'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200});
  }});
  const result=await model({messages:[{role:'user',content:'测试'}],tools:[],remainingMs:60000});
  assert.equal(result.message.content,'继续创作');
  assert.equal(bodies.length,2);
  assert.equal(bodies[1].reasoning_effort,'low');
  assert.equal(bodies[1].max_tokens,8000);
});

test('routine visual adjustments use bounded non-thinking tool calls',async()=>{
 let request;
 const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async(_url,options)=>{
   request=JSON.parse(options.body);
   return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[]},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200});
 }});
 await model({messages:[{role:'user',content:'调整刚才画面'}],tools:[],reasoningEffort:'none',remainingMs:60000});
 assert.equal(request.thinking.type,'disabled');
 assert.equal(request.reasoning_effort,undefined);
 assert.equal(request.max_tokens,5000);
});

test('a truncated creative answer recovers with one bounded non-thinking call',async()=>{
 let request;
 const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async(_url,options)=>{
   request=JSON.parse(options.body);
   return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[]},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200});
 }});
 await model({messages:[{role:'user',content:'只提交计划'}],tools:[],recoveringFromTruncation:true,remainingMs:60000});
 assert.equal(request.thinking.type,'disabled');
 assert.equal(request.max_tokens,5000);
});

test('independent visual critique uses a short non-thinking image call',async()=>{
  let request;
  const model=createDeepSeekCreativeModel({key:'test-only',fetcher:async(_url,options)=>{
    request=JSON.parse(options.body);
    return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'{"blockingIssues":["右页正文被遮挡"],"notes":["配色可再统一"]}'},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:30}}),{status:200});
  }});
  const result=await model.critique({imageURL:'data:image/png;base64,dGVzdA==',phase:'review',style:'丰富层叠',remainingMs:30000});
  assert.equal(request.thinking.type,'disabled');
  assert.equal(request.max_tokens,1600);
  assert.ok(request.messages[1].content.some(part=>part.type==='image_url'));
  assert.deepEqual(result.blockingIssues,['右页正文被遮挡']);
  assert.deepEqual(result.notes,['配色可再统一']);
});
