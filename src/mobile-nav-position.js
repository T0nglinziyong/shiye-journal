export function mobileNavGap({viewportHeight,navBottom,appliedGap=0,focusedEditor=false}){
  if(focusedEditor||!Number.isFinite(viewportHeight)||!Number.isFinite(navBottom)||
    navBottom-appliedGap<viewportHeight*.45)return 0;
  const measured=Math.max(0,viewportHeight-(navBottom-appliedGap));
  return measured>40?Math.min(Math.round(measured),Math.round(viewportHeight*.6)):0;
}

export function keepMobileNavAtScreenBottom(){
  const nav=document.querySelector('body > .main-nav');
  if(!nav)return ()=>{};
  const viewport=window.visualViewport;
  let appliedGap=0,frame=0;
  const update=()=>{
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      const editor=document.activeElement?.matches('input, textarea, select, [contenteditable], [contenteditable="true"]');
      appliedGap=mobileNavGap({viewportHeight:window.innerHeight,navBottom:nav.getBoundingClientRect().bottom,
        appliedGap,focusedEditor:editor});
      nav.style.setProperty('--shiye-mobile-nav-gap',`${appliedGap}px`);
    });
  };
  for(const event of ['resize','scroll','pageshow','focusin','focusout'])window.addEventListener(event,update,{passive:true});
  viewport?.addEventListener('resize',update,{passive:true});
  viewport?.addEventListener('scroll',update,{passive:true});
  update();
  return ()=>{
    cancelAnimationFrame(frame);
    for(const event of ['resize','scroll','pageshow','focusin','focusout'])window.removeEventListener(event,update);
    viewport?.removeEventListener('resize',update);
    viewport?.removeEventListener('scroll',update);
    nav.style.removeProperty('--shiye-mobile-nav-gap');
  };
}
