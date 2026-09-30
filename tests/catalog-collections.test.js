import test from 'node:test';
import assert from 'node:assert/strict';
import {pageSize,pageSlice} from '../src/catalog-pagination.js';
import {WORK_TABS,workInTab,snapshotRecord} from '../src/work-collections.js';
import {styleGroups,purposeGroups,selectedDirections} from '../src/matching-directions.js';
import {createNativeProjectPackage,importNativeProjectPackage} from '../src/native-project-package.js';
import {project,itemFromAsset} from '../src/domain.js';
import {applyToolCalls} from '../src/creative.js';
import {buildCreativeMessages} from '../src/creative-runner.js';

test('page controls clamp input while counts remain independent of the page',()=>{
  assert.equal(pageSize(0),0);assert.equal(pageSize(40),40);assert.equal(pageSize(13),0);
  assert.deepEqual(pageSlice(85,40,3),{current:3,count:3,start:80,end:120});
  assert.deepEqual(pageSlice(85,40,99),{current:3,count:3,start:80,end:120});
  assert.deepEqual(pageSlice(85,0,1),{current:1,count:1,start:0,end:85});
});
test('snapshot and editable works never share a tab',()=>{
  const picture=snapshotRecord({title:'一页画面',previewBlobId:'preview',width:800,height:1200});
  assert.deepEqual(WORK_TABS.map(([tab])=>workInTab(picture,tab)),[true,false,false,false]);
  assert.deepEqual(WORK_TABS.map(([tab])=>workInTab({...picture,isSnapshot:false,isDraft:false},tab)),[false,true,false,false]);
  assert.deepEqual(WORK_TABS.map(([tab])=>workInTab({...picture,isSnapshot:false,isDraft:true},tab)),[false,false,true,false]);
});
test('style and purpose groups are disjoint and allow no preset',()=>{
  const all=styleGroups.flatMap(group=>group.options);assert.equal(new Set(all).size,all.length);
  const uses=purposeGroups.flatMap(group=>group.options);assert.equal(new Set(uses).size,uses.length);
  assert.deepEqual(selectedDirections(styleGroups,['韩系清新','极简留白','不存在']),['韩系清新','极简留白']);
  assert.deepEqual(selectedDirections(purposeGroups,[]),[]);
});
test('ZIP project retains editable layers and rejects missing local assets',async()=>{
  const asset={id:'owned-asset',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
  const source=project('可编辑包');source.drafts[0].items.push(itemFromAsset(asset,source.drafts[0],100,100));
  const zipped=createNativeProjectPackage(source),bytes=new Uint8Array(await zipped.arrayBuffer());
  const imported=importNativeProjectPackage(bytes,[asset]);
  assert.notEqual(imported.id,source.id);assert.equal(imported.isDraft,true);
  assert.equal(imported.drafts[0].items[0].assetID,asset.id);
  assert.throws(()=>importNativeProjectPackage(bytes,[]),/不存在的素材/);
});
test('direct JSON and ZIP preserve crop, organic vectors, pen, marker, text and page geometry',async()=>{
  const asset={id:'owned-asset',title:'纸片',kind:'paper',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
  const source=project('图文层次');
  const page={version:3,style:'自由构图',intent:'纸片与笔迹互相呼应',paper:{color:'#fdf9ed',pattern:'lined'},
    items:[{asset:asset.id,piece:'paper-piece',unit:0,role:'support',operations:[{op:'crop',box:{unit:'ratio',mode:'keep',values:[0,0,.5,1]},angle:0,finish:null}],placement:{x:.25,y:.35,rotation:8,z:10},relation:null}],
    graphics:[{key:'under-text',kind:'roundedRectangle',x:.62,y:.66,width:.52,height:.19,fill:'#f8e787',stroke:null,z:30,opacity:.5},{key:'leaf',kind:'vector',x:.72,y:.34,width:.12,height:.10,fill:'#a0bd8e',stroke:'#52734e',vector_paths:[[[0,.5],[.4,0],[1,.5],[.4,1]]],z:40}],
    text_blocks:[{content:'在纸片旁写下观察\n让颜色牵起画面',font_style:'hand',x:.62,y:.66,width:.48,height:.16,font_size:24,color:'#30463d',line_spacing:4,z:50}],
    ink_strokes:[{points:[{x:.2,y:.57},{x:.35,y:.56},{x:.47,y:.59}],width:3,color:'#5278a7',pen_style:'brush'},{points:[{x:.43,y:.73},{x:.58,y:.73}],width:14,color:'#ffde55',pen_style:'marker',opacity:.3}]};
  const result=applyToolCalls(page,source.drafts[0],[asset]);
  assert.deepEqual(result.results.map(entry=>entry.ok),[true]);
  assert.equal(result.draft.items[0].cropRect.width,.5);
  assert.equal(result.draft.primitives[1].vectorPaths.length,1);
  assert.equal(result.draft.textBlocks[0].style,'hand');
  assert.equal(result.draft.strokes[1].penStyle,'marker');
  assert.equal(result.draft.strokes[1].points[0].x,result.draft.canvas.width*.43);
  source.drafts[0]=result.draft;
  const zipped=createNativeProjectPackage(source),imported=importNativeProjectPackage(new Uint8Array(await zipped.arrayBuffer()),[asset]);
  assert.deepEqual(imported.drafts[0].strokes,result.draft.strokes);
  assert.deepEqual(imported.drafts[0].primitives[1].vectorPaths,result.draft.primitives[1].vectorPaths);
  assert.equal(imported.drafts[0].primitives[0].opacity,.5);
  assert.equal(imported.drafts[0].textBlocks[0].content,result.draft.textBlocks[0].content);
  const invalid=structuredClone(page);invalid.ink_strokes[0].points[0].x=1.2;
  assert.throws(()=>applyToolCalls(invalid,source.drafts[0],[asset]),/合同不合法/);
});
test('snapshot prompt leaves composition open while editable prompt advertises layered methods',()=>{
  const base=project('测试').drafts[0],image=buildCreativeMessages({draft:base,assets:[],aliases:{},generationMode:'direct',deliveryMode:'image'});
  assert.match(image[0].content,/不设素材数量、留白、密度/);
  assert.doesNotMatch(image[0].content,/每轮以实际画布/);
  const editable=buildCreativeMessages({draft:base,assets:[],aliases:{},generationMode:'direct',deliveryMode:'json'});
  assert.match(editable[0].content,/ink_strokes/);
  assert.match(editable[0].content,/文字围绕图片侧边/);
});
