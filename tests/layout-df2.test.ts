/**
 * Раскладка, этап 11 (DF2): априорное условие (ТЗ § 8.3, п. 5; NFR-3) — полосы опорных лиц прежнего выпуска
 * (data/coords-snapshot.json, src/engine/layout.ts, п. 8):
 *  — без правок данных условие ничего не меняет (раскладка та же узел в узел);
 *  — блок с опорными лицами стоит на прежней стороне, даже если другая сторона ближе;
 *  — после правок данных и хронологии этапа 11 стороны созвездий те же, а опорные лица сдвигаются по полосе только там,
 *    где этого требует непересечение жизней (Симеон — на полосу: Кааф родился теперь до прихода в Египет);
 *  — внутри притока братья с опорными лицами стоят в прежнем порядке (Кааф ближе к Левию, чем Мерари).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Epoch, Volume } from '../src/data/types.ts';
import { buildGraph } from '../src/engine/graph.ts';
import { solveChronology, type ChronoResult } from '../src/engine/chronology.ts';
import { computeLayout, type LayoutResult, type LineStep, type ListDef } from '../src/engine/layout.ts';
import epochsJson from '../data/epochs.json' with { type: 'json' };

const epochs = epochsJson as Epoch[];
const ROOT = join(__dirname, '..');
const read = <T,>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

describe('приток с опорными лицами — на прежней стороне', () => {
  // коридор Адам — Сиф — Енос; приток — Каин с сыном. Без условия приток встаёт на сторону Адама (ближе к месту
  // прикрепления); условие ставит его на сторону из снимка, даже когда другая сторона ближе.
  const P = (x: Partial<Person> & { id: string }): Person => ({ name: x.id, sex: 'm', group: 'sethites', prominence: 3, ...x }) as Person;
  const people: Person[] = [
    P({ id: 'adam', chrono: { born: { year: -4174, refs: ['Быт 5:3'] }, died: { age: 930, refs: ['Быт 5:5'] } } }),
    P({ id: 'sif', father: 'adam', parentRefs: ['Быт 5:3'], chrono: { born: { fatherAge: 130, refs: ['Быт 5:3'] }, died: { age: 912, refs: ['Быт 5:8'] } } }),
    P({ id: 'enos', father: 'sif', parentRefs: ['Быт 5:6'], chrono: { born: { fatherAge: 105, refs: ['Быт 5:6'] }, died: { age: 905, refs: ['Быт 5:11'] } } }),
    P({ id: 'kain', father: 'adam', parentRefs: ['Быт 4:1'], group: 'cainites', chrono: { epoch: 'antediluvian' } }),
    P({ id: 'enokh-k', father: 'kain', parentRefs: ['Быт 4:17'], group: 'cainites', chrono: { epoch: 'antediluvian' } }),
  ];
  const g = buildGraph(people);
  const res = solveChronology(g, epochs);
  const steps = ['adam', 'sif', 'enos'].map((id) => ({ id, refs: [], flag: 'in-text' }));
  const free = computeLayout(g, res, { joseph: steps, mary: steps });
  const lane = (L: LayoutResult, id: string) => L.byPerson.get(id)!.lane;
  const sf = Math.sign(lane(free, 'kain'));
  const d = lane(free, 'enokh-k') - lane(free, 'kain');
  it('без условия — на стороне Адама, к которому прикреплён приток', () => {
    expect(sf).not.toBe(0);
    expect(sf).toBe(Math.sign(lane(free, 'adam')));
  });
  it('с условием на другой стороне — приток там, хотя своя сторона ближе; сын зеркально относительно отца', () => {
    const L = computeLayout(g, res, { joseph: steps, mary: steps }, { prior: [{ id: 'kain', lane: -4 * sf }] });
    expect(lane(L, 'kain')).toBe(-4 * sf);
    expect(lane(L, 'enokh-k')).toBe(-4 * sf - d);
    expect(L.blocks.find((b) => b.root === 'kain')!.side).toBe(-sf);
  });
  it('с условием на той же стороне — прежняя полоса, если она свободна, а не первая свободная', () => {
    const L = computeLayout(g, res, { joseph: steps, mary: steps }, { prior: [{ id: 'kain', lane: 4 * sf }] });
    expect(lane(L, 'kain')).toBe(4 * sf);
    expect(lane(L, 'enokh-k')).toBe(4 * sf + d);
    expect(L.blocks.find((b) => b.root === 'kain')!.side).toBe(sf);
  });
});

describe('опорные лица на всех данных (data/coords-snapshot.json)', () => {
  function allPersons(): Person[] {
    const out: Person[] = [];
    const seen = new Set<string>();
    const dir = join(ROOT, 'data/persons');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const v = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Volume;
      for (const p of v.persons) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
    }
    return out;
  }
  const g = buildGraph(allPersons());
  const lines = {
    joseph: read<{ persons: LineStep[] }>('data/lines/joseph.json').persons.filter((s) => g.persons.has(s.id)),
    mary: read<{ persons: LineStep[] }>('data/lines/mary.json').persons.filter((s) => g.persons.has(s.id)),
  };
  const lists = read<{ lists: ListDef[] }>('data/lists.json').lists;
  const snap = read<{ persons: { id: string; lane: number }[] }>('data/coords-snapshot.json').persons.filter((s) => g.persons.has(s.id));
  const spine = new Set([...lines.joseph, ...lines.mary].map((s) => s.id));
  let res: ChronoResult;
  let free: LayoutResult;
  let kept: LayoutResult;
  beforeAll(() => {
    res = solveChronology(g, epochs, 'mt-long');
    free = computeLayout(g, res, lines, { lists, epochs: res.epochs ?? epochs });
    kept = computeLayout(g, res, lines, { lists, epochs: res.epochs ?? epochs, prior: snap });
  }, 120_000);

  it('условие из собственной раскладки ничего не меняет: узлы и метрики те же', () => {
    for (const ids of [snap.map((s) => s.id), free.nodes.filter((n) => !n.ghost).map((n) => n.person)]) {
      const prior = ids.filter((id) => free.byPerson.has(id)).map((id) => ({ id, lane: free.byPerson.get(id)!.lane }));
      const L = computeLayout(g, res, lines, { lists, epochs: res.epochs ?? epochs, prior });
      expect(L.nodes.map((n) => `${n.id}:${n.lane}`)).toEqual(free.nodes.map((n) => `${n.id}:${n.lane}`));
      expect(L.metrics).toEqual(free.metrics);
    }
  });
  it('стороны созвездий с опорными лицами — как в снимке; сдвиг по полосе — в среднем меньше полосы', () => {
    const flips: string[] = [];
    let moved = 0;
    let n = 0;
    for (const s of snap) {
      if (spine.has(s.id)) continue;
      const node = kept.byPerson.get(s.id);
      if (!node) continue;
      n++;
      if (Math.sign(node.lane) !== Math.sign(s.lane)) flips.push(`${s.id}: ${s.lane} → ${node.lane}`);
      moved += Math.abs(node.lane - s.lane);
    }
    expect(flips).toEqual([]);
    expect(moved / n).toBeLessThan(1);
  });
  it('в роду Левия прежний порядок: Кааф ближе к Левию, чем Мерари, как в снимке', () => {
    const lane = (id: string) => snap.find((s) => s.id === id)?.lane;
    if (lane('kaaf') === undefined || lane('merari') === undefined || lane('leviy') === undefined) return;
    const was = Math.abs(lane('kaaf')! - lane('leviy')!) < Math.abs(lane('merari')! - lane('leviy')!);
    const L = (id: string) => kept.byPerson.get(id)!.lane;
    expect(Math.abs(L('kaaf') - L('leviy')) < Math.abs(L('merari') - L('leviy'))).toBe(was);
  });
  it('правила укладки те же: в одной полосе следы не пересекаются', () => {
    const byLane = new Map<number, [number, number, string][]>();
    const bad: string[] = [];
    for (const nd of kept.nodes) {
      if (nd.trail !== 'life' || nd.t1 <= nd.t0) continue;
      const a = byLane.get(nd.lane) ?? [];
      for (const [s, e, id] of a) if (nd.t0 < e && s < nd.t1) bad.push(`${id} и ${nd.id} на полосе ${nd.lane}`);
      a.push([nd.t0, nd.t1, nd.id]);
      byLane.set(nd.lane, a);
    }
    expect(bad).toEqual([]);
  });
});
