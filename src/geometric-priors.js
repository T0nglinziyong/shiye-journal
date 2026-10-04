// Piecewise line/curve prior for physical material boundaries.
//
// This is intentionally NOT a rectangle/ellipse classifier. The boundary is
// represented as the simplest sequence of straight and smooth curved segments
// that still explains the observed physical support. Rectangles and ovals then
// emerge naturally as special cases, while irregular stickers remain mixed
// line/curve contours.
//
// The regularizer has three priors:
// - line prior: long runs with low orthogonal residual become a single line;
// - curve prior: non-linear runs are smoothed in arc-length order;
// - complexity prior: only strong, spatially separated turns become corners,
//   preventing pixel serrations from creating many short segments.

const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=(i,n)=>(i%n+n)%n;

function contourPoints(contour){
  return Array.from({length:contour.rows},(_,i)=>[contour.data32S[i*2],contour.data32S[i*2+1]]);
}
function perimeter(points){
  let out=0;for(let i=0;i<points.length;i++)out+=dist(points[i],points[(i+1)%points.length]);return out;
}
function resampleClosed(points,spacing){
  if(points.length<3)return points;
  const seg=[],cum=[0];let total=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],d=dist(a,b);seg.push(d);total+=d;cum.push(total);}
  const count=clamp(Math.round(total/Math.max(.75,spacing)),24,320),out=[];
  let edge=0;
  for(let k=0;k<count;k++){
    const target=k*total/count;while(edge<seg.length-1&&cum[edge+1]<target)edge++;
    const a=points[edge],b=points[(edge+1)%points.length],d=Math.max(seg[edge],1e-9),t=(target-cum[edge])/d;
    out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
  }
  return out;
}
function turning(points,i,window){
  const n=points.length,a=points[wrap(i-window,n)],b=points[i],c=points[wrap(i+window,n)];
  const u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]],lu=Math.hypot(...u),lv=Math.hypot(...v);
  if(lu<1e-6||lv<1e-6)return 0;
  return Math.acos(clamp((u[0]*v[0]+u[1]*v[1])/(lu*lv),-1,1));
}
function corners(points,pxPerMM){
  // Curvature is estimated on a smoothed copy only for corner discovery.
  // The original samples are still used for fitting, so smoothing cannot move
  // the physical boundary itself.
  const probe=smoothClosed(points,3),n=probe.length,window=clamp(Math.round(pxPerMM*2.2/Math.max(perimeter(probe)/n,1)),3,Math.max(3,Math.floor(n/8))),threshold=.58,minSep=Math.max(5,Math.round(n*.045));
  const raw=[];
  for(let i=0;i<n;i++){const score=turning(probe,i,window);if(score>=threshold)raw.push({i,score});}
  raw.sort((a,b)=>b.score-a.score);
  const selected=[];
  const circularDistance=(a,b)=>Math.min(Math.abs(a-b),n-Math.abs(a-b));
  for(const item of raw){if(selected.every(x=>circularDistance(x.i,item.i)>=minSep))selected.push(item);if(selected.length>=16)break;}
  return selected.map(x=>x.i).sort((a,b)=>a-b);
}
function simplifyCorners(points,cut,pxPerMM){
  const corners=[...cut];
  let changed=true;
  // Minimum-description-length step: if the two arcs around a supposed
  // corner are jointly explained by one long line, paying for an extra corner
  // is unnecessary. This removes small bites/notches without erasing real 90°
  // or other strong turns.
  while(changed&&corners.length>=3){
    changed=false;
    for(let j=0;j<corners.length;j++){
      const prev=corners[wrap(j-1,corners.length)],next=corners[(j+1)%corners.length],fit=lineFit(arc(points,prev,next));
      const rmsLimit=Math.max(1,pxPerMM*.45),maxLimit=Math.max(3.2,pxPerMM*1.35),ratio=fit.rms/Math.max(fit.length,1);
      if(fit.length>=Math.max(8,pxPerMM*3)&&fit.rms<=rmsLimit&&fit.max<=maxLimit&&ratio<=.025){corners.splice(j,1);changed=true;break;}
    }
  }
  return corners;
}
function arc(points,start,end){
  const n=points.length,out=[points[start]];let i=start;
  while(i!==end){i=(i+1)%n;out.push(points[i]);if(out.length>n+1)break;}return out;
}
function lineFit(points){
  const n=points.length,cx=points.reduce((s,p)=>s+p[0],0)/n,cy=points.reduce((s,p)=>s+p[1],0)/n;
  let xx=0,xy=0,yy=0;for(const [x,y] of points){const dx=x-cx,dy=y-cy;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}
  const angle=.5*Math.atan2(2*xy,xx-yy),dir=[Math.cos(angle),Math.sin(angle)],normal=[-dir[1],dir[0]],errors=[],proj=[];
  for(const [x,y] of points){const dx=x-cx,dy=y-cy;errors.push(Math.abs(dx*normal[0]+dy*normal[1]));proj.push(dx*dir[0]+dy*dir[1]);}
  const rms=Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/n),max=Math.max(...errors),length=Math.max(...proj)-Math.min(...proj);
  return {center:[cx,cy],dir,rms,max,length};
}
function lineIntersection(a,b,fallback,maxDistance){
  const p=a.center,r=a.dir,q=b.center,s=b.dir,cross=r[0]*s[1]-r[1]*s[0];
  if(Math.abs(cross)<1e-4)return fallback;
  const qp=[q[0]-p[0],q[1]-p[1]],t=(qp[0]*s[1]-qp[1]*s[0])/cross,hit=[p[0]+t*r[0],p[1]+t*r[1]];
  return dist(hit,fallback)<=maxDistance?hit:fallback;
}
function smoothOpen(points,iterations=3){
  let out=points.map(p=>[...p]);
  for(let it=0;it<iterations;it++){const next=out.map(p=>[...p]);for(let i=1;i<out.length-1;i++){next[i]=[(out[i-1][0]+2*out[i][0]+out[i+1][0])/4,(out[i-1][1]+2*out[i][1]+out[i+1][1])/4];}out=next;}
  return out;
}
function smoothClosed(points,iterations=4){
  let out=points.map(p=>[...p]),n=out.length;
  for(let it=0;it<iterations;it++){const next=[];for(let i=0;i<n;i++){const a=out[wrap(i-1,n)],b=out[i],c=out[(i+1)%n];next.push([(a[0]+2*b[0]+c[0])/4,(a[1]+2*b[1]+c[1])/4]);}out=next;}
  return out;
}
function detectLineRuns(points,pxPerMM){
  const n=points.length,total=perimeter(points),spacing=total/n,perimeterMM=total/pxPerMM,windowMM=Math.min(14,Math.max(4,perimeterMM/6)),half=clamp(Math.round(windowMM*pxPerMM/Math.max(spacing,1)/2),2,Math.max(2,Math.floor(n/8)));
  const lineLike=new Array(n).fill(false),rmsLimit=Math.max(.55,pxPerMM*.38),maxLimit=Math.max(1.8,pxPerMM*1.1);
  for(let i=0;i<n;i++){
    const sample=[];for(let k=-half;k<=half;k++)sample.push(points[wrap(i+k,n)]);
    const fit=lineFit(sample),ratio=fit.rms/Math.max(fit.length,1);
    lineLike[i]=fit.rms<=rmsLimit&&fit.max<=maxLimit&&ratio<=.025;
  }
  let groups=[];
  if(lineLike.every(Boolean))groups=[Array.from({length:n},(_,i)=>i)];
  else{
    const firstFalse=lineLike.findIndex(x=>!x);let current=[];
    for(let step=1;step<=n;step++){const i=wrap(firstFalse+step,n);if(lineLike[i])current.push(i);else if(current.length){groups.push(current);current=[];}}
    if(current.length)groups.push(current);
  }
  const minLineMM=Math.max(3,Math.min(8,perimeterMM*.12)),runs=[];
  for(const indices of groups){
    if(indices.length<2)continue;const fit=lineFit(indices.map(i=>points[i]));
    if(fit.length/pxPerMM>=minLineMM&&fit.rms<=Math.max(.8,pxPerMM*.45))runs.push({indices,fit});
  }
  return {runs,lineLike};
}
function lineIntersectionUnbounded(a,b,fallback,maxDistance){
  return lineIntersection(a,b,fallback,maxDistance);
}
function matFromPoints(cv,points,own){
  const ints=points.flatMap(([x,y])=>[Math.round(x),Math.round(y)]);return own(cv.matFromArray(points.length,1,cv.CV_32SC2,ints));
}
function contourMask(cv,width,height,contour,own,value=255){
  const out=own(cv.Mat.zeros(height,width,cv.CV_8UC1)),v=own(new cv.MatVector());v.push_back(contour);cv.drawContours(out,v,-1,new cv.Scalar(value),cv.FILLED);return out;
}

