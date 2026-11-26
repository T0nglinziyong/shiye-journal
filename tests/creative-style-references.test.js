import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {tinyPNG} from './offline-canvas-test-support.mjs';
import {loadStyleReferences,attachStyleReferences} from '../creative-agent/runtime/style-references.mjs';

test('private style references are hash checked, direction scoped and attached only to new state',async()=>{
 const root=await mkdtemp(join(tmpdir(),'shiye-references-'));
 try{
  const row={file:'case.png',sha256:'sha256:'+createHash('sha256').update(tinyPNG).digest('hex')};
  await writeFile(join(root,'case.png'),tinyPNG);
  const manifest={version:1,styles:['丰富层叠'],references:[row]};
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest));
  const refs=await loadStyleReferences({root,styles:['丰富层叠']});
  assert.equal(refs.records.length,1);assert.match(refs.parts[1].image_url.url,/^data:image\/jpeg;base64,/);
  assert.deepEqual(await loadStyleReferences({root,styles:['疏朗']}),{parts:[],records:[]});
  const state={messages:[{role:'system',content:'rules'},{role:'user',content:'task'}]};
  attachStyleReferences(state,refs);assert.equal(state.messages.length,3);assert.equal(state.messages[1].content,'task');
  const ordered={messages:[{role:'system',content:'rules'},{role:'user',content:[{type:'text',text:'通用创作知识'},{type:'text',text:'本次任务'},{type:'image_url',image_url:{url:'data:image/png;base64,source'}}]}]};
  attachStyleReferences(ordered,refs);
  assert.equal(ordered.messages.length,2);
  assert.equal(ordered.messages[1].content[0].text,'通用创作知识');
  assert.match(ordered.messages[1].content[1].text,/案例/);
  assert.match(ordered.messages[1].content[2].image_url.url,/^data:image\/jpeg/);
  assert.equal(ordered.messages[1].content[3].text,'本次任务');
  assert.equal(attachStyleReferences(undefined,refs),undefined);
  await writeFile(join(root,'case.png'),Buffer.concat([tinyPNG,Buffer.from('changed')]));
  await assert.rejects(()=>loadStyleReferences({root,styles:['丰富层叠']}),/指纹/);
  manifest.references=[{...row,file:'../case.png'}];await writeFile(join(root,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(()=>loadStyleReferences({root,styles:['丰富层叠']}),/路径/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('new creative context keeps shared knowledge and examples before task data',async()=>{
 const {draft}=await import('../src/domain.js');
 const {createCreationDocument}=await import('../src/creation-document.js');
 const {loadCreationSkills}=await import('../creative-agent/runtime/skills.mjs');
 const {initialHarnessState}=await import('../creative-agent/runtime/agent.mjs');
 const document=await createCreationDocument({draft:draft(),assets:[],styles:['自动安排']});
 const state=initialHarnessState({document,skills:await loadCreationSkills(),brief:{style:'自动安排',intent:'写今天的手帐'}});
 const fixed=state.messages[0].content;
 assert.match(fixed,/画布操作合同（由执行定义生成）/);
 assert.ok(!fixed.includes('写今天的手帐'));
 attachStyleReferences(state,{records:[{file:'case.png'}],parts:[{type:'text',text:'案例学习重点'},{type:'image_url',image_url:{url:'data:image/png;base64,example'}}]});
 assert.equal(state.messages.length,2);
 assert.match(state.messages[1].content[0].text,/通用创作知识/);
 assert.equal(state.messages[1].content[1].text,'案例学习重点');
 assert.equal(state.messages[1].content[2].type,'image_url');
 assert.match(state.messages[1].content[3].text,/本次任务/);
 assert.ok(!state.messages[1].content[3].text.includes('匹配的案例参考'));
});
