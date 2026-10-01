import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineCreationPackage,createOfflineHandoff,importEditableWork,importEditableWorkPackage,EDITABLE_WORK_FORMAT,EDITABLE_PACKAGE_ENTRY} from '../src/offline-creation.js';
import {shapeSVG} from '../src/editor-tools-model.js';
import {presetReferenceGuide,presetReferencePlans} from '../src/creative-reference-presets.js';
import {materialAlias,materialAliases} from '../src/material-alias.js';

const asset={id:'asset-1',title:'蓝色纸',kind:'sticker',role:'focal',physicalWidthMM:40,physicalHeightMM:50,supply:{quantity:1},tags:['蓝色']};
const packageFor=()=>createOfflineCreationPackage({project:project('测试创作',{style:'韩系清新'}),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:new Uint8Array([1,2,3])}]});

test('offline bundle contains readable prompt, exact aliases, editable contract and every preview',async()=>{
  const output=packageFor(),files=unzipSync(new Uint8Array(await output.blob.arrayBuffer()));
  const context=JSON.parse(strFromU8(files['context.json']));
  assert.equal(context.materials[0].assetID,asset.id);
  assert.deepEqual([...files['materials/m1.jpg']],[1,2,3]);
  assert.match(strFromU8(files['README.txt']),/不嵌入图像/);
  assert.ok(JSON.parse(strFromU8(files['contract.json'])).compose_page);
  assert.throws(()=>createOfflineCreationPackage({project:project(),assets:[asset],aliases:{m1:asset.id}}),/缺少素材预览/);
});

test('editable GPT response becomes an editable draft without replacing existing work',async()=>{
  const files=unzipSync(new Uint8Array(await packageFor().blob.arrayBuffer()));
  const response=strFromU8(files['example-response.json']);
  const imported=importEditableWork(response,[asset]);
  assert.equal(imported.isDraft,true);
  assert.equal(imported.drafts[0].items[0].assetID,asset.id);
  assert.equal(imported.drafts[0].textBlocks[0].content,'这一页的主题');
  assert.equal(imported.drafts[0].agentRun.status,'finished');
  assert.equal(imported.offlineBundleId,JSON.parse(response).source.bundleId);
  assert.deepEqual(imported.creationVerification,{structure:'passed',physical:'current-rules-passed',preview:'unverified',reading:'pending',sourceTaskId:imported.offlineBundleId});
  const copied=`这页的预览图已展示。\n\n\`\`\`json\n${response}\n\`\`\``;
  assert.equal(importEditableWork(copied,[asset]).drafts[0].items[0].assetID,asset.id);
});
test('stable material IDs survive library reordering in an editable JSON import',async()=>{
  const second={...asset,id:'asset-2',title:'绿色纸'};
  const aliases=materialAliases([asset.id,second.id]);
  assert.deepEqual(materialAliases([second.id,asset.id]),Object.fromEntries([[materialAlias(second.id),second.id],[materialAlias(asset.id),asset.id]]));
  const bundle=createOfflineCreationPackage({project:project('稳定编号'),assets:[asset,second],aliases,previews:Object.keys(aliases).map(alias=>({alias,bytes:new Uint8Array([1,2,3])}))});
  const files=unzipSync(new Uint8Array(await bundle.blob.arrayBuffer()));
  const response=strFromU8(files['example-response.json']);
  assert.equal(importEditableWork(response,[second,asset]).drafts[0].items[0].assetID,asset.id);
  assert.ok(files[`materials/${materialAlias(asset.id)}.jpg`]);
});
test('UUID material aliases fit the creative contract and resolve the original',async()=>{
  const uuid=crypto.randomUUID(),original={...asset,id:uuid};
  const aliases=materialAliases([uuid]);
  assert.ok(Object.keys(aliases)[0].length>48);
  const bundle=createOfflineCreationPackage({project:project('UUID'),assets:[original],aliases,previews:[{alias:materialAlias(uuid),bytes:new Uint8Array([1,2,3])}]});
  const files=unzipSync(new Uint8Array(await bundle.blob.arrayBuffer()));
  assert.equal(importEditableWork(strFromU8(files['example-response.json']),[original]).drafts[0].items[0].assetID,uuid);
});
test('direct editable import keeps layered typography and free vector geometry',async()=>{
  const output=await createOfflineHandoff({project:project('分层示例'),assets:[asset],aliases:materialAliases([asset.id]),settings:{generationMode:'direct',includeThumbnails:false}});
  const files=unzipSync(new Uint8Array(await output.blob.arrayBuffer()));
  const response=JSON.parse(strFromU8(files['example-response.shiyeproject.json']));
  response.page.graphics.push({key:'drawn-leaf',kind:'vector',x:.2,y:.5,width:.08,height:.12,fill:'#7a9d77',stroke:null,z:70,vector_paths:[[[.5,0],[1,.5],[.5,1],[0,.5]]]});
  const imported=importEditableWork(JSON.stringify(response),[asset],{trustedSource:output.source});
  assert.equal(imported.drafts[0].primitives.find(p=>p.key==='drawn-leaf')?.vectorPaths.length,1);
  assert.equal(imported.drafts[0].textBlocks.find(t=>t.role==='body')?.lineSpacing,4);
  assert.equal(imported.drafts[0].textBlocks.find(t=>t.role==='body')?.zIndex,900);
  assert.match(shapeSVG(imported.drafts[0].primitives.find(p=>p.key==='drawn-leaf')),/<path/);
});
test('editable ZIP is a validated document container and resolves the local original asset',async()=>{
  const files=unzipSync(new Uint8Array(await packageFor().blob.arrayBuffer()));
  const response=strFromU8(files['example-response.json']);
  const result=zipSync({[EDITABLE_PACKAGE_ENTRY]:strToU8(response),'preview.svg':strToU8('<svg/>')});
  assert.equal(importEditableWorkPackage(result,[asset]).drafts[0].items[0].assetID,asset.id);
  assert.throws(()=>importEditableWorkPackage(zipSync({'preview.svg':strToU8('<svg/>')}),[asset]),/缺少/);
});

