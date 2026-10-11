import test from 'node:test';import assert from 'node:assert/strict';
import {attachSceneV2,sceneLayerEntries,groupSceneLayers,ungroupSceneLayers,transformSceneGroup,canonicalScene,validateSceneExtensions,sceneGroups} from '../src/scene-model.js';
import {draft} from '../src/domain.js';

test('Scene v2 stores only layers, including arbitrary ink stacking',()=>{
 const d=draft();
 d.items.push({id:'m',assetID:'m1',x:100,y:100,width:30,height:50,zIndex:20});
 d.textBlocks.push({id:'t',content:'文本',x:200,y:100,width:50,height:20,zIndex:12});
 d.strokes.push({id:'ink',points:[{x:10,y:10,p:.5}],width:2,color:'#335544',zIndex:15});
 assert.deepEqual(sceneLayerEntries(d).map(x=>x.kind),['text','ink','material']);
 const raw=JSON.parse(JSON.stringify(d));
 assert.deepEqual(Object.keys(raw).filter(k=>['items','textBlocks','primitives','strokes'].includes(k)),[]);
 assert.equal(raw.layers.length,3);
 assert.equal(canonicalScene(d).version,2);
 assert.equal(validateSceneExtensions(d),true);
});
test('nested groups survive JSON serialization; rotating groups never scales physical pieces',()=>{
 const d=draft();
 d.items.push({id:'m',assetID:'m1',x:100,y:100,width:30,height:50,zIndex:20});
 d.textBlocks.push({id:'t',content:'文本',x:200,y:100,width:50,height:20,zIndex:12});
 const initial={width:d.items[0].width,height:d.items[0].height};
 const g=groupSceneLayers(d,['m','t'],{id:'g',name:'贴纸组合'});
 assert.equal(d.layers.some(n=>n.type==='group'),true);
 transformSceneGroup(d,g,{rotation:45,dx:10});
 assert.equal(d.items[0].width,initial.width);assert.equal(d.items[0].height,initial.height);
 assert.equal(d.textBlocks[0].rotation,45);
 assert.equal(sceneGroups(d).length,1);
 const saved=JSON.parse(JSON.stringify(d)),loaded=attachSceneV2(saved);
 assert.equal(sceneGroups(loaded)[0].children.length,2);
 assert.equal(ungroupSceneLayers(loaded,g),true);
 assert.equal(sceneGroups(loaded).length,0);
 assert.throws(()=>groupSceneLayers(loaded,['m','m']),/不同图层/);
});
test('scene v2 imports old draft arrays into one tree rather than persisting two copies',()=>{
 const legacy={id:'old',canvas:{width:700,height:1000},items:[{id:'m',assetID:'m1',x:1,y:2,width:3,height:4}],primitives:[],textBlocks:[],strokes:[]};
 attachSceneV2(legacy);
 assert.equal(legacy.sceneVersion,2);assert.equal(legacy.layers.length,1);
 assert.equal(JSON.stringify(legacy).includes('"items"'),false);
});
