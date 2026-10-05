/**
 * Сценарии приёмки этапа 13, T4 «Карточка лица» (docs/ui-review/STAGE13.md, решения 96–98, 100, 104, 106, 112; сценарии
 * § 4: 3 «Мария», 4 «Краткое пребывание» — паспорт Авраама, 6 «Озия», 7 «Иехония», 8 «один порядок детей», 9 § 5.6),
 * группа card13: номера 960–979.
 *  — 960–961 Мария: паспорт — три строки времени и видимая эпоха, «род. между…», «последнее упоминание», «Колено / народ»
 *    без «по толкованию» в строке и «По браку»; мини-шкала с «Р. Х.»; ночь и день, 1440 и телефон 390;
 *  — 962 Озия: «Царствовал» — соправления словами («вместе с отцом, Амасией», «вместе с сыном, Иоафамом»);
 *  — 963 Иехония: § 11 и § 12 — у обоих Седекий видно уточнение (решение 106);
 *  — 964 Адам, Исаак, Иаков, Сим, Давид: один порядок детей в § 10, «Родстве» у звезды и карточке союза (решение 104);
 *  — 965 Аса: «Мааха — названа «матерью»…; по родословию — бабка» (решение 106);
 *  — 966 Илия: § 14 — Преображение в строке «Вне земной жизни», у имён годы (решение 100);
 *  — 967 Давид и Вирсавия: Соломон виден в карточке союза, знак лент; «Потомки без промежуточных звеньев» (решения 104, 109);
 *  — 968 модель «Краткое пребывание»: паспорт Авраама — «в модели «Основной текст» — …», § 13 «Модель» (решения 96, 102);
 *  — 969 § 13 в постоянном порядке: «Откуда годы», «Эпоха», «Модель»; Мелхиседек — «В Писании: … встреча с Авраамом»;
 *  — 970 клавиатура на русской раскладке: Tab до пометы «расч.» паспорта, Enter — пояснение, своё у лица;
 *  — 971 § 5.6 и axe: шапка и разделы карточки в обеих темах, 1440 и 390;
 *  — 972 стихи раскрываются полностью: межглавная «Быт 27:41–28:5» (Иаков, § 17) — 11 стихов, «3 Цар 8:1–66» и
 *    «2 Пар 5:2–7:10» (Соломон, § 17) — 66 и 65; без многоточия (решение 129);
 *  — 973 «см. § 24» переносит фокус на заголовок раздела, следующий Tab — внутри него; при ослабленном движении — сразу
 *    (решение 115);
 *  — 974 карточка держит контекст (решение 119): после прокрутки полоса называет лицо и раздел; оглавление «Разделы
 *    карточки»; закреплённая вкладка возвращает к месту чтения; подпись «Закреплённые карточки»; на телефоне — текущий
 *    раздел и раскрывающийся список;
 *  — 975 ссылка на стих узнаётся до наведения (решение 121): точечная черта у стиха, сплошная у имени и команды, в обеих
 *    темах; подзаголовок записи § 24 — отдельной строкой;
 *  — 976 «На весь экран» (решение 123): лист поверх неба и панелей, небо недоступно Tab, Escape возвращает; из пояснения
 *    «расч.» — «О хронологии» и «Сменить модель» (решение 124).
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';
import { axeOn, clickStar, open, templateIssues } from './unify11.ts';

const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ').trim();
const PHONE = { width: 390, height: 844, touch: true };

/** Паспорт открытой карточки: подпись поля → значение. */
async function passport(p: Page): Promise<Map<string, string>> {
  const rows = (await p.evaluate(() => {
    const dl = document.querySelector('.folio .mast .passport');
    if (!dl) return [];
    const out: [string, string][] = [];
    for (const dt of dl.querySelectorAll('dt')) {
      const dd = dt.nextElementSibling as HTMLElement | null;
      if (dd) out.push([dt.textContent ?? '', dd.innerText ?? '']);
    }
    return out;
  })) as [string, string][];
  return new Map(rows.map(([k, v]) => [flat(k), flat(v)]));
}
/** Раскрыть все сведения карточки («Показать все сведения») и все «ещё N» в разделе n; текст раздела. */
async function sec(p: Page, n: number): Promise<string> {
  const all = p.locator('.folio .rest button.more');
  if (await all.count()) {
    await all.first().click();
    await p.waitForTimeout(500);
  }
  const el = p.locator(`.folio #sec-${n}`);
  if (!(await el.count())) return '';
  for (let i = 0; i < 5; i++) {
    const more = el.locator('button.more:not(.see)');
    if (!(await more.count())) break;
    await more.first().click().catch(() => {});
    await p.waitForTimeout(200);
  }
  const det = el.locator('details.calc');
  if (await det.count()) await det.evaluate((d) => ((d as HTMLDetailsElement).open = true));
  return flat(await el.innerText());
}
/** Лица по порядку появления в элементе. */
const idsIn = (p: Page, sel: string) => p.locator(`${sel} .person[data-id], ${sel} button.person[data-id]`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id ?? ''));
/** Идут ли xs в seq в том же порядке (по первому появлению); лица, которых нет в seq, пропускаются. */
function sameOrder(seq: string[], xs: string[]): boolean {
  const at = xs.map((x) => seq.indexOf(x)).filter((i) => i >= 0);
  return at.every((v, i) => i === 0 || v > at[i - 1]);
}

