import {cloudClient,cloudStorage,requireCloudUser} from './cloud-session.js';
import {cloudApiRequest} from './cloud-api-origin.js';
import {localDeviceRecords} from './local-device-records.js';
import {boundedMap} from './bounded-map.js';
import {validateCreativeJobPackage,CREATIVE_JOB_FORMAT} from './creative-job-package.js';
import {validateV3SceneDocument} from './v3-scene-schema.js';
import {creationResourceVersion} from './generated/creation-resources.js';

const prefix='creative-upload-v1:';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const hash=async blob=>'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
const unwrap=(value,label)=>{if(value?.error)throw Object.assign(Error(label+'：'+value.error.message),{status:value.status??value.error.status});return value.data;};

export function createCloudCreativeJobs({client=cloudClient,storage=cloudStorage,user=requireCloudUser,request=cloudApiRequest,device=localDeviceRecords}={}){
  const bucket=()=>storage().from('shiye-private');
  const account=async expected=>{const current=await user();if(expected&&current.id!==expected)throw Error('账号已切换，创作结果仍保留在原账号');return current.id;};
  const wake=async id=>{const response=await request('/api/creative-submit',{method:'POST',body:JSON.stringify({jobId:id})});if(!response.ok)throw Error('创作已保存，服务器唤醒待重试');};
  const api={
    async prepare({projectID,document,brief,images,id=crypto.randomUUID()}){
      const owner=await account();if(!uuid.test(id))throw Error('创作任务编号无效');
      const blobs=await boundedMap(images,4,async({alias,blob})=>{
        if(!(blob instanceof Blob)||blob.type!=='image/png'||!blob.size||blob.size>20*1024*1024)throw Error('创作素材必须是有效 PNG');
        const sha256=await hash(blob);return {alias,sha256,path:`${owner}/creative/${id}/assets/${sha256.slice(7)}.png`,blob};
      });
      const input=validateCreativeJobPackage({format:CREATIVE_JOB_FORMAT,document,brief:{...brief,resourceVersion:creationResourceVersion},images:blobs.map(({blob,...item})=>item)},{userID:owner,jobID:id});
      await account(owner);
      await device.put(owner,{id:prefix+id,jobID:id,projectID,input,blobs});
      return {id,owner,projectID};
    },
    async submit({id,owner}){
      await account(owner);const saved=await device.get(owner,prefix+id);if(!saved)throw Error('创作上传记录不存在');
      const upload=async(path,blob)=>{
        await account(owner);
        const result=await bucket().upload(path,blob,{contentType:blob.type,upsert:false});
        if(result.error){
          if(![400,409].includes(Number(result.status??result.error.status??result.error.statusCode)))unwrap(result,'创作输入上传失败');
          const existing=unwrap(await bucket().download(path),'核对已上传创作输入失败');
          if(await hash(existing)!==await hash(blob))throw Error('已上传创作输入与本次内容不一致');
        }
      };
      await boundedMap(saved.blobs,4,({path,blob})=>upload(path,blob));
      const inputBlob=new Blob([JSON.stringify(saved.input)],{type:'application/json'}),inputHash=await hash(inputBlob);
      await upload(`${owner}/creative/${id}/input.json`,inputBlob);await account(owner);
      const result=unwrap(await client().rpc('shiye_enqueue_creative_job_v1',{p_id:id,p_request_id:id,p_project_id:saved.projectID,p_input_hash:inputHash}),'创作提交失败');
      await account(owner);await wake(id);await account(owner);await device.delete(owner,prefix+id);
      return {...result,notified:true};
    },
    async pending(){const owner=await account();return (await device.list(owner,prefix)).map(row=>({id:row.jobID,projectID:row.projectID,owner}));},
    async read(id){if(!uuid.test(id))throw Error('创作任务编号无效');await account();return unwrap(await client().from('shiye_creative_jobs').select('id,project_id,status,progress,result_path,revision,error_code,created_at,updated_at,deadline_at,lease_until').eq('id',id).single(),'创作状态读取失败');},
    async recent(){await account();return unwrap(await client().from('shiye_creative_jobs').select('id,project_id,status,progress,result_path,revision,error_code,created_at,updated_at,deadline_at').order('created_at',{ascending:false}).limit(50),'创作任务读取失败');},
    async document(job,{preview=false}={}){
      const owner=await account(),path=preview?job.progress?.documentPath:job.result_path;
      const match=new RegExp('^'+owner+'/creative/'+job.id+'/'+(preview?'previews':'results')+'/([a-f0-9]{64})\\.json$').exec(path||'');
      if(!uuid.test(job.id)||!match)throw Error('创作结果路径无效');
      const blob=unwrap(await bucket().download(path),'创作结果下载失败');
      if(blob.size>8*1024*1024||await hash(blob)!=='sha256:'+match[1])throw Error('创作结果指纹不一致');
      const result=JSON.parse(await blob.text());validateV3SceneDocument(result);await account(owner);return result;
    },
    async preview(job){
      const owner=await account(),path=job.progress?.previewPath;
      const match=new RegExp('^'+owner+'/creative/'+job.id+'/previews/([a-f0-9]{64})\\.png$').exec(path||'');
      if(!uuid.test(job.id)||!match)throw Error('创作预览路径无效');
      const blob=unwrap(await bucket().download(path),'创作预览读取失败');
      if(blob.size>8*1024*1024||await hash(blob)!=='sha256:'+match[1])throw Error('创作预览指纹不一致');
      await account(owner);return blob;
    },
    async cancel(id){if(!uuid.test(id))throw Error('创作任务编号无效');const owner=await account();
      const saved=await device.get(owner,prefix+id);
      if(saved){
        // A lost enqueue response may already have created a durable job.
        const result=await client().from('shiye_creative_jobs').select('id').eq('id',id).maybeSingle();
        const existing=unwrap(result,'核对创作任务失败');
        if(!existing){await device.delete(owner,prefix+id);return {status:'cancelled'};}
      }
      const response=await request('/api/creative-cancel',{method:'POST',body:JSON.stringify({jobId:id})});
      if(!response.ok)throw Error('停止请求尚未确认，请恢复连接后重试');
      await account(owner);await device.delete(owner,prefix+id);return response.json();
    },
    wake
  };
  return api;
}

