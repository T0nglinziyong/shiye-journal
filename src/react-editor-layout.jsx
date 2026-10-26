import React,{useState} from 'react';
import {commonShapes,advancedShapes} from './editor-tools-model.js';
const shapeNames=new Map([...commonShapes,...advancedShapes]);
import {inspectorLayoutModel,inspectorSizeRatios,inspectorPlacementControls,inspectorReference} from './editor-layout-model.js';

export function EditorLayoutPanel({page,nodeID,onAction,asset}){
 const model=inspectorLayoutModel(page,nodeID,node=>node.type==='shape'?shapeNames.get(node.kind):node.type==='material'?asset?.(node.assetID)?.title:null),constraint=model.constraint;
 const [reference,setReference]=useState(()=>inspectorReference(page,constraint.place?.reference||constraint.size?.reference||'page'));
 const [position,setPosition]=useState(()=>inspectorPlacementControls(constraint.place).position),[gap,setGap]=useState(()=>inspectorPlacementControls(constraint.place).gap);
 const [follow,setFollow]=useState(()=>constraint.place?.rotationSpace==='reference');
 const [ratios,setRatios]=useState(null);
 const current=ratios||inspectorSizeRatios(page,nodeID,reference);
 const send=request=>onAction('fabric-inspector-layout',request);
 const name=ref=>model.references.find(([id])=>id===inspectorReference(page,ref))?.[1]||ref;
 return <details className="editor-inspector-layout"><summary>跟随对象{constraint.place||constraint.size?' · 已设置':''}</summary>
  <div className="stack">
   {constraint.place?<p className="muted">位置跟随：{name(constraint.place.reference)}<button type="button" className="btn mini" onClick={()=>send({action:'detach',scope:'place'})}>解除位置跟随</button></p>:null}
   {constraint.size?<p className="muted">尺寸跟随：{name(constraint.size.reference)}<button type="button" className="btn mini" onClick={()=>send({action:'detach',scope:'size'})}>解除尺寸跟随</button></p>:null}
   <label>参照对象<select value={reference} onChange={event=>{setReference(event.target.value);setRatios(null);}}>
    {model.references.map(([key,title])=><option key={key} value={key}>{title}</option>)}
   </select></label>
   <div className="form-grid"><label>相对位置<select value={position} onChange={event=>setPosition(event.target.value)}>
    {[['keep','保持当前位置'],['above','上方'],['below','下方'],['left','左侧'],['right','右侧'],['center','居中']].map(([key,title])=><option key={key} value={key}>{title}</option>)}
   </select></label>{!['keep','center'].includes(position)?<label>间距（mm）<input type="number" min="0" max="500" step=".5" value={gap} onChange={event=>setGap(event.target.value)}/></label>:null}</div>
   <label className="editor-inspector-check"><input type="checkbox" checked={follow} onChange={event=>setFollow(event.target.checked)}/>同时跟随旋转</label>
   <button type="button" className="btn" onClick={()=>send({action:'place',reference,position,gap,followRotation:follow})}>应用位置跟随</button>
   <small className="muted">参照移动后，此对象会跟随。拖动此对象可调整相对位置；解除后保留当前外观。</small>
   {model.canResize?<><h4>跟随尺寸</h4><div className="form-grid">
    {['width','height'].map(key=><label key={key}>{key==='width'?'宽度比例（%）':'高度比例（%）'}<input type="number" min=".01" step="1" value={Number((current[key]*100).toFixed(3))}
     onChange={event=>setRatios({...current,[key]:Number(event.target.value)/100})}/></label>)}
   </div><button type="button" className="btn" onClick={()=>send({action:'size',reference,...current})}>应用尺寸跟随</button>
   <small className="muted">参照尺寸变化时按比例调整；文字会重新换行。</small></>:<small className="muted">真实素材保持物理尺寸。</small>}
  </div>
 </details>;
}
