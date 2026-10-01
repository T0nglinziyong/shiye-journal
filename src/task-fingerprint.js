import {canonicalTaskSource} from './task-source.js';

export async function sha256Hex(bytes){
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function taskFingerprint(source){
  const {taskHash:_ignored,...content}=source;
  return `sha256:${await sha256Hex(new TextEncoder().encode(canonicalTaskSource(content)))}`;
}

// This detects accidental or malicious changes inside a returned package, but
// trust still comes from the account-scoped task snapshot saved at export.
export async function assertTaskFingerprint(source){
  if(source?.taskHash&&source.taskHash!==await taskFingerprint(source))throw Error('原始创作任务指纹不匹配');
}
