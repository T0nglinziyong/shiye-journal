import {togglePopover} from './swift-popover.js';
import {createSelectionSidePanels,selectionMorePopoverOptions} from './selection-side-panels.js';
import {zipSync,strToU8} from 'fflate';
import {finishSelection,selectionActive} from './library-selection-model.js';
import {mountAssetSelection} from './library-selection-ui.js';
import {parity} from './parity-ui.js';
import {searchableSeries} from './library-model.js';
import {classifyRecord} from './classification.js';
import {showAIDiagnostics,showAIContexts} from './ai-diagnostics.js';
import {mountImportCandidateMenus} from './import-workspace-ui.js';
import {mountFourFilters,mountFilterControl} from './filter-controls.js';
import {containBox} from './preview-geometry.js';
import {registerSelectionPresenter} from './selection-presenter.js';
import {applyCatalogPage,resetCatalogPage} from './catalog-pagination.js';
import {prewarmVision} from './vision-runtime.js';
import {changeTrash} from './trash-actions.js';

const previewObservers=new WeakMap();
export function refreshWorkPreviews(c){return mountWorkPreviews(c);}
function mountWorkPreviews(c){
  previewObservers.get(c.view)?.disconnect();previewObservers.delete(c.view);
  const frames=[...c.view.querySelectorAll('.works-grid .thumb-sheet,.project-preview-cover .preview-paper')];
  if(!frames.length)return;
  const projectByID=new Map(c.state.projects.map(project=>[project.id,project])),
    targets=new Map();
  for(const frame of frames){
    const id=frame.closest('[data-act="open-project"]')?.dataset.id||c.state.previewProjectID,
      project=projectByID.get(id);
    const draft=project?.drafts?.find(d=>d.id===project.activeDraftID)||project?.drafts?.[0];
    if(!draft?.canvas||!frame.parentElement)continue;
    targets.set(frame.parentElement,{frame,width:draft.canvas.width,height:draft.canvas.height});
  }
  if(!targets.size)return;
  let scheduled=0;const waiting=new Set(targets.keys());
  const fit=()=>{
    scheduled=0;
    for(const host of waiting){
      const target=targets.get(host);if(!target||!host.isConnected)continue;
      const {frame,width,height}=target,
        box=containBox(width,height,host.clientWidth,host.clientHeight,16);
      if(frame.style.width!==box.width+'px')frame.style.setProperty('width',box.width+'px','important');
      if(frame.style.height!==box.height+'px')frame.style.height=box.height+'px';
      const ratio=width+'/'+height;
      if(frame.style.aspectRatio!==ratio)frame.style.aspectRatio=ratio;
    }
    waiting.clear();
  };
  const schedule=()=>{
    if(scheduled)return;
    scheduled=requestAnimationFrame(fit);
  };
  const observer=new ResizeObserver(entries=>{
    for(const entry of entries)if(targets.has(entry.target))waiting.add(entry.target);
    schedule();
  });
  for(const host of targets.keys())observer.observe(host);
  schedule();
  previewObservers.set(c.view,{disconnect(){observer.disconnect();if(scheduled)cancelAnimationFrame(scheduled);}});
}

