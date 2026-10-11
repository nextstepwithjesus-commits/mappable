// Снимки и проверки листа-образца ред. 3 (Playwright, Chromium). Запуск из корня: node prototypes/лист-образец/снимки.mjs
// Снимки — после document.fonts.ready; большие «весь лист» (*-весь.png) — вне git (.gitignore).
// Проверки: шрифты, горизонтальная прокрутка, ошибки JS, axe-core (метки WCAG 2.2 A/AA + label-content-name-mismatch),
// контраст текста по вычисленным стилям, цели по способу ввода, число строк каталога на первом экране, копия стиха.
// Итог — снимки/проверки.json. ПРОТОТИП.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ПАПКА = dirname(fileURLToPath(import.meta.url));
const СНИМКИ = join(ПАПКА, 'снимки');
mkdirSync(СНИМКИ, { recursive: true });
const AXE = readFileSync(join(ПАПКА, '..', '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const url = (стр, q = '') => pathToFileURL(join(ПАПКА, стр)).href + (q ? `?${q}` : '');
const итог = { снимки: [], ошибкиJS: [], прокрутка: [], шрифты: [], axe: [], контраст: [], цели: [], строки: [], копия: [] };

const браузер = await chromium.launch();
async function открыть(стр, q, { w, h, dpr = 1, тема = 'light', forced = false, мобильный = false } = {}) {
  const ctx = await браузер.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, colorScheme: тема, forcedColors: forced ? 'active' : 'none', hasTouch: мобильный, isMobile: мобильный });
  const p = await ctx.newPage();
  const ошибки = [];
  p.on('pageerror', (e) => ошибки.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|net::/.test(m.text())) ошибки.push(m.text()); });
  await p.goto(url(стр, q));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(250);
  const шрифты = await p.evaluate(() => document.fonts.check('600 30px Literata', 'ЙЁ') && document.fonts.check('450 14px "Golos Text"', 'ЙЁ'));
  const прокрутка = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  return { ctx, p, ошибки, шрифты, прокрутка };
}
async function снять(стр, q, имя, опц, { весь = false } = {}) {
  const { ctx, p, ошибки, шрифты, прокрутка } = await открыть(стр, q, опц);
  await p.screenshot({ path: join(СНИМКИ, `${имя}.png`), fullPage: false });
  if (весь) await p.screenshot({ path: join(СНИМКИ, `${имя}-весь.png`), fullPage: true });
  итог.снимки.push(имя);
  if (ошибки.length) итог.ошибкиJS.push({ имя, ошибки });
  if (прокрутка > 0) итог.прокрутка.push({ имя, px: прокрутка });
  if (!шрифты) итог.шрифты.push(имя);
  return { ctx, p };
}

