/**
 * Сценарии приёмки этапа 13, T3 «Хронология: движок и данные» (docs/ui-review/STAGE13.md, решения 98, 99, 101–103, 107,
 * 108; приёмка П8–П15; сценарии 3, 4, 6 и X1 § 3, п. 11), группа chrono13: номера 940–959.
 * Проверяется то, что читатель видит из движка и данных: тексты напряжений в § 13, годы по словарю дат в паспорте, эпоха
 * жизни, основания эпох годами модели. Числа по всем лицам — tests/chrono-audit.test.ts.
 *  — 940 Моисей: трудность 430 лет — одной записью по границам текста, обе разгадки, Чис 26:59 (подробности — в § 13
 *    или в § 24, куда карточка их переносит: «Подробнее см. § 24»);
 *  — 941 «Краткое пребывание»: у Моисея нет напряжения 430 лет — только остаток «Левий — Иохаведа», по числам;
 *  — 942 Раав: «род. между …», при взятии Иерихона (1406) не моложе 16 лет; ложного «Вооз — Руфь» нет;
 *  — 943 Кааф: «род. между … и 1876» — округление не переходит границу «вошёл в Египет с Иаковом» (Быт 46:11);
 *  — 944 Давид — «1040–970» без «ок.»; Иисус Христос — «ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.»;
 *  — 945 Мария, Лазарь, Иоанн Креститель: эпоха жизни — «Евангельская история»;
 *  — 946 Авиуд: сжатое родословие Мф 1:13–16 — запись, а не «через 55 лет после отца»;
 *  — 947 Езекия: напряжение «Осия — Езекия» (4 Цар 18:1, 9–10 против 18:13);
 *  — 948 «Фарре 70»: у Фарры — «Деян 7:4», Аран, Аврам и Нахор родились в разные годы;
 *  — 949 лист «Эпохи» в «Кратком пребывании»: основание Египта годами модели — «215 лет», «Евангельская история» с 7 г.
 */
import type { Page } from 'playwright';
import { pass, fail, secText, type Scenario } from './kit.ts';

