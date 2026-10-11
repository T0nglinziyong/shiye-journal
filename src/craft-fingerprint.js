import {sha256} from '@noble/hashes/sha2.js';
import {canonicalTaskSource} from './task-source.js';
import {canonicalScene,attachSceneV2} from './scene-v2.js';

// Synchronous identifiers for the existing synchronous executor. These are
// content identifiers, not authorization; trust stays in the saved task.
export function craftDigest(value) {
  const text=canonicalTaskSource(value);
  if(typeof text!=='string'||text.length>8_000_000)throw Error('工艺状态过大或无效');
  const bytes=new TextEncoder().encode(text);
  if(bytes.byteLength>12_000_000)throw Error('工艺状态超过指纹预算');
  return 'sha256:'+Array.from(sha256(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function layerState(item) {
  const {aiManaged:_managed,generationBaseline:_baseline,craftProvenance:_provenance,...state}=item;
  return state;
}
export const layerFingerprint=item=>craftDigest(layerState(item));
export function craftSceneState(draft) {
  attachSceneV2(draft);
  const {format,version,scene}=canonicalScene(draft);
  // The scene tree is hashed directly; UI-only metadata and runtime views
  // never become a second authority.
  const {createdAt,agentRun,makingSteps,...data}=scene;
  return {format,version,...data};
}
export const craftSceneHash=draft=>craftDigest(craftSceneState(draft));
export const isManagedUnchanged=item=>!!item.aiManaged&&item.aiManaged.version===1&&item.aiManaged.baseline===layerFingerprint(item)&&!item.isLocked&&!item.locked;
export function assertManagedWritable(item) {
  const pieceId=item.creativePieceID||item.agentKey||item.key||item.id;
  if(item.isLocked||item.locked)throw Object.assign(Error('图层已锁定，未覆盖用户内容'),{code:'LAYER_LOCKED',pieceId});
  if(item.aiManaged&&!isManagedUnchanged(item))throw Object.assign(Error('该图层已有手动修改；请保留原稿或另存新方案'),{code:'MANUAL_EDIT_PROTECTED',pieceId});
}
export function recordManagedChanges(before,after) {
  for(const field of ['items','textBlocks','primitives','strokes']) {
    const previous=new Map((before[field]||[]).map(item=>[item.id,item]));
    for(const item of after[field]||[]) {
      const old=previous.get(item.id),hash=layerFingerprint(item);
      if(!old||layerFingerprint(old)!==hash)item.aiManaged={version:1,baseline:hash};
    }
  }
}
