import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {buildBlobIntegrity,validateBackupData} from '../src/backup-integrity.js';
globalThis.crypto??=webcrypto;
const backup=()=>({
 format:'shiye-pwa',version:1,
 stores:{assets:[{id:'a',blobId:'image'}],blobs:[{id:'image',data:'data:image/png;base64,YWJj'}],
 series:[],projects:[],meta:[],trash:[]}
});
test('legacy v1 archive is validated before restoring',async()=>{
  assert.equal(await validateBackupData(backup()),true);
});
test('missing source image fails before any database transaction',async()=>{
  const source=backup();source.stores.blobs=[];
  await assert.rejects(validateBackupData(source),/缺少原图/);
});
test('duplicate IDs are rejected without mutating data',async()=>{
  const source=backup();source.stores.assets.push({...source.stores.assets[0]});
  await assert.rejects(validateBackupData(source),/重复/);
});
test('new backup checksum catches binary corruption',async()=>{
  const source=backup();
  source.integrity={algorithm:'SHA-256',blobs:await buildBlobIntegrity([{id:'image',data:new Blob(['abc'])}])};
  assert.equal(await validateBackupData(source),true);
  source.stores.blobs[0].data='data:image/png;base64,YWJk';
  await assert.rejects(validateBackupData(source),/SHA-256/);
});
