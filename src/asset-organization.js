import {classificationQueue} from './classification-queue.js';

// Session-only activity, separate from the user's review status and cloud data.
export function createAssetOrganization() {
  const jobs=new Map(),listeners=new Set();
  const notify=()=>{for(const fn of listeners)fn();};
  return {
    status:id=>jobs.get(id)?.status,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    clear(){jobs.clear();notify();},
    async run(records,{waitForSave=async()=>{},organize,onError=()=>{},priority='background',queue=classificationQueue}={}) {
      const token=Symbol('batch');
      const set=(id,status)=>{if(jobs.get(id)?.token!==token)return;if(status)jobs.set(id,{token,status});else jobs.delete(id);notify();};
      for(const record of records)jobs.set(record.id,{token,status:'queued'});
      notify();
      try{await waitForSave();}catch(error){for(const record of records)set(record.id,'failed');onError(error);return;}
      await Promise.all(records.map(record=>queue.schedule(async()=>{
        if(jobs.get(record.id)?.token!==token)return;
        set(record.id,'running');
        try{await organize(record,()=>jobs.get(record.id)?.token===token);set(record.id,null);}
        catch(error){set(record.id,'failed');onError(error,record);}
      },{priority})));
    }
  };
}

// Keep the current route, scroll, selection and image node intact when one
// model response finishes. Filtering/reordering is handled by catalogRefresh.
export function updateOrganizedAssetView(root,record,{kindName,formatSize=n=>String(n)}={}) {
  const title=record.title||'',kind=kindName?.(record.kind)||record.kind||'',size=record.physicalWidthMM?`${formatSize(record.physicalWidthMM)} × ${formatSize(record.physicalHeightMM)} mm`:'尺寸待确认';
  for(const card of root.querySelectorAll('.card[data-id]')){
    if(card.dataset.id!==record.id)continue;
    const heading=card.querySelector('.card-body h3');
    if(heading){if(heading.firstChild?.nodeType===3)heading.firstChild.textContent=title;else heading.prepend(root.ownerDocument.createTextNode(title));}
    const summary=card.querySelector('.card-body p');if(summary)summary.textContent=`${kind} · ${size}`;
    const chip=card.querySelector('.card-body .chip');if(chip){chip.textContent=record.reviewStatus==='ready'?'已整理':'待检查';chip.classList.toggle('warn',record.reviewStatus!=='ready');}
    // The incremental catalog compares this revision with the next model
    // render. Keep it current after patching text in place, or it will replace
    // the whole card and discard its decoded image on a background rename.
    if(card.hasAttribute('data-card-revision'))card.dataset.cardRevision=JSON.stringify([
      record.title,record.kind,record.physicalWidthMM,record.physicalHeightMM,
      record.reviewStatus,record.isFavorite,record.blobId
    ]);
  }
  for(const img of root.querySelectorAll('img[data-asset-image-id]')){
    if(img.dataset.assetImageId!==record.id)continue;
    img.alt=title;
    const match=img.closest('.match-basket-item,.match-rec');
    if(match){const heading=match.querySelector('strong');if(heading)heading.textContent=title;}
  }
  const detail=root.querySelector('.detail-page');
  if(detail?.querySelector('img[data-asset-image-id]')?.dataset.assetImageId===record.id){
    const heading=detail.querySelector('.detail-copy h1');if(heading)heading.textContent=title;
    const type=detail.querySelector('.detail-facts>div:nth-child(3) span');if(type)type.textContent=kind;
    const role=detail.querySelector('.detail-facts>div:nth-child(4) span');if(role)role.textContent=record.role==='background'?'背景':record.role==='connector'?'连接':'陪衬';
    const texture=detail.querySelector('.detail-facts>div:nth-child(5) span');if(texture)texture.textContent=record.texture||'待记录';
    const tags=detail.querySelector('.detail-tags');if(tags){const values=[...(record.tags||[]),...(record.contentTags||[]),...(record.styleTags||[]),...(record.materialTags||[])].filter((tag,index,list)=>tag&&list.indexOf(tag)===index).sort((a,b)=>a.localeCompare(b,'zh-CN'));tags.replaceChildren(...values.map(tag=>{const span=root.ownerDocument.createElement('span');span.textContent=tag;return span;}));}
  }
}

const labels={queued:'等待整理',running:'正在整理',failed:'整理未完成'};
export function syncOrganizationBadges(root,organization) {
  const hosts=new Map();
  for(const image of root.querySelectorAll('img[data-asset-image-id]')){
    const host=image.closest('.card-image,.detail-picture,.match-basket-item,.match-rec');
    if(host)hosts.set(host,image.dataset.assetImageId);
  }
  for(const [host,id] of hosts){
    const status=organization.status(id);let badge=host.querySelector(':scope > .asset-organization-badge');
    host.classList.toggle('asset-organization-host',!!status);
    if(!status){badge?.remove();continue;}
    if(!badge){badge=host.ownerDocument.createElement('span');badge.className='asset-organization-badge';badge.setAttribute('role','status');badge.setAttribute('aria-live','polite');badge.setAttribute('aria-atomic','true');host.append(badge);}
    badge.dataset.organizationStatus=status;badge.textContent=labels[status];
    badge.title=status==='failed'?'自动整理未完成，素材已保存，可稍后重新识别':status==='queued'?'素材已暂存，等待同步后自动整理':'正在后台整理名称和标签，可继续使用页面';
  }
}

export function mountOrganizationBadges(root,organization) {
  const sync=()=>syncOrganizationBadges(root,organization),unsubscribe=organization.subscribe(sync);
  // Routes and selection results may add previews without calling a full render.
  // Ignore badge mutations themselves, so updates never form an observer loop.
  const observer=new root.ownerDocument.defaultView.MutationObserver(records=>{
    if(records.some(r=>[...r.addedNodes].some(node=>node.nodeType===1&&(node.matches('img[data-asset-image-id]')||node.querySelector('img[data-asset-image-id]')))))sync();
  });
  observer.observe(root,{childList:true,subtree:true});sync();
  return()=>{observer.disconnect();unsubscribe();};
}
