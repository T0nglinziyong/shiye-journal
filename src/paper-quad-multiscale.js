// Lightweight multi-scale paper quadrilateral finder. No ML, Hough fitting,
// other canvas processing, or changes to the material recognition pipeline.
// The caller supplies one <=1200px RGBA frame. Lower scales are built inside
// the same OpenCV worker; coordinates stay normalized to that source frame.
export const PAPER_QUAD_SCALES=[400,800,1200];
export const PAPER_QUAD_THRESHOLDS=[165,180,'edges','edges-low','lab-130'];
export const PAPER_QUAD_EPSILONS=[.012,.02,.032];

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const edge=(a,b,w,h)=>Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);
export function paperQuadAgreement(a,b){
  if(!a?.corners||!b?.corners||a.corners.length!==4||b.corners.length!==4)return false;
  const distances=a.corners.map((p,i)=>distance(p,b.corners[i]));
  // Coordinates are normalized across image resolutions, not pixel-aligned.
  return distances.reduce((s,v)=>s+v,0)/4<=.065&&Math.max(...distances)<=.14;
}
const median=values=>{
  const sorted=values.slice().sort((a,b)=>a-b),m=sorted.length>>1;
  return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;
};
export function selectPaperQuad(candidates){
  if(!Array.isArray(candidates)||!candidates.length)return null;
  const sorted=candidates.filter(c=>c?.corners?.length===4&&
    Number.isFinite(c.score)).sort((a,b)=>b.score-a.score);
  const groups=[];
  for(const candidate of sorted){
    let group=groups.find(g=>paperQuadAgreement(g[0],candidate));
    if(!group){group=[];groups.push(group);}
    // One threshold cannot cast several independent votes in the same scale.
    if(!group.some(previous=>previous.scale===candidate.scale))group.push(candidate);
  }
  groups.sort((a,b)=>{
    if(b.length!==a.length)return b.length-a.length;
    return Math.max(...b.map(x=>x.score))-Math.max(...a.map(x=>x.score));
  });
  const group=groups[0];
  if(!group)return null;
  // A single strong-scale candidate is preferable to failing automatic
  // correction outright. Weak singles are not mistaken for consensus.
  if(group.length===1&&group[0].score<.56)return null;
  const corners=Array.from({length:4},(_,i)=>({
    x:median(group.map(v=>v.corners[i].x)),
    y:median(group.map(v=>v.corners[i].y))
  }));
  return {corners,scales:group.map(c=>c.scale).sort((a,b)=>a-b),
    score:Math.max(...group.map(c=>c.score)),votes:group.length};
}
function findScaleCandidates(cv,source,width,height,scale,own,paperRatio){
  const long=Math.max(width,height),ratio=Math.min(1,scale/long);
  const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
  const rgba=w===width&&h===height?source:own(new cv.Mat());
  if(rgba!==source)cv.resize(source,rgba,new cv.Size(w,h),0,0,cv.INTER_AREA);
  const gray=own(new cv.Mat());
  cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);
  const blur=own(new cv.Mat()),rgb=own(new cv.Mat()),lab=own(new cv.Mat()),
    channels=own(new cv.MatVector());
  cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);
  cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
  cv.split(lab,channels);
  const blueYellow=own(channels.get(2));
  const kernel=own(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5)));
  const expected=Math.min(paperRatio,1/paperRatio),raw=[];
  for(const threshold of PAPER_QUAD_THRESHOLDS){
    const binary=own(new cv.Mat());
    const isEdge=threshold==='edges'||threshold==='edges-low';
    if(isEdge){
      cv.Canny(blur,binary,threshold==='edges-low'?15:40,
        threshold==='edges-low'?45:120);
      cv.morphologyEx(binary,binary,cv.MORPH_CLOSE,kernel);
    }else if(threshold==='lab-130')
      cv.threshold(blueYellow,binary,130,255,cv.THRESH_BINARY_INV);
    else cv.threshold(gray,binary,threshold,255,cv.THRESH_BINARY);
    const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());
    cv.findContours(binary,contours,hierarchy,isEdge?cv.RETR_LIST:cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE);
    for(let i=0;i<contours.size();i++){
      const contour=contours.get(i);
      try{
        const area=cv.contourArea(contour)/(w*h);
        if(area<.12)continue;
        const perimeter=cv.arcLength(contour,true);
        for(const epsilon of PAPER_QUAD_EPSILONS){
          const polygon=new cv.Mat();
          try{
            cv.approxPolyDP(contour,polygon,perimeter*epsilon,true);
            if(polygon.rows!==4||!cv.isContourConvex(polygon))continue;
            const corners=Array.from({length:4},(_,j)=>({
              x:polygon.data32S[j*2]/w,y:polygon.data32S[j*2+1]/h
            }));
            const center={x:corners.reduce((s,v)=>s+v.x,0)/4,
              y:corners.reduce((s,v)=>s+v.y,0)/4};
            corners.sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-
              Math.atan2(b.y-center.y,b.x-center.x));
            const start=corners.reduce((best,p,j)=>
              p.x+p.y<corners[best].x+corners[best].y?j:best,0);
            const ordered=corners.slice(start).concat(corners.slice(0,start));
            const coverage=Math.abs(cv.contourArea(polygon))/(w*h);
            if(coverage<.14||coverage>.975||
              ordered.some(p=>p.x<.002||p.x>.998||p.y<.002||p.y>.998))continue;
            const pw=edge(ordered[0],ordered[1],w,h)+edge(ordered[2],ordered[3],w,h);
            const ph=edge(ordered[0],ordered[3],w,h)+edge(ordered[1],ordered[2],w,h);
            if(!(pw>0&&ph>0))continue;
            const ratio=Math.min(pw/ph,ph/pw),aspect=Math.min(ratio/expected,expected/ratio);
            if(aspect<.52)continue;
            const score=Math.min(coverage/.65,1)*.48+aspect*.20+
              Math.min(area/coverage,1)*.32;
            raw.push({corners:ordered,scale,score});
          }finally{polygon.delete();}
        }
      }finally{contour.delete();}
    }
  }
  // Dedupe thresholds within each scale before consensus; a scale gives only
  // one vote even if multiple methods recognize the same four edges.
  raw.sort((a,b)=>b.score-a.score);
  const distinct=[];
  for(const candidate of raw){
    if(!distinct.some(c=>paperQuadAgreement(c,candidate)))distinct.push(candidate);
    if(distinct.length>=8)break;
  }
  return distinct;
}
export function detectPaperQuadMultiScale(cv,p,own){
  if(!(p.width>0&&p.height>0)||!p.pixels?.length)return null;
  const image=own(cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels));
  const found=[];
  for(const scale of PAPER_QUAD_SCALES)
    found.push(...findScaleCandidates(cv,image,p.width,p.height,scale,own,
      p.paperRatio||210/297));
  return selectPaperQuad(found)?.corners||null;
}
