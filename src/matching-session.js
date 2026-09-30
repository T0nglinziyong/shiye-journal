import {usableProjectSnapshot} from './project-outbox-recovery.js';
const ID='matching-session-v1';
const KEYS=['basket','coreIDs','matchCore','matchRatio','matchMode','matchStyle','matchStyles','matchPurposes','matchIntent','matchPurpose','matchProcessing','materialUseHints','materialUseRequired','assetProcessing','customPaperWidth','customPaperHeight'];
export function matchingSnapshot(state,variants){return {id:ID,context:Object.fromEntries(KEYS.map(k=>[k,structuredClone(state[k])])),variants:structuredClone(variants)};}
export function restoreMatchingSession(record,state){
 if(!record)return [];
 for(const key of KEYS)if(record.context?.[key]!==undefined)state[key]=record.context[key];
 return (Array.isArray(record.variants)?record.variants:[])
  .filter(v=>v&&typeof v.id==='string'&&usableProjectSnapshot(v.project))
  .map(v=>v.status==='running'?{...v,status:'interrupted',progress:'页面曾关闭，生成已中断；已保留收到的完整步骤。'}:v);
}
export function variantDraftProject(variant,existing,newID){
 if(existing?.isDraft)return existing;
 const p=structuredClone(variant.project);p.id=newID;p.isDraft=true;p.createdAt=p.updatedAt=new Date().toISOString();return p;
}
export function createMatchingSession(c){
 let variants=[],queue=Promise.resolve(),controller=null,opening=false,lastSnapshot,ready=false;
 const defaults=matchingSnapshot(c.state,[]).context;
 const save=()=>{if(!ready)return queue;const record=matchingSnapshot(c.state,variants),snapshot=JSON.stringify(record);if(snapshot===lastSnapshot)return queue;const task=queue.then(()=>c.db.put('meta',record));queue=task.then(()=>{lastSnapshot=snapshot;},()=>{});return task;};
 const archiveCompleted=async()=>{await queue;for(const v of variants.filter(v=>v.status==='completed')){if(v.linkedProjectID&&c.state.projects.some(p=>p.id===v.linkedProjectID))continue;const p=variantDraftProject(v,null,v.linkedProjectID||c.uid());v.linkedProjectID=p.id;await c.db.transaction(['projects','meta'],tx=>{tx.objectStore('projects').put(p);tx.objectStore('meta').put(matchingSnapshot(c.state,variants));});c.state.projects.push(p);}};
 const markup=()=>`<h2>版本方案</h2><p>完成方案自动保存为草稿；“重新搭配”只清空这里的方案，不删除草稿或作品。</p><div class="match-variant-grid">${variants.map(v=>`<article class="match-variant" data-variant="${c.esc(v.id)}"><button class="match-result" data-act="match-open-result" data-id="${c.esc(v.id)}" ${v.status==='running'?'disabled':''}>${c.workCover(v.project)}<strong>${c.esc(v.title)}</strong></button><pre class="match-progress" aria-live="polite">${c.esc(v.progress)}</pre>${v.status==='running'?'<button class="btn" data-act="match-stop">停止创作</button>':''}</article>`).join('')||'<p>尚未生成方案。</p>'}</div>`;
 const update=()=>{if(c.state.route!=='matching')return;const el=document.querySelector('.match-previews');if(el){el.innerHTML=markup();el.onclick=e=>{const b=e.target.closest('[data-act]');if(b)c.handle(b.dataset.act,b.dataset.id);};c.mountIcons?.(el);}};
 return {
  async restore({archive=true}={}){const record=await c.db.get('meta',ID);for(const key of KEYS)if(defaults[key]!==undefined)c.state[key]=structuredClone(defaults[key]);variants=restoreMatchingSession(record,c.state);if(archive)await archiveCompleted();lastSnapshot=JSON.stringify(matchingSnapshot(c.state,variants));ready=true;},
  render(){return `<section class="panel match-previews">${markup()}</section>`;},
  persist:save,
  stop(){controller?.abort(Error('已停止创作，成功步骤已保留'));},
  async reset(clearContext=()=>{}){await archiveCompleted();const before=matchingSnapshot(c.state,variants),saved=variants;clearContext();variants=[];try{await save();}catch(error){variants=saved;restoreMatchingSession(before,c.state);throw error;}controller?.abort(Error('已重新搭配'));},
  async open(id){const v=variants.find(x=>x.id===id);if(!v||v.status==='running'||opening)return;opening=true;try{await queue;await c.flushSave();const existing=c.state.projects.find(p=>p.id===v.linkedProjectID),p=variantDraftProject(v,existing,c.uid());v.linkedProjectID=p.id;await c.db.transaction(['projects','meta'],tx=>{tx.objectStore('projects').put(p);tx.objectStore('meta').put(matchingSnapshot(c.state,variants));});if(!existing?.isDraft)c.state.projects.push(p);c.state.activeProject=p;c.state.activeDraft=p.activeDraftID;c.state.selected=null;c.state.undo=[];c.state.redo=[];c.state.tool='select';c.state.zoom=1;c.route('editor');}finally{opening=false;}},
  async generate(){
   if(controller){c.toast('已有方案正在创作，请先停止或等待完成');return;}
   const cfg=structuredClone(c.state.aiSettings);if(!cfg.key)throw Error('请先在设置 → AI 与创作中保存 API 密钥');
   const p=c.createProject(),ids=p.candidateAssetIDs,aliases=Object.fromEntries(ids.map((id,i)=>['m'+(i+1),id]));
   const v={id:c.uid(),title:'方案 '+(variants.length+1),createdAt:new Date().toISOString(),status:'running',progress:'正在准备素材预览…',project:p};variants.unshift(v);const run=new AbortController();controller=run;let recorder;
   update();
   try {
    await save();
    recorder=await c.createAIRecorder({db:c.db,model:cfg.model,key:cfg.key});const vision=cfg.includeThumbnails&&c.supportsVision(cfg);
    const images=vision?(await Promise.all(ids.slice(0,cfg.imageCount).map(async(id,i)=>({asset:'m'+(i+1),url:await c.modelImage(c.asset(id))})))).filter(x=>x.url):[];
    const references=[];if(vision&&cfg.sendReference){const ref=c.state.projects.filter(x=>!x.isDraft)[cfg.referencePage-1];if(ref)references.push((await c.rasterize(ref.drafts.find(d=>d.id===ref.activeDraftID)||ref.drafts[0],.7)).toDataURL('image/jpeg',.8));}
    let steps='';const output=await c.runCreativeAgent({...cfg,draft:p.drafts[0],assets:c.state.assets,aliases,styles:p.styles,pagePurposes:p.purposes,requiredAssetIDs:p.requiredAssetIDs,processing:p.processing,assetProcessing:p.assetProcessing,materialUseHints:p.materialUseHints,materialUseRequired:p.materialUseRequired,prompt:c.state.matchIntent,images,referenceImages:references,request:recorder.request,signal:run.signal,
     onResponse:recorder.response,
     onScene:vision?async d=>(await c.rasterize(d,.7)).toDataURL('image/jpeg',.8):undefined,
     onInspection:vision?async data=>{const parts=[];for(const m of data?.materials||[]){const a=c.asset(m.assetID);if(a){const url=await c.modelImage(a,m.cropRect);if(url)parts.push({type:'text',text:m.key+' 的局部预览'},{type:'image_url',image_url:{url}});}}return parts;}:undefined,
     onProgress:progress=>{v.progress=steps+'第 '+progress.turn+' 轮 · '+progress.phase+' · '+progress.seconds+' 秒 · 已接收 '+progress.received+' 字符';const el=document.querySelector(`[data-variant="${v.id}"] .match-progress`);if(el)el.textContent=v.progress;},
     onTurn:async({turn,results,draft})=>{await recorder.turn(turn,results,draft);p.drafts=[structuredClone(draft)];p.activeDraftID=draft.id;steps+='第 '+turn+' 轮\n'+results.map(r=>(r.ok?'✓':'×')+' '+r.detail).join('\n')+'\n';v.progress=steps;await save();update();}
    });
    p.drafts=[output.draft];p.activeDraftID=output.draft.id;if(cfg.generationMode==='direct'&&cfg.directPageOutput==='flattened')await c.flattenResult(p);
    v.status='completed';await archiveCompleted();v.progress+='\n创作完成，已自动保存到草稿；点击方案继续编辑。';
   }catch(error){v.status=run.signal.aborted?'stopped':'failed';v.progress+='\n'+String(error.message||'创作失败').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]')+'。完整步骤已保留。';}
   finally {await recorder?.finish(v.status).catch(()=>{});if(controller===run)controller=null;await save();update();}
  }
 };
}
