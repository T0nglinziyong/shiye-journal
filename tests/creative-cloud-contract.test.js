import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudCheckpointJournal,creativeObjectHash} from '../creative-agent/runtime/cloud-journal.mjs';
import {normalizeSegmentationGeometry,compileSegmentationCuts} from '../creative-agent/runtime/segmentation.mjs';
import {createCloudBaseService} from '../server/cloudbase/service.mjs';
import {createCloudCreativeJobs,watchCloudCreativeJob} from '../src/cloud-creative-jobs.js';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';

const id='11111111-1111-4111-8111-111111111111',owner='10000000001',other='10000000002';
const envelope=route=>({version:1,method:'POST',route,authorization:'Bearer '+'u'.repeat(40),body:{jobId:id}});
test('creative wake and cancellation only use the verified owner; committed cancel survives broker failure',async()=>{
  let ownerSeen,published=0,cancelled=0;
  const handler=createCloudBaseService({verifyUser:async()=>({userID:owner}),logger:()=>{},
    creativeJobLookup:async(job,token,user)=>{ownerSeen=user;return user===owner?{id:job,user_id:owner,status:'running'}:null;},
    realtimePublish:async()=>{published++;throw Error('offline');},rpc:async(name,token,args)=>{assert.equal(name,'shiye_cancel_creative_job_v1');assert.equal(args.p_id,id);cancelled++;return {status:'cancelled'};}});
  assert.equal((await handler(envelope('/api/creative-cancel'))).status,200);assert.equal(ownerSeen,owner);assert.equal(cancelled,1);assert.equal(published,2);
  assert.equal((await handler({...envelope('/api/creative-submit'),body:{jobId:id,userID:other}})).status,400);
});
test('creative worker notification reveals only an id and goes to the database owner',async()=>{
  const published=[];
  const handler=createCloudBaseService({verifyUser:async()=>{throw Error('not a user route');},workerToken:'w'.repeat(40),logger:()=>{},
    creativeJobLookup:async()=>({id,user_id:owner,status:'running'}),realtimePublish:async(topic,data)=>published.push({topic,data})});
  assert.equal((await handler(envelope('/api/creative-worker-notify'))).status,403);
  assert.equal((await handler({...envelope('/api/creative-worker-notify'),authorization:'Bearer '+'w'.repeat(40)})).status,200);
  assert.equal(published[0].topic,'shiye/users/'+owner+'/sync');assert.equal(published[0].data.type,'creative_changed');
  assert.equal(published[0].data.jobId,id);
});
test('cloud journal verifies private paths, sequence, compressed hashes and uncertain append receipts',async()=>{
  const blobs=new Map(),rows=[];let lost=true;
  const job={id,user_id:owner,checkpoint_seq:0,lease_token:'lease'},store={upload:async(path,bytes)=>blobs.set(path,bytes),download:async path=>blobs.get(path)};
  const rpc=async(name,args)=>{
    assert.equal(name,'shiye_append_creative_checkpoint_v1');assert.equal(args.p_lease,'lease');
    if(!rows.some(r=>r.seq===args.p_seq))rows.push({job_id:id,seq:args.p_seq,object_path:args.p_path,object_hash:args.p_hash});
    if(lost){lost=false;throw Error('response lost');}return {seq:args.p_seq};
  };
  const journal=cloudCheckpointJournal({job,store,rpc,list:async()=>rows}),entry={method:'put',type:'json',data:'private-model-context'};
  await assert.rejects(journal.append(entry),/response lost/);await journal.append(entry);assert.equal(rows.length,1);
  assert.deepEqual(await cloudCheckpointJournal({job:{...job,checkpoint_seq:1},store,rpc,list:async()=>rows}).read(),[entry]);
  const bad={...rows[0],object_path:other+'/creative/'+id+'/checkpoints/'+rows[0].object_hash.slice(7)+'.json.gz'};
  await assert.rejects(cloudCheckpointJournal({job:{...job,checkpoint_seq:1},store,rpc,list:async()=>[bad]}).read(),/不属于/);
  const path=rows[0].object_path;blobs.set(path,Buffer.from('corrupted'));
  await assert.rejects(cloudCheckpointJournal({job:{...job,checkpoint_seq:1},store,rpc,list:async()=>rows}).read(),/校验失败/);
});
test('SAM contour cleanup drops only tiny disconnected noise and keeps real holes',()=>{
  const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
  const raw=[[rect(.1,.1,.7,.7),rect(.3,.3,.1,.1)],[rect(.9,.9,.005,.005)]];
  const result=normalizeSegmentationGeometry(raw);assert.equal(result.geometry.length,1);assert.equal(result.geometry[0].length,2);assert.ok(result.discardedAreaRatio<.01);
  assert.throws(()=>normalizeSegmentationGeometry([[rect(0,0,.4,.4)],[rect(.6,.6,.4,.4)]]),/多个分离主体/);
  assert.throws(()=>compileSegmentationCuts({document:{page:{layers:[{id:'other',type:'material',assetID:'foreign'}]},source:{materials:[{alias:'m1',assetID:'allowed'}],sourceSnapshots:[{assetID:'allowed',sourceRevision:'version'}]}},proposals:[{id:'p',alias:'m1',sourceRevision:'version',geometry:result.geometry}],cuts:[{target:'other',proposalId:'p',mode:'keep'}]}),/来源不一致/);
});
test('creative submission survives a lost enqueue reply and reuses its immutable input on retry',async()=>{
  const records=new Map(),blobs=new Map();let enqueues=0;
  const bucket={upload:async(path,blob)=>{if(blobs.has(path))return {error:{status:409,message:'exists'}};blobs.set(path,blob);return {data:{path}};},download:async path=>({data:blobs.get(path)})};
  const api=createCloudCreativeJobs({user:async()=>({id:owner}),storage:()=>({from:()=>bucket}),
    device:{put:async(user,value)=>records.set(user+value.id,value),get:async(user,key)=>records.get(user+key),delete:async(user,key)=>records.delete(user+key),list:async()=>[...records.values()]},
    client:()=>({rpc:async()=>{if(++enqueues===1)throw Error('response lost');return {data:{id,status:'queued'}};}}),request:async()=>({ok:true})});
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const reference=await api.prepare({projectID:'project',document,brief:{},id});
  await assert.rejects(api.submit(reference),/response lost/);assert.equal(records.size,1);
  const result=await api.submit(reference);assert.equal(result.status,'queued');assert.equal(records.size,0);assert.equal(blobs.size,1);
  assert.equal(Object.hasOwn(JSON.parse(await [...blobs.values()][0].text()),'images'),false);
});
test('restored phone watcher loads the already completed result without resubmitting a job',async()=>{
  const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';let loaded=0,woken=0,finish;
  const completed=new Promise(resolve=>{finish=resolve;});
  const stop=watchCloudCreativeJob({read:async()=>({id,status:'completed',revision:8,result_path:'result'}),document:async()=>({page:{}}),wake:async()=>woken++},id,
    {windowObject:win,documentObject:doc,onDocument:async()=>{loaded++;finish();}});
  await completed;stop();assert.equal(loaded,1);assert.equal(woken,0);
});
test('creative cancellation is wired through the real database RPC allowlist',async()=>{
  const {createPostgresRPC}=await import('../server/cloudbase/postgres.mjs');let called=false;
  const rpc=createPostgresRPC({envId:'shiye-test',fetcher:async(url,options)=>{called=true;assert.ok(url.endsWith('/shiye_cancel_creative_job_v1'));assert.equal(JSON.parse(options.body).p_id,id);return new Response(JSON.stringify({status:'cancelled'}));}});
  assert.equal((await rpc('shiye_cancel_creative_job_v1','a'.repeat(32),{p_id:id})).status,'cancelled');assert.equal(called,true);
});
