import { Viewer } from './scene.js';
import { boq, FACTORS, wlen } from './boq.js';
import { t, tr, setLang, lang } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const snap = v => Math.round(v * 2) / 2;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const peso = v => '₱' + Math.round(v).toLocaleString('en-US');
const num = v => (Math.round(v * 100) / 100).toLocaleString('en-US');
const K = { design: 'villa-lab:design', lang: 'villa-lab:lang', progress: 'villa-lab:progress', lastWall: 'villa-lab:lastwall' };
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
const mobile = () => innerWidth < 760;
const ICON = {
  select: '<path d="M5 3l14 8-6 1.5L10 19z"/>', wall: '<rect x="3" y="9" width="18" height="6" rx="1"/><path d="M8 9v6M13 9v6M18 9v6"/>',
  door: '<rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="15" cy="12" r="1"/>', window: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M12 5v14M4 12h16"/>',
  pool: '<rect x="3" y="7" width="18" height="10" rx="3"/><path d="M6 12c2-1.5 4 1.5 6 0s4 1.5 6 0"/>', undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12"/>', redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 000 12"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>', plan: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h9v8M13 4v4"/>',
  play: '<path d="M8 5l11 7-11 7z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

const D = {}; let viewer, design, past = [], future = [], current = '', lesson = null;
const ui = { tool: 'select', floor: 0, selected: null, stage: 8, slot: 'wall', view: '3d', drag: null, playing: null };
const M = id => D.mats.find(m => m.id === id);
const lastStage = () => D.stages.length - 1;

// ───── 设计状态 ─────
function save() { store.set(K.design, design); }
function commit(nd, push = true, soft = false) {
  if (push) { past.push(clone(design)); if (past.length > 200) past.shift(); future = []; }
  design = clone(nd); if (ui.selected && !design.walls.some(w => w.id === ui.selected)) ui.selected = null;
  save();
  if (soft && current === 'design') { rebuild(); const c = $('[data-testid=cost-total]'); if (c) c.textContent = peso(boq(design, D.mats).total); const v = $('#pdv'); if (v && design.pool) v.textContent = design.pool.depth.toFixed(1) + ' m'; }
  else refresh();
}
function undo() { if (!past.length) return; future.push(clone(design)); design = past.pop(); save(); ui.selected = design.walls.some(w => w.id === ui.selected) ? ui.selected : null; refresh(); }
function redo() { if (!future.length) return; past.push(clone(design)); design = future.pop(); save(); refresh(); }
function newId(p) { let i = 1; const used = new Set([...design.walls, ...design.openings].map(x => x.id)); while (used.has(p + i)) i++; return p + i; }
function refresh() { if (current === 'design') { rebuild(); renderInspector(); } }
function rebuild(animate = false) { viewer.build(design, ui.stage, { plan: ui.view === 'plan', floor: ui.floor, selected: ui.selected, animate }); }

// ───── 通用组件 ─────
function slider(el, { min, max, step, get, set, text }) {
  el.setAttribute('role', 'slider'); el.tabIndex = 0; el.setAttribute('aria-valuemin', min); el.setAttribute('aria-valuemax', max);
  const upd = () => { const v = get(); el.setAttribute('aria-valuenow', v); if (text) el.setAttribute('aria-valuetext', text(v)); const k = el.querySelector('.knob'), f = el.querySelector('.fill'); const p = (v - min) / (max - min) * 100; if (k) k.style.left = p + '%'; if (f) f.style.width = p + '%'; el.dispatchEvent(new CustomEvent('upd', { detail: v })); };
  const put = v => { v = Math.max(min, Math.min(max, Math.round(v / step) * step)); v = Math.round(v * 1000) / 1000; if (v !== get()) set(v); upd(); };
  el.addEventListener('keydown', e => {
    const v = get(), m = { ArrowRight: v + step, ArrowUp: v + step, ArrowLeft: v - step, ArrowDown: v - step, Home: min, End: max }[e.key];
    if (m === undefined) return; e.preventDefault(); put(m);
  });
  const fromX = e => { const r = el.querySelector('.track').getBoundingClientRect(); return min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min); };
  el.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; el.setPointerCapture(e.pointerId); put(fromX(e)); const mv = ev => put(fromX(ev)), up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });
  el.upd = upd; upd(); return el;
}
function timeline(get, set) {
  const el = document.createElement('div'); el.className = 'timeline'; el.dataset.testid = 'timeline';
  el.innerHTML = `<div class="track"><div class="fill"></div>${D.stages.map((s, i) => `<i style="left:${i / lastStage() * 100}%"></i>`).join('')}<div class="knob"></div></div><div class="ticks">${D.stages.map(s => `<span>${esc(tr(s.name))}</span>`).join('')}</div>`;
  slider(el, { min: 0, max: lastStage(), step: 1, get, set, text: v => tr(D.stages[v].name) });
  el.addEventListener('upd', e => { el.dataset.stage = D.stages[e.detail].id; el.querySelectorAll('.ticks span').forEach((s, i) => s.classList.toggle('on', i === e.detail)); const cap = el.parentElement && el.parentElement.querySelector('.stage-cap'); if (cap) cap.innerHTML = `<b>${esc(tr(D.stages[e.detail].name))}</b> ${esc(tr(D.stages[e.detail].desc))}`; });
  el.upd(); return el;
}
function toast(msg) { const el = $('#toast'); if (!el) return; el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); }
function attachCanvas(host) { host.appendChild(viewer.canvas); viewer.resize(); }
function freeFrom(ids) {
  return () => {
    if (mobile()) return null;
    const c = viewer.canvas.getBoundingClientRect(); let x0 = 0, y0 = 0, x1 = c.width, y1 = c.height; const pad = 18;
    for (const [id, side] of ids) {
      const e = document.getElementById(id); if (!e) continue; const r = e.getBoundingClientRect(); if (!r.width) continue;
      if (side === 'left') x0 = Math.max(x0, r.right - c.left + pad); if (side === 'right') x1 = Math.min(x1, r.left - c.left - pad);
      if (side === 'top') y0 = Math.max(y0, r.bottom - c.top + pad); if (side === 'bottom') y1 = Math.min(y1, r.top - c.top - pad);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
}

// ───── 设计器 ─────
function pageDesign(app) {
  app.innerHTML = `<section class="design">
    <div class="stage" id="stage"></div>
    <div class="hint" id="hint"></div>
    <nav class="dock glass" data-glass id="dock" aria-label="tools">
      <div class="grp">${['select', 'wall', 'door', 'window', 'pool'].map(k => `<button class="ib" data-testid="tool-${k}" data-tool="${k}" title="${t('tool' + k[0].toUpperCase() + k.slice(1))}">${icon(k)}<span>${t('tool' + k[0].toUpperCase() + k.slice(1))}</span></button>`).join('')}</div>
      <div class="grp">
        <div class="seg"><button data-testid="view-3d" data-view="3d">${icon('cube')}<span>${t('view3d')}</span></button><button data-testid="view-plan" data-view="plan">${icon('plan')}<span>${t('viewPlan')}</span></button></div>
        <div class="seg"><button data-testid="floor-1" data-floor="0">${t('floor1')}</button><button data-testid="floor-2" data-floor="1">${t('floor2')}</button></div>
        <div class="seg"><button data-testid="undo" title="${t('undo')} Ctrl+Z">${icon('undo')}</button><button data-testid="redo" title="${t('redo')} Ctrl+Y">${icon('redo')}</button></div>
      </div>
    </nav>
    <aside class="insp glass" data-glass id="insp"></aside>
    <div class="tldock glass" data-glass id="tl"><button class="play" id="play" aria-label="${t('play')}">${icon('play')}</button><div class="tlwrap"><div class="stage-cap"></div></div></div>
    <div class="measure" id="measure"></div><div class="toast" id="toast" role="status"></div>
  </section>`;
  attachCanvas($('#stage'));
  viewer.freeRect = freeFrom([['dock', 'left'], ['insp', 'right'], ['tl', 'bottom'], ['topbar', 'top']]);
  const tl = timeline(() => ui.stage, v => { ui.stage = v; rebuildAnimated(); }); $('#tl .tlwrap').prepend(tl); tl.upd();
  $('#play').onclick = () => {
    if (ui.playing) { clearInterval(ui.playing); ui.playing = null; $('#play').innerHTML = icon('play'); return; }
    ui.stage = 0; tl.upd(); rebuild(); $('#play').innerHTML = icon('pause');
    ui.playing = setInterval(() => { if (ui.stage >= lastStage() || current !== 'design') { clearInterval(ui.playing); ui.playing = null; const p = $('#play'); if (p) p.innerHTML = icon('play'); return; } ui.stage++; tl.upd(); rebuildAnimated(); }, 1100);
  };
  $('#dock').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tool) setTool(b.dataset.tool);
    else if (b.dataset.view) { ui.view = b.dataset.view; viewer.setView(ui.view); rebuild(); sync(); }
    else if (b.dataset.floor) { ui.floor = +b.dataset.floor; rebuild(); sync(); }
    else if (b.dataset.testid === 'undo') undo(); else if (b.dataset.testid === 'redo') redo();
  };
  viewer.lot = design.lot; rebuild(); renderInspector(); sync();
  requestAnimationFrame(() => { viewer.resize(); viewer.setView(ui.view, false); });
}
function rebuildAnimated() { rebuild(true); }
function setTool(k) {
  ui.tool = k;
  if ((k === 'wall' || k === 'pool') && ui.view !== 'plan') { ui.view = 'plan'; viewer.setView('plan'); rebuild(); }
  sync();
}
function sync() {
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === ui.tool));
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === ui.view));
  document.querySelectorAll('[data-floor]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.floor === ui.floor));
  const u = $('[data-testid=undo]'), r = $('[data-testid=redo]'); if (u) u.disabled = false; if (r) r.disabled = false;
  const h = $('#hint'); if (h) { h.textContent = t('hint' + ui.tool[0].toUpperCase() + ui.tool.slice(1)); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); }
  if (viewer) viewer.canvas.style.cursor = ui.tool === 'select' ? (ui.view === '3d' ? 'grab' : 'default') : 'crosshair';
}
function renderInspector() {
  const el = $('#insp'); if (!el) return; const b = boq(design, D.mats);
  const sel = design.walls.find(w => w.id === ui.selected);
  const mats = D.mats.filter(m => m.slot === ui.slot);
  const cur = ui.slot === 'wall' ? (sel ? sel.material : (design.walls[0] || {}).material) : ui.slot === 'roof' ? design.roof.material : ui.slot === 'floor' ? design.floor.material : design.pool && design.pool.material;
  el.innerHTML = `
    <div class="cost"><span>${t('cost')}</span><b data-testid="cost-total">${peso(b.total)}</b><a href="#/boq">${t('seeBoq')} →</a></div>
    ${sel ? `<div class="card sel"><div class="row"><b>${t('selWall')}</b><button class="link danger" data-act="del">${t('del')}</button></div>
      <div class="muted">${t('floorN', { n: sel.floor + 1 })} · ${t('length')} ${num(wlen(sel))} m · ${esc(tr(M(sel.material).name))}</div>
      ${design.openings.filter(o => o.wall === sel.id).map(o => `<div class="row small"><span>${o.type === 'door' ? t('toolDoor') : t('toolWindow')} ${o.w}×${o.h} m</span><button class="link" data-rm="${o.id}">${t('removeOpening')}</button></div>`).join('')}</div>` : ''}
    <h4>${t('materials')}</h4>
    <div class="seg full">${['wall', 'roof', 'floor', 'pool'].map(s => `<button data-testid="slot" data-id="${s}" aria-pressed="${ui.slot === s}">${t('slot' + s[0].toUpperCase() + s.slice(1))}</button>`).join('')}</div>
    ${ui.slot === 'wall' ? `<div class="muted small">${sel ? t('applySel') : t('applyAll')}</div>` : ''}
    <div class="mats">${mats.map(m => `<button class="mat" data-testid="mat" data-id="${m.id}" aria-pressed="${m.id === cur}"><img src="${m.texture.file}" alt="" loading="lazy"${m.texture.gain ? ` style="filter:brightness(${m.texture.gain})"` : ''}><span><b>${esc(tr(m.name))}</b><i>${m.price == null ? t('noPrice') : peso(m.price) + t('perUnit', { u: m.unit })}</i></span></button>`).join('')}</div>
    <h4>${t('roofType')}</h4>
    <div class="seg full">${['gable', 'hip', 'flat'].map(k => `<button data-testid="roof" data-id="${k}" aria-pressed="${design.roof.type === k}">${t(k)}</button>`).join('')}</div>
    <h4>${t('poolDepth')} <span class="muted" id="pdv">${design.pool ? design.pool.depth.toFixed(1) + ' m' : ''}</span></h4>
    ${design.pool ? '' : `<div class="muted small">${t('noPool')}</div>`}
    <div class="range${design.pool ? '' : ' off'}" data-testid="pool-depth"><div class="track"><div class="fill"></div><div class="knob"></div></div></div>
    <div class="files"><button data-testid="load-sample">${t('loadSample')}</button><button data-testid="new-design">${t('newDesign')}</button><button data-testid="export">${t('export')}</button><label class="btn">${t('import')}<input type="file" accept=".json,application/json" data-testid="import" hidden></label></div>`;
  slider($('[data-testid=pool-depth]'), { min: 0.8, max: 3, step: 0.1, get: () => (design.pool ? design.pool.depth : 1.5), set: v => { if (!design.pool) return; const d = clone(design); d.pool.depth = v; commit(d, true, true); }, text: v => v.toFixed(1) + ' m' });
  el.onclick = e => {
    const bt = e.target.closest('button'); if (!bt) return; const k = bt.dataset.testid;
    if (k === 'slot') { ui.slot = bt.dataset.id; renderInspector(); }
    else if (k === 'mat') applyMat(ui.slot, bt.dataset.id);
    else if (k === 'roof') { const d = clone(design); d.roof.type = bt.dataset.id; commit(d); }
    else if (k === 'load-sample') { commit(D.sample); ui.selected = null; viewer.lot = design.lot; viewer.setView(ui.view); rebuild(); }
    else if (k === 'new-design') confirmBox(t('confirmNew'), () => { const d = clone(design); d.walls = []; d.openings = []; d.pool = null; d.stairs = null; ui.selected = null; commit(d); });
    else if (k === 'export') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(design, null, 1)], { type: 'application/json' })); a.download = 'villa-design.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    else if (bt.dataset.act === 'del') delSelected();
    else if (bt.dataset.rm) { const d = clone(design); d.openings = d.openings.filter(o => o.id !== bt.dataset.rm); commit(d); }
  };
  $('[data-testid=import]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (d.v !== 1 || !Array.isArray(d.walls) || !d.lot) throw 0; ui.selected = null; commit(d); viewer.lot = design.lot; viewer.setView(ui.view); rebuild(); toast(t('imported')); } catch (x) { toast(t('importBad')); }
    e.target.value = '';
  };
}
function applyMat(slot, id) {
  const d = clone(design);
  if (slot === 'wall') { d.walls.forEach(w => { if (!ui.selected || w.id === ui.selected) w.material = id; }); store.set(K.lastWall, id); }
  else if (slot === 'roof') d.roof.material = id; else if (slot === 'floor') d.floor.material = id; else if (slot === 'pool') { if (!d.pool) return; d.pool.material = id; }
  commit(d);
}
function delSelected() { if (!ui.selected) return; const d = clone(design); d.walls = d.walls.filter(w => w.id !== ui.selected); d.openings = d.openings.filter(o => o.wall !== ui.selected); ui.selected = null; commit(d); }
function confirmBox(msg, ok) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="glass box" data-glass role="dialog" aria-modal="true"><p>${esc(msg)}</p><div class="row"><button data-x="c">${t('cancel')}</button><button class="primary" data-testid="confirm">${t('confirm')}</button></div></div>`;
  document.body.appendChild(m); requestAnimationFrame(() => m.classList.add('in'));
  m.onclick = e => { const b = e.target.closest('button'); if (!b && e.target !== m) return; m.remove(); if (b && b.dataset.testid === 'confirm') ok(); };
}
// 画布上的指针：画墙、放泳池、开门窗、选墙、章节里点构件
function wallAt(e, tol) {
  if (ui.view === 'plan') {
    const p = viewer.ground(e.clientX, e.clientY); if (!p) return null; let best = null, bd = Infinity;
    for (const w of design.walls) {
      if (w.floor !== ui.floor) continue; const L = wlen(w), ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L;
      const tt = Math.max(0, Math.min(L, (p.x - w.a[0]) * ux + (p.z - w.a[1]) * uz)), dd = Math.hypot(w.a[0] + ux * tt - p.x, w.a[1] + uz * tt - p.z);
      if (dd < bd) { bd = dd; best = { w, t: tt }; }
    }
    return bd <= tol ? best : null;
  }
  const h = viewer.pick(e.clientX, e.clientY, o => !!o.userData.wall); if (!h) return null;
  const w = design.walls.find(x => x.id === h.object.userData.wall); if (!w) return null; const L = wlen(w);
  return { w, t: Math.max(0, Math.min(L, ((h.point.x - w.a[0]) * (w.b[0] - w.a[0]) + (h.point.z - w.a[1]) * (w.b[1] - w.a[1])) / L)) };
}
function snapPt(e) { const p = viewer.ground(e.clientX, e.clientY, ui.floor ? design.floors[0].h : 0); return p ? [Math.max(0, Math.min(design.lot.w, snap(p.x))), Math.max(0, Math.min(design.lot.d, snap(p.z)))] : null; }
function wallEnd(a, e) { const b = snapPt(e); if (!b) return null; if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) b[1] = a[1]; else b[0] = a[0]; return b; }
function showMeasure(e, txt) { const m = $('#measure'); if (!m) return; if (!txt) { m.style.opacity = 0; return; } m.textContent = txt; m.style.opacity = 1; m.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`; }
function onDown(e) {
  if (current === 'learn') return lessonClick(e);
  if (current !== 'design') return;
  ui.drag = { x: e.clientX, y: e.clientY };
  if (ui.view === 'plan' && (ui.tool === 'wall' || ui.tool === 'pool')) { const a = snapPt(e); if (a) { ui.drag.a = a; viewer.canvas.setPointerCapture(e.pointerId); } }
}
function onMove(e) {
  if (current !== 'design' || ui.view !== 'plan') return;
  const dr = ui.drag;
  if (dr && dr.a && ui.tool === 'wall') { const b = wallEnd(dr.a, e); if (b) { viewer.setGhost({ type: 'wall', a: dr.a, b, y: ui.floor ? design.floors[0].h : 0 }); showMeasure(e, num(Math.hypot(b[0] - dr.a[0], b[1] - dr.a[1])) + ' m'); } }
  else if (dr && dr.a && ui.tool === 'pool') { const b = snapPt(e); if (b) { const x = Math.min(dr.a[0], b[0]), z = Math.min(dr.a[1], b[1]), w = Math.abs(b[0] - dr.a[0]), d = Math.abs(b[1] - dr.a[1]); viewer.setGhost({ type: 'rect', x, z, w, d }); showMeasure(e, `${num(w)} × ${num(d)} m`); } }
  else if (!dr && ui.tool === 'wall') { const p = snapPt(e); if (p) viewer.setGhost({ type: 'dot', x: p[0], z: p[1], y: ui.floor ? design.floors[0].h : 0 }); }
}
function onUp(e) {
  if (current !== 'design' || !ui.drag) return; const dr = ui.drag; ui.drag = null; viewer.setGhost(null); showMeasure(e, '');
  const moved = Math.hypot(e.clientX - dr.x, e.clientY - dr.y);
  if (dr.a && ui.tool === 'wall') {
    const b = wallEnd(dr.a, e); if (!b || Math.hypot(b[0] - dr.a[0], b[1] - dr.a[1]) < 0.5) return;
    const d = clone(design); d.walls.push({ id: newId('w'), floor: ui.floor, a: dr.a, b, material: store.get(K.lastWall, D.mats.find(m => m.slot === 'wall').id) }); commit(d); return;
  }
  if (dr.a && ui.tool === 'pool') {
    const b = snapPt(e); if (!b) return; const x = Math.min(dr.a[0], b[0]), z = Math.min(dr.a[1], b[1]), w = Math.abs(b[0] - dr.a[0]), dd = Math.abs(b[1] - dr.a[1]); if (w < 1 || dd < 1) return;
    const d = clone(design); d.pool = { x, z, w, d: dd, depth: d.pool ? d.pool.depth : 1.5, material: d.pool ? d.pool.material : D.mats.find(m => m.slot === 'pool').id }; commit(d); return;
  }
  if (moved > 5) return;
  if (ui.tool === 'select') { const h = wallAt(e, 0.25); ui.selected = h ? h.w.id : null; rebuild(); renderInspector(); return; }
  if (ui.tool === 'door' || ui.tool === 'window') {
    const h = wallAt(e, 0.35); if (!h) return; const L = wlen(h.w), isD = ui.tool === 'door', ow = isD ? 0.9 : 1.2, oh = isD ? 2.1 : 1.2, sill = isD ? 0 : 0.9;
    if (L < ow + 0.2) return toast(t('tooShort'));
    let at = Math.max(ow / 2, Math.min(L - ow / 2, snap(h.t)));
    if (design.openings.some(o => o.wall === h.w.id && Math.abs(o.at - at) < (o.w + ow) / 2)) return toast(t('overlap'));
    const d = clone(design); d.openings.push({ id: newId('o'), wall: h.w.id, type: ui.tool, at, w: ow, h: Math.min(oh, d.floors[h.w.floor].h - sill - 0.5), sill }); commit(d);
  }
}
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); if (current === 'design') undo(); }
  else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); if (current === 'design') redo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && current === 'design' && ui.selected) { e.preventDefault(); delSelected(); }
  else if (e.key === 'Escape' && current === 'design') { ui.selected = null; rebuild(); renderInspector(); }
  else if (current === 'design' && !mod && !e.target.closest('[role=slider]')) { const m = { v: 'select', w: 'wall', d: 'door', n: 'window', p: 'pool' }[k]; if (m) setTool(m); }
});

