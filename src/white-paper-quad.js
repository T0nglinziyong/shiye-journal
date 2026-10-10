// A single paper finder: jointly fit four long borders using white-paper
// inside/outside luminance, continuous edge support and A4 geometry.
// Inputs are one sRGB luminance raster and its Canny support map. No
// threshold-contour detector or second-resolution fallback is involved.
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

function contrastScore(line,side,gray,edge,w,h){
  const [x1,y1,x2,y2]=line,dx=x2-x1,dy=y2-y1;
  const length=Math.hypot(dx,dy),horizontal=side==='top'||side==='bottom';
  if(length<Math.min(w,h)*.09)return null;
  if(horizontal){if(Math.abs(dx)<1||Math.abs(dy/dx)>.24)return null;}
  else if(Math.abs(dy)<1||Math.abs(dx/dy)>.34)return null;
  const count=75,offset=Math.max(5,Math.round(Math.min(w,h)*.018));
  let contrastSum=0,foreground=0,white=0,supported=0,valid=0;
  for(let i=0;i<count;i++){
    const t=(i+.5)/count;
    let x,y,inX,inY,outX,outY;
    if(horizontal){
      x=w*(.14+.72*t);y=y1+(x-x1)*dy/dx;
      if((side==='top'&&y>h*.43)||(side==='bottom'&&y<h*.57))return null;
      inX=outX=x;
      inY=y+(side==='top'?offset:-offset);
      outY=y+(side==='top'?-offset:offset);
    }else{
      y=h*(.16+.68*t);x=x1+(y-y1)*dx/dy;
      if((side==='left'&&x>w*.44)||(side==='right'&&x<w*.56))return null;
      inY=outY=y;
      inX=x+(side==='left'?offset:-offset);
      outX=x+(side==='left'?-offset:offset);
    }
    const xi=Math.round(x),yi=Math.round(y),a=Math.round(inX),
      b=Math.round(inY),c=Math.round(outX),d=Math.round(outY);
    if(Math.min(xi,yi,a,b,c,d)<2||xi>=w-2||yi>=h-2||
       a>=w||c>=w||b>=h||d>=h)continue;
    valid++;
    const inner=gray[b*w+a],outer=gray[d*w+c],difference=inner-outer;
    contrastSum+=clamp(difference,-90,140);
    if(difference>25&&inner>145)foreground++;
    if(inner>150)white++;
    if(edge[yi*w+xi])supported++;
  }
  if(valid<count*.91)return null;
  const confidence=foreground/valid;
  const score=contrastSum/valid*.25+confidence*40+
    white/valid*8+supported/valid*160+Math.min(length,210)/210*5;
  if(score<25||confidence<.2)return null;
  return {line,score,confidence,support:supported/valid};
}
function intersection(a,b){
  const [x1,y1,x2,y2]=a,[x3,y3,x4,y4]=b;
  const determinant=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(determinant)<1e-4)return null;
  const p=x1*y2-y1*x2,q=x3*y4-y3*x4;
  return [(p*(x3-x4)-(x1-x2)*q)/determinant,
    (p*(y3-y4)-(y1-y2)*q)/determinant];
}
function scoreQuadrilateral(top,bottom,left,right,w,h,paperRatio){
  const points=[intersection(top,left),intersection(top,right),
    intersection(bottom,right),intersection(bottom,left)];
  if(points.some(p=>!p||p[0]<w*.012||p[0]>w*.988||
    p[1]<h*.012||p[1]>h*.988))return null;
  let area=0;
  for(let i=0;i<4;i++){
    const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
    area+=a[0]*b[1]-a[1]*b[0];
    if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<=0)
      return null;
  }
  area/=2*w*h;
  if(area<.28||area>.94)return null;
  const distance=(i,j)=>Math.hypot(points[i][0]-points[j][0],
    points[i][1]-points[j][1]);
  const width=(distance(0,1)+distance(2,3))/2;
  const height=(distance(0,3)+distance(1,2))/2;
  const aspect=Math.min(width/height,height/width);
  const expected=Math.min(paperRatio,1/paperRatio);
  const ratioScore=Math.min(aspect/expected,expected/aspect);
  if(!Number.isFinite(ratioScore)||ratioScore<.67)return null;
  return {points,area,ratioScore};
}
export function detectWhitePaperQuad(lines,gray,edge,width,height,paperRatio){
  if(!Array.isArray(lines)||!gray||!edge||
     gray.length!==width*height||edge.length!==width*height||
     !Number.isFinite(paperRatio)||paperRatio<=0)return null;
  const sides={top:[],bottom:[],left:[],right:[]};
  for(const line of lines){
    if(!line||line.length!==4||line.some(x=>!Number.isFinite(x)))continue;
    const [x1,y1,x2,y2]=line,dx=x2-x1,dy=y2-y1,
      middleX=(x1+x2)/2,middleY=(y1+y2)/2;
    let side;
    if(Math.abs(dx)>Math.abs(dy)*2.7)
      side=middleY<height*.5?'top':'bottom';
    else if(Math.abs(dy)>Math.abs(dx)*2.7)
      side=middleX<width*.5?'left':'right';
    else continue;
    const result=contrastScore(line,side,gray,edge,width,height);
    if(result)sides[side].push(result);
  }
  if(Object.values(sides).some(items=>items.length===0))return null;
  for(const side of Object.keys(sides))
    sides[side].sort((a,b)=>b.score-a.score);
  let best=null;
  for(const top of sides.top.slice(0,7))
    for(const bottom of sides.bottom.slice(0,7))
      for(const left of sides.left.slice(0,7))
        for(const right of sides.right.slice(0,7)){
          const geometry=scoreQuadrilateral(top.line,bottom.line,
            left.line,right.line,width,height,paperRatio);
          if(!geometry)continue;
          const score=top.score+bottom.score+left.score+right.score+
            geometry.ratioScore*55+geometry.area*25;
          if(!best||score>best.score)best={...geometry,score};
        }
  // Refuse weak or incomplete evidence instead of accepting a false page.
  return best?best.points.map(([x,y])=>({x:x/width,y:y/height})):null;
}
