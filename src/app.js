// Production deployment refresh marker: 2026-10-04
import {assetSourceRevision} from './material-anatomy.js';
import {renderSceneCanvas,decodeSceneImage} from './scene-renderer.js';
import {sceneRenderEntries,projectMaterialViews} from './craft-display.js';
import './styles.css';
import './overrides.css';
import './parity.css';
import './mobile-ai.css';
import './responsive.css';
import './swift-controls.css';
import './icons.css';
import './asset-organization.css';
import './sync-indicator.css';
import './offline-handoff.css';
import './matching-view.css';
import {createAssetOrganization,mountOrganizationBadges,updateOrganizedAssetView} from './asset-organization.js';
import '@fontsource/ma-shan-zheng/chinese-simplified-400.css';
import {mountIcons,iconMarkup} from './icons.js';
import {startCloudSession} from './entry.js';
import {cloudEnabled,requireCloudUser} from './cloud-session.js';
import {createSyncResumer} from './sync-resumer.js';
import {setCloudProjectPreview} from './cloud-store.js';
import {snapshotDraft} from './draft-snapshot.js';
import {reconcileCanvasText,textParagraphMarkup} from './canvas-text-content.js';
import {ensureEditorHistory,resetEditorHistory,takeEditorHistoryStep} from './editor-history-scope.js';
import {captureHistory} from './project-history.js';
import {mountCanvasEditor} from './canvas-editor-ui.js';
import {closePopover} from './swift-popover.js';
import {drawPaper} from './paper-rendering.js';
import {shapeSVG,drawInk,textFont,textFontFamily,textLineHeight,textLines} from './editor-tools-model.js';
import {shapeTag} from './shape-preview.js';
import {ImageNodeCache} from './image-node-cache.js';
import {imagePlaceholder,mountPrivateImages} from './lazy-private-images.js';
import {showAssetEditor} from './asset-editor.js';
import {createAIRecorder,publicAIDiagnosticReport} from './ai-diagnostics.js';
import {mountImportBoxEditor} from './import-box-editor.js';
import {saveImportBatch,importPaperDimensions} from './import-save.js';
import {paperDimensions as presetPaperDimensions,paperSizeOptions} from './paper-sizes.js';
import {refineManualBoxes} from './manual-import-recognition.js';
import {seriesCovers,usedAssetIDs,markProjectAssetsUsed} from './library-model.js';
import {renderSeriesContents} from './series-contents.js';
import {showSeriesEditor} from './series-editor.js';
import {mountWorkflowControls} from './workflow-ui.js';
import {renderImportInspection,renderImportReview} from './import-workspace-ui.js';
import {showCutoutEditor} from './cutout-editor.js';
import {mountCanvasSelection} from './canvas-selection-ui.js';
import * as db from './store.js';
import {loadPreferences,savePreferences} from './preferences.js';
import {uid,canvasSize,draft,project,itemFromAsset,physicalPlacement,validatePhysicalDraft,textBlock,primitive,setDraftPaperSize} from './domain.js';
import {detectPaperCandidates,cropBitmap,alignMaterialPreview} from './image.js';
import {visionTask,prewarmVision} from './vision-runtime.js';
import {recognitionOptions,recognitionPixelOptions,recognitionMethodDetails,recognitionProfile} from './recognition-profiles.js';
import {classifyRecord} from './classification.js';
import {mountPaperCorrection,resetPaperCorrection} from './paper-ui.js';
import {rectifyA4,suggestPaperCorners} from './perspective.js';
import {syncCurrentMaterials} from './current-materials.js';
import {syncCurrentExamples} from './current-examples.js';
import {applyToolCalls} from './creative.js';
import {createOfflineHandoff,inspectEditableSource,inspectOfflinePackage,verifyOfflineTaskPackage,importEditableWork,importEditableWorkPackageReviewed} from './offline-creation.js';
import {offlineTaskStore} from './offline-task-store.js';
import {offlinePreviewBytes as encodeOfflinePreview} from './offline-preview.js';
import {buildMaterialScope} from './matching-materials.js';
import {matchingRecommendations,renderMatchingPage} from './matching-view.js';
import {selectJournalReferenceCases,loadJournalReferenceCases} from './journal-reference-catalog.js';
import {loadJournalTemplateReferences} from './journal-template-references.js';
import {clearJournalPresetImages} from './journal-preset-images.js';
import {changeTrash,expiredTrash} from './trash-actions.js';
// AI agent planning and visual review are paid, optional workflows. Load them only on demand.
const runCreativeAgent=async(...args)=>(await import('./creative-runner.js')).runCreativeAgent(...args);
import {commitAIDraft} from './ai-run-target.js';
import {prepareMaterialPreviews} from './creative-previews.js';
import {materialAliases} from './material-alias.js';
import {snapshotRecord,workInTab} from './work-collections.js';
import {generatePageImage,IMAGE_MODELS} from './ai-image-generation.js';
import {materialMaskCSS,clipMaterial} from './material-mask.js';
import {manualLayoutChoices,applyManualLayout} from './manual-layout-templates.js';
import {pagePDF,canvasPDFPage} from './pdf-export.js';
import {createNativeProjectPackage} from './native-project-package.js';
import {applyCatalogPage,resetCatalogPage} from './catalog-pagination.js';
import {AI_PROVIDERS,supportsVision,loadAISettings,saveAISettings} from './ai-settings.js';
import {DELIVERY_OPTIONS,deliveryProfile} from './ai-delivery.js';
import {mountParityControls as mountSwiftParity} from './parity-ui.js';
import {parity} from './parity-ui.js';
import {journalTemplateRecords} from './journal-template-ui.js';
import {clearJournalTemplateImages} from './journal-template-ui.js';
import {syncSelectionScope,reconcileSelectedRecords} from './library-selection-model.js';
import {canApplyBackgroundView} from './view-update-policy.js';
import {resetSelectionPresenters} from './selection-presenter.js';

