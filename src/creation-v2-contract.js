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
const topics={outline:'TextOutline',gradient:'TextGradient',relation:'Relation',path:'TapePath',caps:'TapeCaps',place:'Place',size:'Size',style:'Style',region:'Region',order:'Order',layoutBox:'LayoutBox',edge:'Edge',geometry:'GeometryUpdate',texture:'TapeTexture'};
const notes={outline:'原生文字描边：widthMm 是物理宽度；offsetMm=[0,0] 完整描边，非零偏移形成离体轮廓；null 清除。',gradient:'原生文字填充渐变：angleDeg=0 横向、90 纵向；stops 的 offset 严格递增并从 0 到 1；null 清除。不是重复文字叠色。',relation:'探出、垫底、搭桥分别使用专用参数；不会改变素材尺寸。',path:'局部毫米折线 points=[[x,y],…]；用 place 整体摆放。',caps:'胶带两端分别选择 square/angled/torn；depthMm 控制切口深度。',place:'毫米/比例与相对锚点共用；at+unit 和 referenceAnchor 二选一。node:<id> 引用对象，parent 引用父组。创建省略角度为参考旋转空间的 0°；更新省略角度保持当前世界朝向；linked 固化旋转偏移。',size:'毫米或参考比例。文字宽度控制换行，高度是保留的最小高度；图形缺省一维保持比例；实体材料不能缩放。',style:'按节点类型验证；同名字段在创建与更新中具有相同语义。字号、曲率、行距改变后统一测量。',region:'source 为原素材，local 为当前裁片；毫米/比例明确标注。遮罩不释放材料。',order:'只在同级调整 before/after 或 edge=front/back。',layoutBox:'组合稳定局部框；修改不会缩放实体子节点。',edge:'实体边缘加工；torn 需要固定 seed。',geometry:'替换数字节点的可编辑几何；与 layer.update 公共属性一起提交。',texture:'胶带 sample/repeat/stretch；重复需要合法原图取样区间。'};
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
 if(schema.$ref){const type=schema.$ref.split('/').at(-1),topic=Object.entries(topics).find(([,v])=>v===type)?.[0];return {type,...(topic?{help:'describe '+topic}:{detail:'当前操作的 --full 定义'})};}
 if(schema.oneOf||schema.anyOf)return {variants:(schema.oneOf||schema.anyOf).map(briefField)};
 if(schema.const!==undefined)return {const:schema.const};
 if(schema.enum)return {enum:schema.enum,...(schema.default===undefined?{}:{default:schema.default})};
 if(schema.type==='array')return {type:'array',items:schema.items?.$ref?.endsWith('/Operation')?'Command':briefField(schema.items||{}),minItems:schema.minItems,maxItems:schema.maxItems};
 if(schema.type==='object')return {type:'object',required:schema.required||[],fields:Object.fromEntries(Object.entries(schema.properties||{}).map(([key,value])=>[key,briefField(value)]))};
 return Object.fromEntries(Object.entries(schema).filter(([key])=>['type','minimum','maximum','exclusiveMinimum','minLength','maxLength','default','description'].includes(key)));
}
export function describeCreationCommand(name,{full=false}={}){
 const entry=creationCommandRegistry[name],topic=topics[name];
 if(!entry&&!topic)throw Object.assign(Error('未知命令或公共参数：'+name),{code:'UNKNOWN_HELP_TOPIC'});
 const schema=topic?definitions[topic]:entry.schema;
 const result={name,protocolVersion:2,available:true,summary:topic?notes[name]:entry.summary,required:(schema.required||[]).filter(key=>key!=='op')};
 if(full)return {...result,schema:selfContainedCreationSchema(schema),examples:entry?.examples||[],notes:entry?.notes||[]};
 return {...result,parameters:Object.fromEntries(Object.entries(schema.properties||{}).filter(([key])=>key!=='op').map(([key,value])=>[key,briefField(value)])),...((schema.oneOf||schema.anyOf)?{variants:(schema.oneOf||schema.anyOf).map(briefField)}:{}),...(entry?{examples:entry.examples.slice(0,1),notes:entry.notes}:{}),fullHelp:'describe '+name+' --full'};
}
export const creationHelpTopics=Object.freeze(Object.keys(topics));
export function creationRecipes(){return ['# 统一 Command 配方',
 '第一轮填写 work/commands.json；下一轮先 begin work/next.json。只填写 operations，事务标识由运行时生成。这里的例子是局部操作，不是整份任务。',
 '默认 describe <op> 只给必要参数和例子；完整 Schema 按需 describe <op> --full。所有操作共享一个注册表，不存在 native.* 或旧参数别名。',
 ...creationOperationSpecs.flatMap(entry=>['## '+entry.name,entry.summary,'```json\n'+JSON.stringify(entry.examples[0],null,2)+'\n```',...entry.notes])].join('\n\n')+'\n';}
