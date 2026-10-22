import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MaterialPieceImage} from '../../src/fabric-editor-controls.jsx';
import {SeriesArtwork} from '../../src/react-series-artwork.jsx';
import {TextEffectsPanel} from '../../src/react-text-effects.jsx';
import {journalFontFamily,prepareJournalFont,configureJournalFontLoader} from '../../src/journal-fonts.js';
import {styleFor} from '../../src/scene-node-properties.js';
import {applySceneNodePatch} from '../../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../../src/scene-edit-policy.js';
import {loadSeriesCoverSnapshot} from '../../src/series-cover-snapshot.js';
import {drawSceneText} from '../../src/editor-tools-model.js';
import '../../src/material-polish.css';
import '../../src/matching-view.css';
configureJournalFontLoader(()=>import('@fontsource/ma-shan-zheng/chinese-simplified-400.css'));
const sourceCanvas=document.createElement('canvas');sourceCanvas.width=120;sourceCanvas.height=80;const ctx=sourceCanvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,60,80);ctx.fillStyle='#0000ff';ctx.fillRect(60,0,60,80);const image=sourceCanvas.toDataURL();
const green=document.createElement('canvas');green.width=120;green.height=80;green.getContext('2d').fillStyle='#00ff00';green.getContext('2d').fillRect(0,0,120,80);const newer=green.toDataURL();
const assets=Array.from({length:5},(_,i)=>({id:'paper'+i,title:'合成纸片 '+(i+1),kind:'paper',staticPath:image,physicalWidthMM:30,physicalHeightMM:20,seriesID:'series'}));
const source=id=>id==='old-source'?image:id==='new-source'?newer:null;
const basePiece={id:'piece',type:'material',assetID:'paper0',sourceBlobId:'old-source',width:60,height:80,cropRect:{x:.5,y:0,width:.5,height:1}};
const initial={sceneVersion:2,canvas:{width:600,height:800},physicalPageHeightMM:200,layers:[{id:'note',type:'text',content:'拾页艺术字',style:'hand',color:'#35516A',fontSize:40,x:200,y:100,width:320,height:90,rotation:0}]};
const cache={values:new Map(),async get(_space,key){return this.values.get(key);},async put(_space,key,value){this.values.set(key,value);}};
function App(){
 const [piece,setPiece]=useState(basePiece),[mode,setMode]=useState('auto'),[scene,setScene]=useState(initial),[font,setFont]=useState('pending'),[history,setHistory]=useState([]);
 const node=scene.layers[0];
 const change=style=>{const next=structuredClone(scene);applySceneNodePatch(next,'note',styleFor('text',style,next,next.layers[0]),{policy:USER_SCENE_POLICY});setHistory([...history,scene]);setScene(next);};
 useEffect(()=>{let live=true;prepareJournalFont(node).then(status=>{if(live)setFont(status);});return()=>{live=false;};},[node.style]);
 useEffect(()=>{window.__polish={sourceCanvas,image,newer,scene,piece,mode,font,assets,cache,setPiece,setMode,setScene,change,
  reset:()=>setPiece(basePiece),mask:()=>setPiece({...piece,vectorMask:{outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[.35,.35],[.65,.35],[.65,.65],[.35,.65]]]}}),
  flip:()=>setPiece({...piece,cropRect:null,width:120,height:80,isFlippedHorizontally:true}),
  fontStatus:()=>({status:font,faces:[...document.fonts].filter(f=>f.family.includes('Ma Shan')).map(f=>({family:f.family,status:f.status})),family:journalFontFamily(node)}),
  snapshot:async(selector,layout)=>loadSeriesCoverSnapshot({cover:document.querySelector(selector),series:{id:selector,coverLayout:layout},assets,cache,account:'fixture'}),
  fontPixels:()=>{const draw=style=>{const c=document.createElement('canvas');c.width=360;c.height=100;const x=c.getContext('2d');x.translate(180,50);drawSceneText(x,{...node,style,fontName:null,width:340,height:90,alignment:'center',textOutline:null,textGradient:null,shadow:null});return c.toDataURL();};return {hand:draw('hand'),serif:draw('serif')};}};
 },[scene,piece,mode,font]);
 return <main><h1>素材与艺术字 · 合成回归</h1><section className="matching-page"><div className="match-creative-controls">{['视觉风格','用途','内容','工艺','页面','形式'].map(label=><label key={label}>{label}<select aria-label={label}><option>随材而定</option></select></label>)}</div></section>
 <section className="grid"><article><h2>两件：自动扇形</h2><div id="fan" className="series-editor-cover"><SeriesArtwork members={assets.slice(0,2)} mode="auto" source={source}/></div></article><article><h2>五件：可切换封面</h2><select id="cover-mode" value={mode} onChange={e=>setMode(e.target.value)}><option value="auto">自动矩阵</option><option value="fan">扇形</option><option value="grid">矩阵</option></select><div id="matrix" className="series-editor-cover"><SeriesArtwork members={assets} mode={mode} source={source}/></div></article></section>
 <section className="grid"><article><h2>原素材封面</h2><div id="original"><MaterialPieceImage asset={assets[0]} source={source}/></div></article><article><h2>已使用 · 当前裁片</h2><div id="processed"><MaterialPieceImage asset={{...assets[0],blobId:'new-source'}} item={piece} source={source}/></div><button id="mask" onClick={()=>window.__polish.mask()}>开孔蒙版</button><button id="flip" onClick={()=>window.__polish.flip()}>翻转原片</button><button id="reset" onClick={()=>setPiece(basePiece)}>恢复裁片</button></article></section>
 <section className="lettering"><h2>默认艺术手写与可编辑字效</h2><output id="font-status">{font}</output><input aria-label="测试正文" value={node.content} onChange={e=>{const next=structuredClone(scene);applySceneNodePatch(next,'note',{content:e.target.value},{policy:USER_SCENE_POLICY});setScene(next);}}/><TextEffectsPanel node={node} page={scene} onChange={change}/><button id="undo" disabled={!history.length} onClick={()=>{setScene(history.at(-1));setHistory(history.slice(0,-1));}}>撤销效果</button><button id="reopen" onClick={()=>setScene(JSON.parse(JSON.stringify(scene)))}>序列化重开</button></section>
 </main>;
}
const style=document.createElement('style');style.textContent=`*{box-sizing:border-box}body{margin:0;background:#f5f3ed;color:#354b40;font-family:system-ui,sans-serif}main{max-width:800px;padding:16px;margin:auto}h1{font-size:22px}h2{font-size:14px}article,.lettering{padding:14px;background:#fff;border-radius:12px;margin-bottom:14px}select,input,button{min-height:40px;max-width:100%}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.material-piece-image{height:144px}.material-piece-image img{max-width:100%;max-height:144px;object-fit:contain}.lettering{max-width:480px;margin:auto}.lettering input{width:100%;margin:8px 0}#font-status{font-size:11px}@media(max-width:500px){main{padding:10px}.grid{gap:8px}article{padding:8px}h1{font-size:18px}}`;document.head.append(style);
createRoot(document.getElementById('root')).render(<App/>);
