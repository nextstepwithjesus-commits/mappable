import { describe, it, expect } from 'vitest';
import type { Person, Epoch } from '../src/data/types.ts';
import { buildGraph, siblings } from '../src/engine/graph.ts';
import { solveChronology } from '../src/engine/chronology.ts';
import { computeLayout } from '../src/engine/layout.ts';
import { toAstro, toHist, addYears, formatSpan } from '../src/engine/years.ts';
import { bloodTerm, relate } from '../src/engine/kinship.ts';
import { fixLayout, stem, SearchIndex } from '../src/engine/search.ts';
import { splitRuns } from '../src/engine/ribbons.ts';
import { buildTimeScale, timeToX, xToTime } from '../src/engine/timescale.ts';
import epochsJson from '../data/epochs.json' with { type: 'json' };
import { nameMatcher, norm } from '../src/engine/text.ts';

const epochs = epochsJson as Epoch[];

/** Небольшая родословная Быт 5; 11 с числами основного текста. */
function genesisFixture(): Person[] {
  const P = (id: string, name: string, father: string | null, fatherAge?: number, age?: number, sex: 'm' | 'f' = 'm'): Person => ({
    id, name, sex, father, parentRefs: father ? ['Быт 5:3'] : undefined, group: 'sethites', prominence: 3,
    chrono: { born: fatherAge !== undefined ? { fatherAge, refs: ['Быт 5:3'] } : undefined, died: age !== undefined ? { age, refs: ['Быт 5:5'] } : undefined },
  });
  return [
    P('adam', 'Адам', null, undefined, 930),
    P('sif', 'Сиф', 'adam', 130, 912),
    P('enos', 'Енос', 'sif', 105, 905),
    P('kainan', 'Каинан', 'enos', 90, 910),
    P('maleleil', 'Малелеил', 'kainan', 70, 895),
    P('iared', 'Иаред', 'maleleil', 65, 962),
    P('enokh', 'Енох', 'iared', 162, 365),
    P('mafusal', 'Мафусал', 'enokh', 65, 969),
    P('lamekh', 'Ламех', 'mafusal', 187, 777),
    P('noy', 'Ной', 'lamekh', 182, 950),
    P('sim', 'Сим', 'noy', 502, 600),
    P('arfaksad', 'Арфаксад', 'sim', 100, 438),
    P('sala', 'Сала', 'arfaksad', 35, 433),
    P('ever', 'Евер', 'sala', 30, 464),
    P('falek', 'Фалек', 'ever', 34, 239),
    P('ragav', 'Рагав', 'falek', 30, 239),
    P('serukh', 'Серух', 'ragav', 32, 230),
    P('nakhor', 'Нахор', 'serukh', 30, 148),
    P('farra', 'Фарра', 'nakhor', 29, 205),
    P('avraam', 'Авраам', 'farra', 130, 175),
    P('isaak', 'Исаак', 'avraam', 100, 180),
    P('iakov', 'Иаков', 'isaak', 60, 147),
    P('iosif', 'Иосиф', 'iakov', 91, 110),
  ];
}

describe('годы', () => {
  it('переводит исторические годы в астрономические и обратно без нулевого года', () => {
    expect(toAstro(-1)).toBe(0);
    expect(toHist(0)).toBe(-1);
    expect(addYears(-5, 12)).toBe(8); // Иисус двенадцати лет в храме
    expect(addYears(-1, 1)).toBe(1);
  });
  it('пишет промежутки по-русски', () => {
    expect(formatSpan(toAstro(-1040), toAstro(-970), true)).toBe('ок. 1040–970 гг. до Р. Х.');
  });
});

