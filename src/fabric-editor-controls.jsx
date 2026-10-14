import React,{useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {popupPlacement} from './popover-placement.js';
import {commonShapes,advancedShapes,configureShape,shapeSVG} from './editor-tools-model.js';
import {primitive} from './domain.js';

const glyphs={select:'➤',pen:'✎',eraser:'◇',text:'Aa',shape:'▢',material:'▧',layers:'▱',paper:'▦'};
const labels={select:'选择',pen:'画笔',eraser:'橡皮擦',text:'文字',shape:'图形',material:'素材',layers:'图层',paper:'画布背景'};

function ReactPopover({anchor,title,className='',width=360,height=440,picker=false,onClose,children}){
  const [position,setPosition]=useState(null);
  useLayoutEffect(()=>{
    const place=()=>{
      if(!anchor?.isConnected){onClose();return;}
      setPosition(popupPlacement({anchor:anchor.getBoundingClientRect(),
        viewportWidth:innerWidth,viewportHeight:innerHeight,
        popupWidth:width,popupHeight:height,picker}));
    };
    place();
    addEventListener('resize',place);
    addEventListener('scroll',place,true);
    return ()=>{removeEventListener('resize',place);removeEventListener('scroll',place,true);};
  },[anchor,width,height,picker,onClose]);
  useEffect(()=>{
    const key=event=>{if(event.key==='Escape'){event.preventDefault();onClose();}};
    const outside=event=>{
      if(!event.target.closest?.('.swift-popover')&&!anchor?.contains(event.target))onClose();
    };
    addEventListener('keydown',key);addEventListener('pointerdown',outside,true);
    return ()=>{removeEventListener('keydown',key);removeEventListener('pointerdown',outside,true);};
  },[anchor,onClose]);
  return createPortal(<div className={`swift-popover ${className}`} role={className.includes('swift-menu')?'menu':'dialog'} aria-label={title}
    style={position?{left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight}:
      {visibility:'hidden',left:0,top:0,width}}>
    <h3>{title}</h3><div className="popover-content">{children}</div>
  </div>,document.body);
}

function ShapePicker({draft,onPick}){
  const [tab,setTab]=useState('common');
  const choices=tab==='advanced'?advancedShapes:commonShapes;
  return <><div className="swift-segments">
    {[['common','基础图形'],['advanced','高级图形']].map(([id,label])=><button key={id}
      className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}
  </div><div className="canvas-picker-grid">{choices.map(([id,label])=>{
    const sample=configureShape(primitive(id,draft),id);
    const image='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(shapeSVG(sample));
    return <button key={id} type="button" data-shape-kind={id} onClick={()=>onPick(id)}>
      <img src={image} alt=""/><span>{label}</span></button>;
  })}</div></>;
}

function MaterialPicker({materials,source,onPick}){
  const [query,setQuery]=useState(''),[shown,setShown]=useState(40);
  const filtered=useMemo(()=>materials.filter(asset=>
    !query||asset.title?.toLocaleLowerCase().includes(query.toLocaleLowerCase())),[materials,query]);
  useEffect(()=>setShown(40),[query]);
  return <><div className="canvas-material-filters"><input type="search" value={query}
    onChange={event=>setQuery(event.target.value)} placeholder="搜索素材" aria-label="搜索可用素材"/></div>
    <div className="canvas-picker-grid" onScroll={event=>{
      const node=event.currentTarget;
      if(node.scrollHeight-node.scrollTop-node.clientHeight<150)setShown(count=>Math.min(filtered.length,count+40));
    }}>{filtered.slice(0,shown).map(asset=><button type="button" key={asset.id}
      data-material-id={asset.id} onClick={()=>onPick(asset.id)}>
      {source(asset.blobId)||asset.staticPath?<img src={source(asset.blobId)||asset.staticPath}
        loading="lazy" decoding="async" alt=""/>:<span>无预览</span>}
      <span>{asset.title}</span></button>)}
    </div>{filtered.length>shown?<small>下滑继续显示 · 共 {filtered.length} 件</small>:null}</>;
}

export function FabricEditorToolbar({state,draft,materials,source,onAction}){
  const [menu,setMenu]=useState(null);
  const close=()=>setMenu(null);
  const open=(kind,event)=>{
    onAction('fabric-tool',null,['paper','layers','material'].includes(kind)?'select':kind);
    setMenu(previous=>previous?.kind===kind?null:{kind,anchor:event.currentTarget});
  };
  const choose=(action,id)=>{close();onAction(action,id);};
  const tools=state.canvasTools||{};
  const setting=(name,value)=>onAction('fabric-tool-setting',name,value);
  return <><div className="swift-editor-toolbar" aria-label="创作工具">
    <div className="editor-tools">{Object.keys(glyphs).map(kind=><button key={kind} type="button"
      className={`btn ${state.tool===kind?'primary':''}`} data-val={kind} data-act="tool"
      data-react-action="true" aria-label={labels[kind]} aria-pressed={state.tool===kind}
      onClick={event=>['shape','material','layers','paper'].includes(kind)?open(kind,event):
        (close(),onAction('fabric-tool',null,kind))}>{glyphs[kind]}</button>)}</div>
    <div className="canvas-context-tools" aria-label="当前工具选项">
      {state.tool==='pen'?<>
        <label>笔宽 <input type="range" min="0.2" max="3" step="0.1"
          value={tools.fabricPenWidthMM??.5} onChange={event=>setting('fabricPenWidthMM',event.target.value)}/>
          <span>{Number(tools.fabricPenWidthMM??.5).toFixed(1)} mm</span></label>
        <label>颜色 <input type="color" value={tools.penColor||'#2b5245'}
          onChange={event=>setting('penColor',event.target.value)}/></label>
      </>:state.tool==='eraser'?<label>橡皮擦 <input type="range" min="1" max="12" step="0.5"
        value={tools.fabricEraserWidthMM??4} onChange={event=>setting('fabricEraserWidthMM',event.target.value)}/>
        <span>{Number(tools.fabricEraserWidthMM??4).toFixed(1)} mm</span></label>:
      <span className="swift-editor-hint">{state.tool==='text'?'点画布插入文字；点已有文字直接编辑':'点画布对象选择与调整'}</span>}
    </div>
  </div>{menu?<ReactPopover anchor={menu.anchor} onClose={close}
    title={{shape:'添加图形',material:'选择素材',paper:'画布背景',layers:'图层'}[menu.kind]}
    className={['shape','material'].includes(menu.kind)?`swift-picker-popover swift-${menu.kind}-picker`:'swift-menu'}
    width={menu.kind==='paper'?260:innerWidth>=900?432:360} height={menu.kind==='shape'?550:440}
    picker={['shape','material'].includes(menu.kind)}>
    {menu.kind==='shape'?<ShapePicker draft={draft} onPick={id=>choose('fabric-add-shape',id)}/>:null}
    {menu.kind==='material'?<MaterialPicker materials={materials} source={source}
      onPick={id=>choose('fabric-add-material',id)}/>:null}
    {menu.kind==='paper'?<>
      {[['plain','纯色'],['grid','方格'],['lines','横线'],['dots','点阵'],['columns','双栏']]
        .map(([id,label])=><button key={id} type="button" role="menuitemradio"
          aria-checked={draft.paperPattern===id} onClick={()=>{close();onAction('fabric-paper','pattern',id);}}>
          {label}</button>)}
      <label className="canvas-toggle">纸张颜色<input type="color" value={draft.paperColor}
        onChange={event=>{close();onAction('fabric-paper','color',event.target.value);}}/></label>
    </>:null}
    {menu.kind==='layers'?<div className="canvas-layer-list">
      {[...draft.layers].reverse().map(node=><button key={node.id} type="button"
        className="canvas-layer-row" onClick={()=>choose('fabric-select-layer',node.id)}>
        {node.type==='text'?'文字':node.type==='material'?'素材':node.type==='shape'?'图形':node.type==='ink'?'笔迹':'组合'} · {node.type==='text'?node.content||'空白':node.id.slice(0,8)}
      </button>)}</div>:null}
  </ReactPopover>:null}</>;
}

export function FabricHeaderMenu({kind,project,onAction}){
  const [anchor,setAnchor]=useState(null);
  const close=()=>setAnchor(null);
  const entries=kind==='export'?[['save-snapshot','保存快照'],['export-png','导出 PNG'],
    ['print','导出 PDF / 打印'],['download-project-zip','导出可编辑 ZIP'],
    ['export-scene-json','导出 Scene JSON'],['creative-json','导入创作指令']]:
    [['new-draft','新方案'],['save-archive','保存手动存档'],
      ...(project.manualArchives||[]).slice(-5).reverse().map(item=>['restore-archive','恢复 '+new Date(item.date).toLocaleString(),item.id])];
  return <><button type="button" className="btn" aria-label={kind==='export'?'导出作品':'历史记录'}
    onClick={event=>setAnchor(previous=>previous?null:event.currentTarget)}>{kind==='export'?'导出':'◷'}</button>
    {anchor?<ReactPopover anchor={anchor} onClose={close} title={kind==='export'?'导出作品':'历史记录'}
      width={260} height={360}>
      <div className="stack">{entries.map(([action,label,id],index)=><button key={index} type="button"
        onClick={()=>{close();onAction(action,id);}}>{label}</button>)}</div>
    </ReactPopover>:null}</>;
}
