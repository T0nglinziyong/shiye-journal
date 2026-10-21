import {normalizeMatchingDirection} from './matching-directions.js';
import {automaticAssetClassification} from './asset-automatic-classification.js';
import {importDefaultTitle} from './import-default-names.js';
// Production deployment refresh marker: 2026-10-04
import {materialKindName} from './material-taxonomy.js';
import {createElement} from 'react';
import {BlankProjectDialog,ManualLayoutDialog,HelpDialog,OfflineImportDialog,MaterialPickerDialog,CreativeJSONDialog} from './react-utility-dialogs.jsx';
import {SyncDetailsDialog,SyncErrorDialog,SyncMigrationDialog} from './react-sync-dialogs.jsx';
import {OfflineHandoffLoading,OfflineHandoffReady,PreConflictDialog} from './react-offline-handoff.jsx';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {CutoutLoadingPanel,CutoutLoadError} from './react-cutout-loading.jsx';
import {AccountResetProgress} from './react-account-reset.jsx';
import {eraseSiteAppData} from './account-data-wipe.js';
import {observedResetKey} from './account-reset-epoch.js';
import {cloudApiRequest} from './cloud-api-origin.js';
import {renderLoginGate} from './react-cloud-auth.jsx';
const sceneRuntime=()=>import('./scene-renderer.js');
const renderSceneCanvas=async(...args)=>(await sceneRuntime()).renderSceneCanvas(...args);
const decodeSceneImage=async(...args)=>(await sceneRuntime()).decodeSceneImage(...args);
import {sceneLayerEntries,attachSceneV2,moveSceneNode,groupSceneLayers,ungroupSceneLayers,findSceneNode,assertSceneEditable,validateVectorMask} from './scene-model.js';
import {copySceneLasso,deleteSceneLasso,mergeSceneLasso,sceneLassoBounds} from './scene-lasso.js';
import {selectionGroupID,duplicateSceneGroup,deleteSceneGroup} from './scene-selection-actions.js';
import {planSceneCut,rejoinMaterialPieces,restoreSceneMasks} from './scene-cut-ops.js';
import {silhouetteFromImage} from './raster-silhouette.js';
import {createTapeStrip,reshapeTapeStrip,tapeDimensions} from './tape-strip.js';
import {beginSceneEditSession,acceptSceneEditStep,stepSceneEditSession,sceneEditSessionChanged} from './scene-edit-session.js';
import {pinProjectMaterialImages} from './scene-material-references.js';
import {arrangeSceneSelection} from './scene-arrangement.js';
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
import './tape-ui.css';
import './mobile-material-ui.css';
import './ui-consistency.css';
import {createAssetOrganization} from './asset-organization.js';
import {AssetOrganizationContext} from './react-organization.jsx';
import {classificationQueue} from './classification-queue.js';
import {mountIcons,iconMarkup} from './icons.js';
import {startCloudSession} from './entry.js';
import {cloudClient,cloudEnabled,cloudRealtime,cloudRealtimeEnabled,requireCloudUser} from './cloud-session.js';
import {startCloudRevisionRealtime} from './cloud-revision-realtime.js';
import {createSyncResumer} from './sync-resumer.js';
import {describeSyncError} from './sync-browser-compat.js';
import {explainUserError} from './user-facing-error.js';
import {setCloudProjectPreview} from './cloud-store.js';
import {snapshotDraft} from './draft-snapshot.js';
import {recordSceneOperation,makeAutoSceneSnapshot,restoreAutoSceneSnapshot,currentSceneDraft,copySceneBaseline} from './scene-persistence.js';
import {projectSemanticFingerprint} from './project-semantic.js';
import {forkConflictingEditableWork} from './sync-conflict-copy.js';
import {retireSplitPiece} from './material-split.js';
import {readAlphaMask,extractAlphaMask} from './alpha-mask-blob.js';
import {renderHighResolutionCutout} from './cutout-full-resolution.js';
import {materialStorageBlobs} from './material-storage-resolution.js';
import {sha256Hex} from './task-fingerprint.js';
import {checkpointEditorHistory,ensureEditorHistory,resetEditorHistory,takeEditorHistoryStep} from './editor-history-scope.js';
import {captureHistory,restoreHistoryDraft,renameHistory,deleteDraft,historyTitle} from './project-history.js';
import {newEditorSession,editorSessionHasEdits} from './editor-session-policy.js';
import {editorExitDecision} from './editor-exit-policy.js';
import {closePopover} from './swift-popover.js';
import {defaultTools,configureShape} from './editor-tools-model.js';
import {replaceSceneMaterial} from './scene-advanced-ops.js';
import {createWorkCoverBackfill} from './work-cover-backfill.js';
import {renderWorkCoverSnapshot} from './work-cover-snapshot.js';
import {createLocalWorkCovers} from './work-cover-local-cache.js';
import {foregroundIsIdle,foregroundRecentlyActive,scheduleForegroundIdle,yieldToForeground} from './foreground-idle.js';
import {imagePlaceholder,mountPrivateImages} from './lazy-private-images.js';
import {recordImageLoading,imageLoadingSnapshot} from './image-loading-diagnostics.js';
import {assetEditorValue} from './asset-editor.js';
import {AssetEditorDialog} from './react-asset-editor.jsx';
import {createAIRecorder,publicAIDiagnosticReport} from './ai-diagnostics.js';
import {saveImportBatch,importPaperDimensions} from './import-save.js';
import {paperDimensions as presetPaperDimensions} from './paper-sizes.js';
import {refineManualBoxes,hasManualForegroundEvidence,manualSegmentationMethod} from './manual-import-recognition.js';
import {manualPhysicalRegion} from './manual-import-geometry.js';
import {seriesCovers,markProjectAssetsUsed,usedAssetIDs} from './library-model.js';
import {clearSeriesContentFilters,snapshotSeriesContentFilters,restoreSeriesContentFilters} from './series-contents.js';
import {libraryPageData} from './library-page-data.js';
import {SeriesEditorDialog} from './react-series-editor.jsx';
import {parseTags} from './library-model.js';
import {mountWorkflowControls,refreshWorkPreviews,exportMaterials,runSeriesBatchAction,runWorkBatchAction} from './workflow-ui.js';
import {runAssetBatchAction} from './library-selection-ui.js';
import {showCutoutEditor} from './cutout-editor.js';
import {decodeImageBlob} from './image-blob-decoder.js';
import {COVER_EDGE} from './image-variants.js';
import {loadModelImageSource} from './model-image-source.js';
import * as db from './store.js';
import {loadPreferences,savePreferences,migrateStoredPreferences} from './preferences.js';
import {cloudPreferencesRecord,cloudPreferencesFromMeta} from './cloud-preferences.js';
import {cloudAISettingsRecord,cloudAISettingsFromMeta} from './cloud-ai-settings.js';
import {cloudMatchingSettingsRecord,cloudMatchingSettingsFromMeta,applyMatchingDefaults} from './cloud-matching-settings.js';
import {uid,canvasSize,draft,project,itemFromAsset,physicalPlacement,validatePhysicalDraft,textBlock,primitive,setDraftPaperSize} from './domain.js';
import {detectPaperCandidates,cropBitmap,alignMaterialPreview} from './image.js';
import {filterAutomaticMaterialBoxes} from './automatic-material-size-filter.js';
import {estimatePageLighting} from './material-color-restoration.js';
import {extractEditableCandidateRGB} from './import-candidate-color.js';
import {boundedMap} from './bounded-map.js';
import {visionTask,prewarmVision} from './vision-runtime.js';
import {recognitionPixelOptions,recognitionMethodDetails,recognitionProfile} from './recognition-profiles.js';
import {classifyRecord} from './classification.js';
import {resetPaperCorrection} from './paper-ui.js';
import {rectifyA4Frame,suggestPaperCorners} from './perspective.js';
import {analysisPixels,decodeRecognitionImage,sourcePixels} from './recognition-raster.js';
import {isUntouchedLegacyExample} from './legacy-builtins.js';
import {applyToolCalls,validateScenePhysical} from './creative.js';
import {loadOfflineMaterialCover,mapOfflineExportLimited,prepareOfflineMaterialPreview,prefetchOfflineImportImages} from './offline-export-assets.js';
import {buildMaterialScope} from './matching-materials.js';
import {addMatchingFromLibrary,addMatchingFromRecommendation} from './matching-selection.js';
import {matchingRecommendations} from './matching-view.js';
import {captureMatchingScroll,restoreMatchingScroll} from './matching-scroll.js';
import {restoreRouteScroll} from './navigation-scroll.js';
import {createMainNavigation,mainSection} from './main-navigation.js';
import {selectJournalReferenceCases,loadJournalReferenceCases} from './journal-reference-catalog.js';
import {clearJournalPresetImages} from './journal-preset-images.js';
import {changeTrash,expiredTrash} from './trash-actions.js';
import {visibleMaterials} from './asset-retention.js';
// AI agent planning and visual review are paid, optional workflows. Load them only on demand.
const runCreativeAgent=async(...args)=>(await import('./creative-runner.js')).runCreativeAgent(...args);
import {creativeRunParameters,createCreativeRunGuard,prepareCreativeRunInputs,creativeProgressText,hasCreativeSceneChange,createCreativeCheckpoint} from './ai-creation-session.js';
import {materialAliases} from './material-alias.js';
import {snapshotRecord,workInTab} from './work-collections.js';
import {generatePageImage} from './ai-image-generation.js';
import {clipMaterial,materialMaskGeometry} from './material-mask.js';
import {manualLayoutChoices,applyManualLayout} from './manual-layout-templates.js';
import {exportSceneDocument,importSceneDocument} from './scene-io.js';
import {resetCatalogPage,clearCatalogPages,snapshotCatalogPages,restoreCatalogPages} from './catalog-pagination.js';
import {AI_PROVIDERS,supportsVision,loadAISettings,saveAISettings} from './ai-settings.js';
import {classifyCreationFile} from './creation-methods.js';
import {readClipboardText} from './clipboard-text.js';
import {parity} from './parity-ui.js';
import {journalTemplateRecords,clearJournalTemplateImages} from './journal-template-data.js';
import {syncSelectionScope,reconcileSelectedRecords,finishSelection,toggleSelection,beginSelection} from './library-selection-model.js';
import {canApplyBackgroundView,shouldPullCloudForRoute,canPollDuringEditing,shouldRepaintForCollections} from './view-update-policy.js';
import {createActionStore} from './ui-action-store.js';
import {createPageControllerHost} from './page-controller-host.js';
import {createLibraryController,registerLibraryActions} from './page-controllers/library-controller.js';
import {createWorksController,registerWorksActions} from './page-controllers/works-controller.js';
import {createImportController,registerImportActions} from './page-controllers/import-controller.js';
import {createEditorController,registerEditorActions} from './page-controllers/editor-controller.js';
import {createSettingsController,registerSettingsActions} from './page-controllers/settings-controller.js';
import {createMatchingController,registerMatchingActions} from './page-controllers/matching-controller.js';
import {mountReactShell,renderReactPage,unavailableRoute,setShellActions,updateShell,openOverlay,closeOverlay} from './react-shell.jsx';
import {ProjectMetadataDialog} from './react-project-metadata.jsx';
import {LibraryPage,SeriesPage,SeriesContentsPage,WorksPage,RecentlyDeletedPage,JournalTemplatesPage,MatchingPage,EditorPage,AssetDetailPage,ProjectPreviewPage,SettingsHomePage,SettingsDisplayPage,SettingsRecognitionPage,SettingsDataPage,SettingsAIPage,ImportSimplePage,ImportReviewPage,ImportInspectionPage,getEditorFabricCanvas} from './react-routes.jsx';

import {installRuntimeDiagnostics,recordRuntimeIssue,runtimeIssueSnapshot} from './runtime-diagnostics.js';
import {pendingUnsavedInputs} from './unsaved-inputs.js';
mountReactShell();
if('scrollRestoration' in history)history.scrollRestoration='manual';
const view=document.querySelector('#view'),modal=document.querySelector('#modal'),body=document.querySelector('#modal-body');
modal.querySelector('.modal-close').onclick=()=>modal.close();
const fileInput=document.querySelector('#file-input'),workFileInput=document.querySelector('#work-file-input'),snapshotFileInput=document.querySelector('#snapshot-file-input'),creationResultInput=document.querySelector('#creation-result-input'),backupInput=document.querySelector('#backup-input'),emergencyInput=document.querySelector('#emergency-input');
let offlineSnapshotProject=null;
installRuntimeDiagnostics(()=>state.route);
const state={route:'series',assets:[],series:[],projects:[],trash:[],userTemplates:[],basket:[],excludedAssetIDs:[],history:[],selected:null,activeProject:null,activeDraft:null,offlineEditingReturnID:null,detailAssetID:null,previewProjectID:null,settingsSection:null,selfHosted:false,aiSettings:loadAISettings(),preferences:loadPreferences(),aiPanel:false,aiBusy:false,aiPrompt:'',aiProgress:'',tool:'select',zoom:1,sort:'newest',query:'',kind:'all',status:'all',seriesID:'all',matchCore:null,matchRatio:'a4',matchMode:'single',matchStyle:'随材而定',matchStyles:['随材而定','自动安排'],matchPurposes:['自由创作'],matchIntent:'',matchContentPolicy:'original',matchPurpose:'自由创作',recommendFilter:'全部',coreIDs:[],importStep:'inspect',importRecords:[],importIndex:0,importFile:null,importBitmap:null,importBox:{x:0,y:0,w:1,h:1},importCandidate:null,importRemoveWhite:false,undo:[],redo:[],drawing:false};
// Action changes are published independently of their DOM representation.
const actionStore=createActionStore(state);
actionStore.register('app/action',async({action,id,value})=>({result:await runAppAction(action,id,value)}));
// Safari's native page pinch must not compete with the editor's bounded canvas zoom.
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,event=>event.preventDefault(),{passive:false});
const urls=new Map(),staticSources=new Map();
function cutGeometryOnCanvas(draft){
  const canvas=getEditorFabricCanvas(draft.id),objects=new Map();
  const visit=object=>{if(['material','shape'].includes(object.sceneType))
    objects.set(object.sceneID,object);
    for(const child of object.getObjects?.()||[])visit(child);
  };
  for(const object of canvas?.getObjects()||[])visit(object);
  const entries=sceneLayerEntries(draft,{hidden:true});
  // Keep the cutting source rectangular. A screen-sized alpha thumbnail is
  // unsuitable as a physical source contour: JPEG edges, holes and scaling
  // can create thousands of tiny polygons and fail on mobile Safari.
  const assets=state.assets;
  const shapeOutlines={};
  for(const entry of entries){
    const node=entry.value,object=objects.get(node.id);
    if(node.type!=='shape'||!(node.id===state.selected||
      entry.parents.some(parent=>parent.id===state.selected))||!object?.toCanvasElement)continue;
    try{
      const clip=object.clipPath;object.clipPath=null;
      let bitmap;try{bitmap=object.toCanvasElement({multiplier:Math.min(1,
        192/Math.max(node.width,node.height))});}finally{object.clipPath=clip;}
      const outline=silhouetteFromImage(bitmap);
      if(outline?.length&&outline.flat(2).length<800)shapeOutlines[node.id]=outline;
    }catch(error){console.warn('图形轮廓使用矢量路径',node.id,error);}
  }
  return {assets,shapeOutlines};
}
const assetOrganization=createAssetOrganization();
function openLibraryAsset(id){state.detailAssetID=id;const selected=asset(id);if(selected?.blobId)privateImages.focus(selected.blobId);route('assetDetail');}
function libraryBack(){navigateBack('library');}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=s=>{const el=document.querySelector('#toast');el.textContent=/can't find variable|is not defined|undefined is not an object|blob:|expected magic word/i.test(String(s))?explainUserError(s):s;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3500);};
let lastSaveStatus;
const saveStatus=s=>{const label=cloudEnabled?({'已保存到本机':'已保存到云端','本机存储':'云端存储'}[s]||s):s;
  if(label===lastSaveStatus)return;lastSaveStatus=label;
  updateShell({saveStatus:label});for(const el of document.querySelectorAll('.swift-auto-saved'))el.textContent=label;};
const syncDisplay={pending:0,error:null,conflicts:0,uploading:false,progress:null,checking:true,localPending:false};
let lastSyncView;
function updateSyncIndicator(){
  if(!cloudEnabled)return;
  const conflict=syncDisplay.conflicts>0||/云端版本已变化|另一设备已更新|conflict/i.test(syncDisplay.error?.message||'');
  const status=conflict?'conflict':navigator.onLine===false&&syncDisplay.pending?'offline':syncDisplay.uploading?'uploading':syncDisplay.error?'error':syncDisplay.checking?'checking':syncDisplay.pending||syncDisplay.localPending?'pending':'synced';
  const label={conflict:'同步冲突',error:'待重试',offline:'待联网',checking:'核对中',uploading:'上传中',pending:'待同步',synced:'已同步'}[status];
  const progress=syncDisplay.progress;
  const sync={status,label,title:conflict?'其他设备修改了同一资料；本机待传内容仍保留，请先检查其他设备':status==='error'?'上传未完成；点击重试：'+syncDisplay.error.message:
    status==='uploading'&&progress?`上传中 · ${progress.phase} ${progress.done}/${progress.total} 项`:label};
  const signature=JSON.stringify(sync);if(signature===lastSyncView)return;
  lastSyncView=signature;updateShell({sync});
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
const retainFabricAssets=ids=>privateImages.retain(ids.map(id=>asset(id)?.blobId||id)
  .filter(id=>typeof id==='string'&&id&&!id.startsWith('/')));
let previewPrewarmEpoch=0;
function visibleCoversReady(){
  return [...view.querySelectorAll('img[data-asset-image-id]')].every(img=>{
    const box=img.getBoundingClientRect();
    return box.bottom<=0||box.top>=innerHeight||box.right<=0||box.left>=innerWidth||
      img.complete&&img.naturalWidth>1&&!img.src.includes('#shiye-image=');
  });
}
function prewarmOtherPages(){
  const epoch=++previewPrewarmEpoch;
  if(!cloudEnabled||navigator.connection?.saveData||state.route!=='library')return;
  // Only the next two covers on this route are useful. Startup used to fetch
  // eight arbitrary assets and four work covers before the visible page had
  // finished, competing with the images the user was trying to see.
  const ids=libraryPageData(state).nextItems.filter(a=>!a.staticPath).map(a=>a.blobId);
  let index=0;
  let waits=0;
  const next=()=>{
    if(epoch!==previewPrewarmEpoch||state.route!=='library'||index>=ids.length||document.visibilityState!=='visible')return;
    if(!visibleCoversReady()){if(++waits<25)setTimeout(next,400);return;}
    const run=()=>{
      if(epoch!==previewPrewarmEpoch||state.route!=='library'||document.visibilityState!=='visible'||!visibleCoversReady())return;
      void privateImages.load(ids[index++],false,{background:true}).catch(()=>{}).finally(()=>{
        if(epoch===previewPrewarmEpoch)setTimeout(next,300);
      });
    };
    if('requestIdleCallback' in window)requestIdleCallback(run);
    else setTimeout(run,250);
  };
  setTimeout(next,700);
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
  backgroundYield:yieldToForeground,
  createBitmap:blob=>createImageBitmap(blob),
  getSnapshot:async id=>(await db.get('blobs',id))?.data||null
});
const localWorkCovers=createLocalWorkCovers({
  state,loadDocument:p=>db.completeProject(p),renderCover:renderLocalCoverBlob,
  hasUsableCover:p=>{const draft=p.drafts?.find(item=>item.id===p.activeDraftID)||p.drafts?.[0];
    const id=draft?.coverImageID||draft?.coverBlobId;
    const src=id?image(id):'';
    return !!src&&!src.startsWith('data:image/svg+xml,');},
  onReady:(p,url)=>{
    const actual=state.projects.find(item=>item.id===p.id)||
      state.trash.find(entry=>entry.kind==='project'&&entry.item.id===p.id)?.item;
    if(!actual||actual.updatedAt!==p.updatedAt)return;
    // Once the COS reference is committed, it remains the preferred source.
    if(!['works','projectPreview'].includes(state.route))return;
    window.dispatchEvent(new CustomEvent('shiye-react-cover-update',{detail:{projectID:p.id}}));
  },
  onError:(_message,id,error)=>{
    console.warn('本地封面暂不可用',id,error);
    if(['works','projectPreview'].includes(state.route))window.dispatchEvent(new CustomEvent('shiye-react-cover-update',{
      detail:{projectID:id,error:'封面正在重试，请稍候'}}));
  }
});
const workCoverBackfill=createWorkCoverBackfill({db,state,cloudEnabled});
// Cover loading never steals a Works card click: opening a card always edits it.
window.addEventListener('shiye-work-cover-failed',event=>{
  const project=state.projects.find(row=>row.id===event.detail?.projectID);
  if(project)scheduleForegroundIdle(()=>{
    if(['works','projectPreview'].includes(state.route))void localWorkCovers.ensure(project).catch(()=>{});
  },{minIdleMs:1200});
});

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
  void privateImages.load(coverImageID,false,{background:true}).then(()=>{
    if(state.route!=='works'&&state.route!=='projectPreview')return;
    const project=state.projects.find(row=>row.id===projectID);
    if(!project||project.updatedAt!==updatedAt)return;
    window.dispatchEvent(new CustomEvent('shiye-react-cover-update',{detail:{projectID}}));
  }).catch(error=>console.warn('COS 封面显示待重试',error));
});
let settingsSession=null,deferredSyncedPreferences=null,deferredSyncedAISettings=null;
view.addEventListener('input',event=>{
  if(state.route==='settings'&&settingsSession&&event.target.matches('input,textarea,select'))
    settingsSession.dirty=true;
},true);
view.addEventListener('change',event=>{
  if(state.route==='settings'&&settingsSession&&event.target.matches('input,textarea,select'))
    settingsSession.dirty=true;
},true);
function captureSettings(){
  if(state.route!=='settings')return;
  if(view.querySelector('#setting-ai-provider'))state.aiSettings=readAIForm();
  if(view.querySelector('#setting-paper-size'))state.preferences={...state.preferences,recognition:view.querySelector('#setting-recognition').value,candidateDiscovery:view.querySelector('#setting-candidate-discovery')?.value||'unified',recognitionPixels:Number(view.querySelector('#setting-recognition-pixels').value),materialColorMode:view.querySelector('#setting-material-color')?.value||'auto',balanceLight:view.querySelector('#setting-preprocess-light').checked,recognitionDenoise:view.querySelector('#setting-preprocess-denoise').checked,recognitionLocalContrast:view.querySelector('#setting-preprocess-contrast').checked,recognitionChromaEdges:view.querySelector('#setting-preprocess-chroma').checked,recognitionShapeRegularization:view.querySelector('#setting-postprocess-shapes').checked,recognitionApertures:view.querySelector('#setting-postprocess-apertures').checked,mergeSharedCarrier:view.querySelector('#setting-merge-carrier').checked,paperSize:view.querySelector('#setting-paper-size').value,orientation:view.querySelector('#setting-orientation').value,wholePaper:view.querySelector('#setting-whole-paper').checked,autoOrganize:view.querySelector('#setting-auto-organize').checked,autoOrganizeWorks:view.querySelector('#setting-auto-organize-works')?.checked!==false};
  if(view.querySelector('#setting-display'))state.preferences={...state.preferences,display:view.querySelector('#setting-display').value,backdrop:view.querySelector('#setting-backdrop').value,maxPageItems:Number(view.querySelector('#setting-page-items').value)};
}
const routeScroll=new Map();
const mainNavigation=createMainNavigation();
const mainRoute=name=>mainSection(name,state.importMode);
function navigateMain(target){
  if(target==='library'&&['series','library'].includes(state.route))return;
  if(target===state.route)return;
  if(mainRoute(state.route)===target){
    if(target==='library')navigateBack('library');
    else route(target);
    return;
  }
  const snapshot=mainNavigation.last(target,validNavigation);
  if(snapshot)route(snapshot.route,{restoreSnapshot:snapshot});
  else route(target==='library'?'series':target);
}
let cancelRouteScroll=()=>{};
const routeScrollKey=name=>[name,state.seriesID,
  name==='library'?parity.libraryTab:'',name==='works'?parity.workTab:'',
  name==='assetDetail'?state.detailAssetID:'',
  name==='projectPreview'?state.previewProjectID:'',
  name==='editor'?state.activeProject?.id:''].join(':');
let matchingScrollMemory=null;
let viewInteractionRevision=0;
let lastViewInputAt=0;
for(const event of ['click','input','pointerdown'])view.addEventListener(event,()=>{
  viewInteractionRevision++;lastViewInputAt=Date.now();},true);
