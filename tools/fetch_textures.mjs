// 从 Poly Haven 下载 Diffuse 1k 原图（按 md5 校验），缩成 512 webp 放 assets/tex/。用法：node tools/fetch_textures.mjs id id ...
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/73405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const sharp = require('sharp');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), CACHE = path.join(ROOT, 'tools/.cache/ph');
fs.mkdirSync(CACHE, { recursive: true });
for (const id of process.argv.slice(2)) {
  const f = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json(); const d = f.Diffuse['1k'].jpg;
  const src = path.join(CACHE, id + '.jpg');
  if (!fs.existsSync(src) || crypto.createHash('md5').update(fs.readFileSync(src)).digest('hex') !== d.md5) fs.writeFileSync(src, Buffer.from(await (await fetch(d.url)).arrayBuffer()));
  if (crypto.createHash('md5').update(fs.readFileSync(src)).digest('hex') !== d.md5) throw new Error('md5 不符 ' + id);
  const out = path.join(ROOT, 'assets/tex', id + '.webp');
  await sharp(src).resize(512, 512).webp({ quality: 82 }).toFile(out);
  console.log(id, fs.statSync(out).size);
}
