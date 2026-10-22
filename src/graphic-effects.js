import {physicalSVGElement} from './svg-paint-geometry.js';
// Shared vector paint for graphics and pressure ink. Effects do not alter
// geometry or persist images. SVG is parsed by Fabric and the Canvas backend.
import {validateEffectValues} from './text-effects.js';
import {pressureInkOutline} from './pressure-ink.js';
import {smoothInkSVG} from './ink-path-geometry.js';
export const hasGraphicEffects=node=>!!(node.graphicOutline||node.graphicGradient);
export function validateGraphicEffects(node){
 if(hasGraphicEffects(node)&&!['shape','ink'].includes(node.type))throw Error('图形效果只用于 shape/ink');
 validateEffectValues(node.graphicOutline,node.graphicGradient,'图形');return node;
}
export function graphicPaintFrame(node){
 const o=node.graphicOutline,half=(o?.width||0)/2;
 const left=Math.max(0,half-(o?.offsetX||0)),right=Math.max(0,half+(o?.offsetX||0)),top=Math.max(0,half-(o?.offsetY||0)),bottom=Math.max(0,half+(o?.offsetY||0));
 return {left,right,top,bottom,width:node.width+left+right,height:node.height+top+bottom};
}
export const graphicGradientID=node=>'graphic-gradient-'+String(node.id||'g').replace(/[^a-zA-Z0-9_-]/g,'');
function gradientMarkup(node,box){
 const g=node.graphicGradient;if(!g)return '';
 const a=g.angleDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),span=Math.max(.01,Math.abs(c)*node.width+Math.abs(s)*node.height),[x,y,w,h]=box;
 const dx=c*span/2/node.width*w,dy=s*span/2/node.height*h;
 return `<defs><linearGradient id="${graphicGradientID(node)}" gradientUnits="userSpaceOnUse" x1="${x+w/2-dx}" y1="${y+h/2-dy}" x2="${x+w/2+dx}" y2="${y+h/2+dy}">${g.stops.map(stop=>`<stop offset="${stop.offset}" stop-color="${stop.color}"/>`).join('')}</linearGradient></defs>`;
}
export function withGraphicEffects(svg,node,{strokeBody=false}={}){
 validateGraphicEffects(node);if(!hasGraphicEffects(node))return svg;
 const m=svg.match(/viewBox="([^"]+)"/);if(!m)throw Error('图形缺少矢量边界');
 const box=m[1].split(/\s+/).map(Number),[x,y,w,h]=box,f=graphicPaintFrame(node);
 if(!(w>0&&h>0&&f.width>0&&f.height>0))throw Error('图形效果边界无效');
 const inner=svg.replace(/^<svg\b[^>]*>/,'').replace(/<\/svg>$/,'');
 // Preserve inherited paint from the original root while placing it in a
 // physical-coordinate frame. Local SVG path paints override global fill.
 const root=svg.match(/^<svg\b[^>]*>/)[0];
 const inherited=[...root.matchAll(/\b(fill|fill-opacity|stroke|stroke-opacity|stroke-width|stroke-dasharray)="([^"]*)"/g)].map(m=>`${m[1]}="${m[2]}"`).join(' ');
 const transform=`scale(${node.width/w} ${node.height/h}) translate(${-x} ${-y})`;
 let outline='';
 if(node.graphicOutline){
  const o=node.graphicOutline;
  const traced=inner.replace(/<defs>[\s\S]*?<\/defs>/g,'').replace(/<(path|rect|ellipse|circle|line|polyline|polygon)\b([^>]*?)(\/?)>/g,(_all,tag,attrs)=>{
   const stroke=attrs.match(/\bstroke="([^"]*)"/)?.[1];
   const originalWidth=strokeBody&&stroke&&stroke!=='none'?Number(attrs.match(/\bstroke-width="([^"]*)"/)?.[1]||0):0;
   const baked=physicalSVGElement(tag,attrs,{sx:node.width/w,sy:node.height/h,tx:-x*node.width/w,ty:-y*node.height/h});
   return `<${baked.tag} ${baked.attrs} fill="none" stroke="${o.color}" stroke-width="${o.width+originalWidth}" stroke-linejoin="round"/>`;
  });
  outline=`<g transform="translate(${f.left+o.offsetX} ${f.top+o.offsetY})">${traced}</g>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f.width} ${f.height}" preserveAspectRatio="none">${gradientMarkup(node,box)}${outline}<g transform="translate(${f.left} ${f.top})"><g transform="${transform}" ${inherited}>${inner}</g></g></svg>`;
}
export function inkEffectSVG(node){
 validateGraphicEffects(node);
 const paint=node.graphicGradient?'url(#'+graphicGradientID(node)+')':node.color,points=node.points;
 let inner,outline;
 if(node.penStyle==='pressure'){
  outline=pressureInkOutline(node);inner=`<path d="${outline.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')} Z" fill="${paint}"/>`;
 }else if(points.length===1){const p=points[0];inner=`<circle cx="${p.x}" cy="${p.y}" r="${node.width/2}" fill="${paint}"/>`;}
 else if(node.penStyle==='brush')inner=points.slice(1).map((p,i)=>{const a=points[i],width=node.width*(.35+.9*Math.max(0,Math.min(1,((a.p??.5)+(p.p??.5))/2)));return `<path d="M${a.x} ${a.y} L${p.x} ${p.y}" fill="none" stroke="${paint}" stroke-width="${width}" stroke-linecap="round"/>`;}).join('');
 else inner=`<path d="${smoothInkSVG(points,n=>n)}" fill="none" stroke="${paint}" stroke-width="${node.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
 const xs=outline?outline.map(p=>p[0]):points.map(p=>p.x),ys=outline?outline.map(p=>p[1]):points.map(p=>p.y),pad=outline?0:node.width*.65;
 const x=Math.min(...xs)-pad,y=Math.min(...ys)-pad,w=Math.max(.01,Math.max(...xs)-x+pad),h=Math.max(.01,Math.max(...ys)-y+pad);
 const geometry={...node,width:w,height:h},frame=graphicPaintFrame(geometry);
 const svg=withGraphicEffects(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">${inner}</svg>`,geometry,{strokeBody:true});
 return {svg,frame:{...frame,x:x-frame.left,y:y-frame.top}};
}
