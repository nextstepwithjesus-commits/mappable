/**
 * Ядро: книги и ссылки данных (синодальная нумерация и сокращения). Сверка с `src/engine/books.ts`, из которого перенесены
 * родительный падеж, Завет и разбор ссылок (09 § 4.2: только `books.ts` и `text.ts` после проверки).
 */
import { describe, it, expect } from 'vitest';
import { BOOKS, BOOK_BY_CODE, bookNo, compareRefs, parseRef, verseId } from '../core/books.ts';
import { translit, norm } from '../core/search/norm.ts';
import * as old from '../src/engine/books.ts';
import * as oldText from '../src/engine/text.ts';

describe('книги ядра = книги src/engine/books.ts', () => {
  it('66 книг в порядке Синодального издания: те же коды, названия, родительный падеж, Завет', () => {
    expect(BOOKS.length).toBe(66);
    expect(BOOKS.map((b) => b.code)).toEqual(old.BOOKS.map((b) => b.code));
    expect(BOOKS.map((b) => b.name)).toEqual(old.BOOKS.map((b) => b.name));
    expect(BOOKS.map((b) => b.gen)).toEqual(old.BOOKS.map((b) => b.gen));
    expect(BOOKS.map((b) => b.t)).toEqual(old.BOOKS.map((b) => b.t));
  });
  it('коды адреса — транслит синодальных сокращений (09 § 4.4.1): Быт → byt, 1 Пар → 1par, Мк → mk; все разные', () => {
    expect(BOOK_BY_CODE.get('Быт')?.slug).toBe('byt');
    expect(BOOK_BY_CODE.get('1Пар')?.slug).toBe('1par');
    expect(BOOK_BY_CODE.get('Мк')?.slug).toBe('mk');
    expect(new Set(BOOKS.map((b) => b.slug)).size).toBe(66);
    for (const b of BOOKS) expect(b.slug, b.code).toMatch(/^[1-4]?[a-z]+$/);
  });
  it('3–4 Цар = 1–2 Царей; Пс — синодальная нумерация', () => {
    expect(BOOK_BY_CODE.get('3Цар')?.prot).toContain('1 царей');
    expect(BOOK_BY_CODE.get('3Цар')?.osis).toBe('1Kgs');
    expect(bookNo('Быт')).toBe(1);
    expect(bookNo('Откр')).toBe(66);
    expect(bookNo('Иак')).toBe(45);
  });
});

describe('ссылки данных: parseRef, verseId, compareRefs — как в src/engine/books.ts', () => {
  const cases = ['Быт 5:3', 'Быт 5:3-5', 'Быт 5:3,6,9-11', 'Быт 5', '1Пар 3:5', 'Пс 22:1', 'Быт 5:3–5', 'Бут 1:1', 'Быт 5:9-3'];
  it('те же ответы на те же входы', () => {
    for (const c of cases) expect(parseRef(c), c).toEqual(old.parseRef(c));
    const len = () => 30;
    expect(parseRef('Быт 5:32-6:2', len)).toEqual(old.parseRef('Быт 5:32-6:2', len));
    expect(parseRef('Быт 5:32-6:2')).toBeNull();
  });
  it('порядок ссылок канонический', () => {
    const xs = ['Мф 1:1', 'Быт 2:1', 'Быт 1:5', 'Мал 4:6', 'Иак 1:1', 'Рим 1:1'];
    expect([...xs].sort(compareRefs)).toEqual([...xs].sort(old.compareRefs));
    expect([...xs].sort(compareRefs)).toEqual(['Быт 1:5', 'Быт 2:1', 'Мал 4:6', 'Мф 1:1', 'Иак 1:1', 'Рим 1:1']);
    expect(verseId({ book: 'Быт', chapter: 1, verse: 1 })).toBe('Быт 1:1');
  });
  it('из src/engine/text.ts: norm и translit — те же', () => {
    for (const s of ['Иессей', 'сын Иессея', 'Бен—Амми', 'Ёфер']) {
      expect(norm(s)).toBe(oldText.norm(s));
      expect(translit(s)).toBe(oldText.translit(s));
    }
  });
});
