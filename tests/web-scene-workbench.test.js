import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {spawnSync} from 'node:child_process';
import {unzipSync,strFromU8} from 'fflate';
import {createOfflineHandoff,importEditableWork} from './v3-test-handoff.mjs';
import {project,itemFromAsset,textBlock} from '../src/domain.js';
import {attachSceneV2} from '../src/scene-v2.js';
import {craftSceneHash} from '../src/craft-fingerprint.js';
import {assetSourceRevision} from '../src/material-anatomy.js';
import {applyWebSceneCommands,compileWebSceneInput,validateWebScene,webSceneDocument} from '../src/web-scene-workbench.js';
import {validateMaterialDecisions} from '../src/creation-material-decisions.js';
import {linkTestCanvas,tinyPNG} from './offline-canvas-test-support.mjs';
const assets=[{id:'a',title:'小纸片',kind:'sticker',blobId:'fixed-a',physicalWidthMM:30,physicalHeightMM:40}];
const fixture=async(p=project('图层测试'),sourceAssets=assets,withImages=false)=>{
 const aliases={m1:'a',...(sourceAssets.some(row=>row.id==='b')?{m2:'b'}:{})};
 const task=await createOfflineHandoff({project:p,assets:sourceAssets,aliases,previews:Object.keys(aliases).map(alias=>({alias,bytes:tinyPNG})),settings:{includeThumbnails:true}});
 const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
 const draft=attachSceneV2(structuredClone(task.source.baseDraft));
 if(!draft.layers.some(node=>node.type==='material')){
  const item=itemFromAsset(sourceAssets[0],draft,draft.canvas.width*.35,draft.canvas.height*.45);
  item.id='example-material';item.type='material';item.creativePieceID='example-piece';draft.layers.push(item);
 }
 if(!draft.layers.some(node=>node.type==='text')){
  const title=textBlock('一页纸',draft);title.id='example-title';title.type='text';draft.layers.push(title);
 }
 const doc=webSceneDocument(task.source,draft,p.title);
 const instructions={page:{version:2,paper:{color:'#fffaf0',pattern:'plain'},layers:[
  {type:'material',asset:'m1',placement:{x:.24,y:.4}},
  {type:'shape',kind:'ellipse',x:.4,y:.3,width:.1,height:.1,fill:'#aabbcc'},
  {type:'ink',points:[{x:.1,y:.7},{x:.4,y:.7}],width:4,color:'#eebb44',pen_style:'marker'},
  {type:'text',content:'这一页',font_style:'serif',x:.2,y:.1,width:.4,height:.1,font_size:22,color:'#334433'}
 ]}};
 files['examples/instructions.json']=new TextEncoder().encode(JSON.stringify(instructions));
 return {task,files,doc};
};
const mask={outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[.2,.2],[.3,.2],[.3,.3],[.2,.3]]]};
test('compact page instructions compile all visual layers and material decisions',async()=>{
 const {doc,files}=await fixture();
 const input=JSON.parse(strFromU8(files['examples/instructions.json']));
 input.materialDecisions=[{asset:'m1',choice:'intact',reason:'保留纸片的完整轮廓，作为本页视觉主体'}];
 const result=compileWebSceneInput(doc,input,assets);
 assert.deepEqual(result.page.layers.slice(-4).map(node=>node.type),['material','shape','ink','text']);
 assert.ok(result.page.layers.slice(-4).every(node=>typeof node.id==='string'&&node.id.length>0));
 assert.equal(result.page.layers.at(-4).materialSteps[0].op,'whole');
 assert.deepEqual(result.materialDecisions,input.materialDecisions);
 assert.throws(()=>compileWebSceneInput(doc,{...input,materialDecisions:[{...input.materialDecisions[0],choice:'crafted'}]},assets),/加工声明/);
});
test('compact instructions can crop a material and group it with a digital shape',async()=>{
 const {doc,files}=await fixture();
 const input=JSON.parse(strFromU8(files['examples/instructions.json']));
 const [material,shape,...rest]=input.page.layers;
 material.operations=[{op:'crop',box:{unit:'ratio',mode:'keep',values:[.1,.1,.8,.8]}}];
 input.page.layers=[{type:'group',id:'paper-group',children:[material,shape]},...rest];
 input.materialDecisions=[{asset:'m1',choice:'crafted',reason:'裁取纸片中央图案并与圆形图案组合'}];
 const result=compileWebSceneInput(doc,input,assets);
 assert.equal(result.page.layers.at(-3).type,'group');
 assert.deepEqual(result.page.layers.at(-3).children.map(node=>node.type),['material','shape']);
 assert.equal(result.page.layers.at(-3).children[0].cropRect.width,.8);
 assert.deepEqual(result.materialDecisions,input.materialDecisions);
});
test('material decisions agree with visible use and real processing, without a craft quota',async()=>{
 const {doc}=await fixture();
 const intact=[{asset:'m1',choice:'intact',reason:'保留纸片的完整边界，以真实尺寸作为主体'}];
 assert.deepEqual(validateMaterialDecisions(intact,doc.page,doc.source),intact);
 const update={baseSceneHash:craftSceneHash(attachSceneV2(doc.page)),materialDecisions:intact};
 assert.deepEqual(applyWebSceneCommands(doc,update,assets).materialDecisions,intact);
 assert.throws(()=>applyWebSceneCommands(doc,{...update,materialDecisions:[{...intact[0],choice:'crafted'}]},assets),/加工声明/);
 assert.throws(()=>validateMaterialDecisions([{...intact[0],choice:'crafted'}],doc.page,doc.source),/加工声明/);
 const cropped=structuredClone(doc.page);cropped.layers.find(n=>n.type==='material').cropRect={x:0,y:0,width:.8,height:1};
 assert.deepEqual(validateMaterialDecisions([{...intact[0],choice:'crafted'}],cropped,doc.source)[0].choice,'crafted');
 assert.throws(()=>validateMaterialDecisions(intact,cropped,doc.source),/加工声明/);
 const hidden=structuredClone(doc.page);hidden.layers.find(n=>n.type==='material').hidden=true;
 assert.deepEqual(validateMaterialDecisions([{...intact[0],choice:'omitted'}],hidden,doc.source)[0].choice,'omitted');
 assert.throws(()=>validateMaterialDecisions(intact,hidden,doc.source),/可见图层/);
});
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
test('AI tools and direct Scene share editable tape ribbons while all other Scene nodes remain editable',async()=>{
 const tape={id:'b',title:'花纹胶带',kind:'tape',blobId:'fixed-tape',
  physicalWidthMM:120,physicalHeightMM:16,tapeAxis:'x',tapeRepeatMode:'repeatablePattern',
  tapeRepeatStartMM:12,tapeRepeatEndMM:32,tapeRepeatPeriodMM:20};
 const sourceAssets=[...assets,tape],{doc,files}=await fixture(project('胶带与图层'),sourceAssets);
 const context=JSON.parse(strFromU8(files['TASK.json']));
 assert.deepEqual(context.materials.find(item=>item.alias==='m2').kind,'tape');
 const result=applyWebSceneCommands(doc,{baseSceneHash:craftSceneHash(attachSceneV2(doc.page)),tools:[
  {name:'draw_tape_strips',arguments:{items:[
   {asset:'m2',piece:'ribbon-a',points:[[.1,.2],[.5,.23],[.9,.2]],width_mm:18,
    texture_mode:'repeat',start_cap:'angled',end_cap:'torn'},
   {asset:'m2',piece:'ribbon-b',points:[[.15,.8],[.85,.8]],texture_mode:'stretch',
    width_mm:9,source_offset_mm:5,source_window_mm:50}
  ]}}
 ]},sourceAssets);
 const strips=result.page.layers.filter(node=>node.tapeStrip);
 assert.equal(strips.length,2);
 assert.deepEqual(strips.map(node=>node.materialUnitIndex),[0,1]);
 assert.deepEqual(strips.map(node=>node.tapeStrip.textureMode),['repeat','stretch']);
 assert.equal(strips[0].tapeStrip.physicalWidthMM,18);
 assert.equal(importEditableWork(JSON.stringify(result),sourceAssets).drafts[0].items.length,3);
 const direct=structuredClone(result);
 direct.page.layers.find(node=>node.id===strips[0].id).tapeStrip.reverseTexture=true;
 assert.equal(importEditableWork(JSON.stringify(direct),sourceAssets).drafts[0].items.length,3);
 const invalid=structuredClone(direct);
 invalid.page.layers.find(node=>node.id===strips[0].id).tapeStrip.bandWidthScene*=2;
 assert.throws(()=>importEditableWork(JSON.stringify(invalid),sourceAssets),/胶带路径|宽度|尺寸/);
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
test('curved text, repeatable stamps, material replacement, layout reuse and glyph knockout remain native Scene',async()=>{
 const extra={id:'b',title:'另一张纸',kind:'sticker',blobId:'fixed-b',physicalWidthMM:20,physicalHeightMM:25};
 const sourceAssets=[...assets,extra],{doc}=await fixture(project('高级创作'),sourceAssets);
 const original=structuredClone(doc),hash=()=>craftSceneHash(attachSceneV2(doc.page));
 const text=doc.page.layers.find(node=>node.type==='text');
 let next=applyWebSceneCommands(doc,{baseSceneHash:hash(),edits:[{op:'patch',id:text.id,values:{curveHeight:-18,content:'弧线标题'}}]},sourceAssets);
 assert.equal(next.page.layers.find(node=>node.id===text.id).curveHeight,-18);
 assert.throws(()=>applyWebSceneCommands(next,{baseSceneHash:craftSceneHash(attachSceneV2(next.page)),edits:[{op:'patch',id:text.id,values:{content:'两行\n标题'}}]},sourceAssets),/曲线文字/);
 const shape={id:'stamp-master',type:'shape',kind:'vector',x:100,y:100,width:40,height:40,
  fill:'#d06b66',stroke:null,vectorPaths:[[[.5,0],[1,.5],[.5,1],[0,.5]]]};
 next.page.layers.push(shape);
 next=applyWebSceneCommands(next,{baseSceneHash:craftSceneHash(attachSceneV2(next.page)),edits:[
  {op:'repeat-stamp',id:shape.id,placements:[{x:180,y:110,rotation:12},{x:240,y:110,scale:.8}]}
 ]},sourceAssets);
 assert.equal(next.page.layers.filter(node=>node.id.startsWith('stamp-master-stamp')).length,2);
 const material=next.page.layers.find(node=>node.type==='material'),before={x:material.x,y:material.y,rotation:material.rotation,zIndex:material.zIndex};
 assert.throws(()=>applyWebSceneCommands(next,{baseSceneHash:craftSceneHash(attachSceneV2(next.page)),edits:[
  {op:'repeat-stamp',id:material.id,placements:[{x:10,y:10}]}
 ]},sourceAssets),/数字印章来源/);
 next=applyWebSceneCommands(next,{baseSceneHash:craftSceneHash(attachSceneV2(next.page)),edits:[
  {op:'replace-material',id:material.id,assetID:'b'}
 ]},sourceAssets);
 const replaced=next.page.layers.find(node=>node.id===material.id);
 assert.equal(replaced.assetID,'b');assert.equal(replaced.sourceBlobId,'fixed-b');
 assert.deepEqual({x:replaced.x,y:replaced.y,rotation:replaced.rotation,zIndex:replaced.zIndex},before);
 assert.ok(replaced.width<material.width);
 const layout=structuredClone(original.page);layout.layers=layout.layers.filter(node=>node.type==='text');
 next=applyWebSceneCommands(next,{baseSceneHash:craftSceneHash(attachSceneV2(next.page)),edits:[
  {op:'reuse-layout',layout,prefix:'reuse',materialMap:{}}
 ]},sourceAssets);
 assert.ok(next.page.layers.some(node=>node.id==='reuse-'+text.id));
 const glyph=[[[[1,1],[5,1],[5,5],[1,5]]]];
 assert.throws(()=>applyWebSceneCommands(next,{baseSceneHash:craftSceneHash(attachSceneV2(next.page)),edits:[
  {op:'glyph-knockout',id:material.id,geometryMM:glyph,originMM:[30,30]}
 ]},sourceAssets),/裁片|镂空|区域|移除|几何|材料/);
 next=applyWebSceneCommands(next,{baseSceneHash:craftSceneHash(attachSceneV2(next.page)),edits:[
  {op:'glyph-knockout',id:material.id,geometryMM:glyph,originMM:[4,4]}
 ]},sourceAssets);
 assert.equal(next.page.layers.find(node=>node.id===material.id).materialMask.shape,'region');
 assert.equal(importEditableWork(JSON.stringify(next),sourceAssets).drafts[0].items[0].assetID,'b');
 const clean=await fixture(project('布局复用'),sourceAssets);
 const mapped=applyWebSceneCommands(clean.doc,{baseSceneHash:craftSceneHash(attachSceneV2(clean.doc.page)),edits:[
  {op:'reuse-layout',layout:clean.doc.page,prefix:'layout2',materialMap:{a:'b'}}
 ]},sourceAssets);
 const mappedMaterial=mapped.page.layers.find(node=>node.id.startsWith('layout2-')&&node.type==='material');
 assert.equal(mappedMaterial.assetID,'b');assert.equal(mappedMaterial.sourceBlobId,'fixed-b');
 assert.equal(importEditableWork(JSON.stringify(mapped),sourceAssets).drafts[0].items.length,2);
});
// v3 runtime atomicity, source partition, PNG and stale-pack checks live in v3-package.test.js.

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
