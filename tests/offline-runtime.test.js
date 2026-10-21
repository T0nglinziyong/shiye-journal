import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {linkTestCanvas,tinyPNG} from './offline-canvas-test-support.mjs';
const source={id:'runtime-source',title:'蓝纸',kind:'sticker',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
const setup=async()=>{
 const task=await createOfflineHandoff({project:project('断网验证'),assets:[source],aliases:{m1:source.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-v3-offline-'));
 for(const [path,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,path)),{recursive:true});await writeFile(join(dir,path),bytes);}await linkTestCanvas(dir);
 const run=(name,arg)=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH||'',SHIYE_RENDERER:'node'}});
 return {task,files,dir,run};
};
test('bundled current runtime creates real same-scene PNG offline without HTML',async()=>{
 const {dir,files,run}=await setup();try{
  assert.ok(files['runtime/shiye.cjs']);assert.equal(run('self-test').status,0);
  const guide=strFromU8(files['design/RECIPES.md']),operation=JSON.parse(guide.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(run('begin','work/replay.json').status,0);
  const command=JSON.parse(await readFile(join(dir,'work/replay.json'),'utf8'));
  command.operations=[operation,{op:'material.decision',asset:'m1',choice:'intact',reason:'此测试将唯一素材完整用作画面主体'}];
  await writeFile(join(dir,'work/replay.json'),JSON.stringify(command));
  const applied=run('apply','work/replay.json');assert.equal(applied.status,0,applied.stderr);
  const preview=run('preview');assert.equal(preview.status,0,preview.stderr);
  const png=await readFile(join(dir,'output/preview.png'));assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const capture=JSON.parse(await readFile(join(dir,'output/preview-capture.json'),'utf8'));
  assert.equal(capture.renderer,'shiye-scene-v2');assert.ok(capture.assets.m1);
  const pack=run('pack');assert.equal(pack.status,0,pack.stderr);
  await assert.rejects(stat(join(dir,'output/画面预览.html')),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('renderer refuses changed source asset instead of displaying stale image',async()=>{
 const {dir,run}=await setup();try{
  await writeFile(join(dir,'assets/m1.png'),new Uint8Array([137,80,78,71,13,10,26,10]));
  const preview=run('preview');assert.equal(preview.status,1);assert.match(preview.stderr,/ASSET_CHANGED/);
  await assert.rejects(readFile(join(dir,'output/preview.png')),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
