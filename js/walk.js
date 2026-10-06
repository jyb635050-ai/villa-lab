// 第一人称参观：WASD 走、空格跳、F 开门、鼠标看（点画面锁定鼠标）、Shift 跑、Esc 退出锁定。
// 碰撞用轴对齐盒（像《我的世界》）：每帧按 x、z、y 三个方向分别移动、撞到就退回；矮于 0.4 m 的台阶自动迈上去。
import * as THREE from 'three';
import { F, wlen, bboxOf, columnsOf, topFloor, groundSlabOf, slab1Of, stairHole, rectMinus } from './boq.js';
import { furnitureSolids } from './interior.js';
import { railingsOf } from './scene.js';

const R = 0.28, HEIGHT = 1.75, EYE = 1.62, STEP = 0.4, G = 22, JUMP = 6.6, WALK = 3.6, RUN = 6.2, REACH = 2.6;

// ───── 设计 → 碰撞盒 ─────
export function solidsOf(d) {
  const S = [], box = (x0, x1, y0, y1, z0, z1, tag) => { if (x1 - x0 > 1e-4 && z1 - z0 > 1e-4 && y1 - y0 > 1e-4) S.push({ x0, x1, y0, y1, z0, z1, ...tag }); };
  const W = d.lot.w, D = d.lot.d, h0 = d.floors[0].h, y0 = f => (f ? h0 : 0);
  // 地面（泳池处挖空）＋池底
  const lot = [0, 0, W, D], p = d.pool;
  for (const r of rectMinus(lot, p ? [p.x, p.z, p.x + p.w, p.z + p.d] : null)) box(r[0], r[2], -3, 0, r[1], r[3]);
  if (p) box(p.x, p.x + p.w, -3, -p.depth, p.z, p.z + p.d);
  // 地界：看不见的墙（有围墙时，北边多一条街可以走：从街上推开大门进院子）
  const st = d.site || {}, street = st.fence ? 7 : 0;
  if (street) box(-3, W + 3, -3, 0, -street, 0);
  box(-4, street ? -3 : 0, -3, 8, -street - 1, D + 1); box(street ? W + 3 : W, W + 4, -3, 8, -street - 1, D + 1); box(-4, W + 4, -3, 8, -street - 1, -street); box(-4, W + 4, -3, 8, D, D + 1);
  // 围墙（大门处是门：关着是实心）、车、车棚柱
  if (st.fence) {
    const gates = st.gates || [];
    for (const side of ['n', 's', 'w', 'e']) {
      const len = side === 'n' || side === 's' ? W : D, xa = side === 'n' || side === 's', line = side === 'n' ? 0.1 : side === 's' ? D - 0.1 : side === 'w' ? 0.1 : W - 0.1;
      const gs = gates.filter(q => q.side === side).map(q => [q.at - q.w / 2, q.at + q.w / 2, q.id]).sort((a, b) => a[0] - b[0]);
      const put = (a, b, tag, h = 2.0) => xa ? box(a, b, 0, h, line - 0.2, line + 0.2, tag) : box(line - 0.2, line + 0.2, 0, h, a, b, tag);
      let t = 0; for (const [a, b, id] of gs) { put(t, a); put(a - 0.2, a + 0.2, undefined, 2.2); put(b - 0.2, b + 0.2, undefined, 2.2); put(a + 0.2, b - 0.2, { door: id }, 1.8); t = b; } put(t, len);
    }
  }
  if (st.parking) {
    const q = st.parking, n = Math.max(1, Math.round(q.w / 3));
    if (q.carport) for (const [x, z] of [[q.x + 0.1, q.z + 0.1], [q.x + q.w - 0.1, q.z + 0.1], [q.x + 0.1, q.z + q.d - 0.1], [q.x + q.w - 0.1, q.z + q.d - 0.1]]) box(x - 0.08, x + 0.08, 0, 2.6, z - 0.08, z + 0.08);
    if (q.car) { const cx = q.x + (q.car - 0.5) * q.w / n, cz = q.z + q.d / 2 - 0.1; box(cx - 0.92, cx + 0.92, 0, 1.25, cz - 2.18, cz + 2.18); }
  }
  // 一层地坪、二层楼板（楼梯洞挖空）、楼梯
  const gs = groundSlabOf(d); if (gs) for (const r of [gs.house, gs.terrace].filter(Boolean)) box(r[0], r[2], 0, F.slab0, r[1], r[3]);
  const b1 = slab1Of(d), half = F.col / 2;
  if (b1) for (const r of rectMinus([b1[0] - half, b1[1] - half, b1[2] + half, b1[3] + half], stairHole(d))) box(r[0], r[2], h0 - F.slab1, h0, r[1], r[3]);
  if (d.stairs) { const s = d.stairs, n = 16, up = s.up === '-z'; for (let i = 0; i < n; i++) { const za = up ? s.z + s.d - (i + 1) * s.d / n : s.z + i * s.d / n; box(s.x, s.x + s.w, 0, (i + 1) * h0 / n, za, za + s.d / n, { stair: 1 }); } }
  // 柱、梁、墙（门洞：门关着时是实心，带 door 标记）
  for (const f of [0, 1]) for (const c of columnsOf(d, f)) box(c[0] - half, c[0] + half, y0(f), y0(f) + d.floors[f].h, c[1] - half, c[1] + half);
  for (const w of d.walls) {
    const L = wlen(w), xa = Math.abs(w.b[0] - w.a[0]) > 0, th = Math.max(0.12, 0.15), h = d.floors[w.floor].h, base = y0(w.floor), top = base + h;
    const seg = (t0, t1, ya, yb, tag) => { if (t1 - t0 < 1e-4) return; const a = [w.a[0] + (w.b[0] - w.a[0]) * t0 / L, w.a[1] + (w.b[1] - w.a[1]) * t0 / L], b = [w.a[0] + (w.b[0] - w.a[0]) * t1 / L, w.a[1] + (w.b[1] - w.a[1]) * t1 / L];
      if (xa) box(Math.min(a[0], b[0]), Math.max(a[0], b[0]), ya, yb, w.a[1] - th / 2, w.a[1] + th / 2, tag); else box(w.a[0] - th / 2, w.a[0] + th / 2, ya, yb, Math.min(a[1], b[1]), Math.max(a[1], b[1]), tag); };
    let t = 0;
    for (const o of d.openings.filter(x => x.wall === w.id).sort((a, b) => a.at - b.at)) {
      const s0 = Math.max(0, o.at - o.w / 2), s1 = Math.min(L, o.at + o.w / 2), ob = base + o.sill, ot = Math.min(top, ob + o.h);
      seg(t, s0, base, top); seg(s0, s1, base, ob); seg(s0, s1, ot, top);
      seg(s0, s1, ob, ot, o.type === 'door' ? { door: o.id } : { glass: 1 });
      t = s1;
    }
    seg(t, L, base, top);
  }
  // 顶层天花 / 平屋面（挡住往上跳）
  const tf = topFloor(d), bt = bboxOf(d.walls.filter(w => w.floor === tf)); if (bt) box(bt[0] - half, bt[2] + half, y0(tf) + d.floors[tf].h, y0(tf) + d.floors[tf].h + 0.3, bt[1] - half, bt[3] + half);
  // 栏杆、家具
  for (const [x0, z0, x1, z1] of railingsOf(d)) box(Math.min(x0, x1) - 0.04, Math.max(x0, x1) + 0.04, h0, h0 + 1.05, Math.min(z0, z1) - 0.04, Math.max(z0, z1) + 0.04);
  for (const b of furnitureSolids(d)) S.push(b);
  return S;
}

