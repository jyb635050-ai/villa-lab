// 别墅 DIY 网站（VillaLab）验收脚本 —— 判卷标准，冻结，任何人不许改（改了就算不合格）。
// 用法（在 D:\blender\VillaLab 下）：
//   node tools/accept.mjs            本地全量验收：自带静态服务器，站点挂在 /villa-lab/ 子路径（和 GitHub Pages 一样）
//   node tools/accept.mjs --url https://jyb635050-ai.github.io/villa-lab/
//                                    线上验收：除 sources 组外全套检查，另加：线上 data/*.json 必须与本地逐字节相同
//   node tools/accept.mjs --prove    反向验证：逐个往页面里注入破坏（冻结画面／卡顿／谎报用量／改价格／换贴图／外链／
//                                    报错／去毛玻璃／横向滚动／撤销失灵／不存档／转不动视角），对应检查必须变红。
//                                    全部抓到 → 退出码 1；有破坏没被抓到 → 退出码 2
//   --only 组名,组名   只跑某几组（调试用）：data sources home design boq timeline lessons layout。交付必须跑全量
// 全部 PASS 退出码 0；任一 FAIL 退出码 1。截图写到 shots/。sources 组要联网（去原网页核对价格原文、去 Poly Haven 核对贴图）。
// 判卷用画面本身判：3D 画布截图前后对比像素。只改 state() 里的数字、画面不变，骗不过去。
//
// ───── 坐标与设计数据（state）─────
// 单位米。x 向东、z 向南、y 向上；地面 y=0；一层墙从 y=0 到 floors[0].h，二层墙从 floors[0].h 到 floors[0].h+floors[1].h。
// 设计 JSON（__villa.state() 返回、data/sample.json、导出文件，三者同一格式）：
//   { v:1, lot:{w,d},                         地块东西宽 w、南北深 d（8–200）
//     floors:[{h},{h}],                       恰好两层，层高 2.4–4.5
//     walls:[{id, floor:0|1, a:[x,z], b:[x,z], material}]   端点在 0.5 米网格上、只许横平竖直、长 ≥0.5、不出地块；material＝wall 类材料 id
//     openings:[{id, wall, type:"door"|"window", at, w, h, sill}]  at＝洞口中心到该墙 a 端的距离；洞口不出墙；sill+h ≤ 层高；门 sill=0
//     pool: null | {x, z, w, d, depth, material}               x,z＝西北角；depth 0.8–3；material＝pool 类
//     stairs: null | {floor:0, x, z, w, d}
//     roof:{type:"gable"|"hip"|"flat", material}              material＝roof 类
//     floor:{material} }                                       室内地面，floor 类
//   id 都是字符串且唯一。可以多带字段，但 sample.json 载入后 state() 必须与它完全相同（数字按 1e-6 比）。
//
// ───── 数据契约 ─────
// data/materials.json  数组，≥20 项，每项：
//   id（小写字母数字短横线，唯一）、slot ∈ wall|roof|floor|pool|structure|opening、name:{zh,en}、unit（如 "pc" "m²" "m³" "kg" "sheet"）
//   price：比索单价（数字）或 null；≥80% 的材料要有价。有价的必须带：
//     priceDate "YYYY-MM"（≥ 2025-01）、source（https 原网页，不许是 github/个人托管/文库类站）、
//     quote：从原网页原样摘的一句（≤240 字），里面必须有一个数字恰好等于 price；判卷用真浏览器打开 source，页面文字里必须找得到 quote
//   wall 类：每项带 perSqm（每平米墙面用几块/几单位）；id 以 chb 开头的（空心砖）perSqm 必须是 12.5；至少一个 chb 开头
//   structure 类：必须有 id "concrete"（unit "m³"）和 id "rebar"（unit "kg"）
//   wall/roof/floor/pool 四类各 ≥3 项，且每项带贴图 texture:{ph:"Poly Haven 贴图 id", file:"本地文件路径"}：
//     file 必须是 Poly Haven 该贴图 Diffuse 1k 的原图或其缩小/重压缩版（不许裁切、调色），单个 ≤1.2 MB，全部贴图合计 ≤12 MB；同类里 ph 不许重复
// data/stages.json  数组，≥7 个施工阶段 {id, name:{zh,en}}，按施工顺序；必须含 footing、column、wall、roof、pool、finish，
//   footing 在 column 前、column 在 wall 前、wall 在 roof 前，finish 是最后一个
// data/lessons.json  数组，≥10 章，第一章 id 必须是 "foundation"（地基）；必须含 foundation frame slab masonry roof pool mep permit 八章
//   每章 {id, title:{zh,en}, sources:[{title,url}] ≥1, steps:[…] 3–8 步}；每步 {text:{zh,en}, check}
//   check 只许这几种（判卷会用真实鼠标键盘自己把每一步做完）：
//     {kind:"quiz", choices:{zh:[..],en:[..]}（≥3 个、中英等长）, answer:下标, explain:{zh,en}}  选项 [data-testid=choice]（只显示当前步的，按数组顺序）；
//        选错要出现 [data-testid=hint] 且不算过
//     {kind:"stage", to:"阶段 id"}      把本页 [data-testid=timeline] 拨到该阶段就算过，画面要跟着变
//     {kind:"material", slot, id}       点本页 [data-testid=mat][data-id=id] 就算过，画面要跟着变
//     {kind:"inspect", at:[x,y,z], part:{zh,en}}  在本页 3D 画面里点中 at 处的构件就算过，出现 [data-testid=part-info]；点空白处不许算过
//     {kind:"ack"}                      「懂了」按钮 [data-testid=ack]；每章最多 1 个
//   每章至少 1 个 quiz、至少 1 个 stage/material/inspect；全部合计 quiz ≥25、stage ≥5、material ≥4、inspect ≥5
//   每一步变成当前步时，它的条件必须还没满足（判卷先等 1 秒、点一下步骤文字，这时不许算过）
//   stage/material 步做完后画面要保留这一步的结果（判卷做完 0.7 秒后截图，和这一步开始时比，像素要有变化），下一步开始时别马上把画面复位
//   每章至少一个 sources 网址用真浏览器打开是 200 且正文 ≥300 字
// data/sample.json  示范两层泳池别墅：每层 ≥6 面墙、洞口 ≥8（门 ≥2、窗 ≥6）、有泳池、有楼梯
//
// ───── 页面契约 ─────
// 路由：#/ 首页；#/design 设计器；#/learn/<章 id> 章节；#/boq 用量与造价清单；#/sources 出处
// window.__villa：ready（数据与 3D 引擎就绪置 true）；state() 返回当前设计（深拷贝）；load(设计) 载入（可 async）；
//   project(x,y,z) 返回该世界坐标在当前页面 3D 画布上的视口坐标 {x,y}（CSS 像素）；
//   boq() 返回 { lines:[{material, qty, unit, unitPrice, cost}], total, poolWater }：
//     每种材料一行（不重复、qty>0）；unit＝材料 unit；unitPrice＝材料 price（null 则 cost 也 null）；cost＝qty×unitPrice（误差 ≤ max(1, 0.5%)）；
//     total＝各行 cost 之和（±1）；poolWater＝泳池水量 m³＝w×d×depth（没池子为 0）
//     墙体用量：某 wall 材料的 qty＝Σ(用该材料的墙 净面积)×perSqm×(1+损耗)，净面积＝长×层高−洞口面积，损耗是固定值 0–10%
//     structure 的 concrete、rebar 只要有墙就 >0；加泳池 concrete 要增加
// 每页 3D 画布 [data-testid=canvas]（<canvas>，每页只一个）
// #/design：
//   [data-testid=view-3d]：切 3D 视角并复位相机——从东南方向斜俯视（相机 x、z 都大于地块中心，俯角 25°–60°），整块地在画面里且没被面板挡住
//   [data-testid=view-plan]：切正上方平面图，北在上，整块地完整显示在画布没被面板挡住的区域
//   [data-testid=floor-1] [data-testid=floor-2]：当前编辑层（aria-pressed）
//   工具 [data-testid=tool-select|tool-wall|tool-door|tool-window|tool-pool]（aria-pressed）：
//     tool-wall：平面图里按住拖动画一面墙，端点吸附 0.5 米网格，横平竖直；画在当前层；材料＝上次选的墙材料或第一个 wall 材料
//     tool-window / tool-door：在墙上点一下，开一个洞口，中心在点击处（吸附 0.5 米）；窗默认 1.2×1.2 窗台 0.9，门默认 0.9×2.1
//     tool-pool：平面图里拖一个矩形＝泳池（吸附 0.5 米，已有泳池就替换）
//     tool-select：点墙选中（平面图里离中线 0.25 米内都算点中；3D 里点墙面）；Delete 键删除选中的墙（连同它的洞口）
//   材料：[data-testid=slot][data-id=wall|roof|floor|pool] 切类别，[data-testid=mat][data-id=材料 id] 应用：
//     wall 有选中墙时只改那面墙，没选中改全部墙；roof/floor/pool 改整体
//   [data-testid=roof][data-id=gable|hip|flat] 屋顶形式；[data-testid=pool-depth] role=slider，aria-valuenow＝池深，↑→ 加 0.1、↓← 减 0.1
//   [data-testid=undo] [data-testid=redo] 按钮；Ctrl+Z 撤销，Ctrl+Y 与 Ctrl+Shift+Z 重做
//   [data-testid=load-sample] 载入 data/sample.json；[data-testid=new-design] 清空（要确认就用页面内 [data-testid=confirm]，不许用浏览器原生对话框）
//   [data-testid=export] 下载当前设计 .json；[data-testid=import] 是 input[type=file]，选文件即载入
//   [data-testid=cost-total] 显示总价（₱，数字＝Math.round(boq().total)）
//   [data-testid=timeline] 施工回放，role=slider，aria-valuemin=0、aria-valuemax=阶段数−1、aria-valuenow＝当前阶段下标，data-stage＝阶段 id；
//     → 下一阶段、← 上一阶段、Home 第一个、End 最后一个；每个阶段画面都要不同
//   设计自动存本机，刷新后原样恢复
// #/learn/<id>：本章自己的 3D 场景（不许改动用户自己的设计）、[data-testid=timeline]、[data-testid=step]（按顺序，data-state="todo|active|done"，
//   同时只有一步 active）、全部完成出现 [data-testid=lesson-complete]
// #/：[data-testid=lesson-card][data-id][data-done="true|false"] 按 lessons.json 顺序，点击进入该章；进度存本机；[data-testid=start-design] 进设计器
// #/boq：每行 [data-testid=boq-line][data-material]；[data-testid=cost-total]；[data-testid=disclaimer]（≥20 字，说明是参考价、不是报价、含哪些不含哪些）
// #/sources：每个有价材料一个 [data-testid=source][data-id=材料 id]，里面有指向 source 的链接和 priceDate
// 语言：[data-testid=lang] 切换中/英；默认 <html lang="zh-CN">，切换后 "en"，刷新后保持；首页章节卡显示对应语言标题
// 毛玻璃：带 data-glass 属性的面板，backdrop-filter 含 blur(≥8px)，background-color 透明度 0.08–0.85；#/design 可见 ≥3 个，#/ 可见 ≥1 个
// 同一时刻 DOM 里每个 data-testid 只许出现一次（lesson-card step choice mat slot roof boq-line source 除外）
// 390×844、1280×720、1440×900 下任何页面不许横向滚动；390×844 的 #/design 里 tool-select tool-wall view-3d view-plan 完整可见且没被挡，画布可见面积 ≥40%
// 流畅：#/design 从打开到 ready ≤5 秒；示范别墅下拖动转视角 3 秒，帧间隔 p95 ≤20ms、超过 50ms 的帧 ≤2；施工回放切换期间 p95 ≤25ms；
//   ready 1 秒后不许有超过 250ms 的长任务
// 首页首屏（等 2 秒）总下载 ≤4 MB；#/design 载入示范别墅后总下载 ≤16 MB
// 页面不许请求任何外域资源；控制台不许有报错；不许弹浏览器原生对话框
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/73405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { PNG } = require('pngjs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PROVE = args.includes('--prove');
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const SHOT = path.join(ROOT, 'shots');
const SUB = '/villa-lab/';
const SLOTS = ['wall', 'roof', 'floor', 'pool'];
const ALL_SLOTS = [...SLOTS, 'structure', 'opening'];
const MUST_LESSONS = ['foundation', 'frame', 'slab', 'masonry', 'roof', 'pool', 'mep', 'permit'];
const MUST_STAGES = ['footing', 'column', 'wall', 'roof', 'pool', 'finish'];
const KINDS = ['quiz', 'stage', 'material', 'inspect', 'ack'];
const LIST_IDS = ['lesson-card', 'step', 'choice', 'mat', 'slot', 'roof', 'boq-line', 'source'];
const BAD_HOST = /(^|\.)(github\.io|github\.com|githubusercontent\.com|gitlab\.io|gist\.|pastebin\.com|glitch\.me|netlify\.app|vercel\.app|pages\.dev|surge\.sh|web\.app|firebaseapp\.com|blogspot\.com|wordpress\.com|medium\.com|notion\.site|google\.com|scribd\.com|studocu\.com|slideshare\.net|coursehero\.com|localhost|127\.0\.0\.1)$/i;
const TEX_CACHE = path.join(os.tmpdir(), 'villa-judge-cache');

let results = [];
function rec(id, ok, msg) { results.push({ id, ok, msg }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${msg}`); }
const tid = id => `[data-testid="${id}"]`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const want = g => !ONLY || ONLY.includes(g);
const canon = x => Array.isArray(x) ? x.map(canon) : (x && typeof x === 'object') ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canon(x[k])])) : typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const r2 = x => Math.round(x * 100) / 100;

// ───── 静态服务器 ─────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.hdr': 'application/octet-stream', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!u.startsWith(SUB)) { rsp.writeHead(u === '/favicon.ico' ? 404 : 302, { location: SUB }); return rsp.end(); }
      let f = path.join(ROOT, u.slice(SUB.length));
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { rsp.writeHead(404); return rsp.end('404'); }
      const st = fs.statSync(f);
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// ───── 注入页面的监听器与破坏（判卷自己的，和网页代码无关）─────
function probeInit(sab) {
  const RAF = window.requestAnimationFrame.bind(window);
  const P = window.__probe = { frames: [], longtasks: [] };
  const fr = t => { P.frames.push(performance.now()); if (P.frames.length > 8000) P.frames.splice(0, 2000); RAF(fr); };
  RAF(fr);
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.longtasks.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch (e) { }
  P.stats = (t0, t1) => {
    const f = P.frames.filter(x => x >= t0 && x <= t1), d = [];
    for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
    d.sort((a, b) => a - b);
    return { n: d.length, p95: d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] : 999, slow: d.filter(x => x > 50).length, max: d.length ? d[d.length - 1] : 999 };
  };
  if (sab.jank) { const r = window.requestAnimationFrame; window.requestAnimationFrame = cb => r.call(window, t => { const s = performance.now(); while (performance.now() - s < 28); cb(t); }); }
  if (sab.freeze) {
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      for (const f of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
        const o = C.prototype[f]; if (!o) continue;
        C.prototype[f] = function (...a) { if (window.__freeze) return; return o.apply(this, a); };
      }
    }
  }
  if (sab.boqlie) {
    let v;
    Object.defineProperty(window, '__villa', {
      configurable: true, get() { return v; },
      set(x) {
        v = new Proxy(x, {
          get(t, k) {
            if (k !== 'boq') return Reflect.get(t, k);
            return (...a) => {
              const b = t.boq(...a); const c = JSON.parse(JSON.stringify(b));
              for (const l of c.lines) if (/^chb/.test(l.material)) { l.qty = l.qty * 1.25; if (l.cost != null) l.cost = l.qty * l.unitPrice; }
              c.total = c.lines.reduce((s, l) => s + (l.cost || 0), 0); return c;
            };
          }
        });
      }
    });
  }
  if (sab.nopersist) { try { localStorage.clear(); } catch (e) { } }
  if (sab.noundo) {
    window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) e.stopImmediatePropagation(); }, true);
    window.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-testid=undo],[data-testid=redo]')) e.stopImmediatePropagation(); }, true);
  }
  if (sab.noorbit) for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'wheel']) window.addEventListener(ev, e => { if (e.target && e.target.tagName === 'CANVAS' && !window.__probeDrawing) e.stopImmediatePropagation(); }, true);
  const css = t => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = t; document.head.appendChild(s); });
  if (sab.noglass) css('*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}');
  if (sab.hscroll) css('html,body{overflow-x:visible!important}body::after{content:"";display:block;width:3000px;height:2px}');
  if (sab.ext) document.addEventListener('DOMContentLoaded', () => { const i = new Image(); i.src = 'https://example.com/villa-probe.png'; });
  if (sab.cerr) setTimeout(() => console.error('villa-probe error'), 1500);
}

// ───── 画面工具 ─────
async function shot(page) {
  const bb = await page.locator(tid('canvas')).boundingBox();
  if (!bb) throw new Error('找不到 [data-testid=canvas]');
  const clip = { x: Math.max(0, bb.x), y: Math.max(0, bb.y), width: Math.max(4, Math.min(bb.width, page.viewportSize().width - Math.max(0, bb.x))), height: Math.max(4, Math.min(bb.height, page.viewportSize().height - Math.max(0, bb.y))) };
  const png = PNG.sync.read(await page.screenshot({ clip }));
  png.ox = clip.x; png.oy = clip.y; return png;
}
function diffRatio(a, b, thr = 30) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let n = 0; const N = a.width * a.height;
  for (let i = 0; i < N * 4; i += 4) if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > thr) n++;
  return n / N;
}
function regionMean(img, vx, vy, r = 6) {
  const cx = Math.round(vx - img.ox), cy = Math.round(vy - img.oy); let s = [0, 0, 0], n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const i = (y * img.width + x) * 4; s[0] += img.data[i]; s[1] += img.data[i + 1]; s[2] += img.data[i + 2]; n++;
  }
  return n ? s.map(v => v / n) : [0, 0, 0];
}
const colorDist = (p, q) => (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])) / 3;
function stddev(img) {
  let s = 0, s2 = 0; const N = img.width * img.height;
  for (let i = 0; i < N * 4; i += 4) { const v = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3; s += v; s2 += v * v; }
  const m = s / N; return Math.sqrt(Math.max(0, s2 / N - m * m));
}
// 贴图比对：32×32 灰度归一化后的相关系数（同一张图缩小/重压缩 ≥0.96；换一张相似的图 ≤0.55，2026-09-28 实测）＋平均颜色差。
// 原图几乎没有明暗起伏（32×32 灰度标准差 <2，如 plastered_wall 实测 1.0）时相关系数不可靠，改比灰度平均差 ≤3
async function texSig(file) {
  const raw = Float64Array.from(await sharp(file).resize(32, 32, { fit: 'fill' }).greyscale().raw().toBuffer()); const a = Float64Array.from(raw);
  const m = a.reduce((s, v) => s + v, 0) / a.length; let v2 = 0; for (let i = 0; i < a.length; i++) { a[i] -= m; v2 += a[i] * a[i]; }
  const sd = Math.sqrt(v2 / a.length); for (let i = 0; i < a.length; i++) a[i] /= (sd || 1); return { a, raw, sd };
}
function texMatch(l, o) {
  if (o.sd < 2) { let s = 0; for (let i = 0; i < l.raw.length; i++) s += Math.abs(l.raw[i] - o.raw[i]); const d = s / l.raw.length; return { ok: d <= 3, why: `素色贴图，灰度差 ${d.toFixed(1)}＞3` }; }
  let s = 0; for (let i = 0; i < l.a.length; i++) s += l.a[i] * o.a[i]; const c = s / l.a.length; return { ok: c >= 0.85, why: `相关 ${c.toFixed(2)}＜0.85` };
}
async function texMean(file) { const s = await sharp(file).stats(); return s.channels.slice(0, 3).map(c => c.mean); }

// ───── 读数据 ─────
function readJson(rel) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (e) { return null; } }
const DATA = { mats: readJson('data/materials.json'), stages: readJson('data/stages.json'), lessons: readJson('data/lessons.json'), sample: readJson('data/sample.json') };
const matById = id => (DATA.mats || []).find(m => m.id === id);
const slotIds = s => (DATA.mats || []).filter(m => m.slot === s).map(m => m.id);

function numbersIn(s) { return (String(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => +x.replace(/,/g, '')).filter(Number.isFinite); }

function designProblems(d) {
  const P = []; const on = v => Number.isFinite(v) && Math.abs(v * 2 - Math.round(v * 2)) < 1e-6;
  if (!d || d.v !== 1) return ['v 不是 1'];
  const W = d.lot && d.lot.w, D = d.lot && d.lot.d;
  if (!(W >= 8 && W <= 200 && D >= 8 && D <= 200)) P.push('lot 不对');
  if (!Array.isArray(d.floors) || d.floors.length !== 2 || d.floors.some(f => !(f.h >= 2.4 && f.h <= 4.5))) P.push('floors 必须两层、层高 2.4–4.5');
  const ids = new Set(); const walls = new Map();
  for (const w of d.walls || []) {
    if (typeof w.id !== 'string' || ids.has(w.id)) P.push('墙 id 重复/非字符串 ' + w.id); ids.add(w.id); walls.set(w.id, w);
    const ok = Array.isArray(w.a) && Array.isArray(w.b) && [...w.a, ...w.b].every(on);
    if (!ok) { P.push('墙端点不在 0.5 网格 ' + w.id); continue; }
    if (w.a[0] !== w.b[0] && w.a[1] !== w.b[1]) P.push('墙不是横平竖直 ' + w.id);
    if (Math.hypot(w.a[0] - w.b[0], w.a[1] - w.b[1]) < 0.5) P.push('墙太短 ' + w.id);
    if ([w.a[0], w.b[0]].some(x => x < 0 || x > W) || [w.a[1], w.b[1]].some(z => z < 0 || z > D)) P.push('墙出地块 ' + w.id);
    if (w.floor !== 0 && w.floor !== 1) P.push('墙 floor 不对 ' + w.id);
    if (!slotIds('wall').includes(w.material)) P.push('墙材料不是 wall 类 ' + w.id);
  }
  for (const o of d.openings || []) {
    const w = walls.get(o.wall); if (!w) { P.push('洞口找不到墙 ' + o.id); continue; }
    if (typeof o.id !== 'string' || ids.has(o.id)) P.push('洞口 id 重复 ' + o.id); ids.add(o.id);
    const len = Math.hypot(w.a[0] - w.b[0], w.a[1] - w.b[1]), h = d.floors[w.floor] ? d.floors[w.floor].h : 0;
    if (!['door', 'window'].includes(o.type)) P.push('洞口 type 不对 ' + o.id);
    if (!(o.w > 0 && o.h > 0 && o.sill >= 0 && o.sill + o.h <= h + 1e-6 && o.at - o.w / 2 >= -1e-6 && o.at + o.w / 2 <= len + 1e-6)) P.push('洞口超出墙 ' + o.id);
    if (o.type === 'door' && o.sill !== 0) P.push('门 sill 不是 0 ' + o.id);
  }
  if (d.pool) { const p = d.pool; if (!(p.x >= 0 && p.z >= 0 && p.w > 0 && p.d > 0 && p.x + p.w <= W && p.z + p.d <= D && p.depth >= 0.8 && p.depth <= 3)) P.push('泳池尺寸/位置不对'); if (!slotIds('pool').includes(p.material)) P.push('泳池材料不是 pool 类'); }
  if (d.stairs) { const s = d.stairs; if (!(s.floor === 0 && s.x >= 0 && s.z >= 0 && s.w > 0 && s.d > 0 && s.x + s.w <= W && s.z + s.d <= D)) P.push('楼梯不对'); }
  if (!d.roof || !['gable', 'hip', 'flat'].includes(d.roof.type) || !slotIds('roof').includes(d.roof.material)) P.push('roof 不对');
  if (!d.floor || !slotIds('floor').includes(d.floor.material)) P.push('floor 不对');
  return P;
}

// ───── data 组 ─────
async function gData() {
  const { mats, stages, lessons, sample } = DATA;
  if (!Array.isArray(mats)) { rec('data.materials', false, 'data/materials.json 读不到'); } else {
    const P = []; const ids = new Set();
    for (const m of mats) {
      if (!/^[a-z0-9-]+$/.test(m.id || '') || ids.has(m.id)) P.push('id 不对/重复 ' + m.id); ids.add(m.id);
      if (!ALL_SLOTS.includes(m.slot)) P.push('slot 不对 ' + m.id);
      if (!(m.name && m.name.zh && m.name.en) || !m.unit) P.push('name/unit 缺 ' + m.id);
      if (m.price != null) {
        if (!(typeof m.price === 'number' && m.price > 0)) P.push('price 不是正数 ' + m.id);
        if (!/^\d{4}-\d{2}$/.test(m.priceDate || '') || m.priceDate < '2025-01') P.push('priceDate 不对/太旧 ' + m.id);
        if (!/^https:\/\//.test(m.source || '')) P.push('source 不是 https ' + m.id);
        if (!m.quote || m.quote.length > 240 || !numbersIn(m.quote).some(v => Math.abs(v - m.price) < 1e-9)) P.push('quote 里没有等于 price 的数字 ' + m.id);
      }
      if (m.slot === 'wall' && !(m.perSqm > 0)) P.push('wall 材料缺 perSqm ' + m.id);
      if (/^chb/.test(m.id) && m.perSqm !== 12.5) P.push('空心砖 perSqm 必须 12.5 ' + m.id);
      if (SLOTS.includes(m.slot)) {
        if (!m.texture || !m.texture.ph || !m.texture.file) P.push('缺 texture ' + m.id);
        else if (!fs.existsSync(path.join(ROOT, m.texture.file))) P.push('贴图文件不存在 ' + m.texture.file);
        else if (fs.statSync(path.join(ROOT, m.texture.file)).size > 1.2e6) P.push('贴图 >1.2MB ' + m.texture.file);
      }
    }
    const priced = mats.filter(m => m.price != null).length;
    if (mats.length < 20) P.push(`材料 ${mats.length} < 20`);
    if (priced < mats.length * 0.8) P.push(`有价 ${priced}/${mats.length} < 80%`);
    for (const s of SLOTS) { const L = mats.filter(m => m.slot === s); if (L.length < 3) P.push(`${s} 类 ${L.length} < 3`); const ph = L.map(m => m.texture && m.texture.ph); if (new Set(ph).size !== ph.length) P.push(`${s} 类贴图重复`); }
    if (!mats.some(m => m.slot === 'wall' && /^chb/.test(m.id))) P.push('没有 chb 开头的空心砖');
    const c = matById('concrete'), rb = matById('rebar');
    if (!c || c.slot !== 'structure' || c.unit !== 'm³') P.push('缺 concrete（structure，m³）');
    if (!rb || rb.slot !== 'structure' || rb.unit !== 'kg') P.push('缺 rebar（structure，kg）');
    const tex = mats.filter(m => m.texture && m.texture.file && fs.existsSync(path.join(ROOT, m.texture.file)));
    const tot = [...new Set(tex.map(m => m.texture.file))].reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);
    if (tot > 12e6) P.push(`贴图合计 ${(tot / 1e6).toFixed(1)}MB > 12MB`);
    rec('data.materials', P.length === 0, P.length ? P.slice(0, 8).join('；') : `${mats.length} 项，有价 ${priced}，贴图 ${(tot / 1e6).toFixed(1)}MB`);
  }
  if (!Array.isArray(stages)) rec('data.stages', false, 'data/stages.json 读不到'); else {
    const ids = stages.map(s => s.id), P = [];
    if (stages.length < 7) P.push('阶段 < 7');
    for (const m of MUST_STAGES) if (!ids.includes(m)) P.push('缺 ' + m);
    if (!(ids.indexOf('footing') < ids.indexOf('column') && ids.indexOf('column') < ids.indexOf('wall') && ids.indexOf('wall') < ids.indexOf('roof'))) P.push('顺序不对');
    if (ids[ids.length - 1] !== 'finish') P.push('finish 不是最后');
    if (new Set(ids).size !== ids.length || stages.some(s => !(s.name && s.name.zh && s.name.en))) P.push('id 重复或缺名字');
    rec('data.stages', P.length === 0, P.join('；') || ids.join('→'));
  }
  if (!Array.isArray(lessons)) rec('data.lessons', false, 'data/lessons.json 读不到'); else {
    const P = [], cnt = { quiz: 0, stage: 0, material: 0, inspect: 0, ack: 0 }; const sids = (stages || []).map(s => s.id);
    if (lessons.length < 10) P.push(`章数 ${lessons.length} < 10`);
    if (!lessons[0] || lessons[0].id !== 'foundation') P.push('第一章不是 foundation');
    for (const m of MUST_LESSONS) if (!lessons.some(l => l.id === m)) P.push('缺章 ' + m);
    for (const L of lessons) {
      if (!(L.title && L.title.zh && L.title.en)) P.push('缺标题 ' + L.id);
      if (!Array.isArray(L.sources) || !L.sources.length || L.sources.some(s => !/^https:\/\//.test(s.url || ''))) P.push('sources 不对 ' + L.id);
      const st = L.steps || []; if (st.length < 3 || st.length > 8) P.push(`步数 ${st.length} ` + L.id);
      let q = 0, h = 0, a = 0;
      for (const s of st) {
        const c = s.check || {}; if (!KINDS.includes(c.kind)) { P.push('未知 kind ' + L.id); continue; }
        if (!(s.text && s.text.zh && s.text.en)) P.push('步骤缺文字 ' + L.id);
        cnt[c.kind]++;
        if (c.kind === 'quiz') { q++; if (!(c.choices && c.choices.zh && c.choices.en && c.choices.zh.length >= 3 && c.choices.zh.length === c.choices.en.length && c.answer >= 0 && c.answer < c.choices.zh.length && c.explain && c.explain.zh && c.explain.en)) P.push('quiz 格式不对 ' + L.id); }
        if (c.kind === 'stage') { h++; if (!sids.includes(c.to)) P.push('stage 不存在 ' + L.id); }
        if (c.kind === 'material') { h++; const m = matById(c.id); if (!m || m.slot !== c.slot) P.push('material 不对 ' + L.id); }
        if (c.kind === 'inspect') { h++; if (!(Array.isArray(c.at) && c.at.length === 3 && c.at.every(Number.isFinite) && c.part && c.part.zh && c.part.en)) P.push('inspect 不对 ' + L.id); }
        if (c.kind === 'ack') a++;
      }
      if (!q) P.push('没有 quiz ' + L.id); if (!h) P.push('没有动手步 ' + L.id); if (a > 1) P.push('ack >1 ' + L.id);
    }
    if (cnt.quiz < 25) P.push(`quiz ${cnt.quiz} < 25`); if (cnt.stage < 5) P.push(`stage ${cnt.stage} < 5`);
    if (cnt.material < 4) P.push(`material ${cnt.material} < 4`); if (cnt.inspect < 5) P.push(`inspect ${cnt.inspect} < 5`);
    rec('data.lessons', P.length === 0, P.slice(0, 8).join('；') || `${lessons.length} 章 ${JSON.stringify(cnt)}`);
  }
  if (!sample) rec('data.sample', false, 'data/sample.json 读不到'); else {
    const P = designProblems(sample);
    const w0 = (sample.walls || []).filter(w => w.floor === 0).length, w1 = (sample.walls || []).filter(w => w.floor === 1).length;
    const op = sample.openings || [], dr = op.filter(o => o.type === 'door').length, wi = op.filter(o => o.type === 'window').length;
    if (w0 < 6 || w1 < 6) P.push(`墙 一层 ${w0} 二层 ${w1}（各需 ≥6）`);
    if (op.length < 8 || dr < 2 || wi < 6) P.push(`洞口 ${op.length}（门 ${dr} 窗 ${wi}）`);
    if (!sample.pool) P.push('没泳池'); if (!sample.stairs) P.push('没楼梯');
    rec('data.sample', P.length === 0, P.slice(0, 6).join('；') || `一层 ${w0} 面墙、二层 ${w1} 面、门 ${dr} 窗 ${wi}`);
  }
}

// ───── sources 组（联网）─────
async function gSources(browser, sab) {
  const mats = JSON.parse(JSON.stringify(DATA.mats || []));
  if (sab.pricelie) { const m = mats.find(x => x.price != null); if (m) m.price = r2(m.price + 7); }
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(); const cache = new Map();
  const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  async function text(u) {
    if (cache.has(u)) return cache.get(u);
    let r = { status: 0, text: '' };
    for (let i = 0; i < 2 && r.status !== 200; i++) {
      try { const resp = await page.goto(u, { timeout: 45000, waitUntil: 'domcontentloaded' }); await sleep(2500); r = { status: resp ? resp.status() : 0, text: await page.evaluate(() => document.body ? document.body.innerText : '') }; }
      catch (e) { r = { status: 0, text: '', err: e.message.slice(0, 60) }; }
    }
    cache.set(u, r); return r;
  }
  const hostOk = u => { try { return !BAD_HOST.test(new URL(u).hostname); } catch (e) { return false; } };
  // 价格原文
  const bad = []; let n = 0;
  for (const m of mats.filter(x => x.price != null)) {
    n++;
    if (!hostOk(m.source)) { bad.push(`${m.id} 来源站不允许`); continue; }
    if (!m.quote || !numbersIn(m.quote).some(v => Math.abs(v - m.price) < 1e-9)) { bad.push(`${m.id} quote 里没有 ${m.price}`); continue; }
    const r = await text(m.source);
    if (r.status !== 200) { bad.push(`${m.id} 原网页 ${r.status || r.err}`); continue; }
    if (!norm(r.text).includes(norm(m.quote))) bad.push(`${m.id} 原网页里找不到 quote`);
  }
  rec('src.price', n > 0 && bad.length === 0, !n ? '没有带价格的材料' : bad.length ? `${bad.length}/${n} 不过：` + bad.slice(0, 6).join('；') : `${n} 个价格都在原网页找到原文`);
  // 课程出处
  const lb = [];
  for (const L of DATA.lessons || []) {
    let ok = false;
    for (const s of L.sources || []) { if (!hostOk(s.url)) continue; const r = await text(s.url); if (r.status === 200 && r.text.replace(/\s+/g, '').length >= 300) { ok = true; break; } }
    if (!ok) lb.push(L.id);
  }
  rec('src.lessons', (DATA.lessons || []).length > 0 && lb.length === 0, !(DATA.lessons || []).length ? '没有课程' : lb.length ? '这些章没有一个能打开的出处：' + lb.join(',') : '每章都有能打开的出处');
  await ctx.close();
  // 贴图来源
  fs.mkdirSync(TEX_CACHE, { recursive: true });
  const tb = []; let tn = 0;
  const texMats = mats.filter(m => m.texture && m.texture.ph && m.texture.file);
  for (const m of texMats) {
    tn++;
    try {
      const fr = await fetch(`https://api.polyhaven.com/files/${encodeURIComponent(m.texture.ph)}`, { headers: { 'user-agent': 'villa-judge' } });
      if (fr.status !== 200) { tb.push(`${m.id} Poly Haven 没有 ${m.texture.ph}`); continue; }
      const d = (await fr.json())?.Diffuse?.['1k']?.jpg; if (!d) { tb.push(`${m.id} 没有 Diffuse 1k`); continue; }
      const cf = path.join(TEX_CACHE, `${m.texture.ph}_diff_1k.jpg`);
      const md5 = f => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
      if (!fs.existsSync(cf) || md5(cf) !== d.md5) { const b = Buffer.from(await (await fetch(d.url)).arrayBuffer()); fs.writeFileSync(cf, b); }
      if (md5(cf) !== d.md5) { tb.push(`${m.id} 原图下载校验失败`); continue; }
      let local = path.join(ROOT, m.texture.file);
      if (sab.texfake && tn === 1) { const o = texMats.find(x => x.texture.ph !== m.texture.ph); if (o) local = path.join(ROOT, o.texture.file); }
      if (!fs.existsSync(local)) { tb.push(`${m.id} 本地贴图不存在`); continue; }
      const mt = texMatch(await texSig(local), await texSig(cf)), cd = colorDist(await texMean(local), await texMean(cf));
      if (!mt.ok || cd > 15) tb.push(`${m.id} 和 Poly Haven ${m.texture.ph} 原图不像（${mt.ok ? '' : mt.why}${cd > 15 ? ` 色差 ${cd.toFixed(1)}＞15` : ''}）`);
    } catch (e) { tb.push(`${m.id} ${e.message.slice(0, 60)}`); }
  }
  rec('src.texture', tn > 0 && tb.length === 0, !tn ? '没有贴图' : tb.length ? tb.slice(0, 6).join('；') : `${tn} 张贴图都与 Poly Haven 原图一致`);
}

