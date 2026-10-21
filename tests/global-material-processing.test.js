import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from './v3-test-handoff.mjs';
import {buildCreativeMessages} from '../src/creative-runner.js';

const asset={id:'paper',title:'花纹纸',kind:'paper',physicalWidthMM:80,physicalHeightMM:100,supply:{quantity:1}};
const decode=bytes=>new TextDecoder().decode(bytes);

test('API prompt and both creation packages use only the shared material processing setting',async()=>{
  const p=project('统一加工');
  p.processing='少量裁剪';
  const aliases={m1:asset.id};
  const text=buildCreativeMessages({draft:p.drafts[0],assets:[asset],aliases,processing:p.processing})[1].content[0].text;
  assert.match(text,/素材加工方式：少量裁剪，统一适用于本次素材/);
  assert.doesNotMatch(text,/用法|加工 少量裁剪/);
  for(const generationMode of ['direct','agent']){
    const handoff=await createOfflineHandoff({project:p,assets:[asset],aliases,settings:{generationMode,includeThumbnails:false}});
    const files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));
    const source=JSON.parse(decode(files['TASK.json'])).sourceContext;
    assert.equal(source.processing,'少量裁剪');
    assert.equal(source.assetProcessing,undefined);
    assert.equal(source.materialUseHints,undefined);
    assert.equal(source.materialUseRequired,undefined);
    assert.match(decode(files['START_HERE.md']),/scene\.json 是唯一作品/);
    if(generationMode==='agent')assert.match(decode(files['design/RECIPES.md']),/Craft Plan/);
  }
});
