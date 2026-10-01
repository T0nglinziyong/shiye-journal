// Geometry is shared by live canvas objects, library covers and PNG/PDF export.
// Coordinates are local to the already calibrated rectangular source crop.
export function materialMaskPoints(mask){
  if(!mask)return null;
  if(mask.shape==='polygon'){
    if(!Array.isArray(mask.points)||mask.points.length<3||mask.points.length>256||mask.points.some(point=>!Array.isArray(point)||point.length!==2||point.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('不规则裁剪的轮廓无效');
    return mask.points;
  }
  if(mask.shape==='rounded'){
    const r=mask.radius??.1,points=[];
    if(!Number.isFinite(r)||r<.005||r>.5)throw Error('圆角半径无效');
    for(const [cx,cy,start] of [[1-r,r,-Math.PI/2],[1-r,1-r,0],[r,1-r,Math.PI/2],[r,r,Math.PI]])
      for(let i=0;i<=8;i++){const angle=start+i*Math.PI/16;points.push([cx+r*Math.cos(angle),cy+r*Math.sin(angle)]);}
    return points;
  }
  if(mask.shape==='scallop'){
    const depth=mask.depth??.05,waves=mask.waves??8,count=waves*12,edge=t=>depth*(1-Math.cos(2*Math.PI*waves*t))/2;
    if(!Number.isFinite(depth)||depth<.005||depth>.2||!Number.isInteger(waves)||waves<2||waves>20)throw Error('花边参数无效');
    return [
      ...Array.from({length:count+1},(_,i)=>{const t=i/count;return [t,edge(t)];}),
      ...Array.from({length:count+1},(_,i)=>{const t=i/count;return [1-edge(t),t];}),
      ...Array.from({length:count+1},(_,i)=>{const t=i/count;return [1-t,1-edge(t)];}),
      ...Array.from({length:count+1},(_,i)=>{const t=i/count;return [edge(t),1-t];})
    ];
  }
  throw Error('不支持的素材边缘形状');
}
export function materialMaskCSS(item){
  const points=materialMaskPoints(item?.materialMask);return points?.length?`clip-path:polygon(${points.map(([x,y])=>`${(x*100).toFixed(3)}% ${(y*100).toFixed(3)}%`).join(',')});`:'';
}
export function clipMaterial(ctx,item){
  const points=materialMaskPoints(item?.materialMask);if(!points?.length)return;
  ctx.beginPath();points.forEach(([x,y],index)=>index?ctx.lineTo((x-.5)*item.width,(y-.5)*item.height):ctx.moveTo((x-.5)*item.width,(y-.5)*item.height));ctx.closePath();ctx.clip();
}
