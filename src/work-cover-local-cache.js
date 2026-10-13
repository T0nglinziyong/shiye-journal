import {localDeviceRecords} from './local-device-records.js';

// A missing remote cover must not leave a card blank while its upload waits.
// Render a complete 480px scene locally, show the Blob immediately, and cache
// only that thumbnail by account/project/revision. COS upload is independent.
export function createLocalWorkCovers({
  state,loadDocument,renderCover,deviceRecords=localDeviceRecords,
  onReady=()=>{},onError=()=>{},createURL=blob=>URL.createObjectURL(blob),
  revokeURL=url=>URL.revokeObjectURL(url)
}){
  const entries=new Map(),jobs=new Map();const maxMemory=24;
  const account=()=>String(state.accountId||'browser');
  const key=p=>JSON.stringify([account(),p.id,p.updatedAt,p.activeDraftID]);
  const missing=p=>!!p&&!p.isSnapshot&&!p.isTemplate&&!!p.drafts?.length&&
    !((p.drafts.find(d=>d.id===p.activeDraftID)||p.drafts[0])?.coverImageID||
      (p.drafts.find(d=>d.id===p.activeDraftID)||p.drafts[0])?.coverBlobId||
      (p.coverStaticPath&&p.coverBaselineUpdatedAt===p.updatedAt));
  function remember(p,blob,owner=account()){
    if(!(blob instanceof Blob)||!blob.size)return null;
    if(owner!==account())return null;
    const token=key(p),prior=entries.get(token);
    if(prior)return prior;
    const entry={blob,url:createURL(blob)};
    entries.set(token,entry);
    while(entries.size>maxMemory){
      const oldest=entries.keys().next().value;
      if(oldest===token)break;
      const stale=entries.get(oldest);entries.delete(oldest);revokeURL(stale.url);
    }
    onReady(p,entry.url);
    return entry;
  }
  function peek(p){return p?entries.get(key(p))?.url||null:null;}
  async function ensure(p){
    if(!p?.id||p.isSnapshot)return null;
    const token=key(p),existing=entries.get(token);
    if(existing)return existing.blob;
    if(jobs.has(token))return jobs.get(token);
    const owner=account(),revision=p.updatedAt;
    const job=(async()=>{
      const saved=await deviceRecords.get(owner,'work-cover:480:'+p.id).catch(()=>null);
      if(saved?.updatedAt===revision&&saved?.blob instanceof Blob&&saved.blob.size){
        remember(p,saved.blob,owner);return saved.blob;
      }
      const complete=p.projectDocumentPath?await loadDocument(p):p;
      if(owner!==account()||p.updatedAt!==revision)return null;
      if(!complete?.drafts?.length)throw Error('作品缺少可编辑画布，无法生成本地封面');
      const blob=await renderCover(complete);
      if(!(blob instanceof Blob)||!blob.size)throw Error('本地作品封面生成失败');
      if(owner!==account()||p.updatedAt!==revision)return null;
      remember(p,blob,owner);
      // A failed thumbnail cache write does not undo the successfully rendered
      // cover or block the independently managed cloud upload.
      void deviceRecords.put(owner,{id:'work-cover:480:'+p.id,updatedAt:revision,blob})
        .catch(error=>onError('封面本地缓存暂不可用',p.id,error));
      return blob;
    })().catch(error=>{onError('本地封面生成失败',p.id,error);throw error;})
      .finally(()=>jobs.delete(token));
    jobs.set(token,job);
    return job;
  }
  function observe(root,projects=state.projects){
    if(!root)return ()=>{};
    const cards=[...root.querySelectorAll('[data-act="open-project"][data-id],[data-cover-project-id]')]
      .filter(card=>missing(projects.find(p=>p.id===(card.dataset.coverProjectId||card.dataset.id))));
    if(!cards.length)return ()=>{};
    let disposed=false;
    const loadCard=card=>{
      if(disposed)return;
      const p=projects.find(project=>project.id===(card.dataset.coverProjectId||card.dataset.id));
      if(p&&missing(p))void ensure(p).catch(()=>{});
    };
    const observer=typeof IntersectionObserver==='function'
      ?new IntersectionObserver(rows=>rows.forEach(row=>{if(row.isIntersecting){loadCard(row.target);observer.unobserve(row.target);}}),{rootMargin:'120px'}):null;
    observer?.observe&&cards.forEach(card=>observer.observe(card));
    if(!observer)cards.slice(0,2).forEach(loadCard);
    return ()=>{disposed=true;observer?.disconnect();};
  }
  return {peek,ensure,remember,observe,missing,
    dispose(){for(const value of entries.values())revokeURL(value.url);entries.clear();jobs.clear();}};
}
