// Developer-only storage observability. It is not a user-facing settings
// screen. RPC and COS endpoint each independently verify admin credentials.
const bytes=value=>{
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)return '未知';
  if(n<1024)return n+' B';
  const units=['KB','MB','GB','TB'],power=Math.min(4,Math.floor(Math.log(n)/Math.log(1024))),factor=1024**power;
  return (n/factor).toFixed(power>=3?2:1)+' '+units[power-1];
};
export {bytes as formatStorageBytes};

export function createStorageUsageController({client,fetcher=fetch,confirmAction=confirm}){
  const getDB=async()=>{
    const {data,error}=await client.rpc('shiye_storage_admin_stats');
    if(error)throw Error(error.message||'数据库容量统计不可用');
    if(!data||typeof data!=='object')throw Error('数据库没有返回有效统计结果');
    return data;
  };
  const getCOS=async()=>{
    const {data,error}=await client.auth.getSession();
    if(error||!data.session?.access_token)throw Error('请先登录');
    const response=await fetcher('/api/storage-usage',{method:'GET',
      headers:{Authorization:'Bearer '+data.session.access_token},
      cache:'no-store',signal:AbortSignal.timeout(60000)});
    let result;try{result=await response.json();}catch{throw Error('COS 未返回有效统计');}
    if(!response.ok)throw Error(result?.error||'COS 容量统计失败');
    return result;
  };
  const prune=async({eligible=0}={})=>{
    if(!(Number(eligible)>0))return 0;
    if(!confirmAction('将最多 5,000 条超过 90 天的已确认同步提交收据从 Supabase 中清理？不会删除素材、作品、Tombstone、同步水位线或 COS 图片。'))return null;
    const {data,error}=await client.rpc('shiye_storage_prune_commits',
      {retention_days:90,batch_limit:5000});
    if(error)throw Error(error.message||'清理提交收据失败');
    return Number(data)||0;
  };
  return {getDB,getCOS,prune};
}

