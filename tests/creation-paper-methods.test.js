import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {compileTechnique,describeTechnique,techniqueCatalog} from '../creative-agent/library/techniques.js';
import {exampleMaterials,techniqueExample} from '../creative-agent/library/examples.js';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {materialMaskGeometry} from '../src/material-mask.js';
import {paperCardPath} from '../creative-agent/library/paper-card.js';

const make=()=>createCreationDocument({draft:draft({ratio:'a5'}),assets:exampleMaterials,aliases:Object.fromEntries(exampleMaterials.map(a=>[a.alias,a.id]))});
let transaction=0;
const run=(doc,operations)=>applyCreationTransaction(doc,{protocolVersion:2,transactionId:'craft-method-'+(++transaction),baseSceneRevision:creationSceneRevision(doc),operations},exampleMaterials).document;
const node=(doc,id)=>doc.page.layers.find(n=>(n.creativePieceID||n.id)===id);
const example=id=>techniqueExample(techniqueCatalog.methods.find(m=>m.id===id));
async function render(doc){
 const {canvas}=await renderSceneCanvas(doc.page,{scale:1,createCanvas:()=>createCanvas(1,1),loadMaterialImage:async id=>{
  const c=createCanvas(100,100),ctx=c.getContext('2d');ctx.fillStyle=id==='example-strip'?'#C66236':'#96BAB6';ctx.fillRect(0,0,100,100);return c;
 }});return canvas;
}
function paperLedger(doc){const units=buildMaterialLedger(doc.page,exampleMaterials).units.filter(u=>u.assetId==='example-paper');assert.equal(units.length,1);assert.ok(Math.abs(units[0].usedAreaMM2-42*32)<1e-5);assert.ok(units[0].remainingAreaMM2<1e-5);return units[0];}

test('editable colour paper keeps punched holes and torn edges in one vector',async()=>{
 const options={widthMm:70,heightMm:92,tearSides:['right','bottom'],roughnessMm:.8,holeSide:'left',holeCount:3,holeRadiusMm:1.3,seed:43};
 const geometry=paperCardPath(options);
 assert.equal(geometry.paths[0].fillRule,'evenodd');
 assert.equal((geometry.paths[0].d.match(/ M/g)||[]).length,3,'outer path plus three independent holes');
 assert.deepEqual(paperCardPath(options),geometry,'identical parameters must reproduce the same torn contour');
 assert.throws(()=>compileTechnique({methodId:'paper-color-card',parameters:{id:'missing-position',colors:['#8195B4'],...options}}),/缺少参数：at/);
 const recipe=compileTechnique({methodId:'paper-color-card',parameters:{id:'colour-paper',at:[74,105],colors:['#8195B4'],...options}});
 assert.equal(recipe.operations[0].op,'group.compose');
 assert.equal(recipe.operations[0].children[0].geometry.paths[0].fillRule,'evenodd');
 const doc=run(await make(),recipe.operations);
 assert.ok(node(doc,'colour-paper'));
 assert.throws(()=>paperCardPath({...options,holeCount:12,holeRadiusMm:5}),/间距不足/);
});

test('window core is visible, moved with cropped physical dimensions and conserved without a second source',async()=>{
 const detail=describeTechnique('paper-window',{variant:'reuse-core'}),e={before:detail.example.prepare,parameters:detail.tool.arguments.parameters},c=compileTechnique({methodId:'paper-window',parameters:e.parameters});
 const doc=run(await make(),[...e.before,...c.operations]),core=node(doc,c.report.retainedNode),frame=node(doc,c.report.output);
 assert.equal(core.hidden,false);assert.equal(frame.craftWindowIDs.length,1);assert.ok(Math.abs(core.width/frame.width-.6)<1e-6);assert.ok(core.x>frame.x+frame.width/2);
 assert.equal(paperLedger(doc).allocations.length,2);
 const canvas=await render(doc),ctx=canvas.getContext('2d'),pixel=(x,y)=>[...ctx.getImageData(Math.round(x),Math.round(y),1,1).data];
 assert.notDeepEqual(pixel(core.x,core.y),pixel(frame.x,frame.y),'core is colored, while the frame center is a real hole');
 assert.equal(describeTechnique('paper-window',{variant:'reuse-core'}).parameters.corePlace.required,true);
 assert.throws(()=>compileTechnique({methodId:'paper-window',parameters:{id:'x',variant:'reuse-core',target:'p',box:[.2,.2,.6,.6]}}),/corePlace/);
});

