/**
 * Сценарии приёмки этапа 13, T5 «Время на небе и панели» (docs/ui-review/STAGE13.md, решения 99, 100, 102, 103, 111;
 * приёмка П14, П22; сценарии 4 и 6), группа time13: номера 980–999.
 *  — 980 список моделей: «Меняет», «Напряжения», строка про Исход; строка модели в строке показа — «вернуть основную»;
 *  — 981 панель «О хронологии»: словарь, Рождество, цепочка с пунктиром модели, таблица моделей; входы в неё;
 *  — 982 слои — в «Вид»; выключенный слой называет строка показа, «вернуть» включает;
 *  — 983 П22: эра на линейке в каждом окне (1440 и 390); шкала «от сотворения»;
 *  — 984 ярусы Озии: формула по опоре-правителю, подпись штриховки, подсказка «вместе с отцом, Амасией», годы без «ок.»;
 *  — 985 ярусы Езекии: синхронизм 4 Цар 18:1 вне отрезка — штрих у начала с подсказкой, не вертикаль на Ахазе;
 *  — 986 лист «Эпохи»: «ярусы эпох», «расч.» с пояснением по модели, ссылки на «О хронологии»;
 *  — 987 телефон: «Вид» — «Шкала лет», «Слои», «О хронологии»; колонка названий ярусов не шире трети неба;
 *  — 988 «О карте»: без шкалы, которой не было, без «ТЗ», с «О хронологии» и названием родословия из интерфейса;
 *  — 989 § 5.6 на новых экранах: нет «·», «→» на кнопках, моноширинных подписей;
 *  — 990 решение 123: телефон, лист карточки во весь экран — полоса времени строкой возврата; низкое окно — ярусы свёрнуты
 *    в заголовок;
 *  — 991 решения 124, 130: «Сжатый по плотности лиц» / «Равномерный по годам»; понимание Лк 3 и настройки переживают
 *    перезагрузку, испорченные сохранения — значения по умолчанию.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';
import { open } from './unify11.ts';

const flat = (s: string) => s.replace(/[  ]/g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ').trim();
const PHONE = { width: 390, height: 844, touch: true };
/** Видимые строки состояния под строкой показа (контракт 5: модель и слои), без объявления для диктора. */
const bar = async (p: Page) => (await p.locator('.sky .showbar .sb-line').allInnerTexts()).map(flat).join(' | ');
const sheetText = async (p: Page) => flat(await p.locator('section.sheet').first().innerText());
const tiersState = async (p: Page) =>
  JSON.parse(((await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLElement | null)?.dataset.tiers)) as string | undefined) ?? 'null') as {
    formula: { text: string[] } | null;
    hatch: number;
    sync: number;
    syncOut: number;
    ticks: [number, number, string][];
    selBar: [number, number, number, number] | null;
  } | null;
const canvasAt = async (p: Page) => (await p.locator('.sky canvas').boundingBox())!;
async function openView(p: Page) {
  await p.locator('.skyctl .view-toggle').click();
  await p.waitForTimeout(350);
}

