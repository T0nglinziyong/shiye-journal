import {creationCommonDefinitions as definitions} from '../../src/creation-command-spec.js';
const object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
// Inline the existing public placement contract; this is a semantic entry into
// the same atomic graphics transaction, not another Scene or renderer.
const inline=value=>Array.isArray(value)?value.map(inline):value&&typeof value==='object'?value.$ref?inline(definitions[value.$ref.split('/').at(-1)]):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,inline(v)])):value;
const color={type:'string',pattern:'^#[0-9A-Fa-f]{6}$'};
export const paperTool={type:'function',function:{name:'creation_paper',description:'批量创建可编辑纸张：style.fill 选纸色、style.stroke 选印纹色，再选纹理强度、直边/撕边、印纹和透光度，默认无阴影。先按要承托的标题、正文或素材簇决定尺寸、露边与搭接；整页背景只统一气氛，不能替代局部打底，不默认每页铺一张近满版纸，也不逐物配一张底卡。纸张用此入口；普通色块仍用 graphic.add rect。order 明确放在谁后面，避免盖住正文。丰富层叠时，小纸应与主体纸簇有明确搭接或承托，不因颜色相近就将留着细缝的孤立卡片视为连接；疏朗风格可以有意分离。已有纸可用 layer.update 修改、用 creation_undo 撤回整批。',parameters:object({
 transactionId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'},baseSceneRevision:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'},decision:{type:'string',minLength:1,maxLength:400},
 papers:{type:'array',minItems:1,maxItems:32,items:object({
  id:inline(definitions.Id),place:inline(definitions.Place),size:{...inline(definitions.Size),required:['width','height','unit']},order:inline(definitions.Order),
  style:object({fill:color,stroke:color,strokeWidthMm:{type:'number',minimum:0,maximum:3}},['fill']),texture:{enum:['subtle','medium','rough'],description:'纸内纤维和噪声的强度：轻、中、强；不是阴影。'},edge:{enum:['straight','torn']},
  pattern:{enum:['plain','ruled','grid','dots'],description:'默认 plain 素纸；其他为横线、方格、点阵。'},
  translucency:{type:'number',minimum:0,maximum:.85,description:'0 不透光，数值越大越能看到下层；默认 0。'},
  rows:{type:'integer',minimum:1,maximum:16},columns:{type:'integer',minimum:1,maximum:16}
 },['id','place','size','order','style','texture','edge'])}
},['transactionId','baseSceneRevision','papers'])}};
export function compilePaperOperations({papers}){
 return papers.map(({id,place,size,order,style,texture,edge,pattern='plain',translucency=0,rows=8,columns=8})=>({
  op:'graphic.add',id,place,size,order,
  geometry:{kind:'paper',options:{paperPattern:pattern,grain:{subtle:.3,medium:.65,rough:.9}[texture],torn:edge==='torn',translucency,rows,columns}},
  style:{fill:style.fill,stroke:pattern==='plain'?null:style.stroke||'#A79F94',strokeWidthMm:style.strokeWidthMm??.15,strokeOpacity:.45,shadow:null}
 }));
}
