/**
 * Геометрия лент линий Мессии (ТЗ § 3.2, § 8.4; E6: MAP-26, MAP-27, находка образца об изломе на стыке).
 * Считается в экранных координатах на каждый кадр (≈ 140 опорных точек, дёшево), поэтому правила «в пикселях»
 * выполняются точно.
 *
 * — Средняя линия каждой нити — один кубический сплайн Эрмита через рождения всех лиц своей линии; касательная
 *   в лице — биссектриса соседних хорд, а на стыке общего и раздельного участков — одна для обеих линий, вдоль общего
 *   участка. Раньше сплайн строился по участкам, и на стыке касательная рвалась (излом нити, находка образца).
 *   Смещение нити от средней линии тоже гладкое: на стыках у него нулевая производная.
 * — Общие участки (одинаковые соседние лица в обеих линиях): коса, смещение ±A·cos φ. В лицах нити стоят по обе
 *   стороны («бусина между нитями»), перекрещиваются между поколениями. На длинном поколении перекрестий больше —
 *   не реже чем через CROSS_PX, иначе коса раскрывается «глазом», похожим на развилку (MAP-27); между лицами
 *   такого поколения размах нити меньше (0,6·A). Фаза подобрана так, что у точки расхождения и схождения
 *   нить Иосифа — сверху.
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
}

export interface Strand {
  line: 'joseph' | 'mary';
  points: StrandPoint[];
  /** лица своей линии, по которым построена нить (u — номер в этом списке) */
  ids: string[];
  /**
   * Плетение: участки косы между двумя перекрестьями, где эта нить лежит поверх другой, —
   * пары [начало, конец] в индексах точек этой же нити. Раздельные участки у линий разной длины,
   * поэтому индексы двух нитей после первого расхождения не совпадают.
   */
  over: [number, number][];
}

export interface RibbonInput {
  joseph: { id: string; weak: boolean }[];
  mary: { id: string; weak: boolean }[];
  project: (id: string) => Pt | null;
  amplitude: number; // px
  meander: number; // px — наибольшая волна одиночной нити (не больше 0,25·A)
  /** видимая полоса по x (px): поколения целиком за ней считаются грубо — их всё равно не рисуют */
  clip?: [number, number];
}

/**
 * Амплитуда косы на общих участках, px (MAP-60, MAP-62): тугая коса не шире 3 px и не зависит от высоты строки —
 * расхождение линий (разные строки) тогда не спутать с волной косы.
 */
export const BRAID_PX = 3;

const SAMPLES = 14;
/** Точек сплайна на пиксель длины поколения: на длинных поколениях с несколькими перекрестьями — не реже 1 на 6 px. */
const SAMPLE_PX = 6;
const MIN_GEN_PX = 24;
/** Перекрестья косы не реже чем через столько px (MAP-27). */
export const CROSS_PX = 70;
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
const samplesFor = (a: Pt, b: Pt, clip?: [number, number]) =>
  clip && ((a.x < clip[0] && b.x < clip[0]) || (a.x > clip[1] && b.x > clip[1]))
    ? 4
    : Math.max(SAMPLES, Math.min(240, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SAMPLE_PX)));

/**
 * Средняя линия нити — кубические сегменты Эрмита между лицами с касательными tangents (длина касательной — хорда
 * сегмента). Касательная в каждом лице одна на оба соседних сегмента, поэтому линия гладкая и на стыках участков.
 * Нормаль и радиус кривизны — по производным сегмента, точно.
 */
