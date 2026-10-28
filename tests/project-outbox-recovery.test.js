import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverProjectOutbox,usableProjectSnapshot} from '../src/project-outbox-recovery.js';

const saved={id:'work',activeDraftID:'draft',drafts:[{id:'draft',sceneVersion:2,canvas:{width:707,height:1000},layers:[{id:'text',type:'text',content:'已离线保存',x:10,y:10,width:100,height:40,color:'#445566'}]}]};
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
  assert.deepEqual(recoverProjectOutbox(rows),{rows:[rows[1]],quarantined:[rows[0]],removed:1});
});
test('a damaged queue envelope cannot block reopening the acknowledged work',()=>{
  const invalid={record:saved,baseRevision:0};
  assert.deepEqual(recoverProjectOutbox([invalid]),{rows:[],quarantined:[invalid],removed:1});
});

test('pre-v2 pending edits are quarantined without mutation or replay',()=>{
 const legacy={id:'legacy',activeDraftID:'old',drafts:[{id:'old',canvas:{width:707,height:1000},
   items:[{id:'m',assetID:'a',x:30,y:40,width:20,height:30}],primitives:[],textBlocks:[],strokes:[]}]};
 const queued=row(legacy),before=JSON.stringify(legacy),result=recoverProjectOutbox([queued]);
 assert.equal(result.rows.length,0);
 assert.equal(result.quarantined[0],queued);
 assert.equal(JSON.stringify(legacy),before);
});

test('incomplete legacy pending edit must not migrate into empty v2 work',()=>{
 const incomplete={id:'legacy-missing-strokes',activeDraftID:'d',drafts:[{id:'d',canvas:{width:707,height:1000},items:[{id:'asset',assetID:'a'}],textBlocks:[],primitives:[]}]};
 const result=recoverProjectOutbox([row(incomplete)]);
 assert.equal(result.removed,1);
 assert.equal(incomplete.drafts[0].layers,undefined,'never create empty layer tree for missing original data');
});

test('a structurally plausible v2 outbox with invalid leaf geometry is quarantined',()=>{
 const broken=structuredClone(saved);
 broken.drafts[0].layers[0].width=-10;
 const pending=row(broken),result=recoverProjectOutbox([pending]);
 assert.equal(result.rows.length,0);
 assert.equal(result.quarantined[0],pending);
 assert.equal(broken.drafts[0].layers[0].width,-10);
});

test('v2 queue must not replay parallel legacy array fields',()=>{
 const mixed=structuredClone(saved);
 mixed.drafts[0].items=[];
 const pending=row(mixed),result=recoverProjectOutbox([pending]);
 assert.equal(result.rows.length,0);
 assert.equal(result.quarantined[0],pending);
});
