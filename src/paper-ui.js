import {ComponentLifetime} from './ui-component-lifecycle.js';
const defaults=()=>[{x:.03,y:.03},{x:.97,y:.03},{x:.97,y:.97},{x:.03,y:.97}];
export function resetPaperCorrection(state){
  state.correctedBitmap?.close?.();state.correctedBitmap=null;
  if(state.correctedURL)URL.revokeObjectURL(state.correctedURL);
  state.correctedURL=null;state.paperCorners=null;
  state.paperPreviewBitmap?.close?.();state.paperPreviewBitmap=null;
  if(state.paperPreviewURL)URL.revokeObjectURL(state.paperPreviewURL);
  state.paperPreviewURL=null;state.showCorrectionPreview=false;state.paperPreviewApplied=false;
}
export function mountPaperCorrection({state,view,saveActiveImportRecord}){
  if(!state.importFile||state.showManualBox||state.showCorrectionPreview)return null;
  const base=view.querySelector('#crop-preview'),bitmap=state.importBitmap;if(!base||!bitmap)return;
  state.paperCorners||=defaults();
  const lifetime=new ComponentLifetime();
  const overlay=document.createElement('div');overlay.className='paper-corner-overlay';base.append(overlay);
  const paint=()=>{
    if(!base.isConnected)return;
    const factor=Math.min(base.clientWidth/bitmap.width,base.clientHeight/bitmap.height),width=bitmap.width*factor,height=bitmap.height*factor;
    overlay.style.cssText='left:'+((base.clientWidth-width)/2)+'px;top:'+((base.clientHeight-height)/2)+'px;width:'+width+'px;height:'+height+'px';
    if(!overlay.childElementCount){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),polygon=document.createElementNS(svg.namespaceURI,'polygon');svg.append(polygon);overlay.append(svg);for(let i=0;i<4;i++){const button=document.createElement('button');button.type='button';button.className='paper-handle';button.dataset.corner=i;button.setAttribute('aria-label',['左上','右上','右下','左下'][i]+'角');button.textContent=i+1;overlay.append(button);
      button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);const rect=overlay.getBoundingClientRect(),start={...state.paperCorners[i]},origin={x:e.clientX,y:e.clientY};
        button.onpointermove=m=>{if(!button.hasPointerCapture(m.pointerId))return;state.paperCorners[i]={x:Math.max(.004,Math.min(.996,start.x+(m.clientX-origin.x)/rect.width)),y:Math.max(.004,Math.min(.996,start.y+(m.clientY-origin.y)/rect.height))};state.paperPreviewApplied=false;position();};
        button.onpointerup=()=>{button.onpointermove=null;button.onpointerup=null;saveActiveImportRecord();};
        button.onpointercancel=()=>{state.paperCorners[i]=start;position();saveActiveImportRecord();};
      };}}
    overlay.querySelector('svg').setAttribute('viewBox','0 0 '+width+' '+height);position();
  };
  const position=()=>{const width=overlay.clientWidth,height=overlay.clientHeight;overlay.querySelector('polygon').setAttribute('points',state.paperCorners.map(p=>p.x*width+','+p.y*height).join(' '));overlay.querySelectorAll('[data-corner]').forEach(b=>{const p=state.paperCorners[+b.dataset.corner];b.style.left=Math.max(15,Math.min(width-15,p.x*width))+'px';b.style.top=Math.max(15,Math.min(height-15,p.y*height))+'px';});};
  lifetime.frame(paint);
  lifetime.resize(base,paint);
  return ()=>{lifetime.dispose();overlay.remove();};
}
