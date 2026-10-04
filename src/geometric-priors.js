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
  // Douglas-Peucker here is only a representation compression step: line
  // runs are already collinear, while smooth curves retain enough samples.
  let simplified=clean;
  if(clean.length>=4){
    const raw=matFromPoints(cv,clean,own),poly=own(new cv.Mat());
    cv.approxPolyDP(raw,poly,Math.max(.45,pxPerMM*.16),true);
    if(poly.rows>=3)simplified=contourPoints(poly);
  }
  const meaningfulCurves=primitives.filter(x=>x.type==='curve'&&(x.samples||0)*spacing>=Math.max(3,pxPerMM*2.4));
  const linePrimitives=primitives.filter(x=>x.type==='line');
  return {points:simplified,primitives:[...linePrimitives,...meaningfulCurves],corners:Math.max(0,ordered.length),lineCount:runs.length,curveCount:meaningfulCurves.length};
}

export function regularizeOuterSupport(cv,source,own,pxPerMM){
  const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(source,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let largest=null,area=0;for(let i=0;i<contours.size();i++){const c=own(contours.get(i)),a=cv.contourArea(c);if(a>area){area=a;largest=c;}}
  if(!largest||area<16)return {mask:source,boundaryModel:'line-curve',primitives:[],polygon:null};
  const reg=regularizeContour(cv,largest,own,pxPerMM),rContour=matFromPoints(cv,reg.points,own),mask=contourMask(cv,source.cols,source.rows,rContour,own);
  return {mask,boundaryModel:'line-curve',primitives:reg.primitives,cornerCount:reg.corners,lineCount:reg.lineCount,curveCount:reg.curveCount,polygon:reg.points};
}

export function carveEnclosedPageRegions(cv,{mask,outer,lab,gray,pageL,pageA,pageB,pageN,evidence,pxPerMM},own){
  if(!pageN)return {count:0,regions:[]};
  const rows=mask.rows,cols=mask.cols,pageLike=own(cv.Mat.zeros(rows,cols,cv.CV_8UC1));
  for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){
    const i=y*cols+x;if(!outer.data[i]||evidence?.data[i])continue;
    const at=i*3,dL=lab.data[at]-pageL,chroma=Math.hypot(lab.data[at+1]-pageA,lab.data[at+2]-pageB),center=gray.data[i],texture=Math.abs(center-(gray.data[i-1]+gray.data[i+1]+gray.data[i-cols]+gray.data[i+cols])/4);
    if(chroma<3.6&&dL>=-14&&dL<=5&&texture<5.5)pageLike.data[i]=255;
  }
  let k=Math.max(3,Math.min(9,Math.round(pxPerMM*.55)));if(!(k&1))k++;
  const kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)));cv.morphologyEx(pageLike,pageLike,cv.MORPH_OPEN,kernel);cv.morphologyEx(pageLike,pageLike,cv.MORPH_CLOSE,kernel);
  const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(pageLike,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  const outerArea=Math.max(1,cv.countNonZero(outer)),regions=[];
  for(let i=0;i<contours.size();i++){
    const c=own(contours.get(i)),a=cv.contourArea(c);if(a<Math.max(8,pxPerMM*pxPerMM*.7)||a>outerArea*.05||c.rows<4)continue;
    const b=cv.boundingRect(c),widthMM=b.width/pxPerMM,heightMM=b.height/pxPerMM,smallSide=Math.min(widthMM,heightMM),largeSide=Math.max(widthMM,heightMM);
    // High-confidence aperture prior is deliberately for small enclosed
    // negative space. Large windows remain the responsibility of the generic
    // topology/GrabCut stage; this prevents a large white printed panel from
    // being mistaken for a hole.
    if(smallSide<1.2||largeSide>14)continue;
    const raw=contourMask(cv,cols,rows,c,own),ringK=Math.max(3,Math.min(15,Math.round(pxPerMM*.9))|1),ringKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringK,ringK))),dil=own(new cv.Mat()),ring=own(new cv.Mat());
    cv.dilate(raw,dil,ringKernel);cv.subtract(dil,raw,ring);const ringOuter=own(new cv.Mat());cv.bitwise_and(ring,outer,ringOuter);
    if(cv.countNonZero(ringOuter)/Math.max(1,cv.countNonZero(ring))<.90)continue;
    const reg=regularizeContour(cv,c,own,pxPerMM),complexity=reg.lineCount+reg.curveCount;
    // A real manufactured aperture is usually describable by a few line/curve
    // primitives. Stars, glyphs and other printed motifs need more pieces and
    // are therefore kept as material even when they are pale.
    if(complexity>6||reg.corners>6)continue;
    if(reg.corners>4&&reg.lineCount<3)continue;
    const rContour=matFromPoints(cv,reg.points,own),hole=contourMask(cv,cols,rows,rContour,own);
    mask.setTo(new cv.Scalar(0),hole);regions.push({lineCount:reg.lineCount,curveCount:reg.curveCount,cornerCount:reg.corners,area:a,widthMM,heightMM});
  }
  return {count:regions.length,regions};
}
