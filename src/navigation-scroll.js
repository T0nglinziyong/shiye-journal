// Route roots are rebuilt on navigation. A saved window position may be
// clamped while the next route is still laying out its cards and images.
export function restoreRouteScroll(view,{top=0,left=0}={}){
  const target=Math.max(0,top),start=performance.now();
  if(!target){window.scrollTo(left,0);return ()=>{};}
  let frame=0,stopped=false,observer,settled=0;
  const stop=()=>{stopped=true;cancelAnimationFrame(frame);observer?.disconnect();
    window.removeEventListener('pointerdown',stop,true);
    window.removeEventListener('wheel',stop,true);
    window.removeEventListener('touchstart',stop,true);
  };
  const attempt=()=>{
    if(stopped)return;
    window.scrollTo(left,target);
    settled=Math.abs(window.scrollY-target)<2?settled+1:0;
    if(settled>=4||performance.now()-start>2500){stop();return;}
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;attempt();});
  };
  if(target>0){
    window.addEventListener('pointerdown',stop,true);
    window.addEventListener('wheel',stop,true);
    window.addEventListener('touchstart',stop,true);
    if(typeof ResizeObserver==='function'){
      observer=new ResizeObserver(attempt);observer.observe(view);
    }
  }
  attempt();
  return stop;
}
