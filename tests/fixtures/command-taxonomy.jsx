import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import * as fabric from 'fabric';
import {project} from '../../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../../src/offline-creation.js';
import {assetFromSourceSnapshot} from '../../src/material-anatomy.js';
import {webSceneDocument} from '../../src/web-scene-workbench.js';
import {applyCreationV2Batch} from '../../src/creation-v2-commands.js';
import {describeCreationCommand} from '../../src/creation-v2-contract.js';
import {findSceneNode} from '../../src/scene-v2.js';
import {worldBox} from '../../src/scene-spatial.js';
import {renderSceneCanvas} from '../../src/scene-renderer.js';
import {createFabricSceneBridge} from '../../src/fabric-scene-bridge.js';
import {PaintEffectsPanel} from '../../src/react-text-effects.jsx';
import {applySceneNodeChange} from '../../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../../src/scene-edit-policy.js';
import {geometryArea} from '../../src/craft-topology.js';
import {itemSourceGeometry} from '../../src/craft-region-ops.js';
import '../../src/material-polish.css';
const make=()=>document.createElement('canvas'),image=make();image.width=160;image.height=120;
const imageContext=image.getContext('2d');imageContext.fillStyle='#E3D5BC';imageContext.fillRect(0,0,160,120);imageContext.fillStyle='#A2B9C0';for(let x=10;x<160;x+=20)imageContext.fillRect(x,0,5,120);
const bytes=new Uint8Array(await (await new Promise(resolve=>image.toBlob(resolve))).arrayBuffer());
const asset={id:'paper',title:'Synthetic striped paper',kind:'paper',physicalWidthMM:35,physicalHeightMM:45,blobId:'test-source',supply:{quantity:1}},p=project('Command taxonomy',{ratio:'a5'});p.processing='自由拆解';
const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:'paper'},previews:[{alias:'m1',bytes}]});
const assets=task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
const tx=operations=>({protocolVersion:2,transactionId:'taxonomy-browser',baseSceneRevision:'sha256:'+'0'.repeat(64),operations}),place=(x,y)=>({reference:'page',at:[x,y],unit:'mm'});
const follow=id=>({reference:'node:'+id,referenceAnchor:'center',rotationSpace:'reference',rotationDeg:0,behavior:'linked'});
const gradient={angleDeg:0,stops:[{offset:0,color:'#FF0000'},{offset:1,color:'#0000FF'}]};
const initial=applyCreationV2Batch(webSceneDocument(task.source,task.source.baseDraft),tx([
 {op:'page.update',paperColor:'#FAF4E9'},
 {op:'text.lettering',id:'title',content:'GO',place:place(75,30),style:{fontFamily:'sans-serif',fontSizePt:30,color:'#3D576C'},letters:[{index:1,style:{gradient,outline:{color:'#D8B66B',widthMm:.6}},rotationDeg:4}]},
 {op:'graphic.add',id:'wash',geometry:{kind:'ellipse'},place:place(75,76),size:{width:95,height:35,unit:'mm'},style:{fill:'#FFFFFF',gradient,outline:{color:'#00FF00',widthMm:1.5,offsetMm:[1,1]},opacity:.85}},
 {op:'text.add',id:'caption',content:'Try a little more',size:{width:70,unit:'mm'},place:place(75,76),style:{fontFamily:'sans-serif',fontSizePt:17,color:'#FFFFFF',textAlign:'center'}},
 {op:'graphic.add',id:'ring',geometry:{kind:'ellipse'},place:follow('caption'),size:{reference:'node:caption',unit:'ratio',width:1.15,height:1.15,behavior:'linked'},style:{fill:null,stroke:'#304B58',strokeWidthMm:.6}},
 {op:'material.add',id:'sheet',asset:'m1',place:place(42,127)},
 {op:'material.cut',target:'sheet',mode:'remove',region:{shape:'edge',edge:'left',amount:.2,unit:'ratio',space:'source'}},
 {op:'layer.mask',target:'sheet',mode:'intersect',region:{shape:'ellipse',space:'local',unit:'ratio',box:[0,0,1,1]}},
 {op:'graphic.add',id:'leaf',geometry:{kind:'leaf'},place:place(105,135),size:{width:35,height:50,unit:'mm'},style:{fill:'#8B9D7F',outline:{color:'#FFF4D5',widthMm:1,offsetMm:[1,1]},gradient:{angleDeg:60,stops:[{offset:0,color:'#D2B989'},{offset:1,color:'#4B796C'}]}}},
 {op:'graphic.add',id:'ink',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0,pressure:.2},{x:10,y:-9,pressure:.8},{x:25,y:2,pressure:.4}]},place:place(78,176),style:{stroke:'#304B58',strokeWidthMm:3,penStyle:'pressure',outline:{color:'#FFFFFF',widthMm:.7},gradient}},
 {op:'material.decision',asset:'m1',choice:'crafted',reason:'Synthetic paper is physically cut and independently masked for regression.'}
]),assets);
let doc=initial;
const render=async()=>{const output=await renderSceneCanvas(doc.page,{loadMaterialImage:async()=>image});output.canvas.id='tax-artwork';document.querySelector('#artwork').replaceChildren(output.canvas);return output;};
const apply=async operations=>{doc=applyCreationV2Batch(doc,tx(operations),assets);await render();return doc;};
function Form(){
 const [page,setPage]=useState({sceneVersion:2,canvas:{width:280,height:160},physicalPageHeightMM:80,layers:[{id:'ui-shape',type:'shape',kind:'star',x:140,y:80,width:150,height:100,fill:'#72948A',stroke:'#3A5C69',lineWidth:2,rotation:0}]});
 useEffect(()=>{window.__taxUI={page,update:style=>{const next=structuredClone(page);applySceneNodeChange(next,'ui-shape',{style},{policy:USER_SCENE_POLICY});setPage(next);}};},[page]);
 return <PaintEffectsPanel node={page.layers[0]} page={page} onChange={style=>{const next=structuredClone(page);applySceneNodeChange(next,'ui-shape',{style},{policy:USER_SCENE_POLICY});setPage(next);}}/>;
}
function App(){useEffect(()=>{(async()=>{
 await render();const n={...structuredClone(findSceneNode(doc.page,'leaf')),x:140,y:90,width:110,height:140},editorPage={sceneVersion:2,canvas:{width:280,height:180},physicalPageHeightMM:100,layers:[n]},canvas=new fabric.Canvas('editor',{width:280,height:180}),bridge=createFabricSceneBridge(fabric),object=await bridge.fromNode(n);canvas.add(object);canvas.renderAll();
 window.__taxonomy={get doc(){return doc;},assets,tx,apply,findSceneNode,worldBox,importEditableWork,geometryArea,itemSourceGeometry,render,applyCreationV2Batch,help:describeCreationCommand('layer.update'),editorPage,object,canvas,bridge,policy:USER_SCENE_POLICY};window.__taxReady=true;
 })().catch(error=>{console.error(error);document.querySelector('#status').textContent=error.message;});},[]);
 return <main><h1>Composition, common edits, linked size</h1><p id="status">Synthetic materials · editable effects and title structure</p><div className="columns"><section id="artwork"/><aside><h2>Shared graphic styles</h2><Form/><h2>Editable native vector</h2><canvas id="editor"/></aside></div></main>;
}
const style=document.createElement('style');style.textContent='*{box-sizing:border-box}body{margin:0;background:#ede9df;color:#314e58;font:15px system-ui}main{max-width:1050px;margin:auto;padding:20px}h1{font-size:23px}h2{font-size:16px}canvas{max-width:100%;height:auto;display:block}.columns{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:24px}aside{background:white;padding:18px;border-radius:16px}#artwork canvas{width:100%}button,input,select{min-height:36px}p{font-size:13px}@media(max-width:650px){.columns{grid-template-columns:1fr}main{padding:12px}}';document.head.append(style);createRoot(document.querySelector('#root')).render(<App/>);
