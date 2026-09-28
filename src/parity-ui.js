// Interaction placement follows the Swift 2.0.10 views. Core records remain
// owned by app.js; this module adds the missing screen controls and actions.
const parity={libraryTab:'series',selection:false,selected:new Set(),workTab:'all'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountParityControls(ctx){
  const {state,view}=ctx;
  if(state.route==='library')mountLibrary(ctx);
  if(state.route==='series')mountSeries(ctx);
  if(state.route==='works')mountWorks(ctx);
  if(state.route==='matching')mountMatching(ctx);
  if(state.route==='import')mountImport(ctx);
  if(state.route==='editor')mountEditor(ctx);
}
function tabs(labels,active,onClick){const bar=document.createElement('div');bar.className='swift-tabs';for(const [id,label] of labels){const b=document.createElement('button');b.type='button';b.className=id===active?'selected':'';b.textContent=label;b.onclick=()=>onClick(id);bar.append(b);}return bar;}
function button(label,fn,kind=''){const b=document.createElement('button');b.type='button';b.className=`btn ${kind}`;b.textContent=label;b.onclick=fn;return b;}
function mountLibrary(c){
  const {state,view,render,route,toast,db}=c,header=view.querySelector('.view-head'),actions=header?.querySelector('.actions');
  const insideSeries=state.seriesID!=='all';
  header?.querySelector('h1')?.replaceChildren(insideSeries?(state.series.find(s=>s.id===state.seriesID)?.title||'系列'):'我的素材');
  if(insideSeries){const back=button('‹ 返回素材库',()=>route('series'));back.classList.add('series-back');header?.prepend(back);}
  actions?.prepend(button(parity.selection?'完成':'选择',()=>{parity.selection=!parity.selection;if(!parity.selection)parity.selected.clear();render();}));
  const batch=button('批量',()=>{parity.selection=true;render();});actions?.prepend(batch);
  const bar=tabs([['series','系列'],['all','全部素材'],['recent','最近添加'],['pending','待检查']],parity.libraryTab,id=>{
    parity.libraryTab=id;
    if(id==='series'){route('series');return;}
    state.seriesID='all';state.status=id==='pending'?'pendingReview':'all';state.sort='newest';render();
  });if(!insideSeries)header?.after(bar);
  if(insideSeries){header?.querySelector('.actions')?.append(button('编辑系列',()=>c.openSeriesEditor?.(state.seriesID)));}
  for(const card of view.querySelectorAll('.card[data-act="detail"]')){
    const id=card.dataset.id;
    if(parity.selection){card.classList.toggle('batch-selected',parity.selected.has(id));card.setAttribute('aria-pressed',String(parity.selected.has(id)));card.insertAdjacentHTML('beforeend',`<span class="batch-check">${parity.selected.has(id)?'☑':'□'}</span>`);}
    card.addEventListener('click',event=>{if(!parity.selection)return;event.stopImmediatePropagation();event.preventDefault();parity.selected.has(id)?parity.selected.delete(id):parity.selected.add(id);syncLibrarySelection(view);},true);
  }
  if(!parity.selection&&state.basket.length){const tray=document.createElement('div');tray.className='swift-tray';tray.innerHTML=`<strong>已选 ${state.basket.length} · 核心 ${state.matchCore?1:0}</strong><div class="tray-items">${state.basket.map(id=>{const a=state.assets.find(x=>x.id===id);return a?`<span>${esc(a.title)}</span>`:'';}).join('')}</div>`;tray.append(button('去搭配',()=>route('matching'),'primary'));view.append(tray);}
  if(!parity.selection)return;
  const tray=document.createElement('div');tray.className='swift-tray manage';tray.innerHTML=`<strong>本次选中 ${parity.selected.size} 件</strong>`;
  tray.append(button('全选当前结果',()=>{view.querySelectorAll('.card[data-act="detail"]:not([hidden])').forEach(card=>parity.selected.add(card.dataset.id));syncLibrarySelection(view);}));
  tray.append(button('清空选择',()=>{parity.selected.clear();syncLibrarySelection(view);}));
  tray.append(button('加入搭配',()=>{state.basket=[...new Set([...state.basket,...parity.selected])];parity.selected.clear();parity.selection=false;render();toast('已添加，在搭配页面中查看');},'primary'));
  tray.append(button('加入系列',()=>seriesPicker(c)));
  tray.append(button('删除',async()=>{if(!parity.selected.size||!confirm(`将 ${parity.selected.size} 件素材移到最近删除？`))return;const now=new Date().toISOString(),records=[...parity.selected].map(id=>state.assets.find(a=>a.id===id)).filter(Boolean),entries=records.map(a=>({id:crypto.randomUUID(),kind:'asset',item:structuredClone(a),date:now}));await db.transaction(['assets','trash'],tx=>{for(let i=0;i<records.length;i++){tx.objectStore('assets').delete(records[i].id);tx.objectStore('trash').put(entries[i]);}});state.assets=state.assets.filter(a=>!parity.selected.has(a.id));state.trash.push(...entries);state.basket=state.basket.filter(id=>!parity.selected.has(id));parity.selected.clear();parity.selection=false;render();},'danger'));
  view.append(tray);
}
function syncLibrarySelection(view){for(const card of view.querySelectorAll('.card[data-act="detail"]')){const selected=parity.selected.has(card.dataset.id);card.classList.toggle('batch-selected',selected);card.setAttribute('aria-pressed',String(selected));const check=card.querySelector('.batch-check');if(check)check.textContent=selected?'☑':'□';}const count=view.querySelector('.swift-tray.manage strong');if(count)count.textContent=`本次选中 ${parity.selected.size} 件`;}
function seriesPicker(c){const {state,body,modal,db,render,toast}=c;if(!parity.selected.size){toast('请先选择素材');return;}
  body.innerHTML=`<h2>加入系列</h2><p>选中的 ${parity.selected.size} 件素材会归入同一系列。</p><div class="stack"><button type="button" class="btn" data-series="">不归入系列</button>${state.series.map(s=>`<button type="button" class="btn" data-series="${s.id}">${esc(s.title)}</button>`).join('')}<label>新建系列<input id="new-batch-series" placeholder="系列名称"></label><button type="button" class="btn primary" id="create-batch-series">新建系列并归入</button></div>`;
  modal.showModal();const assign=async id=>{for(const aid of parity.selected){const a=state.assets.find(x=>x.id===aid);if(a){a.seriesID=id;await db.put('assets',a);}}parity.selected.clear();parity.selection=false;modal.close();render();toast('已加入系列');};
  body.querySelectorAll('[data-series]').forEach(b=>b.onclick=()=>assign(b.dataset.series||null));
  body.querySelector('#create-batch-series').onclick=async()=>{const title=body.querySelector('#new-batch-series').value.trim();if(!title){toast('请填写系列名称');return;}const series={id:crypto.randomUUID(),title,introduction:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await db.put('series',series);state.series.push(series);await assign(series.id);};
}
function mountSeries(c){const {view,route,state,render}=c,header=view.querySelector('.view-head'),grid=view.querySelector('.grid');header?.querySelector('h1')?.replaceChildren('我的素材');const bar=tabs([['series','系列'],['all','全部素材'],['recent','最近添加'],['pending','待检查']],'series',id=>{if(id==='series')return;parity.libraryTab=id;route('library');});header?.after(bar);
  const controls=document.createElement('div');controls.className='swift-series-controls';controls.innerHTML='<input type="search" placeholder="搜索系列、素材或标签" aria-label="搜索系列"><select aria-label="系列排序"><option value="recent">最近更新</option><option value="name">名称</option></select><span></span>';bar.after(controls);
  const cards=[...view.querySelectorAll('.grid .card[data-act="series-detail"]')], count=controls.querySelector('span');
  const filter=()=>{const q=controls.querySelector('input').value.trim().toLocaleLowerCase();let shown=0;for(const card of cards){const series=state.series.find(x=>x.id===card.dataset.id);card.hidden=!!q&&!(`${series?.title||''} ${series?.introduction||''} ${state.assets.filter(a=>a.seriesID===series?.id).map(a=>a.title).join(' ')}`.toLocaleLowerCase().includes(q));if(!card.hidden)shown++;}count.textContent=`${shown} 项`;};
  controls.querySelector('input').oninput=filter;controls.querySelector('select').onchange=e=>{if(e.target.value==='name')cards.sort((a,b)=>(state.series.find(x=>x.id===a.dataset.id)?.title||'').localeCompare(state.series.find(x=>x.id===b.dataset.id)?.title||''));else cards.sort((a,b)=>(state.series.find(x=>x.id===b.dataset.id)?.updatedAt||'').localeCompare(state.series.find(x=>x.id===a.dataset.id)?.updatedAt||''));cards.forEach(card=>grid.append(card));};filter();
  if(grid){const tile=document.createElement('button');tile.type='button';tile.className='series-entry';tile.innerHTML='<div class="series-entry-cover">＋</div><strong>新建系列</strong><small>把喜欢的素材放在一起</small>';tile.onclick=()=>c.openSeriesEditor();grid.prepend(tile);}}
function mountWorks(c){const {state,view,render}=c,header=view.querySelector('.view-head'),filters=view.querySelector('.filters');
  const actions=header?.querySelector('.actions');if(actions){actions.append(button('批量',()=>{parity.selection=true;render();}));actions.append(button(parity.selection?'完成':'选择',()=>{parity.selection=!parity.selection;parity.selected.clear();render();}));}
  const bar=tabs([['all','全部作品'],['recent','最近创作'],['draft','草稿']],parity.workTab,id=>{parity.workTab=id;render();});header?.after(bar);
  for(const card of view.querySelectorAll('.grid .card[data-act="open-project"]')){const p=state.projects.find(x=>x.id===card.dataset.id);if(p)card.hidden=parity.workTab==='draft'?!p.isDraft:parity.workTab==='recent'?p.isDraft||Date.now()-Date.parse(p.updatedAt)>30*864e5:!!p.isDraft;
    const detail=button('⋯',()=>{},'work-card-detail');detail.setAttribute('aria-label','作品详情');detail.onclick=e=>{e.stopPropagation();state.previewProjectID=card.dataset.id;c.route('projectPreview');};card.append(detail);
    if(parity.selection){card.classList.toggle('batch-selected',parity.selected.has(card.dataset.id));card.addEventListener('click',e=>{e.stopImmediatePropagation();parity.selected.has(card.dataset.id)?parity.selected.delete(card.dataset.id):parity.selected.add(card.dataset.id);card.classList.toggle('batch-selected',parity.selected.has(card.dataset.id));card.setAttribute('aria-pressed',String(parity.selected.has(card.dataset.id)));const count=view.querySelector('.swift-tray.manage strong');if(count)count.textContent=`本次选中 ${parity.selected.size} 件`;},true);}
  }
  if(parity.workTab==='all'){const grid=view.querySelector('.grid');if(grid){for(const [label,action] of [['导入作品','import'],['空白创作','new-project']].reverse()){const tile=document.createElement('button');tile.type='button';tile.className='card work-entry';tile.innerHTML=`<div class="card-image">＋</div><div class="card-body"><h3>${label}</h3><p>${action==='import'?'从照片或文件收进作品':'从一张空白页面开始'}</p></div>`;tile.onclick=()=>view.querySelector(action==='import'?'#work-import':'#work-create')?.click();grid.prepend(tile);}}}
  if(filters){const grid=view.querySelector('.works-grid'),search=filters.querySelector('#work-search'),kind=filters.querySelector('#work-kind'),status=filters.querySelector('#work-status'),sort=filters.querySelector('#work-sort'),count=filters.querySelector('span');
    const update=()=>{const q=search.value.trim().toLocaleLowerCase(),cards=[...grid.querySelectorAll('.card[data-id]')];let shown=0;
      cards.sort((a,b)=>{const x=state.projects.find(p=>p.id===a.dataset.id),y=state.projects.find(p=>p.id===b.dataset.id);return sort.value==='oldest'?Date.parse(x.createdAt||x.updatedAt)-Date.parse(y.createdAt||y.updatedAt):Date.parse(y.updatedAt)-Date.parse(x.updatedAt);});
      cards.forEach(card=>{const p=state.projects.find(x=>x.id===card.dataset.id);card.hidden=!!(card.hidden&&parity.workTab!=='all')||!!q&&!`${p.title} ${(p.tags||[]).join(' ')}`.toLocaleLowerCase().includes(q)||kind.value!=='all'&&(kind.value==='template'?!p.isTemplate:!!p.isTemplate)||status.value!=='all'&&(status.value==='draft'?!p.isDraft:!!p.isDraft);if(!card.hidden)shown++;grid.append(card);});count.textContent=`${shown} 项`;};
    for(const el of [search,kind,status,sort])el.addEventListener(el===search?'input':'change',update);update();}
}
function mountMatching(c){const {state,view}=c;for(const [id,key] of [['match-ratio','matchRatio'],['match-mode','matchMode'],['match-intent','matchIntent'],['match-purpose','matchPurpose'],['match-processing','matchProcessing'],['match-paper-width','customPaperWidth'],['match-paper-height','customPaperHeight']]){const el=view.querySelector('#'+id);if(!el)continue;if(id==='match-purpose'||id==='match-processing')el.value=state[key];el.onchange=()=>{state[key]=el.value;if(id==='match-ratio')view.querySelector('.matching-page')?.classList.toggle('custom-paper',el.value==='custom');};}}
function mountImport(c){ /* Import navigation and source buttons are rendered by app.js. */ }
function mountEditor(c){const {state,view,current,checkpoint,saveProject,render,toast}=c,tools=view.querySelector('.editor-tools'),page=view.querySelector('#canvas-page'),ink=page?.querySelector('#ink');if(!tools||!ink)return;
  const heading=view.querySelector('.view-head'),actions=heading?.querySelector('.actions'),shell=view.querySelector('.editor-shell');
  if(heading&&actions&&shell){
    heading.classList.add('swift-editor-head');
    const back=actions.querySelector('[data-act="back-works"]');if(back){back.textContent='‹ 返回';heading.prepend(back);}
    const undo=tools.querySelector('[data-val="undo"]')||tools.querySelector('[data-act="undo"]');
    const redo=tools.querySelector('[data-act="redo"]');if(redo)actions.prepend(redo);if(undo)actions.prepend(undo);
    const saved=document.createElement('span');saved.className='swift-auto-saved';saved.textContent='已自动保存';actions.prepend(saved);
    const archive=tools.querySelector('[data-act="save-archive"]')||view.querySelector('.editor-inspector [data-act="save-archive"]');
    if(archive){archive.textContent='存档';actions.append(archive);}
    actions.append(button('完成',async()=>{await c.flushSave();c.route('works');},'primary'));
    const bar=document.createElement('div');bar.className='swift-editor-toolbar';shell.before(bar);bar.append(tools);
    const insertion=document.createElement('div');insertion.className='swift-insertion-tools';bar.append(insertion);
    const paper=view.querySelector('.object-toolbar [data-act="paper-menu"]');if(paper)insertion.append(paper);
    const zoom=view.querySelector('.object-toolbar span');if(zoom){const fit=button(`↗ 适合页面 ${zoom.textContent}`,()=>{state.zoom=1;render();});insertion.append(fit);}
    insertion.append(button('▤',()=>{state.editorPanel=!state.editorPanel;render();}));
    insertion.append(button('▦',()=>{state.editorPanel=!state.editorPanel;render();}));
    insertion.append(button('☷',()=>{state.editorPanel=!state.editorPanel;render();}));
    insertion.append(button('选择范围',()=>{state.tool='select';render();}));
    const hint=document.createElement('span');hint.className='swift-editor-hint';hint.textContent='单指滚动画布 · 点击选择 · 选框内拖动 · 双指缩放';insertion.append(hint);
    const stage=view.querySelector('.editor-stage'),inspector=view.querySelector('.editor-inspector');
    if(stage&&inspector){shell.classList.add('swift-editor-workspace');shell.classList.toggle('show-inspector',!!state.editorPanel);inspector.classList.add('swift-editor-panel');}
  }
  const select=tools.querySelector('[data-val="select"]');if(select)select.textContent='选择';
  const pen=tools.querySelector('[data-val="pen"]');if(pen)pen.textContent='钢笔';
  const insert=(label,mode)=>{const b=button(label,()=>{state.tool=mode;render();},state.tool===mode?'primary':'');b.dataset.val=mode;tools.insertBefore(b,tools.querySelector('[data-val="text"]'));};
  insert('荧光笔','highlighter');insert('橡皮擦','eraser');
  const labels={select:['➤','选择'],pen:['╱','钢笔'],highlighter:['✎','荧光笔'],eraser:['◇','橡皮擦'],text:['Aa','文字'],shape:['▢','图形'],material:['▧','添加素材']};
  for(const b of tools.querySelectorAll('[data-val]')){const [glyph,title]=labels[b.dataset.val]||[b.textContent,b.textContent];b.textContent=glyph;b.setAttribute('aria-label',title);b.title=title;}
  const lasso=button('◌',()=>{state.tool='lasso';render();});lasso.title='套索对象';lasso.setAttribute('aria-label','套索对象');lasso.classList.toggle('primary',state.tool==='lasso');tools.insertBefore(lasso,tools.querySelector('[data-val="text"]'));
  page.classList.toggle('pen',['pen','highlighter','eraser'].includes(state.tool));
  if(!['highlighter','eraser'].includes(state.tool))return;
  const d=current(),ctx=ink.getContext('2d');let stroke=null;
  const point=e=>{const r=ink.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*d.canvas.width,y:(e.clientY-r.top)/r.height*d.canvas.height,p:e.pressure||.5};};
  ink.onpointerdown=e=>{e.preventDefault();checkpoint();const p=point(e);if(state.tool==='eraser'){
      const before=d.strokes.length;d.strokes=d.strokes.filter(line=>!line.points?.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<22));if(before!==d.strokes.length){saveProject();render();}return;}
    stroke={id:e.pointerId,points:[p],width:18,color:'#efd264',opacity:.45};ink.setPointerCapture(e.pointerId);};
  ink.onpointermove=e=>{if(!stroke||stroke.id!==e.pointerId)return;const p=point(e),last=stroke.points.at(-1);stroke.points.push(p);ctx.globalAlpha=stroke.opacity;ctx.strokeStyle=stroke.color;ctx.lineWidth=stroke.width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.globalAlpha=1;};
  ink.onpointerup=e=>{if(!stroke||stroke.id!==e.pointerId)return;const {id,...line}=stroke;d.strokes.push(line);stroke=null;saveProject();render();};ink.onpointercancel=ink.onpointerup;
}
