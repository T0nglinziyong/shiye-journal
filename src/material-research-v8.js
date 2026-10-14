// Browser port of the research package's V7 carrier detector. Pixel thresholds,
// proposal order and evidence rules follow v7_detector.py. The masks remain
// separate from content segmentation, exactly as in the research pipeline.
import {discoverResidualCarriers,recoverResidualCarriers} from './material-residual-recovery.js';
const area=b=>b[2]*b[3];
const center=b=>[b[0]+b[2]/2,b[1]+b[3]/2];
const overlap=(a,b)=>Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*
  Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
const iou=(a,b)=>overlap(a,b)/Math.max(1,area(a)+area(b)-overlap(a,b));
const ovsmall=(a,b)=>overlap(a,b)/Math.max(1,Math.min(area(a),area(b)));
const median=a=>{a.sort((x,y)=>x-y);const n=a.length;return n? n%2?a[n>>1]:(a[n/2-1]+a[n/2])/2:0;};
const bound=c=>{const x=c.x,y=c.y;return [x,y,c.width,c.height];};
const pointList=c=>{const points=[];for(let i=0;i<c.rows;i++)points.push([c.data32S[i*2],c.data32S[i*2+1]]);return points;};
const rectPoints=b=>[[b[0],b[1]],[b[0]+b[2],b[1]],[b[0]+b[2],b[1]+b[3]],[b[0],b[1]+b[3]]];
const linked=(items,relation)=>{
  const parents=items.map((_,i)=>i),find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(relation(items[i],items[j]))parents[find(i)]=find(j);
  const map=new Map();for(let i=0;i<items.length;i++){const key=find(i);if(!map.has(key))map.set(key,[]);map.get(key).push(items[i]);}
  return [...map.values()];
};
const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const fLab=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;
function labPixels(pixels,w,h){
  const out=new Float32Array(w*h*3);
  for(let i=0;i<w*h;i++){
    const r=linear(pixels[i*4]),g=linear(pixels[i*4+1]),b=linear(pixels[i*4+2]);
    const xx=fLab((r*.4124564+g*.3575761+b*.1804375)/.95047),
      yy=fLab(r*.2126729+g*.7151522+b*.0721750),
      zz=fLab((r*.0193339+g*.1191920+b*.9503041)/1.08883);
    out[i*3]=116*yy-16;out[i*3+1]=500*(xx-yy);out[i*3+2]=200*(yy-zz);
  }
  return out;
}
function colorRegions(cv,lab,w,h,own){
  const border=[[],[],[]];
  for(let y=2;y<h;y+=3)for(let x=2;x<w;x+=3)
    if(x<=w*.06||x>=w*.94||y<=h*.06||y>=h*.94){const i=(y*w+x)*3;for(let c=0;c<3;c++)border[c].push(lab[i+c]);}
  const bg=border.map(median),fg=new Uint8Array(w*h);
  for(let i=0;i<fg.length;i++){
    const dl=Math.abs(lab[i*3]-bg[0]),dc=Math.hypot(lab[i*3+1]-bg[1],lab[i*3+2]-bg[2]);
    fg[i]=Math.hypot(.8*dl,1.5*dc)>14?255:0;
  }
  const source=own(cv.matFromArray(h,w,cv.CV_8UC1,fg)),closed=own(new cv.Mat()),
    kernel=own(cv.getStructuringElement(cv.MORPH_CROSS,new cv.Size(3,3))),
    labels=own(new cv.Mat()),stats=own(new cv.Mat()),centroids=own(new cv.Mat());
  cv.morphologyEx(source,closed,cv.MORPH_CLOSE,kernel);
  const n=cv.connectedComponentsWithStats(closed,labels,stats,centroids,4,cv.CV_32S),regions=[];
  for(let j=1;j<n;j++){
    const [x,y,bw,bh,count]=Array.from(stats.data32S.slice(j*5,j*5+5));
    if(count<Math.round(w*h*.002))continue;
    const mask=new Uint8Array(bw*bh);
    for(let yy=0;yy<bh;yy++)for(let xx=0;xx<bw;xx++)if(labels.data32S[(y+yy)*w+x+xx]===j)mask[yy*bw+xx]=255;
    regions.push({bbox:[x,y,bw,bh],mask,area:count,fill:count/(bw*bh)});
  }
  regions.sort((a,b)=>b.area-a.area);
  return regions;
}
function edgeProposals(cv,blur,w,h,own){
  const proposals=[];
  for(const [lo,hi,close] of [[8,25,3],[15,45,3],[15,45,7],[25,75,5],[35,95,9]]){
    const edges=own(new cv.Mat()),closed=own(new cv.Mat()),support=own(new cv.Mat()),
      closeKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(close,close))),
      supportKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5))),
      contours=new cv.MatVector(),hierarchy=new cv.Mat();
    try{
      cv.Canny(blur,edges,lo,hi);
      cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,closeKernel);
      cv.dilate(edges,support,supportKernel);
      cv.findContours(closed,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
      for(let i=0;i<contours.size();i++){
        const c=contours.get(i);
        try{
          const b=bound(cv.boundingRect(c)),a=Math.abs(cv.contourArea(c));
          if(Math.min(b[2],b[3])<24||a<w*h*.0015||b[2]>w*.72||b[3]>h*.72||
            b[0]<8||b[1]<8||b[0]+b[2]>w-8||b[1]+b[3]>h-8)continue;
          const fill=a/Math.max(1,area(b));if(fill<.16)continue;
          if(cv.arcLength(c,true)>12*Math.sqrt(Math.max(1,a)))continue;
          const hull=new cv.Mat();let solidity=0;
          try{cv.convexHull(c,hull,false,true);solidity=a/Math.max(1,cv.contourArea(hull));}finally{hull.delete();}
          const points=pointList(c),step=Math.max(1,Math.floor(points.length/180));let hits=0,samples=0;
          for(let k=0;k<points.length;k+=step){const [x,y]=points[k];hits+=support.data[y*w+x]>0;samples++;}
          const edgeSupport=hits/Math.max(1,samples);
          proposals.push({bbox:b,c:points,area:a,fill,solidity,support:edgeSupport,
            quality:fill*.25+edgeSupport*.22+Math.min(1,a/(w*h*.035))*.28+Math.min(1,solidity)*.25});
        }finally{c.delete();}
      }
    }finally{contours.delete();hierarchy.delete();}
  }
  proposals.sort((a,b)=>b.quality-a.quality||b.area-a.area);
  const distinct=[];for(const p of proposals)if(!distinct.some(q=>iou(p.bbox,q.bbox)>.79))distinct.push(p);
  return distinct;
}
function percentile65(values){
  values.sort((a,b)=>a-b);const pos=(values.length-1)*.65,lo=Math.floor(pos),fraction=pos-lo;
  return values[lo]*(1-fraction)+values[Math.min(values.length-1,lo+1)]*fraction;
}
function smoothMax(values,start,end){
  if(end<=start)return [null,0];let best=-Infinity,index=-1;
  if(end-start===1)return [start,values[start]];
  // GaussianBlur(..., sigma=2) on a one-row float array, with REFLECT_101 edges.
  const kernel=[.002218,.008773,.027023,.064825,.121109,.176213,.199676,.176213,.121109,.064825,.027023,.008773,.002218];
  const n=end-start;
  for(let i=0;i<n;i++){
    let value=0;for(let k=-6;k<=6;k++){
      let j=i+k;while(j<0||j>=n)j=j<0?-j:2*n-2-j;
      value+=values[start+j]*kernel[k+6];
    }
    if(value>best){best=value;index=i;}
  }
  return [start+index,best];
}
function rectangleSearch(seed,gx,gy,w,h){
  const [sx,sy,sw,sh]=seed,padx=Math.min(65,Math.max(18,sw*.28)),pady=Math.min(55,Math.max(15,sh*.34));
  const x0=Math.max(5,Math.trunc(sx-padx)),x1=Math.min(w-5,Math.trunc(sx+sw+padx)),
    y0=Math.max(5,Math.trunc(sy-pady)),y1=Math.min(h-5,Math.trunc(sy+sh+pady));
  const ya=Math.trunc(Math.max(2,sy-4)),yb=Math.trunc(Math.min(h-2,sy+sh+4)),
    xa=Math.trunc(Math.max(2,sx-4)),xb=Math.trunc(Math.min(w-2,sx+sw+4));
  if(yb<=ya||xb<=xa)return null;
  const cols=[],rows=[];
  for(let x=x0;x<x1;x++){const values=[];for(let y=ya;y<yb;y++)values.push(gx[y*w+x]);cols.push(percentile65(values));}
  for(let y=y0;y<y1;y++){const values=[];for(let x=xa;x<xb;x++)values.push(gy[y*w+x]);rows.push(percentile65(values));}
  const pos=(arr,base,low,high)=>{
    const a=Math.max(0,Math.trunc(low)-base),b=Math.min(arr.length,Math.trunc(high)-base);
    if(b<=a)return [null,0];const [index,value]=smoothMax(arr,a,b);return [base+index,value];
  };
  const [lx,ls]=pos(cols,x0,sx-padx,sx-3),[rx,rs]=pos(cols,x0,sx+sw+3,sx+sw+padx),
    [ty,ts]=pos(rows,y0,sy-pady,sy-3),[by,bs]=pos(rows,y0,sy+sh+3,sy+sh+pady);
  if([lx,rx,ty,by].some(v=>v===null))return null;
  const support=Math.min(ls,rs,ts,bs);if(support<1.4)return null;
  const bbox=[lx,ty,rx-lx,by-ty];return {bbox,support,quality:Math.min(1,support/18),source:'weak-carrier-line',c:rectPoints(bbox)};
}
const dominates=(parent,child)=>{
  const a=parent.bbox,b=child.bbox,better=parent.quality-child.quality;
  return iou(a,b)>.68||(ovsmall(a,b)>.88&&area(a)>area(b)*1.10&&better>-.12)||
    (area(a)>area(b)*2&&ovsmall(a,b)>.55&&better>.2);
};

