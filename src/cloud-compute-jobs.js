import {cloudClient,cloudStorage,requireCloudUser} from './cloud-session.js';
import {cloudApiRequest} from './cloud-api-origin.js';
import {boundedMap} from './bounded-map.js';

const bucket=()=>cloudStorage().from('shiye-private');
const uuid=/^[a-f0-9-]{36}$/i;
const unwrap=(result,label)=>{
  if(result?.error)throw Object.assign(Error(label+'失败：'+result.error.message),
    {status:result.status??result.error.status??503});
  return result?.data;
};
const file=(blob)=>blob instanceof Blob&&blob.size>0;

export async function submitSegmentationJob(correctedBlob,{model,pointsPerSide=24,cropNLayers=1,
  granularity='balanced',kind='material-recognition',box=null,sourceJobId=null,
  preprocessing={illumination:false,denoise:false,localContrast:false}}={}){
  if((!sourceJobId&&!file(correctedBlob))||
    (sourceJobId&&(!uuid.test(sourceJobId)||kind!=='material-segmentation'))||
    !['sam2-tiny','sam2-small','sam2-large'].includes(model)||
    ![8,12,16,24,32].includes(Number(pointsPerSide))||![0,1,2].includes(Number(cropNLayers))||
    !['coarse','balanced','fine'].includes(granularity)||
    !['material-recognition','material-segmentation'].includes(kind)||
    !preprocessing||['illumination','denoise','localContrast'].some(key=>typeof preprocessing[key]!=='boolean')||
    (kind==='material-segmentation'&&(!Array.isArray(box)||box.length!==4||
      !box.every(Number.isInteger)||box[0]<0||box[1]<0||box[2]<=box[0]||box[3]<=box[1])))
    throw Error('分割模型或参数无效');
  const user=await requireCloudUser(),id=crypto.randomUUID(),inputPath=`${user.id}/compute/${id}/input.png`;
  if(sourceJobId){
    // CloudBase checks SELECT on the source and INSERT on this new job path.
    // A corrected page already uploaded for automatic recognition need not
    // travel from the phone again when the user adjusts a box.
    unwrap(await bucket().copy(`${user.id}/compute/${sourceJobId}/input.png`,inputPath,{upsert:false}),'识别输入复制');
  }else unwrap(await bucket().upload(inputPath,correctedBlob,{contentType:'image/png',upsert:false}),'识别输入上传');
  const parameters={pointsPerSide:Number(pointsPerSide),cropNLayers:Number(cropNLayers),granularity,
    preprocessing:{illumination:preprocessing.illumination,denoise:preprocessing.denoise,
      localContrast:preprocessing.localContrast},
    ...(kind==='material-segmentation'?{box}:{})};
  const result=await cloudClient().rpc('shiye_enqueue_compute_job_v1',{
    p_id:id,p_request_id:id,p_kind:kind,p_model:model,
    p_parameters:parameters,p_input_path:inputPath
  });
  unwrap(result,'识别任务提交');
  // If this hint is lost, the worker's reconnect/periodic queue scan recovers.
  try{const hint=await cloudApiRequest('/api/job-submit',{method:'POST',body:JSON.stringify({jobId:id})});
    if(!hint.ok)throw Error('唤醒请求未被接收');}
  catch(error){console.warn('识别任务已保存，实时唤醒暂不可用',error?.message);}
  return id;
}

async function readJob(jobId){
  const result=await cloudClient().from('shiye_compute_jobs').select('id,status,result_path,error_code')
    .eq('id',jobId).single();
  return unwrap(result,'识别任务状态查询');
}

export async function waitForSegmentationJob(jobId,{signal,onStatus=()=>{}}={}){
  if(!uuid.test(jobId||''))throw Error('任务编号无效');
  let wake=()=>{},timer;
  const pause=ms=>new Promise((resolve,reject)=>{
    let done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);wake=()=>{};
      signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
    const abort=()=>finish(signal.reason||Error('识别已取消'));
    wake=()=>finish();timer=setTimeout(wake,ms);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
  const changed=event=>{if(event.detail?.jobId===jobId)wake();};
  const focused=()=>wake();
  const visible=()=>{if(document.visibilityState==='visible')wake();};
  window.addEventListener('shiye-compute-job-notice',changed);
  window.addEventListener('online',focused);
  window.addEventListener('focus',focused);
  document.addEventListener('visibilitychange',visible);
  try{
    const deadline=Date.now()+30*60_000;
    while(Date.now()<deadline){
      if(signal?.aborted)throw signal.reason||Error('识别已取消');
      let job;
      try{job=await readJob(jobId);}
      catch(error){
        // A lost connection must not discard the durable CloudBase job.
        if(navigator.onLine===false||[0,408,429,500,502,503,504].includes(Number(error?.status))){
          onStatus('waiting-for-network');await pause(30000);continue;
        }
        throw error;
      }
      onStatus(job.status);
      if(job.status==='completed')return loadSegmentationResult(job);
      if(job.status==='failed')throw Error('模型识别失败：'+(job.error_code||'请稍后重试'));
      // Long backoff is only a lost-notice safety net, not the source of truth.
      await pause(job.status==='queued'?30000:60000);
    }
    throw Error('识别任务等待超时；结果仍保存在云端，可重新打开后检查');
  }finally{
    clearTimeout(timer);
    window.removeEventListener('shiye-compute-job-notice',changed);
    window.removeEventListener('online',focused);
    window.removeEventListener('focus',focused);
    document.removeEventListener('visibilitychange',visible);
  }
}

async function loadSegmentationResult(job){
  const user=await requireCloudUser();
  const prefix=`${user.id}/compute/${job.id}/`;
  if(!job.result_path?.startsWith(prefix)||job.result_path!==prefix+'result.json')
    throw Error('识别结果路径与当前账号不匹配');
  const blob=unwrap(await bucket().download(job.result_path),'识别结果下载');
  const manifest=JSON.parse(await blob.text());
  if(manifest.version!==1||!Array.isArray(manifest.objects)||manifest.objects.length>250||
    !Number.isInteger(manifest.width)||!Number.isInteger(manifest.height))
    throw Error('识别结果格式无效');
  return boundedMap(manifest.objects,4,async object=>{
    const [x0,y0,x1,y1]=object.bbox_xyxy||[];
    if(![x0,y0,x1,y1].every(Number.isInteger)||x0<0||y0<0||x1>manifest.width||y1>manifest.height||x1<=x0||y1<=y0||
      !/^material-\d{3}\.png$/.test(object.file||''))throw Error('识别结果区域无效');
    const maskBlob=unwrap(await bucket().download(prefix+object.file),'分割 Mask 下载');
    const bitmap=await createImageBitmap(maskBlob);
    if(bitmap.width!==x1-x0||bitmap.height!==y1-y0){bitmap.close?.();throw Error('识别结果尺寸无效');}
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close?.();
    const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const alpha=new Uint8Array(canvas.width*canvas.height);
    for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
    return {x:x0/manifest.width,y:y0/manifest.height,w:canvas.width/manifest.width,h:canvas.height/manifest.height,
      pixels:object.area,segmentationMethod:manifest.model,segmentationFailed:false,
      mask:{width:canvas.width,height:canvas.height,alpha,topologyPreserved:true}};
  });
}
