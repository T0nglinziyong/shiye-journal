import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {draft,project} from '../src/domain.js';
import {groupEditableScene,ungroupEditableScene,moveEditableScene,copyEditableScene} from '../src/scene-structure-edit.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {mergeSceneLasso} from '../src/scene-lasso.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {findSceneNode,sceneLayerEntries,transformSceneGroup,validateSceneExtensions} from '../src/scene-v2.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {worldBox,rigidMatrix} from '../src/scene-spatial.js';
import {applySceneNodeChange} from '../src/scene-edit-kernel.js';
const user={policy:USER_SCENE_POLICY};
const shape=(id,x,y,extra={})=>({id,type:'shape',kind:'ellipse',x,y,width:70,height:60,rotation:0,fill:'#54715d',...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const render=async page=>(await renderSceneCanvas(page,{createCanvas,loadShapeImage:(uri,frame)=>loadImage(Buffer.from(decodeURIComponent(uri.split(',').slice(1).join(',')).replace('<svg ',`<svg width="${Math.ceil(frame.width-1e-9)}" height="${Math.ceil(frame.height-1e-9)}" `))),waitForFonts:false})).canvas.toBuffer('image/png');

test('manual and AI grouping share local coordinates and automatic layout frame',async()=>{
 const p=project('spatial group'),page=p.drafts[0];page.layers=[shape('a',150,180,{rotation:18,zIndex:1}),shape('b',260,320,{rotation:-21,zIndex:2})];
 const doc=await createCreationDocument({draft:page,assets:[]}),manual=structuredClone(doc.page);
 groupEditableScene(manual,['a','b'],{id:'group',name:'group'},user);
 const ai=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'group-test',baseSceneRevision:creationSceneRevision(doc),operations:[{op:'group.create',id:'group',targets:['a','b']}]},[]).document.page;
 const normalize=node=>{const copy=structuredClone(node);delete copy.aiManaged;delete copy.zIndex;copy.children?.forEach(child=>{delete child.aiManaged;delete child.zIndex;});return copy;};
 assert.deepEqual(normalize(findSceneNode(ai,'group')),normalize(findSceneNode(manual,'group')));
 assert.deepEqual(sceneLayerEntries(ai).map(e=>e.value.id),sceneLayerEntries(manual).map(e=>e.value.id));
 assert.ok(findSceneNode(manual,'group').localTransform);assert.ok(findSceneNode(manual,'group').layoutBox.width>0);
 const original=await render(page);assert.deepEqual(await render(manual),original);assert.deepEqual(await render(ai),original);
});

test('new manual groups immediately accept parent layout and retain physical item sizes on rotate and ungroup',()=>{
 const page=draft();page.layers=[{id:'m',type:'material',assetID:'paper',materialUnitIndex:0,x:120,y:160,width:60,height:90,zIndex:1},shape('a',220,260,{zIndex:2})];
 groupEditableScene(page,['m','a'],{id:'group'},user);
 applySceneNodeChange(page,'a',{place:{reference:'parent',at:[.5,.5],unit:'ratio',behavior:'linked'}},user);
 transformSceneGroup(page,'group',{rotation:30,dx:35,dy:15});
 const material=findSceneNode(page,'m');assert.equal(material.width,60);assert.equal(material.height,90);assert.equal(material.assetID,'paper');
 const before=['m','a'].map(id=>worldBox(page,id));ungroupEditableScene(page,'group',user);
 ['m','a'].forEach((id,i)=>{const after=worldBox(page,id);for(const key of ['cx','cy','w','h','rotation'])near(after[key],before[i][key]);});
 validateSceneExtensions(page);
});

test('lasso merge retains fully selected subgroups including opacity, masks and shadow',async()=>{
 const page=draft();page.layers=[{id:'left',type:'group',opacity:.6,shadow:{color:'#554433',blur:2,offsetX:1,offsetY:2},localTransform:rigidMatrix(160,200,10),layoutBox:{width:120,height:120},children:[shape('a',0,0)],zIndex:1},
  {id:'right',type:'group',vectorMask:{outer:[[0,0],[1,0],[1,1],[0,1]],holes:[]},localTransform:rigidMatrix(400,400,-10),layoutBox:{width:120,height:120},children:[shape('b',0,0)],zIndex:2}];
 const original=await render(page),left=findSceneNode(page,'left'),right=findSceneNode(page,'right');
 mergeSceneLasso(page,['a','b'],{id:'merged'},user);
 assert.equal(findSceneNode(page,'left'),left);assert.equal(findSceneNode(page,'right'),right);
 assert.equal(left.opacity,.6);assert.equal(left.shadow.blur,2);assert.ok(right.vectorMask);
 assert.deepEqual(await render(page),original);assert.deepEqual(await render(JSON.parse(JSON.stringify(page))),original);
 validateSceneExtensions(page);
});

