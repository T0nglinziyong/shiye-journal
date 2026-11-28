import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutStudyBudget} from '../scripts/lib/layout-study-budget.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('stage budget counts failed HTTP attempts and prevents another provider retry',async()=>{
  const budget=createLayoutStudyBudget({maxRequests:2});let sent=0;
  const fail=async()=>{sent++;throw Error('provider unavailable');};
  await assert.rejects(budget.fetch(fail,'url',{}),/provider unavailable/);
  await assert.rejects(budget.fetch(fail,'url',{}),/provider unavailable/);
  await assert.rejects(budget.fetch(fail,'url',{}),e=>e.reason==='request-limit');
  assert.equal(sent,2);assert.equal(budget.snapshot().requests,2);
});
test('a captured preview stops before the next model call',()=>{
  const budget=createLayoutStudyBudget();budget.beforeModel();budget.capture({artifact:'preview.png'});
  assert.throws(()=>budget.beforeModel(),e=>e.reason==='first-preview');
  assert.equal(budget.snapshot().requests,0);
});
test('deadline prevents an HTTP request even if call allowance remains',async()=>{
  let time=0;const budget=createLayoutStudyBudget({now:()=>time,deadlineMs:100});time=100;
  await assert.rejects(budget.fetch(()=>assert.fail('must not send'),'url',{}),e=>e.reason==='deadline');
  assert.equal(budget.snapshot().requests,0);
});
test('real runner rejects unsupported fractional paper sizes before requiring a model key',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'layout-study-'));
  try{
    await writeFile(join(dir,'TASK.json'),JSON.stringify({format:'shiye-gpt-creation-package',version:3,protocolVersion:2,page:{mode:'single',ratio:'custom:110x157.143'}}));
    const run=spawnSync(process.execPath,['scripts/test-creative-harness-real.mjs',dir,join(dir,'output'),'--layout-only'],{cwd:new URL('../',import.meta.url),encoding:'utf8',env:{PATH:process.env.PATH},timeout:15000});
    assert.equal(run.status,1);assert.match(run.stderr,/任务包纸张尺寸无效/);assert.doesNotMatch(run.stderr,/未配置创作模型密钥/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('self-review budget counts distinct revisions and allows the model to inspect its first preview',()=>{
 const budget=createLayoutStudyBudget({maxPreviews:2});budget.capture({artifact:'a.png',sceneRevision:'a'});budget.beforeModel();
 budget.capture({artifact:'a.png',sceneRevision:'a'});budget.beforeModel();
 budget.capture({artifact:'b.png',sceneRevision:'b'});assert.throws(()=>budget.beforeModel(),e=>e.reason==='preview-limit');assert.equal(budget.snapshot().previews.length,2);
});
test('blind study rejects a reference sidecar before loading materials or requiring a model key',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'blind-study-'));
 try{
  const {mkdir}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
  await mkdir(join(dir,'references'));const bytes=Buffer.from('89504e470d0a1a0a','hex');
  await writeFile(join(dir,'references/final.png'),bytes);
  await writeFile(join(dir,'study.json'),JSON.stringify({references:[{stage:'final',file:'references/final.png',sha256:'sha256:'+createHash('sha256').update(bytes).digest('hex')}]}));
  await writeFile(join(dir,'TASK.json'),JSON.stringify({format:'shiye-gpt-creation-package',version:3,protocolVersion:2,page:{mode:'single',ratio:'custom:110x157'}}));
  const run=spawnSync(process.execPath,['scripts/test-creative-harness-real.mjs',dir,join(dir,'output'),'--study-stage=layout','--study-mode=blind'],{cwd:new URL('../',import.meta.url),encoding:'utf8',env:{PATH:process.env.PATH},timeout:15000});
  assert.equal(run.status,1);assert.match(run.stderr,/无参考测试禁止参考图/);assert.doesNotMatch(run.stderr,/未配置创作模型密钥/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