describe('хронология: масоретская модель, 430 лет в Египте', () => {
  const g = buildGraph(genesisFixture());
  const res = solveChronology(g, epochs, 'mt-long');
  const year = (id: string) => toHist(res.persons.get(id)!.b);
  it('ставит Иакова в 2006 г. до Р. Х. (Исход 1446 − 430 − 130)', () => expect(year('iakov')).toBe(-2006));
  it('ставит Аврама в 2166 г. до Р. Х.', () => expect(year('avraam')).toBe(-2166));
  it('ставит сотворение Адама в 4174 г. до Р. Х.', () => expect(year('adam')).toBe(-4174));
  it('даёт Потоп в 600-й год Ноя = 2518 г. до Р. Х.', () => expect(toHist(res.persons.get('noy')!.b + 600)).toBe(-2518));
  it('даёт Иосифу 30 лет в 1885 г. до Р. Х.', () => expect(toHist(res.persons.get('iosif')!.b + 30)).toBe(-1885));
  it('считает даты цепочки точными', () => expect(res.persons.get('enokh')!.cls).toBe('exact'));
  it('модель краткого пребывания сдвигает патриархов на 215 лет', () => {
    const s = solveChronology(g, epochs, 'mt-short');
    expect(toHist(s.persons.get('avraam')!.b)).toBe(-2166 + 215);
  });
  it('модель «Фарре 70» удревняет праотцев на 60 лет', () => {
    const s = solveChronology(g, epochs, 'terah70');
    expect(toHist(s.persons.get('adam')!.b)).toBe(-4174 + 60);
  });
});

describe('хронология: напряжения', () => {
  it('отмечает, что Моисей не помещается в жизнь Амрама при 430 годах в Египте', () => {
    const base = genesisFixture();
    const extra: Person[] = [
      { id: 'leviy', name: 'Левий', sex: 'm', father: 'iakov', parentRefs: ['Быт 29:34'], group: 'levi', prominence: 4, chrono: { died: { age: 137, refs: ['Исх 6:16'] }, born: { notBefore: { from: 'iakov', years: 80 }, notAfter: { from: 'iakov', years: 90 } } } },
      { id: 'kaaf', name: 'Кааф', sex: 'm', father: 'leviy', parentRefs: ['Исх 6:16'], group: 'levi', prominence: 2, chrono: { died: { age: 133, refs: ['Исх 6:18'] }, born: { notAfter: { from: 'iakov', years: 130 }, refs: ['Быт 46:11'] } } },
      { id: 'amram', name: 'Амрам', sex: 'm', father: 'kaaf', parentRefs: ['Исх 6:18'], group: 'levi', prominence: 2, chrono: { died: { age: 137, refs: ['Исх 6:20'] } } },
      { id: 'moisey', name: 'Моисей', sex: 'm', father: 'amram', parentRefs: ['Исх 6:20'], group: 'levi', prominence: 5, chrono: { born: { year: -1526, refs: ['Исх 7:7'] } } },
    ];
    const g = buildGraph([...base, ...extra]);
    const res = solveChronology(g, epochs, 'mt-long');
    expect(res.tensions.some((t) => t.persons.includes('moisey'))).toBe(true);
    const short = solveChronology(g, epochs, 'mt-short');
    expect(short.tensions.filter((t) => t.persons.includes('moisey') && t.persons.includes('amram')).length).toBe(0);
  });
});

describe('хронология: модель чисел в скобках', () => {
  it('держит недатированного сына при жизни отца и сдвигает допотопную эпоху вместе с сотворением', () => {
    const base = genesisFixture().map((p) => (p.id === 'sif' ? { ...p, chrono: { ...p.chrono, born: { fatherAge: 130, fatherAgeBracket: 230, refs: ['Быт 5:3'] } } } : p));
    const kain: Person = { id: 'kain', name: 'Каин', sex: 'm', father: 'adam', parentRefs: ['Быт 4:1'], group: 'cainites', prominence: 3, order: 1, chrono: { epoch: 'antediluvian' } };
    const g = buildGraph([...base, kain]);
    const res = solveChronology(g, epochs, 'lxx');
    const adam = res.persons.get('adam')!;
    const k = res.persons.get('kain')!;
    expect(k.b).toBeLessThanOrEqual(adam.d! + 1);
    expect(k.b).toBeGreaterThan(adam.b);
    expect(res.persons.get('adam')!.epoch).toBe('antediluvian');
    expect(res.tensions.filter((t) => t.persons.includes('kain')).length).toBe(0);
  });
});

