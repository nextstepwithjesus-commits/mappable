// Снимки и проверки листа-образца, ред. 3.1 (Playwright, Chromium). Запуск из корня: node prototypes/лист-образец/снимки.mjs
// Снимки — после document.fonts.ready, картинок и окон; «весь лист» (*-весь.png) — вне git (.gitignore).
// Проверки (Л-11 — пишем только проверенное): шрифты, ошибки JS, прокрутка и обрезка, axe-core по состояниям, контраст текста
// по вычисленным стилям, цели — все элементы, кроме ссылок внутри предложений, фокус после действий, фокус не закрыт,
// растянутая ссылка не накрывает раскрытие, знаков в строке Писания, номера стихов не сталкиваются, копия, синопсис 360,
// число строк каталога. Итог — снимки/проверки.json. ПРОТОТИП.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ПАПКА = dirname(fileURLToPath(import.meta.url));
const СНИМКИ = join(ПАПКА, 'снимки');
mkdirSync(СНИМКИ, { recursive: true });
for (const f of readdirSync(СНИМКИ)) if (f.endsWith('.png')) unlinkSync(join(СНИМКИ, f));
const AXE = readFileSync(join(ПАПКА, '..', '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const url = (стр, q = '') => pathToFileURL(join(ПАПКА, стр)).href + (q ? `?${q}` : '');
const И = { снимки: [], ошибкиJS: [], прокрутка: [], обрезка: [], шрифты: [], картинки: [], axe: [], контраст: [], цели: [], фокус: [], закрыт: [], раскрытие: [], знаков: [], номера: [], копия: {}, синопсис: [], строки: [] };
const тема_ = (т) => (т === 'light' ? 'светлая' : 'тёмная');

const браузер = await chromium.launch();
async function открыть(стр, q, { w, h, dpr = 1, тема = 'light', forced = false } = {}) {
  const мобильный = w < 600;
  const ctx = await браузер.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, colorScheme: тема, forcedColors: forced ? 'active' : 'none', hasTouch: мобильный, isMobile: мобильный });
  const p = await ctx.newPage();
  const ошибки = [];
  p.on('pageerror', (e) => ошибки.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|net::/.test(m.text())) ошибки.push(m.text()); });
  await p.goto(url(стр, q), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))));
  await p.waitForTimeout(250);
  return { ctx, p, ошибки };
}
const ОБРЕЗКА_JS = () => [...document.querySelectorAll('button, a[href], .кн, h1, .знак-приложения')].filter((e) => {
  const r = e.getBoundingClientRect(); if (!r.width || !r.height || e.closest('[hidden], .таблица-обёртка, .скрыто, .скрыто-пропуск, .увеличение-обёртка, .панель-листа, .меню')) return false;
  return r.right > innerWidth + 1 || r.left < -1 || e.scrollWidth > e.clientWidth + 1;
}).slice(0, 6).map((e) => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30));
async function снять(стр, q, имя, опц, { весь = false } = {}) {
  const { ctx, p, ошибки } = await открыть(стр, q, опц);
  await p.screenshot({ path: join(СНИМКИ, `${имя}.png`) });
  if (весь) await p.screenshot({ path: join(СНИМКИ, `${имя}-весь.png`), fullPage: true });
  И.снимки.push(имя);
  const [шрифты, прокрутка, обрезка, картинки] = await p.evaluate(([J]) => [document.fonts.check('600 30px Literata', 'ЙЁ') && document.fonts.check('450 14px "Golos Text"', 'ЙЁ'), document.documentElement.scrollWidth - innerWidth, eval(J)(), [...document.images].filter((i) => !i.naturalWidth).length], [`(${ОБРЕЗКА_JS})`]);
  if (ошибки.length) И.ошибкиJS.push({ имя, ошибки });
  if (прокрутка > 0) И.прокрутка.push({ имя, px: прокрутка });
  if (обрезка.length) И.обрезка.push({ имя, обрезка });
  if (!шрифты) И.шрифты.push(имя);
  if (картинки) И.картинки.push({ имя, незагружено: картинки });
  return { ctx, p };
}

