// A deleted layer releases its source material. Required sources that are no
// longer represented in the Scene remain available in the editor's tray.
export function standbyMaterialRows(draft,assets,requiredAssetIDs=[]){
 const byID=new Map(assets.map(asset=>[asset.id,asset]));
 const rows=draft.items.filter(item=>item.isParked)
  .map(item=>({asset:byID.get(item.assetID),item})).filter(row=>row.asset);
 const represented=new Set(draft.items.map(item=>item.assetID));
 for(const id of new Set(requiredAssetIDs)){
  const asset=byID.get(id);
  if(asset&&!represented.has(id))rows.push({asset,item:null});
 }
 return rows;
}
