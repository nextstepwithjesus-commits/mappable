/**
 * Снимки обеих проб (правило прототипов): 1280 × 800 и 360 × 640, светлая и тёмная тема.
 * Запуск из корня: `npx tsx prototypes/П-Т5/tests/shots.mts` (сначала соберите данные П-Т3).
 */
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('../..', import.meta.url));
const probes = [
  { dir: join(here, 'П-Т5'), path: '/genealogiya?p=noy&sel=eva&list=1', name: 'генеалогия-лист', prep: async () => {} },
  { dir: join(here, 'П-Т3'), path: '/', name: 'поиск-давида-и-саула', prep: async (p: import('playwright').Page) => { await p.waitForFunction('window.__probe'); await p.evaluate('window.__probe.textReady'); await p.fill('#q', 'Давида и Саула'); await p.waitForTimeout(800); } },
  { dir: join(here, 'П-Т3'), path: '/', name: 'поиск-мк-6-35', prep: async (p: import('playwright').Page) => { await p.waitForFunction('window.__probe'); await p.evaluate('window.__probe.textReady'); await p.fill('#q', 'Мк 6:35'); await p.waitForTimeout(800); } },
];
const browser = await chromium.launch();
for (const pr of probes) {
  await build({ configFile: join(pr.dir, 'vite.config.ts'), logLevel: 'warn' });
  const srv = await preview({ configFile: join(pr.dir, 'vite.config.ts') });
  const base = srv.resolvedUrls!.local[0].replace(/\/$/, '');
  for (const [w, h] of [[1280, 800], [360, 640]])
    for (const scheme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(base + pr.path);
      await page.waitForTimeout(500);
      await pr.prep(page);
      await page.screenshot({ path: join(pr.dir, 'снимки', `${pr.name}-${w}-${scheme}.png`) });
      await ctx.close();
    }
  srv.httpServer.close();
}
await browser.close();
process.exit(0);
