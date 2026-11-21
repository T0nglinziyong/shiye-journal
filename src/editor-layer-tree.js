import {reconcileLayerBranches} from './ui-keyed-dom.js';
import {openPopover} from './swift-popover.js';
import {createIcon} from './icons.js';
import {sceneLayerEntries,sceneGroupMembers,findSceneNode,moveSceneNode,groupSceneLayers,ungroupSceneLayers} from './scene-model.js';

// Actual recursive, editable layer tree; a visible row has exactly one Scene
// node and descendants live under its group's role=group container. No mirror
// collection, no global z-order sort of flattened descendants.
const visibleOrder=nodes=>[...(nodes||[])].sort((a,b)=>(b.zIndex??(b.type==='ink'?2000:0))-(a.zIndex??(a.type==='ink'?2000:0)));
export function sceneLayerOutline(nodes,level=1,result=[]){
 for(const node of visibleOrder(nodes)){
  result.push({id:node.id,type:node.type,level});
  if(node.type==='group')sceneLayerOutline(node.children||[],level+1,result);
 }
 return result;
}
export function layerMoveTarget(d,movingID,targetID,relation='before'){
 if(movingID===targetID)return null;
 const move=findSceneNode(d,movingID),target=findSceneNode(d,targetID);
 if(!move||!target)return null;
 const findParent=(nodes,id,parent=null)=>{
  for(const n of nodes){if(n.id===id)return parent;
    if(n.type==='group'){const match=findParent(n.children||[],id,n);if(match!==undefined)return match;}}
  return undefined;
 };
 const parent=relation==='inside'&&target.type==='group'?target:findParent(d.layers,targetID);
 if(parent===undefined)return null;
 if(relation==='inside'&&target.type==='group')return {parentID:target.id,beforeID:null};
 const siblings=(parent?.children||d.layers).filter(n=>n.id!==movingID);
 const index=siblings.findIndex(n=>n.id===targetID);
 if(index<0)return null;
 return {parentID:parent?.id||null,beforeID:relation==='after'?siblings[index+1]?.id||null:targetID};
}

