/**
 * Решатель хронологии: честные даты (A14, A15; MAP-12, 13, 22) и синхронизмы царей (MAP-47).
 *  — жена стоит не в год рождения мужа, а по рождению своих детей;
 *  — умерший младенцем не получает выдуманной жизни, у него признак infant;
 *  — интервал рождения не выходит за допустимый интервал данных; интервал смерти по одному лишь допустимому интервалу —
 *    сам этот интервал;
 *  — синхронизмы «в N-й год X воцарился Y» стоят в данных со стихами, где есть и оба имени, и само порядковое число.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Epoch, Volume } from '../src/data/types.ts';
import { buildGraph } from '../src/engine/graph.ts';
import { solveChronology, ordinalStem } from '../src/engine/chronology.ts';
import { toAstro } from '../src/engine/years.ts';
import epochsJson from '../data/epochs.json' with { type: 'json' };

const epochs = epochsJson as Epoch[];

function allPersons(): Person[] {
  const out: Person[] = [];
  const seen = new Set<string>();
  const dir = join(__dirname, '../data/persons');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const v = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Volume;
    for (const p of v.persons) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
  }
  return out;
}

/** Царь с годом рождения по возрасту при воцарении, две жены с детьми, бездетная жена и младенец. */
function kingFixture(): Person[] {
  const P = (x: Partial<Person> & { id: string }): Person => ({ name: x.id, sex: 'm', group: 'davidic', prominence: 2, ...x }) as Person;
  return [
    P({ id: 'king', chrono: { epoch: 'united', born: { year: -1040, refs: ['2Цар 5:4'] }, died: { year: -970, refs: ['3Цар 2:11'] } } }),
    P({ id: 'wife-a', sex: 'f', spouses: [{ id: 'king', kind: 'husband', refs: ['2Цар 3:2'] }], chrono: { epoch: 'united' } }),
    P({ id: 'wife-b', sex: 'f', spouses: [{ id: 'king', kind: 'husband', refs: ['2Цар 3:3'] }], chrono: { epoch: 'united' } }),
    P({ id: 'wife-c', sex: 'f', spouses: [{ id: 'king', kind: 'husband', refs: ['2Цар 6:23'] }], chrono: { epoch: 'united' } }),
    P({ id: 'son-a', father: 'king', mother: 'wife-a', parentRefs: ['2Цар 3:2'], chrono: { born: { range: [-995, -990], refs: ['2Цар 3:2'] } } }),
    P({ id: 'son-b', father: 'king', mother: 'wife-b', parentRefs: ['2Цар 3:3'], chrono: { born: { range: [-1000, -990], refs: ['2Цар 5:14'] } } }),
    P({
      id: 'baby', father: 'king', mother: 'wife-b', parentRefs: ['2Цар 12:15'],
      chrono: { born: { range: [-1003, -970], refs: ['2Цар 11:27'] }, died: { age: 0, range: [-1003, -970], refs: ['2Цар 12:18'] } },
    }),
    P({ id: 'soldier', chrono: { epoch: 'united', died: { range: [-1003, -970], refs: ['2Цар 11:17'] } } }),
  ];
}

describe('решатель: жёны и дети (A15; MAP-22)', () => {
  const res = solveChronology(buildGraph(kingFixture()), epochs);
  const b = (id: string) => res.persons.get(id)!.b;
  it('год рождения жены выводится из рождения её детей, а не из года мужа', () => {
    // сын родился в 995–990 гг., когда царю было за 45: мать — не ровесница мужа (прежде — ровно муж + 3 года)
    expect(b('wife-a') - b('king')).toBeGreaterThan(15);
    expect(b('son-a') - b('wife-a')).toBeGreaterThanOrEqual(14);
    expect(b('son-a') - b('wife-a')).toBeLessThanOrEqual(35);
    expect(b('son-b') - b('wife-b')).toBeGreaterThanOrEqual(14);
    expect(b('son-b') - b('wife-b')).toBeLessThanOrEqual(35);
  });
  it('бездетная жена без иных сведений остаётся около мужа, с широким интервалом', () => {
    const c = res.persons.get('wife-c')!;
    expect(Math.abs(c.b - (b('king') + 3))).toBeLessThan(6);
    expect(c.cls).toBe('estimated');
    expect(c.bHi - c.bLo).toBeGreaterThan(30);
  });
});

