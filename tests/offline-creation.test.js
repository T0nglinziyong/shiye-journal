import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineCreationPackage,createOfflineHandoff,importEditableWork,EDITABLE_WORK_FORMAT} from '../src/offline-creation.js';

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
});

test('web ChatGPT handoff is one uploadable file plus a copyable, mode-specific instruction',async()=>{
  const p=project('测试创作',{style:'韩系清新'}),args={project:p,assets:[asset],aliases:{m1:asset.id}};
  const tool=await createOfflineHandoff({...args,settings:{generationMode:'agent',includeThumbnails:false,includeStructureReference:false}});
  assert.equal(tool.filename,'拾页-GPT创作任务.zip');
  const toolFiles=unzipSync(new Uint8Array(await tool.blob.arrayBuffer()));
  assert.equal(JSON.parse(strFromU8(toolFiles['context.json'])).source.bundleId,tool.source.bundleId);
  assert.match(strFromU8(toolFiles['START_HERE.txt']),/compose_page/);
  assert.ok(tool.prompt.length<130);assert.match(tool.prompt,/START_HERE.txt/);
  const direct=await createOfflineHandoff({...args,settings:{generationMode:'direct',includeThumbnails:false}});
  const directFiles=unzipSync(new Uint8Array(await direct.blob.arrayBuffer()));
  assert.match(strFromU8(directFiles['START_HERE.txt']),/可下载的 UTF-8 文件/);
  assert.match(strFromU8(directFiles['START_HERE.txt']),/不要返回 tools/);
  assert.ok(JSON.parse(strFromU8(directFiles['example-response.shiyeproject.json'])).page);
});

test('offline ZIP includes each selected material as its own image, not only API imageCount',async()=>{
  const assets=Array.from({length:4},(_,i)=>({...asset,id:`a${i+1}`,title:`素材 ${i+1}`}));
  const aliases=Object.fromEntries(assets.map((item,i)=>[`m${i+1}`,item.id]));
  const previews=assets.map((_,i)=>({alias:`m${i+1}`,bytes:new Uint8Array([i+1,9,8])}));
  const result=await createOfflineHandoff({project:project('四件素材'),assets,aliases,previews,settings:{includeThumbnails:true,imageCount:1}});
  const files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files).filter(name=>name.startsWith('materials/')).sort(),['materials/m1.jpg','materials/m2.jpg','materials/m3.jpg','materials/m4.jpg']);
  assert.equal(result.imageCount,4);
  await assert.rejects(createOfflineHandoff({project:project(),assets,aliases,previews:previews.slice(0,1),settings:{includeThumbnails:true,imageCount:1}}),/缺少素材预览/);
});

test('direct page returned as an editable file imports into layers, not a flattened preview',async()=>{
  const {source}=await createOfflineHandoff({project:project('直接页'),assets:[asset],aliases:{m1:asset.id},settings:{generationMode:'direct',includeThumbnails:false}});source.purposes=['主题封面'];
  const page={version:3,style:'留白叙事',intent:null,items:[{asset:'m1',piece:'paper',unit:0,role:null,operations:[{op:'whole'}],placement:{x:.5,y:.4,rotation:0,z:1},relation:null}],text_blocks:[{content:'这一页的主题',font_style:'serif',x:.5,y:.15,width:.6,height:.1,font_size:28,color:'#30463d'}],paper:{color:'#fcfaf0',pattern:'plain'}};
  const imported=importEditableWork(JSON.stringify({format:EDITABLE_WORK_FORMAT,version:1,source,title:'直接返回的作品',page}),[asset]);
  assert.equal(imported.isDraft,true);assert.equal(imported.drafts[0].items[0].assetID,asset.id);
  assert.equal(imported.drafts[0].textBlocks[0].content,'这一页的主题');
});
