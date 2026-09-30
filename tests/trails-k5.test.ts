/**
 * Следы и семьи на небе — этап 7, K5 (решение 24): разрыв «//» растянутой жизни и отвода к ребёнку после разрыва
 * (MAP-51), скобка «время не установлено» вместо звезды (MAP-52), порядок братьев по перечислению (MAP-54), пометы
 * матерей у детей Давида (MAP-55).
 */
import { beforeAll, describe, expect, it } from 'vitest';

type Call = [string, ...unknown[]];
function recording() {
  const calls: Call[] = [];
  const texts: { t: string; x: number; y: number }[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y });
      if (typeof k === 'string' && ['moveTo', 'lineTo', 'stroke', 'setLineDash', 'fillRect', 'createLinearGradient'].includes(k))
        return (...a: unknown[]) => {
          calls.push([k, ...a]);
          return { addColorStop: () => {} };
        };
      return () => ({ addColorStop: () => {} });
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}

let sky: typeof import('../src/render/sky.ts');
let trails: typeof import('../src/render/trails.ts');
let atlas: typeof import('../src/data/atlas.ts');
let years: typeof import('../src/engine/years.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, { document: { documentElement: { dataset: {} } }, getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  sky = await import('../src/render/sky.ts');
  trails = await import('../src/render/trails.ts');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
function drawSky(move: (s: Sky) => void, state: Record<string, unknown> = {}) {
  const rec = recording();
  const s = new sky.Sky({ getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} } as unknown as HTMLCanvasElement);
  s.resize(1440, 776, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  move(s);
  s.draw({
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [], ...state,
  } as Parameters<Sky['draw']>[0]);
  return { s, ...rec };
}
const window = (year: number, span: number, lane = 0) => (s: Sky) => {
  const t = years.toAstro(year);
  const vp = s.cam.vp;
  const vw = vp.r - vp.l;
  const kx = vw / (s.xOf(t + span / 2) - s.xOf(t - span / 2));
  s.cam.set({ x0: s.xOf(t) - (vp.l + vw / 2) / kx, kx, laneTop: lane + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};

describe('разрыв «//» растянутой жизни (MAP-51; решение 24)', () => {
  it('след: сплошной до разрыва, знак «//» — два косых штриха через след, дальше — бледнее (этап 12: без точек)', () => {
    const r = recording();
    trails.drawLifeTrail(r.ctx, { x0: 10, x1: 300, y: 50.5, cls: 'estimated', known: false, solidTo: 290, brk: 150, color: '#fff', width: 1.2 });
    const moves = r.calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo');
    // сплошная часть — до разрыва (с просветом)
    expect(moves.some((c) => c[0] === 'lineTo' && (c[1] as number) < 150 && (c[1] as number) > 140 && c[2] === 50.5)).toBe(true);
    // косые штрихи: концы выше и ниже следа
    const slants = moves.filter((c) => Math.abs((c[1] as number) - 150) < 4 && c[2] !== 50.5);
    expect(slants.length).toBe(4);
    // после разрыва — бледнее (растушёвка той же долей яркости) до конца засвидетельствованного, дальше тает; точек нет
    expect(r.calls.some((c) => c[0] === 'setLineDash' && (c[1] as number[]).length)).toBe(false);
    const grads = r.calls.filter((c) => c[0] === 'createLinearGradient').map((c) => [c[1], c[3]]);
    expect(grads).toEqual([[150 + trails.BREAK.gap / 2 + 2, 290], [290, 300]]);
    expect(r.calls.some((c) => c[0] === 'lineTo' && c[1] === 290)).toBe(true);
  });
  it('на небе у Иохаведы, Арама и Овида разрыв; отвод к ребёнку, родившемуся после разрыва, — со знаком', () => {
    const m = atlas.models[0];
    for (const id of ['iokhaveda', 'aram', 'ovid']) {
      const n = m.nodeByPerson.get(id)!;
      expect(n.brk, id).not.toBe(null);
      expect(n.brk!, id).toBeLessThan(n.t1);
    }
    const { s } = drawSky(window(-1640, 300, 70));
    const t = { x0: 0, x1: 0, y: 0, cls: 'exact' as const, known: true, solidTo: 0, color: '', width: 1 };
    const tr = trails.trailOf(s, s.indexOf('iokhaveda')!, t)!;
    expect(tr.brk).toBeGreaterThan(tr.x0);
    expect(tr.brk).toBeLessThan(tr.solidTo);
  });
});

describe('скобка «время не установлено» (MAP-52)', () => {
  it('лицо без своего времени — скобка bLo…bHi с засечками, а не звезда на меридиане события', () => {
    const r = recording();
    trails.drawEpochBracket(r.ctx, { x0: 100, x1: 200, y: 40.5, color: '#fff' });
    expect(r.calls.some((c) => c[0] === 'setLineDash' && JSON.stringify(c[1]) === JSON.stringify(trails.BRACKET_DOTS))).toBe(true);
    const ticks = r.calls.filter((c) => c[0] === 'moveTo' && (c[2] as number) === 40.5 - trails.BRACKET_TICK);
    expect(ticks.length).toBe(2);
  });
  it('Гиезий: скобка через годы служения Елисея; по годам созвездия (when.by = group) скобки нет', () => {
    // этап 13: у Луки (прежний пример) теперь свои годы служения (Кол 4:14; Флм 1:24) — пример того же случая: Гиезий,
    // названный только при Елисее (4 Цар 4:12; 5:20–27)
    const { s } = drawSky(window(-825, 120, atlas.models[0].nodeByPerson.get('gieziy')!.lane));
    const b = { x0: 0, x1: 0, y: 0, color: '' };
    const i = s.indexOf('gieziy')!;
    const got = trails.bracketOf(s, i, b)!;
    expect(got).toBeTruthy();
    const c = atlas.models[0].chrono.get('gieziy')!;
    expect(c.when).toEqual({ by: 'met', id: 'elisey' });
    expect(got.x0).toBeCloseTo(s.cam.sx(s.xOf(c.bLo)), 3);
    expect(got.x1).toBeCloseTo(s.cam.sx(s.xOf(c.bHi)), 3);
    // знак в середине скобки, не на начале эпохи «Разделённое царство» (931 г. до Р. Х.)
    expect(s.nodes[i].t0).toBeCloseTo((c.bLo + c.bHi) / 2, 3);
    expect(Math.abs(s.nodes[i].t0 - years.toAstro(-931))).toBeGreaterThan(10);
    const group = [...atlas.models[0].chrono].find(([, q]) => q.cls === 'epochal' && q.when?.by === 'group');
    if (group) {
      const k = s.indexOf(group[0]);
      if (k !== undefined) expect(trails.bracketOf(s, k, b)).toBe(null);
    }
  });
});

describe('семьи (MAP-54, MAP-55)', () => {
  it('«годы — по порядку …, выв.»: место, где дети названы по порядку, стихи одной главы — промежутком', () => {
    const txt = trails.orderNote(['samus-syn-davida', 'sovav-syn-davida', 'solomon', 'nafan-syn-davida', 'evear-syn-davida', 'elisama-syn-davida'].filter((id) => atlas.byId.has(id)));
    expect(txt?.replace(/\u00a0/g, ' ')).toBe('годы — по порядку 1 Пар 3:5–8, выв.');
    expect(trails.orderNote(['adam'])).toBe(null);
  });
  it('у детей Давида от разных матерей — имя матери у ромба её союза на следе Давида (этап 11, Г8; прежде — пометы «от Вирсавии» у детей)', () => {
    // этап 11 (STAGE11 § 2): у каждого союза свой ромб; мать далеко от детей — ромб на следе отца с её именем (Г8);
    // пометы «от …» у гребёнок и пометы порядка (Г9) ушли с неба — порядок виден по положению, его ссылки — в подсказке
    const { s, texts } = drawSky(window(-1010, 60, 6));
    const notes = texts.map((q) => q.t.replace(/\u00a0/g, ' '));
    expect(notes.filter((t) => /^от [А-ЯЁ]/.test(t))).toEqual([]);
    const names = s.labelStats().boxes.filter((b) => b.kind === 'plate' && b.text).map((b) => b.text);
    expect(names).toContain('Вирсавия');
    expect(s.labelStats().overlaps).toBe(0);
    expect(notes.some((t) => /по порядку/.test(t))).toBe(false);
    // выбран Давид — помет порядка на небе тоже нет
    const sel = drawSky(window(-1010, 60, 6), { selected: 'david' });
    expect(sel.texts.map((q) => q.t.replace(/\u00a0/g, ' ')).some((t) => /по порядку/.test(t))).toBe(false);
    expect(sel.s.labelStats().overlaps).toBe(0);
  });
});
