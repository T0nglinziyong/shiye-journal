// One-shot geometric relation compilation. User drags remain ordinary edits;
// these records do not silently constrain or reposition future manual edits.
const keyOf = item => item.creativePieceID || item.agentKey || item.key || item.id;
const radians = degrees => degrees * Math.PI / 180;
const degrees = value => ((value + 180) % 360 + 360) % 360 - 180;
const positive = (n, label, max = 10000) => {
  if (!Number.isFinite(n) || n < 0 || n > max) throw Error(`${label} 数值无效`);
  return n;
};
const rotate = (x, y, angle) => {
  const a = radians(angle);
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
function anchor(item, ratio = [.5, .5]) {
  if (!Array.isArray(ratio) || ratio.length !== 2 || ratio.some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw Error('搭桥锚点必须是目标局部 0–1 坐标');
  const [x, y] = rotate((ratio[0] - .5) * item.width, (ratio[1] - .5) * item.height, item.rotation || 0);
  return [item.x + x, item.y + y];
}

export function solveCraftRelations(objects, entries, pixelsPerMM) {
  if (!Number.isFinite(pixelsPerMM) || pixelsPerMM <= 0) throw Error('素材关系缺少物理标定');
  const lookup = new Map(objects.flatMap(item => [[keyOf(item), item], [item.id, item]]));
  const plans = new Map(), results = new Map(), visiting = new Set();
  for (const entry of entries) {
    const item = lookup.get(entry.piece);
    if (!item) throw Error('关系片段不存在：' + entry.piece);
    const id = keyOf(item);
    if (plans.has(id)) throw Error('同一片段关系重复：' + id);
    plans.set(id, entry);
  }
  const resolve = key => {
    const source = lookup.get(key);
    if (!source) throw Error('关系目标不存在：' + key);
    const id = keyOf(source);
    if (results.has(id)) return {...source, ...results.get(id)};
    if (!plans.has(id)) return source;
    if (visiting.has(id)) throw Error('素材关系形成循环：' + id);
    if (source.isLocked || source.locked) throw Error('图层已锁定：' + id);
    visiting.add(id);
    const relation = plans.get(id).relation;
    if (!relation) {
      results.set(id, {materialRelation: null});
      visiting.delete(id);
      return {...source, materialRelation: null};
    }
    const target = resolve(relation.target);
    if (keyOf(target) === id) throw Error('片段不可相对自身');
    const patch = {x: target.x, y: target.y, rotation: source.rotation || 0, zIndex: (target.zIndex || 0) - 1, materialRelation: structuredClone(relation)};
    if (relation.kind === 'peek' || relation.kind === 'underlay') {
      const offset = relation.rotation_offset || 0;
      if (!Number.isFinite(offset) || Math.abs(offset) > 180) throw Error('相对旋转无效');
      patch.rotation = degrees((target.rotation || 0) + offset);
      let dx = 0, dy = 0;
      if (relation.kind === 'underlay') {
        const values = relation.offset_mm || [0, 0];
        if (!Array.isArray(values) || values.length !== 2 || values.some(v => !Number.isFinite(v) || Math.abs(v) > 1000)) throw Error('垫底偏移无效');
        [dx, dy] = values.map(n => n * pixelsPerMM);
      } else {
        if (!['left', 'right', 'top', 'bottom'].includes(relation.edge)) throw Error('探出方向无效');
        const angle = radians(offset), width = Math.abs(Math.cos(angle)) * source.width + Math.abs(Math.sin(angle)) * source.height;
        const height = Math.abs(Math.sin(angle)) * source.width + Math.abs(Math.cos(angle)) * source.height;
        const exposure = positive(relation.exposed_mm, '露出长度', 1000) * pixelsPerMM;
        const horizontal = ['left', 'right'].includes(relation.edge), extent = horizontal ? width : height;
        if (exposure > extent + 1e-6) throw Error('探出长度超过片段投影尺寸，不能通过缩放实现');
        const along = relation.along_mm || 0;
        if (!Number.isFinite(along) || Math.abs(along) > 1000) throw Error('沿边偏移无效');
        const distance = (horizontal ? target.width : target.height) / 2 + exposure - extent / 2;
        if (horizontal) { dx = relation.edge === 'left' ? -distance : distance; dy = along * pixelsPerMM; }
        else { dy = relation.edge === 'top' ? -distance : distance; dx = along * pixelsPerMM; }
      }
      const [x, y] = rotate(dx, dy, target.rotation || 0);
      patch.x += x; patch.y += y;
    } else if (relation.kind === 'bridge') {
      const other = resolve(relation.target2);
      if (keyOf(other) === id || keyOf(other) === keyOf(target)) throw Error('搭桥需要两个不同的目标');
      const a = anchor(target, relation.anchor_from), b = anchor(other, relation.anchor_to);
      const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (distance < 1e-6) throw Error('搭桥锚点重合');
      const contact = positive(relation.contact_mm ?? 2, '搭桥接触长度', 100) * pixelsPerMM;
      const length = Math.max(source.width, source.height);
      if (distance + 2 * contact > length + 1e-6) throw Error('现有片段长度不足以搭桥；请重新裁取有效长段，不可拉伸');
      Object.assign(patch, {x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2,
        rotation: degrees(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI - (source.width >= source.height ? 0 : 90)),
        zIndex: Math.max(target.zIndex || 0, other.zIndex || 0) + 1});
    } else throw Error('尚未实现关系 ' + relation.kind);
    visiting.delete(id); results.set(id, patch);
    return {...source, ...patch};
  };
  for (const key of plans.keys()) resolve(key);
  return results;
}
