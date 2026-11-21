// Backfill the *existing* Works library's missing COS WebP covers on demand.
// Visible cards are first; the remaining historical covers are staged slowly
// while the user stays on Works. Never touch pending edits or
// large-project summaries without recovering the complete document first.
// Durable stageProject + revision CAS own all actual writes and conflicts.
import {scheduleForegroundIdle} from './foreground-idle.js';
export function needsWorkCover(project){
  if(!project||project.isSnapshot||project.isTemplate||!project.drafts?.length)return false;
  const draft=project.drafts.find(row=>row.id===project.activeDraftID)||project.drafts[0];
  const remoteCover=draft?.coverImageID;
  // Historical 360px COS project snapshots must be upgraded in the
  // background, never mistaken for a current 480px cover.
  const obsolete=typeof remoteCover==='string'&&
    remoteCover.startsWith('project-cover:')&&!remoteCover.endsWith('-preview480.webp');
  return (obsolete||!remoteCover&&!draft?.coverBlobId)&&
    !(project.coverStaticPath&&project.updatedAt===project.coverBaselineUpdatedAt);
}

export function createWorkCoverBackfill({db,state,cloudEnabled=false,onError=console.warn}){
  const attempted=new Map(),queued=new Set(),retryAfter=new Map(),failureCount=new Map();
  let chain=Promise.resolve();

  async function repair(id,updatedAt,account){
    if(!cloudEnabled||(state.accountId||'browser')!==account)return false;
    const project=state.projects.find(row=>row.id===id);
    if(!project||project.updatedAt!==updatedAt||!needsWorkCover(project))return false;
    if(state.activeProject?.id===id)return false;
    const pending=await db.pendingProjects();
    if(pending.some(row=>row.record?.id===id))return false;
    // The collection intentionally stores thin summaries for large documents.
    // Staging that summary would destroy editable layers: always expand first.
    const complete=project.projectDocumentPath
      ?await db.completeProject(project)
      :structuredClone(project);
    if(complete.id!==id||!complete.drafts?.length)throw Error('作品全文不完整，已跳过封面补齐');
    // No updatedAt or content edits: encode() uploads the deterministic
    // snapshot, then commits just the usual project summary metadata.
    if((state.accountId||'browser')!==account||
      state.projects.find(p=>p.id===id)?.updatedAt!==updatedAt)return false;
    await db.stageProject(complete);
    // Staging merely queues a durable write; a cover is not available until
    // the uploader and project metadata commit have both succeeded.
    if(db.flushProjects){
      await db.flushProjects();
      const committed=await db.get?.('projects',id);
      if(committed&&needsWorkCover(committed))throw Error('云端作品已保存，但完整封面尚未生成；稍后重试');
    }
    return true;
  }

  function enqueue(id,updatedAt){
    const account=state.accountId||'browser',key=JSON.stringify([account,id,updatedAt]);
    if(!id||queued.has(key)||Date.now()<(attempted.get(key)||0)||Date.now()<(retryAfter.get(key)||0))return;
    queued.add(key);
    chain=chain.catch(()=>{}).then(async()=>{
      try{const staged=await repair(id,updatedAt,account);if(staged){attempted.set(key,Date.now()+60000);retryAfter.delete(key);failureCount.delete(key);}}
      catch(error){const failures=Math.min(6,(failureCount.get(key)||0)+1);failureCount.set(key,failures);retryAfter.set(key,Date.now()+Math.min(300000,5000*2**(failures-1)));onError('作品封面补齐失败，原稿未改动',id,error);}
      finally{queued.delete(key);}
    });
  }

  function retry(id,updatedAt){
    const key=JSON.stringify([state.accountId||'browser',id,updatedAt]);
    attempted.delete(key);retryAfter.delete(key);failureCount.delete(key);
    enqueue(id,updatedAt);
  }

  function observe(view){
    if(!cloudEnabled||state.route!=='works')return ()=>{};
    const cards=[...view.querySelectorAll('[data-act="open-project"][data-id]')]
      .filter(card=>needsWorkCover(state.projects.find(p=>p.id===card.dataset.id)));
    if(!cards.length)return ()=>{};
    let disposed=false;
    const timers=new Set(),idles=new Set();
    const schedule=project=>{
      const timer=setTimeout(()=>{
        timers.delete(timer);
        if(disposed||state.route!=='works'||document.visibilityState==='hidden')return;
        const run=()=>{if(!disposed&&state.route==='works')enqueue(project.id,project.updatedAt);};
        const cancel=scheduleForegroundIdle(()=>{idles.delete(cancel);run();},
          {minIdleMs:1800});idles.add(cancel);
      },3000);
      timers.add(timer);
    };
    // Repair only cards that enter the viewport. Historical projects no
    // longer compete with editing, import, or foreground image downloads.
    const observer=typeof IntersectionObserver==='function'
      ?new IntersectionObserver(entries=>{
        for(const row of entries)if(row.isIntersecting){
          const id=row.target.dataset.id,project=state.projects.find(p=>p.id===id);
          if(project&&document.visibilityState!=='hidden')schedule(project);
          observer.unobserve(row.target);
        }
      },{rootMargin:'120px'}):null;
    if(observer)cards.forEach(card=>observer.observe(card));
    else cards.slice(0,2).forEach(card=>{
      const project=state.projects.find(p=>p.id===card.dataset.id);
      if(project)schedule(project);
    });
    return ()=>{disposed=true;observer?.disconnect();
      for(const timer of timers)clearTimeout(timer);
      for(const cancel of idles)cancel();};
  }

  return {observe,enqueue,retry,startBackground:()=>{},needsWorkCover,whenIdle:()=>chain};
}