function button(text, action, className='') {
  const b=document.createElement('button');b.type='button';b.className='btn '+className;b.textContent=text;
  b.onclick=async()=>{b.disabled=true;try{await action();}catch(error){document.querySelector('#toast').textContent=error.message;document.querySelector('#toast').classList.add('show');}finally{b.disabled=false;}};return b;
}
// Share the materials batch action layout across series, works and snapshots.
const selectionAction=(label,fn,cls='')=>{
  const b=button(label,fn,cls),span=document.createElement('span'),
    hasSubmenu=label.endsWith(' ›');
  span.className='selection-action-label';
  span.textContent=hasSubmenu?label.slice(0,-2):label;b.replaceChildren(span);
  if(hasSubmenu){const arrow=document.createElement('span');arrow.className='selection-action-chevron';
    arrow.textContent=' ›';arrow.setAttribute('aria-hidden','true');b.append(arrow);
    b.setAttribute('aria-haspopup','menu');}
  if(label==='更多操作'){b.dataset.selectionMore='';b.setAttribute('aria-haspopup','menu');}
  return b;
};
function batchMore(anchor,actions){
  const p=togglePopover(anchor,selectionMorePopoverOptions());
  if(!p)return;
  p.surface.classList.add('selection-more-menu');
  const side=createSelectionSidePanels(p,{anchor,makeAction:selectionAction});
  for(const [title,handler] of actions){
    if(!Array.isArray(handler)){
      p.content.append(selectionAction(title,async()=>{p.close();await handler();}));
      continue;
    }
    const trigger=selectionAction(title+' ›',()=>{
      side.open(trigger,title,handler.map(([label,run])=>[label,async()=>{p.close();await run();}]));
    });
    trigger.dataset.expandedSubmenu='';
    trigger.setAttribute('aria-haspopup','menu');
    trigger.setAttribute('aria-expanded','false');
    p.content.append(trigger);
  }
}
async function setSelectedWorkUsage(c,used){
  const selected=c.state.projects.filter(p=>parity.selected.has(p.id)&&!p.isSnapshot);
  if(!selected.length)throw Error('仅可编辑作品支持使用状态');
  await c.flushSave();
  const at=new Date().toISOString(),updated=[];
  for(const project of selected){
    const full=project.projectDocumentPath?await c.db.completeProject(project):project;
    updated.push({...full,isUsed:used,updatedAt:at});
  }
  // A single durable batch avoids half-updated selection after a slow upload.
  await c.db.transaction(['projects'],tx=>{
    for(const record of updated)tx.objectStore('projects').put(record);
  });
  for(const record of updated){
    const local=c.state.projects.find(p=>p.id===record.id);
    if(local)Object.assign(local,record);
  }
  c.render();
  c.toast('已将 '+updated.length+' 件作品设置为'+(used?'已使用':'未使用'));
}
async function exportSeriesArchive(c,seriesIDs){
  const chosen=c.state.series.filter(x=>seriesIDs.includes(x.id));
  if(!chosen.length)throw Error('请选择系列');
  const assets=c.state.assets.filter(a=>chosen.some(series=>series.id===a.seriesID&&!a.isProjectInternal));
  const payload={'series.json':strToU8(JSON.stringify({series:chosen,assets:assets.map(({blobId,originalBlobId,originalCutoutBlobId,candidateFrameBlobId,...meta})=>({...meta,blobId,originalBlobId,originalCutoutBlobId,candidateFrameBlobId}))},null,2))};
  for(const a of assets){
    const blob=(await c.db.get('blobs',a.blobId))?.data;
    if(!(blob instanceof Blob))throw Error('素材图片读取失败：'+a.title);
    payload['materials/'+a.id+'.png']=new Uint8Array(await blob.arrayBuffer());
  }
  c.download(new Blob([zipSync(payload,{level:3})],{type:'application/zip'}),'拾页-系列导出.zip');
}
async function exportSelectedWorks(c,records,format='native'){
  if(!records.length)throw Error('请先选择要导出的作品');
  for(const record of records){
    if(record.isSnapshot){
      const id=record.snapshotDocumentBlobId||record.snapshotBlobId,raw=(await c.db.get('blobs',id))?.data;
      if(!(raw instanceof Blob))throw Error('快照尚未同步：'+record.title);
      if(format==='original'){
        const ext=record.snapshotFormat==='application/pdf'?'pdf':record.snapshotFormat==='image/jpeg'?'jpg':record.snapshotFormat==='image/webp'?'webp':'png';
        c.download(raw,record.title+'.'+ext);
      }else if(format==='png'||format==='jpeg'){
        const bitmap=await createImageBitmap(raw);try{
          const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
          const ctx=canvas.getContext('2d');
          if(format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);}
          ctx.drawImage(bitmap,0,0);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/'+format,.93));
          if(!blob)throw Error('快照编码失败：'+record.title);
          c.download(blob,record.title+(format==='jpeg'?'.jpg':'.png'));
        }finally{bitmap.close();}
      }else throw Error('快照不支持当前导出类型');
    }else if(format==='native')await c.handle('download-project-json',record.id);
    else{
      const complete=record.projectDocumentPath?await c.db.completeProject(record):record;
      const draft=complete.drafts?.find(d=>d.id===complete.activeDraftID)||complete.drafts?.[0];
      if(!draft)throw Error('作品缺少可编辑画布：'+record.title);
      const scale=Math.min(1.6,1800/Math.max(draft.canvas.width,draft.canvas.height));
      const canvas=await c.rasterize(draft,scale);
      if(format==='pdf'){
        const height=draft.physicalPageHeightMM||297,width=height*draft.canvas.width/draft.canvas.height;
        const {pagePDF,canvasPDFPage}=await import('./pdf-export.js');
        c.download(await pagePDF([await canvasPDFPage(canvas,width,height)]),record.title+'.pdf');
      }else{
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob)throw Error('作品 PNG 导出失败：'+record.title);
        c.download(blob,record.title+'.png');
      }
    }
  }
}
function seriesExportActions(c){
  return [
    ['素材与系列 ZIP',()=>exportSeriesArchive(c,[...parity.selected])],
    ['系列清单 JSON',()=>{
      const series=c.state.series.filter(s=>parity.selected.has(s.id));
      c.download(new Blob([JSON.stringify(series,null,2)],{type:'application/json'}),'拾页-系列清单.json');
    }]
  ];
}
function workExportActions(c){
  const records=c.state.projects.filter(p=>parity.selected.has(p.id));
  const snapshots=records.length>0&&records.every(p=>p.isSnapshot);
  const editable=records.length>0&&records.every(p=>!p.isSnapshot);
  const entries=snapshots
    ?(records.some(p=>p.snapshotFormat==='application/pdf')
      ?[['原始快照文件','original']]
      :[['原始快照文件','original'],['PNG 图像','png'],['白底 JPEG','jpeg']])
    :editable
      ?[['可编辑拾页 JSON','native'],['PNG 图像','png'],['PDF 文件','pdf']]
      :[['按原格式分别导出','mixed']];
  return entries.map(([label,format])=>[label,async()=>{
    if(format==='mixed'){
      await exportSelectedWorks(c,records.filter(p=>p.isSnapshot),'original');
      await exportSelectedWorks(c,records.filter(p=>!p.isSnapshot),'native');
    }else await exportSelectedWorks(c,records,format);
  }]);
}
async function classifySelectedWorks(c,records){
  const account=c.state.accountId,settings=structuredClone(c.state.aiSettings);
  for(const record of records){
    if(c.state.accountId!==account)break;
    const source=record.isSnapshot?record:await c.db.completeProject(record);
    let image=null;
    if(record.isSnapshot&&settings.includeThumbnails){
      image=await c.modelImage({blobId:record.snapshotBlobId},null,360,false);
    }
    const identified=await classifyRecord({kind:'project',record:source,settings,image,assets:c.state.assets});
    const current=await c.db.get('projects',source.id);
    if(!current||current.updatedAt!==source.updatedAt)continue;
    const next={...current,...identified,styleTags:identified.styleTags||identified.tags||current.styleTags,updatedAt:new Date().toISOString()};
    await c.db.put('projects',next);Object.assign(record,next);
  }
  c.render();
}