window.addEventListener('scroll',()=>{lastViewInputAt=Date.now();},{passive:true});
view.addEventListener('scroll',()=>{lastViewInputAt=Date.now();},true);
let backgroundViewPending=false,backgroundViewTimer=null;
const activeViewPointers=new Set();
view.addEventListener('pointerdown',event=>activeViewPointers.add(event.pointerId),true);
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,e=>{activeViewPointers.delete(e.pointerId);scheduleBackgroundReconcile();},true);
function scheduleBackgroundReconcile(){
  if(!backgroundViewPending||backgroundViewTimer)return;
  backgroundViewTimer=setTimeout(()=>{
    backgroundViewTimer=null;
    const idleMS=Date.now()-lastViewInputAt;
    if(idleMS<900){scheduleBackgroundReconcile();return;}
    const inputFocused=view.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select,[contenteditable],[contenteditable="true"]');
    if(canApplyBackgroundView({route:state.route,selectionMode:parity.selectionMode,modalOpen:modal.open,popoverOpen:!!document.querySelector('.swift-popover'),inputFocused,gestureActive:!!activeViewPointers.size,idleMS}))render();
  },180);
}
document.addEventListener('click',scheduleBackgroundReconcile);
document.addEventListener('focusout',scheduleBackgroundReconcile);
modal.addEventListener('close',scheduleBackgroundReconcile);
let navigationScope=null;
const navigationRoutes=new Set(['series','library','assetDetail','matching','works','projectPreview','editor','settings','import','trash','templates']);
function captureNavigation(scrollY=window.scrollY){return {
  route:state.route,seriesID:state.seriesID,detailAssetID:state.detailAssetID,
  previewProjectID:state.previewProjectID,activeProjectID:state.activeProject?.id||null,
  activeDraftID:state.activeDraft,query:state.query,kind:state.kind,status:state.status,
  sort:state.sort,libraryRecent:!!state.libraryRecent,libraryTab:parity.libraryTab,
  workTab:parity.workTab,workFilters:parity.workFilters||null,
  seriesQuery:parity.seriesQuery||'',seriesSort:parity.seriesSort||'recent',
  seriesAscending:!!parity.seriesAscending,seriesFilters:snapshotSeriesContentFilters(),
  selectionMode:parity.selectionMode,selected:[...parity.selected],
  showOnlySelected:parity.showOnlySelected,pages:snapshotCatalogPages(),scrollY
};}
function navigationEntry(snapshot,depth){return {shiyeNavigation:{scope:navigationScope,depth,snapshot}};}
function rememberNavigation(){
  const entry=history.state?.shiyeNavigation;
  if(navigationScope&&entry?.scope===navigationScope)
    history.replaceState(navigationEntry(captureNavigation(),entry.depth),'');
}
let navigationSaveTimer=null;
function scheduleNavigationSnapshot(){
  if(navigationSaveTimer)return;
  navigationSaveTimer=setTimeout(()=>{navigationSaveTimer=null;rememberNavigation();},180);
}
for(const event of ['input','change','click'])view.addEventListener(event,scheduleNavigationSnapshot,true);
window.addEventListener('scroll',scheduleNavigationSnapshot,{passive:true});
window.addEventListener('pagehide',rememberNavigation);
function validNavigation(snapshot){
  if(!snapshot||!navigationRoutes.has(snapshot.route))return false;
  if(snapshot.route==='assetDetail'&&!asset(snapshot.detailAssetID))return false;
  if(snapshot.route==='projectPreview'&&!state.projects.some(p=>p.id===snapshot.previewProjectID))return false;
  if(snapshot.route==='editor'){
    const project=state.projects.find(p=>p.id===snapshot.activeProjectID);
    if(!project?.drafts?.length)return false;
  }
  if(snapshot.route==='import'&&!state.importRecords.length)return false;
  if(snapshot.route==='library'&&snapshot.seriesID!=='all'&&snapshot.seriesID!=='none'&&
    !state.series.some(series=>series.id===snapshot.seriesID))return false;
  return true;
}
function applyNavigation(snapshot){
  state.seriesID=snapshot.route==='series'?'all':snapshot.seriesID||'all';
  state.detailAssetID=snapshot.detailAssetID||null;
  state.previewProjectID=snapshot.previewProjectID||null;
  state.query=snapshot.query||'';state.kind=snapshot.kind||'all';
  state.status=snapshot.status||'all';state.sort=snapshot.sort||'newest';
  state.libraryRecent=!!snapshot.libraryRecent;
  parity.libraryTab=snapshot.libraryTab||'series';parity.workTab=snapshot.workTab||'all';
  parity.workFilters=snapshot.workFilters||null;
  parity.seriesQuery=snapshot.seriesQuery||'';parity.seriesSort=snapshot.seriesSort||'recent';
  parity.seriesAscending=!!snapshot.seriesAscending;
  restoreSeriesContentFilters(snapshot.seriesFilters);
  parity.selectionMode=snapshot.selectionMode||null;
  parity.selected=new Set(snapshot.selected||[]);
  parity.showOnlySelected=!!snapshot.showOnlySelected;
  restoreCatalogPages(snapshot.pages);
  reconcileSelectedRecords(parity,state);
  if(snapshot.route==='editor'){
    state.activeProject=state.projects.find(p=>p.id===snapshot.activeProjectID);
    state.activeDraft=state.activeProject?.drafts?.some(d=>d.id===snapshot.activeDraftID)
      ?snapshot.activeDraftID:state.activeProject?.activeDraftID;
  }
}
function activateNavigation(){
  const scope=(cloudEnabled?'cloud':'browser')+':'+state.accountId;
  if(navigationScope===scope)return;
  navigationScope=scope;
  const entry=history.state?.shiyeNavigation;
  if(entry?.scope===scope&&validNavigation(entry.snapshot))
    route(entry.snapshot.route,{back:true,restoreSnapshot:entry.snapshot});
  else history.replaceState(navigationEntry(captureNavigation(),0),'');
}
window.addEventListener('popstate',event=>{
  if(!navigationScope)return;
  const entry=event.state?.shiyeNavigation;
  if(entry?.scope===navigationScope&&validNavigation(entry.snapshot))
    route(entry.snapshot.route,{back:true,restoreSnapshot:entry.snapshot});
  else{
    state.seriesID='all';state.detailAssetID=null;state.previewProjectID=null;
    route('series',{back:true});
    history.replaceState(navigationEntry(captureNavigation(),0),'');
  }
});
function navigateBack(fallback='series'){
  const section=mainRoute(state.route);
  if(section&&section===mainRoute(fallback)){
    const snapshot=mainNavigation.back(section,validNavigation);
    if(snapshot){
      // Going back from a series or material detail restores its filters and
      // scroll position, but must not roll back selections made in that detail.
      const currentSelection=parity.selectionMode===snapshot.selectionMode&&
        parity.selectionMode?{selectionMode:parity.selectionMode,selected:[...parity.selected],
          showOnlySelected:parity.showOnlySelected}:null;
      route(snapshot.route,{restoreSnapshot:currentSelection?{...snapshot,...currentSelection}:snapshot,
        replaceHistory:true});return;
    }
    route(section==='library'?'series':section,{replaceHistory:true});
    return;
  }
  const entry=history.state?.shiyeNavigation;
  if(navigationScope&&entry?.scope===navigationScope&&entry.depth>0){rememberNavigation();history.back();return;}
  route(fallback,{back:true,replaceHistory:true});
}
let editorOpenSequence=0,editorSessionBaseline=null;
function route(name,{back=false,restoreSnapshot=null,replaceHistory=false}={}){
  if(state.route==='editor'&&name!=='editor'&&state.cutSession){
    if(sceneEditSessionChanged(state.cutSession)){
      toast('请先在剪刀面板完成或放弃本次操作');return;
    }
    state.cutSession=null;state.cutPreview=null;
  }
  if(state.route==='editor'&&name!=='editor'&&state.inspectorSession){
    if(sceneEditSessionChanged(state.inspectorSession)){
      toast('请先在对象编辑窗口保存或放弃更改');return;
    }
    state.inspectorSession=null;state.fabricInspectorOpen=false;
  }
  cancelRouteScroll();
  mainNavigation.visit(captureNavigation(),name,{back,replaceHistory,importMode:state.importMode});
  if(!back&&!replaceHistory&&name!==state.route)rememberNavigation();
  editorOpenSequence++;
  viewInteractionRevision++;
  const fromSettings=state.route==='settings';
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
  routeScroll.set(routeScrollKey(state.route),window.scrollY);
  if(name==='settings'&&!settingsSession)settingsSession={ai:structuredClone(state.aiSettings),preferences:structuredClone(state.preferences),returnRoute:state.route};
  if(state.route==='settings'&&name!=='settings'&&settingsSession){state.aiSettings=settingsSession.ai;state.preferences=settingsSession.preferences;settingsSession=null;state.settingsSection=null;if(cloudEnabled&&deferredSyncedPreferences)state.preferences=savePreferences(migrateStoredPreferences(deferredSyncedPreferences));if(cloudEnabled&&deferredSyncedAISettings)state.aiSettings=saveAISettings(deferredSyncedAISettings);deferredSyncedPreferences=null;deferredSyncedAISettings=null;}
if(state.route==='editor'&&name!=='editor'&&aiController)aiController.abort(Error('已离开创作页面'));const priorRoute=state.route;if(name==='matching'&&priorRoute!=='matching'&&cloudMatchingDefaults&&!matchingDefaultsPending)applyMatchingDefaults(state,cloudMatchingDefaults);syncSelectionScope(parity,name);state.route=name;
if(name!=='assetDetail')privateImages.focus(null);
actionStore.publish('route/change',{scope:'route',keys:['route'],payload:{from:priorRoute,to:name}});if(name==='import'&&state.importMode!=='snapshot'&&typeof Worker!=='undefined')void prewarmVision().catch(()=>{});if(name==='series'){state.seriesID='all';state.addingToSeries=null;}if(name!=='library')state.addingToSeries=null;if(name!=='settings'&&!fromSettings)state.selected=null;if(restoreSnapshot)applyNavigation(restoreSnapshot);
if(priorRoute!=='editor'&&name==='editor')
  editorSessionBaseline=newEditorSession(state.activeProject,saveVersions);
render();
  // A return from Works/Settings must honor the last matching viewport even
  // if the currently selected series ID has since changed. Nested panes are
  // already restored inside render() from the same snapshot.
  const matchingViewport=name==='matching'&&
    matchingScrollMemory?.account===(state.accountId||'browser')
    ?matchingScrollMemory.scroll.viewport:null;
  const targetScroll=restoreSnapshot?.scrollY??matchingViewport?.top??
    (routeScroll.get(routeScrollKey(name))||0);
  cancelRouteScroll=restoreRouteScroll(view,{left:matchingViewport?.left??0,top:targetScroll});
  if(navigationScope){
    const depth=history.state?.shiyeNavigation?.scope===navigationScope
      ?history.state.shiyeNavigation.depth:0;
    if(replaceHistory)history.replaceState(navigationEntry(captureNavigation(targetScroll),depth),'');
    else if(!back&&name!==priorRoute)history.pushState(
      navigationEntry(captureNavigation(targetScroll),depth+1),'');
  }
  mainNavigation.record(captureNavigation(targetScroll),state.importMode);
  // Do not interrupt an unfinished matching/import workspace with a remote
  // repaint. Pull all queued remote deletions immediately on returning to
  // another page, instead of waiting for the next polling window.
  if(cloudEnabled&&!shouldPullCloudForRoute(priorRoute)&&shouldPullCloudForRoute(name))
    queueMicrotask(()=>backgroundCloudCheck({force:true}));
}
function imgTag(a,priority=false){const src=a&&(image(a.blobId)||a.staticPath),eager=priority===true;return src?`<img data-asset-image-id="${esc(a.id)}" loading="${eager?'eager':'lazy'}" ${eager?'fetchpriority="high" ':''}decoding="async" src="${esc(src)}" alt="${esc(a.title)}">`:'<span>无预览</span>';}
const fmt=n=>Number(n).toFixed(1).replace(/\.0$/,'');
// The creation canvas still owns native controls until its separate engine migration.
view.addEventListener('click',event=>{
  const target=event.target.closest?.('[data-act]');
  if(state.route!=='editor'||!target||!view.contains(target)||target.dataset.reactAction||target.closest('.match-previews'))return;
  void handle(target.dataset.act,target.dataset.id,target.dataset.val);
});
// Every route exposes one controller contract; business commands are
// independent Action/State transitions and can outlive a DOM mount.
const pageControllers=createPageControllerHost();
registerLibraryActions(actionStore,{db,state,asset});
registerWorksActions(actionStore);
registerImportActions(actionStore,{state,saveActiveImportRecord});
registerSettingsActions(actionStore);
registerEditorActions(actionStore,{historyStep});
registerMatchingActions(actionStore,{addMatchingFromRecommendation});
pageControllers.register('library',createLibraryController({
  view,state,parity,actions:actionStore,
  onCatalogChanged:updateLibraryResults
}));
pageControllers.register('works',createWorksController({
  view,parity,actions:actionStore,render,
  onCatalogChanged:()=>window.dispatchEvent(new Event('shiye-works-refresh'))
}));
pageControllers.register('import',createImportController({
  view,state,actions:actionStore,render,
  refreshReact:()=>flushSync(()=>window.dispatchEvent(new Event('shiye-import-refresh'))),
}));
pageControllers.register('editor',createEditorController({
  actions:actionStore,render,view,
  createEditor:()=>{
    markSceneTrackingBaseline(state.activeProject);
    captureHistory(state.activeProject);
    if(!state.canvasTools){let saved={};try{saved=JSON.parse(localStorage.getItem('shiye-canvas-tools-v1'))||{};}catch{}
      state.canvasTools={...defaultTools,...saved};}
  }
}));
pageControllers.register('matching',createMatchingController({
  actions:actionStore,
  updateMatchingRegions,queueDefaults:queueMatchingDefaultsSync
}));
pageControllers.register('settings',createSettingsController({
  actions:actionStore,render
}));
// Collection refresh changes business state. Only this projection subscriber
// requests a view update; cloud/store modules never import UI implementations.
actionStore.subscribe(event=>{
  if(event.scope==='collections')render();
  if(event.type==='library/favorite'){
    const a=asset(event.payload?.id);
    window.dispatchEvent(new Event('shiye-asset-refresh'));
    if(a)toast(a.isFavorite?'已收藏':'已取消收藏');
  }
});
let renderInProgress=false,renderQueued=false;
function render(){
  if(renderInProgress){renderQueued=true;return;}
  renderInProgress=true;
  try{
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
  document.body.classList.toggle('editing',state.route==='editor');document.body.dataset.backdrop=state.preferences.backdrop;updateShell({route:state.route,basketCount:state.basket.length});
  // Controller decides whether React can update the current route in place.
  // Otherwise the route root remounts from current state.
  if(pageControllers.patch(state.route)){backgroundViewPending=false;return;}
  pageControllers.dispose();
  // The controller lifetime has released route-owned observers, gestures,
  // and native editor listeners before replacing their DOM hosts.
  view.workCoverDispose=null;view.localWorkCoverDispose=null;
  view.deletedCoverDispose?.();view.deletedCoverDispose=null;
  view.editorDispose=null;
  view.editorRefresh=null;view.catalogRefresh=null;
  closePopover();
  view.editorLayoutSize={width:window.innerWidth,height:window.innerHeight};
  const materialTab=id=>{
    parity.libraryTab=id;
    if(id==='series'){route('series');return;}
    state.seriesID='all';state.status=id==='pending'?'pendingReview':'all';
    state.libraryRecent=false;state.sort='newest';
    if(id==='trash')finishSelection(parity);
    render();
  };
  const workTab=id=>{
    parity.workTab=id;parity.templateID=null;resetCatalogPage('works');
    if(id==='trash'||id==='templates')finishSelection(parity);
    render();
  };
  const selectionToggle=mode=>{
    toggleSelection(parity,mode);
    window.dispatchEvent(new Event('shiye-selection-refresh'));
  };
  const onBatchAction=(mode,action,value)=>{
    const context={state,view,body,modal,db,render,route,toast,imgTag,asset,refresh,
      download,modelImage,rasterize,openSeriesEditor,flushSave,handle,
      moveProjectsToTrash,assetOrganization,applyAssetClassification,
      matchingSession,exportSelectedMaterials:ids=>exportMaterials({db,asset,download},ids)};
    if(mode==='asset')return runAssetBatchAction(context,parity,action,value);
    if(mode==='series')return runSeriesBatchAction(context,parity,action,value);
    if(mode==='work')return runWorkBatchAction(context,parity,action,value);
    throw Error('未知批量选择类型');
  };
  const onBatchError=error=>toast(error?.message||'批量操作失败');
  const trashPage=kind=>createElement(RecentlyDeletedPage,{kind,state,source:image,
    localCover:p=>localWorkCovers.peek(p),loadLocalCover:p=>localWorkCovers.cached(p),cloudEnabled,
    onCardsChanged:()=>{if(kind!=='project')return;
      view.localWorkCoverDispose?.();
      view.localWorkCoverDispose=localWorkCovers.observe(view);},
    onTabChange:kind==='asset'?materialTab:workTab,
    onTrashChange:async(ids,recover)=>{
      const count=await changeTrash({db,state,ids,recover,awaitStage:awaitTrashStages});
      render();
      toast(recover?`已恢复 ${count} 项`:`已移除 ${count} 项恢复记录`);
    },onError:error=>toast('操作未完成，资料仍在最近删除：'+(error.message||error.name))});
  const reactPage=state.route==='library'&&parity.libraryTab==='trash'&&state.seriesID==='all'
    ?trashPage('asset')
    :state.route==='works'&&parity.workTab==='trash'
    ?trashPage('project')
    :state.route==='works'&&parity.workTab==='templates'
    ?createElement(JournalTemplatesPage,{state,db,viewState:parity,onTabChange:workTab,
      onToast:toast})
    :state.route==='library'&&state.series.some(s=>s.id===state.seriesID)
    ?createElement(SeriesContentsPage,{state,source:image,kindName,format:fmt,onAction:handle,
      selection:parity,onSelectionToggle:selectionToggle,
      onBatchAction,onBatchError,onEditAsset:openDetail,
      onEditSeries:()=>openSeriesEditor(state.seriesID),
      onAddSeries:()=>{state.addingToSeries=state.seriesID;state.seriesID='all';state.query='';
        state.kind='all';state.status='all';state.libraryRecent=false;
        beginSelection(parity,'asset');route('library');}})
    :state.route==='library'
      ?createElement(LibraryPage,{state,source:image,kindName,format:fmt,onAction:handle,
        onPageChange:prewarmOtherPages,tab:parity.libraryTab,onTabChange:materialTab,
        selection:parity,onSelectionToggle:selectionToggle,onBatchAction,onBatchError,
        onEditAsset:openDetail,onFilter:(key,value)=>actionStore.dispatch({type:'library/filter',payload:{key,value}})})
    :state.route==='works'
      ?createElement(WorksPage,{state,projects:state.projects,isUntouchedLegacyExample,assets:state.assets,
        localCover:p=>localWorkCovers.peek(p),loadLocalCover:p=>localWorkCovers.cached(p),cloudEnabled,source:image,onAction:handle,
        tab:parity.workTab,onTabChange:workTab,
        selection:parity,onSelectionToggle:selectionToggle,onBatchAction,onBatchError,
        onEditWork:id=>{state.previewProjectID=id;openProjectMetadata();},viewState:parity,
        configuredPageSize:state.preferences.maxPageItems,
        onCardsChanged:()=>{
          view.catalogRefresh?.();
          view.workCoverDispose?.();view.localWorkCoverDispose?.();
          view.workCoverDispose=workCoverBackfill.observe(view);
          view.localWorkCoverDispose=localWorkCovers.observe(view);
        }})
    :state.route==='series'
    ?createElement(SeriesPage,{series:state.series,assets:state.assets,display:state.preferences.display,
      account:state.accountId||'browser',
      seriesCovers,source:image,onAction:handle,selection:parity,
      pageSize:state.preferences.maxPageItems,
      onSelectionToggle:selectionToggle,onBatchAction,onBatchError,
      onEditSeries:openSeriesEditor,onTabChange:id=>{
        if(id==='series')return;
        parity.libraryTab=id;state.status=id==='pending'?'pendingReview':'all';
        state.libraryRecent=false;route('library');
      }})
    :state.route==='matching'
    ?createElement(MatchingPage,{state,source:image,kindName,session:matchingSession,
      onAction:handle,onMatchingChange:updateMatchingFromReact})
    :state.route==='editor'&&state.activeProject&&current()
    ?EditorPage({state,draft:current(),editorEntry,asset,source:image,
      // A Date string can repeat for two edits in one millisecond. The local
      // save generation keeps Fabric's Scene projection in step with history.
      sceneRevision:state.activeProject.updatedAt+':'+(saveVersions.get(state.activeProject.id)||0)+
        ':'+(state.cutSession?.revision||0)+':'+(state.inspectorSession?.revision||0)+
        ':'+(state.inspectorPreviewRevision||0),
      materials:state.assets,
      retainFabricAssets,
      loadFabricAsset:async(id,node,onUpgrade)=>{
        const record=asset(id);
        if(!record&&!node?.sourceBlobId&&!node?.sourceStaticPath)throw Error('素材不在当前资料库：'+id);
        if(node?.sourceStaticPath||record?.staticPath&&!node?.sourceBlobId)
          return node?.sourceStaticPath||record.staticPath;
        const blobId=node?.sourceBlobId||record?.blobId;
        if(!blobId)throw Error('作品引用的素材图片不存在：'+id);
        const pageScale=Math.max(0.1,Math.min(4,(view.clientWidth||window.innerWidth)/current().canvas.width));
        const pixels=Math.min(4096,Math.max(480,Math.ceil(Math.max(node.width,node.height)*pageScale*(devicePixelRatio||1)*2)));
        const ready=privateImages.available(blobId,pixels);
        if(ready?.sufficient)return ready.url;
        const cover=ready?.url||await privateImages.load(blobId,false);
        void privateImages.load(blobId,pixels,{background:true}).then(url=>{
          if(url&&url!==cover)onUpgrade?.();
        }).catch(()=>{/* The cover remains usable while a larger image retries. */});
        return cover;
      },
      onFabricSelection:(ids,bounds)=>{const next=ids.length===1?ids[0]:null;
        // The property window edits one staged object. Canvas selection
        // events must not silently switch or close that transaction.
        if(state.inspectorSession)return;
        const changed=state.selected!==next||JSON.stringify(state.multiSelected||[])!==JSON.stringify(ids);
        const boundsChanged=JSON.stringify(state.fabricSelectionBounds||null)!==JSON.stringify(bounds||null);
        if(changed||boundsChanged){
          state.selected=next;state.multiSelected=ids;state.fabricSelectionBounds=bounds||null;
          if(changed&&!state.inspectorSession)state.fabricInspectorOpen=false;
          render();}},
      onFabricBeforeChange:()=>checkpoint(),
      // Fabric already updates the changed layer in place. Persist its Scene
      // data without rebuilding the route during ink or text input.
      onFabricChange:()=>saveProject(),
      onFabricIssue:error=>toast(error.message),
      onFabricViewportChange:(scale,pan)=>{
        state.zoom=scale;
        state.canvasViewports||=new Map();
        state.canvasViewports.set(state.activeProject.id+':'+current().id,{...pan,scale});
      },
      format:fmt,hasAIReport:!!aiReport,onAction:handle,onInspectorChange:updateEditorInspector,
      onTitleCommit:title=>{const p=state.activeProject,next=title.trim()||'未命名手账';
        if(p&&next!==p.title){p.title=next;saveProject();}},
      onAIAction:handleAIPanelAction,onAIOpen:openAICreation,
      onAIPromptChange:value=>{state.aiPrompt=value;}})
    :state.route==='assetDetail'&&asset(state.detailAssetID)
      ?createElement(AssetDetailPage,{asset:asset(state.detailAssetID),seriesTitle:state.series.find(s=>s.id===asset(state.detailAssetID).seriesID)?.title,
        source:image,kindName,format:fmt,onAction:handle,assets:state.assets,
        onSelectSimilar:id=>{state.detailAssetID=id;render();},
        onExportPrint:()=>exportMaterials({db,asset,download},[state.detailAssetID])})
    :state.route==='projectPreview'&&state.projects.find(p=>p.id===state.previewProjectID)
      ?ProjectPreviewPage({project:state.projects.find(p=>p.id===state.previewProjectID),source:image,
        assets:state.assets,localCover:p=>localWorkCovers.peek(p),
        loadLocalCover:p=>localWorkCovers.cached(p),cloudEnabled,onAction:handle})
    :state.route==='settings'&&!state.settingsSection
      ?SettingsHomePage({onAction:handle})
    :state.route==='settings'&&state.settingsSection==='界面与素材库'
      ?SettingsDisplayPage({preferences:state.preferences,onAction:handle})
    :state.route==='settings'&&state.settingsSection==='导入与识别'
      ?createElement(SettingsRecognitionPage,{preferences:state.preferences,onAction:handle})
    :state.route==='settings'&&state.settingsSection==='数据与诊断'
      ?createElement(SettingsDataPage,{state,cloudEnabled,onAction:handle})
    :state.route==='settings'&&state.settingsSection==='AI 与创作'
      ?createElement(SettingsAIPage,{settings:state.aiSettings,preferences:state.preferences,onAction:handle})
    :state.route==='import'&&(state.importStep==='done'||!state.importRecords[state.importIndex])
      ?ImportSimplePage({state,onAction:handle})
    :state.route==='import'&&state.importStep==='review'
      ?createElement(ImportReviewPage,{state,format:fmt,onAction:handle,
        onSeriesChange:updateImportReviewSeries,
        onWorkTitleChange:(index,title)=>{state.importRecords[index].workTitle=title;},
        onEditCandidate:editImportReviewCandidate,
        onCheckCandidate:candidate=>openCutoutCheck(null,candidate),onError:toast})
    :state.route==='import'&&state.importStep==='inspect'&&state.importRecords[state.importIndex]
      ?createElement(ImportInspectionPage,{state,format:fmt,onAction:handle,
        onSettingChange:changeImportCalibration,onRecognitionSettingChange:changeImportRecognitionSetting,
        onRemoveRecord:removeImportRecord,onCheckCandidate:index=>openCutoutCheck(null,state.importCandidateData[index]),
        onManualCancel:()=>{state.showManualBox=false;render();},
        onManualDone:async boxes=>{
          if(await refreshImportCandidates(boxes,{manual:true})===false)return false;
          state.showManualBox=false;
          state.importRecords[state.importIndex].manualEdits=true;
          state.importRecords[state.importIndex].confirmed=false;
          saveActiveImportRecord();render();toast('已更新素材框，请核对候选预览');
        },onManualError:toast,onPaperChange:saveActiveImportRecord})
      :null;
  const routeIdentity=[state.route,
    state.route==='library'?`${parity.libraryTab}:${state.seriesID||'all'}`:'',
    state.route==='works'?parity.workTab:'',
    state.route==='import'?`${state.importStep}:${state.importIndex}`:'',
    state.route==='editor'?state.activeProject?.id||'':'',
    state.route==='settings'?state.settingsSection||'home':'',
    state.route==='assetDetail'?state.detailAssetID:'',
    state.route==='projectPreview'?state.previewProjectID:''].join(':');
  renderReactPage(createElement(AssetOrganizationContext.Provider,{value:assetOrganization},reactPage||unavailableRoute()),
    {preserveKey:routeIdentity,retainWorks:state.route==='works'&&
      !['trash','templates'].includes(parity.workTab),accountScope:state.accountId||'browser'});
  view.dataset.renderedRoute=state.route;
  view.dataset.renderedImportStep=state.route==='import'?state.importStep:'';
  view.dataset.renderedManualBox=state.route==='import'?String(!!state.showManualBox):'';
  view.dataset.renderedImportMode=state.route==='import'?state.importMode:'';
  view.dataset.renderedLibraryTab=state.route==='library'?parity.libraryTab:'';
  view.dataset.renderedSeriesID=state.route==='library'?state.seriesID||'all':'';
  view.dataset.renderedWorkTab=state.route==='works'?parity.workTab:'';
  view.dataset.renderedSettingsSection=state.route==='settings'?state.settingsSection||'':'';
  // React owns these descendants. Replacing its image or cover nodes behind
  // its back breaks later reconciliation and can make navigation unclickable.
  if(importQueueScroll!==null){
    const replacement=view.querySelector('.queue-strip');
    if(replacement)replacement.scrollLeft=importQueueScroll;
  }
  bindPage();mountWorkflowControls({state,view,body,modal,db,render,route,toast,imgTag,esc,asset,refresh,download,modelImage,rasterize,backup,openSeriesEditor,openAssetEditor:openDetail,openCutoutCheck,switchImportRecord,saveActiveImportRecord,saveProject,flushSave,moveProjectsToTrash,assetOrganization,applyAssetClassification});view.catalogRefresh?.();if(state.route==='works'){
    view.localWorkCoverDispose=localWorkCovers.observe(view);
    view.workCoverDispose=workCoverBackfill.observe(view);
  }
  if(state.route==='library')prewarmOtherPages();
  if(state.route==='projectPreview'&&state.previewProjectID){
    const project=state.projects.find(item=>item.id===state.previewProjectID);
    if(project)void localWorkCovers.ensure(project).catch(()=>{});
  }
  pageControllers.mount(state.route);
  if(state.route==='matching'&&
     matchingScrollMemory?.account===(state.accountId||'browser')){
    // The page and every independent scrollable column/textarea keep their
    // positions after star/remove/filter/proposal/generation rerenders.
    restoreMatchingScroll(view,matchingScrollMemory.scroll,window);
  }
  mountPageSyncIndicator();backgroundViewPending=false;
  }finally{
    renderInProgress=false;
    if(renderQueued){renderQueued=false;queueMicrotask(render);}
  }
}
function updateLibraryResults(){
  if(state.route!=='library'||view.querySelector('.series-contents'))return;
  window.dispatchEvent(new Event('shiye-library-refresh'));
  view.catalogRefresh=updateLibraryResults;
}
const kindName=materialKindName;
function matchingScope(){return buildMaterialScope({basket:state.basket,coreIDs:state.coreIDs,recommendations:matchingRecommendations(state),excluded:state.excludedAssetIDs,autoIncludeRecommendations:state.aiSettings.autoIncludeRecommendations,requireAllCandidates:state.aiSettings.requireAllCandidates});}
// Common actions update only affected Matching panes, preserving the entire
// remaining page, sticky header, textarea selection and decoded thumbnails.
function updateMatchingRegions(_regions,{persist=true}={}){
  if(state.route!=='matching')return render();
  updateShell({basketCount:state.basket.length});
  // React owns the Matching route. Replacing its descendants with HTML
  // removes the delegated click handlers from newly inserted controls.
  window.dispatchEvent(new Event('shiye-matching-refresh'));
  // Full render previously invoked bindPage(), which automatically staged
  // matching state. Incremental updates intentionally skip bindPage(), so
  // explicitly retain that durable local save for stars, exclusions, basket,
  // and filter changes. createMatchingSession serializes concurrent saves.
  if(persist)void matchingSession.persist().catch(error=>{
    console.warn('本机搭配状态保存失败',error);
    toast('本机搭配状态暂存失败：'+error.message);
  });
}
function current(){const p=state.activeProject,d=p?.drafts.find(d=>d.id===state.activeDraft)||p?.drafts[0];
  const session=state.cutSession||state.inspectorSession;
  if(d&&session?.projectID===p.id&&session.draftID===d.id)
    return attachSceneV2(session.working);
  return d?attachSceneV2(d):undefined;}
