import {materialAlias} from './material-alias.js';
// Preserve every material/alias while keeping image decoding bounded on tablets.
export async function prepareMaterialPreviews(ids,{findAsset,createImage,batchSize=3}={}){
 const previews=[];
 for(let offset=0;offset<ids.length;offset+=batchSize){
  const group=await Promise.all(ids.slice(offset,offset+batchSize).map(async(id)=>{
   const asset=findAsset(id);
   if(!asset)throw Error('创作素材不存在：'+id);
   const url=await createImage(asset);
   if(!url)throw Error('素材「'+asset.title+'」的预览图不可用，请先检查同步状态');
   return {asset:materialAlias(id),url};
  }));
  previews.push(...group);
 }
 return previews;
}
