import test from 'node:test';
import assert from 'node:assert/strict';
import {shapePreview,shapeTag} from '../src/shape-preview.js';
test('editable compound vectors use one decoded preview while preserving geometry and colour updates',()=>{
  const shape={kind:'vector',width:100,height:100,vectorSize:[100,100],vectorLayers:[{fill:'#f08030',rects:[[0,0,100,100]]}]};
  const a=shapePreview(shape);shape.x=123;assert.equal(shapePreview(shape),a);
  shape.vectorLayers[0].fill='#3090a0';assert.notEqual(shapePreview(shape),a);assert.ok(decodeURIComponent(shapePreview(shape)).includes('#3090a0'));
  const beforeGeometry=shapePreview(shape);shape.vectorLayers[0].rects[0][2]=50;assert.notEqual(shapePreview(shape),beforeGeometry);
  assert.equal((shapeTag(shape).match(/<img/g)||[]).length,1);assert.equal(shapeTag(shape).includes('<rect'),false);assert.equal(shape.vectorLayers[0].rects[0][2],50);
});
test('native immutable geometry reuses its preview through moves and recolours correctly',()=>{
  const shape={sourceIdentifier:'cece-native-goodnotes-v1',kind:'vector',vectorSize:[10,10],vectorLayers:[{fill:'#112233',rects:[[0,0,10,10]]}]},first=shapePreview(shape);assert.ok(Object.isFrozen(shape.vectorLayers[0].rects));shape.x=40;assert.equal(shapePreview(shape),first);shape.vectorLayers[0].fill='#ff0000';assert.notEqual(shapePreview(shape),first);shape.vectorLayers[0].rects=[[0,0,5,10]];assert.ok(decodeURIComponent(shapePreview(shape)).includes('h5'));
});
