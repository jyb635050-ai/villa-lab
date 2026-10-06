import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';
import { F, wlen, bboxOf, columnsOf, topFloor, groundSlabOf, slab1Of, stairHole, rectMinus } from './boq.js';
import { furnish } from './interior.js';

const ease = t => 1 - Math.pow(1 - t, 3);
const STAGES = ['site', 'excavation', 'footing', 'column', 'slab', 'wall', 'roof', 'pool', 'finish'];
const SI = id => STAGES.indexOf(id);

function sky() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#8fbfe8'); gr.addColorStop(0.55, '#d9e9f5'); gr.addColorStop(1, '#f4f1ea');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 盒子：UV 按米铺（texM＝贴图一张代表几米）
function boxGeo(sx, sy, sz, m = 1) {
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / m, uv.getY(i) * dims[f][1] / m); }
  return g;
}
// 任意平面多边形（三角/四边），UV 按面内坐标按米铺
function faceGeo(pts, m = 1) {
  const P = pts.map(p => new THREE.Vector3(...p));
  const u = P[1].clone().sub(P[0]).normalize(), n = P[1].clone().sub(P[0]).cross(P[2].clone().sub(P[0])).normalize(), v = n.clone().cross(u).normalize();
  const pos = [], uvs = [], idx = [];
  P.forEach(p => { pos.push(p.x, p.y, p.z); const d = p.clone().sub(P[0]); uvs.push(d.dot(u) / m, d.dot(v) / m); });
  for (let i = 1; i < P.length - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// 栏杆：二层楼板外沿没被二层墙挡住的边 + 楼梯洞除上楼口以外的三边
export function railingsOf(d) {
  const b = slab1Of(d); if (!b) return [];
  const out = [], w1 = d.walls.filter(w => w.floor === 1), off = 0.1;
  const edges = [[b[0], b[1], b[2], b[1], 0, -1], [b[0], b[3], b[2], b[3], 0, 1], [b[0], b[1], b[0], b[3], -1, 0], [b[2], b[1], b[2], b[3], 1, 0]];
  for (const [x0, z0, x1, z1, ox, oz] of edges) {
    const xa = z0 === z1, line = xa ? z0 : x0, lo = xa ? x0 : z0, hi = xa ? x1 : z1;
    const cov = w1.filter(w => (xa ? w.a[1] === w.b[1] && w.a[1] === line : w.a[0] === w.b[0] && w.a[0] === line)).map(w => xa ? [Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0])] : [Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])]).sort((p, q) => p[0] - q[0]);
    let t = lo;
    const seg = (u, v) => { if (v - u > 0.3) out.push(xa ? [u, line + oz * off, v, line + oz * off] : [line + ox * off, u, line + ox * off, v]); };
    for (const [u, v] of cov) { seg(t, Math.min(u, hi)); t = Math.max(t, v); }
    seg(t, hi);
  }
  const h = stairHole(d);
  if (h) { const up = d.stairs.up === '-z'; out.push([h[0], h[1], h[0], h[3]], [h[2], h[1], h[2], h[3]]); out.push(up ? [h[0], h[3], h[2], h[3]] : [h[0], h[1], h[2], h[1]]); }
  return out;
}

