import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {createCOSStore} from './cos-store.js';
import {createStorageUsageController,formatStorageBytes as bytes} from './storage-usage-ui.js';

function AdminFrame({title,onClose,children,wide=false}){
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const escape=event=>{if(event.key==='Escape')closeRef.current();};
    document.addEventListener('keydown',escape);
    return ()=>document.removeEventListener('keydown',escape);
  },[]);
  return createPortal(<div className="cloud-admin-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();}}>
    <section className="cloud-admin-panel" role="dialog" aria-modal="true" aria-label={title}
      style={wide?{overflow:'auto',maxHeight:'90vh',maxWidth:750}:undefined}>
      <div className="cloud-admin-heading"><h2>{title}</h2>
        <button type="button" className="btn mini" data-close onClick={onClose}>关闭</button>
      </div>{children}
    </section>
  </div>,document.body);
}

function AdminImage({path,provider,client,cos}){
  const host=useRef(null),[visible,setVisible]=useState(false),[url,setURL]=useState(''),
    [error,setError]=useState(false);
  useEffect(()=>{
    if(!path||!['cos','supabase'].includes(provider))return;
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}
    },{rootMargin:'160px'});
    if(host.current)observer.observe(host.current);
    return ()=>observer.disconnect();
  },[path,provider]);
  useEffect(()=>{
    if(!visible)return;
    let active=true,objectURL='';
    void (async()=>{
      const blob=provider==='cos'?
        path.endsWith('-preview.webp')||path.endsWith('-preview360.webp')?
          await cos.download(path):await cos.preview(path):
        await (async()=>{const result=await client.storage.from('shiye-private').download(path);
          if(result.error)throw result.error;return result.data;})();
      if(!active)return;
      objectURL=URL.createObjectURL(blob);setURL(objectURL);
    })().catch(()=>{if(active)setError(true);});
    return ()=>{active=false;if(objectURL)URL.revokeObjectURL(objectURL);};
  },[visible,path,provider,client,cos]);
  return <div ref={host} className="cloud-admin-image">{url?<img src={url} alt=""/>:
    error?'图片暂不可读取':path&&['cos','supabase'].includes(provider)?'正在读取封面…':'无可读封面'}</div>;
}
function AdminCard({name,extra,record,path,provider,client,cos}){
  return <article className="cloud-admin-card"><AdminImage path={path} provider={provider}
    client={client} cos={cos}/><strong>{name||'未命名'}</strong><small>{extra||''}</small>
    <details className="cloud-admin-metadata"><summary>查看只读数据</summary>
      <pre>{JSON.stringify(record,null,2)}</pre></details></article>;
}
export function AdminViewDialog({client,currentUserID,onClose}){
  const [accounts,setAccounts]=useState([]),[selected,setSelected]=useState(''),
    [rows,setRows]=useState([]),[status,setStatus]=useState('正在读取账号…');
  const cos=useRef(createCOSStore({client:()=>client,enabled:true})).current;
  useEffect(()=>{
    let active=true;
    void client.from('shiye_accounts').select('user_id,username,created_at').order('username')
      .then(({data,error})=>{
        if(error)throw error;
        if(active){setAccounts((data||[]).filter(account=>account.user_id!==currentUserID));
          setStatus('请选择要查看的用户');}
      }).catch(error=>{if(active)setStatus('读取失败：'+(error.message||'请检查网络'));});
    return ()=>{active=false;};
  },[client,currentUserID]);
  useEffect(()=>{
    if(!selected){setRows([]);return;}
    let active=true;
    setRows([]);setStatus('正在读取私人资料…');
    void (async()=>{
      const found=[];
      for(let start=0;start<20000;start+=500){
        const {data,error}=await client.from('shiye_records').select('store,id,record')
          .eq('user_id',selected).order('store').order('id').range(start,start+499);
        if(error)throw error;
        if(!active)return;
        found.push(...data);
        if(data.length<500)break;
      }
      if(!active)return;
      setRows(found);
      const count=store=>found.filter(row=>row.store===store).length;
      setStatus(`${accounts.find(account=>account.user_id===selected)?.username||'用户'} · `+
        `${count('assets')} 件素材 · ${count('projects')} 件作品 · ${count('series')} 个系列（只读）`);
    })().catch(error=>{if(active)setStatus('读取失败：'+(error.message||'请检查网络'));});
    return ()=>{active=false;};
  },[selected,client,accounts]);
  const byStore=store=>rows.filter(row=>row.store===store);
  const blobs=new Map(byStore('blobs').map(row=>[row.id,row.record]));
  const assetCards=byStore('assets').map(({id,record})=>{
    const blob=blobs.get(record.blobId);
    return <AdminCard key={id} name={record.title} extra={record.kind} record={record}
      path={blob?.thumbnailPath||blob?.storagePath} provider={blob?.storageProvider}
      client={client} cos={cos}/>;
  });
  const projectCards=byStore('projects').map(({id,record})=>{
    const draft=record.drafts?.find(item=>item.id===record.activeDraftID)||record.drafts?.[0];
    const cover=draft?.coverImageID||'';
    const match=/^project-cover:(cos|supabase):(.+)$/.exec(cover);
    return <AdminCard key={id} name={record.title} extra={record.isDraft?'草稿':'作品'}
      record={record} path={match?.[2]} provider={match?.[1]} client={client} cos={cos}/>;
  });
  return <AdminFrame title="其他用户资料（只读）" onClose={onClose}>
    <p>管理员只读查看。每位用户的资料仍独立存储，不能在这里修改或加入自己的素材库。</p>
    <select aria-label="选择用户" value={selected} onChange={event=>setSelected(event.target.value)}>
      <option value="">{accounts.length?'选择用户':'暂无其他用户'}</option>
      {accounts.map(account=><option key={account.user_id} value={account.user_id}>
        {account.username}</option>)}
    </select><p role="status">{status}</p><div className="cloud-admin-grid">
      {rows.length?<><h3 className="cloud-admin-section">素材</h3>{assetCards}
        <h3 className="cloud-admin-section">作品</h3>{projectCards}
        {['series','trash','meta','blobs'].map((store,index)=>byStore(store).length?<React.Fragment key={store}>
          <h3 className="cloud-admin-section">{['系列','最近删除','设置与搭配','图片文件索引'][index]}</h3>
          {byStore(store).map(({id,record})=><AdminCard key={id}
            name={record.title||record.name||id} extra={store==='blobs'?'COS 私人文件':'只读记录'}
            record={record} client={client} cos={cos}/>)}</React.Fragment>:null)}
      </>:selected&&status.includes('·')?<p>此账号还没有资料。</p>:null}
    </div>
  </AdminFrame>;
}

