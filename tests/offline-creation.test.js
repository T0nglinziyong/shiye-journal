import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineCreationPackage,createOfflineHandoff,importEditableWork,EDITABLE_WORK_FORMAT} from '../src/offline-creation.js';
import {shapeSVG} from '../src/editor-tools-model.js';

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
  const copied=`这页的预览图已展示。\n\n\`\`\`json\n${response}\n\`\`\``;
  assert.equal(importEditableWork(copied,[asset]).drafts[0].items[0].assetID,asset.id);
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
  assert.match(strFromU8(toolFiles['START_HERE.txt']),/可下载的 UTF-8 文件/);
  assert.ok(strFromU8(toolFiles['START_HERE.txt']).length<2000,'task brief should point to contracts instead of inlining them');
  assert.match(strFromU8(toolFiles['START_HERE.txt']),/【本次任务】[\s\S]*【素材与物理规则】[\s\S]*【输出合同】/);
  const agentContract=JSON.parse(strFromU8(toolFiles['contract.json']));
  assert.ok(agentContract.edit_materials&&agentContract.upsert_primitives&&agentContract.move_elements);
  assert.ok(tool.prompt.length<130);assert.match(tool.prompt,/START_HERE.txt/);
  const direct=await createOfflineHandoff({...args,settings:{generationMode:'direct',includeThumbnails:false}});
  const directFiles=unzipSync(new Uint8Array(await direct.blob.arrayBuffer()));
  assert.match(strFromU8(directFiles['START_HERE.txt']),/可下载的 UTF-8 文件/);
  assert.match(strFromU8(directFiles['START_HERE.txt']),/不要返回 tools/);
  assert.match(strFromU8(directFiles['START_HERE.txt']),/单独的 ```json 代码块/);
  assert.ok(JSON.parse(strFromU8(directFiles['example-response.shiyeproject.json'])).page);
  assert.ok(JSON.parse(strFromU8(toolFiles['example-response.shiyeproject.json'])).tools);
  assert.equal(JSON.parse(strFromU8(toolFiles['composition-ideas.json'])).length,3);
  assert.match(tool.prompts.json,/不要生成文件/);
  assert.match(tool.prompts.file,/可下载/);
  assert.ok(tool.packageBytes>=tool.imageBytes);
});

test('offline ZIP includes each selected material as its own image, not only API imageCount',async()=>{
  const assets=Array.from({length:4},(_,i)=>({...asset,id:`a${i+1}`,title:`素材 ${i+1}`}));
  const aliases=Object.fromEntries(assets.map((item,i)=>[`m${i+1}`,item.id]));
  const previews=assets.map((_,i)=>({alias:`m${i+1}`,bytes:new Uint8Array([i+1,9,8])}));
  const result=await createOfflineHandoff({project:project('四件素材'),assets,aliases,previews,settings:{includeThumbnails:true,imageCount:1}});
  const files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files).filter(name=>name.startsWith('materials/')).sort(),['materials/m1.png','materials/m2.png','materials/m3.png','materials/m4.png']);
  assert.equal(JSON.parse(strFromU8(files['context.json'])).materials[0].preview,'materials/m1.png');
  assert.equal(result.imageCount,4);
  await assert.rejects(createOfflineHandoff({project:project(),assets,aliases,previews:previews.slice(0,1),settings:{includeThumbnails:true,imageCount:1}}),/缺少素材预览/);
});

test('offline ZIP preserves transparent PNG preview bytes and paths',async()=>{
  const transparentPixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5uoAAAAASUVORK5CYII=','base64'));
  const result=await createOfflineHandoff({project:project('透明素材'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:transparentPixel}],settings:{includeThumbnails:true,imageCount:1}});
  const files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(files['materials/m1.png'],transparentPixel);
  assert.equal(JSON.parse(strFromU8(files['context.json'])).materials[0].preview,'materials/m1.png');
  assert.match(strFromU8(files['START_HERE.txt']),/不要给贴纸添加白底/);
});

test('direct page returned as an editable file imports into layers, not a flattened preview',async()=>{
  const {source}=await createOfflineHandoff({project:project('直接页'),assets:[asset],aliases:{m1:asset.id},settings:{generationMode:'direct',includeThumbnails:false}});source.purposes=['主题封面'];
  const page={version:3,style:'留白叙事',intent:null,items:[{asset:'m1',piece:'paper',unit:0,role:null,operations:[{op:'whole'}],placement:{x:.5,y:.4,rotation:0,z:1},relation:null}],graphics:[{key:'line-1',kind:'line',x:.5,y:.2,width:.5,height:.004,stroke:'#30463d',fill:null,line_width:2},{key:'frame-1',kind:'frame',x:.5,y:.7,width:.5,height:.08,stroke:'#30463d',fill:null,line_width:2},{key:'block-1',kind:'rectangle',x:.8,y:.8,width:.07,height:.06,fill:'#8ba99b',stroke:null}],text_blocks:[{content:'这一页的主题',font_style:'serif',x:.5,y:.15,width:.6,height:.1,font_size:28,color:'#30463d'}],paper:{color:'#fcfaf0',pattern:'plain'}};
  const imported=importEditableWork(JSON.stringify({format:EDITABLE_WORK_FORMAT,version:1,source,title:'直接返回的作品',page}),[asset]);
  assert.equal(imported.isDraft,true);assert.equal(imported.drafts[0].items[0].assetID,asset.id);
  assert.equal(imported.drafts[0].textBlocks[0].content,'这一页的主题');
  assert.deepEqual(imported.drafts[0].primitives.map(g=>g.kind),['line','frame','rectangle']);
  assert.match(shapeSVG(imported.drafts[0].primitives[0]),/vector-effect="non-scaling-stroke"/);
});
