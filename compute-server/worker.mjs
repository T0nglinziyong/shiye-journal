import mqtt from 'mqtt';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile,rename,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {boundedMap} from '../src/bounded-map.js';
import {SamDaemonClient} from './sam-daemon-client.mjs';
import {OrientationDaemonClient} from './orientation-daemon-client.mjs';
import {createJobLanePool} from './job-lane-pool.mjs';
import {createCreativeWorker} from './harness/worker.mjs';

const env=process.env;
const required=['SHIYE_CLOUDBASE_ENV_ID','SHIYE_CLOUDBASE_SERVICE_KEY',
  'SHIYE_EMQX_GPU_USERNAME','SHIYE_EMQX_GPU_PASSWORD','SHIYE_GPU_WORKER_TOKEN'];
for(const key of required)if(!env[key])throw Error('Missing worker configuration: '+key);
const workerID='shiye-compute-01',topic='shiye-job';
// MQTT wakes the worker. An active client retries a lost publish; idle GPU
// operation never claims or scans the metered CloudBase database.
const gateway=`https://${env.SHIYE_CLOUDBASE_ENV_ID}.api.tcloudbasegateway.com`;
const root=path.dirname(fileURLToPath(import.meta.url));
const samRoot=env.SHIYE_SAM_ROOT||path.resolve(root,'../../sam2.1-local');
const samDaemons=[new SamDaemonClient(samRoot),new SamDaemonClient(samRoot)];
for(const daemon of samDaemons)void daemon.start().catch(error=>console.warn('SAM warmup unavailable:',error.message));
const orientationDaemon=env.SHIYE_ORIENTATION_PYTHON
  ?new OrientationDaemonClient(env.SHIYE_ORIENTATION_PYTHON):null;
if(orientationDaemon)void orientationDaemon.start().catch(error=>console.warn('Direction warmup unavailable:',error.message));
const uuid=/^[a-f0-9-]{36}$/i;
const auth={'Authorization':'Bearer '+env.SHIYE_CLOUDBASE_SERVICE_KEY};

