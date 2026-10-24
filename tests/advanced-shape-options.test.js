import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {readFile} from 'node:fs/promises';
import {advancedShapeControls,advancedShapeOptionKinds,validateShapeOptions} from '../src/advanced-shape-options.js';
import {shapeSVG} from '../src/editor-tools-model.js';
import {applyCreationV2Batch} from '../src/creation-v2-commands.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {creativePresetAssets} from '../src/creative-presets.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';

test('each parametric preset exposes bounded editable controls',()=>{
  assert.equal(advancedShapeOptionKinds.length,20);
  for(const kind of advancedShapeOptionKinds){
    const controls=advancedShapeControls(kind);assert.ok(controls.length>0,kind);
    const base={kind,id:'control-'+kind,width:150,height:100,fill:null,stroke:'#75918d',lineWidth:2};
    for(const control of controls){
      const changed=control.type==='boolean'?!((control.key==='showOuterBorder'||control.key==='showInnerLines'||control.key==='showHeader'||control.key==='showMarkers')):control.max;
      assert.notEqual(shapeSVG(base),shapeSVG({...base,shapeOptions:{[control.key]:changed}}),`${kind}.${control.key} must affect the real renderer`);
    }
  }
  assert.throws(()=>validateShapeOptions('weeklyTable',{columns:0}),/范围/);
  assert.throws(()=>validateShapeOptions('weeklyTable',{surprise:true}),/不支持/);
});

test('table cells and border options are preserved in Scene commands and raster',async()=>{
  const asset=creativePresetAssets[0];
  const handoff=await createOfflineHandoff({project:project('参数图形'),assets:[asset],aliases:{m1:asset.id},
    previews:[{alias:'m1',bytes:new Uint8Array(await readFile('public'+asset.staticPath))}],
    settings:{includeThumbnails:true}});
  const document=webSceneDocument(handoff.source,handoff.source.baseDraft,'参数图形');
  const operation={op:'graphic.add',id:'editable-table',geometry:{kind:'weeklyTable',
    options:{rows:4,columns:3,showOuterBorder:false,showHeader:false}},
    place:{reference:'page',at:[80,80],unit:'mm'},size:{width:70,height:45,unit:'mm'},
    style:{fill:null,stroke:'#82a8a0',strokeWidthMm:.5}};
  const result=applyCreationV2Batch(document,{protocolVersion:2,transactionId:'shape-controls',
    baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[operation,
      {op:'layer.update',target:'editable-table',geometry:{kind:'weeklyTable',options:{rows:6}}}]},
    handoff.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true})));
  const node=result.page.layers.find(item=>item.id==='editable-table');
  assert.deepEqual(node.shapeOptions,{...operation.geometry.options,rows:6});
  const svg=shapeSVG(node);
  assert.ok(!svg.includes('<rect x=".04" y=".08"'));
  assert.equal((svg.match(/V0\.94/g)||[]).length,2);
  const image=await loadImage(Buffer.from(svg.replace('<svg ','<svg width="280" height="180" ')));
  const canvas=createCanvas(280,180);canvas.getContext('2d').drawImage(image,0,0);
  const data=canvas.getContext('2d').getImageData(0,0,280,180).data;
  const colors=[];for(let i=0;i<data.length;i+=4)if(data[i+3]>200)colors.push([data[i],data[i+1],data[i+2]]);
  assert.ok(colors.length>200);
  assert.ok(colors.some(([r,g,b])=>g>r&&b>r),'table must render in the chosen tint, not black');
});