// ───── 页面会话 ─────
let BASE, HOST;
const G = { errors: [], external: [], dialogs: [] };
async function newPage(browser, sab, vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, userAgent: UA, acceptDownloads: true });
  const page = await ctx.newPage(); page.bytes = 0;
  await page.addInitScript(probeInit, sab);
  page.on('console', m => { if (m.type() === 'error') G.errors.push(m.text().slice(0, 120)); });
  page.on('pageerror', e => G.errors.push('pageerror ' + String(e.message).slice(0, 120)));
  page.on('request', r => { const u = r.url(); if (/^(data|blob):/.test(u)) return; try { if (new URL(u).host !== HOST) G.external.push(u.slice(0, 100)); } catch (e) { } });
  page.on('response', async r => { const cl = +(r.headers()['content-length'] || 0); if (cl) page.bytes += cl; else { try { page.bytes += (await r.body()).length; } catch (e) { } } });
  page.on('dialog', d => { G.dialogs.push(d.type()); d.dismiss().catch(() => { }); });
  return page;
}
async function waitReady(page, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await page.evaluate(() => !!(window.__villa && window.__villa.ready === true)).catch(() => false)) return Date.now() - t; await sleep(50); }
  return -1;
}
const st = page => page.evaluate(() => window.__villa.state());
const bq = page => page.evaluate(() => window.__villa.boq());
async function loadD(page, d) { await page.evaluate(async d => { await window.__villa.load(d); }, d); await sleep(600); }
const proj = (page, x, y, z) => page.evaluate(([x, y, z]) => window.__villa.project(x, y, z), [x, y, z]);
async function onCanvas(page, p) { return page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && e.matches('[data-testid=canvas]'); }, [p.x, p.y]); }
async function stepFrames(page, n = 2) { await page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n); }
async function drag(page, p1, p2, steps = 12) {
  await page.mouse.move(p1.x, p1.y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(p1.x + (p2.x - p1.x) * i / steps, p1.y + (p2.y - p1.y) * i / steps); await sleep(16); }
  await page.mouse.up(); await sleep(400);
}
async function clickT(page, id, extra = '') { await page.locator(tid(id) + extra).click({ timeout: 4000 }); await sleep(250); }
const qtyOf = (b, id) => { const l = (b.lines || []).find(x => x.material === id); return l ? l.qty : 0; };