describe('решатель: умерший младенцем (A15; MAP-13)', () => {
  const res = solveChronology(buildGraph(kingFixture()), epochs);
  const c = res.persons.get('baby')!;
  it('умер в год рождения, признак infant', () => {
    expect(c.d).not.toBeNull();
    expect(Math.abs(c.d! - c.b)).toBeLessThan(0.5);
    expect(c.infant).toBe(true);
    expect(res.persons.get('son-a')!.infant).toBeUndefined();
  });
  it('интервал смерти — тот же, что интервал рождения', () => {
    expect(c.dLo).toBeCloseTo(c.bLo, 5);
    expect(c.dHi).toBeCloseTo(c.bHi, 5);
  });
  it('интервал рождения не выходит за допустимый интервал данных', () => {
    // граница мягкая: оценка может выйти за неё на доли года, интервал — нет (кроме самой оценки)
    expect(c.bLo).toBeGreaterThanOrEqual(Math.min(toAstro(-1003), c.b));
    expect(c.bHi).toBeLessThanOrEqual(Math.max(toAstro(-970), c.b));
    expect(c.bHi - c.bLo).toBeLessThanOrEqual(toAstro(-970) - toAstro(-1003) + 1);
    expect(c.bLo).toBeLessThanOrEqual(c.b);
    expect(c.bHi).toBeGreaterThanOrEqual(c.b);
  });
});

describe('решатель: смерть только по допустимому интервалу (A14)', () => {
  const res = solveChronology(buildGraph(kingFixture()), epochs);
  it('интервал смерти — сам допустимый интервал, не раньше рождения', () => {
    const c = res.persons.get('soldier')!;
    expect(c.dLo).toBe(Math.max(toAstro(-1003), c.b));
    expect(c.dHi).toBe(toAstro(-970));
    expect(c.d! >= c.dLo! && c.d! <= c.dHi!).toBe(true);
  });
});

describe('решатель на данных атласа (A15)', () => {
  const persons = allPersons();
  const g = buildGraph(persons);
  const res = solveChronology(g, epochs);
  const b = (id: string) => res.persons.get(id)!.b;
  it('Лия и Рахиль — не ровесницы Иакова: их годы следуют из рождения их сыновей', () => {
    expect(b('liya') - b('iakov')).toBeGreaterThan(20);
    expect(b('rakhil') - b('iakov')).toBeGreaterThan(20);
    expect(b('ruvim') - b('liya')).toBeGreaterThanOrEqual(14);
    expect(b('iosif') - b('rakhil')).toBeGreaterThanOrEqual(14);
  });
  it('жёны датированных мужей не прилипают к «муж + 3»: их год следует из рождения детей', () => {
    // прежде решатель ставил жён Давида, Иакова, Исава ровно в «муж + 3 года» (MAP-22)
    let stuck = 0;
    let total = 0;
    for (const [id, edges] of g.spousesOf) {
      for (const e of edges) {
        if (e.b !== id || !(g.childrenOf.get(id) ?? []).some((c) => c.kind === 'mother')) continue;
        const w = res.persons.get(id)!;
        const h = res.persons.get(e.a)!;
        if (w.cls !== 'estimated' || (h.cls !== 'exact' && h.cls !== 'calculated')) continue;
        total++;
        if (Math.abs(w.b - (h.b + 3)) < 1) stuck++;
      }
    }
    expect(total).toBeGreaterThan(15);
    expect(stuck / total).toBeLessThan(0.15);
  });
  it('у умерших младенцами, если возраст 0 записан в данных, нет выдуманной жизни', () => {
    for (const p of persons) {
      if (p.chrono?.died?.age === undefined || p.chrono.died.age >= 2) continue;
      const c = res.persons.get(p.id)!;
      expect(c.infant, p.id).toBe(true);
      expect(Math.abs(c.d! - c.b), p.id).toBeLessThan(2);
    }
  });
});

