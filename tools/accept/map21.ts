/**
 * Сценарии приёмки этапа 21 «Пошаговая карта по эпохам» (docs/ui-review/STAGE21.md, решения 196–202), номера 1302–1311:
 *  — 1302 новый читатель: карта «Адам и Иисус Христос», между ними — нить линий Мессии, у Адама «⊕» вперёд, у Иисуса
 *    Христа — назад; линейка называет эпохи;
 *  — 1303 «⊕» справа от Адама — жена и дети одним щелчком; небо вписывает раскрытое; диктор называет шаг;
 *  — 1304 Иаков из поиска: сначала жёны (подсказка «жёны (4)»), у каждого союза — ромб с числом детей; затем все дети;
 *    «⊕» слева — родители, братья и сёстры;
 *  — 1305 «Свернуть потомков» Сифа не трогает ветвь Каина и Еву; «Свернуть потомков» Адама (все люди — его потомки)
 *    и «Свернуть предков» Иисуса Христа в карточке возвращают начало;
 *  — 1306 «Только это лицо» со всего неба: на карте один Сиф; Ctrl+Z возвращает всё небо;
 *  — 1307 журнал шагов: Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, кнопки строки показа, «Начать заново» (отменяется); в поле поиска
 *    Ctrl+Z — отмена поля, а не карты;
 *  — 1308 клавиши «]», «[» и «С» на карте;
 *  — 1309 «Указатель»: Новый Завет без Авраама, с Иосифом, мужем Марии; книга Руфь — 21 лицо; имя из указателя встаёт на
 *    карту закреплённым;
 *  — 1310 телефон 390 × 844: первый экран у Адама, касание «⊕» у края поля 44 px, команды листа не ниже 44 px;
 *  — 1311 axe (WCAG 2.2 AA): карточка с командами шагов, строка шагов, «Указатель» с частью Писания и книгой — 0 нарушений.
 * Новый читатель — окно без выбранного начала (open(…, { start: null })): обвязка приёмки (tools/accept.ts) иначе кладёт
 * начало «Всё небо», на котором проверяют свои вещи прежние сценарии.
 */
import type { Page } from 'playwright';
import { fail, hashId, pass, type Scenario } from './kit.ts';
import { axeOn, flat, open, starPt } from './unify11.ts';

const PHONE = { width: 390, height: 844, touch: true };
const canvas = (p: Page) => p.locator('.sky > canvas');

/** Дождаться покоя неба: рукоятки и места звёзд кадра не меняются три замера подряд (перелёт и переход закончились). */
async function settle(p: Page) {
  let last = '';
  let same = 0;
  for (let k = 0; k < 60 && same < 3; k++) {
    await p.waitForTimeout(250);
    const now = await p.evaluate(() => {
      const c = document.querySelector<HTMLElement>('.sky > canvas');
      return `${c?.dataset.handles ?? ''}|${c?.dataset.stars ?? ''}|${c?.dataset.trans ?? ''}`;
    });
    if (now === last) same++;
    else {
      same = 0;
      last = now;
    }
  }
}

/** Рукоятки шагов кадра (canvas[data-handles]: «лицо:fwd|back:x,y»), точки страницы. */
async function handles(p: Page) {
  const box = (await canvas(p).boundingBox())!;
  const h = (await canvas(p).getAttribute('data-handles')) ?? '';
  return h
    .split(';')
    .filter(Boolean)
    .map((q) => {
      const [id, dir, xy] = q.split(':');
      const [x, y] = xy.split(',').map(Number);
      return { id, dir, x: box.x + x, y: box.y + y };
    });
}

/** Нажать рукоятку лица (мышью или пальцем; dy — смещение от середины знака). Возвращает, нашлась ли она. */
async function step(p: Page, id: string, dir: 'fwd' | 'back', o: { touch?: boolean; dy?: number } = {}) {
  await settle(p);
  const h = (await handles(p)).find((q) => q.id === id && q.dir === dir);
  if (!h) return false;
  if (o.touch) await p.touchscreen.tap(h.x, h.y + (o.dy ?? 0));
  else await p.mouse.click(h.x, h.y + (o.dy ?? 0));
  await settle(p);
  if (!o.touch) await p.mouse.move(4, 4);
  return true;
}