import {installRuntimeDiagnostics} from './runtime-diagnostics.js';
const view=document.querySelector('#view'),modal=document.querySelector('#modal'),body=document.querySelector('#modal-body');
modal.querySelector('.modal-close').onclick=()=>modal.close();
const fileInput=document.querySelector('#file-input'),workFileInput=document.querySelector('#work-file-input'),snapshotFileInput=document.querySelector('#snapshot-file-input'),backupInput=document.querySelector('#backup-input'),emergencyInput=document.querySelector('#emergency-input');
let offlineSnapshotProject=null;
installRuntimeDiagnostics(()=>state.route);
const state={route:'series',assets:[],series:[],projects:[],trash:[],userTemplates:[],basket:[],excludedAssetIDs:[],history:[],selected:null,activeProject:null,activeDraft:null,offlineEditingReturnID:null,detailAssetID:null,previewProjectID:null,settingsSection:null,selfHosted:false,aiSettings:loadAISettings(),preferences:loadPreferences(),aiPanel:false,aiBusy:false,aiPrompt:'',aiProgress:'',tool:'select',zoom:1,sort:'newest',query:'',kind:'all',status:'all',seriesID:'all',matchCore:null,matchRatio:'a4',matchMode:'single',matchStyle:'韩系清新',matchStyles:['韩系清新'],matchPurposes:['日常记录'],matchIntent:'',matchContentPolicy:'documentary',matchUserText:'',matchFacts:'',matchPurpose:'日常记录',matchProcessing:'不预设',materialUseHints:{},materialUseRequired:{},assetProcessing:{},customPaperWidth:210,customPaperHeight:297,recommendFilter:'全部',coreIDs:[],importStep:'inspect',importRecords:[],importIndex:0,importFile:null,importBitmap:null,importBox:{x:0,y:0,w:1,h:1},importCandidate:null,importRemoveWhite:false,undo:[],redo:[],drawing:false};
// Safari's native page pinch must not compete with the editor's bounded canvas zoom.
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,event=>event.preventDefault(),{passive:false});
const urls=new Map(),staticSources=new Map();
const assetOrganization=createAssetOrganization();
mountOrganizationBadges(view,assetOrganization);
const imageNodes=new ImageNodeCache();
const libraryHistory=[];
function openLibraryAsset(id){libraryHistory.push({route:state.route,seriesID:state.seriesID,detailAssetID:state.detailAssetID});state.detailAssetID=id;route('assetDetail');}
function libraryBack(){const previous=libraryHistory.pop();if(!previous){navigateBack('series');return;}navigationHistory.pop();state.seriesID=previous.seriesID;state.detailAssetID=previous.detailAssetID;route(previous.route,{back:true});}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=s=>{const el=document.querySelector('#toast');el.textContent=s;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3500);};
const saveStatus=s=>{const label=cloudEnabled?({'已保存到本机':'已保存到云端','本机存储':'云端存储'}[s]||s):s;document.querySelector('#save-state').textContent=label;for(const el of document.querySelectorAll('.swift-auto-saved'))el.textContent=label;};
const syncDisplay={pending:0,error:null,checking:true,localPending:false};
function updateSyncIndicator(){
  if(!cloudEnabled)return;
  const conflict=/云端版本已变化|另一设备已更新|conflict/i.test(syncDisplay.error?.message||'');
  const status=conflict?'conflict':syncDisplay.error?'error':navigator.onLine===false&&syncDisplay.pending?'offline':syncDisplay.checking?'checking':syncDisplay.pending||syncDisplay.localPending?'uploading':'synced';
  const label={conflict:'同步冲突',error:'待重试',offline:'待联网',checking:'核对中',uploading:'上传中',synced:'已同步'}[status];
  for(const button of document.querySelectorAll('.sync-indicator')){button.hidden=false;button.dataset.status=status;button.title=conflict?'其他设备修改了同一资料；本机待传内容仍保留，请先检查其他设备':syncDisplay.error?'上传未完成；点击重试：'+syncDisplay.error.message:label;button.setAttribute('aria-label',label);button.querySelector('.sync-indicator-label').textContent=label;}
}
function mountPageSyncIndicator(){
  if(!cloudEnabled)return;
  const target=state.route==='editor'?view.querySelector('.swift-editor-head .actions'):state.route==='import'?view.querySelector('.import-nav'):null;
  if(target){const button=document.querySelector('#sync-indicator').cloneNode(true);button.removeAttribute('id');button.dataset.syncIndicator='';button.onclick=()=>void openSyncDetails();target.append(button);}
  updateSyncIndicator();
}
const recognitionPreprocessOptions=()=>({
  illumination:state.balanceLight===true,
  denoise:state.preferences.recognitionDenoise===true,
  localContrast:state.preferences.recognitionLocalContrast===true,
  chromaEdges:state.preferences.recognitionChromaEdges!==false
});
const recognitionPostprocessOptions=()=>({
  shapeRegularization:state.preferences.recognitionShapeRegularization!==false,
  apertures:state.preferences.recognitionApertures!==false
});
const asset=id=>state.assets.find(x=>x.id===id)||state.trash.find(t=>t.kind==='asset'&&t.item.id===id)?.item;
const image=id=>urls.get(id)||staticSources.get(id)||state.trash.find(t=>t.kind==='asset'&&t.item.blobId===id)?.item.staticPath||imagePlaceholder(id);
const privateImages=mountPrivateImages({root:document.body,db,urls,fullView:()=>['editor','assetDetail','projectPreview'].includes(state.route)});
let settingsSession=null;
function captureSettings(){
  if(state.route!=='settings')return;
  if(view.querySelector('#setting-ai-provider'))state.aiSettings=readAIForm();
  if(view.querySelector('#setting-paper-size'))state.preferences={...state.preferences,recognition:view.querySelector('#setting-recognition').value,recognitionPixels:Number(view.querySelector('#setting-recognition-pixels').value),balanceLight:view.querySelector('#setting-preprocess-light').checked,recognitionDenoise:view.querySelector('#setting-preprocess-denoise').checked,recognitionLocalContrast:view.querySelector('#setting-preprocess-contrast').checked,recognitionChromaEdges:view.querySelector('#setting-preprocess-chroma').checked,recognitionShapeRegularization:view.querySelector('#setting-postprocess-shapes').checked,recognitionApertures:view.querySelector('#setting-postprocess-apertures').checked,paperSize:view.querySelector('#setting-paper-size').value,orientation:view.querySelector('#setting-orientation').value,wholePaper:view.querySelector('#setting-whole-paper').checked,autoOrganize:view.querySelector('#setting-auto-organize').checked};
  if(view.querySelector('#setting-display'))state.preferences={...state.preferences,display:view.querySelector('#setting-display').value,backdrop:view.querySelector('#setting-backdrop').value,maxPageItems:Number(view.querySelector('#setting-page-items').value)};
}
const routeScroll=new Map();
let viewInteractionRevision=0;
for(const event of ['click','input','pointerdown'])view.addEventListener(event,()=>viewInteractionRevision++,true);
let backgroundViewPending=false,backgroundViewTimer=null;
const activeViewPointers=new Set();
view.addEventListener('pointerdown',event=>activeViewPointers.add(event.pointerId),true);
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,e=>{activeViewPointers.delete(e.pointerId);scheduleBackgroundReconcile();},true);
function scheduleBackgroundReconcile(){
  if(!backgroundViewPending||backgroundViewTimer)return;
  backgroundViewTimer=setTimeout(()=>{
    backgroundViewTimer=null;
    const inputFocused=view.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select,[contenteditable],[contenteditable="true"]');
    if(canApplyBackgroundView({route:state.route,selectionMode:parity.selectionMode,modalOpen:modal.open,popoverOpen:!!document.querySelector('.swift-popover'),inputFocused,gestureActive:!!activeViewPointers.size}))render();
  },180);
}
document.addEventListener('click',scheduleBackgroundReconcile);
document.addEventListener('focusout',scheduleBackgroundReconcile);
modal.addEventListener('close',scheduleBackgroundReconcile);
const navigationHistory=[];
function navigateBack(fallback='series'){
  const previous=navigationHistory.pop();
  if(!previous){route(fallback,{back:true});return;}
  Object.assign(state,{seriesID:previous.seriesID,detailAssetID:previous.detailAssetID,previewProjectID:previous.previewProjectID});
  route(previous.route,{back:true});
}
let editorOpenSequence=0;
function route(name,{back=false}={}){
  editorOpenSequence++;
  viewInteractionRevision++;
  const fromSettings=state.route==='settings';
  if(!back&&!fromSettings&&name!=='settings'&&name!==state.route)navigationHistory.push({route:state.route,seriesID:state.seriesID,detailAssetID:state.detailAssetID,previewProjectID:state.previewProjectID});
  if(state.route==='editor'&&name!=='editor')view.endTextEditing?.();
  routeScroll.set(state.route+':'+state.seriesID,window.scrollY);
  if(name==='settings'&&!settingsSession)settingsSession={ai:structuredClone(state.aiSettings),preferences:structuredClone(state.preferences),returnRoute:state.route};
  if(state.route==='settings'&&name!=='settings'&&settingsSession){state.aiSettings=settingsSession.ai;state.preferences=settingsSession.preferences;settingsSession=null;state.settingsSection=null;}
if(state.route==='editor'&&name!=='editor'&&aiController)aiController.abort(Error('已离开创作页面'));syncSelectionScope(parity,name);state.route=name;if(name==='import'&&typeof Worker!=='undefined')void prewarmVision().catch(()=>{});if(name==='series'){state.seriesID='all';state.addingToSeries=null;libraryHistory.length=0;}if(name!=='library')state.addingToSeries=null;if(name!=='settings'&&!fromSettings)state.selected=null;render();window.scrollTo(0,routeScroll.get(name+':'+state.seriesID)||0);}
function imgTag(a){const src=a&&(image(a.blobId)||a.staticPath);return src?`<img data-asset-image-id="${esc(a.id)}" loading="lazy" decoding="async" src="${esc(src)}" alt="${esc(a.title)}">`:'<span>无预览</span>';}
function assetCard(a){return `<button class="card" data-act="detail" data-id="${a.id}"><div class="card-image">${imgTag(a)}</div><div class="card-body"><h3>${esc(a.title)}${a.isFavorite?'<span class="card-favorite" aria-label="已收藏">♥</span>':''}</h3><p>${esc(kindName(a.kind))} · ${a.physicalWidthMM?`${fmt(a.physicalWidthMM)} × ${fmt(a.physicalHeightMM)} mm`:'尺寸待确认'}</p><span class="chip ${a.reviewStatus==='ready'?'':'warn'}">${a.reviewStatus==='ready'?'已整理':'待检查'}</span></div></button>`;}
const fmt=n=>Number(n).toFixed(1).replace(/\.0$/,'');
function head(title,subtitle,actions=''){return `<div class="view-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></div>`;}
function render(){document.body.classList.toggle('editing',state.route==='editor');document.body.dataset.backdrop=state.preferences.backdrop;document.querySelectorAll('.main-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===state.route||(b.dataset.route==='library'&&['series','import'].includes(state.route))));document.querySelector('#basket-count').textContent=state.basket.length;
  if(state.route==='editor'&&refreshCanvas())return;
  view.editorDispose?.();view.editorDispose=null;view.manualBoxDispose?.();view.manualBoxDispose=null;view.editorRefresh=null;view.catalogRefresh=null;resetSelectionPresenters(view);
  if(view.onshowsimilar){view.removeEventListener('show-similar',view.onshowsimilar);view.onshowsimilar=null;}
  closePopover();imageNodes.remember(view.querySelectorAll('img[src]'));
  view.editorLayoutSize={width:window.innerWidth,height:window.innerHeight};
  const pages={library:renderLibrary,series:renderSeries,matching:renderMatching,works:renderWorks,editor:renderEditor,import:renderImport,assetDetail:renderAssetDetail,projectPreview:renderProjectPreview,settings:renderSettings};view.innerHTML=(pages[state.route]||renderLibrary)();
  for(const fresh of view.querySelectorAll('img[src]')){const old=imageNodes.take(fresh);if(old)fresh.replaceWith(old);}
  mountParityControls();bindPage();mountWorkflowControls({state,view,body,modal,db,render,route,toast,imgTag,assetCard,esc,asset,refresh,download,modelImage,rasterize,backup,openSeriesEditor,openAssetEditor:openDetail,openCutoutCheck,switchImportRecord,saveActiveImportRecord,saveProject,flushSave,assetOrganization,applyAssetClassification});view.catalogRefresh?.();if(state.route==='editor'){view.editorDraft=current();view.editorInk=current().strokes;view.editorLayoutKey=editorLayoutKey();mountCanvasEditor({state,view,body,modal,current,checkpoint,saveProject,render,route,flushSave,toast,esc,imgTag,asset,handle,openCutoutCheck,openAICreation});mountCanvasSelection({state,view,current,checkpoint,saveProject,render,toast});}mountPageSyncIndicator();backgroundViewPending=false;}
function editorLayoutKey(){const size=view.editorLayoutSize||{width:window.innerWidth,height:window.innerHeight};return [size.width,size.height,current()?.canvas.width,current()?.canvas.height,!!state.workspacePanel,!!state.aiPanel].join(':');}
function refreshCanvas(){
  const d=current(),page=view.querySelector('#canvas-page');if(!page||view.editorDraft!==d||view.editorLayoutKey!==editorLayoutKey()||!view.editorRefresh)return false;
  const scale=page.clientWidth/d.canvas.width,entries=editorEntry(d,true),ids=new Set(entries.map(e=>e.value.renderKey||e.value.id));
  page.querySelectorAll('[data-object]').forEach(node=>{if(!ids.has(node.dataset.renderKey||node.dataset.object))node.remove();});
  for(const entry of entries){const template=document.createElement('template');template.innerHTML=renderCanvasObject(entry,scale);const next=template.content.firstElementChild;let node=[...page.children].find(n=>(n.dataset.renderKey||n.dataset.object)===(entry.value.renderKey||entry.value.id));
    if(!node){page.insertBefore(next,page.querySelector('.paper-layer'));continue;}
    node.style.cssText=next.style.cssText;node.className=next.className;
    if(entry.kind==='text')reconcileCanvasText(node,next);
    else if(entry.kind==='shape'){const preview=node.querySelector('.shape-preview,svg'),fresh=next.querySelector('.shape-preview');if(preview?.getAttribute('src')!==fresh?.getAttribute('src')){if(preview)preview.replaceWith(fresh);else if(fresh)node.prepend(fresh);}}
    else {let im=node.querySelector('img');const fresh=next.querySelector('img');if(im?.getAttribute('src')!==fresh?.getAttribute('src')){im?.remove();if(fresh)node.prepend(fresh);im=fresh;}const crop=entry.value.cropRect;if(im)im.style.cssText=crop?`position:absolute;max-width:none;width:${100/crop.width}%;height:${100/crop.height}%;left:${-crop.x/crop.width*100}%;top:${-crop.y/crop.height*100}%;object-fit:fill`:'';}
  }
  const paperKey=JSON.stringify([d.paperColor,d.paperPattern,d.paperRuling,d.drawCenterGutter]);if(page.dataset.paperKey!==paperKey){drawPaper(page.querySelector('.paper-layer').getContext('2d'),d);page.dataset.paperKey=paperKey;page.style.backgroundColor=d.paperColor;}
  for(const pattern of ['plain','grid','lines','dots','columns'])page.classList.toggle(pattern,d.paperPattern===pattern);
  if(view.editorInk!==d.strokes){const ink=page.querySelector('#ink'),ctx=ink.getContext('2d');ctx.clearRect(0,0,ink.width,ink.height);drawInk(ctx,d.strokes||[]);view.editorInk=d.strokes;}
  const start=view.querySelector('#ai-start'),stop=view.querySelector('#ai-stop'),progress=view.querySelector('#ai-progress'),report=view.querySelector('#ai-report');if(start){start.disabled=!!state.aiBusy;start.textContent=state.aiBusy?'创作中…':'开始创作';}if(stop)stop.disabled=!state.aiBusy;if(progress)progress.textContent=state.aiProgress||'';if(report)report.disabled=!aiReport;
  view.editorRefresh();view.canvasSelectionRefresh?.();return true;
}
function mountParityControls(){mountSwiftParity({libraryBack,openLibraryAsset,openAssetEditor:openDetail,state,view,body,modal,db,render,route,toast,asset,imgTag,workCover,createFromBasket,openAICreation,openSeriesEditor,current,checkpoint,saveProject,flushSave,uid,handle,esc,matchingSession});}
function renderLibrary(){if(state.series.some(s=>s.id===state.seriesID))return renderSeriesContents({state,esc,imgTag,assetCard});const items=state.assets.filter(a=>!a.isProjectInternal).sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0));
  return head('我的素材','把喜欢的，收进系列。')+`<div class="filters"><input id="search" type="search" placeholder="搜索名称、标签、颜色或主题" value="${esc(state.query)}" aria-label="搜索素材"><select id="kind-filter"><option value="all">全部类型</option>${['sticker','paper','tape','photo','text','reference'].map(k=>`<option value="${k}" ${state.kind===k?'selected':''}>${kindName(k)}</option>`).join('')}</select><select id="status-filter"><option value="all">全部状态</option><option value="ready" ${state.status==='ready'?'selected':''}>已整理</option><option value="pendingReview" ${state.status==='pendingReview'?'selected':''}>未整理</option>${[["used","已使用"],["unused","未使用"],["inside","系列中"],["outside","系列外"]].map(([id,label])=>`<option value="${id}" ${state.status===id?'selected':''}>${label}</option>`).join('')}</select><select id="series-filter"><option value="all">全部系列</option><option value="none" ${state.seriesID==='none'?'selected':''}>系列外</option>${state.series.map(x=>`<option value="${x.id}" ${state.seriesID===x.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select><select id="sort-filter"><option value="newest">添加时间 · 降序</option><option value="oldest" ${state.sort==='oldest'?'selected':''}>添加时间 · 升序</option><option value="name" ${state.sort==='name'?'selected':''}>名称 · 升序</option><option value="name-desc" ${state.sort==='name-desc'?'selected':''}>名称 · 降序</option></select><span class="library-count"></span></div>`+`<div class="grid asset-grid ${state.preferences.display==='list'?'list-grid':''}"><button class="card action-card" data-act="import"><div class="card-image">＋</div><div class="card-body"><h3>导入素材</h3><p>添加照片或文件</p></div></button>${items.map(assetCard).join('')}</div>`;}
function updateLibraryResults(){if(view.querySelector('.series-contents'))return;const grid=view.querySelector('.asset-grid');if(!grid)return;const cards=[...grid.querySelectorAll('.card[data-act="detail"]')],used=usedAssetIDs(state.assets),statusOK=a=>state.status==='all'||state.status==='ready'&&a.reviewStatus==='ready'||state.status==='pendingReview'&&a.reviewStatus!=='ready'||state.status==='used'&&used.has(a.id)||state.status==='unused'&&!used.has(a.id)||state.status==='favorite'&&!!a.isFavorite||state.status==='inside'&&!!a.seriesID||state.status==='outside'&&!a.seriesID,q=state.query.trim().toLocaleLowerCase();const matches=card=>{const a=asset(card.dataset.id);return !!(a&&(!q||[a.title,...(a.tags||[])].join(' ').toLocaleLowerCase().includes(q))&&(!state.libraryRecent||Date.now()-Date.parse(a.createdAt)<=30*864e5)&&(state.kind==='all'||a.kind===state.kind)&&statusOK(a)&&(state.seriesID==='all'||(state.seriesID==='none'?!a.seriesID:a.seriesID===state.seriesID)));};const compare=(x,y)=>{const a=asset(x.dataset.id),b=asset(y.dataset.id);if(state.sort==='name'||state.sort==='name-desc'){const value=a.title.localeCompare(b.title,'zh-CN');return state.sort==='name'?value:-value;}const value=Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0);return state.sort==='oldest'?value:-value;};cards.sort(compare).forEach(card=>grid.append(card));grid.querySelector('.action-card').hidden=state.seriesID!=='all'||state.status!=='all'||state.kind!=='all'||!!q;applyCatalogPage({view,key:'library',cards,matched:matches,countNode:view.querySelector('.library-count'),size:state.preferences.maxPageItems});view.catalogRefresh=updateLibraryResults;}
const kindName=k=>({sticker:'贴纸',paper:'纸张',tape:'胶带',photo:'照片',text:'文字',reference:'参考'})[k]||k;
function renderSeries(){return head('我的素材','把喜欢的，收进系列。')+`<div class="grid series-grid ${state.preferences.display==='list'?'list-grid':''}">${[...state.series].sort((a,b)=>a.id.startsWith('B700')&&b.id.startsWith('B700')?b.id.localeCompare(a.id):a.id.startsWith('B700')?-1:b.id.startsWith('B700')?1:0).map(s=>{const members=state.assets.filter(a=>a.seriesID===s.id&&!a.isProjectInternal);const cover=seriesCovers(s,state.assets);return `<button class="card" data-act="series-detail" data-id="${s.id}"><div class="series-cover">${cover.map(imgTag).join('')}</div><div class="card-body"><h3>${esc(s.title)} <span aria-hidden="true">→</span></h3><p>${members.length} 件素材</p></div></button>`;}).join('')}</div>`;}
function renderMatching(){return renderMatchingPage({state,head,imgTag,esc,kindName,session:matchingSession});}
function matchingScope(){return buildMaterialScope({basket:state.basket,coreIDs:state.coreIDs,recommendations:matchingRecommendations(state),excluded:state.excludedAssetIDs,autoIncludeRecommendations:state.aiSettings.autoIncludeRecommendations,requireAllCandidates:state.aiSettings.requireAllCandidates});}
function refreshMatchingRecommendations(){const current=view.querySelector('.match-recommendations');if(!current)return;const template=document.createElement('template');template.innerHTML=renderMatching();const next=template.content.querySelector('.match-recommendations');if(!next)return;current.replaceWith(next);next.querySelectorAll('[data-act]').forEach(el=>el.addEventListener('click',()=>handle(el.dataset.act,el.dataset.id,el.dataset.val)));mountIcons(next);const summary=view.querySelector('.basket>.muted'),fresh=template.content.querySelector('.basket>.muted');if(summary&&fresh)summary.textContent=fresh.textContent;}
function workInkPreview(d){if(!d.strokes?.length)return '';const paths=d.strokes.map(s=>{const points=(s.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!points.length)return '';const color=esc(s.color||'#2b5245'),width=Math.max(.5,Number(s.width)||3),opacity=Math.max(0,Math.min(1,Number(s.opacity??1)));if(points.length===1)return `<circle cx="${points[0].x}" cy="${points[0].y}" r="${width/2}" fill="${color}" opacity="${opacity}"/>`;return `<path d="${points.map((p,n)=>`${n?'L':'M'}${p.x} ${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;}).join('');return `<svg class="work-ink-preview" viewBox="0 0 ${d.canvas.width} ${d.canvas.height}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>`;}
function workCover(d){
 if(!d)return '';
 if((d.coverImageID||d.coverBlobId)&&![d.items,d.primitives,d.textBlocks,d.strokes].some(list=>list?.length))return `<img class="work-reference" loading="lazy" decoding="async" src="${image(d.coverImageID||d.coverBlobId)}" alt="作品完整封面">`;
 const position=(i,flip=false)=>`left:${(i.x-i.width/2)/d.canvas.width*100}%;top:${(i.y-i.height/2)/d.canvas.height*100}%;width:${i.width/d.canvas.width*100}%;height:${i.height/d.canvas.height*100}%;transform:rotate(${i.rotation||0}deg) ${flip&&i.isFlippedHorizontally?'scaleX(-1)':''};opacity:${i.opacity??1};z-index:${i.zIndex||0};`;
 const materials=(d.items||[]).filter(i=>!i.isParked&&!i.isHidden&&!i.hidden).flatMap(projectMaterialViews).map(i=>{const a=asset(i.assetID),crop=i.cropRect||{x:0,y:0,width:1,height:1};return a?`<span class="work-material" style="${position(i,true)}${materialMaskCSS(i)}"><span style="position:absolute;inset:0"><img loading="lazy" decoding="async" src="${image(a.blobId)}" style="position:absolute;max-width:none;width:${100/crop.width}%;height:${100/crop.height}%;left:${-crop.x/crop.width*100}%;top:${-crop.y/crop.height*100}%;object-fit:fill"></span></span>`:'';}).join('');
 const shapes=(d.primitives||[]).filter(i=>!i.hidden).map(i=>`<span class="work-shape" style="${position(i)}">${shapeTag(i)}</span>`).join('');
 const texts=(d.textBlocks||[]).filter(i=>!i.isHidden).map(i=>`<span class="work-text" style="${position(i)}font-size:${Math.max(.6,i.fontSize/d.canvas.width*100)}cqw;line-height:${textLineHeight(i)/d.canvas.width*100}cqw;letter-spacing:${(i.letterSpacing||0)/d.canvas.width*100}cqw;color:${esc(i.color||'#333')};text-align:${i.alignment||'left'};font-family:${esc(textFontFamily(i))};font-weight:${i.bold?'700':'400'};font-style:${i.italic?'italic':'normal'};text-decoration:${[i.underline?'underline':'',i.strikethrough?'line-through':''].filter(Boolean).join(' ')||'none'}">${textParagraphMarkup(i,(i.paragraphSpacing||0)/d.canvas.width*100+'cqw')}</span>`).join('');
 return materials+shapes+texts+workInkPreview(d);
}
function renderWorks(){const list=[...state.projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));return `<div class="works-page">${head('我的作品','')}<button hidden data-act="new-project" id="work-create"></button><button hidden data-act="import-work" id="work-import"></button><div class="filters"><input type="search" id="work-search" placeholder="搜索作品名称或标签"><select id="work-kind"><option value="all">全部类型</option><option value="created">手动创作</option><option value="imported">导入作品</option></select><select id="work-status"><option value="all">全部状态</option><option value="used">已使用</option><option value="unused">未使用</option></select><select id="work-sort"><option value="access-desc">最近访问 · 降序</option><option value="access-asc">最近访问 · 升序</option><option value="updated-desc">最近修改 · 降序</option><option value="updated-asc">最近修改 · 升序</option><option value="name-asc">名称 · 升序</option><option value="name-desc">名称 · 降序</option></select><span>${list.length} 项</span></div><div class="grid works-grid">${list.map(p=>`<button class="card" data-act="open-project" data-id="${p.id}"><div class="card-image"><div class="thumb-sheet" style="width:75%;background:${esc(p.drafts[0]?.paperColor||'#fff')}">${p.isSnapshot?`<img class="work-reference" loading="lazy" decoding="async" src="${image(p.snapshotBlobId)}" alt="${esc(p.title)} 快照">`:p.coverStaticPath&&p.updatedAt===p.coverBaselineUpdatedAt?`<img class="work-reference" loading="lazy" src="${p.coverStaticPath}" alt="${esc(p.title)} 完整预览">`:workCover(p.drafts[0])}</div></div><div class="card-body"><h3>${esc(p.title)}</h3><p>⊙　${p.isSnapshot?'画面快照':p.isDraft?'草稿':'可编辑作品'} <span>${new Date(p.updatedAt).toLocaleDateString()}</span></p></div></button>`).join('')}</div></div>`;}
function current(){const p=state.activeProject;return p?.drafts.find(d=>d.id===state.activeDraft)||p?.drafts[0];}
function editorEntry(d,rendering=false){if(rendering)return sceneRenderEntries(d);const entries=[...(d.items||[]).filter(i=>!i.isParked).map(i=>({kind:'material',value:i})),...(d.primitives||[]).filter(i=>!i.hidden).map(i=>({kind:'shape',value:i})),...(d.textBlocks||[]).filter(i=>!i.isHidden).map(i=>({kind:'text',value:i}))];return entries.sort((a,b)=>a.value.zIndex-b.value.zIndex);}
function vectorMarkup(i){const paths=(i.vectorPaths||[]).map(points=>{const d=points.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)).map((p,n)=>`${n?'L':'M'}${p[0]} ${p[1]}`).join(' ');return d?`<path d="${d} Z"/>`:'';}).join('');return `<svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible;fill:${esc(i.fill||'transparent')};stroke:${esc(i.stroke||'none')};stroke-width:${Math.max(0,Number(i.lineWidth)||0)/Math.max(i.width,i.height,1)}">${paths}</svg>`;}
function renderCanvasObject(e,scale){const i=e.value;const left=(i.x-i.width/2)*scale,top=(i.y-i.height/2)*scale;let inner='';let extra='';if(e.kind==='material'){inner=imgTag(asset(i.assetID));extra=`opacity:${i.opacity};${materialMaskCSS(i)}${i.isFlippedHorizontally?'--flip:-1;':''}`;}else if(e.kind==='text'){inner=`<div data-text-content>${textParagraphMarkup(i,(i.paragraphSpacing||0)*scale+'px')}</div>`;extra=`${i.paragraphSpacing?'display:block;':''}opacity:${i.opacity??1};font-size:${i.fontSize*scale}px;line-height:${textLineHeight(i)*scale}px;letter-spacing:${(i.letterSpacing||0)*scale}px;font-style:${i.italic?'italic':'normal'};text-decoration:${[i.underline?'underline':'',i.strikethrough?'line-through':''].filter(Boolean).join(' ')||'none'};color:${esc(i.color)};text-align:${i.alignment||'left'};font-family:${esc(textFontFamily(i))};font-weight:${i.bold?'700':'400'};`; }else{extra=`background:${i.kind==='frame'||i.kind==='line'?'transparent':esc(i.fill||'transparent')};border-color:${esc(i.stroke||'transparent')};border-width:${Math.max(1,i.lineWidth*scale)}px;opacity:${i.opacity};`;}
if(e.kind==='shape'){inner=shapeTag(i);extra=`opacity:${i.opacity??1};`;}
return `<div class="canvas-object ${e.kind} ${i.kind||''} ${state.selected===i.id?'selected':''}" data-object="${esc(i.ownerID||i.id)}" data-render-key="${esc(i.renderKey||i.id)}" data-kind="${e.kind}" style="left:${left}px;top:${top}px;width:${i.width*scale}px;height:${i.height*scale}px;transform:rotate(${i.rotation||0}deg) ${i.isFlippedHorizontally?'scaleX(-1)':''};z-index:${i.zIndex};${extra}">${inner}</div>`;}
function renderEditor(){const p=state.activeProject,d=current();if(!p||!d){state.route='works';return renderWorks();}const selected=editorEntry(d).find(e=>e.value.id===state.selected);const viewportHeight=window.visualViewport?.height||window.innerHeight;const availableWidth=Math.max(180,window.innerWidth-(window.innerWidth<700?24:72));const availableHeight=Math.max(180,viewportHeight-(window.innerWidth<700?200:166));const cw=Math.max(160,Math.min(availableWidth,availableHeight*d.canvas.width/d.canvas.height));const scale=cw/d.canvas.width;const w=d.canvas.width*scale,h=d.canvas.height*scale;const object=e=>renderCanvasObject(e,scale);
return `<div class="view-head"><div><h1 contenteditable="true" id="project-title" spellcheck="false">${esc(p.title)}</h1><p>编辑只改变作品，不修改素材库里的原始尺寸和数量</p></div><div class="actions"><button class="btn" data-act="back-works">返回作品</button><button class="btn" data-act="new-draft">新方案</button><button class="btn" data-act="creative-json">导入创作指令</button><button class="btn" data-act="export-png">导出 PNG</button><button class="btn" data-act="print">打印 / PDF</button></div></div><div class="editor-shell"><div class="editor-tools">${[['select','选择'],['pen','画笔'],['text','文字'],['shape','图形'],['material','素材']].map(([v,l])=>`<button class="btn ${state.tool===v?'primary':''}" data-act="tool" data-val="${v}">${l}</button>`).join('')}<hr><button class="btn" data-act="undo">撤销</button><button class="btn" data-act="redo">重做</button></div><section class="editor-stage"><div class="object-toolbar"><button class="btn mini" data-act="zoom-out">－</button><span>${Math.round(state.zoom*100)}%</span><button class="btn mini" data-act="zoom-in">＋</button><button class="btn mini" data-act="paper-menu">纸张</button><button class="btn mini" data-act="restore-baseline" ${selected?.kind!=='material'||!selected.value.generationBaseline?'disabled':''}>恢复初稿</button><button class="btn mini" data-act="park" ${selected?.kind!=='material'?'disabled':''}>放入备选</button></div><div class="page-wrap"><div id="canvas-page" class="canvas-page ${d.paperPattern} ${state.tool==='pen'?'pen':''}" style="width:${w}px;height:${h}px;background-color:${esc(d.paperColor)}">${editorEntry(d,true).map(object).join('')}<canvas class="paper-layer" width="${Math.round(d.canvas.width)}" height="${Math.round(d.canvas.height)}" aria-hidden="true"></canvas><canvas id="ink" class="ink-layer" width="${Math.round(d.canvas.width)}" height="${Math.round(d.canvas.height)}"></canvas></div></div><div class="shelf"><b>备选</b>${d.items.filter(i=>i.isParked).map(i=>`<button class="mini-asset" data-act="unpark" data-id="${i.id}">${imgTag(asset(i.assetID))}</button>`).join('')}</div></section><aside class="editor-inspector"><h2>${selected?({material:'素材',text:'文字',shape:'图形'}[selected.kind]+' · 图层属性'):'页面设置'}</h2>${selected?inspector(selected):pageInspector(d)}<hr><label>方案<select id="draft-select">${p.drafts.map((x,i)=>`<option value="${x.id}" ${x.id===d.id?'selected':''}>方案 ${i+1} · ${esc(x.style)}</option>`).join('')}</select></label><button class="btn mini" data-act="save-archive">保存手动存档</button><div class="stack" style="margin-top:12px">${(p.manualArchives||[]).slice(-5).reverse().map((a,i)=>`<button class="btn mini" data-act="restore-archive" data-id="${a.id}">${new Date(a.date).toLocaleString()}</button>`).join('')}</div></aside></div>${state.aiPanel?renderAIPanel():''}`;}
function inspector(e){const i=e.value;return `<div class="stack">${e.kind==='text'?`<label>文字内容<textarea id="inspector-text">${esc(i.content)}</textarea></label><label>字体<select id="inspector-font"><option value="serif" ${i.style==='serif'?'selected':''}>宋体</option><option value="sans" ${i.style==='sans'?'selected':''}>黑体</option><option value="rounded" ${i.style==='rounded'?'selected':''}>圆体</option></select></label><label>字号<input id="inspector-font-size" type="number" min="8" max="200" value="${i.fontSize}"></label>`:''}<div class="form-grid"><label>宽<input id="inspector-width" type="number" min="1" value="${fmt(i.width)}"></label><label>高<input id="inspector-height" type="number" min="1" value="${fmt(i.height)}"></label><label>旋转<input id="inspector-rotation" type="number" value="${fmt(i.rotation||0)}"></label><label>图层<input id="inspector-z" type="number" value="${i.zIndex}"></label></div><label>透明度<input id="inspector-opacity" type="range" min="0.1" max="1" step="0.05" value="${i.opacity||1}"></label>${e.kind==='material'?`<p class="muted">实物 ${fmt(asset(i.assetID)?.physicalWidthMM||0)} × ${fmt(asset(i.assetID)?.physicalHeightMM||0)} mm</p>`:''}<div class="actions"><button class="btn mini" data-act="duplicate">复制</button><button class="btn mini" data-act="flip">镜像</button><button class="btn mini" data-act="front">置顶</button><button class="btn mini danger" data-act="delete-object">删除</button></div></div>`;}
function pageInspector(d){return `<div class="stack"><label>纸张颜色<input id="paper-color" type="color" value="${esc(d.paperColor)}"></label><label>背景<select id="paper-pattern"><option value="plain">纯色</option><option value="grid" ${d.paperPattern==='grid'?'selected':''}>方格</option><option value="lines" ${d.paperPattern==='lines'?'selected':''}>横线</option><option value="dots" ${d.paperPattern==='dots'?'selected':''}>点阵</option></select></label><label>纸张规格<select id="page-ratio">${paperSizeOptions(d.pageRatio,{includeCustom:false})}${['portrait','square','landscape'].map(v=>`<option value="${v}" ${d.pageRatio===v?'selected':''}>旧版比例 · ${v.toUpperCase()}</option>`).join('')}${d.pageRatio?.startsWith('custom:')?`<option value="${esc(d.pageRatio)}" selected>自定义 ${esc(d.pageRatio.slice(7))} mm</option>`:''}</select></label><label>页面模式<select id="page-mode"><option value="single">单页</option><option value="spread" ${d.pageMode==='spread'?'selected':''}>双页</option></select></label></div>`;}
function importSourceButtons(){return `<div class="import-source-actions"><button class="btn primary" data-act="select-file" data-val="gallery">▣　从图库中选择</button><button class="btn" data-act="select-file" data-val="camera">▣　拍摄图片</button><button class="btn" data-act="select-file" data-val="files">▱　从文件中导入</button>${state.importMode==='work'?'<small>选择 .shiyeproject.zip 可编辑作品包或 JSON 备选文件会直接导入，不经过照片识别。</small>':''}</div>`;}
function importSteps(){return `<div class="import-nav"><button class="import-back" data-act="import-back" aria-label="返回">‹</button><strong>导入${state.importMode==='work'?'作品':'素材'}</strong><div class="import-progress">${[['inspect','检查照片'],['review','确认归类'],['done','完成']].map(([key,label],i)=>`<span class="${state.importStep===key?'current':(i<['inspect','review','done'].indexOf(state.importStep)?'passed':'')}"><b>${i<['inspect','review','done'].indexOf(state.importStep)?'✓':i+1}</b>${label}</span>`).join('')}</div><button class="import-cancel" data-act="import-exit">${state.importStep==='done'?'完成':'取消导入'}</button></div>`;}
function renderImport(){const b=state.importBox,rec=state.importRecords[state.importIndex];let content='';
  if(state.importStep==='done')content=`<div class="import-done"><div>✓</div><h1>导入完成 · ${state.importSavedCount||0} 个${state.importMode==='work'?'作品':'素材'}</h1><p>${state.importPending?'资料已可靠暂存，云端同步和自动整理在后台进行。':'资料已保存。'}可以继续导入下一批照片，本机识别引擎会保持就绪。</p><div class="review-actions"><button class="btn" data-act="import-exit">返回${state.importMode==='work'?'作品':'素材库'}</button><button class="btn primary" data-act="import-continue">继续导入</button></div></div>`;
  else if(state.importStep==='review')content=renderImportReview({state,esc,fmt});
  else if(!rec)content=`<section class="import-intro"><div class="eyebrow">FROM YOUR DESK TO YOUR PAGES</div><h1>${state.importMode==='work'?'收进完成的作品':'先认出纸，再留住喜欢的'}</h1><p>从相册多选，逐张确认纸张和${state.importMode==='work'?'页面':'素材'}。</p><div class="import-empty"><div class="photo-symbol">▧</div><h2>添加照片</h2><p>从相册多选，或拍摄一张白纸上的素材。</p>${importSourceButtons()}<small>每批最多 12 张；使用较小图像识别，从原始工作图提取素材</small></div></section>`;
  else content=renderImportInspection({state,esc,fmt});
  return importSteps()+content;
}
function renderAssetDetail(){const a=asset(state.detailAssetID);if(!a)return renderLibrary();return `<div class="detail-page"><button class="detail-back" data-act="detail-back">‹　返回素材库</button><span class="detail-category">${esc(state.series.find(s=>s.id===a.seriesID)?.title||'所有系列')}</span><section class="detail-columns"><div class="detail-picture"><span>▣　透明素材预览</span>${imgTag(a)}</div><div class="detail-copy"><div class="eyebrow">A LITTLE PIECE OF EVERYDAY</div><button class="detail-heart" data-act="detail-favorite" aria-label="收藏">${a.isFavorite?'♥':'♡'}</button><h1>${esc(a.title)}</h1><div class="detail-facts"><div><small>真实尺寸</small><span>${fmt(a.physicalWidthMM||0)} × ${fmt(a.physicalHeightMM||0)} mm</span></div><div><small>可用库存</small><span>${a.supply?.quantity??1} 件</span></div><div><small>素材类型</small><span>${kindName(a.kind)}</span></div><div><small>主要作用</small><span>${a.role==='background'?'背景':a.role==='connector'?'连接':'陪衬'}</span></div><div><small>材质</small><span>${esc(a.texture||'待记录')}</span></div></div><div class="detail-tags">${[...(a.tags||[]),...(a.contentTags||[]),...(a.styleTags||[]),...(a.materialTags||[])].filter((tag,index,list)=>tag&&list.indexOf(tag)===index).sort((x,y)=>x.localeCompare(y,'zh-CN')).map(tag=>`<span>${esc(tag)}</span>`).join('')}</div><div class="detail-dots">● ● ● ●</div><hr><p>实物可用操作</p><p>✓ 整件使用　 ✓ 旋转摆放</p><button class="btn primary detail-add" data-act="detail-add">＋　加入本次创作</button><div class="detail-links"><button class="btn" data-act="detail-series">▱　同系列</button><button class="btn" data-act="detail-similar"><span class="detail-link-icon" aria-hidden="true">${iconMarkup('search')}</span>　找相似</button><button class="btn" data-act="detail-match">✦　去搭配</button></div><div class="detail-small"><button data-act="detail-edit">✎　编辑素材信息</button><button data-act="detail-check">□　检查抠图</button></div></div></section></div>`;}
function renderProjectPreview(){const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p)return renderWorks();const d=p.drafts.find(x=>x.id===p.activeDraftID)||p.drafts[0];const original=p.coverStaticPath&&p.updatedAt===p.coverBaselineUpdatedAt;return `<div class="project-preview-page"><div class="project-preview-head"><h1>${esc(p.title)}</h1><button class="btn" data-act="preview-back">关闭</button></div><div class="project-preview-cover"><div class="preview-paper" style="background:${esc(d.paperColor||'#fff')};aspect-ratio:${d.canvas.width}/${d.canvas.height}">${p.isSnapshot?`<img class="work-reference" src="${image(p.snapshotBlobId)}" alt="${esc(p.title)} 快照">`:original?`<img class="work-reference" src="${p.coverStaticPath}" alt="${esc(p.title)} 完整预览">`:workCover(d)}</div></div><div class="project-preview-tags">${[...(p.styleTags||[]),...(p.tags||[])].filter((tag,index,list)=>tag&&list.indexOf(tag)===index).map(tag=>`<span>${esc(tag)}</span>`).join('')}</div><p>${p.isSnapshot?'独立保存的画面快照，不能逐层编辑。':'页面上的素材、排版和书写内容都已保存。'}</p><div class="project-preview-actions">${p.isSnapshot?'<button class="btn primary" data-act="download-snapshot">下载快照</button>':'<button class="btn primary" data-act="preview-continue">继续创作</button>'}<button class="btn" data-act="project-meta">作品信息与标签</button><button class="btn danger" data-act="project-delete">移到最近删除</button></div></div>`;}
let aiModelPanelOpen=false;
const settingToggle=(id,label,checked,help)=>`<label class="toggle-row setting-toggle"><span><b>${label}</b><small class="setting-help">${help}</small></span><input id="${id}" type="checkbox" ${checked?'checked':''}></label>`;
function renderSettings(){const sections=[['AI 与创作','创作偏好与模型连接，分组查看','✣'],['导入与识别','照片校正、背景板、识别默认值与自动整理','□'],['界面与素材库','素材排列、卡片背景与显示方式','▦'],['数据与诊断','备份、最近删除、生成诊断与完整上下文','▱']];if(!state.settingsSection)return `<div class="settings-page"><div class="settings-toolbar"><button data-act="settings-back">返回</button><button data-act="settings-save">保存</button></div><h1>设置</h1><section class="settings-list">${sections.map(([name,description,icon])=>`<button data-act="settings-open" data-val="${name}"><span class="settings-icon">${icon}</span><span><strong>${name}</strong><small>${description}</small></span><b>›</b></button>`).join('')}</section><p class="settings-note">设置按使用场景归为四类。AI 设置保存在这台设备的当前浏览器中；作品和素材可在“数据与诊断”中导出备份。</p><div class="actions"><button type="button" class="btn" data-act="help">使用说明与故障排查</button></div></div>`;
 const title=state.settingsSection;let content='';if(title==='AI 与创作'){const cfg=state.aiSettings,preset=AI_PROVIDERS[cfg.provider],known=preset.models.some(m=>m[0]===cfg.model);
  content=`<h2>服务与模型</h2><label>服务商<select id="setting-ai-provider">${Object.entries(AI_PROVIDERS).map(([id,x])=>`<option value="${id}" ${id===cfg.provider?'selected':''}>${x.label}</option>`).join('')}</select></label><label>API 地址<input id="setting-ai-endpoint" type="url" value="${esc(cfg.endpoint)}" placeholder="https://…/chat/completions"></label><label>模型<select id="setting-ai-model">${preset.models.map(([id,name])=>`<option value="${esc(id)}" ${cfg.model===id?'selected':''}>${esc(name)}</option>`).join('')}<option value="__custom__" ${known?'':'selected'}>自定义模型 ID</option></select></label><label id="setting-ai-custom-model-row" ${known?'hidden':''}>模型 ID<input id="setting-ai-custom-model" value="${known?'':esc(cfg.model)}"></label><label>API 密钥<input id="setting-ai-key" type="password" autocomplete="off" value="${esc(cfg.key)}" placeholder="API Key"></label><label class="toggle-row">发送全部素材预览 <input id="setting-ai-thumbnails" type="checkbox" ${cfg.includeThumbnails?'checked':''}></label><label class="toggle-row">交付前由 GPT 看图复核（计入总请求上限）<input id="setting-ai-visual-review" type="checkbox" ${cfg.finalVisualReview!==false?'checked':''}></label><label class="toggle-row">自定义模型支持图片 <input id="setting-ai-vision" type="checkbox" ${cfg.customVision?'checked':''}></label><p>当前模型${supportsVision(cfg)?'支持图片输入；开启预览时发送所有允许使用的素材图片':'不支持图片输入，仅发送素材文字信息'}。密钥仅保存在本浏览器，不进入备份。</p><h2>创作与响应</h2><label>创意程度 0–2<input id="setting-ai-temperature" type="number" step="0.05" min="0" max="2" value="${cfg.temperature}"></label><label>单轮最大输出 2000–16000<input id="setting-ai-tokens" type="number" min="2000" max="16000" value="${cfg.maxTokens}"></label><label>最多创作轮次（所有请求和重试计入上限）<input id="setting-ai-turns" type="number" min="1" max="20" value="${cfg.maxTurns}"></label><label>请求超时（秒）<input id="setting-ai-timeout" type="number" min="20" max="180" value="${cfg.requestTimeout}"></label><label>工具接口<select id="setting-ai-transport"><option value="auto" ${cfg.transport==='auto'?'selected':''}>自动适配</option><option value="native" ${cfg.transport==='native'?'selected':''}>原生工具调用</option><option value="json" ${cfg.transport==='json'?'selected':''}>兼容 JSON 工具指令</option></select></label><label>文字内容<select id="setting-ai-text"><option value="automatic" ${cfg.textMode==='automatic'?'selected':''}>图文手账 · 自动配文</option><option value="requested" ${cfg.textMode==='requested'?'selected':''}>仅明确要求时配文</option><option value="none" ${cfg.textMode==='none'?'selected':''}>不生成文字</option>${['minimal','rich'].includes(cfg.textMode)?`<option value="${cfg.textMode}" selected>旧版：${cfg.textMode==='minimal'?'简洁':'丰富'}</option>`:''}</select></label><label>代理思考策略<select id="setting-ai-reasoning"><option value="automatic" ${cfg.reasoningMode==='automatic'?'selected':''}>自动 · 优先执行</option><option value="low" ${cfg.reasoningMode==='low'?'selected':''}>轻量思考</option><option value="providerDefault" ${cfg.reasoningMode==='providerDefault'?'selected':''}>保持服务设置</option></select></label><label class="toggle-row">发送输出上限 <input id="setting-ai-send-limit" type="checkbox" ${cfg.sendOutputLimit?'checked':''}></label><label class="toggle-row">关闭服务商思考模式 <input id="setting-ai-disable-thinking" type="checkbox" ${cfg.disableThinking?'checked':''}></label><label>补充版式指导<textarea id="setting-ai-layout-prompt" placeholder="留空使用默认指导">${esc(cfg.customLayoutPrompt)}</textarea></label>`;}
 else if(title==='导入与识别')content=`<h2>照片校正</h2><p>传统浏览器四角检测与透视校正，不上传照片；当前未接入大模型矫正。</p><label>素材识别方法<select id="setting-recognition">${recognitionOptions.map(([id,name])=>`<option value="${id}" ${state.preferences.recognition===id?'selected':''}>${name}</option>`).join('')}</select><small class="setting-help">识别方法决定主要边界算法；下面的预处理、后处理和处理像素与方法相互独立。</small></label><div class="settings-method-notes">${recognitionMethodDetails.map(item=>`<div class="settings-method-note"><b>${item.label}</b><small>${item.description}</small></div>`).join('')}</div><label>处理像素（最长边）<select id="setting-recognition-pixels">${recognitionPixelOptions.map(([value,name])=>`<option value="${value}" ${state.preferences.recognitionPixels===value?'selected':''}>${name}</option>`).join('')}</select><small class="setting-help">900 px 是真实样例中速度与框位置最稳定的默认值；1200/1600 px 可用于特殊照片。最终素材始终从原图提取。</small></label><h2>识别预处理</h2>${settingToggle('setting-preprocess-light','光照场校正',state.preferences.balanceLight!==false,'只作用于候选框内的边界分割；整页自动框选始终使用原始校正图。')}${settingToggle('setting-preprocess-denoise','轻度去噪',state.preferences.recognitionDenoise!==false,'只作用于边界分割。默认关闭；真实样例中直接使用原图更稳定。')}${settingToggle('setting-preprocess-contrast','局部对比增强',state.preferences.recognitionLocalContrast!==false,'只作用于边界分割。默认关闭；需要增强浅色边缘时可手动开启。')}${settingToggle('setting-preprocess-chroma','Lab 色差边缘增强',state.preferences.recognitionChromaEdges!==false,'用颜色差补充灰度边缘，对绿白、浅色纸尤其有帮助；内部彩色纹理也会增强，因此只作为边缘证据。')}<p class="settings-note">预处理只作用于每件素材的边界分割，不改变整页自动框选，也不会改变最终保存素材的颜色和清晰度。</p><h2>识别后处理</h2>${settingToggle('setting-postprocess-shapes','规则图形规整',state.preferences.recognitionShapeRegularization!==false,'默认开启。只在边缘证据足够强时修正四边形、圆/椭圆或简单多边形；自由异形保持主分割轮廓。')}${settingToggle('setting-postprocess-apertures','真实孔洞识别',state.preferences.recognitionApertures!==false,'默认开启。只恢复成排、近等半径、近等间距且中心接近 A4 纸色的制造型孔；孤立白点不会挖空。')}<p class="settings-note">默认只开启形状规整与重复打孔恢复；固定顺序为主分割 → 形状规整 → 打孔恢复。</p><label>默认纸张<select id="setting-paper-size">${paperSizeOptions(state.preferences.paperSize)}</select></label><label>校正方向<select id="setting-orientation"><option value="auto">自动</option><option value="portrait" ${state.preferences.orientation==='portrait'?'selected':''}>竖向</option><option value="landscape" ${state.preferences.orientation==='landscape'?'selected':''}>横向</option></select></label><label>未识别时作为背景板<input id="setting-whole-paper" type="checkbox" ${state.preferences.wholePaper?'checked':''}></label>`;
 else if(title==='界面与素材库')content=`<h2>素材排列</h2><label>显示方式<select id="setting-display"><option value="grid">网格</option><option value="list" ${state.preferences.display==='list'?'selected':''}>列表</option></select></label><label>卡片背景<select id="setting-backdrop"><option value="auto">自动配色</option><option value="white" ${state.preferences.backdrop==='white'?'selected':''}>白色</option><option value="transparent" ${state.preferences.backdrop==='transparent'?'selected':''}>透明</option></select></label><label>每页最多展示<select id="setting-page-items"><option value="0">不限制（连续滚动）</option>${[20,40,80].map(n=>`<option value="${n}" ${state.preferences.maxPageItems===n?'selected':''}>每页 ${n} 项</option>`).join('')}</select></label><p>限制数量后每页仍可滚动；素材、系列和作品共用此设置。</p>`;
 else {const storage=db.storageConfig();content=`<h2>数据位置</h2><p id="storage-location">${storage?.url?`已配置服务器：${esc(storage.url)}`:'此网址当前使用浏览器本机存储；访问其他网址不会自动同步。'}</p><p>素材 ${state.assets.length} 件 · 作品 ${state.projects.length} 件 · 最近删除 ${state.trash.length} 项</p><label>4090 数据服务地址<input id="data-server-url" type="url" placeholder="https://你的数据域名" value="${esc(storage?.url||'')}"></label><label>访问令牌<input id="data-server-token" type="password" autocomplete="off" value="${esc(storage?.token||'')}"></label><div class="actions"><button class="btn primary" data-act="storage-connect">连接服务器</button><button class="btn" data-act="storage-browser">改用此浏览器资料</button></div><p>服务器地址需要公网 HTTPS，手机访问 localhost 指的是手机自身；同一台电脑运行的拾页服务可直接打开 http://127.0.0.1:4173。跨数据源转移资料请使用下方“导出完整备份 / 从备份恢复”，不在连接动作中隐式迁移。</p><h2>完整备份</h2><div class="actions"><button class="btn primary" data-act="backup">导出完整备份</button><button class="btn" data-act="restore">从备份恢复</button></div><h2>最近删除</h2>${state.trash.map(x=>`<div class="rec-card"><b>${esc(x.item.title)}</b><button class="btn mini" data-act="restore-trash" data-id="${x.id}">恢复</button></div>`).join('')||'<p>没有最近删除的项目。</p>'}<h2>离线状态</h2><p id="offline-state">检测中…</p>`;}
 if(title==='数据与诊断'&&state.selfHosted)content=`<h2>唯一数据源 · 4090 服务器</h2><p id="storage-location">${esc(location.origin)}</p><p>素材 ${state.assets.length} 件 · 作品 ${state.projects.length} 件 · 最近删除 ${state.trash.length} 项</p><p>此网址的素材、作品与图片都写入服务器。浏览器只保存访问令牌和 AI 设置；服务器无法连接时不会写入另一份资料。</p><label>更新访问令牌<input id="data-server-token" type="password" autocomplete="off" placeholder="保持不变则留空"></label><button class="btn" data-act="storage-token">验证并更新令牌</button><h2>完整备份</h2><div class="actions"><button class="btn primary" data-act="backup">导出完整备份</button><button class="btn" data-act="restore">从备份恢复</button></div><p>恢复会替换服务器当前全部数据；执行前请先导出一份当前完整备份。</p><h2>最近删除</h2>${state.trash.map(x=>`<div class="rec-card"><b>${esc(x.item.title)}</b><button class="btn mini" data-act="restore-trash" data-id="${x.id}">恢复</button></div>`).join('')||'<p>没有最近删除的项目。</p>'}`;
 if(title==='AI 与创作')content=`<h2>创作流程</h2><label>交付方式<select id="setting-ai-delivery">${DELIVERY_OPTIONS.map(([id,label])=>`<option value="${id}" ${state.aiSettings.deliveryMode===id?'selected':''}>${label}</option>`).join('')}</select></label><label>GPT 图像模型<select id="setting-ai-image-model">${IMAGE_MODELS.map(id=>`<option value="${id}" ${state.aiSettings.imageModel===id?'selected':''}>${id}</option>`).join('')}</select></label><p>“画面图片”只保存不可编辑快照：在线创作直接调用 OpenAI 图像模型，需另配 API 密钥；导出给网页版 AI 则用相同画面要求手动发送素材包，并导入返回的图片，不需要 API 密钥。“PDF 页面”仍是可编辑版面在本机渲染成快照。工具、JSON 与 ZIP 保留可编辑图层。</p><p>可编辑在线创作的轮数是总请求上限，格式修复也占一轮；本地最终渲染不调用模型。每轮连续无响应按设置的秒数停止，整轮另有十分钟硬上限。失败不会自动重发可能计费的请求。</p>`+content;
 if(title==='AI 与创作')content+='<p>“自动适配”只用于已核对的 API 地址与模型组合；自定义或未核验组合请明确选择原生工具或兼容 JSON。图片输入同理，未核验组合需手动确认支持后才发送预览。</p>';
 if(title==='数据与诊断'&&cloudEnabled)content=`<h2>私人云端资料</h2><p id="storage-location">云端元数据与私有图片 · 本机缓存加速</p><p>素材 ${state.assets.length} 件 · 作品 ${state.projects.length} 件 · 最近删除 ${state.trash.length} 项</p><p>登录验证后显示本机缓存，后台检查云端更新。原图和完整作品按需读取；修改先暂存，后台同步。云端失败不会改用另一份资料。</p><h2>完整备份</h2><div class="actions"><button class="btn primary" data-act="backup">导出完整备份</button><button class="btn" data-act="restore">从备份恢复</button></div><p>只接受拾页现行完整备份格式；恢复会替换当前资料。</p><h2>离线应急备份</h2><p>仅保存本机尚未上传云端的修改和原始字节，不包含已同步的完整素材库；网络故障时也可导出。应急包只能恢复到原账号，恢复后重新打开拾页再同步。</p><div class="actions"><button class="btn" data-act="backup-emergency">导出本机待同步修改</button><button class="btn" data-act="restore-emergency">恢复待同步应急包</button></div>`;
 if(title==='AI 与创作')content+=`<h2>候选素材</h2><label class="toggle-row">候选素材必须全部使用<input id="setting-ai-require-all" type="checkbox" ${state.aiSettings.requireAllCandidates?'checked':''}></label><p>默认开启：本次发给 AI 的每件候选素材都必须在作品中出现。关闭后，仍尽量使用；手动标星的素材保持必用。若同时开启“自动加入建议搭配”，建议素材也属于候选。</p><label class="toggle-row">自动把全部建议搭配作为 AI 备选素材<input id="setting-ai-auto-recommendations" type="checkbox" ${state.aiSettings.autoIncludeRecommendations?'checked':''}></label><p>开启后会把未排除的建议素材一并发送给 AI；关闭后只发送素材篮中的素材。最终是否必须使用由上方开关决定。</p><h2>样例参考</h2><label class="toggle-row">参考样例的图文结构<input id="setting-ai-structure-reference" type="checkbox" ${state.aiSettings.includeStructureReference?'checked':''}></label><label class="toggle-row">发送匹配风格与用途的四张预设样例<input id="setting-ai-send-reference" type="checkbox" ${state.aiSettings.sendPresetReferences?'checked':''}></label><p>预设样例从简洁到丰富展示不同构图，只含匿名区域示意；不读取或发送已有私人作品。网页版 GPT 任务包会附四张图；API 仅在当前模型支持图片时发送。素材预览另由模型连接设置控制。</p>`;
 if(title==='导入与识别')content+=`<h2>素材整理</h2><label class="toggle-row">自动整理素材名称和标签<input id="setting-auto-organize" type="checkbox" ${state.preferences.autoOrganize?'checked':''}></label><p>整批素材保存成功后，在后台使用视觉模型整理名称和标签，不影响确认归类或继续导入；手动修改的信息不会被覆盖。</p>`;
 if(title==='AI 与创作'){
  const service=content.indexOf('<h2>服务与模型</h2>'),candidates=content.indexOf('<h2>候选素材</h2>');
  const creative=content.slice(0,service)+content.slice(candidates),model=content.slice(service,candidates);
  content=`<details class="ai-settings-group" open><summary><strong>创作偏好</strong><small>候选素材、生成方式与样例参考</small></summary><div>${creative}</div></details><details class="ai-settings-group" id="ai-model-group" ${aiModelPanelOpen?'open':''}><summary><strong>模型与连接</strong><small>服务商、密钥、图片与响应参数</small></summary><div>${model}</div></details>`;
 }
 if(title==='AI 与创作')content=content.replace('发送匹配风格与用途的四张预设样例','发送匹配风格与用途的手帐案例').replace('预设样例从简洁到丰富展示不同构图，只含匿名区域示意；不读取或发送已有私人作品。网页版 GPT 任务包会附四张图；API 仅在当前模型支持图片时发送。素材预览另由模型连接设置控制。','从原创重构的真实风格手帐案例中，按当前风格、用途和素材选最相近的两张；不发送全部案例，也不发送你已有的私人作品。案例只用于构图参考，不属于可使用素材。网页版任务包附图；支持图片的 API 模型也会收到。');
 return `<div class="settings-page"><div class="settings-toolbar"><button data-act="settings-back">‹ 返回</button><button data-act="settings-save">保存</button></div><h1>${title}</h1><section class="settings-detail">${content}</section></div>`;}
