/**
 * Быстродействие неба (NFR-1; этап 13, X5): кэши кадра дают то же, что прежний расчёт.
 *  — tracePath: оглавление кусков нити пропускает только отрезки, которые прежний обход пропустил бы и так, — те же
 *    moveTo / lineTo в том же порядке на длинной нити со звеньями по толкованию и «по закону», при любых from, to, полосе;
 *  — colorKnots: опоры цвета — одни на массив точек;
 *  — Camera.ky: запомненная высота полосы равна kyFor(kx) после смены любого входа кривой высоты;
 *  — части нити при выделенном роде: те же, что litRanges + sliceStrand, и те же массивы, пока выделение то же;
 *  — проверочные метки кадра (probes): по умолчанию включены (тесты и приёмка их читают).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { StrandPoint, Strand } from '../src/engine/ribbons.ts';

let ribbons: typeof import('../src/render/ribbons.ts');
let camera: typeof import('../src/render/camera.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  ribbons = await import('../src/render/ribbons.ts');
  camera = await import('../src/render/camera.ts');
});

/** Холст, записывающий путь: «M x y», «L x y», «B» (beginPath). */
function pathRecorder() {
  const ops: string[] = [];
  const ctx = {
    beginPath: () => ops.push('B'),
    moveTo: (x: number, y: number) => ops.push(`M ${x} ${y}`),
    lineTo: (x: number, y: number) => ops.push(`L ${x} ${y}`),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

type Part = 'all' | 'solid' | 'weak' | 'legal';
/** Прежний tracePath (до оглавления кусков) — образец. */
function traceRef(ctx: CanvasRenderingContext2D, pts: StrandPoint[], from: number, to: number, part: Part, x0: number, x1: number, ext = 0): boolean {
  ctx.beginPath();
  let pen = false;
  let any = false;
  const end = Math.min(to, pts.length - 1);
  const start = Math.max(0, from);
  const past = (a: StrandPoint, b: StrandPoint): [number, number] => {
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    return [a.x + ((a.x - b.x) / d) * ext, a.y + ((a.y - b.y) / d) * ext];
  };
  for (let i = start; i < end; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const take = part === 'all' || (part === 'weak' ? b.weak : part === 'legal' ? !b.weak && !!b.legal : !b.weak && !b.legal);
    if (!take || Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1) {
      pen = false;
      continue;
    }
    if (!pen) {
      if (ext && i === start) ctx.moveTo(...past(a, b));
      else ctx.moveTo(a.x, a.y);
      pen = true;
    }
    if (ext && i === end - 1) ctx.lineTo(...past(b, a));
    else ctx.lineTo(b.x, b.y);
    any = true;
  }
  return any;
}

/** Длинная нить-маршрут: шаг 4 px вперёд, ступеньки вниз и вверх (x стоит), участки по толкованию и «по закону». */
function longStrand(n: number, seed = 11): StrandPoint[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts: StrandPoint[] = [];
  let x = -30000;
  let y = 200;
  let weak = false;
  let legal = false;
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.01) weak = !weak;
    if (!weak && rnd() < 0.004) legal = !legal;
    if (rnd() < 0.05) y += (rnd() - 0.5) * 40;
    else x += 4 * (0.5 + rnd());
    pts.push({ x, y, t: i / n, u: (i / n) * 77, weak, ...(legal ? { legal: true } : {}) });
  }
  return pts;
}

