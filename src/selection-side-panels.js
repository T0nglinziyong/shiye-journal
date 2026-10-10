// A true sibling popover for selection actions. The parent "更多操作"
// remains visible and clickable; both surfaces belong to one Swift popover,
// so outside click, Escape, account changes and route changes close both.
let nextSideID=0;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function selectionSideGeometry({viewportWidth,viewportHeight,anchor,menu,panelHeight=320}){
  const margin=12,gap=8;
  const available=Math.max(240,viewportWidth-margin*2-gap);
  const split=viewportWidth<600;
  const parentWidth=split
    ?clamp(Math.floor(available*.46),Math.min(120,available*.45),Math.max(120,available-136))
    :Math.min(menu.width,available-170);
  const preferredPanelWidth=split?available-parentWidth:Math.min(286,available-parentWidth);
  let parentLeft,panelLeft,panelWidth=preferredPanelWidth;
  const leftSpace=menu.left-margin-gap,rightSpace=viewportWidth-margin-menu.right-gap;
  if(!split&&rightSpace>=panelWidth){
    parentLeft=menu.left;panelLeft=menu.right+gap;
  }else if(!split&&leftSpace>=panelWidth){
    parentLeft=menu.left;panelLeft=menu.left-gap-panelWidth;
  }else{
    // Shift the two panes as ONE group instead of stacking the child over
    // its parent. Works even on a 320px mobile viewport.
    parentLeft=split?margin:clamp(menu.left,margin,viewportWidth-margin-parentWidth-gap-panelWidth);
    panelLeft=parentLeft+parentWidth+gap;
  }
  const bottom=Math.max(margin+120,Math.min(viewportHeight-margin,anchor.top-gap));
  const wanted=Math.max(menu.height,Math.min(360,panelHeight));
  const top=clamp(menu.top,margin,Math.max(margin,bottom-wanted));
  const maxHeight=Math.max(100,bottom-top);
  return {parentLeft,parentWidth,panelLeft,panelWidth,top,maxHeight,split};
}

export function createSelectionSidePanels(menu,{makeAction}){
  if(typeof makeAction!=='function')throw Error('侧拉操作缺少按钮生成器');
  const initialWidth=menu.surface.style.width;
  let active=null;
  function close({reposition=true}={}){
    if(!active)return;
    const previous=active;active=null;
    previous.trigger.setAttribute('aria-expanded','false');
    previous.trigger.removeAttribute('aria-controls');
    previous.remove?.();
    menu.surface.classList.remove('selection-side-open');
    menu.surface.style.width=initialWidth;
    if(reposition&&menu.surface.isConnected)menu.position();
  }
  function open(trigger,title,options,{pinned=0}={}){
    if(active?.trigger===trigger){close();return null;}
    close({reposition:false});
    const panel=document.createElement('section');
    const id='shiye-selection-side-'+(++nextSideID);
    panel.id=id;panel.className='selection-submenu selection-side-panel';
    panel.setAttribute('role','menu');panel.setAttribute('aria-label',title);
    const header=document.createElement('div');header.className='selection-side-heading';
    header.textContent=title;panel.append(header);
    const list=document.createElement('div');list.className='selection-side-list';panel.append(list);
    for(const [index,[label,run]] of options.entries()){
      const button=makeAction(label,async()=>{await run();});
      if(index<pinned)button.classList.add('selection-submenu-pinned');
      list.append(button);
    }
    trigger.setAttribute('aria-haspopup','menu');
    trigger.setAttribute('aria-expanded','true');
    trigger.setAttribute('aria-controls',id);
    menu.surface.classList.add('selection-side-open');
    const current={trigger,panel,remove:null};active=current;
    const position=()=>{
      if(active!==current||!menu.surface.isConnected)return;
      const menuRect=menu.surface.getBoundingClientRect(),anchorRect=menu.anchor.getBoundingClientRect();
      const geometry=selectionSideGeometry({
        viewportWidth:innerWidth,viewportHeight:innerHeight,
        anchor:anchorRect,menu:menuRect,panelHeight:panel.scrollHeight
      });
      // Keep stable dimensions to avoid ResizeObserver feedback loops.
      const parentWidth=Math.round(geometry.parentWidth)+'px';
      if(menu.surface.style.width!==parentWidth)menu.surface.style.width=parentWidth;
      const parentLeft=Math.round(geometry.parentLeft)+'px',top=Math.round(geometry.top)+'px';
      if(menu.surface.style.left!==parentLeft)menu.surface.style.left=parentLeft;
      if(menu.surface.style.top!==top)menu.surface.style.top=top;
      const values={left:Math.round(geometry.panelLeft)+'px',top,
        width:Math.round(geometry.panelWidth)+'px',maxHeight:Math.round(geometry.maxHeight)+'px'};
      for(const [key,value] of Object.entries(values))if(panel.style[key]!==value)panel.style[key]=value;
    };
    current.remove=menu.addSurface(panel,position);
    queueMicrotask(()=>{if(active===current&&panel.isConnected)
      panel.querySelector('button:not(:disabled)')?.focus({preventScroll:true});});
    return panel;
  }
  return {open,close};
}
