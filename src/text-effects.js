// Native text paint data shared by Canvas export, Fabric projection and both
// editable input paths. This is not a bitmap effect or a duplicate text layer.
const num=(min,max)=>({type:'number',minimum:min,maximum:max});
const color={type:'string',pattern:'^#[0-9A-Fa-f]{6}$'};
export const textOutlineSchema={anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['color','width','offsetX','offsetY'],properties:{color,width:num(.01,100),offsetX:num(-100,100),offsetY:num(-100,100)}}]};
export const textGradientSchema={anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['angleDeg','stops'],properties:{angleDeg:num(-360,360),stops:{type:'array',minItems:2,maxItems:8,items:{type:'object',additionalProperties:false,required:['offset','color'],properties:{offset:num(0,1),color}}}}}]};
const finite=(value,low,high)=>Number.isFinite(value)&&value>=low&&value<=high;
const validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function validateTextEffects(node){
 if(node.textOutline!=null){const o=node.textOutline;
  if(node.type!=='text'||!o||Object.keys(o).some(k=>!['color','width','offsetX','offsetY'].includes(k))||!validColor(o.color)||!finite(o.width,.01,100)||!finite(o.offsetX,-100,100)||!finite(o.offsetY,-100,100))throw Error('文字描边参数无效');
 }
 if(node.textGradient!=null){const g=node.textGradient;
  if(node.type!=='text'||!g||Object.keys(g).some(k=>!['angleDeg','stops'].includes(k))||!finite(g.angleDeg,-360,360)||!Array.isArray(g.stops)||g.stops.length<2||g.stops.length>8)throw Error('文字渐变参数无效');
  let last=-1;for(const stop of g.stops){if(!stop||Object.keys(stop).some(k=>!['offset','color'].includes(k))||!finite(stop.offset,0,1)||stop.offset<=last||!validColor(stop.color))throw Error('渐变色标须按 offset 严格递增');last=stop.offset;}
  if(g.stops[0].offset!==0||g.stops.at(-1).offset!==1)throw Error('渐变色标必须覆盖 0 和 1');
 }
 return node;
}
export function textEffectInsets(node){
 const o=node.textOutline;if(!o)return {left:0,right:0,top:0,bottom:0};
 const half=o.width/2;
 return {left:Math.max(0,half-o.offsetX),right:Math.max(0,half+o.offsetX),top:Math.max(0,half-o.offsetY),bottom:Math.max(0,half+o.offsetY)};
}
export function textContentWidth(node){const p=textEffectInsets(node);return Math.max(.01,node.width-p.left-p.right);}
export function textFillStyle(ctx,node,height=node.height,bounds={x:-node.width/2,y:-height/2,width:node.width,height}){
 if(!node.textGradient)return node.color||'#30463d';
 const g=node.textGradient,a=g.angleDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),length=Math.max(.01,Math.abs(c)*bounds.width+Math.abs(s)*bounds.height),cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
 const gradient=ctx.createLinearGradient(cx-c*length/2,cy-s*length/2,cx+c*length/2,cy+s*length/2);
 for(const stop of g.stops)gradient.addColorStop(stop.offset,stop.color);return gradient;
}
export function paintTextGlyphs(ctx,node,text,x,y){
 const outline=node.textOutline;
 if(outline){ctx.save();try{ctx.strokeStyle=outline.color;ctx.lineWidth=outline.width;ctx.lineJoin='round';ctx.miterLimit=2;ctx.strokeText(text,x+outline.offsetX,y+outline.offsetY);}finally{ctx.restore();}}
 ctx.fillText(text,x,y);
}
// Font/geometry scaling must scale physical outline offsets exactly once.
export function scaleTextEffects(node,factor){if(node.textOutline)node.textOutline={...node.textOutline,width:node.textOutline.width*factor,offsetX:node.textOutline.offsetX*factor,offsetY:node.textOutline.offsetY*factor};}
