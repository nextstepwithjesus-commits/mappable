/**
 * Сценарии приёмки этапа 7 (доработка по повторной экспертизе), группа chrono (K1, хронология): номера 220–229.
 * Эпохи по модели (CARD-60), супруги одного поколения (CARD-61), напряжения растянутых родословий (MAP-51),
 * лица «время не установлено» (MAP-52), промежуток рождения до смерти (MAP-53), народы без года (CARD-59).
 * Порядок братьев (MAP-54) на экране виден только на небе: он закреплён тестом tests/chronology-k1.test.ts и снимком.
 */
import type { Page } from 'playwright';
import { pass, fail, secText, type Scenario } from './kit.ts';

/** Текст без неразрывных пробелов и «склеек» (typo): для сверки — обычные пробелы. */
const flat = (s: string) => s.replace(/[ ⁠ ]/g, (c) => (c === '⁠' ? '' : ' '));
/**
 * Открыть адрес заново (с загрузкой страницы): сценарии проверяют данные карточки, а не переход между карточками —
 * переход «Моисей → Давид» сейчас роняет § 12 (Preact, insertBefore; передано владельцу разделов карточки).
 */
const go = async (p: Page, hash: string, ms = 2600) => {
  const base = p.url().replace(/[?#].*$/, '');
  await p.goto(`${base}?k1=${Date.now()}${hash}`); // другой адрес — страница загружается заново
  await p.waitForTimeout(ms);
};
/** Строка паспорта карточки: «Годы», «Время», «Эпоха». */
const passport = async (p: Page, key: string) => {
  const dts = p.locator('.folio .mast dl.passport dt');
  const n = await dts.count();
  for (let k = 0; k < n; k++) if ((await dts.nth(k).innerText()).trim() === key) return flat(await dts.nth(k).locator('xpath=following-sibling::dd[1]').innerText());
  return '';
};
/** Первый год «ок. 1310 г. до Р. Х.» → 1310. */
const year = (s: string) => Number(/(\d{3,4})/.exec(s)?.[1] ?? NaN);
/** Год центра окна неба из адреса: «~y-1010» → −1010. */
const centerYear = (p: Page) => Number(/~y(-?\d+)/.exec(decodeURIComponent(new URL(p.url()).hash))?.[1] ?? NaN);

export const chrono: Scenario[] = [
  {
    n: 220,
    title: 'CARD-60: краткое пребывание — Авраам и Иосиф рождены в «Патриархах» с годами этой модели',
    run: async (p) => {
      await go(p, '#/avraam~mmt-short');
      const a = flat(await secText(p, 13));
      if (!/Эпоха рождения: Патриархи \(1951–1661 гг\. до Р\. Х\.\)/.test(a)) return fail(`§ 13 Авраама: «${a.slice(0, 90)}»`);
      const ep = await passport(p, 'Эпоха');
      if (/Египте/.test(ep)) return fail(`паспорт Авраама: «${ep}»`);
      await go(p, '#/iosif~mmt-short');
      const j = flat(await secText(p, 13));
      if (!/Эпоха рождения: Патриархи/.test(j)) return fail(`§ 13 Иосифа: «${j.slice(0, 90)}»`);
      return pass(`Авраам: «${ep}»; Иосиф — «Патриархи»`);
    },
  },
  {
    n: 221,
    title: 'CARD-60: панель «Эпохи» в модели краткого пребывания — вход в Египет в 1661 г. до Р. Х.',
    run: async (p) => {
      await go(p, '#/~mmt-short~pepochs');
      const rows = p.locator('table.epochs tbody tr:not(.basis)');
      const n = await rows.count();
      const text: Record<string, string> = {};
      for (let k = 0; k < n; k++) {
        const t = flat(await rows.nth(k).innerText());
        text[t.split(/\t|\n/)[0].trim()] = t;
      }
      const egypt = text['Израиль в Египте'] ?? '';
      const pat = text['Патриархи'] ?? '';
      if (!/1661/.test(egypt)) return fail(`«Израиль в Египте»: «${egypt}»`);
      if (!/1951/.test(pat)) return fail(`«Патриархи»: «${pat}»`);
      return pass(`${egypt.replace(/\s+/g, ' ')}; ${pat.replace(/\s+/g, ' ')}`);
    },
  },
  {
    n: 222,
    title: 'CARD-61: Руфь и Махлон — одного поколения (прежде Руфь родилась через 110 лет после мужа)',
    run: async (p) => {
      await go(p, '#/ruf~mmt-long');
      const r = year(await passport(p, 'Годы'));
      await go(p, '#/makhlon');
      const m = year(await passport(p, 'Годы'));
      if (!Number.isFinite(r) || !Number.isFinite(m)) return fail(`нет годов: Руфь ${r}, Махлон ${m}`);
      return Math.abs(r - m) <= 15 ? pass(`Руфь — ок. ${r}, Махлон — ок. ${m}`) : fail(`Руфь — ок. ${r}, Махлон — ок. ${m}`);
    },
  },
  {
    n: 223,
    title: 'CARD-61: напряжение «Вооз — Руфь» в § 13 обеих карточек',
    run: async (p) => {
      for (const id of ['vooz', 'ruf']) {
        await go(p, `#/${id}~mmt-long`);
        const t = flat(await secText(p, 13));
        // у Вооза два напряжения («Наассон — … — Давид» и «Вооз — Руфь») — одной записью «Хронологические напряжения.» (K3)
        if (!/Хронологическ(?:ое напряжение|ие напряжения)\.[^]*Вооз — Руфь: по принятым годам жена моложе мужа/.test(t)) return fail(`§ 13 «${id}»: «${t.slice(0, 160)}»`);
      }
      return pass();
    },
  },
  {
    n: 224,
    title: 'MAP-51: «Левий — Иохаведа — Моисей» и «Наассон — … — Давид»: родословие называет не все поколения',
    run: async (p) => {
      await go(p, '#/iokhaveda~mmt-long');
      const j = flat(await secText(p, 13));
      if (!/Левий — Иохаведа — Моисей: .*Вероятно, родословие называет не все поколения\./s.test(j)) return fail(`§ 13 Иохаведы: «${j.slice(0, 160)}»`);
      await go(p, '#/david');
      const d = flat(await secText(p, 13));
      if (!/Наассон — Салмон — Вооз — Овид — Иессей — Давид:/.test(d)) return fail(`§ 13 Давида: «${d.slice(0, 200)}»`);
      return pass();
    },
  },
  {
    n: 225,
    title: 'MAP-51: при кратком пребывании (215 лет) напряжения «Левий — Иохаведа — Моисей» нет',
    run: async (p) => {
      await go(p, '#/iokhaveda~mmt-short');
      const j = flat(await secText(p, 13));
      if (/Левий — Иохаведа — Моисей/.test(j)) return fail(`§ 13 Иохаведы: «${j.slice(0, 160)}»`);
      return /Эпоха/.test(j) ? pass() : fail('§ 13 Иохаведы пуст');
    },
  },
  {
    n: 226,
    title: 'MAP-52: Лука — в годы служения Павла (34–62 гг.), а не на меридиане Рождества',
    run: async (p) => {
      // перелёт ставит звезду выбранного лица в одно и то же место свободной части неба: окно Луки правее окна Павла,
      // если звезда Луки правее звезды Павла (прежде — 5 г. до Р. Х., левее Павла)
      await go(p, '#/pavel~mmt-long');
      const yp = centerYear(p);
      await go(p, '#/luka');
      const yl = centerYear(p);
      const ys = await passport(p, 'Годы');
      if (!/время не установлено/.test(ys)) return fail(`паспорт Луки: «${ys}»`);
      return yl - yp > 10 ? pass(`окно Луки около ${yl} г., Павла — около ${yp} г.`) : fail(`окно Луки около ${yl} г., Павла — около ${yp} г.`);
    },
  },
  {
    n: 227,
    title: 'MAP-53: промежуток рождения Валаама кончается не позже его смерти (1406 г. до Р. Х.)',
    run: async (p) => {
      await go(p, '#/valaam~mmt-long');
      const t = flat(await secText(p, 8));
      const m = /возможный промежуток — (\d+)–(\d+) гг\. до Р\. Х\./.exec(t);
      if (!m) return fail(`§ 8: «${t.slice(0, 120)}»`);
      return Number(m[2]) >= 1406 ? pass(`${m[1]}–${m[2]}`) : fail(`${m[1]}–${m[2]}: позже смерти`);
    },
  },
  {
    n: 228,
    title: 'CARD-59: у народа нет года рождения — ни в паспорте, ни на мини-шкале, ни в § 8',
    run: async (p) => {
      await go(p, '#/ludim~mmt-long');
      const mast = flat(await p.locator('.folio .mast').innerText());
      if (/ок\. \d{3,4}|\d{3,4} г\. до Р\. Х\./.test(mast)) return fail(`шапка: «${mast.replace(/\s+/g, ' ').slice(0, 160)}»`);
      const s8 = flat(await secText(p, 8));
      if (/возможный промежуток|ок\. \d{3,4} г\./.test(s8)) return fail(`§ 8: «${s8.slice(0, 120)}»`);
      return pass();
    },
  },
  {
    n: 229,
    title: 'MAP-52: братья Господни — не на меридиане Рождества; Мелхиседек — современник Авраама',
    run: async (p) => {
      await go(p, '#/pavel~mmt-long');
      const yp = centerYear(p);
      await go(p, '#/iosiy-brat-gospoden');
      const y = centerYear(p);
      // прежде звезда Иосия стояла в 3 г. до Р. Х., левее Павла; теперь — в середине скобки «Земная жизнь Иисуса Христа»
      if (!(y - yp > 3)) return fail(`окно Иосия около ${y} г., Павла — около ${yp} г.`);
      await go(p, '#/melkhisedek');
      const m = flat(await secText(p, 13));
      if (!/Современник Авраама/.test(m)) return fail(`§ 13 Мелхиседека: «${m.slice(0, 120)}»`);
      return pass(`окно Иосия около ${y} г., Павла — около ${yp} г.`);
    },
  },
];
