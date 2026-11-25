import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {initialHarnessState} from '../creative-agent/runtime/agent.mjs';
import {createPiCreativeHarness} from '../creative-agent/runtime/pi-agent.mjs';
import {canvasFixtureCall} from './lib/canvas-model-fixtures.js';

const call=(name,args)=>{({name,args}=canvasFixtureCall(name,args));return {id:'call-'+name+'-'+Math.random().toString(36).slice(2),type:'function',function:{name,arguments:JSON.stringify(args)}};};
const plan=()=>call('creation_plan',{intent:'周末小记',themeEvidence:{supportedBy:['用户要求创作手帐'],conflicts:[],response:'写一段普通周末记录'},palette:{source:'纸面',main:'#465D54',secondary:'#E8DFC2',relationship:'echo',distribution:'浅底深字'},composition:{visualAnchors:'标题和短文',layout:'上方标题，下方短文',connector:'一条细线'},writingZones:[{role:'title',surface:'page',anchor:'左上',capacity:'short',legibility:'浅底深字'},{role:'body',surface:'page',anchor:'中下',capacity:'medium',legibility:'浅底深字'}],steps:[{task:'排版',status:'in_progress'}]});

test('Pi loop executes the existing scene tools and completes from a real preview',async()=>{
  const document=await createCreationDocument({draft:draft(),assets:[],prompt:'写一页周末手帐'}),skills=await loadCreationSkills();
  const initial=initialHarnessState({document,skills,brief:{style:'清新淡雅',intent:'写一页周末手帐'}});
  let currentRevision=creationSceneRevision(document),preview=null,turn=0,renders=0;
  const model=async({messages})=>{
    turn++;let tool;
    if(turn===1)tool=plan();
    else if(turn===2)tool=call('creation_apply',{protocolVersion:2,transactionId:'pi-smoke',baseSceneRevision:currentRevision,operations:[
      {op:'text.add',id:'title',content:'周末小记',size:{width:55,unit:'mm'},place:{reference:'page',at:[35,30],unit:'mm'},style:{fontSizePt:20}},
      {op:'text.add',id:'body',content:'午后的风从窗边吹进来。',size:{width:70,unit:'mm'},place:{reference:'page',at:[45,85],unit:'mm'},style:{fontSizePt:11}}
    ]});
    else if(turn===3){
      assert.ok(messages.some(m=>m.role==='user'&&Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url')));
      tool=call('creation_finish',{summary:'完成',review:{observations:'标题在上方，正文在下方，文字位于可读的纸面',issues:[],pngHash:preview.pngHash,sceneRevision:preview.sceneRevision}});
    }else throw Error('unexpected extra turn');
    return {message:{role:'assistant',content:null,tool_calls:[tool]},usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}};
  };
  const harness=createPiCreativeHarness({model,skills,render:async doc=>{
    currentRevision=creationSceneRevision(doc);
    preview={pngHash:'sha256:'+String(++renders).padStart(64,'a'),sceneRevision:currentRevision,imageURL:'data:image/png;base64,dGVzdA=='};
    return preview;
  }});
  const result=await harness.run({id:'pi-smoke',state:initial});
  assert.equal(result.status,'completed');
  assert.equal(result.turns,3);
  assert.equal(renders,1);
  assert.ok(result.document.page.layers.some(layer=>layer.id==='title'));
  assert.ok(result.trace.some(event=>event.kind==='render'));
});

test('Pi resumes a saved scene and transcript after a model interruption',async()=>{
  const document=await createCreationDocument({draft:draft(),assets:[],prompt:'写一页周末手帐'}),skills=await loadCreationSkills();
  const initial=initialHarnessState({document,skills,brief:{style:'清新淡雅'}});
  let snapshot,attempt=0,renders=0;
  const render=async doc=>({pngHash:'sha256:'+String(++renders).padStart(64,'b'),sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA=='});
  const interrupted=createPiCreativeHarness({skills,render,checkpoint:async value=>{snapshot=structuredClone(value);},model:async()=>{
    if(++attempt===1)return {message:{role:'assistant',content:null,tool_calls:[plan()]},usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
    throw Error('synthetic transport interruption');
  }});
  await assert.rejects(interrupted.run({id:'pi-resume',state:initial}),/synthetic transport interruption/);
  assert.ok(snapshot?.transcript.length>=4);
  let resumed=0;
  const continuing=createPiCreativeHarness({skills,render,checkpoint:async value=>{snapshot=structuredClone(value);},model:async()=>{
    resumed++;
    const tool=resumed===1?call('creation_apply',{protocolVersion:2,transactionId:'after-resume',baseSceneRevision:creationSceneRevision(snapshot.state.document),operations:[
      {op:'text.add',id:'resumed-title',content:'周末',size:{width:55,unit:'mm'},place:{reference:'page',at:[35,30],unit:'mm'},style:{fontSizePt:20}},
      {op:'text.add',id:'resumed-body',content:'午后的风从窗边吹进来。',size:{width:70,unit:'mm'},place:{reference:'page',at:[45,85],unit:'mm'},style:{fontSizePt:11}}
    ]}):call('creation_finish',{summary:'继续完成',review:{observations:'标题清楚可读',issues:[]}});
    return {message:{role:'assistant',content:null,tool_calls:[tool]},usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
  }});
  const result=await continuing.run({id:'pi-resume',snapshot});
  assert.equal(result.status,'completed');
  assert.equal(result.turns,4);
  assert.ok(result.document.page.layers.some(layer=>layer.id==='resumed-title'));
});

test('Pi sends a requested method illustration as image data to the model',async()=>{
  const document=await createCreationDocument({draft:draft(),assets:[],prompt:'测试方法图'}),skills=await loadCreationSkills();
  const initial=initialHarnessState({document,skills,brief:{}});
  let turn=0;
  const harness=createPiCreativeHarness({skills,model:async({messages})=>{
    if(++turn===1)return {message:{role:'assistant',content:null,tool_calls:[call('read_skill',{name:'photo-story',level:'detail',methodId:'photo-film'})]},usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
    assert.ok(messages.some(message=>message.role==='user'&&Array.isArray(message.content)&&message.content.some(part=>part.type==='image_url')));
    throw Error('method image delivered');
  }});
  await assert.rejects(harness.run({id:'pi-image',state:initial}),/method image delivered/);
  assert.equal(turn,2);
});

test('Pi asks for a corrected tool call when DeepSeek returns malformed arguments',async()=>{
  const document=await createCreationDocument({draft:draft(),assets:[],prompt:'写一页周末手帐'}),skills=await loadCreationSkills();
  const initial=initialHarnessState({document,skills,brief:{}});
  let turn=0,preview;
  const harness=createPiCreativeHarness({skills,model:async({messages})=>{
    turn++;
    if(turn===1)return {message:{role:'assistant',content:null,tool_calls:[{id:'bad-call',type:'function',function:{name:'creation_plan',arguments:'{"intent":"broken" trailing'}}]},usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
    if(turn===2){assert.ok(messages.some(message=>message.role==='assistant'&&String(message.content).includes('工具参数不是完整的 JSON')));return {message:{role:'assistant',content:null,tool_calls:[plan()]},usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};}
    if(turn===3)return {message:{role:'assistant',content:null,tool_calls:[call('creation_apply',{protocolVersion:2,transactionId:'after-bad-json',baseSceneRevision:creationSceneRevision(document),operations:[
      {op:'text.add',id:'title',content:'周末小记',size:{width:55,unit:'mm'},place:{reference:'page',at:[35,30],unit:'mm'},style:{fontSizePt:20}},
      {op:'text.add',id:'body',content:'午后的风从窗边吹进来。',size:{width:70,unit:'mm'},place:{reference:'page',at:[45,85],unit:'mm'},style:{fontSizePt:11}}
    ]})]},usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
    return {message:{role:'assistant',content:null,tool_calls:[call('creation_finish',{summary:'完成',review:{observations:'标题和正文清楚',issues:[],pngHash:preview.pngHash,sceneRevision:preview.sceneRevision}})]},usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
  },render:async doc=>{preview={pngHash:'sha256:'+'a'.repeat(64),sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA=='};return preview;}});
  const result=await harness.run({id:'pi-malformed-tool',state:initial});
  assert.equal(result.status,'completed');
  assert.ok(result.trace.some(event=>event.malformedToolCalls?.[0]?.name==='creation_plan'&&event.malformedToolCalls[0].closed===false));
});
