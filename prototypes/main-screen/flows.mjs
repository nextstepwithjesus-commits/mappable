// Проверка переходов эскиза: node prototypes/main-screen/flows.mjs
// Н4: Авраам — Генеалогия → Время → География кнопками; «Назад»; «Продолжить»; журнал; клавиатура.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL0 = pathToFileURL(join(HERE, 'index.html')).href;
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const ok = [];
const fail = [];
const check = (cond, msg) => (cond ? ok : fail).push(msg);
const h1 = () => page.locator('main .scr-h, main h1').first().textContent();

await page.goto(URL0 + '?v=ab&host=1#/');
await page.evaluate(() => localStorage.clear());
await page.goto(URL0 + '?v=ab#/');
// Н4: маршрут → Генеалогия Авраама → Время → География
await page.click('text=Путь Авраама'); await page.waitForTimeout(120);
check((await h1()).includes('Путь Авраама'), 'плитка «Путь Авраама» открывает Географию');
await page.click('.ttabs >> text=Генеалогия'); await page.waitForTimeout(120);
check((await h1()).includes('Авраам'), 'Генеалогия Авраама');
check(await page.locator('.node.sel >> text=Авраам').count() === 1, 'Авраам выбран в Генеалогии');
await page.click('.ttabs >> text=Время'); await page.waitForTimeout(120);
check((await h1()).includes('Авраам — Время'), 'Время с Авраамом');
check(await page.locator('a.tp[aria-current="true"]').textContent() === 'Авраам', 'Авраам выбран во Времени');
await page.click('.ttabs >> text=География'); await page.waitForTimeout(120);
check((await h1()).includes('Путь Авраама'), 'География с Авраамом');
await page.click('[data-back]'); await page.waitForTimeout(120);
check((await h1()).includes('Авраам — Время'), '«Назад» возвращает во Время');
await page.goBack(); await page.waitForTimeout(120);
check((await h1()).includes('Авраам'), 'кнопка браузера «Назад» — в Генеалогию');
await page.click('[data-home]'); await page.waitForTimeout(120);
check(await page.locator('h1.brand').count() === 1, '«Главная» ведёт на главный экран');
const cont = await page.locator('[data-continue-link]').textContent();
check(cont.includes('Авраам — Генеалогия'), '«Продолжить» помнит место: ' + cont);
// Р1 ребёнок: Ной и сыновья
await page.click('text=Ной и его сыновья'); await page.waitForTimeout(120);
check(await page.locator('.node >> text=Сим').count() === 1 && await page.locator('.node >> text=Хам').count() === 1 && await page.locator('.node >> text=Иафет').count() === 1, 'Р1: видны Сим, Хам, Иафет');
// С1: адрес стиха
await page.fill('#q', 'Руф 4:17');
await page.press('#q', 'Enter'); await page.waitForTimeout(120);
check((await page.locator('.res .rname').allTextContents()).join(',') === 'Ноеминь,Овид,Иессей,Давид', 'С1: лица Руф 4:17');
// Раскладка
await page.fill('#q', 'lfdbl');
await page.press('#q', 'Enter'); await page.waitForTimeout(120);
check((await page.locator('.res .rname').first().textContent()) === 'Давид', 'раскладка: lfdbl → Давид');
// С3
await page.fill('#q', 'Рувим');
await page.press('#q', 'Enter'); await page.waitForTimeout(120);
check((await page.locator('.res .rname').allTextContents()).includes('Колено Рувимово'), 'С3: «Рувим» находит колено');
// С2: Быт 12:4 — 75 лет
await page.fill('#q', 'Быт 12:4');
await page.press('#q', 'Enter'); await page.waitForTimeout(120);
check((await page.locator('.rverse').textContent()).includes('семидесяти пяти лет'), 'С2: Быт 12:4');
// Вклейка стиха
await page.goto(URL0 + '?v=ab#/card/p-avraam');
await page.click('.mainverse .ref'); await page.waitForTimeout(120);
check((await page.locator('.inset').first().textContent()).includes('вменил'), 'вклейка стиха раскрывается');
// Скобки во вклейке
await page.goto(URL0 + '?v=ab#/gen/p-noy');
await page.click('.tparent .ref'); await page.waitForTimeout(120);
check(await page.locator('.inset .br').count() > 0 && (await page.locator('.inset .brnote').count()) === 1, 'скобки во вклейке выделены и подписаны');
// У2: указатель по книге Руфь
await page.goto(URL0 + '?v=ab#/');
await page.click('text=По книгам Библии'); await page.waitForTimeout(120);
await page.click('.books >> text=Руфь'); await page.waitForTimeout(120);
const nIdx = await page.locator('.ilist > li').count();
check(nIdx === 20, 'У2: в книге Руфь 20 имён (' + nIdx + ', ' + (await h1()) + ')');
// Вариант В: эпоха раскрывается, переход к Аврааму
await page.goto(URL0 + '?v=v#/');
await page.click('.ecell[data-epoch="patriarchs"]'); await page.waitForTimeout(120);
await page.click('#ep-panel .pick[data-pid="p-avraam"]'); await page.waitForTimeout(120);
await page.click('.acts >> text=География'); await page.waitForTimeout(120);
check((await h1()).includes('Путь Авраама'), 'В: эпоха → Авраам → География');
// Вариант Д: Ной → Генеалогия
await page.goto(URL0 + '?v=d#/');
await page.click('.trunk .anc .pick[data-pid="p-noy"]'); await page.waitForTimeout(120);
await page.click('.acts >> text=Генеалогия'); await page.waitForTimeout(120);
check((await h1()).includes('Ной'), 'Д: Ной → Генеалогия');
// Заглушка
await page.goto(URL0 + '?v=ab#/');
await page.click('text=Ученики Иисуса Христа'); await page.waitForTimeout(120);
check((await h1()).includes('не нарисован'), 'заглушка для не нарисованного экрана');
await page.click('[data-back]'); await page.waitForTimeout(120);
check(await page.locator('h1.brand').count() === 1, '«Вернуться» с заглушки');
// Журнал
const log = await page.evaluate(() => JSON.parse(localStorage.getItem('bn-sketch-log') || '[]'));
check(log.filter((e) => e.type === 'click').length > 10 && log.some((e) => e.type === 'search'), 'журнал пишет нажатия и поиск: ' + log.length);
await page.goto(URL0 + '?v=ab&host=1#/');
check(await page.locator('[data-host]').isVisible(), 'панель ведущего открывается по ?host=1');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-h-dl]')]);
const path = await dl.path();
const text = (await import('node:fs')).readFileSync(path, 'utf-8');
check(JSON.parse(text).entries.length > 10, 'журнал скачивается JSON: ' + dl.suggestedFilename());
await page.keyboard.press('Control+Alt+KeyH');
check(!(await page.locator('[data-host]').isVisible()), 'Ctrl+Alt+H прячет панель');
// Клавиатура: пройти карточку Давида
await page.goto(URL0 + '?v=ab#/card/p-david');
let tabs = 0, focusable = new Set();
for (; tabs < 80; tabs++) {
  await page.keyboard.press('Tab');
  const d = await page.evaluate(() => { const a = document.activeElement; if (a === document.body) return null; const s = getComputedStyle(a); return { t: (a.textContent || a.id).trim().slice(0, 20), o: s.outlineStyle + ' ' + s.outlineWidth }; });
  if (!d) break;
  focusable.add(d.t);
  if (!d.o.startsWith('solid')) { fail.push('нет видимого фокуса: ' + d.t); break; }
}
check(focusable.size > 30, 'клавиатура: по карточке Давида Tab проходит ' + focusable.size + ' элементов, фокус виден');
await browser.close();
console.log('ОК:\n  ' + ok.join('\n  '));
console.log('НЕ ПРОШЛО:', fail.length ? fail : 'нет');
console.log('ошибки страницы:', errors.length ? errors : 'нет');
process.exit(fail.length || errors.length ? 1 : 0);
