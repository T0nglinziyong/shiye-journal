import test from 'node:test';
import assert from 'node:assert/strict';
import {project,primitive,textBlock} from '../src/domain.js';
import {validateScenePhysical} from '../src/creative.js';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {planSceneCut,rejoinMaterialPieces} from '../src/scene-cut-ops.js';

const asset={id:'cut-source',kind:'paper',title:'裁切源',physicalWidthMM:100,
  physicalHeightMM:80,supply:{kind:'single',quantity:1}};
const width=100*1000/297,height=80*1000/297;
const source={id:'piece',type:'material',assetID:'cut-source',x:200,y:200,width,height,
  rotation:0,zIndex:3,materialUnitIndex:0,isParked:false,materialMask:null,cropRect:null,
  generationBaseline:{x:200,y:200,width,height,rotation:0,zIndex:3,
    cropRect:null,materialMask:null,materialSteps:[]}};
function scene(){const d=project('剪切').drafts[0];d.layers.push(structuredClone(source));return d;}
let seq=0;const uid=()=>`cut-${++seq}`;
const split={operation:'split',scope:'object',selectedID:'piece',pathType:'line',
  points:[[-10,200],[410,200]]};

test('free line cut conserves one physical source and keeps offcuts recoverable',()=>{
  const original=scene(),before=structuredClone(original);
  const preview=planSceneCut(original,split,[asset],{uid});
  assert.equal(preview.pieces.length,2);
  assert.deepEqual(original,before,'Preview cannot mutate the saved Scene');
  const committed=planSceneCut(original,{...split,keepKeys:[preview.pieces[0].key]},[asset],{uid});
  assert.equal(committed.draft.items.filter(i=>i.isParked).length,1);
  assert.equal(committed.draft.items.filter(i=>!i.isParked).length,1);
  assert.equal(validateScenePhysical(committed.draft,[asset]),true);
  assert.ok(Math.abs(buildMaterialLedger(committed.draft,[asset]).units[0].usedAreaMM2-8000)<1e-5);
  const joined=rejoinMaterialPieces(committed.draft,committed.draft.items.map(i=>i.id),[asset],{uid});
  assert.equal(joined.draft.items.length,1);
  assert.equal(validateScenePhysical(joined.draft,[asset]),true);
});

test('mask changes visibility without allocating another material source',()=>{
  const draft=scene(),result=planSceneCut(draft,{operation:'mask',scope:'object',
    selectedID:'piece',preset:'window',inset:.2,hideRegion:true},[asset],{uid});
  assert.equal(result.draft.items.length,1);
  assert.equal(result.draft.items[0].vectorMask.holes.length,1);
  assert.equal(validateScenePhysical(result.draft,[asset]),true);
  assert.ok(Math.abs(buildMaterialLedger(result.draft,[asset]).units[0].usedAreaMM2-8000)<1e-5);
});

test('curved and inset presets keep complementary physical pieces valid',()=>{
  for(const preset of ['window','ellipse','edge','ring']){
    const result=planSceneCut(scene(),{operation:'split',scope:'object',selectedID:'piece',
      preset,inset:.18},[asset],{uid});
    assert.equal(result.draft.items.length,2,preset);
    assert.equal(validateScenePhysical(result.draft,[asset]),true,preset);
  }
});

test('all-layer cut skips locked and hidden nodes and invalid cut stays atomic',()=>{
  const draft=scene();draft.layers.push({...structuredClone(source),id:'locked',assetID:'other',locked:true});
  draft.layers.push({...structuredClone(source),id:'hidden',assetID:'other',hidden:true});
  const original=structuredClone(draft);
  const result=planSceneCut(draft,{...split,scope:'all'},[asset],{uid});
  assert.equal(result.affected.length,1);
  assert.deepEqual(draft,original);
  assert.throws(()=>planSceneCut(draft,{...split,points:[[180,180],[190,190]]},[asset],{uid}));
  assert.deepEqual(draft,original);
});

test('shape and text split into independent visible regions; ink cuts at intersections',()=>{
  const draft=project('图形').drafts[0],shape={...primitive('rectangle',draft),id:'shape',type:'shape',
    x:200,y:200,width:160,height:100},text={...textBlock('剪切',draft),id:'text',type:'text',
    x:450,y:200,width:140,height:80},ink={id:'ink',type:'ink',
    points:[{x:100,y:200,p:.5},{x:600,y:200,p:.5}],width:3,color:'#285d46',zIndex:1000};
  draft.layers.push(shape,text,ink);
  const result=planSceneCut(draft,{operation:'split',scope:'all',pathType:'line',
    points:[[350,50],[350,350]]},[],{uid});
  assert.equal(result.affected.length,1,'Only painted layers crossed by the path split');
  assert.equal(result.draft.strokes.length,2);
  assert.equal(validateScenePhysical(result.draft,[]),true);
  const vector=planSceneCut(draft,{operation:'split',scope:'object',selectedID:'shape',
    preset:'ellipse',inset:.2},[],{uid});
  assert.equal(vector.draft.primitives.length,2);
  assert.ok(vector.draft.primitives.every(part=>part.vectorMask));
  assert.equal(validateScenePhysical(vector.draft,[]),true);
  const textMask=planSceneCut(draft,{operation:'mask',scope:'object',selectedID:'text',
    preset:'window',inset:.2,hideRegion:true},[],{uid});
  assert.equal(textMask.draft.textBlocks.length,1);
  assert.ok(textMask.draft.textBlocks[0].vectorMask?.holes?.length);
  assert.equal(validateScenePhysical(textMask.draft,[]),true);
});
