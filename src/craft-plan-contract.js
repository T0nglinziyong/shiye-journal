const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const str=(maxLength=192)=>({type:'string',minLength:1,maxLength});
const num=(minimum=-20000,maximum=20000)=>({type:'number',minimum,maximum});
const enums=values=>({type:'string',enum:values});
const array=(items,minItems=0,maxItems=24)=>({type:'array',items,minItems,maxItems});
const key=str(),hash={type:'string',pattern:'^sha256:[a-f0-9]{64}$'},point=array(num(),2,2);
const ring=array(point,3,1024),polygon=array(ring,1,64),geometry=array(polygon,1,128);
const cutCommon={op:enums(['cut_shape']),mode:enums(['keep','remove']),unit:enums(['ratio','mm'])};
export const regionOperationSchemas=[
 object({op:enums(['extract_region']),region:key,source_revision:hash,mode:enums(['bounds','outline']),margin_mm:num(0,20)},['op','region','source_revision']),
 object({...cutCommon,shape:enums(['rectangle','ellipse']),box:array(num(),4,4)},['op','mode','shape','box']),
 object({...cutCommon,shape:enums(['polygon']),points:ring},['op','mode','shape','points']),
 object({...cutCommon,shape:enums(['geometry']),geometry},['op','mode','shape','geometry'])
];
export function craftPlanContract({operation,relation,paper,text,primitive,ink}){
 const extraction={anyOf:[
  object({type:enums(['whole'])},['type']),
  object({type:enums(['rect_crop']),boxMM:array(num(0,20000),4,4)},['type','boxMM']),
  object({type:enums(['region']),regionId:key,mode:enums(['bounds','outline']),marginMM:num(0,20)},['type','regionId'])
 ]};
 const piece=object({id:key,asset:key,sourceRevision:hash,unit:{type:'integer',minimum:0,maximum:10000},parentId:key,extraction,
  treatments:array(operation,0,12),centerMM:point,rotationDeg:num(-180,180),z:{type:'integer',minimum:-1000,maximum:1000},relation},['id','asset','sourceRevision','extraction']);
 return object({format:enums(['shiye-craft-plan']),version:{type:'integer',enum:[2]},commandId:str(96),baseSceneHash:hash,
  decisions:array(object({asset:key,choice:enums(['whole','extract','treat','split','reuse','relate']),purpose:str(160)},['asset','choice','purpose']),0,100),
  pieces:array(piece,1,24),consume:array(key,0,24),keepRemainders:{type:'boolean'},paper,
  texts:array(text,0,24),graphics:array(primitive,0,48),ink:array(ink,0,32),finish:{type:'boolean'},summary:str(240)
 },['format','version','commandId','baseSceneHash','pieces']);
}
export const craftPlanDescription='原子执行带场景基线和来源版本的取材/加工计划；支持已确认区域、父片拆分、真实余料与组合。centerMM 是页面毫米中心；sourceRevision 从素材表读取。consume 必须列出父片，子片用 parentId 关联；keepRemainders 默认 true，余料放入备选。任何错误回滚整个计划；同 commandId 重放不重复物料。不是要求工艺数量，whole 可以是正确选择。';