// ---------- основные снимки: 1280 × 800 и 360 × 640, обе темы (решение координатора) ----------
const ЭКРАНЫ = ['лист', 'главная', 'каталог', 'история', 'карточка', 'настройки'];
for (const стр of ЭКРАНЫ) for (const [w, h] of [[1280, 800], [360, 640]]) for (const тема of ['light', 'dark']) {
  const { ctx, p } = await снять(`${стр}.html`, `panel=0&theme=${тема}`, `${стр}-${w}-${тема_(тема)}`, { w, h, тема }, { весь: стр === 'лист' || стр === 'история' });
  if (стр === 'лист' && тема === 'light') { // окна и образцы листа — отдельными снимками (в полном снимке Chromium их не рисует)
    let n = 0;
    for (const кадр of await p.locator('iframe.кадр').all()) { await кадр.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await кадр.screenshot({ path: join(СНИМКИ, `лист-окно-${w}-${++n}.png`) }); }
    for (const id of ['знак', 'образцы']) { await p.locator(`#${id}`).scrollIntoViewIfNeeded(); await p.locator(`#${id}`).screenshot({ path: join(СНИМКИ, `лист-${id}-${w}.png`) }); }
  }
  await ctx.close();
}
// ---------- варианты § 10.1 ----------
const ВАРИАНТЫ = [
  ...['нет', 'киноварь'].flatMap((a) => [['каталог', `action=${a}`, `действие-${a}-каталог-1280`, 1280, 800], ['история', `action=${a}`, `действие-${a}-история-1280`, 1280, 800]]),
  ...['крупнее', 'самый'].flatMap((t) => [['каталог', `text=${t}`, `размер-${t}-каталог-1280`, 1280, 800], ['каталог', `text=${t}`, `размер-${t}-каталог-360`, 360, 640], ['история', `text=${t}`, `размер-${t}-история-360`, 360, 640]]),
  ['каталог', 'text=самый', 'размер-самый-каталог-320', 320, 568],
  ['каталог', 'input=касание&density=плотная', 'касание-плотная-каталог-360', 360, 640],
  ['каталог', 'density=плотная&layer=2', 'плотная-второй-слой-каталог-1280', 1280, 800],
  ['каталог', 'view=table&layer=2', 'таблица-второй-слой-1280', 1280, 800],
  ['каталог', 'книга=Мк', 'каталог-мк-1280', 1280, 800],
  ['каталог', 'open=10', 'раскрытие-строки-1280', 1280, 800],
  ['история', 'рисунок=1', 'история-с-рисунком-1280', 1280, 800],
  ['история', 'рисунок=1&open=1', 'история-с-рисунком-360', 360, 640],
  ['история', 'age=9', 'возраст-9-история-1280', 1280, 800],
  ['история', 'layer=2', 'история-второй-слой-1280', 1280, 800],
  ['история', '', 'история-1024-светлая', 1024, 768],
  ['карточка', 'layer=2', 'карточка-второй-слой-1280', 1280, 800],
  ['главная', 'age=null', 'главная-без-вопроса-1280', 1280, 800],
];
for (const [стр, q, имя, w, h] of ВАРИАНТЫ) { const { ctx } = await снять(`${стр}.html`, `panel=0&${q}`, имя, { w, h }); await ctx.close(); }
for (const стр of ['каталог', 'история', 'главная', 'карточка']) { const { ctx } = await снять(`${стр}.html`, 'panel=0', `${стр}-400-процентов`, { w: 320, h: 256, dpr: 4 }); await ctx.close(); }
for (const тема of ['light', 'dark']) for (const [q, forced, имя] of [['gray=1', false, 'серый'], ['', true, 'forced']]) {
  const { ctx, p } = await открыть('лист.html', `panel=0&theme=${тема}&${q}`, { w: 1280, h: 800, тема, forced });
  await p.locator('#состояния').screenshot({ path: join(СНИМКИ, `состояния-${имя}-${тема_(тема)}.png`) });
  И.снимки.push(`состояния-${имя}-${тема}`);
  await ctx.close();
}
{ const { ctx, p } = await открыть('история.html', 'panel=0', { w: 1280, h: 800, dpr: 2 }); await p.locator('.шапка-истории__верх').screenshot({ path: join(СНИМКИ, 'волосная-2x.png') }); await p.locator('.знак-ссылка').screenshot({ path: join(СНИМКИ, 'знак-2x.png') }); await ctx.close(); }

