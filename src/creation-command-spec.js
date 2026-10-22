// The executable public language. This is not a legacy-operation adapter.
import base from '../creation-contract/static/api/common.schema.json' with {type:'json'};
import {commonShapes,advancedShapes} from './editor-tools-model.js';
const ref=name=>({$ref:'#/$defs/'+name});
const obj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const num=(minimum=-100000,maximum=100000)=>({type:'number',minimum,maximum});
const str=(maxLength=1500)=>({type:'string',minLength:1,maxLength});
const en=(...values)=>({enum:values});
const arr=(items,minItems=1,maxItems=128)=>({type:'array',items,minItems,maxItems});
const bool={type:'boolean'},id=ref('Id');
export const creationCommonDefinitions=structuredClone(base.$defs);
const d=creationCommonDefinitions;
d.Reference.pattern='^(page|page\\.left|page\\.right|parent|node:[A-Za-z][A-Za-z0-9._-]*)$';
d.Place.properties.referenceBounds.enum=['layout'];d.Place.properties.targetBounds.enum=['layout'];
d.LayoutRule.properties.behavior={const:'once',default:'once'};d.Size.properties.aspect.default='free';
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
d.TextOutline=d.Style.properties.outline;d.TextGradient=d.Style.properties.gradient;d.Style.properties.outline=ref('TextOutline');d.Style.properties.gradient=ref('TextGradient');
const commonStyles=['opacity','blendMode','shadow'];
const styleNames={
 material:[...commonStyles,'flipHorizontal'],group:commonStyles,
 text:[...commonStyles,'outline','gradient','color','fontFamily','fontSizePt','fontPreset','fontWeight','italic','underline','strikethrough','textAlign','lineHeight','letterSpacingMm','paragraphSpacingMm','lineSpacingMm','curveHeightMm'],
 shape:[...commonStyles,'fill','stroke','strokeWidthMm','fillOpacity','strokeOpacity','strokeDash','cornerRadiusRatio'],
 ink:[...commonStyles,'color','strokeWidthMm','penStyle']
};
for(const [kind,names] of Object.entries(styleNames))d['Style_'+kind]={...obj(Object.fromEntries(names.map(key=>[key,d.Style.properties[key]]))),minProperties:1};
d.PathStyle={...obj(Object.fromEntries(['fill','stroke','opacity'].map(key=>[key,d.Style.properties[key]]))),minProperties:1};
d.VectorPaths=arr(obj({d:{type:'string',minLength:1,maxLength:8192,pattern:'^[MmLlHhVvCcSsQqTtAaZz0-9+eE.,\\s-]+$'},fillRule:en('nonzero','evenodd'),style:ref('PathStyle')},['d']),1,64);
d.ViewBox={type:'array',prefixItems:[num(),num(),num(.001),num(.001)],items:false,minItems:4,maxItems:4};
d.InkPoints=arr(obj({x:num(),y:num(),pressure:num(0,1)},['x','y']),1,20000);
d.Geometry=arr(arr(arr(ref('Vec2'),3,1024),1,64),1,128);
d.Region.oneOf.push(obj({shape:{const:'geometry'},space:en('source','local'),unit:en('mm','ratio'),geometry:ref('Geometry')},['shape','space','unit','geometry']));
d.Edge=obj({style:en('clean','torn','ticket_notch','postage','fringe','partial_tear'),edges:arr(en('top','right','bottom','left'),1,4),roughness:num(0,1),depthMm:num(.1,100),periodMm:num(.5,1000),position:num(0,1),seed:{type:'integer',minimum:0,maximum:2147483647}},['style']);
d.Edge.allOf=[{if:{properties:{style:{const:'torn'}}},then:{required:['seed']}}];
d.TapePath=obj({points:arr(ref('Vec2'),2,128),unit:{const:'mm'}},['points','unit']);
d.TapeTexture=obj({mode:en('sample','repeat','stretch'),offsetMm:num(0,100000),windowMm:num(.001,100000),repeatRangeMm:{type:'array',minItems:2,maxItems:2,items:num(0,100000)},reverse:bool});
d.TapeCaps=obj({start:en('square','angled','torn'),end:en('square','angled','torn'),depthMm:num(0,100)});
d.GeometryUpdate={oneOf:[
 obj({kind:{const:'vector'},paths:ref('VectorPaths'),viewBox:ref('ViewBox')},['kind','paths','viewBox']),
 obj({kind:{const:'ink'},points:ref('InkPoints'),unit:{const:'mm'}},['kind','points','unit']),
 obj({kind:{const:'shape'},shape:{enum:[...commonShapes,...advancedShapes].map(([name])=>name==='rectangle'?'rect':name).filter(name=>name!=='vector')}},['kind','shape'])
]};
d.Relation={oneOf:[
 obj({kind:{const:'peek'},reference:ref('Reference'),edge:en('top','right','bottom','left'),exposedMm:num(0,1000),alongMm:num(-1000,1000),rotationDeg:num(-180,180)},['kind','reference','edge','exposedMm']),
 obj({kind:{const:'underlay'},reference:ref('Reference'),offset:ref('Offset'),rotationDeg:num(-180,180)},['kind','reference']),
 obj({kind:{const:'bridge'},reference:ref('Reference'),reference2:ref('Reference'),from:ref('Vec2'),to:ref('Vec2'),contactMm:num(0,100)},['kind','reference','reference2'])
]};
const publicCommon={place:ref('Place'),size:ref('Size'),style:ref('Style'),order:ref('Order')};
const create=(type,extras={})=>({id,parent:id,place:ref('Place'),size:ref('Size'),style:ref('Style_'+type),order:ref('Order'),...extras});
const change={target:id,...publicCommon,content:str(),geometry:ref('GeometryUpdate'),layoutBox:ref('LayoutBox'),hidden:bool,locked:bool,name:str(100)};
const noSize=props=>{const p={...props};delete p.size;return p;};
const point={reference:'page',at:[50,60],unit:'mm'};
const relative={reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'}};
const size={width:60,unit:'mm'};
const region={shape:'ellipse',space:'local',unit:'ratio',box:[.3,.3,.4,.4]};
const specs=[];
function add(name,summary,properties,required,example,notes=[],extra={}){
 specs.push({name,summary,schema:{...obj({op:{const:name},...properties},['op',...required]),...extra},examples:[{op:name,...example}],notes});
}
add('material.add','放置完整实体素材。',noSize(create('material',{asset:id})),['id','asset','place'],{id:'photo',asset:'m1',place:point},['保留来源物理尺寸；不能用 size 缩放。']);
add('text.add','创建可编辑文字；先测量，再按锚点定位。',create('text',{content:str()}),['id','content','size','place'],{id:'caption',content:'今天的小记。',size,place:relative,style:{fontSizePt:11}},['size.width 必填；height 是持续保存的最小高度，正文变化仍可增长。']);
add('text.update','修改文字，使用与创建相同的属性和重排逻辑。',{target:id,...publicCommon,content:str(),hidden:bool,locked:bool,style:ref('Style_text')},['target'],{target:'caption',style:{fontSizePt:14}},[],{anyOf:['content','size','style','place','order','hidden','locked'].map(key=>({required:[key]}))});
add('shape.add','创建基础图形。',create('shape',{kind:d.GeometryUpdate.oneOf[2].properties.shape}),['id','kind','size','place'],{id:'dot',kind:'ellipse',size:{width:8,height:8,unit:'mm'},place:point,style:{fill:'#A8BCD5'}});
add('vector.add','创建可编辑多路径矢量。',create('shape',{paths:ref('VectorPaths'),viewBox:ref('ViewBox')}),['id','paths','viewBox','size','place'],{id:'triangle',paths:[{d:'M0 10 L5 0 L10 10 Z',style:{fill:'#A8BCD5'}}],viewBox:[0,0,10,10],size:{width:10,unit:'mm'},place:point},['路径局部 viewBox 坐标不是页面坐标；全局样式与基础图形共用。']);
add('ink.add','创建保留压感点的笔迹。',noSize(create('ink',{points:ref('InkPoints'),unit:{const:'mm'}})),['id','points','unit','place','style'],{id:'underline',points:[{x:0,y:0},{x:30,y:1}],unit:'mm',place:point,style:{color:'#334D4A',strokeWidthMm:1,penStyle:'pressure'}});
add('text.lettering','一次创建逐字可编辑的艺术标题，每字可用不同字体/颜色/描边/渐变；不栅格化。',{id,parent:id,content:str(128),place:ref('Place'),style:ref('Style_text'),gapMm:num(0,20),letters:arr(obj({index:{type:'integer',minimum:0,maximum:31},style:ref('Style_text'),rotationDeg:num(-45,45),offsetMm:ref('Vec2')},['index']),0,32),order:ref('Order')},['id','content','place'],{id:'title',content:'出发',place:point,style:{fontSizePt:24,color:'#35516A',outline:{color:'#FFFFFF',widthMm:.6}},letters:[{index:1,style:{fontPreset:'serif',gradient:{angleDeg:90,stops:[{offset:0,color:'#D18A5B'},{offset:1,color:'#6B4C8C'}]}},rotationDeg:4}]},['生成 id-g1、id-g2 等独立 text 子节点；后续仍用 text.update/layer.update。适用于短标题，不替代长正文或复杂连写语言的整词排版。字体以当前环境可用者为准；用 fonts 查询。']);
add('draw.decorate','根据目标生成可编辑下划线、高亮、括号、圈线、星星、闪光或圆点组，不再手算周边坐标。',{id,target:id,kind:en('underline','highlight','bracket','circle','star','sparkle','dots'),size:ref('Size'),place:ref('Place'),style:ref('Style_ink'),order:ref('Order'),seed:{type:'integer',minimum:0,maximum:2147483647}},['id','target','kind'],{id:'emphasis',target:'caption',kind:'underline',style:{color:'#B99355',strokeWidthMm:.6},seed:42},['circle 默认环绕目标，star/sparkle/dots 默认点缀在目标右上方，可用 place 改方向；默认位置跟随目标，尺寸按创建时计算；目标文字长度变化后可重新创建或精修 geometry。highlight 目标应是单独的单行关键词文本框；不会识别句内词语。几何点为普通 ink，可继续编辑。']);
add('layer.place','用通用 place 定位任意空间节点。',{target:id,place:ref('Place')},['target','place'],{target:'caption',place:relative});
add('layer.update','局部修改公共属性与类型化内容，统一重排和 linked 求解。',change,['target'],{target:'caption',style:{fontSizePt:14}},['content 只用于文字；geometry 用于图形/矢量/笔迹。未提供字段保持不变。'],{anyOf:Object.keys(change).filter(key=>key!=='target').map(key=>({required:[key]}))});
add('layer.reparent','移入或移出父组，保持世界位置。',{target:id,parent:{anyOf:[id,{type:'null'}]},preserveWorld:{const:true},order:ref('Order')},['target','parent'],{target:'photo',parent:'card',preserveWorld:true});
add('layer.reorder','调整同级绘制顺序。',{target:id,order:ref('Order')},['target','order'],{target:'caption',order:{after:'photo'}});
add('layer.delete','删除节点，不释放已消耗的物理来源。',{target:id,cascade:{const:true},dependentLinks:en('reject','detach')},['target'],{target:'dot',dependentLinks:'reject'});
add('group.create','将已有同级对象编组。',noSize(create('group',{targets:arr(id,2,200),layoutBox:ref('LayoutBox')})),['id','targets'],{id:'card',targets:['photo','caption']});
add('group.compose','在局部空间创建与精修组合，再整体定位。',noSize(create('group',{children:arr(ref('Operation'),1,100),layoutBox:ref('LayoutBox')})),['id','children','place'],{id:'card',layoutBox:{width:90,height:100,unit:'mm'},place:{reference:'page.right',at:[.5,.5],unit:'ratio'},children:[{op:'material.add',id:'photo',asset:'m1',place:{reference:'parent',at:[.5,.4],unit:'ratio'}},{op:'text.add',id:'caption',content:'局部组合',place:relative,size}]},['children 直接使用同一 Command；不能改动组合外对象。']);
add('group.ungroup','解组，保留世界位置与绘制顺序。',{target:id,dependentLinks:en('reject','detach')},['target'],{target:'card'});
const cut={target:id,region:ref('Region'),keepRemainder:bool,resultId:id,edge:ref('Edge')};
add('material.crop','真实裁切，保留来源坐标和可选余料。',cut,['target','region'],{target:'photo',region:{shape:'rect',space:'source',unit:'ratio',box:[.1,.1,.8,.8]},keepRemainder:true});
add('material.window','真实开窗，可保留窗芯。',{...cut,cutoutId:id,windowId:id},['target','region','windowId'],{target:'photo',region,windowId:'hole-a'});
add('material.split','分出多个独立可定位裁片。',{target:id,pieces:arr(obj({id,region:ref('Region'),place:ref('Place')},['id','region']),1,24),keepRemainder:bool},['target','pieces'],{target:'photo',pieces:[{id:'left',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.4,1]}},{id:'right',region:{shape:'rect',space:'source',unit:'ratio',box:[.6,0,.4,1]}}]});
const mask={target:id,region:ref('Region'),mode:en('replace','intersect','subtract')};
add('material.mask','非破坏性素材显示遮罩，不释放材料。',mask,['target','region'],{target:'photo',region,mode:'intersect'});
add('layer.mask','为文字、图形、组合设置显示遮罩。',mask,['target','region'],{target:'card',region:{shape:'rect',space:'local',unit:'ratio',box:[0,0,1,1]}},['笔迹请先分组；实体加工用 material.crop/window。']);
add('material.weave','一根真实纸条依次穿过命名的真实窗口。',{strip:id,through:arr(obj({target:id,window:id,sideAfter:en('front','back')},['target','window','sideAfter']),2,16)},['strip','through'],{strip:'strip',through:[{target:'frame',window:'hole-a',sideAfter:'front'},{target:'frame',window:'hole-b',sideAfter:'back'}]});
add('material.tape','创建直段或明确折线胶带，支持取样、重复纹样与端头。',noSize(create('material',{asset:id,lengthMm:num(2,100000),path:ref('TapePath'),widthMm:num(.5,200),texture:ref('TapeTexture'),caps:ref('TapeCaps')})),['id','asset','place'],{id:'tape',asset:'m2',lengthMm:30,place:point,texture:{mode:'stretch'},caps:{start:'torn',end:'angled',depthMm:1}},['lengthMm 与 path 二选一；path 是局部毫米点。'],{oneOf:[{required:['lengthMm'],not:{required:['path']}},{required:['path'],not:{required:['lengthMm']}}]});
add('material.edge','直切、撕边、票根、邮票齿、流苏、局部撕裂。',{target:id,edge:ref('Edge')},['target','edge'],{target:'photo',edge:{style:'torn',roughness:.2,seed:42}});
add('material.contour','给实体素材添加圆角或波浪边。',{target:id,shape:en('rounded','scallop'),radiusRatio:num(.005,.5),depthRatio:num(.005,.2),waves:{type:'integer',minimum:2,maximum:20}},['target','shape'],{target:'photo',shape:'rounded',radiusRatio:.1});
add('material.trim','从指定边缘按毫米或比例裁去或保留一段。',{target:id,edge:en('left','right','top','bottom'),quantity:obj({value:num(.001,100000),unit:en('mm','ratio'),mode:en('keep','remove')},['value','unit','mode'])},['target','edge','quantity'],{target:'photo',edge:'left',quantity:{value:3,unit:'mm',mode:'remove'}});
add('material.diagonal','沿素材局部直线斜裁一侧，不缩放实体。',{target:id,line:obj({from:ref('Vec2'),to:ref('Vec2'),unit:en('mm','ratio'),space:{const:'local'}},['from','to','unit','space']),keep:en('left','right')},['target','line','keep'],{target:'photo',line:{from:[0,.2],to:[1,.8],unit:'ratio',space:'local'},keep:'left'});
add('material.restore','恢复完整来源；与其他裁片冲突则原子拒绝。',{target:id},['target'],{target:'photo'});
add('material.replace','更换素材来源，保留中心和层级，使用新来源的真实尺寸。',{target:id,asset:id,place:ref('Place'),style:ref('Style_material'),order:ref('Order')},['target','asset'],{target:'photo',asset:'m2'});
add('material.glyphKnockout','以本机字体生成真实字形镂空，或使用已知轮廓。',{target:id,text:str(32),style:obj({fontFamily:str(120),fontSizePt:num(6,280)},['fontFamily','fontSizePt']),place:ref('Place'),region:ref('Region')},['target'],{target:'photo',text:'DAY',style:{fontFamily:'Liberation Sans',fontSizePt:20},place:{reference:'node:photo',at:[.5,.5],unit:'ratio',rotationSpace:'reference',rotationDeg:0}},['文字模式需要本机可解析字体；不伪造缺字。字体不进入 Scene；最终保存几何。'],{oneOf:[{required:['text','style','place'],not:{required:['region']}},{required:['region'],not:{anyOf:['text','style','place'].map(key=>({required:[key]}))}}]});
add('material.relate','探出、垫底或跨两件素材搭桥，保持真实尺寸。',{target:id,relation:ref('Relation')},['target','relation'],{target:'photo',relation:{kind:'underlay',reference:'node:frame',offset:{value:[2,2],unit:'mm'}}});
add('material.decision','记录真实素材取舍。',{asset:id,choice:en('intact','crafted','omitted'),reason:{type:'string',minLength:8,maxLength:240}},['asset','choice','reason'],{asset:'m1',choice:'intact',reason:'保留完整轮廓，与日记文字形成局部组合。'});
add('text.fit','保留全部文字，在指定宽高与字号范围内适配。',{target:id,size:ref('Size'),fit:obj({minFontSizePt:num(1,400),maxFontSizePt:num(1,400)},['minFontSizePt','maxFontSizePt']),place:ref('Place'),order:ref('Order')},['target','size','fit'],{target:'caption',size:{width:50,height:30,unit:'mm'},fit:{minFontSizePt:8,maxFontSizePt:16}},['宽高都必须提供；无法适配时回滚，不截字。']);
add('layer.repeat','重复数字图形；不复制实体来源。',{target:id,copies:arr(obj({id,parent:id,...publicCommon},['id','place']),1,64)},['target','copies'],{target:'dot',copies:[{id:'dot-2',place:{reference:'page',at:[70,60],unit:'mm'},style:{fill:'#D0A088'}}]});
add('layout.reuse','复制现有组合结构并映射新素材；不暴露原始 Scene 字段。',{target:id,id,place:ref('Place'),parent:id,order:ref('Order'),materialMap:{type:'object',additionalProperties:id}},['target','id','place'],{target:'card',id:'second-card',materialMap:{m1:'m2'},place:{reference:'page.right',at:[.5,.5],unit:'ratio'}},['复用组合中的材料须显式映射到尚未占用的来源；数字图层仍可独立编辑。']);
add('layout.arrange','水平、垂直或网格排列，不缩放实体素材。',{targets:arr(id,2,200),rule:ref('LayoutRule'),container:ref('Reference')},['targets','rule','container'],{targets:['photo','caption'],container:'page.left',rule:{direction:'vertical',gapMm:4,align:'center',behavior:'once'}});
add('layout.align','对齐或等距分布指定对象。',{targets:arr(id,2,200),axis:en('x','y'),align:en('start','center','end','distribute'),reference:ref('Reference')},['targets','axis','align'],{targets:['photo','caption'],axis:'x',align:'center'},['省略 reference 时按选择整体边界；排列后解除被操作对象的主动定位关系。']);
add('layout.detach','解除主动跟随关系，保留当前位置。',{target:id},['target'],{target:'caption'});
add('page.update','修改纸色、图案、行距和中缝；不改变任务纸张尺寸。',{paperColor:ref('Color'),paperPattern:en('plain','lines','grid','dots','columns'),rulingMm:num(0,100),centerGutter:bool},[],{paperColor:'#FFFDF7',paperPattern:'dots'},[],{anyOf:['paperColor','paperPattern','rulingMm','centerGutter'].map(key=>({required:[key]}))});
export const creationOperationSpecs=Object.freeze(specs);
