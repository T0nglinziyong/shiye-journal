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
  assert.equal(tool.filename,'拾页-GPT创作参考.json');
  assert.equal(JSON.parse(await tool.blob.text()).source.bundleId,tool.source.bundleId);
  assert.match(tool.prompt,/只输出完整 JSON/);assert.match(tool.prompt,/compose_page/);
  assert.doesNotMatch(tool.prompt,/```/);
  const direct=await createOfflineHandoff({...args,settings:{generationMode:'direct',includeThumbnails:false}});
  assert.match(direct.prompt,/可下载的 UTF-8 文件/);assert.match(direct.prompt,/视觉预览/);
  assert.match(direct.prompt,/不要返回 tools/);
});

test('direct page returned as an editable file imports into layers, not a flattened preview',async()=>{
  const {source}=await createOfflineHandoff({project:project('直接页'),assets:[asset],aliases:{m1:asset.id},settings:{generationMode:'direct',includeThumbnails:false}});source.purposes=['主题封面'];
  const page={version:3,style:'留白叙事',intent:null,items:[{asset:'m1',piece:'paper',unit:0,role:null,operations:[{op:'whole'}],placement:{x:.5,y:.4,rotation:0,z:1},relation:null}],text_blocks:[{content:'这一页的主题',font_style:'serif',x:.5,y:.15,width:.6,height:.1,font_size:28,color:'#30463d'}],paper:{color:'#fcfaf0',pattern:'plain'}};
  const imported=importEditableWork(JSON.stringify({format:EDITABLE_WORK_FORMAT,version:1,source,title:'直接返回的作品',page}),[asset]);
  assert.equal(imported.isDraft,true);assert.equal(imported.drafts[0].items[0].assetID,asset.id);
  assert.equal(imported.drafts[0].textBlocks[0].content,'这一页的主题');
});
