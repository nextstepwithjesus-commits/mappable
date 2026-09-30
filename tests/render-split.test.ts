/**
 * Небо после разделения src/render/sky.ts (подготовка этапа 4): модули frame, labels, trails, marks, sky.
 *  — замер подписей в кадре (labels.ts): прямоугольники нарисованных подписей и число пересекающихся пар;
 *  — одиночный след жизни и отвод (trails.ts) рисуются теми же вызовами, что и на небе;
 *  — прежние импорты из sky.ts (FRAME_H, BAND, atlasCoord, Rect) работают.
 */
import { beforeAll, describe, expect, it } from 'vitest';

type Call = [string, ...unknown[]];
/** Холст, который записывает вызовы и присваивания по порядку; ширина текста — 7 px на знак. */
function recording() {
  const calls: Call[] = [];
  const texts: { t: string; x: number; y: number; font: string }[] = [];
  let font = '';
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (k === 'fillText')
        return (t: string, x: number, y: number) => {
          texts.push({ t, x, y, font });
          calls.push(['fillText', t, x, y]);
        };
      return (...a: unknown[]) => {
        calls.push([String(k), ...a]);
        return { addColorStop: () => {} };
      };
    },
    set: (_o, k, v) => {
      if (k === 'font') font = v as string;
      calls.push([`=${String(k)}`, v]);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}

let sky: typeof import('../src/render/sky.ts');
let labels: typeof import('../src/render/labels.ts');
let trails: typeof import('../src/render/trails.ts');
let models: typeof import('../src/data/atlas.ts').models;
let byId: typeof import('../src/data/atlas.ts').byId;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  labels = await import('../src/render/labels.ts');
  trails = await import('../src/render/trails.ts');
  ({ models, byId } = await import('../src/data/atlas.ts'));
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
function drawSky(o: { w?: number; h?: number; move?: (s: InstanceType<typeof sky.Sky>) => void; state?: Record<string, unknown>; times?: number } = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, o.h ?? 776, 1);
  s.setModel(models[0], 1);
  s.fitAll();
  o.move?.(s);
  for (let k = 0; k < (o.times ?? 1); k++)
    s.draw({
      model: models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
      onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
      ...(o.state ?? {}),
    } as Parameters<InstanceType<typeof sky.Sky>['draw']>[0]);
  return { sky: s, ...rec };
}
const cross = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const brute = (bs: { x: number; y: number; w: number; h: number }[]) => {
  let n = 0;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (cross(bs[i], bs[j])) n++;
  return n;
};
/** К Давиду с приближением k. */
const atDavid = (k: number) => (s: InstanceType<typeof sky.Sky>) => {
  s.cam.zoomAt(720, 400, k);
  s.cam.x0 = s.nodeX('david')! - 720 / s.cam.kx;
  s.cam.laneTop = s.node('david')!.lane + 300 / s.cam.ky;
};

describe('замер наложений подписей (labels.ts)', () => {
  it('пары считаются по пересечению; касание краями — не наложение', () => {
    const b = (x: number, y: number, w = 10, h = 10) => ({ kind: 'star' as const, text: '', x, y, w, h });
    const r = labels.measureLabels([b(0, 0), b(10, 0), b(5, 5), b(100, 100), b(0, 10)]);
    expect(r.overlaps).toBe(3);
    expect(r.pairs).toEqual(expect.arrayContaining([[0, 2], [1, 2], [2, 4]]));
    expect(r.boxes.length).toBe(5);
  });
  it('проход по x даёт то же, что перебор всех пар', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bs = Array.from({ length: 400 }, () => ({ kind: 'star' as const, text: '', x: rnd() * 1400, y: rnd() * 800, w: 20 + rnd() * 90, h: 12 + rnd() * 6 }));
    expect(labels.measureLabels(bs).overlaps).toBe(brute(bs));
  });
  for (const [name, move] of [['обзор', undefined], ['эпоха', atDavid(6)], ['семья', atDavid(60)]] as const) {
    it(`${name}: каждая нарисованная подпись оставила прямоугольник, замер совпадает с перебором`, () => {
      const { sky: s, texts } = drawSky({ move, times: 2 });
      const st = s.labelStats();
      const stars = st.boxes.filter((b) => b.kind === 'star');
      expect(stars.length).toBeGreaterThan(3);
      // имя звезды нарисовано внутри своего прямоугольника; второй кадр не удваивает замер
      const drawn = texts.slice(texts.length / 2);
      for (const b of stars) {
        expect(byId.get(b.id!)!.name).toBe(b.text);
        const t = drawn.find((q) => q.t === b.text && q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h);
        expect(t, b.text).toBeTruthy();
      }
      for (const b of st.boxes.filter((q) => q.kind === 'group')) expect(drawn.some((q) => q.t === b.text && cross({ x: q.x, y: q.y - 1, w: 1, h: 1 }, b))).toBe(true);
      expect(new Set(st.boxes.map((b) => `${b.kind} ${b.text} ${b.x} ${b.y}`)).size).toBe(st.boxes.length);
      expect(st.overlaps).toBe(brute(st.boxes));
    });
  }
  it('указатель у края тоже подпись: выбранное лицо за краем окна', () => {
    const { sky: s } = drawSky({ move: atDavid(20), state: { selected: 'adam' } });
    const edge = s.labelStats().boxes.filter((b) => b.kind === 'edge');
    expect(edge.map((b) => b.id)).toEqual(['adam']);
    expect(s.edgeHits.map((e) => e.id)).toEqual(['adam']);
  });
});

