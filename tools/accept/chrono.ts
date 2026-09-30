/**
 * Сценарии приёмки этапа 7 (доработка по повторной экспертизе), группа chrono (K1, хронология): номера 220–229.
 * Эпохи по модели (CARD-60), супруги одного поколения (CARD-61), напряжения растянутых родословий (MAP-51),
 * лица «время не установлено» (MAP-52), промежуток рождения до смерти (MAP-53), народы без года (CARD-59).
 * Порядок братьев (MAP-54) на экране виден только на небе: он закреплён тестом tests/chronology-k1.test.ts и снимком.
 */
import type { Page } from 'playwright';
import { pass, fail, secText, type Scenario } from './kit.ts';

/** Текст без неразрывных пробелов и «склеек» (typo): для сверки — обычные пробелы. */
// этап 13: подзаголовки § 13 («Откуда годы», «Эпоха», «Среди родни») — отдельными строками; пробелы сводятся
const flat = (s: string) => s.replace(/[ ⁠ ]/g, (c) => (c === '⁠' ? '' : ' ')).replace(/\s+/g, ' ');
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
/** Где звезда лица на холсте (px) — по скрытому списку неба (src/ui/sky/SkyA11y.tsx); null — звезды нет на виду. */
const starX = (p: Page, id: string) =>
  p.evaluate((id) => {
    const b = document.getElementById(`sky-star-${id}`) as HTMLElement | null;
    return b && b.dataset.x ? Number(b.dataset.x) : null;
  }, id);

