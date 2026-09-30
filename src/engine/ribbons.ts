/**
 * Геометрия лент линий Мессии (ТЗ § 3.2, § 8.4; E6: MAP-26, MAP-27, находка образца об изломе на стыке).
 * Считается в экранных координатах на каждый кадр (≈ 140 опорных точек, дёшево), поэтому правила «в пикселях»
 * выполняются точно.
 *
 * — Средняя линия каждой нити — один кубический сплайн Эрмита через рождения всех лиц своей линии; касательная
 *   в лице — биссектриса соседних хорд, а на стыке общего и раздельного участков — одна для обеих линий, вдоль общего
 *   участка. Раньше сплайн строился по участкам, и на стыке касательная рвалась (излом нити, находка образца).
 *   Смещение нити от средней линии тоже гладкое: на стыках у него нулевая производная.
 * — Общие участки (одинаковые соседние лица в обеих линиях): коса. В лицах нити стоят по обе стороны («бусина между
 *   нитями»); на каждом поколении — ровно одно перекрестье, посередине между лицами: коса считает поколения (ТЗ § 8.4;
 *   решение 40, MAP-75). Перекрестье занимает CROSS_LEN·A px по длине, остальное поколение нити идут параллельно
 *   на ±A — длинное поколение не раскрывается «глазом», похожим на развилку (MAP-27). Фаза подобрана так, что
 *   у точки расхождения и схождения нить Иосифа — сверху; если число поколений участка между двумя расхождениями
 *   нечётно, на самом коротком поколении перекрестья нет (лишнего перекрестья, которое читалось бы поколением, нет).
 * — Плетение (Strand.over): в перекрестьях поверх поочерёдно то Мария, то Иосиф; участок «поверх» — только само
 *   перекрестье, его концы — там, где нити уже разошлись на 2A: подложка верхней нити даёт у нижней разрыв.
 * — Раздельные участки: одна нить своей линии с мягкой волной не больше 0,25·A и периодом три поколения;
 *   волна гаснет, когда поколения на экране ближе 60 px (без ряби, MAP-26).
 * — Если поколения на экране ближе MIN_GEN_PX, коса плавно заменяется двумя параллельными нитями.
 *   Порог считается по каждому поколению отдельно.
 * — Смещение нити не больше радиуса кривизны средней линии: иначе на крутом повороте нить делает петлю.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface StrandPoint {
  x: number;
  y: number;
  t: number; // 0…1 вдоль всей линии (для цвета)
  weak: boolean; // звено по толкованию
  /** место в своей линии: номер лица (дробный — между лицами); для наведения и участка синопсиса */
  u: number;
  /** шаг «по закону» (Иосиф → Иисус, Мф 1:16): штрихом, как связь иного рода (Г10) */
  legal?: boolean;
}

export interface Strand {
  line: 'joseph' | 'mary';
  points: StrandPoint[];
  /** лица своей линии, по которым построена нить (u — номер в этом списке) */
  ids: string[];
  /**
   * Пропуски показа (этап 13, решение 93, К4): gaps[k] — сколько лиц линии между ids[k − 1] и ids[k] скрыто показом
   * (0 или нет — соседи по данным). В разрыве такого шага небо ставит знак «+N»; шаг — связь вида span («цепочка»).
   */
  gaps?: number[];
  /**
   * Плетение (MAP-75): перекрестья косы, где эта нить лежит поверх другой, — пары [начало, конец] в индексах точек
   * этой же нити, включительно. Концы — там, где нити уже разошлись на 2A: подложка верхней нити даёт разрыв только
   * у нижней нити в самом перекрестье. Раздельные участки у линий разной длины, поэтому индексы двух нитей после
   * первого расхождения не совпадают.
   */
  over: [number, number][];
}

/**
 * Лицо линии для нити: weak — шаг к нему по толкованию (точки; только Илий → Мария, решение 94); legal — иное
 * происхождение (штрих: по закону, Нирий → Салафиил по Луке); gap — сколько лиц линии перед ним скрыто показом.
 */
export interface RibbonStep {
  id: string;
  weak: boolean;
  legal?: boolean;
  gap?: number;
}

export interface RibbonInput {
  joseph: RibbonStep[];
  mary: RibbonStep[];
  project: (id: string) => Pt | null;
  amplitude: number; // px
  meander: number; // px — наибольшая волна одиночной нити (не больше 0,25·A)
  /** видимая полоса по x (px): поколения целиком за ней считаются грубо — их всё равно не рисуют */
  clip?: [number, number];
  /**
   * Наибольший увод средней линии от лица при сглаживании тесных поколений, px (этап 13, X3 Д9, Ч5): нить проходит
   * не дальше полустроки от своей бусины; если сгладить дальше нельзя, она идёт ближе к звезде. Нет — без предела.
   */
  hold?: number;
}

/**
 * Амплитуда косы на общих участках, px (MAP-60, MAP-62): тугая коса не шире 3 px и не зависит от высоты строки —
 * расхождение линий (разные строки) тогда не спутать с волной косы.
 */
export const BRAID_PX = 3;

