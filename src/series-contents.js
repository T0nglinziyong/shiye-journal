import {beginSelection,finishSelection} from './library-selection-model.js';
import {seriesCovers,seriesMembers} from './library-model.js';
import {bindLongPress} from './long-press.js';

const filtersByID=new Map();
const filters=id=>{if(!filtersByID.has(id))filtersByID.set(id,{query:'',kind:'all',status:'all',sort:'recent',ascending:false});return filtersByID.get(id);};
const kinds=[['sticker','贴纸'],['paper','纸张'],['tape','胶带'],['photo','照片'],['text','文字'],['reference','参考']];
function button(label,action,kind='') {
  const b=document.createElement('button');b.type='button';b.className='btn '+kind;b.textContent=label;
  b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){const t=document.querySelector('#toast');t.textContent=e.message;t.classList.add('show');}finally{b.disabled=false;}};return b;
}
export function renderSeriesContents({state,esc,imgTag,assetCard}) {
  const s=state.series.find(s=>s.id===state.seriesID);if(!s)return '<p>系列已移走</p>';
  const f=filters(s.id),members=seriesMembers(s.id,state.assets,state.projects,f),all=state.assets.filter(a=>a.seriesID===s.id&&!a.isProjectInternal);
  const options=(list,value)=>list.map(([v,label])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+label+'</option>').join('');
  return '<section class="series-contents"><div class="series-navigation"><button type="button" class="btn" id="series-return">‹ 返回素材库</button><button type="button" class="btn" id="all-series">所有系列</button></div>'+
    '<div class="view-head series-heading"><div class="series-identity"><div class="series-detail-cover">'+seriesCovers(s,state.assets).map(imgTag).join('')+'</div><div class="series-copy"><div class="eyebrow">COLLECTION</div><h1><button type="button" id="series-edit-title" aria-label="编辑系列信息与标签">'+esc(s.title)+' <span aria-hidden="true">✎</span></button></h1>'+
    (s.introduction?'<p>'+esc(s.introduction)+'</p>':'')+'<p class="series-tags">'+esc([...(s.styleTags||[]),...(s.semanticTags||[])].join(' · '))+'</p><p>'+all.length+' 件素材</p></div></div><div class="actions" id="series-actions"></div></div>'+
    '<div class="series-filters"><input type="search" id="series-search" aria-label="在这个系列中搜索" placeholder="在这个系列中搜索" value="'+esc(f.query)+'"><div class="series-filter-menus"><select id="series-kind" aria-label="系列素材类型">'+options([['all','全部类型'],...kinds],f.kind)+'</select><select id="series-status" aria-label="系列素材状态">'+options([['all','全部状态'],['ready','已整理'],['unready','未整理'],['used','已使用'],['unused','未使用'],['inside','系列中'],['outside','系列外']],f.status)+'</select><select id="series-sort" aria-label="系列素材排序">'+options([['recent','最近添加'],['name','名称']],f.sort)+'</select><button class="btn" id="series-order">'+(f.ascending?'升序 ↑':'降序 ↓')+'</button></div></div>'+
    '<div class="grid asset-grid '+(state.preferences.display==='list'?'list-grid':'')+'"><button type="button" class="card action-card" id="series-add-assets"><div class="card-image">＋</div><div class="card-body"><h3>添加素材</h3><p>从全部素材选择</p></div></button>'+all.map(assetCard).join('')+'</div><p class="series-result-count">'+members.length+' 项</p></section>';
}
async function assign(c,ids,to) {
  const revised=c.state.assets.filter(a=>ids.has(a.id)).map(a=>({...a,seriesID:to}));
  await c.db.transaction(['assets'],tx=>{for(const a of revised)tx.objectStore('assets').put(a);});
  for(const a of revised)Object.assign(c.state.assets.find(x=>x.id===a.id),a);
}
export function mountSeriesContents(c,p) {
  const {state,view,render,route,body,modal}=c,id=state.seriesID,s=state.series.find(s=>s.id===id);if(!s)return;
  const f=filters(id),cards=[...view.querySelectorAll('[data-act="detail"]')];
  view.querySelector('#series-return').onclick=()=>c.libraryBack();view.querySelector('#all-series').onclick=()=>route('series');
  view.querySelector('#series-edit-title').onclick=()=>c.openSeriesEditor(id);
  const update=()=>{const members=seriesMembers(id,state.assets,state.projects,f),ids=new Set(members.map(a=>a.id)),grid=view.querySelector('.asset-grid');
    for(const a of members){const card=cards.find(b=>b.dataset.id===a.id);if(card)grid.append(card);}for(const card of cards)card.hidden=!ids.has(card.dataset.id);view.querySelector('.series-result-count').textContent=members.length+' 项';};
  // Render every member once, then filter without losing search focus.
  for(const [selector,key] of [['#series-search','query'],['#series-kind','kind'],['#series-status','status'],['#series-sort','sort']]) {
    const el=view.querySelector(selector);el.oninput=el.onchange=()=>{f[key]=el.value;update();};
  }
  view.querySelector('#series-order').onclick=()=>{f.ascending=!f.ascending;view.querySelector('#series-order').textContent=f.ascending?'升序 ↑':'降序 ↓';update();};
  const add=()=>{state.addingToSeries=id;state.seriesID='all';state.query='';state.kind='all';state.status='all';state.libraryRecent=false;beginSelection(p,'asset');route('library');};
  view.querySelector('#series-add-assets').onclick=add;view.querySelector('#series-add-assets').disabled=p.selection;
  const actions=view.querySelector('#series-actions');actions.append(button(p.selection?'完成':'选择',()=>{if(p.selection)finishSelection(p);else beginSelection(p,'asset');render();}));
  for(const card of cards) {
    bindLongPress(card,()=>c.openAssetEditor(card.dataset.id),()=>!(p.selection&&p.selectionMode==='asset'));
  }
  update();
}
export function mountSeriesAddition(c,p) {
  const id=c.state.addingToSeries,s=c.state.series.find(s=>s.id===id);if(!s){c.state.addingToSeries=null;return false;}
  const {view,state,render,route}=c;view.querySelector('.view-head h1').textContent='为「'+s.title+'」添加素材';
  const done=async()=>{await assign(c,p.selected,id);state.addingToSeries=null;finishSelection(p);state.seriesID=id;render();c.toast('素材已加入系列');};
  view.querySelector('.view-head .actions').append(button('取消',()=>{state.addingToSeries=null;finishSelection(p);state.seriesID=id;route('library');}));
  const tray=document.createElement('div');tray.className='swift-tray manage';const n=document.createElement('strong');tray.append(n);
  const save=button('加入系列并返回',done,'primary');tray.append(save);view.append(tray);const sync=()=>{n.textContent='本次选中 '+p.selected.size+' 件';save.disabled=!p.selected.size;for(const card of view.querySelectorAll('[data-act="detail"]')){card.classList.toggle('batch-selected',p.selected.has(card.dataset.id));card.setAttribute('aria-pressed',String(p.selected.has(card.dataset.id)));}};
  for(const card of view.querySelectorAll('[data-act="detail"]'))card.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();p.selected.has(card.dataset.id)?p.selected.delete(card.dataset.id):p.selected.add(card.dataset.id);sync();},true);
  tray.insertBefore(button('全选当前结果',()=>{view.querySelectorAll('[data-act="detail"]:not([hidden])').forEach(b=>p.selected.add(b.dataset.id));sync();}),save);tray.insertBefore(button('清空选择',()=>{p.selected.clear();sync();}),save);sync();return true;
}
