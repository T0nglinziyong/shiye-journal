// One unit/geometry implementation for one-shot edits and persistent links.
import {creationReferenceBox} from './creation-placement.js';
import {resizeGraphicInk,inkLocalFrame} from './graphic-geometry.js';
import {reflowSceneText} from './scene-text-layout.js';
const scale=page=>page.canvas.height/page.physicalPageHeightMM;
export function dimension(page,size,key,parentID=null){
 const value=size?.[key];if(!(Number.isFinite(value)&&value>0))throw Error('size.'+key+' 必须是正数');
 if(size.unit==='mm')return value;
 if(size.unit==='ratio'){const ref=creationReferenceBox(page,size.reference,parentID);return value*(key==='width'?ref.w:ref.h)/scale(page);}
 throw Error('尺寸单位无效');
}
export function dimensions(page,size,{parentID=null,ratio=1}={}){
 let width=size.width===undefined?null:dimension(page,size,'width',parentID),height=size.height===undefined?null:dimension(page,size,'height',parentID);
 if(width===null&&height===null)throw Error('size 需要宽或高');
 if(size.aspect==='preserve'&&width!==null&&height!==null&&Math.abs(width/height-ratio)>1e-6)throw Error('保持宽高比与指定尺寸矛盾');
 if(width===null)width=height*ratio;if(height===null)height=width/ratio;return {width,height};
}
export function resizeDigitalNode(page,node,size,parentID=null,baseRatio){
 const s=scale(page);
 if(node.type==='text'){
  if(size.width!==undefined)node.width=dimension(page,size,'width',parentID)*s;
  reflowSceneText(node,size.height===undefined?{}:{minimumHeight:dimension(page,size,'height',parentID)*s});
 }else if(node.type==='shape'){
  const d=dimensions(page,size,{parentID,ratio:baseRatio??node.width/node.height});node.width=d.width*s;node.height=d.height*s;
 }else if(node.type==='ink'){
  const box=inkLocalFrame(node),ratio=baseRatio??box.width/box.height;
  const d=box.spanX>1e-9&&box.spanY>1e-9?dimensions(page,size,{parentID,ratio}):null;
  const width=d?d.width*s:size.width===undefined?box.width:dimension(page,size,'width',parentID)*s,height=d?d.height*s:size.height===undefined?box.height:dimension(page,size,'height',parentID)*s;
  if(size.aspect==='preserve'&&Math.abs(width/height-ratio)>1e-6)throw Error('保持宽高比与笔迹尺寸矛盾');
  resizeGraphicInk(node,width,height);
 }else throw Error('持续尺寸只支持文字、图形和笔迹，不能缩放实体素材或组合');
 const box=node.type==='ink'?inkLocalFrame(node):node;
 if(![box.width,box.height].every(v=>Number.isFinite(v)&&v>0&&v<=100000))throw Error('布局尺寸超出范围');
 return node;
}
