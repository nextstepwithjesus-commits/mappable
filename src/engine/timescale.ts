/**
 * Масштаб времени (ТЗ § 3.4, § 8.3 п. 4; этап 21, решение 196).
 *
 * Две монотонные функции «год → x», нормированные к одной ширине:
 *  — истинная («Равномерный по годам»): линейная, но с разрывом шкалы после завершения канона (100–2040 гг. сжаты
 *    в фиксированный отрезок);
 *  — по эпохам (этап 21, решение 196; прежде «Сжатый по плотности лиц», решения 1, 124, «по насыщенности»): ширина
 *    отрезка времени растёт с плотностью лиц, увеличение ограничено (не более DENSE_MAG раз). Рамка неба в этом режиме
 *    называет эпохи, а не годы (src/render/axis.ts): год лица — в карточке, год окна — на полосе времени внизу. Поколения
 *    эпох (eraGenerations: самая длинная цепочка «родитель → ребёнок» внутри эпохи) — признак модели, у которой есть
 *    эпохи для этой линейки. Масштабную линейку «поколение ≈ N лет» по ним сняла рецензия этапа 21: длина поколения
 *    выходила из оценок решателя, а не из чисел текста; линейка — местная, в годах.
 *    Ширину эпохи по числу поколений проверяли (этап 21): равный шаг поколений, но семья Иакова и Египет сжимались на треть,
 *    и проверки читаемости всего неба (tests/census.test.ts: пересечения связей со следами, ромбы на чужих чертах) не
 *    проходили ни при какой доле поколений от 0,35 до 1 — геометрия осталась прежней.
 *    Между узлами — монотонная кубическая интерполяция Фрича — Карлсона (гладкая, без «изломов» на границах).
 * Промежуточные состояния: x = (1 − λ)·x_true + λ·x_dense.
 */
import { toAstro } from './years.ts';

export const T_START = toAstro(-4174) - 20;
export const T_CANON_END = 100;
export const T_END = 2040;
const BIN = 10; // лет
/**
 * Предельное растяжение «по насыщенности»: самый растянутый участок шкалы не длиннее самого сжатого больше чем в MAG раз
 * (решение владельца 1; прежде MAG = 20, и 120 лет Моисея выходили длиннее 930 лет Адама — MAP-31).
 */
export const DENSE_MAG = 6;
const MAG = DENSE_MAG;
export const WORLD_WIDTH = 100_000; // условных единиц по горизонтали

export interface TimeScale {
  knots: number[]; // годы узлов
  xTrue: number[];
  xDense: number[];
  mTrue: number[]; // касательные для интерполяции
  mDense: number[];
  breakT: number; // начало разрыва шкалы (истинный режим)
  /** поколений в эпохах (рамка «по эпохам», решение 196); нет — рамка размечена годами в обоих режимах */
  gens?: ReadonlyMap<string, number>;
}