const SAMPLES = 14;
/** Точек сплайна на пиксель длины поколения: не реже 1 на 6 px; в перекрестье — чаще (CROSS_SAMPLES). */
const SAMPLE_PX = 6;
const MIN_GEN_PX = 24;
/**
 * Длина перекрестья по поколению — CROSS_LEN·A px (MAP-75; решение 40): на ленте неба (A = 3 px) — 15 px, угол
 * перекрестья от A не зависит. Короче поколения — перекрестье во всё поколение.
 */
export const CROSS_LEN = 5;
/** Точек сплайна в перекрестье: не меньше стольких, чтобы S-образный переход был гладким. */
const CROSS_SAMPLES = 16;
/** Волна одиночной нити: не больше 0,25·A, период три поколения, гаснет при шаге поколения меньше 60 px (MAP-26). */
export const MEANDER_MAX = 0.25;
export const MEANDER_PERIOD = 3;
const MEANDER_FULL_PX = 60;

/**
 * Направления касательной в лицах линии: во внутренних лицах — биссектриса соседних хорд (без петель и выбросов),
 * на концах — хорда; в лицах из dirs — заданное направление (стыки общих и раздельных участков, общее для обеих линий).
 */
function tangentsOf(pts: Pt[], dirs: Map<number, Pt>): Pt[] {
  const unit = (x: number, y: number): Pt | null => {
    const l = Math.hypot(x, y);
    return l > 1e-9 ? { x: x / l, y: y / l } : null;
  };
  return pts.map((p, i) => {
    const d = dirs.get(i);
    if (d) return d;
    const a = i > 0 ? unit(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : null;
    const b = i < pts.length - 1 ? unit(pts[i + 1].x - p.x, pts[i + 1].y - p.y) : null;
    if (a && b) return unit(a.x + b.x, a.y + b.y) ?? b;
    return a ?? b ?? { x: 1, y: 0 };
  });
}

interface Sample {
  x: number;
  y: number;
  u: number; // номер поколения в последовательности (дробный)
  nx: number; // нормаль
  ny: number;
  rad: number; // радиус кривизны, px
}

/** Точек на поколение: не меньше SAMPLES и не реже одной на SAMPLE_PX; за видимой полосой clip — 4. */
const offClip = (a: Pt, b: Pt, clip?: [number, number]) => !!clip && ((a.x < clip[0] && b.x < clip[0]) || (a.x > clip[1] && b.x > clip[1]));
const samplesFor = (a: Pt, b: Pt, clip?: [number, number]) =>
  offClip(a, b, clip) ? 4 : Math.max(SAMPLES, Math.min(240, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SAMPLE_PX)));

/**
 * Средняя линия нити — кубические сегменты Эрмита между лицами с касательными tangents (длина касательной — хорда
 * сегмента). Касательная в каждом лице одна на оба соседних сегмента, поэтому линия гладкая и на стыках участков.
 * Нормаль и радиус кривизны — по производным сегмента, точно. dense(i) — промежуток параметра сегмента i
 * (перекрестье косы), где точек больше: не меньше CROSS_SAMPLES.
 */
function sampleSpline(pts: Pt[], tangents: Pt[], clip?: [number, number], dense?: (i: number) => [number, number] | null): Sample[] {
  const out: Sample[] = [];
  if (pts.length === 0) return out;
  if (pts.length === 1) return [{ x: pts[0].x, y: pts[0].y, u: 0, nx: 0, ny: -1, rad: Infinity }];
  for (let i = 0; i < pts.length - 1; i++) {
    const P0 = pts[i];
    const P1 = pts[i + 1];
    const c = Math.max(1e-3, Math.hypot(P1.x - P0.x, P1.y - P0.y));
    const m0 = { x: tangents[i].x * c, y: tangents[i].y * c };
    const m1 = { x: tangents[i + 1].x * c, y: tangents[i + 1].y * c };
    const N = samplesFor(P0, P1, clip);
    const params: number[] = [];
    for (let k = 0; k < N; k++) params.push(k / N);
    const win = dense && !offClip(P0, P1, clip) ? dense(i) : null;
    if (win) {
      const [a, b] = win;
      const M = Math.max(CROSS_SAMPLES, Math.ceil(((b - a) * c) / 1.5));
      for (let k = 0; k <= M; k++) params.push(a + ((b - a) * k) / M);
    }
    if (i === pts.length - 2) params.push(1);
    params.sort((x, y) => x - y);
    for (let k = 0; k < params.length; k++) {
      if (k > 0 && params[k] - params[k - 1] < 1e-6) continue;
      const s = params[k];
      const s2 = s * s;
      const s3 = s2 * s;
      const h = [2 * s3 - 3 * s2 + 1, s3 - 2 * s2 + s, -2 * s3 + 3 * s2, s3 - s2];
      const d = [6 * s2 - 6 * s, 3 * s2 - 4 * s + 1, -6 * s2 + 6 * s, 3 * s2 - 2 * s];
      const e = [12 * s - 6, 6 * s - 4, -12 * s + 6, 6 * s - 2];
      const at = (w: number[]) => ({ x: w[0] * P0.x + w[1] * m0.x + w[2] * P1.x + w[3] * m1.x, y: w[0] * P0.y + w[1] * m0.y + w[2] * P1.y + w[3] * m1.y });
      const q = at(h);
      const d1 = at(d);
      const d2 = at(e);
      const l = Math.hypot(d1.x, d1.y) || 1;
      const cr = Math.abs(d1.x * d2.y - d1.y * d2.x);
      // нормаль «вверх» по экрану: (dy, −dx) при движении вправо
      out.push({ x: q.x, y: q.y, u: i + s, nx: d1.y / l, ny: -d1.x / l, rad: cr > 1e-9 ? (l * l * l) / cr : Infinity });
    }
  }
  return out;
}

