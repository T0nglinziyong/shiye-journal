import cvModule from '@techstark/opencv-js';
// OpenCV may expose a thenable module. Keep it inside an object rather than
// resolving a Promise with the module itself (which can recurse indefinitely).
const ready=(async()=>{let cv;if(cvModule instanceof Promise)cv=await cvModule;else{cv=cvModule;if(!cv.Mat)await new Promise(resolve=>{cv.onRuntimeInitialized=resolve;});}return {cv};})();
export async function processVision(cv,operation,p){
  const resources=[],own=mat=>(resources.push(mat),mat);
  try{
    if(operation==='warmup')return {ready:true};
    if(operation==='balance'){
      const src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels)),rgb=own(new cv.Mat()),lab=own(new cv.Mat()),channels=own(new cv.MatVector()),balanced=own(new cv.Mat()),output=own(new cv.Mat());
      cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);const light=own(channels.get(0)),equalized=own(new cv.Mat()),clahe=own(new cv.CLAHE(2,new cv.Size(8,8)));clahe.apply(light,equalized);channels.set(0,equalized);cv.merge(channels,balanced);cv.cvtColor(balanced,rgb,cv.COLOR_Lab2RGB);cv.cvtColor(rgb,output,cv.COLOR_RGB2RGBA);const pixels=new Uint8ClampedArray(output.data);for(let i=3;i<pixels.length;i+=4)pixels[i]=p.pixels[i];return {pixels,width:p.width,height:p.height};
    }
    if(operation==='quad'){
      const src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels)),gray=own(new cv.Mat()),binary=own(new cv.Mat());cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);let best=null;
      for(const threshold of [150,165,180,195,210,'otsu','edges','edges-low','lab-125','lab-130']){
        const edges=threshold==='edges'||threshold==='edges-low';
        if(edges){const blurred=own(new cv.Mat()),kernel=own(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5)));cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);cv.Canny(blurred,binary,threshold==='edges-low'?15:40,threshold==='edges-low'?45:120);cv.morphologyEx(binary,binary,cv.MORPH_CLOSE,kernel);}
        else if(String(threshold).startsWith('lab-')){const rgb=own(new cv.Mat()),lab=own(new cv.Mat()),channels=own(new cv.MatVector());cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);const blueYellow=own(channels.get(2));cv.threshold(blueYellow,binary,Number(threshold.slice(4)),255,cv.THRESH_BINARY_INV);}
        else cv.threshold(gray,binary,threshold==='otsu'?0:threshold,255,cv.THRESH_BINARY|(threshold==='otsu'?cv.THRESH_OTSU:0));const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(binary,contours,hierarchy,edges?cv.RETR_LIST:cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
        for(let i=0;i<contours.size();i++){
          const contour=own(contours.get(i)),area=cv.contourArea(contour)/(p.width*p.height);if(area<.14)continue;const polygon=own(new cv.Mat());cv.approxPolyDP(contour,polygon,cv.arcLength(contour,true)*.02,true);if(polygon.rows!==4||!cv.isContourConvex(polygon))continue;
          let points=Array.from({length:4},(_,j)=>({x:polygon.data32S[j*2]/p.width,y:polygon.data32S[j*2+1]/p.height}));const center={x:points.reduce((s,c)=>s+c.x,0)/4,y:points.reduce((s,c)=>s+c.y,0)/4};points.sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));const start=points.reduce((best,c,j)=>c.x+c.y<points[best].x+points[best].y?j:best,0);points=points.slice(start).concat(points.slice(0,start));
          const coverage=Math.abs(cv.contourArea(polygon))/(p.width*p.height);if(coverage<.18||coverage>.96||points.some(a=>a.x<.004||a.x>.996||a.y<.004||a.y>.996))continue;
          const length=(a,b)=>Math.hypot((a.x-b.x)*p.width,(a.y-b.y)*p.height),w=length(points[0],points[1])+length(points[2],points[3]),h=length(points[0],points[3])+length(points[1],points[2]),ratio=Math.min(w/h,h/w),expected=Math.min(p.paperRatio,1/p.paperRatio),aspect=Math.min(ratio/expected,expected/ratio);if(aspect<.60)continue;const score=Math.min(coverage/.65,1)*.48+aspect*.20+Math.min(area/coverage,1)*.32;if(!best||score>best.score)best={score,corners:points};
        }
      }return best?.corners||null;
    }
    if(operation==='alignment'){
      const src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC1,p.alpha)),binary=own(new cv.Mat()),contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());
      cv.threshold(src,binary,127,255,cv.THRESH_BINARY);cv.findContours(binary,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
      let largest=null,area=0;
      for(let i=0;i<contours.size();i++){const c=own(contours.get(i)),a=cv.contourArea(c);if(a>area){area=a;largest=c;}}
      if(!largest||area<16)return {degrees:0};
      const r=cv.minAreaRect(largest),fillRatio=area/(r.size.width*r.size.height),elongation=Math.max(r.size.width,r.size.height)/Math.min(r.size.width,r.size.height);
      let degrees=-r.angle;while(degrees>45)degrees-=90;while(degrees<-45)degrees+=90;
      return {degrees:Math.abs(degrees)>=1.5&&elongation>=1.18&&fillRatio>=.78?degrees:0,fillRatio,elongation};
    }
    if(operation==='components'){
      const src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC1,p.mask)),closed=own(new cv.Mat()),kernel=own(cv.getStructuringElement(cv.MORPH_CROSS,new cv.Size(3,3))),labels=own(new cv.Mat()),stats=own(new cv.Mat()),centroids=own(new cv.Mat());cv.morphologyEx(src,closed,cv.MORPH_CLOSE,kernel);const count=cv.connectedComponentsWithStats(closed,labels,stats,centroids,4,cv.CV_32S),result=[],w=p.width,h=p.height,minArea=Math.max(20,(p.smallestMM/p.paperWidthMM*w)*(p.smallestMM/p.paperHeightMM*h)*.12);
      for(let label=1;label<count;label++){
        const [left,top,bw,bh,area]=Array.from(stats.data32S.slice(label*5,label*5+5));if(area<minArea||bw/w*p.paperWidthMM<p.smallestMM||bh/h*p.paperHeightMM<p.smallestMM||bw>w*.94||bh>h*.94)continue;if((left<2||left+bw>w-2||top<2||top+bh>h-2)&&(bw<w*.055||bh<h*.055))continue;
        if(p.evidence){let signal=0;for(let y=top;y<top+bh;y++)for(let x=left;x<left+bw;x++){const i=y*w+x;if(labels.data32S[i]===label&&p.evidence[i])signal++;}if(signal<Math.max(10,area*.04))continue;}
        const touchesBorder=left<3||top<3||left+bw>w-3||top+bh>h-3;
        if(touchesBorder&&Math.max(bw/bh,bh/bw)>8&&(bw<w*.08||bh<h*.08))continue;
        if(touchesBorder&&area/(bw*bh)<.65&&(bw>w*.5||bh>h*.5))continue;
        const x=Math.max(0,left-3),y=Math.max(0,top-3),rw=Math.min(w,left+bw+3)-x,rh=Math.min(h,top+bh+3)-y,roi=own(labels.roi(new cv.Rect(x,y,rw,rh))),lo=own(new cv.Mat(rh,rw,cv.CV_32SC1,new cv.Scalar(label))),hi=own(new cv.Mat(rh,rw,cv.CV_32SC1,new cv.Scalar(label))),local=own(new cv.Mat()),alpha=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1)),contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.inRange(roi,lo,hi,local);cv.findContours(local,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);cv.drawContours(alpha,contours,-1,new cv.Scalar(255),cv.FILLED);
        // Approximate at sub-pixel scale, not with an aggressive convex hull:
        // preserve concave stickers while removing staircase noise. Very
        // rectangular paper gets a stricter four-edge prior only when the
        // polygon matches >98% of the contour area and all corners are square.
        const polygons=[];let edgeMethod='contour-smoothed';
        for(let j=0;j<contours.size();j++){
          const contour=own(contours.get(j));if(cv.contourArea(contour)<4)continue;
          const polygon=own(new cv.Mat()),rect=own(new cv.Mat());
          cv.approxPolyDP(contour,polygon,.7,true);cv.approxPolyDP(contour,rect,Math.min(2,cv.arcLength(contour,true)*.008),true);
          const points=m=>Array.from({length:m.rows},(_,k)=>[m.data32S[k*2],m.data32S[k*2+1]]),q=points(rect);
          const rightAngles=q.length===4&&q.every((b,k)=>{const a=q[(k+3)%4],c=q[(k+1)%4],u=[a[0]-b[0],a[1]-b[1]],v=[c[0]-b[0],c[1]-b[1]];return Math.abs(u[0]*v[0]+u[1]*v[1])/Math.max(1,Math.hypot(...u)*Math.hypot(...v))<.12;});
          const ratio=cv.contourArea(contour)/Math.max(1,cv.contourArea(rect));
          if(rightAngles&&cv.isContourConvex(rect)&&ratio>.98&&ratio<1.02){polygons.push(q);edgeMethod='rectangular-prior';}else polygons.push(points(polygon));
        }
        result.push({x:x/w,y:y/h,w:rw/w,h:rh/h,pixels:area,edgeMethod,mask:{width:rw,height:rh,alpha:new Uint8Array(alpha.data),polygons}});
      }
      return result.filter((a,i)=>!result.some((b,j)=>i!==j&&a.x>=b.x&&a.y>=b.y&&a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h)).sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
    }
    if(operation==='warp'){
      const src=own(cv.matFromArray(p.sourceHeight,p.sourceWidth,cv.CV_8UC4,p.pixels)),dst=own(new cv.Mat());
      const from=own(cv.matFromArray(4,1,cv.CV_32FC2,p.corners.flatMap(c=>[c.x*p.sourceWidth,c.y*p.sourceHeight])));
      const to=own(cv.matFromArray(4,1,cv.CV_32FC2,[0,0,p.width,0,p.width,p.height,0,p.height]));
      const transform=own(cv.getPerspectiveTransform(from,to));
      cv.warpPerspective(src,dst,transform,new cv.Size(p.width,p.height),cv.INTER_LINEAR,cv.BORDER_REPLICATE);
      return {pixels:new Uint8ClampedArray(dst.data),width:p.width,height:p.height};
    }
    throw Error('未知图像操作');
  }finally{for(const resource of resources.reverse())resource.delete();}
}
if(typeof self!=='undefined')self.onmessage=async({data})=>{try{const result=await processVision((await ready).cv,data.operation,data.parameters);self.postMessage({id:data.id,result},result?.pixels?[result.pixels.buffer]:[]);}catch(e){self.postMessage({id:data.id,error:'本机图像处理失败：'+e.message});}};
