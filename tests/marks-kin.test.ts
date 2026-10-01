/**
 * Путь родства на небе (E5; U1, U5; MAP-17, MAP-18, UX-11).
 *  — путь — ломаная по связям неба: от родителя вдоль его следа к году рождения ребёнка и отводом к ребёнку;
 *    кровные шаги сплошные, по закону — штрихом, по термину Писания и по толкованию — точками;
 *  — у шагов подписи («мать», «брат»), они проходят замер наложений;
 *  — перелёт вписывает оба конца пути по обеим осям (viewForIds).
 * Нужна свежая сборка данных: npm run -s data.
 */
import { beforeAll, describe, expect, it } from 'vitest';

type Call = [string, ...unknown[]];
function recording() {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      return (...a: unknown[]) => {
        calls.push([String(k), ...a]);
        return { addColorStop: () => {} };
      };
    },
    set: (_o, k, v) => {
      calls.push([`=${String(k)}`, v]);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

let sky: typeof import('../src/render/sky.ts');
let marks: typeof import('../src/render/marks.ts');
let atlas: typeof import('../src/data/atlas.ts');
let kin: typeof import('../src/engine/kinship.ts');
let view: typeof import('../src/ui/sky/view.ts');
let common: typeof import('../src/ui/common.tsx');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  marks = await import('../src/render/marks.ts');
  atlas = await import('../src/data/atlas.ts');
  kin = await import('../src/engine/kinship.ts');
  view = await import('../src/ui/sky/view.ts');
  common = await import('../src/ui/common.tsx');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
type SkyT = InstanceType<typeof import('../src/render/sky.ts').Sky>;
function makeSky(w = 1440, h = 776) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const s: SkyT = new sky.Sky(canvas);
  s.resize(w, h, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  return { s, rec };
}
const pathOf = (a: string, b: string) => {
  const r = kin.relate(atlas.graph, a, b, 1)[0];
  return { steps: r.steps, ids: [...new Set(r.steps.flatMap((x) => [x.from, x.to]))] };
};
function draw(s: SkyT, a: string, b: string) {
  const { steps, ids } = pathOf(a, b);
  s.draw({
    model: atlas.models[0], lambda: 1, selected: a, second: b, hovered: null, focus: null, highlight: marks.highlightFor(a, ids)!.hl, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [], kinSteps: steps,
  } as Parameters<SkyT['draw']>[0]);
  return ids;
}
/** Вписать лица ids видом viewForIds (как перелёт, но сразу). */
function fit(s: SkyT, ids: string[]) {
  common.skyRef.current = s;
  const v = view.viewForIds(ids)!;
  s.cam.set(s.cam.constrain(v));
}
const inside = (s: SkyT, id: string) => {
  const x = s.cam.sx(s.nodeX(id)!);
  const y = s.cam.sy(s.node(id)!.lane);
  const vp = s.cam.vp;
  return x > vp.l && x < vp.r && y > vp.t && y < vp.b;
};

describe('шаг пути (E5)', () => {
  it('ломаная шага: вниз — вдоль следа родителя, затем отводом; вверх — наоборот; по термину — по дуге семьи; брак — отрезок', () => {
    const a = { x: 10, y: 20 };
    const b = { x: 50, y: 80 };
    expect(marks.stepRoute('down', a, b)).toEqual([a, { x: 50, y: 20 }, b]);
    expect(marks.stepRoute('up', a, b)).toEqual([a, { x: 10, y: 80 }, b]);
    expect(marks.stepRoute('spouse', a, b)).toEqual([a, b]);
    // этап 13, решение 94 (X3 Д13): шаг словом Писания — по той же кривой, что золотистая дуга (kinArcCtrl), а не косым отрезком
    const kin = marks.stepRoute('kin', a, b);
    expect(kin[0]).toEqual(a);
    expect(kin[kin.length - 1]).toEqual(b);
    expect(kin.length).toBeGreaterThan(4);
    const c = marks.kinArcCtrl(a, b);
    const mid = kin[Math.floor(kin.length / 2)];
    // середина дуги — у точки t = 0,5 кривой a → c → b
    expect(Math.hypot(mid.x - (0.25 * a.x + 0.5 * c.x + 0.25 * b.x), mid.y - (0.25 * a.y + 0.5 * c.y + 0.25 * b.y))).toBeLessThan(6);
  });
  // этап 11, Г10: штрих — только иное происхождение; этап 13, решение 94: по Луке и предок — тоже штрих, толкование —
  // точки цвета текста; этап 14, решение 138: слово Писания — сплошной золотистой линией (точки — только толкование)
  it('начертание: кровный и брак — сплошной, иное происхождение — штрих, слово Писания — сплошной золотистый, толкование — точки', () => {
    expect(marks.stepLook({ kind: 'down', claim: 'natural', interpretive: false })).toBe('blood');
    expect(marks.stepLook({ kind: 'down', claim: 'legal', interpretive: false })).toBe('legal');
    expect(marks.stepLook({ kind: 'down', claim: 'levirate', interpretive: false })).toBe('legal');
    expect(marks.stepLook({ kind: 'up', claim: 'by-luke', interpretive: false })).toBe('legal');
    expect(marks.stepLook({ kind: 'up', claim: 'ancestor', interpretive: false })).toBe('legal');
    expect(marks.stepLook({ kind: 'spouse', claim: '', interpretive: false })).toBe('blood');
    expect(marks.stepLook({ kind: 'kin', claim: '', interpretive: false })).toBe('term');
    expect(marks.stepLook({ kind: 'up', claim: 'by-luke', interpretive: true })).toBe('interp');
    expect(marks.STEP_DASH.term).toEqual([]);
    expect(marks.STEP_DASH.interp.length).toBeGreaterThan(0);
    expect(marks.STEP_DASH.legal).toEqual([6, 3]);
  });
});

describe('путь на небе (U5): «Иоав — племянник Давида (сын его сестры Саруии)»', () => {
  it('перелёт вписывает оба конца: Иоав, Саруия и Давид — в видимой части неба', () => {
    const { s } = makeSky();
    const ids = pathOf('ioav', 'david').ids;
    expect(ids).toEqual(['ioav', 'saruiya', 'david']);
    fit(s, ids);
    for (const id of ids) expect(inside(s, id), id).toBe(true);
  });
  it('на 1024 с узким небом (панель и карточка): оба конца тоже в видимой части', () => {
    const { s } = makeSky(560, 700);
    const ids = pathOf('ioav', 'david').ids;
    fit(s, ids);
    for (const id of ids) expect(inside(s, id), id).toBe(true);
  });
  // этап 14, решение 138: шаг словом Писания («брат») — сплошной золотистой линией; точки — только толкование
  it('ломаная 2 px на подложке, шаг «брат» — сплошной золотистый; подписи «мать» и «брат»; наложений нет', async () => {
    const { s, rec } = makeSky();
    fit(s, pathOf('ioav', 'david').ids);
    rec.calls.length = 0;
    draw(s, 'ioav', 'david');
    const widths = rec.calls.filter((c) => c[0] === '=lineWidth').map((c) => c[1]);
    expect(widths).toContain(5);
    expect(widths).toContain(2);
    const dashes = rec.calls.filter((c) => c[0] === 'setLineDash').map((c) => JSON.stringify(c[1]));
    expect(dashes).not.toContain(JSON.stringify([0.5, 4.5]));
    const { KIN_GOLD } = await import('../src/render/branches.ts');
    expect(rec.calls.some((c) => c[0] === '=strokeStyle' && (c[1] === KIN_GOLD.night || c[1] === KIN_GOLD.day))).toBe(true);
    const st = s.labelStats();
    const notes = st.boxes.filter((b) => b.kind === 'note').map((b) => b.text);
    expect(notes).toContain('мать');
    expect(notes).toContain('брат');
    expect(st.overlaps).toBe(0);
  });
});

describe('родство по термину Писания (MAP-17; П-8)', () => {
  it('наведение на Саруию: точечная дуга к Давиду с термином «сестра»', () => {
    const { s, rec } = makeSky();
    fit(s, ['saruiya', 'david']);
    rec.calls.length = 0;
    s.draw({
      model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: 'saruiya', focus: null, highlight: null, layers: LAYERS,
      onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    } as Parameters<SkyT['draw']>[0]);
    expect(rec.calls.some((c) => c[0] === 'quadraticCurveTo')).toBe(true);
    const st = s.labelStats();
    expect(st.boxes.filter((b) => b.kind === 'note').map((b) => b.text)).toContain('сестра');
    expect(st.overlaps).toBe(0);
  });
});

describe('путь на небе (U1): Руфь — Давид — Иисус Христос', () => {
  it('Руфь — Давид: путь целиком на экране, шаги подписаны', () => {
    const { s } = makeSky();
    const ids = pathOf('ruf', 'david').ids;
    fit(s, ids);
    for (const id of ids) expect(inside(s, id), id).toBe(true);
    draw(s, 'ruf', 'david');
    const notes = s.labelStats().boxes.filter((b) => b.kind === 'note').map((b) => b.text);
    expect(notes).toContain('сын');
  });
  it('Руфь — Иисус Христос: оба конца пути в видимой части', () => {
    const { s } = makeSky();
    const ids = pathOf('ruf', 'iisus').ids;
    fit(s, ids);
    expect(inside(s, 'ruf')).toBe(true);
    expect(inside(s, 'iisus')).toBe(true);
  });
});
