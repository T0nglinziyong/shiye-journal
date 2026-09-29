import {beginSelection,finishSelection} from './library-selection-model.js';
import {openPopover} from './swift-popover.js';
import {classifyRecord} from './classification.js';

const action=(name,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=name;b.onclick=async()=>{b.disabled=true;try{await fn(b);}catch(e){const toast=document.querySelector('#toast');toast.textContent=e.message;toast.classList.add('show');}finally{b.disabled=false;}};return b;};
export function mountAssetSelection(c,p){
  const {state,view,render}=c,active=p.selectionMode==='asset'&&p.selection;
  view.querySelectorAll('.view-head .actions button,#series-actions button').forEach(b=>{if(['选择','完成'].includes(b.textContent))b.classList.add('library-select-toggle');});
  if(state.addingToSeries)return;
  let cards=[...view.querySelectorAll('.card[data-act="detail"]')];
  if(active&&p.showOnlySelected){
    view.querySelectorAll('.asset-grid,.series-grid').forEach(grid=>grid.style.display='none');
    const grid=document.createElement('div');grid.className='grid asset-grid selection-results';
    grid.innerHTML=state.assets.filter(a=>p.selected.has(a.id)&&!a.isProjectInternal).map(c.assetCard).join('');
    view.append(grid);cards=[...grid.children];view.querySelectorAll('.library-count,.series-result-count,.swift-series-controls>span').forEach(n=>n.textContent=cards.length+' 项');
  }
  const sync=()=>{for(const card of cards){const chosen=active&&p.selected.has(card.dataset.id);card.classList.toggle('batch-selected',chosen);if(active)card.setAttribute('aria-pressed',String(chosen));let check=card.querySelector('.batch-check');if(active&&!check){check=document.createElement('span');check.className='batch-check';card.append(check);}if(check)check.textContent=chosen?'☑':'□';}const n=view.querySelector('.swift-tray.manage strong');if(n)n.textContent='本次选中 '+p.selected.size+' 件';view.querySelectorAll('[data-selection-required]').forEach(b=>b.disabled=!p.selected.size);};
  for(const card of cards){const title=card.querySelector('h3');if(title&&state.basket.includes(card.dataset.id)){title.classList.add('in-matching-basket');const mark=document.createElement('span');mark.className='basket-card-check';mark.textContent='✓';mark.setAttribute('aria-label','已加入搭配素材篮');title.append(mark);}if(active)card.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();p.selected.has(card.dataset.id)?p.selected.delete(card.dataset.id):p.selected.add(card.dataset.id);if(p.showOnlySelected)render();else sync();},true);}
  if(!active)return;
  view.querySelectorAll('.action-card').forEach(b=>b.disabled=true);
  const tray=document.createElement('div');tray.className='swift-tray manage library-management-tray';tray.dataset.selectionMode='asset';tray.innerHTML='<strong></strong>';
  const require=(name,fn)=>{const b=action(name,fn);b.dataset.selectionRequired='';return b;};
  tray.append(action('全选页面',()=>{cards.filter(b=>!b.hidden).forEach(b=>p.selected.add(b.dataset.id));sync();}),require('清空选择',()=>{p.selected.clear();p.showOnlySelected=false;render();}),require(p.showOnlySelected?'返回筛选':'查看所选',()=>{p.showOnlySelected=!p.showOnlySelected;render();}),require('加入搭配',()=>{state.basket=[...new Set([...state.basket,...p.selected])];finishSelection(p);render();c.toast('已加入搭配素材篮');}),require('更多操作',anchor=>moreMenu(c,p,anchor)),require('删除素材',async()=>{
    const records=state.assets.filter(a=>p.selected.has(a.id));if(!records.length||!confirm('将所选 '+records.length+' 件素材移到最近删除？'))return;
    const entries=records.map(item=>({id:crypto.randomUUID(),kind:'asset',item:structuredClone(item),date:new Date().toISOString()}));
    await c.db.transaction(['assets','trash'],tx=>{for(const e of entries){tx.objectStore('assets').delete(e.item.id);tx.objectStore('trash').put(e);}});state.assets=state.assets.filter(a=>!p.selected.has(a.id));state.basket=state.basket.filter(id=>!p.selected.has(id));state.trash.push(...entries);finishSelection(p);render();
  }));tray.lastChild.classList.add('danger');view.append(tray);sync();
}
function moreMenu(c,p,anchor){const menu=openPopover(anchor,{menu:true,width:230});menu.surface.classList.add('selection-more-menu');menu.content.append(action('加入系列 ›',b=>submenu(menu,b,'加入系列',(series,newSeries)=>assignSeries(c,p,series,newSeries))),action('重新识别',async()=>{
  const records=c.state.assets.filter(a=>p.selected.has(a.id));menu.close();for(const [i,a] of records.entries()){c.toast('正在识别 '+(i+1)+' / '+records.length);const result=await classifyRecord({kind:'asset',record:a,settings:c.state.aiSettings,image:await c.modelImage(a),assets:c.state.assets});const next={...a,...result,updatedAt:new Date().toISOString()};await c.db.put('assets',next);Object.assign(a,next);}c.render();c.toast('已整理 '+records.length+' 件');
}),action('导出图像 ›',b=>submenu(menu,b,'导出图像',null)));
  let closeChild=null;
  function submenu(parent,b,title,assign){closeChild?.();const previous=parent.content,panel=document.createElement('section');panel.className='swift-popover swift-menu selection-submenu';panel.setAttribute('role','menu');panel.setAttribute('aria-label',title);panel.style.width='230px';const back=action('‹ 更多操作',()=>{remove();closeChild=null;previous.hidden=false;parent.position();b.focus();});panel.append(back);const remove=parent.addSurface(panel,()=>{const r=parent.surface.getBoundingClientRect(),w=230,side=r.right+w+8<=innerWidth-12?r.right+8:r.left-w-8>=12?r.left-w-8:r.left;previous.hidden=innerWidth<500;panel.style.left=Math.max(12,Math.min(side,innerWidth-w-12))+'px';panel.style.maxHeight=(innerHeight-24)+'px';panel.style.top=Math.max(12,Math.min(r.top,innerHeight-panel.offsetHeight-12))+'px';});
    closeChild=()=>{remove();previous.hidden=false;};queueMicrotask(()=>back.focus());
    if(assign){for(const series of [{id:null,title:'不归入系列'},...c.state.series])panel.append(action(series.title,async()=>{await assign(series.id);parent.close();}));panel.append(action('新建系列…',()=>{parent.close();c.body.innerHTML='<h2>新建系列</h2><label>系列名称<input id="selection-new-series-name"></label><div id="selection-new-series-actions"></div>';c.body.querySelector('#selection-new-series-actions').append(action('取消',()=>c.modal.close()),action('新建并加入',async()=>{const name=c.body.querySelector('input').value.trim();if(!name)throw Error('请填写系列名称');const series={id:crypto.randomUUID(),title:name,introduction:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await assign(series.id,series);c.modal.close();}));c.modal.showModal();}));}
    else for(const [name,format] of [['透明 PNG','png'],['白底 JPEG','jpeg'],['原始图像','original']])panel.append(action(name,async()=>{parent.close();await exportImages(c,p,format);}));
    parent.surface.dataset.submenu=title;parent.position();
  }
}
async function assignSeries(c,p,id,newSeries=null){const revised=c.state.assets.filter(a=>p.selected.has(a.id)).map(a=>({...a,seriesID:id}));await c.db.transaction(newSeries?['assets','series']:['assets'],tx=>{if(newSeries)tx.objectStore('series').put(newSeries);for(const a of revised)tx.objectStore('assets').put(a);});if(newSeries)c.state.series.push(newSeries);for(const a of revised)Object.assign(c.state.assets.find(x=>x.id===a.id),a);finishSelection(p);c.render();c.toast('已更新所属系列');}
async function exportImages(c,p,format){const records=c.state.assets.filter(a=>p.selected.has(a.id)),files=[];
  for(const a of records){let blob=(await c.db.get('blobs',format==='original'?(a.originalBlobId||a.blobId):a.blobId))?.data;if(!blob){if(format==='original'&&a.originalBlobId&&a.originalBlobId!==a.blobId)throw Error('「'+a.title+'」没有可导出的原始图像');const src=c.imgTag(a).match(/src="([^"]+)"/)?.[1];if(!src)throw Error('无法读取「'+a.title+'」图像');const response=await fetch(src);if(!response.ok)throw Error('图像读取失败');blob=await response.blob();}
    if(format!=='original'){const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');if(format==='jpeg'){ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(bitmap,0,0);bitmap.close();blob=await new Promise(r=>canvas.toBlob(r,'image/'+format,.95));}
    const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','image/avif':'avif','image/heic':'heic'})[blob.type]||'bin';files.push(new File([blob],a.title.replace(/[\\/:*?"<>|]/g,'_')+'.'+ext,{type:blob.type}));
  }
  if(navigator.canShare?.({files})){try{await navigator.share({files,title:'拾页素材图像'});return;}catch(e){if(e.name==='AbortError')return;}}
  for(const file of files)c.download(file,file.name);c.toast('已导出 '+files.length+' 张图像');
}
