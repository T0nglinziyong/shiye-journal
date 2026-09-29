import test from 'node:test';import assert from 'node:assert/strict';import {snapshotDraft} from '../src/draft-snapshot.js';
test('history shares immutable vector geometry but isolates placement, colours, text and ink',()=>{
  const rects=Object.freeze([Object.freeze([0,0,10,10])]),draft={id:'d',items:[],textBlocks:[{content:'old'}],strokes:[{points:[{x:1,y:2}]}],primitives:[{id:'s',x:10,vectorLayers:[{fill:'#ffffff',rects}]}]};
  const copy=snapshotDraft(draft);assert.equal(copy.primitives[0].vectorLayers[0].rects,rects);draft.primitives[0].x=20;draft.primitives[0].vectorLayers[0].fill='#000000';draft.textBlocks[0].content='new';draft.strokes[0].points[0].x=3;assert.equal(copy.primitives[0].x,10);assert.equal(copy.primitives[0].vectorLayers[0].fill,'#ffffff');assert.equal(copy.textBlocks[0].content,'old');assert.equal(copy.strokes[0].points[0].x,1);
});
