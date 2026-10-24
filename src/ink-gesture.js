import {segmentDistance} from './editor-tools-model.js';

// All geometry is in Scene canvas units. This is deliberately independent of
// device pixel ratio and Panzoom; CSS scales the preview with the page.
export const eraserBehavior=prefs=>{
  const style=['fine','standard','brush'].includes(prefs?.eraserStyle)?prefs.eraserStyle:'standard';
  const size=Math.max(2,Math.min(160,Number(prefs?.eraserWidth)||20));
  return {style,whole:style==='brush',radius:style==='fine'?size/4:size/2};
};
export const pointerSamples=(event,convert,previous=null)=>{
  const reported=event.getCoalescedEvents?.();
  const points=(reported?.length?reported:[event]).map(convert);
  // Some browser engines omit the final dispatched event from the coalesced
  // set; never drop the pen-up position or a fast final flick.
  const end=convert(event);
  if(!points.length||Math.hypot(points.at(-1).x-end.x,points.at(-1).y-end.y)>.1)points.push(end);
  const result=[];let last=previous;
  for(const point of points){
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
    if(last&&Math.hypot(point.x-last.x,point.y-last.y)<.12)continue;
    result.push(point);last=point;
  }
  return result;
};
export const eraserPathSamples=(from,to,radius)=>{
  if(!from)return [to];
  const distance=Math.hypot(to.x-from.x,to.y-from.y);
  const count=Math.min(256,Math.max(1,Math.ceil(distance/Math.max(1,radius*.65))));
  return Array.from({length:count},(_,i)=>({x:from.x+(to.x-from.x)*(i+1)/count,y:from.y+(to.y-from.y)*(i+1)/count}));
};
// One traversal and one Scene write per animation frame: the old handler
// assigned d.strokes once per coalesced pointer sample, causing expensive
// recursive detach/reinsert and missed fast scribbles on mobile Safari.
export function eraseStrokesAlongPath(strokes,samples,radius,whole,onlyHighlighter=false){
  if(!samples?.length)return strokes;
  return strokes.flatMap(line=>{
    if(onlyHighlighter&&line.penStyle!=='marker')return [line];
    const pts=line.points||[],edge=radius+(line.width||3)/2;
    const hit=(p,i)=>samples.some(point=>Math.hypot(p.x-point.x,p.y-point.y)<=edge||
      (i>0&&segmentDistance(point,pts[i-1],p)<=edge));
    if(!pts.some(hit))return [line];
    if(whole)return [];
    const pieces=[];let current=[];
    pts.forEach((p,i)=>{
      if(hit(p,i)){
        if(current.length)pieces.push({...line,id:globalThis.crypto?.randomUUID?.()||'ink-'+Math.random().toString(36).slice(2),points:current});
        current=[];
      }else current.push(p);
    });
    if(current.length)pieces.push({...line,id:globalThis.crypto?.randomUUID?.()||'ink-'+Math.random().toString(36).slice(2),points:current});
    return pieces;
  });
}