describe('раскладка', () => {
  const people: Person[] = [
    ...genesisFixture(),
    { id: 'kham', name: 'Хам', sex: 'm', father: 'noy', parentRefs: ['Быт 5:32'], group: 'hamites', prominence: 3, chrono: { epoch: 'antediluvian' } },
    { id: 'iafet', name: 'Иафет', sex: 'm', father: 'noy', parentRefs: ['Быт 5:32'], group: 'japhethites', prominence: 3, chrono: { epoch: 'antediluvian' } },
    { id: 'khanaan', name: 'Ханаан', sex: 'm', father: 'kham', parentRefs: ['Быт 10:6'], group: 'hamites', prominence: 2 },
    { id: 'khus', name: 'Хус', sex: 'm', father: 'kham', parentRefs: ['Быт 10:6'], group: 'hamites', prominence: 2 },
    { id: 'nimrod', name: 'Нимрод', sex: 'm', father: 'khus', parentRefs: ['Быт 10:8'], group: 'hamites', prominence: 3 },
  ];
  const g = buildGraph(people);
  const res = solveChronology(g, epochs);
  const spine = ['adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy', 'sim', 'arfaksad', 'sala', 'ever', 'falek', 'ragav', 'serukh', 'nakhor', 'farra', 'avraam', 'isaak', 'iakov'];
  const steps = spine.map((id) => ({ id, refs: [], flag: 'in-text' }));
  const L = computeLayout(g, res, { joseph: steps, mary: steps });
  it('не допускает пересечения следов в одной полосе', () => {
    const byLane = new Map<number, [number, number][]>();
    for (const n of L.nodes) {
      const a = byLane.get(n.lane) ?? [];
      for (const [s, e] of a) expect(n.t0 >= e || n.t1 <= s).toBe(true);
      a.push([n.t0, n.t1]);
      byLane.set(n.lane, a);
    }
  });
  it('держит общий хребет в коридоре', () => {
    for (const id of spine) expect(Math.abs(L.byPerson.get(id)!.lane)).toBeLessThanOrEqual(7);
  });
  it('раскладывает семью без пересечений отводов', () => {
    expect(L.metrics.crossings).toBe(0);
  });
});