function readAIForm(){const q=id=>view.querySelector('#setting-ai-'+id),old=state.aiSettings,provider=q('provider').value,keys={...old.keys,[old.provider]:q('key').value},deliveryMode=q('delivery').value;return {...old,provider,keys,key:q('key').value,endpoint:q('endpoint').value,model:q('model').value==='__custom__'?q('custom-model').value.trim():q('model').value,imageModel:q('image-model').value,deliveryMode,...deliveryProfile(deliveryMode),includeStructureReference:q('structure-reference').checked,sendPresetReferences:q('send-reference').checked,autoIncludeRecommendations:q('auto-recommendations').checked,requireAllCandidates:q('require-all').checked,finalVisualReview:q('visual-review')?.checked!==false,customVision:q('vision').checked,includeThumbnails:q('thumbnails').checked,temperature:q('temperature').value,maxTokens:q('tokens').value,maxTurns:q('turns').value,requestTimeout:q('timeout').value,transport:q('transport').value,textMode:q('text').value,reasoningMode:q('reasoning').value,sendOutputLimit:q('send-limit').checked,disableThinking:q('disable-thinking').checked,customLayoutPrompt:q('layout-prompt').value};}

function bindPage(){view.querySelectorAll('[data-act]').forEach(el=>el.addEventListener('click',()=>handle(el.dataset.act,el.dataset.id,el.dataset.val)));
  const assetStatus=view.querySelector('#status-filter');if(assetStatus&&!assetStatus.querySelector('[value="favorite"]')){const option=document.createElement('option');option.value='favorite';option.textContent='已收藏';assetStatus.append(option);}
  const assetHeart=view.querySelector('.detail-heart');if(assetHeart)assetHeart.setAttribute('aria-pressed',String(!!asset(state.detailAssetID)?.isFavorite));
  if(state.route==='projectPreview'){const p=state.projects.find(x=>x.id===state.previewProjectID);if(p?.isSnapshot){const header=view.querySelector('.project-preview-head');const heart=document.createElement('button');heart.type='button';heart.className='snapshot-favorite';heart.setAttribute('aria-label',p.isFavorite?'取消收藏快照':'收藏快照');heart.setAttribute('aria-pressed',String(!!p.isFavorite));heart.textContent=p.isFavorite?'♥':'♡';heart.onclick=async()=>{const next={...p,isFavorite:!p.isFavorite};await db.put('projects',next);Object.assign(p,next);render();};header?.querySelector('h1')?.after(heart);}}
  view.querySelector('#ai-model-group')?.addEventListener('toggle',event=>{aiModelPanelOpen=event.currentTarget.open;});
  if(state.route==='matching'){
    const saveMatching=()=>matchingSession.persist().catch(e=>{syncDisplay.error=e;updateSyncIndicator();console.warn('搭配自动保存待重试',e);});
    const fields={'match-style':'matchStyle','match-purpose':'matchPurpose','match-intent':'matchIntent','match-content-policy':'matchContentPolicy','match-user-text':'matchUserText','match-facts':'matchFacts','match-processing':'matchProcessing','match-mode':'matchMode','match-ratio':'matchRatio','match-paper-width':'customPaperWidth','match-paper-height':'customPaperHeight'};
    for(const [id,key] of Object.entries(fields))view.querySelector('#'+id)?.addEventListener('change',e=>{state[key]=e.target.type==='number'?Number(e.target.value):e.target.value;if(id==='match-style')state.matchStyles=readMatchSelection(id,state.matchStyle);if(id==='match-purpose')state.matchPurposes=readMatchSelection(id,state.matchPurpose);if(id==='match-style'||id==='match-purpose')refreshMatchingRecommendations();void saveMatching();});
    // Entering or rerendering this page is not an explicit save action. Any
    // changed session is staged in the background; sync errors use the global
    // indicator instead of interrupting navigation with a toast.
    void saveMatching();
  }
  const provider=view.querySelector('#setting-ai-provider');if(provider)provider.onchange=()=>{const old=readAIForm(),next=provider.value,preset=AI_PROVIDERS[next];state.aiSettings={...old,provider:next,endpoint:preset.endpoint,model:preset.models[0]?.[0]||'',keys:{...old.keys,[old.provider]:old.key},key:old.keys[next]||'',includeThumbnails:preset.models[0]?.[2]===true};render();};
  const modelSelect=view.querySelector('#setting-ai-model');if(modelSelect)modelSelect.onchange=()=>{view.querySelector('#setting-ai-custom-model-row').hidden=modelSelect.value!=='__custom__';if(modelSelect.value!=='__custom__')view.querySelector('#setting-ai-thumbnails').checked=AI_PROVIDERS[state.aiSettings.provider].models.find(m=>m[0]===modelSelect.value)?.[2]===true;};
  const timeoutInput=view.querySelector('#setting-ai-timeout');if(timeoutInput){timeoutInput.parentElement.firstChild.textContent='连续无响应超时（秒）';timeoutInput.parentElement.insertAdjacentHTML('afterend','<p>流式接收期间只计算连续未收到数据的时间；每轮最多 10 分钟，不会自动重试收费请求。</p>');}
  if(state.route==='editor'){bindAIPanel();const anchor=view.querySelector('[data-act="creative-json"]');if(anchor){const ai=document.createElement('button');ai.type='button';ai.className='btn primary';ai.textContent='AI 创作';ai.onclick=openAICreation;anchor.before(ai);}}
  for(const [id,key] of [['search','query'],['kind-filter','kind'],['status-filter','status'],['series-filter','seriesID'],['sort-filter','sort']]){const el=view.querySelector('#'+id);if(el)el.addEventListener(id==='search'?'input':'change',()=>{state[key]=el.value;updateLibraryResults();});}
  if(state.route==='library')updateLibraryResults();
  const title=view.querySelector('#project-title');if(title)title.addEventListener('blur',()=>{const p=state.activeProject;p.title=title.textContent.trim()||'未命名手账';saveProject();});
  const draftSelect=view.querySelector('#draft-select');if(draftSelect)draftSelect.onchange=()=>{state.activeDraft=draftSelect.value;state.selected=null;resetEditorHistory(state);render();};
  if(state.route==='import'&&state.showManualBox)bindManualBox();
  for(const [id,key] of [['import-paper-width','customImportWidth'],['import-paper-height','customImportHeight']]){const el=view.querySelector('#'+id);if(el)el.onchange=()=>{const n=Number(el.value);if(!Number.isFinite(n)||n<1||n>10000){toast('纸张宽高为 1–10000 mm');return;}state[key]=n;recalibrateImport();};}const whole=view.querySelector('#whole-paper');if(whole)whole.onchange=()=>{state.wholePaper=whole.checked;recalibrateImport();};for(const [id,key] of [['paper-size','paperSize'],['paper-orientation','paperOrientation']]){const el=view.querySelector('#'+id);if(el)el.onchange=()=>{state[key]=el.type==='checkbox'?el.checked:el.value;recalibrateImport();};}
  const balance=view.querySelector('#balance-light');if(balance)balance.onchange=async()=>{const before=state.balanceLight;if(state.importProcessing){balance.checked=before;return;}if(state.importCandidateData?.length&&!confirm('更改光照会重新识别候选并重置当前候选标注，继续？')){balance.checked=before;return;}state.importProcessing='正在均衡光照并重新识别…';state.balanceLight=balance.checked;balance.disabled=true;try{await previewCrop();}catch(e){state.balanceLight=before;render();toast(e.message);}finally{state.importProcessing=false;if(state.route==='import')render();}};
  view.querySelectorAll('[data-import-name]').forEach(el=>el.onchange=()=>{const [ri,ci]=el.dataset.importName.split(':').map(Number);state.importRecords[ri].selectedCandidates[ci].title=el.value;});
  for(const key of ['width','height'])view.querySelectorAll(`[data-import-${key}]`).forEach(el=>el.onchange=()=>{const [ri,ci]=el.dataset[`import${key[0].toUpperCase()+key.slice(1)}`].split(':').map(Number);state.importRecords[ri].selectedCandidates[ci][key]=+el.value||null;});
  view.querySelectorAll('.record-series').forEach(el=>el.onchange=()=>{state.importRecords[+el.dataset.index].seriesID=el.value;});view.querySelectorAll('.record-work-title').forEach(el=>el.oninput=()=>{state.importRecords[+el.dataset.index].workTitle=el.value;});
  const batchSeries=view.querySelector('#batch-series');if(batchSeries)batchSeries.onchange=()=>{state.importBatchSeriesID=batchSeries.value;};
  const removeWhite=view.querySelector('#remove-white');if(removeWhite)removeWhite.onchange=()=>{state.importRemoveWhite=removeWhite.checked;};
  const page=view.querySelector('#canvas-page');if(page)initializeCanvasSurface(page);
  bindInspector();if(state.route==='import'&&state.importProcessing)view.querySelectorAll('.inspect-columns button,.inspect-columns input,.inspect-columns select').forEach(el=>el.disabled=true);if(state.route==='import'&&state.importStep==='inspect'&&state.importFile&&!state.importProcessing)mountPaperCorrection({state,view,render,toast,saveActiveImportRecord});const offline=view.querySelector('#offline-state');if(offline)offline.textContent=navigator.serviceWorker?.controller?'离线程序已就绪':'首次打开时需要联网；请等待离线程序安装后再测试飞行模式';const locationLabel=view.querySelector('#storage-location');if(locationLabel)db.storageMode().then(mode=>{if(locationLabel.isConnected)locationLabel.textContent=cloudEnabled?(import.meta.env?.VITE_SHIYE_OBJECT_STORAGE==='cos'?'当前数据源：Supabase 登录与元数据 + 腾讯 COS 私有图片；本机仅保留账号隔离缓存与待同步修改':'当前数据源：Supabase 私有云端；本机仅保留账号隔离缓存与待同步修改'):mode==='server'?`当前唯一数据源：${db.storageConfig()?.url||location.origin}（服务器）`:'当前数据源：此浏览器 IndexedDB';}).catch(error=>{if(locationLabel.isConnected)locationLabel.textContent='服务器连接失败：'+error.message;});}
