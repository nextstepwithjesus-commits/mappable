/**
 * Раскладка неба на данных атласа (этап 4): скопления списков без родства (E2), честный конец следа (A14),
 * соседство по родству словами Писания (E5), контуры созвездий (E8), атласные координаты (E9).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Epoch, Volume } from '../src/data/types.ts';
import { buildGraph } from '../src/engine/graph.ts';
import { solveChronology } from '../src/engine/chronology.ts';
import {
  computeLayout, computeOutlines, listMembers, clusterCells, firstRefOf, atlasColumn, atlasColumnSpan, atlasRow, atlasRowLanes,
  atlasRowLetter, atlasCoord, ATLAS_LETTERS, CLUSTER_MIN, type ListDef, type LineStep,
} from '../src/engine/layout.ts';
import { buildTimeScale, timeToX, xToTime } from '../src/engine/timescale.ts';
import { parseRef, verseId } from '../src/engine/books.ts';
import { toAstro } from '../src/engine/years.ts';
import epochsJson from '../data/epochs.json' with { type: 'json' };

const epochs = epochsJson as Epoch[];
const root = join(__dirname, '..');
const persons: Person[] = [];
{
  const seen = new Set<string>();
  for (const f of readdirSync(join(root, 'data/persons')).filter((x) => x.endsWith('.json')).sort()) {
    const v = JSON.parse(readFileSync(join(root, 'data/persons', f), 'utf8')) as Volume;
    for (const p of v.persons) if (!seen.has(p.id)) { seen.add(p.id); persons.push(p); }
  }
}
const lists = (JSON.parse(readFileSync(join(root, 'data/lists.json'), 'utf8')) as { lists: ListDef[] }).lists;
const line = (f: string) => (JSON.parse(readFileSync(join(root, `data/lines/${f}.json`), 'utf8')) as { persons: LineStep[] }).persons;
const g = buildGraph(persons);
const lines = { joseph: line('joseph').filter((s) => g.persons.has(s.id)), mary: line('mary').filter((s) => g.persons.has(s.id)) };
const chrono = solveChronology(g, epochs);
const L = computeLayout(g, chrono, lines, { lists, epochs });
const node = (id: string) => L.byPerson.get(id)!;
const clusters = L.blocks.filter((b) => b.cluster);
const clusterOf = (id: string) => clusters.find((b) => b.cluster!.members.includes(id))?.cluster;

describe('скопления списков без родства (E2)', () => {
  it('храбрые Давида — одно скопление со стихами списка и числом имён', () => {
    const c = clusters.find((b) => b.cluster!.list === 'heroes-david')!.cluster!;
    expect(c.name).toBe('Храбрые Давида');
    expect(c.refs).toContain('2Цар 23:8-39');
    expect(c.count).toBeGreaterThan(40);
    expect(c.members.length).toBeGreaterThanOrEqual(c.count);
    // Елика Арадянин (2 Цар 23:25) — в скоплении; Ванея, сын Иодая, — лицо с повествованием и семьёй — нет;
    // Асаил — сын Саруии, в своей семье
    expect(clusterOf('elika')?.list).toBe('heroes-david');
    expect(clusterOf('vaneya-syn-iodaya')).toBeUndefined();
    expect(clusterOf('asail')).toBeUndefined();
  });
  it('отец, названный только по сыну («Ира, сын Икеша»), стоит в скоплении над сыном, с отводом', () => {
    const ira = persons.find((p) => p.name === 'Ира' && p.father && g.persons.get(p.father)!.name === 'Икеш')!;
    const c = clusterOf(ira.id)!;
    const cf = c.cells.find((x) => x.id === ira.father)!;
    const cs = c.cells.find((x) => x.id === ira.id)!;
    expect(cf.patronym).toBe(true);
    expect(cf.col).toBe(cs.col);
    expect(cs.row).toBe(cf.row + 1);
    expect(node(ira.id).parentLane).toBe(node(ira.father!).lane);
    expect(c.count).toBe(c.cells.filter((x) => !x.patronym).length);
  });
  it('лицо скопления: без родителей по крови (кроме названного по сыну отца), детей и супругов, значимость 1–2, первое упоминание — в списке', () => {
    const verses = new Map(lists.map((l) => [l.id, new Set(l.refs.flatMap((r) => parseRef(r)!.verses.map(verseId)))]));
    let n = 0;
    for (const b of clusters) {
      const c = b.cluster!;
      for (const cell of c.cells) {
        const p = g.persons.get(cell.id)!;
        n++;
        expect(p.prominence, cell.id).toBeLessThanOrEqual(2);
        expect(g.spousesOf.get(cell.id) ?? [], cell.id).toEqual([]);
        expect(p.mother ?? null, cell.id).toBeNull();
        if (cell.patronym) continue;
        const first = parseRef(firstRefOf(p)!)!.verses[0];
        expect(verses.get(c.list)!.has(verseId(first)), `${cell.id}: ${firstRefOf(p)}`).toBe(true);
        expect((g.childrenOf.get(cell.id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother'), cell.id).toEqual([]);
      }
      expect(c.count).toBeGreaterThanOrEqual(CLUSTER_MIN);
    }
    expect(n).toBeGreaterThan(500);
  });
  it('у лиц скоплений нет следов и выдуманных дат: узел — клетка сетки, след «list»', () => {
    for (const b of clusters) {
      const c = b.cluster!;
      for (const cell of c.cells) {
        const n = node(cell.id);
        expect(n.trail).toBe('list');
        expect(n.t1).toBe(n.t0);
        expect(n.lane).toBe(c.rowLanes[cell.row]);
        expect(n.t0).toBeCloseTo(c.t0 + (cell.col + 0.5) * c.pitch, 6);
        expect(n.block).toBe(b.id);
      }
    }
  });
  it('блок скопления занимает мало высоты: строка подписи и не больше пяти строк имён', () => {
    for (const b of clusters) {
      const c = b.cluster!;
      expect(c.rows).toBeLessThanOrEqual(5);
      expect(b.laneMax - b.laneMin).toBe(c.rows);
      expect(c.labelLane).toBe(b.laneMax);
      expect(Math.abs(c.tc - (c.span[0] + c.span[1]) / 2)).toBeLessThanOrEqual(0.5);
      expect(Number.isInteger(c.t0) && Number.isInteger(c.tc)).toBe(true);
      expect(c.t0 < c.tc && c.tc < c.t1).toBe(true);
    }
  });
  it('в полосах скопления, в его годы, нет чужих звёзд и следов', () => {
    for (const b of clusters) {
      const c = b.cluster!;
      const own = new Set(c.members);
      for (const n of L.nodes) {
        if (own.has(n.person) || n.lane < b.laneMin || n.lane > b.laneMax) continue;
        expect(n.t1 < c.t0 || n.t0 > c.t1, `${n.id} в скоплении ${c.list}`).toBe(true);
      }
    }
  });
  it('время скопления — по данным: храбрые Давида — при царствовании Давида', () => {
    const c = clusters.find((b) => b.cluster!.list === 'heroes-david')!.cluster!;
    expect(c.spanFrom).toEqual({ kind: 'during', id: 'david' });
    expect(c.span).toEqual([toAstro(-1010), toAstro(-970)]);
  });
  it('сетка: по столбцам, отец и сыновья — в одном столбце подряд', () => {
    const { rows, cols, cells } = clusterCells([
      { father: null, persons: ['a'] }, { father: 'f', persons: ['b', 'c'] }, { father: null, persons: ['d'] }, { father: null, persons: ['e'] },
    ]);
    expect(rows).toBe(3);
    expect(cells).toEqual([
      { id: 'a', row: 0, col: 0 }, { id: 'f', row: 0, col: 1, patronym: true }, { id: 'b', row: 1, col: 1 }, { id: 'c', row: 2, col: 1 },
      { id: 'd', row: 0, col: 2 }, { id: 'e', row: 1, col: 2 },
    ]);
    expect(cols).toBe(3);
  });
  it('скопления сократили высоту неба: полос меньше 360 (было 489)', () => {
    expect(L.metrics.lanes).toBeLessThan(360);
    expect(L.metrics.clusters).toBe(clusters.length);
    expect(listMembers(g, lists, new Set([...lines.joseph, ...lines.mary].map((s) => s.id))).size).toBe(clusters.length);
  });
});

describe('честный конец следа (A14)', () => {
  it('след не длиннее данных: до смерти, иначе до последнего события, иначе только звезда', () => {
    for (const n of L.nodes) {
      if (n.ghost) {
        expect(n.trail).toBe('ghost');
        expect(n.t1).toBe(n.t0);
        continue;
      }
      const c = chrono.persons.get(n.person)!;
      const p = g.persons.get(n.person)!;
      if (n.trail === 'list') continue;
      if (p.kind === 'people' || p.kind === 'clan') {
        expect(n.trail, n.id).toBe('people');
        expect(n.t1).toBe(n.t0);
      } else if (c.infant) {
        expect(n.trail).toBe('infant');
        expect(n.t1).toBe(n.t0);
      } else if (c.cls === 'epochal') {
        // «время не установлено» (MAP-52): следа нет, знак — в середине скобки bLo…bHi, а не в её начале
        expect(n.trail, n.id).toBe('epochal');
        expect(n.t1).toBe(n.t0);
        expect(n.t0).toBeCloseTo((c.bLo + c.bHi) / 2, 6);
      } else {
        expect(n.trail).toBe('life');
        const died = p.chrono?.died;
        const rangeOnly = !!died?.range && died.age === undefined && died.year === undefined;
        // смерть в допустимом интервале: уверенная жизнь — до начала интервала или последнего события
        const end = rangeOnly ? Math.max(c.dLo!, c.lastAttested ?? -Infinity) : (c.d ?? c.lastAttested ?? c.b);
        expect(n.t1, n.id).toBeCloseTo(Math.max(c.b, end), 6);
        expect(n.t1, n.id).toBeLessThanOrEqual(Math.max(c.b, c.dHi ?? c.d ?? c.lastAttested ?? c.b) + 1e-6);
      }
    }
  });
  it('условного 30-летнего следа нет: у лиц без смерти и событий t1 = t0', () => {
    const bare = L.nodes.filter((n) => !n.ghost && n.trail === 'life' && chrono.persons.get(n.person)!.d === null && chrono.persons.get(n.person)!.lastAttested === null);
    expect(bare.length).toBeGreaterThan(100);
    for (const n of bare) expect(n.t1).toBe(n.t0);
  });
  it('сын Давида и Вирсавии, умерший младенцем, не получает 33 лет сплошного следа', () => {
    const n = node('mladenets-syn-virsavii');
    const c = chrono.persons.get('mladenets-syn-virsavii')!;
    expect(n.t1 - n.t0).toBeLessThan(2);
    // без возраста при смерти в данных конец неуверенный: интервал смерти — «в царствование Давида»
    if (!c.infant) expect(c.dHi! - c.dLo!).toBeGreaterThan(20);
  });
  it('народы таблицы народов — без следа', () => {
    expect(g.persons.get('ludim')!.kind).toBe('people');
    expect(node('ludim').trail).toBe('people');
    expect(node('ludim').t1).toBe(node('ludim').t0);
  });
});

describe('соседство по родству словами Писания (E5; П-8)', () => {
  it('Саруия, сестра Давида, стоит рядом с Давидом, но без отвода от него', () => {
    const b = L.blocks[node('saruiya').block];
    expect(b.near).toBe('david');
    expect(b.attach).toBeNull();
    expect(node('saruiya').parentLane).toBeNull();
    expect(Math.abs(node('saruiya').lane - node('david').lane)).toBeLessThan(35);
  });
  it('братья Господни — рядом с Иисусом', () => {
    for (const id of ['iakov-brat-gospoden', 'iosiy-brat-gospoden', 'simon-brat-gospoden', 'iuda-brat-gospoden']) {
      expect(L.blocks[node(id).block].near, id).toBe('iisus');
      expect(Math.abs(node(id).lane - node('iisus').lane), id).toBeLessThan(15);
    }
  });
});

describe('контуры созвездий (E8)', () => {
  const births = L.nodes.filter((n) => !n.ghost).map((n) => n.t0);
  const scale = buildTimeScale(births, L.nodes.map((n) => [n.t0, n.t1] as [number, number]));
  const groups = JSON.parse(readFileSync(join(root, 'data/groups.json'), 'utf8')) as { id: string; parent?: string }[];
  const parents: Record<string, string> = Object.fromEntries(groups.filter((x) => x.parent).map((x) => [x.id, x.parent!]));
  const outlines = computeOutlines(g, L, (t) => timeToX(scale, t, 1), (x) => xToTime(scale, x, 1), parents);
  /** Точка внутри набора колец (чётно-нечётное правило). */
  const inside = (rings: [number, number][][], t: number, lane: number) => {
    let c = false;
    for (const r of rings)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [ti, li] = r[i];
        const [tj, lj] = r[j];
        if (li > lane !== lj > lane && t < ((tj - ti) * (lane - li)) / (lj - li) + ti) c = !c;
      }
    return c;
  };
  const regionGroup = (n: (typeof L.nodes)[number]) =>
    n.spine || n.ghost || L.blocks[n.block]?.cluster ? null : n.satelliteOf ? g.persons.get(n.satelliteOf)!.group : g.persons.get(n.person)!.group;
  /** Лицо — в созвездии: своё созвездие или его дом (у колена). */
  const inGroup = (n: (typeof L.nodes)[number], gid: string) => {
    const gr = regionGroup(n);
    return !!gr && (gr === gid || parents[gr] === gid);
  };

  it('один контур на связную часть созвездия, а не на каждый приток', () => {
    expect(outlines.length).toBeGreaterThan(40);
    expect(outlines.length).toBeLessThan(L.blocks.filter((b) => !b.cluster && b.size >= 3).length);
    // у каждого созвездия с 20 и больше лицами на небе есть контур
    const count = new Map<string, number>();
    for (const n of L.nodes) {
      const gr = regionGroup(n);
      if (gr) count.set(gr, (count.get(gr) ?? 0) + 1);
    }
    for (const [gid, k] of count) if (k >= 20) expect(outlines.some((o) => o.group === gid), gid).toBe(true);
    // дом вложен в колено
    expect(outlines.some((o) => o.group === 'davidic' && o.parent === 'judah')).toBe(true);
  });
  it('звёзды части созвездия — внутри её контура', () => {
    for (const o of outlines) {
      let k = 0;
      for (const n of L.nodes) if (inGroup(n, o.group) && inside(o.rings, n.t0, n.lane)) k++;
      expect(k, o.group).toBeGreaterThanOrEqual(o.size);
    }
    // вне контуров — только лица одиночных притоков у коридора и частей меньше пяти лиц
    let total = 0;
    let out = 0;
    for (const n of L.nodes) {
      const gr = regionGroup(n);
      if (!gr) continue;
      total++;
      if (!outlines.some((o) => (o.group === gr || o.group === parents[gr]) && inside(o.rings, n.t0, n.lane))) out++;
    }
    expect(out / total).toBeLessThan(0.3);
  });
  it('чужие звёзды почти не попадают в контур', () => {
    let foreign = 0;
    let checked = 0;
    for (const o of outlines)
      for (const n of L.nodes) {
        if (inGroup(n, o.group) || (o.parent && inGroup(n, o.parent))) continue;
        checked++;
        if (inside(o.rings, n.t0, n.lane)) foreign++;
      }
    expect(foreign / checked).toBeLessThan(0.002);
  });
  it('место под название — внутри контура и без звёзд', () => {
    for (const o of outlines)
      for (const s of o.slots) {
        expect(s.t1).toBeGreaterThan(s.t0);
        expect(inside(o.rings, (s.t0 + s.t1) / 2, s.lane), `${o.group} ${JSON.stringify(s)}`).toBe(true);
        for (const n of L.nodes) {
          if (Math.abs(n.lane - s.lane) >= s.h / 2) continue;
          expect(n.t0 < s.t0 || n.t0 > s.t1, `${o.group}: ${n.id} в месте под название`).toBe(true);
        }
      }
  });
});