/** Лица карты «набор» (память браузера toledot:work) и как они попали на карту. */
const mapOf = async (p: Page) =>
  new Map(await p.evaluate(() => (JSON.parse(localStorage.getItem('toledot:work') ?? '[]') as [string, { via: string }][]).map(([id, e]) => [id, e.via] as [string, string])));
const ids = async (p: Page) => [...(await mapOf(p)).keys()].sort().join(' ');
/** Показ неба (html[data-show]). */
const showNow = (p: Page) => p.evaluate(() => document.documentElement.dataset.show ?? '');
/** Всё, что сказано диктору (живые области). */
const said = (p: Page) => p.evaluate(() => [...document.querySelectorAll('[aria-live]')].map((e) => e.textContent ?? '').join(' | '));
/** Лица, чьи звёзды в кадре (canvas[data-stars] «id:x,y;…»; поля 8 px). */
async function inFrame(p: Page): Promise<Set<string>> {
  const box = (await canvas(p).boundingBox())!;
  const s = (await canvas(p).getAttribute('data-stars')) ?? '';
  const out = new Set<string>();
  for (const q of s.split(';').filter(Boolean)) {
    const i = q.lastIndexOf(':');
    const [x, y] = q.slice(i + 1).split(',').map(Number);
    if (x >= 8 && x <= box.width - 8 && y >= 8 && y <= box.height - 8) out.add(q.slice(0, i));
  }
  return out;
}
/** Выбрать лицо щелчком по его звезде (карточка — в колонке справа). */
async function pick(p: Page, id: string) {
  await settle(p);
  const pt = await starPt(p, id);
  if (!pt) return false;
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(900);
  await p.mouse.move(4, 4);
  return hashId(p) === id;
}
/** Найти лицо поиском (Enter — первое найденное) и дождаться покоя неба. */
async function seek(p: Page, q: string) {
  await p.click('#find');
  await p.fill('#find', q);
  await p.waitForTimeout(300);
  await p.keyboard.press('Enter');
  await settle(p);
  await p.mouse.move(4, 4);
}
/** Команда шагов карты в карточке (src/ui/card/MapSteps.tsx): fwd, back, fdesc, fanc, only. */
const cmd = (p: Page, key: string) => p.locator(`.folio .map-cmds .step-${key}`);
const NEW = { start: null, ms: 3500 } as const;

