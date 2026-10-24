import {catalogDataPage} from './catalog-pagination.js';
import {queryAssets} from './asset-query.js';

export function libraryPageData(state){
  const items=queryAssets(state.assets,{query:state.query,kind:state.kind,status:state.status,
    seriesID:state.seriesID,sort:state.sort,recent:state.libraryRecent});
  const range=catalogDataPage('library',items.length,state.preferences.maxPageItems);
  return {items:items.slice(range.start,range.end),nextItems:items.slice(range.end,range.end+2),total:items.length,...range};
}
