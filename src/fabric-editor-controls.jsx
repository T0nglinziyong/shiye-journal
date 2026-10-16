import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {materialKinds} from './material-taxonomy.js';
import {createPortal} from 'react-dom';
import {popupPlacement} from './popover-placement.js';
import {commonShapes,advancedShapes,configureShape,shapeThumbnailSVG} from './editor-tools-model.js';
import {primitive} from './domain.js';
import {iconMarkup} from './icons.js';
import {adjacentFontSize} from './canvas-control-behavior.js';

const toolIcons={select:'cursor',pen:'pen',eraser:'eraser',highlighter:'marker',lasso:'lasso',text:'text',shape:'shape',material:'material',layers:'layers',paper:'paper'};
const labels={select:'选择',pen:'笔',eraser:'橡皮擦',highlighter:'荧光笔',lasso:'套索选择',text:'文字',shape:'图形',material:'素材',layers:'图层',paper:'画布背景'};
const palette=['#171717','#555555','#989898','#ffffff','#e33b45','#fb8795','#ff9c21','#e8d432','#159b73','#57bd4b','#167ad9','#264d9c','#853aaf','#955969'];
const slotDefaults={pen:{width:[.3,.5,1],color:['#171717','#2b5245','#167ad9']},highlighter:{width:[1,2,4],color:['#fb8795','#f5cf45','#57bd4b']},eraser:{width:[2,4,8]}};

