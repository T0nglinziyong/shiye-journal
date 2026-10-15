import test from 'node:test';
import assert from 'node:assert/strict';
import {materialKinds,materialRoles,materialTextures} from '../src/material-taxonomy.js';
import {classificationResult} from '../src/classification.js';

test('material classification stays inside a finite shared vocabulary with an explicit other choice',()=>{
  for(const options of [materialKinds,materialRoles]){
    assert.equal(new Set(options.map(([id])=>id)).size,options.length);
    assert.ok(options.some(([id])=>id==='other'));
  }
  assert.ok(materialTextures.includes('其他'));
  assert.ok(materialTextures.includes('未确定'));
  const base={title:'不规则剪片',tags:[],kind:'other',role:'other',texture:'未确定'};
  assert.deepEqual(classificationResult(base,'asset'),{
    title:'不规则剪片',tags:[],kind:'other',role:'other',texture:'未确定',
    reviewStatus:'ready',contentTags:[],styleTags:[],materialTags:[],placementHints:[],semanticColorNames:[]
  });
  for(const change of [{kind:'invented'},{role:'invented'},{texture:'模型随意发挥的材质'},{texture:'待记录'}]){
    assert.throws(()=>classificationResult({...base,...change},'asset'),/预设范围/);
  }
});
