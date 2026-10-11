import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneLayerEntries,groupSceneLayers,ungroupSceneLayers,validateVectorMask,maskSVG,sceneLayerStyle,canonicalScene,validateSceneExtensions} from '../src/scene-model.js';

const draft=()=>({id:'draft-test',canvas:{width:707,height:1000},pageMode:'single',pageRatio:'a4',physicalPageHeightMM:297,
  paperColor:'#fcfaf0',paperPattern:'plain',sceneVersion:1,layerGroups:[],
  items:[{id:'m',assetID:'flower',x:100,y:100,width:50,height:35,zIndex:20,materialUnitIndex:0}],
  primitives:[{id:'s',kind:'ellipse',x:200,y:100,width:60,height:40,zIndex:5}],
  textBlocks:[{id:'t',x:300,y:100,width:100,height:30,zIndex:12,content:'手帐'}],
  strokes:[{points:[{x:1,y:1,p:.5}],width:2,color:'#30463d',penStyle:'ballpoint'}]});
test('one Draft is the canonical Scene, with typed sorted layer views',()=>{
 const d=draft(),before=JSON.stringify(d);
 const entries=sceneLayerEntries(d);
 assert.deepEqual(entries.map(e=>e.kind),['shape','text','material','ink']);
 const scene=canonicalScene(d);
 assert.equal(scene.format,'shiye-scene');
 assert.equal(scene.version,1);
 assert.deepEqual(scene.scene,d);
 assert.equal(JSON.stringify(d),before,'projection must not mutate saved Draft');
});
test('physical edit groups preserve original geometry and quantity',()=>{
 const d=draft(),before=structuredClone(d.items[0]);
 const id=groupSceneLayers(d,['m','t'],{id:'group-one',name:'春日组合'});
 assert.equal(id,'group-one');
 assert.equal(d.layerGroups[0].kind,'physical-arrangement');
 assert.equal(d.items.length,1);
 assert.deepEqual({...d.items[0],creativeGroupID:undefined},{...before,creativeGroupID:undefined});
 assert.equal(d.textBlocks[0].creativeGroupID,id);
 assert.equal(validateSceneExtensions(d),true);
 assert.equal(ungroupSceneLayers(d,id),true);
 assert.equal(d.textBlocks[0].creativeGroupID,undefined);
 assert.equal(d.layerGroups.length,0);
 assert.throws(()=>groupSceneLayers(d,['m','m'],{id:'g'}),/不同图层/);
});
test('vector mask is non-destructive, bounded and safe for Canvas/SVG',()=>{
 const mask={outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[.2,.2],[.4,.2],[.4,.4],[.2,.4]]]};
 validateVectorMask(mask);
 assert.match(maskSVG(mask),/fill-rule="evenodd"/);
 const d=draft();d.items[0].vectorMask=mask;d.items[0].blendMode='multiply';
 assert.deepEqual(sceneLayerStyle(d.items[0]),{blendMode:'multiply',mask});
 assert.equal(validateSceneExtensions(d),true);
 assert.throws(()=>validateVectorMask({outer:[[0,0],[2,0],[1,1]]}),/坐标无效/);
 assert.throws(()=>sceneLayerStyle({...d.items[0],blendMode:'color-dodge'}),/不支持/);
 assert.equal(d.items[0].width,50,'clip is not a material scale transform');
});
test('historical ink without id remains valid, new duplicate leaf IDs are rejected',()=>{
 const d=draft();assert.equal(validateSceneExtensions(d),true);
 d.strokes.push({points:[{x:10,y:10}],width:2,color:'#000000'});
 assert.equal(validateSceneExtensions(d),true);
 d.textBlocks[0].id='m';assert.throws(()=>validateSceneExtensions(d),/重复/);
});