const smooth01 = (k: number) => {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
};
/** Плавная ступень 0…1: 0 при шаге поколения ≤ MIN_GEN_PX / 2, 1 при ≥ MIN_GEN_PX. */
function waveWeight(genPx: number): number {
  return smooth01((genPx - MIN_GEN_PX / 2) / (MIN_GEN_PX / 2));
}

/**
 * Вес по поколениям: у узла — меньший из двух соседних шагов, между узлами — линейно. Шаг поколения — по времени (x):
 * соседние лица линии часто стоят в чередующихся полосах, и по прямой они «дальше», чем тесны на самом деле.
 */
function nodeWeights(pts: Pt[], weight: (px: number) => number): number[] {
  const seg = pts.slice(1).map((p, i) => weight(Math.abs(p.x - pts[i].x)));
  return pts.map((_, i) => Math.min(seg[i - 1] ?? 1, seg[i] ?? 1));
}
const weightAt = (w: number[], u: number) => {
  const i = Math.min(w.length - 1, Math.floor(u));
  const f = u - i;
  return i + 1 < w.length ? w[i] * (1 - f) + w[i + 1] * f : w[i];
};

/**
 * Средняя линия там, где поколения на экране теснее порога, сглаживается по вертикали: соседние лица линии
 * часто стоят в чередующихся полосах, и на обзорном масштабе нить иначе идёт мелким зигзагом.
 * Сглаживание идёт внутри участков [a, b] из fixed: концы участков (точки расхождения и схождения) не двигаются,
 * поэтому общие участки у двух линий остаются одинаковыми.
 */
function smoothDense(pts: Pt[], w: number[], fixed: Set<number>, hold = Infinity): Pt[] {
  if (pts.length < 3) return pts;
  let ys = pts.map((p) => p.y);
  for (let it = 0; it < 4; it++) ys = ys.map((y, i) => (i === 0 || i === ys.length - 1 || fixed.has(i) ? y : (ys[i - 1] + 2 * y + ys[i + 1]) / 4));
  // сглаженная средняя линия — не дальше hold от своего лица (Ч5): иначе лицо «не на линии»
  const near = (p: Pt, y: number) => Math.max(p.y - hold, Math.min(p.y + hold, y));
  return pts.map((p, i) => (i === 0 || i === pts.length - 1 || fixed.has(i) ? p : { x: p.x, y: near(p, p.y * w[i] + ys[i] * (1 - w[i])) }));
}

/** Смещение, ограниченное радиусом кривизны (петли на крутых поворотах). */
function clampOff(off: number, s: Sample): number {
  const lim = s.rad * 0.8;
  return Math.max(-lim, Math.min(lim, off));
}

interface Run {
  kind: 'shared' | 'joseph' | 'mary';
  ids: string[];
}

/** Разбиение двух последовательностей на общие и раздельные участки. */
export function splitRuns(j: string[], m: string[]): Run[] {
  return runSpans(j, m).flatMap((r): Run[] =>
    r.kind === 'shared'
      ? [{ kind: 'shared', ids: j.slice(r.j[0], r.j[1] + 1) }]
      : [
          { kind: 'joseph', ids: j.slice(r.j[0], r.j[1] + 1) },
          { kind: 'mary', ids: m.slice(r.m[0], r.m[1] + 1) },
        ],
  );
}

/**
 * Участки двух линий в номерах лиц: общий — [a, b] в каждой линии; раздельный — от точки расхождения до точки
 * схождения включительно (у начала и конца линий — от первого или до последнего лица).
 */
export interface RunSpan {
  kind: 'shared' | 'split';
  j: [number, number];
  m: [number, number];
}
export function runSpans(j: string[], m: string[]): RunSpan[] {
  const out: RunSpan[] = [];
  let a = 0;
  let b = 0;
  while (a < j.length && b < m.length) {
    if (j[a] === m[b]) {
      const a0 = a;
      const b0 = b;
      while (a + 1 < j.length && b + 1 < m.length && j[a + 1] === m[b + 1]) {
        a++;
        b++;
      }
      out.push({ kind: 'shared', j: [a0, a], m: [b0, b] });
      a++;
      b++;
      continue;
    }
    // ближайшая точка схождения
    let na = -1;
    let nb = -1;
    outer: for (let i = a; i < j.length; i++) {
      for (let k = b; k < m.length; k++)
        if (j[i] === m[k]) {
          na = i;
          nb = k;
          break outer;
        }
    }
    if (na < 0) {
      na = j.length;
      nb = m.length;
    }
    // раздельный участок включает точки расхождения и схождения — нить непрерывна
    out.push({ kind: 'split', j: [Math.max(0, a - 1), Math.min(j.length - 1, na)], m: [Math.max(0, b - 1), Math.min(m.length - 1, nb)] });
    a = na;
    b = nb;
  }
  return out;
}

