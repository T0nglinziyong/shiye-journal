import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
const testPage=node=>({sceneVersion:2,canvas:{width:1000,height:1000},physicalPageHeightMM:297,layers:[node]});
import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanvas,loadImage} from 'canvas';
import * as fabric from 'fabric/node';
import {createFabricSceneBridge} from '../src/fabric-scene-bridge.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';

const bridge=createFabricSceneBridge(fabric);

test('Fabric projects a Scene shape without changing its saved geometry',async()=>{
  const node={id:'shape-1',type:'shape',kind:'roundedRectangle',x:230,y:160,
    width:140,height:90,rotation:12,fill:'#aabbcc',stroke:'#112233',lineWidth:3,opacity:.7};
  const before=structuredClone(node),object=await bridge.fromNode(node);
  assert.equal(object.sceneID,node.id);
  assert.equal(object.sceneType,'shape');
  assert.equal(object.angle,12);
  assert.equal(object.opacity,.7);
  assert.deepEqual(node,before);
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  for(const key of ['x','y','width','height','rotation','opacity'])
    assert.ok(Math.abs(node[key]-before[key])<.001,key+' changed');
});

test('Fabric text edits round-trip through the existing Scene text record',async()=>{
  const node={id:'text-1',type:'text',content:'原文',x:210,y:105,width:180,height:95,
    fontSize:40,style:'serif',color:'#30463d',alignment:'center',rotation:0};
  const object=await bridge.fromNode(node);
  assert.equal(object.text,'原文');
  object.set({text:'新文字',left:250,top:70,scaleX:1.2});
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.equal(node.content,'新文字');
  assert.ok(Math.abs(node.x-250)<1e-9);
  assert.ok(Math.abs(node.y-117.5)<1e-9);
  assert.equal(node.width,216);
  assert.equal(node.height,95);
});

