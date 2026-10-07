import {activeContour,morphGAC} from './browser-active-contours.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const contourPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);

function largestExternal(cv,mask){
  const cs=new cv.MatVector(),hh=new cv.Mat();cv.findContours(mask,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,area=0;
  for(let i=0;i<cs.size();i++){const c=cs.get(i),a=Math.abs(cv.contourArea(c));if(a>area){best?.delete?.();best=c;area=a;}else c.delete();}
  cs.delete();hh.delete();return {contour:best,area};
}
function outerFill(cv,mask){
  const found=largestExternal(cv,mask),out=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1);
  if(found.contour){const v=new cv.MatVector();v.push_back(found.contour);cv.drawContours(out,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();found.contour.delete();}
  return out;
}
function placedMaskFromCandidate(cv,c,w,h,x0,y0,rw,rh){
  const out=cv.Mat.zeros(rh,rw,cv.CV_8UC1);
  if(c.mask?.alpha?.length){
    const mw=c.mask.width,mh=c.mask.height,src=cv.matFromArray(mh,mw,cv.CV_8UC1,c.mask.alpha),resized=new cv.Mat();
    const gx=Math.round(c.x*w),gy=Math.round(c.y*h),gw=Math.max(1,Math.round(c.w*w)),gh=Math.max(1,Math.round(c.h*h));
    cv.resize(src,resized,new cv.Size(gw,gh),0,0,cv.INTER_NEAREST);
    const dx=Math.max(0,gx-x0),dy=Math.max(0,gy-y0),sw=Math.min(gw,rw-dx),sh=Math.min(gh,rh-dy);
    if(sw>0&&sh>0){const sroi=resized.roi(new cv.Rect(0,0,sw,sh)),droi=out.roi(new cv.Rect(dx,dy,sw,sh));sroi.copyTo(droi);sroi.delete();droi.delete();}
    src.delete();resized.delete();
  }else{
    const x=clamp(Math.round(c.x*w)-x0,0,rw-1),y=clamp(Math.round(c.y*h)-y0,0,rh-1),
      cw=clamp(Math.round(c.w*w),1,rw-x),ch=clamp(Math.round(c.h*h),1,rh-y);
    out.roi(new cv.Rect(x,y,cw,ch)).setTo(new cv.Scalar(255));
  }
  return out;
}
function enclosedHoles(cv,mask){
  const outer=outerFill(cv,mask),holes=new cv.Mat();cv.subtract(outer,mask,holes);outer.delete();return holes;
}
function edgeSupportMap(cv,rgba,useChroma=true){
  const gray=new cv.Mat(),blur=new cv.Mat(),edge=new cv.Mat(),rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),ab=new cv.Mat(),bb=new cv.Mat(),ae=new cv.Mat(),be=new cv.Mat(),support=new cv.Mat();
  cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(3,3),0);cv.Canny(blur,edge,8,30);
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
  let a=null,b=null;if(useChroma){cv.split(lab,channels);a=channels.get(1);b=channels.get(2);cv.GaussianBlur(a,ab,new cv.Size(3,3),0);cv.GaussianBlur(b,bb,new cv.Size(3,3),0);cv.Canny(ab,ae,2,9);cv.Canny(bb,be,2,9);cv.bitwise_or(edge,ae,edge);cv.bitwise_or(edge,be,edge);}
  const k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5));cv.dilate(edge,support,k);
  gray.delete();blur.delete();edge.delete();rgb.delete();lab.delete();channels.delete();a?.delete?.();b?.delete?.();ab.delete();bb.delete();ae.delete();be.delete();k.delete();
  return support;
}
function boundarySupport(cv,mask,support){
  const found=largestExternal(cv,mask);if(!found.contour)return 0;
  const b=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1),v=new cv.MatVector(),hit=new cv.Mat();v.push_back(found.contour);cv.drawContours(b,v,-1,new cv.Scalar(255),1);cv.bitwise_and(b,support,hit);
  const score=cv.countNonZero(hit)/Math.max(1,cv.countNonZero(b));found.contour.delete();b.delete();v.delete();hit.delete();return score;
}

