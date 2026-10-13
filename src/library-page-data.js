import {catalogDataPage} from './catalog-pagination.js';
import {usedAssetIDs} from './library-model.js';

export function libraryPageData(state){
  const used=usedAssetIDs(state.assets),q=(state.query||'').trim().toLocaleLowerCase();
  const items=state.assets.filter(a=>{
    if(a.isProjectInternal)return false;
    if(q&&![a.title,...(a.tags||[])].join(' ').toLocaleLowerCase().includes(q))return false;
    if(state.libraryRecent&&Date.now()-Date.parse(a.createdAt)>30*864e5)return false;
    if(state.kind!=='all'&&a.kind!==state.kind)return false;
    if(state.seriesID!=='all'&&(state.seriesID==='none'?!!a.seriesID:a.seriesID!==state.seriesID))return false;
    switch(state.status){
      case 'ready':return a.reviewStatus==='ready';
      case 'pendingReview':return a.reviewStatus!=='ready';
      case 'used':return used.has(a.id);
      case 'unused':return !used.has(a.id);
      case 'favorite':return !!a.isFavorite;
      case 'inside':return !!a.seriesID;
      case 'outside':return !a.seriesID;
      default:return true;
    }
  });
  items.sort((a,b)=>{
    if(state.sort==='name'||state.sort==='name-desc'){
      const value=a.title.localeCompare(b.title,'zh-CN');return state.sort==='name'?value:-value;
    }
    const value=Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0);
    return state.sort==='oldest'?value:-value;
  });
  const range=catalogDataPage('library',items.length,state.preferences.maxPageItems);
  return {items:items.slice(range.start,range.end),total:items.length,...range};
}