export class Viewer {
  constructor() {
    const c = this.canvas = document.createElement('canvas'); c.dataset.testid = 'canvas';
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    const s = this.scene = new THREE.Scene(); s.background = sky(); s.fog = new THREE.Fog(0xdde8f0, 70, 230);
    const pm = new THREE.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.45; pm.dispose();
    s.add(new THREE.HemisphereLight(0xe8f2ff, 0x9a8a6a, 0.9));
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    s.add(sun, sun.target);
    this.persp = new THREE.PerspectiveCamera(38, 1, 0.1, 800); this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.cam = this.persp; this.view = '3d';
    const ct = this.controls = new OrbitControls(this.persp, c);
    ct.enableDamping = true; ct.dampingFactor = 0.09; ct.maxPolarAngle = Math.PI * 0.47; ct.minDistance = 4; ct.maxDistance = 160; ct.screenSpacePanning = true;
    ct.addEventListener('change', () => { this.dirty = true; });
    this.root = new THREE.Group(); s.add(this.root);
    this.ghost = new THREE.Group(); s.add(this.ghost);
    this.grid = null; this.cache = {}; this.tex = {}; this.anims = []; this.dirty = true; this.freeRect = () => null; this.lot = { w: 20, d: 30 };
    new ResizeObserver(() => this.resize()).observe(c);
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now(); let busy = false;
      if (this.onTick && this.onTick(Math.min(0.05, (now - (this.lastT || now)) / 1000))) busy = true; this.lastT = now;
      this.anims = this.anims.filter(a => { const k = Math.min(1, (now - a.t0) / a.dur); a.fn(ease(k)); busy = true; return k < 1; });
      if (this.controls.enabled && this.controls.update()) busy = true;
      if (busy || this.dirty) { this.dirty = false; r.render(s, this.cam); }
    };
    requestAnimationFrame(loop);
  }
  async init(materials) {
    this.M = Object.fromEntries(materials.map(m => [m.id, m]));
    const L = new THREE.TextureLoader(), an = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    await Promise.all(materials.filter(m => m.texture).map(async m => {
      const t = await L.loadAsync(m.texture.file); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = an;
      this.tex[m.id] = t; this.renderer.initTexture(t);
    }));
  }
  mat(id, opts = {}) {
    const k = id + JSON.stringify(opts); if (this.cache[k]) return this.cache[k];
    const m = this.M[id], metal = /gi-|longspan/.test(id);
    const gain = (m.texture && m.texture.gain) || 1;
    return (this.cache[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color(gain, gain, gain), map: this.tex[id], roughness: metal ? 0.45 : /tile|granite|porcelain|pool/.test(id) ? 0.55 : 0.9, metalness: metal ? 0.35 : 0, side: opts.double ? THREE.DoubleSide : THREE.FrontSide, emissive: opts.sel ? 0x2d7cff : 0x000000, emissiveIntensity: opts.sel ? 0.35 : 0, transparent: !!opts.fade, opacity: opts.fade ? 0.28 : 1 }));
  }
  plain(color, o = {}) { const k = '#' + color + JSON.stringify(o); return this.cache[k] || (this.cache[k] = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.9, metalness: o.metal || 0, transparent: o.op != null, opacity: o.op ?? 1, depthWrite: o.op == null || o.op > 0.6, side: o.double ? THREE.DoubleSide : THREE.FrontSide })); }
  texM(id) { return (this.M[id] && this.M[id].texture && this.M[id].texture.m) || 1; }

  // ───── 搭场景 ─────
  build(d, stage, o = {}) {
    const prev = this.stageShown; this.stageShown = stage; this.lot = d.lot; this.doors = new Map();
    this.root.traverse(x => { if (x.geometry) x.geometry.dispose(); });
    this.scene.remove(this.root); this.root = new THREE.Group(); this.scene.add(this.root);
    const groups = STAGES.map(() => { const g = new THREE.Group(); this.root.add(g); return g; });
    const at = id => stage >= SI(id), G = id => groups[SI(id)];
    const plan = !!o.plan, pf = o.floor ?? 0, h0 = d.floors[0].h, h1 = d.floors[1].h, y0 = f => (f ? h0 : 0);
    const W = d.lot.w, D = d.lot.d, cx = W / 2, cz = D / 2;
    const add = (g, geo, m, x, y, z, ud = {}) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; Object.assign(me.userData, ud); g.add(me); return me; };
    const concrete = this.plain(0xb8b6ae), dark = this.plain(0x6b5540);
    const hideF = f => plan && f > pf, fade = f => plan && f < pf;
    // 地面：外圈草地 + 地块（有泳池时挖洞）
    const see = (stage === SI('footing') || stage === SI('column')) && !plan;
    const shape = (rect, holes) => { const s = new THREE.Shape([[rect[0], -rect[1]], [rect[2], -rect[1]], [rect[2], -rect[3]], [rect[0], -rect[3]]].map(p => new THREE.Vector2(...p))); holes.forEach(h => s.holes.push(new THREE.Path([[h[0], -h[1]], [h[0], -h[3]], [h[2], -h[3]], [h[2], -h[1]]].map(p => new THREE.Vector2(...p))))); return s; };
    const flat = (s, m, y, ud) => { const me = new THREE.Mesh(new THREE.ShapeGeometry(s), m); me.rotation.x = -Math.PI / 2; me.position.y = y; me.receiveShadow = true; Object.assign(me.userData, ud); this.root.add(me); return me; };
    flat(shape([-60, -60, W + 60, D + 60], [[0, 0, W, D]]), this.plain(0x8fae76), -0.02, { noPick: see });
    const hole = d.pool && at('pool') ? [[d.pool.x, d.pool.z, d.pool.x + d.pool.w, d.pool.z + d.pool.d]] : [];
    if (!see) flat(shape([0, 0, W, D], hole), this.plain(0xc9cfae), -0.01, { part: 'lot' });
    else { // 基础、柱阶段：整块地挖开看地下
      const soil = this.plain(0x8a6a48, { double: true }), wall = this.plain(0x6f5236, { double: true });
      flat(shape([0, 0, W, D], []), soil, -1.52, { noPick: true });
      for (const [sx, sz, x, z] of [[W, 0.02, W / 2, 0], [W, 0.02, W / 2, D], [0.02, D, 0, D / 2], [0.02, D, W, D / 2]]) add(this.root, boxGeo(sx, 1.5, sz), wall, x, -0.76, z, { noPick: true }).castShadow = false;
    }
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[0, 0], [W, 0], [W, D], [0, D]].map(p => new THREE.Vector3(p[0], 0.015, p[1]))), new THREE.LineBasicMaterial({ color: 0xffffff })); this.root.add(edge);
    const b0 = bboxOf(d.walls.filter(w => w.floor === 0)), b1 = slab1Of(d);
    // 放线：桩、退界带
    if (stage <= SI('excavation') && !plan) {
      for (const [x, z] of [[0, 0], [W, 0], [W, D], [0, D]]) add(G('site'), boxGeo(0.12, 0.9, 0.12), this.plain(0xf28c28), x, 0.45, z);
      add(G('site'), boxGeo(W, 0.01, 4.5), this.plain(0xff9f43, { op: 0.45 }), cx, 0.02, 2.25, { part: 'setback' });
      for (const x of [1, W - 1]) add(G('site'), boxGeo(2, 0.01, D - 4.5), this.plain(0xffd166, { op: 0.35 }), x, 0.02, 4.5 + (D - 4.5) / 2, { part: 'setback' });
      add(G('site'), boxGeo(W - 4, 0.01, 2), this.plain(0xffd166, { op: 0.35 }), cx, 0.02, D - 1, { part: 'setback' });
      if (b0) { const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[b0[0], b0[1]], [b0[2], b0[1]], [b0[2], b0[3]], [b0[0], b0[3]]].map(p => new THREE.Vector3(p[0], 0.3, p[1]))), new THREE.LineBasicMaterial({ color: 0xff3b30 })); G('site').add(l); }
    }
    const cols0 = columnsOf(d, 0), cols1 = columnsOf(d, 1), walls0 = d.walls.filter(w => w.floor === 0);
    const along = (w, t) => [w.a[0] + (w.b[0] - w.a[0]) * t / wlen(w), w.a[1] + (w.b[1] - w.a[1]) * t / wlen(w)];
    const alongBox = (g, w, t0, t1, y, hgt, th, m, texM, ud) => {
      const L = t1 - t0; if (L <= 0.001 || hgt <= 0.001) return;
      const xAx = Math.abs(w.b[0] - w.a[0]) > 0; const [x, z] = along(w, (t0 + t1) / 2);
      return add(g, boxGeo(xAx ? L : th, hgt, xAx ? th : L, texM), m, x, y + hgt / 2, z, ud);
    };
    if (stage === SI('excavation') && !plan) {
      for (const p of cols0) add(G('excavation'), boxGeo(1.4, 0.04, 1.4), dark, p[0], 0.0, p[1]);
      for (const w of walls0) alongBox(G('excavation'), w, 0, wlen(w), -0.01, 0.03, 0.5, dark, 1);
    }
    if (at('footing') && !plan) {
      for (const p of cols0) add(G('footing'), boxGeo(F.pad[0], F.pad[2], F.pad[1]), this.plain(0xd9d6cc), p[0], -1.5 + F.pad[2] / 2, p[1], { part: 'footing' });
    }
    if (at('column') && !plan) for (const w of walls0) alongBox(G('column'), w, 0, wlen(w), -F.tie[1], F.tie[1], F.tie[0], this.plain(0x9d9b93), 1, { part: 'tie' });
    const colMesh = (g, p, ya, yb, f) => { if (hideF(f)) return; add(g, boxGeo(F.col, yb - ya, F.col), fade(f) ? this.plain(0x9f9d96, { op: 0.3 }) : this.plain(0xa9a79f), p[0], (ya + yb) / 2, p[1], { part: 'column' }); };
    if (at('column')) for (const p of cols0) colMesh(G('column'), p, plan ? 0 : -1.2, h0 - F.beam[1], 0);
    if (at('slab')) {
      for (const p of cols1) colMesh(G('slab'), p, h0, h0 + h1 - F.beam[1], 1);
      for (const w of d.walls) if (!hideF(w.floor) && !(plan && w.floor === pf)) alongBox(G('slab'), w, 0, wlen(w), y0(w.floor) + d.floors[w.floor].h - F.beam[1], F.beam[1], F.beam[0], this.plain(0xa9a79f), 1, { part: 'beam' });
      const gs = groundSlabOf(d);
      if (gs) for (const r of [gs.house, gs.terrace].filter(Boolean)) {
        add(G('slab'), boxGeo(r[2] - r[0], F.slab0, r[3] - r[1]), concrete, (r[0] + r[2]) / 2, F.slab0 / 2, (r[1] + r[3]) / 2, { part: 'slab0' });
        if (at('finish')) add(G('finish'), boxGeo(r[2] - r[0], 0.01, r[3] - r[1], this.texM(d.floor.material)), this.mat(d.floor.material), (r[0] + r[2]) / 2, F.slab0 + 0.005, (r[1] + r[3]) / 2, { part: 'floor' });
      }
      if (b1 && !(plan && pf === 0)) {
        const hole = stairHole(d), half = F.col / 2;
        for (const r of rectMinus([b1[0] - half, b1[1] - half, b1[2] + half, b1[3] + half], hole)) add(G('slab'), boxGeo(r[2] - r[0], F.slab1, r[3] - r[1]), fade(1) ? this.plain(0xb8b6ae, { op: 0.3 }) : concrete, (r[0] + r[2]) / 2, h0 - F.slab1 / 2, (r[1] + r[3]) / 2, { part: 'slab1' });
        if (at('finish') && !plan) for (const r of rectMinus(b1, hole)) {
          add(G('finish'), boxGeo(r[2] - r[0], 0.01, r[3] - r[1], this.texM(d.floor.material)), this.mat(d.floor.material), (r[0] + r[2]) / 2, h0 + 0.005, (r[1] + r[3]) / 2, { part: 'floor' });
          add(G('finish'), boxGeo(r[2] - r[0], 0.01, r[3] - r[1]), this.plain(0xf6f4ef), (r[0] + r[2]) / 2, h0 - F.slab1 - 0.006, (r[1] + r[3]) / 2, { part: 'ceiling' }).castShadow = false;
        }
      }
      if (d.stairs && !hideF(0)) { const s = d.stairs, n = 16, up = s.up === '-z'; for (let i = 0; i < n; i++) add(G('slab'), boxGeo(s.w, (i + 1) * h0 / n, s.d / n), this.plain(0xd9d3c7), s.x + s.w / 2, (i + 1) * h0 / n / 2, up ? s.z + s.d - (i + 0.5) * s.d / n : s.z + (i + 0.5) * s.d / n, { part: 'stairs' }); }
    }
    // 墙（留洞）+ 装修阶段的门窗
    if (at('wall')) for (const w of d.walls) {
      if (hideF(w.floor)) continue;
      const m = this.M[w.material] || {}, th = m.thick || 0.15, tm = this.texM(w.material), sel = o.selected === w.id;
      const mat = fade(w.floor) ? this.mat(w.material, { fade: 1 }) : this.mat(w.material, sel ? { sel: 1 } : {});
      const base = y0(w.floor) + (w.floor ? 0 : F.slab0), top = y0(w.floor) + d.floors[w.floor].h - F.beam[1], L = wlen(w), ud = { wall: w.id, part: 'wall' };
      const ops = d.openings.filter(x => x.wall === w.id).sort((a, b) => a.at - b.at); let t = 0;
      // 装修阶段：室内一侧刷白（外墙只刷朝里的一面，内隔墙两面都刷；不成围合的墙不刷）
      const xAx = Math.abs(w.b[0] - w.a[0]) > 0, fb = bboxOf(d.walls.filter(x => x.floor === w.floor));
      const nz = xAx ? [0, 1] : [1, 0]; let sides = [];
      if (fb && at('finish') && !plan) { const c = xAx ? w.a[1] : w.a[0], lo = xAx ? fb[1] : fb[0], hi = xAx ? fb[3] : fb[2]; sides = c === lo ? [1] : c === hi ? [-1] : [1, -1]; }
      const paint = this.plain(0xf1eee7, { r: 0.95 });
      const piece = (t0, t1, y, hgt) => {
        alongBox(G('wall'), w, t0, t1, y, hgt, th, mat, tm, ud);
        for (const sg of sides) { const me = alongBox(G('finish'), w, t0, t1, y, hgt, 0.012, paint, 1, ud); if (me) { me.position.x += nz[0] * sg * (th / 2 + 0.007); me.position.z += nz[1] * sg * (th / 2 + 0.007); me.castShadow = false; } }
      };
      for (const op of ops) {
        const s0 = Math.max(0, op.at - op.w / 2), s1 = Math.min(L, op.at + op.w / 2), ob = y0(w.floor) + op.sill, ot = Math.min(top, ob + op.h);
        piece(t, s0, base, top - base);
        piece(s0, s1, base, ob - base);
        piece(s0, s1, ot, top - ot);
        if (at('finish') && !plan) {
          if (op.type === 'window') {
            const gl = alongBox(G('finish'), w, s0, s1, ob, ot - ob, 0.03, this.plain(0x9fd0f0, { op: 0.45, r: 0.05, metal: 0.2 }), 1, ud); if (gl) gl.castShadow = false;
            alongBox(G('finish'), w, s0, s1, ob - 0.04, 0.05, th + 0.06, this.plain(0x55595e, { r: 0.4, metal: 0.5 }), 1, ud);
          } else this.door(G('finish'), w, op, s0, s1, ob, ot, th, fb, o.doorOpen && o.doorOpen[op.id]);
        }
        t = s1;
      }
      piece(t, L, base, top - base);
    }
    // 屋顶
    const tf = topFloor(d), bt = bboxOf(d.walls.filter(w => w.floor === tf));
    if (bt && at('roof') && !plan) {
      const ry = y0(tf) + d.floors[tf].h, ov = F.overhang, x0 = bt[0] - ov, x1 = bt[2] + ov, z0 = bt[1] - ov, z1 = bt[3] + ov, rm = this.mat(d.roof.material, { double: 1 }), tm = this.texM(d.roof.material), ud = { part: 'roof' };
      const face = pts => { const me = new THREE.Mesh(faceGeo(pts, tm), rm); me.castShadow = me.receiveShadow = true; Object.assign(me.userData, ud); G('roof').add(me); };
      if (d.roof.type === 'flat') {
        add(G('roof'), boxGeo(bt[2] - bt[0] + F.col, F.slab1, bt[3] - bt[1] + F.col), concrete, (bt[0] + bt[2]) / 2, ry - F.slab1 / 2, (bt[1] + bt[3]) / 2, ud);
        add(G('roof'), boxGeo(bt[2] - bt[0] + F.col, 0.02, bt[3] - bt[1] + F.col), this.plain(0xd8dde2), (bt[0] + bt[2]) / 2, ry + 0.01, (bt[1] + bt[3]) / 2, ud);
        const pw = 0.15, ph = 0.8, X = [bt[0] - F.col / 2, bt[2] + F.col / 2], Z = [bt[1] - F.col / 2, bt[3] + F.col / 2];
        add(G('roof'), boxGeo(X[1] - X[0], ph, pw), concrete, cx0(X), ry + ph / 2, Z[0], ud); add(G('roof'), boxGeo(X[1] - X[0], ph, pw), concrete, cx0(X), ry + ph / 2, Z[1], ud);
        add(G('roof'), boxGeo(pw, ph, Z[1] - Z[0]), concrete, X[0], ry + ph / 2, cx0(Z), ud); add(G('roof'), boxGeo(pw, ph, Z[1] - Z[0]), concrete, X[1], ry + ph / 2, cx0(Z), ud);
      } else {
        const alongX = x1 - x0 >= z1 - z0, span = alongX ? z1 - z0 : x1 - x0, H = span / 2 * Math.tan(25 * Math.PI / 180);
        if (d.roof.type === 'gable') {
          if (alongX) { const zm = (z0 + z1) / 2; face([[x0, ry, z1], [x1, ry, z1], [x1, ry + H, zm], [x0, ry + H, zm]]); face([[x1, ry, z0], [x0, ry, z0], [x0, ry + H, zm], [x1, ry + H, zm]]); }
          else { const xm = (x0 + x1) / 2; face([[x1, ry, z1], [x1, ry, z0], [xm, ry + H, z0], [xm, ry + H, z1]]); face([[x0, ry, z0], [x0, ry, z1], [xm, ry + H, z1], [xm, ry + H, z0]]); }
          const gm = this.mat(d.walls.find(w => w.floor === tf).material, { double: 1 }), gt = this.texM(d.walls.find(w => w.floor === tf).material);
          const tri = pts => { const me = new THREE.Mesh(faceGeo(pts, gt), gm); me.castShadow = true; G('roof').add(me); };
          if (alongX) { const zm = (bt[1] + bt[3]) / 2, h2 = (bt[3] - bt[1]) / 2 * Math.tan(25 * Math.PI / 180); for (const x of [bt[0], bt[2]]) tri([[x, ry, bt[3]], [x, ry, bt[1]], [x, ry + h2, zm]]); }
          else { const xm = (bt[0] + bt[2]) / 2, h2 = (bt[2] - bt[0]) / 2 * Math.tan(25 * Math.PI / 180); for (const z of [bt[1], bt[3]]) tri([[bt[0], ry, z], [bt[2], ry, z], [xm, ry + h2, z]]); }
        } else {
          const e = span / 2;
          if (alongX) { const zm = (z0 + z1) / 2, ra = [x0 + e, ry + H, zm], rb = [x1 - e, ry + H, zm]; face([[x0, ry, z1], [x1, ry, z1], rb, ra]); face([[x1, ry, z0], [x0, ry, z0], ra, rb]); face([[x1, ry, z1], [x1, ry, z0], rb]); face([[x0, ry, z0], [x0, ry, z1], ra]); }
          else { const xm = (x0 + x1) / 2, ra = [xm, ry + H, z0 + e], rb = [xm, ry + H, z1 - e]; face([[x1, ry, z1], [x1, ry, z0], ra, rb]); face([[x0, ry, z0], [x0, ry, z1], rb, ra]); face([[x0, ry, z1], [x1, ry, z1], rb]); face([[x1, ry, z0], [x0, ry, z0], ra]); }
        }
        add(G('roof'), boxGeo(x1 - x0, 0.2, 0.04), this.plain(0xeeeeea), (x0 + x1) / 2, ry - 0.1, z1, ud); add(G('roof'), boxGeo(x1 - x0, 0.2, 0.04), this.plain(0xeeeeea), (x0 + x1) / 2, ry - 0.1, z0, ud);
        add(G('roof'), boxGeo(0.04, 0.2, z1 - z0), this.plain(0xeeeeea), x0, ry - 0.1, (z0 + z1) / 2, ud); add(G('roof'), boxGeo(0.04, 0.2, z1 - z0), this.plain(0xeeeeea), x1, ry - 0.1, (z0 + z1) / 2, ud);
      }
    }
    // 装修：顶层天花、二层露台和楼梯洞栏杆、家具与院子摆设
    if (at('finish') && !plan) {
      if (bt && d.roof.type !== 'flat') { const ry = y0(tf) + d.floors[tf].h; add(G('finish'), boxGeo(bt[2] - bt[0], 0.02, bt[3] - bt[1]), this.plain(0xf6f4ef), (bt[0] + bt[2]) / 2, ry + 0.01, (bt[1] + bt[3]) / 2, { part: 'ceiling' }).castShadow = false; }
      for (const [x0, z0, x1, z1] of railingsOf(d)) {
        const L = Math.hypot(x1 - x0, z1 - z0), xa = z0 === z1, cxr = (x0 + x1) / 2, czr = (z0 + z1) / 2;
        const gl = add(G('finish'), boxGeo(xa ? L : 0.03, 0.95, xa ? 0.03 : L), this.plain(0xbfe0f2, { op: 0.35, r: 0.05 }), cxr, h0 + 0.5, czr, { part: 'railing' }); gl.castShadow = false;
        add(G('finish'), boxGeo(xa ? L : 0.06, 0.05, xa ? 0.06 : L), this.plain(0x55595e, { r: 0.4, metal: 0.5 }), cxr, h0 + 1.0, czr, { part: 'railing' });
      }
      furnish(this, G('finish'), d);
    }
    // 泳池
    if (d.pool && (at('pool') || plan)) {
      const p = d.pool, pm = this.mat(p.material), tm = this.texM(p.material), g = G('pool'), dep = p.depth;
      if (!plan) {
        add(g, boxGeo(p.w, 0.05, p.d, tm), pm, p.x + p.w / 2, -dep, p.z + p.d / 2, { part: 'pool' });
        add(g, boxGeo(p.w, dep, 0.05, tm), pm, p.x + p.w / 2, -dep / 2, p.z, { part: 'pool' }); add(g, boxGeo(p.w, dep, 0.05, tm), pm, p.x + p.w / 2, -dep / 2, p.z + p.d, { part: 'pool' });
        add(g, boxGeo(0.05, dep, p.d, tm), pm, p.x, -dep / 2, p.z + p.d / 2, { part: 'pool' }); add(g, boxGeo(0.05, dep, p.d, tm), pm, p.x + p.w, -dep / 2, p.z + p.d / 2, { part: 'pool' });
        const cp = this.plain(0xeae4d6, { r: 0.8 }), cw = 0.35;
        add(g, boxGeo(p.w + 2 * cw, 0.06, cw), cp, p.x + p.w / 2, 0.03, p.z - cw / 2); add(g, boxGeo(p.w + 2 * cw, 0.06, cw), cp, p.x + p.w / 2, 0.03, p.z + p.d + cw / 2);
        add(g, boxGeo(cw, 0.06, p.d), cp, p.x - cw / 2, 0.03, p.z + p.d / 2); add(g, boxGeo(cw, 0.06, p.d), cp, p.x + p.w + cw / 2, 0.03, p.z + p.d / 2);
      }
      const wt = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), plan ? this.plain(0x5ab4e5, { op: 0.8 }) : new THREE.MeshStandardMaterial({ color: 0x3aa6dc, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1 }));
      wt.rotation.x = -Math.PI / 2; wt.position.set(p.x + p.w / 2, plan ? 0.02 : -0.25, p.z + p.d / 2); wt.userData.part = 'pool'; g.add(wt);
    }
    // 平面图网格
    if (plan) {
      const gm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }), pts = [];
      for (let x = 0; x <= W + 1e-6; x += 1) pts.push(x, 0.03, 0, x, 0.03, D); for (let z = 0; z <= D + 1e-6; z += 1) pts.push(0, 0.03, z, W, 0.03, z);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); this.root.add(new THREE.LineSegments(lg, gm));
    }
    // 阴影范围跟着地块
    const R = Math.max(W, D) * 0.75 + 8; Object.assign(this.sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 200 }); this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.position.set(cx + 28, 42, cz + 12); this.sun.target.position.set(cx, 0, cz);
    // 新出现的阶段「长」出来
    if (o.animate && prev != null && stage > prev && !plan) for (let i = prev + 1; i <= stage; i++) { const g = groups[i]; g.scale.y = 0.02; this.anims.push({ t0: performance.now(), dur: 420, fn: k => { g.scale.y = 0.02 + 0.98 * k; } }); }
    this.dirty = true;
    function cx0(a) { return (a[0] + a[1]) / 2; }
  }
  // 门扇：普通门绕门轴转向室内，宽于 1.5 m 的是推拉玻璃门
  door(g, w, op, s0, s1, ob, ot, th, fb, open0) {
    const L = wlen(w), ua = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], slide = op.w > 1.5;
    const hinge = [w.a[0] + ua[0] * (s0 + 0.03), w.a[1] + ua[1] * (s0 + 0.03)], L2 = s1 - s0 - 0.06, H2 = ot - ob;
    const pivot = new THREE.Group(); pivot.position.set(hinge[0], ob, hinge[1]); const a = Math.atan2(-ua[1], ua[0]); pivot.rotation.y = a;
    const lz = [Math.sin(a), Math.cos(a)];
    let n = lz; if (fb) { const c = [(fb[0] + fb[2]) / 2, (fb[1] + fb[3]) / 2], mid = [hinge[0] + ua[0] * L2 / 2, hinge[1] + ua[1] * L2 / 2]; const v = [c[0] - mid[0], c[1] - mid[1]]; if (v[0] * lz[0] + v[1] * lz[1] < 0) n = [-lz[0], -lz[1]]; }
    const sg = Math.sign(n[0] * lz[0] + n[1] * lz[1]) || 1, swing = new THREE.Group(); pivot.add(swing);
    const mesh = new THREE.Mesh(boxGeo(L2, H2, slide ? 0.04 : 0.05), slide ? this.plain(0x9fd0f0, { op: 0.45, r: 0.05 }) : this.plain(0x8a5a36, { r: 0.6 }));
    mesh.position.set(L2 / 2, H2 / 2, slide ? sg * (th / 2 + 0.03) : 0); mesh.castShadow = !slide; mesh.receiveShadow = true; mesh.userData = { door: op.id, wall: w.id, part: 'door' };
    if (!slide) { const knob = new THREE.Mesh(boxGeo(0.04, 0.04, 0.14), this.plain(0xd0d3d6, { r: 0.3, metal: 0.8 })); knob.position.set(L2 - 0.08, 1.0 - H2 / 2, 0); mesh.add(knob); }
    swing.add(mesh); g.add(pivot);
    const rec = { id: op.id, swing, mesh, slide, sg, L2, open: 0, wall: w.id, op }; this.doors.set(op.id, rec); this.setDoor(op.id, open0 || 0);
  }
  setDoor(id, v) {
    const r = this.doors.get(id); if (!r) return; r.open = v;
    if (r.slide) r.mesh.position.x = r.L2 / 2 - v * r.L2 * 0.92; else r.swing.rotation.y = -r.sg * Math.PI / 2 * v * 0.95;
    this.dirty = true;
  }
  // 画图时的预览
  setGhost(gh) {
    this.ghost.traverse(x => { if (x.geometry) x.geometry.dispose(); }); this.ghost.clear();
    if (gh) {
      const m = this.plain(0x2d7cff, { op: 0.5 });
      if (gh.type === 'wall') { const [a, b] = [gh.a, gh.b], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 0.01) { const xA = a[1] === b[1]; const me = new THREE.Mesh(new THREE.BoxGeometry(xA ? L : 0.2, 0.3, xA ? 0.2 : L), m); me.position.set((a[0] + b[0]) / 2, gh.y + 0.2, (a[1] + b[1]) / 2); this.ghost.add(me); } }
      if (gh.type === 'rect') { const me = new THREE.Mesh(new THREE.BoxGeometry(gh.w, 0.06, gh.d), m); me.position.set(gh.x + gh.w / 2, 0.05, gh.z + gh.d / 2); this.ghost.add(me); }
      if (gh.type === 'dot') { const me = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 20), this.plain(0x2d7cff)); me.position.set(gh.x, gh.y + 0.05, gh.z); this.ghost.add(me); }
    }
    this.dirty = true;
  }
  // ───── 相机 ─────
  size() { const r = this.canvas.getBoundingClientRect(); return { W: Math.max(1, r.width), H: Math.max(1, r.height), r }; }
  free() { const { W, H } = this.size(); const f = this.freeRect(); return f && f.w > 80 && f.h > 80 ? f : { x: 0, y: 0, w: W, h: H }; }
  resize() {
    const { W, H } = this.size(); this.renderer.setSize(W, H, false); this.persp.aspect = W / H;
    if (this.cam !== this.persp && this.cam.isPerspectiveCamera) { this.cam.aspect = W / H; this.cam.updateProjectionMatrix(); }
    this.applyOffset(); if (this.view === 'plan') this.fitPlan(); this.dirty = true;
  }
  applyOffset() {
    const { W, H } = this.size(), f = this.free(), dx = W / 2 - (f.x + f.w / 2), dy = H / 2 - (f.y + f.h / 2);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) this.persp.clearViewOffset(); else this.persp.setViewOffset(W, H, dx, dy, W, H);
    this.persp.updateProjectionMatrix();
  }
  fitPlan() {
    const { W, H } = this.size(), f = this.free(), L = this.lot, u = Math.max((L.w + 2) / f.w, (L.d + 2) / f.h), fx = f.x + f.w / 2, fy = f.y + f.h / 2;
    Object.assign(this.ortho, { left: -fx * u, right: (W - fx) * u, top: fy * u, bottom: -(H - fy) * u });
    this.ortho.position.set(L.w / 2, 120, L.d / 2); this.ortho.up.set(0, 0, -1); this.ortho.lookAt(L.w / 2, 0, L.d / 2); this.ortho.updateProjectionMatrix(); this.dirty = true;
  }
  home3d(animate = true, focus = null) {
    const { W, H } = this.size(), f = this.free(), L = this.lot, R = focus ? 0.5 * Math.hypot(focus[2] - focus[0], focus[3] - focus[1]) + 6 : 0.5 * Math.hypot(L.w, L.d) + 2, tn = Math.tan(this.persp.fov * Math.PI / 360);
    const dist = R / (tn * Math.min(f.h / H, (W / H) * f.w / W)) * 0.84, dir = new THREE.Vector3(1, 0.85, 1).normalize();
    const target = focus ? new THREE.Vector3((focus[0] + focus[2]) / 2, 2.5, (focus[1] + focus[3]) / 2) : new THREE.Vector3(L.w / 2, 1.5, L.d / 2), pos = target.clone().addScaledVector(dir, dist);
    this.applyOffset();
    if (!animate) { this.persp.position.copy(pos); this.controls.target.copy(target); this.controls.update(); this.dirty = true; return; }
    const p0 = this.persp.position.clone(), t0 = this.controls.target.clone();
    this.anims.push({ t0: performance.now(), dur: 450, fn: k => { this.persp.position.lerpVectors(p0, pos, k); this.controls.target.lerpVectors(t0, target, k); this.controls.update(); } });
  }
  setView(v, animate = true) {
    const was = this.view; this.view = v; this.cam = v === 'plan' ? this.ortho : this.persp; this.controls.enabled = v === '3d';
    if (v === 'plan') this.fitPlan(); else this.home3d(animate && was === '3d'); this.dirty = true;
  }
  // ───── 坐标换算与拾取 ─────
  project(x, y, z) { const { r } = this.size(); const v = new THREE.Vector3(x, y, z).project(this.cam); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }
  ray(cx, cy) { const { r } = this.size(); const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.cam); return rc; }
  ground(cx, cy, y = 0) { const p = new THREE.Vector3(); return this.ray(cx, cy).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null; }
  pick(cx, cy, filter = () => true) {
    const hits = this.ray(cx, cy).intersectObjects(this.root.children, true);
    return hits.find(h => h.object.isMesh && !h.object.userData.noPick && h.object.visible && filter(h.object)) || null;
  }
}
