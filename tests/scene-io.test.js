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

test('nested Scene v2 cannot duplicate the same physical sticker unit through groups',()=>{
 const data=exportSceneDocument(editable());
 const original=data.scene.layers[0];
 data.scene.layers=[{
   type:'group',id:'fake-group',name:'重复实体',
   children:[original,{...structuredClone(original),id:'duplicated-paper',x:original.x+100}]
 }];
 assert.throws(()=>importSceneDocument(data,[asset]),/裁片重叠|重复使用|库存|SOURCE_REGION_OVERLAP/);
});
test('groups and pen strokes survive canonical JSON export and import without legacy leaf arrays',()=>{
 const p=editable(),d=p.drafts[0],piece=d.layers[0];
 d.layers=[{type:'group',id:'source-group',name:'纸张和笔记',children:[piece,{
   type:'ink',id:'ink-one',points:[{x:20,y:30,p:.5},{x:25,y:40,p:.8}],
   width:3,color:'#315678',zIndex:20
 }]}];
 const doc=exportSceneDocument(p),json=JSON.stringify(doc);
 assert.equal(json.includes('"textBlocks"'),false);
 assert.equal(json.includes('"strokes"'),false);
 const restored=importSceneDocument(json,[asset]);
 assert.equal(restored.drafts[0].layers[0].children.length,2);
 assert.equal(restored.drafts[0].layers[0].children[1].type,'ink');
});
