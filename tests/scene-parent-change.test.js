import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {applyScenePlacement,bindSceneSize,solveSceneLayout} from '../src/scene-layout.js';
import {groupEditableScene,moveEditableScene,ungroupEditableScene} from '../src/scene-structure-edit.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {findSceneNode,validateSceneExtensions} from '../src/scene-v2.js';
import {rigidMatrix,worldBox} from '../src/scene-spatial.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {draft,setDraftPaperSize} from '../src/domain.js';
const user={policy:USER_SCENE_POLICY};
const shape=(id,x,y)=>({id,type:'shape',kind:'ellipse',x,y,width:80,height:60,rotation:12,fill:'#54715d',zIndex:1});
const page=()=>({...draft(),layers:[{id:'old',type:'group',localTransform:rigidMatrix(220,320,25),layoutBox:{width:250,height:300},children:[shape('a',-40,-20),{...shape('b',60,70),zIndex:2}],zIndex:1},{id:'new',type:'group',localTransform:rigidMatrix(450,550,-31),layoutBox:{width:330,height:180},children:[shape('c',0,0)],zIndex:2}]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const sameBox=(a,b)=>{for(const key of ['cx','cy','w','h','rotation'])near(a[key],b[key]);};
function link(d,id){
 const node=findSceneNode(d,id);
 bindSceneSize(d,node,{reference:'parent',width:.3,height:.2,unit:'ratio',aspect:'free',behavior:'linked'});
 applyScenePlacement(d,id,{reference:'parent',at:[.3,.4],unit:'ratio',behavior:'linked',rotationDeg:8});
}

test('reparenting into rotated groups keeps current pose and size, then follows the new parent',()=>{
 const d=page();link(d,'a');const before=worldBox(d,'a');
 moveEditableScene(d,'a',{parentID:'new'},user);sameBox(worldBox(d,'a'),before);
 const a=findSceneNode(d,'a'),parent=findSceneNode(d,'new');
 near(a.layoutConstraint.size.width,75/330);near(a.layoutConstraint.size.height,60/180);
 parent.localTransform[4]+=23;parent.localTransform[5]-=17;solveSceneLayout(d);
 near(worldBox(d,'a').cx,before.cx+23);near(worldBox(d,'a').cy,before.cy-17);
 parent.layoutBox.width*=2;parent.layoutBox.height*=2;solveSceneLayout(d);
 near(worldBox(d,'a').w,before.w*2);near(worldBox(d,'a').h,before.h*2);
 validateSceneExtensions(d);
});

test('spatial grouping and ungrouping retain parent links and explicit node followers without jumps',()=>{
 const d=page();link(d,'a');
 applyScenePlacement(d,'b',{reference:'node:a',referenceAnchor:'bottom-center',anchor:'top-center',behavior:'linked'});
 const before=['a','b'].map(id=>worldBox(d,id));
 groupEditableScene(d,['a','b'],{id:'inner',spatial:true},user);
 ['a','b'].forEach((id,i)=>sameBox(worldBox(d,id),before[i]));
 const group=findSceneNode(d,'inner');assert.ok(group.layoutBox.width>0&&group.localTransform);
 ungroupEditableScene(d,'inner',user);
 ['a','b'].forEach((id,i)=>sameBox(worldBox(d,id),before[i]));
 moveEditableScene(d,'a',{},user);sameBox(worldBox(d,'a'),before[0]);
 solveSceneLayout(d);sameBox(worldBox(d,'b'),before[1]);
 validateSceneExtensions(d);
});

test('linked text retains requested minimum height rather than converting actual overflow into a new constraint',()=>{
 const d=page(),parent=findSceneNode(d,'old');
 parent.children[0]={id:'a',type:'text',content:'写下一些具体的想法。'.repeat(30),x:0,y:0,width:75,height:20,fontSize:16,color:'#334455',zIndex:1};
 link(d,'a');const before=worldBox(d,'a'),min=findSceneNode(d,'a').textLayout.minimumHeight;
 assert.ok(before.h>min);
 moveEditableScene(d,'a',{parentID:'new'},user);sameBox(worldBox(d,'a'),before);
 near(findSceneNode(d,'a').textLayout.minimumHeight,min);
});

test('invalid parent destination rolls back geometry, links and array identities',()=>{
 const d=page();link(d,'a');delete findSceneNode(d,'new').layoutBox;
 const before=structuredClone(d),a=findSceneNode(d,'a'),children=findSceneNode(d,'old').children;
 assert.throws(()=>moveEditableScene(d,'a',{parentID:'new'},user),/layoutBox/);
 assert.deepEqual(JSON.parse(JSON.stringify(d)),before);assert.equal(findSceneNode(d,'a'),a);assert.equal(findSceneNode(d,'old').children,children);
});

test('rotated local grouping preserves actual Canvas PNG through save and reopen',async()=>{
 const d=page();link(d,'a');
 const render=async page=>(await renderSceneCanvas(page,{createCanvas,loadShapeImage:(uri,frame)=>loadImage(Buffer.from(decodeURIComponent(uri.split(',').slice(1).join(',')).replace('<svg ',`<svg width="${Math.ceil(frame.width-1e-9)}" height="${Math.ceil(frame.height-1e-9)}" `))),waitForFonts:false})).canvas.toBuffer('image/png');
 const original=await render(d);groupEditableScene(d,['a','b'],{id:'inner',spatial:true},user);
 assert.deepEqual(await render(d),original);
 const reopened=JSON.parse(JSON.stringify(d));solveSceneLayout(reopened);assert.deepEqual(await render(reopened),original);
 ungroupEditableScene(reopened,'inner',user);assert.deepEqual(await render(reopened),original);
});

test('changing paper preserves nested local physical geometry and stable layout boxes',()=>{
 const d=page();groupEditableScene(d,['a','b'],{id:'inner',spatial:true},user);
 const ids=['a','b','c','old','new','inner'],scale=d.physicalPageHeightMM/d.canvas.height;
 const before=ids.map(id=>{const b=worldBox(d,id);return {cx:(b.cx-d.canvas.width/2)*scale,cy:(b.cy-d.canvas.height/2)*scale,w:b.w*scale,h:b.h*scale,rotation:b.rotation};});
 setDraftPaperSize(d,'weeks');const newScale=d.physicalPageHeightMM/d.canvas.height;
 ids.forEach((id,i)=>{const b=worldBox(d,id);sameBox({cx:(b.cx-d.canvas.width/2)*newScale,cy:(b.cy-d.canvas.height/2)*newScale,w:b.w*newScale,h:b.h*newScale,rotation:b.rotation},before[i]);});
 validateSceneExtensions(d);
});

test('graphic inspector snapshots projected grouped geometry without cloning a Proxy or changing Scene',async()=>{
 const {graphicEffectPreviewNode}=await import('../src/graphic-effect-preview.js');
 const {sceneLayerEntries}=await import('../src/scene-v2.js');
 const d=page();link(d,'a');const a=findSceneNode(d,'a');
 a.graphicOutline={color:'#ffffff',width:3,offsetX:2,offsetY:1};
 const before=structuredClone(d),view=sceneLayerEntries(d).find(e=>e.value.id==='a').value;
 const preview=graphicEffectPreviewNode(view);assert.equal(preview.x,140);assert.equal(preview.y,41);
 assert.equal(preview.layoutConstraint,undefined);assert.equal(preview.rotation,0);
 preview.graphicOutline.width=20;assert.deepEqual(JSON.parse(JSON.stringify(d)),before);
 findSceneNode(d,'old').children.push({id:'ink',type:'ink',width:4,color:'#334455',points:[{x:0,y:0,p:.2},{x:20,y:10,p:.8}],zIndex:3});
 const ink=sceneLayerEntries(d).find(e=>e.value.id==='ink').value,copy=graphicEffectPreviewNode(ink);
 assert.deepEqual(copy.points.map(p=>p.p),[.2,.8]);copy.points[0].p=1;
 assert.equal(findSceneNode(d,'ink').points[0].p,.2);
});
