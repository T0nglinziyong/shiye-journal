import {creationCommonDefinitions,creationOperationSpecs} from './creation-command-spec.js';
const definitions=structuredClone(creationCommonDefinitions);
for(const entry of creationOperationSpecs)definitions['Op_'+entry.name.replaceAll('.','_')]=entry.schema;
definitions.Operation={oneOf:creationOperationSpecs.map(entry=>({$ref:'#/$defs/Op_'+entry.name.replaceAll('.','_')}))};
export const creationV2RuntimeSchema={
 $schema:'https://json-schema.org/draft/2020-12/schema',title:'ShiYe unified executable commands',
 type:'object',additionalProperties:false,required:['protocolVersion','transactionId','baseSceneRevision','operations'],
 properties:{protocolVersion:{const:2},transactionId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'},baseSceneRevision:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'},operations:{type:'array',minItems:1,maxItems:200,items:{$ref:'#/$defs/Operation'}}},$defs:definitions
};
export const creationCommandRegistry=Object.freeze(Object.fromEntries(creationOperationSpecs.map(entry=>[entry.name,{...entry,protocolVersion:2,available:true}])));
const topics={outline:'Outline',gradient:'Gradient',relation:'Relation',path:'TapePath',caps:'TapeCaps',place:'Place',size:'Size',style:'Style',region:'Region',order:'Order',layoutBox:'LayoutBox',edge:'Edge',geometry:'GraphicGeometry',texture:'TapeTexture'};
const notes={outline:'文字/图形描边：widthMm 是物理宽度；offsetMm=[0,0] 完整描边，非零偏移形成离体轮廓；null 清除；图形不更改原始几何。',gradient:'文字/图形/笔迹的原生渐变：angleDeg=0 横向、90 纵向；stops 的 offset 严格递增并从 0 到 1；null 清除。不是重复对象叠色；图形有填充时作用于 fill，否则作用于 stroke；path 局部显式颜色优先。',relation:'探出、垫底、搭桥分别使用专用参数；不会改变素材尺寸。',path:'局部毫米折线 points=[[x,y],…]；用 place 整体摆放。',caps:'胶带两端分别选择 square/angled/torn；depthMm 控制切口深度。',place:'at 从 reference 左上角计量，但默认把对象中心放到该坐标；按左上角排版请显式 anchor=top-left。page.right 的坐标相对右页，TASK.page.regions 的坐标相对整幅 page，不要混用。毫米/比例与相对锚点共用；at+unit 和 referenceAnchor 二选一。node:<id> 引用对象，parent 引用父组。创建省略角度为参考旋转空间的 0°；更新省略角度保持当前世界朝向；linked 固化旋转偏移。',size:'毫米或参考比例；behavior=linked 可持续跟随参考尺寸，必须 unit=ratio。文字宽度控制换行，高度是保留的最小高度；图形缺省一维保持比例；笔迹缺省尺寸使用实际点集；指定单维保持几何比例；横/竖直线的零跨度轴保留笔宽，不能拉伸成新几何；笔宽由 strokeWidthMm 独立控制；实体材料不能缩放。',style:'按节点类型验证；同名字段在创建与更新中具有相同语义。字号、曲率、行距改变后统一测量。',region:'source 为原素材，local 为当前裁片/数字对象；毫米/比例明确。rect/ellipse/polygon/path/geometry/edge/halfPlane 共用区域。cut keep/remove 改实体，mask replace/intersect/subtract/clear 只改显示。',order:'新增节点默认放在同级最前方，按命令顺序叠放，不按素材/文字/图形类型分层；修改保留原层序。显式 before/after 或 edge=front/back 只调整同级顺序。',layoutBox:'组合稳定局部框；修改不会缩放实体子节点。',edge:'实体边缘加工；torn 需要固定 seed。',geometry:'graphic.add 与 layer.update 共用：预设 kind 如 star/ellipse；sketch 直接画可编辑手绘线形（loop/underline/corner/scallop/trail/rays，可固定 seed）；path 提供 paths+viewBox；stroke 提供局部毫米 points，保留 pressure。图形与笔迹统一使用 style.stroke/strokeWidthMm，填充用 fill。不包含用途或点缀类型。',texture:'胶带 sample/repeat/stretch；重复需要合法原图取样区间。'};
export function selfContainedCreationSchema(schema){
 const defs={},seen=new Set();
 const visit=value=>{if(!value||typeof value!=='object')return;
  if(value.$ref?.startsWith('#/$defs/')){const key=value.$ref.slice(8).split('/')[0];if(!seen.has(key)){seen.add(key);defs[key]=definitions[key];visit(defs[key]);}}
  Object.values(value).forEach(visit);
 };
 visit(schema);return {$schema:creationV2RuntimeSchema.$schema,...structuredClone(schema),$defs:structuredClone(defs)};
}
// Default discovery is deliberately shallow. Recursive Operation definitions
// are only expanded by --full, never when the agent just asks how to compose.
function briefField(schema){
 if(schema.allOf){const {allOf,...base}=schema,ref=allOf.find(part=>part.$ref);return {...(ref?briefField(ref):{}),...briefField(base),constraints:allOf.filter(part=>part!==ref).map(briefField)};}
 if(schema.if)return {if:briefField(schema.if),...(schema.then?{then:briefField(schema.then)}:{}),...(schema.else?{else:briefField(schema.else)}:{})};
 if(schema.not)return {not:briefField(schema.not)};
 if(schema.$ref){
  const type=schema.$ref.split('/').at(-1),topic=Object.entries(topics).find(([,v])=>v===type)?.[0];
  // Type-specific paint/text fields are small and needed on nearly every
  // creation. Show their exact names without expanding recursive Commands.
  if(type.startsWith('Style_')&&definitions[type])return {...briefField(definitions[type]),type};
  return {type,...(type==='Place'?{positioning:'at 从参考框左上角计量，定位对象中心；左上角定位须写 anchor: top-left；page.right 相对右页。'}:{}),...(topic?{help:'describe '+topic}:{detail:'当前操作的 --full 定义'})};
 }
 if(schema.oneOf||schema.anyOf)return {variants:(schema.oneOf||schema.anyOf).map(briefField)};
 if(schema.const!==undefined)return {const:schema.const};
 if(schema.enum)return {enum:schema.enum,...(schema.default===undefined?{}:{default:schema.default})};
 if(schema.type==='array')return {type:'array',items:schema.items?.$ref?.endsWith('/Operation')?'Command':briefField(schema.items||{}),minItems:schema.minItems,maxItems:schema.maxItems};
 if(schema.type==='object'||schema.properties||schema.required)return {type:'object',required:schema.required||[],fields:Object.fromEntries(Object.entries(schema.properties||{}).map(([key,value])=>[key,briefField(value)]))};
 return Object.fromEntries(Object.entries(schema).filter(([key])=>['type','minimum','maximum','exclusiveMinimum','minLength','maxLength','default','description'].includes(key)));
}
export function describeCreationCommand(name,{full=false}={}){
 const entry=creationCommandRegistry[name],topic=topics[name];
 if(!entry&&!topic)throw Object.assign(Error('未知命令或公共参数：'+name),{code:'UNKNOWN_HELP_TOPIC'});
 const schema=topic?definitions[topic]:entry.schema;
 const result={name,protocolVersion:2,available:true,summary:topic?notes[name]:entry.summary,required:(schema.required||[]).filter(key=>key!=='op')};
 if(full)return {...result,schema:selfContainedCreationSchema(schema),examples:entry?.examples||[],notes:entry?.notes||[]};
 return {...result,parameters:Object.fromEntries(Object.entries(schema.properties||{}).filter(([key])=>key!=='op').map(([key,value])=>[key,briefField(value)])),...((schema.oneOf||schema.anyOf)?{variants:(schema.oneOf||schema.anyOf).map(briefField)}:{}),...(entry?{examples:entry.examples.slice(0,name==='graphic.add'?3:1),notes:entry.notes}:{}),fullHelp:'describe '+name+' --full'};
}
export const creationHelpTopics=Object.freeze(Object.keys(topics));
export function creationRecipes(){return ['# 统一 Command 配方',
 '第一轮填写 work/commands.json；下一轮先 begin work/next.json。只填写 operations，事务标识由运行时生成。这里的例子是局部操作，不是整份任务。',
 '默认 describe <op> 只给必要参数和例子；完整 Schema 按需 describe <op> --full。所有操作共享一个注册表，不存在 native.* 或旧参数别名。',
 ...creationOperationSpecs.flatMap(entry=>['## '+entry.name,entry.summary,'```json\n'+JSON.stringify(entry.examples[0],null,2)+'\n```',...entry.notes])].join('\n\n')+'\n';}
