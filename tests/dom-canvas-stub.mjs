// Happy DOM has no renderer. Structural smoke tests need a no-op context;
// pixels, pointer gestures and clipping are checked separately in Chromium.
export function stubCanvas(window){window.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({measureText:text=>({width:String(text).length*8})},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});};}
