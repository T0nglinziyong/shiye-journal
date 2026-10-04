// Parameterized cuts and bounded exact area intersection for polygonal source
// footprints. No image/DOM/model access. Coordinates passed to overlapArea are
// source millimetres; rendered occlusion and opacity never release inventory.
const EPS = 1e-9;
const MAX_POINTS = 256;
const MAX_EDGES = 2048;
const MAX_WORK = 2_000_000;
export const CRAFT_EDGE_STYLES = ['torn', 'ticket_notch', 'postage', 'fringe', 'partial_tear'];
const SIDES = ['top', 'right', 'bottom', 'left'];
const finite = (n, label, min, max) => {
  if (!Number.isFinite(n) || n < min || n > max) throw Error(`${label} 数值无效`);
  return n;
};
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const signedArea = points => points.reduce((s, a, i) => {
  const b = points[(i + 1) % points.length];
  return s + a[0] * b[1] - a[1] * b[0];
}, 0) / 2;
const close = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function craftPermission(options, asset) {
  const selected = options.assetProcessing?.[asset.id] || options.processing;
  if (!selected) throw Error('缺少当前素材加工权限');
  if (!['不预设','AI 自主加工'].includes(selected)) return selected;
  return '自由拆解';
}

export function buildCraftEdge(operation, widthMM, heightMM) {
  finite(widthMM, '裁片宽度', 2, 10000);
  finite(heightMM, '裁片高度', 2, 10000);
  const {style, edges = ['bottom'], depth_mm: depth = 1, period_mm: period = 6, seed = 0, position = .5} = operation;
  if (!CRAFT_EDGE_STYLES.includes(style)) throw Error('未实现的参数化边缘');
  if (!Array.isArray(edges) || !edges.length || edges.length > 4 || new Set(edges).size !== edges.length || edges.some(side => !SIDES.includes(side))) throw Error('加工边无效或重复');
  finite(depth, '齿深/撕边深度', .1, Math.min(widthMM, heightMM) * .2);
  finite(period, '齿距/缺口宽度', .5, 1000);
  finite(position, '局部缺口位置', 0, 1);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw Error('撕边 seed 必须是 32 位非负整数');
  const rng = random(seed), points = [], clearance = depth + .1;
  const add = (side, length, t, inset) => {
    const p = side === 'top' ? [t / widthMM, inset / heightMM]
      : side === 'right' ? [1 - inset / widthMM, t / heightMM]
      : side === 'bottom' ? [1 - t / widthMM, 1 - inset / heightMM]
      : [inset / widthMM, 1 - t / heightMM];
    if (!points.length || !close(points.at(-1), p)) points.push(p);
    if (points.length > MAX_POINTS) throw Error('工艺轮廓超过 256 点；请增大齿距或减少加工边');
  };
  for (const side of SIDES) {
    const length = ['top', 'bottom'].includes(side) ? widthMM : heightMM;
    add(side, length, 0, 0);
    if (edges.includes(side)) {
      const available = length - 2 * clearance;
      if (available < period) throw Error('裁片边过短，不能容纳当前齿距/缺口及完整角部');
      if (style === 'torn') {
        const count = Math.max(3, Math.ceil(available / period) * 3);
        if (count + points.length + 4 > MAX_POINTS) throw Error('撕边过密；请增大 period_mm');
        for (let i = 0; i <= count; i++) add(side, length, clearance + available * i / count, i === 0 || i === count ? 0 : depth * (.15 + .85 * rng()));
      } else if (style === 'ticket_notch' || style === 'partial_tear') {
        const center = length * position, start = center - period / 2;
        if (start < clearance || start + period > length - clearance) throw Error('局部缺口必须避开裁片角部');
        for (let i = 0; i <= 12; i++) {
          const u = i / 12, curve = Math.sin(Math.PI * u);
          const inset = i === 0 || i === 12 ? 0 : depth * curve * (style === 'partial_tear' ? .55 + .45 * rng() : 1);
          add(side, length, start + period * u, inset);
        }
      } else {
        const count = Math.floor(available / period), start = (length - count * period) / 2;
        const vertices = style === 'fringe' ? count * 4 : count * 8 + 1;
        if (vertices + points.length + 8 > MAX_POINTS) throw Error('齿形过密；请增大 period_mm 或减少加工边');
        for (let i = 0; i < count; i++) {
          const left = start + i * period;
          if (style === 'fringe') {
            // Slots are actual removed material; the inset cap leaves a single
            // connected spine. The slit is not a white overlay or zero-width cut.
            const a = left + period * .39, b = left + period * .61;
            add(side, length, a, 0); add(side, length, a, depth);
            add(side, length, b, depth); add(side, length, b, 0);
          } else {
            for (let j = 0; j <= 8; j++) add(side, length, left + period * j / 8, j === 0 || j === 8 ? 0 : depth * Math.sin(Math.PI * j / 8));
          }
        }
      }
    }
    add(side, length, length, 0);
  }
  if (close(points[0], points.at(-1))) points.pop();
  validateRing(points);
  return {shape: 'polygon', points};
}

