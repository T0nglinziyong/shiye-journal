import React,{useState} from 'react';
import {Dialog} from './react-utility-dialogs.jsx';

export function SyncDetailsDialog({details,projects,batches,local,quarantined,legacyCount,
  error,status,conflicts=0,onClose,onDiagnostics,onConflict,onMigrate,onBackupLegacy,onWipe,
  onRetry,onPause,onEmergency}){
  const [message,setMessage]=useState(`状态：${status}`),[busy,setBusy]=useState(false);
  const retry=async()=>{
    if(busy)return;setBusy(true);setMessage('状态：正在按本机当前数据重建同步队列…');
    try{const result=await onRetry(),remaining=typeof result==='number'?result:result.remaining,
      currentConflicts=typeof result==='number'?conflicts:result.conflicts;
      setMessage(remaining?`状态：仍有 ${remaining} 项待同步${currentConflicts?'，其中有冲突需比较版本':'；请查看最近错误或稍后重试'}`:'状态：已同步到云端');}
    catch(cause){setMessage('状态：待重试 · 本机修改已保留；关闭详情后自动重试');}
    finally{setBusy(false);}
  };
  const total=projects.length+batches.length+local.length;
  return <Dialog title="同步详情" onClose={onClose}><h2>同步详情</h2>
    <p id="sync-detail-status" role="status">{message}</p><p>最近错误：{error||details.error||'无'}</p>
    <p>本机待同步：{total} 项{conflicts?`，其中 ${conflicts} 项需处理冲突`:''}。未上传作品和草稿将保留在本机待同步队列。</p>
    <p>隔离待同步原始记录：{quarantined} 项（禁止自动上传，原始数据未丢弃）。</p>
    <p>已隔离旧版可编辑作品：{legacyCount} 件（未删除）。转换工具会同时扫描账号的素材、系列、作品、元数据、图片引用和最近删除。</p>
    <div className="sync-pending-list">{total?<ul>
      {projects.map(row=><li key={`project-${row.id}`}>作品：{row.title} {row.failureClass==='conflict'||row.failureClass==='invalid'?<strong>需处理冲突</strong>:null} <small>{row.id}</small> <button type="button" className="btn mini" data-conflict-kind="project" data-conflict-id={row.id} onClick={()=>onConflict('project',row.id)}>比较版本</button></li>)}
      {batches.map(row=><li key={`batch-${row.id}`}>待传批次 {row.id}：{row.items.length} 条变更 {row.failureClass==='conflict'||row.failureClass==='invalid'?<strong>需处理冲突</strong>:null}<ul>{row.items.slice(0,12).map((item,index)=><li key={index}>{item.store} · {item.action} · {item.title||item.id}</li>)}</ul>
        {row.items.length?<button type="button" className="btn mini" data-conflict-kind="batch" data-conflict-id={row.id} onClick={()=>onConflict('batch',row.id)}>比较版本</button>:null}</li>)}
      {local.map(row=><li key={row.id}>尚未暂存的作品：{row.title||row.id}</li>)}
    </ul>:<p>没有待同步项目。</p>}</div>
    <div className="actions"><button type="button" className="btn" id="sync-export-diagnostics" onClick={onDiagnostics}>导出详细同步诊断</button>
      <button type="button" className="btn" id="sync-migrate-account" onClick={onMigrate}>检查并转换旧格式</button>
      <button type="button" className="btn" id="sync-backup-legacy-works" disabled={!legacyCount} onClick={onBackupLegacy}>导出隔离旧作品备份</button>
      <button type="button" className="btn primary" id="sync-retry-now" disabled={busy} onClick={()=>void retry()}>{busy?'正在同步…':'重建队列并同步'}</button>
      <button type="button" className="btn" id="sync-pause-local" onClick={onPause}>暂停／恢复后台重试</button>
      <button type="button" className="btn" id="sync-emergency-copy" disabled={!total} onClick={onEmergency}>导出待同步数据备份</button>
      <button type="button" className="btn danger" id="sync-wipe-everything" onClick={onWipe}>彻底清空本账号本机与云端数据</button></div>
    <p>重新同步会一次性替换旧队列，并按本机当前作品和素材重建待传记录；待传图片字节与删除操作继续保留。云端在重建后再次变化时，可以使用“比较版本”手动处理。</p>
  </Dialog>;
}
const date=value=>{const result=new Date(value);return Number.isFinite(result.getTime())?result.toLocaleString():'未记录';};
export function SyncConflictDialog({review,onClose,onBack,onResolve}){
  const {local,remote}=review.overview;
  const metadata=review.mode==='metadata',batch=review.mode==='batch';
  const [busy,setBusy]=useState(false),[status,setStatus]=useState('请选择需要保留的版本。');
  const resolve=async(choice,label)=>{if(busy)return;setBusy(true);setStatus('正在核对版本并提交…');try{await onResolve(choice,label);onClose();}catch(cause){setStatus('没有覆盖资料：'+cause.message+'。请返回同步详情重新核对版本。');setBusy(false);}};
  const card=(label,record)=><section className="sync-version-card"><strong>{label}</strong><p>{record?.title||'没有云端版本'}</p><small>{batch?record?.kind||'需整批处理':`修改：${date(record?.updatedAt)}${metadata?record?.kind?` · ${record.kind}`:'':` · ${record?.drafts??0} 个方案 · ${record?.layers??0} 个顶层图层`}`}</small></section>;
  return <Dialog title="手动解决同步冲突" onClose={onClose}><h2>手动解决同步冲突</h2><p>{batch?'此批次包含多条关联变更，必须整批处理。请核对每条变更后选择保留哪一版。':'同一编号的本机和云端记录均有修改。请比较版本并选择保留哪份；不会按修改时间自动覆盖。'}</p>
    <div className="sync-version-grid">{card('本机未同步',local)}{card('当前云端',remote)}</div>
    {batch?<div className="sync-pending-list"><ul>{(review.overview.items||[]).map((item,index)=><li key={index}>{item.store} · {item.action} · {item.id||'整库'}{item.localTitle?` · 本机：${item.localTitle}`:''}{item.remoteTitle?` · 云端：${item.remoteTitle}`:''}</li>)}</ul></div>:null}
    <p role="status" id="conflict-progress">{status}</p><div className="actions">
      {!metadata&&!batch?<button type="button" className="btn primary" id="conflict-both" disabled={busy} onClick={()=>void resolve('both','双方都保留')}>双方都保留（推荐）</button>:null}
      <button type="button" className="btn" id="conflict-cloud" disabled={busy||!remote} onClick={()=>void resolve('cloud','保留云端版')}>保留云端版</button>
      <button type="button" className="btn" id="conflict-local" disabled={busy||review.localAllowed===false} onClick={()=>void resolve('local','保留本机版')}>保留本机版</button>
      <button type="button" className="btn" id="conflict-back" onClick={onBack}>返回</button></div>
    <p className="muted">{batch?review.localAllowed===false?'此批次包含整库清空，不能覆盖另一设备的修改。保留云端版会移除此批次的本机待传记录。':'保留云端版会移除此批次的本机待传记录；保留本机版会整批重试，若图片编号已被云端占用则安全拒绝。':metadata?'素材或系列只能选择一个在线版本；本机版提交仍受云端版本保护。':'保留本机版会先把当前云端版另存一份，再以本机版更新原作品；双方都保留会生成新的独立可编辑作品。'}选择云端版后本机未上传的变更会移出队列。</p>
  </Dialog>;
}
export function SyncErrorDialog({error,onClose,onBack,onDiagnostics,kind}){
  return <Dialog title={kind==='details'?'同步详情暂不可用':'无法自动比较版本'} onClose={onClose}>
    <h2>{kind==='details'?'同步详情暂不可用':'无法自动比较版本'}</h2>
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
