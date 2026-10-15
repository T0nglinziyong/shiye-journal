// Interaction placement follows the Swift 2.0.10 views. Core records remain
// owned by app.js; this module adds the missing screen controls and actions.
import {reusePagePreviews} from './preview-content-cache.js';
import {mountSeriesContents,mountSeriesAddition} from './series-contents.js';
import {toggleSelection,selectionActive} from './library-selection-model.js';
import {bindLongPress} from './long-press.js';
import {workInTab} from './work-collections.js';
import {applyCatalogPage,resetCatalogPage} from './catalog-pagination.js';
export const parity={libraryTab:'series',selectionMode:null,showOnlySelected:false,selected:new Set(),workTab:'all',route:null,templateID:null,templateSide:'template',seriesScrollY:0,restoreSeriesScroll:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountParityControls(ctx){
  const {state,view}=ctx;
  reusePagePreviews(ctx);
  if(state.route==='library')mountLibrary(ctx);
  if(state.route==='works')mountWorks(ctx);
}
function button(label,fn,kind=''){const b=document.createElement('button');b.type='button';b.className=`btn ${kind}`;b.textContent=label;b.onclick=fn;return b;}
function mountLibrary(c){
  if(c.state.seriesID==='all'&&parity.libraryTab==='trash')return;
  if(c.state.series.some(s=>s.id===c.state.seriesID)){mountSeriesContents(c,parity);return;}
  if(c.state.addingToSeries&&mountSeriesAddition(c,parity))return;
  const {state,view,route}=c,header=view.querySelector('.view-head'),actions=header?.querySelector('.actions');
  const insideSeries=state.seriesID!=='all';
  const title=insideSeries?(state.series.find(s=>s.id===state.seriesID)?.title||'系列'):'我的素材';
  const heading=header?.querySelector('h1');
  if(heading&&heading.textContent!==title)heading.textContent=title;
  if(insideSeries){const back=button('‹ 返回素材库',()=>route('series'));back.classList.add('series-back');header?.prepend(back);}
  actions?.prepend(button(parity.selectionMode?'完成':'选择',()=>{toggleSelection(parity,'asset');view.selectionRefresh?.();},'library-select-toggle'));
  if(insideSeries){header?.querySelector('.actions')?.append(button('编辑系列',()=>c.openSeriesEditor?.(state.seriesID)));}
}
function mountWorks(c){const {state,view}=c,header=view.querySelector('.view-head'),filters=view.querySelector('.filters');
  if(parity.workTab==='trash')return;
  const actions=header?.querySelector('.actions');if(actions&&parity.workTab!=='templates'){actions.append(button(parity.selectionMode?'完成':'选择',()=>{toggleSelection(parity,'work');view.selectionRefresh?.();},'library-select-toggle'));}
  if(parity.workTab==='templates')return;
  bindWorksCards(c,view.querySelectorAll('.grid .card[data-act="open-project"]'));
  if(filters){const grid=view.querySelector('.works-grid'),search=filters.querySelector('#work-search'),kind=filters.querySelector('#work-kind'),status=filters.querySelector('#work-status'),sort=filters.querySelector('#work-sort'),count=filters.querySelector('span');
    if(!status.querySelector('[value="favorite"]')){const option=document.createElement('option');option.value='favorite';option.textContent='已收藏';status.append(option);}
    const saved=parity.workFilters||{query:'',kind:'all',status:'all',sort:'access-desc'};search.value=saved.query;kind.value=saved.kind;status.value=saved.status;sort.value=saved.sort;
    const update=()=>{const q=search.value.trim().toLocaleLowerCase(),cards=[...grid.querySelectorAll('.card[data-id]')];
      parity.workFilters={query:search.value,kind:kind.value,status:status.value,sort:sort.value};
      cards.sort((a,b)=>{const x=state.projects.find(p=>p.id===a.dataset.id),y=state.projects.find(p=>p.id===b.dataset.id);const key=sort.value.startsWith('name')?'title':sort.value.startsWith('updated')?'updatedAt':'lastOpenedAt';const compare=key==='title'?x.title.localeCompare(y.title,'zh-CN'):Date.parse(x[key]||x.updatedAt)-Date.parse(y[key]||y.updatedAt);return sort.value.endsWith('-asc')?compare:-compare;});
      cards.forEach((card,index)=>{card.style.order=String(index+1);});applyCatalogPage({view,key:'works',cards,matched:card=>{const p=state.projects.find(x=>x.id===card.dataset.id);if(!p||!workInTab(p,parity.workTab))return false;const qOK=!q||`${p.title} ${(p.styleTags||p.tags||[]).join(' ')}`.toLocaleLowerCase().includes(q);const kindOK=kind.value==='all'||(kind.value==='created'?p.source!=='imported':p.source==='imported');const statusOK=status.value==='all'||(status.value==='favorite'?p.isSnapshot&&!!p.isFavorite:status.value==='used'?!!p.isUsed:status.value==='unused'?!p.isUsed:true);return qOK&&kindOK&&statusOK;},countNode:count,size:state.preferences.maxPageItems});};view.catalogRefresh=update;
    for(const el of [search,kind,status,sort])el.addEventListener(el===search?'input':'change',()=>{resetCatalogPage('works');update();});update();}
}
// Called for newly inserted/replaced cards after a keyed catalog refresh.
// Existing cards keep their long-press and selection handlers.
const boundWorkCards=new WeakSet();
export function bindWorksCards(c,cards){
  const {state,view}=c;
  for(const card of cards){if(boundWorkCards.has(card))continue;boundWorkCards.add(card);const p=state.projects.find(x=>x.id===card.dataset.id);if(p){card.hidden=!workInTab(p,parity.workTab);}
    bindLongPress(card,()=>{state.previewProjectID=card.dataset.id;c.handle('project-meta');},()=>!parity.selectionMode);
    card.addEventListener('click',e=>{if(!selectionActive(parity,'work'))return;e.stopImmediatePropagation();parity.selected.has(card.dataset.id)?parity.selected.delete(card.dataset.id):parity.selected.add(card.dataset.id);view.selectionRefresh?.();},true);
  }
}
