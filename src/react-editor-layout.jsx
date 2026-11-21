import React,{useEffect,useState} from 'react';
import {commonShapes,advancedShapes} from './editor-tools-model.js';
import {inspectorLayoutModel,inspectorSizeRatios,inspectorSizeControls,inspectorPlacementControls,inspectorReference} from './editor-layout-model.js';
import './editor-layout.css';
const shapeNames=new Map([...commonShapes,...advancedShapes]);

export function EditorLayoutPanel({page,nodeID,onAction,asset}){
 let model,initialSize;
 try{
  model=inspectorLayoutModel(page,nodeID,node=>node.type==='shape'?shapeNames.get(node.kind):node.type==='material'?asset?.(node.assetID)?.title:null);
  initialSize=inspectorSizeControls(page,nodeID);
  if(model.constraint.place&&!model.references.some(([id])=>id===inspectorReference(page,model.constraint.place.reference)))throw Error('位置参照对象不可用');
 }catch(error){return <details className="editor-inspector-layout"><summary>跟随对象 · 需检查</summary><p role="status">{error.message}。解除跟随会保留当前外观。</p><button type="button" className="btn" onClick={()=>onAction('fabric-inspector-layout',{action:'detach',scope:'all'})}>解除此对象的跟随</button></details>;}
 return <details className="editor-inspector-layout"><summary>跟随对象{model.constraint.place||model.constraint.size?' · 已设置':''}</summary>
  <LayoutForm key={nodeID} page={page} nodeID={nodeID} model={model} initialSize={initialSize} onAction={onAction}/>
 </details>;
}
function LayoutForm({page,nodeID,model,initialSize,onAction}){
 const {constraint}=model;
 const [reference,setReference]=useState(()=>inspectorReference(page,constraint.place?.reference||'page'));
 const [sizeReference,setSizeReference]=useState(initialSize.reference),[axes,setAxes]=useState(initialSize.axes);
 const [position,setPosition]=useState(()=>inspectorPlacementControls(constraint.place).position),[gap,setGap]=useState(()=>inspectorPlacementControls(constraint.place).gap);
 const [follow,setFollow]=useState(()=>constraint.place?.rotationSpace==='reference'),[ratios,setRatios]=useState(initialSize.ratios);
 const placeKey=JSON.stringify(constraint.place||null),sizeKey=JSON.stringify(constraint.size||null);
 // Applying one channel must not discard the other channel's pending controls.
 useEffect(()=>{const c=inspectorPlacementControls(constraint.place);setReference(inspectorReference(page,constraint.place?.reference||'page'));setPosition(c.position);setGap(c.gap);setFollow(constraint.place?.rotationSpace==='reference');},[placeKey]);
 useEffect(()=>{const c=inspectorSizeControls(page,nodeID);setSizeReference(c.reference);setAxes(c.axes);setRatios(c.ratios);},[sizeKey]);
 const [error,setError]=useState('');
 const send=request=>{try{setError('');onAction('fabric-inspector-layout',request);}catch(e){setError(e.message);}};
 const name=ref=>model.references.find(([id])=>id===inspectorReference(page,ref))?.[1]||ref;
 const ratioKeys=axes==='both'?['width','height']:[axes];
 const chooseSizeReference=value=>{setSizeReference(value);setRatios(inspectorSizeRatios(page,nodeID,value));};
 const referenceOptions=model.references.map(([key,title])=><option key={key} value={key}>{title}</option>);
 const separation=!['keep','center'].includes(position);
 return <div className="stack layout-controls">
  <h4>位置跟随</h4>
  {constraint.place?<p className="muted">已跟随：{name(constraint.place.reference)}<button type="button" className="btn mini" onClick={()=>send({action:'detach',scope:'place'})}>解除位置跟随</button></p>:null}
  <label>位置参照对象<select value={reference} onChange={event=>setReference(event.target.value)}>{referenceOptions}</select></label>
  <label>相对位置<select value={position} onChange={event=>setPosition(event.target.value)}>
   {[['keep','保持当前位置'],['above','上方'],['below','下方'],['left','左侧'],['right','右侧'],['center','居中']].map(([key,title])=><option key={key} value={key}>{title}</option>)}
  </select></label>
  {separation?<><label>相隔距离<input type="range" min="0" max={Math.max(20,Number(gap)||0)} step=".5" value={gap} onChange={event=>setGap(event.target.value)}/><span className="layout-range-hints"><span>贴近</span><span>拉开</span></span></label>
   <div className="layout-choices" role="group" aria-label="间距预设">{[[0,'贴边'],[2,'紧凑'],[5,'宽松']].map(([value,title])=><button type="button" className="btn mini" key={value} aria-pressed={Number(gap)===value} onClick={()=>setGap(String(value))}>{title}</button>)}</div></>:null}
  <label className="editor-inspector-check"><input type="checkbox" checked={follow} onChange={event=>setFollow(event.target.checked)}/>同时跟随旋转</label>
  <button type="button" className="btn" onClick={()=>send({action:'place',reference,position,gap,followRotation:follow})}>应用位置跟随</button>
  <small className="muted">拖动此对象可调整相对位置；解除后保留当前外观。</small>
  {model.canResize?<>
   <h4>尺寸跟随</h4>
   {constraint.size?<p className="muted">已跟随：{name(constraint.size.reference)}<button type="button" className="btn mini" onClick={()=>send({action:'detach',scope:'size'})}>解除尺寸跟随</button></p>:null}
   <label>尺寸参照对象<select value={sizeReference} onChange={event=>chooseSizeReference(event.target.value)}>{referenceOptions}</select></label>
   <label>尺寸变化方式<select value={axes} onChange={event=>setAxes(event.target.value)}><option value="both">宽高分别跟随</option><option value="width">{model.type==='text'?'只跟随宽度':'按宽度等比跟随'}</option><option value="height">{model.type==='text'?'只跟随高度':'按高度等比跟随'}</option></select></label>
   {ratioKeys.map(key=><div key={key}><label>{key==='width'?'相对宽度':'相对高度'}<input type="range" min=".001" max={Math.max(2,ratios[key]||0)} step=".001" value={ratios[key]} onChange={event=>setRatios({...ratios,[key]:Number(event.target.value)})}/><span className="layout-range-hints"><span>小一些</span><span>大一些</span></span></label>
    <div className="layout-choices" role="group" aria-label={key==='width'?'宽度预设':'高度预设'}>{[[.5,'一半'],[1,'相同'],[1.5,'一倍半']].map(([value,title])=><button type="button" className="btn mini" key={value} aria-pressed={ratios[key]===value} onClick={()=>setRatios({...ratios,[key]:value})}>{title}</button>)}</div>
   </div>)}
   <button type="button" className="btn" onClick={()=>send({action:'size',reference:sizeReference,axes,...ratios})}>应用尺寸跟随</button>
   <small className="muted">宽高相对所选参照调整。文字宽度变化会重新换行，高度是书写区域的最小高度。</small>
  </>:<small className="muted">真实素材保持物理尺寸。</small>}
  {separation||model.canResize?<details><summary>精细调整</summary><div className="stack">
   {separation?<label>间距（mm）<input type="number" min="0" max="500" step=".5" value={gap} onChange={event=>setGap(event.target.value)}/></label>:null}
   {model.canResize?ratioKeys.map(key=><label key={key}>{key==='width'?'宽度比例（%）':'高度比例（%）'}<input type="number" min=".01" max="10000000" step="1" value={Number((ratios[key]*100).toFixed(3))} onChange={event=>setRatios({...ratios,[key]:Number(event.target.value)/100})}/></label>):null}
  </div></details>:null}
  {error?<p role="alert">{error}</p>:null}
 </div>;
}
