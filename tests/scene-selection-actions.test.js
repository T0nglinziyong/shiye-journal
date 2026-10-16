import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionGroupID,duplicateSceneGroup,deleteSceneGroup} from '../src/scene-selection-actions.js';
import {groupSceneLayers,ungroupSceneLayers,findSceneNode,validateSceneExtensions} from '../src/scene-v2.js';

const fixture=()=>({sceneVersion:2,canvas:{width:500,height:500},layers:[
  {id:'shape-a',type:'shape',kind:'rectangle',x:80,y:90,width:40,height:30,zIndex:1},
  {id:'shape-b',type:'shape',kind:'rectangle',x:160,y:90,width:40,height:30,zIndex:2},
  {id:'shape-c',type:'shape',kind:'rectangle',x:250,y:90,width:40,height:30,zIndex:3}
]});

test('one group and a complete lasso selection toggle between group and members',()=>{
  const draft=fixture();
  assert.equal(selectionGroupID(draft,['shape-a','shape-b']),null);
  groupSceneLayers(draft,['shape-a','shape-b'],{id:'group'});
  assert.equal(selectionGroupID(draft,['group']),'group');
  assert.equal(selectionGroupID(draft,['shape-a','shape-b']),'group');
  assert.equal(selectionGroupID(draft,['shape-a']),null);
  ungroupSceneLayers(draft,'group');
  assert.equal(selectionGroupID(draft,['shape-a','shape-b']),null);
});

test('duplicate and delete act on the whole nested Scene subtree',()=>{
  const draft=fixture();
  groupSceneLayers(draft,['shape-a','shape-b'],{id:'group'});
  let sequence=0;
  const copyID=duplicateSceneGroup(draft,'group',()=>`copy-${++sequence}`);
  const original=findSceneNode(draft,'group'),copy=findSceneNode(draft,copyID);
  assert.deepEqual(copy.children.map(child=>child.x),original.children.map(child=>child.x+12));
  assert.ok(copy.children.every(child=>child.creativeGroupID===copyID));
  assert.equal(new Set([copyID,...copy.children.map(child=>child.id)]).size,3);
  assert.equal(validateSceneExtensions(draft),true);
  deleteSceneGroup(draft,copyID);
  assert.equal(findSceneNode(draft,copyID),null);
  assert.ok(findSceneNode(draft,'group'));
});

test('copying a group with material makes a visual copy, not another physical source',()=>{
  const draft=fixture();
  draft.layers[0]={id:'material',type:'material',assetID:'sheet',x:80,y:90,width:40,height:30,zIndex:1};
  groupSceneLayers(draft,['material','shape-b'],{id:'group'});
  let sequence=0;
  const copy=duplicateSceneGroup(draft,'group',()=>`copy-${++sequence}`);
  const item=findSceneNode(draft,copy).children.find(child=>child.type==='material');
  assert.equal(item.manualVisualCopy,true);
  assert.equal(item.assetID,'sheet');
  assert.equal(item.materialUnitIndex??0,0);
});