function candidateRows(cv,p,gray,blur,gx,gy,lab,regions,edges,own){
  const w=p.width,h=p.height;
  const anchors=[];
  for(const old of p.legacyBoxes||[]){
    const b=[old.x*w,old.y*h,old.w*w,old.h*h].map(Math.round);
    if(Math.min(b[2],b[3])<10)continue;
    if(Math.max(b[2]/w,b[3]/h)>.84&&Math.max(b[2]/Math.max(1,b[3]),b[3]/Math.max(1,b[2]))>3.6)continue;
    anchors.push({bbox:b,source:'old-base',c:null,quality:.25,orig:b.slice(),seedDensity:old.seedDensity||0,fillRatio:old.fillRatio||0});
  }
  const accepted=[];
  for(const old of anchors){
    const a=old.bbox,choices=[];
    for(const z of edges){
      const b=z.bbox,ov=iou(a,b),contains=ovsmall(a,b),scale=area(b)/Math.max(1,area(a)),[cx,cy]=center(a);
      const inside=b[0]-3<=cx&&cx<=b[0]+b[2]+3&&b[1]-3<=cy&&cy<=b[1]+b[3]+3;
      const strongOuterCarrier=area(a)<w*h*.02&&scale>=4.5&&scale<20&&contains>.7&&
        z.quality>.9&&z.fill>.85&&z.solidity>.85;
      if(inside&&((scale>.32&&scale<4.5&&(ov>.20||contains>.65)&&
        (z.solidity>.68||(ov>.72&&z.quality>.78&&z.solidity>.64)))||strongOuterCarrier))
        choices.push({score:z.quality+.2*contains-.14*Math.abs(Math.log(scale)),z});
    }
    if(choices.length){
      choices.sort((a,b)=>b.score-a.score);const z=choices[0].z;
      if(z.quality>.46)accepted.push({bbox:z.bbox.slice(),source:'edge-envelope',c:z.c,quality:z.quality,
        orig:a,seedDensity:old.seedDensity,fill:z.fill,solidity:z.solidity});
      else accepted.push(old);
    }else accepted.push(old);
  }
  // A faint carrier can be represented by only its interior texture after a
  // JPEG re-encode. Recover the four outer lines when all sides have evidence.
  for(const row of accepted){
    if(row.source!=='edge-envelope'||row.seedDensity>=.05||area(row.orig)<w*h*.06)continue;
    if(anchors.some(a=>a.bbox[1]<row.orig[1]&&a.bbox[1]+a.bbox[3]<=row.orig[1]+2&&
      row.orig[1]-(a.bbox[1]+a.bbox[3])<32&&a.bbox[3]<row.orig[3]*.2&&
      Math.min(a.bbox[0]+a.bbox[2],row.orig[0]+row.orig[2])>Math.max(a.bbox[0],row.orig[0])))continue;
    const outer=rectangleSearch(row.orig,gx,gy,w,h);
    if(outer&&outer.support>5&&area(outer.bbox)>area(row.bbox)*1.2&&area(outer.bbox)<area(row.bbox)*2.2){
      Object.assign(row,{bbox:outer.bbox,c:outer.c,source:'weak-carrier-line',quality:.80,needsReview:true});
    }
  }
  const ref=[[],[],[]];for(let y=0;y<12;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)ref[c].push(lab[(y*w+x)*3+c]);
  for(let y=h-12;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)ref[c].push(lab[(y*w+x)*3+c]);
  const bg=ref.map(median);
  for(const anchor of accepted){
    if(anchor.source!=='old-base')continue;
    const options=[];
    for(const z of regions){
      const b=z.bbox;if(iou(anchor.bbox,b)<.73||z.fill<.42||area(b)<w*h*.05||anchor.seedDensity>.8)continue;
      const [x,y,bw,bh]=b,chrom=[];
      for(let yy=0;yy<bh;yy++)for(let xx=0;xx<bw;xx++)if(z.mask[yy*bw+xx]){
        const i=((y+yy)*w+x+xx)*3;chrom.push(Math.hypot(lab[i+1]-bg[1],lab[i+2]-bg[2]));
      }
      const mean=median(chrom);if(mean<19)continue;
      const mask=own(cv.matFromArray(bh,bw,cv.CV_8UC1,z.mask)),cs=new cv.MatVector(),hierarchy=new cv.Mat();
      try{
        cv.findContours(mask,cs,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
        let best=null,bestArea=0;
        for(let j=0;j<cs.size();j++){
          const c=cs.get(j);
          try{const a=cv.contourArea(c);if(a>bestArea){best=pointList(c);bestArea=a;}}finally{c.delete();}
        }
        if(bestArea<.32*bw*bh)continue;
        options.push({score:mean,row:{bbox:b.slice(),source:'v2-color-exterior',c:best.map(([px,py])=>[px+x,py+y]),
          orig:anchor.bbox.slice(),quality:.81}});
      }finally{cs.delete();hierarchy.delete();}
    }
    if(options.length){options.sort((a,b)=>b.score-a.score);Object.assign(anchor,options[0].row);}
  }
  for(const color of regions){
    const b=color.bbox,a=color.area;
    if(Math.min(b[2],b[3])<28||a<w*h*.003)continue;
    if(b[0]<9||b[1]<9||b[0]+b[2]>w-9||b[1]+b[3]>h-9||b[2]>w*.74||b[3]>h*.74)continue;
    if(accepted.some(row=>ovsmall(row.bbox,b)>.7&&area(row.bbox)>area(b)*.65))continue;
    accepted.push({bbox:b.slice(),source:'v2-color-new',c:null,quality:Math.min(.6,color.fill),orig:b.slice()});
  }
  for(const e of edges){
    const b=e.bbox;if(e.quality<.60||Math.min(b[2],b[3])<42||e.fill<.5)continue;
    if(accepted.some(row=>ovsmall(row.bbox,b)>.72))continue;
    accepted.push({bbox:b.slice(),source:'edge-uncovered',c:e.c,quality:e.quality,orig:b.slice(),fill:e.fill,solidity:e.solidity});
  }
  const small=anchors.filter(a=>{
    const b=a.bbox;return b[2]>25&&b[2]<w*.34&&b[3]>14&&b[3]<h*.115&&b[0]>0&&b[1]>15&&a.seedDensity>.18;
  });
  const groups=linked(small,(aa,bb)=>{
    const a=aa.bbox,b=bb.bbox,
      gap=Math.max(0,Math.max(a[1],b[1])-Math.min(a[1]+a[3],b[1]+b[3])),
      hov=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))/Math.max(1,Math.min(a[2],b[2])),
      sameRow=Math.abs(center(a)[1]-center(b)[1])<Math.max(a[3],b[3])*.7&&
        Math.max(0,Math.max(a[0],b[0])-Math.min(a[0]+a[2],b[0]+b[2]))<15;
    return (hov>.36&&gap<Math.max(32,Math.min(a[2],b[2])*.34))||sameRow;
  }).filter(c=>c.length>=3).map(cluster=>{
    const x=Math.min(...cluster.map(z=>z.bbox[0])),y=Math.min(...cluster.map(z=>z.bbox[1])),
      xe=Math.max(...cluster.map(z=>z.bbox[0]+z.bbox[2])),ye=Math.max(...cluster.map(z=>z.bbox[1]+z.bbox[3]));
    return [x,y,xe-x,ye-y];
  }).filter(b=>b[3]>=b[2]*.35&&b[3]<=h*.39&&
    !accepted.some(z=>ovsmall(b,z.bbox)>.87&&area(z.bbox)>area(b)*1.08));
  for(const group of groups){
    const rec=rectangleSearch(group,gx,gy,w,h);if(!rec)continue;
    const b=rec.bbox;if(!(area(b)>.95*area(group)&&area(b)<2.6*area(group)))continue;
    if(accepted.some(row=>iou(b,row.bbox)>.7))continue;
    rec.orig=group.slice();rec.quality=rec.support>5?.80:.60;accepted.push(rec);
  }
  const weak=accepted.filter(z=>{
    const b=z.bbox;if(z.source!=='old-base'||z.seedDensity>=.075||area(b)>=w*h*.018||Math.min(b[2],b[3])<30)return false;
    const [cx,cy]=center(b);
    return !accepted.some(q=>q!==z&&q.quality>.60&&q.bbox[0]<=cx&&cx<=q.bbox[0]+q.bbox[2]&&q.bbox[1]<=cy&&cy<=q.bbox[1]+q.bbox[3]);
  });
  for(const cluster of linked(weak,(a,b)=>Math.hypot(center(a.bbox)[0]-center(b.bbox)[0],center(a.bbox)[1]-center(b.bbox)[1])<Math.max(w,h)*.26)){
    if(cluster.length<3)continue;
    const x=Math.min(...cluster.map(z=>z.bbox[0])),y=Math.min(...cluster.map(z=>z.bbox[1])),
      xe=Math.max(...cluster.map(z=>z.bbox[0]+z.bbox[2])),ye=Math.max(...cluster.map(z=>z.bbox[1]+z.bbox[3]));
    const cb=[x,y,xe-x,ye-y];if(cb[2]<w*.10||cb[3]<h*.13)continue;
    const px1=Math.max(5,Math.trunc(x-Math.min(26,cb[2]*.12))),px2=Math.min(w-5,Math.trunc(xe+Math.min(26,cb[2]*.12))),
      py1=Math.max(5,Math.trunc(y-Math.min(70,cb[3]*.31))),py2=Math.min(h-5,Math.trunc(ye+Math.min(65,cb[3]*.28))),
      rx0=Math.max(5,Math.trunc(x+cb[2]*.08)),rx1=Math.min(w-5,Math.trunc(xe-cb[2]*.08)),
      ry0=Math.max(5,Math.trunc(y+cb[3]*.08)),ry1=Math.min(h-5,Math.trunc(ye-cb[3]*.08));
    if(rx1<=rx0||ry1<=ry0)continue;
    const rows=[],cols=[];
    for(let yy=py1;yy<py2;yy++){let hit=0;for(let xx=rx0;xx<rx1;xx++)hit+=gy[yy*w+xx]>10;rows.push(hit/(rx1-rx0));}
    for(let xx=px1;xx<px2;xx++){let hit=0;for(let yy=ry0;yy<ry1;yy++)hit+=gx[yy*w+xx]>7;cols.push(hit/(ry1-ry0));}
    const side=(v,a,b)=>{if(b<=a+3)return [null,0];let max=-1,index=null;for(let i=a;i<b;i++)if(v[i]>max){max=v[i];index=i;}return [index,max];};
    const [l,ls]=side(cols,0,Math.trunc(x)-px1),[r,rs]=side(cols,Math.trunc(xe)-px1,cols.length),
      [t,ts]=side(rows,0,Math.trunc(y)-py1),[bottom,bs]=side(rows,Math.trunc(ye)-py1,rows.length);
    if([l,r,t,bottom].some(v=>v===null))continue;
    const b=[px1+l,py1+t,r-l,bottom-t];
    if(Math.min(ls,rs,ts,bs)<.22||Math.min(b[2],b[3])<35||area(b)>area(cb)*2.1)continue;
    if(accepted.some(z=>!cluster.includes(z)&&ovsmall(b,z.bbox)>.80&&area(z.bbox)>area(b)*1.05))continue;
    accepted.push({bbox:b,c:rectPoints(b),source:'weak-carrier-review',quality:.68,orig:cb,edgeSupport:[ls,rs,ts,bs],weakSourceBoxes:cluster.map(z=>z.bbox)});
  }
  return {accepted,anchors,groups};
}

