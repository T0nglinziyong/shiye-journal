import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {creationCommandRegistry} from '../src/creation-v2-contract.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
const asset={id:'guide-fixture',title:'合成纸片',kind:'paper',physicalWidthMM:40,physicalHeightMM:50};
const length=s=>Array.from(s).length;
async function exported(policy='original',settings={},user={}){
 const p=project('指导预算');Object.assign(p,{contentPolicy:policy,...user});
 const result=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings});
 const files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));return {files,text:path=>strFromU8(files[path]),task:JSON.parse(strFromU8(files['TASK.json']))};
}
test('default reading route is bounded; reviews replace rules rather than continually append',async()=>{
 const {files,text,task}=await exported();
 const budgets={'START_HERE.md':1100,'design/GUIDE.md':1400,'design/CRAFT_GUIDE.md':350,'design/SKILL.md':1200,'design/PLAYBOOK.md':1100,'design/REVIEW.md':650,'design/GRAPHICS.md':4200,'design/LETTERING.md':4000,'design/RECIPES.md':17000};
 for(const [path,cap] of Object.entries(budgets)){assert.ok(files[path],path);assert.ok(length(text(path))<=cap,`${path}: ${length(text(path))} > ${cap}; revise/replace, do not append another manual`);}
 const first=['START_HERE.md','design/GUIDE.md','design/SKILL.md'];
 assert.ok(first.reduce((sum,path)=>sum+length(text(path)),0)<=3800,'default first read must remain compact');
 assert.ok(first.concat(['design/CRAFT_GUIDE.md','design/PLAYBOOK.md','design/REVIEW.md']).reduce((sum,path)=>sum+length(text(path)),0)<=5600,'the whole method/review route needs a fixed size budget');
 assert.equal(task.creativeBrief,undefined);assert.equal(task.creativeBriefRef,'design/GUIDE.md');
 assert.ok(files[task.creativeBriefRef]);
});
test('all shipped default guidance uses the current public operation vocabulary',async()=>{
 const {files,text}=await exported();
 for(const path of Object.keys(files).filter(path=>path.endsWith('.md'))){
  const prose=text(path);
  for(const name of prose.match(/\b(?:material|text|graphic|layer|group|layout|page|draw|shape|vector|ink)\.[A-Za-z]+\b/g)||[])
   assert.ok(['page.left','page.right'].includes(name)||creationCommandRegistry[name],`${path} advertises unknown/retired operation ${name}`);
  assert.doesNotMatch(prose,/runtime\/(?:preview|compile|apply|pack)\.cjs|instructions\.json|native\.[a-z]/,`${path} mixes old execution language`);
 }
});
test('content and processing constraints survive concise guidance for every content policy',async()=>{
 for(const policy of ['original','documentary','visual']){
  const {text,task}=await exported(policy,{}, {processing:'保留完整',providedFacts:'仅测试事实，不允许补造经历。'});
  assert.equal(task.contentPolicy,policy);assert.equal(task.processing,'保留完整');
  const guide=text('design/GUIDE.md');assert.match(guide,/不缩放实物/);assert.match(guide,/仅测试事实/);assert.match(guide,/保留完整/);
  if(policy==='visual')assert.match(guide,/不生成新增的正文/);
  if(policy==='documentary')assert.match(guide,/不补造日期/);
  if(policy==='original')assert.match(guide,/不冒充用户曾发生的经历/);
 }
});
test('instruction budgets never silently truncate explicit user text or custom direction',async()=>{
 const userText='用户自己的原文😀，不可因为指导预算而删去。'.repeat(100),customLayoutPrompt='用户专门的构图补充'.repeat(80);
 const {text,task}=await exported('documentary',{customLayoutPrompt},{userText});
 assert.equal(task.userText,userText);assert.ok(text('design/GUIDE.md').includes(userText));assert.ok(text('design/GUIDE.md').includes(customLayoutPrompt));
});
test('visual review stays evidence-based and cannot be substituted with object counts or synthetic scores',async()=>{
 const {text}=await exported();const start=text('START_HERE.md'),skill=text('design/SKILL.md'),review=text('design/REVIEW.md');
 assert.match(start,/主块与主要正文成形就 preview/);assert.match(skill,/文字、图形、材料同等参与/);
 assert.match(skill,/印刷字|印刷标题/);assert.match(review,/圈线确实圈住词/);assert.match(review,/高亮确实落在目标行/);
 assert.match(review,/区域\/对象.*可见问题.*下一步操作.*预期变化/);assert.match(review,/不是跨模型稳定质量保证/);
 assert.doesNotMatch(start+skill+review,/至少\s*[三四五六\d]+\s*(?:轮|个图形|条笔迹)/);
});

test('compact editable guidance preserves explicit no-text and spread constraints',async()=>{
 const {text,task}=await exported('original',{textMode:'none'});
 assert.equal(task.sourceContext.textMode,'none');assert.match(text('design/GUIDE.md'),/不生成新增的正文/);
 const requested=await exported('original',{textMode:'requested'});assert.match(requested.text('design/GUIDE.md'),/没有明确文字要求时不主动配文/);
});
