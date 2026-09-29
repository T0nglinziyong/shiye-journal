import {parseTags, seriesCovers} from './library-model.js';

export function showSeriesEditor({id, state, body, modal, db, uid, esc, imgTag, render, toast}) {
  const series = state.series.find(s => s.id === id);
  const members = series ? state.assets.filter(a => a.seriesID === id && !a.isProjectInternal) : [];
  let automatic = series?.coverAssetIDs == null;
  let chosen = series ? seriesCovers(series, state.assets).map(a => a.id) : [];
  body.innerHTML = '<div class="dialog-head"><button type="button" class="btn" id="series-cancel">取消</button><h2>' + (series ? '编辑系列' : '新建系列') + '</h2></div>' +
    '<div class="stack"><label>系列名称<input id="series-name" value="' + esc(series?.title || '') + '"></label>' +
    '<label>系列介绍<textarea id="series-about">' + esc(series?.introduction || '') + '</textarea></label>' +
    '<label>风格标签<input id="series-style-tags" value="' + esc((series?.styleTags || []).join('、')) + '"></label>' +
    '<label>内容标签<input id="series-semantic-tags" value="' + esc((series?.semanticTags || []).join('、')) + '"></label>' +
    '<p>用逗号分隔多个标签，搜索系列时也能找到它们。</p><h3>系列封面</h3><p>最多选择 5 件素材，共同组成封面。</p>' +
    '<button type="button" class="btn" id="series-auto-cover">使用自动封面（前 3 件）</button><p id="series-cover-state"></p>' +
    '<div class="mini-assets cover-picker">' + members.map(a => '<button type="button" class="mini-asset" data-cover="' + a.id + '">' + imgTag(a) + '<span>' + esc(a.title) + '</span></button>').join('') + '</div>' +
    (members.length ? '' : '<p>先向系列添加素材，再选择封面。</p>') + '<p id="series-error" role="alert"></p><button type="button" class="btn primary" id="series-save">保存系列</button></div>';
  const sync = () => {
    body.querySelector('#series-cover-state').textContent = automatic ? '自动封面' : '已选择 ' + chosen.length + ' / 5';
    body.querySelectorAll('[data-cover]').forEach(b => { b.classList.toggle('selected', chosen.includes(b.dataset.cover)); b.setAttribute('aria-pressed', String(chosen.includes(b.dataset.cover))); });
  };
  sync();
  body.querySelector('#series-cancel').onclick = () => modal.close();
  body.querySelector('#series-auto-cover').onclick = () => { automatic = true; chosen = members.slice(0, 3).map(a => a.id); sync(); };
  body.querySelectorAll('[data-cover]').forEach(b => b.onclick = () => {
    automatic = false;
    if (chosen.includes(b.dataset.cover)) chosen = chosen.filter(id => id !== b.dataset.cover);
    else if (chosen.length < 5) chosen.push(b.dataset.cover);
    else toast('封面最多选择 5 件素材');
    sync();
  });
  body.querySelector('#series-save').onclick = async () => {
    const button = body.querySelector('#series-save');
    const title = body.querySelector('#series-name').value.trim();
    if (!title) { body.querySelector('#series-error').textContent = '请填写系列名称'; return; }
    const next = {...series, id: series?.id || uid(), createdAt: series?.createdAt || new Date().toISOString(), title,
      introduction: body.querySelector('#series-about').value.trim(),
      styleTags: parseTags(body.querySelector('#series-style-tags').value), semanticTags: parseTags(body.querySelector('#series-semantic-tags').value),
      coverAssetIDs: automatic ? null : [...chosen], coverAssetID: automatic ? null : chosen[0] || null, updatedAt: new Date().toISOString()};
    button.disabled = true;
    try {
      await db.put('series', next);
      if (series) state.series[state.series.indexOf(series)] = next; else state.series.push(next);
      modal.close(); render(); toast('系列已保存');
    } catch (error) { button.disabled = false; body.querySelector('#series-error').textContent = error.message; }
  };
  modal.showModal();
}