/**
 * Фаза косы общего участка по поколениям: φ в лицах — кратна π (нити по разные стороны), на каждом поколении — одно
 * перекрестье, φ растёт на π (решение 40: коса считает поколения). Если участок с обеих сторон граничит
 * с расхождением, у обоих концов φ ≡ 0 (Иосиф сверху): при нечётном числе поколений на самом коротком поколении
 * перекрестья нет (нити там параллельны) — второе перекрестье на одном поколении читалось бы лишним поколением.
 * Возвращает φ в каждом лице участка и число перекрестий (0 или 1) на каждом поколении.
 */
export function braidPhase(lens: number[], anchor: 'start' | 'end' | 'both'): { phi: number[]; turns: number[] } {
  const turns = lens.map(() => 1);
  if (anchor === 'both' && lens.length % 2 === 1) {
    let k = 0;
    for (let i = 1; i < lens.length; i++) if (lens[i] < lens[k]) k = i;
    turns[k] = 0;
  }
  const phi = [0];
  for (const t of turns) phi.push(phi[phi.length - 1] + Math.PI * t);
  if (anchor === 'end') {
    const end = phi[phi.length - 1];
    for (let i = 0; i < phi.length; i++) phi[i] -= end;
  }
  return { phi, turns };
}

/** Плавное сведение к краю участка: 1 у края (с нулевой производной), 0 с половины поколения. */
const taper = (e: number) => (e >= 0.5 ? 0 : 0.5 * (1 + Math.cos(2 * Math.PI * e)));