function finishRows(cv,rows,gray,blur,w,h,own){
  let {accepted,anchors}=rows;
  if(cv.HoughCircles){
    const roundCarrier=anchors.some(a=>{
      const b=a.bbox,ratio=b[2]/Math.max(1,b[3]);
      return area(b)>w*h*.06&&ratio>1.25&&ratio<1.9&&a.fillRatio>.2&&a.fillRatio<.55;
    });
    for(const enhanceContrast of [false,true]){
    if(enhanceContrast&&(!roundCarrier||accepted.some(a=>a.source==='edge-circle-verified')))break;
    const medianBlur=own(new cv.Mat()),circles=own(new cv.Mat());
    let circleInput=gray;
    if(enhanceContrast){circleInput=own(new cv.Mat());cv.equalizeHist(gray,circleInput);}
    cv.medianBlur(circleInput,medianBlur,5);
    cv.HoughCircles(medianBlur,circles,cv.HOUGH_GRADIENT,1.2,65,80,38,45,Math.floor(Math.min(w,h)/3));
    if(circles.total()>0){
      const e=own(new cv.Mat()),support=own(new cv.Mat()),
        kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5)));
      cv.Canny(blur,e,15,45);cv.dilate(e,support,kernel);
      for(let i=0;i<circles.total();i++){
        let [cx,cy,rad]=Array.from(circles.data32F.slice(i*3,i*3+3));
        let cb=[cx-rad,cy-rad,2*rad,2*rad];
        if(cb[0]<10||cb[1]<10||cb[0]+cb[2]>w-10||cb[1]+cb[3]>h-10)continue;
        const matching=[];
        for(const a of anchors){
          const b=a.bbox,scale=area(cb)/Math.max(1,area(b)),[oldx,oldy]=center(b);
          if(scale<=1.38||scale>=3.3||Math.hypot(oldx-cx,oldy-cy)>rad*.23||ovsmall(b,cb)<.80)continue;
          matching.push(a);
        }
        if(!matching.length)continue;
        let best=0,bestCircle=[cx,cy,rad];
        for(const dx of [-7,-3,0,3,7])for(const dy of [-7,-3,0,3,7])for(const dr of [-10,-6,-2,2,6]){
          let hits=0;for(let k=0;k<128;k++){
            const theta=2*Math.PI*k/128,
              x=Math.min(w-1,Math.max(0,Math.round(cx+dx+(rad+dr)*Math.cos(theta)))),
              y=Math.min(h-1,Math.max(0,Math.round(cy+dy+(rad+dr)*Math.sin(theta))));
            hits+=support.data[y*w+x]>0;
          }
          const coverage=hits/128;if(coverage>best){best=coverage;bestCircle=[cx+dx,cy+dy,rad+dr];}
        }
        if(best<.65)continue;
        [cx,cy,rad]=bestCircle;cb=[cx-rad,cy-rad,2*rad,2*rad];
        if(cb[0]<9||cb[1]<9||cb[0]+cb[2]>w-9||cb[1]+cb[3]>h-9)continue;
        let points=[];
        if(cv.ellipse2Poly){
          const poly=new cv.PointVector();
          try{
            cv.ellipse2Poly(new cv.Point(Math.round(cx),Math.round(cy)),
              new cv.Size(Math.round(rad),Math.round(rad)),0,0,360,4,poly);
            points=Array.from({length:poly.size()},(_,i)=>{const p=poly.get(i);return [p.x,p.y];});
          }finally{poly.delete();}
        }else for(let theta=0;theta<=360;theta+=4){
          const t=theta*Math.PI/180;
          points.push([Math.round(cx)+Math.round(rad)*Math.cos(t),Math.round(cy)+Math.round(rad)*Math.sin(t)].map(Math.round));
        }
        accepted.push({bbox:cb,source:'edge-circle-verified',c:points,quality:.90,orig:matching[0].bbox.slice(),circleGeometry:[cx,cy,rad]});
      }
    }
    }
  }
  const consumed=new Set(),joined=[];
  for(let i=0;i<accepted.length;i++){
    const a=accepted[i],b=a.bbox;
    if(a.source!=='old-base'||b[3]>h*.065)continue;
    for(let j=0;j<accepted.length;j++){
      if(i===j||consumed.has(j))continue;
      const d=accepted[j].bbox,gap=d[1]-(b[1]+b[3]),
        hov=Math.max(0,Math.min(b[0]+b[2],d[0]+d[2])-Math.max(b[0],d[0]))/Math.max(1,Math.min(b[2],d[2]));
      if(!(gap>=0&&gap<Math.min(28,h*.055)&&d[3]>b[3]*5&&hov>.70&&Math.abs(center(b)[0]-center(d)[0])<d[2]*.25))continue;
      const x=Math.min(b[0],d[0]),y=Math.min(b[1],d[1]),xe=Math.max(b[0]+b[2],d[0]+d[2]),ye=Math.max(b[1]+b[3],d[1]+d[3]),
        bw=xe-x,bh=ye-y,left=Math.max(0,Math.round(x-bw*.065)),top=Math.max(0,Math.round(y-bh*.045)),
        right=Math.min(w,Math.round(xe+bw*.065)),bottom=Math.min(h,Math.round(ye+bh*.14)),box=[left,top,right-left,bottom-top];
      joined.push({bbox:box,source:'weak-carrier-group-review',c:rectPoints([left,top,right-left,bottom-top]),quality:.66,orig:box.slice(),needsReview:true});
      consumed.add(i);consumed.add(j);break;
    }
  }
  if(consumed.size)accepted=accepted.filter((_,i)=>!consumed.has(i)).concat(joined);
  // Legacy connected components at the paper edge can be background scraps.
  // Require interior support before retaining an otherwise unverified box.
  accepted=accepted.filter(row=>row.source!=='old-base'||row.seedDensity>0||
    row.bbox[0]>=8&&row.bbox[1]>=8&&row.bbox[0]+row.bbox[2]<=w-8&&row.bbox[1]+row.bbox[3]<=h-8);
  const edge=own(new cv.Mat()),dilated=own(new cv.Mat()),kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5)));
  cv.Canny(gray,edge,10,30);cv.dilate(edge,dilated,kernel);
  for(const row of accepted){
    if(row.source!=='edge-envelope'||!(row.fill>.53&&row.fill<.77)||row.solidity>.82)continue;
    const [x,y,bw,bh]=row.bbox.map(Math.trunc),p=4;
    if(x<7||y<7||x+bw>w-7||y+bh>h-7||Math.min(bw,bh)<60)continue;
    const parts=[];
    for(const [xa,xb,ya,yb,vertical] of [
      [x+5,x+bw-5,Math.max(0,y-p),y+p+1,false],
      [x+5,x+bw-5,y+bh-p,Math.min(h,y+bh+p+1),false],
      [Math.max(0,x-p),x+p+1,y+5,y+bh-5,true],
      [x+bw-p,Math.min(w,x+bw+p+1),y+5,y+bh-5,true]
    ]){
      let hits=0,total=0;
      if(vertical){for(let yy=ya;yy<yb;yy++){let any=false;for(let xx=xa;xx<xb;xx++)any ||= dilated.data[yy*w+xx]>0;hits+=any;total++;}}
      else{for(let xx=xa;xx<xb;xx++){let any=false;for(let yy=ya;yy<yb;yy++)any ||= dilated.data[yy*w+xx]>0;hits+=any;total++;}}
      parts.push(hits/Math.max(1,total));
    }
    if(Math.min(...parts)>.44&&parts.reduce((a,b)=>a+b,0)/4>.70){
      row.c=rectPoints([x,y,bw,bh]);row.source='edge-rect-verified';row.linearSupport=parts;
    }
  }
  accepted.sort((a,b)=>b.quality-a.quality||area(b.bbox)-area(a.bbox));
  const kept=[];for(const q of accepted)if(!kept.some(k=>dominates(k,q)))kept.push(q);
  return kept.sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]);
}

