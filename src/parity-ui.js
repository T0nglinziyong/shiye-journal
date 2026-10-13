// Interaction placement follows the Swift 2.0.10 views. Core records remain
// owned by app.js; this module adds the missing screen controls and actions.
import {reusePagePreviews} from './preview-content-cache.js';
import {mountSeriesContents,mountSeriesAddition} from './series-contents.js';
import {finishSelection,toggleSelection,selectionActive} from './library-selection-model.js';
import {mountRecentlyDeleted} from './recently-deleted-ui.js';
import {bindLongPress} from './long-press.js';
import {WORK_TABS,workInTab} from './work-collections.js';
import {mountJournalTemplateGallery} from './journal-template-ui.js';
import {applyCatalogPage,resetCatalogPage} from './catalog-pagination.js';
export const parity={libraryTab:'series',selectionMode:null,showOnlySelected:false,selected:new Set(),workTab:'all',route:null,templateID:null,templateSide:'template',seriesScrollY:0,restoreSeriesScroll:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountParityControls(ctx){
  const {state,view}=ctx;
  reusePagePreviews(ctx);
  if(state.route==='library')mountLibrary(ctx);
  if(state.route==='series')mountSeries(ctx);
  if(state.route==='works')mountWorks(ctx);
  if(state.route==='matching')mountMatching(ctx);
  if(state.route==='import')mountImport(ctx);
}
function tabs(labels,active,onClick){const bar=document.createElement('div');bar.className='swift-tabs';for(const [id,label] of labels){const b=document.createElement('button');b.type='button';b.className=id===active?'selected':'';b.textContent=label;b.onclick=()=>onClick(id);bar.append(b);}return bar;}
function button(label,fn,kind=''){const b=document.createElement('button');b.type='button';b.className=`btn ${kind}`;b.textContent=label;b.onclick=fn;return b;}
function mountLibrary(c){
  if(c.state.series.some(s=>s.id===c.state.seriesID)){mountSeriesContents(c,parity);return;}
  if(c.state.addingToSeries&&mountSeriesAddition(c,parity))return;
  const {state,view,render,route,toast,db}=c,header=view.querySelector('.view-head'),actions=header?.querySelector('.actions');
  const insideSeries=state.seriesID!=='all';
  header?.querySelector('h1')?.replaceChildren(insideSeries?(state.series.find(s=>s.id===state.seriesID)?.title||'系列'):'我的素材');
  if(insideSeries){const back=button('‹ 返回素材库',()=>route('series'));back.classList.add('series-back');header?.prepend(back);}
  actions?.prepend(button(parity.selectionMode?'完成':'选择',()=>{toggleSelection(parity,'asset');view.selectionRefresh?.();},'library-select-toggle'));
  const bar=tabs([['series','系列'],['all','全部素材'],['pending','待检测'],['trash','最近删除']],parity.libraryTab,id=>{
    parity.libraryTab=id;
    if(id==='series'){route('series');return;}
    state.seriesID='all';state.status=id==='pending'?'pendingReview':'all';state.libraryRecent=false;state.sort='newest';if(id==='trash')finishSelection(parity);render();
  });if(!insideSeries)header?.after(bar);
  if(!insideSeries&&parity.libraryTab==='trash'){actions?.replaceChildren();mountRecentlyDeleted(c,'asset');return;}
  if(insideSeries){header?.querySelector('.actions')?.append(button('编辑系列',()=>c.openSeriesEditor?.(state.seriesID)));}
}
function mountSeries(c){const {view,route,state,render}=c,header=view.querySelector('.view-head'),grid=view.querySelector('.grid');header?.querySelector('h1')?.replaceChildren('我的素材');const bar=tabs([['series','系列'],['all','全部素材'],['pending','待检测'],['trash','最近删除']],'series',id=>{if(id==='series')return;parity.libraryTab=id;state.status=id==='pending'?'pendingReview':'all';state.libraryRecent=false;route('library');});header?.after(bar);
  const controls=document.createElement('div');controls.className='swift-series-controls';controls.innerHTML='<label class="shiye-search"><input type="search" placeholder="搜索系列、素材或标签" aria-label="搜索系列"></label><select aria-label="系列排序"><option value="recent">最近更新</option><option value="name">名称</option></select><span></span>';bar.after(controls);
  const cards=[...view.querySelectorAll('.grid .card[data-act="series-detail"]')], count=controls.querySelector('span');
  for(const card of cards)card.addEventListener('click',()=>{if(!selectionActive(parity,'series')){parity.seriesScrollY=window.scrollY;parity.restoreSeriesScroll=true;}});
  const filter=()=>{const q=controls.querySelector('input').value.trim().toLocaleLowerCase();applyCatalogPage({view,key:'series',cards,matched:card=>{const series=state.series.find(x=>x.id===card.dataset.id);return !q||`${series?.title||''} ${series?.introduction||''} ${state.assets.filter(a=>a.seriesID===series?.id).map(a=>a.title).join(' ')}`.toLocaleLowerCase().includes(q);},countNode:count,size:state.preferences.maxPageItems});};view.catalogRefresh=filter;
  controls.querySelector('input').oninput=filter;controls.querySelector('select').onchange=e=>{if(e.target.value==='name')cards.sort((a,b)=>(state.series.find(x=>x.id===a.dataset.id)?.title||'').localeCompare(state.series.find(x=>x.id===b.dataset.id)?.title||''));else cards.sort((a,b)=>(state.series.find(x=>x.id===b.dataset.id)?.updatedAt||'').localeCompare(state.series.find(x=>x.id===a.dataset.id)?.updatedAt||''));cards.forEach(card=>grid.append(card));};filter();
  if(grid){const tile=document.createElement('button');tile.type='button';tile.className='series-entry';tile.innerHTML='<div class="series-entry-cover">＋</div><strong>新建系列</strong><small>把喜欢的素材放在一起</small>';tile.onclick=()=>c.openSeriesEditor();grid.prepend(tile);}if(parity.restoreSeriesScroll)requestAnimationFrame(()=>{window.scrollTo(0,parity.seriesScrollY||0);parity.restoreSeriesScroll=false;});}
function mountWorks(c){const {state,view,render}=c,header=view.querySelector('.view-head'),filters=view.querySelector('.filters');
  const actions=header?.querySelector('.actions');if(actions&&parity.workTab!=='templates'){actions.append(button(parity.selectionMode?'完成':'选择',()=>{toggleSelection(parity,'work');view.selectionRefresh?.();},'library-select-toggle'));}
  const bar=tabs(WORK_TABS,parity.workTab,id=>{parity.workTab=id;parity.templateID=null;resetCatalogPage('works');if(id==='trash'||id==='templates')finishSelection(parity);render();});header?.after(bar);
  if(parity.workTab==='trash'){actions?.replaceChildren();mountRecentlyDeleted(c,'project');return;}
  if(parity.workTab==='templates'){mountJournalTemplateGallery(c,parity);return;}
  bindWorksCards(c,view.querySelectorAll('.grid .card[data-act="open-project"]'));
  if(parity.workTab==='all'||parity.workTab==='snapshot'){const grid=view.querySelector('.grid');if(grid){for(const [label,action] of (parity.workTab==='all'?[['导入作品','import'],['空白创作','new-project']]:[['导入画面快照','snapshot']]).reverse()){const tile=document.createElement('button');tile.type='button';tile.className='card work-entry';tile.innerHTML=`<div class="card-image">＋</div><div class="card-body"><h3>${label}</h3><p>${action==='snapshot'?'保存独立、不可编辑的图片':action==='import'?'从照片或文件收进作品':'从一张空白页面开始'}</p></div>`;tile.onclick=()=>action==='snapshot'?c.handle('import-snapshot'):view.querySelector(action==='import'?'#work-import':'#work-create')?.click();grid.prepend(tile);}}}
  if(filters){const grid=view.querySelector('.works-grid'),search=filters.querySelector('#work-search'),kind=filters.querySelector('#work-kind'),status=filters.querySelector('#work-status'),sort=filters.querySelector('#work-sort'),count=filters.querySelector('span');
    if(!status.querySelector('[value="favorite"]')){const option=document.createElement('option');option.value='favorite';option.textContent='已收藏';status.append(option);}
    const saved=parity.workFilters||{query:'',kind:'all',status:'all',sort:'access-desc'};search.value=saved.query;kind.value=saved.kind;status.value=saved.status;sort.value=saved.sort;
    const update=()=>{const q=search.value.trim().toLocaleLowerCase(),cards=[...grid.querySelectorAll('.card[data-id]')];
      parity.workFilters={query:search.value,kind:kind.value,status:status.value,sort:sort.value};
      cards.sort((a,b)=>{const x=state.projects.find(p=>p.id===a.dataset.id),y=state.projects.find(p=>p.id===b.dataset.id);const key=sort.value.startsWith('name')?'title':sort.value.startsWith('updated')?'updatedAt':'lastOpenedAt';const compare=key==='title'?x.title.localeCompare(y.title,'zh-CN'):Date.parse(x[key]||x.updatedAt)-Date.parse(y[key]||y.updatedAt);return sort.value.endsWith('-asc')?compare:-compare;});
      cards.forEach(card=>grid.append(card));applyCatalogPage({view,key:'works',cards,matched:card=>{const p=state.projects.find(x=>x.id===card.dataset.id);if(!p||!workInTab(p,parity.workTab))return false;const qOK=!q||`${p.title} ${(p.styleTags||p.tags||[]).join(' ')}`.toLocaleLowerCase().includes(q);const kindOK=kind.value==='all'||(kind.value==='created'?p.source!=='imported':p.source==='imported');const statusOK=status.value==='all'||(status.value==='favorite'?p.isSnapshot&&!!p.isFavorite:status.value==='used'?!!p.isUsed:status.value==='unused'?!p.isUsed:true);return qOK&&kindOK&&statusOK;},countNode:count,size:state.preferences.maxPageItems});};view.catalogRefresh=update;
    for(const el of [search,kind,status,sort])el.addEventListener(el===search?'input':'change',()=>{resetCatalogPage('works');update();});update();}
}
// Called for newly inserted/replaced cards after a keyed catalog refresh.
// Existing cards keep their long-press and selection handlers.
export function bindWorksCards(c,cards){
  const {state,view}=c;
  for(const card of view.querySelectorAll('.grid .card[data-act="open-project"]')){const p=state.projects.find(x=>x.id===card.dataset.id);if(p){card.hidden=!workInTab(p,parity.workTab);if(p.isSnapshot&&p.isFavorite)card.querySelector('h3')?.insertAdjacentHTML('beforeend',' <span class="card-favorite" aria-label="已收藏">♥</span>');}
    bindLongPress(card,()=>{state.previewProjectID=card.dataset.id;c.handle('project-meta');},()=>!parity.selectionMode);
    card.addEventListener('click',e=>{if(!selectionActive(parity,'work'))return;e.stopImmediatePropagation();parity.selected.has(card.dataset.id)?parity.selected.delete(card.dataset.id):parity.selected.add(card.dataset.id);view.selectionRefresh?.();},true);
  }
}
function mountMatching(c){const {state,view}=c;c.matchingSession?.hydrate(view.querySelector('.match-previews'));for(const [id,key] of [['match-style','matchStyle'],['match-ratio','matchRatio'],['match-mode','matchMode'],['match-intent','matchIntent'],['match-purpose','matchPurpose'],['match-processing','matchProcessing'],['match-paper-width','customPaperWidth'],['match-paper-height','customPaperHeight']]){const el=view.querySelector('#'+id);if(!el)continue;if(id==='match-processing')el.value=state[key];el.onchange=()=>{if(el.multiple){const values=[...el.selectedOptions].map(o=>o.value);state[id==='match-style'?'matchStyles':'matchPurposes']=values;state[key]=values[0]||'';}else state[key]=el.value;if(id==='match-ratio')view.querySelector('.matching-page')?.classList.toggle('custom-paper',el.value==='custom');};}for(const select of view.querySelectorAll('.match-direction-choice'))select.onchange=()=>{const id=select.dataset.direction==='style'?'match-style':'match-purpose',hidden=view.querySelector('#'+id),chosen=new Set([...view.querySelectorAll(`.match-direction-choice[data-direction="${select.dataset.direction}"]`)].map(x=>x.value).filter(Boolean));for(const option of hidden.options)option.selected=chosen.has(option.value);hidden.dispatchEvent(new Event('change',{bubbles:true}));};}
function mountImport(c){ /* Import navigation and source buttons are rendered by app.js. */ }
