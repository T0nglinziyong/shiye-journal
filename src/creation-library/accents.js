const motifs=['rings','spark','sprig','stitch','confetti','materials'];
const overlap=(a,b,pad=0)=>a[0]<b[0]+b[2]+pad&&a[0]+a[2]>b[0]-pad&&a[1]<b[1]+b[3]+pad&&a[1]+a[3]>b[1]-pad;
export function compileAccents(p,materials){
 const width=p.widthMm??48,height=p.heightMm??30,size=p.motifSizeMm??6,count=p.count??5,clearance=p.clearanceMm??1;
 if(!motifs.includes(p.motif))throw Error('未知点缀图案');
 if(!['corner','edge','arc'].includes(p.arrangement))throw Error('点缀排列须为 corner/edge/arc');
 if(!Number.isFinite(size)||size<1||size>30)throw Error('点缀单元尺寸为 1–30 mm');
 if(!Number.isInteger(count)||count<1||count>24)throw Error('点缀单元数量为 1–24');
 if(!Number.isFinite(clearance)||clearance<0||clearance>20)throw Error('避让间距为 0–20 mm');
 const protectedBoxes=p.protectedBoxes??[];
 if(!Array.isArray(protectedBoxes)||protectedBoxes.length>24||protectedBoxes.some(b=>!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[0]<0||b[1]<0||b[2]<=0||b[3]<=0||b[0]+b[2]>1||b[1]+b[3]>1))throw Error('保护区域须为本组内的比例框');
 const protectedMM=protectedBoxes.map(([x,y,w,h])=>[x*width,y*height,w*width,h*height]);
 if(p.positions!==undefined&&(!Array.isArray(p.positions)||!p.positions.length||p.positions.length>24||p.positions.some(a=>!Array.isArray(a)||a.length!==2||a.some(v=>!Number.isFinite(v)||v<0||v>1))))throw Error('点缀位置须为 1–24 个比例坐标');
 if(p.motif!=='materials'&&p.aliases)throw Error('数字点缀不接收实体素材');
 if(p.motif==='materials'&&(!p.aliases?.length||p.positions&&p.positions.length!==p.aliases.length))throw Error('实体点缀需要 aliases，指定 positions 时须一一对应');
 const n=p.motif==='materials'?p.aliases.length:p.positions?.length??count,colors=p.colors||['#596B53','#C49255'];
 const children=[],placed=[],skipped=[];
 for(let i=0;i<n;i++){
  const t=n===1?.5:i/(n-1),scale=p.motif==='materials'?1:[1,.65,.8][i%3];
  let w=size*scale,h=size*scale;
  if(p.motif==='sprig')h*=2;
  if(p.motif==='stitch'){w=size;h=size*.32;}
  let asset;
  if(p.motif==='materials'){
   asset=materials.find(a=>(a.alias||a.id)===p.aliases[i]);
   if(!asset)throw Error('素材不在授权范围：'+p.aliases[i]);
   w=Number(asset.physicalWidthMM??asset.widthMM);h=Number(asset.physicalHeightMM??asset.heightMM);
   if(![w,h].every(v=>Number.isFinite(v)&&v>0))throw Error('素材尺寸缺失');
  }
  const pad=(p.strokeWidthMm??.3)/2;
  const position=p.positions?.[i]||(p.arrangement==='edge'?[.08+.84*t,.5]:p.arrangement==='arc'?[.08+.84*t,.2+.6*Math.sin(Math.PI*t)]:t<.5?[.12,.12+1.52*t]:[.12+1.52*(t-.5),.12]);
  const marginX=w/2+pad+.01,marginY=h/2+pad+.01;
  const x=p.positions?position[0]*width:marginX+(width-2*marginX)*position[0],y=p.positions?position[1]*height:marginY+(height-2*marginY)*position[1],box=[x-w/2-pad,y-h/2-pad,w+2*pad,h+2*pad];
  const reason=box[0]<0||box[1]<0||box[0]+box[2]>width||box[1]+box[3]>height?'outside':protectedMM.some(b=>overlap(box,b,clearance))?'protected':placed.some(b=>overlap(box,b,clearance))?'occupied':null;
  if(reason){skipped.push({index:i,...(asset?{alias:p.aliases[i]}:{}),reason});continue;}
  const place={reference:'parent',at:[x,y],unit:'mm'},id=p.id+'-accent'+i,color=colors[i%colors.length];
  if(asset)children.push({op:'material.add',id,asset:p.aliases[i],place});
  else{
   let geometry,fill=null;
   if(p.motif==='rings')geometry={kind:'ellipse'};
   if(p.motif==='spark')geometry={kind:'star',options:{points:4,innerRatio:.18}};
   if(p.motif==='confetti'){geometry={kind:i%2?'ellipse':'rect'};fill=color;}
   if(p.motif==='stitch')geometry={kind:'path',viewBox:[0,0,100,100],paths:[{d:'M 0 50 L 100 50 M 15 0 L 15 100 M 50 0 L 50 100 M 85 0 L 85 100'}]};
   if(p.motif==='sprig')geometry={kind:'path',viewBox:[0,0,100,100],paths:[{d:'M 48 100 Q 65 50 48 0 M 51 22 Q 5 25 12 4 Q 40 3 51 22 M 55 40 Q 100 35 92 15 Q 65 19 55 40 M 55 62 Q 0 58 10 36 Q 43 40 55 62 M 53 80 Q 95 78 94 55 Q 68 56 53 80'}]};
   children.push({op:'graphic.add',id,geometry,place,size:{width:w,height:h,unit:'mm'},style:{fill,stroke:color,strokeWidthMm:p.strokeWidthMm??.3,opacity:p.opacity??1}});
  }
  placed.push(box);
 }
 if(!children.length)throw Error('点缀区域没有可用空间：请调整位置、范围或数量；实体素材不会自动缩小');
 return {width,height,children,skipped,notes:['点缀保留为独立可编辑图层；实体来源保持原尺寸且不复制。','保护框仅按提供的局部区域避让，不自动识别人脸、正文或页外对象；请看整页预览。',...(skipped.length?['已省略越界、相互遮挡或进入保护区域的单元，见 skipped；不会强行塞满。']:[])]};
}
