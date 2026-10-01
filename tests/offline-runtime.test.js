import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {unzipSync,strFromU8,strToU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {importEditableWorkPackageReviewed} from '../src/offline-creation.js';

test('O-12/O-13: bundled validator runs from the ZIP without node_modules or cloud credentials',async()=>{
  const asset={id:'offline-runtime-asset',title:'蓝纸',kind:'sticker',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
  const task=await createOfflineHandoff({project:project('断网验证'),assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  const entries=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
  assert.equal(JSON.parse(strFromU8(entries['capabilities.json'])).runtime.render,null);
  const directory=await mkdtemp(join(tmpdir(),'shiye-offline-runtime-'));
  try{
    await mkdir(join(directory,'runtime'));
    await writeFile(join(directory,'runtime/validate.cjs'),entries['runtime/validate.cjs']);
    await writeFile(join(directory,'runtime/pack.cjs'),entries['runtime/pack.cjs']);
    await writeFile(join(directory,'context.json'),entries['context.json']);
    await writeFile(join(directory,'project.shiyeproject.json'),entries['example-response.shiyeproject.json']);
    const run=()=>spawnSync(process.execPath,['runtime/validate.cjs'],{cwd:directory,encoding:'utf8',env:{PATH:process.env.PATH||''},timeout:10000});
    const valid=run();
    assert.equal(valid.status,0,valid.stderr||valid.stdout);
    const report=JSON.parse(await readFile(join(directory,'output/validation-report.json'),'utf8'));
    assert.equal(report.structure,'passed');assert.equal(report.physical,'current-rules-passed');
    assert.equal(report.visual,'unavailable');assert.equal(report.reading,'pending');
    const packed=spawnSync(process.execPath,['runtime/pack.cjs'],{cwd:directory,encoding:'utf8',env:{PATH:process.env.PATH||''},timeout:10000});
    assert.equal(packed.status,0,packed.stderr||packed.stdout);
    const resultBytes=new Uint8Array(await readFile(join(directory,'output/作品.shiyeproject.zip')));
    const imported=await importEditableWorkPackageReviewed(resultBytes,[asset],{trustedSource:task.source});
    assert.equal(imported.creationVerification.manifest,'self-consistent');
    assert.equal(imported.creationVerification.preview,'unverified');
    const changed=JSON.parse(strFromU8(entries['example-response.shiyeproject.json']));
    changed.source.mode='spread';
    await writeFile(join(directory,'project.shiyeproject.json'),strToU8(JSON.stringify(changed)));
    const invalid=spawnSync(process.execPath,['runtime/pack.cjs'],{cwd:directory,encoding:'utf8',env:{PATH:process.env.PATH||''},timeout:10000});
    assert.equal(invalid.status,1);
    const failed=JSON.parse(await readFile(join(directory,'output/validation-report.json'),'utf8'));
    assert.equal(failed.structure,'failed');
    await assert.rejects(stat(join(directory,'output/作品.shiyeproject.zip')),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});
