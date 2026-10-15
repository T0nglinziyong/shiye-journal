import React,{useRef,useState} from 'react';
import {paperPresets} from './paper-sizes.js';

export function Dialog({title,onClose,children,className=''}){
  return <div className="cloud-admin-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();}}>
    <section className={`cloud-admin-panel ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="dialog-close" aria-label="关闭" onClick={onClose} style={{float:"right"}}>×</button>
      {children}
    </section>
  </div>;
}
export function BlankProjectDialog({defaultSize,onClose,onCreate}){
  const [mode,setMode]=useState('single'),[size,setSize]=useState(defaultSize?.startsWith('custom:')?'custom':defaultSize||'a4'),
    [width,setWidth]=useState(210),[height,setHeight]=useState(297),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async()=>{
    if(busy)return;
    let ratio=size;
    if(size==='custom'){
      const w=Number(width),h=Number(height);
      if(!Number.isInteger(w)||!Number.isInteger(h)||w<50||h<50||w>1000||h>1000){setError('纸张尺寸为 50–1000 mm 的整数');return;}
      ratio=`custom:${w}x${h}`;
    }
    setBusy(true);setError('');
    try{await onCreate({mode,ratio});onClose();}catch(cause){setError(cause.message||'创建草稿失败');setBusy(false);}
  };
  return <Dialog title="空白创作" onClose={onClose}><div className="dialog-head"><h2>空白创作</h2>
    <button type="button" className="btn" id="blank-create-cancel" onClick={onClose}>取消</button></div>
    <div className="stack"><label>页面数<select id="blank-page-count" value={mode} onChange={e=>setMode(e.target.value)}>
      <option value="single">单页</option><option value="spread">双页</option></select></label>
      <label>纸张尺寸<select id="blank-paper-size" value={size} onChange={e=>setSize(e.target.value)}>
        {paperPresets.map(p=><option key={p.id} value={p.id}>{p.name} · {p.width} × {p.height} mm</option>)}
        <option value="custom">自定义尺寸</option></select></label>
      {size==='custom'?<div className="import-custom-size" id="blank-custom-size"><label>宽（mm）<input type="number" id="blank-custom-width" min="50" max="1000" value={width} onChange={e=>setWidth(e.target.value)}/></label><label>高（mm）<input type="number" id="blank-custom-height" min="50" max="1000" value={height} onChange={e=>setHeight(e.target.value)}/></label></div>:null}
      {error?<p role="alert">{error}</p>:null}<button type="button" className="btn primary" id="blank-create-confirm" disabled={busy} onClick={()=>void submit()}>开始创作</button></div>
  </Dialog>;
}
export function MaterialUseDialog({asset,others,useHint,processingHint,required,onClose,onSave}){
  const choices=['由生成器选择','完整保留',...(others?['从另一件后露出']:[]),...(asset.kind==='tape'&&others?['截段固定']:[]),...(['paper','photo','tape'].includes(asset.kind)?['取一块真实区域']:[]),'稍后手工剪图案'];
  const processing=['AI 自主加工','保留完整','少量裁剪','自由拆解'];
  const [use,setUse]=useState(useHint||'由生成器选择'),[permission,setPermission]=useState(processingHint),[must,setMust]=useState(!!required);
  return <Dialog title={`${asset.title} · 用法`} onClose={onClose}><h2>{asset.title} · 用法</h2>
    <p>每件素材可以单独选择用法与加工权限。</p><div className="stack">
      <label>用法<select id="material-use-choice" value={use} onChange={e=>setUse(e.target.value)}>{choices.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>加工权限<select id="material-use-processing" value={permission} onChange={e=>setPermission(e.target.value)}>{processing.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="toggle-row">要求每个方案做到此用法 <input type="checkbox" id="material-use-required" checked={must} onChange={e=>setMust(e.target.checked)}/></label>
      <div className="actions"><button type="button" className="btn primary" id="material-use-save" onClick={()=>{onSave({use,permission,required:must});onClose();}}>确定</button><button type="button" className="btn" id="material-use-cancel" onClick={onClose}>取消</button></div>
    </div></Dialog>;
}
export function ManualLayoutDialog({choices,onClose,onChoose}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const choose=async id=>{if(busy)return;setBusy(true);setError('');try{await onChoose(id);onClose();}catch(cause){setError('创建草稿失败：'+cause.message);setBusy(false);}};
  return <Dialog title="手动创作起点" onClose={onClose} className="manual-layout-dialog">
    <div className="dialog-head"><h2>手动创作从哪里开始？</h2><button type="button" className="btn" id="manual-layout-cancel" onClick={onClose}>取消</button></div>
    <p>根据本次素材、页面风格和用途推荐起点。仅预排版实物，所有对象仍可独立编辑；不会调用 AI。</p>
    <div className="manual-layout-choices">{choices.map((item,index)=><button type="button" key={item.id} disabled={busy} className="manual-layout-choice" data-manual-template={item.id} onClick={()=>void choose(item.id)}>
      <span className={`manual-layout-sketch sketch-${item.id}`} aria-hidden="true"><i/><i/><i/></span><span><strong>{item.title}{index===0?' · 推荐':''}</strong><small>{item.description}</small><small>{item.reason}</small></span>
    </button>)}<button type="button" disabled={busy} className="manual-layout-choice" data-manual-template="" onClick={()=>void choose(null)}><span className="manual-layout-sketch sketch-blank" aria-hidden="true"/><span><strong>从空画布开始</strong><small>保留纸张与素材篮，所有元素由你自己添加。</small></span></button></div>
    {error?<p role="alert">{error}</p>:null}
  </Dialog>;
}
export function HelpDialog({onClose,onExport}){
  const sections=[
    ['开始使用','从素材库导入照片，确认纸张四角与方向，查看每件素材边缘；漏检可手动补框。确认真实尺寸后保存到素材系列。'],
    ['搭配与创作','在素材库选择素材加入本次创作；搭配页可创建独立方案。画布会自动暂存修改，素材原图、用量和真实毫米尺寸不会因为拖放被重写。'],
    ['保存与同步','云端模式下“已暂存”与“已同步”含义不同。断网或版本冲突时，本机待传操作仍需保留。可点击右上同步状态查看并手动重试。'],
    ['备份与恢复','“完整备份”用于迁移整套素材及作品；“待同步应急备份”只保存当前设备未上传的修改。恢复会影响当前资料，请先独立保存现有备份。'],
    ['更新与故障排查','PWA 更新不会自动打断编辑。出现“更新拾页”按钮时，完成当前操作并确认本机保存后再点击。若识别引擎超时，重新执行该照片识别，无须清理本机数据。'],
    ['隐私','私人原图可能保存在私有云对象存储；启用第三方 AI 时，选中的素材预览和创作请求会发给所选模型服务商。不要分享含私人照片或文字的诊断文件、备份文件。']
  ];
  return <Dialog title="拾页 · 使用说明" onClose={onClose}><h2>拾页 · 使用说明</h2><div className="stack">{sections.map(([heading,description])=><section key={heading}><h3>{heading}</h3><p>{description}</p></section>)}</div>
    <div className="actions"><button type="button" className="btn" onClick={onExport}>导出脱敏运行诊断</button><button type="button" className="btn primary" onClick={onClose}>返回</button></div>
  </Dialog>;
}
export function OfflineImportDialog({onClose,onImport,onFile,onPaste}){
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const inputRef=useRef(null);
  const paste=async()=>{try{setText(await onPaste());setError('');}catch{inputRef.current?.focus();setError('浏览器未允许读取剪贴板；请在输入框按 Ctrl/⌘+V，或在手机长按选择“粘贴”');}};
  const importText=async()=>{if(busy)return;setBusy(true);setError('');try{await onImport(text);onClose();}catch(cause){setError('导入失败：'+cause.message);setBusy(false);}};
  return <Dialog title="导入网页版 GPT 作品" onClose={onClose}><h2>导入网页版 GPT 作品</h2>
    <p>选择可编辑 JSON 或 PNG／JPEG／WebP 图片快照。可编辑 JSON 会核对格式、指纹和当前素材库，无需登记原始任务；导入后进入作品编辑。</p>
    <textarea ref={inputRef} id="offline-gpt-result" rows="7" value={text} onChange={event=>setText(event.target.value)} placeholder="粘贴完整可编辑 JSON，或仅包含 JSON 的一个代码块"/>
    <div className="actions"><button type="button" className="btn primary" id="offline-import-file" onClick={onFile}>选择作品文件</button>
      <button type="button" className="btn" id="offline-paste-result" onClick={()=>void paste()}>粘贴剪贴板</button>
      <button type="button" className="btn" id="offline-import-text" disabled={busy} onClick={()=>void importText()}>导入复制文本</button></div>
    {error?<p role="alert">{error}</p>:null}
    <small>如果浏览器不允许自动读取剪贴板，点击输入框后在电脑按 Ctrl/⌘+V，或在手机长按输入框选择“粘贴”。</small>
  </Dialog>;
}
export function MaterialPickerDialog({assets,source,onClose,onPick}){
  return <Dialog title="选择素材放入画布" onClose={onClose}><h2>选择素材放入画布</h2>
    <div className="mini-assets">{assets.map(asset=><button type="button" key={asset.id} className="mini-asset" data-pick={asset.id} onClick={()=>{onPick(asset.id);onClose();}}>
      {source(asset.blobId)||asset.staticPath?<img src={source(asset.blobId)||asset.staticPath} alt={asset.title} data-asset-image-id={asset.id}/>:<span>无预览</span>}<span>{asset.title}</span>
    </button>)}</div>
  </Dialog>;
}
export function CreativeJSONDialog({aliases,onClose,onApply}){
  const [text,setText]=useState(''),[result,setResult]=useState('');
  return <Dialog title="导入创作指令" onClose={onClose}><h2>导入创作指令</h2>
    <p>这是本地工具协议的验证入口，不会联系大模型。当前素材编号：{aliases||'请先在搭配页选素材'}</p>
    <label>包含 tools 或 tool_calls 的 JSON<textarea id="creative-source" style={{minHeight:240}} value={text} onChange={event=>setText(event.target.value)} placeholder='{"tools":[{"name":"upsert_text","arguments":{"items":[{"key":"t1","content":"今天的故事……","width":0.5}]}}]}'/></label>
    <p>成功的前序调用会保留；失败调用不会污染画布。物理素材尺寸仍从素材库计算。</p>
    <button type="button" className="btn primary" id="creative-apply" onClick={()=>{try{setResult(onApply(text));}catch(cause){setResult(cause.message);}}}>验证并应用</button>
    <div id="creative-results" style={{whiteSpace:'pre-wrap',marginTop:12}}>{result}</div>
  </Dialog>;
}
