// VisualViewport includes keyboard/browser chrome changes on iOS. Keep app
// navigation in document coordinates instead of nesting fixed UI in a sticky
// header. Measurements are applied directly, without rerendering the route.
export function shellViewportRect(viewport,windowLike){
 const top=Math.max(0,Number.isFinite(viewport?.pageTop)?viewport.pageTop:Number(windowLike.scrollY)||0);
 const height=Math.max(0,Number(viewport?.height) || Number(windowLike.innerHeight) || 0);
 return {top,bottom:top+height};
}
export function observeShellViewport(win,root){
 let frame=0;
 const paint=()=>{frame=0;const rect=shellViewportRect(win.visualViewport,win);
   root.style.setProperty('--shell-visible-top',rect.top+'px');
   root.style.setProperty('--shell-visible-bottom',rect.bottom+'px');};
 const update=()=>{if(!frame)frame=win.requestAnimationFrame(paint);};
 const events=[[win,'resize'],[win,'scroll'],[win,'pageshow'],
   [win.visualViewport,'resize'],[win.visualViewport,'scroll']];
 for(const [target,type] of events)target?.addEventListener(type,update,{passive:true});
 paint();
 return ()=>{if(frame)win.cancelAnimationFrame(frame);
   for(const [target,type] of events)target?.removeEventListener(type,update);
   root.style.removeProperty('--shell-visible-top');root.style.removeProperty('--shell-visible-bottom');};
}
