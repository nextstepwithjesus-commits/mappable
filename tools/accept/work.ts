/**
 * Сценарии приёмки этапа 6b: решения владельца 16 и 17.
 * view — масштаб по двум осям и размер областей (J1, J2), номера 190–199;
 * workset — рабочий набор, небо по набору, свёртка, стопка карточек (J3–J6), номера 200–219.
 * Каждый агент правит только свой блок.
 */
import type { Scenario } from './kit.ts';

// view
const view: Scenario[] = [];

// workset
// J3–J6 (агент workset): рабочий набор, небо по набору, свёртка, стопка карточек. Проверки — по разметке и замерам неба:
// .sky canvas[data-mode|data-rows|data-named|data-folds|data-fold-hits], .sky[data-labels], localStorage «toledot:work».
import type { Page } from 'playwright';
import { pass as ok, fail as no, find as seek, hashId as idOf } from './kit.ts';

const W_PHONE = { width: 390, height: 844, touch: true };
const nbsp = (s: string) => s.replace(/ /g, ' ');
const wgo = async (p: Page, hash: string, ms = 2200) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Набор из памяти браузера: id лиц по порядку добавления. */
const stored = async (p: Page): Promise<string[]> => ((await p.evaluate(`JSON.parse(localStorage.getItem('toledot:work') || '[]').map((r) => r[0])`)) as string[]);
/** Замеры холста неба. */
const skyData = async (p: Page) => (await p.evaluate(`({ ...document.querySelector('.sky canvas').dataset, labels: document.querySelector('.sky').dataset.labels })`)) as Record<string, string>;
/** Взять лицо открытой карточки в работу: команда шапки и пункт выбора объёма (по подписи для диктора или по тексту). */
async function takeFromCard(p: Page, what: string, tap = false) {
  const b = p.locator('.folio .workbtn > button');
  if (tap) await b.tap();
  else await b.click();
  await p.waitForTimeout(250);
  const it = p.locator(`.workpick button[aria-label="${what}"], .workpick button:text-is("${what}")`).first();
  if (tap) await it.tap();
  else await it.click();
  await p.waitForTimeout(300);
}
/** Открыть панель «В работе» командой верхней строки (или из «Ещё», «Разделов»). */
async function openWork(p: Page, tap = false) {
  const direct = p.locator('.top .commands > button', { hasText: 'В работе' });
  if ((await direct.count()) && (await direct.first().isVisible())) await (tap ? direct.first().tap() : direct.first().click());
  else {
    const more = p.locator('.top .commands .menu > button');
    await (tap ? more.first().tap() : more.first().click());
    await p.waitForTimeout(200);
    const item = p.locator('.top .commands [role^="menuitem"]', { hasText: 'В работе' }).first();
    await (tap ? item.tap() : item.click());
  }
  await p.waitForTimeout(700);
}
/** Точка звезды выбранного лица на экране (data-sel — px холста). */
async function selPoint(p: Page): Promise<{ x: number; y: number } | null> {
  const v = await p.locator('.sky').getAttribute('data-sel');
  if (!v) return null;
  const [x, y] = v.split(' ').map(Number);
  const c = (await p.locator('.sky canvas').boundingBox())!;
  return { x: c.x + x, y: c.y + y };
}
/** Мировое место звезды выбранного лица (время и строка): по нему звезду находят после сдвига неба (как в phone.ts). */
async function worldSel(p: Page): Promise<{ X: number; row: number } | null> {
  return (await p.evaluate(`(() => {
    const el = document.querySelector('.sky');
    if (!el.dataset.sel) return null;
    const [sx, sy] = el.dataset.sel.split(' ').map(Number);
    const [, , , , x0, kx, laneTop, ky] = el.dataset.view.split(' ').map(Number);
    return { X: x0 + sx / kx, row: laneTop - sy / ky };
  })()`)) as { X: number; row: number } | null;
}
/** Точка экрана для мирового места при нынешней камере неба. */
async function screenOfWorld(p: Page, w: { X: number; row: number }): Promise<{ x: number; y: number }> {
  const [, , , , x0, kx, laneTop, ky] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
  const c = (await p.locator('.sky canvas').boundingBox())!;
  return { x: c.x + (w.X - x0) * kx, y: c.y + (laneTop - w.row) * ky };
}
/** Знак свёрнутого на небе: «вид:id» → середина его прямоугольника на экране. */
async function foldHit(p: Page, key: string): Promise<{ x: number; y: number } | null> {
  const d = await skyData(p);
  const hit = (d.foldHits ?? '').split(';').find((h) => h.startsWith(`${key}:`));
  if (!hit) return null;
  const [x, y, w, h] = hit.split(':')[2].split(',').map(Number);
  const c = (await p.locator('.sky canvas').boundingBox())!;
  return { x: c.x + x + w / 2, y: c.y + y + h / 2 };
}

