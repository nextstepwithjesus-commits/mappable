/**
 * Ленты линий Мессии (ТЗ § 3.2, § 5.2; B6: VIS-30, MAP-25, MAP-50).
 * Геометрия: коса с лицами между нитями, параллельные нити при тесных поколениях, фаза расхождения,
 * разреженная нить звеньев по толкованию, плетение после расхождения. Отрисовка: один путь на слой нити
 * (без световых «бусин» на стыках), слабое свечение ночью, вес днём, гашение не ниже 0,85 днём.
 */
import { describe, it, expect } from 'vitest';
import { buildRibbons, type Pt, type Strand } from '../src/engine/ribbons.ts';
import { drawStrands, ribbonDim, GLOW_WIDTH, DAY_HALO_MIN, type RibbonLook } from '../src/render/ribbons.ts';
import { hexToRgb } from '../src/render/color.ts';

/** Линия из лиц id0…idN по горизонтали с шагом step px (одна полоса, y = 0). */
function row(ids: string[], step: number, x0 = 0): Map<string, Pt> {
  return new Map(ids.map((id, i) => [id, { x: x0 + i * step, y: 0 }]));
}
const A = 8;
const build = (j: string[], m: string[], pos: Map<string, Pt>, weak: string[] = []) =>
  buildRibbons({
    joseph: j.map((id) => ({ id, weak: weak.includes(id) })),
    mary: m.map((id) => ({ id, weak: weak.includes(id) })),
    project: (id) => pos.get(id) ?? null,
    amplitude: A,
    meander: A * 0.5,
  });
const byLine = (s: Strand[]) => ({ mary: s.find((x) => x.line === 'mary')!, joseph: s.find((x) => x.line === 'joseph')! });
/** Точка нити, ближайшая по x к заданной. */
const at = (st: Strand, x: number) => st.points.reduce((b, p) => (Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b));

describe('ленты: геометрия', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  it('коса: лица между нитями, перекрестья между поколениями', () => {
    const pos = row(ids, 60);
    const { mary, joseph } = byLine(build(ids, ids, pos));
    expect(joseph.points.length).toBe(mary.points.length);
    const idx = (x: number) => joseph.points.findIndex((p) => Math.abs(p.x - x) < 1e-6);
    for (let i = 1; i < ids.length - 1; i++) {
      const k = idx(i * 60);
      // в лице нити по разные стороны от звезды и на расстоянии ≈ 2A
      expect(Math.sign(joseph.points[k].y)).toBe(-Math.sign(mary.points[k].y));
      expect(Math.abs(joseph.points[k].y - mary.points[k].y)).toBeGreaterThan(1.6 * A);
    }
    // между соседними поколениями нити перекрещиваются ровно один раз
    for (let i = 0; i < ids.length - 1; i++) {
      let flips = 0;
      for (let k = idx(i * 60); k < idx((i + 1) * 60); k++) {
        const d0 = joseph.points[k].y - mary.points[k].y;
        const d1 = joseph.points[k + 1].y - mary.points[k + 1].y;
        if (d0 !== 0 && Math.sign(d0) !== Math.sign(d1)) flips++;
      }
      expect(flips).toBe(1);
    }
  });

  it('при шаге поколений меньше 12 px коса заменяется двумя параллельными нитями', () => {
    const pos = row(ids, 10);
    const { mary, joseph } = byLine(build(ids, ids, pos));
    for (let k = 0; k < joseph.points.length; k++) {
      const j = joseph.points[k];
      const m = mary.points[k];
      if (j.x < 5 || j.x > 55) continue;
      expect(j.y).toBeLessThan(0); // Иосиф всё время сверху
      expect(m.y).toBeGreaterThan(0);
      expect(Math.abs(j.y - m.y)).toBeGreaterThan(0.5 * A);
    }
    expect(mary.over.length + joseph.over.length).toBe(0);
  });

  it('при расхождении нить Иосифа уходит вверх, нить Марии — вниз', () => {
    // общий участок a…d, затем Иосиф — e1 (выше), Мария — e2 (ниже), схождение в g
    const pos = new Map<string, Pt>([
      ...row(['a', 'b', 'c', 'd'], 60),
      ['e1', { x: 240, y: -40 }],
      ['e2', { x: 240, y: 40 }],
      ['g', { x: 360, y: 0 }],
    ]);
    const { mary, joseph } = byLine(build(['a', 'b', 'c', 'd', 'e1', 'g'], ['a', 'b', 'c', 'd', 'e2', 'g'], pos));
    // в точке расхождения (d) и сразу после неё Иосиф выше Марии
    for (const x of [180, 190, 200]) expect(at(joseph, x).y).toBeLessThan(at(mary, x).y);
  });

  it('звено по толкованию — разреженная нить на отрезке к нему', () => {
    const j = ['a', 'b', 'c', 'e'];
    const m = ['a', 'b', 'c', 'k', 'e'];
    const pos = new Map<string, Pt>([...row(['a', 'b', 'c'], 60), ['k', { x: 180, y: 30 }], ['e', { x: 240, y: 0 }]]);
    const { mary, joseph } = byLine(build(j, m, pos, ['k']));
    expect(joseph.points.some((p) => p.weak)).toBe(false);
    const weak = mary.points.filter((p) => p.weak);
    expect(weak.length).toBeGreaterThan(5);
    // разреженный отрезок — только от c к k
    for (const p of weak) expect(p.x).toBeGreaterThan(120 - A);
    for (const p of weak) expect(p.x).toBeLessThan(180 + 12);
  });

  it('плетение после расхождения разной длины: сверху поочерёдно то Мария, то Иосиф', () => {
    // у Луки на одно поколение больше (как Каинан у Лк 3:36), дальше — общий участок с косой
    const shared = ['h', 'i', 'k', 'l', 'm', 'n', 'o'];
    const j = ['a', 'b', 'c', 'e', ...shared];
    const m = ['a', 'b', 'c', 'x', 'e', ...shared];
    const pos = new Map<string, Pt>([...row(['a', 'b', 'c'], 60), ['x', { x: 150, y: 20 }], ...row(['e', ...shared], 60, 180)]);
    const { mary, joseph } = byLine(build(j, m, pos));
    expect(joseph.points.length).not.toBe(mary.points.length);
    // участки «сверху» в x: у каждой нити — в её собственных индексах
    const span = (st: Strand) => st.over.map(([a, b]) => [st.points[a].x, st.points[b].x, st.line] as const).filter(([a]) => a >= 180);
    const all = [...span(mary), ...span(joseph)].sort((p, q) => p[0] - q[0]);
    expect(span(mary).length).toBeGreaterThan(0);
    expect(span(joseph).length).toBeGreaterThan(0);
    for (let i = 1; i < all.length; i++) {
      expect(all[i][0]).toBeGreaterThanOrEqual(all[i - 1][1] - 1e-6); // не перекрываются
      expect(all[i][2]).not.toBe(all[i - 1][2]); // чередуются
    }
    // каждый участок — от лица до соседнего лица, перекрестье внутри
    for (const [a, b] of all) expect(b - a).toBeCloseTo(60, 0);
  });
});

