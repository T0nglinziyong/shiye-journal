// Shared normalized layout for live DOM thumbnails and cached canvas covers.
// Never uses artwork pixels to decide inventory or changes the original image.
export const SERIES_COVER_VERSION=2;
export const SERIES_COVER_WIDTH=480;
export const SERIES_COVER_HEIGHT=400;
export const SERIES_AUTO_COVER_COUNT=4;
export const seriesCoverLayouts=Object.freeze([['auto','自动组合'],['fan','扇形叠放'],['grid','清晰矩阵']].map(Object.freeze));
export const validSeriesCoverLayout=value=>seriesCoverLayouts.some(([id])=>id===value);
export const resolvedSeriesCoverLayout=value=>validSeriesCoverLayout(value)?value:'auto';
const slot=(index,x,y,w,h,angle=0)=>({index,x,y,w,h,angle});
export function seriesCoverLayout(count,preference='auto'){
 if(!Number.isInteger(count)||count<0||count>5)throw Error('封面仅支持 0–5 件素材');
 if(!count)return {kind:'empty',slots:[]};
 if(count===1)return {kind:'single',slots:[slot(0,52,34,376,332)]};
 const mode=resolvedSeriesCoverLayout(preference);
 if(mode==='fan'||mode==='auto'&&count===3){
  // First selected material is the front/central item. Paint back to front.
  if(count===2)return {kind:'fan',slots:[slot(1,70,75,210,270,-10),slot(0,205,48,205,288,9)]};
  if(count===3)return {kind:'fan',slots:[slot(1,38,88,208,272,-11),slot(2,234,88,208,272,11),slot(0,133,48,214,294)]};
  const others=Array.from({length:count-1},(_,i)=>{const t=i/(count-2);return slot(i+1,39+t*250,98-Math.sin(t*Math.PI)*28,152,244,-15+t*30);});
  return {kind:'fan',slots:[...others,slot(0,143,47,194,286)]};
 }
 if(count===2)return {kind:'pair',slots:[slot(0,28,38,204,324),slot(1,248,38,204,324)]};
 if(count===3)return {kind:'grid',slots:[slot(0,28,28,242,344),slot(1,286,28,166,164),slot(2,286,208,166,164)]};
 if(count===4)return {kind:'grid',slots:[slot(0,28,28,204,164),slot(1,248,28,204,164),slot(2,28,208,204,164),slot(3,248,208,204,164)]};
 return {kind:'grid',slots:[slot(0,24,28,206,344),slot(1,246,28,97,164),slot(2,359,28,97,164),slot(3,246,208,97,164),slot(4,359,208,97,164)]};
}
export function containCoverImage(width,height,slot){
 if(!(width>0&&height>0&&Number.isFinite(width)&&Number.isFinite(height)))return null;
 const scale=Math.min(slot.w/width,slot.h/height),w=width*scale,h=height*scale;
 return {x:slot.x+(slot.w-w)/2,y:slot.y+(slot.h-h)/2,w,h};
}
export function drawSeriesCover(ctx,images,preference='auto'){
 ctx.fillStyle='#fffefa';ctx.fillRect(0,0,SERIES_COVER_WIDTH,SERIES_COVER_HEIGHT);
 const layout=seriesCoverLayout(images.length,preference);
 for(const slot of layout.slots){
  const image=images[slot.index],size=containCoverImage(image.naturalWidth||image.width,image.naturalHeight||image.height,slot);if(!size)continue;
  ctx.save();ctx.translate(slot.x+slot.w/2,slot.y+slot.h/2);ctx.rotate(slot.angle*Math.PI/180);
  ctx.shadowColor='rgba(40,45,34,.13)';ctx.shadowBlur=4;ctx.shadowOffsetY=3;
  ctx.drawImage(image,size.x-slot.x-slot.w/2,size.y-slot.y-slot.h/2,size.w,size.h);ctx.restore();
 }
 return layout;
}