test('text corner scaling updates typography while a side resize only reflows',async()=>{
  const node={id:'text-scale',type:'text',content:'你好 A',x:210,y:105,width:180,height:95,
    fontSize:40,fixedLineHeight:52,letterSpacing:2,style:'serif',color:'#30463d'};
  const side=await bridge.fromNode(node);
  side.set({scaleX:1.5,scaleY:1});bridge.applyObject(testPage(node),side,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.equal(node.width,270);
  assert.equal(node.fontSize,40);
  const corner=await bridge.fromNode(node);
  corner.set({scaleX:2,scaleY:2});bridge.applyObject(testPage(node),corner,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.equal(node.width,540);
  assert.equal(node.fontSize,80);
  assert.equal(node.fixedLineHeight,104);
  assert.equal(node.letterSpacing,4);
});

test('Fabric text keeps its paper-space frame center after rotation and grows on input',async()=>{
  const node={id:'text-rotate',type:'text',content:'甲',x:200,y:180,width:180,height:95,
    fontSize:40,style:'serif',color:'#30463d',rotation:30};
  const object=await bridge.fromNode(node);
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.ok(Math.abs(node.x-200)<.001);
  assert.ok(Math.abs(node.y-180)<.001);
  assert.equal(node.rotation,30);
  object.set({text:'甲\n乙\n丙\n丁\n戊'});
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.ok(node.height>=95);
  assert.equal(node.content,'甲\n乙\n丙\n丁\n戊');
});
test('curved text projects the same visible arc in Fabric and the Scene exporter',async()=>{
  const node={id:'arc-title',type:'text',content:'HELLO',x:160,y:90,width:240,height:95,
    fontSize:34,curveHeight:-28,style:'sans',color:'#254637',alignment:'center',rotation:0};
  const draft={sceneVersion:2,canvas:{width:320,height:180},paperColor:'#ffffff',
    paperPattern:'plain',layers:[node]};
  const display=new fabric.StaticCanvas(null,{width:320,height:180,backgroundColor:'#ffffff'});
  try{
    display.add(await bridge.fromNode(node));display.renderAll();
    const exported=(await renderSceneCanvas(draft,{waitForFonts:false,
      createCanvas:()=>createCanvas(1,1)})).canvas;
    const imageA=display.getContext().getImageData(0,0,320,180).data;
    const imageB=exported.getContext('2d').getImageData(0,0,320,180).data;
    const bounds=data=>{const xs=[],ys=[];for(let y=0;y<180;y++)for(let x=0;x<320;x++){
      const i=(y*320+x)*4;if(data[i]<180&&data[i+1]<180&&data[i+2]<180){xs.push(x);ys.push(y);}
    }return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];};
    const a=bounds(imageA),b=bounds(imageB);
    for(let i=0;i<4;i++)assert.ok(Math.abs(a[i]-b[i])<=3,`arc bound ${i}: ${a[i]} vs ${b[i]}`);
  }finally{await display.dispose();}
});

test('Fabric material projection preserves crop and a compound physical mask',async()=>{
  const image=createCanvas(40,20);
  image.getContext('2d').fillRect(0,0,40,20);
  const node={id:'material-1',type:'material',assetID:'asset-1',x:120,y:100,
    width:200,height:80,rotation:0,opacity:1,
    cropRect:{x:.25,y:0,width:.5,height:1},
    materialMask:{shape:'compound',outer:{shape:'rounded',radius:.1},
      holes:[{shape:'rectangle',box:[.35,.35,.3,.3]}]}};
  let loaded=0;
  const object=await createFabricSceneBridge(fabric,{assetURL:async()=>{
    loaded++;return image.toDataURL();
  }}).fromNode(node);
  assert.equal(loaded,1);
  assert.equal(object.width,20);
  assert.equal(object.height,20);
  assert.equal(object.cropX,10);
  assert.equal(object.cropY,0);
  assert.ok(object.clipPath?.path?.length>10);
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.deepEqual(node.cropRect,{x:.25,y:0,width:.5,height:1});
  assert.equal(node.width,200);
  assert.equal(node.height,80);
});

test('Fabric ink projection retains its editable stroke identity',async()=>{
  const node={id:'ink-1',type:'ink',points:[{x:10,y:20,p:.4},{x:20,y:30,p:.8}],
    width:4,color:'#123456'};
  const object=await bridge.fromNode(node);
  assert.equal(object.sceneID,'ink-1');
  assert.equal(object.stroke,'#123456');
  assert.equal(object.selectable,false);
  assert.equal(object.evented,false);
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.deepEqual(node.points,[{x:10,y:20,p:.4},{x:20,y:30,p:.8}]);
});

test('Fabric ink rotation writes transformed points without losing pressure',async()=>{
  const node={id:'ink-rotate',type:'ink',points:[{x:10,y:20,p:.4},{x:30,y:20,p:.8}],
    width:4,color:'#123456'};
  const object=await bridge.fromNode(node),center=object.getCenterPoint();
  object.set({angle:90});
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.ok(Math.abs(node.points[0].x-center.x)<.001);
  assert.ok(Math.abs(node.points[1].x-center.x)<.001);
  assert.ok(Math.abs(node.points[0].y-(center.y-10))<.001);
  assert.ok(Math.abs(node.points[1].y-(center.y+10))<.001);
  assert.deepEqual(node.points.map(point=>point.p),[.4,.8]);
});

test('new pressure ink projects as one editable filled Fabric object',async()=>{
  const node={id:'pressure-1',type:'ink',penStyle:'pressure',width:3,color:'#123456',
    points:[{x:10,y:20,p:.2},{x:30,y:22,p:.8},{x:50,y:30,p:.4}]};
  const object=await bridge.fromNode(node);
  assert.equal(object.sceneID,node.id);
  assert.equal(object.fill,node.color);
  assert.equal(object.stroke,null);
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.deepEqual(node.points,[{x:10,y:20,p:.2},{x:30,y:22,p:.8},{x:50,y:30,p:.4}]);
});

test('Fabric group move and rotation write through to absolute Scene child geometry',async()=>{
  const node={id:'group-1',type:'group',children:[
    {id:'child-1',type:'shape',kind:'rectangle',x:100,y:100,width:40,height:30,rotation:0},
    {id:'child-2',type:'shape',kind:'rectangle',x:200,y:100,width:40,height:30,rotation:15}
  ]};
  const object=await bridge.fromNode(node),before=object.getCenterPoint();
  assert.deepEqual(Object.keys(object.controls).sort(),['br','mb','ml','mr','mt']);
  object.set({left:object.left+20,top:object.top+10,angle:90});
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  const after=object.getCenterPoint();
  // The group center is calculated by Fabric; no child gets a new size.
  assert.ok(Math.abs(node.children[0].x-(after.x-(100-before.y)))<.001);
  assert.ok(Math.abs(node.children[0].y-(after.y+(100-before.x)))<.001);
  assert.equal(node.children[0].rotation,90);
  assert.equal(node.children[1].rotation,105);
  assert.equal(node.children[0].width,40);
  assert.equal(node.children[1].height,30);
  const snapshot=structuredClone(node.children);
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.deepEqual(node.children,snapshot);
});

test('manual group resize scales material appearance without changing its source identity',async()=>{
  const image=createCanvas(20,20);image.getContext('2d').fillRect(0,0,20,20);
  const grouped=createFabricSceneBridge(fabric,{assetURL:()=>image.toDataURL()});
  const node={id:'arrangement',type:'group',children:[
    {id:'physical',type:'material',assetID:'a',x:100,y:120,width:40,height:30},
    {id:'letter',type:'text',content:'字',x:200,y:120,width:80,height:40,fontSize:20}
  ]};
  const object=await grouped.fromNode(node);
  object.set({scaleX:1.5,scaleY:1.5});
  grouped.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.equal(node.children[0].width,60);
  assert.equal(node.children[0].height,45);
  assert.equal(node.children[0].manualVisualResize,true);
  assert.equal(node.children[0].assetID,'a');
  assert.equal(node.children[1].width,120);
  assert.equal(node.children[1].fontSize,30);
  assert.ok(node.children[1].x-node.children[0].x>100);
});

test('a group containing a locked child cannot be transformed through Fabric',async()=>{
  const node={id:'locked-group',type:'group',children:[
    {id:'locked-child',type:'shape',kind:'rectangle',x:100,y:100,
      width:40,height:30,locked:true}]};
  const object=await bridge.fromNode(node);
  assert.equal(object.selectable,false);
  assert.equal(object.evented,false);
  object.set({left:object.left+30});
  assert.throws(()=>bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true}),/锁定/);
  assert.equal(node.children[0].x,100);
});

