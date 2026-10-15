import React,{useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {materialKinds} from './material-taxonomy.js';
import {createPortal} from 'react-dom';
import {popupPlacement} from './popover-placement.js';
import {commonShapes,advancedShapes,configureShape,shapeThumbnailSVG} from './editor-tools-model.js';
import {primitive} from './domain.js';

const glyphs={select:'➤',pen:'✎',eraser:'◇',highlighter:'▱',lasso:'◌',text:'Aa',shape:'▢',material:'▧',layers:'▱',paper:'▦'};
const labels={select:'选择',pen:'笔',eraser:'橡皮擦',highlighter:'荧光笔',lasso:'套索选择',text:'文字',shape:'图形',material:'素材',layers:'图层',paper:'画布背景'};

function ReactPopover({anchor,title,className='',width=360,height=440,picker=false,onClose,children}){
  const [position,setPosition]=useState(null);
  useLayoutEffect(()=>{
    let retry=0,attempts=0;
    const place=()=>{
      // The editor can refresh its tool buttons while the menu is opening.
      // Reanchor to the corresponding live control instead of dropping it.
      const live=anchor?.isConnected?anchor:
        anchor?.dataset.val?document.querySelector(`.swift-editor-toolbar [data-val="${anchor.dataset.val}"]`):null;
      if(!live){
        if(++attempts<10)retry=requestAnimationFrame(place);
        else onClose();
        return;
      }
      attempts=0;
      setPosition(popupPlacement({anchor:live.getBoundingClientRect(),
        viewportWidth:innerWidth,viewportHeight:innerHeight,
        popupWidth:width,popupHeight:height,picker}));
    };
    place();
    addEventListener('resize',place);
    addEventListener('scroll',place,true);
    return ()=>{cancelAnimationFrame(retry);removeEventListener('resize',place);removeEventListener('scroll',place,true);};
  },[anchor,width,height,picker,onClose]);
  useEffect(()=>{
    const key=event=>{if(event.key==='Escape'){event.preventDefault();onClose();}};
    const outside=event=>{
      if(!event.target.closest?.('.swift-popover,.swift-editor-toolbar,.swift-editor-head')&&
        !anchor?.contains(event.target))onClose();
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
  const choices=tab==='used'?(draft.layers||[]).filter(node=>node.type==='shape'&&!node.hidden)
    .map(node=>[node.id,node.kind==='vector'?'自定义图形':node.kind,node]):
    tab==='advanced'?advancedShapes:commonShapes;
  return <><div className="swift-segments">
    {[['used','已使用图形'],['common','基础图形'],['advanced','高级图形']].map(([id,label])=><button key={id}
      className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}
  </div><div className="canvas-picker-grid">{choices.length?choices.map(([id,label,copy])=>{
    const sample=copy||configureShape(primitive(id,draft),id);
    const image='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(shapeThumbnailSVG(sample));
    return <button key={id} type="button" data-shape-kind={copy?'used':id} onClick={()=>onPick(copy||id)}>
      <img src={image} alt=""/><span>{label}</span></button>;
  }):<p>这一页还没有图形。</p>}</div></>;
}

function MaterialPicker({draft,materials,series,source,onPick}){
  const [tab,setTab]=useState(draft.items.some(item=>!item.isParked)?'used':'all');
  const [query,setQuery]=useState(''),[group,setGroup]=useState('all');
  const [kind,setKind]=useState('all'),[status,setStatus]=useState('all');
  const [sortBasis,setSortBasis]=useState('time'),[sortOrder,setSortOrder]=useState('desc'),[shown,setShown]=useState(40);
  const byID=useMemo(()=>new Map(materials.map(asset=>[asset.id,asset])),[materials]);
  const rows=useMemo(()=>{
    if(tab==='used'||tab==='standby')return draft.items.filter(item=>!!item.isParked===(tab==='standby'))
      .map(item=>({asset:byID.get(item.assetID),item})).filter(row=>!!row.asset);
    const list=materials.filter(asset=>!asset.isProjectInternal&&
      (group==='all'||(group==='none'?!asset.seriesID:asset.seriesID===group))&&
      (kind==='all'||asset.kind===kind)&&
      (status==='all'||(status==='ready'?asset.reviewStatus==='ready':status==='pendingReview'?asset.reviewStatus!=='ready':
        status==='used'?asset.usageStatus==='used':status==='unused'?asset.usageStatus!=='used':
        status==='inside'?!!asset.seriesID:status==='outside'?!asset.seriesID:status==='favorite'?!!asset.isFavorite:true))&&
      (!query||asset.title?.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    list.sort((a,b)=>sortBasis==='name'?a.title.localeCompare(b.title,'zh-CN')*(sortOrder==='asc'?1:-1):
      (Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0))*(sortOrder==='asc'?1:-1));
    return list.map(asset=>({asset}));
  },[tab,draft.items,materials,byID,group,kind,status,sortBasis,sortOrder,query]);
  useEffect(()=>setShown(40),[tab,query,group,kind,status,sortBasis,sortOrder]);
  return <><div className="swift-segments">
    {[['used','已使用素材'],['standby','备选素材'],['all','所有素材']].map(([id,label])=><button
      key={id} type="button" className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}
  </div>{tab==='all'?<div className="canvas-material-filters">
    <select aria-label="选择系列" value={group} onChange={event=>setGroup(event.target.value)}>
      <option value="all">全部系列</option><option value="none">系列外</option>
      {series.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
    </select><select aria-label="过滤素材类型" value={kind} onChange={event=>setKind(event.target.value)}>
      {[['all','全部类型'],...materialKinds].map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select><select aria-label="素材状态" value={status} onChange={event=>setStatus(event.target.value)}>
      {[['all','全部状态'],['ready','已整理'],['pendingReview','未整理'],['used','已使用'],['unused','未使用'],['inside','系列中'],['outside','系列外'],['favorite','已收藏']]
        .map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select><select aria-label="排序依据" value={sortBasis} onChange={event=>setSortBasis(event.target.value)}>
      {[['time','最近添加'],['name','名称']].map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select><select aria-label="排序顺序" value={sortOrder} onChange={event=>setSortOrder(event.target.value)}>
      {[['desc','降序'],['asc','升序']].map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select><input type="search" value={query} onChange={event=>setQuery(event.target.value)}
      placeholder="搜索素材" aria-label="搜索可用素材"/></div>:null}
    <div className="canvas-picker-grid" onScroll={event=>{
      const node=event.currentTarget;
      if(node.scrollHeight-node.scrollTop-node.clientHeight<150)setShown(count=>Math.min(rows.length,count+40));
    }}>{rows.slice(0,shown).map(({asset,item})=><button type="button" key={item?.id||asset.id}
      data-material-id={asset.id} data-picker-item={item?.id} onClick={()=>onPick(asset.id,item?.id)}>
      {source(asset.blobId)||asset.staticPath?<img src={source(asset.blobId)||asset.staticPath}
        loading="lazy" decoding="async" alt=""/>:<span>无预览</span>}
      <span>{asset.title}{item?.splitParentId?' · 裁片 '+((item.splitPartIndex??0)+1):''}</span></button>)}
    </div>{!rows.length?<p>没有符合条件的素材</p>:rows.length>shown?<small>下滑继续显示 · 共 {rows.length} 件</small>:null}</>;
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
        state.tool===kind&&['pen','eraser','highlighter','lasso'].includes(kind)?
          setMenu(previous=>previous?.kind===kind?null:{kind,anchor:event.currentTarget}):
          (close(),onAction('fabric-tool',null,kind))}>{glyphs[kind]}</button>)}</div>
    <div className="canvas-context-tools" aria-label="当前工具选项">
      {(state.multiSelected||[]).length>1?<><span>已选 {state.multiSelected.length} 项</span>
        <button type="button" onClick={()=>onAction('fabric-group-selection')}>组合移动</button>
        <button type="button" onClick={()=>onAction('fabric-clear-selection')}>清空选择</button></>:
      ['pen','highlighter'].includes(state.tool)?<>
        <label>笔宽 <input type="range" min={state.tool==='pen'?.2:.5} max={state.tool==='pen'?3:8} step="0.1"
          value={state.tool==='pen'?tools.fabricPenWidthMM??.5:tools.fabricMarkerWidthMM??2}
          onChange={event=>setting(state.tool==='pen'?'fabricPenWidthMM':'fabricMarkerWidthMM',event.target.value)}/>
          <span>{Number(state.tool==='pen'?tools.fabricPenWidthMM??.5:tools.fabricMarkerWidthMM??2).toFixed(1)} mm</span></label>
        <label>颜色 <input type="color" value={state.tool==='pen'?tools.penColor||'#2b5245':tools.fabricMarkerColor||'#f5cf45'}
          onChange={event=>setting(state.tool==='pen'?'penColor':'fabricMarkerColor',event.target.value)}/></label>
      </>:state.tool==='eraser'?<label>橡皮擦 <input type="range" min="1" max="12" step="0.5"
        value={tools.fabricEraserWidthMM??4} onChange={event=>setting('fabricEraserWidthMM',event.target.value)}/>
        <span>{Number(tools.fabricEraserWidthMM??4).toFixed(1)} mm</span></label>:
      <span className="swift-editor-hint">{state.tool==='text'?'点画布插入文字；点已有文字直接编辑':'点画布对象选择与调整'}</span>}
    </div>
  </div>{menu?<ReactPopover anchor={menu.anchor} onClose={close}
    title={{shape:'添加图形',material:'选择素材',paper:'画布背景',layers:'图层',
      pen:'笔设置',eraser:'橡皮擦设置',highlighter:'荧光笔设置',lasso:'套索选择设置'}[menu.kind]}
    className={['shape','material'].includes(menu.kind)?`swift-picker-popover swift-${menu.kind}-picker`:'swift-menu'}
    width={menu.kind==='paper'?260:innerWidth>=900?432:360} height={menu.kind==='shape'?550:440}
    picker={['shape','material'].includes(menu.kind)}>
    {menu.kind==='shape'?<ShapePicker draft={draft} onPick={id=>choose('fabric-add-shape',id)}/>:null}
    {menu.kind==='material'?<MaterialPicker draft={draft} materials={materials}
      series={state.series||[]} source={source}
      onPick={(id,itemID)=>choose(itemID?'fabric-unpark':'fabric-add-material',itemID||id)}/>:null}
    {menu.kind==='pen'?<div className="stack">{[['pressure','钢笔'],['ballpoint','圆珠笔'],['brush','画笔']]
      .map(([id,label])=><button key={id} type="button" aria-checked={(tools.fabricPenStyle||'pressure')===id}
        onClick={()=>{setting('fabricPenStyle',id);close();}}>{label}</button>)}</div>:null}
    {menu.kind==='highlighter'?<label className="canvas-toggle">直线绘制
      <input type="checkbox" checked={!!tools.fabricMarkerStraight}
        onChange={event=>setting('fabricMarkerStraight',event.target.checked)}/></label>:null}
    {menu.kind==='eraser'?<div className="stack">{[['fine','精细橡皮擦'],['standard','标准橡皮擦 · 擦除经过部分'],['brush','画笔橡皮擦 · 擦除整条笔迹']]
      .map(([id,label])=><button key={id} type="button" aria-checked={(tools.fabricEraserStyle||'standard')===id}
        onClick={()=>{setting('fabricEraserStyle',id);close();}}>{label}</button>)}</div>:null}
    {menu.kind==='lasso'?<div className="stack">{[['contain','完整包含'],['intersect','只需要相交']]
      .map(([id,label])=><button key={id} type="button" aria-checked={(state.selectionMode||'contain')===id}
        onClick={()=>{onAction('fabric-selection-mode',id);close();}}>{label}</button>)}</div>:null}
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

export function FabricHeaderMenu({kind,project,onAction,onAIOpen}){
  const [anchor,setAnchor]=useState(null);
  const close=()=>setAnchor(null);
  const entries=kind==='export'?[['save-snapshot','保存快照'],['export-png','导出 PNG'],
    ['print','导出 PDF / 打印'],['download-project-json','导出可编辑 JSON'],
    ['export-scene-json','导出 Scene JSON'],['creative-json','导入创作指令']]:
    [['new-draft','新方案'],['save-archive','保存手动存档'],
      ...(project.manualArchives||[]).slice(-5).reverse().map(item=>['restore-archive','恢复 '+new Date(item.date).toLocaleString(),item.id])];
  return <><button type="button" className="btn" aria-label={kind==='export'?'导出作品':'历史记录'}
    onClick={event=>setAnchor(previous=>previous?null:event.currentTarget)}>{kind==='export'?'导出':'◷'}</button>
    {anchor?<ReactPopover anchor={anchor} onClose={close} title={kind==='export'?'导出作品':'历史记录'}
      width={260} height={360}>
      <div className="stack">{kind==='history'?<button type="button" data-editor-ai="true"
        onClick={()=>{close();onAIOpen?.();}}>AI 创作</button>:null}
        {entries.map(([action,label,id],index)=><button key={index} type="button"
        onClick={()=>{close();onAction(action,id);}}>{label}</button>)}</div>
    </ReactPopover>:null}</>;
}