function boqProblems(b) {
  const P = []; const seen = new Set(); let sum = 0;
  if (!b || !Array.isArray(b.lines)) return ['boq() 格式不对'];
  for (const l of b.lines) {
    const m = matById(l.material);
    if (!m) { P.push('未知材料 ' + l.material); continue; }
    if (seen.has(l.material)) P.push('重复行 ' + l.material); seen.add(l.material);
    if (!(Number.isFinite(l.qty) && l.qty > 0)) P.push('qty 不对 ' + l.material);
    if (l.unit !== m.unit) P.push('unit 不对 ' + l.material);
    if ((m.price ?? null) !== (l.unitPrice ?? null)) P.push('unitPrice 与材料表不符 ' + l.material);
    if (m.price == null) { if (l.cost != null) P.push('无价材料却有 cost ' + l.material); }
    else { const e = l.qty * m.price; if (!(Math.abs(l.cost - e) <= Math.max(1, e * 0.005))) P.push(`cost≠qty×单价 ${l.material}`); sum += l.cost; }
  }
  if (!(Math.abs(b.total - sum) <= 1)) P.push(`total ${b.total} ≠ 各行之和 ${r2(sum)}`);
  return P;
}

// ───── home 组 ─────
async function gHome(browser, sab) {
  const page = await newPage(browser, sab);
  await page.goto(BASE + '#/'); const rt = await waitReady(page);
  rec('home.ready', rt >= 0, rt >= 0 ? `${rt}ms` : '8 秒内 __villa.ready 没有变 true');
  await sleep(2000);
  rec('perf.bytes-home', page.bytes <= 4e6, `首屏下载 ${(page.bytes / 1e6).toFixed(2)}MB（≤4）`);
  rec('home.lang-default', await page.evaluate(() => document.documentElement.lang) === 'zh-CN', 'html lang=' + await page.evaluate(() => document.documentElement.lang));
  const cards = await page.locator(tid('lesson-card')).evaluateAll(es => es.map(e => [e.dataset.id, e.dataset.done]));
  const ids = (DATA.lessons || []).map(l => l.id);
  rec('home.cards', cards.length > 0 && same(cards.map(c => c[0]), ids) && cards.every(c => c[1] === 'true' || c[1] === 'false'), `卡片 ${cards.map(c => c[0]).join(',')}`);
  fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, 'home-1440.png') });
  try { await clickT(page, 'start-design'); await sleep(500); rec('home.start-design', await page.evaluate(() => location.hash) === '#/design', '点「开始设计」→ ' + await page.evaluate(() => location.hash)); }
  catch (e) { rec('home.start-design', false, e.message.slice(0, 80)); }
  await sleep(1500);
  await page.context().close();
}

