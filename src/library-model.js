// A tidy cover has nine cells; a layered cover may use every selected item.
export function seriesCovers(series, assets) {
  const members = assets.filter(a => a.seriesID === series.id && !a.isProjectInternal);
  const byID=new Map(members.map(asset=>[asset.id,asset]));
  const chosen=[...new Set(series.coverAssetIDs||[])].filter(id=>byID.has(id));
  const selected=chosen.length?chosen.map(id=>byID.get(id)):members;
  return series.coverLayout==='grid'?selected.slice(0,9):selected;
}
export function parseTags(text) {
  return [...new Set(String(text || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean))];
}
export function searchableSeries(series, assets) {
  return [series.title, series.introduction, ...(series.styleTags || []), ...(series.semanticTags || []),
    ...assets.filter(a => a.seriesID === series.id && !a.isProjectInternal).flatMap(a => [a.title, ...(a.tags || []), ...(a.contentTags || []), ...(a.styleTags || [])])]
    .join(' ').toLocaleLowerCase();
}

export function usedAssetIDs(assets = []) {
  return new Set(assets.filter(asset => asset.usageStatus === 'used').map(asset => asset.id));
}
export function withUsageStatus(asset, used, at = new Date().toISOString()) {
  return {...asset, usageStatus: used ? 'used' : 'unused', usageUpdatedAt: at, updatedAt: at};
}
export function projectAssetIDs(project) {
  const current=project?.drafts?.find(d=>d.id===project.activeDraftID)||project?.drafts?.[0];
  return new Set((current?.items||[]).filter(item=>!item.isParked&&!item.hidden&&!item.isHidden)
    .map(item=>item.assetID).filter(Boolean));
}
export function markProjectAssetsUsed(project, assets, at = new Date().toISOString()) {
  const ids = projectAssetIDs(project);
  return assets.filter(asset => ids.has(asset.id) && asset.kind!=='tape' &&
    asset.usageStatus !== 'used').map(asset => withUsageStatus(asset, true, at));
}
export function seriesMembers(seriesID, assets, filters = {}) {
  const sort=filters.sort==='name'?(filters.ascending?'name':'name-desc'):
    filters.ascending?'oldest':'newest';
  return queryAssets(assets,{query:filters.query,kind:filters.kind,status:filters.status,
    seriesID,sort});
}
import {queryAssets} from './asset-query.js';
