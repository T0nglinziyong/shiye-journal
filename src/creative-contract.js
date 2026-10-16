import {regionOperationSchemas,craftPlanContract,craftPlanDescription} from './craft-plan-contract.js';
// One executable contract is shared by provider tools, offline imports and local validation.
import Ajv from 'ajv';
const validator=new Ajv({strict:false,strictNumbers:true,allErrors:false,coerceTypes:false,useDefaults:false,removeAdditional:false});
const compiled=new WeakMap();
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const string=(maxLength=48)=>({type:'string',minLength:1,maxLength});
const num=(minimum=-20000,maximum=20000)=>({type:'number',minimum,maximum});
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const enums=values=>({type:'string',enum:values});
const array=(items,minItems=0,maxItems=12)=>({type:'array',items,minItems,maxItems});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
// Stable asset aliases encode a UUID, so they are longer than positional m1.
const key=string(192),color={...string(7),pattern:'^#[0-9a-fA-F]{6}$'};
const unit=enums(['ratio','pt','mm']);
const coordinates={x:num(),y:num(),coordinate_unit:unit,relative_to:key,offset:array(num(-4,4),2,2),rotation:num(-180,180),z:integer(-1000,1000)};
const finish=object({line:enums(['straight']),depthMM:num(0,0),periodMM:num(.5,100),corner:enums(['square']),radiusMM:num(0,0)},['line','depthMM','periodMM','corner','radiusMM']);
const box=object({unit:enums(['ratio','mm']),mode:enums(['keep']),values:array(num(0,10000),4,4)},['unit','mode','values']);
const maskPoint=array(num(0,1),2,2);
const layerMask=object({outer:array(maskPoint,3,256),holes:array(array(maskPoint,3,256),0,16)},['outer']);
const sceneStyle={blend_mode:enums(['normal','multiply']),vector_mask:nullable(layerMask)};
const groupID={type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'};
const craftEdgeContract=object({op:enums(['edge']),style:enums(['torn','ticket_notch','postage','fringe','partial_tear']),edges:array(enums(['top','right','bottom','left']),1,4),depth_mm:num(.1,100),period_mm:num(.5,1000),seed:integer(0,4294967295),position:num(0,1)},['op','style']);
export const operationContract={anyOf:[
  object({op:enums(['whole'])},['op']),
  object({op:enums(['crop']),box,angle:num(0,0),finish:nullable(finish)},['op','box']),
  object({op:enums(['trim']),edge:enums(['left','right','top','bottom']),quantity:object({unit:enums(['ratio','mm']),mode:enums(['keep','remove']),value:num(0,10000)},['unit','mode','value']),finish:nullable(finish)},['op','edge','quantity']),
  object({op:enums(['tape']),unit:enums(['ratio','mm']),start:num(0,100000),length:num(.001,100000)},['op','unit','start','length']),
  object({op:enums(['mask']),shape:enums(['polygon','rounded','scallop']),points:array(maskPoint,3,256),radius:num(.005,.5),depth:num(.005,.2),waves:integer(2,20)},['op','shape']),
  object({op:enums(['diagonal']),from:maskPoint,to:maskPoint,keep:enums(['left','right'])},['op','from','to','keep']),
  object({op:enums(['window']),shape:enums(['rectangle','ellipse']),box:array(num(0,1),4,4)},['op','shape','box']),
  craftEdgeContract,
  ...regionOperationSchemas
]};
const simple=object({asset:key,piece:key,unit:integer(0,10000),...coordinates,role:string(80)},['asset']);
const materialRelation={anyOf:[
  object({kind:enums(['peek']),target:key,edge:enums(['left','right','top','bottom']),exposed_mm:num(0,1000),along_mm:num(-1000,1000),rotation_offset:num(-180,180)},['kind','target','edge','exposed_mm']),
  object({kind:enums(['underlay']),target:key,offset_mm:array(num(-1000,1000),2,2),rotation_offset:num(-180,180)},['kind','target']),
  object({kind:enums(['bridge']),target:key,target2:key,anchor_from:array(num(0,1),2,2),anchor_to:array(num(0,1),2,2),contact_mm:num(0,100)},['kind','target','target2'])
]};
const material=object({asset:key,piece:key,unit:integer(0,10000),role:nullable(string(80)),...sceneStyle,operations:array(operationContract,1,12),placement:object({x:num(-2,3),y:num(-2,3),rotation:num(-180,180),z:integer(-1000,1000)},['x','y','rotation','z']),relation:nullable(materialRelation),opacity:num(0,1),flip_horizontal:{type:'boolean'}},['asset','piece','operations','placement']);
const text=object({key,...sceneStyle,content:string(1500),width:num(.001,20000),height:num(.001,20000),...coordinates,size_unit:unit,font_size:num(5,400),font_style:enums(['serif','sans','rounded','hand']),font_name:string(120),style:enums(['serif','sans','rounded','hand']),color,role:enums(['title','body','caption','label']),bold:{type:'boolean'},italic:{type:'boolean'},underline:{type:'boolean'},strikethrough:{type:'boolean'},opacity:num(0,1),alignment:enums(['left','center','right']),line_spacing:num(0,80),fixed_line_height:num(5,400),paragraph_spacing:num(0,80),letter_spacing:num(-5,30)},['key','content','width']);
const vectorPath=array(array(num(0,1),2,2),2,512);
const vectorLayer=object({fill:nullable(color),opacity:num(0,1),paths:array(vectorPath,0,48),rects:array(array(num(0,1),4,4),0,512)},['fill']);
const primitive=object({key,...sceneStyle,kind:enums(['rectangle','roundedRectangle','ellipse','line','frame','star','heart','raindrop','cloud','sun','moon','flower','leaf','sparkle','arrow','checkbox','triangle','diamond','hexagon','grid','dots','stripes','ribbon','tag','bubble','chevron','burst','scallop','wave','zigzag','ticket','postage','washi','bracket','vector']),...coordinates,width:num(.001,20000),height:num(.001,20000),size_unit:unit,fill:nullable(color),stroke:nullable(color),line_width:num(0,30),fill_opacity:num(0,1),stroke_opacity:num(0,1),stroke_dash:enums(['solid','dash','dot']),corner_radius:num(0,.5),opacity:num(0,1),vector_paths:array(vectorPath,1,24),vector_layers:array(vectorLayer,1,64),match_size_to:key,padding_mm:array(num(-100,100),4,4)},['key','kind']);
const paper=object({color,pattern:enums(['plain','lines','grid','dots','columns']),intent:string(240),ruling:num(0,100),center_gutter:{type:'boolean'}});
export const toolContracts={
  compose_story_page:object({grammar:enums(['diary','ephemera']),title:string(80),lead:string(320),notes:array(string(320),2,2),microcopy:string(60),focal:key,support:key,tape:key,ticket:key,illustration:key,paper:color,ink:color,accent:color},['grammar','title','lead','notes','microcopy','focal','support','paper','ink','accent']),
  compose_page:object({materials:array(object({...simple.properties,crop:array(num(0,1),4,4),crop_px:array(num(0,20000),4,4)},['asset']),0,12),graphics:array(primitive,0,48),texts:array(text,0,24),paper}),
  place_materials:object({items:array(simple,1,12)},['items']),
  edit_materials:object({items:array(object({piece:key,mode:enums(['append','replace']),operations:array(operationContract,1,12)},['piece','operations']),1,12)},['items']),
  upsert_materials:object({items:array(material,0,12),remove:array(key,0,12)},['items']),
  move_elements:object({items:array(object({key,...coordinates},['key']),1,12)},['items']),
  arrange_elements:object({keys:array(key,2,12),mode:enums(['row','column','grid']),...Object.fromEntries(Object.entries(coordinates).filter(([k])=>!['rotation','z'].includes(k))),gap_mm:num(0,80),columns:integer(1,6)},['keys','mode']),
  fit_text_to:object({key,target:key,padding_mm:array(num(0,40),4,4),visible_bounds:{type:'boolean'},color,font_size:num(5,400)},['key','target']),
  upsert_primitives:object({items:array(primitive,1,48)},['items']),
  upsert_text:object({items:array(text,1,12)},['items']),
  style_elements:object({items:array(object({key,...sceneStyle,opacity:num(0,1)},['key']),1,24)},['items']),
  group_elements:object({keys:array(key,2,24),id:groupID,name:string(80)},['keys']),
  ungroup_elements:object({id:string(96)},['id']),
  delete_elements:object({keys:array(key,1,24)},['keys']),
  set_paper:paper,
  inspect_materials:object({keys:array(key,1,4)},['keys']),
  finish_design:object({summary:string(240)})
};
const descriptions={
  compose_story_page:'将主题、两段观察与真实素材编成可编辑的日记/拼贴图层；实物尺寸不缩放。失败整体回滚。',
  compose_page:'原子编排材料、图形、文字、纸张；坐标 ratio/pt/mm，relative_to + offset 为目标宽高倍数。crop 为源比例，crop_px 为源像素。失败整体回滚。',
  place_materials:'放置整件真实素材；尺寸来自素材库，同件已放置时更新位置。piece 指定片段，unit 指定胶带来源段；普通素材每方案只取用一份。',
  edit_materials:'连续加工现有片段：append 接着当前片加工，replace 从原材料开始。先矩形裁片/胶带截段，再以 mask 设圆角、花边或多边形外轮廓；diagonal 以源片比例坐标 from/to 的直线裁去一侧，keep 为 left/right；window 在片段内部开透明矩形或椭圆孔，box=[x,y,宽,高]。外轮廓、斜裁和多个不重叠开窗可组合，不会变成白色填充；实物尺寸保持原比例。',
  upsert_materials:'整体替换片段的完整工序；remove 先移走旧片，再核验尺寸、来源段与裁片不重叠。',
  move_elements:'修改现有图层的位置、旋转、层序；实物大小保持不变。ratio/pt/mm 或 relative_to + offset。',
  arrange_elements:'把图层排成行/列/不等尺寸网格，保留实物大小，以毫米间距和整体中心布局。',
  fit_text_to:'把完整文字放进素材或图形，padding_mm 左上右下；字号可调整，放不下明确失败，不裁字。透明边界需已有扫描数据。',
  upsert_primitives:'写入实际可编辑数字图形；match_size_to + padding_mm 左上右下匹配相框尺寸。',
  upsert_text:'写入可编辑真实段落；宽度必填，高度不足会扩到完整排版高度；支持字号、字色、字重和段落间距。',
  style_elements:'为已存在的实体素材、文字或图形设置共享 Scene 属性：非破坏性矢量外轮廓／镂空蒙版、透明度和正片叠底。不能改变实物尺寸。',
  group_elements:'将两件或更多现有图层创建实体手帐组合，便于一起移动和选择；不额外缩放实物，也不创建新的素材。',
  ungroup_elements:'取消实体手帐组合，仅解除选区关联，不删除任何实体素材或可编辑图层。',
  delete_elements:'移走作品图层，不修改素材库。锁定图层不可移除。',
  set_paper:'设置纸色、纸型与构图意图，不创建实物底纸。',
  inspect_materials:'查看最多4个现有素材/裁片的真实尺寸、可见边界和原图来源描述；只接受已知ID。',
  finish_design:'仅能作为本轮最后调用，且前面全部成功；核验真实素材尺寸、裁片、必用素材和单方案取用。文字、留白与构图由创作者决定。'
};
export function validateValue(value,schema,path='$'){
  let check=compiled.get(schema);if(!check){check=validator.compile(schema);compiled.set(schema,check);}if(check(value))return;
  const error=check.errors[0],field=error.params.additionalProperty||error.params.missingProperty||'',location=path+error.instancePath+(field?'.'+field:'');
  const reason=error.keyword==='additionalProperties'?'未实现或未知字段':error.keyword==='required'?'缺少字段':error.keyword==='enum'?'未实现或未知值':'合同不合法';throw Error(location+' '+reason+'：'+error.message);
}
export function validateTool(name,args){if(!Object.hasOwn(toolContracts,name))throw Error('未知工具 '+name);validateValue(args,toolContracts[name],'$.'+name);}
const directText=object({...sceneStyle,content:string(1500),font_style:enums(['serif','sans','rounded','hand']),font_name:string(120),x:num(0,1),y:num(0,1),width:num(.01,1),height:num(.01,1),font_size:num(5,400),color,z:integer(-1000,1000),rotation:num(-180,180),opacity:num(0,1),role:enums(['title','body','caption','label']),alignment:enums(['left','center','right']),bold:{type:'boolean'},italic:{type:'boolean'},underline:{type:'boolean'},strikethrough:{type:'boolean'},line_spacing:num(0,80),fixed_line_height:num(5,400),paragraph_spacing:num(0,80),letter_spacing:num(-5,30)},['content','font_style','x','y','width','height','font_size','color']);
const inkPoint=object({x:num(0,1),y:num(0,1),pressure:num(0,1)},['x','y']);
const inkStroke=object({points:array(inkPoint,1,512),width:num(.5,60),color,opacity:num(0,1),pen_style:enums(['fountain','ballpoint','brush','marker'])},['points','width','color','pen_style']);
const directOperations=operationContract;
const directMaterial=object({...material.properties,operations:array(directOperations,1,12)},['asset','piece','operations','placement']);

const directSceneMaterial=object({type:enums(['material']),id:key,...directMaterial.properties},['type','id','asset','piece','operations','placement']);
const directSceneShape=object({type:enums(['shape']),id:key,...primitive.properties},['type','id','key','kind']);
const directSceneText=object({type:enums(['text']),id:key,...directText.properties},['type','id','content','font_style','x','y','width','height','font_size','color']);
const directSceneInk=object({type:enums(['ink']),id:key,...inkStroke.properties},['type','id','points','width','color','pen_style']);
const directSceneGroup=object({type:enums(['group']),id:groupID,name:string(80),z:integer(-1000,1000),
  blend_mode:enums(['normal','multiply']),opacity:num(0,1),vector_mask:nullable(layerMask),
  children:array({$ref:'#/$defs/node'},1,100)},['type','id','children']);
// No duplicate page.items/graphics/ink fields: the whole AI page is one
// ordered, nestable Scene layer tree. Material transforms remain physically
// derived from source aliases, crop operations and source segments.
export const directPageContract={
  ...object({version:{type:'integer',enum:[2]},style:enums(['留白叙事','密集拼贴','杂志网格','胶片日记','手作便签','自由构图']),
    intent:nullable(string(240)),paper:object({color,pattern:enums(['plain','lines','grid','dots','columns']),
      ruling:num(0,100),center_gutter:{type:'boolean'}},['color','pattern']),
    layers:array({$ref:'#/$defs/node'},0,200)},['version','paper','layers']),
  $defs:{node:{anyOf:[directSceneMaterial,directSceneShape,directSceneText,directSceneInk,directSceneGroup]}}
};
toolContracts.apply_craft_plan=craftPlanContract({operation:operationContract,relation:materialRelation,paper,text,primitive,ink:inkStroke});
descriptions.apply_craft_plan=craftPlanDescription+' GPT 已收到图片时，可在同一计划提交 observations 并用 observed_region 取材；不修改原素材标注。';
export const agentTools=Object.entries(toolContracts).map(([name,parameters])=>({type:'function',function:{name,description:descriptions[name],parameters}}));
export const offlinePlanContract=()=>toolContracts.apply_craft_plan;
export function offlineContract(mode,{cropPx=false}={}){
  if(mode==='direct')return directPageContract;
  const contracts=Object.fromEntries(Object.entries(toolContracts).filter(([name])=>name!=='compose_story_page'&&name!=='inspect_materials'));
  if(cropPx)return contracts;
  const taskContracts={...contracts,compose_page:structuredClone(contracts.compose_page)};
  delete taskContracts.compose_page.properties.materials.items.properties.crop_px;
  return taskContracts;
}
export function schemaFingerprint(schema){
  const serialized=JSON.stringify(schema);let hash=2166136261;
  for(let index=0;index<serialized.length;index++){hash^=serialized.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return `fnv1a32:${(hash>>>0).toString(16).padStart(8,'0')}`;
}
export function directPageToTools(page){
  validateValue(page,directPageContract);
  // A single composite call keeps the direct page atomic, including large baskets.
  return [{name:'compose_direct_page',arguments:structuredClone(page)}];
}
