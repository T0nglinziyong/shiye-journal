import {seriesCovers,seriesMembers} from './library-model.js';

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
  const add=()=>{state.addingToSeries=id;state.seriesID='all';state.query='';state.kind='all';state.status='all';state.libraryRecent=false;p.selection=true;p.selected.clear();route('library');};
  view.querySelector('#series-add-assets').onclick=add;view.querySelector('#series-add-assets').disabled=p.selection;
  const sync=()=>{for(const card of cards){const selected=p.selected.has(card.dataset.id);card.classList.toggle('batch-selected',selected);if(p.selection)card.setAttribute('aria-pressed',String(selected));}const n=view.querySelector('.swift-tray.manage strong');if(n)n.textContent='本次选中 '+p.selected.size+' 件';view.querySelectorAll('[data-requires-selection]').forEach(b=>b.disabled=!p.selected.size);};
  const clear=()=>{p.selected.clear();sync();},select=()=>{p.selection=true;cards.filter(b=>!b.hidden).forEach(b=>p.selected.add(b.dataset.id));render();};
  const addBasket=()=>{state.basket=[...new Set([...state.basket,...p.selected])];p.selected.clear();p.selection=false;render();c.toast('已添加，在搭配页面中查看');};
  const move=()=>{if(!p.selected.size)return;body.innerHTML='<div class="dialog-head"><h2>移动 '+p.selected.size+' 件素材</h2></div><input id="series-target-search" placeholder="搜索目标系列" aria-label="搜索目标系列"><div class="stack" id="series-target-list"></div>';const list=body.querySelector('#series-target-list');
    const show=()=>{list.replaceChildren();for(const target of [{id:null,title:'不归入系列'},...state.series].filter(x=>!x.id||x.title.includes(body.querySelector('#series-target-search').value)))list.append(button(target.title,async()=>{await assign(c,p.selected,target.id);p.selected.clear();p.selection=false;modal.close();render();}));};body.querySelector('#series-target-search').oninput=show;show();modal.showModal();};
  const remove=async()=>{if(!confirm('删除这个系列并保留素材？系列中的素材仍会留在素材库。'))return;const revised=state.assets.filter(a=>a.seriesID===id).map(a=>({...a,seriesID:null}));await c.db.transaction(['assets','series'],tx=>{tx.objectStore('series').delete(id);for(const a of revised)tx.objectStore('assets').put(a);});state.series=state.series.filter(x=>x.id!==id);for(const a of revised)Object.assign(state.assets.find(x=>x.id===a.id),a);route('series');};
  const actions=view.querySelector('#series-actions');actions.append(button('批量',()=>{body.innerHTML='<h2>系列批量操作</h2><div class="stack" id="series-batch-menu"></div>';const list=body.querySelector('#series-batch-menu');for(const [label,fn] of [['全选当前结果',select],['清空选择',()=>{p.selected.clear();render();}],['编辑系列',()=>c.openSeriesEditor(id)],['全系列加入搭配',()=>{state.basket=[...new Set([...state.basket,...state.assets.filter(a=>a.seriesID===id&&!a.isProjectInternal).map(a=>a.id)])];c.toast('已添加，在搭配页面中查看');}],['删除系列',remove]])list.append(button(label,async()=>{modal.close();await fn();}));modal.showModal();}),button(p.selection?'完成':'选择',()=>{p.selection=!p.selection;p.selected.clear();render();}));
  for(const card of cards) {
    card.addEventListener('click',e=>{if(!p.selection)return;e.stopImmediatePropagation();e.preventDefault();p.selected.has(card.dataset.id)?p.selected.delete(card.dataset.id):p.selected.add(card.dataset.id);sync();},true);
    const menu=()=>{const aid=card.dataset.id;body.innerHTML='<h2>素材操作</h2><div class="stack" id="series-member-menu"></div>';const list=body.querySelector('#series-member-menu');list.append(button('查看详情',()=>{modal.close();c.openLibraryAsset(aid);}),button('设为系列封面',async()=>{const next={...s,coverAssetIDs:[aid],coverAssetID:aid,updatedAt:new Date().toISOString()};await c.db.put('series',next);Object.assign(s,next);modal.close();render();}),button('移出系列',async()=>{await assign(c,new Set([aid]),null);modal.close();render();}));modal.showModal();};
    card.oncontextmenu=e=>{e.preventDefault();menu();};card.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();menu();}};
  }
  if(p.selection){const tray=document.createElement('div');tray.className='swift-tray manage';tray.innerHTML='<strong></strong>';tray.append(button('全选当前结果',select),button('清空选择',clear));for(const [label,fn] of [['加入搭配',addBasket],['加入系列',move]]){const b=button(label,fn);b.dataset.requiresSelection='';tray.append(b);}view.querySelector('.series-contents').append(tray);}sync();update();
}
export function mountSeriesAddition(c,p) {
  const id=c.state.addingToSeries,s=c.state.series.find(s=>s.id===id);if(!s){c.state.addingToSeries=null;return false;}
  const {view,state,render,route}=c;view.querySelector('.view-head h1').textContent='为「'+s.title+'」添加素材';
  const done=async()=>{await assign(c,p.selected,id);state.addingToSeries=null;p.selection=false;p.selected.clear();state.seriesID=id;render();c.toast('素材已加入系列');};
  view.querySelector('.view-head .actions').append(button('取消',()=>{state.addingToSeries=null;p.selection=false;p.selected.clear();state.seriesID=id;route('library');}));
  const tray=document.createElement('div');tray.className='swift-tray manage';const n=document.createElement('strong');tray.append(n);
  const save=button('加入系列并返回',done,'primary');tray.append(save);view.append(tray);const sync=()=>{n.textContent='本次选中 '+p.selected.size+' 件';save.disabled=!p.selected.size;for(const card of view.querySelectorAll('[data-act="detail"]')){card.classList.toggle('batch-selected',p.selected.has(card.dataset.id));card.setAttribute('aria-pressed',String(p.selected.has(card.dataset.id)));}};
  for(const card of view.querySelectorAll('[data-act="detail"]'))card.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();p.selected.has(card.dataset.id)?p.selected.delete(card.dataset.id):p.selected.add(card.dataset.id);sync();},true);
  tray.insertBefore(button('全选当前结果',()=>{view.querySelectorAll('[data-act="detail"]:not([hidden])').forEach(b=>p.selected.add(b.dataset.id));sync();}),save);tray.insertBefore(button('清空选择',()=>{p.selected.clear();sync();}),save);sync();return true;
}
