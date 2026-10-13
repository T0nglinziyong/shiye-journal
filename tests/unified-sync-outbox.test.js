import test from 'node:test';
import assert from 'node:assert/strict';
import {syncEnvelope,projectSyncRows,importSyncRows,latestEditedProject,
  foldLegacySyncRows,syncAffectedKeys} from '../src/unified-sync-outbox.js';
import {eraseSiteAppData} from '../src/account-data-wipe.js';

const project=id=>({id,title:id,activeDraftID:'d',updatedAt:'2026-10-12T08:30:00Z',
  drafts:[{id:'d',sceneVersion:2,canvas:{width:707,height:1000},layers:[]}]});
const row=(record,serial=1)=>({record,serial,baseRevision:13,operationID:crypto.randomUUID()});

test('one queue accepts project and import envelopes without colliding IDs',()=>{
 const p=project('same'),batch={id:'same',operations:[{store:'series',action:'delete',id:'z'}],names:['series']};
 const folded=foldLegacySyncRows([],[row(p)],[row(batch)]);
 assert.equal(folded.rows.length,2);
 assert.deepEqual(new Set(folded.rows.map(r=>r.record.id)),new Set(['project:same','batch:same']));
 assert.equal(projectSyncRows(folded.rows)[0].record.id,'same');
 assert.equal(importSyncRows(folded.rows)[0].record.id,'same');
 assert.equal(folded.quarantine.length,0);
 assert.deepEqual(syncAffectedKeys(folded.rows[0].record),[{store:'projects',id:'same'}]);
 assert.deepEqual(syncAffectedKeys(folded.rows[1].record),[{store:'series',id:'z'}]);
});

test('older work wins only when its last actual edit timestamp is newer',()=>{
 const cloud={updatedAt:'2026-10-12T08:00:02Z'};
 assert.equal(latestEditedProject({updatedAt:'2026-10-12T08:00:03Z'},cloud),'local');
 assert.equal(latestEditedProject({updatedAt:'2026-10-12T08:00:01Z'},cloud),'remote');
 assert.equal(latestEditedProject({updatedAt:'2026-10-12T08:00:02Z'},cloud),'remote');
 assert.equal(latestEditedProject({updatedAt:'bad'},cloud),'unknown');
 assert.equal(latestEditedProject(null,cloud),'unknown');
});

test('invalid/duplicate previous queues are preserved in quarantine, never uploaded',()=>{
 const p=project('a'),current=[row(syncEnvelope('project',p),3)];
 const imported=[row({...p,updatedAt:'2026-10-12T09:00:00Z'},4)];
 const bad=row({id:'bad',drafts:[]},5);
 const output=foldLegacySyncRows(current,[...imported,bad],[],[]);
 assert.equal(output.rows.length,1);
 assert.equal(output.quarantine.length,2);
 assert.equal(output.quarantine[0].reason,'duplicate-legacy-row');
 assert.equal(output.quarantine[1].reason,'invalid-legacy-row');
 assert.deepEqual(output.quarantine[0].row,imported[0]);
});

test('invalid stored blob references never auto-upload from historical imports',()=>{
 const invalid={id:'batch',names:['blobs'],operations:[
   {store:'blobs',action:'put',item:{id:'image',data:null}}]};
 const output=foldLegacySyncRows([],[],[row(invalid)]);
 assert.equal(output.rows.length,0);
 assert.equal(output.quarantine.length,1);
});

test('device purge reports blocking open-tab databases instead of claiming success',async()=>{
 let stored=false,session=false,unregistered=0,deleted=[];
 const idb={databases:async()=>[{name:'shiye-custom-cache'},{name:'other-site'}],
   deleteDatabase:name=>{deleted.push(name);const request={};queueMicrotask(()=>{
     if(name==='shiye-private-read-cache-v2')request.onerror?.();
     else request.onsuccess?.();
   });return request;}};
 const result=await eraseSiteAppData({
   storage:{clear(){stored=true;}},session:{clear(){session=true;}},
   idb,cacheStorage:{keys:async()=>['shiye-preview','unrelated'],delete:async()=>true},
   serviceWorker:{getRegistrations:async()=>[{unregister:async()=>{unregistered++;}}]},
 });
 assert.ok(result.errors.some(message=>message.includes('shiye-private-read-cache-v2')));
 assert.ok(deleted.includes('shiye-custom-cache'));
 assert.ok(!deleted.includes('other-site'));
 assert.equal(stored,true);assert.equal(session,true);assert.equal(unregistered,1);
});
