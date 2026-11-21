import {canonicalTaskSource} from './task-source.js';
import {sha256} from '@noble/hashes/sha2.js';

export async function sha256Hex(bytes){
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function taskFingerprint(source){
  const {taskHash:_ignored,...content}=source;
  return `sha256:${await sha256Hex(new TextEncoder().encode(canonicalTaskSource(content)))}`;
}

export function assertTaskFingerprintSync(source){
  if(!/^sha256:[a-f0-9]{64}$/.test(source?.taskHash||''))throw Error('创作任务缺少有效指纹');
  const {taskHash:_ignored,...content}=source;
  const bytes=new TextEncoder().encode(canonicalTaskSource(content));
  if(bytes.byteLength>2_000_000)throw Error('创作任务数据过大');
  const actual='sha256:'+Array.from(sha256(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(source.taskHash!==actual)throw Error('创作任务指纹不匹配；请使用完整、未修改的 JSON');
}

// Task exports still use the asynchronous Web Crypto path; imports use the
// synchronous equivalent above to validate before editing or staging data.
export async function assertTaskFingerprint(source){
  if(!/^sha256:[a-f0-9]{64}$/.test(source?.taskHash||''))throw Error('原始创作任务缺少当前指纹');
  if(source.taskHash!==await taskFingerprint(source))throw Error('原始创作任务指纹不匹配');
}
