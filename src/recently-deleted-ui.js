// Recently deleted is a view over the existing trash store, never a second copy
// of the library. Keep image blobs: other works may still reference them.
export function mountRecentlyDeleted(c,kind){
  const {view,state,db,render,toast,esc}=c;
  view.querySelectorAll('.filters,.swift-series-controls,.grid').forEach(n=>n.remove());
  const list=document.createElement('section');list.className='recently-deleted-list';list.setAttribute('aria-label','最近删除');
  const records=state.trash.filter(t=>t.kind===kind).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  list.innerHTML=records.length?records.map(t=>'<article class="deleted-row"><div><strong>'+esc(t.item.title)+'</strong><small>'+new Date(t.date).toLocaleDateString()+'</small></div><button type="button" class="btn" data-recover="'+esc(t.id)+'">恢复</button><button type="button" class="btn danger" data-remove="'+esc(t.id)+'">彻底删除</button></article>').join(''):'<p class="empty">没有最近删除的'+(kind==='asset'?'素材':'作品')+'。</p>';
  const act=async(id,recover,b)=>{const t=state.trash.find(t=>t.id===id);if(!t)return;if(!recover&&!confirm('彻底删除「'+t.item.title+'」？此操作不能撤销。'))return;b.disabled=true;try{const store=kind==='asset'?'assets':'projects';await db.transaction(recover?[store,'trash']:['trash'],tx=>{if(recover)tx.objectStore(store).put(t.item);tx.objectStore('trash').delete(t.id);});if(recover){const items=state[store],i=items.findIndex(x=>x.id===t.item.id);if(i<0)items.push(t.item);else items[i]=t.item;}state.trash=state.trash.filter(x=>x.id!==id);render();toast(recover?'已恢复':'已彻底删除，无法撤销');}catch(e){toast(e.message);b.disabled=false;}};
  list.querySelectorAll('[data-recover]').forEach(b=>b.onclick=()=>act(b.dataset.recover,true,b));list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>act(b.dataset.remove,false,b));view.append(list);
}
