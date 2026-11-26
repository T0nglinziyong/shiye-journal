import {uniformOpacitySchema,assertUniformOpacity,resetPaperSurfaceOpacity} from './opacity-contract.mjs';
import {withoutShadowSchema,assertNoShadowInput} from './shadow-policy.mjs';
import Ajv2020 from 'ajv/dist/2020.js';
// Model-facing object language. Lower into the existing atomic Scene reducer;
// editor/CLI operations remain implementation primitives, never extra model tools.
import {creationOperationSpecs,creationCommonDefinitions} from '../../src/creation-command-spec.js';
import {sceneScale} from '../../src/creation-scene-core.js';
import {canvasCapabilityRegistry,canvasCommonFields,canvasKindOfNode} from './canvas-capabilities.mjs';
import {techniqueCatalog,describeTechnique} from '../library/techniques.js';
import {publicRecipeDescription} from './recipe-contract.mjs';
const specs=Object.fromEntries(creationOperationSpecs.map(s=>[s.name,s]));
const clone=x=>structuredClone(x);
const fields=name=>{const p=clone(specs[name].schema.properties);delete p.op;return p;};
const ref=name=>({$ref:'#/$defs/'+name});
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const variant=(name,op,extra={})=>{const s=clone(specs[name].schema);s.properties.op={const:op};Object.assign(s.properties,extra);return s;};
const commonCreate=fields('text.add');
const createCommon={...Object.fromEntries(['id','parent','place','size','style','order'].map(key=>[key,commonCreate[key]])),name:fields('layer.update').name};
const creates=Object.entries(canvasCapabilityRegistry).filter(([kind])=>!['group','page'].includes(kind)).map(([kind,capability])=>object({op:{const:'create'},kind:{const:kind},...createCommon,style:capability.createStyle,props:capability.createProps},
 ['op','kind','id',...(kind==='paper'?[]:['props']),...(kind==='text'||kind==='paper'||kind==='graphic'?['size']:[]),...(kind==='paper'?['style']:[])]));
const update=object({op:{const:'update'},target:ref('Id'),parent:{anyOf:[ref('Id'),{type:'null'}]},...canvasCommonFields.update,
 props:{type:'object',description:'只写此对象能力中的专属变化；按 target 的真实对象类型校验。',additionalProperties:true}},['op','target']);
