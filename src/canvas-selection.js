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
function fullyContains(polygon,corners) {
  if(!corners.every(p=>polygonContains(p,polygon)))return false;
  // Concave lassos may contain all corners while cutting through an edge.
  return corners.every((a,i)=>{const b=corners[(i+1)%corners.length],cuts=[0,1],dx=b.x-a.x,dy=b.y-a.y;
    for(let j=0;j<polygon.length;j++){const q=polygon[j],r=polygon[(j+1)%polygon.length],ex=r.x-q.x,ey=r.y-q.y,den=dx*ey-dy*ex;
      if(Math.abs(den)<1e-9)continue;const t=((q.x-a.x)*ey-(q.y-a.y)*ex)/den,u=((q.x-a.x)*dy-(q.y-a.y)*dx)/den;if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);}
    cuts.sort((a,b)=>a-b);return cuts.slice(1).every((t,j)=>{const m=(t+cuts[j])/2;return polygonContains({x:a.x+dx*m,y:a.y+dy*m},polygon);});});
}
function segmentsIntersect(a,b,c,d){const s1=cross(a,b,c),s2=cross(a,b,d),s3=cross(c,d,a),s4=cross(c,d,b);return s1*s2<=0&&s3*s4<=0&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y));}
function intersects(polygon,corners){if(corners.some(p=>polygonContains(p,polygon))||polygon.some(p=>polygonContains(p,corners)))return true;return corners.some((a,i)=>polygon.some((c,j)=>segmentsIntersect(a,corners[(i+1)%corners.length],c,polygon[(j+1)%polygon.length])));}
function strokeIntersects(polygon,a,b){return polygonContains(a,polygon)||polygonContains(b,polygon)||polygon.some((p,i)=>segmentsIntersect(a,b,p,polygon[(i+1)%polygon.length]));}
export function selectPolygon(draft, polygon, filter, mode='contain') {
  if(polygon.length<3 || !polygon.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))) return [];
  const bounds=selectionBounds(polygon);
  if(bounds.width<.01 || bounds.height<.01) return [];
  return canvasObjects(draft,filter).filter(e=>(mode==='intersect'?intersects(polygon,objectCorners(e.value)):fullyContains(polygon,objectCorners(e.value)))).map(e=>e.value.id);
}
export function selectStrokes(draft, polygon, enabled = true, mode='contain', onlyHighlighter=false) {
  if (!enabled || polygon.length < 3 || !polygon.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return [];
  return (draft.strokes || []).flatMap((stroke, index) => {
    const points = stroke.points || [];
    if (onlyHighlighter && stroke.penStyle!=='marker') return [];
    if (!points.length || !points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return [];
    const inside = points.length === 1
      ? polygonContains(points[0], polygon)
      : points.slice(1)[mode==='intersect'?'some':'every']((point, i) => mode==='intersect'?strokeIntersects(polygon,points[i],point):fullyContains(polygon,[points[i],point]));
    return inside ? [index] : [];
  });
}
export function selectionBounds(points) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
  return {x:minX,y:minY,width:maxX-minX,height:maxY-minY};
}
export function clampCanvasPosition(draft,object,x,y){
  return {x:Math.max(0,Math.min(draft.canvas.width,x)),y:Math.max(0,Math.min(draft.canvas.height,y))};
}
export function materialCenterOutside(draft, entries) {
  return entries.some(({kind,value}) => kind === 'material' &&
    (value.x < 0 || value.x > draft.canvas.width || value.y < 0 || value.y > draft.canvas.height));
}
export function moveSelection(draft, starts, dx, dy, strokeStarts = new Map()) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return {dx:0,dy:0};
  const movable = canvasObjects(draft).filter(e => starts.has(e.value.id));
  for (const {value:o} of movable) {
    const p = starts.get(o.id);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return {dx:0,dy:0};
  }
  const ink = [...strokeStarts].flatMap(([index, points]) =>
    draft.strokes?.[index] && Array.isArray(points) && points.length === draft.strokes[index].points?.length ? points : []);
  if (!ink.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return {dx:0,dy:0};
  // Preserve the relative positions of every selected item and ink stroke.
  // The UI asks whether to withdraw the move if a material center leaves the page.
  for (const {kind,value:o} of movable) {
    const p = starts.get(o.id);
    o.x = p.x + dx; o.y = p.y + dy;
    if (kind === 'material') o.userOverrideFlags = [...new Set([...(o.userOverrideFlags || []), 'moved'])];
  }
  for (const [index, points] of strokeStarts) {
    const stroke = draft.strokes?.[index];
    if (stroke && points.length === stroke.points?.length)
      stroke.points = points.map(p => ({...p, x:p.x + dx, y:p.y + dy}));
  }
  return {dx,dy};
}