// ---------- axe по состояниям (Б4 доступности) ----------
const СОСТОЯНИЯ = [
  ['главная', ''], ['каталог', ''], ['каталог', 'layer=2'], ['каталог', 'view=table&layer=2'], ['каталог', 'open=10'], ['каталог', 'text=самый'],
  ['каталог', '', '[aria-controls="фасеты"]'], ['каталог', '', '[aria-controls="лист-порядок"]'],
  ['история', ''], ['история', 'layer=2'], ['история', '', '[data-menu="меню-истории"]'], ['история', '', '.панель .адрес-кн'],
  ['карточка', ''], ['карточка', 'layer=2'], ['настройки', 'layer=2'], ['лист', ''], ['лист', '', '[data-диалог]'],
];
for (const [стр, q, клик] of СОСТОЯНИЯ) for (const [w, h] of [[1280, 800], [360, 640]]) for (const тема of ['light', 'dark']) {
  if (тема === 'dark' && (клик || q)) continue;
  const { ctx, p } = await открыть(`${стр}.html`, `panel=0&theme=${тема}&${q}`, { w, h, тема });
  if (клик) { const л = p.locator(клик).first(); if (await л.isVisible()) await л.click(); await p.waitForTimeout(150); }
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'label-content-name-mismatch': { enabled: true } } });
    return { нарушения: res.violations.map((v) => ({ id: v.id, n: v.nodes.length, пример: v.nodes[0]?.target?.join(' ') })), неясно: res.incomplete.map((v) => ({ id: v.id, n: v.nodes.length })) };
  });
  И.axe.push({ стр, q, клик: клик ?? '', w, тема, ...r });
  await ctx.close();
}

// ---------- контраст текста по вычисленным стилям (не по пикселям) ----------
const КОНТРАСТ_JS = () => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const разбор = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const L = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const к = (x, y) => { const [a, b] = [L(x), L(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
  const фон = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && !e.matches('body')) return null; const c = разбор(cs.backgroundColor); if (c && c.a > 0.5) return c; } return разбор(getComputedStyle(document.body).backgroundColor); };
  const плохие = []; let всего = 0; const видно = new Set();
  const обход = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (обход.nextNode()) { const t = обход.currentNode; if (t.textContent.trim() && t.parentElement) видно.add(t.parentElement); }
  for (const el of видно) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || el.closest('.скрыто, .панель-листа, iframe, [hidden]')) continue;
    const c = разбор(cs.color), b = фон(el); if (!c || !b) continue;
    всего++;
    const size = parseFloat(cs.fontSize), норма = size >= 24 || (+cs.fontWeight >= 700 && size >= 18.66) ? 3 : 4.5;
    const k = к(c, b); if (k < норма) плохие.push({ текст: el.textContent.trim().slice(0, 40), k: Math.round(k * 100) / 100 });
  }
  return { всего, плохие };
};
for (const стр of ЭКРАНЫ) for (const тема of ['light', 'dark']) for (const [w, h] of [[1280, 800], [360, 640]]) {
  const { ctx, p } = await открыть(`${стр}.html`, `panel=0&theme=${тема}&open=1`, { w, h, тема });
  const кр = await p.evaluate(КОНТРАСТ_JS);
  И.контраст.push({ стр, тема, w, всего: кр.всего, ниже: кр.плохие.length, примеры: кр.плохие.slice(0, 5) });
  await ctx.close();
}

