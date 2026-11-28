import {paperNoiseTile,paperNoiseTileSize} from './paper-noise-tile.js';
// Deterministic, editable paper finish shared by every SVG/Canvas consumer.
// No raster asset, external filter, or additional Scene layers are needed.
export function validatePaperSurface(node){
 const p=node.paperSurface;if(p==null)return;
 if(node.type!=='shape'||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['kind','intensity','seed','unitScale'].includes(k))||!['matte','fiber','torn'].includes(p.kind)||!Number.isFinite(p.intensity)||p.intensity<0||p.intensity>1||!Number.isInteger(p.seed)||p.seed<0||p.seed>2147483647||!Number.isFinite(p.unitScale)||p.unitScale<=0||p.unitScale>1000)throw Error('纸面质感参数无效');
}
// One preset creates an actual transparent paper edge. The fixed seed is a
// reusable texture; scale is physical so large sheets do not get giant teeth.
export function tornPaperPath(width,height,unitScale,seed=17){
 let state=seed>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const depth=Math.min(unitScale*.48,width*.035,height*.035),pts=[];
 const edge=(length,point)=>{
  const count=Math.max(4,Math.min(240,Math.ceil(length/(unitScale*.65))));
  let drift=.5;
  for(let i=0;i<=count;i++){
   drift=drift*.72+rand()*.28;
   const t=(i===0||i===count)?i/count:(i+(rand()-.5)*.6)/count;
   pts.push(point(t,depth*(.14+drift*.5+rand()*.36)));
  }
 };
 edge(width,(t,d)=>[t*width,d]);edge(height,(t,d)=>[width-d,t*height]);
 edge(width,(t,d)=>[(1-t)*width,height-d]);edge(height,(t,d)=>[d,(1-t)*height]);
 return pts.map(([x,y],i)=>(i?'L':'M')+x.toFixed(3)+' '+y.toFixed(3)).join(' ')+'Z';
}
export function paperSurfaceSVG(svg,node,maskSVG,frame=null){
 const p=node.paperSurface;if(!p||!node.fill||(p.intensity===0&&p.kind!=='torn'))return svg;
 validatePaperSurface(node);
 let seed=p.seed>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const w=node.width,h=node.height,u=p.unitScale,f=n=>Number(n.toFixed(4));
 // Physical grain stays small on both narrow labels and full sheets. Cap work
 // on giant sheets; deterministic coordinates remain stable on rerender.
 const count=Math.min(6000,Math.max(40,Math.round(w*h/u/u*1.4))),marks=[];
 for(let i=0;i<count;i++){
  const x=random()*w,y=random()*h,len=u*(p.kind!=='matte'?.15+random()*.7:.05+random()*.15),dy=(random()-.5)*len;
  marks.push(`<path d="M${f(x)} ${f(y)}l${f(len)} ${f(dy)}" stroke="${i%2?'#ffffff':'#302c27'}" stroke-width="${f(u*(.025+random()*.04))}" opacity="${f(p.intensity*(.06+random()*.17))}"/>`);
 }
 const noiseSize=u*8,noiseOpacity=p.intensity*(p.kind==='matte'?.25:.45);
 const fw=frame?.width||w,fh=frame?.height||h,left=frame?.left||0,top=frame?.top||0;
 const inset=['rectangle','roundedRectangle','frame','checkbox'].includes(node.kind)?.015:0;
 const edge=p.kind==='torn'?`<clipPath id="paper-torn-edge"><path transform="translate(${left+w*inset} ${top+h*inset})" d="${tornPaperPath(w*(1-2*inset),h*(1-2*inset),u,p.seed)}"/></clipPath>`:'';
 const nested=s=>s.replace('<svg ',`<svg x="0" y="0" width="${w}" height="${h}" `);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fw} ${fh}" preserveAspectRatio="none"><defs>${edge}<pattern id="paper-grain-noise" patternUnits="userSpaceOnUse" width="${noiseSize}" height="${noiseSize}" x="${(p.seed%29)/29*noiseSize}" y="${(p.seed%31)/31*noiseSize}"><g transform="scale(${noiseSize/paperNoiseTileSize})">${paperNoiseTile}</g></pattern><mask id="paper-surface-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${fw}" height="${fh}"><g transform="translate(${left} ${top})">${nested(maskSVG)}</g></mask><radialGradient id="paper-tone"><stop offset="0" stop-color="#ffffff" stop-opacity="${p.intensity*.1}"/><stop offset="1" stop-color="#312b22" stop-opacity="${p.intensity*.055}"/></radialGradient></defs><g${edge?' clip-path="url(#paper-torn-edge)"':''}>${svg.replace('<svg ',`<svg width="${fw}" height="${fh}" `)}<g mask="url(#paper-surface-mask)" fill="none" stroke-linecap="round"><g transform="translate(${left} ${top})"><rect width="${w}" height="${h}" fill="url(#paper-tone)"/><rect width="${w}" height="${h}" fill="url(#paper-grain-noise)" opacity="${noiseOpacity}"/>${marks.join('')}</g></g></g></svg>`;
}
