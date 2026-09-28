/**
 * Ярусы эпох, этап 7 (K6): пророки без годов служения в данных (MAP-48), синхронизмы (MAP-47), подписи отрезков
 * и событий (VIS-26, MAP-47), формула относительной хронологии на краях столбца (ТЗ § 3.5; MAP-48).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

let tiers: typeof import('../src/render/tiers.ts');
let atlas: typeof import('../src/data/atlas.ts');
let years: typeof import('../src/engine/years.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  tiers = await import('../src/render/tiers.ts');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
});

/** Карточка лица из данных (тома data/persons): то, что приходит из тома карточек в браузере. */
function cardOf(id: string) {
  const dir = join(__dirname, '../data/persons');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const p = (Array.isArray(d) ? d : d.persons).find((x: { id: string }) => x.id === id);
    if (p) return p.card;
  }
  return null;
}

describe('пророки в ярусе (MAP-48)', () => {
  it('годы служения из данных — как прежде', () => {
    const m = atlas.models[0];
    const p = atlas.byId.get('isaiya')!;
    const w = tiers.ministryOf(p.active, m.chrono.get('isaiya'), null)!;
    expect(w.t0).toBe(years.toAstro(-740));
    expect(w.t1).toBe(years.toAstro(-701));
    expect(w.bracket).toBeUndefined();
  });
  it('Моисей и Аарон — по служению с годами в карточке: Исход и странствие', () => {
    const m = atlas.models[0];
    for (const id of ['moisey', 'aaron']) {
      const p = atlas.byId.get(id)!;
      expect(p.active).toBe(null);
      expect(tiers.ministryOf(p.active, m.chrono.get(id), null), `${id} без тома карточек`).toBe(null);
      const w = tiers.ministryOf(p.active, m.chrono.get(id), cardOf(id))!;
      expect(w.t0, id).toBe(years.toAstro(-1446));
      expect(w.t1, id).toBeGreaterThanOrEqual(years.toAstro(-1407));
      expect(w.refs?.length, id).toBeGreaterThan(0);
    }
  });
  it('Енох — по датированным событиям жизни (Быт 5:21–24), с пометой, что служение не датировано', () => {
    const m = atlas.models[0];
    const c = m.chrono.get('enokh')!;
    const w = tiers.ministryOf(null, c, cardOf('enokh'))!;
    expect(w.t0).toBeCloseTo(c.b + 65, 5);
    expect(w.t1).toBeCloseTo(c.b + 365, 5);
    expect(w.note).toMatch(/не датирует/);
  });
  it('пророки «время не установлено» — скобкой (решение 24): Авдий, Наум, Аввакум, Малахия', () => {
    const m = atlas.models[0];
    const bars = tiers.buildTiers(m).find((t) => t.key === 'prophets')!.bars;
    for (const id of ['avdiy-prorok', 'naum-prorok', 'avvakum', 'malakhiya']) {
      const b = bars.find((x) => x.id === id);
      expect(b, id).toBeDefined();
      expect(b!.bracket, id).toBe(true);
      const c = m.chrono.get(id)!;
      expect(b!.t0).toBe(c.bLo);
      expect(b!.note).toMatch(/^Время служения не установлено/);
    }
  });
  it('скобка по годам созвездия — не свидетельство: в ярус не идёт; оценка без опор — тоже', () => {
    const c = { b: -700, bLo: -720, bHi: -680, d: null, dLo: null, dHi: null, last: null, dEst: -650, cls: 'epochal' as const, epoch: null, infant: false };
    expect(tiers.ministryOf(null, { ...c, when: { by: 'group' } }, null)).toBe(null);
    expect(tiers.ministryOf(null, { ...c, when: { by: 'mention', ref: 'Наум 1:1' } }, null)?.bracket).toBe(true);
    expect(tiers.ministryOf(null, { ...c, cls: 'estimated', when: undefined }, null)).toBe(null);
  });
  it('пророк-царь (Давид) стоит в ярусе своего царства, в «Пророках» его нет', () => {
    const bars = tiers.buildTiers(atlas.models[0]).find((t) => t.key === 'prophets')!.bars;
    expect(bars.some((b) => b.id === 'david')).toBe(false);
  });
});

