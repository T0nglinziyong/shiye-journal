import React from 'react';

function RouteImage({asset,source,priority=false}){
  const src=asset&&(source(asset.blobId)||asset.staticPath);
  return src?<img data-asset-image-id={asset.id} loading={priority?'eager':'lazy'}
    fetchPriority={priority?'high':undefined} decoding="async" src={src} alt={asset.title}/>:<span>无预览</span>;
}

function PageHeading({title}){
  return <div className="view-head unified-page-heading"><div className="unified-heading-copy">
    <span className="eyebrow">FROM YOUR DESK TO YOUR PAGES</span><h1>{title}</h1>
  </div><div className="actions"/></div>;
}

export function LibraryPage({state,items,source,kindName,format,onAction}){
  const kinds=['sticker','paper','tape','photo','text','reference'];
  const status=[['all','全部状态'],['ready','已整理'],['pendingReview','未整理'],['used','已使用'],
    ['unused','未使用'],['inside','系列中'],['outside','系列外']];
  const sorts=[['newest','添加时间 · 降序'],['oldest','添加时间 · 升序'],
    ['name','名称 · 升序'],['name-desc','名称 · 降序']];
  return <><PageHeading title="我的素材"/>
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
    </div>
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

export function WorksPage({projects,isUntouchedLegacyExample,workCover,source,onAction}){
  const list=projects.filter(project=>!isUntouchedLegacyExample(project))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const sorts=[['access-desc','最近访问 · 降序'],['access-asc','最近访问 · 升序'],
    ['updated-desc','最近修改 · 降序'],['updated-asc','最近修改 · 升序'],
    ['name-asc','名称 · 升序'],['name-desc','名称 · 降序']];
  return <div className="works-page"><PageHeading title="我的作品"/>
    <button hidden data-act="new-project" data-react-action="true" id="work-create" onClick={()=>onAction('new-project')}/>
    <button hidden data-act="import-work" data-react-action="true" id="work-import" onClick={()=>onAction('import-work')}/>
    <div className="filters"><input type="search" id="work-search" placeholder="搜索作品名称或标签"/>
      <select id="work-kind"><option value="all">全部类型</option><option value="created">手动创作</option><option value="imported">导入作品</option></select>
      <select id="work-status"><option value="all">全部状态</option><option value="used">已使用</option><option value="unused">未使用</option></select>
      <select id="work-sort">{sorts.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <span>{list.length} 项</span>
    </div><div className="grid works-grid">
      {list.map((project,index)=>{
        const draft=project.drafts.find(d=>d.id===project.activeDraftID)||project.drafts[0];
        const revision=JSON.stringify([project.title,project.updatedAt,project.lastOpenedAt,
          project.isSnapshot,project.isDraft,project.isUsed,project.isFavorite,
          project.coverStaticPath,project.coverBaselineUpdatedAt,project.snapshotBlobId,project.activeDraftID]);
        const staticCover=project.isSnapshot?source(project.snapshotBlobId):
          project.coverStaticPath&&project.updatedAt===project.coverBaselineUpdatedAt?project.coverStaticPath:null;
        return <button key={project.id} className="card" data-work-revision={revision}
          data-act="open-project" data-id={project.id} data-react-action="true" onClick={()=>onAction('open-project',project.id)}>
          <div className="card-image"><div className="thumb-sheet" style={{width:'75%',background:project.drafts[0]?.paperColor||'#fff'}}
            {...(staticCover?{}:{dangerouslySetInnerHTML:{__html:workCover(draft,index<4,true,project.id)}})}>
            {staticCover?<img className="work-reference" loading={index<4?'eager':'lazy'} decoding="async"
              src={staticCover} alt={`${project.title} ${project.isSnapshot?'快照':'完整预览'}`}/>:null}
          </div></div><div className="card-body"><h3>{project.title}</h3><p>⊙　{project.isSnapshot?'画面快照':project.isDraft?'草稿':'可编辑作品'} <span>{new Date(project.updatedAt).toLocaleDateString()}</span></p></div>
        </button>;
      })}
    </div>
  </div>;
}

export function SeriesPage({series,assets,display,seriesCovers,source,onAction}){
  const sorted=[...series].sort((a,b)=>a.id.startsWith('B700')&&b.id.startsWith('B700')?
    b.id.localeCompare(a.id):a.id.startsWith('B700')?-1:b.id.startsWith('B700')?1:0);
  return <><PageHeading title="我的素材"/>
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
        <button className="btn" data-act="detail-series" data-react-action="true" onClick={act('detail-series')}><span className="detail-link-label">同系列</span></button>
        <button className="btn" data-act="detail-similar" data-react-action="true" onClick={act('detail-similar')}><span className="detail-link-label">找相似</span></button>
        <button className="btn" data-act="detail-match" data-react-action="true" onClick={act('detail-match')}><span className="detail-link-label">去搭配</span></button>
      </div><div className="detail-small">
        <button data-act="detail-edit" data-react-action="true" onClick={act('detail-edit')}>✎　编辑素材信息</button>
        <button data-act="detail-check" data-react-action="true" onClick={act('detail-check')}>□　检查抠图</button>
      </div>
    </div></section>
  </div>;
}

export function ProjectPreviewPage({project,source,workCover,onAction}){
  const draft=project.drafts.find(entry=>entry.id===project.activeDraftID)||project.drafts[0];
  const original=project.coverStaticPath&&project.updatedAt===project.coverBaselineUpdatedAt;
  const staticCover=project.isSnapshot?source(project.snapshotBlobId):original?project.coverStaticPath:null;
  const tags=[...(project.styleTags||[]),...(project.tags||[])]
    .filter((tag,index,list)=>tag&&list.indexOf(tag)===index);
  const action=name=>()=>onAction(name);
  const button=(name,label,kind='')=><button className={`btn ${kind}`} data-act={name}
    data-react-action="true" onClick={action(name)}>{label}</button>;
  return <div className="project-preview-page"><div className="project-preview-head">
    <h1>{project.title}</h1>{button('preview-back','关闭')}
  </div><div className="project-preview-cover"><div className="preview-paper"
    style={{background:draft.paperColor||'#fff',aspectRatio:`${draft.canvas.width}/${draft.canvas.height}`}}
    {...(staticCover?{}:{dangerouslySetInnerHTML:{__html:workCover(draft,true,true,project.id)}})}>
    {staticCover?<img className="work-reference" loading="eager" fetchPriority="high" decoding="async"
      src={staticCover} alt={`${project.title} ${project.isSnapshot?'快照':'完整预览'}`}/>:null}
  </div></div><div className="project-preview-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>
    <p>{project.isSnapshot?'独立保存的画面快照，不能逐层编辑。':'页面上的素材、排版和书写内容都已保存。'}</p>
    <div className="project-preview-actions">
      {project.isSnapshot?button('download-snapshot','下载快照','primary'):button('preview-continue','继续创作','primary')}
      {button('project-meta','作品信息与标签')}{button('project-delete','移到最近删除','danger')}
    </div>
  </div>;
}
