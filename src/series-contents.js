import {seriesCovers,seriesMembers} from './library-model.js';

const filtersByID=new Map();
const filters=id=>{if(!filtersByID.has(id))filtersByID.set(id,{query:'',kind:'all',status:'all',sort:'recent',ascending:false});return filtersByID.get(id);};
export function seriesContentsModel(state){
  const series=state.series.find(item=>item.id===state.seriesID);
  if(!series)return null;
  const filter=filters(series.id);
  return {series,filter,all:state.assets.filter(asset=>asset.seriesID===series.id&&!asset.isProjectInternal),
    members:seriesMembers(series.id,state.assets,filter),covers:seriesCovers(series,state.assets)};
}
