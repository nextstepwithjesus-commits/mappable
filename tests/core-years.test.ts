/** Ядро: годы без нулевого (09 § 3.3; 04 § 3.1; 09 § 8.1 «единичные»). */
import { describe, it, expect } from 'vitest';
import { addYears, compareYears, fromAdamLabel, fromAstro, isYear, toAstro, yearIso, yearLabel, yearSpanLabel, yearsBetween, YEAR_ISO_NOTE } from '../core/years.ts';

const nb = (s: string) => s.replace(/ (?=гг?\.|Р\.|Х\.)/g, '\u00A0').replace(/(\d) (лет|год|года) /g, '$1\u00A0$2 ');

describe('годы без нулевого', () => {
  it('исторический → астрономический и обратно', () => {
    expect(toAstro(-1)).toBe(0);
    expect(toAstro(-1010)).toBe(-1009);
    expect(toAstro(30)).toBe(30);
    expect(fromAstro(0)).toBe(-1);
    expect(fromAstro(-1009)).toBe(-1010);
    for (const y of [-4004, -1010, -2, -1, 1, 2, 70]) expect(fromAstro(toAstro(y))).toBe(y);
  });
  it('нулевого года нет: 0 и дробь — ошибка', () => {
    expect(isYear(0)).toBe(false);
    expect(() => toAstro(0)).toThrow(/нулевого года нет/);
    expect(() => yearLabel(0)).toThrow();
    expect(() => toAstro(1.5)).toThrow();
  });
  it('от 1 г. до Р. Х. до 1 г. по Р. Х. — один год', () => {
    expect(yearsBetween(-1, 1)).toBe(1);
    expect(addYears(-1, 1)).toBe(1);
    expect(addYears(1, -1)).toBe(-1);
    expect(yearsBetween(-1010, -970)).toBe(40);
    expect(yearsBetween(-4, 30)).toBe(33);
    expect(compareYears(-1, 1)).toBeLessThan(0);
  });
  it('подпись года без минуса; ISO — астрономический', () => {
    expect(yearLabel(-1010)).toBe(nb('1010 г. до Р. Х.'));
    expect(yearLabel(30)).toBe(nb('30 г. по Р. Х.'));
    expect(yearLabel(-1010)).toBe('1010\u00A0г. до\u00A0Р.\u00A0Х.');
    expect(yearLabel(-967, { era: false })).toBe('967');
    expect(yearIso(-1010)).toBe('-1009');
    expect(yearIso(-1)).toBe('0000');
    expect(yearIso(30)).toBe('0030');
  });
  it('подпись промежутка (02 § 4.1; 04 § 3.1): одна на все инструменты', () => {
    expect(yearSpanLabel({ earliest: -1010, latest: -970 })).toBe(nb('1010–970 гг. до Р. Х.'));
    expect(yearSpanLabel({ earliest: 28, latest: 33 })).toBe(nb('28–33 гг. по Р. Х.'));
    expect(yearSpanLabel({ earliest: -4, latest: 30 })).toBe(nb('4 г. до Р. Х.') + ' – ' + nb('30 г. по Р. Х.'));
    expect(yearSpanLabel({ earliest: 28, latest: 29, words: '28/29' })).toBe(nb('28/29 г. по Р. Х.'));
    expect(yearSpanLabel({ earliest: -967, latest: -967 }, { about: true, calc: true })).toBe('около\u00A0' + nb('967 г. до Р. Х.') + ', расч.');
    expect(() => yearSpanLabel({ earliest: -900, latest: -1000 })).toThrow();
    expect(fromAdamLabel(930)).toBe('930\u00A0лет от сотворения Адама');
    expect(fromAdamLabel(1)).toBe('1\u00A0год от сотворения Адама');
    expect(fromAdamLabel(22)).toBe('22\u00A0года от сотворения Адама');
    expect(fromAdamLabel(12)).toBe('12\u00A0лет от сотворения Адама');
    expect(YEAR_ISO_NOTE).toMatch(/−1009 = 1010 г\. до Р\. Х\./);
  });
});
