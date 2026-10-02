/**
 * Сценарии приёмки этапа 13, T6 «Связи, показ, слова» (docs/ui-review/STAGE13.md, решения 93 (К3, К7), 105, 109, 110,
 * 111; приёмка П17, П20, П21), группа ui13: номера 1000–1029.
 *  — 1000 П20: словарь по DOM всех экранов — нет «Только его род», «Показать концы», «обход», «Отобрать», «режим»;
 *  — 1001–1003 снимок 20 заново: «По толкованию: …», строка основания, «нет в показе «ключевые лица» — поставить на небо» (решение 156),
 *    временный гость и «назад», «Мать — в Писании не названа», «одна дочь», правдивая строка «Линия»;
 *  — 1004–1007 тупики и начала: «Предки и потомки лица…» без лица с клавиатуры, пустой набор, «показать на всём небе»,
 *    «Ещё ▾» только при нехватке места;
 *  — 1008 П21: пять начал × 4 ширины × 2 темы — звезда в небе, у «С Адама» и «С Иисуса Христа» карточка у звезды;
 *  — 1009–1011 «Сквозной раздел» (цари единого царства, три знака), «Родство» Давида (Соломон не под «ещё N»),
 *    телефон: «Меню», «Вся карточка ▴», «Предки и потомки ▾»;
 *  — 1012–1013 строки модели и слоёв в строке показа (контракт 5);
 *  — 1014–1022 внешний аудит (решения 120, 122, 125, 126, 127, 130): поиск по группам, полное уточнение, «Указатель»
 *    из пустого поиска, первый слой вступления и группы меню, два уровня чтения таблиц, «Синопсис» на телефоне,
 *    набор больше 12 и файл набора, «не найдено в данных атласа», отказ загрузки ≠ «не найдено»;
 *  — 1023–1025 телефон: глава → карточка → «‹ Руф 4:1» и назад (решение 114); панели — модальные окна (решение 117);
 *    строка показа в две строки и параметры рода под своим видом (решение 118).
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';
import { cardOf, clickStar, open, state } from './unify11.ts';

const flat = (s: string) => s.replace(/[  ]/g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ').trim();
const PHONE = { width: 390, height: 844, touch: true };
/** Звезда лица id в видимой части неба (список лиц неба пишет её место в data-x, data-y; окно — .sky[data-view]). */
async function starInSky(p: Page, id: string): Promise<boolean> {
  return (await p.evaluate(`(() => {
    const b = document.getElementById(${JSON.stringify(`sky-star-${id}`)});
    const v = (document.querySelector('.sky')?.getAttribute('data-view') ?? '').split(' ').map(Number);
    if (!b || !b.dataset.x || v.length < 4) return false;
    const x = Number(b.dataset.x), y = Number(b.dataset.y);
    return x >= v[0] && x <= v[2] && y >= v[1] && y <= v[3];
  })()`)) as boolean;
}
/** Строка показа у кромки неба: текст и команды. */
async function bar(p: Page) {
  const t = flat((await p.locator('.sky .showbar').innerText().catch(() => '')) ?? '');
  const cmds = (await p.locator('.sky .showbar .sb-cmd').allInnerTexts()).map((x) => flat(x));
  return { t, cmds };
}
/** Запретные слова словаря 109 (П20) в тексте и именах элементов экрана. */
const FORBIDDEN: [string, RegExp][] = [
  ['Только его род', /Только (его|её) род/],
  ['Показать концы', /Показать концы/],
  ['обход', /(^|[^а-яё])обход(а|ов|ы)?([^а-яё]|$)/i],
  ['Отобрать', /Отобрать/],
  ['режим', /(^|[^а-яё])режим/i],
];
async function words(p: Page): Promise<string> {
  return (await p.evaluate(() => {
    const out = [document.body.innerText];
    for (const el of document.querySelectorAll('[aria-label], [title], [aria-description]'))
      for (const a of ['aria-label', 'title', 'aria-description']) {
        const v = el.getAttribute(a);
        if (v) out.push(v);
      }
    return out.join('\n');
  })) as string;
}
function forbidden(t: string): string[] {
  return FORBIDDEN.filter(([, re]) => re.test(t)).map(([w]) => w);
}
export const ui13: Scenario[] = [
  {
    n: 1000,
    title: 'П20 (решение 109): словарь по DOM всех экранов — нет «Только его род», «Показать концы», «обход», «Отобрать», «режим»',
    run: async (p) => {
      const bad: string[] = [];
      const check = async (where: string) => {
        const w = forbidden(await words(p));
        if (w.length) bad.push(`${where}: ${w.join(', ')}`);
      };
      // небо «С Адама» с карточкой у звезды, карточка союза, карточка связи
      await open(p, '#/adam', { start: 'adam', extra: { work: [['adam', { via: 'self', of: 'adam' }]], reveal: { opened: ['adam'], expanded: {} } } });
      if (await clickStar(p, 'adam')) await check('карточка у звезды Адама');
      await open(p, '#/mariya~vk~cr.m.mariya', { start: 'key', ms: 3200 });
      await check('карточка связи Илий — Мария');
      await open(p, '#/david~ck.iakov.liya._.iuda', { start: 'all', ms: 3200 });
      await check('карточка связи Иаков и Лия — Иуда');
      // лист «Показ»
      await p.locator('.sky .showbar .sb-cmd[data-cmd="sheet"]').first().click();
      await p.waitForTimeout(500);
      await check('лист «Показ»');
      await p.keyboard.press('Escape');
      // панели
      for (const [hash, name] of [
        ['#/~pindex', 'Указатель'],
        ['#/~pwork', 'Набор'],
        ['#/~pchapter', 'Главы'],
        ['#/~pepochs', 'Эпохи'],
        ['#/~psynopsis', 'Синопсис'],
        ['#/ioav~pkinship~aioav~bdavid', 'Родство'],
        ['#/~psection', 'Сквозной раздел'],
        ['#/~plegend', 'Условные знаки'],
        ['#/~pabout', 'О карте'],
        ['#/david~pspread~adavid~bsolomon', 'Разворот'],
      ] as const) {
        await open(p, hash, { start: 'all', ms: 2400 });
        await check(`панель «${name}»`);
      }
      // «Родство»: пути той же длины — «ещё N пути», не «обход»
      await open(p, '#/avessalom~pkinship~aavessalom~baviya', { start: 'all', ms: 2600 });
      const more = p.locator('.sheet .cmds .more');
      if (await more.count()) {
        const t = flat(await more.first().innerText());
        if (/обход/.test(t) || !/пут/.test(t)) bad.push(`«Родство»: «${t}»`);
      }
      // клавиши
      await open(p, '#/', { start: 'all', ms: 2000 });
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(700);
      await check('«Клавиши»');
      return bad.length ? fail(bad.join('; ')) : pass('0 запретных слов на 16 экранах');
    },
  },
  {
    n: 1001,
    title: 'Снимок 20 заново (решения 93, 105): шаг «Илий → Мария» в «ключевых лицах» — «По толкованию: …», «нет в показе «ключевые лица» — поставить на небо» (решение 156); щелчок — Илий гостем, адрес «~g»; «назад» — гостя нет, связь выбрана',
    run: async (p) => {
      await open(p, '#/mariya~vk~cr.m.mariya', { start: 'key', ms: 3400 });
      const card = p.locator('.sky .dotcard[data-kind="link"]');
      if (!(await card.count())) return fail('нет карточки связи');
      const h = flat(await card.locator('h3').innerText());
      if (!/^По толкованию: Илий — отец; Мария — дочь$/.test(h)) return fail(`заголовок «${h}»`);
      const out = card.locator('.dc-out');
      if (!(await out.count())) return fail('нет строки «нет в показе»');
      const ot = flat(await out.first().innerText());
      if (!/^нет в показе «ключевые лица» — поставить на небо$/.test(ot)) return fail(`строка конца: «${ot}»`);
      await out.locator('.dc-show').first().click();
      await p.waitForTimeout(1500);
      const g = await p.evaluate(() => document.documentElement.dataset.linkGuests ?? '');
      if (g !== 'iliy-otets-marii') return fail(`временные гости: «${g}»`);
      if (!/~cr\.m\.mariya~giliy-otets-marii/.test(p.url())) return fail(`адрес: ${p.url()}`);
      if (await card.locator('.dc-out').count()) return fail('после «показать» строка «нет в показе» осталась');
      await p.goBack();
      await p.waitForTimeout(1500);
      const g2 = await p.evaluate(() => document.documentElement.dataset.linkGuests ?? '');
      const s = await state(p);
      if (g2) return fail(`после «назад» гости: ${g2}`);
      return (s as { link?: string }).link === 'r.m.mariya' ? pass(`«${h}»; «${ot}»`) : fail(`после «назад» связь: ${(s as { link?: string }).link}`);
    },
  },
  {
    n: 1002,
    title: 'Карточка связи (решение 105): строка основания из § 24, «Мать — в Писании не названа», «Союз: Илий и его жена: одна дочь», «Линия» — правда о показе, «Подробнее о союзе», «Вписать связь»',
    run: async (p) => {
      await open(p, '#/mariya~vk~ck.iliy-otets-marii._._.mariya', { start: 'key', ms: 3600 });
      const card = p.locator('.sky .dotcard[data-kind="link"]');
      if (!(await card.count())) return fail('нет карточки связи');
      const t = flat(await card.innerText());
      for (const w of [
        'По толкованию: Илий и его жена — родители; Мария — дочь',
        'Первое понимание: Лк 3 — родословие Марии',
        '(Мария, § 24)',
        'Мать в Писании не названа',
        'Линия по Луке (лазурная лента), Лк 3:23; в этом показе — жёлтым путём, лента скрыта',
        'Союз Илий и его жена: одна дочь',
        'Подробнее о союзе',
        'Вписать связь',
      ])
        if (!t.includes(w)) return fail(`нет «${w}»: ${t.slice(0, 300)}`);
      if (/толк\./.test(t)) return fail('помета «толк.» повторяет слово уровня');
      // то же на всём небе: лента здесь рисует шаг — «скрыта» нет, конец в показе (краткий вид карточки строк «Линия»
      // не показывает — тогда проверяется только, что лжи нет)
      await open(p, '#/mariya~ck.iliy-otets-marii._._.mariya', { start: 'all', ms: 3600 });
      const t2 = flat(await p.locator('.sky .dotcard[data-kind="link"]').innerText());
      if (/лента скрыта/.test(t2)) return fail(`всё небо: ${t2.slice(0, 300)}`);
      if (/Линия/.test(t2) && !/Линия по Луке \(лазурная лента\), Лк 3:23/.test(t2)) return fail(`всё небо: ${t2.slice(0, 300)}`);
      return /нет в показе/.test(t2) ? fail('на всём небе — «нет в показе»') : pass();
    },
  },
  {
    n: 1003,
    title: 'П17 в DOM: связь по выводу — заголовок «Вывод: …», строка основания; Писание — без слова уровня и без строки основания',
    run: async (p) => {
      // Ламех и Цилла — Ноема: мать выведена (X4; D1)
      await open(p, '#/noema~ck.lamekh-kainit.tsilla._.noema', { start: 'all', ms: 3400 });
      let card = p.locator('.sky .dotcard[data-kind="link"] h3');
      if (!(await card.count())) return fail('нет карточки связи Ноемы');
      const h = flat(await card.innerText());
      if (!/^Вывод: /.test(h)) return fail(`заголовок «${h}»`);
      if (!(await p.locator('.sky .dotcard .dc-basis').count())) return fail('нет строки основания');
      await open(p, '#/iosif~ck.iakov.rakhil._.iosif', { start: 'all', ms: 3400 });
      card = p.locator('.sky .dotcard[data-kind="link"] h3');
      const h2 = flat(await card.innerText());
      if (h2 !== 'Иаков и Рахиль — родители; Иосиф — сын') return fail(`заголовок «${h2}»`);
      return (await p.locator('.sky .dotcard .dc-basis').count()) ? fail('у связи Писания — строка основания') : pass(`«${h}»`);
    },
  },
  {
    n: 1004,
    title: 'Решение 111 (X4 сценарий 3): «изменить» → «Предки и потомки лица…» → поле лица сразу в фокусе → «Иуда» → Enter — небо: потомки Иуды; не больше 6 действий',
    run: async (p) => {
      await open(p, '#/', { start: 'all', ms: 2400 });
      let n = 0;
      await p.locator('.sky .showbar .sb-cmd[data-cmd="sheet"]').first().click();
      n++;
      await p.waitForTimeout(500);
      await p.locator('.showsheet .ss-kind', { hasText: 'Предки и потомки лица' }).first().click();
      n++;
      await p.waitForTimeout(400);
      const f = await p.evaluate(() => document.activeElement?.id ?? '');
      if (f !== 'show-person') return fail(`фокус не в поле лица: «${f}»`);
      const hint = flat(await p.locator('.showsheet').innerText());
      if (!/Выберите лицо: его предки или потомки встанут на небо/.test(hint)) return fail('нет строки «Выберите лицо…»');
      await p.keyboard.type('Иуда');
      n++;
      await p.waitForTimeout(500);
      await p.keyboard.press('Enter');
      n++;
      await p.waitForTimeout(1600);
      const s = (await state(p)) as { show?: string };
      if (!/^r\.iuda\./.test(s.show ?? '')) return fail(`показ: ${s.show}`);
      return n <= 6 ? pass(`${n} действия; показ ${s.show}`) : fail(`${n} действий`);
    },
  },
  {
    n: 1005,
    title: 'Решение 111: пустой набор — в листе «Показ» строка «Набор — пуст» с пояснением, выбрать нельзя; «Набор на небо» неактивна; показ «набор» опустел — строка показа говорит, что делать',
    run: async (p) => {
      await open(p, '#/', { start: 'all', extra: { work: [] }, ms: 2400 });
      await p.locator('.sky .showbar .sb-cmd[data-cmd="sheet"]').first().click();
      await p.waitForTimeout(500);
      const row = p.locator('.showsheet .ss-kind.empty');
      if (!(await row.count())) return fail('нет строки пустого набора');
      const rt = flat(await row.innerText());
      if (!/^Набор — пуст соберите: «Добавить в набор» в карточке$/.test(rt)) return fail(`строка: «${rt}»`);
      if (!(await row.locator('input').isDisabled())) return fail('пустой набор можно выбрать');
      await p.keyboard.press('Escape');
      await open(p, '#/~pwork', { start: 'all', extra: { work: [] }, ms: 2400 });
      const cmd = p.locator('.sheet .work-sky button', { hasText: 'Набор на небо' });
      if ((await cmd.getAttribute('aria-disabled')) !== 'true') return fail('«Набор на небо» активна при пустом наборе');
      // «С Адама», затем «Очистить набор» — показ «набор» пуст
      await open(p, '#/adam~vs~pwork', { start: 'adam', extra: { work: [['adam', { via: 'self', of: 'adam' }]] }, ms: 2600 });
      await p.locator('.sheet .cmds button', { hasText: 'Очистить набор' }).click();
      await p.waitForTimeout(800);
      // строка показа — полная («набор пуст — добавьте лиц…») или, если не поместилась, краткая «набор пуст»; полная — в имени
      // группы для диктора
      const b = await bar(p);
      const label = flat((await p.locator('.sky .showbar').getAttribute('aria-label')) ?? '');
      // краткая строка (решение 118): лицо вне показа — первым, «Адам — вне показа; набор пуст»
      if (!/^(На небе: набор пуст|[^;]+ — вне показа; набор пуст)/.test(b.t)) return fail(`строка показа: «${b.t}»`);
      return /набор пуст — добавьте лиц командой «Добавить в набор» в карточке или начните «С Адама»/.test(label) ? pass(b.t) : fail(`имя строки: «${label}»`);
    },
  },
  {
    n: 1006,
    title: 'Решение 111: лицо вне показа — строка показа «Елиав (…) — вне показа» и команда «показать на всём небе»: всё небо, звезда Елиава в кадре',
    run: async (p) => {
      await open(p, '#/eliav-syn-iesseya~vk', { start: 'key', ms: 3000 });
      const b = await bar(p);
      if (!/— вне показа/.test(b.t)) return fail(`строка показа: «${b.t}»`);
      if (!b.cmds.includes('показать на всём небе')) return fail(`команды: ${b.cmds.join(' | ')}`);
      await p.locator('.sky .showbar .sb-cmd', { hasText: 'показать на всём небе' }).click();
      await p.waitForTimeout(3000);
      const s = (await state(p)) as { show?: string };
      if (s.show !== 'a') return fail(`показ: ${s.show}`);
      return (await starInSky(p, 'eliav-syn-iesseya')) ? pass() : fail('звезды Елиава нет в кадре');
    },
  },
  {
    n: 1007,
    title: 'Решение 111: «Ещё ▾» — только когда команды не помещаются: на 1440 его нет; на 1024 в нём только ушедшие панели, без «Начать заново…»',
    run: async (p) => {
      await open(p, '#/', { start: 'all', ms: 2000 });
      if (await p.locator('.top .commands .more').count()) return fail('«Ещё» на 1440');
      await p.setViewportSize({ width: 1024, height: 768 });
      await p.waitForTimeout(800);
      if (!(await p.locator('.top .commands .more').count())) return pass('на 1024 все команды поместились');
      await p.locator('.top .commands .more > button').click();
      await p.waitForTimeout(200);
      const items = (await p.locator('.top .commands .more [role^="menuitem"] .nm').allInnerTexts()).map((x) => x.trim());
      if (items.includes('Начать заново…')) return fail(`в «Ещё»: ${items.join(' | ')}`);
      return items.length ? pass(`1024: ${items.join(', ')}`) : fail('«Ещё» пустое');
    },
  },
  {
    n: 1008,
    title: 'П21 (решение 111): 5 начал × 1440, 1280, 1024, 390 × ночь и день — звезда лица начала в небе; у «С Адама» и «С Иисуса Христа» открыта карточка у звезды',
    run: async (p) => {
      const STARTS = [
        { label: 'С Адама', id: 'adam', show: 's', card: 'Адам' },
        { label: 'С Иисуса Христа', id: 'iisus', show: 's', card: 'Иисус Христос' },
        { label: 'Родословие Иисуса Христа (Мф 1, Лк 3)', id: null, show: 'l', card: null },
        { label: 'Ключевые лица', id: null, show: 'k', card: null },
        { label: 'Всё небо', id: null, show: 'a', card: null },
      ];
      const bad: string[] = [];
      let ok = 0;
      const ctxOf = p.context().browser()!;
      for (const w of [1440, 1280, 1024, 390])
        for (const theme of ['night', 'day'] as const) {
          const touch = w === 390;
          const ctx = await ctxOf.newContext({ viewport: { width: w, height: touch ? 844 : 900 }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1, colorScheme: theme === 'day' ? 'light' : 'dark' });
          const q = await ctx.newPage();
          await q.addInitScript(`localStorage.setItem('toledot:intro','true');localStorage.setItem('toledot:theme', JSON.stringify('${theme}'))`);
          try {
            for (const st of STARTS) {
              await q.goto(`${p.url().replace(/[?#].*$/, '')}?p21=${Date.now()}#/`);
              await q.evaluate(() => {
                localStorage.removeItem('toledot:start');
                localStorage.removeItem('toledot:work');
                localStorage.setItem('toledot:cartouche', 'open');
                sessionStorage.clear();
              });
              await q.reload();
              await q.waitForTimeout(1800);
              const b = q.locator('.cartouche .starts button', { hasText: st.label });
              if (!(await b.count())) {
                bad.push(`${w} ${theme} ${st.label}: нет кнопки`);
                continue;
              }
              if (touch) await b.first().tap();
              else await b.first().click();
              await q.waitForTimeout(4200);
              const show = (await q.evaluate(() => document.documentElement.dataset.show ?? '')) as string;
              if (show !== st.show) {
                bad.push(`${w} ${theme} ${st.label}: показ ${show}`);
                continue;
              }
              if (st.id && !(await starInSky(q, st.id))) {
                bad.push(`${w} ${theme} ${st.label}: звезды нет в небе`);
                continue;
              }
              if (st.card) {
                const has = (await q.evaluate(
                  (nm) => [...document.querySelectorAll('.dotcard[data-kind="person"][data-placed], .sheet-dot .dotcard')].some((c) => c.querySelector('.nm')?.textContent?.trim() === nm),
                  st.card,
                )) as boolean;
                if (!has) {
                  bad.push(`${w} ${theme} ${st.label}: нет карточки у звезды`);
                  continue;
                }
              }
              ok++;
            }
          } finally {
            await ctx.close();
          }
        }
      return bad.length ? fail(`${ok}/40; ${bad.join('; ')}`) : pass(`${ok}/40`);
    },
  },
  {
    n: 1009,
    title: 'Решение 110 (X4 сценарий 6): «Сквозной раздел» — «Цари единого царства» → «20. Смерть и погребение»: Саул, Иевосфей, Давид, Соломон; пустые ячейки — «не сообщается», «не составлено», «—» с пояснением',
    run: async (p) => {
      await open(p, '#/~psection', { start: 'all', ms: 2200 });
      const seg = p.locator('.sheet [role="radiogroup"] button, .sheet .seg button, .sheet [role="radio"]', { hasText: 'Цари единого царства' });
      if (!(await seg.count())) return fail('нет группы «Цари единого царства»');
      await seg.first().click();
      await p.waitForTimeout(1500);
      const t = flat(await p.locator('.app > .sheet').innerText());
      for (const w of ['Саул', 'Иевосфей', 'Давид', 'Соломон', '«не сообщается» — в Писании об этом не сказано'])
        if (!t.includes(w)) return fail(`нет «${w}»`);
      const names = (await p.locator('.app > .sheet [role="radio"], .app > .sheet .seg button').allInnerTexts()).map(flat);
      for (const g of ['Цари единого царства', 'Цари Иудеи', 'Цари Израиля (северного)']) if (!names.includes(g)) return fail(`нет группы «${g}»: ${names.join(' | ')}`);
      return pass();
    },
  },
  {
    n: 1010,
    title: 'Решение 104 (X4 сценарий 8): «Родство» у звезды Давида — Соломон и Нафан видны, хотя сверх первых имён строки «ещё N»',
    run: async (p) => {
      await open(p, '#/david', { start: 'all', ms: 2600 });
      if (!(await clickStar(p, 'david'))) return fail('звезды Давида нет в кадре');
      const c = await cardOf(p);
      if (!c || c.kind !== 'person') return fail('нет карточки у звезды');
      // краткий вид — «всё родство»
      const all = p.locator('.sky .dotcard .dc-row.all .dc-more');
      if (await all.count()) {
        await all.click();
        await p.waitForTimeout(500);
      }
      const row = p.locator('.sky .dotcard .dc-row.children');
      if (!(await row.count())) return fail('нет строки детей');
      const t = flat(await row.innerText());
      for (const w of ['Соломон', 'Нафан']) if (!t.includes(w)) return fail(`в строке детей нет «${w}»: ${t}`);
      return /ещё \d+/.test(t) ? pass(t) : pass(`${t} (строка целиком)`);
    },
  },
  {
    n: 1011,
    title: 'Решение 109, телефон 390 × 844 (X4 сценарий 5): «Меню» с «Ночь» и «День»; касание Руфи — лист: «Вся карточка ▴», «Предки и потомки ▾»',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/ruf', { start: 'all', ms: 3000 });
      const menu = p.locator('.top .sections > button');
      const mt = flat(await menu.innerText());
      if (!/^Меню/.test(mt)) return fail(`кнопка меню: «${mt}»`);
      await menu.tap();
      await p.waitForTimeout(300);
      const items = (await p.locator('.top .sections [role^="menuitem"] .nm').allInnerTexts()).map((x) => x.trim());
      if (!items.includes('Ночь') || !items.includes('День') || items.includes('Дневная карта')) return fail(`«Меню»: ${items.join(' | ')}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      // касание звезды Руфи — лист на 214 px и есть карточка у звезды (решение 77)
      const st = (await p.evaluate(`(() => {
        const b = document.getElementById('sky-star-ruf');
        const c = document.querySelector('.sky canvas')?.getBoundingClientRect();
        return b && c && b.dataset.x ? { x: c.left + Number(b.dataset.x), y: c.top + Number(b.dataset.y) } : null;
      })()`)) as { x: number; y: number } | null;
      if (!st) return fail('звезды Руфи нет в кадре');
      await p.touchscreen.tap(st.x, st.y);
      await p.waitForTimeout(1200);
      const cmds = (await p.locator('.folio .sheet-dot .dc-cmds button').allInnerTexts()).map(flat);
      if (!cmds.some((x) => /^Вся карточка ▴$/.test(x))) return fail(`команды листа: ${cmds.join(' | ')}`);
      if (!cmds.some((x) => /^Предки и потомки ▾$/.test(x))) return fail(`команды листа: ${cmds.join(' | ')}`);
      return pass(cmds.join(' | '));
    },
  },
  {
    n: 1012,
    title: 'Решение 102 (контракт 5): модель «Краткое пребывание» — под строкой показа «Годы — по модели «Краткое пребывание» — вернуть основную»; «вернуть основную» — строки нет',
    run: async (p) => {
      await open(p, '#/avraam~mmt-short', { start: 'all', ms: 3000 });
      const line = p.locator('.sky .showbar .sb-line[data-line="model"]');
      if (!(await line.count())) return fail('нет строки модели');
      const t = flat(await line.innerText());
      if (!/^Годы — по модели «Краткое пребывание» — вернуть основную$/.test(t)) return fail(`строка: «${t}»`);
      await line.locator('.sb-cmd').click();
      await p.waitForTimeout(1500);
      if (await p.locator('.sky .showbar .sb-line[data-line="model"]').count()) return fail('строка модели осталась');
      // диктор слышит, что вернулось
      const said = flat((await p.locator('.sky .showbar [role="status"]').innerText().catch(() => '')) ?? '');
      if (said !== 'Годы — по основной модели') return fail(`диктор: «${said}»`);
      return /~mmt-short/.test(p.url()) ? fail(`адрес: ${p.url()}`) : pass(t);
    },
  },
  {
    n: 1013,
    title: 'Решение 111 (X4 А6): слой выключен — строка показа «Скрыто: связи — вернуть»; «вернуть» включает слои',
    run: async (p) => {
      await open(p, '#/david', { start: 'all', extra: { layers: { connectors: false } }, ms: 2800 });
      const line = p.locator('.sky .showbar .sb-line[data-line="layers"]');
      if (!(await line.count())) return fail('нет строки слоёв');
      const t = flat(await line.innerText());
      if (!/^Скрыто: связи — вернуть$/.test(t)) return fail(`строка: «${t}»`);
      await line.locator('.sb-cmd').click();
      await p.waitForTimeout(800);
      if (await p.locator('.sky .showbar .sb-line[data-line="layers"]').count()) return fail('строка слоёв осталась');
      const said = flat((await p.locator('.sky .showbar [role="status"]').innerText().catch(() => '')) ?? '');
      return said === 'Все слои на небе' ? pass(t) : fail(`диктор: «${said}»`);
    },
  },
  {
    n: 1014,
    title: 'Решение 120 (UI-10): «иосиф» — группы «Имя совпадает: Иосиф — 10 лиц», «Другие формы и похожие имена», «Упомянуты рядом» со своими счётчиками и «Отметить на небе (N)» (решение 156); команда группы ставит «Отмечено поиском: N лиц»',
    run: async (p) => {
      await open(p, '#/', { start: 'all', ms: 2400 });
      await p.click('#find');
      await p.fill('#find', 'иосиф');
      await p.waitForTimeout(600);
      const heads = (await p.locator('#find-results .grp-head').allInnerTexts()).map(flat);
      if (!/^Имя совпадает: Иосиф — (\d+) лиц$/.test(heads[0] ?? '')) return fail(`первая группа: «${heads[0]}»`);
      if (!heads.some((h) => /^Другие формы и похожие имена — \d+ (лицо|лица|лиц)$/.test(h))) return fail(`нет «Другие формы…»: ${heads.join(' | ')}`);
      if (!heads.some((h) => /^Упомянуты рядом — \d+ (лицо|лица|лиц)$/.test(h))) return fail(`нет «Упомянуты рядом»: ${heads.join(' | ')}`);
      // счётчик группы — число её строк-лиц
      const groups = await p.locator('#find-results [role="group"]').evaluateAll((gs) =>
        gs.map((g) => ({ head: g.querySelector('.grp-head')?.textContent ?? '', n: g.querySelectorAll('[role="option"]:not(.cmdrow)').length, cmd: g.querySelector('.cmdrow.all')?.textContent ?? '' })),
      );
      for (const g of groups) {
        const m = /— (\d+)/.exec(g.head.replace(/[  ]/g, ' '));
        if (!m || Number(m[1]) !== g.n) return fail(`«${flat(g.head)}»: строк ${g.n}`);
        if (g.n > 1 && flat(g.cmd) !== `Отметить на небе (${g.n})`) return fail(`у группы «${flat(g.head)}» нет «Отметить на небе (${g.n})»: «${flat(g.cmd)}»`);
      }
      const forms = p.locator('#find-results [role="group"]', { has: p.locator('.grp-head', { hasText: 'Другие формы' }) });
      if (!/Иосифия/.test(flat(await forms.innerText()))) return fail('Иосифия не среди похожих имён');
      await p.locator('#find-results .cmdrow.all').first().click();
      await p.waitForTimeout(1500);
      const pin = flat(await p.locator('.sky .pinbar').innerText().catch(() => ''));
      const n = /^Имя совпадает: Иосиф — (\d+)/.exec(heads[0])![1];
      return new RegExp(`^Отмечено поиском: ${n} лиц по запросу «иосиф»`).test(pin) ? pass(`${heads.join(' | ')}; ${pin}`) : fail(`строка отметок: «${pin}»`);
    },
  },
  {
    n: 1015,
    title: 'Решение 120 (UI-22): обрезанное уточнение тёзки видно полностью при фокусе (стрелки) и при наведении — строкой у края списка',
    run: async (p) => {
      await open(p, '#/', { start: 'all', ms: 2400 });
      await p.click('#find');
      await p.fill('#find', 'иосиф');
      await p.waitForTimeout(600);
      const rows = p.locator('#find-results .result:not(.cmdrow)');
      const n = await rows.count();
      let at = -1;
      for (let i = 0; i < n; i++) if (await rows.nth(i).locator('.l1').evaluate((e) => e.scrollWidth > e.clientWidth + 1)) {
        at = i;
        break;
      }
      if (at < 0) return pass('обрезанных уточнений нет — проверять нечего');
      // клавиатура: курсор — на первом лице; стрелками до обрезанной строки
      for (let i = 0; i < at; i++) await p.keyboard.press('ArrowDown');
      await p.waitForTimeout(250);
      const full = flat(await p.locator('#find-results .full').innerText().catch(() => ''));
      const want = flat((await rows.nth(at).getAttribute('id')) ? await rows.nth(at).locator('.l1').innerText() : '');
      if (!full) return fail('полной строки нет при фокусе');
      if (!full.startsWith('Иосиф, ') || full.length <= want.length - 2) return fail(`полная строка: «${full}» при «${want}»`);
      // мышь: наведение на первую строку убирает строку, на обрезанную — возвращает
      await rows.nth(0).hover();
      await p.waitForTimeout(200);
      if (await p.locator('#find-results .full').count()) return fail('строка осталась у необрезанной строки');
      await rows.nth(at).hover();
      await p.waitForTimeout(200);
      return (await p.locator('#find-results .full').count()) ? pass(full) : fail('при наведении полной строки нет');
    },
  },
  {
    n: 1016,
    title: 'Решение 120: пустой поиск ведёт в «Указатель» на букве запроса; «Найти в указателе» — с видимым числом совпадений, у имени — роль или эпоха',
    run: async (p) => {
      await open(p, '#/', { start: 'all', ms: 2400 });
      await p.click('#find');
      await p.fill('#find', 'Бзыкв');
      await p.waitForTimeout(600);
      const cmd = p.locator('#find-results .to-index');
      if (!(await cmd.count())) return fail('нет команды «Указателя»');
      const label = flat(await cmd.innerText());
      if (label !== 'Открыть «Указатель» на букве «Б»') return fail(`команда: «${label}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      const pressed = flat((await p.locator('.sheet .letters [aria-pressed="true"], .sheet .letters [aria-checked="true"]').first().innerText().catch(() => '')) ?? '');
      if (pressed !== 'Б') return fail(`буква указателя: «${pressed}»`);
      await p.locator('.sheet .letters button', { hasText: 'все' }).first().click();
      await p.fill('#idx-filter', 'иос');
      await p.waitForTimeout(500);
      const count = flat(await p.locator('.sheet .idx-count').innerText().catch(() => ''));
      if (!/^найдено \d+ (лицо|лица|лиц)$/.test(count)) return fail(`число совпадений: «${count}»`);
      const tags = (await p.locator('.sheet .idx .row .tag').allInnerTexts()).map(flat).filter(Boolean);
      if (tags.length < 3) return fail(`у имён нет роли или эпохи: ${tags.join(', ')}`);
      return pass(`${label}; ${count}; ${tags.slice(0, 4).join(', ')}`);
    },
  },
  {
    n: 1017,
    title: 'Решение 122 (UI-13, UI-15): вступление — «Найти человека», «Читать главу» и шесть начал (решение 187) первым слоем; «Меню» телефона — группами «Искать и читать», «Исследовать связи», «Справка» со строками задач',
    run: async (p) => {
      await p.goto(`${p.url().replace(/[?#].*$/, '')}?i122=${Date.now()}#/`);
      await p.evaluate(() => {
        localStorage.removeItem('toledot:start');
        localStorage.setItem('toledot:cartouche', 'open');
        sessionStorage.clear();
      });
      await p.reload();
      await p.waitForTimeout(2000);
      const first = (await p.locator('.cartouche .first button').allInnerTexts()).map(flat);
      if (!/^Найти человека/.test(first[0] ?? '') || first[1] !== 'Читать главу') return fail(`первый слой: ${first.join(' | ')}`);
      const starts = await p.locator('.cartouche .starts button').count();
      // этап 16 (решение 187): шестое начало — «Рассказ: от Адама до Иисуса Христа»
      if (starts !== 6) return fail(`начал: ${starts}`);
      // первый слой — выше начал и длинного текста
      const y = async (sel: string) => (await p.locator(sel).first().boundingBox())?.y ?? 1e9;
      if (!((await y('.cartouche .first')) < (await y('.cartouche .starts')) && (await y('.cartouche .starts')) < (await y('.cartouche .long')))) return fail('порядок слоёв вступления');
      await p.locator('.cartouche .find-cmd').click();
      await p.waitForTimeout(200);
      if (!(await p.evaluate(() => document.activeElement?.id === 'find'))) return fail('«Найти человека» не ставит фокус в поле поиска');
      await p.keyboard.press('Escape');
      await p.locator('.cartouche .first button', { hasText: 'Читать главу' }).click();
      await p.waitForTimeout(800);
      if (!/Чтение глав|Главы/.test(flat(await p.locator('.app > .sheet h2, section.sheet h2').first().innerText().catch(() => '')))) return fail('«Читать главу» не открыл «Главы»');
      // телефон: группы меню и строки задач
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const q = await ctx.newPage();
      try {
        await q.addInitScript(`localStorage.setItem('toledot:intro','true');localStorage.setItem('toledot:start', JSON.stringify('all'));localStorage.setItem('toledot:cartouche','folded')`);
        await q.goto(`${p.url().replace(/[?#].*$/, '')}?i122m=${Date.now()}#/`);
        await q.waitForTimeout(2200);
        await q.locator('header.top .sections > button').tap();
        await q.waitForTimeout(400);
        const groups = (await q.locator('header.top .sections [role="group"] .menu-group').allInnerTexts()).map(flat);
        if (groups.join(' | ') !== 'Искать и читать | Исследовать связи | Справка') return fail(`группы: ${groups.join(' | ')}`);
        const syn = flat(await q.locator('header.top .sections [role^="menuitem"]', { hasText: 'Синопсис' }).innerText());
        if (syn !== 'Синопсис сравнить родословия Мф 1 и Лк 3') return fail(`пункт «Синопсис»: «${syn}»`);
        const labelled = await q.locator('header.top .sections [role="group"][aria-labelledby]').count();
        return labelled === 3 ? pass(`${first.join(', ')}; ${groups.join(', ')}`) : fail(`групп с подписью: ${labelled}`);
      } finally {
        await ctx.close();
      }
    },
  },
  {
    n: 1018,
    title: 'Решение 125 (UI-19): «Сквозной раздел» — в строке краткое значение, основание и стихи раскрываются в строке («N стихов»); длинный раздел — три строки и «полностью»',
    run: async (p) => {
      await open(p, '#/~psection', { start: 'all', ms: 3000 });
      const row = p.locator('.sheet table.xtable tbody tr', { has: p.locator('button.person[data-id="ezekiya"]') });
      if (!(await row.count())) return fail('нет строки Езекии');
      const yrs = flat(await row.locator('td').first().innerText());
      if (!/29 лет над Иудеей; 715–686 гг\. до Р\. Х\./.test(yrs)) return fail(`годы в строке: «${yrs}»`);
      if (await row.locator('td').first().locator('button.ref, .refs button').count()) return fail('в краткой строке — стихи');
      const btn = row.locator('button.xopen');
      if (!/^\d+ стих(а|ов)?$/.test(flat(await btn.innerText()))) return fail(`команда: «${await btn.innerText()}»`);
      if ((await btn.getAttribute('aria-expanded')) !== 'false') return fail('основание открыто сразу');
      await btn.click();
      await p.waitForTimeout(300);
      const basis = flat(await p.locator('.sheet table.xtable tr.basis-row').first().innerText());
      if (!/Царствование:/.test(basis) || !/Возраст при смерти: 54 года — при воцарении 25 лет, царствовал 29 лет/.test(basis)) return fail(`основание: «${basis}»`);
      await p.locator('.sheet .xpick .menu > button').click();
      await p.locator('.sheet .xpick [role="menuitemradio"]', { hasText: '17. Жизнеописание' }).click();
      await p.waitForTimeout(1500);
      const more = p.locator('.sheet .xsec .xmore').first();
      if (!(await more.count())) return fail('нет «полностью»');
      const body = p.locator('.sheet .xsec .xbody').first();
      const h0 = (await body.boundingBox())!.height;
      await more.click();
      await p.waitForTimeout(300);
      const h1 = (await body.boundingBox())!.height;
      return h1 > h0 + 10 && flat(await more.innerText()) === 'кратко' ? pass(`${basis.slice(0, 90)}…; ${h0.toFixed(0)} → ${h1.toFixed(0)} px`) : fail(`«полностью»: ${h0} → ${h1}`);
    },
  },
  {
    n: 1019,
    title: 'Решение 125: «Синопсис» на телефоне — сначала Мф и Лк, Бытие, 1 Пар и Руфь — командой; «Перейти: расхождение: Давид» ведёт к участку',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/~psynopsis', { start: 'all', ms: 3000 });
      if (await p.locator('table.synopsis td.ot').count()) return fail('на телефоне сразу видны столбцы Бытия, 1 Пар и Руфи');
      const heads = (await p.locator('table.synopsis thead th').allInnerTexts()).map(flat);
      if (heads.join('|') !== '№|Мф 1|Лк 3|№') return fail(`столбцы: ${heads.join('|')}`);
      const jump = p.locator('.syn-jumps button', { hasText: 'расхождение: Давид' });
      if (!(await jump.count())) return fail(`нет перехода: ${(await p.locator('.syn-jumps button').allInnerTexts()).map(flat).join(' | ')}`);
      await jump.tap();
      await p.waitForTimeout(500);
      const focused = (await p.evaluate(() => (document.activeElement?.closest('tr.note') as HTMLElement | null)?.dataset.at ?? '')) as string;
      if (focused !== 'david') return fail(`фокус после перехода: «${focused}»`);
      const box = await p.locator('table.synopsis tr.note[data-at="david"]').boundingBox();
      if (!box || box.y < 0 || box.y > 844) return fail('участок не в видимой части');
      await p.locator('.syn-jumps .syn-ot').tap();
      await p.waitForTimeout(400);
      return (await p.locator('table.synopsis td.ot').count()) ? pass('Мф и Лк; переход к Давиду; источники по команде') : fail('команда не показала источники');
    },
  },
  {
    n: 1020,
    title: 'Решения 126, 130: набор из 14 лиц — видимая оговорка о ссылке; «Сохранить набор в файл» и «Открыть набор из файла»; отмена очистки живёт после закрытия панели до следующего изменения набора',
    run: async (p) => {
      const ids = ['david', 'iessey', 'ovid', 'vooz', 'ruf', 'salmon', 'naasson', 'aminadav', 'aram', 'esrom', 'fares', 'iuda', 'iakov', 'isaak'];
      await open(p, '#/~pwork', { start: 'all', extra: { work: ids.map((id) => [id, { via: 'self', of: id }]) }, ms: 2800 });
      const warn = flat(await p.locator('.sheet .work-link').innerText().catch(() => ''));
      if (!/^В наборе 14 лиц — больше 12, поэтому ссылка на вид передаёт только показ «набор», без его лиц\./.test(warn)) return fail(`оговорка: «${warn}»`);
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.locator('.sheet button', { hasText: 'Сохранить набор в файл' }).click()]);
      const path = await dl.path();
      const text = path ? (await import('node:fs')).readFileSync(path, 'utf8') : '';
      const data = JSON.parse(text || 'null') as { kind?: string; persons?: unknown[] } | null;
      if (data?.kind !== 'toledot-set' || data.persons?.length !== 14) return fail(`файл: ${text.slice(0, 80)}`);
      // очистить — закрыть панель — открыть: «Вернуть очищенный набор (14)» на месте
      await p.locator('.sheet button', { hasText: 'Очистить набор' }).click();
      await p.waitForTimeout(300);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      await p.locator('.commands > button', { hasText: 'Набор' }).click();
      await p.waitForTimeout(500);
      const undo = p.locator('.sheet button', { hasText: 'Вернуть очищенный набор (14)' });
      if (!(await undo.count())) return fail('после закрытия панели отмены нет');
      // открыть набор из файла — набор заменён, прежний можно вернуть
      await p.locator('.sheet input[type="file"]').setInputFiles({ name: 'nabor.json', mimeType: 'application/json', buffer: Buffer.from(text) });
      await p.waitForTimeout(500);
      const said = flat(await p.locator('.sheet .work-said').innerText());
      if (said !== 'Открыт набор из файла: 14 лиц.') return fail(`после открытия: «${said}»`);
      await p.locator('.sheet input[type="file"]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('null') });
      await p.waitForTimeout(400);
      const bad = flat(await p.locator('.sheet .work-said').innerText());
      return bad === 'Это не файл набора атласа.' ? pass(`${warn.slice(0, 60)}…; файл ${data.persons.length} лиц`) : fail(`чужой файл: «${bad}»`);
    },
  },
  {
    n: 1021,
    title: 'Решение 127 (TOL 006): «Родство» Мелхиседек — Давид: «В данных атласа путь родства между ними не найден» и где искали; не «Писание не называет»',
    run: async (p) => {
      await open(p, '#/melkhisedek~pkinship~amelkhisedek~bdavid', { start: 'all', ms: 3000 });
      const t = flat(await p.locator('.app > .sheet').innerText());
      if (/Писание не называет/.test(t)) return fail('«Писание не называет»');
      if (!/В данных атласа путь родства между ними не найден\./.test(t)) return fail(`нет ответа: «${t.slice(0, 200)}»`);
      return /Искали общих предков/.test(t) ? pass() : fail('не сказано, где искали');
    },
  },
  {
    n: 1022,
    title: 'Решение 127 (UI-23): поиск по стиху при отказе загрузки — «Не удалось загрузить…» и «Повторить», не «не найдено»; повтор после восстановления находит лиц',
    run: async (p) => {
      await open(p, '#/', { start: 'all', ms: 2400 });
      const block = (r: import('playwright').Route) => r.abort();
      await p.route(/\/assets\/\d\d-[^/]+\.js/, block);
      await p.click('#find');
      await p.fill('#find', 'Руф 4:21');
      await p.waitForTimeout(2500);
      const t = flat(await p.locator('#find-results').innerText().catch(() => ''));
      if (/не найдено лиц/.test(t) && !/Не удалось загрузить/.test(t)) return fail(`отказ выдан за «не найдено»: «${t}»`);
      if (!/Не удалось загрузить данные для поиска по ссылке/.test(t)) return fail(`нет сообщения об отказе: «${t}»`);
      await p.unroute(/\/assets\/\d\d-[^/]+\.js/, block);
      const retry = p.locator('#find-results .to-index, #find-results .cmdrow.retry').first();
      if (!/Повторить/.test(flat(await retry.innerText()))) return fail(`нет «Повторить»: «${t}»`);
      await retry.click();
      await p.waitForTimeout(3000);
      const names = (await p.locator('#find-results .result:not(.cmdrow) .nm').allInnerTexts()).map(flat);
      return ['Салмон', 'Вооз', 'Овид'].every((n) => names.includes(n)) ? pass(names.join(', ')) : fail(`после повтора: ${names.join(', ')}`);
    },
  },
  {
    n: 1023,
    title: 'Решение 114 (UI-02): телефон — имя в главе Руф 4 открывает карточку следующим экраном со строкой «‹ Руф 4:1»; возврат — та же глава, фокус на том же имени',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/~pchapter', { start: 'all', ms: 2600 });
      // глава Руф 4 — из оглавления панели
      const toc = (await p.evaluate(() => {
        const b = [...document.querySelectorAll<HTMLElement>('section.sheet .toc button')].find((x) => (x.getAttribute('aria-label') ?? '').replace(/[\s\u00a0\u2060]+/g, ' ').trim() === 'Руф 4');
        b?.click();
        return !!b;
      })) as boolean;
      if (!toc) return fail('в оглавлении нет Руф 4');
      await p.waitForTimeout(900);
      const verse = p.locator('section.sheet .chapter p[data-v] .person[data-id="vooz"]').first();
      if (!(await verse.count())) return fail('в главе нет Вооза');
      const v = await verse.evaluate((b) => (b.closest('p[data-v]') as HTMLElement).dataset.v ?? '');
      const ch = 'Руф 4';
      await verse.tap();
      await p.waitForTimeout(1500);
      if (await p.locator('section.sheet .chapter').count()) return fail('глава осталась поверх карточки');
      const back = p.locator('.ch-return button');
      if (!(await back.count())) return fail('нет строки возврата над карточкой');
      const label = flat(await back.innerText());
      if (label !== `‹ ${ch}:${v}`) return fail(`строка возврата: «${label}» (глава ${ch}, стих ${v})`);
      await back.tap();
      await p.waitForTimeout(1500);
      const focus = (await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return a ? `${a.dataset.id ?? ''}|${(a.closest('p[data-v]') as HTMLElement | null)?.dataset.v ?? ''}` : '';
      })) as string;
      return focus === `vooz|${v}` ? pass(`${label}; фокус на Воозе, стих ${v}`) : fail(`фокус после возврата: «${focus}»`);
    },
  },
  {
    n: 1024,
    title: 'Решение 117 (UI-05): панель телефона — модальное окно: фон недоступен (inert), Tab остаётся внутри, после закрытия фокус — у «Меню»',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/', { start: 'all', ms: 2400 });
      await p.locator('header.top .sections > button').tap();
      await p.waitForTimeout(300);
      await p.locator('header.top .sections [role^="menuitem"]', { hasText: 'Родство' }).tap();
      await p.waitForTimeout(800);
      const sheet = p.locator('section.sheet').first();
      if ((await sheet.getAttribute('role')) !== 'dialog' || (await sheet.getAttribute('aria-modal')) !== 'true') return fail('лист — не модальное окно');
      const inert = (await p.evaluate(() => ['.app > .top', '.app > main > .sky', '.app > .strip'].map((q) => !!document.querySelector(q)?.hasAttribute('inert')))) as boolean[];
      if (inert.some((x) => !x)) return fail(`фон доступен: ${inert.join(', ')}`);
      for (let i = 0; i < 30; i++) {
        await p.keyboard.press('Tab');
        const inside = (await p.evaluate(() => !!document.activeElement?.closest('section.sheet'))) as boolean;
        if (!inside) return fail(`Tab ${i + 1} ушёл из листа`);
      }
      // Escape в поле сначала уводит из поля (D5); следующий закрывает лист
      for (let i = 0; i < 3 && (await p.locator('section.sheet').count()); i++) {
        await p.keyboard.press('Escape');
        await p.waitForTimeout(400);
      }
      if (await p.locator('section.sheet').count()) return fail('Escape не закрыл лист');
      const at = flat((await p.evaluate(() => document.activeElement?.textContent ?? '')) as string);
      return /^Меню/.test(at) ? pass('модально; фокус вернулся к «Меню»') : fail(`фокус после закрытия: «${at.slice(0, 60)}»`);
    },
  },
  {
    n: 1025,
    title: 'Решение 118 (UI-06, UI-12): телефон — строка показа не больше двух строк, «показать на всём небе» у лица вне показа видна; в листе «Показ» параметры рода — сразу под своим видом, «по отцам» и «по крови» объяснены рядом',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/eliav-syn-iesseya~vk', { start: 'key', ms: 3000 });
      const bar = p.locator('.sky .showbar');
      const box = await bar.boundingBox();
      if (!box) return fail('нет строки показа');
      // строк — не больше двух (по строкам текста внутри), лицо вне показа — в видимой части первой строки
      const m = (await bar.evaluate((e) => {
        const txt = e.querySelector('.txt') as HTMLElement;
        const r = document.createRange();
        r.selectNodeContents(txt);
        // строки — по серединам прямоугольников текста: соседние ближе 12 px — одна строка
        const mids = [...r.getClientRects()].filter((q) => q.width > 1 && q.height > 1).map((q) => (q.top + q.bottom) / 2).sort((x, y) => x - y);
        const tops: number[] = [];
        for (const y of mids) if (!tops.length || y - tops[tops.length - 1] > 12) tops.push(y);
        const sv = e.querySelector('.sb-v') as HTMLElement | null;
        const bb = (sv ?? txt).getBoundingClientRect();
        let seen = '';
        const walker = document.createTreeWalker(sv ?? txt, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n.textContent ?? '';
          for (let i = 0; i < t.length; i++) {
            const q = document.createRange();
            q.setStart(n, i);
            q.setEnd(n, i + 1);
            const rc = q.getBoundingClientRect();
            if (rc.width && rc.right <= bb.right + 0.5) seen += t[i];
          }
        }
        return { lines: tops.length, seen };
      })) as { lines: number; seen: string };
      if (m.lines > 2) return fail(`строк в строке показа: ${m.lines}`);
      if (!/Елиав — вне показа/.test(flat(m.seen))) return fail(`видно: «${flat(m.seen)}»`);
      const reveal = bar.locator('.sb-cmd[data-cmd="reveal"]');
      const rb = await reveal.boundingBox().catch(() => null);
      if (!rb || rb.width < 10 || rb.x + rb.width > 390 || rb.y < box.y - 1 || rb.y + rb.height > box.y + box.height + 1) return fail('«показать на всём небе» не видна в строке');
      // лист «Показ»: вид «Предки и потомки лица…» — его параметры сразу под ним
      await bar.locator('.sb-cmd[data-cmd="sheet"]').first().tap();
      await p.waitForTimeout(600);
      await p.locator('.showsheet .ss-kind', { hasText: 'Предки и потомки' }).first().tap();
      await p.waitForTimeout(600);
      const order = (await p.evaluate(() => {
        const kinds = [...document.querySelectorAll('.showsheet .ss-kind')];
        const i = kinds.findIndex((k) => /Предки[\s\u00a0\u2060]+и[\s\u00a0\u2060]+потомки/.test(k.textContent ?? ''));
        const part = document.querySelector('.showsheet .ss-by-note');
        if (i < 0 || !part) return `нет (видов ${kinds.length}, выбран ${i}, пояснение ${!!part})`;
        const after = kinds[i].compareDocumentPosition(part) & Node.DOCUMENT_POSITION_FOLLOWING;
        const next = kinds[i + 1];
        const before = !next || part.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING;
        return after && before ? 'под видом' : 'не там';
      })) as string;
      if (order !== 'под видом') return fail(`параметры рода: ${order}`);
      const note = flat(await p.locator('.showsheet .ss-by-note').innerText());
      return /^По (отцам|крови):/.test(note) ? pass(`${m.lines} строки; «${flat(m.seen).slice(0, 40)}»; ${note.slice(0, 50)}…`) : fail(`пояснение: «${note}»`);
    },
  },
];
