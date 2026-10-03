import {BoundedValueCache} from './preview-content-cache.js';
import {cachedImageSource,onImageInvalidation} from './presentation-resources.js';

// Memoize display markup only. The original project remains the sole editable
// record. Mutable drafts are fingerprinted by value, not by object identity.
export function createMatchingCoverCache(context) {
  const cache=new BoundedValueCache({maxEntries:36,maxWeight:4_000_000});
  let scope=null;
  const unsubscribe=onImageInvalidation(()=>cache.clear());
  const render=project=>{
    const account=context.state.accountId||'browser';
    if(scope!==account){cache.clear();scope=account;}
    const draft=project.drafts?.find(d=>d.id===project.activeDraftID)||project.drafts?.[0];
    const ids=new Set((draft?.items||[]).map(item=>item.assetID));
    const assets=(context.state.assets||[]).filter(asset=>ids.has(asset.id));
    const sources=assets.map(asset=>[asset.id,asset.title,asset.blobId,asset.staticPath,asset.updatedAt,cachedImageSource(asset.blobId)]);
    const snapshot=project.snapshotBlobId||draft?.coverImageID||draft?.coverBlobId;
    const signature=JSON.stringify([project.isSnapshot,project.title,project.activeDraftID,snapshot,cachedImageSource(snapshot),draft,sources]);
    // A pathological scene must not make the disposable cache unbounded.
    if(signature.length>1_000_000)return context.workCover(project);
    const key=JSON.stringify([account,project.id]);
    const hit=cache.get(key,signature);if(hit!==undefined)return hit;
    const value=context.workCover(project);
    return cache.set(key,signature,value,(signature.length+value.length)*2);
  };
  return {render,clear(){cache.clear();},stats:()=>({entries:cache.rows.size,hits:cache.hits,misses:cache.misses,weight:cache.weight}),dispose(){unsubscribe();cache.clear();}};
}
