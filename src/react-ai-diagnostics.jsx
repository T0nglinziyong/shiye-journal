import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {localDeviceRecords} from './local-device-records.js';

const CAPTURE='shiye-ai-context-capture-v1';
const downloadJSON=(value,name)=>{
  const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export function SettingsDiagnosticsDialog({kind,accountID,onClose}){
  const [entries,setEntries]=useState([]),[loading,setLoading]=useState(true),
    [error,setError]=useState(''),[capture,setCapture]=useState(localStorage.getItem(CAPTURE)==='true'),
    [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    const load=kind==='metrics'?localDeviceRecords.get(accountID,'ai-diagnostics'):
      localDeviceRecords.list(accountID,'ai-context-');
    void Promise.resolve(load).then(data=>{
      if(active){setEntries(kind==='metrics'?(data?.entries||[]):
        (data||[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));setLoading(false);}
    }).catch(cause=>{if(active){setError(cause.message||'读取失败');setLoading(false);}});
    return ()=>{active=false;};
  },[kind,accountID,revision]);
  useEffect(()=>{
    const escape=event=>{if(event.key==='Escape')onClose();};
    document.addEventListener('keydown',escape);
    return ()=>document.removeEventListener('keydown',escape);
  },[onClose]);
  const refresh=()=>setRevision(value=>value+1);
  return createPortal(<div className="cloud-admin-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();}}>
    <section className="cloud-admin-panel" role="dialog" aria-modal="true"
      aria-label={kind==='metrics'?'生成诊断':'创作完整上下文'}>
      <div className="dialog-head"><h2>{kind==='metrics'?'生成诊断':'创作完整上下文'}</h2>
        <button type="button" className="btn" onClick={onClose}>返回</button></div>
      {kind==='metrics'?<>
        <p>最近 100 次请求的耗时、状态与 token 用量。诊断不包含图片、提示词、回复正文、地址或密钥。</p>
        <div className="actions"><button type="button" className="btn" onClick={refresh}>刷新</button>
          <button type="button" className="btn" onClick={()=>downloadJSON(entries,'拾页AI诊断.json')}>导出诊断</button></div>
        {!loading&&!entries.length?<p>尚无生成记录。完成一次创作后可回到这里查看。</p>:null}
        {[...entries].reverse().map((entry,index)=><div className="rec-card diagnostic-row" key={`${entry.date}-${index}`}>
          <strong>{entry.model}</strong><span>{Number(entry.seconds||0).toFixed(1)} 秒 · {entry.succeeded?'请求成功':'未完成'}</span>
          <small>输入 {entry.inputTokens??'—'} · 输出 {entry.outputTokens??'—'} · 缓存 {entry.cachedTokens??'—'}</small>
          <small>{entry.date}</small></div>)}
      </>:<>
        <label className="toggle-row">记录完整创作上下文（含图片）
          <input type="checkbox" checked={capture} onChange={event=>{
            if(event.target.checked&&!confirm('开启完整上下文记录？记录可能包含素材照片、私人文字及服务返回的推理字段。'))return;
            setCapture(event.target.checked);localStorage.setItem(CAPTURE,String(event.target.checked));
          }}/></label>
        <p>先开启，再重新发起创作。记录每轮提示词、工具合同、素材图片、实际回复与工具结果，不记录认证头或密钥。仅保留最近 5 次结束会话，单次 128 MiB、总计 512 MiB。已发生但没有记录的请求不能补回。</p>
        <button type="button" className="btn" onClick={refresh}>刷新</button>
        {!loading&&!entries.length?<p>暂无完整上下文记录。</p>:null}
        {entries.map(session=><div className="diagnostic-row rec-card" key={session.id}>
          <strong>{session.model}</strong><span>{session.createdAt} · {session.status}</span>
          <small>{session.events.length} 个事件 · {(session.bytes/1024/1024).toFixed(2)} MiB{session.complete?'':' · 记录不完整'}</small>
          {session.warning?<p>{session.warning}</p>:null}
          <button type="button" className="btn" onClick={()=>{
            if(confirm('导出包含照片和私人文字，请确认接收方可信。'))
              downloadJSON(session,'拾页AI上下文-'+session.id+'.json');}}>导出</button>
          <button type="button" className="btn" disabled={session.status==='running'} onClick={async()=>{
            if(!confirm('删除这次上下文记录？'))return;
            try{await localDeviceRecords.delete(accountID,session.id);refresh();}catch(cause){setError(cause.message||'删除失败');}
          }}>删除记录</button>
        </div>)}
      </>}
      {loading?<p role="status">正在读取…</p>:null}{error?<p role="alert">{error}</p>:null}
    </section></div>,document.body);
}
