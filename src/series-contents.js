import {seriesCovers,seriesMembers} from './library-model.js';

const filtersByID=new Map();
const filters=id=>{if(!filtersByID.has(id))filtersByID.set(id,{query:'',kind:'all',status:'all',sort:'recent',ascending:false});return filtersByID.get(id);};
export function clearSeriesContentFilters(){filtersByID.clear();}
export function snapshotSeriesContentFilters(){return Object.fromEntries([...filtersByID].map(([id,value])=>[id,{...value}]));}
export function restoreSeriesContentFilters(snapshot){
  filtersByID.clear();
  if(!snapshot||typeof snapshot!=='object')return;
  for(const [id,value] of Object.entries(snapshot)){
    if(id.length>500||!value||typeof value!=='object')continue;
    filtersByID.set(id,{query:String(value.query||''),kind:value.kind||'all',
      status:value.status||'all',sort:value.sort||'recent',ascending:!!value.ascending});
  }
}
export function seriesContentsModel(state){
  const series=state.series.find(item=>item.id===state.seriesID);
  if(!series)return null;
  const filter=filters(series.id);
  return {series,filter,all:state.assets.filter(asset=>asset.seriesID===series.id&&!asset.isProjectInternal),
    members:seriesMembers(series.id,state.assets,filter),covers:seriesCovers(series,state.assets)};
}
