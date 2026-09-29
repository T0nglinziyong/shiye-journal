// Interaction placement follows the Swift 2.0.10 views. Core records remain
// owned by app.js; this module adds the missing screen controls and actions.
import {mountSeriesContents,mountSeriesAddition} from './series-contents.js';
import {beginSelection,finishSelection,syncSelectionScope} from './library-selection-model.js';
import {mountRecentlyDeleted} from './recently-deleted-ui.js';
import {bindLongPress} from './long-press.js';
import {openPopover,closePopover} from './swift-popover.js';
export const parity={libraryTab:'series',selection:false,selectionMode:null,showOnlySelected:false,selected:new Set(),workTab:'all',route:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountParityControls(ctx){
  const {state,view}=ctx;
  syncSelectionScope(parity,state.route);
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
  actions?.prepend(button(parity.selection?'完成':'选择',()=>{parity.selection?finishSelection(parity):beginSelection(parity,'asset');view.selectionRefresh?.()||render();},'library-select-toggle'));
  const bar=tabs([['series','系列'],['all','全部素材'],['pending','待检测'],['trash','最近删除']],parity.libraryTab,id=>{
    parity.libraryTab=id;
    if(id==='series'){route('series');return;}
    state.seriesID='all';state.status=id==='pending'?'pendingReview':'all';state.libraryRecent=false;state.sort='newest';if(id==='trash')finishSelection(parity);render();
  });if(!insideSeries)header?.after(bar);
  if(!insideSeries&&parity.libraryTab==='trash'){actions?.replaceChildren();mountRecentlyDeleted(c,'asset');return;}
  if(insideSeries){header?.querySelector('.actions')?.append(button('编辑系列',()=>c.openSeriesEditor?.(state.seriesID)));}
}
function mountSeries(c){const {view,route,state,render}=c,header=view.querySelector('.view-head'),grid=view.querySelector('.grid');header?.querySelector('h1')?.replaceChildren('我的素材');const bar=tabs([['series','系列'],['all','全部素材'],['pending','待检测'],['trash','最近删除']],'series',id=>{if(id==='series')return;parity.libraryTab=id;state.status=id==='pending'?'pendingReview':'all';state.libraryRecent=false;route('library');});header?.after(bar);
  const controls=document.createElement('div');controls.className='swift-series-controls';controls.innerHTML='<input type="search" placeholder="搜索系列、素材或标签" aria-label="搜索系列"><select aria-label="系列排序"><option value="recent">最近更新</option><option value="name">名称</option></select><span></span>';bar.after(controls);
  const cards=[...view.querySelectorAll('.grid .card[data-act="series-detail"]')], count=controls.querySelector('span');
  const filter=()=>{const q=controls.querySelector('input').value.trim().toLocaleLowerCase();let shown=0;for(const card of cards){const series=state.series.find(x=>x.id===card.dataset.id);card.hidden=!!q&&!(`${series?.title||''} ${series?.introduction||''} ${state.assets.filter(a=>a.seriesID===series?.id).map(a=>a.title).join(' ')}`.toLocaleLowerCase().includes(q));if(!card.hidden)shown++;}count.textContent=`${shown} 项`;};
  controls.querySelector('input').oninput=filter;controls.querySelector('select').onchange=e=>{if(e.target.value==='name')cards.sort((a,b)=>(state.series.find(x=>x.id===a.dataset.id)?.title||'').localeCompare(state.series.find(x=>x.id===b.dataset.id)?.title||''));else cards.sort((a,b)=>(state.series.find(x=>x.id===b.dataset.id)?.updatedAt||'').localeCompare(state.series.find(x=>x.id===a.dataset.id)?.updatedAt||''));cards.forEach(card=>grid.append(card));};filter();
  if(grid){const tile=document.createElement('button');tile.type='button';tile.className='series-entry';tile.innerHTML='<div class="series-entry-cover">＋</div><strong>新建系列</strong><small>把喜欢的素材放在一起</small>';tile.onclick=()=>c.openSeriesEditor();grid.prepend(tile);}}
function mountWorks(c){const {state,view,render}=c,header=view.querySelector('.view-head'),filters=view.querySelector('.filters');
  const actions=header?.querySelector('.actions');if(actions){actions.append(button(parity.selection?'完成':'选择',()=>{parity.selection?finishSelection(parity):beginSelection(parity,'work');view.selectionRefresh?.()||render();},'library-select-toggle'));}
  const bar=tabs([['template','模板'],['all','全部作品'],['draft','草稿'],['trash','最近删除']],parity.workTab,id=>{parity.workTab=id;if(id==='trash')finishSelection(parity);render();});header?.after(bar);
  if(parity.workTab==='trash'){actions?.replaceChildren();mountRecentlyDeleted(c,'project');return;}
  for(const card of view.querySelectorAll('.grid .card[data-act="open-project"]')){const p=state.projects.find(x=>x.id===card.dataset.id);if(p)card.hidden=parity.workTab==='draft'?!p.isDraft:parity.workTab==='recent'?p.isDraft||Date.now()-Date.parse(p.updatedAt)>30*864e5:!!p.isDraft;
    bindLongPress(card,()=>{state.previewProjectID=card.dataset.id;c.handle('project-meta');},()=>!parity.selection);
    card.addEventListener('click',e=>{if(!parity.selection)return;e.stopImmediatePropagation();parity.selected.has(card.dataset.id)?parity.selected.delete(card.dataset.id):parity.selected.add(card.dataset.id);view.selectionRefresh?.();},true);
  }
  if(parity.workTab==='all'){const grid=view.querySelector('.grid');if(grid){for(const [label,action] of [['导入作品','import'],['空白创作','new-project']].reverse()){const tile=document.createElement('button');tile.type='button';tile.className='card work-entry';tile.innerHTML=`<div class="card-image">＋</div><div class="card-body"><h3>${label}</h3><p>${action==='import'?'从照片或文件收进作品':'从一张空白页面开始'}</p></div>`;tile.onclick=()=>view.querySelector(action==='import'?'#work-import':'#work-create')?.click();grid.prepend(tile);}}}
  if(filters){const grid=view.querySelector('.works-grid'),search=filters.querySelector('#work-search'),kind=filters.querySelector('#work-kind'),status=filters.querySelector('#work-status'),sort=filters.querySelector('#work-sort'),count=filters.querySelector('span');
    const saved=parity.workFilters||{query:'',kind:'all',status:'all',sort:'access-desc'};search.value=saved.query;kind.value=saved.kind;status.value=saved.status;sort.value=saved.sort;
    const update=()=>{const q=search.value.trim().toLocaleLowerCase(),cards=[...grid.querySelectorAll('.card[data-id]')];let shown=0;
      parity.workFilters={query:search.value,kind:kind.value,status:status.value,sort:sort.value};
      cards.sort((a,b)=>{const x=state.projects.find(p=>p.id===a.dataset.id),y=state.projects.find(p=>p.id===b.dataset.id);const key=sort.value.startsWith('name')?'title':sort.value.startsWith('updated')?'updatedAt':'lastOpenedAt';const compare=key==='title'?x.title.localeCompare(y.title,'zh-CN'):Date.parse(x[key]||x.updatedAt)-Date.parse(y[key]||y.updatedAt);return sort.value.endsWith('-asc')?compare:-compare;});
      cards.forEach(card=>{const p=state.projects.find(x=>x.id===card.dataset.id);const tabOK=parity.workTab==='draft'?!!p.isDraft:!p.isDraft&&(parity.workTab!=='template'||!!p.isTemplate);const qOK=!q||`${p.title} ${(p.styleTags||p.tags||[]).join(' ')}`.toLocaleLowerCase().includes(q);const kindOK=kind.value==='all'||(kind.value==='created'?p.source!=='imported':p.source==='imported');const statusOK=status.value==='all'||(status.value==='template'?!!p.isTemplate:status.value==='normal'?!p.isTemplate:status.value==='used'?!!p.isUsed:!p.isUsed);card.hidden=!(tabOK&&qOK&&kindOK&&statusOK);if(!card.hidden)shown++;grid.append(card);});count.textContent=`${shown} 项`;};
    for(const el of [search,kind,status,sort])el.addEventListener(el===search?'input':'change',update);update();}
}
function mountMatching(c){const {state,view}=c;for(const [id,key] of [['match-style','matchStyle'],['match-ratio','matchRatio'],['match-mode','matchMode'],['match-intent','matchIntent'],['match-purpose','matchPurpose'],['match-processing','matchProcessing'],['match-paper-width','customPaperWidth'],['match-paper-height','customPaperHeight']]){const el=view.querySelector('#'+id);if(!el)continue;if(id==='match-processing')el.value=state[key];el.onchange=()=>{state[key]=el.value;if(el.multiple)state[id==='match-style'?'matchStyles':'matchPurposes']=[...el.selectedOptions].map(o=>o.value);if(id==='match-ratio')view.querySelector('.matching-page')?.classList.toggle('custom-paper',el.value==='custom');};}for(const id of ['match-style','match-purpose']){const select=view.querySelector('#'+id);if(!select)continue;select.hidden=true;const trigger=button('',()=>{if(trigger.getAttribute('aria-expanded')==='true'){closePopover();return;}const p=openPopover(trigger,{title:id==='match-style'?'页面风格（可多选）':'页面用途（可多选）',width:300});for(const option of select.options){const row=document.createElement('label'),check=document.createElement('input');row.className='match-multi-option';check.type='checkbox';check.checked=option.selected;check.onchange=()=>{if(!check.checked&&select.selectedOptions.length===1){check.checked=true;return;}option.selected=check.checked;select.dispatchEvent(new Event('change',{bubbles:true}));sync();};row.append(check,document.createTextNode(option.textContent));p.content.append(row);}});trigger.className='match-multi-trigger';trigger.setAttribute('aria-label',id==='match-style'?'页面风格':'页面用途');const sync=()=>{trigger.textContent=[...select.selectedOptions].map(o=>o.textContent).join('、')+'　⌃⌄';};select.after(trigger);sync();}}
function mountImport(c){ /* Import navigation and source buttons are rendered by app.js. */ }