export function fritschCarlson(x: number[], y: number[]): number[] {
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

/** Эпоха для рамки «по эпохам» (решение 196): годы — астрономические, gens — поколений, рождённых в эпохе. */
export interface EraSpan {
  id: string;
  start: number;
  end: number;
  gens: number;
}
/** Доля поколений в ширине эпохи (решение 196): остальное — по плотности лиц. */
export let ERA_BLEND = 0.35;
export const setEraBlend = (k: number) => (ERA_BLEND = k);
/** Меньше стольких поколений в эпохе не считается: у Исхода, Плена и эпох без рождений линейка «поколение» не нулевая. */
export const MIN_GENS = 2;

/**
 * Поколения эпох (решение 196): у каждого лица — номер в цепочке «родитель → ребёнок» внутри эпохи его рождения
 * (родитель — отец, а если его нет — мать; родитель из другой эпохи начинает цепочку заново), у эпохи — самая длинная
 * цепочка. Лица без эпохи не считаются. Порядок лиц не важен: цепочки считаются по рождению.
 */
export function eraGenerations(
  persons: readonly { id: string; parent: string | null; b: number; epoch: string | null }[],
  epochs: readonly { id: string; start: number; end: number }[],
): EraSpan[] {
  const by = new Map(persons.map((p) => [p.id, p]));
  const k = new Map<string, number>();
  const sorted = [...persons].sort((a, b) => a.b - b.b);
  const gens = new Map<string, number>();
  for (const p of sorted) {
    if (!p.epoch) continue;
    const par = p.parent ? by.get(p.parent) : undefined;
    const v = par && par.epoch === p.epoch && k.has(par.id) ? k.get(par.id)! + 1 : 0;
    k.set(p.id, v);
    gens.set(p.epoch, Math.max(gens.get(p.epoch) ?? 0, v + 1));
  }
  return epochs.map((e) => ({ id: e.id, start: e.start, end: e.end, gens: Math.max(MIN_GENS, gens.get(e.id) ?? 0) }));
}

/**
 * @param births — годы рождения (астр.) всех лиц
 * @param spans — промежутки жизни [начало, конец] для оценки «насыщенности» (сколько следов живёт одновременно)
 * @param eras — эпохи с поколениями (eraGenerations): линейка эпох (решение 196);
 *               без них (синтетические данные) рамка размечена годами в обоих режимах
 */
export function buildTimeScale(births: number[], spans: [number, number][], eras?: readonly EraSpan[]): TimeScale {
  // начало шкалы — сотворение по масоретским числам или раньше, если модель (числа в скобках) удревняет Адама
  const minBirth = births.reduce((a, b) => Math.min(a, b), Infinity);
  const start = minBirth - 20 < T_START ? Math.floor((minBirth - 20) / BIN) * BIN : T_START;
  const knots: number[] = [];
  for (let t = start; t < T_CANON_END; t += BIN) knots.push(t);
  knots.push(T_CANON_END);
  const post = [400, 800, 1200, 1600, 2000, T_END]; // после канона — редкие узлы
  for (const t of post) knots.push(t);

  const nb = knots.length - 1;
  const birthsPer = new Float64Array(nb);
  const alivePer = new Float64Array(nb);
  const binOf = (t: number) => {
    if (t >= T_CANON_END) return nb - 1;
    return Math.max(0, Math.min(nb - 1, Math.floor((t - start) / BIN)));
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
  // растяжение отрезка — от 1 до MAG; после ограничения сглаживается ещё раз (σ = 2 интервала): у предела нет ступеньки,
  // и кубическая интерполяция между узлами не выходит за 1 : MAG заметно
  const stretch = new Float64Array(canonBins);
  for (let i = 0; i < canonBins; i++) stretch[i] = Math.min(MAG, 1 + dens[i] * 1.4);
  for (let i = 0; i < canonBins; i++) {
    wTrue[i] = knots[i + 1] - knots[i];
    let s = 0;
    let w = 0;
    for (let k = -6; k <= 6; k++) {
      const j = i + k;
      if (j < 0 || j >= canonBins) continue;
      const wk = Math.exp(-(k * k) / (2 * 4));
      s += wk * stretch[j];
      w += wk;
    }
    wDense[i] = (knots[i + 1] - knots[i]) * (s / w);
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
  const byEra = !!eras && eras.length > 0;
  norm(wTrue);
  norm(wDense);
  const cum = (w: Float64Array) => {
    const x = [0];
    for (let i = 0; i < nb; i++) x.push(x[i] + w[i]);
    return x;
  };
  const xTrue = cum(wTrue);
  const xDense = cum(wDense);
  return {
    knots, xTrue, xDense, mTrue: fritschCarlson(knots, xTrue), mDense: fritschCarlson(knots, xDense), breakT: T_CANON_END,
    ...(byEra ? { gens: new Map(eras!.map((e) => [e.id, e.gens])) } : {}),
  };
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

/** Год → горизонтальная координата мира при смешении λ ∈ [0, 1] (0 — истинный, 1 — по эпохам). */
export function timeToX(ts: TimeScale, t: number, lambda: number): number {
  const a = hermite(ts, ts.xTrue, ts.mTrue, t);
  if (lambda <= 0) return a;
  const b = hermite(ts, ts.xDense, ts.mDense, t);
  return lambda >= 1 ? b : a + (b - a) * lambda;
}

/** Обратное отображение (бисекция). */
export function xToTime(ts: TimeScale, x: number, lambda: number): number {
  let lo = ts.knots[0] - 200;
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

/** Восстановить масштаб из сохранённых узлов (касательные пересчитываются). */
export function hydrateScale(raw: { knots: number[]; xTrue: number[]; xDense: number[]; gens?: [string, number][] }): TimeScale {
  return {
    ...(raw.gens ? { gens: new Map(raw.gens) } : {}),
    knots: raw.knots,
    xTrue: raw.xTrue,
    xDense: raw.xDense,
    mTrue: fritschCarlson(raw.knots, raw.xTrue),
    mDense: fritschCarlson(raw.knots, raw.xDense),
    breakT: T_CANON_END,
  };
}