export function watchCloudCreativeJob(api,id,{onStatus=()=>{},onDocument=()=>{},onError=()=>{},windowObject=globalThis.window,documentObject=globalThis.document}={}){
  let closed=false,busy=false,again=false,timer=null,revision=-1,path=null,lastWake=0;
  const poll=async()=>{
    if(closed||documentObject.visibilityState==='hidden')return;
    if(busy){again=true;return;}busy=true;clearTimeout(timer);
    try{
      const job=await api.read(id);if(closed)return;
      if(job.revision!==revision){onStatus(job);revision=job.revision;}
      if(closed)return;
      const documentPath=job.result_path||job.progress?.documentPath;
      if(documentPath&&documentPath!==path){const doc=await api.document(job,{preview:!job.result_path});if(closed)return;await onDocument(doc,job);path=documentPath;}
      if(['queued','running'].includes(job.status)){
        if(Date.now()-lastWake>60000){lastWake=Date.now();void api.wake(id).catch(onError);}
        timer=setTimeout(poll,30000);
      }
    }catch(error){if(!closed){onError(error);timer=setTimeout(poll,30000);}}
    finally{busy=false;if(again&&!closed){again=false;void poll();}}
  };
  const hint=event=>{if(event.detail?.jobId===id)void poll();};
  const foreground=()=>void poll();
  windowObject.addEventListener('shiye-creative-job-notice',hint);windowObject.addEventListener('focus',foreground);windowObject.addEventListener('online',foreground);
  documentObject.addEventListener('visibilitychange',foreground);void poll();
  return ()=>{closed=true;clearTimeout(timer);windowObject.removeEventListener('shiye-creative-job-notice',hint);windowObject.removeEventListener('focus',foreground);windowObject.removeEventListener('online',foreground);documentObject.removeEventListener('visibilitychange',foreground);};
}
