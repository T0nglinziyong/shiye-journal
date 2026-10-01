import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8} from 'fflate';
import {createNativeProjectPackage,importNativeProjectPackage} from '../src/native-project-package.js';
import {createOfflineHandoff,importEditableWork,importEditableWorkPackage,importEditableWorkPackageReviewed} from '../src/offline-creation.js';
import {sceneFingerprint} from '../src/offline-result-review.js';
import {sha256Hex} from '../src/task-fingerprint.js';
import {project,draft} from '../src/domain.js';
import {captureHistory,restoreHistoryDraft} from '../src/project-history.js';

const bytes=async blob=>new Uint8Array(await blob.arrayBuffer());

test('I-03: ambiguous scene entries and traversal paths reject before import',()=>{
  const p=project('合成作品');
  const native=strToU8(JSON.stringify({format:'shiye-native-project',version:1,project:p}));
  const editable=strToU8('{}');
  assert.throws(()=>importEditableWorkPackage(zipSync({'native.shiyeproject.json':native,'project.shiyeproject.json':editable}),[]),/两个场景入口/);
  assert.throws(()=>importNativeProjectPackage(zipSync({'../escape.txt':strToU8('bad'),'native.shiyeproject.json':native}),[]),/危险路径/);
  assert.equal(importNativeProjectPackage(zipSync({'materials/':new Uint8Array(),'native.shiyeproject.json':native}),[]).title,p.title);
});

