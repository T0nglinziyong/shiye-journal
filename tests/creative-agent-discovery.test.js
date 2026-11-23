import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {validateValue} from '../src/creative-contract.js';
import {creationOperationSpecs} from '../src/creation-command-spec.js';
import {createCreativeHarness,initialHarnessState} from '../creative-agent/runtime/agent.mjs';
import {availableHarnessTools,selectHarnessTools,harnessToolCatalog,harnessTools} from '../creative-agent/runtime/tools.mjs';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {modelContext,shortlistCreationMethods} from '../creative-agent/runtime/context.mjs';
import {createPiCreativeHarness} from '../creative-agent/runtime/pi-agent.mjs';

async function fixture({critique}={}){
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const skills=await loadCreationSkills(undefined,{illustrationRoot:null});
  const model=Object.assign(async()=>{throw Error('bridge must not call authoring model');},{critique});
  const harness=createCreativeHarness({model,skills,render:async doc=>({pngHash:creationSceneRevision(doc),sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA=='})});
  let state=initialHarnessState({document,skills,brief:{}}),sequence=0;
  return {get state(){return state;},async call(name,args,{sameTurn=false}={}){
    if(!sameTurn)state={...state,turns:state.turns+1};
    const call={id:'call-'+(++sequence),type:'function',function:{name,arguments:JSON.stringify(args)}};
    state=await harness.executeToolCalls({state,calls:[call]});
    return state.results.at(-1);
  }};
}
const operation={op:'text.add',id:'title',content:'清晨',place:{reference:'page',at:[40,40],unit:'mm'},size:{width:55,unit:'mm'},style:{fontSizePt:18}};
async function arrange(f){
  assert.equal((await f.call('creation_plan',{intent:'浅色纸面上的清晨短记'})).ok,true);
  assert.equal((await f.call('creation_apply',{protocolVersion:2,transactionId:'first',baseSceneRevision:creationSceneRevision(f.state.document),operations:[operation]})).ok,true);
}

test('optional tools are discoverable, persistent across phases and restricted to host capabilities',async()=>{
  const available=availableHarnessTools();
  assert.equal(selectHarnessTools(available).length,13);
  assert.ok(!available.some(tool=>tool.function.name==='creation_guide'));
  assert.ok(!JSON.stringify(harnessToolCatalog(available)).includes('segment_material'));
  const f=await fixture();
  const result=await f.call('creation_help',{topics:['workspace_create','read_template']});
  assert.equal(result.ok,true);
  assert.deepEqual(result.data.tools.map(tool=>tool.function.name).sort(),['read_template','workspace_create']);
  const restored=JSON.parse(JSON.stringify(f.state));
  for(const phase of ['direction','layout','craft','review']){
    const names=selectHarnessTools(available,{...restored,phase}).map(tool=>tool.function.name);
    assert.ok(names.includes('read_template'));assert.ok(names.includes('workspace_create'));
    assert.ok(!names.includes('segment_material'));
  }
  assert.equal((await f.call('workspace_create',{id:'experiment',title:'试摆'})).ok,true);
  assert.equal((await f.call('segment_material',{alias:'invented',box:[0,0,1,1]})).ok,false);
  assert.equal((await f.call('creation_help',{topics:['segment_material']})).ok,false);
});

for(const [name,create] of [['LangGraph',createCreativeHarness],['Pi',createPiCreativeHarness]])test(`${name} sends only discovered tools to the model`,async()=>{
  const document=await createCreationDocument({draft:draft(),assets:[]}),skills=await loadCreationSkills(undefined,{illustrationRoot:null});
  let turns=0;
  const harness=create({skills,model:async({tools})=>{
    const names=tools.map(tool=>tool.function.name);
    if(++turns===1){
      assert.equal(names.length,13);assert.ok(names.includes('creation_paper'));assert.ok(!names.includes('read_template'));
      return {message:{role:'assistant',content:null,tool_calls:[{id:'discover',type:'function',function:{name:'creation_help',arguments:'{"topics":["read_template"]}'}}]}};
    }
    assert.ok(names.includes('read_template'));assert.ok(!names.includes('workspace_create'));
    throw Error('discovery request verified');
  }});
  await assert.rejects(harness.run({id:'discovery-'+name,state:initialHarnessState({document,skills,brief:{}})}),/discovery request verified/);
  assert.equal(turns,2);
});

test('reference search exposes returned readers without another discovery round',async()=>{
  const f=await fixture();
  const result=await f.call('search_references',{kind:'templates',limit:2});
  assert.equal(result.ok,true);assert.ok(result.data.results.length);
  assert.ok(selectHarnessTools(availableHarnessTools(),f.state).some(tool=>tool.function.name==='read_template'));
});

test('rereading a method restores its contract with a fresh example after a scene change',async()=>{
  const f=await fixture();
  const args={name:'journal-graphics',level:'detail',methodId:'graphic-loop'};
  const first=await f.call('read_skill',args);
  assert.equal(first.ok,true);
  await arrange(f);
  const second=await f.call('read_skill',args);
  assert.equal(second.ok,true);assert.equal(second.data.alreadyLoaded,true);
  const before=first.data.methods[0].tool.arguments,after=second.data.methods[0].tool.arguments;
  assert.equal(after.baseSceneRevision,creationSceneRevision(f.state.document));
  assert.notEqual(after.baseSceneRevision,before.baseSceneRevision);
  assert.notEqual(after.transactionId,before.transactionId);
  assert.deepEqual(second.data.methods[0].parameters,first.data.methods[0].parameters);
  assert.equal(f.state.loadedSkills.length,1);assert.equal(f.state.skillReferences.length,1);
  assert.equal(second.data.nextPage,null);
  assert.equal((await f.call('read_skill',{...args,level:'methods'})).ok,false);
});

test('saved self-review cannot bypass independent delivery review',async()=>{
  let audits=0;
  const f=await fixture({critique:async()=>{audits++;return {blockingIssues:['标题遮住了正文'],notes:[]};}});
  await arrange(f);
  assert.equal((await f.call('creation_review',{...f.state.preview,approved:true,observations:'标题清楚且位于页面上部',issues:[]})).ok,true);
  const finish=await f.call('creation_finish',{summary:'完成'});
  assert.equal(finish.ok,false);assert.match(finish.detail,/标题遮住了正文/);
  assert.equal(audits,1);assert.equal(f.state.status,'running');
});

test('a host that renders tools sequentially still rejects finish before the next model turn',async()=>{
  const f=await fixture();await arrange(f);
  const review={observations:'标题清楚且位于页面上部',issues:[]};
  assert.equal((await f.call('creation_finish',{review},{sameTurn:true})).ok,false);
  assert.equal(f.state.status,'running');
  assert.equal((await f.call('creation_finish',{review})).ok,true);
});

test('advertised command names are generated from the executable registry',()=>{
  const schema=harnessTools.find(tool=>tool.function.name==='creation_apply').function.parameters;
  assert.deepEqual(schema.properties.operations.items.properties.op.enum,creationOperationSpecs.map(spec=>spec.name));
  const args={protocolVersion:2,transactionId:'bad',baseSceneRevision:'sha256:'+'a'.repeat(64),operations:[{op:'invented'}]};
  assert.throws(()=>validateValue(args,schema));
});

test('context windowing preserves unsummarized decisions and recognizes the actual observation prefix',async()=>{
  const f=await fixture();await arrange(f);
  const messages=[...f.state.messages.slice(0,2)];
  for(let i=0;i<10;i++)messages.push({role:'assistant',content:i===0?'放弃居中布局，保留左侧标题作为阅读起点。':null,tool_calls:[{id:'c'+i,function:{name:'creation_help',arguments:'{}'}}]},{role:'tool',tool_call_id:'c'+i,content:'{"ok":true}'});
  const observation=f.state.messages.at(-1);
  assert.match(observation.content[0].text,/当前纸面实物素材：/);
  messages.push(observation);
  const context=modelContext(messages,{...f.state,messages,compactedUntil:2,creativeMemory:''});
  const summary=JSON.parse(context[2].content.slice(context[2].content.indexOf('：')+1));
  assert.match(summary.creativeMemory,/放弃居中布局/);
  assert.deepEqual(Object.keys(summary.scene),['sceneRevision']);
  assert.equal(context.filter(message=>message===observation).length,1);
});

test('no-text tasks do not receive writing or lettering method suggestions',()=>{
  const methods=shortlistCreationMethods({source:{materials:[{},{}],textMode:'none',styles:['清新淡雅']}});
  assert.ok(methods.length);
  assert.ok(methods.every(method=>!['journal-writing','journal-lettering'].includes(method.skill)));
});

test('zero-material documentary tasks retain their facts without being told to invent scenes',async()=>{
  const document=await createCreationDocument({draft:draft(),assets:[],contentPolicy:'documentary',userText:'今天整理了书桌',providedFacts:'只记录整理书桌'});
  const skills=await loadCreationSkills(undefined,{illustrationRoot:null});
  const state=initialHarnessState({document,skills,brief:{}});
  assert.doesNotMatch(state.messages[0].content,/允许写虚构的小场景/);
  const constraints=JSON.parse(state.messages[1].content[0].text.split('\n').find(line=>line.startsWith('任务约束：')).slice('任务约束：'.length));
  assert.equal(constraints.contentPolicy,'documentary');
  assert.equal(constraints.userText,'今天整理了书桌');
  assert.equal(constraints.providedFacts,'只记录整理书桌');
});
