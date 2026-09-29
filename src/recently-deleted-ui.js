// Recently deleted is a view over the existing trash store, never a second copy
// of the library. Keep image blobs: other works may still reference them.
const storeForKind = kind => kind === 'asset' ? 'assets' : 'projects';

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
  return `<article class="card deleted-row" aria-label="${title}，${date} 删除">
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
  list.innerHTML = records.length
    ? records.map(entry => deletedCardHTML(entry, kind, {esc, imgTag, workCover})).join('')
    : `<p class="empty">没有最近删除的${kind === 'asset' ? '素材' : '作品'}。</p>`;

  const act = async (id, recover, button) => {
    const entry = state.trash.find(item => item.id === id);
    if (!entry) return;
    if (!recover && !confirm(`彻底删除「${entry.item.title}」？此操作不能撤销。`)) return;
    button.disabled = true;
    try {
      const store = storeForKind(kind);
      await db.transaction(recover ? [store, 'trash'] : ['trash'], tx => {
        if (recover) tx.objectStore(store).put(entry.item);
        tx.objectStore('trash').delete(entry.id);
      });
      if (recover) {
        const items = state[store];
        const index = items.findIndex(item => item.id === entry.item.id);
        if (index < 0) items.push(entry.item);
        else items[index] = entry.item;
      }
      state.trash = state.trash.filter(item => item.id !== id);
      render();
      toast(recover ? '已恢复' : '已彻底删除，无法撤销');
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  };
  list.querySelectorAll('[data-recover]').forEach(button => button.onclick = () => act(button.dataset.recover, true, button));
  list.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => act(button.dataset.remove, false, button));
  view.append(list);

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
