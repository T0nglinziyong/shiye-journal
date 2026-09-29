let active=null;
export function closePopover(){active?.();}
// A single anchored, dismissible surface, not a full-screen filter dialog.
export function openPopover(anchor,{title='',width=340,menu=false}={}){
  closePopover();const controller=new AbortController(),surface=document.createElement('section'),owned=new Map();
  surface.className='swift-popover'+(menu?' swift-menu':'');surface.setAttribute('role',menu?'menu':'dialog');surface.setAttribute('aria-label',title||anchor.getAttribute('aria-label')||'设置');surface.tabIndex=-1;
  if(title){const heading=document.createElement('h3');heading.textContent=title;surface.append(heading);}
  const content=document.createElement('div');content.className='popover-content';surface.append(content);document.body.append(surface);
  anchor.setAttribute('aria-expanded','true');surface.style.width=Math.min(width,innerWidth-24)+'px';
  const position=()=>{const r=anchor.getBoundingClientRect();surface.style.maxHeight=Math.max(100,innerHeight-24)+'px';const h=surface.getBoundingClientRect().height;surface.style.left=Math.max(12,Math.min(r.left,innerWidth-surface.offsetWidth-12))+'px';surface.style.top=Math.max(12,r.bottom+h+8<=innerHeight-12?r.bottom+8:r.top-h-8)+'px';for(const fn of owned.values())fn?.();};
  const close=(focus=false)=>{controller.abort();observer.disconnect();surface.remove();for(const el of owned.keys())el.remove();owned.clear();anchor.setAttribute('aria-expanded','false');if(active===close)active=null;if(focus&&anchor.isConnected)anchor.focus();};active=close;
  const observer=new ResizeObserver(position);observer.observe(surface);
  document.addEventListener('pointerdown',e=>{if(!surface.contains(e.target)&&!anchor.contains(e.target)&&![...owned.keys()].some(el=>el.contains(e.target)))close();},{signal:controller.signal});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close(true);}else if(menu&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){const buttons=[surface,...owned.keys()].flatMap(el=>[...el.querySelectorAll('button:not(:disabled)')]).filter(b=>b.getClientRects().length),i=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;e.preventDefault();buttons[next]?.focus();}},{signal:controller.signal});
  window.addEventListener('resize',position,{signal:controller.signal});queueMicrotask(()=>{position();(content.querySelector('button,input,select')||surface).focus();});return {content,close,position,surface,addSurface(el,fn){owned.set(el,fn);document.body.append(el);observer.observe(el);position();return ()=>{observer.unobserve(el);owned.delete(el);el.remove();};}};
}
