import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {CreationModePicker} from '../../src/react-creation-mode.jsx';
import {creationModeDescription,generationProfile} from '../../src/creation-methods.js';
import {calculateGraphics} from '../../src/graphics-client.js';
import {createOfflineHandoff} from '../../src/offline-creation.js';
import {project} from '../../src/domain.js';
import {webSceneDocument} from '../../src/web-scene-workbench.js';
import {assetFromSourceSnapshot} from '../../src/material-anatomy.js';
import {applyCreationV2Batch} from '../../src/creation-v2-commands.js';
import {renderSceneCanvas} from '../../src/scene-renderer.js';
import {findSceneNode} from '../../src/scene-v2.js';
import {unzipSync,strFromU8} from 'fflate';
const source=document.createElement('canvas');source.width=120;source.height=160;const ctx=source.getContext('2d');ctx.fillStyle='#D6E1E0';ctx.fillRect(0,0,120,160);ctx.strokeStyle='#A6BFC3';for(let y=10;y<160;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(120,y);ctx.stroke();}
const bytes=new Uint8Array(await (await new Promise(resolve=>source.toBlob(resolve))).arrayBuffer()),asset={id:'paper',title:'Synthetic source',kind:'paper',physicalWidthMM:35,physicalHeightMM:48,supply:{quantity:1}},p=project('Local editable graphics',{ratio:'b6'});p.candidateAssetIDs=['paper'];p.processing='自由拆解';
const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:'paper'},previews:[{alias:'m1',bytes}]});
const assets=task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true})),transaction=operations=>({protocolVersion:2,transactionId:'browser-graphics',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
const query={version:1,operation:'rough',id:'star',seed:42,geometry:{kind:'star'},size:{width:45,height:45,unit:'mm'},place:{reference:'page',at:[88,75],unit:'mm'},style:{fill:'#D3B879',stroke:'#3B6670',strokeWidthMm:.6},options:{roughness:1.1,fillStyle:'hachure',hachureGapMm:2.1}};
let doc;
const render=async()=>{const result=await renderSceneCanvas(doc.page,{scale:.72,loadMaterialImage:async()=>source});result.canvas.id='graphics-preview';document.querySelector('#canvas').replaceChildren(result.canvas);return result;};
function App(){const [mode,setMode]=useState('edit'),[status,setStatus]=useState('正在本地计算…');useEffect(()=>{window.__mode=mode;},[mode]);useEffect(()=>{(async()=>{
 const result=await calculateGraphics(query);doc=applyCreationV2Batch(webSceneDocument(task.source,task.source.baseDraft),transaction([{op:'material.add',id:'paper-layer',asset:'m1',place:{reference:'page',at:[42,83],unit:'mm'}},{op:'text.add',id:'title',content:'Make it yours',place:{reference:'page',at:[62,32],unit:'mm'},size:{width:100,unit:'mm'},style:{fontFamily:'serif',fontSizePt:22,color:'#3B6670',textAlign:'center'}},...result.operations,{op:'text.add',id:'caption',content:'Real source + editable paths\nNo image-generation API',place:{reference:'page',at:[62,133],unit:'mm'},size:{width:105,unit:'mm'},style:{fontFamily:'sans-serif',fontSizePt:12,color:'#3B6670',textAlign:'center'}}]),assets);await render();
 window.__three={result,get doc(){return doc;},query,calculateGraphics,findSceneNode,transaction,apply:async ops=>{doc=applyCreationV2Batch(doc,transaction(ops),assets);await render();},
 exports:async()=>{const rows=[];for(const mode of ['edit','draw','hybrid']){const handoff=await createOfflineHandoff({project:{...p,creationMode:mode},assets:[asset],aliases:{m1:'paper'},previews:[{alias:'m1',bytes}],referencePreview:mode==='hybrid'?bytes:null});const files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));rows.push({mode:handoff.mode,delivery:handoff.deliveryMode,scene:!!files['scene.json'],graphics:!!files['runtime/graphics.cjs'],reference:!!files['reference/draft.png'],source:JSON.parse(strFromU8(files['TASK.json'])).sourceContext.creationMode});}return rows;}};
 setStatus('本地 Worker 已生成可编辑路径');window.__threeReady=true;
 })().catch(e=>{console.error(e);setStatus(e.message);});},[]);
 return <main><h1>三种创作模式 · 本地图形工具</h1><section><CreationModePicker value={mode} onChange={setMode}/><p data-mode-description>{creationModeDescription(mode)}</p><code data-mode-profile>{JSON.stringify(generationProfile(mode))}</code></section><p id="status">{status}</p><section id="canvas"/><p>合成来源测试 · 每条线仍是普通可编辑矢量</p></main>;
}
const style=document.createElement('style');style.textContent='*{box-sizing:border-box}body{margin:0;background:#f1f3ed;color:#304b50;font-family:system-ui,sans-serif}main{max-width:900px;padding:24px;margin:auto}h1{font-size:23px}section{padding:18px;background:white;border-radius:12px;margin-bottom:14px}select{display:block;min-height:44px;font-size:14px;width:100%;max-width:400px}code{display:block;white-space:normal;word-break:break-all;font-size:12px}canvas{display:block;max-width:100%;height:auto;margin:auto}';document.head.append(style);
createRoot(document.getElementById('root')).render(<App/>);
