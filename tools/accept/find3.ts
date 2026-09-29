/**
 * Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа find3: номера 390–409, поиск,
 * указатель и панели (L6). Проверки — по разметке списка поиска (#find-results, живая область .search [aria-live]),
 * адресу, панелям и замерам геометрии строк указателя и синопсиса.
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };
const flat = (s: string) => s.replace(/⁠/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const go = async (p: Page, hash: string, ms = 2200) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Набрать запрос в поле поиска (ссылке на стих — время на тома карточек и текст книги). */
async function type(p: Page, q: string) {
  await p.click('#find');
  await p.fill('#find', q);
  await p.waitForTimeout(/\d/.test(q) ? 2500 : 500);
}
const options = async (p: Page) => (await p.locator('#find-results [role="option"]').allInnerTexts()).map(flat);
const activeOption = async (p: Page) => {
  const id = await p.locator('#find').getAttribute('aria-activedescendant');
  return id ? flat(await p.locator(`#${id}`).innerText()) : '';
};
const live = async (p: Page) => flat((await p.locator('.search [aria-live="polite"]').first().textContent()) ?? '');
const emptyText = async (p: Page) => ((await p.locator('#find-results .empty').count()) ? flat(await p.locator('#find-results .empty').innerText()) : '');
const sheetTitle = async (p: Page) => ((await p.locator('section.sheet h2').count()) ? flat(await p.locator('section.sheet h2').first().innerText()) : '');