export async function openStorageUsage(client){
  const controller=createStorageUsageController({client});
  const backdrop=document.createElement('div');backdrop.className='cloud-admin-backdrop';
  const panel=document.createElement('section');panel.className='cloud-admin-panel';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','拾页存储统计（开发者）');
  panel.style.cssText='overflow:auto;max-height:90vh;max-width:750px';
  panel.innerHTML=`<div class="cloud-admin-heading"><h2>存储统计 · 开发者</h2><button class="btn mini" data-close>关闭</button></div>
    <p>仅开发者可查看。Supabase 的物理表空间、JSON 内容大小与 COS 文件体积是不同指标，不应相加为同一个数据库大小。</p>
    <div class="actions"><button class="btn" data-refresh>重新核对</button><button class="btn danger" data-prune disabled>清理过期同步收据</button></div>
    <p role="status" data-status>准备读取…</p><section data-db></section><section data-cos></section>
    <p>删除墓碑永久保留；COS 旧文件先做只读盘点。没有包含离线队列、外部备份与跨设备历史的引用证明前，不提供 COS 删除操作。</p>`;
  backdrop.append(panel);document.body.append(backdrop);
  const dbHost=panel.querySelector('[data-db]'),cosHost=panel.querySelector('[data-cos]'),status=panel.querySelector('[data-status]');
  const button=panel.querySelector('[data-prune]');
  let epoch=0,stats=null;
  const close=()=>{epoch++;backdrop.remove();document.removeEventListener('keydown',onKey);};
  const onKey=event=>{if(event.key==='Escape')close();};
  panel.querySelector('[data-close]').onclick=close;
  backdrop.onclick=event=>{if(event.target===backdrop)close();};
  document.addEventListener('keydown',onKey);
  const node=(tag,text)=>{const element=document.createElement(tag);element.textContent=String(text);return element;};
  const line=(host,label,value)=>{
    const row=document.createElement('p');row.append(node('strong',label+'：'),node('span',value));host.append(row);
  };
  const showDB=data=>{
    dbHost.replaceChildren(node('h3','Supabase · 数据库'));
    line(dbHost,'拾页相关表（含索引）',bytes(data.appTablesBytes));
    line(dbHost,'整个 Supabase 数据库（含平台及其他表）',bytes(data.databaseBytes));
    for(const [store,label] of [['assets','素材'],['projects','作品'],['series','系列'],['blobs','图片元数据'],['trash','最近删除'],['meta','设置及删除墓碑']]){
      const row=data.stores?.[store]||{};
      line(dbHost,label,`${Number(row.count||0).toLocaleString()} 条；JSON 载荷 ${bytes(row.payloadBytes||0)}`);
    }
    line(dbHost,'长期保留的 Tombstone',Number(data.tombstones||0).toLocaleString()+' 条');
    line(dbHost,'同步增量日志',`${data.changes?.count||0} 条；估计行内容 ${bytes(data.changes?.estimatedRowBytes||0)}`);
    line(dbHost,'冲突保护水位线',`${data.watermarks?.count||0} 条；估计行内容 ${bytes(data.watermarks?.estimatedRowBytes||0)}`);
    line(dbHost,'同步提交收据',`${data.commits?.count||0} 条；估计行内容 ${bytes(data.commits?.estimatedRowBytes||0)}`);
    line(dbHost,'符合安全清理窗口（90 天）',`${data.commits?.eligibleAfter90Days||0} 条收据；实际可回收物理空间还取决于 VACUUM`);
    button.disabled=!(Number(data.commits?.eligibleAfter90Days)>0);
  };
  const showCOS=data=>{
    cosHost.replaceChildren(node('h3','腾讯 COS · 对象体积'));
    line(cosHost,'已扫描对象',Number(data.objectCount||0).toLocaleString()+' 个');
    line(cosHost,data.inventoryComplete?'对象总量':'当前扫描范围（非完整总量）',bytes(data.totalBytes));
    for(const [kind,label] of [['original','原始图片'],['derivative','派生图／封面'],['document','作品文档'],['other','其他对象']]){
      const row=data.groups?.[kind]||{};
      line(cosHost,label,`${Number(row.count||0).toLocaleString()} 个，${bytes(row.bytes||0)}`);
    }
    line(cosHost,'引用完整核对',data.referencesComplete&&data.inventoryComplete?'当前云端元数据已扫描完成':'未完成，不可进行无引用判断');
    if(data.oldUnreferencedCandidates!==null&&data.oldUnreferencedCandidates!==undefined)
      line(cosHost,'超过 90 天的待核对无引用候选',`${data.oldUnreferencedCandidates} 个，${bytes(data.oldUnreferencedCandidateBytes)}；不可直接删除`);
    line(cosHost,'确认可安全删除的 COS 大小','0 B（未进行离线队列和备份核验）');
    cosHost.append(node('p',data.warning||'COS 不会自动删除任何内容'));
  };
  const refresh=async()=>{
    const mine=++epoch;status.textContent='正在读取数据库与 COS 容量…';button.disabled=true;
    dbHost.replaceChildren();cosHost.replaceChildren();
    const [db,cos]=await Promise.allSettled([controller.getDB(),controller.getCOS()]);
    if(mine!==epoch)return;
    stats=db.status==='fulfilled'?db.value:null;
    if(stats)showDB(stats);else dbHost.append(node('p','数据库统计失败：'+db.reason.message));
    if(cos.status==='fulfilled')showCOS(cos.value);else cosHost.append(node('p','COS 统计暂不可用：'+cos.reason.message));
    status.textContent='核对完成：'+new Date().toLocaleString();
  };
  panel.querySelector('[data-refresh]').onclick=()=>void refresh();
  button.onclick=async()=>{
    button.disabled=true;
    try{
      const count=await controller.prune({eligible:stats?.commits?.eligibleAfter90Days});
      if(count!==null){status.textContent=`已清理 ${count} 条过期提交收据；对象、删除墓碑未被修改`;await refresh();}
    }catch(error){status.textContent='清理失败：'+error.message;}
    finally{if(stats)button.disabled=!(Number(stats.commits?.eligibleAfter90Days)>0);}
  };
  await refresh();
}