// ───── design 组 ─────
async function gDesign(browser, sab) {
  const page = await newPage(browser, sab);
  const t0 = Date.now(); await page.goto(BASE + '#/design'); const rt = await waitReady(page, 10000);
  rec('perf.ready', rt >= 0 && Date.now() - t0 <= 5000 + 300, rt >= 0 ? `打开到 ready ${Date.now() - t0}ms（≤5000）` : '10 秒内没 ready');
  if (rt < 0) { await page.context().close(); return; }
  const tag = await page.locator(tid('canvas')).evaluate(e => e.tagName).catch(() => '无');
  rec('design.canvas', tag === 'CANVAS', '画布 ' + tag);
  const tReady = await page.evaluate(() => performance.now());
  // 示范别墅
  try {
    await clickT(page, 'load-sample'); await sleep(1500);
    const s = await st(page);
    rec('design.sample', same(s, DATA.sample), same(s, DATA.sample) ? '载入后 state() 与 sample.json 相同' : 'state() 与 sample.json 不同');
    await clickT(page, 'view-3d'); await sleep(900);
    const img = await shot(page); fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, 'design-sample.png') });
    rec('design.render', stddev(img) > 12, `画面起伏 ${stddev(img).toFixed(1)}（>12，不是空白）`);
    rec('perf.bytes-design', page.bytes <= 16e6, `下载 ${(page.bytes / 1e6).toFixed(2)}MB（≤16）`);
  } catch (e) { rec('design.sample', false, e.message.slice(0, 100)); }
  if (sab.freeze) await page.evaluate(() => { window.__freeze = true; });
  // 转视角 + 流畅
  try {
    const bb = await page.locator(tid('canvas')).boundingBox();
    const c = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    const A = await shot(page);
    const t1 = await page.evaluate(() => performance.now());
    await page.mouse.move(c.x - 200, c.y); await page.mouse.down();
    for (let i = 0; i <= 60; i++) { await page.mouse.move(c.x - 200 + i * 400 / 60, c.y + Math.sin(i / 9) * 40); await sleep(50); }
    await page.mouse.up();
    const t2 = await page.evaluate(() => performance.now());
    const fs1 = await page.evaluate(([a, b]) => window.__probe.stats(a, b), [t1, t2]);
    await sleep(700); const B = await shot(page);
    rec('design.orbit', diffRatio(A, B) >= 0.05, `拖动后画面变化 ${(diffRatio(A, B) * 100).toFixed(1)}%（≥5%）`);
    rec('perf.orbit', fs1.n >= 60 && fs1.p95 <= 20 && fs1.slow <= 2, `帧 ${fs1.n}，p95 ${fs1.p95.toFixed(1)}ms（≤20），>50ms ${fs1.slow} 帧（≤2）`);
    const C1 = await shot(page); await page.mouse.move(c.x, c.y); await page.mouse.wheel(0, -600); await sleep(800); const C2 = await shot(page);
    rec('design.zoom', diffRatio(C1, C2) >= 0.03, `滚轮缩放画面变化 ${(diffRatio(C1, C2) * 100).toFixed(1)}%（≥3%）`);
  } catch (e) { rec('design.orbit', false, e.message.slice(0, 100)); }
  // 从空地开始画
  const M = DATA.mats || []; const R0 = slotIds('roof')[0], F0 = slotIds('floor')[0];
  const EMPTY = { v: 1, lot: { w: 20, d: 30 }, floors: [{ h: 3 }, { h: 3 }], walls: [], openings: [], pool: null, stairs: null, roof: { type: 'flat', material: R0 }, floor: { material: F0 } };
  let wallId = null;
  try {
    await loadD(page, EMPTY);
    await clickT(page, 'view-plan'); await sleep(700); await clickT(page, 'floor-1'); await clickT(page, 'tool-wall');
    const p1 = await proj(page, 4, 0, 5), p2 = await proj(page, 12, 0, 5);
    if (!(await onCanvas(page, p1)) || !(await onCanvas(page, p2))) throw new Error('平面图里 (4,5)/(12,5) 被面板挡住或不在画布上');
    const A = await shot(page); await page.evaluate(() => { window.__probeDrawing = true; });
    await drag(page, p1, p2); await page.evaluate(() => { window.__probeDrawing = false; });
    const s = await st(page); const w = s.walls[0];
    const ok = s.walls.length === 1 && w.floor === 0 && ((same(w.a, [4, 5]) && same(w.b, [12, 5])) || (same(w.a, [12, 5]) && same(w.b, [4, 5])));
    await stepFrames(page, 3); const B = await shot(page);
    rec('design.draw-wall', ok && diffRatio(A, B) >= 0.002, `画墙：${JSON.stringify(s.walls.map(w => [w.floor, w.a, w.b]))}，画面变化 ${(diffRatio(A, B) * 100).toFixed(2)}%`);
    wallId = w && w.id;
  } catch (e) { rec('design.draw-wall', false, e.message.slice(0, 120)); }
  try {
    await clickT(page, 'tool-window'); const p = await proj(page, 8, 1.5, 5); await page.mouse.click(p.x, p.y); await sleep(500);
    await clickT(page, 'tool-door'); const q = await proj(page, 6, 1, 5); await page.mouse.click(q.x, q.y); await sleep(500);
    const s = await st(page); const win = s.openings.find(o => o.type === 'window'), door = s.openings.find(o => o.type === 'door');
    rec('design.openings', s.openings.length === 2 && win && door && win.wall === wallId && door.wall === wallId && Math.abs(win.at - 4) <= 0.5 && Math.abs(door.at - 2) <= 0.5 && designProblems(s).length === 0,
      `洞口 ${JSON.stringify(s.openings.map(o => [o.type, o.at, o.w, o.h, o.sill]))}${designProblems(s).length ? ' 问题：' + designProblems(s)[0] : ''}`);
  } catch (e) { rec('design.openings', false, e.message.slice(0, 120)); }
  // 换材料 + 撤销重做
  try {
    await clickT(page, 'view-3d'); await sleep(900); await clickT(page, 'tool-select');
    const p = await proj(page, 5, 1.5, 5);
    if (!(await onCanvas(page, p))) throw new Error('3D 复位视角下墙面 (5,1.5,5) 看不到或被面板挡住');
    await page.mouse.click(p.x, p.y); await sleep(400);
    const pre = await st(page); const M1 = pre.walls[0].material;
    const cands = [];
    for (const m of M.filter(m => m.slot === 'wall' && m.id !== M1 && m.texture)) { try { cands.push([m.id, colorDist(await texMean(path.join(ROOT, m.texture.file)), await texMean(path.join(ROOT, matById(M1).texture.file)))]); } catch (e) { } }
    cands.sort((a, b) => b[1] - a[1]); const M2 = cands[0] && cands[0][0];
    if (!M2) throw new Error('找不到第二种墙材料');
    await clickT(page, 'slot', '[data-id="wall"]');
    const before = await page.evaluate(() => window.__villa.boq().total);
    const A = await shot(page);
    await clickT(page, 'mat', `[data-id="${M2}"]`); await sleep(700);
    const B = await shot(page); const s = await st(page);
    const rc = colorDist(regionMean(A, p.x, p.y), regionMean(B, p.x, p.y)), dr = diffRatio(A, B);
    rec('design.material', s.walls[0].material === M2 && (rc >= 12 || dr >= 0.008), `墙 ${M1}→${s.walls[0].material}，该处颜色变 ${rc.toFixed(1)}（≥12）或全画面变 ${(dr * 100).toFixed(2)}%（≥0.8%）`);
    const after = await page.evaluate(() => window.__villa.boq().total);
    const txt = await page.locator(tid('cost-total')).innerText().catch(() => '');
    const shown = +(txt.replace(/[^\d.]/g, '').replace(/\.(?=.*\.)/g, '') || NaN);
    rec('design.cost-total', Math.abs(shown - Math.round(after)) <= 1 && (M2 === M1 || after !== before || matById(M2).price == null), `显示「${txt.trim()}」，boq().total=${r2(after)}（换材料前 ${r2(before)}）`);
    const S = async () => (await st(page)).walls[0].material;
    await page.keyboard.press('Control+z'); await sleep(400); const u1 = same(await st(page), pre);
    await page.keyboard.press('Control+y'); await sleep(400); const r1 = (await S()) === M2;
    await page.keyboard.press('Control+z'); await sleep(400);
    await page.keyboard.press('Control+Shift+z'); await sleep(400); const r2_ = (await S()) === M2;
    await clickT(page, 'undo'); await sleep(300); const u2 = same(await st(page), pre);
    await clickT(page, 'redo'); await sleep(300); const r3 = (await S()) === M2;
    rec('design.undo', u1 && r1 && r2_ && u2 && r3, `Ctrl+Z ${u1} Ctrl+Y ${r1} Ctrl+Shift+Z ${r2_} 按钮撤销 ${u2} 按钮重做 ${r3}`);
  } catch (e) { rec('design.material', false, e.message.slice(0, 120)); rec('design.undo', false, '没测到（前一步失败）'); }
  // 二层画墙 + 删除
  try {
    await clickT(page, 'view-plan'); await sleep(700); await clickT(page, 'floor-2'); await clickT(page, 'tool-wall');
    const p1 = await proj(page, 4, 3, 9), p2 = await proj(page, 4, 3, 15);
    if (!(await onCanvas(page, p1)) || !(await onCanvas(page, p2))) throw new Error('平面图里 (4,9)/(4,15) 被挡');
    await page.evaluate(() => { window.__probeDrawing = true; }); await drag(page, p1, p2); await page.evaluate(() => { window.__probeDrawing = false; });
    let s = await st(page); const w = s.walls.find(w => w.floor === 1);
    const ok = !!w && ((same(w.a, [4, 9]) && same(w.b, [4, 15])) || (same(w.a, [4, 15]) && same(w.b, [4, 9])));
    rec('design.floor2', ok, `二层墙 ${JSON.stringify(w ? [w.a, w.b] : null)}`);
    await clickT(page, 'tool-select'); const q = await proj(page, 4, 3, 12); await page.mouse.click(q.x, q.y); await sleep(300);
    await page.keyboard.press('Delete'); await sleep(500); s = await st(page);
    rec('design.delete', ok && !s.walls.some(x => x.id === w.id) && s.walls.length === 1, `删除后墙数 ${s.walls.length}`);
  } catch (e) { rec('design.floor2', false, e.message.slice(0, 120)); rec('design.delete', false, '没测到'); }
  // 泳池
  try {
    await clickT(page, 'floor-1'); await clickT(page, 'tool-pool');
    const p1 = await proj(page, 10, 0, 20), p2 = await proj(page, 16, 0, 24);
    if (!(await onCanvas(page, p1)) || !(await onCanvas(page, p2))) throw new Error('平面图里 (10,20)/(16,24) 被挡');
    await page.evaluate(() => { window.__probeDrawing = true; }); await drag(page, p1, p2); await page.evaluate(() => { window.__probeDrawing = false; });
    let s = await st(page); const p = s.pool;
    const ok = !!p && same([p.x, p.z, p.w, p.d], [10, 20, 6, 4]) && p.depth >= 1 && p.depth <= 2.5;
    const d0 = p ? p.depth : 0;
    await page.locator(tid('pool-depth')).focus(); for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowUp'); await sleep(120); }
    await sleep(400); s = await st(page);
    const aria = +(await page.locator(tid('pool-depth')).getAttribute('aria-valuenow'));
    const ok2 = s.pool && Math.abs(s.pool.depth - d0 - 0.3) <= 0.051 && Math.abs(aria - s.pool.depth) <= 0.051;
    const b = await bq(page);
    rec('design.pool', ok && ok2 && Math.abs(b.poolWater - 24 * s.pool.depth) <= 0.05, `泳池 ${JSON.stringify(p && [p.x, p.z, p.w, p.d, p.depth])} → 深 ${s.pool && s.pool.depth}，水量 ${b.poolWater}`);
  } catch (e) { rec('design.pool', false, e.message.slice(0, 120)); }
  try { await clickT(page, 'roof', '[data-id="gable"]'); const s = await st(page); rec('design.roof', s.roof.type === 'gable', '屋顶 ' + s.roof.type); } catch (e) { rec('design.roof', false, e.message.slice(0, 80)); }
  // 存档 / 导出导入 / 清空
  try {
    const s0 = await st(page); await page.reload(); await waitReady(page); await sleep(800);
    rec('design.persist', same(await st(page), s0), '刷新后设计' + (same(await st(page), s0) ? '原样恢复' : '变了'));
  } catch (e) { rec('design.persist', false, e.message.slice(0, 80)); }
  try {
    const s0 = await st(page);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.locator(tid('export')).click()]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    const e1 = same(j, s0);
    j.pool = j.pool || { x: 2, z: 20, w: 6, d: 3, depth: 1.5, material: slotIds('pool')[0] }; j.pool.depth = 2; j.roof.type = 'hip';
    const tmp = path.join(os.tmpdir(), `villa-import-${process.pid}.json`); fs.writeFileSync(tmp, JSON.stringify(j));
    await page.locator(tid('import')).setInputFiles(tmp); await sleep(1200);
    const e2 = same(await st(page), j);
    rec('design.export-import', e1 && e2, `导出＝当前设计 ${e1}，导入后＝文件 ${e2}`);
  } catch (e) { rec('design.export-import', false, e.message.slice(0, 100)); }
  try {
    await clickT(page, 'new-design'); await sleep(500);
    if (await page.locator(tid('confirm')).count()) { await clickT(page, 'confirm'); await sleep(500); }
    const s = await st(page); rec('design.new', s.walls.length === 0 && s.openings.length === 0 && s.pool === null, `清空后 墙 ${s.walls.length} 洞口 ${s.openings.length} 泳池 ${JSON.stringify(s.pool)}`);
  } catch (e) { rec('design.new', false, e.message.slice(0, 80)); }
  const lt = await page.evaluate(t => window.__probe.longtasks.filter(x => x[0] > t + 1000).map(x => x[1]), tReady);
  rec('perf.longtask', lt.every(x => x <= 250), `ready 后长任务最长 ${lt.length ? Math.max(...lt).toFixed(0) : 0}ms（≤250）`);
  await page.context().close();
}

