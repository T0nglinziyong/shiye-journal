// The Fabric canvas is scaled by its surrounding React viewport. Fabric's
// cached document offset can lag behind mobile page scrolling, so derive
// hit-test coordinates from the canvas's current screen rectangle.
export function fabricPointer(canvas,event){
  const contact=event.changedTouches?.[0]||event;
  const rect=canvas.upperCanvasEl.getBoundingClientRect();
  const viewport={
    x:(contact.clientX-rect.left)*canvas.width/rect.width,
    y:(contact.clientY-rect.top)*canvas.height/rect.height
  };
  const [a,b,c,d,e,f]=canvas.viewportTransform,det=a*d-b*c;
  if(!Number.isFinite(viewport.x)||!Number.isFinite(viewport.y)||!Number.isFinite(det)||
    Math.abs(det)<1e-9)throw Error('画布坐标暂不可用');
  const scene={x:(d*(viewport.x-e)-c*(viewport.y-f))/det,
    y:(-b*(viewport.x-e)+a*(viewport.y-f))/det};
  return {viewport,scene};
}

// Fabric's built-in pointer calculation mixes a document offset with a
// viewport coordinate on some mobile scroll layouts. Keep its event pipeline
// and transform handling, while supplying coordinates from the live rectangle.
export function installFabricPointer(canvas,Point){
  canvas._getPointerImpl=(event,fromViewport=false)=>{
    const point=fabricPointer(canvas,event);
    const {x,y}=fromViewport?point.viewport:point.scene;
    return new Point(x,y);
  };
}
