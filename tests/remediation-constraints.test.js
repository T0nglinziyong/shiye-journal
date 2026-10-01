import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project,itemFromAsset} from '../src/domain.js';
import {createOfflineCreationPackage,importEditableWork} from '../src/offline-creation.js';
import {applyToolCalls} from '../src/creative.js';

const asset={id:'paper-1',title:'合成条纹纸',kind:'paper',physicalWidthMM:80,physicalHeightMM:100,supply:{quantity:1}};
async function response(){
  const output=createOfflineCreationPackage({project:project('约束测试'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:new Uint8Array([1,2,3])}]});
  const files=unzipSync(new Uint8Array(await output.blob.arrayBuffer()));
  return JSON.parse(strFromU8(files['example-response.json']));
}

test('C-01/C-02: offline import applies global and per-material processing',async()=>{
  const base=await response();
  base.tools[0].arguments.materials[0].crop=[0,0,.7,1];
  assert.throws(()=>importEditableWork(JSON.stringify(base),[asset]),/保留完整/);
  base.source.processing='自由拆解';
  base.source.assetProcessing={[asset.id]:'保留完整'};
  assert.throws(()=>importEditableWork(JSON.stringify(base),[asset]),/保留完整/);
  base.source.assetProcessing={};
  assert.equal(importEditableWork(JSON.stringify(base),[asset]).drafts[0].items[0].cropRect.width,.7);
});

test('C-07: no-text mode rejects new generated text without deleting printed asset text',async()=>{
  const base=await response();
  base.source.textMode='none';
  assert.throws(()=>importEditableWork(JSON.stringify(base),[asset]),/不新增文字/);
  base.tools[0].arguments.texts=[];
  assert.equal(importEditableWork(JSON.stringify(base),[asset]).drafts[0].items.length,1);
});

test('C-06: a required material outside the page or fully transparent cannot finish',()=>{
  const p=project('合成可见性'),d=p.drafts[0],item=itemFromAsset(asset,d,100,100);
  d.items.push(item);
  const finish=()=>applyToolCalls({tools:[{name:'finish_design',arguments:{summary:'完成'}}]},d,[asset],{}, {requiredAssetIDs:[asset.id],allowNoText:true}).results[0];
  item.opacity=0;
  assert.match(finish().detail,/不可见/);
  item.opacity=1;item.x=d.canvas.width+item.width;
  assert.match(finish().detail,/不可见/);
  item.x=d.canvas.width-item.width/4;
  assert.equal(finish().ok,true,'partial intentional bleed remains legal');
});

test('C-02: polygon mask cannot bypass the existing 60% small-trim rule',()=>{
  const p=project('多边形裁切');
  const page={version:3,style:'自由构图',intent:null,paper:{color:'#ffffff',pattern:'plain'},graphics:[],text_blocks:[],items:[{asset:'m1',piece:'piece-1',unit:0,role:null,operations:[{op:'whole'},{op:'mask',shape:'polygon',points:[[0,0],[.2,0],[0,.2]]}],placement:{x:.5,y:.5,rotation:0,z:1},relation:null}]};
  const restricted=applyToolCalls(page,p.drafts[0],[asset],{m1:asset.id},{processing:'少量裁剪',allowNoText:true});
  assert.equal(restricted.results[0].ok,false);
  assert.match(restricted.results[0].detail,/60%/);
  const free=applyToolCalls(page,p.drafts[0],[asset],{m1:asset.id},{processing:'自由拆解',allowNoText:true});
  assert.equal(free.results[0].ok,true);
});
