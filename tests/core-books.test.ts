/**
 * Ядро: книги и ссылки данных (синодальная нумерация и сокращения). Сверка с `src/engine/books.ts`, из которого перенесены
 * родительный падеж, Завет и разбор ссылок (09 § 4.2: только `books.ts` и `text.ts` после проверки).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
    // одно правило (рецензия интерфейса, № 17): транслит сокращения без пробела — Еккл → ekkl, Еф → ef, Евр → evr, Езд → ezd
    for (const b of BOOKS) expect(b.slug, b.code).toBe(translit(b.short.replace(' ', '')));
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
    // межглавный диапазон — по первому стиху, без развёртывания (рецензия интерфейса, № 8)
    expect(['Быт 6:1', 'Быт 5:32-6:2', 'Быт 5:1', 'Быт 10', 'Быт 9:1'].sort(compareRefs)).toEqual(['Быт 5:1', 'Быт 5:32-6:2', 'Быт 6:1', 'Быт 9:1', 'Быт 10']);
    expect(verseId({ book: 'Быт', chapter: 1, verse: 1 })).toBe('Быт 1:1');
  });
  it('из src/engine/text.ts: norm и translit — те же', () => {
    for (const s of ['Иессей', 'сын Иессея', 'Бен—Амми', 'Ёфер']) {
      expect(norm(s)).toBe(oldText.norm(s));
      expect(translit(s)).toBe(oldText.translit(s));
    }
  });
  it('сравнение транзитивно на всех ссылках базы', () => {
    const refs = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) (k === 'refs' && Array.isArray(v) ? v.forEach((r) => typeof r === 'string' && refs.add(r)) : walk(v));
    };
    for (const f of readdirSync(join(import.meta.dirname, '..', 'base', 'actors'))) walk(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'base', 'actors', f), 'utf8')));
    const xs = [...refs].sort(compareRefs);
    expect(xs.length).toBeGreaterThan(5000);
    for (let i = 1; i < xs.length; i++) expect(compareRefs(xs[i - 1], xs[i]) <= 0, `${xs[i - 1]} / ${xs[i]}`).toBe(true);
    // транзитивность на выборке троек
    for (let i = 0; i + 2 < xs.length; i += 97) expect(compareRefs(xs[i], xs[i + 2])).toBeLessThanOrEqual(0);
  });
});

