import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRecordEdits} from '../src/sync-last-write.js';
import {createDevReset} from '../server/dev-reset.mjs';

test('last actual change wins regardless of upload order',()=>{
  const remote={updatedAt:'2026-10-09T11:00:00Z'};
  assert.equal(compareRecordEdits({updatedAt:'2026-10-09T11:01:00Z'},remote),'local');
  assert.equal(compareRecordEdits({updatedAt:'2026-10-09T10:59:00Z'},remote),'remote');
  assert.equal(compareRecordEdits({updatedAt:remote.updatedAt},remote),'remote');
  assert.equal(compareRecordEdits({updatedAt:'invalid'},remote),'remote');
  assert.equal(compareRecordEdits({updatedAt:'2026-10-09T11:01:00Z'},null),'remote',
    'deleted remote object must not be resurrected by a stale upload');
  assert.equal(compareRecordEdits({updatedAt:'2026-10-09T11:00:00Z'},remote,
    {localTimestamp:'2026-10-09T11:01:00Z'}),'local');
});

test('dev COS reset only deletes authenticated admin account prefix and verifies before deletion',async()=>{
  const removed=[],list=[],cleared=[];
  const reset=createDevReset({enabled:true,
    authenticate:async()=>({id:'admin-user',isAdmin:true}),
    cos:{list:async prefix=>{list.push(prefix);return list.length===1?['admin-user/a.webp','admin-user/b.webp']:[];},
      remove:async keys=>removed.push(keys)},
    resetRecords:async token=>cleared.push(token)});
  const request={method:'POST',authorization:'Bearer synthetic-token-sufficient-length',confirm:'RESET_DEV_DATA'};
  assert.deepEqual(await reset({...request,mode:'probe'}),{status:200,ready:true});
  assert.equal(list.length,0,'probe must not read/remove any COS bytes');
  const first=await reset(request);
  assert.deepEqual({status:first.status,deleted:first.deleted,more:first.more},{status:200,deleted:2,more:true});
  assert.deepEqual(removed,[['admin-user/a.webp','admin-user/b.webp']]);
  assert.equal(cleared.length,0,'cloud records remain until all COS objects are purged');
  const last=await reset(request);
  assert.equal(last.reset,true);
  assert.deepEqual(cleared,['synthetic-token-sufficient-length']);
});
test('COS dev reset cannot target other users or run without admin auth',async()=>{
  const calls=[],make=options=>createDevReset({
    ...options,cos:{list:async()=>{calls.push('list');return ['other-user/secret'];},
      remove:async()=>calls.push('delete')},
    resetRecords:async()=>calls.push('db')});
  const request={method:'POST',authorization:'Bearer synthetic-token-sufficient-length',confirm:'RESET_DEV_DATA'};
  assert.equal((await make({enabled:false,authenticate:async()=>({id:'u',isAdmin:true})})(request)).status,403);
  assert.equal((await make({enabled:true,authenticate:async()=>({id:'u',isAdmin:false})})(request)).status,403);
  assert.equal(calls.length,0);
  await assert.rejects(make({enabled:true,authenticate:async()=>({id:'admin-user',isAdmin:true})})(request),/非本人对象/);
  assert.equal(calls.includes('delete'),false);
});
