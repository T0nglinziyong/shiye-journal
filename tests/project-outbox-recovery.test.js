import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverProjectOutbox,usableProjectSnapshot} from '../src/project-outbox-recovery.js';

const saved={id:'work',activeDraftID:'draft',drafts:[{id:'draft',sceneVersion:2,canvas:{width:707,height:1000},layers:[{id:'text',type:'text',content:'已离线保存',x:10,y:10,width:100,height:40}]}]};
const row=record=>({record,serial:1,baseRevision:0});
test('a complete pending edit may resume after an unexpected exit',()=>{
  assert.equal(usableProjectSnapshot(saved),true);
  assert.equal(recoverProjectOutbox([row(saved)]).removed,0);
});
test('partial editor snapshots cannot replace the last saved version',()=>{
  for(const broken of [
    {...saved,drafts:[]},
    {...saved,activeDraftID:'lost'},
    {...saved,drafts:[{...saved.drafts[0],layers:undefined}]},
    {...saved,drafts:[{...saved.drafts[0],canvas:{width:0,height:1000}}]},
    {...saved,projectDocumentPath:'owner/summary-only'},
  ])assert.equal(usableProjectSnapshot(broken),false);
  const rows=[row({...saved,drafts:[]}),row(saved)];
  assert.deepEqual(recoverProjectOutbox(rows),{rows:[rows[1]],removed:1});
});
test('a damaged queue envelope cannot block reopening the acknowledged work',()=>{
  assert.deepEqual(recoverProjectOutbox([{record:saved,baseRevision:0}]),{rows:[],removed:1});
});

test('pending pre-v2 edits are migrated, never discarded for lacking leaf arrays',()=>{
 const old={id:'legacy',activeDraftID:'old',
   drafts:[{id:'old',canvas:{width:707,height:1000},
     items:[{id:'m',assetID:'asset-1',x:30,y:40,width:20,height:30}],
     primitives:[],textBlocks:[],strokes:[]}]};
 const record=row(old),recovered=recoverProjectOutbox([record]);
 assert.equal(recovered.removed,0);
 assert.equal(record.record.drafts[0].sceneVersion,2);
 assert.equal(record.record.drafts[0].layers[0].type,'material');
 assert.equal(JSON.stringify(record.record).includes('"items"'),false);
});
