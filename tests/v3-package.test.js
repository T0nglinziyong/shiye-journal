import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,utimes} from 'node:fs/promises';
import {tmpdir,hostname} from 'node:os';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {tinyPNG,linkTestCanvas} from './offline-canvas-test-support.mjs';
import {executableCreationV2Names} from '../src/creation-v2-commands.js';
import {advancedCreationV2Names} from '../src/creation-v2-contract.js';
test('v3 ZIP supports one-command Scene creation, preview and pack',async()=>{
 const asset={id:'v3-asset',title:'蓝纸',kind:'sticker',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('v3 测试'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
 for(const name of ['START_HERE.md','TASK.json','scene.json','assets/overview.jpg','assets/m1.png','assets/manifest.json','api/commands.schema.json','api/scene.schema.json','runtime/shiye.cjs','work/commands.json'])assert.ok(files[name],name);
 const dir=await mkdtemp(join(tmpdir(),'shiye-v3-'));
 try{
  for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}
  await linkTestCanvas(dir);
  const run=(name,arg)=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:20000});
  const info=run('info');assert.equal(info.status,0,info.stderr);const revision=JSON.parse(info.stdout).sceneRevision;
  const commands={protocolVersion:1,transactionId:'first',baseSceneRevision:revision,operations:[
   {op:'material.add',id:'hero',asset:'m1',placement:{xMm:60,yMm:70}},
   {op:'text.add',id:'title',content:'一张蓝纸的今天',xMm:60,yMm:20,widthMm:70,fontSizePt:22},
   {op:'shape.add',id:'dot',kind:'ellipse',xMm:85,yMm:38,widthMm:8,heightMm:8,fill:'#d5e2d6'},
   {op:'material.decision',asset:'m1',choice:'intact',reason:'保留蓝纸完整轮廓'}
  ]};
  await writeFile(join(dir,'work/commands.json'),JSON.stringify(commands));
  const staleLock=join(dir,'work/.scene-write-lock');
  await mkdir(staleLock);await writeFile(join(staleLock,'owner.json'),JSON.stringify({pid:999999999,host:hostname(),createdAt:Date.now()-120000,token:'stale'}));
  await utimes(staleLock,new Date(Date.now()-120000),new Date(Date.now()-120000));
  const applied=run('apply','work/commands.json');assert.equal(applied.status,0,applied.stderr);
  assert.equal(run('apply','work/commands.json').status,0,'same transaction must be idempotent');
  const preview=run('preview');assert.equal(preview.status,0,preview.stderr);
  const png=await readFile(join(dir,'output/preview.png'));assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const pack=run('pack');assert.equal(pack.status,0,pack.stderr);
  const output=await readFile(join(dir,'output/project.shiyeproject.json'),'utf8');
  assert.equal(importEditableWork(output,[asset]).drafts[0].items.length,1);
  const capture=JSON.parse(await readFile(join(dir,'output/preview-capture.json'),'utf8'));
  assert.equal(capture.rendererBackend,'node-canvas@3.2.3');
  const forged=Buffer.from(png);forged[forged.length-1]^=1;
  capture.pngHash='sha256:'+createHash('sha256').update(forged).digest('hex');
  await writeFile(join(dir,'output/preview.png'),forged);await writeFile(join(dir,'output/preview-capture.json'),JSON.stringify(capture));
  assert.match(run('pack').stderr,/PREVIEW_STALE/,'forged PNG and matching metadata must not bypass rendering');
  assert.equal(run('preview').status,0);
  const changed=JSON.parse(await readFile(join(dir,'scene.json'),'utf8'));changed.page.paperColor='#eeeeee';await writeFile(join(dir,'scene.json'),JSON.stringify(changed));assert.match(run('pack').stderr,/PREVIEW_STALE/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('experimental protocol 2 uses the same Scene, preview and pack path',async()=>{
 const asset={id:'v2-photo',title:'小照片',kind:'sticker',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('协议 2 测试'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-v2-e2e-'));
 try{
  for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}await linkTestCanvas(dir);
  const run=(name,arg)=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:30000});
  const help=JSON.parse(run('help').stdout);
  assert.equal(help.protocolVersion,2);
  assert.equal(help.operations.length,executableCreationV2Names.length+advancedCreationV2Names.length);
  assert.ok(help.operations.some(row=>row.name==='advanced.v1.material.craft'&&row.advanced));
  assert.ok(new TextDecoder().decode(files['api/commands.schema.json']).includes('advanced.v1.material.craft'));
  assert.equal(JSON.parse(new TextDecoder().decode(files['work/commands.json'])).protocolVersion,2);
  const begin=spawnSync(process.execPath,['runtime/shiye.cjs','begin','work/v2-next.json','--protocol=2'],{cwd:dir,encoding:'utf8',timeout:30000});
  assert.equal(begin.status,0,begin.stderr);
  assert.equal(JSON.parse(await readFile(join(dir,'work/v2-next.json'),'utf8')).protocolVersion,2);
  const revision=JSON.parse(run('info').stdout).sceneRevision;
  const command={protocolVersion:2,transactionId:'v2-first',baseSceneRevision:revision,operations:[
   {op:'material.add',id:'photo',asset:'m1',place:{reference:'page',at:[.5,.4],unit:'ratio'}},
   {op:'material.crop',target:'photo',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.5,1]}},
   {op:'material.mask',target:'photo',region:{shape:'ellipse',space:'local',unit:'ratio',box:[0,0,1,1]},mode:'replace'},
   {op:'text.add',id:'caption',content:'这张照片让我想起今天。',place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,5],unit:'mm'}},size:{width:60,unit:'mm'},style:{fontSizePt:12,color:'#334d4a'}},
   {op:'vector.add',id:'triangle',viewBox:[0,0,10,10],paths:[{d:'M0 10 L5 0 L10 10 Z',style:{fill:'#aabbcc'}}],place:{reference:'page',at:[.2,.2],unit:'ratio'},size:{width:10,height:10,unit:'mm'}},
   {op:'ink.add',id:'stroke',points:[{x:0,y:0},{x:20,y:0}],unit:'mm',place:{reference:'page',at:[.5,.8],unit:'ratio'},style:{strokeWidthMm:2,color:'#334d4a',penStyle:'marker'}},
   {op:'material.decision',asset:'m1',choice:'crafted',reason:'使用非破坏性椭圆显示蒙版，实体保持完整'}
  ]};
  await writeFile(join(dir,'work/commands.json'),JSON.stringify(command));
  const applied=run('apply','work/commands.json');assert.equal(applied.status,0,applied.stderr);
  const preview=run('preview');assert.equal(preview.status,0,preview.stderr);
  const pack=run('pack');assert.equal(pack.status,0,pack.stderr);
  const output=JSON.parse(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'));
  assert.equal(output.page.layers.filter(node=>node.type==='material').length,1);
  assert.ok(output.page.layers.find(node=>node.type==='material').vectorMask);
  assert.equal(output.page.layers.find(node=>node.type==='material').materialMask??null,null);
  assert.equal(output.page.layers.find(node=>node.type==='material').cropRect.width,.5);
  assert.equal(output.page.layers.filter(node=>node.type==='text').length,1);
  assert.equal(output.page.layers.filter(node=>node.type==='shape').length,1);
  assert.equal(output.page.layers.filter(node=>node.type==='ink').length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('protocol 2 named physical windows and weave survive PNG and project delivery',async()=>{
 const assets=[
  {id:'v2-frame',title:'窗口纸',kind:'paper',physicalWidthMM:140,physicalHeightMM:80,supply:{quantity:1}},
  {id:'v2-strip',title:'穿插纸条',kind:'paper',physicalWidthMM:160,physicalHeightMM:8,supply:{quantity:1}}
 ];
 const p=project('开窗穿插',{mode:'spread',ratio:'a5'});p.processing='自由拆解';
 const task=await createOfflineHandoff({project:p,assets,aliases:{m1:assets[0].id,m2:assets[1].id},previews:assets.map((_,index)=>({alias:'m'+(index+1),bytes:tinyPNG})),settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-v2-weave-'));
 try{
  for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}await linkTestCanvas(dir);
  const run=(name,arg)=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:30000});
  const revision=JSON.parse(run('info').stdout).sceneRevision;
  const at={reference:'page',at:[150,100],unit:'mm'};
  const commands={protocolVersion:2,transactionId:'v2-weave',baseSceneRevision:revision,operations:[
   {op:'material.add',id:'frame',asset:'m1',place:at},
   {op:'material.add',id:'strip',asset:'m2',place:at},
   {op:'material.window',target:'frame',region:{shape:'rect',space:'local',unit:'ratio',box:[.1,.2,.15,.6]},windowId:'left-window'},
   {op:'material.window',target:'frame',region:{shape:'rect',space:'local',unit:'ratio',box:[.75,.2,.15,.6]},windowId:'right-window'},
   {op:'material.weave',strip:'strip',through:[{target:'frame',window:'left-window',sideAfter:'front'},{target:'frame',window:'right-window',sideAfter:'back'}]},
   {op:'material.decision',asset:'m1',choice:'crafted',reason:'两道真实开窗构成穿插通道'},
   {op:'material.decision',asset:'m2',choice:'crafted',reason:'纸条穿过两道开口并保留实体宽度'}
  ]};
  await writeFile(join(dir,'work/commands.json'),JSON.stringify(commands));
  const applied=run('apply','work/commands.json');assert.equal(applied.status,0,applied.stderr);
  const preview=run('preview');assert.equal(preview.status,0,preview.stderr);
  const pack=run('pack');assert.equal(pack.status,0,pack.stderr);
  const output=JSON.parse(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'));
  const frame=output.page.layers.find(node=>node.creativePieceID==='frame'),strip=output.page.layers.find(node=>node.creativePieceID==='strip');
  assert.deepEqual(frame.craftWindowIDs,['left-window','right-window']);
  assert.equal(frame.materialMask.holes.length,2);
  assert.ok(strip.craftDisplaySlices?.length);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('protocol 2 physical split and offcut survive real ZIP apply, preview and pack',async()=>{
 const asset={id:'v2-sheet',title:'分片纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const p=project('实体分片',{ratio:'a5'});p.processing='自由拆解';
 const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-v2-split-'));
 try{
  for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}await linkTestCanvas(dir);
  const run=(name,arg)=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:30000});
  const revision=JSON.parse(run('info').stdout).sceneRevision;
  const commands={protocolVersion:2,transactionId:'v2-physical-split',baseSceneRevision:revision,operations:[
   {op:'material.add',id:'parent',asset:'m1',place:{reference:'page',at:[.5,.45],unit:'ratio'}},
   {op:'material.split',target:'parent',pieces:[
    {id:'left',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.3,1]}},
    {id:'right',region:{shape:'rect',space:'source',unit:'ratio',box:[.4,0,.3,1]}}
   ]},
   {op:'text.add',id:'note',content:'裁成两片，空下一条留给以后。',place:{reference:'page',at:[.5,.85],unit:'ratio'},size:{width:80,unit:'mm'},style:{fontSizePt:12}},
   {op:'material.decision',asset:'m1',choice:'crafted',reason:'一张纸真实裁成两片，余料保留'}
  ]};
  await writeFile(join(dir,'work/commands.json'),JSON.stringify(commands));
  for(const name of ['check','apply','preview','pack']){const result=run(name,name==='check'||name==='apply'?'work/commands.json':null);assert.equal(result.status,0,name+': '+result.stderr);}
  const saved=JSON.parse(await readFile(join(dir,'scene.json'),'utf8'));
  assert.equal(saved.page.layers.filter(n=>n.type==='material'&&!n.isParked).length,2);
  assert.ok(saved.page.layers.some(n=>n.type==='material'&&n.isParked));
  assert.equal(importEditableWork(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'),[asset]).drafts[0].items.length,saved.page.layers.filter(n=>n.type==='material').length);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('v3 transactions reject stale revisions and retain scene on a failed operation',async()=>{
 const asset={id:'tx-asset',title:'纸',kind:'sticker',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('事务'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-v3-tx-'));
 try{
  for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}await linkTestCanvas(dir);
  const run=(name,arg)=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:20000});
  const initial=JSON.parse(run('info').stdout).sceneRevision;
  const bad={protocolVersion:1,transactionId:'bad',baseSceneRevision:initial,operations:[{op:'material.add',id:'p',asset:'m1',placement:{xMm:40,yMm:50}},{op:'layer.update',target:'p',set:{sourceBlobId:'forged'}}]};
  await writeFile(join(dir,'work/commands.json'),JSON.stringify(bad));
  const before=await readFile(join(dir,'scene.json'));const failed=run('apply','work/commands.json');assert.equal(failed.status,1);assert.match(failed.stderr,/operations\[1\]/);assert.deepEqual(await readFile(join(dir,'scene.json')),before);
  const ok={...bad,transactionId:'good',operations:bad.operations.slice(0,1)};await writeFile(join(dir,'work/commands.json'),JSON.stringify(ok));
  assert.equal(run('apply','work/commands.json').status,0);
  const after=await readFile(join(dir,'scene.json'));
  assert.equal(run('apply','work/commands.json').status,0);assert.deepEqual(await readFile(join(dir,'scene.json')),after);
  const changed={...ok,operations:[{op:'page.update',paperColor:'#eeeeee'}]};await writeFile(join(dir,'work/commands.json'),JSON.stringify(changed));assert.match(run('apply','work/commands.json').stderr,/TRANSACTION_CONFLICT/);
  const stale={...changed,transactionId:'stale'};await writeFile(join(dir,'work/commands.json'),JSON.stringify(stale));assert.match(run('apply','work/commands.json').stderr,/REVISION_CONFLICT/);
  const current=JSON.parse(run('info').stdout).sceneRevision;
  const currentColor=JSON.parse(await readFile(join(dir,'scene.json'),'utf8')).page.paperColor;
  for(const transactionId of ['noop-one','noop-two']){
   await writeFile(join(dir,'work/commands.json'),JSON.stringify({protocolVersion:1,transactionId,baseSceneRevision:current,operations:[{op:'page.update',paperColor:currentColor}]}));
   const applied=run('apply','work/commands.json');assert.equal(applied.status,0,applied.stderr);
   assert.equal(JSON.parse(run('info').stdout).sceneRevision,current);
  }
  const receipts=JSON.parse(await readFile(join(dir,'scene.json'),'utf8')).v3Transactions;
  assert.ok(receipts['noop-one']&&receipts['noop-two'],'both no-op transaction receipts must survive the unchanged content revision');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('v3 complex craft keeps partition, offcut, windows, weave and editable text',async()=>{
 const {assetSourceRevision}=await import('../src/material-anatomy.js');
 const {craftSceneHash}=await import('../src/craft-fingerprint.js');
 const assets=[
  {id:'paper',title:'图案纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,blobId:'paper-blob',supply:{quantity:1}},
  {id:'frame',title:'窗口纸',kind:'paper',physicalWidthMM:140,physicalHeightMM:80,blobId:'frame-blob',supply:{quantity:1}},
  {id:'strip',title:'穿插纸条',kind:'paper',physicalWidthMM:160,physicalHeightMM:8,blobId:'strip-blob',supply:{quantity:1}}
 ];
 const aliases={m1:'paper',m2:'frame',m3:'strip'},p=project('工艺示例',{mode:'spread',ratio:'a5'});p.processing='自由拆解';
 const task=await createOfflineHandoff({project:p,assets,aliases,previews:assets.map((_,i)=>({alias:'m'+(i+1),bytes:tinyPNG})),settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-v3-complex-'));
 try{
  for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}await linkTestCanvas(dir);
  const run=(name,arg)=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:30000});
  const rev=JSON.parse(run('info').stdout).sceneRevision;
  const piece=(id,alias,asset,extraction,centerMM,treatments=[])=>({id,asset:alias,sourceRevision:assetSourceRevision(asset),unit:0,extraction,centerMM,treatments});
  const plan={format:'shiye-craft-plan',version:2,commandId:'complex-plan',baseSceneHash:craftSceneHash(task.source.baseDraft),
   pieces:[
    piece('left','m1',assets[0],{type:'rect_crop',boxMM:[0,0,40,80]},[35,155],[{op:'edge',style:'torn',edges:['bottom'],depth_mm:1,period_mm:8,seed:42}]),
    piece('right','m1',assets[0],{type:'rect_crop',boxMM:[40,0,40,80]},[82,155]),
    piece('frame','m2',assets[1],{type:'whole'},[150,95],[{op:'window',shape:'rectangle',box:[.1,.2,.15,.6]},{op:'window',shape:'rectangle',box:[.75,.2,.15,.6]}]),
    piece('strip','m3',assets[2],{type:'whole'},[150,95])
   ],sourcePartitions:[{asset:'m1'}],weaves:[{piece:'strip',target:'frame',holes:[0,1]}]};
  const commands={protocolVersion:1,transactionId:'complex',baseSceneRevision:rev,operations:[
   {op:'material.craft',plan},
   {op:'text.add',id:'caption',content:'几片纸之间，也有今天的小故事。',xMm:145,yMm:175,widthMm:95,fontSizePt:20},
   {op:'ink.add',id:'highlight',points:[{xMm:107,yMm:188},{xMm:175,yMm:188}],widthMm:3,color:'#e8d66b',penStyle:'marker'},
   ...['m1','m2','m3'].map(asset=>({op:'material.decision',asset,choice:'crafted',reason:'依据轮廓裁切、开窗或穿插，保留来源'}))
  ]};
  await writeFile(join(dir,'work/commands.json'),JSON.stringify(commands));const apply=run('apply','work/commands.json');assert.equal(apply.status,0,apply.stderr);
  const scene=JSON.parse(await readFile(join(dir,'scene.json'),'utf8'));
  assert.ok(scene.page.layers.some(node=>node.isParked),'must retain physical offcut');
  const preview=run('preview');assert.equal(preview.status,0,preview.stderr);
  const pack=run('pack');assert.equal(pack.status,0,pack.stderr);
  assert.ok(importEditableWork(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'),assets).drafts[0].items.length>=4);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('every published v3 recipe is an executable local edit without invented omitted decisions',async()=>{
 const asset={id:'recipe-asset',title:'纸片',kind:'sticker',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('配方'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),guide=new TextDecoder().decode(files['design/RECIPES.md']);
 const commands=[...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match=>JSON.parse(match[1]));
 assert.equal(commands.length,2);
 assert.ok(commands.every(command=>command.operations.every(operation=>operation.op!=='material.decision')));
 for(const command of commands){
  const dir=await mkdtemp(join(tmpdir(),'shiye-v3-recipe-'));
  try{
   for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}await linkTestCanvas(dir);
   await writeFile(join(dir,'work/commands.json'),JSON.stringify(command));
   const run=name=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(name==='apply'?['work/commands.json']:[])],{cwd:dir,encoding:'utf8',timeout:20000});
   for(const name of ['apply','preview']){const result=run(name);assert.equal(result.status,0,name+': '+result.stderr);}
  }finally{await rm(dir,{recursive:true,force:true});}
 }
});
test('self-test reports unavailable Canvas and refuses to invent PNG',async()=>{
 const asset={id:'missing-renderer',title:'纸',kind:'sticker',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('依赖检查'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-v3-no-canvas-'));
 try{
  for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}
  const run=name=>spawnSync(process.execPath,['runtime/shiye.cjs',name],{cwd:dir,encoding:'utf8',timeout:10000});
  const self=run('self-test');assert.equal(self.status,1);assert.match(self.stdout,/npm install/);
  const preview=run('preview');assert.equal(preview.status,1);assert.match(preview.stderr,/npm install/);
  await assert.rejects(readFile(join(dir,'output/preview.png')),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('fixed guidance is task-independent and check/proposal do not change the authoritative Scene',async()=>{
 const asset={id:'new-cli',title:'剪贴纸',kind:'sticker',physicalWidthMM:24,physicalHeightMM:31,supply:{quantity:1}};
 const make=title=>createOfflineHandoff({project:project(title),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const first=unzipSync(new Uint8Array(await (await make('甲')).blob.arrayBuffer()));
 const second=unzipSync(new Uint8Array(await (await make('乙')).blob.arrayBuffer()));
 for(const path of ['START_HERE.md','design/CRAFT_GUIDE.md','api/fixed-release.json'])assert.deepEqual(first[path],second[path],path+' must be identical');
 assert.notDeepEqual(first['TASK.json'],second['TASK.json']);
 const dir=await mkdtemp(join(tmpdir(),'shiye-v3-dry-'));
 try{
  for(const [name,bytes] of Object.entries(first)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}await linkTestCanvas(dir);
  const run=(...args)=>spawnSync(process.execPath,['runtime/shiye.cjs',...args],{cwd:dir,encoding:'utf8',timeout:20000});
  const before=await readFile(join(dir,'scene.json'));
  const help=run('help');assert.equal(help.status,0,help.stderr);
  assert.equal(JSON.parse(help.stdout).operations.length,executableCreationV2Names.length+advancedCreationV2Names.length);
  const description=run('describe','advanced.v1.material.craft');assert.equal(description.status,0,description.stderr);
  assert.equal(JSON.parse(description.stdout).name,'advanced.v1.material.craft');
  const begin=run('begin','work/draft.json','--protocol=1');assert.equal(begin.status,0,begin.stderr);
  assert.match(run('begin','work/draft.json').stderr,/DRAFT_EXISTS/);
  const command=JSON.parse(await readFile(join(dir,'work/draft.json'),'utf8'));
  command.operations=[{op:'material.add',id:'piece',asset:'m1',placement:{xMm:30,yMm:40}},
   {op:'text.add',id:'caption',content:'真实字号',xMm:55,yMm:20,widthMm:40,fontSizePt:12},
   {op:'layer.update',target:'caption',set:{fontSizePt:10,xMm:60,yMm:25}},
   {op:'material.decision',asset:'m1',choice:'intact',reason:'保留剪贴纸完整轮廓作为页面的视觉主体'}];
  await writeFile(join(dir,'work/draft.json'),JSON.stringify(command));
  assert.equal(run('check','work/draft.json').status,0);
  assert.deepEqual(await readFile(join(dir,'scene.json')),before);
  assert.equal(run('preview','--commands','work/draft.json').status,0);
  assert.deepEqual(await readFile(join(dir,'scene.json')),before);
  await assert.rejects(readFile(join(dir,'output/preview.png')),{code:'ENOENT'});
  assert.equal(run('apply','work/draft.json').status,0);
  const appliedScene=JSON.parse(await readFile(join(dir,'scene.json'),'utf8'));
  const caption=appliedScene.page.layers.find(node=>node.agentKey==='caption');
  const scale=appliedScene.page.canvas.height/appliedScene.page.physicalPageHeightMM;
  assert.ok(Math.abs(caption.fontSize-10*25.4/72*scale)<1e-6,'10pt must convert to Scene units');
  assert.ok(Math.abs(caption.x-60*scale)<1e-6,'xMm update must use the same millimetres as text.add');
  assert.equal(run('preview').status,0);
  assert.equal(run('review','--result','pass').status,0);
  const packed=run('pack');assert.equal(packed.status,0,packed.stderr);
  const manifest=JSON.parse(await readFile(join(dir,'output/manifest.json'),'utf8'));
  assert.deepEqual(manifest.visualReview,{result:'pass',source:'agent-declared'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('eight required materials survive text revision, grouping, preview and pack',async()=>{
 const assets=Array.from({length:8},(_,index)=>({id:'required-'+index,title:'素材 '+(index+1),kind:'sticker',physicalWidthMM:20,physicalHeightMM:24,supply:{quantity:1}}));
 const p=project('八件素材双页',{mode:'spread',ratio:'b6'});p.requiredAssetIDs=assets.map(asset=>asset.id);
 const aliases=Object.fromEntries(assets.map((asset,index)=>['m'+(index+1),asset.id]));
 const task=await createOfflineHandoff({project:p,assets,aliases,previews:assets.map((_,index)=>({alias:'m'+(index+1),bytes:tinyPNG})),settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-v3-eight-'));
 try{
  for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}await linkTestCanvas(dir);
  const run=(name,arg)=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:30000});
  const initial=JSON.parse(run('info').stdout).sceneRevision;
  const first={protocolVersion:1,transactionId:'eight-seed',baseSceneRevision:initial,operations:[
   ...assets.map((asset,index)=>({op:'material.add',id:'piece-'+index,asset:'m'+(index+1),placement:{xMm:25+(index%4)*44,yMm:40+Math.floor(index/4)*43}})),
   ...assets.map((asset,index)=>({op:'material.decision',asset:'m'+(index+1),choice:'intact',reason:'保留素材 '+(index+1)+' 的完整边界并纳入本次双页叙事'}))
  ]};
  await writeFile(join(dir,'work/commands.json'),JSON.stringify(first));let result=run('apply','work/commands.json');assert.equal(result.status,0,result.stderr);
  const second={protocolVersion:1,transactionId:'eight-type',baseSceneRevision:JSON.parse(run('info').stdout).sceneRevision,operations:[
   {op:'text.add',id:'title',content:'把今天留在纸上',xMm:80,yMm:16,widthMm:95,fontSizePt:18},
   {op:'text.add',id:'note',content:'八件小东西有各自的位置，也可以组成同一段记忆。',xMm:190,yMm:145,widthMm:80,fontSizePt:10},
   {op:'shape.add',id:'accent',kind:'ellipse',xMm:145,yMm:18,widthMm:7,heightMm:7,fill:'#d5e2d6'},
   {op:'group.create',id:'heading-group',targets:['title','accent'],name:'标题与点缀'},
   {op:'group.transform',target:'heading-group',transform:{dx:3,dy:0,rotation:0}}
  ]};
  await writeFile(join(dir,'work/commands.json'),JSON.stringify(second));result=run('apply','work/commands.json');assert.equal(result.status,0,result.stderr);
  const third={protocolVersion:1,transactionId:'eight-revise',baseSceneRevision:JSON.parse(run('info').stdout).sceneRevision,operations:[
   {op:'layer.update',target:'note',set:{fontSizePt:11,xMm:185,yMm:142,content:'八件小东西有各自的位置。\n把它们放在一起，今天就有了形状。'}}
  ]};
  await writeFile(join(dir,'work/commands.json'),JSON.stringify(third));result=run('apply','work/commands.json');assert.equal(result.status,0,result.stderr);
  result=run('preview');assert.equal(result.status,0,result.stderr);
  result=run('pack');assert.equal(result.status,0,result.stderr);
  const scene=JSON.parse(await readFile(join(dir,'scene.json'),'utf8'));
  assert.equal(scene.materialDecisions.length,8);
  assert.equal(importEditableWork(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'),assets).drafts[0].items.length,8);
 }finally{await rm(dir,{recursive:true,force:true});}
});
