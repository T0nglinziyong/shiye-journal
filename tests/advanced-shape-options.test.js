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
import {validateCreationV2Commands} from '../src/creation-v2-commands.js';

test('fine paper patterns support dense repeats and vertical stripes without expanding table limits',async()=>{
  const operation=kind=>({op:'graphic.add',id:'pattern',geometry:{kind,options:{rows:40,columns:44}},
    place:{reference:'page',at:[50,50],unit:'mm'},size:{width:80,height:100,unit:'mm'},style:{fill:null,stroke:'#112233',strokeWidthMm:.2}});
  const command=op=>({protocolVersion:2,transactionId:'dense',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[op]});
  for(const kind of ['grid','dots','stripes']){
    const op=operation(kind);
    assert.doesNotThrow(()=>validateCreationV2Commands(command(op)));
    assert.doesNotThrow(()=>validateShapeOptions(kind,op.geometry.options));
    assert.equal(advancedShapeControls(kind).find(c=>c.key==='columns').max,128);
    const svg=shapeSVG({id:kind,kind,width:320,height:400,shapeOptions:{...op.geometry.options,...(kind==='stripes'?{angle:90}:{})},stroke:'#112233',fill:null,lineWidth:.5});
    assert.ok(svg.length<18000,'dense patterns must remain compact');
    const loaded=await loadImage(Buffer.from(svg.replace('<svg ','<svg width="320" height="400" ')));
    assert.equal(loaded.width,320);
    if(kind==='stripes')assert.equal((svg.match(/ L/g)||[]).length,44);
    const invalid=operation(kind);invalid.geometry.options.columns=129;
    assert.throws(()=>validateCreationV2Commands(command(invalid)));
  }
  assert.throws(()=>validateCreationV2Commands(command(operation('weeklyTable'))));
  assert.throws(()=>validateShapeOptions('weeklyTable',{rows:40}));
  const lined=operation('linedNote');lined.geometry.options={rows:8,spacing:5};
  assert.throws(()=>validateCreationV2Commands(command(lined)),/spacing/);
});

test('dots stay round on narrow paper strips instead of inheriting the SVG box distortion',async()=>{
  for(const [width,height] of [[280,112],[112,280]]){
    const svg=shapeSVG({id:'round-dots',kind:'dots',width,height,fill:null,stroke:'#112233',lineWidth:0,
      shapeOptions:{rows:1,columns:1,dotSize:4.5,showOuterBorder:false}});
    const loaded=await loadImage(Buffer.from(svg.replace('<svg ',`<svg width="${width}" height="${height}" `)));
    const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');ctx.drawImage(loaded,0,0);
    const data=ctx.getImageData(0,0,width,height).data;let x0=width,y0=height,x1=0,y1=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>128){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    assert.ok(x1-x0>20,'visible dot');
    assert.ok(Math.abs((x1-x0)-(y1-y0))<=1,`dot must be circular on ${width}×${height}`);
  }
});

