/**
 * П-Т3: замер поиска в браузере (09 § 7.2–7.3). Запуск из корня: `npx tsx prototypes/П-Т3/bench/run.mts`.
 * Собирает экран (vite build), поднимает vite preview, в Chromium с замедлением процессора ×1, ×4, ×6
 * (CDP Emulation.setCPUThrottlingRate) меряет: холодный старт текста всех 66 книг (загрузка, разбор, индекс,
 * первый запрос), ответ на каждый запрос набора 11 § 3.6 (в потоке и туда-обратно), INP при наборе в поле.
 * Итог — результаты/замер.json и сводка в консоль.
 */
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUERIES } from '../core/запросы.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(join(root, 'результаты'), { recursive: true });
await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'warn' });
const srv = await preview({ configFile: join(root, 'vite.config.ts') });
const base = srv.resolvedUrls!.local[0];
const browser = await chromium.launch();
const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
};
const RATES = (process.argv.find((a) => a.startsWith('--cpu='))?.slice(6) ?? '1,4,6').split(',').map(Number);
const RUNS = 3;
const out: Record<string, unknown> = { browser: `Chromium ${browser.version()}`, machine: process.arch, when: new Date().toISOString(), runs: {} };

const MODES = ['worker', 'main'] as const;
for (const mode of MODES)
for (const rate of RATES) {
  if (mode === 'worker' && rate !== 1) continue; // рабочий поток CDP не замедляет: ×4 и ×6 — только в главном потоке
  const colds: Record<string, number>[] = [];
  let work: number[] = [];
  let round: number[] = [];
  const inp: number[] = [];
  const sugMs: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.addInitScript(() => {
      (window as any).__ev = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as any[]) if (e.interactionId) (window as any).__ev.push({ name: e.name, d: e.duration, id: e.interactionId });
      }).observe({ type: 'event', durationThreshold: 16, buffered: true } as any);
    });
    await page.goto(mode === 'main' ? `${base}?main` : base);
    await page.waitForFunction(() => (window as any).__probe);
    const t = (await page.evaluate('window.__probe.textReady')) as Record<string, number>;
    colds.push(t);
    // ответ на запросы набора
    for (const q of QUERIES) {
      const r = (await page.evaluate((s) => (window as any).__probe.runQuery(s), q.q)) as { workerMs: number; roundMs: number };
      work.push(r.workerMs);
      round.push(r.roundMs);
    }
    // подсказки в главном потоке
    for (const s of ['Да', 'Дав', 'Мои', 'Ной', 'Lfd', 'Голи']) {
      const ms = (await page.evaluate((x) => {
        const a = performance.now();
        (window as any).__probe.suggest(x);
        return performance.now() - a;
      }, s)) as number;
      sugMs.push(ms);
    }
    // INP: набор по буквам, как человек (около 8 знаков в секунду)
    await page.evaluate(() => ((window as any).__ev = []));
    await page.click('#q');
    for (const s of ['Давида и Саула', 'Мк 6:35', 'пять хлебов', 'Галиаф']) {
      await page.fill('#q', '');
      await page.keyboard.type(s, { delay: 120 });
      await page.waitForTimeout(600);
    }
    const ev = (await page.evaluate('window.__ev')) as { name: string; d: number; id: number }[];
    const byId = new Map<number, number>();
    for (const e of ev) byId.set(e.id, Math.max(byId.get(e.id) ?? 0, e.d));
    inp.push(...byId.values());
    await ctx.close();
  }
  const avg = (k: string) => +(colds.reduce((a, c) => a + c[k], 0) / colds.length).toFixed(0);
  const worst = (k: string) => +Math.max(...colds.map((c) => c[k])).toFixed(0);
  const rep = {
    cold: { fetchMs: avg('fetchMs'), parseMs: avg('parseMs'), indexMs: avg('indexMs'), firstQueryMs: avg('firstQueryMs'), afterLoadMs: avg('parseMs') + avg('indexMs') + avg('firstQueryMs'), totalMs: avg('totalMs'), worstAfterLoadMs: Math.max(...colds.map((c) => c.parseMs + c.indexMs + c.firstQueryMs)).toFixed(0), worstTotalMs: worst('totalMs') },
    query: { n: work.length, workerP50: pct(work, 0.5), workerP95: pct(work, 0.95), workerMax: pct(work, 1), roundP95: pct(round, 0.95) },
    suggest: { p95: pct(sugMs, 0.95), max: pct(sugMs, 1) },
    inp: { interactions: inp.length, p75: inp.length ? pct(inp, 0.75) : 0, max: inp.length ? pct(inp, 1) : 0, note: 'длительности событий ≥ 16 мс (Event Timing); меньшие не попадают — это значит ≤ 16 мс' },
  };
  (out.runs as Record<string, unknown>)[`${mode}-x${rate}`] = rep;
  console.log(`${mode} ×${rate}`, JSON.stringify(rep));
}
writeFileSync(join(root, 'результаты', 'замер.json'), JSON.stringify(out, null, 1));
await browser.close();
srv.httpServer.close();
process.exit(0);
