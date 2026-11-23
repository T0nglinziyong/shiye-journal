import {creationCommonDefinitions as definitions} from '../../src/creation-command-spec.js';
import {compileTitle} from '../library/title.js';
const object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
const inline=value=>Array.isArray(value)?value.map(inline):value&&typeof value==='object'?value.$ref?inline(definitions[value.$ref.split('/').at(-1)]):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,inline(v)])):value;
const number=(minimum,maximum)=>({type:'number',minimum,maximum});
const color=inline(definitions.Color),style=inline(definitions.Style_text);
const backdrop=object({kind:{enum:['band','brush','oval','dots','squares','mixed','ring','none']},color,patternColor:color,opacity:number(.1,1),paddingMm:number(1,8),diameterMm:number(2,20),densityMm:number(2,12),staggerMm:number(0,5),strokeOnly:{type:'boolean'},strokeWidthMm:number(.15,1.5)},['kind']);
export const titleTool={type:'function',function:{name:'creation_title',description:'创建可编辑标题组：layout 选择连续/错落词组/弧形；style 可叠加描边 outline、空心 fillOpacity:0、渐变 gradient 或阴影；backdrop 可选字后笔刷、圆点、方块或圈形，runs 可分词设置大小角色、旋转、偏移和底形。效果可自由组合，也可保留简洁标题；不是仅换字体，不要求每个标题加效果。先按当前纸簇留出标题空间，真实预览检查完整文字和正文，不靠遮挡挤出层次。标题组与子文字/底形可通过 layer.update 修改，整组可移动、撤销。更复杂拆字/笔画技巧按需读 journal-lettering。',parameters:object({
 transactionId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'},baseSceneRevision:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'},decision:{type:'string',minLength:1,maxLength:400},
 titles:{type:'array',minItems:1,maxItems:8,items:object({
 id:inline(definitions.Id),text:{type:'string',minLength:1,maxLength:120},place:inline(definitions.Place),order:inline(definitions.Order),widthMm:number(11,300),fontFamily:{type:'string',minLength:1,maxLength:100},fontSizePt:number(6,120),color,
 layout:{enum:['plain','stagger','curve'],description:'plain 连续文字；stagger 用 runs 明确词组大小/错位；curve 单行弧形，不接收 runs。'},
 style:{...style,description:'可选文字效果，与 text.add 相同；outline:{color,widthMm,offsetMm?}，fillOpacity:0 为空心，可组合 gradient/shadow。'},
 curveHeightMm:number(-80,80),backdrop:{...backdrop,description:'可选字后衬形；color 是底色，patternColor 是圆点/方块/圈颜色。不会消耗实物素材。'},
 runs:{type:'array',minItems:1,maxItems:24,description:'拼接必须等于 text。可逐字或按词组设置，保留读序；primary 较大、secondary 较小。',items:object({text:{type:'string',minLength:1,maxLength:120},role:{enum:['primary','secondary','normal']},fontFamily:{type:'string',minLength:1,maxLength:100},breakBefore:{type:'boolean'},rotationDeg:number(-20,20),offsetMm:{type:'array',items:number(-20,20),minItems:2,maxItems:2},style,backdrop},['text'])},gapMm:number(0,20)
 },['id','text','place','order','widthMm','fontSizePt','color','layout'])}
},['transactionId','baseSceneRevision','titles'])}};
export function compileTitleOperations({titles}){
 return titles.map(({place,order,layout,color,...parameters})=>{
  if(layout!=='curve'&&parameters.curveHeightMm!==undefined)throw Error('curveHeightMm 仅用于 curve 布局');
  const title=compileTitle({...parameters,treatment:layout,colors:[color,color,color]},{widthExplicit:true});
  return {op:'group.compose',id:parameters.id,layoutBox:{width:title.width,height:title.height,unit:'mm'},place,order,children:title.children};
 });
}
