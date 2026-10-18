import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {AI_PROVIDERS,supportsVision} from './ai-settings.js';
import {seriesContentsModel} from './series-contents.js';
import {libraryPageData} from './library-page-data.js';
import {paperPresets} from './paper-sizes.js';
import {candidateDiscoveryOptions,recognitionOptions,recognitionPixelOptions,
  recognitionMethodDetails} from './recognition-profiles.js';
import {DELIVERY_OPTIONS} from './ai-delivery.js';
import {matchingViewModel} from './matching-view.js';
import {styleGroups,purposeGroups} from './matching-directions.js';
import {visualStyles} from './creative-style-brief.js';
import {FabricSceneStage} from './fabric-scene-stage.jsx';
import {FabricEditorToolbar,FabricHeaderMenu} from './fabric-editor-controls.jsx';
import {FabricCutPanel} from './fabric-cut-panel.jsx';
import {useFloatingPanel} from './use-floating-panel.js';
import {FabricPageViewport} from './fabric-page-viewport.jsx';
import {iconMarkup} from './icons.js';
import {cutPreviewPieceAt} from './scene-cut-hit.js';
import {fabricPointer} from './fabric-pointer.js';
import {selectableFabricObjectAt} from './fabric-hit-test.js';
import {SceneCover} from './scene-cover.jsx';
import {findSceneNode,sceneLayerEntries} from './scene-v2.js';
import {selectionGroupID} from './scene-selection-actions.js';
import {WORK_TABS,workInTab} from './work-collections.js';
import {catalogDataPage,catalogVisibleItems,pageSize,pageSlice,setCatalogDataPage} from './catalog-pagination.js';
import {searchableSeries} from './library-model.js';
import {selectionActive,toggleSelected} from './library-selection-model.js';
import {ReactFilterMenu} from './react-filter-menu.jsx';
import {presetJournalTemplates,templateIndexText} from './journal-template-catalog.js';
import {journalTemplateImageURL,saveJournalUserTemplate} from './journal-template-data.js';
import {journalTemplatePanel} from './journal-source-panels.js';
import {loadJournalPresetPanel} from './journal-preset-images.js';
import {ImportCandidateDialog} from './react-import-candidate-dialog.jsx';
import {SettingsDiagnosticsDialog} from './react-ai-diagnostics.jsx';
import {ReactSelectionTray} from './react-selection-tray.jsx';
import {ManualBoxEditor} from './react-manual-box-editor.jsx';
import {PaperCorrection} from './react-paper-correction.jsx';
import {OrganizationBadge} from './react-organization.jsx';
import {materialKinds,materialRoleName} from './material-taxonomy.js';
import {loadSeriesCoverSnapshot,seriesCoverSignature} from './series-cover-snapshot.js';

function RouteImage({asset,source,priority=false}){
  const src=asset&&(source(asset.blobId)||asset.staticPath);
  return src?<><img data-asset-image-id={asset.id} loading={priority?'eager':'lazy'}
    fetchPriority={priority?'high':undefined} decoding="async" src={src} alt={asset.title}/><OrganizationBadge id={asset.id}/></>:<span>无预览</span>;
}

function SeriesCover({series,assets,seriesCovers,source,priority,account}){
  const coverRef=useRef(null);
  const [snapshot,setSnapshot]=useState(null);
  const members=seriesCovers(series,assets);
  const key=JSON.stringify([account,series.id,seriesCoverSignature(series,assets),
    members.map(asset=>source(asset.blobId)||asset.staticPath||'')]);
  useEffect(()=>{
    const cover=coverRef.current;
    if(!cover)return;
    let cancelled=false;
    const start=()=>void loadSeriesCoverSnapshot({cover,series,assets,account})
      .then(url=>{if(!cancelled&&url)setSnapshot({key,url});})
      .catch(()=>{});
    if(priority||typeof IntersectionObserver!=='function')start();
    else{
      const observer=new IntersectionObserver(entries=>{
        if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();start();}
      },{rootMargin:'260px'});
      observer.observe(cover);
      return ()=>{cancelled=true;observer.disconnect();};
    }
    return ()=>{cancelled=true;};
  },[key]);
  return <div className="series-cover" ref={coverRef}>
    {members.map(asset=><RouteImage key={asset.id} asset={asset} source={source} priority={priority}/>)}
    {snapshot?.key===key?<img className="series-cover-snapshot" alt="" src={snapshot.url}
      loading={priority?'eager':'lazy'} decoding="async"/>:null}
  </div>;
}

function DetailLinkIcon({kind}){
  const lines=kind==='folder'?<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>
    :kind==='search'?<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>
    :<><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/><path d="m19 17 .5 1.5L21 19l-1.5.5L19 21l-.5-1.5L17 19l1.5-.5z"/></>;
  return <span className="detail-link-icon"><svg className="shiye-icon" viewBox="0 0 24 24"
    width="25" height="25" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{lines}</svg></span>;
}

function PressCard({onActivate,onHold,holdDisabled=false,children,...props}){
  const press=useRef({timer:null,start:null,consumed:false});
  useEffect(()=>()=>clearTimeout(press.current.timer),[]);
  const cancel=()=>{clearTimeout(press.current.timer);press.current.timer=null;};
  const fire=()=>{cancel();if(!press.current.start||press.current.consumed||holdDisabled)return;
    press.current.consumed=true;onHold?.();};
  return <button type="button" {...props}
    onPointerDown={event=>{cancel();press.current.start=null;press.current.consumed=false;
      if(holdDisabled||!onHold||event.button>0||event.isPrimary===false)return;
      press.current.start={x:event.clientX,y:event.clientY,id:event.pointerId,
        time:performance.now(),slop:event.pointerType==='touch'?28:12};
      press.current.timer=setTimeout(fire,450);
    }}
    onPointerMove={event=>{const start=press.current.start;
      if(start&&event.pointerId===start.id&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>start.slop){
        cancel();press.current.start=null;
      }
    }}
    onPointerUp={event=>{const start=press.current.start;
      if(start&&event.pointerId===start.id&&performance.now()-start.time>=450)fire();
      cancel();press.current.start=null;
    }}
    onPointerCancel={()=>{cancel();press.current.start=null;}}
    onPointerLeave={()=>{cancel();press.current.start=null;}}
    onContextMenu={event=>{if(holdDisabled||!onHold)return;event.preventDefault();
      cancel();press.current.start={};fire();}}
    onKeyDown={event=>{if(!holdDisabled&&onHold&&
      (event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')){
      event.preventDefault();onHold();}}}
    onClick={event=>{if(press.current.consumed){press.current.consumed=false;
      event.preventDefault();return;}onActivate?.(event);}}>{children}</button>;
}

function PageHeading({title,actions=null}){
  return <div className="view-head unified-page-heading"><div className="unified-heading-copy">
    <span className="eyebrow">FROM YOUR DESK TO YOUR PAGES</span><h1>{title}</h1>
  </div><div className="actions">{actions}</div></div>;
}

function SelectionToggle({mode,selection,onToggle}){
  const [,setRevision]=useState(0);
  useEffect(()=>{
    const refresh=()=>setRevision(revision=>revision+1);
    window.addEventListener('shiye-selection-refresh',refresh);
    return ()=>window.removeEventListener('shiye-selection-refresh',refresh);
  },[]);
  const active=Boolean(selection.selectionMode);
  return <button type="button" className="btn library-select-toggle"
    data-react-action="true" onClick={()=>flushSync(()=>onToggle(mode))}>
    {active?'完成':'选择'}</button>;
}

function CatalogTabs({tabs,active,onChange}){
  return <div className="swift-tabs">{tabs.map(([id,label])=><button type="button" key={id}
    className={id===active?'selected':''} onClick={()=>onChange(id)}>{label}</button>)}</div>;
}

const materialTabs=[['series','系列'],['all','全部素材'],['pending','待检测'],['trash','最近删除']];

export function RecentlyDeletedPage({kind,state,source,localCover,cloudEnabled,onTabChange,
  onTrashChange,onError,onCardsChanged}){
  const [choosing,setChoosing]=useState(false);
  const [selected,setSelected]=useState(()=>new Set());
  const [busy,setBusy]=useState(false);
  const [page,setPage]=useState(1);
  const records=state.trash.filter(entry=>entry.kind===kind)
    .sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  const limit=pageSize(state.preferences.maxPageItems);
  const range=pageSlice(records.length,limit,page);
  const visible=records.slice(range.start,range.end);
  const visibleCardKeys=visible.map(entry=>`${entry.id}:${entry.item?.updatedAt||''}`).join('|');
  useEffect(()=>{onCardsChanged?.();},[kind,visibleCardKeys]);
  const toggle=id=>setSelected(prior=>{
    const next=new Set(prior);
    next.has(id)?next.delete(id):next.add(id);
    return next;
  });
  const act=async(ids,recover)=>{
    if(busy||!ids.length)return;
    if(!recover&&!window.confirm(`彻底删除所选 ${ids.length} 项？素材记录会继续隐藏保留，以供已有作品使用。此操作不能撤销。`))return;
    setBusy(true);
    try{
      await onTrashChange(ids,recover);
      setSelected(new Set());
      setChoosing(false);
    }catch(error){onError?.(error);
    }finally{setBusy(false);}
  };
  const title=kind==='asset'?'我的素材':'我的作品';
  const tabs=kind==='asset'?materialTabs:WORK_TABS;
  return <><div className="catalog-toolbar"><PageHeading title={title} actions={
    <button type="button" className="btn library-select-toggle" data-trash-select=""
      onClick={()=>{setChoosing(value=>!value);setSelected(new Set());}}>
      {choosing?'完成':'选择'}
    </button>}/>
    <CatalogTabs tabs={tabs} active="trash" onChange={onTabChange}/>
    <div className="filters deleted-toolbar"><div className="four-filter-controls">
      <div className="catalog-page-summary">{limit?<div className="catalog-page-controls" data-page-key={`trash:${kind}`}>
        <input type="number" min="1" max={range.count} aria-label="输入页码"
          key={range.current} defaultValue={range.current}
          onChange={event=>setPage(Number(event.currentTarget.value))}/>
        <button type="button" aria-label="上一页" disabled={range.current===1}
          onClick={()=>setPage(range.current-1)}>‹</button>
        <button type="button" aria-label="下一页" disabled={range.current===range.count}
          onClick={()=>setPage(range.current+1)}>›</button>
      </div>:null}
      <span className="catalog-total">{records.length} 项</span></div>
    </div></div></div>
    <section className={`grid recently-deleted-grid ${choosing?'selecting':''}`}
      data-kind={kind} aria-label="最近删除">
      {visible.length?visible.map(entry=>{
        const record=entry.item;
        const draft=record.drafts?.find(item=>item.id===record.activeDraftID)||record.drafts?.[0];
        const staticCover=record.coverStaticPath&&record.updatedAt===record.coverBaselineUpdatedAt
          ?record.coverStaticPath:null;
        const src=record.isSnapshot?source(record.snapshotBlobId):staticCover;
        return <article key={entry.id} className={`card deleted-row ${choosing&&selected.has(entry.id)?'batch-selected':''}`}
          data-trash-id={entry.id} aria-label={`${record.title}，${new Date(entry.date).toLocaleDateString()} 删除`}
          aria-selected={choosing&&selected.has(entry.id)}
          onClick={()=>{if(choosing)toggle(entry.id);}}>
          <div className="card-image" data-cover-project-id={kind==='project'?record.id:undefined}>
            {kind==='asset'?<RouteImage asset={record} source={source}/>:<div className="thumb-sheet"
              style={{aspectRatio:draft?`${draft.canvas.width}/${draft.canvas.height}`:undefined,
                background:draft?.paperColor||'#fff'}}>
              {src?<img className="work-reference" src={src} alt={record.title}/>:<SceneCover
                draft={draft} asset={id=>state.assets.find(item=>item.id===id)} source={source}
                snapshotOnly cloudEnabled={cloudEnabled} localCover={()=>localCover?.(record)}
                projectID={record.id}/>}
            </div>}
            {choosing?<span className="batch-check">{selected.has(entry.id)?'☑':'□'}</span>:null}
          </div>
          <div className="card-body"><h3>{record.title}</h3>
            <p>{new Date(entry.date).toLocaleDateString()} 删除</p>
            <div className="deleted-actions"><button type="button" className="btn"
              data-recover={entry.id} disabled={busy} onClick={event=>{event.stopPropagation();void act([entry.id],true);}}>恢复</button>
              <button type="button" className="btn danger" data-remove={entry.id}
                disabled={busy} onClick={event=>{event.stopPropagation();void act([entry.id],false);}}>彻底删除</button></div>
          </div>
        </article>;
      }):<p className="empty">没有最近删除的{kind==='asset'?'素材':'作品'}。</p>}
    </section>
    <p className="deleted-retention-note">最近删除保留 30 天，到期自动移除恢复入口；从素材库删除的素材继续隐藏保留，已有作品仍可使用。云端孤立文件经隔离备份与复核后延迟回收。</p>
    <div className="swift-tray manage library-management-tray deleted-selection-tray"
      hidden={!choosing}><strong>已选 {selected.size} 项</strong>
      <button type="button" className="btn" data-trash-all disabled={busy}
        onClick={()=>setSelected(new Set(visible.map(entry=>entry.id)))}><span className="selection-action-label">全选页面</span></button>
      <button type="button" className="btn" data-trash-clear disabled={busy||!selected.size}
        onClick={()=>setSelected(new Set())}><span className="selection-action-label">清空选择</span></button>
      <button type="button" className="btn" data-trash-recover disabled={busy||!selected.size}
        onClick={()=>void act([...selected],true)}><span className="selection-action-label">恢复所选</span></button>
      <button type="button" className="btn danger" data-trash-remove disabled={busy||!selected.size}
        onClick={()=>void act([...selected],false)}><span className="selection-action-label">彻底删除所选</span></button>
    </div>
  </>;
}

const splitTemplateTags=value=>[...new Set(String(value||'').split(/[,，、\n]/)
  .map(part=>part.trim()).filter(Boolean))];

function JournalTemplateVisual({item,side='template',db,accountId,detail=false}){
  const host=useRef(null);
  const [visible,setVisible]=useState(detail);
  const [attempt,setAttempt]=useState(0);
  const [url,setURL]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(detail){setVisible(true);return;}
    if(typeof IntersectionObserver!=='function'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}
    },{rootMargin:'300px'});
    if(host.current)observer.observe(host.current);
    return ()=>observer.disconnect();
  },[detail,item.id,side]);
  useEffect(()=>{
    if(!visible)return;
    let active=true;
    const id=side==='case'?item.exampleBlobId:item.templateBlobId;
    const panel=journalTemplatePanel(item,side);
    if(!id&&!panel){setError('图片暂不可用');return;}
    setURL('');setError('');
    void (id?journalTemplateImageURL(db,accountId,id,detail?null:480):
      loadJournalPresetPanel(panel,{accountId,edge:detail?null:480}))
      .then(result=>{if(!result)throw Error('图片暂不可用');if(active)setURL(result);})
      .catch(issue=>{if(active)setError(issue.message||'图片暂不可用');});
    return ()=>{active=false;};
  },[visible,attempt,item.id,side,db,accountId,detail]);
  return <div ref={host} className={detail?'journal-template-detail-image':'card-image'}>
    {url?<img src={url} alt={`${item.title}${side==='case'?' 真实案例':' 抽象模板'}`}/>:error?
      <div className="journal-template-fallback"><strong>{item.title}</strong>
        <p>{item.structure}</p><small>{error}{detail?' · 可重试':' · 点击查看结构'}</small>
        {detail?<button type="button" className="btn mini"
          onClick={()=>setAttempt(value=>value+1)}>重新载入图片</button>:null}</div>:
      item.templateBlobId||side==='case'?<span className="journal-template-loading">
        {side==='case'?'载入对应案例…':'载入模板…'}</span>:
        <div className="journal-template-outline">{item.title}</div>}
  </div>;
}

function JournalTemplateImport({db,onClose,onSaved,onError}){
  const [busy,setBusy]=useState(false);
  const closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    const modal=document.querySelector('#modal');
    const close=()=>closeRef.current();
    modal?.addEventListener('close',close);
    if(modal&&!modal.open)modal.showModal();
    return ()=>{modal?.removeEventListener('close',close);if(modal?.open)modal.close();};
  },[]);
  const host=document.querySelector('#modal-body');
  if(!host)return null;
  const save=async event=>{
    event.preventDefault();
    if(busy)return;
    setBusy(true);
    try{
      const form=new FormData(event.currentTarget);
      const record=await saveJournalUserTemplate(db,{
        title:String(form.get('title')||''),structure:String(form.get('structure')||''),
        tags:splitTemplateTags(form.get('tags')),
        styles:splitTemplateTags(form.get('styles')),
        purposes:splitTemplateTags(form.get('purposes'))
      },{templateImage:form.get('templateImage'),caseImage:form.get('caseImage')?.size?
        form.get('caseImage'):null});
      onSaved(record);
      onClose();
    }catch(error){onError(error);}finally{setBusy(false);}
  };
  return createPortal(<><div className="dialog-head"><h2>导入模板与案例</h2>
      <button type="button" className="btn" data-template-import-back onClick={onClose}>返回模板</button></div>
    <form className="stack journal-template-import" onSubmit={save}>
      <label>模板名称<input name="title" maxLength="80" required placeholder="例如：双列时间轴"/></label>
      <label>结构说明<textarea name="structure" required placeholder="简述主图、文字、装饰与阅读顺序"/></label>
      <label>检索标签（逗号分隔）<input name="tags" required placeholder="例如：时间轴、密集拼贴"/></label>
      <label>适用风格（逗号分隔）<input name="styles" placeholder="例如：复古旧物"/></label>
      <label>适用用途（逗号分隔）<input name="purposes" placeholder="例如：日常记录"/></label>
      <label>抽象模板图片<input name="templateImage" type="file" accept="image/png,image/jpeg,image/webp" required/></label>
      <label>对应真实案例图片（可选）<input name="caseImage" type="file" accept="image/png,image/jpeg,image/webp"/></label>
      <p>两张图片仅存于当前账号的私有存储，不会作为可使用素材或作品。</p>
      <button type="submit" className="btn primary" data-template-save disabled={busy}>
        {busy?'正在保存…':'保存模板'}</button>
    </form></>,host);
}

