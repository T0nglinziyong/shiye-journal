import candidateSchema from '../creation-contract/static/api/commands.schema.json' with {type:'json'};
import candidateOperations from '../creation-contract/static/api/operations.json' with {type:'json'};
import {commandsSchema,executableCommandNames} from './v3-commands.js';

// A single public protocol. Native operations share the same Scene reducer;
// there is no legacy public transaction parser or parallel rendering model.
const nativePrefix='native.';
export const nativeCreationCommandNames=Object.freeze(executableCommandNames.map(name=>nativePrefix+name));
function adaptReferences(value){
 if(Array.isArray(value))return value.map(adaptReferences);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,key==='$ref'&&typeof entry==='string'?entry.replace('#/$defs/','#/$defs/native/$defs/'):adaptReferences(entry)]));
 return value;
}
export const creationV2RuntimeSchema=(()=>{
 const schema=structuredClone(candidateSchema);delete schema.$id;
 schema.title='ShiYe creation commands protocol 2';
 schema.$defs.Place.properties.referenceBounds.enum=['layout'];
 schema.$defs.Place.properties.targetBounds.enum=['layout'];
 schema.$defs.Reference.pattern='^(page|page\\.left|page\\.right|parent|node:[A-Za-z][A-Za-z0-9._-]*)$';
 schema.$defs.LayoutRule.properties.behavior={const:'once',default:'once'};
 schema.$defs.Size.properties.aspect.default='free';
 schema.$defs.Op_material_decision.properties.reason={type:'string',minLength:8,maxLength:240};
 const update=schema.$defs.Op_page_update;
 delete update.properties.physicalSizeMm;delete update.properties.mode;
 update.required=['op','paperColor'];delete update.anyOf;
 const fields={material:['opacity','blendMode','shadow'],text:['opacity','blendMode','shadow','color','fontSizePt','fontFamily','fontWeight','textAlign','letterSpacingMm','lineHeight'],shape:['opacity','blendMode','shadow','fill','stroke','strokeWidthMm'],ink:['opacity','blendMode','shadow','color','strokeWidthMm','penStyle']};
 for(const [kind,names] of Object.entries(fields))schema.$defs['Style_'+kind]={...structuredClone(schema.$defs.Style),properties:Object.fromEntries(names.map(name=>[name,schema.$defs.Style.properties[name]]))};
 for(const [op,kind] of Object.entries({'material.add':'material','material.tape':'material','text.add':'text','text.update':'text','shape.add':'shape','vector.add':'shape','ink.add':'ink','group.create':'material','group.compose':'material'}))schema.$defs['Op_'+op.replaceAll('.','_')].properties.style={$ref:'#/$defs/Style_'+kind};
 schema.$defs.native={$defs:adaptReferences(commandsSchema.$defs)};
 for(const original of commandsSchema.properties.operations.items.oneOf){
  const name=original.properties.op.const,adapted=adaptReferences(original);
  adapted.properties.op={const:nativePrefix+name};
  if(name==='material.decision')adapted.properties.reason=structuredClone(schema.$defs.Op_material_decision.properties.reason);
  const key='Native_'+name.replaceAll('.','_');schema.$defs[key]=adapted;
  schema.$defs.Operation.oneOf.push({$ref:'#/$defs/'+key});
 }
 return schema;
})();
export const creationCommandRegistry=Object.freeze(Object.fromEntries(creationV2RuntimeSchema.$defs.Operation.oneOf.map(entry=>{
 const key=entry.$ref.slice('#/$defs/'.length),schema=creationV2RuntimeSchema.$defs[key],name=schema.properties.op.const;
 const candidate=candidateOperations.operations.find(row=>row.name===name);
 const summary=name==='page.update'?'修改纸张颜色；任务固定纸张模式与尺寸。':candidate?.summary||'原生 Scene 操作：'+name.slice(nativePrefix.length);
 return [name,{name,protocolVersion:2,available:true,advanced:name.startsWith(nativePrefix),summary,schema,examples:candidate?.examples||[]}];
})));
const topics={place:'Place',size:'Size',style:'Style',region:'Region',order:'Order',layoutBox:'LayoutBox'};
const notes={
 place:'at+unit 与 referenceAnchor 二选一。reference 为 page/page.left/page.right/parent/node:<id>。默认 anchor=center、axes=reference、rotationSpace=parent。linked 在绑定时固定角度偏移，后续求解不累积旋转。',
 size:'mm 为物理毫米；ratio 必须给 reference。省略一维保持原比例；两维都给出时默认 free，显式 preserve 时必须与原比例一致。实体素材禁止通过 size 缩放。',
 style:'公共样式不表示每种节点都支持全部字段；创建命令 Schema 按节点类型收紧。更新时按真实节点类型验证。',
 region:'source 是原素材坐标，local 是当前裁片坐标。支持 mm/ratio、rect/ellipse/polygon/path。显示遮罩不释放实体材料占用。',
 order:'before/after 只能引用同级节点。edge=front/back 控制同级绘制顺序。',
 layoutBox:'稳定的组内布局框，单位 mm；按 parent 比例摆放时用它，不以子节点位置反推尺寸。'
};
export function selfContainedCreationSchema(schema){
 const defs={},seen=new Set();
 const visit=value=>{
  if(!value||typeof value!=='object')return;
  if(typeof value.$ref==='string'&&value.$ref.startsWith('#/$defs/')){
   const key=value.$ref.slice('#/$defs/'.length).split('/')[0];
   if(!seen.has(key)){seen.add(key);defs[key]=creationV2RuntimeSchema.$defs[key];visit(defs[key]);}
  }
  Object.values(value).forEach(visit);
 };
 visit(schema);return {$schema:creationV2RuntimeSchema.$schema,...structuredClone(schema),$defs:structuredClone(defs)};
}
export function describeCreationCommand(name){
 if(topics[name])return {name,protocolVersion:2,available:true,summary:notes[name],schema:selfContainedCreationSchema(creationV2RuntimeSchema.$defs[topics[name]])};
 const entry=creationCommandRegistry[name];
 if(!entry)throw Object.assign(Error('未知命令或公共参数：'+name),{code:'UNKNOWN_HELP_TOPIC'});
 return {...entry,required:(entry.schema.required||[]).filter(key=>key!=='op'),schema:selfContainedCreationSchema(entry.schema)};
}
export const creationHelpTopics=Object.freeze(Object.keys(topics));
export function creationRecipes(){
 return ['# 统一 Command 配方（固定内容）',
  '第一轮编辑 work/commands.json；后续运行 begin work/<新文件名>.json。保留自动生成的 transactionId/baseSceneRevision，只把下面操作填入 operations。示例不是完整作品，不绑定真实任务或初始 revision。素材别名以 TASK 为准。',
  '参数按需查询：describe place / size / style / region / order / layoutBox；某个操作用 describe <op>。首次创建、局部调整都使用相同公共参数。',
  ...Object.values(creationCommandRegistry).filter(row=>!row.advanced).flatMap(row=>['## '+row.name,row.summary,...row.examples.map(example=>'```json\n'+JSON.stringify(example,null,2)+'\n```')]),
  '物理尺寸固定；layout.arrange 当前是 once，持续跟随用 place.behavior=linked。visible 轮廓锚点未提供。native.* 是同一协议内的完整 Scene 加工能力，不接受协议 1 事务。'
 ].join('\n\n')+'\n';
}
