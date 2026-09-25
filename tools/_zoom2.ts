import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const [hash, vw, vh, clipS, out] = process.argv.slice(2);
const [x, y, w, h] = clipS.split(',').map(Number);
const server = spawn('npx', ['vite', 'preview', '--port', '4199', '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const ctx = await browser.newContext({ viewport: { width: +vw, height: +vh }, deviceScaleFactor: 3, isMobile: +vw < 600, hasTouch: +vw < 600 });
  const p = await ctx.newPage();
  await p.addInitScript(`localStorage.setItem('toledot:intro','true')`);
  await p.goto(`http://localhost:4199/${hash}`);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: out, clip: { x, y, width: w, height: h } });
} finally {
  await browser.close();
  try { process.kill(-server.pid!); } catch { /* */ }
}