test('each parametric preset exposes bounded editable controls',()=>{
  assert.deepEqual(advancedShapeControls('grid').map(control=>control.key),
    ['rows','columns','showOuterBorder']);
  assert.doesNotThrow(()=>validateShapeOptions('grid',{spacing:18}),
    'existing saved grids keep their spacing until explicitly reconfigured');
  assert.deepEqual([...advancedShapeOptionKinds].sort(),[...advancedShapes.map(([kind])=>kind).filter(kind=>kind!=='vector'),'flower','star','arrow'].sort());
  for(const kind of advancedShapeOptionKinds){
    const controls=advancedShapeControls(kind);assert.ok(controls.length>0,kind);
    const base={...(kind==='paper'?{shapeOptions:{paperPattern:'grid',torn:true}}:{}),kind,id:'control-'+kind,width:150,height:100,fill:kind==='paper'?'#F5F1E7':null,stroke:'#75918d',lineWidth:2};
    for(const control of controls){
      const changed=control.type==='string'?control.enum.at(-1):control.type==='boolean'?false:control.max;
      assert.notEqual(shapeSVG(base),shapeSVG({...base,shapeOptions:{...base.shapeOptions,[control.key]:changed}}),`${kind}.${control.key} must affect the real renderer`);
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
    if(kind==='dots')assert.match(shapeSVG({...pattern,width:pattern.width*2}),/width="0\.125" height="0\.16666666666666666"/);
    else assert.equal((shapeSVG(pattern).match(/ L/g)||[]).length,(shapeSVG({...pattern,width:pattern.width*2}).match(/ L/g)||[]).length);
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
  for(const kind of ['paperclip','postageFrame','ticketFrame','archFrame','scallopFrame']){
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


test('structural parameters stay editable after Scene updates without changing the outside size',async()=>{
  const asset=creativePresetAssets[0];
  const handoff=await createOfflineHandoff({project:project('花边与花瓣'),assets:[asset],aliases:{m1:asset.id},
    previews:[{alias:'m1',bytes:new Uint8Array(await readFile('public'+asset.staticPath))}]});
  const document=webSceneDocument(handoff.source,handoff.source.baseDraft,'花边与花瓣');
  const changes=[['flower',{petals:8,petalDepth:.18}],['star',{points:7,innerRatio:.55}],
    ['arrow',{headLength:.2,shaftWidth:.15}],['archFrame',{archRise:.65,frameInset:.12}],
    ['scallopFrame',{lobes:8,lobeDepth:.045,frameInset:.06}]];
  const operations=changes.map(([kind],index)=>({op:'graphic.add',id:'param-'+kind,geometry:{kind},
    place:{reference:'page',at:[25+index*30,40],unit:'mm'},size:{width:24,height:30,unit:'mm'},
    style:{fill:null,stroke:'#547064',strokeWidthMm:.5}}));
  operations.push(...changes.map(([kind,options])=>({op:'layer.update',target:'param-'+kind,geometry:{kind,options}})));
  const result=applyCreationV2Batch(document,{protocolVersion:2,transactionId:'structural-controls',
    baseSceneRevision:'sha256:'+'0'.repeat(64),operations},
    handoff.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true})));
  const scale=result.page.canvas.height/result.page.physicalPageHeightMM;
  for(const [kind,options] of changes){
    const node=result.page.layers.find(layer=>layer.id==='param-'+kind);
    assert.deepEqual(node.shapeOptions,options);
    assert.ok(Math.abs(node.width-24*scale)<1e-6,kind);
    assert.ok(Math.abs(node.height-30*scale)<1e-6,kind);
    assert.equal(node.svgPaths,undefined);assert.equal(node.vectorPaths,undefined);
    assert.equal(shapeSVG(JSON.parse(JSON.stringify(node))),shapeSVG(node),'save/reload preserves the parametric rendering');
  }
  assert.throws(()=>validateShapeOptions('flower',{petals:3.5}),/范围/);
  assert.throws(()=>validateShapeOptions('archFrame',{archRise:.99}),/范围/);
  assert.throws(()=>validateShapeOptions('star',{petals:5}),/不支持/);
});

test('new curves remain inside the selectable bounds at extreme parameter values',async()=>{
  for(const kind of ['flower','star','arrow','archFrame','scallopFrame'])for(const endpoint of ['min','max']){
    const shape=configureShape({id:kind},kind);
    shape.fill='#e06048';shape.lineWidth=0;
    shape.shapeOptions=Object.fromEntries(advancedShapeControls(kind).filter(c=>c.type!=='boolean').map(c=>[c.key,c[endpoint]]));
    const svg=shapeSVG(shape);
    if(['flower','scallopFrame','archFrame'].includes(kind))assert.match(svg,/[CQA]/);
    const image=await loadImage(Buffer.from(svg.replace('<svg ','<svg width="300" height="300" ')));
    const canvas=createCanvas(300,300);canvas.getContext('2d').drawImage(image,0,0);
    const data=canvas.getContext('2d').getImageData(0,0,300,300).data;
    let ink=0;
    for(let y=0;y<300;y++)for(let x=0;x<300;x++){
      const alpha=data[(y*300+x)*4+3];if(alpha)ink++;
      if(x<4||y<4||x>=296||y>=296)assert.equal(alpha,0,`${kind}.${endpoint} clips at the frame edge`);
    }
    assert.ok(ink>1000,`${kind}.${endpoint} produces visible geometry`);
  }
});