export function JournalTemplatesPage({state,db,viewState,onTabChange,onToast}){
  const [filters,setFilters]=useState(viewState.templateFilters||
    {query:'',type:'all',status:'all',sort:'default-asc'});
  const [selectedID,setSelectedID]=useState(viewState.templateID||null);
  const [side,setSide]=useState(viewState.templateSide||'template');
  const [importOpen,setImportOpen]=useState(false);
  const [menu,setMenu]=useState(null);
  const [,forceRefresh]=useState(0);
  const accountID=state.accountId;
  const catalog=[...presetJournalTemplates(),...(state.userTemplates||[])];
  const selected=catalog.find(item=>item.id===selectedID);
  const change=next=>{
    const value={...filters,...next};setFilters(value);viewState.templateFilters=value;
    setSelectedID(null);viewState.templateID=null;
  };
  const choose=item=>{setSelectedID(item.id);viewState.templateID=item.id;
    setSide('template');viewState.templateSide='template';};
  const found=catalog.filter(item=>{
    const query=filters.query.trim().toLocaleLowerCase();
    const typeOK=filters.type==='all'||filters.type==='preset'&&item.origin==='preset'||
      filters.type==='user'&&item.origin!=='preset';
    const hasCase=!!(item.exampleBlobId||item.exampleSourceNumbers?.length);
    const statusOK=filters.status==='all'||filters.status==='with-case'&&hasCase||
      filters.status==='without-case'&&!hasCase;
    return typeOK&&statusOK&&(!query||templateIndexText(item).includes(query));
  }).sort((a,b)=>{
    const direction=filters.sort.endsWith('asc')?1:-1;
    return direction*(filters.sort.startsWith('name')?
      a.title.localeCompare(b.title,'zh-CN'):catalog.indexOf(a)-catalog.indexOf(b));
  });
  const basis=filters.sort.startsWith('name')?'name':'default';
  const order=filters.sort.endsWith('asc')?'asc':'desc';
  const controls=[
    ['类型','▦',filters.type,[['all','全部类型'],['preset','预设模板'],['user','我的模板']],
      value=>change({type:value})],
    ['状态','☷',filters.status,[['all','全部状态'],['with-case','有对应案例'],
      ['without-case','暂无案例']],value=>change({status:value})],
    ['排序依据','≡',basis,[['default','默认顺序'],['name','名称']],
      value=>change({sort:value+'-'+order})],
    ['排序顺序',order==='asc'?'↑':'↓',order,[['desc','降序'],['asc','升序']],
      value=>change({sort:basis+'-'+value})]
  ];
  const available=selected&&!!(selected.exampleBlobId||selected.exampleSourceNumbers?.length);
  const showCase=side==='case'&&available;
  return <div className="works-page"><div className="catalog-toolbar">
    <PageHeading title="我的作品"/>
    <CatalogTabs tabs={WORK_TABS} active="templates" onChange={onTabChange}/>
    <div className="filters journal-template-filters" data-template-filters="true">
      <input type="search" id="work-search" placeholder="搜索模板名称或标签"
        aria-label="搜索模板" value={filters.query}
        onChange={event=>change({query:event.currentTarget.value})}/>
      <div className="four-filter-controls">{controls.map(([heading,glyph,value,options,update])=>{
        const label=options.find(([id])=>id===value)?.[1]||'';
        const longest=options.map(([,text])=>text).sort((a,b)=>b.length-a.length)[0]||'';
        return <button type="button" key={heading} className="filter-control"
          data-filter-heading={heading} title={`${heading}：${label}`}
          aria-label={`${heading}：${label}${heading==='排序顺序'?'，点击切换':''}`}
          aria-haspopup={heading==='排序顺序'?undefined:'menu'}
          onClick={event=>{
            if(heading==='排序顺序'){update(value==='asc'?'desc':'asc');return;}
            const bounds=event.currentTarget.getBoundingClientRect();
            setMenu(menu?.heading===heading?null:{heading,left:Math.max(8,
              Math.min(bounds.left,window.innerWidth-258)),top:bounds.bottom+6,options,update});
          }}><i aria-hidden="true">{glyph}</i><span>{label}</span>
          <span className="filter-width-reserve" aria-hidden="true">{longest}</span>
        </button>;
      })}</div>
      <span className="catalog-total">{selected?`${catalog.length} 个模板`:
        `${found.length} / ${catalog.length} 个模板`}</span>
    </div></div>
    <div className={`grid works-grid journal-template-grid ${selected?'journal-template-detail':''}`}>
      {selected?<article className="journal-template-detail-card"><div className="journal-template-detail-head">
        <button type="button" className="btn" data-template-back onClick={()=>{
          setSelectedID(null);viewState.templateID=null;
        }}>← 返回模板</button><h2>{selected.title}</h2></div>
        <div className="journal-template-switch">
          <button type="button" className={`btn ${showCase?'':'primary'}`}
            data-template-side="template" onClick={()=>{setSide('template');viewState.templateSide='template';}}>
            抽象模板</button>
          <button type="button" className={`btn ${showCase?'primary':''}`}
            data-template-side="case" disabled={!available}
            onClick={()=>{setSide('case');viewState.templateSide='case';}}>真实案例</button>
        </div><JournalTemplateVisual key={`${selected.id}:${side}`} item={selected}
          side={showCase?'case':'template'} db={db} accountId={state.accountId} detail/>
        <p>{selected.structure}</p><div className="journal-template-tags">
          {(selected.tags||[]).map(tag=><span className="chip" key={tag}>{tag}</span>)}
        </div></article>:<><button type="button" className="card work-entry journal-template-import-card"
          data-template-import onClick={()=>setImportOpen(true)}><div className="card-image">＋</div>
          <div className="card-body"><h3>导入模板与案例</h3><p>添加自己的模板图片</p></div>
        </button>
        {found.length?found.map(item=><button type="button" key={item.id}
          className="card journal-template-card" data-template-id={item.id}
          onClick={()=>choose(item)}>
          <JournalTemplateVisual item={item} db={db} accountId={state.accountId}/>
          <div className="card-body"><h3>{item.title}</h3>
            <p>{item.origin==='preset'?'预设模板':'我的模板'}{' · '}
              {item.exampleBlobId||item.exampleSourceNumbers?.length?'有对应案例':'暂无案例'}</p>
            <div className="journal-template-tags">{item.tags.slice(0,3).map(tag=><span
              className="chip" key={tag}>{tag}</span>)}</div></div>
        </button>):<p className="empty">没有匹配的模板，试试其他标签。</p>}</>}
    </div>
    {menu?createPortal(<div className="swift-popover library-filter-menu" role="menu"
      style={{position:'fixed',left:menu.left,top:menu.top,zIndex:70}}>
      {menu.options.map(([value,label])=><button type="button" key={value}
        role="menuitemradio" aria-checked={String(filters[menu.heading==='类型'?'type':
          menu.heading==='状态'?'status':'sort']===value)}
        onClick={()=>{menu.update(value);setMenu(null);}}>{label}</button>)}
    </div>,document.body):null}
    {importOpen?<JournalTemplateImport db={db} onClose={()=>setImportOpen(false)}
      onSaved={record=>{if(state.accountId!==accountID)return;
        state.userTemplates=[...(state.userTemplates||[]),record];
        forceRefresh(value=>value+1);choose(record);
        onToast('模板已在本机暂存，正在后台同步');}}
      onError={error=>onToast(error.message)}/>:null}
  </div>;
}

function PaperSizeOptions({includeNone=false,includeCustom=true}){
  const groups=[...new Set(paperPresets.map(preset=>preset.group))];
  return <>{includeNone?<option value="none">无背景板</option>:null}
    {groups.map(group=><optgroup key={group} label={group}>{paperPresets.filter(preset=>preset.group===group)
      .map(preset=><option key={preset.id} value={preset.id}>
        {preset.name} · {preset.width} × {preset.height} mm
      </option>)}</optgroup>)}
    {includeCustom?<option value="custom">自定义尺寸</option>:null}</>;
}