describe('синхронизмы воцарения (MAP-47)', () => {
  const persons = allPersons();
  const byId = new Map(persons.map((p) => [p.id, p]));
  const bible = new Map<string, string>();
  for (const line of readFileSync(join(__dirname, '../tools/bible/synodal.tsv'), 'utf8').split('\n')) {
    const [book, ch, v, t] = line.split('\t');
    if (t) bible.set(`${book} ${ch}:${v}`, t);
  }
  const syncs = persons.flatMap((p) => (p.chrono?.reign ?? []).flatMap((r) => (r.sync ?? []).map((s) => ({ p, r, s }))));
  it('есть у царей Иудеи и Израиля от Авии до Езекии и Осии, у Седекии и Навуходоносора', () => {
    const kings = new Set(syncs.map((x) => x.p.id));
    for (const id of ['aviya', 'asa', 'iosafat', 'ioram-syn-iosafata', 'okhoziya-syn-iorama', 'ioas-syn-okhozii', 'amasiya', 'oziya', 'ioafam', 'akhaz', 'ezekiya', 'sedekiya'])
      expect(kings.has(id), id).toBe(true);
    for (const id of ['navat-syn-ieroboama', 'vaasa', 'ila-syn-vaasy', 'zamvriy', 'amvriy', 'akhav', 'okhoziya-syn-akhava', 'ioram-syn-akhava', 'ioakhaz-syn-iiuya', 'ioas-syn-ioakhaza', 'ieroboam-vtoroy', 'zakhariya-syn-ieroboama', 'sellum-syn-iavisa', 'menaim', 'fakiya', 'fakey', 'osiya-syn-ily'])
      expect(kings.has(id), id).toBe(true);
    expect(kings.has('navukhodonosor')).toBe(true);
  });
  it('3 Цар 15:1: в восемнадцатый год Иеровоама воцарился Авия', () => {
    const s = syncs.find((x) => x.p.id === 'aviya')!.s;
    expect(s).toMatchObject({ with: 'ieroboam', year: 18 });
    expect(s.refs).toContain('3Цар 15:1');
  });
  it('у каждого синхронизма — царствующий партнёр и стих с порядковым числом', () => {
    const expand = (ref: string): string[] => {
      const m = /^(\S+) (\d+):(\d+)(?:-(\d+))?$/.exec(ref)!;
      const out: string[] = [];
      for (let v = Number(m[3]); v <= Number(m[4] ?? m[3]); v++) out.push(bible.get(`${m[1]} ${m[2]}:${v}`) ?? '');
      return out;
    };
    for (const { p, s } of syncs) {
      const partner = byId.get(s.with);
      expect(partner?.chrono?.reign?.length, `${p.id} → ${s.with}`).toBeGreaterThan(0);
      const text = s.refs.flatMap(expand).join(' ').toLowerCase().replace(/ё/g, 'е');
      expect(text, `${p.id}: ${s.refs.join('; ')}`).toContain(ordinalStem(s.year)!);
    }
  });
  it('основа порядкового числа — как в Синодальном тексте', () => {
    expect(ordinalStem(2)).toBe('втор');
    expect(ordinalStem(18)).toBe('восемнадцат');
    expect(ordinalStem(27)).toBe('двадцать седьм');
    expect(ordinalStem(39)).toBe('тридцать девят');
    expect(ordinalStem(50)).toBe('пятидесят');
    expect(ordinalStem(52)).toBe('пятьдесят втор');
  });
});
