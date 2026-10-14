import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {createHash} from 'node:crypto';
import {project} from '../src/domain.js';
import {createOfflineHandoff,verifyOfflineTaskPackage,importEditableWork,importEditableWorkPackage,EDITABLE_WORK_FORMAT,EDITABLE_PACKAGE_ENTRY,inspectOfflinePackage} from '../src/offline-creation.js';
import {shapeSVG} from '../src/editor-tools-model.js';
import {presetReferenceGuide,presetReferencePlans} from '../src/creative-reference-presets.js';
import {selectJournalReferenceCases} from '../src/journal-reference-catalog.js';
import {materialAlias,materialAliases} from '../src/material-alias.js';
import {imagePrompt} from '../src/ai-image-generation.js';
import {assetEditorValue} from '../src/asset-editor.js';

const asset={id:'asset-1',title:'蓝色纸',kind:'sticker',role:'focal',physicalWidthMM:40,physicalHeightMM:50,supply:{quantity:1},tags:['蓝色'],updatedAt:'2026-10-03T00:00:00.000Z'};
const make=async({p=project('测试创作',{style:'韩系清新'}),assets=[asset],aliases={m1:asset.id},previews=[],settings={generationMode:'direct',includeThumbnails:false},referenceImages=[],userTemplates=[]}={})=>
  createOfflineHandoff({project:p,assets,aliases,previews,settings,referenceImages,userTemplates});
const filesOf=async output=>unzipSync(new Uint8Array(await output.blob.arrayBuffer()));

test('current GPT task package has one root entry and grouped compact folders',async()=>{
  const output=await make(),files=await filesOf(output),context=JSON.parse(strFromU8(files['task/context.json']));
  assert.deepEqual(Object.keys(files).filter(name=>!name.includes('/')).sort(),['START_HERE.txt']);
  assert.equal(context.format,'shiye-gpt-creation-package');assert.equal(context.version,2);
  assert.equal(context.source.taskBinding,'local');assert.equal(context.source.packageLayout,'compact');
  assert.equal(context.materials[0].assetID,asset.id);
  for(const path of ['task/GUIDE.txt','task/knowledge.json','schema/output.json','schema/craft-plan.json','examples/project.shiyeproject.json','runtime/validate.cjs','runtime/preview.cjs'])assert.ok(files[path],path);
  assert.equal(files['runtime/pack.cjs'],undefined);
  for(const removed of ['README.txt','context.json','contract.json','CONTENT_BRIEF.txt','CREATIVE_GUIDE.txt','CRAFT_GUIDE.txt','case-studies.json','composition-ideas.json','abstract-templates.json','source-image-audit.json','example-response.json','example-response.shiyeproject.json'])assert.equal(files[removed],undefined,removed);
  assert.match(strFromU8(files['START_HERE.txt']),/task\/context\.json/);assert.match(strFromU8(files['START_HERE.txt']),/schema\/output\.json/);
  const knowledge=JSON.parse(strFromU8(files['task/knowledge.json']));assert.equal(knowledge.format,'shiye-gpt-task-knowledge');assert.ok(knowledge.compositionIdeas.length);
  assert.ok(knowledge.compositionIdeas.length<=3);
  assert.match(strFromU8(files['START_HERE.txt']),/本次主题、要求和内容/);
  assert.ok(strFromU8(files['task/GUIDE.txt']).length<5500,'The model-facing GUIDE should stay concise');
  const guide=strFromU8(files['task/GUIDE.txt']);
  assert.match(guide,/page\.layers/,'direct mode must advertise recursive Scene v2 layers');
  assert.doesNotMatch(guide,/page\.groups/,'removed parallel group schema must not appear in GPT instructions');
});

test('current editable example imports from JSON with current library assets',async()=>{
  const output=await make(),files=await filesOf(output),response=strFromU8(files['examples/project.shiyeproject.json']);
  const imported=importEditableWork(response,[asset],{trustedSource:output.source});
  assert.equal(imported.isDraft,true);assert.equal(imported.drafts[0].items[0].assetID,asset.id);assert.equal(imported.drafts[0].agentRun.status,'finished');
  assert.equal(imported.offlineBundleId,output.source.bundleId);
  assert.equal(importEditableWork(response,[asset]).drafts[0].items[0].assetID,asset.id);
  assert.throws(()=>importEditableWork(response,[asset],{trustedSource:{...output.source,bundleId:'other'}}),/来源与所选原始任务不一致/);
  const copied=`预览如下。\n\n\`\`\`json\n${response}\n\`\`\``;
  assert.equal(importEditableWork(copied,[asset],{trustedSource:output.source}).drafts[0].items[0].assetID,asset.id);
});

