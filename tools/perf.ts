/**
 * Замер быстродействия (ТЗ NFR-1): первый показ неба < 2,5 с и 60 кадров/с при панорамировании.
 * Сначала — данные атласа на масштабе семьи (1440×900, плотность 2×); затем атлас с синтетическими лицами до N (по
 * умолчанию 5 000): 4 секунды водит небо указателем и считает кадры, в которых окно сдвинулось, и занятость главного
 * потока на одно движение. Затем восстанавливает обычную сборку данных.
 *   npm run -s perf              — 5 000 лиц
 *   npm run -s perf -- 2000      — другое число
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ROOT } from './bible.ts';

const N = Number(process.argv[2] ?? 5000);
const PORT = 4181;
const OUT = 'dist-perf';

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] }).toString();

/**
 * Протяжка 4 с: кадры, в которых окно неба сдвинулось (интервал до предыдущего кадра), и занятость главного потока на
 * одно движение указателя (задачи страницы, CDP Performance). Пустые кадры между событиями указателя не считаются:
 * прежний замер считал все кадры и при ~20 событиях в секунду показывал «60 кадров/с» (рецензия 3 октября).
 */
async function measure(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const busy = async () => ((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.find((m) => m.name === 'TaskDuration')!.value;
  // код для страницы передаётся строкой: tsx добавляет в функции служебный __name, которого в браузере нет
  await page.evaluate(`(() => {
    window.__frames = [];
    const sky = document.querySelector('.sky');
    let last = null;
    const loop = (t) => {
      const v = sky ? sky.getAttribute('data-view') : '';
      window.__frames.push([t, v !== last ? 1 : 0]);
      last = v;
      if (window.__frames.length < 100000) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  })()`);
  await page.mouse.down();
  const b0 = await busy();
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < 4000) {
    k++;
    await page.mouse.move(cx + Math.sin(k / 12) * box.width * 0.3, cy + Math.cos(k / 17) * box.height * 0.2);
  }
  const b1 = await busy();
  await page.mouse.up();
  const frames = (await page.evaluate('window.__frames')) as [number, number][];
  const d = frames
    .slice(1)
    .map(([t, moved], i) => (moved ? t - frames[i][0] : -1))
    .filter((x) => x >= 0)
    .sort((a, b) => a - b);
  const q = (p: number) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
  const fps = 1000 / (d.reduce((a, b) => a + b, 0) / d.length);
  return { fps, q50: q(0.5), q95: q(0.95), max: d[d.length - 1], perMove: ((b1 - b0) * 1000) / k };
}

async function main() {
  const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const results: string[] = [];
  const row = (label: string, n: string, first: string, m: Awaited<ReturnType<typeof measure>>) =>
    results.push(`| ${label} | ${n} | ${first} | ${m.fps.toFixed(1)} | ${m.q50.toFixed(1)} мс | ${m.q95.toFixed(1)} мс | ${m.max.toFixed(1)} мс | ${m.perMove.toFixed(1)} мс |`);
  // настоящие данные, масштаб семьи, ноутбук с экраном высокой плотности (как у владельца)
  {
    run('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir']);
    const server = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
    await new Promise((r) => setTimeout(r, 2500));
    const browser = await chromium.launch({ executablePath: exe });
    try {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
      const page = await ctx.newPage();
      await page.addInitScript("localStorage.setItem('toledot:intro', 'true'); localStorage.setItem('toledot:probes', 'off')");
      await page.goto(`http://localhost:${PORT}/#/~y-1900~w150~l-2~s1`);
      await page.waitForFunction("performance.getEntriesByName('sky-first-frame').length > 0", null, { timeout: 30000 });
      const first = (await page.evaluate("performance.getEntriesByName('sky-first-frame')[0].startTime")) as number;
      await page.waitForTimeout(1500);
      const box = (await page.locator('canvas').first().boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(600);
      row('1440×900, 2×, данные атласа, масштаб семьи', 'все', `${first.toFixed(0)} мс`, await measure(page, box));
      await ctx.close();
    } finally {
      await browser.close();
      try { process.kill(-server.pid!); } catch { /* уже остановлен */ }
    }
  }
  console.log(run('npx', ['tsx', 'tools/build-data.ts', '--synthetic', String(N)]).split('\n').filter((l) => /синтет|atlas/.test(l)).join('\n'));
  run('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir']);
  const server = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: exe });
  try {
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w > 500 ? 1 : 3, colorScheme: 'dark' });
      const page = await ctx.newPage();
      // проверочные метки кадра (src/render/sky.ts, probes) нужны только сценариям приёмки: у читателя их нет,
      // и замер идёт так же, как небо работает у читателя
      await page.addInitScript("localStorage.setItem('toledot:intro', 'true'); localStorage.setItem('toledot:probes', 'off')");
      await page.goto(`http://localhost:${PORT}/`);
      await page.waitForFunction("performance.getEntriesByName('sky-first-frame').length > 0", null, { timeout: 30000 });
      const first = (await page.evaluate("performance.getEntriesByName('sky-first-frame')[0].startTime")) as number;
      await page.waitForTimeout(800);
      // приблизить к насыщенной части неба, затем водить указателем 4 с
      const box = (await page.locator('canvas').first().boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
      await page.waitForTimeout(1200);
      row(`${w}×${h}${w > 500 ? '' : ', 3×'}, синтетические лица`, String(N), `${first.toFixed(0)} мс`, await measure(page, box));
      await ctx.close();
    }
  } finally {
    await browser.close();
    try { process.kill(-server.pid!); } catch { /* уже остановлен */ } // вся группа: npx и vite
    run('npx', ['tsx', 'tools/build-data.ts']);
  }
  const table = ['| Экран и данные | Лиц | Первый кадр неба | Кадров/с при протяжке | Медиана кадра | 95-й процентиль | Худший кадр | Главный поток на движение |', '|---|---|---|---|---|---|---|---|', ...results];
  console.log(table.join('\n'));
  // разделы «## …» после таблицы пишутся вручную и при новом замере сохраняются
  const out = join(ROOT, 'docs/perf.md');
  const prev = existsSync(out) ? readFileSync(out, 'utf8') : '';
  const notes = prev.includes('\n## ') ? prev.slice(prev.indexOf('\n## ')) : '';
  writeFileSync(
    out,
    `# Замер быстродействия (NFR-1)\n\nChromium без аппаратного ускорения в облачном контейнере, ${new Date().toISOString().slice(0, 10)}. Команда: \`npm run -s perf\`. Кадры — только те, в которых окно неба сдвинулось; «главный поток на движение» — занятость страницы на одно движение указателя.\n\n${table.join('\n')}\n${notes}`,
  );
}
main();
