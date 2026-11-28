import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {applyBackgroundCreativeResult,createBackgroundCreationSession,creativeJobProgress} from '../src/background-creation-session.js';
import {generatedProjectTitle} from '../src/creative-project-title.js';

async function fixture(){
  const d=draft(),project={id:'project',title:'测试',activeDraftID:d.id,drafts:[d]};
  let document=await createCreationDocument({draft:d,assets:[]});
  const result=applyCreationTransaction(document,{protocolVersion:2,transactionId:'add',baseSceneRevision:creationSceneRevision(document),operations:[{op:'text.add',id:'title',content:'后台完成的标题',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:60,unit:'mm'}}]},[]);
  document=result.document;
  const job={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',project_id:project.id,status:'completed',updated_at:'2026-11-21T00:02:34Z'};
  project.creativeTask={id:job.id,taskHash:document.source.taskHash,status:'running'};
  return {project,document,job,assets:[]};
}
test('background completion preserves manual edits and repeated delivery does not duplicate a candidate',async()=>{
  const f=await fixture();f.project.drafts[0].title='手机编辑';let writes=0;
  const apply=()=>applyBackgroundCreativeResult({...f,persist:async()=>{writes++;}});
  const first=await apply();assert.equal(first.candidate,true);assert.equal(f.project.drafts[0].title,'手机编辑');assert.equal(f.project.drafts.length,2);
  const second=await apply();assert.equal(second.duplicate,true);assert.equal(f.project.drafts.length,2);assert.equal(writes,2);
});
test('a failed local persistence retries its receipt without reverting later human edits',async()=>{
  const f=await fixture();let fail=true;
  const apply=()=>applyBackgroundCreativeResult({...f,persist:async()=>{if(fail)throw Error('quota');}});
  await assert.rejects(apply(),/quota/);const count=f.project.drafts.length;
  f.project.drafts[0].title='后续人工修改';fail=false;await apply();assert.equal(f.project.drafts.length,count);assert.equal(f.project.drafts[0].title,'后续人工修改');
});
test('unchanged draft is updated once; mismatched project or task cannot be applied',async()=>{
  const f=await fixture();const result=await applyBackgroundCreativeResult({...f,persist:async()=>{}});
  assert.equal(result.candidate,false);assert.equal(f.project.drafts.length,1);assert.equal(f.project.drafts[0].layers[0].content,'后台完成的标题');
  const other=await fixture();other.job.project_id='another';await assert.rejects(applyBackgroundCreativeResult({...other,persist:async()=>{}}),/不属于/);
});
test('completed AI artwork names the default project from its actual heading',async()=>{
  const f=await fixture();f.project.title='新的手账';f.project.creativeTask.originalTitle='新的手账';
  f.document.title='自动安排手帐';
  const result=await applyBackgroundCreativeResult({...f,persist:async()=>{}});
  assert.equal(result.project.title,'后台完成的标题');
});
test('a later human project name is not replaced by the AI heading',async()=>{
  const f=await fixture();f.project.creativeTask.originalTitle='新的手账';f.project.title='我的周末';
  await applyBackgroundCreativeResult({...f,persist:async()=>{}});
  assert.equal(f.project.title,'我的周末');
});
test('title choice prefers a real heading and ignores body copy or parked text',()=>{
  assert.equal(generatedProjectTitle({layers:[
    {id:'body',type:'text',content:'今天走了很长的路，沿途看到很多风景。',fontSize:20},
    {id:'title-L',type:'text',content:'先出发，再想',fontSize:52},
    {id:'title-old',type:'text',content:'旧标题',fontSize:80,isParked:true}
  ]}),'先出发，再想');
  assert.equal(generatedProjectTitle({layers:[{id:'body',type:'text',content:'一段普通正文',fontSize:20}]}),null);
  assert.equal(generatedProjectTitle({layers:[{id:'heading',type:'text',content:'今天出发！',fontSize:48}]}),'今天出发！');
});
test('reopening subscribes to the same job and closing observers never cancels the server',async()=>{
  const f=await fixture();f.job.progress={turns:7,inputTokens:1200,outputTokens:360};let hooks,cancels=0,stops=0,owner='account',updates=[];
  const api={pending:async()=>[],cancel:async()=>cancels++};
  const session=createBackgroundCreationSession({getAccount:()=>owner,getAssets:()=>[],getProject:async()=>f.project,persist:async()=>{},createImage:async()=>{},api,watch:(api,id,callbacks)=>{assert.equal(id,f.job.id);hooks=callbacks;return ()=>stops++;},onUpdate:value=>updates.push(value)});
  const pending=session.resume(f.project);await new Promise(setImmediate);hooks.onStatus({...f.job,status:'running'});await hooks.onDocument(f.document,f.job);
  const completed=await pending;assert.equal(completed.jobID,f.job.id);assert.equal(completed.completedAt,f.job.updated_at);assert.deepEqual(completed.usage,f.job.progress);assert.equal(stops,1);assert.equal(cancels,0);assert.equal(updates.at(-1).status,'completed');
  const waiting=session.resume(f.project);await new Promise(setImmediate);const rejected=assert.rejects(waiting,/账号已切换/);owner='other';session.dispose();await rejected;assert.equal(cancels,0);
});
for(const phase of ['prepare','submit'])test('stopping during '+phase+' cancels the same durable task before observing it',async()=>{
  const f=await fixture(),controller=new AbortController();let cancels=0,observed=false;
  const api={prepare:async()=>{if(phase==='prepare')controller.abort(Error('停止'));return {id:f.job.id};},submit:async()=>{controller.abort(Error('停止'));},cancel:async id=>{assert.equal(id,f.job.id);cancels++;}};
  const session=createBackgroundCreationSession({getAccount:()=> 'account',getAssets:()=>[],getProject:async()=>f.project,persist:async()=>{},createImage:async()=>{},api,watch:()=>{observed=true;}});
  await assert.rejects(session.generate({project:f.project,draft:f.project.drafts[0],assets:[],ids:[],prompt:'测试',signal:controller.signal}),/停止/);
  assert.equal(cancels,1);assert.equal(observed,false);
});