function thinEdgeMap(cv,rgba,useChroma=true){
  const gray=new cv.Mat(),blur=new cv.Mat(),edge=new cv.Mat(),rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),ab=new cv.Mat(),bb=new cv.Mat(),ae=new cv.Mat(),be=new cv.Mat();
  cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(3,3),0);cv.Canny(blur,edge,15,45);
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
  let a=null,b=null;if(useChroma){cv.split(lab,channels);a=channels.get(1);b=channels.get(2);cv.GaussianBlur(a,ab,new cv.Size(3,3),0);cv.GaussianBlur(b,bb,new cv.Size(3,3),0);cv.Canny(ab,ae,3,12);cv.Canny(bb,be,3,12);cv.bitwise_or(edge,ae,edge);cv.bitwise_or(edge,be,edge);}
  gray.delete();blur.delete();rgb.delete();lab.delete();channels.delete();a?.delete?.();b?.delete?.();ab.delete();bb.delete();ae.delete();be.delete();return edge;
}
function segmentSupport(edge,p1,p2){
  const dx=p2.x-p1.x,dy=p2.y-p1.y,len=Math.hypot(dx,dy),samples=Math.max(24,Math.round(len));if(len<1)return 0;
  let hit=0;
  for(let i=0;i<samples;i++){const t=i/Math.max(1,samples-1),x=Math.round(p1.x+dx*t),y=Math.round(p1.y+dy*t);if(x>=0&&x<edge.cols&&y>=0&&y<edge.rows&&edge.data[y*edge.cols+x])hit++;}
  return hit/samples;
}
function fitObservedLine(cv,thin,p1,p2,band){
  const dx=p2.x-p1.x,dy=p2.y-p1.y,len=Math.hypot(dx,dy);if(len<1)return null;
  const ux=dx/len,uy=dy/len,pts=[];
  for(let y=0;y<thin.rows;y++)for(let x=0;x<thin.cols;x++){
    if(!thin.data[y*thin.cols+x])continue;
    const rx=x-p1.x,ry=y-p1.y,t=rx*ux+ry*uy,perp=Math.abs(rx*(-uy)+ry*ux);
    if(perp<=band&&t>=-len*.08&&t<=len*1.08)pts.push([x,y]);
  }
  if(pts.length<12)return null;
  const input=cv.matFromArray(pts.length,1,cv.CV_32FC2,pts.flat()),line=new cv.Mat();
  cv.fitLine(input,line,cv.DIST_HUBER,0,.01,.01);input.delete();
  const d=line.data32F;if(!d||d.length<4){line.delete();return null;}
  const out={vx:d[0],vy:d[1],x:d[2],y:d[3]};line.delete();return out;
}
function lineIntersection(a,b){
  const cross=a.vx*b.vy-a.vy*b.vx;if(Math.abs(cross)<1e-5)return null;
  const qx=b.x-a.x,qy=b.y-a.y,t=(qx*b.vy-qy*b.vx)/cross;
  return {x:a.x+t*a.vx,y:a.y+t*a.vy};
}
function maskAgreement(cv,a,b){
  const inter=new cv.Mat(),union=new cv.Mat();cv.bitwise_and(a,b,inter);cv.bitwise_or(a,b,union);
  const score=cv.countNonZero(inter)/Math.max(1,cv.countNonZero(union));inter.delete();union.delete();return score;
}
function filledContourMask(cv,rows,cols,contour){
  const out=cv.Mat.zeros(rows,cols,cv.CV_8UC1),v=new cv.MatVector();v.push_back(contour);cv.drawContours(out,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();return out;
}
function quadrilateralCandidate(cv,rgba,mask,support,useChroma=true){
  const found=largestExternal(cv,mask);if(!found.contour)return null;
  const contour=found.contour,area=Math.abs(cv.contourArea(contour)),rect=cv.minAreaRect(contour),box=cv.boxPoints(rect),rectArea=Math.max(1,rect.size.width*rect.size.height),fill=area/rectArea;
  contour.delete();
  if(fill<.78)return null;
  const thin=thinEdgeMap(cv,rgba,useChroma),sides=[],fits=[],band=Math.max(3,Math.min(rgba.cols,rgba.rows)*.025);
  for(let i=0;i<4;i++){const a=box[i],b=box[(i+1)%4];sides.push(segmentSupport(support,a,b));fits.push(fitObservedLine(cv,thin,a,b,band));}
  thin.delete();
  if(Math.min(...sides)<.68||fits.some(x=>!x))return null;
  const corners=[];for(let i=0;i<4;i++){const p=lineIntersection(fits[(i+3)%4],fits[i]);if(!p)return null;corners.push(p);}
  if(corners.some(p=>p.x<-5||p.y<-5||p.x>mask.cols+5||p.y>mask.rows+5))return null;
  const poly=cv.matFromArray(4,1,cv.CV_32SC2,corners.flatMap(p=>[Math.round(p.x),Math.round(p.y)])),polyArea=Math.abs(cv.contourArea(poly));
  if(polyArea<area*.75||polyArea>area*1.35){poly.delete();return null;}
  const candidate=filledContourMask(cv,mask.rows,mask.cols,poly);poly.delete();
  const fit=maskAgreement(cv,mask,candidate),edge=boundarySupport(cv,candidate,support);
  if(fit<.86||edge<.68){candidate.delete();return null;}
  return {mask:candidate,kind:'quadrilateral',fit,edge,score:fit*.58+edge*.38+.04};
}
function ellipseCandidate(cv,rgba,mask,support){
  const found=largestExternal(cv,mask);if(!found.contour||found.contour.rows<12){found.contour?.delete?.();return null;}
  const contour=found.contour,area=Math.max(1,Math.abs(cv.contourArea(contour))),hull=new cv.Mat();cv.convexHull(contour,hull,false,true);
  const solidity=area/Math.max(1,Math.abs(cv.contourArea(hull)));hull.delete();
  if(solidity<.94||contour.rows<5){contour.delete();return null;}
  const ellipse=cv.fitEllipse(contour),angle=ellipse.angle*Math.PI/180,ca=Math.cos(angle),sa=Math.sin(angle),rx=ellipse.size.width/2,ry=ellipse.size.height/2;
  contour.delete();if(rx<2||ry<2)return null;
  const pts=[];for(let i=0;i<128;i++){const t=i*Math.PI*2/128,ux=rx*Math.cos(t),uy=ry*Math.sin(t);pts.push(Math.round(ellipse.center.x+ux*ca-uy*sa),Math.round(ellipse.center.y+ux*sa+uy*ca));}
  const eContour=cv.matFromArray(128,1,cv.CV_32SC2,pts),candidate=filledContourMask(cv,mask.rows,mask.cols,eContour);eContour.delete();
  const fit=maskAgreement(cv,mask,candidate),edge=boundarySupport(cv,candidate,support);
  if(fit<.89||edge<.70){candidate.delete();return null;}
  const circularity=Math.min(rx,ry)/Math.max(rx,ry),simplicity=.96+.04*circularity;
  return {mask:candidate,kind:circularity>.92?'circle':'ellipse',fit,edge,score:fit*.58+edge*.38+.04*simplicity};
}
function polygonCandidate(cv,mask,support){
  const found=largestExternal(cv,mask);if(!found.contour)return null;
  const contour=found.contour,area=Math.max(1,Math.abs(cv.contourArea(contour))),hull=new cv.Mat();cv.convexHull(contour,hull,false,true);
  const solidity=area/Math.max(1,Math.abs(cv.contourArea(hull)));hull.delete();
  if(solidity<.93){contour.delete();return null;}
  const per=cv.arcLength(contour,true),candidates=[];
  for(const frac of [.008,.012,.016,.022,.030]){
    const poly=new cv.Mat();cv.approxPolyDP(contour,poly,Math.max(.8,per*frac),true);
    const n=poly.rows;
    if(n<3||n>8||n===4||!cv.isContourConvex(poly)){poly.delete();continue;}
    const pmask=filledContourMask(cv,mask.rows,mask.cols,poly),fit=maskAgreement(cv,mask,pmask),edge=boundarySupport(cv,pmask,support);
    if(fit>=.88&&edge>=.68)candidates.push({mask:pmask,kind:'polygon-'+n,fit,edge,vertices:n,score:fit*.58+edge*.38+.04*(1-(n-3)/10)});else pmask.delete();
    poly.delete();
  }
  contour.delete();
  if(!candidates.length)return null;candidates.sort((a,b)=>b.score-a.score);
  const best=candidates.shift();for(const q of candidates)q.mask.delete();return best;
}
function regularizeBasicShape(cv,rgba,mask,{quadrilateral=true,ellipse=true,polygon=true,useChroma=true}={}){
  const support=edgeSupportMap(cv,rgba,useChroma),rawEdge=boundarySupport(cv,mask,support),candidates=[];
  if(quadrilateral){const q=quadrilateralCandidate(cv,rgba,mask,support,useChroma);if(q)candidates.push(q);}
  if(ellipse){const q=ellipseCandidate(cv,rgba,mask,support);if(q)candidates.push(q);}
  if(polygon){const q=polygonCandidate(cv,mask,support);if(q)candidates.push(q);}
  support.delete();
  if(!candidates.length)return {mask:mask.clone(),kind:null};
  candidates.sort((a,b)=>b.score-a.score);const best=candidates.shift();
  for(const q of candidates)q.mask.delete();
  // A simple model may replace the free boundary only if it remains almost as
  // well supported by the actual image edge as the original mask.
  if(best.edge<Math.max(.68,rawEdge-.11)){best.mask.delete();return {mask:mask.clone(),kind:null};}
  return {mask:best.mask,kind:best.kind,fit:best.fit,edge:best.edge,score:best.score};
}
function smoothCurvedMask(cv,mask){
  const area=Math.max(1,cv.countNonZero(mask)),blur=new cv.Mat(),binary=new cv.Mat();
  cv.GaussianBlur(mask,blur,new cv.Size(0,0),1.15,1.15,cv.BORDER_REPLICATE);cv.threshold(blur,binary,127,255,cv.THRESH_BINARY);blur.delete();
  const filled=outerFill(cv,binary);binary.delete();const ratio=cv.countNonZero(filled)/area;
  if(ratio<.94||ratio>1.06){filled.delete();return mask.clone();}
  return filled;
}
function resizeForBudget(cv,rgba,rough,maxDim){
  const scale=Math.min(1,maxDim/Math.max(rgba.cols,rgba.rows));if(scale===1)return {image:rgba.clone(),mask:rough.clone(),scale};
  const image=new cv.Mat(),mask=new cv.Mat();cv.resize(rgba,image,new cv.Size(Math.max(1,Math.round(rgba.cols*scale)),Math.max(1,Math.round(rgba.rows*scale))),0,0,cv.INTER_AREA);cv.resize(rough,mask,new cv.Size(image.cols,image.rows),0,0,cv.INTER_NEAREST);return {image,mask,scale};
}
function grabCutMask(cv,rgba,rough){
  const gc=new cv.Mat(rough.rows,rough.cols,cv.CV_8UC1,new cv.Scalar(cv.GC_PR_BGD)),bg=new cv.Mat(),fg=new cv.Mat(),rgb=new cv.Mat();
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);
  for(let i=0;i<rough.data.length;i++)if(rough.data[i])gc.data[i]=cv.GC_PR_FGD;
  const ksize=Math.max(3,(Math.round(Math.min(rough.cols,rough.rows)*.06)|1)),k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ksize,ksize)),inner=new cv.Mat();cv.erode(rough,inner,k);
  for(let i=0;i<inner.data.length;i++)if(inner.data[i])gc.data[i]=cv.GC_FGD;
  for(let x=0;x<gc.cols;x++){gc.data[x]=cv.GC_BGD;gc.data[(gc.rows-1)*gc.cols+x]=cv.GC_BGD;}
  for(let y=0;y<gc.rows;y++){gc.data[y*gc.cols]=cv.GC_BGD;gc.data[y*gc.cols+gc.cols-1]=cv.GC_BGD;}
  cv.grabCut(rgb,gc,new cv.Rect(),bg,fg,5,cv.GC_INIT_WITH_MASK);
  const out=cv.Mat.zeros(gc.rows,gc.cols,cv.CV_8UC1);for(let i=0;i<gc.data.length;i++)if(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)out.data[i]=255;
  gc.delete();bg.delete();fg.delete();rgb.delete();k.delete();inner.delete();const filled=outerFill(cv,out);out.delete();return filled;
}
function grabCutPolishMask(cv,rgba,seed){
  const rgb=new cv.Mat(),gc=new cv.Mat(seed.rows,seed.cols,cv.CV_8UC1,new cv.Scalar(cv.GC_BGD)),bg=new cv.Mat(),fg=new cv.Mat();
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);
  const ksize=Math.max(3,(Math.round(Math.min(seed.cols,seed.rows)*.025)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ksize,ksize)),inner=new cv.Mat(),outer=new cv.Mat();
  cv.erode(seed,inner,kernel);cv.dilate(seed,outer,kernel);
  for(let i=0;i<gc.data.length;i++){
    if(outer.data[i])gc.data[i]=cv.GC_PR_BGD;
    if(seed.data[i])gc.data[i]=cv.GC_PR_FGD;
    if(inner.data[i])gc.data[i]=cv.GC_FGD;
  }
  for(let x=0;x<gc.cols;x++){gc.data[x]=cv.GC_BGD;gc.data[(gc.rows-1)*gc.cols+x]=cv.GC_BGD;}
  for(let y=0;y<gc.rows;y++){gc.data[y*gc.cols]=cv.GC_BGD;gc.data[y*gc.cols+gc.cols-1]=cv.GC_BGD;}
  let polished=null;
  try{
    cv.grabCut(rgb,gc,new cv.Rect(),bg,fg,3,cv.GC_INIT_WITH_MASK);
    const out=cv.Mat.zeros(gc.rows,gc.cols,cv.CV_8UC1);
    for(let i=0;i<gc.data.length;i++)if(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)out.data[i]=255;
    polished=outerFill(cv,out);out.delete();
  }catch{
    polished=seed.clone();
  }
  rgb.delete();gc.delete();bg.delete();fg.delete();kernel.delete();inner.delete();outer.delete();return polished;
}
function upscaleBinaryMask(cv,mask,w,h){
  if(mask.cols===w&&mask.rows===h)return mask.clone();
  const resized=new cv.Mat(),binary=new cv.Mat();cv.resize(mask,resized,new cv.Size(w,h),0,0,cv.INTER_LINEAR);cv.threshold(resized,binary,127,255,cv.THRESH_BINARY);resized.delete();return binary;
}
function inverseGradientGImage(cv,rgba){
  const gray=new cv.Mat(),f=new cv.Mat(),blur=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat();cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);gray.convertTo(f,cv.CV_32F,1/255);cv.GaussianBlur(f,blur,new cv.Size(0,0),1.5,1.5,cv.BORDER_REPLICATE);cv.Sobel(blur,gx,cv.CV_32F,1,0,3,.125,0,cv.BORDER_REPLICATE);cv.Sobel(blur,gy,cv.CV_32F,0,1,3,.125,0,cv.BORDER_REPLICATE);
  const g=new Float32Array(gray.rows*gray.cols);for(let i=0;i<g.length;i++){const mag=Math.hypot(gx.data32F[i],gy.data32F[i]);g[i]=1/Math.sqrt(1+100*mag);}
  gray.delete();f.delete();blur.delete();gx.delete();gy.delete();return g;
}
function rectangleInit(mask,padFraction=.05){
  let minX=mask.cols,minY=mask.rows,maxX=-1,maxY=-1;for(let y=0;y<mask.rows;y++)for(let x=0;x<mask.cols;x++)if(mask.data[y*mask.cols+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  if(maxX<minX)return new Uint8Array(mask.rows*mask.cols);
  const pad=Math.max(2,Math.round(Math.max(maxX-minX+1,maxY-minY+1)*padFraction)),x0=clamp(minX-pad,1,mask.cols-2),x1=clamp(maxX+1+pad,2,mask.cols-1),y0=clamp(minY-pad,1,mask.rows-2),y1=clamp(maxY+1+pad,2,mask.rows-1),out=new Uint8Array(mask.rows*mask.cols);
  for(let y=y0;y<y1;y++)out.fill(1,y*mask.cols+x0,y*mask.cols+x1);return out;
}
function expandedOuterMask(cv,rough,fraction=.025){
  const outer=outerFill(cv,rough);
  if(cv.countNonZero(outer)===0)return outer;
  const ksize=Math.max(3,(Math.round(Math.min(outer.cols,outer.rows)*fraction)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ksize,ksize)),expanded=new cv.Mat();
  cv.dilate(outer,expanded,kernel);outer.delete();kernel.delete();return expanded;
}
function morphInitFromRough(cv,rough){
  const expanded=expandedOuterMask(cv,rough,.025);
  const init=new Uint8Array(expanded.rows*expanded.cols);
  if(cv.countNonZero(expanded)>0){for(let i=0;i<init.length;i++)init[i]=expanded.data[i]?1:0;}
  expanded.delete();
  if(init.some(v=>v))return init;
  return rectangleInit(rough);
}
function resampledSnakeFromRough(cv,rough,count=128){
  const expanded=expandedOuterMask(cv,rough,.025),found=largestExternal(cv,expanded);expanded.delete();
  if(!found.contour||found.contour.rows<4){found.contour?.delete?.();return null;}
  const points=Array.from({length:found.contour.rows},(_,i)=>[found.contour.data32S[i*2],found.contour.data32S[i*2+1]]);
  found.contour.delete();
  const n=points.length,cumulative=new Float64Array(n+1);let total=0;
  for(let i=0;i<n;i++){const a=points[i],b=points[(i+1)%n],d=Math.hypot(b[0]-a[0],b[1]-a[1]);total+=d;cumulative[i+1]=total;}
  if(total<1)return null;
  const snake=[];let seg=0;
  for(let k=0;k<count;k++){
    const target=total*k/count;
    while(seg<n-1&&cumulative[seg+1]<target)seg++;
    const a=points[seg],b=points[(seg+1)%n],den=Math.max(1e-9,cumulative[seg+1]-cumulative[seg]),t=(target-cumulative[seg])/den;
    snake.push([a[1]+(b[1]-a[1])*t,a[0]+(b[0]-a[0])*t]);
  }
  return snake;
}
function rectangleSnake(mask,count=128,padFraction=.05){
  let minX=mask.cols,minY=mask.rows,maxX=-1,maxY=-1;for(let y=0;y<mask.rows;y++)for(let x=0;x<mask.cols;x++)if(mask.data[y*mask.cols+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  if(maxX<minX){minX=2;minY=2;maxX=mask.cols-3;maxY=mask.rows-3;}
  const pad=Math.max(2,Math.round(Math.max(maxX-minX+1,maxY-minY+1)*padFraction)),x0=clamp(minX-pad,1,mask.cols-2),x1=clamp(maxX+pad,2,mask.cols-1),y0=clamp(minY-pad,1,mask.rows-2),y1=clamp(maxY+pad,2,mask.rows-1),snake=[],q=Math.max(4,Math.floor(count/4));
  for(let i=0;i<q;i++){const t=i/q;snake.push([y0,x0+t*(x1-x0)]);}for(let i=0;i<q;i++){const t=i/q;snake.push([y0+t*(y1-y0),x1]);}for(let i=0;i<q;i++){const t=i/q;snake.push([y1,x1-t*(x1-x0)]);}for(let i=0;i<q;i++){const t=i/q;snake.push([y1-t*(y1-y0),x0]);}
  return snake;
}
function morphMask(cv,rgba,rough,{iterations=65}={}){
  const g=inverseGradientGImage(cv,rgba),init=morphInitFromRough(cv,rough),u=morphGAC(g,rgba.cols,rgba.rows,init,{numIter:iterations,smoothing:1,threshold:'auto',balloon:-1}),out=cv.Mat.zeros(rgba.rows,rgba.cols,cv.CV_8UC1);
  for(let i=0;i<u.length;i++)if(u[i])out.data[i]=255;const filled=outerFill(cv,out);out.delete();return filled;
}
function activeMask(cv,rgba,rough){
  const gray=new cv.Mat(),f=new cv.Mat(),blur=new cv.Mat();cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);gray.convertTo(f,cv.CV_32F,1/255);cv.GaussianBlur(f,blur,new cv.Size(0,0),1,1,cv.BORDER_REPLICATE);
  const snake=resampledSnakeFromRough(cv,rough,128)||rectangleSnake(rough,128,.05);
  const r=activeContour(new Float32Array(blur.data32F),rgba.cols,rgba.rows,snake,{alpha:.015,beta:.12,gamma:.02,wLine:0,wEdge:1,maxNumIter:500,convergence:.05,maxPxMove:1}),pts=r.snake.flatMap(([y,x])=>[Math.round(x),Math.round(y)]),contour=cv.matFromArray(r.snake.length,1,cv.CV_32SC2,pts),out=cv.Mat.zeros(rgba.rows,rgba.cols,cv.CV_8UC1),v=new cv.MatVector();v.push_back(contour);cv.drawContours(out,v,-1,new cv.Scalar(255),cv.FILLED);gray.delete();f.delete();blur.delete();contour.delete();v.delete();return out;
}
function restoreHoles(cv,outer,holes){
  if(!holes||cv.countNonZero(holes)===0)return;const target=new cv.Mat();cv.bitwise_and(holes,outer,target);outer.setTo(new cv.Scalar(0),target);target.delete();
}
function regionFromMask(cv,mask,globalX,globalY,pageW,pageH,method,confidence,elapsed){
  const found=largestExternal(cv,mask);if(!found.contour)return null;const b=cv.boundingRect(found.contour),local=mask.roi(new cv.Rect(b.x,b.y,b.width,b.height)),packed=new cv.Mat();local.copyTo(packed);const poly=new cv.Mat();cv.approxPolyDP(found.contour,poly,Math.max(.7,cv.arcLength(found.contour,true)*.0015),true);const points=contourPoints(poly).map(([x,y])=>[x-b.x,y-b.y]);found.contour.delete();poly.delete();local.delete();
  return {x:(globalX+b.x)/pageW,y:(globalY+b.y)/pageH,w:b.width/pageW,h:b.height/pageH,pixels:cv.countNonZero(mask),edgeMethod:method,boundaryConfidence:confidence,refinementMS:elapsed,mask:{width:b.width,height:b.height,alpha:new Uint8Array(packed.data),polygons:[points],topologyPreserved:true}};
}

/**
 * Browser-only boundary refinement using OpenCV.js + scikit-image-equivalent
 * contour engines. Candidate discovery remains unchanged.
 */
export function refineMaterialBoundaries(cv,p){
  const pageW=p.width,pageH=p.height,src=cv.matFromArray(pageH,pageW,cv.CV_8UC4,p.pixels),mode=p.mode||'auto',post={edgePolish:p.postprocess?.edgePolish!==false,shapeRegularization:p.postprocess?.shapeRegularization!==false,curveSmooth:p.postprocess?.curveSmooth!==false,apertures:p.postprocess?.apertures!==false},useChroma=p.chromaEdges!==false,out=[];
  try{
    for(const candidate of p.candidates||[]){
      const started=typeof performance!=='undefined'?performance.now():Date.now(),
        gx=Math.round(candidate.x*pageW),gy=Math.round(candidate.y*pageH),
        gw=Math.max(1,Math.round(candidate.w*pageW)),gh=Math.max(1,Math.round(candidate.h*pageH)),
        pad=Math.max(5,Math.round(Math.max(gw,gh)*.12)),
        x0=Math.max(0,gx-pad),y0=Math.max(0,gy-pad),
        x1=Math.min(pageW,gx+gw+pad),y1=Math.min(pageH,gy+gh+pad),
        rw=x1-x0,rh=y1-y0,roi=src.roi(new cv.Rect(x0,y0,rw,rh)),
        rough=placedMaskFromCandidate(cv,candidate,pageW,pageH,x0,y0,rw,rh),
        holes=candidate.mask?.alpha?.length?enclosedHoles(cv,rough):null;
      let selected=null,method='',confidence=0,workImage=null,workMask=null,support=null,shapeModel=null;

      if(mode==='postprocess'){
        // Review workflow: keep the chosen recognition mask fixed and apply
        // only the explicitly enabled automatic finishing stages below.
        selected=rough.clone();method=candidate.edgeMethod||'browser-postprocess-only';confidence=candidate.boundaryConfidence??1;
      }else if(mode==='morphgac'||mode==='quality'||mode==='hybrid'||mode==='auto'){
        const hybrid=mode==='hybrid',automatic=mode==='auto',
          maxDim=hybrid?180:automatic?160:180,
          iterations=hybrid?80:automatic?65:80,
          quality=resizeForBudget(cv,roi,rough,maxDim),qsupport=edgeSupportMap(cv,quality.image,useChroma);
        selected=morphMask(cv,quality.image,quality.mask,{iterations});
        method=hybrid||automatic?(post.edgePolish?'browser-morphgac-grabcut':'browser-morphgac'):'browser-morphgac';
        confidence=boundarySupport(cv,selected,qsupport);
        workImage=quality.image;workMask=quality.mask;support=qsupport;
      }else{
        const fast=resizeForBudget(cv,roi,rough,320);
        workImage=fast.image;workMask=fast.mask;support=edgeSupportMap(cv,fast.image,useChroma);
        if(mode==='grabcut'){
          selected=grabCutMask(cv,fast.image,fast.mask);
          method='browser-grabcut';
        }else{
          selected=activeMask(cv,fast.image,fast.mask);
          method='browser-active-contour';
        }
        confidence=boundarySupport(cv,selected,support);
      }

      let full=upscaleBinaryMask(cv,selected,rw,rh);
      selected.delete();selected=full;
      if(post.edgePolish){
        const polished=grabCutPolishMask(cv,roi,selected);
        // High-confidence physical carriers are already geometrically useful
        // seeds. A full-resolution GrabCut may prefer dark printed content over
        // a weak white carrier, so postprocess-only polishing is accepted only
        // when it is a local boundary correction rather than a topology/area
        // rewrite.
        const conservative=mode==='postprocess'||candidate.physicalCarrierRecovered===true;
        if(conservative){
          const before=Math.max(1,cv.countNonZero(selected)),after=cv.countNonZero(polished),ratio=after/before,fit=maskAgreement(cv,selected,polished);
          if(fit>=.88&&ratio>=.90&&ratio<=1.12){selected.delete();selected=polished;}else polished.delete();
        }else{selected.delete();selected=polished;}
      }
      if(post.shapeRegularization){
        const shape=regularizeBasicShape(cv,roi,selected,{quadrilateral:true,ellipse:true,polygon:true,useChroma});
        selected.delete();selected=shape.mask;shapeModel=shape.kind;
      }
      if(!shapeModel&&post.curveSmooth){
        const smoothed=smoothCurvedMask(cv,selected);selected.delete();selected=smoothed;
      }
      if(post.apertures&&holes){
        const fullHoles=upscaleBinaryMask(cv,holes,rw,rh);
        restoreHoles(cv,selected,fullHoles);fullHoles.delete();
      }
      const elapsed=(typeof performance!=='undefined'?performance.now():Date.now())-started,
        region=regionFromMask(cv,selected,x0,y0,pageW,pageH,method,confidence,elapsed);
      if(region)out.push({...candidate,...region,postprocessed:post,shapeModel});else out.push(candidate);

      selected.delete();holes?.delete();support?.delete();workImage?.delete();workMask?.delete();rough.delete();roi.delete();
    }
    return out;
  }finally{src.delete();}
}
