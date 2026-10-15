import test from 'node:test';
import assert from 'node:assert/strict';
import {appendInkStroke} from '../src/ink-groups.js';

const ink=(id,zIndex)=>({id,type:'ink',zIndex,points:[{x:1,y:1}],width:1,color:'#000000'});

test('consecutive strokes form one selectable Scene layer without crossing another top layer',()=>{
  const draft={layers:[]};
  appendInkStroke(draft,ink('one',2001),'group-one');
  assert.equal(draft.layers[0].type,'ink');
  appendInkStroke(draft,ink('two',2002),'group-one');
  assert.deepEqual(draft.layers.map(layer=>layer.id),['group-one']);
  assert.deepEqual(draft.layers[0].children.map(stroke=>stroke.id),['one','two']);
  appendInkStroke(draft,ink('three',2003),'unused');
  assert.deepEqual(draft.layers[0].children.map(stroke=>stroke.id),['one','two','three']);
  draft.layers.push({id:'shape',type:'shape',zIndex:3000});
  appendInkStroke(draft,ink('four',3001),'group-two');
  assert.deepEqual(draft.layers.map(layer=>layer.id),['group-one','shape','four']);
  appendInkStroke(draft,ink('five',3002),'group-two');
  assert.deepEqual(draft.layers.map(layer=>layer.id),['group-one','shape','group-two']);
  assert.deepEqual(draft.layers[2].children.map(stroke=>stroke.id),['four','five']);
});