export const map21: Scenario[] = [
  {
    n: 1302,
    title: 'Этап 21, решение 200: новый читатель — карта «Адам и Иисус Христос», между ними нить линий Мессии; «⊕» вперёд у Адама и назад у Иисуса Христа; линейка называет эпохи',
    run: async (p) => {
      await open(p, '#/', NEW);
      await settle(p);
      if ((await showNow(p)) !== 's') return fail(`показ «${await showNow(p)}», а не пошаговая карта`);
      if ((await ids(p)) !== 'adam iisus') return fail(`на карте: ${await ids(p)}`);
      const seen = await inFrame(p);
      if (!seen.has('adam') || !seen.has('iisus')) return fail(`в кадре: ${[...seen].join(' ')}`);
      const h = (await handles(p)).map((q) => `${q.id}:${q.dir}`);
      if (!h.includes('adam:fwd') || !h.includes('iisus:back')) return fail(`рукоятки: ${h.join(' ')}`);
      // нить линий Мессии через свёрнутое: canvas[data-gaps] «откуда>куда:скрыто@x,y»
      const gaps = ((await canvas(p).getAttribute('data-gaps')) ?? '').split('|').filter(Boolean);
      const big = gaps.map((g) => Number(/:(\d+)@/.exec(g)?.[1] ?? 0)).filter((n) => n >= 50);
      if (!big.length) return fail(`нет нити линий Мессии между Адамом и Иисусом Христом: ${gaps.join(' ')}`);
      const ruler = (await canvas(p).getAttribute('data-ruler')) ?? '';
      if (!ruler || /\d/.test(ruler)) return fail(`линейка не называет эпохи: «${ruler}»`);
      return pass(`нить +${Math.max(...big)}; линейка: ${ruler.split('|').slice(0, 3).join(', ')}…`);
    },
  },
  {
    n: 1303,
    title: 'Этап 21, решение 197: «⊕» справа от Адама — жена и дети одним щелчком; небо вписывает раскрытое; диктор называет шаг',
    run: async (p) => {
      await open(p, '#/', NEW);
      if (!(await step(p, 'adam', 'fwd'))) return fail('у Адама нет рукоятки «вперёд»');
      const on = await ids(p);
      for (const id of ['eva', 'kain', 'avel', 'sif']) if (!on.split(' ').includes(id)) return fail(`после шага на карте нет «${id}»: ${on}`);
      const seen = await inFrame(p);
      const out = ['adam', 'eva', 'kain', 'avel', 'sif'].filter((id) => !seen.has(id));
      if (out.length) return fail(`за краем кадра: ${out.join(', ')}`);
      const t = flat(await said(p));
      if (!t.includes('Адам: раскрыты жена и дети')) return fail(`диктор: «${t.slice(0, 160)}»`);
      if (!(await handles(p)).some((q) => q.id === 'sif' && q.dir === 'fwd')) return fail('у Сифа нет рукоятки «вперёд»');
      return pass(`на карте: ${on}`);
    },
  },
  {
    n: 1304,
    title: 'Этап 21, решение 197: Иаков из поиска — сначала жёны (подсказка «жёны (4)»), у каждого союза ромб «+N»; затем все дети; «⊕» слева — родители, братья и сёстры',
    run: async (p) => {
      await open(p, '#/', NEW);
      await seek(p, 'Иаков');
      if ((await mapOf(p)).get('iakov') !== 'self') return fail(`Иаков не встал на карту закреплённым: ${await ids(p)}`);
      const h = (await handles(p)).find((q) => q.id === 'iakov' && q.dir === 'fwd');
      if (!h) return fail('у Иакова нет рукоятки «вперёд»');
      await p.mouse.move(h.x, h.y);
      await p.waitForTimeout(400);
      const tip = flat((await p.locator('.sky .tip').first().textContent()) ?? '');
      if (!tip.includes('жёны (4)')) return fail(`подсказка рукоятки: «${tip}»`);
      await step(p, 'iakov', 'fwd');
      let on = (await ids(p)).split(' ');
      const wives = ['liya', 'rakhil', 'valla', 'zelfa'];
      if (wives.some((w) => !on.includes(w))) return fail(`жёны не все: ${on.join(' ')}`);
      if (['ruvim', 'iosif', 'veniamin', 'dina'].some((k) => on.includes(k))) return fail(`дети раскрылись вместе с жёнами: ${on.join(' ')}`);
      const ds = ((await canvas(p).getAttribute('data-dots')) ?? '').split(';').filter((d) => /:0:-?\d+,-?\d+:[1-9]\d*$/.test(d));
      if (ds.length < 4) return fail(`свёрнутых ромбов с числом детей: ${ds.length}`);
      await step(p, 'iakov', 'fwd');
      on = (await ids(p)).split(' ');
      const kids = ['ruvim', 'simeon', 'leviy', 'iuda', 'dan', 'neffalim', 'gad', 'asir', 'issakhar', 'zavulon', 'dina', 'iosif', 'veniamin'];
      const miss = kids.filter((k) => !on.includes(k));
      if (miss.length) return fail(`после «Все дети» нет: ${miss.join(', ')}`);
      if (!(await step(p, 'iakov', 'back'))) return fail('у Иакова нет рукоятки «назад»');
      on = (await ids(p)).split(' ');
      const up = ['isaak', 'revekka', 'isav'].filter((k) => !on.includes(k));
      return up.length ? fail(`после «Родители» нет: ${up.join(', ')}`) : pass(`на карте ${on.length} лиц`);
    },
  },
  {
    n: 1305,
    title: 'Этап 21, решение 198: «Свернуть потомков» Сифа не трогает ветвь Каина и мать Еву; «Свернуть потомков» Адама и «Свернуть предков» Иисуса Христа в карточке возвращают начало',
    run: async (p) => {
      await open(p, '#/', NEW);
      await step(p, 'adam', 'fwd');
      await step(p, 'sif', 'fwd');
      if (!(await step(p, 'kain', 'fwd'))) return fail('у Каина нет рукоятки «вперёд»');
      const before = (await ids(p)).split(' ');
      if (!before.includes('enos') || !before.includes('enokh-syn-kaina')) return fail(`шаги не раскрыли Еноса и Еноха, сына Каина: ${before.join(' ')}`);
      await seek(p, 'Сиф');
      if (hashId(p) !== 'sif') return fail(`поиск выбрал «${hashId(p)}»`);
      if (!(await cmd(p, 'fdesc').count())) return fail('в карточке Сифа нет «Свернуть потомков»');
      await cmd(p, 'fdesc').click();
      await settle(p);
      const mid = (await ids(p)).split(' ');
      if (mid.includes('enos')) return fail(`Енос остался после свёртки потомков Сифа: ${mid.join(' ')}`);
      const lost = ['sif', 'eva', 'kain', 'enokh-syn-kaina'].filter((x) => !mid.includes(x));
      if (lost.length) return fail(`свёртка у Сифа убрала не своё: ${lost.join(', ')}`);
      // все люди — потомки Адама (и Мария с Иосифом — по Мф 1 и Лк 3): его свёртка оставляет только закреплённых
      await seek(p, 'Адам');
      await cmd(p, 'fdesc').click();
      await settle(p);
      if ((await ids(p)) !== 'adam iisus') return fail(`после свёртки потомков Адама: ${await ids(p)}`);
      if (await p.locator('.sky .sb-steps [data-cmd="restart"]').count()) return fail('у нетронутого начала осталась «Начать заново»');
      await seek(p, 'Иисус Христос');
      if (!(await step(p, 'iisus', 'back'))) return fail('у Иисуса Христа нет рукоятки «назад»');
      if (!(await ids(p)).split(' ').includes('mariya')) return fail(`«Родители» не раскрыли Марию: ${await ids(p)}`);
      await p.mouse.move(4, 4);
      if (hashId(p) !== 'iisus') await seek(p, 'Иисус Христос');
      if (!(await cmd(p, 'fanc').count())) return fail('в карточке Иисуса Христа нет «Свернуть предков»');
      await cmd(p, 'fanc').click();
      await settle(p);
      return (await ids(p)) === 'adam iisus' ? pass() : fail(`после свёртки предков Иисуса Христа: ${await ids(p)}`);
    },
  },
  {
    n: 1306,
    title: 'Этап 21, решение 198: «Только это лицо» со всего неба — на карте один Сиф, дальше шагами; Ctrl+Z возвращает всё небо',
    run: async (p) => {
      await open(p, '#/sif', { start: 'all', ms: 4000 });
      if ((await showNow(p)) !== 'a') return fail(`показ «${await showNow(p)}», а не всё небо`);
      if (!(await cmd(p, 'only').count())) return fail('в карточке Сифа нет «Только это лицо»');
      await cmd(p, 'only').click();
      await settle(p);
      if ((await showNow(p)) !== 's') return fail(`показ после «Только это лицо»: «${await showNow(p)}»`);
      if ((await ids(p)) !== 'sif') return fail(`на карте: ${await ids(p)}`);
      if (!(await handles(p)).some((q) => q.id === 'sif')) return fail('у Сифа нет рукояток шагов');
      await canvas(p).focus();
      await p.keyboard.press('Control+KeyZ');
      await settle(p);
      return (await showNow(p)) === 'a' ? pass() : fail(`после Ctrl+Z показ «${await showNow(p)}»`);
    },
  },
  {
    n: 1307,
    title: 'Этап 21, решение 199: журнал шагов — Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, «Отменить шаг», «Вернуть шаг», «Начать заново» (тоже отменяется); в поле поиска Ctrl+Z не трогает карту',
    run: async (p) => {
      await open(p, '#/', NEW);
      await step(p, 'adam', 'fwd');
      const one = await ids(p);
      await step(p, 'sif', 'fwd');
      const two = await ids(p);
      if (one === two) return fail('шаг у Сифа ничего не раскрыл');
      await canvas(p).focus();
      await p.keyboard.press('Control+KeyZ');
      await settle(p);
      if ((await ids(p)) !== one) return fail(`Ctrl+Z: ${await ids(p)}`);
      if (!flat(await said(p)).includes('Шаг отменён')) return fail('диктор не сказал «Шаг отменён»');
      await p.keyboard.press('Control+Shift+KeyZ');
      await settle(p);
      if ((await ids(p)) !== two) return fail(`Ctrl+Shift+Z: ${await ids(p)}`);
      const undoBtn = p.locator('.sky .sb-steps [data-cmd="undo"]');
      await undoBtn.click();
      await settle(p);
      await undoBtn.click();
      await settle(p);
      if ((await ids(p)) !== 'adam iisus') return fail(`две отмены кнопкой: ${await ids(p)}`);
      await canvas(p).focus();
      await p.keyboard.press('Control+KeyY');
      await settle(p);
      if ((await ids(p)) !== one) return fail(`Ctrl+Y: ${await ids(p)}`);
      await p.locator('.sky .sb-steps [data-cmd="restart"]').click();
      await settle(p);
      if ((await ids(p)) !== 'adam iisus') return fail(`«Начать заново»: ${await ids(p)}`);
      await p.locator('.sky .sb-steps [data-cmd="undo"]').click();
      await settle(p);
      if ((await ids(p)) !== one) return fail(`отмена «Начать заново»: ${await ids(p)}`);
      await p.click('#find');
      await p.keyboard.type('Ной');
      await p.keyboard.press('Control+KeyZ');
      await p.waitForTimeout(400);
      return (await ids(p)) === one ? pass() : fail(`Ctrl+Z в поле поиска изменил карту: ${await ids(p)}`);
    },
  },
  {
    n: 1308,
    title: 'Этап 21, решение 197: клавиши на карте — «]» раскрывает союз и ведёт к ребёнку, «[» — к родителю, «С» сворачивает потомков',
    run: async (p) => {
      await open(p, '#/', NEW);
      if (!(await pick(p, 'adam'))) return fail('щелчок по Адаму не выбрал его');
      await canvas(p).focus();
      await p.keyboard.press('BracketRight');
      await settle(p);
      const kid = hashId(p);
      if (!['kain', 'avel', 'sif'].includes(kid)) return fail(`«]» привёл к «${kid}»`);
      if (!(await ids(p)).split(' ').includes(kid)) return fail(`ребёнок не встал на карту: ${await ids(p)}`);
      await p.keyboard.press('BracketLeft');
      await settle(p);
      if (hashId(p) !== 'adam') return fail(`«[» привёл к «${hashId(p)}»`);
      // «С» — физическая клавиша KeyC (и на русской раскладке)
      await p.keyboard.press('KeyC');
      await settle(p);
      return (await ids(p)) === 'adam iisus' ? pass(`ребёнок: ${kid}`) : fail(`«С» оставил: ${await ids(p)}`);
    },
  },
  {
    n: 1309,
    title: 'Этап 21, решение 202: «Указатель» — Новый Завет без Авраама и с Иосифом, мужем Марии; книга Руфь — 21 лицо; имя из указателя встаёт на карту закреплённым',
    run: async (p) => {
      await open(p, '#/', NEW);
      await p.locator('header.top button', { hasText: 'Указатель' }).first().click();
      await p.waitForTimeout(600);
      const sheet = p.locator('.app > .sheet');
      if (!(await sheet.count())) return fail('«Указатель» не открылся');
      await sheet.locator('.canon button', { hasText: 'Новый Завет' }).click();
      await p.waitForTimeout(400);
      const nt = flat(await sheet.locator('.idx').innerText());
      if (/(^| )Авраам /.test(nt)) return fail('Авраам — в списке Нового Завета');
      if (!nt.includes('Иосиф')) return fail('в списке Нового Завета нет Иосифа');
      await sheet.locator('.canon button', { hasText: 'Ветхий Завет' }).click();
      await p.waitForTimeout(300);
      await sheet.locator('.book-pick select').selectOption({ label: 'Руфь' });
      await p.waitForTimeout(400);
      const rows = await sheet.locator('.idx button.row').count();
      if (rows !== 21) return fail(`в книге Руфь ${rows} лиц, а не 21`);
      await sheet.locator('.idx button.row', { hasText: 'Руфь' }).first().click();
      await settle(p);
      const via = (await mapOf(p)).get('ruf');
      return via === 'self' ? pass() : fail(`Руфь на карте: ${via ?? 'нет'}`);
    },
  },
  {
    n: 1310,
    title: 'Этап 21, решения 197 и 200, телефон 390 × 844 пальцем: первый экран у Адама; касание у края поля «⊕» (44 px) раскрывает семью; команды листа не ниже 44 px',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/', { start: null, ms: 4000 });
      await settle(p);
      if (!(await inFrame(p)).has('adam')) return fail('Адама нет в первом кадре');
      // касание на 16 px ниже середины знака (знак 16 px): поле цели раздуто до 44 × 44 (TOUCH_TARGET)
      if (!(await step(p, 'adam', 'fwd', { touch: true, dy: 16 }))) return fail('у Адама нет рукоятки «вперёд»');
      if (!(await ids(p)).split(' ').includes('sif')) return fail(`касание у края поля не раскрыло семью: ${await ids(p)}`);
      const pt = await starPt(p, 'adam');
      if (!pt) return fail('звезды Адама нет в кадре');
      await p.touchscreen.tap(pt.x, pt.y);
      await p.waitForTimeout(1200);
      const btns = p.locator('.dc-cmds button');
      const n = await btns.count();
      if (!n) return fail('в листе Адама нет команд шагов карты');
      const low: string[] = [];
      for (let i = 0; i < n; i++) {
        const b = (await btns.nth(i).boundingBox())!;
        if (b.height < 44) low.push(`${(await btns.nth(i).innerText()).trim()} ${b.height.toFixed(0)} px`);
      }
      if (low.length) return fail(`ниже 44 px: ${low.join(', ')}`);
      await p.locator('.dc-cmds button', { hasText: 'Свернуть потомков' }).tap();
      await settle(p);
      return (await ids(p)) === 'adam iisus' ? pass(`команд: ${n}`) : fail(`после «Свернуть потомков»: ${await ids(p)}`);
    },
  },
  {
    n: 1311,
    title: 'Этап 21: axe (WCAG 2.2 AA) — карточка с командами шагов, строка шагов, «Указатель» с частью Писания и книгой — 0 нарушений',
    run: async (p) => {
      await open(p, '#/', NEW);
      await step(p, 'adam', 'fwd');
      if (!(await pick(p, 'sif'))) return fail('щелчок по Сифу не выбрал его');
      if (!(await p.locator('.folio .map-cmds').count())) return fail('в карточке нет команд шагов');
      const bad = [...(await axeOn(p, '.folio')), ...(await axeOn(p, '.sky .sb-steps'))];
      await p.locator('header.top button', { hasText: 'Указатель' }).first().click();
      await p.waitForTimeout(600);
      await p.locator('.app > .sheet .canon button', { hasText: 'Ветхий Завет' }).click();
      await p.waitForTimeout(300);
      bad.push(...(await axeOn(p, '.app > .sheet')));
      return bad.length ? fail(bad.slice(0, 4).join(' | ')) : pass();
    },
  },
];
