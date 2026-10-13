import './selection-menu.css';
import {finishSelection,selectionActive,toggleSelected} from './library-selection-model.js';
import {addMatchingFromLibrary} from './matching-selection.js';
import {togglePopover,closePopoverFor} from './swift-popover.js';
import {classifyRecord} from './classification.js';
import {supportsVision} from './ai-settings.js';
import {bindLongPress} from './long-press.js';
import {withUsageStatus} from './library-model.js';
import {registerSelectionPresenter} from './selection-presenter.js';
import {createSelectionSidePanels,selectionMorePopoverOptions} from './selection-side-panels.js';

const action=(name,fn)=>{
  const b=document.createElement('button');b.type='button';b.className='btn';
  const label=document.createElement('span');label.className='selection-action-label';label.textContent=name.replace(/\s*›$/u,'');b.append(label);
  if(/›$/u.test(name)){const arrow=document.createElement('span');arrow.className='selection-action-chevron';arrow.textContent=' ›';arrow.setAttribute('aria-hidden','true');b.append(arrow);}
  if(name==='更多操作'){b.dataset.selectionMore='';b.setAttribute('aria-expanded','false');b.setAttribute('aria-haspopup','menu');}
  b.onclick=async()=>{b.disabled=true;try{await fn(b);}catch(e){const toast=document.querySelector('#toast');toast.textContent=e.message;toast.classList.add('show');}finally{b.disabled=false;}};return b;
};
export function mountAssetSelection(c,p){
  const {state,view,render}=c,isActive=()=>selectionActive(p,'asset');
  view.querySelectorAll('.view-head .actions button,#series-actions button').forEach(b=>{if(['选择','完成'].includes(b.textContent))b.classList.add('library-select-toggle');});
  if(state.addingToSeries)return;
  if(!view.querySelector('.asset-grid,.series-grid'))return;
  const baseGrids=[...view.querySelectorAll('.asset-grid,.series-grid')];
  let baseCards=[...view.querySelectorAll('.card[data-act="detail"]')];
  const baseCounts=[...view.querySelectorAll('.library-count,.series-result-count,.swift-series-controls>span')].map(node=>[node,node.textContent]);
  let cards=baseCards,results=null,resultsSignature='';
  const wired=new WeakSet();
  const wire=card=>{if(wired.has(card))return;wired.add(card);card.addEventListener('click',e=>{if(!isActive())return;e.preventDefault();e.stopImmediatePropagation();toggleSelected(p,card.dataset.id);sync();},true);if(!view.querySelector('.series-contents'))bindLongPress(card,()=>c.openAssetEditor(card.dataset.id),()=>!isActive());};
  baseCards.forEach(wire);
  const showResults=()=>{const shown=isActive()&&p.showOnlySelected;
    if(shown){if(!results){results=document.createElement('div');results.className='grid asset-grid selection-results';view.append(results);}const signature=[...p.selected].sort().join('\u0000');if(signature!==resultsSignature){resultsSignature=signature;results.replaceChildren();for(const asset of state.assets.filter(a=>p.selected.has(a.id)&&!a.isProjectInternal)){const template=document.createElement('template');template.innerHTML=c.assetCard(asset);const card=template.content.firstElementChild;results.append(card);wire(card);}}cards=[...results.children];}
    else{results?.remove();results=null;resultsSignature='';cards=baseCards;}
    baseGrids.forEach(grid=>grid.style.display=shown?'none':'');
    for(const [node,value] of baseCounts)node.textContent=shown?cards.length+' 项':value;
  };
  const sync=()=>{showResults();const active=isActive();for(const card of cards){const chosen=active&&p.selected.has(card.dataset.id);card.classList.toggle('batch-selected',chosen);if(active)card.setAttribute('aria-pressed',String(chosen));else card.removeAttribute('aria-pressed');let check=card.querySelector('.batch-check');if(active&&!check){check=document.createElement('span');check.className='batch-check';card.append(check);}if(check){check.hidden=!active;check.textContent=chosen?'☑':'□';}const title=card.querySelector('h3');let mark=title?.querySelector('.basket-card-check');const inBasket=state.basket.includes(card.dataset.id);title?.classList.toggle('in-matching-basket',inBasket);if(inBasket&&!mark){mark=document.createElement('span');mark.className='basket-card-check';mark.textContent='✓';mark.setAttribute('aria-label','已加入搭配素材篮');title.append(mark);}if(!inBasket)mark?.remove();}tray.hidden=!active;if(!active||!p.selected.size)closePopoverFor(tray.querySelector('[data-selection-more]'));view.querySelectorAll('.library-select-toggle').forEach(b=>b.textContent=p.selectionMode?'完成':'选择');view.querySelectorAll('.action-card').forEach(b=>b.disabled=active);const n=tray.querySelector('strong');n.textContent='本次选中 '+p.selected.size+' 件';tray.querySelectorAll('[data-selection-required]').forEach(b=>b.disabled=!p.selected.size);const selectedButton=[...tray.querySelectorAll('button')].find(b=>b.textContent==='返回筛选'||b.textContent==='查看所选');if(selectedButton){selectedButton.textContent=p.showOnlySelected?'返回筛选':'查看所选';selectedButton.disabled=!p.selected.size&&!p.showOnlySelected;}return true;};
  view.assetCardsChanged=total=>{for(const row of baseCounts)if(row[0].classList.contains('library-count'))row[1]=total+' 项';baseCards=[...baseGrids.flatMap(grid=>[...grid.querySelectorAll('.card[data-act="detail"]')])];baseCards.forEach(wire);if(!results)cards=baseCards;sync();};
  const tray=document.createElement('div');tray.className='swift-tray manage library-management-tray';tray.dataset.selectionMode='asset';tray.innerHTML='<strong></strong>';
  const require=(name,fn)=>{const b=action(name,fn);b.dataset.selectionRequired='';return b;};
  tray.append(action('全选页面',()=>{cards.filter(b=>!b.hidden).forEach(b=>p.selected.add(b.dataset.id));sync();}),require('清空选择',()=>{p.selected.clear();p.showOnlySelected=false;sync();}),require(p.showOnlySelected?'返回筛选':'查看所选',()=>{p.showOnlySelected=!p.showOnlySelected;sync();}),require('加入搭配',()=>{addMatchingFromLibrary(state,[...p.selected]);finishSelection(p);sync();document.querySelector('#basket-count').textContent=state.basket.length;void c.matchingSession?.persist?.().catch(console.warn);c.toast('已加入搭配素材篮 · ★ 必须使用');}),require('更多操作',anchor=>moreMenu(c,p,anchor)),require('删除素材',async()=>{
    const records=state.assets.filter(a=>p.selected.has(a.id));if(!records.length||!confirm('将所选 '+records.length+' 件素材移到最近删除？'))return;
    const entries=records.map(item=>({id:crypto.randomUUID(),kind:'asset',item:structuredClone(item),date:new Date().toISOString()}));
    await c.db.transaction(['assets','trash'],tx=>{for(const e of entries){tx.objectStore('assets').delete(e.item.id);tx.objectStore('trash').put(e);}});state.assets=state.assets.filter(a=>!p.selected.has(a.id));state.basket=state.basket.filter(id=>!p.selected.has(id));state.trash.push(...entries);finishSelection(p);render();
  }));tray.lastChild.classList.add('danger');view.append(tray);registerSelectionPresenter(view,sync);
}
function moreMenu(c,p,anchor){
  const menu=togglePopover(anchor,selectionMorePopoverOptions());
  if(!menu)return;
  menu.surface.classList.add('selection-more-menu');

  // The submenu is a SECOND anchored pane, never an inline accordion.
  // Both panes remain clickable, and closing the parent closes its child.
  const side=createSelectionSidePanels(menu,{anchor,makeAction:action});
  const group=(title,choices)=>{
    const trigger=action(title+' ›',()=>{
      side.open(trigger,title,choices(),{pinned:title==='加入系列'?2:0});
    });
    trigger.dataset.expandedSubmenu='';
    trigger.setAttribute('aria-expanded','false');
    trigger.setAttribute('aria-haspopup','menu');
    menu.content.append(trigger);
  };
  group('导出素材',()=>[
    ...[['透明 PNG','png'],['白底 JPEG','jpeg'],['原始图像','original']].map(([label,format])=>[
      label,async()=>{menu.close();await exportImages(c,p,format);}
    ]),
    ...(c.exportSelectedMaterials?[['实际尺寸打印 PDF',async()=>{
      const ids=[...p.selected];menu.close();await c.exportSelectedMaterials(ids);
    }]]:[])
  ]);
  menu.content.append(action('重新识别',async()=>{
    const records=c.state.assets.filter(a=>p.selected.has(a.id)).map(a=>structuredClone(a)),
      cfg=structuredClone(c.state.aiSettings),accountID=c.state.accountId;
    if(!cfg.key||!cfg.includeThumbnails||!supportsVision(cfg))
      throw Error('请先配置可用的视觉模型并开启素材图片');
    menu.close();let completed=0,failed=0;
    await c.assetOrganization.run(records,{priority:'foreground',organize:async(record,isCurrent)=>{
      if(c.state.accountId!==accountID||!isCurrent())return;
      const image=await c.modelImage(record);
      if(!image)throw Error('素材图像无法读取');
      const result=await classifyRecord({kind:'asset',record,settings:cfg,image,assets:[]});
      if(await c.applyAssetClassification(record,result,{
        manual:true,isCurrent:()=>c.state.accountId===accountID&&isCurrent()
      }))completed++;
    },onError:()=>{failed++;}});
    if(c.state.accountId===accountID)
      c.toast(failed?`已整理 ${completed} 件，${failed} 件未完成；可稍后重试`:`已整理 ${completed} 件`);
  }));
  group('加入系列',()=>[
    ['新建系列…',()=>{
      menu.close();
      c.body.innerHTML='<h2>新建系列</h2><label>系列名称<input id="selection-new-series-name"></label><div id="selection-new-series-actions"></div>';
      c.body.querySelector('#selection-new-series-actions').append(
        action('取消',()=>c.modal.close()),
        action('新建并加入',async()=>{
          const name=c.body.querySelector('input').value.trim();
          if(!name)throw Error('请填写系列名称');
          const series={id:crypto.randomUUID(),title:name,introduction:'',
            createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
          await assignSeries(c,p,series.id,series);
          c.modal.close();
        })
      );
      c.modal.showModal();
    }],
    ['不归入系列',async()=>{menu.close();await assignSeries(c,p,null);}],
    ...c.state.series.map(series=>[series.title,async()=>{
      menu.close();await assignSeries(c,p,series.id);
    }])
  ]);
  group('设置状态',()=>[['已使用',true],['未使用',false]].map(([label,used])=>[
    label,async()=>{
      const at=new Date().toISOString();
      const revised=c.state.assets.filter(a=>p.selected.has(a.id)).map(a=>withUsageStatus(a,used,at));
      await c.db.transaction(['assets'],tx=>{
        for(const asset of revised)tx.objectStore('assets').put(asset);
      });
      for(const asset of revised)
        Object.assign(c.state.assets.find(a=>a.id===asset.id),asset);
      menu.close();c.render();c.toast('已设置 '+revised.length+' 件素材为'+label);
    }
  ]));
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
