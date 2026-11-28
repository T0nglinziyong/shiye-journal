import {polygonContains} from './canvas-selection.js';

// Preview pieces are in scene coordinates. The latest painted piece wins when
// multiple selected layers overlap; a tap never changes the cut target.
export function cutPreviewPieceAt(preview,point,{inkTolerance=8,topSourceID=null}={}){
  if(preview?.spec?.operation!=='split'||!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return null;
  const distance=(p,a,b)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/length)):0;
    return Math.hypot(p.x-a[0]-dx*t,p.y-a[1]-dy*t);
  };
  return [...(preview.pieces||[])].reverse().find(piece=>{
    if(topSourceID&&piece.sourceID!==topSourceID)return false;
    const outline=piece.outline||[];
    if(piece.type==='ink')return outline.some((a,index)=>index&&
      distance(point,outline[index-1],a)<=inkTolerance);
    if(piece.hitGeometry?.length)return piece.hitGeometry.some(polygon=>{
      const contains=ring=>polygonContains(point,ring.map(([x,y])=>({x,y})));
      return polygon[0]?.length>=3&&contains(polygon[0])&&
        polygon.slice(1).every(hole=>!contains(hole));
    });
    return outline.length>=3&&polygonContains(point,outline.map(([x,y])=>({x,y})));
  })||null;
}
