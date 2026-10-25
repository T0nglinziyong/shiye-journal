import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {readFile} from 'node:fs/promises';
import {advancedShapeControls,advancedShapeOptionKinds,shapeRepeatCountPatch,validateShapeOptions} from '../src/advanced-shape-options.js';
import {advancedShapes,configureShape,shapeSVG} from '../src/editor-tools-model.js';
import {applyCreationV2Batch} from '../src/creation-v2-commands.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {creativePresetAssets} from '../src/creative-presets.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {toolContracts,validateValue} from '../src/creative-contract.js';

test('each parametric preset exposes bounded editable controls',()=>{
  assert.deepEqual(advancedShapeControls('grid').map(control=>control.key),
    ['rows','columns','showOuterBorder']);
  assert.doesNotThrow(()=>validateShapeOptions('grid',{spacing:18}),
    'existing saved grids keep their spacing until explicitly reconfigured');
  assert.deepEqual([...advancedShapeOptionKinds].sort(),advancedShapes.map(([kind])=>kind).filter(kind=>kind!=='vector').sort());
  for(const kind of advancedShapeOptionKinds){
    const controls=advancedShapeControls(kind);assert.ok(controls.length>0,kind);
    const base={kind,id:'control-'+kind,width:150,height:100,fill:null,stroke:'#75918d',lineWidth:2};
    for(const control of controls){
      const changed=control.type==='boolean'?false:control.max;
      assert.notEqual(shapeSVG(base),shapeSVG({...base,shapeOptions:{[control.key]:changed}}),`${kind}.${control.key} must affect the real renderer`);
    }
  }
  assert.throws(()=>validateShapeOptions('weeklyTable',{columns:0}),/范围/);
  assert.throws(()=>validateShapeOptions('weeklyTable',{surprise:true}),/不支持/);
});

test('resizing repeats keeps their count, while changing count keeps the cell pitch',()=>{
  const grid=configureShape({id:'grid'},'grid');
  const resized={...grid,width:grid.width*2,height:grid.height*1.5};
  assert.deepEqual(resized.shapeOptions,{rows:6,columns:8});
  assert.match(shapeSVG(resized),/width="0\.125" height="0\.16666666666666666"/);
  for(const kind of ['dots','stripes']){
    const pattern=configureShape({id:kind},kind);
    assert.deepEqual(pattern.shapeOptions,{rows:6,columns:8});
    assert.match(shapeSVG({...pattern,width:pattern.width*2}),/width="0\.125" height="0\.16666666666666666"/);
    assert.equal(shapeRepeatCountPatch(pattern,'columns',12).width,pattern.width*12/8);
  }
  const columns=shapeRepeatCountPatch(grid,'columns',12);
  assert.equal(columns.width,grid.width*12/8);
  assert.equal(columns.shapeOptions.rows,6);
  const rows=shapeRepeatCountPatch({...grid,...columns},'rows',9);
  assert.equal(rows.height,grid.height*9/6);
  const table=configureShape({id:'table'},'weeklyTable');
  const moreRows=shapeRepeatCountPatch(table,'rows',6);
  assert.equal(moreRows.height,table.height*2);
  assert.equal(moreRows.shapeOptions.rows,6);
  const wave=configureShape({id:'wave'},'wave');
  const extraWaves=shapeRepeatCountPatch(wave,'count',8);
  assert.equal(extraWaves.width,wave.width*2);
  assert.equal(extraWaves.height,undefined);
  const scallop=configureShape({id:'scallop'},'scallop');
  const moreLobes=shapeRepeatCountPatch(scallop,'count',20);
  assert.equal(moreLobes.width,scallop.width*2);
  assert.equal(moreLobes.height,scallop.height*2);
});

test('table and pattern fills, strokes and opacity are reflected in rendered SVG',()=>{
  for(const kind of ['weeklyTable','grid']){
    const shape=configureShape({id:kind},kind);
    Object.assign(shape,{fill:'#dcefd7',stroke:'#236f8f',lineWidth:4,
      fillOpacity:.45,strokeOpacity:.7});
    const svg=shapeSVG(shape);
    assert.match(svg,/fill="#dcefd7"/);
    assert.match(svg,/stroke="#236f8f"/);
    assert.match(svg,/fill-opacity="0\.45"/);
    assert.match(svg,/stroke-opacity="0\.7"/);
  }
});

test('paperclip and border graphics remain hollow and use the selected outline color',async()=>{
  for(const kind of ['paperclip','postageFrame','ticketFrame']){
    const node=configureShape({id:kind},kind);
    assert.equal(node.fill,null,kind);
    node.stroke='#e06048';
    const svg=shapeSVG(node);
    assert.match(svg,/stroke="#e06048"/);
    const image=await loadImage(Buffer.from(svg.replace('<svg ','<svg width="240" height="200" ')));
    const canvas=createCanvas(240,200);canvas.getContext('2d').drawImage(image,0,0);
    const data=canvas.getContext('2d').getImageData(0,0,240,200).data;
    const center=(100*240+120)*4;
    assert.equal(data[center+3],0,`${kind} must leave the writing area transparent`);
    let tinted=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>180&&data[i]>data[i+1]+50)tinted++;
    assert.ok(tinted>40,`${kind} must show the chosen outline color`);
  }
});

test('AI primitive tools expose the same advanced shapes and editable parameters',()=>{
  for(const kind of advancedShapeOptionKinds){
    const [control]=advancedShapeControls(kind);
    const options={[control.key]:control.type==='boolean'?false:control.min};
    assert.doesNotThrow(()=>validateValue({items:[{key:'advanced',kind,shape_options:options}]},toolContracts.upsert_primitives),kind);
  }
});

test('unified Scene commands create and revise the new parametric graphics',async()=>{
  const asset=creativePresetAssets[0];
  const handoff=await createOfflineHandoff({project:project('邮票与票根'),assets:[asset],aliases:{m1:asset.id},
    previews:[{alias:'m1',bytes:new Uint8Array(await readFile('public'+asset.staticPath))}]});
  const document=webSceneDocument(handoff.source,handoff.source.baseDraft,'邮票与票根');
  const operations=['paperclip','postageFrame','ticketFrame'].map((kind,index)=>({
    op:'graphic.add',id:`graphic-${index}`,geometry:{kind},
    place:{reference:'page',at:[35+index*40,40],unit:'mm'},size:{width:24,height:30,unit:'mm'},
    style:{fill:null,stroke:'#c3755d',strokeWidthMm:.6}}));
  operations.push({op:'layer.update',target:'graphic-1',geometry:{kind:'postageFrame',options:{count:8,showInnerBorder:false}}});
  const result=applyCreationV2Batch(document,{protocolVersion:2,transactionId:'new-graphics',
    baseSceneRevision:'sha256:'+'0'.repeat(64),operations},
    handoff.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true})));
  for(const [index,kind] of ['paperclip','postageFrame','ticketFrame'].entries()){
    const node=result.page.layers.find(item=>item.id===`graphic-${index}`);
    assert.equal(node.kind,kind);assert.equal(node.fill,null);assert.equal(node.stroke,'#c3755d');
  }
  assert.deepEqual(result.page.layers.find(item=>item.id==='graphic-1').shapeOptions,{count:8,showInnerBorder:false});
  const changed=result.page.layers.find(item=>item.id==='graphic-1');
  const scenePerMM=result.page.canvas.height/result.page.physicalPageHeightMM;
  assert.ok(Math.abs(changed.width-24*scenePerMM*.8)<1e-6);
  assert.ok(Math.abs(changed.height-30*scenePerMM*.8)<1e-6);
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
