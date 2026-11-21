// Advisory only: pixels can reveal transparent material frames that a scene-box
// coverage estimate cannot. They cannot decide whether empty space is useful.
function rgb(hex){
 const value=String(hex||'').match(/^#([0-9a-f]{6})$/i)?.[1];
 return value?[0,2,4].map(index=>parseInt(value.slice(index,index+2),16)):null;
}

export function auditRenderedPixels(data,width,height,{paperColor,pageMode}={}){
 const paper=rgb(paperColor);
 if(!paper||!Number.isInteger(width)||!Number.isInteger(height)||data.length<width*height*4)return null;
 const count=pageMode==='spread'?2:1,columns=24,rows=32,result=[];
 for(let pageIndex=0;pageIndex<count;pageIndex++){
  const left=Math.round(width*pageIndex/count),right=Math.round(width*(pageIndex+1)/count);
  const occupied=Array.from({length:rows},()=>Array(columns).fill(false));
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
   const x0=left+Math.floor((right-left)*x/columns),x1=left+Math.floor((right-left)*(x+1)/columns);
   const y0=Math.floor(height*y/rows),y1=Math.floor(height*(y+1)/rows);
   let samples=0,painted=0;
   for(let py=y0+1;py<y1;py+=3)for(let px=x0+1;px<x1;px+=3){
    const index=(py*width+px)*4;
    if(data[index+3]<64)continue;
    samples++;
    if(Math.max(Math.abs(data[index]-paper[0]),Math.abs(data[index+1]-paper[1]),Math.abs(data[index+2]-paper[2]))>=18)painted++;
   }
   occupied[y][x]=samples>0&&painted/samples>=.025;
  }
  const heights=Array(columns).fill(0);let largest={area:0,x:0,y:0,w:0,h:0};
  for(let y=0;y<rows;y++){
   for(let x=0;x<columns;x++)heights[x]=occupied[y][x]?0:heights[x]+1;
   for(let x=0;x<columns;x++){
    let h=heights[x];
    for(let end=x;end<columns;end++){
     h=Math.min(h,heights[end]);
     const area=h*(end-x+1);
     if(area>largest.area)largest={area,x,y:y-h+1,w:end-x+1,h};
    }
   }
  }
  const frame={x:left+largest.x*(right-left)/columns,y:largest.y*height/rows,width:largest.w*(right-left)/columns,height:largest.h*height/rows};
  result.push({page:count===1?'page':pageIndex===0?'page.left':'page.right',estimatedVisibleCoverage:Number((occupied.flat().filter(Boolean).length/(columns*rows)).toFixed(3)),largestLowPaintRectanglePx:Object.fromEntries(Object.entries(frame).map(([key,value])=>[key,Number(value.toFixed(1))])),lowPaintRectangleFraction:Number((largest.area/(columns*rows)).toFixed(3))});
 }
 const observations=result.filter(page=>page.estimatedVisibleCoverage<.5).map(page=>`${page.page} 的真实 PNG 中接近纸色的格子超过一半：缩看是否是有意的呼吸留白；若只是小正文和几件独立素材留下的大空区，优先重排真实纸片与书写，避免用无关大色块填补。`);
 if(result.length===2&&Math.abs(result[0].estimatedVisibleCoverage-result[1].estimatedVisibleCoverage)>.14){
  const lighter=result[0].estimatedVisibleCoverage<result[1].estimatedVisibleCoverage?result[0]:result[1];
  observations.push(`${lighter.page} 的可见笔触比另一页少得多：缩看两页是否仍有意形成呼应；若这页只有一张完整卡片和一段独立小字，优先在现有纸面加入可读随写、让图形回应实物细节或调整主块，而非随机填色。`);
 }
 return {kind:'pixel-advisory',method:'24x32 sampled PNG grid; a cell is painted when at least 2.5% of samples differ from the declared paper color by 18 RGB levels',limitations:'浅色素材、纸纹、照片内部的留白和遮挡都会影响估计。它不是可用书写面积或视觉质量评分，必须打开 PNG 判断。',pages:result,observations};
}
