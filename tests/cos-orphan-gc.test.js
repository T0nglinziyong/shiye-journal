import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {originalKey,reclaimableKey,quarantineKey,sweepCosOrphans} from '../server/cos-orphan-gc-worker.mjs';

const user='78550825-ce3c-4542-95df-434f39937503';
const source=user+'/'+ 'a'.repeat(64);
const old='2025-01-01T00:00:00.000Z';
const DAY=86400000;
function fixture({referenced=false,incomplete=false,reset=false,trash=false}={}){
 let now=Date.parse('2026-10-13T00:00:00.000Z'),revision=7,changeDuringScan=false;
 const records=[{store:'blobs',id:'blob-original',record:{id:'blob-original',
   storageProvider:'cos',storagePath:source}}];
 if(referenced)records.push({store:'assets',id:'asset-one',record:{id:'asset-one',blobId:'blob-original'}});
 if(reset)records.push({store:'meta',id:'shiye-reset-barrier',record:{phase:'deleting'}});
 if(trash)records.push({store:'trash',id:'old-trash',record:{kind:'project',date:old,item:{id:'work'}}});
 const objects=new Map([[source,{Key:source,Size:'16',ETag:'"digest"',LastModified:old}]]);
 const deleted=[],copied=[],rpc=[];
 const cos={
  async getBucket(){return {Contents:[...objects.values()].sort((a,b)=>a.Key.localeCompare(b.Key)),
    IsTruncated:incomplete?undefined:false};},
  async headObject({Key}){const row=objects.get(Key);if(!row)throw Object.assign(Error('missing'),{statusCode:404});
    return {ETag:row.ETag,ContentLength:row.Size};},
  async putObjectCopy({Key,CopySource}){const from=CopySource.slice(CopySource.indexOf('.myqcloud.com/')+14);
    const row=objects.get(from);if(!row)throw Error('copy source missing');
    objects.set(Key,{...row,Key,LastModified:new Date(now).toISOString()});copied.push([from,Key]);},
  async deleteObject({Key}){objects.delete(Key);deleted.push(Key);}
 };
 const client={
  from(table){const query={select(){return query;},eq(){return query;},order(){return query;},
    async single(){assert.equal(table,'shiye_revisions');return {data:{revision}};},
    async range(start,end){assert.equal(table,'shiye_records');
      if(changeDuringScan){revision++;changeDuringScan=false;}
      return {data:records.slice(start,end+1)};}};
   return query;},
  async rpc(name,args){rpc.push([name,args]);
    assert.equal(args.p_expected_revision,revision);
    if(name==='shiye_gc_prune_trash'){
      const index=records.findIndex(row=>row.store==='trash'&&row.id===args.p_trash_id);
      if(index<0)return {error:{message:'missing'}};
      records.splice(index,1);return {data:++revision};
    }
    assert.equal(name,'shiye_gc_prune_blob');
    if(records.some(row=>row.store!=='blobs'&&JSON.stringify(row.record).includes(args.p_blob_id)))
      return {error:{message:'still used'}};
    const index=records.findIndex(row=>row.store==='blobs'&&row.id===args.p_blob_id);
    if(index<0)return {data:revision};records.splice(index,1);return {data:++revision};}
 };
 const run=(deleteEnabled=true)=>sweepCosOrphans({client,cos,user,bucket:'test-bucket',region:'ap-test',now,
   deleteEnabled});
 return {run,objects,records,deleted,copied,rpc,
   advance:days=>{now+=days*DAY;},addReference:()=>{records.push({store:'assets',id:'a',record:{id:'a',storagePath:source}});revision++;},
   changeDuringScan:()=>{changeDuringScan=true;},
   setIncomplete:value=>{incomplete=value;}};
}