describe('атласные координаты (E9)', () => {
  it('столбцы — века от 4200 г. до Р. Х., без нулевого года', () => {
    expect(atlasColumn(toAstro(-4200))).toBe(1);
    expect(atlasColumn(toAstro(-4101))).toBe(1);
    expect(atlasColumn(toAstro(-4100))).toBe(2);
    expect(atlasColumn(toAstro(-1))).toBe(42);
    expect(atlasColumn(1)).toBe(43);
    expect(atlasColumn(100)).toBe(43);
    expect(atlasColumn(101)).toBe(44);
    for (const c of [1, 20, 42, 43, 63]) {
      const [a, b] = atlasColumnSpan(c);
      expect(atlasColumn(a)).toBe(c);
      expect(atlasColumn(b - 1)).toBe(c);
      expect(atlasColumn(b)).toBe(c + 1);
    }
  });
  it('строки отсчитаны от оси коридора: «П» — ось, буквы не зависят от края неба', () => {
    expect(atlasRowLetter(atlasRow(0))).toBe('П');
    const [lo, hi] = atlasRowLanes(atlasRow(0));
    expect(lo).toBe(-hi);
    expect(atlasRowLetter(atlasRow(hi + 1))).toBe('Н');
    expect(atlasRowLetter(atlasRow(lo - 1))).toBe('Р');
    for (let r = -2; r < 28; r++) {
      const [a, b] = atlasRowLanes(r);
      expect(atlasRow(a)).toBe(r);
      expect(atlasRow(b)).toBe(r);
    }
    expect(atlasRowLetter(-1)).toBe('Я0');
    expect(atlasRowLetter(ATLAS_LETTERS.length)).toBe('А2');
  });
  it('25 букв покрывают всё небо: у строк нет номера круга', () => {
    expect(atlasRow(L.laneMax)).toBeGreaterThanOrEqual(0);
    expect(atlasRow(L.laneMin)).toBeLessThan(ATLAS_LETTERS.length);
  });
  it('координата лица — столбец и буква', () => {
    const d = node('david');
    expect(atlasCoord(d.t0, d.lane)).toBe(`${atlasColumn(d.t0)} П`);
    expect(atlasColumn(d.t0)).toBe(32); // 1040 г. до Р. Х. — в столбце 1100–1001 гг. до Р. Х.
  });
});
