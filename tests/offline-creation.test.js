import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineCreationPackage,importEditableWork,EDITABLE_WORK_FORMAT} from '../src/offline-creation.js';

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
