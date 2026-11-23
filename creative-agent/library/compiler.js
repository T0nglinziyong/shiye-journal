import {templateCatalog,scoreTemplate} from './matcher.js';
import {isTextSlot,isGraphicElement,resolveTemplateStyle,templatePalette} from './template-elements.js';
import {fitTemplateText} from './template-text.js';
const validID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
export function libraryID(id){if(!validID.test(id))throw Error('组合编号无效');return id;}
export function compileTemplate({templateId,id,paper,materials=[],bindings,texts={},textStyles={},title='',reference='page',nodes=[],colors={},omit=[]}){
 libraryID(id);const template=templateCatalog.templates.find(t=>t.id===templateId);if(!template)throw Error('未知模板');
 if(!paper||![paper.width,paper.height].every(n=>Number.isFinite(n)&&n>0))throw Error('纸张尺寸无效');
 const palette=templatePalette(template,colors),resolve=value=>resolveTemplateStyle(value,palette);
 if(!Array.isArray(omit)||new Set(omit).size!==omit.length||omit.some(key=>!template.elements.some(s=>s.id===key)))throw Error('省略位置无效');
 if(bindings!==undefined&&!Array.isArray(bindings))throw Error('绑定格式无效');
 const match=scoreTemplate({...template,elements:template.elements.filter(e=>!omit.includes(e.id))},materials,paper),assignment=bindings??match.assignments;
 const bound=new Map(),seenSources=new Set(),children=[],existing=[],used=[],ordered=[],rendered=[],textLayout=[],slotResults=[];
 const basePaper=template.example?.paper||{width:148,height:148/template.aspect},typeScale=Math.min(paper.width/basePaper.width,paper.height/basePaper.height);
 for(const b of assignment){
  const slot=template.elements.find(e=>e.id===b.slotId);if(!slot||bound.has(b.slotId)||omit.includes(b.slotId)||(isGraphicElement(slot)&&!isTextSlot(slot)))throw Error('模板位置无效或重复');
  if(Boolean(b.alias)===Boolean(b.node))throw Error('模板位置只能指定素材或已有组合之一');
  const key=b.alias||b.node;if(seenSources.has(key))throw Error('同一实体或组合不能重复分配');seenSources.add(key);
  if(b.alias&&!materials.some(m=>m.alias===b.alias||m.id===b.alias))throw Error('素材不在本次授权范围');
  if(b.node&&!nodes.some(n=>n.id===b.node||n.alias===b.node))throw Error('已有组合不存在');
  bound.set(b.slotId,b);
 }
 for(const key of Object.keys(texts))if(!template.elements.some(s=>s.id===key&&isTextSlot(s)))throw Error('文字位置不存在');
 if(!textStyles||Array.isArray(textStyles)||typeof textStyles!=='object')throw Error('文字样式格式无效');
 for(const [key,style] of Object.entries(textStyles)){
  if(!template.elements.some(s=>s.id===key&&isTextSlot(s)))throw Error('文字位置不存在');
  if(!style||Array.isArray(style)||typeof style!=='object'||Object.keys(style).some(k=>!['fontSizePt','fontFamily','textAlign','lineHeight'].includes(k)))throw Error('文字样式参数无效');
  if(style.fontSizePt!==undefined&&(!Number.isFinite(style.fontSizePt)||style.fontSizePt<6||style.fontSizePt>120)||style.lineHeight!==undefined&&(!Number.isFinite(style.lineHeight)||style.lineHeight<1||style.lineHeight>3)||style.textAlign!==undefined&&!['left','center','right'].includes(style.textAlign)||style.fontFamily!==undefined&&(typeof style.fontFamily!=='string'||!style.fontFamily||style.fontFamily.length>120))throw Error('文字样式值无效');
 }
 for(const key of Object.keys(texts))if(bound.has(key))throw Error('同一位置不能同时绑定素材或组合并提供文字');
 const contentPresent=new Set([...bound.keys(),...Object.keys(texts).filter(key=>texts[key]&&!omit.includes(key))]);
 const titleSlot=template.elements.find(s=>s.id===template.primaryTitle&&isTextSlot(s));
 const titleTarget=titleSlot&&!omit.includes(titleSlot.id)&&!bound.has(titleSlot.id)&&!Object.hasOwn(texts,titleSlot.id)?titleSlot:null;
 if(title&&titleTarget)contentPresent.add(titleTarget.id);
 for(const slot of template.elements)if(slot.contentFor&&!template.elements.some(s=>s.id===slot.contentFor&&(isTextSlot(s)||!isGraphicElement(s))))throw Error('模板装饰引用的内容位置无效');
 for(const slot of template.elements){
  if(omit.includes(slot.id)||slot.contentFor&&!contentPresent.has(slot.contentFor)){slotResults.push({slotId:slot.id,status:'blank',reason:omit.includes(slot.id)?'omitted':'content-missing'});continue;}
  const [x,y,w,h]=slot.box,childId=id+'-'+slot.id;
  const place={reference:'parent',at:[(x+w/2)*paper.width,(y+h/2)*paper.height],unit:'mm',rotationDeg:slot.rotation||0};
  const b=bound.get(slot.id);
  if(b){
   if(b.alias){children.push({op:'material.add',id:childId,asset:b.alias,place});used.push(b.alias);ordered.push(childId);}
   else {existing.push({target:b.node,place});ordered.push(b.node);}
  }else if(isTextSlot(slot)&&(texts[slot.id]||(slot.id===titleTarget?.id&&title))){
   const content=texts[slot.id]||title;
   const style=resolve(isGraphicElement(slot)?slot.render.textStyle||{}:slot.render?.style||{}),[tx,ty,tw,th]=slot.render?.textBox||slot.box;
   const preferred={fontFamily:'Xiaolai',fontSizePt:slot.role==='title'?20:11,color:'#394F4C',...style,...textStyles[slot.id]};
   const fitted=fitTemplateText(content,preferred,tw*paper.width,th*paper.height,textStyles[slot.id]?.fontSizePt===undefined?typeScale:1,slot.render?.maxLines);
   textLayout.push({slotId:slot.id,...fitted.report});
   let at=[tx*paper.width,ty*paper.height];
   if(isGraphicElement(slot)&&slot.render.textRotation===undefined&&place.rotationDeg){
    const angle=place.rotationDeg*Math.PI/180,dx=at[0]-place.at[0],dy=at[1]-place.at[1];
    at=[place.at[0]+dx*Math.cos(angle)-dy*Math.sin(angle),place.at[1]+dx*Math.sin(angle)+dy*Math.cos(angle)];
   }
   children.push({op:'text.add',id:childId,content,place:{...place,at,rotationDeg:slot.render?.textRotation??place.rotationDeg,anchor:'top-left'},size:{width:tw*paper.width,unit:'mm'},style:fitted.style});ordered.push(childId);
  }else if(isGraphicElement(slot)){
   children.push({op:'graphic.add',id:childId,geometry:structuredClone(slot.render.geometry),place,size:{width:w*paper.width,height:h*paper.height,unit:'mm'},style:resolve(slot.render.style||{})});ordered.push(childId);
  }else {slotResults.push({slotId:slot.id,status:'blank',reason:'unassigned'});continue;}
  rendered.push(slot.id);
  slotResults.push({slotId:slot.id,status:b?.alias?'material':b?.node?'existing-group':children.at(-1)?.op==='text.add'?'text':isTextSlot(slot)?'writing-guide':'digital-graphic',...(b?{source:b.alias||b.node}:{}),nodeId:b?.node||childId});
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
 return {operations,report:{templateId,groupId:children.length||existing.length>1?id:existing[0].target,assignmentMode:bindings===undefined?'auto':'explicit',match,used,slots:slotResults,textLayout,warnings:[...textLayout.filter(t=>t.overflow).map(t=>({slotId:t.slotId,reason:'文字超出区域，请缩短文字或扩大区域；未截字'})),...(title&&!titleTarget?[{reason:'主标题位置缺失、已占用或已省略；title 未放置，请用 texts 指定其他文字位置'}]:[])],renderedElements:rendered,missingElements:template.elements.filter(e=>!rendered.includes(e.id)).map(e=>e.id),reconstruction:template.reconstruction?.status||'structure-only',omitted:materials.filter(m=>!used.includes(m.alias||m.id)).map(m=>m.alias||m.id),note:'保留真实毫米尺寸；显式绑定只放指定素材，缺失素材留空，不生成替代卡片。数字底形与书写线可用 omit 省略。文字有有限字号适配，溢出会报告；请检查真实预览中的叠压。'}};
}
