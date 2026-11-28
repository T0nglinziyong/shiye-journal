import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const runnerDefault=fileURLToPath(new URL('./test-creative-harness-real.mjs',import.meta.url));
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
const positiveInt=n=>Number.isInteger(n)&&n>0;

export function prepareCreativeBatch(manifest,manifestPath,outputRoot){
  if(!manifest||!Array.isArray(manifest.cases)||!manifest.cases.length||!Array.isArray(manifest.variants)||!manifest.variants.length)throw Error('manifest 需要非空 cases 和 variants 数组');
  const base=dirname(resolve(manifestPath)),root=resolve(outputRoot),seen=new Set(),jobs=[];
  for(const source of manifest.cases){
    if(!safeId(source.id)||!source.package||typeof source.package!=='string')throw Error('案例需要合法 id 和 package');
    const packagePath=resolve(base,source.package);
    for(const variant of manifest.variants){
      if(!safeId(variant.id))throw Error('配置需要合法 id');
      if(variant.effort!==undefined&&!['low','high','max'].includes(variant.effort))throw Error('effort 只支持 low/high/max');
      if(variant.deadlineMs!==undefined&&(!positiveInt(variant.deadlineMs)||variant.deadlineMs<30000))throw Error('deadlineMs 至少 30000');
      if(variant.runner!==undefined&&typeof variant.runner!=='string')throw Error('runner 必须是脚本路径');
      const id=`${source.id}--${variant.id}`;
      if(seen.has(id))throw Error('重复的案例与配置组合：'+id);
      seen.add(id);
      jobs.push({id,caseId:source.id,variantId:variant.id,packagePath,
        style:typeof source.style==='string'&&source.style.trim()?source.style.trim():'复古收藏',
        runner:variant.runner?resolve(base,variant.runner):runnerDefault,
        output:join(root,id),effort:variant.effort||'high',deadlineMs:variant.deadlineMs||570000});
    }
  }
  return jobs;
}

export function summarizeCreativeBatchRun(job,exitCode,report=null,failure=null){
  const usage=[...(Array.isArray(report?.usage)?report.usage:[]),
    ...(Array.isArray(report?.auxiliaryUsage)?report.auxiliaryUsage:[]),
    ...(Array.isArray(report?.compactions)?report.compactions.map(row=>row.usage).filter(Boolean):[])];
  const sum=key=>usage.reduce((total,row)=>total+(Number(row?.[key])||0),0);
  const independent=Array.isArray(report?.independentReviews)?report.independentReviews:[];
  const finalAudit=independent.filter(row=>row.phase==='review'&&!row.unavailable).at(-1)||null;
  return {id:job.id,caseId:job.caseId,variantId:job.variantId,output:job.output,
    status:exitCode===0&&report?.status==='completed'?'completed':report?.status||'failed',exitCode,
    totalMs:report?.totalMs??failure?.totalMs??null,turns:report?.turns??failure?.turns??null,
    inputTokens:sum('prompt_tokens'),outputTokens:sum('completion_tokens'),
    modelMs:sum('modelMs'),traceEvents:report?.traceEvents??null,
    modelReviewApproved:report?.review?.approved===true,
    finalAuditAvailable:Boolean(finalAudit),finalAuditBlockingIssues:finalAudit?.blockingIssues?.length??null,
    frameRevisions:report?.evaluation?.revisions??null,
    error:failure?.message||null};
}

async function runOne(job,{node=process.execPath,env=process.env}={}){
  await mkdir(job.output,{mode:0o700});
  const log=createWriteStream(join(job.output,'process.log'),{flags:'wx',mode:0o600});
  const childEnv={...env,SHIYE_CREATIVE_EFFORT:job.effort,SHIYE_ACCEPTANCE_DEADLINE_MS:String(job.deadlineMs)};
  // The task prompt remains the runner's neutral prompt; no reference answer is injected.
  delete childEnv.SHIYE_ACCEPTANCE_INSTRUCTIONS;
  const child=spawn(node,[job.runner,job.packagePath,job.output,job.style],{env:childEnv,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  const exitCode=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',code=>done(code??1));}).catch(error=>{
    log.write(`\n启动失败：${error.message}\n`);return 1;
  });
  await new Promise(done=>log.end(done));
  const readJson=async name=>{try{return JSON.parse(await readFile(join(job.output,name),'utf8'));}catch{return null;}};
  const [report,failure]=await Promise.all([readJson('report.json'),readJson('failure.json')]);
  return summarizeCreativeBatchRun(job,exitCode,report,failure);
}

export async function runCreativeBatch(jobs,{concurrency=2,runner=runOne,onResult=()=>{}}={}){
  if(!positiveInt(concurrency)||concurrency>4)throw Error('并发数须为 1–4');
  const results=new Array(jobs.length);let next=0;
  await Promise.all(Array.from({length:Math.min(concurrency,jobs.length)},async()=>{
    while(next<jobs.length){
      const index=next++,job=jobs[index];
      try{results[index]=await runner(job);}
      catch(error){results[index]=summarizeCreativeBatchRun(job,1,null,{message:error.message});}
      onResult(results[index]);
    }
  }));
  return results;
}

async function main(){
  const [manifestPath,outputRoot,...options]=process.argv.slice(2);
  if(!manifestPath||!outputRoot)throw Error('用法：node scripts/test-creative-harness-batch.mjs <manifest.json> <全新私有输出目录> [--concurrency=2] [--dry-run]');
  const concurrencyArg=options.find(arg=>arg.startsWith('--concurrency='));
  if(options.some(arg=>arg!=='--dry-run'&&!arg.startsWith('--concurrency=')))throw Error('未知参数');
  const concurrency=concurrencyArg?Number(concurrencyArg.split('=')[1]):2;
  if(!positiveInt(concurrency)||concurrency>4)throw Error('并发数须为 1–4');
  const manifest=JSON.parse(await readFile(resolve(manifestPath),'utf8'));
  const jobs=prepareCreativeBatch(manifest,manifestPath,outputRoot);
  if(options.includes('--dry-run')){
    console.log(JSON.stringify({concurrency,jobs:jobs.map(({id,packagePath,runner,output,style,effort,deadlineMs})=>({id,packagePath,runner,output,style,effort,deadlineMs}))},null,2));
    return;
  }
  await mkdir(resolve(outputRoot),{mode:0o700});
  const batchStarted=Date.now(),startedAt=new Date(batchStarted).toISOString();
  const results=await runCreativeBatch(jobs,{concurrency,onResult:result=>console.log(JSON.stringify({id:result.id,status:result.status,turns:result.turns,totalMs:result.totalMs}))});
  const wallMs=Date.now()-batchStarted;
  const sequentialEstimateMs=results.reduce((total,row)=>total+(row.totalMs||0),0);
  const summary={startedAt,finishedAt:new Date().toISOString(),wallMs,sequentialEstimateMs,
    speedupEstimate:sequentialEstimateMs&&wallMs?Math.round(sequentialEstimateMs/wallMs*100)/100:null,
    concurrency,total:results.length,completed:results.filter(row=>row.status==='completed').length,results};
  await writeFile(join(resolve(outputRoot),'batch-report.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({batchReport:join(resolve(outputRoot),'batch-report.json'),completed:summary.completed,total:summary.total}));
  if(summary.completed!==summary.total)process.exitCode=1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