export function regularizeContour(cv,contour,own,pxPerMM,{closed=true}={}){
  const raw=contourPoints(contour),spacing=Math.max(1,pxPerMM*.55),points=resampleClosed(raw,spacing);
  if(points.length<8)return {points:raw,primitives:[{type:'curve'}],corners:0,lineCount:0,curveCount:1};
  const {runs,lineLike}=detectLineRuns(points,pxPerMM),n=points.length,output=points.map(p=>[...p]),isLine=new Array(n).fill(false),primitives=[];
  for(const run of runs){
    const {center,dir}=run.fit;
    for(const i of run.indices){
      const p=points[i],dx=p[0]-center[0],dy=p[1]-center[1],t=dx*dir[0]+dy*dir[1];output[i]=[center[0]+t*dir[0],center[1]+t*dir[1]];isLine[i]=true;
    }
    primitives.push({type:'line',length:run.fit.length,rms:run.fit.rms});
  }
  // Smooth only the points not explained by a straight run. Straight runs
  // remain exactly collinear while curved intervals lose pixel serrations.
  for(let it=0;it<4;it++){
    const next=output.map(p=>[...p]);
    for(let i=0;i<n;i++)if(!isLine[i]){
      const a=output[wrap(i-1,n)],b=output[i],d=output[(i+1)%n];next[i]=[(a[0]+2*b[0]+d[0])/4,(a[1]+2*b[1]+d[1])/4];
    }
    for(let i=0;i<n;i++)if(!isLine[i])output[i]=next[i];
  }
  // Adjacent dominant lines with only a short curved gap meet at one physical
  // corner. Snap that tiny transition to their intersection rather than
  // preserving a rounded Canny corner.
  const ordered=[...runs].sort((a,b)=>a.indices[0]-b.indices[0]),maxGapPx=pxPerMM*3;
  for(let r=0;r<ordered.length;r++){
    const left=ordered[r],right=ordered[(r+1)%ordered.length],end=left.indices[left.indices.length-1],start=right.indices[0];
    const gap=[];let i=end;while(true){i=wrap(i+1,n);if(i===start)break;gap.push(i);if(gap.length>n)break;}
    if(!gap.length||gap.length*spacing>maxGapPx)continue;
    const angle=Math.acos(clamp(Math.abs(left.fit.dir[0]*right.fit.dir[0]+left.fit.dir[1]*right.fit.dir[1]),-1,1));
    if(angle<.22)continue;
    const fallback=points[gap[Math.floor(gap.length/2)]],hit=lineIntersectionUnbounded(left.fit,right.fit,fallback,Math.max(4,pxPerMM*3));
    for(const j of gap){output[j]=[...hit];isLine[j]=true;}
  }
  // Curve primitives are the remaining non-line runs after corner snapping.
  const curveFlags=output.map((_,i)=>!isLine[i]),curveGroups=[];
  if(curveFlags.some(Boolean)){
    if(curveFlags.every(Boolean))curveGroups.push(Array.from({length:n},(_,i)=>i));
    else{
      const firstFalse=curveFlags.findIndex(x=>!x);let current=[];
      for(let step=1;step<=n;step++){const i=wrap(firstFalse+step,n);if(curveFlags[i])current.push(i);else if(current.length){curveGroups.push(current);current=[];}}
      if(current.length)curveGroups.push(current);
    }
  }
  for(const group of curveGroups)if(group.length*spacing>=Math.max(2,pxPerMM*1.2))primitives.push({type:'curve',samples:group.length});
  // Remove consecutive duplicates introduced by corner snapping.
  const clean=[];for(const p of output)if(!clean.length||dist(p,clean[clean.length-1])>.25)clean.push(p);
  if(clean.length>2&&dist(clean[0],clean[clean.length-1])<.25)clean.pop();
  // Douglas-Peucker here is only a representation compression step. When
  // most of the perimeter is already explained by straight runs, use a
  // stronger physical-scale tolerance so a card edge is represented by one
  // line rather than dozens of collinear samples. Curved carriers retain the
  // gentler tolerance.
  const lineCoverage=isLine.filter(Boolean).length/Math.max(1,n),lineDominant=runs.length>=3&&lineCoverage>=.58;
  let simplified=clean;
  if(clean.length>=4){
    const raw=matFromPoints(cv,clean,own),poly=own(new cv.Mat()),epsilon=lineDominant?Math.max(.8,pxPerMM*.62):Math.max(.45,pxPerMM*.16);
    cv.approxPolyDP(raw,poly,epsilon,true);
    if(poly.rows>=3)simplified=contourPoints(poly);
  }
  const meaningfulCurves=primitives.filter(x=>x.type==='curve'&&(x.samples||0)*spacing>=Math.max(lineDominant?pxPerMM*4.5:pxPerMM*2.4,3));
  const linePrimitives=primitives.filter(x=>x.type==='line');
  return {points:simplified,primitives:[...linePrimitives,...meaningfulCurves],corners:Math.max(0,ordered.length),lineCount:runs.length,curveCount:meaningfulCurves.length,lineCoverage};
}


