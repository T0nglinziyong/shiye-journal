// Both the in-app agent and offline CLI commit the same Scene document.
// Storage locking / durable checkpoints belong to the host; validation,
// revisions, atomic batches and retry receipts belong to this reducer.
import {sha256} from '@noble/hashes/sha2.js';
import {applyCreationV2Batch,validateCreationV2Commands} from './creation-v2-commands.js';
import {validateV3SceneDocument} from './v3-scene-schema.js';

const digest=value=>'sha256:'+Array.from(sha256(new TextEncoder().encode(JSON.stringify(value))),b=>b.toString(16).padStart(2,'0')).join('');
const fail=(code,message,details={})=>Object.assign(Error(message),{code,...details});
export function creationSceneRevision(document){
 const {v3Transactions:_receipts,...state}=document;
 return digest(state);
}
export function applyCreationTransaction(document,input,assets,{dryRun=false,now=()=>new Date().toISOString(),...capabilities}={}){
 validateV3SceneDocument(document);validateCreationV2Commands(input);
 const current=creationSceneRevision(document),receipts=document.v3Transactions||{},commandHash=digest(input),prior=receipts[input.transactionId];
 if(prior){
  if(prior.commandHash!==commandHash)throw fail('TRANSACTION_CONFLICT','同一 transactionId 已用于不同命令');
  return {document,changed:false,result:{ok:true,replayed:true,...prior,currentSceneRevision:current}};
 }
 if(input.baseSceneRevision!==current)throw fail('REVISION_CONFLICT','Scene 已变化；请读取当前 sceneRevision 后重新提交',{currentSceneRevision:current});
 const next=applyCreationV2Batch(document,input,assets,capabilities),nextRevision=creationSceneRevision(next);
 validateV3SceneDocument(next);
 if(dryRun)return {document,proposed:next,changed:false,result:{ok:true,dryRun:true,baseSceneRevision:current,proposedSceneRevision:nextRevision,operations:input.operations.length}};
 const receipt={transactionId:input.transactionId,commandHash,baseSceneRevision:current,sceneRevision:nextRevision,operations:input.operations.length,appliedAt:now()};
 next.v3Transactions={...receipts,[input.transactionId]:receipt};validateV3SceneDocument(next);
 return {document:next,changed:nextRevision!==current,result:{ok:true,...receipt}};
}