function sampleSpline(pts: Pt[], tangents: Pt[], clip?: [number, number]): Sample[] {
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
    const n = i === pts.length - 2 ? N + 1 : N;
    for (let k = 0; k < n; k++) {
      const s = k / N;
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
function smoothDense(pts: Pt[], w: number[], fixed: Set<number>): Pt[] {
  if (pts.length < 3) return pts;
  let ys = pts.map((p) => p.y);
  for (let it = 0; it < 4; it++) ys = ys.map((y, i) => (i === 0 || i === ys.length - 1 || fixed.has(i) ? y : (ys[i - 1] + 2 * y + ys[i + 1]) / 4));
  return pts.map((p, i) => (i === 0 || i === pts.length - 1 || fixed.has(i) ? p : { x: p.x, y: p.y * w[i] + ys[i] * (1 - w[i]) }));
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
 * Фаза косы общего участка по поколениям: φ в лицах — кратна π (нити по разные стороны), на каждом поколении
 * растёт на нечётное число π; на длинных — больше, чтобы перекрестья шли не реже чем через CROSS_PX.
 * Если участок с обеих сторон граничит с расхождением, у обоих концов φ ≡ 0 (Иосиф сверху): при нечётной сумме
 * самое длинное поколение получает на π больше (полный оборот). Возвращает φ в каждом лице участка и число
 * полуоборотов на каждом поколении.
 */
export function braidPhase(lens: number[], anchor: 'start' | 'end' | 'both'): { phi: number[]; turns: number[] } {
  const turns = lens.map((L) => 2 * Math.max(0, Math.ceil((L / CROSS_PX - 1) / 2)) + 1);
  if (anchor === 'both' && lens.length) {
    const sum = turns.reduce((s, x) => s + x, 0);
    if (sum % 2 === 1) {
      let k = 0;
      for (let i = 1; i < lens.length; i++) if (lens[i] > lens[k]) k = i;
      turns[k] += 1;
    }
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
    return { line, ids: steps.map((s) => s.id), weak: steps.map((s) => s.weak), raw: steps.map((s) => s.p) };
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
    return { my, wBraid, pts: smoothDense(L.raw, wSmooth, fixed), dirs: new Map<number, Pt>() };
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
    const samples = sampleSpline(pts, tangentsOf(pts, prep[li].dirs), inp.clip);
    const total = Math.max(1, n - 1);
    // участок каждого поколения k → k+1
    const genRun = new Array<number>(Math.max(0, n - 1)).fill(-1);
    spans.forEach((r, ri) => {
      const [a, b] = my(r);
      for (let k = a; k < b; k++) if (r.kind === 'split' || genRun[k] < 0) genRun[k] = ri;
    });
    // фаза косы по общим участкам
    const phase = new Map<number, { a: number; phi: number[]; turns: number[] }>();
    const genLen = (k: number) => Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y);
    spans.forEach((r, ri) => {
      if (r.kind !== 'shared') return;
      const [a, b] = my(r);
      const lens: number[] = [];
      for (let k = a; k < b; k++) lens.push(genLen(k));
      const hasPrev = ri > 0;
      const hasNext = ri < spans.length - 1;
      phase.set(ri, { a, ...braidPhase(lens, hasPrev && hasNext ? 'both' : hasPrev ? 'start' : 'end') });
    });
    /** Смещение косы (без знака линии) на общем участке ri в месте u. */
    const braidOff = (ri: number, u: number) => {
      const ph = phase.get(ri)!;
      const k = Math.min(ph.turns.length - 1, Math.max(0, Math.floor(u - ph.a)));
      if (!ph.turns.length) return A;
      const s = Math.max(0, Math.min(1, u - ph.a - k));
      const phi = ph.phi[k] + Math.PI * ph.turns[k] * s;
      const env = ph.turns[k] > 1 ? 0.6 + 0.4 * Math.cos(Math.PI * s) ** 2 : 1;
      const w = weightAt(wBraid, u);
      return A * (w * env * Math.cos(phi) + (1 - w) * 0.55);
    };
    /** Смещение на краю общего участка ri: там же начинается раздельный участок. */
    const edgeOff = (ri: number, u: number) => (phase.has(ri) ? braidOff(ri, u) : A);
    const points: StrandPoint[] = [];
    // плетение: у Иосифа сверху нечётные участки косы, у Марии — чётные (индексы — в точках своей нити)
    const over: [number, number][] = [];
    let seg: { ri: number; j: number; start: number } | null = null;
    for (const s of samples) {
      const k = Math.min(n - 2, Math.floor(s.u));
      const ri = n > 1 ? genRun[Math.max(0, k)] : 0;
      const r = spans[ri];
      let off: number;
      if (!r || r.kind === 'shared') {
        off = n > 1 && r ? sign * braidOff(ri, s.u) : sign * A;
        // плетение: участки между соседними крайними положениями нити (φ кратно π), в каждом — одно перекрестье
        if (r && phase.has(ri)) {
          const ph = phase.get(ri)!;
          const kk = Math.min(ph.turns.length - 1, Math.max(0, Math.floor(s.u - ph.a)));
          const phi = ph.turns.length ? ph.phi[kk] + Math.PI * ph.turns[kk] * Math.max(0, Math.min(1, s.u - ph.a - kk)) : 0;
          const j = Math.floor((phi - ph.phi[0]) / Math.PI + 1e-9);
          const braid = weightAt(wBraid, s.u) > 0.5;
          const idx = points.length;
          if (!seg || seg.ri !== ri) seg = { ri, j, start: idx };
          else if (j !== seg.j) {
            if (braid && (seg.j % 2 === 0) !== isJ) over.push([seg.start, idx]);
            seg = { ri, j, start: idx };
          }
        }
      } else {
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
        u: s.u,
      });
    }
    out.push({ line: L.line, points, ids: L.ids, over });
  });
  const [js, ms] = out;
  return [ms, js];
}
