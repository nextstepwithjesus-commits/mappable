/**
 * Ядро: один форматер адреса (08 § 6.1 п. 16, грамматика адреса; рецензия интерфейса, № 5–6) и разбор обратно — всё, что
 * выводит форматер, разбирается в те же отрезки.
 */
import { describe, it, expect } from 'vitest';
import { formatRefs, normalizeSpans, spokenRefs, NBSP, type Span } from '../core/refs.ts';
import { parseAddress } from '../core/search/address.ts';

const S = (book: string, c1: number, v1?: number, c2 = c1, v2 = v1): Span => ({ book, c1, ...(v1 !== undefined && { v1, v2 }), c2 });
const nb = (s: string) => s.replace(/(?<![;,]) /g, NBSP);

describe('грамматика адреса 08', () => {
  it('все строки таблицы 08 § 6.1 п. 16', () => {
    expect(formatRefs([S('Быт', 6, 9)])).toBe(nb('Быт 6:9'));
    expect(formatRefs([S('Быт', 6, 9, 6, 22)])).toBe(nb('Быт 6:9–22'));
    expect(formatRefs([S('Быт', 6, 9, 7, 24)])).toBe(nb('Быт 6:9–7:24'));
    expect(formatRefs([S('Быт', 6, 9), S('Быт', 6, 22)])).toBe(nb('Быт 6:9, 22'));
    expect(formatRefs([S('Быт', 6, 9), S('Быт', 6, 22), S('Быт', 7, 1)])).toBe(nb('Быт 6:9, 22; 7:1'));
    expect(formatRefs([S('Быт', 6, 9), S('Евр', 11, 7)])).toBe(nb('Быт 6:9; Евр 11:7'));
    expect(formatRefs([S('Быт', 6, 9)], { part: true })).toBe(nb('из Быт 6:9'));
    expect(formatRefs([S('Быт', 6, undefined, 9)])).toBe(nb('Быт 6–9'));
  });
  it('неразрывный пробел после номера книги и после сокращения', () => {
    expect(formatRefs([S('1Цар', 17, 4)])).toBe(`1${NBSP}Цар${NBSP}17:4`);
    expect(formatRefs([S('1Цар', 17, 4)])).not.toMatch(/ /);
  });
  it('свёртка списка: сортировка по книге, главе, стиху; смежные и пересекающиеся сливаются', () => {
    expect(formatRefs([S('Евр', 11, 7), S('Быт', 7, 1), S('Быт', 6, 22), S('Быт', 6, 9)])).toBe(nb('Быт 6:9, 22; 7:1; Евр 11:7'));
    expect(formatRefs([S('Быт', 6, 9, 6, 12), S('Быт', 6, 13), S('Быт', 6, 10, 6, 11)])).toBe(nb('Быт 6:9–13'));
    expect(formatRefs([S('Быт', 6, undefined, 7), S('Быт', 8)])).toBe(nb('Быт 6–8'));
    expect(normalizeSpans([S('Быт', 6), S('Быт', 6, 9)]).length).toBe(1);
  });
  it('для программы чтения — полным названием', () => {
    expect(spokenRefs([S('Быт', 6, 9, 9, 17)])).toBe('Бытие, глава 6, стих 9 — глава 9, стих 17');
    expect(spokenRefs([S('Быт', 6, 9)])).toBe('Бытие, глава 6, стих 9');
  });
  it('туда и обратно: разбор выведенного адреса даёт те же отрезки', () => {
    const lists: Span[][] = [
      [S('Быт', 6, 9)], [S('Быт', 6, 9, 6, 22)], [S('Быт', 6, 9, 7, 24)], [S('Быт', 6, 9), S('Быт', 6, 22)],
      [S('Быт', 6, 9), S('Быт', 6, 22), S('Быт', 7, 1)], [S('Быт', 6, 9), S('Евр', 11, 7)], [S('Быт', 6, undefined, 9)],
      [S('1Цар', 17, 4), S('1Цар', 17, 40, 17, 50), S('4Цар', 5)], [S('Пс', 22), S('Мф', 5, 3, 5, 12), S('Мф', 6, 9, 6, 13)],
    ];
    for (const l of lists) {
      const label = formatRefs(l);
      const a = parseAddress(label);
      expect(a?.spans, label).toEqual(normalizeSpans(l));
      expect(a?.label).toBe(label);
    }
    expect(parseAddress(formatRefs([S('Быт', 6, 9)], { part: true }))?.part).toBe(true);
  });
});
