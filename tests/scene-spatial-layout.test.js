import test from 'node:test';
import assert from 'node:assert/strict';
import {attachSceneV2,groupSceneLayers,moveSceneNode,removeSceneNode,sceneLayerEntries,ungroupSceneLayers,validateSceneExtensions} from '../src/scene-v2.js';
import {applyScenePlacement,solveSceneLayout} from '../src/scene-layout.js';
import {spatialPath,worldBox} from '../src/scene-spatial.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {createCanvas,loadImage} from 'canvas';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} ≈ ${expected}`);
const shape=(id,x,y)=>({id,type:'shape',kind:'ellipse',x,y,width:40,height:30,rotation:0,zIndex:0,fill:'#334455'});
const page=()=>attachSceneV2({sceneVersion:2,canvas:{width:800,height:1000},physicalPageHeightMM:200,layers:[shape('a',120,140),shape('b',180,180),shape('c',360,350)]});
const world=(d,id)=>spatialPath(d.layers,id).world;

test('local group transform and reparent preserve world geometry through save and ungroup',()=>{
 const d=page(),before={a:world(d,'a'),b:world(d,'b'),c:world(d,'c')};
 groupSceneLayers(d,['a','b'],{id:'group-one',spatial:true,layoutBox:{width:180,height:160}});
 assert.notEqual(d.layers.find(n=>n.id==='group-one').children[0].x,before.a[4]);
 near(world(d,'a')[4],before.a[4]);near(world(d,'b')[5],before.b[5]);
 groupSceneLayers(d,['c', 'group-one'],{id:'group-two',spatial:true,layoutBox:{width:400,height:400}});
 near(world(d,'a')[4],before.a[4]);near(world(d,'c')[5],before.c[5]);
 const reopened=attachSceneV2(structuredClone(d));validateSceneExtensions(reopened);
 applyScenePlacement(reopened,'group-one',{reference:'page',at:[.5,.5],unit:'ratio',rotationDeg:23});
 const moved=world(reopened,'a');
 assert.notEqual(moved[4],before.a[4]);
 moveSceneNode(reopened,'a',{parentID:'group-two'});
 near(world(reopened,'a')[4],moved[4]);near(world(reopened,'a')[5],moved[5]);
 ungroupSceneLayers(reopened,'group-one');
 near(world(reopened,'a')[4],moved[4]);
 validateSceneExtensions(reopened);
});

test('linked layout survives serialization, follows target, and detaching bakes its current position',()=>{
 const d=page();
 applyScenePlacement(d,'b',{reference:'node:a',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,3],unit:'mm'},behavior:'linked'});
 const old=worldBox(d,'b').cy;
 d.layers.find(n=>n.id==='a').y+=60;
 solveSceneLayout(d);near(worldBox(d,'b').cy,old+60);
 const reopened=attachSceneV2(structuredClone(d));
 assert.equal(reopened.layers.find(n=>n.id==='b').layoutConstraint.place.behavior,'linked');
 validateSceneExtensions(reopened);
 const saved=worldBox(reopened,'b').cy;
 assert.throws(()=>removeSceneNode(reopened,'a'),/linked/);
 delete reopened.layers.find(n=>n.id==='b').layoutConstraint;
 reopened.layers.find(n=>n.id==='a').y+=30;
 solveSceneLayout(reopened);near(worldBox(reopened,'b').cy,saved);
});

test('layout reference cycles including descendant to ancestor are rejected',()=>{
 const d=page();
 d.layers.find(n=>n.id==='a').layoutConstraint={place:{reference:'node:b',at:[.5,.5],unit:'ratio',behavior:'linked'}};
 d.layers.find(n=>n.id==='b').layoutConstraint={place:{reference:'node:a',at:[.5,.5],unit:'ratio',behavior:'linked'}};
 assert.throws(()=>validateSceneExtensions(d),/循环/);
});

test('editor leaf projection reads and writes page coordinates while storage stays local',()=>{
 const d=page();groupSceneLayers(d,['a','b'],{id:'g',spatial:true,layoutBox:{width:140,height:140}});
 const raw=d.layers.find(n=>n.id==='g').children.find(n=>n.id==='a');
 const view=sceneLayerEntries(d).find(e=>e.value.id==='a').value;
 near(view.x,120);near(view.y,140);
 view.x=155;view.y=170;
 near(world(d,'a')[4],155);near(world(d,'a')[5],170);
 assert.notEqual(raw.x,155);
});

test('real Canvas preview preserves grouped image pixels and follows the group transform',async()=>{
 const d=page();d.pageMode='single';d.pageRatio='a4';d.physicalPageHeightMM=200;d.paperColor='#ffffff';
 d.layers=[{id:'photo',type:'material',assetID:'solid',x:120,y:140,width:40,height:30,rotation:0,generationBaseline:{},zIndex:0},shape('b',180,180)];
 const source=createCanvas(2,2);source.getContext('2d').fillStyle='#e63333';source.getContext('2d').fillRect(0,0,2,2);
 const image=await loadImage(source.toBuffer('image/png'));
 const render=()=>renderSceneCanvas(d,{createCanvas,loadMaterialImage:()=>image,waitForFonts:false,loadShapeImage:()=>image});
 const first=await render();
 groupSceneLayers(d,['photo','b'],{id:'g',spatial:true,layoutBox:{width:160,height:160}});
 const second=await render();
 assert.deepEqual([...first.canvas.getContext('2d').getImageData(120,140,1,1).data],[...second.canvas.getContext('2d').getImageData(120,140,1,1).data]);
 applyScenePlacement(d,'g',{reference:'page',at:[.65,.6],unit:'ratio'});
 const moved=worldBox(d,'photo'),third=await render();
 assert.ok(third.canvas.getContext('2d').getImageData(Math.round(moved.cx),Math.round(moved.cy),1,1).data[0]>200);
});
