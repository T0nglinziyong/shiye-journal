// Browser ports derived from scikit-image BSD-3-Clause reference implementations:
// - active_contour_model.py
// - morphsnakes.py
// Reference revision used for parity: 533b7694d2004ae84e49e2cfd0bcfc5f8e562f22
//
// MorphGAC is a direct 2-D typed-array translation of the official update.
// Active Contour preserves the official energy matrix/update equations; image
// force derivatives are sampled from the same Sobel energy with bilinear
// interpolation instead of SciPy FITPACK RectBivariateSpline. Browser parity
// tests bound that interpolation difference.
//
// These functions are intentionally generic. A4-specific initialization and
// confidence routing live outside the algorithm implementations.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function reflect(i,n){if(n<=1)return 0;while(i<0||i>=n){if(i<0)i=-i-1;if(i>=n)i=2*n-i-1;}return i;}

export function sobelMagnitude(image,w,h){
  const out=new Float32Array(w*h),smooth=[.25,.5,.25],edge=[1,0,-1];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let gx=0,gy=0;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
      const v=image[reflect(y+j,h)*w+reflect(x+i,w)];
      gx+=v*smooth[j+1]*edge[i+1];
      gy+=v*edge[j+1]*smooth[i+1];
    }
    out[y*w+x]=Math.sqrt((gx*gx+gy*gy)/2);
  }
  return out;
}

function grad2(image,w,h){
  const gy=new Float32Array(w*h),gx=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;
    gx[p]=x===0?image[p+1]-image[p]:x===w-1?image[p]-image[p-1]:(image[p+1]-image[p-1])*.5;
    gy[p]=y===0?image[p+w]-image[p]:y===h-1?image[p]-image[p-w]:(image[p+w]-image[p-w])*.5;
  }
  return [gy,gx];
}
function bilerp(a,w,h,x,y){
  x=clamp(x,0,w-1);y=clamp(y,0,h-1);
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),tx=x-x0,ty=y-y0;
  const v00=a[y0*w+x0],v10=a[y0*w+x1],v01=a[y1*w+x0],v11=a[y1*w+x1];
  return (v00*(1-tx)+v10*tx)*(1-ty)+(v01*(1-tx)+v11*tx)*ty;
}
function invertMatrix(A,n){
  const aug=new Float64Array(n*n*2);
  for(let r=0;r<n;r++){for(let c=0;c<n;c++)aug[r*2*n+c]=A[r*n+c];aug[r*2*n+n+r]=1;}
  for(let c=0;c<n;c++){
    let pivot=c,best=Math.abs(aug[c*2*n+c]);
    for(let r=c+1;r<n;r++){const v=Math.abs(aug[r*2*n+c]);if(v>best){best=v;pivot=r;}}
    if(best<1e-12)throw Error('singular snake matrix');
    if(pivot!==c)for(let k=0;k<2*n;k++){const t=aug[c*2*n+k];aug[c*2*n+k]=aug[pivot*2*n+k];aug[pivot*2*n+k]=t;}
    const pv=aug[c*2*n+c];for(let k=0;k<2*n;k++)aug[c*2*n+k]/=pv;
    for(let r=0;r<n;r++)if(r!==c){const f=aug[r*2*n+c];if(!f)continue;for(let k=0;k<2*n;k++)aug[r*2*n+k]-=f*aug[c*2*n+k];}
  }
  const inv=new Float64Array(n*n);for(let r=0;r<n;r++)for(let c=0;c<n;c++)inv[r*n+c]=aug[r*2*n+n+c];return inv;
}
const invCache=new Map();
function snakeInverse(n,alpha,beta,gamma){
  const key=`${n}:${alpha}:${beta}:${gamma}`;if(invCache.has(key))return invCache.get(key);
  const A=new Float64Array(n*n),mod=i=>(i+n)%n;
  for(let r=0;r<n;r++){
    A[r*n+r]+=2*alpha+6*beta;
    A[r*n+mod(r-1)]+=-alpha-4*beta;A[r*n+mod(r+1)]+=-alpha-4*beta;
    A[r*n+mod(r-2)]+=beta;A[r*n+mod(r+2)]+=beta;
    A[r*n+r]+=gamma;
  }
  const inv=invertMatrix(A,n);invCache.set(key,inv);return inv;
}
function matVec(A,v,n){const out=new Float64Array(n);for(let r=0;r<n;r++){let s=0;for(let c=0;c<n;c++)s+=A[r*n+c]*v[c];out[r]=s;}return out;}