async function jsonRequest(url,body){
  const response=await fetch(gateway+url,{method:'POST',headers:{...auth,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(Error('CloudBase request failed: HTTP '+response.status),{status:response.status});
  return payload;
}
const rpc=(name,args)=>jsonRequest('/v1/rdb/rest/rpc/'+name,args);
const objectURL=name=>gateway+'/v1/storages/object/shiye-private/'+name.split('/').map(encodeURIComponent).join('/');
async function download(name){
  const response=await fetch(objectURL(name),{headers:auth,signal:AbortSignal.timeout(60000),redirect:'error'});
  if(!response.ok)throw Object.assign(Error('CloudBase download failed: HTTP '+response.status),{status:response.status});
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!bytes.length||bytes.length>50*1024*1024)throw Error('CloudBase input size invalid');
  return bytes;
}
async function upload(name,bytes,type){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>50*1024*1024)throw Error('Output size invalid');
  const response=await fetch(objectURL(name),{method:'PUT',headers:{...auth,'content-type':type,'content-length':String(bytes.length)},
    body:bytes,signal:AbortSignal.timeout(90000),redirect:'error'});
  if(!response.ok)throw Object.assign(Error('CloudBase upload failed: HTTP '+response.status),{status:response.status});
}
async function notify(jobId,route='/api/worker-notify'){
  try{
    const response=await jsonRequest('/v1/functions/shiye-api',{
      version:1,route,method:'POST',
      authorization:'Bearer '+env.SHIYE_GPU_WORKER_TOKEN,body:{jobId}
    });
    const result=typeof response?.result==='string'?JSON.parse(response.result):(response?.result||response);
    if(result?.status!==200)throw Error('Notice was not accepted');
  }catch(error){console.warn('Completion notice unavailable; client backoff will recover:',error.message);}
}
function runPipeline(input,output,job){
  const model=job.model?.replace(/^sam2-/,'');
  if(!['tiny','small','large'].includes(model))throw Error('Unsupported model');
  const p=job.parameters||{};
  if(![8,12,16,24,32].includes(p.pointsPerSide)||![0,1,2].includes(p.cropNLayers)||
    !['coarse','balanced','fine'].includes(p.granularity)||!p.preprocessing||
    ['illumination','denoise','localContrast'].some(key=>typeof p.preprocessing[key]!=='boolean'))
    throw Error('Invalid model parameters');
  const args=[path.join(root,'run-rectified.mjs'),input,'--output',output,
    '--sam-root',env.SHIYE_SAM_ROOT||path.resolve(root,'../../sam2.1-local'),
    '--model-size',model,'--points-per-side',String(p.pointsPerSide),
    '--crop-n-layers',String(p.cropNLayers),'--granularity',p.granularity,
    '--illumination',String(p.preprocessing.illumination),
    '--denoise',String(p.preprocessing.denoise),
    '--local-contrast',String(p.preprocessing.localContrast)];
  if(job.kind==='material-segmentation'){
    if(!Array.isArray(p.box)||p.box.length!==4||!p.box.every(Number.isInteger)||
      p.box[0]<0||p.box[1]<0||p.box[2]<=p.box[0]||p.box[3]<=p.box[1])
      throw Error('Invalid SAM box prompt');
    args.push('--box',...p.box.map(String));
  }else if(job.kind!=='material-recognition')throw Error('Unsupported job kind');
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd:path.resolve(root,'..'),stdio:['ignore','pipe','pipe']});
    // Drain child output without logging image paths or provider diagnostics.
    for(const stream of [child.stdout,child.stderr])stream.resume();
    const timer=setTimeout(()=>{child.kill('SIGKILL');},15*60_000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Pipeline exit '+code));});
  });
}
async function runFastOrLegacy(input,output,job,samDaemon){
  const p=job.parameters||{};
  const hybrid=p.algorithm==='fastsam-sam2';
  if(p.algorithm!==undefined&&!hybrid)throw Error('Unsupported segmentation algorithm');
  if(hybrid&&job.model!=='sam2-small')throw Error('Hybrid requires SAM 2.1 Small');
  if(!['tiny','small','large'].includes(job.model?.replace(/^sam2-/,''))||
    ![8,12,16,24,32].includes(p.pointsPerSide)||![0,1,2].includes(p.cropNLayers)||
    !['coarse','balanced','fine'].includes(p.granularity)||!p.preprocessing||
    ['illumination','denoise','localContrast'].some(key=>typeof p.preprocessing[key]!=='boolean'))
    throw Error('Invalid model parameters');
  if(!['material-recognition','material-segmentation'].includes(job.kind)||
    (job.kind==='material-segmentation'&&(!Array.isArray(p.box)||p.box.length!==4||
      !p.box.every(Number.isInteger)||p.box[0]<0||p.box[1]<0||p.box[2]<=p.box[0]||p.box[3]<=p.box[1])))
    throw Error('Invalid SAM task kind or box');
  try{
    return await samDaemon.run({input,output,model:hybrid?'fastsam-sam2-small':job.model.replace(/^sam2-/,''),
      pointsPerSide:p.pointsPerSide,cropNLayers:p.cropNLayers,granularity:p.granularity,
      preprocessing:p.preprocessing,
      ...(job.kind==='material-segmentation'?{box:p.box}:{})});
  }catch(error){
    if(hybrid)throw error;
    console.warn('Resident SAM unavailable; retrying standalone pipeline:',error.message);
    return runPipeline(input,output,job);
  }
}
async function processJob(job,samDaemon){
  const prefix=`${job.user_id}/compute/${job.id}/`;
  if(!uuid.test(job.id)||!/^\d{10,22}$/.test(job.user_id)||job.input_path!==prefix+'input.png'||
    !Number.isInteger(job.attempts)||job.attempts<1||job.attempts>3)throw Error('Claimed job invalid');
  const temp=await mkdtemp(path.join(os.tmpdir(),'shiye-compute-'));
  const started=performance.now(),stages={};
  try{
    const input=path.join(temp,'input.png'),output=path.join(temp,'output');
    await writeFile(input,await download(job.input_path));
    stages.downloadMs=Math.round(performance.now()-started);
    const orientationPreparation=orientationDaemon&&job.kind==='material-recognition'
      ?orientationDaemon.prepare(input).catch(error=>{
          console.warn('Direction prepass unavailable:',error.message);return null;
        }):null;
    await runFastOrLegacy(input,output,job,samDaemon);
    stages.modelMs=Math.round(performance.now()-started-stages.downloadMs);
    const materials=path.join(output,'materials');
    const manifestPath=path.join(materials,'result.json');
    if(orientationDaemon&&job.kind==='material-recognition'){
      const orientationStarted=performance.now();
      const locations=await orientationPreparation;
      try{await orientationDaemon.run(input,manifestPath,locations);}
      catch(error){console.warn('Direction inference unavailable; using geometric alignment:',error.message);}
      stages.orientationMs=Math.round(performance.now()-orientationStarted);
    }
    const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    if(![1,2].includes(manifest.version)||!manifest.objects.length||manifest.objects.length>250)
      throw Error('Model produced no usable masks or too many objects');
    if(manifest.version===1)await boundedMap(manifest.objects,4,async item=>{
      if(!/^material-\d{3}\.png$/.test(item.file))throw Error('Output file invalid');
      await upload(prefix+item.file,await readFile(path.join(materials,item.file)),'image/png');
    });
    await upload(prefix+'result.json',Buffer.from(JSON.stringify(manifest)),'application/json');
    stages.uploadMs=Math.round(performance.now()-started-stages.downloadMs-stages.modelMs-(stages.orientationMs||0));
    const finished=await rpc('shiye_finish_compute_job_v1',{
      p_id:job.id,p_worker_id:workerID,p_attempt:job.attempts,p_result_path:prefix+'result.json'});
    if(finished?.status!=='completed')throw Error('Job completion not committed');
    await notify(job.id);
    console.log('Completed job',job.id,'objects',manifest.objects.length,'timing',JSON.stringify({
      ...stages,totalMs:Math.round(performance.now()-started)}));
  }catch(error){
    console.error('Job failed',job.id,error.message);
    try{
      const state=await rpc('shiye_finish_compute_job_v1',{
        p_id:job.id,p_worker_id:workerID,p_attempt:job.attempts,p_error_code:'COMPUTE_FAILED'});
      if(state?.status==='failed')await notify(job.id);
      else if(state?.status==='queued')setTimeout(()=>lanes.hint(job.id),job.attempts===1?31_000:91_000);
    }catch(finishError){console.error('Failed to update job',job.id,finishError.message);}
  }finally{await rm(temp,{recursive:true,force:true});}
}
const lanes=createJobLanePool({slots:samDaemons,
  claim:requested=>rpc('shiye_claim_compute_job_v1',{p_worker_id:workerID,p_id:requested}),
  process:(job,daemon)=>processJob(job,daemon),
  notifyFailed:id=>uuid.test(id)?notify(id):Promise.resolve(),
  onError:error=>console.error('Compute lane stopped:',error.message)});
