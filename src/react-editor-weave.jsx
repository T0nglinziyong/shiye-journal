import './editor-weave.css';
import React,{useEffect,useState} from 'react';
import {weaveInspectorModel,inspectorWeaveCrossings} from './scene-weave-edit.js';

export function EditorWeavePanel({node,page,asset,onAction}){
 const model=weaveInspectorModel(page,node.id,asset);
 const [selected,setSelected]=useState([]),[frontFirst,setFrontFirst]=useState(true),[error,setError]=useState('');
 const signature=JSON.stringify(model.openings.map(row=>row.key));
 useEffect(()=>{const valid=new Set(JSON.parse(signature));setSelected(keys=>keys.filter(key=>valid.has(key)));setError('');},[node.id,signature]);
 if(!model.available)return null;
 const chosen=model.openings.filter(row=>selected.includes(row.key));
 const apply=()=>{try{const through=inspectorWeaveCrossings(model,selected,frontFirst);setError('');onAction('fabric-inspector-weave',through);}catch(e){setError(e.message);}};
 return <details className="editor-weave-panel"><summary>纸条穿插{model.applied?' · 已设置':''}</summary><div className="stack">
  <small>先在画布摆好纸条和开孔素材，再选择要穿过的孔洞。按纸条方向自动排序；应用后直接查看画布，完成才保存。</small>
  {model.openings.length?<fieldset><legend>选择真实孔洞</legend><div className="stack">{model.openings.map(row=><label key={row.key} className="editor-weave-choice">
   <input type="checkbox" checked={selected.includes(row.key)} onChange={e=>{setSelected(keys=>e.target.checked?[...keys,row.key]:keys.filter(key=>key!==row.key));setError('');}}/>
   <span>{row.label}</span>
  </label>)}</div></fieldset>:<p className="muted">同一层级还没有带真实孔洞的其他素材。可先用剪刀开窗；显示遮罩不属于实体开孔。</p>}
  {chosen.length?<><div className="form-grid" role="group" aria-label="穿插正反方向">
   <button type="button" className="btn mini" aria-pressed={frontFirst} onClick={()=>setFrontFirst(true)}>首孔后在正面</button>
   <button type="button" className="btn mini" aria-pressed={!frontFirst} onClick={()=>setFrontFirst(false)}>首孔后在背面</button>
  </div><ol className="editor-weave-route">{chosen.map((row,i)=><li key={row.key}>{row.label} → {(i%2===0)===frontFirst?'正面':'背面'}</li>)}</ol></>:null}
  {error?<p role="alert">{error}</p>:null}
  <div className="form-grid"><button type="button" className="btn primary" disabled={chosen.length<2||chosen.length>16} onClick={apply}>应用穿插</button>
   <button type="button" className="btn" disabled={!model.applied} onClick={()=>onAction('fabric-inspector-weave',null)}>解除穿插</button></div>
  <small>开孔需要容纳整条纸条的宽度。解除只去掉局部正反显示，保留纸条当前尺寸、位置和来源。</small>
 </div></details>;
}