// ---------- цели: все кнопки, ссылки и поля; исключение — только ссылка внутри предложения (08 § 3.5) ----------
const ЦЕЛИ_JS = (нужно) => {
  const вПредложении = (e) => {
    if (e.closest('.писание')) return true; // слово словаря и ссылки в тексте Писания — исключение «в строке текста»
    if (e.tagName !== 'A') return false;
    const блок = e.closest('p, dd, li, td, blockquote, q'); if (!блок) return false;
    const свой = [...блок.querySelectorAll('a, button')].reduce((s, x) => s + x.textContent.length, 0);
    return блок.textContent.trim().length - свой >= 15; // в блоке есть текст предложения, кроме самих ссылок
  };
  const xs = [...document.querySelectorAll('button, a[href], input, select, [role="option"], [role="tab"], [role^="menuitem"]')].filter((e) => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
    if (e.closest('.панель-листа, [hidden], .увеличение-обёртка, .образец, .таблица-обёртка[role="region"] .матрица')) return false; // образцы листа — не экран
    if (e.matches('input[type=radio], input[type=checkbox]') && e.closest('label')) return false; // цель — вся подпись
    if (e.matches('.скрыто-пропуск') && r.top < 0) return false;
    return !вПредложении(e);
  });
  const мера = (e) => { const r = e.getBoundingClientRect(); const lab = e.closest('label'); return lab ? lab.getBoundingClientRect() : r; };
  const малые = xs.filter((e) => { const r = мера(e); return Math.round(r.height) < нужно || Math.round(r.width) < нужно; }).map((e) => { const r = мера(e); return { что: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30), ш: Math.round(r.width), в: Math.round(r.height) }; });
  return { всего: xs.length, малые };
};
for (const [ввод, нужно, w, h] of [['мышь', 24, 1280, 800], ['касание', 44, 360, 640]]) for (const стр of ['главная', 'каталог', 'история', 'карточка', 'настройки']) for (const q of ['', 'layer=2&open=10']) {
  const { ctx, p } = await открыть(`${стр}.html`, `panel=0&input=${ввод}&${q}`, { w, h });
  await p.evaluate(() => document.querySelectorAll('.часть__кнопка[aria-expanded="false"], .блок__кнопка[aria-expanded="false"]').forEach((b) => b.click()));
  const ц = await p.evaluate(ЦЕЛИ_JS, нужно);
  И.цели.push({ стр, ввод, q, нужно, всего: ц.всего, меньше: ц.малые.length, примеры: ц.малые.slice(0, 8) });
  await ctx.close();
}

// ---------- фокус после действий ≠ body (Л-7) ----------
{
  const проба = async (стр, q, шаги, имя, w = 1280, h = 800) => {
    const { ctx, p } = await открыть(`${стр}.html`, `panel=0&${q}`, { w, h });
    for (const ш of шаги) { if (ш.фокус) await p.focus(ш.фокус); if (ш.клавиша) await p.keyboard.press(ш.клавиша); await p.waitForTimeout(120); }
    const где = await p.evaluate(() => { const a = document.activeElement; return a === document.body || !a ? 'BODY' : `${a.tagName}${a.dataset?.фильтр ? `[фильтр=${a.dataset.фильтр}]` : ''} ${(a.textContent || a.value || '').trim().slice(0, 30)}`; });
    И.фокус.push({ имя, где, ок: где !== 'BODY' });
    await ctx.close();
  };
  await проба('каталог', '', [{ фокус: '[aria-controls="фасеты"]', клавиша: 'Enter' }, { фокус: '[data-фильтр="родословие"]', клавиша: 'Space' }], 'флажок «Фильтров»');
  await проба('каталог', '', [{ фокус: '[aria-controls="фасеты"]', клавиша: 'Enter' }, { фокус: '[data-фильтр="родословие"]', клавиша: 'Escape' }], 'Esc в «Фильтрах» → кнопка');
  await проба('каталог', '', [{ фокус: '[aria-controls="лист-порядок"]', клавиша: 'Enter' }, { фокус: '[data-порядок][value="название"]', клавиша: 'Space' }], 'порядок радиогруппой');
  await проба('каталог', '', [{ фокус: '[data-вид="таблица"]', клавиша: 'Enter' }], 'вид «Таблица»');
  await проба('каталог', '', [{ фокус: '[data-layer-set="2"]', клавиша: 'Enter' }], 'слой в каталоге');
  await проба('карточка', '', [{ фокус: '[data-layer-set="2"]', клавиша: 'Enter' }], 'слой в Карточке');
  await проба('история', '', [{ фокус: '[data-layer-set="2"]', клавиша: 'Enter' }], 'слой на истории');
  await проба('каталог', '', [{ фокус: '[aria-controls="лист-показ"]', клавиша: 'Enter' }, { фокус: '[data-показ][value="2"]', клавиша: 'Space' }], 'слой на телефоне («Показ»)', 360, 640);
}
// Esc закрывает «Фильтры»: проверка, что лист скрыт
{ const { ctx, p } = await открыть('каталог.html', 'panel=0', { w: 1280, h: 800 }); await p.click('[aria-controls="фасеты"]'); await p.focus('[data-фильтр="родословие"]'); await p.keyboard.press('Space'); await p.keyboard.press('Escape'); И.фокус.push({ имя: '«Фильтры» скрыты после Esc', где: '', ок: await p.evaluate(() => document.getElementById('фасеты').hidden) }); await ctx.close(); }

