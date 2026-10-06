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
    // рецензия этапа 21: «поля Моавитские», «Руфь Моавитянка» (Руф 1:1, 1:22) — не имя Моава, сына Лота; в книге 20 лиц
    expect(ruth).not.toContain('moav');
    expect(ruth.length).toBe(20);
  });
  it('книги лица: имя колена — не лицо (Ефрем у Осии), безымянное лицо — по стихам карточки (жена Пилата), Иисус Христос — во всех книгах Нового Завета, где Он назван', () => {
    expect(inCatalog('efrem', 'all', 'Ос')).toBe(false);
    expect(inCatalog('efrem', 'all', 'Быт')).toBe(true);
    expect(inCatalog('zhena-pilata', 'nt', 'Мф')).toBe(true);
    for (const b of ['Гал', 'Еф', 'Кол', '1Фес', 'Тит', 'Флм', '1Ин', 'Иуд']) expect(inCatalog('iisus', 'nt', b), b).toBe(true);
    expect(inCatalog('iisus', 'nt', '3Ин')).toBe(false);
  });
  it('заголовки: часть Писания и книга словами', () => {
    expect(catalogTitle('all', '')).toBe('Все лица атласа');
    expect(catalogTitle('nt', '')).toMatch(/^Лица Нового Завета/);
    // название книги — синодальное заглавие в предложном падеже (рецензия этапа 21: было «в книге к Евреям», «в книге от
    // Матфея» — родительный падеж кода книги после слова «книга»): «в книге Руфь» (заглавие «Книга Руфь»), «в Послании
    // к Евреям», «в Евангелии от Матфея», «в Первом послании Петра»
    expect(catalogTitle('ot', 'Руф')).toBe('Лица, названные в книге Руфь');
    expect(catalogTitle('all', 'Быт')).toBe('Лица, названные в книге Бытия');
    expect(catalogTitle('nt', 'Евр')).toBe('Лица, названные в Послании к Евреям');
    expect(catalogTitle('nt', 'Мф')).toBe('Лица, названные в Евангелии от Матфея');
    expect(catalogTitle('nt', '1Пет')).toBe('Лица, названные в Первом послании Петра');
  });
});