describe('синхронизмы (MAP-47)', () => {
  it('из reign.sync: вертикаль между отрезками царей Иудеи и Израиля в N-й год другого царя', () => {
    const m = atlas.models[0];
    const ts = tiers.buildTiers(m);
    const judah = new Set(ts.find((t) => t.key === 'judah')!.bars.map((b) => b.key));
    const israel = new Set(ts.find((t) => t.key === 'israel')!.bars.map((b) => b.key));
    const all = new Map(ts.flatMap((t) => t.bars).map((b) => [b.key, b]));
    const syncs = tiers.buildSyncs(m);
    expect(syncs.length).toBeGreaterThan(25);
    let near = 0;
    for (const s of syncs) {
      expect((judah.has(s.from) && israel.has(s.to)) || (israel.has(s.from) && judah.has(s.to)), `${s.from} → ${s.to}`).toBe(true);
      expect(s.refs.length).toBeGreaterThan(0);
      if (Math.abs(s.t - all.get(s.from)!.t0) <= 2) near++;
    }
    // у большинства вертикаль — у начала правления того, чьё воцарение датировано; остальные — соправления
    // реконструкции (Иосафат с Асой, Иорам с Иосафатом): там вертикаль внутри отрезка и показывает расхождение
    expect(near / syncs.length).toBeGreaterThan(0.6);
    // Авия воцарился в восемнадцатый год Иеровоама (3 Цар 15:1)
    const aviya = syncs.find((s) => s.from.startsWith('r:aviya:'))!;
    expect(aviya.to.startsWith('r:ieroboam:')).toBe(true);
    expect(aviya.t).toBe(years.toAstro(-931) + 17);
  });
});

describe('подписи отрезков (VIS-26, MAP-47)', () => {
  it('короткое правление между длинными подписано за концом отрезка, подпись соседа сдвинута и осталась в его отрезке (Гофолия)', () => {
    const bars = [
      { key: 'ioram', x0: 0, x1: 100, tw: 40 },
      { key: 'gofoliya', x0: 100, x1: 130, tw: 50 },
      { key: 'ioas', x0: 130, x1: 400, tw: 30 },
    ];
    const at = tiers.placeBarLabels(bars, 0, 1000);
    expect(at.get('ioram')).toEqual({ x: 4, where: 'inside' });
    expect(at.get('gofoliya')).toEqual({ x: 133, where: 'spill' });
    const j = at.get('ioas')!;
    expect(j.where).toBe('inside');
    expect(j.x).toBeGreaterThanOrEqual(133 + 50 + 6);
    expect(j.x + 30).toBeLessThanOrEqual(400 - 3);
  });
  it('подпись за концом не выталкивает соседа из его отрезка: тогда подписи короткого отрезка нет', () => {
    const at = tiers.placeBarLabels(
      [
        { key: 'a', x0: 0, x1: 4, tw: 50 },
        { key: 'b', x0: 4, x1: 60, tw: 30 },
      ],
      0,
      1000,
    );
    expect(at.get('b')?.where).toBe('inside');
    expect(at.has('a')).toBe(false);
  });
  it('подписи строки не ложатся друг на друга и не заходят левее колонки названий', () => {
    // отрезки строки не перекрываются (packRows): короткие и длинные вперемежку, с зазорами и без
    let x = 60;
    const bars = Array.from({ length: 30 }, (_, i) => {
      const x0 = x + (i % 3) * 4;
      x = x0 + 5 + (i % 4) * 30;
      return { key: `k${i}`, x0, x1: x, tw: 30 + (i % 3) * 10 };
    });
    const at = tiers.placeBarLabels(bars, 100, 700);
    const boxes = [...at].map(([k, v]) => ({ k, x: v.x, w: bars.find((b) => b.key === k)!.tw }));
    for (const a of boxes) {
      expect(a.x).toBeGreaterThanOrEqual(100 - 0.5);
      expect(a.x + a.w).toBeLessThanOrEqual(700);
      for (const b of boxes) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x, `${a.k} / ${b.k}`).toBe(true);
    }
  });
});