test('editing material metadata and stock after task export does not block import, but cutout or measured size does',async()=>{
  const output=await make(),files=await filesOf(output),response=strFromU8(files['examples/project.shiyeproject.json']);
  const edited=assetEditorValue(asset,{title:'重新命名',kind:'sticker',role:'focal',texture:'纸',width:'40',height:'50',quantity:'1',
    tags:'新标签',contentTags:'',styleTags:'',materialTags:'',seriesID:'new-series',reviewStatus:'ready',usageStatus:'unused',
    tapeRoll:false,supplyLength:'',repeatable:false,repeatPeriod:''});
  assert.equal(importEditableWork(response,[edited]).drafts[0].items[0].assetID,asset.id);
  for(const changed of [
    {...edited,supply:{quantity:0}},
    {...edited,kind:'tape'},
    {...edited,role:'background',imageSize:{width:900,height:1200},originalBlobId:'new-original'}
  ])assert.equal(importEditableWork(response,[changed]).drafts[0].items[0].assetID,asset.id);
  for(const changed of [
    {...edited,physicalWidthMM:45},
    {...edited,blobId:'new-cutout'},
    {...edited,processingRecord:{manualCutout:true}},
    {...edited,imageHash:'sha256:'+ 'a'.repeat(64)}
  ])assert.throws(()=>importEditableWork(response,[changed]),/素材抠图或实物尺寸已变化/);
});

test('current task round-trip keeps the selected journal paper size',async()=>{
  const p=project('随身本',{ratio:'weeks'}),output=await make({p}),files=await filesOf(output);
  const imported=importEditableWork(strFromU8(files['examples/project.shiyeproject.json']),[asset],{trustedSource:output.source});
  assert.equal(imported.drafts[0].pageRatio,'weeks');assert.equal(imported.drafts[0].physicalPageHeightMM,188);
  assert.ok(Math.abs(imported.drafts[0].canvas.width/1000-95/188)<1e-9);
});

test('stable and UUID material aliases resolve current library assets',async()=>{
  const second={...asset,id:'asset-2',title:'绿色纸'},aliases=materialAliases([asset.id,second.id]);
  assert.deepEqual(materialAliases([second.id,asset.id]),Object.fromEntries([[materialAlias(second.id),second.id],[materialAlias(asset.id),asset.id]]));
  const output=await make({assets:[asset,second],aliases}),files=await filesOf(output),example=JSON.parse(strFromU8(files['examples/project.shiyeproject.json']));
  assert.equal(importEditableWork(JSON.stringify(example),[second,asset],{trustedSource:output.source}).drafts[0].items[0].assetID,asset.id);
  const uuid=crypto.randomUUID(),original={...asset,id:uuid},uuidAliases=materialAliases([uuid]),uuidOutput=await make({assets:[original],aliases:uuidAliases});
  const uuidFiles=await filesOf(uuidOutput);assert.equal(importEditableWork(strFromU8(uuidFiles['examples/project.shiyeproject.json']),[original],{trustedSource:uuidOutput.source}).drafts[0].items[0].assetID,uuid);
});

test('direct editable scene keeps layered typography and vector geometry',async()=>{
  const output=await make({p:project('分层示例')}),files=await filesOf(output),response=JSON.parse(strFromU8(files['examples/project.shiyeproject.json']));
  response.page.layers.push({type:'shape',id:'drawn-leaf',key:'drawn-leaf',kind:'vector',x:.2,y:.5,width:.08,height:.12,fill:'#7a9d77',stroke:null,z:70,vector_paths:[[[.5,0],[1,.5],[.5,1],[0,.5]]]});
  const imported=importEditableWork(JSON.stringify(response),[asset],{trustedSource:output.source});
  assert.equal(imported.drafts[0].primitives.find(p=>p.key==='drawn-leaf')?.vectorPaths.length,1);
  assert.match(shapeSVG(imported.drafts[0].primitives.find(p=>p.key==='drawn-leaf')),/<path/);
});

test('editable ZIP imports current data and rejects a container without its scene',async()=>{
  const output=await make(),files=await filesOf(output),response=strFromU8(files['examples/project.shiyeproject.json']);
  const packed=zipSync({[EDITABLE_PACKAGE_ENTRY]:strToU8(response),'preview.svg':strToU8('<svg/>')});
  assert.equal(importEditableWorkPackage(packed,[asset],{trustedSource:output.source}).drafts[0].items[0].assetID,asset.id);
  assert.throws(()=>importEditableWorkPackage(zipSync({'preview.svg':strToU8('<svg/>')}),[asset]),/缺少/);
});

