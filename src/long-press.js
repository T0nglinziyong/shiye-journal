export function bindLongPress(node,onHold,enabled=()=>true,{delay=450}={}){
  let timer=null,start=null,consumed=false;
  const cancel=()=>{clearTimeout(timer);timer=null;};
  const hold=()=>{cancel();if(!start||consumed||!enabled())return;consumed=true;onHold();};
  node.addEventListener('pointerdown',e=>{cancel();start=null;consumed=false;if(!enabled()||e.button>0||e.isPrimary===false)return;start={x:e.clientX,y:e.clientY,time:performance.now(),slop:e.pointerType==='touch'?28:12,id:e.pointerId};timer=setTimeout(hold,delay);});
  // Movement cancels only the hold. If the browser still delivers a click,
  // keep the ordinary card action: a slightly moving tap must open details.
  node.addEventListener('pointermove',e=>{if(start&&e.pointerId===start.id&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>start.slop){cancel();start=null;}});
  // A busy render can delay the timer past pointerup. Decide using elapsed time
  // as well; otherwise the ensuing click incorrectly opens the canvas.
  node.addEventListener('pointerup',e=>{if(start&&e.pointerId===start.id&&performance.now()-start.time>=delay)hold();cancel();start=null;});
  for(const event of ['pointercancel','pointerleave'])node.addEventListener(event,()=>{cancel();start=null;});
  node.addEventListener('click',e=>{if(consumed){consumed=false;e.preventDefault();e.stopImmediatePropagation();}},true);
  node.addEventListener('contextmenu',e=>{if(!enabled())return;e.preventDefault();cancel();if(!consumed){consumed=true;onHold();}});
  node.addEventListener('keydown',e=>{if(enabled()&&(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')){e.preventDefault();onHold();}});
}
