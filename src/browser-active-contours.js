// Browser MorphGAC port derived from scikit-image BSD-3-Clause morphsnakes.py.
// Reference revision used for parity: 533b7694d2004ae84e49e2cfd0bcfc5f8e562f22.
// A4-specific initialization and confidence routing live outside this module.

function grad2(image,w,h){
  const gy=new Float32Array(w*h),gx=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;
    gx[p]=x===0?image[p+1]-image[p]:x===w-1?image[p]-image[p-1]:(image[p+1]-image[p-1])*.5;
    gy[p]=y===0?image[p+w]-image[p]:y===h-1?image[p]-image[p-w]:(image[p+w]-image[p-w])*.5;
  }
  return [gy,gx];
}
// scikit-image's four 2-D SI/IS footprints.
const P2=[
  [[-1,-1],[0,0],[1,1]],
  [[-1,0],[0,0],[1,0]],
  [[-1,1],[0,0],[1,-1]],
  [[0,-1],[0,0],[0,1]]
];
function erodeFoot(u,w,h,offsets){
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let ok=1;
    for(const [dy,dx] of offsets){const yy=y+dy,xx=x+dx;if(yy<0||yy>=h||xx<0||xx>=w||!u[yy*w+xx]){ok=0;break;}}
    out[y*w+x]=ok;
  }
  return out;
}
function dilateFoot(u,w,h,offsets){
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let ok=0;
    for(const [dy,dx] of offsets){const yy=y+dy,xx=x+dx;if(yy>=0&&yy<h&&xx>=0&&xx<w&&u[yy*w+xx]){ok=1;break;}}
    out[y*w+x]=ok;
  }
  return out;
}
const FULL3=Array.from({length:9},(_,i)=>[(i/3|0)-1,i%3-1]);
function erode3(u,w,h){return erodeFoot(u,w,h,FULL3);}
function dilate3(u,w,h){return dilateFoot(u,w,h,FULL3);}
function supInf(u,w,h){
  const es=P2.map(p=>erodeFoot(u,w,h,p)),out=new Uint8Array(w*h);
  for(let i=0;i<out.length;i++)out[i]=(es[0][i]|es[1][i]|es[2][i]|es[3][i])?1:0;
  return out;
}
function infSup(u,w,h){
  const ds=P2.map(p=>dilateFoot(u,w,h,p)),out=new Uint8Array(w*h);
  for(let i=0;i<out.length;i++)out[i]=(ds[0][i]&ds[1][i]&ds[2][i]&ds[3][i])?1:0;
  return out;
}
function curvop(u,w,h,phase){return phase%2===0?supInf(infSup(u,w,h),w,h):infSup(supInf(u,w,h),w,h);}
function percentile(a,p){
  const b=Array.from(a).sort((x,y)=>x-y),k=(b.length-1)*p/100,lo=Math.floor(k),hi=Math.ceil(k);
  return lo===hi?b[lo]:b[lo]*(hi-k)+b[hi]*(k-lo);
}

/**
 * Direct browser translation of
 * skimage.segmentation.morphological_geodesic_active_contour.
 * Input is the already-preprocessed gimage, as in scikit-image.
 */
export function morphGAC(gimage,w,h,initMask,opts={}){
  const numIter=opts.numIter??100,smoothing=opts.smoothing??1,balloon=opts.balloon??0;
  let threshold=opts.threshold??'auto';if(threshold==='auto')threshold=percentile(gimage,40);
  const [dgy,dgx]=grad2(gimage,w,h),balloonMask=new Uint8Array(w*h);
  if(balloon!==0){const t=threshold/Math.abs(balloon);for(let i=0;i<balloonMask.length;i++)balloonMask[i]=gimage[i]>t?1:0;}
  let u=new Uint8Array(initMask.length);for(let i=0;i<u.length;i++)u[i]=initMask[i]>0?1:0;
  let phase=0;
  for(let it=0;it<numIter;it++){
    if(balloon!==0){
      const aux=balloon>0?dilate3(u,w,h):erode3(u,w,h);
      for(let i=0;i<u.length;i++)if(balloonMask[i])u[i]=aux[i];
    }
    const [duy,dux]=grad2(u,w,h);
    for(let i=0;i<u.length;i++){const a=dgy[i]*duy[i]+dgx[i]*dux[i];if(a>0)u[i]=1;else if(a<0)u[i]=0;}
    for(let s=0;s<smoothing;s++)u=curvop(u,w,h,phase++);
  }
  return u;
}
