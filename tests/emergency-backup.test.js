import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import 'fake-indexeddb/auto';
import {createPrivateCache} from '../src/private-cache.js';
import {createPendingRecovery,parsePendingRecovery} from '../src/emergency-backup.js';
globalThis.crypto??=webcrypto;
const row=(id,blob)=>({record:{id,assets:[{id:'asset-1'}],blobs:[{id:'blob-1',data:blob}],projects:[]},
  serial:1,baseRevision:4,operationID:'op-'+id});
test('pending backup restores exact Blob bytes for the same account without network',async()=>{
  const bytes=new Uint8Array([0,127,255,42]),blob=new Blob([bytes],{type:'image/png'});
  const account='cloud:owner',snapshot={account,projects:[],imports:[row('batch',blob)]};
  const encoded=await createPendingRecovery(snapshot);
  const decoded=await parsePendingRecovery(encoded);
  assert.equal(decoded.account,account);
  assert.equal(decoded.imports.length,1);
  assert.deepEqual(new Uint8Array(await decoded.imports[0].record.blobs[0].data.arrayBuffer()),bytes);
  const cache=createPrivateCache({name:'shiye-emergency-restore-test'});
  await cache.restoreOutboxes(account,decoded.projects,decoded.imports);
  assert.equal((await cache.get(account,'import-outbox')).length,1);
});
test('malformed image bytes fail verification before a restore can commit',async()=>{
  const encoded=await createPendingRecovery({account:'cloud:owner',projects:[],imports:[row('batch',new Blob(['data']))]});
  const parsed=JSON.parse(await encoded.text());
  parsed.imports[0].record.blobs[0].data.sha256='0'.repeat(64);
  await assert.rejects(parsePendingRecovery(new Blob([JSON.stringify(parsed)])),/校验失败/);
});
test('same-document collision aborts both recovery queues without modification',async()=>{
  const cache=createPrivateCache({name:'shiye-emergency-conflict-test'}),account='cloud:owner';
  const existing={serial:1,baseRevision:0,operationID:'old',record:{id:'same'}};
  await cache.putOutbox(account,'project-outbox',[],[existing]);
  const colliding={serial:2,baseRevision:0,operationID:'new',record:{id:'same'}};
  await assert.rejects(cache.restoreOutboxes(account,[colliding],[row('other',new Blob(['b']))]),/其他标签页/);
  assert.equal((await cache.get(account,'project-outbox'))[0].operationID,'old');
  assert.equal((await cache.get(account,'import-outbox')),undefined);
});
