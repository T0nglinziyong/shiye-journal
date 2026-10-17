import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {spawnSync} from 'node:child_process';
import {unzipSync,strFromU8} from 'fflate';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {project} from '../src/domain.js';
import {attachSceneV2} from '../src/scene-v2.js';
import {craftSceneHash} from '../src/craft-fingerprint.js';
import {applyWebSceneCommands,compileWebSceneInput,validateWebScene,webSceneDocument} from '../src/web-scene-workbench.js';
const assets=[{id:'a',title:'小纸片',kind:'sticker',blobId:'fixed-a',physicalWidthMM:30,physicalHeightMM:40}];
const fixture=async(p=project('图层测试'))=>{
 const task=await createOfflineHandoff({project:p,assets,aliases:{m1:'a'},settings:{includeThumbnails:false}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
 return {task,files,doc:JSON.parse(strFromU8(files['examples/project.shiyeproject.json']))};
};
const mask={outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[.2,.2],[.3,.2],[.3,.3],[.2,.3]]]};
test('native snapshot preserves pressure ink, nested groups, typography, masks and multi-color vectors',async()=>{
 const {doc,task}=await fixture();
 doc.page.layers.push({id:'group',type:'group',name:'组合',opacity:.8,blendMode:'multiply',vectorMask:mask,children:[
  {id:'pressure',type:'ink',penStyle:'pressure',width:5,color:'#112233',points:[{x:10,y:20,p:.2},{x:80,y:60,p:.9}],zIndex:1},
  {id:'inner',type:'group',children:[{id:'vector',type:'shape',kind:'vector',x:200,y:200,width:100,height:80,fill:'#e0a040',stroke:null,vectorLayers:[{fill:'#336699',paths:[[[0,0],[1,0],[.5,1]]]}]}]}
  ]});
 const text=doc.page.layers.find(n=>n.type==='text');Object.assign(text,{bold:true,italic:true,letterSpacing:2,fixedLineHeight:48,paragraphSpacing:8,vectorMask:mask});
 const result=importEditableWork(JSON.stringify(doc),assets,{trustedSource:task.source});
 assert.equal(craftSceneHash(result.drafts[0]),craftSceneHash(attachSceneV2(structuredClone(doc.page))));
 assert.deepEqual(result.drafts[0].layers.map(n=>n.id),doc.page.layers.map(n=>n.id));
 const next=applyWebSceneCommands(doc,{baseSceneHash:craftSceneHash(attachSceneV2(doc.page)),edits:[{op:'patch',id:text.id,values:{fontSize:34}},{op:'move',id:'pressure',parent:'inner'}]},assets);
 assert.equal(next.page.layers.at(-1).children[0].children.at(-1).id,'pressure');
 assert.equal(importEditableWork(JSON.stringify(next),assets).drafts[0].textBlocks[0].fontSize,34);
});
test('direct edits cannot forge manual privileges, image source, physical units or locked contents',async()=>{
 const {doc}=await fixture();const material=doc.page.layers.find(n=>n.type==='material');
 for(const change of [n=>{n.width*=2;},n=>{n.width*=2;n.manualVisualResize=true;},n=>{n.manualVisualCopy=true;},n=>{n.sourceBlobId='unrelated';}]){
   const bad=structuredClone(doc);change(bad.page.layers.find(n=>n.id===material.id));assert.throws(()=>importEditableWork(JSON.stringify(bad),assets));
 }
 const bad=structuredClone(doc);bad.page.canvas.width+=1;assert.throws(()=>importEditableWork(JSON.stringify(bad),assets),/物理单位/);
 const p=project('已有作品');p.drafts[0].layers=structuredClone(doc.page.layers);p.drafts[0].layers[0].isLocked=true;
 const locked=await fixture(p);locked.doc.page.layers[0].x+=1;
 assert.throws(()=>importEditableWork(JSON.stringify(locked.doc),assets),/锁定/);
 const unchanged=webSceneDocument(locked.task.source,locked.task.source.baseDraft);
 assert.equal(importEditableWork(JSON.stringify(unchanged),assets).drafts[0].items.length,1);
});
test('source overlap, native masks and hidden required ancestors share material rules',async()=>{
 const p=project('保留素材');p.processing='保留完整';p.requiredAssetIDs=['a'];const {doc}=await fixture(p);
 const dup=structuredClone(doc),copy=structuredClone(doc.page.layers[0]);copy.id='duplicate';copy.creativePieceID='duplicate';dup.page.layers.push(copy);
 assert.throws(()=>importEditableWork(JSON.stringify(dup),assets),/重叠|重复/);
 const masked=structuredClone(doc);masked.page.layers[0].vectorMask=mask;assert.throws(()=>importEditableWork(JSON.stringify(masked),assets),/完整/);
 const hidden=structuredClone(doc);hidden.page.layers=[{id:'hidden',type:'group',hidden:true,children:hidden.page.layers}];assert.throws(()=>importEditableWork(JSON.stringify(hidden),assets),/必用/);
});
test('tool/precise batches are atomic, reject stale baselines, and never mutate their input',async()=>{
 const {doc}=await fixture(),before=JSON.stringify(doc);const id=doc.page.layers[0].id;
 const commands={baseSceneHash:craftSceneHash(attachSceneV2(doc.page)),edits:[{op:'patch',id,values:{x:300}},{op:'patch',id:'missing',values:{x:1}}]};
 assert.throws(()=>applyWebSceneCommands(doc,commands,assets),/不存在/);assert.equal(JSON.stringify(doc),before);
 assert.throws(()=>applyWebSceneCommands(doc,{...commands,baseSceneHash:'sha256:stale'},assets),/已变化/);
 assert.throws(()=>importEditableWork(JSON.stringify({...doc,tools:[]}),assets),/最终仅交付/);
});
test('self-contained runtime compiles, revises, inspects, renders input and exports one hash-bound snapshot',async()=>{
 const {files,task}=await fixture(),dir=await mkdtemp(join(tmpdir(),'shiye-workbench-'));
 try{
  for(const [name,data] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),data);}
  const run=(name,...args)=>{const r=spawnSync(process.execPath,['runtime/'+name+'.cjs',...args],{cwd:dir,encoding:'utf8',timeout:15000});return r;};
  assert.equal(run('self-test').status,0);
  assert.equal(run('compile','examples/instructions.json').status,0);
  let doc=JSON.parse(await readFile(join(dir,'scene.json'),'utf8'));
  assert.ok(doc.page.layers[0].width>1);assert.equal(doc.tools,undefined);
  const original=await readFile(join(dir,'scene.json'),'utf8');
  await writeFile(join(dir,'commands.json'),JSON.stringify({baseSceneHash:craftSceneHash(attachSceneV2(doc.page)),edits:[{op:'patch',id:doc.page.layers[0].id,values:{x:200}},{op:'patch',id:'missing',values:{x:2}}]}));
  assert.equal(run('apply').status,1);assert.equal(await readFile(join(dir,'scene.json'),'utf8'),original);
  doc.page.layers.push({id:'note',type:'text',content:'春日记录',fontSize:32,style:'sans',color:'#223344',x:200,y:180,width:300,height:60});
  await writeFile(join(dir,'scene.json'),JSON.stringify(doc));
  assert.equal(run('preview').status,0);
  const missing=run('pack');assert.equal(missing.status,1);assert.match(missing.stderr,/PNG/);
  const manifest=JSON.parse(await readFile(join(dir,'output/preview-manifest.json'),'utf8'));
  assert.equal(craftSceneHash(importEditableWork(JSON.stringify(doc),assets,{trustedSource:task.source}).drafts[0]),manifest.sceneHash);
  await writeFile(join(dir,'output/canvas-capture.json'),JSON.stringify({sceneHash:'sha256:old',png:'data:image/png;base64,AAAA'}));
  const stale=run('save-preview');assert.equal(stale.status,1);assert.match(stale.stderr,/旧 Scene/);
  doc.page.layers.at(-1).content='改变之后';await writeFile(join(dir,'scene.json'),JSON.stringify(doc));
  assert.equal(run('pack').status,1,'stale preview cannot validate a changed scene');
  await assert.rejects(readFile(join(dir,'output/project.shiyeproject.json')),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('direct Scene revision can be followed by tools without treating AI edits as human takeover',async()=>{
 const {doc}=await fixture();const n=doc.page.layers.find(n=>n.type==='text');n.agentKey='heading';n.content='先直接修改';
 const next=applyWebSceneCommands(doc,{baseSceneHash:craftSceneHash(attachSceneV2(doc.page)),tools:[{name:'upsert_text',arguments:{items:[{key:'heading',content:'然后用工具修改',x:.5,y:.2,width:.6,font_size:28,color:'#223344'}]}}]},assets);
 assert.equal(attachSceneV2(next.page).textBlocks.find(t=>t.agentKey==='heading').content,'然后用工具修改');
});

test('compiled digital handwriting and an existing rotated ink group remain fully editable',async()=>{
 const {doc}=await fixture();doc.page.layers[0].rotation=354;
 const compiled=compileWebSceneInput(doc,{page:{version:2,style:'自由构图',intent:null,paper:{color:'#ffffff',pattern:'plain'},layers:[{type:'ink',id:'written',points:[{x:.1,y:.1,pressure:.1},{x:.3,y:.2,pressure:.8}],width:4,color:'#123456',opacity:1,pen_style:'pressure'}]}},assets);
 const ink=attachSceneV2(compiled.page).strokes[0];assert.equal(ink.agentGenerated,true);assert.equal(ink.points[1].p,.8);
 const p=project('含笔迹组');p.drafts[0].layers=[{id:'ink-group',type:'group',autoInkGroup:true,children:[ink]}];
 const next=await fixture(p);assert.equal(importEditableWork(JSON.stringify(next.doc),assets).drafts[0].layers[0].autoInkGroup,true);
});

test('parent masks cannot bypass small-trim source limits',async()=>{
 const p=project('组合蒙版');p.processing='少量裁剪';const {doc}=await fixture(p);
 const m=doc.page.layers[0];const half=(m.x/doc.page.canvas.width);
 doc.page.layers=[{id:'clipped',type:'group',vectorMask:{outer:[[0,0],[half,0],[half,1],[0,1]],holes:[]},children:doc.page.layers}];
 assert.throws(()=>importEditableWork(JSON.stringify(doc),assets),/60%/);
});
