export function bindLongPress(node,onHold,enabled=()=>true){
  let timer=null,start=null,consumed=false;
  const cancel=()=>{clearTimeout(timer);timer=null;};
  node.addEventListener('pointerdown',e=>{cancel();consumed=false;if(!enabled()||e.button>0||e.isPrimary===false)return;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{timer=null;consumed=true;onHold();},500);});
  node.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)cancel();});
  for(const event of ['pointerup','pointercancel','pointerleave'])node.addEventListener(event,cancel);
  node.addEventListener('click',e=>{if(consumed){consumed=false;e.preventDefault();e.stopImmediatePropagation();}},true);
  node.addEventListener('contextmenu',e=>{if(!enabled())return;e.preventDefault();cancel();if(!consumed){consumed=true;onHold();}});
  node.addEventListener('keydown',e=>{if(enabled()&&(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')){e.preventDefault();onHold();}});
}
