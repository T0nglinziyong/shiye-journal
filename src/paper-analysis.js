// Local neutral-page threshold policy; generic geometry runs in OpenCV.
import {visionTask} from './vision-runtime.js';
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)]||0;
export async function segmentPaperMaterials({data,width:w,height:h},{smallestMM=6,paperWidthMM=210,paperHeightMM=297,sourcePixels=data}={}) {
  // Estimate the neutral page colour locally, not a fixed "white > 217".
  // Large cells and robust neutral medians do not learn printed colour as paper.
  const cols=Math.ceil(w/64),rows=Math.ceil(h/64),background=[];
  const edge=[[],[],[]];for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){if(x>w*.04&&x<w*.96&&y>h*.04&&y<h*.96)continue;const p=(y*w+x)*4,max=Math.max(data[p],data[p+1],data[p+2]),min=Math.min(data[p],data[p+1],data[p+2]);if(max-min<45&&min>120)for(let k=0;k<3;k++)edge[k].push(data[p+k]);}
  const fallback=edge.map(a=>median(a)||230),rawEdge=[[],[],[]];
  for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){if(x>w*.04&&x<w*.96&&y>h*.04&&y<h*.96)continue;const p=(y*w+x)*4,max=Math.max(sourcePixels[p],sourcePixels[p+1],sourcePixels[p+2]),min=Math.min(sourcePixels[p],sourcePixels[p+1],sourcePixels[p+2]);if(max-min<45&&min>120)for(let k=0;k<3;k++)rawEdge[k].push(sourcePixels[p+k]);}
  const rawBackground=rawEdge.map((a,k)=>median(a)||fallback[k]);
  for(let by=0;by<rows;by++)for(let bx=0;bx<cols;bx++){const samples=[[],[],[]];for(let y=by*64;y<Math.min(h,(by+1)*64);y+=3)for(let x=bx*64;x<Math.min(w,(bx+1)*64);x+=3){const p=(y*w+x)*4,min=Math.min(data[p],data[p+1],data[p+2]),max=Math.max(data[p],data[p+1],data[p+2]);if(max-min<35&&Math.abs((data[p]+data[p+1]+data[p+2]-fallback.reduce((a,b)=>a+b,0))/3)<28)for(let k=0;k<3;k++)samples[k].push(data[p+k]);}background.push(samples.map((a,k)=>a.length>=12?median(a):fallback[k]));}
  const mask=new Uint8Array(w*h),evidence=new Uint8Array(w*h),foregroundSeeds=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,p=i*4,bg=background[Math.floor(y/64)*cols+Math.floor(x/64)],delta=bg.map((b,k)=>data[p+k]-b),distance=Math.max(...delta.map(Math.abs));mask[i]=data[p+3]>20&&distance>18?1:0;
    // Cast shadows mostly change brightness, not hue. Keep them in the mask
    // for intact edges, but require genuine color/ink evidence for acceptance.
    // CLAHE can turn a faint cast shadow into a high-contrast dark object.
    // Foreground seeds must use the ORIGINAL chroma/ink, never enhanced light.
    const rawDelta=rawBackground.map((b,k)=>sourcePixels[p+k]-b),light=Math.max(1,sourcePixels[p]+sourcePixels[p+1]+sourcePixels[p+2]),backgroundLight=Math.max(1,rawBackground.reduce((a,b)=>a+b,0)),chroma=rawBackground.map((b,k)=>sourcePixels[p+k]/light*255-b/backgroundLight*255);
    evidence[i]=mask[i]&&(Math.max(...delta)-Math.min(...delta)>14||distance>60)?1:0;
    foregroundSeeds[i]=mask[i]&&(Math.max(...chroma)-Math.min(...chroma)>12||Math.min(...rawDelta)<-90)?1:0;
  }
  return visionTask('components',{mask,evidence,foregroundSeeds,pixels:sourcePixels,width:w,height:h,smallestMM,paperWidthMM,paperHeightMM});
}
