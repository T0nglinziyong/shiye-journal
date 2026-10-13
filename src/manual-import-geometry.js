// One geometry for both the manual editor preview and final OpenCV mask.
// The editor is drawn with CSS rotate(deg) in *image-pixel aspect-ratio*
// coordinates; normalized x/y must be converted to pixels before rotation.
export function manualRotatedPolygon(box,imageWidth,imageHeight){
  if(!box||!(box.w>0&&box.h>0)||!(imageWidth>0&&imageHeight>0))
    throw Error('手动素材框的尺寸无效');
  const w=imageWidth,h=imageHeight,
    cx=(box.x+box.w/2)*w,cy=(box.y+box.h/2)*h,
    hw=box.w*w/2,hh=box.h*h/2,
    radians=(Number(box.rotation)||0)*Math.PI/180,
    cosine=Math.cos(radians),sine=Math.sin(radians);
  let points=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y])=>[
    cx+x*cosine-y*sine,cy+x*sine+y*cosine
  ]);
  // Sutherland-Hodgman: clip rotated outline against the physical page,
  // not by clamping each vertex (which produces invalid crossing polygons).
  for(const [axis,max,lower] of [[0,w,true],[0,w,false],[1,h,true],[1,h,false]]){
    const inside=p=>lower?p[axis]>=0:p[axis]<=max,
      result=[];
    for(let i=0;i<points.length;i++){
      const start=points[i],end=points[(i+1)%points.length],
        ia=inside(start),ib=inside(end);
      const cross=()=>{
        const target=lower?0:max,den=end[axis]-start[axis];
        const t=Math.abs(den)<1e-12?0:(target-start[axis])/den;
        return [start[0]+t*(end[0]-start[0]),
          start[1]+t*(end[1]-start[1])];
      };
      if(ia&&ib)result.push(end);
      else if(ia&&!ib)result.push(cross());
      else if(!ia&&ib){result.push(cross());result.push(end);}
    }
    points=result;
    if(points.length<3)throw Error('旋转框超出当前照片范围，请将素材框移回画面');
  }
  return points.map(([x,y])=>[x/w,y/h]);
}
export function manualPhysicalRegion(box,imageWidth,imageHeight){
 const rotation=Number(box.rotation)||0;
 return {...box,physicalBoundary:manualRotatedPolygon(box,imageWidth,imageHeight),
   boundarySource:'manual-outline',boundaryPrior:1,needsBoundaryReview:false,
   manualGeometry:true,
   orientedBox:{centerX:box.x+box.w/2,centerY:box.y+box.h/2,
     width:box.w,height:box.h,rotation,rectangularity:1,
     autoDeskew:true,source:'manual'}};
}
