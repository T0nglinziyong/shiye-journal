import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import * as fabric from 'fabric/node';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch,validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {creationCommandRegistry,describeCreationCommand} from '../src/creation-v2-contract.js';
import {graphicPresetKinds} from '../src/graphic-geometry.js';
import {worldBox} from '../src/scene-spatial.js';
import {findSceneNode,attachSceneV2} from '../src/scene-v2.js';
import {solveSceneLayout} from '../src/scene-layout.js';
import {applySceneNodeChange} from '../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {createFabricSceneBridge} from '../src/fabric-scene-bridge.js';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {shapeSVG} from '../src/editor-tools-model.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
const at={reference:'page',at:[60,80],unit:'mm'},local={reference:'parent',at:[.5,.5],unit:'ratio'},size={width:12,height:12,unit:'mm'};
const path={kind:'path',viewBox:[0,0,20,10],paths:[{d:'M0 0 L20 0 L10 10 Z'}]};
const stroke={kind:'stroke',unit:'mm',points:[{x:0,y:0,pressure:.2},{x:20,y:3,pressure:.5},{x:40,y:0,pressure:.8}]};
const tx=operations=>({protocolVersion:2,transactionId:'graphic-test',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
const graphic=(geometry={kind:'star'},extra={})=>({op:'graphic.add',id:'g',geometry,place:at,size,style:{stroke:'#445566',strokeWidthMm:.5},...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
let saved;
async function setup(){
 if(!saved){const asset={id:'paper',title:'synthetic paper',kind:'paper',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};const p=project('Graphic contract');p.processing='自由拆解';
  const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}]});
  const assets=task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));saved={task,assets,doc:webSceneDocument(task.source,task.source.baseDraft,'Unified graphics')};}
 const {doc,assets,task}=saved;return {doc,assets,task,run:(ops,base=doc)=>applyCreationV2Batch(base,tx(ops),assets)};
}
const node=(d,id='g')=>findSceneNode(d.page,id);
test('one create entry, no decoration namespace, no old operations or duplicate placement vocabulary',()=>{
 assert.equal(Object.keys(creationCommandRegistry).length,30);assert.ok(creationCommandRegistry['graphic.add']);
 for(const op of ['shape.add','vector.add','ink.add','draw.decorate','graphic.decorate']){assert.equal(creationCommandRegistry[op],undefined);assert.throws(()=>validateCreationV2Commands(tx([{op}])));assert.throws(()=>describeCreationCommand(op));}
 for(const prop of [{target:'title'},{placement:'top-right'},{kind:'star'},{color:'#123456'}])assert.throws(()=>validateCreationV2Commands(tx([{...graphic(),...prop}])));
 assert.throws(()=>validateCreationV2Commands(tx([graphic({kind:'shape',shape:'star'})])));
 assert.throws(()=>validateCreationV2Commands(tx([graphic({...path,kind:'vector'})]))); // Old geometry wrapper is not an alias.
});
test('current schema examples and shallow help teach shared geometry, not specialized decoration',()=>{
 const help=describeCreationCommand('graphic.add');assert.ok(JSON.stringify(help).length<6000);assert.equal(help.schema,undefined);
 const full=describeCreationCommand('graphic.add',{full:true}).schema;assert.equal(full.properties.geometry.$ref,'#/$defs/GraphicGeometry');
 const update=describeCreationCommand('layer.update',{full:true}).schema;assert.equal(update.properties.geometry.$ref,full.properties.geometry.$ref);
 for(const entry of Object.values(creationCommandRegistry))for(const example of entry.examples)assert.doesNotThrow(()=>validateCreationV2Commands(tx([example])),entry.name);
});
test('every existing preset remains available in the same create entry with no physical inventory',async()=>{
 const {run,assets}=await setup();const made=run(graphicPresetKinds.map((kind,i)=>graphic({kind},{id:'preset-'+i})));
 assert.equal(made.page.layers.length,graphicPresetKinds.length);for(const n of made.page.layers){assert.equal(n.type,'shape');assert.equal(n.stroke,'#445566');assert.ok(shapeSVG(n).includes('<svg'));}
 assert.equal(buildMaterialLedger(attachSceneV2(made.page),assets).units.length,0);
});
for(const geometry of [{kind:'star'},path,stroke])test(`creation and update share geometry size style for ${geometry.kind}`,async()=>{
 const {run}=await setup(),base=graphic(geometry,{size:{width:20,height:12,unit:'mm'}}),updated={size:{width:36,height:18,unit:'mm'},style:{stroke:'#B38652',strokeWidthMm:.8,opacity:.75}};
 const direct=run([{...base,...updated}]),staged=run([{op:'layer.update',target:'g',...updated}],run([base]));
 const a=node(direct),b=node(staged);for(const k of ['width','height','stroke','color','lineWidth','opacity'])assert.deepEqual(a[k],b[k],k);
 const x=worldBox(direct.page,'g'),y=worldBox(staged.page,'g');for(const k of ['cx','cy','w','h','rotation'])near(x[k],y[k]);
 if(geometry.kind==='stroke')assert.deepEqual(a.points.map(p=>p.p),b.points.map(p=>p.p));
});
test('stroke uses identical stroke color field; text color stays text-specific; invalid paint fails atomically',async()=>{
 const {run}=await setup(),made=run([graphic(stroke)]),before=JSON.stringify(made);
 assert.equal(node(made).color,'#445566');
 for(const style of [{color:'#123456'},{fill:'#123456'},{stroke:null},{strokeWidthMm:0}])assert.throws(()=>run([{op:'layer.update',target:'g',style}],made));
 assert.equal(JSON.stringify(made),before);assert.equal(node(run([{op:'layer.update',target:'g',style:{stroke:'#123456'}}],made)).color,'#123456');
});
test('reference sizes and positions use the same contract in rotated parents and remain stable',async()=>{
 const {run}=await setup();const made=run([{op:'group.compose',id:'card',layoutBox:{width:100,height:100,unit:'mm'},place:{...at,rotationDeg:27},children:[
  {op:'text.add',id:'title',content:'Title',size:{width:50,unit:'mm'},place:local},
  graphic({kind:'ellipse'},{size:{reference:'node:title',width:1.1,height:1.2,unit:'ratio'},place:{reference:'node:title',referenceAnchor:'center',rotationSpace:'reference',rotationDeg:0,behavior:'linked'},order:{after:'title'}})
 ]}]);
 const scale=made.page.canvas.height/made.page.physicalPageHeightMM;near(worldBox(made.page,'g').w,55*scale);near(worldBox(made.page,'g').rotation,27);
 const moved=run([{op:'layer.update',target:'title',place:{reference:'parent',at:[.7,.6],unit:'ratio'}}],made);assert.notEqual(worldBox(made.page,'g').cx,worldBox(moved.page,'g').cx);
 const snapshot=JSON.stringify(moved.page);for(let i=0;i<20;i++)solveSceneLayout(moved.page);assert.equal(JSON.stringify(moved.page),snapshot);
});
test('same star can form the main visual or a small accent solely via size and place',async()=>{
 const {run}=await setup();const d=run([graphic({kind:'star'},{id:'main',size:{width:65,unit:'mm'},style:{fill:'#E8CC88'}}),graphic({kind:'star'},{id:'small',size:{width:6,unit:'mm'},place:{reference:'node:main',referenceAnchor:'top-right',offset:{value:[3,0],unit:'mm'}}})]);
 near(worldBox(d.page,'main').w/worldBox(d.page,'small').w,65/6);assert.equal(node(d,'main').kind,node(d,'small').kind);
});
test('relative ink highlight is ordinary geometry, explicit order and style, without target side effects',async()=>{
 const {run}=await setup();const d=run([{op:'text.add',id:'title',content:'GO',size:{width:45,unit:'mm'},place:at},graphic({kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:1,y:0}]},{size:{width:.9,reference:'node:title',unit:'ratio'},place:{reference:'node:title',at:[.5,.4],unit:'ratio',rotationSpace:'reference',rotationDeg:0,behavior:'linked'},style:{stroke:'#E8CC88',strokeWidthMm:4,penStyle:'marker',opacity:.45,blendMode:'multiply'},order:{before:'title'}})]);
 near(worldBox(d.page,'g').w,worldBox(d.page,'title').w*.9);assert.equal(d.page.layers[0].id,'g');assert.equal(node(d).penStyle,'marker');
 // It is not a keyword recognizer: multiple lines or non-text references are
 // permitted as ordinary geometric references, never fabricated text semantics.
 const changed=run([{op:'layer.update',target:'title',content:'First\nSecond'}],d);assert.equal(node(changed).type,'ink');
});
test('stroke intrinsic pressure and zero-span dimensions survive resizing without scaling nib width',async()=>{
 const {run}=await setup();const d=run([graphic({kind:'stroke',unit:'mm',points:[{x:0,y:0,pressure:.2},{x:1,y:0,pressure:.8}]},{size:{width:45,unit:'mm'},style:{stroke:'#334455',strokeWidthMm:4,penStyle:'pressure'}})]),s=d.page.canvas.height/d.page.physicalPageHeightMM;
 near(worldBox(d.page,'g').w,45*s);near(node(d).width,4*s);assert.deepEqual(node(d).points.map(p=>p.p),[.2,.8]);
 const before=JSON.stringify(d);assert.throws(()=>run([{op:'layer.update',target:'g',size:{height:9,unit:'mm'}}],d),/零跨度/);assert.equal(JSON.stringify(d),before);
});
test('shape/path replacement clears stale alternate geometry but preserves identity and parent',async()=>{
 const {run}=await setup();const d=run([graphic(path)]);const changed=run([{op:'layer.update',target:'g',geometry:{kind:'star'},style:{fill:'#AABBCC'}}],d);
 assert.equal(node(changed).kind,'star');assert.equal(node(changed).svgPaths,undefined);assert.equal(node(changed).svgViewBox,undefined);assert.equal(node(changed).id,'g');
 const again=run([{op:'layer.update',target:'g',geometry:path}],changed);assert.equal(node(again).svgPaths[0].d,path.paths[0].d);assert.equal(node(again).kind,'vector');
 assert.throws(()=>run([{op:'layer.update',target:'g',geometry:stroke}],d),/隐式转换/);
});
test('null fill and local null override mean no paint for paths, not an unrequested default solid',async()=>{
 const {run}=await setup();const d=run([graphic({...path,paths:[{d:'M0 0 L20 0 L10 10 Z',style:{fill:null,stroke:null}}]},{style:{fill:'#AABBCC',stroke:'#223344'}})]);
 const svg=shapeSVG(node(d));assert.match(svg,/fill="none"/);assert.match(svg,/stroke="none"/);
});
test('locked objects, policies and duplicate IDs still reject shared-geometry updates atomically',async()=>{
 const {run}=await setup();const d=run([graphic({kind:'star'})]);
 applySceneNodeChange(d.page,'g',{locked:true},{policy:USER_SCENE_POLICY});const before=JSON.stringify(d);
 assert.throws(()=>run([{op:'layer.update',target:'g',geometry:{kind:'ellipse'}}],d),/锁定/);assert.throws(()=>run([graphic()],d));assert.equal(JSON.stringify(d),before);
});
test('manual updates and AI geometry updates use the same shape kernel and remain editable in Fabric',async()=>{
 const {run,assets}=await setup();const initial=run([graphic({kind:'star'})]),change={geometry:path,size:{width:30,height:20,unit:'mm'},style:{fill:null,stroke:'#774433',strokeWidthMm:.7}};
 const fromAI=run([{op:'layer.update',target:'g',...change}],initial),fromUser=structuredClone(initial.page);applySceneNodeChange(fromUser,'g',change,{policy:USER_SCENE_POLICY});
 const a=structuredClone(node(fromAI)),b=fromUser.layers[0];delete a.aiManaged;delete b.aiManaged;assert.deepEqual(a,b);
 const canvas=await renderSceneCanvas(fromAI.page,{createCanvas:()=>createCanvas(1,1),loadMaterialImage:async()=>null,loadShapeImage:(source,shape)=>loadImage(Buffer.from(decodeURIComponent(source.split(",")[1]).replace("<svg ",`<svg width="${Math.max(1,Math.round(shape.width))}" height="${Math.max(1,Math.round(shape.height))}" `))),waitForFonts:false});assert.ok(canvas.canvas.toBuffer('image/png').length>100);
 const bridge=createFabricSceneBridge(fabric),object=await bridge.fromNode(node(fromAI));assert.equal(object.sceneID,'g');assert.equal(object.sceneType,'shape');
 const reopened=importEditableWork(JSON.stringify(fromAI),assets).drafts[0];assert.equal(findSceneNode(reopened,'g').svgPaths[0].d,path.paths[0].d);
});

