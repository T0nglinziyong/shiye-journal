import {localPageLab} from './paper-reference.js';

const contourPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function largestExternal(cv,mask){
  const cs=new cv.MatVector(),hh=new cv.Mat();cv.findContours(mask,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,area=0;
  for(let i=0;i<cs.size();i++){const c=cs.get(i),a=cv.contourArea(c);if(a>area){best?.delete?.();best=c;area=a;}else c.delete();}
  cs.delete();hh.delete();return {contour:best,area};
}
function shiftedContour(cv,c,dx,dy){
  const pts=[];for(let i=0;i<c.rows;i++)pts.push(c.data32S[i*2]+dx,c.data32S[i*2+1]+dy);
  return cv.matFromArray(c.rows,1,cv.CV_32SC2,pts);
}
function median(a){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[(b.length/2)|0];}

export function expandWhiteCarrier(cv,{contour,page,edges,lab,w,h,pxPerMM,paperRef}){
  const b=cv.boundingRect(contour),pad=Math.max(10,Math.round(pxPerMM*16)),x0=Math.max(0,b.x-pad),y0=Math.max(0,b.y-pad),x1=Math.min(w,b.x+b.width+pad),y1=Math.min(h,b.y+b.height+pad),rw=x1-x0,rh=y1-y0;
  if(rw<12||rh<12)return {contour,owned:false,expanded:false};
  const rough=cv.Mat.zeros(rh,rw,cv.CV_8UC1),shifted=shiftedContour(cv,contour,-x0,-y0),one=new cv.MatVector();one.push_back(shifted);cv.drawContours(rough,one,-1,new cv.Scalar(255),cv.FILLED);
  const roughArea=cv.countNonZero(rough);if(roughArea<20){rough.delete();shifted.delete();one.delete();return {contour,owned:false,expanded:false};}
  const pageROI=page.roi(new cv.Rect(x0,y0,rw,rh)),labROI=lab.roi(new cv.Rect(x0,y0,rw,rh)),edgeROI=edges.roi(new cv.Rect(x0,y0,rw,rh));

  const inner=new cv.Mat(),outer=new cv.Mat(),ring=new cv.Mat(),innerR=Math.max(2,Math.round(pxPerMM*2.5)),outerR=Math.max(innerR+2,Math.round(pxPerMM*9));
  const ik=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(innerR*2+1,innerR*2+1)),ok=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(outerR*2+1,outerR*2+1));
  cv.dilate(rough,inner,ik);cv.dilate(rough,outer,ok);cv.subtract(outer,inner,ring);
  const local=localPageLab(labROI,pageROI,rw,rh,ring,paperRef),whiteThreshold=Math.max(10,(local.madL||4)*2.2);

  const zoneR=Math.max(4,Math.round(pxPerMM*14)),zk=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(zoneR*2+1,zoneR*2+1)),zone=new cv.Mat();cv.dilate(rough,zone,zk);
  const expanded=cv.Mat.zeros(rh,rw,cv.CV_8UC1);
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
    const i=y*rw+x;if(!zone.data[i])continue;
    if(rough.data[i]){expanded.data[i]=255;continue;}
    const at=i*3,dL=labROI.data[at]-local.L,chroma=Math.hypot(labROI.data[at+1]-local.a,labROI.data[at+2]-local.b);
    // White sticker carrier is often slightly brighter than the local page
    // because the page sits in a cast shadow. Coloured carrier pixels are kept
    // by chroma residual. Dark low-chroma shadow is deliberately NOT expansion.
    if(dL>whiteThreshold||chroma>6.5)expanded.data[i]=255;
  }
  const closeR=Math.max(2,Math.round(pxPerMM*1.8)),openR=Math.max(1,Math.round(pxPerMM*.35)),ck=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(closeR*2+1,closeR*2+1)),op=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(openR*2+1,openR*2+1));
  cv.morphologyEx(expanded,expanded,cv.MORPH_CLOSE,ck);cv.morphologyEx(expanded,expanded,cv.MORPH_OPEN,op);

  const labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat(),count=cv.connectedComponentsWithStats(expanded,labels,stats,centroids,8,cv.CV_32S);
  let label=0,bestOverlap=0;
  for(let n=1;n<count;n++){
    let overlap=0;for(let i=0;i<rw*rh;i++)if(labels.data32S[i]===n&&rough.data[i])overlap++;
    if(overlap>bestOverlap){bestOverlap=overlap;label=n;}
  }
  const component=cv.Mat.zeros(rh,rw,cv.CV_8UC1);
  if(label)for(let i=0;i<rw*rh;i++)if(labels.data32S[i]===label)component.data[i]=255;
  const found=largestExternal(cv,component),ratio=found.area/Math.max(roughArea,1);
  // Printed content may occupy only a modest fraction of a die-cut sticker.
  // Permit a substantially larger connected carrier, but never accept a weakly
  // related component. The later edge-support test still prevents expansion
  // into arbitrary A4 background.
  if(!found.contour||ratio<1.02||ratio>5.0||bestOverlap/roughArea<.80){
    found.contour?.delete?.();cleanup();return {contour,owned:false,expanded:false};
  }

  // White-outline edge snapping. Start from the expanded carrier and, for
  // each boundary sample, move only a small amount to the nearest supported
  // physical edge. The offset is smoothed around the closed curve, so a single
  // printed stroke cannot pull the boundary inward.
  const inv=new cv.Mat(),dist=new cv.Mat();cv.threshold(edgeROI,inv,0,255,cv.THRESH_BINARY_INV);cv.distanceTransform(inv,dist,cv.DIST_L2,5);
  let pts=contourPoints(found.contour),stride=Math.max(1,Math.ceil(pts.length/240));pts=pts.filter((_,i)=>i%stride===0).map(([x,y])=>[x,y]);
  if(pts.length<12){found.contour.delete();inv.delete();dist.delete();cleanup();return {contour,owned:false,expanded:false};}
  const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cy=pts.reduce((s,p)=>s+p[1],0)/pts.length,offsets=new Array(pts.length).fill(0),stepMM=.5,minMM=-.5,maxMM=2.5;
  for(let i=0;i<pts.length;i++){
    const prev=pts[(i-2+pts.length)%pts.length],next=pts[(i+2)%pts.length],tx=next[0]-prev[0],ty=next[1]-prev[1],len=Math.hypot(tx,ty)||1;
    let nx=-ty/len,ny=tx/len;const vx=pts[i][0]-cx,vy=pts[i][1]-cy;if(nx*vx+ny*vy<0){nx=-nx;ny=-ny;}
    const px=pts[i][0],py=pts[i][1],current=dist.data32F[clamp(Math.round(py),0,rh-1)*rw+clamp(Math.round(px),0,rw-1)];let bestD=0,bestCost=current;
    for(let mm=minMM;mm<=maxMM+1e-6;mm+=stepMM){
      const d=mm*pxPerMM,x=clamp(Math.round(px+nx*d),0,rw-1),y=clamp(Math.round(py+ny*d),0,rh-1),edgeDistance=dist.data32F[y*rw+x],cost=edgeDistance+Math.abs(mm)*.18+(mm<0?.18:0);
      if(cost<bestCost-.35){bestCost=cost;bestD=d;}
    }
    offsets[i]=bestD;
  }
  for(let pass=0;pass<2;pass++){const copy=[...offsets];for(let i=0;i<offsets.length;i++)offsets[i]=(copy[(i-1+copy.length)%copy.length]+2*copy[i]+copy[(i+1)%copy.length])/4;}
  const snapped=[];
  for(let i=0;i<pts.length;i++){
    const prev=pts[(i-2+pts.length)%pts.length],next=pts[(i+2)%pts.length],tx=next[0]-prev[0],ty=next[1]-prev[1],len=Math.hypot(tx,ty)||1;let nx=-ty/len,ny=tx/len;const vx=pts[i][0]-cx,vy=pts[i][1]-cy;if(nx*vx+ny*vy<0){nx=-nx;ny=-ny;}
    snapped.push([Math.round(pts[i][0]+nx*offsets[i]+x0),Math.round(pts[i][1]+ny*offsets[i]+y0)]);
  }
  const result=cv.matFromArray(snapped.length,1,cv.CV_32SC2,snapped.flat());
  const resultBounds=cv.boundingRect(result),clearance=Math.max(2,Math.round(pxPerMM*3.0));
  if(resultBounds.x<clearance||resultBounds.y<clearance||resultBounds.x+resultBounds.width>w-clearance||resultBounds.y+resultBounds.height>h-clearance){
    result.delete();found.contour.delete();inv.delete();dist.delete();cleanup();return {contour,owned:false,expanded:false};
  }
  let supported=0;for(const [gx,gy] of snapped){const x=clamp(gx-x0,0,rw-1),y=clamp(gy-y0,0,rh-1);if(dist.data32F[y*rw+x]<=2.5)supported++;}
  const support=supported/snapped.length;
  found.contour.delete();inv.delete();dist.delete();cleanup();
  if(support<.42){result.delete();return {contour,owned:false,expanded:false};}
  return {contour:result,owned:true,expanded:true,areaRatio:ratio,edgeSupport:support,localPage:local};

  function cleanup(){
    rough.delete();shifted.delete();one.delete();pageROI.delete();labROI.delete();edgeROI.delete();inner.delete();outer.delete();ring.delete();ik.delete();ok.delete();zone.delete();zk.delete();expanded.delete();ck.delete();op.delete();labels.delete();stats.delete();centroids.delete();component.delete();
  }
}