// ───── boq 组 ─────
async function gBoq(browser, sab) {
  const page = await newPage(browser, sab);
  await page.goto(BASE + '#/design'); if (await waitReady(page, 10000) < 0) { rec('boq.wall', false, '没 ready'); await page.context().close(); return; }
  const M = slotIds('wall').find(id => /^chb/.test(id)), M2 = slotIds('wall').find(id => id !== M);
  const k2 = M2 && matById(M2).perSqm, R0 = slotIds('roof')[0], R1 = slotIds('roof')[1], F0 = slotIds('floor')[0], P0 = slotIds('pool')[0];
  const W = (id, f, a, b, m = M) => ({ id, floor: f, a, b, material: m });
  const base = { v: 1, lot: { w: 30, d: 30 }, floors: [{ h: 3 }, { h: 3 }], walls: [W('w1', 0, [2, 2], [12, 2]), W('w2', 0, [12, 2], [12, 10]), W('w3', 0, [12, 10], [2, 10]), W('w4', 0, [2, 10], [2, 2])], openings: [], pool: null, stairs: null, roof: { type: 'gable', material: R0 }, floor: { material: F0 } };
  const at = async d => { await loadD(page, d); return bq(page); };
  const P = [];
  try {
    const b0 = await at(base);
    const d1 = JSON.parse(JSON.stringify(base)); d1.walls.push(W('w5', 0, [4, 6], [10, 6])); const b1 = await at(d1);
    const w = (qtyOf(b1, M) - qtyOf(b0, M)) / (6 * 3 * 12.5) - 1;
    const d2 = JSON.parse(JSON.stringify(d1)); d2.openings.push({ id: 'o1', wall: 'w5', type: 'window', at: 3, w: 1.2, h: 1.2, sill: 0.9 }); const b2 = await at(d2);
    const e2 = -1.44 * 12.5 * (1 + w), g2 = qtyOf(b2, M) - qtyOf(b1, M);
    const d3 = JSON.parse(JSON.stringify(d2)); d3.floors[1].h = 2.8; d3.walls.push(W('w6', 1, [4, 6], [10, 6])); const b3 = await at(d3);
    const e3 = 6 * 2.8 * 12.5 * (1 + w), g3 = qtyOf(b3, M) - qtyOf(b2, M);
    const d4 = JSON.parse(JSON.stringify(d3)); d4.walls.find(x => x.id === 'w5').material = M2; const b4 = await at(d4);
    const e4 = -(18 - 1.44) * 12.5 * (1 + w), g4 = qtyOf(b4, M) - qtyOf(b3, M), w2 = qtyOf(b4, M2) / ((18 - 1.44) * k2) - 1;
    const tol = e => Math.max(1.5, Math.abs(e) * 0.01);
    const okW = w >= -0.002 && w <= 0.10 && Math.abs(g2 - e2) <= tol(e2) && Math.abs(g3 - e3) <= tol(e3) && Math.abs(g4 - e4) <= tol(e4) && w2 >= -0.01 && w2 <= 0.11;
    rec('boq.wall', okW, `加 6m 墙 → ${M} +${r2(qtyOf(b1, M) - qtyOf(b0, M))}（损耗 ${(w * 100).toFixed(1)}%）；开窗 ${r2(g2)}（应 ${r2(e2)}）；二层 2.8m 墙 +${r2(g3)}（应 ${r2(e3)}）；换材料 ${r2(g4)}（应 ${r2(e4)}），${M2} 损耗 ${(w2 * 100).toFixed(1)}%`);
    rec('boq.structure', qtyOf(b0, 'concrete') > 0 && qtyOf(b0, 'rebar') > 0, `混凝土 ${r2(qtyOf(b0, 'concrete'))} m³，钢筋 ${r2(qtyOf(b0, 'rebar'))} kg`);
    const d5 = JSON.parse(JSON.stringify(base)); d5.pool = { x: 15, z: 15, w: 8, d: 4, depth: 1.5, material: P0 }; const b5 = await at(d5);
    const d6 = JSON.parse(JSON.stringify(d5)); d6.pool.w = 10; const b6 = await at(d6);
    rec('boq.pool', Math.abs(b5.poolWater - 48) <= 0.2 && Math.abs(b6.poolWater - 60) <= 0.2 && qtyOf(b5, 'concrete') - qtyOf(b0, 'concrete') > 0.5 && qtyOf(b5, P0) > 0,
      `水量 ${b5.poolWater}/${b6.poolWater}（应 48/60），混凝土 +${r2(qtyOf(b5, 'concrete') - qtyOf(b0, 'concrete'))} m³，池面 ${P0} ${r2(qtyOf(b5, P0))}`);
    const d7 = JSON.parse(JSON.stringify(base)); d7.roof.material = R1; const b7 = await at(d7);
    const d8 = JSON.parse(JSON.stringify(base)); d8.roof.type = 'hip'; const b8 = await at(d8);
    rec('boq.roof', qtyOf(b0, R0) > 0 && qtyOf(b7, R1) > 0 && qtyOf(b7, R0) === 0 && qtyOf(b8, R0) > 0, `${R0} ${r2(qtyOf(b0, R0))}；换 ${R1} 后 ${r2(qtyOf(b7, R1))}、${R0} 剩 ${qtyOf(b7, R0)}；四坡 ${r2(qtyOf(b8, R0))}`);
    for (const [n, b] of [['b0', b0], ['b1', b1], ['b2', b2], ['b3', b3], ['b4', b4], ['b5', b5], ['b7', b7], ['b8', b8]]) for (const x of boqProblems(b)) P.push(n + ' ' + x);
    const bs = await at(DATA.sample);
    for (const x of boqProblems(bs)) P.push('示范 ' + x);
    for (const l of bs.lines || []) if (l.unitPrice == null) P.push('示范别墅用到的材料没价格 ' + l.material);
    rec('boq.cost', P.length === 0, P.slice(0, 6).join('；') || `示范别墅 ${bs.lines.length} 行，总价 ₱${Math.round(bs.total).toLocaleString('en-US')}，水量 ${bs.poolWater} m³`);
    // 清单页
    await clickT(page, 'load-sample'); await sleep(800);
    await page.goto(BASE + '#/boq'); await waitReady(page); await sleep(1200);
    const rows = await page.locator(tid('boq-line')).evaluateAll(es => es.map(e => e.dataset.material));
    const txt = await page.locator(tid('cost-total')).innerText().catch(() => '');
    const shown = +(txt.replace(/[^\d.]/g, '').replace(/\.(?=.*\.)/g, '') || NaN);
    const dis = (await page.locator(tid('disclaimer')).innerText().catch(() => '')).trim();
    rec('boq.page', same([...rows].sort(), bs.lines.map(l => l.material).sort()) && Math.abs(shown - Math.round(bs.total)) <= 1 && dis.length >= 20, `清单页 ${rows.length} 行，总价显示「${txt.trim()}」，说明 ${dis.length} 字`);
    await page.screenshot({ path: path.join(SHOT, 'boq.png'), fullPage: true });
  } catch (e) { rec('boq.wall', false, e.message.slice(0, 120)); }
  await page.context().close();
}