export function openEditorLayerTree(anchor,{draft,state,view,checkpoint,saveProject,render,toast,uid,asset,imgTag,esc}={}){
 const p=openPopover(anchor,{title:'图层树 · 上方在前',width:Math.min(390,innerWidth-24),dismissOnOutside:true});
 p.surface.classList.add('swift-layer-popover','scene-layer-tree-popover');
 const menu=document.createElement('div');menu.className='scene-layer-tree-toolbar';
 const list=document.createElement('div');list.className='canvas-layer-list scene-layer-tree';list.setAttribute('role','tree');
 list.setAttribute('aria-label','可编辑场景递归图层树');
 const status=document.createElement('p');status.className='scene-layer-tree-status';status.setAttribute('role','status');
 p.content.append(menu,list,status);
 const expanded=new Set(),nodesSeen=new Set();
 let lastTreeReferences=new Map();
 let multiMode=false,drag=null;
 const button=(label,run,className='')=>{const b=document.createElement('button');b.type='button';b.className=className;b.textContent=label;b.addEventListener('click',e=>{e.stopPropagation();run(e);});return b;};
 const name=node=>node.type==='group'?node.name||'未命名组合':node.type==='material'?asset(node.assetID)?.title||'素材':node.type==='text'?node.content?.slice(0,27)||'文字':node.type==='ink'?'手写笔迹':node.kind||'图形';
 const record=()=>sceneLayerEntries(draft,{hidden:true,ink:true});
 const selectedIDs=()=>[...new Set([...(state.multiSelected||[]),...(state.selected?[state.selected]:[]),...(state.selectedStrokes||[]).map(i=>draft.strokes[i]?.id).filter(Boolean)])];
 const isSelected=id=>id===state.sceneSelectedGroup||id===state.selected||selectedIDs().includes(id);
 const refreshSelection=()=>{view.editorRefresh?.();view.canvasSelectionRefresh?.();list.querySelectorAll('[data-scene-node]').forEach(row=>{
    const selected=isSelected(row.dataset.sceneNode);row.classList.toggle('selected',selected);
    row.querySelector('[data-layer-pick]')?.setAttribute('aria-current',String(selected));
  });};
 const select=(node,{toggle=false}={})=>{
  state.selectionPath=null;state.sceneSelectedGroup=null;
  if(node.type==='group'){
    state.sceneSelectedGroup=node.id;
    const members=sceneGroupMembers(draft,node.id);
    state.multiSelected=members.filter(e=>e.kind!=='ink').map(e=>e.value.id);
    state.selectedStrokes=members.filter(e=>e.kind==='ink').map(e=>draft.strokes.findIndex(s=>s.id===e.value.id)).filter(i=>i>=0);
    state.selected=null;
  }else if(toggle){
    const ids=new Set(selectedIDs());if(ids.has(node.id))ids.delete(node.id);else ids.add(node.id);
    const entries=record();state.multiSelected=entries.filter(e=>e.kind!=='ink'&&ids.has(e.value.id)).map(e=>e.value.id);
    state.selectedStrokes=entries.filter(e=>e.kind==='ink'&&ids.has(e.value.id)).map(e=>draft.strokes.findIndex(s=>s.id===e.value.id)).filter(i=>i>=0);
    state.selected=state.multiSelected.length===1&&!state.selectedStrokes.length?state.multiSelected[0]:null;
  }else if(node.type==='ink'){
    state.multiSelected=[];state.selected=null;
    state.selectedStrokes=[draft.strokes.findIndex(s=>s.id===node.id)].filter(i=>i>=0);
  }else{
    state.multiSelected=[node.id];state.selected=node.id;state.selectedStrokes=[];
  }
  refreshSelection();drawToolbar();
 };
 const commit=operation=>{
  const before=JSON.stringify(draft);
  try{
   checkpoint();operation();
   saveProject();
   // render() now patches the mounted editor instead of replacing its root.
   render();draw();
  }catch(error){
   status.textContent=error.message;
   if(JSON.stringify(draft)===before)state.undo?.pop();
   toast(error.message);
  }
 };
 const siblingMove=(id,direction)=>{
  const parentRow=record().find(e=>e.value.id===id)?.parents.at(-1)||null;
  const parentNodes=parentRow?.children||draft.layers;
  const order=[...parentNodes].sort((a,b)=>(a.zIndex??0)-(b.zIndex??0)),idx=order.findIndex(n=>n.id===id),dest=idx+direction;
  if(idx<0||dest<0||dest>=order.length)return;
  const without=order.filter(n=>n.id!==id),neighbor=order[dest];
  const before=direction>0?without[without.findIndex(n=>n.id===neighbor.id)+1]?.id||null:neighbor.id;
  commit(()=>moveSceneNode(draft,id,{parentID:parentRow?.id||null,beforeID:before}));
 };
 const nodeClick=(node,event)=>select(node,{toggle:multiMode||event.shiftKey||event.ctrlKey||event.metaKey});
 function drawToolbar(){
  menu.replaceChildren();
  const all=selectedIDs();
  const multiple=button(multiMode?'✓ 多选中':'多选',()=>{multiMode=!multiMode;drawToolbar();},'btn mini');
  multiple.setAttribute('aria-pressed',String(multiMode));
  const group=button('组合所选',()=>{
    const ids=selectedIDs();if(ids.length<2){status.textContent='请先选择至少两个图层';return;}
    commit(()=>{const id='group-'+uid();groupSceneLayers(draft,ids,{id,name:'手帐组合'});expanded.add(id);state.sceneSelectedGroup=id;state.multiSelected=[];state.selected=null;state.selectedStrokes=[];});
  },'btn mini');group.disabled=all.length<2;
  const ungroup=button('取消组合',()=>{
    const groupID=state.sceneSelectedGroup||record().find(e=>e.value.id===state.selected)?.parents.at(-1)?.id;
    if(!groupID)return;commit(()=>{ungroupSceneLayers(draft,groupID);state.sceneSelectedGroup=null;});
  },'btn mini');
  ungroup.disabled=!(state.sceneSelectedGroup||record().some(e=>e.value.id===state.selected&&e.parents.length));
  menu.append(multiple,group,ungroup,button('关闭',()=>p.close(),'btn mini'));
 }
 const dropCandidate=(x,y)=>{
  const hit=document.elementFromPoint?.(x,y)?.closest?.('[data-scene-node]');
  if(!hit||!list.contains(hit)||!hit.isConnected)return null;
  const id=hit.dataset.sceneNode,target=findSceneNode(draft,id);
  if(!target)return null;
  const rect=hit.getBoundingClientRect(),ratio=(y-rect.top)/Math.max(1,rect.height);
  const relation=target.type==='group'&&ratio>.28&&ratio<.72?'inside':ratio<.5?'after':'before';
  return {id,relation,row:hit};
 };
 const finishDrop=()=>{
  if(!drag)return;const {id,moved,destination}=drag;drag=null;
  list.querySelectorAll('.dragging,.drop-target').forEach(n=>n.classList.remove('dragging','drop-target'));
  if(!moved||!destination||id===destination.id)return;
  const instruction=layerMoveTarget(draft,id,destination.id,destination.relation);
  if(!instruction)return;
  commit(()=>{moveSceneNode(draft,id,instruction);if(instruction.parentID)expanded.add(instruction.parentID);});
 };
 const gripEvents=(grip,row,node)=>{
  grip.dataset.layerMove='';grip.setAttribute('aria-label','拖动图层 '+name(node));grip.style.touchAction='none';
  grip.onpointerdown=event=>{
   if(event.button>0||node.locked||node.isLocked)return;
   event.preventDefault();event.stopPropagation();drag={id:node.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,moved:false,destination:null};
   grip.setPointerCapture?.(event.pointerId);row.classList.add('dragging');
  };
  grip.onpointermove=event=>{
    if(!drag||drag.id!==node.id||drag.pointer!==event.pointerId)return;
    if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6)drag.moved=true;
    if(!drag.moved)return;
    event.preventDefault();event.stopPropagation();
    const next=dropCandidate(event.clientX,event.clientY);
    list.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));
    next?.row.classList.add('drop-target');drag.destination=next;
    const rect=list.getBoundingClientRect();
    if(event.clientY<rect.top+24)list.scrollTop-=12;
    else if(event.clientY>rect.bottom-24)list.scrollTop+=12;
  };
  grip.onpointerup=event=>{if(drag?.pointer!==event.pointerId)return;event.preventDefault();finishDrop();};
  grip.onpointercancel=finishDrop;
  grip.onkeydown=event=>{
    if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();siblingMove(node.id,event.key==='ArrowUp'?1:-1);}
  };
 };
 function draw(){
   const scroll=list.scrollTop,staging=document.createElement('div'),nextReferences=new Map();
   const leafCount=record().length;
   status.textContent=leafCount+' 个可编辑图层 · 拖动 ≡ 改变层级；放在组合中部可移入组合';
   const visit=(nodes,host,level=1)=>{
     for(const node of visibleOrder(nodes)){
       nextReferences.set(node.id,node);
       const branch=document.createElement('div');branch.className='scene-layer-branch';
       const row=document.createElement('div');row.className='canvas-layer-row scene-layer-node';row.dataset.sceneNode=node.id;row.dataset.layerId=node.id;
       row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(level));
       const collapsed=node.type==='group'&&!expanded.has(node.id);
       if(node.type==='group')row.setAttribute('aria-expanded',String(!collapsed));
       row.classList.toggle('selected',isSelected(node.id));
       const expand=button(node.type==='group'?(collapsed?'▸':'▾'):'',()=>{if(node.type!=='group')return;if(collapsed)expanded.add(node.id);else expanded.delete(node.id);draw();},'scene-layer-expand');
       expand.disabled=node.type!=='group';expand.setAttribute('aria-label',collapsed?'展开组合':'折叠组合');
       const pick=button('',e=>nodeClick(node,e),'scene-layer-pick');pick.dataset.layerPick='';pick.setAttribute('aria-current',String(isSelected(node.id)));
       const symbol=node.type==='group'?'▧':node.type==='material'?'▱':node.type==='text'?'Aa':node.type==='ink'?'✎':'◇';
       const badge=document.createElement('span');badge.className='scene-layer-symbol';badge.textContent=symbol;
       const label=document.createElement('span');label.textContent=name(node);pick.append(badge,label);
       const locked=!!(node.locked||node.isLocked);
       const lock=button('',()=>commit(()=>{node.locked=node.isLocked=!locked;}),'scene-layer-small');lock.replaceChildren(createIcon(locked?'lock':'unlock'));lock.dataset.layerLock='';lock.setAttribute('aria-label',locked?'解锁':'锁定');
       const hidden=!!(node.hidden||node.isHidden||node.isParked);
       const eye=button('',()=>commit(()=>{if(node.type==='material')node.isParked=!hidden;else node.hidden=!hidden;}),'scene-layer-small');eye.replaceChildren(createIcon(hidden?'eyeOff':'eye'));eye.dataset.layerEye='';eye.setAttribute('aria-label',hidden?'显示':'隐藏');eye.disabled=locked;
       const up=button('↑',()=>siblingMove(node.id,1),'scene-layer-small scene-layer-step');up.setAttribute('aria-label','上移一层');up.disabled=locked;
       const down=button('↓',()=>siblingMove(node.id,-1),'scene-layer-small scene-layer-step');down.setAttribute('aria-label','下移一层');down.disabled=locked;
       const grip=button('≡',()=>{},'scene-layer-grip');gripEvents(grip,row,node);grip.disabled=locked;
       row.append(expand,pick,lock,eye,up,down,grip);branch.append(row);
       if(node.type==='group'){
         const children=document.createElement('div');children.className='scene-layer-children';children.setAttribute('role','group');
         if(!collapsed)visit(node.children||[],children,level+1);
         else children.hidden=true;
         branch.append(children);
       }
       host.append(branch);
     }
   };
   const initial=sceneLayerOutline(draft.layers).filter(n=>n.type==='group').map(n=>n.id);
   for(const id of initial)if(!nodesSeen.has(id)){expanded.add(id);nodesSeen.add(id);}
   visit(draft.layers,staging);
   reconcileLayerBranches(list,staging,lastTreeReferences,nextReferences);
   lastTreeReferences=nextReferences;
   list.scrollTop=scroll;p.position();drawToolbar();
 }
 draw();
 return {close:p.close,refresh:draw,surface:p.surface};
}
