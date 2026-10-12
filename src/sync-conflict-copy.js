import {usableProjectSnapshot} from './project-outbox-recovery.js';
// A stale full-document PUT must never overwrite the current cloud document.
// A valid pending Scene v2 work can instead be replayed under a fresh ID.
// Original record bytes remain in the durable outbox until server acknowledgement.
export function forkConflictingEditableWork(record,{id=crypto.randomUUID(),now=new Date().toISOString()}={}){
 if(!usableProjectSnapshot(record)||typeof id!=='string'||!id||id===record.id)return null;
 const copy=structuredClone(record);
 copy.id=id;
 copy.title=String(copy.title||'未命名作品').slice(0,64)+' · 同步冲突保留';
 copy.updatedAt=now;
 for(const field of ['projectDocumentPath','projectDocumentProvider','projectDocumentEncoding','coverStaticPath','coverBaselineUpdatedAt','__cloudBaseRevision','__cloudSessionId'])delete copy[field];
 return copy;
}
