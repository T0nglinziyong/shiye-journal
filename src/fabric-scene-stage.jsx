import React,{useLayoutEffect,useRef} from 'react';
import {drawPaper} from './paper-rendering.js';
import {createFabricSceneBridge} from './fabric-scene-bridge.js';
import {projectFabricLayers} from './fabric-layer-loader.js';
import {paperWidthPixels,pressureInkOutline,erasePressureStroke} from './pressure-ink.js';
import {textBlock} from './domain.js';
import {selectPolygon,polygonContains} from './canvas-selection.js';
import {attachSceneV2} from './scene-v2.js';

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

// Fabric owns this canvas for the whole draft lifetime. React owns the host,
// tool panels and route lifecycle; a pointer packet never crosses a JSX render.
export function FabricSceneStage({draft,assetURL,onSelection,onBeforeChange,onChange,onIssue,onReady,
  tool='select',pen={widthMM:.5,color:'#2b5245'},marker={widthMM:2,color:'#f5cf45'},
  eraser={widthMM:4},selectionMode='contain',readOnly=false,sceneRevision=0,
  selectedID=null,selectedIDs=[]}){
  const canvasRef=useRef(null),sessionRef=useRef(null),reconcileRef=useRef(null),callbacks=useRef(null);
  callbacks.current={draft,assetURL,onSelection,onBeforeChange,onChange,onIssue,onReady,tool,pen,marker,
    eraser,selectionMode,selectedID,selectedIDs};

  useLayoutEffect(()=>{reconcileRef.current?.();},[draft,sceneRevision]);

  useLayoutEffect(()=>{
    const canvas=sessionRef.current;
    if(!canvas||!['select','lasso'].includes(tool))return;
    const ids=selectedIDs.length?selectedIDs:selectedID?[selectedID]:[];
    const objects=canvas.getObjects().filter(item=>ids.includes(item.sceneID));
    const active=canvas.getActiveObjects();
    if(objects.length&&(!active.length||active.length!==objects.length||
      active.some(item=>!objects.includes(item)))){
      if(objects.length===1)canvas.setActiveObject(objects[0]);
      else import('fabric').then(({ActiveSelection})=>{
        if(sessionRef.current!==canvas)return;
        canvas.setActiveObject(new ActiveSelection(objects,{canvas}));canvas.requestRenderAll();
      });
      canvas.requestRenderAll();
    }else if(!ids.length&&canvas.getActiveObject()){
      canvas.discardActiveObject();canvas.requestRenderAll();
    }
  },[selectedID,selectedIDs,tool,sceneRevision]);

  useLayoutEffect(()=>{
    const canvas=sessionRef.current;
    if(!canvas)return;
    canvas.selection=tool==='select'&&!readOnly;
    canvas.skipTargetFind=tool!=='select'||readOnly;
    canvas.defaultCursor=['pen','highlighter','lasso'].includes(tool)?'crosshair':tool==='eraser'?'cell':'default';
    if(!['select','lasso'].includes(tool)){canvas.getActiveObject()?.exitEditing?.();canvas.discardActiveObject();
      canvas.requestRenderAll();}
    if(tool!=='text')canvas.sceneDiscardEmptyText?.();
  },[tool,readOnly]);

  useLayoutEffect(()=>{
    let disposed=false,canvas=null;
    const start=async()=>{
      try{
        attachSceneV2(draft);
        const fabric=await import('fabric');
        if(disposed)return;
        canvas=new fabric.Canvas(canvasRef.current,{
          width:draft.canvas.width,height:draft.canvas.height,
          backgroundColor:draft.paperColor,preserveObjectStacking:true,
          selection:!readOnly,enableRetinaScaling:true,renderOnAddRemove:false
        });
        sessionRef.current=canvas;
        canvas.selection=callbacks.current.tool==='select'&&!readOnly;
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
          assetURL:(id,node)=>callbacks.current.assetURL?.(id,node),
          canvasSize:()=>callbacks.current.draft.canvas
        });
        const sceneVersions=new Map();
        const snapshot=node=>JSON.stringify([node,node.type==='group'&&node.vectorMask?
          callbacks.current.draft.canvas:null]);
        const signatures=new Map((draft.layers||[]).map(node=>[node.id,snapshot(node)]));
        const remember=id=>{
          const node=callbacks.current.draft.layers.find(item=>item.id===id);
          if(node)signatures.set(id,snapshot(node));
          else signatures.delete(id);
        };
        const addProjected=(node,sceneIndex,version,onAdded)=>{
          return bridge.fromNode(node).then(object=>{
            if(disposed||!callbacks.current.draft.layers.includes(node)||
              (sceneVersions.get(node.id)||0)!==version)return;
            // Decode the replacement before touching the visible object. A
            // slow image cannot leave a blank hole in an already drawn page.
            const old=canvas.getObjects().filter(item=>item.sceneID===node.id);
            for(const item of old)canvas.remove(item);
            if(object){
              object.sceneIndex=sceneIndex;
              if(readOnly)object.set({selectable:false,evented:false});
              const position=canvas.getObjects().filter(item=>item.sceneIndex<sceneIndex).length;
              canvas.insertAt(position,object);
              if(callbacks.current.tool==='select'&&callbacks.current.selectedID===node.id)
                canvas.setActiveObject(object);
            }
            canvas.requestRenderAll();
            if(object)onAdded?.(object);
          }).catch(error=>{if(!disposed){signatures.delete(node.id);callbacks.current.onIssue?.(error);}});
        };
        reconcileRef.current=()=>{
          const current=callbacks.current.draft;
          if(!current||current.id!==draft.id)return;
          paintPaper(current);
          const sorted=[...(current.layers||[])].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
          const present=new Set(sorted.map(node=>node.id));
          const positions=new Map(sorted.map((node,index)=>[node.id,index]));
          for(const id of signatures.keys())if(!present.has(id)){
            signatures.delete(id);sceneVersions.set(id,(sceneVersions.get(id)||0)+1);
          }
          for(const object of canvas.getObjects())if(object.sceneID&&!present.has(object.sceneID))canvas.remove(object);
          for(const [sceneIndex,node] of sorted.entries()){
            const next=snapshot(node);
            if(signatures.get(node.id)===next)continue;
            signatures.set(node.id,next);
            const version=(sceneVersions.get(node.id)||0)+1;
            sceneVersions.set(node.id,version);
            addProjected(node,sceneIndex,version);
          }
          const existing=canvas.getObjects().filter(object=>positions.has(object.sceneID));
          for(const object of existing)object.sceneIndex=positions.get(object.sceneID);
          existing.sort((a,b)=>a.sceneIndex-b.sceneIndex);
          existing.forEach((object,index)=>canvas.moveObjectTo(object,index));
          canvas.requestRenderAll();
        };
        let gesture=null,previewFrame=0,textPointerID=null;
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
          const point=canvas.getScenePoint(event);
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
        const preview=()=>{
          if(!gesture)return;
          const ctx=canvas.contextTop;
          canvas.clearContext(ctx);ctx.save();
          ctx.transform(...canvas.viewportTransform);
          if(gesture.tool==='pen'||gesture.tool==='highlighter'){
            const outline=pressureInkOutline({points:gesture.points,width:gesture.width});
            if(outline.length){ctx.globalAlpha=gesture.tool==='highlighter'?.38:1;
              ctx.fillStyle=gesture.color;ctx.beginPath();ctx.moveTo(...outline[0]);
              for(const point of outline.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.fill();}
          }else if(gesture.tool==='lasso'){
            ctx.strokeStyle='#2b5245';ctx.lineWidth=2;ctx.setLineDash([7,5]);
            ctx.fillStyle='rgba(80,130,90,.08)';ctx.beginPath();
            gesture.points.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
            ctx.stroke();if(gesture.points.length>2){ctx.closePath();ctx.fill();}
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
        const onPointerDown=event=>{
          const mode=callbacks.current.tool;
          if(readOnly||!['pen','highlighter','eraser','text','lasso'].includes(mode)||event.button>0)return;
          event.preventDefault();event.stopImmediatePropagation();
          if(mode==='text'){
            textPointerID=event.pointerId;
            const current=callbacks.current.draft,point=pointer(event);
            if(point.x<0||point.y<0||point.x>current.canvas.width||point.y>current.canvas.height)return;
            const hit=canvas.getObjects().findLast(object=>object.evented!==false&&
              object.containsPoint(new fabric.Point(point.x,point.y)));
            if(hit){
              canvas.setActiveObject(hit);
              if(hit.sceneType==='text'){
                hit.enterEditing?.();
                hit.hiddenTextarea?.focus();
              }
              canvas.requestRenderAll();
              return;
            }
            const width=Math.max(60,Math.min(current.canvas.width*.35,current.canvas.width-point.x));
            const node={...textBlock('',current),
              id:globalThis.crypto?.randomUUID?.()||'text-'+Math.random().toString(36).slice(2),
              type:'text',x:point.x+width/2,y:point.y+50,width,height:100,
              alignment:'left',zIndex:Math.max(1000,...current.layers.map(item=>item.zIndex||0))+1};
            callbacks.current.onBeforeChange?.('text:new');
            current.layers.push(node);
            uncommittedText.add(node.id);
            remember(node.id);
            const index=current.layers.length-1;
            void addProjected(node,index,sceneVersions.get(node.id)||0,object=>{
              canvas.setActiveObject(object);
              object.enterEditing?.();
              object.hiddenTextarea?.focus();
              canvas.requestRenderAll();
            });
            callbacks.current.onChange?.(node,'text:new');
            return;
          }
          canvas.discardActiveObject();
          const settings=mode==='pen'?callbacks.current.pen:
            mode==='highlighter'?callbacks.current.marker:callbacks.current.eraser;
          gesture={id:event.pointerId,tool:mode,points:samples(event),
            width:mode==='lasso'?2:paperWidthPixels(callbacks.current.draft,
              settings?.widthMM??(mode==='pen'?.5:mode==='highlighter'?2:4)),
            color:settings?.color||'#2b5245',style:settings?.style,
            straight:settings?.straight};
          canvas.upperCanvasEl.setPointerCapture(event.pointerId);
          preview();
        };
        const onPointerMove=event=>{
          if(!gesture||gesture.id!==event.pointerId)return;
          event.preventDefault();event.stopImmediatePropagation();
          for(const point of samples(event)){
            const previous=gesture.points.at(-1);
            const spacing=gesture.tool==='eraser'?Math.max(.5,gesture.width*.25):
              gesture.tool==='lasso'?1:.15;
            if(!previous||Math.hypot(point.x-previous.x,point.y-previous.y)>spacing)
              gesture.points.push(point);
          }
          queuePreview();
        };
        const onPointerEnd=event=>{
          if(textPointerID===event.pointerId){
            textPointerID=null;
            event.preventDefault();event.stopImmediatePropagation();
            return;
          }
          if(!gesture||gesture.id!==event.pointerId)return;
          event.preventDefault();event.stopImmediatePropagation();
          const finished=gesture;gesture=null;
          canvas.clearContext(canvas.contextTop);
          if(event.type==='pointercancel')return;
          const point=pointer(event),prior=finished.points.at(-1);
          if(prior&&Math.hypot(point.x-prior.x,point.y-prior.y)>.15)finished.points.push(point);
          const current=callbacks.current.draft;
          if(finished.tool==='lasso'){
            if(finished.points.length<3)return;
            const mode=callbacks.current.selectionMode||'contain';
            const ids=selectPolygon(current,finished.points,
              {material:true,text:true,shape:true},mode);
            for(const node of current.layers||[]){
              if(node.type!=='ink'||node.hidden||node.locked)continue;
              const hits=(node.points||[]).map(sample=>polygonContains(sample,finished.points));
              if(hits.length&&(mode==='intersect'?hits.some(Boolean):hits.every(Boolean)))ids.push(node.id);
            }
            const objects=canvas.getObjects().filter(object=>ids.includes(object.sceneID));
            if(objects.length===1)canvas.setActiveObject(objects[0]);
            else if(objects.length>1)canvas.setActiveObject(new fabric.ActiveSelection(objects,{canvas}));
            else canvas.discardActiveObject();
            canvas.requestRenderAll();
            callbacks.current.onSelection?.(objects.map(object=>object.sceneID));
          }else if(finished.tool==='pen'||finished.tool==='highlighter'){
            callbacks.current.onBeforeChange?.('ink:new');
            const node={id:globalThis.crypto?.randomUUID?.()||'ink-'+Math.random().toString(36).slice(2),
              type:'ink',penStyle:finished.tool==='highlighter'?'marker':finished.style||'pressure',
              points:finished.straight&&finished.points.length>1?
                [finished.points[0],finished.points.at(-1)]:finished.points,width:finished.width,
              color:finished.color,zIndex:Math.max(2000,...(current.layers||[]).map(n=>n.zIndex||0))+1,
              opacity:finished.tool==='highlighter'?.38:1,
              blendMode:finished.tool==='highlighter'?'multiply':undefined};
            current.layers.push(node);
            remember(node.id);
            const index=current.layers.length-1;
            addProjected(node,index,sceneVersions.get(node.id)||0);
            callbacks.current.onChange?.(node,'ink:new');
          }else{
            const changes=[];
            const inspectTree=(nodes,rootID)=>{
              for(let index=nodes.length-1;index>=0;index--){
                const node=nodes[index];
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
        const upper=canvas.upperCanvasEl;
        upper.addEventListener('pointerdown',onPointerDown,true);
        upper.addEventListener('pointermove',onPointerMove,true);
        upper.addEventListener('pointerup',onPointerEnd,true);
        upper.addEventListener('pointercancel',onPointerEnd,true);
        const removePointerHandlers=()=>{
          if(previewFrame)cancelAnimationFrame(previewFrame);
          upper.removeEventListener('pointerdown',onPointerDown,true);
          upper.removeEventListener('pointermove',onPointerMove,true);
          upper.removeEventListener('pointerup',onPointerEnd,true);
          upper.removeEventListener('pointercancel',onPointerEnd,true);
        };
        canvas.sceneRemovePointerHandlers=removePointerHandlers;
        const selection=event=>callbacks.current.onSelection?.(event.selected?.map(o=>o.sceneID).filter(Boolean)||[]);
        canvas.on('selection:created',selection);
        canvas.on('selection:updated',selection);
        canvas.on('selection:cleared',()=>callbacks.current.onSelection?.([]));
        canvas.on('before:transform',event=>{
          if(event.target?.sceneID)callbacks.current.onBeforeChange?.(event.target.sceneID);
        });
        canvas.on('object:modified',event=>{
          const object=event.target,node=byID(callbacks.current.draft.layers,object?.sceneID);
          if(!node)return;
          try{
            bridge.applyObject(node,object);
            remember(object.sceneID);
            callbacks.current.onChange?.(node,'transform');
          }catch(error){callbacks.current.onIssue?.(error);}
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
        const initialVersions=new Map((draft.layers||[]).map(node=>[node.id,sceneVersions.get(node.id)||0]));
        void projectFabricLayers(canvas,draft.layers,bridge,{readOnly,
          onIssue:error=>callbacks.current.onIssue?.(error),
          isCurrent:node=>!disposed&&callbacks.current.draft.layers.includes(node)&&
            (sceneVersions.get(node.id)||0)===initialVersions.get(node.id)});
        reconcileRef.current?.();
      }catch(error){if(!disposed)callbacks.current.onIssue?.(error);}
    };
    void start();
    return ()=>{disposed=true;reconcileRef.current=null;if(canvas){canvas.sceneRemovePointerHandlers?.();void canvas.dispose();}
      if(sessionRef.current===canvas)sessionRef.current=null;};
  },[draft.id,readOnly]);

  return <canvas ref={canvasRef} aria-label="创作画布"/>;
}