function maskIoU(cv,a,b,own){
  const inter=own(new cv.Mat()),union=own(new cv.Mat());cv.bitwise_and(a,b,inter);cv.bitwise_or(a,b,union);
  return cv.countNonZero(inter)/Math.max(1,cv.countNonZero(union));
}
function lineEnvelope(cv,source,rgb,lab,own,pxPerMM){
  if(!rgb||!lab)return null;
  const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(source,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let contour=null,area=0;for(let i=0;i<contours.size();i++){const q=own(contours.get(i)),a=cv.contourArea(q);if(a>area){area=a;contour=q;}}
  if(!contour||area<32)return null;
  const rect=cv.boundingRect(contour),minLine=Math.max(20,Math.round(Math.max(rect.width,rect.height)*.22));
  const gray=own(new cv.Mat()),blur=own(new cv.Mat()),edges=own(new cv.Mat()),channels=own(new cv.MatVector()),aBlur=own(new cv.Mat()),bBlur=own(new cv.Mat()),aEdge=own(new cv.Mat()),bEdge=own(new cv.Mat());
  cv.cvtColor(rgb,gray,cv.COLOR_RGB2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(3,3),0);cv.Canny(blur,edges,18,56);
  cv.split(lab,channels);const ac=own(channels.get(1)),bc=own(channels.get(2));cv.GaussianBlur(ac,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(bc,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,aEdge,4,14);cv.Canny(bBlur,bEdge,4,14);cv.bitwise_or(edges,aEdge,edges);cv.bitwise_or(edges,bEdge,edges);
  let ringSize=Math.max(3,Math.min(31,Math.round(pxPerMM*2.3)));if(!(ringSize&1))ringSize++;
  const ringKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringSize,ringSize))),dil=own(new cv.Mat()),ero=own(new cv.Mat()),ring=own(new cv.Mat());
  cv.dilate(source,dil,ringKernel);cv.erode(source,ero,ringKernel);cv.subtract(dil,ero,ring);cv.bitwise_and(edges,ring,edges);
  const lines=own(new cv.Mat());cv.HoughLinesP(edges,lines,1,Math.PI/360,Math.max(18,Math.round(minLine*.18)),minLine,Math.max(6,Math.round(pxPerMM*3)));
  if(!lines.rows||lines.rows<4)return null;
  const candidates=[],bins=36,weights=new Array(bins).fill(0);
  for(let i=0;i<lines.rows;i++){
    const at=i*4,x1=lines.data32S[at],y1=lines.data32S[at+1],x2=lines.data32S[at+2],y2=lines.data32S[at+3],dx=x2-x1,dy=y2-y1,length=Math.hypot(dx,dy);
    if(length<minLine)continue;const theta=((Math.atan2(dy,dx)%Math.PI)+Math.PI)%Math.PI,mid=[(x1+x2)/2,(y1+y2)/2],normal=[-Math.sin(theta),Math.cos(theta)],rho=normal[0]*mid[0]+normal[1]*mid[1],bin=Math.floor(theta/Math.PI*bins)%bins;
    weights[bin]+=length;candidates.push({theta,rho,length});
  }
  if(candidates.length<4)return null;
  const angleDiff=(a,b)=>Math.min(Math.abs(a-b),Math.PI-Math.abs(a-b)),order=[...weights.keys()].sort((a,b)=>weights[b]-weights[a]),modes=[];
  for(const bin of order){if(weights[bin]<=0)continue;const theta=(bin+.5)*Math.PI/bins;if(modes.every(m=>angleDiff(theta,m)>Math.PI/7))modes.push(theta);if(modes.length===2)break;}
  if(modes.length<2||angleDiff(modes[0],modes[1])<Math.PI/5)return null;
  const refined=[];
  for(const mode of modes){
    const group=candidates.filter(q=>angleDiff(q.theta,mode)<Math.PI/15);if(group.length<2)return null;
    let C=0,S=0;for(const q of group){C+=q.length*Math.cos(2*q.theta);S+=q.length*Math.sin(2*q.theta);}refined.push(((.5*Math.atan2(S,C))%Math.PI+Math.PI)%Math.PI);
  }
  const points=Array.from({length:contour.rows},(_,i)=>[contour.data32S[i*2],contour.data32S[i*2+1]]),chosen=[];
  for(const theta of refined){
    const normal=[-Math.sin(theta),Math.cos(theta)],projections=points.map(p=>normal[0]*p[0]+normal[1]*p[1]).sort((a,b)=>a-b),targets=[projections[Math.floor(projections.length*.04)],projections[Math.floor(projections.length*.96)]],group=candidates.filter(q=>angleDiff(q.theta,theta)<Math.PI/18).map(q=>{
      const qn=[-Math.sin(q.theta),Math.cos(q.theta)],sign=qn[0]*normal[0]+qn[1]*normal[1]>=0?1:-1;return {rho:q.rho*sign,length:q.length};
    });
    if(group.length<2)return null;
    for(const target of targets){group.sort((a,b)=>(Math.abs(a.rho-target)-a.length*.002)-(Math.abs(b.rho-target)-b.length*.002));chosen.push({theta,rho:group[0].rho});}
  }
  const intersect=(a,b)=>{
    const n1=[-Math.sin(a.theta),Math.cos(a.theta)],n2=[-Math.sin(b.theta),Math.cos(b.theta)],det=n1[0]*n2[1]-n1[1]*n2[0];if(Math.abs(det)<1e-4)return null;
    return [(a.rho*n2[1]-n1[1]*b.rho)/det,(n1[0]*b.rho-a.rho*n2[0])/det];
  };
  const corners=[];for(let i=0;i<2;i++)for(let j=2;j<4;j++){const p=intersect(chosen[i],chosen[j]);if(!p)return null;corners.push(p);}
  const center=[corners.reduce((s,p)=>s+p[0],0)/4,corners.reduce((s,p)=>s+p[1],0)/4];corners.sort((a,b)=>Math.atan2(a[1]-center[1],a[0]-center[0])-Math.atan2(b[1]-center[1],b[0]-center[0]));
  const poly=own(cv.matFromArray(4,1,cv.CV_32SC2,corners.flatMap(([x,y])=>[Math.round(x),Math.round(y)]))),mask=contourMask(cv,source.cols,source.rows,poly,own),iou=maskIoU(cv,source,mask,own),ratio=cv.countNonZero(mask)/Math.max(1,cv.countNonZero(source));
  if(iou<.78||ratio<.62||ratio>1.48)return null;
  return {mask,boundaryModel:'line-envelope',primitives:[{type:'line'},{type:'line'},{type:'line'},{type:'line'}],cornerCount:4,lineCount:4,curveCount:0,polygon:corners,iou};
}