function editorEntry(d){return sceneLayerEntries(d,{ink:false});}
// Reuse one compact card language for every settings category.
function readAIForm(){
  const q=id=>view.querySelector('#setting-ai-'+id),old=state.aiSettings;
  const provider=q('provider').value,model=q('custom-model').value.trim(),endpoint=q('endpoint').value.trim();
  const key=q('key').value;
  let draftKeys={};try{draftKeys=JSON.parse(q('provider-keys')?.value||'{}');}catch{}
  const keys={...old.keys,...draftKeys,[provider]:key};
  const vision=supportsVision({provider,endpoint,model});
  return {...old,provider,keys,key,endpoint,model,
    includeStructureReference:q('structure-reference').checked,
    autoIncludeRecommendations:q('auto-recommendations').checked,
    requireAllCandidates:q('require-all').checked,
    includeThumbnails:vision,customVision:false,finalVisualReview:q('final-visual-review').checked,
    temperature:q('temperature').value,
    requestTimeout:q('timeout').value,customLayoutPrompt:q('layout-prompt').value};
}

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
function updateMatchingFromReact(key,value,options){
  if(key==='style'||key==='purpose'){
    const list=key==='style'?'matchStyles':'matchPurposes';
    state[list]=[...(state[list]||[]).filter(item=>!options.includes(item)),...(value?[value]:[])];
    normalizeMatchingDirection(state);
  }else if(['matchContentPolicy','matchMode',
    'matchRatio','matchIntent'].includes(key))state[key]=value;
  else return;
  void matchingSession.persist().catch(error=>{
    console.warn('本机搭配状态未保存；不影响云端作品同步',error);
    toast('本机搭配状态保存失败：'+error.message);
  });
  if(key!=='matchIntent')queueMatchingDefaultsSync();
}
function bindPage({partial=false}={}){
  // Pagination only inserts cards. Rebinding all form, editor and matching
  // listeners here accumulates duplicate handlers on each page transition.
  if(partial)return;
  if(state.route==='matching'){
    const saveMatching=()=>matchingSession.persist().catch(e=>{console.warn('本机搭配状态未保存；不影响云端作品同步',e);toast('本机搭配状态保存失败：'+e.message);});
    // Entering or rerendering this page is not an explicit save action. Any
    // changed session is staged in the background; sync errors use the global
    // indicator instead of interrupting navigation with a toast.
    void saveMatching();
  }
  // Catalog search/select listeners are scoped to the Library controller.

}
function updateEditorInspector(id,value){
  const d=current(),entry=d&&editorEntry(d).find(item=>item.value.id===state.selected);
  if(!d)return;
  if(id.startsWith('inspector-tape-')){
    if(entry?.kind!=='material'||!entry.value.tapeStrip)throw Error('请先选择胶带段');
    const record=asset(entry.value.assetID),node=entry.value,strip=node.tapeStrip;
    const angle=(node.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    const points=strip.points.map(([u,v])=>{const x=(u-.5)*node.width,y=(v-.5)*node.height;
      return [node.x+x*cos-y*sin,node.y+x*sin+y*cos];});
    const options={...strip,widthMM:strip.physicalWidthMM};
    const key={'inspector-tape-width':'widthMM','inspector-tape-mode':'textureMode',
      'inspector-tape-start-cap':'startCap','inspector-tape-end-cap':'endCap'}[id];
    if(!key)return;
    options[key]=key==='widthMM'?Number(value):value;
    const changed=reshapeTapeStrip(node,record,d,points,options);
    const trial=attachSceneV2(structuredClone(d));
    Object.assign(trial.items.find(item=>item.id===node.id),structuredClone(changed));
    validateScenePhysical(trial,state.assets);
    checkpoint();Object.assign(node,changed);saveProject();
    if(!state.inspectorSession)render();return;
  }
  if(['inspector-material-geometry','inspector-vector-mask'].includes(id)){
    if(!entry)throw Error('请先选择一个图层');
    let parsed;try{parsed=JSON.parse(value);}catch{throw Error('请输入合法的 JSON 几何数据');}
    if(id==='inspector-vector-mask'){
      if(parsed!==null)validateVectorMask(parsed);
      checkpoint();if(parsed===null){delete entry.value.vectorMask;delete entry.value.vectorMaskHistory;}
      else entry.value.vectorMask=parsed;
      saveProject();if(!state.inspectorSession)render();toast('蒙版已应用');return;
    }
    if(entry.kind!=='material'||!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
      Object.keys(parsed).some(key=>!['cropRect','materialMask','craftDisplaySlices'].includes(key)))
      throw Error('素材裁片数据格式无效');
    const record=state.assets.find(asset=>asset.id===entry.value.assetID);
    if(!record)throw Error('原素材不在素材库中');
    const crop=(Object.hasOwn(parsed,'cropRect')?parsed.cropRect:entry.value.cropRect)||
      {x:0,y:0,width:1,height:1};
    const mask=Object.hasOwn(parsed,'materialMask')?parsed.materialMask:entry.value.materialMask;
    const displaySlices=Object.hasOwn(parsed,'craftDisplaySlices')?
      parsed.craftDisplaySlices:entry.value.craftDisplaySlices;
    if(['x','y','width','height'].some(key=>!Number.isFinite(crop[key]))||
      crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||
      crop.x+crop.width>1+1e-9||crop.y+crop.height>1+1e-9||
      crop.width*record.physicalWidthMM<2||crop.height*record.physicalHeightMM<2)
      throw Error('裁片必须在原素材内，且短边不少于 2 mm');
    if(mask!==null&&mask!==undefined)materialMaskGeometry(mask);
    const next=structuredClone(d),candidate=sceneLayerEntries(next,{hidden:true})
      .find(item=>item.value.id===entry.value.id)?.value;
    if(!candidate)throw Error('目标图层已变化');
    const apply=node=>{
      const oldCrop=node.cropRect||{width:1,height:1};
      node.cropRect=crop.x===0&&crop.y===0&&crop.width===1&&crop.height===1?null:structuredClone(crop);
      node.materialMask=mask?structuredClone(mask):null;
      if(displaySlices)node.craftDisplaySlices=structuredClone(displaySlices);
      else delete node.craftDisplaySlices;
      const scale=d.canvas.height/(d.physicalPageHeightMM||297);
      const oldSourceWidth=oldCrop.width*record.physicalWidthMM*scale;
      const oldSourceHeight=oldCrop.height*record.physicalHeightMM*scale;
      const visualScaleX=node.manualVisualResize?node.width/oldSourceWidth:1;
      const visualScaleY=node.manualVisualResize?node.height/oldSourceHeight:1;
      node.width=crop.width*record.physicalWidthMM*scale*visualScaleX;
      node.height=crop.height*record.physicalHeightMM*scale*visualScaleY;
      node.manualGeometryOverride=true;
      node.userOverrideFlags=[...new Set([...(node.userOverrideFlags||[]),'cropRect','materialMask','craftDisplaySlices'])];
    };
    apply(candidate);validateScenePhysical(next,state.assets);
    checkpoint();apply(entry.value);saveProject();if(!state.inspectorSession)render();toast('裁片与工艺已应用');return;
  }
  const numeric={'inspector-x':'x','inspector-y':'y','inspector-width':'width','inspector-height':'height',
    'inspector-rotation':'rotation','inspector-z':'zIndex',
    'inspector-opacity':'opacity','inspector-font-size':'fontSize',
    'inspector-curve-height':'curveHeight',
    'inspector-letter-spacing':'letterSpacing','inspector-line-spacing':'lineSpacing',
    'inspector-paragraph-spacing':'paragraphSpacing','inspector-fixed-line-height':'fixedLineHeight',
    'inspector-line-width':'lineWidth','inspector-fill-opacity':'fillOpacity',
    'inspector-stroke-opacity':'strokeOpacity'};
  const color=/^#[0-9a-f]{6}$/i;
  let changed=false;
  checkpoint();
  if(entry){
    const key=numeric[id];
    if(key){
      if(entry.kind==='material'&&['width','height'].includes(key))return;
      if(!['text','shape','material'].includes(entry.kind))return;
      if(['fontSize','curveHeight','letterSpacing','lineSpacing','paragraphSpacing','fixedLineHeight'].includes(key)&&entry.kind!=='text')return;
      if(['lineWidth','fillOpacity','strokeOpacity'].includes(key)&&entry.kind!=='shape')return;
      const next=key==='fixedLineHeight'&&value===''?null:Number(value);
      if(next!==null&&(!Number.isFinite(next)||
        ['width','height','fontSize','fixedLineHeight'].includes(key)&&next<=0||
        ['opacity','fillOpacity','strokeOpacity'].includes(key)&&(next<0||next>1)))return;
      if(key==='curveHeight'&&(next<-500||next>500||next&&entry.value.content?.includes('\n')))return;
      if(next===null)delete entry.value[key];else entry.value[key]=next;
      if(key==='curveHeight')entry.value.height=Math.max(entry.value.height,
        entry.value.fontSize*1.6+Math.abs(next));
      if(entry.kind==='material')entry.value.userOverrideFlags=[...new Set([...(entry.value.userOverrideFlags||[]),key])];
      changed=true;
    }else if(id==='inspector-text'&&entry.kind==='text'){entry.value.content=String(value);changed=true;}
    else if(id==='inspector-font'&&entry.kind==='text'&&['serif','sans','rounded','hand'].includes(value)){
      entry.value.style=value;entry.value.fontName=null;changed=true;
    }else if(id==='inspector-alignment'&&entry.kind==='text'&&['left','center','right'].includes(value)){
      entry.value.alignment=value;changed=true;
    }else if(id==='inspector-font-name'&&entry.kind==='text'&&String(value).length<=120){
      entry.value.fontName=String(value).trim()||null;changed=true;
    }else if(id==='inspector-text-color'&&entry.kind==='text'&&color.test(value)){entry.value.color=value;changed=true;}
    else if(['inspector-bold','inspector-italic','inspector-underline','inspector-strikethrough'].includes(id)&&entry.kind==='text'){
      entry.value[id.slice(10)]=!!value;changed=true;
    }else if(id==='inspector-fill'&&entry.kind==='shape'&&color.test(value)){entry.value.fill=value;changed=true;}
    else if(id==='inspector-stroke'&&entry.kind==='shape'&&color.test(value)){entry.value.stroke=value;changed=true;}
    else if(id==='inspector-stroke-dash'&&entry.kind==='shape'&&['solid','dash','dot'].includes(value)){
      entry.value.strokeDash=value;changed=true;
    }else if(id==='inspector-flipped'&&entry.kind==='material'){
      entry.value.isFlippedHorizontally=!!value;changed=true;
    }else if(id==='inspector-blend-mode'&&['normal','multiply'].includes(value)){
      entry.value.blendMode=value;changed=true;
    }else if(entry.kind==='shape'&&entry.value.vectorLayers&&id.startsWith('inspector-vector-')){
      const match=/^inspector-vector-(fill|opacity)-(\d+)$/.exec(id),layer=match&&entry.value.vectorLayers[Number(match[2])];
      if(!layer)return;
      if(match[1]==='fill'&&color.test(value)){layer.fill=value;changed=true;}
      if(match[1]==='opacity'&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1){layer.opacity=Number(value);changed=true;}
    }
    else return;
  }else if(id==='paper-color'&&color.test(value)){d.paperColor=value;changed=true;}
  else if(id==='paper-pattern'&&['plain','grid','lines','dots','columns'].includes(value)){d.paperPattern=value;changed=true;}
  else if(id==='paper-columns'&&typeof value==='boolean'){d.paperColumns=value;changed=true;}
  else if(id==='page-ratio'){
    if(presetPaperDimensions(value)){setDraftPaperSize(d,value);changed=true;}
  }else if(id==='page-mode'&&['single','spread'].includes(value)){d.pageMode=value;d.canvas=canvasSize(value,d.pageRatio);changed=true;}
  else return;
  if(!changed)return;
  saveProject();if(!state.inspectorSession)render();
}
async function updateImportReviewSeries(recordIndex,next){
  const record=recordIndex===null?null:state.importRecords[recordIndex];
  if(recordIndex!==null&&!record)return null;
  const previous=record?record.seriesID??'':state.importBatchSeriesID||'';
  if(next!=='__new__'){
    if(record)record.seriesID=next;
    else state.importBatchSeriesID=next;
    return next;
  }
  const name=prompt('新建系列名称');
  if(!name?.trim())return previous;
  const now=new Date().toISOString(),group={id:uid(),title:name.trim(),
    introduction:'',createdAt:now,updatedAt:now};
  try{
    await db.put('series',group);
    state.series.push(group);
    if(record)record.seriesID=group.id;
    else state.importBatchSeriesID=group.id;
    render();return group.id;
  }catch(error){toast('系列新建失败：'+error.message);return previous;}
}
function checkpoint(){const d=current();if(!d||state.cutSession||state.inspectorSession)return;
  ensureEditorHistory(state);captureHistory(state.activeProject);checkpointEditorHistory(state,d);}
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
const projectSaveFingerprints=new Map(),projectSceneFingerprints=new Map();
function rememberProjectSaveBaseline(p){
  if(!p?.drafts?.some(d=>Array.isArray(d.layers)))return;
  projectSaveFingerprints.set(p.id,projectSemanticFingerprint(p));
  const active=p.drafts.find(d=>d.id===p.activeDraftID)||p.drafts[0];
  projectSceneFingerprints.set(p.id,active?projectSemanticFingerprint({drafts:[active]}):null);
}
function projectHasSemanticChanges(p){
  return !projectSaveFingerprints.has(p.id)||
    projectSaveFingerprints.get(p.id)!==projectSemanticFingerprint(p);
}
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
function saveSpecificProject(p){if(!p)return false;delete p.isTemplate;
  pinProjectMaterialImages(p,asset);
  const fingerprint=projectSemanticFingerprint(p);
  if(projectSaveFingerprints.get(p.id)===fingerprint)return false;
  if(cloudEnabled)p.__cloudSessionId||=crypto.randomUUID();
  // Edits invalidate the previous scene's remote snapshot. A new 720px cover
  // can be drawn locally immediately; COS receives the next uploaded version.
  const active=p.drafts?.find(d=>d.id===p.activeDraftID)||p.drafts?.[0];
  const sceneFingerprint=active?projectSemanticFingerprint({drafts:[active]}):null;
  if(active&&!p.isSnapshot&&projectSceneFingerprints.get(p.id)!==sceneFingerprint){delete active.coverImageID;delete active.coverSceneHash;}
  const now=new Date().toISOString();trackEditedScene(p,now);p.updatedAt=now;
  projectSaveFingerprints.set(p.id,fingerprint);projectSceneFingerprints.set(p.id,sceneFingerprint);
  saveVersions.set(p.id,(saveVersions.get(p.id)||0)+1);dirtyProjects.set(p.id,p);saveStatus('后台保存中…');syncDisplay.localPending=true;updateSyncIndicator();if(!saveTimer)saveTimer=setTimeout(()=>flushSave().catch(console.error),500);return true;}
let inspectorFrame=0,inspectorStepTimer=0,inspectorPendingSession=null;
function flushInspectorSnapshot(){
  if(inspectorFrame){cancelAnimationFrame(inspectorFrame);inspectorFrame=0;}
  if(inspectorStepTimer){clearTimeout(inspectorStepTimer);inspectorStepTimer=0;}
  const session=state.inspectorSession;
  if(session&&inspectorPendingSession===session)
    acceptSceneEditStep(session,session.working,state.selected);
  inspectorPendingSession=null;
}
function saveProject(){
  if(state.cutSession)return;
  if(state.inspectorSession){
    // Paint at most once a frame; one continuous slider/text gesture becomes
    // one undo snapshot after the input settles. This avoids copying a large
    // Scene on every pointer packet while keeping the canvas preview live.
    inspectorPendingSession=state.inspectorSession;
    if(!inspectorFrame)inspectorFrame=requestAnimationFrame(()=>{
      inspectorFrame=0;
      if(state.inspectorSession&&state.route==='editor'){
        state.inspectorPreviewRevision=(state.inspectorPreviewRevision||0)+1;
        render();
      }
    });
    if(inspectorStepTimer)clearTimeout(inspectorStepTimer);
    inspectorStepTimer=setTimeout(()=>flushInspectorSnapshot(),220);
    return;
  }
  saveSpecificProject(state.activeProject);
}
const pendingTrashStages=new Map();
async function awaitTrashStages(ids){await Promise.all(ids.map(id=>pendingTrashStages.get(id)).filter(Boolean));}
async function moveProjectsToTrash(ids){
  const selected=new Set(ids),projects=state.projects.filter(p=>selected.has(p.id));
  if(!projects.length)return 0;
  const entries=projects.map(item=>({id:uid(),kind:'project',item:structuredClone(item),date:new Date().toISOString()}));
  for(const project of projects){dirtyProjects.delete(project.id);saveVersions.set(project.id,(saveVersions.get(project.id)||0)+1);}
  for(const project of projects){projectSaveFingerprints.delete(project.id);projectSceneFingerprints.delete(project.id);}
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
function handle(action,id,value){
  return actionStore.dispatch({type:'app/action',payload:{action,id,value}});
}
async function runAppAction(action,id,value){try{
  if(state.route==='editor'&&state.cutSession&&
    !/^fabric-cut-/.test(action)&&
    !['fabric-tool','fabric-select-layer','fabric-fit-view','zoom-in','zoom-out',
      'undo','redo','back-works','editor-done'].includes(action)){
    toast('请先完成或放弃剪刀操作');return;
  }
  if(state.route==='editor'&&state.inspectorSession&&
    !/^fabric-inspector-/.test(action)&&
    !['fabric-tool','fabric-text-property','fabric-shape-property',
      'fabric-remove-vector-mask','fabric-replace-material','duplicate','flip',
      'front','delete-object','fabric-fit-view','zoom-in','zoom-out','undo','redo',
      'back-works','editor-done'].includes(action)){
    toast('请先保存或放弃对象编辑');return;
  }
  if(state.route==='editor'&&(state.cutSession||state.inspectorSession)&&
    (/^fabric-history-/.test(action)||['save-snapshot','export-scene-json',
      'download-project-json','export-png','export-pdf','print','save-work',
      'fabric-paper','paper-menu'].includes(action))){
    toast(state.cutSession?'请先完成或放弃剪刀操作':'请先保存或放弃对象编辑');return;
  }
  switch(action){
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
    if(state.cutSession){toast('请先在剪刀面板完成或放弃本次操作');break;}
    if(state.inspectorSession){toast('请先在对象编辑窗口保存或放弃更改');break;}
    // The ink layer may have a short coalescing timer. Flush its committed
    // strokes BEFORE the explicit export/publish/exit transaction.
    view.flushInkCommit?.({renderUI:false,force:true});
    const p=state.activeProject;if(!p)throw Error('当前没有可保存的作品');
    if(p.__remoteDeleted){
      if(!confirm('这份作品已在其他设备删除。当前页面的修改不会自动恢复已删除作品。若要保留当前编辑，请先取消并导出可编辑 JSON。确定退出到作品库吗？'))break;
      state.activeProject=null;state.activeDraft=null;
      parity.workTab='all';parity.selectionMode=null;parity.selected.clear();parity.showOnlySelected=false;
      route('works',{replaceHistory:true});
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
      if(projectHasSemanticChanges(p))makeAutoSceneSnapshot(p,{reason:'completed'});
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
    route('works',{replaceHistory:true});
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
    addMatchingFromLibrary(state,[state.detailAssetID]);
    void matchingSession.persist().catch(console.warn);
    updateShell({basketCount:state.basket.length});
    toast('已加入本次创作');break;case 'detail-match':addMatchingFromLibrary(state,[state.detailAssetID]);route('matching');break;case 'detail-series':state.seriesID=asset(state.detailAssetID)?.seriesID||'all';route('library');break;case 'detail-edit':openDetail(state.detailAssetID);break;case 'detail-check':await openCutoutCheck(state.detailAssetID);break;case 'detail-favorite':await actionStore.dispatch({type:'library/favorite',payload:{id:state.detailAssetID}});break;
  case 'series-add-cancel':{
    const seriesID=state.addingToSeries;
    state.addingToSeries=null;finishSelection(parity);state.seriesID=seriesID;route('library');break;
  }
  case 'series-add-confirm':{
    const seriesID=state.addingToSeries;
    if(!seriesID||!parity.selected.size)break;
    const revised=state.assets.filter(entry=>parity.selected.has(entry.id))
      .map(entry=>({...entry,seriesID}));
    await db.transaction(['assets'],tx=>{for(const entry of revised)tx.objectStore('assets').put(entry);});
    for(const entry of revised)Object.assign(state.assets.find(asset=>asset.id===entry.id),entry);
    state.addingToSeries=null;finishSelection(parity);state.seriesID=seriesID;
    render();toast('素材已加入系列');break;
  }
  case 'new-series':openSeriesEditor();break;case 'series-detail':state.seriesID=id;route('library');break;
  case 'series-return':libraryBack();break;
  case 'match-library':route('library');break;case 'match-context':{const scope=matchingScope();toast(`必须 ${scope.required.length} · 优先 ${scope.preferred.length} · 可用 ${scope.available.length} · 不使用 ${scope.excluded.length}`);break;}
  case 'match-filter':await actionStore.dispatch({type:'matching/filter',payload:{value}});break;
  case 'match-skip':await actionStore.dispatch({type:'matching/exclude',payload:{id}});break;
  case 'match-allow':await actionStore.dispatch({type:'matching/include',payload:{id}});break;
  case 'match-core':await actionStore.dispatch({type:'matching/priority',payload:{id}});break;
  case 'match-generate':captureMatchingDirection();queueMatchingDefaultsSync();await matchingSession.generate();break;
  case 'match-export-gpt':await exportOfflineCreation();break;
  case 'match-import-gpt':openOfflineImportDialog();break;
  case 'basket':await actionStore.dispatch({type:'matching/basket',payload:{id}});break;
  case 'reset-match':if(!confirm('重新搭配？已有保存作品不会被删除。'))break;await matchingSession.reset(()=>{state.matchCore=null;state.basket=[];state.coreIDs=[];state.excludedAssetIDs=[];});render();break;
  case 'create-from-basket':openManualCreationDialog();break;
  case 'new-project':{
    openOverlay(createElement(BlankProjectDialog,{defaultSize:state.preferences.paperSize||'a4',
      onClose:closeOverlay,onCreate:async({mode,ratio})=>{
        const opening=++editorOpenSequence;await flushSave();if(opening!==editorOpenSequence)return;
        const p=project('未命名手账',{mode,ratio});
        state.projects.push(p);state.activeProject=p;state.activeDraft=p.activeDraftID;
        resetEditorHistory(state);state.tool=state.toolHighlight='select';state.zoom=1;
        saveProject();await flushSave();route('editor');
      }}));break;
  }
  case 'open-project':{const opening=++editorOpenSequence;let p=state.projects.find(p=>p.id===id);if(!p)break;
    // A different work's local stage must not delay the clicked cover/detail.
    // Reopening the exact work waits for its own stage so the full document
    // read cannot replace newer local edits with an older remote snapshot.
    if(dirtyProjects.has(p.id)||(state.activeProject?.id===p.id&&savingProjects))await flushSave();
    else if(dirtyProjects.size||dirtyUsageAssets.size)void flushSave().catch(()=>{});
    if(opening!==editorOpenSequence)break;
    if(p.isSnapshot){state.previewProjectID=p.id;route('projectPreview');break;}
    if(p.projectDocumentPath){toast('正在读取完整作品…');p=await db.get('projects',p.id);if(opening!==editorOpenSequence)break;if(!p)throw Error('作品完整数据尚未载入');state.projects=state.projects.map(old=>old.id===p.id?p:old);}
    rememberProjectSaveBaseline(p);
    state.activeProject=p;state.activeDraft=p.activeDraftID;state.offlineEditingReturnID=null;resetEditorHistory(state);state.tool=state.toolHighlight='select';state.zoom=state.canvasViewports?.get(p.id+':'+state.activeDraft)?.scale||1;route('editor');break;}
  case 'preview-back':navigateBack('works');break;case 'preview-continue':{await handle('open-project',state.previewProjectID);break;}
  case 'snapshot-favorite':{const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p?.isSnapshot)break;const next={...p,isFavorite:!p.isFavorite};await db.put('projects',next);Object.assign(p,next);
    render();break;}
  case 'project-meta':openProjectMetadata();break;
  case 'save-snapshot':await saveProjectSnapshot(state.activeProject);break;
  case 'download-snapshot':{const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p?.isSnapshot)break;const id=p.snapshotDocumentBlobId||p.snapshotBlobId,blob=(await db.get('blobs',id))?.data;if(!blob)throw Error('快照文件尚未同步，稍后重试');const ext=p.snapshotFormat==='application/pdf'?'pdf':p.snapshotFormat==='image/jpeg'?'jpg':p.snapshotFormat==='image/webp'?'webp':'png';download(blob,p.title+'.'+ext);break;}
  case 'export-scene-json':{const p=state.activeProject;if(!p||p.isSnapshot)throw Error('请选择可编辑作品');download(new Blob([JSON.stringify(exportSceneDocument(p))],{type:'application/json'}),p.title+'.shiye-scene.json');break;}
   case 'download-project-json':{const source=state.projects.find(x=>x.id===id)||state.activeProject;if(!source||source.isSnapshot)throw Error('可编辑作品不存在');const p=source.projectDocumentPath?await db.completeProject(source):source;const {createNativeProjectDocument}=await import('./native-project-package.js');download(new Blob([JSON.stringify(createNativeProjectDocument(p))],{type:'application/json'}),p.title+'.shiyeproject.json');break;}
  case 'project-delete':{const p=state.projects.find(x=>x.id===state.previewProjectID);if(!p||!confirm('将这份作品移到最近删除？'))break;await moveProjectsToTrash([p.id]);break;}
  case 'works-filter':await actionStore.dispatch({type:'works/filter',payload:{value}});break;
  case 'fabric-tool':{
    if(state.inspectorSession&&value!==state.tool){
      if(sceneEditSessionChanged(state.inspectorSession)){
        toast('请先在对象编辑窗口保存或放弃更改');break;
      }
      state.inspectorSession=null;state.fabricInspectorOpen=false;
    }
    if(state.cutSession&&value!=='scissors'){
      if(sceneEditSessionChanged(state.cutSession)){
        toast('请先在剪刀面板完成或放弃本次操作');break;
      }
      state.cutSession=null;
    }
    const leavingLasso=state.tool==='lasso'&&value!=='lasso';
    if(state.tool==='scissors'&&value!=='scissors'){
      state.cutSettings={...state.cutSettings,targetIDs:[]};
    }
    if(state.tool!==value)state.cutPreview=null;
    if(value!=='tape'){state.tapeAssetID=null;state.tapeEditID=null;}
    else if(state.tool!=='tape')state.tapeAssetID=null;
    state.tool=value;
    if(leavingLasso||!['select','lasso','scissors'].includes(value)){state.selected=null;state.multiSelected=[];}
    state.fabricInspectorOpen=false;
    render();break;
  }
  case 'fabric-cut-open':{
    if(state.inspectorSession){toast('请先保存或放弃对象编辑');break;}
    const d=current();if(!d)break;
    const ids=[...new Set(state.multiSelected?.length?state.multiSelected:state.selected?[state.selected]:[])];
    if(!ids.length){toast('请先选择对象');break;}
    if(!state.cutSession)state.cutSession=beginSceneEditSession(d,{
      projectID:state.activeProject.id,
      saveRevision:saveVersions.get(state.activeProject.id)||0,
      selectedID:state.selected});
    state.selected=ids[0];
    state.multiSelected=[ids[0]];
    state.tool=state.toolHighlight='scissors';
    state.fabricInspectorOpen=false;
    state.cutPreview=null;
    state.cutSettings={operation:'split',scope:'object',inset:.18,hideRegion:true};
    render();break;
  }
  case 'fabric-cut-setting':{
    const previous=state.cutPreview;
    if(!['operation','inset','hideRegion'].includes(id))break;
    state.cutSettings={operation:'split',scope:'object',inset:.18,
      hideRegion:true,...state.cutSettings,[id]:value,scope:'object'};
    state.cutPreview=null;
    if(previous&&id==='inset'&&previous.spec.preset)
      void handle('fabric-cut-preview',previous.spec.preset);
    else if(previous&&id==='hideRegion')
      void handle('fabric-cut-preview',previous.spec.preset||previous.spec.points,previous.spec.pathType);
    else render();break;
  }
  case 'fabric-cut-preview':{
    const d=current();if(!d)break;
    const settings={operation:'split',scope:'object',inset:.18,
      hideRegion:true,targetIDs:[],...state.cutSettings};
    const spec={...settings,scope:'object',selectedID:state.selected,
      points:Array.isArray(id)?id:[],preset:typeof id==='string'?id:null};
    spec.pathType=Array.isArray(id)&&value==='loop'?'loop':'line';
    try{
      const {assets:cutAssets,shapeOutlines}=cutGeometryOnCanvas(d);
      spec.shapeOutlines=shapeOutlines;
      const plan=planSceneCut(d,spec,cutAssets);
      const keepKeys=plan.pieces.filter(piece=>piece.area===
        Math.max(...plan.pieces.filter(other=>other.sourceID===piece.sourceID).map(other=>other.area)))
        .map(piece=>piece.key);
      state.cutPreview={spec,pieces:plan.pieces,keepKeys,
        sceneRevision:(saveVersions.get(state.activeProject.id)||0),
        sessionRevision:state.cutSession?.revision||0,draftID:d.id};
      render();
    }catch(error){console.error('剪切预览失败',error);
      recordRuntimeIssue('handled',error,state.route,{phase:'canvas-cut-preview'});
      state.cutPreview=null;toast(error.message||'无法预览剪切');render();}
    break;
  }
  case 'fabric-cut-keep':{
    if(!state.cutPreview)break;
    const keys=new Set(state.cutPreview.keepKeys);
    if(keys.has(id))keys.delete(id);else keys.add(id);
    state.cutPreview={...state.cutPreview,keepKeys:[...keys]};render();break;
  }
  case 'fabric-cut-cancel':state.cutPreview=null;render();break;
  case 'fabric-cut-step':{
    const session=state.cutSession;if(!session)break;
    if(state.cutPreview){state.cutPreview=null;render();break;}
    const selected=stepSceneEditSession(session,id);
    if(selected===null)break;
    state.selected=selected;state.multiSelected=selected?[selected]:[];
    render();break;
  }
  case 'fabric-cut-discard':{
    const session=state.cutSession;if(!session)break;
    const selected=session.steps[0].selectedID;
    state.cutSession=null;state.cutPreview=null;
    state.selected=selected;state.multiSelected=selected?[selected]:[];
    state.tool=state.toolHighlight='select';render();toast('已放弃本次剪刀操作');break;
  }
  case 'fabric-cut-finish':{
    const session=state.cutSession;if(!session)break;
    if(state.cutPreview){toast('请先应用或取消当前预览');break;}
    const saved=state.activeProject?.drafts?.find(d=>d.id===session.draftID);
    if(!saved||session.projectID!==state.activeProject.id||
      session.saveRevision!==(saveVersions.get(state.activeProject.id)||0)){
      toast('作品已在其他地方变化；本次剪刀操作尚未保存，请先检查');break;
    }
    if(sceneEditSessionChanged(session)){
      validateScenePhysical(session.working,state.assets);
      state.cutSession=null;
      checkpoint();saved.layers=structuredClone(session.working.layers);saveProject();
    }else state.cutSession=null;
    state.cutPreview=null;state.tool=state.toolHighlight='select';
    render();toast('剪刀操作已完成');break;
  }
  case 'fabric-cut-reset-mask':{
    const session=state.cutSession,d=current();if(!session||!d||!state.selected)break;
    try{
      const trial=restoreSceneMasks(d,state.selected,{last:id==='last'});
      validateScenePhysical(trial,state.assets);
      acceptSceneEditStep(session,trial,state.selected);
      state.cutPreview=null;render();toast(id==='last'?'已撤回上一层蒙版':'已恢复当前裁片完整显示');
    }catch(error){toast(error.message||'无法恢复蒙版');}
    break;
  }
  case 'fabric-cut-confirm':{
    const d=current(),preview=state.cutPreview,session=state.cutSession;
    if(!d||!preview||!session)break;
    if(preview.draftID!==d.id||preview.sceneRevision!==(saveVersions.get(state.activeProject.id)||0)){
      state.cutPreview=null;toast('画面已变化，请重新预览剪切');render();break;
    }
    if(preview.sessionRevision!==session.revision){
      state.cutPreview=null;toast('剪刀步骤已变化，请重新预览');render();break;
    }
    if(preview.spec.operation==='split'&&!preview.keepKeys.length){toast('请至少保留一片在画布上');break;}
    try{
      const plan=planSceneCut(d,{...preview.spec,keepKeys:preview.keepKeys},state.assets);
      validateScenePhysical(plan.draft,state.assets);
      const selected=plan.selectionID||plan.pieces.find(piece=>!piece.parked)?.nodeID||plan.affected[0]||null;
      acceptSceneEditStep(session,plan.draft,selected);
      state.cutPreview=null;
      state.selected=selected;
      state.multiSelected=state.selected?[state.selected]:[];
      render();toast(preview.spec.operation==='mask'?'蒙版已加入本次操作':'裁片已加入本次操作，可继续剪切');
    }catch(error){console.error('剪切应用失败',error);
      recordRuntimeIssue('handled',error,state.route,{phase:'canvas-cut-confirm'});
      toast(error.message||'无法完成剪切');}
    break;
  }
  case 'fabric-cut-rejoin':{
    const d=current(),session=state.cutSession,ids=Array.isArray(id)?id:[state.selected,id].filter(Boolean);
    if(!session||ids.length!==2)break;
    try{
      const plan=rejoinMaterialPieces(d,ids,state.assets);
      validateScenePhysical(plan.draft,state.assets);
      acceptSceneEditStep(session,plan.draft,plan.nodeID);
      state.selected=plan.nodeID;state.multiSelected=[plan.nodeID];render();toast('裁片已拼回');
    }catch(error){toast(error.message||'裁片无法拼回');}
    break;
  }
  case 'fabric-tool-slot':{
    const {mode,kind,index,value:slotValue}=id||{};
    if(!['pen','highlighter','eraser'].includes(mode)||!['width','color'].includes(kind)||
      !Number.isInteger(index)||index<0||index>2||mode==='eraser'&&kind==='color')break;
    state.canvasTools||={...defaultTools};
    const prefix='fabric'+mode[0].toUpperCase()+mode.slice(1);
    const key=prefix+(kind==='width'?'WidthsMM':'Colors');
    const active=prefix+(kind==='width'?'WidthSlot':'ColorSlot');
    const defaults=kind==='width'?mode==='pen'?[.3,.5,1]:mode==='highlighter'?[1,2,4]:[2,4,8]:
      mode==='pen'?['#171717','#2b5245','#167ad9']:['#fb8795','#f5cf45','#57bd4b'];
    const values=[...(state.canvasTools[key]||defaults)];
    if(slotValue!==undefined){
      if(kind==='color'){
        if(!/^#[0-9a-f]{6}$/i.test(slotValue))break;
        values[index]=slotValue;
      }else{
        const numeric=Number(slotValue);
        if(!Number.isFinite(numeric))break;
        values[index]=Math.max(mode==='pen'?.2:mode==='highlighter'?.5:1,
          Math.min(mode==='pen'?3:mode==='highlighter'?8:12,numeric));
      }
    }
    state.canvasTools[key]=values;
    state.canvasTools[active]=index;
    if(kind==='width')state.canvasTools[mode==='pen'?'fabricPenWidthMM':mode==='highlighter'?'fabricMarkerWidthMM':'fabricEraserWidthMM']=values[index];
    else state.canvasTools[mode==='pen'?'penColor':'fabricMarkerColor']=values[index];
    try{localStorage.setItem('shiye-canvas-tools-v1',JSON.stringify(state.canvasTools));}catch{}
    render();break;
  }
  case 'fabric-inspector-open':{
    const d=current();
    if(!d||!state.selected||state.cutSession)break;
    state.inspectorSession=beginSceneEditSession(d,{
      projectID:state.activeProject.id,
      saveRevision:saveVersions.get(state.activeProject.id)||0,
      selectedID:state.selected});
    state.fabricInspectorOpen=true;render();break;
  }
  case 'fabric-inspector-save':{
    const session=state.inspectorSession;if(!session)break;
    flushInspectorSnapshot();
    const saved=state.activeProject?.drafts?.find(d=>d.id===session.draftID);
    if(!saved||session.projectID!==state.activeProject.id||
      session.saveRevision!==(saveVersions.get(state.activeProject.id)||0)){
      toast('作品已在其他地方变化；对象修改尚未保存，请先检查');break;
    }
    if(sceneEditSessionChanged(session)){
      validateScenePhysical(session.working,state.assets);
      state.inspectorSession=null;
      checkpoint();saved.layers=structuredClone(session.working.layers);saveProject();
    }else state.inspectorSession=null;
    state.fabricInspectorOpen=false;render();toast('对象修改已保存');break;
  }
  case 'fabric-inspector-close':case 'fabric-inspector-discard':{
    if(inspectorFrame){cancelAnimationFrame(inspectorFrame);inspectorFrame=0;}
    if(inspectorStepTimer){clearTimeout(inspectorStepTimer);inspectorStepTimer=0;}
    inspectorPendingSession=null;
    const selected=state.inspectorSession?.steps[0].selectedID||state.selected;
    state.inspectorSession=null;state.fabricInspectorOpen=false;
    state.selected=selected;state.multiSelected=selected?[selected]:[];
    render();break;
  }
  case 'fabric-remove-vector-mask':editSelected(e=>{if(e?.value?.vectorMask){
    delete e.value.vectorMask;delete e.value.vectorMaskHistory;
  }});break;
  case 'fabric-fit-view':{
    state.zoom=1;state.fabricFitRevision=(state.fabricFitRevision||0)+1;
    state.canvasViewports?.set(state.activeProject.id+':'+current().id,{scale:1,x:0,y:0});
    render();break;
  }
  case 'fabric-text-property':{
    const allowed=['style','fontSize','color','alignment','bold','italic','underline','strikethrough'];
    if(!allowed.includes(id))break;
    let next=value;
    if(id==='style'&&!['serif','sans','rounded','hand'].includes(next))break;
    if(id==='alignment'&&!['left','center','right'].includes(next))break;
    if(id==='color'&&!/^#[0-9a-f]{6}$/i.test(next))break;
    if(id==='fontSize'){next=Number(next);if(!Number.isFinite(next))break;next=Math.max(5,Math.min(400,next));}
    if(['bold','italic','underline','strikethrough'].includes(id))next=!!next;
    const entry=editorEntry(current()).find(item=>item.value.id===state.selected);
    if(entry?.kind==='text'){
      if(entry.value[id]===next)break;
      assertSceneEditable(current(),entry.value.id);
      checkpoint();entry.value[id]=next;if(id==='style')entry.value.fontName=null;
      saveProject();
    }else{
      state.textDefaults={style:'serif',fontSize:40,color:'#30463d',alignment:'left',...state.textDefaults,[id]:next};
      if(id==='style')state.textDefaults.fontName=null;
    }
    render();break;
  }
  case 'fabric-shape-property':{
    const entry=editorEntry(current()).find(item=>item.value.id===state.selected);
    if(entry?.kind!=='shape'||!['fill','stroke','lineWidth','opacity'].includes(id))break;
    let next=value;
    if(['fill','stroke'].includes(id)&&!/^#[0-9a-f]{6}$/i.test(next))break;
    if(['lineWidth','opacity'].includes(id)){
      next=Number(next);if(!Number.isFinite(next))break;
      next=id==='lineWidth'?Math.max(0,Math.min(30,next)):Math.max(0,Math.min(1,next));
    }
    if(entry.value[id]===next)break;
    assertSceneEditable(current(),entry.value.id);
    checkpoint();entry.value[id]=next;saveProject();render();break;
  }
  case 'fabric-tool-setting':{
    state.canvasTools||={...defaultTools};
    if(id==='penColor'||id==='fabricMarkerColor'){
      if(!/^#[0-9a-f]{6}$/i.test(value))break;
      state.canvasTools[id]=value;
    }else if(['fabricPenWidthMM','fabricEraserWidthMM','fabricMarkerWidthMM'].includes(id))
      state.canvasTools[id]=Math.max(id==='fabricPenWidthMM'?.2:id==='fabricMarkerWidthMM'?.5:1,
        Math.min(id==='fabricPenWidthMM'?3:id==='fabricMarkerWidthMM'?8:12,Number(value)||1));
    else if(id==='fabricMarkerStraight')state.canvasTools[id]=!!value;
    else if(id==='fabricPenStyle'&&['pressure','ballpoint','brush'].includes(value))state.canvasTools[id]=value;
    else if(id==='fabricEraserStyle'&&['fine','standard','brush'].includes(value))state.canvasTools[id]=value;
    else break;
    try{localStorage.setItem('shiye-canvas-tools-v1',JSON.stringify(state.canvasTools));}catch{}
    render();break;
  }
  case 'fabric-selection-mode':state.selectionMode=id==='intersect'?'intersect':'contain';render();break;
  case 'fabric-selection-filter':{
    if(!['material','shape','text','lockInk'].includes(id))break;
    state.selectionFilter={material:true,shape:true,text:true,ink:true,lockInk:false,...state.selectionFilter,[id]:!!value};
    render();break;
  }
  case 'fabric-lasso-copy':{
    const d=current(),ids=state.multiSelected||[];if(!d||!ids.length)break;
    ids.forEach(key=>assertSceneEditable(d,key));
    checkpoint();const copies=copySceneLasso(d,ids,uid);
    state.tool='select';
    state.selected=copies.length===1?copies[0]:null;state.multiSelected=copies;
    state.fabricSelectionBounds=sceneLassoBounds(d,copies);
    saveProject();render();break;
  }
  case 'fabric-lasso-delete':{
    const d=current(),ids=state.multiSelected||[];if(!d||!ids.length)break;
    ids.forEach(key=>assertSceneEditable(d,key));
    checkpoint();deleteSceneLasso(d,ids);state.selected=null;state.multiSelected=[];
    saveProject();render();break;
  }
  case 'fabric-lasso-merge':{
    const d=current(),ids=state.multiSelected||[];if(!d||ids.length<2)break;
    ids.forEach(key=>assertSceneEditable(d,key));
    checkpoint();const groupID=mergeSceneLasso(d,ids,{id:'group-'+uid()});
    state.tool='select';state.selected=groupID;state.multiSelected=[groupID];
    state.fabricSelectionBounds=sceneLassoBounds(d,sceneLayerEntries(d,{hidden:true})
      .filter(entry=>entry.parents.some(parent=>parent.id===groupID)).map(entry=>entry.value.id));
    saveProject();render();break;
  }
  case 'fabric-selection-toggle-group':{
    const d=current(),ids=[...new Set(state.multiSelected||[])];if(!d||!ids.length)break;
    const groupID=selectionGroupID(d,ids);
    if(groupID){
      assertSceneEditable(d,groupID);
      const group=findSceneNode(d,groupID),children=[...(group.children||[])].map(child=>child.id);
      checkpoint();ungroupSceneLayers(d,groupID);state.tool='select';
      state.selected=children.length===1?children[0]:null;state.multiSelected=children;
      state.fabricSelectionBounds=sceneLassoBounds(d,sceneLayerEntries(d,{hidden:true})
        .filter(entry=>children.includes(entry.value.id)||
          entry.parents.some(parent=>children.includes(parent.id))).map(entry=>entry.value.id));
    }else{
      if(ids.length<2)break;
      ids.forEach(key=>assertSceneEditable(d,key));
      checkpoint();const next=ids.some(key=>findSceneNode(d,key)?.type==='group')?
        groupSceneLayers(d,ids,{id:'group-'+uid(),name:'手帐组合'}):
        mergeSceneLasso(d,ids,{id:'group-'+uid()});
      state.tool='select';state.selected=next;state.multiSelected=[next];
      state.fabricSelectionBounds=sceneLassoBounds(d,sceneLayerEntries(d,{hidden:true})
        .filter(entry=>entry.parents.some(parent=>parent.id===next)).map(entry=>entry.value.id));
    }
    saveProject();render();break;
  }
  case 'fabric-group-copy':{
    const d=current(),groupID=state.selected;if(!d||findSceneNode(d,groupID)?.type!=='group')break;
    const trial=attachSceneV2(structuredClone(d));
    duplicateSceneGroup(trial,groupID,()=>uid());
    validateScenePhysical(trial,state.assets);
    checkpoint();const next=duplicateSceneGroup(d,groupID,uid);
    state.selected=next;state.multiSelected=[next];
    state.fabricSelectionBounds=sceneLassoBounds(d,sceneLayerEntries(d,{hidden:true})
      .filter(entry=>entry.parents.some(parent=>parent.id===next)).map(entry=>entry.value.id));
    saveProject();render();break;
  }
  case 'fabric-group-delete':{
    const d=current(),groupID=state.selected;if(!d||findSceneNode(d,groupID)?.type!=='group')break;
    assertSceneEditable(d,groupID);checkpoint();deleteSceneGroup(d,groupID);
    state.selected=null;state.multiSelected=[];state.fabricSelectionBounds=null;
    saveProject();render();break;
  }
  case 'fabric-arrange-selection':{
    const d=current(),ids=[...new Set(state.multiSelected||[])];
    if(!d||ids.length<2)break;
    const candidate=attachSceneV2(structuredClone(d));
    if(!arrangeSceneSelection(candidate,ids,id))break;
    checkpoint();arrangeSceneSelection(d,ids,id);
    const selected=new Set(ids),leaves=sceneLayerEntries(d,{hidden:true}).filter(entry=>
      selected.has(entry.value.id)||entry.parents.some(parent=>selected.has(parent.id)))
      .map(entry=>entry.value.id);
    state.fabricSelectionBounds=sceneLassoBounds(d,leaves);
    saveProject();render();break;
  }
  case 'fabric-layer-select':{
    const d=current(),node=findSceneNode(d,id?.id);if(!node)break;
    const ids=id.add?new Set([...(state.multiSelected||[]),state.selected].filter(Boolean)):new Set();
    if(id.add&&ids.has(node.id))ids.delete(node.id);else ids.add(node.id);
    state.multiSelected=[...ids];state.selected=ids.size===1?[...ids][0]:null;
    const selected=new Set(ids);
    const leaves=sceneLayerEntries(d,{hidden:true}).filter(entry=>selected.has(entry.value.id)||
      entry.parents.some(parent=>selected.has(parent.id))).map(entry=>entry.value.id);
    state.fabricSelectionBounds=leaves.length?sceneLassoBounds(d,leaves):null;
    state.fabricInspectorOpen=false;state.tool='select';render();break;
  }
  case 'fabric-layer-operation':{
    const d=current(),node=findSceneNode(d,id?.id);if(!d||!node)break;
    const operation=id.operation;
    if(!['lock','visibility','up','down','move'].includes(operation))break;
    if((node.locked||node.isLocked)&&operation!=='lock')break;
    if(operation==='move'&&!findSceneNode(d,id.targetID))break;
    if(operation==='visibility')assertSceneEditable(d,node.id);
    checkpoint();
    if(operation==='lock'){node.locked=node.isLocked=!(node.locked||node.isLocked);}
    else if(operation==='visibility'){
      const hidden=!!(node.hidden||node.isHidden||node.isParked);
      if(hidden){node.isParked=false;node.hidden=false;node.isHidden=false;}
      else if(node.type==='material')node.isParked=true;
      else node.hidden=true;
      if(!hidden&&state.selected===node.id){state.selected=null;state.multiSelected=[];}
    }else{
      const findParent=(nodes,target,parent=null)=>{
        for(const entry of nodes){if(entry.id===target)return parent;
          if(entry.type==='group'){
            const found=findParent(entry.children||[],target,entry);
            if(found!==undefined)return found;
          }}return undefined;
      };
      const parent=findParent(d.layers,node.id),siblings=parent?.children||d.layers;
      if(operation==='move'){
        const target=findSceneNode(d,id.targetID);
        const targetParent=id.relation==='inside'&&target.type==='group'?target:findParent(d.layers,target.id);
        const targetSiblings=targetParent?.children||d.layers;
        const withoutSource=targetSiblings.filter(entry=>entry.id!==node.id);
        const position=withoutSource.findIndex(entry=>entry.id===target.id);
        moveSceneNode(d,node.id,{parentID:targetParent?.id||null,
          beforeID:id.relation==='inside'?null:id.relation==='after'?target.id:withoutSource[position+1]?.id||null});
      }else{
        const sorted=[...siblings].sort((a,b)=>(a.zIndex??0)-(b.zIndex??0));
        const index=sorted.findIndex(entry=>entry.id===node.id),target=index+(operation==='up'?1:-1);
        if(target>=0&&target<sorted.length){
          const without=sorted.filter(entry=>entry.id!==node.id),neighbor=sorted[target];
          const beforeID=operation==='up'?without[without.findIndex(entry=>entry.id===neighbor.id)+1]?.id||null:neighbor.id;
          moveSceneNode(d,node.id,{parentID:parent?.id||null,beforeID});
        }
      }
    }
    saveProject();render();break;
  }
  case 'fabric-clear-selection':state.selected=null;state.multiSelected=[];render();break;
  case 'fabric-group-selection':{
    const d=current(),ids=[...new Set(state.multiSelected||[])];
    if(!d||ids.length<2)break;
    checkpoint();
    const groupID=groupSceneLayers(d,ids,{id:'group-'+uid(),name:'手帐组合'});
    state.selected=groupID;state.multiSelected=[groupID];
    saveProject();render();break;
  }
  case 'fabric-ungroup-selection':{
    const d=current(),target=state.selected||state.multiSelected?.[0];
    const entry=sceneLayerEntries(d,{hidden:true,ink:true}).find(item=>item.value.id===target);
    const groupID=findSceneNode(d,target)?.type==='group'?target:entry?.parents?.at(-1)?.id;
    if(!groupID)break;
    assertSceneEditable(d,groupID);
    checkpoint();ungroupSceneLayers(d,groupID);
    state.selected=null;state.multiSelected=[];saveProject();render();break;
  }
  case 'fabric-history-restore-draft':{
    const p=state.activeProject,entry=p?.drafts.find(d=>d.id===id);
    if(!entry||!confirm(`是否回到「${historyTitle(entry,p.drafts.indexOf(entry))}」？当前修改可通过撤销恢复。`))break;
    if(state.activeDraft===id)checkpoint();else resetEditorHistory(state);
    restoreHistoryDraft(p,id);state.activeDraft=id;state.selected=null;state.multiSelected=[];
    state.fabricInspectorOpen=false;saveProject();render();break;
  }
  case 'fabric-history-rename-draft':{
    const p=state.activeProject,entry=p?.drafts.find(d=>d.id===id);if(!entry)break;
    const name=prompt('历史记录名称',historyTitle(entry,p.drafts.indexOf(entry)));
    if(name===null)break;renameHistory(entry,name);saveProject();render();break;
  }
  case 'fabric-history-delete-draft':{
    const p=state.activeProject,entry=p?.drafts.find(d=>d.id===id);if(!entry)break;
    if(!confirm(`删除历史记录「${historyTitle(entry,p.drafts.indexOf(entry))}」？`))break;
    deleteDraft(p,id);state.activeDraft=p.activeDraftID;state.selected=null;state.multiSelected=[];
    resetEditorHistory(state);saveProject();render();break;
  }
  case 'fabric-history-restore-auto':{
    const p=state.activeProject;if(!p||!confirm('恢复自动快照会替换当前编辑画面，是否继续？'))break;
    makeAutoSceneSnapshot(p,{reason:'before-restore',force:true});
    const restored=restoreAutoSceneSnapshot(p,id);p.drafts=restored.drafts;
    p.activeDraftID=restored.activeDraftID;state.activeDraft=restored.activeDraftID;
    state.selected=null;state.multiSelected=[];resetEditorHistory(state);saveProject();render();break;
  }
  case 'fabric-history-rename-auto':{
    const p=state.activeProject,entry=p?.autoSceneSnapshots?.find(s=>s.id===id);if(!entry)break;
    const name=prompt('历史记录名称',entry.title||new Date(entry.at).toLocaleString());
    if(name===null)break;entry.title=String(name).trim().slice(0,80)||entry.title;
    saveProject();render();break;
  }
  case 'fabric-history-delete-auto':{
    const p=state.activeProject,entry=p?.autoSceneSnapshots?.find(s=>s.id===id);if(!entry)break;
    if(!confirm(`删除历史记录「${entry.title||new Date(entry.at).toLocaleString()}」？`))break;
    p.autoSceneSnapshots=p.autoSceneSnapshots.filter(s=>s.id!==id);
    if(!p.autoSceneSnapshots.some(s=>s.hash===entry.hash))delete p.autoSceneSnapshotStore?.[entry.hash];
    saveProject();render();break;
  }
  case 'fabric-add-shape':{
    const d=current();if(!d)break;
    checkpoint();
    const shape=typeof id==='string'?configureShape(primitive(id,d),id):
      {...structuredClone(id),id:uid(),locked:false,hidden:false};
    shape.x=d.canvas.width/2;shape.y=d.canvas.height/2;
    shape.type='shape';shape.zIndex=Math.max(0,...d.layers.map(node=>node.zIndex||0))+1;
    d.primitives.push(shape);
    state.selected=shape.id;state.multiSelected=[shape.id];state.tool='select';saveProject();render();break;
  }
  case 'fabric-add-material':{
    const a=asset(id),d=current();if(!a||!d)break;
    if(a.kind!=='tape'&&d.items.some(item=>item.assetID===a.id)){
      toast('此方案已取用这件素材；可以编辑或裁切已有素材');break;
    }
    if(!(a.physicalWidthMM>0&&a.physicalHeightMM>0)){
      toast('请先确认素材实物尺寸');break;
    }
    checkpoint();
    const item=itemFromAsset(a,d,d.canvas.width/2,d.canvas.height/2,
      Math.max(0,...d.layers.map(node=>node.zIndex||0))+1);
    item.materialUnitIndex=a.kind==='tape'
      ?Math.max(-1,...d.items.filter(existing=>existing.assetID===a.id)
        .map(existing=>existing.materialUnitIndex??0))+1:0;
    d.items.push(item);
    state.selected=item.id;state.multiSelected=[item.id];state.tool='select';saveProject();render();break;
  }
  case 'fabric-start-tape':{
    const a=asset(id);if(a?.kind!=='tape'||!current())break;
    if(!(a.physicalWidthMM>0&&a.physicalHeightMM>0)){
      toast('请先在素材详情确认胶带的真实宽度和样段长度');break;
    }
    state.tapeAssetID=a.id;state.tapeEditID=null;
    state.tapeOptions={widthMM:tapeDimensions(a).widthMM,
      textureMode:a.tapeRepeatMode==='repeatablePattern'?'repeat':'stretch',
      startCap:'square',endCap:'square'};
    state.tool=state.toolHighlight='tape';
    state.selected=null;state.multiSelected=[];render();
    toast('用笔或鼠标在画布上拖出胶带段；iPad 手指可移动画布');break;
  }
  case 'fabric-place-tape':{
    const a=asset(state.tapeAssetID),d=current();if(!a||!d)break;
    try{
      const original=state.tapeEditID?d.items.find(item=>item.id===state.tapeEditID):null;
      const item=original?reshapeTapeStrip(original,a,d,id,state.tapeOptions):
        createTapeStrip(a,d,id,Math.max(0,...d.layers.map(node=>node.zIndex||0))+1,state.tapeOptions);
      if(!original)item.materialUnitIndex=Math.max(-1,...d.items.filter(existing=>existing.assetID===a.id)
        .map(existing=>existing.materialUnitIndex??0))+1;
      const trial=attachSceneV2(structuredClone(d));
      if(original)Object.assign(trial.items.find(node=>node.id===original.id),structuredClone(item));
      else trial.items.push(structuredClone(item));
      validateScenePhysical(trial,state.assets);
      checkpoint();if(original){Object.assign(original,item);state.tapeEditID=null;state.tool='select';
        state.selected=original.id;state.multiSelected=[original.id];}
      else d.items.push(item);
      saveProject();render();
    }catch(error){toast(error.message||'胶带段未生成');}
    break;
  }
  case 'fabric-tape-option':{
    const a=asset(state.tapeAssetID);if(!a)break;
    const next={...(state.tapeOptions||{})};
    if(id==='widthMM'||id==='sourceOffsetMM'||id==='sourceWindowMM'||id==='capDepthMM'){
      const number=Number(value);if(!Number.isFinite(number))break;next[id]=number;
      if(id==='widthMM'&&(number<.5||number>200))break;
    }else if(['textureMode','startCap','endCap'].includes(id))next[id]=value;
    else if(id==='reverseTexture')next[id]=!!value;
    else break;
    state.tapeOptions=next;render();break;
  }
  case 'fabric-tape-redraw':{
    const d=current(),node=d?.items.find(item=>item.id===state.selected);
    const a=node&&asset(node.assetID);if(!node?.tapeStrip||!a)break;
    state.tapeAssetID=a.id;state.tapeEditID=node.id;
    state.tapeOptions={...node.tapeStrip,widthMM:node.tapeStrip.physicalWidthMM};
    state.tool=state.toolHighlight='tape';render();
    toast('在画布上重画胶带中心线；完成后更新同一胶带段');break;
  }
  case 'fabric-replace-material':{
    const d=current(),selectedID=state.selected;if(!d||!selectedID)break;
    try{
      const trial=attachSceneV2(structuredClone(d));
      replaceSceneMaterial(trial,selectedID,id,state.assets);
      validateScenePhysical(trial,state.assets);
      checkpoint();replaceSceneMaterial(d,selectedID,id,state.assets);
      saveProject();render();toast('素材已更换，位置与层级已保留');
    }catch(error){toast(error.message||'无法更换素材');}
    break;
  }
  case 'fabric-unpark':{
    const d=current(),item=d&&findSceneNode(d,id);if(!item)break;
    if(item.isParked){checkpoint();item.isParked=false;saveProject();}
    state.selected=item.id;state.multiSelected=[item.id];state.tool='select';render();break;
  }
  case 'fabric-select-layer':state.selected=id;state.multiSelected=[id];
    if(!state.cutSession)state.tool='select';render();break;
  case 'fabric-paper':{
    const d=current();if(!d)break;
    if(id==='pattern'&&['plain','grid','lines','dots'].includes(value)){
      if(d.paperPattern===value)break;
      checkpoint();d.paperPattern=value;
    }else if(id==='columns'&&typeof value==='boolean'){
      if(d.paperColumns===value)break;
      checkpoint();d.paperColumns=value;
    }else if(id==='color'&&/^#[0-9a-f]{6}$/i.test(value)){
      if(d.paperColor===value)break;
      checkpoint();d.paperColor=value;
    }else break;
    saveProject();render();break;
  }
  case 'tool':{
    // A tool click selects its mode. A scene object is created only by an
    // explicit canvas placement or picker choice, never by this fallback.
    state.tool=value;
    if(value==='material'){openMaterialPicker();break;}
    render();break;
  }
  case 'zoom-in':await actionStore.dispatch({type:'editor/zoom',payload:{delta:.15}});break;case 'zoom-out':await actionStore.dispatch({type:'editor/zoom',payload:{delta:-.15}});break;
  case 'paper-menu':state.editorPanel=!state.editorPanel;state.selected=null;render();break;
  case 'undo':case 'redo':{
    const session=state.cutSession||state.inspectorSession;
    if(session){
      if(state.inspectorSession)flushInspectorSnapshot();
      if(state.cutPreview){state.cutPreview=null;render();break;}
      const selected=stepSceneEditSession(session,action);
      if(selected!==null){state.selected=selected;state.multiSelected=selected?[selected]:[];render();}
    }else await actionStore.dispatch({type:'editor/'+action});
    break;
  }
  case 'duplicate':{
    const d=current(),node=d&&findSceneNode(d,state.selected);
    if(node?.type==='ink'){
      assertSceneEditable(d,node.id);
      checkpoint();const [copy]=copySceneLasso(d,[node.id],uid);
      state.selected=copy;state.multiSelected=[copy];state.fabricSelectionBounds=sceneLassoBounds(d,[copy]);
      saveProject();render();break;
    }
    editSelected((e,d)=>{
      if(!e)throw Error('没有选中可复制的图层');
      const copy={...structuredClone(e.value),id:uid(),x:e.value.x+25,y:e.value.y+25};
      if(e.kind==='material'){
        const a=asset(e.value.assetID);if(!a)throw Error('原素材不存在');
        if(a.kind!=='tape')throw Error('此方案已取用这件素材；可复制文字或图形，或裁切原素材');
        copy.materialUnitIndex=Math.max(-1,...d.items.filter(item=>item.assetID===a.id)
          .map(item=>item.materialUnitIndex??0))+1;
        const trial=attachSceneV2(structuredClone(d));trial.items.push(structuredClone(copy));
        validateScenePhysical(trial,state.assets);
        d.items.push(copy);
      }else(e.kind==='shape'?d.primitives:d.textBlocks).push(copy);
    });break;
  }
   case 'flip':editSelected(e=>{e.value.isFlippedHorizontally=!e.value.isFlippedHorizontally;});break;
  case 'front':editSelected((e,d)=>{const parent=e.parents?.at(-1);moveSceneNode(d,e.value.id,{parentID:parent?.id||null});});break;
  case 'delete-object':{
    const d=current(),node=d&&findSceneNode(d,state.selected);
    if(node?.type==='ink'){
      assertSceneEditable(d,node.id);
      checkpoint();deleteSceneLasso(d,[node.id]);state.selected=null;state.multiSelected=[];
      state.fabricSelectionBounds=null;saveProject();render();break;
    }
    editSelected((e,d)=>{const key=e.kind==='material'?'items':e.kind==='shape'?'primitives':'textBlocks';if(e.kind==='material'&&retireSplitPiece(d,state.selected)){state.selected=null;return;}d[key]=d[key].filter(x=>x.id!==state.selected);state.selected=null;});break;
  }
  case 'restore-baseline':editSelected(e=>{const b=e.value.generationBaseline;if(b){Object.assign(e.value,structuredClone(b));delete e.value.manualGeometryOverride;e.value.userOverrideFlags=[];}});break;
  case 'park':editSelected(e=>{if(e.kind==='material'){e.value.isParked=true;state.selected=null;}});break;
  case 'unpark':editSelected((e,d)=>{const item=d.items.find(x=>x.id===id);if(item)item.isParked=false;});break;
  case 'save-work':{const p=state.activeProject,offline=state.offlineEditingReturnID===p?.id;p.isDraft=false;saveProject();await flushSave();saveAISnapshotInBackground(p);if(offline){await matchingSession.reflectProject(p);state.offlineEditingReturnID=null;navigateBack('matching');}toast(cloudEnabled?'作品已暂存，正在后台同步':'作品已保存');break;}
  case 'match-open-result':await matchingSession.open(id);break;
  case 'match-restore':{const restored=await matchingSession.restoreDeleted(id);if(restored)toast('作品已按你的选择恢复');break;}
  case 'match-stop':matchingSession.stop();break;
  case 'export-png':await exportPNG();break;case 'print':await printPage();break;case 'export-pdf':await exportPDF();break;
  case 'creative-json':openCreativeJSON();break;
  case 'import-save-defaults':{
    state.preferences=savePreferences({...state.preferences,
      paperSize:state.paperSize,paperOrientation:state.paperOrientation,
      orientation:state.paperOrientation,wholePaper:state.wholePaper,balanceLight:state.balanceLight,
      recognition:state.importRecognition||state.preferences.recognition,
      recognitionShapeRegularization:state.importShapeRegularization!==false,
      recognitionApertures:state.importApertures!==false,
      materialColorMode:state.importMaterialColorMode||'auto',
      customPaperWidth:state.customImportWidth,customPaperHeight:state.customImportHeight});
    if(cloudEnabled)await db.put('meta',cloudPreferencesRecord(state.preferences));
    toast('已设为以后导入的默认参数');break;
  }
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
  case 'reset-all-account-data':case 'dev-reset-cloud':{
    if(!cloudEnabled)throw Error('请先登录 CloudBase 账号');
    const healthResponse=await cloudApiRequest('/api/platform-health',{method:'GET'});
    const health=await healthResponse.json();
    if(!healthResponse.ok||!health.accountReset)
      throw Error('CloudBase 账号清空迁移尚未部署，未修改任何资料');
    if(!confirm('将清空这个账号的所有素材、作品、设置和最近删除，并删除本机待同步资料；登录身份仍保留。此操作无法恢复。继续吗？'))break;
    if(prompt('再次确认：请输入“清空账号”')!=='清空账号')break;
    const operationId=crypto.randomUUID();let accepted=null,knownRejected=false,requestStarted=false;
    resetWorkflowActive=true;
    openOverlay(createElement(AccountResetProgress,{phase:'正在停止旧同步并核对云端版本…'}));
    try{
      await db.runExclusiveAccountReset(async()=>{
        const baseline=await db.accountResetBaseline();
        openOverlay(createElement(AccountResetProgress,{phase:'正在提交账号清空事务…'}));
        try{
          requestStarted=true;
          const response=await cloudApiRequest('/api/account-reset',{method:'POST',
            body:JSON.stringify({...baseline,operation_id:operationId,confirmation:'清空账号'})});
          const result=await response.json();
          if(!response.ok)throw Object.assign(Error(result.error||'账号清空未获云端确认'),
            {status:response.status});
          if(result.accepted!==true||!result.resetId)throw Error('云端清空结果无效，需重新核对');
          accepted=result;
        }catch(error){
          // A lost response can follow a committed reset. Never resume old
          // outbox writes until a fresh server read proves nonacceptance.
          const {data,error:probeError}=await cloudClient().from('shiye_records').select('record')
            .eq('user_id',state.accountId).eq('store','meta')
            .eq('id','shiye-reset-barrier').maybeSingle();
          if(probeError)throw Error('清空结果暂无法确认，请重新打开页面；旧同步已暂停');
          if(data?.record?.operationId===operationId)
            accepted={accepted:true,resetId:data.record.resetId};
          else{
            // Only a definite validation/conflict response proves the
            // server rejected the mutation. Timeout/5xx are indeterminate.
            knownRejected=[400,401,403,409].includes(Number(error.status));
            throw error;
          }
        }
      });
      if(!accepted?.resetId)throw Error('账号清空结果尚未确认');
      openOverlay(createElement(AccountResetProgress,{phase:'云端资料已清空，正在删除本机旧缓存…'}));
      await db.purgeLocalAfterCloudReset();
      const result=await eraseSiteAppData({preserveAuthentication:true});
      if(result.errors.length)throw Error('云端已清空，但本机缓存未能完全删除：'+result.errors.join('；'));
      localStorage.setItem(observedResetKey(state.accountId),accepted.resetId);
      location.reload();break;
    }catch(error){
      if(knownRejected||!requestStarted&&!String(error.message).includes('账号资料已重新开始')){
        db.abortExclusiveAccountReset();resetWorkflowActive=false;closeOverlay();
      }
      else openOverlay(createElement(AccountResetProgress,{phase:'清空状态仍需核对。请重新打开页面；旧同步保持暂停。'}));
      throw error;
    }
  }
  case 'backup':await backup();break;case 'restore':backupInput.click();break;case 'export-app-diagnostics':exportAppDiagnostics();break;case 'backup-emergency':{await flushSave();const blob=await db.createEmergencyBackup();download(blob,'拾页待同步应急包-'+new Date().toISOString().slice(0,10)+'.shiyerecovery');toast('应急包已导出，请妥善保存，包含私人图片和文字');break;}case 'restore-emergency':emergencyInput.click();break;
  case 'recover-pre-conflict':{
    const entries=await db.listPreConflictScenes();
    if(!entries.length){toast('本设备还没有检测到画布并发冲突');break;}
    openOverlay(createElement(PreConflictDialog,{entries,onClose:closeOverlay,onRestore:async entry=>{
      if(!confirm('保留当前云端作品，另存此冲突前本机画布？'))return false;
      const result=await db.restorePreConflictScene(entry.key);
      await refresh();toast('已恢复新作品：'+result.title);
    }}));break;
  }
  case 'restore-trash':await restoreTrash(id);break;
  case 'purge-trash-item':{
    if(!confirm('移除这项恢复记录？素材及云端图片可能仍被已有作品引用。此操作无法撤销。'))break;
    await changeTrash({db,state,ids:[id]});render();break;
  }
  case 'purge-all-trash':{
    if(!state.trash.length||!confirm('移除最近删除中的所有恢复记录？此操作无法撤销。'))break;
    await changeTrash({db,state,ids:state.trash.map(item=>item.id)});render();break;
  }
  case 'clean-unused-images':{
    if(!cloudEnabled)throw Error('请先登录 CloudBase 账号');
    const response=await cloudApiRequest('/api/account-gc',{method:'POST',body:'{}'});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'云端图片核查暂不可用');
    toast(result.deleted?`本轮已回收 ${result.deleted} 个云端文件；后台会继续核查`:
      '云端图片已核查；无达到保留期的可回收文件');break;
  }
  case 'help':{openOverlay(createElement(HelpDialog,{onClose:closeOverlay,onExport:async()=>{const {runtimeIssueReport}=await import('./runtime-diagnostics.js');download(new Blob([runtimeIssueReport()],{type:'application/json'}),'拾页运行诊断.json');}}));break;}case 'settings-open':captureSettings();await actionStore.dispatch({type:'settings/section',payload:{section:value}});break;case 'settings-back':if(state.settingsSection){captureSettings();await actionStore.dispatch({type:'settings/section',payload:{section:null}});}else navigateBack(settingsSession?.returnRoute||'series');break;case 'settings-save':{captureSettings();const cfg=state.aiSettings;if(!cfg.model.trim())throw Error('请输入模型 ID');const endpoint=new URL(cfg.endpoint);if(endpoint.protocol!=='https:')throw Error('API 地址必须使用 HTTPS');if(cfg.provider!=='custom'&&endpoint.host!==new URL(AI_PROVIDERS[cfg.provider].endpoint).host)throw Error('服务商与 API 地址不一致；自定义地址请选“自定义兼容接口”');const returnRoute=settingsSession?.returnRoute||'series';if(cloudEnabled){await db.transaction(['meta'],tx=>{tx.objectStore('meta').put(cloudPreferencesRecord(state.preferences));tx.objectStore('meta').put(cloudAISettingsRecord(cfg));});}state.aiSettings=saveAISettings(cfg);state.preferences=savePreferences(state.preferences);deferredSyncedPreferences=null;deferredSyncedAISettings=null;settingsSession=null;state.settingsSection=null;navigateBack(returnRoute);toast('设置已保存');break;}
}}catch(e){console.error(e);recordRuntimeIssue('handled',e,state.route,{phase:'action'});toast(e.message||'操作失败');}}
function editSelected(fn){const d=current(),e=editorEntry(d).find(x=>x.value.id===state.selected);if(!e&&state.selected)return;
  if(e)assertSceneEditable(d,e.value.id);
  checkpoint();fn(e,d);saveProject();render();}
function historyStep(from,to){view.flushInkCommit?.({renderUI:false,force:true});view.endTextEditing?.();const d=current(),snapshot=takeEditorHistoryStep(state,from,to,d);if(!snapshot)return false;for(const key of Object.keys(d))delete d[key];Object.assign(d,snapshot);state.activeDraft=snapshot.id;saveProject();return true;}

function captureMatchingDirection(){
  state.matchStyles=readMatchSelection('match-style',state.matchStyle);
  state.matchPurposes=readMatchSelection('match-purpose',state.matchPurpose);
  state.matchContentPolicy=view.querySelector('#match-content-policy')?.value||state.matchContentPolicy||'original';
  state.matchIntent=view.querySelector('#match-intent')?.value||'';
  state.matchMode=view.querySelector('#match-mode')?.value||state.matchMode;
  state.matchRatio=view.querySelector('#match-ratio')?.value||'a4';normalizeMatchingDirection(state);
}
function createMatchingProject(automatic=true){const scope=matchingScope();if(!scope.candidateAssetIDs.length||!automatic&&!state.basket.length)throw Error('请先选择素材');const p=project('新的手账',{mode:state.matchMode||'single',ratio:state.matchRatio||'a4',style:state.matchStyle||'随材而定'}),d=p.drafts[0];d.items=automatic?[]:physicalPlacement(d,state.assets,state.basket.slice(0,8));p.candidateAssetIDs=automatic?scope.candidateAssetIDs:[...state.basket];p.materialPriority=automatic?scope:{...scope,available:[],candidateAssetIDs:[...state.basket]};p.purpose=state.matchPurpose;p.intent=state.matchIntent;p.contentPolicy=state.matchContentPolicy;p.textPresentation='mixed';p.userText='';p.providedFacts='';p.styles=[...state.matchStyles];p.purposes=[...state.matchPurposes];p.requiredAssetIDs=[...scope.required];p.processing='自由拆解';return p;}
async function exportOfflineCreation(){
  if(!matchingScope().candidateAssetIDs.length){toast('请先选择素材');return;}
  captureMatchingDirection();
  const button=view.querySelector('[data-act="match-export-gpt"]'),controller=new AbortController(),started=performance.now();
  const timing={},report={cacheHits:0,covers:0,materials:0};
  if(button){button.disabled=true;button.textContent='正在准备 AI 参考…';}
  const cancelExport=()=>{controller.abort(Error('已取消导出'));closeOverlay();};
  const progress=text=>openOverlay(createElement(OfflineHandoffLoading,{progress:text,onClose:cancelExport}));
  progress('正在检查素材…');
  const canceled=()=>{if(controller.signal.aborted)throw controller.signal.reason||Error('已取消导出');};
  const measured=async(name,task)=>{const now=performance.now();try{return await task();}finally{timing[name]=Math.round(performance.now()-now);}};
  try{
    const p=createMatchingProject(),assetsSnapshot=structuredClone(state.assets),aliases=materialAliases(p.candidateAssetIDs),previews=[],cfg=structuredClone(state.aiSettings);
    const account=await offlineTaskAccount();canceled();
    const all=Object.entries(aliases);report.materials=all.length;
    // Editable task packages include the current full-resolution source image;
    // image-only requests use a smaller cover for visual prompting.
    const materialWork=measured('materials',()=>mapOfflineExportLimited(all,3,async([alias,id])=>{
        const chosen=assetsSnapshot.find(item=>item.id===id);
        if(!chosen)throw Error('创作素材已变更，请重新导出任务包');
        if(cfg.deliveryMode==='image'){
          const row=await prepareOfflineMaterialPreview({asset:chosen,account,signal:controller.signal,
            loadVariant:(asset,edge)=>asset.staticPath
              ?fetch(asset.staticPath).then(response=>{if(!response.ok)throw Error('内置素材封面无法读取');return response.blob();})
              :loadOfflineMaterialCover(asset,edge,{preview:(id,pixels)=>db.previewBlob(id,pixels,{allowRemoteOriginal:false}),original:id=>db.get('blobs',id)})});
          if(row.cacheHit)report.cacheHits++;else report.covers++;
          return {alias,bytes:row.bytes};
        }
        // The editable Scene renders the same source pixels as the App. A
        // 480px cover cannot support reliable source crops or cut-out windows.
        let blob=chosen.staticPath?await fetch(chosen.staticPath).then(response=>{if(!response.ok)throw Error('内置素材原图无法读取');return response.blob();}):(await db.get('blobs',chosen.blobId))?.data;
        if(!blob&&chosen.blobId){const url=await privateImages.load(chosen.blobId,true);blob=await fetch(url).then(response=>response.blob());}
        if(!(blob instanceof Blob)||!blob.size)throw Error('素材「'+chosen.title+'」的原图不可用');
        const bytes=new Uint8Array(await blob.arrayBuffer());
        report.covers++;
        return {alias,bytes,width:chosen.imageSize?.width||null,height:chosen.imageSize?.height||null,filename:chosen.originalFilename||chosen.title};
      },{signal:controller.signal,onDone:(done,total)=>progress('准备素材图片 '+done+'/'+total)}));
    const materialRows=await materialWork;
    canceled();previews.push(...materialRows);
    progress('正在校验内容并生成 ZIP 文件…');
    const result=await measured('package',async()=>{const {createOfflineHandoff}=await import('./offline-creation.js');return createOfflineHandoff({project:p,assets:assetsSnapshot,aliases,previews,settings:{...cfg,includeThumbnails:true}});});
    canceled();
    p.offlineBundleId=result.source.bundleId;
    canceled();
    timing.total=Math.round(performance.now()-started);
    console.info('[shiye offline export timing]',{...timing,...report,packageBytes:result.packageBytes,imageBytes:result.imageBytes});
    const diagnostics='总耗时 '+timing.total+' ms · 素材 '+timing.materials+' ms · 打包 '+timing.package+' ms · 缓存命中 '+report.cacheHits+'/'+report.materials+' · 封面读取 '+report.covers;
    let prefetchStarted=false;
    const prefetchForImport=()=>{
      if(prefetchStarted||!cloudEnabled)return;
      prefetchStarted=true;
      const run=()=>void prefetchOfflineImportImages(assetsSnapshot.filter(item=>p.candidateAssetIDs.includes(item.id)),{
        loadVariant:(id,edge)=>privateImages.load(id,edge,{background:true,allowRemoteOriginal:false}),
        isCurrent:()=>state.accountId===account,
        onError:(error,id)=>console.warn('创作导入图片后台预载失败',id,error?.message)
      });
      if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:2000});
      else setTimeout(run,200);
    };
    const openPackage=()=>{const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=result.filename;link.target='_blank';link.rel='noopener';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);prefetchForImport();};
    const copyPrompt=async(prompt,input)=>{
      input?.select();
      let copied=false;
      try{copied=!!document.execCommand('copy');}catch{}
      if(!copied)await navigator.clipboard.writeText(prompt);
      openPackage();
    };
    const sharePackage=async()=>{
      const file=new File([result.blob],result.filename,{type:'application/zip'});
      if(!navigator.canShare?.({files:[file]})){openPackage();toast('设备不支持文件分享，已打开任务包');return;}
      try{await navigator.share({files:[file]});prefetchForImport();}
      catch(error){if(error?.name!=='AbortError'){openPackage();toast('分享未完成，已打开任务包');}}
    };
    openOverlay(createElement(OfflineHandoffReady,{result,project:p,diagnostics,
      onClose:closeOverlay,onCopy:copyPrompt,onShare:sharePackage,
      onDownload:()=>{download(result.blob,result.filename);prefetchForImport();},
      onImportFile:()=>{offlineSnapshotProject=p;creationResultInput.click();},
      onImportText:importOfflineText,onPaste:()=>readClipboardText(navigator.clipboard)}));
  }catch(error){if(!controller.signal.aborted){console.error(error);toast('AI 参考导出失败：'+error.message);closeOverlay();}}finally{if(button){button.disabled=false;button.textContent='导出给网页版 AI';}}
}
function openOfflineImportDialog(){
  openOverlay(createElement(OfflineImportDialog,{onClose:closeOverlay,
    onImport:importOfflineText,onPaste:()=>readClipboardText(navigator.clipboard),
    onFile:()=>{offlineSnapshotProject=null;creationResultInput.click();}}));
}
async function importOfflineProject(p,{aiGenerated=true}={}){await flushSave();if(aiGenerated)p.aiGenerated=true;await db.stageProject(p);state.projects.push(p);state.activeProject=p;state.activeDraft=p.activeDraftID;resetEditorHistory(state);state.offlineEditingReturnID=null;state.tool='select';if(modal.open)modal.close();closeOverlay();route('editor');toast(p.creationVerification?.preview==='mismatch'?'已暂存可编辑草稿；外部预览或清单有差异，请核对画面':'已暂存可编辑草稿；请核对画面与正文');}
async function offlineTaskAccount(){return cloudEnabled?(await requireCloudUser()).id:'browser';}
async function importOfflineText(text){const {importEditableWork}=await import('./offline-creation.js');return importOfflineProject(importEditableWork(text,state.assets));}
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
  captureMatchingDirection();
  const choices=manualLayoutChoices({assets:state.assets,basket:state.basket,styles:state.matchStyles,purposes:state.matchPurposes});
  openOverlay(createElement(ManualLayoutDialog,{choices,onClose:closeOverlay,onChoose:id=>createFromBasket(id)}));
}
function openMaterialPicker(){
  openOverlay(createElement(MaterialPickerDialog,{assets:visibleMaterials(state.assets),source:image,
    onClose:closeOverlay,onPick:id=>{
      const a=asset(id),d=current();checkpoint();
      const i=itemFromAsset(a,d,d.canvas.width/2,d.canvas.height/2,20,false);
      d.items.push(i);state.selected=i.id;state.tool='select';saveProject();render();
    }}));
}
function openCreativeJSON(){
  const aliases=Object.entries(materialAliases(state.basket)).map(([key,id])=>`${key} = ${asset(id)?.title||id}`).join(' · ');
  openOverlay(createElement(CreativeJSONDialog,{aliases,onClose:closeOverlay,onApply:text=>{
    const result=applyToolCalls(text,current(),state.assets,materialAliases(state.basket));
    if(result.committed){checkpoint();const p=state.activeProject,index=p.drafts.findIndex(x=>x.id===state.activeDraft);p.drafts[index]=result.draft;saveProject();render();}
    return result.results.map(x=>`${x.ok?'✓':'×'} ${x.name}: ${x.detail}`).join('\n');
  }}));
}
async function modelImage(a,cropRect=null,maxPixels=512,transparent=false){
  const outputPixels=!cropRect&&maxPixels<=512?Math.min(maxPixels,COVER_EDGE):maxPixels;
  const sourceEdge=cropRect
    ?Math.min(1920,Math.max(COVER_EDGE,Math.ceil(maxPixels/Math.max(cropRect.width,cropRect.height))))
    :Math.max(COVER_EDGE,maxPixels>512?maxPixels:COVER_EDGE);
  const blob=await loadModelImageSource(a,{
    preview:(id,edge)=>db.previewBlob(id,edge,{allowRemoteOriginal:false}),
    fetchStatic:path=>fetch(path).then(r=>r.blob())
  },{edge:sourceEdge});
  const bitmap=await decodeImageBlob(blob);
  try{
    const canvas=document.createElement('canvas'),crop=cropRect||{x:0,y:0,width:1,height:1};
    const cw=crop.width*bitmap.width,ch=crop.height*bitmap.height;
    const scale=Math.min(1,outputPixels/Math.max(cw,ch));
    canvas.width=Math.max(1,Math.round(cw*scale));canvas.height=Math.max(1,Math.round(ch*scale));
    const ctx=canvas.getContext('2d');
    if(!transparent){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);}
    ctx.drawImage(bitmap,crop.x*bitmap.width,crop.y*bitmap.height,cw,ch,0,0,canvas.width,canvas.height);
    return transparent?canvas.toDataURL('image/png'):canvas.toDataURL('image/jpeg',.78);
  }finally{bitmap.close?.();}
}
function readMatchSelection(id,fallback){const e=view.querySelector('#'+id);return e?[...e.selectedOptions].map(x=>x.value):fallback?[fallback]:[];}
let aiController=null,aiReport=null;
function openAICreation(){state.aiPanel=true;if(!state.aiPrompt)state.aiPrompt=state.matchIntent||'';render();view.querySelector('.inline-ai-panel')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
function publishAIStatus(){
  window.dispatchEvent(new CustomEvent('shiye-ai-status',{detail:{
    busy:!!state.aiBusy,progress:state.aiProgress||'',hasReport:!!aiReport
  }}));
}
function handleAIPanelAction(action){
  if(action==='close'){state.aiPanel=false;render();}
  else if(action==='settings'){state.settingsSection='AI 与创作';route('settings');}
  else if(action==='start')void startAICreation();
  else if(action==='stop')aiController?.abort(Error('已停止创作，之前成功的步骤已保存'));
  else if(action==='report'&&aiReport)download(new Blob([
    JSON.stringify(publicAIDiagnosticReport(aiReport),null,2)],{type:'application/json'}),
    `拾页AI诊断-${new Date().toISOString().slice(0,10)}.json`);
}
async function startAICreation(){
 if(state.aiBusy)return;
 const targetProject=state.activeProject,targetDraft=current();if(!targetProject||!targetDraft)return;
 const accountID=state.accountId,sourceProject=structuredClone(targetProject),sourceDraft=structuredClone(targetDraft),assetsSnapshot=structuredClone(state.assets),prompt=state.aiPrompt,cfg=structuredClone(state.aiSettings),{key,model}=cfg;
 const findAsset=id=>assetsSnapshot.find(a=>a.id===id),pscope=targetProject.materialPriority;
 const ids=[...new Set([...(targetProject.candidateAssetIDs||[]),...(pscope?[]:state.basket),...(sourceDraft.items||[]).map(x=>x.assetID)])].filter(id=>findAsset(id)&&!pscope?.excluded?.includes(id));
 if(cfg.deliveryMode==='image'){
  if(!ids.length){state.aiProgress='请先在素材搭配中选择素材。';render();return;}
  const controller=new AbortController();aiController=controller;state.aiBusy=true;state.aiProgress='正在准备图像生成…';render();
  try{const blob=await generatePageImage({settings:cfg,project:sourceProject,draft:sourceDraft,assets:assetsSnapshot,ids,theme:prompt,createImage:modelImage,signal:controller.signal,onProgress:message=>{state.aiProgress=message;publishAIStatus();}});if(controller.signal.aborted||state.accountId!==accountID)throw Error('创作已停止或账号已切换');await saveGeneratedImageSnapshot(blob,sourceProject);state.aiProgress='图片已由 GPT 图像模型直接生成，并保存到「画面快照」。当前可编辑画布未改变。';}
  catch(error){console.error(error);recordRuntimeIssue('handled',error,state.route,{phase:'ai'});state.aiProgress='图像生成失败：'+explainUserError(error,'图像创作');}
  finally{if(aiController===controller)aiController=null;state.aiBusy=false;if(state.route==='editor')render();}
  return;
 }
 if(!key){state.aiProgress='请先在设置 → AI 与创作保存所选服务的 API 密钥。';render();return;}if(!ids.length){state.aiProgress='请先在素材搭配中选择素材。';render();return;}
 let recorder;const projectID=targetProject.id,controller=new AbortController();
 const assertRun=createCreativeRunGuard({accountID,ids,assets:assetsSnapshot,getAccount:()=>state.accountId,getAsset:id=>state.assets.find(a=>a.id===id),signal:controller.signal});
 const checkpoints=createCreativeCheckpoint({getProject:()=>state.projects.find(item=>item.id===projectID),targetDraftID:sourceDraft.id,expectedDraft:sourceDraft,newDraftID:uid,
  persist:async active=>{saveSpecificProject(active);await flushSave();}});
 checkpoint();aiController=controller;state.aiBusy=true;state.aiProgress='正在准备素材预览…';aiReport={date:new Date().toISOString(),model,parameters:{generationMode:cfg.generationMode,temperature:cfg.temperature,maxTokens:cfg.maxTokens,materialCount:ids.length},rounds:[],outcome:'started'};render();
 try{
  recorder=await createAIRecorder({db,model,key,accountId:state.accountId||'browser'});const vision=supportsVision(cfg);
  const {images}=await prepareCreativeRunInputs({project:sourceProject,draft:sourceDraft,assets:assetsSnapshot,ids,settings:{...cfg,supportsVision:vision},createImage:modelImage,guard:assertRun});
  const output=await runCreativeAgent({...creativeRunParameters({project:sourceProject,draft:sourceDraft,assets:assetsSnapshot,ids,settings:cfg,prompt}),images,request:recorder.request,signal:controller.signal,
   onResponse:recorder.response,
   onProgress:progress=>{state.aiProgress=creativeProgressText(progress);publishAIStatus();},
   onScene:vision?async d=>{assertRun();return (await rasterize(d,.7)).toDataURL('image/jpeg',.8);}:undefined,
   onFinalScene:async d=>{assertRun();return (await rasterize(d,Math.min(1.5,2000/Math.max(d.canvas.width,d.canvas.height)))).toDataURL('image/jpeg',.8);},
   onInspection:vision?async data=>{const parts=[];for(const m of data?.materials||[]){assertRun();const a=findAsset(m.assetID);if(a){const url=await modelImage(a,m.cropRect);if(url)parts.push({type:'text',text:m.key+' 的当前局部预览'},{type:'image_url',image_url:{url}});}}return parts;}:undefined,
   onTurn:async({turn,results,draft,text,review})=>{assertRun();aiReport.rounds.push({turn,tools:results.map(x=>({name:x.name,ok:x.ok,detail:x.detail})),review});state.aiProgress='第 '+turn+' 轮\n'+results.map(x=>(x.ok?'✓':'×')+' '+x.name+'：'+x.detail).join('\n')+(text&&cfg.generationMode!=='direct'?'\n'+text:'');if(hasCreativeSceneChange(results)){const committed=await checkpoints.commit(draft);if(committed.candidate)state.aiProgress+='\n检测到原稿已手动修改，AI 结果另存为候选方案。';}assertRun();await recorder.turn(turn,results,draft).catch(()=>{state.aiProgress+='\n诊断记录暂不可用；已提交的画布检查点不受影响。';});if(state.route==='editor')render();}
  });
  assertRun();await checkpoints.commit(output.draft);const completed=state.projects.find(item=>item.id===projectID);completed.aiGenerated=true;completed.deliveryMode=cfg.deliveryMode;saveSpecificProject(completed);await flushSave();if(['image','pdf'].includes(cfg.deliveryMode)){await saveProjectSnapshot({...completed,projectDocumentPath:null,activeDraftID:checkpoints.targetDraftID},{format:cfg.deliveryMode==='pdf'?'application/pdf':'image/png'});completed.aiSnapshotCreated=true;saveSpecificProject(completed);}
  aiReport.outcome='completed';aiReport.budget=output.budget;state.aiProgress+=checkpoints.candidateCreated?'\n结构已完成并另存 AI 候选；原稿手改未被覆盖。':'\n结构已完成，草稿已保存。';state.aiProgress+=output.draft.agentRun?.visualReview==='model-reviewed'?' GPT 已检查最终画面，仍可继续手改。':' 最终视觉请核对。';
 }catch(error){console.error(error);recordRuntimeIssue('handled',error,state.route,{phase:'ai'});aiReport.outcome=controller.signal.aborted?'stopped':'failed';aiReport.stopReason=error.code||aiReport.outcome;aiReport.budget=error.budget||null;aiReport.error=explainUserError(error,'创作');state.aiProgress+='\n'+aiReport.error+'。已保留成功的步骤。';}
 finally{await recorder?.finish(aiReport.outcome).catch(()=>{});if(aiController===controller)aiController=null;state.aiBusy=false;if(state.route==='editor')render();}
}
async function flattenGeneratedPage(d,p=state.activeProject,persistProject=true){
 const canvas=await rasterize(d,2),blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(Error('整页成图失败')),'image/png')),id=uid(),blobId=uid();
 const a={id,blobId,title:p.title+' · 整页成图',kind:'photo',role:'background',tags:[],reviewStatus:'ready',isProjectInternal:true,physicalWidthMM:d.canvas.width/d.canvas.height*d.physicalPageHeightMM,physicalHeightMM:d.physicalPageHeightMM,createdAt:new Date().toISOString()};
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
 void organizeSavedProjects([structuredClone(snapshot)]);
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
async function refresh({background=false,onlyChanged=false,skipCloudRefresh=false}={}){
  const sync=skipCloudRefresh?null:await db.refreshCloud();
  if(onlyChanged&&!sync?.changed)return;
  if(sync?.changed)privateImages.invalidate(sync.allBlobs?undefined:sync.blobIDs);
  const allStores=['assets','series','projects','trash','meta'];
  const changed=background&&onlyChanged&&sync?.incremental&&Array.isArray(sync.changedStores)
    ?new Set(sync.changedStores):null;
  const stores=changed?allStores.filter(store=>changed.has(store)):allStores;
  if(!stores.length)return; // A Blob-only commit has no catalog records to repaint.
  const values=await Promise.all(stores.map(db.all));
  const rows=Object.fromEntries(stores.map((store,index)=>[store,values[index]]));
  for(const store of stores){if(store==='meta')state.userTemplates=journalTemplateRecords(rows.meta);
    else state[store]=rows[store];}
  const meta=rows.meta;
  // Authenticated account metadata synchronizes display and all AI settings,
  // including provider-specific keys. Never serialize credentials into task ZIPs.
  const syncedPreferences=cloudEnabled&&meta?cloudPreferencesFromMeta(meta):null;
  if(syncedPreferences){
    if(settingsSession)deferredSyncedPreferences=structuredClone(syncedPreferences);
    else{state.preferences=savePreferences(migrateStoredPreferences(syncedPreferences));deferredSyncedPreferences=null;}
  }
  const syncedMatch=cloudEnabled&&meta?cloudMatchingSettingsFromMeta(meta):null;
  if(syncedMatch&&!matchingDefaultsPending&&!matchingDefaultsLocalEdited){
    cloudMatchingDefaults=syncedMatch;
    if(state.route!=='matching')applyMatchingDefaults(state,syncedMatch);
  }
  const syncedAI=cloudEnabled&&meta?cloudAISettingsFromMeta(meta):null;
  if(syncedAI){
    if(settingsSession)deferredSyncedAISettings=structuredClone(syncedAI);
    else{state.aiSettings=saveAISettings(syncedAI);deferredSyncedAISettings=null;}
  }
  if(stores.includes('projects')||stores.includes('trash'))await restorePendingProjects();
  if(cloudEnabled&&stores.includes('projects')&&state.route==='editor'&&state.activeProject){
    const stillExists=state.projects.some(project=>project.id===state.activeProject.id);
    if(!stillExists&&!dirtyProjects.has(state.activeProject.id)&&savingProjects===0&&!state.activeProject.__remoteDeleted){
      state.activeProject.__remoteDeleted=true;
      toast('当前作品已在另一台设备删除。需要保留本机修改时，请先导出可编辑 JSON。');
    }else if(stillExists&&state.activeProject.__remoteDeleted)delete state.activeProject.__remoteDeleted;
  }
  if(stores.includes('assets')){staticSources.clear();for(const a of state.assets)
    if(a.staticPath)staticSources.set(a.blobId,a.staticPath);}
  if(stores.some(store=>store!=='meta')&&reconcileSelectedRecords(parity,state))
    window.dispatchEvent(new Event('shiye-selection-refresh'));
  if(background){if(shouldRepaintForCollections(state.route,stores,sync?.changedKeys)){
    backgroundViewPending=true;scheduleBackgroundReconcile();}}
  else actionStore.publish('collections/updated',{scope:'collections',keys:stores});
}
let trashSweepActive=false;
async function purgeExpiredTrash(){if(trashSweepActive)return;const entries=expiredTrash(state.trash);if(!entries.length)return;trashSweepActive=true;try{await changeTrash({db,state,ids:entries.map(entry=>entry.id)});if(parity.libraryTab==='trash'||parity.workTab==='trash')render();}catch(error){console.warn('最近删除到期清理待重试',error?.name||error?.message);}finally{trashSweepActive=false;}}
setInterval(()=>{if(foregroundRecentlyActive())void purgeExpiredTrash();},15*60*1000);
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
  let cancelled=false,loadingRoot=createRoot(body);
  const releaseLoading=()=>{if(loadingRoot){loadingRoot.unmount();loadingRoot=null;}};
  const cancelLoading=()=>{cancelled=true;modal.close();queueMicrotask(releaseLoading);};
  const phase=message=>{if(loadingRoot)flushSync(()=>loadingRoot.render(createElement(CutoutLoadingPanel,{pixels:editPixels,phase:message,onCancel:cancelLoading})));};
  phase('');
  modal.classList.remove('cutout-dialog','material-editor-dialog');
  modal.classList.add('cutout-loading-dialog');
  if(!modal.open)modal.showModal();
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
  const openEditor=()=>{if(cancelled)return Promise.resolve();releaseLoading();return showCutoutEditor({
    body,modal,original,saved,recognition,candidateFrame,finalMaskBlob,title:a.title,processing,toast,
    editPixels,
    isCancelled:()=>cancelled,
    onPhase:phase,
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
      const storedMaterial=await materialStorageBlobs(
        completePNG,fullRGB,width||baseWidth,height||baseHeight);
      blob=storedMaterial.cutout;
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
        imageHash:'sha256:'+await sha256Hex(await blob.arrayBuffer()),
        physicalWidthMM:width||a.physicalWidthMM,physicalHeightMM:height||a.physicalHeightMM,
        candidateFrameBlobId:frameId,initialMaskBlobId:baselineId,finalMaskBlobId:nextMaskId,
        updatedAt:new Date().toISOString()};
      await db.transaction(['assets','blobs'],tx=>{
        tx.objectStore('assets').put(updated);
        tx.objectStore('blobs').put({id:a.blobId,data:blob});
        tx.objectStore('blobs').put({id:nextMaskId,data:maskBlob});
        if(baselineBlob)tx.objectStore('blobs').put({id:baselineId,data:baselineBlob});
        tx.objectStore('blobs').put({id:frameId,data:storedMaterial.frame});
      });
      candidateFrame=storedMaterial.frame;
      Object.assign(a,updated);if(urls.has(a.blobId))URL.revokeObjectURL(urls.get(a.blobId));urls.set(a.blobId,URL.createObjectURL(blob));
    }
    render();toast('素材外观已更新');
  }});};
  try{
    await openEditor();
  }catch(error){
    // After an iOS restart, a local Blob may be present but corrupt while
    // the full original is still recoverable from the private COS
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
      releaseLoading();
      loadingRoot=createRoot(body);
      flushSync(()=>loadingRoot.render(createElement(CutoutLoadError,{error,onClose:()=>{modal.close();queueMicrotask(releaseLoading);}})));
      console.warn('打开素材抠图失败',error);
    }else if(!cancelled)throw error;
  }
}
function openDetail(id){
  const record=state.assets.find(item=>item.id===id);if(!record)return;
  openOverlay(createElement(AssetEditorDialog,{asset:record,series:state.series,
    used:usedAssetIDs(state.assets).has(id),src:image(record.blobId)||record.staticPath,
    onClose:closeOverlay,onSave:async values=>{
      const next=assetEditorValue(record,values);
      if(next===record){toast('素材信息未变化');return;}
      await db.put('assets',next);Object.assign(record,next);
      render();toast('素材信息已保存');
    }}));
}
function openSeriesEditor(id){
  const existing=state.series.find(item=>item.id===id);
  const members=existing?state.assets.filter(item=>item.seriesID===id&&!item.isProjectInternal):[];
  openOverlay(createElement(SeriesEditorDialog,{series:existing,members,assets:state.assets,
    source:image,onClose:closeOverlay,onError:toast,onSave:async values=>{
      const next={...existing,id:existing?.id||uid(),
        createdAt:existing?.createdAt||new Date().toISOString(),
        title:values.title,introduction:values.introduction,
        styleTags:parseTags(values.styleTags),semanticTags:parseTags(values.semanticTags),
        coverAssetIDs:values.coverAssetIDs,coverAssetID:values.coverAssetID,
        updatedAt:new Date().toISOString()};
      await db.put('series',next);
      if(existing)state.series[state.series.indexOf(existing)]=next;else state.series.push(next);
      render();toast('系列已保存');
    }}));
}
function openProjectMetadata(){
  const project=state.projects.find(item=>item.id===state.previewProjectID);
  if(!project)return;
  openOverlay(createElement(ProjectMetadataDialog,{
    project,onClose:closeOverlay,onPreview:()=>route('projectPreview'),
    onSnapshot:()=>saveProjectSnapshot(project),
    onSave:async({title,styleTags,isUsed,usageTouched})=>{
      if(!title)throw Error('请填写作品名称');
      const changed=title!==project.title||
        JSON.stringify(styleTags)!==JSON.stringify(project.styleTags||[])||
        isUsed!==Boolean(project.isUsed);
      const markUsed=isUsed&&(!project.isUsed||usageTouched);
      if(!changed&&!markUsed){toast('作品信息未变化');return;}
      const now=new Date().toISOString();
      const next=changed?{...project,title,styleTags,isUsed,updatedAt:now}:project;
      if(changed)delete next.isTemplate;
      const withLayers=markUsed?await db.completeProject(project):project;
      const affected=markUsed?markProjectAssetsUsed(withLayers,state.assets,now):[];
      if(!changed&&!affected.length){toast('作品信息未变化');return;}
      await db.transaction(affected.length?changed?['projects','assets']:['assets']:['projects'],tx=>{
        if(changed)tx.objectStore('projects').put(next);
        for(const asset of affected)tx.objectStore('assets').put(asset);
      });
      Object.assign(project,next);
      for(const asset of affected)Object.assign(state.assets.find(item=>item.id===asset.id),asset);
      render();toast('作品信息已保存');
    }
  }));
}
async function restoreTrash(id){if(!await changeTrash({db,state,ids:[id],recover:true,awaitStage:awaitTrashStages}))return;render();toast('已恢复');}
function saveActiveImportRecord(){
  const rec=state.importRecords[state.importIndex];if(!rec)return;
  Object.assign(rec,{bitmap:state.importBitmap,file:state.importFile,url:state.importURL,box:structuredClone(state.importBox),corners:state.paperCorners?structuredClone(state.paperCorners):null,correctedBitmap:state.correctedBitmap,correctedURL:state.correctedURL,candidates:state.importCandidates||[],candidateURLs:state.importCandidateURLs||[],candidateData:state.importCandidateData||[],selection:[...(state.importCandidateSelection||[])],wholePaper:state.wholePaper,paperSize:state.paperSize,paperOrientation:state.paperOrientation,balanceLight:state.balanceLight,recognition:state.importRecognition,importShapeRegularization:state.importShapeRegularization,importApertures:state.importApertures,importMaterialColorMode:state.importMaterialColorMode,customImportWidth:state.customImportWidth,customImportHeight:state.customImportHeight});
}
const importPrefetchJobs=new WeakMap();
let importBatchRevision=0;
async function extractImportCandidate(source,box,region,{mode,widthMM,heightMM,calibrated,index,sourceName='',sourceIndex=0,lighting=null}){
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
    url:URL.createObjectURL(aligned.blob),title:importDefaultTitle(sourceName,'material',{sourceIndex,candidateIndex:index}),width,height,alignment:aligned.degrees,
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
    recognition:rec.recognition||state.preferences.recognition,candidateDiscovery:rec.candidateDiscovery||state.preferences.candidateDiscovery||'unified',pixels:state.preferences.recognitionPixels||900,
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
    bitmap=await decodeRecognitionImage(rec.file,{research:settings.candidateDiscovery==='unified'});if(!valid())return;
    const initial=importPaperDimensions({...settings,bitmap,corners:null});
    const corners=rec.corners||(settings.paperSize==='none'?null:await suggestPaperCorners(bitmap,initial[0]/initial[1]).catch(()=>null));if(!valid())return;
    const [pw,ph]=importPaperDimensions({...settings,bitmap,corners});
    if(corners&&settings.paperSize!=='none'){
      const corrected=await rectifyA4Frame(bitmap,corners,4096,pw/ph);correctedBitmap=corrected.canvas;correctedURL=URL.createObjectURL(corrected.blob);if(!valid())return;
    }
    const source=correctedBitmap||bitmap,box=correctedBitmap?{x:0,y:0,w:1,h:1}:rec.box||{x:0,y:0,w:1,h:1};
    let candidates=await detectPaperCandidates(source,box,6,{balanceLight:settings.balanceLight,paperRectified:!!correctedBitmap,paperWidthMM:pw,paperHeightMM:ph,
      recognition:settings.recognition,candidateDiscovery:settings.candidateDiscovery,recognitionPixels:settings.pixels,
      recognitionSource:correctedBitmap&&corners?{bitmap,corners}:null,
      recognitionPreprocess:{illumination:settings.balanceLight,denoise:settings.denoise,localContrast:settings.localContrast,chromaEdges:settings.chromaEdges},
      recognitionPostprocess:{shapeRegularization:settings.shapeRegularization,apertures:settings.apertures},mergeSharedCarrier:settings.mergeSharedCarrier,
      onDiagnostic:trace=>{if(valid())rec.recognitionDiagnostic=trace;}});if(!valid())return;
    candidates=filterAutomaticMaterialBoxes(candidates,{paperWidthMM:pw,paperHeightMM:ph,enabled:settings.paperSize!=='none'});
    const calibrated=settings.paperSize!=='none'&&(correctedBitmap||settings.wholePaper);
    const lighting=settings.materialColorMode!=='original'&&correctedBitmap
      ?await estimatePageLighting(source,candidates):null;
    const candidateData=await boundedMap(candidates,2,async(region,index)=>{
      if(!valid())return null;
      const candidate=await extractImportCandidate(source,box,region,{mode:settings.mode,widthMM:pw,heightMM:ph,calibrated,index,sourceName:rec.file.name,sourceIndex:state.importRecords.indexOf(rec),lighting});
      candidateURLs[index]=candidate.url;
      return candidate;
    });
    if(!valid())return;
    Object.assign(rec,{bitmap,recognitionDecodeMode:settings.candidateDiscovery==='unified'?'research':'legacy',autoPaperCorners:corners&&!rec.corners?structuredClone(corners):null,correctedBitmap,correctedURL,
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
  const researchDecode=(state.preferences.candidateDiscovery||'unified')==='unified';
  const decodeMode=researchDecode?'research':'legacy';
  if(rec.bitmap&&rec.recognitionDecodeMode!==decodeMode){
    rec.bitmap.close?.();rec.correctedBitmap?.close?.();
    if(rec.correctedURL)URL.revokeObjectURL(rec.correctedURL);
    for(const url of rec.candidateURLs||[])URL.revokeObjectURL(url);
    Object.assign(rec,{bitmap:null,correctedBitmap:null,correctedURL:null,autoPaperCorners:null,candidates:[],candidateData:[],candidateURLs:[],selection:[],prefetchStatus:null});
    Object.assign(state,{importBitmap:null,correctedBitmap:null,correctedURL:null,importCandidates:[],importCandidateData:[],importCandidateURLs:[],importCandidateSelection:new Set()});
  }
  const bitmap=rec.bitmap||await decodeRecognitionImage(rec.file,{research:researchDecode});rec.bitmap=bitmap;
  rec.recognitionDecodeMode=decodeMode;if(!isCurrent())return;state.importBitmap=bitmap;
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
  const old=state.paperCorners;resetPaperCorrection(state);state.paperCorners=old?[old[3],old[0],old[1],old[2]].map(p=>({x:1-p.y,y:p.x})):null;bitmap.close?.();
  state.importBitmap=await decodeRecognitionImage(rec.file,{research:(state.preferences.candidateDiscovery||'unified')==='unified'});
  rec.bitmap=state.importBitmap;rec.recognitionDecodeMode=(state.preferences.candidateDiscovery||'unified')==='unified'?'research':'legacy';
  state.importFile=rec.file;state.importURL=rec.url;state.importCandidates=[];state.importCandidateData=[];state.importCandidateURLs=[];state.importCandidateSelection=new Set();rec.confirmed=false;rec.manualEdits=false;
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
    const manualRegion=manualPhysicalRegion(box,aw,ah);
    if(!hasManualForegroundEvidence(pixels,aw,ah,manualRegion))
      throw Error('框内没有可区分的素材边缘或颜色，请贴近素材外沿重新框选');
    const method=manualSegmentationMethod(state.importRecognition||state.preferences.recognition);
    const [candidate]=await visionTask('process-material-boxes',{
      pixels,sourcePixels:pixels,width:aw,height:ah,
      boxes:[manualRegion],method,paperWidthMM:pw,paperHeightMM:ph,
      mergeSharedCarrier:true,shapeRegularization:false,apertures:false
    });
    if(!candidate?.mask?.alpha?.length||candidate.segmentationFailed)
      throw Error('手动框未能生成透明分割 Mask；请贴近素材外沿调整框，或在设置中更换 Mask 分割算法');
    // Preserve the user-defined angle; minAreaRect can re-express e.g. 60°
    // as -30° with swapped axes, which is not the frame the user confirmed.
    return {...candidate,manualGeometry:true,
      manualSearchBoundary:manualRegion.physicalBoundary,
      physicalBoundary:method==='physical'?manualRegion.physicalBoundary:null,
      orientedBox:manualRegion.orientedBox};
  }):regions.map(region=>({region,original:null}));
  if(record!==state.importRecords[state.importIndex]||state.route!=='import')return false;
  const lighting=state.importMaterialColorMode!=='original'&&state.correctedBitmap
    ?await estimatePageLighting(source,plans.map(plan=>plan.region)):null;
  let completed=0;
  const created=[];
  try{
    next.push(...await boundedMap(plans,2,async({region,original},index)=>{
      if(original)return original;
      const regenerated=await extractImportCandidate(source,b,region,{mode:state.importMode,widthMM:pw,heightMM:ph,calibrated,index,sourceName:record.file.name,sourceIndex:state.importIndex,lighting});
      // Changing only colour must not reset manual names, tags, dimensions or
      // choices, and must never cause the segmentation algorithm to rerun.
      const old=previous.find(item=>item.region===region)||
        previous.find(item=>item.region&&Math.abs(item.region.x-region.x)<1e-6&&Math.abs(item.region.y-region.y)<1e-6&&Math.abs(item.region.w-region.w)<1e-6&&Math.abs(item.region.h-region.h)<1e-6);
      if(old)for(const key of ['title','selected','tags','seriesID','kind','role','reviewStatus','dimensionSource','width','height']){
        if(old[key]!==undefined)regenerated[key]=structuredClone(old[key]);
      }
      created.push(regenerated);
      toast('正在提取素材 '+(++completed)+' / '+plans.length);
      return regenerated;
    }));
  }catch(error){for(const item of created)URL.revokeObjectURL(item.url);throw error;}
  if(record!==state.importRecords[state.importIndex]){for(const c of next)if(!previous.includes(c))URL.revokeObjectURL(c.url);return false;}
  for(const c of previous)if(!next.includes(c))URL.revokeObjectURL(c.url);
  state.importCandidates=plans.map(plan=>plan.region);state.importCandidateData=next;state.importCandidateURLs=next.map(c=>c.url);state.importCandidateSelection=new Set(next.flatMap((c,i)=>c.selected?[i]:[]));saveActiveImportRecord();return true;
}
async function previewCrop(){
  if(!state.importBitmap||state.importMode==='snapshot')return;
  const record=state.importRecords[state.importIndex],source=state.correctedBitmap||state.importBitmap,b=state.correctedBitmap?{x:0,y:0,w:1,h:1}:state.importBox,[pw,ph]=paperDimensions();
  let regions=await detectPaperCandidates(source,b,6,{balanceLight:state.balanceLight,paperRectified:!!state.correctedBitmap,paperWidthMM:pw,paperHeightMM:ph,recognition:state.importRecognition||state.preferences.recognition,candidateDiscovery:state.preferences.candidateDiscovery||'unified',recognitionPixels:state.preferences.recognitionPixels,
    recognitionSource:state.correctedBitmap&&state.paperCorners?{bitmap:state.importBitmap,corners:state.paperCorners}:null,
    recognitionPreprocess:recognitionPreprocessOptions(),recognitionPostprocess:recognitionPostprocessOptions(),mergeSharedCarrier:state.preferences.mergeSharedCarrier!==false,onDiagnostic:trace=>{record.recognitionDiagnostic=trace;},onProgress:p=>{
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
function changeImportCalibration(key,value){
  if(key==='customImportWidth'||key==='customImportHeight'){
    const n=Number(value);
    if(!Number.isFinite(n)||n<1||n>10000){toast('纸张宽高为 1–10000 mm');return;}
    state[key]=n;
  }else state[key]=value;
  recalibrateImport();
}
async function changeImportRecognitionSetting(key,value){
  if(state.importProcessing)return;
  const before=state[key],record=state.importRecords[state.importIndex];
  if(key==='importMaterialColorMode'){
    state[key]=value;if(record)record[key]=value;
    if(!state.importCandidates?.length){render();return;}
    state.importProcessing='正在更新高清颜色…';render();
    try{await refreshImportCandidates(state.importCandidates);}
    catch(error){state[key]=before;if(record)record[key]=before;toast('颜色更新失败：'+error.message);}
    finally{state.importProcessing='';if(state.route==='import')render();}
    return;
  }
  const shape=key==='importShapeRegularization'||key==='importApertures';
  if(state.importCandidateData?.length&&!confirm(shape?
    '更改边缘后处理需要重新识别当前照片，继续？':
    '更改光照会重新识别候选并重置当前候选标注，继续？')){
    render();return;
  }
  state[key]=!!value;
  if(record)record[key]=state[key];
  state.importProcessing=shape?'正在按新参数细化轮廓…':
    state.importMode==='snapshot'?'正在调整页面颜色…':'正在均衡光照并重新识别…';
  saveActiveImportRecord();render();
  try{if(state.importMode!=='snapshot')await previewCrop();}
  catch(error){state[key]=before;if(record)record[key]=before;toast(error.message);}
  finally{state.importProcessing='';if(state.route==='import')render();}
}
async function removeImportRecord(index){
  if(!Number.isInteger(index)||index<0||index>=state.importRecords.length)return;
  if(!confirm('从本批中移除这张照片？'))return;
  saveActiveImportRecord();
  const [record]=state.importRecords.splice(index,1);
  URL.revokeObjectURL(record.url);record.bitmap?.close?.();record.correctedBitmap?.close?.();
  if(!state.importRecords.length){
    state.importFile=null;state.importBitmap=null;state.importCandidates=[];render();
  }else await switchImportRecord(Math.min(state.importIndex,state.importRecords.length-1),true);
}
function editImportReviewCandidate(recordIndex,candidateIndex,changes){
  const record=state.importRecords[recordIndex];
  const candidate=record?.selectedCandidates?.[candidateIndex];
  if(!candidate)throw Error('复核素材不存在');
  if(changes.width!==candidate.width||changes.height!==candidate.height)
    candidate.dimensionSource='manual';
  Object.assign(candidate,changes);
  record.manualEdits=true;
  render();
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
  // Material review/save uses the extracted candidate Blobs, not either full
  // photo raster. A corrected 4096 px canvas plus its pinned RGBA buffer can
  // exceed 100 MB; retaining one per confirmed photo exhausts iPad Safari in
  // a twelve-photo batch. Keep the File and candidate Blobs so revisiting a
  // photo can decode it again without losing any selection or manual edits.
  if(state.importMode==='material'){
    for(const bitmap of new Set([rec.bitmap,rec.correctedBitmap])){
      bitmap?.close?.();
      if(bitmap instanceof HTMLCanvasElement){bitmap.width=0;bitmap.height=0;}
    }
    if(rec.correctedURL)URL.revokeObjectURL(rec.correctedURL);
    rec.bitmap=null;rec.correctedBitmap=null;rec.correctedURL=null;
    state.importBitmap=null;state.correctedBitmap=null;state.correctedURL=null;
  }
  const next=state.importRecords.findIndex(r=>!r.confirmed);if(next>=0)await switchImportRecord(next,true);else{state.importStep='review';render();}
}
async function organizeSavedProjects(projects){
  if(!state.preferences.autoOrganizeWorks||!projects?.length)return;
  const config=structuredClone(state.aiSettings),account=state.accountId;
  if(!config.key)return; // Offline projects retain their current title/tags.
  try{
    // These works are already durably staged by the caller. The model reads
    // their local cover while COS upload and the cloud acknowledgement run.
    const results=await Promise.allSettled(projects.map(source=>classificationQueue.schedule(async()=>{
      if(state.accountId!==account)return;
      const complete=await db.get('projects',source.id);
      if(!complete||complete.updatedAt!==source.updatedAt||complete.autoOrganized)return;
      let picture=null;
      if(complete.isSnapshot&&supportsVision(config)){
        picture=await modelImage({blobId:complete.snapshotBlobId},null,360,false);
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
    },{priority:'background'})));
    if(state.route==='works')render();
    const failure=results.find(result=>result.status==='rejected');
    if(failure)throw failure.reason;
  }catch(error){recordRuntimeIssue('handled',error,state.route,{phase:'ai'});console.warn('作品自动整理待重试，原始作品仍保留',error);if(state.accountId===account)toast(explainUserError(error,'作品自动整理'));}
}
async function organizeSavedAssets(records,{projects=[]}={}){
  if(projects.length)void organizeSavedProjects(projects);
  if(state.preferences.autoOrganize&&records.length){
    const cfg=structuredClone(state.aiSettings),accountID=state.accountId;
    if(cfg.key&&supportsVision(cfg)){
      let warned=false;
      // saveImportBatch has already durably staged the cutouts and metadata.
      // The model can read those pending Blobs locally; a slow cloud ACK must
      // not fail every classification in an otherwise saved import batch.
      await assetOrganization.run(records,{organize:async(record,isCurrent,signal)=>{
        if(state.accountId!==accountID||!isCurrent())return;
        const image=await modelImage(record,null,512,false);if(!image)throw Error('素材图像无法读取');
        if(!isCurrent())return;
        const result=await classifyRecord({kind:'asset',record,settings:cfg,image,assets:[],signal});
        await applyAssetClassification(record,result,{isCurrent:()=>state.accountId===accountID&&isCurrent()});
      },onError:error=>{recordRuntimeIssue('handled',error,state.route,{phase:'ai'});if(state.accountId===accountID&&!warned){warned=true;toast(explainUserError(error,'素材自动整理'));}}});
    }else if(state.route!=='import'||state.importStep!=='done')toast('未启用视觉整理，素材已保存，可稍后检查或在设置开启');
  }
}

async function applyAssetClassification(record,result,{manual=false,isCurrent=()=>true}={}){
  if(!isCurrent())return false;
  // Persist each finished answer independently; a late answer must not
  // overwrite a rename, deletion or series change made during inference.
  const latest=await db.get('assets',record.id);if(!latest||!isCurrent())return false;
  const update=manual?{...latest,autoOrganized:true}:automaticAssetClassification(latest,record,result);
  if(manual){for(const [key,value] of Object.entries(result))if(JSON.stringify(latest[key])===JSON.stringify(record[key]))update[key]=value;update.updatedAt=new Date().toISOString();}
  if(!isCurrent())return false;
  await db.put('assets',update);
  if(!isCurrent())return false;
  const current=state.assets.find(a=>a.id===record.id);if(current)Object.assign(current,update);
  window.dispatchEvent(new Event('shiye-library-refresh'));
  window.dispatchEvent(new Event('shiye-matching-refresh'));
  window.dispatchEvent(new Event('shiye-asset-refresh'));
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
async function exportPDF(){
  await flushSave();
  const d=current(),height=d.physicalPageHeightMM||297,width=height*d.canvas.width/d.canvas.height;
  const scale=Math.min(height*300/25.4/d.canvas.height,8192/Math.max(d.canvas.width,d.canvas.height));
  const canvas=await rasterize(d,scale);
  const {pagePDF,canvasPDFPage}=await import('./pdf-export.js');
  download(await pagePDF([await canvasPDFPage(canvas,width,height)]),state.activeProject.title+'.pdf');
}
async function printPage(){const d=current(),canvas=await rasterize(d,2),url=canvas.toDataURL('image/png');const child=window.open('','_blank');if(!child){toast('请允许打开打印预览窗口');return;}child.document.write(`<html><head><title>${esc(state.activeProject.title)}</title><style>@page{size:A4;margin:0}body{margin:0}img{width:100%;height:auto}</style></head><body><img src="${url}" onload="window.print()"></body></html>`);child.document.close();}
async function rasterize(d,scale,{preview=false}={}){
 const sources=editorEntry(d).filter(e=>e.kind==='material').map(e=>e.value);
 const ids=[...new Set(sources.filter(node=>!node.sourceStaticPath&&!(!node.sourceBlobId&&asset(node.assetID)?.staticPath))
   .map(node=>node.sourceBlobId||asset(node.assetID)?.blobId).filter(Boolean))],release=privateImages.retain(ids);
 try{await Promise.all(ids.map(id=>privateImages.load(id,preview?false:true)));const result=await renderSceneCanvas(d,{scale,loadMaterialImage:async(id,node)=>{const a=asset(id),staticPath=node?.sourceStaticPath||(!node?.sourceBlobId&&a?.staticPath);if(staticPath)return decodeSceneImage(staticPath);const blobId=node?.sourceBlobId||a?.blobId;if(!blobId)throw Error('作品引用的素材图片不存在：'+id);return decodeSceneImage(preview?imagePlaceholder(blobId):(urls.get(blobId)||image(blobId)));}});return result.canvas;}finally{release();}
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
    const blobId=uid(),snapshot=snapshotRecord({title:importDefaultTitle(file.name,'snapshot'),previewBlobId:blobId,format:mimeType,width:bitmap.width,height:bitmap.height});
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
creationResultInput.addEventListener('cancel',()=>{offlineSnapshotProject=null;});
creationResultInput.onchange=async()=>{
  const file=creationResultInput.files?.[0],matchingProject=offlineSnapshotProject;
  creationResultInput.value='';offlineSnapshotProject=null;
  if(!file)return;
  try{await importEditableFile(file,{matchingProject});}
  catch(error){console.error(error);toast('作品文件导入失败：'+error.message);}
};
async function importEditableFile(file,{matchingProject=null}={}){
  const detected=await classifyCreationFile(file);
  if(detected.kind==='image')return saveOfflineSnapshotFile(file,matchingProject,detected.mimeType);
  if(detected.kind==='zip')throw Error('不再导入 .shiyeproject.zip 工程包；请选择可编辑 JSON 作品文件');
  // Standard Scene JSON shares the saved Draft with the manual editor.
  const contents=await file.text();
  let input;try{input=JSON.parse(contents.replace(/^\uFEFF/,'').trim());}catch{}
  if(input?.format==='shiye-native-project'){
    const {importNativeProjectDocument}=await import('./native-project-package.js');
    await importOfflineProject(importNativeProjectDocument(input,state.assets),{aiGenerated:false});return;
  }
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
  let plan;try{plan=await db.prepareBackupRestore(file);const n=plan.counts;
    const repaired=plan.repairs.length?`另有 ${plan.repairs.length} 个不能跨账号使用的派生封面引用将移除；作品正文和素材不变，封面打开时重新生成。`:'';
    if(!confirm(`备份预检通过：${n.assets} 件素材、${n.series} 个系列、${n.projects} 件作品、${n.blobs} 份图片、${n.trash} 条最近删除。${repaired}恢复会替换当前全部资料。继续吗？`)){await plan.dispose?.();return;}
    await flushSave();await db.flushProjects();await plan.apply();state.activeProject=null;state.basket=[];await refresh();toast('完整备份已恢复');}
  catch(e){console.error(e);toast('恢复失败：'+e.message);}finally{await plan?.dispose?.();}
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
window.addEventListener('beforeunload',event=>{
  if(saveTimer||savingProjects||dirtyProjects.size||pendingUnsavedInputs().length||
    settingsSession?.dirty||state.route==='import'&&state.importRecords.length||
    state.editingTextID){event.preventDefault();event.returnValue='';}
});
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
window.addEventListener('shiye-sync-forked',event=>{
  const {sourceID,sourceSessionID,target}=event.detail||{};
  if(!sourceID||!target?.id)return;
  const current=state.activeProject;
  // Only redirect the editing session that produced this branch. Another tab
  // can have an independent draft of the same original work.
  if(current?.id===sourceID&&current.__cloudSessionId===sourceSessionID){
    const oldKey=sceneTrackKey(current);
    dirtyProjects.delete(sourceID);
    saveVersions.set(sourceID,(saveVersions.get(sourceID)||0)+1);
    current.id=target.id;
    current.title=target.title;
    current.__cloudSessionId=target.__cloudSessionId;
    current.forkOrigin=target.forkOrigin;
    delete current.__cloudBaseRevision;
    if(oldKey&&sceneTrackBases.has(oldKey)){
      const baseline=sceneTrackBases.get(oldKey);
      sceneTrackBases.delete(oldKey);
      const nextKey=sceneTrackKey(current);
      if(nextKey)sceneTrackBases.set(nextKey,baseline);
    }
    state.projects=state.projects.map(project=>project===current||project.id===sourceID?current:project);
    projectSaveFingerprints.delete(sourceID);
    projectSceneFingerprints.delete(sourceID);
    saveSpecificProject(current);
    render();
  }else{
    void backgroundCloudCheck({force:true});
  }
  toast('作品发生独立修改，已保留为另一编辑版本。');
});
window.addEventListener('shiye-sync-project-replaced',event=>{
  const {sourceID,sourceSessionID,sourceFingerprint,target}=event.detail||{};
  const current=state.activeProject;
  if(!target?.id||current?.id!==sourceID||current.__cloudSessionId!==sourceSessionID)return;
  const hasLaterEdits=projectSemanticFingerprint(current)!==sourceFingerprint;
  const next=hasLaterEdits?forkConflictingEditableWork(current):target;
  if(!next){toast('当前作品仍有本机新修改，已保留待同步任务');return;}
  dirtyProjects.delete(sourceID);
  saveVersions.set(sourceID,(saveVersions.get(sourceID)||0)+1);
  state.activeProject=next;
  state.activeDraft=next.activeDraftID;
  state.projects=state.projects.map(project=>project.id===sourceID?next:project);
  projectSaveFingerprints.delete(sourceID);
  projectSceneFingerprints.delete(sourceID);
  if(hasLaterEdits)saveSpecificProject(next);
  else rememberProjectSaveBaseline(next);
  render();
  if(hasLaterEdits)toast('编辑期间又有新修改，已另存为可编辑作品。');
});
window.addEventListener('shiye-sync-project-committed',event=>{
  const {id,sessionID,revision,sceneFingerprint,metadata}=event.detail||{};
  const current=state.activeProject;
  if(current?.id!==id||current.__cloudSessionId!==sessionID)return;
  current.__cloudBaseRevision=revision;
  current.__cloudBaseSceneFingerprint=sceneFingerprint;
  current.__cloudBaseMetadata=metadata;
});
window.addEventListener('shiye-project-sync',event=>{const {pending,error,conflicts=0,uploading=false,progress=null}=event.detail;syncDisplay.pending=pending;syncDisplay.progress=progress;syncDisplay.error=error;syncDisplay.conflicts=conflicts;syncDisplay.uploading=uploading;syncDisplay.checking=false;if(!dirtyProjects.size&&!savingProjects)syncDisplay.localPending=false;updateSyncIndicator();if(error&&!uploading){saveStatus('待同步 · 修改已保留在本机');const message=error.name==='AbortError'||/abort|timed? ?out/i.test(error.message||'')?'网络请求中断，本机修改已保留，将自动重试同步':describeSyncError(error);if(lastSyncError!==message)toast(message);lastSyncError=message;}else{const recovered=!!lastSyncError&&!error;if(!error)lastSyncError=null;saveStatus(conflicts?'部分资料有冲突 · 其他资料已继续同步':pending?'修改已暂存 · 后台同步中':'已保存到云端');if(recovered)privateImages.retryMissing();}});
let cloudCheck,cloudCheckAt=0,cloudSessionReady=false,cloudCheckAgain=false;
const CLOUD_POLL_MS=5000,REALTIME_FALLBACK_MS=60000;
let revisionRealtimeReady=false;
let stopRevisionRealtime=()=>{};
function subscribeAccountRevision(userID){
  stopRevisionRealtime();stopRevisionRealtime=()=>{};revisionRealtimeReady=false;
  if(!cloudEnabled||!cloudRealtimeEnabled)return;
  try{stopRevisionRealtime=startCloudRevisionRealtime({
    realtime:cloudRealtime(),userID,
    onChange:()=>backgroundCloudCheck({force:true}),
    onReady:()=>{revisionRealtimeReady=true;backgroundCloudCheck({force:true});},
    onError:error=>{revisionRealtimeReady=false;console.warn('账号实时通知暂不可用；仍会定期核对云端版本',error?.message);}
  });}catch(error){revisionRealtimeReady=false;console.warn('账号实时通知未建立；仍会定期核对云端版本',error?.message);}
}
let syncPausedByUser=false,resetWorkflowActive=false;
const cloudResumer=createSyncResumer({flush:()=>db.flushProjects({background:true}),canRun:()=>cloudEnabled&&cloudSessionReady&&navigator.onLine!==false,onError:error=>console.warn('后台同步待重试',error?.message)});
function backgroundCloudCheck({force=false}={}){
  if(!cloudEnabled||!cloudSessionReady||document.visibilityState==='hidden'||
    !force&&!foregroundRecentlyActive())return;
  if(!force&&!foregroundIsIdle(state.route==='editor'?1800:1000))return;
  if(!canPollDuringEditing({route:state.route,gestureActive:!!activeViewPointers.size,
    inputFocused:!!document.activeElement?.matches('input,textarea,[contenteditable="true"]'),
    idleMS:Date.now()-lastViewInputAt}))return;
  // Keep remote reads moving during a long upload, but do not compete with
  // every image chunk. A forced pull after another device's commit still runs.
  if(syncDisplay.uploading&&!force&&Date.now()-cloudCheckAt<30000)return;
  if(cloudCheck){if(force)cloudCheckAgain=true;return;}
  if(!force&&Date.now()-cloudCheckAt<(revisionRealtimeReady?REALTIME_FALLBACK_MS:CLOUD_POLL_MS))return;
  cloudCheckAt=Date.now();
  // Matching and Import keep their local workspace, but still read the same
  // revision/epoch row so a reset on another device is not missed there.
  cloudCheck=(shouldPullCloudForRoute(state.route)
    ?refresh({background:true,onlyChanged:true}):db.checkCloudVersion())
    .catch(error=>{if(error.code==='ACCOUNT_EPOCH_CHANGED')return;
      recordRuntimeIssue('handled',error,state.route,{phase:'background'});console.warn('后台版本检查失败；保留已验证缓存',error);})
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
// Detect complete UI stalls even when no sync promise rejects. The timer
// resumes after a main-thread block and records its duration locally.
let lastMainThreadTick=performance.now();
let lastMainThreadVisibility=document.visibilityState;
setInterval(()=>{
  const now=performance.now(),lag=Math.round(now-lastMainThreadTick-2000);
  lastMainThreadTick=now;
  const visible=document.visibilityState==='visible'&&lastMainThreadVisibility==='visible';
  lastMainThreadVisibility=document.visibilityState;
  if(cloudEnabled&&visible&&lag>1200)db.recordSyncDiagnostic({action:'main-thread-lag',kind:'queue',
    cloudRevision:null,pending:syncDisplay.pending,durationMs:lag});
},2000);
document.addEventListener('visibilitychange',()=>{
  lastMainThreadTick=performance.now();lastMainThreadVisibility=document.visibilityState;
});
window.addEventListener('focus',()=>{backgroundCloudCheck();privateImages.retryMissing();void cloudResumer.wake();});
document.addEventListener('visibilitychange',()=>{backgroundCloudCheck();if(document.visibilityState==='hidden'){view.flushInkCommit?.({renderUI:false,force:true});snapshotEditedScene('app-background');if(dirtyProjects.size||dirtyUsageAssets.size)void flushSave().catch(console.error);}if(document.visibilityState==='visible'){privateImages.retryMissing();void cloudResumer.wake();}});
window.addEventListener('online',()=>{backgroundCloudCheck();privateImages.retryMissing();void cloudResumer.wake({force:true});});
window.addEventListener('offline',updateSyncIndicator);
window.addEventListener('online',updateSyncIndicator);
async function runAccountStorageMigration(){
  if(!cloudEnabled)return;
  try{
    const {prepareStorageMigration}=await import('./data-migrations/registry.js');
    const inventory=await db.scanLegacyAccountData();
    const plan=await prepareStorageMigration(inventory.collections,{
      assets:inventory.collections.assets,
      resolveProject:record=>db.readOriginalLegacyProject(record)
    });
    openOverlay(createElement(SyncMigrationDialog,{plan,onClose:()=>{closeOverlay();if(!syncPausedByUser&&!resetWorkflowActive)void cloudResumer.resume();},
      onApply:async()=>{
        const result=await db.commitLegacyAccountMigration({expectedRevision:inventory.revision,changes:plan.changes});
        await refresh({background:true});return result;
      }}));
  }catch(error){
    recordRuntimeIssue('handled',error,state.route,{phase:'storage-migration'});
    openOverlay(createElement(SyncErrorDialog,{kind:'details',error:error.message,onClose:closeOverlay,
      onDiagnostics:exportSyncDiagnostics}));
  }
}
function exportAppDiagnostics(){
  const report={format:'shiye-app-error-diagnostics',version:2,createdAt:new Date().toISOString(),
    scope:'本机最近七天的脱敏运行摘要；仅在主动导出时生成文件',
    environment:{mode:cloudEnabled?'cloud':'browser',online:navigator.onLine!==false},
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
  toast('已导出本机当天的同步诊断；不含作品、图片、账号标识或原始报错');
}
async function syncDetailsSnapshot(){
  const details=await db.pendingSyncDetails(),projects=details.projects||[],
    batches=details.batches||[],local=[...dirtyProjects.values()],quarantined=details.quarantined||0;
  const status=syncPausedByUser?'已暂停 · 本机修改仍保留':syncDisplay.uploading?
    (syncDisplay.progress?`上传中 · ${syncDisplay.progress.phase} ${syncDisplay.progress.done}/${syncDisplay.progress.total} 项`:'上传中'):
    syncDisplay.conflicts?'正在处理版本差异':syncDisplay.error?'等待自动重试':
    syncDisplay.pending||local.length?'等待上传':'已同步';
  return {details,projects,batches,local,quarantined,status,conflicts:syncDisplay.conflicts,
    error:syncDisplay.error?describeSyncError(syncDisplay.error):null};
}
async function openSyncDetails(){
  if(!cloudEnabled)return;
  try{
    // Opening the status sheet must not enumerate a potentially huge durable
    // outbox on the same main thread as the editor.
    const details={error:null},projects=[],batches=[],local=[...dirtyProjects.values()],
      quarantined=db.syncDiagnosticReport({online:navigator.onLine})?.state?.quarantined||0,
      status=syncPausedByUser?'已暂停 · 本机修改仍保留':syncDisplay.uploading?'上传中':
        syncDisplay.pending||local.length?'等待上传':'已同步';
    openOverlay(createElement(SyncDetailsDialog,{details,projects,batches,local,quarantined,
      pendingCount:syncDisplay.pending,
      onRefresh:syncDetailsSnapshot,legacyCount:db.legacyProjectInfo?.()?.length||0,
      error:syncDisplay.error?describeSyncError(syncDisplay.error):null,status,conflicts:syncDisplay.conflicts,
      onClose:()=>{closeOverlay();if(!syncPausedByUser&&!resetWorkflowActive)void cloudResumer.resume();},
      onDiagnostics:exportSyncDiagnostics,
      onMigrate:()=>void runAccountStorageMigration(),onBackupLegacy:()=>void handle('backup-legacy-projects'),
      onWipe:()=>void handle('reset-all-account-data'),
      onRetry:async()=>{
        syncPausedByUser=false;
        await flushSave();
        void cloudResumer.resume();
        const current=db.syncDiagnosticReport({online:navigator.onLine})?.state;
        return {remaining:current?.pending??syncDisplay.pending,
          conflicts:current?.conflicts??syncDisplay.conflicts};
      },onRebuild:async()=>{
        syncPausedByUser=false;
        await flushSave();
        await db.rebuildPendingSync({projects:state.projects,assets:state.assets,
          series:state.series,trash:state.trash});
        void cloudResumer.resume();
        const current=db.syncDiagnosticReport({online:navigator.onLine})?.state;
        const remaining=current?.pending??syncDisplay.pending;
        if(!remaining)toast('已同步到云端');
        return {remaining,conflicts:current?.conflicts??syncDisplay.conflicts};
      },onPause:()=>{
        syncPausedByUser=!syncPausedByUser;
        if(syncPausedByUser){cloudResumer.suspend();saveStatus('已暂停后台重试 · 本机修改保留');}
        closeOverlay();if(!syncPausedByUser)void cloudResumer.resume();
      },onEmergency:async()=>{
        try{await flushSave();const backup=await db.createEmergencyBackup();
          if(!(backup instanceof Blob)||!backup.size)throw Error('应急备份为空');
          download(backup,'拾页-待同步应急备份-'+new Date().toISOString().slice(0,10)+'.shiyerecovery');
          toast('已导出含原始字节的待同步应急备份，请妥善保存');
        }catch(error){toast('导出应急备份失败：'+error.message);}
      }}));
  }catch(error){
    console.warn('同步详情读取失败',error);recordRuntimeIssue('handled',error,state.route,{phase:'sync-details'});
    openOverlay(createElement(SyncErrorDialog,{kind:'details',error:error.message,
      onClose:()=>{closeOverlay();if(!syncPausedByUser&&!resetWorkflowActive)void cloudResumer.resume();},
      onDiagnostics:exportSyncDiagnostics}));toast(explainUserError(error,'同步详情读取'));
  }
}
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
setShellActions({
  navigate:target=>navigateMain(target),
  basket:()=>route('matching'),settings:()=>route('settings'),
  sync:()=>void openSyncDetails(),save:()=>{if(cloudEnabled)void openSyncDetails();},
  diagnostics:()=>{void import('./runtime-diagnostics.js').then(({runtimeIssueReport})=>
    download(new Blob([runtimeIssueReport()],{type:'application/json'}),'拾页运行诊断.json'));},
  update:()=>{
    updateShell({updateStatus:'正在准备更新…'});
    void Promise.resolve(safeUpdateRegistration).then(registration=>{
      if(!registration)throw Error('更新服务暂不可用，请稍后重试');
      return registration.activate();
    }).catch(error=>{updateShell({updateStatus:''});toast('更新未完成：'+error.message);});
  }
});
let safeUpdateRegistration=null;
function checkForSafeUpdate(){
  if(!('serviceWorker' in navigator)||location.protocol!=='https:'||safeUpdateRegistration)return;
  safeUpdateRegistration=import('./app-update.js').then(({registerSafeUpdate})=>registerSafeUpdate({
    flushLocal:async()=>{
      view.flushInkCommit?.({renderUI:false,force:true});
      view.endTextEditing?.();
      await flushSave();
    },
    isBusy:()=>!!(state.importProcessing||state.aiBusy||state.route==='import'&&state.importRecords.length||
      settingsSession?.dirty||pendingUnsavedInputs().length||activeViewPointers.size||editorPointers.size||modal.open),
    onError:error=>toast('更新未完成，当前页面和资料保持不变：'+error.message),
    onReady:ready=>updateShell({updateReady:ready}),
    onStatus:updateStatus=>updateShell({updateStatus})
  })).catch(error=>{safeUpdateRegistration=null;console.warn('更新检查暂不可用',error);});
}
async function init(user,{resetPending=false,afterAccountReset=false,onFirstView=()=>{}}={}){
  previewPrewarmEpoch++;
  stopRevisionRealtime();stopRevisionRealtime=()=>{};
  let cachedShown=false;
  cloudSessionReady=!resetPending;
  if(resetPending)cloudResumer.suspend();
  const accountId=user?.id||'browser';
  if(state.accountId&&state.accountId!==accountId){
    navigationScope=null;
    mainNavigation.reset();
    matchingScrollMemory=null;
    parity.libraryTab='series';parity.workTab='all';parity.workFilters=null;
    parity.seriesQuery='';parity.seriesSort='recent';parity.seriesAscending=false;
    parity.selected.clear();parity.selectionMode=null;parity.showOnlySelected=false;
    clearCatalogPages();clearSeriesContentFilters();routeScroll.clear();
    state.route='series';state.query='';state.kind='all';state.status='all';state.sort='newest';
    state.seriesID='all';state.detailAssetID=null;state.previewProjectID=null;
    state.activeProject=null;state.activeDraft=null;
    state.assets=[];state.series=[];state.projects=[];state.trash=[];state.basket=[];
    privateImages.invalidate();staticSources.clear();
    deferredSyncedPreferences=null;deferredSyncedAISettings=null;
    clearTimeout(matchingDefaultsTimer);matchingDefaultsTimer=null;
    matchingDefaultsPending=false;matchingDefaultsLocalEdited=false;cloudMatchingDefaults=null;
    assetOrganization.clear();clearJournalTemplateImages();clearJournalPresetImages();
    state.userTemplates=[];
    renderReactPage(createElement('section',{className:'empty'},
      createElement('strong',null,'正在读取当前账号资料…')));
  }
  state.accountId=accountId;
  try{
  await db.storageMode();state.selfHosted=false;checkForSafeUpdate();
  // startCloudSession has validated Auth and the allowlist before this runs.
  const cached=await db.cachedCollections();if(cached){
    const {meta:cachedMeta,...collections}=cached;
    Object.assign(state,collections);state.accountId=accountId;
    if(cachedMeta){
      const preferences=cloudPreferencesFromMeta(cachedMeta);
      const aiSettings=cloudAISettingsFromMeta(cachedMeta);
      const matching=cloudMatchingSettingsFromMeta(cachedMeta);
      if(preferences)state.preferences=savePreferences(migrateStoredPreferences(preferences));
      if(aiSettings)state.aiSettings=saveAISettings(aiSettings);
      if(matching){cloudMatchingDefaults=matching;applyMatchingDefaults(state,matching);}
    }
    await restorePendingProjects();
    for(const a of state.assets)if(a.staticPath)staticSources.set(a.blobId,a.staticPath);
    render();activateNavigation();cachedShown=true;onFirstView();saveStatus('本机缓存 · 正在核对云端');
  }
  const initialSync=await db.refreshCloud();if(initialSync?.changed)privateImages.invalidate(initialSync.allBlobs?undefined:initialSync.blobIDs);await refresh({background:cachedShown,skipCloudRefresh:true});activateNavigation();onFirstView();if(!resetPending&&!afterAccountReset)void purgeExpiredTrash();await matchingSession.restore();if(cloudMatchingDefaults)applyMatchingDefaults(state,cloudMatchingDefaults);editableImportReady=true;void consumeEditableHandles();saveStatus(cloudEnabled?'已连接 CloudBase':'已保存到本机');if(cloudEnabled){syncDisplay.checking=false;updateSyncIndicator();if(!resetPending){subscribeAccountRevision(accountId);void cloudResumer.wake();}else saveStatus('云端已清空 · 正在后台清理旧图片（暂只读）');}
  }catch(e){console.error(e);recordRuntimeIssue('handled',e,state.route,{phase:'auth'});const auth=e.status===401;if(auth)cloudSessionReady=false;
  if(cachedShown&&!auth){saveStatus('云端核对失败 · 缓存仅供查看');toast('云端连接失败，未改为本机保存：'+e.message);if(cloudEnabled)void cloudResumer.wake();return;}
  if(auth){renderReactPage(createElement('div',{className:'empty'},
    createElement('strong',null,'登录状态失效'),
    createElement('p',null,'请重新登录 CloudBase；本机待同步资料仍然保留。'),
    createElement('button',{className:'btn',onClick:()=>location.reload()},'重新登录')));
  }else{renderReactPage(createElement('div',{className:'empty'},
    createElement('strong',null,'无法读取资料'),
    createElement('p',null,e.message||'请检查设备剩余空间和数据服务连接。'),
    createElement('button',{className:'btn',id:'storage-retry',onClick:()=>init()},'重试连接')));
  }saveStatus('存储不可用');}}
mountIcons(document);
const matchingSession=createMatchingSession({state,db,uid,asset,modelImage,rasterize,
  createProject:()=>createMatchingProject(),saveSnapshotFromDraft:saveProjectSnapshot,
  saveGeneratedImageSnapshot,generatePageImage,runCreativeAgent,createAIRecorder,
  supportsVision,flushSave,route,toast});
startCloudSession(init).catch(error=>{recordRuntimeIssue('handled',error,state.route,{phase:'auth'});document.querySelector('#app').hidden=true;renderLoginGate({visible:false,status:'无法连接认证服务，请稍后刷新。未打开私人资料。',onLogin:async()=>{}});console.warn(error.name);});
import {createMatchingSession} from './matching-session.js';