describe('tracePath: оглавление кусков нити', () => {
  it('те же moveTo и lineTo, что у прежнего обхода, — 400 случаев на нити в 20 000 точек', () => {
    const pts = longStrand(20000);
    let s = 5;
    const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    const parts: Part[] = ['all', 'solid', 'weak', 'legal'];
    for (let k = 0; k < 400; k++) {
      const from = rnd() < 0.3 ? 0 : Math.floor(rnd() * pts.length);
      const to = rnd() < 0.3 ? pts.length : from + Math.floor(rnd() * 3000);
      const part = parts[k % 4];
      const inf = rnd() < 0.25;
      const x0 = inf ? -Infinity : pts[Math.floor(rnd() * pts.length)].x;
      const x1 = inf ? Infinity : x0 + rnd() * 3000;
      const ext = rnd() < 0.3 ? 1 : 0;
      const a = pathRecorder();
      const b = pathRecorder();
      const ra = ribbons.tracePath(a.ctx, pts, from, to, part, x0, x1, ext);
      const rb = traceRef(b.ctx, pts, from, to, part, x0, x1, ext);
      expect(ra).toBe(rb);
      expect(a.ops).toEqual(b.ops);
    }
  });

  it('короткие нити и края: пустая, из одной и двух точек, ровно кусок и кусок с точкой', () => {
    for (const n of [0, 1, 2, 63, 64, 65, 128, 129]) {
      const pts = longStrand(n, 3 + n);
      for (const part of ['all', 'solid', 'weak', 'legal'] as Part[]) {
        const a = pathRecorder();
        const b = pathRecorder();
        expect(ribbons.tracePath(a.ctx, pts, 0, n, part, -Infinity, Infinity, 1)).toBe(traceRef(b.ctx, pts, 0, n, part, -Infinity, Infinity, 1));
        expect(a.ops).toEqual(b.ops);
      }
    }
  });
});

describe('colorKnots', () => {
  it('опоры — одни на массив точек и те же, что у нового массива с теми же точками', () => {
    const pts = longStrand(5000);
    const k1 = ribbons.colorKnots(pts);
    expect(ribbons.colorKnots(pts)).toBe(k1);
    expect(ribbons.colorKnots(pts.slice())).toEqual(k1);
  });
});

describe('Camera.ky: запомненная высота полосы', () => {
  it('равна kyFor(kx) после смены каждого входа кривой высоты', () => {
    const cam = new camera.Camera();
    const check = () => expect(cam.ky).toBe(cam.kyFor(cam.kx));
    check();
    const steps: (() => void)[] = [
      () => (cam.kx = cam.kx * 3.7),
      () => (cam.lanes = 2.5),
      () => (cam.focusLanes = 12),
      () => (cam.rowCap = 34),
      () => (cam.rowShift = 1.5),
      () => (cam.h = 1200),
      () => (cam.laneSpan = 40),
      () => (cam.vp = { ...cam.vp, t: 90 }),
      () => (cam.vp = { ...cam.vp, b: 500 }),
      () => (cam.fitK = { kx: cam.kx / 2, ky: 9 }),
      () => (cam.fitK = { kx: cam.kx / 3, ky: 7 }),
      () => (cam.fitK = null),
      () => (cam.lanes = 1),
      () => (cam.focusLanes = 0),
      () => (cam.kx = 0.02),
    ];
    for (const f of steps) {
      f();
      check();
    }
    // подмена кривой у экземпляра (tools/census.ts) — сразу в силе
    (cam as unknown as { kyAuto: (k: number) => number }).kyAuto = () => 17;
    expect(cam.ky).toBe(17);
  });
});

describe('ленты при выделенном роде', () => {
  it('части нити — те же, что litRanges + sliceStrand, и те же массивы, пока выделение то же', () => {
    const ids = Array.from({ length: 78 }, (_, k) => `p${k}`);
    const st: Strand = { line: 'joseph', ids, points: longStrand(6000), over: [[10, 40], [900, 960], [3000, 3100]] };
    const ref = (lit: (id: string) => boolean) => ribbons.litRanges(st, lit).map(([a, b]) => ribbons.sliceStrand(st, a, b));
    const lit1 = new Set(ids.slice(20, 40));
    const f1 = (id: string) => lit1.has(id);
    const a = ribbons.litParts(st, f1);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(ref(f1));
    // то же выделение другой функцией (новая карта выделения в каждом кадре) — те же массивы
    expect(ribbons.litParts(st, (id) => new Set(ids.slice(20, 40)).has(id))).toBe(a);
    const lit2 = new Set([...ids.slice(5, 9), ...ids.slice(50, 70)]);
    const f2 = (id: string) => lit2.has(id);
    const b = ribbons.litParts(st, f2);
    expect(b).not.toBe(a);
    expect(b).toEqual(ref(f2));
    expect(ribbons.litParts(st, () => false)).toEqual([]);
  });
});

describe('проверочные метки кадра', () => {
  it('по умолчанию включены: тесты рисуют небо без браузера и читают canvas.dataset', async () => {
    const sky = await import('../src/render/sky.ts');
    expect(sky.probes.on).toBe(true);
  });
});
