// Отладка якоря: построчный журнал шагов щипка (k, ошибка x, y, разница камеры и прокрутки браузера).
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
await build({ configFile: root + 'vite.config.ts', logLevel: 'warn' });
const srv = await preview({ configFile: root + 'vite.config.ts' });
const b = await chromium.launch({ channel: 'chromium' });
for (const [text, mobile] of [[1, true], [2, true], [1, false]] as const) {
  const ctx = await b.newContext({ viewport: mobile ? { width: 360, height: 640 } : { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(srv.resolvedUrls!.local[0] + `?text=${text}`);
  await page.waitForFunction(() => (window as any).__probe);
  await page.evaluate(() => (window as any).__probe.ready);
  await page.evaluate(() => (window as any).__probe.centerOn('david', 1)); await new Promise((r) => setTimeout(r, 200));
  const g = await page.evaluate(() => (window as any).__probe.startAnchor('david'));
  await cdp.send('Input.synthesizePinchGesture', { x: g.x, y: g.y, scaleFactor: 2.2, relativeSpeed: 400, gestureSourceType: mobile ? 'touch' : 'mouse' });
  await cdp.send('Input.synthesizePinchGesture', { x: g.x, y: g.y, scaleFactor: 0.25, relativeSpeed: 400, gestureSourceType: mobile ? 'touch' : 'mouse' });
  await new Promise((r) => setTimeout(r, 300));
  const a = await page.evaluate(() => (window as any).__probe.anchor());
  console.log('text', text, 'mobile', mobile, 'focal', a.maxFocal.toFixed(2), 'glyph', a.maxGlyph.toFixed(2), 'k', await page.evaluate(() => (window as any).__probe.state().k), JSON.stringify(g), 'steps', a.steps);
  const worst = [...a.log].sort((x: number[], y: number[]) => Math.hypot(y[0], y[1]) - Math.hypot(x[0], x[1])).slice(0, 6);
  console.log(' worst', JSON.stringify(worst), '\n first', JSON.stringify(a.log.slice(0, 4)), '\n last', JSON.stringify(a.log.slice(-3)));
  await ctx.close();
}
await b.close(); await srv.close();
