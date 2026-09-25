/**
 * Снимки экрана для визуальной проверки (ТЗ § 10): сценарии § 11.2 и маршрут #/specimen,
 * в обеих темах и на трёх ширинах. Перед запуском: npm run build.
 *   npm run shots [-- --only atlas]
 */
import { chromium, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bible.ts';

const OUT = join(ROOT, 'docs/screens');
mkdirSync(OUT, { recursive: true });
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const PORT = 4179;

async function main() {
  // сервер — в своей группе процессов: kill(-pid) гасит и npx, и сам vite (иначе он переживает скрипт и держит порт)
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath: exe });
  const errors: string[] = [];
  const shot = async (name: string, width: number, height: number, theme: 'night' | 'day', act: (p: Page) => Promise<void>) => {
    if (only && !name.includes(only)) return;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    await page.addInitScript((t) => {
      localStorage.setItem('toledot:theme', JSON.stringify(t));
    }, theme);
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1800);
    await act(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, `${name}-${theme}-${width}.png`) });
    await ctx.close();
  };
  const select = async (p: Page, q: string) => {
    await p.fill('#find', q);
    await p.waitForTimeout(250);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(1600);
  };
  for (const theme of ['night', 'day'] as const) {
    for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]] as const) {
      await shot('01-overview', w, h, theme, async () => {});
      await shot('02-david', w, h, theme, async (p) => select(p, 'Давид'));
    }
    await shot('03-lines', 1440, 900, theme, async (p) => {
      await p.click('text=только линии Мессии');
    });
    await shot('04-epochs', 1440, 900, theme, async (p) => {
      await select(p, 'Авраам');
      await p.click('.commands >> text=Эпохи');
    });
    await shot('07-tiers', 1440, 900, theme, async (p) => {
      await select(p, 'Авраам');
      await p.click('.commands >> text=Эпохи');
      await p.click('.sheet .close');
    });
    await shot('08-spread', 1440, 900, theme, async (p) => {
      await select(p, 'Авраам');
      await p.click('.folio .actions >> text=Разворот с…');
      await select(p, 'Исаак');
    });
    await shot('05-synopsis', 1440, 900, theme, async (p) => {
      await p.click('.commands >> text=Синопсис');
    });
    for (const [i, cmd] of (['Указатель', 'Главы', 'Сквозной раздел', 'Условные знаки', 'О карте'] as const).entries()) {
      await shot(`09-panel-${i + 1}`, 1440, 900, theme, async (p) => {
        await select(p, 'Давид');
        await p.locator('.commands').getByText(cmd, { exact: true }).click();
        await p.waitForTimeout(700);
      });
    }
    await shot('06-specimen', 1200, 1400, theme, async (p) => {
      await p.goto(`http://localhost:${PORT}/#/specimen`);
      await p.waitForTimeout(800);
    });
  }
  await browser.close();
  process.kill(-server.pid!);
  if (errors.length) {
    console.log('Ошибки страницы:\n' + [...new Set(errors)].join('\n'));
    process.exitCode = 1;
  } else console.log(`Снимки: ${OUT}`);
}
main();
