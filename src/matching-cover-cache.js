import {BoundedValueCache} from './preview-content-cache.js';
import {cachedImageSource,onImageInvalidation} from './presentation-resources.js';

// Matching cards first render a lightweight DOM fallback, then replace it with
// an actual raster of the editable page. This keeps the card responsive while
// making text, masks, vectors and stacking match the real canvas.
export function createMatchingCoverCache(context) {
  const cache=new BoundedValueCache({maxEntries:36,maxWeight:4_000_000});
  const raster=new BoundedValueCache({maxEntries:24,maxWeight:12_000_000});
  const jobs=new Map();let scope=null;
  const unsubscribe=onImageInvalidation(()=>{cache.clear();raster.clear();jobs.clear();});
  const snapshot=project=>{
    const draft=project.drafts?.find(d=>d.id===project.activeDraftID)||project.drafts?.[0];
    const ids=new Set((draft?.items||[]).map(item=>item.assetID));
    const assets=(context.state.assets||[]).filter(asset=>ids.has(asset.id));
    const sources=assets.map(asset=>[asset.id,asset.title,asset.blobId,asset.staticPath,asset.updatedAt,cachedImageSource(asset.blobId)]);
    const image=project.snapshotBlobId||draft?.coverImageID||draft?.coverBlobId;
    const signature=JSON.stringify([project.isSnapshot,project.title,project.activeDraftID,image,cachedImageSource(image),draft,sources]);
    return {draft,signature};
  };
  const account=()=>{
    const value=context.state.accountId||'browser';
    if(scope!==value){cache.clear();raster.clear();jobs.clear();scope=value;}
    return value;
  };
  const render=project=>{
    const owner=account(),{signature}=snapshot(project);
    if(signature.length>1_000_000)return context.workCover(project);
    const key=JSON.stringify([owner,project.id]),hit=cache.get(key,signature);if(hit!==undefined)return hit;
    const value=context.workCover(project);
    return cache.set(key,signature,value,(signature.length+value.length)*2);
  };
  const rasterize=async(project)=>{
    if(project?.isSnapshot||typeof context.rasterize!=='function')return null;
    const owner=account(),{draft,signature}=snapshot(project);if(!draft)return null;
    const key=JSON.stringify([owner,project.id]),hit=raster.get(key,signature);if(hit!==undefined)return hit;
    const jobKey=key+'\0'+signature;if(jobs.has(jobKey))return jobs.get(jobKey);
    const task=(async()=>{
      const scale=Math.max(.18,Math.min(.7,480/Math.max(draft.canvas.width,draft.canvas.height)));
      const canvas=await context.rasterize(draft,scale);
      const url=canvas.toDataURL('image/jpeg',.88);
      raster.set(key,signature,url,url.length*2);return url;
    })().catch(()=>null).finally(()=>jobs.delete(jobKey));
    jobs.set(jobKey,task);return task;
  };
  const hydrate=(root,variants=[])=>{
    if(!root)return;
    const byID=new Map(variants.map(variant=>[variant.id,variant]));
    for(const host of root.querySelectorAll('[data-match-raster]')){
      const variant=byID.get(host.dataset.matchRaster);if(!variant||variant.status==='running'||variant.project?.isSnapshot)continue;
      void rasterize(variant.project).then(url=>{
        if(!url||!host.isConnected)return;
        const current=byID.get(host.dataset.matchRaster);if(current!==variant)return;
        const image=document.createElement('img');image.className='match-raster-preview';image.src=url;image.alt=variant.title+' 构图预览';host.replaceChildren(image);
      });
    }
  };
  return {render,hydrate,clear(){cache.clear();raster.clear();jobs.clear();},stats:()=>({entries:cache.rows.size+raster.rows.size,hits:cache.hits+raster.hits,misses:cache.misses+raster.misses,weight:cache.weight+raster.weight}),dispose(){unsubscribe();cache.clear();raster.clear();jobs.clear();}};
}
