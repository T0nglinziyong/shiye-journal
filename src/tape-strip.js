import {itemFromAsset} from './domain.js';
import {normalizeTapeFlatCrop,tapeFlatCanvas} from './tape-flat-crop.js';

const point=p=>Array.isArray(p)?p:[p.x,p.y];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function tapeDimensions(asset){
  const w=Number(asset?.physicalWidthMM),h=Number(asset?.physicalHeightMM);
  if(!(w>0&&h>0))throw Error('胶带需要先确认真实长宽');
  const axis=asset.tapeAxis==='y'?'y':asset.tapeAxis==='x'?'x':w>=h?'x':'y';
  return {axis,widthMM:axis==='x'?h:w,lengthMM:axis==='x'?w:h};
}
export function tapeRepeatRange(asset){
  if(asset?.tapeRepeatMode!=='repeatablePattern')return null;
  const start=Number(asset.tapeRepeatStartMM??0);
  const end=Number(asset.tapeRepeatEndMM??(start+Number(asset.tapeRepeatPeriodMM)));
  return Number.isFinite(start)&&Number.isFinite(end)?[start,end]:null;
}
export function processTapeAsset(asset,{repeatable=false,periodMM=null,repeatStartMM=0,repeatEndMM=null,axis}={}){
  if(asset.kind!=='tape')throw Error('只有胶带素材可以设置连续纹样');
  const start=Number(repeatStartMM),end=repeatEndMM==null?start+Number(periodMM):Number(repeatEndMM);
  const next={...asset,tapeAxis:axis==='y'?'y':'x',
    tapeRepeatMode:repeatable?'repeatablePattern':'singleStrip',
    tapeRepeatStartMM:repeatable?start:null,
    tapeRepeatEndMM:repeatable?end:null,
    tapeRepeatPeriodMM:repeatable?end-start:null,
    updatedAt:new Date().toISOString()};
  const dimensions=tapeDimensions(next);
  if(repeatable&&(!(start>=0)||!(end>start)||end>dimensions.lengthMM))
    throw Error('重复纹样区间必须位于实拍胶带长度内，且终点大于起点');
  return next;
}
const capStyles=new Set(['square','angled','torn']);
function sourceOptions(asset,pathLengthMM,options={}){
  const {lengthMM}=tapeDimensions(asset),repeatRangeMM=
    Object.hasOwn(options,'repeatRangeMM')?options.repeatRangeMM:tapeRepeatRange(asset);
  if(repeatRangeMM&&(!Array.isArray(repeatRangeMM)||repeatRangeMM.length!==2||
    !(repeatRangeMM[0]>=0)||!(repeatRangeMM[1]>repeatRangeMM[0])||repeatRangeMM[1]>lengthMM))
    throw Error('胶带重复区间超出实拍样段');
  const textureMode=options.textureMode|| (repeatRangeMM?'repeat':'stretch');
  if(!['sample','repeat','stretch'].includes(textureMode)||textureMode==='repeat'&&!repeatRangeMM)
    throw Error('胶带纹样模式无效；重复模式需要已确认的纹样区间');
  if(textureMode==='sample'&&pathLengthMM>lengthMM+.1)
    throw Error(`这张胶带只拍到 ${lengthMM.toFixed(1)} mm；请在“编辑素材信息 → 尺寸与胶带”确认纹样区间后再画更长`);
  const offset=Number(options.sourceOffsetMM??0),window=Number(options.sourceWindowMM??(lengthMM-offset)),
    available=textureMode==='repeat'?repeatRangeMM[1]-repeatRangeMM[0]:
      textureMode==='stretch'?lengthMM: lengthMM-pathLengthMM;
  if(!Number.isFinite(offset)||offset<0||offset>available+.001)throw Error('胶带原图起点超出可用样段');
  if(!Number.isFinite(window)||window<=0||offset+window>lengthMM+.001)
    throw Error('胶带拉伸取样区间超出原图');
  const startCap=options.startCap||'square',endCap=options.endCap||'square',
    capDepthMM=Number(options.capDepthMM??Math.min(2,tapeDimensions(asset).widthMM*.18));
  if(!capStyles.has(startCap)||!capStyles.has(endCap)||!Number.isFinite(capDepthMM)||
    capDepthMM<0||capDepthMM>tapeDimensions(asset).widthMM*.45)
    throw Error('胶带端头样式或深度无效');
  return {sourceLengthMM:lengthMM,repeatRangeMM,textureMode,sourceOffsetMM:offset,
    sourceWindowMM:window,
    reverseTexture:!!options.reverseTexture,startCap,endCap,capDepthMM};
}
export function createTapeStrip(asset,draft,rawPoints,zIndex=10,options={}){
  if(asset?.kind!=='tape'||!Array.isArray(rawPoints)||rawPoints.length<2)throw Error('请选择胶带后拖动画布');
  const {axis,widthMM:sourceWidth}=tapeDimensions(asset),
    widthMM=Number(options.widthMM??options.physicalWidthMM??sourceWidth),
    scale=draft.canvas.height/(draft.physicalPageHeightMM||297);
  if(!Number.isFinite(widthMM)||widthMM<.5||widthMM>200)throw Error('胶带宽度须在 0.5–200 mm 之间');
  // A real strip is pulled between two points. Keeping only the endpoints
  // avoids thousands of tiny texture meshes and makes the live preview match
  // the final straight strip on touch devices.
  const path=[point(rawPoints[0]),point(rawPoints.at(-1))];
  if(path.some(p=>!p.every(Number.isFinite)))throw Error('胶带轨迹坐标无效');
  if(distance(path[0],path[1])<.8)throw Error('请拖出一段胶带');
  const lengthPx=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0),pathLengthMM=lengthPx/scale;
  if(pathLengthMM<2)throw Error('胶带段至少要有 2 mm');
  const source=sourceOptions(asset,pathLengthMM,options);
  const bandWidthScene=widthMM*scale,half=bandWidthScene/2,
    xs=path.map(p=>p[0]),ys=path.map(p=>p[1]),
    left=Math.min(...xs)-half,top=Math.min(...ys)-half,
    width=Math.max(...xs)+half-left,height=Math.max(...ys)+half-top;
  const x=left+width/2,y=top+height/2,
    item=itemFromAsset(asset,draft,x,y,zIndex);
  item.x=x;item.y=y;item.width=width;item.height=height;item.rotation=0;
  item.tapeStrip={version:2,axis,points:path.map(p=>[(p[0]-left)/width,(p[1]-top)/height]),
    physicalWidthMM:widthMM,bandWidthScene,baseWidth:width,baseHeight:height,pathLengthMM,
    flatCrop:normalizeTapeFlatCrop(options.flatCrop??asset.tapeFlatCrop),...source};
  item.generationBaseline={...item.generationBaseline,x,y,width,height,rotation:0};
  return item;
}
export function reshapeTapeStrip(node,asset,draft,points,options={}){
  if(!node?.tapeStrip)throw Error('只能编辑已放置的胶带段');
  const changed=createTapeStrip(asset,draft,points,node.zIndex,{
    ...node.tapeStrip,...options});
  return {...node,x:changed.x,y:changed.y,width:changed.width,height:changed.height,
    rotation:0,tapeStrip:changed.tapeStrip,
    generationBaseline:{...node.generationBaseline,x:changed.x,y:changed.y,
      width:changed.width,height:changed.height,rotation:0}};
}
export function validateTapeStrip(strip,asset){
  const {axis,widthMM,lengthMM}=tapeDimensions({...asset,tapeAxis:strip?.axis});
  if(![1,2].includes(strip?.version)||strip.axis!==axis||!Array.isArray(strip.points)||
    strip.points.length<2||strip.points.length>512||strip.points.some(p=>
      !Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1))||
    ![strip.bandWidthScene,strip.baseWidth,strip.baseHeight,strip.pathLengthMM,
      strip.sourceLengthMM,...(strip.version===1?[strip.sourcePeriodMM]:[])].every(v=>Number.isFinite(v)&&v>0)||
    Math.abs(strip.sourceLengthMM-lengthMM)>.1)throw Error('胶带段轨迹或实物尺寸无效');
  if(strip.version===1){if(strip.sourcePeriodMM>lengthMM+.1)throw Error('胶带纹样周期超出源照片');}
  else{
    if(!(strip.physicalWidthMM>=.5&&strip.physicalWidthMM<=200)||
      typeof strip.reverseTexture!=='boolean')throw Error('胶带段宽度或纹样方向无效');
    normalizeTapeFlatCrop(strip.flatCrop);
    sourceOptions(asset,strip.pathLengthMM,strip);
    if(![strip.baseWidth,strip.baseHeight,strip.bandWidthScene].every(v=>v>0))
      throw Error('胶带段尺寸无效');
  }
  const path=strip.points.map(([u,v])=>[u*strip.baseWidth,v*strip.baseHeight]);
  const measured=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0)*
    (strip.version===2?strip.physicalWidthMM:widthMM)/strip.bandWidthScene;
  if(Math.abs(measured-strip.pathLengthMM)>.15)throw Error('胶带轨迹长度与真实尺寸不一致');
  return strip.version===2?strip.physicalWidthMM:widthMM;
}
function smoothCenterline(points){
  if(points.length<3)return points;
  let result=points;
  for(let pass=0;pass<2;pass++){
    const next=[result[0]];
    for(let i=0;i<result.length-1;i++){
      const a=result[i],b=result[i+1];
      next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25]);
      next.push([a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);
    }
    next.push(result.at(-1));result=next;
    if(result.length>512)break;
  }
  if(result.length>512){const stride=Math.ceil(result.length/511);
    result=result.filter((_,i)=>i%stride===0);if(result.at(-1)!==points.at(-1))result.push(points.at(-1));}
  return result;
}
const preparedImages=new WeakMap();
// Pointer events are much denser than the pixels in a photographed tape.
// Rendering each event as its own image slice makes the browser repeatedly
// sample a subpixel-wide source column, which appears as vertical slats.
function renderPath(points,band){
  const tolerance=Math.max(.8,band*.08);
  const simplify=(start,end)=>{
    const a=points[start],b=points[end],dx=b[0]-a[0],dy=b[1]-a[1],
      length=Math.hypot(dx,dy)||1;
    let far=0,index=-1;
    for(let i=start+1;i<end;i++){
      const p=points[i],distance=Math.abs(dx*(a[1]-p[1])-dy*(a[0]-p[0]))/length;
      if(distance>far){far=distance;index=i;}
    }
    if(far<=tolerance)return [a,b];
    return [...simplify(start,index).slice(0,-1),...simplify(index,end)];
  };
  return points.length>2?simplify(0,points.length-1):points;
}
function orientedImage(image,axis,flatCrop=null){
  const key=JSON.stringify(flatCrop);
  let variants=preparedImages.get(image);if(!variants){variants=new Map();preparedImages.set(image,variants);}
  let prepared=variants.get(key);if(!prepared){
    prepared={x:tapeFlatCanvas(image,axis,flatCrop)?.canvas};
    if(!prepared.x)return image;
    variants.set(key,prepared);
  }
  if(axis==='x')return prepared.x;
  if(!prepared.y){const source=prepared.x,rotated=document.createElement('canvas');
    rotated.width=source.height;rotated.height=source.width;
    const ctx=rotated.getContext('2d');ctx.translate(0,source.width);
    ctx.rotate(-Math.PI/2);ctx.drawImage(source,0,0);
    prepared.y=rotated;}
  return prepared.y;
}
export function paintTapeStrip(ctx,node,image){
  const strip=node.tapeStrip;if(!strip)return false;
  if(strip.version===2)return paintRibbon(ctx,node,image);
  const texture=orientedImage(image,strip.axis,strip.flatCrop),w=texture.width,h=texture.height;
  const sx=node.width/strip.baseWidth,sy=node.height/strip.baseHeight,
    band=strip.bandWidthScene*Math.sqrt(sx*sy),points=renderPath(strip.points.map(([u,v])=>
      [(u-.5)*node.width,(v-.5)*node.height]),band);
  const lengths=points.slice(1).map((p,i)=>distance(points[i],p)),
    total=lengths.reduce((sum,n)=>sum+n,0);
  if(!(total>0))return true;
  let travelled=0;
  for(let i=0;i<lengths.length;i++){
    const a=points[i],b=points[i+1],segment=lengths[i];if(segment<.01)continue;
    const angle=Math.atan2(b[1]-a[1],b[0]-a[0]),
      startMM=travelled/total*strip.pathLengthMM,
      endMM=(travelled+segment)/total*strip.pathLengthMM;
    let from=startMM;
    while(from<endMM-1e-6){
      const period=strip.sourcePeriodMM,phase=((from%period)+period)%period,
        to=Math.min(endMM,from+period-phase),offset=(from-startMM)/(endMM-startMM)*segment,
        length=(to-from)/(endMM-startMM)*segment;
      ctx.save();ctx.translate(a[0]+Math.cos(angle)*offset,a[1]+Math.sin(angle)*offset);
      ctx.rotate(angle);
      ctx.drawImage(texture,clamp(phase/strip.sourceLengthMM*w,0,w-.001),0,
        Math.max(.001,Math.min(w-phase/strip.sourceLengthMM*w,
          (to-from)/strip.sourceLengthMM*w)),h,
        0,-band/2,length+.35,band);
      ctx.restore();from=to;
    }
    travelled+=segment;
  }
  return true;
}