describe('подписи событий (VIS-26)', () => {
  it('границы эпох — первыми; риска не заходит в чужую подпись; без места — события нет', () => {
    const evs = [
      { key: 'a', x: 100, tw: 120, lead: false },
      { key: 'b', x: 150, tw: 80, lead: true },
      { key: 'c', x: 160, tw: 60, lead: false },
      { key: 'd', x: 170, tw: 60, lead: false },
      { key: 'e', x: 50, tw: 40, lead: false },
    ];
    const at = tiers.placeEvents(evs, 2, 90, 1000);
    expect(at.get('b')).toBe(0);
    expect(at.has('e')).toBe(false); // левее колонки названий
    const placed = evs.filter((e) => at.has(e.key));
    for (const e of placed)
      for (const f of placed)
        if (e !== f && at.get(e.key) === at.get(f.key)) expect(e.x < f.x - 2 || e.x > f.x + 4 + f.tw, `${e.key} в подписи ${f.key}`).toBe(true);
    expect(placed.length).toBeLessThan(evs.length);
    // одна строка (обзор): не больше подписей, чем помещается
    const one = tiers.placeEvents(evs, 1, 90, 1000);
    expect(one.size).toBeLessThanOrEqual(at.size);
  });
  it('события на границах эпох помечены: Исход, Потоп, разделение царства', () => {
    const ev = tiers.buildTiers(atlas.models[0]).find((t) => t.key === 'events')!.bars;
    const lead = ev.filter((b) => b.lead).map((b) => b.label);
    for (const s of ['Исход из Египта', 'Потоп', 'Разделение царства']) expect(lead, s).toContain(s);
  });
  it('колонка названий ярусов — 88 px', () => {
    expect(tiers.NAME_COL).toBe(88);
  });
});

describe('формула на краях столбца (ТЗ § 3.5, § 3.6; MAP-48)', () => {
  it('по надёжно датированной родне, с согласованием по полу и склонением имён', () => {
    const m = atlas.models[0];
    expect(tiers.columnFormula('moisey', m).birth).toBe('Моисей родился после рождения Аарона');
    const isaak = tiers.columnFormula('isaak', m);
    expect(isaak.birth).toBe('Исаак родился после рождения Измаила и до рождения Иакова');
    expect(isaak.death).toBe('умер после смерти Измаила, при жизни Иакова');
    expect(tiers.columnFormula('mariya', m).birth).toMatch(/^Мария родилась /);
  });
  it('у народа и у лица «время не установлено» формулы нет; строки не содержат несклонённых пустот', () => {
    const m = atlas.models[0];
    const people = atlas.persons.find((p) => p.kind === 'people')!;
    expect(tiers.columnFormula(people.id, m)).toEqual({ birth: null, death: null });
    expect(tiers.columnFormula('naum-prorok', m)).toEqual({ birth: null, death: null });
    for (const p of atlas.persons.slice(0, 600)) {
      const f = tiers.columnFormula(p.id, m);
      for (const s of [f.birth, f.death]) if (s) expect(s, p.id).not.toMatch(/null|undefined|\s{2}|рождения\s*$|смерти\s*$/);
    }
  });
  it('пары из хронологического напряжения в формулу не идут', () => {
    const m = atlas.models[0];
    const t = m.tensions.find((x) => x.persons.includes('moisey'))!;
    const f = tiers.columnFormula('moisey', m);
    for (const id of t.persons.filter((x) => x !== 'moisey')) {
      const name = atlas.byId.get(id)!.name;
      expect(`${f.birth} ${f.death}`, name).not.toContain(name.slice(0, -1));
    }
  });
});