function ReactPopover({anchor,title,className='',width=360,height=440,picker=false,onClose,children}){
  const [position,setPosition]=useState(null);
  useLayoutEffect(()=>{
    let retry=0,attempts=0;
    const place=()=>{
      // The editor can refresh its tool buttons while the menu is opening.
      // Reanchor to the corresponding live control instead of dropping it.
      const live=anchor?.isConnected?anchor:
        anchor?.dataset.val?document.querySelector(`.swift-editor-toolbar [data-val="${anchor.dataset.val}"]`):
        anchor?.dataset.popoverAnchor?document.querySelector(`.swift-editor-toolbar [data-popover-anchor="${anchor.dataset.popoverAnchor}"]`):null;
      if(!live){
        if(++attempts<10)retry=requestAnimationFrame(place);
        else onClose();
        return;
      }
      attempts=0;
      const next=popupPlacement({anchor:live.getBoundingClientRect(),
        viewportWidth:innerWidth,viewportHeight:innerHeight,
        popupWidth:width,popupHeight:height,picker});
      setPosition(previous=>previous&&Object.keys(next).every(key=>previous[key]===next[key])?previous:next);
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
        !anchor?.contains(event.target)){
        if(className.includes('swift-layer-popover')&&event.target.closest?.('#canvas-page')){
          // Dismissing the layer tree must not turn the same tap into a blank
          // canvas selection event and lose the layer chosen in the tree.
          event.preventDefault();event.stopImmediatePropagation();
        }
        onClose();
      }
    };
    addEventListener('keydown',key);addEventListener('pointerdown',outside,true);
    return ()=>{removeEventListener('keydown',key);removeEventListener('pointerdown',outside,true);};
  },[anchor,onClose,className]);
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
  const [kind,setKind]=useState('all'),[shown,setShown]=useState(40);
  const byID=useMemo(()=>new Map(materials.map(asset=>[asset.id,asset])),[materials]);
  const matches=asset=>!!asset&&
    (group==='all'||(group==='none'?!asset.seriesID:asset.seriesID===group))&&
    (kind==='all'||asset.kind===kind)&&
    (!query||asset.title?.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const rows=useMemo(()=>{
    if(tab==='used'||tab==='standby')return draft.items.filter(item=>!!item.isParked===(tab==='standby'))
      .map(item=>({asset:byID.get(item.assetID),item}))
      .filter(row=>matches(row.asset));
    const list=materials.filter(asset=>!asset.isProjectInternal&&matches(asset));
    list.sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0));
    return list.map(asset=>({asset}));
  },[tab,draft.items,materials,byID,group,kind,query]);
  useEffect(()=>setShown(40),[tab,query,group,kind]);
  return <><div className="swift-segments">
    {[['used','已使用素材'],['standby','备选素材'],['all','所有素材']].map(([id,label])=><button
      key={id} type="button" className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}
  </div><input className="canvas-material-search" type="search" value={query}
    onChange={event=>setQuery(event.target.value)} placeholder="搜索素材" aria-label="搜索可用素材"/>
    <div className="canvas-material-filters">
    <select aria-label="选择系列" value={group} onChange={event=>setGroup(event.target.value)}>
      <option value="all">全部系列</option><option value="none">系列外</option>
      {series.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
    </select><select aria-label="过滤素材类型" value={kind} onChange={event=>setKind(event.target.value)}>
      {[['all','全部类型'],...materialKinds].map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></div>
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

function LayerTree({draft,state,materials,onAction,collapsed,setCollapsed}){
  const [multi,setMulti]=useState(false);
  const [draggingID,setDraggingID]=useState(null);
  const [dropTargetID,setDropTargetID]=useState(null);
  const drag=useRef(null);
  const touchTimes=useRef(new WeakMap());
  const touchActivate=(event,action)=>{
    if(event.pointerType!=='touch')return;
    event.preventDefault();touchTimes.current.set(event.currentTarget,Date.now());action(event);
  };
  const clickActivate=(event,action)=>{
    if(Date.now()-(touchTimes.current.get(event.currentTarget)||0)<1000)return;
    action(event);
  };
  const names=useMemo(()=>new Map(materials.map(asset=>[asset.id,asset.title])),[materials]);
  const selected=new Set([...(state.multiSelected||[]),state.selected].filter(Boolean));
  const countInk=nodes=>(nodes||[]).reduce((count,node)=>count+(node.type==='ink'?1:0)+
    (node.type==='group'?countInk(node.children):0),0);
  const inkCount=countInk(draft.layers);
  const label=node=>node.type==='group'?node.name||'未命名组合':
    node.type==='material'?names.get(node.assetID)||'素材':node.type==='text'?node.content?.slice(0,27)||'文字':
    node.type==='ink'?'手写笔迹':node.kind||'图形';
  const visit=(nodes,level=1)=>[...(nodes||[])]
    .sort((a,b)=>(b.zIndex??0)-(a.zIndex??0)).map(node=>{
    const locked=!!(node.locked||node.isLocked);
    const hidden=!!(node.hidden||node.isHidden||node.isParked);
    const open=node.type==='group'&&!collapsed.has(node.id);
    const toggle=()=>setCollapsed(previous=>{
      const next=new Set(previous);
      if(next.has(node.id))next.delete(node.id);
      else next.add(node.id);
      return next;
    });
    const operate=operation=>onAction('fabric-layer-operation',{id:node.id,operation});
    const glyph=node.type==='group'?'▧':node.type==='material'?'▱':node.type==='text'?'Aa':node.type==='ink'?'✎':'◇';
    return <div className="scene-layer-branch" key={node.id}>
      <div className={`canvas-layer-row scene-layer-node ${selected.has(node.id)?'selected':''} ${draggingID===node.id?'dragging':''} ${dropTargetID===node.id?'drop-target':''}`}
        data-scene-node={node.id} role="treeitem" aria-level={level}
        aria-expanded={node.type==='group'?open:undefined}>
        <button className="scene-layer-expand" type="button" disabled={node.type!=='group'}
          aria-label={open?'折叠组合':'展开组合'} aria-expanded={node.type==='group'?open:undefined}
          onPointerUp={event=>touchActivate(event,toggle)}
          onClick={event=>clickActivate(event,toggle)}>{node.type==='group'?(open?'▾':'▸'):''}</button>
        <button className="scene-layer-pick" data-layer-pick type="button" aria-current={selected.has(node.id)}
          onPointerUp={event=>touchActivate(event,()=>onAction('fabric-layer-select',{id:node.id,add:multi}))}
          onClick={event=>clickActivate(event,()=>onAction('fabric-layer-select',{id:node.id,add:multi||event.shiftKey||event.ctrlKey||event.metaKey}))}>
          <span className="scene-layer-symbol">{glyph}</span><span>{label(node)}</span></button>
        <button className="scene-layer-small" type="button" aria-label={locked?'解锁':'锁定'}
          onClick={()=>operate('lock')} dangerouslySetInnerHTML={{__html:iconMarkup(locked?'lock':'unlock')}}/>
        <button className="scene-layer-small" type="button" aria-label={hidden?'显示':'隐藏'}
          disabled={locked} onClick={()=>operate('visibility')}
          dangerouslySetInnerHTML={{__html:iconMarkup(hidden?'eyeOff':'eye')}}/>
        <button className="scene-layer-grip" type="button" aria-label={`拖动图层 ${label(node)}`}
          disabled={locked} onPointerDown={event=>{
            if(event.button>0)return;
            event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
            drag.current={id:node.id,x:event.clientX,y:event.clientY,targetID:null,relation:null};
            setDraggingID(node.id);
          }} onPointerMove={event=>{
            if(!drag.current||drag.current.id!==node.id)return;
            const target=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('[data-scene-node]');
            if(!target||target.dataset.sceneNode===node.id)return;
            const rect=target.getBoundingClientRect(),fraction=(event.clientY-rect.top)/Math.max(1,rect.height);
            const rows=[...document.querySelectorAll('.scene-layer-tree [data-scene-node]')];
            const direction=rows.indexOf(target)>rows.findIndex(row=>row.dataset.sceneNode===node.id)?'after':'before';
            const relation=target.getAttribute('aria-expanded')!==null&&fraction>.28&&fraction<.72?'inside':
              fraction<.28?'before':fraction>.72?'after':direction;
            drag.current={...drag.current,targetID:target.dataset.sceneNode,relation};
            setDropTargetID(target.dataset.sceneNode);
          }} onPointerUp={()=>{
            if(drag.current?.id===node.id&&drag.current.targetID)onAction('fabric-layer-operation',{
              id:node.id,operation:'move',targetID:drag.current.targetID,relation:drag.current.relation});
            drag.current=null;setDraggingID(null);setDropTargetID(null);
          }} onPointerCancel={()=>{drag.current=null;setDraggingID(null);setDropTargetID(null);}}><span aria-hidden="true" className="scene-layer-grip-mark"/></button>
      </div>{node.type==='group'&&open?<div className="scene-layer-children" role="group">{visit(node.children||[],level+1)}</div>:null}
    </div>;
  });
  return <div className="swift-layer-popover scene-layer-tree-popover">
    <div className="scene-layer-tree-toolbar">
      <button type="button" className="btn mini" aria-pressed={multi}
        onPointerUp={event=>touchActivate(event,()=>setMulti(value=>!value))}
        onClick={event=>clickActivate(event,()=>setMulti(value=>!value))}>{multi?'✓ 多选中':'多选'}</button>
      <button type="button" className="btn mini" disabled={selected.size<2}
        onPointerUp={event=>touchActivate(event,()=>onAction('fabric-group-selection'))}
        onClick={event=>clickActivate(event,()=>onAction('fabric-group-selection'))}>组合所选</button>
      <button type="button" className="btn mini" disabled={!draft.layers.some(node=>node.type==='group')}
        onPointerUp={event=>touchActivate(event,()=>onAction('fabric-ungroup-selection'))}
        onClick={event=>clickActivate(event,()=>onAction('fabric-ungroup-selection'))}>取消组合</button>
    </div><div className="canvas-layer-list scene-layer-tree" role="tree" aria-label="可编辑场景递归图层树">
      {visit(draft.layers)}</div><p className="scene-layer-tree-status" role="status">
        {draft.layers.length} 个顶层图层 · 拖动把手改变层级
        {inkCount?` · 笔迹 ${inkCount} 笔（可在此选择）`:''}</p>
  </div>;
}

function FontSizeInput({value,onCommit}){
  const [input,setInput]=useState(String(Math.round(value||40)));
  useEffect(()=>setInput(String(Math.round(value||40))),[value]);
  const commit=raw=>{
    const number=Number(raw);
    if(raw.trim()&&Number.isFinite(number)&&number>=5&&number<=400)onCommit(number);
    else setInput(String(Math.round(value||40)));
  };
  return <input type="number" aria-label="字号" min="5" max="400" step="1" value={input}
    onChange={event=>setInput(event.target.value)} onBlur={event=>commit(event.currentTarget.value)}
    onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>;
}

export function FabricEditorToolbar({state,draft,materials,source,selected,onInspectorChange,onAction}){
  const [menu,setMenu]=useState(null);
  const [collapsedLayers,setCollapsedLayers]=useState(()=>new Set());
  const close=useCallback(()=>setMenu(null),[]);
  const open=(kind,event)=>{
    const anchor=event.currentTarget;
    const nextTool=['paper','layers','material'].includes(kind)?'select':kind;
    if(state.tool!==nextTool)onAction('fabric-tool',null,nextTool);
    setMenu(previous=>previous?.kind===kind?null:{kind,anchor});
  };
  const toggleMenu=(kind,event)=>{
    const anchor=event.currentTarget;
    setMenu(previous=>previous?.kind===kind?null:{kind,anchor});
  };
  const choose=(action,id)=>{close();onAction(action,id);};
  const tools=state.canvasTools||{};
  const setting=(name,value)=>onAction('fabric-tool-setting',name,value);
  const slotValue=(mode,kind,index)=>tools[`fabric${mode[0].toUpperCase()+mode.slice(1)}${kind==='width'?'WidthsMM':'Colors'}`]?.[index]??slotDefaults[mode][kind][index];
  const slotIndex=(mode,kind)=>tools[`fabric${mode[0].toUpperCase()+mode.slice(1)}${kind==='width'?'WidthSlot':'ColorSlot'}`]??1;
  const selectSlot=(mode,kind,index)=>onAction('fabric-tool-slot',{mode,kind,index});
  const editSlot=(mode,kind,index,value)=>onAction('fabric-tool-slot',{mode,kind,index,value});
  const toggleSlot=(mode,kind,index,event)=>{
    if(slotIndex(mode,kind)===index){
      const anchor=event.currentTarget;
      setMenu(previous=>previous?.kind===`slot-${kind}`&&previous.mode===mode&&previous.index===index?
        null:{kind:`slot-${kind}`,mode,index,anchor});
    }
    else {close();selectSlot(mode,kind,index);}
  };
  const activeTool=state.tool;
  const selectedNode=selected?.value;
  const selectedKind=selected?.kind;
  const editObject=(id,value)=>onInspectorChange(id,value);
  const textMode=selectedKind==='text'||activeTool==='text';
  const text=selectedKind==='text'?selectedNode:state.textDefaults||{style:'serif',fontSize:40,color:'#30463d',alignment:'left'};
  const textProperty=(key,value)=>onAction('fabric-text-property',key,value);
  const shapeProperty=(key,value)=>onAction('fabric-shape-property',key,value);
  const arrangeButton=<button type="button" data-popover-anchor="arrange"
    onClick={event=>setMenu(previous=>previous?.kind==='arrange'?null:{kind:'arrange',anchor:event.currentTarget})}>排列</button>;
  return <><div className="swift-editor-toolbar" aria-label="创作工具">
    <div className="editor-tools">{Object.keys(toolIcons).map(kind=><button key={kind} type="button"
      className={`btn ${state.tool===kind?'primary':''}`} data-val={kind} data-act="tool"
      data-react-action="true" aria-label={labels[kind]} aria-pressed={state.tool===kind}
      onClick={event=>['shape','material','layers','paper'].includes(kind)?open(kind,event):
        state.tool===kind&&['pen','eraser','highlighter','lasso'].includes(kind)?
          toggleMenu(kind,event):
          (close(),onAction('fabric-tool',null,kind))} dangerouslySetInnerHTML={{__html:iconMarkup(toolIcons[kind])}}/>)}</div>
    <div className="canvas-context-tools" aria-label="当前工具选项">
      {state.tool==='lasso'&&(state.multiSelected||[]).length?<><span>已套选 {state.multiSelected.length} 项</span>
        {state.multiSelected.length>1?arrangeButton:null}
        <button type="button" onClick={()=>onAction('fabric-clear-selection')}>清空选择</button></>:
      (state.multiSelected||[]).length>1?<><span>已选 {state.multiSelected.length} 项</span>
        {arrangeButton}
        <button type="button" onClick={()=>onAction('fabric-group-selection')}>组合移动</button>
        <button type="button" onClick={()=>onAction('fabric-clear-selection')}>清空选择</button></>:
      ['pen','highlighter','eraser'].includes(activeTool)?<>
        {slotDefaults[activeTool].width.map((_,index)=>{
          const width=Number(slotValue(activeTool,'width',index));
          return <button key={'w'+index} type="button" className={`${activeTool==='eraser'?'eraser-size':'stroke-width'} ${slotIndex(activeTool,'width')===index?'active':''}`}
            aria-label={`${activeTool==='eraser'?'橡皮大小':'笔画粗细'} ${width.toFixed(1)} mm`}
            title={slotIndex(activeTool,'width')===index?'再次点击可修改粗细':''}
            onClick={event=>toggleSlot(activeTool,'width',index,event)}>
            {activeTool==='eraser'?<span style={{fontSize:Math.min(30,14+width*2)}}>○</span>:<span style={{height:Math.max(2,Math.min(20,width*4))}}/>}
          </button>;
        })}
        {activeTool!=='eraser'?slotDefaults[activeTool].color.map((_,index)=><button key={'c'+index}
          type="button" className={`ink-color ${slotIndex(activeTool,'color')===index?'active':''}`}
          style={{backgroundColor:slotValue(activeTool,'color',index)}}
          aria-label={`笔画颜色 ${slotValue(activeTool,'color',index)}`}
          title={slotIndex(activeTool,'color')===index?'再次点击可修改颜色':''}
          onClick={event=>toggleSlot(activeTool,'color',index,event)}/>):null}
      </>:textMode?<>
        <div className="canvas-text-format"><select aria-label="字体" value={text.style||'serif'} onChange={event=>textProperty('style',event.target.value)}>
          {['serif','sans','rounded','hand'].map((id,index)=><option key={id} value={id}>{['宋体','黑体','圆体','手写体'][index]}</option>)}
        </select><div className="canvas-font-size-stepper" aria-label="调整字号">
          <button type="button" className="font-step" aria-label="减小字号" onClick={()=>textProperty('fontSize',adjacentFontSize(text.fontSize,-1))}>‹</button>
          <FontSizeInput key={selectedNode?.id||'new-text'} value={text.fontSize||40}
            onCommit={value=>textProperty('fontSize',value)}/>
          <button type="button" className="font-step" aria-label="增大字号" onClick={()=>textProperty('fontSize',adjacentFontSize(text.fontSize,1))}>›</button>
        </div></div><button type="button" aria-label="段落设置" data-popover-anchor="text-paragraph" onClick={event=>setMenu({kind:'text-paragraph',anchor:event.currentTarget})}>☷</button>
        <input type="color" aria-label="文字颜色" value={text.color||'#30463d'}
          onChange={event=>textProperty('color',event.target.value)}/>
        <button type="button" aria-label="文字样式" data-popover-anchor="text-style" onClick={event=>setMenu({kind:'text-style',anchor:event.currentTarget})}>Aa</button>

      </>:selectedKind==='shape'?<>
        <button type="button" className="shape-add-quick" data-popover-anchor="shape-quick" onClick={event=>open('shape',event)}>＋ 图形</button>
        {!selectedNode.vectorLayers?<><label className="shape-quick-color">填充<input type="color" aria-label="填充颜色"
          value={selectedNode.fill||'#ffffff'} onChange={event=>shapeProperty('fill',event.target.value)}/></label>
        <label className="shape-quick-color">描边<input type="color" aria-label="描边颜色"
          value={selectedNode.stroke||'#547da4'} onChange={event=>shapeProperty('stroke',event.target.value)}/></label>
        <select className="shape-quick-select" aria-label="描边粗细" value={selectedNode.lineWidth??2}
          onChange={event=>shapeProperty('lineWidth',Number(event.target.value))}>
          {[0,1,2,3,4,6,8,12,16,24,30].map(value=><option key={value} value={value}>线 {value}</option>)}
        </select></>:null}
        <select className="shape-quick-select" aria-label="图形整体不透明度"
          value={Math.round((selectedNode.opacity??1)*100)}
          onChange={event=>shapeProperty('opacity',Number(event.target.value)/100)}>
          {[0,25,50,75,100].map(value=><option key={value} value={value}>{value}%</option>)}
        </select>
        <button type="button" className="shape-detail-quick" onClick={()=>onAction('fabric-inspector-open')}>更多设置</button>
      </>:selectedNode?selectedKind==='material'?<button type="button" onClick={()=>onAction('fabric-inspector-open')}>☷ 素材操作</button>:null:
      activeTool==='shape'?<button type="button" className="shape-add-quick" data-popover-anchor="shape-quick" onClick={event=>open('shape',event)}>＋ 图形</button>:
      activeTool==='lasso'?<button type="button" data-popover-anchor="lasso-quick" onClick={event=>setMenu({kind:'lasso',anchor:event.currentTarget})}>◌ 套索选择</button>:
      <button type="button" className="canvas-fit-button" onClick={()=>onAction('fabric-fit-view')}>↖ {Math.round(state.zoom*100)}%</button>}
    </div>
  </div>{menu?<ReactPopover anchor={menu.anchor} onClose={close}
    title={{shape:'添加图形',material:'选择素材',paper:'画布背景',layers:'图层',
      pen:'笔设置',eraser:'橡皮擦设置',highlighter:'荧光笔设置',lasso:'套索选择设置',
      'slot-width':'修改粗细','slot-color':'修改当前颜色',
      'text-paragraph':'段落','text-style':'文字样式',arrange:'排列所选'}[menu.kind]}
    className={['shape','material'].includes(menu.kind)?`swift-picker-popover swift-${menu.kind}-picker`:
      menu.kind==='layers'?'swift-menu swift-layer-popover':'swift-menu'}
    width={menu.kind==='paper'?260:menu.kind==='layers'?310:
      menu.kind==='slot-width'?270:menu.kind==='slot-color'?280:
      ['pen','eraser','highlighter','lasso'].includes(menu.kind)?280:
      ['text-paragraph','text-style','arrange'].includes(menu.kind)?230:
      280} height={menu.kind==='layers'?360:menu.kind==='slot-color'?310:menu.kind==='shape'?550:440}
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
    {menu.kind==='lasso'?<div className="stack canvas-lasso-settings">{[['contain','完整包含'],['intersect','只需要相交']]
      .map(([id,label])=><button key={id} type="button" aria-checked={(state.selectionMode||'contain')===id}
        onClick={()=>onAction('fabric-selection-mode',id)}>{label}</button>)}
      <div className="canvas-lasso-kind-list">{[['material','素材'],['shape','图形'],['text','文字']]
        .map(([kind,label])=><label key={kind}><input type="checkbox"
          checked={(state.selectionFilter||{material:true,shape:true,text:true})[kind]!==false}
          onChange={event=>onAction('fabric-selection-filter',kind,event.target.checked)}/>{label}</label>)}</div>
      <label className="canvas-toggle">锁住字迹
        <input type="checkbox" checked={!!state.selectionFilter?.lockInk}
          onChange={event=>onAction('fabric-selection-filter','lockInk',event.target.checked)}/></label>
    </div>:null}
    {menu.kind==='arrange'?<div className="canvas-arrange-menu">
      <span>对齐所选</span><div>{[['left','左边'],['center','水平居中'],['right','右边'],
        ['top','上边'],['middle','垂直居中'],['bottom','下边']].map(([mode,label])=><button
          key={mode} type="button" onClick={()=>choose('fabric-arrange-selection',mode)}>{label}</button>)}</div>
      <span>均分间距</span><div>{[['space-horizontal','横向均分'],['space-vertical','纵向均分']]
        .map(([mode,label])=><button key={mode} type="button"
          disabled={(state.multiSelected||[]).length<3}
          onClick={()=>choose('fabric-arrange-selection',mode)}>{label}</button>)}</div>
    </div>:null}
    {menu.kind==='slot-width'?<label className="canvas-setting">粗细 · {Number(slotValue(menu.mode,'width',menu.index)).toFixed(1)} mm
      <input type="range" min={menu.mode==='pen'?.2:menu.mode==='highlighter'?.5:1}
        max={menu.mode==='pen'?3:menu.mode==='highlighter'?8:12} step="0.1"
        value={slotValue(menu.mode,'width',menu.index)}
        onChange={event=>editSlot(menu.mode,'width',menu.index,event.target.value)}/></label>:null}
    {menu.kind==='slot-color'?<><div className="canvas-color-grid">{palette.map(color=><button key={color}
      type="button" className="ink-color" style={{backgroundColor:color}} aria-label={`颜色 ${color}`}
      onClick={()=>{editSlot(menu.mode,'color',menu.index,color);close();}}/>)}</div>
      <label>自定义颜色<input type="color" value={slotValue(menu.mode,'color',menu.index)}
        onChange={event=>editSlot(menu.mode,'color',menu.index,event.target.value)}/></label></>:null}
    {menu.kind==='text-paragraph'?<div className="stack">{[['left','左对齐'],['center','居中'],['right','右对齐']]
      .map(([id,label])=><button key={id} type="button" aria-checked={(text.alignment||'left')===id}
        onClick={()=>{textProperty('alignment',id);close();}}>{(text.alignment||'left')===id?'✓ ':''}{label}</button>)}
      {selectedKind==='text'?<button type="button" onClick={()=>{close();onAction('fabric-inspector-open');}}>详细文字设置</button>:null}
    </div>:null}
    {menu.kind==='text-style'?<div className="stack">{[['bold','粗体'],['italic','斜体'],['underline','下划线'],['strikethrough','删除线']]
      .map(([id,label])=><button key={id} type="button" aria-checked={!!text[id]}
        onClick={()=>{textProperty(id,!text[id]);close();}}>{text[id]?'✓ ':''}{label}</button>)}
      {selectedKind==='text'?<button type="button" onClick={()=>{close();onAction('fabric-inspector-open');}}>详细文字设置</button>:null}
    </div>:null}
    {menu.kind==='paper'?<>
      {[['plain','纯色'],['grid','方格'],['lines','横线'],['dots','点阵'],['columns','双栏']]
        .map(([id,label])=><button key={id} type="button" role="menuitemradio"
          aria-checked={draft.paperPattern===id} onClick={()=>{close();onAction('fabric-paper','pattern',id);}}>
          {label}</button>)}
      <label className="canvas-toggle">纸张颜色<input type="color" value={draft.paperColor}
        onChange={event=>{close();onAction('fabric-paper','color',event.target.value);}}/></label>
    </>:null}
    {menu.kind==='layers'?<LayerTree draft={draft} state={state} materials={materials} onAction={onAction}
      collapsed={collapsedLayers} setCollapsed={setCollapsedLayers}/>:null}
  </ReactPopover>:null}</>;
}

export function FabricHeaderMenu({kind,project,onAction,onAIOpen}){
  const [anchor,setAnchor]=useState(null);
  const close=useCallback(()=>setAnchor(null),[]);
  const run=(action,id,value)=>{close();onAction(action,id,value);};
  const entries=[['save-snapshot','保存快照'],['export-png','导出 PNG'],
    ['export-pdf','导出 PDF'],['download-project-json','导出可编辑 JSON'],
    ['export-scene-json','导出标准 Scene JSON'],['print','打印'],
    ['creative-json','导入创作指令']];
  const historyRow=(title,restore,rename,remove,key)=><div className="canvas-history-row" key={key}>
    <button type="button" className="canvas-history-restore" title={title} onClick={restore}>{title}</button><div>
      <button type="button" aria-label={`重命名 ${title}`} title="重命名" onClick={rename}>✎</button>
      <button type="button" aria-label={`删除 ${title}`} title="删除" onClick={remove}>×</button>
    </div></div>;
  return <><button type="button" className="btn" aria-label={kind==='export'?'导出作品':'历史记录'}
    onClick={event=>{const target=event.currentTarget;setAnchor(previous=>previous?null:target);}}>{kind==='export'?'导出':'◷'}</button>
    {anchor?<ReactPopover anchor={anchor} onClose={close} title={kind==='export'?'导出作品':'历史记录'}
      className={kind==='history'?'swift-history-popover':'swift-menu'}
      width={kind==='history'?320:220} height={kind==='history'?390:360}>
      {kind==='history'?<div className="canvas-history-list">
        {project.drafts.map((draft,index)=>historyRow(draft.title&&!/^方案\s*\d+$/.test(draft.title)?draft.title:`历史版本 ${index+1}`,
          ()=>run('fabric-history-restore-draft',draft.id),
          ()=>onAction('fabric-history-rename-draft',draft.id),
          ()=>run('fabric-history-delete-draft',draft.id),draft.id))}
        <hr/>
        <button type="button" data-editor-ai="true" onClick={()=>{close();onAIOpen?.();}}>AI 创作</button>
      </div>:<div className="stack">{entries.map(([action,label])=><button key={action} type="button"
        onClick={()=>run(action)}>{label}</button>)}</div>}
    </ReactPopover>:null}</>;
}
