// Original procedural implementation inspired by repeating notebook patterns
// and fibre/mottle paper generators. No third-party raster or source embedded.
import {resolvedShapeOptions} from './advanced-shape-options.js';
import {paperSurfaceSVG,tornPaperPath} from './paper-surface.js';
export function paperGraphicSVG(node,{outlineOnly=false}={}){
 const o=resolvedShapeOptions('paper',node.shapeOptions||{}),w=node.width,h=node.height;
 const safe=v=>String(v).replace(/["<>&]/g,'');
 const fill=safe(node.fill||'none'),stroke=safe(node.stroke||'none');
 const sw=Math.max(0,node.lineWidth??.5),lineOpacity=node.strokeOpacity??.55;
 if(outlineOnly){const p=node.paperSurface===null?null:node.paperSurface||{kind:o.torn?'torn':'fiber',seed:17,unitScale:Math.min(w,h)/45};return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${p?.kind==='torn'?`<path d="${tornPaperPath(w,h,p.unitScale,p.seed)}"/>`:`<rect width="${w}" height="${h}"/>`}</svg>`;}
 const body=`<rect width="${w}" height="${h}" fill="${fill}" fill-opacity="${node.fillOpacity??1}"/>`;
 const marks=[],px=w/o.columns,py=h/o.rows;
 if(o.paperPattern==='ruled'||o.paperPattern==='grid')for(let i=1;i<o.rows;i++)marks.push(`M0 ${i*py}H${w}`);
 if(o.paperPattern==='grid')for(let i=1;i<o.columns;i++)marks.push(`M${i*px} 0V${h}`);
 const dots=o.paperPattern==='dots'?Array.from({length:o.rows},(_,y)=>Array.from({length:o.columns},(_,x)=>`<circle cx="${(x+.5)*px}" cy="${(y+.5)*py}" r="${Math.min(px,py)*.045}"/>`).join('')).join(''):'';
 const svg=content=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${content}</svg>`;
 const ink=`<g stroke="${stroke}" stroke-width="${sw}" stroke-opacity="${lineOpacity}" fill="none"><path d="${marks.join(' ')}"/></g><g fill="${stroke}" opacity="${lineOpacity}">${dots}</g>`;
 const p=node.paperSurface===null?null:node.paperSurface||{kind:o.torn?'torn':'fiber',intensity:o.grain,seed:17,unitScale:Math.min(w,h)/45};
 // One alpha composite makes the substrate genuinely translucent, including
 // its fibres and printed ruling. Text placed above remains independently opaque.
 const surface=paperSurfaceSVG(svg(body+ink),{...node,type:'shape',paperSurface:p},svg(`<rect width="${w}" height="${h}" fill="white" fill-opacity="${node.fillOpacity??1}"/>`));
 return svg(`<g opacity="${1-o.translucency}">${surface.replace('<svg ',`<svg width="${w}" height="${h}" `)}</g>`);
}