const workset: Scenario[] = [
  {
    n: 200,
    title: 'J3 мышью: карточка Давида — «Взять в работу» с предками на 2 поколения; «В работе» в верхней строке, число лиц в заголовке, порядок по рождению',
    run: async (p) => {
      await wgo(p, '#/david');
      await takeFromCard(p, 'С предками: 2 поколения');
      const set = await stored(p);
      if (set.join(' ') !== 'david iessey ovid') return no(`набор: ${set.join(' ')}`);
      const b = p.locator('.folio .workbtn > button');
      if ((await b.innerText()).trim() !== 'В работе' || (await b.getAttribute('aria-pressed')) !== 'true') return no('команда карточки не стала «В работе»');
      await openWork(p);
      const title = nbsp(await p.locator('section.sheet h2').innerText());
      if (title !== 'В работе: 3 лица') return no(`заголовок панели: «${title}»`);
      const names = (await p.locator('.worklist .wi-row .nm').allInnerTexts()).map((t) => t.trim());
      if (names.join(' ') !== 'Овид Иессей Давид') return no(`порядок: ${names.join(', ')}`);
      // строка разворачивается: «Кратко» и команды
      await p.locator('.worklist .wi-row', { hasText: 'Иессей' }).click();
      await p.waitForTimeout(700);
      const body = p.locator('.worklist li.open .wi-body');
      if (!(await body.locator('.brief').count())) return no('у развёрнутой строки нет «Кратко»');
      const cmds = (await body.locator('button').allInnerTexts()).map((t) => t.trim());
      if (!cmds.includes('Открыть карточку') || !cmds.includes('Убрать из работы')) return no(`команды строки: ${cmds.join(', ')}`);
      return ok(`${title}; ${names.join(', ')}`);
    },
  },
  {
    n: 201,
    title: 'J3: набор переживает перезагрузку; «Убрать с родословной» убирает взятых с лицом; «Очистить набор» и «Вернуть»; пустой набор — строка о том, как его собрать',
    run: async (p) => {
      await wgo(p, '#/david');
      await takeFromCard(p, 'С семьёй');
      const n0 = (await stored(p)).length;
      await p.reload();
      await p.waitForTimeout(2200);
      if ((await stored(p)).length !== n0) return no('набор не пережил перезагрузку');
      await openWork(p);
      await p.locator('.worklist .wi-row:has(.nm:text-is("Давид"))').click();
      await p.waitForTimeout(500);
      await p.locator('.worklist li.open button', { hasText: 'Убрать с родословной' }).click();
      await p.waitForTimeout(400);
      if ((await stored(p)).length !== 0) return no(`после «Убрать с родословной» в наборе: ${(await stored(p)).join(' ')}`);
      const empty = nbsp(await p.locator('.work-empty').innerText());
      if (!/Взять в работу/.test(empty)) return no(`пустой набор: «${empty}»`);
      await wgo(p, '#/ruf');
      await takeFromCard(p, 'Только лицо');
      await p.locator('section.sheet button', { hasText: 'Очистить набор' }).click();
      await p.waitForTimeout(300);
      if ((await stored(p)).length) return no('«Очистить набор» не очистил');
      await p.locator('section.sheet button', { hasText: 'Вернуть очищенный набор' }).click();
      await p.waitForTimeout(300);
      return (await stored(p)).join(' ') === 'ruf' ? ok(`${n0} лиц с семьёй; перезагрузка; очистка и возврат`) : no('«Вернуть» не вернул набор');
    },
  },
  {
    n: 202,
    title: 'J3 клавиатурой: Enter на «Взять в работу» — фокус на «Только лицо», Enter берёт; Escape закрывает выбор и возвращает фокус',
    run: async (p) => {
      await wgo(p, '#/ruf');
      await p.locator('.folio .workbtn > button').focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(250);
      const f = (await p.evaluate('document.activeElement && document.activeElement.textContent')) as string;
      if (f?.trim() !== 'Только лицо') return no(`фокус после открытия: «${f}»`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      const back = (await p.evaluate(`document.activeElement === document.querySelector('.folio .workbtn > button')`)) as boolean;
      if (!back || (await p.locator('.workpick').count())) return no('Escape не закрыл выбор или фокус не вернулся');
      if (!(await p.locator('.folio').count())) return no('Escape закрыл карточку');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(250);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      return (await stored(p)).join(' ') === 'ruf' ? ok() : no(`набор: ${(await stored(p)).join(' ')}`);
    },
  },
  {
    n: 203,
    title: 'J3: строка поиска — «в работу» щелчком и Shift+Enter; список остаётся открытым',
    run: async (p) => {
      await p.click('#find');
      await p.fill('#find', 'Руфь');
      await p.waitForTimeout(400);
      const cmd = p.locator('#find-results .result .row-cmd').first();
      if (!(await cmd.count())) return no('в строке результата нет команды «в работу» (ждёт rowCmd в Combobox.tsx)');
      await cmd.click();
      await p.waitForTimeout(300);
      if (!(await stored(p)).includes('ruf')) return no(`после щелчка набор: ${(await stored(p)).join(' ')}`);
      if ((await cmd.innerText()).trim() !== 'в работе') return no(`надпись после щелчка: «${await cmd.innerText()}»`);
      await p.fill('#find', 'Вооз');
      await p.waitForTimeout(400);
      await p.keyboard.press('Shift+Enter');
      await p.waitForTimeout(300);
      const set = await stored(p);
      if (!set.includes('vooz')) return no(`после Shift+Enter набор: ${set.join(' ')}`);
      if (!(await p.locator('#find-results').count())) return no('список закрылся');
      return idOf(p) ? no('Shift+Enter выбрал лицо') : ok(set.join(' '));
    },
  },
  {
    n: 204,
    title: 'J3: «Родство» Иоав — Давид — «взять путь в работу» кладёт в набор все лица пути',
    run: async (p) => {
      await wgo(p, '#/ioav~bdavid~pkinship', 2600);
      const rel = p.locator('section.sheet .relation').first();
      const b = rel.getByRole('button', { name: 'взять путь в работу' });
      if (!(await b.count())) return no('нет команды «взять путь в работу»');
      await b.click();
      await p.waitForTimeout(400);
      const set = await stored(p);
      const path = ((await p.locator('.sky').getAttribute('data-kin-path')) ?? '').split(' ').filter(Boolean);
      if (!path.length || !path.every((id) => set.includes(id))) return no(`путь ${path.join(' ')}; набор ${set.join(' ')}`);
      const done = rel.getByRole('button', { name: 'путь в работе' });
      return (await done.count()) ? ok(set.join(' ')) : no('команда не стала «путь в работе»');
    },
  },
  {
    n: 205,
    title: 'J3 на небе: подсказка звезды называет клавишу «В (D)»; клавиша берёт лицо под указателем в работу, повторная — убирает',
    run: async (p) => {
      await wgo(p, '#/david');
      const at = await selPoint(p);
      if (!at) return no('нет звезды Давида');
      await p.mouse.move(at.x, at.y);
      await p.waitForTimeout(500);
      const tip = p.locator('.sky .tip[data-id="david"] .tip-keys');
      if (!(await tip.count())) return no('в подсказке нет строки клавиш');
      if (!/В \(D\) — взять в работу/.test(nbsp(await tip.innerText()))) return no(`подсказка: «${await tip.innerText()}»`);
      await p.keyboard.press('KeyD');
      await p.waitForTimeout(300);
      if ((await stored(p)).join(' ') !== 'david') return no(`после D: ${(await stored(p)).join(' ')}`);
      await p.keyboard.press('KeyD');
      await p.waitForTimeout(300);
      return (await stored(p)).length === 0 ? ok() : no('повторная D не убрала лицо');
    },
  },
  {
    n: 206,
    title: 'J4 мышью: «На небе: в работе» — только лица набора, все подписаны, наложений нет, полосы сжаты; «Всё небо» вписывает набор; «все лица» возвращает небо',
    run: async (p) => {
      await wgo(p, '#/david');
      await takeFromCard(p, 'С предками: 3 поколения');
      await takeFromCard(p, 'С семьёй');
      const n = (await stored(p)).length;
      await p.locator('.skyctl button', { hasText: 'в работе' }).click();
      await p.waitForTimeout(2000);
      let d = await skyData(p);
      if (d.mode !== 'work') return no(`режим неба: ${d.mode}`);
      const [lab, over] = (d.labels ?? '0/0').split('/').map(Number);
      if (over) return no(`наложений подписей: ${over}`);
      const rows = Number(d.rows);
      if (!(rows < n * 1.7)) return no(`строк: ${rows} при ${n} лицах`);
      // «Всё небо» — вписать набор: все лица в видимой части
      await p.locator('.skyctl button', { hasText: 'Всё небо' }).click();
      await p.waitForTimeout(1800);
      d = await skyData(p);
      const [named, stars] = (d.named ?? '0/0').split('/').map(Number);
      if (named !== stars || stars < n - 6) return no(`подписано ${named} из ${stars} видимых (в наборе ${n})`);
      await p.locator('.skyctl button', { hasText: 'все лица' }).click();
      await p.waitForTimeout(1500);
      d = await skyData(p);
      return d.mode === 'all' && Number(d.rows) > 300 ? ok(`${n} лиц, ${rows} строк, подписей ${lab}, на экране подписано ${named}/${stars}`) : no(`после «все лица»: ${d.mode}, строк ${d.rows}`);
    },
  },
  {
    n: 207,
    title: 'J4: пустой набор в режиме «в работе» — строка у кромки неба, «Показать все лица» возвращает небо; лицо вне набора — «Взять в работу»',
    run: async (p) => {
      await p.locator('.skyctl button', { hasText: 'в работе' }).click();
      await p.waitForTimeout(800);
      const bar = p.locator('.sky .workbar');
      if (!(await bar.count()) || !/Рабочий набор пуст/.test(nbsp(await bar.innerText()))) return no('нет строки пустого набора');
      await seek(p, 'Руфь');
      if (!/не в рабочем наборе/.test(nbsp(await bar.innerText()))) return no(`строка при лице вне набора: «${await bar.innerText()}»`);
      await bar.getByRole('button', { name: 'Взять в работу' }).click();
      await p.waitForTimeout(800);
      if ((await stored(p)).join(' ') !== 'ruf' || (await bar.count())) return no('«Взять в работу» строки не взяло лицо');
      const d = await skyData(p);
      if (d.named !== '1/1') return no(`на небе подписано ${d.named}`);
      await p.keyboard.press('Escape');
      await p.locator('.skyctl button', { hasText: 'все лица' }).click();
      await p.waitForTimeout(600);
      return (await skyData(p)).mode === 'all' ? ok() : no('не вернулись ко всем лицам');
    },
  },
  {
    n: 208,
    title: 'J4 пальцем, 390 × 844: лист «Вид» — «На небе: в работе»; небо — только набор, подписи без наложений, подписано не меньше 95 %',
    view: W_PHONE,
    run: async (p) => {
      await wgo(p, '#/david', 2600);
      await p.locator('.folio .bar-toggle').tap();
      await p.waitForTimeout(600);
      await takeFromCard(p, 'С семьёй', true);
      await p.locator('.folio .sheet-bar .close').tap();
      await p.waitForTimeout(600);
      await p.locator('.skyctl.column button', { hasText: 'Вид' }).tap();
      await p.waitForTimeout(400);
      await p.locator('.sky .sheet button', { hasText: 'в работе' }).tap();
      await p.waitForTimeout(300);
      await p.locator('.sky .sheet .sheet-head .close').tap();
      await p.waitForTimeout(1800);
      const d = await skyData(p);
      const [, over] = (d.labels ?? '0/0').split('/').map(Number);
      const [named, stars] = (d.named ?? '0/0').split('/').map(Number);
      if (d.mode !== 'work' || over) return no(`режим ${d.mode}, наложений ${over}`);
      // на 390 px семья Давида стоит плотнее, чем помещаются имена без наложений: подпись, которой нет места, не рисуется
      // (наложений нет — это важнее); подписано не меньше 95 % видимых лиц набора
      const why = `подписано ${named}/${stars}${d.unnamed ? `; без подписи: ${d.unnamed}` : ''}`;
      return stars > 10 && named / stars >= 0.95 ? ok(why) : no(why);
    },
  },
  {
    n: 209,
    title: 'J5 мышью: «Свернуть потомков» Давида — знак «+N» справа от следа, потомки не рисуются; щелчок по знаку разворачивает',
    run: async (p) => {
      await wgo(p, '#/david');
      await p.locator('.folio .workcmds button', { hasText: 'Свернуть потомков' }).click();
      await p.waitForTimeout(900);
      let d = await skyData(p);
      const m = /desc:david:(\d+)/.exec(d.folds ?? '');
      if (!m) return no(`свёрнутого нет: ${d.folds}`);
      const at = await foldHit(p, 'desc:david');
      if (!at) return no('знака «+N» на экране нет');
      const star = (await selPoint(p))!;
      if (at.x <= star.x) return no('знак не справа от звезды');
      if ((await p.locator('.folio .workcmds button', { hasText: 'Развернуть потомков' }).count()) !== 1) return no('команда не стала «Развернуть потомков»');
      await p.mouse.click(at.x, at.y);
      await p.waitForTimeout(900);
      d = await skyData(p);
      if (d.folds) return no(`после щелчка по знаку свёрнуто: ${d.folds}`);
      return idOf(p) === 'david' ? ok(`скрыто ${m[1]} лиц`) : no('щелчок по знаку сменил выбор');
    },
  },
  {
    n: 210,
    title: 'J5 клавиатурой: «С» (C) сворачивает и разворачивает потомков выбранного лица; свёрнутое помнится в сеансе',
    run: async (p) => {
      await wgo(p, '#/saul');
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('KeyC');
      await p.waitForTimeout(700);
      if (!/desc:saul:/.test((await skyData(p)).folds ?? '')) return no('C не свернула потомков Саула');
      const rows = Number((await skyData(p)).rows);
      if (!(rows < 334)) return no(`полосы не сжались: ${rows}`);
      await p.reload();
      await p.waitForTimeout(2200);
      if (!/desc:saul:/.test((await skyData(p)).folds ?? '')) return no('после перезагрузки свёрнутое забыто');
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('KeyC');
      await p.waitForTimeout(700);
      return (await skyData(p)).folds ? no('повторная C не развернула') : ok(`строк при свёрнутых потомках Саула: ${rows}`);
    },
  },
  {
    n: 211,
    title: 'J5: правая кнопка по звезде Исава — меню неба; «Свернуть созвездие «Едом»» — строка-подпись с числом лиц; щелчок по ней разворачивает',
    run: async (p) => {
      await wgo(p, '#/isav');
      const at = await selPoint(p);
      if (!at) return no('нет звезды Исава');
      await p.mouse.click(at.x, at.y, { button: 'right' });
      await p.waitForTimeout(400);
      const menu = p.locator('.sky .skymenu');
      if (!(await menu.count())) return no('меню неба не открылось');
      const g = menu.locator('button', { hasText: 'Свернуть созвездие' });
      if (!/«Едом»/.test(await g.innerText())) return no(`команда: «${await g.innerText()}»`);
      await g.click();
      await p.waitForTimeout(900);
      const d = await skyData(p);
      if (!/group:edomites:\d+/.test(d.folds ?? '')) return no(`свёрнуто: ${d.folds}`);
      const hit = await foldHit(p, 'group:edomites');
      if (!hit) return no('строки-подписи на экране нет');
      await p.mouse.click(hit.x, hit.y);
      await p.waitForTimeout(800);
      return (await skyData(p)).folds ? no('щелчок по подписи не развернул') : ok(d.folds);
    },
  },
  {
    n: 212,
    title: 'J3, J5 пальцем, 390 × 844: долгое касание звезды — меню неба с «Взять в работу» и «Свернуть потомков»',
    view: W_PHONE,
    run: async (p) => {
      await wgo(p, '#/david', 2600);
      const w = await worldSel(p);
      if (!w) return no('нет звезды Давида');
      await p.locator('.folio .sheet-bar .close').tap();
      await p.waitForTimeout(900);
      const pt = await screenOfWorld(p, w);
      const cdp = await p.context().newCDPSession(p);
      const touch = [{ x: pt.x, y: pt.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch });
      await p.waitForTimeout(800);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await p.waitForTimeout(400);
      const menu = p.locator('.sky .skymenu');
      if (!(await menu.count())) return no('долгое касание не открыло меню');
      const texts = (await menu.locator('button').allInnerTexts()).map((t) => t.trim());
      if (!texts.includes('Только лицо') || !texts.includes('Свернуть потомков')) return no(`меню: ${texts.join(', ')}`);
      await menu.locator('button', { hasText: 'Только лицо' }).tap();
      await p.waitForTimeout(300);
      return (await stored(p)).join(' ') === 'david' && !idOf(p) ? ok() : no(`набор ${(await stored(p)).join(' ')}; выбрано ${idOf(p)}`);
    },
  },
  {
    n: 213,
    title: 'J6 мышью: карточки стопкой — открытые прежде строками «имя, уточнение, годы» над активной; щелчок делает активной; «Свернуть» и «×»',
    run: async (p) => {
      await wgo(p, '#/ruf', 1800);
      await wgo(p, '#/vooz', 1800);
      await wgo(p, '#/david', 2000);
      const rows = () => p.locator('.folio .stack .stack-row:not(.active)');
      const ids = async () => rows().evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
      if ((await ids()).join(' ') !== 'vooz ruf') return no(`строки стопки: ${(await ids()).join(' ')}`);
      const t = nbsp(await rows().first().innerText()).replace(/\s+/g, ' ').replace(/ ,/g, ',');
      if (!/^Вооз, .+ род\. ок\./.test(t)) return no(`строка: «${t}»`);
      await rows().nth(1).locator('.sr-open').click();
      await p.waitForTimeout(900);
      if (idOf(p) !== 'ruf') return no(`после щелчка по Руфи выбрано ${idOf(p)}`);
      if ((await ids()).join(' ') !== 'david vooz') return no(`стопка после щелчка: ${(await ids()).join(' ')}`);
      await p.locator('.folio .fold-card').click();
      await p.waitForTimeout(300);
      const act = p.locator('.folio .stack-row.active');
      if (!(await act.count()) || (await p.locator('.folio .mast').count())) return no('«Свернуть» не свернула активную карточку');
      await act.locator('.sr-open').click();
      await p.waitForTimeout(300);
      if (!(await p.locator('.folio .mast').count())) return no('щелчок не развернул');
      await rows().first().locator('.close').click();
      await p.waitForTimeout(300);
      return (await ids()).join(' ') === 'vooz' && idOf(p) === 'ruf' ? ok() : no(`после «×» строки: ${(await ids()).join(' ')}, выбрано ${idOf(p)}`);
    },
  },
  {
    n: 214,
    title: 'J6: щелчок по звезде на небе кладёт её карточку наверх стопки; стопка — не больше 6 лиц и помнится в сеансе',
    run: async (p) => {
      await wgo(p, '#/ruf', 1800);
      const ruth = await worldSel(p);
      for (const id of ['vooz', 'adam', 'sif', 'enos', 'kainan', 'maleleil']) await wgo(p, `#/${id}`, 900);
      await p.waitForTimeout(800);
      const ids = async () => p.locator('.folio .stack .stack-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
      const a = await ids();
      if (a.length !== 5 || a.includes('ruf')) return no(`строки стопки (6 лиц, Руфь — седьмая): ${a.join(' ')}`);
      // вернуться к Руфи щелчком по её звезде на небе
      await wgo(p, '#/vooz', 1800);
      const pt = await screenOfWorld(p, ruth!);
      await p.mouse.click(pt.x, pt.y);
      await p.waitForTimeout(900);
      if (idOf(p) !== 'ruf') return no(`щелчок по звезде Руфи выбрал «${idOf(p)}»`);
      const b = await ids();
      if (b[0] !== 'vooz' || b.length !== 5) return no(`стопка после щелчка: ${b.join(' ')}`);
      await p.reload();
      await p.waitForTimeout(2200);
      const c = await ids();
      return c.join(' ') === b.join(' ') ? ok(`стопка: ruf ${c.join(' ')}`) : no(`после перезагрузки: ${c.join(' ')}`);
    },
  },
  {
    n: 215,
    title: 'J6 пальцем, 390 × 844: стопка — строка над листом; касание делает карточку активной',
    view: W_PHONE,
    run: async (p) => {
      await wgo(p, '#/ruf', 1600);
      await wgo(p, '#/david', 2400);
      const strip = p.locator('.folio .stack-strip');
      if (!(await strip.count())) return no('нет строки стопки над листом');
      const sb = (await strip.boundingBox())!;
      const fb = (await p.locator('.folio .sheet-bar').boundingBox())!;
      if (sb.y + sb.height > fb.y + 2) return no(`строка стопки не над листом: ${sb.y + sb.height} > ${fb.y}`);
      await strip.locator('.sr-open', { hasText: 'Руфь' }).tap();
      await p.waitForTimeout(900);
      if (idOf(p) !== 'ruf') return no(`после касания выбрано ${idOf(p)}`);
      const names = (await p.locator('.folio .stack-strip .sr-open').allInnerTexts()).map((t) => t.trim());
      return names.join(' ') === 'Давид' ? ok() : no(`в строке: ${names.join(', ')}`);
    },
  },
];

export const work: Scenario[] = [...view, ...workset];
