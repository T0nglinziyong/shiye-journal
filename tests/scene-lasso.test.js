import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSceneLasso,sceneLassoBounds,moveSceneLasso,rotateSceneLasso,copySceneLasso,deleteSceneLasso,mergeSceneLasso} from '../src/scene-lasso.js';
import {sceneLayerEntries} from '../src/scene-v2.js';

const fixture=()=>({sceneVersion:2,canvas:{width:500,height:500},layers:[
  {id:'left',type:'group',zIndex:1,children:[{id:'shape',type:'shape',x:80,y:80,width:20,height:20,zIndex:1}]},
  {id:'right',type:'group',zIndex:2,children:[{id:'text',type:'text',x:110,y:80,width:20,height:20,zIndex:1}]},
  {id:'ink-group',type:'group',zIndex:3,children:[{id:'ink',type:'ink',points:[{x:80,y:110},{x:110,y:110}],zIndex:1}]}
]});
const polygon=[{x:50,y:50},{x:140,y:50},{x:140,y:140},{x:50,y:140}];

test('Scene lasso selects leaves across subtrees and can lock handwriting',()=>{
  const draft=fixture();
  assert.deepEqual(selectSceneLasso(draft,polygon,{},'contain'),['shape','text','ink']);
  assert.deepEqual(selectSceneLasso(draft,polygon,{lockInk:true},'contain'),['shape','text']);
  assert.deepEqual(selectSceneLasso(draft,polygon,{material:false,shape:false,text:false},'contain'),['ink']);
});

test('lasso moves and copies selected leaves while preserving source',()=>{
  const draft=fixture();
  moveSceneLasso(draft,['shape','ink'],10,5);
  assert.equal(draft.layers[0].children[0].x,90);
  assert.deepEqual(draft.layers[2].children[0].points,[{x:90,y:115},{x:120,y:115}]);
  let next=0;const ids=copySceneLasso(draft,['shape','ink'],()=>`copy-${++next}`);
  assert.deepEqual(ids,['copy-1','copy-2']);
  assert.equal(draft.layers[0].children[1].x,102);
  assert.equal(draft.layers[2].children[1].points[0].x,102);
  deleteSceneLasso(draft,ids);
  assert.deepEqual(sceneLayerEntries(draft).map(entry=>entry.value.id),['shape','text','ink']);
});

test('lasso box rotates text, shape and ink together around one center',()=>{
  const draft=fixture(),bounds=sceneLassoBounds(draft,['shape','text','ink']);
  assert.deepEqual(bounds,{x:70,y:70,width:50,height:40});
  rotateSceneLasso(draft,['shape','text','ink'],{x:100,y:90},90);
  assert.equal(Math.round(draft.layers[0].children[0].x),110);
  assert.equal(Math.round(draft.layers[0].children[0].y),70);
  assert.equal(draft.layers[0].children[0].rotation,90);
  assert.deepEqual(draft.layers[2].children[0].points.map(p=>[Math.round(p.x),Math.round(p.y)]),
    [[80,70],[80,100]]);
});

test('merge moves selected leaves from different parent subtrees into one group',()=>{
  const draft=fixture();
  const id=mergeSceneLasso(draft,['shape','ink'],{id:'merged'});
  assert.equal(id,'merged');
  assert.deepEqual(draft.layers.at(-1).children.map(node=>node.id),['shape','ink']);
  assert.deepEqual(draft.layers.at(-1).children[1].points,[{x:80,y:110},{x:110,y:110}]);
  assert.equal(draft.layers.some(node=>node.id==='left'),false);
  assert.deepEqual(sceneLayerEntries(draft).map(entry=>entry.value.id),['text','shape','ink']);
});
