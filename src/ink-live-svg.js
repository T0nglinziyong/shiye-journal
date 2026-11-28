import {inkScenePaths} from './ink-scene-svg.js';
// When a pen lifts, commit a lightweight vector DOM node immediately. A full
// Scene reconciliation can be coalesced with later strokes without making ink
// disappear between pointerup and the scheduled save.
export function mountLiveInkStroke(page,draft,stroke){
  if(!page||!stroke?.id||!stroke.points?.length)return null;
  const existing=[...page.querySelectorAll('.scene-ink-object[data-render-key]')]
    .find(node=>node.dataset.renderKey===stroke.id);
  if(existing)return existing;
  const node=document.createElementNS('http://www.w3.org/2000/svg','svg');
  node.classList.add('canvas-object','scene-ink-object');
  node.dataset.renderKey=stroke.id;
  node.setAttribute('viewBox',`0 0 ${draft.canvas.width} ${draft.canvas.height}`);
  node.setAttribute('preserveAspectRatio','none');
  node.setAttribute('aria-hidden','true');
  node.style.cssText=`position:absolute;inset:0;width:100%;height:100%;z-index:${stroke.zIndex??2000};opacity:${stroke.opacity??1};pointer-events:none`;
  node.innerHTML=inkScenePaths(stroke);
  page.insertBefore(node,page.querySelector('.paper-layer')||null);
  return node;
}
