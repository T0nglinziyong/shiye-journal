// The executable public language. This is not a legacy-operation adapter.
import base from '../creation-contract/static/api/common.schema.json' with {type:'json'};
import {graphicPresetKinds} from './graphic-geometry.js';
import {shapeOptionsJSONSchema} from './advanced-shape-options.js';
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
d.Reference.pattern='^(page|page\\.left|page\\.right|parent|node:[A-Za-z][A-Za-z0-9._-]*)$';
d.Place.properties.referenceBounds.enum=['layout'];d.Place.properties.targetBounds.enum=['layout'];
d.LayoutRule.properties.behavior={const:'once',default:'once'};d.Size.properties.aspect.default='free';
d.Size.properties.behavior={enum:['once','linked'],default:'once'};
d.Size.allOf.push({if:{properties:{behavior:{const:'linked'}},required:['behavior']},then:{properties:{unit:{const:'ratio'}},required:['reference']}});
d.Color.pattern='^#[0-9A-Fa-f]{6}$';
Object.assign(d.Style.properties,{
 fill:{anyOf:[ref('Color'),{type:'null'}]},stroke:{anyOf:[ref('Color'),{type:'null'}]},
 fontPreset:en('serif','sans','rounded','hand'),italic:bool,underline:bool,strikethrough:bool,
 fontSizePt:num(1,400),lineHeight:num(.1,10),paragraphSpacingMm:num(0,100),lineSpacingMm:num(0,100),curveHeightMm:num(-80,80),
 flipHorizontal:bool,fillOpacity:num(0,1),strokeOpacity:num(0,1),strokeDash:en('solid','dash','dot'),cornerRadiusRatio:num(0,.5),
 penStyle:en('pressure','fountain','ballpoint','brush','marker'),
 shadow:{anyOf:[d.Style.properties.shadow,{type:'null'}]}
});
d.Style.properties.outline={anyOf:[{type:'null'},obj({color:ref('Color'),widthMm:num(.01,8),offsetMm:ref('Vec2')},['color','widthMm'])]};
d.Style.properties.gradient={anyOf:[{type:'null'},obj({angleDeg:num(-360,360),stops:arr(obj({offset:num(0,1),color:ref('Color')},['offset','color']),2,8)},['angleDeg','stops'])]};
d.Outline=d.Style.properties.outline;d.Gradient=d.Style.properties.gradient;d.Style.properties.outline=ref('Outline');d.Style.properties.gradient=ref('Gradient');
const commonStyles=['opacity','blendMode','shadow'];
const styleNames={
 material:[...commonStyles,'flipHorizontal'],group:commonStyles,
 text:[...commonStyles,'outline','gradient','color','fontFamily','fontSizePt','fontPreset','fontWeight','italic','underline','strikethrough','textAlign','lineHeight','letterSpacingMm','paragraphSpacingMm','lineSpacingMm','curveHeightMm'],
 shape:[...commonStyles,'outline','gradient','fill','stroke','strokeWidthMm','fillOpacity','strokeOpacity','strokeDash','cornerRadiusRatio'],
 graphic:[...commonStyles,'outline','gradient','fill','stroke','strokeWidthMm','fillOpacity','strokeOpacity','strokeDash','cornerRadiusRatio','penStyle']
};
for(const [kind,names] of Object.entries(styleNames))d['Style_'+kind]={...obj(Object.fromEntries(names.map(key=>[key,d.Style.properties[key]]))),minProperties:1};
d.PathStyle={...obj(Object.fromEntries(['fill','stroke','opacity'].map(key=>[key,d.Style.properties[key]]))),minProperties:1};
d.VectorPaths=arr(obj({d:{type:'string',minLength:1,maxLength:8192,pattern:'^[MmLlHhVvCcSsQqTtAaZz0-9+eE.,\\s-]+$'},fillRule:en('nonzero','evenodd'),style:ref('PathStyle')},['d']),1,64);
d.ViewBox={type:'array',prefixItems:[num(),num(),num(.001),num(.001)],items:false,minItems:4,maxItems:4};
d.InkPoints=arr(obj({x:num(),y:num(),pressure:num(0,1)},['x','y']),1,20000);
d.Geometry=arr(arr(arr(ref('Vec2'),3,1024),1,64),1,128);
d.Region.oneOf.push(obj({shape:{const:'geometry'},space:en('source','local'),unit:en('mm','ratio'),geometry:ref('Geometry')},['shape','space','unit','geometry']));
// Region variants describe geometry, never a second cutting operation language.
d.Region.oneOf.push(
 obj({shape:{const:'edge'},edge:en('left','right','top','bottom'),amount:num(.001,100000),space:en('source','local'),unit:en('mm','ratio')},['shape','edge','amount','space','unit']),
 obj({shape:{const:'halfPlane'},from:ref('Vec2'),to:ref('Vec2'),side:en('left','right'),space:en('source','local'),unit:en('mm','ratio')},['shape','from','to','side','space','unit'])
);
d.Letters=arr(obj({index:{type:'integer',minimum:0,maximum:31},style:ref('Style_text'),rotationDeg:num(-45,45),offsetMm:ref('Vec2')},['index']),0,32);
d.Edge=obj({style:en('clean','torn','ticket_notch','postage','fringe','partial_tear'),edges:arr(en('top','right','bottom','left'),1,4),roughness:num(0,1),depthMm:num(.1,100),periodMm:num(.5,1000),position:num(0,1),seed:{type:'integer',minimum:0,maximum:2147483647}},['style']);
d.Edge.allOf=[{if:{properties:{style:{const:'torn'}}},then:{required:['seed']}}];
d.TapePath=obj({points:arr(ref('Vec2'),2,128),unit:{const:'mm'}},['points','unit']);
d.TapeTexture=obj({mode:en('sample','repeat','stretch'),offsetMm:num(0,100000),windowMm:num(.001,100000),repeatRangeMm:{type:'array',minItems:2,maxItems:2,items:num(0,100000)},reverse:bool});
d.TapeCaps=obj({start:en('square','angled','torn'),end:en('square','angled','torn'),depthMm:num(0,100)});
// The SAME geometry is accepted by creation and updates. No target/placement
// shortcut, no decoration type, and no legacy shape/vector/ink wrapper fields.
d.GraphicGeometry={oneOf:[
 obj({kind:{enum:graphicPresetKinds},options:ref('ShapeOptions')},['kind']),
 {...obj({kind:{const:'sketch'},motif:en('loop','underline','corner','scallop','trail','rays'),seed:{type:'integer',minimum:1,maximum:2147483646},waypoints:arr(arr(num(0,1),2,2),2,6)},['kind','motif']),allOf:[{if:{required:['waypoints']},then:{properties:{motif:{const:'trail'}}}}]},
 obj({kind:{const:'path'},paths:ref('VectorPaths'),viewBox:ref('ViewBox')},['kind','paths','viewBox']),
 obj({kind:{const:'stroke'},points:ref('InkPoints'),unit:{const:'mm'}},['kind','points','unit'])
]};
d.Relation={oneOf:[
 obj({kind:{const:'peek'},reference:ref('Reference'),edge:en('top','right','bottom','left'),exposedMm:num(0,1000),alongMm:num(-1000,1000),rotationDeg:num(-180,180)},['kind','reference','edge','exposedMm']),
 obj({kind:{const:'underlay'},reference:ref('Reference'),offset:ref('Offset'),rotationDeg:num(-180,180)},['kind','reference']),
 obj({kind:{const:'bridge'},reference:ref('Reference'),reference2:ref('Reference'),from:ref('Vec2'),to:ref('Vec2'),contactMm:num(0,100)},['kind','reference','reference2'])
]};
const publicCommon={place:ref('Place'),size:ref('Size'),style:ref('Style'),order:ref('Order')};
const create=(type,extras={})=>({id,parent:id,place:ref('Place'),size:ref('Size'),style:ref('Style_'+type),order:ref('Order'),...extras});
const change={target:id,...publicCommon,content:str(),geometry:ref('GraphicGeometry'),layoutBox:ref('LayoutBox'),hidden:bool,locked:bool,name:str(100)};
const noSize=props=>{const p={...props};delete p.size;return p;};
const point={reference:'page',at:[50,60],unit:'mm'};
const relative={reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'}};
const size={width:60,unit:'mm'};
const region={shape:'ellipse',space:'local',unit:'ratio',box:[.3,.3,.4,.4]};
const specs=[];
function add(name,summary,properties,required,example,notes=[],extra={}){
 specs.push({name,summary,schema:{...obj({op:{const:name},...properties},['op',...required]),...extra},examples:(Array.isArray(example)?example:[example]).map(item=>({op:name,...item})),notes});
}
add('material.add','放置完整实体素材。',noSize(create('material',{asset:id})),['id','asset','place'],{id:'photo',asset:'m1',place:point},['保留来源物理尺寸；不能用 size 缩放。']);
add('text.add','创建可编辑文字；先测量，再按锚点定位。',create('text',{content:str()}),['id','content','size','place'],{id:'caption',content:'今天的小记。',size,place:relative,style:{fontSizePt:11}},['size.width 必填；height 是持续保存的最小高度，正文变化仍可增长。']);
add('graphic.add','创建基础图形、自由矢量或压感笔迹；主图和点缀使用同一入口。',create('graphic',{geometry:ref('GraphicGeometry')}),['id','geometry','place'],[{id:'paper-route',geometry:{kind:'sketch',motif:'trail',seed:23,waypoints:[[.05,.72],[.38,.48],[.66,.63],[.94,.18]]},place:{reference:'node:photo',at:[.08,.82],unit:'ratio',rotationSpace:'reference',behavior:'linked'},size:{width:46,height:28,unit:'mm'},style:{fill:null,stroke:'#799897',strokeWidthMm:.85}},{id:'caption-highlight',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0,pressure:.45},{x:12,y:.5,pressure:.6},{x:26,y:0,pressure:.4}]},place:{reference:'node:caption',at:[.05,.55],unit:'ratio',rotationSpace:'reference',behavior:'linked'},style:{stroke:'#E8D66B',strokeWidthMm:4,penStyle:'marker',opacity:.4,blendMode:'multiply'},order:{before:'caption'}},{id:'button-ring',geometry:{kind:'ellipse'},place:{reference:'node:photo',at:[.8,.3],unit:'ratio',rotationSpace:'reference',behavior:'linked'},size:{width:9,height:9,unit:'mm'},style:{fill:null,stroke:'#B38652',strokeWidthMm:.6}}],['示例依次是可沿素材细节转折的断续路线、文字后面的短荧光笔、指向实物细节的圈线；waypoints 为图形框内 0–1 比例，选本次素材的 2–6 个实际位置，示例锚点仅作语法说明。不要把一整段正文套入与素材无关的大色块。','所有绘画颜色用 style.fill/stroke；笔迹不再改用 color。基础图形和 path 要指定 size；stroke 的 points 单位 mm，省略 size 使用实际路径尺寸。','相对位置只用 place.reference；参考尺寸只用 size.reference。没有 target、placement、自动点缀或用途专属默认位置。','创建后 layer.update 使用相同 geometry/size/style；笔迹保留可编辑压力点，shape/path 保留可编辑矢量。修改不会自动切换 Scene 节点类型。'],{allOf:[{if:{properties:{geometry:{properties:{kind:{not:{const:'stroke'}}},required:['kind']}},required:['geometry']},then:{required:['size']}}]});
add('text.lettering','一次创建逐字可编辑的艺术标题，每字可用不同字体/颜色/描边/渐变；不栅格化。',{id,parent:id,content:str(128),place:ref('Place'),style:ref('Style_text'),gapMm:num(0,20),letters:ref('Letters'),order:ref('Order')},['id','content','place'],{id:'title',content:'出发',place:point,style:{fontSizePt:24,color:'#35516A',outline:{color:'#FFFFFF',widthMm:.6}},letters:[{index:1,style:{fontPreset:'serif',gradient:{angleDeg:90,stops:[{offset:0,color:'#D18A5B'},{offset:1,color:'#6B4C8C'}]}},rotationDeg:4}]},['生成 id-g1、id-g2 等独立 text 子节点；普通属性用 layer.update；改整段标题、字距和逐字布局用 text.reflow。适用于短标题，不替代长正文或复杂连写语言的整词排版。字体以当前环境可用者为准；用 fonts 查询。']);
add('text.reflow','重排已有艺术标题：改变整体正文、字距或逐字排版，保留稳定子节点身份与可编辑样式。',{target:id,content:str(128),gapMm:num(0,20),style:ref('Style_text'),letters:ref('Letters')},['target'],{target:'title',content:'去看看',gapMm:1.2},['只接受 text.lettering 创建的标题组；letters 仅修改列出的字位。已手改或锁定的子节点不可覆盖；删除被外部 linked 引用的字会明确拒绝。','这是子树重排而非普通属性更新；位置与顺序仍由 layer.update 处理。标题组不支持 size 缩放；改整体尺度用本操作的 style.fontSizePt。'],{anyOf:['content','gapMm','style','letters'].map(key=>({required:[key]}))});
add('layer.update','局部修改公共属性与类型化内容，统一重排和 linked 求解。',change,['target'],{target:'caption',style:{fontSizePt:14}},['content 只用于文字；geometry 用于图形/矢量/笔迹。未提供字段保持不变。'],{anyOf:Object.keys(change).filter(key=>key!=='target').map(key=>({required:[key]}))});
add('layer.reparent','移入或移出父组，保持世界位置。',{target:id,parent:{anyOf:[id,{type:'null'}]},preserveWorld:{const:true},order:ref('Order')},['target','parent'],{target:'photo',parent:'card',preserveWorld:true});
add('layer.delete','删除节点，不释放已消耗的物理来源。',{target:id,cascade:{const:true},dependentLinks:en('reject','detach')},['target'],{target:'dot',dependentLinks:'reject'});
add('group.create','将已有同级对象编组。',noSize(create('group',{targets:arr(id,2,200),layoutBox:ref('LayoutBox')})),['id','targets'],{id:'card',targets:['photo','caption']});
add('group.compose','在局部空间创建与精修组合，再整体定位。',noSize(create('group',{children:arr(ref('Operation'),1,100),layoutBox:ref('LayoutBox')})),['id','children','place'],{id:'card',layoutBox:{width:90,height:100,unit:'mm'},place:{reference:'page.right',at:[.5,.5],unit:'ratio'},children:[{op:'material.add',id:'photo',asset:'m1',place:{reference:'parent',at:[.5,.4],unit:'ratio'}},{op:'text.add',id:'caption',content:'局部组合',place:relative,size}]},['children 直接使用同一 Command；不能改动组合外对象。']);
add('group.ungroup','解组，保留世界位置与绘制顺序。',{target:id,dependentLinks:en('reject','detach')},['target'],{target:'card'});
add('material.cut','按 region 真实保留或移除材料；不等于显示遮罩。',{target:id,region:ref('Region'),mode:en('keep','remove'),keepRemainder:bool,resultId:id},['target','region','mode'],{target:'photo',region:{shape:'edge',edge:'left',amount:3,space:'local',unit:'mm'},mode:'remove'},['裁切改变可用区域，保留原素材坐标框；place 的锚点仍以原框计算，不会自动贴到裁片可见边缘。移动前核对 region 的局部偏移，避免按缩小后的框定位。','默认原位修改且不创建可用余料。需要独立输出或保留余料时给新 resultId；原目标被消耗，结果使用该编号。','矩形、曲线、边条、半平面共享 region；命名穿插孔用 material.window，多块输出用 material.split。'],{allOf:[{if:{properties:{keepRemainder:{const:true}},required:['keepRemainder']},then:{required:['resultId']}}]});
const cut={target:id,region:ref('Region'),keepRemainder:bool,resultId:id,edge:ref('Edge')};
add('material.window','真实开窗，可保留窗芯。',{...cut,cutoutId:id,windowId:id},['target','region','windowId'],{target:'photo',region,windowId:'hole-a'});
add('material.split','分出多个独立可定位裁片。',{target:id,pieces:arr(obj({id,region:ref('Region'),place:ref('Place')},['id','region']),1,24),keepRemainder:bool},['target','pieces'],{target:'photo',pieces:[{id:'left',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.4,1]}},{id:'right',region:{shape:'rect',space:'source',unit:'ratio',box:[.6,0,.4,1]}}]});
const mask={target:id,region:ref('Region'),mode:en('replace','intersect','subtract','clear')};
add('layer.mask','统一非破坏性显示遮罩：素材/文字/图形/组合，不改变实体用量。',mask,['target','mode'],{target:'photo',region,mode:'intersect'},['素材支持 source/local 映射；数字节点只用 local。笔迹先分组。clear 删除显示遮罩，不恢复真实裁切。'],{oneOf:[{properties:{mode:{const:'clear'}},not:{required:['region']}},{properties:{mode:{enum:['replace','intersect','subtract']}},required:['region']}]});
add('material.weave','一根真实纸条依次穿过命名的真实窗口。',{strip:id,through:arr(obj({target:id,window:id,sideAfter:en('front','back')},['target','window','sideAfter']),2,16)},['strip','through'],{strip:'strip',through:[{target:'frame',window:'hole-a',sideAfter:'front'},{target:'frame',window:'hole-b',sideAfter:'back'}]});
add('material.tape','创建直段或明确折线胶带，支持取样、重复纹样与端头。',noSize(create('material',{asset:id,lengthMm:num(2,100000),path:ref('TapePath'),widthMm:num(.5,200),texture:ref('TapeTexture'),caps:ref('TapeCaps')})),['id','asset','place'],{id:'tape',asset:'m2',lengthMm:30,place:point,texture:{mode:'stretch'},caps:{start:'torn',end:'angled',depthMm:1}},['lengthMm 与 path 二选一；path 是局部毫米点。'],{oneOf:[{required:['lengthMm'],not:{required:['path']}},{required:['path'],not:{required:['lengthMm']}}]});
add('material.edge','直切、撕边、票根、邮票齿、流苏、局部撕裂。',{target:id,edge:ref('Edge')},['target','edge'],{target:'photo',edge:{style:'torn',roughness:.2,seed:42}});
add('material.contour','给实体素材添加圆角或波浪边。',{target:id,shape:en('rounded','scallop'),radiusRatio:num(.005,.5),depthRatio:num(.005,.2),waves:{type:'integer',minimum:2,maximum:20}},['target','shape'],{target:'photo',shape:'rounded',radiusRatio:.1});
add('material.restore','恢复完整来源；与其他裁片冲突则原子拒绝。',{target:id},['target'],{target:'photo'});
add('material.replace','更换素材来源，保留中心和层级，使用新来源的真实尺寸。',{target:id,asset:id,place:ref('Place'),style:ref('Style_material'),order:ref('Order')},['target','asset'],{target:'photo',asset:'m2'});
add('material.glyphKnockout','以本机字体生成真实字形镂空，或使用已知轮廓。',{target:id,text:str(32),style:obj({fontFamily:str(120),fontSizePt:num(6,280)},['fontFamily','fontSizePt']),place:ref('Place'),region:ref('Region')},['target'],{target:'photo',text:'DAY',style:{fontFamily:'Liberation Sans',fontSizePt:20},place:{reference:'node:photo',at:[.5,.5],unit:'ratio',rotationSpace:'reference',rotationDeg:0}},['文字模式需要本机可解析字体；不伪造缺字。字体不进入 Scene；最终保存几何。'],{oneOf:[{required:['text','style','place'],not:{required:['region']}},{required:['region'],not:{anyOf:['text','style','place'].map(key=>({required:[key]}))}}]});
add('material.relate','探出、垫底或跨两件素材搭桥，保持真实尺寸。',{target:id,relation:ref('Relation')},['target','relation'],{target:'photo',relation:{kind:'underlay',reference:'node:frame',offset:{value:[2,2],unit:'mm'}}});
add('material.decision','记录真实素材取舍。',{asset:id,choice:en('intact','crafted','omitted'),reason:{type:'string',minLength:8,maxLength:240}},['asset','choice','reason'],{asset:'m1',choice:'intact',reason:'保留完整轮廓，与日记文字形成局部组合。'});
add('text.fit','保留全部文字，在指定宽高与字号范围内一次性适配。',{target:id,size:{allOf:[ref('Size'),{properties:{behavior:{const:'once'}}}]},fit:obj({minFontSizePt:num(1,400),maxFontSizePt:num(1,400)},['minFontSizePt','maxFontSizePt']),place:ref('Place'),order:ref('Order')},['target','size','fit'],{target:'caption',size:{width:50,height:30,unit:'mm'},fit:{minFontSizePt:8,maxFontSizePt:16}},['宽高都必须提供；一次性适配并解除先前尺寸跟随，无法适配时回滚，不截字。持续大小另用 layer.update.size.behavior=linked，不会自动重复缩字。']);
add('layer.duplicate','复制普通数字节点或组合；包含实体素材时必须逐节点映射到新的合法来源。',{target:id,id,parent:{anyOf:[id,{type:'null'}]},place:ref('Place'),order:ref('Order'),materialMap:{type:'object',additionalProperties:id}},['target','id','place'],{target:'title',id:'title-copy',place:{reference:'page.right',at:[.5,.3],unit:'ratio'}},['支持文字、图形、笔迹和组合；不携带人工授权标记，不伪造物理库存。materialMap 的键是原素材节点 id/别名，值是本次任务素材 alias。','parent 省略时沿用原父级；null 显式移到页面根级。数字子节点保留几何和内部引用；外部引用解除，副本保留当前外观。材质替换使用新来源完整尺寸，不能把旧裁片蒙版照搬到新素材。修改副本用 layer.update。']);
add('layout.arrange','水平、垂直或网格排列，不缩放实体素材。',{targets:arr(id,2,200),rule:ref('LayoutRule'),container:ref('Reference')},['targets','rule','container'],{targets:['photo','caption'],container:'page.left',rule:{direction:'vertical',gapMm:4,align:'center',behavior:'once'}});
add('layout.align','对齐或等距分布指定对象。',{targets:arr(id,2,200),axis:en('x','y'),align:en('start','center','end','distribute'),reference:ref('Reference')},['targets','axis','align'],{targets:['photo','caption'],axis:'x',align:'center'},['省略 reference 时按选择整体边界；排列后解除被操作对象的主动定位关系。']);
add('layout.detach','解除位置/尺寸主动跟随，保留当前外观。',{target:id,scope:en('all','place','size')},['target'],{target:'caption'});
add('page.update','修改纸色、图案、行距和中缝；不改变任务纸张尺寸。',{paperColor:ref('Color'),paperPattern:en('plain','lines','grid','dots','columns'),rulingMm:num(0,100),centerGutter:bool},[],{paperColor:'#FFFDF7',paperPattern:'dots'},[],{anyOf:['paperColor','paperPattern','rulingMm','centerGutter'].map(key=>({required:[key]}))});
export const creationOperationSpecs=Object.freeze(specs);
