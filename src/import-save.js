import {project,uid} from './domain.js';
import {paperDimensions} from './paper-sizes.js';
import {markProjectAssetsUsed} from './library-model.js';

export function importPaperDimensions(record) {
  const size=record.paperSize==='custom'?{width:record.customImportWidth,height:record.customImportHeight}:paperDimensions(record.paperSize)||paperDimensions('a4');
  let [w,h]=[size.width,size.height];
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1||w>10000||h>10000)throw Error('纸张宽高需要是 1–10000 mm');
  const bitmap=record.bitmap;
  const distance=(a,b)=>Math.hypot((a.x-b.x)*(bitmap?.width||1),(a.y-b.y)*(bitmap?.height||1)),corners=record.corners;
  const landscape=corners?distance(corners[0],corners[1])+distance(corners[3],corners[2])>distance(corners[0],corners[3])+distance(corners[1],corners[2]):bitmap?.width>bitmap?.height;
  if(record.paperOrientation==='landscape'||record.paperOrientation==='auto'&&landscape)[w,h]=[Math.max(w,h),Math.min(w,h)];
  else [w,h]=[Math.min(w,h),Math.max(w,h)];
  return [w,h];
}
export function candidateMetadata(c,record,batchSeriesID) {
  if(c.width!=null&&(!Number.isFinite(c.width)||c.width<=0)||c.height!=null&&(!Number.isFinite(c.height)||c.height<=0))throw Error('素材宽高必须是正数或留空');
  const quantity=c.quantity??1;if(!Number.isInteger(quantity)||quantity<1)throw Error('素材数量必须是正整数');
  const choice=c.seriesID??record.seriesID??batchSeriesID;
  return {title:c.title?.trim()||'新素材',kind:c.kind||'sticker',role:c.role||'focal',tags:c.tags||[],palette:[],texture:'待记录',physicalWidthMM:c.width??null,physicalHeightMM:c.height??null,
    dimensionSource:c.width&&c.height?(c.dimensionSource||'paper'):'unmeasured',processingRecord:c.processingRecord?structuredClone(c.processingRecord):null,supply:{kind:quantity===1?'single':'multiple',quantity},reviewStatus:c.reviewStatus||'pendingReview',usageStatus:'unused',seriesID:choice==='__none__'?null:choice||batchSeriesID||null};
}
export async function saveImportBatch({state,db,urls,render,onSaved}) {
  if(state.importSaving||state.importStep==='done')return;
  state.importSaving=true;
  try {
  const assets=[],blobs=[],projects=[],now=new Date().toISOString();let savedCount=0;
  for(const record of state.importRecords) {
    if(!record.confirmed)throw Error('请先检查所有照片');
    const chosen=(record.selectedCandidates||[]).filter(c=>c.selected);
    if(state.importMode==='work') {
      const source=record.correctedBitmap||record.bitmap;
      const [paperWidth,paperHeight]=importPaperDimensions(record),ratio=source.width/source.height;
      const p=project(record.workTitle?.trim()||record.file.name.replace(/\\.[^.]+$/,'')||'导入作品',{mode:ratio>1.1?'spread':'single',style:'imported'}),d=p.drafts[0];
      d.canvas={width:1000*ratio,height:1000};d.physicalPageHeightMM=paperHeight;
      d.pageRatio='custom:'+Math.round(paperWidth/(d.pageMode==='spread'?2:1))+'x'+Math.round(paperHeight);
      // The background is editable paper metadata, NEVER a reconstructed
      // flattened photo. No inpainting and no locked full-page photo layer.
      d.paperPattern=record.workPaperPattern||state.importBatchWorkPaperPattern||'plain';
      d.paperColor=record.workPaperColor||state.importBatchWorkPaperColor||'#fcfaf0';
      d.items=[];
      p.isDraft=false;p.source='imported';p.isUsed=false;
      const elements=chosen.filter(c=>c.region.w<.98||c.region.h<.98);
      const originalID=uid();
      blobs.push({id:originalID,data:record.originalFile||record.file});
      p.originalImportPhotoBlobID=originalID;
      p.candidateAssetIDs=[];
      const copyToLibrary=record.workSaveAssets??state.importBatchWorkSaveAssets??false;
      const choice=record.seriesID&&record.seriesID!==''?record.seriesID:state.importBatchSeriesID||null;
      p.seriesID=choice==='__none__'?null:choice||null;
      for(const c of elements) {
        const id=uid(),blobId=uid(),sourceID=uid(),originalCutoutBlobId=uid(),candidateFrameBlobId=uid(),region=c.region;
        assets.push({...candidateMetadata(c,record,state.importBatchSeriesID),id,blobId,originalBlobId:sourceID,originalCutoutBlobId,candidateFrameBlobId,photoBlobId:originalID,isProjectInternal:!copyToLibrary,createdAt:now,sourceIdentifier:'imported-work-element'});
        blobs.push({id:originalCutoutBlobId,data:c.originalCutoutBlob||c.blob},{id:candidateFrameBlobId,data:c.candidateFrameBlob||c.originalBlob||c.blob});
        blobs.push({id:blobId,data:c.blob},{id:sourceID,data:c.originalBlob||c.blob});p.candidateAssetIDs.push(id);
        d.items.push({id:uid(),assetID:id,x:(region.x+region.w/2)*d.canvas.width,y:(region.y+region.h/2)*1000,
          width:region.w*d.canvas.width,height:region.h*1000,rotation:region.rotation||0,zIndex:d.items.length,isLocked:false,isParked:false,opacity:1});
      }
      // Import establishes the first editable baseline, including paper,
      // detected cutouts and their physical placements.
      p.initialEditorSnapshot={drafts:[structuredClone(d)],activeDraftID:d.id};
      p.draftHistorySnapshots={[d.id]:structuredClone(d)};
      projects.push(p);savedCount++;
    }else {
      if(!chosen.length)continue;
      // Material editing/re-recognition needs only the candidate frame, not the
      // whole imported photograph. Keep the aligned source pixels plus the full
      // candidate-box frame so storage stays local and compact.
      for(const c of chosen) {
        const id=uid(),blobId=uid(),originalBlobId=uid(),originalCutoutBlobId=uid(),candidateFrameBlobId=uid();
        const {mask,...region}=c.region;
        assets.push({...candidateMetadata(c,record,state.importBatchSeriesID),id,blobId,originalBlobId,originalCutoutBlobId,candidateFrameBlobId,sourceRegion:structuredClone(region),createdAt:now});
        blobs.push({id:originalCutoutBlobId,data:c.originalCutoutBlob||c.blob},{id:candidateFrameBlobId,data:c.candidateFrameBlob||c.originalBlob||c.blob});
        blobs.push({id:blobId,data:c.blob},{id:originalBlobId,data:c.originalBlob||c.blob});savedCount++;
      }
    }
  }
  if(!savedCount)throw Error('请选择至少一件素材');
  // Commit the whole batch once. A failed transaction never leaves a partly
  // imported batch that would be duplicated when the user retries.
  const result=db.stageImport?await db.stageImport({assets,blobs,projects}):await db.transaction(['assets','blobs','projects'],tx=>{for(const a of assets)tx.objectStore('assets').put(a);for(const b of blobs)tx.objectStore('blobs').put(b);for(const p of projects)tx.objectStore('projects').put(p);});
  state.assets.push(...assets);state.projects.push(...projects);for(const b of blobs)urls.set(b.id,URL.createObjectURL(b.data));
  state.importSavedCount=savedCount;state.importPending=!!result?.pending;state.importStep='done';render();
  // Remote enrichment starts only after the entire batch is safely committed.
  // It must not block the success screen or the next import batch.
  if(onSaved)void Promise.resolve().then(()=>onSaved(
    assets.filter(a=>!a.isProjectInternal).map(a=>structuredClone(a)),
    {projects:projects.map(p=>structuredClone(p)),waitForSave:()=>db.flushProjects?db.flushProjects():Promise.resolve()}
  )).catch(error=>console.warn('导入后的自动整理待重试',error));
  } finally {state.importSaving=false;}
}
