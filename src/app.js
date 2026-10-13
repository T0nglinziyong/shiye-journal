// Production deployment refresh marker: 2026-10-04
import {assetSourceRevision} from './material-anatomy.js';
const sceneRuntime=()=>import('./scene-renderer.js');
const renderSceneCanvas=async(...args)=>(await sceneRuntime()).renderSceneCanvas(...args);
const decodeSceneImage=async(...args)=>(await sceneRuntime()).decodeSceneImage(...args);
import {sceneRenderEntries,projectMaterialViews,sceneDisplaySiblings} from './craft-display.js';
import {inkScenePaths} from './ink-scene-svg.js';
import {maskSVG,sceneLayerStyle,sceneLayerEntries,attachSceneV2,moveSceneNode} from './scene-model.js';
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
import './page-heading.css';
import './layout-refinements.css';
import './canvas-editor-fixes.css';
import './mobile-material-ui.css';
import {createAssetOrganization,mountOrganizationBadges,updateOrganizedAssetView} from './asset-organization.js';
import {mountIcons,iconMarkup} from './icons.js';
import {startCloudSession} from './entry.js';
import {cloudClient,cloudEnabled,requireCloudUser} from './cloud-session.js';
import {createSyncResumer} from './sync-resumer.js';
import {describeSyncError} from './sync-browser-compat.js';
import {explainUserError} from './user-facing-error.js';
import {setCloudProjectPreview} from './cloud-store.js';
import {snapshotDraft} from './draft-snapshot.js';
import {saveManualArchive,restoreManualArchive} from './scene-archive.js';
import {recordSceneOperation,makeAutoSceneSnapshot,currentSceneDraft,copySceneBaseline} from './scene-persistence.js';
import {retireSplitPiece} from './material-split.js';
import {readAlphaMask,extractAlphaMask} from './alpha-mask-blob.js';
import {renderHighResolutionCutout} from './cutout-full-resolution.js';
import {reconcileCanvasText,textParagraphMarkup} from './canvas-text-content.js';
import {reconcileEditorScene} from './editor-scene-reconcile.js';
import {checkpointEditorHistory,ensureEditorHistory,resetEditorHistory,takeEditorHistoryStep} from './editor-history-scope.js';
import {captureHistory} from './project-history.js';
import {newEditorSession,editorSessionHasEdits} from './editor-session-policy.js';
import {mountCanvasEditor} from './canvas-editor-ui.js';
import {editorExitDecision} from './editor-exit-policy.js';
import {closePopover} from './swift-popover.js';
import {drawPaper} from './paper-rendering.js';
import {shapeSVG,drawInk,textFont,textFontFamily,textLineHeight,textLines} from './editor-tools-model.js';
import {shapeTag} from './shape-preview.js';
import {ImageNodeCache} from './image-node-cache.js';
import {createWorkCoverBackfill} from './work-cover-backfill.js';
import {renderWorkCoverSnapshot} from './work-cover-snapshot.js';
import {createLocalWorkCovers} from './work-cover-local-cache.js';
import {imagePlaceholder,mountPrivateImages} from './lazy-private-images.js';
import {recordImageLoading,imageLoadingSnapshot} from './image-loading-diagnostics.js';
import {reusePagePreviews} from './preview-content-cache.js';
import {mountSeriesCoverSnapshots} from './series-cover-snapshot.js';
import {showAssetEditor} from './asset-editor.js';
import {createAIRecorder,publicAIDiagnosticReport} from './ai-diagnostics.js';
import {mountImportBoxEditor} from './import-box-editor.js';
import {saveImportBatch,importPaperDimensions} from './import-save.js';
import {paperDimensions as presetPaperDimensions,paperSizeOptions} from './paper-sizes.js';
import {refineManualBoxes} from './manual-import-recognition.js';
import {manualPhysicalRegion} from './manual-import-geometry.js';
import {seriesCovers,markProjectAssetsUsed} from './library-model.js';
import {libraryPageData} from './library-page-data.js';
import {reconcileKeyedChildren} from './ui-keyed-dom.js';
import {renderSeriesContents} from './series-contents.js';
import {showSeriesEditor} from './series-editor.js';
import {mountWorkflowControls,mountImportControls,refreshWorkPreviews} from './workflow-ui.js';
import {patchImportInspection} from './import-incremental.js';
import {patchMaterialCatalog,patchWorksCatalog} from './catalog-incremental.js';
import {patchAISettingsModel} from './settings-incremental.js';
import {syncBusyControls} from './ui-disabled-state.js';
import {renderImportInspection,renderImportReview} from './import-workspace-ui.js';
import {showCutoutEditor} from './cutout-editor.js';
import {decodeImageBlob} from './image-blob-decoder.js';
import {mountCanvasSelection} from './canvas-selection-ui.js';
import * as db from './store.js';
import {loadPreferences,savePreferences} from './preferences.js';
import {cloudPreferencesRecord,cloudPreferencesFromMeta} from './cloud-preferences.js';
import {cloudAISettingsRecord,cloudAISettingsFromMeta} from './cloud-ai-settings.js';
import {cloudMatchingSettingsRecord,cloudMatchingSettingsFromMeta,applyMatchingDefaults} from './cloud-matching-settings.js';
import {uid,canvasSize,draft,project,itemFromAsset,physicalPlacement,validatePhysicalDraft,textBlock,primitive,setDraftPaperSize} from './domain.js';
import {detectPaperCandidates,cropBitmap,alignMaterialPreview} from './image.js';
import {filterAutomaticMaterialBoxes} from './automatic-material-size-filter.js';
import {estimatePageLighting} from './material-color-restoration.js';
import {extractEditableCandidateRGB} from './import-candidate-color.js';
import {visionTask,prewarmVision} from './vision-runtime.js';
import {recognitionOptions,recognitionPixelOptions,recognitionMethodDetails,recognitionProfile,candidateDiscoveryOptions} from './recognition-profiles.js';
import {classifyRecord} from './classification.js';
import {mountPaperCorrection,resetPaperCorrection} from './paper-ui.js';
import {rectifyA4Frame,suggestPaperCorners} from './perspective.js';
import {analysisPixels,decodeRecognitionImage,sourcePixels} from './recognition-raster.js';
import {isUntouchedLegacyExample} from './legacy-builtins.js';
import {applyToolCalls,validateScenePhysical} from './creative.js';
import {offlineTaskStore} from './offline-task-store.js';
import {offlinePreviewBytes as encodeOfflinePreview} from './offline-preview.js';
import {mapOfflineExportLimited,prepareOfflineMaterialPreview} from './offline-export-assets.js';
import {buildMaterialScope} from './matching-materials.js';
import {addMatchingFromLibrary,addMatchingFromRecommendation} from './matching-selection.js';
import {matchingRecommendations,renderMatchingPage} from './matching-view.js';
import {captureMatchingScroll,restoreMatchingScroll} from './matching-scroll.js';
import {patchMatchingView} from './matching-incremental.js';
import {selectJournalReferenceCases,loadJournalReferenceCases} from './journal-reference-catalog.js';
import {loadJournalTemplateReferences} from './journal-template-references.js';
import {clearJournalPresetImages} from './journal-preset-images.js';
import {changeTrash,expiredTrash} from './trash-actions.js';
import {visibleMaterials,pruneUnreferencedHiddenAssets} from './asset-retention.js';
// AI agent planning and visual review are paid, optional workflows. Load them only on demand.
const runCreativeAgent=async(...args)=>(await import('./creative-runner.js')).runCreativeAgent(...args);
import {commitAIDraft} from './ai-run-target.js';
import {prepareMaterialPreviews} from './creative-previews.js';
import {materialAliases} from './material-alias.js';
import {snapshotRecord,workInTab} from './work-collections.js';
import {generatePageImage,IMAGE_MODELS} from './ai-image-generation.js';
import {materialMaskCSS,clipMaterial} from './material-mask.js';
import {manualLayoutChoices,applyManualLayout} from './manual-layout-templates.js';
import {exportSceneDocument,importSceneDocument} from './scene-io.js';
import {resetCatalogPage,setCatalogDataPage} from './catalog-pagination.js';
import {AI_PROVIDERS,supportsVision,loadAISettings,saveAISettings} from './ai-settings.js';
import {DELIVERY_OPTIONS,deliveryProfile} from './ai-delivery.js';
import {classifyCreationFile} from './creation-methods.js';
import {mountParityControls as mountSwiftParity,bindWorksCards} from './parity-ui.js';
import {parity} from './parity-ui.js';
import {journalTemplateRecords} from './journal-template-ui.js';
import {clearJournalTemplateImages} from './journal-template-ui.js';
import {syncSelectionScope,reconcileSelectedRecords} from './library-selection-model.js';
import {canApplyBackgroundView,shouldPullCloudForRoute} from './view-update-policy.js';
import {resetSelectionPresenters} from './selection-presenter.js';
import {createActionStore} from './ui-action-store.js';
import {createPageControllerHost} from './page-controller-host.js';
import {createLibraryController,registerLibraryActions} from './page-controllers/library-controller.js';
import {createWorksController,registerWorksActions} from './page-controllers/works-controller.js';
import {createImportController,registerImportActions} from './page-controllers/import-controller.js';
import {createEditorController,registerEditorActions} from './page-controllers/editor-controller.js';
import {createSettingsController,registerSettingsActions} from './page-controllers/settings-controller.js';
import {createStandardController} from './page-controllers/standard-controller.js';
import {createMatchingController,registerMatchingActions} from './page-controllers/matching-controller.js';
import {renderLibraryHTML} from './page-controllers/library-view.js';
import {renderWorksHTML} from './page-controllers/works-view.js';
import {renderEditorHTML} from './page-controllers/editor-view.js';
import {renderImportHTML} from './page-controllers/import-view.js';
import {renderSettingsHTML} from './page-controllers/settings-view.js';

import {installRuntimeDiagnostics,recordRuntimeIssue,runtimeIssueSnapshot} from './runtime-diagnostics.js';
const view=document.querySelector('#view'),modal=document.querySelector('#modal'),body=document.querySelector('#modal-body');
modal.querySelector('.modal-close').onclick=()=>modal.close();
const fileInput=document.querySelector('#file-input'),workFileInput=document.querySelector('#work-file-input'),snapshotFileInput=document.querySelector('#snapshot-file-input'),creationResultInput=document.querySelector('#creation-result-input'),backupInput=document.querySelector('#backup-input'),emergencyInput=document.querySelector('#emergency-input');
let offlineSnapshotProject=null;
let registeringOriginalGPTTask=false;
installRuntimeDiagnostics(()=>state.route);
const state={route:'series',assets:[],series:[],projects:[],trash:[],userTemplates:[],basket:[],excludedAssetIDs:[],history:[],selected:null,activeProject:null,activeDraft:null,offlineEditingReturnID:null,detailAssetID:null,previewProjectID:null,settingsSection:null,selfHosted:false,aiSettings:loadAISettings(),preferences:loadPreferences(),aiPanel:false,aiBusy:false,aiPrompt:'',aiProgress:'',tool:'select',zoom:1,sort:'newest',query:'',kind:'all',status:'all',seriesID:'all',matchCore:null,matchRatio:'a4',matchMode:'single',matchStyle:'韩系清新',matchStyles:['韩系清新'],matchPurposes:['日常记录'],matchIntent:'',matchContentPolicy:'documentary',matchTextPresentation:'mixed',matchPurpose:'日常记录',matchProcessing:'不预设',materialUseHints:{},materialUseRequired:{},assetProcessing:{},customPaperWidth:210,customPaperHeight:297,recommendFilter:'全部',coreIDs:[],importStep:'inspect',importRecords:[],importIndex:0,importFile:null,importBitmap:null,importBox:{x:0,y:0,w:1,h:1},importCandidate:null,importRemoveWhite:false,undo:[],redo:[],drawing:false};
// Action changes are published independently of their DOM representation.
const actionStore=createActionStore(state);
actionStore.register('legacy/action',async({action,id,value})=>({result:await legacyHandle(action,id,value)}));
// Safari's native page pinch must not compete with the editor's bounded canvas zoom.
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,event=>event.preventDefault(),{passive:false});
const urls=new Map(),staticSources=new Map();
const assetOrganization=createAssetOrganization();
mountOrganizationBadges(view,assetOrganization);
const imageNodes=new ImageNodeCache();
const libraryHistory=[];
function openLibraryAsset(id){libraryHistory.push({route:state.route,seriesID:state.seriesID,detailAssetID:state.detailAssetID});state.detailAssetID=id;const selected=asset(id);if(selected?.blobId)privateImages.focus(selected.blobId);route('assetDetail');}
function libraryBack(){const previous=libraryHistory.pop();if(!previous){navigateBack('series');return;}navigationHistory.pop();state.seriesID=previous.seriesID;state.detailAssetID=previous.detailAssetID;route(previous.route,{back:true});}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=s=>{const el=document.querySelector('#toast');el.textContent=/can't find variable|is not defined|undefined is not an object|blob:|expected magic word/i.test(String(s))?explainUserError(s):s;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3500);};
const saveStatus=s=>{const label=cloudEnabled?({'已保存到本机':'已保存到云端','本机存储':'云端存储'}[s]||s):s;document.querySelector('#save-state').textContent=label;for(const el of document.querySelectorAll('.swift-auto-saved'))el.textContent=label;};
const syncDisplay={pending:0,error:null,conflicts:0,checking:true,localPending:false};
function updateSyncIndicator(){
  if(!cloudEnabled)return;
  const conflict=syncDisplay.conflicts>0||/云端版本已变化|另一设备已更新|conflict/i.test(syncDisplay.error?.message||'');
  const status=conflict?'conflict':syncDisplay.error?'error':navigator.onLine===false&&syncDisplay.pending?'offline':syncDisplay.checking?'checking':syncDisplay.pending||syncDisplay.localPending?'uploading':'synced';
  const label={conflict:'同步冲突',error:'待重试',offline:'待联网',checking:'核对中',uploading:'上传中',synced:'已同步'}[status];
  for(const button of document.querySelectorAll('.sync-indicator')){button.hidden=false;button.dataset.status=status;button.title=conflict?'其他设备修改了同一资料；本机待传内容仍保留，请先检查其他设备':syncDisplay.error?'上传未完成；点击重试：'+syncDisplay.error.message:label;button.setAttribute('aria-label',label);button.querySelector('.sync-indicator-label').textContent=label;}
}
function mountPageSyncIndicator(){
  if(!cloudEnabled)return;
  // Import has its own compact step toolbar. Sync status remains accessible
  // through the normal account UI after leaving the import wizard.
  updateSyncIndicator();
}
const recognitionPreprocessOptions=()=>({
  illumination:state.balanceLight===true,
  denoise:state.preferences.recognitionDenoise===true,
  localContrast:state.preferences.recognitionLocalContrast===true,
  chromaEdges:state.preferences.recognitionChromaEdges!==false
});
const recognitionPostprocessOptions=()=>({
  shapeRegularization:state.importShapeRegularization??(state.preferences.recognitionShapeRegularization!==false),
  apertures:state.importApertures??(state.preferences.recognitionApertures!==false)
});
const asset=id=>state.assets.find(x=>x.id===id)||state.trash.find(t=>t.kind==='asset'&&t.item.id===id)?.item;
const image=id=>staticSources.get(id)||
  state.trash.find(t=>t.kind==='asset'&&t.item.blobId===id)?.item.staticPath||
  (cloudEnabled?imagePlaceholder(id):urls.get(id)||imagePlaceholder(id));
// Only the real creative canvas and cutout detail use display-scaled COS
// variants. Everything else (Works/Matching/Library/editor material tray)
// uses one fixed 480-pixel snapshot stored in COS.
const privateImages=mountPrivateImages({root:document.body,db,urls,fullView:img=>
  (state.route==='editor'&&!!img.closest('#canvas-page .canvas-object.material'))||
  (state.route==='assetDetail'&&!!img.closest('.detail-picture')),onEvent:recordImageLoading});
let previewPrewarmEpoch=0;
let workDocumentPrewarmEpoch=0;
function prewarmVisibleWorkDocuments(){
  const epoch=++workDocumentPrewarmEpoch;
  if(!cloudEnabled||navigator.connection?.saveData)return;
  const ids=[...view.querySelectorAll('.works-grid [data-act="open-project"][data-id]')]
    .filter(card=>{const box=card.getBoundingClientRect();return box.width>0&&box.height>0&&box.top<innerHeight&&box.bottom>0;})
    .map(card=>card.dataset.id).slice(0,2);
  const warm=async()=>{
    if(epoch!==workDocumentPrewarmEpoch||state.route!=='works'||document.visibilityState==='hidden')return;
    for(const id of ids){
      if(epoch!==workDocumentPrewarmEpoch||state.route!=='works')return;
      const project=state.projects.find(row=>row.id===id);
      if(project?.projectDocumentPath&&!project.isSnapshot)
        await db.completeProject(project).catch(error=>console.warn('作品预读待重试',error?.message));
    }
  };
  setTimeout(()=>{
    if(epoch!==workDocumentPrewarmEpoch||state.route!=='works')return;
    if('requestIdleCallback' in window)requestIdleCallback(()=>void warm(),{timeout:1500});
    else void warm();
  },650);
}
function prewarmOtherPages(){
  const epoch=++previewPrewarmEpoch;
  if(!cloudEnabled||navigator.connection?.saveData)return;
  // Warm only a small cross-route window, after visible images have had time
  // to load. Use the same bounded loader queue and account-scoped cache;
  // no hidden <img> nodes or eager DOM image decoding are created here.
  const ids=[
    ...state.assets.filter(a=>!a.staticPath).slice(0,8).map(a=>a.blobId),
    ...state.projects.slice(0,4).map(p=>p.isSnapshot?p.snapshotBlobId:
      (p.drafts?.find(d=>d.id===p.activeDraftID)||p.drafts?.[0])?.coverImageID)
  ].filter(Boolean);
  let index=0;
  const next=()=>{
    if(epoch!==previewPrewarmEpoch||index>=ids.length||document.visibilityState!=='visible')return;
    const run=()=>{
      if(epoch!==previewPrewarmEpoch||document.visibilityState!=='visible')return;
      void privateImages.load(ids[index++],false,{background:true}).catch(()=>{}).finally(()=>{
        if(epoch===previewPrewarmEpoch)setTimeout(next,300);
      });
    };
    if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:3000});
    else setTimeout(run,250);
  };
  setTimeout(next,1500);
}
const renderLocalCoverBlob=project=>renderWorkCoverSnapshot(project,{
  resolveAsset:async id=>asset(id)||await db.get('assets',id),
  previewBlob:async(id,pixels)=>{
    // Immediately reuse a just-imported source already held by this browser,
    // instead of blocking the Works card on an unfinished COS thumbnail PUT.
    const localURL=urls.get(id);
    if(localURL)try{const raw=await fetch(localURL).then(response=>response.blob());
      if(raw.size)return raw;}catch{}
    // Already uploaded materials use the fixed 480px COS derivative.
    const preview=await db.previewBlob(id,pixels).catch(()=>null);
    if(preview instanceof Blob&&preview.size)return preview;
    const local=(await db.get('blobs',id).catch(()=>null))?.data;
    if(local instanceof Blob&&local.size)return local;
    throw Error('素材图片暂不可读取：'+id);
  },
  decodeStatic:decodeSceneImage,renderScene:renderSceneCanvas,
  createBitmap:blob=>createImageBitmap(blob),
  getSnapshot:async id=>(await db.get('blobs',id))?.data||null
});
const localWorkCovers=createLocalWorkCovers({
  state,loadDocument:p=>db.completeProject(p),renderCover:renderLocalCoverBlob,
  onReady:(p,url)=>{
    const actual=state.projects.find(item=>item.id===p.id)||
      state.trash.find(entry=>entry.kind==='project'&&entry.item.id===p.id)?.item;
    if(!actual||actual.updatedAt!==p.updatedAt)return;
    const draft=actual.drafts.find(item=>item.id===actual.activeDraftID)||actual.drafts[0];
    // Once the COS reference is committed, it remains the preferred source.
    if(draft?.coverImageID||draft?.coverBlobId||state.route!=='works')return;
    const card=[...view.querySelectorAll('[data-act="open-project"],[data-cover-project-id]')]
      .find(el=>el.dataset.id===p.id||el.dataset.coverProjectId===p.id),
      sheet=card?.querySelector('.thumb-sheet');
    if(!sheet)return;
    const img=document.createElement('img');img.className='work-reference';
    img.src=url;img.alt=actual.title+' 本地完整封面';
    img.loading='eager';img.decoding='async';sheet.replaceChildren(img);
  },
  onError:(_message,id,error)=>{
    console.warn('本地封面暂不可用',id,error);
    if(state.route!=='works')return;
    const card=[...view.querySelectorAll('[data-act="open-project"]')].find(el=>el.dataset.id===id),
      status=card?.querySelector('.work-cover-pending');
    if(status)status.textContent='封面暂不可用，重新进入后重试';
  }
});
const workCoverBackfill=createWorkCoverBackfill({db,state,cloudEnabled});
// Cover loading never steals a Works card click: opening a card always edits it.

