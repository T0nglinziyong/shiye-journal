let active = null;
let activeAnchor = null;
export function closePopover() { active?.(); }
export function closePopoverFor(anchor) {
  if (active && activeAnchor === anchor) { active(); return true; }
  return false;
}
// Existing callers always receive a handle. Explicit toggles alone may return
// null when closing their own surface; reopening other controls is unchanged.
export function togglePopover(anchor, options = {}) {
  return closePopoverFor(anchor) ? null : openPopover(anchor, options);
}
export function openPopover(anchor, {title = '', width = 340, menu = false} = {}) {
  closePopover();
  const controller = new AbortController(), surface = document.createElement('section'), owned = new Map();
  let closed = false;
  surface.className = 'swift-popover' + (menu ? ' swift-menu' : '') + (['添加图形','添加素材'].includes(title) ? ' swift-picker-popover' : '');
  surface.setAttribute('role', menu ? 'menu' : 'dialog');
  surface.setAttribute('aria-label', title || anchor.getAttribute('aria-label') || '设置');
  surface.tabIndex = -1;
  if (title) { const heading = document.createElement('h3'); heading.textContent = title; surface.append(heading); }
  const content = document.createElement('div'); content.className = 'popover-content'; surface.append(content); document.body.append(surface);
  anchor.setAttribute('aria-expanded', 'true'); surface.style.width = Math.min(width, innerWidth - 24) + 'px';
  const position = () => {
    if (closed) return;
    if (!anchor.isConnected) { close(); return; }
    const r = anchor.getBoundingClientRect(); surface.style.maxHeight = Math.max(160,Math.min(innerHeight-24, ['添加图形','添加素材'].includes(title)?innerHeight*.54:innerHeight*.78))+'px';
    const h = surface.getBoundingClientRect().height;
    surface.style.left = Math.max(12, Math.min(r.left, innerWidth - surface.offsetWidth - 12)) + 'px';
    surface.style.top = Math.max(12, r.bottom + h + 8 <= innerHeight - 12 ? r.bottom + 8 : r.top - h - 8) + 'px';
    for (const fn of owned.values()) fn?.();
  };
  const close = (focus = false) => {
    if (closed) return; closed = true;
    controller.abort(); observer.disconnect(); surface.remove();
    for (const el of owned.keys()) el.remove(); owned.clear();
    anchor.setAttribute('aria-expanded', 'false');
    if (active === close) { active = null; activeAnchor = null; }
    if (focus && anchor.isConnected) anchor.focus({preventScroll: true});
  };
  active = close; activeAnchor = anchor;
  const observer = new ResizeObserver(position); observer.observe(surface); observer.observe(anchor);
  document.addEventListener('pointerdown', e => {
    if (!surface.contains(e.target) && !anchor.contains(e.target) && ![...owned.keys()].some(el => el.contains(e.target))) close();
  }, {signal: controller.signal, capture:true});
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const buttons = [surface, ...owned.keys()].flatMap(el => [...el.querySelectorAll('button:not(:disabled)')]).filter(b => b.getClientRects().length);
      if (!buttons.length) return;
      const i = buttons.indexOf(document.activeElement), next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      e.preventDefault(); buttons[next]?.focus();
    }
  }, {signal: controller.signal});
  window.addEventListener('resize', position, {signal: controller.signal});
  document.addEventListener('scroll', position, {capture: true, signal: controller.signal});
  queueMicrotask(() => { if (!closed) { position(); if (!closed) (content.querySelector('button,input,select') || surface).focus({preventScroll: true}); } });
  return {content, close, position, surface, addSurface(el, fn) {
    if (closed) return () => {};
    owned.set(el, fn); document.body.append(el); observer.observe(el); position();
    return () => { observer.unobserve(el); owned.delete(el); el.remove(); };
  }};
}
