import {sweepComputeJobs} from './retention.mjs';

const env=process.env;
const apply=process.argv.slice(2).includes('--apply');
if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw Error('Unknown cleanup option');
if(!env.SHIYE_CLOUDBASE_ENV_ID||!env.SHIYE_CLOUDBASE_SERVICE_KEY)
  throw Error('Compute cleanup credentials are missing');
const gateway=`https://${env.SHIYE_CLOUDBASE_ENV_ID}.api.tcloudbasegateway.com`;
const headers={Authorization:'Bearer '+env.SHIYE_CLOUDBASE_SERVICE_KEY,Accept:'application/json'};
const objectURL=name=>gateway+'/v1/storages/object/shiye-private/'+name.split('/').map(encodeURIComponent).join('/');
async function request(url,options={}){
  const response=await fetch(url,{headers,...options,cache:'no-store',redirect:'error',
    signal:AbortSignal.timeout(30000)});
  if(!response.ok&&!(options.method==='DELETE'&&response.status===404))
    throw Object.assign(Error('CloudBase cleanup request failed: HTTP '+response.status),{status:response.status});
  return response;
}
const table=()=>new URL(gateway+'/v1/rdb/rest/shiye_compute_jobs');
async function list(cutoff,limit){
  const url=table();
  url.searchParams.set('select','id,user_id,status,input_path,result_path,updated_at');
  url.searchParams.set('status','in.(completed,failed)');
  url.searchParams.set('updated_at','lt.'+cutoff);
  url.searchParams.set('order','updated_at.asc');
  url.searchParams.set('limit',String(limit));
  return (await request(url)).json();
}
async function readManifest(name){
  let response;
  try{response=await request(objectURL(name));}
  catch(error){
    // A previous attempt may have removed every object but failed to remove
    // the database row. The manifest is always the last object deleted.
    if(error.status===404)return {version:2,objects:[]};
    throw error;
  }
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>20_000_000)throw Error('Compute manifest is too large');
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}
async function removeObject(name){await request(objectURL(name),{method:'DELETE'});}
async function removeJob(id,cutoff){
  const url=table();url.searchParams.set('id','eq.'+id);
  url.searchParams.set('status','in.(completed,failed)');
  url.searchParams.set('updated_at','lt.'+cutoff);
  const response=await request(url,{method:'DELETE',headers:{...headers,Prefer:'return=representation'}});
  const rows=await response.json().catch(()=>[]);
  return Array.isArray(rows)&&rows.length===1;
}
const totals={deleted:0,failed:0,scanned:0,more:false,cutoff:null};
for(let page=0;page<100;page++){
  const summary=await sweepComputeJobs({list,readManifest,
    removeObject:apply?removeObject:async()=>{},
    removeJob:apply?removeJob:async()=>false});
  totals.deleted+=summary.deleted;totals.failed+=summary.failed;
  totals.scanned+=summary.scanned;totals.more=summary.more;totals.cutoff=summary.cutoff;
  if(!apply||!summary.more||!summary.deleted)break;
}
const summary=totals;
console.log('Compute retention',JSON.stringify({...summary,mode:apply?'apply':'dry-run'}));
if(summary.failed)process.exitCode=1;
