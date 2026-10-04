// Mirrors MaterialSeries.resolvedCoverIDs. An empty/obsolete explicit cover
// falls back to the first three current members, without changing membership.
export function seriesCovers(series, assets) {
  const members = assets.filter(a => a.seriesID === series.id && !a.isProjectInternal);
  const chosen = (series.coverAssetIDs || []).filter(id => members.some(a => a.id === id)).slice(0, 5);
  return (chosen.length ? chosen : members.slice(0, 3).map(a => a.id)).map(id => members.find(a => a.id === id));
}
export function parseTags(text) {
  return [...new Set(String(text || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean))];
}
export function searchableSeries(series, assets) {
  return [series.title, series.introduction, ...(series.styleTags || []), ...(series.semanticTags || []),
    ...assets.filter(a => a.seriesID === series.id).flatMap(a => [a.title, ...(a.tags || []), ...(a.contentTags || []), ...(a.styleTags || [])])]
    .join(' ').toLocaleLowerCase();
}

export function usedAssetIDs(assets = []) {
  return new Set(assets.filter(asset => asset.usageStatus === 'used').map(asset => asset.id));
}
export function withUsageStatus(asset, used, at = new Date().toISOString()) {
  return {...asset, usageStatus: used ? 'used' : 'unused', usageUpdatedAt: at, updatedAt: at};
}
export function projectAssetIDs(project) {
  return new Set((project.drafts || []).flatMap(d => (d.items || []).filter(i => !i.isParked).map(i => i.assetID)).filter(Boolean));
}
export function markProjectAssetsUsed(project, assets, at = new Date().toISOString()) {
  const ids = projectAssetIDs(project);
  return assets.filter(asset => ids.has(asset.id)).map(asset => withUsageStatus(asset, true, at));
}
export function seriesMembers(seriesID, assets, filters = {}) {
  const used = usedAssetIDs(assets), q = (filters.query || '').trim().toLocaleLowerCase();
  return assets.filter(a => {
    if (a.isProjectInternal || a.seriesID !== seriesID) return false;
    if (filters.kind && filters.kind !== 'all' && a.kind !== filters.kind) return false;
    if (filters.status === 'ready' && a.reviewStatus !== 'ready') return false;
    if (filters.status === 'unready' && a.reviewStatus === 'ready') return false;
    if (filters.status === 'used' && !used.has(a.id)) return false;
    if (filters.status === 'unused' && a.usageStatus !== 'unused') return false;
    if (filters.status === 'favorite' && !a.isFavorite) return false;
    if (filters.status === 'outside') return false;
    return !q || [a.title, ...(a.tags || []), ...(a.styleTags || []), ...(a.contentTags || []), ...(a.semanticTags || [])].join(' ').toLocaleLowerCase().includes(q);
  }).sort((a,b) => {
    const v = filters.sort === 'name' ? a.title.localeCompare(b.title, 'zh-CN') : String(a.createdAt || '').localeCompare(b.createdAt || '');
    return (filters.ascending ? v : -v) || a.id.localeCompare(b.id);
  });
}
