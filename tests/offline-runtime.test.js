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
  const capabilities=JSON.parse(strFromU8(entries['capabilities.json']));
  assert.equal(capabilities.runtime.render,null);
  assert.equal(capabilities.runtime.preview,'approximate-svg');
  assert.ok(entries['runtime/preview.cjs']);
  const directory=await mkdtemp(join(tmpdir(),'shiye-offline-runtime-'));
  try{
    await mkdir(join(directory,'runtime'));
    await writeFile(join(directory,'runtime/validate.cjs'),entries['runtime/validate.cjs']);
    await writeFile(join(directory,'runtime/preview.cjs'),entries['runtime/preview.cjs']);
    await writeFile(join(directory,'runtime/pack.cjs'),entries['runtime/pack.cjs']);
    await writeFile(join(directory,'context.json'),entries['context.json']);
    await writeFile(join(directory,'project.shiyeproject.json'),entries['example-response.shiyeproject.json']);
    const run=()=>spawnSync(process.execPath,['runtime/validate.cjs'],{cwd:directory,encoding:'utf8',env:{PATH:process.env.PATH||''},timeout:10000});
    const valid=run();
    assert.equal(valid.status,0,valid.stderr||valid.stdout);
    const report=JSON.parse(await readFile(join(directory,'output/validation-report.json'),'utf8'));
    assert.equal(report.structure,'passed');assert.equal(report.physical,'current-rules-passed');
    assert.equal(report.visual,'unavailable');assert.equal(report.reading,'pending');
    const previewRun=spawnSync(process.execPath,['runtime/preview.cjs'],{cwd:directory,encoding:'utf8',env:{PATH:process.env.PATH||''},timeout:10000});
    assert.equal(previewRun.status,0,previewRun.stderr||previewRun.stdout);
    const previewText=await readFile(join(directory,'output/构图预览.svg'),'utf8');
    assert.match(previewText,/<svg/);
    assert.match(previewText,/构图预览/);
    assert.match(previewText,/这一页的主题/);
    const packed=spawnSync(process.execPath,['runtime/pack.cjs'],{cwd:directory,encoding:'utf8',env:{PATH:process.env.PATH||''},timeout:10000});
    assert.equal(packed.status,0,packed.stderr||packed.stdout);
    const resultBytes=new Uint8Array(await readFile(join(directory,'output/作品.shiyeproject.zip')));
    const resultEntries=unzipSync(resultBytes);
    assert.equal(strFromU8(resultEntries['preview.svg']),previewText);
    const manifest=JSON.parse(strFromU8(resultEntries['manifest.json']));
    assert.match(manifest.previewHash,/^sha256:[a-f0-9]{64}$/);
    assert.equal(manifest.outputProfile,'editable-approximate-svg');
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
    await assert.rejects(stat(join(directory,'output/构图预览.svg')),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('direct-page preview embeds the supplied transparent material and editable scene layers',async()=>{
  const asset={id:'preview-asset',title:'纸片',kind:'sticker',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
  const image=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5uoAAAAASUVORK5CYII=','base64'));
  const task=await createOfflineHandoff({project:project('可预览直接页'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:image}],settings:{includeThumbnails:true,generationMode:'direct'}});
  const entries=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
  const directory=await mkdtemp(join(tmpdir(),'shiye-direct-preview-'));
  try{
    await mkdir(join(directory,'runtime'));await mkdir(join(directory,'materials'));
    for(const name of ['context.json','runtime/validate.cjs','runtime/preview.cjs','materials/m1.png'])await writeFile(join(directory,name),entries[name]);
    await writeFile(join(directory,'project.shiyeproject.json'),entries['example-response.shiyeproject.json']);
    const result=spawnSync(process.execPath,['runtime/preview.cjs'],{cwd:directory,encoding:'utf8',env:{PATH:process.env.PATH||''},timeout:10000});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const svg=await readFile(join(directory,'output/构图预览.svg'),'utf8');
    assert.match(svg,/data:image\/png;base64,/);
    assert.match(svg,/这一页的主题/);
    assert.match(svg,/font-family="serif"/);
    assert.match(svg,/图层与任务包缩略图|基于可编辑图层与任务包缩略图/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