// ───── timeline 组 ─────
async function gTimeline(browser, sab) {
  const page = await newPage(browser, sab);
  await page.goto(BASE + '#/design'); if (await waitReady(page, 10000) < 0) { rec('timeline.stages', false, '没 ready'); await page.context().close(); return; }
  try {
    await clickT(page, 'load-sample'); await sleep(1000); await clickT(page, 'view-3d'); await sleep(900);
    const S = DATA.stages || []; const tl = page.locator(tid('timeline'));
    await tl.focus(); await page.keyboard.press('Home'); await sleep(900);
    const shots = [], P = []; const t1 = await page.evaluate(() => performance.now());
    for (let i = 0; i < S.length; i++) {
      if (i > 0) { await page.keyboard.press('ArrowRight'); await sleep(900); }
      const v = +(await tl.getAttribute('aria-valuenow')), ds = await tl.getAttribute('data-stage');
      if (v !== i || ds !== S[i].id) P.push(`第 ${i} 步 aria-valuenow=${v} data-stage=${ds}`);
      shots.push(await shot(page));
      await page.screenshot({ path: path.join(SHOT, `stage-${i}-${S[i].id}.png`) });
    }
    const t2 = await page.evaluate(() => performance.now());
    const mx = +(await tl.getAttribute('aria-valuemax'));
    if (mx !== S.length - 1) P.push('aria-valuemax=' + mx);
    const ds = []; for (let i = 1; i < shots.length; i++) { const d = diffRatio(shots[i - 1], shots[i]); ds.push((d * 100).toFixed(2)); if (d < 0.003) P.push(`${S[i - 1].id}→${S[i].id} 画面几乎没变`); }
    const whole = shots.length ? diffRatio(shots[0], shots[shots.length - 1]) : 0;
    if (whole < 0.05) P.push('第一阶段和最后阶段画面差 <5%');
    await page.keyboard.press('Home'); await sleep(300); await page.keyboard.press('End'); await sleep(300);
    if (+(await tl.getAttribute('aria-valuenow')) !== S.length - 1) P.push('End 没到最后');
    rec('timeline.stages', S.length >= 7 && P.length === 0, P.slice(0, 5).join('；') || `各阶段画面变化 ${ds.join('/')}%`);
    const f = await page.evaluate(([a, b]) => window.__probe.stats(a, b), [t1, t2]);
    rec('perf.timeline', f.p95 <= 25, `回放期间帧 p95 ${f.p95.toFixed(1)}ms（≤25）`);
  } catch (e) { rec('timeline.stages', false, e.message.slice(0, 120)); }
  await page.context().close();
}

