// Снимки экранов 2 и 3 шага 0 и проверки. Запуск из корня проекта:
//   node prototypes/шаг-0/экраны/история/собрать.mjs && node prototypes/шаг-0/экраны/история/снимки.mjs
// Снимок — после document.fonts.ready и проверки шрифтов направления.
// Основные: экран × А/Б × светлая/тёмная × 1280×800 и 360×640 — первый экран (…-экран.png) и вся страница (…-весь.png, не в git).
// Пробы: второй слой 1280 светлая; телефон лёжа 640×360; тёмный множитель рисунка; буквица; чтение части 1.
// На 1280×800 первый экран проверяется ещё на «О чём» и начало текста (решение координатора по В-25, № 3).
// Проверки: шрифты, горизонтальная прокрутка, ошибки JS, первый экран (номер, название, знак), копия текста = synodal.tsv, клавиатура.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ПАПКА = dirname(fileURLToPath(import.meta.url));
const КОРЕНЬ = join(ПАПКА, '..', '..', '..', '..');
const ВЫХОД = join(ПАПКА, 'снимки');
mkdirSync(ВЫХОД, { recursive: true });
const tsv = readFileSync(join(КОРЕНЬ, 'tools/bible/synodal.tsv'), 'utf8').split('\n').map((l) => l.split('\t'));
const отрывок = (b, c, v1, v2) => tsv.filter((p) => p[0] === b && p[1] === String(c) && +p[2] >= v1 && +p[2] <= v2).map((p) => p[3]).join(' ');
const ЭКРАНЫ = { ной: 'Ной', расслабленный: 'Расслабленный' };
const адрес = (экран, пар) => pathToFileURL(join(ПАПКА, `${экран}.html`)).href + '?' + new URLSearchParams(пар);
const Д = (d) => (d === 'a' ? 'А' : 'Б'); const Т = (t) => (t === 'light' ? 'светлая' : 'тёмная');

async function готово(page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => document.documentElement.dataset.fonts, null, { timeout: 10000 });
  return page.evaluate(() => document.documentElement.dataset.fonts);
}
const browser = await chromium.launch();
const итог = []; const плохо = [];
async function открыть(экран, пар, w, h, тема) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: тема, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const ошибки = [];
  page.on('pageerror', (e) => ошибки.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') ошибки.push(m.text()); });
  await page.goto(адрес(экран, { theme: тема, ...пар }));
  const шрифты = await готово(page);
  const гориз = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  // первый экран: номер, название и знак (или паспорт) видны без прокрутки (решение координатора, № 1)
  const первый = await page.evaluate(() => {
    const вид = (s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.top + Math.min(r.height, 60) <= innerHeight; };
    const о = { номер: вид('.история-шапка__номер'), название: вид('.история-шапка__название'), знак: вид('.история-шапка .знак-шапки') };
    if (innerWidth >= 1024 && innerHeight >= 700 && document.documentElement.dataset.layer !== '2') { о['«О чём»'] = вид('#о-чём .коротко, #о-чём .коротко-полно'); о['начало текста'] = вид('.часть__кнопка, .рассказ .писание'); }
    return о;
  });
  return { ctx, page, ошибки, шрифты, гориз, первый };
}
function записать(имя, r, первыйНужен = true) {
  const пп = Object.entries(r.первый).filter(([, v]) => !v).map(([k]) => k);
  итог.push(`${имя}: шрифты ${r.шрифты}; гориз. прокрутка ${r.гориз > 0 ? r.гориз + ' px' : 'нет'}; ошибок JS ${r.ошибки.length}${первыйНужен ? `; первый экран ${пп.length ? 'НЕ видно: ' + пп.join(', ') : 'всё нужное видно'}` : ''}`);
  if (r.шрифты !== 'ok' || r.гориз > 0 || r.ошибки.length || (первыйНужен && пп.length)) плохо.push(имя + (r.ошибки.length ? ' ' + r.ошибки.join(' | ') : ''));
}

