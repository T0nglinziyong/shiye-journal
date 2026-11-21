import test from 'node:test';
import assert from 'node:assert/strict';
import {toolsForCreativePhase,phaseObservation} from '../compute-server/harness/phases.mjs';
import {evaluateCreativeFrame,attachCreativeReview,summarizeCreativeEvaluation} from '../compute-server/harness/quality-evaluation.mjs';
import {harnessTools,createCreativeHarness,initialHarnessState} from '../compute-server/harness/agent.mjs';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {loadCreationSkills} from '../compute-server/harness/skills.mjs';
import {draft} from '../src/domain.js';
import {JournalCheckpointSaver,fileCheckpointJournal} from '../compute-server/harness/checkpoints.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const names=phase=>toolsForCreativePhase(harnessTools,phase).map(tool=>tool.function.name);
const call=(name,args)=>({id:name,type:'function',function:{name,arguments:JSON.stringify(args)}});
const answer=(...calls)=>({message:{role:'assistant',content:null,tool_calls:calls}});

test('phase toolsets narrow capabilities and allow returning to composition',()=>{
 assert.ok(names('composition').includes('explore_drafts'));
 assert.ok(!names('detailing').includes('explore_drafts'));
 assert.ok(names('detailing').includes('segment_material'));
 assert.ok(!names('review').includes('creation_apply'));
 assert.ok(names('review').includes('creation_finish'));
 assert.ok(names('review').includes('creation_phase'));
 assert.ok(names('composition').includes('search_references'));
});

test('stage observations show the current scene but omit unrelated guidance during review',()=>{
 const input={capture:{pngHash:'hash'},spaceStatus:{spaces:[],current:{},changed:[]},scene:{sceneRevision:'revision',layers:[{surface:'page',id:'visible'},{surface:'tray',id:'parked'}]},feedback:{required:[]},advisory:{observations:['check'],typography:{},pages:[],materialFrames:[{large:true}]},previousReview:null,remainingSeconds:10};
 const composition=phaseObservation('composition',input),review=phaseObservation('review',input);
 assert.equal(composition.scene.layers.length,2);
 assert.deepEqual(review.scene.layers.map(layer=>layer.id),['visible']);
 assert.equal(review.advisory.materialFrames,undefined);
 assert.equal(review.remainingSeconds,10);
});

test('each render has reproducible metrics, pixel comparison and reviews tied to its exact version',()=>{
 const hash=n=>'sha256:'+String(n).repeat(64);
 const advisory={layers:{material:1,text:1},pages:[{page:'page',estimatedFrameCoverage:.2}],observations:['check']};
 const feedback={required:[{present:true},{present:false}],finalValidation:{ok:false,issue:'missing'}};
 const frame=(n,sample,previous)=>evaluateCreativeFrame({preview:{pngHash:hash(n),sceneRevision:hash(n),artifact:'preview-'+n+'.png',visualSample:Buffer.from(sample).toString('base64')},feedback,advisory,previous,turn:n,phase:'composition'});
 const first=frame(1,[0,0,0]),second=frame(2,[255,0,0],first);
 assert.equal(second.pixelChange,.3333);
 assert.equal(first.metrics.requiredPresent,1);
 assert.throws(()=>attachCreativeReview([first],{pngHash:hash(2),sceneRevision:hash(2)}),/不在本次评测时间线/);
 const reviewed=attachCreativeReview([first,second],{pngHash:hash(2),sceneRevision:hash(2),approved:true,observations:'画面清楚',issues:[],turn:2});
 const result=summarizeCreativeEvaluation(reviewed,{humanReviews:[{pngHash:hash(2),rating:4,note:'人工复核'}]});
 assert.equal(result.comparison.revisions,2);
 assert.equal(result.comparison.humanReviewed,1);
 assert.equal(result.frames[1].modelReview.approved,true);
 assert.equal(result.frames[1].humanReview.rating,4);
 assert.equal(result.frames[1].visualSample,undefined);
 assert.throws(()=>summarizeCreativeEvaluation(reviewed,{humanReviews:[{pngHash:hash(3),rating:5,note:'并未查看'}]}),/已有画面/);
});

