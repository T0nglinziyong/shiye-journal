import test from 'node:test';
import assert from 'node:assert/strict';
import {project,itemFromAsset} from '../src/domain.js';
import {exportSceneDocument,importSceneDocument} from '../src/scene-io.js';

const asset={id:'scene-material-a',title:'原始实体贴纸',kind:'sticker',
  physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
function editable(){
 const p=project('春天手帐',{mode:'single',ratio:'a4'}),d=p.drafts[0];
 const item=itemFromAsset(asset,d,180,240);
 item.vectorMask={outer:[[0,0],[1,0],[1,1],[0,1]],holes:[]};
 item.blendMode='multiply';d.items.push(item);
 return p;
}
test('portable Scene is the exact Draft used by the editor, with physical material references',()=>{
 const p=editable(),doc=exportSceneDocument(p);
 assert.equal(doc.format,'shiye-scene');assert.equal(doc.version,1);
 assert.equal(doc.title,'春天手帐');
 assert.deepEqual(doc.scene,p.drafts[0]);
 const restored=importSceneDocument(JSON.stringify(doc),[asset]);
 assert.equal(restored.activeDraftID,doc.scene.id);
 assert.equal(restored.drafts[0].items[0].assetID,asset.id);
 assert.deepEqual(restored.drafts[0].items[0].vectorMask,doc.scene.items[0].vectorMask);
 assert.equal(restored.drafts[0].items[0].blendMode,'multiply');
 assert.equal(restored.isDraft,true);
});
test('import rejects forged physical enlargement and missing source assets',()=>{
 const doc=exportSceneDocument(editable());
 doc.scene.items[0].width*=2;
 assert.throws(()=>importSceneDocument(doc,[asset]),/实物尺寸与来源不一致/);
 const valid=exportSceneDocument(editable());
 assert.throws(()=>importSceneDocument(valid,[]),/不存在的素材/);
});
test('editable Scene export cannot transform bitmap snapshots into layers',()=>{
 const p=editable();p.isSnapshot=true;
 assert.throws(()=>exportSceneDocument(p),/快照不能/);
});