export function buildRibbons(inp: RibbonInput): Strand[] {
  const A = inp.amplitude;
  const lines = (['joseph', 'mary'] as const).map((line) => {
    const steps = inp[line].map((s) => ({ ...s, p: inp.project(s.id) })).filter((s): s is typeof s & { p: Pt } => !!s.p);
    return { line, ids: steps.map((s) => s.id), weak: steps.map((s) => s.weak), legal: steps.map((s) => !!s.legal), gaps: steps.map((s) => s.gap ?? 0), raw: steps.map((s) => s.p) };
  });
  const [J, M] = lines;
  const spans = runSpans(J.ids, M.ids);
  const out: Strand[] = [];
  // средние линии: тесные поколения сглажены внутри участков; концы участков неподвижны
  const prep = lines.map((L) => {
    const my = (r: RunSpan) => (L.line === 'joseph' ? r.j : r.m);
    const fixed = new Set<number>();
    for (const r of spans) {
      fixed.add(my(r)[0]);
      fixed.add(my(r)[1]);
    }
    const wBraid = nodeWeights(L.raw, waveWeight);
    // средняя линия сглаживается, пока шаг поколения меньше 60 px: чередование полос у соседних лиц — не рябь (MAP-26)
    const wSmooth = nodeWeights(L.raw, (px) => smooth01((px - MEANDER_FULL_PX / 2) / (MEANDER_FULL_PX / 2)));
    return { my, wBraid, pts: smoothDense(L.raw, wSmooth, fixed, inp.hold), dirs: new Map<number, Pt>() };
  });
  // касательная на стыках общих и раздельных участков — одна для обеих линий: вдоль общего участка,
  // а у общего участка из одного лица — по сумме направлений обеих линий (излом нити на стыке, находка образца)
  const unit = (x: number, y: number): Pt | null => {
    const l = Math.hypot(x, y);
    return l > 1e-9 ? { x: x / l, y: y / l } : null;
  };
  const chord = (pts: Pt[], a: number, b: number) => (a >= 0 && b < pts.length && a !== b ? unit(pts[b].x - pts[a].x, pts[b].y - pts[a].y) : null);
  for (const r of spans) {
    if (r.kind !== 'shared') continue;
    const [pj, pm] = prep;
    const [a, b] = r.j;
    const [c, d] = r.m;
    let startDir: Pt | null;
    let endDir: Pt | null;
    if (b > a) {
      startDir = chord(pj.pts, a, a + 1);
      endDir = chord(pj.pts, b - 1, b);
    } else {
      // одно лицо: сумма направлений обеих линий в нём
      const parts = [chord(pj.pts, a - 1, a), chord(pj.pts, a, a + 1), chord(pm.pts, c - 1, c), chord(pm.pts, c, c + 1)].filter((q): q is Pt => !!q);
      startDir = endDir = unit(parts.reduce((s2, q) => s2 + q.x, 0), parts.reduce((s2, q) => s2 + q.y, 0));
    }
    if (startDir) {
      pj.dirs.set(a, startDir);
      pm.dirs.set(c, startDir);
    }
    if (endDir) {
      pj.dirs.set(b, endDir);
      pm.dirs.set(d, endDir);
    }
  }
  lines.forEach((L, li) => {
    const isJ = L.line === 'joseph';
    const sign = isJ ? 1 : -1;
    const n = L.raw.length;
    const { my, wBraid, pts } = prep[li];
    const wMeander = nodeWeights(pts, (px) => smooth01((px - MEANDER_FULL_PX * 0.66) / (MEANDER_FULL_PX * 0.34)));
    const total = Math.max(1, n - 1);
    // участок каждого поколения k → k+1
    const genRun = new Array<number>(Math.max(0, n - 1)).fill(-1);
    spans.forEach((r, ri) => {
      const [a, b] = my(r);
      for (let k = a; k < b; k++) if (r.kind === 'split' || genRun[k] < 0) genRun[k] = ri;
    });
    // фаза косы по общим участкам: одно перекрестье на поколение (решение 40)
    const phase = new Map<number, { a: number; phi: number[]; turns: number[]; cross: number[] }>();
    const genLen = (k: number) => Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y);
    spans.forEach((r, ri) => {
      if (r.kind !== 'shared') return;
      const [a, b] = my(r);
      const lens: number[] = [];
      for (let k = a; k < b; k++) lens.push(genLen(k));
      const hasPrev = ri > 0;
      const hasNext = ri < spans.length - 1;
      const ph = braidPhase(lens, hasPrev && hasNext ? 'both' : hasPrev ? 'start' : 'end');
      // номер перекрестья на участке у каждого поколения: плетение поочерёдное
      const cross: number[] = [];
      let j = 0;
      for (const t of ph.turns) cross.push(t ? j++ : -1);
      phase.set(ri, { a, ...ph, cross });
    });
    /** Перекрестье поколения k в долях поколения: [начало, конец] вокруг середины, CROSS_LEN·A px; null — его нет. */
    const window = (k: number): [number, number] | null => {
      const ri = genRun[k];
      const ph = phase.get(ri);
      if (!ph || !ph.turns[k - ph.a]) return null;
      const w = Math.min(1, (CROSS_LEN * A) / Math.max(1e-3, genLen(k)));
      return [0.5 - w / 2, 0.5 + w / 2];
    };
    const samples = sampleSpline(pts, tangentsOf(pts, prep[li].dirs), inp.clip, window);
    /** Смещение косы (без знака линии) на общем участке ri в месте u: параллельно на ±A, перекрестье — посередине. */
    const braidOff = (ri: number, u: number) => {
      const ph = phase.get(ri)!;
      if (!ph.turns.length) return A;
      const k = Math.min(ph.turns.length - 1, Math.max(0, Math.floor(u - ph.a)));
      const s = Math.max(0, Math.min(1, u - ph.a - k));
      const c0 = Math.cos(ph.phi[k]);
      const win = window(ph.a + k);
      const shape = win ? c0 * Math.cos(Math.PI * Math.max(0, Math.min(1, (s - win[0]) / (win[1] - win[0])))) : c0;
      const w = weightAt(wBraid, u);
      return A * (w * shape + (1 - w) * 0.55);
    };
    /** Смещение на краю общего участка ri: там же начинается раздельный участок. */
    const edgeOff = (ri: number, u: number) => (phase.has(ri) ? braidOff(ri, u) : A);
    const points: StrandPoint[] = [];
    // плетение: в перекрестьях с чётным номером сверху Мария, с нечётным — Иосиф (индексы — в точках своей нити)
    const over: [number, number][] = [];
    let seg: { k: number; start: number } | null = null;
    const closeSeg = (idx: number) => {
      if (!seg) return;
      const ph = phase.get(genRun[seg.k])!;
      const j = ph.cross[seg.k - ph.a];
      if (idx - 1 > seg.start && (j % 2 === 0) !== isJ) over.push([seg.start, idx - 1]);
      seg = null;
    };
    for (const s of samples) {
      const k = Math.min(n - 2, Math.floor(s.u));
      const ri = n > 1 ? genRun[Math.max(0, k)] : 0;
      const r = spans[ri];
      let off: number;
      const idx = points.length;
      if (!r || r.kind === 'shared') {
        off = n > 1 && r ? sign * braidOff(ri, s.u) : sign * A;
        // участок «поверх» — само перекрестье: от точки, где нити начинают сходиться, до точки, где разошлись
        const win = n > 1 && r && k >= 0 ? window(k) : null;
        const f = s.u - k;
        const inside = !!win && f >= win[0] - 1e-9 && f <= win[1] + 1e-9 && weightAt(wBraid, k + 0.5) > 0.5;
        if (inside && (!seg || seg.k !== k)) {
          closeSeg(idx);
          seg = { k, start: idx };
        } else if (!inside && seg) closeSeg(idx);
      } else {
        closeSeg(idx);
        const [a, b] = my(r);
        const v = s.u - a;
        const len = b - a;
        const e0 = taper(v);
        const e1 = taper(len - v);
        const ends = sign * (e0 * edgeOff(ri - 1, a) + e1 * edgeOff(ri + 1, b));
        const wave = inp.meander > 0 ? Math.min(inp.meander, MEANDER_MAX * A) * weightAt(wMeander, s.u) * Math.sin((2 * Math.PI * v) / MEANDER_PERIOD) : 0;
        off = ends + wave * (1 - Math.max(e0, e1));
      }
      off = clampOff(off, s);
      const next = Math.min(n - 1, k + 1);
      points.push({
        x: s.x + s.nx * off,
        y: s.y + s.ny * off,
        t: Math.max(0, k) / total,
        weak: n > 1 && L.weak[next] && s.u > k + 0.02,
        ...(n > 1 && L.legal[next] && !L.weak[next] && s.u > k + 0.02 ? { legal: true } : {}),
        u: s.u,
      });
    }
    closeSeg(points.length);
    out.push({ line: L.line, points, ids: L.ids, over, ...(L.gaps.some((x) => x > 0) ? { gaps: L.gaps } : {}) });
  });
  const [js, ms] = out;
  return [ms, js];
}

