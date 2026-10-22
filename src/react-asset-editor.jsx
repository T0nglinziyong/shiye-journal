import React,{useEffect,useRef,useState} from 'react';
import {materialKindGroups,materialRoleGroups,materialTextureGroups,materialTaxonomyHelp,isMaterialTexture} from './material-taxonomy.js';
import {useUnsavedInput} from './unsaved-inputs.js';
import {TapeAssetImage} from './tape-asset-image.jsx';
import {tapeFlatCanvas} from './tape-flat-crop.js';
import {scheduleForegroundIdle} from './foreground-idle.js';

const tabNames=['基本信息','尺寸与胶带','分类与标签'];

export function AssetEditorDialog({asset,series,used,src,onClose,onSave}){
  const [tab,setTab]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [autoCrop,setAutoCrop]=useState(null);
  const previewRef=useRef(null),[previewSize,setPreviewSize]=useState({width:0,height:0});
  const sourceImage=useRef(null),[sourceSize,setSourceSize]=useState(null);
  const [sourceLoaded,setSourceLoaded]=useState(0);
  const [form,setForm]=useState({title:asset.title,kind:asset.kind,role:asset.role,
    texture:asset.texture||'未确定',width:asset.physicalWidthMM??'',height:asset.physicalHeightMM??'',
    contentTags:(asset.contentTags||[]).join('、'),styleTags:(asset.styleTags||[]).join('、'),
    materialTags:(asset.materialTags||[]).join('、'),tags:(asset.tags||[]).join('、'),
    seriesID:asset.seriesID||'',reviewStatus:asset.reviewStatus||'pendingReview',
    usageStatus:used?'used':'unused',tapeAxis:asset.tapeAxis||
      (Number(asset.physicalWidthMM)>=Number(asset.physicalHeightMM)?'x':'y'),
    repeatable:asset.tapeRepeatMode==='repeatablePattern',
    repeatStart:asset.tapeRepeatStartMM??0,
    repeatEnd:asset.tapeRepeatEndMM??asset.tapeRepeatPeriodMM??
      (asset.tapeAxis==='y'?asset.physicalHeightMM:asset.physicalWidthMM)??'',
    flatCropMode:asset.tapeFlatCrop?'manual':'auto',
    flatLeft:Math.round((asset.tapeFlatCrop?.left??0)*100),
    flatTop:Math.round((asset.tapeFlatCrop?.top??0)*100),
    flatRight:Math.round((asset.tapeFlatCrop?.right??1)*100),
    flatBottom:Math.round((asset.tapeFlatCrop?.bottom??1)*100)});
  const initial=useRef(JSON.stringify(form));
  useUnsavedInput('素材信息',JSON.stringify(form)!==initial.current);
  useEffect(()=>{
    const element=previewRef.current;if(!element)return;
    const update=()=>setPreviewSize(old=>old.width===element.clientWidth&&
      old.height===element.clientHeight?old:
      {width:element.clientWidth,height:element.clientHeight});
    update();const observer=new ResizeObserver(update);observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(tab!==1||form.kind!=='tape'||!sourceLoaded)return;
    const image=sourceImage.current;
    if(!image?.naturalWidth)return;
    setAutoCrop(null);
    // Detect the automatic crop once per source/axis, after input settles.
    // Slider changes only move DOM guides and never enter this pixel path.
    return scheduleForegroundIdle(()=>{try{
      const flat=tapeFlatCanvas(image,form.tapeAxis,null,{maxSize:480});
      if(flat)setAutoCrop(flat.crop);
    }catch{/* The visible source and manual guides remain available. */}},
    {minIdleMs:250});
  },[tab,src,form.kind,form.tapeAxis,sourceLoaded]);
  const set=(key,value)=>setForm(old=>key==='repeatable'&&value&&old.repeatEnd===''?
    {...old,[key]:value,repeatEnd:old.tapeAxis==='y'?old.height:old.width}:
    key==='flatCropMode'&&value==='manual'&&autoCrop?
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
  const taxonomy=(label,key,groups)=><label className="material-taxonomy-field" key={key} htmlFor={`asset-${key}`}>
    {label}<select id={`asset-${key}`} aria-describedby={`asset-${key}-hint`} value={form[key]}
      onChange={event=>set(key,event.target.value)}>
      {key==='texture'&&form.texture&&!isMaterialTexture(form.texture)?<option value={form.texture}>{form.texture}（现有记录，未改动）</option>:null}
      {groups.map(group=><optgroup key={group.label} label={group.label}>{group.options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</optgroup>)}
    </select><small id={`asset-${key}-hint`}>{materialTaxonomyHelp[key]}</small>
  </label>;
  const lengthMM=Number(form.tapeAxis==='y'?form.height:form.width);
  const number=(value,fallback=0)=>Number.isFinite(Number(value))&&value!==''?Number(value):fallback;
  const slider=(label,key,{min=0,max=100,step=1,suffix='%' }={})=><label
    className="tape-range-field" key={key} htmlFor={`asset-${key}`}>
    <span>{label}<output>{number(form[key],max).toFixed(step<1?1:0)}{suffix}</output></span>
    <input id={`asset-${key}`} type="range" min={min} max={Math.max(min,max)} step={step}
      value={Math.min(Math.max(number(form[key],max),min),Math.max(min,max))}
      onChange={event=>set(key,event.target.value)}/>
  </label>;
  const guideCrop=form.flatCropMode==='manual'?previewCrop:
    autoCrop||{left:0,top:0,right:1,bottom:1};
  const guideBox=sourceSize&&previewSize.width&&previewSize.height?(()=>{
    const scale=Math.min(previewSize.width/sourceSize.width,previewSize.height/sourceSize.height);
    const width=sourceSize.width*scale,height=sourceSize.height*scale;
    return {left:(previewSize.width-width)/2,top:(previewSize.height-height)/2,width,height};
  })():null;
  const guideFraction=value=>Math.min(1,Math.max(0,value));
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
      <div className="material-editor"><div className="material-editor-preview" ref={previewRef}>
        {src&&!(form.kind==='tape'&&tab===1)?<TapeAssetImage asset={previewAsset} src={src} alt={asset.title} priority
          onFlatCrop={crop=>{if(form.flatCropMode==='auto')setAutoCrop(old=>
            JSON.stringify(old)===JSON.stringify(crop)?old:crop);}}/>:!src?<span>无预览</span>:null}
        {src&&form.kind==='tape'&&tab===1?<div className="tape-source-guide" aria-label="原图取样边界预览">
          {guideBox?<div className="tape-guide-image-box" style={guideBox}>
            <img ref={sourceImage} src={src} alt="" onLoad={event=>{
              setSourceSize({width:event.currentTarget.naturalWidth,
                height:event.currentTarget.naturalHeight});setSourceLoaded(value=>value+1);}}/>
            {guideCrop?<div className="tape-guide-crop" style={{left:`${guideCrop.left*100}%`,
              top:`${guideCrop.top*100}%`,width:`${(guideCrop.right-guideCrop.left)*100}%`,
              height:`${(guideCrop.bottom-guideCrop.top)*100}%`}}/>:null}
            {form.repeatable&&lengthMM>0&&guideCrop?['repeatStart','repeatEnd'].map((key,index)=>{
              const fraction=guideFraction(number(form[key],index?lengthMM:0)/lengthMM);
              const position=(form.tapeAxis==='y'?guideCrop.top:guideCrop.left)+
                fraction*(form.tapeAxis==='y'?guideCrop.bottom-guideCrop.top:guideCrop.right-guideCrop.left);
              return <span key={key} className={`tape-guide-repeat ${form.tapeAxis==='y'?'horizontal':''}`}
                style={form.tapeAxis==='y'?{top:`${position*100}%`}:{left:`${position*100}%`}}>
                <b>{index?'终':'起'}</b></span>;
            }):null}
          </div>:<img ref={sourceImage} src={src} alt="" onLoad={event=>{
            setSourceSize({width:event.currentTarget.naturalWidth,
              height:event.currentTarget.naturalHeight});setSourceLoaded(value=>value+1);}}/>}
        </div>:null}
      </div><div className="cutout-tabs asset-editor-tabs" role="tablist" aria-label="素材信息分类">
          {tabNames.map((name,index)=><button type="button" role="tab" key={name}
            className={tab===index?'selected':''} aria-selected={tab===index}
            onClick={()=>setTab(index)}>{name}</button>)}
      </div><div className="material-editor-controls">
        <div className="stack material-info-panel" hidden={tab!==0}>
          {field('名称','title')}{taxonomy('类型','kind',materialKindGroups)}
          {taxonomy('主要画面作用','role',materialRoleGroups)}{taxonomy('材质','texture',materialTextureGroups)}
          {select('使用状态','usageStatus',[['unused','未使用'],['used','已使用']])}
        </div>
        <div className="stack material-info-panel" hidden={tab!==1}>
          <div className="form-grid">{field('实物宽 mm','width','number')}
            {field('实物高 mm','height','number')}</div>
          <section id="tape-pattern" hidden={form.kind!=='tape'}><h3>胶带图案</h3>
            {select('胶带长度方向','tapeAxis',[['x','图片横向'],['y','图片纵向']])}
            {select('端边修平','flatCropMode',[['auto','根据原图自动修平'],['manual','手动调整原图取样区域']])}
            {form.flatCropMode==='manual'?<div className="tape-flat-fields">
              {slider('左边界','flatLeft',{max:Math.max(0,number(form.flatRight,100)-2)})}
              {slider('右边界','flatRight',{min:Math.min(100,number(form.flatLeft)+2)})}
              {slider('上边界','flatTop',{max:Math.max(0,number(form.flatBottom,100)-2)})}
              {slider('下边界','flatBottom',{min:Math.min(100,number(form.flatTop)+2)})}
            </div>:null}
            <small>只调整胶带显示区域，原 PNG 不变；改回其他类型会显示原图。</small>
            <label className="toggle-row">已确认重复纹样<input id="asset-repeatable" type="checkbox"
              checked={form.repeatable} onChange={event=>set('repeatable',event.target.checked)}/></label>
            {form.repeatable?<div className="tape-flat-fields">
              {slider('纹样起点','repeatStart',{max:Math.max(0,number(form.repeatEnd,lengthMM)-.1),step:.1,suffix:' mm'})}
              {slider('纹样终点','repeatEnd',{min:Math.min(lengthMM,number(form.repeatStart)+.1),max:lengthMM,step:.1,suffix:' mm'})}
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