// ───── lessons 组 ─────
async function gLessons(browser, sab) {
  const page = await newPage(browser, sab);
  await page.goto(BASE + '#/design'); if (await waitReady(page, 10000) < 0) { rec('lessons.all', false, '没 ready'); await page.context().close(); return; }
  let mine = null;
  try { await clickT(page, 'load-sample'); await sleep(800); mine = await st(page); } catch (e) { }
  const sids = (DATA.stages || []).map(s => s.id); const bad = []; let passed = 0;
  for (const L of DATA.lessons || []) {
    const P = [];
    try {
      await page.goto(BASE + '#/learn/' + L.id); await waitReady(page); await sleep(1200);
      const steps = page.locator(tid('step'));
      if (await steps.count() !== L.steps.length) throw new Error(`步骤数 ${await steps.count()}≠${L.steps.length}`);
      const state = i => steps.nth(i).getAttribute('data-state');
      const waitState = async (i, s, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await state(i) === s) return true; await sleep(100); } return false; };
      for (let i = 0; i < L.steps.length; i++) {
        const c = L.steps[i].check;
        if (!(await waitState(i, 'active'))) throw new Error(`第 ${i + 1} 步没变 active`);
        let A = null; if (['stage', 'material'].includes(c.kind)) A = await shot(page);
        await sleep(900); await steps.nth(i).click({ position: { x: 8, y: 8 } }).catch(() => { }); await sleep(300);
        if (await state(i) !== 'active') throw new Error(`第 ${i + 1} 步（${c.kind}）没做就过了`);
        if (c.kind === 'quiz') {
          const ch = page.locator(tid('choice'));
          if (await ch.count() !== c.choices.zh.length) throw new Error(`第 ${i + 1} 步选项数不对`);
          const wrong = (c.answer + 1) % c.choices.zh.length;
          await ch.nth(wrong).click(); await sleep(500);
          const hint = await page.locator(tid('hint')).isVisible().catch(() => false);
          if (!hint || await state(i) !== 'active') throw new Error(`第 ${i + 1} 步选错没提示或算过了`);
          await ch.nth(c.answer).click();
        } else if (c.kind === 'stage') {
          const tl = page.locator(tid('timeline')); const idx = sids.indexOf(c.to);
          if (+(await tl.getAttribute('aria-valuenow')) === idx) throw new Error(`第 ${i + 1} 步时间轴一开始就在 ${c.to}`);
          await tl.focus(); await page.keyboard.press('Home'); await sleep(150);
          for (let k = 0; k < idx; k++) { await page.keyboard.press('ArrowRight'); await sleep(150); }
        } else if (c.kind === 'material') {
          await page.locator(tid('mat') + `[data-id="${c.id}"]`).click({ timeout: 4000 });
        } else if (c.kind === 'inspect') {
          const bb = await page.locator(tid('canvas')).boundingBox();
          await page.mouse.click(bb.x + 6, bb.y + 6); await sleep(700);
          if (await state(i) !== 'active') throw new Error(`第 ${i + 1} 步点空白处也算过了`);
          const p = await proj(page, ...c.at);
          if (!(await onCanvas(page, p))) throw new Error(`第 ${i + 1} 步构件 ${JSON.stringify(c.at)} 看不到或被挡`);
          await page.mouse.click(p.x, p.y);
        } else if (c.kind === 'ack') { await page.locator(tid('ack')).click({ timeout: 4000 }); }
        if (!(await waitState(i, 'done', 3000))) throw new Error(`第 ${i + 1} 步（${c.kind}）做完没变 done`);
        if (c.kind === 'inspect') { const t = (await page.locator(tid('part-info')).innerText().catch(() => '')).trim(); if (t.length < 6) throw new Error(`第 ${i + 1} 步没出构件说明`); }
        if (A) { await sleep(700); const B = await shot(page); if (diffRatio(A, B) < 0.003) throw new Error(`第 ${i + 1} 步（${c.kind}）画面没跟着变`); }
      }
      if (!(await page.locator(tid('lesson-complete')).isVisible().catch(() => false))) throw new Error('没出现 lesson-complete');
      passed++;
    } catch (e) { P.push(e.message.slice(0, 90)); }
    if (P.length) bad.push(`${L.id}：${P[0]}`);
  }
  await page.goto(BASE + '#/'); await waitReady(page); await sleep(800); await page.reload(); await waitReady(page); await sleep(800);
  const done = await page.locator(tid('lesson-card')).evaluateAll(es => es.filter(e => e.dataset.done === 'true').map(e => e.dataset.id)).catch(() => []);
  rec('lessons.all', (DATA.lessons || []).length > 0 && bad.length === 0, bad.length ? `${passed}/${(DATA.lessons || []).length} 章闯关成功；` + bad.slice(0, 5).join('；') : `${passed} 章全部亲手闯关成功`);
  rec('lessons.progress', same(done.sort(), (DATA.lessons || []).filter((L, i) => !bad.some(b => b.startsWith(L.id + '：'))).map(L => L.id).sort()) && done.length > 0, `刷新后首页打勾 ${done.length} 章`);
  await page.goto(BASE + '#/design'); await waitReady(page); await sleep(800);
  rec('lessons.isolated', !!mine && same(await st(page), mine), '学完后用户自己的设计' + (mine && same(await st(page), mine) ? '没被动过' : '被改了或没测到'));
  await page.context().close();
}