// ---------- ленты по маршрутам связей (этап 11, решение 79; STAGE11.md § 3) ----------

/**
 * Шаг ленты на масштабе семьи: маршрут связи «родитель → ребёнок» (src/render/links.ts, stepRoute) — по следу родителя
 * до ступеньки у узла союза, вертикалью к строке ребёнка, зубцом к его звезде. pts — ломаная из горизонталей и вертикалей
 * (x0, y0, x1, y1, …) от звезды родителя до звезды ребёнка.
 */
export interface RouteStep {
  id: string;
  weak: boolean;
  /** шаг «по закону» (Иосиф → Иисус, Мф 1:16): от узла союза — штрихом */
  legal?: boolean;
  /** сколько лиц линии перед этим скрыто показом (Strand.gaps) */
  gap?: number;
  /** маршрут к этому лицу от предыдущего лица линии; у первого лица линии — пусто */
  pts: number[] | null;
}

export interface RouteInput {
  joseph: RouteStep[];
  mary: RouteStep[];
  /** звезда лица, px */
  project: (id: string) => Pt | null;
  amplitude: number;
  /** радиус скругления ступеньки, px (8–16) */
  radius: number;
  clip?: [number, number];
}

/** Точка ломаной со скруглёнными углами: место, направление касательной, длина от начала. */
interface RoutePt {
  x: number;
  y: number;
  tx: number;
  ty: number;
  s: number;
}

/**
 * Ломаная из горизонталей и вертикалей — со скруглёнными углами радиуса до r (не больше половины соседних отрезков),
 * точками не реже чем через step px. Касательная — по направлению движения.
 */
export function roundRoute(pts: readonly number[], r: number, step = 4): RoutePt[] {
  const P: Pt[] = [];
  for (let k = 0; k + 1 < pts.length; k += 2) {
    const q = { x: pts[k], y: pts[k + 1] };
    const last = P[P.length - 1];
    if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 0.01) P.push(q);
  }
  const out: RoutePt[] = [];
  if (P.length < 2) {
    if (P.length === 1) out.push({ x: P[0].x, y: P[0].y, tx: 1, ty: 0, s: 0 });
    return out;
  }
  let s = 0;
  const add = (x: number, y: number, tx: number, ty: number) => {
    const last = out[out.length - 1];
    if (last) s += Math.hypot(x - last.x, y - last.y);
    out.push({ x, y, tx, ty, s });
  };
  const line = (a: Pt, b: Pt, from0: boolean) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-6) return;
    const tx = (b.x - a.x) / l;
    const ty = (b.y - a.y) / l;
    const n = Math.max(1, Math.ceil(l / step));
    for (let k = from0 ? 0 : 1; k <= n; k++) add(a.x + (tx * l * k) / n, a.y + (ty * l * k) / n, tx, ty);
  };
  // углы: у вершины k — дуга от точки за rk до вершины к точке через rk после неё
  let cur: Pt = P[0];
  let first = true;
  for (let k = 1; k < P.length; k++) {
    const b = P[k];
    if (k === P.length - 1) {
      line(cur, b, first);
      break;
    }
    const c = P[k + 1];
    const l1 = Math.hypot(b.x - cur.x, b.y - cur.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const rk = Math.max(0, Math.min(r, l1 / 2, l2 / 2));
    const u1 = { x: (b.x - cur.x) / (l1 || 1), y: (b.y - cur.y) / (l1 || 1) };
    const u2 = { x: (c.x - b.x) / (l2 || 1), y: (c.y - b.y) / (l2 || 1) };
    const a0 = { x: b.x - u1.x * rk, y: b.y - u1.y * rk };
    const a1 = { x: b.x + u2.x * rk, y: b.y + u2.y * rk };
    line(cur, a0, first);
    first = false;
    // дуга: квадратичная кривая через вершину (у прямого угла — почти окружность), касательные на концах — вдоль отрезков
    const n = Math.max(4, Math.ceil((rk * Math.PI) / 2 / Math.max(1, step / 2)));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      const x = (1 - t) * (1 - t) * a0.x + 2 * (1 - t) * t * b.x + t * t * a1.x;
      const y = (1 - t) * (1 - t) * a0.y + 2 * (1 - t) * t * b.y + t * t * a1.y;
      const dx = 2 * (1 - t) * (b.x - a0.x) + 2 * t * (a1.x - b.x);
      const dy = 2 * (1 - t) * (b.y - a0.y) + 2 * t * (a1.y - b.y);
      const dl = Math.hypot(dx, dy) || 1;
      add(x, y, dx / dl, dy / dl);
    }
    cur = a1;
  }
  return out;
}

