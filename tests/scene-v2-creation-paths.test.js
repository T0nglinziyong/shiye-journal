import test from 'node:test';
import assert from 'node:assert/strict';
import * as fabric from 'fabric/node';
import {draft} from '../src/domain.js';
import {applyManualLayout} from '../src/manual-layout-templates.js';
import {applyToolCalls} from '../src/creative.js';
import {commitAIDraft} from '../src/ai-run-target.js';
import {createFabricSceneBridge} from '../src/fabric-scene-bridge.js';
import {attachSceneV2,validateSceneExtensions} from '../src/scene-v2.js';

test('manual layout, AI creation and Fabric editing round-trip through one Scene v2 tree',async()=>{
  const assets=[{id:'paper',title:'测试纸片',kind:'paper',physicalWidthMM:45,
    physicalHeightMM:35,supply:{quantity:1}}];
  const manual=draft();
  assert.equal(applyManualLayout(manual,assets,['paper'],'story').placed,1);
  assert.equal(manual.layers.length,1);
  const project={drafts:[structuredClone(manual)]},expected=structuredClone(project.drafts[0]);
  const generated=applyToolCalls([{name:'upsert_text',arguments:{items:[{key:'story',
    content:'一页故事',x:.5,y:.8,width:.45,font_size:24}]}}],
  attachSceneV2(structuredClone(expected)),assets,{m1:'paper'});
  assert.ok(generated.results.every(row=>row.ok),JSON.stringify(generated.results));
  commitAIDraft(project,{targetDraftID:manual.id,expectedDraft:expected,
    generatedDraft:generated.draft,newDraftID:'candidate'});
  const saved=attachSceneV2(project.drafts[0]);
  assert.deepEqual(saved.layers.map(node=>node.type),['material','text']);
  assert.equal(saved.layers[0].assetID,'paper');

  const text=saved.layers.find(node=>node.type==='text');
  const bridge=createFabricSceneBridge(fabric);
  const projected=await bridge.fromNode(text);
  projected.set({text:'一页故事，继续编辑'});
  bridge.applyObject(text,projected);
  assert.equal(text.content,'一页故事，继续编辑');
  assert.equal(saved.layers[0].assetID,'paper');
  assert.equal(validateSceneExtensions(saved),true);
  const serialized=JSON.parse(JSON.stringify(saved));
  assert.equal(serialized.sceneVersion,2);
  assert.equal(serialized.layers.length,2);
  for(const old of ['items','textBlocks','primitives','strokes','layerGroups'])
    assert.equal(Object.hasOwn(serialized,old),false,`${old} must not become parallel saved state`);
  assert.equal(attachSceneV2(serialized).textBlocks[0].content,'一页故事，继续编辑');
});
