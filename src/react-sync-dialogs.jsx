import React,{useState} from 'react';
import {Dialog} from './react-utility-dialogs.jsx';

export function SyncDetailsDialog({details,projects,batches,local,quarantined,legacyCount,
  error,status,onClose,onDiagnostics,onConflict,onMigrate,onBackupLegacy,onWipe,
  onRetry,onPause,onEmergency}){
  const [message,setMessage]=useState(`状态：${status}`),[busy,setBusy]=useState(false);
  const retry=async()=>{
    if(busy)return;setBusy(true);setMessage('状态：正在提交本机修改…');
    try{const remaining=await onRetry();setMessage(remaining?`状态：仍有 ${remaining} 项待同步；请查看最近错误或稍后重试`:'状态：已同步到云端');}
    catch(cause){setMessage('状态：待重试 · 本机修改已保留；关闭详情后自动重试');}
    finally{setBusy(false);}
  };
  const total=projects.length+batches.length+local.length;
  return <Dialog title="同步详情" onClose={onClose}><h2>同步详情</h2>
    <p id="sync-detail-status" role="status">{message}</p><p>最近错误：{error||details.error||'无'}</p>
    <p>本机待同步：{total} 项。未上传作品和草稿将保留在本机待同步队列。</p>
    <p>隔离待同步原始记录：{quarantined} 项（禁止自动上传，原始数据未丢弃）。</p>
    <p>已隔离旧版可编辑作品：{legacyCount} 件（未删除）。转换工具会同时扫描账号的素材、系列、作品、元数据、图片引用和最近删除。</p>
    <div className="sync-pending-list">{total?<ul>
      {projects.map(row=><li key={`project-${row.id}`}>作品：{row.title} <small>{row.id}</small> <button type="button" className="btn mini" data-conflict-kind="project" data-conflict-id={row.id} onClick={()=>onConflict('project',row.id)}>比较版本</button></li>)}
      {batches.map(row=><li key={`batch-${row.id}`}>待传批次 {row.id}：{row.items.length} 条变更<ul>{row.items.slice(0,12).map((item,index)=><li key={index}>{item.store} · {item.action} · {item.title||item.id}</li>)}</ul>
        {row.items.length===1&&row.items[0]?.store==='projects'&&row.items[0]?.action==='put'?<button type="button" className="btn mini" data-conflict-kind="batch" data-conflict-id={row.id} onClick={()=>onConflict('batch',row.id)}>比较版本</button>:null}</li>)}
      {local.map(row=><li key={row.id}>尚未暂存的作品：{row.title||row.id}</li>)}
    </ul>:<p>没有待同步项目。</p>}</div>
    <div className="actions"><button type="button" className="btn" id="sync-export-diagnostics" onClick={onDiagnostics}>导出详细同步诊断</button>
      <button type="button" className="btn" id="sync-migrate-account" onClick={onMigrate}>转换旧数据格式</button>
      <button type="button" className="btn" id="sync-backup-legacy-works" disabled={!legacyCount} onClick={onBackupLegacy}>导出隔离旧作品备份</button>
      <button type="button" className="btn primary" id="sync-retry-now" disabled={busy} onClick={()=>void retry()}>{busy?'正在同步…':'立即同步'}</button>
      <button type="button" className="btn" id="sync-pause-local" onClick={onPause}>暂停／恢复后台重试</button>
      <button type="button" className="btn" id="sync-emergency-copy" disabled={!total} onClick={onEmergency}>导出待同步数据备份</button>
      <button type="button" className="btn danger" id="sync-wipe-everything" onClick={onWipe}>彻底清空本账号本机与云端数据</button></div>
    <p>暂停仅停止自动重试，不清空作品、草稿或待上传图片；页面刷新后仍可恢复同步。为防止误删本机唯一副本，已移除直接丢弃待同步作品的操作。</p>
  </Dialog>;
}
const date=value=>{const result=new Date(value);return Number.isFinite(result.getTime())?result.toLocaleString():'未记录';};
export function SyncConflictDialog({review,onClose,onBack,onBackup,onResolve}){
  const {local,remote}=review.overview;
  const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('先备份双方版本，再选择处理方式。');
  const backup=async()=>{setBusy(true);setStatus('正在准备原始版本与 SHA-256…');try{const result=await onBackup();setSaved(true);setStatus(`已发起备份下载（SHA-256：${result.sha256.slice(0,16)}…）。请确认文件已在“文件”中保存。`);}catch(cause){setSaved(false);setStatus('备份未完成：'+cause.message);}finally{setBusy(false);}};
  const resolve=async(choice,label)=>{if(!saved||busy)return;setBusy(true);setStatus('正在核对版本和原子提交…');try{await onResolve(choice,label);onClose();}catch(cause){setStatus('没有覆盖资料：'+cause.message+'。请返回同步详情重新核对版本。');setBusy(false);}};
  const card=(label,record)=><section className="sync-version-card"><strong>{label}</strong><p>{record?.title||'没有云端版本'}</p><small>修改：{date(record?.updatedAt)} · {record?.drafts??0} 个方案 · {record?.layers??0} 个顶层图层</small></section>;
  return <Dialog title="手动解决同步冲突" onClose={onClose}><h2>手动解决同步冲突</h2><p>这两份作品来自同一个编号，但内容可能不同。请选择希望保留的版本；不会自动用修改时间覆盖。</p>
    <div className="sync-version-grid">{card('本机未同步',local)}{card('当前云端',remote)}</div>
    <p role="status" id="conflict-progress">{status}</p><div className="actions">
      <button type="button" className="btn" id="conflict-backup" disabled={busy} onClick={()=>void backup()}>下载双方原始备份</button>
      <button type="button" className="btn primary" id="conflict-both" disabled={!saved||busy} onClick={()=>void resolve('both','双方都保留')}>双方都保留（推荐）</button>
      <button type="button" className="btn" id="conflict-cloud" disabled={!saved||busy||!remote} onClick={()=>void resolve('cloud','保留云端版')}>保留云端版</button>
      <button type="button" className="btn" id="conflict-local" disabled={!saved||busy} onClick={()=>void resolve('local','保留本机版')}>保留本机版</button>
      <button type="button" className="btn" id="conflict-back" onClick={onBack}>返回</button></div>
    <p className="muted">保留本机版会先把当前云端版另存一份，再以本机版更新原作品；双方都保留会生成新的独立可编辑作品。没有确认备份时不能执行。</p>
  </Dialog>;
}
export function SyncErrorDialog({error,onClose,onBack,onDiagnostics,kind}){
  return <Dialog title={kind==='details'?'同步详情暂不可用':'无法自动比较版本'} onClose={onClose}>
    <h2>{kind==='details'?'同步详情暂不可用':'无法自动比较版本'}</h2>
    {kind==='details'?<><p>待同步资料没有被清除。仍可导出当天的本机同步诊断。</p><button type="button" className="btn" id="sync-export-diagnostics" onClick={onDiagnostics}>导出详细同步诊断</button></>:
      <><p role="alert">{error}</p><p>本机数据仍保留在待同步队列，可以先导出应急备份。混合操作批次需要单独检查。</p><button type="button" className="btn" id="conflict-back" onClick={onBack}>返回同步详情</button></>}
  </Dialog>;
}
export function SyncMigrationDialog({plan,onClose,onBackup,onApply}){
  const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(
    plan.changes.length?'':plan.review.length?'没有可安全自动转换的记录；请按待检查清单处理。':'所有已识别的记录均符合当前格式，无需转换。');
  const names={assets:'素材',series:'系列',projects:'作品',blobs:'图片引用',meta:'设置与元数据',trash:'最近删除'};
  const backup=async()=>{setBusy(true);setStatus('正在准备备份与 SHA-256 校验…');try{const result=await onBackup();setSaved(true);setStatus(`已发起原始备份下载（SHA-256：${result.sha256.slice(0,16)}…）。请先在“文件”中确认已保存，再执行转换。`);}catch(cause){setStatus('备份失败：'+cause.message);}finally{setBusy(false);}};
  const apply=async()=>{if(!saved||busy)return;setBusy(true);setStatus('正在检查版本并提交转换；请不要关闭页面…');try{const result=await onApply();setStatus(`转换成功 ${result.updated} 条；请重新打开作品确认图层、素材与同步状态。`);}catch(cause){setStatus('转换未完成：'+cause.message+'。原始云端记录及已下载备份保留，请重新扫描。');}finally{setBusy(false);}};
  return <Dialog title="转换旧数据格式" onClose={onClose}><h2>转换旧数据格式</h2>
    <p>本次共扫描 {plan.totals.scanned} 条账号记录；找到 {plan.totals.migratable} 条可验证转换的旧记录，{plan.totals.needsReview} 条需要人工检查。已符合现行结构的资料不会被重写。</p>
    <div style={{maxHeight:'50vh',overflow:'auto'}}><table className="migration-audit-table"><thead><tr><th>数据类型</th><th>扫描</th><th>可转换</th><th>待检查</th></tr></thead><tbody>{plan.scans.map(row=><tr key={row.store}><td>{names[row.store]||row.store}</td><td>{row.total}</td><td>{row.migratable}</td><td>{row.needsReview}</td></tr>)}</tbody></table></div>
    {plan.review.length?<details><summary>无法自动转换的记录（未修改）</summary><ul>{plan.review.slice(0,30).map((row,index)=><li key={index}>{row.store} · {row.id||'未知'}：{row.reason}</li>)}</ul></details>:null}
    <p>转换前必须下载原始备份。只转换有明确转换器、且完成物理尺寸与库存校验的记录。旧 COS 原件不会删除；无法转换的条目仍保留原样。</p>
    <p id="migration-status" role="status">{status}</p><div className="actions"><button type="button" className="btn" id="migration-download" disabled={!plan.changes.length||busy} onClick={()=>void backup()}>下载受影响记录的原始备份</button>
      <button type="button" className="btn primary" id="migration-apply" disabled={!saved||busy} onClick={()=>void apply()}>确认备份后转换 {plan.changes.length} 条</button>
      <button type="button" className="btn" id="migration-cancel" onClick={onClose}>取消</button></div>
  </Dialog>;
}
