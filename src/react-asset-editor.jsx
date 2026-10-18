import React,{useRef,useState} from 'react';
import {materialKinds,materialRoles,materialTextures,isMaterialTexture} from './material-taxonomy.js';
import {useUnsavedInput} from './unsaved-inputs.js';

const tabNames=['基本信息','尺寸与胶带','分类与标签'];

export function AssetEditorDialog({asset,series,used,src,onClose,onSave}){
  const [tab,setTab]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [form,setForm]=useState({title:asset.title,kind:asset.kind,role:asset.role,
    texture:isMaterialTexture(asset.texture)?asset.texture:'未确定',width:asset.physicalWidthMM??'',height:asset.physicalHeightMM??'',
    contentTags:(asset.contentTags||[]).join('、'),styleTags:(asset.styleTags||[]).join('、'),
    materialTags:(asset.materialTags||[]).join('、'),tags:(asset.tags||[]).join('、'),
    seriesID:asset.seriesID||'',reviewStatus:asset.reviewStatus||'pendingReview',
    usageStatus:used?'used':'unused',tapeAxis:asset.tapeAxis||
      (Number(asset.physicalWidthMM)>=Number(asset.physicalHeightMM)?'x':'y'),
    repeatable:asset.tapeRepeatMode==='repeatablePattern',
    repeatPeriod:asset.tapeRepeatPeriodMM??''});
  const initial=useRef(JSON.stringify(form));
  useUnsavedInput('素材信息',JSON.stringify(form)!==initial.current);
  const set=(key,value)=>setForm(old=>({...old,[key]:value}));
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
        {src?<img src={src} data-asset-image-id={asset.id} alt={asset.title}/>:<span>无预览</span>}
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
            <label className="toggle-row">已确认重复纹样<input id="asset-repeatable" type="checkbox"
              checked={form.repeatable} onChange={event=>set('repeatable',event.target.checked)}/></label>
            {field('真实重复周期 mm','repeatPeriod','number')}
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
