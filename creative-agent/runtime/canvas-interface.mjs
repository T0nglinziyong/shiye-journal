import {uniformOpacitySchema,assertUniformOpacity,resetPaperSurfaceOpacity} from './opacity-contract.mjs';
import {withoutShadowSchema,assertNoShadowInput} from './shadow-policy.mjs';
import Ajv2020 from 'ajv/dist/2020.js';
// Model-facing object language. Lower into the existing atomic Scene reducer;
// editor/CLI operations remain implementation primitives, never extra model tools.
import {creationOperationSpecs,creationCommonDefinitions} from '../../src/creation-command-spec.js';
import {sceneScale} from '../../src/creation-scene-core.js';
const specs=Object.fromEntries(creationOperationSpecs.map(s=>[s.name,s]));
const clone=x=>structuredClone(x);
const fields=name=>{const p=clone(specs[name].schema.properties);delete p.op;return p;};
const ref=name=>({$ref:'#/$defs/'+name});
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const variant=(name,op,extra={})=>{const s=clone(specs[name].schema);s.properties.op={const:op};Object.assign(s.properties,extra);return s;};
const text=fields('text.add');
Object.assign(text,Object.fromEntries(Object.entries(fields('title.add')).filter(([k])=>!['id','parent','place','size','style','content'].includes(k))));
text.style=ref('TitleStyle');
const textTechniqueDescriptions={
 effect:'字形主效果：none 原色，outline 实心描边，hollow 空心，offset-outline 错位轮廓，gradient-outline 渐变加描边。创作工具不支持阴影；普通短句也可用，但正文保持易读。',
 accentColor:'字效的第二颜色：描边色、错位轮廓色或渐变起点；与 style.color 主字色配合。',
 layout:'字群排列：plain 常规，stagger 错落，curve 弧线。仅 curve 搭配 curveHeightMm 调弯曲高度。',
 curveHeightMm:'仅 layout=curve 使用；正负值改变弧线方向，绝对值控制弯曲幅度。',
 backdrop:'文字背后的可编辑衬形；kind 选 band/brush/oval/dots/squares/mixed/ring/none，color 设底色，patternColor 设点纹色，paddingMm 控制外露边。无需另建纸张。',
 runs:'可选的词组拆分；每项 content 按顺序拼接必须等于完整 content。role=primary/secondary/normal 决定主次，offsetMm 和 rotationDeg 局部错位，breakBefore 换行；每段还可单独 style/backdrop。用于短标题、日期或数字，不用于整段正文。',
 gapMm:'词组间距；只在需要拉开 runs 的主次关系时调整，避免靠大间距硬撑版面。'
};
for(const [key,description] of Object.entries(textTechniqueDescriptions))text[key]={...text[key],description};
const creates=Object.entries({material:fields('material.add'),text,paper:fields('paper.add'),graphic:fields('graphic.add'),tape:fields('material.tape')}).map(([kind,p])=>object({op:{const:'create'},kind:{const:kind},...p},['op','kind','id',...(kind==='material'||kind==='tape'?['asset']:kind==='text'?['content','size']:kind==='paper'?['size','style']:['geometry','size'])]));
delete creates.find(s=>s.properties.kind.const==='paper').properties.edge;
creates.find(s=>s.properties.kind.const==='tape').oneOf=clone(specs['material.tape'].schema.oneOf);
const update=fields('layer.update');
// All object mutations share target and sparse fields. Optional special fields
// reuse the same checked primitives rather than copying their implementation.
Object.assign(update,{parent:{anyOf:[ref('Id'),{type:'null'}]},fit:fields('text.fit').fit,mask:object({region:ref('Region'),mode:fields('layer.mask').mode},['mode']),relation:ref('Relation'),asset:ref('Id'),paperColor:ref('Color'),paperPattern:fields('page.update').paperPattern,rulingMm:fields('page.update').rulingMm,centerGutter:{type:'boolean'}});
for(const [key,description] of Object.entries(textTechniqueDescriptions))update[key]={...update[key],description};
delete update.edge;
const group={oneOf:[variant('group.create','group'),variant('group.compose','group')]};
const cuts={oneOf:[variant('layer.cut','cut'),variant('material.tear','cut',{method:{const:'tear'}}),variant('material.window','cut',{method:{const:'window'}}),variant('material.glyphKnockout','cut',{method:{const:'glyph'}})]};
for(const s of cuts.oneOf.slice(1))s.required.push('method');
cuts.oneOf.push(object({op:{const:'cut'},method:{const:'edge'},target:ref('Id'),edge:ref('Edge')},['op','method','target','edge']));
const splits={oneOf:[variant('layer.split','split'),variant('material.split','split')]};
export const canvasOperations=[
 {name:'create',summary:'创建素材、文字、纸张、图形或胶带。未给 place 进入待放区。文字始终用完整 content；style 控制字体、字号、字色，也可直接设 outline/gradient/字距；effect、accentColor、layout、runs、backdrop 是可选的标题与短句技巧，具体作用见参数说明。可以只选适合画面的一个或两个技巧，不要求每个标题都套用示例；长正文用普通 content/style。组合字效用于最多 120 字的片段，size.width 为 11–300 mm。',parameters:{oneOf:creates},example:{op:'create',kind:'text',id:'note',content:'今天出门',size:{width:70,unit:'mm'},style:{fontSizePt:24,color:'#354C60'},effect:'outline'}},
 {name:'update',summary:'统一局部修改，只写变化字段；对象递归合并，数组替换。文字可同次修改 content、size、style、place；fit 是可选的一次性适配，宽高可沿用已有文字框，长正文请先按真实可写面积分段或加宽，不要强加过小 maxLines。parent 改所属组；mask 非破坏遮罩；asset 更换真实来源；双页用 target=page.left/page.right 与 paperColor 分别改底色，不新增图层。',parameters:object({op:{const:'update'},...update},['op','target']),example:{op:'update',target:'note',style:{color:'#9F4E39'}}},
 {name:'copy',summary:'复制对象；真实素材须用 materialMap 指向合法新来源。未给 place 的新副本进入待放区。',parameters:variant('layer.duplicate','copy'),example:{op:'copy',target:'note',id:'note2'}},
 {name:'delete',summary:'删除对象；暂不用的实体素材优先 update.place.surface=tray。',parameters:variant('layer.delete','delete'),example:{op:'delete',target:'note2'}},
 {name:'group',summary:'targets 组合已有对象且保留原位；children 在组合内创建对象（同一套操作）。两种方式选一。',parameters:group,example:{op:'group',id:'cluster',targets:['note','paper']}},
 {name:'ungroup',summary:'解组。pieces 每项 id/place/order，可单独摆放；未指定的部分保留原位与层序。',parameters:variant('group.ungroup','ungroup'),example:{op:'ungroup',target:'cluster',pieces:[{id:'note',place:{reference:'page',at:[30,40],unit:'mm'}}]}},
 {name:'cut',summary:'先 create 生成纸张，再 cut 加工，同批按序执行。method=edge 配合 edge 对生成纸张或实体素材加工指定边，形成明显撕口；普通区域裁切用 region/mode，省略 method。实体素材另支持 method=tear（轨迹撕裂）、window（开窗）、glyph（字形镂空）。保留原位。',parameters:cuts,example:{op:'cut',target:'paper',mode:'keep',region:{shape:'rect',space:'local',unit:'ratio',box:[.1,.1,.8,.8],rotationDeg:10}}},
 {name:'split',summary:'沿 split.through/rotationDeg 将素材或生成纸张一分为二，可选撕边；实体还可按 pieces[].region 分多块。每片统一 id/place/order；已有对象未指定摆放保留原位，直接 asset 取新料未指定摆放进入待放区。',parameters:splits,example:{op:'split',target:'paper',split:{through:[.5,.5],unit:'ratio',rotationDeg:25,edge:{style:'torn',seed:42}},pieces:[{id:'a'},{id:'b',place:{reference:'page',at:[90,120],unit:'mm'}}]}}
];
for(const entry of canvasOperations)entry.parameters=uniformOpacitySchema(withoutShadowSchema(entry.parameters));
canvasOperations[0].examples=[
 {op:'create',kind:'paper',id:'paper-a',size:{width:65,height:90,unit:'mm'},style:{fill:'#E9DDD0'},texture:'medium',pattern:'plain',place:{reference:'page',at:[55,85],unit:'mm'}},
 {op:'create',kind:'text',id:'heading-a',content:'今日记录',size:{width:54,unit:'mm'},style:{fontSizePt:25,color:'#354C60'},effect:'offset-outline',accentColor:'#D2894D',backdrop:{kind:'band',color:'#E9C16F',paddingMm:2},place:{reference:'page',at:[55,31],unit:'mm'}},
 {op:'create',kind:'graphic',id:'accent-a',geometry:{kind:'star',options:{points:5}},size:{width:5,height:5,unit:'mm'},style:{fill:'#D2894D'},place:{reference:'node:paper-a',referenceAnchor:'top-right',anchor:'center',offset:{value:[0,0],unit:'mm'}}}
];
const modelDefinitions=uniformOpacitySchema(withoutShadowSchema(creationCommonDefinitions));
export const canvasOperationNames=canvasOperations.map(s=>s.name);
const validators=new Map();
export function validateCanvasOperations(operations){
 assertNoShadowInput(operations);
 assertUniformOpacity(operations);
 if(!Array.isArray(operations)||!operations.length)throw Error('operations 必须是非空数组');
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
  if(schema.oneOf){const choice=schema.oneOf.find(v=>entry.name==='create'?v.properties.kind.const===operation.kind:entry.name==='cut'?(v.properties.method?.const||undefined)===operation.method:entry.name==='split'?Boolean(v.properties.split)===Boolean(operation.split):Boolean(v.properties.children)===Boolean(operation.children));if(choice)schema=choice;}
  if(!validators.has(key))validators.set(key,new Ajv2020({strict:false,allErrors:true}).compile({...schema,$defs:{...modelDefinitions,Operation:{type:'object'}}}));
  const validate=validators.get(key);
  if(!validate(operation))throw Error('operations['+i+'] '+entry.name+' 参数不符合合同：'+JSON.stringify(validate.errors.filter(e=>!['if','oneOf','anyOf'].includes(e.keyword)).slice(0,3)));
  if(operation.children)validateCanvasOperations(operation.children);
 }
}
export function lowerCanvasOperations(operations,{document}={}){
 const find=(nodes,id)=>(nodes||[]).flatMap(n=>[n,...(n.children?flatten(n.children):[])]).find(n=>n.id===id);
 const flatten=nodes=>nodes.flatMap(n=>[n,...flatten(n.children||[])]);
 if(!Array.isArray(operations))throw Error('operations 必须为数组');
 return operations.flatMap((item,index)=>{
  const {op,kind,method,...p}=item;
  if(op==='create'){
   if(!['material','text','paper','graphic','tape'].includes(kind))throw Error('create.kind 只能是 material/text/paper/graphic/tape');
   const decorated=kind==='text'&&['effect','accentColor','layout','curveHeightMm','backdrop','runs','gapMm'].some(k=>Object.hasOwn(p,k));
   return [{op:decorated?'title.add':kind==='tape'?'material.tape':kind+'.add',...(decorated?{style:{fontSizePt:26,color:'#354C60'}}:{}),...p}];
  }
  if(op==='update'){
   const {parent,fit,mask,relation,asset,...change}=p,commands=[];
   if(['page','page.left','page.right'].includes(p.target))return [{op:'page.update',page:p.target,...Object.fromEntries(Object.entries(change).filter(([k])=>k!=='target'))}];
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
   else if(Object.keys(change).some(k=>k!=='target'))commands.push({op:'layer.update',...resetPaperSurfaceOpacity(change,find(document?.page.layers,p.target))});
   if(!commands.length)throw Error('update 至少指定一个需要修改的字段');
   return commands;
  }
  if(op==='group')return [{op:p.children?'group.compose':'group.create',...p,...(p.children?{children:lowerCanvasOperations(p.children,{document})}:{})}];
  if(op==='cut'&&method==='edge')return [{op:'layer.update',...p}];
  if(op==='cut')return [{op:method?{tear:'material.tear',window:'material.window',glyph:'material.glyphKnockout'}[method]:'layer.cut',...p}];
  if(op==='split')return [{op:p.split?'layer.split':'material.split',...p}];
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
 definitions.Operation={description:'children 递归使用本说明中的 8 种操作。'};
 // Keep only transitively referenced definitions; do not ship unused engine APIs.
 const used=new Set();const visit=x=>{if(!x||typeof x!=='object')return;if(x.$ref){const n=x.$ref.split('/')[2];if(!used.has(n)){used.add(n);visit(definitions[n]);}}for(const v of Object.values(x))if(typeof v==='object')Array.isArray(v)?v.forEach(visit):visit(v);};
 canvasOperations.forEach(visit);
 return {conventions:{paperEdges:'纸张自身轻微不规则边缘用 style.paperSurface:{kind:"torn"}，创建和修改共用；它不是明显撕口。明显撕边属于裁切：先 create(kind=paper)，再 cut(method=edge,target=纸张ID,edge={style:"torn",edges:["bottom"],depthMm:1,seed:42})；同一 operations 批次按顺序执行，无需多等一轮。切成两片用 split，切口参数仍叫 edge，两片分别摆放。清除加工边用 cut(method=edge,edge={style:"clean"})，保留纸张自身质感。',opacity:'所有对象统一 style.opacity，0 完全透明、1 完全不透明；创建与修改相同，未写保留原值。硫酸纸与透明胶带均通过此字段表达透光，文字保持独立。',shadows:'创作工具不提供阴影；纸层用露边、纹理、透明度体现关系，文字可用描边和字后底形。',create:'新建无 place 进入 tray；组合内默认父组中心。',update:'只写变化字段；未写保持不变。',outputs:'pieces 使用 id/place/order；已有部分未给摆放保留原位。',placement:'place.at+unit 与 referenceAnchor 二选一；anchor 是目标锚点。相对距离用 reference:node:id、referenceAnchor、anchor 和 offset:{value:[x,y],unit:mm}。',batch:'同一轮返回的 tool_calls 按列表顺序逐个执行，等待前一个结束再执行下一个；不是并行执行。每个 creation_apply 内 operations 也按序执行，后项可引用前项 id；单次 apply 原子提交。某个工具失败后继续后续调用，后续仅能引用此前成功创建的对象。knowledge 加载也按调用顺序执行。'},definitions:Object.fromEntries([...used].map(n=>[n,definitions[n]])),operations:canvasOperations};
}

// Derive the compact model-facing guide from the same operation definitions
// that validate and lower creation_apply. No second hand-maintained API manual.
export function compactCanvasGuide(){
 const full=canvasGuide();
 const field=(name,schema)=>({name,
  ...(schema.const!==undefined?{value:schema.const}:{}),
  ...(schema.enum?{options:schema.enum}:{}),
  ...(schema.description?{description:schema.description}:{}),
  ...(schema.$ref?{definition:schema.$ref.split('/')[2]}:{})});
 const variant=schema=>({required:schema.required||[],fields:Object.entries(schema.properties||{}).map(([name,value])=>field(name,value))});
 return {
  conventions:full.conventions,
  definitions:Object.fromEntries(['Place','Size','Style','TitleStyle','Order','Edge','Region'].filter(name=>full.definitions[name]).map(name=>[name,full.definitions[name]])),
  operations:canvasOperations.map(({name,summary,example,examples,parameters})=>({name,summary,example,examples,
   variants:(parameters.oneOf||[parameters]).map(variant)}))
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
 for(const [name,replacement] of Object.entries({'layer.update':'update','layer.duplicate':'copy','layer.delete':'delete','group.compose':'group','group.create':'group','group.ungroup':'ungroup','layer.cut':'cut','material.cut':'cut','layer.split':'split','material.split':'split','text.fit':'update.fit','material.edge':'cut(method=edge)','text.reflow':'update','text.lettering':'create(kind=text, runs)','creation_title':'creation_apply','creation_paper':'creation_apply'}))value=value.replaceAll(name,replacement);
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
