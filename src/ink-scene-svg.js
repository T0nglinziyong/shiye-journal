import {smoothInkSVG} from './ink-path-geometry.js';
import {pressureInkPath} from './pressure-ink.js';
// An ink node is editable vector geometry, not a baked PNG.
// Used by editor DOM, Works previews and live lasso motion. All text
// interpolation is bounded numerical data, never untrusted SVG markup.
const coord=v=>Number.isFinite(Number(v))?Math.max(-100000,Math.min(100000,Number(v))):0;
const widthOf=s=>Number.isFinite(Number(s.width))?Math.max(.1,Math.min(1000,Number(s.width))):2;
export function inkScenePaths(stroke){
 const points=Array.isArray(stroke?.points)?stroke.points.filter(p=>p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))):[];
 if(!points.length)return '';
 const color=/^#[0-9a-fA-F]{6}$/.test(stroke?.color||'')?stroke.color:'#30463d',width=widthOf(stroke);
 const at=p=>coord(p.x)+' '+coord(p.y);
 if(stroke.penStyle==='pressure')return '<path d="'+pressureInkPath(stroke)+'" fill="'+color+'"/>';
 if(points.length===1)return '<circle cx="'+coord(points[0].x)+'" cy="'+coord(points[0].y)+'" r="'+width/2+'" fill="'+color+'"/>';
 if(stroke.penStyle==='brush')return points.slice(1).map((p,i)=>{
   const a=points[i],pressure=Math.max(0,Math.min(1,((Number(a.p??.5)+Number(p.p??.5))/2)));
   return '<path d="M'+at(a)+' L'+at(p)+'" fill="none" stroke="'+color+'" stroke-width="'+width*(.35+.9*pressure)+'" stroke-linejoin="round" stroke-linecap="round"/>';
 }).join('');
 return '<path d="'+smoothInkSVG(points,coord)+'" fill="none" stroke="'+color+'" stroke-width="'+width+'" stroke-linejoin="round" stroke-linecap="round"/>';
}
export function syncInkSceneDOM(page,draft){
 const strokes=draft.strokes||[],byId=new Map(strokes.filter(s=>s.id).map(s=>[s.id,s]));
 for(const node of page.querySelectorAll('.scene-ink-object[data-render-key]')){
  const ink=byId.get(node.dataset.renderKey);
  if(!ink){node.hidden=true;continue;}
  node.innerHTML=inkScenePaths(ink);
  node.style.opacity=String(ink.opacity??1);
  node.hidden=!!(ink.hidden||ink.isHidden);
 }
}
