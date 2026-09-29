export function canvasObjects(draft, filter = {material:true, text:true, shape:true}) {
  return [['material', draft.items], ['text', draft.textBlocks], ['shape', draft.primitives]]
    .flatMap(([kind, objects]) => (objects || []).filter(o => filter[kind] && !o.locked && !o.isLocked && !o.hidden && !o.isHidden && !o.isParked && !o.parked).map(value => ({kind, value})));
}
export function objectCorners(o) {
  const a = (o.rotation || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y]) => ({x:o.x + x*o.width*c-y*o.height*s, y:o.y+x*o.width*s+y*o.height*c}));
}
const cross = (a,b,p) => (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const onSegment = (a,b,p) => Math.abs(cross(a,b,p))<1e-6 && p.x>=Math.min(a.x,b.x)-1e-6 && p.x<=Math.max(a.x,b.x)+1e-6 && p.y>=Math.min(a.y,b.y)-1e-6 && p.y<=Math.max(a.y,b.y)+1e-6;
export function polygonContains(p, polygon) {
  let inside = false;
  for(let i=0; i<polygon.length; i++) {
    const a=polygon[i], b=polygon[(i+1)%polygon.length];
    if(onSegment(a,b,p)) return true;
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
function intersects(a,b) {
  if(a.some(p=>polygonContains(p,b)) || b.some(p=>polygonContains(p,a))) return true;
  return a.some((p,i)=>b.some((q,j)=>{
    const r=a[(i+1)%a.length], s=b[(j+1)%b.length];
    return cross(p,r,q)*cross(p,r,s)<0 && cross(q,s,p)*cross(q,s,r)<0 || onSegment(p,r,q) || onSegment(p,r,s) || onSegment(q,s,p) || onSegment(q,s,r);
  }));
}
export function selectPolygon(draft, polygon, filter) {
  if(polygon.length<3 || !polygon.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))) return [];
  const bounds=selectionBounds(polygon);
  if(bounds.width<.01 || bounds.height<.01) return [];
  return canvasObjects(draft,filter).filter(e=>intersects(polygon,objectCorners(e.value))).map(e=>e.value.id);
}
export function selectionBounds(points) {
  const x=Math.min(...points.map(p=>p.x)), y=Math.min(...points.map(p=>p.y));
  return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
}
export function moveSelection(draft, starts, dx, dy) {
  if(!Number.isFinite(dx)||!Number.isFinite(dy)) return;
  const movable=canvasObjects(draft).filter(e=>starts.has(e.value.id));
  for(const {value:o} of movable) { const p=starts.get(o.id); if(!Number.isFinite(p.x)||!Number.isFinite(p.y)) return; }
  const minX=Math.max(-Infinity,...movable.map(e=>-2*draft.canvas.width-starts.get(e.value.id).x));
  const maxX=Math.min(Infinity,...movable.map(e=>3*draft.canvas.width-starts.get(e.value.id).x));
  const minY=Math.max(-Infinity,...movable.map(e=>-2*draft.canvas.height-starts.get(e.value.id).y));
  const maxY=Math.min(Infinity,...movable.map(e=>3*draft.canvas.height-starts.get(e.value.id).y));
  dx=Math.min(maxX,Math.max(minX,dx)); dy=Math.min(maxY,Math.max(minY,dy));
  for(const {kind,value:o} of movable) { const p=starts.get(o.id); o.x=p.x+dx; o.y=p.y+dy; if(kind==='material') o.userOverrideFlags=[...new Set([...(o.userOverrideFlags||[]),'moved'])]; }
}
