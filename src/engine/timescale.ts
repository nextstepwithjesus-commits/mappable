/**
 * Масштаб времени (ТЗ § 3.4, § 8.3 п. 4).
 *
 * Две монотонные функции «год → x», нормированные к одной ширине:
 *  — истинная: линейная, но с разрывом шкалы после завершения канона (100–2040 гг. сжаты в фиксированный отрезок);
 *  — по насыщенности: ширина отрезка времени растёт с плотностью лиц, увеличение ограничено (не более MAG раз);
 *    между узлами — монотонная кубическая интерполяция Фрича — Карлсона (гладкая, без «изломов» на границах).
 * Промежуточные состояния: x = (1 − λ)·x_true + λ·x_dense.
 */
import { toAstro } from './years.ts';

export const T_START = toAstro(-4174) - 20;
export const T_CANON_END = 100;
export const T_END = 2040;
const BIN = 10; // лет
const MAG = 20; // предельное отношение масштабов
export const WORLD_WIDTH = 100_000; // условных единиц по горизонтали

export interface TimeScale {
  knots: number[]; // годы узлов
  xTrue: number[];
  xDense: number[];
  mTrue: number[]; // касательные для интерполяции
  mDense: number[];
  breakT: number; // начало разрыва шкалы (истинный режим)
}

function fritschCarlson(x: number[], y: number[]): number[] {
  const n = x.length;
  const d = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
  const m = new Array<number>(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
}

/**
 * @param births — годы рождения (астр.) всех лиц
 * @param spans — промежутки жизни [начало, конец] для оценки «насыщенности» (сколько следов живёт одновременно)
 */
export function buildTimeScale(births: number[], spans: [number, number][]): TimeScale {
  const knots: number[] = [];
  for (let t = T_START; t < T_CANON_END; t += BIN) knots.push(t);
  knots.push(T_CANON_END);
  const post = [400, 800, 1200, 1600, 2000, T_END]; // после канона — редкие узлы
  for (const t of post) knots.push(t);

  const nb = knots.length - 1;
  const birthsPer = new Float64Array(nb);
  const alivePer = new Float64Array(nb);
  const binOf = (t: number) => {
    if (t >= T_CANON_END) return nb - 1;
    return Math.max(0, Math.min(nb - 1, Math.floor((t - T_START) / BIN)));
  };
  for (const b of births) birthsPer[binOf(b)] += 1;
  for (const [a, e] of spans) {
    const i0 = binOf(a);
    const i1 = binOf(Math.min(e, T_CANON_END - 1));
    for (let i = i0; i <= i1; i++) alivePer[i] += 0.08;
  }
  // сглаживание (гауссово ядро, σ = 3 интервала)
  const dens = new Float64Array(nb);
  const R = 9;
  for (let i = 0; i < nb; i++) {
    let s = 0;
    let w = 0;
    for (let k = -R; k <= R; k++) {
      const j = i + k;
      if (j < 0 || j >= nb) continue;
      const wk = Math.exp(-(k * k) / (2 * 9));
      s += wk * (birthsPer[j] + alivePer[j]);
      w += wk;
    }
    dens[i] = s / w;
  }
  const canonBins = binOf(T_CANON_END - 1) + 1;
  const postWidthShare = 0.035; // доля ширины на время после канона
  // истинная: равные доли по годам до конца канона
  const wTrue = new Float64Array(nb);
  const wDense = new Float64Array(nb);
  for (let i = 0; i < canonBins; i++) {
    wTrue[i] = knots[i + 1] - knots[i];
    const base = 1;
    wDense[i] = (knots[i + 1] - knots[i]) * Math.min(MAG, base + dens[i] * 1.4);
  }
  const norm = (w: Float64Array) => {
    let s = 0;
    for (let i = 0; i < canonBins; i++) s += w[i];
    const k = (WORLD_WIDTH * (1 - postWidthShare)) / s;
    for (let i = 0; i < canonBins; i++) w[i] *= k;
    const postTotal = WORLD_WIDTH * postWidthShare;
    const postYears = T_END - T_CANON_END;
    for (let i = canonBins; i < nb; i++) w[i] = (postTotal * (knots[i + 1] - knots[i])) / postYears;
  };
  norm(wTrue);
  norm(wDense);
  const cum = (w: Float64Array) => {
    const x = [0];
    for (let i = 0; i < nb; i++) x.push(x[i] + w[i]);
    return x;
  };
  const xTrue = cum(wTrue);
  const xDense = cum(wDense);
  return { knots, xTrue, xDense, mTrue: fritschCarlson(knots, xTrue), mDense: fritschCarlson(knots, xDense), breakT: T_CANON_END };
}

function hermite(ts: TimeScale, xs: number[], ms: number[], t: number): number {
  const k = ts.knots;
  if (t <= k[0]) return xs[0] + ms[0] * (t - k[0]);
  const n = k.length;
  if (t >= k[n - 1]) return xs[n - 1] + ms[n - 1] * (t - k[n - 1]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (k[mid] <= t) lo = mid;
    else hi = mid;
  }
  const h = k[hi] - k[lo];
  const s = (t - k[lo]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * xs[lo] + (s3 - 2 * s2 + s) * h * ms[lo] + (-2 * s3 + 3 * s2) * xs[hi] + (s3 - s2) * h * ms[hi];
}

/** Год → горизонтальная координата мира при смешении λ ∈ [0, 1] (0 — истинный, 1 — по насыщенности). */
export function timeToX(ts: TimeScale, t: number, lambda: number): number {
  const a = hermite(ts, ts.xTrue, ts.mTrue, t);
  if (lambda <= 0) return a;
  const b = hermite(ts, ts.xDense, ts.mDense, t);
  return lambda >= 1 ? b : a + (b - a) * lambda;
}

/** Обратное отображение (бисекция). */
export function xToTime(ts: TimeScale, x: number, lambda: number): number {
  let lo = T_START - 200;
  let hi = T_END + 200;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (timeToX(ts, mid, lambda) < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Местный масштаб: сколько лет в единице мира около года t. */
export function yearsPerUnit(ts: TimeScale, t: number, lambda: number): number {
  const dx = timeToX(ts, t + 1, lambda) - timeToX(ts, t, lambda);
  return dx > 0 ? 1 / dx : Infinity;
}