// A successful COS upload is published after its metadata transaction commits.
// Hydrate the card in place; rebuilding the entire Works grid resets image
// decoding/scroll and produces the slow cover-by-cover animation.
window.addEventListener('shiye-project-cover-ready',event=>{
  const {projectID,updatedAt,draftID,coverImageID,coverSceneHash}=event.detail||{};
  const p=state.projects.find(row=>row.id===projectID);
  if(!p||!coverImageID||p.updatedAt!==updatedAt)return;
  const d=p.drafts?.find(row=>row.id===draftID);
  if(!d)return;
  d.coverImageID=coverImageID;
  d.coverSceneHash=coverSceneHash;
  void privateImages.load(coverImageID,false).then(()=>{
    if(state.route!=='works'&&state.route!=='projectPreview')return;
    const project=state.projects.find(row=>row.id===projectID);
    if(!project||project.updatedAt!==updatedAt)return;
    const card=[...view.querySelectorAll('[data-act="open-project"]')].find(el=>el.dataset.id===projectID),
      sheet=card?.querySelector('.thumb-sheet')||
        (state.previewProjectID===projectID?view.querySelector('.project-preview-cover .preview-paper'):null);
    if(!sheet)return;
    const img=document.createElement('img');
    img.className='work-reference';
    img.src=image(coverImageID);
    img.alt=project.title+' 完整封面';
    img.loading='eager';
    img.decoding='async';
    sheet.replaceChildren(img);
  }).catch(error=>console.warn('COS 封面显示待重试',error));
});
let settingsSession=null,deferredSyncedPreferences=null,deferredSyncedAISettings=null;
function captureSettings(){
  if(state.route!=='settings')return;
  if(view.querySelector('#setting-ai-provider'))state.aiSettings=readAIForm();
  if(view.querySelector('#setting-paper-size'))state.preferences={...state.preferences,recognition:view.querySelector('#setting-recognition').value,candidateDiscovery:view.querySelector('#setting-candidate-discovery')?.value||'legacy',recognitionPixels:Number(view.querySelector('#setting-recognition-pixels').value),materialColorMode:view.querySelector('#setting-material-color')?.value||'auto',balanceLight:view.querySelector('#setting-preprocess-light').checked,recognitionDenoise:view.querySelector('#setting-preprocess-denoise').checked,recognitionLocalContrast:view.querySelector('#setting-preprocess-contrast').checked,recognitionChromaEdges:view.querySelector('#setting-preprocess-chroma').checked,recognitionShapeRegularization:view.querySelector('#setting-postprocess-shapes').checked,recognitionApertures:view.querySelector('#setting-postprocess-apertures').checked,mergeSharedCarrier:view.querySelector('#setting-merge-carrier').checked,paperSize:view.querySelector('#setting-paper-size').value,orientation:view.querySelector('#setting-orientation').value,wholePaper:view.querySelector('#setting-whole-paper').checked,autoOrganize:view.querySelector('#setting-auto-organize').checked,autoOrganizeWorks:view.querySelector('#setting-auto-organize-works')?.checked!==false};
  if(view.querySelector('#setting-display'))state.preferences={...state.preferences,display:view.querySelector('#setting-display').value,backdrop:view.querySelector('#setting-backdrop').value,maxPageItems:Number(view.querySelector('#setting-page-items').value)};
}
const routeScroll=new Map();
let matchingScrollMemory=null;
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
// Material navigation remembers the actual tab/series detail. Opening Works,
// Matching or Settings must not silently route back to Series.
const lastMaterialLocation={route:'series',seriesID:'all',libraryTab:'series'};
function navigateBack(fallback='series'){
  const previous=navigationHistory.pop();
  if(!previous){route(fallback,{back:true});return;}
  Object.assign(state,{seriesID:previous.seriesID,detailAssetID:previous.detailAssetID,previewProjectID:previous.previewProjectID});
  route(previous.route,{back:true});
}
let editorOpenSequence=0,editorSessionBaseline=null;
function route(name,{back=false,restoreMaterial=false}={}){
  editorOpenSequence++;
  viewInteractionRevision++;
  const fromSettings=state.route==='settings';
  if(['series','library'].includes(state.route)&&!['series','library'].includes(name)){
    Object.assign(lastMaterialLocation,{route:state.route,
      seriesID:state.seriesID,libraryTab:parity.libraryTab});
  }
  if(restoreMaterial&&['series','library'].includes(name)){
    state.seriesID=state.series.some(row=>row.id===lastMaterialLocation.seriesID)?lastMaterialLocation.seriesID:'all';
    parity.libraryTab=lastMaterialLocation.libraryTab||'series';
  }
  if(!back&&!fromSettings&&name!=='settings'&&name!==state.route)navigationHistory.push({route:state.route,seriesID:state.seriesID,detailAssetID:state.detailAssetID,previewProjectID:state.previewProjectID});
  if(state.route==='editor'&&name!=='editor'){
    view.flushInkCommit?.({renderUI:false,force:true});
    view.endTextEditing?.();
    if(editorSessionHasEdits(state.activeProject,editorSessionBaseline,saveVersions))
      snapshotEditedScene('leave-editor');
    editorSessionBaseline=null;
    // Reentering after another device's commit must establish a fresh base;
    // never manufacture a local operation against an obsolete editor session.
    for(const key of sceneTrackBases.keys())
      if(key.startsWith((state.activeProject?.id||'')+':'))sceneTrackBases.delete(key);
  }
  routeScroll.set(state.route+':'+state.seriesID,window.scrollY);
  if(name==='settings'&&!settingsSession)settingsSession={ai:structuredClone(state.aiSettings),preferences:structuredClone(state.preferences),returnRoute:state.route};
  if(state.route==='settings'&&name!=='settings'&&settingsSession){state.aiSettings=settingsSession.ai;state.preferences=settingsSession.preferences;settingsSession=null;state.settingsSection=null;if(cloudEnabled&&deferredSyncedPreferences)state.preferences=savePreferences(deferredSyncedPreferences);if(cloudEnabled&&deferredSyncedAISettings)state.aiSettings=saveAISettings(deferredSyncedAISettings);deferredSyncedPreferences=null;deferredSyncedAISettings=null;}
if(state.route==='editor'&&name!=='editor'&&aiController)aiController.abort(Error('已离开创作页面'));const priorRoute=state.route;if(name==='matching'&&priorRoute!=='matching'&&cloudMatchingDefaults&&!matchingDefaultsPending)applyMatchingDefaults(state,cloudMatchingDefaults);syncSelectionScope(parity,name);state.route=name;
if(name!=='assetDetail')privateImages.focus(null);
if(priorRoute!=='editor'&&name==='editor')
  editorSessionBaseline=newEditorSession(state.activeProject,saveVersions);
actionStore.publish('route/change',{scope:'route',keys:['route'],payload:{from:priorRoute,to:name}});if(name==='import'&&state.importMode!=='snapshot'&&typeof Worker!=='undefined')void prewarmVision().catch(()=>{});if(name==='series'){state.seriesID='all';state.addingToSeries=null;libraryHistory.length=0;}if(name!=='library')state.addingToSeries=null;if(name!=='settings'&&!fromSettings)state.selected=null;render();
  // A return from Works/Settings must honor the last matching viewport even
  // if the currently selected series ID has since changed. Nested panes are
  // already restored inside render() from the same snapshot.
  const matchingViewport=name==='matching'&&
    matchingScrollMemory?.account===(state.accountId||'browser')
    ?matchingScrollMemory.scroll.viewport:null;
  window.scrollTo(matchingViewport?.left??0,
    matchingViewport?.top??(routeScroll.get(name+':'+state.seriesID)||0));
  // Do not interrupt an unfinished matching/import workspace with a remote
  // repaint. Pull all queued remote deletions immediately on returning to
  // another page, instead of waiting for the next polling window.
  if(cloudEnabled&&!shouldPullCloudForRoute(priorRoute)&&shouldPullCloudForRoute(name))
    queueMicrotask(()=>backgroundCloudCheck({force:true}));
}
function imgTag(a,priority=false){const src=a&&(image(a.blobId)||a.staticPath),eager=priority===true;return src?`<img data-asset-image-id="${esc(a.id)}" loading="${eager?'eager':'lazy'}" ${eager?'fetchpriority="high" ':''}decoding="async" src="${esc(src)}" alt="${esc(a.title)}">`:'<span>无预览</span>';}
function assetCard(a){const revision=esc(JSON.stringify([a.title,a.kind,a.physicalWidthMM,a.physicalHeightMM,a.reviewStatus,a.isFavorite,a.blobId]));return `<button class="card" data-card-revision="${revision}" data-act="detail" data-id="${a.id}"><div class="card-image">${imgTag(a)}</div><div class="card-body"><h3>${esc(a.title)}${a.isFavorite?'<span class="card-favorite" aria-label="已收藏">♥</span>':''}</h3><p>${esc(kindName(a.kind))} · ${a.physicalWidthMM?`${fmt(a.physicalWidthMM)} × ${fmt(a.physicalHeightMM)} mm`:'尺寸待确认'}</p><span class="chip ${a.reviewStatus==='ready'?'':'warn'}">${a.reviewStatus==='ready'?'已整理':'待检查'}</span></div></button>`;}
const fmt=n=>Number(n).toFixed(1).replace(/\.0$/,'');
function head(title,subtitle,actions=''){return `<div class="view-head unified-page-heading"><div class="unified-heading-copy"><span class="eyebrow">FROM YOUR DESK TO YOUR PAGES</span><h1>${title}</h1></div><div class="actions">${actions}</div></div>`;}
const boundPageActions=new WeakSet();
// Every route exposes one controller contract; business commands are
// independent Action/State transitions and can outlive a DOM mount.
const pageControllers=createPageControllerHost();
registerLibraryActions(actionStore,{db,state,asset});
registerWorksActions(actionStore);
registerImportActions(actionStore,{state,saveActiveImportRecord});
registerSettingsActions(actionStore,{providers:AI_PROVIDERS});
registerEditorActions(actionStore,{historyStep});
registerMatchingActions(actionStore,{addMatchingFromRecommendation});
pageControllers.register('library',createLibraryController({
  renderHTML:renderLibrary,patchCatalog:patchMaterialCatalog,view,state,parity,
  binder:bindPage,actions:actionStore,onCatalogChanged:updateLibraryResults
}));
pageControllers.register('works',createWorksController({
  renderHTML:renderWorks,patchCatalog:patchWorksCatalog,view,state,parity,
  binder:bindPage,bindCards:cards=>bindWorksCards({state,view,handle},cards),
  refreshPreviews:()=>refreshWorkPreviews({state,view}),
  reusePreviews:()=>reusePagePreviews({view,state}),
  coverBackfill:workCoverBackfill,localCovers:localWorkCovers,
  catalogChanged:()=>view.catalogRefresh?.(),actions:actionStore,render
}));
pageControllers.register('import',createImportController({
  renderHTML:renderImport,patchInspector:patchImportInspection,view,state,
  binder:bindPage,actions:actionStore,render,
  mountControls:()=>mountImportControls({state,view,body,modal,db,render,route,toast,esc,
    openCutoutCheck,switchImportRecord,saveActiveImportRecord}),
  disposePaper:()=>{view.paperCorrectionDispose?.();view.paperCorrectionDispose=null;},
  disposeManual:()=>{view.manualBoxDispose?.();view.manualBoxDispose=null;},
  mountPaper:()=>{view.paperCorrectionDispose=mountPaperCorrection({state,view,saveActiveImportRecord});},
  mountManual:bindManualBox
}));
pageControllers.register('editor',createEditorController({
  renderHTML:renderEditor,patchScene:refreshCanvas,actions:actionStore,render,view,
  createEditor:()=>{
    view.editorDraft=current();view.editorInk=current().strokes;
    view.editorLayoutKey=editorLayoutKey();
    markSceneTrackingBaseline(state.activeProject);
    mountCanvasEditor({state,view,body,modal,current,checkpoint,saveProject,render,route,
      flushSave,toast,esc,imgTag,asset,db,handle,openCutoutCheck,openAICreation});
    mountCanvasSelection({state,view,current,checkpoint,saveProject,render,toast});
  }
}));
pageControllers.register('matching',createMatchingController({
  renderHTML:renderMatching,actions:actionStore,
  updateMatchingRegions,queueDefaults:queueMatchingDefaultsSync
}));
pageControllers.register('settings',createSettingsController({
  renderHTML:renderSettings,patchModel:patchAISettingsModel,view,state,
  binder:bindPage,actions:actionStore,render
}));
for(const [routeName,renderHTML] of [
  ['series',renderSeries],
  ['assetDetail',renderAssetDetail],['projectPreview',renderProjectPreview]
])pageControllers.register(routeName,createStandardController(renderHTML));
// Collection refresh changes business state. Only this projection subscriber
// requests a view update; cloud/store modules never import UI implementations.
actionStore.subscribe(event=>{
  if(event.scope==='collections')render();
  if(event.type==='library/favorite'){
    const a=asset(event.payload?.id),heart=view.querySelector('.detail-heart');
    if(a&&state.route==='assetDetail'&&state.detailAssetID===a.id&&heart){
      heart.textContent=a.isFavorite?'♥':'♡';
      heart.setAttribute('aria-label',a.isFavorite?'取消收藏':'收藏');
      heart.setAttribute('aria-pressed',String(!!a.isFavorite));
    }
    if(a)toast(a.isFavorite?'已收藏':'已取消收藏');
  }
});
function render(){
  if(state.route==='editor'&&state.activeProject?.drafts?.some(d=>d.textBlocks?.some(t=>t.style==='hand')))
    void import('@fontsource/ma-shan-zheng/chinese-simplified-400.css');
  // Keep the import photo queue at the exact scroll position while the whole
  // view is replaced on every photo switch, load-progress update and confirm.
  // Do not scroll the selected photo into view: that causes backward jumps.
  const priorImportQueue=state.route==='import'?view.querySelector('.queue-strip'):null;
  const importQueueScroll=priorImportQueue?.scrollLeft??null;
  // Capture BEFORE editing/backdrop CSS changes or DOM teardown. Switching
  // from Matching into Editor can otherwise clamp the old page scroll first.
  const previousMatchingScroll=captureMatchingScroll(view,window);
  if(previousMatchingScroll)matchingScrollMemory={
    account:state.accountId||'browser',scroll:previousMatchingScroll
  };
  document.body.classList.toggle('editing',state.route==='editor');document.body.dataset.backdrop=state.preferences.backdrop;document.querySelectorAll('.main-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===state.route||(b.dataset.route==='library'&&['series','import'].includes(state.route))));document.querySelector('#basket-count').textContent=state.basket.length;
  // Controller owns the decision to patch. A safe fallback remounts the
  // current route; business actions never manipulate page DOM here.
  if(pageControllers.patch(state.route)){backgroundViewPending=false;return;}
  pageControllers.dispose();
  // The controller lifetime has released route-owned observers, gestures,
  // and native editor listeners before replacing their DOM hosts.
  view.workCoverDispose=null;view.localWorkCoverDispose=null;
  view.deletedCoverDispose?.();view.deletedCoverDispose=null;
  view.seriesCoverDispose?.();view.seriesCoverDispose=null;
  view.editorDispose=null;view.manualBoxDispose=null;view.paperCorrectionDispose=null;
  view.editorRefresh=null;view.catalogRefresh=null;resetSelectionPresenters(view);
  view.assetCardsChanged=null;
  if(view.onshowsimilar){view.removeEventListener('show-similar',view.onshowsimilar);view.onshowsimilar=null;}
  closePopover();imageNodes.remember(view.querySelectorAll('img[src]'));
  view.editorLayoutSize={width:window.innerWidth,height:window.innerHeight};
  view.innerHTML=pageControllers.render(state.route)||renderLibrary();
  view.dataset.renderedRoute=state.route;
  view.dataset.renderedImportStep=state.route==='import'?state.importStep:'';
  view.dataset.renderedImportMode=state.route==='import'?state.importMode:'';
  view.dataset.renderedLibraryTab=state.route==='library'?parity.libraryTab:'';
  view.dataset.renderedWorkTab=state.route==='works'?parity.workTab:'';
  view.dataset.renderedSettingsSection=state.route==='settings'?state.settingsSection||'':'';
  for(const fresh of view.querySelectorAll('img[src]')){const old=imageNodes.take(fresh);if(old)fresh.replaceWith(old);}
  if(importQueueScroll!==null){
    const replacement=view.querySelector('.queue-strip');
    if(replacement)replacement.scrollLeft=importQueueScroll;
  }
  reusePagePreviews({view,state});mountSeriesCoverSnapshots({view,state});
  mountParityControls();bindPage();mountWorkflowControls({state,view,body,modal,db,render,route,toast,imgTag,assetCard,esc,asset,refresh,download,modelImage,rasterize,backup,openSeriesEditor,openAssetEditor:openDetail,openCutoutCheck,switchImportRecord,saveActiveImportRecord,saveProject,flushSave,moveProjectsToTrash,assetOrganization,applyAssetClassification});view.catalogRefresh?.();if(state.route==='works'){
    view.localWorkCoverDispose=localWorkCovers.observe(view);
    view.workCoverDispose=workCoverBackfill.observe(view);
    prewarmVisibleWorkDocuments();
  }
  pageControllers.mount(state.route);
  if(state.route==='matching'&&
     matchingScrollMemory?.account===(state.accountId||'browser')){
    // The page and every independent scrollable column/textarea keep their
    // positions after star/remove/filter/proposal/generation rerenders.
    restoreMatchingScroll(view,matchingScrollMemory.scroll,window);
  }
  mountPageSyncIndicator();backgroundViewPending=false;}
function editorLayoutKey(){const size=view.editorLayoutSize||{width:window.innerWidth,height:window.innerHeight};return [size.width,size.height,current()?.canvas.width,current()?.canvas.height,!!state.workspacePanel,!!state.aiPanel].join(':');}
function refreshCanvas(){
  const d=current(),page=view.querySelector('#canvas-page');
  // Never unmount the editor simply because it contains groups or pen strokes.
  // Keep the user's pointer session, composition input, decoded images and
  // the layer-tree popover alive across ordinary Scene v2 mutations.
  if(!page||view.editorDraft!==d||view.editorLayoutKey!==editorLayoutKey()||!view.editorRefresh)return false;
  const scale=page.clientWidth/d.canvas.width;
  reconcileEditorScene(page,renderSceneDOM(d,scale),{
    onText:reconcileCanvasText,
    onImage:(node,next)=>{
      const current=node.querySelector('img'),fresh=next.querySelector('img');
      if(current&&fresh){
        const src=fresh.getAttribute('src');
        if(src!==current.getAttribute('src'))current.setAttribute('src',src);
        current.alt=fresh.alt;
        // The source crop belongs to a physical material. Never overwrite
        // its decoded image's scale/offset with the bare imgTag styling.
        const item=d.items.find(i=>i.id===node.dataset.object);
        const crop=item?.cropRect;
        current.style.cssText=crop?`position:absolute;max-width:none;width:${100/crop.width}%;height:${100/crop.height}%;left:${-crop.x/crop.width*100}%;top:${-crop.y/crop.height*100}%;object-fit:fill`:'';
      }else if(!current&&fresh)node.prepend(fresh);
      else if(current&&!fresh)current.remove();
    }
  });
  const paperKey=JSON.stringify([d.paperColor,d.paperPattern,d.paperRuling,d.drawCenterGutter]);
  if(page.dataset.paperKey!==paperKey){
    drawPaper(page.querySelector('.paper-layer').getContext('2d'),d);
    page.dataset.paperKey=paperKey;
    page.style.backgroundColor=d.paperColor;
  }
  for(const pattern of ['plain','grid','lines','dots','columns'])page.classList.toggle(pattern,d.paperPattern===pattern);
  const start=view.querySelector('#ai-start'),stop=view.querySelector('#ai-stop'),progress=view.querySelector('#ai-progress'),report=view.querySelector('#ai-report');
  if(start){start.disabled=!!state.aiBusy;start.textContent=state.aiBusy?'创作中…':'开始创作';}
  if(stop)stop.disabled=!state.aiBusy;
  if(progress)progress.textContent=state.aiProgress||'';
  if(report)report.disabled=!aiReport;
  view.editorRefresh();view.canvasSelectionRefresh?.();return true;
}
function mountParityControls(){mountSwiftParity({libraryBack,openLibraryAsset,openAssetEditor:openDetail,state,view,body,modal,db,render,route,toast,asset,imgTag,workCover,localCovers:localWorkCovers,awaitTrashStages,createFromBasket,openAICreation,openSeriesEditor,current,checkpoint,saveProject,flushSave,uid,handle,esc,matchingSession});}
function renderLibrary(){return renderLibraryHTML({state,esc,imgTag,assetCard,head,renderSeriesContents,kindName});}
function updateLibraryResults(){
  if(view.querySelector('.series-contents'))return;
  const grid=view.querySelector('.asset-grid'),filters=view.querySelector('.filters');
  if(!grid||!filters)return;
  const page=libraryPageData(state),desired=document.createElement('div');
  desired.innerHTML='<button class="card action-card" data-act="import"><div class="card-image">＋</div><div class="card-body"><h3>导入素材</h3><p>添加照片或文件</p></div></button>'+page.items.map(assetCard).join('');
  reconcileKeyedChildren(grid,desired,node=>node.classList.contains('action-card')?'import':node.dataset.id||null,{
    update:(current,next)=>current.dataset.cardRevision===next.dataset.cardRevision
  });
  grid.querySelector('.action-card').hidden=state.seriesID!=='all'||state.status!=='all'||state.kind!=='all'||!!state.query.trim();
  view.assetCardsChanged?.(page.total);
  if(!(parity.selectionMode&&parity.showOnlySelected))filters.querySelector('.library-count').textContent=page.total+' 项';
  let controls=filters.querySelector('.catalog-page-controls');
  if(!controls){controls=document.createElement('div');controls.className='catalog-page-controls';controls.innerHTML='<input type="number" min="1" aria-label="输入页码"><button type="button" aria-label="上一页">‹</button><button type="button" aria-label="下一页">›</button>';filters.append(controls);}
  const [input,previous,next]=controls.children;
  input.value=String(page.current);input.max=String(page.count);
  previous.disabled=page.current===1;next.disabled=page.current===page.count;
  const change=value=>{setCatalogDataPage('library',value);updateLibraryResults();};
  input.onchange=()=>change(Number(input.value));previous.onclick=()=>change(page.current-1);next.onclick=()=>change(page.current+1);
  view.catalogRefresh=updateLibraryResults;
}
const kindName=k=>({sticker:'贴纸',paper:'纸张',tape:'胶带',photo:'照片',text:'文字',reference:'参考'})[k]||k;
function renderSeries(){return head('我的素材','把喜欢的，收进系列。')+`<div class="grid series-grid ${state.preferences.display==='list'?'list-grid':''}">${[...state.series].sort((a,b)=>a.id.startsWith('B700')&&b.id.startsWith('B700')?b.id.localeCompare(a.id):a.id.startsWith('B700')?-1:b.id.startsWith('B700')?1:0).map((s,index)=>{const members=state.assets.filter(a=>a.seriesID===s.id&&!a.isProjectInternal);const cover=seriesCovers(s,state.assets);return `<button class="card" data-act="series-detail" data-id="${s.id}"><div class="series-cover">${cover.map(a=>imgTag(a,index<2)).join('')}</div><div class="card-body"><h3>${esc(s.title)} <span aria-hidden="true">→</span></h3><p>${members.length} 件素材</p></div></button>`;}).join('')}</div>`;}
function renderMatching(){return renderMatchingPage({state,head,imgTag,esc,kindName,session:matchingSession});}
function matchingScope(){return buildMaterialScope({basket:state.basket,coreIDs:state.coreIDs,recommendations:matchingRecommendations(state),excluded:state.excludedAssetIDs,autoIncludeRecommendations:state.aiSettings.autoIncludeRecommendations,requireAllCandidates:state.aiSettings.requireAllCandidates});}
// Common actions update only affected Matching panes, preserving the entire
// remaining page, sticky header, textarea selection and decoded thumbnails.
function updateMatchingRegions(regions,{persist=true}={}){
  if(state.route!=='matching')return render();
  document.querySelector('#basket-count').textContent=state.basket.length;
  const patched=patchMatchingView({
    view,renderHTML:renderMatching,regions,
    onAction:(action,id,value)=>handle(action,id,value),mountIcons
  });
  if(!patched)render();
  // Full render previously invoked bindPage(), which automatically staged
  // matching state. Incremental updates intentionally skip bindPage(), so
  // explicitly retain that durable local save for stars, exclusions, basket,
  // and filter changes. createMatchingSession serializes concurrent saves.
  if(persist)void matchingSession.persist().catch(error=>{
    console.warn('本机搭配状态保存失败',error);
    toast('本机搭配状态暂存失败：'+error.message);
  });
}
function refreshMatchingRecommendations(){const current=view.querySelector('.match-recommendations');if(!current)return;const scroll=captureMatchingScroll(view,window);const template=document.createElement('template');template.innerHTML=renderMatching();const next=template.content.querySelector('.match-recommendations');if(!next)return;current.replaceWith(next);next.querySelectorAll('[data-act]').forEach(el=>el.addEventListener('click',()=>handle(el.dataset.act,el.dataset.id,el.dataset.val)));mountIcons(next);const summary=view.querySelector('.basket>.muted'),fresh=template.content.querySelector('.basket>.muted');if(summary&&fresh)summary.textContent=fresh.textContent;restoreMatchingScroll(view,scroll,window);}
function workInkPreview(d){if(!d.strokes?.length)return '';const paths=d.strokes.map(s=>{const points=(s.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!points.length)return '';const color=esc(s.color||'#2b5245'),width=Math.max(.5,Number(s.width)||3),opacity=Math.max(0,Math.min(1,Number(s.opacity??1)));if(points.length===1)return `<circle cx="${points[0].x}" cy="${points[0].y}" r="${width/2}" fill="${color}" opacity="${opacity}"/>`;return `<path d="${points.map((p,n)=>`${n?'L':'M'}${p.x} ${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;}).join('');return `<svg class="work-ink-preview" viewBox="0 0 ${d.canvas.width} ${d.canvas.height}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>`;}
function workCover(d,priority=false,snapshotOnly=false,projectID=null){
 if(!d)return '';
 if(d.coverImageID||d.coverBlobId)return `<img class="work-reference" loading="${priority?'eager':'lazy'}" ${priority?'fetchpriority="high" ':''}decoding="async" src="${image(d.coverImageID||d.coverBlobId)}" alt="作品完整封面">`;
 // Cloud Works cards must show the pre-rendered COS WebP as ONE image. Do
 // not fall back to mounting every material/shape/text (progressive pop-in).
  if(snapshotOnly&&cloudEnabled){
   const project=projectID?state.projects.find(p=>p.id===projectID)||
     state.trash.find(entry=>entry.kind==='project'&&entry.item.id===projectID)?.item:null;
   const source=project?localWorkCovers.peek(project):null;
   return source?`<img class="work-reference" loading="${priority?'eager':'lazy'}" ${priority?'fetchpriority="high" ':''}decoding="async" src="${esc(source)}" alt="本地完整作品封面">`:
     (d.layers?.length?workCover(d,priority,false):workInkPreview(d)||'<span class="work-cover-pending" role="status">正在准备预览…</span>');
 }
 const position=(i,flip=false)=>`left:${(i.x-i.width/2)/d.canvas.width*100}%;top:${(i.y-i.height/2)/d.canvas.height*100}%;width:${i.width/d.canvas.width*100}%;height:${i.height/d.canvas.height*100}%;transform:rotate(${i.rotation||0}deg) ${flip&&i.isFlippedHorizontally?'scaleX(-1)':''};opacity:${i.opacity??1};z-index:${i.zIndex||0};`;
 const part=node=>{
   if(node.hidden||node.isHidden||node.isParked||node.parked)return '';
   if(node.type==='group'){
     const style=sceneLayerStyle(node),svg=style.mask?'mask-image:url("data:image/svg+xml,'+encodeURIComponent(maskSVG(style.mask))+'");-webkit-mask-image:url("data:image/svg+xml,'+encodeURIComponent(maskSVG(style.mask))+'");mask-size:100% 100%;':'';
     return '<span class="scene-v2-group" style="z-index:'+(node.zIndex??0)+';opacity:'+(node.opacity??1)+';mix-blend-mode:'+(style.blendMode==='multiply'?'multiply':'normal')+';'+svg+'">'+nodes(node.children||[])+'</span>';
   }
   const extra=node.blendMode==='multiply'?'mix-blend-mode:multiply;':'';
   if(node.type==='material'){
     const a=asset(node.assetID);if(!a)return '';
     return [node].map(item=>{const crop=item.cropRect||{x:0,y:0,width:1,height:1};
       return '<span class="work-material" style="'+position(item,true)+materialMaskCSS(item)+extra+'"><span style="position:absolute;inset:0"><img loading="lazy" decoding="async" src="'+image(a.blobId)+'" style="position:absolute;max-width:none;width:'+(100/crop.width)+'%;height:'+(100/crop.height)+'%;left:'+(-crop.x/crop.width*100)+'%;top:'+(-crop.y/crop.height*100)+'%;object-fit:fill"></span></span>';
     }).join('');
   }
   if(node.type==='shape')return '<span class="work-shape" style="'+position(node)+extra+'">'+shapeTag(node)+'</span>';
   if(node.type==='text')return '<span class="work-text" style="'+position(node)+extra+'font-size:'+Math.max(.6,node.fontSize/d.canvas.width*100)+'cqw;line-height:'+textLineHeight(node)/d.canvas.width*100+'cqw;color:'+esc(node.color||'#333')+';text-align:'+(node.alignment||'left')+';font-family:'+esc(textFontFamily(node))+'">'+textParagraphMarkup(node,(node.paragraphSpacing||0)/d.canvas.width*100+'cqw')+'</span>';
   if(node.type==='ink'){
     return '<svg class="scene-ink-object" viewBox="0 0 '+d.canvas.width+' '+d.canvas.height+'" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;z-index:'+(node.zIndex??2000)+';opacity:'+(node.opacity??1)+';pointer-events:none;'+extra+'">'+inkScenePaths(node)+'</svg>';
   }
   return '';
 };
 const nodes=items=>sceneDisplaySiblings(items).map(part).join('');
 return nodes(d.layers||[]);

}
function renderWorks(){return renderWorksHTML({state,esc,head,isUntouchedLegacyExample,workCover,image});}
function current(){const p=state.activeProject,d=p?.drafts.find(d=>d.id===state.activeDraft)||p?.drafts[0];return d?attachSceneV2(d):undefined;}
function editorEntry(d,rendering=false){return rendering?sceneRenderEntries(d):sceneLayerEntries(d,{ink:false});}
function vectorMarkup(i){const paths=(i.vectorPaths||[]).map(points=>{const d=points.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)).map((p,n)=>`${n?'L':'M'}${p[0]} ${p[1]}`).join(' ');return d?`<path d="${d} Z"/>`:'';}).join('');return `<svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible;fill:${esc(i.fill||'transparent')};stroke:${esc(i.stroke||'none')};stroke-width:${Math.max(0,Number(i.lineWidth)||0)/Math.max(i.width,i.height,1)}">${paths}</svg>`;}
function renderCanvasObject(e,scale){const i=e.value;
if(e.kind==='ink'){
  const d=current(),width=d.canvas.width,height=d.canvas.height;
  return '<svg class="canvas-object scene-ink-object" data-render-key="'+esc(i.id)+'" aria-hidden="true" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;z-index:'+(i.zIndex??2000)+';opacity:'+(i.opacity??1)+';mix-blend-mode:'+(i.blendMode==='multiply'?'multiply':'normal')+';pointer-events:none">'+inkScenePaths(i)+'</svg>';
}
const left=(i.x-i.width/2)*scale,top=(i.y-i.height/2)*scale;let inner='';let extra='';if(e.kind==='material'){const crop=i.cropRect||{x:0,y:0,width:1,height:1};inner=`<span class="canvas-material-source" style="position:absolute;inset:0"><span style="position:absolute;display:block;max-width:none;width:${100/crop.width}%;height:${100/crop.height}%;left:${-crop.x/crop.width*100}%;top:${-crop.y/crop.height*100}%">${imgTag(asset(i.assetID))}</span></span>`;extra=`opacity:${i.opacity};${materialMaskCSS(i)}${i.isFlippedHorizontally?'--flip:-1;':''}`;}else if(e.kind==='text'){inner=`<div data-text-content>${textParagraphMarkup(i,(i.paragraphSpacing||0)*scale+'px')}</div>`;extra=`${i.paragraphSpacing?'display:block;':''}opacity:${i.opacity??1};font-size:${i.fontSize*scale}px;line-height:${textLineHeight(i)*scale}px;letter-spacing:${(i.letterSpacing||0)*scale}px;font-style:${i.italic?'italic':'normal'};text-decoration:${[i.underline?'underline':'',i.strikethrough?'line-through':''].filter(Boolean).join(' ')||'none'};color:${esc(i.color)};text-align:${i.alignment||'left'};font-family:${esc(textFontFamily(i))};font-weight:${i.bold?'700':'400'};`; }else{extra=`background:${i.kind==='frame'||i.kind==='line'?'transparent':esc(i.fill||'transparent')};border-color:${esc(i.stroke||'transparent')};border-width:${Math.max(1,i.lineWidth*scale)}px;opacity:${i.opacity};`;}
if(e.kind==='shape'){inner=shapeTag(i);extra=`opacity:${i.opacity??1};`;}
const layerStyle=sceneLayerStyle(i);if(layerStyle.blendMode==='multiply')extra+='mix-blend-mode:multiply;';
if(layerStyle.mask){const encoded=encodeURIComponent(maskSVG(layerStyle.mask));extra+='-webkit-mask-image:url("data:image/svg+xml,'+encoded+'");mask-image:url("data:image/svg+xml,'+encoded+'");-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;';}
return `<div class="canvas-object ${e.kind} ${i.kind||''} ${state.selected===i.id?'selected':''}" data-object="${esc(i.ownerID||i.id)}" data-render-key="${esc(i.renderKey||i.id)}" data-kind="${e.kind}" style="left:${left}px;top:${top}px;width:${i.width*scale}px;height:${i.height*scale}px;transform:rotate(${i.rotation||0}deg) ${i.isFlippedHorizontally?'scaleX(-1)':''};z-index:${i.zIndex};${extra}">${inner}</div>`;}
function renderSceneDOM(d,scale){
  attachSceneV2(d);
  const draw=nodes=>sceneDisplaySiblings(nodes).map(node=>{
    if(node.hidden||node.isHidden||node.isParked||node.parked)return '';
    if(node.type!=='group'){
      if(node.type==='material')return renderCanvasObject({kind:'material',value:node},scale);
      return renderCanvasObject({kind:node.type,value:node},scale);
    }
    const style=sceneLayerStyle(node),mask=style.mask?'mask-image:url("data:image/svg+xml,'+encodeURIComponent(maskSVG(style.mask))+'");-webkit-mask-image:url("data:image/svg+xml,'+encodeURIComponent(maskSVG(style.mask))+'");mask-size:100% 100%;-webkit-mask-size:100% 100%;':'';
    return '<div class="scene-v2-group" data-scene-group="'+esc(node.id)+'" style="z-index:'+(node.zIndex??0)+';opacity:'+(node.opacity??1)+';mix-blend-mode:'+(style.blendMode==='multiply'?'multiply':'normal')+';'+mask+'">'+draw(node.children||[])+'</div>';
  }).join('');
  return draw(d.layers);
}
function renderEditor(){return renderEditorHTML({state,current,renderWorks,editorEntry,renderCanvasObject,renderSceneDOM,esc,imgTag,asset,inspector,pageInspector,renderAIPanel});}
function inspector(e){const i=e.value;return `<div class="stack">${e.kind==='text'?`<label>文字内容<textarea id="inspector-text">${esc(i.content)}</textarea></label><label>字体<select id="inspector-font"><option value="serif" ${i.style==='serif'?'selected':''}>宋体</option><option value="sans" ${i.style==='sans'?'selected':''}>黑体</option><option value="rounded" ${i.style==='rounded'?'selected':''}>圆体</option></select></label><label>字号<input id="inspector-font-size" type="number" min="8" max="200" value="${i.fontSize}"></label>`:''}<div class="form-grid"><label>宽<input id="inspector-width" type="number" min="1" value="${fmt(i.width)}" ${e.kind==='material'?'disabled title="实物尺寸来自素材标定"':''}></label><label>高<input id="inspector-height" type="number" min="1" value="${fmt(i.height)}" ${e.kind==='material'?'disabled title="实物尺寸来自素材标定"':''}></label><label>旋转<input id="inspector-rotation" type="number" value="${fmt(i.rotation||0)}"></label><label>图层<input id="inspector-z" type="number" value="${i.zIndex}"></label></div><label>透明度<input id="inspector-opacity" type="range" min="0.1" max="1" step="0.05" value="${i.opacity||1}"></label>${e.kind==='material'?`<p class="muted">实物 ${fmt(asset(i.assetID)?.physicalWidthMM||0)} × ${fmt(asset(i.assetID)?.physicalHeightMM||0)} mm</p>`:''}<div class="actions"><button class="btn mini" data-act="duplicate">复制</button><button class="btn mini" data-act="flip">镜像</button><button class="btn mini" data-act="front">置顶</button><button class="btn mini danger" data-act="delete-object">删除</button></div></div>`;}
function pageInspector(d){return `<div class="stack"><label>纸张颜色<input id="paper-color" type="color" value="${esc(d.paperColor)}"></label><label>背景<select id="paper-pattern"><option value="plain">纯色</option><option value="grid" ${d.paperPattern==='grid'?'selected':''}>方格</option><option value="lines" ${d.paperPattern==='lines'?'selected':''}>横线</option><option value="dots" ${d.paperPattern==='dots'?'selected':''}>点阵</option></select></label><label>纸张规格<select id="page-ratio">${paperSizeOptions(d.pageRatio,{includeCustom:false})}${['portrait','square','landscape'].map(v=>`<option value="${v}" ${d.pageRatio===v?'selected':''}>旧版比例 · ${v.toUpperCase()}</option>`).join('')}${d.pageRatio?.startsWith('custom:')?`<option value="${esc(d.pageRatio)}" selected>自定义 ${esc(d.pageRatio.slice(7))} mm</option>`:''}</select></label><label>页面模式<select id="page-mode"><option value="single">单页</option><option value="spread" ${d.pageMode==='spread'?'selected':''}>双页</option></select></label></div>`;}
function importSourceButtons(){return `<div class="import-source-actions"><button class="btn primary" data-act="select-file" data-val="gallery">▣　从图库中选择</button><button class="btn" data-act="select-file" data-val="camera">▣　拍摄图片</button><button class="btn" data-act="select-file" data-val="files">▱　从文件中导入</button>${state.importMode==='work'?'<small>选择 .shiyeproject.zip 可编辑作品包或 JSON 备选文件会直接导入，不经过照片识别。</small>':''}</div>`;}
function importSteps(){return `<div class="import-nav" aria-label="导入进度"><button class="import-back" data-act="import-back" aria-label="返回上一步" title="返回"></button><div class="import-nav-center"><div class="import-progress" aria-label="当前步骤">${[['inspect','检查照片'],['review','确认归类'],['done','完成']].map(([key,label],i)=>`<span class="${state.importStep===key?'current':(i<['inspect','review','done'].indexOf(state.importStep)?'passed':'')}"><b>${i<['inspect','review','done'].indexOf(state.importStep)?'✓':i+1}</b><span class="import-step-label">${label}</span></span>`).join('')}</div></div><button class="import-cancel" data-act="import-exit">${state.importStep==='done'?'完成':'取消导入'}</button></div>`;}
function renderImport(){return renderImportHTML({state,esc,fmt,importSteps,importSourceButtons,renderImportReview,renderImportInspection});}
function renderAssetDetail(){const a=asset(state.detailAssetID);if(!a)return renderLibrary();return `<div class="detail-page"><button class="detail-back" data-act="detail-back">‹　返回素材库</button><span class="detail-category">${esc(state.series.find(s=>s.id===a.seriesID)?.title||'所有系列')}</span><section class="detail-columns"><div class="detail-picture"><span>▣　透明素材预览</span>${imgTag(a,true)}</div><div class="detail-copy"><div class="eyebrow">A LITTLE PIECE OF EVERYDAY</div><button class="detail-heart" data-act="detail-favorite" aria-label="收藏">${a.isFavorite?'♥':'♡'}</button><h1>${esc(a.title)}</h1><div class="detail-facts"><div><small>真实尺寸</small><span>${fmt(a.physicalWidthMM||0)} × ${fmt(a.physicalHeightMM||0)} mm</span></div><div><small>可用库存</small><span>${a.supply?.quantity??1} 件</span></div><div><small>素材类型</small><span>${kindName(a.kind)}</span></div><div><small>主要作用</small><span>${a.role==='background'?'背景':a.role==='connector'?'连接':'陪衬'}</span></div><div><small>材质</small><span>${esc(a.texture||'待记录')}</span></div></div><div class="detail-tags">${[...(a.tags||[]),...(a.contentTags||[]),...(a.styleTags||[]),...(a.materialTags||[])].filter((tag,index,list)=>tag&&list.indexOf(tag)===index).sort((x,y)=>x.localeCompare(y,'zh-CN')).map(tag=>`<span>${esc(tag)}</span>`).join('')}</div><div class="detail-dots">● ● ● ●</div><hr><p>实物可用操作</p><p>✓ 整件使用　 ✓ 旋转摆放</p><button class="btn primary detail-add" data-act="detail-add">＋　加入本次创作</button><div class="detail-links"><button class="btn" data-act="detail-series"><span class="detail-link-label">同系列</span></button><button class="btn" data-act="detail-similar"><span class="detail-link-label">找相似</span></button><button class="btn" data-act="detail-match"><span class="detail-link-label">去搭配</span></button></div><div class="detail-small"><button data-act="detail-edit">✎　编辑素材信息</button><button data-act="detail-check">□　检查抠图</button></div></div></section></div>`;}
function renderProjectPreview(){const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p)return renderWorks();const d=p.drafts.find(x=>x.id===p.activeDraftID)||p.drafts[0];const original=p.coverStaticPath&&p.updatedAt===p.coverBaselineUpdatedAt;return `<div class="project-preview-page"><div class="project-preview-head"><h1>${esc(p.title)}</h1><button class="btn" data-act="preview-back">关闭</button></div><div class="project-preview-cover"><div class="preview-paper" style="background:${esc(d.paperColor||'#fff')};aspect-ratio:${d.canvas.width}/${d.canvas.height}">${p.isSnapshot?`<img class="work-reference" loading="eager" fetchpriority="high" decoding="async" src="${image(p.snapshotBlobId)}" alt="${esc(p.title)} 快照">`:original?`<img class="work-reference" loading="eager" fetchpriority="high" decoding="async" src="${p.coverStaticPath}" alt="${esc(p.title)} 完整预览">`:workCover(d,true,true,p.id)}</div></div><div class="project-preview-tags">${[...(p.styleTags||[]),...(p.tags||[])].filter((tag,index,list)=>tag&&list.indexOf(tag)===index).map(tag=>`<span>${esc(tag)}</span>`).join('')}</div><p>${p.isSnapshot?'独立保存的画面快照，不能逐层编辑。':'页面上的素材、排版和书写内容都已保存。'}</p><div class="project-preview-actions">${p.isSnapshot?'<button class="btn primary" data-act="download-snapshot">下载快照</button>':'<button class="btn primary" data-act="preview-continue">继续创作</button>'}<button class="btn" data-act="project-meta">作品信息与标签</button><button class="btn danger" data-act="project-delete">移到最近删除</button></div></div>`;}
let aiModelPanelOpen=false;
// Reuse one compact card language for every settings category.
function sectionSettings(html){
  const parts=html.split(/(?=<h2>)/).filter(part=>part.trim());
  return parts.map(part=>'<section class="recognition-settings-group">'+part+'</section>').join('');
}
const settingToggle=(id,label,checked,help)=>`<label class="toggle-row setting-toggle"><span><b>${label}</b><small class="setting-help">${help}</small></span><input id="${id}" type="checkbox" ${checked?'checked':''}></label>`;
function renderSettings(){return renderSettingsHTML({state,esc,AI_PROVIDERS,DELIVERY_OPTIONS,IMAGE_MODELS,candidateDiscoveryOptions,recognitionOptions,recognitionPixelOptions,recognitionMethodDetails,paperSizeOptions,settingToggle,sectionSettings,db,cloudEnabled,aiModelPanelOpen,supportsVision});}
function readAIForm(){const q=id=>view.querySelector('#setting-ai-'+id),old=state.aiSettings,provider=q('provider').value,keys={...old.keys,[old.provider]:q('key').value},creationMode=q('delivery').value;return {...old,provider,keys,key:q('key').value,endpoint:q('endpoint').value,model:q('model').value==='__custom__'?q('custom-model').value.trim():q('model').value,imageModel:q('image-model').value,...deliveryProfile(creationMode),includeStructureReference:q('structure-reference').checked,sendPresetReferences:q('send-reference').checked,autoIncludeRecommendations:q('auto-recommendations').checked,requireAllCandidates:q('require-all').checked,finalVisualReview:q('visual-review')?.checked!==false,customVision:q('vision').checked,includeThumbnails:q('thumbnails').checked,temperature:q('temperature').value,maxTokens:q('tokens').value,maxTurns:q('turns').value,requestTimeout:q('timeout').value,transport:q('transport').value,textMode:q('text').value,reasoningMode:q('reasoning').value,sendOutputLimit:q('send-limit').checked,disableThinking:q('disable-thinking').checked,customLayoutPrompt:q('layout-prompt').value};}

