import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCloudSnapshot,verifyCloudSnapshot,cloudObjectReferences} from '../scripts/cloud-backup-core.mjs';
const tables={
 shiye_accounts:[{user_id:'owner-uuid',username:'test'}],
 shiye_revisions:[{user_id:'owner-uuid',revision:4}],
 shiye_records:[{user_id:'owner-uuid',store:'blobs',id:'image',
   record:{id:'image',storageProvider:'cos',storagePath:'owner-uuid/abcd',thumbnailPath:'owner-uuid/abcd-preview360.webp'}},
   {user_id:'owner-uuid',store:'projects',id:'proj',record:{id:'proj',projectDocumentProvider:'cos',projectDocumentPath:'owner-uuid/full-project.json.gz',drafts:[{coverImageID:'project-cover:cos:owner-uuid/full-project.json.gz-preview.webp'}]}}],
 shiye_changes:[],shiye_commits:[]
};
const readTable=async function*(table){for(const row of tables[table]||[])yield structuredClone(row);};
const readObject=async()=>new Response(new Blob(['private-source']),{status:200});
test('standalone backup covers metadata + referenced COS objects with byte integrity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shiye-cloud-backup-'));
 try{
  const {directory,manifest}=await createCloudSnapshot({root:dir,readTable,readObject});
  assert.equal(Object.keys(manifest.objects).length,4);
  assert.equal(manifest.tables.shiye_records.count,2);
  const verified=await verifyCloudSnapshot(directory);
  assert.deepEqual(verified.verified,true);
  const manifestFile=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
  const victim=join(directory,Object.values(manifestFile.objects)[0].file);
  await writeFile(victim,'corrupt');
  await assert.rejects(verifyCloudSnapshot(directory),/哈希不一致/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('remote revision change prevents publication of inconsistent backup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shiye-cloud-race-'));
 let seen=0;
 const mutatingRead=async function*(table){
  for(const row of tables[table]||[])yield {...row,revision:table==='shiye_revisions'?(++seen>1?5:4):row.revision};
 };
 try{
  await assert.rejects(createCloudSnapshot({root:dir,readTable:mutatingRead,readObject}),/版本变化/);
  const remaining=await readdir(dir);
  assert.equal(remaining.some(name=>name.startsWith('snapshot-')),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('cross-account COS reference is rejected before publishing any backup',()=>{
 assert.throws(()=>cloudObjectReferences({user_id:'owner-uuid',record:{
   storageProvider:'cos',storagePath:'another-owner/secret'}}),/跨账号/);
});
