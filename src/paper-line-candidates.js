// Conservative paper-edge fallback on a fixed-size sRGB recognition raster.
// Called only if the original contour-based quad detector has no accepted quad.
// Refuse insufficient geometric evidence rather than inventing four corners.
const median=values=>{const sorted=values.sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:-Infinity;};
const within=(x,min,max)=>x>=min&&x<=max;
function edgeContrast(line,side,gray,width,height){
  const [x1,y1,x2,y2]=line,dx=x2-x1,dy=y2-y1,contrast=[];
  for(let i=1;i<=9;i++){
    const t=i/10,x=x1+t*dx,y=y1+t*dy;
    const offset=side==='top'?[0,12]:side==='bottom'?[0,-12]:side==='left'?[12,0]:[-12,0];
    const a=Math.round(x+offset[0]),b=Math.round(y+offset[1]);
    const c=Math.round(x-offset[0]),d=Math.round(y-offset[1]);
    if(within(a,0,width-1)&&within(c,0,width-1)&&within(b,0,height-1)&&within(d,0,height-1))
      contrast.push(gray[b*width+a]-gray[d*width+c]);
  }
  return median(contrast);
}
function intersection(a,b){
  const [x1,y1,x2,y2]=a,[x3,y3,x4,y4]=b;
  const determinant=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(determinant)<1e-6)return null;
  const p=x1*y2-y1*x2,q=x3*y4-y3*x4;
  return {x:(p*(x3-x4)-(x1-x2)*q)/determinant,y:(p*(y3-y4)-(y1-y2)*q)/determinant};
}
export function paperQuadFromLines(lines,gray,width,height,paperRatio=210/297){
  if(!Array.isArray(lines)||!gray?.length||width<200||height<200)return null;
  const buckets={top:[],bottom:[],left:[],right:[]};
  for(const line of lines){
    if(!Array.isArray(line)||line.length!==4||!line.every(Number.isFinite))continue;
    const [x1,y1,x2,y2]=line,dx=x2-x1,dy=y2-y1;
    const length=Math.hypot(dx,dy),centerX=(x1+x2)/(2*width),centerY=(y1+y2)/(2*height);
    if(Math.abs(dx)>=width*.15&&Math.abs(dy)<=Math.abs(dx)*.15){
      for(const side of ['top','bottom']){
        if((side==='top'&&!within(centerY,.045,.20))||
           (side==='bottom'&&(!within(centerY,.78,.91)||Math.abs(dy)>Math.abs(dx)*.065)))continue;
        const contrast=edgeContrast(line,side,gray,width,height);
        if(contrast<(side==='top'?48:35))continue;
        const score=side==='top'?contrast*2+length*.25-Math.abs(centerY-.11)*230:
          length+contrast*.6-Math.abs(centerY-.86)*6700;
        buckets[side].push({line,score});
      }
    }
    if(Math.abs(dy)>=height*.25&&Math.abs(dx)<=Math.abs(dy)*.23){
      for(const side of ['left','right']){
        if((side==='left'&&!within(centerX,.025,.24))||
           (side==='right'&&!within(centerX,.77,.96)))continue;
        const slope=dx/dy;
        if(side==='right'&&(slope<-.03||slope>.18))continue;
        const contrast=edgeContrast(line,side,gray,width,height);
        if(contrast<(side==='left'?45:4))continue;
        const score=side==='left'?length+contrast*.4-Math.abs(centerX-.08)*200:
          length+contrast*.5-Math.abs(centerX-.91)*160;
        buckets[side].push({line,score});
      }
    }
  }
  if(Object.values(buckets).some(values=>!values.length))return null;
  const choose=side=>buckets[side].sort((a,b)=>b.score-a.score)[0].line;
  const top=choose('top'),bottom=choose('bottom'),left=choose('left'),right=choose('right');
  const points=[intersection(top,left),intersection(top,right),intersection(bottom,right),intersection(bottom,left)];
  if(points.some(point=>!point||!within(point.x,2,width-3)||!within(point.y,2,height-3)))return null;
  const corners=points.map(point=>({x:point.x/width,y:point.y/height}));
  const area=corners.reduce((total,p,i)=>total+p.x*corners[(i+1)%4].y-p.y*corners[(i+1)%4].x,0)/2;
  if(!within(area,.25,.92))return null;
  for(let i=0;i<4;i++){
    const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
    if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<=0)return null;
  }
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const widthPx=(distance(points[0],points[1])+distance(points[3],points[2]))/2;
  const heightPx=(distance(points[0],points[3])+distance(points[1],points[2]))/2;
  const aspect=Math.min(widthPx/heightPx,heightPx/widthPx);
  const expected=Math.min(paperRatio,1/paperRatio);
  if(!Number.isFinite(expected)||Math.min(aspect/expected,expected/aspect)<.70)return null;
  return corners;
}
