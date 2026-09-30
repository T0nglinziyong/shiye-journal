import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMaterialPreviews} from '../src/creative-previews.js';
import {buildCreativeMessages} from '../src/creative-runner.js';
import {draft} from '../src/domain.js';
import {materialAlias,materialAliases} from '../src/material-alias.js';

test('all permitted materials are previewed in alias order without overloading image decoding',async()=>{
 const ids=Array.from({length:12},(_,i)=>'asset-'+i);let active=0,peak=0;
 const previews=await prepareMaterialPreviews(ids,{findAsset:id=>({id,title:id}),createImage:async a=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return 'data:image/png;base64,'+a.id;}});
 assert.equal(previews.length,12);assert.deepEqual(previews.map(p=>p.asset),ids.map(materialAlias));assert.ok(peak<=3);
 const aliases=materialAliases(ids);
 const messages=buildCreativeMessages({draft:draft(),assets:ids.map(id=>({id,title:id,kind:'sticker',physicalWidthMM:20,physicalHeightMM:20})),aliases,images:previews});
 assert.equal(messages[1].content.filter(part=>part.type==='image_url').length,12);
});

test('missing preview stops creation instead of silently omitting a selected material',async()=>{
 await assert.rejects(prepareMaterialPreviews(['a'],{findAsset:id=>({id,title:'纸片'}),createImage:async()=>null}),/预览图不可用/);
});