test('scope validation forbids account-crossing, documents and arbitrary paths',()=>{
 assert.equal(originalKey(user,source),true);
 assert.equal(reclaimableKey(user,source+'-preview480.webp'),true);
 assert.equal(reclaimableKey(user,source+'-project.json.gz'),true);
 assert.equal(originalKey(user,'other/'+ 'a'.repeat(64)),false);
 assert.equal(originalKey(user,source+'-project.json'),false);
 assert.throws(()=>quarantineKey(user,'other/'+ 'a'.repeat(64)));
});
test('a referenced original is never quarantined or deleted',async()=>{
 const state=fixture({referenced:true});const result=await state.run();
 assert.equal(result.actions,0);assert.equal(state.objects.size,1);
});
test('a direct work reference stays protected even without a blob row',async()=>{
 const state=fixture();state.records.splice(0,1);
 state.records.push({store:'projects',id:'work',record:{id:'work',storagePath:source}});
 const result=await state.run();
 assert.equal(result.actions,0);assert.equal(result.eligibleCandidates,0);
});
test('referenced preview and project document remain untouched',async()=>{
 const state=fixture(),preview=source+'-preview480.webp',document=source+'-project.json.gz';
 state.objects.set(preview,{Key:preview,Size:'4',ETag:'"preview"',LastModified:old});
 state.objects.set(document,{Key:document,Size:'5',ETag:'"document"',LastModified:old});
 state.records.push({store:'projects',id:'work',record:{id:'work',projectDocumentPath:document}});
 const result=await state.run();
 assert.equal(result.quarantined,0,'a work document containing the source hash conservatively protects its original');
 assert.ok(!state.objects.has(quarantineKey(user,preview)));
 assert.ok(!state.objects.has(quarantineKey(user,document)));
});
test('account reset and stale cloud revision stop every destructive action',async()=>{
 const reset=fixture({reset:true});assert.equal((await reset.run()).skipped,'account-reset');
 const state=fixture();await state.run();state.advance(31);
 state.changeDuringScan();
 await assert.rejects(state.run(),/扫描期间云端版本变化/);
 assert.equal(state.deleted.length,0);
});
test('expired trash is pruned under the revision check even if no browser opens',async()=>{
 const state=fixture({trash:true});
 assert.equal((await state.run(false)).expiredTrashCandidates,1);
 assert.equal(state.records.some(row=>row.store==='trash'),true);
 const result=await state.run();
 assert.equal(result.trashPruned,1);assert.equal(result.scanned,0);
 assert.equal(state.records.some(row=>row.store==='trash'),false);
 assert.equal(state.copied.length,0);assert.equal(state.deleted.length,0);
});
test('orphan original moves through verified copy, CAS metadata prune, delayed delete and recovery window',async()=>{
 const state=fixture(),backup=quarantineKey(user,source);
 assert.equal((await state.run(false)).dryRun,true);assert.equal(state.copied.length,0);
 assert.equal((await state.run()).quarantined,1);
 assert.ok(state.objects.has(backup));assert.ok(state.objects.has(source));
 state.advance(31);assert.equal((await state.run()).metadataPruned,1);
 assert.equal(state.rpc.length,1);assert.ok(state.objects.has(source));
 state.advance(30);assert.equal((await state.run()).objectsDeleted,1);
 assert.deepEqual(state.deleted,[source]);assert.ok(state.objects.has(backup));
 state.advance(120);assert.equal((await state.run()).quarantinePurged,1);
 assert.deepEqual(state.deleted,[source,backup]);
});
test('a returning reference restores a missing original from private quarantine',async()=>{
 const state=fixture(),backup=quarantineKey(user,source);
 await state.run();state.advance(31);await state.run();state.advance(30);await state.run();
 assert.ok(!state.objects.has(source));state.addReference();
 const result=await state.run();assert.equal(result.recovered,1);
 assert.ok(state.objects.has(source));assert.ok(state.objects.has(backup));
});
test('partial cloud inventory aborts before copy, metadata mutation or deletion',async()=>{
 const state=fixture({incomplete:true});
 await assert.rejects(state.run(),/分页结束/);
 assert.equal(state.copied.length,0);assert.equal(state.deleted.length,0);
 assert.equal(state.rpc.length,0);
});
test('changed quarantine copy blocks original deletion',async()=>{
 const state=fixture(),backup=quarantineKey(user,source);
 await state.run();state.advance(31);await state.run();state.advance(30);
 state.objects.get(backup).ETag='"tampered"';
 await assert.rejects(state.run(),/隔离副本与当前原图不一致/);
 assert.equal(state.deleted.length,0);assert.ok(state.objects.has(source));
});
test('migration grants destructive RPC only to service role',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261013114054_protected_cos_orphan_gc.sql',import.meta.url),'utf8');
 assert.match(sql,/for update/i);assert.match(sql,/strpos\(r\.record::text,p_blob_id\)/);
 assert.match(sql,/revoke all on function public\.shiye_gc_prune_blob[\s\S]*authenticated/);
 assert.match(sql,/grant execute on function public\.shiye_gc_prune_blob[\s\S]*service_role/);
 assert.match(sql,/create table if not exists public\.shiye_cos_gc_leases/);
 assert.match(sql,/grant execute on function public\.shiye_gc_claim[\s\S]*service_role/);
 assert.match(sql,/grant execute on function public\.shiye_gc_prune_trash[\s\S]*service_role/);
});
