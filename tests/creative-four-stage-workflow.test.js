import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {draft} from '../src/domain.js';
import {loadCreationSkills} from '../compute-server/harness/skills.mjs';
import {JournalCheckpointSaver,fileCheckpointJournal} from '../compute-server/harness/checkpoints.mjs';
import {createCreativeHarness,initialHarnessState,harnessTools} from '../compute-server/harness/agent.mjs';
import {toolsForCreativePhase,phaseGuide} from '../compute-server/harness/phases.mjs';

const call=(name,args)=>({id:name+'-'+Math.random(),type:'function',function:{name,arguments:JSON.stringify(args)}});
const answer=(...calls)=>({message:{role:'assistant',content:null,tool_calls:calls}});
const assessment=observations=>({observations,issues:[]});
const phase=(name,observations)=>call('creation_phase',{phase:name,reason:'本阶段检查通过',assessment:assessment(observations)});
const plan={intent:'记录周末的彩色小事',themeEvidence:{supportedBy:['用户想做手帐'],conflicts:[],response:'以日常观察为主题'},palette:{source:'手帐日常',main:'#447766',secondary:'#F7E7BB',relationship:'echo',distribution:'底色约三分之一，文字深色，点缀少量暖黄'},composition:{visualAnchors:'标题与两段短文共同引导视线，没有单一主角',layout:'左上标题，右下正文，留出中部呼吸',connector:'色点连接两处'},writingZones:[{role:'title',surface:'page',anchor:'左上',capacity:'short',legibility:'深字浅底'},{role:'body',surface:'page',anchor:'右下',capacity:'medium',legibility:'浅底'}],steps:[{task:'排版',status:'in_progress'}]};
const previewOf=messages=>{
  const message=messages.findLast(item=>item.role==='user'&&Array.isArray(item.content)&&item.content[0]?.text?.startsWith('当前真实画面：'));
  if(message)return JSON.parse(message.content[0].text.split('\n')[0].slice('当前真实画面：'.length));
  const summary=messages.find(item=>item.role==='user'&&typeof item.content==='string'&&item.content.startsWith('当前创作状态'));
  return summary&&JSON.parse(summary.content.slice(summary.content.indexOf('：')+1)).preview;
};

test('direction starts with a plan while later modes remain flexible',()=>{
  const names=stage=>toolsForCreativePhase(harnessTools,stage).map(item=>item.function.name);
  assert.ok(!names('direction').includes('creation_apply'));
  assert.ok(names('layout').includes('read_template'));
  assert.ok(names('layout').includes('explore_drafts'));
  assert.ok(names('craft').includes('explore_drafts'));
  assert.ok(names('review').includes('creation_apply'));
  assert.ok(names('review').includes('creation_finish'));
  assert.match(phaseGuide('layout',{styles:['丰富层叠']}),/可以交错/);
  assert.match(phaseGuide('layout',{styles:['丰富层叠']}),/充实/);
});

test('stage checks advance only after plan and current render; edits continue without per-edit review',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'shiye-four-stage-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const skills=await loadCreationSkills();
  const state=initialHarnessState({document,skills,brief:{title:'四阶段测试'}});
  const checkpointer=await new JournalCheckpointSaver(fileCheckpointJournal(join(dir,'checkpoints.jsonl'))).restore();
  let turn=0;
  const audits=[];
  const model=async({messages,tools})=>{
    turn++;
    const names=tools.map(item=>item.function.name),preview=previewOf(messages);
    if(turn===1){assert.ok(!names.includes('creation_apply'));return answer(call('creation_plan',plan),phase('layout','主题、配色及多焦点阅读路线已经确定'));}
    if(turn===2){assert.ok(names.includes('creation_apply'));return answer(call('creation_apply',{protocolVersion:2,transactionId:'layout',baseSceneRevision:creationSceneRevision(document),operations:[{op:'text.add',id:'title',content:'周末小记',size:{width:55,unit:'mm'},place:{reference:'page',at:[42,38],unit:'mm'},style:{fontSizePt:22}}]}));}
    if(turn===3){assert.ok(names.includes('creation_apply'),'看图后仍可继续编辑');return answer(phase('craft','标题位于左上，右侧可写，版面已经建立'));}
    if(turn===4){assert.ok(names.includes('creation_apply'));return answer(call('creation_apply',{protocolVersion:2,transactionId:'craft',baseSceneRevision:preview.sceneRevision,operations:[{op:'text.add',id:'body',content:'雨停以后，我把今天的小事记在这里。',size:{width:65,unit:'mm'},place:{reference:'page',at:[55,83],unit:'mm'},style:{fontSizePt:12}}]}));}
    if(turn===5)return answer(phase('review','标题和正文形成层级，配色与页面关系清楚，文字可读'));
    return answer(call('creation_finish',{summary:'完成',review:{observations:'左上标题和右侧正文相互呼应，文字清晰且页面有层次',issues:[]}}));
  };
  model.critique=async({phase,imageURL})=>{audits.push(phase);assert.match(imageURL,/^data:image\/png;base64,/);return {blockingIssues:[],notes:[]};};
  const harness=createCreativeHarness({skills,checkpointer,render:async doc=>({pngHash:'sha256:'+String(creationSceneRevision(doc)).replace(/[^a-f0-9]/g,'a').slice(-64).padStart(64,'a'),sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA=='}),model});
  const result=await harness.run({id:'four-stage',state});
  assert.equal(result.status,'completed');
  assert.deepEqual(result.phaseReviews.map(item=>item.to),['layout','craft','review']);
  assert.equal(result.qualityFrames.length,2);
  assert.equal(result.qualityFrames.at(-1).phase,'craft');
  assert.deepEqual(audits,['layout','craft','review']);
  assert.ok(!result.trace.some(item=>item.kind==='phase'&&item.reason==='two-render-layout-established'));
});
