import {ComponentLifetime} from './ui-component-lifecycle.js';
import {paperOverlayRect} from './import-coordinate.js';
import {transformSelectedFrame,isObjectDeleteKey} from './selection-transform.js';

export function mountImportBoxEditor({state,view,render,saveActiveImportRecord,toast,refreshImportCandidates}) {
  const base=view.querySelector('#crop-preview'),source=state.correctedBitmap||state.importBitmap;
  const lifetime=new ComponentLifetime();
  if(!base||!source)return;
  let boxes=(state.importCandidates||[]).map((c,sourceIndex)=>{
    const r=c.orientedBox;
    return r?{...c,sourceIndex,x:r.centerX-r.width/2,y:r.centerY-r.height/2,
      w:r.width,h:r.height,rotation:r.rotation}:({...c,sourceIndex,rotation:c.rotation||0});
  }),selected=null,drag=null;
  const overlay=document.createElement('div');overlay.className='manual-box-layer multi-box-editor';
  const paper=state.correctedBitmap?{x:0,y:0,w:1,h:1}:state.importBox;
  const position=()=>{
    if(!base.isConnected)return;
    const rect=paperOverlayRect(base.clientWidth,base.clientHeight,source.width,source.height,paper);
    Object.assign(overlay.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
  };
  base.append(overlay);position();lifetime.frame(position);
  lifetime.resize(base,position);
  const sourceImage=base.querySelector(':scope > img');
  if(sourceImage)lifetime.on(sourceImage,'load',position);
  const removeSelected=()=>{
    if(selected==null)return;
    boxes.splice(selected,1);selected=null;drag=null;paint();
  };
  const onDelete=event=>{
    if(!state.showManualBox||state.route!=='import'||selected==null||!isObjectDeleteKey(event))return;
    event.preventDefault();event.stopPropagation();removeSelected();
  };
  lifetime.on(document,'keydown',onDelete);
  view.manualBoxDispose=()=>{lifetime.dispose();overlay.remove();actions.remove();};
  const frame=base.querySelector('#crop-frame');if(frame)frame.style.display='none';
  const actions=document.createElement('div');actions.className='import-photo-tools';base.after(actions);
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;b.onclick=fn;actions.append(b);return b;};
  button('取消标记',()=>{state.showManualBox=false;render();});
  button('移除选中',removeSelected);
  button('清空框',()=>{boxes=[];selected=null;drag=null;paint();});
  const done=button('完成标记',async()=>{
    done.disabled=true;
    try{
      if(await refreshImportCandidates(boxes,{manual:true})===false){done.disabled=false;return;}
      state.showManualBox=false;state.importRecords[state.importIndex].manualEdits=true;
      state.importRecords[state.importIndex].confirmed=false;
      saveActiveImportRecord();render();toast('已更新素材框，请核对候选预览');
    }catch(error){toast(error.message);done.disabled=false;}
  });
  const handle=(mode,name)=>'<button type="button" class="box-grip '+mode+
    '" data-mode="'+mode+'" aria-label="'+name+'"></button>';
  function paint(){
    // The currently selected region is rendered last and sits above every
    // overlapping box, including its interactive grips and delete action.
    const ordered=boxes.map((r,i)=>({r,i})).sort((a,b)=>Number(selected===a.i)-Number(selected===b.i));
    overlay.innerHTML=ordered.map(({r,i})=>
      '<div class="import-region '+(selected===i?'active':'')+'" data-box="'+i+
      '" style="left:'+(r.x*100)+'%;top:'+(r.y*100)+'%;width:'+(r.w*100)+
      '%;height:'+(r.h*100)+'%;transform:rotate('+(r.rotation||0)+'deg)">'+
      '<span class="box-number">'+(i+1)+'</span>'+
      (selected===i
        ?handle('top','拉伸高度')+handle('right','拉伸宽度')+
         handle('corner','缩放并旋转')+
         '<button class="box-delete" type="button" aria-label="删除选中素材框">×</button>'
        :'')+'</div>'
    ).join('');
  }
  const point=e=>{
    const r=overlay.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),
      y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
  };
  overlay.onclick=e=>{
    if(e.target.closest('.box-delete')){e.preventDefault();e.stopPropagation();removeSelected();}
  };
  overlay.onpointerdown=e=>{
    if(e.button>0)return;
    if(e.target.closest('.box-delete')){e.stopPropagation();return;}
    e.preventDefault();e.stopPropagation();
    const target=e.target.closest('[data-box]'),start=point(e);
    if(target){
      selected=Number(target.dataset.box);
      drag={id:e.pointerId,start,mode:e.target.closest('[data-mode]')?.dataset.mode||'move',
        original:{...boxes[selected]}};
    }else{
      selected=boxes.length;
      boxes.push({x:start.x,y:start.y,w:0,h:0,rotation:0,manualChanged:true});
      drag={id:e.pointerId,start,mode:'create'};
    }
    overlay.setPointerCapture(e.pointerId);paint();
  };
  overlay.onpointermove=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    e.preventDefault();e.stopPropagation();
    const p=point(e),r=boxes[selected],o=drag.original;
    if(drag.mode==='create'){
      Object.assign(r,{x:Math.min(p.x,drag.start.x),y:Math.min(p.y,drag.start.y),
        w:Math.abs(p.x-drag.start.x),h:Math.abs(p.y-drag.start.y)});
    }else if(drag.mode==='move'){
      Object.assign(r,{x:Math.max(0,Math.min(1-o.w,o.x+p.x-drag.start.x)),
        y:Math.max(0,Math.min(1-o.h,o.y+p.y-drag.start.y))});
    }else{
      const W=overlay.clientWidth,H=overlay.clientHeight;
      const output=transformSelectedFrame({
        x:o.x*W,y:o.y*H,width:o.w*W,height:o.h*H,rotation:o.rotation||0
      },drag.mode,{
        x:drag.start.x*W,y:drag.start.y*H
      },{
        x:p.x*W,y:p.y*H
      },{
        minWidth:W*.008,minHeight:H*.008,maxWidth:W,maxHeight:H
      });
      const w=Math.min(1,output.width/W),h=Math.min(1,output.height/H);
      Object.assign(r,{x:Math.max(0,Math.min(1-w,output.x/W)),
        y:Math.max(0,Math.min(1-h,output.y/H)),w,h,rotation:output.rotation});
    }
    if(o&&['x','y','w','h','rotation'].some(key=>Math.abs((r[key]||0)-(o[key]||0))>1e-6))r.manualChanged=true;
    r.orientedBox={centerX:r.x+r.w/2,centerY:r.y+r.h/2,
      width:r.w,height:r.h,rotation:r.rotation||0,autoDeskew:true,source:'manual'};
    paint();
  };
  overlay.onpointerup=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const r=boxes[selected];
    if(r.w<.01||r.h<.01){boxes.splice(selected,1);selected=null;}
    drag=null;paint();
  };
  overlay.onpointercancel=()=>{
    if(drag?.original)boxes[selected]=drag.original;
    else if(drag)boxes.splice(selected,1);
    drag=null;paint();
  };
  paint();
}
