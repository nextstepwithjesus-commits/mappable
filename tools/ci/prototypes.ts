/**
 * Задание CI «прототипы» (10 § 4.0.1 п. 4; 09 § 8.1, § 8.3): Playwright (Chromium) по экранам прототипов и стенду токенов.
 * Страницы открываются через свой сервер на localhost — как будет работать прототип на данных, который грузит пакеты `fetch`
 * (рецензия интерфейса на ядро, № 15); любой запрос не к своему адресу обрывается и считается нарушением (09 § 11, § 16 п. 11).
 *
 * Проверки в каждом состоянии: без ошибок JS, без горизонтальной прокрутки, axe-core WCAG 2.2 A и AA — 0 нарушений, проход Tab
 * по странице — фокус переходит на разные видимые элементы и у каждого видно кольцо. Состояния (08 § 3.4, § 6.3):
 * опорные окна 1 280 × 720 и 360 × 560, ширины 1 024 и 768, 320 px (WCAG 1.4.10), обе темы на опорных окнах; на 1 280 и 360 —
 * „Самый крупный“ размер текста; 200 % (окно 640 × 360 при плотности 2); `forced-colors`; „Без движения“. На стенде токенов —
 * проверка, что „Крупнее“ увеличивает кегль на 12,5 % (кегли в rem). Снимки — в папку артефакта.
 *
 *   npx tsx tools/ci/prototypes.ts [--out dist-ci/прототипы] [--only <экран>]
 */
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const val = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const OUT = resolve(val('--out') ?? join(ROOT, 'dist-ci', 'прототипы'));
const ONLY = val('--only');

/** Экраны: лист-образец (08 ред. 3.3, В-31) и стенд токенов; прототипы инструментов добавляются сюда, когда появятся. */
export const PAGES: { dir: string; page: string; q: string; stand?: boolean }[] = [
  ...['лист', 'главная', 'каталог', 'история', 'карточка', 'настройки'].map((s) => ({ dir: 'prototypes/лист-образец', page: `${s}.html`, q: 'panel=0' })),
  { dir: 'prototypes/стенд-токенов', page: 'index.html', q: '', stand: true },
];

interface Variant { name: string; ctx: BrowserContextOptions; q?: string }
const V = (name: string, w: number, h: number, extra: Partial<BrowserContextOptions> = {}, q?: string): Variant => ({
  name, ctx: { viewport: { width: w, height: h }, ...(w < 600 && { isMobile: true, hasTouch: true }), ...extra }, ...(q && { q }),
});
export const VARIANTS: Variant[] = [
  V('1280x720-светлая', 1280, 720, { colorScheme: 'light' }),
  V('1280x720-тёмная', 1280, 720, { colorScheme: 'dark' }, 'theme=dark'),
  V('1024-светлая', 1024, 768, { colorScheme: 'light' }),
  V('768-светлая', 768, 1024, { colorScheme: 'light' }),
  V('360x560-светлая', 360, 560, { colorScheme: 'light' }),
  V('360x560-тёмная', 360, 560, { colorScheme: 'dark' }, 'theme=dark'),
  V('320-светлая', 320, 568, { colorScheme: 'light' }),
  V('1280-самый-крупный', 1280, 720, { colorScheme: 'light' }, 'text=самый'),
  V('360-самый-крупный', 360, 560, { colorScheme: 'light' }, 'text=самый'),
  V('200-процентов', 640, 360, { colorScheme: 'light', deviceScaleFactor: 2 }),
  V('forced-colors', 1280, 720, { colorScheme: 'light', forcedColors: 'active' }),
  V('без-движения', 1280, 720, { colorScheme: 'light', reducedMotion: 'reduce' }),
];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

/** Свой статический сервер на localhost: только файлы проекта. */
function serve(): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => {
    const a = server.address();
    ok({ server, origin: `http://localhost:${typeof a === 'object' && a ? a.port : 0}` });
  }));
}

interface Fail { where: string; what: string }

/** Код страницы строкой: сборщик tsx не вставляет в него свои помощники (`__name`). */
const FOCUS_JS = `(() => {
  const e = document.activeElement;
  if (!e || e === document.body) return { end: true, id: '', bad: '' };
  const b = e.getBoundingClientRect();
  // кольцо — у самого элемента, у его ::before / ::after (растянутая ссылка строки) или у предка с :focus-within (рамка кадра)
  const has = (st) => (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) || (st.boxShadow !== 'none' && st.boxShadow !== '');
  let ring = has(getComputedStyle(e)) || has(getComputedStyle(e, '::before')) || has(getComputedStyle(e, '::after'));
  for (let a = e.parentElement, k = 0; !ring && a && k < 3; a = a.parentElement, k++) ring = has(getComputedStyle(a)) || has(getComputedStyle(a, '::before')) || has(getComputedStyle(a, '::after'));
  const id = e.tagName + '#' + e.id + '.' + e.className + ':' + Math.round(b.x) + ',' + Math.round(b.y + scrollY) + ':' + (e.textContent || '').slice(0, 20);
  return { end: false, id, bad: !b.width || !b.height ? 'фокус на невидимом элементе ' + e.tagName + '.' + e.className : ring ? '' : 'у ' + e.tagName + '.' + e.className + ' нет видимого кольца фокуса' };
})()`;

