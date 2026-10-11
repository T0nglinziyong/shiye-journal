import test from 'node:test';
import assert from 'node:assert/strict';
import {inkScenePaths} from '../src/ink-scene-svg.js';
import {draft} from '../src/domain.js';
import {sceneLayerEntries,moveSceneNode,groupSceneLayers,validateSceneExtensions} from '../src/scene-model.js';

test('pressure-aware ink stays editable in a complete v2 serialized scene',()=>{
 const d=draft();
 d.primitives.push({id:'shape',kind:'rectangle',x:30,y:40,width:50,height:60,zIndex:1});
 d.strokes.push({id:'ink',points:[{x:1,y:2,p:.2},{x:10,y:20,p:.9},{x:21,y:31,p:.6}],
   width:4,color:'#445566',penStyle:'brush',zIndex:2});
 const html=inkScenePaths(d.strokes[0]);
 assert.equal((html.match(/<path/g)||[]).length,2);
 assert.match(html,/stroke-width="/);
 assert.deepEqual(sceneLayerEntries(d).map(e=>e.kind),['shape','ink']);
 assert.ok(JSON.stringify(d).includes('"type":"ink"'));
 assert.equal(JSON.stringify(d).includes('"strokes"'),false);
});

test('ink and real material may be physically reordered and regrouped without duplicate stock',()=>{
 const d=draft();
 d.items.push({id:'paper',assetID:'paper-real',x:100,y:200,width:100,height:200,zIndex:2});
 d.strokes.push({id:'ink',points:[{x:11,y:22,p:.8}],width:2,color:'#445566',zIndex:4});
 const before={width:d.items[0].width,height:d.items[0].height,assetID:d.items[0].assetID};
 const group=groupSceneLayers(d,['paper','ink'],{id:'handwritten-note'});
 moveSceneNode(d,'ink',{parentID:null});
 assert.equal(d.strokes.length,1);
 assert.equal(d.layers.some(n=>n.type==='ink'),true);
 assert.equal(d.items[0].creativeGroupID,group);
 assert.deepEqual({width:d.items[0].width,height:d.items[0].height,assetID:d.items[0].assetID},before);
 assert.equal(validateSceneExtensions(d),true);
});
test('invalid ink geometry cannot be smuggled through the persisted scene',()=>{
 const d=draft();
 d.strokes.push({id:'ink',points:[{x:Infinity,y:1}],width:2,color:'#334455'});
 assert.throws(()=>validateSceneExtensions(d),/笔迹路径/);
});
