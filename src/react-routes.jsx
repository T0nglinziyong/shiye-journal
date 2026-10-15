import React,{useEffect,useState} from 'react';
import {AI_PROVIDERS,supportsVision} from './ai-settings.js';
import {seriesContentsModel} from './series-contents.js';
import {paperPresets} from './paper-sizes.js';
import {candidateDiscoveryOptions,recognitionOptions,recognitionPixelOptions,
  recognitionMethodDetails} from './recognition-profiles.js';
import {DELIVERY_OPTIONS} from './ai-delivery.js';
import {IMAGE_MODELS} from './ai-image-generation.js';
import {matchingViewModel} from './matching-view.js';
import {styleGroups,purposeGroups} from './matching-directions.js';
import {visualStyles} from './creative-style-brief.js';
import {FabricSceneStage} from './fabric-scene-stage.jsx';
import {FabricEditorToolbar,FabricHeaderMenu} from './fabric-editor-controls.jsx';
import {FabricPageViewport} from './fabric-page-viewport.jsx';
import {SceneCover} from './scene-cover.jsx';

function RouteImage({asset,source,priority=false}){
  const src=asset&&(source(asset.blobId)||asset.staticPath);
  return src?<img data-asset-image-id={asset.id} loading={priority?'eager':'lazy'}
    fetchPriority={priority?'high':undefined} decoding="async" src={src} alt={asset.title}/>:<span>无预览</span>;
}

function DetailLinkIcon({kind}){
  const lines=kind==='folder'?<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>
    :kind==='search'?<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>
    :<><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/><path d="m19 17 .5 1.5L21 19l-1.5.5L19 21l-.5-1.5L17 19l1.5-.5z"/></>;
  return <span className="detail-link-icon"><svg className="shiye-icon" viewBox="0 0 24 24"
    width="25" height="25" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{lines}</svg></span>;
}

