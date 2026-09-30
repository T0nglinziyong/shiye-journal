// Recently deleted is a view over the existing trash store, never a second copy
// of the library. Keep image blobs: other works may still reference them.
import {changeTrash} from './trash-actions.js';

function deletedPreview(record, kind, {esc, imgTag, workCover}) {
  if (kind === 'asset') return imgTag(record);
  const draft = record.drafts?.find(item => item.id === record.activeDraftID) || record.drafts?.[0];
  const staticCover = record.coverStaticPath && record.updatedAt === record.coverBaselineUpdatedAt;
  const cover = staticCover
    ? `<img class="work-reference" src="${esc(record.coverStaticPath)}" alt="${esc(record.title)}">`
    : workCover?.(draft) || '';
  return `<div class="thumb-sheet" style="aspect-ratio:${draft?.canvas?.width || 1}/${draft?.canvas?.height || 1};background:${esc(draft?.paperColor || '#fff')}">${cover}</div>`;
}

export function deletedCardHTML(entry, kind, helpers) {
  const {esc} = helpers;
  const title = esc(entry.item.title);
  const date = new Date(entry.date).toLocaleDateString();
  return `<article class="card deleted-row" data-trash-id="${esc(entry.id)}" aria-label="${title}，${date} 删除">
    <div class="card-image">${deletedPreview(entry.item, kind, helpers)}</div>
    <div class="card-body">
      <h3>${title}</h3><p>${date} 删除</p>
      <div class="deleted-actions">
        <button type="button" class="btn" data-recover="${esc(entry.id)}">恢复</button>
        <button type="button" class="btn danger" data-remove="${esc(entry.id)}">彻底删除</button>
      </div>
    </div>
  </article>`;
}

export function mountRecentlyDeleted(c, kind) {
  const {view, state, db, render, toast, esc, imgTag, workCover} = c;
  view.querySelectorAll('.filters,.swift-series-controls,.grid').forEach(node => node.remove());
  const list = document.createElement('section');
  list.className = 'grid recently-deleted-grid';
  list.dataset.kind = kind;
  list.setAttribute('aria-label', '最近删除');
  const records = state.trash.filter(entry => entry.kind === kind)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const selected=new Set();
  list.innerHTML = records.length
    ? records.map(entry => deletedCardHTML(entry, kind, {esc, imgTag, workCover})).join('')
    : `<p class="empty">没有最近删除的${kind === 'asset' ? '素材' : '作品'}。</p>`;

  const tray=document.createElement('div');
  tray.className='swift-tray manage deleted-selection-tray';
  tray.hidden=true;
  tray.innerHTML='<strong>已选 0 项</strong><button type="button" class="btn" data-trash-all>全选页面</button><button type="button" class="btn" data-trash-clear>清空选择</button><button type="button" class="btn" data-trash-recover>恢复所选</button><button type="button" class="btn danger" data-trash-remove>彻底删除所选</button>';
  const select=document.createElement('button');select.type='button';select.className='btn library-select-toggle';select.dataset.trashSelect='';select.textContent='选择';
  view.querySelector('.view-head .actions')?.append(select);
  let choosing=false,busy=false;
  function sync(){select.textContent=choosing?'完成':'选择';tray.hidden=!choosing;list.classList.toggle('selecting',choosing);tray.querySelector('strong').textContent=`已选 ${selected.size} 项`;for(const button of tray.querySelectorAll('[data-trash-recover],[data-trash-remove]'))button.disabled=!selected.size||busy;for(const card of list.querySelectorAll('[data-trash-id]')){const checked=selected.has(card.dataset.trashId);card.classList.toggle('batch-selected',choosing&&checked);card.setAttribute('aria-selected',String(choosing&&checked));let mark=card.querySelector('.batch-check');if(choosing&&!mark){mark=document.createElement('span');mark.className='batch-check';card.querySelector('.card-image').append(mark);}if(mark){mark.hidden=!choosing;mark.textContent=checked?'☑':'□';}}}
  select.onclick=()=>{choosing=!choosing;selected.clear();sync();};
  list.addEventListener('click',event=>{if(!choosing||event.target.closest('.deleted-actions'))return;const card=event.target.closest('[data-trash-id]');if(!card)return;const id=card.dataset.trashId;selected.has(id)?selected.delete(id):selected.add(id);sync();});
  tray.querySelector('[data-trash-all]').onclick=()=>{for(const entry of records)selected.add(entry.id);sync();};
  tray.querySelector('[data-trash-clear]').onclick=()=>{selected.clear();sync();};
  const act = async (ids, recover) => {
    const entries=state.trash.filter(item=>ids.includes(item.id)&&item.kind===kind);
    if(!entries.length||busy)return;
    if (!recover && !confirm(`彻底删除所选 ${entries.length} 项？此操作不能撤销。`)) return;
    busy=true;sync();
    try {
      await changeTrash({db,state,ids:entries.map(entry=>entry.id),recover});
      choosing=false;selected.clear();
      render();
      toast(recover ? `已恢复 ${entries.length} 项` : `已彻底删除 ${entries.length} 项`);
    } catch (error) {
      toast('操作未完成，资料仍在最近删除：'+(error.message||error.name));
      busy=false;sync();
    }
  };
  tray.querySelector('[data-trash-recover]').onclick=()=>act([...selected],true);
  tray.querySelector('[data-trash-remove]').onclick=()=>act([...selected],false);
  list.querySelectorAll('[data-recover]').forEach(button => button.onclick = () => act([button.dataset.recover], true));
  list.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => act([button.dataset.remove], false));
  view.append(list);
  const note=document.createElement('p');note.className='deleted-retention-note';note.textContent='最近删除保留 7 天，到期自动清除。';view.append(note);
  view.append(tray);

  if (kind === 'project') list.querySelectorAll('.thumb-sheet').forEach((frame, index) => {
    const record = records[index].item;
    const draft = record.drafts?.find(item => item.id === record.activeDraftID) || record.drafts?.[0];
    if (!draft) return;
    const fit = () => {
      const bounds = frame.parentElement.getBoundingClientRect();
      const scale = Math.min((bounds.width - 16) / draft.canvas.width, (bounds.height - 16) / draft.canvas.height);
      frame.style.setProperty('width', `${Math.max(1, draft.canvas.width * scale)}px`, 'important');
      frame.style.height = `${Math.max(1, draft.canvas.height * scale)}px`;
    };
    fit();
    const observer = new ResizeObserver(() => {
      if (!frame.isConnected) { observer.disconnect(); return; }
      fit();
    });
    observer.observe(frame.parentElement);
  });
}
