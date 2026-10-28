import {randomUUID} from 'node:crypto';
import {createTicketHandler} from '../cos-tickets.mjs';
import {ServiceError,object} from './errors.mjs';

const routes=new Map([['/api/cos','POST'],['/api/platform-health','GET'],
  ['/api/storage-usage','GET'],['/api/search','POST'],['/api/search-index','POST'],
  ['/api/telemetry','POST'],['/api/account-reset','POST'],['/api/account-gc','POST']]);
const eventCodes=new Set(['sync-failed','cos-ticket-failed','cos-put-failed',
  'image-decode-failed','app-start','api-failed']);
const safeBuild=value=>/^[a-f0-9]{7,40}$/.test(value||'')?value:null;

export function sanitizeTelemetry(input){
  if(!object(input)||!Array.isArray(input.events)||input.events.length>20)
    throw new ServiceError(400,'INVALID_TELEMETRY','诊断事件格式无效');
  return input.events.map(value=>{
    if(!object(value)||!eventCodes.has(value.event))throw new ServiceError(400,'INVALID_TELEMETRY','诊断事件类型未登记');
    return {event:value.event,status:Number.isInteger(value.status)&&value.status>=100&&value.status<=599?value.status:null,
      durationMs:Number.isFinite(value.durationMs)?Math.max(0,Math.min(600000,Math.round(value.durationMs))):null,
      count:Number.isInteger(value.count)?Math.max(0,Math.min(100000,value.count)):null,
      build:safeBuild(value.build)};
  });
}
export function createCloudBaseService({verifyUser,cosReady=false,sign,rpc,searchService,
  inventory,garbageCollect,build=null,logger=console.log,clock=Date.now,windows=new Map()}={}){
  if(typeof verifyUser!=='function')throw TypeError('CloudBase 身份验证器未配置');
  // Instance-local limits absorb bursts. Paid embedding limits are additionally
  // enforced in PostgreSQL by createSearchService; these are not a global quota.
  function accept(identity,route){
    const now=clock(),key=identity.userID+':'+route,limit=route==='/api/telemetry'?4:120;
    let window=windows.get(key);
    if(!window||window.until<=now){window={until:now+60000,count:0};windows.set(key,window);}
    if(++window.count>limit)throw new ServiceError(429,'RATE_LIMITED','请求过于频繁，请稍后重试');
    if(windows.size>2048)for(const [id,item] of windows){if(item.until<=now)windows.delete(id);if(windows.size<=1024)break;}
    if(windows.size>4096)windows.delete(windows.keys().next().value);
  }
  const log=record=>{try{logger(JSON.stringify(record));}catch{/* Logs do not own the request. */}};
  return async function handle(event){
    const requestId=randomUUID(),started=clock();let status=500,code='INTERNAL',route='unknown';
    try{
      if(!object(event)||event.version!==1||!object(event.body??{})||
        Buffer.byteLength(JSON.stringify(event),'utf8')>280000)
        throw new ServiceError(400,'INVALID_ENVELOPE','请求格式或大小不符合当前协议');
      if(!routes.has(event.route))throw new ServiceError(404,'UNKNOWN_ROUTE','此 CloudBase 接口未部署');
      route=event.route;
      if(event.method!==routes.get(route))throw new ServiceError(405,'METHOD_NOT_ALLOWED','请求方法不允许');
      const token=/^Bearer ([A-Za-z0-9._~-]{20,8192})$/.exec(event.authorization||'')?.[1];
      if(!token)throw new ServiceError(401,'AUTH_REQUIRED','请先登录');
      const identity=await verifyUser(token);
      if(!identity?.userID)throw new ServiceError(401,'AUTH_REQUIRED','登录失效或账号未获授权');
      accept(identity,route);
      let body;
      if(route==='/api/cos'){
        const tickets=createTicketHandler({ready:cosReady,origins:[],authenticate:async()=>identity,sign});
        const outcome=await tickets({method:'POST',authorization:event.authorization,body:event.body});
        status=outcome.status;body=outcome.body;code=status===200?'OK':'COS_TICKET_REJECTED';
      }else if(route==='/api/platform-health'){
        let capabilities={schema:false,keyword:false,vector:false};
        let maintenance=false;
        try{const declared=await rpc('shiye_platform_capabilities_v1',token,{});
          capabilities={schema:declared?.schemaVersion===1,keyword:declared?.keyword===true,
            vector:declared?.vector===true&&searchService?.vectorEnabled===true};
        }catch(error){if(error.code!=='MIGRATION_REQUIRED')throw error;}
        try{const declared=await rpc('shiye_account_maintenance_capabilities_v1',token,{});
          maintenance=declared?.version===1&&declared?.reset===true&&declared?.gc===true;
        }catch(error){if(error.code!=='MIGRATION_REQUIRED')throw error;}
        status=200;code='OK';body={platform:'cloudbase',apiVersion:1,build:safeBuild(build),
          authentication:'verified',cos:{configured:cosReady},capabilities,
          images:'cloudbase-private-storage',logging:'structured-redacted',accountReset:maintenance};
      }else if(route==='/api/storage-usage'){
        const database=await rpc('shiye_account_storage_v1',token,{});
        const cos=inventory?await inventory(identity):{inventoryComplete:false,reason:'未配置 COS 枚举'};
        status=200;code='OK';body={scope:'current-account',database,cos};
      }else if(route==='/api/search'){
        body=await searchService.search(token,event.body);status=200;code='OK';
      }else if(route==='/api/search-index'){
        body=await searchService.index(token,event.body);status=200;code='OK';
      }else if(route==='/api/account-reset'){
        const input=event.body;
        if(input.confirmation!=='清空账号'||
          !/^[a-f0-9-]{36}$/i.test(input.operation_id||'')||
          !/^[a-f0-9-]{36}$/i.test(input.expected_epoch||'')||
          !Number.isSafeInteger(input.expected_revision)||input.expected_revision<0)
          throw new ServiceError(400,'RESET_CONFIRMATION','账号清空确认或版本无效');
        if(typeof garbageCollect!=='function')
          throw new ServiceError(503,'GC_UNAVAILABLE','云存储回收尚未配置，账号资料未清空');
        body=await rpc('shiye_reset_account_v1',token,input);
        status=202;code='OK';
      }else if(route==='/api/account-gc'){
        if(typeof garbageCollect!=='function')
          throw new ServiceError(503,'GC_UNAVAILABLE','云存储回收尚未配置');
        body=await garbageCollect(token,identity.userID);
        status=200;code='OK';
      }else{
        const events=sanitizeTelemetry(event.body);
        for(const sample of events)log({type:'shiye_client_metric',requestId,...sample});
        status=200;code='OK';body={accepted:events.length};
      }
      if(!object(body))throw new ServiceError(502,'INVALID_RESPONSE','CloudBase 服务返回格式无效');
      return {version:1,status,body,requestId};
    }catch(error){
      const known=error instanceof ServiceError;
      status=known?error.status:503;code=known?error.code:'SERVICE_UNAVAILABLE';
      return {version:1,status,body:{error:known?error.message:'CloudBase 服务暂时不可用，请凭请求编号检查服务端配置',code},requestId};
    }finally{
      // Never log event, authorization, raw error messages, query text, object
      // keys or signed URLs. The request ID is enough to correlate diagnostics.
      log({type:'shiye_api',requestId,route,status,code,
        durationMs:Math.max(0,Math.min(600000,clock()-started)),build:safeBuild(build)});
    }
  };
}
