import {canvasObjects,objectCorners,selectPolygon,selectionBounds,moveSelection} from './canvas-selection.js';
import {syncSelectionGeometry} from './selection-geometry.js';

export function mountCanvasSelection(c) {
  const {state,view,current,checkpoint,saveProject,render}=c,d=current(),page=view.querySelector('#canvas-page');if(!d||!page)return;
  page.classList.toggle('lasso',state.tool==='lasso');
  const selectionDraft=state.activeProject.id+':'+d.id;
  if(state.selectionDraft!==selectionDraft){state.selectionDraft=selectionDraft;state.multiSelected=[];}
  state.selectionFilter ||= {material:true,text:true,shape:true};state.multiSelected ||= [];
  const active=()=>canvasObjects(d).filter(e=>state.multiSelected.includes(e.value.id));
  const controls=view.querySelector('.canvas-context-tools');
  const range=[...controls.querySelectorAll('button')].find(b=>b.textContent==='选择范围');
  const filter=document.createElement('details');filter.className='selection-filter';
  filter.innerHTML='<summary>选择范围</summary><div>'+[['material','素材／照片'],['text','文字'],['shape','图形']].map(([key,label])=>'<label><input type="checkbox" data-selection-filter="'+key+'" '+(state.selectionFilter[key]?'checked':'')+'>'+label+'</label>').join('')+'<small>锁定和隐藏的对象不参与选择</small></div>';
  // Settings now use the tool's anchored popover; keep one shared filter state.
  filter.querySelectorAll('input').forEach(el=>el.onchange=()=>state.selectionFilter[el.dataset.selectionFilter]=el.checked);
  const toolbar=document.createElement('div');toolbar.className='multi-selection-toolbar';toolbar.hidden=!['lasso','marquee'].includes(state.tool)&&active().length<2;controls.append(toolbar);
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn mini';b.textContent=label;b.onclick=fn;toolbar.append(b);return b;};
  const change=fn=>{if(!active().length)return;checkpoint();fn(active());saveProject();render();};
  toolbar.append(Object.assign(document.createElement('span'),{textContent:'已选 '+active().length+' 个对象'}));
  button('全选',()=>{state.multiSelected=canvasObjects(d,state.selectionFilter).map(e=>e.value.id);state.selected=null;render();});
  button('清空选择',()=>{state.multiSelected=[];state.selected=null;render();});
  const group=button('组合移动',()=>change(entries=>{const id=crypto.randomUUID();entries.filter(e=>e.kind==='material').forEach(e=>e.value.creativeGroupID=id);}));
  group.disabled=active().filter(e=>e.kind==='material').length<2;
  button('退出装饰组',()=>change(entries=>entries.forEach(e=>{delete e.value.creativeGroupID;})));
  button('锁定',()=>change(entries=>{entries.forEach(e=>e.value.locked=true);state.multiSelected=[];state.selected=null;}));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('canvas-selection-overlay');svg.setAttribute('viewBox','0 0 '+d.canvas.width+' '+d.canvas.height);page.append(svg);
  const paint=(path=[])=>{
    const entries=active(),points=entries.flatMap(e=>objectCorners(e.value));
    svg.replaceChildren();
    const outline=(polygon,className)=>{const p=document.createElementNS(svg.namespaceURI,'polygon');p.setAttribute('points',polygon.map(p=>p.x+','+p.y).join(' '));p.setAttribute('class',className);svg.append(p);};
    if(entries.length>1||state.tool!=='select')entries.forEach(e=>outline(objectCorners(e.value),'selected-object-outline'));
    if(path.length)outline(path,'lasso-outline');
    else if(points.length&&(entries.length>1||state.tool!=='select')){const b=selectionBounds(points);outline([{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}],'selection-bounds');}
    page.querySelectorAll('[data-object]').forEach(el=>el.classList.toggle('multi-selected',state.multiSelected.includes(el.dataset.object)));
  };paint();
  let gesture=null;
  const point=e=>{const r=page.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*d.canvas.width,y:(e.clientY-r.top)/r.height*d.canvas.height};};
  // Capture before app.js' single-object drag so a lasso starts over any
  // object and a selected set moves together, with one undo checkpoint.
  page.addEventListener('pointerdown',e=>{
    view.selectionClickConsumed=false;
    if(!['select','lasso','marquee'].includes(state.tool)||e.button>0||e.target.closest('.selected-object-overlay,.object-handle,.selected-object-actions,.canvas-inline-text'))return;
    if(state.editingTextID&&e.target.closest('[data-object]')?.dataset.object!==state.editingTextID)view.endTextEditing?.();
    const target=e.target.closest('[data-object]'),entry=canvasObjects(d).find(x=>x.value.id===target?.dataset.object);
    if(target&&!entry&&state.tool==='select'){e.stopImmediatePropagation();return;}
    const p=point(e);let ids=state.multiSelected;
    if(['lasso','marquee'].includes(state.tool))gesture={id:e.pointerId,path:[p],start:p,marquee:state.tool==='marquee'};
    else if(entry) {
      if(e.shiftKey){state.multiSelected=ids.includes(entry.value.id)?ids.filter(id=>id!==entry.value.id):[...ids,entry.value.id];state.selected=null;e.preventDefault();e.stopImmediatePropagation();render();return;}
      if(!ids.includes(entry.value.id))ids=entry.value.creativeGroupID?canvasObjects(d).filter(x=>x.value.creativeGroupID===entry.value.creativeGroupID).map(x=>x.value.id):[entry.value.id];
      state.multiSelected=ids;state.selected=ids.length===1?entry.value.id:null;
      gesture={id:e.pointerId,start:p,starts:new Map(canvasObjects(d).filter(x=>ids.includes(x.value.id)).map(x=>[x.value.id,{x:x.value.x,y:x.value.y}]))};
    }else{state.multiSelected=[];state.selected=null;paint();view.editorRefresh?.();return;}
    e.preventDefault();e.stopImmediatePropagation();page.setPointerCapture(e.pointerId);view.editorRefresh?.();paint();
  },true);
  page.addEventListener('pointermove',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const p=point(e);
    if(gesture.path){if(gesture.marquee){const a=gesture.start;gesture.path=[a,{x:p.x,y:a.y},p,{x:a.x,y:p.y}];}else gesture.path.push(p);paint(gesture.path);return;}
    if(!gesture.checkpoint&&Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>.5){checkpoint();gesture.checkpoint=true;}
    if(gesture.checkpoint){moveSelection(d,gesture.starts,p.x-gesture.start.x,p.y-gesture.start.y);const scale=page.clientWidth/d.canvas.width;for(const {value:o} of active()){const el=page.querySelector('[data-object="'+o.id+'"]');if(el){el.style.left=(o.x-o.width/2)*scale+'px';el.style.top=(o.y-o.height/2)*scale+'px';syncSelectionGeometry(page,o.id);}}paint();}
  },true);
  const finish=e=>{if(!gesture||gesture.id!==e.pointerId)return;e.stopImmediatePropagation();view.selectionClickConsumed=true;const g=gesture;gesture=null;if(g.path){state.multiSelected=selectPolygon(d,g.path,state.selectionFilter);state.selected=null;}else if(g.checkpoint)saveProject();render();};
  page.addEventListener('pointerup',finish,true);page.addEventListener('pointercancel',finish,true);
  view.cancelObjectGesture=()=>{if(!gesture)return;const g=gesture;gesture=null;if(g.checkpoint){for(const {value:o} of canvasObjects(d)){const start=g.starts?.get(o.id);if(start)Object.assign(o,start);}state.undo.pop();}if(page.hasPointerCapture?.(g.id))page.releasePointerCapture(g.id);render();};
  view.canvasSelectionRefresh=()=>{toolbar.hidden=!['lasso','marquee'].includes(state.tool)&&active().length<2;controls.append(toolbar);toolbar.querySelector('span').textContent='已选 '+active().length+' 个对象';group.disabled=active().filter(e=>e.kind==='material').length<2;paint();};
  // Existing per-object inspector remains available; bulk unlock does not
  // require locked objects to participate in selection.
  const locked=[...(d.items||[]),...(d.textBlocks||[]),...(d.primitives||[])].filter(o=>o.locked||o.isLocked);
  if(locked.length)button('解锁对象（'+locked.length+'）',()=>{checkpoint();locked.forEach(o=>{o.locked=false;o.isLocked=false;});saveProject();render();});
}
