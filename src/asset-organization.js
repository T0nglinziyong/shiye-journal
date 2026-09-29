// Session-only activity, separate from the user's review status and cloud data.
export function createAssetOrganization() {
  const jobs=new Map(),listeners=new Set();
  const notify=()=>{for(const fn of listeners)fn();};
  return {
    status:id=>jobs.get(id)?.status,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    async run(records,{waitForSave=async()=>{},organize,onError=()=>{}}) {
      const token=Symbol('batch');
      const set=(id,status)=>{if(jobs.get(id)?.token!==token)return;if(status)jobs.set(id,{token,status});else jobs.delete(id);notify();};
      for(const record of records)jobs.set(record.id,{token,status:'queued'});
      notify();
      try{await waitForSave();}catch(error){for(const record of records)set(record.id,'failed');onError(error);return;}
      for(const record of records){
        set(record.id,'running');
        try{await organize(record);set(record.id,null);}
        catch(error){set(record.id,'failed');onError(error);}
      }
    }
  };
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
