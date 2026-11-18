import {MATERIAL_TAXONOMY_VERSION,materialKindDetails,isMaterialKind,isMaterialKindDetail,
  isMaterialRole,isContentCategory,isLayoutFit,tagGroups} from './material-taxonomy.js';

export const CATEGORY_FIELDS=Object.freeze(['kind','kindDetail','role','secondaryRoles','contentCategories','layoutFits']);
export const TAG_FIELDS=Object.freeze(tagGroups.map(([id])=>id));
const unique=values=>[...new Set(values)];
const validTags=value=>Array.isArray(value)&&value.every(tag=>typeof tag==='string'&&tag.trim().length>0&&tag.length<=80);
const boundedTags=value=>unique(value.map(tag=>tag.trim()));
export function defaultKindDetail(kind){return kind==='other'?'other.unclassified':null;}
export function validateMaterialClassification(record){
  if(!record||record.classificationVersion!==MATERIAL_TAXONOMY_VERSION||
    !isMaterialKind(record.kind)||(record.kindDetail!=null&&!isMaterialKindDetail(record.kindDetail,record.kind))||
    !isMaterialRole(record.role)||!Array.isArray(record.secondaryRoles)||
    record.secondaryRoles.some(role=>!isMaterialRole(role)||role===record.role)||
    !Array.isArray(record.contentCategories)||record.contentCategories.some(id=>!isContentCategory(id))||
    !Array.isArray(record.layoutFits)||record.layoutFits.some(id=>!isLayoutFit(id))||
    TAG_FIELDS.some(key=>!validTags(record[key])))throw Error('素材分类或标签不符合当前字典');
  return record;
}
export function initialMaterialClassification({kind='other',role='focal',tags=[]}={}){
  const type=isMaterialKind(kind)?kind:'other',main=isMaterialRole(role)?role:'focal';
  return {classificationVersion:MATERIAL_TAXONOMY_VERSION,kind:type,kindDetail:defaultKindDetail(type),
    role:main,secondaryRoles:[],contentCategories:[],layoutFits:[],
    ...Object.fromEntries(TAG_FIELDS.map(key=>[key,key==='tags'?boundedTags(tags):[]])),
    categoryEvidence:{kind:{source:'default'},kindDetail:{source:'default'},role:{source:'default'}},
    tagEvidence:{},tagGroupEvidence:{}};
}
export function userMaterialClassification(old,changes,{confirm=false}={}){
  const next={...old,...changes,classificationVersion:MATERIAL_TAXONOMY_VERSION};
  if(changes.kind&&changes.kind!==old.kind&&!Object.hasOwn(changes,'kindDetail'))next.kindDetail=defaultKindDetail(changes.kind);
  for(const key of ['secondaryRoles','contentCategories','layoutFits'])next[key]=unique(next[key]||[]);
  for(const key of TAG_FIELDS)next[key]=boundedTags(next[key]||[]);
  validateMaterialClassification(next);
  const categoryEvidence={...old.categoryEvidence},tagEvidence={...old.tagEvidence},
    tagGroupEvidence={...old.tagGroupEvidence};
  for(const key of CATEGORY_FIELDS)if(Object.hasOwn(changes,key)&&JSON.stringify(next[key])!==JSON.stringify(old[key]))
    categoryEvidence[key]={source:'user',confidence:1};
  for(const key of TAG_FIELDS)if(Object.hasOwn(changes,key)&&JSON.stringify(next[key])!==JSON.stringify(old[key])){
    tagEvidence[key]=Object.fromEntries(next[key].map(value=>[value,{source:'user',confidence:1}]));
    tagGroupEvidence[key]={source:'user'};
  }
  if(confirm){
    for(const key of CATEGORY_FIELDS)categoryEvidence[key]={source:'user',confidence:1};
    for(const key of TAG_FIELDS){
      tagEvidence[key]=Object.fromEntries(next[key].map(value=>[value,{source:'user',confidence:1}]));
      tagGroupEvidence[key]={source:'user'};
    }
  }
  return {...next,categoryEvidence,tagEvidence,tagGroupEvidence};
}
const candidate=(value,isValid)=>value&&typeof value==='object'&&isValid(value.id)&&
  typeof value.confidence==='number'&&value.confidence>=0&&value.confidence<=1;
