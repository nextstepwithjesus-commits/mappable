/**
 * Геометрия лент линий Мессии (ТЗ § 3.2, § 8.4). Считается в экранных координатах на каждый кадр
 * (≈ 120 опорных точек, дёшево), поэтому правила «в пикселях» выполняются точно.
 *
 * — Центральная линия: центростремительный сплайн Катмулла — Рома через рождения лиц линии.
 * — Общие участки (одинаковые соседние лица в обеих линиях): две нити, смещённые на ±A·cos(π·r·(u − U_split)).
 *   В лицах нити стоят по обе стороны («бусина между нитями»), перекрещиваются между поколениями.
 *   Множитель r подбирается так, чтобы и при расхождении, и при схождении нить Иосифа была сверху.
 * — Раздельные участки: одна нить с мягкой волной A₂·sin(π·u) и плавным сведением к ±A на концах.
 * — Если поколения на экране ближе MIN_GEN_PX, коса плавно заменяется двумя параллельными нитями,
 *   а волна одиночной нити гаснет (без ряби). Порог считается по каждому поколению отдельно.
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
}

export interface Strand {
  line: 'joseph' | 'mary';
  points: StrandPoint[];
  /** индексы точек, где нить уходит «под» другую (для плетения), — пары [начало, конец) */
  under: [number, number][];
}

export interface RibbonInput {
  joseph: { id: string; weak: boolean }[];
  mary: { id: string; weak: boolean }[];
  project: (id: string) => Pt | null;
  amplitude: number; // px
  meander: number; // px
}

const SAMPLES = 14;
const MIN_GEN_PX = 24;

function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, s: number): Pt {
  // центростремительная параметризация (α = 0.5)
  const d = (a: Pt, b: Pt) => Math.max(Math.hypot(b.x - a.x, b.y - a.y) ** 0.5, 1e-4);
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const t = t1 + (t2 - t1) * s;
  const lerp = (a: Pt, b: Pt, ta: number, tb: number): Pt => {
    const k = (t - ta) / (tb - ta || 1);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

interface Sample {
  x: number;
  y: number;
  u: number; // номер поколения в последовательности (дробный)
  nx: number; // нормаль
  ny: number;
  rad: number; // радиус кривизны, px
}

function sampleSpline(pts: Pt[]): Sample[] {
  const out: Sample[] = [];
  if (pts.length === 0) return out;
  if (pts.length === 1) return [{ x: pts[0].x, y: pts[0].y, u: 0, nx: 0, ny: -1, rad: Infinity }];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = i === pts.length - 2 ? SAMPLES + 1 : SAMPLES;
    for (let k = 0; k < n; k++) {
      const s = k / SAMPLES;
      const q = catmullRom(p0, p1, p2, p3, s);
      out.push({ x: q.x, y: q.y, u: i + s, nx: 0, ny: 0, rad: Infinity });
    }
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    // нормаль «вверх» по экрану: (dy, −dx) при движении вправо
    out[i].nx = dy / l;
    out[i].ny = -dx / l;
  }
  // радиус кривизны: длина дуги между соседями, делённая на поворот касательной
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1];
    const b = out[i + 1];
    let turn = Math.atan2(a.nx * b.ny - a.ny * b.nx, a.nx * b.nx + a.ny * b.ny);
    turn = Math.abs(turn);
    const arc = Math.hypot(out[i].x - a.x, out[i].y - a.y) + Math.hypot(b.x - out[i].x, b.y - out[i].y);
    out[i].rad = turn > 1e-6 ? arc / turn : Infinity;
  }
  return out;
}

/** Плавная ступень 0…1: 0 при шаге поколения ≤ MIN_GEN_PX / 2, 1 при ≥ MIN_GEN_PX. */
function waveWeight(genPx: number): number {
  const k = Math.max(0, Math.min(1, (genPx - MIN_GEN_PX / 2) / (MIN_GEN_PX / 2)));
  return k * k * (3 - 2 * k);
}

/** Вес волны в каждом поколении: у узла — меньший из двух соседних шагов, между узлами — линейно. */
function nodeWeights(pts: Pt[]): number[] {
  const seg = pts.slice(1).map((p, i) => waveWeight(Math.hypot(p.x - pts[i].x, p.y - pts[i].y)));
  return pts.map((_, i) => Math.min(seg[i - 1] ?? 1, seg[i] ?? 1));
}

/**
 * Средняя линия там, где поколения на экране теснее порога, сглаживается по вертикали: соседние лица линии
 * часто стоят в чередующихся полосах, и на обзорном масштабе нить иначе идёт мелким зигзагом.
 * Концы участка не двигаются — это точки расхождения и схождения с другой линией.
 */