function StorageLine({label,children}){
  return <p><strong>{label}：</strong><span>{children}</span></p>;
}
function DBStats({data}){
  const stores=[['assets','素材'],['projects','作品'],['series','系列'],['blobs','图片元数据'],
    ['trash','最近删除'],['meta','设置及删除墓碑']];
  return <section data-db><h3>Supabase · 数据库</h3>
    <StorageLine label="拾页相关表（含索引）">{bytes(data.appTablesBytes)}</StorageLine>
    <StorageLine label="整个 Supabase 数据库（含平台及其他表）">{bytes(data.databaseBytes)}</StorageLine>
    {stores.map(([store,label])=>{const row=data.stores?.[store]||{};
      return <StorageLine key={store} label={label}>
        {Number(row.count||0).toLocaleString()} 条；JSON 载荷 {bytes(row.payloadBytes||0)}</StorageLine>;})}
    <StorageLine label="长期保留的 Tombstone">{Number(data.tombstones||0).toLocaleString()} 条</StorageLine>
    <StorageLine label="同步增量日志">{data.changes?.count||0} 条；估计行内容 {bytes(data.changes?.estimatedRowBytes||0)}</StorageLine>
    <StorageLine label="冲突保护水位线">{data.watermarks?.count||0} 条；估计行内容 {bytes(data.watermarks?.estimatedRowBytes||0)}</StorageLine>
    <StorageLine label="同步提交收据">{data.commits?.count||0} 条；估计行内容 {bytes(data.commits?.estimatedRowBytes||0)}</StorageLine>
    <StorageLine label="符合安全清理窗口（90 天)">{data.commits?.eligibleAfter90Days||0} 条收据；实际可回收物理空间还取决于 VACUUM</StorageLine>
  </section>;
}
function COSStats({data}){
  const groups=[['original','原始图片'],['derivative','派生图／封面'],
    ['document','作品文档'],['other','其他对象']];
  return <section data-cos><h3>腾讯 COS · 对象体积</h3>
    <StorageLine label="已扫描对象">{Number(data.objectCount||0).toLocaleString()} 个</StorageLine>
    <StorageLine label={data.inventoryComplete?'对象总量':'当前扫描范围（非完整总量）'}>{bytes(data.totalBytes)}</StorageLine>
    {groups.map(([kind,label])=>{const row=data.groups?.[kind]||{};
      return <StorageLine key={kind} label={label}>
        {Number(row.count||0).toLocaleString()} 个，{bytes(row.bytes||0)}</StorageLine>;})}
    <StorageLine label="引用完整核对">{data.referencesComplete&&data.inventoryComplete?
      '当前云端元数据已扫描完成':'未完成，不可进行无引用判断'}</StorageLine>
    {data.oldUnreferencedCandidates!==null&&data.oldUnreferencedCandidates!==undefined?
      <StorageLine label="超过 90 天的待核对无引用候选">
        {data.oldUnreferencedCandidates} 个，{bytes(data.oldUnreferencedCandidateBytes)}；不可直接删除</StorageLine>:null}
    <StorageLine label="确认可安全删除的 COS 大小">0 B（未进行离线队列和备份核验）</StorageLine>
    <p>{data.warning||'此处只读；服务端清理是否启用需单独核对'}</p>
  </section>;
}
export function StorageUsageDialog({client,onClose}){
  const controller=useRef(createStorageUsageController({client})).current;
  const [db,setDB]=useState(null),[cos,setCOS]=useState(null),
    [dbError,setDBError]=useState(''),[cosError,setCOSError]=useState(''),
    [status,setStatus]=useState('准备读取…'),[busy,setBusy]=useState(false);
  const active=useRef(true),epoch=useRef(0);
  useEffect(()=>()=>{active.current=false;epoch.current++;},[]);
  const refresh=async()=>{
    const current=++epoch.current;
    setBusy(true);setStatus('正在读取数据库与 COS 容量…');
    const [resultDB,resultCOS]=await Promise.allSettled([controller.getDB(),controller.getCOS()]);
    if(!active.current||current!==epoch.current)return;
    setDB(resultDB.status==='fulfilled'?resultDB.value:null);
    setCOS(resultCOS.status==='fulfilled'?resultCOS.value:null);
    setDBError(resultDB.status==='rejected'?resultDB.reason.message:'');
    setCOSError(resultCOS.status==='rejected'?resultCOS.reason.message:'');
    setStatus('核对完成：'+new Date().toLocaleString());setBusy(false);
  };
  useEffect(()=>{void refresh();},[]);
  const prune=async()=>{
    setBusy(true);
    try{const count=await controller.prune({eligible:db?.commits?.eligibleAfter90Days});
      if(count!==null){setStatus(`已清理 ${count} 条过期提交收据；对象、删除墓碑未被修改`);
        await refresh();}}
    catch(error){setStatus('清理失败：'+error.message);}
    finally{if(active.current)setBusy(false);}
  };
  return <AdminFrame title="拾页存储统计（开发者）" onClose={onClose} wide>
    <p>仅开发者可查看。Supabase 的物理表空间、JSON 内容大小与 COS 文件体积是不同指标，不应相加为同一个数据库大小。</p>
    <div className="actions"><button type="button" className="btn" data-refresh disabled={busy}
      onClick={()=>void refresh()}>重新核对</button>
      <button type="button" className="btn danger" data-prune disabled={busy||!(Number(db?.commits?.eligibleAfter90Days)>0)}
        onClick={()=>void prune()}>清理过期同步收据</button></div>
    <p role="status" data-status>{status}</p>
    {db?<DBStats data={db}/>:<section data-db><p>数据库统计失败：{dbError}</p></section>}
    {cos?<COSStats data={cos}/>:<section data-cos><p>COS 统计暂不可用：{cosError}</p></section>}
    <p>删除墓碑永久保留；此处仅做 COS 旧文件只读盘点，不提供浏览器删除操作。服务端清理需单独启用隔离备份和延迟复核。</p>
  </AdminFrame>;
}
