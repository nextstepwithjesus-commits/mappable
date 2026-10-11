/**
 * Свой сервер на localhost для проверок прототипа: файлы проекта от корня (как задание CI «прототипы»), а для адресов внутри
 * сборки прототипа, которых нет файлом, — `dist/index.html` (адреса приложения — пути, 09 § 4.4.1).
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
export const BASE = '/prototypes/инструменты/dist/';
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

export function сервер(): Promise<{ origin: string; base: string; close: () => Promise<void> }> {
  const s = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) return void res.writeHead(403).end();
    if ((!existsSync(file) || statSync(file).isDirectory()) && path.startsWith(BASE)) file = join(ROOT, BASE, 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) =>
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const port = typeof a === 'object' && a ? a.port : 0;
      ok({ origin: `http://localhost:${port}`, base: encodeURI(BASE), close: () => new Promise((r) => s.close(() => r())) });
    }),
  );
}
