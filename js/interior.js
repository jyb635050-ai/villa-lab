// 室内陈设与院子摆设：只用方块/圆柱拼，低面数；同时给第一人称参观提供碰撞盒。
// 设计 JSON 里可选 furniture:[{t, f, x, z, r, w?}]：t 类型、f 楼层、x/z 中心、r 朝向（0/90/180/270，0＝正面朝南 +z）、w 宽度（柜子/橱柜可调）
import * as THREE from 'three';

const C = { wood: 0xb48a62, woodDark: 0x6e4f36, white: 0xf3f1ec, fabric: 0xd6cdbf, grey: 0x8d9299, blue: 0x4a6fa5, black: 0x1d1f22, green: 0x5f8f4a, green2: 0x4c7a3c, stone: 0x3a3c40, steel: 0xc7cbd0, terracotta: 0xb76e4b, cream: 0xf6efe2 };
// 每种家具：size [宽 x, 高 y, 深 z]（碰撞用），parts 返回 [x, y, z, sx, sy, sz, 颜色, 形状?]（局部坐标，y 为底面高度）
const T = {
  sofa: { size: [2.2, 0.85, 0.9], parts: () => [[0, 0, 0, 2.2, 0.42, 0.9, C.fabric], [0, 0.42, 0.08, 1.84, 0.12, 0.7, C.cream], [0, 0.42, -0.36, 2.2, 0.43, 0.18, C.fabric], [-1.01, 0.42, 0, 0.18, 0.22, 0.9, C.fabric], [1.01, 0.42, 0, 0.18, 0.22, 0.9, C.fabric]] },
  coffeeTable: { size: [1.1, 0.42, 0.6], parts: () => [[0, 0.37, 0, 1.1, 0.05, 0.6, C.wood], ...leg4(1.0, 0.5, 0.37, C.woodDark)] },
  tvConsole: { size: [1.8, 0.5, 0.45], parts: () => [[0, 0.05, 0, 1.8, 0.42, 0.45, C.white], [0, 0.85, -0.12, 1.45, 0.82, 0.05, C.black]] },
  rug: { size: [2.6, 0.01, 1.9], solid: false, parts: () => [[0, 0.002, 0, 2.6, 0.012, 1.9, 0xc8b79c]] },
  dining: { size: [1.9, 0.8, 1.9], parts: () => { const p = [[0, 0.72, 0, 1.8, 0.05, 0.9, C.wood], ...leg4(1.65, 0.75, 0.72, C.woodDark)]; for (const sz of [-1, 1]) for (const x of [-0.6, 0, 0.6]) p.push([x, 0.44, sz * 0.72, 0.44, 0.05, 0.44, C.cream], [x, 0.49, sz * 0.92, 0.44, 0.48, 0.05, C.cream], ...leg4(0.38, 0.38, 0.44, C.woodDark).map(q => [q[0] + x, q[1], q[2] + sz * 0.72, q[3], q[4], q[5], q[6]])); return p; } },
  counter: { size: [2, 0.9, 0.62], parts: w => [[0, 0, 0, w, 0.86, 0.6, C.white], [0, 0.86, 0, w, 0.04, 0.62, C.stone], [0, 1.45, -0.18, w, 0.7, 0.3, C.white], [w / 4, 0.9, 0.02, 0.5, 0.02, 0.36, C.steel]] },
  fridge: { size: [0.7, 1.8, 0.7], parts: () => [[0, 0, 0, 0.7, 1.8, 0.7, C.steel], [0.28, 0.9, 0.36, 0.03, 0.5, 0.02, C.black]] },
  bedDouble: { size: [1.6, 0.6, 2.05], parts: (w, o) => bed(1.6, o) },
  bedSingle: { size: [1.0, 0.6, 2.05], parts: (w, o) => bed(1.0, o) },
  nightstand: { size: [0.45, 0.5, 0.4], parts: () => [[0, 0, 0, 0.45, 0.48, 0.4, C.wood], [0, 0.48, 0, 0.14, 0.04, 0.14, C.cream], [0, 0.52, 0, 0.03, 0.2, 0.03, C.black], [0, 0.72, 0, 0.24, 0.16, 0.24, C.cream, 'cone']] },
  wardrobe: { size: [1.8, 2.1, 0.6], parts: w => { const p = [[0, 0, 0, w, 2.1, 0.6, C.white]]; for (let i = 1; i < Math.round(w / 0.6); i++) p.push([-w / 2 + i * w / Math.round(w / 0.6), 0.05, 0.301, 0.01, 2.0, 0.005, 0xd9d6cf]); return p; } },
  desk: { size: [1.2, 0.95, 1.1], parts: () => [[0, 0.72, -0.25, 1.2, 0.04, 0.6, C.wood], ...leg4(1.1, 0.5, 0.72, C.black).map(q => [q[0], q[1], q[2] - 0.25, q[3], q[4], q[5], q[6]]), [0, 0.76, -0.4, 0.55, 0.35, 0.03, C.black], [0, 0.45, 0.25, 0.48, 0.06, 0.46, C.grey], [0, 0.51, 0.47, 0.48, 0.5, 0.05, C.grey], [0, 0, 0.25, 0.06, 0.45, 0.06, C.black]] },
  bookshelf: { size: [1.0, 2.0, 0.35], parts: () => { const p = [[0, 0, 0, 1.0, 2.0, 0.04, C.wood]]; p[0][2] = -0.155; for (const x of [-0.48, 0.48]) p.push([x, 0, 0, 0.04, 2.0, 0.35, C.wood]); for (let i = 0; i < 5; i++) { p.push([0, i * 0.48, 0, 1.0, 0.03, 0.35, C.wood]); if (i < 4) [[-0.3, C.blue], [-0.1, C.terracotta], [0.15, C.green2], [0.33, C.cream]].forEach(([x, c], k) => p.push([x, i * 0.48 + 0.03, 0.02, 0.12, 0.26 + (k % 2) * 0.06, 0.24, c])); } return p; } },
  plant: { size: [0.45, 1.1, 0.45], parts: () => [[0, 0, 0, 0.36, 0.38, 0.36, C.terracotta, 'cyl'], [0, 0.38, 0, 0.7, 0.75, 0.7, C.green, 'ball']] },
  floorLamp: { size: [0.4, 1.6, 0.4], solid: false, parts: () => [[0, 0, 0, 0.3, 0.03, 0.3, C.black, 'cyl'], [0, 0.03, 0, 0.03, 1.3, 0.03, C.black], [0, 1.3, 0, 0.42, 0.3, 0.42, C.cream, 'cone']] },
  shoeCabinet: { size: [1.0, 1.0, 0.35], parts: () => [[0, 0, 0, 1.0, 1.0, 0.35, C.wood], [0, 1.0, 0, 0.3, 0.25, 0.3, C.green, 'ball']] },
  lounger: { size: [0.7, 0.5, 1.9], parts: () => [[0, 0.22, 0.15, 0.7, 0.1, 1.5, C.white], [0, 0.32, 0.15, 0.62, 0.06, 1.42, C.cream], [0, 0.22, -0.72, 0.7, 0.6, 0.1, C.white, 'tilt'], ...leg4(0.6, 1.7, 0.22, C.steel)] },
  umbrella: { size: [0.3, 2.5, 0.3], parts: () => [[0, 0, 0, 0.5, 0.08, 0.5, C.stone, 'cyl'], [0, 0.08, 0, 0.05, 2.25, 0.05, C.steel], [0, 2.0, 0, 2.6, 0.45, 2.6, C.cream, 'cone']] },
  tree: { size: [0.4, 4.5, 0.4], parts: () => [[0, 0, 0, 0.28, 2.4, 0.28, 0x7a5a3c, 'cyl'], [0, 1.9, 0, 2.6, 2.2, 2.6, C.green2, 'ball'], [0.5, 2.8, 0.3, 1.8, 1.6, 1.8, C.green, 'ball']] },
  bush: { size: [1.0, 0.8, 1.0], parts: () => [[0, 0, 0, 1.1, 0.8, 1.1, C.green, 'ball']] },
  bistro: { size: [1.6, 0.9, 0.8], parts: () => [[0, 0, 0, 0.7, 0.04, 0.7, C.black, 'cyl'], [0, 0.04, 0, 0.05, 0.68, 0.05, C.black], [0, 0.72, 0, 0.7, 0.03, 0.7, C.white, 'cyl'], ...[-0.6, 0.6].flatMap(x => [[x, 0.42, 0, 0.42, 0.04, 0.42, C.white], [x + Math.sign(x) * 0.2, 0.46, 0, 0.04, 0.45, 0.42, C.white], ...leg4(0.34, 0.34, 0.42, C.black).map(q => [q[0] + x, q[1], q[2], q[3], q[4], q[5], q[6]])])] },
  pavers: { size: [1, 0.02, 1], solid: false, parts: w => { const p = []; for (let z = -w / 2 + 0.3; z < w / 2; z += 0.75) p.push([0, 0.001, z, 0.9, 0.025, 0.5, 0xd8d2c4]); return p; } },
};
function leg4(sx, sz, h, c) { return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [a * sx / 2, 0, b * sz / 2, 0.04, h, 0.04, c]); }
function bed(w, o) {
  const hh = o && o.low ? 0.8 : 1.0;
  return [[0, 0, 0.02, w, 0.3, 2.0, C.woodDark], [0, 0.3, 0.02, w - 0.05, 0.22, 1.95, C.white], [0, 0.52, 0.3, w - 0.03, 0.05, 1.4, C.blue], [0, 0, -1.0, w + 0.1, hh, 0.08, C.woodDark],
    ...(w > 1.2 ? [-w / 4, w / 4] : [0]).map(x => [x, 0.52, -0.75, w > 1.2 ? 0.6 : 0.7, 0.12, 0.35, C.cream])];
}
const OUTDOOR = new Set(['tree', 'umbrella', 'lounger', 'bush']);
const SH = {}; // 共享几何体
function geo(kind) {
  if (SH[kind]) return SH[kind];
  if (kind === 'cyl') return (SH[kind] = new THREE.CylinderGeometry(0.5, 0.5, 1, 20));
  if (kind === 'cone') return (SH[kind] = new THREE.ConeGeometry(0.5, 1, 20, 1, true));
  if (kind === 'ball') return (SH[kind] = new THREE.SphereGeometry(0.5, 16, 12));
  return (SH[kind] = new THREE.BoxGeometry(1, 1, 1));
}
const footprint = (it, size) => {
  const r = ((it.r || 0) % 360 + 360) % 360, sx = it.w || size[0], sz = size[2], rot = r === 90 || r === 270;
  return { hx: (rot ? sz : sx) / 2, hz: (rot ? sx : sz) / 2 };
};

