import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {offlineCreationPlanningData,offlineCreationWorkflowText} from '../src/offline-creation-workflow.js';
import {offlineBrowserPage} from '../src/offline-browser-page.js';

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

test('each task mode is explicitly unique and cannot instruct both page and tools',async()=>{
 for(const mode of ['direct','agent']){
   const {task,files}=await unpack({generationMode:mode});
   const start=strFromU8(files['START_HERE.txt']);
   const workflow=strFromU8(files['task/WORKFLOW.txt']);
   const insights=JSON.parse(strFromU8(files['task/material-planning.json']));
   const checklist=strFromU8(files['task/VISUAL_REVIEW.txt']);
   const example=JSON.parse(strFromU8(files['examples/project.shiyeproject.json']));
   assert.match(start,/task\/WORKFLOW\.txt/);
   assert.match(start,/画面预览\.html/);
   assert.match(workflow,/观察|关系/);
   assert.match(checklist,/同源|Canvas/);
   assert.equal(insights.mode,mode);
   if(mode==='direct'){
     assert.ok(example.page);assert.equal(example.tools,undefined);
     assert.match(workflow,/不输出 tools\/plan/);
     assert.match(start,/高级 observations\/weaves 不可混入/);
   }else{
     assert.ok(example.tools);assert.equal(example.page,undefined);
     assert.match(workflow,/不输出 page 或额外顶层 plan/);
     assert.match(start,/只包含本合同的 tools/);
   }
   assert.equal(importEditableWork(JSON.stringify(example),assets,{trustedSource:task.source}).isDraft,true);
 }
});

test('HTML renderer accepts same-task WebP and clearly requires visual inspection',()=>{
 const bytes=new Uint8Array([82,73,70,70,12,0,0,0,87,69,66,80,86,80,56,32]);
 const html=offlineBrowserPage({items:[],canvas:{width:1000,height:1000}},{
   materials:[{alias:'m1',assetID:'a1'}]
 },{m1:bytes},'window.ShiyeScene={render:async()=>({})};');
 assert.match(html,/data:image\/webp;base64,/);
 assert.match(html,/检查文字/);
 assert.match(html,/data-render-state/);
 assert.match(html,/渲染失败/);
 assert.doesNotMatch(html,/http:\/\/|https:\/\//);
});

test('direct and agent notes only claim browser-manual visual review',()=>{
 assert.match(offlineCreationWorkflowText({mode:'direct'}),/高级 plan\.observations.*不属于 direct/);
 assert.match(offlineCreationWorkflowText({mode:'agent'}),/apply_craft_plan/);
 assert.doesNotMatch(offlineCreationWorkflowText({mode:'direct'}),/输出只能是一个含 tools/);
});
