export function compileFilm(p,materials){
 const inset=p.frameInset??.12,holes=p.holesPerFrame??6,bend=p.bendMm??0,gap=p.gapMm??3;
 if(!Number.isFinite(inset)||inset<.02||inset>.25)throw Error('胶片边带比例为 0.02–0.25');
 if(!Number.isInteger(holes)||holes<2||holes>32)throw Error('每格齿孔数量为 2–32');
 if(!Number.isFinite(bend)||Math.abs(bend)>80)throw Error('胶片弯曲排布高度为 -80–80 毫米');
 const cells=p.aliases.map(alias=>{
  const asset=materials.find(a=>(a.alias||a.id)===alias);
  if(!asset)throw Error('素材不在授权范围：'+alias);
  const w=Number(asset.physicalWidthMM??asset.widthMM),h=Number(asset.physicalHeightMM??asset.heightMM);
  if(![w,h].every(n=>Number.isFinite(n)&&n>0))throw Error('素材尺寸缺失');
  return {alias,w:w/(1-2*inset),h:h/(1-2*inset)};
 });
 const span=cells.reduce((sum,c)=>sum+c.w,0)+gap*(cells.length-1);
 let cursor=0;
 for(const [i,c] of cells.entries()){
  const t=cells.length===1?.5:i/(cells.length-1),angle=cells.length===1?0:Math.atan(4*bend*(1-2*t)/span);
  c.rotation=angle*180/Math.PI;c.bw=Math.abs(c.w*Math.cos(angle))+Math.abs(c.h*Math.sin(angle));
  c.bh=Math.abs(c.w*Math.sin(angle))+Math.abs(c.h*Math.cos(angle));
  c.x=cursor+c.bw/2;c.y=4*bend*t*(1-t);cursor+=c.bw+gap;
 }
 const top=Math.min(...cells.map(c=>c.y-c.bh/2)),bottom=Math.max(...cells.map(c=>c.y+c.bh/2));
 const children=[];
 for(const [i,c] of cells.entries()){
  const place={reference:'parent',at:[c.x,c.y-top],unit:'mm',rotationDeg:c.rotation};
  children.push({op:'graphic.add',id:p.id+'-frame'+i,geometry:{kind:'filmFrame',options:{columns:1,count:holes,frameInset:inset}},place,size:{width:c.w,height:c.h,unit:'mm'},style:{fill:p.colors?.[0]||'#343A37',stroke:null}});
  children.push({op:'material.add',id:p.id+'-photo'+i,asset:c.alias,place:{...place}});
 }
 return {width:cursor-gap,height:bottom-top,children,notes:['数字胶片边框的照片窗与齿孔透明；不是新增的实体库存。','各照片保留实际尺寸和轮廓；bendMm 只改变排列位置与角度，不弯曲或裁切照片。','每格边框可单独修改 geometry.options；修改格数或边带后应重新检查与照片的对齐。']};
}
