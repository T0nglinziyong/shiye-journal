import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {sceneLayerEntries,groupSceneLayers,moveSceneNode} from '../src/scene-model.js';
import {moveSelection} from '../src/canvas-selection.js';
const shape=(id,z)=>({id,kind:'rectangle',x:50,y:80,width:20,height:30,zIndex:z});

test('moving an object changes geometry but never raises its stacking order',()=>{
 const scene=draft();
 for(const [id,z] of [['background',1],['middle',2],['foreground',3]])scene.primitives.push(shape(id,z));
 const initial=sceneLayerEntries(scene).map(e=>e.value.id);
 const subject=scene.primitives.find(node=>node.id==='middle');
 moveSelection(scene,new Map([['middle',{x:subject.x,y:subject.y}]]),10,20);
 assert.deepEqual(sceneLayerEntries(scene).map(e=>e.value.id),initial);
 assert.deepEqual({x:subject.x,y:subject.y},{x:60,y:100});
 assert.equal(subject.zIndex,2);
});

test('reorder operations change only siblings within a compositing group',()=>{
 const scene=draft();for(const [id,z] of [['a',1],['b',2],['c',3],['outside',4]])scene.primitives.push(shape(id,z));
 groupSceneLayers(scene,['a','b','c'],{id:'group'});
 const group=scene.layers.find(node=>node.id==='group');
 const source=scene.primitives.find(p=>p.id==='a');
 const {x,y,width,height}=source;
 moveSceneNode(scene,'a',{parentID:'group',beforeID:null});
 assert.deepEqual(group.children.map(node=>node.id),['b','c','a']);
 assert.equal(scene.layers.find(node=>node.id==='outside')?.id,'outside');
 assert.deepEqual({x:source.x,y:source.y,width:source.width,height:source.height},{x,y,width,height});
});