test('I-01: editable JSON rejects prototype keys before processing tools',async()=>{
  const asset={id:'asset-safe',title:'安全贴纸',kind:'sticker',physicalWidthMM:25,physicalHeightMM:25,supply:{quantity:1}};
  const handoff=await createOfflineHandoff({project:project('安全任务'),assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  const source=JSON.stringify(handoff.source);
  const text=`{"format":"shiye-editable-project","version":1,"source":${source},"title":"作品","__proto__":{"isAdmin":true},"tools":[]}`;
  assert.throws(()=>importEditableWork(text,[asset]),/不安全字段/);
});

test('O-01: exported task source does not mutate when matching preferences change later',async()=>{
  const asset={id:'asset-freeze',title:'蓝纸',kind:'sticker',physicalWidthMM:25,physicalHeightMM:25,supply:{quantity:1}};
  const p=project('冻结任务');p.styles=['韩系清新'];p.requiredAssetIDs=[asset.id];p.assetProcessing={[asset.id]:'少量裁剪'};
  const result=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  p.styles[0]='复古旧物';p.requiredAssetIDs.length=0;p.assetProcessing[asset.id]='自由拆解';
  assert.deepEqual(result.source.styles,['韩系清新']);
  assert.deepEqual(result.source.requiredAssetIDs,[asset.id]);
  assert.equal(result.source.assetProcessing[asset.id],'少量裁剪');
});

test('I-04: second active draft and immutable history survive ID remapping',async()=>{
  const p=project('两种方案');
  const second=draft();second.textBlocks.push({id:'text-second',content:'第二方案',x:100,y:100,width:180,height:100});
  p.drafts.push(second);p.activeDraftID=second.id;
  captureHistory(p);
  second.textBlocks[0].content='已经编辑';
  const restored=importNativeProjectPackage(await bytes(createNativeProjectPackage(p)),[]);
  assert.equal(restored.drafts.length,2);
  assert.equal(restored.activeDraftID,restored.drafts[1].id);
  assert.notEqual(restored.drafts[1].id,second.id);
  assert.notEqual(restored.drafts[1].textBlocks[0].id,'text-second');
  assert.ok(restored.draftHistorySnapshots[restored.activeDraftID]);
  restoreHistoryDraft(restored,restored.activeDraftID);
  assert.equal(restored.drafts[1].textBlocks[0].content,'第二方案');
});

test('D-05: account sync cursor metadata never enters a portable project package',async()=>{
  const p=project('可携带作品');p.__cloudBaseRevision=17;p.__cloudSessionId='editor-only';
  const packed=await bytes(createNativeProjectPackage(p));
  const entry=JSON.parse(new TextDecoder().decode(unzipSync(packed)['native.shiyeproject.json']));
  assert.equal(entry.project.__cloudBaseRevision,undefined);
  assert.equal(entry.project.__cloudSessionId,undefined);
  assert.equal(importNativeProjectPackage(packed,[]).__cloudBaseRevision,undefined);
  assert.equal(importNativeProjectPackage(packed,[]).__cloudSessionId,undefined);
});

test('I-01/I-02: external IDs are rebuilt and invalid geometry is rejected',async()=>{
  const p=project('安全文本 <3');
  p.drafts[0].textBlocks.push({id:'x" onclick="alert(1)',content:'A < B',x:50,y:60,width:100,height:40});
  const imported=importNativeProjectPackage(await bytes(createNativeProjectPackage(p)),[]);
  assert.equal(imported.drafts[0].textBlocks[0].content,'A < B');
  assert.match(imported.drafts[0].textBlocks[0].id,/^[a-f0-9-]{36}$/i);
  p.drafts[0].textBlocks[0].width=-1;
  assert.throws(()=>importNativeProjectPackage(zipSync({'native.shiyeproject.json':strToU8(JSON.stringify({format:'shiye-native-project',version:1,project:p}))}),[]),/几何/);
});

test('O-14: a supplied preview cannot mark an imported editable scene as visually verified',async()=>{
  const asset={id:'preview-asset',title:'素材',kind:'sticker',physicalWidthMM:25,physicalHeightMM:25,supply:{quantity:1}};
  const handoff=await createOfflineHandoff({project:project('预览校验'),assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  const files=unzipSync(await bytes(handoff.blob));
  const response=JSON.parse(new TextDecoder().decode(files['example-response.shiyeproject.json']));
  response.previewVerified=true;response.manifest={reviewed:true};
  const imported=importEditableWork(JSON.stringify(response),[asset],{trustedSource:handoff.source});
  assert.equal(imported.creationVerification.preview,'unverified');
  assert.equal(imported.creationVerification.reading,'pending');
});

test('O-14/O-16: a self-consistent external manifest is advisory; wrong previews retain the editable draft',async()=>{
  const asset={id:'manifest-asset',title:'小纸片',kind:'sticker',physicalWidthMM:25,physicalHeightMM:25,supply:{quantity:1}};
  const handoff=await createOfflineHandoff({project:project('结果清单'),assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  const task=unzipSync(await bytes(handoff.blob));
  const scene=JSON.parse(new TextDecoder().decode(task['example-response.shiyeproject.json']));
  const preview=new Uint8Array([137,80,78,71,1,2,3,4]);
  const manifest={version:1,taskId:scene.source.bundleId,taskHash:scene.source.taskHash,schemaHash:scene.source.schemaHash,sceneHash:await sceneFingerprint(scene),previewHash:`sha256:${await sha256Hex(preview)}`};
  const makePackage=image=>zipSync({'project.shiyeproject.json':strToU8(JSON.stringify(scene)),'preview.png':image,'manifest.json':strToU8(JSON.stringify(manifest))});
  const consistent=await importEditableWorkPackageReviewed(makePackage(preview),[asset],{trustedSource:handoff.source});
  assert.equal(consistent.creationVerification.manifest,'self-consistent');
  assert.equal(consistent.creationVerification.preview,'unverified','an external self-hash cannot prove visual equivalence');
  const mismatched=await importEditableWorkPackageReviewed(makePackage(new Uint8Array([137,80,78,71,9,9,9,9])),[asset],{trustedSource:handoff.source});
  assert.equal(mismatched.drafts[0].items.length,1);
  assert.equal(mismatched.creationVerification.manifest,'mismatch');
  assert.equal(mismatched.creationVerification.preview,'mismatch');
  assert.equal(mismatched.creationVerification.reading,'pending');
});