describe('ленты', () => {
  it('делит линии на общие и раздельные участки', () => {
    const runs = splitRuns(['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'x', 'y', 'd', 'e']);
    expect(runs.map((r) => r.kind)).toEqual(['shared', 'joseph', 'mary', 'shared']);
    expect(runs[1].ids).toEqual(['b', 'c', 'd']);
    expect(runs[2].ids).toEqual(['b', 'x', 'y', 'd']);
  });
});

describe('масштаб времени', () => {
  it('монотонен и обратим в обоих режимах', () => {
    const births = Array.from({ length: 400 }, (_, i) => -1200 + i);
    const ts = buildTimeScale(births, births.map((b) => [b, b + 60] as [number, number]));
    for (const lam of [0, 0.5, 1]) {
      let prev = -Infinity;
      for (let t = -4000; t < 2000; t += 37) {
        const x = timeToX(ts, t, lam);
        expect(x).toBeGreaterThan(prev);
        prev = x;
      }
      expect(Math.abs(xToTime(ts, timeToX(ts, -1000, lam), lam) + 1000)).toBeLessThan(0.1);
    }
  });
});

describe('родство', () => {
  it('называет степени по-русски', () => {
    expect(bloodTerm(0, 3, true)).toBe('прабабушка');
    expect(bloodTerm(1, 2, false)).toBe('дядя');
    expect(bloodTerm(2, 1, false)).toBe('племянник');
    expect(bloodTerm(3, 1, false)).toBe('внучатый племянник');
    expect(bloodTerm(2, 2, true)).toBe('двоюродная сестра');
    expect(bloodTerm(1, 1, false, 'paternal')).toBe('единокровный брат');
  });
  it('находит «Руфь — прабабушка Давида»', () => {
    const P = (id: string, name: string, sex: 'm' | 'f', father?: string, mother?: string): Person => ({ id, name, sex, father, mother, parentRefs: ['Руф 4:21'], group: 'judah', prominence: 3 });
    const g = buildGraph([P('vooz', 'Вооз', 'm'), P('ruf', 'Руфь', 'f'), P('ovid', 'Овид', 'm', 'vooz', 'ruf'), P('iessey', 'Иессей', 'm', 'ovid'), P('david', 'Давид', 'm', 'iessey')]);
    expect(relate(g, 'ruf', 'david')[0].sentence).toBe('Руфь — прабабушка Давида');
    expect(siblings(g, 'david')).toEqual([]);
  });
});

describe('поиск', () => {
  it('исправляет раскладку и отбрасывает окончания', () => {
    expect(fixLayout('lfdbl')).toBe('давид');
    expect(stem('Давида')).toBe('давид');
  });
  it('находит лицо по косвенной форме и по стиху', () => {
    const idx = new SearchIndex([
      { id: 'david', name: 'Давид', alt: [], disambig: 'сын Иессея', prominence: 5, refs: ['Руф 4:22'] },
      { id: 'iessey', name: 'Иессей', alt: [], disambig: '', prominence: 3, refs: ['Руф 4:22'] },
    ]);
    expect(idx.search('Давида')[0].id).toBe('david');
    expect(idx.search('Руф 4:22').map((h) => h.id).sort()).toEqual(['david', 'iessey']);
  });
});

describe('сверка имён с текстом стиха', () => {
  const hit = (name: string, word: string) => nameMatcher(name).test(' ' + norm(word) + ' ');
  it('узнаёт падежные и притяжательные формы', () => {
    expect(hit('Ной', 'Ноя')).toBe(true);
    expect(hit('Мара', 'Марою')).toBe(true);
    expect(hit('Ила', 'Илы')).toBe(true);
    expect(hit('Хазо', 'Хазо')).toBe(true);
    expect(hit('Бен-Амми', 'Бен—Амми')).toBe(true);
  });
  it('не путает короткие имена со служебными словами', () => {
    expect(hit('Ной', 'но')).toBe(false);
    expect(hit('Ила', 'или')).toBe(false);
  });
});

describe('текст Писания', () => {
  it('только 66 канонических книг; Псалтирь — 150 псалмов', async () => {
    const { loadBible } = await import('../tools/bible.ts');
    const b = loadBible();
    const books = new Set(b.order.map((k) => k.split(' ').slice(0, -1).join(' ')));
    expect(books.size).toBe(66);
    expect(b.chapterLength('Пс', 150)).toBeGreaterThan(0);
    expect(b.chapterLength('Пс', 151)).toBe(0);
  });
});

describe('родство через термин Писания «сестра»', () => {
  it('Иоав — племянник Давида: мать Иоава Саруия названа сестрой Давида без общих родителей в данных', () => {
    const P = (id: string, name: string, sex: 'm' | 'f', extra: Partial<Person> = {}): Person => ({ id, name, sex, group: 'judah', prominence: 3, ...extra });
    const g = buildGraph([
      P('david', 'Давид', 'm'),
      P('saruiya', 'Саруия', 'f', { kin: [{ id: 'david', rel: 'сестра', refs: ['1Пар 2:16'] }] }),
      P('ioav', 'Иоав', 'm', { mother: 'saruiya', parentRefs: ['1Пар 2:16'] }),
    ]);
    const r = relate(g, 'ioav', 'david');
    expect(r.some((x) => x.term === 'племянник' && x.sentence.includes('сын его сестры Саруии'))).toBe(true);
    expect(relate(g, 'david', 'ioav').some((x) => x.term === 'дядя')).toBe(true);
    expect(relate(g, 'david', 'saruiya').some((x) => x.term === 'брат')).toBe(true);
  });
});

describe('связь «из сыновей X»', () => {
  const P = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, sex: 'm', group: 'levi', prominence: 2, ...extra });
  const g = buildGraph([
    P('elitsafan', 'Елцафан'),
    P('shemaiya', 'Шемаия', { otherParents: [{ id: 'elitsafan', role: 'father', kind: 'ancestor', refs: ['1Пар 15:8'], cert: 'scripture' }] }),
  ]);
  it('называется «потомок», а не «сын»', () => {
    const r = relate(g, 'shemaiya', 'elitsafan');
    expect(r[0]?.term).toBe('потомок');
    expect(relate(g, 'elitsafan', 'shemaiya')[0]?.term).toBe('предок');
  });
  it('не притягивает год рождения к одному поколению после предка', () => {
    const withYears = buildGraph([
      P('elitsafan', 'Елцафан', { chrono: { born: { year: -1480 } } }),
      P('shemaiya', 'Шемаия', { otherParents: [{ id: 'elitsafan', role: 'father', kind: 'ancestor', refs: ['1Пар 15:8'], cert: 'scripture' }], chrono: { active: { from: -1000, to: -1000, refs: ['1Пар 15:8'] } } }),
    ]);
    const res = solveChronology(withYears, epochs, 'mt-long');
    expect(toHist(res.persons.get('shemaiya')!.b)).toBeGreaterThan(-1100);
  });
});
