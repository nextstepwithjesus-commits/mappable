/**
 * Отметки на небе — этап 7, K5: отклик звезды на клавишу набора (IX-51), кольцо выбранной женщины Мф 1 в режиме
 * «только линии» — у её знака, а не пустое кольцо на месте скрытой звезды (UX-46).
 */
import { beforeAll, describe, expect, it } from 'vitest';

type Arc = { x: number; y: number; r: number; alpha: number };
function recording() {
  const arcs: Arc[] = [];
  const st = { alpha: 1 };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (k === 'arc') return (x: number, y: number, r: number) => arcs.push({ x, y, r, alpha: st.alpha });
      if (k === 'globalAlpha') return st.alpha;
      return () => ({ addColorStop: () => {} });
    },
    set: (_o, k, v) => {
      if (k === 'globalAlpha') st.alpha = v as number;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, arcs };
}

let sky: typeof import('../src/render/sky.ts');
let ribbons: typeof import('../src/render/ribbons.ts');
let atlas: typeof import('../src/data/atlas.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;
beforeAll(async () => {
  Object.assign(globalThis, { document: { documentElement: { dataset: {} } }, getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  sky = await import('../src/render/sky.ts');
  ribbons = await import('../src/render/ribbons.ts');
  atlas = await import('../src/data/atlas.ts');
});
const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
function make(move: (s: Sky) => void, state: Record<string, unknown>) {
  const rec = recording();
  const s = new sky.Sky({ getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} } as unknown as HTMLCanvasElement);
  s.resize(1440, 776, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  move(s);
  const draw = () => {
    rec.arcs.length = 0;
    s.draw({
      model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
      onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [], ...state,
    } as Parameters<Sky['draw']>[0]);
  };
  draw();
  return { s, arcs: rec.arcs, draw };
}
const near = (id: string, span: number) => (s: Sky) => {
  const x = s.nodeX(id)!;
  const t = s.tOf(x);
  const vp = s.cam.vp;
  const kx = (vp.r - vp.l) / (s.xOf(t + span / 2) - s.xOf(t - span / 2));
  s.cam.set({ x0: x - (vp.l + (vp.r - vp.l) / 2) / kx, kx, laneTop: s.node(id)!.lane + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};

describe('отклик звезды на клавишу набора (IX-51)', () => {
  it('однократная обводка 300 мс: сразу после нажатия — кольцо вокруг звезды, через 300 мс — нет', () => {
    const now = performance.now();
    const a = make(near('iessey', 60), { workFlash: { id: 'iessey', at: now } });
    const i = a.s.indexOf('iessey')!;
    const x = a.s.cam.sx(a.s.X0[i]);
    const y = a.s.cam.sy(a.s.nodes[i].lane);
    expect(a.arcs.some((c) => Math.abs(c.x - x) < 0.5 && Math.abs(c.y - y) < 0.5 && c.r > 5 && c.alpha < 1.0001)).toBe(true);
    const b = make(near('iessey', 60), { workFlash: { id: 'iessey', at: now - 400 } });
    expect(b.arcs.filter((c) => Math.abs(c.x - x) < 0.5 && Math.abs(c.y - y) < 0.5 && c.r > 8).length).toBe(0);
  });
});

describe('кольцо выбранного в режиме «только линии» (UX-46)', () => {
  it('Руфь выбрана: кольцо — у её знака у Овида, а не на месте скрытой звезды', async () => {
    await ribbons.loadMt1();
    const m = make((s) => {
      s.cam.focusLanes = 30;
      near('ovid', 400)(s);
    }, { onlyLines: true, selected: 'ruf' });
    m.draw();
    const bead = ribbons.beadAt(m.s, 'ruf');
    expect(bead).toBeTruthy();
    const i = m.s.indexOf('ruf')!;
    const x = m.s.cam.sx(m.s.X0[i]);
    const y = m.s.cam.sy(m.s.nodes[i].lane);
    // кольцо у знака
    expect(m.arcs.some((c) => Math.abs(c.x - bead!.x) < 0.5 && Math.abs(c.y - bead!.y) < 0.5 && c.r > 6)).toBe(true);
    // не на месте скрытой звезды (если бусина не совпала с ней)
    if (Math.hypot(bead!.x - x, bead!.y - y) > 4) expect(m.arcs.some((c) => Math.abs(c.x - x) < 0.5 && Math.abs(c.y - y) < 0.5 && c.r > 6)).toBe(false);
  });
});