const ЭКРАНЫ = ['лист', 'главная', 'каталог', 'история', 'карточка', 'настройки'];
const ОКНА = [[1280, 720], [360, 560]];
for (const стр of ЭКРАНЫ) for (const [w, h] of ОКНА) for (const тема of ['light', 'dark']) {
  const { ctx } = await снять(`${стр}.html`, `panel=0&theme=${тема}${стр === 'история' ? '&open=1' : ''}`, `${стр}-${w}-${тема === 'light' ? 'светлая' : 'тёмная'}`, { w, h, тема, мобильный: w < 600 }, { весь: стр === 'лист' || стр === 'история' });
  await ctx.close();
}
// окна для сравнения с R14 (правило прототипов): 1280 × 800 и 360 × 640, первые экраны
for (const стр of ['главная', 'каталог', 'история', 'карточка']) for (const [w, h] of [[1280, 800], [360, 640]]) for (const тема of ['light', 'dark']) {
  const { ctx } = await снять(`${стр}.html`, `panel=0&theme=${тема}`, `${стр}-${w}x${h}-${тема === 'light' ? 'светлая' : 'тёмная'}`, { w, h, тема, мобильный: w < 600 });
  await ctx.close();
}
// варианты § 10.1: цвет действия, размер текста, касание и плотность, второй слой, возраст, 1024, 400 %, серый, высокая контрастность
const ВАРИАНТЫ = [
  ...['нет', 'киноварь', 'бирюза'].flatMap((a) => [['каталог', `action=${a}`, `действие-${a}-каталог-1280`, 1280, 720], ['история', `action=${a}`, `действие-${a}-история-1280`, 1280, 720]]),
  ...['крупнее', 'самый'].flatMap((t) => [['каталог', `text=${t}`, `размер-${t}-каталог-1280`, 1280, 720], ['каталог', `text=${t}`, `размер-${t}-каталог-360`, 360, 560]]),
  ['каталог', 'input=касание&density=плотная', 'касание-плотная-каталог-360', 360, 560],
  ['каталог', 'density=плотная&layer=2', 'плотная-второй-слой-каталог-1280', 1280, 720],
  ['каталог', 'view=table&layer=2', 'таблица-второй-слой-1280', 1280, 720],
  ['каталог', 'книга=Мк', 'каталог-мк-1280', 1280, 720],
  ['каталог', 'open=10', 'раскрытие-строки-1280', 1280, 720],
  ['история', 'age=9&open=1', 'возраст-9-история-1280', 1280, 720],
  ['история', 'layer=2', 'история-второй-слой-1280', 1280, 720],
  ['история', '', 'история-1024-светлая', 1024, 720],
  ['карточка', 'layer=2', 'карточка-второй-слой-1280', 1280, 720],
  ['главная', 'age=null', 'главная-без-вопроса-1280', 1280, 720],
];
for (const [стр, q, имя, w, h] of ВАРИАНТЫ) { const { ctx } = await снять(`${стр}.html`, `panel=0&${q}`, имя, { w, h, мобильный: w < 600 }); await ctx.close(); }
// 400 %: окно 1280 × 1024 при увеличении 400 % = 320 × 256 CSS px
for (const стр of ['каталог', 'история']) { const { ctx } = await снять(`${стр}.html`, 'panel=0', `${стр}-400-процентов`, { w: 320, h: 256, dpr: 4 }); await ctx.close(); }
// разделы листа: серый с размытием и высокая контрастность
for (const тема of ['light', 'dark']) {
  for (const [q, forced, имя] of [['gray=1', false, 'серый'], ['', true, 'forced']]) {
    const { ctx, p } = await открыть('лист.html', `panel=0&theme=${тема}&${q}`, { w: 1280, h: 720, тема, forced });
    await p.locator('#состояния').screenshot({ path: join(СНИМКИ, `состояния-${имя}-${тема === 'light' ? 'светлая' : 'тёмная'}.png`) });
    итог.снимки.push(`состояния-${имя}-${тема}`);
    await ctx.close();
  }
}
{ const { ctx, p } = await открыть('история.html', 'panel=0', { w: 1280, h: 720, dpr: 2 }); await p.locator('.шапка-истории__верх').screenshot({ path: join(СНИМКИ, 'волосная-2x.png') }); await p.locator('.знак-ссылка').screenshot({ path: join(СНИМКИ, 'знак-2x.png') }); await ctx.close(); }
for (const тема of ['light', 'dark']) { const { ctx, p } = await открыть('лист.html', `panel=0&theme=${тема}`, { w: 1280, h: 720, тема }); await p.locator('#знак').screenshot({ path: join(СНИМКИ, `знак-приложения-${тема === 'light' ? 'светлая' : 'тёмная'}.png`) }); await p.locator('#действие').screenshot({ path: join(СНИМКИ, `действие-лист-${тема === 'light' ? 'светлая' : 'тёмная'}.png`) }); await ctx.close(); }

// ---------- axe-core и контраст по вычисленным стилям ----------
const КОНТРАСТ_JS = () => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const разбор = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const L = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const к = (x, y) => { const [a, b] = [L(x), L(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
  const фон = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && !e.matches('body')) return null; const c = разбор(cs.backgroundColor); if (c && c.a > 0.5) return c; } return разбор(getComputedStyle(document.body).backgroundColor); };
  const плохие = []; let всего = 0;
  const обход = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const видно = new Set();
  while (обход.nextNode()) { const t = обход.currentNode; if (!t.textContent.trim()) continue; const el = t.parentElement; if (!el || видно.has(el)) continue; видно.add(el); }
  for (const el of видно) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.opacity === '0' || el.closest('[aria-hidden="true"] svg, .скрыто, .панель-листа, iframe')) continue;
    const c = разбор(cs.color), b = фон(el); if (!c || !b) continue;
    всего++;
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const норма = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const k = к(c, b);
    if (k < норма) плохие.push({ текст: el.textContent.trim().slice(0, 40), k: Math.round(k * 100) / 100, норма, класс: el.className });
  }
  return { всего, плохие };
};
const ЦЕЛИ_JS = (нужно) => {
  const xs = [...document.querySelectorAll('button, a[href], input, select, [role="option"], [role="tab"], [role="menuitem"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.closest('.панель-листа, p.т-проза, .т-проза p, td.т-адрес, dd, .писание, .строка__название, .т-интерфейс a, .ссылки-внизу, .хлебные, .поиск__примеры, .указатель-книг, .колофон, .образец, .ряд-букв, .указатель-лиц, .т-адрес') && !e.matches('.скрыто-пропуск, .строка__ссылка') && !(e.matches('input[type=radio], input[type=checkbox]') && e.closest('label')); });
  const малые = xs.filter((e) => { const r = e.getBoundingClientRect(); return Math.round(r.height) < нужно || Math.round(r.width) < Math.min(нужно, 24); }).map((e) => ({ что: (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30), в: Math.round(e.getBoundingClientRect().height) }));
  return { всего: xs.length, малые };
};
for (const стр of ЭКРАНЫ) for (const [w, h] of ОКНА) for (const тема of ['light', 'dark']) {
  const { ctx, p } = await открыть(`${стр}.html`, `panel=0&theme=${тема}${стр === 'история' ? '&open=1' : ''}`, { w, h, тема, мобильный: w < 600 });
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'label-content-name-mismatch': { enabled: true } } });
    return { нарушения: res.violations.map((v) => ({ id: v.id, n: v.nodes.length, пример: v.nodes[0]?.target?.join(' ') })), неясно: res.incomplete.map((v) => ({ id: v.id, n: v.nodes.length })) };
  });
  итог.axe.push({ стр, w, тема, ...r });
  const кр = await p.evaluate(КОНТРАСТ_JS);
  итог.контраст.push({ стр, w, тема, всего: кр.всего, ниже: кр.плохие.length, примеры: кр.плохие.slice(0, 5) });
  await ctx.close();
}
for (const [ввод, нужно, w, h] of [['мышь', 24, 1280, 720], ['касание', 44, 360, 560]]) for (const стр of ['главная', 'каталог', 'история', 'карточка', 'настройки']) {
  const { ctx, p } = await открыть(`${стр}.html`, `panel=0&input=${ввод}`, { w, h, мобильный: ввод === 'касание' });
  const ц = await p.evaluate(ЦЕЛИ_JS, нужно);
  итог.цели.push({ стр, ввод, нужно, всего: ц.всего, меньше: ц.малые.length, примеры: ц.малые.slice(0, 6) });
  await ctx.close();
}