// ---------- отрисовка ----------

interface Op {
  kind: 'stroke';
  comp: string;
  width: number;
  style: unknown;
  dash: number[];
  segs: string[];
  cap: string;
}

/** Минимальный 2D-контекст: записывает пути и обводки. */
class Rec {
  ops: Op[] = [];
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  lineDashOffset = 0;
  globalCompositeOperation = 'source-over';
  private dash: number[] = [];
  private path: string[] = [];
  private pen: [number, number] | null = null;
  private stack: object[] = [];
  save() {
    this.stack.push({ s: this.strokeStyle, w: this.lineWidth, c: this.lineCap, j: this.lineJoin, g: this.globalCompositeOperation, d: this.dash });
  }
  restore() {
    const t = this.stack.pop() as { s: unknown; w: number; c: string; j: string; g: string; d: number[] };
    Object.assign(this, { strokeStyle: t.s, lineWidth: t.w, lineCap: t.c, lineJoin: t.j, globalCompositeOperation: t.g, dash: t.d });
  }
  setLineDash(d: number[]) {
    this.dash = d;
  }
  beginPath() {
    this.path = [];
    this.pen = null;
  }
  moveTo(x: number, y: number) {
    this.pen = [x, y];
  }
  lineTo(x: number, y: number) {
    this.path.push(`${this.pen![0].toFixed(3)},${this.pen![1].toFixed(3)}>${x.toFixed(3)},${y.toFixed(3)}`);
    this.pen = [x, y];
  }
  stroke() {
    this.ops.push({ kind: 'stroke', comp: this.globalCompositeOperation, width: this.lineWidth, style: this.strokeStyle, dash: this.dash, segs: [...this.path], cap: this.lineCap });
  }
  createLinearGradient() {
    const stops: [number, string][] = [];
    return { stops, addColorStop: (o: number, c: string) => stops.push([o, c]) };
  }
}

const NIGHT: RibbonLook = { night: true, sky: '#0d1b34', halo: '#0d1b34', gold: ['#e6b550', '#c9773a'], azure: ['#9ccbf5', '#9edbd0'], dim: 1, glow: [0.06, 0.1], tone: 0 };
const DAY: RibbonLook = { night: false, sky: '#eef2f6', halo: '#eef2f6', gold: ['#9a6a12', '#8e4a1e'], azure: ['#2b64a8', '#1f7a70'], dim: 1, glow: [0, 0], tone: 0.15 };

function strands(): Strand[] {
  const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
  const m = [...ids.slice(0, 12), 'k', ...ids.slice(12)];
  const pos = new Map<string, Pt>([...row(ids, 50), ['k', { x: 575, y: 25 }]]);
  return build(ids, m, pos, ['k']);
}
const alphaOf = (c: string) => Number(/rgba\([^)]*,([\d.]+)\)/.exec(c)?.[1] ?? 1);
const stopsOf = (s: unknown) => (s as { stops: [number, string][] }).stops;