function smoothDense(pts: Pt[], w: number[]): Pt[] {
  if (pts.length < 3) return pts;
  let ys = pts.map((p) => p.y);
  for (let it = 0; it < 4; it++) ys = ys.map((y, i) => (i === 0 || i === ys.length - 1 ? y : (ys[i - 1] + 2 * y + ys[i + 1]) / 4));
  return pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : { x: p.x, y: p.y * w[i] + ys[i] * (1 - w[i]) }));
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
  const runs: Run[] = [];
  let a = 0;
  let b = 0;
  while (a < j.length && b < m.length) {
    if (j[a] === m[b]) {
      const ids = [j[a]];
      while (a + 1 < j.length && b + 1 < m.length && j[a + 1] === m[b + 1]) {
        a++;
        b++;
        ids.push(j[a]);
      }
      runs.push({ kind: 'shared', ids });
      a++;
      b++;
      continue;
    }
    // найти ближайшую точку схождения
    let na = -1;
    let nb = -1;
    outer: for (let i = a; i < j.length; i++) {
      for (let k = b; k < m.length; k++) if (j[i] === m[k]) { na = i; nb = k; break outer; }
    }
    if (na < 0) { na = j.length; nb = m.length; }
    // раздельные участки включают точки расхождения и схождения для непрерывности
    const jIds = j.slice(Math.max(0, a - 1), Math.min(j.length, na + 1));
    const mIds = m.slice(Math.max(0, b - 1), Math.min(m.length, nb + 1));
    runs.push({ kind: 'joseph', ids: jIds });
    runs.push({ kind: 'mary', ids: mIds });
    a = na;
    b = nb;
  }
  return runs;
}

export function buildRibbons(inp: RibbonInput): Strand[] {
  const jIds = inp.joseph.map((s) => s.id);
  const mIds = inp.mary.map((s) => s.id);
  const weakJ = new Set(inp.joseph.filter((s) => s.weak).map((s) => s.id));
  const weakM = new Set(inp.mary.filter((s) => s.weak).map((s) => s.id));
  const posJ = new Map(jIds.map((id, i) => [id, i]));
  const posM = new Map(mIds.map((id, i) => [id, i]));
  const runs = splitRuns(jIds, mIds);
  const A = inp.amplitude;
  const joseph: StrandPoint[] = [];
  const mary: StrandPoint[] = [];
  const underJ: [number, number][] = [];
  const underM: [number, number][] = [];

  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    const raw = run.ids.map((id) => inp.project(id)).filter((p): p is Pt => !!p);
    if (raw.length < 1 || raw.length !== run.ids.length) continue;
    const wN = nodeWeights(raw);
    const pts = smoothDense(raw, wN);
    const samples = sampleSpline(pts);
    const wAt = (u: number) => {
      const i = Math.min(wN.length - 1, Math.floor(u));
      const f = u - i;
      return i + 1 < wN.length ? wN[i] * (1 - f) + wN[i + 1] * f : wN[i];
    };
    if (run.kind === 'shared') {
      const n = pts.length - 1;
      const hasNext = r < runs.length - 1;
      const hasPrev = r > 0;
      // фазовый множитель: на концах, где участок граничит с расхождением, нить Иосифа — сверху
      let rate = 1;
      if (hasPrev && hasNext && n > 0) rate = Math.max(0, (2 * Math.round(n / 2)) / n);
      const Uend = hasNext ? n : n; // фаза отсчитывается от конца участка (точки расхождения)
      let lastSign = 0;
      let segStart = joseph.length;
      for (const s of samples) {
        // коса и параллельные нити сменяют друг друга плавно, по шагу поколений на экране
        const w = wAt(s.u);
        const braid = w > 0.5;
        const off = clampOff(A * (w * Math.cos(Math.PI * rate * (s.u - Uend)) + (1 - w) * 0.55), s);
        const idx = Math.min(run.ids.length - 1, Math.floor(s.u));
        const tJ = (posJ.get(run.ids[idx]) ?? 0) / Math.max(1, jIds.length - 1);
        const tM = (posM.get(run.ids[idx]) ?? 0) / Math.max(1, mIds.length - 1);
        joseph.push({ x: s.x + s.nx * off, y: s.y + s.ny * off, t: tJ, weak: false });
        mary.push({ x: s.x - s.nx * off, y: s.y - s.ny * off, t: tM, weak: false });
        const sign = Math.sign(Math.sin(Math.PI * rate * (s.u - Uend)));
        if (braid && sign !== lastSign && lastSign !== 0) {
          // переплетение: на каждом перекрестье меняется, чья нить сверху
          const k = joseph.length - 1;
          if (Math.floor(s.u) % 2 === 0) underJ.push([segStart, k]);
          else underM.push([segStart, k]);
          segStart = k;
        }
        lastSign = sign;
      }
    } else {
      const side = run.kind === 'joseph' ? 1 : -1;
      const target = run.kind === 'joseph' ? joseph : mary;
      const weakSet = run.kind === 'joseph' ? weakJ : weakM;
      const pos = run.kind === 'joseph' ? posJ : posM;
      const total = run.kind === 'joseph' ? jIds.length : mIds.length;
      const n = pts.length - 1;
      for (const s of samples) {
        // на концах (точки расхождения и схождения) нить стоит на ±A, как в косе; к середине — мягкая волна
        const edge = Math.min(s.u, n - s.u);
        const taper = Math.max(0, 1 - edge * 2);
        const off = clampOff(side * A * taper + inp.meander * wAt(s.u) * Math.sin(Math.PI * s.u) * (1 - taper), s);
        const idx = Math.min(run.ids.length - 1, Math.floor(s.u));
        const nextId = run.ids[Math.min(run.ids.length - 1, idx + 1)];
        target.push({
          x: s.x + s.nx * off,
          y: s.y + s.ny * off,
          t: (pos.get(run.ids[idx]) ?? 0) / Math.max(1, total - 1),
          weak: weakSet.has(nextId) && s.u > idx + 0.02,
        });
      }
    }
  }
  return [
    { line: 'mary', points: mary, under: underM },
    { line: 'joseph', points: joseph, under: underJ },
  ];
}
