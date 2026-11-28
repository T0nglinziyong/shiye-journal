import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from './v3-test-handoff.mjs';

const asset={id:'real-asset',title:'纸质贴纸',kind:'sticker',physicalWidthMM:35,physicalHeightMM:42,supply:{quantity:1}};
test('GPT ZIP requires a real same-scene Node Canvas PNG and editable JSON',async()=>{
 const p=project('预览交付',{style:'自由构图'});p.candidateAssetIDs=[asset.id];
 const bundle=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},
   settings:{generationMode:'direct',includeThumbnails:false}});
 const zip=unzipSync(new Uint8Array(await bundle.blob.arrayBuffer()));
 for(const path of ['START_HERE.md']){
  const text=strFromU8(zip[path]);
  assert.match(text,/Canvas/,'document must distinguish real rendering: '+path);
  assert.match(text,/PNG/,'document must request a user-visible PNG: '+path);
 }
 const start=strFromU8(zip['START_HERE.md']);
 assert.match(start,/打开 output\/preview\.png/);
 assert.match(start,/project\.shiyeproject\.json/);
 assert.doesNotMatch(start,/SHIYE_RENDER_READY|画面预览\.html/);
 assert.ok(zip['runtime/shiye.cjs']);
});
