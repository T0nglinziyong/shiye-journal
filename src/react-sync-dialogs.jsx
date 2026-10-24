import React,{useEffect,useState} from 'react';
import './sync-dashboard.css';
import {describeSyncError} from './sync-browser-compat.js';
import {Dialog} from './react-utility-dialogs.jsx';

export function SyncDetailsDialog({details,projects,batches,local,quarantined,legacyCount,pendingCount=0,
  error,status,conflicts=0,onClose,onDiagnostics,onMigrate,onBackupLegacy,onWipe,
  onRetry,onRebuild,onPause,onEmergency,onRefresh}){
  const [message,setMessage]=useState(`状态：${status}`),[busy,setBusy]=useState(false);
  const [live,setLive]=useState(null),[shown,setShown]=useState(40),[showList,setShowList]=useState(false),
    [listBusy,setListBusy]=useState(false);
  useEffect(()=>{
    if(!onRefresh||!showList)return;
    let disposed=false;
    setListBusy(true);
    void onRefresh().then(next=>{if(!disposed){setLive(next);setMessage(`状态：${next.status}`);}})
      .catch(cause=>{if(!disposed)setMessage('状态：列表暂不可读取 · '+describeSyncError(cause));})
      .finally(()=>{if(!disposed)setListBusy(false);});
    return ()=>{disposed=true;};
  },[onRefresh,showList]);
  const refreshList=async()=>{
    if(listBusy||!onRefresh)return;setListBusy(true);
    try{const next=await onRefresh();setLive(next);setMessage(`状态：${next.status}`);}
    catch(cause){setMessage('状态：列表暂不可读取 · '+describeSyncError(cause));}
    finally{setListBusy(false);}
  };
  if(live)({details,projects,batches,local,quarantined,error,status,conflicts}=live);
  const retry=async()=>{
    if(busy)return;setBusy(true);setMessage('状态：正在安排上传…');
    try{const result=await onRetry(),remaining=typeof result==='number'?result:result.remaining,
      currentConflicts=typeof result==='number'?conflicts:result.conflicts;
      setMessage(remaining?`状态：仍有 ${remaining} 项待同步${currentConflicts?'，正在自动处理版本差异':'；请查看最近错误或稍后重试'}`:'状态：已同步到云端');}
    catch(cause){setMessage('状态：待重试 · '+describeSyncError(cause));}
    finally{setBusy(false);}
  };
  const rebuild=async()=>{
    if(busy)return;setBusy(true);setMessage('状态：正在重建同步队列…');
    try{await onRebuild();setMessage('状态：队列已重建，正在后台上传');
      if(showList)setLive(await onRefresh());}
    catch(cause){setMessage('状态：队列重建未完成 · '+describeSyncError(cause));}
    finally{setBusy(false);}
  };
  const total=live?projects.length+batches.length+local.length:
    Math.max(pendingCount,projects.length+batches.length+local.length);
  const names={assets:'素材',series:'系列',projects:'作品',blobs:'图片',meta:'设置',trash:'最近删除'};
  const rows=!showList?[]:[...projects.map(row=>({key:'p-'+row.id,title:row.title||'未命名作品',kind:'作品',failure:row.failureClass})),
    ...batches.flatMap(row=>row.items.map((item,index)=>({key:row.id+'-'+index,
      title:(item.store==='meta'?names[item.store]:item.title)||names[item.store]||'资料',kind:item.action==='delete'?'删除':names[item.store]||'资料',failure:row.failureClass}))),
    ...local.map(row=>({key:'l-'+row.id,title:row.title||'未命名作品',kind:'保存到本机',failure:'local'}))];
  return <Dialog title="同步详情" onClose={onClose}><div className="sync-dashboard">
    <h2>同步</h2><section className="sync-summary" aria-live="polite">
      <strong id="sync-detail-status" role="status">{message}</strong>
      <p>{total?`${total} 项等待完成，上传会在后台继续。`:quarantined||legacyCount?'旧数据待检查，详情见下方数据维护。':'没有待上传的本机修改。'}</p>
      <p className="muted">版本差异自动处理；作品画面发生冲突时，双方都会保留。</p>
    </section>
    {error||details.error?<p className="sync-error" role="status">{error||details.error}<br/>本机资料已保留，网络恢复后会自动重试。</p>:null}
    <div className="actions"><button type="button" className="btn primary" id="sync-retry-now" disabled={busy} onClick={()=>void retry()}>{busy?'正在安排…':'立即同步'}</button>
      <button type="button" className="btn" id="sync-export-diagnostics" onClick={onDiagnostics}>导出详细同步诊断</button></div>
    <section><button type="button" className="btn" id="sync-show-pending" onClick={()=>setShowList(value=>!value)}>{showList?'收起待同步内容':'查看待同步内容'}</button>
    {showList?<button type="button" className="btn" id="sync-refresh-pending" disabled={listBusy} onClick={()=>void refreshList()}>{listBusy?'正在读取…':'刷新列表'}</button>:null}
    {showList&&rows.length?<><h3>待同步内容</h3><div className="sync-pending-list"><ul>
      {rows.slice(0,shown).map(row=><li key={row.key}><div><strong>{row.title}</strong><small>{row.kind}</small></div>
        <span>{row.failure==='invalid'?'等待格式修复':row.failure==='local'?'正在暂存':row.failure?'等待重试':'等待上传'}</span></li>)}
    </ul></div>{rows.length>shown?<button type="button" className="btn" onClick={()=>setShown(count=>count+40)}>显示更多（剩余 {rows.length-shown} 项）</button>:null}</>:null}</section>
    <section className="sync-maintenance"><h3>数据维护</h3>
      <p>重建队列会根据本机当前数据重新安排上传，保留待传图片和删除操作。</p>
      {quarantined||legacyCount?<p>有 {quarantined+legacyCount} 项旧数据需要检查格式，原始资料仍保留。</p>:null}
      <div className="actions">
        <button type="button" className="btn" id="sync-rebuild-queue" disabled={busy} onClick={()=>void rebuild()}>重建同步队列</button>
        <button type="button" className="btn" id="sync-migrate-account" onClick={onMigrate}>检查并转换旧格式</button>
        {legacyCount?<button type="button" className="btn" id="sync-backup-legacy-works" onClick={onBackupLegacy}>导出旧作品备份</button>:null}
        <button type="button" className="btn" id="sync-pause-local" onClick={onPause}>暂停／恢复后台重试</button>
        <button type="button" className="btn" id="sync-emergency-copy" disabled={!total} onClick={onEmergency}>导出待同步数据备份</button>
        <button type="button" className="btn danger" id="sync-reset-account" disabled={busy} onClick={onWipe}>清空当前账号资料</button>
        <p className="muted">清空会删除云端素材、作品和本机待同步修改；旧图片按账号目录后台回收。请先导出需要保留的备份。</p>
      </div>
    </section></div>
  </Dialog>;

}
export function SyncErrorDialog({error,onClose,onBack,onDiagnostics,kind}){
  return <Dialog title={kind==='details'?'同步详情暂不可用':'同步暂不可用'} onClose={onClose}>
    <h2>{kind==='details'?'同步详情暂不可用':'同步暂不可用'}</h2>
    {kind==='details'?<><p>待同步资料没有被清除。仍可导出当天的本机同步诊断。</p><button type="button" className="btn" id="sync-export-diagnostics" onClick={onDiagnostics}>导出详细同步诊断</button></>:
      <><p role="alert">{error}</p><p>本机数据仍保留在待同步队列。请返回同步详情重新核对。</p><button type="button" className="btn" id="conflict-back" onClick={onBack}>返回同步详情</button></>}
  </Dialog>;
}
export function SyncMigrationDialog({plan,onClose,onApply}){
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(
    plan.changes.length?'':plan.review.length?'没有可安全自动转换的记录；请按待检查清单处理。':'所有已识别的记录均符合当前格式，无需转换。');
  const names={assets:'素材',series:'系列',projects:'作品',blobs:'图片引用',meta:'设置与元数据',trash:'最近删除'};
  const apply=async()=>{if(busy)return;setBusy(true);setStatus('正在检查版本并提交转换…');try{const result=await onApply();setStatus(`转换成功 ${result.updated} 条；请重新打开作品确认图层、素材与同步状态。`);}catch(cause){setStatus('转换未完成：'+cause.message+'。未通过版本核对的记录保持原样，请重新扫描。');}finally{setBusy(false);}};
  return <Dialog title="转换旧数据格式" onClose={onClose}><h2>转换旧数据格式</h2>
    <p>本次共扫描 {plan.totals.scanned} 条账号记录；找到 {plan.totals.migratable} 条可验证转换的旧记录，{plan.totals.needsReview} 条需要人工检查。已符合现行结构的资料不会被重写。</p>
    <div style={{maxHeight:'50vh',overflow:'auto'}}><table className="migration-audit-table"><thead><tr><th>数据类型</th><th>扫描</th><th>可转换</th><th>待检查</th></tr></thead><tbody>{plan.scans.map(row=><tr key={row.store}><td>{names[row.store]||row.store}</td><td>{row.total}</td><td>{row.migratable}</td><td>{row.needsReview}</td></tr>)}</tbody></table></div>
    {plan.review.length?<details><summary>无法自动转换的记录（未修改）</summary><ul>{plan.review.slice(0,30).map((row,index)=><li key={index}>{row.store} · {row.id||'未知'}：{row.reason}</li>)}</ul></details>:null}
    <p>只转换有明确转换器、且完成物理尺寸与来源区域校验的记录。旧 COS 原件不会删除；无法转换的条目仍保留原样。</p>
    <p id="migration-status" role="status">{status}</p><div className="actions">
      <button type="button" className="btn primary" id="migration-apply" disabled={!plan.changes.length||busy} onClick={()=>void apply()}>转换 {plan.changes.length} 条</button>
      <button type="button" className="btn" id="migration-cancel" onClick={onClose}>取消</button></div>
  </Dialog>;
}