function joinAdjacentFragments(cv,rows,w,h){
  const result=rows.slice();
  for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){
    const a=result[i],b=result[j],ab=a.bbox,bb=b.bbox;
    if(!['old-base','v2-color-new'].includes(a.source)&&!['old-base','v2-color-new'].includes(b.source))continue;
    const upper=ab[1]<=bb[1]?ab:bb,lower=upper===ab?bb:ab,
      horizontal=Math.max(0,Math.min(ab[0]+ab[2],bb[0]+bb[2])-Math.max(ab[0],bb[0]));
    if(horizontal<Math.min(ab[2],bb[2])*.65||Math.min(ab[2],bb[2])/Math.max(ab[2],bb[2])<.7||
      Math.abs(center(ab)[0]-center(bb)[0])>Math.max(ab[2],bb[2])*.12||
      lower[1]>upper[1]+upper[3]+Math.min(18,h*.03)||
      lower[1]+lower[3]<upper[1]+upper[3]+Math.min(18,h*.03))continue;
    const x=Math.min(ab[0],bb[0]),y=Math.min(ab[1],bb[1]),
      right=Math.max(ab[0]+ab[2],bb[0]+bb[2]),bottom=Math.max(ab[1]+ab[3],bb[1]+bb[3]),box=[x,y,right-x,bottom-y];
    if(area(box)>w*h*.30||area(box)<Math.max(area(ab),area(bb))*1.25)continue;
    const points=[...(a.c||rectPoints(ab)),...(b.c||rectPoints(bb))].flat(),
      input=cv.matFromArray(points.length/2,1,cv.CV_32SC2,points.map(Math.round)),hull=new cv.Mat();
    let contour;
    try{cv.convexHull(input,hull,false,true);contour=pointList(hull);}finally{input.delete();hull.delete();}
    result.splice(j,1);result[i]={bbox:box,c:contour,source:'fragment-union-review',quality:.66,orig:box.slice(),needsReview:true};
    j=i;
  }
  return result.sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]);
}

