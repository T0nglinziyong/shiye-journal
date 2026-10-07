import {morphGAC,morphACWE} from './browser-active-contours.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function chooseClassicalSegmenter(box,foregroundSolidity=1){
  if(box?.boxAdjustment==='pale-carrier-margin'){
    return foregroundSolidity<.8?'morphacwe':'morphgac';
  }
  return 'grabcut';
}

function largestExternal(cv,mask){
  const contours=new cv.MatVector(),hierarchy=new cv.Mat();
  cv.findContours(mask,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,area=0;
  for(let i=0;i<contours.size();i++){
    const c=contours.get(i),a=Math.abs(cv.contourArea(c));
    if(a>area){best?.delete?.();best=c;area=a;}else c.delete();
  }
  contours.delete();hierarchy.delete();
  return {contour:best,area};
}

function filledLargest(cv,mask){
  const {contour}=largestExternal(cv,mask),out=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1);
  if(contour){
    const v=new cv.MatVector();v.push_back(contour);
    cv.drawContours(out,v,-1,new cv.Scalar(255),cv.FILLED);
    v.delete();contour.delete();
  }
  return out;
}

function encodeRegion(cv,mask,x0,y0,pageW,pageH,box,method,extra={}){
  const {contour}=largestExternal(cv,mask);
  if(!contour)return {...box,...extra,segmentationMethod:method,segmentationFailed:true};
  const b=cv.boundingRect(contour),filled=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1),v=new cv.MatVector();
  v.push_back(contour);cv.drawContours(filled,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();
  const local=filled.roi(new cv.Rect(b.x,b.y,b.width,b.height)),packed=new cv.Mat();local.copyTo(packed);
  const poly=new cv.Mat();cv.approxPolyDP(contour,poly,Math.max(.7,cv.arcLength(contour,true)*.0015),true);
  const points=Array.from({length:poly.rows},(_,i)=>[poly.data32S[i*2]-b.x,poly.data32S[i*2+1]-b.y]);
  const result={
    ...box,...extra,
    x:(x0+b.x)/pageW,y:(y0+b.y)/pageH,w:b.width/pageW,h:b.height/pageH,
    pixels:cv.countNonZero(filled),
    edgeMethod:method,segmentationMethod:method,segmentationFailed:false,
    mask:{width:b.width,height:b.height,alpha:new Uint8Array(packed.data),polygons:[points],topologyPreserved:false}
  };
  poly.delete();packed.delete();local.delete();filled.delete();contour.delete();
  return result;
}

function foregroundSolidity(cv,p,box){
  const w=p.width,h=p.height,x0=clamp(Math.round(box.x*w),0,w-1),y0=clamp(Math.round(box.y*h),0,h-1),
    x1=clamp(Math.round((box.x+box.w)*w),x0+1,w),y1=clamp(Math.round((box.y+box.h)*h),y0+1,h),
    rw=x1-x0,rh=y1-y0,m=cv.Mat.zeros(rh,rw,cv.CV_8UC1),foreground=p.foregroundMask;
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)if(foreground?.[(y0+y)*w+x0+x])m.data[y*rw+x]=255;
  const {contour,area}=largestExternal(cv,m);m.delete();
  if(!contour)return 1;
  const hull=new cv.Mat();cv.convexHull(contour,hull,false,true);
  const solidity=area/Math.max(1,Math.abs(cv.contourArea(hull)));
  hull.delete();contour.delete();return solidity;
}

function roiGeometry(p,box,extraMM){
  const pageW=p.width,pageH=p.height,paperWidthMM=p.paperWidthMM||210,paperHeightMM=p.paperHeightMM||297,
    pxPerMM=Math.max(.5,((pageW/paperWidthMM)+(pageH/paperHeightMM))/2),
    extra=pxPerMM*extraMM,
    bx0=Math.max(0,box.x*pageW-extra),by0=Math.max(0,box.y*pageH-extra),
    bx1=Math.min(pageW,(box.x+box.w)*pageW+extra),by1=Math.min(pageH,(box.y+box.h)*pageH+extra),
    bw=bx1-bx0,bh=by1-by0,pad=Math.max(5,Math.round(Math.max(bw,bh)*.12)),
    x0=Math.max(0,Math.floor(bx0)-pad),y0=Math.max(0,Math.floor(by0)-pad),
    x1=Math.min(pageW,Math.ceil(bx1)+pad),y1=Math.min(pageH,Math.ceil(by1)+pad);
  return {pxPerMM,bx0,by0,bx1,by1,x0,y0,x1,y1,rw:x1-x0,rh:y1-y0};
}