export class Walker {
  constructor(viewer, design, hooks = {}) {
    this.v = viewer; this.d = design; this.hooks = hooks;
    this.cam = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
    this.solids = solidsOf(design); this.open = {}; this.keys = new Set();
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.ground = false; this.swim = false;
    this.spawn(); this.stats = { frames: 0 };
    this.onKey = e => this.key(e, true); this.offKey = e => this.key(e, false);
    this.onMouse = e => { if (document.pointerLockElement === viewer.canvas) this.look(e.movementX, e.movementY); };
    this.onLock = () => { const l = document.pointerLockElement === viewer.canvas; this.locked = l; hooks.onLock && hooks.onLock(l); };
  }
  start() {
    const v = this.v; this.prevCam = v.cam; v.cam = this.cam; v.controls.enabled = false; v.persp.clearViewOffset();
    const { W, H } = v.size(); this.cam.aspect = W / H; this.cam.updateProjectionMatrix();
    v.onTick = dt => this.tick(dt);
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.offKey); addEventListener('mousemove', this.onMouse); document.addEventListener('pointerlockchange', this.onLock);
    this.envWas = v.scene.environmentIntensity; v.scene.environmentIntensity = 0.75; v.scene.fog.near = 40; this.apply();
  }
  stop() {
    const v = this.v; v.onTick = null; v.cam = this.prevCam || v.persp; v.scene.environmentIntensity = this.envWas ?? 0.45; v.scene.fog.near = 70;
    removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.offKey); removeEventListener('mousemove', this.onMouse); document.removeEventListener('pointerlockchange', this.onLock);
    if (document.pointerLockElement) document.exitPointerLock(); this.keys.clear();
  }
  // 出生点：第一扇一层外门外 3 m，面朝门；没有门就站在地块北边正中
  spawn() {
    const d = this.d, b0 = bboxOf(d.walls.filter(w => w.floor === 0));
    let p = [d.lot.w / 2, Math.min(2, d.lot.d / 2)], face = [0, 1];
    const gate = d.site && d.site.fence && (d.site.gates || []).find(q => q.side === 'n');
    if (gate) {
      const pk = d.site.parking, n = pk ? Math.max(1, Math.round(pk.w / 3)) : 1;
      let x = gate.at; if (pk && pk.car) { const free = [...Array(n).keys()].map(i => pk.x + (i + 0.5) * pk.w / n).filter((c, i) => i + 1 !== pk.car && c > gate.at - gate.w / 2 && c < gate.at + gate.w / 2); if (free.length) x = free[0]; }
      this.pos.set(x, 0, -3); this.yaw = Math.PI; this.pitch = -0.05; this.vel.set(0, 0, 0); return;
    }
    if (b0) {
      for (const o of d.openings) {
        if (o.type !== 'door') continue; const w = d.walls.find(x => x.id === o.wall); if (!w || w.floor !== 0) continue;
        const L = wlen(w), c = [w.a[0] + (w.b[0] - w.a[0]) * o.at / L, w.a[1] + (w.b[1] - w.a[1]) * o.at / L];
        const out = c[1] === b0[1] ? [0, -1] : c[1] === b0[3] ? [0, 1] : c[0] === b0[0] ? [-1, 0] : c[0] === b0[2] ? [1, 0] : null; if (!out) continue;
        const q = [c[0] + out[0] * 3, c[1] + out[1] * 3]; if (q[0] < 0.5 || q[1] < 0.5 || q[0] > d.lot.w - 0.5 || q[1] > d.lot.d - 0.5) continue;
        p = q; face = [-out[0], -out[1]]; break;
      }
    }
    this.pos.set(p[0], 0, p[1]); this.yaw = Math.atan2(-face[0], -face[1]); this.pitch = -0.05; this.vel.set(0, 0, 0);
  }
  key(e, down) {
    if (e.target && e.target.closest && e.target.closest('input,textarea')) return;
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) { e.preventDefault(); down ? this.keys.add(k) : this.keys.delete(k); }
    if (down && k === 'KeyF' && !e.repeat) { e.preventDefault(); this.toggleDoor(); }
  }
  look(dx, dy) { this.yaw -= dx * 0.0024; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0024)); }
  // ───── 开门 ─────
  aimDoor() {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(0, 0), this.cam); rc.far = REACH;
    const meshes = [...this.v.doors.values()].flatMap(r => r.targets || [r.mesh]), hit = rc.intersectObjects(meshes, false)[0];
    if (hit) return hit.object.userData.door || hit.object.userData.win;
    const dir = new THREE.Vector3(); this.cam.getWorldDirection(dir);
    // 大门：站在门正前方 3.5 m 内、面朝大门就算
    for (const r of this.v.doors.values()) {
      if (r.kind !== 'gate' || !r.span) continue; const g = r.span, P = this.pos, u = g.xa ? P.x : P.z, v = g.xa ? P.z : P.x, dv = g.xa ? dir.z : dir.x, hl = Math.hypot(dir.x, dir.z) || 1;
      if (u > g.a - 0.3 && u < g.b + 0.3 && Math.abs(v - g.line) < 3.5 && Math.sign(g.line - v) * dv / hl > 0.55) return r.id;
    }
    // 门已经开着、门扇转开了：看向门洞中心也算（取最准的那个）
    let best = null, bd = 0.93;
    for (const r of this.v.doors.values()) {
      const to = r.center.clone().sub(this.cam.position), dist = to.length(); if (dist > REACH + (r.kind === 'gate' ? 1.5 : 0)) continue;
      const dt = to.normalize().dot(dir); if (dt > bd) { bd = dt; best = r.id; }
    }
    return best;
  }
  toggleDoor() {
    const id = this.aimDoor(); if (!id) return false;
    const r = this.v.doors.get(id), from = r.open, to = this.open[id] ? 0 : 1;
    const blk = this.solids.filter(s => s.door === id), p = this.pos;
    if (!to && blk.some(s => p.x + R > s.x0 && p.x - R < s.x1 && p.z + R > s.z0 && p.z - R < s.z1)) return false; // 人站在门洞里，不关
    this.open[id] = !!to; blk.forEach(s => { s.off = !!to; });
    this.v.anims.push({ t0: performance.now(), dur: 380, fn: k => this.v.setDoor(id, from + (to - from) * k) });
    this.hooks.onDoor && this.hooks.onDoor(id, !!to, r.kind); return true;
  }
  // ───── 物理 ─────
  hits(x, y, z) { for (const s of this.solids) if (!s.off && x + R > s.x0 && x - R < s.x1 && z + R > s.z0 && z - R < s.z1 && y + HEIGHT > s.y0 && y < s.y1) return s; return null; }
  tick(dt) {
    const k = this.keys, f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0), sx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (k.has('ArrowLeft')) this.yaw += 2.2 * dt; if (k.has('ArrowRight')) this.yaw -= 2.2 * dt;
    const joy = this.joy || [0, 0], fw = f + joy[1], st = sx + joy[0];
    const p = this.pos, pool = this.d.pool, inPool = pool && p.x > pool.x && p.x < pool.x + pool.w && p.z > pool.z && p.z < pool.z + pool.d && p.y < -0.05;
    this.swim = inPool && p.y < -0.2;
    const sp = (this.swim ? 2.0 : (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK));
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), len = Math.hypot(fw, st) || 1;
    const vx = (fx * fw + -fz * st) / len * sp * Math.min(1, Math.hypot(fw, st)), vz = (fz * fw + fx * st) / len * sp * Math.min(1, Math.hypot(fw, st));
    // 竖直：重力、跳、游泳
    if (this.swim) { this.vel.y = (k.has('Space') || this.jumpBtn) ? 2.4 : Math.max(this.vel.y - 6 * dt, -1.2); }
    else { this.vel.y -= G * dt; if ((k.has('Space') || this.jumpBtn) && this.ground) { this.vel.y = JUMP; this.ground = false; } }
    // 水平：先 x 后 z，撞到矮台阶就迈上去
    const moveAxis = (dx, dz) => {
      const nx = p.x + dx, nz = p.z + dz, s = this.hits(nx, p.y, nz);
      if (!s) { p.x = nx; p.z = nz; return; }
      const up = s.y1 - p.y;
      if (up > 0 && up <= STEP && (this.ground || inPool) && !this.hits(nx, s.y1 + 0.001, nz)) { p.x = nx; p.z = nz; p.y = s.y1 + 0.001; this.vel.y = Math.max(0, this.vel.y); }
    };
    moveAxis(vx * dt, 0); moveAxis(0, vz * dt);
    // 竖直移动（水里慢慢沉，按空格往上游）
    const ny = p.y + this.vel.y * dt, s = this.hits(p.x, ny, p.z);
    if (!s) { p.y = ny; this.ground = false; }
    else if (this.vel.y <= 0) { p.y = this.topBelow(p.x, ny, p.z, p.y); this.vel.y = 0; this.ground = true; }
    else { this.vel.y = 0; }
    if (p.y < -2.5) { this.spawn(); }
    this.apply(); this.stats.frames++;
    if (this.hooks.onTick) this.hooks.onTick();
    return true;
  }
  topBelow(x, y, z, from) { let top = -Infinity; for (const s of this.solids) if (!s.off && s.y1 <= from + 0.01 && x + R > s.x0 && x - R < s.x1 && z + R > s.z0 && z - R < s.z1 && y + HEIGHT > s.y0 && y < s.y1) top = Math.max(top, s.y1); return top === -Infinity ? from : top + 0.0001; }
  apply() { this.cam.position.set(this.pos.x, this.pos.y + EYE, this.pos.z); this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); }
  where() {
    const p = this.pos, h0 = this.d.floors[0].h, pool = this.d.pool, b0 = bboxOf(this.d.walls.filter(w => w.floor === 0));
    if (pool && p.y < -0.1 && p.x > pool.x && p.x < pool.x + pool.w && p.z > pool.z && p.z < pool.z + pool.d) return 'pool';
    if (p.z < 0) return 'street';
    if (p.y > h0 - 0.3) return 'f2';
    if (b0 && p.x > b0[0] && p.x < b0[2] && p.z > b0[1] && p.z < b0[3]) return 'f1';
    return 'yard';
  }
  kindOf(id) { const r = id && this.v.doors.get(id); return r ? r.kind : null; }
  state() { return { x: +this.pos.x.toFixed(3), y: +this.pos.y.toFixed(3), z: +this.pos.z.toFixed(3), yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), where: this.where(), ground: this.ground, open: { ...this.open }, aim: this.aimDoor(), locked: !!this.locked }; }
}