test('partial effectful lasso merge fails atomically and neutral partial selection retains unselected branches',()=>{
 const page=draft();page.layers=[{id:'left',type:'group',opacity:.5,localTransform:rigidMatrix(160,200,25),layoutBox:{width:220,height:180},children:[shape('a',0,0,{zIndex:1}),shape('remain',40,70,{zIndex:2})],zIndex:1},shape('b',350,350,{zIndex:2})];
 const before=structuredClone(page),a=findSceneNode(page,'a');
 assert.throws(()=>mergeSceneLasso(page,['a','b'],{id:'merged'},user),/完整组合/);
 assert.deepEqual(structuredClone(page),before);assert.equal(findSceneNode(page,'a'),a);
 findSceneNode(page,'left').opacity=1;const boxes=['a','b','remain'].map(id=>worldBox(page,id));
 mergeSceneLasso(page,['a','b'],{id:'merged'},user);
 assert.deepEqual(findSceneNode(page,'left').children.map(n=>n.id),['remain']);
 ['a','b','remain'].forEach((id,i)=>{const b=worldBox(page,id);for(const key of ['cx','cy','w','h','rotation'])near(b[key],boxes[i][key]);});
 assert.deepEqual(sceneLayerEntries(page).map(e=>e.value.id),['remain','a','b']);
});

test('new local group transform still rejects locked descendants without changing Scene',()=>{
 const page=draft();page.layers=[shape('a',150,150,{zIndex:1}),shape('b',250,250,{zIndex:2})];
 groupEditableScene(page,['a','b'],{id:'group'},user);findSceneNode(page,'a').locked=true;
 const before=JSON.stringify(page);assert.throws(()=>transformSceneGroup(page,'group',{dx:10}),/锁定/);assert.equal(JSON.stringify(page),before);
});

test('one lasso transaction checks ownership on retained wrappers as well as selected leaves',()=>{
 const page=draft();page.layers=[{id:'owned',type:'group',localTransform:rigidMatrix(100,100),layoutBox:{width:100,height:100},aiManaged:{version:1,baseline:'changed-by-user'},children:[shape('a',0,0)]},shape('b',300,300)];
 const before=structuredClone(page);
 assert.throws(()=>mergeSceneLasso(page,['a','b'],{id:'merge'}),{code:'MANUAL_EDIT_PROTECTED'});
 assert.deepEqual(structuredClone(page),before);
 mergeSceneLasso(page,['a','b'],{id:'merge'},user);assert.equal(findSceneNode(page,'merge').children.length,2);
});


test('page-frame masked groups retain pixels when grouped, moved, copied and reopened',async()=>{
 const page=draft(),{width:w,height:h}=page.canvas;
 page.layers=[{id:'masked',type:'group',vectorMask:{outer:[[0,0],[.5,0],[.5,1],[0,1]],holes:[]},children:[shape('a',w/2,h/2,{width:200,height:180})],zIndex:1},shape('b',w*.8,h*.7,{zIndex:2})];
 const original=await render(page);
 groupEditableScene(page,['masked','b'],{id:'wrapper'},user);
 assert.deepEqual(await render(page),original);
 assert.deepEqual(findSceneNode(page,'masked').layoutBox,{width:w,height:h});
 ungroupEditableScene(page,'wrapper',user);assert.deepEqual(await render(page),original);
 const destination={id:'destination',type:'group',localTransform:rigidMatrix(200,100,25),layoutBox:{width:300,height:300},children:[],zIndex:0};page.layers.unshift(destination);
 moveEditableScene(page,'masked',{parentID:'destination'},user);
 // Rotation roundoff may change antialiasing, so use nonrotated reparent for
 // exact pixel equality after a rotated roundtrip.
 moveEditableScene(page,'masked',{parentID:null,beforeID:'b'},user);
 assert.deepEqual(await render(page),original);
 assert.deepEqual(await render(JSON.parse(JSON.stringify(page))),original);
 const source=draft();source.layers=[{id:'flat',type:'group',vectorMask:{outer:[[0,0],[.5,0],[.5,1],[0,1]],holes:[]},children:[shape('leaf',w/2,h/2,{width:200,height:180})]}];
 let n=0;const [id]=copyEditableScene(source,['flat'],()=>`copy-${++n}`,{...user,offset:{x:60,y:30}});
 const copy=findSceneNode(source,id);source.layers=[copy];
 const reference=draft();reference.layers=[{id:'expected',type:'group',localTransform:rigidMatrix(w/2+60,h/2+30),layoutBox:{width:w,height:h},vectorMask:{outer:[[0,0],[.5,0],[.5,1],[0,1]],holes:[]},children:[shape('expected-leaf',0,0,{width:200,height:180})]}];
 assert.deepEqual(await render(source),await render(reference));validateSceneExtensions(source);
});
