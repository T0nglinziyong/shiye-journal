export const isTextSlot=slot=>['title','text'].includes(slot.role);
export const isGraphicElement=slot=>slot.render?.kind==='graphic';
export const isMaterialSlot=slot=>!isTextSlot(slot)&&!isGraphicElement(slot);
export function resolveTemplateStyle(value,palette){
 if(typeof value==='string'&&value.startsWith('$')){
  const key=value.slice(1);if(!(key in palette))throw Error('模板配色不存在：'+key);return palette[key];
 }
 if(Array.isArray(value))return value.map(v=>resolveTemplateStyle(v,palette));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveTemplateStyle(v,palette)]));
 return value;
}
export function templatePalette(template,overrides={}){
 if(!overrides||Array.isArray(overrides)||typeof overrides!=='object')throw Error('模板配色格式无效');
 const palette={...template.palette};
 for(const [key,value] of Object.entries(overrides)){
  if(!(key in palette)||!/^#[0-9a-f]{6}$/i.test(value))throw Error('模板配色名称或颜色无效：'+key);palette[key]=value;
 }
 return palette;
}
export function templateFixture(template){
 const paper=template.example?.paper||{width:148,height:148/template.aspect};
 const materials=template.elements.filter(isMaterialSlot).map((slot,i)=>({id:'fixture-'+slot.id,alias:'m'+(i+1),title:'合成示意 '+slot.id,kind:slot.accepts[0],role:slot.role,physicalWidthMM:paper.width*slot.box[2],physicalHeightMM:paper.height*slot.box[3],supply:{quantity:1}}));
 const bindings=template.elements.filter(isMaterialSlot).map((slot,i)=>({slotId:slot.id,alias:materials[i].alias}));
 const texts={...(template.example?.texts||Object.fromEntries(template.elements.filter(isTextSlot).map(s=>[s.id,s.role==='title'?'日常小记':'留下一段小记'])))};
 return {paper,materials,bindings,texts};
}
