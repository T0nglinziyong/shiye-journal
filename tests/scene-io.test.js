import test from 'node:test';import assert from 'node:assert/strict';
import {project,itemFromAsset} from '../src/domain.js';
import {exportSceneDocument,importSceneDocument} from '../src/scene-io.js';
const asset={id:'scene-material-a',title:'实物贴纸',kind:'sticker',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
const editable=()=>{
 const p=project('春天手帐'),d=p.drafts[0],item=itemFromAsset(asset,d,180,240);
 item.blendMode='multiply';d.items.push(item);return p;
};
test('portable Scene v2 round trip preserves a single recursive layer tree',()=>{
 const document=exportSceneDocument(editable());assert.equal(document.version,2);
 assert.ok(Array.isArray(document.scene.layers));
 assert.equal(Object.hasOwn(document.scene,'items'),false);
 const restored=importSceneDocument(document,[asset]);
 assert.equal(restored.drafts[0].items[0].assetID,asset.id);
 assert.equal(restored.drafts[0].layers[0].type,'material');
});
test('import rejects forged physical scale and missing source materials',()=>{
 const data=exportSceneDocument(editable());data.scene.layers[0].width*=2;
 assert.throws(()=>importSceneDocument(data,[asset]),/实物尺寸与来源不一致/);
 const valid=exportSceneDocument(editable());
 assert.throws(()=>importSceneDocument(valid,[]),/不存在的素材/);
});
