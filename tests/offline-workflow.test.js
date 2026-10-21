import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from './v3-test-handoff.mjs';
import {offlineBrowserPage} from '../src/offline-browser-page.js';
import {auditOfflineCanvasDraft} from '../src/offline-canvas-audit.js';

const assets=[
 {id:'a1',title:'素材 1',kind:'sticker',role:'focal',physicalWidthMM:35,physicalHeightMM:45,supply:{quantity:1}},
 {id:'a2',title:'素材 2',kind:'photo',role:'focal',physicalWidthMM:80,physicalHeightMM:65,supply:{quantity:1}}
];
const unpack=async settings=>{
 const task=await createOfflineHandoff({project:project('场景测试'),assets,aliases:{m1:'a1',m2:'a2'},
   settings:{includeThumbnails:false,...settings}});
 return {task,files:unzipSync(new Uint8Array(await task.blob.arrayBuffer()))};
};

test('web exports one v3 Scene protocol regardless of API generation preference',async()=>{
 for(const mode of ['direct','agent']){
  const {task,files}=await unpack({generationMode:mode});
  const start=strFromU8(files['START_HERE.md']);
  const guide=strFromU8(files['design/GUIDE.md']);
  const scene=JSON.parse(strFromU8(files['scene.json']));
  assert.equal(files['task/material-planning.json'],undefined);
  assert.equal(files['task/knowledge.json'],undefined);
  assert.match(start,/TASK\.json/);assert.match(start,/work\/commands\.json/);
  assert.match(start,/output\/preview\.png/);
  assert.doesNotMatch(start,/画面预览\.html|SHIYE_EXPORT_PREVIEW/);
  assert.match(start,/scene\.json 是唯一作品/);
  assert.match(guide,/实际画面/);
  assert.equal(scene.page.sceneVersion,2);assert.equal(scene.tools,undefined);
  assert.ok(files['api/commands.schema.json']);
  assert.equal(importEditableWork(JSON.stringify(scene),assets,{trustedSource:task.source}).isDraft,true);
 }
});

test('HTML renderer accepts same-task WebP and clearly requires visual inspection',()=>{
 const bytes=new Uint8Array([82,73,70,70,12,0,0,0,87,69,66,80,86,80,56,32]);
 const html=offlineBrowserPage({items:[],canvas:{width:1000,height:1000}},{
   materials:[{alias:'m1',assetID:'a1'}]
 },{m1:bytes},'window.ShiyeScene={render:async()=>({})};');
 assert.match(html,/data:image\/webp;base64,/);
 assert.match(html,/中文字体/);
 assert.match(html,/dataset\.renderState/);
 assert.match(html,/渲染失败/);
 assert.doesNotMatch(html,/http:\/\/|https:\/\//);
});

test('same-renderer font wrapping produces useful warnings, not false visual approval',()=>{
 const draft={canvas:{width:1000,height:1000},items:[],primitives:[],
   textBlocks:[{content:'很多很多文字需要换行并且超出文字框',fontSize:22,style:'sans',
     width:30,height:10,x:200,y:200,paragraphSpacing:0}]};
 const result=auditOfflineCanvasDraft(draft,{createCanvas:()=>({
   getContext:()=>({font:'',measureText:text=>({width:text.length*22})})
 })});
 assert.equal(result.textOverflows,1);
 assert.equal(result.reviewRequired,true);
 assert.ok(result.warnings.some(note=>note.includes('预计超出文本框')));
});
