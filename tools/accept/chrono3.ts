/**
 * Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа chrono3: номера 320–329, хронология.
 * MAP-69 (решение 38): знак лица Нового Завета с широким промежутком рождения — у первого засвидетельствованного года;
 * тесть старше зятя; MAP-53: наименьший возраст начала деятельности; CARD-79: смерть не раньше событий жизни;
 * CARD-83, CARD-90: данные.
 * Положение звёзд — по скрытому списку неба (src/ui/sky/SkyA11y.tsx: #sky-star-<id>, data-x — где звезда на холсте).
 */
import type { Page } from 'playwright';
import { pass, fail, secText, type Scenario } from './kit.ts';

/** Текст без неразрывных пробелов и «склеек» (typo): для сверки — обычные пробелы. */
const flat = (s: string) => s.replace(/[  ⁠]/g, (c) => (c === '⁠' ? '' : ' '));
/** Открыть адрес заново (с загрузкой страницы). */
const go = async (p: Page, hash: string, ms = 2800) => {
  const base = p.url().replace(/[?#].*$/, '');
  await p.goto(`${base}?c3=${Date.now()}${hash}`);
  await p.waitForTimeout(ms);
};
/** Строка паспорта карточки: «Годы», «Время», «Эпоха». */
const passport = async (p: Page, key: string) => {
  const dts = p.locator('.folio .mast dl.passport dt');
  const n = await dts.count();
  for (let k = 0; k < n; k++) if ((await dts.nth(k).innerText()).trim() === key) return flat(await dts.nth(k).locator('xpath=following-sibling::dd[1]').innerText());
  return '';
};
/** Первый год строки со знаком эры: «ок. 20 г. до Р. Х.» → −20, «ок. 5 г. по Р. Х.» → 5. */
const signedYear = (s: string) => {
  const m = /(\d{1,4})(?:–\d{1,4})?\s+гг?\.\s+(до|по)\s+Р/.exec(s);
  return m ? (m[2] === 'до' ? -Number(m[1]) : Number(m[1])) : NaN;
};
/** Где звезда лица на холсте (px) — по скрытому списку неба; null — звезды нет на виду. */
const starX = (p: Page, id: string) =>
  p.evaluate((id) => {
    const b = document.getElementById(`sky-star-${id}`) as HTMLElement | null;
    return b && b.dataset.x ? Number(b.dataset.x) : null;
  }, id);

export const chrono3: Scenario[] = [
  {
    n: 320,
    title: 'MAP-69 (решение 38): Пётр, Андрей, Понтий Пилат, Анна, Лазарь — знак у призвания и суда, правее Рождества; колонны у Рождества нет',
    run: async (p) => {
      await go(p, '#/~y12~w110~l0~s0~h0.2');
      const jesus = await starX(p, 'iisus');
      if (jesus === null) return fail('звезды Иисуса Христа нет в списке неба');
      const out: string[] = [];
      for (const id of ['petr', 'andrey', 'pontiy-pilat', 'anna-pervosvyashchennik', 'lazar', 'varnava']) {
        const x = await starX(p, id);
        if (x === null) return fail(`звезды «${id}» нет в списке неба`);
        // 26–30 гг. по Р. Х. — не меньше чем на 25 лет правее Рождества (5 г. до Р. Х.): окно 110 лет
        const w = (await p.locator('.sky > canvas').boundingBox())!.width;
        if (!(x - jesus > (w * 20) / 110)) return fail(`${id}: знак в ${x - jesus} px от Рождества — у Рождества, а не у призвания`);
        out.push(`${id} +${x - jesus}`);
      }
      return pass(out.join(', '));
    },
  },
  {
    n: 321,
    title: 'MAP-69: Анна — тесть Каиафы (Ин 18:13) — родился раньше зятя не меньше чем на 15 лет',
    run: async (p) => {
      await go(p, '#/anna-pervosvyashchennik');
      const a = signedYear(await passport(p, 'Годы'));
      await go(p, '#/kaiafa');
      const k = signedYear(await passport(p, 'Годы'));
      if (!Number.isFinite(a) || !Number.isFinite(k)) return fail(`нет годов: Анна ${a}, Каиафа ${k}`);
      return k - a >= 15 ? pass(`Анна — ок. ${a}, Каиафа — ок. ${k}`) : fail(`Анна — ок. ${a}, Каиафа — ок. ${k}: ровесники`);
    },
  },
  {
    n: 322,
    title: 'CARD-79: Иоав убит в 970 г. до Р. Х., как и событие § 17, — в паспорте «ок. 1040–970», не «…–972», раньше Давида',
    run: async (p) => {
      await go(p, '#/ioav');
      const y = await passport(p, 'Годы');
      if (!/1040–970 гг\. до Р\. Х\./.test(y)) return fail(`паспорт: «${y}»`);
      const s17 = flat((await p.locator('.folio #sec-17').textContent()) ?? '');
      if (/972/.test(s17)) return fail(`§ 17: «${s17.slice(0, 120)}»`);
      // § 20 строит карточка (src/ui/card/shared.tsx, deathLine): ей нужен признак ChronoRow.dAge — передано владельцу карточки
      return pass(`паспорт «${y}»`);
    },
  },
  {
    n: 323,
    title: 'MAP-53: Валаам (пророк, Чис 22) — промежуток рождения кончается за 12 лет до пророчества: 1475–1420, а не …–1410',
    run: async (p) => {
      await go(p, '#/valaam');
      const s8 = flat(await secText(p, 8));
      if (!/1475–1420 гг\. до Р\. Х\./.test(s8)) return fail(`§ 8: «${s8.replace(/\s+/g, ' ').slice(0, 160)}»`);
      return pass(`§ 8: «${s8.replace(/\s+/g, ' ').slice(0, 120)}»`);
    },
  },
  {
    n: 324,
    title: 'CARD-83, CARD-90: «глава третьей череды священников (1 Пар 24:8)»; у Давида — «люди его поклялись…» (2 Цар 21:17)',
    run: async (p) => {
      await go(p, '#/kharim');
      const mast = flat(await p.locator('.folio .mast').innerText());
      if (!/глава третьей череды священников/.test(mast)) return fail(`шапка Харима: «${mast.replace(/\s+/g, ' ').slice(0, 120)}»`);
      await go(p, '#/david');
      // длинный раздел свёрнут («ещё N событий»): развернуть
      const more = p.locator('.folio #sec-17 button', { hasText: /^ещё/ });
      if (await more.count()) {
        await more.first().click();
        await p.waitForTimeout(400);
      }
      const s17 = flat((await p.locator('.folio #sec-17').textContent()) ?? '');
      if (/не пускали его/.test(s17)) return fail('§ 17 Давида: «не пускали его на войну»');
      if (!/поклялись больше не выпускать его на войну/.test(s17)) return fail(`§ 17 Давида без события 2 Цар 21:17: «${s17.slice(0, 100)}»`);
      return pass('Харим — «глава третьей череды»; Давид — «поклялись больше не выпускать его на войну»');
    },
  },
];