describe('одиночный след и отвод (trails.ts): то же, что на небе', () => {
  const strokes = (calls: Call[]) => calls.filter((c) => ['setLineDash', 'moveTo', 'lineTo', 'stroke', 'fillRect'].includes(c[0]));
  it('известная смерть — сплошной след; неизвестная — сплошной до последнего упоминания и растушёвка; эпохальный — точки ≤ 60 px', () => {
    const base = { x0: 10, x1: 210, y: 50.5, color: '#fff', width: 1.2 };
    let r = recording();
    trails.drawLifeTrail(r.ctx, { ...base, cls: 'exact', known: true, solidTo: 210 });
    expect(strokes(r.calls)).toEqual([['moveTo', 10, 50.5], ['lineTo', 210, 50.5], ['stroke']]);
    r = recording();
    trails.drawLifeTrail(r.ctx, { ...base, cls: 'calculated', known: false, solidTo: 90 });
    expect(strokes(r.calls)).toEqual([['moveTo', 10, 50.5], ['lineTo', 90, 50.5], ['stroke'], ['moveTo', 90, 50.5], ['lineTo', 210, 50.5], ['stroke']]);
    // этап 12, решение 90: конец следа тает (градиент 90→210), а не пунктир
    expect(r.calls.filter((c) => c[0] === 'createLinearGradient').map((c) => [c[1], c[3]])).toEqual([[90, 210]]);
    r = recording();
    trails.drawLifeTrail(r.ctx, { ...base, cls: 'epochal', known: false, solidTo: 10 });
    expect(strokes(r.calls)).toEqual([['setLineDash', [1, 4]], ['moveTo', 10, 50.5], ['lineTo', 70, 50.5], ['stroke'], ['setLineDash', []]]);
  });
  it('отвод: призрак — пунктир, узелок матери, знак разрыва', () => {
    const r = recording();
    trails.drawDescent(r.ctx, { x: 20.5, y0: 10, y1: 90, color: '#aaa', ghost: true, mother: { y: 40, color: '#bbb' }, tension: '#fff' });
    expect(strokes(r.calls)).toEqual([
      ['setLineDash', [2, 2]], ['moveTo', 20.5, 10], ['lineTo', 20.5, 90], ['stroke'], ['setLineDash', []],
      ['fillRect', 19, 38.5, 3, 3],
      ['moveTo', 16.5, 51], ['lineTo', 24.5, 47], ['moveTo', 16.5, 54], ['lineTo', 24.5, 50], ['stroke'],
    ]);
  });
  it('след Давида на небе нарисован теми же вызовами, что drawLifeTrail', () => {
    const { sky: s, calls } = drawSky({ move: atDavid(20), state: { layers: { ...LAYERS, connectors: false, ribbons: false, labels: false, constellations: false, epochs: false } } });
    const i = s.nodes.findIndex((n) => n.person === 'david');
    const c = models[0].chrono.get('david')!;
    const x0 = s.cam.sx(s.X0[i]);
    const x1 = s.cam.sx(s.X1[i]);
    const y = Math.round(s.cam.sy(s.nodes[i].lane)) + 0.5;
    const r = recording();
    trails.drawLifeTrail(r.ctx, { x0, x1, y, cls: c.cls, known: c.d !== null, solidTo: c.d !== null ? x1 : s.cam.sx(s.xOf(c.last!)), color: 'c', width: 1.6 });
    const mine = strokes(r.calls);
    const at = calls.findIndex((q, k) => q[0] === 'moveTo' && q[1] === x0 && q[2] === y && calls[k + 1]?.[0] === 'lineTo');
    expect(at).toBeGreaterThan(0);
    expect(strokes(calls.slice(at - 1)).slice(0, mine.length)).toEqual(mine);
  });
});

describe('прежние импорты из sky.ts', () => {
  it('FRAME_H, BAND, atlasCoord и затемнение — из sky.ts, как до разделения', async () => {
    const frame = await import('../src/render/frame.ts');
    expect(sky.FRAME_H).toBe(frame.FRAME_H);
    expect(sky.FRAME_H).toBe(44);
    expect(sky.BAND).toBe(12);
    expect(sky.atlasCoord(-1010 + 1, 0, 11)).toBe(frame.atlasCoord(-1009, 0, 11));
    expect(sky.atlasCoord(-1009, 0, 11)).toBe('32 А');
    expect(sky.DIM).toBeGreaterThan(0);
  });
});
