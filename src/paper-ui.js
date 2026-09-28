import {rectifyA4,suggestPaperCorners} from './perspective.js';

const defaults=()=>[{x:.04,y:.04},{x:.96,y:.04},{x:.96,y:.96},{x:.04,y:.96}];
export function resetPaperCorrection(state){
  state.correctedBitmap?.close?.();state.correctedBitmap=null;
  if(state.correctedURL)URL.revokeObjectURL(state.correctedURL);
  state.correctedURL=null;state.paperCorners=null;
}
export function mountPaperCorrection({state,view,render,toast}){
  if(!state.importFile)return;
  state.paperCorners||=defaults();
  const panel=view.querySelector('#crop-preview')?.closest('section');
  if(!panel)return;
  const container=document.createElement('div');container.className='paper-correction';
  panel.insertBefore(container,view.querySelector('#crop-preview'));
  const bitmap=state.importBitmap,corners=state.paperCorners;
  const preview=()=>{
    const base=view.querySelector('#crop-preview');
    const usableWidth=base.clientWidth,usableHeight=base.clientHeight;
    const factor=Math.min(usableWidth/bitmap.width,usableHeight/bitmap.height);
    const width=bitmap.width*factor,height=bitmap.height*factor;
    const left=(usableWidth-width)/2,top=(usableHeight-height)/2;
    let overlay=base.querySelector('.paper-corner-overlay');
    if(!overlay){overlay=document.createElement('div');overlay.className='paper-corner-overlay';base.appendChild(overlay);}
    overlay.style.cssText=`left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
    const points=corners.map(p=>`${p.x*width},${p.y*height}`).join(' ');
    overlay.innerHTML=`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polygon points="${points}" fill="#4fc39733" stroke="#287455" stroke-width="3"/></svg>`+
      corners.map((p,i)=>`<button class="paper-handle" type="button" data-corner="${i}" aria-label="${['左上','右上','右下','左下'][i]}角" style="left:${p.x*100}%;top:${p.y*100}%">${i+1}</button>`).join('');
    overlay.querySelectorAll('[data-corner]').forEach(button=>{
      button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);const i=+button.dataset.corner;
        button.onpointermove=move=>{if(!button.hasPointerCapture(move.pointerId))return;const rect=overlay.getBoundingClientRect();corners[i]={x:Math.max(0,Math.min(1,(move.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(move.clientY-rect.top)/rect.height))};const polygon=overlay.querySelector('polygon');polygon.setAttribute('points',corners.map(p=>`${p.x*width},${p.y*height}`).join(' '));button.style.left=`${corners[i].x*100}%`;button.style.top=`${corners[i].y*100}%`;};
        button.onpointerup=()=>{button.onpointermove=null;button.onpointerup=null;};
      };
    });
  };
  container.innerHTML=`<p><strong>A4 四角校正</strong> · 拖动照片上的 1–4 号角点</p><div class="actions"><button type="button" class="btn mini" id="detect-paper">自动找纸张</button><button type="button" class="btn mini" id="rectify-paper">使用四角校正</button></div>${state.correctedURL?`<p>已校正为 A4；后续候选基于校正图测量。<img class="corrected-preview" src="${state.correctedURL}" alt="校正后的 A4 纸张"></p>`:''}`;
  view.querySelector('#crop-frame').style.display=state.correctedBitmap?'none':'';
  const cropFields=view.querySelector('.crop-fields');
  if(state.correctedBitmap&&cropFields)cropFields.style.display='none';
  container.querySelector('#detect-paper').onclick=async()=>{const suggested=await suggestPaperCorners(bitmap);if(!suggested){toast('未能确定纸张，请手动拖动四角');return;}state.paperCorners=suggested;render();toast('请核对纸张四角，再使用校正结果');};
  container.querySelector('#rectify-paper').onclick=async()=>{
    const button=container.querySelector('#rectify-paper');button.disabled=true;button.textContent='正在校正…';
    try{const blob=await rectifyA4(bitmap,state.paperCorners);resetPaperCorrectionImage(state);state.correctedBitmap=await createImageBitmap(blob);state.correctedURL=URL.createObjectURL(blob);state.wholePaper=true;state.importCandidates=[];state.importCandidate=null;render();toast('A4 已校正，请预览并逐一核对候选');}
    catch(error){toast(error.message||'校正失败');button.disabled=false;button.textContent='使用四角校正';}
  };
  requestAnimationFrame(preview);
}
function resetPaperCorrectionImage(state){state.correctedBitmap?.close?.();if(state.correctedURL)URL.revokeObjectURL(state.correctedURL);state.correctedBitmap=null;state.correctedURL=null;}
