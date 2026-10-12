import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStorageMigration,classifyStoredRecord,STORAGE_MIGRATION_STORES,migrationBackup} from '../src/data-migrations/registry.js';
import {migrateLegacyDraft} from '../src/data-migrations/scene-v1-to-v2.js';
const oldDraft=()=>({id:'d',pageMode:'single',physicalPageHeightMM:297,canvas:{width:707,height:1000},
 paperColor:'#ffffff',items:[],textBlocks:[{id:'note',content:'旧版文字',color:'#445566',fontSize:18,x:60,y:80,width:100,height:40}],primitives:[],strokes:[]});
const sample=()=>({assets:[],series:[{id:'series',title:'素材系列'}],
 projects:[{id:'old',title:'旧版作品',drafts:[oldDraft()],activeDraftID:'d'},
 {id:'snap',isSnapshot:true,drafts:[{id:'d'}]},
 {id:'outside',title:'CeCe 旧作品',projectDocumentPath:'owner/hash-project.json.gz',projectDocumentProvider:'cos',drafts:[{id:'d',items:[],textBlocks:[],primitives:[],strokes:[]}],activeDraftID:'d'}],
 blobs:[{id:'blob',storagePath:'owner/image.webp',storageProvider:'cos'}],
 meta:[{id:'matching-session-v1',context:{basket:[]}}],
 trash:[{id:'trash1',kind:'project',item:{id:'trashed',drafts:[oldDraft()],activeDraftID:'d'}}]});

test('a single migration scan covers ALL storage collections but changes only registered obsolete records',async()=>{
 const collections=sample(),original=structuredClone(collections);
 const plan=await prepareStorageMigration(collections,{resolveProject:async summary=>({...summary,drafts:[oldDraft()],projectDocumentPath:summary.projectDocumentPath})});
 assert.deepEqual(plan.scans.map(s=>s.store),STORAGE_MIGRATION_STORES);
 assert.equal(plan.totals.scanned,7);
 assert.equal(plan.totals.migratable,3);
 assert.equal(plan.totals.needsReview,0);
 assert.deepEqual(plan.changes.map(s=>s.store).sort(),['projects','projects','trash']);
 assert.equal(plan.changes[0].converted.drafts[0].sceneVersion,2);
 assert.equal(plan.changes[0].converted.drafts[0].textBlocks[0].content,'旧版文字');
 assert.equal(plan.changes[1].converted.projectDocumentPath,undefined);
 assert.deepEqual(collections,original,'scanning MUST NOT mutate source records');
 assert.equal(classifyStoredRecord('meta',collections.meta[0]),'current','v1 in key does not imply obsolete schema');
});

test('broken old projects remain unchanged for manual review; other stores still scan',async()=>{
 const input=sample();input.projects[0].drafts[0].strokes=undefined;
 const plan=await prepareStorageMigration(input,{resolveProject:async r=>({...r,drafts:[oldDraft()]})});
 assert.equal(plan.totals.migratable,2);
 assert.equal(plan.review.length,1);
 assert.equal(plan.review[0].store,'projects');
 assert.equal(input.projects[0].drafts[0].strokes,undefined);
});

test('backup includes only records slated for conversion, never unrelated meta secrets',async()=>{
 const input=sample();input.meta.push({id:'ai-settings',secret:'should-not-be-exported'});
 const plan=await prepareStorageMigration(input,{resolveProject:async r=>({...r,drafts:[oldDraft()]})});
 const backup=await migrationBackup(plan,{account:'account-1',revision:19});
 const result=JSON.parse(await backup.blob.text());
 assert.equal(result.records.length,3);
 assert.equal(result.sourceRevision,19);
 assert.equal(result.records.find(r=>r.id==='outside').fullDocument.drafts[0].textBlocks[0].content,'旧版文字');
 assert.ok(!JSON.stringify(result).includes('should-not-be-exported'));
 assert.match(backup.sha256,/^[a-f0-9]{64}$/);
});

test('converter is separate and does not accept incomplete old leaves or fabricate a v2 draft',()=>{
 const source=oldDraft();const converted=migrateLegacyDraft(source);
 assert.equal(converted.layers[0].type,'text');assert.equal(JSON.stringify(converted).includes('"textBlocks"'),false);
 source.items=undefined;
 assert.throws(()=>migrateLegacyDraft(source),/字段不完整/);
});
