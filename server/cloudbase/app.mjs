import COS from 'cos-nodejs-sdk-v5';
import {cosCredentials} from './credentials.mjs';
import {verifyCloudBaseUser} from '../cloudbase-user.mjs';
import {createCloudBaseService} from './service.mjs';
import {createPostgresRPC} from './postgres.mjs';
import {embeddingConfiguration,createEmbeddingClient} from './embeddings.mjs';
import {createSearchService} from './search.mjs';
import {createStorageGarbageCollector} from './storage-gc.mjs';
import {createCloudMaterialClassifier} from './classification.mjs';
import {ServiceError} from './errors.mjs';

const burstWindows=new Map();
const tiers=new Set([256,360,480,600,720,960,1200,1440,1920,2560,3200,3840,5120]);
export async function main(event,context){
  // Read credentials per invocation: CloudBase event-function instances can be
  // reused after temporary credentials rotate. No per-user identity is global.
  const env=process.env,envId=env.SHIYE_CLOUDBASE_ENV_ID;
  const credentials=cosCredentials(env);
  const bucket=env.SHIYE_COS_BUCKET,region=env.SHIYE_COS_REGION;
  const ready=!!(credentials&&bucket&&region);
  const cos=ready?new COS(credentials):null;
  let config=null,configurationError=null;
  try{config=embeddingConfiguration(env);}catch(error){configurationError=error;}
  const rpc=createPostgresRPC({envId});
  const garbageCollect=createStorageGarbageCollector({envId,rpc});
  const classifyAsset=createCloudMaterialClassifier({envId,env,commit:rpc});
  const search=createSearchService({rpc,modelKey:config?.modelKey,
    embed:async inputs=>{if(configurationError)throw configurationError;return createEmbeddingClient(config)(inputs);}});
  search.vectorEnabled=!!config;
  const handle=createCloudBaseService({
    verifyUser:token=>verifyCloudBaseUser(token,{envId}),cosReady:ready,rpc,searchService:search,
    garbageCollect,classifyAsset,realtimePublish:publishRealtimeEvent,realtimeReady:realtimeConfigured(env),
    realtimeCredentials:userID=>realtimeUserCredential(userID,env),
    jobLookup:(id,token,userID)=>lookupComputeJob(id,token||env.SHIYE_CLOUDBASE_SERVICE_KEY,{envId,userID}),
    workerToken:env.SHIYE_GPU_WORKER_TOKEN,
    build:env.SHIYE_BUILD_SHA,windows:burstWindows,
    sign:async({path,method,headers,variant})=>{
      const edge=variant?Number(/^preview([1-9]\d{0,3})$/.exec(variant)?.[1]):null;
      if(variant&&!tiers.has(edge))throw Error('Unknown image derivative');
      return new Promise((resolve,reject)=>cos.getObjectUrl({Bucket:bucket,Region:region,Key:path,
        Method:method,Protocol:'https:',Sign:true,Expires:60,Headers:headers,
        ...(edge?{QueryString:`imageMogr2/thumbnail/${edge}x${edge}/format/webp/quality/90`}:{})},
      (error,data)=>error?reject(error):resolve(data.Url)));
    },
    inventory:async identity=>{
      if(!cos)return {inventoryComplete:false,objectCount:null,totalBytes:null,reason:'COS 未配置'};
      const prefix=identity.userID+'/';let marker=null,count=0,totalBytes=0,pages=0,complete=false;
      const groups={original:{count:0,bytes:0},derivative:{count:0,bytes:0},document:{count:0,bytes:0},other:{count:0,bytes:0}};
      do{
        const data=await new Promise((resolve,reject)=>cos.getBucket({Bucket:bucket,Region:region,
          Prefix:prefix,MaxKeys:1000,...(marker?{Marker:marker}:{})},(error,result)=>error?reject(error):resolve(result)));
        for(const item of data.Contents||[]){
          if(typeof item.Key!=='string'||!item.Key.startsWith(prefix))throw Error('Inventory scope mismatch');
          const size=Number(item.Size);if(!Number.isSafeInteger(size)||size<0)throw Error('Invalid inventory size');
          const name=item.Key.slice(item.Key.lastIndexOf('/')+1);
          const kind=name.endsWith('-preview480.webp')?'derivative':name.includes('-project.json')?'document':/^[a-f0-9]{64}$/.test(name)?'original':'other';
          count++;totalBytes+=size;groups[kind].count++;groups[kind].bytes+=size;
        }
        pages++;
        if(data.IsTruncated!==true&&data.IsTruncated!=='true'){complete=true;break;}
        if(!data.NextMarker||data.NextMarker===marker)throw Error('Inventory cursor did not advance');
        marker=data.NextMarker;
      }while(pages<5);
      return {objectCount:count,totalBytes,groups,inventoryComplete:complete,
        referencesComplete:false,safelyDeletableBytes:0,measuredAt:new Date().toISOString(),
        warning:complete?'本账号对象实际用量；枚举不代表任何对象可删除':'只统计前 5,000 个对象；结果不完整，不能据此删除对象'};
    }
  });
  return handle(event,context);
}