export function mountWorkflowControls(c) {
  if(!(c.state.route==='works'&&parity.workTab==='templates'))mountFourFilters(c);
  mountWorkPreviews(c);
  if(c.state.route==='series')mountSeries(c);
  if(c.state.route==='works')mountProjectBatch(c);
  if(['library','series'].includes(c.state.route))mountAssetBatch(c);
  // Start downloading/initializing OpenCV as soon as the user commits to an
  // import gesture. Time spent in the native photo/file picker then hides most
  // of the first-recognition cold start.
  const importTrigger=c.view.querySelector('[data-act="import"]');
  importTrigger?.addEventListener('pointerdown',()=>{void prewarmVision().catch(()=>{});},{once:true,passive:true});
  if(c.state.route==='assetDetail')mountAssetDetail(c);
  if(c.state.route==='settings'&&c.state.settingsSection==='数据与诊断')mountData(c);
  if(c.state.route==='import')mountImport(c);
  mountCatalogSticky(c.view,c.state.route);
  if(c.state.route==='editor') {
    const print=c.view.querySelector('[data-act="print"]');
    print?.after(button('导出 PDF',async()=>{
      await c.flushSave();const d=c.state.activeProject.drafts.find(d=>d.id===c.state.activeDraft)||c.state.activeProject.drafts[0];
      const height=d.physicalPageHeightMM||297,width=height*d.canvas.width/d.canvas.height;
      const scale=Math.min(height*300/25.4/d.canvas.height,8192/Math.max(d.canvas.width,d.canvas.height));
      const canvas=await c.rasterize(d,scale);
      const {pagePDF,canvasPDFPage}=await import('./pdf-export.js');
      c.download(await pagePDF([await canvasPDFPage(canvas,width,height)]),c.state.activeProject.title+'.pdf');
    }));
  }
}
function mountCatalogSticky(view,route){
  if(!['library','series','works'].includes(route))return;
  const root=view.querySelector('.series-contents,.works-page')||view;
  const toolbar=[...root.children].find(child=>child.classList?.contains('catalog-toolbar'));
  const top=document.querySelector('.topbar');
  if(toolbar&&top)toolbar.style.setProperty('--catalog-top',top.getBoundingClientRect().height+'px');
}
function mountSeries(c) {
  const {state,view,render,openSeriesEditor}=c;
  const isActive=()=>selectionActive(parity,'series');
  const controls=view.querySelector('.swift-series-controls'),input=controls.querySelector('input'),sort=controls.querySelector('select'),count=controls.querySelector('span');
  input.value=parity.seriesQuery||'';sort.value=parity.seriesSort||'recent';
  const order=document.createElement('select');order.innerHTML='<option value="desc">降序</option><option value="asc">升序</option>';order.value=parity.seriesAscending?'asc':'desc';order.onchange=()=>{parity.seriesAscending=order.value==='asc';update();};
  const bar=document.createElement('div');bar.className='four-filter-controls';sort.after(order,bar);mountFilterControl(sort,bar,'排序依据','≡');mountFilterControl(order,bar,'排序顺序','↕',{toggle:true});
  const cards=[...view.querySelectorAll('[data-act="series-detail"]')];
  const update=()=>{parity.seriesQuery=input.value;parity.seriesSort=sort.value;const q=input.value.trim().toLocaleLowerCase();
    cards.sort((a,b)=>{const x=state.series.find(s=>s.id===a.dataset.id),y=state.series.find(s=>s.id===b.dataset.id);const value=sort.value==='name'?x.title.localeCompare(y.title,'zh-CN'):(x.updatedAt||'').localeCompare(y.updatedAt||'');return (parity.seriesAscending?value:-value)||x.id.localeCompare(y.id);});
    cards.forEach((card,index)=>{card.style.order=String(index+1);});applyCatalogPage({view,key:'series',cards,matched:card=>{const s=state.series.find(s=>s.id===card.dataset.id);return isActive()&&parity.showOnlySelected?parity.selected.has(s.id):!q||searchableSeries(s,state.assets).includes(q);},countNode:count,size:state.preferences.maxPageItems});};view.catalogRefresh=update;
  input.oninput=()=>{resetCatalogPage('series');update();};sort.onchange=()=>{resetCatalogPage('series');update();};update();
  for(const card of cards) {
    card.addEventListener('click',()=>{
      if(isActive())return;
      parity.seriesScrollY=window.scrollY;
      parity.restoreSeriesScroll=true;
    });
    card.addEventListener('click',e=>{if(!isActive())return;e.stopImmediatePropagation();e.preventDefault();const id=card.dataset.id;parity.selected.has(id)?parity.selected.delete(id):parity.selected.add(id);sync();},true);
    const menu=()=>{if(isActive())return;c.body.innerHTML='<h2>系列操作</h2><div class="stack" id="series-card-menu"></div>';const list=c.body.querySelector('#series-card-menu');list.append(button('查看系列详情',()=>{c.modal.close();card.click();}),button('编辑信息与标签',()=>{c.modal.close();openSeriesEditor(card.dataset.id);}));c.modal.showModal();};card.oncontextmenu=e=>{e.preventDefault();menu();};card.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();menu();}};
  }
  const entry=view.querySelector('.series-entry');
  const tray=document.createElement('div');tray.className='swift-tray manage library-management-tray';tray.dataset.selectionMode='series';tray.innerHTML='<strong></strong>';
  const more=selectionAction('更多操作',()=>batchMore(more,[
    ['导出系列',seriesExportActions(c)],
    ['编辑系列信息',()=>{
      if(parity.selected.size!==1)throw Error('请先只选择一个系列');
      c.openSeriesEditor([...parity.selected][0]);
    }]
  ]));
  const remove=selectionAction('删除系列',async()=>{
    if(!parity.selected.size||!confirm('删除所选系列？素材仍保留在全部素材中。'))return;
    const revised=state.assets.filter(a=>parity.selected.has(a.seriesID)).map(a=>({...a,seriesID:null}));
    await c.db.transaction(['series','assets'],tx=>{for(const id of parity.selected)tx.objectStore('series').delete(id);for(const a of revised)tx.objectStore('assets').put(a);});
    state.series=state.series.filter(s=>!parity.selected.has(s.id));for(const a of revised)Object.assign(state.assets.find(x=>x.id===a.id),a);
    parity.selected.clear();finishSelection(parity);render();
  },'danger');
  tray.append(
    selectionAction('全选页面',()=>{cards.filter(b=>!b.hidden).forEach(b=>parity.selected.add(b.dataset.id));sync();}),
    selectionAction('清空选择',()=>{parity.selected.clear();parity.showOnlySelected=false;sync();}),
    selectionAction('查看所选',()=>{parity.showOnlySelected=!parity.showOnlySelected;sync();}),
    more,remove
  );view.append(tray);
  function sync(){const active=isActive();tray.hidden=!active;entry.disabled=active;for(const card of cards){card.classList.toggle('batch-selected',active&&parity.selected.has(card.dataset.id));if(active)card.setAttribute('aria-pressed',String(parity.selected.has(card.dataset.id)));else card.removeAttribute('aria-pressed');}tray.querySelector('strong').textContent='本次选中 '+parity.selected.size+' 个系列';tray.querySelectorAll('button').forEach((b,i)=>{b.disabled=i>0&&!parity.selected.size;if(i===2)b.querySelector('.selection-action-label').textContent=parity.showOnlySelected?'返回筛选':'查看所选';});update();return true;}registerSelectionPresenter(view,sync);
  if(parity.restoreSeriesScroll)requestAnimationFrame(()=>{
    window.scrollTo(0,parity.seriesScrollY||0);
    parity.restoreSeriesScroll=false;
  });
}
function selectedTray(c,selector){
  const {view}=c,tray=document.createElement('div');tray.className='swift-tray manage library-management-tray';
  tray.dataset.selectionMode='work';tray.innerHTML='<strong></strong>';
  tray.append(
    selectionAction('全选页面',()=>{view.querySelectorAll(selector).forEach(card=>{if(!card.hidden)parity.selected.add(card.dataset.id);});view.selectionRefresh?.();}),
    selectionAction('清空选择',()=>{parity.selected.clear();parity.showOnlySelected=false;view.selectionRefresh?.();}),
    selectionAction('查看所选',()=>{parity.showOnlySelected=!parity.showOnlySelected;view.selectionRefresh?.();})
  );view.append(tray);return tray;
}
function mountProjectBatch(c){
  if(parity.workTab==='templates'||!c.view.querySelector('.works-grid'))return;
  const tray=selectedTray(c,'.card[data-act="open-project"]');
  const more=selectionAction('更多操作',()=>batchMore(more,[
    [parity.workTab==='snapshot'?'导出快照':'导出作品',workExportActions(c)],
    ['重新识别',()=>classifySelectedWorks(c,c.state.projects.filter(p=>parity.selected.has(p.id)))],
    ...(c.state.projects.some(p=>parity.selected.has(p.id)&&!p.isSnapshot)
      ?[['设置状态',[
        ['已使用',()=>setSelectedWorkUsage(c,true)],
        ['未使用',()=>setSelectedWorkUsage(c,false)]
      ]]]:[])
  ]));
  const del=selectionAction(parity.workTab==='snapshot'?'删除快照':'删除作品',async()=>{
    if(!parity.selected.size||!confirm('将所选作品移到最近删除？'))return;
    const ids=[...parity.selected];finishSelection(parity);
    await c.moveProjectsToTrash(ids);
  },'danger');
  tray.append(more,del);
  function sync(){
    const active=selectionActive(parity,'work'),cards=[...c.view.querySelectorAll('[data-act="open-project"]')];
    tray.hidden=!active;
    c.view.querySelectorAll('.work-entry').forEach(b=>b.disabled=active);
    cards.forEach(card=>{
      const selected=active&&parity.selected.has(card.dataset.id);
      card.classList.toggle('batch-selected',selected);
      if(active)card.setAttribute('aria-pressed',String(selected));else card.removeAttribute('aria-pressed');
      card.style.display=parity.showOnlySelected&&active&&!parity.selected.has(card.dataset.id)?'none':'';
    });
    tray.querySelector('strong').textContent='本次选中 '+parity.selected.size+' 件';
    [...tray.querySelectorAll('button')].forEach((b,i)=>{b.disabled=i>0&&!parity.selected.size;});
    tray.querySelectorAll('button')[2]?.querySelector('.selection-action-label')?.replaceChildren(parity.showOnlySelected?'返回筛选':'查看所选');
    return true;
  }
  registerSelectionPresenter(c.view,sync);
}
function mountAssetBatch(c) {mountAssetSelection({...c,exportSelectedMaterials:ids=>exportMaterials(c,ids)},parity);}
async function classifyBatch(c,kind) {
  const records=(kind==='asset'?c.state.assets:c.state.projects).filter(x=>parity.selected.has(x.id));
  if(!records.length)throw Error('请先选择要识别的内容');
  let count=0;
  for(const record of records) {
    c.toast('正在识别 '+(count+1)+' / '+records.length);
    const complete=kind==='asset'?record:await c.db.completeProject(record);
    const image=kind==='asset'?await c.modelImage(record,null,512,false):(await c.rasterize(complete.drafts[0],.5)).toDataURL('image/jpeg',.8);
    const result=await classifyRecord({kind,record,settings:c.state.aiSettings,image,assets:c.state.assets,onProgress:p=>c.toast(p.phase+' · '+p.seconds+' 秒 · '+p.received+' 字符')});
    const next={...record,...result,updatedAt:new Date().toISOString()};await c.db.put(kind==='asset'?'assets':'projects',next);Object.assign(record,next);count++;
  }
  c.render();c.toast('已整理 '+count+' 件');
}
async function exportMaterials(c,ids) {
  const {pagePDF,canvasPDFPage,materialPrintPlacements}=await import('./pdf-export.js');
  const placements=materialPrintPlacements(ids.map(c.asset).filter(Boolean)),scale=300/25.4,pages=[];
  for(let page=0;page<=placements.at(-1).page;page++) {
    const canvas=document.createElement('canvas');canvas.width=Math.round(210*scale);canvas.height=Math.round(297*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#333';ctx.font=(3*scale)+'px sans-serif';
    ctx.fillText('拾页 · 素材打印 '+(page+1),8*scale,8*scale);ctx.font=(2.4*scale)+'px sans-serif';ctx.fillText('实际尺寸 100%，不要缩放以适合纸张',8*scale,13*scale);
    ctx.beginPath();ctx.moveTo(187*scale,12*scale);ctx.lineTo(197*scale,12*scale);ctx.stroke();ctx.fillText('10 mm',187*scale,8*scale);
    for(const p of placements.filter(p=>p.page===page)) {
      const blob=(await c.db.get('blobs',p.asset.blobId))?.data;if(!(blob instanceof Blob))throw Error('「'+p.asset.title+'」的原图无法读取');const im=new Image(),src=URL.createObjectURL(blob);im.src=src;try{await im.decode();
      ctx.fillText(p.asset.title+' · '+p.width+' × '+p.height+' mm',p.x*scale,(p.y-2)*scale,p.width*scale);
      ctx.drawImage(im,p.x*scale,p.y*scale,p.width*scale,p.height*scale);}finally{URL.revokeObjectURL(src);}
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
    row.append(button('彻底删除',async()=>{if(!confirm('彻底删除这项内容？此操作无法撤销。'))return;await changeTrash({db,state,ids:[id]});c.render();},'danger mini'));
  }
  const section=view.querySelector('.settings-detail');
  section.append(button('生成诊断',()=>showAIDiagnostics(c)),button('创作完整上下文',()=>showAIContexts(c)));
  section.append(button('清空最近删除',async()=>{if(!state.trash.length||!confirm('彻底删除最近删除中的所有内容？此操作无法撤销。'))return;await changeTrash({db,state,ids:state.trash.map(item=>item.id)});c.render();},'danger'));
  // Blob reclamation is a separate explicit action. Recursively scan every
  // record, including manual archives and trash; never delete live references.
  section.append(button('清理未使用的图片',async()=>{
    const blobs=await db.all('blobs'),referenced=new Set();
    const visit=value=>{if(typeof value==='string')referenced.add(value);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};
    for(const store of ['assets','projects','series','trash','meta']){let rows=await db.all(store);if(store==='projects')rows=await Promise.all(rows.map(db.completeProject));if(store==='trash')rows=await Promise.all(rows.map(async row=>row.kind==='project'?{...row,item:await db.completeProject(row.item)}:row));visit(rows);}
    const orphans=blobs.filter(b=>!referenced.has(b.id));
    await db.transaction(['blobs'],tx=>{for(const b of orphans)tx.objectStore('blobs').delete(b.id);});await refresh();c.toast('已清理 '+orphans.length+' 张未使用图片');
  }));
}
export function mountImportControls(c) {return mountImport({...c,skipImportPrewarm:true});}
function mountImport(c) {
  const {state,view,render}=c;
  // A second idempotent call covers keyboard/programmatic import entry where
  // there was no pointerdown on the catalog button.
  if(!c.skipImportPrewarm&&state.importMode!=='snapshot')void prewarmVision().catch(()=>{});
  mountImportCandidateMenus(c);
  if(state.importStep==='inspect') {
    const correction=view.querySelector('.paper-corner-overlay');if(state.showManualBox&&correction)correction.style.display='none';
    // Existing candidates remain drafts until the photo is confirmed again.
    for(const queue of view.querySelectorAll('.queue-item')) {
      if(queue.querySelector('[data-import-remove]'))continue;
      const remove=button('移除',()=>{},'mini');remove.dataset.importRemove='';remove.onclick=async e=>{e.stopPropagation();try{
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

}
