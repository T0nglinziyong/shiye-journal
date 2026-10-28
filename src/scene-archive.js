import {gzipSync,gunzipSync,strToU8,strFromU8} from 'fflate';
import {sha256} from '@noble/hashes/sha2.js';
import {attachSceneV2,validateSceneExtensions} from './scene-v2.js';
const FORMAT='scene-v2-gzip-sha256';
const CHUNK=180000;
const hex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
const encode=bytes=>{let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);};
const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export function archivePayload(drafts){
 if(!Array.isArray(drafts)||!drafts.length||drafts.length>40)throw Error('存档缺少 Scene v2 方案');
 for(const d of drafts)validateSceneExtensions(d);
 const raw=strToU8(JSON.stringify(drafts));
 if(raw.length>16_000_000)throw Error('单个手账存档超过 16 MB');
 const hash='sha256:'+hex(sha256(raw)),binary=gzipSync(raw,{level:6}),base64=encode(binary);
 return {hash,payload:{format:FORMAT,uncompressedBytes:raw.length,chunks:Array.from({length:Math.ceil(base64.length/CHUNK)},(_,i)=>base64.slice(i*CHUNK,(i+1)*CHUNK))}};
}
export function readArchivePayload(payload,expectedHash=null){
 if(payload?.format!==FORMAT||!Number.isInteger(payload.uncompressedBytes)||payload.uncompressedBytes<1||payload.uncompressedBytes>16_000_000||
  !Array.isArray(payload.chunks)||payload.chunks.length<1||payload.chunks.length>200||payload.chunks.some(s=>typeof s!=='string'||s.length>CHUNK))throw Error('手账存档结构不合法');
 const bytes=gunzipSync(decode(payload.chunks.join('')));
 if(bytes.length!==payload.uncompressedBytes)throw Error('存档字节长度错误');
 if(expectedHash!==null&&('sha256:'+hex(sha256(bytes)))!==expectedHash)throw Error('存档内容指纹不匹配');
 let drafts;try{drafts=JSON.parse(strFromU8(bytes));}catch{throw Error('存档 JSON 格式错误');}
 if(!Array.isArray(drafts)||drafts.length<1||drafts.length>40)throw Error('存档方案数无效');
 drafts.forEach(d=>{attachSceneV2(d);validateSceneExtensions(d);});
 return drafts;
}
export function saveManualArchive(project,{id,date}={}){
 const {hash,payload}=archivePayload(project.drafts);
 (project.manualArchiveStore||={})[hash]||=payload;
 (project.manualArchives||=[]).push({id:id||crypto.randomUUID(),date:date||new Date().toISOString(),ref:hash,activeDraftID:project.activeDraftID});
 return hash;
}
export function restoreManualArchive(project,id){
 const entry=project.manualArchives?.find(a=>a.id===id);
 if(!entry||!project.manualArchiveStore?.[entry.ref])throw Error('手账存档不存在或已损坏');
 const drafts=readArchivePayload(project.manualArchiveStore[entry.ref],entry.ref);
 if(!drafts.some(d=>d.id===entry.activeDraftID))throw Error('手账存档活动方案丢失');
 return {drafts,activeDraftID:entry.activeDraftID};
}
export function compactManualArchiveStore(project){
 const refs=new Set((project.manualArchives||[]).map(a=>a.ref));
 for(const key of Object.keys(project.manualArchiveStore||{}))if(!refs.has(key))delete project.manualArchiveStore[key];
}