const query=async(table,params)=>{
  const url=new URL(gateway+'/v1/rdb/rest/'+table);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  const response=await fetch(url,{headers:{...auth,accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('CloudBase creative query failed: HTTP '+response.status);return response.json();
};
const creative=env.SHIYE_CREATIVE_API_KEY?createCreativeWorker({key:env.SHIYE_CREATIVE_API_KEY,dns:env.SHIYE_CREATIVE_DNS||'system',samRoot,rpc,
  store:{download,upload},notify:id=>notify(id,'/api/creative-worker-notify'),
  listCheckpoints:id=>query('shiye_creative_checkpoints',{select:'job_id,seq,object_path,object_hash',job_id:'eq.'+id,order:'seq.asc',limit:'512'}),
  lookup:async id=>(await query('shiye_creative_jobs',{select:'id,status,lease_until',id:'eq.'+id}))[0],
  listActive:async()=>{
    const result=[];
    for(let offset=0;;offset+=100){const rows=await query('shiye_creative_jobs',{select:'id',status:'in.(queued,running)',order:'created_at.asc,id.asc',limit:'100',offset:String(offset)});result.push(...rows);if(rows.length<100)return result;}
  }
}):null;
const client=mqtt.connect('mqtts://g9eb1e1c.ala.cn-hangzhou.emqxsl.cn:8883',{
  clientId:workerID,username:env.SHIYE_EMQX_GPU_USERNAME,password:env.SHIYE_EMQX_GPU_PASSWORD,
  clean:false,reconnectPeriod:3000,connectTimeout:15000,protocolVersion:5,rejectUnauthorized:true,
  keepalive:30,properties:{sessionExpiryInterval:86400}
});
client.on('connect',()=>client.subscribe(topic,{qos:1},error=>{
  if(error)console.error('MQTT subscribe failed:',error.message);
  else{console.log('拾页计算服务器 connected; waiting for MQTT jobs');
    void creative?.recover().catch(error=>console.warn('Creative recovery unavailable:',error.message));}
}));
client.on('message',(incoming,bytes)=>{
  if(incoming!==topic||bytes.length>4096)return;
  try{const event=JSON.parse(bytes.toString());
    if(!uuid.test(event.jobId))return;
    if(event.type==='job_queued')lanes.hint(event.jobId);
    if(event.type==='creative_queued')creative?.hint(event.jobId);
    if(event.type==='creative_cancelled')void creative?.cancelHint(event.jobId).catch(error=>console.warn('Creative cancellation check unavailable:',error.message));}
  catch{/* Invalid notifications do not affect authoritative database state. */}
});
client.on('error',error=>console.error('MQTT connection unavailable:',error.message));
let shuttingDown=false;
let draining=false;
const statusPath=env.SHIYE_RUNTIME_STATUS;
async function runtimeStatus(){
  if(!statusPath)return;
  await mkdir(path.dirname(statusPath),{recursive:true});
  const temp=statusPath+'.tmp';
  await writeFile(temp,JSON.stringify({pid:process.pid,root:path.resolve(root,'..'),updatedAt:Date.now(),draining,busy:lanes.busy||Boolean(creative?.busy)}),{mode:0o600});
  await rename(temp,statusPath);
}
const statusTimer=setInterval(()=>void runtimeStatus().catch(()=>{}),2000);statusTimer.unref();
process.on('SIGUSR1',()=>{
  if(draining)return;draining=true;
  client.end(false,{},()=>void runtimeStatus());
});
async function shutdown(){
  if(shuttingDown)return;shuttingDown=true;
  clearInterval(statusTimer);
  const timeout=setTimeout(()=>process.exit(0),20000);timeout.unref();
  await new Promise(resolve=>client.end(false,{},resolve));
  await creative?.close();
  for(const daemon of samDaemons)daemon.stop();orientationDaemon?.stop();
  process.exit(0);
}
process.once('SIGTERM',()=>void shutdown());process.once('SIGINT',()=>void shutdown());
