import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {offlineCreationPlanningData} from '../src/offline-creation-workflow.js';
import {offlineBrowserPage} from '../src/offline-browser-page.js';
import {auditOfflineCanvasDraft} from '../src/offline-canvas-audit.js';

const assets=[
 {id:'a1',title:'素材 1',kind:'sticker',role:'focal',physicalWidthMM:35,physicalHeightMM:45,supply:{quantity:1}},
 {id:'a2',title:'素材 2',kind:'photo',role:'focal',physicalWidthMM:80,physicalHeightMM:65,supply:{quantity:1}}
];
const data=()=>{
 const selected=assets.map((a,i)=>({alias:'m'+(i+1),assetID:a.id,title:a.title,kind:a.kind,role:a.role,
   physicalWidthMM:a.physicalWidthMM,physicalHeightMM:a.physicalHeightMM,quantity:1,tags:[]}));
 return offlineCreationPlanningData({},selected,{mode:'agent',hasImages:true});
};
const unpack=async settings=>{
 const task=await createOfflineHandoff({project:project('场景测试'),assets,aliases:{m1:'a1',m2:'a2'},
   settings:{includeThumbnails:false,...settings}});
 return {task,files:unzipSync(new Uint8Array(await task.blob.arrayBuffer()))};
};

test('planning information distinguishes evidence from visual hypotheses',()=>{
 const plan=data();
 assert.equal(plan.cards.length,2);assert.equal(plan.pairings.length,1);
 assert.equal(plan.pairings[0].status,'unverified-visual-hypothesis');
 assert.ok(plan.cards[0].inspect.includes('透明边缘及可裁区域'));
 assert.ok(plan.alternatives.some(item=>item.name==='场景叙事'));
 assert.equal(plan.cards[0].title,'素材 1');
 assert.doesNotMatch(JSON.stringify(plan),/山水|蝴蝶|人物/);
});

test('web exports one Scene protocol regardless of API generation preference',async()=>{
 for(const mode of ['direct','agent']){
   const {task,files}=await unpack({generationMode:mode});
   const start=strFromU8(files['START_HERE.txt']);
   const workflow=strFromU8(files['task/WORKFLOW.txt']);
   const insights=JSON.parse(strFromU8(files['task/material-planning.json']));
   const checklist=strFromU8(files['task/VISUAL_REVIEW.txt']);
   const example=JSON.parse(strFromU8(files['examples/project.shiyeproject.json']));
   assert.match(start,/task\/WORKFLOW\.txt/);
   assert.match(start,/output\/preview\.png/);
   assert.doesNotMatch(start,/画面预览\.html|SHIYE_EXPORT_PREVIEW/);
   assert.match(workflow,/观察|关系/);
   assert.match(checklist,/同源|Canvas/);
   assert.equal(insights.mode,'scene');
   assert.ok(example.page);assert.equal(example.tools,undefined);
   assert.equal(example.page.sceneVersion,2);
   assert.match(workflow,/工具和 Craft Plan 都是修改它的输入/);
   assert.ok(files['schema/tools.json']);
   assert.equal(importEditableWork(JSON.stringify(example),assets,{trustedSource:task.source}).isDraft,true);
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
