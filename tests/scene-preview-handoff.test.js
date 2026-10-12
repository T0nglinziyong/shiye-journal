import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';

const asset={id:'real-asset',title:'纸质贴纸',kind:'sticker',physicalWidthMM:35,physicalHeightMM:42,supply:{quantity:1}};
test('GPT ZIP requires showing a real same-scene Canvas image, not merely producing HTML/SVG',async()=>{
 const p=project('预览交付',{style:'自由构图'});p.candidateAssetIDs=[asset.id];
 const bundle=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},
   settings:{generationMode:'direct',includeThumbnails:false}});
 const zip=unzipSync(new Uint8Array(await bundle.blob.arrayBuffer()));
 for(const path of ['START_HERE.txt','task/WORKFLOW.txt','task/VISUAL_REVIEW.txt','runtime/README.txt']){
  const text=strFromU8(zip[path]);
  assert.match(text,/Canvas/,'document must distinguish real rendering: '+path);
  assert.match(text,/PNG/,'document must request a user-visible PNG: '+path);
 }
 const start=strFromU8(zip['START_HERE.txt']);
 assert.match(start,/聊天中实际展示/);
 assert.match(start,/SHIYE_RENDER_READY/);
 assert.match(start,/不能用.*\.svg/);
 assert.ok(zip['runtime/preview.cjs']);
});