function bindInspector(){const d=current(),e=d&&editorEntry(d).find(x=>x.value.id===state.selected);if(!d)return;
  const change=(id,fn)=>{const el=view.querySelector('#'+id);if(el)el.addEventListener('change',()=>{checkpoint();fn(el.value);saveProject();render();});};
  if(e){for(const [id,key] of [['inspector-width','width'],['inspector-height','height'],['inspector-rotation','rotation'],['inspector-z','zIndex'],['inspector-opacity','opacity'],['inspector-font-size','fontSize']])change(id,v=>{e.value[key]=Number(v);if(e.kind==='material')e.value.userOverrideFlags=[...new Set([...(e.value.userOverrideFlags||[]),key==='width'||key==='height'?'resized':key])];});change('inspector-text',v=>e.value.content=v);change('inspector-font',v=>e.value.style=v);}else{change('paper-color',v=>d.paperColor=v);change('paper-pattern',v=>d.paperPattern=v);change('page-ratio',v=>{if(presetPaperDimensions(v))setDraftPaperSize(d,v);});change('page-mode',v=>{d.pageMode=v;d.canvas=canvasSize(v,d.pageRatio);});}}
function checkpoint(){const d=current();if(!d)return;ensureEditorHistory(state);captureHistory(state.activeProject);state.undo.push(snapshotDraft(d));if(state.undo.length>40)state.undo.shift();state.redo=[];}
let saveTimer,saveChain=Promise.resolve(),savingProjects=0;
const dirtyProjects=new Map(),dirtyUsageAssets=new Map();
const saveVersions=new Map();
async function flushSave(){
  clearTimeout(saveTimer);saveTimer=null;
  const batch=[...dirtyProjects.values()].map(p=>({snapshot:structuredClone(p),version:saveVersions.get(p.id)})),usageBatch=[...dirtyUsageAssets.values()].map(asset=>structuredClone(asset));dirtyProjects.clear();dirtyUsageAssets.clear();
  if(!batch.length&&!usageBatch.length)return saveChain;
  savingProjects+=batch.length;
  saveChain=saveChain.catch(()=>{}).then(async()=>{let failure;
    if(usageBatch.length)try{await db.transaction(['assets'],tx=>{for(const asset of usageBatch)tx.objectStore('assets').put(asset);});}catch(error){for(const asset of usageBatch)if(!dirtyUsageAssets.has(asset.id))dirtyUsageAssets.set(asset.id,asset);failure??=error;}
    for(const {snapshot,version} of batch){try{await db.stageProject(snapshot);}catch(error){if(saveVersions.get(snapshot.id)===version&&!dirtyProjects.has(snapshot.id))dirtyProjects.set(snapshot.id,snapshot);failure??=error;}finally{savingProjects--;}}
    if(failure)throw failure;
  });
  try{await saveChain;if(!savingProjects&&!dirtyProjects.size&&!dirtyUsageAssets.size){syncDisplay.localPending=false;updateSyncIndicator();saveStatus(cloudEnabled?'修改已暂存 · 后台同步中':(await db.storageMode())==='server'?'已保存到服务器':'已保存到本机');}}catch(e){console.error(e);syncDisplay.error=e;updateSyncIndicator();saveStatus('暂存失败 · 修改仍在当前页面');toast('修改暂存失败，暂勿关闭页面：'+e.message);throw e;}
}
function saveSpecificProject(p){if(!p)return;delete p.isTemplate;if(cloudEnabled)p.__cloudSessionId||=crypto.randomUUID();const now=new Date().toISOString();p.updatedAt=now;if(p.isUsed)for(const updated of markProjectAssetsUsed(p,state.assets,now)){const live=state.assets.find(asset=>asset.id===updated.id);if(live)Object.assign(live,updated);dirtyUsageAssets.set(updated.id,updated);}saveVersions.set(p.id,(saveVersions.get(p.id)||0)+1);dirtyProjects.set(p.id,p);saveStatus('后台保存中…');syncDisplay.localPending=true;updateSyncIndicator();clearTimeout(saveTimer);saveTimer=setTimeout(()=>flushSave().catch(console.error),150);}
function saveProject(){saveSpecificProject(state.activeProject);}
const pendingAISnapshots=new Set();
function saveAISnapshotInBackground(p){
  if(!p?.aiGenerated||pendingAISnapshots.has(p.id)||state.projects.some(item=>item.isSnapshot&&item.sourceProjectID===p.id))return;
  pendingAISnapshots.add(p.id);
  void saveProjectSnapshot(p).catch(error=>{
    toast('可编辑作品已保存，快照待重试：'+error.message);
  }).finally(()=>pendingAISnapshots.delete(p.id));
}
function initializeCanvasSurface(page){const d=current();const paper=page.querySelector('.paper-layer');if(paper){drawPaper(paper.getContext('2d'),d);page.dataset.paperKey=JSON.stringify([d.paperColor,d.paperPattern,d.paperRuling,d.drawCenterGutter]);}
  for(const el of page.querySelectorAll('.canvas-object.material')){const item=d.items.find(i=>i.id===el.dataset.object),crop=item?.cropRect,im=el.querySelector('img');if(!crop||!im)continue;im.style.cssText=`position:absolute;max-width:none;width:${100/crop.width}%;height:${100/crop.height}%;left:${-crop.x/crop.width*100}%;top:${-crop.y/crop.height*100}%;object-fit:fill`;}
}