/** Текст без неразрывных пробелов и «склеек» (typo): для сверки — обычные пробелы. */
const flat = (s: string) => s.replace(/[  ]/g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ').trim();
/** Открыть адрес заново (с загрузкой страницы). */
const go = async (p: Page, hash: string, ms = 2800) => {
  const base = p.url().replace(/[?#].*$/, '');
  await p.goto(`${base}?c13=${Date.now()}${hash}`);
  await p.waitForTimeout(ms);
};
/** Строка паспорта карточки по подписи («Годы», «Эпоха»). */
const passport = async (p: Page, key: string) => {
  const dts = p.locator('.folio .mast dl.passport dt');
  const n = await dts.count();
  for (let k = 0; k < n; k++) if (flat(await dts.nth(k).innerText()) === key) return flat(await dts.nth(k).locator('xpath=following-sibling::dd[1]').innerText());
  return '';
};
/** § 13 целиком: свёрнутые записи («ещё …») раскрываются. */
const sec13 = async (p: Page) => {
  const more = p.locator('.folio #sec-13 button', { hasText: /^ещё|подробнее|все напряжения/i });
  for (let k = 0; k < (await more.count()); k++) {
    await more.nth(k).click().catch(() => undefined);
    await p.waitForTimeout(150);
  }
  return flat(await secText(p, 13));
};
const folio = async (p: Page) => flat(await p.locator('.folio').innerText());

export const chrono13: Scenario[] = [
  {
    n: 940,
    title: 'Моисей: трудность 430 лет — одна запись по границам текста (Кааф 133, Амрам 137, Моисей 1526), обе разгадки, Чис 26:59',
    run: async (p) => {
      await go(p, '#/moisey~mmt-long');
      const t = await sec13(p);
      const n = (t.match(/Пребывание в Египте — 430 лет/g) ?? []).length;
      if (n !== 1) return fail(`записей «Пребывание в Египте — 430 лет» в § 13: ${n}; «${t.slice(0, 200)}»`);
      // подробности записи — в § 13 или, если § 13 даёт её кратко («Подробнее см. § 24»), в § 24 (карточка T4):
      // § 13 держит предел 8 строк (F5), вторая разгадка уходит в § 24
      const all = `${t} ${flat(await secText(p, 24))}`;
      if (!/430 лет считаются с прихода Авраама в Ханаан/.test(all)) return fail('нет второй разгадки (скобка Исх 12:40; Гал 3:17) ни в § 13, ни в § 24');
      if (!/Амрам родился не позже 1742 г\. до Р\. Х\., прожил 137 лет и умер не позже 1605 г\. до Р\. Х\.; Моисей родился в 1526 г\. до Р\. Х\. — не меньше чем через 79 лет после смерти отца/.test(all))
        return fail(`нет строки «Кааф — Амрам — Моисей» по границам текста ни в § 13, ни в § 24: «${all.slice(0, 240)}»`);
      if (!/Первую разгадку ограничивает Чис 26:59/.test(all)) return fail('нет Чис 26:59 у Иохаведы');
      if (/по возрастам, названным в тексте/.test(all)) return fail('«по возрастам, названным в тексте» у лиц без своих чисел');
      return pass('одна запись, числа и границы текста');
    },
  },
  {
    n: 941,
    title: 'Сценарий 9 ТЗ, этап 13: при 215 годах у Моисея нет напряжения 430 лет — остаётся «Левий — Иохаведа — Моисей» по числам',
    run: async (p) => {
      await go(p, '#/moisey~mmt-short');
      const t = await sec13(p);
      if (/430 лет/.test(t) && /Пребывание в Египте/.test(t)) return fail(`осталось напряжение 430 лет: «${t.slice(0, 200)}»`);
      if (!/Левий — Иохаведа — Моисей[.;:].*на два поколения не меньше 168 лет/.test(t)) return fail(`нет остатка «Левий — Иохаведа»: «${t.slice(0, 240)}»`);
      return pass('остаток — 168 лет на два поколения');
    },
  },
  {
    n: 942,
    title: 'Раав: «род. между …», при взятии Иерихона (1406 г. до Р. Х.) не моложе 16 лет; у Вооза и Руфи нет ложного «Вооз — Руфь»',
    run: async (p) => {
      await go(p, '#/raav~mmt-long');
      const y = await passport(p, 'Годы');
      const m = /между (\d{4}) и (\d{4}) гг\. до Р\. Х\./.exec(y);
      if (!m) return fail(`паспорт Раав: «${y}»`);
      if (Number(m[2]) < 1406 + 16) return fail(`«${y}»: при Иерихоне моложе 16 лет`);
      for (const id of ['vooz', 'ruf']) {
        await go(p, `#/${id}~mmt-long`);
        if (/Вооз — Руфь: по принятым годам/.test(await sec13(p))) return fail(`§ 13 «${id}»: ложное «Вооз — Руфь»`);
      }
      return pass(`Раав: «${y}»`);
    },
  },
  {
    n: 943,
    title: 'Кааф: «род. между … и 1876» — не «ок. 1875»: округление не переходит границу «вошёл в Египет с Иаковом» (Быт 46:11)',
    run: async (p) => {
      await go(p, '#/kaaf~mmt-long');
      const y = await passport(p, 'Годы');
      if (/1875/.test(y) || !/между \d{4} и 1876/.test(y)) return fail(`паспорт Каафа: «${y}»`);
      return pass(`«${y}»`);
    },
  },
  {
    n: 944,
    title: 'Словарь дат: Давид — «1040–970 гг. до Р. Х.» без «ок.»; Иисус Христос — «ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.»',
    run: async (p) => {
      await go(p, '#/david');
      const d = await passport(p, 'Годы');
      if (!/(^|\D)1040–970 гг\. до Р\. Х\./.test(d) || /ок\. 1040/.test(d)) return fail(`Давид: «${d}»`);
      await go(p, '#/iisus');
      const j = await passport(p, 'Годы');
      if (!/ок\. 5 г\. до Р\. Х\. — ок\. 30 г\. по Р\. Х\./.test(j)) return fail(`Иисус Христос: «${j}»`);
      return pass(`«${d}»; «${j}»`);
    },
  },
  {
    n: 945,
    title: 'Эпоха жизни (решение 98): Мария, Лазарь, Иоанн Креститель — «Евангельская история», не «Межзаветное время» и не «Апостольская Церковь»',
    run: async (p) => {
      const out: string[] = [];
      for (const id of ['mariya', 'lazar', 'ioann-krestitel']) {
        await go(p, `#/${id}`);
        const e = (await passport(p, 'Эпоха')) || (await folio(p));
        const first = e.split(/родил[аи]?сь в/)[0];
        if (!/Евангельская история/.test(first)) return fail(`${id}: «${e.slice(0, 160)}»`);
        if (/Апостольская Церковь/.test(first)) return fail(`${id}: «Апостольская Церковь» — «${e.slice(0, 160)}»`);
        out.push(id);
      }
      return pass(out.join(', '));
    },
  },
  {
    n: 946,
    title: 'Авиуд: сжатое родословие Мф 1:13–16 — «10 поколений — не меньше чем … лет», годы звеньев — только оценка',
    run: async (p) => {
      await go(p, '#/aviud-syn-zorovavelya');
      const t = await sec13(p);
      if (!/Зоровавель — Авиуд — .*Иосиф: 10 поколений — не меньше чем \d+ лет/.test(t)) return fail(`§ 13 Авиуда: «${t.slice(0, 240)}»`);
      return pass();
    },
  },
  {
    n: 947,
    title: 'Езекия: «Осия — Езекия» — 4 Цар 18:1, 9–10 ставят начало Езекии в третий год Осии, 18:13 — к 715 г.',
    run: async (p) => {
      await go(p, '#/ezekiya');
      const t = await sec13(p);
      if (!/Осия — Езекия: 4 Цар 18:1 ставит воцарение Езекии «в третий год Осии»/.test(t)) return fail(`§ 13 Езекии: «${t.slice(0, 240)}»`);
      if (!/Ахаз — Езекия: по числам текста отцу/.test(t)) return fail('нет напряжения ТЗ § 3.6 «Ахаз — Езекия»');
      return pass();
    },
  },
  {
    n: 948,
    title: '«Фарре 70»: у Фарры — запись о Деян 7:4; Аран, Аврам и Нахор — в разные годы, Аврам старший',
    run: async (p) => {
      await go(p, '#/farra~mterah70');
      const t = await sec13(p);
      if (!/Деян 7:4/.test(t) || !/по смерти отца/.test(t)) return fail(`§ 13 Фарры: «${t.slice(0, 240)}»`);
      const years: number[] = [];
      for (const id of ['avraam', 'nakhor-syn-farry', 'aran']) {
        await go(p, `#/${id}~mterah70`);
        const y = await passport(p, 'Годы');
        const m = /(\d{4})/.exec(y);
        if (!m) return fail(`${id}: «${y}»`);
        years.push(Number(m[1]));
      }
      if (new Set(years).size !== 3 && !(years[0] > years[1] && years[0] > years[2])) return fail(`годы Аврама, Нахора, Арана: ${years.join(', ')}`);
      return pass(`Аврам ${years[0]}, Нахор ${years[1]}, Аран ${years[2]}`);
    },
  },
  {
    n: 949,
    title: 'Лист «Эпохи» в «Кратком пребывании»: основание Египта годами модели («215 лет»), «Евангельская история» с 7 г. до Р. Х.',
    run: async (p) => {
      await go(p, '#/~mmt-short');
      const epochsBtn = p.locator('button, a', { hasText: /^Эпохи$/ });
      if (!(await epochsBtn.count())) return fail('нет входа в лист «Эпохи»');
      await epochsBtn.first().click();
      await p.waitForTimeout(700);
      const t = flat(await p.locator('section.sheet').first().innerText());
      if (!/на Египет приходится 215 лет/.test(t)) return fail(`основание Египта: «${t.slice(t.indexOf('Египте'), t.indexOf('Египте') + 200)}»`);
      if (!/Евангельская история/.test(t) || !/7 г\. до Р\. Х\./.test(t)) return fail('нет «Евангельской истории» с 7 г. до Р. Х.');
      if (/\{start\}|\{end\}|\{years\}/.test(t)) return fail('метки оснований не подставлены');
      return pass();
    },
  },
];