const page=object({op:{const:'page'},target:{enum:['page','page.left','page.right']},props:canvasCapabilityRegistry.page.updateProps},['op','target','props']);
const group={oneOf:[variant('group.create','group'),variant('group.compose','group')]};
const recipe=object({op:{const:'recipe'},methodId:{type:'string',minLength:1,maxLength:80},params:{type:'object',maxProperties:24,additionalProperties:true}},['op','methodId','params']);
const shapeVariants=[
 variant('layer.cut','shape',{method:{const:'crop'}}),
 object({op:{const:'shape'},method:{const:'edge'},target:ref('Id'),edge:ref('Edge')},['op','method','target','edge']),
 variant('material.tear','shape',{method:{const:'edge'},technique:{const:'trajectory'}}),
 variant('layer.split','shape',{method:{const:'split'}}),
 variant('material.split','shape',{method:{const:'split'}}),
 variant('material.window','shape',{method:{const:'cutout'},cutoutKind:{const:'window'}}),
 variant('material.glyphKnockout','shape',{method:{const:'cutout'},cutoutKind:{const:'glyph'}})
];
for(const schema of shapeVariants)for(const field of ['method',...(schema.properties.technique?['technique']:[]),...(schema.properties.cutoutKind?['cutoutKind']:[])])if(!schema.required.includes(field))schema.required.push(field);
const shape={oneOf:shapeVariants};
export const canvasOperations=[
 {name:'create',summary:'统一创建对象。id/place/size/style/order 是公共字段；位置和尺寸默认毫米，字体大小用 style.fontSizePt（磅）。文字内容、图形几何、纸张纹理及素材来源放在对应 kind 的 props 中。省略 place 进入待放区。短标题可用 props.effect/backdrop/runs，正文通常只需 props.content。',parameters:{oneOf:creates},example:{op:'create',kind:'text',id:'note',props:{content:'今天出门',effect:'outline'},size:{width:70},style:{fontSizePt:24,color:'#354C60'}}},
 {name:'update',summary:'局部修改已有对象：place/size/style/order 为公共字段，专属属性放 props，文字衬带也写 props.backdrop。只写需要改的值；未写字段保留。size 可修改数字文字、纸张和图形；实体素材及多成员组合保持原物理尺寸。parent 可改变组合归属；只改位置、旋转或层序时也用 update，背景改色使用 page。',parameters:update,example:{op:'update',target:'note',props:{content:'今天出门！',backdrop:{kind:'band',color:'#E9C16F',paddingMm:2}},style:{color:'#9F4E39'}}},
 {name:'page',summary:'设置页面本身的底色或纸型，不创建大纸张。双页可分别指定 page.left 和 page.right 的 props.color；纸型 pattern/rulingMm 与中缝 centerGutter 作用于整张 page。左右页附带默认 pattern:"plain" 时视为无须修改纸型。',parameters:page,example:{op:'page',target:'page.right',props:{color:'#D8E5EB'}}},
 {name:'copy',summary:'复制对象；真实素材须用 materialMap 指向合法新来源。未给 place 的新副本进入待放区。',parameters:variant('layer.duplicate','copy'),example:{op:'copy',target:'note',id:'note2'}},
 {name:'delete',summary:'删除对象；暂不用的实体素材优先 update.place.surface=tray。',parameters:variant('layer.delete','delete'),example:{op:'delete',target:'note2'}},
 {name:'group',summary:'targets 组合已有对象且保留原位；children 在组合内创建对象（同一套操作）。两种方式选一。',parameters:group,example:{op:'group',id:'cluster',targets:['note','paper']}},
 {name:'ungroup',summary:'解组。pieces 每项 id/place/order，可单独摆放；未指定的部分保留原位与层序。',parameters:variant('group.ungroup','ungroup'),example:{op:'ungroup',target:'cluster',pieces:[{id:'note',place:{reference:'page',at:[30,40],unit:'mm'}}]}},
 {name:'shape',summary:'统一加工对象轮廓：method=crop 保留/去除 region；edge 加工指定边（edge）或实体素材轨迹撕裂（technique=trajectory,path）；split 一分为二或多片，各片可单独摆放；cutout 给实体素材开窗（cutoutKind=window）或字形镂空（cutoutKind=glyph）。先 create 再 shape，同批按顺序执行；已有片段未指定摆放保留原位。',parameters:shape,examples:[{op:'shape',method:'crop',target:'paper',mode:'keep',region:{shape:'rect',space:'local',unit:'ratio',box:[.1,.1,.8,.8],rotationDeg:10}},{op:'shape',method:'edge',target:'paper',edge:{style:'torn',edges:['bottom']}},{op:'shape',method:'split',target:'paper',split:{through:[.5,.5],unit:'ratio',rotationDeg:25,edge:{style:'torn'}},pieces:[{id:'a'},{id:'b',place:{reference:'page',at:[90,120],unit:'mm'}}]}]},
 {name:'recipe',summary:'在同一原子事务中展开复合创作技巧；methodId 选固定能力目录中的方法，params 填该方法参数。可与 create/update/shape 按顺序组合；运行时先编译所有配方，再统一校验整批命令。',parameters:recipe,example:{op:'recipe',methodId:'graphic-loop',params:{id:'loop-a',place:{reference:'page',at:[40,60]},size:{width:32,height:32,unit:'mm'}}}}
];
for(const entry of canvasOperations)entry.parameters=uniformOpacitySchema(withoutShadowSchema(entry.parameters));
canvasOperations[0].examples=[
 {op:'create',kind:'paper',id:'paper-a',props:{texture:'medium',pattern:'plain'},size:{width:65,height:90},style:{fill:'#E9DDD0'},place:{reference:'page',at:[55,85]}},
 {op:'create',kind:'text',id:'heading-a',props:{content:'今日记录',effect:'offset-outline',accentColor:'#D2894D',backdrop:{kind:'band',color:'#E9C16F',paddingMm:2}},size:{width:54,unit:'mm'},style:{fontSizePt:25,color:'#354C60'},place:{reference:'page',at:[55,31],unit:'mm'}},
 {op:'create',kind:'graphic',id:'accent-a',props:{geometry:{kind:'star',options:{points:5}}},size:{width:5,height:5,unit:'mm'},style:{fill:'#D2894D'},place:{reference:'node:paper-a',referenceAnchor:'top-right',anchor:'center',offset:{value:[0,0],unit:'mm'}}}
];
const modelDefinitions=uniformOpacitySchema(withoutShadowSchema(creationCommonDefinitions));
// The agent writes page geometry in mm by default. Keep explicit ratio for
// relative placement and source-local crop geometry, but never make the common
// mm unit a repetitive required argument.
modelDefinitions.Place.required=[];
modelDefinitions.Place.oneOf[0].required=['at'];
modelDefinitions.Size.required=[];
modelDefinitions.Offset.required=['value'];
// The model may omit the procedural random seed; normalizeCanvasUnits adds a
// deterministic value before the strict engine contract is checked.
delete modelDefinitions.Edge.allOf;
export const canvasOperationNames=canvasOperations.map(s=>s.name);
function stableEdgeSeed(value){let hash=2166136261;for(const character of value){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0)&2147483647;}
function normalizeCanvasUnits(operations){
 for(const [index,operation] of (operations||[]).entries()){
  const applyPlace=place=>{
   if(!place||typeof place!=='object')return;
   if(Array.isArray(place.at)){place.reference??='page';place.unit??='mm';}
   if(place.offset?.value)place.offset.unit??='mm';
  };
  applyPlace(operation?.place);
  if(operation?.size&&(operation.size.width!==undefined||operation.size.height!==undefined)&&operation.size.behavior!=='linked')operation.size.unit??='mm';
  // The edge shape is chosen by the agent; its random seed can be stable by default.
  for(const edge of [operation?.edge,operation?.split?.edge])if(edge?.style==='torn'&&edge.seed===undefined)
   edge.seed=stableEdgeSeed(JSON.stringify([operation.op,operation.method,operation.target||operation.id||index,edge.style,edge.edges||null]));
  for(const piece of operation?.pieces||[])applyPlace(piece.place);
  normalizeCanvasUnits(operation?.children);
 }
}
export function canvasOperationToolSchema(){
 const createKinds=Object.keys(canvasCapabilityRegistry).filter(kind=>!['group','page'].includes(kind));
 const allFields={};for(const operation of canvasOperations)for(const variant of operation.parameters.oneOf||[operation.parameters])for(const [name,schema] of Object.entries(variant.properties||{}))if(!['op','kind','props'].includes(name)&&!allFields[name])allFields[name]={...(schema.type?{type:schema.type}:{}),...(schema.description?{description:schema.description}:{})};
 return {type:'object',additionalProperties:false,required:['op'],properties:{
  ...allFields,
  op:{type:'string',enum:canvasOperationNames},
  kind:{type:'string',enum:createKinds,description:'仅 create 使用；专属字段放 props。'},
  id:{type:'string',description:'新对象编号。'},target:{type:'string',description:'已有对象编号；page 操作可为 page/page.left/page.right。'},
  parent:{type:['string','null']},place:{type:'object',description:'公共摆放：reference、at、rotationDeg、anchor、offset。at 是目标锚点的坐标，anchor 省略时为对象中心，不是左上角；要指定对象左上角坐标，写 anchor:top-left。坐标和偏移默认 mm。双页 page.left/page.right 的 at 各从对应单页左上角重新起算；例如右页向内 20mm 写 reference:page.right,at:[20,40]，不要写整张双页的 x。'},
  size:{type:'object',description:'数字文字、纸张、图形的尺寸：width/height 默认 mm，可省略 unit；仅相对比例写 unit:ratio。实体素材和多成员组合不缩放。'},style:{type:'object',description:'公共外观：颜色、字体、描边、透明度等；字体大小为 fontSizePt，单位 pt。'},
  order:{type:'object',description:'公共同级图层顺序：before/after/edge。'},
  props:{type:'object',additionalProperties:true,description:'对象专属字段；按 kind 或 target 的真实类型校验。具体字段和必填条件见固定的 Agent Canvas Manual。'},
  params:{type:'object',additionalProperties:true,description:'仅 recipe 使用；采用统一 place/size/style/content 字段，勿写旧式 reference/at/widthMm；具体必填与可选字段见固定能力目录。'},
 }};
}
const validators=new Map();
const findNode=(document,id)=>{
 const visit=nodes=>{for(const node of nodes||[]){if([node.id,node.agentKey,node.creativePieceID,node.key].includes(id))return node;const child=visit(node.children);if(child)return child;}return null;};
 return visit(document?.page?.layers);
};
const schemaCheck=(key,schema,value)=>{
 if(!validators.has(key))validators.set(key,new Ajv2020({strict:false,allErrors:true}).compile({...schema,$defs:{...modelDefinitions,Operation:{type:'object'}}}));
 const validate=validators.get(key);
 if(!validate(value))throw Error(key+' 参数不符合合同：'+JSON.stringify(validate.errors.filter(e=>!['if','oneOf','anyOf'].includes(e.keyword)).slice(0,3)));
};
export function validateCanvasOperations(operations,{document}={}){
 assertNoShadowInput(operations);
 assertUniformOpacity(operations);
 if(!Array.isArray(operations)||!operations.length)throw Error('operations 必须是非空数组');
 normalizeCanvasUnits(operations);
 for(const [i,operation] of operations.entries()){
  // Notes are model commentary, not a drawing parameter. Keep the strict
  // schema for all other unknown fields.
  if(typeof operation?.op_note==='string')delete operation.op_note;
  // A local offset from a named node without an explicit reference anchor
  // naturally aligns the same anchor on both objects.
  if(operation?.place?.reference?.startsWith('node:')&&operation.place.offset&&!operation.place.at&&!operation.place.referenceAnchor){
   operation.place.referenceAnchor=operation.place.anchor||'center';
  }
  // An explicit point fully specifies the reference position. Models may
  // repeat a previous referenceAnchor while moving an object by coordinates.
  if(Array.isArray(operation?.place?.at)&&operation.place.referenceAnchor!==undefined)delete operation.place.referenceAnchor;
  const entry=canvasOperations.find(s=>s.name===operation?.op);if(!entry)throw Error('未知画布操作 '+operation?.op+'；仅支持 '+canvasOperationNames.join('/'));
  if(entry.name==='create'&&!entry.parameters.oneOf.some(v=>v.properties.kind.const===operation.kind))throw Error('operations['+i+'] create.kind 只能是 material/text/paper/graphic/tape；收到 '+String(operation.kind)+'。没有占位对象类型；暂不放入的素材直接留在待放区。');
  const key=entry.name+':'+(operation.kind||operation.method||(operation.split?'line':operation.children?'children':'default'));
  let schema=entry.parameters;
  if(schema.oneOf){const choice=schema.oneOf.find(v=>entry.name==='create'?v.properties.kind.const===operation.kind:entry.name==='shape'?v.properties.method?.const===operation.method&&Boolean(v.properties.split)===Boolean(operation.split)&&Boolean(v.properties.path)===Boolean(operation.path)&&(!v.properties.cutoutKind||v.properties.cutoutKind.const===operation.cutoutKind):Boolean(v.properties.children)===Boolean(operation.children));if(choice)schema=choice;}
  schemaCheck('operations['+i+'] '+key+':variant'+(entry.parameters.oneOf?.indexOf(schema)??0),schema,operation);
  if(entry.name==='update'&&operation.props){
   const prior=operations.slice(0,i).findLast(item=>item.op==='create'&&item.id===operation.target);
   const kind=prior?.kind||canvasKindOfNode(findNode(document,operation.target));
   if(kind)schemaCheck('operations['+i+'] '+kind+'.props',canvasCapabilityRegistry[kind].updateProps,operation.props);
   else {
    const known=new Set(Object.values(canvasCapabilityRegistry).flatMap(cap=>Object.keys(cap.updateProps.properties||{})));
    for(const field of Object.keys(operation.props))if(!known.has(field))throw Error('operations['+i+'] 未知 props 字段 '+field);
   }
  }
  if(entry.name==='update'&&operation.size){
   const prior=operations.slice(0,i).findLast(item=>item.op==='create'&&item.id===operation.target);
   const kind=prior?.kind||canvasKindOfNode(findNode(document,operation.target));
   if(['material','tape','group'].includes(kind))throw Error('operations['+i+'] '+kind+' 不支持 update.size；实体素材保持原物理尺寸，多成员组合请分别调整成员。单图形技巧创建的是 graphic，可直接修改 size。');
  }
  if(entry.name==='page'&&operation.target!=='page'){
   const invalid=Object.keys(operation.props||{}).filter(key=>!['color','pattern'].includes(key)||key==='pattern'&&operation.props.pattern!=='plain');
   if(invalid.length)throw Error('operations['+i+'] '+operation.target+' 只支持独立设置 color；默认 pattern:"plain" 可省略，纸型与中缝请对整张 page 设置：'+invalid.join('、'));
   if(operation.props?.pattern==='plain'&&document?.page?.paperPattern&&document.page.paperPattern!=='plain')
    throw Error('operations['+i+'] 当前整张纸型不是 plain，左右页不能单独改纸型；请先对 page 设置 pattern');
  }
  if(operation.children)validateCanvasOperations(operation.children,{document});
 }
}
export function lowerCanvasOperations(operations,{document,compileRecipe}={}){
 const find=(nodes,id)=>(nodes||[]).flatMap(n=>[n,...(n.children?flatten(n.children):[])]).find(n=>n.id===id);
 const flatten=nodes=>nodes.flatMap(n=>[n,...flatten(n.children||[])]);
 if(!Array.isArray(operations))throw Error('operations 必须为数组');
 normalizeCanvasUnits(operations);
 return operations.flatMap((item,index)=>{
  const {op,kind,method,props,...p}=item;
  if(op==='create'){
   if(!['material','text','paper','graphic','tape'].includes(kind))throw Error('create.kind 只能是 material/text/paper/graphic/tape');
   const effectiveProps=kind==='text'?Object.fromEntries(Object.entries(props||{}).filter(([key,value])=>
    !(['effect','accentColor','layout','curveHeightMm','backdrop','runs','gapMm'].includes(key)&&
      (value===undefined||value===null||value===''||value==='none'||value==='plain'||Array.isArray(value)&&value.length===0)))):props;
   const decorated=kind==='text'&&['effect','accentColor','layout','curveHeightMm','backdrop','runs','gapMm'].some(k=>Object.hasOwn(effectiveProps||{},k));
   const {name,...common}=p;
   return [{op:decorated?'title.add':canvasCapabilityRegistry[kind].createCommand,...(decorated?{style:{fontSizePt:26,color:'#354C60'}}:{}),...common,...effectiveProps},...(name===undefined?[]:[{op:'layer.update',target:p.id,name}])];
  }
  if(op==='update'){
   const {parent,...common}=p,{fit,mask,relation,asset,...specific}=props||{},change={...common,...specific},commands=[];
   if(parent!==undefined)commands.push({op:'layer.reparent',target:p.target,parent});
   if(asset)commands.push({op:'material.replace',target:p.target,asset});
   if(relation)commands.push({op:'material.relate',target:p.target,relation});
   if(mask)commands.push({op:'layer.mask',target:p.target,...mask});
   if(fit){
    const node=find(document?.page.layers,p.target),scale=document?.page?sceneScale(document.page):null;
    const priorCreate=operations.slice(0,index).findLast(operation=>operation.op==='create'&&operation.kind==='text'&&operation.id===p.target);
    const size=change.size||{};
    const completeSize={...size};
    if(priorCreate&&(!completeSize.unit||completeSize.unit==='mm')){
     if(completeSize.width===undefined)completeSize.width=priorCreate.size?.width;
     if(completeSize.height===undefined)completeSize.height=priorCreate.size?.height;
     if(completeSize.height===undefined&&fit.maxLines<=2){
      const lineHeight=priorCreate.style?.lineHeight||1.4;
      completeSize.height=Math.ceil(fit.maxLines*fit.maxFontSizePt*25.4/72*lineHeight*1.15+2);
     }
     completeSize.unit??='mm';
    }
    if(node&&scale&&(!completeSize.unit||completeSize.unit==='mm')){
     if(completeSize.width===undefined)completeSize.width=node.width/scale;
     if(completeSize.height===undefined)completeSize.height=node.height/scale;
     completeSize.unit??='mm';
    }
    if(!(completeSize.width>0&&completeSize.height>0))throw Error('update.fit 需要可写区域的宽和高；已有文字可省略未改的一项，新建后同批适配请明确给出 size.width/height');
    if(change.content!==undefined)commands.push({op:'layer.update',target:p.target,content:change.content});
    const {content,...fitChange}=change;
    commands.push({op:'text.fit',...fitChange,size:completeSize,fit});
   }
   else if(Object.keys(change).some(k=>k!=='target'))commands.push({op:'layer.update',...resetPaperSurfaceOpacity(change,findNode(document,p.target))});
   if(!commands.length)throw Error('update 至少指定一个需要修改的字段');
   return commands;
  }
  if(op==='page')return [{op:'page.update',page:p.target,...(props?.color?{paperColor:props.color}:{}),...(props?.pattern&&p.target==='page'?{paperPattern:props.pattern}:{}),...(props?.rulingMm!==undefined?{rulingMm:props.rulingMm}:{}),...(props?.centerGutter!==undefined?{centerGutter:props.centerGutter}:{})}];
  if(op==='group')return [{op:p.children?'group.compose':'group.create',...p,...(p.children?{children:lowerCanvasOperations(p.children,{document,compileRecipe})}:{})}];
  if(op==='recipe'){
   if(typeof compileRecipe!=='function')throw Error('recipe 需要由创作运行时先编译，再提交整批事务');
   return compileRecipe({methodId:p.methodId,params:p.params});
  }
  if(op==='shape'){
   const {technique,cutoutKind,...shapeArgs}=p;
   if(method==='crop')return [{op:'layer.cut',...shapeArgs}];
   if(method==='edge')return [{op:technique==='trajectory'?'material.tear':'layer.update',...shapeArgs}];
   if(method==='split')return [{op:p.split?'layer.split':'material.split',...shapeArgs}];
   if(method==='cutout')return [{op:cutoutKind==='window'?'material.window':'material.glyphKnockout',...shapeArgs}];
  }
  const direct={copy:'layer.duplicate',delete:'layer.delete',ungroup:'group.ungroup'};
  if(direct[op])return [{op:direct[op],...p}];
  throw Error('未知画布操作 '+op+'；使用 '+canvasOperationNames.join('/'));
 });
}
export function canvasGuide(){
 const definitions=clone(modelDefinitions);
 const share=(schema,base)=>{for(const [key,value] of Object.entries(schema.properties||{}))if(JSON.stringify(value)===JSON.stringify(definitions[base]?.properties?.[key]))schema.properties[key]={$ref:'#/$defs/'+base+'/properties/'+key};};
 for(const [name,schema] of Object.entries(definitions)){
  if(name.startsWith('Style_')||name==='StyleUpdate'||name==='TitleStyle')share(schema,'Style');
  if(name==='PlaceUpdate')share(schema,'Place');if(name==='SizeUpdate')share(schema,'Size');
 }
 for(const variant of definitions.GraphicGeometry.oneOf||[])for(const conditional of variant.allOf||[]){const options=conditional.then?.properties?.options;if(options)share(options,'ShapeOptions');}
 definitions.Operation={description:'children 递归使用本说明中的画布操作。'};
 // Keep only transitively referenced definitions; do not ship unused engine APIs.
 const used=new Set();const visit=x=>{if(!x||typeof x!=='object')return;if(x.$ref){const n=x.$ref.split('/')[2];if(!used.has(n)){used.add(n);visit(definitions[n]);}}for(const v of Object.values(x))if(typeof v==='object')Array.isArray(v)?v.forEach(visit):visit(v);};
 canvasOperations.forEach(visit);
 return {conventions:{paperEdges:'纸张自身轻微不规则边缘用 style.paperSurface:{kind:"torn"}，创建和修改共用；它不是明显撕口。明显撕边属于轮廓加工：先 create(kind=paper)，再 shape(method=edge,target=纸张ID,edge={style:"torn",edges:["bottom"]})；同一 operations 批次按顺序执行，无需多等一轮。切成两片用 shape(method=split)，切口参数仍叫 edge，两片分别摆放。清除加工边用 shape(method=edge,edge={style:"clean"})，保留纸张自身质感。',opacity:'所有对象统一 style.opacity，0 完全透明、1 完全不透明；创建与修改相同，未写保留原值。硫酸纸与透明胶带均通过此字段表达透光，文字保持独立。',shadows:'普通画布对象不提供阴影；文字效果定义中若出现 shadow，指文字专用的硬边字效，不是纸张或素材投影。纸层关系主要用露边、纹理与透明度表现。',create:'新建无 place 进入 tray；组合内默认父组中心。',update:'只写变化字段；未写保持不变。所有对象的专属属性放在 props 中，公共几何与外观仍用 place/size/style/order。',outputs:'pieces 使用 id/place/order；已有部分未给摆放保留原位。',placement:'位置、尺寸和偏移默认 mm，字体大小 style.fontSizePt 用 pt；只有显式 unit:ratio 才表示比例。坐标原点在所选 reference 的左上角；双页 page.left/page.right 的 x 各从对应单页左边缘起算，如右页向内 20mm 用 reference:page.right,at:[20,40]；reference:page 才从整张双页左边缘起算。place.at 指向目标对象的 anchor，默认 anchor:center，因此 at:[10,10] 是对象中心距参照左上各 10mm，不是对象左上角；若按左上角定位，显式写 anchor:top-left。place.at 与 referenceAnchor 二选一；相对距离用 reference:node:id、referenceAnchor、anchor 和 offset:{value:[x,y]}。',batch:'同一轮返回的 tool_calls 按列表顺序逐个执行，等待前一个结束再执行下一个；不是并行执行。每个 creation_apply 内 operations 也按序执行，后项可引用前项 id；单次 apply 原子提交。某个工具失败后继续后续调用，后续仅能引用此前成功创建的对象。knowledge 加载也按调用顺序执行。'},definitions:Object.fromEntries([...used].map(n=>[n,definitions[n]])),capabilities:canvasCapabilityRegistry,operations:canvasOperations};
}

