// CSS preview and persisted Canvas thumbnail use the same normalized geometry.
export const SERIES_COVER_VERSION=2;
export const SERIES_COVER_SIZE={width:360,height:300};
export const seriesCoverModes=[['auto','自动：少量扇形，多件矩阵'],['fan','扇形叠放'],['grid','矩阵全览']];
export function seriesCoverMode(value){return seriesCoverModes.some(([id])=>id===value)?value:'auto';}
export function seriesCoverLayout(count,mode='auto'){
 const n=Math.min(5,Math.max(0,Math.trunc(count))),choice=seriesCoverMode(mode),kind=choice==='auto'?(n<=3?'fan':'grid'):choice;
 if(n===0)return {kind,slots:[]};
 if(n===1)return {kind,slots:[{x:.5,y:.5,w:.84,h:.88,rotation:0,z:1}]};
 if(kind==='fan')return {kind,slots:Array.from({length:n},(_,i)=>{
  const f=i/(n-1),rotation=(f-.5)*(n===2?16:n===3?24:36),center=Math.abs(f-.5);
  return {x:(n===2?.36:n===3?.30:.25)+f*(n===2?.28:n===3?.40:.50),y:.5+center*.05,w:n===2?.53:n===3?.46:.33,h:n<=3?.76:.68,rotation,z:n-Math.abs(i-(n-1)/2)};
 })};
 const columns=n<=4?2:3,rows=Math.ceil(n/columns),w=columns===2?.43:.28,h=rows===1?.80:.42;
 return {kind,slots:Array.from({length:n},(_,i)=>{const row=Math.floor(i/columns),inRow=Math.min(columns,n-row*columns),col=i%columns;return {x:.5+(col-(inRow-1)/2)*(columns===2?.48:.32),y:rows===1?.5:.26+row*.48,w,h,rotation:0,z:1};})};
}
export function paintSeriesCover(ctx,images,layout,{width=360,height=300}={}){
 ctx.clearRect(0,0,width,height);ctx.fillStyle='#FFFEFA';ctx.fillRect(0,0,width,height);
 layout.slots.map((slot,index)=>({slot,index})).sort((a,b)=>a.slot.z-b.slot.z).forEach(({slot,index})=>{
  const image=images[index];if(!image)return;const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;if(!(iw>0&&ih>0))return;
  const scale=Math.min(slot.w*width/iw,slot.h*height/ih),w=iw*scale,h=ih*scale;
  ctx.save();ctx.translate(slot.x*width,slot.y*height);ctx.rotate(slot.rotation*Math.PI/180);
  if(layout.kind==='fan'){ctx.shadowColor='#263D3426';ctx.shadowBlur=5;ctx.shadowOffsetY=2;}
  ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();
 });
}
