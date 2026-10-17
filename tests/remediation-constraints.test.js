import test from 'node:test';
import assert from 'node:assert/strict';
import {project,itemFromAsset} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {compileAndImport} from './web-scene-fixture.mjs';
import {applyToolCalls} from '../src/creative.js';

const asset={id:'paper-1',title:'合成条纹纸',kind:'paper',physicalWidthMM:80,physicalHeightMM:100,supply:{quantity:1}};
async function response({processing='保留完整',contentPolicy='documentary'}={}){
  const p=project('约束测试');p.processing=processing;p.contentPolicy=contentPolicy;
  const output=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{generationMode:'direct',includeThumbnails:false}});
  const page={version:2,style:'自由构图',intent:null,paper:{color:'#ffffff',pattern:'plain'},layers:[{type:'text',id:'body',content:'约束测试正文',font_style:'sans',x:.5,y:.8,width:.7,height:.1,font_size:24,color:'#30463d'},{type:'material',id:'piece-1',asset:'m1',piece:'piece-1',unit:0,role:null,operations:[{op:'crop',box:{unit:'ratio',mode:'keep',values:[0,0,.7,1]},angle:0,finish:null}],placement:{x:.5,y:.5,rotation:0,z:1},relation:null}]};
  return {envelope:{format:'shiye-editable-project',version:1,source:output.source,title:'约束测试',page},trusted:output.source};
}

test('C-01/C-02: current offline import applies global processing',async()=>{
  const blocked=await response();assert.throws(()=>compileAndImport(JSON.stringify(blocked.envelope),[asset],{trustedSource:blocked.trusted}),/保留完整/);
  const smallTrim=await response({processing:'少量裁剪'});smallTrim.envelope.page.layers[1].operations[0].box.values=[0,0,.5,.7];assert.throws(()=>compileAndImport(JSON.stringify(smallTrim.envelope),[asset],{trustedSource:smallTrim.trusted}),/60%/);
  const allowed=await response({processing:'自由拆解'});assert.equal(compileAndImport(JSON.stringify(allowed.envelope),[asset],{trustedSource:allowed.trusted}).drafts[0].items[0].cropRect.width,.7);
});

test('C-07: visual-only task rejects generated text but accepts a material-only page',async()=>{
  const current=await response({processing:'自由拆解',contentPolicy:'visual'});
  assert.throws(()=>compileAndImport(JSON.stringify(current.envelope),[asset],{trustedSource:current.trusted}),/不新增文字|不生成文字/);
  current.envelope.page.layers=current.envelope.page.layers.filter(layer=>layer.type!=='text');
  assert.equal(compileAndImport(JSON.stringify(current.envelope),[asset],{trustedSource:current.trusted}).drafts[0].items.length,1);
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

test('C-06: an opaque foreground fully covering required material is rejected, partial overlap remains legal',()=>{
  const p=project('遮挡与半藏'),d=p.drafts[0],item=itemFromAsset(asset,d,d.canvas.width/2,d.canvas.height/2);
  d.items.push(item);
  const cover={id:'solid-cover',kind:'rectangle',x:item.x,y:item.y,width:item.width,height:item.height,zIndex:item.zIndex+1,rotation:0,fill:'#ffffff',opacity:1};
  d.primitives.push(cover);
  const finish=()=>applyToolCalls({tools:[{name:'finish_design',arguments:{summary:'完成'}}]},d,[asset],{}, {requiredAssetIDs:[asset.id],allowNoText:true}).results[0];
  assert.match(finish().detail,/完全不可见/);
  cover.width=item.width/2;
  assert.equal(finish().ok,true,'intentional partial occlusion must not be rejected');
  cover.width=item.width;cover.opacity=.8;
  assert.equal(finish().ok,true,'a translucent overlay cannot prove the material is invisible');
});

test('C-02: polygon mask cannot bypass the existing 60% small-trim rule',()=>{
  const p=project('多边形裁切');
  const page={version:2,style:'自由构图',intent:null,paper:{color:'#ffffff',pattern:'plain'},layers:[{type:'material',id:'piece-1',asset:'m1',piece:'piece-1',unit:0,role:null,operations:[{op:'whole'},{op:'mask',shape:'polygon',points:[[0,0],[.2,0],[0,.2]]}],placement:{x:.5,y:.5,rotation:0,z:1},relation:null}]};
  const restricted=applyToolCalls(page,p.drafts[0],[asset],{m1:asset.id},{processing:'少量裁剪',allowNoText:true});
  assert.equal(restricted.results[0].ok,false);
  assert.match(restricted.results[0].detail,/60%/);
  const free=applyToolCalls(page,p.drafts[0],[asset],{m1:asset.id},{processing:'自由拆解',allowNoText:true});
  assert.equal(free.results[0].ok,true);
});