export function applyAIClassification(old,result,{minConfidence=.7,allowMigrationOverride=false}={}){
  validateMaterialClassification(old);
  if(!result||typeof result!=='object'||typeof result.modelVersion!=='string'||!result.modelVersion)
    throw Error('AI 素材分类结果缺少模型版本');
  const next={...old},categoryEvidence={...old.categoryEvidence},tagEvidence={...old.tagEvidence};
  const set=(key,value,valid)=>{
    if(!candidate(value,valid)||value.confidence<minConfidence||categoryEvidence[key]?.source==='user'||
      categoryEvidence[key]?.source==='migration'&&!allowMigrationOverride)return;
    if(key==='kind'&&value.id!==old.kind&&categoryEvidence.kindDetail?.source==='user')return;
    next[key]=value.id;categoryEvidence[key]={source:'ai',confidence:value.confidence,modelVersion:result.modelVersion};
  };
  set('kind',result.kind,isMaterialKind);
  set('kindDetail',result.kindDetail,id=>isMaterialKindDetail(id,next.kind));
  if(next.kindDetail!=null&&!isMaterialKindDetail(next.kindDetail,next.kind))next.kindDetail=defaultKindDetail(next.kind);
  set('role',result.role,isMaterialRole);
  for(const [key,valid] of [['secondaryRoles',isMaterialRole],['contentCategories',isContentCategory],['layoutFits',isLayoutFit]]){
    if(categoryEvidence[key]?.source==='user'||categoryEvidence[key]?.source==='migration'&&!allowMigrationOverride)continue;
    const values=Array.isArray(result[key])?result[key].filter(item=>candidate(item,valid)&&item.confidence>=minConfidence):[];
    next[key]=unique(values.map(item=>item.id).filter(id=>key!=='secondaryRoles'||id!==next.role));
    categoryEvidence[key]={source:'ai',confidence:values.length?Math.min(...values.map(item=>item.confidence)):0,
      modelVersion:result.modelVersion,items:Object.fromEntries(values.map(item=>[item.id,{confidence:item.confidence}]))};
  }
  for(const key of TAG_FIELDS){
    if(old.tagGroupEvidence?.[key]?.source==='user')continue;
    const incoming=Array.isArray(result[key])?result[key].filter(item=>item&&typeof item.value==='string'&&
      item.value.trim()&&item.value.length<=80&&Number.isFinite(item.confidence)&&item.confidence>=minConfidence&&item.confidence<=1):[];
    const prior=tagEvidence[key]||{},kept=next[key].filter(value=>prior[value]?.source!=='ai');
    next[key]=boundedTags([...kept,...incoming.map(item=>item.value)]);
    tagEvidence[key]={...Object.fromEntries(kept.map(value=>[value,prior[value]||{source:'user',confidence:1}])),
      ...Object.fromEntries(incoming.map(item=>[item.value.trim(),{source:'ai',confidence:item.confidence,modelVersion:result.modelVersion}]))};
  }
  if(typeof result.title==='string'&&result.title.trim()&&result.title.length<=80&&
    result.titleConfidence>=minConfidence&&old.titleEvidence?.source!=='user'){
    next.title=result.title.trim();next.titleEvidence={source:'ai',confidence:result.titleConfidence,modelVersion:result.modelVersion};
  }
  if(typeof result.description==='string'&&result.description.trim()&&result.description.length<=500&&
    Number.isFinite(result.descriptionConfidence)&&result.descriptionConfidence>=minConfidence&&
    result.descriptionConfidence<=1&&old.descriptionEvidence?.source!=='user'){
    next.description=result.description.trim();
    next.descriptionEvidence={source:'ai',confidence:result.descriptionConfidence,modelVersion:result.modelVersion};
  }
  next.categoryEvidence=categoryEvidence;next.tagEvidence=tagEvidence;
  next.autoOrganized=true;next.reviewStatus=old.reviewStatus==='ready'?'ready':'pendingReview';
  return validateMaterialClassification(next);
}
