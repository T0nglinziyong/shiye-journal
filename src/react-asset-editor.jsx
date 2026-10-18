import React,{useRef,useState} from 'react';
import {materialKinds,materialRoles,materialTextures,isMaterialTexture} from './material-taxonomy.js';
import {useUnsavedInput} from './unsaved-inputs.js';
import {TapeAssetImage} from './tape-asset-image.jsx';

const tabNames=['基本信息','尺寸与胶带','分类与标签'];

export function AssetEditorDialog({asset,series,used,src,onClose,onSave}){
  const [tab,setTab]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [autoCrop,setAutoCrop]=useState(null);
  const [form,setForm]=useState({title:asset.title,kind:asset.kind,role:asset.role,
    texture:isMaterialTexture(asset.texture)?asset.texture:'未确定',width:asset.physicalWidthMM??'',height:asset.physicalHeightMM??'',
    contentTags:(asset.contentTags||[]).join('、'),styleTags:(asset.styleTags||[]).join('、'),
    materialTags:(asset.materialTags||[]).join('、'),tags:(asset.tags||[]).join('、'),
    seriesID:asset.seriesID||'',reviewStatus:asset.reviewStatus||'pendingReview',
    usageStatus:used?'used':'unused',tapeAxis:asset.tapeAxis||
      (Number(asset.physicalWidthMM)>=Number(asset.physicalHeightMM)?'x':'y'),
    repeatable:asset.tapeRepeatMode==='repeatablePattern',
    repeatStart:asset.tapeRepeatStartMM??0,
    repeatEnd:asset.tapeRepeatEndMM??asset.tapeRepeatPeriodMM??'',
    flatCropMode:asset.tapeFlatCrop?'manual':'auto',
    flatLeft:Math.round((asset.tapeFlatCrop?.left??0)*100),
    flatTop:Math.round((asset.tapeFlatCrop?.top??0)*100),
    flatRight:Math.round((asset.tapeFlatCrop?.right??1)*100),
    flatBottom:Math.round((asset.tapeFlatCrop?.bottom??1)*100)});
  const initial=useRef(JSON.stringify(form));
  useUnsavedInput('素材信息',JSON.stringify(form)!==initial.current);
  const set=(key,value)=>setForm(old=>key==='flatCropMode'&&value==='manual'&&autoCrop?
    {...old,[key]:value,flatLeft:Math.round(autoCrop.left*100),
      flatTop:Math.round(autoCrop.top*100),flatRight:Math.round(autoCrop.right*100),
      flatBottom:Math.round(autoCrop.bottom*100)}:{...old,[key]:value});
  const previewCrop=form.flatCropMode==='manual'?{
    left:Number(form.flatLeft)/100,top:Number(form.flatTop)/100,
    right:Number(form.flatRight)/100,bottom:Number(form.flatBottom)/100}:null;
  const previewAsset={...asset,kind:form.kind,tapeAxis:form.tapeAxis,
    tapeFlatCrop:previewCrop&&Object.values(previewCrop).every(Number.isFinite)&&
      previewCrop.right-previewCrop.left>=.02&&previewCrop.bottom-previewCrop.top>=.02?
      previewCrop:null};
  const field=(label,key,type='text')=><label key={key}>{label}<input id={`asset-${key}`} type={type}
    value={form[key]} onChange={event=>set(key,event.target.value)}/></label>;
  const select=(label,key,choices)=><label key={key}>{label}<select id={`asset-${key}`}
    value={form[key]} onChange={event=>set(key,event.target.value)}>
    {choices.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>;
  const submit=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{await onSave(form);onClose();}
    catch(cause){setError(cause.message||'保存失败');}
    finally{setBusy(false);}
  };
  return <div className="cloud-admin-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();}}>
    <section className="cloud-admin-panel material-editor-dialog" role="dialog" aria-modal="true" aria-label="编辑素材">
      <div className="dialog-head asset-edit-head">
        <button type="button" id="asset-dialog-close" aria-label="取消编辑" onClick={onClose}>取消</button>
        <h2>编辑素材</h2>
        <button type="button" className="btn primary" id="save-asset" disabled={busy}
          onClick={()=>void submit()}>应用</button>
      </div>
      <div className="material-editor"><div className="material-editor-preview">
        {src?<TapeAssetImage asset={previewAsset} src={src} alt={asset.title} priority
          onFlatCrop={crop=>{if(form.flatCropMode==='auto')setAutoCrop(crop);}}/>:<span>无预览</span>}
      </div><div className="cutout-tabs asset-editor-tabs" role="tablist" aria-label="素材信息分类">
          {tabNames.map((name,index)=><button type="button" role="tab" key={name}
            className={tab===index?'selected':''} aria-selected={tab===index}
            onClick={()=>setTab(index)}>{name}</button>)}
      </div><div className="material-editor-controls">
        <div className="stack material-info-panel" hidden={tab!==0}>
          {field('名称','title')}{select('类型','kind',materialKinds)}
          {select('画面作用','role',materialRoles)}{select('材质','texture',materialTextures.map(value=>[value,value]))}
          {select('使用状态','usageStatus',[['unused','未使用'],['used','已使用']])}
        </div>
        <div className="stack material-info-panel" hidden={tab!==1}>
          <div className="form-grid">{field('实物宽 mm','width','number')}
            {field('实物高 mm','height','number')}</div>
          <section id="tape-pattern" hidden={form.kind!=='tape'}><h3>胶带图案</h3>
            {select('胶带长度方向','tapeAxis',[['x','图片横向'],['y','图片纵向']])}
            {select('端边修平','flatCropMode',[['auto','根据原图自动修平'],['manual','手动调整原图取样区域']])}
            {form.flatCropMode==='manual'?<div className="form-grid tape-flat-fields">
              {field('左边界 %','flatLeft','number')}{field('右边界 %','flatRight','number')}
              {field('上边界 %','flatTop','number')}{field('下边界 %','flatBottom','number')}
            </div>:null}
            <small>只调整胶带显示区域，原 PNG 不变；改回其他类型会显示原图。</small>
            <label className="toggle-row">已确认重复纹样<input id="asset-repeatable" type="checkbox"
              checked={form.repeatable} onChange={event=>set('repeatable',event.target.checked)}/></label>
            {form.repeatable?<div className="form-grid">
              {field('纹样起点 mm','repeatStart','number')}
              {field('纹样终点 mm','repeatEnd','number')}
            </div>:null}
          </section>
        </div>
        <div className="stack material-info-panel" hidden={tab!==2}>
          {field('具体内容','contentTags')}{field('风格','styleTags')}
          {field('材质标签','materialTags')}{field('其他标签','tags')}
          {select('所属系列','seriesID',[['','不归入系列'],...series.map(item=>[item.id,item.title])])}
          {select('整理状态','reviewStatus',[['ready','已整理'],['pendingReview','待检查']])}
        </div>
        <p id="asset-save-error" role="alert">{error}</p>
      </div></div>
    </section>
  </div>;
}
