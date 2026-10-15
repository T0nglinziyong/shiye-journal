import {BoundedValueCache} from './preview-content-cache.js';
import {prepareProjectScene} from './scene-v2.js';
import {cachedImageSource,onImageInvalidation} from './presentation-resources.js';

// React owns the variant card. This cache supplies its raster URL and never
// replaces or reorders the card's DOM nodes.
export function createMatchingCoverCache(context){
  const raster=new BoundedValueCache({maxEntries:24,maxWeight:12_000_000});
  const jobs=new Map();let scope=null;
  const clear=()=>{raster.clear();jobs.clear();};
  const unsubscribe=onImageInvalidation(clear);
  const snapshot=project=>{
    prepareProjectScene(project);
    const draft=project.drafts?.find(row=>row.id===project.activeDraftID)||project.drafts?.[0];
    const ids=new Set((draft?.items||[]).map(item=>item.assetID));
    const sources=(context.state.assets||[]).filter(asset=>ids.has(asset.id))
      .map(asset=>[asset.id,asset.title,asset.blobId,asset.staticPath,asset.updatedAt,
        cachedImageSource(asset.blobId)]);
    const image=project.snapshotBlobId||draft?.coverImageID||draft?.coverBlobId;
    return {draft,signature:JSON.stringify([project.isSnapshot,project.title,
      project.activeDraftID,image,cachedImageSource(image),draft,sources])};
  };
  const account=()=>{
    const value=context.state.accountId||'browser';
    if(scope!==value){clear();scope=value;}
    return value;
  };
  const rasterize=async project=>{
    if(project?.isSnapshot||typeof context.rasterize!=='function')return null;
    const owner=account(),{draft,signature}=snapshot(project);if(!draft)return null;
    const key=JSON.stringify([owner,project.id]),hit=raster.get(key,signature);
    if(hit!==undefined)return hit;
    const jobKey=key+'\0'+signature;if(jobs.has(jobKey))return jobs.get(jobKey);
    const task=(async()=>{
      const scale=Math.max(.18,Math.min(.7,480/Math.max(draft.canvas.width,draft.canvas.height)));
      const canvas=await context.rasterize(draft,scale);
      const url=canvas.toDataURL('image/jpeg',.88);
      raster.set(key,signature,url,url.length*2);return url;
    })().catch(()=>null).finally(()=>jobs.delete(jobKey));
    jobs.set(jobKey,task);return task;
  };
  return {rasterize,clear,stats:()=>({entries:raster.rows.size,hits:raster.hits,
    misses:raster.misses,weight:raster.weight}),dispose(){unsubscribe();clear();}};
}
