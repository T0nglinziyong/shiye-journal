import test from 'node:test';
import assert from 'node:assert/strict';
import {migrationPendingConflicts} from '../src/migration-outbox-guard.js';
import {forkConflictingEditableWork} from '../src/sync-conflict-copy.js';
const target=[{store:'projects',id:'legacy'},{store:'trash',id:'trash-old',original:{item:{id:'trashed-old'}}}];
const pending=id=>({record:{id},serial:1,baseRevision:1});
const batch=(id,ops)=>({record:{id,operations:ops}});
test('unrelated pending phone projects and batches do not block older account data conversion',()=>{
 const conflicts=migrationPendingConflicts(target,{
   projects:[pending('fresh')],
   imports:[batch('batch',[{store:'projects',action:'put',item:{id:'newer'}}])],
   quarantined:[pending('different-quarantined')]
 });
 assert.deepEqual(conflicts,[]);
});
test('same project, deleted-work restoration, tombstone or unknown records still block migration',()=>{
 const conflicts=migrationPendingConflicts(target,{
  projects:[pending('legacy')],
  quarantined:[pending('trashed-old')],
  imports:[batch('marker',[{store:'meta',action:'put',item:{id:'tombstone:projects:legacy'}}]),
    batch('restore',[{store:'trash',action:'put',item:{id:'other-trash',item:{id:'legacy'}}}])]
 });
 assert.equal(conflicts.length,4);
 assert.equal(migrationPendingConflicts(target,{imports:[batch('clear',[{store:'projects',action:'clear'}])]}).length,1);
 assert.equal(migrationPendingConflicts(target,{quarantined:[{record:{}}]}).length,1);
});
test('same-work conflict copy retains recursive editable payload and never carries stale CAS provenance',()=>{
 const original={id:'old-work',title:'日记',activeDraftID:'d',__cloudBaseRevision:5,__cloudSessionId:'session-1',projectDocumentPath:undefined,
  drafts:[{id:'d',sceneVersion:2,canvas:{width:707,height:1000},layers:[{id:'t',type:'text',content:'保留正文',x:1,y:2,width:50,height:50,color:'#334455',fontSize:20}]}]};
 const frozen=JSON.stringify(original);
 const copy=forkConflictingEditableWork(original,{id:'new-work',now:'2026-10-12T12:00:00Z'});
 assert.equal(copy.id,'new-work');assert.equal(original.id,'old-work');
 assert.equal(copy.drafts[0].layers[0].content,'保留正文');
 assert.equal(copy.__cloudBaseRevision,undefined);assert.equal(copy.__cloudSessionId,undefined);
 assert.equal(JSON.stringify(original),frozen);
 assert.equal(forkConflictingEditableWork({...original,drafts:[]},{id:'no'}),null);
});