/**
 * Нити лент по маршрутам связей (решение 79; STAGE11.md § 3): на масштабе семьи лента — это и есть связь с ребёнком линии.
 * Каждая нить идёт по маршрутам своих шагов; на общих участках — две нити на ±A от маршрута (коса), одно перекрестье на
 * поколение — посередине вертикали ступеньки (ТЗ § 8.4: перекрестья — между поколениями), фаза — та же, что у сплайна
 * (braidPhase: у точек расхождения и схождения нить Иосифа — сверху, то есть слева по ходу). На раздельных участках нить
 * идёт на своей стороне маршрута (Иосифа — слева, Марии — справа по ходу), поэтому у развилки нити расходятся, не
 * перекрещиваясь, и след лица линии остаётся виден между ними. Звено по толкованию — разреженной нитью; шаг «по закону» —
 * от узла союза штрихом.
 */
export function buildRouteRibbons(inp: RouteInput): Strand[] {
  const A = inp.amplitude;
  const R = inp.radius;
  const lines = (['joseph', 'mary'] as const).map((line) => {
    const steps = inp[line].filter((s) => !!inp.project(s.id));
    return { line, steps, ids: steps.map((s) => s.id) };
  });
  const [J, M] = lines;
  const spans = runSpans(J.ids, M.ids);
  const out: Strand[] = [];
  lines.forEach((L) => {
    const isJ = L.line === 'joseph';
    const sign = isJ ? 1 : -1;
    const n = L.ids.length;
    const my = (r: RunSpan) => (isJ ? r.j : r.m);
    // маршруты поколений: k → k+1
    const routes: RoutePt[][] = [];
    for (let k = 0; k + 1 < n; k++) {
      const st = L.steps[k + 1];
      const a = inp.project(L.ids[k])!;
      const b = inp.project(L.ids[k + 1])!;
      const pts = st.pts && st.pts.length >= 4 ? st.pts : [a.x, a.y, b.x, b.y];
      routes.push(roundRoute(pts, R));
    }
    const genRun = new Array<number>(Math.max(0, n - 1)).fill(-1);
    spans.forEach((r, ri) => {
      const [a, b] = my(r);
      for (let k = a; k < b; k++) if (r.kind === 'split' || genRun[k] < 0) genRun[k] = ri;
    });
    // фаза косы по общим участкам (как у сплайна): одно перекрестье на поколение
    const phase = new Map<number, { a: number; phi: number[]; turns: number[]; cross: number[] }>();
    spans.forEach((r, ri) => {
      if (r.kind !== 'shared') return;
      const [a, b] = my(r);
      const lens: number[] = [];
      for (let k = a; k < b; k++) lens.push(routes[k].length ? routes[k][routes[k].length - 1].s : 0);
      const ph = braidPhase(lens, ri > 0 && ri < spans.length - 1 ? 'both' : ri > 0 ? 'start' : 'end');
      const cross: number[] = [];
      let j = 0;
      for (const t of ph.turns) cross.push(t ? j++ : -1);
      phase.set(ri, { a, ...ph, cross });
    });
    /** Середина вертикали маршрута поколения (длина от начала) и её длина: там перекрестье. */
    const vertical = (rt: RoutePt[]): [number, number] => {
      let s0 = -1;
      let s1 = -1;
      for (const q of rt)
        if (Math.abs(q.ty) > 0.7) {
          if (s0 < 0) s0 = q.s;
          s1 = q.s;
        }
      if (s0 < 0) {
        const L0 = rt.length ? rt[rt.length - 1].s : 0;
        return [L0 / 2, L0];
      }
      return [(s0 + s1) / 2, s1 - s0];
    };
    const points: StrandPoint[] = [];
    const over: [number, number][] = [];
    const total = Math.max(1, n - 1);
    for (let k = 0; k + 1 < n; k++) {
      const rt = routes[k];
      if (!rt.length) continue;
      const len = rt[rt.length - 1].s || 1;
      const ri = genRun[k];
      const r = spans[ri];
      const ph = r?.kind === 'shared' ? phase.get(ri) : undefined;
      const [mid, vlen] = vertical(rt);
      const w = Math.min(CROSS_LEN * A, Math.max(6, vlen));
      const turn = !!ph && !!ph.turns[k - ph.a];
      const c0 = ph ? Math.cos(ph.phi[k - ph.a]) : 1;
      const legalFrom = L.steps[k + 1].legal ? (rt.find((q) => Math.abs(q.ty) > 0.7)?.s ?? 0) : Infinity;
      let seg: number | null = null;
      const j = ph ? ph.cross[k - ph.a] : -1;
      for (let q = k === 0 ? 0 : 1; q < rt.length; q++) {
        const p = rt[q];
        let sig: number;
        if (ph) {
          if (turn) {
            const f = Math.max(0, Math.min(1, (p.s - (mid - w / 2)) / w));
            sig = c0 * Math.cos(Math.PI * f);
          } else sig = c0;
        } else sig = 1;
        const off = sign * sig * A;
        // нормаль «слева по ходу»: (ty, −tx)
        const idx = points.length;
        points.push({
          x: p.x + p.ty * off,
          y: p.y - p.tx * off,
          t: (k + p.s / len) / total,
          weak: L.steps[k + 1].weak && p.s > 0.5,
          legal: p.s >= legalFrom ? true : undefined,
          u: k + p.s / len,
        });
        // плетение: в перекрестье поверх поочерёдно то Мария, то Иосиф
        const inside = turn && Math.abs(p.s - mid) <= w / 2;
        if (inside && seg === null) seg = idx;
        if (!inside && seg !== null) {
          if (idx - 1 > seg && (j % 2 === 0) !== isJ) over.push([seg, idx - 1]);
          seg = null;
        }
      }
      if (seg !== null && points.length - 1 > seg && (j % 2 === 0) !== isJ) over.push([seg, points.length - 1]);
    }
    if (!points.length && n === 1) {
      const a = inp.project(L.ids[0])!;
      points.push({ x: a.x, y: a.y, t: 0, weak: false, u: 0 });
    }
    const gaps = L.steps.map((q) => q.gap ?? 0);
    out.push({ line: L.line, points, ids: L.ids, over, ...(gaps.some((x) => x > 0) ? { gaps } : {}) });
  });
  const [js, ms] = out;
  return [ms, js];
}

