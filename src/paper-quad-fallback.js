// c9 remains the primary 800px A4 detector. This deliberately conservative
// 400px fallback runs ONLY when that unchanged detector returns no corners.
// No unconditional multiscale competition, no 1200px frame, no extra workers.
export const PAPER_FALLBACK_MAX_EDGE=400;
export const PAPER_FALLBACK_THRESHOLDS=[165,180,'edges','edges-low','lab-130'];
export const PAPER_FALLBACK_EPSILONS=[.012,.02,.032];
export const PAPER_FALLBACK_MIN_SCORE=.65;

export function fallbackPaperQuad400(cv,p,own){
  if(!(p.width>0&&p.height>0)||!p.pixels?.length)return null;
  const factor=Math.min(1,PAPER_FALLBACK_MAX_EDGE/Math.max(p.width,p.height));
  const width=Math.max(1,Math.round(p.width*factor)),
    height=Math.max(1,Math.round(p.height*factor));
  const src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels));
  const frame=own(new cv.Mat());
  if(width!==p.width||height!==p.height)
    cv.resize(src,frame,new cv.Size(width,height),0,0,cv.INTER_AREA);
  else src.copyTo(frame);
  const gray=own(new cv.Mat()),blur=own(new cv.Mat()),
    rgb=own(new cv.Mat()),lab=own(new cv.Mat()),
    channels=own(new cv.MatVector()),
    kernel=own(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5)));
  cv.cvtColor(frame,gray,cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
  cv.cvtColor(frame,rgb,cv.COLOR_RGBA2RGB);
  cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
  cv.split(lab,channels);
  const blueYellow=own(channels.get(2));
  const expected=Math.min(p.paperRatio||210/297,1/(p.paperRatio||210/297));
  let best=null;
  for(const threshold of PAPER_FALLBACK_THRESHOLDS){
    // Delete intermediate contours promptly: unlike the previous three-scale
    // code this does not keep a Mat for every contour until worker exit.
    const binary=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat();
    try{
      const edge=threshold==='edges'||threshold==='edges-low';
      if(edge){
        cv.Canny(blur,binary,threshold==='edges-low'?15:40,
          threshold==='edges-low'?45:120);
        cv.morphologyEx(binary,binary,cv.MORPH_CLOSE,kernel);
      }else if(threshold==='lab-130')
        cv.threshold(blueYellow,binary,130,255,cv.THRESH_BINARY_INV);
      else cv.threshold(gray,binary,threshold,255,cv.THRESH_BINARY);
      cv.findContours(binary,contours,hierarchy,
        edge?cv.RETR_LIST:cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
      for(let i=0;i<contours.size();i++){
        const contour=contours.get(i);
        try{
          const area=cv.contourArea(contour)/(width*height);
          // Match c9 area gate, never restore the overly permissive .12 gate.
          if(area<.14)continue;
          const perimeter=cv.arcLength(contour,true);
          for(const epsilon of PAPER_FALLBACK_EPSILONS){
            const polygon=new cv.Mat();
            try{
              cv.approxPolyDP(contour,polygon,perimeter*epsilon,true);
              if(polygon.rows!==4||!cv.isContourConvex(polygon))continue;
              let points=Array.from({length:4},(_,j)=>({
                x:polygon.data32S[j*2]/width,
                y:polygon.data32S[j*2+1]/height
              }));
              const center={x:points.reduce((s,v)=>s+v.x,0)/4,
                y:points.reduce((s,v)=>s+v.y,0)/4};
              points.sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-
                Math.atan2(b.y-center.y,b.x-center.x));
              const first=points.reduce((min,v,j)=>
                v.x+v.y<points[min].x+points[min].y?j:min,0);
              points=points.slice(first).concat(points.slice(0,first));
              const coverage=Math.abs(cv.contourArea(polygon))/(width*height);
              if(coverage<.18||coverage>.96||
                points.some(v=>v.x<.004||v.x>.996||v.y<.004||v.y>.996))continue;
              const length=(a,b)=>Math.hypot(
                (a.x-b.x)*width,(a.y-b.y)*height);
              const w=length(points[0],points[1])+length(points[2],points[3]),
                h=length(points[0],points[3])+length(points[1],points[2]);
              if(!(w>0&&h>0))continue;
              const ratio=Math.min(w/h,h/w);
              const aspect=Math.min(ratio/expected,expected/ratio);
              if(aspect<.60)continue;
              const score=Math.min(coverage/.65,1)*.48+
                aspect*.20+Math.min(area/coverage,1)*.32;
              if(!best||score>best.score)best={score,corners:points};
            }finally{polygon.delete();}
          }
        }finally{contour.delete();}
      }
    }finally{hierarchy.delete();contours.delete();binary.delete();}
  }
  return best&&best.score>=PAPER_FALLBACK_MIN_SCORE?best.corners:null;
}
