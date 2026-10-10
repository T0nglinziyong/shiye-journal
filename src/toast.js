// A single non-blocking notice clock for errors, hints, and successes.
// The CSS animation also fades to zero by 1s, even when background Safari
// throttles JS timers. Do not apply this duration to modal confirmations or
// persistent inline form validation: those require an explicit user decision.
export const TOAST_MAX_DURATION_MS=1000;

const activeTimers=new WeakMap();

/**
 * Display a transient notice for at most one second.
 * A newer notice replaces the previous one and cancels its old timer.
 * @param {unknown} message text to show
 * @param {{element?: HTMLElement|null, schedule?:typeof setTimeout, cancel?:typeof clearTimeout}} options
 */
export function showToast(message,{
  element=typeof document!=='undefined'?document.querySelector('#toast'):null,
  schedule=setTimeout,
  cancel=clearTimeout
}={}){
  if(!element)return false;
  const text=String(message??'操作未完成');
  const previous=activeTimers.get(element);
  // Identical notices may be emitted repeatedly by background retries.
  // Do not let those retries extend one notice indefinitely.
  if(previous&&previous.message===text)return true;
  if(previous){previous.cancel(previous.timer);activeTimers.delete(element);}

  // Re-trigger the one-second CSS animation even if a previous notice has
  // not yet disappeared. This also avoids a stale previous timeout hiding it.
  element.classList.remove('show');
  element.textContent=text;
  void element.offsetWidth; // force animation restart for successive messages
  element.classList.add('show');

  const token={timer:null,cancel,message:text};
  activeTimers.set(element,token);
  token.timer=schedule(()=>{
    if(activeTimers.get(element)!==token)return;
    element.classList.remove('show');
    activeTimers.delete(element);
  },TOAST_MAX_DURATION_MS);
  return true;
}
