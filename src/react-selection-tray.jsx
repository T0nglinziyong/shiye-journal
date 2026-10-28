import './selection-menu.css';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {selectionActive} from './library-selection-model.js';
import {selectionMenuWidth,reserveSelectionMenuSpace,selectionSideGeometry} from './selection-side-panels.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const labelButton=(label,onClick,{className='btn',...extra}={})=><button type="button" className={className} onClick={onClick} {...extra}>
  <span className="selection-action-label">{label}</span></button>;

export function ReactSelectionTray({selection,mode,visibleIDs=[],onAction,onError,series=[],projects=[],workTab='all'}){
  const [,setRevision]=useState(0),[menuOpen,setMenuOpen]=useState(false),
    [submenu,setSubmenu]=useState(''),[newSeries,setNewSeries]=useState(false),
    [busy,setBusy]=useState(false),
    [viewport,setViewport]=useState(0),[parentBox,setParentBox]=useState(null),
    [sideBox,setSideBox]=useState(null);
  const anchor=useRef(null),parent=useRef(null),side=useRef(null),newSeriesInput=useRef(null);
  const active=selectionActive(selection,mode);
  const refresh=()=>{setRevision(value=>value+1);
    window.dispatchEvent(new Event('shiye-selection-refresh'));};
  useEffect(()=>{
    const listener=()=>setRevision(value=>value+1);
    window.addEventListener('shiye-selection-refresh',listener);
    return ()=>window.removeEventListener('shiye-selection-refresh',listener);
  },[]);
  useEffect(()=>{setMenuOpen(false);setSubmenu('');},[mode,active]);
  useEffect(()=>{
    if(!menuOpen)return;
    const dismiss=event=>{
      if(anchor.current?.contains(event.target)||parent.current?.contains(event.target)||
        side.current?.contains(event.target))return;
      setMenuOpen(false);setSubmenu('');
    };
    const escape=event=>{if(event.key==='Escape'){
      event.preventDefault();setMenuOpen(false);setSubmenu('');anchor.current?.focus();}};
    const reposition=()=>setViewport(value=>value+1);
    document.addEventListener('pointerdown',dismiss,true);
    document.addEventListener('keydown',escape);
    window.addEventListener('resize',reposition);
    window.addEventListener('scroll',reposition,true);
    return ()=>{document.removeEventListener('pointerdown',dismiss,true);
      document.removeEventListener('keydown',escape);
      window.removeEventListener('resize',reposition);
      window.removeEventListener('scroll',reposition,true);};
  },[menuOpen]);
  useLayoutEffect(()=>{
    if(!menuOpen||!anchor.current||!parent.current)return;
    const rect=anchor.current.getBoundingClientRect();
    const width=selectionMenuWidth(innerWidth),height=parent.current.getBoundingClientRect().height;
    const natural=clamp(rect.left,12,Math.max(12,innerWidth-width-12));
    const left=reserveSelectionMenuSpace({left:natural,width,viewportWidth:innerWidth}).left;
    const top=rect.top-height-8>=12?rect.top-height-8:
      clamp(rect.bottom+8,12,Math.max(12,innerHeight-height-12));
    const next={left:Math.round(left),top:Math.round(top),width};
    setParentBox(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  },[menuOpen,viewport]);
  useLayoutEffect(()=>{
    if(!menuOpen||!submenu||!parent.current||!side.current)return;
    const rect=parent.current.getBoundingClientRect();
    const geometry=selectionSideGeometry({viewportWidth:innerWidth,viewportHeight:innerHeight,
      menu:{left:rect.left,right:rect.right,top:rect.top,width:rect.width,height:rect.height},
      panelHeight:side.current.scrollHeight});
    const next={left:Math.round(geometry.panelLeft),top:Math.round(geometry.top),
      width:Math.round(geometry.panelWidth),maxHeight:Math.round(geometry.maxHeight)};
    setSideBox(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  },[menuOpen,submenu,parentBox,viewport,series.length]);
  if(!active)return null;
  const count=selection.selected.size;
  const execute=async(action,value,{keepMenu=false}={})=>{
    if(busy)return;
    setBusy(true);
    try{await onAction(mode,action,value);
      if(!keepMenu){setMenuOpen(false);setSubmenu('');}
      refresh();
    }catch(error){onError?.(error);}finally{setBusy(false);}
  };
  const exportChoices=mode==='asset'?
    [['透明 PNG','export','png'],['白底 JPEG','export','jpeg'],
      ['原始图像','export','original'],['实际尺寸打印 PDF','print']]:
    mode==='series'?[['素材与系列 ZIP','export','素材与系列 ZIP'],
      ['系列清单 JSON','export','系列清单 JSON']]:
    (()=>{
      const selected=projects.filter(project=>selection.selected.has(project.id));
      const snapshots=selected.length>0&&selected.every(project=>project.isSnapshot),
        editable=selected.length>0&&selected.every(project=>!project.isSnapshot);
      if(snapshots)return selected.some(project=>project.snapshotFormat==='application/pdf')?
        [['原始快照文件','export','原始快照文件']]:
        [['原始快照文件','export','原始快照文件'],['PNG 图像','export','PNG 图像'],
          ['白底 JPEG','export','白底 JPEG']];
      if(editable)return [['可编辑拾页 JSON','export','可编辑拾页 JSON'],
        ['PNG 图像','export','PNG 图像'],['PDF 文件','export','PDF 文件']];
      return [['按原格式分别导出','export','按原格式分别导出']];
    })();
  const groups=mode==='asset'?[['导出素材','export'],['重新识别','classify'],
    ['加入系列','series'],['设置状态','status']]:mode==='series'?
    [['导出系列','export'],['编辑系列信息','edit-series']]:
    [[workTab==='snapshot'?'导出快照':'导出作品','export'],['重新识别','classify'],
      ...(projects.some(project=>selection.selected.has(project.id)&&!project.isSnapshot)?
        [['设置状态','status']]:[])];
  const submenuChoices=submenu==='export'?exportChoices:
    submenu==='series'?[['新建系列…','new-series'],['不归入系列','assign-series',null],
      ...series.map(entry=>[entry.title,'assign-series',entry.id])]:
    submenu==='status'?[['已使用','set-used',true],['未使用','set-used',false]]:[];
  const runChoice=(action,value)=>{
    if(action==='new-series'){
      setMenuOpen(false);setSubmenu('');setNewSeries(true);return;
    }
    void execute(action,value);
  };
  const toggleMenu=()=>{setMenuOpen(value=>!value);setSubmenu('');};
  return <>
    <div className="swift-tray manage library-management-tray" data-selection-mode={mode}>
      <strong>本次选中 {count} {mode==='series'?'个系列':'件'}</strong>
      {labelButton('全选页面',()=>{for(const id of visibleIDs)selection.selected.add(id);refresh();})}
      {labelButton('清空选择',()=>{selection.selected.clear();selection.showOnlySelected=false;refresh();},{disabled:!count||busy})}
      {labelButton(selection.showOnlySelected?'返回筛选':'查看所选',()=>{
        selection.showOnlySelected=!selection.showOnlySelected;refresh();
      },{disabled:!count&&!selection.showOnlySelected||busy})}
      {mode==='asset'?labelButton('加入搭配',()=>void execute('add-matching'),{disabled:!count||busy}):null}
      <button type="button" className="btn" ref={anchor} data-selection-more=""
        aria-haspopup="menu" aria-expanded={menuOpen} disabled={!count||busy} onClick={toggleMenu}>
        <span className="selection-action-label">更多操作</span></button>
      {labelButton(mode==='asset'?'删除素材':mode==='series'?'删除系列':
        workTab==='snapshot'?'删除快照':'删除作品',()=>void execute('delete'),
        {className:'btn danger',disabled:!count||busy})}
    </div>
    {menuOpen?createPortal(<>
      <section ref={parent} className={`swift-popover swift-menu selection-more-menu ${submenu?'selection-side-open':''}`}
        role="menu" aria-label="更多操作" style={{position:'fixed',
          left:parentBox?.left??-1000,top:parentBox?.top??-1000,
          width:parentBox?.width??selectionMenuWidth(innerWidth)}}>
        <h3>更多操作</h3><div className="popover-content">
          {groups.map(([label,key])=><button type="button" className="btn" key={label}
            data-expanded-submenu={['export','series','status'].includes(key)?'':undefined}
            aria-haspopup={['export','series','status'].includes(key)?'menu':undefined}
            aria-expanded={['export','series','status'].includes(key)?submenu===key:undefined}
            onClick={()=>{
              if(['export','series','status'].includes(key))setSubmenu(value=>value===key?'':key);
              else if(key==='edit-series')void execute('edit-series');
              else void execute(key);
            }}><span className="selection-action-label">{label}</span>
            {['export','series','status'].includes(key)?<span className="selection-action-chevron"> ›</span>:null}
          </button>)}
        </div>
      </section>
      {submenu?createPortal(<section ref={side} className="selection-submenu selection-side-panel"
        role="menu" aria-label={groups.find(([,key])=>key===submenu)?.[0]||submenu}
        style={{left:sideBox?.left??-1000,top:sideBox?.top??-1000,
          width:sideBox?.width??180,maxHeight:sideBox?.maxHeight??360}}>
        <div className="selection-side-heading">{groups.find(([,key])=>key===submenu)?.[0]}</div>
        {submenu==='series'?<div className="selection-side-pinned">{submenuChoices.slice(0,2).map(([label,action,value])=>
          labelButton(label,()=>runChoice(action,value),{key:label,className:'selection-submenu-pinned'}))}</div>:null}
        <div className="selection-side-list">{(submenu==='series'?submenuChoices.slice(2):submenuChoices)
          .map(([label,action,value])=>labelButton(label,()=>runChoice(action,value),{key:label}))}</div>
      </section>,document.body):null}
    </>,document.body):null}
    {newSeries?createPortal(<div className="cloud-admin-backdrop" onMouseDown={event=>{
      if(event.target===event.currentTarget)setNewSeries(false);}}>
      <section className="cloud-admin-panel" role="dialog" aria-modal="true" aria-label="新建系列">
        <h2>新建系列</h2><label>系列名称<input id="selection-new-series-name"
          ref={newSeriesInput}/></label>
        <div className="actions" id="selection-new-series-actions">
          <button type="button" className="btn" onClick={()=>setNewSeries(false)}>取消</button>
          <button type="button" className="btn primary" disabled={busy} onClick={async()=>{
            const name=newSeriesInput.current?.value.trim()||'';
            if(!name){onError?.(Error('请填写系列名称'));return;}
            await execute('assign-new-series',name);setNewSeries(false);
          }}>新建并加入</button>
        </div>
      </section></div>,document.body):null}
  </>;
}
