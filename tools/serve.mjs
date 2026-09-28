// 本地预览服务器：站点挂在 /villa-lab/（和 GitHub Pages 一样）。用法：node tools/serve.mjs [端口，默认 4480]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = +(process.argv[2] || 4480);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer((q, s) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (!u.startsWith('/villa-lab/')) { s.writeHead(302, { location: '/villa-lab/' }); return s.end(); }
  let f = path.join(ROOT, u.slice(11)); if (!f.startsWith(ROOT)) { s.writeHead(403); return s.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { s.writeHead(404); return s.end('404'); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(s);
}).listen(PORT, () => console.log(`http://127.0.0.1:${PORT}/villa-lab/`));