for (const экран of Object.keys(ЭКРАНЫ)) for (const dir of ['a', 'b']) for (const тема of ['light', 'dark']) for (const [w, h] of [[1280, 800], [360, 640]]) {
  const r = await открыть(экран, { dir }, w, h, тема);
  const имя = `${ЭКРАНЫ[экран]}-${Д(dir)}-${Т(тема)}-${w}`;
  await r.page.screenshot({ path: join(ВЫХОД, `${имя}-экран.png`) });
  await r.page.screenshot({ path: join(ВЫХОД, `${имя}-весь.png`), fullPage: true });
  записать(имя, r); await r.ctx.close();
}
// второй слой, 1280 светлая (для сравнения слоёв)
for (const экран of Object.keys(ЭКРАНЫ)) for (const dir of ['a', 'b']) {
  const r = await открыть(экран, { dir, layer: '2' }, 1280, 800, 'light');
  const имя = `${ЭКРАНЫ[экран]}-${Д(dir)}-светлая-1280-второй-слой`;
  await r.page.screenshot({ path: join(ВЫХОД, `${имя}-экран.png`) });
  await r.page.screenshot({ path: join(ВЫХОД, `${имя}-весь.png`), fullPage: true });
  записать(имя, r); await r.ctx.close();
}
// телефон лёжа 640×360 (Ф-14)
for (const экран of Object.keys(ЭКРАНЫ)) for (const dir of ['a', 'b']) {
  const r = await открыть(экран, { dir }, 640, 360, 'light');
  const имя = `${ЭКРАНЫ[экран]}-${Д(dir)}-светлая-640x360`;
  await r.page.screenshot({ path: join(ВЫХОД, `${имя}-экран.png`) });
  записать(имя, r); await r.ctx.close();
}
// тёмный множитель рисунка 1,00 / 0,85 / 0,66 на шапке Ноя (08 § 8.4)
for (const dir of ['a', 'b']) {
  const r = await открыть('ной', { dir, множитель: '1' }, 1280, 800, 'dark');
  const имя = `Ной-${Д(dir)}-тёмная-1280-множитель`;
  await r.page.locator('#шапка-истории').screenshot({ path: join(ВЫХОД, `${имя}.png`) });
  записать(имя, r, false); await r.ctx.close();
}
// подписные приёмы на Расслабленном: буквица (вариант) и шапка с паспортом
for (const dir of ['a', 'b']) {
  let r = await открыть('расслабленный', { dir, буквица: '1' }, 1280, 800, 'light');
  await r.page.locator('#история').screenshot({ path: join(ВЫХОД, `Расслабленный-${Д(dir)}-светлая-1280-буквица.png`) });
  записать(`Расслабленный-${Д(dir)}-буквица`, r, false); await r.ctx.close();
  r = await открыть('расслабленный', { dir }, 1280, 800, 'light');
  await r.page.locator('#история').screenshot({ path: join(ВЫХОД, `Расслабленный-${Д(dir)}-светлая-1280-начало-части.png`) });
  await r.ctx.close();
  r = await открыть('ной', { dir, открыть: '1' }, 1280, 800, 'light');
  await r.page.evaluate(() => document.querySelector('#история').scrollIntoView());
  await r.page.screenshot({ path: join(ВЫХОД, `Ной-${Д(dir)}-светлая-1280-чтение-экран.png`) });
  записать(`Ной-${Д(dir)}-чтение`, r, false); await r.ctx.close();
}

// копия текста без меток = synodal.tsv
const копия = async (экран, пар, сел) => {
  const r = await открыть(экран, пар, 1280, 800, 'light');
  const t = await r.page.evaluate((s) => { const p = document.querySelector(s); const rg = document.createRange(); rg.selectNodeContents(p); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); const x = sel.toString(); sel.removeAllRanges(); return x; }, сел);
  await r.ctx.close(); return t.replace(/\s+/g, ' ').trim();
};
const к1 = await копия('ной', { открыть: '1' }, '#часть-1 .писание p');
const к2 = await копия('расслабленный', {}, '#рассказ .писание p');
const к3 = await копия('расслабленный', { layer: '2', рассказ: 'Лк' }, '#рассказ .писание p');
const проверки = [['Быт 6:9–22 (часть 1 Ноя)', к1, отрывок('Быт', 6, 9, 22)], ['Мк 2:1–12', к2, отрывок('Мк', 2, 1, 12)]];
for (const [имя, получено, ждём] of проверки) { const ок = получено === ждём; итог.push(`Копия ${имя} без меток = synodal.tsv: ${ок ? 'да' : 'НЕТ'}`); if (!ок) { плохо.push('копия ' + имя); console.log(получено.slice(0, 200) + '\n' + ждём.slice(0, 200)); } }
// во втором слое номера стихов не копируются (user-select: none у номера)
const ок3 = к3 === отрывок('Лк', 5, 17, 26); итог.push(`Копия Лк 5:17–26 во втором слое (номера стихов не копируются): ${ок3 ? 'да' : 'НЕТ'}`); if (!ок3) плохо.push('копия Лк');

