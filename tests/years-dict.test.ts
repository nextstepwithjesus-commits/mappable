/**
 * Словарь дат (этап 13, решение 96; X2 § 2.1, X1 Х8; контракт 4): одна запись года во всех местах.
 *  — «ок.» только у оценки (или у года, приблизительного по данным: Рождество), не у годов по числам текста;
 *  — оценка шире 10 лет — «между A и B»;
 *  — через эру «ок.» и эра — у каждого конца;
 *  — округление оценки не выходит за её промежуток (границы текста: «вошли в Египет с Иаковом», Быт 46:11);
 *  — промежутка «X–X» нет.
 * Проверка по всем лицам всех моделей — tools/chrono-audit.ts и tests/chrono-audit.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { dateText, spanText, lifeText, lastText, markTitle, epochSpanText, modelYearsText, shownYears, formatSpan, isWide, toAstro as A, type LifeDates } from '../src/engine/years.ts';
import { typo } from '../src/ui/text/typo.ts';

const NB = ' ';
const WJ = '⁠';
const plain = (s: string) => s.replace(/ /g, ' ').replace(/⁠/g, '');
const life = (o: Partial<LifeDates> & { b: number }): LifeDates => ({ bLo: o.b, bHi: o.b, d: null, cls: 'calculated', ...o });

describe('словарь дат: один год', () => {
  it('год по числам — без «ок.»; приблизительный по данным — с «ок.»', () => {
    expect(plain(dateText({ t: A(-1446) }))).toBe('1446 г. до Р. Х.');
    expect(plain(dateText({ t: A(30) }))).toBe('30 г. по Р. Х.');
    expect(plain(dateText({ t: A(-5), approx: true }))).toBe('ок. 5 г. до Р. Х.');
  });
  it('оценка ≤ 10 лет — «ок.» с круглым годом внутри промежутка; шире — «между»', () => {
    expect(plain(dateText({ t: A(-32), est: true, lo: A(-35), hi: A(-27) }))).toBe('ок. 30 г. до Р. Х.');
    expect(plain(dateText({ t: A(-32), est: true, lo: A(-45), hi: A(-20) }))).toBe('между 45 и 20 гг. до Р. Х.');
    expect(plain(dateText({ t: A(-3), est: true, lo: A(-15), hi: A(12) }))).toBe('между 15 г. до Р. Х. и 10 г. по Р. Х.');
  });
  it('округление не пересекает границу текста: «не позже 1876», а не «ок. 1875»', () => {
    // вошёл в Египет с Иаковом (Быт 46:11): рождение не позже 1876 г. до Р. Х.
    const v = { t: A(-1876), est: true, lo: A(-1880), hi: A(-1876) } as const;
    expect(plain(dateText(v))).toBe('ок. 1880 г. до Р. Х.');
    expect(plain(dateText({ ...v, pin: 'hi' }))).toBe('не позже 1876 г. до Р. Х.');
    expect(plain(dateText({ t: A(-1900), est: true, lo: A(-1950), hi: A(-1876), pin: 'hi' }))).toBe('между 1950 и 1876 гг. до Р. Х.');
    // узкий промежуток без круглого года внутри — год без округления
    expect(plain(dateText({ t: A(-1877), est: true, lo: A(-1879), hi: A(-1876) }))).toBe('ок. 1877 г. до Р. Х.');
  });
});

describe('словарь дат: промежутки', () => {
  it('в одной эре — эра один раз в конце; через эру — у каждого конца', () => {
    expect(plain(spanText({ t: A(-1040) }, { t: A(-970) }))).toBe('1040–970 гг. до Р. Х.');
    expect(spanText({ t: A(-1040) }, { t: A(-970) })).toBe(`1040–${WJ}970${NB}гг.${NB}до${NB}Р.${NB}Х.`);
    expect(plain(spanText({ t: A(-6) }, { t: A(30) }))).toBe('6 г. до Р. Х. — 30 г. по Р. Х.');
    expect(plain(spanText({ t: A(-5), approx: true }, { t: A(30), approx: true }))).toBe('ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.');
  });
  it('концы разного вида — каждый со своей пометой', () => {
    expect(plain(spanText({ t: A(-1043), est: true }, { t: A(-970) }))).toBe('ок. 1045 г. — 970 г. до Р. Х.');
  });
  it('formatSpan через эру ставит «ок.» у обоих концов (X2 Д10)', () => {
    expect(plain(formatSpan(A(-5), A(30), true))).toBe('ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.');
  });
  it('границы эпохи: «ок.» только у оценочной границы', () => {
    expect(plain(epochSpanText({ start: -1406, end: -1375, endEst: true }))).toBe('1406 г. — ок. 1375 г. до Р. Х.');
    expect(plain(epochSpanText({ start: -1050, end: -931 }))).toBe('1050–931 гг. до Р. Х.');
  });
});

describe('словарь дат: годы лица', () => {
  it('годы по числам текста и реконструкции — без «ок.» (Давид, Авраам)', () => {
    expect(plain(lifeText(life({ b: A(-1040), d: A(-970) })))).toBe('1040–970 гг. до Р. Х.');
    expect(plain(lifeText(life({ b: A(-2166), d: A(-1991), cls: 'exact' })))).toBe('2166–1991 гг. до Р. Х.');
    expect(shownYears(life({ b: A(-1040), d: A(-970) }))!.approx).toBe(false);
  });
  it('Рождество и Распятие — «ок.» у обоих концов через эру', () => {
    expect(plain(lifeText(life({ b: A(-5), d: A(30), bApprox: true, dApprox: true })))).toBe('ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.');
  });
  it('узкая оценка — «ок.»; широкая — «род. между»; смерть по возрасту сдвигается вместе с рождением', () => {
    expect(plain(lifeText(life({ b: A(-1043), bLo: A(-1047), bHi: A(-1040), d: A(-973), cls: 'estimated' })))).toBe('ок. 1045–975 гг. до Р. Х.');
    expect(plain(lifeText(life({ b: A(-32), bLo: A(-45), bHi: A(-20), cls: 'estimated' })))).toBe('род. между 45 и 20 гг. до Р. Х.');
    expect(plain(lifeText(life({ b: A(-1428), bLo: A(-1445), bHi: A(-1410), d: A(-1318), cls: 'estimated' })))).toBe('род. между 1445 и 1410, ум. между 1335 и 1300 гг. до Р. Х.');
  });
  it('свой год смерти оценки не сдвигается округлением рождения (CARD-79)', () => {
    expect(plain(lifeText(life({ b: A(-1060), bLo: A(-1090), bHi: A(-1035), d: A(-970), cls: 'estimated', dAge: false })))).toBe('род. между 1090 и 1035, ум. 970 г. до Р. Х.');
  });
  it('лет нет — пустая строка; народ — без «род.»', () => {
    expect(lifeText(life({ b: A(-1000), cls: 'epochal' }))).toBe('');
    expect(lifeText(life({ b: A(-1000), named: true }))).toBe('');
    expect(plain(lifeText(life({ b: A(-1000) }), { people: true }))).toBe('1000 г. до Р. Х.');
  });
  it('последнее упоминание и годы в другой модели', () => {
    expect(plain(lastText(A(30)))).toBe('последнее упоминание — 30 г. по Р. Х.');
    expect(plain(modelYearsText(life({ b: A(-1951), d: A(-1776), cls: 'exact' }), 'Краткое пребывание'))).toBe('в модели «Краткое пребывание» — 1951–1776 гг. до Р. Х.');
  });
});

describe('словарь дат: пояснение «расч.» — своё у лица', () => {
  it('оценка: основание, промежуток и зависимость от модели', () => {
    const t = plain(markTitle({ ...life({ b: A(-1428), bLo: A(-1445), bHi: A(-1410), cls: 'estimated' }), basis: { kind: 'kin' } }, { dep: false, model: 'Основной текст' }));
    expect(t).toContain('оценка по поколениям');
    expect(t).toContain('между 1445 и 1410 гг. до Р. Х.');
    expect(t).toContain('одинаково во всех моделях');
  });
  it('годы царей — реконструкция; патриархи — модель названа', () => {
    expect(plain(markTitle(life({ b: A(-1040) }), { dep: false, model: 'Основной текст' }))).toContain('Тиле — Янга');
    expect(plain(markTitle(life({ b: A(-2166), cls: 'exact' }), { dep: true, model: 'Краткое пребывание' }))).toContain('«Краткое пребывание»');
  });
});

describe('словарь дат: сплошная проверка', () => {
  // строки словаря — уже в русской типографике; «ок.» — только у оценки или приблизительного года; нет «X–X»
  const out: { s: string; est: boolean }[] = [];
  const kinds = ['exact', 'calculated', 'estimated'] as const;
  for (const b of [-4174, -2166, -1446, -1043, -45, -5, 3, 30])
    for (const w of [0, 4, 8, 12, 30, 120])
      for (const age of [0, 1, 40, 70, 133])
        for (const cls of kinds)
          for (const pin of [undefined, 'hi', 'lo'] as const) {
            const c = life({ b: A(b), bLo: A(b - w), bHi: A(b + w), d: age ? A(b) + age : null, cls, ...(pin && cls === 'estimated' ? { pin } : {}) });
            out.push({ s: lifeText(c), est: cls === 'estimated' });
          }
  it('typo() строк не меняет', () => {
    const bad = out.filter((o) => typo(o.s) !== o.s).map((o) => o.s);
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('«ок.» и «между» — только у оценок', () => {
    const bad = out.filter((o) => !o.est && /ок\.|между/.test(o.s)).map((o) => o.s);
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('промежутка «X–X» и «между X и X» нет', () => {
    const bad = out.filter((o) => /(^|\D)(\d+)–⁠?\2(\D|$)|между (\d+) и \4(\D|$)/.test(o.s)).map((o) => o.s);
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('оценка шире 10 лет без «между» — только когда округлённый внутрь промежуток уже', () => {
    expect(isWide({ t: A(-30), est: true, lo: A(-45), hi: A(-20) })).toBe(true);
    expect(isWide({ t: A(-30), est: true, lo: A(-34), hi: A(-26) })).toBe(false);
  });
});
