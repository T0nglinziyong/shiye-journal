import React,{useState} from 'react';
import {processTapeAsset,tapeDimensions} from './tape-strip.js';

export function TapeProcessingDialog({asset,src,onClose,onSave}){
  const [axis,setAxis]=useState(asset.tapeAxis||
    (asset.physicalWidthMM>=asset.physicalHeightMM?'x':'y'));
  const [repeatable,setRepeatable]=useState(asset.tapeRepeatMode==='repeatablePattern');
  const [period,setPeriod]=useState(asset.tapeRepeatPeriodMM||'');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const {widthMM,lengthMM}=tapeDimensions({...asset,tapeAxis:axis});
  const save=async()=>{if(busy)return;setBusy(true);setError('');
    try{await onSave(processTapeAsset(asset,{axis,repeatable,periodMM:period}));onClose();}
    catch(cause){setError(cause.message||'胶带设置未保存');}
    finally{setBusy(false);}
  };
  return <div className="cloud-admin-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();}}>
    <section className="cloud-admin-panel tape-processing-dialog" role="dialog" aria-modal="true" aria-label="处理胶带">
      <div className="dialog-head"><h2>处理胶带</h2><button type="button" className="btn" onClick={onClose}>关闭</button></div>
      <p>先核对实拍样段和真实尺寸。只有图案确实周期重复时，才启用连续拖动。</p>
      {src?<div className="tape-processing-image"><img src={src} alt={asset.title}/></div>:null}
      <div className="stack">
        <label>胶带长度方向<select value={axis} onChange={event=>setAxis(event.target.value)}>
          <option value="x">图片横向</option><option value="y">图片纵向</option>
        </select></label>
        <p>真实宽度 {widthMM.toFixed(1)} mm · 实拍长度 {lengthMM.toFixed(1)} mm</p>
        <label className="toggle-row">已确认图案可以无缝重复
          <input type="checkbox" checked={repeatable} onChange={event=>setRepeatable(event.target.checked)}/>
        </label>
        {repeatable?<label>重复周期（mm）<input type="number" min="0.1" max={lengthMM}
          step="0.1" value={period} onChange={event=>setPeriod(event.target.value)}/></label>:null}
      </div>
      <p>未确认重复时，一次拖出的长度不能超过实拍样段；多段胶带仍可分别放置。</p>
      {error?<p className="tape-processing-error" role="alert">{error}</p>:null}
      <div className="tape-processing-actions"><button type="button" className="btn" onClick={onClose}>放弃</button>
        <button type="button" className="btn primary" disabled={busy} onClick={()=>void save()}>完成</button></div>
    </section>
  </div>;
}