// ───── 章节 ─────
const progress = () => store.get(K.progress, {});
function pageLearn(app, id) {
  const L = D.lessons.find(l => l.id === id); if (!L) { location.hash = '#/'; return; }
  const idx = D.lessons.indexOf(L);
  lesson = { L, i: 0, stage: lastStage(), d: clone(D.sample), hint: false, info: '', done: false };
  app.innerHTML = `<section class="learn">
    <div class="stage" id="stage"></div>
    <div class="tldock glass" data-glass id="tl"><div class="tlwrap"><div class="stage-cap"></div></div></div>
    <aside class="lessonpane glass" data-glass id="pane">
      <div class="eyebrow">${t('chapter', { n: idx + 1 })}</div><h2>${esc(tr(L.title))}</h2><p class="muted">${esc(tr(L.intro))}</p>
      <ol class="steps" id="steps"></ol><div id="lend"></div>
      <details class="srcs"><summary>${t('sourcesOf')}</summary>${L.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('')}</details>
    </aside><div class="toast" id="toast"></div></section>`;
  attachCanvas($('#stage'));
  viewer.freeRect = freeFrom([['pane', 'right'], ['tl', 'bottom'], ['topbar', 'top']]);
  lesson.tl = timeline(() => lesson.stage, v => { lesson.stage = v; buildLesson(true); checkStep(); }); $('#tl .tlwrap').prepend(lesson.tl); lesson.tl.upd();
  viewer.lot = lesson.d.lot; ui.view = '3d'; buildLesson(false);
  requestAnimationFrame(() => { viewer.resize(); viewer.setView('3d', false); });
  drawSteps();
  $('#steps').onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const c = lesson.L.steps[lesson.i] && lesson.L.steps[lesson.i].check; if (!c) return;
    if (b.dataset.testid === 'choice') { if (+b.dataset.k === c.answer) done(); else { lesson.hint = true; drawSteps(); } }
    else if (b.dataset.testid === 'mat' && c.kind === 'material') { setLessonMat(c.slot, b.dataset.id); if (b.dataset.id === c.id) done(); else drawSteps(); }
    else if (b.dataset.testid === 'ack') done();
  };
}
function buildLesson(animate) { viewer.build(lesson.d, lesson.stage, { animate }); }
function setLessonMat(slot, id) { const d = lesson.d; if (slot === 'wall') d.walls.forEach(w => { w.material = id; }); else if (slot === 'roof') d.roof.material = id; else if (slot === 'floor') d.floor.material = id; else if (d.pool) d.pool.material = id; buildLesson(false); }
function activate() {
  const s = lesson.L.steps[lesson.i]; lesson.hint = false; if (!s) return;
  if (s.check.kind === 'stage' && D.stages[lesson.stage].id === s.check.to) { lesson.stage = lesson.stage === lastStage() ? 0 : lastStage(); lesson.tl.upd(); buildLesson(false); }
}
function done() {
  lesson.i++;
  if (lesson.i >= lesson.L.steps.length) { const P = progress(); P[lesson.L.id] = true; store.set(K.progress, P); }
  activate(); drawSteps();
}
function checkStep() { const s = lesson && lesson.L.steps[lesson.i]; if (s && s.check.kind === 'stage' && D.stages[lesson.stage].id === s.check.to) done(); }
function lessonClick(e) {
  const s = lesson && lesson.L.steps[lesson.i]; if (!s || s.check.kind !== 'inspect') return;
  const start = { x: e.clientX, y: e.clientY };
  const up = ev => {
    viewer.canvas.removeEventListener('pointerup', up);
    if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 5) return;
    const h = viewer.pick(ev.clientX, ev.clientY), at = s.check.at;
    if (h && Math.hypot(h.point.x - at[0], h.point.y - at[1], h.point.z - at[2]) <= 1.2) { lesson.info = tr(s.check.part); done(); }
  };
  viewer.canvas.addEventListener('pointerup', up);
}
function drawSteps() {
  const el = $('#steps'); if (!el) return; const L = lesson.L;
  el.innerHTML = L.steps.map((s, i) => {
    const st = i < lesson.i ? 'done' : i === lesson.i ? 'active' : 'todo', c = s.check; let x = '';
    if (st === 'active') {
      if (c.kind === 'quiz') x = `<div class="choices">${c.choices[lang].map((ch, k) => `<button data-testid="choice" data-k="${k}">${esc(ch)}</button>`).join('')}</div>` + (lesson.hint ? `<p class="hintbox" data-testid="hint">${t('hintWrong')}${esc(tr(c.explain))}</p>` : '');
      if (c.kind === 'material') x = `<div class="mats compact">${D.mats.filter(m => m.slot === c.slot).map(m => `<button class="mat" data-testid="mat" data-id="${m.id}"><img src="${m.texture.file}" alt=""><span><b>${esc(tr(m.name))}</b></span></button>`).join('')}</div>`;
      if (c.kind === 'ack') x = `<button class="primary" data-testid="ack">${t('ack')}</button>`;
    }
    if (st === 'done' && c.kind === 'quiz') x = `<p class="explain">${esc(tr(c.explain))}</p>`;
    return `<li class="step" data-testid="step" data-state="${st}"><span class="n">${st === 'done' ? '✓' : i + 1}</span><div><p>${esc(tr(s.text))}</p>${x}</div></li>`;
  }).join('');
  const end = $('#lend'); const idx = D.lessons.indexOf(L), nx = D.lessons[idx + 1];
  end.innerHTML = (lesson.info ? `<div class="partinfo" data-testid="part-info">${esc(lesson.info)}</div>` : '') +
    (lesson.i >= L.steps.length ? `<div class="complete" data-testid="lesson-complete"><b>${t('lessonDone')}</b><div class="row">${nx ? `<a class="btn primary" href="#/learn/${nx.id}">${t('nextLesson')} →</a>` : ''}<a class="btn" href="#/">${t('backHome')}</a><a class="btn" href="#/design">${t('tryDesign')}</a></div></div>` : '');
  const a = el.querySelector('[data-state=active]'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ───── 首页 ─────
function pageHome(app) {
  const P = progress(), n = D.lessons.filter(l => P[l.id]).length, b = boq(design, D.mats);
  app.innerHTML = `<section class="home">
    <div class="hero"><div class="stage" id="stage"></div>
      <div class="herocard glass" data-glass id="herocard"><div class="eyebrow">${t('heroEyebrow')}</div><h1>${t('heroTitle')}</h1><p>${t('heroSub')}</p>
        <div class="row"><a class="btn primary" href="#/design" data-testid="start-design">${t('startDesign')}</a><a class="btn" href="#/learn/${D.lessons[0].id}">${t('startLearn')}</a></div></div></div>
    <div class="course"><div class="head"><div><h2>${t('courseTitle')}</h2><p class="muted">${t('courseSub')}</p></div><div class="prog"><div class="bar"><i style="width:${n / D.lessons.length * 100}%"></i></div><span>${t('progress', { a: n, b: D.lessons.length })}</span></div></div>
      <div class="cards">${D.lessons.map((l, i) => `<a class="lcard glass" data-glass data-testid="lesson-card" data-id="${l.id}" data-done="${!!P[l.id]}" href="#/learn/${l.id}"><span class="eyebrow">${t('chapter', { n: i + 1 })}${P[l.id] ? ` · <em>${t('done')} ✓</em>` : ''}</span><b>${esc(tr(l.title))}</b><p>${esc(tr(l.intro))}</p></a>`).join('')}</div>
      <a class="house glass" data-glass href="#/design"><span class="eyebrow">${t('yourHouse')}</span><b>${peso(b.total)}</b><span class="muted">${t('refCost')} · ${design.walls.length} ${t('walls')} · ${design.openings.length} ${t('openings')}</span></a>
    </div></section>`;
  attachCanvas($('#stage'));
  viewer.freeRect = freeFrom([['herocard', 'left'], ['topbar', 'top']]);
  viewer.lot = design.lot; ui.view = '3d'; viewer.build(design, lastStage(), {});
  viewer.controls.autoRotate = true; viewer.controls.autoRotateSpeed = 0.6; viewer.controls.enableZoom = false;
  const pts = [...design.walls.flatMap(w => [w.a, w.b]), ...(design.pool ? [[design.pool.x, design.pool.z], [design.pool.x + design.pool.w, design.pool.z + design.pool.d]] : [])];
  const focus = pts.length ? [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))] : null;
  requestAnimationFrame(() => { viewer.resize(); viewer.view = '3d'; viewer.cam = viewer.persp; viewer.controls.enabled = true; viewer.home3d(false, focus); });
}

