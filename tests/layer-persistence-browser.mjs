import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-layer-persistence',process.env.SHIYE_TEST_URL||'http://localhost:5175');
const {command,evaluate,wait,click,sleep}=b;
try {
  await wait('.series-grid');
  await evaluate('(async()=>{const db=await new Promise(r=>{const q=indexedDB.open("shiye-pwa-full-v1");q.onsuccess=()=>r(q.result);}),now=new Date().toISOString(),canvas=document.createElement("canvas");canvas.width=80;canvas.height=480;const x=canvas.getContext("2d");x.fillStyle="#82a77b";x.fillRect(0,0,80,480);x.fillStyle="#d84d56";x.fillRect(0,0,80,40);x.fillStyle="#008eea";x.fillRect(0,440,80,40);const data=await new Promise(r=>canvas.toBlob(r)),asset={id:"interaction-asset",title:"交互合成长条",blobId:"interaction-blob",originalBlobId:"interaction-blob",seriesID:"interaction-series",kind:"paper",reviewStatus:"ready",createdAt:now,physicalWidthMM:20,physicalHeightMM:120,supply:{quantity:4},tags:[]},draft={id:"interaction-draft",canvas:{width:1000,height:1400},paperColor:"#fffdf5",paperPattern:"plain",physicalPageHeightMM:297,items:[{id:"interaction-item",assetID:asset.id,x:240,y:600,width:180,height:1080,zIndex:1,opacity:1}],textBlocks:[],primitives:[{id:"interaction-vector",kind:"vector",vectorPaths:[[[0,0],[1,0],[0,1]]],x:650,y:600,width:200,height:120,fill:"#abc8e5",stroke:"#547da4",lineWidth:2,opacity:1,zIndex:2}],strokes:[]},project={id:"interaction-project",title:"交互合成作品",isDraft:false,createdAt:now,updatedAt:now,activeDraftID:draft.id,drafts:[draft]},template={...structuredClone(project),id:"interaction-template",title:"交互模板",isTemplate:true},workDraft={...structuredClone(project),id:"interaction-work-draft",title:"交互草稿",isDraft:true};await new Promise(r=>{const tx=db.transaction(["assets","projects","blobs","series","trash","meta"],"readwrite");tx.objectStore("assets").put(asset);tx.objectStore("blobs").put({id:asset.blobId,data});for(const p of [project,template,workDraft])tx.objectStore("projects").put(p);tx.objectStore("series").put({id:"interaction-series",title:"交互系列",createdAt:now,updatedAt:now});tx.objectStore("trash").put({id:"interaction-asset-trash",kind:"asset",item:{...asset,id:"interaction-recovered-asset",title:"待恢复素材"},date:now});tx.objectStore("trash").put({id:"interaction-project-trash",kind:"project",item:{...structuredClone(project),id:"interaction-recovered-project",title:"待恢复作品"},date:now});tx.objectStore("meta").put({id:"cece-samples-v2"});tx.oncomplete=r;});db.close();})()');
  await command('Page.reload');await wait('.series-grid');
  for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});
    await click('[data-route="works"]');await click('[data-id="interaction-project"]','#canvas-page');
    console.log('Layer viewport editor:',w,h,await evaluate('({title:document.querySelector("#project-title")?.textContent,tools:[...document.querySelectorAll(".editor-tools button")].map(b=>b.dataset.val),route:document.querySelector("#canvas-page")?.parentElement?.className})'),b.errors);
    await wait('[data-val="layers"]');await click('[data-val="layers"]','.canvas-layer-list');
    await evaluate('globalThis.__layerList=document.querySelector(".canvas-layer-list");globalThis.__layerThumb=document.querySelector("[data-layer-id=interaction-item] img");globalThis.__layerCanvasImage=document.querySelector("[data-object=interaction-item] img")');
    assert.ok(await evaluate('__layerList&&__layerThumb&&__layerCanvasImage'));
    await click('[data-layer-id="interaction-item"] [data-layer-lock]');
    assert.ok(await evaluate('__layerList.isConnected&&__layerThumb===document.querySelector("[data-layer-id=interaction-item] img")&&__layerCanvasImage===document.querySelector("[data-object=interaction-item] img")'));
    await click('[data-layer-id="interaction-item"] [data-layer-lock]');
    await click('[data-layer-id="interaction-item"] [data-layer-eye]');
    await click('[data-layer-id="interaction-item"] [data-layer-eye]');
    await click('[data-layer-id="interaction-item"] [data-layer-move]','.canvas-layer-move-actions');
    await click('.canvas-layer-move-actions button:first-child');
    assert.ok(await evaluate('__layerList.isConnected&&__layerThumb===document.querySelector("[data-layer-id=interaction-item] img")&&__layerCanvasImage===document.querySelector("[data-object=interaction-item] img")&&__layerList.firstElementChild.dataset.layerId==="interaction-item"'),w+'x'+h+' layer image was remounted');
    await click('[data-act="back-works"]');
  }
  assert.deepEqual(b.errors,[]);console.log('Layer image continuity passed in four viewports');
}finally{await b.close();}