describe('ленты: отрисовка', () => {
  it('ночью свечение — один путь на нить и слой, без повторных отрезков (нет «бусин» на стыках)', () => {
    const ctx = new Rec();
    const st = strands();
    drawStrands(ctx as unknown as CanvasRenderingContext2D, st, 3, NIGHT, 1600);
    const glow = ctx.ops.filter((o) => o.comp === 'lighter');
    expect(glow.length).toBe(st.length * 2);
    for (const o of glow) expect(new Set(o.segs).size).toBe(o.segs.length);
    // каждый отрезок сплошной части нити входит в слой свечения ровно один раз
    const total = st.reduce((a, s) => a + s.points.slice(1).filter((p) => !p.weak).length, 0);
    expect(glow.slice(0, st.length).reduce((a, o) => a + o.segs.length, 0)).toBe(total);
    // слабое свечение: 0,06 шириной 3,5 нити и 0,10 шириной 2,4 нити
    const widths = [...new Set(glow.map((o) => o.width))];
    expect(widths).toEqual([3 * GLOW_WIDTH[0], 3 * GLOW_WIDTH[1]]);
    const alphas = [...new Set(glow.flatMap((o) => stopsOf(o.style).map(([, c]) => alphaOf(c))))].sort();
    expect(alphas).toEqual([0.06, 0.1]);
    // звено по толкованию не светится
    for (const o of glow) expect(o.dash.length).toBe(0);
  });

  it('нить рисуется одним путём на сплошную часть и одним — на разреженную', () => {
    const ctx = new Rec();
    const st = strands();
    drawStrands(ctx as unknown as CanvasRenderingContext2D, st, 3, NIGHT, 1600);
    const cores = ctx.ops.filter((o) => o.comp === 'source-over' && o.width === 3);
    const dashed = cores.filter((o) => o.dash.length);
    expect(dashed.length).toBeGreaterThan(0);
    for (const o of cores) expect(new Set(o.segs).size).toBe(o.segs.length);
  });

  it('днём у ленты есть вес: светлая подложка, тон своего цвета 15 % и нить толще', () => {
    const ctx = new Rec();
    drawStrands(ctx as unknown as CanvasRenderingContext2D, strands(), 2.4, DAY, 1600);
    expect(ctx.ops.some((o) => o.comp === 'lighter')).toBe(false);
    const halo = ctx.ops.filter((o) => o.style === DAY.halo);
    expect(halo.length).toBeGreaterThan(0);
    for (const o of halo) expect(o.width).toBeGreaterThanOrEqual(DAY_HALO_MIN);
    const tone = ctx.ops.filter((o) => typeof o.style === 'object' && stopsOf(o.style).every(([, c]) => alphaOf(c) === 0.15));
    expect(tone.length).toBeGreaterThan(0);
    for (const o of tone) expect(o.width).toBe(halo[0].width + 1);
    expect(ctx.ops.some((o) => o.width === 3)).toBe(true); // 2,4 + 0,6
  });

  it('при выделенном роде ленты днём не гаснут ниже 0,85, ночью остаются не ниже 3 : 1 к небу', () => {
    expect(ribbonDim(false, false)).toBe(1);
    expect(ribbonDim(false, true)).toBe(1);
    expect(ribbonDim(true, false)).toBeGreaterThanOrEqual(0.85);
    // ночь (ТЗ § 5.2): все четыре конца лент, смешанные с небом, — графика не ниже 3 : 1 (ТЗ § 3.8)
    const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const nightSky = hexToRgb('#0D1B34');
    const d = ribbonDim(true, true);
    expect(d).toBeLessThan(1);
    for (const hex of ['#E6B550', '#C9773A', '#9CCBF5', '#9EDBD0']) {
      const mixed = nightSky.map((s, i) => s + (hexToRgb(hex)[i] - s) * d);
      expect((lum(mixed) + 0.05) / (lum(nightSky) + 0.05)).toBeGreaterThanOrEqual(3);
    }
    // гашение смешивает цвет с небом, а не делает нить прозрачной: цвет начала линии Иосифа = 0,85 золота + 0,15 неба
    const ctx = new Rec();
    drawStrands(ctx as unknown as CanvasRenderingContext2D, strands(), 2.4, { ...DAY, dim: ribbonDim(true, false) }, 1600);
    const sky = hexToRgb(DAY.sky);
    const gold = hexToRgb(DAY.gold[0]);
    const want = `rgb(${sky.map((s, i) => Math.round(s + (gold[i] - s) * 0.85)).join(',')})`;
    const cores = ctx.ops.filter((o) => o.width === 3 && typeof o.style === 'object');
    expect(cores.some((o) => stopsOf(o.style)[0][1] === want)).toBe(true);
  });
});
