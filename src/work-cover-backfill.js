// Backfill the *existing* Works library's missing COS WebP covers on demand.
// Visible cards are first; the remaining historical covers are staged slowly
// while the user stays on Works. Never touch pending edits or
// large-project summaries without recovering the complete document first.
// Durable stageProject + revision CAS own all actual writes and conflicts.
export function needsWorkCover(project){
  if(!project||project.isSnapshot||project.isTemplate||!project.drafts?.length)return false;
  const draft=project.drafts.find(row=>row.id===project.activeDraftID)||project.drafts[0];
  return !draft?.coverImageID&&!draft?.coverBlobId&&
    !(project.coverStaticPath&&project.updatedAt===project.coverBaselineUpdatedAt);
}

export function createWorkCoverBackfill({db,state,cloudEnabled=false,onError=console.warn}){
  const attempted=new Set(),queued=new Set();
  let chain=Promise.resolve();

  async function repair(id,updatedAt,account){
    if(!cloudEnabled||state.route!=='works'||(state.accountId||'browser')!==account)return false;
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
    if((state.accountId||'browser')!==account||state.route!=='works'||
      state.projects.find(p=>p.id===id)?.updatedAt!==updatedAt)return false;
    await db.stageProject(complete);
    return true;
  }

  function enqueue(id,updatedAt){
    const account=state.accountId||'browser',key=JSON.stringify([account,id,updatedAt]);
    if(!id||queued.has(key)||attempted.has(key))return;
    queued.add(key);
    chain=chain.catch(()=>{}).then(async()=>{
      try{const staged=await repair(id,updatedAt,account);if(staged)attempted.add(key);}
      catch(error){attempted.add(key);onError('作品封面补齐失败，原稿未改动',id,error);}
      finally{queued.delete(key);}
    });
  }

  function observe(view){
    if(!cloudEnabled||state.route!=='works')return ()=>{};
    const cards=[...view.querySelectorAll('[data-act="open-project"][data-id]')]
      .filter(card=>needsWorkCover(state.projects.find(p=>p.id===card.dataset.id)));
    if(!cards.length)return ()=>{};
    let stopped=false,timer=null;
    // Fill visible cards immediately; do not stage every historical project
    // at once or compete with foreground downloads.
    const observer=typeof IntersectionObserver==='function'
      ?new IntersectionObserver(entries=>{
        for(const row of entries)if(row.isIntersecting){
          const id=row.target.dataset.id,project=state.projects.find(p=>p.id===id);
          if(project)enqueue(id,project.updatedAt);
          observer.unobserve(row.target);
        }
      },{rootMargin:'550px'}):null;
    if(observer)cards.forEach(card=>observer.observe(card));
    else cards.slice(0,6).forEach(card=>{
      const project=state.projects.find(p=>p.id===card.dataset.id);
      if(project)enqueue(project.id,project.updatedAt);
    });
    const backlog=cards.map(card=>card.dataset.id);
    // Keep historical Works covers COS-resident even if the user has not
    // scrolled to them yet. Idle pacing leaves free slots for active reads.
    const next=()=>{
      if(stopped||state.route!=='works')return;
      while(backlog.length){
        const id=backlog.shift(),project=state.projects.find(p=>p.id===id);
        if(!project||!needsWorkCover(project))continue;
        const key=JSON.stringify([state.accountId||'browser',id,project.updatedAt]);
        if(attempted.has(key)||queued.has(key))continue;
        enqueue(id,project.updatedAt);
        break;
      }
      if(backlog.length)timer=setTimeout(next,2200);
    };
    timer=setTimeout(next,3500);
    return ()=>{stopped=true;observer?.disconnect();if(timer!==null)clearTimeout(timer);};
  }

  return {observe,enqueue,needsWorkCover,whenIdle:()=>chain};
}
