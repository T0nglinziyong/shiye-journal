import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {computeGraphics} from '../src/graphics-engine.js';
import {graphicsRequestSchema,graphicsHelp} from '../src/graphics-contract.js';
import {creationCommonDefinitions} from '../src/creation-command-spec.js';
import {validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {project} from '../src/domain.js';
import {tinyPNG,linkTestCanvas} from './offline-canvas-test-support.mjs';
const size={width:24,height:24,unit:'mm'},stroke={kind:'stroke',unit:'mm',points:[{x:1,y:2,pressure:.2},{x:8,y:10,pressure:.7},{x:18,y:3,pressure:.4}]};
const query=(over={})=>({version:1,operation:'rough',id:'hand-star',geometry:{kind:'star'},size,style:{fill:'#B8CCD2',stroke:'#486573',strokeWidthMm:.4},seed:42,...over});
const tx=operations=>({protocolVersion:2,transactionId:'test',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
const path=d=>({kind:'path',viewBox:[0,0,24,24],paths:[{d}]});
const digest=b=>createHash('sha256').update(b).digest('hex');
test('graphics shares executable vocabulary without adding a Scene command',()=>{
 assert.equal(graphicsRequestSchema.$defs,creationCommonDefinitions);
 assert.equal(graphicsRequestSchema.properties.geometry.$ref,'#/$defs/GraphicGeometry');
 assert.equal(graphicsHelp.readOnly,true);assert.ok(JSON.stringify(graphicsHelp).length<3000);
});
test('actual Rough.js seed output is deterministic, distinct and editable',()=>{
 const q=query(),before=JSON.stringify(q),a=computeGraphics(q),b=computeGraphics(q),c=computeGraphics(query({seed:57}));
 assert.deepEqual(a,b);assert.notEqual(a.svg,c.svg);assert.equal(JSON.stringify(q),before);
 assert.ok(a.paths.length>=2);assert.match(a.svg,/<path/);assert.doesNotMatch(a.svg,/<image|<script|href=/);
 assert.doesNotThrow(()=>validateCreationV2Commands(tx(a.operations)));assert.equal(a.operations[0].op,'group.compose');
 assert.ok(a.operations[0].children.every(c=>c.op==='graphic.add'&&c.geometry.kind==='path'));
});
test('actual Paper operations preserve style, millimetres and remain ordinary drafts',()=>{
 for(const operation of ['smooth','simplify','flatten']){
  const q=query({operation,seed:undefined,geometry:path('M1 20 C5 1 18 1 23 20')});
  const out=computeGraphics(q);assert.equal(out.paths[0].style.strokeWidthMm,.4);
  assert.doesNotThrow(()=>validateCreationV2Commands(tx(out.operations)));
  if(operation==='flatten')assert.doesNotMatch(out.paths[0].d,/[Cc]/);
 }
 const out=computeGraphics(query({operation:'measure',seed:undefined,geometry:path('M0 0H24V24H0Z')}));
 assert.equal(out.measurements[0].areaMm2,24*24);assert.deepEqual(out.operations,[]);
});
test('boolean holes and empty results do not create fabricated geometry',()=>{
 const out=computeGraphics(query({operation:'boolean',seed:undefined,geometry:path('M0 0H24V24H0Z'),operand:path('M6 6H18V18H6Z'),options:{mode:'subtract'}}));
 const measured=computeGraphics(query({operation:'measure',seed:undefined,geometry:{kind:'path',viewBox:[0,0,24,24],paths:out.paths.map(({d,fillRule})=>({d,fillRule}))}}));
 assert.equal(measured.measurements[0].areaMm2,24*24-12*12);
 const empty=computeGraphics(query({operation:'boolean',seed:undefined,geometry:path('M0 0H24V24H0Z'),operand:path('M0 0H24V24H0Z'),options:{mode:'subtract'}}));
 assert.equal(empty.empty,true);assert.deepEqual(empty.operations,[]);assert.deepEqual(empty.paths,[]);
});
test('pressure outline uses original millimetre points rather than silently stretching them',()=>{
 const out=computeGraphics(query({operation:'stroke',seed:undefined,geometry:stroke,style:{stroke:'#123456',strokeWidthMm:2}}));
 assert.equal(out.paths[0].style.fill,'#123456');assert.equal(out.paths[0].style.stroke,null);
 assert.equal(stroke.points[1].pressure,.7);assert.doesNotThrow(()=>validateCreationV2Commands(tx(out.operations)));
});
test('irrelevant options, missing seeds, malformed paths and excessive inputs fail before output',()=>{
 for(const q of [query({seed:undefined}),query({operation:'measure',seed:undefined,options:{roughness:1}}),query({operation:'boolean',seed:undefined}),query({geometry:path('<svg onload="x"/>')}),query({style:{stroke:'url(https://example.com)'}}),query({geometry:path('M0 0 L'+('1 2 '.repeat(10000)))}),query({operation:'smooth',seed:undefined,options:{factor:.8}})])assert.throws(()=>computeGraphics(q));
 assert.throws(()=>computeGraphics(query({operation:'boolean',seed:undefined,geometry:stroke,operand:{kind:'rect'}})),/闭合/);
});
test('exported utility runs without npm, then check/apply renders and reopens actual editable vectors',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shiye-graphics-'));
 try{
  const a={id:'source',title:'Synthetic source',kind:'paper',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
  const p=project('Local graphics',{ratio:'b6'});p.candidateAssetIDs=['source'];p.contentPolicy='visual';
  const task=await createOfflineHandoff({project:p,assets:[a],aliases:{m1:a.id},previews:[{alias:'m1',bytes:tinyPNG}]});
  const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));for(const [name,data] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),data);}
  const cli=(...args)=>JSON.parse(execFileSync(process.execPath,['runtime/shiye.cjs',...args],{cwd:dir,encoding:'utf8',timeout:15000}));
  await assert.rejects(access(join(dir,'node_modules')));
  const before=await readFile(join(dir,'scene.json')),assetBefore=await readFile(join(dir,'assets/m1.png'));
  await writeFile(join(dir,'work/graphics.json'),JSON.stringify(query({place:{reference:'page',at:[70,80],unit:'mm'}})));
  const result=cli('graphics','work/graphics.json');assert.equal(result.readOnly,true);
  assert.equal(digest(await readFile(join(dir,'scene.json'))),digest(before));assert.deepEqual(await readFile(join(dir,'assets/m1.png')),assetBefore);
  assert.throws(()=>cli('graphics','work/graphics.json'),/已存在/);
  cli('check',result.commands);await linkTestCanvas(dir);cli('apply',result.commands);
  const info=cli('info');await writeFile(join(dir,'work/decisions.json'),JSON.stringify({protocolVersion:2,transactionId:'decision',baseSceneRevision:info.sceneRevision,operations:[{op:'material.decision',asset:'m1',choice:'omitted',reason:'This fixture verifies editable digital geometry without consuming real paper.'}]}));cli('apply','work/decisions.json');
  const preview=cli('preview');assert.equal(preview.renderer,'shiye-scene-v2');assert.ok((await readFile(join(dir,'output/preview.png'))).length>1000);
  const packed=cli('pack');assert.equal(packed.previewHash,preview.pngHash);
  const restored=importEditableWork(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'),[a],{trustedSource:task.source});
  assert.equal(restored.drafts[0].layers[0].type,'group');assert.ok(restored.drafts[0].layers[0].children.every(n=>n.type==='shape'&&n.svgPaths));
 }finally{await rm(dir,{recursive:true,force:true});}
});
