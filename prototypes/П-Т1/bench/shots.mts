/**
 * П-Т1: снимки 1280 × 800 и 360 × 640 в светлой и тёмной теме — вблизи (Давид выбран), издали (Canvas), текст 200 %.
 * Запуск из корня: `npx tsx prototypes/П-Т1/bench/shots.mts`. Снимки — prototypes/П-Т1/снимки/.
 */
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = root + 'снимки/';
mkdirSync(dir, { recursive: true });
await build({ configFile: root + 'vite.config.ts', logLevel: 'warn' });
const srv = await preview({ configFile: root + 'vite.config.ts' });
const url = srv.resolvedUrls!.local[0];
const b = await chromium.launch({ channel: 'chromium' });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (const [w, h, mobile] of [[1280, 800, false], [360, 640, true]] as const) {
  for (const theme of ['light', 'dark'] as const) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, colorScheme: theme });
    const page = await ctx.newPage();
    const name = (what: string) => `${dir}${w}-${theme === 'light' ? 'светлая' : 'тёмная'}-${what}.png`;
    await page.goto(url + '?at=david');
    await page.waitForFunction(() => (window as any).__probe);
    await page.evaluate(() => (window as any).__probe.ready);
    await page.evaluate(() => { const p = (window as any).__probe; p.centerOn('david', 1); p.select('david'); p.focus('david'); });
    await wait(300);
    await page.screenshot({ path: name('вблизи') });
    await page.evaluate(() => (window as any).__probe.centerOn('david', 0.12));
    await wait(300);
    await page.screenshot({ path: name('издали') });
    await page.evaluate(() => (window as any).__probe.fitAll());
    await wait(300);
    await page.screenshot({ path: name('весь-лес') });
    await page.evaluate(() => (window as any).__probe.relayout(2));
    await page.evaluate(() => { const p = (window as any).__probe; p.centerOn('david', 1); p.select('david'); });
    await wait(300);
    await page.screenshot({ path: name('текст-200') });
    await ctx.close();
  }
}
await b.close();
await srv.close();
console.log('снимки:', dir);
