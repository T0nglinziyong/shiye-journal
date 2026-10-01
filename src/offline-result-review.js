import {strFromU8} from 'fflate';
import {canonicalTaskSource} from './task-source.js';
import {sha256Hex} from './task-fingerprint.js';

export async function sceneFingerprint(scene){
  return `sha256:${await sha256Hex(new TextEncoder().encode(canonicalTaskSource(scene)))}`;
}

// A self-consistent manifest describes the external package only. It cannot
// certify that the preview was rendered by Shiye or is visually equivalent to
// the scene; that requires an independent application render and comparison.
export async function reviewExternalResultFiles(files,scene){
  const preview=files['preview.png']||files['preview.svg'];
  if(!files['manifest.json'])return {manifest:'absent',preview:'unverified',issue:preview?'外部预览没有可核对的清单':'结果包没有预览或清单'};
  let manifest;
  try{manifest=JSON.parse(strFromU8(files['manifest.json']));}catch{return {manifest:'mismatch',preview:'mismatch',issue:'manifest.json 不是有效 JSON'};}
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||manifest.version!==1)return {manifest:'mismatch',preview:'mismatch',issue:'结果清单版本或结构不受支持'};
  const expectedSceneHash=await sceneFingerprint(scene);
  const expectedPreviewHash=preview?`sha256:${await sha256Hex(preview)}`:null;
  const matches=manifest.taskId===scene.source?.bundleId&&
    manifest.taskHash===scene.source?.taskHash&&
    manifest.schemaHash===scene.source?.schemaHash&&
    manifest.sceneHash===expectedSceneHash&&
    manifest.previewHash===expectedPreviewHash;
  if(!matches)return {manifest:'mismatch',preview:'mismatch',issue:'结果清单与任务、场景或预览字节不一致'};
  return {manifest:'self-consistent',preview:'unverified',issue:'清单字节一致；仍须由拾页独立渲染并核对预览与正文'};
}
