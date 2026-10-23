import {withGraphicEffects,graphicGradientID,graphicPaintFrame,hasGraphicEffects} from './graphic-effects.js';
import {journalFontFamily} from './journal-fonts.js';
import {textEffectInsets,textContentWidth,textFillStyle,paintTextGlyphs} from './text-effects.js';
import {traceSmoothInk} from './ink-path-geometry.js';
import {pressureInkOutline} from './pressure-ink.js';
export const defaultTools={penStyle:'fountain',penWidth:4,penColor:'#2b5245',markerWidth:4,markerColor:'#2b5245',markerStraight:false,eraserWidth:20,eraserStyle:'standard',eraserOnlyHighlighter:false,wholeStroke:true,returnToPen:false,pencil:true};
export const commonShapes=[['rectangle','色块'],['roundedRectangle','圆角色块'],['ellipse','圆形／椭圆'],['line','线条／下划线'],['frame','空心边框'],['star','星形'],['heart','爱心'],['raindrop','雨滴'],['cloud','云朵'],['sun','太阳'],['moon','月亮'],['flower','小花'],['leaf','树叶'],['sparkle','闪光'],['arrow','箭头'],['checkbox','勾选框'],['triangle','三角形'],['diamond','菱形'],['hexagon','六边形']];
export const advancedShapes=[['grid','方格'],['dots','点阵'],['stripes','条纹'],['ribbon','缎带'],['tag','标签'],['bubble','对话框'],['chevron','折角'],['burst','爆炸星'],['scallop','花边'],['wave','波浪线'],['zigzag','折线'],['ticket','票根'],['postage','邮票齿边'],['washi','手帐胶带'],['bracket','括号'],['vector','自由图形']];
const polygons={triangle:[[.5,.04],[.96,.95],[.04,.95]],diamond:[[.5,.03],[.97,.5],[.5,.97],[.03,.5]],hexagon:[[.25,.04],[.75,.04],[.98,.5],[.75,.96],[.25,.96],[.02,.5]],ribbon:[[.02,.1],[.98,.1],[.84,.5],[.98,.9],[.02,.9],[.16,.5]],tag:[[.03,.03],[.78,.03],[.98,.5],[.78,.97],[.03,.97]],bubble:[[.04,.05],[.96,.05],[.96,.72],[.47,.72],[.23,.97],[.25,.72],[.04,.72]],chevron:[[.03,.03],[.63,.03],[.98,.5],[.63,.97],[.03,.97],[.38,.5]],ticket:[[.04,.05],[.4,.05],[.5,.15],[.6,.05],[.96,.05],[.96,.95],[.6,.95],[.5,.85],[.4,.95],[.04,.95]],washi:[[.02,.05],[.10,.14],[.02,.23],[.10,.32],[.02,.41],[.10,.5],[.02,.59],[.10,.68],[.02,.77],[.10,.86],[.02,.95],[.98,.95],[.90,.86],[.98,.77],[.90,.68],[.98,.59],[.90,.5],[.98,.41],[.90,.32],[.98,.23],[.90,.14],[.98,.05]]};
const radial=(n,radii,offset=-Math.PI/2)=>Array.from({length:n},(_,i)=>{const a=offset+2*Math.PI*i/n,r=radii(i,a);return [.5+Math.cos(a)*r,.5+Math.sin(a)*r];});
const postageEdge=()=>{
 const pts=[],start=.08,end=.92,steps=18;
 for(let i=0;i<=steps;i++)pts.push([start+(end-start)*i/steps,i%2?.105:.05]);
 for(let i=1;i<=steps;i++)pts.push([i%2?.895:.95,start+(end-start)*i/steps]);
 for(let i=1;i<=steps;i++)pts.push([end-(end-start)*i/steps,i%2?.895:.95]);
 for(let i=1;i<steps;i++)pts.push([i%2?.105:.05,end-(end-start)*i/steps]);
 return pts;
};
export function shapePaths(kind){return polygons[kind]?[polygons[kind]]:kind==='star'?[radial(10,i=>i%2?.2:.47)]:kind==='burst'?[radial(32,i=>i%2?.35:.47)]:kind==='sparkle'?[radial(8,i=>i%2?.08:.47,Math.PI/4)]:kind==='sun'?[radial(32,i=>i%2?.36:.48)]:kind==='flower'?[radial(160,(_,a)=>.34+.13*Math.cos(a*6))]:kind==='postage'?[postageEdge()]:kind==='scallop'?[radial(160,(_,a)=>.43+.04*Math.cos(a*10))]:null;}
export function configureShape(shape,kind){Object.assign(shape,{kind,fill:['frame','line','checkbox','grid','dots','stripes'].includes(kind)?null:'#e7eef7',stroke:'#547da4',lineWidth:2,fillOpacity:1,strokeOpacity:1,strokeDash:'solid',opacity:1,width:150,height:105});const paths=shapePaths(kind);if(paths)shape.vectorPaths=paths;else if(kind==='vector')shape.vectorPaths=[[[.1,.1],[.9,.1],[.8,.9],[.2,.9]]];if(['ellipse','star','heart','raindrop','cloud','sun','moon','flower','leaf','sparkle','checkbox','triangle','diamond','hexagon','burst','postage'].includes(kind))shape.width=shape.height=100;if(kind==='line')shape.height=12;if(['ribbon','tag','chevron','ticket','washi','wave','zigzag','bracket'].includes(kind))shape.height=55;return shape;}
// Geometry and stroke semantics are shared by thumbnails, Fabric and export.
function baseShapeSVG(s){
 const safe=v=>String(v).replace(/["<>&]/g,'');
 const stroke=safe(s.stroke||'none'),fill=safe(s.fill||'none'),sw=Math.max(0,s.lineWidth??2)/Math.max(1,s.width||100,s.height||100),fillOpacity=Math.max(0,Math.min(1,s.fillOpacity??1)),strokeOpacity=Math.max(0,Math.min(1,s.strokeOpacity??1));let geometry='',dash=['dash','dot'].includes(s.strokeDash)?s.strokeDash:null,strokeDashes=dash?(dash==='dot'?`${sw} ${sw*2.5}`:`${sw*5} ${sw*3}`):null;
 if(Array.isArray(s.svgPaths)){
  const [x,y,w,h]=s.svgViewBox||[0,0,1,1];
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0||s.svgPaths.length>64)throw Error('SVG 路径边界无效');
  const paths=s.svgPaths.map(path=>{
   if(typeof path.d!=='string'||path.d.length>8192||!/^[MmLlHhVvCcSsQqTtAaZz0-9+eE.,\s-]+$/.test(path.d))throw Error('SVG 路径包含不支持的字符');
   const pathFill=safe((Object.hasOwn(path,'fill')?path.fill:s.fill)??'none'),pathStroke=safe((Object.hasOwn(path,'stroke')?path.stroke:s.stroke)??'none');
   return '<path d="'+path.d+'" fill="'+pathFill+'" stroke="'+pathStroke+'" fill-rule="'+(path.fillRule==='evenodd'?'evenodd':'nonzero')+'" stroke-width="'+Math.max(0,(s.lineWidth??2)*w/Math.max(1,s.width))+'" opacity="'+Math.max(0,Math.min(1,path.opacity??1))+'"/>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[x,y,w,h].join(' ')+'" preserveAspectRatio="none" style="width:100%;height:100%">'+paths+'</svg>';
 }
 if(Array.isArray(s.vectorLayers)){
  const geometry=s.vectorLayers.map(layer=>{const rectangles=(layer.rects||[]).filter(r=>Array.isArray(r)&&r.length===4&&r.every(Number.isFinite)&&r[2]>0&&r[3]>0).map(([x,y,w,h])=>'M'+x+' '+y+'h'+w+'v'+h+'h-'+w+'Z').join(' '),freeform=(layer.paths||[]).filter(Array.isArray).map(path=>{const points=path.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));return points.length?points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')+' Z':'';}).join(' '),data=[rectangles,freeform].filter(Boolean).join(' ');return data?'<path fill-rule="evenodd" fill="'+safe(layer.fill||'none')+'" stroke="none" opacity="'+Math.max(0,Math.min(1,layer.opacity??1))+'" d="'+data+'"/>':'';}).join('');
  const size=Array.isArray(s.vectorSize)&&s.vectorSize.length===2&&s.vectorSize.every(v=>Number.isFinite(v)&&v>0)?s.vectorSize:[1,1];
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+size.join(' ')+'" preserveAspectRatio="none" style="width:100%;height:100%" shape-rendering="geometricPrecision">'+geometry+'</svg>';
 }
 // Shallow line boxes must not make their stroke sub-pixel.
 if(s.kind==='line')return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%"><path d="M1 50 H99" fill="none" stroke="'+stroke+'" stroke-opacity="'+strokeOpacity+'" stroke-dasharray="'+(dash==='dash'?'7 4':dash==='dot'?'1 3':'none')+'" stroke-width="'+Math.max(1,Number(s.lineWidth)||2)+'" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>';
 const paths=Array.isArray(s.vectorPaths)?s.vectorPaths:shapePaths(s.kind);if(paths){const data=paths.filter(Array.isArray).map(p=>{const points=p.filter(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite));return points.length?points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')+' Z':'';}).join(' ');geometry=data?'<path fill-rule="evenodd" d="'+data+'"/>':'';}
 else if(s.kind==='raindrop')geometry='<path d="M.5 .03 C.37 .22 .12 .50 .12 .68 A.38 .31 0 0 0 .88 .68 C.88 .5 .63 .22 .5 .03 Z"/>';
 else if(s.kind==='cloud')geometry='<path d="M.23 .84 C.01 .84 .00 .51 .20 .46 C.18 .26 .39 .14 .56 .28 C.72 .12 .94 .29 .91 .48 C1.08 .60 .98 .85 .78 .85 Z"/>';
 else if(s.kind==='moon')geometry='<path d="M.66 .05 A.46 .46 0 1 0 .91 .75 A.39 .39 0 0 1 .66 .05 Z"/>';
 else if(s.kind==='leaf')geometry='<path d="M.10 .92 C.10 .30 .36 .08 .90 .08 C.91 .62 .64 .90 .10 .92 Z"/>';
 else if(s.kind==='wave')geometry='<path d="M.02 .50 Q.14 .12 .26 .50 T.50 .50 T.74 .50 T.98 .50" fill="none"/>';
 else if(s.kind==='zigzag')geometry='<path d="M.02 .75 L.20 .25 L.38 .75 L.56 .25 L.74 .75 L.92 .25" fill="none"/>';
 else if(s.kind==='bracket')geometry='<path d="M.43 .03 H.20 V.97 H.43 M.57 .03 H.80 V.97 H.57" fill="none"/>';
 else if(s.kind==='ellipse')geometry='<ellipse cx=".5" cy=".5" rx=".48" ry=".48"/>';
 else if(s.kind==='heart')geometry='<path d="M.5 .95 C-.1 .55 -.05 .05 .25 .05 C.4 .05 .5 .2 .5 .25 C.5 .2 .6 .05 .75 .05 C1.05 .05 1.1 .55 .5 .95 Z"/>';
 else if(s.kind==='arrow')geometry='<path d="M.03 .35 H.62 V.08 L.97 .5 L.62 .92 V.65 H.03 Z"/>';
 else if(['grid','dots','stripes'].includes(s.kind)){const id='shape-pattern-'+String(s.id||'sample').replace(/[^\w-]/g,''),px=18/Math.max(1,s.width),py=18/Math.max(1,s.height);geometry='<defs><pattern id="'+id+'" width="'+px+'" height="'+py+'" patternUnits="userSpaceOnUse">'+(s.kind==='dots'?'<circle cx="'+px/2+'" cy="'+py/2+'" r="'+sw+'" fill="'+stroke+'"/>':'<path d="M0 '+py+' V0 H'+px+'" fill="none"'+(s.kind==='stripes'?' transform="rotate(45)"':'')+'/>')+'</pattern></defs><rect width="1" height="1" fill="url(#'+id+')" stroke="none"/>';}
 else geometry='<rect x=".015" y=".015" width=".97" height=".97" rx="'+(['roundedRectangle','frame','checkbox'].includes(s.kind)?Math.max(0,Math.min(.5,s.cornerRadius??.1)):'0')+'"/>';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none" style="width:100%;height:100%" fill="'+fill+'" fill-opacity="'+fillOpacity+'" stroke="'+stroke+'" stroke-opacity="'+strokeOpacity+'" stroke-dasharray="'+(strokeDashes||'none')+'" stroke-width="'+sw+'">'+geometry+'</svg>';
}
export function shapeSVG(node){
 // A gradient replaces existing body paint, never turns an explicitly hollow
 // shape into a solid one. Explicit paints on SVG subpaths still take priority.
 const channel=node.fill?'fill':'stroke';
 return withGraphicEffects(baseShapeSVG(node.graphicGradient?{...node,[channel]:'url(#'+graphicGradientID(node)+')'}:node),node);
}
export function shapeThumbnailSVG(shape){
 const frame=hasGraphicEffects(shape)?graphicPaintFrame(shape):shape,width=Math.max(1,Math.min(4096,Number(frame.width)||100)),height=Math.max(1,Math.min(4096,Number(frame.height)||100));return shapeSVG(shape).replace('<svg ',`<svg width="${width}" height="${height}" `);
}
export function straightStroke(stroke){if(stroke.points.length<2)return stroke;const a=stroke.points[0],b=stroke.points.at(-1);return {...stroke,points:stroke.points.map((p,i)=>({...p,x:a.x+(b.x-a.x)*i/(stroke.points.length-1),y:a.y+(b.y-a.y)*i/(stroke.points.length-1)}))};}
export function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export function resizeObject(start,cornerX,cornerY,dx,dy){const a=(start.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),u=dx*c+dy*s,v=-dx*s+dy*c,delta=(cornerX*u*start.width+cornerY*v*start.height)/Math.max(1,start.width**2+start.height**2),scale=Math.min(20,Math.max(1+delta,4/start.width,4/start.height)),width=start.width*scale,height=start.height*scale,x=cornerX*(width-start.width)/2,y=cornerY*(height-start.height)/2;return {width,height,x:start.x+x*c-y*s,y:start.y+x*s+y*c};}
export function textLineHeight(t){return (typeof t.fixedLineHeight==='number'?t.fixedLineHeight:t.lineHeight||t.fontSize*1.3)+(t.lineSpacing??t.additionalLineSpacing??0);}
export const textFontFamily=journalFontFamily;
export function textFont(t){return `${t.italic?'italic ':''}${t.bold?'bold ':''}${t.fontSize}px ${textFontFamily(t)}`;}
const noLineStart=new Set(Array.from('，。！？；：、）》」』】〕〉…,.!?;:%)]}'));
const noLineEnd=new Set(Array.from('（《「『【〔〈([{'));
export function textLines(t,measure){
 const lines=[];let y=0;const width=textContentWidth(t),push=text=>{lines.push({text,y});y+=textLineHeight(t);};
 for(const paragraph of String(t.content).split('\n')){
  let line='';
  for(const ch of Array.from(paragraph)){
   if(line&&measure(line+ch)>width){
    const chars=Array.from(line);let carry=ch;
    if((noLineStart.has(ch)||noLineEnd.has(chars.at(-1)))&&chars.length>1){
     carry=chars.pop()+ch;line=chars.join('');
    }else if(/[A-Za-z0-9]/u.test(ch)){
     const word=line.match(/[A-Za-z0-9]+$/u)?.[0];
     if(word&&word.length<line.length&&measure(word+ch)<=width){carry=word+ch;line=line.slice(0,-word.length);}
    }
    push(line.replace(/[ \t]+$/u,''));line=/^[ \t]$/u.test(carry)?'':carry;
   }else line+=ch;
  }
  push(line);y+=t.paragraphSpacing||0;
 }
 return {lines,height:y};
}
export function drawSceneText(ctx,node,frameHeight=node.height){
 ctx.save();
 try{
  ctx.fillStyle=node.color||'#30463d';ctx.font=textFont(node);ctx.letterSpacing=(node.letterSpacing||0)+'px';ctx.textBaseline='alphabetic';
  const curve=node.curveHeight||0,padding=textEffectInsets(node),contentWidth=textContentWidth(node),centerX=(padding.left-padding.right)/2,centerY=(padding.top-padding.bottom)/2;
  if(curve){
   const chars=Array.from(String(node.content||''));if(chars.includes('\n'))throw Error('曲线文字只支持单行；请拆成两个文字图层');
   const widths=chars.map(ch=>ctx.measureText(ch).width+(node.letterSpacing||0)),length=widths.reduce((sum,w)=>sum+w,0);
   if(length>contentWidth+1e-6)throw Error('曲线文字超出编辑框；请加宽或缩小字号');
   const start=node.alignment==='right'?node.width/2-padding.right-length:node.alignment==='center'?centerX-length/2:-node.width/2+padding.left,baseline=centerY+(node.fontSize-curve)/2;let advance=0;
   ctx.fillStyle=textFillStyle(ctx,node,frameHeight,{x:start,y:centerY-node.fontSize/2-Math.abs(curve),width:length,height:node.fontSize*1.2+2*Math.abs(curve)});
   for(let i=0;i<chars.length;i++){
    const x=advance+widths[i]/2,u=length?2*x/length-1:0,y=baseline+curve*(1-u*u),angle=length?-4*curve*u/length:0;
    ctx.save();ctx.translate(start+x,y);ctx.rotate(Math.atan(angle));ctx.textAlign='center';paintTextGlyphs(ctx,node,chars[i],0,0);
    if(node.underline||node.strikethrough){ctx.strokeStyle=node.color||'#30463d';ctx.lineWidth=Math.max(1,node.fontSize/18);for(const offset of [node.underline?2:null,node.strikethrough?-node.fontSize*.35:null].filter(v=>v!==null)){ctx.beginPath();ctx.moveTo(-widths[i]/2,offset);ctx.lineTo(widths[i]/2,offset);ctx.stroke();}}
    ctx.restore();advance+=widths[i];
   }
   return;
  }
  ctx.textAlign=node.alignment||'left';const left=ctx.textAlign==='center'?centerX:ctx.textAlign==='right'?node.width/2-padding.right:-node.width/2+padding.left;
  const lines=textLines(node,value=>ctx.measureText(value).width).lines;
  const bounds=lines.filter(line=>line.text.trim()).map(line=>{const m=ctx.measureText(line.text),y=-frameHeight/2+padding.top+node.fontSize+line.y;return {x:left-(m.actualBoundingBoxLeft??(ctx.textAlign==='center'?m.width/2:ctx.textAlign==='right'?m.width:0)),right:left+(m.actualBoundingBoxRight??m.width),y:y-(m.actualBoundingBoxAscent??node.fontSize*.8),bottom:y+(m.actualBoundingBoxDescent??node.fontSize*.2)};});
  if(bounds.length){const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y));ctx.fillStyle=textFillStyle(ctx,node,frameHeight,{x,y,width:Math.max(...bounds.map(b=>b.right))-x,height:Math.max(...bounds.map(b=>b.bottom))-y});}
  for(const line of lines){
   const y=-frameHeight/2+padding.top+node.fontSize+line.y;paintTextGlyphs(ctx,node,line.text,left,y);
   if(node.underline||node.strikethrough){const length=ctx.measureText(line.text).width,x=ctx.textAlign==='center'?centerX-length/2:ctx.textAlign==='right'?node.width/2-padding.right-length:-node.width/2+padding.left;ctx.strokeStyle=node.color;ctx.lineWidth=Math.max(1,node.fontSize/18);for(const offset of [node.underline?2:null,node.strikethrough?-node.fontSize*.35:null].filter(v=>v!==null)){ctx.beginPath();ctx.moveTo(x,y+offset);ctx.lineTo(x+length,y+offset);ctx.stroke();}}
  }
 }finally{ctx.restore();}
}
export function eraseStrokes(strokes,point,radius,whole=true,onlyHighlighter=false){return strokes.flatMap(line=>{if(onlyHighlighter&&line.penStyle!=='marker')return [line];const pts=line.points||[],hit=(p,i)=>Math.hypot(p.x-point.x,p.y-point.y)<=radius+(line.width||3)/2||(i>0&&segmentDistance(point,pts[i-1],p)<=radius+(line.width||3)/2);if(!pts.some(hit))return [line];if(whole)return [];const chunks=[];let run=[];pts.forEach((p,i)=>{if(hit(p,i)){if(run.length)chunks.push({...line,id:globalThis.crypto?.randomUUID?.()||'ink-'+Math.random().toString(36).slice(2),points:run});run=[];}else run.push(p);});if(run.length)chunks.push({...line,id:globalThis.crypto?.randomUUID?.()||'ink-'+Math.random().toString(36).slice(2),points:run});return chunks;});}
export function drawInk(ctx,strokes){ctx.save();ctx.lineCap='round';ctx.lineJoin='round';for(const s of strokes){if(!s.points?.length)continue;ctx.globalCompositeOperation=s.blendMode==='multiply'?'multiply':'source-over';ctx.globalAlpha=s.opacity??1;ctx.strokeStyle=ctx.fillStyle=s.color||'#2b5245';ctx.lineWidth=s.width||3;if(s.penStyle==='pressure'){const outline=pressureInkOutline(s);if(!outline.length)continue;ctx.beginPath();ctx.moveTo(...outline[0]);for(const point of outline.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.fill();continue;}if(s.points.length===1){ctx.beginPath();ctx.arc(s.points[0].x,s.points[0].y,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();continue;}if(s.penStyle==='brush'){for(let i=1;i<s.points.length;i++){const a=s.points[i-1],b=s.points[i];ctx.lineWidth=(s.width||3)*(.35+.9*Math.max(0,Math.min(1,((a.p??.5)+(b.p??.5))/2)));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}else{ctx.beginPath();traceSmoothInk(ctx,s.points);ctx.stroke();}}ctx.restore();}
