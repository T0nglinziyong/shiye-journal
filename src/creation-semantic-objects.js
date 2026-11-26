import {compileTitle} from '../creative-agent/library/title.js';
export function compileTitleOperations({titles}){
 return titles.map(({place,order,layout='plain',effect='none',accentColor='#F5EDDA',content,size,style,runs,...parameters})=>{
  style={fontSizePt:26,color:'#354C60',...style};
  const color=style.color;
  if(layout!=='curve'&&parameters.curveHeightMm!==undefined)throw Error('curveHeightMm 仅用于 curve 布局');
  const effects={none:{},outline:{outline:{color:accentColor,widthMm:.35,offsetMm:[0,0]}},hollow:{fillOpacity:0,outline:{color,widthMm:.35,offsetMm:[0,0]}},'offset-outline':{outline:{color:accentColor,widthMm:.4,offsetMm:[.6,.7]}},'gradient-outline':{gradient:{angleDeg:90,stops:[{offset:0,color:accentColor},{offset:1,color}]},outline:{color,widthMm:.3,offsetMm:[0,0]}},shadow:{shadow:{color:accentColor,offsetMm:[.8,.9],blurMm:0}}};
  let title;
  try { title=compileTitle({...parameters,text:content,widthMm:size.width,runs:runs?.map(({content,...run})=>({text:content,...run})),treatment:layout,colors:[color,accentColor,accentColor],style:mergeObjectPatch(effects[effect],style)},{widthExplicit:true}); } catch(error) {
   // Report the public tool fields, not the internal title compiler aliases.
   error.message=error.message.replaceAll('widthMm','size.width').replaceAll('fontSizePt','style.fontSizePt');
   throw error;
  }
  return {op:'group.compose',id:parameters.id,layoutBox:{width:title.width,height:Math.max(title.height,size.height||0),unit:'mm'},place,order,children:title.children};
 });
}

export const mergeObjectPatch=(base,patch)=>Object.fromEntries(Object.entries({...base,...patch}).map(([key,value])=>[key,value&&typeof value==='object'&&!Array.isArray(value)&&base?.[key]&&typeof base[key]==='object'&&!Array.isArray(base[key])?mergeObjectPatch(base[key],value):structuredClone(value)]));
export function compilePaperObject({id,place,size,order,parent,style,texture='medium',edge={style:'clean'},pattern='plain',translucency=0,rows=8,columns=8}){
 return {op:'graphic.add',id,parent,place,size,order,geometry:{kind:'paper',options:{paperPattern:pattern,grain:{subtle:.3,medium:.65,rough:.9}[texture],torn:false,translucency,rows,columns}},style:{fill:style.fill,stroke:pattern==='plain'?null:style.stroke||'#A79F94',strokeWidthMm:style.strokeWidthMm??.15,strokeOpacity:.45,shadow:null,...style}};
}
