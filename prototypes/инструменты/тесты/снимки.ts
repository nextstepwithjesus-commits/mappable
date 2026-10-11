/**
 * Снимки сцен и замеры (08 § 10.3 п. 1; правило прототипов): 1280 × 800 и 360 × 640, обе темы; верх первого стиха страницы
 * истории (бюджет 300 px, 11 § 4.1; Л-д1) на 1280 × 720, 1024 × 768, 360 × 560 — с плашкой пробы и без неё; ошибки JS;
 * горизонтальная прокрутка; ключи записей на экране → опись сцен `<инструмент>/сцены.json` (10 § 3.3).
 *
 *   npx vite build --config prototypes/инструменты/vite.config.ts   (после npm run -s proto:data)
 *   npx tsx prototypes/инструменты/тесты/снимки.ts [--только 1.3]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { СЦЕНЫ } from './сцены.ts';
import { сервер } from './сервер.ts';

const HERE = join(import.meta.dirname, '..');
const OUT = join(HERE, 'снимки');
const argv = process.argv.slice(2);
const ТОЛЬКО = argv.includes('--только') ? argv[argv.indexOf('--только') + 1] : undefined;
mkdirSync(OUT, { recursive: true });

const ОКНА = [
  { имя: '1280', w: 1280, h: 800 },
  { имя: '360', w: 360, h: 640 },
];
const ТЕМЫ = ['light', 'dark'] as const;

async function готово(p: Page) {
  await p.waitForFunction(() => document.documentElement.dataset.готово === '1', null, { timeout: 30000 });
  await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(250);
}

/** Верх первого стиха страницы истории от верха окна (px): без прокрутки, с плашкой и без. */
async function верхСтиха(p: Page): Promise<{ сПлашкой: number; безПлашки: number } | null> {
  return p.evaluate(() => {
    const v = document.querySelector('.части .стих, .вкладки + [role="tabpanel"] .стих');
    if (!v) return null;
    const top = v.getBoundingClientRect().top + scrollY;
    const pl = document.querySelector('.плашка-пробы-полоса');
    const h = pl ? pl.getBoundingClientRect().height : 0;
    return { сПлашкой: Math.round(top), безПлашки: Math.round(top - h) };
  });
}

async function main() {
  const { origin, base, close } = await сервер();
  const browser = await chromium.launch();
  const итог: { сцена: string; окно: string; тема: string; ошибки: string[]; прокрутка: number; верх?: { сПлашкой: number; безПлашки: number } | null }[] = [];
  const опись: Record<string, Record<string, string[]>> = {};
  const бюджет: Record<string, unknown>[] = [];
  for (const sc of СЦЕНЫ) {
    if (ТОЛЬКО && sc.n !== ТОЛЬКО) continue;
    for (const o of ОКНА)
      for (const t of ТЕМЫ) {
        const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h }, colorScheme: t, ...(o.w < 600 && { isMobile: true, hasTouch: true }) });
        const p = await ctx.newPage();
        const ошибки: string[] = [];
        p.on('pageerror', (e) => ошибки.push(String(e)));
        p.on('console', (m) => m.type() === 'error' && ошибки.push(m.text()));
        const sep = sc.адрес.includes('?') ? '&' : '?';
        await p.goto(`${origin}${base}${sc.адрес}${sep}theme=${t}&age=null`);
        await готово(p);
        const прокрутка = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        const верх = sc.адрес.startsWith('istoriya') ? await верхСтиха(p) : undefined;
        await p.screenshot({ path: join(OUT, `${sc.n}-${o.имя}-${t === 'light' ? 'светлая' : 'тёмная'}.png`) });
        if (o.имя === '1280' && t === 'light') await p.screenshot({ path: join(OUT, `${sc.n}-${o.имя}-весь.png`), fullPage: true });
        if (!sc.обзор && o.имя === '1280' && t === 'light') {
          const keys = await p.evaluate(() => [...new Set([...document.querySelectorAll('[data-key]')].flatMap((e) => (e.getAttribute('data-key') ?? '').split(' ').filter(Boolean)))].sort());
          (опись[sc.инструмент] ??= {})[`/${sc.адрес}`] = keys;
        }
        итог.push({ сцена: sc.n, окно: o.имя, тема: t, ошибки, прокрутка, верх });
        await ctx.close();
      }
  }
  // бюджет над первым стихом — опорные окна 08 и 1024 (Л-д1)
  for (const id of ['e-noy-i-potop', 'e-david-i-goliaf', 'e-rasslablennogo-spuskayut-cherez-krovlyu', 'e-umer-samuil']) {
    for (const [w, h] of [[1280, 720], [1024, 768], [360, 560]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 600 && { isMobile: true, hasTouch: true }) });
      const p = await ctx.newPage();
      await p.goto(`${origin}${base}istoriya/${id}?age=null`);
      await готово(p);
      бюджет.push({ история: id, окно: `${w}×${h}`, ...(await верхСтиха(p)) });
      await ctx.close();
    }
  }
  await browser.close();
  await close();
  if (!ТОЛЬКО) for (const [инстр, сцены] of Object.entries(опись)) {
    mkdirSync(join(HERE, инстр), { recursive: true });
    writeFileSync(join(HERE, инстр, 'сцены.json'), `${JSON.stringify(сцены, null, 1)}\n`);
  }
  writeFileSync(join(OUT, 'проверки.json'), `${JSON.stringify({ итог, бюджет }, null, 1)}\n`);
  const плохо = итог.filter((x) => x.ошибки.length || x.прокрутка > 0);
  for (const x of плохо) console.log(`!! ${x.сцена} ${x.окно} ${x.тема}: ошибок ${x.ошибки.length}${x.ошибки[0] ? ` (${x.ошибки[0].slice(0, 120)})` : ''}; прокрутка ${x.прокрутка}`);
  for (const b of бюджет) console.log('бюджет', JSON.stringify(b));
  console.log(`снимков: ${итог.length}; с ошибками или прокруткой: ${плохо.length}`);
}
void main();