test('invalid editable data is rejected before persistence',async()=>{
  const output=await make(),files=await filesOf(output),response=JSON.parse(strFromU8(files['examples/project.shiyeproject.json']));
  assert.equal(response.format,EDITABLE_WORK_FORMAT);
  assert.throws(()=>importEditableWork(JSON.stringify({...response,format:'other'}),[asset],{trustedSource:output.source}),/不是拾页/);
  assert.throws(()=>importEditableWork('not-json',[asset],{trustedSource:output.source}),/不是有效 JSON/);
  const duplicate=JSON.stringify(response);assert.throws(()=>importEditableWork(`\`\`\`json\n${duplicate}\n\`\`\`\n\`\`\`json\n${duplicate}\n\`\`\``,[asset],{trustedSource:output.source}),/多个可编辑数据块/);
});

test('web handoff exposes mode-specific current schemas and concise instructions',async()=>{
  const p=project('测试创作',{style:'韩系清新'}),args={p};
  const agent=await make({p,settings:{generationMode:'agent',includeThumbnails:false,includeStructureReference:false}}),agentFiles=await filesOf(agent);
  assert.equal(agent.filename,'拾页-GPT创作任务.zip');assert.match(strFromU8(agentFiles['START_HERE.txt']),/runtime\/preview\.cjs/);
  assert.match(strFromU8(agentFiles['START_HERE.txt']),/task\/CRAFT_GUIDE\.txt/);
  const craftGuide=strFromU8(agentFiles['task/CRAFT_GUIDE.txt']);
  assert.match(craftGuide,/逐件查看 materials\//);assert.match(craftGuide,/decisions/);
  assert.match(craftGuide,/observed_region/);assert.match(craftGuide,/不设工艺数量指标/);
  const agentContract=JSON.parse(strFromU8(agentFiles['schema/output.json']));assert.ok(agentContract.apply_craft_plan&&agentContract.edit_materials);
  const direct=await make({p,settings:{generationMode:'direct',includeThumbnails:false}}),directFiles=await filesOf(direct);
  assert.equal(directFiles['task/CRAFT_GUIDE.txt'],undefined);
  assert.ok(JSON.parse(strFromU8(directFiles['examples/project.shiyeproject.json'])).page);
  assert.ok(JSON.parse(strFromU8(agentFiles['examples/project.shiyeproject.json'])).tools);
  assert.match(agent.prompts.file,/作品.shiyeproject.json/);
  assert.match(agent.prompts.file,/ZIP/);
  assert.match(agent.prompts.text,/展示/);
  assert.match(agent.prompts.text,/一个完整的/);
  assert.match(agent.prompts.text,/单行 JSON/);
  assert.match(strFromU8(agentFiles['START_HERE.txt']),/JSON 代码围栏/);
});

test('image delivery uses the same compact task grouping without editable schemas',async()=>{
  const p=project('画面测试',{style:'韩系清新'});p.styles=['韩系清新'];p.purposes=['日常记录'];p.intent='午后散步';
  const output=await make({p,settings:{deliveryMode:'image',includeThumbnails:false}}),files=await filesOf(output);
  assert.equal(output.deliveryMode,'image');assert.equal(output.mode,'image');assert.match(output.prompt,/PNG/);
  assert.deepEqual(Object.keys(files).filter(name=>!name.includes('/')).sort(),['START_HERE.txt']);
  assert.ok(strFromU8(files['task/GUIDE.txt']).includes(imagePrompt({project:p,draft:p.drafts[0],assets:[asset],ids:[asset.id],theme:p.intent,requireAll:true,includeImages:false})));
  assert.equal(JSON.parse(strFromU8(files['task/context.json'])).version,2);
  assert.ok(!files['schema/output.json']&&!files['runtime/validate.cjs']);
});

test('selected material WebP previews retain exact bytes and fingerprints',async()=>{
  const preview=Uint8Array.from([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,32,1,2,3,4]),output=await make({previews:[{alias:'m1',bytes:preview}],settings:{generationMode:'direct',includeThumbnails:true}}),bytes=new Uint8Array(await output.blob.arrayBuffer()),files=unzipSync(bytes);
  assert.deepEqual(files['materials/m1.webp'],preview);assert.equal(output.source.previewHashes.m1,'sha256:'+createHash('sha256').update(preview).digest('hex'));assert.match(output.source.taskHash,/^sha256:[a-f0-9]{64}$/);
  await verifyOfflineTaskPackage(bytes,output.source);
  const changed={...files,'materials/m1.webp':new Uint8Array([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,32,9,9,9,9])};await assert.rejects(verifyOfflineTaskPackage(zipSync(changed),output.source),/预览与指纹不一致/);
  const inspected=inspectOfflinePackage(bytes);assert.equal(inspected.kind,'task');assert.equal(inspected.source.bundleId,output.source.bundleId);
});

test('text-only task explicitly records null preview hashes',async()=>{
  const output=await make({settings:{generationMode:'direct',includeThumbnails:false}}),bytes=new Uint8Array(await output.blob.arrayBuffer());
  assert.equal(output.source.previewHashes,null);await verifyOfflineTaskPackage(bytes,output.source);
});

test('reference metadata is merged into task/knowledge.json and images stay under references',async()=>{
  const p=project('参考');p.styles=['韩系清新'];p.purposes=['日常记录'];
  const cases=selectJournalReferenceCases({styles:p.styles,purposes:p.purposes,materials:[asset]});
  const referenceImages=cases.map((entry,i)=>({id:entry.id,bytes:new Uint8Array([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,32,i+1])}));
  const output=await make({p,settings:{generationMode:'direct',includeThumbnails:false,sendPresetReferences:true},referenceImages}),files=await filesOf(output),knowledge=JSON.parse(strFromU8(files['task/knowledge.json']));
  assert.deepEqual(Object.keys(files).filter(name=>name.startsWith('references/')&&name.endsWith('.webp')).sort(),cases.map(entry=>`references/${entry.id}.webp`).sort());
  assert.deepEqual(knowledge.caseStudies.selectedCases.map(entry=>entry.id),cases.map(entry=>entry.id));assert.ok(knowledge.abstractTemplates.templates.length);assert.ok(knowledge.sourceImageAudit.images.length<=referenceImages.length,'Only matching references should be audited');
  assert.equal(files['abstract-templates.json'],undefined);assert.equal(files['source-image-audit.json'],undefined);
  assert.match(strFromU8(files['task/GUIDE.txt']),/可编辑|内容边界/);
});

test('preset reference planning remains independent across palette, layout and page mode',()=>{
  const plans=presetReferencePlans({styles:['复古旧物','杂志编辑'],purposes:['旅途记录','图文收藏']});
  assert.deepEqual(plans.map(plan=>plan.level),['简洁','均衡','丰富','实验']);assert.equal(plans[0].purpose,'旅途记录');
  assert.match(presetReferenceGuide(plans),/简洁、均衡、丰富到实验/);
  const other=presetReferencePlans({styles:['韩系清新'],purposes:['清单计划']}),mixed=presetReferencePlans({styles:['韩系清新','密集拼贴'],purposes:['清单计划']});
  assert.deepEqual(mixed[0].palette,other[0].palette);assert.notDeepEqual(mixed[0].zones,other[0].zones);
});


test('Safari-compatible package binds PNG materials and JPEG references to actual file paths',async()=>{
  const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,1,2]);
  const jpg=Uint8Array.from([255,216,255,224,0,16,0,0,4,5,6]);
  const p=project('手机创作参考');p.styles=['韩系清新'];p.purposes=['日常记录'];
  const cases=selectJournalReferenceCases({styles:p.styles,purposes:p.purposes,materials:[asset]});
  const refs=cases.map((entry,i)=>({id:entry.id,bytes:jpg,extension:'jpg',mimeType:'image/jpeg'}));
  const bundle=await make({p,previews:[{alias:'m1',bytes:png}],referenceImages:refs,
    settings:{generationMode:'direct',includeThumbnails:true,sendPresetReferences:true}});
  const bytes=new Uint8Array(await bundle.blob.arrayBuffer()),files=unzipSync(bytes),
    ctx=JSON.parse(strFromU8(files['task/context.json']));
  assert.deepEqual(files['materials/m1.png'],png);
  assert.deepEqual(files['references/'+cases[0].id+'.jpg'],jpg);
  assert.equal(ctx.materials[0].preview,'materials/m1.png');
  assert.equal(files['materials/m1.webp'],undefined);
  assert.equal(bundle.source.previewHashes.m1,'sha256:'+createHash('sha256').update(png).digest('hex'));
  await verifyOfflineTaskPackage(bytes,bundle.source);
  const broken={...files,'materials/m1.png':new Uint8Array(png.map((v,i)=>i===11?v^1:v))};
  await assert.rejects(verifyOfflineTaskPackage(zipSync(broken),bundle.source),/预览与指纹不一致/);
  const spoofed={...files,'materials/m1.png':undefined,'materials/m1.webp':png};
  delete spoofed['materials/m1.png'];
  await assert.rejects(verifyOfflineTaskPackage(zipSync(spoofed),bundle.source),/图片内容与格式不一致/);
});

test('sync-enabled API keys are never embedded in a model-facing task package',async()=>{
  const secret='sk-test-not-for-GPT-task';
  const result=await make({settings:{generationMode:'direct',includeThumbnails:false,
    provider:'openai',key:secret,keys:{openai:secret}}});
  const entries=await filesOf(result);
  const combined=Object.values(entries).filter(Boolean).map(bytes=>strFromU8(bytes)).join(' ');
  assert.ok(!combined.includes(secret),'Exported GPT task must not include private API keys');
});
