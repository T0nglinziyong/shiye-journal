import React,{useLayoutEffect,useRef} from 'react';
import {drawPaper} from './paper-rendering.js';
import {createFabricSceneBridge} from './fabric-scene-bridge.js';
import {projectFabricLayers} from './fabric-layer-loader.js';
import {paperWidthPixels,pressureInkOutline,erasePressureStroke} from './pressure-ink.js';
import {textBlock} from './domain.js';
import {polygonContains,selectionBounds} from './canvas-selection.js';
import {selectSceneLasso,sceneLassoBounds,moveSceneLasso,transformSceneLasso} from './scene-lasso.js';
import {attachSceneV2,assertSceneEditable,sceneLayerEntries} from './scene-v2.js';
import {sceneDisplaySiblings} from './craft-display.js';
import {prepareSceneFonts} from './scene-renderer.js';
import {appendInkStroke,editableInkLayer} from './ink-groups.js';
import {fabricPointer,installFabricPointer} from './fabric-pointer.js';
import {createFabricSelectionPreview} from './fabric-selection-preview.js';
import {configureFabricEditorFrame} from './fabric-editor-frame.js';
import {selectableFabricObjectAt,installSelectionFramePriority} from './fabric-hit-test.js';

const byID=(nodes,id)=>{
  for(const node of nodes||[]){
    if(node.id===id)return node;
    if(node.type==='group'){
      const child=byID(node.children,id);
      if(child)return child;
    }
  }
  return null;
};
const editable=(draft,id)=>{try{assertSceneEditable(draft,id);return true;}catch{return false;}};
const materialAssetIDs=(nodes,found=new Set())=>{
  for(const node of nodes||[]){
    if(node.type==='material'&&node.assetID)found.add(node.sourceBlobId||node.assetID);
    if(node.type==='group')materialAssetIDs(node.children,found);
  }
  return [...found].sort();
};
const selectionLeaves=(draft,ids)=>{
  const selected=new Set(ids);
  return sceneLayerEntries(draft,{hidden:true}).filter(entry=>selected.has(entry.value.id)||
    entry.parents.some(parent=>selected.has(parent.id))).map(entry=>entry.value.id);
};
const intersects=(a,b)=>a&&b&&a.left<b.left+b.width&&a.left+a.width>b.left&&
  a.top<b.top+b.height&&a.top+a.height>b.top;
function showCoveredCutTarget(canvas,draft,tool,ids){
  const objects=canvas.getObjects();
  for(const object of objects){
    if(object.__cutOriginalOpacity!==undefined){
      object.set('opacity',object.__cutOriginalOpacity);
      delete object.__cutOriginalOpacity;
    }
  }
  if(tool!=='scissors'||!ids.length)return;
  const targetIDs=new Set([...ids,...selectionLeaves(draft,ids)]);
  const targets=objects.filter(object=>targetIDs.has(object.sceneID));
  const boxes=targets.map(object=>object.getBoundingRect());
  const bottom=Math.min(...targets.map(object=>object.sceneIndex??Infinity));
  if(!Number.isFinite(bottom))return;
  for(const object of objects){
    if(targetIDs.has(object.sceneID)||!(object.sceneIndex>bottom)||
      !boxes.some(box=>intersects(object.getBoundingRect(),box)))continue;
    object.__cutOriginalOpacity=object.opacity;
    object.set('opacity',Math.min(object.opacity??1,.24));
  }
  canvas.requestRenderAll();
}

