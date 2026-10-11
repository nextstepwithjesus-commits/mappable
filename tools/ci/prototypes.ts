/**
 * Задание CI «прототипы» (10 § 4.0.1 п. 4; 09 § 8.1, § 8.3): Playwright (Chromium) по экранам прототипов — без ошибок JS,
 * без горизонтальной прокрутки, фокус с клавиатуры виден, ни одного запроса в сеть (09 § 11, § 16 п. 11), axe-core
 * WCAG 2.2 A и AA — 0 нарушений; снимки 360 и 1 280 px в обеих темах — в папку артефакта.
 *
 *   npx tsx tools/ci/prototypes.ts [--out dist-ci/прототипы] [--only <экран>]
 *
 * Сейчас прототип один — лист-образец (08 ред. 3.3, принят В-31). Прототипы инструментов (prototypes/инструменты/<инструмент>/)
 * добавляются в список PAGES, когда появятся; сценарии 08 § 6.5 («Назад», уровни истории) — вместе с ними.
 */
import { chromium, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const val = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const OUT = resolve(val('--out') ?? join(ROOT, 'dist-ci', 'прототипы'));
const ONLY = val('--only');

/** Экраны прототипов: папка, файл, параметры. */
export const PAGES: { dir: string; page: string; q: string }[] = ['лист', 'главная', 'каталог', 'история', 'карточка', 'настройки'].map((s) => ({
  dir: 'prototypes/лист-образец', page: `${s}.html`, q: 'panel=0',
}));
const SIZES: [number, number][] = [[1280, 800], [360, 640]];
const THEMES = ['light', 'dark'] as const;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface Fail { where: string; what: string }

async function checkFocus(p: Page): Promise<string | null> {
  await p.keyboard.press('Tab');
  return p.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    if (!e || e === document.body) return 'Tab не перевёл фокус';
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return `фокус на невидимом элементе ${e.tagName}`;
    const s = getComputedStyle(e);
    const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
    return ring ? null : `у ${e.tagName}.${e.className} нет видимого кольца фокуса`;
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const fails: Fail[] = [];
  const log: Record<string, unknown>[] = [];
  for (const pg of PAGES) {
    if (ONLY && !pg.page.startsWith(ONLY)) continue;
    for (const [w, h] of SIZES) for (const theme of THEMES) {
      const where = `${pg.dir}/${pg.page} ${w} ${theme}`;
      const mobile = w < 600;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, hasTouch: mobile, isMobile: mobile });
      const p = await ctx.newPage();
      const net: string[] = [];
      // без сети: любой запрос не к своим файлам — нарушение приватности (09 § 11) и работы без сети
      await ctx.route(/^(?!file:)/, (route) => {
        net.push(route.request().url());
        return route.abort();
      });
      const errors: string[] = [];
      p.on('pageerror', (e) => errors.push(String(e)));
      p.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      const url = pathToFileURL(join(ROOT, pg.dir, pg.page)).href + `?${pg.q}&theme=${theme}`;
      await p.goto(url, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(200);
      const name = `${pg.page.replace(/\.html$/, '')}-${w}-${theme === 'light' ? 'светлая' : 'тёмная'}`;
      await p.screenshot({ path: join(OUT, `${name}.png`) });
      const scroll = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (scroll > 0) fails.push({ where, what: `горизонтальная прокрутка ${scroll} px` });
      for (const e of errors) fails.push({ where, what: `ошибка JS: ${e.slice(0, 200)}` });
      for (const u of net) fails.push({ where, what: `запрос в сеть: ${u}` });
      const axe = await new AxeBuilder({ page: p }).withTags(AXE_TAGS).analyze();
      for (const v of axe.violations) fails.push({ where, what: `axe ${v.id}: ${v.nodes.length} узл., например ${v.nodes[0]?.target.join(' ')}` });
      const focus = await checkFocus(p);
      if (focus) fails.push({ where, what: focus });
      log.push({ where, axe: axe.violations.length, incomplete: axe.incomplete.length, scroll, errors: errors.length, net: net.length, focus: focus ?? 'ок' });
      await ctx.close();
    }
  }
  await browser.close();
  writeFileSync(join(OUT, 'итог.json'), JSON.stringify({ fails, log }, null, 1));
  console.log(`прототипы: состояний ${log.length}, нарушений ${fails.length}; снимки и итог — ${OUT}`);
  for (const f of fails) console.error(`!! ${f.where}: ${f.what}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`!! ${(e as Error).stack ?? e}`);
  process.exit(1);
});
