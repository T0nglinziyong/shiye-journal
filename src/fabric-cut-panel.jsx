import React,{useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {findSceneNode,sceneLayerEntries} from './scene-v2.js';

// Only the title bar drags this UI. The canvas transform never changes when
// the panel opens, moves, or closes.
export function FabricCutPanel({state,draft,onAction}){
  const [position,setPosition]=useState(null),drag=useRef(null),panelRef=useRef(null);
  const settings={operation:'split',scope:'object',inset:.18,
    hideRegion:true,...state.cutSettings};
  const preview=state.cutPreview,node=findSceneNode(draft,state.selected);
  const cutTargets=sceneLayerEntries(draft,{hidden:true,ink:true}).filter(entry=>
    !entry.value.hidden&&!entry.value.isHidden&&!entry.value.isParked&&!entry.value.locked&&
    !entry.value.isLocked&&entry.parents.every(parent=>!parent.hidden&&!parent.isHidden&&
      !parent.locked&&!parent.isLocked)&&
    (settings.operation==='split'||entry.kind!=='ink'));
  const entryIndex=sceneLayerEntries(draft,{hidden:true,ink:true})
    .findIndex(entry=>entry.value.id===node?.id);
  const materialTitle=node?.type==='material'?state.assets?.find(asset=>asset.id===node.assetID)?.title:null;
  const label=node?(node.title||node.name||materialTitle||
    ({material:'素材',shape:'图形',text:'文字',ink:'笔迹',group:'组合'}[node.type]||'对象'))+
    (entryIndex>=0?` · 图层 ${entryIndex+1}`:''):
    settings.scope==='all'?`已选 ${settings.targetIDs?.length||0} 个图层`:'未选择对象';
  const set=(key,value)=>onAction('fabric-cut-setting',key,value);
  useLayoutEffect(()=>{
    if(!position||!panelRef.current)return;
    const rect=panelRef.current.getBoundingClientRect();
    const top=Math.max(8,Math.min(position.top,window.innerHeight-rect.height-8));
    if(top!==position.top)setPosition({...position,top});
  },[position,preview]);
  if(state.tool!=='scissors')return null;
  const down=event=>{
    if(event.button>0)return;
    const rect=event.currentTarget.parentElement.getBoundingClientRect();
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();event.stopPropagation();
  };
  const move=event=>{
    const start=drag.current;if(!start||start.id!==event.pointerId)return;
    const width=Math.min(300,window.innerWidth-16),height=event.currentTarget.parentElement.offsetHeight;
    setPosition({left:Math.max(8,Math.min(window.innerWidth-width-8,
      start.left+event.clientX-start.x)),top:Math.max(8,Math.min(window.innerHeight-height-8,
      start.top+event.clientY-start.y))});
    event.preventDefault();event.stopPropagation();
  };
  const end=event=>{if(drag.current?.id===event.pointerId)drag.current=null;};
  return createPortal(<section ref={panelRef} className="fabric-cut-panel" aria-label="剪刀与局部显示"
    style={position?{left:position.left,top:position.top,right:'auto',bottom:'auto'}:undefined}>
    <header onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <strong>剪刀 · {settings.operation==='mask'?'蒙版':'裁剪'}</strong>
      <button type="button" aria-label="退出剪刀" onPointerDown={event=>event.stopPropagation()}
        onClick={()=>onAction('fabric-tool',null,'select')}>退出</button>
    </header>
    <div className="fabric-cut-body">
      <div className="fabric-cut-target"><span>当前对象：{label}</span></div>
      <div className="fabric-cut-row" role="group" aria-label="裁剪或蒙版">
        {[['split','裁剪'],['mask','蒙版']].map(([key,title])=><button key={key} type="button"
          disabled={key==='mask'&&!node} aria-pressed={settings.operation===key}
          onClick={()=>set('operation',key)}>{title}</button>)}
      </div>
      {settings.operation==='split'?<details className="fabric-cut-scope">
        <summary>作用范围 · {settings.scope==='object'?'当前对象':'选定图层'}</summary>
        <div className="fabric-cut-row" role="group" aria-label="剪切范围">
          {[['object','当前对象'],['all','选定图层']].map(([key,title])=><button key={key} type="button"
            disabled={key==='object'&&!node} aria-pressed={settings.scope===key}
            onClick={()=>set('scope',key)}>{title}</button>)}
        </div>
        {settings.scope==='all'?<div className="canvas-cut-targets" role="group" aria-label="选择要剪切的图层">
          {cutTargets.map((entry,index)=><label key={entry.value.id}><input type="checkbox"
            checked={(settings.targetIDs||[]).includes(entry.value.id)}
            onChange={event=>set('targetIDs',event.target.checked?
              [...(settings.targetIDs||[]),entry.value.id]:
              (settings.targetIDs||[]).filter(id=>id!==entry.value.id))}/>
            {entry.value.title||entry.value.name||state.assets?.find(asset=>asset.id===entry.value.assetID)?.title||
              (({material:'素材',shape:'图形',text:'文字',ink:'笔迹'}[entry.kind]||'对象')+' '+(index+1))}</label>)}
        </div>:null}
      </details>:null}
      <p className="fabric-cut-help">在画布上画切线；闭合路径自动形成区域。预览后点击裁片切换保留状态：绿色保留，红色放入备选。</p>
      <div className="fabric-cut-row fabric-cut-presets" aria-label="快捷裁切">
        {[['window','开窗'],['ellipse','椭圆'],['edge','剪边']]
          .map(([key,label])=><button key={key} type="button"
          onClick={()=>onAction('fabric-cut-preview',key)}>{label}</button>)}
      </div>
      <label className="fabric-cut-inset">快捷样式宽度 · {Math.round(settings.inset*100)}% <input type="range" min="0.025" max="0.45" step="any"
        value={settings.inset} onChange={event=>set('inset',Number(event.target.value))}/></label>
      {settings.operation==='mask'?<div className="fabric-cut-row" role="group" aria-label="局部显示方式">
        <button type="button" aria-pressed={settings.hideRegion} onClick={()=>set('hideRegion',true)}>隐藏画出的区域</button>
        <button type="button" aria-pressed={!settings.hideRegion} onClick={()=>set('hideRegion',false)}>只显示画出的区域</button>
      </div>:null}
      {preview?<><p className="fabric-cut-preview-status">{preview.spec.operation==='mask'?'蒙版预览':
        `绿色保留 ${preview.keepKeys.length} / ${preview.pieces.length} 片 · 点击画布上的裁片切换`}</p>
        <div className="fabric-cut-row fabric-cut-actions"><button type="button" onClick={()=>onAction('fabric-cut-cancel')}>取消预览</button>
        <button type="button" className="primary" onClick={()=>onAction('fabric-cut-confirm')}>应用</button></div></>:null}
      {node?.type==='material'&&node.splitParentId?<button type="button" className="fabric-cut-rejoin"
        onClick={()=>onAction('fabric-cut-rejoin',node.id)}>拼回同源裁片</button>:null}
    </div>
  </section>,document.body);
}
