import {getStroke} from 'perfect-freehand';

const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
export function paperWidthPixels(draft,millimetres){
  const height=finite(draft?.physicalPageHeightMM,297),pixels=finite(draft?.canvas?.height,0);
  if(!(height>0&&pixels>0))throw Error('无法按纸张尺寸换算笔触宽度');
  const mm=finite(millimetres,0);
  if(!(mm>0&&mm<=30))throw Error('笔触实际宽度须为 0–30 mm');
  return mm*pixels/height;
}

export function pressureInkOutline(stroke){
  const points=(stroke?.points||[]).filter(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y));
  if(!points.length)return [];
  const usesPressure=points.some(point=>Number.isFinite(point.p));
  return getStroke(points.map(point=>[point.x,point.y,
    Math.max(.02,Math.min(1,finite(point.p,.5)))]),{
    size:Math.max(.1,finite(stroke.width,3)),thinning:.55,smoothing:.62,
    streamline:.38,simulatePressure:!usesPressure,last:true,
    start:{cap:true,taper:0},end:{cap:true,taper:0}
  });
}

export function pressureInkPath(stroke){
  const outline=pressureInkOutline(stroke);
  return outline.length?'M '+outline.map(([x,y])=>x+' '+y).join(' L ')+' Z':'';
}

const distanceToSegment=(point,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
};

// New pressure strokes use a physical-size path eraser. It splits long lines
// even when neither original sample lies inside the eraser, preserving p.
export function erasePressureStroke(stroke,eraserPath,radius,newID=()=>crypto.randomUUID()){
  if(stroke?.type!=='ink'||!stroke.points?.length||!eraserPath?.length||!(radius>0))return [stroke];
  const edge=radius+stroke.width/2;
  const paths=eraserPath.length===1?[[eraserPath[0],eraserPath[0]]]:
    eraserPath.slice(1).map((end,index)=>[eraserPath[index],end]);
  // Mouse and touch strokes deliberately omit pressure so perfect-freehand
  // simulates it. Interpolating a synthetic p during erasure used to switch
  // every surviving fragment to explicit-pressure rendering, changing the
  // appearance of the whole stroke far outside the erased area.
  const hasPressure=stroke.points.some(point=>Number.isFinite(point.p));
  const sample=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
    ...(hasPressure?{p:finite(a.p,.5)+(finite(b.p,.5)-finite(a.p,.5))*t}:{})});
  const inside=point=>paths.some(([start,end])=>distanceToSegment(point,start,end)<=edge);
  const sampled=[];
  for(let i=0;i<stroke.points.length;i++){
    const start=stroke.points[i],end=stroke.points[i+1];
    sampled.push(start);
    if(!end)break;
    const length=Math.hypot(end.x-start.x,end.y-start.y);
    const nearby=paths.filter(([a,b])=>
      Math.max(Math.min(start.x,end.x),Math.min(a.x,b.x)-edge)<=
        Math.min(Math.max(start.x,end.x),Math.max(a.x,b.x)+edge)&&
      Math.max(Math.min(start.y,end.y),Math.min(a.y,b.y)-edge)<=
        Math.min(Math.max(start.y,end.y),Math.max(a.y,b.y)+edge));
    if(!nearby.length)continue;
    const positions=[];
    if(length<Math.max(50,edge*40)){
      const steps=Math.min(512,Math.ceil(length/Math.max(.3,radius*.35)));
      for(let step=1;step<steps;step++)positions.push(step/steps);
    }else{
      const dx=end.x-start.x,dy=end.y-start.y,denominator=length*length;
      for(const [a,b] of nearby)for(const point of [a,b,{x:(a.x+b.x)/2,y:(a.y+b.y)/2}]){
        const center=Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/denominator));
        for(const distance of [-2,-1,-.5,0,.5,1,2]){
          const t=center+distance*edge/length;
          if(t>0&&t<1)positions.push(t);
        }
      }
    }
    positions.sort((a,b)=>a-b);
    let previous=-1;
    for(const t of positions){
      if(t-previous<1e-6)continue;
      previous=t;
      sampled.push(sample(start,end,t));
    }
  }
  if(!sampled.some(inside))return [stroke];
  const interpolate=sample;
  const boundary=(a,b,aInside)=>{
    let low=0,high=1;
    for(let step=0;step<18;step++){
      const mid=(low+high)/2;
      if(inside(interpolate(a,b,mid))===aInside)low=mid;
      else high=mid;
    }
    // Keep the sample on the visible side of the eraser footprint.
    return interpolate(a,b,aInside?high:low);
  };
  const runs=[];let current=[];
  for(let index=0;index<sampled.length;index++){
    const point=sampled[index],isInside=inside(point);
    const previous=sampled[index-1],wasInside=previous&&inside(previous);
    if(previous&&isInside!==wasInside){
      const edgePoint=boundary(previous,point,wasInside);
      if(wasInside)current=[edgePoint];
      else{current.push(edgePoint);runs.push(current);current=[];}
    }
    if(!isInside)current.push(point);
  }
  if(current.length)runs.push(current);
  return runs.map(points=>({...stroke,id:newID(),points}));
}
