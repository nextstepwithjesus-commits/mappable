/** Ядро: запросы к пакетам и «нет данных для инструмента» (01 § 2.3; 09 § 4.3). Данные — пакеты пробы в памяти. */
import { describe, it, expect, beforeAll } from 'vitest';
import { coreData } from './helpers/core-data.ts';
import { verseOf, bracketAt, scriptureWords, showText } from '../core/verses.ts';
import { Data, claimId } from '../core/queries.ts';
import { PACK_SCHEMA, ORIGIN_KEYS, CAND_KEYS, KIN_KEYS, READING_KEYS, READING_ITEM_KEYS, CITE_KEYS, WORK_KEYS } from '../core/types.ts';
import { loadBase } from '../tools/base/validate.ts';

let L: ReturnType<typeof coreData>;
beforeAll(() => {
  L = coreData();
});

describe('запросы ядра', () => {
  it('лицо по полному номеру; родители, дети, супруги — полными номерами', () => {
    const kain = L.data.person('p-kain');
    expect(kain?.n).toBe('Каин');
    expect(L.data.parents('p-kain').map((k) => k.id).sort()).toEqual(['p-adam', 'p-eva']);
    expect(L.data.children('p-adam').map((k) => k.id)).toContain('p-kain');
    expect(L.data.spouses('p-adam')).toContain('p-eva');
    expect(() => L.data.parents('kain')).toThrow(/не лицо/);
  });
  it('переадресация: переход на одну цель', () => {
    const r = L.data.resolve('p-iliy-otets-marii');
    expect(r.kind).toBe('переход');
  });
  it('«нет данных для инструмента»: Мелхиседек — «Писание говорит» со стихом Евр 7:3, кнопка не прячется', () => {
    const vol = L.cards.get(L.data.volumeOf('p-melkhisedek')!)!;
    const r = L.data.forTool('genealogiya', 'p-melkhisedek', vol);
    expect(r.s).toBe('пусто');
    if (r.s !== 'пусто' || r.why.kind !== 'нет сведений') throw new Error('нет ответа «нет сведений»');
    expect(r.why.scripture).toBe(true);
    expect(r.why.refs).toEqual(['Евр 7:3']);
    expect(r.why.words?.[0].text).toMatch(/без отца, без матери/);
  });
  it('данные есть — «готово»; неизвестный номер — «нет записи»; инструмент без разметки — «не размечено»', () => {
    expect(L.data.forTool('genealogiya', 'p-kain').s).toBe('готово');
    const x = L.data.forTool('genealogiya', 'p-nikto');
    expect(x.s === 'пусто' && x.why.kind).toBe('нет записи');
    const y = L.data.forTool('geografiya', 'p-kain');
    expect(y.s === 'пусто' && y.why.kind).toBe('не размечено');
  });
});

describe('стих из пакета текста', () => {
  it('Дан 3:24 нет в синодальном тексте — null; Пс 114:9 пуст — "" и пометка дефекта', () => {
    const dan = L.texts.get('Дан')!;
    expect(dan.ch[2][23]).toBeNull();
    expect(verseOf(dan, 3, 24)?.missing).toBe(true);
    const ps = verseOf(L.texts.get('Пс')!, 114, 9);
    expect(ps?.empty).toBe(true);
    expect(ps?.issues).toContain('empty');
  });
  it('отрезки скобок с видом: Быт 1:6 «[И стало так.]» — lxx, не текст; находка внутри — с видом', () => {
    const g = L.texts.get('Быт')!;
    const v = verseOf(g, 1, 6)!;
    const b = v.brackets[0];
    expect(b.kind).toBe('lxx');
    expect(b.isText).toBe(false);
    expect(v.text.slice(b.start, b.end)).toBe('[И стало так.]');
    expect(bracketAt(g, 1, 6, b.start + 2)?.kind).toBe('lxx');
    expect(bracketAt(g, 1, 6, 0)).toBeUndefined();
    expect(scriptureWords(v)).not.toMatch(/стало так/);
  });
});

describe('рецензии переноса: номер утверждения, тома, переадресация по цепочке, закрытые типы, тире', () => {
  it('номер утверждения в пакете карточек — порядковым числом; полный номер собирает ядро (02 § 8.1, Р-11)', () => {
    const ids = new Set<string>();
    for (const v of loadBase().volumes) for (const a of v.actors) for (const f of a.facts) ids.add(f.id ?? '');
    let n = 0;
    for (const vol of L.cards.values())
      for (const c of Object.values(vol.cards))
        for (const f of c.f) {
          expect(ids.has(claimId(f.n)), claimId(f.n)).toBe(true);
          n++;
        }
    expect(n).toBeGreaterThan(10_000);
  });
  it('лицо знает свой том (часть тома), том его содержит', () => {
    const v = L.data.volumeOf('p-adam')!;
    expect(L.cards.get(v)?.cards.adam).toBeDefined();
  });
  it('переадресация идёт по цепочке и не зацикливается', () => {
    const core = { schema: PACK_SCHEMA as typeof PACK_SCHEMA, admit: 'probe' as const, persons: [{ id: 'c', n: 'Ц', p: 1, k: 'human' }], places: [], areas: [], stories: [], names: [], exceptions: [], glossary: [] };
    const tools = { ...core, actors: [], origins: [], cand: [], unions: [], kin: [], readings: [], works: [], lines: {}, places: [], redirects: [['a', ['b']], ['b', ['c']], ['x', ['y']], ['y', ['x']]] as [string, string[]][] };
    const d = new Data(core, tools);
    expect(d.resolve('p-a')).toEqual({ kind: 'переход', id: 'p-c', from: 'p-a' });
    expect(d.resolve('p-x').kind).toBe('нет');
  });
  it('каждый ключ строк указателя описан закрытым типом ядра (рецензия данных, № 9)', () => {
    const check = (rows: object[], keys: readonly string[], what: string) => {
      for (const r of rows) for (const k of Object.keys(r)) expect(keys.includes(k), `${what}.${k}`).toBe(true);
    };
    check(L.tools.origins, ORIGIN_KEYS, 'origin');
    check(L.tools.cand, CAND_KEYS, 'cand');
    check(L.tools.kin, KIN_KEYS, 'kin');
    check(L.tools.readings, READING_KEYS, 'reading');
    check(L.tools.readings.flatMap((r) => r.r), READING_ITEM_KEYS, 'reading.r');
    check(L.tools.readings.flatMap((r) => r.r.flatMap((x) => x.w ?? [])), CITE_KEYS, 'cite');
    check(L.tools.works, WORK_KEYS, 'work');
    expect(L.tools.origins.length).toBeGreaterThan(1000);
  });
  it('дефис с пробелами показывается тире той же длины (08, строка 81)', () => {
    const t = 'человека - сеть';
    expect(showText(t)).toBe('человека — сеть');
    expect(showText(t).length).toBe(t.length);
  });
});