export function furnish(viewer, group, d) {
  const h0 = d.floors[0].h;
  for (const it of d.furniture || []) {
    const def = T[it.t]; if (!def) continue;
    const g = new THREE.Group(), w = it.w || def.size[0];
    for (const [x, y, z, sx, sy, sz, c, kind] of def.parts(w, it)) {
      const m = new THREE.Mesh(geo(kind === 'tilt' ? 'box' : kind || 'box'), viewer.plain(c, { r: c === C.steel ? 0.35 : 0.8, metal: c === C.steel ? 0.6 : 0, double: kind === 'cone' }));
      m.scale.set(sx, sy, sz); m.position.set(x, y + sy / 2, z);
      if (kind === 'tilt') { m.rotation.x = -0.5; m.position.y += 0.1; }
      m.castShadow = OUTDOOR.has(it.t); m.receiveShadow = true; m.userData.part = 'furniture';
      g.add(m);
    }
    g.position.set(it.x, (it.f ? h0 : (insideHouse(d, it) ? 0.1 : 0)), it.z); g.rotation.y = (it.r || 0) * Math.PI / 180;
    group.add(g);
  }
}
function insideHouse(d, it) { const ws = d.walls.filter(w => w.floor === 0); if (!ws.length) return false; const xs = ws.flatMap(w => [w.a[0], w.b[0]]), zs = ws.flatMap(w => [w.a[1], w.b[1]]); return it.x > Math.min(...xs) && it.x < Math.max(...xs) && it.z > Math.min(...zs) && it.z < Math.max(...zs) + 2.5; }
export function furnitureSolids(d) {
  const h0 = d.floors[0].h, out = [];
  for (const it of d.furniture || []) {
    const def = T[it.t]; if (!def || def.solid === false) continue;
    const { hx, hz } = footprint(it, def.size), base = it.f ? h0 : (insideHouse(d, it) ? 0.1 : 0);
    let h = def.size[1]; if (it.t === 'tree' || it.t === 'umbrella') { out.push({ x0: it.x - 0.2, x1: it.x + 0.2, z0: it.z - 0.2, z1: it.z + 0.2, y0: base, y1: base + 2.2 }); continue; }
    if (it.t === 'plant') h = 0.38;
    out.push({ x0: it.x - hx, x1: it.x + hx, z0: it.z - hz, z1: it.z + hz, y0: base, y1: base + h });
  }
  return out;
}
export const FURNITURE_TYPES = Object.keys(T);
