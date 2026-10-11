import {localDeviceRecords} from './local-device-records.js';
import {assetSourceRevision} from './material-anatomy.js';
import {usableProjectSnapshot} from './project-outbox-recovery.js';
import {selectJournalReferenceCases,loadJournalReferenceCases} from './journal-reference-catalog.js';
import {loadJournalTemplateReferences} from './journal-template-references.js';
import {prepareMaterialPreviews} from './creative-previews.js';
import {materialAliases} from './material-alias.js';
import {createMatchingCoverCache} from './matching-cover-cache.js';
import {reusePagePreviews} from './preview-content-cache.js';
import {captureMatchingScroll,restoreMatchingScroll} from './matching-scroll.js';
const ID='matching-session-v1';
const KEYS=['basket','coreIDs','excludedAssetIDs','matchCore','matchRatio','matchMode','matchStyle','matchStyles','matchPurposes','matchIntent','matchContentPolicy','matchTextPresentation','matchPurpose','matchProcessing','materialUseHints','materialUseRequired','assetProcessing','customPaperWidth','customPaperHeight'];
export function matchingSnapshot(state,variants){return {id:ID,context:Object.fromEntries(KEYS.map(k=>[k,structuredClone(state[k])])),variants:structuredClone(variants)};}
export function restoreMatchingSession(record,state){
 if(!record)return [];
 for(const key of KEYS)if(record.context?.[key]!==undefined)state[key]=key==='matchProcessing'&&record.context[key]==='AI 自主加工'?'不预设':record.context[key];
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
 const device=c.deviceRecords||localDeviceRecords,account=()=>c.state.accountId||'browser';
 const covers=createMatchingCoverCache(c);
 const defaults=matchingSnapshot(c.state,[]).context;
 const save=()=>{if(!ready)return queue;const task=queue.then(async()=>{const record=matchingSnapshot(c.state,variants),snapshot=JSON.stringify(record);if(snapshot===lastSnapshot)return;await device.put(account(),record);lastSnapshot=snapshot;});queue=task.then(()=>{},()=>{});return task;};
 const archiveCompleted=async(variantID)=>{await queue;for(const v of variants.filter(v=>v.id===variantID&&v.status==='completed'&&!v.linkedProjectID)){if(v.linkedProjectID&&c.state.projects.some(p=>p.id===v.linkedProjectID))continue;const p=variantDraftProject(v,null,v.linkedProjectID||c.uid());v.linkedProjectID=p.id;await c.db.transaction(['projects'],tx=>tx.objectStore('projects').put(p));c.state.projects.push(p);
      try{await device.put(account(),matchingSnapshot(c.state,variants));}
      catch(error){console.warn('完成的作品已存入云端，本机搭配索引暂未保存',error);}}};
 const markup=()=>`<h2>版本方案</h2><p>完成方案自动保存为草稿或快照；“重新搭配”只清空这里的方案，不删除已保存作品。</p><div class="match-variant-grid" data-match-scroll="variants">${variants.map(v=>`<article class="match-variant" data-variant="${c.esc(v.id)}"><button class="match-result" data-act="match-open-result" data-id="${c.esc(v.id)}" ${v.status==='running'?'disabled':''}><div class="match-cover-preview" data-match-raster="${c.esc(v.id)}">${covers.render(v.project)}</div><strong>${c.esc(v.title)}</strong></button><pre class="match-progress" aria-live="polite">${c.esc(v.progress)}</pre>${v.linkedProjectID&&!c.state.projects.some(p=>p.id===v.linkedProjectID)?`<button class="btn" data-act="match-restore" data-id="${c.esc(v.id)}">恢复已删除作品</button>`:''}${v.status==='running'?'<button class="btn" data-act="match-stop">停止创作</button>':v.project.deliveryMode==='zip'?`<button class="btn" data-act="download-project-zip" data-id="${c.esc(v.linkedProjectID||v.project.id)}">下载可编辑 ZIP</button>`:''}</article>`).join('')||'<p>尚未生成方案。</p>'}</div>`;
 const update=()=>{
   if(c.state.route!=='matching')return;
   const el=document.querySelector('.match-previews');
   if(!el)return;
   const root=el.closest('#view')||el.closest('.matching-page')?.parentElement;
   const scroll=root?captureMatchingScroll(root,globalThis.window):null;
   el.innerHTML=markup();
   reusePagePreviews({view:el,state:c.state});
   covers.hydrate(el,variants);
   el.onclick=e=>{
     const b=e.target.closest('[data-act]');
     if(b)c.handle(b.dataset.act,b.dataset.id);
   };
   c.mountIcons?.(el);
   if(root)restoreMatchingScroll(root,scroll,globalThis.window);
 };

 return {
  async restore(){covers.clear();const record=await device.get(account(),ID);for(const key of KEYS)if(defaults[key]!==undefined)c.state[key]=structuredClone(defaults[key]);variants=restoreMatchingSession(record,c.state);lastSnapshot=JSON.stringify(matchingSnapshot(c.state,variants));ready=true;},
  render(){return `<section class="panel match-previews" data-match-scroll="previews">${markup()}</section>`;},
  hydrate(root){covers.hydrate(root,variants);},
  cacheStats:covers.stats,
  persist:save,
  async importProject(p,{alreadyStored=false}={}){
   const verification=p.creationVerification;
   const reviewProgress=p.isSnapshot?'画面图片已导入快照；点击查看，图片不可逐层编辑。':verification?.preview==='mismatch'?'可编辑结构已导入，外部预览或清单有差异；请在拾页核对实际画面和正文。':verification?.preview==='unverified'?'可编辑结构已导入并通过当前规则校验；预览与正文尚待在拾页内复核。':'可编辑结果已导入。返回时保留草稿，保存后成为作品。';
   const v={id:c.uid(),title:p.title,createdAt:new Date().toISOString(),status:'completed',progress:reviewProgress,project:structuredClone(p),linkedProjectID:p.id};
   const task=queue.then(async()=>{
    const next=[v,...variants],record=matchingSnapshot(c.state,next);
    if(!alreadyStored)await c.db.transaction(['projects'],tx=>tx.objectStore('projects').put(p));
    // A device-only matching index must not mask the success of a committed
    // cloud project. Show and retain the real work even if local storage fills.
    try{await device.put(account(),record);lastSnapshot=JSON.stringify(record);}
    catch(error){console.warn('完成作品已保存，搭配页本地索引待恢复',error);}
    variants=next;c.state.projects.push(p);update();return v;
   });
   queue=task.then(()=>{},()=>{});
   return task;
  },
  async reflectProject(p){const v=variants.find(item=>item.linkedProjectID===p?.id);if(!v)return;
    v.project=structuredClone(p);v.title=p.title;
    try{await save();}catch(error){console.warn('云端作品已保存，本机搭配记录待重试',error);}
    update();
  },
  async restoreDeleted(id){
    const v=variants.find(row=>row.id===id);
    if(!v||v.status!=='completed'||!v.linkedProjectID||c.state.projects.some(p=>p.id===v.linkedProjectID))return false;
    const recovered=variantDraftProject(v,null,v.linkedProjectID);
    const trashEntries=(c.state.trash||[]).filter(row=>row.kind==='project'&&row.item?.id===recovered.id);
    await c.db.transaction(['projects','meta','trash'],tx=>{
      tx.objectStore('meta').delete('tombstone:projects:'+recovered.id);
      for(const row of trashEntries)tx.objectStore('trash').delete(row.id);
      tx.objectStore('projects').put(recovered);
    });
    c.state.trash=c.state.trash.filter(row=>!trashEntries.includes(row));
    c.state.projects.push(recovered);
    await save();update();return true;
  },
  stop(){controller?.abort(Error('已停止创作，成功步骤已保留'));},
  async reset(clearContext=()=>{}){const before=matchingSnapshot(c.state,variants),saved=variants;clearContext();variants=[];try{await save();covers.clear();}catch(error){variants=saved;restoreMatchingSession(before,c.state);throw error;}controller?.abort(Error('已重新搭配'));},
  async open(id){const v=variants.find(x=>x.id===id);if(!v||v.status==='running'||opening)return;opening=true;try{await queue;await c.flushSave();const existing=c.state.projects.find(p=>p.id===v.linkedProjectID);if(v.linkedProjectID&&!existing){c.toast('这份作品已被删除，必须主动选择恢复后才能打开');return;}if(v.project.isSnapshot){c.state.previewProjectID=existing?.id||v.project.id;c.route('projectPreview');return;}const p=variantDraftProject(v,existing,c.uid());v.linkedProjectID=p.id;await c.db.transaction(['projects'],tx=>tx.objectStore('projects').put(p));
    await device.put(account(),matchingSnapshot(c.state,variants));
    if(!existing?.isDraft)c.state.projects.push(p);c.state.activeProject=p;c.state.activeDraft=p.activeDraftID;c.state.offlineEditingReturnID=p.offlineBundleId?p.id:null;c.state.selected=null;c.state.undo=[];c.state.redo=[];c.state.tool='select';c.state.zoom=1;c.route('editor');}finally{opening=false;}},
  async generate(){
   if(controller){c.toast('已有方案正在创作，请先停止或等待完成');return;}
   const cfg=structuredClone(c.state.aiSettings);if(cfg.deliveryMode!=='image'&&!cfg.key)throw Error('请先在设置 → AI 与创作中保存 API 密钥');
   const p=c.createProject(),ids=[...p.candidateAssetIDs],aliases=materialAliases(ids),assetsSnapshot=structuredClone(c.state.assets),templatesSnapshot=structuredClone(c.state.userTemplates||[]),findAsset=id=>assetsSnapshot.find(a=>a.id===id);
   const sourceVersions=new Map(ids.map(id=>[id,assetSourceRevision(findAsset(id))]));
   const v={id:c.uid(),title:'方案 '+(variants.length+1),createdAt:new Date().toISOString(),status:'running',progress:'正在准备素材预览…',project:p};variants.unshift(v);const run=new AbortController();controller=run;let recorder,checkpointFailed=false;
   const accountID=c.state.accountId;
   const ensureAccount=()=>{if(run.signal.aborted)throw run.signal.reason||Error('创作已停止');if(c.state.accountId!==accountID)throw Error('账号已变化，未把生成内容保存到另一个账号');for(const [id,version] of sourceVersions){const current=c.state.assets.find(a=>a.id===id);if(!current||assetSourceRevision(current)!==version)throw Error('创作期间素材来源或标定已变化；已停止提交旧条件的结果');}};
   update();
   try {
    await save();ensureAccount();
    if(cfg.deliveryMode==='image'){
     const referenceImages=cfg.sendPresetReferences?(await loadJournalTemplateReferences({context:{styles:p.styles,purposes:p.purposes,materials:assetsSnapshot.filter(asset=>ids.includes(asset.id))},userTemplates:templatesSnapshot,db:c.db})).referenceImages:[];
     const blob=await c.generatePageImage({settings:cfg,project:p,draft:p.drafts[0],assets:assetsSnapshot,ids,theme:p.intent||'',createImage:c.modelImage,referenceImages,userTemplates:templatesSnapshot,signal:run.signal,onProgress:message=>{v.progress=message;const el=document.querySelector(`[data-variant="${v.id}"] .match-progress`);if(el)el.textContent=message;}});
     ensureAccount();const snapshot=await c.saveGeneratedImageSnapshot(blob,p);v.project=snapshot;v.linkedProjectID=snapshot.id;v.status='completed';v.progress='GPT 直接生成的图片已保存到画面快照；点击查看。';return;
    }
    recorder=await c.createAIRecorder({db:c.db,model:cfg.model,key:cfg.key,accountId:c.state.accountId||'browser'});const vision=cfg.includeThumbnails&&c.supportsVision(cfg);
    const images=vision?await prepareMaterialPreviews(ids,{findAsset,createImage:async(...args)=>{ensureAccount();return c.modelImage(...args);}}):[];
    const references=[];if(cfg.sendPresetReferences&&c.supportsVision(cfg))references.push(...(await loadJournalTemplateReferences({context:{styles:p.styles,purposes:p.purposes,materials:assetsSnapshot.filter(asset=>ids.includes(asset.id))},userTemplates:templatesSnapshot,db:c.db})).referenceImages);
    ensureAccount();
    let steps='';const output=await c.runCreativeAgent({...cfg,draft:p.drafts[0],assets:assetsSnapshot,aliases,styles:p.styles,pagePurposes:p.purposes,contentPolicy:p.contentPolicy||'documentary',userText:p.userText||'',providedFacts:p.providedFacts||'',requiredAssetIDs:p.requiredAssetIDs,materialPriority:p.materialPriority,processing:p.processing,assetProcessing:p.assetProcessing,materialUseHints:p.materialUseHints,materialUseRequired:p.materialUseRequired,prompt:p.intent||'',images,referenceImages:references,userTemplates:templatesSnapshot,request:recorder.request,signal:run.signal,
     onResponse:recorder.response,
     onScene:vision?async d=>{ensureAccount();return (await c.rasterize(d,.7)).toDataURL('image/jpeg',.8);}:undefined,
     onFinalScene:async d=>{ensureAccount();return (await c.rasterize(d,Math.min(1.6,2000/Math.max(d.canvas.width,d.canvas.height)))).toDataURL('image/jpeg',.88);},
     onInspection:vision?async data=>{ensureAccount();const parts=[];for(const m of data?.materials||[]){const a=findAsset(m.assetID);if(a){const url=await c.modelImage(a,m.cropRect);if(url)parts.push({type:'text',text:m.key+' 的局部预览'},{type:'image_url',image_url:{url}});}}return parts;}:undefined,
     onProgress:progress=>{v.progress=steps+'请求 '+progress.budget.totalRequests+'/'+progress.budget.limit+'（创作 '+progress.budget.creationRequests+'、格式修复 '+progress.budget.formatRepairRequests+'） · '+progress.phase+' · '+progress.seconds+' 秒 · 已接收 '+progress.received+' 字符';const el=document.querySelector(`[data-variant="${v.id}"] .match-progress`);if(el)el.textContent=v.progress;},
     onTurn:async({turn,results,draft})=>{
      ensureAccount();p.drafts=[structuredClone(draft)];p.activeDraftID=draft.id;
      steps+='第 '+turn+' 轮\n'+results.map(r=>(r.ok?'✓':'×')+' '+r.detail).join('\n')+'\n';v.progress=steps;
      try{await save();}catch(error){checkpointFailed=true;throw error;}
      update();
      // Diagnostics are optional. A failed log must not discard a successful
      // scene or trigger a replay of already committed material operations.
      try{await recorder.turn(turn,results,draft);}catch{v.progress+='\n诊断记录未保存；本轮画面已可靠暂存。';update();}
     }
    });
    ensureAccount();p.drafts=[output.draft];p.activeDraftID=output.draft.id;p.aiGenerated=true;p.deliveryMode=cfg.deliveryMode;
    if(['image','pdf'].includes(cfg.deliveryMode)){const snapshot=await c.saveSnapshotFromDraft(p,{format:cfg.deliveryMode==='pdf'?'application/pdf':'image/png'});v.project=snapshot;v.linkedProjectID=snapshot.id;v.progress+='\n创作完成，已保存为不可编辑快照；点击查看。';}
    else{v.status='completed';await archiveCompleted(v.id);v.progress+='\n结构已完成，已自动保存到草稿。'+(output.draft.agentRun?.visualReview==='model-reviewed'?'GPT 已看过最终画面；这不是人工审美验收。':'最终视觉尚未完成复核。')+'点击方案继续编辑。';}
    v.status='completed';
   }catch(error){v.status=run.signal.aborted?'stopped':'failed';v.progress+='\n'+String(error.message||'创作失败').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]')+(checkpointFailed?'。本轮暂存失败，画面仍在当前页面；暂勿关闭。':'。已暂存的完整步骤仍保留。');}
   finally {
    if(c.state.accountId===accountID)await recorder?.finish(v.status).catch(()=>{});
    if(controller===run)controller=null;
    if(c.state.accountId===accountID){await save();update();}
   }
  }
 };
}
