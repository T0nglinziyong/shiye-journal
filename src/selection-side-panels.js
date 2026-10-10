// Sibling choices for the fixed "更多操作" popover. The parent is sized
// and positioned BEFORE it first appears. Opening/closing a child never
// changes the parent's width, shape, left or top.
// Both surfaces use the same popover lifecycle (outside click / Escape).
let nextSideID=0;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const MARGIN=12, GAP=8;

// On a 320px phone a 245px parent leaves no usable space for a child.
// Choose a compact but readable size FROM THE FIRST OPEN, not on expansion.
export function selectionMenuWidth(viewportWidth){
  return Math.min(245,Math.max(132,Math.floor((viewportWidth-32)*.46)));
}

const usableSideMinimum=(viewportWidth,parentWidth)=>
  Math.min(viewportWidth<600?170:240,
    Math.max(0,viewportWidth-2*MARGIN-GAP-parentWidth));

// Called during the parent popover's normal initial placement and resizes,
// NEVER by a child click. Keep the natural left whenever the right or left
// has enough space, in precisely that order; otherwise reserve space by
// positioning the parent left from the beginning.
export function reserveSelectionMenuSpace({left,width,viewportWidth}){
  const right=viewportWidth-MARGIN-(left+width+GAP);
  const leftAvailable=left-MARGIN-GAP;
  const minimum=usableSideMinimum(viewportWidth,width);
  return {left:right>=minimum||leftAvailable>=minimum
    ?left:MARGIN,shifted:right<minimum&&leftAvailable<minimum};
}
export function selectionMorePopoverOptions(){
  return {title:'更多操作',menu:true,width:selectionMenuWidth,
    adjustPosition:reserveSelectionMenuSpace};
}

export function selectionSideGeometry({viewportWidth,viewportHeight,menu,panelHeight=320}){
  const rightAvailable=Math.max(0,viewportWidth-MARGIN-menu.right-GAP);
  const leftAvailable=Math.max(0,menu.left-MARGIN-GAP);
  const minimum=usableSideMinimum(viewportWidth,menu.width);
  const desired=Math.min(286,Math.max(0,viewportWidth-2*MARGIN-GAP-menu.width));
  // Right -> left, with no parent translation while the child opens.
  const side=rightAvailable>=minimum||leftAvailable<minimum?'right':'left';
  const space=side==='right'?rightAvailable:leftAvailable;
  const panelWidth=Math.min(desired,space);
  const panelLeft=side==='right'?menu.right+GAP:menu.left-GAP-panelWidth;
  // Only the child may move vertically if its content is taller than the
  // remaining viewport; the parent retains its original coordinates.
  const wanted=Math.min(360,Math.max(140,panelHeight));
  const top=clamp(menu.top,MARGIN,Math.max(MARGIN,viewportHeight-MARGIN-wanted));
  const maxHeight=Math.max(100,viewportHeight-MARGIN-top);
  return {parentLeft:menu.left,parentWidth:menu.width,
    panelLeft,panelWidth,top,maxHeight,side};
}

export function createSelectionSidePanels(menu,{makeAction,anchor}){
  if(typeof makeAction!=='function'||!anchor)throw Error('侧拉操作缺少按钮生成器或锚点');
  let active=null;
  function close(){
    if(!active)return;
    const previous=active;active=null;
    previous.trigger.setAttribute('aria-expanded','false');
    previous.trigger.removeAttribute('aria-controls');
    previous.remove?.();
    menu.surface.classList.remove('selection-side-open');
  }
  function open(trigger,title,options,{pinned=0}={}){
    if(active?.trigger===trigger){close();return null;}
    close();
    const panel=document.createElement('section'),id='shiye-selection-side-'+(++nextSideID);
    panel.id=id;panel.className='selection-submenu selection-side-panel';
    panel.setAttribute('role','menu');panel.setAttribute('aria-label',title);
    const header=document.createElement('div');header.className='selection-side-heading';
    header.textContent=title;panel.append(header);
    const pinnedList=document.createElement('div');pinnedList.className='selection-side-pinned';
    const list=document.createElement('div');list.className='selection-side-list';
    if(pinned)panel.append(pinnedList);
    panel.append(list);
    for(const [index,[label,run]] of options.entries()){
      const button=makeAction(label,async()=>{await run();});
      if(index<pinned){button.classList.add('selection-submenu-pinned');pinnedList.append(button);}
      else list.append(button);
    }
    trigger.setAttribute('aria-haspopup','menu');
    trigger.setAttribute('aria-expanded','true');
    trigger.setAttribute('aria-controls',id);
    menu.surface.classList.add('selection-side-open');
    const current={trigger,panel,remove:null};active=current;
    const position=()=>{
      if(active!==current||!menu.surface.isConnected)return;
      const measured=menu.surface.getBoundingClientRect();
      const geometry=selectionSideGeometry({
        viewportWidth:innerWidth,viewportHeight:innerHeight,
        menu:{left:measured.left,right:measured.right,top:measured.top,
          width:measured.width,height:measured.height},
        panelHeight:panel.scrollHeight
      });
      const values={left:Math.round(geometry.panelLeft)+'px',
        top:Math.round(geometry.top)+'px',
        width:Math.round(geometry.panelWidth)+'px',
        maxHeight:Math.round(geometry.maxHeight)+'px'};
      for(const [key,value] of Object.entries(values))
        if(panel.style[key]!==value)panel.style[key]=value;
    };
    current.remove=menu.addSurface(panel,position);
    queueMicrotask(()=>{if(active===current&&panel.isConnected)
      panel.querySelector('button:not(:disabled)')?.focus({preventScroll:true});});
    return panel;
  }
  return {open,close};
}
