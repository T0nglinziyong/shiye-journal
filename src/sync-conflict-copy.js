import {usableProjectSnapshot} from './project-outbox-recovery.js';
// One editing branch has one destination, even when it stages several later
// operations before the first fork is acknowledged. Use the durable editor
// session as the anchor; a pending row without one uses its operation ID.
export async function forkIDForBranch(accountEpoch,projectID,branchID){
 if(!accountEpoch||!projectID||!branchID)throw Error('作品分叉缺少稳定身份');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',
   new TextEncoder().encode(JSON.stringify([accountEpoch,projectID,branchID])))).slice(0,16);
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
   hex.slice(16,20),hex.slice(20)].join('-');
}
// A stale full-document PUT must never overwrite the current cloud document.
// A valid pending Scene v2 work can instead be replayed under a fresh ID.
// Original record bytes remain in the durable outbox until server acknowledgement.
export function forkConflictingEditableWork(record,{id=crypto.randomUUID(),now=new Date().toISOString()}={}){
 if(!usableProjectSnapshot(record)||typeof id!=='string'||!id||id===record.id)return null;
 const copy=structuredClone(record);
 copy.id=id;
 copy.title=String(copy.title||'未命名作品').slice(0,64)+' · 另一编辑版本';
 copy.updatedAt=now;
 for(const field of ['projectDocumentPath','projectDocumentProvider','projectDocumentEncoding','coverStaticPath','coverBaselineUpdatedAt','__cloudBaseRevision','__cloudSessionId'])delete copy[field];
 copy.__cloudSessionId=crypto.randomUUID();
 copy.forkOrigin={projectID:record.id,branchID:record.__cloudSessionId||null};
 return copy;
}

// An occupied branch destination can be a previously confirmed upload or a
// genuinely newer edit of that copy. Compare content before reusing it; never
// drop a pending Scene merely because the deterministic ID already exists.
export async function availableConflictCopy(record,{epoch,branchID,load,fingerprint}){
 let anchor=branchID;
 for(let attempt=0;attempt<8;attempt++){
  const id=await forkIDForBranch(epoch,record.id,anchor);
  const copy=forkConflictingEditableWork(record,{id});
  if(!copy)throw Error('待同步作品数据不完整，已保留原记录');
  const existing=await load(id);
  if(!existing)return {copy,existing:false};
  if(fingerprint(copy)===fingerprint(existing))return {copy:{...existing,
    __cloudSessionId:copy.__cloudSessionId},existing:true};
  anchor=branchID+':'+fingerprint(copy)+':'+fingerprint(existing);
 }
 throw Error('作品副本在同步期间持续变化，本机内容已保留，将稍后重试');
}
