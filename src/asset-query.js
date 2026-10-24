// One query contract for the whole library and an individual series. Querying
// always precedes pagination; missing dates and duplicate titles have a stable
// ID tie-break so a card cannot jump between pages on repeated renders.
const normalized=value=>String(value??'').normalize('NFKC').toLocaleLowerCase();
const date=value=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:0;};
export function searchableAssetText(asset){
  return normalized([asset.title,...asset.tags||[],...asset.styleTags||[],
    ...asset.contentTags||[],...asset.semanticTags||[],...asset.palette||[],
    asset.kind,asset.role,asset.texture,asset.isCreativePreset?'预设':null].filter(Boolean).join(' '));
}
export function queryAssets(assets,{query='',kind='all',status='all',seriesID='all',
  sort='newest',recent=false,now=Date.now()}={}){
  const needle=normalized(query).trim();
  const matches=assets.filter(asset=>{
    if(asset.isProjectInternal)return false;
    if(seriesID!=='all'&&(seriesID==='none'?!!asset.seriesID:asset.seriesID!==seriesID))return false;
    if(kind!=='all'&&asset.kind!==kind)return false;
    if(recent&&(!Number.isFinite(Date.parse(asset.createdAt))||now-date(asset.createdAt)>30*864e5))return false;
    if(needle&&!searchableAssetText(asset).includes(needle))return false;
    switch(status){
      case 'ready':return asset.reviewStatus==='ready'&&!asset.isCreativePreset;
      case 'pendingReview':case 'unready':return asset.reviewStatus!=='ready'&&!asset.isCreativePreset;
      case 'used':return asset.usageStatus==='used';
      case 'unused':return asset.usageStatus!=='used'&&!asset.isCreativePreset;
      case 'preset':return !!asset.isCreativePreset;
      case 'favorite':return !!asset.isFavorite;
      case 'inside':return !!asset.seriesID;
      case 'outside':return !asset.seriesID;
      default:return true;
    }
  });
  const byName=sort==='name'||sort==='name-desc';
  const ascending=sort==='name'||sort==='oldest';
  matches.sort((a,b)=>{
    const first=byName?normalized(a.title).localeCompare(normalized(b.title),'zh-CN'):
      date(a.createdAt)-date(b.createdAt);
    if(first)return ascending?first:-first;
    // Keep materials from one imported photo together regardless of UUID.
    if(!byName&&a.importBatchID&&a.importBatchID===b.importBatchID){
      const page=(Number(a.sourcePageIndex)||0)-(Number(b.sourcePageIndex)||0);
      const item=(Number(a.sourceCandidateIndex)||0)-(Number(b.sourceCandidateIndex)||0);
      if(page||item)return page||item;
    }
    return String(a.id).localeCompare(String(b.id));
  });
  return matches;
}