async function handle(action,id,value){try{switch(action){
  case 'import-work':openImportGallery('work');break;
  case 'import-snapshot':offlineSnapshotProject=null;snapshotFileInput.click();break;
  case 'import':openImportGallery('material');break;case 'back-library':navigateBack('library');break;case 'back-works':if(state.offlineEditingReturnID===state.activeProject?.id){await flushSave();await matchingSession.reflectProject(state.activeProject);state.offlineEditingReturnID=null;}navigateBack('works');break;case 'editor-done':{const p=state.activeProject,offline=state.offlineEditingReturnID===p?.id;p.isDraft=false;saveProject();await flushSave();saveAISnapshotInBackground(p);if(offline){await matchingSession.reflectProject(p);state.offlineEditingReturnID=null;navigateBack('matching');}else route('works');break;}
  case 'select-file':if(value==='files'&&state.importMode==='work'){workFileInput.click();break;}if(value==='camera')fileInput.setAttribute('capture','environment');else fileInput.removeAttribute('capture');fileInput.click();break;case 'preview-crop':await previewCorrection();break;case 'confirm-import':await saveImportBatch({state,db,urls,render,onSaved:organizeSavedAssets});break;
  case 'import-switch':await switchImportRecord(Number(id));break;case 'import-back':if(state.importStep==='review'){state.importStep='inspect';render();}else if(state.importStep==='done'){navigateBack(state.importMode==='work'?'works':'library');}else if(!state.importRecords.length||confirm('放弃未保存的照片？'))navigateBack(state.importMode==='work'?'works':'library');break;
  case 'import-exit':if(state.importStep==='done'||!state.importRecords.length||confirm('放弃未保存的照片？'))navigateBack(state.importMode==='work'?'works':'library');break;
  case 'import-continue':if(state.importStep==='done'){resetImportBatch();render();}break;
  case 'manual-import-box':await openManualImportBox();break;case 'readjust-paper':state.showCorrectionPreview=false;discardPaperPreview();render();break;case 'apply-paper-preview':await applyPaperPreview();break;
  case 'rotate-photo':await rotateImportPhoto();break;
  case 'import-toggle-candidate':state.importCandidateSelection||=new Set();state.importCandidateSelection.has(Number(id))?state.importCandidateSelection.delete(Number(id)):state.importCandidateSelection.add(Number(id));state.importRecords[state.importIndex].confirmed=false;saveActiveImportRecord();{const tile=view.querySelector('[data-act="import-toggle-candidate"][data-id="'+id+'"]'),selected=state.importCandidateSelection.has(Number(id));tile?.classList.toggle('selected',selected);tile?.setAttribute('aria-pressed',String(selected));if(tile)tile.querySelectorAll('span')[1].textContent='素材 '+(Number(id)+1)+' '+(selected?'✓':'○');}break;
  case 'import-confirm-photo':await confirmImportPhoto();break;
  case 'review-toggle':{const c=state.importRecords[Number(id)].selectedCandidates[Number(value)];c.selected=!c.selected;render();break;}
  case 'choose-candidate':await chooseCandidate(Number(id));break;
  case 'detail':openLibraryAsset(id);break;case 'detail-back':libraryBack();break;case 'detail-add':if((asset(state.detailAssetID)?.supply?.quantity??1)===0)throw Error('素材可用库存为 0');state.basket=[...new Set([...state.basket,state.detailAssetID])];toast('已加入本次创作');render();break;case 'detail-match':if((asset(state.detailAssetID)?.supply?.quantity??1)===0)throw Error('素材可用库存为 0');state.matchCore=state.detailAssetID;state.basket=[...new Set([...state.basket,state.detailAssetID])];route('matching');break;case 'detail-series':libraryHistory.push({route:state.route,seriesID:state.seriesID,detailAssetID:state.detailAssetID});state.seriesID=asset(state.detailAssetID)?.seriesID||'all';route('library');break;case 'detail-similar':view.dispatchEvent(new CustomEvent('show-similar'));break;case 'detail-edit':openDetail(state.detailAssetID);break;case 'detail-check':await openCutoutCheck(state.detailAssetID);break;case 'detail-favorite':{const a=asset(state.detailAssetID),next={...a,isFavorite:!a.isFavorite};await db.put('assets',next);Object.assign(a,next);render();toast(next.isFavorite?'已收藏':'已取消收藏');break;}
  case 'new-series':openSeriesEditor();break;case 'series-detail':libraryHistory.push({route:state.route,seriesID:state.seriesID,detailAssetID:state.detailAssetID});state.seriesID=id;route('library');break;
  case 'match-library':route('library');break;case 'match-context':{const scope=matchingScope();toast(`必须 ${scope.required.length} · 优先 ${scope.preferred.length} · 可用 ${scope.available.length} · 不使用 ${scope.excluded.length}`);break;}
  case 'match-filter':state.recommendFilter=value;render();break;case 'match-skip':state.excludedAssetIDs=[...new Set([...state.excludedAssetIDs,id])];render();break;case 'match-allow':state.excludedAssetIDs=state.excludedAssetIDs.filter(x=>x!==id);render();break;
  case 'match-core':state.coreIDs=state.coreIDs.includes(id)?state.coreIDs.filter(x=>x!==id):[...state.coreIDs,id];state.matchCore=state.coreIDs[0]||state.basket[0];render();break;
  case 'match-use':openMaterialUse(id);break;
  case 'match-generate':state.matchPurpose=view.querySelector('#match-purpose')?.value||'日常记录';state.matchProcessing=view.querySelector('#match-processing')?.value||'保留完整';state.matchStyle=view.querySelector('#match-style')?.value||state.matchStyle;state.matchIntent=view.querySelector('#match-intent')?.value||'';captureMatchContent();state.matchMode=view.querySelector('#match-mode')?.value||'single';state.matchRatio=readMatchPaper();state.matchStyles=readMatchSelection('match-style',state.matchStyle);state.matchPurposes=readMatchSelection('match-purpose',state.matchPurpose);await matchingSession.generate();break;
  case 'match-export-gpt':await exportOfflineCreation();break;
  case 'match-import-gpt':openOfflineImportDialog();break;
  case 'basket':{const removing=state.basket.includes(id);state.basket=removing?state.basket.filter(x=>x!==id):[...state.basket,id];if(removing)state.coreIDs=state.coreIDs.filter(x=>x!==id);else state.excludedAssetIDs=state.excludedAssetIDs.filter(x=>x!==id);render();break;}
  case 'reset-match':if(!confirm('重新搭配？已有保存作品不会被删除。'))break;await matchingSession.reset(()=>{state.matchCore=null;state.basket=[];state.coreIDs=[];state.excludedAssetIDs=[];});render();break;
  case 'create-from-basket':openManualCreationDialog();break;case 'new-project':{const opening=++editorOpenSequence;await flushSave();if(opening!==editorOpenSequence)break;const p=project();state.projects.push(p);state.activeProject=p;state.activeDraft=p.activeDraftID;resetEditorHistory(state);state.tool=state.toolHighlight='select';state.zoom=1;route('editor');saveProject();break;}
  case 'open-project':{const opening=++editorOpenSequence;await flushSave();if(opening!==editorOpenSequence)break;let p=state.projects.find(p=>p.id===id);if(!p)break;if(p.isSnapshot){state.previewProjectID=p.id;route('projectPreview');break;}if(p.projectDocumentPath){toast('正在读取完整作品…');p=await db.get('projects',p.id);if(opening!==editorOpenSequence)break;if(!p)throw Error('作品完整数据尚未载入');state.projects=state.projects.map(old=>old.id===p.id?p:old);}state.activeProject=p;state.activeDraft=p.activeDraftID;state.offlineEditingReturnID=null;resetEditorHistory(state);state.tool=state.toolHighlight='select';state.zoom=state.canvasViewports?.get(p.id+':'+state.activeDraft)?.scale||1;route('editor');break;}
  case 'preview-back':navigateBack('works');break;case 'preview-continue':{await handle('open-project',state.previewProjectID);break;}
  case 'project-meta':openProjectMetadata();break;
  case 'save-snapshot':await saveProjectSnapshot(state.activeProject);break;
  case 'download-snapshot':{const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p?.isSnapshot)break;const id=p.snapshotDocumentBlobId||p.snapshotBlobId,blob=(await db.get('blobs',id))?.data;if(!blob)throw Error('快照文件尚未同步，稍后重试');const ext=p.snapshotFormat==='application/pdf'?'pdf':p.snapshotFormat==='image/jpeg'?'jpg':p.snapshotFormat==='image/webp'?'webp':'png';download(blob,p.title+'.'+ext);break;}
  case 'download-project-zip':{const source=state.projects.find(x=>x.id===id)||state.activeProject;if(!source||source.isSnapshot)throw Error('可编辑作品不存在');const p=source.projectDocumentPath?await db.completeProject(source):source;download(createNativeProjectPackage(p),p.title+'.shiyeproject.zip');break;}
  case 'project-delete':{const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p||!confirm('将这份作品移到最近删除？'))break;await flushSave();await db.flushProjects();const entry={id:uid(),kind:'project',item:structuredClone(p),date:new Date().toISOString()};await db.transaction(['projects','trash'],tx=>{tx.objectStore('projects').delete(p.id);tx.objectStore('trash').put(entry);});state.projects=state.projects.filter(x=>x.id!==p.id);state.trash.push(entry);state.previewProjectID=null;route('works');break;}
  case 'works-filter':state.worksFilter=value;render();break;case 'tool':state.tool=value;if(value==='text'){checkpoint();const d=current();const t=textBlock('在这里写下今天的故事',d);d.textBlocks.push(t);state.selected=t.id;state.tool='select';saveProject();}else if(value==='shape'){checkpoint();const d=current();const s=primitive('roundedRectangle',d);d.primitives.push(s);state.selected=s.id;state.tool='select';saveProject();}else if(value==='material'){openMaterialPicker();return;}render();break;
  case 'zoom-in':state.zoom=Math.min(4,state.zoom+.15);render();break;case 'zoom-out':state.zoom=Math.max(1,state.zoom-.15);render();break;
  case 'paper-menu':state.editorPanel=!state.editorPanel;state.selected=null;render();break;case 'undo':historyStep('undo','redo');break;case 'redo':historyStep('redo','undo');break;
  case 'new-draft':{checkpoint();const d=structuredClone(current());d.id=uid();d.title='方案 '+(state.activeProject.drafts.length+1);state.activeProject.drafts.push(d);state.activeProject.activeDraftID=d.id;state.activeDraft=d.id;resetEditorHistory(state);saveProject();render();break;}
  case 'duplicate':editSelected((e,d)=>{const copy={...structuredClone(e.value),id:uid(),x:e.value.x+25,y:e.value.y+25};(e.kind==='material'?d.items:e.kind==='shape'?d.primitives:d.textBlocks).push(copy);state.selected=copy.id;});break;
  case 'flip':editSelected(e=>{e.value.isFlippedHorizontally=!e.value.isFlippedHorizontally;});break;
  case 'front':editSelected((e,d)=>{e.value.zIndex=Math.max(0,...editorEntry(d).map(x=>x.value.zIndex))+1;});break;
  case 'delete-object':editSelected((e,d)=>{const key=e.kind==='material'?'items':e.kind==='shape'?'primitives':'textBlocks';d[key]=d[key].filter(x=>x.id!==state.selected);state.selected=null;});break;
  case 'restore-baseline':editSelected(e=>{const b=e.value.generationBaseline;if(b){Object.assign(e.value,structuredClone(b));e.value.userOverrideFlags=[];}});break;
  case 'park':editSelected(e=>{if(e.kind==='material'){e.value.isParked=true;state.selected=null;}});break;
  case 'unpark':editSelected((e,d)=>{const item=d.items.find(x=>x.id===id);if(item)item.isParked=false;});break;
  case 'save-work':{const p=state.activeProject,offline=state.offlineEditingReturnID===p?.id;p.isDraft=false;saveProject();await flushSave();saveAISnapshotInBackground(p);if(offline){await matchingSession.reflectProject(p);state.offlineEditingReturnID=null;navigateBack('matching');}toast(cloudEnabled?'作品已暂存，正在后台同步':'作品已保存');break;}
  case 'match-open-result':await matchingSession.open(id);break;
  case 'match-stop':matchingSession.stop();break;
  case 'save-archive':{const p=state.activeProject;(p.manualArchives||=[]).push({id:uid(),date:new Date().toISOString(),drafts:structuredClone(p.drafts),activeDraftID:p.activeDraftID});saveProject();render();toast('手动存档已保存');break;}
  case 'restore-archive':{const p=state.activeProject,a=p.manualArchives.find(x=>x.id===id);if(!a||!confirm('恢复此存档会替换当前编辑状态，确定吗？'))break;p.drafts=structuredClone(a.drafts);p.activeDraftID=a.activeDraftID;state.activeDraft=a.activeDraftID;saveProject();render();break;}
  case 'export-png':await exportPNG();break;case 'print':await printPage();break;
  case 'creative-json':openCreativeJSON();break;
  case 'recognition-diagnostics':{
    const rec=state.importRecords[state.importIndex],trace=rec?.recognitionDiagnostic;
    if(!trace)throw Error('请先完成当前照片的识别');
    const report={format:'shiye-recognition-box-diagnostics',version:2,
      originalPixelSize:[state.importBitmap?.width,state.importBitmap?.height],
      autoPaperCorners:rec.autoPaperCorners||null,paperCorners:rec.corners||null,
      appliedPaperCorners:rec.appliedCorners?JSON.parse(rec.appliedCorners):null,
      correctedPixelSize:rec.correctedBitmap?[rec.correctedBitmap.width,rec.correctedBitmap.height]:null,
      paperOrientation:rec.paperOrientation||'auto',paperSize:rec.paperSize||'a4',
      ...trace,visibleCount:rec.candidates?.length||0};
    download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),
      '拾页素材框诊断.json');
    toast('已导出不含照片的素材框诊断');break;
  }
  case 'backup':await backup();break;case 'restore':backupInput.click();break;case 'backup-emergency':{await flushSave();const blob=await db.createEmergencyBackup();download(blob,'拾页待同步应急包-'+new Date().toISOString().slice(0,10)+'.shiyerecovery');toast('应急包已导出，请妥善保存，包含私人图片和文字');break;}case 'restore-emergency':emergencyInput.click();break;case 'restore-trash':await restoreTrash(id);break;
  case 'storage-token':{const token=view.querySelector('#data-server-token')?.value.trim();if(!token)throw Error('请输入新的访问令牌');const old=db.storageConfig();db.setStorageConfig({url:location.origin,token});try{await db.storageMode();toast('令牌已更新');}catch(error){db.setStorageConfig(old);throw error;}break;}
  case 'storage-connect':{await flushSave();const old=db.storageConfig(),url=view.querySelector('#data-server-url')?.value.trim(),token=view.querySelector('#data-server-token')?.value.trim();if(!url)throw Error('请输入拾页数据服务地址');db.setStorageConfig({url,token});try{await db.storageMode();state.activeProject=null;state.basket=[];await refresh();toast('已连接服务器');}catch(error){db.setStorageConfig(old);throw error;}break;}
  case 'storage-browser':{if(state.selfHosted)throw Error('自托管网站不允许切换到浏览器资料');await flushSave();db.setStorageConfig(null);state.activeProject=null;state.basket=[];await refresh();toast('已切换为本浏览器资料');break;}
  case 'help':{const {showHelp}=await import('./help-ui.js');showHelp({body,modal});break;}case 'settings-open':captureSettings();state.settingsSection=value;render();break;case 'settings-back':if(state.settingsSection){captureSettings();state.settingsSection=null;render();}else route(settingsSession?.returnRoute||'series');break;case 'settings-save':{captureSettings();const cfg=state.aiSettings;if(!cfg.model.trim())throw Error('请输入模型 ID');const endpoint=new URL(cfg.endpoint);if(endpoint.protocol!=='https:')throw Error('API 地址必须使用 HTTPS');if(cfg.provider!=='custom'&&endpoint.host!==new URL(AI_PROVIDERS[cfg.provider].endpoint).host)throw Error('服务商与 API 地址不一致；自定义地址请选“自定义兼容接口”');const returnRoute=settingsSession?.returnRoute||'series';state.aiSettings=saveAISettings(cfg);state.preferences=savePreferences(state.preferences);settingsSession=null;state.settingsSection=null;route(returnRoute);toast('设置已保存');break;}
}}catch(e){console.error(e);toast(e.message||'操作失败');}}
function editSelected(fn){const d=current(),e=editorEntry(d).find(x=>x.value.id===state.selected);if(!e&&state.selected)return;checkpoint();fn(e,d);saveProject();render();}
function historyStep(from,to){view.endTextEditing?.();const d=current(),snapshot=takeEditorHistoryStep(state,from,to,d);if(!snapshot)return;for(const key of Object.keys(d))delete d[key];Object.assign(d,snapshot);state.activeDraft=snapshot.id;saveProject();render();}
function readMatchPaper(){const ratio=view.querySelector('#match-ratio')?.value||'a4';if(ratio!=='custom')return ratio;const w=Number(view.querySelector('#match-paper-width')?.value),h=Number(view.querySelector('#match-paper-height')?.value);if(!Number.isInteger(w)||!Number.isInteger(h)||w<50||h<50||w>1000||h>1000)throw Error('自定义纸张宽高需要是 50–1000 mm 的整数');state.customPaperWidth=w;state.customPaperHeight=h;return `custom:${w}x${h}`;}
function captureMatchContent(){state.matchContentPolicy=view.querySelector('#match-content-policy')?.value||'documentary';state.matchUserText=view.querySelector('#match-user-text')?.value||'';state.matchFacts=view.querySelector('#match-facts')?.value||'';}
function openMaterialUse(id){const a=asset(id);if(!a)return;const others=state.basket.length>1;const choices=['由生成器选择','完整保留',...(others?['从另一件后露出']:[]),...(a.kind==='tape'&&others?['截段固定']:[]),...(['paper','photo','tape'].includes(a.kind)?['取一块真实区域',]:[]),'稍后手工剪图案'];const processing=['AI 自主加工','保留完整','少量裁剪','自由拆解'];body.innerHTML=`<h2>${esc(a.title)} · 用法</h2><p>每件素材可以单独选择用法与加工权限。</p><div class="stack"><label>用法<select id="material-use-choice">${choices.map(x=>`<option ${(state.materialUseHints[id]||'由生成器选择')===x?'selected':''}>${x}</option>`).join('')}</select></label><label>加工权限<select id="material-use-processing">${processing.map(x=>`<option ${(state.assetProcessing[id]||state.matchProcessing)===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="toggle-row">要求每个方案做到此用法 <input type="checkbox" id="material-use-required" ${state.materialUseRequired[id]?'checked':''}></label><div class="actions"><button class="btn primary" id="material-use-save">确定</button><button class="btn" id="material-use-cancel">取消</button></div></div>`;modal.showModal();body.querySelector('#material-use-cancel').onclick=()=>modal.close();body.querySelector('#material-use-save').onclick=()=>{const use=body.querySelector('#material-use-choice').value;state.materialUseHints[id]=use==='由生成器选择'?null:use;state.assetProcessing[id]=body.querySelector('#material-use-processing').value;state.materialUseRequired[id]=!!state.materialUseHints[id]&&use!=='稍后手工剪图案'&&body.querySelector('#material-use-required').checked;modal.close();render();};}
function createMatchingProject(automatic=true){const scope=matchingScope();if(!scope.candidateAssetIDs.length||!automatic&&!state.basket.length)throw Error('请先选择素材');const p=project('新的手账',{mode:state.matchMode||'single',ratio:state.matchRatio||'a4',style:state.matchStyle||'韩系清新'}),d=p.drafts[0];d.items=automatic?[]:physicalPlacement(d,state.assets,state.basket.slice(0,8));p.candidateAssetIDs=automatic?scope.candidateAssetIDs:[...state.basket];p.materialPriority=automatic?scope:{...scope,available:[],candidateAssetIDs:[...state.basket]};p.purpose=state.matchPurpose;p.intent=state.matchIntent;p.contentPolicy=state.matchContentPolicy;p.userText=state.matchUserText;p.providedFacts=state.matchFacts;p.styles=readMatchSelection('match-style',state.matchStyle);p.purposes=readMatchSelection('match-purpose',state.matchPurpose);p.requiredAssetIDs=[...scope.required];p.processing=state.matchProcessing;p.materialUseHints=Object.fromEntries(state.basket.filter(id=>state.materialUseHints[id]).map(id=>[id,state.materialUseHints[id]]));p.materialUseRequired=Object.fromEntries(state.basket.filter(id=>state.materialUseRequired[id]).map(id=>[id,true]));p.assetProcessing=Object.fromEntries(state.basket.filter(id=>state.assetProcessing[id]).map(id=>[id,state.assetProcessing[id]]));return p;}
async function exportOfflineCreation(){
  if(!matchingScope().candidateAssetIDs.length){toast('请先选择素材');return;}
  state.matchPurpose=view.querySelector('#match-purpose')?.value||state.matchPurpose;state.matchProcessing=view.querySelector('#match-processing')?.value||state.matchProcessing;state.matchStyle=view.querySelector('#match-style')?.value||state.matchStyle;state.matchIntent=view.querySelector('#match-intent')?.value||'';captureMatchContent();state.matchMode=view.querySelector('#match-mode')?.value||state.matchMode;state.matchRatio=readMatchPaper();state.matchStyles=readMatchSelection('match-style',state.matchStyle);state.matchPurposes=readMatchSelection('match-purpose',state.matchPurpose);
  const button=view.querySelector('[data-act="match-export-gpt"]');if(button){button.disabled=true;button.textContent='正在准备 AI 参考…';}
  try{
    const p=createMatchingProject(),assetsSnapshot=structuredClone(state.assets),aliases=materialAliases(p.candidateAssetIDs),previews=[],referenceImages=[],cfg=structuredClone(state.aiSettings);
    // API requests may cap image count; the offline package must contain every
    // selected material so ChatGPT can inspect the whole basket. Limit parallel
    // decoding to keep iPad memory and the foreground responsive.
    if(cfg.includeThumbnails){const entries=Object.entries(aliases);for(let offset=0;offset<entries.length;offset+=3){const group=await Promise.all(entries.slice(offset,offset+3).map(async([alias,id])=>{const chosen=assetsSnapshot.find(item=>item.id===id);if(!chosen)throw Error('创作素材已变更，请重新导出任务包');const bytes=await offlinePreviewBytes(chosen);if(!bytes)throw Error('素材「'+chosen.title+'」缺少预览图，请先检查同步状态');return {alias,bytes};}));previews.push(...group);}}
    if(cfg.sendPresetReferences){const bundle=await loadJournalTemplateReferences({context:{styles:p.styles,purposes:p.purposes,materials:assetsSnapshot.filter(asset=>p.candidateAssetIDs.includes(asset.id))},userTemplates:state.userTemplates,db});referenceImages.push(...bundle.referenceImages);}
    const result=await createOfflineHandoff({project:p,assets:assetsSnapshot,aliases,previews,referenceImages,settings:cfg,userTemplates:state.userTemplates});
    p.offlineBundleId=result.source.bundleId;
    await offlineTaskStore.save(await offlineTaskAccount(),result.source);
    const fileSize=n=>n<1024*1024?`${Math.ceil(n/1024)} KB`:`${(n/1024/1024).toFixed(1)} MB`;
    const imageDelivery=result.deliveryMode==='image';
    if(imageDelivery){
      body.innerHTML=`<section class="offline-handoff"><div class="offline-handoff-heading"><span class="offline-handoff-emblem">${iconMarkup('sparkles')}</span><div><small>网页版 AI · 画面创作</small><h2>把这一页交给 AI</h2></div></div><p class="offline-handoff-intro">${p.candidateAssetIDs.length} 件可用素材 · ${esc(p.styles?.join('、')||'所选风格')} · ${esc(p.drafts[0].pageRatio.toUpperCase())} · 任务包 ${fileSize(result.packageBytes)}（图片 ${fileSize(result.imageBytes)}）</p><div class="offline-handoff-step"><span class="offline-handoff-number">1</span><div><strong>复制要求并发送素材包</strong><small>这个 ZIP 是输入素材包，不是要求 AI 生成的文件。请让 AI 在回复中展示画面并提供可下载的 PNG。</small></div></div><textarea id="offline-gpt-prompt" readonly rows="3" aria-label="发送给网页版 AI 的短提示词">${esc(result.prompt)}</textarea><button type="button" class="btn primary offline-handoff-main" id="offline-copy-prompt">${iconMarkup('copy')}<span>复制并打开素材包</span></button><p id="offline-handoff-status" role="status">准备就绪 · ${esc(result.filename)}</p><div class="offline-handoff-alternatives"><button type="button" class="btn" id="offline-share-package">${iconMarkup('share')}<span>分享素材包</span></button><button type="button" class="btn" id="offline-download-package">${iconMarkup('fileDown')}<span>重新下载</span></button></div><div class="offline-handoff-step offline-handoff-return"><span class="offline-handoff-number">2</span><div><strong>将完成的画面导回拾页</strong><small>下载 AI 返回的 PNG、JPEG 或 WebP 图片，导入后保存为画面快照，并出现在版本方案中。</small></div></div><button type="button" class="btn" id="offline-import-file">${iconMarkup('fileUp')}<span>导入生成的图片</span></button><p class="offline-handoff-footnote">浏览器无法替你选择 AI 会话，也无法自动删除系统下载的文件。</p></section>`;
    }else{
    body.innerHTML=`<section class="offline-handoff"><div class="offline-handoff-heading"><span class="offline-handoff-emblem">${iconMarkup('sparkles')}</span><div><small>网页版 GPT · 创作交接</small><h2>把这一页交给 GPT</h2></div></div><p class="offline-handoff-intro">${p.candidateAssetIDs.length} 件可用素材 · ${esc(p.styles?.join('、')||'所选风格')} · ${esc(p.drafts[0].pageRatio.toUpperCase())}${referenceImages.length?` · ${referenceImages.length} 张匹配案例`:''} · 任务包 ${fileSize(result.packageBytes)}（图片 ${fileSize(result.imageBytes)}）</p><div class="offline-handoff-delivery" role="group" aria-label="GPT 结果形式"><button type="button" class="selected" data-offline-delivery="file" aria-pressed="true">可编辑文件</button><button type="button" data-offline-delivery="json" aria-pressed="false">复制 JSON</button></div><div class="offline-handoff-step"><span class="offline-handoff-number">1</span><div><strong>复制创作要求并打开任务包</strong><small>复制成功后自动下载；在系统文件页分享给 ChatGPT，或在 ChatGPT 手动附加。</small></div></div><textarea id="offline-gpt-prompt" readonly rows="2" aria-label="发送给 ChatGPT 的短提示词">${esc(result.prompt)}</textarea><button type="button" class="btn primary offline-handoff-main" id="offline-copy-prompt">${iconMarkup('copy')}<span>复制并打开任务包</span></button><p id="offline-handoff-status" role="status">准备就绪 · ${esc(result.filename)}</p><div class="offline-handoff-alternatives"><button type="button" class="btn" id="offline-share-package">${iconMarkup('share')}<span>分享文件</span></button><button type="button" class="btn" id="offline-download-package">${iconMarkup('fileDown')}<span>重新下载</span></button></div><div class="offline-handoff-step offline-handoff-return"><span class="offline-handoff-number">2</span><div><strong>将 GPT 的结果导回拾页</strong><small>下载 .shiyeproject.json，或复制回复中的单个 JSON 代码块。</small></div></div><div class="offline-handoff-alternatives"><button type="button" class="btn" id="offline-import-file">${iconMarkup('fileUp')}<span>选择结果文件</span></button><button type="button" class="btn" id="offline-show-paste">${iconMarkup('copy')}<span>粘贴 JSON</span></button></div><div class="offline-handoff-paste" hidden><textarea id="offline-gpt-result" rows="4" placeholder="粘贴完整 JSON 或单个代码块"></textarea><div class="offline-handoff-alternatives"><button type="button" class="btn" id="offline-paste-result">粘贴剪贴板</button><button type="button" class="btn primary" id="offline-import-text">验证并导入</button></div></div><p class="offline-handoff-footnote">临时对话需在 ChatGPT 内开启；浏览器无法替你选择 ChatGPT 的会话或自动删除系统下载文件。</p></section>`;
    }
    if(!imageDelivery){
    body.querySelector('[data-offline-delivery="file"]').textContent='可编辑作品包';
    body.querySelector('.offline-handoff-return small').textContent='先查看 AI 返回的构图预览，再下载 .shiyeproject.zip 导入；最终字体与阅读以拾页为准。也可复制完整 JSON。';
    }
    body.querySelector('#offline-gpt-prompt').rows=3;
    modal.showModal();
    body.querySelectorAll('[data-offline-delivery]').forEach(button=>button.onclick=()=>{for(const option of body.querySelectorAll('[data-offline-delivery]')){const selected=option===button;option.classList.toggle('selected',selected);option.setAttribute('aria-pressed',String(selected));}body.querySelector('#offline-gpt-prompt').value=result.prompts[button.dataset.offlineDelivery];});
    const openPackage=()=>{const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=result.filename;link.target='_blank';link.rel='noopener';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);};
    body.querySelector('#offline-copy-prompt').onclick=()=>{const input=body.querySelector('#offline-gpt-prompt');input.select();if(document.execCommand('copy')){openPackage();body.querySelector('#offline-handoff-status').textContent='提示词已复制 · 任务包已打开；在文件页分享给 ChatGPT。';return;}navigator.clipboard.writeText(input.value).then(()=>{openPackage();body.querySelector('#offline-handoff-status').textContent='提示词已复制 · 任务包已打开；在文件页分享给 ChatGPT。';}).catch(()=>toast('复制失败，请长按提示词手动复制'));};
    body.querySelector('#offline-share-package').onclick=async()=>{const file=new File([result.blob],result.filename,{type:'application/zip'});if(!navigator.canShare?.({files:[file]})){openPackage();toast('设备不支持文件分享，已打开任务包');return;}try{await navigator.share({files:[file]});}catch(error){if(error?.name!=='AbortError'){openPackage();toast('分享未完成，已打开任务包');}}};
    body.querySelector('#offline-download-package').onclick=()=>download(result.blob,result.filename);
    if(!imageDelivery){
      body.querySelector('#offline-show-paste').onclick=()=>{const panel=body.querySelector('.offline-handoff-paste');panel.hidden=!panel.hidden;if(!panel.hidden)panel.querySelector('textarea').focus();};
      body.querySelector('#offline-import-text').onclick=async()=>{try{await importOfflineText(body.querySelector('#offline-gpt-result').value);modal.close();}catch(error){toast('导入失败：'+error.message);}};
      body.querySelector('#offline-paste-result').onclick=()=>pasteOfflineResult();
    }
    body.querySelector('#offline-import-file').onclick=()=>{if(imageDelivery){offlineSnapshotProject=p;snapshotFileInput.click();}else workFileInput.click();};
  }catch(error){console.error(error);toast('AI 参考导出失败：'+error.message);}finally{if(button){button.disabled=false;button.textContent='导出给网页版 AI';}}
}
function openOfflineImportDialog(){
  if(state.aiSettings.deliveryMode==='image'){
    body.innerHTML='<h2>导入网页版 AI 画面</h2><p>请选择网页版 AI 完成并下载的 PNG、JPEG 或 WebP 图片。画面会作为不可编辑快照保存，并加入本次搭配的版本方案。</p><div class="actions"><button type="button" class="btn primary" id="offline-import-file">选择画面图片</button></div>';
    modal.showModal();
    body.querySelector('#offline-import-file').onclick=()=>{offlineSnapshotProject=matchingScope().candidateAssetIDs.length?createMatchingProject():null;snapshotFileInput.click();};
    return;
  }
  body.innerHTML='<h2>导入网页版 AI 结果</h2><p>选择 .shiyeproject.zip 可编辑作品包；若 AI 返回 JSON，也可粘贴代码块或选择 .json 文件。换设备时先选原始创作任务 ZIP 登记，再选 AI 结果。拾页验证后保存为可编辑草稿。</p><textarea id="offline-gpt-result" rows="9" placeholder="粘贴完整 JSON，或包含 JSON 的单个代码块"></textarea><div class="actions"><button type="button" class="btn" id="offline-paste-result">粘贴剪贴板</button><button type="button" class="btn primary" id="offline-import-text">验证并导入</button><button type="button" class="btn" id="offline-import-file">选择 ZIP 或 JSON</button></div>';
  modal.showModal();
  body.querySelector('#offline-paste-result').onclick=()=>pasteOfflineResult();
  body.querySelector('#offline-import-text').onclick=async()=>{try{await importOfflineText(body.querySelector('#offline-gpt-result').value);}catch(error){toast('导入失败：'+error.message);}};
  body.querySelector('#offline-import-file').onclick=()=>workFileInput.click();
}
async function pasteOfflineResult(){try{body.querySelector('#offline-gpt-result').value=await navigator.clipboard.readText();toast('已粘贴 GPT 的可编辑数据');}catch{toast('无法读取剪贴板，请长按输入框粘贴');}}
async function importOfflineProject(p){await flushSave();p.aiGenerated=true;await matchingSession.importProject(p);state.activeProject=p;state.activeDraft=p.activeDraftID;resetEditorHistory(state);state.offlineEditingReturnID=p.id;state.tool='select';if(modal.open)modal.close();if(state.route!=='matching')route('matching');route('editor');toast(p.creationVerification?.preview==='mismatch'?'已保存可编辑草稿；外部预览或清单有差异，请核对画面':'已加入版本方案；可编辑数据已检查，预览与正文仍需复核');}
async function offlineTaskAccount(){return cloudEnabled?(await requireCloudUser()).id:'browser';}
async function trustedOfflineSource(source){if(!source?.bundleId)return null;const trusted=await offlineTaskStore.load(await offlineTaskAccount(),source.bundleId);if(!trusted&&source.taskBinding==='local-v1')throw Error('未找到此网页版 AI 任务的原始快照；请先在此设备导入原始创作任务 ZIP，再导入 AI 结果');return trusted;}
async function importOfflineText(text){const trustedSource=await trustedOfflineSource(inspectEditableSource(text)?.source);return importOfflineProject(importEditableWork(text,state.assets,{trustedSource}));}
async function createFromBasket(templateID=null){
  await flushSave();
  const p=createMatchingProject(false),draft=p.drafts[0];
  let result=null;
  if(templateID)result=applyManualLayout(draft,state.assets,state.basket,templateID);
  else draft.items=[];
  await db.put('projects',p);
  state.projects.push(p);state.activeProject=p;state.activeDraft=p.activeDraftID;resetEditorHistory(state);state.tool='select';
  await matchingSession.persist();route('editor');
  if(result?.remaining)toast(`已预排版 ${result.placed} 件；其余 ${result.remaining} 件可在画布中手动添加`);
}
function openManualCreationDialog(){
  state.matchRatio=readMatchPaper();state.matchStyle=view.querySelector('#match-style')?.value||state.matchStyle;state.matchPurpose=view.querySelector('#match-purpose')?.value||state.matchPurpose;
  state.matchProcessing=view.querySelector('#match-processing')?.value||state.matchProcessing;
  state.matchStyles=readMatchSelection('match-style',state.matchStyle);state.matchPurposes=readMatchSelection('match-purpose',state.matchPurpose);
  const choices=manualLayoutChoices({assets:state.assets,basket:state.basket,styles:state.matchStyles,purposes:state.matchPurposes});
  body.innerHTML=`<section class="manual-layout-dialog"><div class="dialog-head"><h2>手动创作从哪里开始？</h2><button type="button" class="btn" id="manual-layout-cancel">取消</button></div><p>根据本次素材、页面风格和用途推荐起点。仅预排版实物，所有对象仍可独立编辑；不会调用 AI。</p><div class="manual-layout-choices">${choices.map((item,index)=>`<button type="button" class="manual-layout-choice" data-manual-template="${item.id}"><span class="manual-layout-sketch sketch-${item.id}" aria-hidden="true"><i></i><i></i><i></i></span><span><strong>${esc(item.title)}${index===0?' · 推荐':''}</strong><small>${esc(item.description)}</small><small>${esc(item.reason)}</small></span></button>`).join('')}<button type="button" class="manual-layout-choice" data-manual-template=""><span class="manual-layout-sketch sketch-blank" aria-hidden="true"></span><span><strong>从空画布开始</strong><small>保留纸张与素材篮，所有元素由你自己添加。</small></span></button></div></section>`;
  modal.showModal();body.querySelector('#manual-layout-cancel').onclick=()=>modal.close();
  for(const button of body.querySelectorAll('[data-manual-template]'))button.onclick=async()=>{try{button.disabled=true;await createFromBasket(button.dataset.manualTemplate||null);modal.close();}catch(error){button.disabled=false;toast('创建草稿失败：'+error.message);}};
}
function openMaterialPicker(){body.innerHTML=`<h2>选择素材放入画布</h2><div class="mini-assets">${state.assets.map(a=>`<button type="button" class="mini-asset" data-pick="${a.id}">${imgTag(a)}<span>${esc(a.title)}</span></button>`).join('')}</div>`;modal.showModal();body.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const a=asset(b.dataset.pick),d=current();checkpoint();const i=itemFromAsset(a,d,d.canvas.width/2,d.canvas.height/2,20,false);d.items.push(i);state.selected=i.id;state.tool='select';modal.close();saveProject();render();});}
function openCreativeJSON(){const aliases=Object.entries(materialAliases(state.basket)).map(([key,id])=>`${key} = ${asset(id)?.title||id}`).join(' · ');body.innerHTML=`<h2>导入创作指令</h2><p>这是本地工具协议的验证入口，不会联系大模型。当前素材编号：${esc(aliases||'请先在搭配页选素材')}</p><label>包含 tools 或 tool_calls 的 JSON<textarea id="creative-source" style="min-height:240px" placeholder='{"tools":[{"name":"upsert_text","arguments":{"items":[{"key":"t1","content":"今天的故事……","width":0.5}]}}]}'></textarea></label><p>成功的前序调用会保留；失败调用不会污染画布。物理素材尺寸仍从素材库计算。</p><button type="button" class="btn primary" id="creative-apply">验证并应用</button><div id="creative-results" style="white-space:pre-wrap;margin-top:12px"></div>`;modal.showModal();body.querySelector('#creative-apply').onclick=()=>{try{const aliases=materialAliases(state.basket);const result=applyToolCalls(body.querySelector('#creative-source').value,current(),state.assets,aliases);body.querySelector('#creative-results').textContent=result.results.map(x=>`${x.ok?'✓':'×'} ${x.name}: ${x.detail}`).join('\n');if(result.committed){checkpoint();const p=state.activeProject,index=p.drafts.findIndex(x=>x.id===state.activeDraft);p.drafts[index]=result.draft;saveProject();render();}}catch(e){body.querySelector('#creative-results').textContent=e.message;}};}
async function modelImage(a,cropRect=null,maxPixels=512,transparent=false){const record=await db.get('blobs',a.blobId),blob=record?.data||(a.staticPath?await fetch(a.staticPath).then(r=>r.blob()):null);if(!blob)return null;const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas'),crop=cropRect||{x:0,y:0,width:1,height:1},cw=crop.width*bitmap.width,ch=crop.height*bitmap.height,scale=Math.min(1,maxPixels/Math.max(cw,ch));canvas.width=Math.max(1,Math.round(cw*scale));canvas.height=Math.max(1,Math.round(ch*scale));const ctx=canvas.getContext('2d');if(!transparent){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(bitmap,crop.x*bitmap.width,crop.y*bitmap.height,cw,ch,0,0,canvas.width,canvas.height);bitmap.close();return transparent?canvas.toDataURL('image/png'):canvas.toDataURL('image/jpeg',.78);}
async function offlinePreviewBytes(a){
  const record=await db.get('blobs',a.blobId),blob=record?.data||(a.staticPath?await fetch(a.staticPath).then(r=>r.blob()):null);if(!blob)return null;
  return encodeOfflinePreview(blob);
}
function readMatchSelection(id,fallback){const e=view.querySelector('#'+id);return e?[...e.selectedOptions].map(x=>x.value):fallback?[fallback]:[];}
let aiController=null,aiReport=null;
function renderAIPanel(){const ids=[...new Set([...(state.activeProject?.candidateAssetIDs||[]),...state.basket,...(current()?.items||[]).map(x=>x.assetID)])].filter(id=>asset(id));return `<section class="inline-ai-panel" aria-label="AI 创作"><div class="inline-ai-head"><h2>AI 创作</h2><button type="button" data-ai-close aria-label="收起 AI 创作">×</button></div><p>边创作边在上方画布查看。使用设置中的 ${esc(state.aiSettings.model)}，按模型能力发送素材描述与可选缩略图。</p><div class="inline-ai-assets">${ids.map((id,i)=>`<span>m${i+1} · ${esc(asset(id).title)}</span>`).join('')||'请先从素材搭配选择素材'}</div><label>这页想记录什么？<textarea id="ai-prompt" placeholder="写下主题、故事与喜欢的氛围">${esc(state.aiPrompt)}</textarea></label><div class="inline-ai-actions"><button type="button" class="btn primary" id="ai-start" ${state.aiBusy?'disabled':''}>${state.aiBusy?'创作中…':'开始创作'}</button><button type="button" class="btn" id="ai-stop" ${state.aiBusy?'':'disabled'}>停止</button><button type="button" class="btn" id="ai-report" ${aiReport?'':'disabled'}>导出诊断</button><button type="button" class="btn" id="ai-settings">AI 设置</button></div><div id="ai-progress" role="status" aria-live="polite">${esc(state.aiProgress)}</div></section>`;}
function openAICreation(){state.aiPanel=true;if(!state.aiPrompt)state.aiPrompt=state.matchIntent||'';render();view.querySelector('.inline-ai-panel')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
function bindAIPanel(){if(!state.aiPanel)return;view.querySelector('#ai-prompt')?.addEventListener('input',e=>state.aiPrompt=e.target.value);view.querySelector('[data-ai-close]')?.addEventListener('click',()=>{state.aiPanel=false;render();});view.querySelector('#ai-settings')?.addEventListener('click',()=>{state.settingsSection='AI 与创作';route('settings');});view.querySelector('#ai-start')?.addEventListener('click',startAICreation);view.querySelector('#ai-stop')?.addEventListener('click',()=>aiController?.abort(Error('已停止创作，之前成功的步骤已保存')));view.querySelector('#ai-report')?.addEventListener('click',()=>{if(aiReport)download(new Blob([JSON.stringify(publicAIDiagnosticReport(aiReport),null,2)],{type:'application/json'}),`拾页AI诊断-${new Date().toISOString().slice(0,10)}.json`);});}
async function startAICreation(){
 if(state.aiBusy)return;
 const targetProject=state.activeProject,targetDraft=current();if(!targetProject||!targetDraft)return;
 const accountID=state.accountId,sourceProject=structuredClone(targetProject),sourceDraft=structuredClone(targetDraft),assetsSnapshot=structuredClone(state.assets),prompt=state.aiPrompt,fallbackPurpose=state.matchPurpose,cfg=structuredClone(state.aiSettings),{key,model}=cfg;
 const findAsset=id=>assetsSnapshot.find(a=>a.id===id),pscope=targetProject.materialPriority;
 const ids=[...new Set([...(targetProject.candidateAssetIDs||[]),...(pscope?[]:state.basket),...(sourceDraft.items||[]).map(x=>x.assetID)])].filter(id=>findAsset(id)&&!pscope?.excluded?.includes(id));
 if(cfg.deliveryMode==='image'){
  if(!ids.length){state.aiProgress='请先在素材搭配中选择素材。';render();return;}
  const controller=new AbortController();aiController=controller;state.aiBusy=true;state.aiProgress='正在准备图像生成…';render();
  try{const referenceImages=cfg.sendPresetReferences?(await loadJournalTemplateReferences({context:{styles:sourceProject.styles,purposes:sourceProject.purposes,materials:assetsSnapshot.filter(asset=>ids.includes(asset.id))},userTemplates:state.userTemplates,db})).referenceImages:[];const blob=await generatePageImage({settings:cfg,project:sourceProject,draft:sourceDraft,assets:assetsSnapshot,ids,theme:prompt,createImage:modelImage,referenceImages,userTemplates:state.userTemplates,signal:controller.signal,onProgress:message=>{state.aiProgress=message;const el=view.querySelector('#ai-progress');if(el)el.textContent=message;}});if(controller.signal.aborted||state.accountId!==accountID)throw Error('创作已停止或账号已切换');await saveGeneratedImageSnapshot(blob,sourceProject);state.aiProgress='图片已由 GPT 图像模型直接生成，并保存到「画面快照」。当前可编辑画布未改变。';}
  catch(error){state.aiProgress='图像生成失败：'+String(error.message||error).replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]');}
  finally{if(aiController===controller)aiController=null;state.aiBusy=false;if(state.route==='editor')render();}
  return;
 }
 if(!key){state.aiProgress='请先在设置 → AI 与创作保存所选服务的 API 密钥。';render();return;}if(!ids.length){state.aiProgress='请先在素材搭配中选择素材。';render();return;}
 let recorder;const projectID=targetProject.id,draftID=sourceDraft.id,controller=new AbortController();let commitTargetID=draftID,expectedDraft=structuredClone(sourceDraft),candidateCreated=false;
 const sourceVersions=new Map(ids.map(id=>[id,assetSourceRevision(findAsset(id))]));
 const assertRun=()=>{if(controller.signal.aborted||state.accountId!==accountID)throw Error('创作已停止或账号已切换');for(const [id,version] of sourceVersions){const current=state.assets.find(a=>a.id===id);if(!current||assetSourceRevision(current)!==version)throw Error('创作期间素材来源或标定已变化，已停止旧条件下的生成');}};
 checkpoint();aiController=controller;state.aiBusy=true;state.aiProgress='正在准备素材预览…';aiReport={date:new Date().toISOString(),model,parameters:{generationMode:cfg.generationMode,temperature:cfg.temperature,maxTokens:cfg.maxTokens,maxTurns:cfg.maxTurns,materialCount:ids.length},rounds:[],outcome:'started'};render();
 try{
  recorder=await createAIRecorder({db,model,key});const aliases=materialAliases(ids),vision=cfg.includeThumbnails&&supportsVision(cfg);
  const images=vision?await prepareMaterialPreviews(ids,{findAsset,createImage:async(...args)=>{assertRun();return modelImage(...args);}}):[];assertRun();
  const p=sourceProject,referenceImages=[];
  if(cfg.sendPresetReferences&&supportsVision(cfg)){referenceImages.push(...(await loadJournalTemplateReferences({context:{styles:p.styles||[sourceDraft.style],purposes:p.purposes||[p.purpose||fallbackPurpose],materials:assetsSnapshot.filter(asset=>ids.includes(asset.id))},userTemplates:state.userTemplates,db})).referenceImages);}assertRun();
  const output=await runCreativeAgent({...cfg,draft:sourceDraft,assets:assetsSnapshot,aliases,styles:p.styles||[sourceDraft.style],pagePurposes:p.purposes||[p.purpose||fallbackPurpose],contentPolicy:p.contentPolicy||'documentary',userText:p.userText||'',providedFacts:p.providedFacts||'',requiredAssetIDs:p.requiredAssetIDs||[],materialPriority:p.materialPriority,processing:p.processing,assetProcessing:p.assetProcessing||{},materialUseHints:p.materialUseHints||{},materialUseRequired:p.materialUseRequired||{},prompt,images,referenceImages,userTemplates:state.userTemplates,request:recorder.request,signal:controller.signal,
   onResponse:recorder.response,
   onProgress:progress=>{state.aiProgress='请求 '+progress.budget.totalRequests+'/'+progress.budget.limit+'（创作 '+progress.budget.creationRequests+'、格式修复 '+progress.budget.formatRepairRequests+'） · '+progress.phase+' · '+progress.seconds+' 秒 · 已接收 '+progress.received+' 字符';const el=view.querySelector('#ai-progress');if(el)el.textContent=state.aiProgress;},
   onScene:vision?async d=>{assertRun();return (await rasterize(d,.7)).toDataURL('image/jpeg',.8);}:undefined,
   onFinalScene:async d=>{assertRun();return (await rasterize(d,Math.min(1.5,2000/Math.max(d.canvas.width,d.canvas.height)))).toDataURL('image/jpeg',.8);},
   onInspection:vision?async data=>{const parts=[];for(const m of data?.materials||[]){assertRun();const a=findAsset(m.assetID);if(a){const url=await modelImage(a,m.cropRect);if(url)parts.push({type:'text',text:m.key+' 的当前局部预览'},{type:'image_url',image_url:{url}});}}return parts;}:undefined,
   onTurn:async({turn,results,draft,text,review})=>{assertRun();aiReport.rounds.push({turn,tools:results.map(x=>({name:x.name,ok:x.ok,detail:x.detail})),review});state.aiProgress='第 '+turn+' 轮\n'+results.map(x=>(x.ok?'✓':'×')+' '+x.name+'：'+x.detail).join('\n')+(text&&cfg.generationMode!=='direct'?'\n'+text:'');if(results.some(x=>x.ok&&x.name!=='inspect_materials')){const active=state.projects.find(item=>item.id===projectID);if(!active)throw Error('原创作作品已不存在；结果未覆盖其他作品');const committed=commitAIDraft(active,{targetDraftID:commitTargetID,expectedDraft,generatedDraft:draft,newDraftID:uid()});commitTargetID=committed.targetDraftID;expectedDraft=committed.expectedDraft;if(committed.candidate){candidateCreated=true;state.aiProgress+='\n检测到原稿已手动修改，AI 结果另存为候选方案。';}saveSpecificProject(active);await flushSave();}assertRun();await recorder.turn(turn,results,draft).catch(()=>{state.aiProgress+='\n诊断记录暂不可用；已提交的画布检查点不受影响。';});if(state.route==='editor')render();}
  });
  assertRun();const completed=state.projects.find(item=>item.id===projectID);if(!completed)throw Error('原创作作品已不存在；结果未覆盖其他作品');const finalized=commitAIDraft(completed,{targetDraftID:commitTargetID,expectedDraft,generatedDraft:output.draft,newDraftID:uid()});commitTargetID=finalized.targetDraftID;candidateCreated||=finalized.candidate;completed.aiGenerated=true;completed.deliveryMode=cfg.deliveryMode;saveSpecificProject(completed);await flushSave();if(['image','pdf'].includes(cfg.deliveryMode)){await saveProjectSnapshot({...completed,projectDocumentPath:null,activeDraftID:commitTargetID},{format:cfg.deliveryMode==='pdf'?'application/pdf':'image/png'});completed.aiSnapshotCreated=true;saveSpecificProject(completed);}
  aiReport.outcome='completed';aiReport.budget=output.budget;state.aiProgress+=candidateCreated?'\n结构已完成并另存 AI 候选；原稿手改未被覆盖。':'\n结构已完成，草稿已保存。';state.aiProgress+=output.draft.agentRun?.visualReview==='model-reviewed'?' GPT 已检查最终画面，仍可继续手改。':' 最终视觉请核对。';
 }catch(error){aiReport.outcome=controller.signal.aborted?'stopped':'failed';aiReport.stopReason=error.code||aiReport.outcome;aiReport.budget=error.budget||null;aiReport.error=String(error.message||'创作中断').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]');state.aiProgress+='\n'+aiReport.error+'。已保留成功的步骤。';}
 finally{await recorder?.finish(aiReport.outcome).catch(()=>{});if(aiController===controller)aiController=null;state.aiBusy=false;if(state.route==='editor')render();}
}
async function flattenGeneratedPage(d,p=state.activeProject,persistProject=true){
 const canvas=await rasterize(d,2),blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(Error('整页成图失败')),'image/png')),id=uid(),blobId=uid();
 const a={id,blobId,title:p.title+' · 整页成图',kind:'photo',role:'background',tags:[],reviewStatus:'ready',isProjectInternal:true,physicalWidthMM:d.canvas.width/d.canvas.height*d.physicalPageHeightMM,physicalHeightMM:d.physicalPageHeightMM,supply:{quantity:1},createdAt:new Date().toISOString()};
 const flattened=structuredClone(d);flattened.items=[itemFromAsset(a,d,d.canvas.width/2,d.canvas.height/2,0,true)];flattened.textBlocks=[];flattened.primitives=[];flattened.strokes=[];flattened.directPageOutput='flattened';
 const updated={...p,directEditableSource:structuredClone(d),drafts:p.drafts.map(x=>x.id===d.id?flattened:x)};
 await db.transaction(['assets','blobs','projects'],tx=>{tx.objectStore('assets').put(a);tx.objectStore('blobs').put({id:blobId,data:blob});if(persistProject)tx.objectStore('projects').put(updated);});state.assets.push(a);urls.set(blobId,URL.createObjectURL(blob));Object.assign(p,updated);
}
async function saveProjectSnapshot(source,{format='image/png',alsoEditable=false}={}){
 if(!source||source.isSnapshot)throw Error('请选择可编辑作品后再保存快照');
 const p=source.projectDocumentPath?await db.completeProject(source):source;
 const d=p.drafts.find(x=>x.id===p.activeDraftID)||p.drafts[0];if(!d)throw Error('作品页面无法读取');
 const scale=Math.min(2,4096/Math.max(d.canvas.width,d.canvas.height));
 const canvas=await rasterize(d,scale),preview=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(Error('无法生成快照')),'image/png'));
 const previewBlobId=uid(),documentBlobId=format==='application/pdf'?uid():null;
 const data=[{id:previewBlobId,data:preview}];
 if(documentBlobId){const height=d.physicalPageHeightMM||297,width=height*d.canvas.width/d.canvas.height;data.push({id:documentBlobId,data:await pagePDF([await canvasPDFPage(canvas,width,height)])});}
 const snapshot=snapshotRecord({title:p.title,previewBlobId,documentBlobId,format,width:d.canvas.width,height:d.canvas.height,sourceProjectID:p.id});
 snapshot.styleTags=[...(p.styleTags||[])];snapshot.tags=[...(p.tags||[])];snapshot.purpose=p.purpose;
 await db.stageImport({projects:[snapshot],blobs:data});
 urls.set(previewBlobId,URL.createObjectURL(preview));state.projects.push(snapshot);
 if(alsoEditable){source.isDraft=false;saveProject();}
 toast(cloudEnabled?'快照已暂存，正在后台同步':'快照已保存');
 if(state.route==='works')render();return snapshot;
}
async function saveGeneratedImageSnapshot(blob,source){
 if(!(blob instanceof Blob)||blob.type!=='image/png')throw Error('图像模型没有返回 PNG');
 const bitmap=await createImageBitmap(blob);let width,height;try{width=bitmap.width;height=bitmap.height;}finally{bitmap.close();}
 const blobId=uid(),snapshot=snapshotRecord({title:source.title,previewBlobId:blobId,format:'image/png',width,height,sourceProjectID:source.id});
 snapshot.styleTags=[...(source.styleTags||[])];snapshot.tags=[...(source.tags||[])];snapshot.purpose=source.purpose;snapshot.aiGenerated=true;
 await db.stageImport({projects:[snapshot],blobs:[{id:blobId,data:blob}]});urls.set(blobId,URL.createObjectURL(blob));state.projects.push(snapshot);
 if(state.route==='works')render();return snapshot;
}
async function restorePendingProjects(){const pending=await db.pendingProjects();for(const row of pending){const index=state.projects.findIndex(p=>p.id===row.record.id);if(index<0)state.projects.push(row.record);else state.projects[index]=state.activeProject?.id===row.record.id?state.activeProject:row.record;}return pending.length;}
async function refresh({background=false,onlyChanged=false}={}){const sync=await db.refreshCloud();if(onlyChanged&&!sync?.changed)return;if(sync?.changed)privateImages.invalidate(sync.allBlobs?undefined:sync.blobIDs);const [assets,series,projects,trash,meta]=await Promise.all(['assets','series','projects','trash','meta'].map(db.all));Object.assign(state,{assets,series,projects,trash,userTemplates:journalTemplateRecords(meta)});await restorePendingProjects();staticSources.clear();for(const a of state.assets)if(a.staticPath)staticSources.set(a.blobId,a.staticPath);if(reconcileSelectedRecords(parity,state))view.selectionRefresh?.();if(background){backgroundViewPending=true;scheduleBackgroundReconcile();}else render();}
let trashSweepActive=false;
async function purgeExpiredTrash(){if(trashSweepActive)return;const entries=expiredTrash(state.trash);if(!entries.length)return;trashSweepActive=true;try{await changeTrash({db,state,ids:entries.map(entry=>entry.id)});if(parity.libraryTab==='trash'||parity.workTab==='trash')render();}catch(error){console.warn('最近删除到期清理待重试',error?.name||error?.message);}finally{trashSweepActive=false;}}
setInterval(()=>void purgeExpiredTrash(),15*60*1000);
async function refineCandidateFrame(candidateFrame,request,{postprocessOnly=false}={}){
  const bitmap=await createImageBitmap(candidateFrame);
  try{
    const fw=bitmap.width,fh=bitmap.height,maxDim=Math.max(64,Number(request.pixels)||900),
      ratio=Math.min(1,maxDim/Math.max(fw,fh)),aw=Math.max(1,Math.round(fw*ratio)),ah=Math.max(1,Math.round(fh*ratio)),
      canvas=document.createElement('canvas');canvas.width=aw;canvas.height=ah;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,aw,ah);
    const raw=ctx.getImageData(0,0,aw,ah),
      p=request.placement||{x:0,y:0,width:fw,height:fh},
      roughMask=new Uint8Array(request.mask),tw=Math.max(1,request.targetWidth),th=Math.max(1,request.targetHeight);
    let ml=tw,mt=th,mr=0,mb=0;
    for(let y=0;y<th;y++)for(let x=0;x<tw;x++)if(roughMask[y*tw+x]>0){ml=Math.min(ml,x);mt=Math.min(mt,y);mr=Math.max(mr,x+1);mb=Math.max(mb,y+1);}
    if(mr<=ml||mb<=mt){ml=0;mt=0;mr=tw;mb=th;}
    const bx=p.x+p.width*ml/tw,by=p.y+p.height*mt/th,bw=p.width*(mr-ml)/tw,bh=p.height*(mb-mt)/th,
      candidate={x:bx/fw,y:by/fh,w:bw/fw,h:bh/fh,fillRatio:.5,seedDensity:.5,recognitionConfidence:0,
        mask:{width:tw,height:th,alpha:roughMask,topologyPreserved:true}},
      paperWidthMM=request.paperWidthMM||210,paperHeightMM=request.paperHeightMM||297;
    let region;
    if(postprocessOnly){
      let current=candidate;
      if(request.postprocess?.shapeRegularization!==false){
        const shaped=await visionTask('material-boundary-refine',{pixels:raw.data,width:aw,height:ah,candidates:[current],mode:'postprocess',
          postprocess:{edgePolish:false,shapeRegularization:true,curveSmooth:false,apertures:false},
          chromaEdges:request.preprocess?.chromaEdges!==false});
        current=shaped?.[0]||current;
      }
      if(request.postprocess?.apertures!==false){
        const holed=await visionTask('restore-repeated-apertures',{pixels:raw.data,width:aw,height:ah,candidates:[current],paperWidthMM,paperHeightMM});
        current=holed?.[0]||current;
      }
      region=current;
    }else{
      const pre=request.preprocess||{},
        needs=pre.illumination===true||pre.denoise===true||pre.localContrast===true,
        processed=needs?await visionTask('balance',{pixels:raw.data,width:aw,height:ah,options:pre}):null,
        frame=processed?{data:processed.pixels}:raw,
        profile=recognitionProfile(request.method,request.pixels),
        noPost={shapeRegularization:false,apertures:false},
        refined=await profile.refineCandidates({candidates:[candidate],frame,sourceFrame:raw,width:aw,height:ah,paperWidthMM,paperHeightMM,preprocess:pre,postprocess:noPost,onProgress:()=>{}});
      region=refined?.[0];
    }
    if(!region?.mask?.alpha?.length)throw Error(postprocessOnly?'自动修整没有返回可用边界':'没有得到可靠的新边界');

    const full=document.createElement('canvas');full.width=fw;full.height=fh;const fx=full.getContext('2d'),
      mc=document.createElement('canvas');mc.width=region.mask.width;mc.height=region.mask.height;
    const mx=mc.getContext('2d'),mi=mx.createImageData(mc.width,mc.height);
    for(let i=0;i<region.mask.alpha.length;i++){mi.data[i*4]=mi.data[i*4+1]=mi.data[i*4+2]=255;mi.data[i*4+3]=region.mask.alpha[i];}
    mx.putImageData(mi,0,0);
    const rx=Math.round(region.x*fw),ry=Math.round(region.y*fh),rw=Math.max(1,Math.round(region.w*fw)),rh=Math.max(1,Math.round(region.h*fh));
    fx.drawImage(mc,rx,ry,rw,rh);
    const local=document.createElement('canvas');local.width=request.targetWidth;local.height=request.targetHeight;
    const lx=local.getContext('2d',{willReadFrequently:true});lx.drawImage(full,p.x,p.y,p.width,p.height,0,0,local.width,local.height);
    const alpha=lx.getImageData(0,0,local.width,local.height).data,out=new Uint8Array(local.width*local.height);
    for(let i=0;i<out.length;i++)out[i]=alpha[i*4+3];
    return {mask:out,method:postprocessOnly?'postprocess-only':request.method,shapeModel:region.shapeModel||null,edgeMethod:region.edgeMethod||null,apertureCount:region.apertureCount||0};
  }finally{bitmap.close();}
}

async function openCutoutCheck(id,candidate=null){
  const a=candidate?{title:candidate.title}:asset(id);if(!a)return;
  const stored=async blobId=>blobId?(await db.get('blobs',blobId))?.data:null;
  let saved=candidate?.blob||await stored(a.blobId),original=candidate?.originalBlob||await stored(a.originalBlobId),recognition=candidate?.originalCutoutBlob||await stored(a.originalCutoutBlobId),
    candidateFrame=candidate?.candidateFrameBlob||await stored(a.candidateFrameBlobId);
  if(!saved&&a.staticPath){const response=await fetch(a.staticPath);if(!response.ok)throw Error('素材图像未能加载，请重试');saved=await response.blob();}
  original||=saved;recognition||=saved;candidateFrame||=original;if(!(original instanceof Blob)||!(saved instanceof Blob))throw Error('候选框图像不可读取');
  if(modal.open)modal.close();
  const processing=candidate?.processingRecord||a.processingRecord||{},baseWidth=processing.sourceWidthMM||candidate?.width||a.physicalWidthMM,baseHeight=processing.sourceHeightMM||candidate?.height||a.physicalHeightMM,
    localMethods=recognitionMethodDetails,
    preferredMethod=localMethods.some(item=>item.id===(processing.rerecognition?.method||state.preferences.recognition))?(processing.rerecognition?.method||state.preferences.recognition):'auto';
  await showCutoutEditor({
    body,modal,original,saved,recognition,candidateFrame,title:a.title,processing,toast,
    recognitionUI:{methods:localMethods,pixels:recognitionPixelOptions,method:preferredMethod,pixelsValue:state.preferences.recognitionPixels,preprocess:recognitionPreprocessOptions(),postprocess:recognitionPostprocessOptions()},
    onRerecognize:request=>refineCandidateFrame(candidateFrame,request),
    onPostprocess:request=>refineCandidateFrame(candidateFrame,request,{postprocessOnly:true}),
    onApply:async(blob,record,originalRecognition)=>{
    const rad=record.displayRotationDegrees*Math.PI/180,width=baseWidth&&baseHeight?Math.abs(baseWidth*Math.cos(rad))+Math.abs(baseHeight*Math.sin(rad)):null,height=baseWidth&&baseHeight?Math.abs(baseHeight*Math.cos(rad))+Math.abs(baseWidth*Math.sin(rad)):null;
    const nextProcessing={...record,sourceWidthMM:baseWidth,sourceHeightMM:baseHeight};
    if(candidate){
      candidate.originalCutoutBlob||=originalRecognition;candidate.candidateFrameBlob||=candidateFrame;candidate.processingRecord=nextProcessing;candidate.blob=blob;URL.revokeObjectURL(candidate.url);candidate.url=URL.createObjectURL(blob);if(width&&height){candidate.width=width;candidate.height=height;}
      for(const rec of state.importRecords){const index=rec.candidateData?.findIndex(c=>c===candidate||c.region===candidate.region);if(index>=0){Object.assign(rec.candidateData[index],candidate);rec.candidateURLs[index]=candidate.url;rec.manualEdits=true;if(state.importStep==='inspect')rec.confirmed=false;}}
      if(state.importRecords[state.importIndex]?.candidateData===state.importCandidateData)state.importCandidateURLs=state.importCandidateData.map(c=>c.url);
    }else{
      const updated={...a,processingRecord:nextProcessing,physicalWidthMM:width||a.physicalWidthMM,physicalHeightMM:height||a.physicalHeightMM,originalCutoutBlobId:a.originalCutoutBlobId||uid(),candidateFrameBlobId:a.candidateFrameBlobId||uid(),updatedAt:new Date().toISOString()};
      await db.transaction(['assets','blobs'],tx=>{tx.objectStore('assets').put(updated);tx.objectStore('blobs').put({id:a.blobId,data:blob});if(!a.originalCutoutBlobId)tx.objectStore('blobs').put({id:updated.originalCutoutBlobId,data:originalRecognition});if(!a.candidateFrameBlobId)tx.objectStore('blobs').put({id:updated.candidateFrameBlobId,data:candidateFrame});});
      Object.assign(a,updated);if(urls.has(a.blobId))URL.revokeObjectURL(urls.get(a.blobId));urls.set(a.blobId,URL.createObjectURL(blob));
    }
    render();toast('素材外观已更新');
  }});
}
function openDetail(id){showAssetEditor({state,body,modal,db,esc,imgTag,render,route,toast},id);}
function openSeriesEditor(id){showSeriesEditor({id,state,body,modal,db,uid,esc,imgTag,render,toast});}
function openProjectMetadata(){
  const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p)return;
  body.innerHTML=`<div class="dialog-head"><h2>作品信息与标签</h2><button type="button" id="project-dialog-close" aria-label="取消编辑">取消</button></div><div class="stack"><label>名称<input id="project-meta-title" value="${esc(p.title)}"></label><label>风格标签（用逗号分开）<input id="project-meta-tags" value="${esc((p.styleTags||[]).join(', '))}"></label><label>使用标记<select id="project-meta-used"><option value="unused" ${p.isUsed?'':'selected'}>未使用</option><option value="used" ${p.isUsed?'selected':''}>已使用</option></select></label><button type="button" class="btn primary" id="project-meta-save">保存作品信息</button>${p.isSnapshot?'':'<button type="button" class="btn" id="project-meta-snapshot">保存快照</button>'}<button type="button" class="btn" id="project-meta-preview">查看完整作品</button></div>`;
  modal.showModal();body.querySelector('#project-dialog-close').onclick=()=>modal.close();
  body.querySelector('#project-meta-preview').onclick=()=>{modal.close();route('projectPreview');};
  const snapshotButton=body.querySelector('#project-meta-snapshot');if(snapshotButton)snapshotButton.onclick=async()=>{snapshotButton.disabled=true;try{await saveProjectSnapshot(p);modal.close();}catch(error){toast(error.message);}finally{snapshotButton.disabled=false;}};
  let usageTouched=false;
  body.querySelector('#project-meta-used').onchange=()=>{usageTouched=true;};
  body.querySelector('#project-meta-save').onclick=async()=>{
    const title=body.querySelector('#project-meta-title').value.trim();if(!title){toast('请填写作品名称');return;}
    const now=new Date().toISOString(),markUsed=body.querySelector('#project-meta-used').value==='used'&&(!p.isUsed||usageTouched);
    const next={...p,title,styleTags:body.querySelector('#project-meta-tags').value.split(/[,，]/).map(x=>x.trim()).filter(Boolean),isUsed:body.querySelector('#project-meta-used').value==='used',updatedAt:now};delete next.isTemplate;
    const projectWithLayers=markUsed?await db.completeProject(p):p;
    const affected=markUsed?markProjectAssetsUsed(projectWithLayers,state.assets,now):[];
    await db.transaction(affected.length?['projects','assets']:['projects'],tx=>{tx.objectStore('projects').put(next);for(const a of affected)tx.objectStore('assets').put(a);});
    Object.assign(p,next);for(const a of affected)Object.assign(state.assets.find(x=>x.id===a.id),a);modal.close();render();toast('作品信息已保存');
  };
}
async function restoreTrash(id){if(!await changeTrash({db,state,ids:[id],recover:true}))return;render();toast('已恢复');}
function saveActiveImportRecord(){
  const rec=state.importRecords[state.importIndex];if(!rec)return;
  Object.assign(rec,{bitmap:state.importBitmap,file:state.importFile,url:state.importURL,box:structuredClone(state.importBox),corners:state.paperCorners?structuredClone(state.paperCorners):null,correctedBitmap:state.correctedBitmap,correctedURL:state.correctedURL,candidates:state.importCandidates||[],candidateURLs:state.importCandidateURLs||[],candidateData:state.importCandidateData||[],selection:[...(state.importCandidateSelection||[])],wholePaper:state.wholePaper,paperSize:state.paperSize,paperOrientation:state.paperOrientation,balanceLight:state.balanceLight,recognition:state.importRecognition,customImportWidth:state.customImportWidth,customImportHeight:state.customImportHeight});
}
function resetImportBatch(){
  // Dispose only photo-owned resources, not the shared model/Worker. Saved
  // library images have independent object URLs maintained by the store.
  state.importLoadGeneration=(state.importLoadGeneration||0)+1;
  discardPaperPreview();
  const bitmaps=new Set(),objectURLs=new Set();
  for(const r of state.importRecords){for(const b of [r.bitmap,r.correctedBitmap])if(b)bitmaps.add(b);for(const u of [r.url,r.correctedURL,...(r.candidateURLs||[])])if(u)objectURLs.add(u);}
  for(const b of bitmaps)b.close?.();for(const u of objectURLs)URL.revokeObjectURL(u);
  Object.assign(state,{importStep:'inspect',importRecords:[],importIndex:0,importFile:null,importBitmap:null,importURL:null,correctedBitmap:null,correctedURL:null,paperCorners:null,importCandidates:[],importCandidateURLs:[],importCandidateData:[],importCandidateSelection:new Set(),importProcessing:'',importOrganizing:false,importSavedCount:0,showManualBox:false,showCorrectionPreview:false,importBatchSeriesID:null});
}
function openImportGallery(mode){
  resetImportBatch();state.importMode=mode;route('import');
  // Keep this in the original click activation; Safari blocks delayed file pickers.
  fileInput.removeAttribute('capture');fileInput.click();
}
async function switchImportRecord(index,skipSave=false){
  if(!skipSave)saveActiveImportRecord();const rec=state.importRecords[index];if(!rec)return;
  const generation=state.importLoadGeneration=(state.importLoadGeneration||0)+1,isCurrent=()=>state.route==='import'&&state.importLoadGeneration===generation;
  state.importIndex=index;state.importFile=rec.file;state.importBitmap=rec.bitmap||null;state.importURL=rec.url;state.importBox=rec.box||{x:0,y:0,w:1,h:1};
  state.wholePaper=rec.wholePaper??state.preferences.wholePaper;state.paperSize=rec.paperSize||state.preferences.paperSize;state.paperOrientation=rec.paperOrientation||state.preferences.orientation;state.balanceLight=rec.balanceLight??state.preferences.balanceLight;state.importRecognition=rec.recognition||state.preferences.recognition;state.customImportWidth=rec.customImportWidth||state.preferences.customPaperWidth||210;state.customImportHeight=rec.customImportHeight||state.preferences.customPaperHeight||297;
  state.paperCorners=rec.corners||null;
  state.correctedBitmap=rec.correctedBitmap||null;state.correctedURL=rec.correctedURL||null;state.importCandidates=rec.candidates||[];state.importCandidateURLs=rec.candidateURLs||[];state.importCandidateData=rec.candidateData||[];state.importCandidateSelection=new Set(rec.selection||[]);state.showManualBox=false;state.showCorrectionPreview=false;discardPaperPreview();
  const progress=message=>{state.importProcessing=message;const status=view.querySelector('.import-processing');if(status)status.textContent=message;};
  state.importProcessing='正在读取照片并加载本机识别引擎…';render();
  // Paint the selected photo before decoding, engine initialization or warp.
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  try{
  const bitmap=rec.bitmap||await createImageBitmap(rec.file);rec.bitmap=bitmap;if(!isCurrent())return;state.importBitmap=bitmap;
  progress('正在自动寻找纸张四角…');
  state.paperCorners=rec.corners||(state.paperSize==='none'?null:await suggestPaperCorners(bitmap,(()=>{const [pw,ph]=paperDimensions();return pw/ph;})()).catch(()=>null));if(!isCurrent())return;
  if(!rec.corners&&state.paperCorners)rec.autoPaperCorners=structuredClone(state.paperCorners);
  progress('正在进行透视校正…');
  if(!state.correctedBitmap&&state.paperCorners&&state.paperSize!=='none'){
    const [pw,ph]=paperDimensions(),blob=await rectifyA4(state.importBitmap,state.paperCorners,4096,pw/ph);
    if(!isCurrent())return;
    const corrected=await createImageBitmap(blob);if(!isCurrent()){corrected.close();return;}state.correctedBitmap=corrected;state.correctedURL=URL.createObjectURL(blob);rec.appliedCorners=JSON.stringify(state.paperCorners);rec.backgroundDetected=true;
  }
  if(!isCurrent())return;progress('正在识别并提取素材…');saveActiveImportRecord();render();if(!state.importCandidates.length&&state.importStep==='inspect')await previewCrop();
  }finally{if(isCurrent()){state.importProcessing='';render();}}
}
function discardPaperPreview(){state.paperPreviewBitmap?.close?.();if(state.paperPreviewURL&&state.paperPreviewURL!==state.correctedURL)URL.revokeObjectURL(state.paperPreviewURL);state.paperPreviewBitmap=null;state.paperPreviewURL=null;state.paperPreviewApplied=false;}
async function rotateImportPhoto(){
  if(!state.importBitmap)return;const rec=state.importRecords[state.importIndex];
  if(rec.manualEdits&&!confirm('旋转会重新识别这张照片并舍弃候选编辑，继续吗？'))return;
  const bitmap=state.importBitmap,canvas=document.createElement('canvas');canvas.width=bitmap.height;canvas.height=bitmap.width;const ctx=canvas.getContext('2d');ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(bitmap,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));rec.originalFile||=rec.file;rec.file=new File([blob],rec.file.name,{type:'image/png'});URL.revokeObjectURL(rec.url);rec.url=URL.createObjectURL(blob);
  const old=state.paperCorners;resetPaperCorrection(state);state.paperCorners=old?[old[3],old[0],old[1],old[2]].map(p=>({x:1-p.y,y:p.x})):null;bitmap.close();state.importBitmap=await createImageBitmap(blob);state.importFile=rec.file;state.importURL=rec.url;state.importCandidates=[];state.importCandidateData=[];state.importCandidateURLs=[];state.importCandidateSelection=new Set();rec.confirmed=false;rec.manualEdits=false;
  saveActiveImportRecord();await switchImportRecord(state.importIndex,true);
}
async function previewCorrection(){
  if(!state.importBitmap)return;discardPaperPreview();const [pw,ph]=paperDimensions();
  const blob=await rectifyA4(state.importBitmap,state.paperCorners,4096,pw/ph);state.paperPreviewBitmap=await createImageBitmap(blob);state.paperPreviewURL=URL.createObjectURL(blob);state.showCorrectionPreview=true;state.paperPreviewApplied=false;render();
}
async function applyPaperPreview(){
  const rec=state.importRecords[state.importIndex];if(!state.paperPreviewBitmap)return;
  if(rec.appliedCorners===JSON.stringify(state.paperCorners)&&state.correctedBitmap){state.paperPreviewApplied=true;render();return;}
  if(rec.manualEdits&&!confirm('重新校正会舍弃本照片的名称、手动选框和修补结果并重新识别，继续吗？'))return;
  state.correctedBitmap?.close?.();if(state.correctedURL)URL.revokeObjectURL(state.correctedURL);
  state.correctedBitmap=state.paperPreviewBitmap;state.correctedURL=state.paperPreviewURL;state.paperPreviewBitmap=null;state.paperPreviewURL=null;state.paperPreviewApplied=true;rec.appliedCorners=JSON.stringify(state.paperCorners);rec.backgroundDetected=true;rec.manualEdits=false;rec.confirmed=false;
  await previewCrop();toast('已使用校正结果，候选素材已更新');
}
async function openManualImportBox(){
  if(state.paperPreviewBitmap)await applyPaperPreview();
  if(state.paperPreviewBitmap)return;
  state.showManualBox=true;render();
}
function bindManualBox(){mountImportBoxEditor({state,view,render,saveActiveImportRecord,toast,refreshImportCandidates});}
async function refreshImportCandidates(regions,{manual=false}={}){
  const source=state.correctedBitmap||state.importBitmap,b=state.correctedBitmap?{x:0,y:0,w:1,h:1}:state.importBox,previous=state.importCandidateData||[],record=state.importRecords[state.importIndex];
  const next=[];const [pw,ph]=paperDimensions(),calibrated=state.paperSize!=='none'&&(state.correctedBitmap||state.wholePaper);
  const plans=manual?await refineManualBoxes(regions,previous,async(box,index)=>{
    toast('正在按旋转框分割 '+(index+1)+' / '+regions.length);
    const limit=state.preferences.recognitionPixels||900,
      scale=Math.min(1,limit/Math.max(source.width*b.w,source.height*b.h)),
      aw=Math.max(1,Math.round(source.width*b.w*scale)),
      ah=Math.max(1,Math.round(source.height*b.h*scale)),
      canvas=document.createElement('canvas');
    canvas.width=aw;canvas.height=ah;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(source,source.width*b.x,source.height*b.y,source.width*b.w,source.height*b.h,0,0,aw,ah);
    const pixels=ctx.getImageData(0,0,aw,ah).data,
      orientedBox={centerX:box.x+box.w/2,centerY:box.y+box.h/2,
        width:box.w,height:box.h,rotation:box.rotation||0,
        rectangularity:1,autoDeskew:true,source:'manual'},
      [candidate]=await visionTask('process-material-boxes',{
        pixels,sourcePixels:pixels,width:aw,height:ah,
        boxes:[{x:box.x,y:box.y,w:box.w,h:box.h,orientedBox,
          seedDensity:1,fillRatio:1}],method:state.importRecognition||'morphgac',
        paperWidthMM:pw,paperHeightMM:ph,
        shapeRegularization:recognitionPostprocessOptions().shapeRegularization!==false,
        apertures:recognitionPostprocessOptions().apertures!==false
      });
    if(!candidate||candidate.segmentationFailed)throw Error('旋转框内无法可靠分割，请调整框后重试');
    return candidate;
  }):regions.map(region=>({region,original:null}));
  if(record!==state.importRecords[state.importIndex]||state.route!=='import')return false;
  for(let i=0;i<plans.length;i++){
    const {region,original}=plans[i];if(original){next.push(original);continue;}
    toast('正在提取素材 '+(i+1)+' / '+plans.length);
    const cut=await cropBitmap(source,b,region),raw=region.mask?await cropBitmap(source,b,region,{raw:true}):cut;
    // Work layers stay in photographed coordinates; library materials get a
    // conservative rectangular correction. Originals use the same raster map.
    const aligned=state.importMode==='work'?{blob:cut,originalBlob:raw,candidateFrameBlob:raw,candidateFramePlacement:null,degrees:0,widthRatio:1,heightRatio:1}:await alignMaterialPreview(cut,raw,region.orientedBox?.autoDeskew?-region.orientedBox.rotation:null);
    const width=calibrated?Math.round((region.orientedBox?.width??region.w)*pw*10)/10:null,
      height=calibrated?Math.round((region.orientedBox?.height??region.h)*ph*10)/10:null;
    next.push({blob:aligned.blob,originalBlob:aligned.originalBlob,candidateFrameBlob:aligned.candidateFrameBlob||aligned.originalBlob,url:URL.createObjectURL(aligned.blob),title:'素材 '+(i+1),width,height,alignment:aligned.degrees,widthRatio:aligned.widthRatio,heightRatio:aligned.heightRatio,processingRecord:{automaticCorrectionDegrees:aligned.degrees,sourceWidthMM:width,sourceHeightMM:height,candidateFramePlacement:aligned.candidateFramePlacement||null},region,selected:true});
  }
  if(record!==state.importRecords[state.importIndex]){for(const c of next)if(!previous.includes(c))URL.revokeObjectURL(c.url);return false;}
  for(const c of previous)if(!next.includes(c))URL.revokeObjectURL(c.url);
  state.importCandidates=plans.map(plan=>plan.region);state.importCandidateData=next;state.importCandidateURLs=next.map(c=>c.url);state.importCandidateSelection=new Set(next.flatMap((c,i)=>c.selected?[i]:[]));saveActiveImportRecord();return true;
}
async function previewCrop(){
  if(!state.importBitmap)return;
  const record=state.importRecords[state.importIndex],source=state.correctedBitmap||state.importBitmap,b=state.correctedBitmap?{x:0,y:0,w:1,h:1}:state.importBox,[pw,ph]=paperDimensions();
  let regions=await detectPaperCandidates(source,b,6,{balanceLight:state.balanceLight,paperWidthMM:pw,paperHeightMM:ph,recognition:state.importRecognition||state.preferences.recognition,recognitionPixels:state.preferences.recognitionPixels,recognitionPreprocess:recognitionPreprocessOptions(),recognitionPostprocess:recognitionPostprocessOptions(),onDiagnostic:trace=>{record.recognitionDiagnostic=trace;},onProgress:p=>{
    if(state.route!=='import'||record!==state.importRecords[state.importIndex])return;
        const text=p.status==='inference'?'浏览器模型正在细化素材边缘…'
          :p.status==='fallback'?(Number.isFinite(p.count)?`${p.count} 个模型结果不可靠，保留传统识别边缘，请检查`:'边缘精修未采用新结果，已保留原识别边缘')
          :p.status==='contour-refinement'?`正在细化 ${p.total||''} 个不确定素材边缘…`
          :p.status==='boundary-postprocess'?`正在进行 ${p.total||''} 个素材的边缘与孔洞后处理…`
          :'正在优化素材边缘…';
    state.importProcessing=text;const label=view.querySelector('.import-processing');if(label)label.textContent=text;toast(text);
  }});
  if(state.route!=='import'||record!==state.importRecords[state.importIndex])return;
  // Swift leaves unreliable automatic results empty; work import still saves
  // the page as its locked base, without inventing a full-page material.
  if(await refreshImportCandidates(regions)){
    // No expensive work remains. Unlock before the first candidate render;
    // users must not wait for another full-page render to confirm the photo.
    state.importProcessing='';render();
  }
}
function recalibrateImport(){
  const [pw,ph]=paperDimensions(),calibrated=state.paperSize!=='none'&&(state.correctedBitmap||state.wholePaper),rec=state.importRecords[state.importIndex];
  for(const c of state.importCandidateData||[]){if(c.dimensionSource==='manual')continue;c.width=calibrated?Math.round((c.region.orientedBox?.width??c.region.w)*pw*10)/10:null;c.height=calibrated?Math.round((c.region.orientedBox?.height??c.region.h)*ph*10)/10:null;if(c.processingRecord){c.processingRecord.sourceWidthMM=c.width;c.processingRecord.sourceHeightMM=c.height;}}
  if(rec)rec.confirmed=false;saveActiveImportRecord();render();
}
async function chooseCandidate(index){if(index>=0){state.importCandidateSelection=new Set([index]);render();}else await previewCrop();}
function paperDimensions(){return importPaperDimensions({paperSize:state.paperSize,paperOrientation:state.paperOrientation,bitmap:state.importBitmap,corners:state.paperCorners,customImportWidth:state.customImportWidth||state.preferences.customPaperWidth,customImportHeight:state.customImportHeight||state.preferences.customPaperHeight});}
async function confirmImportPhoto(){
  if(state.importProcessing)return;
  const record=state.importRecords[state.importIndex];
  const [expectedPaperWidth,expectedPaperHeight]=paperDimensions();
  if(state.paperSize!=='none'&&state.correctedBitmap&&Math.abs(
    (state.correctedBitmap.width/state.correctedBitmap.height)/
    (expectedPaperWidth/expectedPaperHeight)-1)>.025){
    toast('纸张尺寸或方向改变后，须预览并应用新的校正结果，才能确认素材');return;
  }
  if(state.paperSize!=='none'&&state.paperCorners&&state.correctedBitmap
    &&record?.appliedCorners!==JSON.stringify(state.paperCorners)){
    toast('纸张四角已调整，请先“预览校正”并点击“使用校正结果”，再确认素材');return;
  }
  const selected=[...(state.importCandidateSelection||[])];if(!selected.length&&state.importMode!=='work'){toast('请选择至少一件素材，或使用手动补框');return;}
  const rec=state.importRecords[state.importIndex];rec.selectedCandidates=(state.importCandidateData||[]).map((c,i)=>({...c,selected:state.importCandidateSelection.has(i)}));rec.confirmed=true;saveActiveImportRecord();
  const next=state.importRecords.findIndex(r=>!r.confirmed);if(next>=0)await switchImportRecord(next);else{state.importStep='review';render();}
}
async function organizeSavedAssets(records,{waitForSave}={}){
  if(state.preferences.autoOrganize&&records.length){
    const cfg=structuredClone(state.aiSettings),accountID=state.accountId;
    if(cfg.key&&cfg.includeThumbnails&&supportsVision(cfg)){
      let warned=false;
      await assetOrganization.run(records,{waitForSave,organize:async(record,isCurrent)=>{
        if(state.accountId!==accountID||!isCurrent())return;
        const image=await modelImage(record);if(!image)throw Error('素材图像无法读取');
        const result=await classifyRecord({kind:'asset',record,settings:cfg,image,assets:[]});
        await applyAssetClassification(record,result,{isCurrent:()=>state.accountId===accountID&&isCurrent()});
      },onError:()=>{if(state.accountId===accountID&&!warned){warned=true;toast('部分素材自动整理未完成，可稍后重新识别');}}});
    }else toast('未配置可用的视觉接口，素材保留待检查；可在设置关闭自动整理');
  }
}

async function applyAssetClassification(record,result,{manual=false,isCurrent=()=>true}={}){
  if(!isCurrent())return false;
  // Persist each finished answer independently; a late answer must not
  // overwrite a rename, deletion or series change made during inference.
  const latest=await db.get('assets',record.id);if(!latest||!isCurrent())return false;
  const update={...latest,autoOrganized:true};
  if(manual){for(const [key,value] of Object.entries(result))if(JSON.stringify(latest[key])===JSON.stringify(record[key]))update[key]=value;update.updatedAt=new Date().toISOString();}
  else {
    if(latest.title===record.title&&/^素材 \d+$/.test(record.title||''))update.title=result.title;
    if(JSON.stringify(latest.tags||[])===JSON.stringify(record.tags||[])&&!record.tags?.length)update.tags=result.tags;
    for(const key of ['contentTags','styleTags','materialTags','placementHints','semanticColorNames'])if(!latest[key]?.length&&!record[key]?.length)update[key]=result[key]||[];
  }
  if(!isCurrent())return false;
  await db.put('assets',update);
  if(!isCurrent())return false;
  const current=state.assets.find(a=>a.id===record.id);if(current)Object.assign(current,update);
  updateOrganizedAssetView(view,update,{kindName,formatSize:fmt});
  view.catalogRefresh?.();
  return true;
}


async function removeWhite(blob){const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(bitmap,0,0);const im=c.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<im.data.length;i+=4){const r=im.data[i],g=im.data[i+1],b=im.data[i+2],min=Math.min(r,g,b);if(min>247)im.data[i+3]=0;else if(min>230)im.data[i+3]=Math.round(im.data[i+3]*(247-min)/17);}c.putImageData(im,0,0);bitmap.close();return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}
async function backup(){
  const filename=`拾页PWA完整备份-${new Date().toISOString().slice(0,10)}.shiyepwa`;
  // Must request the picker immediately while the click's user activation is
  // live. All later reads, hashing and ZIP work are asynchronous.
  let handle=null;
  if(typeof window.showSaveFilePicker==='function'){
    try{handle=await window.showSaveFilePicker({suggestedName:filename,
      types:[{description:'拾页 ZIP 完整备份',accept:{'application/zip':['.shiyepwa']}}]});}
    catch(error){if(error?.name==='AbortError')return;throw error;}
  }
  let writer=null;
  try{
    await flushSave();saveStatus('正在导出备份…');
    if(handle)writer=await handle.createWritable();
    const result=await db.createBackup({
      onChunk:writer?bytes=>writer.write(bytes):undefined,
      onProgress:p=>{if(p.stage==='image')saveStatus('正在备份素材 '+p.current+'/'+p.total);}
    });
    if(writer){await writer.close();writer=null;}
    else{
      const blob=result,file=new File([blob],filename,{type:'application/zip'});
      if(navigator.canShare?.({files:[file]})){
        try{await navigator.share({files:[file],title:'拾页完整备份'});saveStatus('备份已导出');return;}
        catch(error){if(error.name==='AbortError')return;}
      }
      download(blob,filename);
    }
    saveStatus('完整备份已导出');
  }catch(error){
    if(writer)await writer.abort().catch(()=>{});
    saveStatus('备份未完成 · 原始资料未更改');
    throw error;
  }
}
function download(blob,filename){const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
setCloudProjectPreview(async p=>{if(p.isSnapshot)return (await db.get('blobs',p.snapshotBlobId))?.data||null;const d=p.drafts.find(d=>d.id===p.activeDraftID)||p.drafts[0];if(d.items.some(i=>!asset(i.assetID)))return null;const canvas=await rasterize(d,Math.min(1,360/Math.max(d.canvas.width,d.canvas.height)));return new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));});
async function exportPNG(){const d=current(),canvas=await rasterize(d,2);canvas.toBlob(blob=>download(blob,(state.activeProject.title||'拾页作品')+'.png'),'image/png');}
async function printPage(){const d=current(),canvas=await rasterize(d,2),url=canvas.toDataURL('image/png');const child=window.open('','_blank');if(!child){toast('请允许打开打印预览窗口');return;}child.document.write(`<html><head><title>${esc(state.activeProject.title)}</title><style>@page{size:A4;margin:0}body{margin:0}img{width:100%;height:auto}</style></head><body><img src="${url}" onload="window.print()"></body></html>`);child.document.close();}
async function rasterize(d,scale){
 const ids=[...new Set(editorEntry(d).filter(e=>e.kind==='material').map(e=>asset(e.value.assetID)).filter(a=>a&&!a.staticPath).map(a=>a.blobId))],release=privateImages.retain(ids);
 try{await Promise.all(ids.map(id=>privateImages.load(id,true)));const result=await renderSceneCanvas(d,{scale,loadMaterialImage:async id=>{const a=asset(id);if(!a)throw Error('素材不在当前资料库');return decodeSceneImage(image(a.blobId));}});return result.canvas;}finally{release();}
}
async function receiveImportPhotos(files){const images=[...files].filter(f=>f.type.startsWith('image/')).slice(0,Math.max(0,12-state.importRecords.length));if(!images.length)return;try{saveActiveImportRecord();const start=state.importRecords.length;for(const file of images)state.importRecords.push({file,url:URL.createObjectURL(file),confirmed:false,selectedCandidates:[],selection:[],candidates:[]});state.importStep='inspect';state.route='import';await switchImportRecord(start,true);}catch(e){console.error(e);toast('照片处理失败：'+e.message);}}
fileInput.onchange=async()=>{const files=[...(fileInput.files||[])];fileInput.value='';await receiveImportPhotos(files);};
workFileInput.onchange=async()=>{const file=workFileInput.files?.[0];workFileInput.value='';if(!file)return;if(file.type.startsWith('image/')){await receiveImportPhotos([file]);return;}
  try{await importEditableFile(file);}
  catch(error){console.error(error);toast('可编辑作品导入失败：'+error.message);}
};
snapshotFileInput.onchange=async()=>{const file=snapshotFileInput.files?.[0],matchingProject=offlineSnapshotProject;snapshotFileInput.value='';offlineSnapshotProject=null;if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 PNG、JPEG 或 WebP 图片');const bitmap=await createImageBitmap(file);try{const blobId=uid(),snapshot=snapshotRecord({title:file.name.replace(/\.[^.]+$/,'')||'导入的画面',previewBlobId:blobId,format:file.type,width:bitmap.width,height:bitmap.height});if(matchingProject){snapshot.styles=matchingProject.styles;snapshot.purposes=matchingProject.purposes;snapshot.intent=matchingProject.intent;snapshot.aiGenerated=true;snapshot.offlineBundleId=matchingProject.offlineBundleId||null;}await db.stageImport({projects:[snapshot],blobs:[{id:blobId,data:file}]});urls.set(blobId,URL.createObjectURL(file));if(matchingProject){await matchingSession.importProject(snapshot,{alreadyStored:true});if(modal.open)modal.close();route('matching');toast('画面快照已暂存并加入版本方案，正在后台同步');}else{state.projects.push(snapshot);parity.workTab='snapshot';route('works');toast('画面快照已暂存，正在后台同步');}}finally{bitmap.close();}}catch(error){toast('画面导入失败：'+error.message);}};
async function importEditableFile(file){
  if(/\.zip$/i.test(file.name)){
    if(file.size>20_000_000)throw Error('可编辑作品包不能超过 20 MB');
    const bytes=new Uint8Array(await file.arrayBuffer()),inspected=inspectOfflinePackage(bytes);
    if(inspected.kind==='task'){
      if(inspected.source.materials.some(item=>!state.assets.some(asset=>asset.id===item.assetID)))throw Error('原始任务中的素材不在当前账号资料里');
      await verifyOfflineTaskPackage(bytes,inspected.source);
      if(!confirm('这是网页版 AI 的原始创作任务包。将它登记为后续 AI 作品的校验基线，确认这是你导出的原件吗？'))return;
      await offlineTaskStore.save(await offlineTaskAccount(),inspected.source);
      toast('原始任务已登记；现在请选择 AI 返回的可编辑作品包');return;
    }
    const trustedSource=await trustedOfflineSource(inspected.source);
    await importOfflineProject(await importEditableWorkPackageReviewed(bytes,state.assets,{trustedSource}));
    return;
  }
  if(!/\.json$/i.test(file.name))throw Error('请选择 .shiyeproject.zip 可编辑作品包，或 JSON 备选文件');
  if(file.size>2_000_000)throw Error('可编辑作品文件不能超过 2 MB');
  await importOfflineText(await file.text());
}
const pendingEditableHandles=[];
let editableImportReady=false;
async function consumeEditableHandles(){if(!editableImportReady)return;while(pendingEditableHandles.length){const handle=pendingEditableHandles.shift();try{await importEditableFile(await handle.getFile());}catch(error){console.error(error);toast('可编辑作品导入失败：'+error.message);}}}
if('launchQueue' in window)window.launchQueue.setConsumer(params=>{if(params.files?.length){pendingEditableHandles.push(...params.files);void consumeEditableHandles();}});
emergencyInput.onchange=async()=>{
  const file=emergencyInput.files?.[0];emergencyInput.value='';if(!file)return;
  if(!confirm('恢复待同步应急包会把未上传修改加入本机队列，不会替换云端资料。请确认此文件属于当前账号。'))return;
  try{await flushSave();const counts=await db.restoreEmergencyBackup(file);alert('已恢复 '+(counts[0]+counts[1])+' 项本机待同步资料。将重新打开页面以重新加载队列。');location.reload();}
  catch(error){console.error(error);toast('应急恢复失败（原待同步资料未被覆盖）：'+error.message);}
};
backupInput.onchange=async()=>{const file=backupInput.files?.[0];backupInput.value='';if(!file)return;
  if(!confirm('恢复完整备份会替换当前拾页中的全部资料。继续吗？'))return;
  try{await flushSave();await db.flushProjects();await db.restoreBackup(file);state.activeProject=null;state.basket=[];await refresh();toast('完整备份已恢复');}
  catch(e){console.error(e);toast('恢复失败：'+e.message);}
};
window.addEventListener('pagehide',()=>{if(saveTimer)flushSave().catch(console.error);});
window.addEventListener('beforeunload',event=>{if(saveTimer||savingProjects||dirtyProjects.size){event.preventDefault();event.returnValue='';}});
// Logout requires a durable local checkpoint, not a successful network round
// trip. Unacknowledged edits remain in the account-scoped outbox for re-login.
window.addEventListener('shiye-flush-before-logout',event=>event.detail.tasks.push(flushSave()));
let lastSyncError;
window.addEventListener('shiye-project-sync',event=>{const {pending,error}=event.detail;syncDisplay.pending=pending;syncDisplay.error=error;syncDisplay.checking=false;if(!dirtyProjects.size&&!savingProjects)syncDisplay.localPending=false;updateSyncIndicator();if(error){saveStatus('待同步 · 修改已保留在本机');const message=error.name==='AbortError'||/abort|timed? ?out/i.test(error.message||'')?'网络请求中断，本机修改已保留，将自动重试同步':error.message||'云端暂不可用，本机修改已保留，将自动重试';if(lastSyncError!==message)toast(message);lastSyncError=message;}else{lastSyncError=null;saveStatus(pending?'修改已暂存 · 后台同步中':'已保存到云端');privateImages.retryMissing();}});
let cloudCheck,cloudCheckAt=0,cloudSessionReady=false;
const cloudResumer=createSyncResumer({flush:()=>db.flushProjects(),canRun:()=>cloudEnabled&&cloudSessionReady&&navigator.onLine!==false,onError:error=>console.warn('后台同步待重试',error?.message)});
function backgroundCloudCheck(){if(!cloudEnabled||document.visibilityState==='hidden'||cloudCheck||Date.now()-cloudCheckAt<15000)return;cloudCheckAt=Date.now();cloudCheck=refresh({background:true,onlyChanged:true}).catch(error=>console.warn('后台版本检查失败；保留已验证缓存',error)).finally(()=>{cloudCheck=null;});}
window.addEventListener('focus',()=>{backgroundCloudCheck();privateImages.retryMissing();void cloudResumer.wake();});
document.addEventListener('visibilitychange',()=>{backgroundCloudCheck();if(document.visibilityState==='visible'){privateImages.retryMissing();void cloudResumer.wake();}});
window.addEventListener('online',()=>{backgroundCloudCheck();privateImages.retryMissing();void cloudResumer.wake();});
window.addEventListener('offline',updateSyncIndicator);
window.addEventListener('online',updateSyncIndicator);
async function openSyncDetails(){if(!cloudEnabled)return;cloudResumer.suspend();try{
  const details=await db.pendingSyncDetails(),projects=details.projects||[],batches=details.batches||[],local=[...dirtyProjects.values()],total=projects.length+batches.length+local.length;
  const rows=[...projects.map(row=>`<li>作品：${esc(row.title)} <small>${esc(row.id)}</small></li>`),...batches.map(row=>`<li>待传批次 ${esc(row.id)}：${row.items.length} 条变更<ul>${row.items.slice(0,12).map(item=>`<li>${esc(item.store)} · ${esc(item.action)} · ${esc(item.title||item.id)}</li>`).join('')}</ul></li>`),...local.map(row=>`<li>尚未暂存的作品：${esc(row.title||row.id)}</li>`)];
  body.innerHTML=`<h2>同步详情</h2><p>状态：${esc(syncDisplay.error?'待重试':syncDisplay.pending||local.length?'上传中':'已同步')}</p><p>最近错误：${esc(details.error||syncDisplay.error?.message||'无')}</p><p>本机待同步：${total} 项。这里展示的是本机修改，不代表云端已经收到。</p><div class="sync-pending-list">${rows.length?`<ul>${rows.join('')}</ul>`:'<p>没有待同步项目。</p>'}</div><div class="actions"><button type="button" class="btn primary" id="sync-retry-now">立即重试</button><button type="button" class="btn danger" id="sync-discard-local" ${total?'':'disabled'}>强制不再同步 · 丢弃本机待传修改</button></div><p>放弃后不能从拾页恢复尚未传到云端的修改；已经到云端的资料不会删除。正在发送的请求不能中途丢弃。</p>`;
  modal.showModal();modal.addEventListener('close',()=>{void cloudResumer.resume();},{once:true});
  body.querySelector('#sync-retry-now').onclick=()=>{modal.close();void flushSave().then(()=>db.flushProjects()).catch(error=>toast('重试失败：'+error.message));};
  body.querySelector('#sync-discard-local').onclick=async()=>{if(savingProjects){toast('本机暂存仍在进行，请稍后重试');return;}if(!confirm(`将放弃 ${total} 项本机待同步修改。云端已保存版本不会删除，未上传的修改无法恢复。确定吗？`))return;clearTimeout(saveTimer);saveTimer=null;const button=body.querySelector('#sync-discard-local');button.disabled=true;try{await db.discardPendingSync();dirtyProjects.clear();syncDisplay.localPending=false;syncDisplay.error=null;state.activeProject=null;state.activeDraft=null;const cached=await db.cachedCollections();if(cached){Object.assign(state,cached);await matchingSession.restore({archive:false});state.basket=state.basket.filter(id=>state.assets.some(a=>a.id===id));privateImages.invalidate();modal.close();route(state.route==='editor'?'works':state.route);}else{modal.close();await refresh();await matchingSession.restore({archive:false});}toast('本机待同步修改已放弃；云端资料未删除');}catch(error){button.disabled=false;if(dirtyProjects.size)saveTimer=setTimeout(()=>flushSave().catch(console.error),150);toast('未能放弃待同步修改：'+error.message);}};
 }catch(error){cloudResumer.resume();toast('同步详情读取失败：'+error.message);}}
document.querySelector('#save-state').addEventListener('click',()=>{if(cloudEnabled)void openSyncDetails();});
document.querySelector('#sync-indicator').onclick=()=>void openSyncDetails();
let viewportTimer;
// Rebuilding the page during an active pointer gesture drops native capture.
// In particular, delayed viewport events must not interrupt lasso or ink.
const editorPointers=new Set();
document.addEventListener('pointerdown',e=>{if(state.route==='editor'&&e.target.closest?.('#canvas-page'))editorPointers.add(e.pointerId);},true);
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,e=>editorPointers.delete(e.pointerId),true);
window.addEventListener('blur',()=>editorPointers.clear());
const refitEditor=()=>{if(state.route!=='editor'||document.activeElement?.isContentEditable||state.editingTextID)return;clearTimeout(viewportTimer);viewportTimer=setTimeout(()=>{if(state.route!=='editor'||state.editingTextID)return;if(editorPointers.size){refitEditor();return;}view.editorLayoutSize={width:window.innerWidth,height:window.innerHeight};render();},120);};
window.addEventListener('resize',refitEditor);
window.visualViewport?.addEventListener('resize',refitEditor);
document.querySelectorAll('.main-nav button').forEach(b=>b.onclick=()=>route(b.dataset.route==='library'?'series':b.dataset.route));
document.querySelector('#top-basket').onclick=()=>route('matching');document.querySelector('#top-settings').onclick=()=>route('settings');
async function init(user){let cachedShown=false;cloudSessionReady=true;const accountId=user?.id||'browser';if(state.accountId&&state.accountId!==accountId){assetOrganization.clear();clearJournalTemplateImages();clearJournalPresetImages();state.userTemplates=[];}state.accountId=accountId;try{
  await db.storageMode();state.selfHosted=db.isSameOriginServer();
  // startCloudSession has validated Auth and the allowlist before this runs.
  const cached=await db.cachedCollections();if(cached){Object.assign(state,cached);state.accountId=accountId;await restorePendingProjects();for(const a of state.assets)if(a.staticPath)staticSources.set(a.blobId,a.staticPath);render();cachedShown=true;saveStatus('本机缓存 · 正在核对云端');}
  const initialSync=await db.refreshCloud();if(initialSync?.changed)privateImages.invalidate(initialSync.allBlobs?undefined:initialSync.blobIDs);await syncCurrentMaterials();await refresh({background:cachedShown});void syncCurrentExamples({isProjectOpen:id=>state.activeProject?.id===id}).then(result=>result?.changed&&refresh({background:true})).catch(error=>console.warn('内置示例暂未加载，下次打开重试',error));void purgeExpiredTrash();await matchingSession.restore();editableImportReady=true;void consumeEditableHandles();if('serviceWorker' in navigator&&location.protocol==='https:'){
    void import('./app-update.js').then(({registerSafeUpdate})=>registerSafeUpdate({
      flushLocal:flushSave,
      isBusy:()=>!!(state.importProcessing||state.aiBusy||savingProjects||dirtyProjects.size),
      onError:error=>toast('更新未完成，当前页面和资料保持不变：'+error.message)
    })).catch(error=>console.warn('更新检查暂不可用',error));
  }saveStatus((await db.storageMode())==='server'?'已连接服务器':'已保存到本机');if(cloudEnabled){syncDisplay.checking=false;updateSyncIndicator();void cloudResumer.wake();}
  }catch(e){console.error(e);const auth=e.status===401;if(auth)cloudSessionReady=false;
  if(cachedShown&&!auth){saveStatus('云端核对失败 · 缓存仅供查看');toast('云端连接失败，未改为本机保存：'+e.message);if(cloudEnabled)void cloudResumer.wake();return;}
  if(auth){view.innerHTML=`<div class="empty"><strong>连接拾页数据服务器</strong><p>请输入服务器访问令牌；连接失败时不会另存到浏览器。</p><form id="server-login"><input type="password" name="token" required autocomplete="off" placeholder="服务器访问令牌" aria-label="服务器访问令牌"><button class="btn primary" type="submit">连接</button></form><p id="server-login-error">${esc(e.message)}</p></div>`;view.querySelector('#server-login').onsubmit=event=>{event.preventDefault();db.setStorageConfig({url:db.storageConfig()?.url||location.origin,token:event.target.elements.token.value.trim()});init();};}else{view.innerHTML=`<div class="empty"><strong>无法读取资料</strong><p>${esc(e.message||'请检查设备剩余空间和数据服务连接。')}</p><button class="btn" id="storage-retry">重试连接</button></div>`;view.querySelector('#storage-retry').onclick=()=>init();}saveStatus('存储不可用');}}
mountIcons(document);
const matchingSession=createMatchingSession({state,db,uid,esc,asset,modelImage,rasterize,workCover:p=>{const d=p.drafts.find(d=>d.id===p.activeDraftID)||p.drafts[0];return `<div class="thumb-sheet" style="--thumb-ratio:${d.canvas.width/d.canvas.height};background:${esc(d.paperColor||'#fff')}"><div class="thumb-inner" style="position:relative">${p.isSnapshot?`<img src="${image(p.snapshotBlobId)}" alt="${esc(p.title)} 快照">`:workCover(d)}</div></div>`;},createProject:()=>createMatchingProject(),saveSnapshotFromDraft:saveProjectSnapshot,saveGeneratedImageSnapshot,generatePageImage,runCreativeAgent,createAIRecorder,supportsVision,flushSave,route,handle,mountIcons,toast});
startCloudSession(init).catch(error=>{document.querySelector('#app').hidden=true;const p=document.createElement('p');p.textContent='无法连接认证服务，请稍后刷新。未打开私人资料。';document.body.append(p);console.warn(error.name);});
import {createMatchingSession} from './matching-session.js';