test('Fabric material edge controls resize its Scene placement and keep the source asset unchanged',async()=>{
  const image=createCanvas(40,20);
  const node={id:'material-locked-size',type:'material',assetID:'asset-1',x:120,y:100,
    width:200,height:80,rotation:0,opacity:1};
  const object=await createFabricSceneBridge(fabric,{assetURL:()=>image.toDataURL()}).fromNode(node);
  assert.equal(object.lockScalingX,false);
  assert.equal(object.lockScalingY,false);
  assert.equal(object.controls.ml.visible,true);
  assert.equal(object.controls.mr.visible,true);
  assert.equal(object.controls.mt.visible,true);
  assert.equal(object.controls.mb.visible,true);
  assert.equal(object.controls.br.visible,true);
  assert.deepEqual(Object.keys(object.controls).sort(),['br','mb','ml','mr','mt']);
  const startScale=object.scaleX;
  assert.equal(object.controls.br.actionHandler({},
    {target:object,ex:220,ey:140,theta:0,scaleX:object.scaleX,scaleY:object.scaleY},230,170),true);
  assert.ok(object.scaleX>startScale&&object.angle>3,
    'The single bottom-right grip must scale and rotate together');
  bridge.applyObject(testPage(node),object,{policy:USER_SCENE_POLICY,confirm:()=>true});
  assert.ok(node.width>200&&node.rotation>3);
  assert.equal(node.manualVisualResize,true);
  assert.equal(node.assetID,'asset-1');
});

