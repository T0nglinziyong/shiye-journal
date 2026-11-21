import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {linkTestCanvas,tinyPNG} from './offline-canvas-test-support.mjs';
const source={id:'runtime-source',title:'蓝纸',kind:'sticker',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
const setup=async(empty=false)=>{
 const task=await createOfflineHandoff({project:project('断网验证'),assets:empty?[]:[source],aliases:empty?{}:{m1:source.id},previews:empty?[]:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
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


test('zero-material ZIP executes text and graphics, renders real PNG, packs and reopens',async()=>{
 const {dir,run,task}=await setup(true);try{
  assert.equal(run('begin','work/empty.json').status,0);
  const command=JSON.parse(await readFile(join(dir,'work/empty.json'),'utf8'));
  command.operations=[
   {op:'graphic.add',id:'dot',geometry:{kind:'ellipse'},place:{reference:'page',at:[30,30],unit:'mm'},size:{width:12,height:12,unit:'mm'},style:{fill:'#e0aa55'}},
   {op:'text.add',id:'title',content:'一页慢慢写',place:{reference:'page',at:[70,50],unit:'mm'},size:{width:80,unit:'mm'},style:{fontSizePt:18,color:'#334b42'}}
  ];
  await writeFile(join(dir,'work/empty.json'),JSON.stringify(command));
  for(const [name,arg] of [['apply','work/empty.json'],['preview'],['pack']]){
   const result=run(name,arg);assert.equal(result.status,0,result.stderr);
  }
  const png=await readFile(join(dir,'output/preview.png'));assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const capture=JSON.parse(await readFile(join(dir,'output/preview-capture.json'),'utf8'));
  assert.equal(capture.renderer,'shiye-scene-v2');assert.deepEqual(capture.assets,{});
  const output=await readFile(join(dir,'output/project.shiyeproject.json'),'utf8');
  assert.equal(output.includes('\n'),false);
  const imported=importEditableWork(output,[],{trustedSource:task.source});
  assert.equal(imported.drafts[0].layers.length,2);assert.equal(imported.drafts[0].textBlocks[0].content,'一页慢慢写');
 }finally{await rm(dir,{recursive:true,force:true});}
});
