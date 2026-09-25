/**
 * Замер быстродействия (ТЗ NFR-1): первый показ неба < 2,5 с и 60 кадров/с при панорамировании.
 * Собирает атлас с синтетическими лицами до N (по умолчанию 5 000) в отдельный каталог, открывает его
 * в Chromium, 4 секунды водит небо указателем и считает длительности кадров. Затем восстанавливает
 * обычную сборку данных.
 *   npm run -s perf              — 5 000 лиц
 *   npm run -s perf -- 2000      — другое число
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from './bible.ts';

const N = Number(process.argv[2] ?? 5000);
const PORT = 4181;
const OUT = 'dist-perf';

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] }).toString();

async function main() {
  console.log(run('npx', ['tsx', 'tools/build-data.ts', '--synthetic', String(N)]).split('\n').filter((l) => /синтет|atlas/.test(l)).join('\n'));
  run('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir']);
  const server = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath: exe });
  const results: string[] = [];
  try {
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w > 500 ? 1 : 3 });
      const page = await ctx.newPage();
      await page.addInitScript("localStorage.setItem('toledot:intro', 'true')");
      await page.goto(`http://localhost:${PORT}/`);
      await page.waitForFunction("performance.getEntriesByName('sky-first-frame').length > 0", null, { timeout: 30000 });
      const first = (await page.evaluate("performance.getEntriesByName('sky-first-frame')[0].startTime")) as number;
      await page.waitForTimeout(800);
      // приблизить к насыщенной части неба, затем водить указателем 4 с
      const box = (await page.locator('canvas').first().boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
      await page.waitForTimeout(600);
      // код для страницы передаётся строкой: tsx добавляет в функции служебный __name, которого в браузере нет
      await page.evaluate(`(() => {
        window.__frames = [];
        const loop = (t) => { window.__frames.push(t); if (window.__frames.length < 100000) requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      })()`);
      await page.mouse.down();
      const t0 = Date.now();
      let k = 0;
      while (Date.now() - t0 < 4000) {
        k++;
        await page.mouse.move(cx + Math.sin(k / 12) * box.width * 0.3, cy + Math.cos(k / 17) * box.height * 0.2);
        await page.waitForTimeout(8);
      }
      await page.mouse.up();
      const frames = (await page.evaluate('window.__frames')) as number[];
      const d = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
      const q = (p: number) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
      const fps = (1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1);
      results.push(`| ${w}×${h} | ${N} | ${first.toFixed(0)} мс | ${fps} | ${q(0.5).toFixed(1)} мс | ${q(0.95).toFixed(1)} мс | ${d[d.length - 1].toFixed(1)} мс |`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    try { process.kill(-server.pid!); } catch { /* уже остановлен */ } // вся группа: npx и vite
    run('npx', ['tsx', 'tools/build-data.ts']);
  }
  const table = ['| Экран | Лиц | Первый кадр неба | Кадров/с при панорамировании | Медиана кадра | 95-й процентиль | Худший кадр |', '|---|---|---|---|---|---|---|', ...results];
  console.log(table.join('\n'));
  // разделы «## …» после таблицы пишутся вручную и при новом замере сохраняются
  const out = join(ROOT, 'docs/perf.md');
  const prev = existsSync(out) ? readFileSync(out, 'utf8') : '';
  const notes = prev.includes('\n## ') ? prev.slice(prev.indexOf('\n## ')) : '';
  writeFileSync(
    out,
    `# Замер быстродействия (NFR-1)\n\nChromium без аппаратного ускорения в облачном контейнере, ${new Date().toISOString().slice(0, 10)}. Команда: \`npm run -s perf\`.\n\n${table.join('\n')}\n${notes}`,
  );
}
main();
