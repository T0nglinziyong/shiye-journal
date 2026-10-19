import {project,uid} from './domain.js';
import {paperDimensions} from './paper-sizes.js';
import {markProjectAssetsUsed} from './library-model.js';
import {snapshotRecord} from './work-collections.js';
import {neutralizePaperChroma} from './paper-chroma-preprocess.js';
import {extractAlphaMask} from './alpha-mask-blob.js';
import {materialStorageBlobs} from './material-storage-resolution.js';
import {sha256Hex} from './task-fingerprint.js';

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
  const choice=c.seriesID??record.seriesID??batchSeriesID;
  return {title:c.title?.trim()||'新素材',kind:c.kind||'sticker',role:c.role||'focal',tags:c.tags||[],palette:[],texture:'待记录',physicalWidthMM:c.width??null,physicalHeightMM:c.height??null,
    dimensionSource:c.width&&c.height?(c.dimensionSource||'paper'):'unmeasured',processingRecord:c.processingRecord?structuredClone(c.processingRecord):null,reviewStatus:c.reviewStatus||'pendingReview',usageStatus:'unused',seriesID:choice==='__none__'||choice==='__no_library__'?null:choice||null};
}
export async function saveImportBatch({state,db,urls,render,onSaved}) {
  if(state.importSaving||state.importStep==='done')return;
  state.importSaving=true;
  try {
  const assets=[],blobs=[],projects=[],now=new Date().toISOString(),importBatchID=uid();let savedCount=0;
  for(const [sourcePageIndex,record] of state.importRecords.entries()) {
    const sourcePageID=uid();
    if(!record.confirmed)throw Error('请先检查所有照片');
    const chosen=(record.selectedCandidates||[]).filter(c=>c.selected);
    if(state.importMode==='snapshot') {
      // Snapshots are single full pages, not segmented or library-classified.
      // Render exactly the corrected page; never reuse the original perspective
      // photo when the user has accepted the corrected geometry.
      const source=record.correctedBitmap||record.bitmap;
      if(!source)throw Error('校正后的快照页面尚未准备好');
      const canvas=document.createElement('canvas');
      canvas.width=source.width;canvas.height=source.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:record.balanceLight===true});
      ctx.drawImage(source,0,0);
      if(record.balanceLight===true){
        const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
        const balanced=neutralizePaperChroma(frame.data,canvas.width,canvas.height);
        if(balanced!==frame.data){frame.data.set(balanced);ctx.putImageData(frame,0,0);}
      }
      const image=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('快照页面导出失败')),'image/png'));
      const blobId=uid(),p=snapshotRecord({
        title:record.file.name.replace(/\\.[^.]+$/,'')||'导入快照',
        previewBlobId:blobId,format:'image/png',width:canvas.width,height:canvas.height
      });
      projects.push(p);blobs.push({id:blobId,data:image});savedCount++;
    } else if(state.importMode==='work') {
      const source=record.correctedBitmap||record.bitmap;
      const [paperWidth,paperHeight]=importPaperDimensions(record),ratio=source.width/source.height;
      const p=project(record.workTitle?.trim()||record.file.name.replace(/\\.[^.]+$/,'')||'导入作品',{mode:ratio>1.1?'spread':'single',style:'imported'}),d=p.drafts[0];
      d.canvas={width:1000*ratio,height:1000};d.physicalPageHeightMM=paperHeight;
      d.pageRatio='custom:'+Math.round(paperWidth/(d.pageMode==='spread'?2:1))+'x'+Math.round(paperHeight);
      // The background is editable paper metadata, NEVER a reconstructed
      // flattened photo. No inpainting and no locked full-page photo layer.
      const paperPattern=record.workPaperPattern||state.importBatchWorkPaperPattern||'plain';
      d.paperPattern=paperPattern==='columns'?'plain':paperPattern;
      d.paperColumns=record.workPaperColumns===true||paperPattern==='columns';
      d.paperColor=record.workPaperColor||state.importBatchWorkPaperColor||'#fcfaf0';
      d.items=[];
      p.isDraft=false;p.source='imported';p.isUsed=false;
      const elements=chosen.filter(c=>c.region.w<.98||c.region.h<.98);
      // Each selected element already carries its aligned candidate RGB frame.
      // The whole photo is not used when that element is re-cut or re-masked;
      // keeping it here added a large, shared upload to every work import.
      p.candidateAssetIDs=[];
      const choice=record.seriesID&&record.seriesID!==''?record.seriesID:state.importBatchSeriesID||null;
      const copyToLibrary=choice!=='__no_library__';
      p.seriesID=choice==='__none__'||choice==='__no_library__'?null:choice||null;
      for(const [sourceCandidateIndex,c] of elements.entries()) {
        const id=uid(),blobId=uid(),maskId=uid(),candidateFrameBlobId=uid(),region=c.region;
        const stored=await materialStorageBlobs(c.blob,c.candidateFrameBlob||c.originalBlob||c.blob,c.width,c.height);
        const imageHash='sha256:'+await sha256Hex(await stored.cutout.arrayBuffer());
        const encodedMask=await extractAlphaMask(stored.cutout,{
          maxEdge:[900,1200,1600].includes(Number(state.preferences?.recognitionPixels))
            ?Number(state.preferences.recognitionPixels):900
        });
        assets.push({...candidateMetadata(c,record,state.importBatchSeriesID),id,blobId,imageHash,
          initialMaskBlobId:maskId,finalMaskBlobId:maskId,candidateFrameBlobId,
          isProjectInternal:!copyToLibrary,
          usageStatus:copyToLibrary?'used':'unused',usageUpdatedAt:copyToLibrary?now:null,
          seriesID:copyToLibrary?(choice==='__none__'?null:choice||null):null,
          createdAt:now,importBatchID,sourcePageID,sourcePageIndex,sourceCandidateIndex,
          sourceIdentifier:'imported-work-element'});
        blobs.push({id:maskId,data:encodedMask},
          {id:candidateFrameBlobId,data:stored.frame},
          {id:blobId,data:stored.cutout});p.candidateAssetIDs.push(id);
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
      for(const [sourceCandidateIndex,c] of chosen.entries()) {
        const id=uid(),blobId=uid(),maskId=uid(),candidateFrameBlobId=uid();
        const stored=await materialStorageBlobs(c.blob,c.candidateFrameBlob||c.originalBlob||c.blob,c.width,c.height);
        const imageHash='sha256:'+await sha256Hex(await stored.cutout.arrayBuffer());
        const encodedMask=await extractAlphaMask(stored.cutout,{
          maxEdge:[900,1200,1600].includes(Number(state.preferences?.recognitionPixels))
            ?Number(state.preferences.recognitionPixels):900
        });
        assets.push({...candidateMetadata(c,record,state.importBatchSeriesID),id,blobId,imageHash,
          candidateFrameBlobId,initialMaskBlobId:maskId,finalMaskBlobId:maskId,
          createdAt:now,importBatchID,sourcePageID,sourcePageIndex,sourceCandidateIndex});
        blobs.push({id:maskId,data:encodedMask},
          {id:candidateFrameBlobId,data:stored.frame},
          {id:blobId,data:stored.cutout});savedCount++;
      }
    }
  }
  if(!savedCount)throw Error('请选择至少一件素材或一个页面');
  // Commit the whole batch once. A failed transaction never leaves a partly
  // imported batch that would be duplicated when the user retries.
  // Import-completed must never be displayed for a candidate whose saved
  // cutout/original/frame bytes are missing. Those Blob IDs are required for
  // reliable editing after a later reload on iOS.
  const invalid=blobs.find(row=>!(row.data instanceof Blob)||row.data.size<8);
  if(invalid)throw Error('素材原图或抠图字节尚未准备完整，未保存当前批次；请重新识别后再试');
  const result=db.stageImport?await db.stageImport({assets,blobs,projects}):await db.transaction(['assets','blobs','projects'],tx=>{for(const a of assets)tx.objectStore('assets').put(a);for(const b of blobs)tx.objectStore('blobs').put(b);for(const p of projects)tx.objectStore('projects').put(p);});
  state.assets.push(...assets);state.projects.push(...projects);for(const b of blobs)urls.set(b.id,URL.createObjectURL(b.data));
  state.importSavedCount=savedCount;state.importPending=!!result?.pending;state.importStep='done';render();
  // The import is already durable on this device. Let the completed screen
  // paint before starting its larger cloud batch, bypassing the edit delay.
  if(result?.pending&&db.flushProjects)setTimeout(()=>{
    void db.flushProjects().catch(error=>console.warn('导入上传待自动重试',error));
  },250);
  // Remote enrichment starts only after the entire batch is safely committed.
  // It must not block the success screen or the next import batch.
  if(onSaved)void Promise.resolve().then(()=>onSaved(
    assets.filter(a=>!a.isProjectInternal).map(a=>structuredClone(a)),
    {projects:projects.map(p=>structuredClone(p)),waitForSave:()=>db.flushProjects?db.flushProjects():Promise.resolve()}
  )).catch(error=>console.warn('导入后的自动整理待重试',error));
  } finally {state.importSaving=false;}
}
