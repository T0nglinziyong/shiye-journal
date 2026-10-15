import React,{useState} from 'react';

export function ProjectMetadataDialog({project,onClose,onSave,onSnapshot,onPreview}){
  const [title,setTitle]=useState(project.title),[tags,setTags]=useState((project.styleTags||[]).join(', ')),
    [used,setUsed]=useState(!!project.isUsed),[usageTouched,setUsageTouched]=useState(false),
    [busy,setBusy]=useState(false),[error,setError]=useState('');
  const save=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await onSave({title:title.trim(),styleTags:tags.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean),
      isUsed:used,usageTouched});onClose();}
    catch(cause){setError(cause.message||'保存失败');}
    finally{setBusy(false);}
  };
  const snapshot=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await onSnapshot();onClose();}
    catch(cause){setError(cause.message||'快照保存失败');}
    finally{setBusy(false);}
  };
  return <div className="cloud-admin-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();}}>
    <section className="cloud-admin-panel" role="dialog" aria-modal="true" aria-label="作品信息与标签">
      <div className="dialog-head"><h2>作品信息与标签</h2>
        <button type="button" id="project-dialog-close" aria-label="取消编辑" onClick={onClose}>取消</button></div>
      <div className="stack"><label>名称<input id="project-meta-title" value={title}
        onChange={event=>setTitle(event.target.value)}/></label>
        <label>风格标签（用逗号分开）<input id="project-meta-tags" value={tags}
          onChange={event=>setTags(event.target.value)}/></label>
        <label>使用标记<select id="project-meta-used" value={used?'used':'unused'}
          onChange={event=>{setUsed(event.target.value==='used');setUsageTouched(true);}}>
          <option value="unused">未使用</option><option value="used">已使用</option>
        </select></label>
        <button type="button" className="btn primary" id="project-meta-save" disabled={busy}
          onClick={()=>void save()}>保存作品信息</button>
        {!project.isSnapshot?<button type="button" className="btn" id="project-meta-snapshot"
          disabled={busy} onClick={()=>void snapshot()}>保存快照</button>:null}
        <button type="button" className="btn" id="project-meta-preview" onClick={()=>{
          onClose();onPreview();}}>查看完整作品</button>
        {error?<p role="alert">{error}</p>:null}
      </div>
    </section>
  </div>;
}