// A tape strip is a ribbon, not a collection of rotated image stamps. Arc
// length controls the image coordinate, while adjacent mesh cells share the
// same edge vertices. This keeps the photographed motif at physical scale on
// both straight and curved strokes.
const lerp=(a,b,t)=>a+(b-a)*t;
function triangle(ctx,image,source,destination){
  const [a,b,c]=source,[p,q,r]=destination;
  const determinant=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
  if(Math.abs(determinant)<1e-7)return;
  const m00=((q[0]-p[0])*(c[1]-a[1])-(r[0]-p[0])*(b[1]-a[1]))/determinant;
  const m01=((q[1]-p[1])*(c[1]-a[1])-(r[1]-p[1])*(b[1]-a[1]))/determinant;
  const m10=((r[0]-p[0])*(b[0]-a[0])-(q[0]-p[0])*(c[0]-a[0]))/determinant;
  const m11=((r[1]-p[1])*(b[0]-a[0])-(q[1]-p[1])*(c[0]-a[0]))/determinant;
  ctx.save();ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.lineTo(...r);
  ctx.closePath();ctx.clip();
  ctx.transform(m00,m01,m10,m11,p[0]-m00*a[0]-m10*a[1],p[1]-m01*a[0]-m11*a[1]);
  ctx.drawImage(image,0,0);ctx.restore();
}
function capEdge(point,tangent,normal,band,style,depth,ending){
  const edge=[];
  for(let i=0;i<=8;i++){
    const across=i/8,side=1-2*across;
    let inset=style==='angled'?depth*across:
      style==='torn'?depth*(.25+.75*Math.abs(Math.sin((i*3+1)*1.47))):0;
    if(i===0||i===8)inset=style==='torn'?depth*.15:inset;
    edge.push([point[0]+normal[0]*side*band/2-tangent[0]*inset*(ending?1:-1),
      point[1]+normal[1]*side*band/2-tangent[1]*inset*(ending?1:-1)]);
  }
  return edge;
}
function paintStraightRibbon(ctx,strip,texture,start,end){
  const length=distance(start,end),band=strip.bandWidthScene;
  if(length<.01)return false;
  ctx.save();ctx.translate(...start);ctx.rotate(Math.atan2(end[1]-start[1],end[0]-start[0]));
  const depth=strip.capDepthMM*band/strip.physicalWidthMM,
    endCap=capEdge([length,0],[1,0],[0,-1],band,strip.endCap,depth,true),
    startCap=capEdge([0,0],[1,0],[0,-1],band,strip.startCap,depth,false);
  ctx.beginPath();ctx.moveTo(0,-band/2);ctx.lineTo(length,-band/2);
  for(const p of endCap.slice(1))ctx.lineTo(...p);
  ctx.lineTo(0,band/2);
  for(const p of startCap.slice(0,-1).reverse())ctx.lineTo(...p);
  ctx.closePath();ctx.clip();
  const sourceX=mm=>clamp(mm/strip.sourceLengthMM*texture.width,0,texture.width),
    draw=(from,to,sourceStart,sourceEnd)=>{
      const sx=sourceX(sourceStart),sw=sourceX(sourceEnd)-sx,
        dx=from/strip.pathLengthMM*length,dw=(to-from)/strip.pathLengthMM*length;
      if(sw<=0||dw<=0)return;
      if(strip.reverseTexture){ctx.save();ctx.translate(dx+dw,0);ctx.scale(-1,1);
        ctx.drawImage(texture,sx,0,sw,texture.height,0,-band/2,dw+.35,band);ctx.restore();}
      else ctx.drawImage(texture,sx,0,sw,texture.height,dx,-band/2,dw+.35,band);
    };
  const mode=strip.textureMode||(strip.repeatRangeMM?'repeat':'stretch');
  if(mode==='repeat'){
    const [rangeStart,rangeEnd]=strip.repeatRangeMM,period=rangeEnd-rangeStart;
    for(let from=0;from<strip.pathLengthMM-1e-5;){
      const phase=(from+strip.sourceOffsetMM)%period,
        to=Math.min(strip.pathLengthMM,from+period-phase);
      draw(from,to,rangeStart+phase,rangeStart+phase+to-from);
      if(to<=from+1e-9)break;from=to;
    }
  }else draw(0,strip.pathLengthMM,strip.sourceOffsetMM,
    strip.sourceOffsetMM+(mode==='stretch'?strip.sourceWindowMM:strip.pathLengthMM));
  ctx.restore();return true;
}
function paintRibbon(ctx,node,image){
  const strip=node.tapeStrip,texture=orientedImage(image,strip.axis,strip.flatCrop);
  const raw=strip.points.map(([u,v])=>[(u-.5)*node.width,(v-.5)*node.height]);
  if(raw.length<2||!texture.width||!texture.height)return false;
  if(raw.length===2)return paintStraightRibbon(ctx,strip,texture,raw[0],raw[1]);
  const rawLength=raw.slice(1).reduce((sum,p,i)=>sum+distance(raw[i],p),0);
  const band=strip.bandWidthScene,step=Math.max(3,band*.35,rawLength/256);
  const points=[raw[0]];
  for(let i=1;i<raw.length;i++){
    const a=raw[i-1],b=raw[i],count=Math.ceil(distance(a,b)/step);
    for(let j=1;j<=count;j++)points.push([lerp(a[0],b[0],j/count),lerp(a[1],b[1],j/count)]);
  }
  const length=[0];for(let i=1;i<points.length;i++)length[i]=length[i-1]+distance(points[i-1],points[i]);
  if(length.at(-1)<.01)return false;
  const normals=points.map((point,i)=>{
    const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],
      dx=next[0]-previous[0],dy=next[1]-previous[1],m=Math.hypot(dx,dy)||1;
    return [-dy/m,dx/m];
  });
  const sides=points.map((point,i)=>({
    left:[point[0]+normals[i][0]*band/2,point[1]+normals[i][1]*band/2],
    right:[point[0]-normals[i][0]*band/2,point[1]-normals[i][1]*band/2]}));
  const first=points[0],last=points.at(-1),n0=normals[0],n1=normals.at(-1),
    t0=[n0[1],-n0[0]],t1=[n1[1],-n1[0]],
    depth=strip.capDepthMM*band/strip.physicalWidthMM;
  const endCap=capEdge(last,t1,n1,band,strip.endCap,depth,true),
    startCap=capEdge(first,t0,n0,band,strip.startCap,depth,false);
  ctx.save();ctx.beginPath();ctx.moveTo(...sides[0].left);
  for(let i=1;i<sides.length;i++)ctx.lineTo(...sides[i].left);
  for(const p of endCap.slice(1))ctx.lineTo(...p);
  for(let i=sides.length-2;i>=0;i--)ctx.lineTo(...sides[i].right);
  for(const p of startCap.slice(0,-1).reverse())ctx.lineTo(...p);
  ctx.closePath();ctx.clip();
  const mode=strip.textureMode||(strip.repeatRangeMM?'repeat':'sample'),
    range=mode==='repeat'?strip.repeatRangeMM:null,
    period=range?range[1]-range[0]:0,
    sourceX=mm=>mm/strip.sourceLengthMM*texture.width;
  for(let i=1;i<points.length;i++){
    const prior=length[i-1]/length.at(-1)*strip.pathLengthMM,
      next=length[i]/length.at(-1)*strip.pathLengthMM;
    if(next-prior<1e-5)continue;
    let from=prior;
    while(from<next-1e-5){
      const phase=range?(from+strip.sourceOffsetMM)%period:from+strip.sourceOffsetMM,
        to=range?Math.min(next,from+period-phase):next,
        begin=range?range[0]+phase:mode==='stretch'?
          strip.sourceOffsetMM+from/strip.pathLengthMM*strip.sourceWindowMM:phase,
        finish=range?begin+to-from:mode==='stretch'?
          strip.sourceOffsetMM+to/strip.pathLengthMM*strip.sourceWindowMM:begin+to-from,
        u=(from-prior)/(next-prior),v=(to-prior)/(next-prior),
        p0=[lerp(sides[i-1].left[0],sides[i].left[0],u),lerp(sides[i-1].left[1],sides[i].left[1],u)],
        p1=[lerp(sides[i-1].left[0],sides[i].left[0],v),lerp(sides[i-1].left[1],sides[i].left[1],v)],
        p2=[lerp(sides[i-1].right[0],sides[i].right[0],v),lerp(sides[i-1].right[1],sides[i].right[1],v)],
        p3=[lerp(sides[i-1].right[0],sides[i].right[0],u),lerp(sides[i-1].right[1],sides[i].right[1],u)];
      const x0=sourceX(strip.reverseTexture?strip.sourceLengthMM-begin:begin),
        x1=sourceX(strip.reverseTexture?strip.sourceLengthMM-finish:finish),h=texture.height;
      triangle(ctx,texture,[[x0,0],[x1,0],[x0,h]],[p0,p1,p3]);
      triangle(ctx,texture,[[x1,0],[x1,h],[x0,h]],[p1,p2,p3]);
      if(to<=from+1e-9)break;
      from=to;
    }
  }
  ctx.restore();return true;
}
