/**
 * Геометрия лент линий Мессии (ТЗ § 3.2, § 8.4). Считается в экранных координатах на каждый кадр
 * (≈ 120 опорных точек, дёшево), поэтому правила «в пикселях» выполняются точно.
 *
 * — Центральная линия: центростремительный сплайн Катмулла — Рома через рождения лиц линии.
 * — Общие участки (одинаковые соседние лица в обеих линиях): две нити, смещённые на ±A·cos(π·r·(u − U_split)).
 *   В лицах нити стоят по обе стороны («бусина между нитями»), перекрещиваются между поколениями.
 *   Множитель r подбирается так, чтобы и при расхождении, и при схождении нить Иосифа была сверху.
 * — Раздельные участки: одна нить с мягкой волной A₂·sin(π·u) и плавным сведением к ±A на концах.
 * — Если поколения на экране ближе MIN_GEN_PX, коса заменяется двумя параллельными нитями (без ряби).
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
}

function sampleSpline(pts: Pt[]): Sample[] {
  const out: Sample[] = [];
  if (pts.length === 0) return out;
  if (pts.length === 1) return [{ x: pts[0].x, y: pts[0].y, u: 0, nx: 0, ny: -1 }];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = i === pts.length - 2 ? SAMPLES + 1 : SAMPLES;
    for (let k = 0; k < n; k++) {
      const s = k / SAMPLES;
      const q = catmullRom(p0, p1, p2, p3, s);
      out.push({ x: q.x, y: q.y, u: i + s, nx: 0, ny: 0 });
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
  return out;
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
    const pts = run.ids.map((id) => inp.project(id)).filter((p): p is Pt => !!p);
    if (pts.length < 1 || pts.length !== run.ids.length) continue;
    const samples = sampleSpline(pts);
    if (run.kind === 'shared') {
      // шаг поколения на экране
      const spanPx = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y);
      const genPx = pts.length > 1 ? spanPx / (pts.length - 1) : Infinity;
      const braid = genPx >= MIN_GEN_PX;
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
        const off = braid ? A * Math.cos(Math.PI * rate * (s.u - Uend)) : A * 0.55;
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
        const off = side * A * taper + inp.meander * Math.sin(Math.PI * s.u) * (1 - taper);
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