test('invalid or incomplete editable file is rejected before persistence',async()=>{
  const files=unzipSync(new Uint8Array(await packageFor().blob.arrayBuffer()));
  const response=JSON.parse(strFromU8(files['example-response.json']));
  assert.equal(response.format,EDITABLE_WORK_FORMAT);
  assert.throws(()=>importEditableWork(JSON.stringify({...response,format:'other'}),[asset]),/不是拾页/);
  assert.throws(()=>importEditableWork(JSON.stringify({...response,source:{...response.source,materials:[{alias:'m1',assetID:'missing'}]}}),[asset]),/不存在/);
  assert.throws(()=>importEditableWork(JSON.stringify({...response,tools:[response.tools[0]]}),[asset]),/finish_design/);
  assert.throws(()=>importEditableWork(JSON.stringify({...response,tools:[{name:'delete_elements',arguments:{}},response.tools[1]]}),[asset]),/compose_page/);
  assert.throws(()=>importEditableWork('not-json',[asset]),/不是有效 JSON/);
  const duplicate=JSON.stringify(response);
  assert.throws(()=>importEditableWork(`\`\`\`json\n${duplicate}\n\`\`\`\n\`\`\`json\n${duplicate}\n\`\`\``,[asset]),/多个可编辑数据块/);
});

