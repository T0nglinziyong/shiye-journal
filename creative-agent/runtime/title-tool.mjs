import {creationCommonDefinitions as definitions} from '../../src/creation-command-spec.js';
const object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
const inline=value=>Array.isArray(value)?value.map(inline):value&&typeof value==='object'?value.$ref?inline(definitions[value.$ref.split('/').at(-1)]):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,inline(v)])):value;
const number=(minimum,maximum)=>({type:'number',minimum,maximum});
const color=inline(definitions.Color);
// Authoring uses common text field names, but not the entire renderer schema.
// Runs inherit the title's effects; advanced styles remain layer.update fields.
const textFields=keys=>object(Object.fromEntries(keys.map(key=>[key,inline(definitions.Style_text.properties[key])])));
const style=textFields(['fontFamily','fontSizePt','color','fontWeight','italic','textAlign','lineHeight','letterSpacingMm','outline']);
const runStyle=textFields(['fontFamily','fontSizePt','color','fontWeight','italic']);
const backdrop=object({kind:{enum:['band','brush','oval','dots','squares','mixed','ring','none']},color,patternColor:color,opacity:number(.1,1),paddingMm:number(1,8),diameterMm:number(2,20),densityMm:number(2,12),staggerMm:number(0,5),strokeOnly:{type:'boolean'},strokeWidthMm:number(.15,1.5)},['kind']);
export const titleTool={type:'function',function:{name:'creation_title',description:'批量创建可编辑标题。content/place/size/style/order 与普通文字同名；order 可省略，新增按调用顺序置于同级最前；layout 默认 plain，effect 默认 none。用 effect+accentColor 选字效，backdrop 选字后底形，runs 只写词组差异并继承整体样式。已有标题直接用 layer.update 修改标题 id 的 content/style/size/effect 等，省略字段保留；高级字效微调用 text.add 的 style 合同。',parameters:object({
 transactionId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'},baseSceneRevision:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'},decision:{type:'string',minLength:1,maxLength:400},
 titles:{type:'array',minItems:1,maxItems:8,items:object({
 id:inline(definitions.Id),content:{type:'string',minLength:1,maxLength:120},place:inline(definitions.Place),order:inline(definitions.Order),size:object({width:number(11,300),unit:{const:'mm'}},['width','unit']),
 effect:{enum:['outline','hollow','offset-outline','gradient-outline','shadow','none'],description:'标题字效主方法：outline 实心描边；hollow 空心；offset-outline 错位轮廓；gradient-outline 渐变加描边；shadow 硬边阴影；none 保留简单文字。结合本页纸色选择，不按效果数量验收。'},accentColor:{...color,description:'描边、渐变起点或阴影的配色；省略默认浅米色。'},
 layout:{enum:['plain','stagger','curve'],description:'plain 连续文字；stagger 用 runs 明确词组大小/错位；curve 单行弧形，不接收 runs。'},
 style:{...style,required:['fontSizePt','color']},
 curveHeightMm:number(-80,80),backdrop:{...backdrop,description:'可选字后衬形；color 是底色，patternColor 是圆点/方块/圈颜色。不会消耗实物素材。'},
 runs:{type:'array',minItems:1,maxItems:24,description:'content 拼接必须等于标题 content。可逐字或按词组设置，保留读序；primary 较大、secondary 较小。',items:object({content:{type:'string',minLength:1,maxLength:120},role:{enum:['primary','secondary','normal']},breakBefore:{type:'boolean'},rotationDeg:number(-20,20),offsetMm:{type:'array',items:number(-20,20),minItems:2,maxItems:2},style:runStyle,backdrop},['content'])},gapMm:number(0,20)
 },['id','content','size','style'])}
},['transactionId','baseSceneRevision','titles'])}};
export {compileTitleOperations} from '../../src/creation-semantic-objects.js';
