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
const png=canvas=>new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
async function workBackground(source,candidates) {
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  const original=ctx.getImageData(0,0,canvas.width,canvas.height),width=canvas.width,height=canvas.height;
  const holes=candidates.map(c=>c.region);
  for(const c of candidates) {
    const r=c.region,margin=Math.max(.008,Math.min(r.w,r.h)*.13),samples=[[],[],[]];
    for(const distance of [margin,margin*2,margin*3]) {
      for(let step=0;step<=10;step++) {
        const t=step/10;
        for(const [x,y] of [[r.x+t*r.w,r.y-distance],[r.x+t*r.w,r.y+r.h+distance],[r.x-distance,r.y+t*r.h],[r.x+r.w+distance,r.y+t*r.h]]) {
          if(x<0||x>=1||y<0||y>=1||holes.some(h=>x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h))continue;
          const offset=(Math.floor(y*height)*width+Math.floor(x*width))*4;
          for(let k=0;k<3;k++)samples[k].push(original.data[offset+k]);
        }
      }
      if(samples[0].length>=12)break;
    }
    const colors=samples.map(s=>s.length?s.sort((a,b)=>a-b)[Math.floor(s.length/2)]:255);
    const bitmap=await createImageBitmap(c.blob),mask=document.createElement('canvas');mask.width=width;mask.height=height;
    const m=mask.getContext('2d');m.save();m.translate((r.x+r.w/2)*width,(r.y+r.h/2)*height);m.rotate((r.rotation||0)*Math.PI/180);m.drawImage(bitmap,-r.w*width/2,-r.h*height/2,r.w*width,r.h*height);m.restore();
    m.globalCompositeOperation='source-in';m.fillStyle='rgb('+colors.join(',')+')';m.fillRect(0,0,width,height);ctx.drawImage(mask,0,0);bitmap.close();
  }
  return png(canvas);
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
      const p=project(record.workTitle?.trim()||record.file.name.replace(/\.[^.]+$/,'')||'导入作品',{mode:ratio>1.1?'spread':'single',style:'imported'}),d=p.drafts[0];
      d.canvas={width:1000*ratio,height:1000};d.physicalPageHeightMM=paperHeight;
      d.pageRatio='custom:'+Math.round(paperWidth/(d.pageMode==='spread'?2:1))+'x'+Math.round(paperHeight);
      p.isDraft=false;p.styleTags=record.workTags||[];p.isUsed=!!record.isUsed;
      const elements=chosen.filter(c=>c.region.w<.98||c.region.h<.98);
      const background=await workBackground(source,elements),backgroundID=uid(),originalID=uid(),baseID=uid();
      blobs.push({id:backgroundID,data:background},{id:originalID,data:record.originalFile||record.file});
      const base={id:baseID,title:p.title+' · 底页',kind:'photo',role:'background',tags:[],palette:[],texture:'photo',blobId:backgroundID,originalBlobId:originalID,physicalWidthMM:paperWidth,physicalHeightMM:paperHeight,dimensionSource:'importedPage',supply:{kind:'single',quantity:1},reviewStatus:'ready',usageStatus:'unused',seriesID:null,isProjectInternal:true,createdAt:now,sourceIdentifier:'imported-work-page'};
      assets.push(base);p.candidateAssetIDs=[baseID];
      d.items=[{id:uid(),assetID:baseID,x:d.canvas.width/2,y:500,width:d.canvas.width,height:1000,rotation:0,zIndex:-100,isLocked:true,isParked:false,opacity:1}];
      for(const c of elements) {
        const id=uid(),blobId=uid(),sourceID=uid(),originalCutoutBlobId=uid(),candidateFrameBlobId=uid(),r=c.region;
        assets.push({...candidateMetadata(c,record,state.importBatchSeriesID),id,blobId,originalBlobId:sourceID,originalCutoutBlobId,candidateFrameBlobId,photoBlobId:originalID,isProjectInternal:true,createdAt:now,sourceIdentifier:'imported-work-element'});
        blobs.push({id:originalCutoutBlobId,data:c.originalCutoutBlob||c.blob},{id:candidateFrameBlobId,data:c.candidateFrameBlob||c.originalBlob||c.blob});
        blobs.push({id:blobId,data:c.blob},{id:sourceID,data:c.originalBlob||c.blob});p.candidateAssetIDs.push(id);
        d.items.push({id:uid(),assetID:id,x:(r.x+r.w/2)*d.canvas.width,y:(r.y+r.h/2)*1000,width:r.w*d.canvas.width,height:r.h*1000,rotation:r.rotation||0,zIndex:d.items.length,isLocked:false,isParked:false,opacity:1});
      }
      if(p.isUsed){
        const used=new Map(markProjectAssetsUsed(p,assets,now).map(asset=>[asset.id,asset]));
        for(let i=0;i<assets.length;i++)if(used.has(assets[i].id))assets[i]=used.get(assets[i].id);
      }
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
  if(state.importMode!=='work'&&onSaved)void Promise.resolve().then(()=>onSaved(assets.map(a=>structuredClone(a)),{waitForSave:()=>db.flushProjects?db.flushProjects():Promise.resolve()})).catch(console.warn);
  } finally {state.importSaving=false;}
}
