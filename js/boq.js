// 用量与参考造价 —— 纯函数，设计器、清单页、判卷调用的都是这一份。
// 每个系数都有出处（见 FACTORS 的 src），结构尺寸是示意假设（src 为 null，页面上写明以结构工程师设计为准）。
const A = 'https://aedoconstruction.com/blog/';
export const FACTORS = [
  { key: 'waste', v: 0.05, zh: '砌块损耗 5%（12.5 块/m² 理论值 +5% 按 13 块采购）', en: 'Block waste 5% (12.5/m² theoretical, buy 13)', src: A + 'chb-quantity-estimator-philippines/' },
  { key: 'mortarCement', v: 0.5, zh: '空心砖砌筑砂浆：每 m² 墙 0.5 包水泥', en: 'CHB mortar: 0.5 bag cement per m² of wall', src: A + 'chb-quantity-estimator-philippines/' },
  { key: 'mortarSand', v: 0.035, zh: '空心砖砌筑砂浆：每 m² 墙 0.035 m³ 砂', en: 'CHB mortar: 0.035 m³ sand per m² of wall', src: A + 'chb-quantity-estimator-philippines/' },
  { key: 'rebar', v: 110, zh: '钢筋：每 m³ 混凝土 110 kg（80–110 的上限，两层框架偏上限）', en: 'Rebar: 110 kg per m³ of concrete (top of the 80–110 band for two-storey frames)', src: A + 'bill-of-materials-house-philippines/' },
  { key: 'pitch', v: 1.15, zh: '坡屋面面积 = 投影面积 × 1.15', en: 'Pitched roof area = plan area × 1.15', src: A + 'bill-of-materials-house-philippines/' },
  { key: 'poolShell', v: 0.15, zh: '泳池壳平均厚 150 mm（池底 + 池壁）', en: 'Pool shell 150 mm average (floor + walls)', src: A + 'swimming-pool-construction-cost-philippines-2026/' },
  { key: 'col', v: 0.3, zh: '柱截面 300×300 mm（NSCP 418.7.2.1 最短边下限）', en: 'Columns 300×300 mm (NSCP 418.7.2.1 minimum)', src: A + 'column-size-2-storey-house-philippines/' },
  { key: 'pad', v: [1.0, 1.0, 0.3], zh: '独立基础 1.0×1.0×0.3 m，底深 1.5 m（示意）', en: 'Footing pads 1.0×1.0×0.3 m, 1.5 m deep (illustrative)', src: null },
  { key: 'tie', v: [0.25, 0.3], zh: '地梁 250×300 mm（示意）', en: 'Foundation beams 250×300 mm (illustrative)', src: null },
  { key: 'beam', v: [0.25, 0.4], zh: '楼层梁 250×400 mm（示意）', en: 'Floor beams 250×400 mm (illustrative)', src: null },
  { key: 'slab0', v: 0.1, zh: '一层地坪 100 mm + 100 mm 碎石垫层（示意）', en: 'Ground slab 100 mm on 100 mm base course (illustrative)', src: null },
  { key: 'slab1', v: 0.125, zh: '二层楼板 / 平屋面板 125 mm（示意）', en: '2nd-floor / flat roof slab 125 mm (illustrative)', src: null },
  { key: 'overhang', v: 0.6, zh: '屋檐出挑 0.6 m（示意）', en: 'Roof overhang 0.6 m (illustrative)', src: null },
  { key: 'terrace', v: 2.5, zh: '一层南侧露台 2.5 m 深（示意）', en: 'South terrace 2.5 m deep (illustrative)', src: null },
  { key: 'fence', v: 1.8, zh: '围墙按地块周长减去大门宽度计延米（1.8 m 高 6 寸空心砖、两面抹灰，单价含基础、柱、压顶和人工）', en: 'Fence: lot perimeter minus gate widths, per linear metre (1.8 m CHB, plastered, footing/columns/coping/labour included)', src: A + 'chb-perimeter-fence-cost-philippines-2026/' },
  { key: 'parking', v: 0.1, zh: '车位地坪 100 mm 混凝土 + 100 mm 碎石垫层（示意）；车棚按车位面积计', en: 'Parking pad 100 mm concrete on 100 mm base (illustrative); carport priced on the pad area', src: A + 'carport-steel-gate-fabrication-cost-philippines/' },
  { key: 'win', v: 1.44, zh: '窗按 1.2×1.2 m 标准窗折算樘数（面积 ÷ 1.44）', en: 'Windows counted as 1.2×1.2 m units (area ÷ 1.44)', src: null },
];
export const F = Object.fromEntries(FACTORS.map(f => [f.key, f.v]));