// ───── 清单与出处 ─────
function pageBoq(app) {
  const b = boq(design, D.mats), link = m => m.source ? `<a href="${esc(m.source)}" target="_blank" rel="noopener" title="${esc(m.quote)}">↗</a>` : '';
  app.innerHTML = `<section class="doc"><div class="glass sheet" data-glass><h1>${t('boqTitle')}</h1><p class="muted">${t('boqSub')}</p>
    ${b.lines.length ? `<div class="tablewrap"><table><thead><tr><th>${t('colMat')}</th><th class="r">${t('colQty')}</th><th class="r">${t('colPrice')}</th><th class="r">${t('colCost')}</th><th>${t('colBasis')}</th></tr></thead><tbody>
    ${b.lines.map(l => { const m = M(l.material); return `<tr data-testid="boq-line" data-material="${l.material}"><td>${esc(tr(m.name))}</td><td class="r">${num(l.qty)} ${esc(l.unit)}</td><td class="r">${l.unitPrice == null ? `<span class="muted">${t('noPrice')}</span>` : peso(l.unitPrice) + ' ' + link(m)}</td><td class="r">${l.cost == null ? '—' : peso(l.cost)}</td><td>${m.basis ? (m.basis === 'installed' ? `<span class="tag warn">${t('basisInstalled')}</span>` : `<span class="tag">${t('basisMaterial')}</span>`) : ''}</td></tr>`; }).join('')}
    </tbody><tfoot><tr><td>${t('total')}</td><td></td><td></td><td class="r"><b data-testid="cost-total">${peso(b.total)}</b></td><td></td></tr></tfoot></table></div>` : `<p>${t('empty')}</p><b data-testid="cost-total">${peso(0)}</b>`}
    ${b.poolWater ? `<p class="muted">${t('poolWater')}: ${num(b.poolWater)} m³</p>` : ''}
    <p class="disclaimer" data-testid="disclaimer">${t('disclaimer')}</p>
    <h3>${t('method')}</h3><ul class="method">${FACTORS.map(f => `<li>${esc(lang === 'en' ? f.en : f.zh)}${f.src ? ` <a href="${f.src}" target="_blank" rel="noopener">↗</a>` : ''}</li>`).join('')}</ul></div></section>`;
}
function pageSources(app) {
  app.innerHTML = `<section class="doc"><div class="glass sheet" data-glass><h1>${t('srcTitle')}</h1>
    <h3>${t('srcPrices')}</h3><div class="srclist">${D.mats.filter(m => m.price != null).map(m => `<div class="src" data-testid="source" data-id="${m.id}"><b>${esc(tr(m.name))}</b> · ${peso(m.price)}/${esc(m.unit)} · <span class="muted">${t('fetched', { d: m.priceDate })}</span><q>${esc(m.quote)}</q><a href="${esc(m.source)}" target="_blank" rel="noopener">${esc(m.source)}</a></div>`).join('')}</div>
    <h3>${t('srcLessons')}</h3><ul>${D.lessons.map(l => `<li><b>${esc(tr(l.title))}</b>: ${l.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</li>`).join('')}</ul>
    <h3>${t('srcTex')}</h3><ul class="texlist">${D.mats.filter(m => m.texture).map(m => `<li><img src="${m.texture.file}" alt=""><a href="https://polyhaven.com/a/${m.texture.ph}" target="_blank" rel="noopener">${m.texture.ph}</a></li>`).join('')}</ul>
    <h3>${t('srcCode')}</h3><p><a href="https://threejs.org/" target="_blank" rel="noopener">three.js r186</a> (MIT)</p></div></section>`;
}

// ───── 路由 ─────
function render() {
  const h = location.hash || '#/', app = $('#app');
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  $('#lang').textContent = lang === 'en' ? '中文' : 'EN';
  document.querySelectorAll('#topbar nav a').forEach(a => a.classList.toggle('on', h.startsWith(a.getAttribute('href')) && (a.getAttribute('href') !== '#/' || h === '#/' || h.startsWith('#/learn'))));
  document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
  if (ui.playing) { clearInterval(ui.playing); ui.playing = null; }
  if (viewer) { viewer.controls.autoRotate = false; viewer.controls.enableZoom = true; viewer.setGhost(null); if (viewer.canvas.parentElement) viewer.canvas.remove(); viewer.freeRect = () => null; }
  app.onclick = null; lesson = null;
  document.body.dataset.page = current = h.startsWith('#/design') ? 'design' : h.startsWith('#/learn/') ? 'learn' : h.startsWith('#/boq') ? 'boq' : h.startsWith('#/sources') ? 'sources' : 'home';
  if (current === 'design') pageDesign(app); else if (current === 'learn') pageLearn(app, h.slice(8)); else if (current === 'boq') pageBoq(app); else if (current === 'sources') pageSources(app); else pageHome(app);
  app.firstElementChild && app.firstElementChild.classList.add('enter');
  scrollTo(0, 0);
}

(async () => {
  setLang(store.get(K.lang, 'zh'));
  const j = f => fetch(`data/${f}.json`).then(r => r.json());
  [D.mats, D.stages, D.lessons, D.sample] = await Promise.all(['materials', 'stages', 'lessons', 'sample'].map(j));
  ui.stage = lastStage();
  design = store.get(K.design, null); if (!design || design.v !== 1) design = clone(D.sample);
  viewer = new Viewer(); await viewer.init(D.mats);
  const c = viewer.canvas; c.addEventListener('pointerdown', onDown); c.addEventListener('pointermove', onMove); c.addEventListener('pointerup', onUp);
  c.addEventListener('pointerleave', () => { if (current === 'design' && !ui.drag) viewer.setGhost(null); });
  $('#lang').onclick = () => { setLang(lang === 'en' ? 'zh' : 'en'); store.set(K.lang, lang); render(); };
  addEventListener('hashchange', render);
  render();
  window.__villa = {
    ready: true,
    state: () => clone(design),
    load: async d => { ui.selected = null; commit(clone(d)); viewer.lot = design.lot; if (current === 'design' && ui.view === 'plan') viewer.fitPlan(); },
    boq: () => boq(design, D.mats),
    project: (x, y, z) => viewer.project(x, y, z),
  };
})();
