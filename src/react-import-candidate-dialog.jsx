import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {materialKinds,materialRoles} from './material-taxonomy.js';

export function ImportCandidateDialog({candidate,recordIndex,candidateIndex,onClose,onToggle,
  onSave,onCheck,onError}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(()=>({title:candidate.title||'',
    width:candidate.width??'',height:candidate.height??'',kind:candidate.kind||'sticker',
    role:candidate.role||'focal',quantity:candidate.quantity??(candidate.kind==='tape'?999:1),
    reviewStatus:candidate.reviewStatus||'pendingReview'}));
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const modal=document.querySelector('#modal');
    const closed=()=>closeRef.current();
    modal?.addEventListener('close',closed);
    if(modal&&!modal.open)modal.showModal();
    return ()=>{modal?.removeEventListener('close',closed);if(modal?.open)modal.close();};
  },[]);
  const host=document.querySelector('#modal-body');
  if(!host)return null;
  const change=(key,value)=>setDraft(previous=>({...previous,[key]:value}));
  const save=event=>{
    event.preventDefault();
    const width=String(draft.width).trim()?Number(draft.width):null;
    const height=String(draft.height).trim()?Number(draft.height):null;
    const quantity=Number(draft.quantity);
    if(width!==null&&(!Number.isFinite(width)||width<=0)||
       height!==null&&(!Number.isFinite(height)||height<=0)||
       !Number.isInteger(quantity)||quantity<1||quantity>999){
      onError('尺寸需为正数，数量须为 1–999');return;
    }
    onSave(recordIndex,candidateIndex,{...draft,title:draft.title.trim(),width,height,quantity});
    onClose();
  };
  return createPortal(editing?<><div className="dialog-head"><h2>素材信息</h2>
      <button type="button" className="btn" onClick={onClose}>取消</button></div>
    <form className="stack" onSubmit={save}>
      <label>名称<input id="candidate-edit-name" value={draft.title}
        onChange={event=>change('title',event.target.value)}/></label>
      <div className="form-grid"><label>宽 mm<input id="candidate-edit-width" type="number" step="any"
        value={draft.width} onChange={event=>change('width',event.target.value)}/></label>
        <label>高 mm<input id="candidate-edit-height" type="number" step="any"
          value={draft.height} onChange={event=>change('height',event.target.value)}/></label></div>
      <label>类型<select id="candidate-edit-kind" value={draft.kind}
        onChange={event=>setDraft(previous=>({...previous,kind:event.target.value,
          quantity:event.target.value==='tape'&&Number(previous.quantity)===1?999:previous.quantity}))}>
        {materialKinds.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>作用<select id="candidate-edit-role" value={draft.role}
        onChange={event=>change('role',event.target.value)}>
        {materialRoles.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>数量<input id="candidate-edit-quantity" type="number" min="1" max="999" step="1"
        value={draft.quantity} onChange={event=>change('quantity',event.target.value)}/></label>
      <label>状态<select id="candidate-edit-status" value={draft.reviewStatus}
        onChange={event=>change('reviewStatus',event.target.value)}>
        <option value="pendingReview">待检查</option><option value="ready">已整理</option>
      </select></label>
      <button type="submit" className="btn primary" id="candidate-edit-save">保存修改</button>
    </form></>:<><h2>素材操作</h2><div className="stack" id="candidate-menu">
      <button type="button" className="btn" onClick={()=>setEditing(true)}>重命名</button>
      <button type="button" className="btn" onClick={()=>setEditing(true)}>编辑素材信息</button>
      <button type="button" className="btn" onClick={()=>{onToggle(recordIndex,candidateIndex);onClose();}}>
        {candidate.selected?'不保存这件':'保存这件'}</button>
      <button type="button" className="btn" onClick={()=>{onClose();onCheck(candidate);}}>检查边缘</button>
    </div></>,host);
}

const paperTypes=[['plain','纯色'],['grid','方格'],['lines','横线'],['dots','点阵'],
  ['columns','双栏']];

export function ImportBackgroundDialog({pattern,color,onChange,onClose}){
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const modal=document.querySelector('#modal');
    const closed=()=>closeRef.current();
    modal?.addEventListener('close',closed);
    if(modal&&!modal.open)modal.showModal();
    return ()=>{modal?.removeEventListener('close',closed);if(modal?.open)modal.close();};
  },[]);
  const host=document.querySelector('#modal-body');
  if(!host)return null;
  return createPortal(<><div className="dialog-head"><h2>页面背景</h2></div>
    <div className="stack"><label>底纸样式<select id="review-background-pattern"
      value={pattern} onChange={event=>onChange({pattern:event.target.value,color})}>
      {paperTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label><label>底纸颜色<input id="review-background-color" type="color"
      value={color} onChange={event=>onChange({pattern,color:event.target.value})}/></label>
      <button type="button" className="btn primary" id="review-background-done"
        onClick={onClose}>完成</button></div></>,host);
}