let cloudMatchingDefaults=null,matchingDefaultsTimer=null,matchingDefaultsPending=false,matchingDefaultsLocalEdited=false;
function queueMatchingDefaultsSync(){
  if(!cloudEnabled||!state.accountId)return;
  clearTimeout(matchingDefaultsTimer);
  matchingDefaultsPending=true;matchingDefaultsLocalEdited=true;
  const accountID=state.accountId,record=cloudMatchingSettingsRecord(state);
  cloudMatchingDefaults=structuredClone(record.settings);
  matchingDefaultsTimer=setTimeout(()=>{
    matchingDefaultsTimer=null;
    if(state.accountId!==accountID)return;
    void db.transaction(['meta'],tx=>tx.objectStore('meta').put(record))
      .catch(error=>console.warn('搭配方向云端设置待同步',error?.message))
      .finally(()=>{if(!matchingDefaultsTimer)matchingDefaultsPending=false;});
  },650);
}
function bindPage({partial=false}={}){view.querySelectorAll('[data-act]').forEach(el=>{if(boundPageActions.has(el))return;boundPageActions.add(el);el.addEventListener('click',()=>handle(el.dataset.act,el.dataset.id,el.dataset.val));});
  const assetStatus=view.querySelector('#status-filter');if(assetStatus&&!assetStatus.querySelector('[value="favorite"]')){const option=document.createElement('option');option.value='favorite';option.textContent='已收藏';assetStatus.append(option);}
  const assetHeart=view.querySelector('.detail-heart');if(assetHeart)assetHeart.setAttribute('aria-pressed',String(!!asset(state.detailAssetID)?.isFavorite));
  if(state.route==='projectPreview'){const p=state.projects.find(x=>x.id===state.previewProjectID);if(p?.isSnapshot){const header=view.querySelector('.project-preview-head');const heart=document.createElement('button');heart.type='button';heart.className='snapshot-favorite';heart.setAttribute('aria-label',p.isFavorite?'取消收藏快照':'收藏快照');heart.setAttribute('aria-pressed',String(!!p.isFavorite));heart.textContent=p.isFavorite?'♥':'♡';heart.onclick=async()=>{const next={...p,isFavorite:!p.isFavorite};await db.put('projects',next);Object.assign(p,next);heart.textContent=next.isFavorite?'♥':'♡';heart.setAttribute('aria-label',next.isFavorite?'取消收藏快照':'收藏快照');heart.setAttribute('aria-pressed',String(!!next.isFavorite));};header?.querySelector('h1')?.after(heart);}}
  const aiModelGroup=view.querySelector('#ai-model-group');if(aiModelGroup)aiModelGroup.ontoggle=event=>{aiModelPanelOpen=event.currentTarget.open;};
  if(state.route==='matching'){
    const saveMatching=()=>matchingSession.persist().catch(e=>{console.warn('本机搭配状态未保存；不影响云端作品同步',e);toast('本机搭配状态保存失败：'+e.message);});
    const fields={'match-style':'matchStyle','match-purpose':'matchPurpose','match-intent':'matchIntent','match-content-policy':'matchContentPolicy','match-text-presentation':'matchTextPresentation','match-processing':'matchProcessing','match-mode':'matchMode','match-ratio':'matchRatio','match-paper-width':'customPaperWidth','match-paper-height':'customPaperHeight'};
    for(const [id,key] of Object.entries(fields))view.querySelector('#'+id)?.addEventListener('change',e=>{state[key]=e.target.type==='number'?Number(e.target.value):e.target.value;if(id==='match-style')state.matchStyles=readMatchSelection(id,state.matchStyle);if(id==='match-purpose')state.matchPurposes=readMatchSelection(id,state.matchPurpose);if(id==='match-style'||id==='match-purpose')refreshMatchingRecommendations();void saveMatching();if(id!=='match-intent')queueMatchingDefaultsSync();});
    // Entering or rerendering this page is not an explicit save action. Any
    // changed session is staged in the background; sync errors use the global
    // indicator instead of interrupting navigation with a toast.
    void saveMatching();
  }
  const recognitionChoice=view.querySelector('#setting-recognition');
  if(recognitionChoice)recognitionChoice.onchange=()=>{
    const note=view.querySelector('[data-recognition-method-note]');
    if(note)note.textContent=recognitionMethodDetails.find(x=>x.id===recognitionChoice.value)?.description||'';
  };
  const provider=view.querySelector('#setting-ai-provider');if(provider)provider.onchange=()=>{const previous=readAIForm();void actionStore.dispatch({type:'settings/provider',payload:{previous,next:provider.value}}).catch(error=>toast(error.message));};
  const modelSelect=view.querySelector('#setting-ai-model');if(modelSelect)modelSelect.onchange=()=>{view.querySelector('#setting-ai-custom-model-row').hidden=modelSelect.value!=='__custom__';if(modelSelect.value!=='__custom__')view.querySelector('#setting-ai-thumbnails').checked=AI_PROVIDERS[state.aiSettings.provider].models.find(m=>m[0]===modelSelect.value)?.[2]===true;};
  const timeoutInput=view.querySelector('#setting-ai-timeout');if(timeoutInput){timeoutInput.parentElement.firstChild.textContent='连续无响应超时（秒）';timeoutInput.parentElement.insertAdjacentHTML('afterend','<p>流式接收期间只计算连续未收到数据的时间；每轮最多 10 分钟，不会自动重试收费请求。</p>');}
  if(state.route==='editor'){bindAIPanel();const anchor=view.querySelector('[data-act="creative-json"]');if(anchor){const ai=document.createElement('button');ai.type='button';ai.className='btn primary';ai.textContent='AI 创作';ai.onclick=openAICreation;anchor.before(ai);}}
  // Catalog search/select listeners are scoped to the Library controller.
  const title=view.querySelector('#project-title');if(title)title.addEventListener('blur',()=>{
    const p=state.activeProject;if(!p)return;
    const next=title.textContent.trim()||'未命名手账';
    if(next!==p.title){p.title=next;saveProject();}
  });
  const draftSelect=view.querySelector('#draft-select');if(draftSelect)draftSelect.onchange=()=>{state.activeDraft=draftSelect.value;state.selected=null;resetEditorHistory(state);render();};
  if(state.route==='import'&&state.showManualBox&&!partial)bindManualBox();
  for(const [id,key] of [['import-paper-width','customImportWidth'],['import-paper-height','customImportHeight']]){const el=view.querySelector('#'+id);if(el)el.onchange=()=>{const n=Number(el.value);if(!Number.isFinite(n)||n<1||n>10000){toast('纸张宽高为 1–10000 mm');return;}state[key]=n;recalibrateImport();};}const whole=view.querySelector('#whole-paper');if(whole)whole.onchange=()=>{state.wholePaper=whole.checked;recalibrateImport();};for(const [id,key] of [['paper-size','paperSize'],['paper-orientation','paperOrientation']]){const el=view.querySelector('#'+id);if(el)el.onchange=()=>{state[key]=el.type==='checkbox'?el.checked:el.value;recalibrateImport();};}
  const balance=view.querySelector('#balance-light');if(balance)balance.onchange=async()=>{const before=state.balanceLight;if(state.importProcessing){balance.checked=before;return;}if(state.importCandidateData?.length&&!confirm('更改光照会重新识别候选并重置当前候选标注，继续？')){balance.checked=before;return;}state.importProcessing=state.importMode==='snapshot'?'正在调整页面颜色…':'正在均衡光照并重新识别…';state.balanceLight=balance.checked;saveActiveImportRecord();render();try{if(state.importMode!=='snapshot')await previewCrop();}catch(e){state.balanceLight=before;toast(e.message);}finally{state.importProcessing='';if(state.route==='import')render();}};
  for(const [selector,key] of [['#import-shape-regularization','importShapeRegularization'],['#import-apertures','importApertures']]){
    const input=view.querySelector(selector);if(!input)continue;
    input.onchange=async()=>{
      const before=state[key];if(state.importProcessing){input.checked=before;return;}
      if(state.importCandidateData?.length&&!confirm('更改边缘后处理需要重新识别当前照片，继续？')){input.checked=before;return;}
      state[key]=input.checked;state.importRecords[state.importIndex][key]=input.checked;
      state.importProcessing='正在按新参数细化轮廓…';render();
      try{await previewCrop();}catch(error){state[key]=before;toast(error.message);}
      finally{state.importProcessing='';if(state.route==='import')render();}
    };
  }
  const materialColour=view.querySelector('#import-material-color');
  if(materialColour)materialColour.onchange=async()=>{
    const value=materialColour.value,record=state.importRecords[state.importIndex];
    state.importMaterialColorMode=value;record.importMaterialColorMode=value;
    if(state.importProcessing||!state.importCandidates?.length)return;
    state.importProcessing='正在更新高清颜色…';render();
    try{await refreshImportCandidates(state.importCandidates);}catch(error){toast('颜色更新失败：'+error.message);}
    finally{state.importProcessing='';if(state.route==='import')render();}
  };
  view.querySelectorAll('[data-import-name]').forEach(el=>el.onchange=()=>{const [ri,ci]=el.dataset.importName.split(':').map(Number);state.importRecords[ri].selectedCandidates[ci].title=el.value;});
  for(const key of ['width','height'])view.querySelectorAll(`[data-import-${key}]`).forEach(el=>el.onchange=()=>{const [ri,ci]=el.dataset[`import${key[0].toUpperCase()+key.slice(1)}`].split(':').map(Number);state.importRecords[ri].selectedCandidates[ci][key]=+el.value||null;});
  view.querySelectorAll('.record-series').forEach(el=>{
    const record=state.importRecords[+el.dataset.index];
    el.value=record?.seriesID??'';
    el.onchange=async()=>{
      if(!record)return;
      if(el.value!=='__new__'){record.seriesID=el.value;return;}
      const previous=record.seriesID??'',name=prompt('新建系列名称');
      if(!name?.trim()){el.value=previous;return;}
      const now=new Date().toISOString(),group={id:uid(),title:name.trim(),introduction:'',createdAt:now,updatedAt:now};
      try{
        await db.put('series',group);
        state.series.push(group);record.seriesID=group.id;render();
      }catch(error){el.value=previous;toast('系列新建失败：'+error.message);}
    };
  });view.querySelectorAll('.record-work-title').forEach(el=>el.oninput=()=>{state.importRecords[+el.dataset.index].workTitle=el.value;});
  const batchSeries=view.querySelector('#batch-series');
  if(batchSeries){batchSeries.value=state.importBatchSeriesID||'';batchSeries.onchange=async()=>{
    if(batchSeries.value!=='__new__'){state.importBatchSeriesID=batchSeries.value;return;}
    const name=prompt('新建系列名称');
    if(!name?.trim()){batchSeries.value=state.importBatchSeriesID||'';return;}
    const now=new Date().toISOString(),group={id:uid(),title:name.trim(),introduction:'',createdAt:now,updatedAt:now};
    try{await db.put('series',group);state.series.push(group);state.importBatchSeriesID=group.id;render();}
    catch(error){batchSeries.value=state.importBatchSeriesID||'';toast('系列新建失败：'+error.message);}
  };}
  const batchWorkAssets=view.querySelector('#batch-work-save-assets');
  if(batchWorkAssets)batchWorkAssets.onchange=()=>{
    state.importBatchWorkSaveAssets=batchWorkAssets.checked;
    for(const record of state.importRecords)if(!record.workSaveAssetsManual)record.workSaveAssets=batchWorkAssets.checked;
    render();
  };
  view.querySelectorAll('.record-work-save-assets').forEach(el=>el.onchange=()=>{
    const record=state.importRecords[+el.dataset.index];record.workSaveAssets=el.checked;record.workSaveAssetsManual=true;
  });
  view.querySelectorAll('[data-import-paper-options]').forEach(button=>button.onclick=()=>{
    const ri=Number(button.dataset.importPaperOptions),record=state.importRecords[ri];
    if(!record)return;
    const paperTypes=[['plain','纯色'],['grid','方格'],['lines','横线'],['dots','点阵'],['columns','双栏']];
    body.innerHTML='<div class="dialog-head"><h2>页面背景</h2></div>'+
      '<div class="stack"><label>底纸样式<select id="review-background-pattern">'+
      paperTypes.map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')+
      '</select></label><label>底纸颜色<input id="review-background-color" type="color" value="'+esc(record.workPaperColor||state.importBatchWorkPaperColor||'#fcfaf0')+'"></label>'+
      '<button type="button" class="btn primary" id="review-background-done">完成</button></div>';
    const pattern=body.querySelector('#review-background-pattern'),
      color=body.querySelector('#review-background-color');
    pattern.value=record.workPaperPattern||state.importBatchWorkPaperPattern||'plain';
    const update=()=>{
      record.workPaperPattern=pattern.value;record.workPaperColor=color.value;
      const preview=button.closest('.review-background-card')?.querySelector('.import-work-paper-preview');
      if(preview){
        preview.className='review-thumbnail import-work-paper-preview '+pattern.value;
        preview.style.setProperty('--review-paper',color.value);
        preview.style.backgroundColor=color.value;
      }
    };
    pattern.onchange=update;color.oninput=update;
    body.querySelector('#review-background-done').onclick=()=>modal.close();
    modal.showModal();
  });
  const removeWhite=view.querySelector('#remove-white');if(removeWhite)removeWhite.onchange=()=>{state.importRemoveWhite=removeWhite.checked;};
  const page=view.querySelector('#canvas-page');if(page)initializeCanvasSurface(page);
  bindInspector();if(state.route==='import'&&state.importStep==='inspect')syncBusyControls(view,'.inspect-columns button,.inspect-columns input,.inspect-columns select',!!state.importProcessing);if(state.route==='import'&&state.importStep==='inspect'&&state.importFile&&!state.importProcessing&&!partial)view.paperCorrectionDispose=mountPaperCorrection({state,view,render,toast,saveActiveImportRecord});const offline=view.querySelector('#offline-state');if(offline)offline.textContent=navigator.serviceWorker?.controller?'离线程序已就绪':'首次打开时需要联网；请等待离线程序安装后再测试飞行模式';const locationLabel=view.querySelector('#storage-location');if(locationLabel)db.storageMode().then(mode=>{if(locationLabel.isConnected)locationLabel.textContent=cloudEnabled?(import.meta.env?.VITE_SHIYE_OBJECT_STORAGE==='cos'?'当前数据源：Supabase 登录与元数据 + 腾讯 COS 私有图片；本机仅保留账号隔离缓存与待同步修改':'当前数据源：Supabase 私有云端；本机仅保留账号隔离缓存与待同步修改'):mode==='server'?`当前唯一数据源：${db.storageConfig()?.url||location.origin}（服务器）`:'当前数据源：此浏览器 IndexedDB';}).catch(error=>{if(locationLabel.isConnected)locationLabel.textContent='服务器连接失败：'+error.message;});}
function bindInspector(){const d=current(),e=d&&editorEntry(d).find(x=>x.value.id===state.selected);if(!d)return;
  const change=(id,fn)=>{const el=view.querySelector('#'+id);if(el)el.addEventListener('change',()=>{checkpoint();fn(el.value);saveProject();render();});};
  if(e){for(const [id,key] of [['inspector-width','width'],['inspector-height','height'],['inspector-rotation','rotation'],['inspector-z','zIndex'],['inspector-opacity','opacity'],['inspector-font-size','fontSize']].filter(([,key])=>e.kind!=='material'||!['width','height'].includes(key)))change(id,v=>{e.value[key]=Number(v);if(e.kind==='material')e.value.userOverrideFlags=[...new Set([...(e.value.userOverrideFlags||[]),key==='width'||key==='height'?'resized':key])];});change('inspector-text',v=>e.value.content=v);change('inspector-font',v=>e.value.style=v);}else{change('paper-color',v=>d.paperColor=v);change('paper-pattern',v=>d.paperPattern=v);change('page-ratio',v=>{if(presetPaperDimensions(v))setDraftPaperSize(d,v);});change('page-mode',v=>{d.pageMode=v;d.canvas=canvasSize(v,d.pageRatio);});}}