export const find3: Scenario[] = [
  {
    n: 390,
    title: 'IX-71: «Иосиф муж Марии» + Enter — Иосиф, муж Марии; «царь Давид» — Давид первым; «Иосиф муж Рахили» — «по имени «Иосиф»», а не «в атласе нет»',
    run: async (p) => {
      await type(p, 'Иосиф муж Марии');
      const first = (await options(p))[0] ?? '';
      if (!/Иосиф/.test(first) || !/муж Марии/.test(first)) return fail(`первая строка: «${first}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      if (hashId(p) !== 'iosif-muzh-marii') return fail(`Enter открыл ${hashId(p)}`);
      await type(p, 'царь Давид');
      const d = (await options(p))[0] ?? '';
      if (!/^Давид/.test(d)) return fail(`«царь Давид»: первая строка «${d}»`);
      await type(p, 'Иосиф муж Рахили');
      const head = (await p.locator('#find-results .grp-head').allInnerTexts()).map(flat);
      if (!/^По всем словам ничего; по имени «Иосиф» — \d+ лиц$/.test(head[0] ?? '')) return fail(`подпись: «${head[0]}»`);
      const said = await live(p);
      if (!/По всем словам ничего/.test(said)) return fail(`живая область: «${said}»`);
      if (/в атласе нет/.test(await p.locator('#find-results').innerText())) return fail('«в атласе нет» при найденном имени');
      return pass(`${first}; ${d}; ${head[0]}`);
    },
  },
  {
    n: 391,
    title: 'IX-55: «Сын» не находит Давида, Иисуса Навина и Иакова по уточнению; «сын Иессея» — Давид первым',
    run: async (p) => {
      await type(p, 'Сын');
      const rows = await options(p);
      const bad = rows.find((r) => /^(Давид|Иисус Навин|Иаков)\b/.test(r) || /сын Исаака|сын Иессея/.test(r));
      if (bad) return fail(`«Сын» нашёл: «${bad}»`);
      await type(p, 'сын Иессея');
      const first = (await options(p)).find((r) => !/на небе$/.test(r)) ?? '';
      return /^Давид/.test(first) ? pass(`«Сын»: ${rows.length} строк без уточнений; «сын Иессея» — ${first}`) : fail(`«сын Иессея»: «${first}»`);
    },
  },
  {
    n: 392,
    title: 'IX-75: «Мф 1» — первая строка «Читать Мф 1 — имена со ссылками», Enter открывает «Главы» на Мф 1, карточка не открывается; «Руф 4:21» + Enter — все лица стиха отмечены',
    run: async (p) => {
      await type(p, 'Мф 1');
      const rows = await options(p);
      if (rows[0] !== 'Читать Мф 1 — имена со ссылками') return fail(`первая строка: «${rows[0]}»`);
      if (!/^Все \d+ на небе$/.test(rows[1] ?? '')) return fail(`вторая строка: «${rows[1]}»`);
      if ((await activeOption(p)) !== rows[0]) return fail(`курсор: «${await activeOption(p)}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      if (hashId(p)) return fail(`открылась карточка ${hashId(p)}`);
      if (!/Чтение глав/.test(await sheetTitle(p))) return fail(`панель: «${await sheetTitle(p)}»`);
      const pressed = flat((await p.locator('section.sheet .toc button[aria-pressed="true"]').getAttribute('aria-label')) ?? '');
      if (pressed !== 'Мф 1') return fail(`глава: «${pressed}»`);
      await type(p, 'Руф 4:21');
      const v = await activeOption(p);
      if (!/^Все \d+ из стиха на небе$/.test(v)) return fail(`стих: курсор на «${v}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      const bar = p.locator('.pickbar', { hasText: /Отмечено/ });
      if (!(await bar.count())) return fail('отметок стиха нет');
      return pass(`Мф 1 — «Чтение глав», ${rows[1]}; Руф 4:21 — ${v}`);
    },
  },
  {
    n: 393,
    title: 'IX-82, UX-82: «Мф 29» — «Такой главы нет: в Евангелии от Матфея 28 глав»; «Быт 5:40» — «Такого стиха нет: в Быт 5 — 32 стиха»; то же слышит диктор',
    run: async (p) => {
      await type(p, 'Мф 29');
      const a = await emptyText(p);
      if (a !== 'Такой главы нет: в Евангелии от Матфея 28 глав.') return fail(`«Мф 29»: «${a}»`);
      if (!/Такой главы нет/.test(await live(p))) return fail(`живая область: «${await live(p)}»`);
      await type(p, 'Быт 5:40');
      const b = await emptyText(p);
      if (b !== 'Такого стиха нет: в Быт 5 — 32 стиха.') return fail(`«Быт 5:40»: «${b}»`);
      await type(p, 'Быт 51:1');
      const c = await emptyText(p);
      return c === 'Такой главы нет: в книге Бытия 50 глав.' ? pass(`${a} ${b} ${c}`) : fail(`«Быт 51:1»: «${c}»`);
    },
  },
  {
    n: 394,
    title: 'IX-84: Shift+Enter («в работу») в строке поиска объявляет «Иессей добавлен в набор; в наборе N лиц» — как клавиша В на небе',
    run: async (p) => {
      await type(p, 'Иессей');
      await p.keyboard.press('Shift+Enter');
      await p.waitForTimeout(300);
      const said = await live(p);
      await p.keyboard.press('Shift+Enter');
      await p.waitForTimeout(300);
      const back = await live(p);
      if (!/^Иессей добавлен в набор; в наборе \d+ (лицо|лица|лиц)$/.test(said)) return fail(`взят: «${said}»`);
      return /^Иессей убран из набора; /.test(back) ? pass(`${said} / ${back}`) : fail(`убран: «${back}»`);
    },
  },
  {
    n: 395,
    title: 'UX-13: «Родство с…» у Руфи, поиск «Руфь» — первая строка «Руфь уже выбрана первой — выберите другое лицо», Enter ничего не выбирает; ↓ и Enter — Руф',
    run: async (p) => {
      await go(p, '#/ruf');
      await p.locator('.folio button', { hasText: 'Родство с…' }).first().click();
      await p.waitForTimeout(500);
      await type(p, 'Руфь');
      const first = (await options(p))[0] ?? '';
      if (first !== 'Руфь уже выбрана первой — выберите другое лицо') return fail(`первая строка: «${first}»`);
      const dis = await p.locator('#find-results [role="option"]').first().getAttribute('aria-disabled');
      if (dis !== 'true') return fail('строка «уже выбрана» не помечена недоступной');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      if (/~b/.test(p.url())) return fail(`Enter выбрал второе лицо: ${p.url()}`);
      if (!(await p.locator('.pickbar-pick').count())) return fail('выбор второго лица снят');
      await p.click('#find');
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('ArrowDown');
      await p.waitForTimeout(200);
      const cur = await activeOption(p);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      const b = decodeURIComponent(p.url());
      return /~bruf-/.test(b) ? pass(`${first}; затем «${cur}» — ${b.split('#')[1]}`) : fail(`после ↓ Enter: ${b.split('#')[1]} (курсор «${cur}»)`);
    },
  },
  {
    n: 396,
    title: 'VIS-17: микрошкала строки поиска 120 × 14; «в работу» подчёркнуто только у строки под курсором',
    run: async (p) => {
      await type(p, 'Иосиф');
      const cv = await p.locator('#find-results .result canvas').first().boundingBox();
      if (!cv || Math.round(cv.width) !== 120 || Math.round(cv.height) !== 14) return fail(`микрошкала: ${cv?.width}×${cv?.height}`);
      const lines = await p.locator('#find-results .result .row-cmd').evaluateAll((es) =>
        es.map((e) => ({ on: e.closest('[aria-selected="true"]') !== null, c: getComputedStyle(e).textDecorationColor })),
      );
      const plain = lines.filter((l) => !l.on);
      if (!plain.length || plain.some((l) => !/rgba\(0, 0, 0, 0\)|transparent/.test(l.c))) return fail(`подчёркнуто вне курсора: ${plain.map((l) => l.c).join(', ')}`);
      const on = lines.find((l) => l.on);
      return on && !/rgba\(0, 0, 0, 0\)|transparent/.test(on.c) ? pass(`шкала 120×14; черта только у строки под курсором (${plain.length} без черты)`) : fail('у строки под курсором нет черты');
    },
  },
  {
    n: 397,
    title: 'VIS-61, UX-78, CARD-89: «Указатель» — строка лет не заходит на координату ни в одной статье; отточие кончается у координаты',
    run: async (p) => {
      await go(p, '#/~pindex', 2500);
      const res = await p.locator('section.sheet .idx button.row').evaluateAll((es) => {
        let bad = 0;
        let n = 0;
        let lead = 0;
        const ex: string[] = [];
        for (const e of es) {
          const c = e.querySelector('.coord');
          if (!c || !c.textContent) continue;
          n++;
          const cr = c.getBoundingClientRect();
          // правый край текста статьи — по строкам (Range): не правее левого края координаты
          const r = document.createRange();
          r.selectNodeContents(e.querySelector('.nm')!);
          const right = Math.max(...[...r.getClientRects()].map((x) => x.right));
          if (right > cr.left + 0.5) {
            bad++;
            if (ex.length < 3) ex.push((e.textContent ?? '').slice(0, 40));
          }
          const l = e.querySelector('.lead');
          if (l && Math.abs(l.getBoundingClientRect().right - cr.left) <= 6) lead++;
        }
        return { bad, n, lead, ex };
      });
      if (res.n < 500) return fail(`статей с координатой: ${res.n}`);
      if (res.bad) return fail(`текст на координате: ${res.bad} (${res.ex.join(' | ')})`);
      return res.lead >= res.n * 0.95 ? pass(`${res.n} статей: наложений нет, отточие у координаты в ${res.lead}`) : fail(`отточие у координаты только в ${res.lead} из ${res.n}`);
    },
  },
  {
    n: 398,
    title: 'IX-76: «Отобрать» в «Указателе» — поле объявляет «найдено N»; ↓ — на первую строку, Enter в поле — к первому найденному лицу',
    run: async (p) => {
      await go(p, '#/~pindex', 2500);
      await p.fill('#idx-filter', 'Иоа');
      await p.waitForTimeout(400);
      const said = flat((await p.locator('#idx-found').textContent()) ?? '');
      if (!/^найдено \d+ (лицо|лица|лиц)/.test(said)) return fail(`объявление: «${said}»`);
      await p.focus('#idx-filter');
      await p.keyboard.press('ArrowDown');
      const f = await p.evaluate(() => document.activeElement?.matches('.idx button.row') ?? false);
      if (!f) return fail('↓ не перевела фокус на строку списка');
      const firstText = flat(await p.locator('.idx button.row').first().innerText());
      await p.focus('#idx-filter');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      // первое найденное — первое лицо первой статьи на «Иоа» (id латиницей: «ioa…»)
      const id = hashId(p);
      return /^ioa/.test(id) ? pass(`${said}; ↓ — «${firstText}»; Enter — ${id}`) : fail(`Enter: карточка ${id || 'не открылась'}`);
    },
  },
  {
    n: 399,
    title: 'VIS-78: синопсис — общее имя (Салафиил) стоит на оси имён Матфея, а не по середине двух столбцов',
    run: async (p) => {
      await go(p, '#/david~psynopsis', 2800);
      // левый край текста ячейки (Range по содержимому); без именованных функций внутри evaluate
      const textLeft = (sel: string) =>
        p.locator(sel).first().evaluate((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          return r.getBoundingClientRect().left;
        });
      if (!(await p.locator('table.synopsis tr[data-id="salafiil"] th.nm.both').count())) return fail('нет строки Салафиила');
      const x = { common: await textLeft('table.synopsis tr[data-id="salafiil"] th.nm.both'), split: await textLeft('table.synopsis tr.split th.nm.mt:not(.empty)') };
      return Math.abs(x.common - x.split) <= 2 ? pass(`Салафиил и имена Мф — от ${x.common.toFixed(0)} px`) : fail(`Салафиил — ${x.common.toFixed(0)} px, имена Мф — ${x.split.toFixed(0)} px`);
    },
  },
  {
    n: 400,
    title: 'MOB-62: синопсис на телефоне — имя линии не касается номера соседнего столбца («Маттафа 40»), зазор не меньше 8 px',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/david~psynopsis', 2800);
      const res = await p.locator('table.synopsis tr.split').evaluateAll((trs) => {
        let worst = Infinity;
        let who = '';
        for (const tr of trs) {
          const nm = tr.querySelector('td.nm.lk button.person');
          const no = tr.querySelectorAll('td.no-cell')[1];
          if (!nm || !no || !no.textContent?.trim()) continue;
          const r = document.createRange();
          r.selectNodeContents(no);
          const gap = r.getBoundingClientRect().left - nm.getBoundingClientRect().right;
          if (gap < worst) {
            worst = gap;
            who = `${nm.textContent}${no.textContent}`;
          }
        }
        return { worst, who };
      });
      return res.worst >= 8 ? pass(`наименьший зазор ${res.worst.toFixed(1)} px (${res.who})`) : fail(`зазор ${res.worst.toFixed(1)} px: ${res.who}`);
    },
  },
  {
    n: 401,
    title: 'CARD-90: синопсис — ссылка на два стиха в клетке «1:18; 1:24», без «1:18,24»',
    run: async (p) => {
      await go(p, '#/david~psynopsis', 2800);
      const refs = (await p.locator('table.synopsis td.ot button.ref').allInnerTexts()).map(flat);
      const bad = refs.find((r) => /\d,\s*\d/.test(r));
      if (bad) return fail(`«${bad}»`);
      const two = refs.find((r) => /; /.test(r));
      return two ? pass(`${refs.length} ссылок; например «${two}»`) : fail('нет ссылки на два стиха');
    },
  },
  {
    n: 402,
    title: 'UX-81: синопсис — «Вся карточка: Илий» открывает карточку развёрнутой, а не корешком',
    run: async (p) => {
      await go(p, '#/david~psynopsis', 2800);
      if (!(await p.locator('aside.folio.spine').count())) return fail('карточка Давида рядом с синопсисом не корешок — проверять нечего');
      await p.locator('.lk3 button.why').first().click();
      await p.waitForTimeout(600);
      await p.locator('.why-card button.person').first().click();
      await p.waitForTimeout(1500);
      if (hashId(p) !== 'iliy-otets-marii') return fail(`открыто: ${hashId(p)}`);
      if (await p.locator('aside.folio.spine').count()) return fail('карточка Илия — корешок');
      return (await p.locator('aside.folio:not([hidden])').count()) ? pass('карточка Илия развёрнута') : fail('карточки нет');
    },
  },
  {
    n: 403,
    title: 'UX-73, UX-80: «Условные знаки» — «+» с числом после имени (кадр неба «Давид +N»); помета «годы — по порядку 1 Пар 2:13–15, выв.» с образцом',
    run: async (p) => {
      await go(p, '#/~plegend', 2500);
      const t = flat(await p.locator('section.sheet').innerText());
      if (/справа от следа — потомки/.test(t)) return fail('осталось «справа от следа»');
      if (!/«\+» с числом сразу после имени — потомки лица скрыты на небе/.test(t)) return fail('нет строки о «+N» после имени');
      if (!/Помета у детей «годы — по порядку 1 Пар 2:13–15, выв\.» — годы их рождения оценены по порядку/.test(t)) return fail('нет строки о помете порядка');
      const pics = await p.locator('section.sheet .legend-row', { hasText: /рождения\s+оценены|числом\s+сразу/ }).locator('canvas').count();
      return pics === 2 ? pass('обе строки с образцами') : fail(`образцов: ${pics}`);
    },
  },
  {
    n: 404,
    title: 'Решение 51, UX-77: «Эпохи» — команда верхней строки на 1440 (открывает панель «Эпохи»), на 1024 — в «Ещё»; пояснение «В работе» — «набор помнится в этом браузере»',
    run: async (p) => {
      const cmd = p.locator('.commands > button', { hasText: /^Эпохи$/ });
      if (!(await cmd.count()) || !(await cmd.isVisible())) return fail('на 1440 «Эпохи» нет в строке');
      await cmd.click();
      await p.waitForTimeout(800);
      if ((await sheetTitle(p)) !== 'Эпохи') return fail(`панель: «${await sheetTitle(p)}»`);
      const hint = (await p.locator('.commands > button', { hasText: /^В работе/ }).getAttribute('title')) ?? '';
      if (!/набор помнится в этом браузере/.test(hint) || /сеанс/.test(hint)) return fail(`пояснение «В работе»: «${hint}»`);
      await p.setViewportSize({ width: 1024, height: 768 });
      await go(p, '#/');
      const inRow = await p.locator('.commands > button', { hasText: /^Эпохи$/ }).count();
      await p.locator('.commands .more > button').click();
      await p.waitForTimeout(300);
      const inMore = await p.locator('.commands .more [role^="menuitem"]', { hasText: 'Эпохи' }).count();
      return inRow || inMore ? pass(`1440 — в строке; 1024 — ${inRow ? 'в строке' : 'в «Ещё»'}`) : fail('на 1024 «Эпохи» нет ни в строке, ни в «Ещё»');
    },
  },
];