// EMQX carries small change notifications; CloudBase remains authoritative.
export function realtimeConfigured(env=process.env){
  return !!(env.SHIYE_EMQX_API_BASE&&env.SHIYE_EMQX_APP_ID&&env.SHIYE_EMQX_APP_SECRET);
}
export function realtimeUserCredential(userID,env=process.env){
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(userID||''))return null;
  let accounts;
  try{accounts=JSON.parse(env.SHIYE_EMQX_USER_CREDENTIALS_B64
    ?Buffer.from(env.SHIYE_EMQX_USER_CREDENTIALS_B64,'base64').toString('utf8')
    :env.SHIYE_EMQX_USER_CREDENTIALS||'{}');}catch{return null;}
  const entry=accounts?.[userID];
  // The credential map exists only in the cloud function environment. Each
  // username has an exact-topic subscribe ACL in EMQX Serverless.
  return entry&&typeof entry.username==='string'&&/^shiye-user-[A-Za-z0-9_-]{1,64}$/.test(entry.username)&&
    typeof entry.password==='string'&&entry.password.length>=20
    ?{username:entry.username,password:entry.password}:null;
}
export async function lookupComputeJob(id,token,{envId,userID,fetcher=fetch}={}){
  if(!/^[a-f0-9-]{36}$/i.test(id||'')||!token||!envId)return null;
  const url=new URL(`https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/shiye_compute_jobs`);
  url.searchParams.set('select','id,user_id,status');
  url.searchParams.set('id','eq.'+id);
  if(userID)url.searchParams.set('user_id','eq.'+userID);
  const response=await fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok)throw new ServiceError(503,'JOB_LOOKUP_FAILED','任务查询暂不可用');
  const rows=await response.json();
  return Array.isArray(rows)&&rows[0]?.id===id&&(!userID||rows[0]?.user_id===userID)?rows[0]:null;
}
export async function publishRealtimeEvent(topic,payload,{env=process.env,fetcher=fetch}={}){
  if(!realtimeConfigured(env))throw new ServiceError(503,'REALTIME_UNAVAILABLE','实时通知尚未配置');
  const base=new URL(env.SHIYE_EMQX_API_BASE);
  if(base.origin!=='https://g9eb1e1c.ala.cn-hangzhou.emqxsl.cn:8443'||base.pathname!=='/api/v5'||base.search||base.hash||base.username||base.password)
    throw new ServiceError(503,'REALTIME_CONFIGURATION','实时通知地址配置无效');
  if(typeof topic!=='string'||topic.length>256||/[+#\u0000]/.test(topic)||!(topic==='shiye-job'||topic.startsWith('shiye/users/')||topic.startsWith('shiye/diagnostics/')))
    throw new ServiceError(400,'INVALID_REALTIME_TOPIC','实时通知主题无效');
  const text=JSON.stringify(payload);
  if(!text||Buffer.byteLength(text,'utf8')>4096)throw new ServiceError(400,'INVALID_REALTIME_PAYLOAD','实时通知内容过大');
  let response,data;
  try{
    response=await fetcher(base.href+'/publish',{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
      headers:{'content-type':'application/json','authorization':'Basic '+Buffer.from(env.SHIYE_EMQX_APP_ID+':'+env.SHIYE_EMQX_APP_SECRET).toString('base64')},
      body:JSON.stringify({topic,qos:1,retain:false,payload_encoding:'plain',payload:text})});
    data=await response.json();
  }catch{throw new ServiceError(503,'REALTIME_PUBLISH_FAILED','实时通知暂时不可用，请稍后重试');}
  if(response.status===200&&typeof data?.id==='string')return {accepted:true,messageId:data.id,subscribersMatched:true};
  if(response.status===202&&data?.reason_code===16)return {accepted:true,messageId:null,subscribersMatched:false};
  throw new ServiceError(503,'REALTIME_PUBLISH_FAILED','实时通知发布失败，请稍后重试');
}