// Fabric owns this canvas for the whole draft lifetime. React owns the host,
// tool panels and route lifecycle; a pointer packet never crosses a JSX render.
export function FabricSceneStage({draft,assetURL,retainAssets,onSelection,onBeforeChange,onChange,onIssue,onReady,
  tool='select',pen={widthMM:.5,color:'#2b5245'},marker={widthMM:2,color:'#f5cf45'},
  eraser={widthMM:4},selectionMode='contain',readOnly=false,sceneRevision=0,
  selectedID=null,selectedIDs=[],selectionFilter=null,textDefaults=null,cutPreview=null,onCutPath=null,onCutTap=null}){
  const canvasRef=useRef(null),sessionRef=useRef(null),reconcileRef=useRef(null),callbacks=useRef(null);
  const syncingSelection=useRef(false),selectionEpoch=useRef(0);
  const selectionKey=JSON.stringify(selectedIDs.length?selectedIDs:selectedID?[selectedID]:[]);
  const materialKey=materialAssetIDs(draft.layers).join('\0');
  callbacks.current={draft,assetURL,onSelection,onBeforeChange,onChange,onIssue,onReady,tool,pen,marker,
    eraser,selectionMode,selectionFilter,selectedID,selectedIDs,textDefaults,cutPreview,onCutPath,onCutTap};

  useLayoutEffect(()=>retainAssets?.(materialKey?materialKey.split('\0'):[])||undefined,
    [materialKey,retainAssets]);

  useLayoutEffect(()=>{reconcileRef.current?.();},[draft,sceneRevision]);

  useLayoutEffect(()=>{sessionRef.current?.requestRenderAll();},[cutPreview,selectedID,tool]);

  useLayoutEffect(()=>{
    const canvas=sessionRef.current;
    if(canvas)showCoveredCutTarget(canvas,draft,tool,
      selectedIDs.length?selectedIDs:selectedID?[selectedID]:[]);
  },[draft,sceneRevision,tool,selectionKey]);

  useLayoutEffect(()=>{
    if(tool==='lasso'&&!selectedIDs.length)sessionRef.current?.sceneClearLasso?.();
  },[tool,selectedIDs]);

  useLayoutEffect(()=>{
    const canvas=sessionRef.current;
    if(!canvas||!['select','lasso','text'].includes(tool))return;
    if(tool==='lasso'){
      ++selectionEpoch.current;
      const proxy=canvas.getObjects().find(item=>item.sceneSelectionProxy);
      proxy?.scenePreview?.restore();
      syncingSelection.current=true;
      canvas.discardActiveObject();if(proxy)canvas.remove(proxy);canvas.requestRenderAll();
      syncingSelection.current=false;
      return;
    }
    const ids=selectedIDs.length?selectedIDs:selectedID?[selectedID]:[];
    const stillSelected=()=>JSON.stringify(callbacks.current.selectedIDs?.length?
      callbacks.current.selectedIDs:callbacks.current.selectedID?[callbacks.current.selectedID]:[])===
      JSON.stringify(ids);
    const epoch=++selectionEpoch.current;
    const ink=ids.length===1?byID(callbacks.current.draft.layers,ids[0]):null;
    const oldProxy=canvas.getObjects().find(item=>item.sceneSelectionProxy);
    if(oldProxy){oldProxy.scenePreview?.restore();syncingSelection.current=true;canvas.discardActiveObject();canvas.remove(oldProxy);
      syncingSelection.current=false;}
    const selectedNode=ids.length===1?byID(callbacks.current.draft.layers,ids[0]):null;
    // A top-level image awaiting decode is not a nested object. Derive
    // ancestry from Scene, or a late proxy can replace its real resize frame.
    const nested=selectedNode&&!callbacks.current.draft.layers.some(item=>item.id===selectedNode.id);
    if(ids.length>1||nested&&selectedNode.type!=='ink'){
      const current=callbacks.current.draft,leaves=selectionLeaves(current,ids);
      const bounds=ids.every(id=>editable(current,id))&&leaves.length>=1?
        sceneLassoBounds(current,leaves):null;
      if(!bounds){
        syncingSelection.current=true;canvas.discardActiveObject();syncingSelection.current=false;
        canvas.requestRenderAll();return;
      }
      if(bounds)void import('fabric').then(fabric=>{
        const {Rect}=fabric;
        if(selectionEpoch.current!==epoch||sessionRef.current!==canvas||
          callbacks.current.tool!=='select'||!stillSelected())return;
        const proxy=new Rect({left:bounds.x+bounds.width/2,top:bounds.y+bounds.height/2,
          originX:'center',originY:'center',width:Math.max(2,bounds.width),
          height:Math.max(2,bounds.height),fill:'rgba(0,0,0,0)',stroke:null,
          lockScalingX:true,lockScalingY:true,lockSkewingX:true,lockSkewingY:true,
          cornerSize:20,touchCornerSize:42,borderColor:'#416c59',cornerColor:'#fffefa',
          cornerStrokeColor:'#416c59',transparentCorners:false});
        configureFabricEditorFrame(fabric,proxy);
        proxy.sceneSelectionProxy=true;proxy.sceneMultiIDs=[...ids];
        proxy.sceneTransformIDs=leaves;
        proxy.sceneMultiPose={center:proxy.getCenterPoint(),angle:proxy.angle||0};
        proxy.scenePreview=createFabricSelectionPreview(fabric,canvas,leaves);
        syncingSelection.current=true;canvas.add(proxy);canvas.setActiveObject(proxy);
        canvas.requestRenderAll();syncingSelection.current=false;
      }).catch(error=>callbacks.current.onIssue?.(error));
      return;
    }
    if(ink?.type==='ink'&&editable(callbacks.current.draft,ink.id)){
      const bounds=sceneLassoBounds(callbacks.current.draft,ids);
      if(bounds)void import('fabric').then(fabric=>{
        const {Rect}=fabric;
        if(selectionEpoch.current!==epoch||sessionRef.current!==canvas||
          !stillSelected()||callbacks.current.tool!=='select')return;
        const proxy=new Rect({left:bounds.x+bounds.width/2,top:bounds.y+bounds.height/2,
          originX:'center',originY:'center',width:Math.max(2,bounds.width),
          height:Math.max(2,bounds.height),fill:'rgba(0,0,0,0)',stroke:null,
          lockScalingX:true,lockScalingY:true,lockSkewingX:true,lockSkewingY:true,
          cornerSize:20,touchCornerSize:42,borderColor:'#416c59',cornerColor:'#fffefa',
          cornerStrokeColor:'#416c59',transparentCorners:false});
        configureFabricEditorFrame(fabric,proxy);
        proxy.sceneID=ink.id;proxy.sceneType='ink';proxy.sceneSelectionProxy=true;
        proxy.sceneInkMatrix=proxy.calcTransformMatrix();
        proxy.sceneMultiPose={center:proxy.getCenterPoint(),angle:proxy.angle||0};
        proxy.scenePreview=createFabricSelectionPreview(fabric,canvas,[ink.id]);
        syncingSelection.current=true;canvas.add(proxy);canvas.setActiveObject(proxy);
        canvas.requestRenderAll();syncingSelection.current=false;
      }).catch(error=>callbacks.current.onIssue?.(error));
      return;
    }
    const object=ids.length===1?canvas.getObjects().find(item=>
      item.sceneID===ids[0]&&item.selectable!==false):null;
    const active=canvas.getActiveObjects();
    syncingSelection.current=true;
    if(object&&(!active.length||active.length!==1||active[0]!==object)){
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
    }else if(canvas.getActiveObject()&&(!object||!ids.length)){
      canvas.discardActiveObject();canvas.requestRenderAll();
    }
    syncingSelection.current=false;
  },[selectionKey,tool,sceneRevision]);

  useLayoutEffect(()=>{
    const canvas=sessionRef.current;
    if(!canvas)return;
    canvas.selection=false;
    canvas.skipTargetFind=tool!=='select'||readOnly;
    canvas.defaultCursor=['pen','highlighter','lasso','scissors'].includes(tool)?'crosshair':tool==='eraser'?'cell':'default';
    if(tool!=='lasso')canvas.sceneClearLasso?.();
    if(!['select','lasso','text'].includes(tool)){canvas.getActiveObject()?.exitEditing?.();
      syncingSelection.current=true;canvas.discardActiveObject();syncingSelection.current=false;
      const proxy=canvas.getObjects().find(item=>item.sceneSelectionProxy);
      proxy?.scenePreview?.restore();
      if(proxy)canvas.remove(proxy);
      canvas.requestRenderAll();}
    if(tool!=='text')canvas.sceneDiscardEmptyText?.();
  },[tool,readOnly]);

  useLayoutEffect(()=>{
    let disposed=false,canvas=null;
    const start=async()=>{
      try{
        attachSceneV2(draft);
        const [fabric]=await Promise.all([import('fabric'),prepareSceneFonts(draft)]);
        if(disposed)return;
        canvas=new fabric.Canvas(canvasRef.current,{
          width:draft.canvas.width,height:draft.canvas.height,
          backgroundColor:draft.paperColor,preserveObjectStacking:true,
          selection:!readOnly,perPixelTargetFind:true,
          enableRetinaScaling:true,renderOnAddRemove:false
        });
        sessionRef.current=canvas;
        installFabricPointer(canvas,fabric.Point);
        installSelectionFramePriority(canvas);
        canvas.selection=false;
        canvas.skipTargetFind=callbacks.current.tool!=='select'||readOnly;
        const paperKey=current=>JSON.stringify([current.canvas,current.paperColor,
          current.paperPattern,current.paperRuling,current.pageMode,current.drawCenterGutter]);
        let renderedPaperKey='';
        const paintPaper=current=>{
          const nextKey=paperKey(current);
          if(nextKey===renderedPaperKey)return;
          renderedPaperKey=nextKey;
          if(canvas.width!==current.canvas.width||canvas.height!==current.canvas.height)
            canvas.setDimensions({width:current.canvas.width,height:current.canvas.height});
          const background=document.createElement('canvas');
          background.width=current.canvas.width;background.height=current.canvas.height;
          drawPaper(background.getContext('2d'),current);
          canvas.backgroundColor=current.paperColor;
          canvas.backgroundImage=new fabric.FabricImage(background,{
            left:0,top:0,originX:'left',originY:'top',selectable:false,evented:false});
          canvas.requestRenderAll();
        };
        paintPaper(draft);
        canvas.requestRenderAll();
        callbacks.current.onReady?.(canvas);
        const bridge=createFabricSceneBridge(fabric,{
          assetURL:(id,node)=>callbacks.current.assetURL?.(id,node,()=>{
            if(disposed||!projected().some(item=>renderKey(item)===renderKey(node)&&
              snapshot(item)===snapshot(node)))return;
            if(canvas._currentTransform){
              canvas.once('mouse:up',()=>{
                if(disposed)return;
                const key=renderKey(node),index=projected().findIndex(item=>renderKey(item)===key&&
                  snapshot(item)===snapshot(node));
                if(index<0)return;
                const version=(sceneVersions.get(key)||0)+1;
                sceneVersions.set(key,version);addProjected(node,index,version);
              });
              return;
            }
            const key=renderKey(node),index=projected().findIndex(item=>renderKey(item)===key);
            const version=(sceneVersions.get(key)||0)+1;
            sceneVersions.set(key,version);
            addProjected(node,index,version);
          }),
          canvasSize:()=>callbacks.current.draft.canvas
        });
        const sceneVersions=new Map();
        const projected=()=>sceneDisplaySiblings(callbacks.current.draft.layers||[]);
        const renderKey=node=>node.renderKey||node.id;
        const snapshot=node=>JSON.stringify([node,node.type==='group'&&node.vectorMask?
          callbacks.current.draft.canvas:null]);
        const signatures=new Map(projected().map(node=>[renderKey(node),snapshot(node)]));
        const remember=id=>{
          const node=callbacks.current.draft.layers.find(item=>item.id===id);
          if(node){
            for(const piece of projected().filter(item=>(item.ownerID||item.id)===id))
              signatures.set(renderKey(piece),snapshot(piece));
          }
          else signatures.delete(id);
        };
        const addProjected=(node,sceneIndex,version,onAdded)=>{
          const key=renderKey(node);
          return bridge.fromNode(node).then(object=>{
            if(disposed||!projected().some(item=>renderKey(item)===key&&snapshot(item)===snapshot(node))||
              (sceneVersions.get(key)||0)!==version)return;
            // Decode the replacement before touching the visible object. A
            // slow image cannot leave a blank hole in an already drawn page.
            const old=canvas.getObjects().filter(item=>item.sceneRenderKey===key);
            const selectedNode=node.type!=='ink'&&['select','text'].includes(callbacks.current.tool)&&
              callbacks.current.selectedID===node.id;
            const keepSelected=selectedNode&&object?.selectable!==false;
            const replacingActive=old.some(item=>canvas.getActiveObject()===item);
            if(replacingActive)syncingSelection.current=true;
            for(const item of old)canvas.remove(item);
            if(object){
              object.sceneIndex=sceneIndex;
              if(readOnly)object.set({selectable:false,evented:false});
              const position=canvas.getObjects().filter(item=>item.sceneIndex<sceneIndex).length;
              canvas.insertAt(position,object);
              if(callbacks.current.tool==='scissors')showCoveredCutTarget(canvas,
                callbacks.current.draft,callbacks.current.tool,
                callbacks.current.selectedIDs?.length?callbacks.current.selectedIDs:
                  callbacks.current.selectedID?[callbacks.current.selectedID]:[]);
              if(keepSelected)canvas.setActiveObject(object);
              const proxy=canvas.getActiveObject();
              if(proxy?.scenePreview&&proxy.sceneMultiPose)
                proxy.scenePreview.apply(proxy.sceneMultiPose.center,proxy.getCenterPoint(),
                  (proxy.angle||0)-proxy.sceneMultiPose.angle);
            }
            if(replacingActive)syncingSelection.current=false;
            if(selectedNode){
              const bounds=object?.getBoundingRect();
              callbacks.current.onSelection?.(keepSelected&&bounds?[node.id]:[],keepSelected&&bounds?{x:bounds.left,y:bounds.top,
                width:bounds.width,height:bounds.height}:null);
            }
            // A newly selected shape or material must paint at its final
            // location before the old frame can linger through another rAF.
            if(keepSelected)canvas.renderAll();else canvas.requestRenderAll();
            if(object)onAdded?.(object);
          }).catch(error=>{if(!disposed){signatures.delete(key);callbacks.current.onIssue?.(error);}});
        };
        reconcileRef.current=()=>{
          const current=callbacks.current.draft;
          if(!current||current.id!==draft.id)return;
          paintPaper(current);
          const sorted=projected();
          const present=new Set(sorted.map(renderKey));
          const positions=new Map(sorted.map((node,index)=>[renderKey(node),index]));
          for(const id of signatures.keys())if(!present.has(id)){
            signatures.delete(id);sceneVersions.set(id,(sceneVersions.get(id)||0)+1);
          }
          const obsolete=canvas.getObjects().filter(object=>object.sceneRenderKey&&!present.has(object.sceneRenderKey));
          if(obsolete.length){
            // Replacing a grouped Scene tree removes its old Fabric object.
            // That removal is not a user request to clear the new selection.
            syncingSelection.current=true;
            for(const object of obsolete)canvas.remove(object);
            syncingSelection.current=false;
          }
          for(const [sceneIndex,node] of sorted.entries()){
            const key=renderKey(node);
            const next=snapshot(node);
            if(signatures.get(key)===next)continue;
            signatures.set(key,next);
            const version=(sceneVersions.get(key)||0)+1;
            sceneVersions.set(key,version);
            addProjected(node,sceneIndex,version);
          }
          const existing=canvas.getObjects().filter(object=>positions.has(object.sceneRenderKey));
          for(const object of existing)object.sceneIndex=positions.get(object.sceneRenderKey);
          existing.sort((a,b)=>a.sceneIndex-b.sceneIndex);
          existing.forEach((object,index)=>canvas.moveObjectTo(object,index));
          canvas.requestRenderAll();
        };
        let gesture=null,previewFrame=0,textPointerID=null,textTap=null,pendingTouchText=null;
        let lassoSelection=null;
        canvas.sceneClearLasso=()=>{canvas.sceneCancelGesture?.();lassoSelection=null;
          canvas.clearContext(canvas.contextTop);};
        const uncommittedText=new Set();
        const discardEmptyText=id=>{
          if(!uncommittedText.delete(id))return;
          const current=callbacks.current.draft;
          const node=current.layers.find(item=>item.id===id);
          if(!node||String(node.content||'').trim())return;
          current.layers.splice(current.layers.indexOf(node),1);
          sceneVersions.set(id,(sceneVersions.get(id)||0)+1);
          remember(id);
          for(const object of canvas.getObjects().filter(item=>item.sceneID===id))canvas.remove(object);
          canvas.requestRenderAll();
          callbacks.current.onChange?.(node,'text:cancel');
        };
        canvas.sceneDiscardEmptyText=()=>{for(const id of [...uncommittedText])discardEmptyText(id);};
        const pointer=event=>{
          const point=fabricPointer(canvas,event).scene;
          // Mouse and touch have no trustworthy pressure curve. Omitting p
          // lets the shared stroke renderer infer one from movement instead.
          return event.pointerType==='pen'?
            {x:point.x,y:point.y,p:Math.max(.02,Math.min(1,event.pressure||.5))}:
            {x:point.x,y:point.y};
        };
        const samples=event=>{
          const coalesced=event.getCoalescedEvents?.();
          const events=coalesced?.length?coalesced:[event];
          const result=events.map(pointer),last=pointer(event);
          if(!result.length||Math.hypot(result.at(-1).x-last.x,result.at(-1).y-last.y)>.1)
            result.push(last);
          return result;
        };
        const frameCorners=frame=>{
          const halfW=frame.width/2,halfH=frame.height/2,a=frame.angle*Math.PI/180,
            c=Math.cos(a),s=Math.sin(a);
          return [[-halfW,-halfH],[halfW,-halfH],[halfW,halfH],[-halfW,halfH]]
            .map(([x,y])=>({x:frame.center.x+x*c-y*s,y:frame.center.y+x*s+y*c}));
        };
        const uiScale=()=>Math.max(.1,canvas.upperCanvasEl.getBoundingClientRect().width/canvas.width);
        const frameHandle=frame=>frameCorners(frame)[2];
        const frameBounds=frame=>selectionBounds(frameCorners(frame));
        const beginLassoGesture=(tool,event,fields)=>{
          const current=callbacks.current.draft;
          try{for(const id of lassoSelection.ids)assertSceneEditable(current,id);}
          catch(error){callbacks.current.onIssue?.(error);return false;}
          callbacks.current.onBeforeChange?.('lasso:'+tool);
          gesture={id:event.pointerId,tool:'lasso-'+tool,moved:false,draft:current,
            beforeFrame:structuredClone(lassoSelection),
            beforeNodes:lassoSelection.ids.map(id=>[id,structuredClone(byID(current.layers,id))]),
            ...fields};
          canvas.upperCanvasEl.setPointerCapture(event.pointerId);
          event.preventDefault();event.stopImmediatePropagation();
          return true;
        };
        const rollbackLasso=(finished,notify=true)=>{
          if(!finished?.beforeNodes)return;
          for(const [id,before] of finished.beforeNodes){
            const node=byID(finished.draft.layers,id);
            if(!node)continue;
            for(const key of Object.keys(node))delete node[key];
            Object.assign(node,before);
          }
          lassoSelection=finished.beforeFrame;
          reconcileRef.current?.();canvas.requestRenderAll();
          if(notify&&callbacks.current.tool==='lasso'){
            preview();callbacks.current.onSelection?.(lassoSelection.ids,frameBounds(lassoSelection));
          }
        };
        canvas.sceneCancelGesture=(notify=true)=>{
          const unfinished=gesture;gesture=null;
          if(unfinished?.tool==='lasso-move'||unfinished?.tool==='lasso-transform')
            rollbackLasso(unfinished,notify);
        };
        const preview=()=>{
          const lasso=gesture?.tool==='lasso'?gesture.points:null;
          // Fabric paints its selection border and handles on contextTop.
          // Clearing that context after every render erased the editing frame
          // one animation frame after a layer was selected.
          const cut=callbacks.current.tool==='scissors'?callbacks.current.cutPreview:null;
          if(!gesture&&(!lassoSelection||callbacks.current.tool!=='lasso')&&!cut&&
            !(callbacks.current.tool==='scissors'&&
              (callbacks.current.selectedID||callbacks.current.selectedIDs?.length)))return;
          const ctx=canvas.contextTop;
          canvas.clearContext(ctx);ctx.save();
          ctx.transform(...canvas.viewportTransform);
          const cutFrame=()=>{
            const ids=callbacks.current.selectedIDs?.length?callbacks.current.selectedIDs:
              callbacks.current.selectedID?[callbacks.current.selectedID]:[];
            const object=ids.length===1?canvas.getObjects().find(item=>item.sceneID===ids[0]):null;
            const box=object?.getBoundingRect()||
              (ids.length?sceneLassoBounds(callbacks.current.draft,
                selectionLeaves(callbacks.current.draft,ids)):null);
            if(!box)return;
            const scale=uiScale();
            ctx.strokeStyle='#b65736';ctx.lineWidth=2/scale;ctx.setLineDash([6/scale,4/scale]);
            ctx.strokeRect(box.left??box.x,box.top??box.y,box.width,box.height);ctx.setLineDash([]);
          };
          if(gesture?.tool==='scissors'){
            cutFrame();
            ctx.strokeStyle='#c26942';ctx.lineWidth=2/uiScale();ctx.setLineDash([7/uiScale(),4/uiScale()]);
            ctx.beginPath();gesture.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
            ctx.stroke();ctx.setLineDash([]);
          }else if(cut){
            cutFrame();
            for(const piece of cut.pieces||[]){
              if(!piece.outline?.length)continue;
              const keep=cut.keepKeys.includes(piece.key);
              ctx.strokeStyle=keep?'#276d50':'#c26942';ctx.fillStyle=keep?'rgba(44,128,83,.10)':'rgba(194,105,66,.12)';
              ctx.lineWidth=2/uiScale();ctx.setLineDash(keep?[]:[6/uiScale(),4/uiScale()]);
              ctx.beginPath();
              if(piece.hitGeometry?.length){
                for(const polygon of piece.hitGeometry)for(const ring of polygon){
                  ring.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
                }
                ctx.fill('evenodd');
              }else{
                piece.outline.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
                if(piece.type!=='ink'){ctx.closePath();ctx.fill();}
              }
              ctx.stroke();
            }
            ctx.setLineDash([]);
          }else if(callbacks.current.tool==='scissors'&&
            (callbacks.current.selectedID||callbacks.current.selectedIDs?.length)){
            cutFrame();
          }else if(gesture?.tool==='pen'||gesture?.tool==='highlighter'){
            const outline=pressureInkOutline({points:gesture.points,width:gesture.width});
            if(outline.length){ctx.globalAlpha=gesture.tool==='highlighter'?.38:1;
              ctx.fillStyle=gesture.color;ctx.beginPath();ctx.moveTo(...outline[0]);
              for(const point of outline.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.fill();}
          }else if(lasso){
            ctx.strokeStyle='#2b5245';ctx.lineWidth=2;ctx.setLineDash([7,5]);
            ctx.fillStyle='rgba(80,130,90,.08)';ctx.beginPath();
            lasso.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
            ctx.stroke();if(lasso.length>2){ctx.closePath();ctx.fill();}
          }else if(lassoSelection){
            const corners=frameCorners(lassoSelection),handle=frameHandle(lassoSelection);
            const scale=uiScale(),grip=4/scale;
            ctx.lineWidth=2/scale;ctx.strokeStyle='#2b5245';ctx.fillStyle='rgba(80,130,90,.045)';
            ctx.setLineDash([7,5]);ctx.beginPath();
            corners.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
            ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([]);
            for(const point of [corners[0],corners[1],corners[3]]){ctx.fillStyle='#fffefa';ctx.strokeStyle='#2b5245';
              ctx.fillRect(point.x-grip,point.y-grip,grip*2,grip*2);
              ctx.strokeRect(point.x-grip,point.y-grip,grip*2,grip*2);}
            ctx.save();ctx.translate(handle.x,handle.y);ctx.scale(1/scale,1/scale);
            ctx.fillStyle='#fffefa';ctx.strokeStyle='#2b5245';ctx.lineWidth=1.5;
            ctx.beginPath();ctx.roundRect(-10,-10,20,20,5);ctx.fill();ctx.stroke();
            ctx.beginPath();ctx.arc(-1,-1,4,-Math.PI*.88,Math.PI*.45);ctx.stroke();
            ctx.beginPath();ctx.moveTo(1,2);ctx.lineTo(6,6);ctx.moveTo(2,6);
            ctx.lineTo(6,6);ctx.lineTo(6,2);ctx.stroke();ctx.restore();
          }else{
            ctx.strokeStyle='rgba(48,70,61,.4)';ctx.lineWidth=gesture.width;
            ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
            gesture.points.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
            ctx.stroke();
            const point=gesture.points.at(-1);
            if(point){ctx.strokeStyle='rgba(48,70,61,.8)';ctx.lineWidth=1;
              ctx.beginPath();ctx.arc(point.x,point.y,gesture.width/2,0,Math.PI*2);ctx.stroke();}
          }
          ctx.restore();
        };
        const queuePreview=()=>{
          if(previewFrame)return;
          previewFrame=requestAnimationFrame(()=>{previewFrame=0;preview();});
        };
        canvas.on('after:render',queuePreview);
        const activateText=event=>{
            const current=callbacks.current.draft,point=pointer(event);
            if(point.x<0||point.y<0||point.x>current.canvas.width||point.y>current.canvas.height)return;
            const scenePoint=new fabric.Point(point.x,point.y),active=canvas.getActiveObject();
            const hit=active?.visible!==false&&active?.selectable!==false&&active?.containsPoint(scenePoint)?active:
              canvas.getObjects().findLast(object=>selectableFabricObjectAt(canvas,object,
                scenePoint,fabricPointer(canvas,event).viewport));
            if(hit){
              canvas.setActiveObject(hit);
              if(hit.sceneType==='text'){
                if(event.pointerType==='touch')pendingTouchText={id:hit.sceneID,object:hit,ended:false};
                else{hit.enterEditing?.();hit.hiddenTextarea?.focus();}
              }
              canvas.requestRenderAll();
              return;
            }
            const width=Math.max(60,Math.min(current.canvas.width*.35,current.canvas.width-point.x));
            const node={...textBlock('',current),...callbacks.current.textDefaults,
              id:globalThis.crypto?.randomUUID?.()||'text-'+Math.random().toString(36).slice(2),
              type:'text',x:point.x+width/2,y:point.y+50,width,height:100,
              alignment:callbacks.current.textDefaults?.alignment||'left',
              zIndex:Math.max(1000,...current.layers.map(item=>item.zIndex||0))+1};
            callbacks.current.onBeforeChange?.('text:new');
            current.layers.push(node);
            uncommittedText.add(node.id);
            remember(node.id);
            const index=current.layers.length-1;
            if(event.pointerType==='touch')pendingTouchText={id:node.id,object:null,ended:false};
            void addProjected(node,index,sceneVersions.get(node.id)||0,object=>{
              if(event.pointerType==='touch'){
                if(pendingTouchText?.id!==node.id)return;
                pendingTouchText.object=object;
                if(pendingTouchText.ended)requestAnimationFrame(focusTouchText);
              }else{
                canvas.setActiveObject(object);object.enterEditing?.();
                object.hiddenTextarea?.focus();canvas.requestRenderAll();
              }
            });
            callbacks.current.onChange?.(node,'text:new');
            return;
        };
        const onPointerDown=event=>{
          const mode=callbacks.current.tool;
          if(readOnly||!['pen','highlighter','eraser','text','lasso','scissors'].includes(mode)||event.button>0)return;
          event.preventDefault();event.stopImmediatePropagation();
          if(mode==='text'){
            textPointerID=event.pointerId;
            textTap={x:event.clientX,y:event.clientY,moved:false};
            canvas.upperCanvasEl.setPointerCapture(event.pointerId);
            return;
          }
          if(mode==='lasso'&&lassoSelection?.ids.length){
            const start=pointer(event);
            const handle=frameHandle(lassoSelection);
            if(Math.hypot(start.x-handle.x,start.y-handle.y)<20/uiScale()){
              beginLassoGesture('transform',event,{
                lastAngle:Math.atan2(start.y-lassoSelection.center.y,start.x-lassoSelection.center.x),
                lastDistance:Math.hypot(start.x-lassoSelection.center.x,start.y-lassoSelection.center.y)});
              return;
            }
            if(polygonContains(start,frameCorners(lassoSelection))){
              beginLassoGesture('move',event,{last:start});return;
            }
          }
          lassoSelection=null;
          canvas.discardActiveObject();
          const settings=mode==='pen'?callbacks.current.pen:
            mode==='highlighter'?callbacks.current.marker:callbacks.current.eraser;
          gesture={id:event.pointerId,tool:mode,points:samples(event),
            startX:event.clientX,startY:event.clientY,moved:false,
            width:['lasso','scissors'].includes(mode)?2:paperWidthPixels(callbacks.current.draft,
              settings?.widthMM??(mode==='pen'?.5:mode==='highlighter'?2:4)),
            color:settings?.color||'#2b5245',style:settings?.style,
            straight:settings?.straight};
          canvas.upperCanvasEl.setPointerCapture(event.pointerId);
          preview();
        };
        const onPointerMove=event=>{
          if(textPointerID===event.pointerId&&textTap){
            if(Math.hypot(event.clientX-textTap.x,event.clientY-textTap.y)>5)textTap.moved=true;
            event.preventDefault();event.stopImmediatePropagation();return;
          }
          if(!gesture||gesture.id!==event.pointerId)return;
          event.preventDefault();event.stopImmediatePropagation();
          if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>7)gesture.moved=true;
          if(gesture.tool==='lasso-move'){
            const next=pointer(event),dx=next.x-gesture.last.x,dy=next.y-gesture.last.y;
            if(dx||dy){
              if(!moveSceneLasso(gesture.draft,lassoSelection.ids,dx,dy))return;
              lassoSelection.center.x+=dx;lassoSelection.center.y+=dy;
              gesture.last=next;gesture.moved=true;reconcileRef.current?.();queuePreview();
              canvas.upperCanvasEl.dispatchEvent(new CustomEvent('shiye:fabric-object-transform',
                {detail:{bounds:frameBounds(lassoSelection)}}));
            }
            return;
          }
          if(gesture.tool==='lasso-transform'){
            const next=pointer(event),distance=Math.hypot(next.x-lassoSelection.center.x,
              next.y-lassoSelection.center.y);
            if(distance<1)return;
            const angle=Math.atan2(next.y-lassoSelection.center.y,next.x-lassoSelection.center.x);
            let degrees=(angle-gesture.lastAngle)*180/Math.PI;
            if(degrees>180)degrees-=360;if(degrees< -180)degrees+=360;
            const ratio=Math.max(.1,Math.min(10,distance/Math.max(1,gesture.lastDistance)));
            if(Math.abs(degrees)>.01||Math.abs(ratio-1)>.001){
              if(!transformSceneLasso(gesture.draft,lassoSelection.ids,
                lassoSelection.center,ratio,degrees))return;
              lassoSelection.angle+=degrees;lassoSelection.width*=ratio;lassoSelection.height*=ratio;
              gesture.lastAngle=angle;gesture.lastDistance=distance;gesture.moved=true;
              reconcileRef.current?.();queuePreview();
              canvas.upperCanvasEl.dispatchEvent(new CustomEvent('shiye:fabric-object-transform',
                {detail:{bounds:frameBounds(lassoSelection)}}));
            }
            return;
          }
          for(const point of samples(event)){
            const previous=gesture.points.at(-1);
            const spacing=gesture.tool==='eraser'?Math.max(.5,gesture.width*.25):
              ['lasso','scissors'].includes(gesture.tool)?1:.15;
            if(!previous||Math.hypot(point.x-previous.x,point.y-previous.y)>spacing)
              gesture.points.push(point);
          }
          queuePreview();
        };
        const onPointerEnd=event=>{
          if(textPointerID===event.pointerId){
            textPointerID=null;
            const tap=textTap;textTap=null;
            if(event.type==='pointerup'&&tap&&!tap.moved)activateText(event);
            else pendingTouchText=null;
            event.preventDefault();event.stopImmediatePropagation();
            return;
          }
          if(!gesture||gesture.id!==event.pointerId)return;
          event.preventDefault();event.stopImmediatePropagation();
          const finished=gesture;gesture=null;
          if(finished.tool==='lasso-move'||finished.tool==='lasso-transform'){
            if(event.type==='pointercancel'){
              rollbackLasso(finished);
              return;
            }
            preview();
            if(finished.moved){callbacks.current.onSelection?.(lassoSelection.ids,frameBounds(lassoSelection));
              callbacks.current.onChange?.(null,finished.tool);}
            return;
          }
          canvas.clearContext(canvas.contextTop);
          if(event.type==='pointercancel'){preview();return;}
          const point=pointer(event),prior=finished.points.at(-1);
          if(prior&&Math.hypot(point.x-prior.x,point.y-prior.y)>.15)finished.points.push(point);
          const current=callbacks.current.draft;
          if(finished.tool==='scissors'){
            preview();
            if(!finished.moved)callbacks.current.onCutTap?.(event);
            else if(finished.points.length>=2){
              const start=finished.points[0],end=finished.points.at(-1);
              const closed=finished.points.length>=4&&
                Math.hypot(start.x-end.x,start.y-end.y)*uiScale()<=18;
              callbacks.current.onCutPath?.(finished.points,closed);
            }
          }else if(finished.tool==='lasso'){
            if(finished.points.length<3){callbacks.current.onSelection?.([]);return;}
            const mode=callbacks.current.selectionMode||'contain';
            const ids=selectSceneLasso(current,finished.points,
              callbacks.current.selectionFilter||{material:true,text:true,shape:true,ink:true},mode);
            const bounds=ids.length?sceneLassoBounds(current,ids):null;
            lassoSelection=bounds?{ids,center:{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2},
              width:bounds.width,height:bounds.height,angle:0}:null;
            preview();callbacks.current.onSelection?.(ids,lassoSelection?frameBounds(lassoSelection):null);
          }else if(finished.tool==='pen'||finished.tool==='highlighter'){
            callbacks.current.onBeforeChange?.('ink:new');
            const node={id:globalThis.crypto?.randomUUID?.()||'ink-'+Math.random().toString(36).slice(2),
              type:'ink',penStyle:finished.tool==='highlighter'?'marker':finished.style||'pressure',
              points:finished.straight&&finished.points.length>1?
                [finished.points[0],finished.points.at(-1)]:finished.points,width:finished.width,
              color:finished.color,zIndex:Math.max(2000,...(current.layers||[]).map(n=>n.zIndex||0))+1,
              opacity:finished.tool==='highlighter'?.38:1,
              blendMode:finished.tool==='highlighter'?'multiply':undefined};
            const {root,replacedID}=appendInkStroke(current,node,
              'ink-group-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)));
            if(replacedID){
              sceneVersions.set(replacedID,(sceneVersions.get(replacedID)||0)+1);
              for(const object of canvas.getObjects().filter(item=>item.sceneID===replacedID))canvas.remove(object);
            }
            remember(root.id);
            const index=[...current.layers].sort((a,b)=>(a.zIndex??0)-(b.zIndex??0)).indexOf(root);
            addProjected(root,index,sceneVersions.get(root.id)||0);
            callbacks.current.onChange?.(node,'ink:new');
          }else{
            const changes=[];
            const inspectTree=(nodes,rootID)=>{
              for(let index=nodes.length-1;index>=0;index--){
                const node=nodes[index];
                if(!editableInkLayer(node))continue;
                if(node.type==='group'){inspectTree(node.children,rootID||node.id);continue;}
                if(node.type!=='ink')continue;
                const fragments=erasePressureStroke(node,finished.points,finished.width/2);
                const parts=finished.style==='brush'&&fragments[0]!==node?[]:fragments;
                if(parts.length===1&&parts[0]===node)continue;
                changes.push({nodes,index,parts,rootID:rootID||node.id});
              }
            };
            inspectTree(current.layers,null);
            if(!changes.length)return;
            callbacks.current.onBeforeChange?.('ink:erase');
            const roots=new Set(),added=new Set();
            for(const change of changes){
              change.nodes.splice(change.index,1,...change.parts);
              roots.add(change.rootID);
              if(change.nodes===current.layers)change.parts.forEach(part=>added.add(part.id));
            }
            for(const id of roots){sceneVersions.set(id,(sceneVersions.get(id)||0)+1);remember(id);}
            for(const id of added)remember(id);
            for(const old of canvas.getObjects().filter(object=>roots.has(object.sceneID)))canvas.remove(old);
            const sorted=[...current.layers].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
            for(const [sceneIndex,node] of sorted.entries()){
              if(!roots.has(node.id)&&!added.has(node.id))continue;
              const version=sceneVersions.get(node.id)||0;
              addProjected(node,sceneIndex,version);
            }
            canvas.requestRenderAll();
            callbacks.current.onChange?.([...roots],'ink:erase');
          }
        };
        const focusTouchText=()=>{
          const pending=pendingTouchText;
          if(!pending?.object||callbacks.current.tool!=='text'||
            !byID(callbacks.current.draft.layers,pending.id))return;
          pendingTouchText=null;
          canvas.setActiveObject(pending.object);
          pending.object.enterEditing?.();pending.object.hiddenTextarea?.focus();
          canvas.requestRenderAll();
        };
        const onTouchEnd=event=>{
          if(!pendingTouchText)return;
          event.preventDefault();pendingTouchText.ended=true;
          if(pendingTouchText.object)focusTouchText();
        };
        const upper=canvas.upperCanvasEl;
        upper.addEventListener('pointerdown',onPointerDown,true);
        upper.addEventListener('pointermove',onPointerMove,true);
        upper.addEventListener('pointerup',onPointerEnd,true);
        upper.addEventListener('pointercancel',onPointerEnd,true);
        upper.addEventListener('touchend',onTouchEnd,{passive:false});
        const removePointerHandlers=()=>{
          if(previewFrame)cancelAnimationFrame(previewFrame);
          upper.removeEventListener('pointerdown',onPointerDown,true);
          upper.removeEventListener('pointermove',onPointerMove,true);
          upper.removeEventListener('pointerup',onPointerEnd,true);
          upper.removeEventListener('pointercancel',onPointerEnd,true);
          upper.removeEventListener('touchend',onTouchEnd);
        };
        canvas.sceneRemovePointerHandlers=removePointerHandlers;
        const selection=event=>{
          if(syncingSelection.current)return;
          const ids=[...new Set(canvas.getActiveObjects().flatMap(o=>o.sceneMultiIDs||
            (o.sceneID?[o.sceneID]:[])))];
          const bounds=ids.length===1?canvas.getActiveObject()?.getBoundingRect():null;
          callbacks.current.onSelection?.(ids,bounds?{x:bounds.left,y:bounds.top,
            width:bounds.width,height:bounds.height}:null);
        };
        canvas.on('selection:created',selection);
        canvas.on('selection:updated',selection);
        canvas.on('selection:cleared',()=>{if(!syncingSelection.current)callbacks.current.onSelection?.([],null);});
        const movingSelection=event=>{
          const object=event.target;
          if(!object?.sceneMultiIDs?.length&&(!object?.sceneID||
            ![callbacks.current.selectedID,...(callbacks.current.selectedIDs||[])].includes(object.sceneID)))return;
          if(object.scenePreview&&object.sceneMultiPose){
            object.scenePreview.apply(object.sceneMultiPose.center,object.getCenterPoint(),
              (object.angle||0)-object.sceneMultiPose.angle);
          }
          const bounds=object.getBoundingRect();
          upper.dispatchEvent(new CustomEvent('shiye:fabric-object-transform',{detail:{
            id:object.sceneID||'multiple',bounds:{x:bounds.left,y:bounds.top,
              width:bounds.width,height:bounds.height}
          }}));
        };
        canvas.on('object:moving',movingSelection);
        canvas.on('object:scaling',movingSelection);
        canvas.on('object:rotating',movingSelection);
        canvas.on('mouse:down',event=>{
          const target=event.target;
          if(callbacks.current.tool==='select'&&(target?.sceneID||target?.sceneMultiIDs))
            callbacks.current.onBeforeChange?.(target.sceneID||'multiple');
        });
        canvas.on('before:transform',event=>{
          if(event.target?.sceneID||event.target?.sceneMultiIDs)
            callbacks.current.onBeforeChange?.(event.target.sceneID||'multiple');
        });
        canvas.on('object:modified',event=>{
          if(event.target?.sceneMultiIDs){
            const object=event.target,current=callbacks.current.draft;
            const ids=object.sceneTransformIDs||[];
            const before=object.sceneMultiPose,center=object.getCenterPoint();
            const priorLayers=structuredClone(current.layers);
            try{
              for(const id of object.sceneMultiIDs)assertSceneEditable(current,id);
              if(Math.abs(object.scaleX-1)>1e-5||Math.abs(object.scaleY-1)>1e-5)
                throw Error('多选不能缩放实物素材');
              const angle=(object.angle||0)-before.angle;
              if(Math.abs(angle)>1e-5&&!transformSceneLasso(current,ids,before.center,1,angle))
                throw Error('所选图层不能旋转');
              if(!moveSceneLasso(current,ids,center.x-before.center.x,center.y-before.center.y))
                throw Error('所选图层不能移动');
              object.scenePreview=null;
              object.sceneMultiPose={center,angle:object.angle||0};
              for(const id of ids){const root=current.layers.find(item=>byID([item],id));
                if(root)signatures.delete(root.id);}
              reconcileRef.current?.();
              const bounds=object.getBoundingRect();
              callbacks.current.onSelection?.(object.sceneMultiIDs,{x:bounds.left,y:bounds.top,
                width:bounds.width,height:bounds.height});
              callbacks.current.onChange?.(ids,'transform:multiple');
            }catch(error){
              object.scenePreview?.restore();
              current.layers=priorLayers;
              for(const id of ids){const root=current.layers.find(item=>byID([item],id));
                if(root)signatures.delete(root.id);}
              syncingSelection.current=true;canvas.discardActiveObject();canvas.remove(object);
              syncingSelection.current=false;reconcileRef.current?.();canvas.requestRenderAll();
              callbacks.current.onSelection?.([],null);callbacks.current.onIssue?.(error);
            }
            return;
          }
          const object=event.target,node=byID(callbacks.current.draft.layers,object?.sceneID);
          if(!node)return;
          const before=structuredClone(node);
          try{
            assertSceneEditable(callbacks.current.draft,node.id);
            bridge.applyObject(node,object);
            if(object.sceneSelectionProxy)object.scenePreview=null;
            if(object.sceneID===callbacks.current.selectedID){
              const bounds=object.getBoundingRect();
              callbacks.current.onSelection?.([object.sceneID],{x:bounds.left,y:bounds.top,
                width:bounds.width,height:bounds.height});
            }
            if(node.craftDisplaySlices?.length){
              for(const piece of projected().filter(item=>item.ownerID===node.id))
                signatures.delete(renderKey(piece));
              reconcileRef.current?.();
            }else if(object.sceneSelectionProxy){
              const root=callbacks.current.draft.layers.find(item=>byID([item],node.id));
              if(root){signatures.delete(root.id);reconcileRef.current?.();}
            }else if(node.type==='group'&&
              (Math.abs(object.scaleX-1)>.001||Math.abs(object.scaleY-1)>.001)){
              signatures.delete(renderKey(node));reconcileRef.current?.();
            }else if(node.type==='text'&&
              (Math.abs(object.scaleX-1)>.001||Math.abs(object.scaleY-1)>.001)){
              signatures.delete(renderKey(node));reconcileRef.current?.();
            }else remember(object.sceneID);
            callbacks.current.onChange?.(node,'transform');
          }catch(error){
            for(const key of Object.keys(node))delete node[key];
            Object.assign(node,before);
            const root=callbacks.current.draft.layers.find(item=>byID([item],node.id));
            if(root)signatures.delete(root.id);
            const proxy=canvas.getObjects().find(item=>item.sceneSelectionProxy);
            syncingSelection.current=true;canvas.discardActiveObject();if(proxy)canvas.remove(proxy);
            syncingSelection.current=false;
            reconcileRef.current?.();canvas.requestRenderAll();
            callbacks.current.onSelection?.([],null);callbacks.current.onIssue?.(error);
          }
        });
        canvas.on('text:editing:entered',event=>{
          if(event.target?.sceneID&&!uncommittedText.has(event.target.sceneID))
            callbacks.current.onBeforeChange?.(event.target.sceneID);
        });
        canvas.on('text:changed',event=>{
          const object=event.target,node=byID(callbacks.current.draft.layers,object?.sceneID);
          if(!node||node.type!=='text')return;
          try{
            bridge.applyObject(node,object);
            if(node.content.trim())uncommittedText.delete(node.id);
            remember(object.sceneID);
            callbacks.current.onChange?.(node,'text');
          }catch(error){callbacks.current.onIssue?.(error);}
        });
        canvas.on('text:editing:exited',event=>{
          discardEmptyText(event.target?.sceneID);
        });
        const initialNodes=projected();
        const initialVersions=new Map(initialNodes.map(node=>[renderKey(node),sceneVersions.get(renderKey(node))||0]));
        void projectFabricLayers(canvas,initialNodes,bridge,{readOnly,
          onIssue:error=>callbacks.current.onIssue?.(error),
          onAdded:(object,node)=>{
            const proxy=canvas.getActiveObject();
            if(proxy?.scenePreview&&proxy.sceneMultiPose)
              proxy.scenePreview.apply(proxy.sceneMultiPose.center,proxy.getCenterPoint(),
                (proxy.angle||0)-proxy.sceneMultiPose.angle);
            if(callbacks.current.tool!=='select'||callbacks.current.selectedID!==node.id||
              callbacks.current.selectedIDs?.length>1||object.selectable===false)return;
            syncingSelection.current=true;canvas.setActiveObject(object);syncingSelection.current=false;
            const bounds=object.getBoundingRect();
            callbacks.current.onSelection?.([node.id],{x:bounds.left,y:bounds.top,
              width:bounds.width,height:bounds.height});
            canvas.requestRenderAll();
          },
          isCurrent:node=>!disposed&&projected().some(item=>renderKey(item)===renderKey(node)&&snapshot(item)===snapshot(node))&&
            (sceneVersions.get(renderKey(node))||0)===initialVersions.get(renderKey(node))});
        reconcileRef.current?.();
      }catch(error){if(!disposed)callbacks.current.onIssue?.(error);}
    };
    void start();
    return ()=>{disposed=true;reconcileRef.current=null;if(canvas){callbacks.current.onReady?.(null);
      canvas.sceneCancelGesture?.(false);canvas.sceneRemovePointerHandlers?.();void canvas.dispose();}
      if(sessionRef.current===canvas)sessionRef.current=null;};
  },[draft.id,readOnly]);

  return <canvas ref={canvasRef} aria-label="创作画布"/>;
}
