// 第一人称参观自测：真键盘按 WASD/空格/F 走一遍示范别墅，判位置、楼层、门、帧率，截图到 shots/walk-*.png
// 用法：node tools/walk_test.mjs [网址，默认 http://127.0.0.1:4480/villa-lab/]（先 node tools/serve.mjs）
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/73405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright'); const { PNG } = require('pngjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), BASE = process.argv[2] || 'http://127.0.0.1:4480/villa-lab/';
const out = []; const rec = (id, ok, msg) => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${msg}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { const RAF = requestAnimationFrame.bind(window); window.__fr = []; const f = t => { window.__fr.push(performance.now()); if (window.__fr.length > 5000) window.__fr.splice(0, 1000); RAF(f); }; RAF(f); });
await p.goto(BASE + '#/walk');
for (let i = 0; i < 100; i++) { if (await p.evaluate(() => !!window.__walk)) break; await sleep(100); }
const st = () => p.evaluate(() => window.__walk.state());
const shot = async n => { fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true }); const f = path.join(ROOT, 'shots', `walk-${n}.png`); await p.screenshot({ path: f }); return PNG.sync.read(fs.readFileSync(f)); };
const diff = (a, c) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - c.data[i]) + Math.abs(a.data[i + 1] - c.data[i + 1]) + Math.abs(a.data[i + 2] - c.data[i + 2]) > 60) n++; return n / (a.width * a.height); };
const hold = async (key, ms) => { await p.keyboard.down(key); await sleep(ms); await p.keyboard.up(key); await sleep(250); };
const tp = (x, y, z, yaw, pitch = 0) => p.evaluate(a => window.__walk.teleport(...a), [x, y, z, yaw, pitch]);

await p.click('#go').catch(() => { }); await sleep(800);
let s = await st(); rec('spawn', s.where === 'street' && s.z < -2, `从街上出发 ${JSON.stringify(s)}`);
await shot('0-street');
await hold('KeyW', 2500); s = await st();
rec('gate-blocks', s.z < 0 && s.z > -1.2 && s.aim === 'gate1', `走到大门被挡住 z=${s.z}，准星对着 ${s.aim}`);
await p.keyboard.press('KeyF'); await sleep(800); s = await st(); await shot('0-gate-open');
rec('gate-open', s.open.gate1 === true, `按 F 推开大门 ${JSON.stringify(s.open)}`);
await hold('KeyW', 1500); s = await st();
rec('gate-enter', s.where === 'yard' && s.z > 1, `穿过大门进院子 ${s.where} z=${s.z}`);
await tp(13, 0, 3, Math.PI, -0.05); await sleep(300);
const A = await shot('1-yard');
const t0 = await p.evaluate(() => performance.now());
await hold('KeyW', 2500); s = await st();
const t1 = await p.evaluate(() => performance.now());
const fr = await p.evaluate(([a, c]) => { const f = window.__fr.filter(x => x >= a && x <= c), d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]); d.sort((x, y) => x - y); return { n: d.length, p95: d[Math.floor(d.length * 0.95)] }; }, [t0, t1]);
rec('door-blocks', s.z > 4.5 && s.z < 5.8 && s.where === 'yard', `走 2.5 秒停在门外 z=${s.z}`);
rec('perf-walk', fr.p95 <= 20, `走动时帧 ${fr.n}，p95 ${fr.p95.toFixed(1)}ms`);
rec('aim', s.aim === 'o2', `准星对着 ${s.aim}`);
const B = await shot('2-at-door');
await p.keyboard.press('KeyF'); await sleep(700); s = await st();
const C = await shot('3-door-open');
rec('door-open', s.open.o2 === true && diff(B, C) > 0.01, `按 F 后 open=${JSON.stringify(s.open)} 画面变化 ${(diff(B, C) * 100).toFixed(1)}%`);
await hold('KeyW', 1800); s = await st();
rec('enter', s.where === 'f1' && s.z > 6.6, `进门后在 ${s.where} z=${s.z}`);
await shot('4-foyer');
const y0 = s.y; await p.keyboard.down('Space'); await sleep(180); const sj = await st(); await p.keyboard.up('Space'); await sleep(900); const sl = await st();
rec('jump', sj.y - y0 > 0.4 && Math.abs(sl.y - y0) < 0.05, `起跳 ${y0}→${sj.y}，落回 ${sl.y}`);
// 客厅看一眼
await tp(10.5, 0.1, 12.2, Math.PI / 2 + 0.5, -0.15); await sleep(400); await shot('5-living');
// 开窗：客厅南窗 o6
await tp(9.3, 0.1, 15.0, 2.23, -0.15); await sleep(400); s = await st(); const W1 = await shot('5b-window');
await p.keyboard.press('KeyF'); await sleep(700); const s2 = await st(); const W2 = await shot('5c-window-open');
rec('window', s.aim === 'o6' && s2.open.o6 === true && diff(W1, W2) > 0.003, `对着窗 ${s.aim} 按 F → ${JSON.stringify(s2.open)}，画面变化 ${(diff(W1, W2) * 100).toFixed(2)}%`);
// 撞墙
await tp(10.0, 0.1, 15.0, Math.PI / 2); await hold('KeyW', 3500); s = await st();
rec('wall', s.x > 4.0 + 0.075 + 0.27 && s.where === 'f1', `朝西墙走 3.5 秒 x=${s.x}`);
// 上楼梯：从楼梯南端朝北走
await tp(14.9, 0.1, 11.6, 0); await hold('KeyW', 3200); s = await st();
rec('stairs', s.where === 'f2' && s.y > 2.9, `上楼后 ${s.where} y=${s.y} z=${s.z}`);
await p.keyboard.down('KeyA'); await sleep(1200); await p.keyboard.up('KeyA'); await sleep(200);
await tp((await st()).x, (await st()).y, (await st()).z, Math.PI * 0.8, -0.1); await sleep(300); await shot('6-upstairs');
// 二楼栏杆挡住楼梯洞
await tp(13.6, 3.001, 9.0, -Math.PI / 2); await hold('KeyW', 1500); s = await st();
rec('railing', s.y > 2.9 && s.x < 14.3, `朝楼梯洞走被栏杆挡住 x=${s.x} y=${s.y}`);
// 泳池：掉进去、游上来、爬出去
await tp(11, 0.001, 18.9, Math.PI); await hold('KeyW', 900); s = await st();
rec('pool-in', s.where === 'pool', `走进泳池 ${s.where} y=${s.y}`);
await shot('7-pool');
await p.keyboard.down('KeyW'); await p.keyboard.down('Space'); await sleep(4000); await p.keyboard.up('Space'); await p.keyboard.up('KeyW'); await sleep(400); s = await st();
rec('pool-out', s.where === 'yard' && s.z > 23.5 && s.y > -0.1, `游到对岸爬出 ${s.where} y=${s.y} z=${s.z}`);
// 关门：回前门内侧对着门按 F
await tp(13.0, 0.1, 7.6, 0, 0); await sleep(300); await p.keyboard.press('KeyF'); await sleep(600); s = await st();
rec('door-close', s.open.o2 === false, `再按 F 关门 open=${JSON.stringify(s.open)}`);
rec('console', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '控制台无报错');
await b.close();
console.log(`\n${out.filter(Boolean).length}/${out.length} PASS`); process.exit(out.every(Boolean) ? 0 : 1);
