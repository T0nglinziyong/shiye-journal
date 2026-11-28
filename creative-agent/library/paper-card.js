// Editable paper cut from a flat colour: the contour and punched holes are
// one even-odd vector path, so the page beneath remains genuinely visible.
const round=n=>Number(n.toFixed(3));
const noise=(seed,index)=>{
 let x=(Math.imul(seed,index+1)^0x9e3779b9)>>>0;
 x=Math.imul(x^(x>>>16),0x85ebca6b)>>>0;
 return ((x^(x>>>13))>>>0)/4294967295*2-1;
};
const point=([x,y],first)=>`${first?'M':'L'}${round(x)} ${round(y)}`;

export function paperCardPath({widthMm:w,heightMm:h,tearSides=[],roughnessMm=1.2,periodMm=4,holeSide='none',holeCount=0,holeRadiusMm=1.5,seed=17}){
 if(!(w>=12&&w<=500&&h>=12&&h<=500))throw Error('底纸宽高须在 12–500 mm；更窄的纸条用 graphic.add');
 if(!Array.isArray(tearSides)||tearSides.some(side=>!['top','right','bottom','left'].includes(side))||new Set(tearSides).size!==tearSides.length)throw Error('撕边须为不重复的 top/right/bottom/left');
 if(!Number.isFinite(roughnessMm)||roughnessMm<0||roughnessMm>Math.min(w,h)*.1)throw Error('撕边起伏超出纸片尺寸');
 if(!Number.isFinite(periodMm)||periodMm<1||periodMm>30)throw Error('撕边周期须在 1–30 mm');
 if(!['none','top','right','bottom','left'].includes(holeSide))throw Error('打孔边无效');
 if(!Number.isInteger(holeCount)||holeCount<0||holeCount>12||holeCount>0&&holeSide==='none')throw Error('打孔数量与边不匹配');
 if(!Number.isFinite(holeRadiusMm)||holeRadiusMm<.5||holeRadiusMm>5)throw Error('孔半径须在 0.5–5 mm');
 if(!Number.isInteger(seed)||seed<1||seed>2147483646)throw Error('撕边种子无效');
 const edgeInset=Math.max(roughnessMm*1.3,holeCount?holeRadiusMm*2.3:0,.6);
 if(edgeInset*2>=Math.min(w,h)*.55)throw Error('撕边或孔洞与纸片尺寸不匹配');
 const sides=[
  {name:'top',from:[edgeInset,edgeInset],to:[w-edgeInset,edgeInset],normal:[0,1]},
  {name:'right',from:[w-edgeInset,edgeInset],to:[w-edgeInset,h-edgeInset],normal:[-1,0]},
  {name:'bottom',from:[w-edgeInset,h-edgeInset],to:[edgeInset,h-edgeInset],normal:[0,-1]},
  {name:'left',from:[edgeInset,h-edgeInset],to:[edgeInset,edgeInset],normal:[1,0]}
 ];
 const points=[];
 for(const [sideIndex,side] of sides.entries()){
  const length=Math.hypot(side.to[0]-side.from[0],side.to[1]-side.from[1]);
  const segments=tearSides.includes(side.name)?Math.max(4,Math.ceil(length/periodMm)):1;
  for(let i=0;i<=segments;i++){
   if(sideIndex&&i===0)continue;
   const t=i/segments,offset=i===0||i===segments?0:roughnessMm*(noise(seed,sideIndex*97+i)*.68+Math.sin(i*2.43+seed)*.32);
   points.push([side.from[0]+(side.to[0]-side.from[0])*t+side.normal[0]*offset,side.from[1]+(side.to[1]-side.from[1])*t+side.normal[1]*offset]);
  }
 }
 let d=points.map((p,i)=>point(p,i===0)).join(' ')+' Z';
 if(holeCount){
  const span=['left','right'].includes(holeSide)?h-2*edgeInset:w-2*edgeInset;
  if(span/(holeCount+1)<holeRadiusMm*2.8)throw Error('孔洞间距不足；减小 holeCount 或 holeRadiusMm，普通纸片用 holeCount:0 与 holeSide:none');
  for(let i=1;i<=holeCount;i++){
   // Keep each punched circle wholly inside the paper silhouette. A circle
   // crossing the edge looks like an accidental notch instead of a hole.
   const along=edgeInset+span*i/(holeCount+1),inset=holeRadiusMm*1.65;
   const x=holeSide==='left'?edgeInset+inset:holeSide==='right'?w-edgeInset-inset:along;
   const y=holeSide==='top'?edgeInset+inset:holeSide==='bottom'?h-edgeInset-inset:along;
   const r=holeRadiusMm,vertices=Array.from({length:16},(_,j)=>[x+Math.cos(j*Math.PI/8)*r,y+Math.sin(j*Math.PI/8)*r]);
   d+=' '+vertices.map((p,j)=>point(p,j===0)).join(' ')+' Z';
  }
 }
 return {kind:'path',viewBox:[0,0,w,h],paths:[{d,fillRule:'evenodd'}]};
}
