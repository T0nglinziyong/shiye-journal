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
  const n=points.length,window=clamp(Math.round(pxPerMM*1.3/Math.max(perimeter(points)/n,1)),2,Math.max(2,Math.floor(n/10))),threshold=.48,minSep=Math.max(4,Math.round(n*.035));
  const raw=[];
  for(let i=0;i<n;i++){const score=turning(points,i,window);if(score>=threshold)raw.push({i,score});}
  raw.sort((a,b)=>b.score-a.score);
  const selected=[];
  const circularDistance=(a,b)=>Math.min(Math.abs(a-b),n-Math.abs(a-b));
  for(const item of raw){if(selected.every(x=>circularDistance(x.i,item.i)>=minSep))selected.push(item);if(selected.length>=24)break;}
  return selected.map(x=>x.i).sort((a,b)=>a-b);
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
function matFromPoints(cv,points,own){
  const ints=points.flatMap(([x,y])=>[Math.round(x),Math.round(y)]);return own(cv.matFromArray(points.length,1,cv.CV_32SC2,ints));
}
function contourMask(cv,width,height,contour,own,value=255){
  const out=own(cv.Mat.zeros(height,width,cv.CV_8UC1)),v=own(new cv.MatVector());v.push_back(contour);cv.drawContours(out,v,-1,new cv.Scalar(value),cv.FILLED);return out;
}

export function regularizeContour(cv,contour,own,pxPerMM,{closed=true}={}){
  const raw=contourPoints(contour),spacing=Math.max(1,pxPerMM*.55),points=resampleClosed(raw,spacing);
  if(points.length<8)return {points:raw,primitives:[{type:'curve'}],corners:0,lineCount:0,curveCount:1};
  const cut=corners(points,pxPerMM);
  if(cut.length<2){
    const smoothed=smoothClosed(points,4);
    return {points:smoothed,primitives:[{type:'curve',closed:true}],corners:0,lineCount:0,curveCount:1};
  }

  const segments=[];
  for(let s=0;s<cut.length;s++){
    const a=cut[s],b=cut[(s+1)%cut.length],pts=arc(points,a,b),fit=lineFit(pts);
    const rmsLimit=Math.max(.65,pxPerMM*.30),maxLimit=Math.max(1.5,pxPerMM*.75),ratio=fit.rms/Math.max(fit.length,1);
    const isLine=fit.length>=Math.max(7,pxPerMM*2.2)&&fit.rms<=rmsLimit&&fit.max<=maxLimit&&ratio<=.025;
    segments.push({start:a,end:b,points:pts,fit,type:isLine?'line':'curve'});
  }

  const junctions=cut.map((idx,j)=>{
    const prev=segments[wrap(j-1,segments.length)],next=segments[j],fallback=points[idx];
    return prev.type==='line'&&next.type==='line'?lineIntersection(prev.fit,next.fit,fallback,Math.max(3,pxPerMM*1.8)):fallback;
  });
  const output=[],primitives=[];
  for(let s=0;s<segments.length;s++){
    const seg=segments[s],start=junctions[s],end=junctions[(s+1)%segments.length];
    if(seg.type==='line'){
      if(!output.length)output.push(start);output.push(end);
      primitives.push({type:'line',start,end,rms:seg.fit.rms,length:seg.fit.length});
    }else{
      const pts=smoothOpen(seg.points,3);pts[0]=start;pts[pts.length-1]=end;
      if(!output.length)output.push(pts[0]);for(let i=1;i<pts.length;i++)output.push(pts[i]);
      primitives.push({type:'curve',start,end,samples:pts.length});
    }
  }
  if(output.length>2&&dist(output[0],output[output.length-1])<1)output.pop();
  return {points:output,primitives,corners:cut.length,lineCount:primitives.filter(x=>x.type==='line').length,curveCount:primitives.filter(x=>x.type==='curve').length};
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
    if(chroma<4.6&&dL>=-18&&dL<=8&&texture<7)pageLike.data[i]=255;
  }
  let k=Math.max(3,Math.min(9,Math.round(pxPerMM*.55)));if(!(k&1))k++;
  const kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)));cv.morphologyEx(pageLike,pageLike,cv.MORPH_OPEN,kernel);cv.morphologyEx(pageLike,pageLike,cv.MORPH_CLOSE,kernel);
  const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(pageLike,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  const outerArea=Math.max(1,cv.countNonZero(outer)),regions=[];
  for(let i=0;i<contours.size();i++){
    const c=own(contours.get(i)),a=cv.contourArea(c);if(a<Math.max(8,pxPerMM*pxPerMM*.7)||a>outerArea*.08||c.rows<4)continue;
    const raw=contourMask(cv,cols,rows,c,own),ringK=Math.max(3,Math.min(15,Math.round(pxPerMM*.9))|1),ringKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringK,ringK))),dil=own(new cv.Mat()),ring=own(new cv.Mat());
    cv.dilate(raw,dil,ringKernel);cv.subtract(dil,raw,ring);const ringOuter=own(new cv.Mat());cv.bitwise_and(ring,outer,ringOuter);
    if(cv.countNonZero(ringOuter)/Math.max(1,cv.countNonZero(ring))<.90)continue;
    const reg=regularizeContour(cv,c,own,pxPerMM),rContour=matFromPoints(cv,reg.points,own),hole=contourMask(cv,cols,rows,rContour,own);
    mask.setTo(new cv.Scalar(0),hole);regions.push({lineCount:reg.lineCount,curveCount:reg.curveCount,cornerCount:reg.corners,area:a});
  }
  return {count:regions.length,regions};
}
