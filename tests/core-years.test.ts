/** Ядро: годы без нулевого (09 § 3.3; 04 § 3.1; 09 § 8.1 «единичные»). */
import { describe, it, expect } from 'vitest';
import { addYears, compareYears, fromAstro, isYear, toAstro, yearIso, yearLabel, yearsBetween } from '../core/years.ts';

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
    expect(yearLabel(-1010)).toBe('1010 г. до Р. Х.');
    expect(yearLabel(30)).toBe('30 г. по Р. Х.');
    expect(yearLabel(-967, { era: false })).toBe('967');
    expect(yearIso(-1010)).toBe('-1009');
    expect(yearIso(-1)).toBe('0000');
    expect(yearIso(30)).toBe('0030');
  });
});
