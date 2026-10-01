import {usableProjectSnapshot} from './project-outbox-recovery.js';
import {presetReferencePlans,renderPresetReferences} from './creative-reference-presets.js';
import {prepareMaterialPreviews} from './creative-previews.js';
import {materialAliases} from './material-alias.js';
const ID='matching-session-v1';
const KEYS=['basket','coreIDs','excludedAssetIDs','matchCore','matchRatio','matchMode','matchStyle','matchStyles','matchPurposes','matchIntent','matchPurpose','matchProcessing','materialUseHints','materialUseRequired','assetProcessing','customPaperWidth','customPaperHeight'];
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
 const markup=()=>`<h2>版本方案</h2><p>完成方案自动保存为草稿或快照；“重新搭配”只清空这里的方案，不删除已保存作品。</p><div class="match-variant-grid">${variants.map(v=>`<article class="match-variant" data-variant="${c.esc(v.id)}"><button class="match-result" data-act="match-open-result" data-id="${c.esc(v.id)}" ${v.status==='running'?'disabled':''}>${c.workCover(v.project)}<strong>${c.esc(v.title)}</strong></button><pre class="match-progress" aria-live="polite">${c.esc(v.progress)}</pre>${v.status==='running'?'<button class="btn" data-act="match-stop">停止创作</button>':v.project.deliveryMode==='zip'?`<button class="btn" data-act="download-project-zip" data-id="${c.esc(v.linkedProjectID||v.project.id)}">下载可编辑 ZIP</button>`:''}</article>`).join('')||'<p>尚未生成方案。</p>'}</div>`;
 const update=()=>{if(c.state.route!=='matching')return;const el=document.querySelector('.match-previews');if(el){el.innerHTML=markup();el.onclick=e=>{const b=e.target.closest('[data-act]');if(b)c.handle(b.dataset.act,b.dataset.id);};c.mountIcons?.(el);}};
 return {
  async restore({archive=true}={}){const record=await c.db.get('meta',ID);for(const key of KEYS)if(defaults[key]!==undefined)c.state[key]=structuredClone(defaults[key]);variants=restoreMatchingSession(record,c.state);if(archive)await archiveCompleted();lastSnapshot=JSON.stringify(matchingSnapshot(c.state,variants));ready=true;},
  render(){return `<section class="panel match-previews">${markup()}</section>`;},
  persist:save,
  async importProject(p){
   const v={id:c.uid(),title:p.title,createdAt:new Date().toISOString(),status:'completed',progress:p.creationVerification?.preview==='unverified'?'可编辑结构已导入并通过当前规则校验；预览与正文尚待在拾页内复核。返回时保留草稿，保存后成为作品。':'可编辑结果已导入；返回时保留草稿，保存后成为作品。',project:structuredClone(p),linkedProjectID:p.id};
   variants.unshift(v);
   try{await queue;await c.db.transaction(['projects','meta'],tx=>{tx.objectStore('projects').put(p);tx.objectStore('meta').put(matchingSnapshot(c.state,variants));});lastSnapshot=JSON.stringify(matchingSnapshot(c.state,variants));c.state.projects.push(p);update();return v;}
   catch(error){variants.shift();throw error;}
  },
  async reflectProject(p){const v=variants.find(item=>item.linkedProjectID===p?.id);if(!v)return;v.project=structuredClone(p);v.title=p.title;await save();update();},
  stop(){controller?.abort(Error('已停止创作，成功步骤已保留'));},
  async reset(clearContext=()=>{}){await archiveCompleted();const before=matchingSnapshot(c.state,variants),saved=variants;clearContext();variants=[];try{await save();}catch(error){variants=saved;restoreMatchingSession(before,c.state);throw error;}controller?.abort(Error('已重新搭配'));},
  async open(id){const v=variants.find(x=>x.id===id);if(!v||v.status==='running'||opening)return;opening=true;try{await queue;await c.flushSave();const existing=c.state.projects.find(p=>p.id===v.linkedProjectID);if(v.project.isSnapshot){c.state.previewProjectID=existing?.id||v.project.id;c.route('projectPreview');return;}const p=variantDraftProject(v,existing,c.uid());v.linkedProjectID=p.id;await c.db.transaction(['projects','meta'],tx=>{tx.objectStore('projects').put(p);tx.objectStore('meta').put(matchingSnapshot(c.state,variants));});if(!existing?.isDraft)c.state.projects.push(p);c.state.activeProject=p;c.state.activeDraft=p.activeDraftID;c.state.offlineEditingReturnID=p.offlineBundleId?p.id:null;c.state.selected=null;c.state.undo=[];c.state.redo=[];c.state.tool='select';c.state.zoom=1;c.route('editor');}finally{opening=false;}},
  async generate(){
   if(controller){c.toast('已有方案正在创作，请先停止或等待完成');return;}
   const cfg=structuredClone(c.state.aiSettings);if(cfg.deliveryMode!=='image'&&!cfg.key)throw Error('请先在设置 → AI 与创作中保存 API 密钥');
   const p=c.createProject(),ids=p.candidateAssetIDs,aliases=materialAliases(ids);
   const v={id:c.uid(),title:'方案 '+(variants.length+1),createdAt:new Date().toISOString(),status:'running',progress:'正在准备素材预览…',project:p};variants.unshift(v);const run=new AbortController();controller=run;let recorder;
   update();
   try {
    await save();
    if(cfg.deliveryMode==='image'){
     const blob=await c.generatePageImage({settings:cfg,project:p,draft:p.drafts[0],assets:c.state.assets,ids,theme:c.state.matchIntent,createImage:c.modelImage,signal:run.signal,onProgress:message=>{v.progress=message;const el=document.querySelector(`[data-variant="${v.id}"] .match-progress`);if(el)el.textContent=message;}});
     const snapshot=await c.saveGeneratedImageSnapshot(blob,p);v.project=snapshot;v.linkedProjectID=snapshot.id;v.status='completed';v.progress='GPT 直接生成的图片已保存到画面快照；点击查看。';return;
    }
    recorder=await c.createAIRecorder({db:c.db,model:cfg.model,key:cfg.key});const vision=cfg.includeThumbnails&&c.supportsVision(cfg);
    const images=vision?await prepareMaterialPreviews(ids,{findAsset:c.asset,createImage:c.modelImage}):[];
    const references=[];if(cfg.sendPresetReferences&&c.supportsVision(cfg))references.push(...(await renderPresetReferences(presetReferencePlans({styles:p.styles,purposes:p.purposes,mode:p.drafts[0].pageMode}))).map(entry=>entry.url));
    let steps='';const output=await c.runCreativeAgent({...cfg,draft:p.drafts[0],assets:c.state.assets,aliases,styles:p.styles,pagePurposes:p.purposes,requiredAssetIDs:p.requiredAssetIDs,materialPriority:p.materialPriority,processing:p.processing,assetProcessing:p.assetProcessing,materialUseHints:p.materialUseHints,materialUseRequired:p.materialUseRequired,prompt:c.state.matchIntent,images,referenceImages:references,request:recorder.request,signal:run.signal,
     onResponse:recorder.response,
     onScene:vision?async d=>(await c.rasterize(d,.7)).toDataURL('image/jpeg',.8):undefined,
     onInspection:vision?async data=>{const parts=[];for(const m of data?.materials||[]){const a=c.asset(m.assetID);if(a){const url=await c.modelImage(a,m.cropRect);if(url)parts.push({type:'text',text:m.key+' 的局部预览'},{type:'image_url',image_url:{url}});}}return parts;}:undefined,
     onProgress:progress=>{v.progress=steps+'第 '+progress.turn+' 轮 · '+progress.phase+' · '+progress.seconds+' 秒 · 已接收 '+progress.received+' 字符';const el=document.querySelector(`[data-variant="${v.id}"] .match-progress`);if(el)el.textContent=v.progress;},
     onTurn:async({turn,results,draft})=>{await recorder.turn(turn,results,draft);p.drafts=[structuredClone(draft)];p.activeDraftID=draft.id;steps+='第 '+turn+' 轮\n'+results.map(r=>(r.ok?'✓':'×')+' '+r.detail).join('\n')+'\n';v.progress=steps;await save();update();}
    });
    p.drafts=[output.draft];p.activeDraftID=output.draft.id;p.aiGenerated=true;p.deliveryMode=cfg.deliveryMode;
    if(['image','pdf'].includes(cfg.deliveryMode)){const snapshot=await c.saveSnapshotFromDraft(p,{format:cfg.deliveryMode==='pdf'?'application/pdf':'image/png'});v.project=snapshot;v.linkedProjectID=snapshot.id;v.progress+='\n创作完成，已保存为不可编辑快照；点击查看。';}
    else{v.status='completed';await archiveCompleted();v.progress+='\n创作完成，已自动保存到草稿；点击方案继续编辑。';}
    v.status='completed';
   }catch(error){v.status=run.signal.aborted?'stopped':'failed';v.progress+='\n'+String(error.message||'创作失败').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]')+'。完整步骤已保留。';}
   finally {await recorder?.finish(v.status).catch(()=>{});if(controller===run)controller=null;await save();update();}
  }
 };
}
