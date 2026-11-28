// The creative model uses Scene's place/size/style/content vocabulary. The
// library compiler remains an implementation detail, not a second tool dialect.
const placements=['reference','at','rotationDeg'];
const sizes={widthMm:'width',heightMm:'height'};
const paints=['fontFamily','fontSizePt','fill','stroke','opacity','strokeWidthMm'];
const oldKeys=[...placements,...Object.keys(sizes),...paints,'text'];
export function publicRecipeParameters(parameters){
 const p=structuredClone(parameters),place={},size={},style={};
 for(const key of placements)if(key in p){place[key]=p[key];delete p[key];}
 for(const [key,dest] of Object.entries(sizes))if(key in p){size[dest]=p[key];delete p[key];}
 for(const key of paints)if(key in p){style[key]=p[key];delete p[key];}
 if(Object.keys(place).length)p.place={reference:'page',at:[70,70],unit:'mm',...place};
 if(Object.keys(size).length)p.size={...size,unit:'mm'};
 if(Object.keys(style).length)p.style={...style,...p.style};
 if('text' in p){p.content=p.text;delete p.text;}
 if(p.runs)p.runs=p.runs.map(({text,fontFamily,...run})=>({content:text,...run,...(fontFamily?{style:{...run.style,fontFamily}}:{})}));
 return p;
}
export function internalRecipeParameters(parameters,{title=false}={}){
 const p=structuredClone(parameters);
 const obsolete=oldKeys.find(key=>key in p);
 if(obsolete)throw Error('技巧参数统一使用 place / size / style / content；不支持顶层 '+obsolete);
 const placement=p.place?structuredClone(p.place):undefined;delete p.place;
 if(p.size){
  p.size.unit??='mm';
  if(p.size.unit!=='mm'||Object.keys(p.size).some(key=>!['width','height','unit'].includes(key)))throw Error('技巧 size 使用 {width?,height?,unit:"mm"}，省略 unit 默认为 mm');
  for(const [key,dest] of Object.entries(sizes))if(dest in p.size)p[key]=p.size[dest];
  delete p.size;
 }
 if(title&&p.style){
  for(const key of ['fontFamily','fontSizePt'])if(p.style[key]!==undefined)p[key]=p.style[key];
 }
 if(p.style&&!title){
  if(Object.keys(p.style).some(key=>!paints.includes(key)))throw Error('本技巧 style 仅支持字体、字号、填色、透明度与线宽；标题技巧支持完整文字样式');
  if(p.style.stroke!==undefined){
   if(typeof p.style.stroke!=='string'||!/^#[\da-f]{6}$/i.test(p.style.stroke))throw Error('技巧 style.stroke 必须是六位 HEX 色值');
   p.colors=[p.style.stroke,...(p.colors||[]).slice(1)];
   delete p.style.stroke;
  }
  Object.assign(p,p.style);delete p.style;
 }
 if('content' in p){p.text=p.content;delete p.content;}
 if(p.runs)p.runs=p.runs.map(({content,...run})=>({text:content,...run}));
 if(placement){
  if(Array.isArray(placement.at)){placement.reference??='page';placement.unit??='mm';}
  if(placement.offset?.value)placement.offset.unit??='mm';
  if(placement.reference)p.reference=placement.reference;
  p.at=placement.unit==='mm'&&placement.at?placement.at:[0,0];
 }
 return {parameters:p,placement};
}
export function publicRecipeDescription(method){
 const result=structuredClone(method),fields=result.parameters||{},out={};
 for(const [key,value] of Object.entries(fields)){
  if(placements.includes(key)){out.place??={description:'与普通编辑相同的 place：reference、at、unit、anchor、rotationDeg；按当前图定位整个技巧组。',required:false};out.place.required||=value.required;continue;}
  if(key in sizes){out.size??={description:'与普通编辑相同的 size：width / height 与 unit:"mm"，表示生成内容的范围，不缩放实体素材。',required:false};out.size.required||=value.required;continue;}
  if(paints.includes(key)){out.style??={description:'与普通编辑相同的 style：fontFamily、fontSizePt、fill、stroke、opacity、strokeWidthMm；只使用该技巧支持的属性。',required:false};continue;}
  out[key==='text'?'content':key]=value;
 }
 if(out.runs)out.runs={...out.runs,description:'词组数组 [{content,role?,style?,breakBefore?,rotationDeg?,offsetMm?,backdrop?}]；content 拼接等于完整 content，字体字号统一放 style。'};
 if(titleStyleRequired(fields))out.style={...out.style,description:'文字 style 与 text.add 相同；fontFamily/fontSizePt/color 控制字体、字号、字色，outline/gradient/shadow 等为可选效果。'};
 result.parameters=out;
 if(result.defaults)result.defaults=publicRecipeParameters(result.defaults);
 if(result.tool?.arguments){
  const original=result.tool.arguments;
  result.tool={name:'creation_apply',arguments:{transactionId:original.transactionId||'unique-id',baseSceneRevision:'current',operations:[{op:'recipe',methodId:original.methodId,params:publicRecipeParameters(original.parameters)}]}};
 }
 if(result.parameterKeys)result.parameterKeys=[...new Set(result.parameterKeys.map(key=>placements.includes(key)?'place':key in sizes?'size':paints.includes(key)?'style':key==='text'?'content':key))];
 return result;
}

function titleStyleRequired(fields){return Boolean(fields.style);}