export const time13: Scenario[] = [
  {
    n: 980,
    title: 'Решение 102: список моделей — «Меняет», «Напряжения», внизу — Исход во всех моделях; строка модели в строке показа, «вернуть основную»',
    run: async (p) => {
      await open(p, '#/moisey~mmt-long', { start: 'all', ms: 2600 });
      await openView(p);
      await p.locator('.viewpop .menu.model > button').click();
      await p.waitForTimeout(350);
      const items = (await p.locator('.viewpop [role="menuitemradio"]').allInnerTexts()).map(flat);
      if (items.length !== 4) return fail(`моделей в списке: ${items.length}`);
      if (!/^Основной текст: 430 лет в Египте — по умолчанию/.test(items[0])) return fail(`первая модель: «${items[0].slice(0, 60)}»`);
      if (items.some((t) => /масорет/i.test(t))) return fail('«масоретские» в списке');
      for (const t of items.slice(1)) if (!/Меняет \d+ лиц/.test(t)) return fail(`нет «Меняет»: «${t.slice(0, 60)}»`);
      if (!items.every((t) => /Напряжения \d+/.test(t))) return fail('не у всех моделей «Напряжения»');
      if (!/215 лет позже/.test(items[1])) return fail('«Краткое пребывание» не говорит, что годы до Исхода на 215 лет позже');
      const foot = flat(await p.locator('.viewpop .menu-foot').innerText());
      if (!/^Во всех моделях одинаковы Исход \(1446 г\. до Р\. Х\.\) и годы после него: 3 Цар 6:1/.test(foot)) return fail(`строка под списком: «${foot}»`);
      await p.locator('.viewpop [role="menuitemradio"]', { hasText: 'Краткое пребывание' }).click();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(1500);
      const b = await bar(p);
      if (!/Годы — по модели «Краткое пребывание»/.test(b)) return fail(`строка показа: «${b}»`);
      await p.locator('.sky .showbar button', { hasText: 'вернуть основную' }).click();
      await p.waitForTimeout(1200);
      const m = await p.evaluate(() => localStorage.getItem('toledot:model'));
      if (m !== '"mt-long"') return fail(`модель после «вернуть основную»: ${m}`);
      return /по модели/.test(await bar(p)) ? fail('строка модели осталась') : pass(`${items.length} модели; ${foot.slice(0, 50)}…`);
    },
  },
  {
    n: 981,
    title: 'Решение 102: панель «О хронологии» — как читать годы, Рождество ок. 5 г. до Р. Х., цепочка от 967 с пунктиром модели, таблица моделей; входы из «Вид», «О карте», «Эпох»',
    run: async (p) => {
      await open(p, '#/~pchronology', { start: 'all', ms: 2200 });
      const t = await sheetText(p);
      for (const h of ['Как читать годы', 'Почему Рождество Христово — «ок. 5 г. до Р. Х.»', 'Откуда годы', 'Модели', 'Шкала лет на линейке', 'Внебиблейские опоры', 'Хронологические напряжения'])
        if (!t.includes(h)) return fail(`нет раздела «${h}»`);
      if (/\bТЗ\b/.test(t)) return fail('«ТЗ» в тексте для читателя');
      for (const w of ['1446 г. до Р. Х.', 'между 45 и 20 гг. до Р. Х.', 'не позже', 'последнее упоминание']) if (!t.includes(w)) return fail(`в словаре нет «${w}»`);
      const dep = await p.locator('section.sheet .ychain .dep').count();
      if (dep < 5) return fail(`звеньев модели, обведённых пунктиром: ${dep}`);
      const exodus = (await p.locator('section.sheet .ytable tr', { hasText: 'Исход' }).locator('td').allInnerTexts()).map(flat);
      if (exodus.length !== 4 || !exodus.every((x) => x === '1446')) return fail(`строка «Исход» таблицы: ${exodus.join(' | ')}`);
      // входы: «Вид» → «О хронологии», «О карте» → «О хронологии»
      await open(p, '#/david', { start: 'all', ms: 2400 });
      await openView(p);
      await p.locator('.viewpop button', { hasText: 'О хронологии' }).click();
      await p.waitForTimeout(600);
      if (!(await p.locator('section.sheet h2', { hasText: 'О хронологии' }).count())) return fail('«Вид» → «О хронологии» не открыл панель');
      await open(p, '#/~pabout', { start: 'all', ms: 2000 });
      await p.locator('section.sheet button', { hasText: 'О хронологии' }).first().click();
      await p.waitForTimeout(600);
      if (!(await p.locator('section.sheet h2', { hasText: 'О хронологии' }).count())) return fail('«О карте» → «О хронологии» не открыл панель');
      await open(p, '#/~pepochs', { start: 'all', ms: 2000 });
      const links = p.locator('section.sheet .chrono-link');
      const nLinks = await links.count();
      if (!nLinks) return fail('в «Эпохах» нет ссылок «см. «О хронологии»»');
      {
        await links.first().click();
        await p.waitForTimeout(600);
        if (!(await p.locator('section.sheet h2', { hasText: 'О хронологии' }).count())) return fail('«см. «О хронологии»» в «Эпохах» не открыл панель');
      }
      return pass(`звеньев модели ${dep}; ссылок из «Эпох» ${nLinks}`);
    },
  },
  {
    n: 982,
    title: 'Решение 111: слои — в «Вид»; выключенные «связи» называет строка показа: «Скрыто: связи — вернуть»',
    run: async (p) => {
      await open(p, '#/david', { start: 'all', ms: 2400 });
      await openView(p);
      const boxes = p.locator('.viewpop .layer-list input[type="checkbox"]');
      if ((await boxes.count()) !== 8) return fail(`флажков слоёв: ${await boxes.count()}`);
      await p.locator('.viewpop .layer-list label', { hasText: /^связи$/ }).click();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(700);
      const b = await bar(p);
      if (!/Скрыто: связи/.test(b)) return fail(`строка показа: «${b}»`);
      await p.locator('.sky .showbar button', { hasText: /^вернуть$/ }).click();
      await p.waitForTimeout(600);
      const layers = JSON.parse((await p.evaluate(() => localStorage.getItem('toledot:layers'))) ?? '{}') as Record<string, boolean>;
      if (layers.connectors === false) return fail('«вернуть» не включил связи');
      return /Скрыто/.test(await bar(p)) ? fail('строка «Скрыто» осталась') : pass(b);
    },
  },
  {
    n: 983,
    title: 'П22: эра на линейке в каждом окне — 1440 и 390, разные масштабы; шкала «от сотворения» из «Вид»',
    run: async (p) => {
      const windows = ['~y-4000~w20', '~y-3000~w45', '~y-1000~w60', '~y-500~w400', '~y-2000~w1500', '~y0~w80', '~y-5~w20', '~y60~w30'];
      const bad: string[] = [];
      let n = 0;
      const check = async (tag: string) => {
        for (const w of windows) {
          await open(p, `#/${w}`, { start: 'all', ms: 1500 });
          const r = (await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLElement).dataset.ruler)) ?? '';
          n++;
          if (/\d/.test(r) && !/Р\. Х\./.test(flat(r))) bad.push(`${tag} ${w}: ${r.slice(0, 40)}`);
        }
      };
      await check('1440');
      await p.setViewportSize({ width: 390, height: 844 });
      await check('390');
      if (bad.length) return fail(`без эры: ${bad.join('; ')}`);
      await p.setViewportSize({ width: 1440, height: 900 });
      await open(p, '#/~y-2500~w300', { start: 'all', ms: 1800 });
      await openView(p);
      await p.locator('.viewpop .seg.era button', { hasText: 'от сотворения' }).click();
      await p.waitForTimeout(500);
      const am = flat((await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLElement).dataset.ruler)) ?? '');
      await p.locator('.viewpop .seg.era button', { hasText: 'до / по Р. Х.' }).click();
      if (!/от сотворения/.test(am)) return fail(`шкала «от сотворения»: «${am}»`);
      return pass(`${n} окон с эрой; «${am.split('|')[0]}»`);
    },
  },
  {
    n: 984,
    title: 'Решения 100, 103: ярусы Озии — формула по правителю, подпись штриховки; подсказка «вместе с отцом, Амасией», годы царствования без «ок.»',
    run: async (p) => {
      await open(p, '#/oziya~y-770~w160~mmt-long~e1', { start: 'all', ms: 3200 });
      let st = await tiersState(p);
      for (let k = 0; k < 4 && !(st?.hatch && st.selBar); k++) {
        await p.waitForTimeout(1000);
        st = await tiersState(p);
      }
      if (!st) return fail('нет ярусов');
      const f = st.formula?.text.join(' ') ?? '';
      if (!/Озия родился в царствование Иоаса, царя Иудеи/.test(f)) return fail(`формула: «${f}»`);
      if (st.hatch < 1) return fail('штриховка без подписи');
      if (!st.selBar) return fail('нет отрезка Озии в ярусе');
      const c = await canvasAt(p);
      const [x, y, w, h] = st.selBar;
      await p.mouse.move(c.x + x + Math.min(w / 2, 60), c.y + y + h / 2);
      await p.waitForTimeout(700);
      const tip = flat(await p.locator('.tip').first().innerText().catch(() => ''));
      if (!/вместе с отцом, Амасией/.test(tip)) return fail(`подсказка: «${tip}»`);
      if (/ок\. 792/.test(tip)) return fail('«ок.» у года царствования');
      return pass(`${f}; ${tip.slice(0, 80)}`);
    },
  },
  {
    n: 985,
    title: 'Решение 103 (X1 Б2): синхронизм Езекии «в 3-й год Осии» — штрих у начала отрезка с подсказкой, а не вертикаль на отрезке Ахаза',
    run: async (p) => {
      await open(p, '#/ezekiya~y-722~w70~mmt-long~e1', { start: 'all', ms: 3200 });
      // ярусы раскладываются, когда небо остановилось: под нагрузкой — ещё кадр
      let st = await tiersState(p);
      for (let k = 0; k < 4 && !st?.ticks.some((t) => t[2] === 'ezekiya'); k++) {
        await p.waitForTimeout(1000);
        st = await tiersState(p);
      }
      if (!st) return fail('нет ярусов');
      const tick = st.ticks.find((t) => t[2] === 'ezekiya');
      if (!tick) return fail(`штриха синхронизма у Езекии нет (штрихов ${st.ticks.length})`);
      const c = await canvasAt(p);
      await p.mouse.move(c.x + tick[0], c.y + tick[1]);
      await p.waitForTimeout(700);
      const tip = flat(await p.locator('.tip').first().innerText().catch(() => ''));
      if (!/4 Цар 18:1: в 3-й год Осии/.test(tip) || !/принятое начало — 715 г\. до Р\. Х\./.test(tip)) return fail(`подсказка штриха: «${tip}»`);
      return pass(tip.slice(0, 90));
    },
  },
  {
    n: 986,
    title: 'Решения 99, 109: лист «Эпохи» — «ярусы эпох», «расч.» с пояснением, зависят ли годы от модели',
    run: async (p) => {
      await open(p, '#/~pepochs', { start: 'all', ms: 2200 });
      const t = await sheetText(p);
      if (/ярусы на небе/.test(t)) return fail('«ярусы на небе»');
      if (!(await p.locator('section.sheet label', { hasText: 'ярусы эпох' }).count())) return fail('нет флажка «ярусы эпох»');
      const marks = await p.locator('section.sheet table.epochs .mark').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
      if (marks.length < 10) return fail(`помет «расч.» у эпох: ${marks.length}`);
      if (!marks.some((m) => /по модели/.test(m))) return fail('ни у одной эпохи пояснение не говорит о модели');
      if (!marks.some((m) => /одинаковы во всех моделях/.test(m))) return fail('нет пояснения «одинаковы во всех моделях»');
      return pass(`${marks.length} помет`);
    },
  },
  {
    n: 987,
    title: 'Телефон: «Вид» — «Шкала лет», «Слои», «О хронологии»; колонка названий ярусов не шире трети неба',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/david', { start: 'all', ms: 2800 });
      await p.locator('.sky .skyctl.column button[aria-expanded]').click();
      await p.waitForTimeout(500);
      const t = flat(await p.locator('.sheet:has(.viewctl)').innerText());
      for (const w of ['Шкала лет', 'Слои', 'О хронологии', 'до / по Р. Х.', 'связи']) if (!t.includes(w)) return fail(`в листе «Вид» нет «${w}»`);
      await p.locator('.sheet:has(.viewctl) .close, .sheet:has(.viewctl) button[aria-label^="Закрыть"]').first().click().catch(() => {});
      await open(p, '#/oziya~y-770~w160~mmt-long~e1', { start: 'all', ms: 3200 });
      const col = JSON.parse((await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLElement).dataset.tiers)) ?? '{}').col as number;
      const w = (await canvasAt(p)).width;
      return col <= w / 3 ? pass(`колонка ${col} из ${Math.round(w)} px`) : fail(`колонка названий ${col} px при небе ${Math.round(w)}`);
    },
  },
  {
    n: 988,
    title: 'Решение 102: «О карте» — без абзаца о шкале, без «ТЗ», с «О хронологии»; начало — «Родословие Иисуса Христа (Мф 1, Лк 3)»',
    run: async (p) => {
      await open(p, '#/~pabout', { start: 'all', ms: 2000 });
      const t = await sheetText(p);
      if (/\(ТЗ П-6\)|\bТЗ\b/.test(t)) return fail('«ТЗ» в «О карте»');
      if (/Шкала «лет от сотворения»/.test(t)) return fail('абзац о шкале «лет от сотворения» остался');
      if (/модели расходятся только в годах до 967/.test(t)) return fail('прежняя фраза «модели расходятся только в годах до 967»');
      if (!t.includes('«Родословие Иисуса Христа (Мф 1, Лк 3)»')) return fail('название начала не то, что в интерфейсе');
      return (await p.locator('section.sheet button', { hasText: 'О хронологии' }).count()) ? pass() : fail('нет ссылки «О хронологии»');
    },
  },
  {
    n: 989,
    title: '§ 5.6 на новых экранах: список моделей, «О хронологии», «Вид» — без «·», «→» на кнопках, моноширинных подписей',
    run: async (p) => {
      const bad: string[] = [];
      const look = async (where: string, sel: string) => {
        const r = await p.evaluate((sel) => {
          const root = document.querySelector(sel);
          if (!root) return { text: '', mono: 0, arrows: 0 };
          const els = [...root.querySelectorAll<HTMLElement>('*')];
          const mono = els.filter((e) => e.childElementCount === 0 && e.textContent?.trim() && /mono/i.test(getComputedStyle(e).fontFamily)).length;
          const arrows = [...root.querySelectorAll('button')].filter((b) => /[→⟶]/.test(b.textContent ?? '')).length;
          return { text: (root as HTMLElement).innerText, mono, arrows };
        }, sel);
        if (!r.text) bad.push(`${where}: нет экрана`);
        if (/ · /.test(r.text)) bad.push(`${where}: «·»`);
        if (r.mono) bad.push(`${where}: моноширинных подписей ${r.mono}`);
        if (r.arrows) bad.push(`${where}: «→» на кнопках`);
      };
      await open(p, '#/~pchronology', { start: 'all', ms: 2200 });
      await look('«О хронологии»', 'section.sheet');
      await open(p, '#/moisey', { start: 'all', ms: 2400 });
      await openView(p);
      await look('«Вид»', '.viewpop');
      await p.locator('.viewpop .menu.model > button').click();
      await p.waitForTimeout(300);
      await look('список моделей', '.viewpop [role="menu"]');
      return bad.length ? fail(bad.join('; ')) : pass('снимки — в .ui-shots');
    },
  },
  {
    n: 990,
    title: 'Решение 123: телефон — лист карточки во весь экран сворачивает полосу времени в строку возврата «‹ Небо и время»; низкое окно — ярусы эпох свёрнуты в заголовок',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/david', { start: 'all', ms: 2800 });
      const h0 = (await p.locator('.strip').boundingBox())!.height;
      await p.locator('.folio .sheet-bar .bar-toggle').first().tap();
      await p.waitForTimeout(900);
      const back = p.locator('.strip .strip-back');
      if (!(await back.count())) return fail('строки возврата нет');
      const h1 = (await p.locator('.strip').boundingBox())!.height;
      if (!(h1 < h0)) return fail(`полоса не сузилась: ${h0} → ${h1}`);
      await back.tap();
      await p.waitForTimeout(900);
      if (await p.locator('.strip .strip-back').count()) return fail('строка возврата осталась после касания');
      const h2 = (await p.locator('.strip').boundingBox())!.height;
      await p.setViewportSize({ width: 844, height: 390 });
      await open(p, '#/oziya~y-770~w160~e1', { start: 'all', ms: 3200 });
      const st = JSON.parse((await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLElement).dataset.tiers)) ?? '{}') as { header?: number };
      if (!st.header) return fail('на низком окне ярусы не свёрнуты в заголовок');
      return pass(`полоса ${h0} → ${h1} → ${h2} px; низкое окно: свёрнуто ярусов ${st.header}`);
    },
  },
  {
    n: 991,
    title: 'Решения 124, 130: масштабы «Сжатый по плотности лиц» и «Равномерный по годам»; понимание Лк 3 и настройки переживают перезагрузку; испорченные сохранения — значения по умолчанию',
    run: async (p) => {
      await open(p, '#/david', { start: 'all', ms: 2400 });
      await openView(p);
      const segs = (await p.locator('.viewpop .seg').first().locator('button').allInnerTexts()).map(flat);
      if (segs.join('|') !== 'Сжатый по плотности лиц|Равномерный по годам') return fail(`масштабы: ${segs.join(' | ')}`);
      if (/истинн|насыщенн/i.test(flat(await p.locator('.viewpop').innerText()))) return fail('прежние слова масштаба в «Вид»');
      // испорченные сохранения: null, чужая схема, битая строка
      await p.evaluate(() => {
        localStorage.setItem('toledot:model', 'null');
        localStorage.setItem('toledot:lambda', '"x"');
        localStorage.setItem('toledot:layers', '[1]');
        localStorage.setItem('toledot:ruler', '{');
        localStorage.setItem('toledot:luke', '"joseph"');
      });
      // адрес без полей вида: состояние берётся из сохранений (адрес с полями вида восстанавливает своё — решение 130)
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.reload();
      await p.waitForTimeout(2600);
      const st = await p.evaluate(() => ({ model: localStorage.getItem('toledot:model'), lambda: localStorage.getItem('toledot:lambda'), luke: localStorage.getItem('toledot:luke') }));
      if (st.model !== '"mt-long"' || st.lambda !== '1') return fail(`после перезагрузки: ${JSON.stringify(st)}`);
      if (st.luke !== '"joseph"') return fail(`понимание Лк 3 не сохранилось: ${st.luke}`);
      await p.evaluate(() => localStorage.setItem('toledot:luke', '"mary"'));
      return pass(JSON.stringify(st));
    },
  },
];