// ───── layout 组 ─────
async function gLayout(browser, sab) {
  const routes = ['#/', '#/design', '#/learn/foundation', '#/boq', '#/sources'];
  const P = [], dup = [];
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    const page = await newPage(browser, sab, vp);
    for (const r of routes) {
      try {
        await page.goto(BASE + r); await waitReady(page); await sleep(1200);
        const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
        if (sw[0] > sw[1] + 1) P.push(`${vp.width} ${r} 横向滚动 ${sw[0]}>${sw[1]}`);
        const d = await page.evaluate(L => { const c = {}; document.querySelectorAll('[data-testid]').forEach(e => { c[e.dataset.testid] = (c[e.dataset.testid] || 0) + 1; }); return Object.entries(c).filter(([k, v]) => v > 1 && !L.includes(k)).map(([k]) => k); }, LIST_IDS);
        if (d.length) dup.push(`${r}：${d.join(',')}`);
      } catch (e) { P.push(`${vp.width} ${r} ${e.message.slice(0, 60)}`); }
    }
    if (vp.width === 390) {
      try {
        await page.goto(BASE + '#/design'); await waitReady(page); await sleep(1200);
        await page.screenshot({ path: path.join(SHOT, 'design-390.png') });
        for (const t of ['tool-select', 'tool-wall', 'view-3d', 'view-plan']) {
          const ok = await page.evaluate(t => { const e = document.querySelector(`[data-testid="${t}"]`); if (!e) return false; const r = e.getBoundingClientRect(); if (r.width < 1 || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return false; const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === e || e.contains(h)); }, t);
          if (!ok) P.push(`390 宽 ${t} 看不全或被挡`);
        }
        const area = await page.evaluate(() => { const c = document.querySelector('[data-testid=canvas]'); if (!c) return 0; let n = 0, k = 0; for (let x = 5; x < innerWidth; x += 10) for (let y = 5; y < innerHeight; y += 10) { k++; if (document.elementFromPoint(x, y) === c) n++; } return n / k; });
        if (area < 0.4) P.push(`390 宽画布可见 ${(area * 100).toFixed(0)}% < 40%`);
      } catch (e) { P.push('390 design ' + e.message.slice(0, 60)); }
    }
    if (vp.width === 1440) {
      const glass = async () => page.evaluate(() => [...document.querySelectorAll('[data-glass]')].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 40 && r.height > 20 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && cs.visibility !== 'hidden' && +cs.opacity > 0.5; }).map(e => {
        const cs = getComputedStyle(e), bf = cs.backdropFilter || cs.webkitBackdropFilter || '', m = /blur\(([\d.]+)px\)/.exec(bf), bg = cs.backgroundColor;
        let a = 1; if (bg === 'transparent') a = 0; else { const s = /\/\s*([\d.]+)\s*\)$/.exec(bg); if (s) a = +s[1]; else { const p = /rgba\(([^)]+)\)/.exec(bg); if (p) a = +p[1].split(',')[3]; } }
        return m && +m[1] >= 8 && a >= 0.08 && a <= 0.85;
      }).filter(Boolean).length);
      try {
        await page.goto(BASE + '#/'); await waitReady(page); await sleep(1000); const g1 = await glass();
        await page.goto(BASE + '#/design'); await waitReady(page); await sleep(1200); const g2 = await glass();
        rec('glass', g1 >= 1 && g2 >= 3, `合格毛玻璃面板：首页 ${g1}（≥1），设计器 ${g2}（≥3）`);
      } catch (e) { rec('glass', false, e.message.slice(0, 80)); }
      try {
        await page.goto(BASE + '#/'); await waitReady(page); await sleep(800);
        await clickT(page, 'lang'); await sleep(500);
        const l1 = await page.evaluate(() => document.documentElement.lang);
        const t1 = await page.locator(tid('lesson-card')).first().innerText().catch(() => '');
        await page.reload(); await waitReady(page); await sleep(800);
        const l2 = await page.evaluate(() => document.documentElement.lang);
        await clickT(page, 'lang'); await sleep(500); const l3 = await page.evaluate(() => document.documentElement.lang);
        const en0 = DATA.lessons && DATA.lessons[0] && DATA.lessons[0].title.en;
        rec('lang', l1 === 'en' && l2 === 'en' && l3 === 'zh-CN' && !!en0 && t1.includes(en0), `切换→${l1}，刷新后 ${l2}，再切→${l3}；首章卡片含英文标题 ${!!en0 && t1.includes(en0)}`);
      } catch (e) { rec('lang', false, e.message.slice(0, 80)); }
      try {
        await page.goto(BASE + '#/sources'); await waitReady(page); await sleep(800);
        const got = await page.locator(tid('source')).evaluateAll(es => es.map(e => [e.dataset.id, [...e.querySelectorAll('a')].map(a => a.href), e.innerText]));
        const miss = (DATA.mats || []).filter(m => m.price != null).filter(m => { const g = got.find(x => x[0] === m.id); return !g || !g[1].includes(m.source) || !g[2].includes(m.priceDate); }).map(m => m.id);
        rec('sources.page', (DATA.mats || []).length > 0 && miss.length === 0, miss.length ? '缺出处或日期：' + miss.slice(0, 8).join(',') : `${got.length} 条出处都带链接和日期`);
      } catch (e) { rec('sources.page', false, e.message.slice(0, 80)); }
    }
    await page.context().close();
  }
  rec('layout.hscroll', P.length === 0, P.slice(0, 6).join('；') || '3 种宽度 × 5 个页面都不横向滚动，390 宽设计器可用');
  rec('layout.testid', dup.length === 0, dup.length ? '重复 testid：' + dup.slice(0, 4).join('；') : 'testid 都唯一');
}

// ───── 主流程 ─────
async function runAll(sab = {}, groups = null) {
  results = []; G.errors = []; G.external = []; G.dialogs = [];
  const on = g => (!groups || groups.includes(g)) && want(g);
  let srv = null;
  if (urlArg) { BASE = urlArg.endsWith('/') ? urlArg : urlArg + '/'; HOST = new URL(BASE).host; }
  else { srv = await serve(); BASE = `http://127.0.0.1:${srv.address().port}${SUB}`; HOST = `127.0.0.1:${srv.address().port}`; }
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const G_ = [['data', gData], ['sources', gSources], ['home', gHome], ['design', gDesign], ['boq', gBoq], ['timeline', gTimeline], ['lessons', gLessons], ['layout', gLayout]];
  for (const [name, fn] of G_) {
    if (!on(name)) continue;
    if (name === 'sources' && urlArg) continue;
    if (name === 'data' && urlArg) {
      for (const f of ['materials', 'stages', 'lessons', 'sample']) {
        try { const b = Buffer.from(await (await fetch(`${BASE}data/${f}.json?t=${Date.now()}`)).arrayBuffer()); const l = fs.readFileSync(path.join(ROOT, `data/${f}.json`)); rec('online.' + f, b.equals(l), b.equals(l) ? '线上与本地逐字节相同' : `线上 ${b.length} 字节，本地 ${l.length}`); }
        catch (e) { rec('online.' + f, false, e.message.slice(0, 60)); }
      }
    }
    try { await fn(browser, sab); } catch (e) { rec(name + '.crash', false, e.message.slice(0, 150)); }
  }
  if (!groups || groups.some(g => g !== 'data' && g !== 'sources')) {
    rec('console', G.errors.length === 0, G.errors.length ? `${G.errors.length} 条报错：` + G.errors.slice(0, 3).join(' | ') : '控制台无报错');
    rec('net.external', G.external.length === 0, G.external.length ? '请求了外域：' + [...new Set(G.external)].slice(0, 3).join(' | ') : '没有外域请求');
    rec('dialog', G.dialogs.length === 0, G.dialogs.length ? '弹了原生对话框 ' + G.dialogs.join(',') : '没有原生对话框');
  }
  await browser.close(); if (srv) srv.close();
  return results;
}

const watchdog = setTimeout(() => { console.log('FAIL watchdog 判卷超时（正常 40 分钟 / --prove 120 分钟），强制退出'); process.exit(PROVE ? 2 : 1); }, (PROVE ? 120 : 40) * 60000);
if (!PROVE) {
  const r = await runAll();
  const f = r.filter(x => !x.ok);
  console.log(`\n${r.length - f.length}/${r.length} PASS${f.length ? '，FAIL：' + f.map(x => x.id).join(' ') : ''}`);
  clearTimeout(watchdog); process.exit(f.length ? 1 : 0);
} else {
  const SABS = [
    ['freeze', ['design'], ['design.material', 'design.orbit'], '画面冻结'],
    ['jank', ['design'], ['perf.orbit'], '每帧卡 28ms'],
    ['noorbit', ['design'], ['design.orbit'], '画布收不到拖动'],
    ['noundo', ['design'], ['design.undo'], '撤销重做失灵'],
    ['nopersist', ['design'], ['design.persist'], '每次打开清空存档'],
    ['boqlie', ['boq'], ['boq.wall'], '空心砖用量虚报 25%'],
    ['pricelie', ['sources'], ['src.price'], '改一个价格 +7 比索'],
    ['texfake', ['sources'], ['src.texture'], '贴图换成别的'],
    ['ext', ['home'], ['net.external'], '偷偷请求外域'],
    ['cerr', ['home'], ['console'], '控制台报错'],
    ['noglass', ['layout'], ['glass'], '去掉毛玻璃'],
    ['hscroll', ['layout'], ['layout.hscroll'], '页面撑出横向滚动'],
  ];
  let miss = 0;
  for (const [k, groups, ids, name] of SABS) {
    const r = await runAll({ [k]: true }, groups);
    const caught = r.filter(x => ids.includes(x.id) && !x.ok);
    console.log(`\n>>> 破坏「${name}」${caught.length ? '被抓到：' + caught.map(x => x.id).join(',') : '没被抓到！'}\n`);
    if (!caught.length) miss++;
  }
  console.log(miss ? `\n反向验证：${miss} 种破坏没被抓到 → 退出码 2` : `\n反向验证：${SABS.length} 种破坏全部被抓到 → 退出码 1`);
  clearTimeout(watchdog); process.exit(miss ? 2 : 1);
}
