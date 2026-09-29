import {cropBitmap} from './image.js';
export function mountImportBoxEditor({state,view,render,saveActiveImportRecord,toast,refreshImportCandidates}) {
  const base=view.querySelector('#crop-preview'),source=state.correctedBitmap||state.importBitmap;if(!base||!source)return;
  let boxes=structuredClone(state.importCandidates||[]),selected=null,drag=null;
  const overlay=document.createElement('div');overlay.className='manual-box-layer multi-box-editor';
  const scale=Math.min(base.clientWidth/source.width,base.clientHeight/source.height);
  const paper=state.correctedBitmap?{x:0,y:0,w:1,h:1}:state.importBox;
  overlay.style.cssText='left:'+((base.clientWidth-source.width*scale)/2+paper.x*source.width*scale)+'px;top:'+((base.clientHeight-source.height*scale)/2+paper.y*source.height*scale)+'px;width:'+source.width*scale*paper.w+'px;height:'+source.height*scale*paper.h+'px';base.append(overlay);
  const frame=base.querySelector('#crop-frame');if(frame)frame.style.display='none';
  const actions=document.createElement('div');actions.className='import-photo-tools';base.after(actions);
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;b.onclick=fn;actions.append(b);return b;};
  button('取消标记',()=>{state.showManualBox=false;render();});
  button('移除选中',()=>{if(selected!=null){boxes.splice(selected,1);selected=null;paint();}});
  button('清空框',()=>{boxes=[];selected=null;paint();});
  const done=button('完成标记',async()=>{
    done.disabled=true;
    try {
      if(await refreshImportCandidates(boxes)===false){done.disabled=false;return;}
      state.showManualBox=false;state.importRecords[state.importIndex].manualEdits=true;
      state.importRecords[state.importIndex].confirmed=false;saveActiveImportRecord();render();toast('已更新素材框，请核对候选预览');
    }catch(error){toast(error.message);done.disabled=false;}
  });
  function paint() {
    overlay.innerHTML=boxes.map((r,i)=>'<div class="import-region '+(selected===i?'active':'')+'" data-box="'+i+'" style="left:'+r.x*100+'%;top:'+r.y*100+'%;width:'+r.w*100+'%;height:'+r.h*100+'%;transform:rotate('+(r.rotation||0)+'deg)"><span>'+(i+1)+'</span>'+(selected===i?'<button type="button" class="box-resize" data-box="'+i+'" data-mode="resize" aria-label="缩放素材框"></button><button type="button" class="box-rotate" data-box="'+i+'" data-mode="rotate" aria-label="旋转素材框">↻</button>':'')+'</div>').join('');
  }
  const point=e=>{const r=overlay.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
  overlay.onpointerdown=e=>{e.preventDefault();e.stopPropagation();overlay.setPointerCapture(e.pointerId);const target=e.target.closest('[data-box]'),start=point(e);
    if(target){selected=+target.dataset.box;drag={id:e.pointerId,start,mode:target.dataset.mode||'move',original:{...boxes[selected]}};}
    else {selected=boxes.length;boxes.push({x:start.x,y:start.y,w:0,h:0,rotation:0});drag={id:e.pointerId,start,mode:'create'};}paint();};
  overlay.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();const p=point(e),r=boxes[selected],o=drag.original;
    if(drag.mode==='create')Object.assign(r,{x:Math.min(p.x,drag.start.x),y:Math.min(p.y,drag.start.y),w:Math.abs(p.x-drag.start.x),h:Math.abs(p.y-drag.start.y)});
    else if(drag.mode==='move')Object.assign(r,{x:Math.max(0,Math.min(1-o.w,o.x+p.x-drag.start.x)),y:Math.max(0,Math.min(1-o.h,o.y+p.y-drag.start.y))});
    else if(drag.mode==='resize')Object.assign(r,{w:Math.max(.01,Math.min(1-o.x,o.w+p.x-drag.start.x)),h:Math.max(.01,Math.min(1-o.y,o.h+p.y-drag.start.y))});
    else {const size=overlay.getBoundingClientRect(),cx=o.x+o.w/2,cy=o.y+o.h/2;r.rotation=(o.rotation||0)+(Math.atan2((p.y-cy)*size.height,(p.x-cx)*size.width)-Math.atan2((drag.start.y-cy)*size.height,(drag.start.x-cx)*size.width))*180/Math.PI;}paint();};
  overlay.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;const r=boxes[selected];if(r.w<.01||r.h<.01){boxes.splice(selected,1);selected=null;}drag=null;paint();};
  overlay.onpointercancel=()=>{if(drag?.original)boxes[selected]=drag.original;else if(drag)boxes.splice(selected,1);drag=null;paint();};
  paint();
}
