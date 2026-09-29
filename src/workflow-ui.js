import {beginSelection,finishSelection} from './library-selection-model.js';
import {mountAssetSelection} from './library-selection-ui.js';
import {parity} from './parity-ui.js';
import {searchableSeries} from './library-model.js';
import {classifyRecord} from './classification.js';
import {pagePDF,canvasPDFPage,materialPrintPlacements} from './pdf-export.js';
import {showAIDiagnostics,showAIContexts} from './ai-diagnostics.js';
import {mountImportCandidateMenus} from './import-workspace-ui.js';
import {mountFourFilters,mountFilterControl} from './filter-controls.js';
import {containBox} from './preview-geometry.js';

const previewObservers=new WeakMap();
function mountWorkPreviews(c){
  previewObservers.get(c.view)?.disconnect();previewObservers.delete(c.view);
  const frames=[...c.view.querySelectorAll('.works-grid .thumb-sheet,.project-preview-cover .preview-paper')];
  if(!frames.length)return;
  const fit=()=>{for(const frame of frames){const p=c.state.projects.find(p=>p.id===(frame.closest('[data-act="open-project"]')?.dataset.id||c.state.previewProjectID));const d=frame.matches('.thumb-sheet')?p?.drafts[0]:p?.drafts.find(d=>d.id===p.activeDraftID)||p?.drafts[0];if(!d)continue;const host=frame.parentElement,r=host.getBoundingClientRect(),box=containBox(d.canvas.width,d.canvas.height,r.width,r.height,16);frame.style.setProperty('width',box.width+'px','important');Object.assign(frame.style,{height:box.height+'px',aspectRatio:d.canvas.width+'/'+d.canvas.height});}};
  const observer=new ResizeObserver(fit);frames.forEach(frame=>observer.observe(frame.parentElement));previewObservers.set(c.view,observer);fit();
}

