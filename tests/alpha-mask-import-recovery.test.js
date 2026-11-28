import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverImportOutbox} from '../src/import-outbox-recovery.js';
import {projectSummary} from '../src/project-document.js';
const uid=(n)=>'blob-'+n,raw=new Blob(['source-bytes'],{type:'image/png'});
const asset={id:'a',blobId:uid(1),candidateFrameBlobId:uid(2),
 initialMaskBlobId:uid(3),finalMaskBlobId:uid(3)};
const row=(records)=>[{serial:1,baseRevision:0,
 record:{id:'batch',assets:[asset],projects:[],blobs:records}}];
test('no mask available either locally or remotely makes import recoverable queue reject the incomplete item',async()=>{
 const result=await recoverImportOutbox(row([{id:uid(1),data:raw},{id:uid(2),data:raw}]),async()=>false);
 assert.equal(result.rows.length,0);
});
test('all source dependencies preserved locally make import recovery a no-op',async()=>{
 const batch=row([{id:uid(1),data:raw},{id:uid(2),data:raw},{id:uid(3),data:raw}]);
 const result=await recoverImportOutbox(batch,async()=>{throw Error('must not probe')});
 assert.equal(result.changed,false);
 assert.equal(result.rows.length,1);
});
test('a confirmed cloud copy of a missing mask keeps the material without substituting its primary PNG',async()=>{
 const result=await recoverImportOutbox(row([{id:uid(1),data:raw},{id:uid(2),data:raw}]),
  async()=>new Set([uid(3)]));
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].record.assets[0].blobId,uid(1));
});
test('full Scene v2 journal and archives are not duplicated into 128 KB cloud summaries',()=>{
 const p={id:'p',drafts:[{id:'d',layers:[],makingSteps:[],canvas:{width:700,height:1000}}],
  autoSceneSnapshots:[{id:'s'}],autoSceneSnapshotStore:{hash:{chunks:['abc']}},
  sceneOperations:[{id:'op'}],sceneOperationsSinceSnapshot:2,
  manualArchives:[],manualArchiveStore:{}};
 const doc=projectSummary(p,'path','gzip');
 assert.equal(doc.id,'p');
 for(const key of ['autoSceneSnapshots','autoSceneSnapshotStore','sceneOperations',
  'sceneOperationsSinceSnapshot','manualArchives','manualArchiveStore'])
  assert.equal(Object.hasOwn(doc,key),false,key);
 assert.ok(doc.projectDocumentPath);
});
