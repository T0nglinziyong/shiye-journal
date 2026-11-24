// The executable public language. This is not a legacy-operation adapter.
import base from '../creation-contract/static/api/common.schema.json' with {type:'json'};
import {graphicPresetKinds} from './graphic-geometry.js';
import {shapeOptionsJSONSchema,shapeOptionsSchemaForKind} from './advanced-shape-options.js';
const ref=name=>({$ref:'#/$defs/'+name});
const obj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const num=(minimum=-100000,maximum=100000)=>({type:'number',minimum,maximum});
const str=(maxLength=1500)=>({type:'string',minLength:1,maxLength});
const en=(...values)=>({enum:values});
const arr=(items,minItems=1,maxItems=128)=>({type:'array',items,minItems,maxItems});
const bool={type:'boolean'},id=ref('Id');
export const creationCommonDefinitions=structuredClone(base.$defs);
const d=creationCommonDefinitions;
d.ShapeOptions=shapeOptionsJSONSchema;
// Native editor UUIDs may start with a digit; commands must target them too.
d.Id.pattern='^[A-Za-z0-9][A-Za-z0-9._-]*$';
d.Reference.pattern='^(page|page\\.left|page\\.right|parent|node:[A-Za-z0-9][A-Za-z0-9._-]*)$';
d.Place.properties.referenceBounds.enum=['layout'];d.Place.properties.targetBounds.enum=['layout'];
d.LayoutRule.properties.behavior={const:'once',default:'once'};d.Size.properties.aspect.default='free';
d.Size.properties.behavior={enum:['once','linked'],default:'once'};
d.Size.allOf.push({if:{properties:{behavior:{const:'linked'}},required:['behavior']},then:{properties:{unit:{const:'ratio'}},required:['reference']}});
d.Color.pattern='^#[0-9A-Fa-f]{6}$';
Object.assign(d.Style.properties,{
 fill:{description:'底色；透明填 null，不能写 none。grid/dots/stripes 的纹样颜色使用 stroke。',anyOf:[ref('Color'),{type:'null'}]},stroke:{description:'轮廓或纹样色；grid/dots/stripes 用此字段设置线条或圆点颜色。',anyOf:[ref('Color'),{type:'null'}]},
 fontPreset:en('serif','sans','rounded','hand'),italic:bool,underline:bool,strikethrough:bool,
 fontSizePt:num(1,400),lineHeight:num(.1,10),paragraphSpacingMm:num(0,100),lineSpacingMm:num(0,100),curveHeightMm:num(-80,80),
 flipHorizontal:bool,fillOpacity:num(0,1),strokeOpacity:num(0,1),strokeDash:en('solid','dash','dot'),cornerRadiusRatio:num(0,.5),
 penStyle:en('pressure','fountain','ballpoint','brush','marker'),
 shadow:{anyOf:[d.Style.properties.shadow,{type:'null'}]}
});
d.Style.properties.paperSurface={anyOf:[{type:'null'},obj({kind:en('matte','fiber','torn'),intensity:num(0,1),seed:{type:'integer',minimum:0,maximum:2147483647}},['kind'])]};
d.Style.properties.outline={anyOf:[{type:'null'},obj({color:ref('Color'),widthMm:num(.01,8),offsetMm:ref('Vec2')},['color','widthMm'])]};
d.Style.properties.gradient={anyOf:[{type:'null'},obj({angleDeg:num(-360,360),stops:arr(obj({offset:num(0,1),color:ref('Color')},['offset','color']),2,8)},['angleDeg','stops'])]};
d.Outline=d.Style.properties.outline;d.Gradient=d.Style.properties.gradient;d.Style.properties.paperSurface={anyOf:[{type:'null'},obj({kind:en('matte','fiber','torn'),intensity:num(0,1),seed:{type:'integer',minimum:0,maximum:2147483647}},['kind'])]};
d.Style.properties.outline=ref('Outline');d.Style.properties.gradient=ref('Gradient');
const commonStyles=['opacity','blendMode','shadow'];
const styleNames={
 material:[...commonStyles,'flipHorizontal'],group:commonStyles,
 text:[...commonStyles,'outline','gradient','fillOpacity','color','fontFamily','fontSizePt','fontPreset','fontWeight','italic','underline','strikethrough','textAlign','lineHeight','letterSpacingMm','paragraphSpacingMm','lineSpacingMm','curveHeightMm'],
 shape:[...commonStyles,'paperSurface','outline','gradient','fill','stroke','strokeWidthMm','fillOpacity','strokeOpacity','strokeDash','cornerRadiusRatio'],
 ink:[...commonStyles,'outline','gradient','stroke','strokeWidthMm','penStyle'],
 graphic:[...commonStyles,'paperSurface','outline','gradient','fill','stroke','strokeWidthMm','fillOpacity','strokeOpacity','strokeDash','cornerRadiusRatio','penStyle']
};
for(const [kind,names] of Object.entries(styleNames))d['Style_'+kind]={...obj(Object.fromEntries(names.map(key=>[key,d.Style.properties[key]]))),minProperties:1};
d.PathStyle={...obj(Object.fromEntries(['fill','stroke','opacity'].map(key=>[key,d.Style.properties[key]]))),minProperties:1};
d.VectorPaths=arr(obj({d:{type:'string',minLength:1,maxLength:8192,pattern:'^[MmLlHhVvCcSsQqTtAaZz0-9+eE.,\\s-]+$'},fillRule:en('nonzero','evenodd'),style:ref('PathStyle')},['d']),1,64);
d.ViewBox={type:'array',prefixItems:[num(),num(),num(.001),num(.001)],items:false,minItems:4,maxItems:4};
d.InkPoints=arr(obj({x:num(),y:num(),pressure:num(0,1)},['x','y']),1,20000);
d.Geometry=arr(arr(arr(ref('Vec2'),3,1024),1,64),1,128);
d.Region.oneOf.push(obj({shape:{const:'geometry'},space:en('source','local'),unit:en('mm','ratio'),geometry:ref('Geometry')},['shape','space','unit','geometry']));
for(const variant of d.Region.oneOf)if(variant.properties?.box)variant.properties.rotationDeg=num(-360,360);
// Region variants describe geometry, never a second cutting operation language.
d.Region.oneOf.push(
 obj({shape:{const:'edge'},edge:en('left','right','top','bottom'),amount:num(.001,100000),space:en('source','local'),unit:en('mm','ratio')},['shape','edge','amount','space','unit']),
 obj({shape:{const:'halfPlane'},from:ref('Vec2'),to:ref('Vec2'),side:en('left','right'),space:en('source','local'),unit:en('mm','ratio')},['shape','from','to','side','space','unit'])
);
d.Letters=arr(obj({index:{type:'integer',minimum:0,maximum:31,description:'从 0 开始的字素序号，必须小于 content 的实际字素数；只列要单独修改的字，不必逐字填写。'},style:ref('Style_text'),rotationDeg:num(-45,45),offsetMm:ref('Vec2')},['index']),0,32);
d.Edge=obj({style:en('clean','torn','ticket_notch','postage','fringe','partial_tear'),edges:arr(en('top','right','bottom','left'),1,4),roughness:num(0,1),depthMm:num(.1,100),periodMm:num(.5,1000),position:num(0,1),seed:{type:'integer',minimum:0,maximum:2147483647}},['style']);
d.Edge.allOf=[{if:{properties:{style:{const:'torn'}}},then:{required:['seed']}}];
d.TapePath=obj({points:arr(ref('Vec2'),2,128),unit:{const:'mm'}},['points','unit']);
d.TapeTexture=obj({mode:en('sample','repeat','stretch'),offsetMm:num(0,100000),windowMm:num(.001,100000),repeatRangeMm:{type:'array',minItems:2,maxItems:2,items:num(0,100000)},reverse:bool});
d.TapeCaps=obj({start:en('square','angled','torn'),end:en('square','angled','torn'),depthMm:num(0,100)});
// The SAME geometry is accepted by creation and updates. No target/placement
// shortcut, no decoration type, and no legacy shape/vector/ink wrapper fields.
d.GraphicGeometry={oneOf:[
 {...obj({kind:{enum:graphicPresetKinds},options:ref('ShapeOptions')},['kind']),allOf:graphicPresetKinds.map(kind=>({if:{properties:{kind:{const:kind}}},then:{properties:{options:shapeOptionsSchemaForKind(kind)}}}))},
 {...obj({kind:{const:'sketch'},motif:en('loop','underline','corner','scallop','trail','rays'),seed:{type:'integer',minimum:1,maximum:2147483646},waypoints:arr(arr(num(0,1),2,2),2,6)},['kind','motif']),allOf:[{if:{required:['waypoints']},then:{properties:{motif:{const:'trail'}}}}]},
 obj({kind:{const:'path'},paths:ref('VectorPaths'),viewBox:ref('ViewBox')},['kind','paths','viewBox']),
 obj({kind:{const:'stroke'},points:ref('InkPoints'),unit:{const:'mm'}},['kind','points','unit'])
]};
d.Relation={oneOf:[
 obj({kind:{const:'peek'},reference:ref('Reference'),edge:en('top','right','bottom','left'),exposedMm:num(0,1000),alongMm:num(-1000,1000),rotationDeg:num(-180,180)},['kind','reference','edge','exposedMm']),
 obj({kind:{const:'underlay'},reference:ref('Reference'),offset:ref('Offset'),rotationDeg:num(-180,180)},['kind','reference']),
 obj({kind:{const:'bridge'},reference:ref('Reference'),reference2:ref('Reference'),from:ref('Vec2'),to:ref('Vec2'),contactMm:num(0,100)},['kind','reference','reference2'])
]};
// Updates share field names with creation, but omitted values come from Scene.
d.PlaceUpdate={...obj(d.Place.properties),minProperties:1,not:{required:['at','referenceAnchor']}};
d.SizeUpdate={...obj(d.Size.properties),minProperties:1};
const partialEffect=schema=>{
 if(schema.$ref)return partialEffect(d[schema.$ref.split('/').at(-1)]);
 if(schema.anyOf)return {anyOf:schema.anyOf.map(partialEffect)};
 if(schema.type==='object')return {...schema,required:[]};
 return schema;
};
d.StyleUpdate={...d.Style,properties:{...d.Style.properties},minProperties:1};
for(const key of ['outline','gradient','shadow','paperSurface'])d.StyleUpdate.properties[key]=partialEffect(d.Style.properties[key]);
d.GraphicGeometryUpdate={anyOf:[ref('GraphicGeometry'),obj({options:ref('ShapeOptions')},['options'])]};
const publicCommon={place:ref('Place'),size:ref('Size'),style:ref('Style'),order:ref('Order')};
const create=(type,extras={})=>({id,parent:id,place:ref('Place'),size:ref('Size'),style:ref('Style_'+type),order:ref('Order'),...extras});
const change={target:id,...publicCommon,place:ref('PlaceUpdate'),size:ref('SizeUpdate'),style:ref('StyleUpdate'),content:str(),geometry:ref('GraphicGeometryUpdate'),layoutBox:ref('LayoutBox'),hidden:bool,locked:bool,name:str(100)};
d.TitleStyle={...d.Style_text,properties:{...d.Style_text.properties,...Object.fromEntries(['outline','gradient','shadow'].map(key=>[key,d.StyleUpdate.properties[key]]))}};
d.TitleBackdrop=obj({kind:en('band','brush','oval','dots','squares','mixed','ring','none'),color:ref('Color'),patternColor:ref('Color'),opacity:num(.1,1),paddingMm:num(1,8),diameterMm:num(2,20),densityMm:num(2,12),staggerMm:num(0,5),strokeOnly:bool,strokeWidthMm:num(.15,1.5)},['kind']);
const titleFields={effect:en('outline','hollow','offset-outline','gradient-outline','shadow','none'),accentColor:ref('Color'),layout:en('plain','stagger','curve'),curveHeightMm:num(-80,80),backdrop:{anyOf:[ref('TitleBackdrop'),{type:'null'}]},runs:{anyOf:[arr(obj({content:str(120),role:en('primary','secondary','normal'),breakBefore:bool,rotationDeg:num(-20,20),offsetMm:ref('Vec2'),style:ref('Style_text'),backdrop:ref('TitleBackdrop')},['content']),1,24),{type:'null'}]},gapMm:num(0,20)};
const paperFields={texture:en('subtle','medium','rough'),edge:ref('Edge'),pattern:en('plain','ruled','grid','dots'),translucency:num(0,.85),rows:{type:'integer',minimum:1,maximum:16},columns:{type:'integer',minimum:1,maximum:16}};
Object.assign(change,titleFields,paperFields);
change.edge={...d.Edge,required:[]};delete change.edge.allOf;
change.backdrop={anyOf:[{...d.TitleBackdrop,required:[]},{type:'null'}]};
// Every output uses the same placement/order vocabulary. Omission preserves position.
d.OutputPart=obj({id,place:ref('Place'),order:ref('Order')},['id']);
d.SplitLine=obj({through:ref('Vec2'),unit:en('mm','ratio'),rotationDeg:num(-360,360),edge:ref('Edge')},['through','unit','rotationDeg']);
const noSize=props=>{const p={...props};delete p.size;return p;};
const point={reference:'page',at:[50,60],unit:'mm'};
const relative={reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'}};
const size={width:60,unit:'mm'};
const region={shape:'ellipse',space:'local',unit:'ratio',box:[.3,.3,.4,.4]};
const specs=[];
function add(name,summary,properties,required,example,notes=[],extra={}){
 const fields={...properties};
 if(fields.asset)fields.asset={...fields.asset,description:'本次授权素材清单中的来源别名，如 m1；不是已放置图层编号。'};
 if(fields.target)fields.target={...fields.target,description:'已创建的 Scene 图层 id；素材别名不能直接当 target。可引用同一批前面 material.add 创建的 id。'};
 specs.push({name,summary,schema:{...obj({op:{const:name},...fields},['op',...required]),...extra},examples:(Array.isArray(example)?example:[example]).map(item=>({op:name,...item})),notes});
}
add('material.add','从素材总图取用完整实体素材，创建可编辑图层。',noSize(create('material',{asset:id})),['id','asset'],{id:'photo',asset:'m1',place:point},['asset 是来源别名，id 是你创建的图层编号；如 asset:m1、id:paper，之后裁切/分片/移动用 target:paper，不用 target:m1。可在同一 operations 内先取用再加工，不需要先预览完整原料。','place.surface 可用 page、tray 或已创建的工作空间 ID；位置、角度和相对对象的规则相同。保留来源物理尺寸，不能用 size 缩放。','创建素材不接收 name 或用途字段；用途写在 creation_apply.decision，图层用 id 辨认。']);
add('text.add','创建可编辑文字；先测量，再按锚点定位。',create('text',{content:str()}),['id','content','size'],{id:'caption',content:'今天的小记。',size,place:relative,style:{fontSizePt:11}},['size.width 必填；height 是持续保存的最小高度，正文变化仍可增长。']);
add('graphic.add','创建基础图形、自由矢量或压感笔迹；主图和点缀使用同一入口。',create('graphic',{geometry:ref('GraphicGeometry')}),['id','geometry'],[{id:'paper-route',geometry:{kind:'sketch',motif:'trail',seed:23,waypoints:[[.05,.72],[.38,.48],[.66,.63],[.94,.18]]},place:{reference:'node:photo',at:[.08,.82],unit:'ratio',rotationSpace:'reference',behavior:'linked'},size:{width:46,height:28,unit:'mm'},style:{fill:null,stroke:'#799897',strokeWidthMm:.85}},{id:'caption-highlight',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0,pressure:.45},{x:12,y:.5,pressure:.6},{x:26,y:0,pressure:.4}]},place:{reference:'node:caption',at:[.05,.55],unit:'ratio',rotationSpace:'reference',behavior:'linked'},style:{stroke:'#E8D66B',strokeWidthMm:4,penStyle:'marker',opacity:.4,blendMode:'multiply'},order:{before:'caption'}},{id:'button-ring',geometry:{kind:'ellipse'},place:{reference:'node:photo',at:[.8,.3],unit:'ratio',rotationSpace:'reference',behavior:'linked'},size:{width:9,height:9,unit:'mm'},style:{fill:null,stroke:'#B38652',strokeWidthMm:.6}}],['示例依次是可沿素材细节转折的断续路线、文字后面的短荧光笔、指向实物细节的圈线；waypoints 为图形框内 0–1 比例，选本次素材的 2–6 个实际位置，示例锚点仅作语法说明。不要把一整段正文套入与素材无关的大色块。','基础图形与 path 的颜色用 style.fill/stroke，可用 style.strokeDash 做点线或虚线；geometry.kind=stroke 是压感笔迹，只能用 style.stroke、strokeWidthMm、penStyle 等笔迹样式，不支持 strokeDash、fill 或 color。基础图形和 path 要指定 size；stroke 的 points 单位 mm，省略 size 使用实际路径尺寸。','相对位置只用 place.reference；参考尺寸只用 size.reference。没有 target、placement、自动点缀或用途专属默认位置。','创建后 layer.update 使用相同 geometry/size/style；笔迹保留可编辑压力点，shape/path 保留可编辑矢量。修改不会自动切换 Scene 节点类型。'],{allOf:[{if:{properties:{geometry:{properties:{kind:{const:'stroke'}},required:['kind']}},required:['geometry']},then:{properties:{style:ref('Style_ink')}},else:{properties:{style:ref('Style_shape')},required:['size']}}]});
add('text.lettering','逐字特例：仅在需要指定每个字的独立样式时使用；普通描边、错落、弧形标题直接 title.add。',{id,parent:id,content:str(128),place:ref('Place'),style:ref('Style_text'),gapMm:num(0,20),letters:ref('Letters'),order:ref('Order')},['id','content'],{id:'title',content:'出发',place:point,style:{fontSizePt:24,color:'#35516A',outline:{color:'#FFFFFF',widthMm:.6}},letters:[{index:1,style:{fontPreset:'serif',gradient:{angleDeg:90,stops:[{offset:0,color:'#D18A5B'},{offset:1,color:'#6B4C8C'}]}},rotationDeg:4}]},['生成 id-g1、id-g2 等独立 text 子节点；普通属性用 layer.update；改整段标题、字距和逐字布局用 text.reflow。适用于短标题，不替代长正文或复杂连写语言的整词排版。字体以当前环境可用者为准；用 fonts 查询。']);
add('paper.add','创建可编辑数字纸；省略 place 进入待放区。',create('shape',paperFields),['id','size','style'],{id:'paper',size:{width:65,height:90,unit:'mm'},style:{fill:'#CADCE5'},texture:'medium',edge:{style:'torn',edges:['bottom'],seed:42}},['修改用 layer.update，字段与创建相同。layer.split / layer.cut 可加工数字纸；默认不加阴影。']);
add('title.add','创建可整体修改的标题；省略 place 进入待放区。',create('text',{content:str(120),style:ref('TitleStyle'),size:obj({width:num(11,300),unit:{const:'mm'}},['width','unit']),...titleFields}),['id','content','size','style'],{id:'heading',content:'今天出门',size:{width:70,unit:'mm'},style:{fontSizePt:26,color:'#354C60'},effect:'offset-outline'},['layer.update 直接修改标题的 content/style/size/effect/layout/backdrop，无需找到子文字。未传字段保留；runs:null 清除词组布局。']);
add('text.reflow','只重排 text.lettering 创建的逐字标题组：改变文字、字距或逐字排版。普通 text.add 文字的内容、位置、尺寸和样式统一用 layer.update。',{target:id,content:str(128),gapMm:num(0,20),style:ref('Style_text'),letters:ref('Letters')},['target'],{target:'title',content:'去看看',gapMm:1.2},['只接受 text.lettering 创建的标题组；letters 仅修改列出的字位。已手改或锁定的子节点不可覆盖；删除被外部 linked 引用的字会明确拒绝。','这是子树重排而非普通属性更新；位置与顺序仍由 layer.update 处理。标题组不支持 size 缩放；改整体尺度用本操作的 style.fontSizePt。'],{anyOf:['content','gapMm','style','letters'].map(key=>({required:[key]}))});
add('layer.update','只提交要改的字段；省略保留当前值，不需要复用开关。字段结构与创建一致。',change,['target'],{target:'caption',place:{rotationDeg:5},style:{fontSizePt:14}},['嵌套对象按字段合并，数组整项替换；支持 null 的样式可用 null 清除。place 可只改 rotationDeg；非 linked 对象省略 reference/unit 时使用页面毫米，linked 对象沿用原参照与单位。size 省略单位沿用 linked 单位或毫米；图形只改宽度默认保留高度，显式 aspect=preserve 才等比缩放；文字仍按内容重排。已有描边可只改 style.outline.widthMm，新建效果仍须提供完整必要属性。geometry.options 可省略当前 kind。','place.surface 指定 page、tray 或工作空间 ID；未提供时保留当前区域。位置与旋转可参照页面、对象或组合。content 只用于文字；geometry 用于图形/矢量/笔迹。'],{anyOf:Object.keys(change).filter(key=>key!=='target').map(key=>({required:[key]}))});
add('layer.reparent','移入或移出父组，保持世界位置。',{target:id,parent:{anyOf:[id,{type:'null'}]},preserveWorld:{const:true},order:ref('Order')},['target','parent'],{target:'photo',parent:'card',preserveWorld:true});
add('layer.stack','把对象移到另一对象的正前或正后；跨组时自动移至参照对象的父级并保持画面位置。',{target:id,reference:id,side:en('before','after')},['target','reference','side'],{target:'backing',reference:'photo',side:'before'},['before 是画面后方，after 是画面前方。整体组合可作为 target；不能以自身或自己的子节点为参照。']);
add('layer.delete','删除节点；实体素材暂不用时优先移到 tray 以便再用。',{target:id,cascade:{const:true},dependentLinks:en('reject','detach')},['target'],{target:'dot',dependentLinks:'reject'},['删除实体裁片不会复原来源或释放用量；试摆时用 layer.update.place.surface=tray。删除数字图形、文字可用本命令。']);
add('group.create','将已有对象编组；跨组对象先保持画面位置移到目标父级。',noSize(create('group',{targets:arr(id,2,200),layoutBox:ref('LayoutBox')})),['id','targets'],{id:'card',targets:['photo','caption']},['同级对象直接编组；跨组对象默认移到工作空间根级再编组，也可指定 parent 目标组合。不能同时选中组合及其子节点。']);
add('group.compose','在局部空间创建与精修组合，再整体定位。',noSize(create('group',{children:arr(ref('Operation'),1,100),layoutBox:ref('LayoutBox')})),['id','children'],{id:'card',layoutBox:{width:90,height:100,unit:'mm'},place:{reference:'page.right',at:[.5,.5],unit:'ratio'},children:[{op:'material.add',id:'photo',asset:'m1',place:{reference:'parent',at:[.5,.4],unit:'ratio'}},{op:'text.add',id:'caption',content:'局部组合',place:relative,size}]},['children 直接使用同一 Command；不能改动组合外对象。']);
add('group.ungroup','解组，保留世界位置与绘制顺序。',{target:id,pieces:arr(ref('OutputPart'),1,200),dependentLinks:en('reject','detach')},['target'],{target:'card'},['pieces 可逐项指定已有子对象 id、place、order；未列出的子对象保留原位。']);
add('layer.split','沿指定位置和角度把实体素材或数字纸分成两片。',{target:id,split:ref('SplitLine'),pieces:arr(ref('OutputPart'),2,2)},['target','split','pieces'],{target:'paper',split:{through:[.5,.45],unit:'ratio',rotationDeg:30,edge:{style:'torn',seed:42}},pieces:[{id:'piece-a'},{id:'piece-b'}]},['角度以未旋转对象的局部坐标计，0 水平、90 竖直，正角顺时针；两端自动延伸到边界。pieces[0] 是有向线叉积为正的一侧（水平向右时为下方），pieces[1] 为另一侧。两片共享同一条切口。每片省略 place/order 时保留原位/原层序。']);
add('layer.cut','按区域裁切实体素材或数字纸，区域支持 rotationDeg。',{target:id,region:ref('Region'),mode:en('keep','remove')},['target','region','mode'],{target:'paper',region:{shape:'rect',space:'local',unit:'ratio',box:[.2,.2,.6,.6],rotationDeg:20},mode:'keep'},['裁切后保留原位；图案、纸纹与原图坐标连续。要同时保留两片用 layer.split。']);
add('material.cut','按 region 真实保留或移除材料；不等于显示遮罩。',{target:id,region:ref('Region'),mode:en('keep','remove'),keepRemainder:bool,resultId:id},['target','region','mode'],{target:'photo',region:{shape:'edge',edge:'left',amount:3,space:'local',unit:'mm'},mode:'remove'},['裁切改变可用区域，保留原素材坐标框；place 的锚点仍以原框计算，不会自动贴到裁片可见边缘。移动前核对 region 的局部偏移，避免按缩小后的框定位。','默认原位修改且不创建可用余料。需要独立输出或保留余料时给新 resultId；原目标被消耗，结果使用该编号。','矩形、曲线、边条、半平面共享 region；命名穿插孔用 material.window，多块输出用 material.split。'],{allOf:[{if:{properties:{keepRemainder:{const:true}},required:['keepRemainder']},then:{required:['resultId']}}]});
const cut={target:id,region:ref('Region'),keepRemainder:bool,resultId:id,edge:ref('Edge')};
add('material.window','真实开窗，可保留窗芯。',{...cut,cutoutId:id,windowId:id},['target','region','windowId'],{target:'photo',region,windowId:'hole-a'});
add('material.tear','沿给定轨迹撕出真实裁片，可保留余料。',{
 target:id,resultId:id,path:obj({points:arr(ref('Vec2'),2,128),unit:en('mm','ratio'),closed:bool},['points','unit']),
 keep:en('left','right','inside','outside'),depthMm:num(0,100),periodMm:num(.5,1000),seed:{type:'integer',minimum:0,maximum:2147483647},keepRemainder:bool
},['target','resultId','path','keep','seed'],{target:'paper',resultId:'torn-paper',path:{points:[[0,.35],[.3,.42],[.65,.3],[1,.45]],unit:'ratio'},keep:'left',depthMm:.6,periodMm:3,seed:42,keepRemainder:true},[
 '轨迹使用当前裁片局部坐标，未旋转前左上角为原点。开放轨迹首尾在矩形边界，中间点在内部；按点的先后方向，left 指叉积为正的一侧（从左向右时是下方），right 为另一侧。',
 '闭合轨迹设置 closed:true、keep:inside 或 outside。轮廓不得自交；撕口幅度不得超过短边 10%。',
 '生成独立 resultId，原目标消耗；keepRemainder 默认 true。余料保留在来源账本，可继续使用；不额外缩放材料。撕裂只影响给定轨迹，原外边缘保持。'
]);
add('material.split','将整料或已有图层直接分成多个可定位裁片。asset 与 target 二选一。',{asset:id,target:id,pieces:arr(obj({id,region:ref('Region'),place:ref('Place'),order:ref('Order')},['id','region']),1,24),keepRemainder:bool},['pieces'],{asset:'m1',pieces:[{id:'upper',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,1,.4]},place:{reference:'page',at:[45,35],unit:'mm'}},{id:'lower',region:{shape:'rect',space:'source',unit:'ratio',box:[0,.5,1,.5]},place:{reference:'page',at:[60,110],unit:'mm'}}]},[
 '未取用的完整素材用 asset:来源别名，一步完成取用、分片和摆放；每片可给 place；省略时放入待放区。已经放置的素材用 target:图层id，分片后原 target 不再存在，后续使用 pieces 的新 id。asset 入口同样遵守授权、实体库存与来源占用，不会复制已经用过的素材。',
 '想让大块和小块都留在画面，必须在 pieces 中同时声明两块。只声明小块会撤下原大块；keepRemainder:true 仅把未声明的余料保留到暂存区，不会保留原大块在纸面。',
 '各 region 在同一来源上不得重叠；裁片 place 默认继承原位，显式定位以裁片自己的边界框为准。分片继承原图层的前后位置，不会自动压到其他纸的最上面。'
],{oneOf:[{required:['target'],not:{required:['asset']}},{required:['asset'],not:{required:['target']}}]});
const mask={target:id,region:ref('Region'),mode:en('replace','intersect','subtract','clear')};
add('layer.mask','统一非破坏性显示遮罩：素材/文字/图形/组合，不改变实体用量。',mask,['target','mode'],{target:'photo',region,mode:'intersect'},['素材支持 source/local 映射；数字节点只用 local。笔迹先分组。clear 删除显示遮罩，不恢复真实裁切。'],{oneOf:[{properties:{mode:{const:'clear'}},not:{required:['region']}},{properties:{mode:{enum:['replace','intersect','subtract']}},required:['region']}]});
add('material.weave','一根真实纸条依次穿过命名的真实窗口。',{strip:id,through:arr(obj({target:id,window:id,sideAfter:en('front','back')},['target','window','sideAfter']),2,16)},['strip','through'],{strip:'strip',through:[{target:'frame',window:'hole-a',sideAfter:'front'},{target:'frame',window:'hole-b',sideAfter:'back'}]});
add('material.tape','创建直段或明确折线胶带，支持取样、重复纹样与端头。',noSize(create('material',{asset:id,lengthMm:num(2,100000),path:ref('TapePath'),widthMm:num(.5,200),texture:ref('TapeTexture'),caps:ref('TapeCaps')})),['id','asset'],{id:'tape',asset:'m2',lengthMm:30,place:point,texture:{mode:'stretch'},caps:{start:'torn',end:'angled',depthMm:1}},['lengthMm 与 path 二选一；path 是局部毫米点。'],{oneOf:[{required:['lengthMm'],not:{required:['path']}},{required:['path'],not:{required:['lengthMm']}}]});
add('material.edge','直切、撕边、票根、邮票齿、流苏、局部撕裂。',{target:id,edge:ref('Edge')},['target','edge'],{target:'photo',edge:{style:'torn',roughness:.2,seed:42}});
add('material.contour','给实体素材添加圆角或波浪边。',{target:id,shape:en('rounded','scallop'),radiusRatio:num(.005,.5),depthRatio:num(.005,.2),waves:{type:'integer',minimum:2,maximum:20}},['target','shape'],{target:'photo',shape:'rounded',radiusRatio:.1});
add('material.restore','恢复完整来源；与其他裁片冲突则原子拒绝。',{target:id},['target'],{target:'photo'});
add('material.replace','更换素材来源，保留中心和层级，使用新来源的真实尺寸。',{target:id,asset:id,place:ref('Place'),style:ref('Style_material'),order:ref('Order')},['target','asset'],{target:'photo',asset:'m2'});
add('material.glyphKnockout','以本机字体生成真实字形镂空，或使用已知轮廓。',{target:id,text:str(32),style:obj({fontFamily:str(120),fontSizePt:num(6,280)},['fontFamily','fontSizePt']),place:ref('Place'),region:ref('Region')},['target'],{target:'photo',text:'DAY',style:{fontFamily:'Liberation Sans',fontSizePt:20},place:{reference:'node:photo',at:[.5,.5],unit:'ratio',rotationSpace:'reference',rotationDeg:0}},['文字模式需要本机可解析字体；不伪造缺字。字体不进入 Scene；最终保存几何。'],{oneOf:[{required:['text','style','place'],not:{required:['region']}},{required:['region'],not:{anyOf:['text','style','place'].map(key=>({required:[key]}))}}]});
add('material.relate','探出、垫底或跨两件素材搭桥，保持真实尺寸。',{target:id,relation:ref('Relation')},['target','relation'],{target:'photo',relation:{kind:'underlay',reference:'node:frame',offset:{value:[2,2],unit:'mm'}}});
add('material.decision','记录真实素材取舍。',{asset:id,choice:en('intact','crafted','omitted'),reason:{type:'string',minLength:8,maxLength:240}},['asset','choice','reason'],{asset:'m1',choice:'intact',reason:'保留完整轮廓，与日记文字形成局部组合。'});
add('text.fit','保留全部文字，在指定宽高与字号范围内一次性适配。',{target:id,size:{allOf:[ref('Size'),{properties:{behavior:{const:'once'}}}]},fit:obj({minFontSizePt:num(1,400),maxFontSizePt:num(1,400),maxLines:{type:"integer",minimum:1,maximum:100}},['minFontSizePt','maxFontSizePt']),style:ref('Style_text'),place:ref('Place'),order:ref('Order')},['target','size','fit'],{target:'caption',size:{width:50,height:30,unit:'mm'},fit:{minFontSizePt:8,maxFontSizePt:16}},['宽高都必须提供；maxLines 可限制行数（单行标题设 1），有渲染器时按真实字体测量；可同时设置 style 的字体、颜色、字距与行距，再按该样式适配（最终字号由 fit 决定）；一次性适配并解除先前尺寸跟随，无法适配时回滚，不截字。持续大小另用 layer.update.size.behavior=linked，不会自动重复缩字。']);
add('layer.duplicate','复制普通数字节点或组合；包含实体素材时必须逐节点映射到新的合法来源。',{target:id,id,parent:{anyOf:[id,{type:'null'}]},place:ref('Place'),order:ref('Order'),materialMap:{type:'object',additionalProperties:id}},['target','id'],{target:'title',id:'title-copy',place:{reference:'page.right',at:[.5,.3],unit:'ratio'}},['支持文字、图形、笔迹和组合；不携带人工授权标记，不伪造物理库存。materialMap 的键是原素材节点 id/别名，值是本次任务素材 alias。','parent 省略时沿用原父级；null 显式移到页面根级。数字子节点保留几何和内部引用；外部引用解除，副本保留当前外观。材质替换使用新来源完整尺寸，不能把旧裁片蒙版照搬到新素材。修改副本用 layer.update。']);
add('layout.arrange','水平、垂直或网格排列，不缩放实体素材。',{targets:arr(id,2,200),rule:ref('LayoutRule'),container:ref('Reference')},['targets','rule','container'],{targets:['photo','caption'],container:'page.left',rule:{direction:'vertical',gapMm:4,align:'center',behavior:'once'}});
add('layout.align','按页面或对象边界对齐、等距分布；支持跨组世界坐标。',{targets:arr(id,1,200),axis:en('x','y'),align:en('start','center','end','distribute'),reference:ref('Reference')},['targets','axis','align'],{targets:['photo'],axis:'x',align:'center',reference:'node:card'},['单个目标须指定 reference；等距分布须至少两个目标。跨组时 reference 不能为 parent。排列后解除被操作对象的主动定位关系。']);
add('layout.matchRotation','将一个或多个对象的画面角度对齐参照对象，中心和实体尺寸不变。',{targets:arr(id,1,200),reference:id,offsetDeg:num(-180,180)},['targets','reference'],{targets:['journey','note'],reference:'life-wear',offsetDeg:0},['读取参照对象的世界角度，跨组也有效；offsetDeg 可让两件素材有意保留少量错位。只改变 targets 的角度，不移动参照对象。']);
add('layout.alignEdge','把目标的一条可见边贴齐另一对象的指定边，按需要留缝和沿边错位。',{target:id,reference:id,targetEdge:en('top','right','bottom','left'),referenceEdge:en('top','right','bottom','left'),gapMm:num(-100,100),alongMm:num(-100,100),offsetDeg:num(-180,180),targetQuad:arr(arr(num(0,1),2,2),4,4),referenceQuad:arr(arr(num(0,1),2,2),4,4)},['target','reference','targetEdge','referenceEdge'],{target:'note',reference:'journey',targetEdge:'top',referenceEdge:'bottom',gapMm:2},['offsetDeg 与 layout.matchRotation 同名，表示对齐后目标相对参照边再转的角度；0 表示平行。四角顺序为左上、右上、右下、左下，坐标按对象原始框的 0–1 比例。若素材已有真实四边形裁切轮廓，会自动读取；若来源有四边形透明轮廓也会自动读取；没有可靠轮廓的素材必须按预览传 targetQuad/referenceQuad，绝不把透明外框冒充可见边。撕裂或曲线边应改用普通对齐。gapMm 沿参照边外法线，alongMm 沿参照边。']);
add('layout.nudge','按毫米平移或按角度旋转对象/整组，保留每件实体尺寸和组内关系。',{targets:arr(id,1,200),deltaMm:ref('Vec2'),rotationDeg:num(-180,180)},['targets'],{targets:['note','circle'],deltaMm:[2,-1],rotationDeg:3},['deltaMm 是纸面世界坐标的 [向右,向下]，rotationDeg 是每个对象当前角度的增量；至少指定一个。不可同时选中组合及其子节点。'],{anyOf:[{required:['deltaMm']},{required:['rotationDeg']}]});
add('layout.detach','解除位置/尺寸主动跟随，保留当前外观。',{target:id,scope:en('all','place','size')},['target'],{target:'caption'});
add('page.update','修改纸色、图案、行距和中缝；不改变任务纸张尺寸。',{paperColor:ref('Color'),paperPattern:en('plain','lines','grid','dots','columns'),rulingMm:num(0,100),centerGutter:bool},[],{paperColor:'#FFFDF7',paperPattern:'dots'},[],{anyOf:['paperColor','paperPattern','rulingMm','centerGutter'].map(key=>({required:[key]}))});
export const creationOperationSpecs=Object.freeze(specs);