function encodeRow(cv,row,w,h){
  const [x,y,bw,bh]=row.bbox.map(Math.round),mask=cv.Mat.zeros(h,w,cv.CV_8UC1);
  try{
    if(row.c){
      const points=row.c.map(([px,py])=>[Math.round(px),Math.round(py)]),
        contour=cv.matFromArray(points.length,1,cv.CV_32SC2,points.flat()),vector=new cv.MatVector();
      try{vector.push_back(contour);cv.drawContours(mask,vector,-1,new cv.Scalar(255),cv.FILLED);}
      finally{vector.delete();contour.delete();}
    }else cv.rectangle(mask,new cv.Point(Math.max(0,x),Math.max(0,y)),
      new cv.Point(Math.min(w,x+bw)-1,Math.min(h,y+bh)-1),new cv.Scalar(255),cv.FILLED);
    const bounds=row.c?(()=>{
      const xs=row.c.map(p=>Math.round(p[0])),ys=row.c.map(p=>Math.round(p[1])),
        left=Math.min(...xs),top=Math.min(...ys);
      return [left,top,Math.max(...xs)-left+1,Math.max(...ys)-top+1];
    })():[x,y,bw,bh];
    const [left,top,ww,hh]=bounds,alpha=new Uint8Array(ww*hh);
    for(let yy=0;yy<hh;yy++)alpha.set(mask.data.subarray((top+yy)*w+left,(top+yy)*w+left+ww),yy*ww);
    return {x:row.bbox[0]/w,y:row.bbox[1]/h,w:row.bbox[2]/w,h:row.bbox[3]/h,
      instanceMethod:'research-v8',boundarySource:row.source,boundaryPrior:row.quality,
      originalBox:row.orig,
      weakSourceBoxes:row.weakSourceBoxes,
      circleGeometry:row.circleGeometry,
      physicalBoundary:row.c?.map(([px,py])=>[px/w,py/h])||null,
      physicalMask:{x:left,y:top,width:ww,height:hh,alpha},
      needsBoundaryReview:row.needsReview===true||!row.c,
      fillRatio:row.fill??(row.c?cv.countNonZero(mask)/Math.max(1,area(row.bbox)):1)};
  }finally{mask.delete();}
}