test('background creation sends selected materials as candidates rather than forcing every one onto the page',async()=>{
  const f=await fixture(),asset={id:'selected-paper',title:'星纹纸',kind:'paper',physicalWidthMM:34,physicalHeightMM:48,supply:{quantity:1}};
  f.project.requiredAssetIDs=[asset.id];f.project.materialPriority={required:[asset.id],preferred:[],available:[]};
  let sent;const controller=new AbortController();
  const api={prepare:async({document})=>{sent=document;controller.abort(Error('stopped after inspection'));return {id:f.job.id};},cancel:async()=>{}};
  const session=createBackgroundCreationSession({getAccount:()=> 'account',getAssets:()=>[asset],getProject:async()=>f.project,persist:async()=>{},api,watch:()=>{throw Error('should not observe');}});
  await assert.rejects(session.generate({project:f.project,draft:f.project.drafts[0],assets:[asset],ids:[asset.id],prompt:'自主选择素材',signal:controller.signal}),/stopped after inspection/);
  assert.deepEqual(sent.source.requiredAssetIDs,[]);
  assert.deepEqual(sent.source.materialPriority.preferred,[asset.id]);
});


test('running progress shows cumulative reported input/output tokens and restores completed turns',()=>{
 assert.equal(creativeJobProgress({status:'running',progress:{stage:'thinking',turn:4,inputTokens:12345,outputTokens:678}}),'第4轮，正在构思与编辑，累计用时0分0秒，token输入12,345，复用0，输出678');
 assert.match(creativeJobProgress({status:'completed',progress:{turns:5,inputTokens:20,outputTokens:10}}),/创作完成，累计，5轮.*token输入20，复用0，输出10/);
 assert.doesNotMatch(creativeJobProgress({status:'running',progress:{turn:1}}),/token/);
 assert.doesNotMatch(creativeJobProgress({status:'running',progress:{inputTokens:-1,outputTokens:3}}),/token/);
 assert.match(creativeJobProgress({status:'failed',error_code:'CREATIVE_CHECKPOINT_SIZE'}),/检查点超出容量/);
 assert.doesNotMatch(creativeJobProgress({status:'failed',progress:{}}),/已保留后台检查点/);
});
