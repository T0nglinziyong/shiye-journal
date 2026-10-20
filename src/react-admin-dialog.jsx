import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {createStorageUsageController,formatStorageBytes as bytes} from './storage-usage-ui.js';
import {cloudApiRequest} from './cloud-api-origin.js';

function AdminFrame({title,onClose,children}){
 const closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{const handler=event=>{if(event.key==='Escape')closeRef.current();};
   document.addEventListener('keydown',handler);
   return ()=>document.removeEventListener('keydown',handler);},[]);
 return createPortal(<div className="cloud-admin-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();}}>
   <section className="cloud-admin-panel" role="dialog" aria-modal="true" aria-label={title}
     style={{overflow:'auto',maxHeight:'90vh',maxWidth:750}}>
     <div className="cloud-admin-heading"><h2>{title}</h2><button type="button" className="btn mini" onClick={onClose}>关闭</button></div>
     {children}
   </section></div>,document.body);
}
export function StorageUsageDialog({onClose}){
 const controller=useRef(createStorageUsageController()).current;
 const [report,setReport]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{
   if(busy)return;
   setBusy(true);setError('');
   try{setReport(await controller.getUsage());}
   catch(cause){setError(cause.code==='MIGRATION_REQUIRED'?
     '账号容量统计尚未启用：管理员需执行 deploy/cloudbase/006-account-usage.sql。':
     cause.message||'CloudBase 存储统计暂不可用');}
   finally{setBusy(false);}
 };
 useEffect(()=>{void load();},[]);
 const db=report?.database;
 return <AdminFrame title="CloudBase 账号容量" onClose={onClose}>
  <p>仅统计当前登录账号的数据库元数据；JSON 逻辑字节不代表实际计费表空间。云存储用量请查看 CloudBase 套餐用量。</p>
  <div className="actions"><button type="button" className="btn" disabled={busy} onClick={()=>void load()}>{busy?'核对中…':'刷新统计'}</button></div>
  {error?<p role="alert">{error}</p>:null}
  {db?<section data-db><h3>CloudBase PostgreSQL · 当前账号</h3>
    <p>元数据记录：{Number(db.recordCount||0).toLocaleString()} 条</p>
    <p>素材：{Number(db.assetCount||0).toLocaleString()} · 作品：{Number(db.projectCount||0).toLocaleString()} · 图片引用：{Number(db.blobReferenceCount||0).toLocaleString()}</p>
    <p>JSON 逻辑字节：{bytes(db.metadataJSONBytes)}</p></section>:null}
  <p>此界面仅只读；不会清理图片、删除记录或修改待同步队列。</p>
 </AdminFrame>;
}
// Cross-account administration is deliberately unavailable from an ordinary
// browser JWT. CloudBase RLS keeps every account's personal records isolated.
export function AdminViewDialog({onClose}){
 return <AdminFrame title="账号权限" onClose={onClose}>
   <p>跨账号查看未开启。账号授权需要独立的 CloudBase 管理服务及管理员审计，不能使用普通登录会话绕过 RLS。</p>
 </AdminFrame>;
}
export function PlatformHealthDialog({onClose}){
 const [report,setReport]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;setBusy(true);
  void cloudApiRequest('/api/platform-health',{method:'GET'})
    .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'云函数不可用');if(alive)setReport(data);})
    .catch(cause=>{if(alive)setError(cause.message);}).finally(()=>{if(alive)setBusy(false);});
  return ()=>{alive=false;};},[]);
 return <AdminFrame title="CloudBase 平台状态" onClose={onClose}>
   {busy?<p>正在核验登录、云函数和数据库能力…</p>:null}
   {error?<p role="alert">{error}。请检查 shiye-api 的服务端日志。</p>:null}
   {report?<><p>服务：{report.platform} · 版本：{report.build||'未登记'}</p>
      <p>图片存储：CloudBase 私有云存储（由浏览器登录会话授权）</p>
      <p>关键词索引：{report.capabilities?.keyword?'已启用':'待应用 SQL 迁移'}</p>
      <p>pgvector 语义检索：{report.capabilities?.vector?'后端已具备条件':'未启用（需 Embedding 模型与数据库索引）'}</p>
      <p>账号自动清空：暂不开放；安全验证后单独启用。</p>
      <p>日志：云函数脱敏结构化日志，查看 CloudBase 日志监控。</p></>:null}
 </AdminFrame>;
}
