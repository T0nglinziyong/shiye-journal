import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareCreativeBatch,runCreativeBatch,summarizeCreativeBatchRun} from '../scripts/test-creative-harness-batch.mjs';

test('case × variant paths and configuration are isolated',()=>{
  const manifest={cases:[{id:'case',package:'./input',style:'清新'}],variants:[{id:'baseline',effort:'high'},{id:'quick',effort:'low',deadlineMs:120000}]};
  const jobs=prepareCreativeBatch(manifest,'/private/manifest.json','/private/output');
  assert.equal(jobs.length,2);
  assert.deepEqual(jobs.map(job=>job.output),['/private/output/case--baseline','/private/output/case--quick']);
  assert.deepEqual(jobs.map(job=>job.effort),['high','low']);
  assert.throws(()=>prepareCreativeBatch({...manifest,variants:[{id:'same'},{id:'same'}]},'/private/manifest.json','/private/output'),/重复/);
  assert.throws(()=>prepareCreativeBatch({...manifest,cases:[{id:'../escape',package:'x'}]},'/private/manifest.json','/private/output'),/合法/);
});

test('bounded workers continue after a failed independent run',async()=>{
  const jobs=Array.from({length:5},(_,i)=>({id:String(i),caseId:'case',variantId:String(i),output:'/tmp/'+i}));
  let active=0,peak=0;
  const results=await runCreativeBatch(jobs,{concurrency:2,runner:async job=>{
    active++;peak=Math.max(peak,active);
    await new Promise(done=>setTimeout(done,10));active--;
    if(job.id==='2')throw Error('example failure');
    return {id:job.id,status:'completed'};
  }});
  assert.equal(peak,2);
  assert.equal(results.length,5);
  assert.equal(results[2].status,'failed');
  assert.equal(results[4].status,'completed');
});

test('summary compares usage, final review and visual revisions',()=>{
  const row=summarizeCreativeBatchRun({id:'a--b',caseId:'a',variantId:'b',output:'/x'},0,{
    status:'completed',totalMs:98000,turns:12,usage:[{prompt_tokens:100,completion_tokens:20,modelMs:500},{prompt_tokens:150,completion_tokens:30,modelMs:700}],
    review:{approved:true},independentReviews:[{phase:'review',blockingIssues:[],unavailable:false}],evaluation:{revisions:4},traceEvents:27
  });
  assert.equal(row.inputTokens,250);
  assert.equal(row.outputTokens,50);
  assert.equal(row.finalAuditAvailable,true);
  assert.equal(row.finalAuditBlockingIssues,0);
  assert.equal(row.frameRevisions,4);
});

test('dry run lists jobs without running a model or creating output',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'shiye-creative-batch-'));
  const manifestPath=join(directory,'manifest.json'),output=join(directory,'result');
  await writeFile(manifestPath,JSON.stringify({cases:[{id:'case',package:'input'}],variants:[{id:'baseline'}]}));
  const result=spawnSync(process.execPath,['scripts/test-creative-harness-batch.mjs',manifestPath,output,'--dry-run'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/case--baseline/);
});

test('CLI runs isolated child jobs and writes a comparison even when one child fails',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'shiye-creative-batch-cli-'));
  const fake=join(directory,'fake-runner.mjs');
  await writeFile(fake,`import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const output=process.argv[3];
if(output.includes('failed--'))process.exit(7);
await writeFile(join(output,'report.json'),JSON.stringify({status:'completed',totalMs:10,turns:2,usage:[{prompt_tokens:3,completion_tokens:4}],independentReviews:[{phase:'review',blockingIssues:[],unavailable:false}],review:{approved:true},evaluation:{revisions:2}}));
console.log('fake complete');
`);
  const manifestPath=join(directory,'manifest.json'),output=join(directory,'result');
  await writeFile(manifestPath,JSON.stringify({cases:[{id:'passed',package:'input'},{id:'failed',package:'input'}],variants:[{id:'baseline',runner:'fake-runner.mjs'}]}));
  const result=spawnSync(process.execPath,['scripts/test-creative-harness-batch.mjs',manifestPath,output,'--concurrency=2'],{encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);
  const report=JSON.parse(await readFile(join(output,'batch-report.json'),'utf8'));
  assert.equal(report.total,2);
  assert.equal(report.completed,1);
  assert.deepEqual(report.results.map(row=>row.status),['completed','failed']);
  assert.equal(report.results[0].inputTokens,3);
  assert.ok((await readdir(join(output,'passed--baseline'))).includes('process.log'));
  assert.ok((await readdir(join(output,'failed--baseline'))).includes('process.log'));
});