/**
 * Browser equivalent of skimage.segmentation.active_contour for the periodic
 * segmentation boundary condition used by Shiye.
 */
export function activeContour(image,w,h,snake,opts={}){
  const alpha=opts.alpha??.01,beta=opts.beta??.1,wLine=opts.wLine??0,wEdge=opts.wEdge??1,
    gamma=opts.gamma??.01,maxPxMove=opts.maxPxMove??1,maxNumIter=opts.maxNumIter??2500,
    convergence=opts.convergence??.1;
  const edge=wEdge!==0?sobelMagnitude(image,w,h):new Float32Array(w*h),energy=new Float32Array(w*h);
  for(let i=0;i<energy.length;i++)energy[i]=wLine*image[i]+wEdge*edge[i];
  const [fyField,fxField]=grad2(energy,w,h);
  const n=snake.length,x=new Float64Array(n),y=new Float64Array(n);
  for(let i=0;i<n;i++){y[i]=snake[i][0];x[i]=snake[i][1];}
  const inv=snakeInverse(n,alpha,beta,gamma),order=10,
    xsave=Array.from({length:order},()=>new Float64Array(n)),
    ysave=Array.from({length:order},()=>new Float64Array(n));
  let iterations=0;
  for(let it=0;it<maxNumIter;it++){
    iterations=it+1;const rhsX=new Float64Array(n),rhsY=new Float64Array(n);
    for(let i=0;i<n;i++){
      rhsX[i]=gamma*x[i]+bilerp(fxField,w,h,x[i],y[i]);
      rhsY[i]=gamma*y[i]+bilerp(fyField,w,h,x[i],y[i]);
    }
    const xn=matVec(inv,rhsX,n),yn=matVec(inv,rhsY,n);
    for(let i=0;i<n;i++){x[i]+=maxPxMove*Math.tanh(xn[i]-x[i]);y[i]+=maxPxMove*Math.tanh(yn[i]-y[i]);}
    const j=it%(order+1);
    if(j<order){xsave[j].set(x);ysave[j].set(y);}
    else{
      let best=Infinity;
      for(let k=0;k<order;k++){
        let mx=0;for(let i=0;i<n;i++)mx=Math.max(mx,Math.abs(xsave[k][i]-x[i])+Math.abs(ysave[k][i]-y[i]));
        best=Math.min(best,mx);
      }
      if(best<convergence)break;
    }
  }
  return {snake:Array.from({length:n},(_,i)=>[y[i],x[i]]),iterations};
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


/**
 * Direct browser translation of skimage.segmentation.morphological_chan_vese.
 */
export function morphACWE(image,w,h,initMask,opts={}){
  const numIter=opts.numIter??100,smoothing=opts.smoothing??1,lambda1=opts.lambda1??1,lambda2=opts.lambda2??1;
  let u=new Uint8Array(initMask.length);for(let i=0;i<u.length;i++)u[i]=initMask[i]>0?1:0;
  let phase=0;
  for(let it=0;it<numIter;it++){
    let inSum=0,inN=0,outSum=0,outN=0;
    for(let i=0;i<u.length;i++){if(u[i]){inSum+=image[i];inN++;}else{outSum+=image[i];outN++;}}
    const c0=outSum/(outN+1e-8),c1=inSum/(inN+1e-8);
    const [duy,dux]=grad2(u,w,h);
    for(let i=0;i<u.length;i++){
      const abs=Math.abs(duy[i])+Math.abs(dux[i]);
      const aux=abs*(lambda1*(image[i]-c1)**2-lambda2*(image[i]-c0)**2);
      if(aux<0)u[i]=1;else if(aux>0)u[i]=0;
    }
    for(let s=0;s<smoothing;s++)u=curvop(u,w,h,phase++);
  }
  return u;
}