// ---------- фокус не закрыт: Shift + Tab, три точки (Л-8) ----------
for (const [w, h, dpr, имя] of [[360, 640, 1, '360 × 640'], [320, 568, 1, '320 × 568'], [320, 256, 4, '400 %']]) for (const q of ['', 'view=table']) {
  const { ctx, p } = await открыть('каталог.html', `panel=0&${q}`, { w, h, dpr });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.focus('#после-списка');
  let закрыто = 0, шагов = 0; const примеры = [];
  for (let i = 0; i < 80; i++) {
    await p.keyboard.press('Shift+Tab'); шагов++;
    const r = await p.evaluate(() => {
      const a = document.activeElement; if (!a || a === document.body) return null;
      const b = a.getBoundingClientRect(); if (!b.width) return null;
      const точки = [[b.left + b.width / 2, b.top + b.height / 2], [b.left + 2, b.top + 2], [b.right - 2, b.bottom - 2]];
      const видно = точки.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (a === e || a.contains(e) || e.contains(a)); }).length;
      return { видно, что: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 30) };
    });
    if (r && r.видно === 0) { закрыто++; if (примеры.length < 3) примеры.push(r.что); }
  }
  И.закрыт.push({ окно: имя, вид: q || 'список', шагов, закрыто, примеры });
  await ctx.close();
}

// ---------- растянутая ссылка не накрывает раскрытие (Л-9) ----------
{
  const { ctx, p } = await открыть('каталог.html', 'panel=0&open=10', { w: 1280, h: 800 });
  const r = await p.evaluate(() => {
    const рас = document.getElementById('р-10-подр'); рас.scrollIntoView({ block: 'center' });
    const b = рас.getBoundingClientRect(); let вСсылке = 0, всего = 0;
    for (let y = b.top + 4; y < b.bottom - 2; y += Math.max(4, b.height / 12)) { всего++; const e = document.elementFromPoint(b.left + b.width / 3, y); if (e?.closest('.строка__ссылка')) вСсылке++; }
    return { всего, вСсылке };
  });
  И.раскрытие.push(r);
  await ctx.close();
}

// ---------- знаков в строке Писания и столкновение номеров (Л-1, Л-2) ----------
for (const [w, h] of [[1280, 800], [1024, 768], [360, 640]]) for (const текст of ['обычный', 'самый']) {
  const { ctx, p } = await открыть('история.html', `panel=0&text=${текст}`, { w, h });
  const r = await p.evaluate(() => {
    const п = document.querySelector('#часть-1-т .писание'); const cs = getComputedStyle(п);
    const range = document.createRange(); range.selectNodeContents(п);
    const строки = new Map();
    for (const node of (function* walk(n) { const tw = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); while (tw.nextNode()) yield tw.currentNode; })(п)) {
      if (node.parentElement.closest('.стих__номер, .глава-номер, .скрыто')) continue;
      for (let i = 0; i < node.length; i++) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getBoundingClientRect(); if (!b.height) continue; const y = Math.floor((b.top + b.height / 2 - п.getBoundingClientRect().top) / parseFloat(cs.lineHeight)); строки.set(y, (строки.get(y) ?? 0) + 1); }
    }
    const длины = [...строки.values()].slice(0, -1);
    const сред = Math.round(длины.reduce((a, b) => a + b, 0) / длины.length);
    const номера = [...document.querySelectorAll('.стих__номер')].map((e) => e.getBoundingClientRect());
    let пересечений = 0; for (let i = 0; i < номера.length; i++) for (let j = i + 1; j < номера.length; j++) { const a = номера[i], b = номера[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) пересечений++; }
    return { колонка: Math.round(п.getBoundingClientRect().width), насыщенность: cs.fontWeight, кегль: cs.fontSize, знаков: сред, пересечений };
  });
  И.знаков.push({ окно: `${w}`, текст, ...r });
  await ctx.close();
}