// ---------- число строк каталога на первом экране (08 § 3.4: с плашкой пробы — 12 и 6) ----------
for (const [w, h, порог] of [[1280, 720, 12], [360, 560, 6], [1280, 800, 14], [360, 640, 8]]) for (const плотная of [false, true]) {
  const { ctx, p } = await открыть('каталог.html', `panel=0${плотная ? '&density=плотная' : ''}`, { w, h, мобильный: w < 600 });
  const n = await p.evaluate(() => [...document.querySelectorAll('.список > .строка')].filter((r) => { const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }).length);
  const высоты = await p.evaluate(() => [...document.querySelectorAll('.список > .строка')].slice(0, 12).map((r) => Math.round(r.getBoundingClientRect().height)));
  итог.строки.push({ окно: `${w}×${h}`, плотная, строк: n, порог: плотная ? null : порог, высоты });
  await ctx.close();
}

// ---------- копия стиха: выделение = показанный текст, без скрытых меток (08 § 4.2, § 16.2) ----------
{
  const { ctx, p } = await открыть('история.html', 'panel=0&open=1', { w: 1280, h: 720 });
  const r = await p.evaluate(() => {
    const Д = window.ДАННЫЕ; const О = window.ОБЩЕЕ; const out = [];
    for (const s of document.querySelectorAll('#часть-1-т .стих')) {
      const [г, с] = s.id.replace('ст', '').split('.');
      const a = `Быт ${г}:${с}`;
      const range = document.createRange(); range.selectNodeContents(s);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      const копия = sel.toString().replace(/\s+/g, ' ').trim();
      const показ = О.показ(Д.стихи[a]);
      out.push({ a, ок: копия === показ, копия: копия === показ ? '' : копия });
    }
    // строка копии для каждой строки source-issues: копия = показанный текст + адрес
    const деф = Д.дефекты.map((д) => { const a = `${д.книга} ${д.глава}:${д.с}`; const t = Д.стихи[a]; if (!t) return { a, ок: null, почему: 'стих пуст — кнопки нет' }; const { plain } = О.строкаКопии(a, false); return { a, ок: plain === `«${О.показ(t)}» (${О.адрес(a)}, Синодальный перевод)` }; });
    return { стихи: out, дефекты: деф };
  });
  итог.копия = r;
  await ctx.close();
}
await браузер.close();
writeFileSync(join(СНИМКИ, 'проверки.json'), JSON.stringify(итог, null, 1));
const axeНар = итог.axe.reduce((s, x) => s + x.нарушения.reduce((a, v) => a + v.n, 0), 0);
console.log(`снимков: ${итог.снимки.length}; ошибок JS: ${итог.ошибкиJS.length}; горизонтальная прокрутка: ${итог.прокрутка.map((x) => `${x.имя} ${x.px}`).join(', ') || 0}; без шрифтов: ${итог.шрифты.length}`);
console.log(`axe: узлов с нарушениями ${axeНар}; виды: ${[...new Set(итог.axe.flatMap((x) => x.нарушения.map((v) => v.id)))].join(', ') || '—'}; неясно: ${[...new Set(итог.axe.flatMap((x) => x.неясно.map((v) => v.id)))].join(', ') || '—'}`);
console.log(`контраст текста ниже нормы: ${итог.контраст.reduce((s, x) => s + x.ниже, 0)} из ${итог.контраст.reduce((s, x) => s + x.всего, 0)} элементов`);
console.log(`цели меньше нормы: ${итог.цели.map((x) => `${x.стр}/${x.ввод} ${x.меньше}`).join(', ')}`);
console.log(`строк каталога: ${итог.строки.map((x) => `${x.окно}${x.плотная ? ' плотная' : ''} ${x.строк}${x.порог ? `/${x.порог}` : ''}`).join('; ')}`);
console.log(`копия стиха: ${итог.копия.стихи.filter((x) => x.ок).length} из ${итог.копия.стихи.length}; дефекты: ${итог.копия.дефекты.filter((x) => x.ок).length} совпали, ${итог.копия.дефекты.filter((x) => x.ок === null).length} без кнопки`);