/**
 * Смесь двух видов нитей одной линии (сплайн обзора и маршрут масштаба семьи) — плавный переход в полосе ×1,5 масштаба
 * (§ 3): точки каждого поколения обоих видов берутся по равным долям длины и смешиваются с весом f (0 — сплайн, 1 —
 * маршрут). Плетение и пометы — от вида с большим весом.
 */
export function blendStrands(a: Strand[], b: Strand[], f: number): Strand[] {
  if (f <= 0.001) return a;
  if (f >= 0.999) return b;
  return a.map((sa) => {
    const sb = b.find((q) => q.line === sa.line);
    if (!sb || sb.ids.join() !== sa.ids.join()) return f < 0.5 ? sa : (sb ?? sa);
    const byGen = (s: Strand) => {
      const m = new Map<number, StrandPoint[]>();
      for (const p of s.points) {
        const k = Math.min(s.ids.length - 2, Math.max(0, Math.floor(p.u)));
        const arr = m.get(k);
        if (arr) arr.push(p);
        else m.set(k, [p]);
      }
      return m;
    };
    const ga = byGen(sa);
    const gb = byGen(sb);
    const pts: StrandPoint[] = [];
    const main = f < 0.5 ? sa : sb;
    const resample = (ps: StrandPoint[], m: number): StrandPoint[] => {
      if (ps.length < 2) return Array.from({ length: m }, () => ps[0]);
      const L: number[] = [0];
      for (let k = 1; k < ps.length; k++) L.push(L[k - 1] + Math.hypot(ps[k].x - ps[k - 1].x, ps[k].y - ps[k - 1].y));
      const tot = L[L.length - 1] || 1;
      const outp: StrandPoint[] = [];
      let j = 0;
      for (let k = 0; k < m; k++) {
        const s = (tot * k) / (m - 1);
        while (j + 1 < L.length - 1 && L[j + 1] < s) j++;
        const t = L[j + 1] > L[j] ? (s - L[j]) / (L[j + 1] - L[j]) : 0;
        const p0 = ps[j];
        const p1 = ps[Math.min(ps.length - 1, j + 1)];
        outp.push({ ...(t < 0.5 ? p0 : p1), x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t, u: p0.u + (p1.u - p0.u) * t, t: p0.t + (p1.t - p0.t) * t });
      }
      return outp;
    };
    const gens = Math.max(0, sa.ids.length - 1);
    for (let k = 0; k < gens; k++) {
      const pa = ga.get(k) ?? [];
      const pb = gb.get(k) ?? [];
      if (!pa.length || !pb.length) continue;
      const m = Math.max(8, Math.min(240, Math.max(pa.length, pb.length)));
      const ra = resample(pa, m);
      const rb = resample(pb, m);
      for (let q = 0; q < m; q++) {
        const x = ra[q].x + (rb[q].x - ra[q].x) * f;
        const y = ra[q].y + (rb[q].y - ra[q].y) * f;
        const src = f < 0.5 ? ra[q] : rb[q];
        pts.push({ ...src, x, y });
      }
    }
    // плетение смеси — по точкам главного вида: перекрестья переводятся в номера новых точек по месту u
    const over: [number, number][] = [];
    for (const [s0, s1] of main.over) {
      const u0 = main.points[s0]?.u;
      const u1 = main.points[s1]?.u;
      if (u0 === undefined || u1 === undefined) continue;
      let a0 = -1;
      let a1 = -1;
      pts.forEach((p, i) => {
        if (p.u >= u0 && p.u <= u1) {
          if (a0 < 0) a0 = i;
          a1 = i;
        }
      });
      if (a0 >= 0 && a1 > a0) over.push([a0, a1]);
    }
    return { line: sa.line, points: pts, ids: sa.ids, over, ...(sa.gaps ? { gaps: sa.gaps } : {}) };
  });
}
