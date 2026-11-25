// Expand a sparse public update against the current Scene, not a remembered
// model call. Arrays replace as a whole; null only clears nullable fields.
import Ajv2020 from 'ajv/dist/2020.js';
import {selfContainedCreationSchema} from './creation-v2-contract.js';
import {creationReferenceBox,creationPlacementBox} from './creation-placement.js';
import {spatialPath,worldBox} from './scene-spatial.js';
const ajv=new Ajv2020({strict:false,allErrors:true});
const checks=Object.fromEntries(['Place','Size','Style','GraphicGeometry'].map(name=>[name,ajv.compile(selfContainedCreationSchema({$ref:'#/$defs/'+name}))]));
const merge=(base,patch)=>Object.fromEntries(Object.entries({...base,...patch}).map(([key,value])=>[key,value&&typeof value==='object'&&!Array.isArray(value)&&base?.[key]&&typeof base[key]==='object'&&!Array.isArray(base[key])?merge(base[key],value):structuredClone(value)]));
const rotate=(x,y,degrees)=>{const a=degrees*Math.PI/180;return [x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];};
const anchors={'top-left':[0,0],'top-center':[.5,0],'top-right':[1,0],'middle-left':[0,.5],center:[.5,.5],'middle-right':[1,.5],'bottom-left':[0,1],'bottom-center':[.5,1],'bottom-right':[1,1]};
function currentPlace(page,node,patch,parent){
 if(node.layoutConstraint?.place)return structuredClone(node.layoutConstraint.place);
 const box=creationPlacementBox(page,node.id),s=page.canvas.height/page.physicalPageHeightMM;
 const base={reference:patch.reference||'page',unit:patch.unit||'mm',anchor:patch.anchor||'center',axes:patch.axes||'reference'};
 const ref=creationReferenceBox(page,base.reference,parent),a=anchors[base.anchor];
 const [ax,ay]=rotate((a[0]-.5)*box.w,(a[1]-.5)*box.h,box.rotation);
 let x=box.cx+ax-ref.cx,y=box.cy+ay-ref.cy,w=ref.w,h=ref.h;
 if(base.axes==='reference')[x,y]=rotate(x,y,-ref.rotation);
 else {const r=ref.rotation*Math.PI/180;w=Math.abs(ref.w*Math.cos(r))+Math.abs(ref.h*Math.sin(r));h=Math.abs(ref.w*Math.sin(r))+Math.abs(ref.h*Math.cos(r));}
 base.at=base.unit==='ratio'?[x/w+.5,y/h+.5]:[(x+w/2)/s,(y+h/2)/s];
 return base;
}
function currentEffects(node,s){
 const outline=node.type==='text'?node.textOutline:node.graphicOutline;
 return {
  ...(outline?{outline:{color:outline.color,widthMm:outline.width/s,offsetMm:[outline.offsetX/s,outline.offsetY/s]}}:{}),
  ...((node.type==='text'?node.textGradient:node.graphicGradient)?{gradient:structuredClone(node.type==='text'?node.textGradient:node.graphicGradient)}:{}),
  ...(node.shadow?{shadow:{color:node.shadow.color,offsetMm:[node.shadow.offsetX/s,node.shadow.offsetY/s],blurMm:node.shadow.blur/s}}:{}),
  ...(node.paperSurface?{paperSurface:Object.fromEntries(Object.entries(node.paperSurface).filter(([key])=>key!=='unitScale'))}:{})
 };
}
export function expandCreationUpdate(page,id,change){
 const path=spatialPath(page.layers,id);if(!path)throw Error('图层不存在：'+id);
 const node=path.node,parent=path.ancestors.at(-1)?.id,s=page.canvas.height/page.physicalPageHeightMM,out=structuredClone(change);
 if(change.place){
  if('referenceAnchor' in change.place&&'unit' in change.place)throw Error('referenceAnchor 定位不接收 unit');
  const place=merge(currentPlace(page,node,change.place,parent),change.place);
  if('referenceAnchor' in change.place){delete place.at;delete place.unit;}
  else if('at' in change.place){delete place.referenceAnchor;place.unit??='mm';}
  out.place=place;
 }
 if(change.size){
  const previous=node.layoutConstraint?.size;
  out.size=merge(previous||{unit:'mm'},change.size);
  if(out.size.aspect==='preserve'){
   if('width' in change.size&&!('height' in change.size))delete out.size.height;
   if('height' in change.size&&!('width' in change.size))delete out.size.width;
  }
  // Text height is reflowed from content; physical materials still cannot scale.
  // Explicit preserve retains proportional resizing; free changes one axis only.
  if(['shape','ink'].includes(node.type)&&out.size.aspect!=='preserve'){
   const box=worldBox(page,node.id);
   const ref=out.size.unit==='ratio'?creationReferenceBox(page,out.size.reference,parent):null;
   out.size.width??=ref?box.w/ref.w:box.w/s;
   out.size.height??=ref?box.h/ref.h:box.h/s;
  }
 }
 if(change.style){
  const existing=currentEffects(node,s);out.style={...change.style};
  for(const key of ['outline','gradient','shadow','paperSurface'])if(change.style[key]&&existing[key])out.style[key]=merge(existing[key],change.style[key]);
 }
 if(change.geometry&&!change.geometry.kind){
  if(node.type!=='shape'||node.svgPaths)throw Error('省略 geometry.kind 只适用于当前预设图形');
  out.geometry={...change.geometry,kind:node.kind==='rectangle'?'rect':node.kind};
 }
 for(const [key,name] of [['place','Place'],['size','Size'],['style','Style'],['geometry','GraphicGeometry']])if(out[key]&&!checks[name](out[key]))throw Error('更新 '+key+' 后参数不完整或无效：'+ajv.errorsText(checks[name].errors));
 return out;
}