export const wlen = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
export function bboxOf(walls) {
  if (!walls.length) return null;
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const w of walls) for (const p of [w.a, w.b]) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
  return b[2] - b[0] > 0 && b[3] - b[1] > 0 ? b : null;
}
// 柱：每层每个墙端点一根
export function columnsOf(d, floor) {
  const seen = new Map();
  for (const w of d.walls) if (w.floor === floor) for (const p of [w.a, w.b]) seen.set(p[0] + ',' + p[1], p);
  return [...seen.values()];
}
export const topFloor = d => (d.walls.some(w => w.floor === 1) ? 1 : 0);
// 一层地坪（含南侧露台，但不压到泳池、不出地块）
export function groundSlabOf(d) {
  const b = bboxOf(d.walls.filter(w => w.floor === 0)); if (!b) return null;
  let z2 = Math.min(d.lot.d, b[3] + F.terrace);
  if (d.pool && d.pool.x < b[2] && d.pool.x + d.pool.w > b[0]) z2 = Math.max(b[3], Math.min(z2, d.pool.z - 0.5));
  return { house: b, terrace: z2 > b[3] ? [b[0], b[3], b[2], z2] : null };
}
// 楼梯洞：楼梯在二层楼板范围内时，二层楼板在楼梯上方开洞
export function stairHole(d) {
  const b = slab1Of(d), s = d.stairs; if (!b || !s) return null;
  const r = [Math.max(b[0], s.x), Math.max(b[1], s.z), Math.min(b[2], s.x + s.w), Math.min(b[3], s.z + s.d)];
  return r[2] - r[0] > 0.3 && r[3] - r[1] > 0.3 ? r : null;
}
// 矩形挖掉一个洞，剩下最多 4 块矩形
export function rectMinus(r, h) {
  if (!h) return [r];
  return [[r[0], r[1], r[2], h[1]], [r[0], h[3], r[2], r[3]], [r[0], h[1], h[0], h[3]], [h[2], h[1], r[2], h[3]]].filter(q => q[2] - q[0] > 1e-6 && q[3] - q[1] > 1e-6);
}
// 二层楼板：有二层墙时，盖住一、二层墙的总范围（一层多出来的部分成为二楼露台）
export function slab1Of(d) { return d.walls.some(w => w.floor === 1) ? bboxOf(d.walls) : null; }
const area = r => (r ? (r[2] - r[0]) * (r[3] - r[1]) : 0);
const r2 = x => Math.round(x * 100) / 100;

export function boq(d, mats) {
  const M = id => mats.find(m => m.id === id);
  const q = {}; const add = (id, v) => { if (v > 1e-9 && M(id)) q[id] = (q[id] || 0) + v; };
  let concrete = 0;
  // 墙体
  for (const w of d.walls) {
    const h = d.floors[w.floor].h, L = wlen(w);
    let net = L * h; for (const o of d.openings) if (o.wall === w.id) net -= o.w * o.h;
    net = Math.max(0, net); const m = M(w.material);
    add(w.material, net * m.perSqm * (1 + F.waste));
    if (/^chb/.test(w.material)) { add('cement', net * F.mortarCement); add('sand', net * F.mortarSand); }
    add('paint', net * 2);
    concrete += L * F.beam[0] * F.beam[1];
    if (w.floor === 0) concrete += L * F.tie[0] * F.tie[1];
  }
  // 柱与基础
  for (const f of [0, 1]) for (const _ of columnsOf(d, f)) {
    concrete += F.col * F.col * (d.floors[f].h + (f === 0 ? F.pad[2] + 0.9 : 0));
    if (f === 0) concrete += F.pad[0] * F.pad[1] * F.pad[2];
  }
  // 板
  const g = groundSlabOf(d);
  if (g) { const a0 = area(g.house) + area(g.terrace); concrete += a0 * F.slab0; add('gravel-g1', a0 * F.slab0); add(d.floor.material, a0); }
  const b1 = slab1Of(d);
  if (b1) { const a1 = area(b1) - area(stairHole(d)); concrete += a1 * F.slab1; add(d.floor.material, a1); }
  // 屋顶
  const bt = bboxOf(d.walls.filter(w => w.floor === topFloor(d)));
  if (bt) {
    if (d.roof.type === 'flat') { concrete += area(bt) * F.slab1; add('waterproof-roof', area(bt)); }
    else { const ra = (bt[2] - bt[0] + 2 * F.overhang) * (bt[3] - bt[1] + 2 * F.overhang) * F.pitch; add(d.roof.material, ra); add('roof-truss', ra); }
  }
  // 泳池
  let water = 0;
  if (d.pool) {
    const p = d.pool, s = p.w * p.d + 2 * (p.w + p.d) * p.depth;
    concrete += s * F.poolShell; add(p.material, s); add('waterproof-pool', s); water = p.w * p.d * p.depth;
  }
  // 院子：围墙、大门、车位与车棚
  const st = d.site;
  if (st && st.fence) { const gates = st.gates || []; add('fence-chb', 2 * (d.lot.w + d.lot.d) - gates.reduce((t, q) => t + q.w, 0)); for (const _ of gates) { add('gate-sliding', 1); add('gate-hardware', 1); } }
  if (st && st.parking) { const a = st.parking.w * st.parking.d; concrete += a * F.parking; add('gravel-g1', a * F.parking); if (st.parking.carport) add('carport', a); }
  // 门窗
  for (const o of d.openings) { if (o.type === 'door') add('door-wood', 1); else add('window-alum', (o.w * o.h) / F.win); }
  add('concrete', concrete); add('rebar', concrete * F.rebar);
  const order = ['concrete', 'rebar', 'gravel-g1', 'chb-4', 'chb-6', 'aac-100', 'cement', 'sand', 'roof-truss', 'gi-corrugated', 'longspan-05', 'clay-tile', 'concrete-tile', 'waterproof-roof', 'ceramic-tile', 'porcelain-tile', 'granite', 'laminate', 'pool-porcelain', 'pool-marble', 'pool-pebble', 'waterproof-pool', 'fence-chb', 'gate-sliding', 'gate-hardware', 'carport', 'window-alum', 'door-wood', 'paint'];
  const lines = Object.entries(q).map(([id, v]) => {
    const m = M(id), qty = r2(v);
    return { material: id, qty, unit: m.unit, unitPrice: m.price ?? null, cost: m.price == null ? null : r2(qty * m.price) };
  }).filter(l => l.qty > 0).sort((a, b) => (order.indexOf(a.material) + 1 || 99) - (order.indexOf(b.material) + 1 || 99));
  return { lines, total: r2(lines.reduce((s, l) => s + (l.cost || 0), 0)), poolWater: r2(water) };
}
