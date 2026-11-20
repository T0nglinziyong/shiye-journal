import {templateCatalog,scoreTemplate} from './matcher.js';
const validID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
export function libraryID(id){if(!validID.test(id))throw Error('组合编号无效');return id;}
export function compileTemplate({templateId,id,paper,materials=[],bindings=[],texts={},title='',reference='page',nodes=[]}){
 libraryID(id);const template=templateCatalog.templates.find(t=>t.id===templateId);if(!template)throw Error('未知模板');
 if(!paper||![paper.width,paper.height].every(n=>Number.isFinite(n)&&n>0))throw Error('纸张尺寸无效');
 const match=scoreTemplate(template,materials,paper),assignment=bindings.length?bindings:match.assignments;
 const seenSlots=new Set(),seenSources=new Set(),children=[],existing=[],used=[];
 for(const b of assignment){
  const slot=template.elements.find(e=>e.id===b.slotId);if(!slot||seenSlots.has(b.slotId))throw Error('模板位置无效或重复');seenSlots.add(b.slotId);
  if(Boolean(b.alias)===Boolean(b.node))throw Error('模板位置只能指定素材或已有组合之一');
  const key=b.alias||b.node;if(seenSources.has(key))throw Error('同一实体或组合不能重复分配');seenSources.add(key);
  const [x,y,w,h]=slot.box,place={reference:'parent',at:[(x+w/2)*paper.width,(y+h/2)*paper.height],unit:'mm',rotationDeg:slot.rotation||0};
  if(b.alias){if(!materials.some(m=>m.alias===b.alias||m.id===b.alias))throw Error('素材不在本次授权范围');children.push({op:'material.add',id:id+'-'+slot.id,asset:b.alias,place});used.push(b.alias);}
  else {if(!nodes.some(n=>n.id===b.node||n.alias===b.node))throw Error('已有组合不存在');existing.push({target:b.node,place});}
 }
 let titleUsed=false;
 for(const slot of template.elements){
  const content=texts[slot.id]||(slot.role==='title'&&!titleUsed?title:'');
  if(!content||seenSlots.has(slot.id)||!['text','title'].includes(slot.role))continue;
  if(slot.role==='title')titleUsed=true;
  const [x,y,w,h]=slot.box;
  children.push({op:'text.add',id:id+'-'+slot.id,content,place:{reference:'parent',at:[x*paper.width,y*paper.height],unit:'mm',anchor:'top-left'},size:{width:w*paper.width,unit:'mm'},style:{fontFamily:'Xiaolai',fontSizePt:slot.role==='title'?20:11,color:'#394F4C'}});
 }
 for(const key of Object.keys(texts))if(!template.elements.some(s=>s.id===key&&['text','title'].includes(s.role)))throw Error('文字位置不存在');
 const operations=[];
 if(children.length){
  operations.push({op:'group.compose',id,layoutBox:{width:paper.width,height:paper.height,unit:'mm'},place:{reference,at:[0,0],unit:'mm',anchor:'top-left'},children});
  for(const e of existing)operations.push({op:'layer.reparent',target:e.target,parent:id,preserveWorld:true},{op:'layer.update',target:e.target,place:{...e.place,reference:'node:'+id}});
 }else if(existing.length){
  for(const e of existing)operations.push({op:'layer.update',target:e.target,place:{...e.place,reference}});
  if(existing.length>1)operations.push({op:'group.create',id,targets:existing.map(e=>e.target)});
 }else throw Error('没有可放置的素材或文字；缺失位置不会生成占位物');
 return {operations,report:{templateId,groupId:children.length||existing.length>1?id:existing[0].target,match,used,omitted:materials.filter(m=>!used.includes(m.alias||m.id)).map(m=>m.alias||m.id),note:'保留真实毫米尺寸，缺失位置留空；请检查自动预览中的叠压和长文。'}};
}