function button(text, action, className='') {
  const b=document.createElement('button');b.type='button';b.className='btn '+className;b.textContent=text;
  b.onclick=async()=>{b.disabled=true;try{await action();}catch(error){document.querySelector('#toast').textContent=error.message;document.querySelector('#toast').classList.add('show');}finally{b.disabled=false;}};return b;
}
export function mountWorkflowControls(c) {
  mountFourFilters(c);
  mountWorkPreviews(c);
  if(c.state.route==='series')mountSeries(c);
  if(c.state.route==='works')mountProjectBatch(c);
  if(['library','series'].includes(c.state.route))mountAssetBatch(c);
  if(c.state.route==='assetDetail')mountAssetDetail(c);
  if(c.state.route==='settings'&&c.state.settingsSection==='数据与诊断')mountData(c);
  if(c.state.route==='import')mountImport(c);
  if(c.state.route==='editor') {
    const print=c.view.querySelector('[data-act="print"]');
    print?.after(button('导出 PDF',async()=>{
      await c.flushSave();const d=c.state.activeProject.drafts.find(d=>d.id===c.state.activeDraft)||c.state.activeProject.drafts[0];
      const height=d.physicalPageHeightMM||297,width=height*d.canvas.width/d.canvas.height;
      const scale=Math.min(height*300/25.4/d.canvas.height,8192/Math.max(d.canvas.width,d.canvas.height));
      const canvas=await c.rasterize(d,scale);
      c.download(await pagePDF([await canvasPDFPage(canvas,width,height)]),c.state.activeProject.title+'.pdf');
    }));
  }
}
function mountSeries(c) {
  const {state,view,render,openSeriesEditor}=c,actions=view.querySelector('.view-head .actions');
  const isActive=()=>parity.selection&&parity.selectionMode==='series';
  actions.append(button(parity.selection?'完成':'选择',()=>{parity.selection?finishSelection(parity):beginSelection(parity,'series');sync();},'library-select-toggle'));
  const controls=view.querySelector('.swift-series-controls'),input=controls.querySelector('input'),sort=controls.querySelector('select'),count=controls.querySelector('span');
  input.value=parity.seriesQuery||'';sort.value=parity.seriesSort||'recent';
  const order=document.createElement('select');order.innerHTML='<option value="desc">降序</option><option value="asc">升序</option>';order.value=parity.seriesAscending?'asc':'desc';order.onchange=()=>{parity.seriesAscending=order.value==='asc';update();};
  const bar=document.createElement('div');bar.className='four-filter-controls';sort.after(order,bar);mountFilterControl(sort,bar,'排序依据','≡');mountFilterControl(order,bar,'排序顺序','↕',{toggle:true});
  const cards=[...view.querySelectorAll('[data-act="series-detail"]')];
  const update=()=>{parity.seriesQuery=input.value;parity.seriesSort=sort.value;const q=input.value.trim().toLocaleLowerCase();let visible=0;
    cards.sort((a,b)=>{const x=state.series.find(s=>s.id===a.dataset.id),y=state.series.find(s=>s.id===b.dataset.id);const value=sort.value==='name'?x.title.localeCompare(y.title,'zh-CN'):(x.updatedAt||'').localeCompare(y.updatedAt||'');return (parity.seriesAscending?value:-value)||x.id.localeCompare(y.id);});
    for(const card of cards){const s=state.series.find(s=>s.id===card.dataset.id);card.hidden=(isActive()&&parity.showOnlySelected?!parity.selected.has(s.id):!!q&&!searchableSeries(s,state.assets).includes(q));if(!card.hidden)visible++;card.parentElement.append(card);}count.textContent=visible+' 项';};
  input.oninput=update;sort.onchange=update;update();
  for(const card of cards) {
    card.addEventListener('click',e=>{if(!isActive())return;e.stopImmediatePropagation();e.preventDefault();const id=card.dataset.id;parity.selected.has(id)?parity.selected.delete(id):parity.selected.add(id);sync();},true);
    const menu=()=>{if(isActive())return;c.body.innerHTML='<h2>系列操作</h2><div class="stack" id="series-card-menu"></div>';const list=c.body.querySelector('#series-card-menu');list.append(button('查看系列详情',()=>{c.modal.close();card.click();}),button('编辑信息与标签',()=>{c.modal.close();openSeriesEditor(card.dataset.id);}));c.modal.showModal();};card.oncontextmenu=e=>{e.preventDefault();menu();};card.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();menu();}};
  }
  const entry=view.querySelector('.series-entry');
  const tray=document.createElement('div');tray.className='swift-tray manage library-management-tray';tray.dataset.selectionMode='series';tray.innerHTML='<strong>本次选中 '+parity.selected.size+' 个系列</strong>';
  tray.append(button('全选页面',()=>{cards.filter(b=>!b.hidden).forEach(b=>parity.selected.add(b.dataset.id));sync();}),button('清空选择',()=>{parity.selected.clear();parity.showOnlySelected=false;sync();}),button(parity.showOnlySelected?'返回筛选':'查看所选',()=>{parity.showOnlySelected=!parity.showOnlySelected;sync();}),button('删除系列',async()=>{
    if(!parity.selected.size||!confirm('删除所选系列？系列中的素材会保留在全部素材中。'))return;
    const revised=state.assets.filter(a=>parity.selected.has(a.seriesID)).map(a=>({...a,seriesID:null}));
    await c.db.transaction(['series','assets'],tx=>{for(const id of parity.selected)tx.objectStore('series').delete(id);for(const a of revised)tx.objectStore('assets').put(a);});
    state.series=state.series.filter(s=>!parity.selected.has(s.id));for(const a of revised)Object.assign(state.assets.find(x=>x.id===a.id),a);parity.selected.clear();render();
  },'danger'));view.append(tray);
  function sync(){const active=isActive();tray.hidden=!active;entry.disabled=active;view.querySelector('.library-select-toggle').textContent=parity.selection?'完成':'选择';for(const card of cards){card.classList.toggle('batch-selected',active&&parity.selected.has(card.dataset.id));if(active)card.setAttribute('aria-pressed',String(parity.selected.has(card.dataset.id)));else card.removeAttribute('aria-pressed');}tray.querySelector('strong').textContent='本次选中 '+parity.selected.size+' 个系列';tray.querySelectorAll('button').forEach((b,i)=>{b.disabled=i>0&&!parity.selected.size;if(i===2)b.textContent=parity.showOnlySelected?'返回筛选':'查看所选';});update();return true;}view.selectionRefresh=sync;sync();
}
function selectedTray(c, selector) {
  const {view,render}=c,tray=document.createElement('div');tray.className='swift-tray manage';tray.innerHTML='<strong>本次选中 '+parity.selected.size+' 件</strong>';
  tray.append(button('全选当前结果',()=>{view.querySelectorAll(selector).forEach(card=>{if(!card.hidden)parity.selected.add(card.dataset.id);});view.selectionRefresh?.()||render();}),button('清空选择',()=>{parity.selected.clear();view.selectionRefresh?.()||render();}));view.append(tray);return tray;
}
function mountProjectBatch(c) {
  if(!c.view.querySelector('.works-grid'))return;
  const tray=selectedTray(c,'.card[data-act="open-project"]');
  function sync(){const active=parity.selection&&parity.selectionMode==='work';tray.hidden=!active;c.view.querySelector('.library-select-toggle').textContent=parity.selection?'完成':'选择';c.view.querySelectorAll('.work-entry').forEach(b=>b.disabled=active);c.view.querySelectorAll('[data-act="open-project"]').forEach(b=>{b.classList.toggle('batch-selected',active&&parity.selected.has(b.dataset.id));if(active)b.setAttribute('aria-pressed',String(parity.selected.has(b.dataset.id)));else b.removeAttribute('aria-pressed');});tray.querySelector('strong').textContent='本次选中 '+parity.selected.size+' 件';return true;}c.view.selectionRefresh=sync;sync();
  tray.append(button('重新识别',()=>classifyBatch(c,'project')),
    button('删除',async()=>{
      if(!parity.selected.size||!confirm('将所选作品移到最近删除？'))return;
      const entries=c.state.projects.filter(p=>parity.selected.has(p.id)).map(item=>({id:crypto.randomUUID(),kind:'project',item:structuredClone(item),date:new Date().toISOString()}));
      await c.db.transaction(['projects','trash'],tx=>{for(const entry of entries){tx.objectStore('projects').delete(entry.item.id);tx.objectStore('trash').put(entry);}});
      c.state.projects=c.state.projects.filter(p=>!parity.selected.has(p.id));c.state.trash.push(...entries);parity.selected.clear();c.render();
    },'danger'));
}
function mountAssetBatch(c) {mountAssetSelection(c,parity);}
async function classifyBatch(c,kind) {
  const records=(kind==='asset'?c.state.assets:c.state.projects).filter(x=>parity.selected.has(x.id));
  if(!records.length)throw Error('请先选择要识别的内容');
  let count=0;
  for(const record of records) {
    c.toast('正在识别 '+(count+1)+' / '+records.length);
    const image=kind==='asset'?await c.modelImage(record):(await c.rasterize(record.drafts[0],.5)).toDataURL('image/jpeg',.8);
    const result=await classifyRecord({kind,record,settings:c.state.aiSettings,image,assets:c.state.assets});
    const next={...record,...result,updatedAt:new Date().toISOString()};await c.db.put(kind==='asset'?'assets':'projects',next);Object.assign(record,next);count++;
  }
  c.render();c.toast('已整理 '+count+' 件');
}
async function exportMaterials(c,ids) {
  const placements=materialPrintPlacements(ids.map(c.asset).filter(Boolean)),scale=300/25.4,pages=[];
  for(let page=0;page<=placements.at(-1).page;page++) {
    const canvas=document.createElement('canvas');canvas.width=Math.round(210*scale);canvas.height=Math.round(297*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#333';ctx.font=(3*scale)+'px sans-serif';
    ctx.fillText('拾页 · 素材打印 '+(page+1),8*scale,8*scale);ctx.font=(2.4*scale)+'px sans-serif';ctx.fillText('实际尺寸 100%，不要缩放以适合纸张',8*scale,13*scale);
    ctx.beginPath();ctx.moveTo(187*scale,12*scale);ctx.lineTo(197*scale,12*scale);ctx.stroke();ctx.fillText('10 mm',187*scale,8*scale);
    for(const p of placements.filter(p=>p.page===page)) {
      const im=new Image(),src=c.imgTag(p.asset).match(/src="([^"]+)"/)?.[1];if(!src)throw Error('「'+p.asset.title+'」的原图无法读取');im.src=src;await im.decode();
      ctx.fillText(p.asset.title+' · '+p.width+' × '+p.height+' mm',p.x*scale,(p.y-2)*scale,p.width*scale);
      ctx.drawImage(im,p.x*scale,p.y*scale,p.width*scale,p.height*scale);
    }
    pages.push(await canvasPDFPage(canvas,210,297));
  }
  c.download(await pagePDF(pages),'拾页-素材实际尺寸.pdf');
}
function mountAssetDetail(c) {
  const a=c.asset(c.state.detailAssetID);
  c.view.querySelector('.detail-links')?.append(button('导出打印 PDF',()=>exportMaterials(c,[a.id])));
  c.view.onshowsimilar=()=>showSimilar(c);
  c.view.addEventListener('show-similar',c.view.onshowsimilar,{once:true});
}
async function showSimilar(c) {
  const a=c.asset(c.state.detailAssetID);const tags=new Set([...(a.tags||[]),...(a.contentTags||[]),...(a.styleTags||[])]);
  const matches=c.state.assets.filter(b=>b.id!==a.id&&!b.isProjectInternal).map(b=>({asset:b,score:(b.kind===a.kind?2:0)+(b.seriesID&&b.seriesID===a.seriesID?2:0)+(b.role===a.role?1:0)+(b.tags||[]).filter(t=>tags.has(t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,24);
  c.body.innerHTML='<div class="dialog-head"><h2>相似素材</h2><button type="button" class="btn" id="similar-close">关闭</button></div><p>按类型、画面作用、标签和系列检索。像素视觉相似度仍待移植。</p><div class="mini-assets">'+matches.map(x=>'<button type="button" class="mini-asset" data-similar="'+x.asset.id+'">'+c.imgTag(x.asset)+'<span>'+c.esc(x.asset.title)+'</span></button>').join('')+'</div>';
  c.body.querySelector('#similar-close').onclick=()=>c.modal.close();c.body.querySelectorAll('[data-similar]').forEach(b=>b.onclick=()=>{c.state.detailAssetID=b.dataset.similar;c.modal.close();c.render();});c.modal.showModal();
}
function mountData(c) {
  const {view,state,db,refresh}=c;
  for(const row of view.querySelectorAll('.rec-card')) {
    const id=row.querySelector('[data-act="restore-trash"]')?.dataset.id;if(!id)continue;
    row.append(button('彻底删除',async()=>{if(!confirm('彻底删除这项内容？此操作无法撤销。'))return;await db.remove('trash',id);state.trash=state.trash.filter(t=>t.id!==id);c.render();},'danger mini'));
  }
  const section=view.querySelector('.settings-detail');
  section.append(button('生成诊断',()=>showAIDiagnostics(c)),button('创作完整上下文',()=>showAIContexts(c)));
  section.append(button('清空最近删除',async()=>{if(!state.trash.length||!confirm('彻底删除最近删除中的所有内容？此操作无法撤销。'))return;await db.transaction(['trash'],tx=>tx.objectStore('trash').clear());state.trash=[];c.render();},'danger'));
  // Blob reclamation is a separate explicit action. Recursively scan every
  // record, including manual archives and trash; never delete live references.
  section.append(button('清理未使用的图片',async()=>{
    const blobs=await db.all('blobs'),referenced=new Set();
    const visit=value=>{if(typeof value==='string')referenced.add(value);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};
    for(const store of ['assets','projects','series','trash','meta'])visit(await db.all(store));
    const orphans=blobs.filter(b=>!referenced.has(b.id));
    await db.transaction(['blobs'],tx=>{for(const b of orphans)tx.objectStore('blobs').delete(b.id);});await refresh();c.toast('已清理 '+orphans.length+' 张未使用图片');
  }));
}
function mountImport(c) {
  const {state,view,render}=c;
  mountImportCandidateMenus(c);
  if(state.importStep==='inspect') {
    const correction=view.querySelector('.paper-corner-overlay');if(state.showManualBox&&correction)correction.style.display='none';
    // Existing candidates remain drafts until the photo is confirmed again.
    for(const queue of view.querySelectorAll('.queue-item')) {
      const remove=button('移除',()=>{},'mini');remove.onclick=async e=>{e.stopPropagation();try{
        const index=+queue.dataset.id;if(!confirm('从本批中移除这张照片？'))return;
        c.saveActiveImportRecord();const [record]=state.importRecords.splice(index,1);
        URL.revokeObjectURL(record.url);record.bitmap?.close?.();record.correctedBitmap?.close?.();
        if(!state.importRecords.length){state.importFile=null;state.importBitmap=null;state.importCandidates=[];render();}
        else await c.switchImportRecord(Math.min(state.importIndex,state.importRecords.length-1),true);
      }catch(error){c.toast(error.message);}};
      queue.append(remove);
    }
    return;
  }
  if(state.importStep!=='review')return;
  const batch=view.querySelector('#batch-series');if(batch)batch.value=state.importBatchSeriesID||'';
  view.querySelectorAll('.record-series').forEach(el=>{el.value=state.importRecords[+el.dataset.index].seriesID||'';});
  for(const input of view.querySelectorAll('.record-work-title')) {
    const record=state.importRecords[+input.dataset.index],fields=document.createElement('div');fields.className='form-grid';
    fields.innerHTML='<label>风格标签<input class="import-work-tags" value="'+c.esc((record.workTags||[]).join('、'))+'"></label><label>作品类型<select class="import-template"><option value="normal">普通作品</option><option value="template">模板作品</option></select></label><label>使用标记<select class="import-used"><option value="unused">未使用</option><option value="used">已使用</option></select></label>';
    fields.querySelector('.import-work-tags').oninput=e=>record.workTags=[...new Set(e.target.value.split(/[,，、]/).map(t=>t.trim()).filter(Boolean))];
    const template=fields.querySelector('.import-template'),used=fields.querySelector('.import-used');template.value=record.isTemplate?'template':'normal';used.value=record.isUsed?'used':'unused';template.onchange=()=>record.isTemplate=template.value==='template';used.onchange=()=>record.isUsed=used.value==='used';input.closest('label').after(fields);
  }
}
