// 用真 Chrome 打开网页，把渲染后的页面文字存到 tools/.cache/<名字>.txt（找价格原文、核对课程出处用）
// 用法：node tools/pagetext.mjs 名字=网址 [名字=网址 ...]
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/73405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await b.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' });
for (const a of process.argv.slice(2)) {
  const i = a.indexOf('='), n = a.slice(0, i), u = a.slice(i + 1);
  try { const r = await p.goto(u, { timeout: 45000, waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
    const t = await p.evaluate(() => document.body.innerText); const links = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href + ' | ' + a.innerText.trim().slice(0, 80)).join('\n'));
    fs.writeFileSync(path.join(DIR, n + '.txt'), t); fs.writeFileSync(path.join(DIR, n + '.links.txt'), links); console.log(r.status(), n, t.length);
  } catch (e) { console.log('ERR', n, e.message.slice(0, 80)); }
}
await b.close();