export function LibraryPage({state,source,kindName,format,onAction,onPageChange,tab,onTabChange,
  selection,onSelectionToggle,onFilter,onBatchAction,onBatchError,onEditAsset}){
  const [,setRevision]=useState(0);
  const [query,setQuery]=useState(state.query||'');
  useEffect(()=>{
    const refresh=()=>setRevision(revision=>revision+1);
    window.addEventListener('shiye-library-refresh',refresh);
    window.addEventListener('shiye-selection-refresh',refresh);
    return ()=>{window.removeEventListener('shiye-library-refresh',refresh);
      window.removeEventListener('shiye-selection-refresh',refresh);};
  },[]);
  const selectedOnly=selectionActive(selection,'asset')&&selection.showOnlySelected;
  const page=selectedOnly?catalogVisibleItems('library:selected',state.assets.filter(asset=>
    selection.selected.has(asset.id)&&!asset.isProjectInternal),state.preferences.maxPageItems):libraryPageData(state);
  const items=page.items,pageKey=selectedOnly?'library:selected':'library';
  const selecting=selectionActive(selection,'asset');
  const addingSeries=state.addingToSeries?
    state.series.find(entry=>entry.id===state.addingToSeries):null;
  const choosing=!!addingSeries;
  const changePage=value=>{
    setCatalogDataPage(pageKey,value);
    setRevision(revision=>revision+1);
    onPageChange?.();
  };
  const kinds=materialKinds.map(([id])=>id);
  const status=[['all','全部状态'],['ready','已整理'],['pendingReview','未整理'],['used','已使用'],
    ['unused','未使用'],['inside','系列中'],['outside','系列外'],['favorite','已收藏']];
  const sorts=[['newest','添加时间 · 降序'],['oldest','添加时间 · 升序'],
    ['name','名称 · 升序'],['name-desc','名称 · 降序']];
  const sortBasis=state.sort.startsWith('name')?'name':'time';
  const sortOrder=['name','oldest'].includes(state.sort)?'asc':'desc';
  const change=(key,value)=>{setCatalogDataPage('library',1);void onFilter(key,value);};
  const changeSort=(basis,order)=>change('sort',basis==='name'?
    order==='asc'?'name':'name-desc':order==='asc'?'oldest':'newest');
  return <><div className="catalog-toolbar"><PageHeading
    title={addingSeries?`为「${addingSeries.title}」添加素材`:'我的素材'} actions={addingSeries?
    <button type="button" className="btn" onClick={()=>onAction('series-add-cancel')}>取消</button>:
    <SelectionToggle mode="asset" selection={selection} onToggle={onSelectionToggle}/>}/>
    {state.seriesID==='all'?<CatalogTabs tabs={materialTabs} active={tab} onChange={onTabChange}/>:null}
    <div className="filters">
      <input id="search" type="search" placeholder="搜索名称、标签、颜色或主题"
        value={query} onChange={event=>{setQuery(event.target.value);change('query',event.target.value);}}
        aria-label="搜索素材"/>
      <select id="kind-filter" hidden value={state.kind} onChange={event=>change('kind',event.target.value)}><option value="all">全部类型</option>
        {kinds.map(kind=><option key={kind} value={kind}>{kindName(kind)}</option>)}</select>
      <select id="status-filter" hidden value={state.status} onChange={event=>change('status',event.target.value)}>{status.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <select id="series-filter" hidden value={state.seriesID} onChange={event=>change('seriesID',event.target.value)}><option value="all">全部系列</option><option value="none">系列外</option>
        {state.series.map(entry=><option key={entry.id} value={entry.id}>{entry.title}</option>)}</select>
      <select id="sort-filter" hidden value={state.sort} onChange={event=>change('sort',event.target.value)}>{sorts.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <select id="sort-basis" hidden value={sortBasis} onChange={event=>changeSort(event.target.value,sortOrder)}><option value="time">最近添加</option><option value="name">名称</option></select>
      <select id="sort-order" hidden value={sortOrder} onChange={event=>changeSort(sortBasis,event.target.value)}><option value="desc">降序</option><option value="asc">升序</option></select>
      <div className="four-filter-controls">
        <ReactFilterMenu heading="类型" glyph="▦" options={[["all","全部类型"],...kinds.map(kind=>[kind,kindName(kind)])]}
          value={state.kind} onChange={value=>change('kind',value)}/>
        <ReactFilterMenu heading="状态" glyph="☷" options={status} value={state.status}
          onChange={value=>change('status',value)}/>
        <ReactFilterMenu heading="排序依据" glyph="≡" options={[["time","最近添加"],["name","名称"]]}
          value={sortBasis} onChange={value=>changeSort(value,sortOrder)}/>
        <ReactFilterMenu heading="排序顺序" glyph="↕" toggle
          options={[["desc","降序"],["asc","升序"]]} value={sortOrder}
          onChange={value=>changeSort(sortBasis,value)}/>
      <div className="catalog-page-summary"><div className="catalog-page-controls" data-page-key={pageKey}>
        <input type="number" min="1" max={page.count} aria-label="输入页码"
          key={page.current} defaultValue={page.current}
          onChange={event=>changePage(Number(event.currentTarget.value))}/>
        <button type="button" aria-label="上一页" disabled={page.current===1}
          onClick={()=>changePage(page.current-1)}>‹</button>
        <button type="button" aria-label="下一页" disabled={page.current===page.count}
          onClick={()=>changePage(page.current+1)}>›</button>
      </div><span className="library-count catalog-total">{page.total} 项</span></div></div>
    </div></div>
    <div className={`grid asset-grid ${selection.showOnlySelected&&selecting?'selection-results':''} ${state.preferences.display==='list'?'list-grid':''}`}>
      {!(selecting&&selection.showOnlySelected)?<button className="card action-card" data-act="import" data-react-action="true"
        disabled={selecting} hidden={state.seriesID!=='all'||state.status!=='all'||state.kind!=='all'||!!state.query.trim()}
        onClick={()=>onAction('import')}>
        <div className="card-image">＋</div><div className="card-body"><h3>导入素材</h3><p>添加照片或文件</p></div>
      </button>:null}
      {items.map(asset=>{
        const revision=JSON.stringify([asset.title,asset.kind,asset.physicalWidthMM,asset.physicalHeightMM,
          asset.reviewStatus,asset.isFavorite,asset.blobId]);
        return <PressCard key={asset.id} className={`card ${selecting&&selection.selected.has(asset.id)?'batch-selected':''}`}
          data-card-revision={revision} data-act="detail"
          data-id={asset.id} data-react-action="true" aria-pressed={selecting?selection.selected.has(asset.id):undefined}
          holdDisabled={selecting} onHold={()=>onEditAsset?.(asset.id)}
          onActivate={()=>{if(selecting){toggleSelected(selection,asset.id);
            window.dispatchEvent(new Event('shiye-selection-refresh'));}
            else onAction('detail',asset.id);}}>
          <div className="card-image"><RouteImage asset={asset} source={source}/>
            {selecting?<span className="batch-check">{selection.selected.has(asset.id)?'☑':'□'}</span>:null}</div>
          <div className="card-body"><h3 className={state.basket.includes(asset.id)?'in-matching-basket':''}>{asset.title}
            {state.basket.includes(asset.id)?<span className="basket-card-check" aria-label="已加入搭配素材篮">✓</span>:null}{asset.isFavorite?<span className="card-favorite" aria-label="已收藏">♥</span>:null}</h3>
            <p>{kindName(asset.kind)} · {asset.physicalWidthMM?`${format(asset.physicalWidthMM)} × ${format(asset.physicalHeightMM)} mm`:'尺寸待确认'}</p>
            <span className={`chip ${asset.reviewStatus==='ready'?'':'warn'}`}>{asset.reviewStatus==='ready'?'已整理':'待检查'}</span>
          </div>
        </PressCard>;
      })}
    </div>
    {!addingSeries?<ReactSelectionTray selection={selection} mode="asset"
      visibleIDs={items.map(asset=>asset.id)} series={state.series}
      onAction={onBatchAction} onError={onBatchError}/>:null}
    {addingSeries?<div className="swift-tray manage" data-selection-mode="series-add">
      <strong>本次选中 {selection.selected.size} 件</strong>
      <button type="button" className="btn" onClick={()=>{
        for(const item of items)selection.selected.add(item.id);setRevision(value=>value+1);
      }}>全选当前结果</button>
      <button type="button" className="btn" onClick={()=>{
        selection.selected.clear();setRevision(value=>value+1);
      }}>清空选择</button>
      <button type="button" className="btn primary" disabled={!selection.selected.size}
        onClick={()=>onAction('series-add-confirm')}>加入系列并返回</button>
    </div>:null}
  </>;
}

export function WorksPage({state,projects:initialProjects,isUntouchedLegacyExample,assets:initialAssets,localCover,cloudEnabled,source,onAction,onCardsChanged,tab,onTabChange,
  selection,onSelectionToggle,viewState,configuredPageSize,onBatchAction,onBatchError,onEditWork}){
  const [revision,setRevision]=useState(0);
  const projects=state?.projects||initialProjects,assets=state?.assets||initialAssets;
  const [filters,setFilters]=useState(viewState.workFilters||{
    query:'',kind:'all',status:'all',sort:'access-desc'
  });
  useEffect(()=>{
    const refresh=()=>setRevision(value=>value+1);
    window.addEventListener('shiye-works-refresh',refresh);
    window.addEventListener('shiye-selection-refresh',refresh);
    return ()=>{
      window.removeEventListener('shiye-works-refresh',refresh);
      window.removeEventListener('shiye-selection-refresh',refresh);
    };
  },[]);
  const asset=id=>assets.find(entry=>entry.id===id);
  const list=projects.filter(project=>!isUntouchedLegacyExample(project)&&workInTab(project,tab))
    .filter(project=>{
      if(selection.selectionMode==='work'&&selection.showOnlySelected&&!selection.selected.has(project.id))return false;
      const query=filters.query.trim().toLocaleLowerCase();
      if(query&&!`${project.title} ${(project.styleTags||project.tags||[]).join(' ')}`.toLocaleLowerCase().includes(query))return false;
      if(filters.kind!=='all'&&(filters.kind==='created'?(project.source==='imported'):(project.source!=='imported')))return false;
      if(filters.status==='favorite')return project.isSnapshot&&!!project.isFavorite;
      if(filters.status==='used')return !!project.isUsed;
      if(filters.status==='unused')return !project.isUsed;
      return true;
    }).sort((a,b)=>{
      const key=filters.sort.startsWith('name')?'title':filters.sort.startsWith('updated')?'updatedAt':'lastOpenedAt';
      const value=key==='title'?a.title.localeCompare(b.title,'zh-CN'):
        Date.parse(a[key]||a.updatedAt)-Date.parse(b[key]||b.updatedAt);
      return filters.sort.endsWith('-asc')?value:-value;
    });
  const page=catalogDataPage('works',list.length,configuredPageSize);
  const visible=list.slice(page.start,page.end);
  const visibleCardKeys=visible.map(project=>project.id).join('\u0000');
  useEffect(()=>{onCardsChanged?.();},[revision,visibleCardKeys,tab]);
  const sortBasis=filters.sort.split('-')[0],sortOrder=filters.sort.split('-')[1];
  const change=(key,value)=>{
    const next={...filters,[key]:value};viewState.workFilters=next;setFilters(next);
    setCatalogDataPage('works',1);
  };
  const sorts=[['access-desc','最近访问 · 降序'],['access-asc','最近访问 · 升序'],
    ['updated-desc','最近修改 · 降序'],['updated-asc','最近修改 · 升序'],
    ['name-asc','名称 · 升序'],['name-desc','名称 · 降序']];
  return <div className="works-page"><div className="catalog-toolbar"><PageHeading title="我的作品" actions={
    <SelectionToggle mode="work" selection={selection} onToggle={onSelectionToggle}/>}/>
    <CatalogTabs tabs={WORK_TABS} active={tab} onChange={onTabChange}/>
    <button hidden data-act="new-project" data-react-action="true" id="work-create" onClick={()=>onAction('new-project')}/>
    <button hidden data-act="import-work" data-react-action="true" id="work-import" onClick={()=>onAction('import-work')}/>
    <div className="filters"><input type="search" id="work-search" value={filters.query}
      onChange={event=>change('query',event.target.value)}
      placeholder={tab==='templates'?'搜索模板名称或标签':'搜索作品名称或标签'}/>
      <select id="work-kind" hidden value={filters.kind} onChange={event=>change('kind',event.target.value)}>{tab==='templates'?<>
        <option value="all">全部类型</option><option value="preset">预设模板</option>
        <option value="user">我的模板</option></>:<>
        <option value="all">全部类型</option><option value="created">手动创作</option>
        <option value="imported">导入作品</option></>}</select>
      <select id="work-status" hidden value={filters.status} onChange={event=>change('status',event.target.value)}>{tab==='templates'?<>
        <option value="all">全部状态</option><option value="with-case">有对应案例</option>
        <option value="without-case">暂无案例</option></>:<>
        <option value="all">全部状态</option><option value="used">已使用</option>
        <option value="unused">未使用</option><option value="favorite">已收藏</option></>}</select>
      <select id="work-sort" hidden value={filters.sort} onChange={event=>change('sort',event.target.value)}>{(tab==='templates'?[['default-desc','默认顺序 · 降序'],
        ['default-asc','默认顺序 · 升序'],['name-asc','名称 · 升序'],
        ['name-desc','名称 · 降序']]:sorts).map(([value,label])=><option key={value}
          value={value}>{label}</option>)}</select>
      <select id="work-sort-basis" hidden value={sortBasis} onChange={event=>change('sort',event.target.value+'-'+sortOrder)}>
        <option value="access">最近访问</option><option value="updated">最近修改</option><option value="name">名称</option></select>
      <select id="work-sort-order" hidden value={sortOrder} onChange={event=>change('sort',sortBasis+'-'+event.target.value)}>
        <option value="desc">降序</option><option value="asc">升序</option></select>
      <div className="four-filter-controls">
        <ReactFilterMenu heading="类型" glyph="▦" value={filters.kind}
          options={[["all","全部类型"],["created","手动创作"],["imported","导入作品"]]}
          onChange={value=>change('kind',value)}/>
        <ReactFilterMenu heading="状态" glyph="☷" value={filters.status}
          options={[["all","全部状态"],["used","已使用"],["unused","未使用"],["favorite","已收藏"]]}
          onChange={value=>change('status',value)}/>
        <ReactFilterMenu heading="排序依据" glyph="≡" value={sortBasis}
          options={[["access","最近访问"],["updated","最近修改"],["name","名称"]]}
          onChange={value=>change('sort',value+'-'+sortOrder)}/>
        <ReactFilterMenu heading="排序顺序" glyph="↕" toggle value={sortOrder}
          options={[["desc","降序"],["asc","升序"]]}
          onChange={value=>change('sort',sortBasis+'-'+value)}/>
        <div className="catalog-page-summary">{pageSize(configuredPageSize)?<div className="catalog-page-controls" data-page-key="works">
          <input type="number" min="1" max={page.count} key={page.current}
            aria-label="输入页码" defaultValue={page.current}
            onChange={event=>{setCatalogDataPage('works',Number(event.target.value));setRevision(value=>value+1);}}/>
          <button type="button" aria-label="上一页" disabled={page.current===1}
            onClick={()=>{setCatalogDataPage('works',page.current-1);setRevision(value=>value+1);}}>‹</button>
          <button type="button" aria-label="下一页" disabled={page.current===page.count}
            onClick={()=>{setCatalogDataPage('works',page.current+1);setRevision(value=>value+1);}}>›</button>
        </div>:null}
        <span className="catalog-total">{list.length} 项</span></div>
      </div></div></div><div className="grid works-grid">
      {tab==='all'||tab==='snapshot'?<>
        {tab==='all'?<><button type="button" className="card work-entry" disabled={selectionActive(selection,'work')}
          onClick={()=>onAction('import-work')}>
          <div className="card-image">＋</div><div className="card-body"><h3>导入作品</h3><p>从照片或文件收进作品</p></div>
        </button><button type="button" className="card work-entry" disabled={selectionActive(selection,'work')}
          onClick={()=>onAction('new-project')}>
          <div className="card-image">＋</div><div className="card-body"><h3>空白创作</h3><p>从一张空白页面开始</p></div>
        </button></>:<button type="button" className="card work-entry" disabled={selectionActive(selection,'work')}
          onClick={()=>onAction('import-snapshot')}>
          <div className="card-image">＋</div><div className="card-body"><h3>导入画面快照</h3><p>保存独立、不可编辑的图片</p></div>
        </button>}
      </>:null}
      {tab!=='templates'&&visible.map((project,index)=>{
        const draft=project.drafts.find(d=>d.id===project.activeDraftID)||project.drafts[0];
        const revision=JSON.stringify([project.title,project.updatedAt,project.lastOpenedAt,
          project.isSnapshot,project.isDraft,project.isUsed,project.isFavorite,
          project.coverStaticPath,project.coverBaselineUpdatedAt,project.snapshotBlobId,project.activeDraftID]);
        const staticCover=project.isSnapshot?source(project.snapshotBlobId):
          project.coverStaticPath&&project.updatedAt===project.coverBaselineUpdatedAt?project.coverStaticPath:null;
        const choosing=selectionActive(selection,'work');
        return <PressCard key={project.id} className={`card ${choosing&&selection.selected.has(project.id)?'batch-selected':''}`}
          data-work-revision={revision} aria-pressed={choosing?selection.selected.has(project.id):undefined}
          data-act="open-project" data-id={project.id} data-react-action="true"
          holdDisabled={choosing} onHold={()=>onEditWork?.(project.id)}
          onActivate={()=>{
            if(choosing){toggleSelected(selection,project.id);
              window.dispatchEvent(new Event('shiye-selection-refresh'));}
            else onAction('open-project',project.id);
          }}>
          <div className="card-image"><div className="thumb-sheet" style={{width:'75%',background:project.drafts[0]?.paperColor||'#fff'}}>
            {staticCover?<img className="work-reference" loading={index<4?'eager':'lazy'} decoding="async"
              src={staticCover} alt={`${project.title} ${project.isSnapshot?'快照':'完整预览'}`}/>:null}
            {!staticCover?<SceneCover draft={draft} asset={asset} source={source} priority={index<4}
              snapshotOnly cloudEnabled={cloudEnabled} localCover={()=>localCover(project)}
              projectID={project.id}/>:null}
          </div></div><div className="card-body"><h3>{project.title}{project.isSnapshot&&project.isFavorite?<span className="card-favorite" aria-label="已收藏">♥</span>:null}</h3><p>⊙　{project.isSnapshot?'画面快照':project.isDraft?'草稿':'可编辑作品'} <span>{new Date(project.updatedAt).toLocaleDateString()}</span></p></div>
        </PressCard>;
      })}
    </div><ReactSelectionTray selection={selection} mode="work" projects={projects}
      workTab={tab} visibleIDs={visible.map(project=>project.id)}
      onAction={onBatchAction} onError={onBatchError}/>
  </div>;
}

export function SeriesPage({series,assets,display,seriesCovers,source,account,onAction,onTabChange,
  selection,onSelectionToggle,pageSize:configuredPageSize,onBatchAction,onBatchError,onEditSeries}){
  const [query,setQuery]=useState(selection.seriesQuery||'');
  const [seriesMenuID,setSeriesMenuID]=useState(null);
  const [sort,setSort]=useState(selection.seriesSort||'recent');
  const [ascending,setAscending]=useState(Boolean(selection.seriesAscending));
  const [,setRevision]=useState(0);
  useEffect(()=>{
    const refresh=()=>setRevision(value=>value+1);
    window.addEventListener('shiye-selection-refresh',refresh);
    return ()=>window.removeEventListener('shiye-selection-refresh',refresh);
  },[]);
  const active=selectionActive(selection,'series');
  const needle=query.trim().toLocaleLowerCase();
  const filtered=series.filter(entry=>active&&selection.showOnlySelected?
    selection.selected.has(entry.id):!needle||searchableSeries(entry,assets).includes(needle));
  filtered.sort((a,b)=>{
    const value=sort==='name'?a.title.localeCompare(b.title,'zh-CN'):
      (a.updatedAt||'').localeCompare(b.updatedAt||'');
    return (ascending?value:-value)||a.id.localeCompare(b.id);
  });
  const limit=pageSize(configuredPageSize);
  const range=catalogDataPage('series',filtered.length,limit);
  const visible=filtered.slice(range.start,range.end);
  const changeFilter=(key,setter)=>value=>{
    selection[key]=value;setCatalogDataPage('series',1);setter(value);
  };
  const selectEntry=(event,entry)=>{
    if(!active){selection.seriesScrollY=window.scrollY;selection.restoreSeriesScroll=true;
      onAction('series-detail',entry.id);return;}
    event.preventDefault();toggleSelected(selection,entry.id);
    window.dispatchEvent(new Event('shiye-selection-refresh'));
  };
  return <><div className="catalog-toolbar"><PageHeading title="我的素材" actions={
    <SelectionToggle mode="series" selection={selection} onToggle={onSelectionToggle}/>}/>
    <CatalogTabs tabs={materialTabs} active="series" onChange={onTabChange}/>
    <div className="swift-series-controls"><label className="shiye-search"><input type="search"
      placeholder="搜索系列、素材或标签" aria-label="搜索系列" value={query}
      onChange={event=>changeFilter('seriesQuery',setQuery)(event.target.value)}/></label>
      <div className="four-filter-controls"><ReactFilterMenu heading="排序依据" glyph="≡"
        options={[["recent","最近更新"],["name","名称"]]} value={sort}
        onChange={changeFilter('seriesSort',setSort)}/>
        <ReactFilterMenu heading="排序顺序" glyph="↕" toggle
          options={[["desc","降序"],["asc","升序"]]} value={ascending?'asc':'desc'}
          onChange={value=>changeFilter('seriesAscending',setAscending)(value==='asc')}/>
        <div className="catalog-page-summary">{limit?<div className="catalog-page-controls" data-page-key="series">
          <input type="number" min="1" max={range.count} key={range.current}
            aria-label="输入页码" defaultValue={range.current}
            onChange={event=>{setCatalogDataPage('series',Number(event.target.value));setRevision(value=>value+1);}}/>
          <button type="button" aria-label="上一页" disabled={range.current===1}
            onClick={()=>{setCatalogDataPage('series',range.current-1);setRevision(value=>value+1);}}>‹</button>
          <button type="button" aria-label="下一页" disabled={range.current===range.count}
            onClick={()=>{setCatalogDataPage('series',range.current+1);setRevision(value=>value+1);}}>›</button>
        </div>:null}
        <span className="catalog-total">{filtered.length} 项</span></div>
      </div></div></div>
    <div className={`grid series-grid ${display==='list'?'list-grid':''}`} data-react-page="series">
      <button type="button" className="series-entry" disabled={active} onClick={()=>onAction('new-series')}>
        <div className="series-entry-cover">＋</div><strong>新建系列</strong>
        <small>把喜欢的素材放在一起</small>
      </button>
      {visible.map((entry,index)=>{
        const members=assets.filter(asset=>asset.seriesID===entry.id&&!asset.isProjectInternal);
        return <PressCard key={entry.id} className={`card ${active&&selection.selected.has(entry.id)?'batch-selected':''}`}
          data-act="series-detail" data-id={entry.id} data-react-action="true"
          aria-pressed={active?selection.selected.has(entry.id):undefined}
          holdDisabled={active} onHold={()=>setSeriesMenuID(entry.id)}
          onActivate={event=>selectEntry(event,entry)}>
          <SeriesCover series={entry} assets={assets} seriesCovers={seriesCovers}
            source={source} priority={index<2} account={account}/>
          <div className="card-body"><h3>{entry.title} <span aria-hidden="true">→</span></h3><p>{members.length} 件素材</p></div>
        </PressCard>;
      })}
    </div>
    {seriesMenuID?createPortal(<div className="cloud-admin-backdrop" onMouseDown={event=>{
      if(event.target===event.currentTarget)setSeriesMenuID(null);}}>
      <section className="cloud-admin-panel" role="dialog" aria-modal="true" aria-label="系列操作">
        <h2>系列操作</h2><div className="stack">
          <button type="button" className="btn" onClick={()=>{
            const id=seriesMenuID;setSeriesMenuID(null);onAction('series-detail',id);
          }}>查看系列详情</button>
          <button type="button" className="btn" onClick={()=>{
            const id=seriesMenuID;setSeriesMenuID(null);onEditSeries?.(id);
          }}>编辑信息与标签</button>
        </div>
      </section></div>,document.body):null}
    <ReactSelectionTray selection={selection} mode={selection.selectionMode||'series'}
      visibleIDs={selection.selectionMode==='series'?visible.map(entry=>entry.id):[]}
      series={series} onAction={onBatchAction} onError={onBatchError}/>
  </>;
}

export function SeriesContentsPage({state,source,kindName,format,onAction,selection,onSelectionToggle,
  onEditSeries,onAddSeries,onBatchAction,onBatchError,onEditAsset}){
  const [,setRevision]=useState(0);
  useEffect(()=>{
    const refresh=()=>setRevision(revision=>revision+1);
    window.addEventListener('shiye-selection-refresh',refresh);
    window.addEventListener('shiye-library-refresh',refresh);
    return ()=>{window.removeEventListener('shiye-selection-refresh',refresh);window.removeEventListener('shiye-library-refresh',refresh);};
  },[]);
  const model=seriesContentsModel(state);
  if(!model)return <p>系列已移走</p>;
  const {series,filter,all,members,covers}=model;
  const selectedOnly=selectionActive(selection,'asset')&&selection.showOnlySelected;
  const pageKey='series:'+series.id+(selectedOnly?':selected':'');
  const sourceItems=selectedOnly?members.filter(asset=>selection.selected.has(asset.id)):members;
  const range=catalogVisibleItems(pageKey,sourceItems,state.preferences.maxPageItems);
  const visible=range.items;
  const change=(key,value)=>{filter[key]=value;setCatalogDataPage('series:'+series.id,1);
    setRevision(revision=>revision+1);};
  const options=(items,value)=>items.map(([id,label])=><option key={id} value={id}>{label}</option>);
  const kinds=materialKinds;
  const statuses=[['all','全部状态'],['ready','已整理'],['unready','未整理'],['used','已使用'],
    ['unused','未使用'],['favorite','已收藏'],['inside','系列中'],['outside','系列外']];
  return <section className="series-contents" data-react-page="seriesContents"><div className="catalog-toolbar">
    <div className="series-navigation"><button type="button" className="btn" id="series-return"
      data-react-action="true" onClick={()=>onAction('series-return')}>‹ 返回素材库</button>
      <div className="actions" id="series-actions"><SelectionToggle mode="asset"
        selection={selection} onToggle={onSelectionToggle}/></div></div>
    <div className="view-head series-heading"><div className="series-identity">
      <div className="series-detail-cover">{covers.map(asset=><RouteImage key={asset.id} asset={asset} source={source} priority/>)}</div>
      <div className="series-copy"><div className="eyebrow">COLLECTION</div>
        <h1><button type="button" id="series-edit-title" aria-label="编辑系列信息与标签"
          onClick={onEditSeries}>{series.title} <span aria-hidden="true">✎</span></button></h1>
        {series.introduction?<p>{series.introduction}</p>:null}
        <p className="series-tags">{[...(series.styleTags||[]),...(series.semanticTags||[])].join(' · ')}</p>
        <p>{all.length} 件素材</p>
      </div></div></div>
    <div className="series-filters filters"><label className="shiye-search">
      <input type="search" id="series-search" aria-label="在这个系列中搜索" placeholder="搜索系列内素材名称、标签或颜色"
        value={filter.query} onChange={event=>change('query',event.target.value)}/></label><div className="series-filter-menus">
      <select id="series-kind" hidden aria-label="系列素材类型" value={filter.kind}
        onChange={event=>change('kind',event.target.value)}>{options([['all','全部类型'],...kinds])}</select>
      <select id="series-status" hidden aria-label="系列素材状态" value={filter.status}
        onChange={event=>change('status',event.target.value)}>{options(statuses)}</select>
      <select id="series-sort" hidden aria-label="系列素材排序" value={filter.sort}
        onChange={event=>change('sort',event.target.value)}>{options([['recent','最近添加'],['name','名称']])}</select>
      <button className="btn" id="series-order" hidden onClick={()=>change('ascending',!filter.ascending)}>
        {filter.ascending?'升序 ↑':'降序 ↓'}</button>
      <div className="four-filter-controls">
        <ReactFilterMenu heading="类型" glyph="▦" value={filter.kind}
          options={[['all','全部类型'],...kinds]} onChange={value=>change('kind',value)}/>
        <ReactFilterMenu heading="状态" glyph="☷" value={filter.status}
          options={statuses} onChange={value=>change('status',value)}/>
        <ReactFilterMenu heading="排序依据" glyph="≡" value={filter.sort}
          options={[['recent','最近添加'],['name','名称']]} onChange={value=>change('sort',value)}/>
        <ReactFilterMenu heading="排序顺序" glyph="↕" toggle
          value={filter.ascending?'asc':'desc'} options={[['desc','降序'],['asc','升序']]}
          onChange={value=>change('ascending',value==='asc')}/>
        {pageSize(state.preferences.maxPageItems)?<div className="catalog-page-controls"
          data-page-key={pageKey}>
          <input type="number" min="1" max={range.count} key={range.current}
            aria-label="输入页码" defaultValue={range.current}
            onChange={event=>{setCatalogDataPage(pageKey,Number(event.target.value));
              setRevision(revision=>revision+1);}}/>
          <button type="button" aria-label="上一页" disabled={range.current===1}
            onClick={()=>{setCatalogDataPage(pageKey,range.current-1);
              setRevision(revision=>revision+1);}}>‹</button>
          <button type="button" aria-label="下一页" disabled={range.current===range.count}
            onClick={()=>{setCatalogDataPage(pageKey,range.current+1);
              setRevision(revision=>revision+1);}}>›</button>
        </div>:null}
      </div>
    </div></div></div>
    <div className={`grid asset-grid ${selection.showOnlySelected&&selectionActive(selection,'asset')?'selection-results':''} ${state.preferences.display==='list'?'list-grid':''}`}>
      <button type="button" className="card action-card" id="series-add-assets"
        disabled={Boolean(selection.selectionMode)} onClick={onAddSeries}><div className="card-image">＋</div>
        <div className="card-body"><h3>添加素材</h3><p>从全部素材选择</p></div></button>
      {visible.map(asset=><PressCard key={asset.id}
        className={`card ${selectionActive(selection,'asset')&&selection.selected.has(asset.id)?'batch-selected':''}`}
        aria-pressed={selectionActive(selection,'asset')?selection.selected.has(asset.id):undefined}
        data-card-revision={JSON.stringify([asset.title,asset.kind,
        asset.physicalWidthMM,asset.physicalHeightMM,asset.reviewStatus,asset.isFavorite,asset.blobId])}
        data-act="detail" data-id={asset.id} data-react-action="true"
        holdDisabled={selectionActive(selection,'asset')} onHold={()=>onEditAsset?.(asset.id)}
        onActivate={()=>{
          if(selectionActive(selection,'asset')){toggleSelected(selection,asset.id);
            window.dispatchEvent(new Event('shiye-selection-refresh'));}
          else onAction('detail',asset.id);}}>
        <div className="card-image"><RouteImage asset={asset} source={source}/>
          {selectionActive(selection,'asset')?<span className="batch-check">
            {selection.selected.has(asset.id)?'☑':'□'}</span>:null}</div>
        <div className="card-body"><h3>{asset.title}{asset.isFavorite?<span className="card-favorite" aria-label="已收藏">♥</span>:null}</h3>
          <p>{kindName(asset.kind)} · {asset.physicalWidthMM?`${format(asset.physicalWidthMM)} × ${format(asset.physicalHeightMM)} mm`:'尺寸待确认'}</p>
          <span className={`chip ${asset.reviewStatus==='ready'?'':'warn'}`}>{asset.reviewStatus==='ready'?'已整理':'待检查'}</span>
        </div>
      </PressCard>)}
    </div><p className="series-result-count">{range.total} 项</p>
    <ReactSelectionTray selection={selection} mode="asset" visibleIDs={visible.map(asset=>asset.id)}
      series={state.series} onAction={onBatchAction} onError={onBatchError}/>
  </section>;
}

const matchingPurposes=['日常记录','旅途记录','图文收藏','清单计划','影像故事','主题封面'];
const recommendationFilters=['全部','结构补足','配色关系','尺寸层次','内容呼应','材质','同系列','不使用'];
function DirectionGroup({groups,values,type,onChange}){
  return groups.map(group=><label key={group.id}>{group.label}<select className="match-direction-choice"
    data-direction={type} data-group={group.id} aria-label={group.label}
    value={values.find(value=>group.options.includes(value))||''}
    onChange={event=>onChange(type,event.target.value,group.options)}>
    <option value="">不预设</option>{group.options.map(name=><option key={name} value={name}>{name}</option>)}
  </select></label>);
}
function MatchingVariantCover({variant,session,source}){
  const host=React.useRef(null),[raster,setRaster]=useState(null);
  useEffect(()=>{
    if(variant.status==='running'||variant.project?.isSnapshot)return;
    let canceled=false,observer;
    const load=()=>{void session.coverURL(variant).then(url=>{
      if(!canceled&&url)setRaster(url);
    });};
    if(typeof IntersectionObserver==='function'){
      observer=new IntersectionObserver(entries=>{
        if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}
      },{rootMargin:'240px'});
      if(host.current)observer.observe(host.current);
    }else load();
    return ()=>{canceled=true;observer?.disconnect();};
  },[variant.project,variant.status,session]);
  const snapshot=variant.project?.isSnapshot?source(variant.project.snapshotBlobId):null;
  const draft=variant.project?.drafts?.find(item=>item.id===variant.project.activeDraftID)||
    variant.project?.drafts?.[0];
  return <div ref={host} className="match-cover-preview" data-match-raster={variant.id}>
    {raster||snapshot?<img className="match-raster-preview" src={raster||snapshot}
      alt={variant.title+' 构图预览'}/>:<div className="match-cover-fallback"
      style={{aspectRatio:draft?`${draft.canvas.width}/${draft.canvas.height}`:'3/4',
        background:draft?.paperColor||'#fcfaf0'}}>
      {draft?<div className="thumb-sheet" style={{'--thumb-ratio':draft.canvas.width/draft.canvas.height,
        background:draft.paperColor||'#fff'}}><span className="work-cover-pending" role="status">正在准备预览…</span></div>:null}
    </div>}
  </div>;
}
function MatchingSessionPanel({session,state,source,onAction}){
  const [,refresh]=useState(0);
  useEffect(()=>session.subscribe(()=>refresh(version=>version+1)),[session]);
  const variants=session.variants();
  const action=(name,id)=>()=>onAction(name,id);
  return <section className="panel match-previews" data-match-scroll="previews">
    <h2>版本方案</h2><p>完成方案自动保存为草稿或快照；“重新搭配”只清空这里的方案，不删除已保存作品。</p>
    <div className="match-variant-grid" data-match-scroll="variants">{variants.length?
      variants.map(variant=><article key={variant.id} className="match-variant"
        data-variant={variant.id} data-variant-status={variant.status}>
        <button className="match-result" data-act="match-open-result" data-id={variant.id}
          data-react-action="true" disabled={variant.status==='running'}
          onClick={action('match-open-result',variant.id)}>
          <MatchingVariantCover variant={variant} session={session} source={source} assets={state.assets}/>
          <strong>{variant.title}</strong>
        </button><pre className="match-progress" aria-live="polite">{variant.progress}</pre>
        {variant.linkedProjectID&&!state.projects.some(project=>project.id===variant.linkedProjectID)?
          <button className="btn" data-react-action="true" onClick={action('match-restore',variant.id)}>恢复已删除作品</button>:null}
        {variant.status==='running'?<button className="btn" data-react-action="true" onClick={action('match-stop')}>停止创作</button>:
          variant.project.deliveryMode==='zip'?<button className="btn"
            data-react-action="true"
            onClick={action('download-project-json',variant.linkedProjectID||variant.project.id)}>
            下载可编辑 JSON</button>:null}
      </article>):<p>尚未生成方案。</p>}</div>
  </section>;
}
export function MatchingPage({state,source,kindName,session,onAction,onMatchingChange}){
  const [,refresh]=useState(0);
  useEffect(()=>{
    const update=()=>refresh(version=>version+1);
    window.addEventListener('shiye-matching-refresh',update);
    return ()=>window.removeEventListener('shiye-matching-refresh',update);
  },[]);
  const change=(id,value,options)=>{onMatchingChange(id,value,options);refresh(version=>version+1);};
  const action=(name,id,value)=>()=>onAction(name,id,value);
  const {selected,recommendations,excluded,scope,filtered,styles,chosenPurposes}=matchingViewModel(state);
  const custom=state.matchRatio==='custom'||state.matchRatio.startsWith('custom:');
  return <div className={`matching-page ${custom?'custom-paper':''}`} data-react-page="matching">
    <div className="view-head unified-page-heading"><div className="unified-heading-copy"><span className="eyebrow">FROM YOUR DESK TO YOUR PAGES</span><h1>素材搭配</h1></div>
      <div className="actions"><button className="btn" data-act="reset-match" data-react-action="true" onClick={action('reset-match')}>↶　重新搭配</button></div></div>
    <section className="panel match-direction"><h2>先定这一页的方向</h2><p>每类可选一个方向，也可选“不预设”；不同类别可以自由组合。</p>
      <div className="match-direction-groups"><fieldset><legend>页面风格</legend><DirectionGroup groups={styleGroups} values={styles} type="style" onChange={change}/></fieldset>
        <fieldset><legend>页面用途</legend><DirectionGroup groups={purposeGroups} values={chosenPurposes} type="purpose" onChange={change}/>
          <label>素材加工方式<select id="match-processing" defaultValue={state.matchProcessing}
            onChange={event=>change('matchProcessing',event.target.value)}>{['不预设','保留完整','少量裁剪','自由拆解'].map(value=><option key={value}>{value}</option>)}</select></label>
        </fieldset></div>
      <select id="match-style" multiple hidden value={styles} onChange={()=>{}}>{visualStyles.map(([name])=><option key={name} value={name}>{name}</option>)}</select>
      <select id="match-purpose" multiple hidden value={chosenPurposes} onChange={()=>{}}>{matchingPurposes.map(name=><option key={name}>{name}</option>)}</select>
      <div className="match-options match-setting-row match-content-row"><label>文字内容<select id="match-content-policy" defaultValue={state.matchContentPolicy}
        onChange={event=>change('matchContentPolicy',event.target.value)}>
        <option value="documentary">真实记录 · 不编造经历</option><option value="original">原创主题文字</option><option value="collection">素材收藏短评</option><option value="visual">不添加文字</option>
      </select></label><label>文字表现方式<select id="match-text-presentation" defaultValue={state.matchTextPresentation||'mixed'}
        onChange={event=>change('matchTextPresentation',event.target.value)}>
        <option value="type">排版文字</option><option value="handwritten">自由手写</option><option value="mixed">混合编排</option>
      </select></label></div>
      <div className="match-options match-setting-row match-paper-page"><label>页面模式<select id="match-mode" defaultValue={state.matchMode}
        onChange={event=>change('matchMode',event.target.value)}><option value="single">单页</option><option value="spread">双页</option></select></label>
        <label>纸张规格<select id="match-ratio" defaultValue={state.matchRatio?.startsWith('custom:')?'custom':state.matchRatio}
          onChange={event=>change('matchRatio',event.target.value)}><PaperSizeOptions/></select></label></div>
      <div className="match-options match-setting-row match-paper-dimensions"><label className="match-custom-paper">纸张宽 mm<input id="match-paper-width" type="number" min="50" max="1000" defaultValue={state.customPaperWidth}
        onChange={event=>change('customPaperWidth',Number(event.target.value))}/></label>
        <label className="match-custom-paper">纸张高 mm<input id="match-paper-height" type="number" min="50" max="1000" defaultValue={state.customPaperHeight}
          onChange={event=>change('customPaperHeight',Number(event.target.value))}/></label></div>
      <label>创作要求和内容<textarea data-match-scroll="intent" id="match-intent" placeholder="可写主题、具体内容、想保留的句子或排版要求；未提供的私人事实不会编造" defaultValue={state.matchIntent}
        onBlur={event=>change('matchIntent',event.target.value)}/></label>
    </section>
    <div className="matching-layout"><aside className="basket"><h3>本次素材篮</h3><div className="match-basket-scroll" data-match-scroll="basket">
      {selected.length?selected.map(asset=><div key={asset.id} className="match-basket-item" data-match-asset={asset.id}>
        <RouteImage asset={asset} source={source}/><div><strong>{asset.title}</strong>{asset.kind||asset.role?<small className="match-type">{[asset.kind?kindName(asset.kind):null,asset.role?materialRoleName(asset.role):null].filter(Boolean).join(' · ')}</small>:null}
          <div className="match-basket-actions"><button type="button" data-act="match-core" data-id={asset.id} data-react-action="true" onClick={action('match-core',asset.id)} aria-label={state.coreIDs.includes(asset.id)?'取消标星':'标星设为必用'} aria-pressed={state.coreIDs.includes(asset.id)} title={state.aiSettings.requireAllCandidates?'当前设置为全部候选必用；标星会保留单件优先级':'切换此素材是否必用'}>{state.coreIDs.includes(asset.id)?'★':'☆'}</button>
            <button type="button" data-act="basket" data-id={asset.id} data-react-action="true" onClick={action('basket',asset.id)} aria-label="移出素材篮">×</button></div>
        </div></div>):<p>先从右侧建议或素材库选择。点星号可设为每版必用。</p>}
      </div><p className="muted">必须 {scope.required.length} · 优先 {scope.preferred.length} · {state.aiSettings.autoIncludeRecommendations?'AI 备选 '+scope.available.length:'AI 备选未开启'} · 不使用 {excluded.size}</p></aside>
      <section className="panel match-recommendations"><div className="match-panel-head"><h3>✣　按风格与用途推荐</h3><small>{recommendations.length} 件候选 · 已排除 {excluded.size} 件</small></div>
        <div className="match-chips" data-match-scroll="chips">{recommendationFilters.map(filter=><button key={filter} className={state.recommendFilter===filter?'active':''} data-act="match-filter" data-val={filter} data-react-action="true" onClick={action('match-filter',null,filter)}>{filter}</button>)}</div>
        <div className="match-rec-grid" data-match-scroll="recommendations">{filtered.length?filtered.map(({asset,reasons})=>{
          const isExcluded=excluded.has(asset.id);
          return <div key={asset.id} className="match-rec" data-match-asset={asset.id}><RouteImage asset={asset} source={source}/><div><strong>{asset.title}</strong><small className="match-type">{kindName(asset.kind)}</small>
            {isExcluded?<small className="match-priority excluded">不可以使用</small>:null}<small title={reasons.join('、')}>{reasons.slice(0,2).join(' · ')||'适合当前方向'}</small>
            <button data-act="basket" data-id={asset.id} data-react-action="true" onClick={action('basket',asset.id)}>加入素材篮</button><button data-act={isExcluded?'match-allow':'match-skip'} data-id={asset.id} data-react-action="true" onClick={action(isExcluded?'match-allow':'match-skip',asset.id)}>{isExcluded?'恢复推荐':'不使用'}</button></div></div>;
        }):<p>这一类暂时没有候选；可以更换风格、用途或继续从素材库选取。</p>}</div>
      </section></div>
    <section className="panel match-action"><h2>开始创作</h2><p>{state.aiSettings.requireAllCandidates?'当前候选素材均为必用；如无法在真实纸张上容纳，请减少候选或关闭设置中的必用开关。':'标星的素材必须使用；其余候选尽量使用，但不强制用尽。'}不使用的素材不会发送给 AI。</p>
      <div className="match-generate"><button className="btn primary" data-act="match-generate" data-react-action="true" onClick={action('match-generate')} disabled={!scope.candidateAssetIDs.length}>进行AI创作</button><button className="btn" data-act="match-export-gpt" data-react-action="true" onClick={action('match-export-gpt')} disabled={!scope.candidateAssetIDs.length}>导出给网页版 AI</button>
        <button className="btn" data-act="match-import-gpt" data-react-action="true" onClick={action('match-import-gpt')}>导入 AI 结果</button><button className="btn" data-act="create-from-basket" data-react-action="true" onClick={action('create-from-basket')} disabled={!selected.length}>不使用 AI，手动创作</button></div></section>
    <MatchingSessionPanel session={session} state={state} source={source} onAction={onAction}/>
  </div>;
}

function EditorInspector({selected,draft,asset,format,onChange,onAction,materials=[]}){
  const field=(id,label,value,type='number',props={})=>type==='range'?<label className="editor-inspector-range">
    <span>{label} · {Number(props.max)===1?`${Math.round(Number(value)*100)}%`:value}</span><div>
      <input id={id} type="range" value={value} onChange={event=>onChange(id,event.target.value)} {...props}/>
    </div></label>:<label>{label}<input id={id} type={type}
    defaultValue={value} onChange={event=>onChange(id,event.target.value)} {...props}/></label>;
  const choice=(id,label,value,options)=><label>{label}<select id={id} value={value}
    onChange={event=>onChange(id,event.target.value)}>{options.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>;
  const check=(id,label,value)=><label className="editor-inspector-check"><input id={id} type="checkbox" checked={!!value}
    onChange={event=>onChange(id,event.target.checked)}/>{label}</label>;
  if(!selected)return <div className="stack">
    {field('paper-color','纸张颜色',draft.paperColor,'color')}
    <label>背景<select id="paper-pattern" defaultValue={draft.paperPattern}
      onChange={event=>onChange('paper-pattern',event.target.value)}>
      {Object.entries({plain:'纯色',grid:'方格',lines:'横线',dots:'点阵'}).map(([id,name])=>
        <option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>纸张规格<select id="page-ratio" defaultValue={draft.pageRatio}
      onChange={event=>onChange('page-ratio',event.target.value)}>
      <PaperSizeOptions includeCustom={false}/>
      {['portrait','square','landscape'].map(id=><option key={id} value={id}>旧版比例 · {id.toUpperCase()}</option>)}
      {draft.pageRatio?.startsWith('custom:')?<option value={draft.pageRatio}>自定义 {draft.pageRatio.slice(7)} mm</option>:null}
    </select></label>
    <label>页面模式<select id="page-mode" defaultValue={draft.pageMode||'single'}
      onChange={event=>onChange('page-mode',event.target.value)}>
      <option value="single">单页</option><option value="spread">双页</option>
    </select></label>
  </div>;
  const item=selected.value;
  if(selected.kind==='ink')return <div className="stack editor-inspector-fields">
    <h3>手写笔迹</h3><p className="muted">在画布编辑框中移动、缩放或旋转笔迹。</p>
    {field('inspector-opacity','整体透明度',item.opacity??1,'range',{min:0,max:1,step:.05})}
  </div>;
  return <div className="stack editor-inspector-fields">
    {selected.kind==='text'?<>
      <h3>文字内容与样式</h3>
      <label>文字内容<textarea id="inspector-text" defaultValue={item.content}
        onChange={event=>onChange('inspector-text',event.target.value)}/></label>
      <div className="form-grid">
        {choice('inspector-font','字体',item.style||'serif',[[ 'serif','宋体'],['sans','黑体'],['rounded','圆体'],['hand','手写体']])}
        {field('inspector-font-size','字号',item.fontSize,'number',{min:5,max:400,step:1})}
        {choice('inspector-alignment','对齐',item.alignment||'left',[[ 'left','左对齐'],['center','居中'],['right','右对齐']])}
        {field('inspector-text-color','文字颜色',item.color||'#30463d','color')}
      </div>
      <div className="editor-inspector-checks">{check('inspector-bold','粗体',item.bold)}{check('inspector-italic','斜体',item.italic)}
        {check('inspector-underline','下划线',item.underline)}{check('inspector-strikethrough','删除线',item.strikethrough)}</div>
      <div className="editor-inspector-geometry">
        {field('inspector-curve-height','文字弧度',item.curveHeight??0,'range',{min:-120,max:120,step:2})}
        {field('inspector-letter-spacing','字距',item.letterSpacing??0,'range',{min:-5,max:30,step:.5})}
        {field('inspector-line-spacing','行距',item.lineSpacing??0,'range',{min:0,max:80,step:.5})}
        {field('inspector-paragraph-spacing','段距',item.paragraphSpacing??0,'range',{min:0,max:80,step:.5})}
        {choice('inspector-fixed-line-height','行高',item.fixedLineHeight??'',[
          ['','自动'],...([1,1.2,1.5,2].map(ratio=>[Math.round((item.fontSize||40)*ratio),`${ratio} 倍`]))])}
        {field('inspector-font-name','指定字体',item.fontName||'','text',{placeholder:'留空使用上方字体'})}
      </div>
    </>:null}
    {selected.kind==='shape'?<>
      <h3>图形外观</h3>
      {item.vectorLayers?.length?<div className="editor-inspector-vector"><p className="muted">多色矢量 · {item.vectorLayers.length} 层，路径保持独立</p>
        {item.vectorLayers.map((layer,index)=><div className="form-grid" key={index}>
          {field(`inspector-vector-fill-${index}`,`第 ${index+1} 层颜色`,layer.fill||'#ffffff','color')}
          {field(`inspector-vector-opacity-${index}`,'该层透明度',layer.opacity??1,'range',{min:0,max:1,step:.05})}
        </div>)}</div>:<div className="form-grid">
        {field('inspector-fill','填充颜色',item.fill||'#ffffff','color')}
        {field('inspector-stroke','描边颜色',item.stroke||'#547da4','color')}
        {field('inspector-line-width','描边粗细',item.lineWidth??0,'range',{min:0,max:30,step:.5})}
        {choice('inspector-stroke-dash','线型',item.strokeDash||'solid',[[ 'solid','实线'],['dash','虚线'],['dot','点线']])}
        {field('inspector-fill-opacity','填充透明度',item.fillOpacity??1,'range',{min:0,max:1,step:.05})}
        {field('inspector-stroke-opacity','描边透明度',item.strokeOpacity??1,'range',{min:0,max:1,step:.05})}
      </div>}
    </>:null}
    {selected.kind==='material'?<><h3>真实素材</h3>
      <p className="muted">实物 {format(asset(item.assetID)?.physicalWidthMM||0)} × {format(asset(item.assetID)?.physicalHeightMM||0)} mm</p>
      <div className="editor-inspector-geometry"><label>更换素材
        <select aria-label="选择替换素材" value="" onChange={event=>{
          if(event.target.value)onAction('fabric-replace-material',event.target.value);
        }}><option value="">选择素材</option>{materials.filter(record=>
          record.id!==item.assetID&&!record.isProjectInternal&&record.physicalWidthMM>0&&record.physicalHeightMM>0&&
          !draft.items.some(used=>used.id!==item.id&&used.assetID===record.id&&!used.manualVisualCopy))
          .map(record=><option key={record.id} value={record.id}>{record.title}</option>)}</select></label>
      </div>
      {item.cropRect?<p className="muted">已取用原素材的 {Math.round(item.cropRect.width*100)}% × {Math.round(item.cropRect.height*100)}% 区域；移动和旋转不会改变裁片。</p>:null}
      {item.materialMask?<p className="muted">已保留 AI 创作的裁边或镂空工艺。</p>:null}
      {item.tapeStrip?<div className="stack"><h3>胶带段</h3>
        <p className="muted">完成此窗口后，可在画布工具栏重画中心线。</p>
        {field('inspector-tape-width','宽度 mm',item.tapeStrip.physicalWidthMM,'number',{min:.5,max:200,step:.5})}
        {choice('inspector-tape-mode','纹样方式',item.tapeStrip.textureMode||'repeat',
          [['sample','原图长度'],['repeat','重复纹样'],['stretch','沿路径拉伸']])}
        <div className="form-grid">
          {choice('inspector-tape-start-cap','起始端头',item.tapeStrip.startCap||'square',
            [['square','平切'],['angled','斜切'],['torn','手撕']])}
          {choice('inspector-tape-end-cap','结束端头',item.tapeStrip.endCap||'square',
            [['square','平切'],['angled','斜切'],['torn','手撕']])}
        </div>
      </div>:null}
      {check('inspector-flipped','左右镜像',item.isFlippedHorizontally)}
    </>:null}
    <h3>图层外观</h3>
    <div className="form-grid">{field('inspector-opacity','整体透明度',item.opacity??1,'range',{min:0,max:1,step:.05})}
      {choice('inspector-blend-mode','叠加方式',item.blendMode||'normal',[[ 'normal','正常'],['multiply','正片叠底']])}</div>
  </div>;
}

function FloatingInspectorPanel({selected,draft,asset,format,materials,onChange,onAction}){
  const floating=useFloatingPanel(210);
  return createPortal(<section ref={floating.panel} className="editor-inspector floating-editor-inspector floating-scene-panel" role="dialog"
    aria-label="对象编辑" style={floating.style}>
    <header className="fabric-inspector-head" {...floating.moveProps}>
      <h2>{selected?`${{material:'素材',text:'文字',shape:'图形',ink:'笔迹'}[selected.kind]||'对象'} · 图层属性`:'对象已移除'}</h2>
      <div className="floating-scene-panel-actions">
        <button type="button" onPointerDown={event=>event.stopPropagation()}
          onClick={()=>onAction('fabric-inspector-discard')}>放弃</button>
        <button type="button" className="primary" onPointerDown={event=>event.stopPropagation()}
          onClick={()=>onAction('fabric-inspector-save')}>完成</button>
      </div>
    </header>
    <div className="floating-editor-inspector-body">{selected?<EditorInspector selected={selected}
      draft={draft} asset={asset} format={format} materials={materials} onChange={onChange}
      onAction={onAction}/>:<p>对象已从本次编辑中移除。</p>}</div>
    <div className="floating-panel-resize" role="separator" tabIndex={0}
      aria-label="拖动调整对象编辑窗口高度" aria-orientation="horizontal" {...floating.resizeProps}/>
  </section>,document.body);
}

function EditorAIPanel({state,draft,asset,hasReport,onAction,onPromptChange}){
  const [status,setStatus]=useState({busy:!!state.aiBusy,progress:state.aiProgress||'',hasReport});
  useEffect(()=>{
    const update=event=>setStatus(event.detail);
    window.addEventListener('shiye-ai-status',update);
    return ()=>window.removeEventListener('shiye-ai-status',update);
  },[]);
  const ids=[...new Set([...(state.activeProject?.candidateAssetIDs||[]),
    ...state.basket,...(draft.items||[]).map(item=>item.assetID)])].filter(id=>asset(id));
  return <section className="inline-ai-panel" aria-label="AI 创作">
    <div className="inline-ai-head"><h2>AI 创作</h2><button type="button" data-ai-close
      aria-label="收起 AI 创作" onClick={()=>onAction('close')}>×</button></div>
    <p>边创作边在上方画布查看。使用设置中的 {state.aiSettings.model}，按模型能力发送素材描述与可选缩略图。</p>
    <div className="inline-ai-assets">{ids.length?ids.map((id,index)=><span key={id}>m{index+1} · {asset(id).title}</span>):'请先从素材搭配选择素材'}</div>
    <label>这页想记录什么？<textarea id="ai-prompt" placeholder="写下主题、故事与喜欢的氛围"
      defaultValue={state.aiPrompt} onInput={event=>onPromptChange(event.currentTarget.value)}/></label>
    <div className="inline-ai-actions">
      <button type="button" className="btn primary" id="ai-start" disabled={status.busy}
        onClick={()=>onAction('start')}>{status.busy?'创作中…':'开始创作'}</button>
      <button type="button" className="btn" id="ai-stop" disabled={!status.busy}
        onClick={()=>onAction('stop')}>停止</button>
      <button type="button" className="btn" id="ai-report" disabled={!status.hasReport}
        onClick={()=>onAction('report')}>导出诊断</button>
      <button type="button" className="btn" id="ai-settings"
        onClick={()=>onAction('settings')}>AI 设置</button>
    </div><div id="ai-progress" role="status" aria-live="polite">{status.progress}</div>
  </section>;
}

function FabricSelectedActions({bounds,draft,onAction,mode='object',canUngroup=false,count=0}){
  const [position,setPosition]=useState(null);
  useEffect(()=>{
    if(!bounds){setPosition(null);return;}
    const canvas=document.querySelector('.upper-canvas');
    const page=document.querySelector('#canvas-page');
    if(!canvas||!page)return;
    let currentBounds=bounds,frame=0;
    const place=()=>{
      const rect=canvas.getBoundingClientRect();
      const selected=editorFabricCanvases.get(draft.id)?.getActiveObject();
      const corners=selected?.calcACoords?.();
      const anchor=mode!=='selection'&&corners?.tl&&corners?.tr?{x:(corners.tl.x+corners.tr.x)/2,
        y:(corners.tl.y+corners.tr.y)/2}:{x:currentBounds.x+currentBounds.width/2,y:currentBounds.y};
      const center=rect.left+anchor.x*rect.width/draft.canvas.width;
      const edge=rect.top+anchor.y*rect.height/draft.canvas.height;
      setPosition({left:Math.max(88,Math.min(innerWidth-88,center)),
        top:Math.max(58,Math.min(innerHeight-50,edge-30))});
    };
    const move=event=>{
      currentBounds=event.detail.bounds;
      if(frame)return;
      frame=requestAnimationFrame(()=>{frame=0;place();});
    };
    place();
    const observer=new MutationObserver(place);observer.observe(page,{attributes:true,attributeFilter:['style']});
    const resize=new ResizeObserver(place);resize.observe(canvas);
    addEventListener('resize',place);addEventListener('scroll',place,true);
    canvas.addEventListener('shiye:fabric-object-transform',move);
    page.addEventListener('panzoomchange',place);
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();removeEventListener('resize',place);
      removeEventListener('scroll',place,true);canvas.removeEventListener('shiye:fabric-object-transform',move);
      page.removeEventListener('panzoomchange',place);};
  },[bounds?.x,bounds?.y,bounds?.width,bounds?.height,draft.id,draft.canvas.width,draft.canvas.height,mode]);
  if(!position)return null;
  const collective=mode==='selection',group=mode==='group';
  return createPortal(<div className="fabric-selected-actions" style={position}
    aria-label={collective?'选区操作':group?'组合操作':'选中对象操作'}>
    <button type="button" aria-label={collective?'复制套选对象':group?'复制组合':'复制对象'}
      onClick={()=>onAction(collective?'fabric-lasso-copy':group?'fabric-group-copy':'duplicate')}
      dangerouslySetInnerHTML={{__html:iconMarkup('copy')}}/>
    <button type="button" aria-label={collective||group?
      canUngroup?'解开组合':'组合所选对象':'编辑对象'}
      disabled={collective&&!canUngroup&&count<2}
      onClick={()=>onAction(collective||group?'fabric-selection-toggle-group':'fabric-inspector-open')}
      dangerouslySetInnerHTML={{__html:iconMarkup(collective||group?canUngroup?'ungroup':'group':'pen')}}/>
    <button type="button" aria-label="剪切选中对象" onClick={()=>onAction('fabric-cut-open')}
      dangerouslySetInnerHTML={{__html:iconMarkup('scissors')}}/>
    <button type="button" aria-label={collective?'删除套选对象':group?'删除组合':'删除对象'}
      onClick={()=>onAction(collective?'fabric-lasso-delete':group?'fabric-group-delete':'delete-object')}
      dangerouslySetInnerHTML={{__html:iconMarkup('trash')}}/>
  </div>,document.body);
}

// Fabric owns the single editable canvas; React owns its surrounding controls.
const editorFabricCanvases=new Map();
export function getEditorFabricCanvas(draftID){return editorFabricCanvases.get(draftID);}

export function EditorPage({state,draft,editorEntry,asset,source,format,
  hasAIReport,onAction,onInspectorChange,onTitleCommit,onAIAction,onAIOpen,onAIPromptChange,
  sceneRevision,onFabricSelection,onFabricBeforeChange,onFabricChange,onFabricIssue,
  onFabricViewportChange,loadFabricAsset,retainFabricAssets,materials=[]}){
  const project=state.activeProject;
  if(!project||!draft)return null;
  const selected=editorEntry(draft).find(entry=>entry.value.id===state.selected)||
    (findSceneNode(draft,state.selected)?.type==='ink'
      ?{kind:'ink',value:findSceneNode(draft,state.selected)}:null);
  const selectedGroup=findSceneNode(draft,state.selected)?.type==='group';
  const selectedIDs=state.multiSelected||[];
  const canUngroup=!!selectionGroupID(draft,selectedIDs);
  const viewportHeight=window.visualViewport?.height||window.innerHeight;
  const availableWidth=Math.max(180,window.innerWidth-(window.innerWidth<700?24:72));
  const availableHeight=Math.max(180,viewportHeight-(window.innerWidth<700?200:166));
  const width=Math.max(160,Math.min(availableWidth,availableHeight*draft.canvas.width/draft.canvas.height));
  const scale=width/draft.canvas.width,height=draft.canvas.height*scale;
  const tapCutPreview=event=>{
    if(state.cutPreview?.spec.operation!=='split')return;
    const canvas=editorFabricCanvases.get(draft.id);if(!canvas)return;
    const {scene:point,viewport}=fabricPointer(canvas,event);
    const targets=new Set(state.selected?[state.selected]:[]);
    for(const entry of sceneLayerEntries(draft,{hidden:true,ink:true}))
      if(entry.parents.some(parent=>targets.has(parent.id)))targets.add(entry.value.id);
    const top=[...canvas.getObjects()].reverse().find(object=>
      selectableFabricObjectAt(canvas,object,point,viewport,{includeInk:true}));
    // An unrelated cover is translucent during cutting, so it must not eat
    // the tap. A sibling inside the selected group stays opaque and does.
    const topSourceID=top&&targets.has(top.sceneID)&&top.sceneID!==state.selected?
      top.sceneID:null;
    const piece=cutPreviewPieceAt(state.cutPreview,point,{topSourceID});
    if(piece)onAction('fabric-cut-keep',piece.key);
  };
  return <><div className="view-head swift-editor-head">
    <button className="btn" data-act="back-works">返回</button>
    <div><h1 contentEditable={!state.cutSession&&!state.inspectorSession} suppressContentEditableWarning id="project-title"
    spellCheck="false" onBlur={event=>onTitleCommit(event.currentTarget.textContent)}>{project.title}</h1>
      <p>编辑只改变作品，不修改素材库里的原始图片和尺寸</p></div><div className="actions">
      <span className="swift-auto-saved">{document.querySelector('#save-state')?.textContent||'本机暂存'}</span>
        <FabricHeaderMenu kind="history" project={project} onAction={onAction} onAIOpen={onAIOpen}/>
        <button className="btn" data-act="undo" aria-label="撤销">↶</button>
        <button className="btn" data-act="redo" aria-label="重做">↷</button>
        <button className="btn primary" data-act="editor-done">完成</button>
        <FabricHeaderMenu kind="export" project={project} onAction={onAction}/>
    </div></div>
    <FabricEditorToolbar state={state} draft={draft} materials={materials} source={source}
      selected={selected} onInspectorChange={onInspectorChange} onAction={onAction}/>
    <FabricCutPanel state={state} draft={draft} onAction={onAction}/>
    {state.tool==='lasso'&&selectedIDs.length?<FabricSelectedActions mode="selection" count={selectedIDs.length}
      canUngroup={canUngroup} bounds={state.fabricSelectionBounds} draft={draft} onAction={onAction}/>:null}
    {state.tool==='select'&&selectedIDs.length>1?<FabricSelectedActions mode="selection"
      count={selectedIDs.length} canUngroup={canUngroup} bounds={state.fabricSelectionBounds}
      draft={draft} onAction={onAction}/>:null}
    {selectedGroup&&state.tool==='select'&&!state.fabricInspectorOpen?<FabricSelectedActions mode="group"
      canUngroup bounds={state.fabricSelectionBounds} draft={draft} onAction={onAction}/>:null}
    {selected&&state.tool==='select'&&!state.fabricInspectorOpen?<FabricSelectedActions bounds={state.fabricSelectionBounds}
      draft={draft} onAction={onAction}/>:null}
    <div className="editor-shell swift-editor-workspace"
      data-react-page="editor"><section className="editor-stage"><div className="object-toolbar">
      <button className="btn mini" data-act="zoom-out">－</button><span>{Math.round(state.zoom*100)}%</span><button className="btn mini" data-act="zoom-in">＋</button>
      <button className="btn mini" data-act="paper-menu">纸张</button>
      <button className="btn mini" data-act="restore-baseline" disabled={selected?.kind!=='material'||!selected.value.generationBaseline}>恢复初稿</button>
      <button className="btn mini" data-act="park" disabled={selected?.kind!=='material'}>放入备选</button>
    </div><div className="page-wrap"><FabricPageViewport draft={draft} width={width} height={height}
      tool={state.tool} onCanvasTap={event=>{
        if(state.tool==='scissors'){tapCutPreview(event);return;}
        const canvas=editorFabricCanvases.get(draft.id);
        if(!canvas)return;
        const {scene:point,viewport}=fabricPointer(canvas,event);
        // A new selection is committed only on release over painted pixels.
        // The active frame's transparent interior is a drag target only after
        // selection; it must never turn an empty tap into a new selection.
        const hit=[...canvas.getObjects()].reverse().find(object=>
          selectableFabricObjectAt(canvas,object,point,viewport));
        if(hit&&event.pointerType==='touch'&&['pen','highlighter','eraser','lasso'].includes(state.tool)){
          onAction('fabric-select-layer',hit.sceneID);
          return;
        }
        if(hit)canvas.setActiveObject(hit);
        else canvas.discardActiveObject();
        canvas.requestRenderAll();
      }}
      canTransform={event=>{
        if(!state.selected&&(state.multiSelected||[]).length<2)return false;
        const canvas=editorFabricCanvases.get(draft.id);
        if(!canvas)return false;
        const {scene:point,viewport}=fabricPointer(canvas,event);
        const active=canvas.getActiveObject();
        if(active?.sceneMultiIDs?.length&&active.sceneMultiIDs.length===(state.multiSelected||[]).length&&
          active.sceneMultiIDs.every(id=>state.multiSelected.includes(id))){
          if(active.findControl(viewport,event.pointerType==='touch'))return true;
          return active.containsPoint(point);
        }
        if(active?.sceneID===state.selected&&
          active.findControl(viewport,event.pointerType==='touch'))return true;
        if(active?.sceneSelectionProxy&&active.sceneID===state.selected&&
          active.containsPoint(point))return true;
        // Once selected, the whole group frame is the drag target. A gap
        // between its children must not start page navigation.
        if(active?.sceneID===state.selected&&
          active.containsPoint(point))return true;
        // Only Fabric's currently active object may be dragged. React's
        // selected ID can lag behind a canvas tap and must not revive an old
        // selection when a finger starts panning over its former position.
        return false;
      }}
      zoom={state.zoom} resetSignal={state.fabricFitRevision||0}
      initialPan={state.canvasViewports?.get(project.id+':'+draft.id)}
      onViewportChange={onFabricViewportChange}><div className="fabric-scene-scale" style={{position:'absolute',left:0,top:0,
        width:draft.canvas.width,height:draft.canvas.height,transform:`scale(${scale})`,transformOrigin:'left top'}}>
        <FabricSceneStage draft={draft} sceneRevision={sceneRevision} tool={state.tool}
          selectedID={state.selected}
          tapeAsset={materials.find(asset=>asset.id===state.tapeAssetID)||null}
          tapeOptions={state.tapeOptions||null}
          onTapePath={points=>onAction('fabric-place-tape',points)}
          cutPreview={state.cutPreview}
          onCutPath={(points,closed)=>onAction('fabric-cut-preview',points,closed?'loop':'line')}
          onCutTap={tapCutPreview}
          textDefaults={state.textDefaults||null}
          pen={{widthMM:state.canvasTools?.fabricPenWidthMM??.5,color:state.canvasTools?.penColor||'#2b5245',
            style:state.canvasTools?.fabricPenStyle||'pressure'}}
          marker={{widthMM:state.canvasTools?.fabricMarkerWidthMM??2,color:state.canvasTools?.fabricMarkerColor||'#f5cf45',
            straight:!!state.canvasTools?.fabricMarkerStraight}}
          eraser={{widthMM:state.canvasTools?.fabricEraserWidthMM??4,style:state.canvasTools?.fabricEraserStyle||'standard'}}
          selectionMode={state.selectionMode||'contain'} selectionFilter={state.selectionFilter}
          selectedIDs={state.multiSelected||[]}
          assetURL={loadFabricAsset} retainAssets={retainFabricAssets} onSelection={onFabricSelection}
          onBeforeChange={onFabricBeforeChange} onChange={onFabricChange} onIssue={onFabricIssue}
          onReady={canvas=>{if(canvas)editorFabricCanvases.set(draft.id,canvas);
            else editorFabricCanvases.delete(draft.id);}}/>
      </div></FabricPageViewport></div>
    </section></div>
    {state.fabricInspectorOpen?<FloatingInspectorPanel selected={selected} draft={draft}
      asset={asset} format={format} materials={materials} onChange={onInspectorChange}
      onAction={onAction}/>:null}
    {state.aiPanel?<div className="editor-ai-island" style={{display:'contents'}}>
      <EditorAIPanel state={state} draft={draft} asset={asset} hasReport={hasAIReport}
        onAction={onAIAction} onPromptChange={onAIPromptChange}/></div>:null}
  </>;
}

export function AssetDetailPage({asset,seriesTitle,source,kindName,format,onAction,assets=[],onSelectSimilar,onExportPrint}){
  const [similarOpen,setSimilarOpen]=useState(false);
  const [,refresh]=useState(0);
  useEffect(()=>{const update=()=>refresh(value=>value+1);window.addEventListener('shiye-asset-refresh',update);return ()=>window.removeEventListener('shiye-asset-refresh',update);},[]);
  const similarTags=new Set([...(asset.tags||[]),...(asset.contentTags||[]),...(asset.styleTags||[])]);
  const similar=assets.filter(entry=>entry.id!==asset.id&&!entry.isProjectInternal)
    .map(entry=>({asset:entry,score:(entry.kind===asset.kind?2:0)+
      (entry.seriesID&&entry.seriesID===asset.seriesID?2:0)+(entry.role===asset.role?1:0)+
      (entry.tags||[]).filter(tag=>similarTags.has(tag)).length}))
    .filter(entry=>entry.score>0).sort((left,right)=>right.score-left.score).slice(0,24);
  const tags=[...(asset.tags||[]),...(asset.contentTags||[]),...(asset.styleTags||[]),...(asset.materialTags||[])]
    .filter((tag,index,list)=>tag&&list.indexOf(tag)===index).sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const act=name=>()=>onAction(name);
  return <div className="detail-page" data-react-page="assetDetail">
    <div className="detail-topline"><button className="detail-back" data-act="detail-back" data-react-action="true" onClick={act('detail-back')}>‹　返回素材库</button>
    <span className="detail-category">{seriesTitle||'系列外'}</span></div>
    <section className="detail-columns"><div className="detail-picture"><span>▣　透明素材预览</span>
      <RouteImage asset={asset} source={source} priority/>
    </div><div className="detail-copy"><div className="eyebrow">A LITTLE PIECE OF EVERYDAY</div>
      <button className="detail-heart" data-act="detail-favorite" data-react-action="true" aria-label={asset.isFavorite?'取消收藏':'收藏'}
        aria-pressed={!!asset.isFavorite} onClick={act('detail-favorite')}>{asset.isFavorite?'♥':'♡'}</button>
      <h1>{asset.title}</h1><div className="detail-facts">
        <div><small>真实尺寸</small><span>{format(asset.physicalWidthMM||0)} × {format(asset.physicalHeightMM||0)} mm</span></div>
        <div><small>素材类型</small><span>{kindName(asset.kind)}</span></div>
        <div><small>主要作用</small><span>{materialRoleName(asset.role)||'待记录'}</span></div>
        <div><small>材质</small><span>{asset.texture||'待记录'}</span></div>
      </div><div className="detail-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>
      <div className="detail-dots">● ● ● ●</div><hr/><p>实物可用操作</p><p>✓ 整件使用　 ✓ 旋转摆放</p>
      <button className="btn primary detail-add" data-act="detail-add" data-react-action="true" onClick={act('detail-add')}>＋　加入本次创作</button>
      <div className="detail-links">
        <button className="btn" data-act="detail-series" data-react-action="true" onClick={act('detail-series')}><DetailLinkIcon kind="folder"/><span className="detail-link-label">同系列</span></button>
        <button className="btn" data-act="detail-similar" data-react-action="true" onClick={()=>setSimilarOpen(true)}><DetailLinkIcon kind="search"/><span className="detail-link-label">找相似</span></button>
        <button className="btn" data-act="detail-match" data-react-action="true" onClick={act('detail-match')}><DetailLinkIcon kind="sparkles"/><span className="detail-link-label">去搭配</span></button>
      </div><div className="detail-small">
        <button data-act="detail-edit" data-react-action="true" onClick={act('detail-edit')}>✎　编辑素材信息</button>
        <button data-act="detail-check" data-react-action="true" onClick={act('detail-check')}>□　检查抠图</button>
        <button type="button" data-act="asset-print-pdf" data-react-action="true"
          onClick={onExportPrint}>▤　导出打印 PDF</button>
      </div>
    </div></section>
    {similarOpen?createPortal(<div className="cloud-admin-backdrop" onMouseDown={event=>{
      if(event.target===event.currentTarget)setSimilarOpen(false);}}>
      <section className="cloud-admin-panel" role="dialog" aria-modal="true" aria-label="相似素材">
        <div className="dialog-head"><h2>相似素材</h2><button type="button" className="btn"
          onClick={()=>setSimilarOpen(false)}>关闭</button></div>
        <p>按类型、画面作用、标签和系列检索。像素视觉相似度仍待移植。</p>
        <div className="mini-assets">{similar.map(({asset:entry})=><button type="button"
          className="mini-asset" key={entry.id} data-similar={entry.id} onClick={()=>{
            setSimilarOpen(false);onSelectSimilar(entry.id);}}>
          <RouteImage asset={entry} source={source}/><span>{entry.title}</span>
        </button>)}</div>
      </section></div>,document.body):null}
  </div>;
}

export function ProjectPreviewPage({project,source,assets,localCover,cloudEnabled,onAction}){
  const asset=id=>assets.find(entry=>entry.id===id);
  const draft=project.drafts.find(entry=>entry.id===project.activeDraftID)||project.drafts[0];
  const original=project.coverStaticPath&&project.updatedAt===project.coverBaselineUpdatedAt;
  const staticCover=project.isSnapshot?source(project.snapshotBlobId):original?project.coverStaticPath:null;
  const tags=[...(project.styleTags||[]),...(project.tags||[])]
    .filter((tag,index,list)=>tag&&list.indexOf(tag)===index);
  const action=name=>()=>onAction(name);
  const button=(name,label,kind='')=><button className={`btn ${kind}`} data-act={name}
    data-react-action="true" onClick={action(name)}>{label}</button>;
  return <div className="project-preview-page" data-react-page="projectPreview"><div className="project-preview-head">
    <h1>{project.title}</h1>{project.isSnapshot?<button type="button" className="snapshot-favorite"
      data-act="snapshot-favorite" data-react-action="true" aria-label={project.isFavorite?'取消收藏快照':'收藏快照'}
      aria-pressed={!!project.isFavorite} onClick={action('snapshot-favorite')}>{project.isFavorite?'♥':'♡'}</button>:null}
    {button('preview-back','关闭')}
  </div><div className="project-preview-cover"><div className="preview-paper"
    style={{background:draft.paperColor||'#fff',aspectRatio:`${draft.canvas.width}/${draft.canvas.height}`,
      width:`${Math.min(window.innerHeight*.55,500)*draft.canvas.width/draft.canvas.height}px`,
      maxWidth:'90%',height:'auto',maxHeight:'100%'}}>
    {staticCover?<img className="work-reference" loading="eager" fetchPriority="high" decoding="async"
      src={staticCover} alt={`${project.title} ${project.isSnapshot?'快照':'完整预览'}`}/>:null}
    {!staticCover?<SceneCover draft={draft} asset={asset} source={source} priority
      snapshotOnly cloudEnabled={cloudEnabled} localCover={()=>localCover(project)}
      projectID={project.id}/>:null}
  </div></div><div className="project-preview-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>
    <p>{project.isSnapshot?'独立保存的画面快照，不能逐层编辑。':'页面上的素材、排版和书写内容都已保存。'}</p>
    <div className="project-preview-actions">
      {project.isSnapshot?button('download-snapshot','下载快照','primary'):button('preview-continue','继续创作','primary')}
      {button('project-meta','作品信息与标签')}{button('project-delete','移到最近删除','danger')}
    </div>
  </div>;
}

export function SettingsHomePage({onAction}){
  const sections=[['AI 与创作','创作偏好与模型连接，分组查看','✣'],
    ['导入与识别','照片校正、背景板、识别默认值与自动整理','□'],
    ['界面与素材库','素材排列、卡片背景与显示方式','▦'],
    ['数据与诊断','备份、最近删除、生成诊断与完整上下文','▱']];
  const button=(name,label)=><button data-act={name} data-react-action="true" onClick={()=>onAction(name)}>{label}</button>;
  return <div className="settings-page" data-react-page="settings"><div className="settings-toolbar">
    {button('settings-back','返回')}{button('settings-save','保存')}
  </div><h1>设置</h1><section className="settings-list">
    {sections.map(([name,description,icon])=><button key={name} data-act="settings-open" data-val={name}
      data-react-action="true" onClick={()=>onAction('settings-open',null,name)}>
      <span className="settings-icon">{icon}</span><span><strong>{name}</strong><small>{description}</small></span><b>›</b>
    </button>)}
  </section><p className="settings-note">设置按使用场景归为四类。AI 设置保存在这台设备的当前浏览器中；作品和素材可在“数据与诊断”中导出备份。</p>
    <div className="actions"><button type="button" className="btn" data-act="help" data-react-action="true"
      onClick={()=>onAction('help')}>使用说明与故障排查</button></div>
  </div>;
}

export function SettingsDisplayPage({preferences,onAction}){
  return <div className="settings-page" data-react-page="settingsDisplay">
    <div className="settings-toolbar">
      <button data-act="settings-back" data-react-action="true" onClick={()=>onAction('settings-back')}>‹ 返回</button>
      <button data-act="settings-save" data-react-action="true" onClick={()=>onAction('settings-save')}>保存</button>
    </div><h1>界面与素材库</h1><section className="settings-detail">
      <section className="recognition-settings-group"><h2>素材排列</h2>
        <label>显示方式<select id="setting-display" defaultValue={preferences.display}>
          <option value="grid">网格</option><option value="list">列表</option>
        </select></label>
        <label>卡片背景<select id="setting-backdrop" defaultValue={preferences.backdrop}>
          <option value="auto">自动配色</option><option value="white">白色</option>
          <option value="transparent">透明</option>
        </select></label>
        <label>每页最多展示<select id="setting-page-items" defaultValue={String(preferences.maxPageItems)}>
          {[20,40,80].map(count=><option value={count} key={count}>每页 {count} 项</option>)}
        </select></label>
        <p>素材库只创建当前页卡片；系列和作品共用此设置。</p>
      </section>
    </section>
  </div>;
}

function SettingsDetailShell({title,onAction,children,kind}){
  return <div className="settings-page" data-react-page={kind}>
    <div className="settings-toolbar">
      <button data-act="settings-back" data-react-action="true" onClick={()=>onAction('settings-back')}>‹ 返回</button>
      <button data-act="settings-save" data-react-action="true" onClick={()=>onAction('settings-save')}>保存</button>
    </div><h1>{title}</h1><section className="settings-detail">{children}</section>
  </div>;
}
function SettingsSelect({id,label,value,choices,help}){
  return <label>{label}<select id={id} defaultValue={String(value)}>
    {choices.map(([key,name])=><option key={key} value={key}>{name}</option>)}
  </select>{help?<small className="setting-help">{help}</small>:null}</label>;
}
function SettingsToggle({id,label,checked,help}){
  return <label className="toggle-row setting-toggle"><span><b>{label}</b>
    <small className="setting-help">{help}</small></span>
    <input id={id} type="checkbox" defaultChecked={!!checked}/></label>;
}
function SettingsGroup({title,description,children}){
  return <section className="recognition-settings-group"><h2>{title}</h2>
    {description?<p>{description}</p>:null}{children}</section>;
}

export function SettingsRecognitionPage({preferences,onAction}){
  const p=preferences;
  const [recognitionMethod,setRecognitionMethod]=useState(p.recognition);
  const paperChoices=[...paperPresets.map(x=>[x.id,`${x.name} · ${x.width} × ${x.height} mm`]),
    ['custom','自定义尺寸']];
  const method=recognitionMethodDetails.find(x=>x.id===recognitionMethod);
  return <SettingsDetailShell title="导入与识别" kind="settingsRecognition" onAction={onAction}>
    <SettingsGroup title="素材识别方法" description="候选框算法决定素材数量与位置；Mask 算法再逐件细化透明边缘。">
      <SettingsSelect id="setting-candidate-discovery" label="候选框发现" value={p.candidateDiscovery||'unified'}
        choices={candidateDiscoveryOptions} help="默认“统一候选 + 自动”为新研究算法；选择“原版前景连通区域 + MorphGAC”可回到旧算法。"/>
      <label>Mask 分割<select id="setting-recognition" value={recognitionMethod}
        onChange={event=>setRecognitionMethod(event.target.value)}>
        {recognitionOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}
      </select><small data-recognition-method-note="" className="setting-help">{method?.description||'推荐使用默认 MorphGAC。'}</small></label>
    </SettingsGroup>
    <SettingsGroup title="1 · 纸张校正" description="检测纸张四角并透视拉正，为候选定位和真实尺寸提供坐标。">
      <SettingsSelect id="setting-paper-size" label="默认纸张"
        value={p.paperSize?.startsWith('custom:')?'custom':p.paperSize} choices={paperChoices}/>
      <SettingsSelect id="setting-orientation" label="校正方向" value={p.orientation||'auto'}
        choices={[["auto","自动"],["portrait","竖向"],["landscape","横向"]]}/>
      <SettingsToggle id="setting-whole-paper" label="未检测到纸边时使用整张图" checked={p.wholePaper}
        help="未找到纸边时按整张图估算尺寸；不会生成透视校正。"/>
    </SettingsGroup>
    <SettingsGroup title="2 · 素材数量与候选框" description="统一候选的整页分析图最长边为 900 px；所选算法决定素材数量与候选位置。有纸张尺寸时，自动结果过滤短边小于 9 mm 的实体，手动补框不受限。">
      <SettingsToggle id="setting-merge-carrier" label="合并共同载体" checked={p.mergeSharedCarrier!==false}
        help="同一浅色纸片上的图案视为一件；关闭后可尝试按独立图案拆分。"/>
    </SettingsGroup>
    <SettingsGroup title="3 · 单件边缘分割" description="亮度、去噪和对比度只作用于边界分割；Lab 色差边缘也会影响整页候选。">
      <SettingsSelect id="setting-recognition-pixels" label="边缘分析分辨率" value={p.recognitionPixels}
        choices={recognitionPixelOptions} help="统一候选固定使用 900 px；手动补框和非统一候选使用所选分辨率。最终从高清校正图提取。"/>
      <SettingsToggle id="setting-preprocess-light" label="亮度均衡" checked={p.balanceLight===true}
        help="仅用于单件分割，减轻明显光照不均；通常无需开启。"/>
      <SettingsToggle id="setting-preprocess-denoise" label="轻度去噪" checked={p.recognitionDenoise===true}
        help="图像噪点较多时开启。"/>
      <SettingsToggle id="setting-preprocess-contrast" label="局部对比增强" checked={p.recognitionLocalContrast===true}
        help="浅色边界不明显时尝试开启。"/>
      <SettingsToggle id="setting-preprocess-chroma" label="Lab 色差边缘" checked={p.recognitionChromaEdges!==false}
        help="以颜色差补充灰度边缘，推荐开启。"/>
    </SettingsGroup>
    <SettingsGroup title="4 · 轮廓后处理" description="控制非统一自动分割的形状与打孔后处理；默认算法使用内部形状仲裁，不读取以下两项开关。">
      <SettingsToggle id="setting-postprocess-shapes" label="规则形状规整" checked={p.recognitionShapeRegularization!==false}
        help="边缘证据充分时校直卡片或拟合圆形。"/>
      <SettingsToggle id="setting-postprocess-apertures" label="重复孔洞恢复" checked={p.recognitionApertures!==false}
        help="恢复有规律的活页孔；不挖除孤立白点。"/>
    </SettingsGroup>
    <SettingsGroup title="5 · 高清输出与颜色" description="由识别 Mask 提取高清素材；颜色还原不改变数量、边界或实际尺寸。">
      <SettingsSelect id="setting-material-color" label="素材颜色" value={p.materialColorMode==='original'?'original':'auto'}
        choices={[["auto","自动校正 A4 光照与色偏"],["original","保留照片颜色"]]}
        help="优先保留印刷与纸张原色；纸面参考不可靠时不校正。"/>
    </SettingsGroup>
    <SettingsGroup title="6 · 自动整理" description="保存成功后在后台整理标题与标签，不阻塞导入或创作。">
      <SettingsToggle id="setting-auto-organize" label="自动整理名称和标签" checked={p.autoOrganize}
        help="不会覆盖已手动修改的信息。"/>
      <SettingsToggle id="setting-auto-organize-works" label="自动整理作品" checked={p.autoOrganizeWorks!==false}
        help="导入作品和保存快照后自动整理标题、标签；无模型密钥时保留原信息。"/>
    </SettingsGroup>
  </SettingsDetailShell>;
}

function OfflineStorageStatus({state,cloudEnabled}){
  const [status,setStatus]=useState({shell:null,usage:null,quota:null,previews:null});
  const [clearing,setClearing]=useState(false);
  useEffect(()=>{let live=true;
    const check=()=>Promise.allSettled([
      typeof caches==='undefined'?Promise.resolve(false):caches.match('/').then(Boolean),
      navigator.storage?.estimate?.()||Promise.resolve(null),
      cloudEnabled?import('./store.js').then(store=>store.previewCacheBytes()):Promise.resolve(null)
    ]).then(([shell,estimate,previews])=>{
      if(!live)return;
      const space=estimate.status==='fulfilled'?estimate.value:null;
      setStatus({shell:shell.status==='fulfilled'&&!!navigator.serviceWorker?.controller?shell.value:false,
        usage:Number.isFinite(space?.usage)?space.usage:null,
        quota:Number.isFinite(space?.quota)?space.quota:null,
        previews:previews.status==='fulfilled'?previews.value:null});
    });
    void check();
    navigator.serviceWorker?.addEventListener?.('controllerchange',check);
    return()=>{live=false;navigator.serviceWorker?.removeEventListener?.('controllerchange',check);};
  },[cloudEnabled]);
  const format=value=>value===null?'未知':`${(value/1024/1024).toFixed(1)} MB`;
  const clear=async()=>{
    if(clearing)return;
    setClearing(true);
    try{const store=await import('./store.js'),result=await store.clearPreviewCache();
      const space=await (navigator.storage?.estimate?.()||Promise.resolve(null)).catch(()=>null);
      setStatus(previous=>({...previous,previews:0,
        usage:Number.isFinite(space?.usage)?space.usage:previous.usage,
        quota:Number.isFinite(space?.quota)?space.quota:previous.quota}));
      alert(`已清理 ${result.count} 份低清封面缓存，约 ${format(result.bytes)}。联网后会按需重新下载。`);
    }catch(error){alert('封面缓存暂时无法清理：'+error.message);}
    finally{setClearing(false);}
  };
  return <SettingsGroup title="本机与离线状态">
    <p id="offline-state">应用页面：{status.shell===null?'正在检查':status.shell?'已缓存，可尝试离线打开':'尚未确认完整缓存，需要联网打开'}</p>
    <p>当前账号本机索引：素材 {state.assets.length} 件，作品 {state.projects.length} 件。{cloudEnabled?'云端尚未下载的记录和图片，离线时可能不可用。':'此浏览器是当前资料的保存位置。'}</p>
    <p>本机站点已用空间：{format(status.usage)}；浏览器估计可用额度：{format(status.quota)}。图片是否可离线查看，以打开时的本机缓存为准。</p>
    {cloudEnabled?<><p>可重新下载的低清封面缓存：{format(status.previews)}。清理后离线时可能暂时看不到这些封面；本机待同步修改和原图不会清除。</p>
      <button type="button" className="btn" disabled={clearing||!(status.previews>0)} onClick={clear}>清理低清封面缓存</button></>:null}
  </SettingsGroup>;
}

export function SettingsDataPage({state,cloudEnabled,storage,onAction}){
  const [diagnostics,setDiagnostics]=useState(null);
  const counts=`素材 ${state.assets.length} 件 · 作品 ${state.projects.length} 件 · 最近删除 ${state.trash.length} 项`;
  const button=(name,label,kind='btn')=><button className={kind} data-act={name} data-react-action="true"
    onClick={()=>onAction(name)}>{label}</button>;
  const backup=<SettingsGroup title="完整备份"><div className="actions">
    {button('backup','导出完整备份','btn primary')}{button('restore','从备份恢复')}
  </div>{cloudEnabled?<p>只接受拾页现行完整备份格式；恢复会替换当前资料。</p>:null}
    {state.selfHosted&&!cloudEnabled?<p>恢复会替换服务器当前全部数据；执行前请先导出一份当前完整备份。</p>:null}
  </SettingsGroup>;
  const trash=<SettingsGroup title="最近删除">{state.trash.length?state.trash.map(item=><div className="rec-card" key={item.id}>
    <b>{item.item.title}</b><button className="btn mini" data-act="restore-trash" data-id={item.id}
      data-react-action="true" onClick={()=>onAction('restore-trash',item.id)}>恢复</button>
    <button className="btn danger mini" data-act="purge-trash-item" data-react-action="true"
      onClick={()=>onAction('purge-trash-item',item.id)}>彻底删除</button>
  </div>):<p>没有最近删除的项目。</p>}</SettingsGroup>;
  return <SettingsDetailShell title="数据与诊断" kind="settingsData" onAction={onAction}>
    <SettingsGroup title="应用错误诊断" description="导出最近 7 天本机记录的运行错误、网络与同步故障安全摘要，包含发生页面、阶段、错误类别和可判断的原因。不会导出作品、图片、账号、密钥或原始报错文本。">
      {button('export-app-diagnostics','导出完整错误诊断')}
    </SettingsGroup>
    <SettingsGroup title="图片保留与清理" description="删除素材后，素材记录会从素材库隐藏，已有作品仍可引用；最近删除到期仅移除恢复入口。云端 COS 孤立文件经复核后延迟回收。"/>
    <SettingsGroup title="数据维护"><div className="actions">
      <button type="button" className="btn" onClick={()=>setDiagnostics('metrics')}>生成诊断</button>
      <button type="button" className="btn" onClick={()=>setDiagnostics('contexts')}>创作完整上下文</button>
      {button('clean-unused-images','清理未使用的图片')}
      {button('purge-all-trash','清空最近删除','btn danger')}
    </div></SettingsGroup>
    {cloudEnabled?<>
      <SettingsGroup title="私人云端资料">
        <p id="storage-location">{import.meta.env?.VITE_SHIYE_OBJECT_STORAGE==='cos'?'当前数据源：Supabase 登录与元数据 + 腾讯 COS 私有图片；本机仅保留账号隔离缓存与待同步修改':'当前数据源：Supabase 私有云端；本机仅保留账号隔离缓存与待同步修改'}</p><p>{counts}</p>
        <p>登录验证后显示本机缓存，后台检查云端更新。原图和完整作品按需读取；修改先暂存，后台同步。云端失败不会改用另一份资料。</p>
      </SettingsGroup>
      {backup}
      <SettingsGroup title="离线应急备份">
        <p>仅保存本机尚未上传云端的修改和原始字节，不包含已同步的完整素材库；网络故障时也可导出。应急包只能恢复到原账号，恢复后重新打开拾页再同步。</p>
        <div className="actions">{button('backup-emergency','导出本机待同步修改')}
          {button('restore-emergency','恢复待同步应急包')}</div>
      </SettingsGroup>
      <SettingsGroup title="并发冲突恢复">
        <p>同一画布在两台设备同时修改时，会在应用最后编辑时间规则之前保留双方原稿。本机留有记录时可将旧版本另存为新作品。</p>
        {button('recover-pre-conflict','查看与恢复冲突前画布')}
      </SettingsGroup>
      <SettingsGroup title="危险操作 · 清除所有数据">
        <p>同时永久删除当前账号的云端作品、素材、系列、私有图片和最近删除，并删除此设备的本地缓存、待同步队列和设置。保留登录账号本身；其他设备原有的离线缓存须在升级后重新检查。无法恢复。</p>
        {button('reset-all-account-data','彻底清空本账号本机与云端数据','btn danger')}
      </SettingsGroup>
    </>:state.selfHosted?<>
      <SettingsGroup title="唯一数据源 · 4090 服务器">
        <p id="storage-location">{location.origin}</p><p>{counts}</p>
        <p>此网址的素材、作品与图片都写入服务器。浏览器只保存访问令牌和 AI 设置；服务器无法连接时不会写入另一份资料。</p>
        <label>更新访问令牌<input id="data-server-token" type="password" autoComplete="off" placeholder="保持不变则留空"/></label>
        {button('storage-token','验证并更新令牌')}
      </SettingsGroup>
      {backup}{trash}
    </>:<>
      <SettingsGroup title="数据位置">
        <p id="storage-location">{storage?.url?`已配置服务器：${storage.url}`:'此网址当前使用浏览器本机存储；访问其他网址不会自动同步。'}</p>
        <p>{counts}</p>
        <label>4090 数据服务地址<input id="data-server-url" type="url" placeholder="https://你的数据域名" defaultValue={storage?.url||''}/></label>
        <label>访问令牌<input id="data-server-token" type="password" autoComplete="off" defaultValue={storage?.token||''}/></label>
        <div className="actions">{button('storage-connect','连接服务器','btn primary')}
          {button('storage-browser','改用此浏览器资料')}</div>
        <p>服务器地址需要公网 HTTPS，手机访问 localhost 指的是手机自身；同一台电脑运行的拾页服务可直接打开 http://127.0.0.1:4173。跨数据源转移资料请使用下方“导出完整备份 / 从备份恢复”，不在连接动作中隐式迁移。</p>
      </SettingsGroup>
      {backup}{trash}
    </>}
    <OfflineStorageStatus state={state} cloudEnabled={cloudEnabled}/>
    {diagnostics?<SettingsDiagnosticsDialog kind={diagnostics}
      accountID={state.accountId||'browser'} onClose={()=>setDiagnostics(null)}/>:null}
  </SettingsDetailShell>;
}

function AIToggle({id,label,checked,onChange}){
  return <label className="toggle-row">{label}<input id={`setting-ai-${id}`} type="checkbox"
    {...(onChange?{checked:!!checked,onChange}:{defaultChecked:!!checked})}/></label>;
}
function AISelect({id,label,value,choices,onChange}){
  return <label>{label}<select id={`setting-ai-${id}`}
    {...(onChange?{value:String(value),onChange}:{defaultValue:String(value)})}>
    {choices.map(([key,name])=><option key={key} value={key}>{name}</option>)}
  </select></label>;
}
function AINumber({id,label,value,min,max,step}){
  return <label>{label}<input id={`setting-ai-${id}`} type="number" min={min} max={max}
    step={step} defaultValue={value}/></label>;
}

export function SettingsAIPage({settings,preferences,onAction}){
  const cfg=settings;
  const [provider,setProvider]=useState(cfg.provider);
  const [endpoint,setEndpoint]=useState(cfg.endpoint);
  const [modelID,setModelID]=useState(cfg.model);
  const [modelChoice,setModelChoice]=useState(()=>AI_PROVIDERS[cfg.provider].models.some(([id])=>id===cfg.model)?cfg.model:'__custom__');
  const [key,setKey]=useState(cfg.key);
  const [keys,setKeys]=useState({...cfg.keys,[cfg.provider]:cfg.key});
  const preset=AI_PROVIDERS[provider];
  const chooseProvider=event=>{
    const next=event.target.value,entry=AI_PROVIDERS[next];
    setKeys(current=>({...current,[provider]:key}));
    setProvider(next);setEndpoint(entry.endpoint);setModelID(entry.models[0]?.[0]||'');
    setModelChoice(entry.models[0]?.[0]||'__custom__');setKey(keys[next]||'');
  };
  const editEndpoint=event=>{
    setEndpoint(event.target.value);
    if(provider!=='custom'){setProvider('custom');setModelChoice('__custom__');}
  };
  const chooseModel=event=>{
    const next=event.target.value;
    setModelChoice(next);
    if(next!=='__custom__')setModelID(next);
  };
  const editModel=event=>{setModelID(event.target.value);setModelChoice('__custom__');};
  const vision=supportsVision({provider,endpoint,model:modelID});
  return <SettingsDetailShell title="AI 与创作" kind="settingsAI" onAction={onAction}>
    <section className="ai-settings-group unified-settings-group"><h2>创作偏好</h2>
      <AISelect id="delivery" label="创作方式" value={cfg.deliveryMode==='image'?'tools':cfg.deliveryMode}
        choices={DELIVERY_OPTIONS.filter(([id])=>id!=='image')}/>
      <p>可让 AI 返回可编辑作品；网页任务包会附上素材预览和创作说明。</p>
      <AIToggle id="require-all" label="候选素材必须全部使用" checked={cfg.requireAllCandidates}/>
      <AIToggle id="auto-recommendations" label="把建议搭配加入候选素材" checked={cfg.autoIncludeRecommendations}/>
      <AIToggle id="structure-reference" label="参考样例的图文结构" checked={cfg.includeStructureReference}/>
      <AIToggle id="send-reference" label="发送匹配风格与用途的手帐案例" checked={cfg.sendPresetReferences}/>
      <label>补充版式指导<textarea id="setting-ai-layout-prompt" placeholder="留空使用默认指导"
        defaultValue={cfg.customLayoutPrompt}/></label>
    </section>
    <section className="ai-settings-group unified-settings-group" id="ai-model-group"><h2>模型与连接</h2>
      <AISelect id="provider" label="服务商" value={provider}
        choices={Object.entries(AI_PROVIDERS).map(([id,entry])=>[id,entry.label])} onChange={chooseProvider}/>
      <label>API 地址<input id="setting-ai-endpoint" type="url" value={endpoint}
        onChange={editEndpoint} placeholder="https://…/chat/completions"/></label>
      <AISelect id="model" label="模型" value={modelChoice} onChange={chooseModel}
        choices={[...preset.models.map(([id,name])=>[id,name]),['__custom__','自定义模型 ID']]}/>
      <label id="setting-ai-custom-model-row">模型 ID
        <input id="setting-ai-custom-model" value={modelID} onChange={editModel}/></label>
      <label>API 密钥<input id="setting-ai-key" type="password" autoComplete="off"
        value={key} onChange={event=>{setKey(event.target.value);setKeys(current=>({...current,[provider]:event.target.value}));}} placeholder="API Key"/></label>
      <input id="setting-ai-provider-keys" type="hidden" value={JSON.stringify(keys)}/>
      <p>{vision?'所选模型支持图片输入，创作时自动发送素材封面。':'所选模型按纯文字输入处理，创作时发送素材信息。'}密钥仅保存在本浏览器。</p>
      <AINumber id="temperature" label="创意程度 0–2" value={cfg.temperature} min="0" max="2" step="0.05"/>
      <AINumber id="timeout" label="连续无响应超时（秒）" value={cfg.requestTimeout} min="20" max="180"/>
    </section>
  </SettingsDetailShell>;
}

export function ImportSimplePage({state,onAction}){
  const button=(name,label,value,kind='btn')=><button className={kind} data-act={name} data-val={value}
    data-react-action="true" onClick={()=>onAction(name,null,value)}>{label}</button>;
  const isDone=state.importStep==='done';
  const kind=state.importMode==='work'?'作品':state.importMode==='snapshot'?'快照':'素材';
  const destination=state.importMode==='work'||state.importMode==='snapshot'?'作品':'素材库';
  const needsManualCheck=state.importMode==='material'&&state.preferences.autoOrganize&&
    !(state.aiSettings?.key&&supportsVision(state.aiSettings));
  return <><ImportNavigation state={state} onAction={onAction}/>{isDone?<section className="import-done" aria-labelledby="import-done-title"><div className="import-done-card">
    <div className="import-done-icon" aria-hidden="true">✓</div><h1 id="import-done-title">导入完成</h1>
    <p className="import-done-count">已导入 <strong>{state.importSavedCount||0}</strong> 个{kind}</p>
    <p className="import-done-message">{state.importPending?'内容已安全暂存。云端同步将在后台完成，可以放心返回继续使用。':'内容已经保存。你可以返回查看，也可以继续添加下一批照片。'}</p>
    {needsManualCheck?<p className="import-done-helper">视觉自动整理尚未启用，素材已保留待检查。稍后可在设置中开启。</p>:null}
    <div className="review-actions import-done-actions">{button('import-exit',`返回${destination}`)}{button('import-continue','继续导入',null,'btn primary')}</div>
  </div></section>:<section className="import-intro"><div className="eyebrow">FROM YOUR DESK TO YOUR PAGES</div>
    <h1>{state.importMode==='work'?'收进完成的作品':'先认出纸，再留住喜欢的'}</h1>
    <p>从相册多选，逐张确认纸张和{state.importMode==='work'?'页面':'素材'}。</p>
    <div className="import-empty"><div className="photo-symbol">▧</div><h2>添加照片</h2>
      <p>从相册多选，或拍摄一张白纸上的素材。</p>
      <div className="import-source-actions">
        {button('select-file','▣　从图库中选择','gallery','btn primary')}
        {button('select-file','▣　拍摄图片','camera')}
        {button('select-file','▱　从文件中导入','files')}
        {state.importMode==='work'?<small>选择可编辑 JSON 作品文件会直接导入，不经过照片识别。</small>:null}
      </div><small>每批最多 12 张；使用较小图像识别，从原始工作图提取素材</small>
    </div>
  </section>}</>;
}

function ImportNavigation({state,onAction}){
  const steps=[['inspect','检查照片'],['review','确认归类'],['done','完成']];
  const index=steps.findIndex(([key])=>key===state.importStep);
  return <div className="import-nav" aria-label="导入进度">
    <button className="import-back" data-act="import-back" data-react-action="true"
      aria-label="返回上一步" title="返回" onClick={()=>onAction('import-back')}/>
    <div className="import-nav-center"><div className="import-progress" aria-label="当前步骤">
      {steps.map(([key,label],i)=><span key={key} className={state.importStep===key?'current':i<index?'passed':''}>
        <b>{i<index?'✓':i+1}</b><span className="import-step-label">{label}</span>
      </span>)}
    </div></div>
    <button className="import-cancel" data-act="import-exit" data-react-action="true"
      onClick={()=>onAction('import-exit')}>{state.importStep==='done'?'完成':'取消导入'}</button>
  </div>;
}

export function ImportInspectionPage({state,format,onAction,onSettingChange,
  onRecognitionSettingChange,onRemoveRecord,onCheckCandidate,onManualCancel,onManualDone,onManualError,onPaperChange}){
  const [,setRevision]=useState(0);
  useEffect(()=>{
    const refresh=()=>setRevision(value=>value+1);
    window.addEventListener('shiye-import-refresh',refresh);
    return ()=>window.removeEventListener('shiye-import-refresh',refresh);
  },[]);
  const previewRef=useRef(null);
  const snapshot=state.importMode==='snapshot',previewing=!!state.showCorrectionPreview,manual=!!state.showManualBox;
  const source=manual?state.correctedURL||state.importURL:previewing?state.paperPreviewURL||state.correctedURL:state.importURL;
  const candidates=state.importProcessing?[]:state.importCandidates||[];
  const busy=!!state.importProcessing;
  const button=(action,label,disabled=false,kind='btn')=><button className={kind} data-act={action} data-react-action="true" disabled={busy||disabled} onClick={()=>onAction(action)}>{label}</button>;
  return <><ImportNavigation state={state} onAction={onAction}/>
    <section className={`import-inspect ${snapshot?'import-snapshot-inspect':''}`} data-react-page="importInspection" aria-busy={!!state.importProcessing}>
      {!snapshot?<div className="eyebrow">FROM YOUR DESK TO YOUR PAGES</div>:null}<h1>检查这一批</h1>
      {!snapshot?<p>逐张确认，最后一起归类。</p>:null}<p className="import-processing" role="status">{state.importProcessing||''}</p>
      <div className="import-queue"><div><strong>{state.importRecords.length} 张照片</strong> <small>{state.importRecords.filter(record=>record.confirmed).length} 张已确认</small></div>
        <button className="btn" data-act="select-file" data-val="gallery" data-react-action="true" onClick={()=>onAction("select-file",null,"gallery")} disabled={state.importRecords.length>=12}>＋ 添加照片</button></div>
      <div className="queue-strip">{state.importRecords.map((record,index)=><div key={index} className="queue-card"><button className={`queue-item ${index===state.importIndex?'active':''}`}
        data-act="import-switch" data-id={index} data-react-action="true" onClick={()=>onAction("import-switch",String(index))}><img src={record.url} alt=""/><span>照片 {index+1}<small>{record.confirmed?'已确认':snapshot?'待检查':record.prefetchStatus==='running'?'后台识别中':record.prefetchStatus==='ready'?`${record.candidates.length} 件已预识别`:record.candidates?.length?`${record.candidates.length} 件素材`:'待识别'}</small></span></button>
        <button type="button" className="queue-remove" aria-label={`移除照片 ${index+1}`}
          onClick={()=>onRemoveRecord(index)}>移除</button></div>)}</div>
      <div className="inspect-columns"><section className="panel import-preparation"><h2>照片 {state.importIndex+1}</h2><div className="photo-preparation-content">
        <h3>{previewing?'查看校正结果':snapshot?'调整页面边框':'选择画面范围'}</h3>
        {!snapshot?<p>{previewing?'检查边缘和文字方向，必要时返回调整。':'拖动四角贴合纸张边缘；双页请框住整个跨页。'}</p>:null}
        <div className="photo-preview" id="crop-preview" ref={previewRef}><img src={source} alt={snapshot?'页面预览':previewing?'校正结果':'待检查照片'}/><div id="crop-frame" hidden/>{!manual&&!previewing&&!busy&&state.importFile?<PaperCorrection key={`${state.importIndex}-${state.importURL}`} state={state} previewRef={previewRef} onChange={onPaperChange}/>:null}</div>
        {manual?<ManualBoxEditor state={state} previewRef={previewRef} onCancel={onManualCancel}
          onDone={onManualDone} onError={onManualError}/>:<div className="import-photo-tools">{previewing?<>{button('readjust-paper','重新调整')}{button('apply-paper-preview',state.paperPreviewApplied?'✓ 已应用校正':'✓ 使用校正结果',!!state.paperPreviewApplied)}</>:
          <>{button('rotate-photo','↻ 旋转 90°')}{button('preview-crop',snapshot?'□ 预览校正':'□ 预览校正')}</>}
          {!snapshot?button('manual-import-box','手动补框',false,'btn primary'):null}</div>}
      </div></section>
      <section className="panel import-inspector"><h2>{snapshot?'页面与颜色校正':state.importMode==='work'?'检查作品图层':'检查识别结果'}</h2>
        {!snapshot?<><p>校正后自动识别；如有漏检，使用左侧的“手动补框”。</p><hr/></>:null}
        <div className="inspector-scroll"><div className="inspector-settings">
          <label>{snapshot?'页面规格':'当前照片的背景板'}<select id="paper-size" disabled={busy} value={state.paperSize?.startsWith('custom:')?'custom':state.paperSize} onChange={event=>onSettingChange('paperSize',event.target.value)}><PaperSizeOptions includeNone/></select></label>
          {state.paperSize==='custom'?<div className="import-custom-size"><label>宽 mm<input id="import-paper-width" type="number" min="1" max="10000" defaultValue={state.customImportWidth} onBlur={event=>onSettingChange('customImportWidth',event.target.value)}/></label>
            <label>高 mm<input id="import-paper-height" type="number" min="1" max="10000" defaultValue={state.customImportHeight} onBlur={event=>onSettingChange('customImportHeight',event.target.value)}/></label></div>:null}
          {(snapshot||state.paperSize!=='none')?<><label>{snapshot?'页面方向':'纸张方向'}<select id="paper-orientation" disabled={busy} value={state.paperOrientation||'auto'} onChange={event=>onSettingChange('paperOrientation',event.target.value)}>
            <option value="auto">自动</option><option value="portrait">竖向</option><option value="landscape">横向</option></select></label>
            <label className="toggle-row">{snapshot?'校正白纸色偏':'识别前均衡光照'}<input id="balance-light" type="checkbox" disabled={busy} checked={!!state.balanceLight} onChange={event=>onRecognitionSettingChange('balanceLight',event.target.checked)}/></label>
            {!snapshot?<><label className="toggle-row">规则形状规整<input id="import-shape-regularization" type="checkbox" disabled={busy} checked={state.importShapeRegularization!==false} onChange={event=>onRecognitionSettingChange('importShapeRegularization',event.target.checked)}/></label>
              <label className="toggle-row">恢复重复孔洞<input id="import-apertures" type="checkbox" disabled={busy} checked={state.importApertures!==false} onChange={event=>onRecognitionSettingChange('importApertures',event.target.checked)}/></label>
              <label>最终素材颜色<select id="import-material-color" disabled={busy} value={state.importMaterialColorMode==='original'?'original':'auto'} onChange={event=>onRecognitionSettingChange('importMaterialColorMode',event.target.value)}><option value="auto">A4 光照与颜色还原</option><option value="original">原始照片颜色</option></select><small>仅影响高清输出，不改变数量与分割边缘。</small></label>
              <label className="toggle-row">未识别时将整张照片视为背景板<input id="whole-paper" type="checkbox" disabled={busy} checked={!!state.wholePaper} onChange={event=>onSettingChange('wholePaper',event.target.checked)}/></label></>:null}</>:null}
          {!snapshot?<><small>{state.paperSize==='none'?'当前照片不计算素材尺寸':'尺寸变化仅更新标尺；不重新抠图'}</small>
            <button className="import-default-action" id="save-import-defaults" type="button" onClick={()=>onAction("import-save-defaults")}>将当前参数设为以后导入的默认值</button>
            <small>设为默认值会同步本批后续照片，并用于以后新导入的照片；之前的照片不变。</small></>:null}
        </div>{!snapshot?<><hr/><h3>候选素材 · {state.importProcessing?'识别中':candidates.length}</h3>
          {button('recognition-diagnostics','导出识别诊断',false,'btn mini')}
          <div className="import-candidate-grid">{candidates.map((candidate,index)=><div key={index} className="candidate-choice"><button className={`import-candidate-tile ${state.importCandidateSelection?.has(index)?'selected':''}`}
            data-act="import-toggle-candidate" data-id={index} data-react-action="true"
            aria-pressed={!!state.importCandidateSelection?.has(index)} onClick={()=>onAction('import-toggle-candidate',String(index))}><span className="candidate-thumb"><img src={state.importCandidateURLs?.[index]||''} alt=""/></span>
            <span>素材 {index+1} {state.importCandidateSelection?.has(index)?'✓':'○'}</span><small>{state.importCandidateData?.[index]?.width?`${format(state.importCandidateData[index].width)} × ${format(state.importCandidateData[index].height)} mm`:'尺寸待检查'}</small></button>
            <button className="btn mini" data-import-check={index} disabled={busy} onClick={()=>onCheckCandidate(index)}>检查边缘</button></div>)}</div></>:null}</div>
        <button className="btn primary confirm-photo" data-act="import-confirm-photo" data-react-action="true" onClick={()=>onAction("import-confirm-photo")} disabled={busy}>→ 确认</button>
      </section></div>
    </section></>;
}

function ReviewSeriesSelect({value='',recordIndex=null,seriesOptions,onSeriesChange}){
  const [selected,setSelected]=useState(value);
  const change=async event=>{
    const next=event.target.value;
    if(next!=='__new__')setSelected(next);
    const accepted=await onSeriesChange(recordIndex,next);
    if(next==='__new__')setSelected(accepted??selected);
  };
  return <select id={recordIndex===null?'batch-series':undefined}
    className={recordIndex===null?undefined:'record-series'}
    data-index={recordIndex===null?undefined:recordIndex} value={selected} onChange={change}>
    {seriesOptions(recordIndex!==null)}
  </select>;
}

export function ImportReviewPage({state,format,onAction,onSeriesChange,onWorkTitleChange,
  onEditCandidate,onCheckCandidate,onError}){
  const [dialog,setDialog]=useState(null);
  const [,setRevision]=useState(0);
  const press=useRef(null);
  const suppressClick=useRef(false);
  const clearPress=()=>{if(press.current?.timer)clearTimeout(press.current.timer);press.current=null;};
  useEffect(()=>clearPress,[]);
  const openMenu=(event,ri,ci)=>{event?.preventDefault();clearPress();setDialog({ri,ci});};
  const pointerDown=(event,ri,ci)=>{
    if(event.pointerType==='mouse'||event.button>0)return;
    clearPress();
    const start={x:event.clientX,y:event.clientY};
    press.current={...start,timer:setTimeout(()=>{suppressClick.current=true;
      setDialog({ri,ci});press.current=null;},600)};
  };
  const pointerMove=event=>{
    if(press.current&&Math.hypot(event.clientX-press.current.x,
      event.clientY-press.current.y)>8)clearPress();
  };
  const mode=state.importMode,work=mode==='work',snapshot=mode==='snapshot',records=state.importRecords||[];
  const count=records.reduce((total,record)=>total+(record.selectedCandidates||[]).filter(c=>c.selected).length,0);
  const seriesOptions=(record=false)=><>
    <option value="__new__">＋ 新建系列…</option>
    <option value="">{record?'沿用本批默认':'不归入系列'}</option>
    {record?<option value="__none__">不归入系列</option>:null}
    {work?<option value="__no_library__">不归入素材库</option>:null}
    {state.series.map(series=><option key={series.id} value={series.id}>{series.title}</option>)}
  </>;
  const action=(name,id,value)=>()=>onAction(name,id,value);
  return <><ImportNavigation state={state} onAction={onAction}/>
    {dialog&&records[dialog.ri]?.selectedCandidates?.[dialog.ci]?<ImportCandidateDialog
      key={`${dialog.ri}:${dialog.ci}`} candidate={records[dialog.ri].selectedCandidates[dialog.ci]}
      recordIndex={dialog.ri} candidateIndex={dialog.ci}
      onClose={()=>setDialog(null)} onToggle={(ri,ci)=>onAction('review-toggle',String(ri),String(ci))}
      onSave={onEditCandidate} onCheck={onCheckCandidate} onError={onError}/>:null}
    <section className="import-review" data-react-page="importReview">
      <h1>{snapshot?'确认导入快照':work?'确认导入作品':'确认要保存的素材'}</h1>
      <div className="review-actions">
        <button className="btn" data-act="import-back" data-react-action="true"
          onClick={action('import-back')}>‹ 返回检查照片</button>
        <button className="btn primary" data-act="confirm-import" data-react-action="true"
          disabled={!snapshot&&!work&&!count} onClick={action('confirm-import')}>
          保存 {snapshot?`${records.length} 个快照`:work?`${records.length} 个作品`:`${count} 个素材`}
        </button>
      </div>
      {!snapshot?<div className="review-default"><strong>本批默认归类</strong>
        <ReviewSeriesSelect value={state.importBatchSeriesID||''} seriesOptions={seriesOptions}
          onSeriesChange={onSeriesChange}/></div>:null}
      {records.map((record,ri)=>{
        const pattern=record.workPaperPattern||state.importBatchWorkPaperPattern||'plain';
        const color=record.workPaperColor||state.importBatchWorkPaperColor||'#fcfaf0';
        const columns=record.workPaperColumns===true||pattern==='columns';
        const candidates=record.selectedCandidates||[];
        return <div className="review-record" key={ri}>
          <div className="review-record-head"><img src={record.correctedURL||record.url} alt=""/>
            <div><h2>照片 {ri+1}</h2>{snapshot?null:<small>{candidates.filter(c=>c.selected).length} 个已选素材</small>}</div>
            <span>✓ 已确认</span>
          </div>
          {work?<label>作品名称<input className="record-work-title" data-index={ri}
            defaultValue={record.workTitle||record.file.name.replace(/\.[^.]+$/,'')}
            onInput={event=>onWorkTitleChange(ri,event.currentTarget.value)}/></label>:null}
          {!snapshot?<label className="record-series-label">所属系列
            <ReviewSeriesSelect value={record.seriesID??''} recordIndex={ri}
              seriesOptions={seriesOptions} onSeriesChange={onSeriesChange}/>
          </label>:null}
          <div className="review-candidates">
            {snapshot?<div className="review-candidate selected review-snapshot"><div className="review-thumbnail">
              <img src={record.correctedURL||record.url} alt="校正后完整页面"/>
            </div></div>:<>
              {work?<div className="review-candidate review-background-card"><div className={`review-thumbnail import-work-paper-preview ${pattern==='columns'?'plain':pattern} ${columns?'has-columns':''}`}
                style={{'--review-paper':color,backgroundColor:color}}>
                <div className="review-paper-controls" aria-label="页面背景">
                  <select id={`review-background-pattern-${ri}`} aria-label="底纸样式" value={pattern==='columns'?'plain':pattern}
                    onChange={event=>{record.workPaperPattern=event.target.value;setRevision(value=>value+1);}}>
                    {[['plain','纯色'],['grid','方格'],['lines','横线'],['dots','点阵']].map(([value,label])=><option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" data-import-paper-columns={ri} aria-pressed={columns}
                    onClick={()=>{record.workPaperColumns=!columns;if(pattern==='columns')record.workPaperPattern='plain';setRevision(value=>value+1);}}>{columns?'双栏':'单栏'}</button>
                  <input id={`review-background-color-${ri}`} type="color" aria-label="底纸颜色" value={color}
                    onChange={event=>{record.workPaperColor=event.target.value;setRevision(value=>value+1);}}/>
                </div>
              </div></div>:null}
              {candidates.map((candidate,ci)=><div className={`review-candidate ${candidate.selected?'selected':''}`}
                data-index={ri} data-candidate={ci} key={ci} tabIndex={0}
                onContextMenu={event=>openMenu(event,ri,ci)}
                onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')openMenu(event,ri,ci);}}
                onPointerDown={event=>pointerDown(event,ri,ci)} onPointerMove={pointerMove}
                onPointerUp={clearPress} onPointerCancel={clearPress}
                onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}>
                <button data-act="review-toggle" data-id={ri} data-val={ci} data-react-action="true"
                  aria-label={`${candidate.title}，${candidate.selected?'已选择':'未选择'}`}
                  onClick={action('review-toggle',String(ri),String(ci))}>
                  <div className="review-thumbnail"><img src={candidate.url} alt=""/>
                    <span className="check" aria-hidden="true">{candidate.selected?'✓':''}</span></div>
                  <strong>{candidate.title||`素材 ${ci+1}`}</strong>
                  <small>{candidate.width&&candidate.height?`${format(candidate.width)} × ${format(candidate.height)} mm`:
                    candidate.selected?'将保存':'不保存'}</small>
                </button>
              </div>)}
            </>}
          </div>
        </div>;
      })}
    </section>
  </>;
}