test('web ChatGPT handoff is one uploadable file plus a copyable, mode-specific instruction',async()=>{
  const p=project('测试创作',{style:'韩系清新'}),args={project:p,assets:[asset],aliases:{m1:asset.id}};
  const tool=await createOfflineHandoff({...args,settings:{generationMode:'agent',includeThumbnails:false,includeStructureReference:false}});
  assert.equal(tool.filename,'拾页-GPT创作任务.zip');
  const toolFiles=unzipSync(new Uint8Array(await tool.blob.arrayBuffer()));
  assert.equal(JSON.parse(strFromU8(toolFiles['context.json'])).source.bundleId,tool.source.bundleId);
  assert.match(strFromU8(toolFiles['START_HERE.txt']),/compose_page/);
  assert.match(strFromU8(toolFiles['START_HERE.txt']),/图片预览/);
  assert.match(strFromU8(toolFiles['START_HERE.txt']),/可下载的「作品\.shiyeproject\.zip」/);
  assert.ok(strFromU8(toolFiles['START_HERE.txt']).length<2000,'task brief should point to contracts instead of inlining them');
  assert.match(strFromU8(toolFiles['START_HERE.txt']),/【本次任务】[\s\S]*【素材与物理规则】[\s\S]*【输出合同】/);
  const agentContract=JSON.parse(strFromU8(toolFiles['contract.json']));
  assert.ok(agentContract.edit_materials&&agentContract.upsert_primitives&&agentContract.move_elements);
  assert.ok(tool.prompt.length<130);assert.match(tool.prompt,/START_HERE.txt/);
  const direct=await createOfflineHandoff({...args,settings:{generationMode:'direct',includeThumbnails:false}});
  const directFiles=unzipSync(new Uint8Array(await direct.blob.arrayBuffer()));
  assert.match(strFromU8(directFiles['START_HERE.txt']),/可下载的「作品\.shiyeproject\.zip」/);
  assert.match(strFromU8(directFiles['START_HERE.txt']),/不要返回 tools/);
  assert.match(strFromU8(directFiles['START_HERE.txt']),/单独的 ```json 代码块/);
  assert.ok(JSON.parse(strFromU8(directFiles['example-response.shiyeproject.json'])).page);
  assert.ok(JSON.parse(strFromU8(toolFiles['example-response.shiyeproject.json'])).tools);
  assert.equal(JSON.parse(strFromU8(toolFiles['composition-ideas.json'])).length,3);
  assert.match(tool.prompts.json,/不要生成文件/);
  assert.match(tool.prompts.file,/可下载/);
  assert.ok(tool.packageBytes>=tool.imageBytes);
});

test('offline ZIP includes each selected material as its own image',async()=>{
  const assets=Array.from({length:4},(_,i)=>({...asset,id:`a${i+1}`,title:`素材 ${i+1}`}));
  const aliases=Object.fromEntries(assets.map((item,i)=>[`m${i+1}`,item.id]));
  const previews=assets.map((_,i)=>({alias:`m${i+1}`,bytes:new Uint8Array([i+1,9,8])}));
  const result=await createOfflineHandoff({project:project('四件素材'),assets,aliases,previews,settings:{includeThumbnails:true}});
  const files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files).filter(name=>name.startsWith('materials/')).sort(),['materials/m1.png','materials/m2.png','materials/m3.png','materials/m4.png']);
  assert.equal(JSON.parse(strFromU8(files['context.json'])).materials[0].preview,'materials/m1.png');
  assert.equal(result.previewCount,4);
  await assert.rejects(createOfflineHandoff({project:project(),assets,aliases,previews:previews.slice(0,1),settings:{includeThumbnails:true}}),/缺少素材预览/);
});

test('GPT ZIP carries required/preferred/available priorities but never sends excluded material',async()=>{
  const second={...asset,id:'asset-2',title:'备选图片'},excluded={...asset,id:'asset-3',title:'不使用的图片'};
  const p=project('优先级'),priority={required:[asset.id],preferred:[],available:[second.id],excluded:[excluded.id]};
  p.requiredAssetIDs=[asset.id];p.materialPriority=priority;
  const handoff=await createOfflineHandoff({project:p,assets:[asset,second,excluded],aliases:{m1:asset.id,m2:second.id},settings:{includeThumbnails:false}});
  const files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer())),context=JSON.parse(strFromU8(files['context.json']));
  assert.deepEqual(context.source.materialPriority,{required:[asset.id],preferred:[],available:[second.id]});
  assert.deepEqual(context.materials.map(x=>x.assetID),[asset.id,second.id]);
  assert.doesNotMatch(strFromU8(files['START_HERE.txt']),/不使用的图片|asset-3/);
  assert.match(strFromU8(files['START_HERE.txt']),/必须使用/);
  assert.match(strFromU8(files['START_HERE.txt']),/可以使用（仅备选）/);
});

test('offline ZIP preserves transparent PNG preview bytes and paths',async()=>{
  const transparentPixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5uoAAAAASUVORK5CYII=','base64'));
  const result=await createOfflineHandoff({project:project('透明素材'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:transparentPixel}],settings:{includeThumbnails:true}});
  const files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(files['materials/m1.png'],transparentPixel);
  assert.equal(JSON.parse(strFromU8(files['context.json'])).materials[0].preview,'materials/m1.png');
  assert.match(strFromU8(files['START_HERE.txt']),/不要给贴纸添加白底/);
});

test('selected style and purpose produce four anonymous alternatives from simple to experimental',async()=>{
  const plans=presetReferencePlans({styles:['复古旧物','杂志编辑'],purposes:['旅途记录','图文收藏']});
  assert.deepEqual(plans.map(plan=>plan.level),['简洁','均衡','丰富','实验']);
  assert.equal(plans[0].purpose,'旅途记录');
  assert.match(presetReferenceGuide(plans),/兼顾 杂志编辑/);
  assert.match(presetReferenceGuide(plans),/简洁、均衡、丰富到实验/);
  assert.notDeepEqual(plans[0].zones,plans[3].zones);
  const other=presetReferencePlans({styles:['韩系清新'],purposes:['清单计划']});
  assert.notDeepEqual(plans[0].palette,other[0].palette);
  assert.match(other[0].labels.join('、'),/清单/);
  const spread=presetReferencePlans({styles:['杂志网格'],purposes:['影像故事'],mode:'spread'});
  assert.ok(spread.every(plan=>plan.zones.every(([x,,width])=>x<.5?x+width<=.47:x>=.5)),'double-page references must respect the fold');
  const bytes=[1,2,3,4].map(i=>({id:`preset-${i}`,bytes:new Uint8Array([137,80,78,71,i])}));
  const result=await createOfflineHandoff({project:project('参考'),assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false,sendPresetReferences:true},referenceImages:bytes});
  const files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files).filter(name=>name.startsWith('references/preset-')).sort(),[1,2,3,4].map(i=>`references/preset-${i}.png`));
  assert.match(strFromU8(files['START_HERE.txt']),/四张匿名预设/);
  assert.match(strFromU8(files['CREATIVE_GUIDE.txt']),/先理解素材/);
  assert.match(strFromU8(files['CREATIVE_GUIDE.txt']),/实体纸、照片、贴纸/);
  assert.ok(strFromU8(files['CREATIVE_GUIDE.txt']).length>1800);
  assert.doesNotMatch(Object.keys(files).join(' '),/私人|cece/);
  await assert.rejects(createOfflineHandoff({project:project(),assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false,sendPresetReferences:true},referenceImages:bytes.slice(0,3)}),/四张预设参考图/);
});

test('direct page returned as an editable file imports into layers, not a flattened preview',async()=>{
  const {source}=await createOfflineHandoff({project:project('直接页'),assets:[asset],aliases:{m1:asset.id},settings:{generationMode:'direct',includeThumbnails:false}});source.purposes=['主题封面'];
  const page={version:3,style:'留白叙事',intent:null,items:[{asset:'m1',piece:'paper',unit:0,role:null,operations:[{op:'whole'}],placement:{x:.5,y:.4,rotation:0,z:1},relation:null}],graphics:[{key:'line-1',kind:'line',x:.5,y:.2,width:.5,height:.004,stroke:'#30463d',fill:null,line_width:2},{key:'frame-1',kind:'frame',x:.5,y:.7,width:.5,height:.08,stroke:'#30463d',fill:null,line_width:2},{key:'block-1',kind:'rectangle',x:.8,y:.8,width:.07,height:.06,fill:'#8ba99b',stroke:null}],ink_strokes:[{points:[{x:.2,y:.84},{x:.3,y:.86},{x:.4,y:.84}],width:3,color:'#567ba8',pen_style:'brush'}],text_blocks:[{content:'这一页的主题',font_style:'hand',x:.5,y:.15,width:.6,height:.1,font_size:28,color:'#30463d'}],paper:{color:'#fcfaf0',pattern:'plain'}};
  const imported=importEditableWork(JSON.stringify({format:EDITABLE_WORK_FORMAT,version:1,source,title:'直接返回的作品',page}),[asset],{trustedSource:source});
  assert.equal(imported.isDraft,true);assert.equal(imported.drafts[0].items[0].assetID,asset.id);
  assert.equal(imported.drafts[0].textBlocks[0].content,'这一页的主题');
  assert.deepEqual(imported.drafts[0].primitives.map(g=>g.kind),['line','frame','rectangle']);
  assert.equal(imported.drafts[0].strokes[0].penStyle,'brush');
  assert.equal(imported.drafts[0].textBlocks[0].style,'hand');
  assert.match(shapeSVG(imported.drafts[0].primitives[0]),/vector-effect="non-scaling-stroke"/);
});
