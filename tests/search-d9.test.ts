/**
 * Поиск этапа 3 (D9; UX-01, 06, 42; IX-15–20) на настоящих данных: стих и глава (все ссылки карточек и имена в тексте),
 * регистр и форма книги, основы слов, опечатки, традиционные именования. Нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { byId } from '../src/data/atlas.ts';
import { bookOf, damerau, parseQueryRef, stems, traditionOf, TRADITIONAL, typoBudget } from '../src/engine/search.ts';
import { searchIndex, prepareBook } from '../src/ui/top/searchIndex.ts';

const ids = (q: string, n = 30) => searchIndex.search(q, n).map((h) => h.id);

describe('ссылка на стих и главу в запросе (IX-17)', () => {
  it('регистр, пробел и форма книги не важны', () => {
    for (const q of ['Руф 4:21', 'руф 4:21', 'РУФ 4:21', 'Руф4:21', 'Руф. 4:21', 'Руфь 4:21', 'руфь 4.21']) expect(parseQueryRef(q)?.ref, q).toBe('Руф 4:21');
    expect(parseQueryRef('бытие 14:18')?.ref).toBe('Быт 14:18');
    expect(parseQueryRef('Быт 5:3-5')?.verses).toEqual(['Быт 5:3', 'Быт 5:4', 'Быт 5:5']);
    expect(parseQueryRef('1 цар 16:1')?.ref).toBe('1Цар 16:1');
    expect(parseQueryRef('1Пар 3:19')?.ref).toBe('1Пар 3:19');
    expect(parseQueryRef('1-я Царств 16')?.ref).toBe('1Цар 16');
    expect(parseQueryRef('мф 1:16')?.ref).toBe('Мф 1:16');
    expect(parseQueryRef('от Иоанна 1:1')).toBe(null); // два слова названия — не ссылка
    expect(parseQueryRef('Иоанна 1:1')?.ref).toBe('Ин 1:1');
  });
  it('«Руф 4» — глава, а не имя; имя без чисел — не ссылка', () => {
    const r = parseQueryRef('Руф 4');
    expect(r?.ref).toBe('Руф 4');
    expect(r?.verses).toEqual([]);
    expect(parseQueryRef('Иов')).toBe(null);
    expect(parseQueryRef('Давид')).toBe(null);
    expect(bookOf('', 'ру')).toBe(null);
    expect(bookOf('', 'иоан')).toBe('Ин');
    expect(bookOf('1', 'иоан')).toBe('1Ин');
  });
});

describe('лица стиха: все ссылки карточек и имена в тексте (UX-06)', () => {
  beforeAll(async () => {
    await Promise.all(['Быт', 'Руф', 'Мф'].map(prepareBook));
  }, 60_000);
  it('«Быт 14:18» — Мелхиседек (U3)', () => {
    expect(ids('Быт 14:18')[0]).toBe('melkhisedek');
  });
  it('«руф 4:21» — все лица стиха в порядке текста: Салмон, Вооз, Овид', () => {
    const r = ids('руф 4:21');
    for (const id of ['salmon', 'vooz', 'ovid']) expect(r, id).toContain(id);
    expect(r.indexOf('salmon')).toBeLessThan(r.indexOf('vooz'));
    expect(r.indexOf('vooz')).toBeLessThan(r.indexOf('ovid'));
  });
  it('«Мф 1:5» — и Руфь, и Рахава, а не только лица с этим стихом в родстве', () => {
    const r = ids('Мф 1:5');
    expect(r).toContain('ruf');
    expect(r).toContain('raav'); // Раав — «Рахава» у Мф 1:5
  });
  it('«Руф 4» — лица главы: Руфь, Вооз, Ноеминь, Давид', () => {
    const r = ids('Руф 4', 300);
    for (const id of ['ruf', 'vooz', 'david', 'ovid', 'iessey']) expect(r, id).toContain(id);
    expect(r.some((id) => byId.get(id)?.name === 'Ноеминь')).toBe(true);
  });
  it('одноимённые не подставляются в чужую главу: в Быт 37:3 Иосиф — сын Иакова, не муж Марии', () => {
    const r = ids('Быт 37:3');
    expect(r).toContain('iosif');
    expect(r).not.toContain('iosif-muzh-marii');
    expect(r).not.toContain('iosif-arimafeyskiy');
  });
});

describe('имя: основы, опечатки, традиционные именования', () => {
  it('косвенная форма находит лицо по общей основе (UX-42)', () => {
    expect(stems('Иессея')).toContain('иессе');
    expect(stems('Иессей')).toContain('иессе');
    expect(ids('Иессея')[0]).toBe('iessey');
    expect(ids('Моисея')[0]).toBe('moisey');
    expect(ids('Давида')[0]).toBe('david');
    expect(ids('Иисуса')[0]).toBe('iisus');
    expect(ids('Иосифа из Аримафеи')[0]).toBe('iosif-arimafeyskiy');
  });
  it('Дамерау — Левенштейн: перестановка — одна правка; бюджет по длине', () => {
    expect(damerau('навуходонасор', 'навуходоносор')).toBe(1);
    expect(damerau('иосфи', 'иосиф')).toBe(1);
    expect(damerau('давид', 'давид')).toBe(0);
    expect(damerau('авраам', 'исаак', 2)).toBe(3);
    expect([typoBudget(4), typoBudget(5), typoBudget(8), typoBudget(9)]).toEqual([0, 1, 1, 2]);
  });
  it('опечатки прощаются, только если по имени ничего не нашлось (IX-18)', () => {
    const r = searchIndex.search('Навуходонасор');
    expect(r[0]?.id).toBe('navukhodonosor');
    expect(r[0]?.via).toBe('fuzzy');
    expect(searchIndex.search('Мелхиседэк')[0]?.id).toBe('melkhisedek');
    // точное имя — без «возможно, вы искали»
    expect(searchIndex.search('Давид').every((h) => h.via !== 'fuzzy')).toBe(true);
    // короткое имя не угадывается
    expect(searchIndex.search('Ифк')).toEqual([]);
  });
  it('традиционное именование — синодальной формой, первым (решение владельца 13)', () => {
    const top = (q: string) => searchIndex.search(q)[0];
    expect(top('Богородица')).toMatchObject({ id: 'mariya', via: 'tradition', tradition: 'Богородица' });
    expect(top('богородицы')?.id).toBe('mariya');
    expect(top('Божией Матери')?.id).toBe('mariya');
    expect(top('Иосиф Обручник')).toMatchObject({ id: 'iosif-muzh-marii', tradition: 'Иосиф Обручник' });
    expect(top('Предтеча')?.id).toBe('ioann-krestitel');
    expect(top('Иоанн Предтеча')?.id).toBe('ioann-krestitel');
    expect(traditionOf('Мария')).toBe(null);
    expect(traditionOf('Иоанн')).toBe(null);
  });
  it('каждое традиционное именование указывает на одно существующее лицо, формы не пересекаются', () => {
    const seen = new Map<string, string>();
    for (const t of TRADITIONAL) {
      expect(byId.has(t.id), t.id).toBe(true);
      for (const f of t.forms) {
        expect(seen.has(f), f).toBe(false);
        seen.set(f, t.id);
        expect(traditionOf(f)?.id, f).toBe(t.id);
      }
    }
  });
});

describe('«Все N на небе» отмечает одноимённых (ТЗ § 3.7)', () => {
  it('«иосиф» — только Иосифы, число равно группе одноимённых; найденные по уточнению («сын Иосифа») не отмечаются', async () => {
    const { markAllIds, resultBlocks } = await import('../src/ui/top/Search.tsx');
    const hits = searchIndex.search('иосиф');
    const ids = markAllIds(hits);
    expect(ids.length).toBeGreaterThan(1);
    for (const id of ids) expect(byId.get(id)!.name).toBe('Иосиф');
    expect(ids).not.toContain('manassiya');
    expect(ids).not.toContain('iosifiya'); // Иосифия — другое имя
    const group = resultBlocks(hits, { pinned: false, noAll: false }).find((b) => b.head?.startsWith('Иосиф'));
    if (group) expect(group.rows.length).toBe(ids.length);
  });
  it('«Иисус» — все, чьё имя начинается словом «Иисус»: Иисус Христос, Иисус Навин и одноимённые', async () => {
    const { markAllIds } = await import('../src/ui/top/Search.tsx');
    const ids = markAllIds(searchIndex.search('Иисус', 60));
    expect(ids).toEqual(expect.arrayContaining(['iisus', 'iisus-navin']));
    for (const id of ids) expect(byId.get(id)!.name.split(' ')[0]).toBe('Иисус');
  });
  it('по стиху отмечаются все лица стиха', async () => {
    await prepareBook('Руф');
    const { markAllIds } = await import('../src/ui/top/Search.tsx');
    const ids = markAllIds(searchIndex.search('руф 4:21'));
    expect(ids).toEqual(expect.arrayContaining(['salmon', 'vooz', 'ovid']));
  });
});