function PageHeading({title}){
  return <div className="view-head unified-page-heading"><div className="unified-heading-copy">
    <span className="eyebrow">FROM YOUR DESK TO YOUR PAGES</span><h1>{title}</h1>
  </div><div className="actions"/></div>;
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

export function LibraryPage({state,items,source,kindName,format,onAction}){
  const kinds=['sticker','paper','tape','photo','text','reference'];
  const status=[['all','全部状态'],['ready','已整理'],['pendingReview','未整理'],['used','已使用'],
    ['unused','未使用'],['inside','系列中'],['outside','系列外']];
  const sorts=[['newest','添加时间 · 降序'],['oldest','添加时间 · 升序'],
    ['name','名称 · 升序'],['name-desc','名称 · 降序']];
  return <><div className="catalog-toolbar"><PageHeading title="我的素材"/>
    <div className="filters">
      <input id="search" type="search" placeholder="搜索名称、标签、颜色或主题"
        defaultValue={state.query} aria-label="搜索素材"/>
      <select id="kind-filter" defaultValue={state.kind}><option value="all">全部类型</option>
        {kinds.map(kind=><option key={kind} value={kind}>{kindName(kind)}</option>)}</select>
      <select id="status-filter" defaultValue={state.status}>{status.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <select id="series-filter" defaultValue={state.seriesID}><option value="all">全部系列</option><option value="none">系列外</option>
        {state.series.map(entry=><option key={entry.id} value={entry.id}>{entry.title}</option>)}</select>
      <select id="sort-filter" defaultValue={state.sort}>{sorts.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <span className="library-count"/>
    </div></div>
    <div className={`grid asset-grid ${state.preferences.display==='list'?'list-grid':''}`}>
      <button className="card action-card" data-act="import" data-react-action="true" onClick={()=>onAction('import')}>
        <div className="card-image">＋</div><div className="card-body"><h3>导入素材</h3><p>添加照片或文件</p></div>
      </button>
      {items.map(asset=>{
        const revision=JSON.stringify([asset.title,asset.kind,asset.physicalWidthMM,asset.physicalHeightMM,
          asset.reviewStatus,asset.isFavorite,asset.blobId]);
        return <button key={asset.id} className="card" data-card-revision={revision} data-act="detail"
          data-id={asset.id} data-react-action="true" onClick={()=>onAction('detail',asset.id)}>
          <div className="card-image"><RouteImage asset={asset} source={source}/></div>
          <div className="card-body"><h3>{asset.title}{asset.isFavorite?<span className="card-favorite" aria-label="已收藏">♥</span>:null}</h3>
            <p>{kindName(asset.kind)} · {asset.physicalWidthMM?`${format(asset.physicalWidthMM)} × ${format(asset.physicalHeightMM)} mm`:'尺寸待确认'}</p>
            <span className={`chip ${asset.reviewStatus==='ready'?'':'warn'}`}>{asset.reviewStatus==='ready'?'已整理':'待检查'}</span>
          </div>
        </button>;
      })}
    </div>
  </>;
}

export function WorksPage({projects,isUntouchedLegacyExample,assets,localCover,cloudEnabled,source,onAction}){
  const asset=id=>assets.find(entry=>entry.id===id);
  const list=projects.filter(project=>!isUntouchedLegacyExample(project))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const sorts=[['access-desc','最近访问 · 降序'],['access-asc','最近访问 · 升序'],
    ['updated-desc','最近修改 · 降序'],['updated-asc','最近修改 · 升序'],
    ['name-asc','名称 · 升序'],['name-desc','名称 · 降序']];
  return <div className="works-page"><div className="catalog-toolbar"><PageHeading title="我的作品"/>
    <button hidden data-act="new-project" data-react-action="true" id="work-create" onClick={()=>onAction('new-project')}/>
    <button hidden data-act="import-work" data-react-action="true" id="work-import" onClick={()=>onAction('import-work')}/>
    <div className="filters"><input type="search" id="work-search" placeholder="搜索作品名称或标签"/>
      <select id="work-kind"><option value="all">全部类型</option><option value="created">手动创作</option><option value="imported">导入作品</option></select>
      <select id="work-status"><option value="all">全部状态</option><option value="used">已使用</option><option value="unused">未使用</option></select>
      <select id="work-sort">{sorts.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <span>{list.length} 项</span>
    </div></div><div className="grid works-grid">
      {list.map((project,index)=>{
        const draft=project.drafts.find(d=>d.id===project.activeDraftID)||project.drafts[0];
        const revision=JSON.stringify([project.title,project.updatedAt,project.lastOpenedAt,
          project.isSnapshot,project.isDraft,project.isUsed,project.isFavorite,
          project.coverStaticPath,project.coverBaselineUpdatedAt,project.snapshotBlobId,project.activeDraftID]);
        const staticCover=project.isSnapshot?source(project.snapshotBlobId):
          project.coverStaticPath&&project.updatedAt===project.coverBaselineUpdatedAt?project.coverStaticPath:null;
        return <button key={project.id} className="card" data-work-revision={revision}
          data-act="open-project" data-id={project.id} data-react-action="true" onClick={()=>onAction('open-project',project.id)}>
          <div className="card-image"><div className="thumb-sheet" style={{width:'75%',background:project.drafts[0]?.paperColor||'#fff'}}>
            {staticCover?<img className="work-reference" loading={index<4?'eager':'lazy'} decoding="async"
              src={staticCover} alt={`${project.title} ${project.isSnapshot?'快照':'完整预览'}`}/>:null}
            {!staticCover?<SceneCover draft={draft} asset={asset} source={source} priority={index<4}
              snapshotOnly cloudEnabled={cloudEnabled} localCover={()=>localCover(project)}
              projectID={project.id}/>:null}
          </div></div><div className="card-body"><h3>{project.title}</h3><p>⊙　{project.isSnapshot?'画面快照':project.isDraft?'草稿':'可编辑作品'} <span>{new Date(project.updatedAt).toLocaleDateString()}</span></p></div>
        </button>;
      })}
    </div>
  </div>;
}

export function SeriesPage({series,assets,display,seriesCovers,source,onAction}){
  const sorted=[...series].sort((a,b)=>a.id.startsWith('B700')&&b.id.startsWith('B700')?
    b.id.localeCompare(a.id):a.id.startsWith('B700')?-1:b.id.startsWith('B700')?1:0);
  return <><div className="catalog-toolbar"><PageHeading title="我的素材"/></div>
    <div className={`grid series-grid ${display==='list'?'list-grid':''}`} data-react-page="series">
      {sorted.map((entry,index)=>{
        const members=assets.filter(asset=>asset.seriesID===entry.id&&!asset.isProjectInternal);
        return <button key={entry.id} className="card" data-act="series-detail" data-id={entry.id} data-react-action="true"
          onClick={()=>onAction('series-detail',entry.id)}>
          <div className="series-cover">{seriesCovers(entry,assets).map(asset=><RouteImage key={asset.id} asset={asset} source={source} priority={index<2}/>)}</div>
          <div className="card-body"><h3>{entry.title} <span aria-hidden="true">→</span></h3><p>{members.length} 件素材</p></div>
        </button>;
      })}
    </div>
  </>;
}

export function SeriesContentsPage({state,source,kindName,format,onAction}){
  const model=seriesContentsModel(state);
  if(!model)return <p>系列已移走</p>;
  const {series,filter,all,members,covers}=model;
  const options=(items,value)=>items.map(([id,label])=><option key={id} value={id}>{label}</option>);
  const kinds=[['sticker','贴纸'],['paper','纸张'],['tape','胶带'],['photo','照片'],
    ['text','文字'],['reference','参考']];
  const statuses=[['all','全部状态'],['ready','已整理'],['unready','未整理'],['used','已使用'],
    ['unused','未使用'],['favorite','已收藏'],['inside','系列中'],['outside','系列外']];
  return <section className="series-contents" data-react-page="seriesContents"><div className="catalog-toolbar">
    <div className="series-navigation"><button type="button" className="btn" id="series-return"
      data-react-action="true" onClick={()=>onAction('series-return')}>‹ 返回素材库</button>
      <div className="actions" id="series-actions"/></div>
    <div className="view-head series-heading"><div className="series-identity">
      <div className="series-detail-cover">{covers.map(asset=><RouteImage key={asset.id} asset={asset} source={source} priority/>)}</div>
      <div className="series-copy"><div className="eyebrow">COLLECTION</div>
        <h1><button type="button" id="series-edit-title" aria-label="编辑系列信息与标签">{series.title} <span aria-hidden="true">✎</span></button></h1>
        {series.introduction?<p>{series.introduction}</p>:null}
        <p className="series-tags">{[...(series.styleTags||[]),...(series.semanticTags||[])].join(' · ')}</p>
        <p>{all.length} 件素材</p>
      </div></div></div>
    <div className="series-filters filters"><label className="shiye-search">
      <input type="search" id="series-search" aria-label="在这个系列中搜索" placeholder="搜索系列内素材名称、标签或颜色"
        defaultValue={filter.query}/></label><div className="series-filter-menus">
      <select id="series-kind" aria-label="系列素材类型" defaultValue={filter.kind}>{options([['all','全部类型'],...kinds])}</select>
      <select id="series-status" aria-label="系列素材状态" defaultValue={filter.status}>{options(statuses)}</select>
      <select id="series-sort" aria-label="系列素材排序" defaultValue={filter.sort}>{options([['recent','最近添加'],['name','名称']])}</select>
      <button className="btn" id="series-order">{filter.ascending?'升序 ↑':'降序 ↓'}</button>
    </div></div></div>
    <div className={`grid asset-grid ${state.preferences.display==='list'?'list-grid':''}`}>
      <button type="button" className="card action-card" id="series-add-assets"><div className="card-image">＋</div>
        <div className="card-body"><h3>添加素材</h3><p>从全部素材选择</p></div></button>
      {all.map(asset=><button key={asset.id} className="card" data-card-revision={JSON.stringify([asset.title,asset.kind,
        asset.physicalWidthMM,asset.physicalHeightMM,asset.reviewStatus,asset.isFavorite,asset.blobId])}
        data-act="detail" data-id={asset.id} data-react-action="true" onClick={()=>onAction('detail',asset.id)}>
        <div className="card-image"><RouteImage asset={asset} source={source}/></div>
        <div className="card-body"><h3>{asset.title}{asset.isFavorite?<span className="card-favorite" aria-label="已收藏">♥</span>:null}</h3>
          <p>{kindName(asset.kind)} · {asset.physicalWidthMM?`${format(asset.physicalWidthMM)} × ${format(asset.physicalHeightMM)} mm`:'尺寸待确认'}</p>
          <span className={`chip ${asset.reviewStatus==='ready'?'':'warn'}`}>{asset.reviewStatus==='ready'?'已整理':'待检查'}</span>
        </div>
      </button>)}
    </div><p className="series-result-count">{members.length} 项</p>
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
function MatchingVariantCover({variant,session,source,assets}){
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
  const asset=id=>assets.find(entry=>entry.id===id);
  return <div ref={host} className="match-cover-preview" data-match-raster={variant.id}>
    {raster||snapshot?<img className="match-raster-preview" src={raster||snapshot}
      alt={variant.title+' 构图预览'}/>:<div className="match-cover-fallback"
      style={{aspectRatio:draft?`${draft.canvas.width}/${draft.canvas.height}`:'3/4',
        background:draft?.paperColor||'#fcfaf0'}}>
      {draft?<div className="thumb-sheet" style={{'--thumb-ratio':draft.canvas.width/draft.canvas.height,
        background:draft.paperColor||'#fff'}}><div className="thumb-inner" style={{position:'relative'}}>
        <SceneCover draft={draft} asset={asset} source={source}/>
      </div></div>:null}
    </div>}
  </div>;
}
function MatchingSessionPanel({session,state,source,onAction}){
  const [,refresh]=useState(0);
  useEffect(()=>session.subscribe(()=>refresh(version=>version+1)),[session]);
  const variants=session.variants();
  const action=(name,id)=>()=>onAction(name,id);
  return <section className="panel match-previews" data-match-scroll="previews" data-react-session="true">
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
        <RouteImage asset={asset} source={source}/><div><strong>{asset.title}</strong><small className={`match-priority ${scope.required.includes(asset.id)?'required':'preferred'}`}>{scope.required.includes(asset.id)?'必须使用':'优先使用'}</small>
          <div className="match-basket-actions"><button type="button" data-act="match-core" data-id={asset.id} data-react-action="true" onClick={action('match-core',asset.id)} aria-label={state.coreIDs.includes(asset.id)?'取消标星':'标星设为必用'} aria-pressed={state.coreIDs.includes(asset.id)} title={state.aiSettings.requireAllCandidates?'当前设置为全部候选必用；标星会保留单件优先级':'切换此素材是否必用'}>{state.coreIDs.includes(asset.id)?'★':'☆'}</button>
            <button type="button" data-act="basket" data-id={asset.id} data-react-action="true" onClick={action('basket',asset.id)} aria-label="移出素材篮">×</button><button type="button" data-act="match-use" data-id={asset.id} data-react-action="true" onClick={action('match-use',asset.id)} aria-label="设置素材用法">▣ 用法</button></div>
          {state.materialUseHints[asset.id]?<small className="material-use-summary">{state.materialUseRequired[asset.id]?'必做':'偏好'} · {state.materialUseHints[asset.id]}</small>:null}
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

function EditorInspector({selected,draft,asset,format,onChange,onAction}){
  const field=(id,label,value,type='number',props={})=><label>{label}<input id={id} type={type}
    defaultValue={value} onChange={event=>onChange(id,event.target.value)} {...props}/></label>;
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
  const button=(name,label,kind='')=><button className={`btn mini ${kind}`} data-act={name}
    data-react-action="true" onClick={()=>onAction(name)}>{label}</button>;
  return <div className="stack">
    {selected.kind==='text'?<>
      <label>文字内容<textarea id="inspector-text" defaultValue={item.content}
        onChange={event=>onChange('inspector-text',event.target.value)}/></label>
      <label>字体<select id="inspector-font" defaultValue={item.style}
        onChange={event=>onChange('inspector-font',event.target.value)}>
        <option value="serif">宋体</option><option value="sans">黑体</option><option value="rounded">圆体</option>
      </select></label>
      {field('inspector-font-size','字号',item.fontSize,'number',{min:8,max:200})}
    </>:null}
    <div className="form-grid">
      {field('inspector-width','宽',format(item.width),'number',{
        min:1,disabled:selected.kind==='material',title:selected.kind==='material'?'实物尺寸来自素材标定':undefined})}
      {field('inspector-height','高',format(item.height),'number',{
        min:1,disabled:selected.kind==='material',title:selected.kind==='material'?'实物尺寸来自素材标定':undefined})}
      {field('inspector-rotation','旋转',format(item.rotation||0))}
      {field('inspector-z','图层',item.zIndex)}
    </div>
    {field('inspector-opacity','透明度',item.opacity||1,'range',{min:.1,max:1,step:.05})}
    {selected.kind==='material'?<p className="muted">实物 {format(asset(item.assetID)?.physicalWidthMM||0)} × {format(asset(item.assetID)?.physicalHeightMM||0)} mm</p>:null}
    <div className="actions">{button('duplicate','复制')}{button('flip','镜像')}
      {button('front','置顶')}{button('delete-object','删除','danger')}</div>
  </div>;
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

// The editor controls are React nodes. Its paper and scene stay one opaque
// island so pointer capture, canvas contexts and incremental layer patches
// remain under the existing canvas engine's lifetime.
export function EditorPage({state,draft,editorEntry,renderSceneDOM,asset,source,format,
  hasAIReport,onAction,onInspectorChange,onTitleCommit,onDraftSelect,onAIAction,onAIOpen,onAIPromptChange,
  useFabric=false,sceneRevision,onFabricSelection,onFabricBeforeChange,onFabricChange,onFabricIssue,
  onFabricViewportChange,loadFabricAsset,materials=[]}){
  const project=state.activeProject;
  if(!project||!draft)return null;
  const selected=editorEntry(draft).find(entry=>entry.value.id===state.selected);
  const viewportHeight=window.visualViewport?.height||window.innerHeight;
  const availableWidth=Math.max(180,window.innerWidth-(window.innerWidth<700?24:72));
  const availableHeight=Math.max(180,viewportHeight-(window.innerWidth<700?200:166));
  const width=Math.max(160,Math.min(availableWidth,availableHeight*draft.canvas.width/draft.canvas.height));
  const scale=width/draft.canvas.width,height=draft.canvas.height*scale;
  const sceneHTML=!useFabric&&renderSceneDOM(draft,scale)+
    `<canvas class="paper-layer" width="${Math.round(draft.canvas.width)}" height="${Math.round(draft.canvas.height)}" aria-hidden="true"></canvas>`+
    `<canvas id="ink" class="ink-layer" width="${Math.round(draft.canvas.width)}" height="${Math.round(draft.canvas.height)}"></canvas>`;
  const toolNames=[['select','选择'],['pen','画笔'],['text','文字'],['shape','图形'],['material','素材']];
  return <><div className={`view-head ${useFabric?'swift-editor-head':''}`}>
    {useFabric?<button className="btn" data-act="back-works">返回</button>:null}
    <div><h1 contentEditable suppressContentEditableWarning id="project-title"
    spellCheck="false" onBlur={event=>onTitleCommit(event.currentTarget.textContent)}>{project.title}</h1>
      <p>编辑只改变作品，不修改素材库里的原始尺寸和数量</p></div><div className="actions">
      {useFabric?<><span className="swift-auto-saved">{document.querySelector('#save-state')?.textContent||'本机暂存'}</span>
        <FabricHeaderMenu kind="history" project={project} onAction={onAction} onAIOpen={onAIOpen}/>
        <button className="btn" data-act="undo" aria-label="撤销">↶</button>
        <button className="btn" data-act="redo" aria-label="重做">↷</button>
        <button className="btn primary" data-act="editor-done">完成</button>
        <FabricHeaderMenu kind="export" project={project} onAction={onAction}/>
      </>:<><button className="btn" data-act="back-works">返回作品</button><button className="btn" data-act="new-draft">新方案</button>
        <button className="btn" data-act="creative-json">导入创作指令</button><button className="btn" data-act="export-png">导出 PNG</button><button className="btn" data-act="print">打印 / PDF</button></>}
    </div></div>
    {useFabric?<FabricEditorToolbar state={state} draft={draft} materials={materials} source={source}
      onAction={onAction}/>:null}
    <div className={`editor-shell ${useFabric?'swift-editor-workspace':''} ${useFabric&&selected?'show-inspector':''}`}
      data-react-page="editor">{useFabric?null:<div className="editor-tools">
      {toolNames.map(([id,label])=><button key={id} className={`btn ${state.tool===id?'primary':''}`} data-act="tool" data-val={id}>{label}</button>)}
      <hr/><button className="btn" data-act="undo">撤销</button><button className="btn" data-act="redo">重做</button>
    </div>}<section className="editor-stage"><div className="object-toolbar">
      <button className="btn mini" data-act="zoom-out">－</button><span>{Math.round(state.zoom*100)}%</span><button className="btn mini" data-act="zoom-in">＋</button>
      <button className="btn mini" data-act="paper-menu">纸张</button>
      <button className="btn mini" data-act="restore-baseline" disabled={selected?.kind!=='material'||!selected.value.generationBaseline}>恢复初稿</button>
      <button className="btn mini" data-act="park" disabled={selected?.kind!=='material'}>放入备选</button>
    </div><div className="page-wrap">{useFabric?<FabricPageViewport draft={draft} width={width} height={height}
      zoom={state.zoom} initialPan={state.canvasViewports?.get(project.id+':'+draft.id)}
      onViewportChange={onFabricViewportChange}><div className="fabric-scene-scale" style={{position:'absolute',left:0,top:0,
        width:draft.canvas.width,height:draft.canvas.height,transform:`scale(${scale})`,transformOrigin:'left top'}}>
        <FabricSceneStage draft={draft} sceneRevision={sceneRevision} tool={state.tool}
          selectedID={state.selected}
          pen={{widthMM:state.canvasTools?.fabricPenWidthMM??.5,color:state.canvasTools?.penColor||'#2b5245',
            style:state.canvasTools?.fabricPenStyle||'pressure'}}
          marker={{widthMM:state.canvasTools?.fabricMarkerWidthMM??2,color:state.canvasTools?.fabricMarkerColor||'#f5cf45',
            straight:!!state.canvasTools?.fabricMarkerStraight}}
          eraser={{widthMM:state.canvasTools?.fabricEraserWidthMM??4,style:state.canvasTools?.fabricEraserStyle||'standard'}}
          selectionMode={state.selectionMode||'contain'} selectedIDs={state.multiSelected||[]}
          assetURL={loadFabricAsset} onSelection={onFabricSelection}
          onBeforeChange={onFabricBeforeChange} onChange={onFabricChange} onIssue={onFabricIssue}/>
      </div></FabricPageViewport>:<div id="canvas-page" className={`canvas-page ${draft.paperPattern} ${state.tool==='pen'?'pen':''}`}
        style={{width,height,backgroundColor:draft.paperColor}} dangerouslySetInnerHTML={{__html:sceneHTML}}/>}</div>
      <div className="shelf"><b>备选</b>{draft.items.filter(item=>item.isParked).map(item=><button key={item.id} className="mini-asset" data-act="unpark" data-id={item.id}>
        <RouteImage asset={asset(item.assetID)} source={source}/></button>)}</div>
    </section><aside className="editor-inspector"><h2>{selected?`${{material:'素材',text:'文字',shape:'图形'}[selected.kind]} · 图层属性`:'页面设置'}</h2>
      <div className="inspector-island" style={{display:'contents'}}><EditorInspector selected={selected}
        draft={draft} asset={asset} format={format} onChange={onInspectorChange} onAction={onAction}/></div>
      <hr/><label>方案<select id="draft-select" defaultValue={draft.id}
        onChange={event=>onDraftSelect(event.target.value)}>{project.drafts.map((entry,index)=><option key={entry.id} value={entry.id}>方案 {index+1} · {entry.style}</option>)}</select></label>
      <button className="btn mini" data-act="save-archive">保存手动存档</button><div className="stack" style={{marginTop:12}}>
        {(project.manualArchives||[]).slice(-5).reverse().map(archive=><button key={archive.id} className="btn mini" data-act="restore-archive" data-id={archive.id}>{new Date(archive.date).toLocaleString()}</button>)}
      </div></aside></div>
    {state.aiPanel?<div className="editor-ai-island" style={{display:'contents'}}>
      <EditorAIPanel state={state} draft={draft} asset={asset} hasReport={hasAIReport}
        onAction={onAIAction} onPromptChange={onAIPromptChange}/></div>:null}
  </>;
}

export function AssetDetailPage({asset,seriesTitle,source,kindName,format,onAction}){
  const tags=[...(asset.tags||[]),...(asset.contentTags||[]),...(asset.styleTags||[]),...(asset.materialTags||[])]
    .filter((tag,index,list)=>tag&&list.indexOf(tag)===index).sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const act=name=>()=>onAction(name);
  return <div className="detail-page" data-react-page="assetDetail">
    <button className="detail-back" data-act="detail-back" data-react-action="true" onClick={act('detail-back')}>‹　返回素材库</button>
    <span className="detail-category">{seriesTitle||'所有系列'}</span>
    <section className="detail-columns"><div className="detail-picture"><span>▣　透明素材预览</span>
      <RouteImage asset={asset} source={source} priority/>
    </div><div className="detail-copy"><div className="eyebrow">A LITTLE PIECE OF EVERYDAY</div>
      <button className="detail-heart" data-act="detail-favorite" data-react-action="true" aria-label={asset.isFavorite?'取消收藏':'收藏'}
        aria-pressed={!!asset.isFavorite} onClick={act('detail-favorite')}>{asset.isFavorite?'♥':'♡'}</button>
      <h1>{asset.title}</h1><div className="detail-facts">
        <div><small>真实尺寸</small><span>{format(asset.physicalWidthMM||0)} × {format(asset.physicalHeightMM||0)} mm</span></div>
        <div><small>可用库存</small><span>{asset.supply?.quantity??1} 件</span></div>
        <div><small>素材类型</small><span>{kindName(asset.kind)}</span></div>
        <div><small>主要作用</small><span>{asset.role==='background'?'背景':asset.role==='connector'?'连接':'陪衬'}</span></div>
        <div><small>材质</small><span>{asset.texture||'待记录'}</span></div>
      </div><div className="detail-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>
      <div className="detail-dots">● ● ● ●</div><hr/><p>实物可用操作</p><p>✓ 整件使用　 ✓ 旋转摆放</p>
      <button className="btn primary detail-add" data-act="detail-add" data-react-action="true" onClick={act('detail-add')}>＋　加入本次创作</button>
      <div className="detail-links">
        <button className="btn" data-act="detail-series" data-react-action="true" onClick={act('detail-series')}><DetailLinkIcon kind="folder"/><span className="detail-link-label">同系列</span></button>
        <button className="btn" data-act="detail-similar" data-react-action="true" onClick={act('detail-similar')}><DetailLinkIcon kind="search"/><span className="detail-link-label">找相似</span></button>
        <button className="btn" data-act="detail-match" data-react-action="true" onClick={act('detail-match')}><DetailLinkIcon kind="sparkles"/><span className="detail-link-label">去搭配</span></button>
      </div><div className="detail-small">
        <button data-act="detail-edit" data-react-action="true" onClick={act('detail-edit')}>✎　编辑素材信息</button>
        <button data-act="detail-check" data-react-action="true" onClick={act('detail-check')}>□　检查抠图</button>
      </div>
    </div></section>
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
    style={{background:draft.paperColor||'#fff',aspectRatio:`${draft.canvas.width}/${draft.canvas.height}`}}>
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
    <SettingsGroup title="4 · 轮廓后处理" description="控制非统一自动分割的形状与打孔后处理；统一 V5 使用内部形状仲裁，不读取以下两项开关。">
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

export function SettingsDataPage({state,cloudEnabled,storage,onAction}){
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
  </div>):<p>没有最近删除的项目。</p>}</SettingsGroup>;
  return <SettingsDetailShell title="数据与诊断" kind="settingsData" onAction={onAction}>
    <SettingsGroup title="应用错误诊断" description="导出本次打开拾页以来的运行错误、网络与同步故障的安全摘要，包含发生页面、阶段、错误类别和可判断的原因。不会导出作品、图片、账号、密钥或原始报错文本；关闭应用后不保留。">
      {button('export-app-diagnostics','导出完整错误诊断')}
    </SettingsGroup>
    <SettingsGroup title="图片保留与清理" description="删除素材后，已有作品引用的图片会隐藏保留；从最近删除彻底移除且无作品引用时才清除隐藏素材记录。云端 COS 原图尚不自动物理删除，避免遗漏其他设备、历史存档或备份中的引用。"/>
    {cloudEnabled?<>
      <SettingsGroup title="私人云端资料">
        <p id="storage-location">云端元数据与私有图片 · 本机缓存加速</p><p>{counts}</p>
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
      <SettingsGroup title="离线状态"><p id="offline-state">检测中…</p></SettingsGroup>
    </>}
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

export function SettingsAIPage({settings,modelPanelOpen,onAction,onProviderChange,onModelPanelToggle}){
  const cfg=settings,preset=AI_PROVIDERS[cfg.provider];
  const known=preset.models.some(([id])=>id===cfg.model);
  const [modelChoice,setModelChoice]=useState(known?cfg.model:'__custom__');
  const [thumbnails,setThumbnails]=useState(!!cfg.includeThumbnails);
  const selectModel=event=>{
    const next=event.target.value;
    setModelChoice(next);
    if(next!=='__custom__')setThumbnails(preset.models.find(([id])=>id===next)?.[2]===true);
  };
  return <SettingsDetailShell title="AI 与创作" kind="settingsAI" onAction={onAction}>
    <details className="ai-settings-group unified-settings-group" open>
      <summary><strong>创作偏好</strong><small>候选素材、生成方式与样例参考</small></summary>
      <div><h2>创作方式</h2>
        <AISelect id="delivery" label="创作方式" value={cfg.deliveryMode} choices={DELIVERY_OPTIONS}/>
        <AISelect id="image-model" label="GPT 图像模型" value={cfg.imageModel}
          choices={IMAGE_MODELS.map(id=>[id,id])}/>
        <p>调用工具和直接排版都会生成可编辑素材、文字、图形及自由笔迹；自由绘画通过图像模型生成整张 PNG 快照，不能独立编辑图层。网页 GPT 的“作品文件／复制文本”在导出任务时选择，不影响创作方式。</p>
        <p>轮数包含重试；超时后停止，不自动重复收费请求。</p>
        <h2>候选素材</h2>
        <AIToggle id="require-all" label="候选素材必须全部使用" checked={cfg.requireAllCandidates}/>
        <p>默认开启：本次发给 AI 的每件候选素材都必须在作品中出现。关闭后，仍尽量使用；手动标星的素材保持必用。若同时开启“自动加入建议搭配”，建议素材也属于候选。</p>
        <AIToggle id="auto-recommendations" label="自动把全部建议搭配作为 AI 备选素材" checked={cfg.autoIncludeRecommendations}/>
        <p>开启后会把未排除的建议素材一并发送给 AI；关闭后只发送素材篮中的素材。最终是否必须使用由上方开关决定。</p>
        <h2>样例参考</h2>
        <AIToggle id="structure-reference" label="参考样例的图文结构" checked={cfg.includeStructureReference}/>
        <AIToggle id="send-reference" label="发送匹配风格与用途的手帐案例" checked={cfg.sendPresetReferences}/>
        <p>从原创重构的真实风格手帐案例中，按当前风格、用途和素材选最相近的两张；不发送全部案例，也不发送你已有的私人作品。案例只用于构图参考，不属于可使用素材。网页版任务包附图；支持图片的 API 模型也会收到。</p>
      </div>
    </details>
    <details className="ai-settings-group unified-settings-group" id="ai-model-group"
      open={modelPanelOpen} onToggle={event=>onModelPanelToggle(event.currentTarget.open)}>
      <summary><strong>模型与连接</strong><small>服务商、密钥、图片与响应参数</small></summary>
      <div><h2>服务与模型</h2>
        <AISelect id="provider" label="服务商" value={cfg.provider}
          choices={Object.entries(AI_PROVIDERS).map(([id,entry])=>[id,entry.label])}
          onChange={event=>onProviderChange(event.target.value)}/>
        <label>API 地址<input id="setting-ai-endpoint" type="url" defaultValue={cfg.endpoint}
          placeholder="https://…/chat/completions"/></label>
        <AISelect id="model" label="模型" value={modelChoice} onChange={selectModel}
          choices={[...preset.models.map(([id,name])=>[id,name]),['__custom__','自定义模型 ID']]}/>
        <label id="setting-ai-custom-model-row" hidden={modelChoice!=='__custom__'}>模型 ID
          <input id="setting-ai-custom-model" defaultValue={known?'':cfg.model}/></label>
        <label>API 密钥<input id="setting-ai-key" type="password" autoComplete="off"
          defaultValue={cfg.key} placeholder="API Key"/></label>
        <AIToggle id="thumbnails" label="发送全部素材预览" checked={thumbnails}
          onChange={event=>setThumbnails(event.target.checked)}/>
        <AIToggle id="visual-review" label="交付前由 GPT 看图复核（计入总请求上限）" checked={cfg.finalVisualReview!==false}/>
        <AIToggle id="vision" label="自定义模型支持图片" checked={cfg.customVision}/>
        <p>当前模型{supportsVision(cfg)?'支持图片输入；开启预览时发送所有允许使用的素材图片':'不支持图片输入，仅发送素材文字信息'}。密钥仅保存在本浏览器，不进入备份。</p>
        <h2>创作与响应</h2>
        <AINumber id="temperature" label="创意程度 0–2" value={cfg.temperature} min="0" max="2" step="0.05"/>
        <AINumber id="tokens" label="单轮最大输出 2000–16000" value={cfg.maxTokens} min="2000" max="16000"/>
        <AINumber id="turns" label="最多创作轮次（所有请求和重试计入上限）" value={cfg.maxTurns} min="1" max="20"/>
        <AINumber id="timeout" label="连续无响应超时（秒）" value={cfg.requestTimeout} min="20" max="180"/>
        <p>流式接收期间只计算连续未收到数据的时间；每轮最多 10 分钟，不会自动重试收费请求。</p>
        <AISelect id="transport" label="工具接口" value={cfg.transport}
          choices={[["auto","自动适配"],["native","原生工具调用"],["json","兼容 JSON 工具指令"]]}/>
        <AISelect id="text" label="文字内容" value={cfg.textMode}
          choices={[["automatic","图文手账 · 自动配文"],["requested","仅明确要求时配文"],["none","不生成文字"],
            ...(['minimal','rich'].includes(cfg.textMode)?[[cfg.textMode,`旧版：${cfg.textMode==='minimal'?'简洁':'丰富'}`]]:[])]}/>
        <AISelect id="reasoning" label="代理思考策略" value={cfg.reasoningMode}
          choices={[["automatic","自动 · 优先执行"],["low","轻量思考"],["providerDefault","保持服务设置"]]}/>
        <AIToggle id="send-limit" label="发送输出上限" checked={cfg.sendOutputLimit}/>
        <AIToggle id="disable-thinking" label="关闭服务商思考模式" checked={cfg.disableThinking}/>
        <label>补充版式指导<textarea id="setting-ai-layout-prompt" placeholder="留空使用默认指导"
          defaultValue={cfg.customLayoutPrompt}/></label>
        <p>“自动适配”只用于已核对的 API 地址与模型组合；自定义或未核验组合请明确选择原生工具或兼容 JSON。图片输入同理，未核验组合需手动确认支持后才发送预览。</p>
      </div>
    </details>
  </SettingsDetailShell>;
}

export function ImportSimplePage({state,onAction}){
  const button=(name,label,value,kind='btn')=><button className={kind} data-act={name} data-val={value}
    data-react-action="true" onClick={()=>onAction(name,null,value)}>{label}</button>;
  const isDone=state.importStep==='done';
  const kind=state.importMode==='work'?'作品':state.importMode==='snapshot'?'快照':'素材';
  const destination=state.importMode==='work'||state.importMode==='snapshot'?'作品':'素材库';
  const needsManualCheck=state.importMode==='material'&&state.preferences.autoOrganize&&
    !(state.aiSettings?.key&&state.aiSettings.includeThumbnails&&supportsVision(state.aiSettings));
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

export function ImportInspectionPage({state,format,onAction,onSettingChange}){
  const snapshot=state.importMode==='snapshot',previewing=!!state.showCorrectionPreview,manual=!!state.showManualBox;
  const source=manual?state.correctedURL||state.importURL:previewing?state.paperPreviewURL||state.correctedURL:state.importURL;
  const candidates=state.importProcessing?[]:state.importCandidates||[];
  const button=(action,label,disabled=false,kind='btn')=><button className={kind} data-act={action} disabled={disabled}>{label}</button>;
  return <><ImportNavigation state={state} onAction={onAction}/>
    <section className={`import-inspect ${snapshot?'import-snapshot-inspect':''}`} data-react-page="importInspection" aria-busy={!!state.importProcessing}>
      {!snapshot?<div className="eyebrow">FROM YOUR DESK TO YOUR PAGES</div>:null}<h1>检查这一批</h1>
      {!snapshot?<p>逐张确认，最后一起归类。</p>:null}<p className="import-processing" role="status">{state.importProcessing||''}</p>
      <div className="import-queue"><div><strong>{state.importRecords.length} 张照片</strong> <small>{state.importRecords.filter(record=>record.confirmed).length} 张已确认</small></div>
        <button className="btn" data-act="select-file" data-val="gallery" disabled={state.importRecords.length>=12}>＋ 添加照片</button></div>
      <div className="queue-strip">{state.importRecords.map((record,index)=><button key={index} className={`queue-item ${index===state.importIndex?'active':''}`}
        data-act="import-switch" data-id={index}><img src={record.url} alt=""/><span>照片 {index+1}<small>{record.confirmed?'已确认':snapshot?'待检查':record.prefetchStatus==='running'?'后台识别中':record.prefetchStatus==='ready'?`${record.candidates.length} 件已预识别`:record.candidates?.length?`${record.candidates.length} 件素材`:'待识别'}</small></span></button>)}</div>
      <div className="inspect-columns"><section className="panel import-preparation"><h2>照片 {state.importIndex+1}</h2><div className="photo-preparation-content">
        <h3>{previewing?'查看校正结果':snapshot?'调整页面边框':'选择画面范围'}</h3>
        {!snapshot?<p>{previewing?'检查边缘和文字方向，必要时返回调整。':'拖动四角贴合纸张边缘；双页请框住整个跨页。'}</p>:null}
        <div className="photo-preview" id="crop-preview"><img src={source} alt={snapshot?'页面预览':previewing?'校正结果':'待检查照片'}/><div id="crop-frame" hidden/></div>
        <div className="import-photo-tools">{manual?null:previewing?<>{button('readjust-paper','重新调整')}{button('apply-paper-preview',state.paperPreviewApplied?'✓ 已应用校正':'✓ 使用校正结果',!!state.paperPreviewApplied)}</>:
          <>{button('rotate-photo','↻ 旋转 90°')}{button('preview-crop',snapshot?'□ 预览校正':'□ 预览校正')}</>}
          {!snapshot&&!manual?button('manual-import-box','手动补框',false,'btn primary'):null}</div>
      </div></section>
      <section className="panel import-inspector"><h2>{snapshot?'页面与颜色校正':state.importMode==='work'?'检查作品图层':'检查识别结果'}</h2>
        {!snapshot?<><p>校正后自动识别；如有漏检，使用左侧的“手动补框”。</p><hr/></>:null}
        <div className="inspector-scroll"><div className="inspector-settings">
          <label>{snapshot?'页面规格':'当前照片的背景板'}<select id="paper-size" value={state.paperSize?.startsWith('custom:')?'custom':state.paperSize} onChange={event=>onSettingChange('paperSize',event.target.value)}><PaperSizeOptions includeNone/></select></label>
          {state.paperSize==='custom'?<div className="import-custom-size"><label>宽 mm<input id="import-paper-width" type="number" min="1" max="10000" defaultValue={state.customImportWidth} onBlur={event=>onSettingChange('customImportWidth',event.target.value)}/></label>
            <label>高 mm<input id="import-paper-height" type="number" min="1" max="10000" defaultValue={state.customImportHeight} onBlur={event=>onSettingChange('customImportHeight',event.target.value)}/></label></div>:null}
          {(snapshot||state.paperSize!=='none')?<><label>{snapshot?'页面方向':'纸张方向'}<select id="paper-orientation" value={state.paperOrientation||'auto'} onChange={event=>onSettingChange('paperOrientation',event.target.value)}>
            <option value="auto">自动</option><option value="portrait">竖向</option><option value="landscape">横向</option></select></label>
            <label className="toggle-row">{snapshot?'校正白纸色偏':'识别前均衡光照'}<input id="balance-light" type="checkbox" defaultChecked={!!state.balanceLight}/></label>
            {!snapshot?<><label className="toggle-row">规则形状规整<input id="import-shape-regularization" type="checkbox" defaultChecked={state.importShapeRegularization!==false}/></label>
              <label className="toggle-row">恢复重复孔洞<input id="import-apertures" type="checkbox" defaultChecked={state.importApertures!==false}/></label>
              <label>最终素材颜色<select id="import-material-color" defaultValue={state.importMaterialColorMode==='original'?'original':'auto'}><option value="auto">A4 光照与颜色还原</option><option value="original">原始照片颜色</option></select><small>仅影响高清输出，不改变数量与分割边缘。</small></label>
              <label className="toggle-row">未识别时将整张照片视为背景板<input id="whole-paper" type="checkbox" checked={!!state.wholePaper} onChange={event=>onSettingChange('wholePaper',event.target.checked)}/></label></>:null}</>:null}
          {!snapshot?<><small>{state.paperSize==='none'?'当前照片不计算素材尺寸':'尺寸变化仅更新标尺；不重新抠图'}</small>
            <button className="import-default-action" id="save-import-defaults">将当前参数设为以后导入的默认值</button>
            <small>设为默认值会同步本批后续照片，并用于以后新导入的照片；之前的照片不变。</small></>:null}
        </div>{!snapshot?<><hr/><h3>候选素材 · {state.importProcessing?'识别中':candidates.length}</h3>
          {button('recognition-diagnostics','导出识别诊断',false,'btn mini')}
          <div className="import-candidate-grid">{candidates.map((candidate,index)=><div key={index} className="candidate-choice"><button className={`import-candidate-tile ${state.importCandidateSelection?.has(index)?'selected':''}`}
            data-act="import-toggle-candidate" data-id={index}><span className="candidate-thumb"><img src={state.importCandidateURLs?.[index]||''} alt=""/></span>
            <span>素材 {index+1} {state.importCandidateSelection?.has(index)?'✓':'○'}</span><small>{state.importCandidateData?.[index]?.width?`${format(state.importCandidateData[index].width)} × ${format(state.importCandidateData[index].height)} mm`:'尺寸待检查'}</small></button>
            <button className="btn mini" data-import-check={index}>检查边缘</button></div>)}</div></>:null}</div>
        <button className="btn primary confirm-photo" data-act="import-confirm-photo">→ 确认</button>
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

export function ImportReviewPage({state,format,onAction,onSeriesChange,onWorkTitleChange}){
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
              {work?<div className="review-candidate review-background-card"><div className={`review-thumbnail import-work-paper-preview ${pattern}`}
                style={{'--review-paper':color,backgroundColor:color}}>
                <button type="button" className="review-paper-control" data-import-paper-options={ri}
                  aria-label="编辑页面背景">页面背景</button>
              </div></div>:null}
              {candidates.map((candidate,ci)=><div className={`review-candidate ${candidate.selected?'selected':''}`}
                data-index={ri} data-candidate={ci} key={ci}>
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