export function regularizeOuterSupport(cv,source,own,pxPerMM,{rgb=null,lab=null}={}){
  let clean=own(new cv.Mat()),kernelSize=Math.max(3,Math.min(11,Math.round(pxPerMM*.75)));if(!(kernelSize&1))kernelSize++;
  const kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(kernelSize,kernelSize)));cv.morphologyEx(source,clean,cv.MORPH_CLOSE,kernel);cv.morphologyEx(clean,clean,cv.MORPH_OPEN,kernel);
  const envelope=lineEnvelope(cv,clean,rgb,lab,own,pxPerMM);if(envelope)return envelope;
  const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(clean,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let largest=null,area=0;for(let i=0;i<contours.size();i++){const q=own(contours.get(i)),a=cv.contourArea(q);if(a>area){area=a;largest=q;}}
  if(!largest||area<16)return {mask:source,boundaryModel:'line-curve',primitives:[],polygon:null};
  const reg=regularizeContour(cv,largest,own,pxPerMM),rContour=matFromPoints(cv,reg.points,own),mask=contourMask(cv,source.cols,source.rows,rContour,own);
  return {mask,boundaryModel:'line-curve',primitives:reg.primitives,cornerCount:reg.corners,lineCount:reg.lineCount,curveCount:reg.curveCount,polygon:reg.points};
}

