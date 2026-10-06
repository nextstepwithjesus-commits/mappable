/**
 * Этап 21, решение 202: каталог «Указателя» — часть Писания по книге, где лицо названо впервые, и книга — все лица,
 * названные в ней (IdxPerson.inBooks из индекса неба: по символу на книгу, src/engine/books.ts).
 */
import { describe, expect, it } from 'vitest';
import { byId, persons } from '../src/data/atlas.ts';
import { BOOKS, BOOK_CHARS, decodeBooks, encodeBooks } from '../src/engine/books.ts';
import { catalogTitle, inCatalog } from '../src/ui/panels/Index.tsx';

describe('каталог по Заветам и книгам (решение 202)', () => {
  it('книги лица — строкой по символу на книгу, в каноническом порядке, туда и обратно', () => {
    expect(BOOK_CHARS.length).toBe(BOOKS.length);
    expect(new Set(BOOK_CHARS).size).toBe(BOOKS.length);
    const ch = (code: string) => BOOK_CHARS[BOOKS.findIndex((b) => b.code === code)];
    expect(encodeBooks(['Мф', 'Быт', 'Руф', 'Быт'])).toBe(ch('Быт') + ch('Руф') + ch('Мф'));
    expect(decodeBooks(encodeBooks(['Лк', 'Быт']))).toEqual(['Быт', 'Лк']);
  });
  it('у лиц есть книги; Авраам — лицо Ветхого Завета, хотя назван и в Мф 1; Иосиф, муж Марии, — Нового', () => {
    expect(persons.filter((p) => !p.inBooks.length).length).toBeLessThanOrEqual(2);
    expect(byId.get('avraam')!.inBooks).toContain('Мф');
    expect(inCatalog('avraam', 'ot', '')).toBe(true);
    expect(inCatalog('avraam', 'nt', '')).toBe(false);
    expect(inCatalog('iosif-muzh-marii', 'nt', '')).toBe(true);
    expect(inCatalog('iisus', 'nt', '')).toBe(true);
    const ot = persons.filter((p) => inCatalog(p.id, 'ot', '')).length;
    const nt = persons.filter((p) => inCatalog(p.id, 'nt', '')).length;
    expect(ot + nt).toBeGreaterThanOrEqual(persons.length - 2);
  });
  it('книга Руфь — все названные в ней: Руфь, Вооз, Ноеминь, Овид, Иессей, Давид и родословие Руф 4', () => {
    const ruth = persons.filter((p) => inCatalog(p.id, 'all', 'Руф')).map((p) => p.id);
    for (const id of ['ruf', 'vooz', 'noemin', 'ovid', 'iessey', 'david', 'fares']) expect(ruth, id).toContain(id);
    expect(ruth).not.toContain('moisey');
  });
  it('заголовки: часть Писания и книга словами', () => {
    expect(catalogTitle('all', '')).toBe('Все лица атласа');
    expect(catalogTitle('nt', '')).toMatch(/^Лица Нового Завета/);
    // название книги — родительным падежом из данных книг (src/engine/books.ts, gen): «книге Руфи», «книге Бытия»
    expect(catalogTitle('ot', 'Руф')).toBe('Лица, названные в книге Руфи');
    expect(catalogTitle('all', 'Быт')).toBe('Лица, названные в книге Бытия');
  });
});
