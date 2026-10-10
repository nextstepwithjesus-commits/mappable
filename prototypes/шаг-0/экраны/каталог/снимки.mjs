// Снимки экрана 1 шага 0 (каталог книги): Бытие и Марк 1–3 × А, Б, В × светлая и тёмная × 1280×800 и 360×640;
// первый экран (…-экран.png) и вся страница (…-весь.png, в git не идёт). Ещё: телефон лёжа 640×360 и экран поиска
// на 360 с открытой клавиатурой (окно 360×360) — Ф-14. Снимок — после document.fonts.ready и загрузки картинок.
// Проверки: шрифты, горизонтальная прокрутка, ошибки JS, первый экран (заглавие и первая обложка целиком), порядок Tab.
// Запуск из корня проекта: node prototypes/шаг-0/экраны/каталог/снимки.mjs
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ПАПКА = dirname(fileURLToPath(import.meta.url));
const ВЫХОД = join(ПАПКА, 'снимки');
mkdirSync(ВЫХОД, { recursive: true });
const адрес = pathToFileURL(join(ПАПКА, 'каталог.html')).href;
const НАПР = { a: 'А', b: 'Б', v: 'В' };
const КНИГА = { gen: 'бытие', mk: 'марк' };

async function готово(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.waitForFunction(() => document.documentElement.dataset.fonts);
  return page.evaluate(() => document.documentElement.dataset.fonts);
}
// первый экран: видно заглавие книги и первая обложка целиком (поле и название)
const первыйЭкран = (page) => page.evaluate(() => {
  const h1 = document.querySelector('h1').getBoundingClientRect();
  const об = document.querySelector('.обложка');
  const поле = об.querySelector('.обложка__поле').getBoundingClientRect();
  const наз = об.querySelector('.обложка__название').getBoundingClientRect();
  return { h1: h1.bottom <= innerHeight, обложка: поле.top >= 0 && поле.bottom <= innerHeight, название: наз.bottom <= innerHeight, низОбложки: Math.round(наз.bottom) };
});

const browser = await chromium.launch();
const итог = [];
async function снять({ book, dir, theme, w, h, имя, весь = true, доп = '' }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: 1, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const ошибки = [];
  page.on('pageerror', (e) => ошибки.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') ошибки.push(m.text()); });
  await page.goto(`${адрес}?book=${book}&dir=${dir}&theme=${theme}${доп}`);
  const шрифты = await готово(page);
  await page.screenshot({ path: join(ВЫХОД, `${имя}-экран.png`) });
  if (весь) await page.screenshot({ path: join(ВЫХОД, `${имя}-весь.png`), fullPage: true });
  const гориз = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const пэ = доп.includes('search') ? null : await первыйЭкран(page);
  итог.push({ имя, шрифты, гориз, ошибки, пэ });
  await ctx.close();
}

for (const book of ['gen', 'mk']) {
  for (const dir of ['a', 'b', 'v']) {
    for (const theme of ['light', 'dark']) {
      for (const [w, h] of [[1280, 800], [360, 640]]) {
        await снять({ book, dir, theme, w, h, имя: `${КНИГА[book]}-${НАПР[dir]}-${theme === 'light' ? 'светлая' : 'тёмная'}-${w}` });
      }
    }
  }
}
// Ф-14: телефон лёжа и поиск с открытой клавиатурой (видимая часть окна около 360 px)
for (const dir of ['a', 'b', 'v']) {
  await снять({ book: 'gen', dir, theme: 'light', w: 640, h: 360, имя: `бытие-${НАПР[dir]}-светлая-640x360-лёжа`, весь: false });
  await снять({ book: 'gen', dir, theme: 'light', w: 360, h: 360, имя: `бытие-${НАПР[dir]}-светлая-360x360-поиск`, весь: false, доп: '&search=' + encodeURIComponent('Иак') });
}

// Порядок Tab: шапка и первые обложки (1280 и 360)
async function табы(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'light', locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(`${адрес}?book=gen&dir=a&theme=light`);
  await готово(page);
  const путь = [];
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    путь.push(await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el.closest('.обложка') || el);
      const рамка = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 3;
      const имя = (el.getAttribute('aria-label') || el.textContent || el.placeholder || el.id).replace(/\s+/g, ' ').trim().slice(0, 48);
      return `${el.tagName.toLowerCase()}${el.type ? '[' + el.type + ']' : ''} «${имя}»${рамка ? '' : ' (РАМКИ НЕТ)'}`;
    }));
  }
  if (w === 1280) await page.screenshot({ path: join(ВЫХОД, 'бытие-А-светлая-1280-фокус-на-обложке.png') });
  await ctx.close();
  return путь;
}
const таб1280 = await табы(1280, 800);
const таб360 = await табы(360, 640);
await browser.close();

for (const r of итог) {
  const п = r.пэ ? `; первый экран: заглавие ${r.пэ.h1 ? 'да' : 'НЕТ'}, поле первой обложки ${r.пэ.обложка ? 'да' : 'НЕТ'}, её название ${r.пэ.название ? 'да' : 'нет'} (низ названия ${r.пэ.низОбложки})` : '';
  console.log(`${r.имя}: шрифты ${r.шрифты}; гориз. прокрутка ${r.гориз > 0 ? r.гориз + ' px' : 'нет'}; ошибок JS ${r.ошибки.length}${r.ошибки.length ? ' — ' + r.ошибки.join(' | ') : ''}${п}`);
}
console.log('\nTab, 1280:'); таб1280.forEach((x, i) => console.log(`${i + 1}. ${x}`));
console.log('\nTab, 360:'); таб360.forEach((x, i) => console.log(`${i + 1}. ${x}`));
const плохо = итог.some((r) => r.шрифты !== 'ok' || r.гориз > 0 || r.ошибки.length || (r.пэ && !r.имя.includes('лёжа') && (!r.пэ.h1 || !r.пэ.обложка || (r.имя.startsWith('бытие') && !r.пэ.название))));
process.exit(плохо ? 1 : 0);
