import React from 'react';
import {advancedShapeControls,resolvedShapeOptions} from './advanced-shape-options.js';
import './editor-shape-options.css';

// Keep the inspector's existing transaction and Scene validation as the only writer.
export function EditorShapeOptions({node,onChange}){
 const controls=advancedShapeControls(node.kind);
 if(!controls.length)return null;
 const options=resolvedShapeOptions(node.kind,node.shapeOptions||{});
 const change=(control,value)=>onChange(`inspector-shape-option-${control.key}`,value);
 const quantities=controls.filter(control=>control.type==='integer');
 const ranges=controls.filter(control=>control.type==='number');
 return <section className="editor-inspector-advanced editor-shape-options">
  <h4>图形内容</h4><p className="muted">{controls.some(control=>control.key==='rows')?'拉伸时格子数量不变；增减行列时保留每格大小。':'在画布上缩放整体；这里调整图案细节。增减重复数量会相应调整外框。'}</p>
  <div className="shape-option-list">{controls.map(control=>{
   const value=options[control.key],id=`inspector-shape-option-${control.key}`;
   if(control.type==='boolean')return <label className="shape-option-check" key={control.key}>
    <input id={id} type="checkbox" checked={value} onChange={e=>change(control,e.target.checked)}/>{control.label}
   </label>;
   if(control.type==='integer')return <div className="shape-option-count" key={control.key}>
    <span id={`${id}-label`}>{control.label}</span><div role="group" aria-labelledby={`${id}-label`}>
     <button type="button" className="btn mini" aria-label={`减少${control.label}`} disabled={value<=control.min} onClick={()=>change(control,value-1)}>−</button>
     <output id={id} aria-live="polite">{value}</output>
     <button type="button" className="btn mini" aria-label={`增加${control.label}`} disabled={value>=control.max} onClick={()=>change(control,value+1)}>＋</button>
    </div>
   </div>;
   const ratio=control.max<=1;
   return <label className="shape-option-range" key={control.key} htmlFor={id}>
    <span>{control.label}<output>{ratio?`${Number((value*100).toFixed(1))}%`:value}{control.key==='angle'?'°':''}</output></span>
    <input id={id} type="range" min={control.min} max={control.max} step={ratio?0.005:control.key==='angle'?1:0.1} value={value} onChange={e=>change(control,Number(e.target.value))}/>
   </label>;
  })}</div>
  {quantities.length||ranges.length?<details className="shape-option-precise"><summary>精确调整</summary><div className="form-grid">
   {[...quantities,...ranges].map(control=><label key={control.key}>{control.label}
    <input type="number" aria-label={`精确${control.label}`} min={control.min} max={control.max} step={control.type==='integer'?1:'any'} defaultValue={options[control.key]} key={`${control.key}-${options[control.key]}`}
     onBlur={e=>{if(e.target.value!==''&&e.target.validity.valid)change(control,Number(e.target.value));else e.target.value=options[control.key];}}/>
   </label>)}
  </div></details>:null}
 </section>;
}
