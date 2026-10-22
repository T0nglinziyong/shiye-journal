import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {createHash} from 'node:crypto';
import {project} from '../src/domain.js';
import {createOfflineHandoff,verifyOfflineTaskPackage,inspectOfflinePackage,importEditableWork,importEditableWorkPackage,EDITABLE_PACKAGE_ENTRY,EDITABLE_WORK_FORMAT} from '../src/offline-creation.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
const asset={id:'asset-1',title:'蓝色纸',kind:'sticker',role:'focal',physicalWidthMM:40,physicalHeightMM:50,supply:{quantity:1},tags:['蓝色']};
const make=async(options={})=>createOfflineHandoff({project:options.p||project('测试创作'),assets:options.assets||[asset],aliases:options.aliases||{m1:asset.id},previews:options.previews||[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true,...options.settings}});
const entries=async task=>unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
const read=(files,path)=>JSON.parse(strFromU8(files[path]));
test('editable GPT package uses one v3 command entry and authoritative Scene',async()=>{
 const task=await make(),files=await entries(task),context=read(files,'TASK.json');
 assert.equal(context.version,3);assert.equal(context.sourceContext.packageLayout,'v3');
 assert.deepEqual(Object.keys(files).filter(name=>!name.includes('/')).sort(),['START_HERE.md','TASK.json','package-lock.json','package.json','scene.json']);
 for(const path of ['assets/overview.jpg','assets/m1.png','assets/manifest.json','design/GUIDE.md','design/SKILL.md','design/PLAYBOOK.md','design/REVIEW.md','design/RECIPES.md','api/commands.schema.json','api/scene.schema.json','runtime/shiye.cjs','work/commands.json'])assert.ok(files[path],path);
 assert.equal(files['examples/instructions.json'],undefined);assert.equal(files['task/context.json'],undefined);
 assert.match(strFromU8(files['START_HERE.md']),/scene\.json 是唯一作品/);
 assert.match(strFromU8(files['START_HERE.md']),/work\/commands\.json/);
 assert.equal(context.materials[0].physicalWidthMM,40);assert.equal(read(files,'assets/manifest.json').assets[0].assetID,asset.id);
 assert.ok(strFromU8(files['design/GUIDE.md']).length<12000);
 assert.equal(read(files,'scene.json').format,EDITABLE_WORK_FORMAT);
});
test('v3 task keeps original image bytes, hash and task binding',async()=>{
 const task=await make(),files=await entries(task),bytes=new Uint8Array(await task.blob.arrayBuffer());
 assert.deepEqual(files['assets/m1.png'],tinyPNG);
 assert.equal(task.source.previewHashes.m1,'sha256:'+createHash('sha256').update(tinyPNG).digest('hex'));
 assert.equal(read(files,'assets/manifest.json').assets[0].sha256,task.source.previewHashes.m1);
 assert.equal(inspectOfflinePackage(bytes).source.bundleId,task.source.bundleId);
 await verifyOfflineTaskPackage(bytes,task.source);
 const broken={...files,'assets/m1.png':new Uint8Array([...tinyPNG.slice(0,-1),tinyPNG.at(-1)^1])};
 await assert.rejects(verifyOfflineTaskPackage(zipSync(broken),task.source),/指纹不一致/);
});
test('editable Scene import checks format, task and source dimensions',async()=>{
 const task=await make(),scene=read(await entries(task),'scene.json');
 assert.equal(importEditableWork(JSON.stringify(scene),[asset],{trustedSource:task.source}).offlineBundleId,task.source.bundleId);
 assert.throws(()=>importEditableWork(JSON.stringify(scene),[asset],{trustedSource:{...task.source,bundleId:'other'}}),/来源与所选原始任务不一致/);
 assert.throws(()=>importEditableWork(JSON.stringify({...scene,format:'other'}),[asset]),/不是拾页/);
 assert.throws(()=>importEditableWork('not-json',[asset]),/不是有效 JSON/);
 assert.throws(()=>importEditableWork(JSON.stringify(scene),[{...asset,physicalWidthMM:45}]),/素材抠图或实物尺寸已变化/);
});
test('editable result ZIP still validates its native project entry',async()=>{
 const task=await make(),scene=read(await entries(task),'scene.json');
 const packed=zipSync({[EDITABLE_PACKAGE_ENTRY]:strToU8(JSON.stringify(scene))});
 assert.equal(importEditableWorkPackage(packed,[asset],{trustedSource:task.source}).offlineBundleId,task.source.bundleId);
 assert.throws(()=>importEditableWorkPackage(zipSync({'preview.svg':strToU8('<svg/>')}),[asset]),/缺少/);
});
test('image-only task remains separate and no private keys reach either package',async()=>{
 const image=await make({settings:{deliveryMode:'image',key:'sk-test-not-for-GPT-task'}}),files=await entries(image);
 assert.equal(image.deliveryMode,'image');assert.ok(files['task/context.json']);assert.equal(files['TASK.json'],undefined);
 const editable=await make({settings:{provider:'openai',key:'sk-test-not-for-GPT-task',keys:{openai:'sk-test-not-for-GPT-task'}}});
 const combined=Object.values(await entries(editable)).map(bytes=>strFromU8(bytes)).join(' ');
 assert.ok(!combined.includes('sk-test-not-for-GPT-task'));
});
