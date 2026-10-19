// Apply only AI fields which the user did not change during inference.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function automaticAssetClassification(latest,original,result){
  const update={...latest,autoOrganized:true};
  if(latest.title===original.title&&/^素材 \d+$/.test(original.title||'')&&result.title)update.title=result.title;
  if(same(latest.tags||[],original.tags||[])&&!original.tags?.length&&Array.isArray(result.tags))update.tags=result.tags;
  for(const key of ['contentTags','styleTags','materialTags','placementHints','semanticColorNames'])
    if(!latest[key]?.length&&!original[key]?.length&&Array.isArray(result[key]))update[key]=result[key];
  for(const [key,placeholder] of [['kind','sticker'],['role','focal'],['texture','待记录']])
    if(result[key]&&latest[key]===original[key]&&original[key]===placeholder)update[key]=result[key];
  if(!latest.palette?.length&&!original.palette?.length&&Array.isArray(result.palette))update.palette=result.palette;
  if(result.reviewStatus==='ready'&&latest.reviewStatus===original.reviewStatus&&original.reviewStatus!=='ready')
    update.reviewStatus='ready';
  return update;
}