function boxMask(cv,g){
  const out=cv.Mat.zeros(g.rh,g.rw,cv.CV_8UC1),
    rx=clamp(Math.round(g.bx0)-g.x0,0,g.rw-1),ry=clamp(Math.round(g.by0)-g.y0,0,g.rh-1),
    rr=clamp(Math.round(g.bx1)-g.x0,rx+1,g.rw),rb=clamp(Math.round(g.by1)-g.y0,ry+1,g.rh);
  out.roi(new cv.Rect(rx,ry,Math.max(1,rr-rx),Math.max(1,rb-ry))).setTo(new cv.Scalar(255));
  return out;
}

function inverseGradientGImage(cv,rgba){
  const gray=new cv.Mat(),f=new cv.Mat(),blur=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat();
  cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);gray.convertTo(f,cv.CV_32F,1/255);
  cv.GaussianBlur(f,blur,new cv.Size(0,0),1.5,1.5,cv.BORDER_REPLICATE);
  cv.Sobel(blur,gx,cv.CV_32F,1,0,3,.125,0,cv.BORDER_REPLICATE);
  cv.Sobel(blur,gy,cv.CV_32F,0,1,3,.125,0,cv.BORDER_REPLICATE);
  const g=new Float32Array(gray.rows*gray.cols);
  for(let i=0;i<g.length;i++){const mag=Math.hypot(gx.data32F[i],gy.data32F[i]);g[i]=1/Math.sqrt(1+100*mag);}
  gray.delete();f.delete();blur.delete();gx.delete();gy.delete();return g;
}

function segmentMorphGAC(cv,p,box,solidity){
  const g=roiGeometry(p,box,1),src=cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels),
    roi=src.roi(new cv.Rect(g.x0,g.y0,g.rw,g.rh)),rough=boxMask(cv,g),
    scale=Math.min(1,180/Math.max(g.rw,g.rh)),qw=Math.max(1,Math.round(g.rw*scale)),qh=Math.max(1,Math.round(g.rh*scale)),
    image=new cv.Mat(),seed=new cv.Mat();
  cv.resize(roi,image,new cv.Size(qw,qh),0,0,cv.INTER_AREA);cv.resize(rough,seed,new cv.Size(qw,qh),0,0,cv.INTER_NEAREST);
  const ksize=Math.max(3,(Math.round(Math.min(qw,qh)*.025)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ksize,ksize)),expanded=new cv.Mat();
  cv.dilate(seed,expanded,kernel);
  const init=new Uint8Array(expanded.data.length);for(let i=0;i<init.length;i++)init[i]=expanded.data[i]?1:0;
  const iterations=(box.seedDensity??0)>.8&&(box.fillRatio??0)<.8?65:40,
    u=morphGAC(inverseGradientGImage(cv,image),qw,qh,init,{numIter:iterations,smoothing:1,threshold:'auto',balloon:-1}),
    small=cv.Mat.zeros(qh,qw,cv.CV_8UC1);
  for(let i=0;i<u.length;i++)if(u[i])small.data[i]=255;
  const up=new cv.Mat(),binary=new cv.Mat();cv.resize(small,up,new cv.Size(g.rw,g.rh),0,0,cv.INTER_LINEAR);cv.threshold(up,binary,127,255,cv.THRESH_BINARY);
  const result=encodeRegion(cv,binary,g.x0,g.y0,p.width,p.height,box,'morphgac',{foregroundSolidity:solidity,segmentationIterations:iterations});
  binary.delete();up.delete();small.delete();expanded.delete();kernel.delete();seed.delete();image.delete();rough.delete();roi.delete();src.delete();
  return result;
}

function segmentMorphACWE(cv,p,box,solidity){
  const g=roiGeometry(p,box,1),src=cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels),
    roi=src.roi(new cv.Rect(g.x0,g.y0,g.rw,g.rh)),rough=boxMask(cv,g),
    scale=Math.min(1,180/Math.max(g.rw,g.rh)),qw=Math.max(1,Math.round(g.rw*scale)),qh=Math.max(1,Math.round(g.rh*scale)),
    image=new cv.Mat(),seed=new cv.Mat(),gray=new cv.Mat(),f=new cv.Mat();
  cv.resize(roi,image,new cv.Size(qw,qh),0,0,cv.INTER_AREA);cv.resize(rough,seed,new cv.Size(qw,qh),0,0,cv.INTER_NEAREST);
  cv.cvtColor(image,gray,cv.COLOR_RGBA2GRAY);gray.convertTo(f,cv.CV_32F,1/255);
  const init=new Uint8Array(seed.data.length);for(let i=0;i<init.length;i++)init[i]=seed.data[i]?1:0;
  const iterations=80,u=morphACWE(new Float32Array(f.data32F),qw,qh,init,{numIter:iterations,smoothing:1,lambda1:1,lambda2:1}),
    small=cv.Mat.zeros(qh,qw,cv.CV_8UC1);
  for(let i=0;i<u.length;i++)if(u[i])small.data[i]=255;
  const up=new cv.Mat(),binary=new cv.Mat();cv.resize(small,up,new cv.Size(g.rw,g.rh),0,0,cv.INTER_LINEAR);cv.threshold(up,binary,127,255,cv.THRESH_BINARY);
  const result=encodeRegion(cv,binary,g.x0,g.y0,p.width,p.height,box,'morphacwe',{foregroundSolidity:solidity,segmentationIterations:iterations});
  binary.delete();up.delete();small.delete();f.delete();gray.delete();seed.delete();image.delete();rough.delete();roi.delete();src.delete();
  return result;
}