function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) < EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
}
function intersects(a, b, c, d) {
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  return x * y < 0 && z * w < 0 || Math.abs(x) < EPS && onSegment(a, b, c) || Math.abs(y) < EPS && onSegment(a, b, d) || Math.abs(z) < EPS && onSegment(c, d, a) || Math.abs(w) < EPS && onSegment(c, d, b);
}
function validateRing(input) {
  if (!Array.isArray(input) || input.length < 3 || input.length > MAX_EDGES || input.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || Math.abs(n) > 100000))) throw Error('源区域轮廓无效或过于复杂');
  const ring = input.map(p => [...p]);
  if (close(ring[0], ring.at(-1))) ring.pop();
  if (ring.length < 3 || Math.abs(signedArea(ring)) < EPS) throw Error('源区域轮廓面积为空');
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (close(a, b)) throw Error('源区域有重复边点');
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || i === 0 && j === ring.length - 1) continue;
      if (intersects(a, b, ring[j], ring[(j + 1) % ring.length])) throw Error('源区域轮廓自交或相接，不能核验实体库存');
    }
  }
  return ring;
}
const segments = rings => rings.flatMap(ring => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]));
const bounds = rings => {
  const p = rings.flat();
  return [Math.min(...p.map(x => x[0])), Math.min(...p.map(x => x[1])), Math.max(...p.map(x => x[0])), Math.max(...p.map(x => x[1]))];
};
function intervals(edges, y) {
  const xs = [];
  for (const [a, b] of edges) if (a[1] <= y && b[1] > y || b[1] <= y && a[1] > y) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  xs.sort((a, b) => a - b);
  if (xs.length % 2) throw Error('源区域扫描线异常，未放宽库存校验');
  const result = [];
  for (let i = 0; i < xs.length; i += 2) if (xs[i + 1] - xs[i] > EPS) result.push([xs[i], xs[i + 1]]);
  return result;
}
function commonWidth(a, b) {
  let i = 0, j = 0, total = 0;
  while (i < a.length && j < b.length) {
    total += Math.max(0, Math.min(a[i][1], b[j][1]) - Math.max(a[i][0], b[j][0]));
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return total;
}

// Within a band bounded by every vertex and crossing y, all edge orders stay
// fixed and intersection width is linear. Midpoint width * band height is
// therefore the exact integral for these polygonal inputs, not pixel sampling.
// This is deliberately an area-only kernel, not a general Boolean clipper.
export function sourceIntersectionArea(regionA, regionB) {
  if (!regionA?.outer || !regionB?.outer) throw Error('缺少实体源轮廓');
  const rawA = [regionA.outer, ...(regionA.holes || [])], rawB = [regionB.outer, ...(regionB.holes || [])];
  if (rawA.flat().length > MAX_EDGES || rawB.flat().length > MAX_EDGES) throw Error('源区域超过几何核验上限');
  const a = rawA.map(validateRing), b = rawB.map(validateRing), ba = bounds(a), bb = bounds(b);
  if (Math.min(ba[2], bb[2]) <= Math.max(ba[0], bb[0]) || Math.min(ba[3], bb[3]) <= Math.max(ba[1], bb[1])) return 0;
  const ea = segments(a), eb = segments(b);
  if (ea.length * eb.length > MAX_WORK) throw Error('源区域交叉核验过于复杂，请简化工序');
  const ys = [...new Set(a.concat(b).flat().map(p => p[1]))];
  for (const [p, q] of ea) for (const [r, s] of eb) {
    const ax = q[0] - p[0], ay = q[1] - p[1], bx = s[0] - r[0], by = s[1] - r[1], denominator = ax * by - ay * bx;
    if (Math.abs(denominator) < EPS) continue;
    const dx = r[0] - p[0], dy = r[1] - p[1];
    const t = (dx * by - dy * bx) / denominator, u = (dx * ay - dy * ax) / denominator;
    if (t > 0 && t < 1 && u > 0 && u < 1) ys.push(p[1] + t * ay);
    if (ys.length > 4096) throw Error('源区域交点过多，请简化工序');
  }
  ys.sort((x, y) => x - y);
  const levels = ys.filter((y, i) => i === 0 || y - ys[i - 1] > EPS);
  if (levels.length * (ea.length + eb.length) > MAX_WORK) throw Error('源区域扫描核验过于复杂');
  let area = 0;
  for (let i = 1; i < levels.length; i++) {
    const lo = levels[i - 1], hi = levels[i], mid = (lo + hi) / 2;
    if (hi <= Math.max(ba[1], bb[1]) || lo >= Math.min(ba[3], bb[3])) continue;
    area += commonWidth(intervals(ea, mid), intervals(eb, mid)) * (hi - lo);
  }
  return area;
}

export function sourceFootprint(item, asset, geometry) {
  const crop = item.cropRect || {x: 0, y: 0, width: 1, height: 1};
  const mask = geometry || {outer: [[0, 0], [1, 0], [1, 1], [0, 1]], holes: []};
  const map = p => [(crop.x + p[0] * crop.width) * asset.physicalWidthMM, (crop.y + p[1] * crop.height) * asset.physicalHeightMM];
  return {outer: mask.outer.map(map), holes: (mask.holes || []).map(ring => ring.map(map))};
}

export function craftUsage(draft) {
  const items = draft.items || [], kinds = new Set();
  let processed = 0, relations = 0;
  for (const item of items) {
    const steps = (item.materialSteps || []).filter(op => op.op !== 'whole');
    if (steps.length || item.cropRect || item.materialMask) processed++;
    for (const op of steps) kinds.add(op.op === 'edge' ? `edge:${op.style}` : op.op);
    if (item.materialRelation) relations++;
  }
  return {pieces: items.length, processedPieces: processed, wholePieces: items.length - processed, relationPieces: relations, operationKinds: [...kinds].sort(), allWhole: !!items.length && !processed};
}
