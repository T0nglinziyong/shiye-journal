// Shared GoodNotes-style object controls. All values are in one coordinate
// system (screen pixels or canvas units); no image-recognition code is involved.
const radians=degrees=>degrees*Math.PI/180;
const length=v=>Math.hypot(v.x,v.y);
export function transformSelectedFrame(frame,handle,from,to,{minWidth=4,minHeight=4,maxWidth=Infinity,maxHeight=Infinity}={}){
  const a=radians(frame.rotation||0),c=Math.cos(a),s=Math.sin(a);
  const cx=frame.x+frame.width/2,cy=frame.y+frame.height/2;
  const dx=to.x-from.x,dy=to.y-from.y;
  if(handle==='corner'){
    const start={x:from.x-cx,y:from.y-cy},end={x:to.x-cx,y:to.y-cy};
    const factor=length(start)>1e-5?length(end)/length(start):1;
    const width=Math.max(minWidth,Math.min(maxWidth,frame.width*factor));
    const height=Math.max(minHeight,Math.min(maxHeight,frame.height*factor));
    const angle=Math.atan2(end.y,end.x)-Math.atan2(start.y,start.x);
    const rotation=(frame.rotation||0)+Math.atan2(Math.sin(angle),Math.cos(angle))*180/Math.PI;
    return {x:cx-width/2,y:cy-height/2,width,height,rotation};
  }
  if(handle==='right'){
    const delta=dx*c+dy*s;
    const width=Math.max(minWidth,Math.min(maxWidth,frame.width+delta));
    const shift=(width-frame.width)/2;
    return {x:frame.x+shift*c-shift,y:frame.y+shift*s,width,height:frame.height,rotation:frame.rotation||0};
  }
  if(handle==='top'){
    const delta=-dx*s+dy*c;
    const height=Math.max(minHeight,Math.min(maxHeight,frame.height-delta));
    const shift=(frame.height-height)/2;
    return {x:frame.x-shift*s,y:frame.y+shift*c+shift,width:frame.width,height,rotation:frame.rotation||0};
  }
  return {...frame};
}
export const isObjectDeleteKey=event=>
  (event.key==='Delete'||event.key==='Backspace')&&!event.repeat&&
  !event.altKey&&!event.ctrlKey&&!event.metaKey&&
  !event.isComposing&&!event.target?.closest?.('input,textarea,select,[contenteditable], [role="textbox"]');
