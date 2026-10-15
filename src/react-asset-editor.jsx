import React,{useState} from 'react';

const kindChoices=[['sticker','贴纸'],['paper','纸张'],['tape','胶带'],['photo','照片'],['text','文字'],['reference','参考']];
const roleChoices=[['focal','主角'],['support','陪衬'],['background','背景'],['connector','连接'],['annotation','注释']];
const tabNames=['基本信息','尺寸与库存','分类与标签'];

export function AssetEditorDialog({asset,series,used,src,onClose,onSave}){
  const [tab,setTab]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [form,setForm]=useState({title:asset.title,kind:asset.kind,role:asset.role,
    texture:asset.texture||'',width:asset.physicalWidthMM??'',height:asset.physicalHeightMM??'',
    quantity:asset.supply?.quantity??(asset.kind==='tape'?999:1),
    contentTags:(asset.contentTags||[]).join('、'),styleTags:(asset.styleTags||[]).join('、'),
    materialTags:(asset.materialTags||[]).join('、'),tags:(asset.tags||[]).join('、'),
    seriesID:asset.seriesID||'',reviewStatus:asset.reviewStatus||'pendingReview',
    usageStatus:used?'used':'unused',tapeRoll:asset.supply?.kind==='tapeRoll',
    supplyLength:asset.supply?.availableLengthMM??'',repeatable:asset.tapeRepeatMode==='repeatablePattern',
    repeatPeriod:asset.tapeRepeatPeriodMM??''});
  const set=(key,value)=>setForm(old=>({...old,[key]:value,...(key==='kind'&&value==='tape'&&Number(old.quantity)===1?{quantity:999}:{})}));
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
      <div className="dialog-head asset-edit-head"><h2>编辑素材</h2><div className="asset-edit-actions">
        <button type="button" id="asset-dialog-close" aria-label="取消编辑" onClick={onClose}>取消</button>
        <button type="button" className="btn primary" id="save-asset" disabled={busy}
          onClick={()=>void submit()}>保存</button>
      </div></div>
      <div className="material-editor"><div className="material-editor-preview">
        {src?<img src={src} data-asset-image-id={asset.id} alt={asset.title}/>:<span>无预览</span>}
      </div><div className="material-editor-controls">
        <div className="cutout-tabs" role="tablist" aria-label="素材信息分类">
          {tabNames.map((name,index)=><button type="button" role="tab" key={name}
            className={tab===index?'selected':''} aria-selected={tab===index}
            onClick={()=>setTab(index)}>{name}</button>)}
        </div>
        <div className="stack material-info-panel" hidden={tab!==0}>
          {field('名称','title')}{select('类型','kind',kindChoices)}
          {select('画面作用','role',roleChoices)}{field('材质','texture')}
          {select('使用状态','usageStatus',[['unused','未使用'],['used','已使用']])}
        </div>
        <div className="stack material-info-panel" hidden={tab!==1}>
          <div className="form-grid">{field('实物宽 mm','width','number')}
            {field('实物高 mm','height','number')}</div>
          {field('数量（999＝不限使用）','quantity','number')}
          <section id="tape-stock" hidden={form.kind!=='tape'}><h3>胶带库存</h3>
            <label className="toggle-row">实际持有整卷<input id="asset-tape-roll" type="checkbox"
              checked={form.tapeRoll} onChange={event=>set('tapeRoll',event.target.checked)}/></label>
            {field('整卷剩余长度 mm','supplyLength','number')}
            <label className="toggle-row">已确认重复纹样<input id="asset-repeatable" type="checkbox"
              checked={form.repeatable} onChange={event=>set('repeatable',event.target.checked)}/></label>
            {field('真实重复周期 mm','repeatPeriod','number')}
            <p>未知周期时只能使用照片拍到的一段。</p>
          </section>
          <p>数量 999 表示无限使用，创作后不会自动减为 998；数量为 0 时不可用于搭配。</p>
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
