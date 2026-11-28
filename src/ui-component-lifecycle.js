// DOM-independent lifecycle contract: mount -> update -> dispose.
// Consumers own their observers, event subscriptions, RAFs and timers. A
// future React useEffect/Vue onUnmounted adapter can call the same dispose().
export class ComponentLifetime {
  #cleanups=[];
  #disposed=false;
  get disposed(){return this.#disposed;}
  use(cleanup){
    if(typeof cleanup!=='function')return cleanup;
    if(this.#disposed){cleanup();return cleanup;}
    this.#cleanups.push(cleanup);
    return cleanup;
  }
  on(target,event,listener,options){
    if(this.#disposed)return;
    target.addEventListener(event,listener,options);
    this.use(()=>target.removeEventListener(event,listener,options));
  }
  frame(callback){
    if(this.#disposed)return null;
    const id=requestAnimationFrame(()=>{if(!this.#disposed)callback();});
    this.use(()=>cancelAnimationFrame(id));
    return id;
  }
  resize(element,callback){
    if(this.#disposed||typeof ResizeObserver!=='function')return null;
    const observer=new ResizeObserver(callback);
    observer.observe(element);
    this.use(()=>observer.disconnect());
    return observer;
  }
  timer(callback,ms){
    if(this.#disposed)return null;
    const id=setTimeout(()=>{if(!this.#disposed)callback();},ms);
    this.use(()=>clearTimeout(id));
    return id;
  }
  dispose(){
    if(this.#disposed)return;
    this.#disposed=true;
    for(const cleanup of this.#cleanups.splice(0).reverse()){
      try{cleanup();}catch(error){console.warn('UI cleanup failed',error);}
    }
  }
}
