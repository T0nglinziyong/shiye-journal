// The same pressure-independent smoothed centreline for transient Canvas and
// permanent SVG. This is geometric smoothing, not prediction: no invented
// points enter the saved Scene or Undo.
export function traceSmoothInk(ctx,points){
  if(!points?.length)return;
  const first=points[0];ctx.moveTo(first.x,first.y);
  if(points.length===1)return;
  if(points.length===2){ctx.lineTo(points[1].x,points[1].y);return;}
  for(let i=1;i<points.length-1;i++){
    const p=points[i],next=points[i+1];
    ctx.quadraticCurveTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2);
  }
  const last=points.at(-1);ctx.lineTo(last.x,last.y);
}
export function smoothInkSVG(points,coord){
  if(!points?.length)return '';
  const start=points[0];let d='M'+coord(start.x)+' '+coord(start.y);
  if(points.length===1)return d;
  if(points.length===2)return d+' L'+coord(points[1].x)+' '+coord(points[1].y);
  for(let i=1;i<points.length-1;i++){
    const p=points[i],next=points[i+1];
    d+=' Q'+coord(p.x)+' '+coord(p.y)+' '+coord((p.x+next.x)/2)+' '+coord((p.y+next.y)/2);
  }
  const last=points.at(-1);return d+' L'+coord(last.x)+' '+coord(last.y);
}
