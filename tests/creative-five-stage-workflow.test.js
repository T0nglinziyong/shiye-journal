import {canvasFixtureCall} from './lib/canvas-model-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {draft} from '../src/domain.js';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {JournalCheckpointSaver,fileCheckpointJournal} from '../creative-agent/runtime/checkpoints.mjs';
import {createCreativeHarness,initialHarnessState,harnessTools} from '../creative-agent/runtime/agent.mjs';
import {toolsForCreativePhase,phaseGuide,declaredCreativePhase,creativePhaseLabels} from '../creative-agent/runtime/phases.mjs';

const call=(name,args)=>{({name,args}=canvasFixtureCall(name,args));return {id:name+'-'+Math.random().toString(36).slice(2),type:'function',function:{name,arguments:JSON.stringify(args)}};};
const answer=(...calls)=>({message:{role:'assistant',content:null,tool_calls:calls}});
const assessment=observations=>({observations,issues:[]});
const phase=(name,observations)=>call('creation_phase',{phase:name,reason:'本阶段检查通过',assessment:assessment(observations)});
const plan={intent:'记录周末的彩色小事',themeEvidence:{supportedBy:['用户想做手帐'],conflicts:[],response:'以日常观察为主题'},palette:{source:'手帐日常',main:'#447766',secondary:'#F7E7BB',relationship:'echo',distribution:'底色约三分之一，文字深色，点缀少量暖黄'},composition:{visualAnchors:'标题与两段短文共同引导视线，没有单一主角',layout:'左上标题，右下正文，留出中部呼吸',connector:'色点连接两处'},writingZones:[{role:'title',surface:'page',anchor:'左上',capacity:'short',legibility:'深字浅底'},{role:'body',surface:'page',anchor:'右下',capacity:'medium',legibility:'浅底'}],steps:[{task:'排版',status:'in_progress'}]};
const previewOf=messages=>{
  const message=messages.findLast(item=>item.role==='user'&&Array.isArray(item.content)&&item.content[0]?.text?.startsWith('当前真实画面：'));
  if(message)return JSON.parse(message.content[0].text.split('\n')[0].slice('当前真实画面：'.length));
  const summary=messages.findLast(item=>item.role==='user'&&typeof item.content==='string'&&item.content.startsWith('当前创作状态'));
  return summary&&JSON.parse(summary.content.slice(summary.content.indexOf('：')+1)).preview;
};

test('direction starts with a plan while later modes remain flexible',()=>{
  const names=stage=>toolsForCreativePhase(harnessTools,stage).map(item=>item.function.name);
  assert.ok(names('direction').includes('creation_apply'));
  assert.ok(names('layout').includes('read_template'));
  assert.ok(names('layout').includes('explore_drafts'));
  assert.ok(names('craft').includes('explore_drafts'));
  assert.ok(names('review').includes('creation_apply'));
  assert.ok(names('review').includes('creation_finish'));
  assert.match(phaseGuide('layout',{styles:['丰富层叠']}),/可交错/);
  assert.match(phaseGuide('layout',{styles:['丰富层叠']}),/内容充实、纸层穿插、图文共同构图、装饰相互呼应/);
});

test('model declares five freely chosen focuses without progress or phase bookkeeping calls',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'shiye-five-stage-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const document=await createCreationDocument({draft:draft(),assets:[]}),skills=await loadCreationSkills();
 const state=initialHarnessState({document,skills,brief:{title:'五阶段测试'}});
 const checkpointer=await new JournalCheckpointSaver(fileCheckpointJournal(join(dir,'checkpoints.jsonl'))).restore();
 let turn=0;const seen=[];
 const edit=(preview,id,operations)=>call('creation_apply',{protocolVersion:2,transactionId:id,baseSceneRevision:preview?.sceneRevision||creationSceneRevision(document),operations});
 const model=async({messages,tools})=>{
  turn++;assert.ok(!tools.some(t=>t.function.name==='creation_progress'));
  const snapshot=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('当前创作状态'));
  if(snapshot){const current=JSON.parse(snapshot.content.slice(snapshot.content.indexOf('：')+1));seen.push(current.phase);assert.equal(current.workflow.stage,turn===1?'由模型自行判断':creativePhaseLabels[current.phase]);}
  else seen.push('direction');
  const preview=previewOf(messages);
  if(turn===1){const response=answer(call('creation_plan',{intent:'标题在上，正文和纸边点缀形成连接'}));response.message.content='阶段：打底与构图';return response;}
  if(turn===2){const response=answer(edit(preview,'layout',[{op:'text.add',id:'title',content:'周末小记',size:{width:55,unit:'mm'},place:{reference:'page',at:[42,38],unit:'mm'},style:{fontSizePt:22}}]));response.message.content='阶段：标题与内容';return response;}
  if(turn===3){const response=answer(edit(preview,'writing',[{op:'text.add',id:'body',content:'雨停以后，把今天的小事记在这里。',size:{width:65,unit:'mm'},place:{reference:'page',at:[55,83],unit:'mm'},style:{fontSizePt:12}}]));response.message.content='阶段：装饰与点缀';return response;}
  if(turn===4){const response=answer(edit(preview,'accents',[{op:'graphic.add',id:'dot',geometry:{kind:'ellipse'},size:{width:4,height:4,unit:'mm'},place:{reference:'page',at:[35,110],unit:'mm'},style:{fill:'#447766'}}]));response.message.content='阶段：最终检查';return response;}
  return answer(call('creation_finish',{review:{observations:'上方标题清晰，下方正文可读，绿色圆点呼应标题，纸边完整',issues:[]}}));
 };
 model.critique=async()=>({blockingIssues:[],notes:[]});
 const harness=createCreativeHarness({skills,checkpointer,model,render:async doc=>({pngHash:creationSceneRevision(doc),sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA=='})});
 const result=await harness.run({id:'five-stage',state});
 assert.equal(result.status,'completed');assert.deepEqual(seen,['direction','layout','craft','accents','review']);
 assert.equal(result.turns,5);assert.ok(!result.trace.some(t=>['creation_progress','creation_phase'].includes(t.name)));
});


test('focus changes only through a model declaration, can go backward and is not inferred from prose',()=>{
 assert.equal(declaredCreativePhase(null,'accents'),'accents');
 assert.equal(declaredCreativePhase('已完成标题并添加纸张','layout'),'layout');
 assert.equal(declaredCreativePhase('阶段：打底与构图\n调整纸片','review'),'layout');
 assert.equal(declaredCreativePhase('阶段：未知阶段','craft'),'craft');
});
