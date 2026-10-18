// Optional CPU work waits for a quiet foreground. Durable saves and user
// actions do not use this scheduler; they must never be delayed by it.
let lastInput=0,activePointers=0;
if(typeof window!=='undefined'){
  const mark=()=>{lastInput=performance.now();};
  window.addEventListener('pointerdown',()=>{activePointers++;mark();},{capture:true,passive:true});
  for(const name of ['pointerup','pointercancel'])window.addEventListener(name,()=>{
    activePointers=Math.max(0,activePointers-1);mark();},{capture:true,passive:true});
  for(const name of ['pointermove','touchmove','wheel','scroll','keydown'])
    window.addEventListener(name,mark,{capture:true,passive:true});
}
export function foregroundIsIdle(minIdleMs=700){
  if(typeof document==='undefined')return true;
  return document.visibilityState==='visible'&&!activePointers&&
    performance.now()-lastInput>=minIdleMs&&
    !navigator.scheduling?.isInputPending?.({includeContinuous:true});
}
export function scheduleForegroundIdle(task,{minIdleMs=700,delayMs=0}={}){
  let cancelled=false,timer=0,idle=0;
  const schedule=()=>{
    if(cancelled)return;
    timer=setTimeout(()=>{
      if(cancelled)return;
      if(typeof requestIdleCallback==='function')idle=requestIdleCallback(run);
      else run();
    },Math.max(100,minIdleMs/2));
  };
  const run=deadline=>{
    idle=0;
    if(cancelled)return;
    if(!foregroundIsIdle(minIdleMs)||deadline&&deadline.timeRemaining()<8){schedule();return;}
    task();
  };
  timer=setTimeout(schedule,delayMs);
  return ()=>{cancelled=true;clearTimeout(timer);if(idle&&typeof cancelIdleCallback==='function')cancelIdleCallback(idle);};
}
// Let pending input and paint run between chunks of optional canvas work.
// If an interaction starts, resume only after the foreground settles again.
export async function yieldToForeground({minIdleMs=350,allowHidden=false}={}){
  await new Promise(resolve=>setTimeout(resolve,0));
  if(allowHidden&&globalThis.document?.visibilityState==='hidden')return;
  if(foregroundIsIdle(minIdleMs))return;
  await new Promise(resolve=>scheduleForegroundIdle(resolve,{minIdleMs}));
}
