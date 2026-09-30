import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverProjectOutbox,usableProjectSnapshot} from '../src/project-outbox-recovery.js';

const saved={id:'work',activeDraftID:'draft',drafts:[{id:'draft',canvas:{width:707,height:1000},items:[],textBlocks:[],primitives:[],strokes:[]}]};
test('a complete pending edit may resume after an unexpected exit',()=>{
  assert.equal(usableProjectSnapshot(saved),true);
  assert.equal(recoverProjectOutbox([{record:saved}]).removed,0);
});
test('partial editor snapshots cannot replace the last saved version',()=>{
  for(const broken of [
    {...saved,drafts:[]},
    {...saved,activeDraftID:'lost'},
    {...saved,drafts:[{...saved.drafts[0],items:undefined}]},
    {...saved,drafts:[{...saved.drafts[0],canvas:{width:0,height:1000}}]},
    {...saved,projectDocumentPath:'owner/summary-only'},
  ])assert.equal(usableProjectSnapshot(broken),false);
  const rows=[{record:{...saved,drafts:[]}}, {record:saved}];
  assert.deepEqual(recoverProjectOutbox(rows),{rows:[rows[1]],removed:1});
});
