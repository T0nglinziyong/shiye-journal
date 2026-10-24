import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createCanvas,loadImage} from 'canvas';
import {unzipSync,strFromU8} from 'fflate';
import {creativePresetAssets,withCreativePresetAssets} from '../src/creative-presets.js';
import {queryAssets} from '../src/asset-query.js';
import {markProjectAssetsUsed} from '../src/library-model.js';
import {project,itemFromAsset} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch} from '../src/creation-v2-commands.js';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {attachSceneV2} from '../src/scene-v2.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {shapeSVG} from '../src/editor-tools-model.js';

const at=(x,y)=>({reference:'page',at:[x,y],unit:'mm'});
const batch=operations=>({protocolVersion:2,transactionId:'preset-test',
  baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
const imageBytes=asset=>readFile(join('public',asset.staticPath));

test('27 bundled supplies join the ordinary library as read-only preset status',async()=>{
  assert.equal(creativePresetAssets.length,27);
  assert.deepEqual(['tape','sticker','stamp'].map(kind=>creativePresetAssets.filter(asset=>asset.kind===kind).length),[9,9,9]);
  assert.equal(new Set(creativePresetAssets.map(asset=>asset.id)).size,27);
  const personal={id:'personal',title:'我的素材',kind:'sticker',usageStatus:'unused'};
  const library=withCreativePresetAssets([personal]);
  assert.equal(withCreativePresetAssets(library).length,library.length);
  assert.equal(queryAssets(library,{status:'preset'}).length,27);
  assert.deepEqual(queryAssets(library,{status:'unused'}).map(asset=>asset.id),['personal']);
  assert.ok(queryAssets(library,{query:'预设'}).length>=27);
  for(const asset of creativePresetAssets){
    assert.equal(asset.usageStatus,'preset');assert.equal(asset.reviewStatus,'ready');
    assert.ok(asset.physicalWidthMM>0&&asset.physicalHeightMM>0);
    const png=await imageBytes(asset);
    assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    const decoded=await loadImage(png);
    assert.equal(decoded.width,asset.physicalWidthMM*12);
    assert.equal(decoded.height,asset.physicalHeightMM*12);
  }
  const selected=creativePresetAssets.find(asset=>asset.kind==='sticker');
  const work=project('带预设的作品');work.drafts[0].items.push({assetID:selected.id});
  assert.equal(markProjectAssetsUsed(work,library).length,0);
  const sceneItem=itemFromAsset(selected,work.drafts[0],120,140);
  assert.equal(sceneItem.sourceBlobId,undefined);
  assert.equal(sceneItem.sourceStaticPath,selected.staticPath);
});

test('selected presets alone enter v3 ZIP and can repeat in the true Scene preview',async()=>{
  const sticker=creativePresetAssets.find(asset=>asset.id.endsWith('leaf-sprig'));
  const tape=creativePresetAssets.find(asset=>asset.id.endsWith('sage-check-tape'));
  const selected=[sticker,tape],previews=await Promise.all(selected.map(async(asset,index)=>({
    alias:'m'+(index+1),bytes:new Uint8Array(await imageBytes(asset))
  })));
  const handoff=await createOfflineHandoff({project:project('预设素材与表格'),assets:withCreativePresetAssets([]),
    aliases:{m1:sticker.id,m2:tape.id},previews,settings:{includeThumbnails:true}});
  const files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));
  const task=JSON.parse(strFromU8(files['TASK.json']));
  assert.deepEqual(task.materials.map(material=>material.usageStatus),['preset','preset']);
  assert.equal(Object.keys(files).filter(path=>/^assets\/m\d+\.png$/.test(path)).length,2);
  assert.equal(task.sourceContext.sourceSnapshots.every(snapshot=>snapshot.isCreativePreset),true);
  const assets=handoff.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
  const doc=webSceneDocument(handoff.source,handoff.source.baseDraft,'预设素材与表格');
  const operations=[
    {op:'material.add',id:'leaf-a',asset:'m1',place:at(40,54)},
    {op:'material.add',id:'leaf-b',asset:'m1',place:at(103,63)},
    {op:'material.tape',id:'tape-a',asset:'m2',place:at(45,103),path:{unit:'mm',points:[[-26,0],[26,0]]}},
    {op:'graphic.add',id:'weekly',geometry:{kind:'weeklyTable'},place:at(103,178),
      size:{width:89,height:50,unit:'mm'},style:{fill:null,stroke:'#607e72',strokeWidthMm:.42}}
  ];
  const result=applyCreationV2Batch(doc,batch(operations),assets);
  const ledger=buildMaterialLedger(attachSceneV2(result.page),assets);
  assert.deepEqual(ledger.units.filter(entry=>entry.assetId===sticker.id).map(entry=>entry.unit),[0,1]);
  assert.equal(ledger.rolls.length,1);
  assert.ok(shapeSVG(result.page.layers.find(node=>node.id==='weekly')).includes('M.04'));
  assert.equal(result.page.layers.filter(node=>node.type==='material').every(node=>!node.sourceBlobId&&node.sourceStaticPath),true);
  const materials=new Map(selected.map(asset=>[asset.id,asset]));
  const previousDocument=globalThis.document;
  globalThis.document={createElement:()=>createCanvas(1,1)};
  let rendered;
  try{rendered=await renderSceneCanvas(result.page,{scale:.7,createCanvas:()=>createCanvas(1,1),
    loadMaterialImage:async id=>loadImage(await imageBytes(materials.get(id))),
    loadShapeImage:source=>loadImage(Buffer.from(decodeURIComponent(source.split(',')[1])
      .replace('<svg ','<svg width="1000" height="1000" '))),waitForFonts:false});}
  finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
  const output=rendered.canvas.toBuffer('image/png');
  assert.deepEqual([...output.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.ok(output.byteLength>10000);
});