// клавиатура: порядок Tab, видимость фокуса, слой клавишами, вкладки стрелками, Esc у вклейки
{
  const r = await открыть('ной', {}, 1280, 800, 'light'); const p = r.page; const путь = [];
  for (let i = 0; i < 16; i++) {
    await p.keyboard.press('Tab');
    путь.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); const имя = (a.getAttribute('aria-label') || a.textContent || a.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40); return `${a.tagName.toLowerCase()}「${имя}」${cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 3 ? '' : ' ФОКУС НЕ ВИДЕН'}`; }));
  }
  итог.push('Tab по порядку (Ной, 1280): ' + путь.join(' → '));
  if (путь.some((x) => x.includes('НЕ ВИДЕН'))) плохо.push('фокус не виден');
  await p.focus('[data-слой-кнопка="2"]'); await p.keyboard.press('Enter');
  const с2 = await p.evaluate(() => [document.documentElement.dataset.layer, document.activeElement.getAttribute('data-слой-кнопка'), document.getElementById('объявление').textContent]);
  await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Space');
  const с1 = await p.evaluate(() => [document.documentElement.dataset.layer, document.activeElement.getAttribute('data-слой-кнопка')]);
  итог.push(`Слой клавишами: Enter на «Для изучающих» → слой ${с2[0]}, фокус на кнопке ${с2[1]}, объявление «${с2[2]}»; Shift+Tab, пробел на «Простой вид» → слой ${с1[0]}, фокус на кнопке ${с1[1]}`);
  if (с2[0] !== '2' || с1[0] !== '1') плохо.push('слой клавишами');
  await p.focus('#кто .адрес-кнопка'); await p.keyboard.press('Enter');
  const откр = await p.evaluate(() => document.activeElement.getAttribute('aria-expanded'));
  await p.keyboard.press('Tab'); await p.keyboard.press('Escape');
  const закр = await p.evaluate(() => [document.activeElement.className, document.activeElement.getAttribute('aria-expanded')]);
  итог.push(`Вклейка: Enter → раскрыта ${откр}; Tab внутрь, Esc → фокус на «${закр[0]}», раскрыта ${закр[1]}`);
  await p.focus('.часть__кнопка'); await p.keyboard.press('Enter');
  итог.push(`Часть 1: Enter → раскрыта ${await p.evaluate(() => document.querySelector('.часть__кнопка').getAttribute('aria-expanded'))}, фокус остаётся на кнопке: ${await p.evaluate(() => document.activeElement.classList.contains('часть__кнопка'))}`);
  await r.ctx.close();
  const r2 = await открыть('расслабленный', { layer: '2' }, 1280, 800, 'light'); const p2 = r2.page;
  await p2.focus('[role="tab"][aria-selected="true"]'); await p2.keyboard.press('ArrowRight');
  const вк = await p2.evaluate(() => [document.activeElement.dataset.рассказ, new URL(location.href).searchParams.get('рассказ'), document.querySelector('.рассказ__имя').textContent]);
  await p2.keyboard.press('Home');
  const вк2 = await p2.evaluate(() => document.activeElement.dataset.рассказ);
  итог.push(`Вкладки рассказов: со «Марк» стрелка вправо → ${вк[0]} (в адресе ${вк[1]}, текст «${вк[2]}»); Home → ${вк2}`);
  if (вк[0] !== 'Лк' || вк2 !== 'Мф') плохо.push('вкладки');
  await r2.ctx.close();
  const r3 = await открыть('ной', {}, 360, 640, 'light'); const p3 = r3.page;
  await p3.keyboard.press('Tab'); await p3.keyboard.press('Tab'); await p3.keyboard.press('Tab');
  const м = await p3.evaluate(() => document.activeElement.textContent.trim()); await p3.keyboard.press('Enter');
  await p3.keyboard.press('Tab'); await p3.keyboard.press('Tab');
  const м2 = await p3.evaluate(() => document.activeElement.textContent.trim().slice(0, 30));
  итог.push(`Телефон: Tab → «${м}», Enter открывает панель; Tab, Tab → «${м2}»`);
  await r3.ctx.close();
}
await browser.close();
for (const s of итог) console.log(s);
console.log(плохо.length ? 'ОШИБКИ: ' + плохо.join('; ') : 'Ошибок нет');
process.exit(плохо.length ? 1 : 0);