test('a phase switch changes the next model toolset and trace spans model, tool and renderer',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'shiye-quality-phase-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const document=await createCreationDocument({draft:draft(),assets:[]}),skills=await loadCreationSkills();
 const initial=initialHarnessState({document,skills,brief:{title:'测试'}}),checkpointer=await new JournalCheckpointSaver(fileCheckpointJournal(join(dir,'checkpoints.jsonl'))).restore();
 let turn=0;
 const harness=createCreativeHarness({skills,checkpointer,render:async doc=>({pngHash:'sha256:'+'a'.repeat(64),sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA==',visualSample:Buffer.from([10,20,30]).toString('base64')}),model:async({messages,tools})=>{
   turn++;
   if(turn===1)return answer(call('creation_plan',{intent:'先排标题',steps:[{task:'完成',status:'in_progress'}]}),call('creation_apply',{protocolVersion:2,transactionId:'first',baseSceneRevision:creationSceneRevision(document),operations:[{op:'text.add',id:'title',content:'手帐',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:50,unit:'mm'}}]}),call('creation_phase',{phase:'detailing',reason:'整体位置已确定'}));
   if(turn===2){assert.ok(!tools.some(tool=>tool.function.name==='explore_drafts'));assert.ok(tools.some(tool=>tool.function.name==='creation_apply'));const first=JSON.parse(messages.findLast(message=>message.role==='user'&&Array.isArray(message.content)).content[0].text.split('\n')[0].slice(7));return answer(call('creation_review',{...first,approved:true,observations:'标题清楚',issues:[]}),call('creation_phase',{phase:'review',reason:'进入最终检查'}));}
   assert.ok(!tools.some(tool=>tool.function.name==='creation_apply'));
   return answer(call('creation_finish',{summary:'完成'}));
 }});
 const result=await harness.run({id:'quality-phase',state:initial});
 assert.equal(result.status,'completed');assert.equal(result.phase,'review');
 assert.deepEqual([...new Set(result.trace.map(entry=>entry.kind))],['model','tool','render']);
 assert.equal(result.qualityFrames.length,1);assert.equal(result.qualityFrames[0].modelReview.approved,true);
});

test('two rendered layouts automatically enter detail mode and explicit rollback restores composition tools',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'shiye-auto-phase-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const document=await createCreationDocument({draft:draft(),assets:[]}),skills=await loadCreationSkills(),initial=initialHarnessState({document,skills,brief:{title:'测试'}});
 const checkpointer=await new JournalCheckpointSaver(fileCheckpointJournal(join(dir,'checkpoints.jsonl'))).restore();
 let turn=0;
 const harness=createCreativeHarness({skills,checkpointer,render:async doc=>({pngHash:'sha256:'+'b'.repeat(64),sceneRevision:creationSceneRevision(doc),imageURL:'data:image/png;base64,dGVzdA=='}),model:async({messages,tools})=>{
   turn++;
   const preview=messages.findLast(message=>message.role==='user'&&Array.isArray(message.content)&&message.content[0].text.startsWith('当前真实画面：'));
   const scene=preview&&JSON.parse(preview.content[0].text.split('\n')[0].slice('当前真实画面：'.length));
   if(turn===1)return answer(call('creation_plan',{intent:'先试摆再完善',steps:[{task:'检查',status:'in_progress'}]}),call('creation_apply',{protocolVersion:2,transactionId:'initial',baseSceneRevision:creationSceneRevision(document),operations:[{op:'text.add',id:'title',content:'初稿',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:50,unit:'mm'}}]}));
   if(turn===2){assert.match(preview.content[0].text,/剩余时间（秒）/);return answer(call('creation_review',{...scene,approved:false,observations:'标题太短',issues:['需要补充'],nextStep:'补充文字'}),call('creation_apply',{protocolVersion:2,transactionId:'second',baseSceneRevision:scene.sceneRevision,operations:[{op:'layer.update',target:'title',content:'新的标题'}]}));}
   if(turn===3){assert.ok(!tools.some(tool=>tool.function.name==='search_references'));assert.match(preview.content[0].text,/阶段观察：/);return answer(call('creation_review',{...scene,approved:true,observations:'标题已完整',issues:[]}),call('creation_phase',{phase:'composition',reason:'需要重新检查构图选项'}));}
   assert.ok(tools.some(tool=>tool.function.name==='search_references'));
   return answer(call('creation_finish',{summary:'完成'}));
 }});
 const result=await harness.run({id:'auto-phase',state:initial});
 assert.equal(result.status,'completed');assert.equal(result.automaticPhaseAdvanced,true);
 assert.equal(result.trace.filter(event=>event.kind==='phase').length,1);
});