function checkpoint(){const d=current();if(!d)return;ensureEditorHistory(state);captureHistory(state.activeProject);checkpointEditorHistory(state,d);}
// Per-editor-draft source baselines let Scene v2 generate property-level
// patches on each committed user action without duplicating full drafts.
const sceneTrackBases=new Map();
const sceneTrackKey=p=>p?.id&&p.activeDraftID?p.id+':'+p.activeDraftID:null;
function markSceneTrackingBaseline(p){
  const key=sceneTrackKey(p),d=currentSceneDraft(p);
  if(key&&d&&!sceneTrackBases.has(key))sceneTrackBases.set(key,copySceneBaseline(d));
}
function trackEditedScene(p,at){
  const key=sceneTrackKey(p),d=currentSceneDraft(p);
  if(!key||!d)return;
  const previous=sceneTrackBases.get(key);
  if(previous&&previous.id===d.id)
    recordSceneOperation(p,previous,d,{actor:p.__cloudSessionId||state.accountId||'browser',at});
  sceneTrackBases.set(key,copySceneBaseline(d));
}
function snapshotEditedScene(reason){
  const p=state.route==='editor'?state.activeProject:null;
  if(!p||!p.sceneOperationsSinceSnapshot)return false;
  try{
    if(!makeAutoSceneSnapshot(p,{reason}))return false;
    saveSpecificProject(p);return true;
  }catch(error){console.warn('Scene 自动快照将于下次编辑补录',error?.message);return false;}
}
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
    for(const {snapshot,version} of batch){try{
      // A later edit or deletion supersedes this queued snapshot. In-flight
      // stages are serialized by the store before the deletion tombstone.
      if(saveVersions.get(snapshot.id)!==version)continue;
      await db.stageProject(snapshot);
    }catch(error){if(saveVersions.get(snapshot.id)===version&&!dirtyProjects.has(snapshot.id))dirtyProjects.set(snapshot.id,snapshot);failure??=error;}finally{savingProjects--;}}
    if(failure)throw failure;
  });
  try{await saveChain;if(!savingProjects&&!dirtyProjects.size&&!dirtyUsageAssets.size){syncDisplay.localPending=false;updateSyncIndicator();saveStatus(cloudEnabled?'修改已暂存 · 后台同步中':(await db.storageMode())==='server'?'已保存到服务器':'已保存到本机');}}catch(e){console.error(e);recordRuntimeIssue('handled',e,state.route,{phase:'save'});syncDisplay.error=e;updateSyncIndicator();saveStatus('暂存失败 · 修改仍在当前页面');toast('修改暂存失败，暂勿关闭页面：'+e.message);throw e;}
}
function saveSpecificProject(p){if(!p)return;delete p.isTemplate;if(cloudEnabled)p.__cloudSessionId||=crypto.randomUUID();
  // Edits invalidate the previous scene's remote snapshot. A new 720px cover
  // can be drawn locally immediately; COS receives the next uploaded version.
  const active=p.drafts?.find(d=>d.id===p.activeDraftID)||p.drafts?.[0];
  if(active&&!p.isSnapshot){delete active.coverImageID;delete active.coverSceneHash;}
  const now=new Date().toISOString();trackEditedScene(p,now);p.updatedAt=now;if(p.isUsed)for(const updated of markProjectAssetsUsed(p,state.assets,now)){const live=state.assets.find(asset=>asset.id===updated.id);if(live)Object.assign(live,updated);dirtyUsageAssets.set(updated.id,updated);}saveVersions.set(p.id,(saveVersions.get(p.id)||0)+1);dirtyProjects.set(p.id,p);saveStatus('后台保存中…');syncDisplay.localPending=true;updateSyncIndicator();if(!saveTimer)saveTimer=setTimeout(()=>flushSave().catch(console.error),500);}
function saveProject(){saveSpecificProject(state.activeProject);}
const pendingTrashStages=new Map();
async function awaitTrashStages(ids){await Promise.all(ids.map(id=>pendingTrashStages.get(id)).filter(Boolean));}
async function moveProjectsToTrash(ids){
  const selected=new Set(ids),projects=state.projects.filter(p=>selected.has(p.id));
  if(!projects.length)return 0;
  const entries=projects.map(item=>({id:uid(),kind:'project',item:structuredClone(item),date:new Date().toISOString()}));
  for(const project of projects){dirtyProjects.delete(project.id);saveVersions.set(project.id,(saveVersions.get(project.id)||0)+1);}
  if(!dirtyProjects.size&&!dirtyUsageAssets.size){clearTimeout(saveTimer);saveTimer=null;}
  state.projects=state.projects.filter(p=>!selected.has(p.id));state.trash.push(...entries);
  if(selected.has(state.previewProjectID)){state.previewProjectID=null;route('works');}
  else render();
  const staged=(async()=>{
    // The latest scene is in each trash entry. The store serializes an
    // already-started local save before this tombstone; queued stale saves
    // are invalidated by saveVersions above. Neither path waits for upload.
    await db.transaction(['projects','trash'],tx=>{for(const entry of entries){tx.objectStore('projects').delete(entry.item.id);tx.objectStore('trash').put(entry);}});
  })();
  for(const entry of entries)pendingTrashStages.set(entry.id,staged);
  try{
    await staged;
    toast('已移到最近删除 · 云端后台同步中');
    return entries.length;
  }catch(error){
    const entryIDs=new Set(entries.map(entry=>entry.id));
    state.trash=state.trash.filter(entry=>!entryIDs.has(entry.id));
    for(const project of projects)if(!state.projects.some(row=>row.id===project.id)){
      state.projects.push(project);
      dirtyProjects.set(project.id,project);
    }
    if(dirtyProjects.size&&!saveTimer)saveTimer=setTimeout(()=>flushSave().catch(console.error),500);
    render();toast('删除未能安全暂存，作品已恢复：'+(error?.message||error));
    throw error;
  }finally{for(const entry of entries)if(pendingTrashStages.get(entry.id)===staged)pendingTrashStages.delete(entry.id);}
}
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

