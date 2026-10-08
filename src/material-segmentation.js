import {morphGAC} from './browser-active-contours.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/**
 * The validated default material segmenter.
 *
 * Whole-page box discovery owns identity/count. Every discovered box is then
 * segmented independently by the validated outside-in MorphGAC rule.
 * GrabCut and MorphGAC+GrabCut remain explicit alternatives, but auto never
 * switches away from the validated MorphGAC defaults.
 */
export function chooseClassicalSegmenter(){return 'morphgac';}

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

function encodeRegion(cv,mask,x0,y0,pageW,pageH,box,extra={}){
  const {contour}=largestExternal(cv,mask);
  if(!contour)return {...box,...extra,segmentationMethod:'morphgac',segmentationFailed:true};
  const b=cv.boundingRect(contour),filled=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1),v=new cv.MatVector();
  v.push_back(contour);cv.drawContours(filled,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();
  const local=filled.roi(new cv.Rect(b.x,b.y,b.width,b.height)),packed=new cv.Mat();local.copyTo(packed);
  const poly=new cv.Mat();cv.approxPolyDP(contour,poly,Math.max(.7,cv.arcLength(contour,true)*.0015),true);
  const points=Array.from({length:poly.rows},(_,i)=>[poly.data32S[i*2]-b.x,poly.data32S[i*2+1]-b.y]);
  const result={
    ...box,...extra,
    x:(x0+b.x)/pageW,y:(y0+b.y)/pageH,w:b.width/pageW,h:b.height/pageH,
    pixels:cv.countNonZero(filled),
    edgeMethod:'morphgac',segmentationMethod:'morphgac',segmentationFailed:false,
    mask:{width:b.width,height:b.height,alpha:new Uint8Array(packed.data),polygons:[points],topologyPreserved:false}
  };
  poly.delete();packed.delete();local.delete();filled.delete();contour.delete();
  return result;
}

function roiGeometry(p,box,extraMM=1){
  const pageW=p.width,pageH=p.height,paperWidthMM=p.paperWidthMM||210,paperHeightMM=p.paperHeightMM||297,
    pxPerMM=Math.max(.5,((pageW/paperWidthMM)+(pageH/paperHeightMM))/2),
    extra=pxPerMM*extraMM,
    bx0=Math.max(0,box.x*pageW-extra),by0=Math.max(0,box.y*pageH-extra),
    bx1=Math.min(pageW,(box.x+box.w)*pageW+extra),by1=Math.min(pageH,(box.y+box.h)*pageH+extra),
    bw=bx1-bx0,bh=by1-by0,
    // ROI padding is only workspace. The level-set initializer itself remains
    // exactly the auto box + 1 mm physical safety band.
    pad=Math.max(5,Math.round(Math.max(bw,bh)*.12)),
    x0=Math.max(0,Math.floor(bx0)-pad),y0=Math.max(0,Math.floor(by0)-pad),
    x1=Math.min(pageW,Math.ceil(bx1)+pad),y1=Math.min(pageH,Math.ceil(by1)+pad);
  return {pxPerMM,bx0,by0,bx1,by1,x0,y0,x1,y1,rw:x1-x0,rh:y1-y0};
}

function boxMask(cv,g){
  const out=cv.Mat.zeros(g.rh,g.rw,cv.CV_8UC1),
    rx=clamp(Math.round(g.bx0)-g.x0,0,g.rw-1),ry=clamp(Math.round(g.by0)-g.y0,0,g.rh-1),
    rr=clamp(Math.round(g.bx1)-g.x0,rx+1,g.rw),rb=clamp(Math.round(g.by1)-g.y0,ry+1,g.rh);
  const roi=out.roi(new cv.Rect(rx,ry,Math.max(1,rr-rx),Math.max(1,rb-ry)));
  roi.setTo(new cv.Scalar(255));roi.delete();
  return out;
}

function inverseGradientGImage(cv,rgba){
  const gray=new cv.Mat(),f=new cv.Mat(),blur=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat();
  cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);gray.convertTo(f,cv.CV_32F,1/255);
  // Sigma 1.5 was the best real-case edge-stop map. Stronger smoothing loses
  // weak paper boundaries; Lab/chroma gradients over-emphasize printed detail.
  cv.GaussianBlur(f,blur,new cv.Size(0,0),1.5,1.5,cv.BORDER_REPLICATE);
  cv.Sobel(blur,gx,cv.CV_32F,1,0,3,.125,0,cv.BORDER_REPLICATE);
  cv.Sobel(blur,gy,cv.CV_32F,0,1,3,.125,0,cv.BORDER_REPLICATE);
  const g=new Float32Array(gray.rows*gray.cols);
  for(let i=0;i<g.length;i++){const mag=Math.hypot(gx.data32F[i],gy.data32F[i]);g[i]=1/Math.sqrt(1+100*mag);}
  gray.delete();f.delete();blur.delete();gx.delete();gy.delete();return g;
}

function segmentMorphGAC(cv,p,box){
  const g=roiGeometry(p,box,1),
    src=cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels),
    roi=src.roi(new cv.Rect(g.x0,g.y0,g.rw,g.rh)),
    rough=boxMask(cv,g),
    scale=Math.min(1,180/Math.max(g.rw,g.rh)),
    qw=Math.max(1,Math.round(g.rw*scale)),qh=Math.max(1,Math.round(g.rh*scale)),
    image=new cv.Mat(),seed=new cv.Mat();
  cv.resize(roi,image,new cv.Size(qw,qh),0,0,cv.INTER_AREA);
  cv.resize(rough,seed,new cv.Size(qw,qh),0,0,cv.INTER_NEAREST);

  // The initializer is already box + 1 mm; do not dilate it again.
  const init=new Uint8Array(seed.data.length);
  for(let i=0;i<init.length;i++)init[i]=seed.data[i]?1:0;

  // Real-case ablation: most items are converged by 40 iterations. Only the
  // strong-seed / medium-fill binder-paper pattern benefits from 65.
  const iterations=(box.seedDensity??0)>.8&&(box.fillRatio??0)<.8?65:40,
    u=morphGAC(inverseGradientGImage(cv,image),qw,qh,init,{
      numIter:iterations,smoothing:1,threshold:'auto',balloon:-1
    }),
    small=cv.Mat.zeros(qh,qw,cv.CV_8UC1);
  for(let i=0;i<u.length;i++)if(u[i])small.data[i]=255;

  const up=new cv.Mat(),binary=new cv.Mat();
  cv.resize(small,up,new cv.Size(g.rw,g.rh),0,0,cv.INTER_LINEAR);
  cv.threshold(up,binary,127,255,cv.THRESH_BINARY);
  const result=encodeRegion(cv,binary,g.x0,g.y0,p.width,p.height,box,{
    segmentationIterations:iterations,
    segmentationMaxDim:180,
    segmentationInitMarginMM:1
  });

  binary.delete();up.delete();small.delete();seed.delete();image.delete();rough.delete();roi.delete();src.delete();
  return result;
}

export function segmentMaterialBoxes(cv,p){
  return (p.boxes||[]).map(box=>segmentMorphGAC(cv,p,box));
}