// Derive the compact model-facing guide from the same operation definitions
// that validate and lower creation_apply. No second hand-maintained API manual.
export function compactCanvasGuide(){
 const full=canvasGuide();
 const type=schema=>{
  if(!schema)return '—';
  if(schema.$ref)return schema.$ref.split('/').at(-1);
  if(schema.const!==undefined)return JSON.stringify(schema.const);
  if(schema.enum)return schema.enum.join('|');
  if(schema.type==='array')return 'array<'+type(schema.items)+'>';
  if(schema.type==='object'||schema.properties)return 'object{'+Object.keys(schema.properties||{}).join(',')+'}';
  if(schema.oneOf)return schema.oneOf.map(type).join(' 或 ');
  if(schema.anyOf)return schema.anyOf.map(type).join(' 或 ');
  return Array.isArray(schema.type)?schema.type.join('|'):schema.type||'值';
 };
 const fields=schema=>Object.fromEntries(Object.entries(schema?.properties||{}).map(([name,value])=>[name,type(value)]));
 const variant=schema=>({required:schema.required||[],fields:fields(schema),
  ...(schema.oneOf?{alternatives:schema.oneOf.map(item=>({required:item.required||[],fields:fields(item)}))}:{}),
  ...(schema.allOf?{conditions:schema.allOf.map(item=>({when:fields(item.if),thenRequired:item.then?.required||[],thenFields:fields(item.then),otherwiseRequired:item.else?.required||[]}))}:{}),
  ...(schema.not?{forbidden:fields(schema.not)}:{})});
 const common=['Place','Size','Style','TitleStyle','Order','Edge','Region'];
 const specialized=['TitleBackdrop','GraphicGeometry','ShapeOptions','TapePath','TapeTexture','TapeCaps','SplitLine','OutputPart'];
 return {
  title:'Agent Canvas Manual',
  basicRules:{coordinates:'位置、尺寸、偏移默认 mm；字体大小 style.fontSizePt 为 pt；显式 unit:ratio 才用比例。',ids:'create 用 id；已有对象用 target；同批后续操作可引用前面创建的 id。',transactions:'creation_apply 使用唯一 transactionId，baseSceneRevision 通常填 current；同批 operations 顺序原子执行。',defaults:'新对象省略 place 进入 tray；update 仅改提供的字段；撕边 depthMm 采用对象尺寸默认值，torn seed 由对象与操作稳定生成，也可显式指定。',shadows:full.conventions.shadows,paperEdges:full.conventions.paperEdges,opacity:full.conventions.opacity,placement:full.conventions.placement,outputs:full.conventions.outputs,batch:full.conventions.batch},
  capabilityCatalog:{basic:canvasOperationNames,geometry:['crop','edge','split','cutout'],segmentation:{methods:['extract','foreground','detect_all'],availability:'仅当本轮 tools 中提供 segment 才可调用；否则不能执行智能分割'},textEffects:Object.keys(canvasCapabilityRegistry.text.createProps.properties).filter(key=>key!=='content'),recipes:techniqueCatalog.methods.map(method=>{const detail=publicRecipeDescription(describeTechnique(method.id,{includeFontSuggestions:false})),entries=Object.entries(detail.parameters);return {methodId:method.id,title:method.title,when:method.when,required:Object.fromEntries(entries.filter(([,field])=>field.required).map(([name,field])=>[name,field.description])),optional:entries.filter(([,field])=>!field.required).map(([name])=>name)};})},
  commonParameters:Object.fromEntries(common.filter(name=>full.definitions[name]).map(name=>[name,variant(full.definitions[name])])),
  objectParameters:{specialized:Object.fromEntries(specialized.filter(name=>full.definitions[name]).map(name=>[name,variant(full.definitions[name])])),kinds:Object.fromEntries(Object.entries(canvasCapabilityRegistry).map(([kind,capability])=>{
   const create=capability.createProps?variant(capability.createProps):null,update=variant(capability.updateProps);
   return [kind,{title:capability.title,createStyle:type(capability.createStyle),create,updateOnly:Object.fromEntries(Object.entries(update.fields).filter(([key])=>!create?.fields[key]))}];
  }))},
  operationParameters:canvasOperations.map(({name,summary,parameters})=>({name,summary,
   variants:(parameters.oneOf||[parameters]).map(schema=>{
    const row=variant(schema);
    row.fields=Object.fromEntries(Object.entries(row.fields).filter(([key])=>!['place','size','style','order','parent'].includes(key)));
    return row;
   })})),
  examples:Object.fromEntries(canvasOperations.map(({name,example,examples})=>[name,examples||[example]]))
 };
}

