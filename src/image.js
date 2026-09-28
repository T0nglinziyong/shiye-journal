// Preview at a reduced resolution. All accepted cuts are re-extracted from the
// original bitmap, so segmentation never lowers the saved image resolution.
export async function detectPaperCandidates(bitmap,box,smallestMM=6,{balanceLight=false,paperWidthMM=210,paperHeightMM=297}={}){
  const max=850,ratio=Math.min(1,max/Math.max(bitmap.width*box.w,bitmap.height*box.h));
  const w=Math.max(1,Math.round(bitmap.width*box.w*ratio)),h=Math.max(1,Math.round(bitmap.height*box.h*ratio));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,bitmap.width*box.x,bitmap.height*box.y,bitmap.width*box.w,bitmap.height*box.h,0,0,w,h);
  const data=ctx.getImageData(0,0,w,h).data,mask=new Uint8Array(w*h);
  // White paper prior. Intentionally conservative with pale stickers.
  const blocks=balanceLight?new Float32Array(Math.ceil(w/32)*Math.ceil(h/32)):null;
  if(blocks){const cols=Math.ceil(w/32);for(let by=0;by<Math.ceil(h/32);by++)for(let bx=0;bx<cols;bx++){const luminances=[];for(let y=by*32;y<Math.min(h,(by+1)*32);y+=2)for(let x=bx*32;x<Math.min(w,(bx+1)*32);x+=2){const p=(y*w+x)*4;luminances.push(Math.min(data[p],data[p+1],data[p+2]));}luminances.sort((a,b)=>a-b);blocks[by*cols+bx]=luminances[Math.floor(luminances.length*.8)]||255;}}
  for(let i=0;i<mask.length;i++){const p=i*4,r=data[p],g=data[p+1],b=data[p+2],threshold=blocks?Math.min(232,Math.max(130,blocks[Math.floor(i/w/32)*Math.ceil(w/32)+Math.floor(i%w/32)]-24)):217;mask[i]=(Math.min(r,g,b)<threshold||Math.max(r,g,b)-Math.min(r,g,b)>23)?1:0;}
  const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length),components=[];
  const minArea=Math.max(16,Math.round((smallestMM/paperWidthMM*w)*(smallestMM/paperHeightMM*h)*.15));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const start=y*w+x;if(!mask[start]||seen[start])continue;seen[start]=1;queue[0]=start;
    let read=0,end=1,minX=x,maxX=x,minY=y,maxY=y;
    while(read<end){const v=queue[read++],px=v%w,py=Math.floor(v/w);
      if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;
      for(const n of [v-1,v+1,v-w,v+w]){if(n<0||n>=mask.length||Math.abs((n%w)-px)+Math.abs(Math.floor(n/w)-py)!==1||!mask[n]||seen[n])continue;seen[n]=1;queue[end++]=n;}
    }
    const bw=maxX-minX+1,bh=maxY-minY+1;
    if(end>=minArea&&bw/w*paperWidthMM>=smallestMM&&bh/h*paperHeightMM>=smallestMM&&bw<w*.92&&bh<h*.92)
      components.push({x:Math.max(0,(minX-4)/w),y:Math.max(0,(minY-4)/h),w:Math.min(1,(bw+8)/w),h:Math.min(1,(bh+8)/h),pixels:end});
  }
  return components.sort((a,b)=>b.pixels-a.pixels).slice(0,24);
}
export async function cropBitmap(bitmap,paper,region){
  const x=Math.max(0,Math.round(bitmap.width*(paper.x+region.x*paper.w))),y=Math.max(0,Math.round(bitmap.height*(paper.y+region.y*paper.h)));
  const w=Math.min(bitmap.width-x,Math.max(1,Math.round(bitmap.width*paper.w*region.w)));
  const h=Math.min(bitmap.height-y,Math.max(1,Math.round(bitmap.height*paper.h*region.h)));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bitmap,x,y,w,h,0,0,w,h);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
}