function segmentGrabCut(cv,p,box,solidity){
  const pageW=p.width,pageH=p.height,paperWidthMM=p.paperWidthMM||210,paperHeightMM=p.paperHeightMM||297,
    pxPerMM=Math.max(.5,((pageW/paperWidthMM)+(pageH/paperHeightMM))/2),margin=4*pxPerMM,
    bx0=box.x*pageW,by0=box.y*pageH,bx1=(box.x+box.w)*pageW,by1=(box.y+box.h)*pageH,
    x0=Math.max(0,Math.floor(bx0-margin)),y0=Math.max(0,Math.floor(by0-margin)),
    x1=Math.min(pageW,Math.ceil(bx1+margin)),y1=Math.min(pageH,Math.ceil(by1+margin)),rw=x1-x0,rh=y1-y0,
    src=cv.matFromArray(pageH,pageW,cv.CV_8UC4,p.pixels),roi=src.roi(new cv.Rect(x0,y0,rw,rh)),rgb=new cv.Mat(),
    gc=new cv.Mat(rh,rw,cv.CV_8UC1,new cv.Scalar(cv.GC_BGD)),bg=new cv.Mat(),fg=new cv.Mat();
  cv.cvtColor(roi,rgb,cv.COLOR_RGBA2RGB);
  const ix0=clamp(Math.round(bx0)-x0,1,rw-1),iy0=clamp(Math.round(by0)-y0,1,rh-1),
    ix1=clamp(Math.round(bx1)-x0,ix0+1,rw-1),iy1=clamp(Math.round(by1)-y0,iy0+1,rh-1);
  for(let y=iy0;y<iy1;y++)for(let x=ix0;x<ix1;x++)gc.data[y*rw+x]=cv.GC_PR_FGD;
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
    const gx=x0+x,gy=y0+y,global=gy*pageW+gx,local=y*rw+x,inside=gx>=bx0&&gx<bx1&&gy>=by0&&gy<by1;
    if(inside&&p.evidence?.[global])gc.data[local]=cv.GC_PR_FGD;
    if(inside&&p.foregroundSeeds?.[global])gc.data[local]=cv.GC_FGD;
    if(p.shadowLikelihood?.[global]&&!p.foregroundSeeds?.[global])gc.data[local]=cv.GC_PR_BGD;
  }
  for(let x=0;x<rw;x++){gc.data[x]=cv.GC_BGD;gc.data[(rh-1)*rw+x]=cv.GC_BGD;}
  for(let y=0;y<rh;y++){gc.data[y*rw]=cv.GC_BGD;gc.data[y*rw+rw-1]=cv.GC_BGD;}
  let result={...box,foregroundSolidity:solidity,segmentationMethod:'grabcut',segmentationFailed:true};
  try{
    cv.grabCut(rgb,gc,new cv.Rect(),bg,fg,3,cv.GC_INIT_WITH_MASK);
    const binary=cv.Mat.zeros(rh,rw,cv.CV_8UC1);
    for(let i=0;i<gc.data.length;i++)if(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)binary.data[i]=255;
    const main=filledLargest(cv,binary);
    result=encodeRegion(cv,main,x0,y0,pageW,pageH,box,'grabcut',{foregroundSolidity:solidity,segmentationIterations:3});
    main.delete();binary.delete();
  }catch{}
  fg.delete();bg.delete();gc.delete();rgb.delete();roi.delete();src.delete();
  return result;
}

export function segmentMaterialBoxes(cv,p){
  const out=[];
  for(const box of p.boxes||[]){
    const solidity=foregroundSolidity(cv,p,box),method=chooseClassicalSegmenter(box,solidity);
    if(method==='morphacwe')out.push(segmentMorphACWE(cv,p,box,solidity));
    else if(method==='morphgac')out.push(segmentMorphGAC(cv,p,box,solidity));
    else out.push(segmentGrabCut(cv,p,box,solidity));
  }
  return out;
}