test('repeated stroke size and geometry updates do not accumulate frame roundoff',async()=>{
 const {run}=await setup();let d=run([graphic(stroke,{place:{...at,rotationDeg:31},size:{width:40,height:12,unit:'mm'}})]);
 d=run([{op:'layer.update',target:'g',size:{width:40,height:12,unit:'mm'}}],d);
 const before=JSON.stringify(d);for(let i=0;i<20;i++)d=run([{op:'layer.update',target:'g',size:{width:40,height:12,unit:'mm'}}],d);assert.equal(JSON.stringify(d),before);
});
test('published graphic guide examples all validate and keep decoration in design guidance, not schema',async()=>{
 const {readFile}=await import('node:fs/promises');
 const guide=await readFile(new URL('../creation-contract/release-v3/design/GRAPHICS.md',import.meta.url),'utf8');
 for(const match of guide.matchAll(/```json\n([\s\S]*?)\n```/g))validateCreationV2Commands(tx([JSON.parse(match[1])]));
 assert.ok(guide.includes('点缀阶段是设计判断阶段'));
 const {task}=await setup();const {unzipSync,strFromU8}=await import('fflate');const files=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
 assert.equal(strFromU8(files['design/GRAPHICS.md']),guide);
 for(const path of ['START_HERE.md','design/SKILL.md','design/PLAYBOOK.md','design/LETTERING.md','design/RECIPES.md'])assert.doesNotMatch(strFromU8(files[path]),/draw\.decorate|shape\.add|vector\.add|ink\.add/);
});