export function carveEnclosedPageRegions(cv,{mask,outer,lab,gray,pageL,pageA,pageB,pageN,evidence,pxPerMM},own){
  if(!pageN)return {count:0,regions:[]};
  const rows=mask.rows,cols=mask.cols,outerArea=Math.max(1,cv.countNonZero(outer)),pageLike=own(cv.Mat.zeros(rows,cols,cv.CV_8UC1)),regions=[];
  const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length),cvRatio=a=>{const m=mean(a);return m?Math.sqrt(mean(a.map(x=>(x-m)**2)))/m:99;};
  const distance=own(new cv.Mat());cv.distanceTransform(outer,distance,cv.DIST_L2,5);

  for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){
    const i=y*cols+x;if(!outer.data[i]||evidence?.data[i])continue;
    const at=i*3,dL=lab.data[at]-pageL,chroma=Math.hypot(lab.data[at+1]-pageA,lab.data[at+2]-pageB),center=gray.data[i],texture=Math.abs(center-(gray.data[i-1]+gray.data[i+1]+gray.data[i-cols]+gray.data[i+cols])/4);
    if(chroma<3.6&&dL>=-14&&dL<=5&&texture<5.5)pageLike.data[i]=255;
  }
  let k=Math.max(3,Math.min(9,Math.round(pxPerMM*.55)));if(!(k&1))k++;
  const kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)));cv.morphologyEx(pageLike,pageLike,cv.MORPH_OPEN,kernel);cv.morphologyEx(pageLike,pageLike,cv.MORPH_CLOSE,kernel);

  const enclosed=(candidate)=>{
    let ringK=Math.max(3,Math.min(15,Math.round(pxPerMM*.9)));if(!(ringK&1))ringK++;
    const ringKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringK,ringK))),dil=own(new cv.Mat()),ring=own(new cv.Mat()),ringOuter=own(new cv.Mat());
    cv.dilate(candidate,dil,ringKernel);cv.subtract(dil,candidate,ring);cv.bitwise_and(ring,outer,ringOuter);
    return cv.countNonZero(ringOuter)/Math.max(1,cv.countNonZero(ring))>=.90;
  };
  const describe=(contour,source)=>{
    const a=cv.contourArea(contour);if(a<Math.max(8,pxPerMM*pxPerMM*.45)||a>outerArea*.05||contour.rows<4)return null;
    const b=cv.boundingRect(contour),widthMM=b.width/pxPerMM,heightMM=b.height/pxPerMM,smallSide=Math.min(widthMM,heightMM),largeSide=Math.max(widthMM,heightMM);
    if(smallSide<1.0||largeSide>14)return null;
    const raw=contourMask(cv,cols,rows,contour,own);if(!enclosed(raw))return null;
    const reg=regularizeContour(cv,contour,own,pxPerMM),complexity=reg.lineCount+reg.curveCount;
    if(complexity>7||reg.corners>7)return null;
    const mom=cv.moments(contour,true);if(!mom.m00)return null;
    const center=[mom.m10/mom.m00,mom.m01/mom.m00],edgeDistance=distance.data32F[Math.round(center[1])*cols+Math.round(center[0])]/pxPerMM;
    let signal=0,pixels=0;
    for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){const i=y*cols+x;if(!raw.data[i])continue;pixels++;if(evidence?.data[i])signal++;}
    if(source==='edge'&&signal/Math.max(1,pixels)>.18)return null;
    return {contour,raw,reg,source,area:a,center,edgeDistance,widthMM,heightMM,sizeMM:Math.sqrt(a)/pxPerMM,evidenceDensity:signal/Math.max(1,pixels)};
  };

  // Strong local page-like components are generic aperture evidence.
  const pageContours=own(new cv.MatVector()),pageHierarchy=own(new cv.Mat());cv.findContours(pageLike,pageContours,pageHierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  const pageCandidates=[];
  for(let i=0;i<pageContours.size();i++){const d=describe(own(pageContours.get(i)),'page');if(d)pageCandidates.push(d);}

  // Internal edge loops are only weak candidates. They are NEVER carved by
  // themselves; they can only extend a manufacturing pattern already supported
  // by at least three page-like apertures. This helps holes whose interior lies
  // over a white printed cell without turning stars/letters into holes.
  const grayBlur=own(new cv.Mat()),edge=own(new cv.Mat()),channels=own(new cv.MatVector()),aBlur=own(new cv.Mat()),bBlur=own(new cv.Mat()),aEdge=own(new cv.Mat()),bEdge=own(new cv.Mat());
  cv.GaussianBlur(gray,grayBlur,new cv.Size(3,3),0);cv.Canny(grayBlur,edge,16,52);cv.split(lab,channels);
  const aa=own(channels.get(1)),bb=own(channels.get(2));cv.GaussianBlur(aa,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(bb,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,aEdge,4,14);cv.Canny(bBlur,bEdge,4,14);cv.bitwise_or(edge,aEdge,edge);cv.bitwise_or(edge,bEdge,edge);
  const erodeK=Math.max(3,Math.min(11,Math.round(pxPerMM*.8))|1),erodeKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(erodeK,erodeK))),inner=own(new cv.Mat()),internalEdges=own(new cv.Mat());
  cv.erode(outer,inner,erodeKernel);cv.bitwise_and(edge,inner,internalEdges);
  const loopK=Math.max(3,Math.min(9,Math.round(pxPerMM*.55))|1),loopKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(loopK,loopK)));cv.morphologyEx(internalEdges,internalEdges,cv.MORPH_CLOSE,loopKernel);
  const loops=own(new cv.MatVector()),loopHierarchy=own(new cv.Mat());cv.findContours(internalEdges,loops,loopHierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_NONE);
  const edgeCandidates=[];
  for(let i=0;i<loops.size();i++){const d=describe(own(loops.get(i)),'edge');if(d)edgeCandidates.push(d);}

  // Repeated manufacturing apertures are discovered as a geometric pattern,
  // not from a fixed hole count/side. We combine page-like regions and weak
  // closed edge loops, then require a collinear, similarly-sized, regularly
  // spaced group with at least three page-supported members.
  const candidatePool=[];
  for(const q of [...pageCandidates,...edgeCandidates].sort((a,b)=>(a.source==='page'?-1:1)-(b.source==='page'?-1:1))){
    const duplicate=candidatePool.find(r=>Math.hypot(r.center[0]-q.center[0],r.center[1]-q.center[1])<Math.max(pxPerMM*1.2,(r.sizeMM+q.sizeMM)*pxPerMM*.22));
    if(!duplicate)candidatePool.push(q);
  }
  const projectionStats=(items,origin,ux,uy)=>{
    const projected=[...items].sort((a,b)=>((a.center[0]-origin[0])*ux+(a.center[1]-origin[1])*uy)-((b.center[0]-origin[0])*ux+(b.center[1]-origin[1])*uy));
    const values=projected.map(q=>(q.center[0]-origin[0])*ux+(q.center[1]-origin[1])*uy),gaps=[];for(let i=1;i<values.length;i++)gaps.push((values[i]-values[i-1])/pxPerMM);
    return {items:projected,values,gaps,gapCV:cvRatio(gaps),sizeCV:cvRatio(projected.map(q=>q.sizeMM)),edgeCV:cvRatio(projected.map(q=>Math.max(q.edgeDistance,.2)))};
  };
  let bestPattern=null;
  for(let i=0;i<candidatePool.length;i++)for(let j=i+1;j<candidatePool.length;j++){
    const a=candidatePool[i],b=candidatePool[j],dx=b.center[0]-a.center[0],dy=b.center[1]-a.center[1],distanceAB=Math.hypot(dx,dy);if(distanceAB<pxPerMM*4)continue;
    const ux=dx/distanceAB,uy=dy/distanceAB,nx=-uy,ny=ux,baseSize=(a.sizeMM+b.sizeMM)/2;
    for(let multiple=1;multiple<=4;multiple++){
      const spacingPx=distanceAB/multiple;if(spacingPx<pxPerMM*3||spacingPx>pxPerMM*35)continue;
      const byIndex=new Map();
      for(const q of candidatePool){
        const vx=q.center[0]-a.center[0],vy=q.center[1]-a.center[1],perp=Math.abs(vx*nx+vy*ny)/pxPerMM,t=vx*ux+vy*uy,index=Math.round(t/spacingPx),latticeError=Math.abs(t/spacingPx-index);
        if(perp>Math.max(1.6,baseSize*.85)||latticeError>.26||q.sizeMM/baseSize<.48||q.sizeMM/baseSize>1.9)continue;
        const cost=latticeError+perp/Math.max(spacingPx/pxPerMM,1)+(q.source==='page'?0:.08)+q.evidenceDensity*.18;
        if(!byIndex.has(index)||cost<byIndex.get(index).cost)byIndex.set(index,{q,cost});
      }
      let group=[...byIndex.values()].map(v=>v.q);if(group.length<4)continue;
      let stats=projectionStats(group,a.center,ux,uy);
      while(group.length>4&&stats.gapCV>.16){
        let bestRemoval=null;
        for(let r=0;r<group.length;r++){const trial=group.filter((_,k)=>k!==r),s=projectionStats(trial,a.center,ux,uy);if(!bestRemoval||s.gapCV<bestRemoval.stats.gapCV)bestRemoval={trial,stats:s};}
        group=bestRemoval.trial;stats=bestRemoval.stats;
      }
      const pageCount=group.filter(q=>q.source==='page').length;
      if(group.length<4||stats.gapCV>.16||stats.sizeCV>.30||stats.edgeCV>.30||pageCount<3)continue;
      const score=group.length*8-stats.gapCV*12-stats.sizeCV*8-stats.edgeCV*6+pageCount*.8;
      if(!bestPattern||score>bestPattern.score)bestPattern={score,items:stats.items,origin:a.center,dir:[ux,uy],normal:[nx,ny],spacingPx:mean(stats.gaps)*pxPerMM,sizeMM:mean(group.map(q=>q.sizeMM)),edgeDistanceMM:mean(group.map(q=>q.edgeDistance))};
    }
  }
  const accepted=[];
  const radialCurve=(cx,cy,expectedRadius)=>{
    const points=[],radii=[],steps=48,r0=Math.max(2,Math.round(expectedRadius*.55)),r1=Math.max(r0+2,Math.round(expectedRadius*1.65));
    for(let s=0;s<steps;s++){
      const angle=s*Math.PI*2/steps,ca=Math.cos(angle),sa=Math.sin(angle);let bestR=null,bestDelta=Infinity;
      for(let radius=r0;radius<=r1;radius++){
        const x=Math.round(cx+ca*radius),y=Math.round(cy+sa*radius);if(x<1||y<1||x>=cols-1||y>=rows-1)continue;
        if(edge.data[y*cols+x]){const delta=Math.abs(radius-expectedRadius);if(delta<bestDelta){bestDelta=delta;bestR=radius;}}
      }
      if(bestR!==null){points.push([cx+ca*bestR,cy+sa*bestR]);radii.push(bestR);}
    }
    if(points.length<steps*.62)return null;
    const average=mean(radii),variation=cvRatio(radii);if(variation>.28)return null;
    const contour=matFromPoints(cv,points,own),raw=contourMask(cv,cols,rows,contour,own);if(!enclosed(raw))return null;
    const reg=regularizeContour(cv,contour,own,pxPerMM),area=cv.contourArea(contour);if(area<pxPerMM*pxPerMM*.35)return null;
    return {contour,raw,reg,source:'radial',area,center:[cx,cy],edgeDistance:distance.data32F[Math.round(cy)*cols+Math.round(cx)]/pxPerMM,widthMM:average*2/pxPerMM,heightMM:average*2/pxPerMM,sizeMM:Math.sqrt(area)/pxPerMM,evidenceDensity:0};
  };
  if(bestPattern){
    const [ux,uy]=bestPattern.dir,origin=bestPattern.origin,projections=bestPattern.items.map(q=>(q.center[0]-origin[0])*ux+(q.center[1]-origin[1])*uy).sort((a,b)=>a-b),spacingPx=bestPattern.spacingPx,expectedRadius=Math.max(pxPerMM*.8,bestPattern.sizeMM*pxPerMM/Math.sqrt(Math.PI));
    for(const q of bestPattern.items){
      const radial=radialCurve(q.center[0],q.center[1],expectedRadius);accepted.push(radial||q);
    }
    // Recover only internal missing lattice members. No count or endpoint is
    // prescribed; a gap approximately twice the learned spacing proposes one
    // missing aperture and the image edge must independently confirm it.
    for(let i=1;i<projections.length;i++){
      const gap=projections[i]-projections[i-1],multiple=Math.round(gap/Math.max(spacingPx,1));if(multiple<2||multiple>3||Math.abs(gap/spacingPx-multiple)>.22)continue;
      for(let m=1;m<multiple;m++){
        const t=projections[i-1]+m*spacingPx,cx=origin[0]+ux*t,cy=origin[1]+uy*t;
        if(cx<2||cy<2||cx>=cols-2||cy>=rows-2||!outer.data[Math.round(cy)*cols+Math.round(cx)])continue;
        const edgeDistance=distance.data32F[Math.round(cy)*cols+Math.round(cx)]/pxPerMM;if(Math.abs(edgeDistance-bestPattern.edgeDistanceMM)>Math.max(1.5,bestPattern.edgeDistanceMM*.30))continue;
        const radial=radialCurve(cx,cy,expectedRadius);if(radial)accepted.push(radial);
      }
    }
    // The observed group may itself miss an endpoint. Extrapolate a single
    // learned spacing on each side, but accept it only when the local image
    // independently supplies a closed smooth-curve boundary. This recovers an
    // end aperture hidden by print/shadow without assuming a particular count.
    for(const t of [projections[0]-spacingPx,projections[projections.length-1]+spacingPx]){
      const cx=origin[0]+ux*t,cy=origin[1]+uy*t;
      if(cx<2||cy<2||cx>=cols-2||cy>=rows-2||!outer.data[Math.round(cy)*cols+Math.round(cx)])continue;
      const edgeDistance=distance.data32F[Math.round(cy)*cols+Math.round(cx)]/pxPerMM;if(Math.abs(edgeDistance-bestPattern.edgeDistanceMM)>Math.max(1.5,bestPattern.edgeDistanceMM*.30))continue;
      const radial=radialCurve(cx,cy,expectedRadius);if(radial)accepted.push(radial);
    }
  }
  const deduped=[];
  for(const q of deduped){
    if(deduped.some(r=>Math.hypot(r.center[0]-q.center[0],r.center[1]-q.center[1])<pxPerMM*1.4))continue;
    deduped.push(q);
  }

  const carved=[];
  for(const q of accepted){
    const rContour=matFromPoints(cv,q.reg.points,own),hole=contourMask(cv,cols,rows,rContour,own);mask.setTo(new cv.Scalar(0),hole);
    carved.push({lineCount:q.reg.lineCount,curveCount:q.reg.curveCount,cornerCount:q.reg.corners,area:q.area,widthMM:q.widthMM,heightMM:q.heightMM,source:q.source});
  }
  return {count:carved.length,regions:carved,patternGroups:bestPattern?1:0};
}
