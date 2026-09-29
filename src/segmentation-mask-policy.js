// Model confidence is not correctness: refuse page/background masks even when
// the model reports high IoU. Coordinates are in the analysis image pixels.
export function selectMaterialMask(masks,scores,width,height,box){
  const [l,t,r,b]=box,plane=width*height,boxArea=(r-l)*(b-t);let best=null;
  for(let k=0;k<scores.length;k++){
    let total=0,inside=0;const alpha=masks.subarray(k*plane,(k+1)*plane);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(alpha[y*width+x]){total++;if(x>=l&&x<=r&&y>=t&&y<=b)inside++;}
    if(!total||inside/total<.97||total<boxArea*.15||total>boxArea*1.12)continue;
    if(!best||scores[k]>best.score)best={score:scores[k],alpha:Uint8Array.from(alpha,v=>v?255:0)};
  }
  return best;
}
