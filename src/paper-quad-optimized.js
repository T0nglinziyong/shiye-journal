// 800px paper detection. Ported from the offline 2026-10-11 IoU study:
// two independent Canny smoothing levels + c9 threshold/Lab contours +
// one Lab-only white-paper region source + common four-side evidence scoring.
// This replaces, rather than wraps/falls back to, the old quad finder.
// Output is four normalized [0,1] corners; warp and material detection remain
// entirely separate. The image has already been resized to <=800px upstream.
export const A4_DETECTION_MAX_EDGE=800;
export const A4_POLYGON_EPSILONS=[.014,.02,.03];
export const A4_CANNY_BLURS=[3,5];
export const A4_GROUP_LIMIT=8;
export const A4_REGION_OVERLAP=.65;
export const A4_CONTOUR_BONUS=.04;
const THRESHOLDS=[150,165,180,195,210,'otsu','edges','edges-low','lab-125','lab-130'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const area=points=>Math.abs(points.reduce((s,p,i)=>s+p.x*points[(i+1)%points.length].y-p.y*points[(i+1)%points.length].x,0))*.5;
export function orderPaperCorners(points){
  const center={x:points.reduce((s,p)=>s+p.x,0)/4,y:points.reduce((s,p)=>s+p.y,0)/4};
  const ordered=points.slice().sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
  const first=ordered.reduce((k,p,i)=>p.x+p.y<ordered[k].x+ordered[k].y?i:k,0);
  return ordered.slice(first).concat(ordered.slice(0,first));
}
export function paperPolygonIoU(a,b){
  if(a?.length!==4||b?.length!==4)return 0;
  let polygon=a.slice();
  for(let j=0;j<4&&polygon.length;j++){
    const p=b[j],q=b[(j+1)%4],next=[];
    for(let i=0;i<polygon.length;i++){
      const u=polygon[i],v=polygon[(i+1)%polygon.length];
      const du=cross(p,q,u),dv=cross(p,q,v);
      const insideU=du>=-1e-8,insideV=dv>=-1e-8;
      if(insideU)next.push(u);
      if(insideU!==insideV){
        const ratio=du/(du-dv);
        next.push({x:u.x+(v.x-u.x)*ratio,y:u.y+(v.y-u.y)*ratio});
      }
    }
    polygon=next;
  }
  const intersection=polygon.length>=3?area(polygon):0;
  const union=area(a)+area(b)-intersection;
  return union>0?intersection/union:0;
}
function bilinear(data,width,height,x,y){
  x=clamp(x,0,width-1);y=clamp(y,0,height-1);
  const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(width-1,ix+1),jy=Math.min(height-1,iy+1);
  const fx=x-ix,fy=y-iy,k=iy*width+ix;
  return ((data[k]*(1-fx)+data[iy*width+jx]*fx)*(1-fy)+
    (data[jy*width+ix]*(1-fx)+data[jy*width+jx]*fx)*fy);
}
function geometricProposal(cv,polygon,contourArea,w,h,paperRatio,source){
  if(polygon.rows!==4||!cv.isContourConvex(polygon))return null;
  const d=polygon.data32S;
  const points=orderPaperCorners(Array.from({length:4},(_,j)=>({x:d[j*2]/w,y:d[j*2+1]/h})));
  return assessShape(points,Math.abs(cv.contourArea(polygon))/(w*h),contourArea,w,h,paperRatio,source);
}
function assessShape(points,coverage,contourArea,w,h,paperRatio,source){
  if(coverage<.18||coverage>.96||
    points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||
      p.x<.004||p.x>.996||p.y<.004||p.y>.996))return null;
  const len=(a,b)=>Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);
  const pw=len(points[0],points[1])+len(points[2],points[3]);
  const ph=len(points[0],points[3])+len(points[1],points[2]);
  if(!(pw>0&&ph>0))return null;
  const ratio=Math.min(pw/ph,ph/pw);
  const expected=Math.min(paperRatio,1/paperRatio);
  const aspect=Math.min(ratio/expected,expected/ratio);
  if(aspect<.60)return null;
  const geom=Math.min(coverage/.65,1)*.48+aspect*.20+
    Math.min(contourArea/coverage,1)*.32;
  return {corners:points,geom,source,kind:'contour'};
}
function edgeEvidence(candidate,w,h,gray,gx,gy){
  const corners=candidate.corners;
  const sides=[];
  const d=clamp(Math.max(w,h)*.012,3,11);
  for(let j=0;j<4;j++){
    const a=corners[j],b=corners[(j+1)%4];
    const vx=(b.x-a.x)*w,vy=(b.y-a.y)*h;
    const len=Math.hypot(vx,vy);
    if(len<10)return null;
    const nx=-vy/len,ny=vx/len;
    let count=0,contrastSum=0,edgeHits=0;
    for(let t=0;t<96;t++){
      const step=.05+.9*t/95;
      const x=(a.x+(b.x-a.x)*step)*w;
      const y=(a.y+(b.y-a.y)*step)*h;
      if(x+nx*d<=0||x-nx*d>=w-1||
        y+ny*d<=0||y-ny*d>=h-1||x-nx*d<=0||x+nx*d>=w-1||
        y-ny*d<=0||y+ny*d>=h-1)continue;
      const contrast=bilinear(gray,w,h,x+nx*d,y+ny*d)-
        bilinear(gray,w,h,x-nx*d,y-ny*d);
      contrastSum+=clamp(contrast,0,100)/100;
      let bestGradient=0;
      for(const offset of [-2,0,2]){
        const sx=x+nx*offset,sy=y+ny*offset;
        const g=Math.abs(bilinear(gx,w,h,sx,sy)*nx+
          bilinear(gy,w,h,sx,sy)*ny);
        bestGradient=Math.max(bestGradient,g);
      }
      if(bestGradient>45)edgeHits++;
      count++;
    }
    if(count<60)return null;
    sides.push({contrast:contrastSum/count,edge:edgeHits/count});
  }
  const cs=sides.map(v=>v.contrast),es=sides.map(v=>v.edge);
  const avg=x=>x.reduce((a,b)=>a+b,0)/x.length;
  return .35*avg(cs)+.15*Math.min(...cs)+
    .20*avg(es)+.10*Math.min(...es);
}
function obtainContours(cv,mask,retrieval,own,visit){
  // Only Mats held past this call are worker-owned. MatVector contents are
  // promptly disposed rather than accumulating on a busy iPad.
  const contours=new cv.MatVector(),hierarchy=new cv.Mat();
  try{
    cv.findContours(mask,contours,hierarchy,retrieval,cv.CHAIN_APPROX_SIMPLE);
    for(let i=0;i<contours.size();i++){
      const contour=contours.get(i);
      try{visit(contour);}finally{contour.delete();}
    }
  }finally{hierarchy.delete();contours.delete();}
}
function rotatedRectangle(cv,contour,w,h){
  const rect=cv.minAreaRect(contour),theta=rect.angle*Math.PI/180;
  const ux=Math.cos(theta)*rect.size.width/2,uy=Math.sin(theta)*rect.size.width/2,
    vx=-Math.sin(theta)*rect.size.height/2,vy=Math.cos(theta)*rect.size.height/2;
  return orderPaperCorners([
    {x:(rect.center.x-ux-vx)/w,y:(rect.center.y-uy-vy)/h},
    {x:(rect.center.x+ux-vx)/w,y:(rect.center.y+uy-vy)/h},
    {x:(rect.center.x+ux+vx)/w,y:(rect.center.y+uy+vy)/h},
    {x:(rect.center.x-ux+vx)/w,y:(rect.center.y-uy+vy)/h}
  ]);
}
function regionMask(cv,channels,own,w,h){
  const mask=own(new cv.Mat()),temp=own(new cv.Mat());
  // Exact offline Lab-white criterion: 140<=L<=255,
  // 100<=a<=160, 100<=b<=158.
  const L=channels.get(0),a=channels.get(1),b=channels.get(2);
  try{
    cv.threshold(L,mask,139,255,cv.THRESH_BINARY);
    for(const [channel,threshold,inverse] of [
      [a,99,false],[a,160,true],[b,99,false],[b,158,true]
    ]){
      cv.threshold(channel,temp,threshold,255,
        inverse?cv.THRESH_BINARY_INV:cv.THRESH_BINARY);
      cv.bitwise_and(mask,temp,mask);
    }
  }finally{L.delete();a.delete();b.delete();}
  const close=own(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(11,11)));
  const open=own(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5)));
  cv.morphologyEx(mask,mask,cv.MORPH_CLOSE,close);
  cv.morphologyEx(mask,mask,cv.MORPH_OPEN,open);
  return mask;
}
function refineRegionLines(cv,candidate,light,w,h,own){
  // Applied only to the strongest Lab hull, never to every raw contour.
  // Four independently movable/rotatable lines (the tested region 2D fit).
  const gx=own(new cv.Mat()),gy=own(new cv.Mat());
  cv.Scharr(light,gx,cv.CV_32F,1,0);
  cv.Scharr(light,gy,cv.CV_32F,0,1);
  const gxData=gx.data32F,gyData=gy.data32F,L=light.data;
  const rough=candidate.corners.map(p=>({x:p.x*w,y:p.y*h}));
  const search=Math.round(Math.max(w,h)*.13);
  const lines=[],slopes=[-.14,-.08,0,.08,.14];
  for(let j=0;j<4;j++){
    const a=rough[j],b=rough[(j+1)%4],vx=b.x-a.x,vy=b.y-a.y;
    const span=Math.hypot(vx,vy);
    if(span<50)return null;
    const nx=-vy/span,ny=vx/span;
    let best=-Infinity,bestShift=0,bestSlope=0;
    for(const slope of slopes){
      for(let shift=-search;shift<=search;shift+=4){
        const values=[];let sum=0,delta=0;
        for(let i=0;i<67;i++){
          const t=.07+.86*i/66,offset=shift+slope*span*(t-.5);
          const x=a.x+t*vx+offset*nx,y=a.y+t*vy+offset*ny;
          const grad=Math.abs(bilinear(gxData,w,h,x,y)*nx+
            bilinear(gyData,w,h,x,y)*ny);
          const contrast=bilinear(L,w,h,x+9*nx,y+9*ny)-
            bilinear(L,w,h,x-9*nx,y-9*ny);
          const value=clamp(grad/320,0,2)*.35+
            clamp(contrast/34,0,2)*.65;
          sum+=value;values.push(value);
          delta+=Math.abs(offset)/search;
        }
        values.sort((a,b)=>a-b);
        const middle=values[33];
        const score=.6*middle+.4*sum/67-.15*delta/67;
        if(score>best){best=score;bestShift=shift;bestSlope=slope;}
      }
    }
    lines.push([
      {x:a.x+(bestShift-.5*bestSlope*span)*nx,y:a.y+(bestShift-.5*bestSlope*span)*ny},
      {x:b.x+(bestShift+.5*bestSlope*span)*nx,y:b.y+(bestShift+.5*bestSlope*span)*ny}
    ]);
  }
  const result=[];
  for(let j=0;j<4;j++){
    const [a,b]=lines[(j+3)%4],[c,d]=lines[j];
    const v={x:b.x-a.x,y:b.y-a.y},u={x:d.x-c.x,y:d.y-c.y};
    const det=v.x*u.y-v.y*u.x;
    if(Math.abs(det)<.07*length(a,b)*length(c,d)){result.push(rough[j]);continue;}
    const diff={x:c.x-a.x,y:c.y-a.y};
    const t=(diff.x*u.y-diff.y*u.x)/det;
    const intersection={x:a.x+t*v.x,y:a.y+t*v.y};
    result.push(length(intersection,rough[j])>1.5*search?rough[j]:intersection);
  }
  return orderPaperCorners(result.map(p=>({x:p.x/w,y:p.y/h})));
}
export function detectPaperQuadOptimized(cv,p,own){
  if(!(p.width>0&&p.height>0)||!p.pixels?.length)return null;
  const w=p.width,h=p.height,paperRatio=p.paperRatio||210/297;
  const src=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels));
  const gray=own(new cv.Mat()),rgb=own(new cv.Mat()),
    lab=own(new cv.Mat()),labChannels=own(new cv.MatVector());
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);
  cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
  cv.split(lab,labChannels);
  const blueYellow=own(labChannels.get(2));
  const close5=own(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5)));
  const blur3=own(new cv.Mat()),blur5=own(new cv.Mat());
  cv.GaussianBlur(gray,blur3,new cv.Size(3,3),0);
  cv.GaussianBlur(gray,blur5,new cv.Size(5,5),0);
  const proposals=[];
  for(const threshold of THRESHOLDS){
    const edge=threshold==='edges'||threshold==='edges-low';
    const views=edge?[3,5]:[0];
    for(const smoothing of views){
      const binary=new cv.Mat();
      try{
        if(edge){
          cv.Canny(smoothing===3?blur3:blur5,binary,
            threshold==='edges-low'?15:40,threshold==='edges-low'?45:120);
          cv.morphologyEx(binary,binary,cv.MORPH_CLOSE,close5);
        }else if(String(threshold).startsWith('lab-')){
          cv.threshold(blueYellow,binary,Number(threshold.slice(4)),255,cv.THRESH_BINARY_INV);
        }else{
          cv.threshold(gray,binary,threshold==='otsu'?0:threshold,255,
            cv.THRESH_BINARY|(threshold==='otsu'?cv.THRESH_OTSU:0));
        }
        obtainContours(cv,binary,edge?cv.RETR_LIST:cv.RETR_EXTERNAL,own,contour=>{
          const fraction=cv.contourArea(contour)/(w*h);
          if(fraction<.14)return;
          const perimeter=cv.arcLength(contour,true);
          const source=edge?threshold+'_blur'+smoothing:String(threshold);
          for(const epsilon of A4_POLYGON_EPSILONS){
            const poly=new cv.Mat();
            try{
              cv.approxPolyDP(contour,poly,perimeter*epsilon,true);
              const cand=geometricProposal(cv,poly,fraction,w,h,paperRatio,source);
              if(cand)proposals.push(cand);
            }finally{poly.delete();}
          }
        });
      }finally{binary.delete();}
    }
  }
  // Dedupe proposals before any full-image Sobel: each paper is scored once.
  proposals.sort((a,b)=>b.geom-a.geom);
  const groups=[];
  for(const cand of proposals){
    let group=groups.find(g=>paperPolygonIoU(g[0].corners,cand.corners)>=.92);
    if(group){if(cand.geom>group[0].geom)group.unshift(cand);else group.push(cand);}
    else groups.push([cand]);
  }
  groups.sort((a,b)=>b[0].geom-a[0].geom);
  const standard=groups.slice(0,A4_GROUP_LIMIT).map(g=>g[0]);
  // The Lab region hypothesis is independent of threshold-based quadrangles.
  // Keep it only when it overlaps an existing conventional paper location.
  const region=regionMask(cv,labChannels,own,w,h);
  const regionCandidates=[];
  const rawRegions=[];
  obtainContours(cv,region,cv.RETR_EXTERNAL,own,contour=>{
    const fraction=cv.contourArea(contour)/(w*h);
    if(fraction>=.09)rawRegions.push({fraction,pts:Array.from(contour.data32S)});
  });
  rawRegions.sort((a,b)=>b.fraction-a.fraction);
  // Rebuild only the two largest region contours for min-area/hull.
  for(const data of rawRegions.slice(0,2)){
    const contour=cv.matFromArray(data.pts.length/2,1,cv.CV_32SC2,data.pts);
    try{
      const rect=rotatedRectangle(cv,contour,w,h);
      const rectCandidate=assessShape(rect,area(rect),area(rect),w,h,paperRatio,'region-rect');
      if(rectCandidate)regionCandidates.push({...rectCandidate,kind:'region'});
      const hull=new cv.Mat();
      try{
        cv.convexHull(contour,hull,false,true);
        const perimeter=cv.arcLength(hull,true);
        for(const eps of [.015,.025,.04,.06,.09]){
          const poly=new cv.Mat();
          try{
            cv.approxPolyDP(hull,poly,perimeter*eps,true);
            const cand=geometricProposal(cv,poly,data.fraction,w,h,paperRatio,'region-hull');
            if(cand){
              regionCandidates.push({...cand,kind:'region',hull:true});
              break;
            }
          }finally{poly.delete();}
        }
      }finally{hull.delete();}
    }finally{contour.delete();}
  }
  // Regional fit is expensive; do it once and reuse previously split Lab L.
  const firstHull=regionCandidates.find(c=>c.hull);
  if(firstHull){
    const light=labChannels.get(0);
    try{
      const refined=refineRegionLines(cv,firstHull,light,w,h,own);
      if(refined){
        const candidate=assessShape(refined,area(refined),area(refined),w,h,paperRatio,'region-refined');
        if(candidate)regionCandidates.push({...candidate,kind:'region'});
      }
    }finally{light.delete();}
  }
  const compatible=regionCandidates.filter(r=>!standard.length||
    standard.some(c=>paperPolygonIoU(c.corners,r.corners)>=A4_REGION_OVERLAP));
  const ranked=standard.concat(compatible);
  if(!ranked.length)return null;
  // Build Sobel only when there is a candidate to score; all share it.
  const gx=own(new cv.Mat()),gy=own(new cv.Mat());
  cv.Sobel(gray,gx,cv.CV_32F,1,0,3);
  cv.Sobel(gray,gy,cv.CV_32F,0,1,3);
  const G=gray.data,GX=gx.data32F,GY=gy.data32F;
  let best=null;
  for(const candidate of ranked){
    const score=edgeEvidence(candidate,w,h,G,GX,GY);
    if(score==null)continue;
    // +.04 closed-contour advantage from the conservative offline policy.
    const total=score+(candidate.kind==='region'?0:A4_CONTOUR_BONUS);
    if(!best||total>best.score)best={score:total,corners:candidate.corners};
  }
  return best?.corners||null;
}