// ---------- копия: стихи, строка лица, строка каталога (скрытые раскрытия не попадают) ----------
{
  const { ctx, p } = await открыть('история.html', 'panel=0', { w: 1280, h: 800 });
  И.копия = await p.evaluate(() => {
    const Д = window.ДАННЫЕ; const О = window.ОБЩЕЕ; const sel = getSelection();
    const выдели = (n) => { const r = document.createRange(); r.selectNodeContents(n); sel.removeAllRanges(); sel.addRange(r); const t = sel.toString(); sel.removeAllRanges(); return t; };
    const стихи = [...document.querySelectorAll('#часть-1-т .стих')].map((s) => { const [г, с] = s.id.replace('ст', '').split('.'); const a = `Быт ${г}:${с}`; const копия = выдели(s).replace(/\s+/g, ' ').trim(); return { a, ок: копия === О.показ(Д.стихи[a]), копия }; });
    const лицо = выдели(document.querySelector('.панель .строка-лица'));
    const дефекты = Д.дефекты.map((д) => { const a = `${д.книга} ${д.глава}:${д.с}`; const t = Д.стихи[a]; if (!t) return { a, ок: null }; const { plain } = О.строкаКопии(a, false); return { a, ок: plain === `«${О.показ(t)}» (${О.адрес(a)}, Синодальный перевод)` }; });
    return { стихи: стихи.map(({ a, ок }) => ({ a, ок })), стихиОк: стихи.filter((x) => x.ок).length, стихов: стихи.length, лицо: лицо.replace(/\s+/g, ' ').trim(), лицоБезРаскрытия: !/Бытие, глава/.test(лицо) && !/Библия:/.test(лицо) === false ? 'проверить' : !/Бытие, глава/.test(лицо), дефекты };
  });
  await ctx.close();
  const k = await открыть('каталог.html', 'panel=0', { w: 1280, h: 800 });
  И.копия.строкаКаталога = await k.p.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.строка')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return s.toString().replace(/\s+/g, ' ').trim(); });
  И.копия.строкаКаталогаБезРаскрытия = !/Бытие, глава/.test(И.копия.строкаКаталога);
  await k.ctx.close();
}

// ---------- синопсис на 360: вкладки, ячейки не перекрываются (Л-5) ----------
{
  const { ctx, p } = await открыть('лист.html', 'panel=0', { w: 360, h: 640 });
  И.синопсис.push(await p.evaluate(() => {
    const об = document.querySelector('.синопсис-обёртка'); об.scrollIntoView();
    const вкладки = getComputedStyle(об.querySelector('.синопсис-вкладки')).display !== 'none';
    const ячейки = [...об.querySelectorAll('td')].filter((t) => getComputedStyle(t).display !== 'none').map((t) => t.getBoundingClientRect());
    let пер = 0; for (let i = 0; i < ячейки.length; i++) for (let j = i + 1; j < ячейки.length; j++) { const a = ячейки[i], b = ячейки[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) пер++; }
    const шире = ячейки.filter((r) => r.width < 200).length;
    return { вкладки, ячеек: ячейки.length, перекрытий: пер, узких: шире };
  }));
  await ctx.close();
}