export function publicCanvasText(value){
 if(typeof value!=='string')return value;
 value=value.replaceAll('creation_paper','creation_apply 中的 create(kind=paper)').replaceAll('creation_title','creation_apply 中的 create(kind=text，可选 effect/layout/runs/backdrop)');
 value=value.replaceAll('"creationObject":{"kind":"title"','"creationObject":{"kind":"text"');
 const create={'material.add':'material','text.add':'text','graphic.add':'graphic','paper.add':'paper','title.add':'text','material.tape':'tape'};
 for(const [name,kind] of Object.entries(create)){
  value=value.replaceAll('"op":"'+name+'"','"op":"create","kind":"'+kind+'"').replaceAll('"op": "'+name+'"','"op": "create", "kind": "'+kind+'"');
  value=value.replaceAll(name,'create(kind='+kind+')');
 }
 for(const [name,replacement] of Object.entries({'layer.update':'update','layer.duplicate':'copy','layer.delete':'delete','group.compose':'group','group.create':'group','group.ungroup':'ungroup','layer.cut':'shape(method=crop)','material.cut':'shape(method=crop)','material.tear':'shape(method=split, split.edge.style=torn)','layer.split':'shape(method=split)','material.split':'shape(method=split)','text.fit':'update.props.fit','material.edge':'shape(method=edge)','text.reflow':'update','text.lettering':'create(kind=text, props.runs)','creation_recipe':'creation_apply 中的 recipe','creation_title':'creation_apply','creation_paper':'creation_apply'}))value=value.replaceAll(name,replacement);
 value=value.replaceAll('parameters.variant','params.variant');
 for(const [name,action] of Object.entries({read_skill:'skill',search_references:'search',read_case:'case',read_template:'template',search_writing_topics:'topics',creation_help:'help'}))value=value.replaceAll(name,'knowledge(action='+action+')');
 for(const [name,action] of Object.entries({workspace_create:'create',workspace_view:'view',workspace_close:'close'}))value=value.replaceAll(name,'workspace(action='+action+')');
 return value;
}

export function publicToolData(value,key=''){
 if(typeof value==='string')return ['guidance','summary','hint','description','notes'].includes(key)?publicCanvasText(value):value;
 if(Array.isArray(value))return value.filter(v=>key!=='variants'||!/(^|-)shadow($|-)/.test(v?.key||'')).map(v=>publicToolData(v,key));
 if(!value||typeof value!=='object')return value;
 if(value.kind==='title'&&value.parameters)return {...value,kind:'text',parameters:publicToolData(value.parameters)};
 const routes={read_skill:'skill',search_references:'search',read_case:'case',read_template:'template',search_writing_topics:'topics',creation_help:'help'};
 if(routes[value.tool]){const {tool,...rest}=value;return {tool:'knowledge',action:routes[tool],...publicToolData(rest)};}
 return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='translucency').map(([k,v])=>[k,publicToolData(v,k)]));
}