test('named holes survive reverse cutting order and drive identical physical weaving',async()=>{
 const base=await make(),e=example('paper-weave');
 const build=parameters=>{const c=compileTechnique({methodId:'paper-weave',parameters});return {c,doc:run(base,[...e.before,...c.operations])};};
 const forward=build(e.parameters),reverse=build({...e.parameters,through:[...e.parameters.through].reverse()});
 const frame=node(reverse.doc,reverse.c.report.frames.frame),holes=materialMaskGeometry(frame.materialMask).holes;
 const left=holes.findIndex(r=>Math.max(...r.map(p=>p[0]))<.5);
 assert.equal(frame.craftWindowIDs[left],'demo-window1','left hole was created second and must keep that identity');
 assert.deepEqual((await render(forward.doc)).toBuffer('image/png'),(await render(reverse.doc)).toBuffer('image/png'));
 assert.equal(paperLedger(reverse.doc).allocations.length,3);
 for(const id of reverse.c.report.retainedNodes)assert.equal(node(reverse.doc,id).hidden,true);
 const opposite=build({...e.parameters,through:e.parameters.through.map(h=>({...h,sideAfter:h.sideAfter==='front'?'back':'front'}))});
 assert.notDeepEqual((await render(opposite.doc)).toBuffer('image/png'),(await render(forward.doc)).toBuffer('image/png'));
 const strip=node(reverse.doc,'strip');assert.ok(Math.abs(strip.width/strip.height-15)<1e-6);
});

for(const keep of [false,true])test('adding a left hole preserves an existing right hole ID, with core retention '+keep,async()=>{
 const base=await make(),e=example('paper-weave'),ops=[...e.before];
 let target='frame';
 for(const [i,box] of [[.72,.2,.1,.6],[.18,.2,.1,.6]].entries()){
  const next='frame-'+i;
  ops.push({op:'material.window',target,windowId:i?'left':'right',region:{shape:'rect',space:'local',unit:'ratio',box},...(keep?{resultId:next,cutoutId:'core-'+i,keepRemainder:true}:{})});if(keep)target=next;
 }
 const doc=run(base,ops),frame=node(doc,target),holes=materialMaskGeometry(frame.materialMask).holes;
 holes.forEach((ring,i)=>assert.equal(frame.craftWindowIDs[i],Math.max(...ring.map(p=>p[0]))<.5?'left':'right'));
});

test('existing named holes and newly retained cores can participate in the same recipe',async()=>{
 const base=await make(),e=example('paper-weave');
 const prepared=run(base,[...e.before,{op:'material.window',target:'frame',windowId:'right',region:e.parameters.through[1].region}]);
 const through=[e.parameters.through[0],{target:'frame',window:'right',sideAfter:'back'}];
 const c=compileTechnique({methodId:'paper-weave',parameters:{id:'mix',strip:'strip',through}}),doc=run(prepared,c.operations);
 assert.equal(c.report.retainedNodes.length,1);assert.ok(node(doc,'strip').craftDisplaySlices.length);
 assert.ok(node(doc,c.report.frames.frame).craftWindowIDs.includes('right'));
});

test('unusable apertures reject the whole recipe without consuming or moving materials',async()=>{
 const e=example('paper-weave'),base=run(await make(),e.before),saved=JSON.stringify(base);
 for(const through of [e.parameters.through.map(h=>({...h,region:{...h.region,box:[h.region.box[0],.47,.1,.06]}})),e.parameters.through.map(h=>({...h,region:{...h.region,box:[h.region.box[0],.05,.1,.2]}}))]){
  const c=compileTechnique({methodId:'paper-weave',parameters:{id:'bad',strip:'strip',through}});
  assert.throws(()=>run(base,c.operations));assert.equal(JSON.stringify(base),saved);
 }
 const joined=compileTechnique({methodId:'paper-weave',parameters:{id:'bad',strip:'strip',through:e.parameters.through.map(h=>({...h,region:{...h.region,box:[.18,.2,.64,.6]}}))}});
 assert.throws(()=>run(base,joined.operations));assert.equal(JSON.stringify(base),saved);
});