// ---------- строки каталога на первом экране (08 § 3.4; с плашкой пробы) ----------
for (const [w, h, порог] of [[1280, 720, 12], [360, 560, 6], [1280, 800, 14], [360, 640, 8]]) for (const плотная of [false, true]) {
  const { ctx, p } = await открыть('каталог.html', `panel=0${плотная ? '&density=плотная' : ''}`, { w, h });
  const r = await p.evaluate(() => { const xs = [...document.querySelectorAll('.список > .строка')]; return { n: xs.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }).length, высоты: xs.slice(0, 12).map((r) => Math.round(r.getBoundingClientRect().height)) }; });
  И.строки.push({ окно: `${w}×${h}`, плотная, строк: r.n, порог: плотная ? null : порог, высоты: r.высоты });
  await ctx.close();
}
await браузер.close();
writeFileSync(join(СНИМКИ, 'проверки.json'), JSON.stringify(И, null, 1));
const axeН = И.axe.reduce((s, x) => s + x.нарушения.reduce((a, v) => a + v.n, 0), 0);
console.log(`снимков: ${И.снимки.length}; ошибок JS: ${И.ошибкиJS.length}; прокрутка: ${И.прокрутка.map((x) => `${x.имя} ${x.px}`).join(', ') || 0}; обрезка: ${И.обрезка.map((x) => `${x.имя}: ${x.обрезка.join('|')}`).join('; ') || 0}; без шрифтов: ${И.шрифты.length}; картинки не загружены: ${И.картинки.map((x) => x.имя).join(', ') || 0}`);
console.log(`axe: состояний ${И.axe.length}, узлов с нарушениями ${axeН}: ${[...new Set(И.axe.flatMap((x) => x.нарушения.map((v) => `${v.id} (${x.стр} ${x.q}${x.клик})`)))].join(', ') || '—'}; incomplete: ${И.axe.reduce((s, x) => s + x.неясно.reduce((a, v) => a + v.n, 0), 0)} (${[...new Set(И.axe.flatMap((x) => x.неясно.map((v) => v.id)))].join(', ')})`);
console.log(`контраст текста ниже нормы: ${И.контраст.reduce((s, x) => s + x.ниже, 0)} из ${И.контраст.reduce((s, x) => s + x.всего, 0)}`);
console.log(`цели меньше нормы: ${И.цели.filter((x) => x.меньше).map((x) => `${x.стр}/${x.ввод}${x.q ? '/2сл' : ''} ${x.меньше}: ${x.примеры.map((m) => `${m.что} ${m.ш}×${m.в}`).join('; ')}`).join(' || ') || 0} (проверено ${И.цели.reduce((s, x) => s + x.всего, 0)})`);
console.log(`фокус: ${И.фокус.map((x) => `${x.имя} ${x.ок ? 'ок' : `ПАДАЕТ (${x.где})`}`).join('; ')}`);
console.log(`фокус закрыт: ${И.закрыт.map((x) => `${x.окно} ${x.вид} ${x.закрыто}/${x.шагов}${x.примеры.length ? ` (${x.примеры.join('|')})` : ''}`).join('; ')}`);
console.log(`раскрытие под ссылкой: ${И.раскрытие.map((x) => `${x.вСсылке} из ${x.всего}`).join(', ')}`);
console.log(`знаков в строке: ${И.знаков.map((x) => `${x.окно}/${x.текст} ${x.знаков} (колонка ${x.колонка}, ${x.кегль} ${x.насыщенность}, пересечений номеров ${x.пересечений})`).join('; ')}`);
console.log(`копия: стихи ${И.копия.стихиОк}/${И.копия.стихов}; строка лица без раскрытия адреса: ${!/Бытие, глава/.test(И.копия.лицо)}; строка каталога без раскрытия: ${И.копия.строкаКаталогаБезРаскрытия}`);
console.log(`синопсис 360: ${JSON.stringify(И.синопсис)}`);
console.log(`строки каталога: ${И.строки.map((x) => `${x.окно}${x.плотная ? ' плотная' : ''} ${x.строк}${x.порог ? `/${x.порог}` : ''}`).join('; ')}`);
