import React,{useRef,useState} from 'react';
import {Dialog} from './react-utility-dialogs.jsx';

export function OfflineHandoffLoading({progress,onClose}){
  return <Dialog title="准备网页版 AI 创作包" onClose={onClose} className="offline-handoff-dialog"><section className="offline-handoff">
    <h2>准备网页版 AI 创作包</h2><p id="offline-export-progress" role="status" aria-live="polite">{progress}</p>
    <button type="button" className="btn" id="offline-export-cancel" onClick={onClose}>取消导出</button>
  </section></Dialog>;
}
const size=n=>n<1048576?`${Math.ceil(n/1024)} KB`:`${(n/1048576).toFixed(1)} MB`;
export function OfflineHandoffReady({result,project,referenceCount,diagnostics,onClose,onCopy,onShare,onDownload,onImportFile,onImportText,onPaste}){
  const imageDelivery=result.deliveryMode==='image';
  const [delivery,setDelivery]=useState('file'),[status,setStatus]=useState(`准备就绪 · ${result.filename}`),[showPaste,setShowPaste]=useState(false),[input,setInput]=useState(''),[busy,setBusy]=useState(false);
  const promptRef=useRef(null),inputRef=useRef(null),prompt=delivery==='file'?result.prompt:(result.prompts?.text||result.prompt);
  const copy=async()=>{try{await onCopy(prompt,promptRef.current);setStatus('提示词已复制 · 任务包已打开；在文件页分享给 ChatGPT。');}catch{promptRef.current?.focus();setStatus('复制失败，请长按提示词手动复制');}};
  const paste=async()=>{try{setInput(await onPaste());setStatus('已粘贴可编辑数据');}catch{inputRef.current?.focus();setStatus('浏览器未允许读取剪贴板；请在输入框按 Ctrl/⌘+V，或在手机长按选择“粘贴”');}};
  const importText=async()=>{if(busy)return;setBusy(true);try{await onImportText(inputRef.current?.value??input);onClose();}catch(error){setStatus('导入失败：'+error.message);setBusy(false);}};
  return <Dialog title="把这一页交给 AI" onClose={onClose} className="offline-handoff-dialog"><section className="offline-handoff">
    <div className="offline-handoff-heading"><span className="offline-handoff-emblem" aria-hidden="true">✦</span><div><small>{imageDelivery?'网页版 AI · 画面创作':'网页版 GPT · 创作交接'}</small><h2>{imageDelivery?'把这一页交给 AI':'把这一页交给 GPT'}</h2></div></div>
    <p className="offline-handoff-intro">{project.candidateAssetIDs.length} 件可用素材 · {project.styles?.join('、')||'所选风格'} · {project.drafts[0].pageRatio.toUpperCase()}{referenceCount?` · ${referenceCount} 张匹配案例`:''} · 任务包 {size(result.packageBytes)}（图片 {size(result.imageBytes)}）</p>
    <div className="offline-handoff-delivery" role="group" aria-label="网页版 GPT 返回形式"><button type="button" className={delivery==='file'?'selected':''} data-offline-delivery="file" aria-pressed={delivery==='file'} onClick={()=>setDelivery('file')}>作品文件</button><button type="button" disabled={imageDelivery} className={delivery==='text'?'selected':''} data-offline-delivery={imageDelivery?undefined:'text'} aria-pressed={delivery==='text'} onClick={()=>setDelivery('text')}>{imageDelivery?'复制文本（图片不可用）':'复制文本'}</button></div>
    <div className="offline-handoff-step"><span className="offline-handoff-number">1</span><div><strong>{imageDelivery?'复制要求并发送素材包':'复制创作要求并打开任务包'}</strong><small>{imageDelivery?'这个 ZIP 是输入素材包，不是要求 AI 生成的文件。请让 AI 在回复中展示画面并提供可下载的 PNG。':'复制成功后自动下载；在系统文件页分享给 ChatGPT，或在 ChatGPT 手动附加。'}</small></div></div>
    <textarea id="offline-gpt-prompt" ref={promptRef} readOnly rows="3" aria-label="发送给 ChatGPT 的短提示词" value={prompt}/>
    <button type="button" className="btn primary offline-handoff-main" id="offline-copy-prompt" onClick={()=>void copy()}>复制并打开{imageDelivery?'素材包':'任务包'}</button><p id="offline-handoff-status" role="status">{status}</p>
    <div className="offline-handoff-alternatives"><button type="button" className="btn" id="offline-share-package" onClick={()=>void onShare()}>分享{imageDelivery?'素材包':'文件'}</button><button type="button" className="btn" id="offline-download-package" onClick={onDownload}>重新下载</button></div>
    <div className="offline-handoff-step offline-handoff-return"><span className="offline-handoff-number">2</span><div><strong>{imageDelivery?'将完成的画面导回拾页':'将 GPT 的结果导回拾页'}</strong><small>{imageDelivery?'下载 AI 返回的 PNG、JPEG 或 WebP 图片，导入后保存为画面快照，并出现在版本方案中。':'作品文件使用可编辑 JSON，或者导入 PNG／JPEG／WebP 快照。复制文本应包含完整可编辑 JSON。'}</small></div></div>
    <div className="offline-handoff-alternatives"><button type="button" className="btn" id="offline-import-file" onClick={onImportFile}>{imageDelivery?'导入作品文件':'选择结果文件'}</button>{!imageDelivery?<button type="button" className="btn" id="offline-show-paste" onClick={()=>{setShowPaste(!showPaste);if(!showPaste)setTimeout(()=>inputRef.current?.focus(),0);}}>粘贴 JSON</button>:null}</div>
    {!imageDelivery?<div className="offline-handoff-paste" hidden={!showPaste}><textarea id="offline-gpt-result" ref={inputRef} rows="4" placeholder="粘贴完整 JSON 或单个代码块" value={input} onChange={event=>setInput(event.target.value)}/><div className="offline-handoff-alternatives"><button type="button" className="btn" id="offline-paste-result" onClick={()=>void paste()}>粘贴剪贴板</button><button type="button" className="btn primary" id="offline-import-text" disabled={busy} onClick={()=>void importText()}>验证并导入</button></div></div>:null}
    <p className="offline-handoff-footnote">{imageDelivery?'浏览器无法替你选择 AI 会话，也无法自动删除系统下载的文件。':'临时对话需在 ChatGPT 内开启；浏览器无法替你选择 ChatGPT 的会话或自动删除系统下载文件。'}</p><details className="offline-export-diagnostics"><summary>查看本次导出耗时</summary><p>{diagnostics}</p></details>
  </section></Dialog>;
}
export function PreConflictDialog({entries,onClose,onRestore}){
  const [busy,setBusy]=useState(null),[error,setError]=useState('');
  const restore=async entry=>{if(busy)return;setBusy(entry.key);setError('');try{if(await onRestore(entry)!==false)onClose();}catch(cause){setError('恢复失败：'+cause.message);setBusy(null);}};
  return <Dialog title="冲突前画布" onClose={onClose}><div className="stack"><h2>冲突前画布</h2><p>下面保留了服务器自动裁决前的原始双方版本。点击恢复会创建独立的新作品，不会覆盖现在的画布。</p>
    <div id="pre-conflict-entries">{entries.map(entry=><div className="rec-card" key={entry.key}><span>{entry.title} · {new Date(entry.at).toLocaleString()}</span><button type="button" className="btn mini" disabled={!!busy} onClick={()=>void restore(entry)}>恢复为新作品</button></div>)}</div>
    {error?<p role="alert">{error}</p>:null}<button type="button" className="btn" id="pre-conflict-close" onClick={onClose}>关闭</button></div></Dialog>;
}
