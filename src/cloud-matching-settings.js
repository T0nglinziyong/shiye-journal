// Last-used creative direction belongs to the signed-in account, not to any
// project or AI task. Keep actual writing/content and current asset basket
// device-local; only non-secret, reusable controls synchronize.
export const CLOUD_MATCHING_SETTINGS_ID='app-matching-defaults';
export const MATCHING_CLOUD_KEYS=Object.freeze([
  'matchMode','matchRatio','matchStyle','matchStyles','matchPurpose',
  'matchPurposes','matchContentPolicy','matchTextPresentation',
  'matchProcessing','customPaperWidth','customPaperHeight','recommendFilter'
]);
const groups=new Set(['matchStyles','matchPurposes']);
const numberKeys=new Set(['customPaperWidth','customPaperHeight']);
const valid=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function normalizeMatchingDefaults(source){
  const output={};
  for(const key of MATCHING_CLOUD_KEYS){
    const value=source?.[key];
    if(numberKeys.has(key)){
      if(Number.isFinite(value)&&value>=50&&value<=1000)output[key]=value;
    }else if(groups.has(key)){
      if(Array.isArray(value))output[key]=[...new Set(value.filter(x=>typeof x==='string'&&x.length<=80))].slice(0,12);
    }else if(typeof value==='string'&&value.length<=100){output[key]=value;}
  }
  return output;
}
export function cloudMatchingSettingsRecord(state,updatedAt=new Date().toISOString()){
  return {id:CLOUD_MATCHING_SETTINGS_ID,settings:normalizeMatchingDefaults(state),updatedAt};
}
export function cloudMatchingSettingsFromMeta(rows){
  const row=rows?.find(item=>item?.id===CLOUD_MATCHING_SETTINGS_ID);
  if(!row||!valid(row.settings))return null;
  return normalizeMatchingDefaults(row.settings);
}
export function applyMatchingDefaults(state,settings){
  const safe=normalizeMatchingDefaults(settings);
  for(const [key,value] of Object.entries(safe))state[key]=structuredClone(value);
  // Never copy matchIntent, basket, coreIDs or previous generated pages here.
  return safe;
}
