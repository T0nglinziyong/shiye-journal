import {canvasObjects,objectCorners,polygonContains,selectPolygon,selectStrokes,selectionBounds,moveSelection} from './canvas-selection.js';
import {syncSelectionGeometry} from './selection-geometry.js';

export function mountCanvasSelection(c) {
  const {state,view,current,checkpoint,saveProject,render}=c,d=current(),page=view.querySelector('#canvas-page');if(!d||!page)return;
  page.classList.toggle('lasso',state.tool==='lasso');
  const selectionDraft=state.activeProject.id+':'+d.id;
  if(state.selectionDraft!==selectionDraft){state.selectionDraft=selectionDraft;state.multiSelected=[];state.selectedStrokes=[];state.selectionPath=null;}
  state.selectionFilter={ink:true,material:true,text:true,shape:true,...state.selectionFilter};state.multiSelected ||= [];state.selectedStrokes ||= [];
  const active=()=>canvasObjects(d).filter(e=>state.multiSelected.includes(e.value.id));
  const activeStrokes=()=>state.selectedStrokes.filter(i=>d.strokes?.[i]);
  const count=()=>active().length+activeStrokes().length;
  const controls=view.querySelector('.canvas-context-tools');
  const range=[...controls.querySelectorAll('button')].find(b=>b.textContent==='选择范围');
  const filter=document.createElement('details');filter.className='selection-filter';
  filter.innerHTML='<summary>选择范围</summary><div>'+[['ink','手写笔画'],['material','素材／照片'],['text','文字'],['shape','图形']].map(([key,label])=>'<label><input type="checkbox" data-selection-filter="'+key+'" '+(state.selectionFilter[key]?'checked':'')+'>'+label+'</label>').join('')+'<small>锁定和隐藏的对象不参与选择</small></div>';
  // Settings now use the tool's anchored popover; keep one shared filter state.
  filter.querySelectorAll('input').forEach(el=>el.onchange=()=>state.selectionFilter[el.dataset.selectionFilter]=el.checked);
  const toolbar=document.createElement('div');toolbar.className='multi-selection-toolbar';toolbar.hidden=!['lasso','marquee'].includes(state.tool)&&count()<2;controls.append(toolbar);
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn mini';b.textContent=label;b.onclick=fn;toolbar.append(b);return b;};
  const change=fn=>{if(!active().length)return;checkpoint();fn(active());saveProject();render();};
  toolbar.append(Object.assign(document.createElement('span'),{textContent:'已选 '+count()+' 项'}));
  button('全选',()=>{state.multiSelected=canvasObjects(d,state.selectionFilter).map(e=>e.value.id);state.selectedStrokes=state.selectionFilter.ink?(d.strokes||[]).map((_,i)=>i):[];state.selected=null;state.selectionPath=null;render();});
  button('清空选择',()=>{state.multiSelected=[];state.selectedStrokes=[];state.selected=null;state.selectionPath=null;render();});
  const group=button('组合移动',()=>change(entries=>{const id=crypto.randomUUID();entries.filter(e=>e.kind==='material').forEach(e=>e.value.creativeGroupID=id);}));
  group.disabled=active().filter(e=>e.kind==='material').length<2;
  button('退出装饰组',()=>change(entries=>entries.forEach(e=>{delete e.value.creativeGroupID;})));
  button('锁定',()=>change(entries=>{entries.forEach(e=>e.value.locked=true);state.multiSelected=[];state.selectedStrokes=[];state.selected=null;state.selectionPath=null;}));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('canvas-selection-overlay');svg.setAttribute('viewBox','0 0 '+d.canvas.width+' '+d.canvas.height);page.append(svg);
  const paint=(path=[])=>{
    const entries=active(),points=[...entries.flatMap(e=>objectCorners(e.value)),...activeStrokes().flatMap(i=>d.strokes[i].points)];
    svg.replaceChildren();
    const outline=(polygon,className)=>{const p=document.createElementNS(svg.namespaceURI,'polygon');p.setAttribute('points',polygon.map(p=>p.x+','+p.y).join(' '));p.setAttribute('class',className);svg.append(p);};
    if(entries.length>1||state.tool!=='select')entries.forEach(e=>outline(objectCorners(e.value),'selected-object-outline'));
    if(path.length)outline(path,'lasso-outline');
    else if(entries.length&&state.tool==='lasso'&&state.selectionPath?.length)outline(state.selectionPath,'lasso-outline');
    else if(points.length&&(entries.length>1||state.tool!=='select')){const b=selectionBounds(points);outline([{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}],'selection-bounds');}
    page.querySelectorAll('[data-object]').forEach(el=>el.classList.toggle('multi-selected',state.multiSelected.includes(el.dataset.object)));
  };paint();
  let gesture=null;
  const point=e=>{const r=page.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*d.canvas.width,y:(e.clientY-r.top)/r.height*d.canvas.height};};
  view.pickCanvasObject=(id,shift=false)=>{const entry=canvasObjects(d).find(x=>x.value.id===id);if(!entry)return;const ids=state.multiSelected||[];state.selectionPath=null;state.selectedStrokes=[];if(shift){state.multiSelected=ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];state.selected=state.multiSelected.length===1?state.multiSelected[0]:null;}else{state.multiSelected=entry.value.creativeGroupID?canvasObjects(d).filter(x=>x.value.creativeGroupID===entry.value.creativeGroupID).map(x=>x.value.id):[id];state.selected=state.multiSelected.length===1?id:null;}view.editorRefresh?.();paint();};
  // Capture before app.js' single-object drag so a lasso starts over any
  // object and a selected set moves together, with one undo checkpoint.
  page.addEventListener('pointerdown',e=>{
    view.selectionClickConsumed=false;
    if(!['select','lasso','marquee'].includes(state.tool)||e.button>0||e.target.closest('.selected-object-overlay,.object-handle,.selected-object-actions,.canvas-inline-text'))return;
    if(state.editingTextID&&e.target.closest('[data-object]')?.dataset.object!==state.editingTextID)view.endTextEditing?.();
    const target=e.target.closest('[data-object]'),entry=canvasObjects(d).find(x=>x.value.id===target?.dataset.object);
    if(target&&!entry&&state.tool==='select'){e.stopImmediatePropagation();return;}
    const p=point(e);let ids=state.multiSelected;
    if(state.tool==='lasso'&&count()&&state.selectionPath?.length>=3&&polygonContains(p,state.selectionPath)){
      const starts=new Map(active().map(x=>[x.value.id,{x:x.value.x,y:x.value.y}]));
      gesture={id:e.pointerId,start:p,starts,strokeStarts:new Map(activeStrokes().map(i=>[i,d.strokes[i].points.map(point=>({...point}))])),pathStart:state.selectionPath.map(point=>({...point}))};
    }else if(['lasso','marquee'].includes(state.tool)){
      const previous={ids:[...state.multiSelected],strokes:[...state.selectedStrokes],path:state.selectionPath?.map(point=>({...point}))||null};
      state.selectionPath=null;state.selectedStrokes=[];
      gesture={id:e.pointerId,path:[p],start:p,marquee:state.tool==='marquee',previous};
    }
    else if(entry) {
      if(e.shiftKey){state.multiSelected=ids.includes(entry.value.id)?ids.filter(id=>id!==entry.value.id):[...ids,entry.value.id];state.selected=null;e.preventDefault();e.stopImmediatePropagation();render();return;}
      if(!ids.includes(entry.value.id))ids=entry.value.creativeGroupID?canvasObjects(d).filter(x=>x.value.creativeGroupID===entry.value.creativeGroupID).map(x=>x.value.id):[entry.value.id];
      state.multiSelected=ids;state.selectedStrokes=[];state.selected=ids.length===1?entry.value.id:null;state.selectionPath=null;
      gesture={id:e.pointerId,start:p,starts:new Map(canvasObjects(d).filter(x=>ids.includes(x.value.id)).map(x=>[x.value.id,{x:x.value.x,y:x.value.y}]))};
    }else{state.multiSelected=[];state.selectedStrokes=[];state.selected=null;state.selectionPath=null;paint();view.editorRefresh?.();return;}
    e.preventDefault();e.stopImmediatePropagation();page.setPointerCapture(e.pointerId);view.editorRefresh?.();paint();
  },true);
  page.addEventListener('pointermove',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const p=point(e);
    if(gesture.path){if(gesture.marquee){const a=gesture.start;gesture.path=[a,{x:p.x,y:a.y},p,{x:a.x,y:p.y}];}else gesture.path.push(p);paint(gesture.path);return;}
    if(!gesture.checkpoint&&Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>.5){checkpoint();gesture.checkpoint=true;}
    if(gesture.checkpoint){const moved=moveSelection(d,gesture.starts,p.x-gesture.start.x,p.y-gesture.start.y,gesture.strokeStarts);view.canvasInkRefresh?.();const scale=page.clientWidth/d.canvas.width;for(const {value:o} of active()){const el=page.querySelector('[data-object="'+o.id+'"]');if(el){el.style.left=(o.x-o.width/2)*scale+'px';el.style.top=(o.y-o.height/2)*scale+'px';syncSelectionGeometry(page,o.id);}}if(gesture.pathStart)state.selectionPath=gesture.pathStart.map(point=>({x:point.x+moved.dx,y:point.y+moved.dy}));paint();}
  },true);
  const finish=e=>{if(!gesture||gesture.id!==e.pointerId)return;e.stopImmediatePropagation();view.selectionClickConsumed=true;const g=gesture;gesture=null;if(g.path){state.multiSelected=selectPolygon(d,g.path,state.selectionFilter);state.selectedStrokes=selectStrokes(d,g.path,state.selectionFilter.ink);state.selected=null;state.selectionPath=!g.marquee&&count()?g.path:null;}else if(g.checkpoint)saveProject();render();};
  page.addEventListener('pointerup',finish,true);
  const cancelGesture=()=>{if(!gesture)return;const g=gesture;gesture=null;
    if(g.previous){state.multiSelected=g.previous.ids;state.selectedStrokes=g.previous.strokes;state.selectionPath=g.previous.path;}
    if(g.checkpoint){for(const {value:o} of canvasObjects(d)){const start=g.starts?.get(o.id);if(start)Object.assign(o,start);}for(const [i,points] of g.strokeStarts||[])if(d.strokes?.[i])d.strokes[i].points=points;if(g.pathStart)state.selectionPath=g.pathStart;state.undo.pop();view.canvasInkRefresh?.();}
    if(page.hasPointerCapture?.(g.id))page.releasePointerCapture(g.id);render();
  };
  page.addEventListener('pointercancel',e=>{if(gesture?.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();cancelGesture();},true);
  view.cancelObjectGesture=cancelGesture;
  view.canvasSelectionRefresh=()=>{toolbar.hidden=!['lasso','marquee'].includes(state.tool)&&count()<2;controls.append(toolbar);toolbar.querySelector('span').textContent='已选 '+count()+' 项';group.disabled=active().filter(e=>e.kind==='material').length<2;paint();};
  // Existing per-object inspector remains available; bulk unlock does not
  // require locked objects to participate in selection.
  const locked=[...(d.items||[]),...(d.textBlocks||[]),...(d.primitives||[])].filter(o=>o.locked||o.isLocked);
  if(locked.length)button('解锁对象（'+locked.length+'）',()=>{checkpoint();locked.forEach(o=>{o.locked=false;o.isLocked=false;});saveProject();render();});
}
