// No Scene, filesystem, image fetching, SVG DOM importer or model request here.
import Ajv2020 from 'ajv/dist/2020.js';
import rough from 'roughjs';
import paper from 'paper/dist/paper-core.js';
import {getStroke} from 'perfect-freehand';
import {graphicsRequestSchema,graphicsOptionKeys,graphicsLimits} from './graphics-contract.js';
import {shapeSVG} from './editor-tools-model.js';
import {physicalSVGPath} from './svg-paint-geometry.js';
const validate=new Ajv2020({strict:false,allErrors:true}).compile(graphicsRequestSchema);
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const fmt=v=>Math.round(v*1e6)/1e6;
const children=p=>p.children?.length?p.children.flatMap(children):[p];
const count=p=>children(p).reduce((n,c)=>n+(c.segments?.length||0),0);
const closed=p=>children(p).every(c=>c.closed);
function pathCheck(d){
 if(d.length>graphicsLimits.pathCharacters)fail('GRAPHICS_LIMIT','输入路径过长');
 const normalized=physicalSVGPath(d);
 if((normalized.match(/[MLCQZ]/g)||[]).length>graphicsLimits.inputSegments)fail('GRAPHICS_LIMIT','输入路径节点过多');
 if((normalized.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[]).some(n=>Math.abs(+n)>100000))fail('GRAPHICS_LIMIT','路径坐标超出预算');
 return normalized;
}
function paint(base,local={}){return {fill:local.fill===undefined?(base.fill??null):local.fill,stroke:local.stroke===undefined?(base.stroke===undefined?'#546E7A':base.stroke):local.stroke,strokeWidthMm:base.strokeWidthMm??.4,opacity:(base.opacity??1)*(local.opacity??1)};}
function inputPaths(scope,g,w,h,style){
 let paths=[];
 if(g.kind==='path'){
  const [x,y,vw,vh]=g.viewBox;
  paths=g.paths.map(p=>({d:physicalSVGPath(pathCheck(p.d),{sx:w/vw,sy:h/vh,tx:-x*w/vw,ty:-y*h/vh}),fillRule:p.fillRule||'nonzero',style:paint(style,p.style)}));
 }else if(g.kind==='stroke'){
  if(g.points.length>graphicsLimits.inputSegments)fail('GRAPHICS_LIMIT','输入压力点过多');
  // Stroke points are actual local millimetres, never secretly stretched to size.
  paths=[{d:g.points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' '),fillRule:'nonzero',style:paint(style,{fill:null})}];
 }else{
  if(['grid','dots','stripes'].includes(g.kind))fail('GRAPHICS_GEOMETRY','重复纹样请用普通 graphic.add；手绘计算使用单个轮廓或 path');
  // Only parse our own trusted preset geometry, not user SVG/XML.
  const svg=shapeSVG({id:'geometry',kind:g.kind==='rect'?'rectangle':g.kind,width:w,height:h,fill:'#000000',stroke:null,lineWidth:0});
  const box=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number),sx=w/box[2],sy=h/box[3];
  for(const match of svg.matchAll(/<(path|rect|ellipse|circle)\b([^>]*?)(?:\/>|>)/g)){
   const [,tag,a]=match,attr=k=>a.match(new RegExp('(?:^|\\s)'+k+'="([^\"]*)"'))?.[1],n=(k,f=0)=>Number(attr(k)??f);let p;
   if(tag==='path')p=scope.PathItem.create(physicalSVGPath(pathCheck(attr('d')),{sx,sy}));
   if(tag==='rect')p=new scope.Path.Rectangle({rectangle:[n('x')*sx,n('y')*sy,n('width')*sx,n('height')*sy],radius:[n('rx')*sx,n('rx')*sy]});
   if(tag==='ellipse'||tag==='circle')p=new scope.Path.Ellipse({center:[n('cx')*sx,n('cy')*sy],radius:[n('rx',n('r'))*sx,n('ry',n('r'))*sy]});
   if(p)paths.push({item:p,d:p.pathData,fillRule:attr('fill-rule')||'nonzero',style:paint(style,attr('fill')==='none'?{fill:null}:{})});
  }
 }
 if(!paths.length||paths.length>graphicsLimits.outputPaths)fail('GRAPHICS_GEOMETRY','没有可计算的轮廓');
 let total=0;
 return paths.map(row=>{
  row.item??=scope.PathItem.create(pathCheck(row.d));row.item.fillRule=row.fillRule;total+=count(row.item);
  const b=row.item.bounds;if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||Math.max(Math.abs(b.x),Math.abs(b.y),b.width,b.height)>2000)fail('GRAPHICS_LIMIT','毫米几何范围过大');
  if(total>graphicsLimits.inputSegments)fail('GRAPHICS_LIMIT','输入总节点过多');return row;
 });
}
function validOptions(q){
 if(!validate(q))fail('GRAPHICS_REQUEST',validate.errors.map(e=>e.instancePath+' '+e.message).join('; '));
 const allowed=graphicsOptionKeys[q.operation];for(const key of Object.keys(q.options||{}))if(!allowed.includes(key))fail('GRAPHICS_OPTION','此计算不接受 options.'+key);
 if(q.operation==='rough'&&!q.seed)fail('GRAPHICS_SEED','手绘计算必须提供固定 seed');
 if(q.operation==='boolean'&&!q.operand)fail('GRAPHICS_OPERAND','布尔计算需要 operand');
 if(q.operation!=='boolean'&&q.operand)fail('GRAPHICS_OPERAND','operand 只适用于 boolean');
 if(q.operation!=='rough'&&q.seed!==undefined)fail('GRAPHICS_SEED','seed 只适用于 rough');
 if(q.operation==='smooth'&&q.options?.factor!==undefined&&q.options?.method!=='catmull-rom')fail('GRAPHICS_OPTION','factor 只适用于 catmull-rom 平滑');
 if(q.operation==='stroke'&&q.geometry.kind!=='stroke')fail('GRAPHICS_GEOMETRY','压力轮廓需要 stroke 几何');
}
const xml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function computeGraphics(request){
 if(new TextEncoder().encode(JSON.stringify(request)).length>graphicsLimits.requestBytes)fail('GRAPHICS_LIMIT','请求超过预算');
 validOptions(request);const q=structuredClone(request),scope=new paper.PaperScope();scope.setup(new scope.Size(600,600));
 try{
  const {width:w,height:h}=q.size,style=q.style||{},options=q.options||{},rows=inputPaths(scope,q.geometry,w,h,style);let result=[];
  if(q.operation==='measure')return {version:1,operation:q.operation,unit:'mm',readOnly:true,paths:[],operations:[],measurements:rows.map(r=>({bounds:[r.item.bounds.x,r.item.bounds.y,r.item.bounds.width,r.item.bounds.height].map(fmt),lengthMm:fmt(r.item.length||children(r.item).reduce((n,c)=>n+c.length,0)),areaMm2:closed(r.item)?fmt(Math.abs(r.item.area)):null,closed:closed(r.item),segments:count(r.item)}))};
  if(q.operation==='rough'){
   const gen=rough.generator();
   for(const [i,r] of rows.entries()){
    const p=r.style,drawable=gen.path(r.d,{seed:1+(q.seed+i-1)%2147483646,roughness:options.roughness??1,bowing:options.bowing??1,stroke:p.stroke||'none',strokeWidth:p.strokeWidthMm,fill:p.fill||undefined,fillStyle:options.fillStyle||'hachure',hachureGap:options.hachureGapMm??2,hachureAngle:options.hachureAngle??-41,fillWeight:options.fillWeightMm??.2});
    for(const path of gen.toPaths(drawable))result.push({d:path.d,fillRule:r.fillRule,style:{fill:path.fill==='none'?null:path.fill||null,stroke:path.stroke==='none'?null:path.stroke||null,strokeWidthMm:path.strokeWidth||p.strokeWidthMm,opacity:p.opacity}});
   }
  }else if(q.operation==='boolean'){
   const other=inputPaths(scope,q.operand,w,h,style);
   if(rows.length!==1||other.length!==1||!closed(rows[0].item)||!closed(other[0].item))fail('GRAPHICS_CLOSED','布尔计算双方须为单个闭合路径或含孔复合路径');
   const output=rows[0].item[options.mode||'unite'](other[0].item,{insert:false});
   if(Math.abs(output.area)>1e-8)result=[{d:output.pathData,fillRule:'nonzero',style:paint(style)}];
  }else if(q.operation==='stroke'){
   const outline=getStroke(q.geometry.points.map(p=>[p.x,p.y,p.pressure??.5]),{size:style.strokeWidthMm??.4,thinning:options.thinning??.5,smoothing:options.smoothing??.5,streamline:options.streamline??.5,simulatePressure:!q.geometry.points.some(p=>p.pressure!==undefined),last:true});
   if(outline.length)result=[{d:outline.map((p,i)=>(i?'L':'M')+p.map(fmt).join(' ')).join(' ')+' Z',fillRule:'nonzero',style:{fill:style.stroke||'#546E7A',stroke:null,strokeWidthMm:0,opacity:style.opacity??1}}];
  }else{
   for(const r of rows){
    if(q.operation==='smooth')r.item.smooth({type:options.method||'continuous',...(options.factor===undefined?{}:{factor:options.factor})});
    // Paper simplify fits anchors, not original curves: flatten first to preserve curved input.
    if(q.operation==='simplify'){r.item.flatten((options.toleranceMm??.25)/2);if(count(r.item)>graphicsLimits.outputSegments)fail('GRAPHICS_LIMIT','采样节点超出预算');r.item.simplify((options.toleranceMm??.25)/2);}
    if(q.operation==='flatten')r.item.flatten(options.toleranceMm??.25);
    result.push({...r,d:r.item.pathData});
   }
  }
  if(result.length>graphicsLimits.outputPaths)fail('GRAPHICS_LIMIT','输出路径过多');
  let outputSegments=0,outputCharacters=0;
  const clean=[];
  for(const p of result.filter(p=>p.d?.trim())){
   const item=scope.PathItem.create(p.d),data=item.pathData;
   outputSegments+=count(item);outputCharacters+=data.length;
   if(outputSegments>graphicsLimits.outputSegments||outputCharacters>100000)fail('GRAPHICS_LIMIT','输出路径过于复杂，请增大容差或填充间距');
   // Rough emits full-precision coordinates and many independent stroke subpaths.
   // Budget the canonical SVG, then split ONLY unfilled strokes at subpath boundaries.
   // Filled compound paths stay intact so holes and winding rules cannot change.
   const pieces=data.length>8192&&!p.style.fill&&item.children?.length?item.children.map(c=>c.pathData):[data];
   let chunk='';
   const flush=()=>{if(chunk){clean.push({d:chunk,fillRule:p.fillRule||'nonzero',style:p.style});chunk='';}};
   for(const piece of pieces){
    if(piece.length>8192)fail('GRAPHICS_LIMIT','输出路径过于复杂，请增大容差或填充间距');
    if(chunk.length+piece.length+1>8192)flush();chunk+=(chunk?' ':'')+piece;
   }
   flush();if(clean.length>graphicsLimits.outputPaths)fail('GRAPHICS_LIMIT','输出路径过多');
  }
  const id=q.id||'graphic-result',operations=[];
  // One child per paint width preserves Rough.js hatch vs outline widths.
  const kids=clean.map((p,i)=>({op:'graphic.add',id:id+'-'+(i+1),geometry:{kind:'path',viewBox:[0,0,w,h],paths:[{d:p.d,fillRule:p.fillRule}]},size:{width:w,height:h,unit:'mm'},place:{reference:'parent',at:[w/2,h/2],unit:'mm'},style:p.style}));
  if(kids.length)operations.push({op:'group.compose',id,layoutBox:{width:w,height:h,unit:'mm'},place:q.place||{reference:'page',at:[w/2,h/2],unit:'mm'},...(q.parent?{parent:q.parent}:{}),...(q.order?{order:q.order}:{}),children:kids});
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">${clean.map(p=>`<path d="${xml(p.d)}" fill="${p.style.fill||'none'}" stroke="${p.style.stroke||'none'}" stroke-width="${p.style.strokeWidthMm}" opacity="${p.style.opacity}" fill-rule="${p.fillRule}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
  return {version:1,operation:q.operation,readOnly:true,unit:'mm',nominalSize:q.size,paths:clean,operations,svg,empty:!clean.length,warnings:['手绘边界可略越过名义尺寸；实际排版需预览。','结果为数字路径，不证明识别图像语义或真实材料裁切。']};
 }finally{scope.project.remove();scope.remove();}
}
