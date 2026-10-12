import test from 'node:test';import assert from 'node:assert/strict';
import {attachSceneV2,sceneLayerEntries,groupSceneLayers,ungroupSceneLayers,transformSceneGroup,canonicalScene,validateSceneExtensions,sceneGroups,sceneGroupMembers,moveSceneNode,validateVectorMask} from '../src/scene-model.js';
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

test('Scene v2 can nest/reparent groups without changing physical dimensions',()=>{
 const d=draft();d.items.push({id:'m1',assetID:'a1',x:100,y:100,width:25,height:35,zIndex:3});
 d.textBlocks.push({id:'t1',content:'字',x:100,y:200,width:90,height:40,zIndex:5});
 d.primitives.push({id:'shape1',kind:'ellipse',x:80,y:160,width:40,height:40,zIndex:4});
 const top=groupSceneLayers(d,['m1','t1'],{id:'top'});
 const physical={width:d.items[0].width,height:d.items[0].height,assetID:d.items[0].assetID};
 moveSceneNode(d,'shape1',{parentID:top});
 assert.equal(d.layers[0].type,'group');
 assert.equal(sceneGroupMembers(d,top).length,3);
 assert.deepEqual({width:d.items[0].width,height:d.items[0].height,assetID:d.items[0].assetID},physical);
 assert.throws(()=>moveSceneNode(d,top,{parentID:top}),/不能把组/);
 assert.equal(validateSceneExtensions(d),true);
 assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(d)),'items'),false);
});

test('ungroup outer nesting retains inner group membership and raw source IDs',()=>{
 const d=draft();
 d.items.push({id:'m1',assetID:'real-1',x:10,y:20,width:40,height:60});
 d.items.push({id:'m2',assetID:'real-2',x:60,y:20,width:40,height:60});
 d.textBlocks.push({id:'t1',content:'秋日记录',x:50,y:80,width:100,height:40});
 groupSceneLayers(d,['m1','m2'],{id:'inner',name:'实体组'});
 moveSceneNode(d,'t1',{parentID:'inner'});
 groupSceneLayers(d,['m1','m2'],{id:'nested',name:'内组'});
 // Nested group membership is preserved when its ancestor is ungrouped.
 moveSceneNode(d,'nested',{parentID:'inner'});
 assert.equal(ungroupSceneLayers(d,'inner'),true);
 assert.equal(d.items.find(x=>x.id==='m1').creativeGroupID,'nested');
 assert.equal(sceneGroups(d).some(g=>g.id==='nested'),true);
 assert.deepEqual(d.items.map(x=>x.assetID).sort(),['real-1','real-2']);
});

test('physical vector masks reject crossed polygons, escaped holes and overlaps',()=>{
 const outer=[[0,0],[1,0],[1,1],[0,1]];
 const square=[[.2,.2],[.4,.2],[.4,.4],[.2,.4]];
 assert.doesNotThrow(()=>validateVectorMask({outer,holes:[square]}));
 assert.throws(()=>validateVectorMask({outer,holes:[[[.8,.8],[1.1,.8],[.95,.95]]]}),/坐标无效/);
 assert.throws(()=>validateVectorMask({outer:[[0,0],[1,1],[1,0],[0,1]]}),/交叉|轮廓/);
 assert.throws(()=>validateVectorMask({outer,holes:[square,[[.3,.3],[.6,.3],[.6,.6],[.3,.6]]]}),/交叉|孔洞/);
});

test('Scene v2 temporary collection view cannot lose indexed, length or deletion writes',()=>{
 const d=draft(),view=d.items;
 const item=id=>({id,assetID:id,x:100,y:100,width:30,height:30});
 view.push(item('first'),item('second'));
 assert.equal(view.length,2);
 view[0]={...view[0],x:150};
 assert.equal(d.layers.find(node=>node.id==='first').x,150);
 view.length=1;
 assert.deepEqual(d.layers.map(node=>node.id),['first']);
 view[1]=item('third');
 assert.deepEqual(view.map(node=>node.id),['first','third']);
 delete view[0];
 assert.deepEqual(d.items.map(node=>node.id),['third']);
 assert.throws(()=>{view[3]=item('invalid');},/稀疏索引/);
 assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(d)),'items'),false);
});

test('group identities must not collide with any leaf identity',()=>{
 const d=draft();
 d.primitives.push({id:'shape-a',kind:'rectangle',x:10,y:10,width:40,height:30});
 d.primitives.push({id:'shape-b',kind:'rectangle',x:70,y:10,width:40,height:30});
 const snapshot=JSON.stringify(d);
 assert.throws(()=>groupSceneLayers(d,['shape-a','shape-b'],{id:'shape-a'}),/编号无效或重复/);
 assert.equal(JSON.stringify(d),snapshot,'failed grouping must not damage canonical tree');
 assert.equal(validateSceneExtensions(d),true);
});