/** Проход Tab: до 40 нажатий; фокус — на видимых разных элементах, у каждого видно кольцо. */
async function tabWalk(p: Page): Promise<string | null> {
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    await p.keyboard.press('Tab');
    const r = (await p.evaluate(FOCUS_JS)) as { end: boolean; id: string; bad: string };
    if (r.end) break;
    if (r.bad) return r.bad;
    if (seen.includes(r.id)) break; // круг пройден
    seen.push(r.id);
  }
  return seen.length ? null : 'Tab не перевёл фокус';
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { server, origin } = await serve();
  const browser = await chromium.launch();
  const fails: Fail[] = [];
  const log: Record<string, unknown>[] = [];
  for (const pg of PAGES) {
    if (ONLY && !pg.page.startsWith(ONLY) && !pg.dir.includes(ONLY)) continue;
    for (const v of VARIANTS) {
      const where = `${pg.dir}/${pg.page} ${v.name}`;
      const ctx = await browser.newContext(v.ctx);
      const p = await ctx.newPage();
      const net: string[] = [];
      await ctx.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith(origin + '/')) return route.continue();
        net.push(u);
        return route.abort();
      });
      const errors: string[] = [];
      p.on('pageerror', (e) => errors.push(String(e)));
      p.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      const q = [pg.q, v.q].filter(Boolean).join('&');
      await p.goto(`${origin}/${pg.dir}/${pg.page}${q ? `?${q}` : ''}`, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(150);
      const name = `${pg.dir.split('/').pop()}-${pg.page.replace(/\.html$/, '')}-${v.name}`;
      await p.screenshot({ path: join(OUT, `${name}.png`) });
      const scroll = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (scroll > 0) fails.push({ where, what: `горизонтальная прокрутка ${scroll} px` });
      for (const e of errors) fails.push({ where, what: `ошибка JS: ${e.slice(0, 200)}` });
      for (const u of net) fails.push({ where, what: `запрос в сеть: ${u}` });
      // в forced-colors цвета задаёт система: правило контраста axe считает по авторским цветам и даёт ложные нарушения
      const ab = new AxeBuilder({ page: p }).withTags(AXE_TAGS);
      const axe = await (v.ctx.forcedColors === 'active' ? ab.disableRules(['color-contrast']) : ab).analyze();
      for (const x of axe.violations) fails.push({ where, what: `axe ${x.id}: ${x.nodes.length} узл., например ${x.nodes[0]?.target.join(' ')}` });
      const focus = await tabWalk(p);
      if (focus) fails.push({ where, what: focus });
      if (pg.stand && v.name === '1280x720-светлая') {
        // кегли в rem: „Крупнее“ (112,5 % корня) увеличивает текст Писания с 18 до 20,25 px
        const size = async () => p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('pisanie') as HTMLElement).fontSize));
        const a = await size();
        await p.evaluate(() => document.documentElement.setAttribute('data-text', 'крупнее'));
        const b = await size();
        if (Math.abs(a - 18) > 0.01 || Math.abs(b - 20.25) > 0.01) fails.push({ where, what: `„Крупнее“: кегль Писания ${a} → ${b} px, нужно 18 → 20,25 (кегли в rem)` });
      }
      log.push({ where, axe: axe.violations.length, incomplete: axe.incomplete.length, scroll, errors: errors.length, net: net.length, focus: focus ?? 'ок' });
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
  // известные нарушения: показываются, но не роняют задание; новое — падение; строка списка без совпадений — тоже падение
  const known = (JSON.parse(readFileSync(join(import.meta.dirname, 'prototypes-известные.json'), 'utf8')) as { items: { page: string; variant?: string; what: string; why: string }[] }).items;
  const isKnown = (f: Fail) => known.find((k) => f.where.startsWith(k.page) && (!k.variant || f.where.includes(k.variant)) && f.what.startsWith(k.what));
  const fresh = fails.filter((f) => !isKnown(f));
  const stale = ONLY ? [] : known.filter((k) => !fails.some((f) => isKnown(f) === k));
  writeFileSync(join(OUT, 'итог.json'), JSON.stringify({ fails, fresh, stale, log }, null, 1));
  console.log(`прототипы: страниц ${PAGES.length}, состояний ${log.length}, нарушений ${fails.length} (известных ${fails.length - fresh.length}, новых ${fresh.length}); снимки и итог — ${OUT}`);
  for (const f of fails) if (isKnown(f)) console.log(`известно: ${f.where}: ${f.what}`);
  for (const f of fresh) console.error(`!! ${f.where}: ${f.what}`);
  for (const k of stale) console.error(`!! в списке известных, но не найдено (убрать из списка): ${k.page} ${k.variant ?? ''} ${k.what}`);
  process.exit(fresh.length || stale.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`!! ${(e as Error).stack ?? e}`);
  process.exit(1);
});
