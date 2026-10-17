import React,{useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {findSceneNode} from './scene-v2.js';

// Only the title bar drags this UI. The canvas transform never changes when
// the panel opens, moves, or closes.
export function FabricCutPanel({state,draft,onAction}){
  const [position,setPosition]=useState(null),drag=useRef(null);
  if(state.tool!=='scissors')return null;
  const settings={operation:'split',scope:'object',pathType:'line',inset:.18,
    hideRegion:false,...state.cutSettings};
  const preview=state.cutPreview,node=findSceneNode(draft,state.selected);
  const set=(key,value)=>onAction('fabric-cut-setting',key,value);
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
  return createPortal(<section className="fabric-cut-panel" aria-label="剪刀与局部显示"
    style={position?{left:position.left,top:position.top,right:'auto',bottom:'auto'}:undefined}>
    <header onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <strong>剪刀 · 局部显示</strong><span>拖动面板</span>
    </header>
    <div className="fabric-cut-body">
      <div className="fabric-cut-row" role="group" aria-label="操作方式">
        {[['split','分成多片'],['mask','局部显示']].map(([key,label])=><button key={key}
          type="button" aria-pressed={settings.operation===key} onClick={()=>set('operation',key)}>{label}</button>)}
      </div>
      {settings.operation==='split'?<div className="fabric-cut-row" role="group" aria-label="剪切范围">
        {[['object','当前对象'],['all','所有可见图层']].map(([key,label])=><button key={key}
          type="button" aria-pressed={settings.scope===key} onClick={()=>set('scope',key)}>{label}</button>)}
      </div>:<p className="fabric-cut-help">局部显示保留原对象和素材来源，只隐藏选定区域。</p>}
      {settings.scope==='object'&&!node?<p className="fabric-cut-help">先选中对象，再点击剪刀。</p>:null}
      <div className="fabric-cut-row" role="group" aria-label="路径方式">
        {[['line','自由切线'],['loop','闭合区域']].map(([key,label])=><button key={key}
          type="button" aria-pressed={settings.pathType===key} onClick={()=>set('pathType',key)}>{label}</button>)}
      </div>
      <p className="fabric-cut-help">在画面上画路径，背景会保持可见。iPad 上用笔剪切，手指移动画布。</p>
      <div className="fabric-cut-row fabric-cut-presets" aria-label="快捷裁切">
        {[['window','开窗'],['ellipse','椭圆'],['edge','剪边'],['ring','留边框']]
          .map(([key,label])=><button key={key} type="button"
          onClick={()=>onAction('fabric-cut-preview',key)}>{label}</button>)}
      </div>
      <label className="fabric-cut-inset">宽度 <input type="range" min="0.025" max="0.45" step="0.005"
        value={settings.inset} onChange={event=>set('inset',Number(event.target.value))}/></label>
      {settings.operation==='mask'?<label className="fabric-cut-checkbox"><input type="checkbox"
        checked={settings.hideRegion} onChange={event=>set('hideRegion',event.target.checked)}/>隐藏所画区域</label>:null}
      {preview?<><div className="fabric-cut-results"><b>{preview.spec.operation==='mask'?'局部显示预览':'选择留在画布上的裁片'}</b>
        {preview.pieces.map((piece,index)=><label key={piece.key}><input type="checkbox"
          disabled={preview.spec.operation==='mask'} checked={preview.keepKeys.includes(piece.key)}
          onChange={()=>onAction('fabric-cut-keep',piece.key)}/>
          {piece.type==='material'?'素材':piece.type==='ink'?'笔迹':piece.type==='text'?'文字':'图形'} {index+1}</label>)}
      </div><div className="fabric-cut-row"><button type="button" onClick={()=>onAction('fabric-cut-cancel')}>取消预览</button>
        <button type="button" className="primary" onClick={()=>onAction('fabric-cut-confirm')}>应用</button></div></>:null}
      {node?.type==='material'&&node.splitParentId?<button type="button" className="fabric-cut-rejoin"
        onClick={()=>onAction('fabric-cut-rejoin',node.id)}>拼回同源裁片</button>:null}
    </div>
  </section>,document.body);
}