test('Fabric leaf and group vector masks match the Scene export at sampled pixels',async()=>{
  const canvasSize={width:200,height:200};
  const image=createCanvas(100,100),ctx=image.getContext('2d');
  ctx.fillStyle='#ff0000';ctx.fillRect(0,0,100,100);
  const leftHalf={outer:[[0,0],[.5,0],[.5,1],[0,1]],holes:[]};
  const layers=[
    {id:'masked-shape',type:'shape',kind:'rectangle',x:50,y:50,width:70,height:70,
      fill:'#0000ff',vectorMask:leftHalf},
    {id:'masked-material',type:'material',assetID:'red',x:100,y:100,width:100,height:100,
      materialMask:{shape:'polygon',points:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]]},
      vectorMask:{outer:[[0,0],[.6,0],[.6,1],[0,1]],
        holes:[[[.2,.2],[.4,.2],[.4,.4],[.2,.4]]]}},
    {id:'masked-group',type:'group',vectorMask:leftHalf,children:[
      {id:'group-shape',type:'shape',kind:'rectangle',x:100,y:170,width:100,height:40,fill:'#00aa00'}]}
  ];
  const draft={id:'masked-draft',sceneVersion:2,canvas:canvasSize,
    paperColor:'#ffffff',paperPattern:'plain',layers};
  const display=new fabric.StaticCanvas(null,{...canvasSize,backgroundColor:'#ffffff'});
  const projection=createFabricSceneBridge(fabric,{assetURL:()=>image.toDataURL(),canvasSize});
  try{
    for(const node of layers)display.add(await projection.fromNode(node));
    display.renderAll();
    const reference=(await renderSceneCanvas(draft,{waitForFonts:false,
      createCanvas:()=>createCanvas(1,1),loadMaterialImage:async()=>image,
      loadShapeImage:uri=>loadImage(Buffer.from(decodeURIComponent(uri.split(',')[1])
        .replace('<svg ','<svg width="1000" height="1000" ')))})).canvas;
    const actual=display.getContext(),expected=reference.getContext('2d');
    for(const [x,y] of [[30,50],[65,50],[60,60],[80,80],[105,100],
      [135,100],[65,130],[75,170],[125,170]]){
      const pixel=[...actual.getImageData(x,y,1,1).data];
      const target=[...expected.getImageData(x,y,1,1).data];
      assert.deepEqual(pixel,target,`mask mismatch at ${x},${y}`);
    }
  }finally{await display.dispose();}
});

test('Fabric group masks require a real page size and invalid vectors fail visibly',async()=>{
  const group={id:'g',type:'group',vectorMask:{outer:[[0,0],[1,0],[1,1],[0,1]]},
    children:[{id:'s',type:'shape',kind:'rectangle',x:100,y:100,width:50,height:50}]};
  await assert.rejects(bridge.fromNode(group),/缺少画布尺寸/);
  const invalid={id:'invalid',type:'shape',kind:'rectangle',x:100,y:100,width:50,height:50,
    vectorMask:{outer:[[0,0],[2,0],[1,1]]}};
  await assert.rejects(bridge.fromNode(invalid),/蒙版轮廓坐标无效/);
});

test('group initial selection uses transformed member frames and excludes the empty middle',async()=>{
  const {selectableFabricObjectAt}=await import('../src/fabric-hit-test.js');
  const node={id:'hit-group',type:'group',children:[
    {id:'hit-left',type:'shape',kind:'rectangle',x:50,y:60,width:20,height:20,fill:'#123456'},
    {id:'hit-right',type:'shape',kind:'rectangle',x:250,y:60,width:20,height:20,fill:'#123456'}]};
  const group=await bridge.fromNode(node);
  group.set({angle:35});group.setCoords();
  const canvas=new fabric.Canvas(null,{width:400,height:300});canvas.add(group);
  const center=group.getCenterPoint(),member=group.getObjects()[0].getCenterPoint();
  assert.equal(group.containsPoint(center),true);
  assert.equal(selectableFabricObjectAt(canvas,group,center,center),false);
  assert.equal(selectableFabricObjectAt(canvas,group,member,member),true);
  await canvas.dispose();
});
