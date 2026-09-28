// 调试用：无头 Chrome 打开页面，打印控制台报错、ready 耗时，截图到 shots/debug-*.png
// 用法：node tools/shot.mjs '#/design' [宽x高] [js 表达式...]
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/73405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [route = '#/', size = '1440x900', ...evals] = process.argv.slice(2); const [w, h] = size.split('x').map(Number);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 300)); });
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
const t0 = Date.now(); await p.goto('http://127.0.0.1:4480/villa-lab/' + route);
let ok = false; for (let i = 0; i < 100 && !ok; i++) { ok = await p.evaluate(() => !!(window.__villa && window.__villa.ready)).catch(() => false); if (!ok) await p.waitForTimeout(100); }
console.log('ready', ok, Date.now() - t0, 'ms');
await p.waitForTimeout(1500);
for (const e of evals) { try { console.log('>', e, '=>', JSON.stringify(await p.evaluate(e)).slice(0, 800)); } catch (x) { console.log('> ERR', x.message.slice(0, 200)); } await p.waitForTimeout(700); }
fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true });
const f = path.join(ROOT, 'shots', `debug-${route.replace(/[^a-z0-9]+/gi, '_')}-${w}.png`); await p.screenshot({ path: f }); console.log('shot', f);
await b.close();