export const chrono: Scenario[] = [
  {
    n: 220,
    title: 'CARD-60: краткое пребывание — Авраам и Иосиф рождены в «Патриархах» с годами этой модели',
    run: async (p) => {
      await go(p, '#/avraam~mmt-short');
      const a = flat(await secText(p, 13));
      // этап 13, решение 100: строка «Эпоха» § 13 — эпоха жизни с годами модели; эпоха рождения Авраама та же
      if (!/Эпоха Патриархи \(1951–1661 гг\. до Р\. Х\.\)/.test(a)) return fail(`§ 13 Авраама: «${a.slice(0, 90)}»`);
      const ep = await passport(p, 'Эпоха');
      if (/Египте/.test(ep)) return fail(`паспорт Авраама: «${ep}»`);
      await go(p, '#/iosif~mmt-short');
      const j = flat(await secText(p, 13));
      // у Иосифа эпоха жизни может быть иной («Израиль в Египте») — тогда эпоха рождения второй частью строки
      if (!/Эпоха Патриархи \(|родился в эпоху «Патриархи»/.test(j)) return fail(`§ 13 Иосифа: «${j.slice(0, 160)}»`);
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
        const raw = await rows.nth(k).innerText();
        text[flat(raw.split(/\t|\n/)[0]).trim()] = flat(raw);
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
    // этап 13 (решение 101; X1 В2, Д4): напряжение «Вооз — Руфь» было ложным — следствием ребра матери без пропуска
    // поколений (Мф 1:5: «Салмон родил Вооза от Рахавы»). С motherGap его нет, а у Вооза остаётся «Наассон — … — Давид»
    title: 'CARD-61 → этап 13: ложного напряжения «Вооз — Руфь» нет в § 13 обеих карточек; у Вооза — «Наассон — … — Давид»',
    run: async (p) => {
      for (const id of ['vooz', 'ruf']) {
        await go(p, `#/${id}~mmt-long`);
        const t = flat(await secText(p, 13));
        if (!t) return fail(`§ 13 «${id}» пуст`);
        if (/Вооз — Руфь: по принятым годам/.test(t)) return fail(`§ 13 «${id}»: «${t.slice(0, 160)}»`);
        if (id === 'vooz' && !/Наассон — Салмон — Вооз — Овид — Иессей — Давид:/.test(t)) return fail(`§ 13 Вооза без «Наассон — … — Давид»: «${t.slice(0, 160)}»`);
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
      // этап 13: одна запись трудности 430 лет, строка «Левий — Иохаведа — Моисей» — по границам текста
      if (!/Левий — Иохаведа — Моисей[.;:].*Вероятно, родословия называют не все поколения/s.test(j)) return fail(`§ 13 Иохаведы: «${j.slice(0, 160)}»`);
      await go(p, '#/david');
      const d = flat(await secText(p, 13));
      if (!/Наассон — Салмон — Вооз — Овид — Иессей — Давид:/.test(d)) return fail(`§ 13 Давида: «${d.slice(0, 200)}»`);
      return pass();
    },
  },
  {
    n: 225,
    // этап 13 (решение 101; X1 А2): при 215 годах напряжения 430 лет нет, но честно остаётся его остаток по границам текста
    title: 'MAP-51 → этап 13: при кратком пребывании (215 лет) напряжения 430 лет у Иохаведы нет — только остаток «на два поколения не меньше 168 лет»',
    run: async (p) => {
      await go(p, '#/iokhaveda~mmt-short');
      const j = flat(await secText(p, 13));
      if (/430 лет/.test(j)) return fail(`§ 13 Иохаведы: «${j.slice(0, 160)}»`);
      if (!/Левий — Иохаведа — Моисей[.;:].*на два поколения не меньше \d+ лет/s.test(j)) return fail(`§ 13 Иохаведы без остатка: «${j.slice(0, 160)}»`);
      return pass();
    },
  },
  {
    n: 226,
    title: 'MAP-52: Лука — в годы служения Павла (34–62 гг.), а не на меридиане Рождества',
    run: async (p) => {
      // Прежде: перелёт ставил звезду выбранного лица в одно и то же место свободной части неба, и окно Луки было правее
      // окна Павла (звезда Павла — ок. 1 г.). Круг 3 (MAP-69, решение 38): знак Павла — у первого засвидетельствованного
      // года, обращения (34 г., Деян 9:3–6). Поэтому проверка — по звёздам в одном окне истинного масштаба (скрытый список
      // неба, data-x): Лука не левее начала служения Павла и не меньше чем на 30 лет правее Рождества (звезда Иисуса Христа)
      // окно — с Рождества до конца служения Павла (70 лет): список неба держит 40 самых заметных лиц окна (SkyA11y,
      // LIST_MAX), и в окне 120 лет Лука (величина 3) в него уже не входит, хотя на небе виден
      await go(p, '#/~y28~w70~l0~s0~h0.2');
      const [xj, xp, xl] = await Promise.all(['iisus', 'pavel', 'luka'].map((id) => starX(p, id)));
      if (xj === null || xp === null || xl === null) return fail(`нет звёзд в списке неба: Иисус ${xj}, Павел ${xp}, Лука ${xl}`);
      const perYear = (await p.locator('.sky > canvas').boundingBox())!.width / 70;
      // этап 13 (сверка D9): у Луки теперь годы служения по тексту (Кол 4:14; Флм 1:24; 2 Тим 4:11, 57–60 гг.) — «время не
      // установлено» больше не он; смысл проверки прежний: паспорт не ставит его к Рождеству
      await go(p, '#/luka');
      const yl = await passport(p, 'Годы');
      if (/(^|\D)5 г\. до Р\. Х\.|(^|\D)[1-9] г\. до Р\. Х\. —/.test(yl) || !yl) return fail(`паспорт Луки: «${yl}»`);
      const why = `Лука правее Рождества на ${Math.round((xl - xj) / perYear)} лет, правее знака Павла на ${Math.round((xl - xp) / perYear)}`;
      return xl - xj > 30 * perYear && xl >= xp ? pass(why) : fail(why);
    },
  },
  {
    n: 227,
    title: 'MAP-53: промежуток рождения Валаама кончается не позже его смерти (1406 г. до Р. Х.)',
    run: async (p) => {
      await go(p, '#/valaam~mmt-long');
      const t = flat(await secText(p, 8));
      // словарь дат этапа 13: «между 1475 и 1420 гг. до Р. Х.»; прежняя запись — «возможный промежуток — 1475–1420»
      const m = /(?:возможный промежуток — (\d+)–|между (\d+) и )(\d+) гг\. до Р\. Х\./.exec(t);
      if (!m) return fail(`§ 8: «${t.slice(0, 120)}»`);
      const [lo, hi] = [m[1] ?? m[2], m[3]];
      return Number(hi) >= 1406 ? pass(`${lo}–${hi}`) : fail(`${lo}–${hi}: позже смерти`);
    },
  },
  {
    n: 228,
    title: 'CARD-59: у народа нет года рождения — ни в паспорте, ни на мини-шкале, ни в § 8',
    run: async (p) => {
      await go(p, '#/ludim~mmt-long');
      const mast = flat(await p.locator('.folio .mast').innerText());
      if (/ок\. \d{3,4}|\d{3,4} г\. до Р\. Х\.|род\. между \d{3,4} и/.test(mast)) return fail(`шапка: «${mast.replace(/\s+/g, ' ').slice(0, 160)}»`);
      const s8 = flat(await secText(p, 8));
      if (/возможный промежуток|ок\. \d{3,4} г\.|между \d{3,4} и/.test(s8)) return fail(`§ 8: «${s8.slice(0, 120)}»`);
      return pass();
    },
  },
  {
    n: 229,
    title: 'MAP-52: братья Господни — не на меридиане Рождества; Мелхиседек — современник Авраама',
    run: async (p) => {
      // Прежде опорой был Павел (звезда ок. 1 г., окно после перелёта). Круг 3 (MAP-69, решение 38): знак Павла — у обращения
      // (34 г.), правее скобки братьев Господних. Опора теперь — звезда Иисуса Христа (Рождество, 5 г. до Р. Х., расч.) в одном
      // окне истинного масштаба (скрытый список неба, data-x): знак Иосия — середина скобки «Земная жизнь Иисуса Христа»
      await go(p, '#/~y10~w60~l-2~s0');
      const [xj, xi] = await Promise.all(['iisus', 'iosiy-brat-gospoden'].map((id) => starX(p, id)));
      if (xj === null || xi === null) return fail(`нет звёзд в списке неба: Иисус ${xj}, Иосий ${xi}`);
      const perYear = (await p.locator('.sky > canvas').boundingBox())!.width / 60;
      const y = Math.round((xi - xj) / perYear);
      if (!(xi - xj > 10 * perYear)) return fail(`знак Иосия правее Рождества на ${y} лет`);
      await go(p, '#/melkhisedek');
      const m = flat(await secText(p, 13));
      if (!/Современник Авраама/.test(m)) return fail(`§ 13 Мелхиседека: «${m.slice(0, 120)}»`);
      return pass(`знак Иосия правее Рождества на ${y} лет`);
    },
  },
];
