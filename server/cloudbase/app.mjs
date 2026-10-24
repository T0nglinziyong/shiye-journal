import COS from 'cos-nodejs-sdk-v5';
import {cosCredentials} from './credentials.mjs';
import {verifyCloudBaseUser} from '../cloudbase-user.mjs';
import {createCloudBaseService} from './service.mjs';
import {createPostgresRPC} from './postgres.mjs';
import {embeddingConfiguration,createEmbeddingClient} from './embeddings.mjs';
import {createSearchService} from './search.mjs';
import {createStorageGarbageCollector} from './storage-gc.mjs';

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
  const search=createSearchService({rpc,modelKey:config?.modelKey,
    embed:async inputs=>{if(configurationError)throw configurationError;return createEmbeddingClient(config)(inputs);}});
  search.vectorEnabled=!!config;
  const handle=createCloudBaseService({
    verifyUser:token=>verifyCloudBaseUser(token,{envId}),cosReady:ready,rpc,searchService:search,
    garbageCollect,
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
