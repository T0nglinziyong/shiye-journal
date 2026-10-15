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
  bridge.applyObject(node,object);
  for(const key of ['x','y','width','height','rotation','opacity'])
    assert.ok(Math.abs(node[key]-before[key])<.001,key+' changed');
});

test('Fabric text edits round-trip through the existing Scene text record',async()=>{
  const node={id:'text-1',type:'text',content:'原文',x:210,y:105,width:180,height:95,
    fontSize:40,style:'serif',color:'#30463d',alignment:'center',rotation:0};
  const object=await bridge.fromNode(node);
  assert.equal(object.text,'原文');
  object.set({text:'新文字',left:250,top:70,scaleX:1.2});
  bridge.applyObject(node,object);
  assert.equal(node.content,'新文字');
  assert.equal(node.x,250);
  assert.equal(node.y,117.5);
  assert.equal(node.width,216);
  assert.equal(node.height,95);
});

test('Fabric text keeps its paper-space frame center after rotation and grows on input',async()=>{
  const node={id:'text-rotate',type:'text',content:'甲',x:200,y:180,width:180,height:95,
    fontSize:40,style:'serif',color:'#30463d',rotation:30};
  const object=await bridge.fromNode(node);
  bridge.applyObject(node,object);
  assert.ok(Math.abs(node.x-200)<.001);
  assert.ok(Math.abs(node.y-180)<.001);
  assert.equal(node.rotation,30);
  object.set({text:'甲\n乙\n丙\n丁\n戊'});
  bridge.applyObject(node,object);
  assert.ok(node.height>=95);
  assert.equal(node.content,'甲\n乙\n丙\n丁\n戊');
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
  bridge.applyObject(node,object);
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
  bridge.applyObject(node,object);
  assert.deepEqual(node.points,[{x:10,y:20,p:.4},{x:20,y:30,p:.8}]);
});

test('Fabric ink rotation writes transformed points without losing pressure',async()=>{
  const node={id:'ink-rotate',type:'ink',points:[{x:10,y:20,p:.4},{x:30,y:20,p:.8}],
    width:4,color:'#123456'};
  const object=await bridge.fromNode(node),center=object.getCenterPoint();
  object.set({angle:90});
  bridge.applyObject(node,object);
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
  bridge.applyObject(node,object);
  assert.deepEqual(node.points,[{x:10,y:20,p:.2},{x:30,y:22,p:.8},{x:50,y:30,p:.4}]);
});

test('Fabric group move and rotation write through to absolute Scene child geometry',async()=>{
  const node={id:'group-1',type:'group',children:[
    {id:'child-1',type:'shape',kind:'rectangle',x:100,y:100,width:40,height:30,rotation:0},
    {id:'child-2',type:'shape',kind:'rectangle',x:200,y:100,width:40,height:30,rotation:15}
  ]};
  const object=await bridge.fromNode(node),before=object.getCenterPoint();
  assert.equal(object.lockScalingX,true);
  object.set({left:object.left+20,top:object.top+10,angle:90});
  bridge.applyObject(node,object);
  const after=object.getCenterPoint();
  // The group center is calculated by Fabric; no child gets a new size.
  assert.ok(Math.abs(node.children[0].x-(after.x-(100-before.y)))<.001);
  assert.ok(Math.abs(node.children[0].y-(after.y+(100-before.x)))<.001);
  assert.equal(node.children[0].rotation,90);
  assert.equal(node.children[1].rotation,105);
  assert.equal(node.children[0].width,40);
  assert.equal(node.children[1].height,30);
  const snapshot=structuredClone(node.children);
  bridge.applyObject(node,object);
  assert.deepEqual(node.children,snapshot);
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
  assert.equal(object.controls.rotateBottomRight.visible,true);
  object.set({scaleX:object.scaleX*1.2});
  bridge.applyObject(node,object);
  assert.equal(node.width,240);
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
