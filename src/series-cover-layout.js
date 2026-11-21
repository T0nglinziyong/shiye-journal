// CSS preview and persisted Canvas thumbnail use the same normalized geometry.
export const SERIES_COVER_VERSION=4;
export const SERIES_COVER_SIZE={width:360,height:300};
export const seriesCoverModes=[['auto','自动：少量扇形，九件内整齐摆放，更多叠放'],['grid','整齐摆放（最多九件）'],['pile','自由叠放（不限件数）'],['fan','扇形叠放']];
export function seriesCoverMode(value){return seriesCoverModes.some(([id])=>id===value)?value:'auto';}
export function seriesCoverLayout(count,mode='auto'){
 const total=Math.max(0,Math.trunc(Number(count)||0)),choice=seriesCoverMode(mode),kind=choice==='auto'?(total<=3?'fan':total<=9?'grid':'pile'):choice;
 const n=kind==='grid'?Math.min(total,9):total;
 if(n===0)return {kind,slots:[]};
 if(n===1)return {kind,slots:[{x:.5,y:.5,w:.84,h:.88,rotation:0,z:1}]};
 if(kind==='fan')return {kind,slots:Array.from({length:n},(_,i)=>{
  const f=i/(n-1),rotation=(f-.5)*(n===2?16:n===3?24:36),center=Math.abs(f-.5);
  return {x:(n===2?.36:n===3?.30:.25)+f*(n===2?.28:n===3?.40:.50),y:.5+center*.05,w:n===2?.53:n===3?.46:.33,h:n<=3?.76:.68,rotation,z:Math.round(n-Math.abs(i-(n-1)/2))};
 })};
 if(kind==='pile'){
  // Spread every cutout over the whole cover. A small overlap retains the
  // collage feel, while each item keeps most of its own cell visible.
  const columns=Math.ceil(Math.sqrt(n*1.2)),rows=Math.ceil(n/columns);
  return {kind,slots:Array.from({length:n},(_,i)=>{
   const row=Math.floor(i/columns),itemsInRow=Math.min(columns,n-row*columns),col=i%columns;
   const stepX=.88/columns,stepY=.88/rows;
   const stagger=row%2?stepX*.08:0;
   const x=.5+(col-(itemsInRow-1)/2)*stepX+stagger;
   const y=.5+(row-(rows-1)/2)*stepY;
   return {x,y,w:Math.min(.96/columns,.84),h:Math.min(.96/rows,.88),rotation:((i*7)%13)-6,z:i+1};
  })};
 }
 const columns=n<=4?2:3,rows=Math.ceil(n/columns),w=.9/columns,h=.9/rows;
 return {kind,slots:Array.from({length:n},(_,i)=>{const row=Math.floor(i/columns),inRow=Math.min(columns,n-row*columns),col=i%columns;return {x:.5+(col-(inRow-1)/2)*(.94/columns),y:(row+.5)/rows,w,h,rotation:0,z:1};})};
}
export function paintSeriesCover(ctx,images,layout,{width=360,height=300}={}){
 ctx.clearRect(0,0,width,height);ctx.fillStyle='#FFFEFA';ctx.fillRect(0,0,width,height);
 layout.slots.map((slot,index)=>({slot,index})).sort((a,b)=>a.slot.z-b.slot.z).forEach(({slot,index})=>{
  const image=images[index];if(!image)return;const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;if(!(iw>0&&ih>0))return;
  const scale=Math.min(slot.w*width/iw,slot.h*height/ih),w=iw*scale,h=ih*scale;
  ctx.save();ctx.translate(slot.x*width,slot.y*height);ctx.rotate(slot.rotation*Math.PI/180);
  if(layout.kind==='fan'||layout.kind==='pile'){ctx.shadowColor='#263D3426';ctx.shadowBlur=5;ctx.shadowOffsetY=2;}
  ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();
 });
}