function handle(action,id,value){
  return actionStore.dispatch({type:'legacy/action',payload:{action,id,value}});
}
async function legacyHandle(action,id,value){try{switch(action){
  case 'backup-legacy-projects':{
    const backup=await db.exportLegacyProjectBackup();
    if(!(backup instanceof Blob)||!backup.size)throw Error('旧版作品备份为空');
    download(backup,'拾页旧版作品原始备份-'+new Date().toISOString().slice(0,10)+'.json');
    toast('旧版作品已导出；云端原件保持不变');
    break;
  }

  case 'import-work':openImportGallery('work');break;
  case 'import-snapshot':offlineSnapshotProject=null;openImportGallery('snapshot');break;
  case 'import':openImportGallery('material');break;case 'back-library':navigateBack('library');break;case 'back-works':case 'editor-done':{
    // The ink layer may have a short coalescing timer. Flush its committed
    // strokes BEFORE the explicit export/publish/exit transaction.
    view.flushInkCommit?.({renderUI:false,force:true});
    const p=state.activeProject;if(!p)throw Error('当前没有可保存的作品');
    if(p.__remoteDeleted){
      if(!confirm('这份作品已在其他设备删除。当前页面的修改不会自动恢复已删除作品。若要保留当前编辑，请先取消并导出可编辑 ZIP。确定退出到作品库吗？'))break;
      state.activeProject=null;state.activeDraft=null;
      parity.workTab='all';parity.selectionMode=null;parity.selected.clear();parity.showOnlySelected=false;
      route('works');
      break;
    }
    const decision=editorExitDecision(p,action),publish=decision.publish;
    // Viewing/closing an existing work must be read-only unless a user
    // action changed its data. Real edits have already called saveProject().
    view.endTextEditing?.();
    if(action==='editor-done'){
      // Publishing is explicit; Back must not normalize legacy draft flags or
      // change timestamps merely because a user inspected an existing work.
      p.isDraft=decision.isDraft;
      makeAutoSceneSnapshot(p,{reason:'completed',force:true});
      saveProject();
    }
    await flushSave();
    if(publish)saveAISnapshotInBackground(p);
    if(state.offlineEditingReturnID===p.id){
      await matchingSession.reflectProject(p);
      state.offlineEditingReturnID=null;
    }
    parity.workTab=decision.tab;
    parity.selectionMode=null;parity.selected.clear();parity.showOnlySelected=false;
    resetCatalogPage('works');
    state.activeProject=null;state.activeDraft=null;
    route('works');
    break;
  }
  case 'select-file':if(value==='files'&&state.importMode==='work'){workFileInput.click();break;}if(value==='camera')fileInput.setAttribute('capture','environment');else fileInput.removeAttribute('capture');fileInput.click();break;case 'preview-crop':await previewCorrection();break;case 'confirm-import':await saveImportBatch({state,db,urls,render,onSaved:organizeSavedAssets});break;
  case 'import-switch':await switchImportRecord(Number(id));break;case 'import-back':if(state.importStep==='review'){state.importStep='inspect';render();}else if(state.importStep==='done'){navigateBack(state.importMode==='work'?'works':'library');}else if(!state.importRecords.length||confirm('放弃未保存的照片？'))navigateBack(state.importMode==='work'?'works':'library');break;
  case 'import-exit':if(state.importStep==='done'||!state.importRecords.length||confirm('放弃未保存的照片？'))navigateBack(state.importMode==='work'?'works':'library');break;
  case 'import-continue':if(state.importStep==='done'){resetImportBatch();render();}break;
  case 'manual-import-box':await openManualImportBox();break;case 'readjust-paper':state.showCorrectionPreview=false;discardPaperPreview();render();break;case 'apply-paper-preview':await applyPaperPreview();break;
  case 'rotate-photo':await rotateImportPhoto();break;
  case 'import-toggle-candidate':await actionStore.dispatch({type:'import/candidate/toggle',payload:{index:Number(id)}});break;
  case 'import-confirm-photo':await confirmImportPhoto();break;
  case 'review-toggle':await actionStore.dispatch({type:'import/review/toggle',payload:{record:Number(id),index:Number(value)}});break;
  case 'choose-candidate':await chooseCandidate(Number(id));break;
  case 'detail':openLibraryAsset(id);break;case 'detail-back':libraryBack();break;case 'detail-add':
    if((asset(state.detailAssetID)?.supply?.quantity??1)===0)throw Error('素材可用库存为 0');
    addMatchingFromLibrary(state,[state.detailAssetID]);
    void matchingSession.persist().catch(console.warn);
    document.querySelector('#basket-count').textContent=state.basket.length;
    toast('已加入本次创作');break;case 'detail-match':if((asset(state.detailAssetID)?.supply?.quantity??1)===0)throw Error('素材可用库存为 0');addMatchingFromLibrary(state,[state.detailAssetID]);route('matching');break;case 'detail-series':libraryHistory.push({route:state.route,seriesID:state.seriesID,detailAssetID:state.detailAssetID});state.seriesID=asset(state.detailAssetID)?.seriesID||'all';route('library');break;case 'detail-similar':view.dispatchEvent(new CustomEvent('show-similar'));break;case 'detail-edit':openDetail(state.detailAssetID);break;case 'detail-check':await openCutoutCheck(state.detailAssetID);break;case 'detail-favorite':await actionStore.dispatch({type:'library/favorite',payload:{id:state.detailAssetID}});break;
  case 'new-series':openSeriesEditor();break;case 'series-detail':libraryHistory.push({route:state.route,seriesID:state.seriesID,detailAssetID:state.detailAssetID});state.seriesID=id;route('library');break;
  case 'match-library':route('library');break;case 'match-context':{const scope=matchingScope();toast(`必须 ${scope.required.length} · 优先 ${scope.preferred.length} · 可用 ${scope.available.length} · 不使用 ${scope.excluded.length}`);break;}
  case 'match-filter':await actionStore.dispatch({type:'matching/filter',payload:{value}});break;
  case 'match-skip':await actionStore.dispatch({type:'matching/exclude',payload:{id}});break;
  case 'match-allow':await actionStore.dispatch({type:'matching/include',payload:{id}});break;
  case 'match-core':await actionStore.dispatch({type:'matching/priority',payload:{id}});break;
  case 'match-use':openMaterialUse(id);break;
  case 'match-generate':state.matchPurpose=view.querySelector('#match-purpose')?.value||'日常记录';state.matchProcessing=view.querySelector('#match-processing')?.value||'保留完整';state.matchStyle=view.querySelector('#match-style')?.value||state.matchStyle;state.matchIntent=view.querySelector('#match-intent')?.value||'';captureMatchContent();state.matchMode=view.querySelector('#match-mode')?.value||'single';state.matchRatio=readMatchPaper();state.matchStyles=readMatchSelection('match-style',state.matchStyle);state.matchPurposes=readMatchSelection('match-purpose',state.matchPurpose);queueMatchingDefaultsSync();await matchingSession.generate();break;
  case 'match-export-gpt':await exportOfflineCreation();break;
  case 'match-import-gpt':openOfflineImportDialog();break;
  case 'basket':await actionStore.dispatch({type:'matching/basket',payload:{id}});break;
  case 'reset-match':if(!confirm('重新搭配？已有保存作品不会被删除。'))break;await matchingSession.reset(()=>{state.matchCore=null;state.basket=[];state.coreIDs=[];state.excludedAssetIDs=[];});render();break;
  case 'create-from-basket':openManualCreationDialog();break;
  case 'new-project':{
    body.innerHTML='<div class="dialog-head"><h2>空白创作</h2><button class="btn" id="blank-create-cancel">取消</button></div>'+
      '<div class="stack"><label>页面数<select id="blank-page-count"><option value="single">单页</option><option value="spread">双页</option></select></label>'+
      '<label>纸张尺寸<select id="blank-paper-size">'+paperSizeOptions(state.preferences.paperSize||'a4',{includeNone:false})+'</select></label>'+
      '<div class="import-custom-size" id="blank-custom-size" hidden><label>宽（mm）<input type="number" id="blank-custom-width" min="50" max="1000" value="210"></label><label>高（mm）<input type="number" id="blank-custom-height" min="50" max="1000" value="297"></label></div>'+
      '<button class="btn primary" id="blank-create-confirm">开始创作</button></div>';
    const sizeSelect=body.querySelector('#blank-paper-size'),custom=body.querySelector('#blank-custom-size');
    sizeSelect.onchange=()=>custom.hidden=sizeSelect.value!=='custom';
    body.querySelector('#blank-create-cancel').onclick=()=>modal.close();
    body.querySelector('#blank-create-confirm').onclick=async()=>{
      let ratio=sizeSelect.value;
      if(ratio==='custom'){
        const w=Number(body.querySelector('#blank-custom-width').value),h=Number(body.querySelector('#blank-custom-height').value);
        if(!Number.isInteger(w)||!Number.isInteger(h)||w<50||h<50||w>1000||h>1000){toast('纸张尺寸为 50–1000 mm 的整数');return;}
        ratio='custom:'+w+'x'+h;
      }
      const mode=body.querySelector('#blank-page-count').value;
      const opening=++editorOpenSequence;await flushSave();if(opening!==editorOpenSequence)return;
      const p=project('未命名手账',{mode,ratio});
      state.projects.push(p);state.activeProject=p;state.activeDraft=p.activeDraftID;
      resetEditorHistory(state);state.tool=state.toolHighlight='select';state.zoom=1;
      // Persist the newly created blank document immediately, not only after
      // the first drawing gesture. Returning without drawing still yields a draft.
      saveProject();await flushSave();
      modal.close();route('editor');
    };
    modal.showModal();break;
  }
  case 'open-project':{const opening=++editorOpenSequence;await flushSave();if(opening!==editorOpenSequence)break;let p=state.projects.find(p=>p.id===id);if(!p)break;if(p.isSnapshot){state.previewProjectID=p.id;route('projectPreview');break;}if(p.projectDocumentPath){toast('正在读取完整作品…');p=await db.get('projects',p.id);if(opening!==editorOpenSequence)break;if(!p)throw Error('作品完整数据尚未载入');state.projects=state.projects.map(old=>old.id===p.id?p:old);}state.activeProject=p;state.activeDraft=p.activeDraftID;state.offlineEditingReturnID=null;resetEditorHistory(state);state.tool=state.toolHighlight='select';state.zoom=state.canvasViewports?.get(p.id+':'+state.activeDraft)?.scale||1;route('editor');break;}
  case 'preview-back':navigateBack('works');break;case 'preview-continue':{await handle('open-project',state.previewProjectID);break;}
  case 'project-meta':openProjectMetadata();break;
  case 'save-snapshot':await saveProjectSnapshot(state.activeProject);break;
  case 'download-snapshot':{const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p?.isSnapshot)break;const id=p.snapshotDocumentBlobId||p.snapshotBlobId,blob=(await db.get('blobs',id))?.data;if(!blob)throw Error('快照文件尚未同步，稍后重试');const ext=p.snapshotFormat==='application/pdf'?'pdf':p.snapshotFormat==='image/jpeg'?'jpg':p.snapshotFormat==='image/webp'?'webp':'png';download(blob,p.title+'.'+ext);break;}
  case 'export-scene-json':{const p=state.activeProject;if(!p||p.isSnapshot)throw Error('请选择可编辑作品');download(new Blob([JSON.stringify(exportSceneDocument(p))],{type:'application/json'}),p.title+'.shiye-scene.json');break;}
   case 'download-project-zip':{const source=state.projects.find(x=>x.id===id)||state.activeProject;if(!source||source.isSnapshot)throw Error('可编辑作品不存在');const p=source.projectDocumentPath?await db.completeProject(source):source;const {createNativeProjectPackage}=await import('./native-project-package.js');download(createNativeProjectPackage(p),p.title+'.shiyeproject.zip');break;}
  case 'project-delete':{const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p||!confirm('将这份作品移到最近删除？'))break;await moveProjectsToTrash([p.id]);break;}
  case 'works-filter':await actionStore.dispatch({type:'works/filter',payload:{value}});break;case 'tool':state.tool=value;if(value==='text'){checkpoint();const d=current();const t=textBlock('在这里写下今天的故事',d);d.textBlocks.push(t);state.selected=t.id;state.tool='select';saveProject();}else if(value==='shape'){checkpoint();const d=current();const s=primitive('roundedRectangle',d);d.primitives.push(s);state.selected=s.id;state.tool='select';saveProject();}else if(value==='material'){openMaterialPicker();return;}render();break;
  case 'zoom-in':await actionStore.dispatch({type:'editor/zoom',payload:{delta:.15}});break;case 'zoom-out':await actionStore.dispatch({type:'editor/zoom',payload:{delta:-.15}});break;
  case 'paper-menu':state.editorPanel=!state.editorPanel;state.selected=null;render();break;case 'undo':await actionStore.dispatch({type:'editor/undo'});break;case 'redo':await actionStore.dispatch({type:'editor/redo'});break;
  case 'new-draft':{checkpoint();const d=structuredClone(current());d.id=uid();d.title='方案 '+(state.activeProject.drafts.length+1);state.activeProject.drafts.push(d);state.activeProject.activeDraftID=d.id;state.activeDraft=d.id;resetEditorHistory(state);saveProject();render();break;}
  case 'duplicate':editSelected((e,d)=>{
      if(!e)throw Error('没有选中可复制的图层');
      const copy={...structuredClone(e.value),id:uid(),x:e.value.x+25,y:e.value.y+25};
      if(e.kind==='material'){
        const a=asset(e.value.assetID);if(!a)throw Error('原素材不存在');
        const used=new Set(d.items.filter(item=>item.assetID===a.id).map(item=>item.materialUnitIndex??0));
        const count=a.supply?.quantity??1;
        const free=Array.from({length:Math.min(1000,count)},(_,i)=>i).find(i=>!used.has(i));
        const roll=a.kind==='tape'&&a.supply?.kind==='tapeRoll'&&a.tapeRepeatMode==='repeatablePattern';
        if(free===undefined&&!roll)throw Error('实物库存不足，不能复制同一贴纸');
        copy.materialUnitIndex=free??0;
        const trial=attachSceneV2(structuredClone(d));trial.items.push(structuredClone(copy));
        validateScenePhysical(trial,state.assets);
        d.items.push(copy);
      }else(e.kind==='shape'?d.primitives:d.textBlocks).push(copy);
    });break;
   case 'flip':editSelected(e=>{e.value.isFlippedHorizontally=!e.value.isFlippedHorizontally;});break;
  case 'front':editSelected((e,d)=>{const parent=e.parents?.at(-1);moveSceneNode(d,e.value.id,{parentID:parent?.id||null});});break;
  case 'delete-object':editSelected((e,d)=>{const key=e.kind==='material'?'items':e.kind==='shape'?'primitives':'textBlocks';if(e.kind==='material'&&retireSplitPiece(d,state.selected)){state.selected=null;return;}d[key]=d[key].filter(x=>x.id!==state.selected);state.selected=null;});break;
  case 'restore-baseline':editSelected(e=>{const b=e.value.generationBaseline;if(b){Object.assign(e.value,structuredClone(b));e.value.userOverrideFlags=[];}});break;
  case 'park':editSelected(e=>{if(e.kind==='material'){e.value.isParked=true;state.selected=null;}});break;
  case 'unpark':editSelected((e,d)=>{const item=d.items.find(x=>x.id===id);if(item)item.isParked=false;});break;
  case 'save-work':{const p=state.activeProject,offline=state.offlineEditingReturnID===p?.id;p.isDraft=false;saveProject();await flushSave();saveAISnapshotInBackground(p);if(offline){await matchingSession.reflectProject(p);state.offlineEditingReturnID=null;navigateBack('matching');}toast(cloudEnabled?'作品已暂存，正在后台同步':'作品已保存');break;}
  case 'match-open-result':await matchingSession.open(id);break;
  case 'match-restore':{const restored=await matchingSession.restoreDeleted(id);if(restored)toast('作品已按你的选择恢复');break;}
  case 'match-stop':matchingSession.stop();break;
  case 'save-archive':{const p=state.activeProject;saveManualArchive(p);saveProject();render();toast('手动存档已保存');break;}
  case 'restore-archive':{const p=state.activeProject,a=p.manualArchives.find(x=>x.id===id);if(!a||!confirm('恢复此存档会替换当前编辑状态，确定吗？'))break;const restored=restoreManualArchive(p,id);p.drafts=restored.drafts;p.activeDraftID=restored.activeDraftID;state.activeDraft=restored.activeDraftID;resetEditorHistory(state);saveProject();render();break;}
  case 'export-png':await exportPNG();break;case 'print':await printPage();break;
  case 'creative-json':openCreativeJSON();break;
  case 'recognition-diagnostics':{
    const rec=state.importRecords[state.importIndex],trace=rec?.recognitionDiagnostic;
    if(!trace)throw Error('请先完成当前照片的识别');
    const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    const inputSHA256=await hash(await rec.file.arrayBuffer());
    const sourceSHA256=await hash(sourcePixels(state.importBitmap));
    const correctedSHA256=rec.correctedBitmap?await hash(sourcePixels(rec.correctedBitmap)):null;
    const maskSHA256=await Promise.all((state.importCandidateData||[]).map(async item=>item.region?.mask?.alpha?await hash(item.region.mask.alpha):null));
    const report={format:'shiye-recognition-box-diagnostics',version:3,
      pipeline:'pinned-jpeg-js-opencv-package-area-v1',inputSHA256,sourceSHA256,correctedSHA256,maskSHA256,
      recognitionSettings:{method:state.importRecognition||state.preferences.recognition,pixels:state.preferences.recognitionPixels,
        preprocess:recognitionPreprocessOptions(),postprocess:recognitionPostprocessOptions()},
      originalPixelSize:[state.importBitmap?.width,state.importBitmap?.height],
      autoPaperCorners:rec.autoPaperCorners||null,paperCorners:rec.corners||null,
      appliedPaperCorners:rec.appliedCorners?JSON.parse(rec.appliedCorners):null,
      correctedPixelSize:rec.correctedBitmap?[rec.correctedBitmap.width,rec.correctedBitmap.height]:null,
      paperOrientation:rec.paperOrientation||'auto',paperSize:rec.paperSize||'a4',
      ...trace,visibleCount:rec.candidates?.length||0,
      candidateMaskAudit:(state.importCandidateData||[]).map(item=>({
        segmentationMethod:item.region?.segmentationMethod||null,
        boundaryConfidence:Number.isFinite(item.region?.boundaryConfidence)?item.region.boundaryConfidence:null,
        needsBoundaryReview:item.region?.needsBoundaryReview===true,
        alternative:item.region?.boundaryAlternative||null,
        perimeterPolicy:item.region?.perimeterPolicy||null,
        shapeGuard:item.region?.shapeGuard||null,
        postprocessDeletedInterior:item.region?.postprocessDeletedInterior??null,
        segmentationROIExtraMM:item.region?.segmentationROIExtraMM??null,
        maskPixels:item.region?.pixels??null,
        perimeterEvidence:item.region?.perimeterEvidence||null,
        box:[item.region?.x,item.region?.y,item.region?.w,item.region?.h]
      }))};
    download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),
      '拾页素材框诊断.json');
    toast('已导出不含照片的素材框诊断');break;
  }
  case 'reset-all-account-data':{
    if(!cloudEnabled)throw Error('彻底清空仅适用于云端账号');
    if(resetWorkflowActive){toast('账号清理已经提交，请勿重复操作');break;}
    if(!confirm('将永久删除本账号所有作品、素材、草稿和历史待同步内容。其他设备登录后也会清理旧 IndexedDB。继续？'))break;
    if(prompt('不可撤销。请输入「清空所有数据」确认')!=='清空所有数据')break;
    resetWorkflowActive=true;
    cloudResumer.suspend();
    const progress=document.createElement('div');
    progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
    progress.style.cssText='position:fixed;inset:0;background:rgba(12,16,24,.85);display:grid;place-items:center;z-index:2147483647;padding:24px;color:#fff';
    progress.innerHTML='<div style="max-width:480px;background:#222a36;border-radius:16px;padding:28px"><h2>正在重置账号</h2><p data-phase>正在暂停旧数据写入…</p><small>云端索引清空后即可进入新账户；旧 COS 图片由服务器独立清理。</small></div>';
    if(modal.open)modal.close();
    document.body.append(progress);
    const show=s=>{progress.querySelector('[data-phase]').textContent=s;saveStatus(s);};
    let accepted=false;
    try{
      clearTimeout(saveTimer);saveTimer=null;
      dirtyProjects.clear();dirtyUsageAssets.clear();
      const {data,error}=await cloudClient().auth.getSession();
      if(error||!data.session?.access_token)throw Error('请先登录');
      const headers={'Content-Type':'application/json',
        Authorization:'Bearer '+data.session.access_token};
      const request=async(mode,resetId)=>{
        const response=await fetch('/api/account-reset',{method:'POST',headers,cache:'no-store',
          body:JSON.stringify({mode,resetId,confirm:'RESET_MY_DATA'}),
          signal:AbortSignal.timeout(35000)});
        const result=await response.json();
        if(!response.ok)throw Error(result.error||'云端重置失败');
        return result;
      };
      await db.runExclusiveAccountReset(async()=>{
        await saveChain.catch(()=>{});
        show('正在清空云端作品和素材索引…');
        const probe=await request('probe');
        let resetId=probe.phase==='deleting'&&probe.resetId
          ?probe.resetId:crypto.randomUUID();
        const outcome=await request('start',resetId);
        resetId=outcome.resetId||resetId;
        if(!outcome.accepted||!outcome.databaseCleared)
          throw Error('云端未确认索引清理，请重试');
        accepted=true;
        // This is an opportunistic one-shot server trigger, NOT the worker
        // lifecycle. A daily authenticated Vercel Cron is the durable retry.
        void fetch('/api/account-gc',{method:'POST',headers,cache:'no-store',
          body:JSON.stringify({kick:true})}).catch(()=>{});
        show('云端索引已清空，正在删除本机旧缓存…');
        await db.purgeLocalAfterCloudReset();
      });
      const {eraseSiteAppData}=await import('./account-data-wipe.js');
      const wiped=await eraseSiteAppData({preserveAuthentication:true});
      if(wiped.errors.length)
        alert('云端业务数据已清空。本设备尚有未删除的缓存，请关闭其他拾页标签页后重新打开：'+wiped.errors.join('；'));
      show('账号已重置，旧图片交由服务端清理。正在进入空白账户…');
      location.reload();
    }catch(error){
      show(accepted?'云端资料已经清空，本地清理待重试：'+error.message
        :'重置暂未成功：'+error.message);
      throw error;
    }finally{
      resetWorkflowActive=false;
      if(!accepted)progress.remove();
    }
    break;
  }
  case 'dev-reset-cloud':{
    if(!cloudEnabled)throw Error('开发清理只支持已登录的云端测试账号');
    if(!confirm('彻底删除当前账号 COS 私有图片、云端素材、系列、作品、快照？操作不可撤销。'))break;
    if(prompt('请输入 RESET 确认清空当前账号测试数据')!=='RESET')break;
    cloudResumer.suspend();
    try{
      const {data,error}=await cloudClient().auth.getSession();
      if(error||!data.session?.access_token)throw Error('请先登录');
      const headers={'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token};
      const probe=await fetch('/api/dev-reset',{method:'POST',headers,
        body:JSON.stringify({confirm:'RESET_DEV_DATA',mode:'probe'})});
      const check=await probe.json();
      if(!probe.ok||!check.ready)throw Error(check.error||'当前预览环境尚未授权开发清理');
      if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}
      dirtyProjects.clear();dirtyUsageAssets.clear();
      await db.discardPendingSync();
      let deleted=0,complete=false;
      for(let page=0;page<300;page++){
        const response=await fetch('/api/dev-reset',{method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
          body:JSON.stringify({confirm:'RESET_DEV_DATA'})});
        const payload=await response.json();
        if(!response.ok)throw Error(payload.error||'开发数据清理失败');
        deleted+=payload.deleted||0;
        saveStatus('正在清理 COS · '+deleted+' 个文件');
        if(payload.reset){complete=true;break;}
        if(!payload.more)throw Error('清理结果不完整');
      }
      if(!complete)throw Error('本次清理达到安全上限，请重新运行');
      toast('已删除 '+deleted+' 个 COS 文件，云端记录已重置');
      location.reload();
    }catch(error){
      cloudResumer.resume();
      throw error;
    }
    break;
  }
  case 'backup':await backup();break;case 'restore':backupInput.click();break;case 'export-app-diagnostics':exportAppDiagnostics();break;case 'backup-emergency':{await flushSave();const blob=await db.createEmergencyBackup();download(blob,'拾页待同步应急包-'+new Date().toISOString().slice(0,10)+'.shiyerecovery');toast('应急包已导出，请妥善保存，包含私人图片和文字');break;}case 'restore-emergency':emergencyInput.click();break;
  case 'recover-pre-conflict':{
    const entries=await db.listPreConflictScenes();
    if(!entries.length){toast('本设备还没有检测到画布并发冲突');break;}
    body.innerHTML='<section class="stack"><h2>冲突前画布</h2><p>下面保留了服务器自动裁决前的原始双方版本。点击恢复会创建独立的新作品，不会覆盖现在的画布。</p><div id="pre-conflict-entries"></div><button type="button" class="btn" id="pre-conflict-close">关闭</button></section>';
    const host=body.querySelector('#pre-conflict-entries');
    for(const entry of entries){
      const row=document.createElement('div');row.className='rec-card';
      const title=document.createElement('span');title.textContent=entry.title+' · '+new Date(entry.at).toLocaleString();
      const btn=document.createElement('button');btn.className='btn mini';btn.textContent='恢复为新作品';
      btn.onclick=async()=>{
        if(!confirm('保留当前云端作品，另存此冲突前本机画布？'))return;
        btn.disabled=true;
        try{
          const result=await db.restorePreConflictScene(entry.key);
          modal.close();await refresh();toast('已恢复新作品：'+result.title);
        }catch(error){btn.disabled=false;toast('恢复失败：'+error.message);}
      };
      row.append(title,btn);host.append(row);
    }
    body.querySelector('#pre-conflict-close').onclick=()=>modal.close();
    modal.showModal();break;
  }
  case 'restore-trash':await restoreTrash(id);break;
  case 'storage-token':{const token=view.querySelector('#data-server-token')?.value.trim();if(!token)throw Error('请输入新的访问令牌');const old=db.storageConfig();db.setStorageConfig({url:location.origin,token});try{await db.storageMode();toast('令牌已更新');}catch(error){db.setStorageConfig(old);throw error;}break;}
  case 'storage-connect':{await flushSave();const old=db.storageConfig(),url=view.querySelector('#data-server-url')?.value.trim(),token=view.querySelector('#data-server-token')?.value.trim();if(!url)throw Error('请输入拾页数据服务地址');db.setStorageConfig({url,token});try{await db.storageMode();state.activeProject=null;state.basket=[];await refresh();toast('已连接服务器');}catch(error){db.setStorageConfig(old);throw error;}break;}
  case 'storage-browser':{if(state.selfHosted)throw Error('自托管网站不允许切换到浏览器资料');await flushSave();db.setStorageConfig(null);state.activeProject=null;state.basket=[];await refresh();toast('已切换为本浏览器资料');break;}
  case 'help':{const {showHelp}=await import('./help-ui.js');showHelp({body,modal});break;}case 'settings-open':captureSettings();await actionStore.dispatch({type:'settings/section',payload:{section:value}});break;case 'settings-back':if(state.settingsSection){captureSettings();await actionStore.dispatch({type:'settings/section',payload:{section:null}});}else route(settingsSession?.returnRoute||'series');break;case 'settings-save':{captureSettings();const cfg=state.aiSettings;if(!cfg.model.trim())throw Error('请输入模型 ID');const endpoint=new URL(cfg.endpoint);if(endpoint.protocol!=='https:')throw Error('API 地址必须使用 HTTPS');if(cfg.provider!=='custom'&&endpoint.host!==new URL(AI_PROVIDERS[cfg.provider].endpoint).host)throw Error('服务商与 API 地址不一致；自定义地址请选“自定义兼容接口”');const returnRoute=settingsSession?.returnRoute||'series';if(cloudEnabled){await db.transaction(['meta'],tx=>{tx.objectStore('meta').put(cloudPreferencesRecord(state.preferences));tx.objectStore('meta').put(cloudAISettingsRecord(cfg));});}state.aiSettings=saveAISettings(cfg);state.preferences=savePreferences(state.preferences);deferredSyncedPreferences=null;deferredSyncedAISettings=null;settingsSession=null;state.settingsSection=null;route(returnRoute);toast('设置已保存');break;}
}}catch(e){console.error(e);recordRuntimeIssue('handled',e,state.route,{phase:'action'});toast(e.message||'操作失败');}}
function editSelected(fn){const d=current(),e=editorEntry(d).find(x=>x.value.id===state.selected);if(!e&&state.selected)return;checkpoint();fn(e,d);saveProject();render();}
function historyStep(from,to){view.flushInkCommit?.({renderUI:false,force:true});view.endTextEditing?.();const d=current(),snapshot=takeEditorHistoryStep(state,from,to,d);if(!snapshot)return false;for(const key of Object.keys(d))delete d[key];Object.assign(d,snapshot);state.activeDraft=snapshot.id;saveProject();return true;}
function readMatchPaper(){const ratio=view.querySelector('#match-ratio')?.value||'a4';if(ratio!=='custom')return ratio;const w=Number(view.querySelector('#match-paper-width')?.value),h=Number(view.querySelector('#match-paper-height')?.value);if(!Number.isInteger(w)||!Number.isInteger(h)||w<50||h<50||w>1000||h>1000)throw Error('自定义纸张宽高需要是 50–1000 mm 的整数');state.customPaperWidth=w;state.customPaperHeight=h;return `custom:${w}x${h}`;}
function captureMatchContent(){state.matchContentPolicy=view.querySelector('#match-content-policy')?.value||state.matchContentPolicy||'documentary';state.matchTextPresentation=view.querySelector('#match-text-presentation')?.value||state.matchTextPresentation||'mixed';}
function openMaterialUse(id){const a=asset(id);if(!a)return;const others=state.basket.length>1;const choices=['由生成器选择','完整保留',...(others?['从另一件后露出']:[]),...(a.kind==='tape'&&others?['截段固定']:[]),...(['paper','photo','tape'].includes(a.kind)?['取一块真实区域',]:[]),'稍后手工剪图案'];const processing=['AI 自主加工','保留完整','少量裁剪','自由拆解'];body.innerHTML=`<h2>${esc(a.title)} · 用法</h2><p>每件素材可以单独选择用法与加工权限。</p><div class="stack"><label>用法<select id="material-use-choice">${choices.map(x=>`<option ${(state.materialUseHints[id]||'由生成器选择')===x?'selected':''}>${x}</option>`).join('')}</select></label><label>加工权限<select id="material-use-processing">${processing.map(x=>`<option ${(state.assetProcessing[id]||state.matchProcessing)===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="toggle-row">要求每个方案做到此用法 <input type="checkbox" id="material-use-required" ${state.materialUseRequired[id]?'checked':''}></label><div class="actions"><button class="btn primary" id="material-use-save">确定</button><button class="btn" id="material-use-cancel">取消</button></div></div>`;modal.showModal();body.querySelector('#material-use-cancel').onclick=()=>modal.close();body.querySelector('#material-use-save').onclick=()=>{const use=body.querySelector('#material-use-choice').value;state.materialUseHints[id]=use==='由生成器选择'?null:use;state.assetProcessing[id]=body.querySelector('#material-use-processing').value;state.materialUseRequired[id]=!!state.materialUseHints[id]&&use!=='稍后手工剪图案'&&body.querySelector('#material-use-required').checked;modal.close();updateMatchingRegions(['.match-basket-scroll','.basket>.muted','.match-action']);void matchingSession.persist();queueMatchingDefaultsSync();};}
function createMatchingProject(automatic=true){const scope=matchingScope();if(!scope.candidateAssetIDs.length||!automatic&&!state.basket.length)throw Error('请先选择素材');const p=project('新的手账',{mode:state.matchMode||'single',ratio:state.matchRatio||'a4',style:state.matchStyle||'韩系清新'}),d=p.drafts[0];d.items=automatic?[]:physicalPlacement(d,state.assets,state.basket.slice(0,8));p.candidateAssetIDs=automatic?scope.candidateAssetIDs:[...state.basket];p.materialPriority=automatic?scope:{...scope,available:[],candidateAssetIDs:[...state.basket]};p.purpose=state.matchPurpose;p.intent=state.matchIntent;p.contentPolicy=state.matchContentPolicy;p.textPresentation=state.matchTextPresentation||'mixed';p.userText='';p.providedFacts='';p.styles=readMatchSelection('match-style',state.matchStyle);p.purposes=readMatchSelection('match-purpose',state.matchPurpose);p.requiredAssetIDs=[...scope.required];p.processing=state.matchProcessing;p.materialUseHints=Object.fromEntries(state.basket.filter(id=>state.materialUseHints[id]).map(id=>[id,state.materialUseHints[id]]));p.materialUseRequired=Object.fromEntries(state.basket.filter(id=>state.materialUseRequired[id]).map(id=>[id,true]));p.assetProcessing=Object.fromEntries(state.basket.filter(id=>state.assetProcessing[id]).map(id=>[id,state.assetProcessing[id]]));return p;}
async function exportOfflineCreation(){
  if(!matchingScope().candidateAssetIDs.length){toast('请先选择素材');return;}
  state.matchPurpose=view.querySelector('#match-purpose')?.value||state.matchPurpose;state.matchProcessing=view.querySelector('#match-processing')?.value||state.matchProcessing;state.matchStyle=view.querySelector('#match-style')?.value||state.matchStyle;state.matchIntent=view.querySelector('#match-intent')?.value||'';captureMatchContent();state.matchMode=view.querySelector('#match-mode')?.value||state.matchMode;state.matchRatio=readMatchPaper();state.matchStyles=readMatchSelection('match-style',state.matchStyle);state.matchPurposes=readMatchSelection('match-purpose',state.matchPurpose);
  const button=view.querySelector('[data-act="match-export-gpt"]'),controller=new AbortController(),started=performance.now();
  const timing={},report={cacheHits:0,derived:0,original:0,materials:0,references:0};
  let storedBundle=null;
  if(button){button.disabled=true;button.textContent='正在准备 AI 参考…';}
  body.innerHTML='<section class="offline-handoff"><h2>准备网页版 AI 创作包</h2><p id="offline-export-progress" role="status" aria-live="polite">正在检查素材…</p><button type="button" class="btn" id="offline-export-cancel">取消导出</button></section>';
  if(!modal.open)modal.showModal();
  const canceled=()=>{if(controller.signal.aborted)throw controller.signal.reason||Error('已取消导出');};
  const onClose=()=>controller.abort(Error('已取消导出'));
  modal.addEventListener('close',onClose);
  const progress=text=>{const el=body.querySelector('#offline-export-progress');if(el)el.textContent=text;};
  body.querySelector('#offline-export-cancel').onclick=()=>{controller.abort(Error('已取消导出'));modal.close();};
  const measured=async(name,task)=>{const now=performance.now();try{return await task();}finally{timing[name]=Math.round(performance.now()-now);}};
  try{
    const p=createMatchingProject(),assetsSnapshot=structuredClone(state.assets),aliases=materialAliases(p.candidateAssetIDs),previews=[],referenceImages=[],cfg=structuredClone(state.aiSettings);
    const account=await offlineTaskAccount();canceled();
    const all=Object.entries(aliases);report.materials=all.length;
    // Fetch 600px COS derivatives instead of downloading full-resolution
    // originals for 512px GPT hints. Account/source-revision cache survives
    // repeat exports; originals stay unchanged and remain the fallback.
    const materialWork=measured('materials',()=>cfg.includeThumbnails
      ?mapOfflineExportLimited(all,3,async([alias,id])=>{
        const chosen=assetsSnapshot.find(item=>item.id===id);
        if(!chosen)throw Error('创作素材已变更，请重新导出任务包');
        const row=await prepareOfflineMaterialPreview({
          asset:chosen,account,signal:controller.signal,
          loadVariant:(asset,edge)=>db.previewBlob(asset.blobId,edge),
          loadOriginal:async asset=>(await db.get('blobs',asset.blobId))?.data||
            (asset.staticPath?await fetch(asset.staticPath).then(r=>r.blob()):null)
        });
        if(row.cacheHit)report.cacheHits++;
        else if(row.source==='variant')report.derived++;
        else report.original++;
        return {alias,bytes:row.bytes};
      },{signal:controller.signal,onDone:(done,total)=>progress('准备素材图片 '+done+'/'+total+' · 同时处理参考案例…')})
      :Promise.resolve([]));
    const referenceWork=measured('references',()=>cfg.sendPresetReferences
      ?loadJournalTemplateReferences({context:{accountId:account,styles:p.styles,purposes:p.purposes,materials:assetsSnapshot.filter(asset=>p.candidateAssetIDs.includes(asset.id))},userTemplates:state.userTemplates,db})
      :Promise.resolve({referenceImages:[]}));
    const [materialRows,referenceBundle]=await Promise.all([materialWork,referenceWork]);
    canceled();previews.push(...materialRows);referenceImages.push(...referenceBundle.referenceImages);report.references=referenceImages.length;
    progress('正在校验内容并生成 ZIP 文件…');
    const result=await measured('package',async()=>{const {createOfflineHandoff}=await import('./offline-creation.js');return createOfflineHandoff({project:p,assets:assetsSnapshot,aliases,previews,referenceImages,settings:cfg,userTemplates:state.userTemplates});});
    canceled();
    p.offlineBundleId=result.source.bundleId;
    progress('正在保存任务身份…');
    await measured('taskStore',()=>offlineTaskStore.save(account,result.source));
    storedBundle={account,id:result.source.bundleId};
    canceled();
    timing.total=Math.round(performance.now()-started);
    console.info('[shiye offline export timing]',{...timing,...report,packageBytes:result.packageBytes,imageBytes:result.imageBytes});
    const fileSize=n=>n<1024*1024?`${Math.ceil(n/1024)} KB`:`${(n/1024/1024).toFixed(1)} MB`;
    const imageDelivery=result.deliveryMode==='image';
    if(imageDelivery){
      body.innerHTML=`<section class="offline-handoff"><div class="offline-handoff-heading"><span class="offline-handoff-emblem">${iconMarkup('sparkles')}</span><div><small>网页版 AI · 画面创作</small><h2>把这一页交给 AI</h2></div></div><p class="offline-handoff-intro">${p.candidateAssetIDs.length} 件可用素材 · ${esc(p.styles?.join('、')||'所选风格')} · ${esc(p.drafts[0].pageRatio.toUpperCase())} · 任务包 ${fileSize(result.packageBytes)}（图片 ${fileSize(result.imageBytes)}）</p><div class="offline-handoff-delivery" role="group" aria-label="网页 GPT 返回形式"><button type="button" class="selected" data-offline-delivery="file" aria-pressed="true">作品文件</button><button type="button" disabled title="自由绘画需要 PNG 文件，不能复制为简短文本">复制文本（图片不可用）</button></div><div class="offline-handoff-step"><span class="offline-handoff-number">1</span><div><strong>复制要求并发送素材包</strong><small>这个 ZIP 是输入素材包，不是要求 AI 生成的文件。请让 AI 在回复中展示画面并提供可下载的 PNG。</small></div></div><textarea id="offline-gpt-prompt" readonly rows="3" aria-label="发送给网页版 AI 的短提示词">${esc(result.prompt)}</textarea><button type="button" class="btn primary offline-handoff-main" id="offline-copy-prompt">${iconMarkup('copy')}<span>复制并打开素材包</span></button><p id="offline-handoff-status" role="status">准备就绪 · ${esc(result.filename)}</p><div class="offline-handoff-alternatives"><button type="button" class="btn" id="offline-share-package">${iconMarkup('share')}<span>分享素材包</span></button><button type="button" class="btn" id="offline-download-package">${iconMarkup('fileDown')}<span>重新下载</span></button></div><div class="offline-handoff-step offline-handoff-return"><span class="offline-handoff-number">2</span><div><strong>将完成的画面导回拾页</strong><small>下载 AI 返回的 PNG、JPEG 或 WebP 图片，导入后保存为画面快照，并出现在版本方案中。</small></div></div><button type="button" class="btn" id="offline-import-file">${iconMarkup('fileUp')}<span>导入作品文件</span></button><p class="offline-handoff-footnote">浏览器无法替你选择 AI 会话，也无法自动删除系统下载的文件。</p></section>`;
    }else{
    body.innerHTML=`<section class="offline-handoff"><div class="offline-handoff-heading"><span class="offline-handoff-emblem">${iconMarkup('sparkles')}</span><div><small>网页版 GPT · 创作交接</small><h2>把这一页交给 GPT</h2></div></div><p class="offline-handoff-intro">${p.candidateAssetIDs.length} 件可用素材 · ${esc(p.styles?.join('、')||'所选风格')} · ${esc(p.drafts[0].pageRatio.toUpperCase())}${referenceImages.length?` · ${referenceImages.length} 张匹配案例`:''} · 任务包 ${fileSize(result.packageBytes)}（图片 ${fileSize(result.imageBytes)}）</p><div class="offline-handoff-delivery" role="group" aria-label="网页版 GPT 返回形式"><button type="button" class="selected" data-offline-delivery="file" aria-pressed="true">作品文件</button><button type="button" data-offline-delivery="text" aria-pressed="false">复制文本</button></div><div class="offline-handoff-step"><span class="offline-handoff-number">1</span><div><strong>复制创作要求并打开任务包</strong><small>复制成功后自动下载；在系统文件页分享给 ChatGPT，或在 ChatGPT 手动附加。</small></div></div><textarea id="offline-gpt-prompt" readonly rows="2" aria-label="发送给 ChatGPT 的短提示词">${esc(result.prompt)}</textarea><button type="button" class="btn primary offline-handoff-main" id="offline-copy-prompt">${iconMarkup('copy')}<span>复制并打开任务包</span></button><p id="offline-handoff-status" role="status">准备就绪 · ${esc(result.filename)}</p><div class="offline-handoff-alternatives"><button type="button" class="btn" id="offline-share-package">${iconMarkup('share')}<span>分享文件</span></button><button type="button" class="btn" id="offline-download-package">${iconMarkup('fileDown')}<span>重新下载</span></button></div><div class="offline-handoff-step offline-handoff-return"><span class="offline-handoff-number">2</span><div><strong>将 GPT 的结果导回拾页</strong><small>下载独立的 .shiyeproject.json 文件，也可以选择 PNG／JPEG／WebP 画面快照；ZIP 工程包仍兼容。复制文本只适用于可编辑 JSON。</small></div></div><div class="offline-handoff-alternatives"><button type="button" class="btn" id="offline-import-file">${iconMarkup('fileUp')}<span>选择结果文件</span></button><button type="button" class="btn" id="offline-show-paste">${iconMarkup('copy')}<span>粘贴 JSON</span></button></div><div class="offline-handoff-paste" hidden><textarea id="offline-gpt-result" rows="4" placeholder="粘贴完整 JSON 或单个代码块"></textarea><div class="offline-handoff-alternatives"><button type="button" class="btn" id="offline-paste-result">粘贴剪贴板</button><button type="button" class="btn primary" id="offline-import-text">验证并导入</button></div></div><p class="offline-handoff-footnote">临时对话需在 ChatGPT 内开启；浏览器无法替你选择 ChatGPT 的会话或自动删除系统下载文件。</p></section>`;
    }
    if(!imageDelivery){body.querySelector('.offline-handoff-return small').textContent='作品文件可直接使用 JSON，或者导入 PNG／JPEG／WebP 快照；现有 ZIP 也支持。复制文本应包含完整可编辑 JSON。';}
    body.querySelector('#offline-gpt-prompt').rows=3;
    const diagnostics='总耗时 '+timing.total+' ms · 素材 '+timing.materials+' ms · 参考图 '+timing.references+' ms · 打包 '+timing.package+' ms · 保存 '+timing.taskStore+' ms · 缓存命中 '+report.cacheHits+'/'+report.materials+' · COS 派生 '+report.derived+' · 原图回退 '+report.original;
    body.querySelector('.offline-handoff')?.insertAdjacentHTML('beforeend','<details class="offline-export-diagnostics"><summary>查看本次导出耗时</summary><p>'+esc(diagnostics)+'</p></details>');
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
    body.querySelector('#offline-import-file').onclick=()=>{offlineSnapshotProject=p;creationResultInput.click();};
  }catch(error){if(controller.signal.aborted&&storedBundle){try{await offlineTaskStore.remove(storedBundle.account,storedBundle.id);}catch(cleanupError){console.warn('已取消任务的本机身份清理失败',cleanupError);}}if(!controller.signal.aborted){console.error(error);toast('AI 参考导出失败：'+error.message);if(modal.open)modal.close();}}finally{modal.removeEventListener('close',onClose);if(button){button.disabled=false;button.textContent='导出给网页版 AI';}}
}
function openOfflineImportDialog(){
  body.innerHTML='<h2>导入网页版 GPT 作品</h2><p>可以直接选择 JSON 可编辑单文件、PNG／JPEG／WebP 图片快照，或原有 .shiyeproject.zip 工程包。JSON 必须匹配当前账号在本设备登记的原始创作任务。若提示未匹配，先点击「登记原始任务 ZIP」选择最初从拾页导出的 ZIP，再导入 AI 返回的 JSON；文件类型按内容识别。</p><textarea id="offline-gpt-result" rows="7" placeholder="粘贴完整可编辑 JSON，或仅包含 JSON 的一个代码块"></textarea><div class="actions"><button type="button" class="btn primary" id="offline-import-file">选择作品文件</button><button type="button" class="btn" id="offline-paste-result">粘贴剪贴板</button><button type="button" class="btn" id="offline-import-text">导入复制文本</button><button type="button" class="btn" id="offline-register-task">登记原始任务 ZIP</button></div><small>请选择同一次创作的原始任务包，不要选择 AI 返回的作品文件；重新登记不会清空当前粘贴的 JSON。</small>';
  modal.showModal();
  body.querySelector('#offline-paste-result').onclick=()=>pasteOfflineResult();
  body.querySelector('#offline-import-text').onclick=async()=>{try{await importOfflineText(body.querySelector('#offline-gpt-result').value);}catch(error){toast('导入失败：'+error.message);}};
  body.querySelector('#offline-import-file').onclick=()=>{offlineSnapshotProject=matchingScope().candidateAssetIDs.length?createMatchingProject():null;creationResultInput.click();};
  body.querySelector('#offline-register-task').onclick=()=>{registeringOriginalGPTTask=true;offlineSnapshotProject=null;creationResultInput.click();};
}
async function pasteOfflineResult(){try{body.querySelector('#offline-gpt-result').value=await navigator.clipboard.readText();toast('已粘贴 GPT 的可编辑数据');}catch{toast('无法读取剪贴板，请长按输入框粘贴');}}
async function importOfflineProject(p){await flushSave();p.aiGenerated=true;await matchingSession.importProject(p);state.activeProject=p;state.activeDraft=p.activeDraftID;resetEditorHistory(state);state.offlineEditingReturnID=p.id;state.tool='select';if(modal.open)modal.close();if(state.route!=='matching')route('matching');route('editor');toast(p.creationVerification?.preview==='mismatch'?'已保存可编辑草稿；外部预览或清单有差异，请核对画面':'已加入版本方案；可编辑数据已检查，预览与正文仍需复核');}
async function offlineTaskAccount(){return cloudEnabled?(await requireCloudUser()).id:'browser';}
async function trustedOfflineSource(source){if(!source?.bundleId)return null;const trusted=await offlineTaskStore.load(await offlineTaskAccount(),source.bundleId);if(!trusted&&source.taskBinding==='local-v1')throw Error('未找到此网页版 AI 任务的原始快照；请先在此设备导入原始创作任务 ZIP，再导入 AI 结果');return trusted;}
async function importOfflineText(text){const {inspectEditableSource,importEditableWork}=await import('./offline-creation.js');const trustedSource=await trustedOfflineSource(inspectEditableSource(text)?.source);return importOfflineProject(importEditableWork(text,state.assets,{trustedSource}));}
async function createFromBasket(templateID=null){
  await flushSave();
  const p=createMatchingProject(false),draft=p.drafts[0];
  let result=null;
  if(templateID)result=applyManualLayout(draft,state.assets,state.basket,templateID);
  else draft.items=[];
  await db.stageProject(p);
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
function openMaterialPicker(){body.innerHTML=`<h2>选择素材放入画布</h2><div class="mini-assets">${visibleMaterials(state.assets).map(a=>`<button type="button" class="mini-asset" data-pick="${a.id}">${imgTag(a)}<span>${esc(a.title)}</span></button>`).join('')}</div>`;modal.showModal();body.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const a=asset(b.dataset.pick),d=current();checkpoint();const i=itemFromAsset(a,d,d.canvas.width/2,d.canvas.height/2,20,false);d.items.push(i);state.selected=i.id;state.tool='select';modal.close();saveProject();render();});}
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
  catch(error){console.error(error);recordRuntimeIssue('handled',error,state.route,{phase:'ai'});state.aiProgress='图像生成失败：'+explainUserError(error,'图像创作');}
  finally{if(aiController===controller)aiController=null;state.aiBusy=false;if(state.route==='editor')render();}
  return;
 }
 if(!key){state.aiProgress='请先在设置 → AI 与创作保存所选服务的 API 密钥。';render();return;}if(!ids.length){state.aiProgress='请先在素材搭配中选择素材。';render();return;}
 let recorder;const projectID=targetProject.id,draftID=sourceDraft.id,controller=new AbortController();let commitTargetID=draftID,expectedDraft=structuredClone(sourceDraft),candidateCreated=false;
 const sourceVersions=new Map(ids.map(id=>[id,assetSourceRevision(findAsset(id))]));
 const assertRun=()=>{if(controller.signal.aborted||state.accountId!==accountID)throw Error('创作已停止或账号已切换');for(const [id,version] of sourceVersions){const current=state.assets.find(a=>a.id===id);if(!current||assetSourceRevision(current)!==version)throw Error('创作期间素材来源或标定已变化，已停止旧条件下的生成');}};
 checkpoint();aiController=controller;state.aiBusy=true;state.aiProgress='正在准备素材预览…';aiReport={date:new Date().toISOString(),model,parameters:{generationMode:cfg.generationMode,temperature:cfg.temperature,maxTokens:cfg.maxTokens,maxTurns:cfg.maxTurns,materialCount:ids.length},rounds:[],outcome:'started'};render();
 try{
  recorder=await createAIRecorder({db,model,key,accountId:state.accountId||'browser'});const aliases=materialAliases(ids),vision=cfg.includeThumbnails&&supportsVision(cfg);
  const images=vision?await prepareMaterialPreviews(ids,{findAsset,createImage:async(...args)=>{assertRun();return modelImage(...args);}}):[];assertRun();
  const p=sourceProject,referenceImages=[];
  if(cfg.sendPresetReferences&&supportsVision(cfg)){referenceImages.push(...(await loadJournalTemplateReferences({context:{styles:p.styles||[sourceDraft.style],purposes:p.purposes||[p.purpose||fallbackPurpose],materials:assetsSnapshot.filter(asset=>ids.includes(asset.id))},userTemplates:state.userTemplates,db})).referenceImages);}assertRun();
  const output=await runCreativeAgent({...cfg,draft:sourceDraft,assets:assetsSnapshot,aliases,styles:p.styles||[sourceDraft.style],pagePurposes:p.purposes||[p.purpose||fallbackPurpose],contentPolicy:p.contentPolicy||'documentary',textPresentation:p.textPresentation||'mixed',userText:p.userText||'',providedFacts:p.providedFacts||'',requiredAssetIDs:p.requiredAssetIDs||[],materialPriority:p.materialPriority,processing:p.processing,assetProcessing:p.assetProcessing||{},materialUseHints:p.materialUseHints||{},materialUseRequired:p.materialUseRequired||{},prompt,images,referenceImages,userTemplates:state.userTemplates,request:recorder.request,signal:controller.signal,
   onResponse:recorder.response,
   onProgress:progress=>{state.aiProgress='请求 '+progress.budget.totalRequests+'/'+progress.budget.limit+'（创作 '+progress.budget.creationRequests+'、格式修复 '+progress.budget.formatRepairRequests+'） · '+progress.phase+' · '+progress.seconds+' 秒 · 已接收 '+progress.received+' 字符';const el=view.querySelector('#ai-progress');if(el)el.textContent=state.aiProgress;},
   onScene:vision?async d=>{assertRun();return (await rasterize(d,.7)).toDataURL('image/jpeg',.8);}:undefined,
   onFinalScene:async d=>{assertRun();return (await rasterize(d,Math.min(1.5,2000/Math.max(d.canvas.width,d.canvas.height)))).toDataURL('image/jpeg',.8);},
   onInspection:vision?async data=>{const parts=[];for(const m of data?.materials||[]){assertRun();const a=findAsset(m.assetID);if(a){const url=await modelImage(a,m.cropRect);if(url)parts.push({type:'text',text:m.key+' 的当前局部预览'},{type:'image_url',image_url:{url}});}}return parts;}:undefined,
   onTurn:async({turn,results,draft,text,review})=>{assertRun();aiReport.rounds.push({turn,tools:results.map(x=>({name:x.name,ok:x.ok,detail:x.detail})),review});state.aiProgress='第 '+turn+' 轮\n'+results.map(x=>(x.ok?'✓':'×')+' '+x.name+'：'+x.detail).join('\n')+(text&&cfg.generationMode!=='direct'?'\n'+text:'');if(results.some(x=>x.ok&&x.name!=='inspect_materials')){const active=state.projects.find(item=>item.id===projectID);if(!active)throw Error('原创作作品已不存在；结果未覆盖其他作品');const committed=commitAIDraft(active,{targetDraftID:commitTargetID,expectedDraft,generatedDraft:draft,newDraftID:uid()});commitTargetID=committed.targetDraftID;expectedDraft=committed.expectedDraft;if(committed.candidate){candidateCreated=true;state.aiProgress+='\n检测到原稿已手动修改，AI 结果另存为候选方案。';}saveSpecificProject(active);await flushSave();}assertRun();await recorder.turn(turn,results,draft).catch(()=>{state.aiProgress+='\n诊断记录暂不可用；已提交的画布检查点不受影响。';});if(state.route==='editor')render();}
  });
  assertRun();const completed=state.projects.find(item=>item.id===projectID);if(!completed)throw Error('原创作作品已不存在；结果未覆盖其他作品');const finalized=commitAIDraft(completed,{targetDraftID:commitTargetID,expectedDraft,generatedDraft:output.draft,newDraftID:uid()});commitTargetID=finalized.targetDraftID;candidateCreated||=finalized.candidate;completed.aiGenerated=true;completed.deliveryMode=cfg.deliveryMode;saveSpecificProject(completed);await flushSave();if(['image','pdf'].includes(cfg.deliveryMode)){await saveProjectSnapshot({...completed,projectDocumentPath:null,activeDraftID:commitTargetID},{format:cfg.deliveryMode==='pdf'?'application/pdf':'image/png'});completed.aiSnapshotCreated=true;saveSpecificProject(completed);}
  aiReport.outcome='completed';aiReport.budget=output.budget;state.aiProgress+=candidateCreated?'\n结构已完成并另存 AI 候选；原稿手改未被覆盖。':'\n结构已完成，草稿已保存。';state.aiProgress+=output.draft.agentRun?.visualReview==='model-reviewed'?' GPT 已检查最终画面，仍可继续手改。':' 最终视觉请核对。';
 }catch(error){console.error(error);recordRuntimeIssue('handled',error,state.route,{phase:'ai'});aiReport.outcome=controller.signal.aborted?'stopped':'failed';aiReport.stopReason=error.code||aiReport.outcome;aiReport.budget=error.budget||null;aiReport.error=explainUserError(error,'创作');state.aiProgress+='\n'+aiReport.error+'。已保留成功的步骤。';}
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
 if(documentBlobId){const {pagePDF,canvasPDFPage}=await import('./pdf-export.js');const height=d.physicalPageHeightMM||297,width=height*d.canvas.width/d.canvas.height;data.push({id:documentBlobId,data:await pagePDF([await canvasPDFPage(canvas,width,height)])});}
 const snapshot=snapshotRecord({title:p.title,previewBlobId,documentBlobId,format,width:d.canvas.width,height:d.canvas.height,sourceProjectID:p.id});
 snapshot.styleTags=[...(p.styleTags||[])];snapshot.tags=[...(p.tags||[])];snapshot.purpose=p.purpose;
 await db.stageImport({projects:[snapshot],blobs:data});
 urls.set(previewBlobId,URL.createObjectURL(preview));state.projects.push(snapshot);
 if(alsoEditable){source.isDraft=false;saveProject();}
 toast(cloudEnabled?'快照已暂存，正在后台同步':'快照已保存');
 void organizeSavedProjects([structuredClone(snapshot)],{waitForSave:()=>db.flushProjects()});
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
async function restorePendingProjects(){const pending=await db.pendingProjects();
  const deleted=new Set(state.trash.filter(x=>x.kind==='project').map(x=>x.item?.id));
  for(const row of pending){if(deleted.has(row.record.id))continue;const index=state.projects.findIndex(p=>p.id===row.record.id);if(index<0)state.projects.push(row.record);else state.projects[index]=state.activeProject?.id===row.record.id?state.activeProject:row.record;}return pending.length;}
async function refresh({background=false,onlyChanged=false,skipCloudRefresh=false}={}){const sync=skipCloudRefresh?null:await db.refreshCloud();if(onlyChanged&&!sync?.changed)return;if(sync?.changed)privateImages.invalidate(sync.allBlobs?undefined:sync.blobIDs);const [assets,series,projects,trash,meta]=await Promise.all(['assets','series','projects','trash','meta'].map(db.all));Object.assign(state,{assets,series,projects,trash,userTemplates:journalTemplateRecords(meta)});
  // Authenticated account metadata synchronizes display and all AI settings,
  // including provider-specific keys. Never serialize credentials into task ZIPs.
  const syncedPreferences=cloudEnabled?cloudPreferencesFromMeta(meta):null;
  if(syncedPreferences){
    if(settingsSession)deferredSyncedPreferences=structuredClone(syncedPreferences);
    else{state.preferences=savePreferences(syncedPreferences);deferredSyncedPreferences=null;}
  }
  const syncedMatch=cloudEnabled?cloudMatchingSettingsFromMeta(meta):null;
  if(syncedMatch&&!matchingDefaultsPending&&!matchingDefaultsLocalEdited){
    cloudMatchingDefaults=syncedMatch;
    if(state.route!=='matching')applyMatchingDefaults(state,syncedMatch);
  }
  const syncedAI=cloudEnabled?cloudAISettingsFromMeta(meta):null;
  if(syncedAI){
    if(settingsSession)deferredSyncedAISettings=structuredClone(syncedAI);
    else{state.aiSettings=saveAISettings(syncedAI);deferredSyncedAISettings=null;}
  }
  await restorePendingProjects();
  if(cloudEnabled&&state.route==='editor'&&state.activeProject){
    const stillExists=state.projects.some(project=>project.id===state.activeProject.id);
    if(!stillExists&&!dirtyProjects.has(state.activeProject.id)&&savingProjects===0&&!state.activeProject.__remoteDeleted){
      state.activeProject.__remoteDeleted=true;
      toast('当前作品已在另一台设备删除。需要保留本机修改时，请先导出可编辑 ZIP。');
    }else if(stillExists&&state.activeProject.__remoteDeleted)delete state.activeProject.__remoteDeleted;
  }
  staticSources.clear();for(const a of state.assets)if(a.staticPath)staticSources.set(a.blobId,a.staticPath);if(reconcileSelectedRecords(parity,state))view.selectionRefresh?.();if(background){backgroundViewPending=true;scheduleBackgroundReconcile();}else actionStore.publish('collections/updated',{scope:'collections',keys:['assets','series','projects','trash','userTemplates']});}
let trashSweepActive=false;
async function purgeExpiredTrash(){if(trashSweepActive)return;const entries=expiredTrash(state.trash);if(!entries.length)return;trashSweepActive=true;try{await changeTrash({db,state,ids:entries.map(entry=>entry.id)});if(parity.libraryTab==='trash'||parity.workTab==='trash')render();}catch(error){console.warn('最近删除到期清理待重试',error?.name||error?.message);}finally{trashSweepActive=false;}}
setInterval(()=>void purgeExpiredTrash(),15*60*1000);
let hiddenSweepActive=false;
async function sweepHiddenAssets(){if(hiddenSweepActive||cloudEnabled||document.hidden||state.route==='editor'||state.route==='import')return;
  hiddenSweepActive=true;try{const removed=await pruneUnreferencedHiddenAssets({db,state});if(removed)actionStore.publish('collections/updated',{scope:'collections',keys:['assets']});}
  catch(error){recordRuntimeIssue('handled',error,state.route,{phase:'background'});}finally{hiddenSweepActive=false;}}
setInterval(()=>void sweepHiddenAssets(),24*60*60*1000);
setTimeout(()=>void sweepHiddenAssets(),60*1000);
async function refineCandidateFrame(candidateFrame,request,{postprocessOnly=false}={}){
  const bitmap=await decodeImageBlob(candidateFrame);
  try{
    const fw=bitmap.width,fh=bitmap.height,maxDim=Math.max(900,Math.min(1600,Number(request.pixels)||900)),
      ratio=Math.min(1,maxDim/Math.max(fw,fh)),aw=Math.max(1,Math.round(fw*ratio)),ah=Math.max(1,Math.round(fh*ratio)),
      canvas=document.createElement('canvas');canvas.width=aw;canvas.height=ah;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,aw,ah);
    const raw=ctx.getImageData(0,0,aw,ah),
      p=request.placement||{x:0,y:0,width:fw,height:fh},
      roughMask=new Uint8Array(request.mask),tw=Math.max(1,request.targetWidth),th=Math.max(1,request.targetHeight);
    // A user-edited rough mask is already defined in the original aligned
    // source coordinates. Without an independently detected physical contour,
    // a physical-only re-recognition must NEVER fill its bounding rectangle
    // (which would erase the user's fine alpha edits).
    if(!postprocessOnly&&request.method==='physical')
      return {mask:roughMask,method:'physical',edgeMethod:'manual-mask-preserved',
        shapeModel:null,apertureCount:0};
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
  // Native <dialog> stays in the top layer throughout loading and editing.
  // WebKit may render only a backdrop if close() and showModal() are called
  // in the same frame while transitioning from asset-detail settings.
  if(modal.open){
    modal.close();
    await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  // Bind the inspection scale to this material's original segmentation,
  // rather than a global setting the user may have changed after import.
  const importedPixels=(candidate?.processingRecord||a.processingRecord)?.recognitionPixels;
  const wantedPixels=importedPixels||state.preferences.recognitionPixels;
  const editPixels=[900,1200,1600].includes(Number(wantedPixels))
    ?Number(wantedPixels):900;
  body.innerHTML='<section role="status" aria-live="polite" class="cutout-loading"><strong>正在准备抠图编辑器…</strong><p>正在加载 '+editPixels+'px 候选框 RGB 与透明蒙版…</p><button type="button" class="btn" id="cutout-load-cancel">取消</button></section>';
  // Loading and editing use one native dialog and two explicit layout states.
  modal.classList.remove('cutout-dialog','material-editor-dialog');
  modal.classList.add('cutout-loading-dialog');
  if(!modal.open)modal.showModal();
  let cancelled=false;
  body.querySelector('#cutout-load-cancel').onclick=()=>{cancelled=true;modal.close();};
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(cancelled)return;
  try{
  const readTimeout=async promise=>Promise.race([
    promise,new Promise((_,reject)=>setTimeout(()=>
      reject(Error('素材读取超时，请检查 COS 图片和同步状态')),22000))
  ]);
  // Original COS photos stay untouched; the editor requests only a ~960px
  // server-derived candidate RGB (shrunk to 900px before decoding pixels).
  const stored=async blobId=>blobId?readTimeout(cloudEnabled
    ?db.previewBlob(blobId,editPixels)
    :db.get('blobs',blobId).then(row=>row?.data)):null;
  const loadMaskBlob=async blobId=>blobId?readTimeout(db.get('blobs',blobId).then(row=>row?.data)):null;
  const compact=!candidate&&!!a.candidateFrameBlobId
    &&(!!a.finalMaskBlobId||Math.abs(a.processingRecord?.displayRotationDegrees||0)<.01);
  const modern=compact&&!!a.finalMaskBlobId;
  // Dispatch all required Blob IDs in the same turn. The cloud store
  // batches simultaneous metadata lookups, rather than serializing 2–4 COS
  // reads before a blank editor can be rendered.
  let [saved,original,recognition,candidateFrame,storedMask]=await Promise.all([
    modern?Promise.resolve(null):Promise.resolve(candidate?.blob||stored(a.blobId)),
    compact?Promise.resolve(null):Promise.resolve(candidate?.originalBlob||stored(a.originalBlobId)),
    compact?Promise.resolve(null):Promise.resolve(candidate?.originalCutoutBlob||stored(a.originalCutoutBlobId)),
    Promise.resolve(candidate?.candidateFrameBlob||stored(a.candidateFrameBlobId)),
    modern?loadMaskBlob(a.finalMaskBlobId):Promise.resolve(null)
  ]);
  let finalMaskBlob=modern?storedMask:
    compact&&saved instanceof Blob?await extractAlphaMask(saved):null;
  if(!compact){
    if(!saved&&a.staticPath){const response=await fetch(a.staticPath);if(!response.ok)throw Error('素材图像未能加载，请重试');saved=await response.blob();}
    original||=saved;recognition||=saved;candidateFrame||=original;
    if(!(saved instanceof Blob)||saved.size<8)
      throw Error('原始抠图尚未从云端恢复，不能安全编辑。请在同步完成后重试');
    if(!(original instanceof Blob)||original.size<8)
      throw Error('候选框原始图片未保存完整；为防止颜色或边缘被覆盖，未打开手动抠图');
  }else if(!(candidateFrame instanceof Blob)||candidateFrame.size<8||
            !(finalMaskBlob instanceof Blob)||!finalMaskBlob.size)
    throw Error('候选框 RGB 或最终蒙版尚未完整同步，已保留旧素材，请检查同步后重试');
  if(cancelled||!modal.open)return;
  // Keep one native dialog in the top layer throughout the transition.
  // Closing it here and reopening inside showCutoutEditor can lose the
  // second showModal() on iOS Safari, leaving only the grey backdrop.
  const processing=candidate?.processingRecord||a.processingRecord||{},baseWidth=processing.sourceWidthMM||candidate?.width||a.physicalWidthMM,baseHeight=processing.sourceHeightMM||candidate?.height||a.physicalHeightMM,
    localMethods=recognitionMethodDetails,
    preferredMethod=localMethods.some(item=>item.id===(processing.rerecognition?.method||state.preferences.recognition))?(processing.rerecognition?.method||state.preferences.recognition):'auto';
  const openEditor=()=>cancelled?Promise.resolve():showCutoutEditor({
    body,modal,original,saved,recognition,candidateFrame,finalMaskBlob,title:a.title,processing,toast,
    editPixels,
    isCancelled:()=>cancelled,
    onPhase:message=>{const label=body.querySelector('.cutout-loading p');if(label)label.textContent=message;},
    onLoadInitialMask:compact?async()=>{
      const oldBlob=a.initialMaskBlobId?await loadMaskBlob(a.initialMaskBlobId):
        await stored(a.originalCutoutBlobId)||saved;
      if(!(oldBlob instanceof Blob))throw Error('初始蒙版尚未可用');
      return readAlphaMask(a.initialMaskBlobId?oldBlob:await extractAlphaMask(oldBlob));
    }:null,
    recognitionUI:{methods:localMethods,pixels:recognitionPixelOptions,method:preferredMethod,pixelsValue:editPixels,preprocess:recognitionPreprocessOptions(),postprocess:recognitionPostprocessOptions()},
    onRerecognize:request=>refineCandidateFrame(candidateFrame,request),
    onPostprocess:request=>refineCandidateFrame(candidateFrame,request,{postprocessOnly:true}),
    onApply:async(blob,record,originalRecognition,maskBlob)=>{
    const rad=record.displayRotationDegrees*Math.PI/180,width=baseWidth&&baseHeight?Math.abs(baseWidth*Math.cos(rad))+Math.abs(baseHeight*Math.sin(rad)):null,height=baseWidth&&baseHeight?Math.abs(baseHeight*Math.cos(rad))+Math.abs(baseWidth*Math.sin(rad)):null;
    const nextProcessing={...record,sourceWidthMM:baseWidth,sourceHeightMM:baseHeight};
    // Only on deliberate Apply fetch the original high-resolution candidate.
    // Opening the editor never downloads a large RGB PNG and never uploads
    // a high-resolution mask. The 900/1200/1600px alpha is mapped back here.
    const fullRGB=candidate
      ?candidate.candidateFrameBlob||candidate.originalBlob
      :await db.get('blobs',a.candidateFrameBlobId||a.originalBlobId||a.blobId).then(row=>row?.data);
    if(!(fullRGB instanceof Blob)||!fullRGB.size)
      throw Error('完整候选框原图尚未同步完成；未降低原始素材清晰度');
    const completePNG=await renderHighResolutionCutout(fullRGB,maskBlob,nextProcessing);
    blob=completePNG;
    if(candidate){
      candidate.originalCutoutBlob||=originalRecognition;candidate.candidateFrameBlob||=candidateFrame;candidate.processingRecord=nextProcessing;candidate.blob=blob;URL.revokeObjectURL(candidate.url);candidate.url=URL.createObjectURL(blob);if(width&&height){candidate.width=width;candidate.height=height;}
      for(const rec of state.importRecords){const index=rec.candidateData?.findIndex(c=>c===candidate||c.region===candidate.region);if(index>=0){Object.assign(rec.candidateData[index],candidate);rec.candidateURLs[index]=candidate.url;rec.manualEdits=true;if(state.importStep==='inspect')rec.confirmed=false;}}
      if(state.importRecords[state.importIndex]?.candidateData===state.importCandidateData)state.importCandidateURLs=state.importCandidateData.map(c=>c.url);
    }else{
      const frameId=a.candidateFrameBlobId||uid();
      // Existing imports can retain their original recognition PNG as a
      // lazy baseline. Never download it merely because the user pressed
      // Apply. Fresh imports already have an immutable initial mask.
      const baselineId=a.initialMaskBlobId||
        (a.originalCutoutBlobId?null:uid()),
        nextMaskId=a.finalMaskBlobId&&a.finalMaskBlobId!==baselineId?a.finalMaskBlobId:uid();
      const baselineBlob=baselineId&&!a.initialMaskBlobId
        ?finalMaskBlob||await extractAlphaMask(recognition||saved):null;
      const updated={...a,processingRecord:nextProcessing,
        physicalWidthMM:width||a.physicalWidthMM,physicalHeightMM:height||a.physicalHeightMM,
        candidateFrameBlobId:frameId,initialMaskBlobId:baselineId,finalMaskBlobId:nextMaskId,
        updatedAt:new Date().toISOString()};
      await db.transaction(['assets','blobs'],tx=>{
        tx.objectStore('assets').put(updated);
        tx.objectStore('blobs').put({id:a.blobId,data:blob});
        tx.objectStore('blobs').put({id:nextMaskId,data:maskBlob});
        if(baselineBlob)tx.objectStore('blobs').put({id:baselineId,data:baselineBlob});
        if(!a.candidateFrameBlobId)tx.objectStore('blobs').put({id:frameId,data:candidateFrame});
      });
      Object.assign(a,updated);if(urls.has(a.blobId))URL.revokeObjectURL(urls.get(a.blobId));urls.set(a.blobId,URL.createObjectURL(blob));
    }
    render();toast('素材外观已更新');
  }});
  try{
    await openEditor();
  }catch(error){
    // After an iOS restart, a local Blob may be present but corrupt while
    // the full original is still recoverable from the private COS/Supabase
    // object. Retry once with VERIFIED server bytes. Never modify metadata
    // or silently replace the user's already saved cutout.
    if(candidate||!cloudEnabled||!/检查抠图暂无法打开|不可解码|图片原始字节|蒙版.*尺寸/.test(error?.message||''))
      throw error;
    const recover=async(id,current)=>{
      if(!id)return current;
      const fresh=await db.reloadCloudBlob(id);
      return fresh?.data||current;
    };
    try{
      if(compact){
        [candidateFrame,finalMaskBlob]=await Promise.all([
          recover(a.candidateFrameBlobId,candidateFrame),
          modern?recover(a.finalMaskBlobId,finalMaskBlob):
            Promise.resolve(saved instanceof Blob?extractAlphaMask(saved):finalMaskBlob)
        ]);
      }else [saved,original,recognition,candidateFrame]=await Promise.all([
        recover(a.blobId,saved),recover(a.originalBlobId,original),
        recover(a.originalCutoutBlobId,recognition),
        recover(a.candidateFrameBlobId,candidateFrame)
      ]);
      await openEditor();
    }catch(retryError){
      throw Error('重新从云端读取素材原图后仍无法检查抠图：'+
        (retryError?.message||'图片数据损坏')+
        '。当前已保存素材不受影响；请检查同步详情。');
    }
  }
  }catch(error){
    if(!cancelled&&modal.open){
      // Keep the error in a VISIBLE dialog. A toast behind an open modal
      // appears to iPhone users as an endless dark overlay with no page.
      modal.classList.remove('cutout-dialog','material-editor-dialog');
      modal.classList.add('cutout-loading-dialog');
      const panel=document.createElement('section');
      panel.className='cutout-loading';
      panel.setAttribute('role','alert');
      const title=document.createElement('strong');
      title.textContent='检查抠图未能打开';
      const detail=document.createElement('p');
      detail.textContent=error?.message||'候选框图片读取失败，请检查同步状态';
      const close=document.createElement('button');
      close.type='button';close.className='btn';
      close.textContent='关闭';close.onclick=()=>modal.close();
      panel.append(title,detail,close);body.replaceChildren(panel);
      console.warn('打开素材抠图失败',error);
    }else if(!cancelled)throw error;
  }
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
async function restoreTrash(id){if(!await changeTrash({db,state,ids:[id],recover:true,awaitStage:awaitTrashStages}))return;render();toast('已恢复');}
function saveActiveImportRecord(){
  const rec=state.importRecords[state.importIndex];if(!rec)return;
  Object.assign(rec,{bitmap:state.importBitmap,file:state.importFile,url:state.importURL,box:structuredClone(state.importBox),corners:state.paperCorners?structuredClone(state.paperCorners):null,correctedBitmap:state.correctedBitmap,correctedURL:state.correctedURL,candidates:state.importCandidates||[],candidateURLs:state.importCandidateURLs||[],candidateData:state.importCandidateData||[],selection:[...(state.importCandidateSelection||[])],wholePaper:state.wholePaper,paperSize:state.paperSize,paperOrientation:state.paperOrientation,balanceLight:state.balanceLight,recognition:state.importRecognition,importShapeRegularization:state.importShapeRegularization,importApertures:state.importApertures,importMaterialColorMode:state.importMaterialColorMode,customImportWidth:state.customImportWidth,customImportHeight:state.customImportHeight});
}
const importPrefetchJobs=new WeakMap();
let importBatchRevision=0;
async function extractImportCandidate(source,box,region,{mode,widthMM,heightMM,calibrated,index,lighting=null}){
  // Geometry/mask discovery uses the unchanged rectified photo. Both the
  // visible cutout AND the unmasked editing frame use the same output-only RGB
  // correction. Otherwise hand-restoring masked pixels reverts their colours.
  const {cutout,fullColor}=await extractEditableCandidateRGB(source,box,region,{lighting,crop:cropBitmap});
  // alignMaterialPreview rotates and crops both inputs with identical geometry.
  // originalBlob is the editable full-colour source, not the raw camera RGB.
  const aligned=mode==='work'
    ?{blob:cutout,originalBlob:fullColor,candidateFrameBlob:fullColor,candidateFramePlacement:null,degrees:0,widthRatio:1,heightRatio:1}
    :await alignMaterialPreview(cutout,fullColor,region.orientedBox?.autoDeskew?-region.orientedBox.rotation:null);
  const width=calibrated?Math.round(((region.orientedBox?.autoDeskew?region.orientedBox.width:region.w))*widthMM*10)/10:null,
    height=calibrated?Math.round(((region.orientedBox?.autoDeskew?region.orientedBox.height:region.h))*heightMM*10)/10:null;
  return {blob:aligned.blob,originalBlob:aligned.originalBlob,candidateFrameBlob:aligned.candidateFrameBlob||aligned.originalBlob,
    url:URL.createObjectURL(aligned.blob),title:'素材 '+(index+1),width,height,alignment:aligned.degrees,
    widthRatio:aligned.widthRatio,heightRatio:aligned.heightRatio,
    processingRecord:{automaticCorrectionDegrees:aligned.degrees,sourceWidthMM:width,sourceHeightMM:height,
      recognitionPixels:[900,1200,1600].includes(Number(state.preferences.recognitionPixels))
        ?Number(state.preferences.recognitionPixels):900,
      candidateFramePlacement:aligned.candidateFramePlacement||null},region,selected:true};
}
function importPrefetchSettings(rec){
  return {paperSize:rec.paperSize||state.preferences.paperSize,paperOrientation:rec.paperOrientation||state.preferences.orientation,
    customImportWidth:rec.customImportWidth||state.preferences.customPaperWidth||210,customImportHeight:rec.customImportHeight||state.preferences.customPaperHeight||297,
    wholePaper:rec.wholePaper??state.preferences.wholePaper,balanceLight:rec.balanceLight??state.preferences.balanceLight,
    recognition:rec.recognition||state.preferences.recognition,candidateDiscovery:rec.candidateDiscovery||state.preferences.candidateDiscovery||'legacy',pixels:state.preferences.recognitionPixels||900,
    denoise:state.preferences.recognitionDenoise===true,localContrast:state.preferences.recognitionLocalContrast===true,
    chromaEdges:state.preferences.recognitionChromaEdges!==false,shapeRegularization:rec.importShapeRegularization??(state.preferences.recognitionShapeRegularization!==false),
    apertures:rec.importApertures??(state.preferences.recognitionApertures!==false),mergeSharedCarrier:state.preferences.mergeSharedCarrier!==false,materialColorMode:rec.importMaterialColorMode||state.preferences.materialColorMode||'auto',mode:state.importMode};
}
function updateImportPrefetchLabel(rec){
  const index=state.importRecords.indexOf(rec),label=index>=0?view.querySelector(`.queue-item[data-id="${index}"] small`):null;
  if(label&&!rec.confirmed)label.textContent=rec.prefetchStatus==='ready'?`${rec.candidates.length} 件已预识别`:rec.prefetchStatus==='running'?'后台识别中':'待识别';
}
async function prefetchImportRecord(rec,settings,revision){
  let bitmap,correctedBitmap,correctedURL,candidateURLs=[];
  const valid=()=>revision===importBatchRevision&&state.importRecords.includes(rec)&&state.route==='import';
  try{
    bitmap=await decodeRecognitionImage(rec.file);if(!valid())return;
    const initial=importPaperDimensions({...settings,bitmap,corners:null});
    const corners=rec.corners||(settings.paperSize==='none'?null:await suggestPaperCorners(bitmap,initial[0]/initial[1]).catch(()=>null));if(!valid())return;
    const [pw,ph]=importPaperDimensions({...settings,bitmap,corners});
    if(corners&&settings.paperSize!=='none'){
      const corrected=await rectifyA4Frame(bitmap,corners,4096,pw/ph);correctedBitmap=corrected.canvas;correctedURL=URL.createObjectURL(corrected.blob);if(!valid())return;
    }
    const source=correctedBitmap||bitmap,box=correctedBitmap?{x:0,y:0,w:1,h:1}:rec.box||{x:0,y:0,w:1,h:1};
    let candidates=await detectPaperCandidates(source,box,6,{balanceLight:settings.balanceLight,paperRectified:!!correctedBitmap,paperWidthMM:pw,paperHeightMM:ph,
      recognition:settings.recognition,candidateDiscovery:settings.candidateDiscovery,recognitionPixels:settings.pixels,
      recognitionPreprocess:{illumination:settings.balanceLight,denoise:settings.denoise,localContrast:settings.localContrast,chromaEdges:settings.chromaEdges},
      recognitionPostprocess:{shapeRegularization:settings.shapeRegularization,apertures:settings.apertures},mergeSharedCarrier:settings.mergeSharedCarrier,
      onDiagnostic:trace=>{if(valid())rec.recognitionDiagnostic=trace;}});if(!valid())return;
    candidates=filterAutomaticMaterialBoxes(candidates,{paperWidthMM:pw,paperHeightMM:ph,enabled:settings.paperSize!=='none'});
    const calibrated=settings.paperSize!=='none'&&(correctedBitmap||settings.wholePaper),candidateData=[];
    const lighting=settings.materialColorMode!=='original'&&correctedBitmap
      ?await estimatePageLighting(source,candidates):null;
    for(let i=0;i<candidates.length;i++){
      const candidate=await extractImportCandidate(source,box,candidates[i],{mode:settings.mode,widthMM:pw,heightMM:ph,calibrated,index:i,lighting});
      candidateURLs.push(candidate.url);candidateData.push(candidate);
      if(!valid())return;
    }
    if(!valid())return;
    Object.assign(rec,{bitmap,autoPaperCorners:corners&&!rec.corners?structuredClone(corners):null,correctedBitmap,correctedURL,
      appliedCorners:correctedBitmap?JSON.stringify(corners):null,backgroundDetected:!!correctedBitmap,
      candidates,candidateData,candidateURLs,selection:candidateData.map((_,i)=>i),prefetchStatus:'ready'});
    bitmap=correctedBitmap=correctedURL=null;candidateURLs=[];updateImportPrefetchLabel(rec);
  }finally{
    bitmap?.close?.();correctedBitmap?.close?.();if(correctedURL)URL.revokeObjectURL(correctedURL);
    for(const url of candidateURLs)URL.revokeObjectURL(url);
  }
}
function scheduleImportPrefetch(){
  if(state.route!=='import'||state.importStep!=='inspect'||state.importMode==='snapshot')return;
  const rec=state.importRecords.slice(state.importIndex+1).find(r=>!r.confirmed&&!r.candidateData?.length&&!importPrefetchJobs.has(r));
  if(!rec)return;
  const settings=importPrefetchSettings(rec),revision=importBatchRevision;
  rec.prefetchStatus='running';updateImportPrefetchLabel(rec);
  const promise=prefetchImportRecord(rec,settings,revision).catch(error=>{if(revision===importBatchRevision){rec.prefetchStatus='failed';updateImportPrefetchLabel(rec);console.warn('下一张照片后台识别失败，切换时重试',error);}});
  importPrefetchJobs.set(rec,{promise,signature:JSON.stringify(settings)});
}
function resetImportBatch(){
  // Dispose only photo-owned resources, not the shared model/Worker. Saved
  // library images have independent object URLs maintained by the store.
  state.importLoadGeneration=(state.importLoadGeneration||0)+1;
  importBatchRevision++;
  discardPaperPreview();
  const bitmaps=new Set(),objectURLs=new Set();
  for(const r of state.importRecords){for(const b of [r.bitmap,r.correctedBitmap])if(b)bitmaps.add(b);for(const u of [r.url,r.correctedURL,...(r.candidateURLs||[])])if(u)objectURLs.add(u);}
  for(const b of bitmaps)b.close?.();for(const u of objectURLs)URL.revokeObjectURL(u);
  Object.assign(state,{importStep:'inspect',importRecords:[],importIndex:0,importFile:null,importBitmap:null,importURL:null,correctedBitmap:null,correctedURL:null,paperCorners:null,importCandidates:[],importCandidateURLs:[],importCandidateData:[],importCandidateSelection:new Set(),importProcessing:'',importOrganizing:false,importSavedCount:0,showManualBox:false,showCorrectionPreview:false,importBatchSeriesID:null,importBatchWorkSaveAssets:false,importBatchWorkPaperPattern:'plain',importBatchWorkPaperColor:'#fcfaf0'});
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
  state.wholePaper=rec.wholePaper??state.preferences.wholePaper;state.paperSize=rec.paperSize||state.preferences.paperSize;state.paperOrientation=rec.paperOrientation||state.preferences.orientation;state.balanceLight=rec.balanceLight??state.preferences.balanceLight;state.importShapeRegularization=rec.importShapeRegularization??(state.preferences.recognitionShapeRegularization!==false);state.importApertures=rec.importApertures??(state.preferences.recognitionApertures!==false);state.importMaterialColorMode=rec.importMaterialColorMode||state.preferences.materialColorMode||'auto';state.importRecognition=rec.recognition||state.preferences.recognition;state.customImportWidth=rec.customImportWidth||state.preferences.customPaperWidth||210;state.customImportHeight=rec.customImportHeight||state.preferences.customPaperHeight||297;
  state.paperCorners=rec.corners||null;
  state.correctedBitmap=rec.correctedBitmap||null;state.correctedURL=rec.correctedURL||null;state.importCandidates=rec.candidates||[];state.importCandidateURLs=rec.candidateURLs||[];state.importCandidateData=rec.candidateData||[];state.importCandidateSelection=new Set(rec.selection||[]);state.showManualBox=false;state.showCorrectionPreview=false;discardPaperPreview();
  const progress=message=>{state.importProcessing=message;const status=view.querySelector('.import-processing');if(status)status.textContent=message;};
  state.importProcessing=state.importMode==='snapshot'?'正在读取页面…':'正在读取照片并加载本机识别引擎…';render();
  // Paint the selected photo before decoding, engine initialization or warp.
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  try{
  const job=importPrefetchJobs.get(rec);
  if(job){await job.promise;if(!isCurrent())return;
    if(job.signature!==JSON.stringify(importPrefetchSettings(rec))){
      rec.bitmap?.close?.();rec.correctedBitmap?.close?.();if(rec.correctedURL)URL.revokeObjectURL(rec.correctedURL);
      for(const url of rec.candidateURLs||[])URL.revokeObjectURL(url);
      Object.assign(rec,{bitmap:null,correctedBitmap:null,correctedURL:null,autoPaperCorners:null,candidates:[],candidateData:[],candidateURLs:[],selection:[],prefetchStatus:null});
    }
    importPrefetchJobs.delete(rec);
    state.paperCorners=rec.corners||rec.autoPaperCorners||null;state.correctedBitmap=rec.correctedBitmap||null;state.correctedURL=rec.correctedURL||null;
    state.importCandidates=rec.candidates||[];state.importCandidateData=rec.candidateData||[];state.importCandidateURLs=rec.candidateURLs||[];state.importCandidateSelection=new Set(rec.selection||[]);
  }
  const bitmap=rec.bitmap||await decodeRecognitionImage(rec.file);rec.bitmap=bitmap;if(!isCurrent())return;state.importBitmap=bitmap;
  progress('正在自动寻找纸张四角…');
  state.paperCorners=rec.corners||rec.autoPaperCorners||(state.paperSize==='none'?null:await suggestPaperCorners(bitmap,(()=>{const [pw,ph]=paperDimensions();return pw/ph;})()).catch(()=>null));if(!isCurrent())return;
  if(!rec.corners&&state.paperCorners)rec.autoPaperCorners=structuredClone(state.paperCorners);
  progress('正在进行透视校正…');
  if(!state.correctedBitmap&&state.paperCorners&&state.paperSize!=='none'){
    const [pw,ph]=paperDimensions(),{canvas,blob}=await rectifyA4Frame(state.importBitmap,state.paperCorners,4096,pw/ph);
    if(!isCurrent())return;
    state.correctedBitmap=canvas;state.correctedURL=URL.createObjectURL(blob);rec.appliedCorners=JSON.stringify(state.paperCorners);rec.backgroundDetected=true;
  }
  if(!isCurrent())return;
  if(state.importMode==='snapshot'){
    state.importCandidates=[];state.importCandidateData=[];state.importCandidateURLs=[];
    state.importCandidateSelection=new Set();
    saveActiveImportRecord();render();
  }else{
    progress('正在识别并提取素材…');saveActiveImportRecord();render();
    if(rec.prefetchStatus!=='ready'&&!state.importCandidates.length&&state.importStep==='inspect')await previewCrop();
  }
  }finally{if(isCurrent()){state.importProcessing='';render();queueMicrotask(scheduleImportPrefetch);}}
}
function discardPaperPreview(){state.paperPreviewBitmap?.close?.();if(state.paperPreviewURL&&state.paperPreviewURL!==state.correctedURL)URL.revokeObjectURL(state.paperPreviewURL);state.paperPreviewBitmap=null;state.paperPreviewURL=null;state.paperPreviewApplied=false;}
async function rotateImportPhoto(){
  if(!state.importBitmap)return;const rec=state.importRecords[state.importIndex];
  if(rec.manualEdits&&!confirm('旋转会重新识别这张照片并舍弃候选编辑，继续吗？'))return;
  const bitmap=state.importBitmap,canvas=document.createElement('canvas');canvas.width=bitmap.height;canvas.height=bitmap.width;const ctx=canvas.getContext('2d');ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(bitmap,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));rec.originalFile||=rec.file;rec.file=new File([blob],rec.file.name,{type:'image/png'});URL.revokeObjectURL(rec.url);rec.url=URL.createObjectURL(blob);
  const old=state.paperCorners;resetPaperCorrection(state);state.paperCorners=old?[old[3],old[0],old[1],old[2]].map(p=>({x:1-p.y,y:p.x})):null;bitmap.close?.();state.importBitmap=await decodeRecognitionImage(rec.file);rec.bitmap=state.importBitmap;state.importFile=rec.file;state.importURL=rec.url;state.importCandidates=[];state.importCandidateData=[];state.importCandidateURLs=[];state.importCandidateSelection=new Set();rec.confirmed=false;rec.manualEdits=false;
  saveActiveImportRecord();await switchImportRecord(state.importIndex,true);
}
async function previewCorrection(){
  if(!state.importBitmap)return;discardPaperPreview();const [pw,ph]=paperDimensions();
  const {canvas,blob}=await rectifyA4Frame(state.importBitmap,state.paperCorners,4096,pw/ph);state.paperPreviewBitmap=canvas;state.paperPreviewURL=URL.createObjectURL(blob);state.showCorrectionPreview=true;state.paperPreviewApplied=false;render();
}
async function applyPaperPreview(){
  const rec=state.importRecords[state.importIndex];if(!state.paperPreviewBitmap)return;
  if(rec.appliedCorners===JSON.stringify(state.paperCorners)&&state.correctedBitmap){state.paperPreviewApplied=true;render();return;}
  if(rec.manualEdits&&!confirm('重新校正会舍弃本照片的名称、手动选框和修补结果并重新识别，继续吗？'))return;
  state.correctedBitmap?.close?.();if(state.correctedURL)URL.revokeObjectURL(state.correctedURL);
  state.correctedBitmap=state.paperPreviewBitmap;state.correctedURL=state.paperPreviewURL;state.paperPreviewBitmap=null;state.paperPreviewURL=null;state.paperPreviewApplied=true;rec.appliedCorners=JSON.stringify(state.paperCorners);rec.backgroundDetected=true;rec.manualEdits=false;rec.confirmed=false;
  state.importProcessing=state.importMode==='snapshot'?'正在更新校正后的页面…':'正在按新校正结果识别…';render();
  try{if(state.importMode!=='snapshot')await previewCrop();toast(state.importMode==='snapshot'?'已使用校正结果':'已使用校正结果，候选素材已更新');}
  finally{state.importProcessing='';if(state.route==='import')render();}
}
async function openManualImportBox(){
  if(state.importMode==='snapshot')return;
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
      ah=Math.max(1,Math.round(source.height*b.h*scale));
    const pixels=await analysisPixels(source,b,aw,ah);
    // Explicit manual frames are authoritative even on pale or nearly blank
    // stock. Do not discard them with automatic foreground-confidence gates.
    // Manual geometry is authoritative. Never pass only the axis-aligned
    // bounds to the physical segmentation worker: doing so discarded rotation
    // on confirmation and silently replaced the user's frame with a vertical
    // full rectangle. Rasterize the EXACT visible rotated frame instead.
    const manualRegion=manualPhysicalRegion(box,aw,ah);
    const [candidate]=await visionTask('process-material-boxes',{
      pixels,sourcePixels:pixels,width:aw,height:ah,
      boxes:[manualRegion],method:'physical',paperWidthMM:pw,paperHeightMM:ph,
      mergeSharedCarrier:true,shapeRegularization:false,apertures:false
    });
    if(!candidate?.mask?.alpha?.length||candidate.segmentationFailed)
      throw Error('旋转框无法生成完整素材 Mask，请调整后重试');
    // Preserve the user-defined angle; minAreaRect can re-express e.g. 60°
    // as -30° with swapped axes, which is not the frame the user confirmed.
    return {...candidate,manualGeometry:true,
      physicalBoundary:manualRegion.physicalBoundary,
      orientedBox:manualRegion.orientedBox};
  }):regions.map(region=>({region,original:null}));
  if(record!==state.importRecords[state.importIndex]||state.route!=='import')return false;
  const lighting=state.importMaterialColorMode!=='original'&&state.correctedBitmap
    ?await estimatePageLighting(source,plans.map(plan=>plan.region)):null;
  for(let i=0;i<plans.length;i++){
    const {region,original}=plans[i];if(original){next.push(original);continue;}
    toast('正在提取素材 '+(i+1)+' / '+plans.length);
    const regenerated=await extractImportCandidate(source,b,region,{mode:state.importMode,widthMM:pw,heightMM:ph,calibrated,index:i,lighting});
    // Changing only colour must not reset manual names, tags, dimensions or
    // choices, and must never cause the segmentation algorithm to rerun.
    const old=previous.find(item=>item.region===region)||
      previous.find(item=>item.region&&Math.abs(item.region.x-region.x)<1e-6&&Math.abs(item.region.y-region.y)<1e-6&&Math.abs(item.region.w-region.w)<1e-6&&Math.abs(item.region.h-region.h)<1e-6);
    if(old)for(const key of ['title','selected','tags','seriesID','kind','role','quantity','reviewStatus','dimensionSource','width','height']){
      if(old[key]!==undefined)regenerated[key]=structuredClone(old[key]);
    }
    next.push(regenerated);
  }
  if(record!==state.importRecords[state.importIndex]){for(const c of next)if(!previous.includes(c))URL.revokeObjectURL(c.url);return false;}
  for(const c of previous)if(!next.includes(c))URL.revokeObjectURL(c.url);
  state.importCandidates=plans.map(plan=>plan.region);state.importCandidateData=next;state.importCandidateURLs=next.map(c=>c.url);state.importCandidateSelection=new Set(next.flatMap((c,i)=>c.selected?[i]:[]));saveActiveImportRecord();return true;
}
async function previewCrop(){
  if(!state.importBitmap||state.importMode==='snapshot')return;
  const record=state.importRecords[state.importIndex],source=state.correctedBitmap||state.importBitmap,b=state.correctedBitmap?{x:0,y:0,w:1,h:1}:state.importBox,[pw,ph]=paperDimensions();
  let regions=await detectPaperCandidates(source,b,6,{balanceLight:state.balanceLight,paperRectified:!!state.correctedBitmap,paperWidthMM:pw,paperHeightMM:ph,recognition:state.importRecognition||state.preferences.recognition,candidateDiscovery:state.preferences.candidateDiscovery||'legacy',recognitionPixels:state.preferences.recognitionPixels,recognitionPreprocess:recognitionPreprocessOptions(),recognitionPostprocess:recognitionPostprocessOptions(),mergeSharedCarrier:state.preferences.mergeSharedCarrier!==false,onDiagnostic:trace=>{record.recognitionDiagnostic=trace;},onProgress:p=>{
    if(state.route!=='import'||record!==state.importRecords[state.importIndex])return;
        const text=p.status==='inference'?'浏览器模型正在细化素材边缘…'
          :p.status==='fallback'?(Number.isFinite(p.count)?`${p.count} 个模型结果不可靠，保留传统识别边缘，请检查`:'边缘识别未完成，正在检查候选结果…')
          :p.status==='contour-refinement'?`正在细化 ${p.total||''} 个不确定素材边缘…`
          :p.status==='boundary-postprocess'?`正在进行 ${p.total||''} 个素材的边缘与孔洞后处理…`
          :'正在优化素材边缘…';
    state.importProcessing=text;const label=view.querySelector('.import-processing');if(label)label.textContent=text;toast(text);
  }});
  if(state.route!=='import'||record!==state.importRecords[state.importIndex])return;
  if(regions.length&&regions.every(region=>!region.mask?.alpha?.length))
    throw Error('素材边缘分割未完成，请联网刷新后重试识别；当前候选框尚未生成可用素材。');
  regions=filterAutomaticMaterialBoxes(regions,{paperWidthMM:pw,paperHeightMM:ph,enabled:state.paperSize!=='none'});
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
  for(const c of state.importCandidateData||[]){if(c.dimensionSource==='manual')continue;c.width=calibrated?Math.round(((c.region.orientedBox?.autoDeskew?c.region.orientedBox.width:c.region.w))*pw*10)/10:null;c.height=calibrated?Math.round(((c.region.orientedBox?.autoDeskew?c.region.orientedBox.height:c.region.h))*ph*10)/10:null;if(c.processingRecord){c.processingRecord.sourceWidthMM=c.width;c.processingRecord.sourceHeightMM=c.height;}}
  if(rec)rec.confirmed=false;saveActiveImportRecord();render();
}
async function chooseCandidate(index){if(index>=0){state.importCandidateSelection=new Set([index]);render();}else await previewCrop();}
function paperDimensions(){return importPaperDimensions({paperSize:state.paperSize,paperOrientation:state.paperOrientation,bitmap:state.importBitmap,corners:state.paperCorners,customImportWidth:state.customImportWidth||state.preferences.customPaperWidth,customImportHeight:state.customImportHeight||state.preferences.customPaperHeight});}
async function confirmImportPhoto(){
  if(state.importProcessing)return;
  const record=state.importRecords[state.importIndex];
  // A paper size edit recalibrates millimetres only. The extracted pixels and
  // applied corner correction stay valid until the corners themselves change.
  if(state.paperSize!=='none'&&state.paperCorners&&state.correctedBitmap
    &&record?.appliedCorners!==JSON.stringify(state.paperCorners)){
    toast('纸张四角已调整，请先“预览校正”并点击“使用校正结果”，再确认素材');return;
  }
  const selected=[...(state.importCandidateSelection||[])];if(!selected.length&&state.importMode==='material'){toast('请选择至少一件素材，或使用手动补框');return;}
  const rec=state.importRecords[state.importIndex];rec.selectedCandidates=(state.importCandidateData||[]).map((c,i)=>({...c,selected:state.importCandidateSelection.has(i)}));rec.confirmed=true;saveActiveImportRecord();
  const next=state.importRecords.findIndex(r=>!r.confirmed);if(next>=0)await switchImportRecord(next);else{state.importStep='review';render();}
}
async function organizeSavedProjects(projects,{waitForSave}={}){
  if(!state.preferences.autoOrganizeWorks||!projects?.length)return;
  const config=structuredClone(state.aiSettings),account=state.accountId;
  if(!config.key)return; // Offline projects retain their current title/tags.
  try{
    await waitForSave?.();
    for(const source of projects){
      if(state.accountId!==account)return;
      const complete=await db.get('projects',source.id);
      if(!complete||complete.updatedAt!==source.updatedAt||complete.autoOrganized)return;
      let picture=null;
      if(complete.isSnapshot&&supportsVision(config)&&config.includeThumbnails){
        const raw=(await db.get('blobs',complete.snapshotBlobId))?.data;
        if(raw instanceof Blob){
          const bitmap=await createImageBitmap(raw);
          try{const canvas=document.createElement('canvas'),scale=Math.min(1,360/Math.max(bitmap.width,bitmap.height));
            canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
            canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
            picture=canvas.toDataURL('image/jpeg',.78);
          }finally{bitmap.close();}
        }
      }
      const result=await classifyRecord({kind:'project',record:complete,settings:config,image:picture,assets:state.assets});
      if(state.accountId!==account)return;
      const latest=await db.get('projects',source.id);
      if(!latest||latest.updatedAt!==source.updatedAt||latest.autoOrganized)return;
      const updated={...latest,autoOrganized:true,title:result.title||latest.title,
        styleTags:(result.styleTags||result.tags||latest.styleTags||[]).slice(0,8),updatedAt:new Date().toISOString()};
      if(updated.isSnapshot)await db.put('projects',updated);
      else await db.stageProject(updated);
      const live=state.projects.find(p=>p.id===source.id);
      if(live&&live.updatedAt===source.updatedAt)Object.assign(live,updated);
    }
    if(state.route==='works')render();
  }catch(error){console.warn('作品自动整理待重试，原始作品仍保留',error);}
}
async function organizeSavedAssets(records,{waitForSave,projects=[]}={}){ 
  if(projects.length)void organizeSavedProjects(projects,{waitForSave});
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
    }else if(state.route!=='import'||state.importStep!=='done')toast('未启用视觉整理，素材已保存，可稍后检查或在设置开启');
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
// Render a finished 720px cover from the full editable document. This path
// deliberately does not rely on the active editor, route or hydrated DOM;
// it fetches ONLY 720px material previews, never original large images.
// Reuse the already-rendered local 720px Blob while uploading to COS.
setCloudProjectPreview(project=>localWorkCovers.ensure(project));
async function exportPNG(){const d=current(),canvas=await rasterize(d,2);canvas.toBlob(blob=>download(blob,(state.activeProject.title||'拾页作品')+'.png'),'image/png');}
async function printPage(){const d=current(),canvas=await rasterize(d,2),url=canvas.toDataURL('image/png');const child=window.open('','_blank');if(!child){toast('请允许打开打印预览窗口');return;}child.document.write(`<html><head><title>${esc(state.activeProject.title)}</title><style>@page{size:A4;margin:0}body{margin:0}img{width:100%;height:auto}</style></head><body><img src="${url}" onload="window.print()"></body></html>`);child.document.close();}
async function rasterize(d,scale,{preview=false}={}){
 const ids=[...new Set(editorEntry(d).filter(e=>e.kind==='material').map(e=>asset(e.value.assetID)).filter(a=>a&&!a.staticPath).map(a=>a.blobId))],release=privateImages.retain(ids);
 try{await Promise.all(ids.map(id=>privateImages.load(id,preview?false:true)));const result=await renderSceneCanvas(d,{scale,loadMaterialImage:async id=>{const a=asset(id);if(!a)throw Error('素材不在当前资料库');return decodeSceneImage(a.staticPath||(preview?imagePlaceholder(a.blobId):(urls.get(a.blobId)||image(a.blobId))));}});return result.canvas;}finally{release();}
}
async function receiveImportPhotos(files){const images=[...files].filter(f=>f.type.startsWith('image/')).slice(0,Math.max(0,12-state.importRecords.length));if(!images.length)return;try{saveActiveImportRecord();const start=state.importRecords.length;for(const file of images)state.importRecords.push({file,url:URL.createObjectURL(file),confirmed:false,selectedCandidates:[],selection:[],candidates:[]});state.importStep='inspect';state.route='import';await switchImportRecord(start,true);}catch(e){console.error(e);recordRuntimeIssue('handled',e,'import',{phase:'import'});toast(explainUserError(e,'照片处理'));}}
fileInput.onchange=async()=>{const files=[...(fileInput.files||[])];fileInput.value='';await receiveImportPhotos(files);};
workFileInput.onchange=async()=>{const file=workFileInput.files?.[0];workFileInput.value='';if(!file)return;if(file.type.startsWith('image/')){await receiveImportPhotos([file]);return;}
  try{await importEditableFile(file);}
  catch(error){console.error(error);toast('可编辑作品导入失败：'+error.message);}
};
async function saveOfflineSnapshotFile(file,matchingProject,mimeType){
  if(!['image/png','image/jpeg','image/webp'].includes(mimeType))throw Error('请选择 PNG、JPEG 或 WebP 图片');
  const bitmap=await createImageBitmap(file);
  try{
    const blobId=uid(),snapshot=snapshotRecord({title:file.name.replace(/\.[^.]+$/,'')||'导入的画面',previewBlobId:blobId,format:mimeType,width:bitmap.width,height:bitmap.height});
    if(matchingProject){
      snapshot.styles=matchingProject.styles;snapshot.purposes=matchingProject.purposes;snapshot.intent=matchingProject.intent;
      snapshot.aiGenerated=true;snapshot.offlineBundleId=matchingProject.offlineBundleId||null;
    }
    const content=file.type===mimeType?file:new Blob([file],{type:mimeType});
    await db.stageImport({projects:[snapshot],blobs:[{id:blobId,data:content}]});
    urls.set(blobId,URL.createObjectURL(content));
    if(matchingProject){
      await matchingSession.importProject(snapshot,{alreadyStored:true});
      if(modal.open)modal.close();route('matching');
      toast('画面快照已暂存并加入版本方案，正在后台同步');
    }else{
      state.projects.push(snapshot);parity.workTab='snapshot';route('works');
      toast('画面快照已暂存，正在后台同步');
    }
  }finally{bitmap.close();}
}
snapshotFileInput.onchange=async()=>{
  const file=snapshotFileInput.files?.[0],matchingProject=offlineSnapshotProject;
  snapshotFileInput.value='';offlineSnapshotProject=null;
  if(!file)return;
  try{
    const type=await classifyCreationFile(file);
    if(type.kind!=='image')throw Error('请选用 PNG、JPEG 或 WebP 画面图片');
    await saveOfflineSnapshotFile(file,matchingProject,type.mimeType);
  }catch(error){console.error(error);toast('画面导入失败：'+error.message);}
};
creationResultInput.addEventListener('cancel',()=>{offlineSnapshotProject=null;registeringOriginalGPTTask=false;});
creationResultInput.onchange=async()=>{
  const file=creationResultInput.files?.[0],matchingProject=offlineSnapshotProject,registerTask=registeringOriginalGPTTask;
  creationResultInput.value='';offlineSnapshotProject=null;registeringOriginalGPTTask=false;
  if(!file)return;
  try{
    if(registerTask){
      if((await classifyCreationFile(file)).kind!=='zip')throw Error('请选用从拾页导出的原始任务 ZIP');
      const {inspectOfflinePackage}=await import('./offline-creation.js');
      const source=inspectOfflinePackage(new Uint8Array(await file.arrayBuffer()));
      if(source.kind!=='task')throw Error('这不是原始任务包；请选择包含 task/context.json 的导出 ZIP');
    }
    await importEditableFile(file,{matchingProject});
  }
  catch(error){console.error(error);toast('作品文件导入失败：'+error.message);}
};
async function importEditableFile(file,{matchingProject=null}={}){
  const detected=await classifyCreationFile(file);
  if(detected.kind==='image')return saveOfflineSnapshotFile(file,matchingProject,detected.mimeType);

  if(detected.kind==='zip'){
    if(file.size>20_000_000)throw Error('可编辑作品包不能超过 20 MB');
    const {inspectOfflinePackage,verifyOfflineTaskPackage,importEditableWorkPackageReviewed}=await import('./offline-creation.js');
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
  // Standard Scene JSON shares the saved Draft with the manual editor.
  const contents=await file.text();
  let input;try{input=JSON.parse(contents.replace(/^\uFEFF/,'').trim());}catch{}
  if(input?.format==='shiye-scene'){
    const imported=importSceneDocument(input,state.assets);
    await flushSave();await db.stageProject(imported);
    state.projects.push(imported);state.activeProject=imported;state.activeDraft=imported.activeDraftID;
    resetEditorHistory(state);state.tool='select';if(modal.open)modal.close();route('editor');
    toast('Scene 已通过物理尺寸与图层校验，可继续编辑');return;
  }
  await importOfflineText(contents);
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
// A long uninterrupted editing session also creates a recovery point,
// even when the user pauses without making another stroke.
setInterval(()=>{
  const p=state.route==='editor'?state.activeProject:null;
  if(!p?.sceneOperationsSinceSnapshot)return;
  const since=Date.parse(p.lastAutoSceneSnapshotAt||p.sceneFirstUnsnapshottedAt||'');
  if(Number.isFinite(since)&&Date.now()-since>=5*60*1000)
    snapshotEditedScene('5-minutes');
},30000);
window.addEventListener('pagehide',()=>{snapshotEditedScene('pagehide');if(saveTimer)flushSave().catch(console.error);});
window.addEventListener('beforeunload',event=>{if(saveTimer||savingProjects||dirtyProjects.size){event.preventDefault();event.returnValue='';}});
// Logout requires a durable local checkpoint, not a successful network round
// trip. Unacknowledged edits remain in the account-scoped outbox for re-login.
window.addEventListener('shiye-flush-before-logout',event=>event.detail.tasks.push(flushSave()));
let lastSyncError;
window.addEventListener('shiye-cloud-superseded',()=>{
  // Local stale changes were dropped in favour of a newer cloud record.
  // Preserve active import/matching selections; their next route exit forces
  // an immediate pull rather than replacing their draft UI.
  if(!shouldPullCloudForRoute(state.route))return;
  void backgroundCloudCheck({force:true});
});
window.addEventListener('shiye-project-conflict-copy',event=>{
  const {originalId,copyId,title,originalSessionId,newSessionId}=event.detail||{};
  if(!copyId)return;
  // The active local editor may have newer unsaved strokes than the
  // conflicting outbox snapshot. Keep those edits on the new ID instead of
  // forking repeatedly on every later save of the stale original ID.
  const current=state.activeProject;
  if(current?.id===originalId&&current.__cloudSessionId===originalSessionId&&newSessionId){
    dirtyProjects.delete(originalId);
    current.id=copyId;
    current.title=title;
    current.__cloudSessionId=newSessionId;
    delete current.__cloudBaseRevision;
    saveSpecificProject(current);
  }
  toast('已保留其他设备原稿；当前修改正作为新的独立作品同步，请在作品页查看。');
});
window.addEventListener('shiye-project-sync',event=>{const {pending,error,conflicts=0}=event.detail;syncDisplay.pending=pending;syncDisplay.error=error;syncDisplay.conflicts=conflicts;syncDisplay.checking=false;if(!dirtyProjects.size&&!savingProjects)syncDisplay.localPending=false;updateSyncIndicator();if(error){saveStatus('待同步 · 修改已保留在本机');const message=error.name==='AbortError'||/abort|timed? ?out/i.test(error.message||'')?'网络请求中断，本机修改已保留，将自动重试同步':describeSyncError(error);if(lastSyncError!==message)toast(message);lastSyncError=message;}else{lastSyncError=null;saveStatus(conflicts?'部分资料有冲突 · 其他资料已继续同步':pending?'修改已暂存 · 后台同步中':'已保存到云端');privateImages.retryMissing();}});
let cloudCheck,cloudCheckAt=0,cloudSessionReady=false,cloudCheckAgain=false;
const CLOUD_POLL_MS=5000;
let syncPausedByUser=false,resetWorkflowActive=false;
const cloudResumer=createSyncResumer({flush:()=>db.flushProjects({background:true}),canRun:()=>cloudEnabled&&cloudSessionReady&&navigator.onLine!==false,onError:error=>console.warn('后台同步待重试',error?.message)});
function backgroundCloudCheck({force=false}={}){
  if(!cloudEnabled||!shouldPullCloudForRoute(state.route)||
     document.visibilityState==='hidden')return;
  if(cloudCheck){if(force)cloudCheckAgain=true;return;}
  if(!force&&Date.now()-cloudCheckAt<CLOUD_POLL_MS)return;
  cloudCheckAt=Date.now();
  cloudCheck=refresh({background:true,onlyChanged:true})
    .catch(error=>{recordRuntimeIssue('handled',error,state.route,{phase:'background'});console.warn('后台版本检查失败；保留已验证缓存',error);})
    .finally(()=>{
      cloudCheck=null;
      if(cloudCheckAgain){
        cloudCheckAgain=false;
        queueMicrotask(()=>backgroundCloudCheck({force:true}));
      }
    });
}
// Cloud sync is bidirectional: poll lightweight version metadata while the
// document remains visible, not only when focus/online events happen.
setInterval(backgroundCloudCheck,CLOUD_POLL_MS);
window.addEventListener('focus',()=>{backgroundCloudCheck();privateImages.retryMissing();void cloudResumer.wake();});
document.addEventListener('visibilitychange',()=>{backgroundCloudCheck();if(document.visibilityState==='hidden'){view.flushInkCommit?.({renderUI:false,force:true});snapshotEditedScene('app-background');if(dirtyProjects.size||dirtyUsageAssets.size)void flushSave().catch(console.error);}if(document.visibilityState==='visible'){privateImages.retryMissing();void cloudResumer.wake();}});
window.addEventListener('online',()=>{backgroundCloudCheck();privateImages.retryMissing();void cloudResumer.wake();});
window.addEventListener('offline',updateSyncIndicator);
window.addEventListener('online',updateSyncIndicator);
async function runAccountStorageMigration(){
 if(!cloudEnabled)return;
 const status=message=>{const label=body.querySelector('#migration-status');if(label)label.textContent=message;};
 body.innerHTML='<h2>转换旧数据格式</h2><p id="migration-status" role="status">正在只读扫描云端的素材、系列、作品、图片引用、设置和最近删除…</p>';
 try{
  const {prepareStorageMigration,migrationBackup}=await import('./data-migrations/registry.js');
  const inventory=await db.scanLegacyAccountData();
  const plan=await prepareStorageMigration(inventory.collections,{
    assets:inventory.collections.assets,
    resolveProject:record=>db.readOriginalLegacyProject(record)
  });
  const rows=plan.scans.map(row=>`<tr><td>${esc({assets:'素材',series:'系列',projects:'作品',blobs:'图片引用',meta:'设置与元数据',trash:'最近删除'}[row.store])}</td><td>${row.total}</td><td>${row.migratable}</td><td>${row.needsReview}</td></tr>`).join('');
  body.innerHTML=`<h2>转换旧数据格式</h2><p>本次共扫描 ${plan.totals.scanned} 条账号记录；找到 ${plan.totals.migratable} 条可验证转换的旧记录，${plan.totals.needsReview} 条需要人工检查。已符合现行结构的资料不会被重写。</p><div style="max-height:50vh;overflow:auto"><table class="migration-audit-table"><thead><tr><th>数据类型</th><th>扫描</th><th>可转换</th><th>待检查</th></tr></thead><tbody>${rows}</tbody></table></div>${plan.review.length?`<details><summary>无法自动转换的记录（未修改）</summary><ul>${plan.review.slice(0,30).map(row=>`<li>${esc(row.store)} · ${esc(row.id||'未知')}：${esc(row.reason)}</li>`).join('')}</ul></details>`:''}<p>转换前必须下载原始备份。只转换有明确转换器、且完成物理尺寸与库存校验的记录。旧 COS 原件不会删除；无法转换的条目仍保留原样。</p><p id="migration-status" role="status"></p><div class="actions"><button type="button" class="btn" id="migration-download" ${plan.changes.length?'':'disabled'}>下载受影响记录的原始备份</button><button type="button" class="btn primary" id="migration-apply" disabled>确认备份后转换 ${plan.changes.length} 条</button><button type="button" class="btn" id="migration-cancel">取消</button></div>`;
  body.querySelector('#migration-cancel').onclick=()=>modal.close();
  if(!plan.changes.length){status(plan.review.length?'没有可安全自动转换的记录；请按待检查清单处理。':'所有已识别的记录均符合当前格式，无需转换。');return;}
  let backupSaved=false,backup;
  body.querySelector('#migration-download').onclick=async()=>{
   try{
    status('正在准备备份与 SHA-256 校验…');
    backup??=await migrationBackup(plan,{account:inventory.account,revision:inventory.revision});
    download(backup.blob,'拾页-转换前原始备份-'+new Date().toISOString().slice(0,10)+'.json');
    backupSaved=true;
    body.querySelector('#migration-apply').disabled=false;
    status('已发起原始备份下载（SHA-256：'+backup.sha256.slice(0,16)+'…）。请先在“文件”中确认已保存，再执行转换。');
   }catch(error){status('备份失败：'+error.message);}
  };
  body.querySelector('#migration-apply').onclick=async()=>{
   if(!backupSaved||!confirm('确认已在本机保存旧数据备份？\n转换会更新已通过校验的账号记录，其他设备的并发修改将触发版本保护。不能直接撤销数据库写入。'))return;
   const button=body.querySelector('#migration-apply');button.disabled=true;
   try{
    status('正在检查版本并提交转换；请不要关闭页面…');
    const result=await db.commitLegacyAccountMigration({expectedRevision:inventory.revision,changes:plan.changes});
    status('转换提交成功：'+result.updated+' 条；旧图像与原始对象未删除。正在核对…');
    await refresh({background:true});
    status('转换成功 '+result.updated+' 条；请重新打开作品确认图层、素材与同步状态。');
   }catch(error){status('转换未完成：'+error.message+'。原始云端记录及已下载备份保留，请重新扫描。');}
  };
 }catch(error){status('扫描失败：'+error.message+'。没有修改数据库。');}
}
async function openSyncConflictChoice(kind,id){
  if(!cloudEnabled)return;
  cloudResumer.suspend();
  body.innerHTML='<h2>核对同步版本</h2><p role="status" id="conflict-progress">正在读取云端与本机版本…</p>';
  try{
    const review=await db.reviewSyncConflict(kind,id),{local,remote}=review.overview;
    const formatDate=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():'未记录';};
    const row=(label,record)=>`<section class="sync-version-card"><strong>${label}</strong>
      <p>${esc(record?.title||'没有云端版本')}</p><small>修改：${esc(formatDate(record?.updatedAt))} ·
      ${esc(String(record?.drafts??0))} 个方案 · ${esc(String(record?.layers??0))} 个顶层图层</small></section>`;
    body.innerHTML=`<h2>手动解决同步冲突</h2><p>这两份作品来自同一个编号，但内容可能不同。
      请选择希望保留的版本；不会自动用修改时间覆盖。</p>
      <div class="sync-version-grid">${row('本机未同步',local)}${row('当前云端',remote)}</div>
      <p role="status" id="conflict-progress">先备份双方版本，再选择处理方式。</p>
      <div class="actions"><button type="button" class="btn" id="conflict-backup">下载双方原始备份</button>
      <button type="button" class="btn primary" id="conflict-both" disabled>双方都保留（推荐）</button>
      <button type="button" class="btn" id="conflict-cloud" disabled>保留云端版</button>
      <button type="button" class="btn" id="conflict-local" disabled>保留本机版</button>
      <button type="button" class="btn" id="conflict-back">返回</button></div>
      <p class="muted">保留本机版会先把当前云端版另存一份，再以本机版更新原作品；
      双方都保留会生成新的独立可编辑作品。没有确认备份时不能执行。</p>`;
    const progress=body.querySelector('#conflict-progress');
    let verifiedBackup=false;
    body.querySelector('#conflict-back').onclick=()=>void openSyncDetails();
    body.querySelector('#conflict-backup').onclick=async()=>{
      try{
        progress.textContent='正在准备原始版本与 SHA-256…';
        const saved=await db.backupSyncConflict(kind,id);
        if(saved.serial!==review.serial||saved.revision!==review.revision)
          throw Error('备份期间版本已变化，请重新比较');
        download(saved.blob,'拾页-同步冲突双版本备份-'+new Date().toISOString().slice(0,10)+'.json');
        verifiedBackup=true;
        for(const button of body.querySelectorAll('#conflict-both,#conflict-local'))
          button.disabled=false;
        // The server may have deleted this record: there is no cloud copy
        // to retain. Never offer a destructive choice with an empty target.
        body.querySelector('#conflict-cloud').disabled=!remote;
        progress.textContent='已发起备份下载（SHA-256：'+saved.sha256.slice(0,16)+'…）。请确认文件已在“文件”中保存。';
      }catch(error){verifiedBackup=false;progress.textContent='备份未完成：'+error.message;}
    };
    for(const [selector,choice] of [['#conflict-both','both'],['#conflict-cloud','cloud'],['#conflict-local','local']]){
      body.querySelector(selector).onclick=async()=>{
        if(!verifiedBackup||!confirm('确认已经在 iPhone“文件”中保存双方原始备份？'))return;
        const label={both:'双方都保留',cloud:'保留云端版',local:'保留本机版'}[choice];
        if(!confirm('确认“'+label+'”？这将改变待同步队列；云端数据变化时会安全拒绝，请重新比较。'))return;
        for(const button of body.querySelectorAll('button'))button.disabled=true;
        try{
          progress.textContent='正在核对版本和原子提交…';
          const result=await db.resolveSyncConflict({kind,id,serial:review.serial,expectedRevision:review.revision,choice});
          if(choice==='cloud'&&state.activeProject?.id===local?.id){
            dirtyProjects.delete(local.id);state.activeProject=null;state.activeDraft=null;
          }
          progress.textContent='已应用“'+label+'”，原始备份仍在手机文件中。';
          modal.close();
          if(choice==='cloud')route('works');
          else void db.flushProjects().catch(error=>toast('冲突已解决，后续同步待重试：'+error.message));
          void refresh({background:true}).catch(error=>console.warn('冲突解决后更新列表待重试',error));
        }catch(error){
          progress.textContent='没有覆盖资料：'+error.message+'。请返回同步详情重新核对版本。';
          body.querySelector('#conflict-back').disabled=false;
        }
      };
    }
  }catch(error){
    body.innerHTML='<h2>无法自动比较版本</h2><p role="alert">'+esc(error.message)+
      '</p><p>本机数据仍保留在待同步队列，可以先导出应急备份。混合操作批次需要单独检查。</p><div class="actions"><button type="button" class="btn" id="conflict-back">返回同步详情</button></div>';
    body.querySelector('#conflict-back').onclick=()=>void openSyncDetails();
  }
}
function exportAppDiagnostics(){
  const report={format:'shiye-app-error-diagnostics',version:2,createdAt:new Date().toISOString(),
    scope:'仅本次打开应用期间的安全摘要；关闭后不保留',
    environment:{mode:cloudEnabled?'cloud':state.selfHosted?'server':'browser',online:navigator.onLine!==false},
    runtime:runtimeIssueSnapshot(),images:imageLoadingSnapshot(),sync:cloudEnabled?db.syncDiagnosticReport({online:navigator.onLine}):null};
  download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),
    '拾页应用错误诊断-'+new Date().toISOString().slice(0,10)+'.json');
  toast('已导出应用错误诊断；不含作品、图片、账号或密钥');
}
function exportSyncDiagnostics(){
  const report=db.syncDiagnosticReport({online:navigator.onLine});
  if(!report){toast('当前不是云端同步模式');return;}
  download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),
    '拾页同步诊断-'+new Date().toISOString().slice(0,10)+'.json');
  toast('已导出本次会话的同步诊断；不含作品、图片、账号标识或原始报错');
}
async function openSyncDetails(){if(!cloudEnabled)return;cloudResumer.suspend();try{
  const details=await db.pendingSyncDetails(),projects=details.projects||[],batches=details.batches||[],local=[...dirtyProjects.values()],total=projects.length+batches.length+local.length,quarantined=details.quarantined||0;
  // Safari uses one generic SyntaxError for many unrelated DOM APIs.
  // Show safe bundle/line coordinates without leaking query params or tokens.
  const errorFrames=(syncDisplay.error?.stack||'').split('\n')
    .flatMap(line=>line.match(/[a-zA-Z0-9_.-]+\.js:\d+(?::\d+)?/g)||[])
    .slice(0,8).join(' → ');
  const rows=[...projects.map(row=>`<li>作品：${esc(row.title)} <small>${esc(row.id)}</small> <button class="btn mini" type="button" data-conflict-kind="project" data-conflict-id="${esc(row.id)}">比较版本</button></li>`),...batches.map(row=>`<li>待传批次 ${esc(row.id)}：${row.items.length} 条变更<ul>${row.items.slice(0,12).map(item=>`<li>${esc(item.store)} · ${esc(item.action)} · ${esc(item.title||item.id)}</li>`).join('')}</ul>${row.items.length===1&&row.items[0]?.store==='projects'&&row.items[0]?.action==='put'?`<button class="btn mini" type="button" data-conflict-kind="batch" data-conflict-id="${esc(row.id)}">比较版本</button>`:''}</li>`),...local.map(row=>`<li>尚未暂存的作品：${esc(row.title||row.id)}</li>`)];
  body.innerHTML=`<h2>同步详情</h2><p>状态：${syncPausedByUser?'已暂停 · 本机修改仍保留':syncDisplay.error?'待重试':syncDisplay.pending||local.length?'上传中':'已同步'}</p><p>最近错误：${esc(syncDisplay.error?describeSyncError(syncDisplay.error):details.error||'无')}</p>${errorFrames?`<details><summary>查看错误位置（用于排查 Safari）</summary><small>${esc(errorFrames)}</small></details>`:''}<p>本机待同步：${total} 项。未上传作品和草稿将保留在本机待同步队列。</p><p>隔离待同步原始记录：${quarantined} 项（禁止自动上传，原始数据未丢弃）。</p><p>已隔离旧版可编辑作品：${db.legacyProjectInfo?.()?.length||0} 件（未删除）。转换工具会同时扫描账号的素材、系列、作品、元数据、图片引用和最近删除。</p><div class="sync-pending-list">${rows.length?`<ul>${rows.join('')}</ul>`:'<p>没有待同步项目。</p>'}</div><div class="actions"><button type="button" class="btn" id="sync-migrate-account">转换旧数据格式</button><button type="button" class="btn" id="sync-backup-legacy-works" ${db.legacyProjectInfo?.()?.length?'':'disabled'}>导出隔离旧作品备份</button><button type="button" class="btn primary" id="sync-retry-now">立即同步</button><button type="button" class="btn" id="sync-pause-local">${syncPausedByUser?'恢复后台重试':'暂停后台重试'}</button><button type="button" class="btn" id="sync-emergency-copy" ${total?'':'disabled'}>导出待同步数据备份</button><button type="button" class="btn danger" id="sync-wipe-everything">彻底清空本账号本机与云端数据</button></div><p>暂停仅停止自动重试，不清空作品、草稿或待上传图片；页面刷新后仍可恢复同步。为防止误删本机唯一副本，已移除直接丢弃待同步作品的操作。</p>`;
  body.querySelector('.actions')?.insertAdjacentHTML('afterbegin','<button type="button" class="btn" id="sync-export-diagnostics">导出详细同步诊断</button>');
  body.querySelector('#sync-export-diagnostics').onclick=exportSyncDiagnostics;
  modal.showModal();modal.addEventListener('close',()=>{if(!syncPausedByUser&&!resetWorkflowActive)void cloudResumer.resume();},{once:true});
  body.querySelectorAll('[data-conflict-kind]').forEach(button=>{
    button.onclick=()=>{void openSyncConflictChoice(button.dataset.conflictKind,button.dataset.conflictId);};
  });
  body.querySelector('#sync-migrate-account').onclick=()=>{void runAccountStorageMigration();};
   body.querySelector('#sync-wipe-everything').onclick=()=>{void handle('reset-all-account-data');};
  body.querySelector('#sync-backup-legacy-works').onclick=()=>{void handle('backup-legacy-projects');};
  body.querySelector('#sync-retry-now').onclick=()=>{syncPausedByUser=false;modal.close();void flushSave().then(()=>{void cloudResumer.resume();return db.flushProjects();}).catch(error=>toast('同步待重试：'+error.message));};
  body.querySelector('#sync-pause-local').onclick=()=>{syncPausedByUser=!syncPausedByUser;if(syncPausedByUser){cloudResumer.suspend();saveStatus('已暂停后台重试 · 本机修改保留');}modal.close();if(!syncPausedByUser)void cloudResumer.resume();};
  body.querySelector('#sync-emergency-copy').onclick=async()=>{
    try{await flushSave();const backup=await db.createEmergencyBackup();if(!(backup instanceof Blob)||!backup.size)throw Error('应急备份为空');download(backup,'拾页-待同步应急备份-'+new Date().toISOString().slice(0,10)+'.shiyerecovery');toast('已导出含原始字节的待同步应急备份，请妥善保存');}
    catch(error){toast('导出应急备份失败：'+error.message);}
  };
 }catch(error){console.warn('同步详情读取失败',error);recordRuntimeIssue('handled',error,state.route,{phase:'sync-details'});body.innerHTML='<h2>同步详情暂不可用</h2><p>待同步资料没有被清除。仍可导出本次会话的同步诊断。</p><div class="actions"><button type="button" class="btn" id="sync-export-diagnostics">导出详细同步诊断</button></div>';
   body.querySelector('#sync-export-diagnostics').onclick=exportSyncDiagnostics;
   if(!modal.open)modal.showModal();modal.addEventListener('close',()=>{if(!syncPausedByUser&&!resetWorkflowActive)void cloudResumer.resume();},{once:true});
   toast(explainUserError(error,'同步详情读取'));}}
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
// Desktop file drop is equivalent to the regular import path; no drag
// target overlays the editing canvas or iPad/Pencil UI.
document.querySelectorAll('.main-nav button').forEach(b=>b.onclick=()=>{
  if(b.dataset.route==='library'){
    if(['library','series'].includes(state.route))return; // keep current tab
    route(lastMaterialLocation.route||'series',{restoreMaterial:true});
  }else route(b.dataset.route);
});
document.querySelector('#top-basket').onclick=()=>route('matching');document.querySelector('#top-settings').onclick=()=>route('settings');
async function init(user,{resetPending=false,afterAccountReset=false}={}){previewPrewarmEpoch++;let cachedShown=false;cloudSessionReady=!resetPending;if(resetPending)cloudResumer.suspend();const accountId=user?.id||'browser';if(state.accountId&&state.accountId!==accountId){matchingScrollMemory=null;Object.assign(lastMaterialLocation,{route:'series',seriesID:'all',libraryTab:'series'});parity.libraryTab='series';deferredSyncedPreferences=null;deferredSyncedAISettings=null;clearTimeout(matchingDefaultsTimer);matchingDefaultsTimer=null;matchingDefaultsPending=false;matchingDefaultsLocalEdited=false;cloudMatchingDefaults=null;assetOrganization.clear();clearJournalTemplateImages();clearJournalPresetImages();state.userTemplates=[];}state.accountId=accountId;try{
  await db.storageMode();state.selfHosted=db.isSameOriginServer();
  // startCloudSession has validated Auth and the allowlist before this runs.
  const cached=await db.cachedCollections();if(cached){Object.assign(state,cached);state.accountId=accountId;await restorePendingProjects();for(const a of state.assets)if(a.staticPath)staticSources.set(a.blobId,a.staticPath);render();cachedShown=true;saveStatus('本机缓存 · 正在核对云端');if(!resetPending)prewarmOtherPages();}
  const initialSync=await db.refreshCloud();if(initialSync?.changed)privateImages.invalidate(initialSync.allBlobs?undefined:initialSync.blobIDs);await refresh({background:cachedShown,skipCloudRefresh:true});if(!resetPending)prewarmOtherPages();if(!resetPending&&!afterAccountReset)void purgeExpiredTrash();await matchingSession.restore();if(cloudMatchingDefaults)applyMatchingDefaults(state,cloudMatchingDefaults);editableImportReady=true;void consumeEditableHandles();if('serviceWorker' in navigator&&location.protocol==='https:'){
    void import('./app-update.js').then(({registerSafeUpdate})=>registerSafeUpdate({
      flushLocal:flushSave,
      isBusy:()=>!!(state.importProcessing||state.aiBusy||savingProjects||dirtyProjects.size),
      onError:error=>toast('更新未完成，当前页面和资料保持不变：'+error.message)
    })).catch(error=>console.warn('更新检查暂不可用',error));
  }saveStatus((await db.storageMode())==='server'?'已连接服务器':'已保存到本机');if(cloudEnabled){syncDisplay.checking=false;updateSyncIndicator();if(!resetPending)void cloudResumer.wake();else saveStatus('云端已清空 · 正在后台清理旧图片（暂只读）');}
  }catch(e){console.error(e);recordRuntimeIssue('handled',e,state.route,{phase:'auth'});const auth=e.status===401;if(auth)cloudSessionReady=false;
  if(cachedShown&&!auth){saveStatus('云端核对失败 · 缓存仅供查看');toast('云端连接失败，未改为本机保存：'+e.message);if(cloudEnabled)void cloudResumer.wake();return;}
  if(auth){view.innerHTML=`<div class="empty"><strong>连接拾页数据服务器</strong><p>请输入服务器访问令牌；连接失败时不会另存到浏览器。</p><form id="server-login"><input type="password" name="token" required autocomplete="off" placeholder="服务器访问令牌" aria-label="服务器访问令牌"><button class="btn primary" type="submit">连接</button></form><p id="server-login-error">${esc(e.message)}</p></div>`;view.querySelector('#server-login').onsubmit=event=>{event.preventDefault();db.setStorageConfig({url:db.storageConfig()?.url||location.origin,token:event.target.elements.token.value.trim()});init();};}else{view.innerHTML=`<div class="empty"><strong>无法读取资料</strong><p>${esc(e.message||'请检查设备剩余空间和数据服务连接。')}</p><button class="btn" id="storage-retry">重试连接</button></div>`;view.querySelector('#storage-retry').onclick=()=>init();}saveStatus('存储不可用');}}
mountIcons(document);
const matchingSession=createMatchingSession({state,db,uid,esc,asset,modelImage,rasterize,workCover:p=>{const d=p.drafts.find(d=>d.id===p.activeDraftID)||p.drafts[0];return `<div class="thumb-sheet" style="--thumb-ratio:${d.canvas.width/d.canvas.height};background:${esc(d.paperColor||'#fff')}"><div class="thumb-inner" style="position:relative">${p.isSnapshot?`<img src="${image(p.snapshotBlobId)}" alt="${esc(p.title)} 快照">`:workCover(d,false,true,p.id)}</div></div>`;},createProject:()=>createMatchingProject(),saveSnapshotFromDraft:saveProjectSnapshot,saveGeneratedImageSnapshot,generatePageImage,runCreativeAgent,createAIRecorder,supportsVision,flushSave,route,handle,mountIcons,toast});
startCloudSession(init).catch(error=>{recordRuntimeIssue('handled',error,state.route,{phase:'auth'});document.querySelector('#app').hidden=true;const p=document.createElement('p');p.textContent='无法连接认证服务，请稍后刷新。未打开私人资料。';document.body.append(p);console.warn(error.name);});
import {createMatchingSession} from './matching-session.js';
