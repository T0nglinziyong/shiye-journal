import Panzoom from '@panzoom/panzoom';

// Panzoom owns transform/focal-point/pinch maths. This adapter only arbitrates
// navigation versus the application's object, ink and text editing gestures.
export function mountCanvasViewport(c,page){
  const {state,view,current}=c,host=page.parentElement,key=state.activeProject.id+':'+current().id;
  // Explicit margins let Panzoom account for the fitted page's centering in
  // its focal-point calculation; flex centering otherwise shifts a zoom.
  host.style.alignItems='flex-start';host.style.justifyContent='flex-start';
  page.style.marginLeft=Math.max(0,(host.clientWidth-page.clientWidth)/2)+'px';page.style.marginTop=Math.max(0,(host.clientHeight-page.clientHeight)/2)+'px';
  state.canvasViewports||=new Map();const saved=state.canvasViewports.get(key)||{x:0,y:0,scale:state.zoom};
  const zoom=Panzoom(page,{noBind:true,minScale:.4,maxScale:4,startScale:saved.scale,startX:saved.x,startY:saved.y,pinchAndPan:true,canvas:true,cursor:'',touchAction:'none',handleStartEvent:e=>e.preventDefault()});
  const points=new Map();let navigating=false,pinching=false,moved=false,timer=null,origin=null;
  const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
  const start=e=>{navigating=true;origin={x:e.clientX,y:e.clientY};zoom.handleDown(e);try{host.setPointerCapture(e.pointerId);}catch{}};
  const down=e=>{
    if(e.button>0||e.target.closest('.object-handle,.selected-object-actions,.canvas-inline-text'))return;
    if(e.pointerType==='touch'){
      points.set(e.pointerId,e);
      if(points.size>=2){clearTimeout(timer);view.cancelObjectGesture?.();view.cancelInkGesture?.();if(!navigating)start([...points.values()][0]);pinching=true;moved=true;start(e);view.navigationSuppressedUntil=Infinity;stop(e);return;}
    }
    const background=!e.target.closest('[data-object]');
    const readTouch=e.pointerType==='touch'&&(background&&['select','text'].includes(state.tool)||state.canvasTools?.pencil&&['pen','highlighter','eraser'].includes(state.tool));
    if(readTouch){moved=false;start(e);stop(e);}
    else if(background&&state.tool==='select'&&e.pointerType==='mouse'){moved=false;origin={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{view.cancelObjectGesture?.();start(e);moved=true;},250);}
  };
  const move=e=>{if(points.has(e.pointerId))points.set(e.pointerId,e);if(!navigating)return;if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>4)moved=true;zoom.handleMove(e);stop(e);};
  const up=e=>{clearTimeout(timer);timer=null;points.delete(e.pointerId);if(!navigating)return;zoom.handleUp(e);if(!points.size){navigating=false;pinching=false;view.navigationSuppressedUntil=moved?performance.now()+200:0;}else view.navigationSuppressedUntil=Infinity;stop(e);};
  const click=e=>{if(performance.now()<(view.navigationSuppressedUntil||0))stop(e);};
  const wheel=e=>{if(!e.ctrlKey)return;zoom.zoomWithWheel(e);e.stopImmediatePropagation();};
  const changed=e=>{const {x,y,scale}=e.detail;state.zoom=scale;state.canvasViewports.set(key,{x,y,scale});const fit=view.querySelector('[data-canvas-fit]');if(fit)fit.textContent='↖ 适合页面 '+Math.round(scale*100)+'%';};
  host.addEventListener('pointerdown',down,true);host.addEventListener('pointermove',move,true);host.addEventListener('pointerup',up,true);host.addEventListener('pointercancel',up,true);host.addEventListener('click',click,true);host.addEventListener('wheel',wheel,{passive:false,capture:true});page.addEventListener('panzoomchange',changed);
  const ensureVisible=()=>{const input=page.querySelector('.canvas-inline-text');if(!input)return;const viewport=window.visualViewport,bottom=(viewport?.offsetTop||0)+(viewport?.height||innerHeight)-24,r=input.getBoundingClientRect(),top=view.querySelector('.swift-editor-toolbar').getBoundingClientRect().bottom+16;const delta=r.top<top?top-r.top:r.bottom>bottom?bottom-r.bottom:0;if(delta)zoom.pan(zoom.getPan().x,zoom.getPan().y+delta/zoom.getScale(),{force:true});};
  window.visualViewport?.addEventListener('resize',ensureVisible);window.visualViewport?.addEventListener('scroll',ensureVisible);
  view.editorViewport={fit:()=>{zoom.reset({startX:0,startY:0,startScale:1,animate:false});},sync:()=>{if(Math.abs(zoom.getScale()-state.zoom)>.001)zoom.zoom(state.zoom,{animate:false});},ensureVisible};
  view.editorDispose=()=>{clearTimeout(timer);zoom.destroy();host.removeEventListener('pointerdown',down,true);host.removeEventListener('pointermove',move,true);host.removeEventListener('pointerup',up,true);host.removeEventListener('pointercancel',up,true);host.removeEventListener('click',click,true);host.removeEventListener('wheel',wheel,true);window.visualViewport?.removeEventListener('resize',ensureVisible);window.visualViewport?.removeEventListener('scroll',ensureVisible);view.editorViewport=null;view.cancelObjectGesture=null;view.cancelInkGesture=null;};
  return zoom;
}