export function discoverResearchV8(cv,p,own){
  const w=p.width,h=p.height,src=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels)),
    gray=own(new cv.Mat()),blur=own(new cv.Mat()),gxMat=own(new cv.Mat()),gyMat=own(new cv.Mat());
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(3,3),0);
  cv.Sobel(blur,gxMat,cv.CV_32F,1,0,3);cv.Sobel(blur,gyMat,cv.CV_32F,0,1,3);
  const gx=Float32Array.from(gxMat.data32F,Math.abs),gy=Float32Array.from(gyMat.data32F,Math.abs),
    lab=labPixels(p.pixels,w,h),regions=colorRegions(cv,lab,w,h,own),edges=edgeProposals(cv,blur,w,h,own);
  const rows=candidateRows(cv,p,gray,blur,gx,gy,lab,regions,edges,own),finished=joinAdjacentFragments(cv,finishRows(cv,rows,gray,blur,w,h,own),w,h);
  // Run an edge-preserving view only for large carriers left as plain legacy
  // rectangles. It suppresses JPEG texture while keeping a rotated boundary.
  if(finished.some(row=>row.source==='old-base'&&row.seedDensity<.8&&area(row.bbox)>w*h*.05)){
    const smooth=own(new cv.Mat());cv.bilateralFilter(gray,smooth,5,25,3);
    const alternate=edgeProposals(cv,smooth,w,h,own);
    for(const row of finished){
      if(row.source!=='old-base'||row.seedDensity>=.8||area(row.bbox)<=w*h*.05)continue;
      const contour=alternate.filter(z=>iou(z.bbox,row.bbox)>.55&&z.quality>.65&&z.fill>.25&&z.solidity>.5)
        .sort((a,b)=>b.quality-a.quality)[0];
      if(contour)Object.assign(row,{bbox:contour.bbox,c:contour.c,source:'edge-preserved-envelope',quality:contour.quality});
    }
  }
  const candidates=finished.map(row=>encodeRow(cv,row,w,h));
  if(!finished.some(row=>row.quality<.4))return candidates;
  return recoverResidualCarriers(candidates,discoverResidualCarriers(cv,p,own),w,h);
}
