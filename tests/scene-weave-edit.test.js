import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {applySceneWeave,weaveInspectorModel,inspectorWeaveCrossings} from '../src/scene-weave-edit.js';
import {attachSceneV2,findSceneNode} from '../src/scene-v2.js';
import {compileTwoHoleWeaves,projectMaterialViews} from '../src/craft-display.js';
import {USER_SCENE_POLICY,AI_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {beginSceneEditSession,commitSceneEditSession} from '../src/scene-edit-session.js';
import {rigidMatrix} from '../src/scene-spatial.js';

const fixture=()=>attachSceneV2({id:'weave',sceneVersion:2,canvas:{width:300,height:200},physicalPageHeightMM:200,pageRatio:'custom:300x200',pageMode:'single',paperColor:'#ffffff',layers:[
 {type:'material',id:'strip',creativePieceID:'strip',assetID:'s',x:150,y:100,width:160,height:8,rotation:0,zIndex:1,opacity:1},
 {type:'material',id:'frame',creativePieceID:'frame',assetID:'f',x:150,y:100,width:140,height:80,rotation:0,zIndex:10,materialMask:{shape:'compound',outer:null,holes:[{shape:'rectangle',box:[.1,.2,.15,.6]},{shape:'rectangle',box:[.75,.2,.15,.6]}]}}
]});
const assets=[{id:'s',physicalWidthMM:160,physicalHeightMM:8,quantity:1},{id:'f',physicalWidthMM:140,physicalHeightMM:80,quantity:1}];
const crossings=(page,front=true)=>{const model=weaveInspectorModel(page,'strip');return inspectorWeaveCrossings(model,model.openings.map(row=>row.key).reverse(),front);};
async function render(page){
 const image=id=>{const canvas=createCanvas(160,80),ctx=canvas.getContext('2d');ctx.fillStyle=id==='s'?'#c66236':'#a6c8b5';ctx.fillRect(0,0,160,80);return canvas;};
 const {canvas}=await renderSceneCanvas(page,{scale:1,createCanvas:()=>createCanvas(1,1),loadMaterialImage:async id=>image(id)});
 return canvas.toBuffer('image/png');
}
test('manual opening selection sorts geometrically and matches the existing physical weave projection',async()=>{
 const page=fixture(),direct=fixture(),before=structuredClone(page.layers);
 const through=crossings(page);assert.deepEqual(through.map(row=>row.hole),[0,1]);
 applySceneWeave(page,'strip',through,{policy:USER_SCENE_POLICY});compileTwoHoleWeaves(direct,[{piece:'strip',through}]);
 assert.deepEqual(page.layers,direct.layers);assert.deepEqual(await render(page),await render(direct));
 for(let i=0;i<2;i++)for(const field of ['x','y','width','height','cropRect','materialMask','assetID'])assert.deepEqual(page.layers[i][field],before[i][field]);
 const views=projectMaterialViews(page.layers[0]);assert.equal(views.length,3);
 const original=await render(page);applySceneWeave(page,'strip',crossings(page,false),{policy:USER_SCENE_POLICY});
 assert.notDeepEqual(await render(page),original,'reversing the route must visibly change front/back');
 const z=page.layers[0].zIndex;applySceneWeave(page,'strip',null,{policy:USER_SCENE_POLICY});assert.equal(page.layers[0].craftDisplaySlices,undefined);assert.equal(page.layers[0].zIndex,z);
});
test('too narrow openings, duplicates, missing targets and lock rejection are atomic',()=>{
 const page=fixture();page.layers[0].height=70;let saved=JSON.stringify(page);
 assert.throws(()=>applySceneWeave(page,'strip',crossings(page),{policy:USER_SCENE_POLICY}),/实际宽度/);assert.equal(JSON.stringify(page),saved);
 page.layers[0].height=8;page.layers[0].isLocked=true;saved=JSON.stringify(page);
 assert.throws(()=>applySceneWeave(page,'strip',null,{policy:USER_SCENE_POLICY}),/锁定/);assert.equal(JSON.stringify(page),saved);
 const model=weaveInspectorModel(page,'strip');assert.throws(()=>inspectorWeaveCrossings(model,[model.openings[0].key,model.openings[0].key]),/不同孔洞/);
 assert.throws(()=>inspectorWeaveCrossings(model,['missing','other']),/已变化/);
});
test('local groups share the world-space geometry and different sibling stacks are rejected',()=>{
 const page=fixture(),children=page.layers;children.forEach(node=>{node.x-=150;node.y-=100;});
 page.layers=[{id:'group',type:'group',layoutBox:{width:200,height:120},localTransform:rigidMatrix(150,100,25),children}];
 applySceneWeave(page,'strip',crossings(page),{policy:USER_SCENE_POLICY});assert.equal(findSceneNode(page,'strip').craftDisplaySlices.length,1);
 const frame=children.pop();page.layers.push(frame);const saved=JSON.stringify(page);
 assert.equal(weaveInspectorModel(page,'strip').openings.length,0);
 assert.throws(()=>applySceneWeave(page,'strip',[{target:'frame',hole:0,sideAfter:'front'},{target:'frame',hole:1,sideAfter:'back'}],{policy:USER_SCENE_POLICY}),/同一组合层级/);
 assert.equal(JSON.stringify(page),saved);
});
test('inspector staging, save and reopen preserve pixels; AI cannot overwrite a user edit',async()=>{
 const page=fixture();for(const node of page.layers)node.generationBaseline=structuredClone(node);
 const saved=JSON.stringify(page),session=beginSceneEditSession(page,{projectID:'p',saveRevision:0,selectedID:'strip'});
 applySceneWeave(session.working,'strip',crossings(session.working),{policy:USER_SCENE_POLICY});assert.equal(JSON.stringify(page),saved);
 const staged=await render(session.working);commitSceneEditSession(page,session,assets,{policy:USER_SCENE_POLICY});
 assert.deepEqual(await render(page),staged);assert.deepEqual(await render(attachSceneV2(JSON.parse(JSON.stringify(page)))),staged);
 page.layers[0].aiManaged=true;page.layers[0].generationBaseline='invalid';const snapshot=JSON.stringify(page);
 assert.throws(()=>applySceneWeave(page,'strip',null,{policy:AI_SCENE_POLICY}));assert.equal(JSON.stringify(page),snapshot);
});
