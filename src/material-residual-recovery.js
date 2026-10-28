import {boxArea,overlapOfSmaller} from './material-physical-candidates.js';

const median=values=>{
  if(!values.length)return 0;
  values.sort((a,b)=>a-b);
  const mid=values.length>>1;
  return values.length&1?values[mid]:(values[mid-1]+values[mid])/2;
};

function solve6(matrix,values){
  const a=Array.from({length:6},(_,i)=>[...matrix[i],values[i]]);
  for(let col=0;col<6;col++){
    let pivot=col;
    for(let row=col+1;row<6;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-9)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const divisor=a[col][col];
    for(let j=col;j<7;j++)a[col][j]/=divisor;
    for(let row=0;row<6;row++)if(row!==col){
      const factor=a[row][col];
      for(let j=col;j<7;j++)a[row][j]-=factor*a[col][j];
    }
  }
  return a.map(row=>row[6]);
}

function robustPaperField(gray,width,height){
  const samples=[];
  for(let y=0;y<height;y+=7)for(let x=0;x<width;x+=7){
    const xx=x/width,yy=y/height;
    if(xx>=.07&&xx<=.93&&yy>=.07&&yy<=.93)continue;
    samples.push({basis:[1,xx,yy,xx*yy,xx*xx,yy*yy],value:gray[y*width+x],weight:1});
  }
  let beta=null;
  for(let iteration=0;iteration<3;iteration++){
    const normal=Array.from({length:6},()=>Array(6).fill(0)),rhs=Array(6).fill(0);
    for(const row of samples){
      const weight=row.weight*row.weight;
      for(let i=0;i<6;i++){
        rhs[i]+=row.basis[i]*row.value*weight;
        for(let j=0;j<6;j++)normal[i][j]+=row.basis[i]*row.basis[j]*weight;
      }
    }
    beta=solve6(normal,rhs);
    if(!beta)return null;
    const residual=samples.map(row=>row.value-row.basis.reduce((sum,v,i)=>sum+v*beta[i],0)),
      center=median([...residual]),spread=Math.max(1,1.4826*median(residual.map(v=>Math.abs(v-center))));
    for(let i=0;i<samples.length;i++)samples[i].weight=Math.min(1,2.5*spread/Math.max(1e-9,Math.abs(residual[i])));
  }
  return beta;
}

export function discoverResidualCarriers(cv,p,own){
  const width=p.width,height=p.height,
    src=own(cv.matFromArray(height,width,cv.CV_8UC4,p.pixels)),
    gray=own(new cv.Mat()),soft=own(new cv.Mat());
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray,soft,new cv.Size(0,0),2.5);
  const beta=robustPaperField(gray.data,width,height);
  if(!beta)return [];
  const residual=new Float32Array(width*height),border=[],gap=Math.max(6,Math.floor(Math.min(width,height)*.05));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const xx=x/width,yy=y/height,
      expected=beta[0]+beta[1]*xx+beta[2]*yy+beta[3]*xx*yy+beta[4]*xx*xx+beta[5]*yy*yy,
      value=Math.abs(soft.data[y*width+x]-expected);
    residual[y*width+x]=value;
    if(x<gap||y<gap||x>=width-gap||y>=height-gap)border.push(value);
  }
  const center=median(border),sigma=1.4826*median(border.map(v=>Math.abs(v-center))),
    threshold=Math.max(4.5,center+4*Math.max(.7,sigma)),
    binary=own(cv.Mat.zeros(height,width,cv.CV_8UC1));
  for(let y=gap>>1;y<height-(gap>>1);y++)for(let x=gap>>1;x<width-(gap>>1);x++)
    if(residual[y*width+x]>threshold)binary.data[y*width+x]=255;
  const closed=own(new cv.Mat()),kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(9,9))),
    labels=own(new cv.Mat()),stats=own(new cv.Mat()),centroids=own(new cv.Mat());
  cv.morphologyEx(binary,closed,cv.MORPH_CLOSE,kernel);
  const count=cv.connectedComponentsWithStats(closed,labels,stats,centroids,8,cv.CV_32S),out=[];
  for(let id=1;id<count;id++){
    const base=id*5,x=stats.data32S[base],y=stats.data32S[base+1],
      w=stats.data32S[base+2],h=stats.data32S[base+3],area=stats.data32S[base+4];
    if(area<Math.max(450,width*height*.0015)||w<25||h<25||w>width*.7||h>height*.7)continue;
    const part=cv.Mat.zeros(h,w,cv.CV_8UC1),contours=new cv.MatVector(),hierarchy=new cv.Mat();
    try{
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)
        if(labels.data32S[(y+yy)*width+x+xx]===id)part.data[yy*w+xx]=255;
      cv.findContours(part,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
      let best=null,contourArea=0;
      for(let i=0;i<contours.size();i++){
        const contour=contours.get(i),a=Math.abs(cv.contourArea(contour));
        if(a>contourArea){best?.delete();best=contour;contourArea=a;}else contour.delete();
      }
      if(!best)continue;
      try{
        const fill=contourArea/Math.max(1,w*h);
        if(fill<.46)continue;
        const contourMask=cv.Mat.zeros(h,w,cv.CV_8UC1),vector=new cv.MatVector();
        try{
          vector.push_back(best);
          cv.drawContours(contourMask,vector,-1,new cv.Scalar(255),cv.FILLED);
          const points=Array.from({length:best.rows},(_,i)=>[
            (x+best.data32S[i*2])/width,(y+best.data32S[i*2+1])/height]);
          out.push({x:x/width,y:y/height,w:w/width,h:h/height,
            physicalBoundary:points,boundarySource:'background-field-recovery',
            physicalMask:{x,y,width:w,height:h,alpha:new Uint8Array(contourMask.data)},
            boundaryPrior:Math.min(.6,.35+.3*fill),fillRatio:fill});
        }finally{vector.delete();contourMask.delete();}
      }finally{best.delete();}
    }finally{hierarchy.delete();contours.delete();part.delete();}
  }
  return out;
}

export function recoverResidualCarriers(base,residual,width,height){
  const out=[...base];
  for(const proposal of residual){
    const area=boxArea(proposal);
    if(area<.0025||area>.17||Math.min(proposal.w,proposal.h)/Math.max(proposal.w,proposal.h)<.21)continue;
    const matches=out.flatMap((item,index)=>{
      const current=boxArea(item),coverage=overlapOfSmaller(proposal,item),ratio=area/Math.max(1e-9,current);
      return coverage>.84&&ratio>1.6&&ratio<6&&(!item.physicalBoundary||(item.boundaryPrior??0)<.4)
        ?[{item,index}]:[];
    });
    if(matches.length!==1)continue;
    const [{item,index}]=matches;
    if(out.some((other,i)=>i!==index&&overlapOfSmaller(proposal,other)>.16))continue;
    if(proposal.fillRatio<.52)continue;
    if(proposal.x*width<=5||proposal.y*height<=5||
      (proposal.x+proposal.w)*width>=width-5||(proposal.y+proposal.h)*height>=height-5)continue;
    out[index]={...item,...proposal,boundaryPrior:Math.max(item.boundaryPrior??0,.64),
      recoveredFrom:item.boundarySource||item.instanceMethod};
  }
  return out.sort((a,b)=>a.y-b.y||a.x-b.x);
}