export const card13: Scenario[] = [
  {
    n: 960,
    title: 'Мария (1440, ночь): «Годы» — род. между…, последнее упоминание; «В Писании»; видимая «Эпоха»; «Колено / народ» и «По браку»',
    run: async (p) => {
      await open(p, '#/mariya', { theme: 'night' });
      const pp = await passport(p);
      const why: string[] = [];
      const years = pp.get('Годы') ?? '';
      if (!/^род\. между \d+ и \d+ гг\. до Р\. Х\./.test(years)) why.push(`Годы: «${years}»`);
      if (!/последнее упоминание — 30 г\. по Р\. Х\./.test(years)) why.push(`нет «последнего упоминания»: «${years}»`);
      // эпоха служения Иисуса в data/epochs.json (T3, этап 13) — «Евангельская история»
      if (!/^Евангельская история/.test(pp.get('Эпоха') ?? '')) why.push(`Эпоха: «${pp.get('Эпоха')}»`);
      if (!/родилась в эпоху «Межзаветное время»/.test(pp.get('Эпоха') ?? '')) why.push('нет эпохи рождения второй строкой');
      if (!pp.has('В Писании')) why.push('нет строки «В Писании»');
      const tribe = pp.get('Колено / народ') ?? '';
      if (/по толкованию|по браку/.test(tribe) || !/^колено Иудино, дом Давидов/.test(tribe)) why.push(`Колено / народ: «${tribe}»`);
      if (pp.get('По браку') !== 'колено Иудино (жена Иосифа)') why.push(`По браку: «${pp.get('По браку')}»`);
      // эпоха — видимая строка: для диктора отдельной скрытой копии нет
      if (await p.locator('.folio .mast .passport .visually-hidden').count()) why.push('скрытая строка эпохи для диктора осталась');
      return why.length ? fail(why.join('; ')) : pass(`${years}; ${pp.get('Эпоха')}`);
    },
  },
  {
    n: 961,
    title: 'Мария на телефоне 390, день: те же строки паспорта, без горизонтальной прокрутки листа',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/mariya', { theme: 'day', ms: 3200 });
      const up = p.locator('.folio .bar-toggle');
      if (await up.count()) {
        await up.first().tap();
        await p.waitForTimeout(700);
      }
      const pp = await passport(p);
      const why: string[] = [];
      for (const k of ['Годы', 'В Писании', 'Эпоха', 'Колено / народ', 'По браку']) if (!pp.has(k)) why.push(`нет «${k}»`);
      const over = await p.evaluate(() => {
        const f = document.querySelector<HTMLElement>('.folio .folio-inner') ?? document.querySelector<HTMLElement>('.folio');
        return f ? f.scrollWidth - f.clientWidth : 0;
      });
      if (over > 2) why.push(`лист шире экрана на ${over} px`);
      return why.length ? fail(why.join('; ')) : pass([...pp.keys()].join(', '));
    },
  },
  {
    n: 962,
    title: 'Озия: «Царствовал» — срок и годы, соправления словами: «вместе с отцом, Амасией», «вместе с сыном, Иоафамом»',
    run: async (p) => {
      await open(p, '#/oziya');
      const pp = await passport(p);
      const r = pp.get('Царствовал') ?? '';
      const why: string[] = [];
      if (!/^52 года: 792–740 гг\. до Р\. Х\./.test(r)) why.push(`«${r.slice(0, 60)}»`);
      if (!/вместе с отцом, Амасией/.test(r)) why.push('нет «вместе с отцом, Амасией»');
      if (!/вместе с сыном, Иоафамом/.test(r)) why.push('нет «вместе с сыном, Иоафамом»');
      if (/ок\. 7/.test(r)) why.push('«ок.» у годов реконструкции');
      return why.length ? fail(why.join('; ')) : pass(r);
    },
  },
  {
    n: 963,
    title: 'Иехония: § 11 «Брат: Седекия (сын Иоакима…)», § 12 «Седекия (царь Иудейский…) — дядя»',
    run: async (p) => {
      await open(p, '#/iekhoniya');
      const s11 = await sec(p, 11);
      const s12 = await sec(p, 12);
      const ok = /Седекия \(сын Иоакима/.test(s11) && /Седекия \(царь Иудейский/.test(s12);
      return ok ? pass(`${s11.slice(0, 50)} | ${s12.slice(0, 50)}`) : fail(`§ 11 «${s11.slice(0, 80)}»; § 12 «${s12.slice(0, 80)}»`);
    },
  },
  {
    n: 964,
    title: 'Адам, Исаак, Иаков, Сим, Давид: порядок детей в § 10, в «Родстве» у звезды и в карточке союза один — порядок текста',
    run: async (p) => {
      const WANT: [string, string, string[]][] = [
        ['adam', 'eva', ['kain', 'avel', 'sif']],
        ['isaak', 'revekka', ['isav', 'iakov']],
        ['iakov', 'liya', ['ruvim', 'simeon', 'leviy', 'iuda']],
        ['sim', '', ['elam-syn-sima', 'assur-syn-sima', 'arfaksad', 'lud', 'aram-syn-sima']],
        ['david', 'virsaviya', ['samus-syn-davida', 'sovav-syn-davida', 'nafan-syn-davida', 'solomon']],
      ];
      const why: string[] = [];
      for (const [id, wife, kids] of WANT) {
        await open(p, `#/${id}`);
        await sec(p, 10);
        const ten = await idsIn(p, '.folio #sec-10');
        if (!sameOrder(ten, kids) || kids.some((k) => !ten.includes(k))) why.push(`${id} § 10: ${ten.slice(0, 8).join(',')}`);
        // «Родство» у звезды: видимые имена строки детей — в том же порядке
        if (await clickStar(p, id)) {
          const kin = await idsIn(p, ':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-row.children');
          if (!sameOrder(kin, kids)) why.push(`${id} «Родство»: ${kin.join(',')}`);
        }
        // карточка союза: по ссылке «союз» у группы детей
        const link = p.locator(`.folio #sec-10 .ulink[data-union*="${wife || id}"]`).first();
        if (await link.count()) {
          await link.click();
          await p.waitForTimeout(900);
          const u = await idsIn(p, '.folio .union-body #uh-kids ~ *');
          if (!sameOrder(u, kids) || kids.some((k) => !u.includes(k))) why.push(`${id} карточка союза: ${u.join(',')}`);
        }
      }
      return why.length ? fail(why.join('; ')) : pass('Каин, Авель, Сиф; Исав, Иаков; Рувим…; Елам…Арам; Самус…Соломон');
    },
  },
  {
    n: 965,
    title: 'Аса: § 12 «Мааха — названа «матерью» (3 Цар 15:10); по родословию — бабка» с пометой «выв.»',
    run: async (p) => {
      await open(p, '#/asa');
      const t = await sec(p, 12);
      return /Мааха — названа «матерью» ?3 Цар 15:10.*; по родословию — бабка ?выв\./.test(t) ? pass(t.slice(0, 90)) : fail(`«${t.slice(0, 120)}»`);
    },
  },
  {
    n: 966,
    title: 'Илия: § 14 — Преображение в строке «Вне земной жизни», а не среди встреч; у имён — годы',
    run: async (p) => {
      await open(p, '#/iliya');
      const t = await sec(p, 14);
      const [meet, beyond = ''] = t.split('Вне земной жизни');
      const why: string[] = [];
      if (!/Преображения/.test(beyond)) why.push('нет Преображения в «Вне земной жизни»');
      if (/Преображения/.test(meet)) why.push('Преображение среди встреч');
      if (!/Ахав \([^)]*; [^)]*\d{3}[^)]*\)/.test(t)) why.push(`у Ахава нет годов: «${meet.slice(0, 120)}»`);
      if (!/Наверняка жили в одно время — /.test(t)) why.push('подпись «Наверняка…» не объясняет себя');
      return why.length ? fail(why.join('; ')) : pass(beyond.slice(0, 100));
    },
  },
  {
    n: 967,
    title: 'Давид и Вирсавия: Соломон виден в карточке союза, со знаком лент; у Давида — строка «Потомки без промежуточных звеньев»',
    run: async (p) => {
      await open(p, '#/david');
      await sec(p, 10);
      await p.locator('.folio #sec-10 .ulink[data-union*="virsav"]').first().click();
      await p.waitForTimeout(900);
      const why: string[] = [];
      const sol = p.locator('.folio .union-body .person[data-id="solomon"]');
      if (!(await sol.count()) || !(await sol.first().isVisible())) why.push('Соломон не виден');
      if (!(await p.locator('.folio .union-body .person[data-id="solomon"] + .dc-lines').count())) why.push('у Соломона нет знака лент');
      const body = flat(await p.locator('.folio').innerText());
      if (!/Потомки без промежуточных звеньев: Исмаил, Хаттуш/.test(body)) why.push('нет строки «Потомки без промежуточных звеньев»');
      const notes = (await p.locator('.folio .union-body .note').allInnerTexts()).map(flat);
      if (notes.some((t) => /другие союзы/.test(t) && /без промежуточных звеньев/.test(t))) why.push('потомки — среди союзов');
      if (!/Показать детей союза/.test(body)) why.push('команда не «Показать детей союза»');
      return why.length ? fail(why.join('; ')) : pass('Соломон на месте; потомки — своей строкой');
    },
  },
  {
    n: 968,
    title: 'Модель «Краткое пребывание»: у Авраама в паспорте — годы в основной модели; в § 13 «Модель» — что меняется',
    run: async (p) => {
      await open(p, '#/avraam', { extra: { model: 'mt-short' } });
      const pp = await passport(p);
      const y = pp.get('Годы') ?? '';
      const t = await sec(p, 13);
      const why: string[] = [];
      if (!/в модели «Основной текст» — 2166–1991 гг\. до Р\. Х\./.test(y)) why.push(`Годы: «${y}»`);
      if (!/Модель Годы зависят от модели хронологии; здесь — «Краткое пребывание»/.test(t)) why.push(`§ 13: «${t.slice(0, 160)}»`);
      const col = flat(await p.locator('.folio .colophon').first().innerText());
      if (!/по модели хронологии «Краткое пребывание/.test(col)) why.push(`колофон: «${col.slice(-120)}»`);
      await open(p, '#/david', { extra: { model: 'mt-short' } });
      const cd = flat(await p.locator('.folio .colophon').first().innerText());
      if (/модел/.test(cd)) why.push('у Давида строка о модели, хотя его годы от неё не зависят');
      return why.length ? fail(why.join('; ')) : pass(y);
    },
  },
  {
    n: 969,
    title: '§ 13 в постоянном порядке: «Откуда годы», «Эпоха», «Модель»; Мелхиседек — «В Писании: между … — встреча с Авраамом»',
    run: async (p) => {
      await open(p, '#/moisey');
      const t = await sec(p, 13);
      const why: string[] = [];
      // после заголовка раздела «Эпоха и относительная хронология» — строки в постоянном порядке
      const body = t.slice(t.indexOf('Откуда годы'));
      const at = ['Откуда годы', 'Эпоха', 'Модель'].map((w) => body.indexOf(w));
      if (at.some((i) => i < 0) || !(at[0] < at[1] && at[1] < at[2])) why.push(`Моисей § 13: «${t.slice(0, 160)}»`);
      await open(p, '#/melkhisedek');
      const pp = await passport(p);
      if (!/^между \d+ и \d+ гг\. до Р\. Х\./.test(pp.get('В Писании') ?? '') || !/встреча с Авраамом/.test(pp.get('В Писании') ?? '')) why.push(`Мелхиседек «В Писании»: «${pp.get('В Писании')}»`);
      if (pp.get('Годы') !== 'время не установлено') why.push(`Мелхиседек «Годы»: «${pp.get('Годы')}»`);
      return why.length ? fail(why.join('; ')) : pass(`${pp.get('В Писании')}`);
    },
  },
  {
    n: 970,
    title: 'Клавиатура на русской раскладке: Tab до пометы «расч.» у годов паспорта, Enter — пояснение, своё у лица',
    run: async (p) => {
      await open(p, '#/david');
      const title = p.locator('.folio .mast h2');
      await title.focus();
      let hit = false;
      for (let i = 0; i < 40 && !hit; i++) {
        await p.keyboard.press('Tab');
        hit = (await p.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          return !!a && a.classList.contains('mark') && !!a.closest('.passport') && /Годы/.test(a.closest('dd')?.previousElementSibling?.textContent ?? '');
        })) as boolean;
      }
      if (!hit) return fail('Tab не дошёл до пометы годов паспорта');
      const label = (await p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')) as string;
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      const note = flat((await p.locator('.folio .passport .mark-note').first().innerText().catch(() => '')) ?? '');
      const why: string[] = [];
      // пояснение своё у лица: откуда год (основание) и зависит ли он от модели
      if (!/год (по|вычислен)|оценка/.test(note)) why.push(`пояснение «${note}»`);
      if (!/одинаково во всех моделях/.test(note)) why.push('пояснение не говорит о модели');
      if (!/^расч\./.test(label)) why.push(`имя для диктора «${label}»`);
      return why.length ? fail(why.join('; ')) : pass(note);
    },
  },
  {
    n: 971,
    title: '§ 5.6 и axe: шапка и разделы карточки (Мария, Озия, Илия) — ночь и день, 1440 и 390',
    run: async (p) => {
      const why: string[] = [];
      for (const theme of ['night', 'day'] as const)
        for (const w of [1440, 390]) {
          await p.setViewportSize({ width: w, height: w > 400 ? 900 : 844 });
          for (const id of ['mariya', 'oziya', 'iliya']) {
            await open(p, `#/${id}`, { theme });
            await sec(p, 14);
            // лист — к началу: под закреплённой полосой листа не остаётся кнопок (axe target-size считает их перекрытыми)
            await p.evaluate(() => {
              for (const el of [document.querySelector('.folio'), ...document.querySelectorAll('.folio *')]) if (el && el.scrollTop > 0) el.scrollTop = 0;
            });
            await p.waitForTimeout(200);
            const t = await templateIssues(p, ['.folio .mast', '.folio .folio-body']);
            if (t.length) why.push(`${id} ${theme} ${w}: ${t.slice(0, 2).join('; ')}`);
            const a = await axeOn(p, '.folio');
            if (a.length) why.push(`${id} ${theme} ${w}: axe ${a.slice(0, 2).join('; ')}`);
          }
        }
      return why.length ? fail(why.slice(0, 4).join(' | ')) : pass('3 лица × 2 темы × 2 ширины');
    },
  },
  {
    n: 972,
    title: 'Стихи раскрываются полностью: «Быт 27:41–28:5» (Иаков, § 17) — 11 стихов, «3 Цар 8:1–66» и «2 Пар 5:2–7:10» (Соломон, § 17) — 66 и 65',
    run: async (p) => {
      const why: string[] = [];
      const got: string[] = [];
      for (const [id, n, ref, total, last] of [
        ['iakov', 17, /^Быт\s27:41–\u2060?28:5$/, 11, '28:5'],
        ['solomon', 17, /^3\sЦар\s8:1–\u2060?66$/, 66, '8:66'],
        ['solomon', 17, /^2\sПар\s5:2–\u2060?7:10$/, 65, '7:10'],
      ] as const) {
        await open(p, `#/${id}`);
        await sec(p, n);
        const btn = p.locator(`.folio #sec-${n} button.ref`).filter({ hasText: ref });
        if (!(await btn.count())) {
          why.push(`${id}: нет ссылки ${ref}`);
          continue;
        }
        await btn.first().click();
        const box = p.locator(`.folio #sec-${n} .verses`).first();
        await box.waitFor({ timeout: 5000 });
        // загрузка кончается стихами или словами, а не многоточием
        await p.waitForFunction((n) => !document.querySelector(`.folio #sec-${n} .verses[aria-busy]`), n, { timeout: 5000 }).catch(() => {});
        const more = box.locator('button.more');
        if (await more.count()) await more.first().click();
        const sups = (await box.locator('sup').allInnerTexts()).map((x) => x.trim());
        const text = flat(await box.innerText());
        if (sups.length !== total) why.push(`${id}: ${sups.length} стихов из ${total}`);
        if (sups[sups.length - 1] !== last) why.push(`${id}: последний стих ${sups[sups.length - 1]}`);
        if (/…|Загрузка|не удалось/.test(text)) why.push(`${id}: «${text.slice(0, 80)}»`);
        got.push(`${id}: ${sups.length}`);
      }
      // отказ загрузки (решение 127): «не удалось загрузить — повторить», а не вечное многоточие; повтор загружает
      await p.route('**/assets/00-*.js', (r) => r.abort());
      await open(p, '#/iakov');
      await sec(p, 17);
      await p.locator('.folio #sec-17 button.ref').first().click();
      const box = p.locator('.folio #sec-17 .verses').first();
      await p.waitForTimeout(800);
      const err = flat(await box.innerText().catch(() => ''));
      if (!/не удалось загрузить — повторить/.test(err)) why.push(`отказ: «${err}»`);
      await p.unroute('**/assets/00-*.js');
      await box.locator('button', { hasText: 'повторить' }).click().catch(() => {});
      await p.waitForTimeout(1200);
      const again = await box.locator('sup').count();
      got.push(`отказ — «${err}», повтор — ${again} стих.`);
      if (!again) why.push('повтор не загрузил стихи');
      return why.length ? fail(why.join('; ')) : pass(got.join(', '));
    },
  },
  {
    n: 973,
    title: '«см. § 24» (Моисей, § 13) переносит фокус на заголовок § 24; следующий Tab — внутри раздела; ослабленное движение — сразу',
    run: async (p) => {
      const why: string[] = [];
      for (const motion of ['no-preference', 'reduce'] as const) {
        await p.emulateMedia({ reducedMotion: motion });
        await open(p, '#/moisey');
        await sec(p, 13);
        const see = p.locator('.folio #sec-13 button.see').filter({ hasText: /24/ }).first();
        if (!(await see.count())) return fail('нет «см. § 24» в § 13');
        await see.focus();
        await p.keyboard.press('Enter');
        // при ослабленном движении прокрутка без плавности — заголовок на месте сразу
        await p.waitForTimeout(motion === 'reduce' ? 60 : 900);
        const st = (await p.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          const h = document.getElementById('h-24');
          const r = h?.getBoundingClientRect();
          return { id: a?.id ?? '', top: r ? Math.round(r.top) : -1, h: window.innerHeight };
        })) as { id: string; top: number; h: number };
        if (st.id !== 'h-24') why.push(`${motion}: фокус на «${st.id}»`);
        if (st.top < 0 || st.top > st.h * 0.6) why.push(`${motion}: заголовок § 24 на ${st.top} px`);
        await p.keyboard.press('Tab');
        const inside = (await p.evaluate(() => !!document.activeElement?.closest('#sec-24'))) as boolean;
        if (!inside) why.push(`${motion}: Tab ушёл из § 24`);
      }
      await p.emulateMedia({ reducedMotion: 'no-preference' });
      return why.length ? fail(why.join('; ')) : pass('фокус — на заголовок § 24, Tab — внутри');
    },
  },
  {
    n: 974,
    title: 'Карточка держит контекст: имя и раздел в полосе после прокрутки, оглавление, вкладка помнит место, список разделов на телефоне',
    run: async (p) => {
      const why: string[] = [];
      await p.setViewportSize({ width: 1440, height: 900 });
      await open(p, '#/david', { extra: { tabs: [{ id: 'david', hue: 0 }] } });
      await sec(p, 1);
      // оглавление в колонке — строка «Разделы карточки ▾»: список из шести частей, переход — фокус на заголовок раздела
      await p.locator('.folio .toc-line .toc-cur').click();
      await p.waitForTimeout(300);
      const parts = await p.locator('.folio .toc-line .toc-drop .toc-parts > li').count();
      if (parts !== 6) why.push(`частей оглавления: ${parts}`);
      await p.locator('.folio .toc-line .toc-drop button.toc-go', { hasText: 'Жизнеописание' }).click();
      await p.waitForTimeout(900);
      const focus = (await p.evaluate(() => document.activeElement?.id ?? '')) as string;
      if (focus !== 'h-17') why.push(`фокус после оглавления: «${focus}»`);
      // полоса: имя с уточнением и текущий раздел
      const ctx = (await p.evaluate(() => {
        const f = document.querySelector('.folio');
        const c = document.querySelector<HTMLElement>('.folio-bar .bar-ctx');
        return { gone: !!f?.hasAttribute('data-name-gone'), text: c && getComputedStyle(c).visibility === 'visible' ? c.innerText : '' };
      })) as { gone: boolean; text: string };
      if (!ctx.gone || !/Давид, царь/.test(ctx.text) || !/17\s+Жизнеописание/.test(flat(ctx.text))) why.push(`полоса: «${flat(ctx.text)}»`);
      // раздел в полосе — строка со списком разделов
      if (!(await p.locator('.folio-bar .bc-sec .toc-cur').count())) why.push('в полосе нет списка разделов');
      // подпись над вкладками
      const cap = flat(await p.locator('.folio .card-tabs .tabs-cap').innerText().catch(() => ''));
      if (cap !== 'Закреплённые карточки') why.push(`подпись вкладок: «${cap}»`);
      // вкладка помнит место: другое лицо, затем вкладка Давида
      await p.evaluate(() => (location.hash = '#/moisey'));
      await p.waitForTimeout(1500);
      await p.locator('.folio .card-tab[data-id="david"] .tab-open').click();
      await p.waitForTimeout(1500);
      const back = (await p.evaluate(() => {
        const h = document.getElementById('h-17')?.getBoundingClientRect();
        return h ? Math.round(h.top) : -1;
      })) as number;
      if (back < 0 || back > 260) why.push(`возврат к § 17: заголовок на ${back} px`);
      // телефон: текущий раздел словами и список
      await p.setViewportSize({ width: 390, height: 844 });
      await open(p, '#/david');
      const tog = p.locator('.folio .sheet-bar .bar-toggle');
      if (await tog.count()) await tog.first().click();
      await p.waitForTimeout(700);
      await sec(p, 1);
      const cur = p.locator('.folio .rail-row .toc-cur');
      if (!(await cur.count())) why.push('телефон: нет строки текущего раздела');
      else {
        await cur.click();
        await p.waitForTimeout(300);
        await p.locator('.folio .toc-drop button.toc-go', { hasText: 'Дети' }).click();
        await p.waitForTimeout(900);
        const f2 = (await p.evaluate(() => document.activeElement?.id ?? '')) as string;
        const label = flat(await cur.innerText());
        if (f2 !== 'h-10') why.push(`телефон: фокус «${f2}»`);
        if (!/^10\s*Дети/.test(label)) why.push(`телефон: строка «${label}»`);
      }
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.evaluate(() => localStorage.removeItem('toledot:tabs'));
      return why.length ? fail(why.join('; ')) : pass(`полоса «${flat(ctx.text)}», возврат — ${back} px`);
    },
  },
  {
    n: 975,
    title: 'Ссылка на стих узнаётся до наведения: точечная черта у стиха, сплошная у имени и команды, в обеих темах; подзаголовок § 24 — строкой',
    run: async (p) => {
      const why: string[] = [];
      for (const theme of ['night', 'day'] as const) {
        await open(p, '#/david', { theme });
        // без раскрытия «ещё N» — команда «ещё 43 события» остаётся на месте
        // вид черты — по одному элементу за вызов: без именованных функций внутри evaluate (tsx добавляет __name)
        const look = (sel: string) =>
          p.evaluate((q) => {
            const el = document.querySelector<HTMLElement>(q);
            return el ? `${getComputedStyle(el).textDecorationLine} ${getComputedStyle(el).textDecorationStyle}` : null;
          }, sel) as Promise<string | null>;
        const st = { ref: await look('.folio #sec-17 button.ref'), name: await look('.folio #sec-17 .person'), cmd: await look('.folio #sec-17 button.more') };
        if (st.ref !== 'underline dotted') why.push(`${theme}: стих «${st.ref}»`);
        if (st.name !== 'underline solid') why.push(`${theme}: имя «${st.name}»`);
        if (st.cmd !== 'underline solid') why.push(`${theme}: команда «${st.cmd}»`);
      }
      await open(p, '#/moisey');
      await sec(p, 24);
      const lead = (await p.evaluate(() => {
        const l = document.querySelector<HTMLElement>('.folio #sec-24 .lead');
        return l ? getComputedStyle(l).display : '';
      })) as string;
      if (lead !== 'block') why.push(`подзаголовок § 24: display ${lead}`);
      return why.length ? fail(why.join('; ')) : pass('стих — точечная черта, имя и команда — сплошная; подзаголовок — строкой');
    },
  },
  {
    n: 976,
    title: '«На весь экран»: лист поверх неба и панелей, небо недоступно Tab, Escape возвращает; из «расч.» — «О хронологии» и «Сменить модель»',
    run: async (p) => {
      const why: string[] = [];
      await p.setViewportSize({ width: 1440, height: 900 });
      await open(p, '#/david');
      // «На весь экран» — в строке оглавления под шапкой; «Вернуть небо» — в полосе листа
      const cmd = p.locator('.folio .toc-line button.full-card');
      if (!(await cmd.count())) return fail('нет команды «На весь экран»');
      await cmd.click();
      await p.waitForTimeout(400);
      const on = (await p.evaluate(() => {
        const f = document.querySelector<HTMLElement>('.app > .folio');
        const r = f?.getBoundingClientRect();
        return { full: !!f?.hasAttribute('data-full'), w: r ? Math.round(r.width) : 0, inert: !!document.querySelector('.app > .app-main')?.hasAttribute('inert'), label: (document.querySelector('.folio-bar button.full-card') as HTMLElement | null)?.innerText ?? '' };
      })) as { full: boolean; w: number; inert: boolean; label: string };
      if (!on.full || on.w < 1400) why.push(`лист: ${JSON.stringify(on)}`);
      // на весь экран — оглавление блоком: шесть частей названиями (решение 119)
      const partsFull = await p.locator('.folio .card-toc .toc-parts > li').count();
      if (partsFull !== 6) why.push(`оглавление на весь экран: частей ${partsFull}`);
      if (!on.inert) why.push('небо доступно Tab под листом');
      if (on.label.trim() !== 'Вернуть небо') why.push(`команда: «${on.label}»`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      const off = (await p.evaluate(() => ({ full: !!document.querySelector('.app > .folio[data-full]'), inert: !!document.querySelector('.app > .app-main')?.hasAttribute('inert'), sel: !!document.querySelector('.app > .folio .mast') }))) as { full: boolean; inert: boolean; sel: boolean };
      if (off.full || off.inert || !off.sel) why.push(`после Escape: ${JSON.stringify(off)}`);
      // пояснение «расч.»: «О хронологии» открывает панель, «Сменить модель» — список моделей в «Виде»
      const mark = p.locator('.folio .passport button.mark').first();
      await mark.click();
      await p.waitForTimeout(200);
      const cmds = await p.locator('.folio .passport .mark-cmds button').allInnerTexts();
      if (cmds.map((x) => x.trim()).join('|') !== 'О хронологии|Сменить модель') why.push(`команды пояснения: ${cmds.join('|')}`);
      await p.locator('.folio .passport .mark-cmds button', { hasText: 'О хронологии' }).click();
      await p.waitForTimeout(600);
      const chrono = (await p.evaluate(() => [...document.querySelectorAll('.sheet h2')].map((h) => h.textContent ?? '').join('|'))) as string;
      if (!/О хронологии/.test(chrono)) why.push(`панель: «${chrono}»`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (!(await p.locator('.folio .passport .mark-cmds').count())) await mark.click();
      await p.locator('.folio .passport .mark-cmds button', { hasText: 'Сменить модель' }).click();
      await p.waitForTimeout(700);
      const models = await p.locator('[role="menuitemradio"]').allInnerTexts();
      if (!models.some((x) => /Краткое пребывание/.test(x))) why.push(`список моделей: ${models.slice(0, 3).join('|')}`);
      await p.keyboard.press('Escape');
      return why.length ? fail(why.join('; ')) : pass(`лист ${on.w} px, Escape — небо; моделей в списке: ${models.length}`);
    },
  },
];
