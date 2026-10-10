// Снимки листа-образца: А и Б × светлая и тёмная × 1280×800 и 360×640; весь лист и первый экран.
// Снимок делается после загрузки шрифтов (document.fonts.ready) и картинок.
// Ещё: блок «проба h1» и знак приложения при плотности 2×; проверка копии стиха без меток.
// Запуск из корня проекта: node prototypes/шаг-0/лист/снимки.mjs
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ПАПКА } from './токены.mjs';

const КОРЕНЬ = join(ПАПКА, '..', '..', '..');
const ВЫХОД = join(ПАПКА, 'снимки');
mkdirSync(ВЫХОД, { recursive: true });
const адрес = pathToFileURL(join(ПАПКА, 'лист.html')).href;

// ожидаемая копия абзаца Быт 6:9–22 — строки synodal.tsv, через пробел
const tsv = readFileSync(join(КОРЕНЬ, 'tools/bible/synodal.tsv'), 'utf8').split('\n')
  .map((l) => l.split('\t')).filter((p) => p[0] === 'Быт' && p[1] === '6' && +p[2] >= 9 && +p[2] <= 22).map((p) => p[3]);
const ожидание = tsv.join(' ');

async function готово(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.waitForFunction(() => document.documentElement.dataset.fonts);
  return page.evaluate(() => document.documentElement.dataset.fonts);
}

const browser = await chromium.launch();
const итог = [];
let копия = null;
for (const dir of ['a', 'b']) {
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of [[1280, 800], [360, 640]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const ошибки = [];
      page.on('pageerror', (e) => ошибки.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') ошибки.push(m.text()); });
      await page.goto(`${адрес}?dir=${dir}&theme=${theme}`);
      const шрифты = await готово(page);
      const имя = `${dir === 'a' ? 'А' : 'Б'}-${theme === 'light' ? 'светлая' : 'тёмная'}-${w}`;
      await page.screenshot({ path: join(ВЫХОД, `${имя}-экран.png`) });
      await page.screenshot({ path: join(ВЫХОД, `${имя}-весь.png`), fullPage: true });
      const гориз = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (копия === null) {
        копия = await page.evaluate(() => {
          const p = document.querySelector('#текст-простой p');
          const r = document.createRange(); r.selectNodeContents(p);
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
          const t = s.toString(); s.removeAllRanges(); return t;
        });
      }
      итог.push({ имя, шрифты, гориз, ошибки });
      await ctx.close();
    }
  }
}
// плотность 2×: проба h1 и знак приложения
for (const dir of ['a', 'b']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${адрес}?dir=${dir}&theme=light`);
  await готово(page);
  const б = dir === 'a' ? 'А' : 'Б';
  await page.locator('.проба-h1').screenshot({ path: join(ВЫХОД, `${б}-проба-h1-2x.png`) });
  await page.locator('#знак-образец').screenshot({ path: join(ВЫХОД, `${б}-знак-приложения-2x.png`) });
  await ctx.close();
}
await browser.close();

const копияВерна = копия.replace(/\s+/g, ' ').trim() === ожидание;
for (const r of итог) console.log(`${r.имя}: шрифты ${r.шрифты}; горизонтальная прокрутка ${r.гориз > 0 ? r.гориз + ' px' : 'нет'}; ошибок JS ${r.ошибки.length}${r.ошибки.length ? ' — ' + r.ошибки.join(' | ') : ''}`);
console.log(`Копия Быт 6:9–22 без меток = synodal.tsv: ${копияВерна ? 'да' : 'НЕТ'}`);
if (!копияВерна) { console.log('получено:  ', копия.slice(0, 300)); console.log('ожидалось: ', ожидание.slice(0, 300)); }
const плохо = итог.some((r) => r.шрифты !== 'ok' || r.гориз > 0 || r.ошибки.length) || !копияВерна;
process.exit(плохо ? 1 : 0);
