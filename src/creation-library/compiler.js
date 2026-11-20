import {templateCatalog,scoreTemplate} from './matcher.js';
import {isTextSlot,isGraphicElement,resolveTemplateStyle,templatePalette} from './template-elements.js';
const validID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
export function libraryID(id){if(!validID.test(id))throw Error('组合编号无效');return id;}
export function compileTemplate({templateId,id,paper,materials=[],bindings=[],texts={},title='',reference='page',nodes=[],colors={},omit=[]}){
 libraryID(id);const template=templateCatalog.templates.find(t=>t.id===templateId);if(!template)throw Error('未知模板');
 if(!paper||![paper.width,paper.height].every(n=>Number.isFinite(n)&&n>0))throw Error('纸张尺寸无效');
 const palette=templatePalette(template,colors),resolve=value=>resolveTemplateStyle(value,palette);
 if(!Array.isArray(omit)||new Set(omit).size!==omit.length||omit.some(key=>!template.elements.some(s=>s.id===key)))throw Error('省略位置无效');
 const match=scoreTemplate({...template,elements:template.elements.filter(e=>!omit.includes(e.id))},materials,paper),assignment=bindings.length?bindings:match.assignments;
 const bound=new Map(),seenSources=new Set(),children=[],existing=[],used=[],ordered=[],rendered=[];
 for(const b of assignment){
  const slot=template.elements.find(e=>e.id===b.slotId);if(!slot||bound.has(b.slotId)||omit.includes(b.slotId)||(isGraphicElement(slot)&&!isTextSlot(slot)))throw Error('模板位置无效或重复');
  if(Boolean(b.alias)===Boolean(b.node))throw Error('模板位置只能指定素材或已有组合之一');
  const key=b.alias||b.node;if(seenSources.has(key))throw Error('同一实体或组合不能重复分配');seenSources.add(key);
  if(b.alias&&!materials.some(m=>m.alias===b.alias||m.id===b.alias))throw Error('素材不在本次授权范围');
  if(b.node&&!nodes.some(n=>n.id===b.node||n.alias===b.node))throw Error('已有组合不存在');
  bound.set(b.slotId,b);
 }
 for(const key of Object.keys(texts))if(!template.elements.some(s=>s.id===key&&isTextSlot(s)))throw Error('文字位置不存在');
 const contentPresent=new Set([...bound.keys(),...Object.keys(texts).filter(key=>texts[key]&&!omit.includes(key))]);
 const firstTitle=template.elements.find(s=>s.role==='title'&&!omit.includes(s.id)&&!bound.has(s.id));
 if(title&&firstTitle)contentPresent.add(firstTitle.id);
 for(const slot of template.elements)if(slot.contentFor&&!template.elements.some(s=>s.id===slot.contentFor&&(isTextSlot(s)||!isGraphicElement(s))))throw Error('模板装饰引用的内容位置无效');
 let titleUsed=false;
 for(const slot of template.elements){
  if(omit.includes(slot.id)||slot.contentFor&&!contentPresent.has(slot.contentFor))continue;
  const [x,y,w,h]=slot.box,childId=id+'-'+slot.id;
  const place={reference:'parent',at:[(x+w/2)*paper.width,(y+h/2)*paper.height],unit:'mm',rotationDeg:slot.rotation||0};
  const b=bound.get(slot.id);
  if(b){
   if(b.alias){children.push({op:'material.add',id:childId,asset:b.alias,place});used.push(b.alias);ordered.push(childId);}
   else {existing.push({target:b.node,place});ordered.push(b.node);}
  }else if(isTextSlot(slot)&&(texts[slot.id]||(slot.role==='title'&&!titleUsed&&title))){
   const content=texts[slot.id]||title;if(slot.role==='title')titleUsed=true;
   const style=resolve(isGraphicElement(slot)?slot.render.textStyle||{}:slot.render?.style||{}),[tx,ty,tw]=slot.render?.textBox||slot.box;
   children.push({op:'text.add',id:childId,content,place:{...place,at:[tx*paper.width,ty*paper.height],rotationDeg:slot.render?.textRotation??place.rotationDeg,anchor:'top-left'},size:{width:tw*paper.width,unit:'mm'},style:{fontFamily:'Xiaolai',fontSizePt:slot.role==='title'?20:11,color:'#394F4C',...style}});ordered.push(childId);
  }else if(isGraphicElement(slot)){
   children.push({op:'graphic.add',id:childId,geometry:structuredClone(slot.render.geometry),place,size:{width:w*paper.width,height:h*paper.height,unit:'mm'},style:resolve(slot.render.style||{})});ordered.push(childId);
  }else continue;
  rendered.push(slot.id);
 }
 const operations=[];
 if(children.length){
  operations.push({op:'group.compose',id,layoutBox:{width:paper.width,height:paper.height,unit:'mm'},place:{reference,at:[0,0],unit:'mm',anchor:'top-left'},children});
  for(const e of existing)operations.push({op:'layer.reparent',target:e.target,parent:id,preserveWorld:true},{op:'layer.update',target:e.target,place:{...e.place,reference:'node:'+id}});
  if(existing.length)for(let i=1;i<ordered.length;i++)operations.push({op:'layer.update',target:ordered[i],order:{after:ordered[i-1]}});
 }else if(existing.length){
  for(const e of existing)operations.push({op:'layer.update',target:e.target,place:{...e.place,reference}});
  if(existing.length>1)operations.push({op:'group.create',id,targets:existing.map(e=>e.target)});
 }else throw Error('没有可放置的素材或文字；缺失位置不会生成占位物');
 return {operations,report:{templateId,groupId:children.length||existing.length>1?id:existing[0].target,match,used,renderedElements:rendered,missingElements:template.elements.filter(e=>!rendered.includes(e.id)).map(e=>e.id),reconstruction:template.reconstruction?.status||'structure-only',omitted:materials.filter(m=>!used.includes(m.alias||m.id)).map(m=>m.alias||m.id),note:'保留真实毫米尺寸；缺失素材留空，数字图形可编辑。请检查预览中的叠压和长文。'}};
}
