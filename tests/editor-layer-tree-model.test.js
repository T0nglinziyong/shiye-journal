import test from 'node:test';
import assert from 'node:assert/strict';
import {attachSceneV2,groupSceneLayers,moveSceneNode} from '../src/scene-model.js';
import {sceneLayerOutline,layerMoveTarget} from '../src/editor-layer-tree.js';
const draft=()=>attachSceneV2({sceneVersion:2,canvas:{width:707,height:1000},layers:[{id:'A',type:'shape',kind:'ellipse',zIndex:1,x:10,y:10,width:10,height:10},{id:'B',type:'shape',kind:'ellipse',zIndex:2,x:20,y:20,width:10,height:10},{id:'C',type:'shape',kind:'ellipse',zIndex:3,x:30,y:30,width:10,height:10}]});
test('tree retains nested membership rather than global flattened zIndex list',()=>{
 const d=draft();groupSceneLayers(d,['A','B'],{id:'G'});
 const outline=sceneLayerOutline(d.layers);
 assert.equal(outline.length,4);
 assert.ok(outline.some(n=>n.id==='G'&&n.level===1));
 assert.ok(outline.some(n=>n.id==='A'&&n.level===2));
 assert.ok(outline.some(n=>n.id==='C'&&n.level===1));
});
test('same-parent drag before/after and group interior preserve explicit Scene membership',()=>{
 const d=draft();
 const to=layerMoveTarget(d,'A','C','after');moveSceneNode(d,'A',to);
 assert.equal(d.layers.at(-1).id,'A');
 groupSceneLayers(d,['A','B'],{id:'G'});
 const out=layerMoveTarget(d,'C','G','inside');moveSceneNode(d,'C',out);
 assert.equal(d.layers.find(n=>n.id==='G').children.at(-1).id,'C');
 const root=layerMoveTarget(d,'C','A','after');assert.equal(root.parentID,'G');
});

test('clicking one leaf selects it and reordering never dismisses nested tree popover',async()=>{
 const {Window}=await import('happy-dom');
 const w=new Window({url:'https://example.test'});
 const saved={window:globalThis.window,document:globalThis.document,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight,ResizeObserver:globalThis.ResizeObserver};
 Object.assign(globalThis,{window:w,document:w.document,innerWidth:390,innerHeight:850,ResizeObserver:w.ResizeObserver});
 try{
  const {openEditorLayerTree}=await import('../src/editor-layer-tree.js');
  const anchor=w.document.createElement('button');w.document.body.append(anchor);
  const state={selected:null,multiSelected:[],selectedStrokes:[],sceneSelectedGroup:null};
  const calls={render:0,save:0,refresh:0};
  const h=openEditorLayerTree(anchor,{draft:draft(),state,view:{editorRefresh:()=>calls.refresh++,canvasSelectionRefresh:()=>{}},checkpoint:()=>{},saveProject:()=>calls.save++,render:()=>calls.render++,toast:()=>{},uid:()=> 'group-test',asset:()=>({title:'素材'})});
  const rows=h.surface.querySelectorAll('[role="treeitem"]');assert.equal(rows.length,3);
  rows[0].querySelector('[data-layer-pick]').click();assert.equal(state.selected,'C');assert.ok(calls.refresh);
  const move=rows[0].querySelector('[aria-label="下移一层"]');move.click();
  assert.equal(calls.render,1);assert.equal(calls.save,1);
  assert.ok(h.surface.isConnected,'popover remains mounted after a layer operation');
  assert.equal(h.surface.querySelectorAll('[role="treeitem"]').length,3);
  w.document.body.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}));
  assert.equal(h.surface.isConnected,true,'canvas pointer must not dismiss persistent layer tree');
  h.close();
 }finally{
  for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  await w.happyDOM.close();
 }
});
