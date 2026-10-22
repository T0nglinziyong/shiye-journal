import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork,verifyOfflineTaskPackage} from '../src/offline-creation.js';
import {materialAliases} from '../src/material-alias.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {applyCreationV2Batch,validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {creationCommandRegistry,describeCreationCommand,creationRecipes} from '../src/creation-v2-contract.js';
import {findOfflineChromium} from '../src/offline-chromium-preview.mjs';
import {worldBox} from '../src/scene-spatial.js';
import {shapeSVG} from '../src/editor-tools-model.js';
import {tinyPNG,linkTestCanvas} from './offline-canvas-test-support.mjs';
const tx=operations=>({protocolVersion:2,transactionId:'audit-test',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
const at={reference:'page',at:[.5,.5],unit:'ratio'};
async function fixture(){
 const asset={id:'audit-paper',title:'审查合成纸',kind:'paper',physicalWidthMM:40,physicalHeightMM:30,supply:{quantity:1}},p=project('统一创作审查');p.processing='自由拆解';
 const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 return {asset,task,doc:webSceneDocument(task.source,task.source.baseDraft,'审查'),assets:task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}))};
}
test('describe schemas are standalone current and contain executable examples',()=>{
 for(const row of Object.values(creationCommandRegistry)){
  const d=describeCreationCommand(row.name,{full:true}),check=new Ajv2020({strict:false}).compile(d.schema);
  for(const example of d.examples){assert.ok(check(example),row.name+': '+JSON.stringify(check.errors));validateCreationV2Commands(tx([example]));}
 }
 for(const topic of ['place','size','style','order','region','layoutBox'])assert.doesNotThrow(()=>new Ajv2020({strict:false}).compile(describeCreationCommand(topic,{full:true}).schema));
 assert.equal(describeCreationCommand('page.update',{full:true}).schema.properties.physicalSizeMm,undefined);
 assert.deepEqual(describeCreationCommand('place',{full:true}).schema.properties.referenceBounds.enum,['layout']);
 assert.throws(()=>validateCreationV2Commands({...tx([{op:'page.update',paperColor:'#ffffff'}]),protocolVersion:1}),/协议 2/);
 assert.throws(()=>describeCreationCommand('advanced.v1.material.add'),/未知/);
 assert.match(creationRecipes(),/begin/);assert.doesNotMatch(creationRecipes(),/sha256:[a-f0-9]{64}/);
});
test('parameter errors point at the requested operation and reject meaningless styles',()=>{
 assert.throws(()=>validateCreationV2Commands(tx([{op:'text.add',id:'note',content:'test',place:at,size:{width:30,unit:'mm'},style:{fill:'#ffffff'}}])),e=>e.path.includes('/operations/0')&&e.message.includes('describe'));
 assert.throws(()=>validateCreationV2Commands(tx([{op:'material.decision',asset:'m1',choice:'intact',reason:'太短'}])),/reason/);
});
test('unified stroke geometry rotates once vector stroke and shadow persist and text height is honored',async()=>{
 const {doc,assets}=await fixture();
 const d=applyCreationV2Batch(doc,tx([
  {op:'graphic.add',id:'ink',geometry:{kind:'stroke',points:[{x:0,y:0},{x:20,y:0}],unit:'mm'},place:{...at,rotationDeg:30},style:{strokeWidthMm:1,stroke:'#334455',penStyle:'ballpoint'}},
  {op:'graphic.add',id:'vec',geometry:{kind:'path',paths:[{d:'M1 1 L9 9',style:{stroke:'#334455'}}],viewBox:[0,0,10,10]},place:at,size:{width:20,height:20,unit:'mm'},style:{strokeWidthMm:2,shadow:{offsetMm:[1,2],blurMm:1,color:'#222222'}}},
  {op:'text.add',id:'txt',content:'test',place:at,size:{width:30,height:20,unit:'mm'},style:{fontSizePt:10}},
  {op:'layer.update',target:'ink',style:{strokeWidthMm:2,stroke:'#112233'}}
 ]),assets);
 const ink=d.page.layers.find(n=>n.id==='ink'),[a,b]=ink.points;assert.ok(Math.abs(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI-30)<1e-7);assert.ok(Math.abs(worldBox(d.page,'ink').rotation-30)<1e-7);
 const vec=d.page.layers.find(n=>n.id==='vec');assert.equal(vec.shadow.color,'#222222');assert.ok(vec.lineWidth>0);assert.match(shapeSVG(vec),/stroke-width=/);
 assert.ok(worldBox(d.page,'txt').h/d.page.canvas.height*d.page.physicalPageHeightMM>=20-1e-6);
});
test('group.compose supports local revisions but cannot modify external objects',async()=>{
 const {doc,assets}=await fixture();
 const made=applyCreationV2Batch(doc,tx([{op:'group.compose',id:'g',layoutBox:{width:60,height:50,unit:'mm'},place:{...at,rotationDeg:20},children:[
  {op:'graphic.add',id:'dot',geometry:{kind:'ellipse'},place:{reference:'parent',at:[.5,.5],unit:'ratio'},size:{width:10,height:10,unit:'mm'}},{op:'layer.update',target:'dot',style:{fill:'#abcdef'}}
 ]}]),assets);
 assert.equal(made.page.layers[0].children[0].fill,'#abcdef');
 assert.throws(()=>applyCreationV2Batch(made,tx([{op:'group.compose',id:'bad',place:at,children:[{op:'layer.delete',target:'dot'}]}]),assets),/外部对象/);
});
test('exporter shortens aliases before source snapshots and preview hashes are frozen',async()=>{
 const assets=['persistent-a','persistent-b'].map(id=>({id,title:id,kind:'paper',physicalWidthMM:20,physicalHeightMM:20,supply:{quantity:1}}));
 const aliases=materialAliases(assets.map(a=>a.id)),previews=Object.keys(aliases).map(alias=>({alias,bytes:tinyPNG}));
 const task=await createOfflineHandoff({project:project('短别名'),assets,aliases,previews,settings:{includeThumbnails:true}});
 assert.deepEqual(task.source.materials,[{alias:'m1',assetID:'persistent-a'},{alias:'m2',assetID:'persistent-b'}]);
 const bytes=new Uint8Array(await task.blob.arrayBuffer()),files=unzipSync(bytes);assert.ok(files['assets/m1.png']&&files['assets/m2.png']);
 await verifyOfflineTaskPackage(bytes,task.source);
 const manifest=JSON.parse(new TextDecoder().decode(files['assets/manifest.json']));assert.deepEqual(manifest.assets.map(a=>a.alias),['m1','m2']);
});
for(const renderer of ['node','browser'])test(`exported ZIP current protocol check apply preview pack reopen (${renderer})`,async t=>{
 if(renderer==='browser'&&!findOfflineChromium()){t.skip('No Chromium installed; node renderer remains covered.');return;}
 const {task,asset}=await fixture(),files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-audit-'));
 try{
  for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}await linkTestCanvas(dir);
  const run=(...args)=>spawnSync(process.execPath,['runtime/shiye.cjs',...args],{cwd:dir,encoding:'utf8',timeout:60000,env:{...process.env,SHIYE_RENDERER:renderer,...(process.env.CI?{SHIYE_CHROMIUM_NO_SANDBOX:'1'}:{})}});
  const info=run('info');assert.equal(info.status,0,info.stderr);assert.deepEqual(JSON.parse(info.stdout).supportedProtocolVersions,[2]);assert.equal(run('describe','place').status,0);
  const draft=run('begin','work/audit.json');assert.equal(draft.status,0,draft.stderr);const batch=JSON.parse(await readFile(join(dir,'work/audit.json'),'utf8'));
  batch.operations=[{op:'material.add',id:'paper',asset:'m1',place:at},{op:'material.window',target:'paper',windowId:'hole',region:{shape:'ellipse',space:'local',unit:'ratio',box:[.3,.3,.3,.3]}},{op:'text.lettering',id:'title',content:'GO',place:{reference:'page',at:[.5,.16],unit:'ratio'},style:{fontSizePt:24,outline:{color:'#35516A',widthMm:.4},gradient:{angleDeg:90,stops:[{offset:0,color:'#E58A50'},{offset:1,color:'#556EA4'}]}},letters:[{index:1,style:{fontPreset:'serif'}}]},{op:'graphic.add',id:'title-mark',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:1,y:0}]},size:{reference:'node:title',width:.85,unit:'ratio'},place:{reference:'node:title',at:[.5,1],unit:'ratio',anchor:'center',rotationSpace:'reference',rotationDeg:0,behavior:'linked',offset:{value:[0,1.5],unit:'mm'}},style:{stroke:'#546E7A',strokeWidthMm:.55,penStyle:'ballpoint',opacity:1,blendMode:'normal'},order:{after:'title'}},{op:'material.decision',asset:'m1',choice:'crafted',reason:'在纸张中央开出圆窗，露出下层并保留实体来源。'}];await writeFile(join(dir,'work/audit.json'),JSON.stringify(batch));
  const before=await readFile(join(dir,'scene.json'),'utf8');const fonts=run('fonts');assert.equal(fonts.status,0,fonts.stderr);assert.ok(JSON.parse(fonts.stdout).presets.includes('hand'));const audit=run('design-check');assert.equal(audit.status,0,audit.stderr);assert.equal(JSON.parse(audit.stdout).visualReviewPerformed,false);assert.equal(await readFile(join(dir,'scene.json'),'utf8'),before);const check=run('check','work/audit.json');assert.equal(check.status,0,check.stderr);assert.equal(await readFile(join(dir,'scene.json'),'utf8'),before);
  for(const args of [['apply','work/audit.json'],['preview'],['review','--result','pass'],['pack']]){const result=run(...args);assert.equal(result.status,0,args.join(' ')+': '+result.stderr);}
  const manifest=JSON.parse(await readFile(join(dir,'output/manifest.json'),'utf8'));assert.match(manifest.rendererBackend,renderer==='browser'?/^browser-canvas\//:/^node-canvas@/);
  const output=await readFile(join(dir,'output/project.shiyeproject.json'),'utf8');assert.equal(output.includes('\n'),false);assert.equal(importEditableWork(output,[asset]).drafts[0].items.length,1);const restored=JSON.parse(output);assert.ok(restored.page.layers.find(n=>n.id==='title').children.every(n=>n.textOutline&&n.textGradient));const second=run('pack');assert.equal(second.status,0,second.stderr);
 }finally{await rm(dir,{recursive:true,force:true});}
});
