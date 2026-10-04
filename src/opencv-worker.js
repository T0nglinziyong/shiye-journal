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
      cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);const light=own(channels.get(0)),small=own(new cv.Mat()),background=own(new cv.Mat()),blurred=own(new cv.Mat()),field=own(new cv.Mat()),normalized=own(new cv.Mat()),equalized=own(new cv.Mat()),sharp=own(new cv.Mat());
      // Document-scanner style illumination estimation BEFORE local contrast.
      // Work only on Lab luminance; do not whiten away coloured paper or ink.
      const scale=Math.min(1,128/Math.max(p.width,p.height));cv.resize(light,small,new cv.Size(Math.max(1,Math.round(p.width*scale)),Math.max(1,Math.round(p.height*scale))),0,0,cv.INTER_AREA);
      const kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(21,21)));cv.morphologyEx(small,background,cv.MORPH_CLOSE,kernel);cv.GaussianBlur(background,blurred,new cv.Size(15,15),0);cv.resize(blurred,field,new cv.Size(p.width,p.height),0,0,cv.INTER_LINEAR);
      const samples=Array.from(blurred.data).sort((a,b)=>a-b),reference=samples[Math.floor(samples.length*.9)]||1;light.copyTo(normalized);
      for(let i=0;i<light.data.length;i++){const gain=Math.max(.9,Math.min(1.35,reference/Math.max(1,field.data[i])));normalized.data[i]=Math.min(255,Math.round(light.data[i]*gain));}
      const clahe=own(new cv.CLAHE(1.25,new cv.Size(8,8)));clahe.apply(normalized,equalized);
      // Gentle unsharp masking, never used to create foreground evidence.
      cv.GaussianBlur(equalized,blurred,new cv.Size(3,3),0);cv.addWeighted(equalized,1.12,blurred,-.12,0,sharp);channels.set(0,sharp);cv.merge(channels,balanced);cv.cvtColor(balanced,rgb,cv.COLOR_Lab2RGB);cv.cvtColor(rgb,output,cv.COLOR_RGB2RGBA);const pixels=new Uint8ClampedArray(output.data);for(let i=3;i<pixels.length;i+=4)pixels[i]=p.pixels[i];return {pixels,width:p.width,height:p.height};
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
    if(operation==='material-mask'){
      const src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC1,p.alpha)),contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());
      cv.findContours(src,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
      let largest=null,area=0;for(let i=0;i<contours.size();i++){const c=own(contours.get(i)),a=cv.contourArea(c);if(a>area){area=a;largest=c;}}
      if(!largest||area<16)return null;
      let boundary=largest,edgeMethod='slimsam-contour';const rectangle=cv.minAreaRect(largest),fill=area/Math.max(1,rectangle.size.width*rectangle.size.height);
      // Only almost-complete rectangular paper gets a straight-edge prior.
      // Never apply a convex hull to genuinely concave stickers.
      if(fill>=.96){boundary=own(cv.matFromArray(4,1,cv.CV_32SC2,cv.boxPoints(rectangle).flatMap(p=>[Math.round(p.x),Math.round(p.y)])));edgeMethod='slimsam-rectangular-prior';}
      const bounds=cv.boundingRect(boundary),x=Math.max(0,bounds.x-2),y=Math.max(0,bounds.y-2),w=Math.min(p.width,bounds.x+bounds.width+2)-x,h=Math.min(p.height,bounds.y+bounds.height+2)-y;
      const polygon=own(new cv.Mat());cv.approxPolyDP(boundary,polygon,.7,true);
      const points=Array.from({length:polygon.rows},(_,i)=>[polygon.data32S[i*2]-x,polygon.data32S[i*2+1]-y]);
      // A material is the whole printed paper, not holes in its white artwork.
      // External contour keeps real concavity; unlike a convex hull it does
      // not bridge the gap between the basketball players' legs.
      const filled=own(cv.Mat.zeros(p.height,p.width,cv.CV_8UC1)),one=own(new cv.MatVector());one.push_back(boundary);cv.drawContours(filled,one,-1,new cv.Scalar(255),cv.FILLED);
      const local=own(filled.roi(new cv.Rect(x,y,w,h))),packed=own(new cv.Mat());local.copyTo(packed);
      return {x:x/p.width,y:y/p.height,w:w/p.width,h:h/p.height,pixels:area,edgeMethod,mask:{width:w,height:h,alpha:new Uint8Array(packed.data),polygons:[points]}};
    }
    if(operation==='enclosures'){
      const src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels)),gray=own(new cv.Mat()),blurred=own(new cv.Mat()),edges=own(new cv.Mat()),closed=own(new cv.Mat()),rgb=own(new cv.Mat()),lab=own(new cv.Mat()),channels=own(new cv.MatVector()),aBlur=own(new cv.Mat()),bBlur=own(new cv.Mat()),aEdge=own(new cv.Mat()),bEdge=own(new cv.Mat());
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);cv.Canny(blurred,edges,20,65);
      // Near-white paper, pale coloured material and a grey cast shadow may
      // have similar luminance. Add Lab chroma edges so physical borders stay
      // visible even when grayscale Canny prefers the outer shadow boundary.
      cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);
      const aChannel=own(channels.get(1)),bChannel=own(channels.get(2));cv.GaussianBlur(aChannel,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(bChannel,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,aEdge,4,14);cv.Canny(bBlur,bEdge,4,14);cv.bitwise_or(edges,aEdge,edges);cv.bitwise_or(edges,bEdge,edges);
      const closeKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5))),growKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(3,3)));
      cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,closeKernel,new cv.Point(-1,-1),2);cv.dilate(closed,closed,growKernel);
      const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(closed,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
      const out=[],w=p.width,h=p.height,minArea=Math.max(24,(p.smallestMM/p.paperWidthMM*w)*(p.smallestMM/p.paperHeightMM*h)*.18);
      for(let i=0;i<contours.size();i++){
        const contour=own(contours.get(i)),area=cv.contourArea(contour);if(area<minArea||area>w*h*.55)continue;
        const b=cv.boundingRect(contour),widthMM=b.width/w*p.paperWidthMM,heightMM=b.height/h*p.paperHeightMM;
        if(widthMM<p.smallestMM||heightMM<p.smallestMM||b.width>w*.94||b.height>h*.94)continue;
        if(b.x<2||b.y<2||b.x+b.width>w-2||b.y+b.height>h-2)continue;
        const fill=area/Math.max(1,b.width*b.height);if(fill<.16)continue;
        const filled=own(cv.Mat.zeros(h,w,cv.CV_8UC1)),one=own(new cv.MatVector());one.push_back(contour);cv.drawContours(filled,one,-1,new cv.Scalar(255),cv.FILLED);
        let signal=0,inside=0;
        for(let yy=b.y;yy<b.y+b.height;yy++)for(let xx=b.x;xx<b.x+b.width;xx++){const at=yy*w+xx;if(!filled.data[at])continue;inside++;if(p.evidence?.[at])signal++;}
        if(signal<Math.max(10,inside*.003))continue;
        const ringMask=own(new cv.Mat()),ringKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(9,9)));cv.dilate(filled,ringMask,ringKernel);
        let ring=0,paperContact=0;
        for(let yy=Math.max(0,b.y-5);yy<Math.min(h,b.y+b.height+5);yy++)for(let xx=Math.max(0,b.x-5);xx<Math.min(w,b.x+b.width+5);xx++){const at=yy*w+xx;if(!ringMask.data[at]||filled.data[at])continue;ring++;if(p.backgroundConnected?.[at])paperContact++;}
        const paperContactRatio=ring?paperContact/ring:0,insideEvidenceRatio=signal/Math.max(1,inside);
        let boundaryScore=0,boundaryShadow=0,boundarySamples=0;
        for(let j=0;j<contour.rows;j++){
          const xx=contour.data32S[j*2],yy=contour.data32S[j*2+1];
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const sx=xx+dx,sy=yy+dy;if(sx<0||sx>=w||sy<0||sy>=h)continue;const at=sy*w+sx;boundaryScore+=p.score?.[at]||0;boundaryShadow+=p.shadowLikelihood?.[at]||0;boundarySamples++;}
        }
        const edgeStrength=boundarySamples?boundaryScore/boundarySamples:0,shadowFraction=boundarySamples?boundaryShadow/boundarySamples:0;
        if(shadowFraction>.58&&edgeStrength<38)continue;
        const x=Math.max(0,b.x-2),y=Math.max(0,b.y-2),rw=Math.min(w,b.x+b.width+2)-x,rh=Math.min(h,b.y+b.height+2)-y,local=own(filled.roi(new cv.Rect(x,y,rw,rh))),packed=own(new cv.Mat());local.copyTo(packed);
        const poly=own(new cv.Mat());cv.approxPolyDP(contour,poly,Math.max(.7,cv.arcLength(contour,true)*.0015),true);
        const points=Array.from({length:poly.rows},(_,j)=>[poly.data32S[j*2]-x,poly.data32S[j*2+1]-y]);
        const confidence=Math.min(1,.24+fill*.20+Math.min(signal/Math.max(inside*.02,1),1)*.18+Math.min(edgeStrength/75,1)*.28+(1-shadowFraction)*.10);
        out.push({x:x/w,y:y/h,w:rw/w,h:rh/h,pixels:inside,edgeMethod:'edge-enclosure',structuralConfidence:confidence,boundaryEdgeStrength:edgeStrength,boundaryShadowFraction:shadowFraction,paperContactRatio,insideEvidenceRatio,fillRatio:fill,mask:{width:rw,height:rh,alpha:new Uint8Array(packed.data),polygons:[points]}});
      }
      return out.sort((a,b)=>(b.structuralConfidence||0)-(a.structuralConfidence||0)||a.y-b.y||a.x-b.x).slice(0,48);
    }
    if(operation==='refine-boundaries'){
      const width=p.width,height=p.height,rgba=own(cv.matFromArray(height,width,cv.CV_8UC4,p.pixels)),result=[];
      const maskIoU=(a,b)=>{let inter=0,union=0;for(let i=0;i<a.data.length;i++){const aa=!!a.data[i],bb=!!b.data[i];if(aa&&bb)inter++;if(aa||bb)union++;}return union?inter/union:0;};
      for(const original of p.candidates||[]){
        const checkpoint=resources.length;
        try{
          const bx=Math.max(0,Math.round(original.x*width)),by=Math.max(0,Math.round(original.y*height));
          const bw=Math.max(1,Math.min(width-bx,Math.round(original.w*width))),bh=Math.max(1,Math.min(height-by,Math.round(original.h*height)));
          const pad=Math.max(5,Math.min(14,Math.round(Math.min(bw,bh)*.035))),x=Math.max(0,bx-pad),y=Math.max(0,by-pad);
          const rw=Math.min(width,bx+bw+pad)-x,rh=Math.min(height,by+bh+pad)-y;
          if(rw<8||rh<8){result.push(original);continue;}
          const imageROI=own(rgba.roi(new cv.Rect(x,y,rw,rh))),rough=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1));
          if(original.mask?.alpha?.length&&original.mask.width&&original.mask.height){
            const sourceMask=own(cv.matFromArray(original.mask.height,original.mask.width,cv.CV_8UC1,original.mask.alpha)),resized=own(new cv.Mat());
            cv.resize(sourceMask,resized,new cv.Size(bw,bh),0,0,cv.INTER_NEAREST);
            const target=own(rough.roi(new cv.Rect(bx-x,by-y,bw,bh)));resized.copyTo(target);
          }else{
            const target=own(rough.roi(new cv.Rect(bx-x,by-y,bw,bh)));target.setTo(new cv.Scalar(255));
          }
          const roughArea=cv.countNonZero(rough);if(roughArea<16){result.push(original);continue;}
          const roughMoments=cv.moments(rough,true),center=new cv.Point(
            roughMoments.m00?roughMoments.m10/roughMoments.m00:bx-x+bw/2,
            roughMoments.m00?roughMoments.m01/roughMoments.m00:by-y+bh/2
          );

          const gray=own(new cv.Mat()),blurred=own(new cv.Mat()),edges=own(new cv.Mat()),rgb=own(new cv.Mat()),lab=own(new cv.Mat()),channels=own(new cv.MatVector()),aBlur=own(new cv.Mat()),bBlur=own(new cv.Mat()),aEdge=own(new cv.Mat()),bEdge=own(new cv.Mat());
          cv.cvtColor(imageROI,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blurred,new cv.Size(3,3),0);cv.Canny(blurred,edges,15,50);
          cv.cvtColor(imageROI,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);
          const aChannel=own(channels.get(1)),bChannel=own(channels.get(2));cv.GaussianBlur(aChannel,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(bChannel,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,aEdge,3,12);cv.Canny(bBlur,bEdge,3,12);cv.bitwise_or(edges,aEdge,edges);cv.bitwise_or(edges,bEdge,edges);
          const closeKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(3,3)));cv.morphologyEx(edges,edges,cv.MORPH_CLOSE,closeKernel);
          const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_NONE);

          let best=null;
          for(let i=0;i<contours.size();i++){
            const contour=own(contours.get(i)),area=cv.contourArea(contour);if(area<roughArea*.45||area>roughArea*2.35)continue;
            const b=cv.boundingRect(contour);if(b.width<8||b.height<8||b.x<=1||b.y<=1||b.x+b.width>=rw-1||b.y+b.height>=rh-1)continue;
            if(cv.pointPolygonTest(contour,center,false)<0)continue;
            const filled=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1)),one=own(new cv.MatVector());one.push_back(contour);cv.drawContours(filled,one,-1,new cv.Scalar(255),cv.FILLED);
            const overlap=own(new cv.Mat());cv.bitwise_and(filled,rough,overlap);const shared=cv.countNonZero(overlap),containment=shared/roughArea,precision=shared/Math.max(1,area);
            if(containment<.52||precision<.30)continue;
            const ring=own(new cv.Mat()),ringKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(9,9)));cv.dilate(filled,ring,ringKernel);cv.subtract(ring,filled,ring);
            let ringCount=0,paperContact=0;
            for(let yy=0;yy<rh;yy++)for(let xx=0;xx<rw;xx++)if(ring.data[yy*rw+xx]){
              const global=(y+yy)*width+x+xx;ringCount++;if(p.backgroundConnected?.[global])paperContact++;
            }
            const paperContactRatio=ringCount?paperContact/ringCount:0;
            let boundaryStrength=0,boundaryShadow=0,boundarySamples=0;
            for(let j=0;j<contour.rows;j+=Math.max(1,Math.floor(contour.rows/512))){
              const xx=contour.data32S[j*2],yy=contour.data32S[j*2+1],global=(y+yy)*width+x+xx;
              boundaryStrength+=p.score?.[global]||0;boundaryShadow+=p.shadowLikelihood?.[global]||0;boundarySamples++;
            }
            boundaryStrength=boundarySamples?boundaryStrength/boundarySamples:0;const shadowFraction=boundarySamples?boundaryShadow/boundarySamples:0;
            if(paperContactRatio<.28&&boundaryStrength<28)continue;
            if(shadowFraction>.62&&boundaryStrength<42)continue;
            const areaSimilarity=Math.min(area/roughArea,roughArea/area),candidateScore=containment*.34+precision*.16+paperContactRatio*.24+areaSimilarity*.16+(1-shadowFraction)*.06+Math.min(boundaryStrength/80,1)*.04;
            if(!best||candidateScore>best.score)best={contour,area,score:candidateScore,paperContactRatio,boundaryStrength,shadowFraction};
          }
          if(!best||best.score<.48){result.push(original);continue;}

          const physical=best.contour,physicalMask=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1)),physicalVec=own(new cv.MatVector());physicalVec.push_back(physical);cv.drawContours(physicalMask,physicalVec,-1,new cv.Scalar(255),cv.FILLED);
          const rectangle=cv.minAreaRect(physical),rectContour=own(cv.matFromArray(4,1,cv.CV_32SC2,cv.boxPoints(rectangle).flatMap(point=>[Math.round(point.x),Math.round(point.y)]))),rectMask=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1)),rectVec=own(new cv.MatVector());rectVec.push_back(rectContour);cv.drawContours(rectMask,rectVec,-1,new cv.Scalar(255),cv.FILLED);
          const rectIoU=maskIoU(physicalMask,rectMask),coarse=own(new cv.Mat());cv.approxPolyDP(physical,coarse,Math.max(1,cv.arcLength(physical,true)*.015),true);
          let finalMask=physicalMask,edgeMethod='local-contour',shapeIoU=1;
          if(physical.rows>=5&&typeof cv.fitEllipse==='function'){
            const ellipse=cv.fitEllipse(physical),ellipseMask=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1));
            cv.ellipse(ellipseMask,new cv.Point(Math.round(ellipse.center.x),Math.round(ellipse.center.y)),new cv.Size(Math.max(1,Math.round(ellipse.size.width/2)),Math.max(1,Math.round(ellipse.size.height/2))),ellipse.angle,0,360,new cv.Scalar(255),cv.FILLED);
            const ellipseIoU=maskIoU(physicalMask,ellipseMask);
            if(ellipseIoU>=.91&&ellipseIoU>=rectIoU+.06){finalMask=ellipseMask;edgeMethod='local-ellipse';shapeIoU=ellipseIoU;}
            else if(rectIoU>=.82&&coarse.rows<=8){finalMask=rectMask;edgeMethod='local-rectangle';shapeIoU=rectIoU;}
          }else if(rectIoU>=.82&&coarse.rows<=8){finalMask=rectMask;edgeMethod='local-rectangle';shapeIoU=rectIoU;}

          const finalContours=own(new cv.MatVector()),finalHierarchy=own(new cv.Mat());cv.findContours(finalMask,finalContours,finalHierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
          let finalBoundary=null,finalArea=0;for(let i=0;i<finalContours.size();i++){const c=own(finalContours.get(i)),a=cv.contourArea(c);if(a>finalArea){finalArea=a;finalBoundary=c;}}
          if(!finalBoundary||finalArea<16){result.push(original);continue;}
          const bounds=cv.boundingRect(finalBoundary),fx=x+bounds.x,fy=y+bounds.y,fw=bounds.width,fh=bounds.height,local=own(finalMask.roi(new cv.Rect(bounds.x,bounds.y,fw,fh))),packed=own(new cv.Mat());local.copyTo(packed);
          const poly=own(new cv.Mat());cv.approxPolyDP(finalBoundary,poly,Math.max(.7,cv.arcLength(finalBoundary,true)*.0015),true);
          const points=Array.from({length:poly.rows},(_,j)=>[poly.data32S[j*2]-bounds.x,poly.data32S[j*2+1]-bounds.y]);
          result.push({...original,x:fx/width,y:fy/height,w:fw/width,h:fh/height,pixels:finalArea,edgeMethod,boundaryRefined:true,boundaryConfidence:best.score,boundaryPaperContact:best.paperContactRatio,boundaryShadowFraction:best.shadowFraction,shapeIoU,mask:{width:fw,height:fh,alpha:new Uint8Array(packed.data),polygons:[points]}});
        }finally{while(resources.length>checkpoint)resources.pop().delete();}
      }
      return result;
    }
    if(operation==='instances'){
      const w=p.width,h=p.height,src=own(cv.matFromArray(h,w,cv.CV_8UC1,p.mask)),closed=own(new cv.Mat()),kernel=own(cv.getStructuringElement(cv.MORPH_CROSS,new cv.Size(3,3)));
      cv.morphologyEx(src,closed,cv.MORPH_CLOSE,kernel);
      const labels=own(new cv.Mat()),stats=own(new cv.Mat()),centroids=own(new cv.Mat()),componentCount=cv.connectedComponentsWithStats(closed,labels,stats,centroids,8,cv.CV_32S);
      const dist=own(new cv.Mat());cv.distanceTransform(closed,dist,cv.DIST_L2,5);
      const peaks=own(cv.Mat.zeros(h,w,cv.CV_8UC1));
      for(let label=1;label<componentCount;label++){
        const [left,top,bw,bh,area]=Array.from(stats.data32S.slice(label*5,label*5+5));if(area<20)continue;
        let maximum=0;
        for(let yy=top;yy<top+bh;yy++)for(let xx=left;xx<left+bw;xx++){const at=yy*w+xx;if(labels.data32S[at]===label)maximum=Math.max(maximum,dist.data32F[at]);}
        if(maximum<=0)continue;const threshold=maximum*.28;
        for(let yy=top;yy<top+bh;yy++)for(let xx=left;xx<left+bw;xx++){const at=yy*w+xx;if(labels.data32S[at]===label&&dist.data32F[at]>threshold)peaks.data[at]=255;}
      }
      const openKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(3,3)));cv.morphologyEx(peaks,peaks,cv.MORPH_OPEN,openKernel);
      const peakLabels=own(new cv.Mat()),peakStats=own(new cv.Mat()),peakCentroids=own(new cv.Mat()),peakCount=cv.connectedComponentsWithStats(peaks,peakLabels,peakStats,peakCentroids,8,cv.CV_32S);
      const markers=own(cv.Mat.zeros(h,w,cv.CV_32SC1)),backgroundLabel=peakCount;
      for(let i=0;i<w*h;i++)markers.data32S[i]=closed.data[i]?peakLabels.data32S[i]:backgroundLabel;
      const rgba=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels)),rgb=own(new cv.Mat());cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.watershed(rgb,markers);
      const result=[],minArea=Math.max(20,(p.smallestMM/p.paperWidthMM*w)*(p.smallestMM/p.paperHeightMM*h)*.12);
      for(let label=1;label<backgroundLabel;label++){
        let left=w,top=h,right=-1,bottom=-1,area=0,signal=0;
        for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const at=yy*w+xx;if(markers.data32S[at]!==label)continue;area++;if(p.evidence?.[at])signal++;left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);}
        if(area<minArea||right<left||bottom<top||signal/Math.max(1,area)<.03)continue;
        const bw=right-left+1,bh=bottom-top+1;if(bw/w*p.paperWidthMM<p.smallestMM||bh/h*p.paperHeightMM<p.smallestMM||bw>w*.94||bh>h*.94)continue;
        const pad=8,x=Math.max(0,left-pad),y=Math.max(0,top-pad),rw=Math.min(w,right+1+pad)-x,rh=Math.min(h,bottom+1+pad)-y;
        const checkpoint=resources.length,imageROI=own(rgba.roi(new cv.Rect(x,y,rw,rh))),rgbROI=own(new cv.Mat()),gc=own(new cv.Mat(rh,rw,cv.CV_8UC1,new cv.Scalar(cv.GC_PR_BGD)));
        cv.cvtColor(imageROI,rgbROI,cv.COLOR_RGBA2RGB);let foreground=0,background=0;
        for(let py=0;py<rh;py++)for(let px=0;px<rw;px++){
          const global=(y+py)*w+x+px,local=py*rw+px;
          if(markers.data32S[global]===label)gc.data[local]=cv.GC_PR_FGD;
          if(p.shadowLikelihood?.[global])gc.data[local]=cv.GC_PR_BGD;
          if(p.evidence?.[global]){gc.data[local]=cv.GC_FGD;foreground++;}
          if(px<3||py<3||px>=rw-3||py>=rh-3){gc.data[local]=cv.GC_BGD;background++;}
        }
        const alpha=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1)),contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());
        if(foreground>=10&&background>=10){
          const bgModel=own(new cv.Mat()),fgModel=own(new cv.Mat());cv.grabCut(rgbROI,gc,new cv.Rect(),bgModel,fgModel,3,cv.GC_INIT_WITH_MASK);
          for(let i=0;i<gc.data.length;i++)alpha.data[i]=(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)?255:0;
        }else for(let py=0;py<rh;py++)for(let px=0;px<rw;px++)if(markers.data32S[(y+py)*w+x+px]===label)alpha.data[py*rw+px]=255;
        cv.findContours(alpha,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
        let largest=null,largestArea=0;for(let j=0;j<contours.size();j++){const c=contours.get(j),a=cv.contourArea(c);if(a>largestArea){largest?.delete?.();largest=c;largestArea=a;}else c.delete();}
        if(!largest||largestArea<minArea){largest?.delete?.();while(resources.length>checkpoint)resources.pop().delete();continue;}
        alpha.setTo(new cv.Scalar(0));const one=own(new cv.MatVector());one.push_back(largest);cv.drawContours(alpha,one,-1,new cv.Scalar(255),cv.FILLED);
        let boundary=largest,edgeMethod='watershed-grabcut';const rectangle=cv.minAreaRect(largest),rectArea=Math.max(1,rectangle.size.width*rectangle.size.height),rectFill=largestArea/rectArea;
        if(rectFill>=.90){const box=cv.boxPoints(rectangle),rectContour=own(cv.matFromArray(4,1,cv.CV_32SC2,box.flatMap(point=>[Math.round(point.x),Math.round(point.y)])));alpha.setTo(new cv.Scalar(0));const rects=own(new cv.MatVector());rects.push_back(rectContour);cv.drawContours(alpha,rects,-1,new cv.Scalar(255),cv.FILLED);boundary=rectContour;edgeMethod='watershed-rectangular';}
        const bounds=cv.boundingRect(boundary),fx=x+bounds.x,fy=y+bounds.y,fw=bounds.width,fh=bounds.height,localAlpha=own(alpha.roi(new cv.Rect(bounds.x,bounds.y,fw,fh))),packed=own(new cv.Mat());localAlpha.copyTo(packed);
        const poly=own(new cv.Mat());cv.approxPolyDP(boundary,poly,Math.max(.7,cv.arcLength(boundary,true)*.0015),true);const points=Array.from({length:poly.rows},(_,j)=>[poly.data32S[j*2]-bounds.x,poly.data32S[j*2+1]-bounds.y]);
        result.push({x:fx/w,y:fy/h,w:fw/w,h:fh/h,pixels:largestArea,evidenceDensity:signal/Math.max(1,area),edgeMethod,mask:{width:fw,height:fh,alpha:new Uint8Array(packed.data),polygons:[points]}});
        largest.delete();while(resources.length>checkpoint)resources.pop().delete();
      }
      return result.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
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
if(typeof self!=='undefined')self.onmessage=async({data})=>{try{const result=await processVision((await ready).cv,data.operation,data.parameters);self.postMessage({id:data.id,result},ArrayBuffer.isView(result?.pixels)?[result.pixels.buffer]:[]);}catch(e){self.postMessage({id:data.id,error:'本机图像处理失败：'+e.message});}};
