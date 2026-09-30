/**
 * Отрисовка лент линий Мессии (ТЗ § 3.2, § 5.2; задача B6: VIS-30, MAP-25, MAP-50).
 * Геометрия нитей — src/engine/ribbons.ts; здесь — как нить ложится на небо.
 *
 * — Каждый слой нити (свечение, подложка, тон, сама нить) — один путь и один stroke() на нить.
 *   Перекрытия внутри одного пути не складываются, поэтому в режиме 'lighter' на стыках нет световых «бусин».
 * — Цвет вдоль нити — линейный градиент с опорами в лицах линии: от светлого золота к меди, от лазури к бирюзе.
 * — Ночь: слабое свечение в два слоя (0,06 и 0,10). День: светлая подложка и тон своего цвета 15 % дают ленте вес.
 * — При выделенном роде нить не становится прозрачной, а смешивается с цветом неба: плетение остаётся чистым.
 *   Ночью лента гаснет до 0,55, днём — не ниже 0,85.
 * — Звено по толкованию — разреженная нить без свечения и тона.
 */
import { BRAID_PX, blendStrands, buildRibbons, buildRouteRibbons, runSpans, type RouteStep, type Strand, type StrandPoint } from '../engine/ribbons.ts';
import { stepRoute } from './links.ts';
import type { LineStep } from '../engine/layout.ts';
import { refText } from '../engine/kinship.ts';
import { byId, lines } from '../data/atlas.ts';
import { nameCase } from '../ui/text/ru.ts';
import type { Palette, Pass, SkyContext, SkyState } from './sky.ts';
import { alpha, hexToRgb } from './color.ts';
import { textTone } from './dim.ts';
import { drawGlyph, personGlyph, starRadius } from './glyphs.ts';
import { claim, putLabel, spot, textBox, type Side } from './labels.ts';
import { hits as hitsReserve } from './rect.ts';
import { mapFont, mapSize, T_MAP_S, T_UI_S } from './type.ts';
import type { Rect } from './rect.ts';

export interface RibbonLook {
  /** ночь — свечение в режиме 'lighter'; день — подложка и тон */
  night: boolean;
  /** цвет неба: зазор под нитью в плетении и цвет, с которым нить смешивается при гашении */
  sky: string;
  /** дневная подложка под лентой */
  halo: string;
  gold: [string, string];
  azure: [string, string];
  /** 1 — полная яркость; меньше — лента гаснет вместе с небом */
  dim: number;
  /** сила двух слоёв свечения ночью: широкого и узкого */
  glow: [number, number];
  /** сила дневного тона под нитью */
  tone: number;
}

/** Ширина слоёв свечения — в долях ширины нити (VIS-30: core × 3,5 и × 2,4). */
export const GLOW_WIDTH: [number, number] = [3.5, 2.4];
/** Дневная лента (MAP-50): подложка не уже 6 px, тон на 1 px шире подложки, нить толще на 0,6 px. */
export const DAY_HALO_MIN = 6;
export const DAY_CORE_PLUS = 0.6;

/**
 * Гашение лент при выделенном роде (VIS-30): днём не ниже 0,85; ночью 0,7 — меньше нельзя,
 * медный конец линии Иосифа (#C9773A) опустился бы ниже 3 : 1 к небу (ТЗ § 3.8).
 */
export function ribbonDim(highlight: boolean, night: boolean): number {
  if (!highlight) return 1;
  return night ? 0.7 : 0.85;
}

/** Ленты при выбранной связи (§ 8): гаснут до стольких. */
export const LINK_RIBBON_DIM = 0.55;

/** Вид лент по палитре темы; highlight — выделен род (небо гаснет). Для неба, легенды и образца. */
export function ribbonLook(pal: Palette, highlight = false): RibbonLook {
  return {
    night: pal.glow, sky: pal.sky, halo: pal.halo, gold: [pal.gold1, pal.gold2], azure: [pal.azure1, pal.azure2],
    dim: ribbonDim(highlight, pal.glow), glow: pal.ribbonGlow, tone: pal.ribbonTone,
  };
}

// светлота лент (решение 32; MOB-61) — src/render/dim.ts, separateRibbons
export { RIBBON_LIGHTNESS, separateRibbons } from './dim.ts';

type Rgb = [number, number, number];
const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: Rgb, a = 1) => (a >= 1 ? `rgb(${c.map(Math.round).join(',')})` : `rgba(${c.map(Math.round).join(',')},${a})`);

type Part = 'all' | 'solid' | 'weak' | 'legal';

/** Точек в куске оглавления нити (tracePath): кусок целиком вне полосы или без отрезков нужного вида пропускается. */
const CHUNK = 64;
/** Бит вида отрезка i → i+1 по его конечной точке: сплошной, по толкованию, «по закону». */
const SOLID = 1;
const WEAK = 2;
const LEGAL = 4;
interface Chunks {
  /** наименьший и наибольший x точек куска c (точки c·CHUNK … (c+1)·CHUNK включительно) */
  lo: Float64Array;
  hi: Float64Array;
  /** виды отрезков куска — биты SOLID, WEAK, LEGAL */
  kinds: Uint8Array;
}
/**
 * Оглавление нити по кускам (NFR-1): на масштабе семьи нить-маршрут — десятки тысяч точек через 4 px на всю длину линии,
 * а видна из них сотня-другая. Путь по-прежнему тот же: пропускаются только отрезки, которые tracePath пропустил бы
 * и так (вне полосы или не своего вида). Точки нити после сборки не меняются (новый масштаб — новый массив точек).
 */
const chunkCache = new WeakMap<readonly StrandPoint[], Chunks>();
function chunksOf(pts: readonly StrandPoint[]): Chunks {
  let c = chunkCache.get(pts);
  if (c) return c;
  const n = Math.max(0, Math.ceil((pts.length - 1) / CHUNK));
  c = { lo: new Float64Array(n), hi: new Float64Array(n), kinds: new Uint8Array(n) };
  for (let k = 0; k < n; k++) {
    const a = k * CHUNK;
    const b = Math.min(pts.length - 1, a + CHUNK);
    let lo = Infinity;
    let hi = -Infinity;
    let kinds = 0;
    for (let i = a; i <= b; i++) {
      const q = pts[i];
      if (q.x < lo) lo = q.x;
      if (q.x > hi) hi = q.x;
      if (i > a) kinds |= q.weak ? WEAK : q.legal ? LEGAL : SOLID;
    }
    c.lo[k] = lo;
    c.hi[k] = hi;
    c.kinds[k] = kinds;
  }
  chunkCache.set(pts, c);
  return c;
}
const PART_BITS: Record<Part, number> = { all: SOLID | WEAK | LEGAL, solid: SOLID, weak: WEAK, legal: LEGAL };

/**
 * Путь нити от from до to (включительно) с отсечением по видимой полосе [x0, x1].
 * part: 'solid' — только сплошные отрезки, 'weak' — только отрезки звеньев по толкованию.
 * Отрезок i → i+1 считается «по толкованию», если такова его конечная точка (так их размечает геометрия).
 * Куски нити, целиком лежащие вне полосы или без отрезков вида part, пропускаются по оглавлению (chunksOf): путь тот же.
 */
export function tracePath(ctx: CanvasRenderingContext2D, pts: StrandPoint[], from: number, to: number, part: Part, x0: number, x1: number, ext = 0): boolean {
  ctx.beginPath();
  let pen = false;
  let any = false;
  const end = Math.min(to, pts.length - 1);
  const start = Math.max(0, from);
  /** Точка a, отодвинутая на ext px от b (продолжение отрезка b → a за a). */
  const past = (a: StrandPoint, b: StrandPoint): [number, number] => {
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    return [a.x + ((a.x - b.x) / d) * ext, a.y + ((a.y - b.y) / d) * ext];
  };
  const ch = chunksOf(pts);
  const bits = PART_BITS[part];
  for (let k = Math.floor(start / CHUNK); k * CHUNK < end; k++) {
    const hiI = Math.min(end, (k + 1) * CHUNK);
    // кусок вне полосы или без отрезков своего вида: каждый его отрезок был бы пропущен — перо поднято
    if (!(ch.kinds[k] & bits) || ch.hi[k] < x0 || ch.lo[k] > x1) {
      pen = false;
      continue;
    }
    for (let i = Math.max(start, k * CHUNK); i < hiI; i++) {
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
  }
  return any;
}

/** Опоры цвета не чаще, чем через столько px по x: цвет меняется медленно, а у нитей-маршрутов t растёт в каждой точке. */
const KNOT_PX = 8;
/** …и не чаще, чем через такую долю линии (≈ 125 опор на всю линию; поколение — 1/77 ≈ 0,013, опора каждого сохраняется). */
const KNOT_DT = 0.008;

/** Опоры цвета нити — один раз на массив точек (NFR-1: прежде — в каждом кадре на всю нить). */
const knotCache = new WeakMap<readonly StrandPoint[], { x: number; t: number }[]>();

/**
 * Опоры цвета вдоль нити: (x, t) в точках, где начинается новое поколение (t — место лица в линии, 0…1), не чаще чем
 * через KNOT_PX и KNOT_DT. x приводится к неубывающему, чтобы градиент был определён. Без прореживания нить-маршрут масштаба
 * семьи (t растёт в каждой точке через 4 px) давала сотни опор на градиент, и кадр масштабирования шёл 50–200 мс.
 */
export function colorKnots(pts: StrandPoint[]): { x: number; t: number }[] {
  const was = knotCache.get(pts);
  if (was) return was;
  const out: { x: number; t: number }[] = [];
  let maxX = -Infinity;
  const last = pts.length - 1;
  for (let i = 0; i <= last; i++) {
    if (i > 0 && i < last && pts[i].t === pts[i - 1].t) continue;
    const x = Math.max(maxX, pts[i].x);
    if (out.length && i < last && (x - out[out.length - 1].x < KNOT_PX || Math.abs(pts[i].t - out[out.length - 1].t) < KNOT_DT)) continue;
    maxX = x;
    if (i === last && out.length > 1 && x - out[out.length - 1].x < KNOT_PX) out.pop();
    out.push({ x, t: pts[i].t });
  }
  knotCache.set(pts, out);
  return out;
}

function tAt(knots: { x: number; t: number }[], x: number): number {
  if (!knots.length) return 0;
  if (x <= knots[0].x) return knots[0].t;
  for (let i = 1; i < knots.length; i++) {
    if (x <= knots[i].x) {
      const a = knots[i - 1];
      const b = knots[i];
      return b.x > a.x ? a.t + ((b.t - a.t) * (x - a.x)) / (b.x - a.x) : b.t;
    }
  }
  return knots[knots.length - 1].t;
}

/** Градиент нити по видимой полосе [x0, x1]: color(t) — цвет в месте t линии. */
function strandGradient(ctx: CanvasRenderingContext2D, knots: { x: number; t: number }[], x0: number, x1: number, color: (t: number) => string): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, color(tAt(knots, x0)));
  for (const k of knots) if (k.x > x0 && k.x < x1) g.addColorStop((k.x - x0) / (x1 - x0), color(k.t));
  g.addColorStop(1, color(tAt(knots, x1)));
  return g;
}

/**
 * Рисует нити [Мария, Иосиф]: сначала Мария, поверх Иосиф, затем участки плетения, где Мария сверху.
 * core — ширина нити, px; width — ширина холста (отсечение); flow — смещение штриха «тока света» или null.
 */
export function drawStrands(
  ctx: CanvasRenderingContext2D,
  strands: Strand[],
  core: number,
  look: RibbonLook,
  width: number,
  flow: number | null = null,
  o: { clip?: [number, number]; grads?: Map<string, CanvasGradient>; braid?: number } = {},
) {
  // видимая полоса в координатах нитей (небо рисует закэшированные нити со сдвигом)
  const [x0, x1] = o.clip ?? [-24, width + 24];
  const sky = hexToRgb(look.sky);
  const ends = (line: Strand['line']): [Rgb, Rgb] => {
    const [a, b] = line === 'joseph' ? look.gold : look.azure;
    return [hexToRgb(a), hexToRgb(b)];
  };
  const coreW = look.night ? core : core + DAY_CORE_PLUS;
  const gapW = look.night ? core + 2.2 : Math.max(DAY_HALO_MIN, core + 3.4);
  const toneW = gapW + 1;
  // подложка участка плетения не задевает другую нить у крайних положений косы (там нити дальше всего, 2·braid):
  // иначе её плоский конец прорезал бы другую нить (тугая коса, MAP-60)
  const overGapW = o.braid ? Math.max(coreW, Math.min(gapW, 4 * o.braid - coreW)) : gapW;

  const prepared = strands.map((st) => {
    const [c1, c2] = ends(st.line);
    const knots = colorKnots(st.points);
    const at = (t: number) => lerp3(c1, c2, t);
    // градиент по видимой полосе; с кэшем неба — по всей длине нити, один раз на масштаб (при сдвиге не строится)
    const grad = (name: string, color: (t: number) => string) => {
      if (!o.grads) return strandGradient(ctx, knots, x0, x1, color);
      const key = `${st.line}|${name}|${look.sky}|${look.gold.join()}|${look.azure.join()}`;
      let g = o.grads.get(key);
      if (!g) {
        const a = knots.length ? knots[0].x : 0;
        const b = knots.length ? Math.max(a + 1, knots[knots.length - 1].x) : 1;
        o.grads.set(key, (g = strandGradient(ctx, knots, a, b, color)));
      }
      return g;
    };
    const paint = (a: number) => grad(`paint ${a}`, (t) => css(at(t), a));
    return {
      st,
      paint,
      /** непрозрачный цвет нити, смешанный с небом при гашении */
      solid: grad(`solid ${look.dim}`, (t) => css(lerp3(sky, at(t), look.dim))),
      /** дневной тон своего цвета */
      tone: !look.night && look.tone > 0 ? paint(look.tone * look.dim) : null,
    };
  });

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  // свечение ночью: широкий и узкий слой, по одному пути на нить — без «бусин» на стыках
  if (look.night) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';
    for (let k = 0; k < 2; k++) {
      const a = look.glow[k] * look.dim;
      if (a <= 0) continue;
      for (const p of prepared) {
        if (!tracePath(ctx, p.st.points, 0, p.st.points.length, 'solid', x0, x1)) continue;
        ctx.strokeStyle = p.paint(a);
        ctx.lineWidth = core * GLOW_WIDTH[k];
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Слои нити от from до to. over — участок плетения поверх другой нити (MAP-57): подложка и нить — с плоскими концами. Круглый конец подложки на стыке прорезал бы собственную нить тёмным
   * «швом» через каждые 60 px, а сплошная нить со швами читалась бы как пунктир толкования. Нить — на 1 px длиннее
   * подложки: стык без просвета.
   */
  const layer = (p: (typeof prepared)[number], from: number, to: number, over = false) => {
    const pts = p.st.points;
    const cap: CanvasLineCap = over ? 'butt' : 'round';
    // подложка: зазор в плетении ночью, светлый ореол днём
    ctx.lineCap = cap;
    if (tracePath(ctx, pts, from, to, 'all', x0, x1)) {
      ctx.strokeStyle = look.night ? look.sky : look.halo;
      ctx.lineWidth = over ? overGapW : gapW;
      ctx.stroke();
    }
    // нить участка плетения — на 1 px длиннее с каждой стороны: без светлого шва на стыке (MAP-57)
    const ext = over ? 1 : 0;
    // тон своего цвета под дневной нитью
    if (p.tone && tracePath(ctx, pts, from, to, 'solid', x0, x1, ext)) {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = p.tone;
      ctx.lineWidth = toneW;
      ctx.stroke();
    }
    // нить
    ctx.lineCap = cap;
    const solid = p.solid;
    if (tracePath(ctx, pts, from, to, 'solid', x0, x1, ext)) {
      ctx.strokeStyle = solid;
      ctx.lineWidth = coreW;
      ctx.stroke();
    }
    // штрих отсчитывается от начала пути: без отсечения рисунок штриха не «плывёт» при сдвиге неба
    if (tracePath(ctx, pts, from, to, 'weak', -Infinity, Infinity)) {
      ctx.strokeStyle = solid;
      ctx.lineWidth = coreW;
      ctx.setLineDash([coreW * 1.2, coreW * 2.2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // шаг «по закону» (Иосиф → Иисус, Мф 1:16) от узла союза — штрихом, как связь иного рода (Г10: штрих [5, 3])
    if (tracePath(ctx, pts, from, to, 'legal', -Infinity, Infinity)) {
      ctx.strokeStyle = solid;
      ctx.lineWidth = coreW;
      ctx.setLineDash([coreW * 2.2, coreW * 1.3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  // основные нити: сначала Мария, потом Иосиф
  for (const p of prepared) layer(p, 0, p.st.points.length);
  // плетение (MAP-75; решение 40): там, где Иосиф «под» Марией, Мария рисуется поверх ещё раз — всегда: у косы одно
  // перекрестье на поколение, и нижняя нить в перекрестье рвётся, иначе коса читалась бы золотой линией с «глазками»
  const mary = prepared.find((p) => p.st.line === 'mary');
  if (mary) for (const [a, b] of mary.st.over) layer(mary, a, b, true);

  // ток света к Иисусу — только при выборе или наведении линии
  if (flow !== null) {
    ctx.setLineDash([2, 14]);
    ctx.lineDashOffset = -flow;
    ctx.lineCap = 'round';
    ctx.lineWidth = core * 0.9;
    for (const p of prepared) {
      if (!tracePath(ctx, p.st.points, 0, p.st.points.length, 'all', -Infinity, Infinity)) continue;
      const [c1] = ends(p.st.line);
      ctx.strokeStyle = css(c1, 0.9);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
  ctx.restore();
}

/** Часть нити с индекса a по b включительно; участки плетения — в индексах части. */
export function sliceStrand(st: Strand, a: number, b: number): Strand {
  const over: [number, number][] = [];
  for (const [x, y] of st.over) {
    const lo = Math.max(a, x);
    const hi = Math.min(b, y);
    if (hi > lo) over.push([lo - a, hi - a]);
  }
  return { line: st.line, ids: st.ids, points: st.points.slice(a, b + 1), over };
}

/**
 * Участки нити между соседними выделенными лицами — частями нити (sliceStrand). Зависят только от того, какие лица нити
 * выделены, поэтому запоминаются на нить и набор выделенных: нить-маршрут масштаба семьи — десятки тысяч точек, и обход
 * их в каждом кадре при выбранном лице стоил 1–2 мс (NFR-1). Те же части — те же массивы точек: их оглавление и опоры
 * цвета тоже не строятся заново.
 */
const litCache = new WeakMap<Strand, { key: string; parts: Strand[] }>();
export function litParts(st: Strand, lit: (id: string) => boolean): Strand[] {
  let key = '';
  for (const id of st.ids) key += lit(id) ? '1' : '0';
  const was = litCache.get(st);
  if (was && was.key === key) return was.parts;
  const parts = litRanges(st, lit).map(([a, b]) => sliceStrand(st, a, b));
  litCache.set(st, { key, parts });
  return parts;
}

/** Участки нити (индексы точек) между соседними лицами, оба из которых отмечены lit. */
export function litRanges(st: Strand, lit: (id: string) => boolean): [number, number][] {
  const gen = st.ids.map((id, k) => k + 1 < st.ids.length && lit(id) && lit(st.ids[k + 1]));
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < st.points.length; i++) {
    const k = Math.min(st.ids.length - 2, Math.floor(st.points[i].u));
    const on = k >= 0 && gen[k];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0 && st.points.length - 1 > start) out.push([start, st.points.length - 1]);
  return out;
}

/** Лента под указателем (E6; MAP-28): линия, шаг «от лица k к лицу k + 1» и точка указателя. */
export interface RibbonHit {
  line: 'joseph' | 'mary';
  from: string;
  to: string;
  x: number;
  y: number;
}

/**
 * Нити неба, построенные на нынешнем масштабе (кэш на небо): при сдвиге неба они не перестраиваются, а рисуются
 * со сдвигом (dx, dy) — геометрия и градиенты те же. x0 и laneTop — камера, при которой нити построены.
 */
interface RibbonCache {
  key: string;
  /** ключ без масштаба: при нём нити пересчитываются из прежних, пока масштаб в движении (Я33) */
  base: string;
  x0: number;
  laneTop: number;
  /** масштаб нитей кэша и масштаб их точной сборки; exact — нити построены при этом масштабе, а не пересчитаны */
  kx: number;
  ky: number;
  kx0: number;
  ky0: number;
  exact: boolean;
  /**
   * нити зависят от полосы построения (сплайн обзора: за краем — 4 точки на поколение); нити-маршруты масштаба семьи
   * (доля маршрута 1) построены на всю длину линии и при сдвиге перестраиваются только дальше RIBBON_FAR
   */
  clipped: boolean;
  strands: Strand[];
  grads: Map<string, CanvasGradient>;
  /** сдвиг последнего кадра: экранная точка = точка нити + (dx, dy) */
  dx: number;
  dy: number;
}
const ribbonCaches = new WeakMap<object, RibbonCache>();
/** Запас построения за краем холста, px: пока сдвиг меньше, нити не перестраиваются. */
const RIBBON_MARGIN = 240;
/**
 * Сдвиг, после которого перестраиваются и нити-маршруты (они от полосы построения не зависят): точки нити остаются
 * близко к холсту, и координаты пути в пределах точности холста (NFR-1: перестройка на масштабе семьи — 40 мс).
 */
const RIBBON_FAR = 20000;
const hovers = new WeakMap<object, RibbonHit | null>();

/** Лента под указателем в точке (x, y) px холста: ближайшая нить не дальше r px; звёзды ловятся раньше (sky.hit). */
export function ribbonAt(v: object, x: number, y: number, r = 6): RibbonHit | null {
  const c = ribbonCaches.get(v);
  if (!c) return null;
  let best: RibbonHit | null = null;
  let bd = r * r;
  for (const st of c.strands) {
    for (const q of st.points) {
      const dx = q.x + c.dx - x;
      if (dx > r || dx < -r) continue;
      const dy = q.y + c.dy - y;
      const d = dx * dx + dy * dy;
      if (d > bd) continue;
      const k = Math.min(st.ids.length - 2, Math.floor(q.u));
      if (k < 0) continue;
      bd = d;
      best = { line: st.line, from: st.ids[k], to: st.ids[k + 1], x, y };
    }
  }
  return best;
}
/** Запомнить ленту под указателем (src/ui/sky/input.ts); true — изменилась, нужен кадр. */
export function setRibbonHover(v: object, h: RibbonHit | null): boolean {
  const was = hovers.get(v) ?? null;
  const same = (!was && !h) || (!!was && !!h && was.line === h.line && was.from === h.from && was.x === h.x && was.y === h.y);
  hovers.set(v, h);
  return !same;
}
export const ribbonHover = (v: object): RibbonHit | null => hovers.get(v) ?? null;

/**
 * Ленты на небе: нити по лицам линий, которые есть в данных (лица, которых ещё нет, пропускаются — нить идёт к следующему
 * известному звену). Амплитуда косы и ширина нити растут с высотой полосы; в режиме «только линии» — крупнее.
 * steps — шаги линий из data/lines (atlas.ts: lines): отсюда модуль не читает данные атласа сам.
 *
 * Выделение (E6, skyGroup): при выделенном роде ленты гаснут; участки между соседними лицами группы панели
 * («Главы», участок «Синопсиса») и пути родства — в полную силу. Наведённая лента — в полную силу, шире, с током света.
 */
/**
 * Средняя линия раздельного участка (MAP-62): точки pts лиц одной ветви по порядку (концы — развилка и схождение —
 * неподвижны) придвигаются к хорде между концами: отклонение от неё умножается на flat. Небо передаёт flat =
 * 1 / пропорция строк (J1): при строках ×3 нить царей ходит по строкам не больше, чем при обычных строках (а не на
 * ~100 px за каждым царём); при обычных строках (flat = 1) нить идёт через звёзды, как прежде. Амплитуда косы от этого
 * не зависит (BRAID_PX).
 */
export function smoothMidline(pts: readonly { x: number; y: number }[], flat: number): number[] {
  const n = pts.length;
  if (n < 3 || flat >= 1) return pts.map((q) => q.y);
  const a = pts[0];
  const b = pts[n - 1];
  return pts.map((q, i) => {
    if (i === 0 || i === n - 1) return q.y;
    const u = b.x > a.x ? Math.max(0, Math.min(1, (q.x - a.x) / (b.x - a.x))) : i / (n - 1);
    const ref = a.y + (b.y - a.y) * u;
    return ref + (q.y - ref) * flat;
  });
}

/** Лица линий на небе для нитей: «набор» пропускает скрытых, у звена за скрытыми — разреженная нить (J4; MAP-64). */
function strandSteps(v: SkyContext, s: SkyState, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }, ln: 'joseph' | 'mary') {
  const out: { id: string; weak: boolean; legal: boolean; skipped: boolean }[] = [];
  let skipped = false;
  for (const raw of steps[ln]) {
    const st = s.lineFlip && ln === 'mary' && raw.id === 'mariya' ? { ...raw, id: 'iosif-muzh-marii' } : raw;
    if (v.indexOf(st.id) === undefined) continue;
    if (s.guide && v.hides(st.id)) {
      skipped = out.length > 0;
      continue;
    }
    out.push({ id: st.id, weak: skipped || st.flag === 'interpretation' || st.flag === 'luke-only' || (ln === 'mary' && st.id === 'salafiil'), legal: st.flag === 'legal', skipped });
    skipped = false;
  }
  return out;
}

/** Радиус ступеньки ленты на масштабе семьи (§ 3: 8–16 px) — по высоте строки. */
export const routeRadius = (ky: number) => Math.max(8, Math.min(16, ky * 0.5));

/**
 * Нити неба при нынешней камере (кэш на небо, RibbonCache): строятся заново только при смене масштаба, модели, режима,
 * размера холста или сжатия полос и при сдвиге дальше запаса; иначе — те же нити со сдвигом (dx, dy). Точки лиц — по
 * полосам кадра (в режиме «только линии» на общей раскладке — по полосам раскладки: небо ставит лиц линий на нити,
 * ribbonBeads), средняя линия раздельных участков сглажена (MAP-62). На масштабе семьи (v.routeFactor, § 3) нити идут
 * по маршрутам связей — по следу родителя до узла союза шага и ступенькой к ребёнку; в полосе перехода ×1,5 сплайн
 * плавно переходит в маршрут (blendStrands).
 */
export function ribbonStrands(v: SkyContext, s: SkyState, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }): RibbonCache {
  const { cam } = v;
  const ky = cam.ky;
  // лица нитей — в ключе (этап 11, B1): набор той же величины с теми же строками (одно лицо линии убрали, другое лицо
  // взяли в той же полосе) не меняет ключа строк, а нить прошла бы через скрытое лицо
  const J = strandSteps(v, s, steps, 'joseph');
  const M = strandSteps(v, s, steps, 'mary');
  const ids = (xs: { id: string; weak: boolean }[]) => xs.map((q) => (q.weak ? `~${q.id}` : q.id)).join(',');
  // доля маршрута (§ 3): 0 — сплайн обзора, 1 — маршрут масштаба семьи; шаг 0,05 — кэш не перестраивается на каждом кадре
  const f = Math.round(Math.max(0, Math.min(1, v.routeFactor)) * 20) / 20;
  const base = `${v.model.id}|${v.lambda}|${s.lineFlip}|${s.onlyLines}|${cam.w}|${cam.h}|${v.rowsKey}|${!!s.guide}|${ids(J)}|${ids(M)}`;
  const key = `${base}|${cam.kx}|${ky}|${f}|${f > 0 ? v.linksKey : ''}`;
  let c = ribbonCaches.get(v);
  // масштаб в движении (Я33): нити пересчитываются из прежних (точки линейны по координатам неба), пока масштаб не уйдёт
  // от точной сборки дальше чем вдвое; когда постоит — строятся заново (небо перерисовывает кадр, SkyView)
  const near = (a: number, b: number) => a / b < 2 && b / a < 2;
  if (c && c.key !== key && v.scaleMoving && c.base === base && near(cam.kx, c.kx0) && near(ky, c.ky0) && Math.abs((c.x0 - cam.x0) * cam.kx) < RIBBON_MARGIN) {
    c = rescaleRibbons(c, cam.x0, cam.laneTop, cam.kx, ky, key);
    ribbonCaches.set(v, c);
  } else if (!c || c.key !== key || (!c.exact && !v.scaleMoving) || Math.abs((c.x0 - cam.x0) * cam.kx) > (c.clipped ? RIBBON_MARGIN - 40 : RIBBON_FAR)) {
    // точки лиц — по полосам нитей: в «только линиях» на общей раскладке — по полосам раскладки (лица стоят на нитях)
    const at = v.ribbonNodes;
    const raw = (id: string) => {
      const i = v.indexOf(id);
      return i === undefined ? null : { x: cam.sx(v.X0[i]), y: cam.sy(at[i].lane) };
    };
    // средняя линия раздельных участков (ветвей) при растянутых строках — сглажена (MAP-62); развилки и схождения на месте
    const flat = Math.min(1, cam.kyWith(cam.kx, 1) / ky);
    const smooth = new Map<string, number>();
    const jIds = J.map((q) => q.id);
    const mIds = M.map((q) => q.id);
    for (const r of runSpans(jIds, mIds)) {
      if (r.kind !== 'split') continue;
      for (const [xs, [a, b]] of [[jIds, r.j], [mIds, r.m]] as const) {
        const part = xs.slice(a, b + 1);
        const pts = part.map(raw);
        if (pts.some((q) => !q)) continue;
        smoothMidline(pts as { x: number; y: number }[], flat).forEach((y, k) => k > 0 && k < part.length - 1 && smooth.set(part[k], y));
      }
    }
    const project = (id: string) => {
      const q = raw(id);
      return q && smooth.has(id) ? { x: q.x, y: smooth.get(id)! } : q;
    };
    const A = BRAID_PX;
    let strands = buildRibbons({ joseph: J, mary: M, project, amplitude: A, meander: A * 0.5, clip: [-RIBBON_MARGIN, cam.w + RIBBON_MARGIN] });
    if (f > 0) {
      // маршруты шагов: по узлам союзов кадра (src/render/links.ts, via); звёзды — на своих местах кадра
      const star = (id: string) => {
        const i = v.indexOf(id);
        if (i === undefined) return null;
        const q = byId.get(id);
        return { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane), r: starRadius(q?.magnitude ?? 6, Math.max(0.7, Math.min(1.25, ky / 18))) + (q?.sex === 'f' ? 2.2 : 0) };
      };
      const route = (xs: typeof J): RouteStep[] =>
        xs.map((q, k) => {
          if (k === 0 || q.skipped) return { id: q.id, weak: q.weak, pts: null };
          const a = star(xs[k - 1].id);
          const b = star(q.id);
          const via = v.linkVia(`${xs[k - 1].id}>${q.id}`);
          return { id: q.id, weak: q.weak, legal: q.legal, pts: a && b ? stepRoute(a, b, via ? via.x : b.x - b.r - 9) : null };
        });
      const routes = buildRouteRibbons({ joseph: route(J), mary: route(M), project: star, amplitude: A, radius: routeRadius(ky), clip: [-RIBBON_MARGIN, cam.w + RIBBON_MARGIN] });
      strands = blendStrands(strands, routes, f);
    }
    // blendStrands при доле 1 отдаёт нити-маршруты как есть: сплайн с его полосой построения в них не входит
    c = { key, base, x0: cam.x0, laneTop: cam.laneTop, kx: cam.kx, ky, kx0: cam.kx, ky0: ky, exact: true, clipped: f < 0.999, strands, grads: new Map(), dx: 0, dy: 0 };
    ribbonCaches.set(v, c);
  }
  c.dx = (c.x0 - cam.x0) * cam.kx;
  c.dy = (cam.laneTop - c.laneTop) * ky;
  return c;
}

/**
 * Нити при новом масштабе — пересчётом прежних (на время движения масштаба, как кадр связей в sky.ts): x = (X − x0)·kx,
 * y = (laneTop − строка)·ky линейны по координатам неба, строки те же (ключ без масштаба). Градиенты — заново.
 */
function rescaleRibbons(c: RibbonCache, x0: number, laneTop: number, kx: number, ky: number, key: string): RibbonCache {
  const a = kx / c.kx;
  const bx = (c.x0 - x0) * kx;
  const e = ky / c.ky;
  const by = (laneTop - c.laneTop) * ky;
  const strands = c.strands.map((st) => ({ ...st, points: st.points.map((q) => ({ ...q, x: q.x * a + bx, y: q.y * e + by })) }));
  return { ...c, key, x0, laneTop, kx, ky, exact: false, strands, grads: new Map(), dx: 0, dy: 0 };
}

/**
 * Лица линий на нитях (MAP-71; ТЗ § 3.2: «каждое лицо — бусина»): в режиме «только линии» лицо ветви стоит на своей
 * нити, общее лицо — посередине между нитями косы, там, где их проводит геометрия лент (сглаженная средняя линия,
 * MAP-26, MAP-62). Возвращает для лица высоту на экране (px холста). Раскладка (полосы) при этом не меняется.
 */
export function ribbonBeads(v: SkyContext, s: SkyState, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }): Map<string, number> {
  const c = ribbonStrands(v, s, steps);
  const ys = new Map<string, number[]>();
  for (const st of c.strands)
    st.ids.forEach((id, k) => {
      const q = pointAt(st.points, k);
      if (!q || Math.abs(q.u - k) > 0.02) return;
      const a = ys.get(id);
      if (a) a.push(q.y + c.dy);
      else ys.set(id, [q.y + c.dy]);
    });
  const out = new Map<string, number>();
  for (const [id, a] of ys) out.set(id, a.reduce((x, y) => x + y, 0) / a.length);
  return out;
}

export function drawSkyRibbons(v: SkyContext, s: SkyState, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }): Strand[] {
  const { ctx, cam, pal } = v;
  const ky = cam.ky;
  const boost = s.onlyLines ? 1.35 : 1;
  // коса — тугая, амплитуда в px постоянна (MAP-60, MAP-62)
  const A = BRAID_PX;
  // нити — из кэша неба: при протяжке неба они рисуются со сдвигом (NFR-1: 60 кадров/с)
  const c = ribbonStrands(v, s, steps);
  const { strands, dx, dy } = c;
  const clip: [number, number] = [-24 - dx, cam.w + 24 - dx];
  // в режиме «В работе» (J4) ленты — тонкий ориентир
  const core = Math.max(2.1, Math.min(3.6, ky / 6)) * boost * (s.guide ? 0.55 : 1);
  const flow = s.flow && !s.reduced ? s.flow * 0.02 : null;
  const hl = s.highlight;
  const hover = ribbonHover(v);
  ctx.save();
  ctx.translate(dx, dy);
  // ориентир режима «В работе» (J4) — и приглушён, как при выделении рода
  const look = ribbonLook(pal, !!hl || !!s.guide);
  // выбранная связь (§ 8): ленты гаснут до 55 %
  if (s.link) look.dim = Math.min(look.dim, LINK_RIBBON_DIM);
  drawStrands(ctx, strands, core, look, cam.w, hover ? null : flow, { clip, grads: c.grads, braid: A });
  // участки группы панели и пути родства — в полную силу поверх погашенных лент
  if (hl) {
    const lit = (id: string) => {
      const k = hl.get(id);
      return k === 'group' || k === 'path' || k === 'self';
    };
    const parts = strands.flatMap((st) => litParts(st, lit));
    if (parts.length) drawStrands(ctx, parts, core, ribbonLook(pal, false), cam.w, null, { clip, braid: A });
  }
  // наведённая лента: её нить целиком — в полную силу и чуть шире, с током света к Иисусу (ТЗ § 3.2)
  if (hover) {
    const st = strands.find((x) => x.line === hover.line);
    if (st) drawStrands(ctx, [st], core * 1.25, ribbonLook(pal, false), cam.w, flow ?? 0, { clip, grads: c.grads, braid: A });
  }
  ctx.restore();
  return strands;
}

/** Шаг поколения на экране, при котором средняя линия нити ещё не сглажена (engine/ribbons.ts, MEANDER_FULL_PX). */
const DENSE_PX = 60;
/**
 * Проверка лент кадра (этап 11, B1; canvas[data-ribbon-gaps], tools/_bugs-chaos.ts): лента не обрывается между двумя
 * соседними видимыми лицами линии и проходит у их звёзд (p.starsDrawn — нарисованные звёзды кадра). Возвращает замечания:
 * «линия:а>б» — нить не проходит через одно из соседних видимых лиц; «линия:лицо@N» — звезда общего лица двух линий
 * в N px от своей нити, дальше строки и амплитуды косы (нить нарисована не там, где звёзды, — устаревший кэш). Лица
 * тесных поколений и раздельных участков нить сглаживает нарочно (MAP-26, MAP-62) — у них только непрерывность.
 * Пусто — всё в порядке.
 */
export function ribbonCheck(v: SkyContext, p: Pass, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }): string[] {
  const c = ribbonCaches.get(v);
  if (!c) return [];
  const { cam } = v;
  const out: string[] = [];
  const st = skySteps(v, p.s, steps);
  const on = (i: number) => {
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    return x > v.letterW && x < cam.w && y > v.openTop && y < cam.vp.b ? { x, y } : null;
  };
  // строка и амплитуда косы, но не меньше 16 px: средняя линия тесных поколений сглажена (MAP-26, MAP-62)
  const tol = Math.max(16, cam.ky) + BRAID_PX + 2;
  // общие лица обеих линий: на раздельных участках средняя линия при растянутых строках сглажена нарочно (MAP-62) —
  // там проверяется только непрерывность
  const jSet = new Set(st.joseph.map((x) => x.id));
  const shared = new Set(st.mary.map((x) => x.id).filter((id) => jSet.has(id)));
  for (const strand of c.strands) {
    const ids = new Map(strand.ids.map((id, k) => [id, k]));
    const pts = strand.points;
    let prev: string | null = null;
    for (const step of st[strand.line]) {
      const i = v.indexOf(step.id);
      if (i === undefined || !p.starsDrawn.has(i)) continue;
      const q = on(i);
      if (!q) continue;
      const k = ids.get(step.id);
      if (prev !== null && (k === undefined || !ids.has(prev))) out.push(`${strand.line}:${prev}>${step.id}`);
      prev = step.id;
      if (k === undefined || !shared.has(step.id)) continue;
      // тесные поколения (шаг меньше 60 px) нить сглаживает нарочно (MAP-26): у таких лиц — только непрерывность
      const nx = (id: string | undefined) => {
        const j = id === undefined ? undefined : v.indexOf(id);
        return j === undefined ? null : cam.sx(v.X0[j]);
      };
      const genPx = [nx(strand.ids[k - 1]), nx(strand.ids[k + 1])].filter((x): x is number => x !== null).map((x) => Math.abs(x - q.x));
      if (genPx.some((d) => d < DENSE_PX)) continue;
      // расстояние от звезды до своей нити у её места (u = k ± ½): первая точка с u ≥ k − ½ — двоичным поиском
      let lo = 0;
      let hi = pts.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].u < k - 0.5) lo = mid + 1;
        else hi = mid;
      }
      let best = Infinity;
      for (let j = lo; j < pts.length && pts[j].u <= k + 0.5; j++) best = Math.min(best, Math.hypot(pts[j].x + c.dx - q.x, pts[j].y + c.dy - q.y));
      if (Number.isFinite(best) && best > tol) out.push(`${strand.line}:${step.id}@${Math.round(best)}`);
    }
  }
  return out;
}

/**
 * Лица ветвей у каждой развилки двух линий (MAP-80): развилка (лицо, где линии расходятся) → лица каждой ветви между
 * развилкой и схождением, по порядку. Ветвь, у которой лиц нет («только у Луки»), не развилка.
 */
export function branchPersons(j: string[], m: string[]): Map<string, { joseph: string[]; mary: string[] }> {
  const out = new Map<string, { joseph: string[]; mary: string[] }>();
  for (const r of runSpans(j, m)) {
    if (r.kind !== 'split') continue;
    const joseph = j.slice(r.j[0] + 1, j[r.j[1]] === m[r.m[1]] ? r.j[1] : r.j[1] + 1);
    const mary = m.slice(r.m[0] + 1, j[r.j[1]] === m[r.m[1]] ? r.m[1] : r.m[1] + 1);
    if (joseph.length && mary.length) out.set(j[r.j[0]], { joseph, mary });
  }
  return out;
}

// ---------- точки сравнения линий (E6; U2, MAP-23, MAP-29, UX-16) ----------

/**
 * Точка сравнения Мф 1 и Лк 3: где линии расходятся, сходятся или где у одной линии есть лицо, которого нет в другой.
 * Выводится из самих линий (data/lines): для нынешних данных это Каинан; Давид — Соломон и Нафан; Салафиил
 * и Зоровавель; Авиуд и Рисай; Иисус Христос.
 */
export interface ComparePoint {
  /** лицо, у которого стоит выноска (оно же — место синопсиса, synopsisAt) */
  at: string;
  kind: 'only' | 'split' | 'join';
  /** выноска целиком и коротко (если целиком не помещается) */
  full: string;
  short: string;
  /** первые лица ветвей после расхождения: Иосифа и Марии */
  branch?: { joseph: string; mary: string; mt: string; lk: string };
  /** общая мать первых лиц ветвей (Вирсавия у Соломона и Нафана) и стих, где она названа их матерью */
  mother?: { id: string; ref: string; text: string };
}

const nm = (id: string) => byId.get(id)?.name ?? id;
/** Первая ссылка шага на книгу (Мф или Лк), в виде для текста: «Мф 1:6». */
const refIn = (st: LineStep | undefined, book: 'Мф' | 'Лк'): string => {
  const r = st?.refs.find((x) => x.startsWith(`${book} `));
  return r ? refText(r) : '';
};
const inParens = (...refs: string[]) => {
  const r = refs.filter(Boolean);
  return r.length ? ` (${r.join('; ')})` : '';
};
const gen = (id: string) => {
  const q = byId.get(id);
  return q ? nameCase(q.name, q.sex, 'gen', q.unnamed) : null;
};

/** Точки сравнения двух линий: по общим и раздельным участкам (engine/ribbons.ts, runSpans). */
/** comparePoints по спискам лиц двух линий: списки строятся заново в каждом кадре (skySteps), а сами лица меняются редко. */
const compareMemo = new Map<string, ComparePoint[]>();
export function comparePoints(J: readonly LineStep[], M: readonly LineStep[]): ComparePoint[] {
  const key = `${J.map((s) => s.id).join(',')}|${M.map((s) => s.id).join(',')}`;
  let out = compareMemo.get(key);
  if (!out) {
    if (compareMemo.size > 16) compareMemo.clear();
    out = comparePointsOf(J, M);
    compareMemo.set(key, out);
  }
  return out;
}
function comparePointsOf(J: readonly LineStep[], M: readonly LineStep[]): ComparePoint[] {
  const jIds = J.map((s) => s.id);
  const mIds = M.map((s) => s.id);
  const spans = runSpans(jIds, mIds);
  const out: ComparePoint[] = [];
  spans.forEach((r, ri) => {
    if (r.kind !== 'split') return;
    const jMid = J.slice(r.j[0] + 1, r.j[1]);
    const mMid = M.slice(r.m[0] + 1, r.m[1]);
    const joins = r.j[1] > r.j[0] && jIds[r.j[1]] === mIds[r.m[1]];
    if (!jMid.length && mMid.length) {
      const names = mMid.map((s) => nm(s.id)).join(', ');
      const refs = mMid.map((s) => refIn(s, 'Лк')).filter(Boolean);
      out.push({ at: mMid[0].id, kind: 'only', full: `${names} — только у Луки${inParens(...refs)}`, short: `${names} — только у Луки` });
      return;
    }
    if (jMid.length && !mMid.length) {
      const names = jMid.map((s) => nm(s.id)).join(', ');
      const refs = jMid.map((s) => refIn(s, 'Мф')).filter(Boolean);
      out.push({ at: jMid[0].id, kind: 'only', full: `${names} — только у Матфея${inParens(...refs)}`, short: `${names} — только у Матфея` });
      return;
    }
    if (!jMid.length || !mMid.length) return;
    // расхождение: у точки начала участка
    const a = jIds[r.j[0]];
    const j1 = jMid[0];
    const m1 = mMid[0];
    const mt = refIn(j1, 'Мф');
    const lk = refIn(m1, 'Лк');
    const split: ComparePoint = {
      at: a, kind: 'split',
      full: `Расходятся: ${nm(j1.id)}${inParens(mt)} и ${nm(m1.id)}${inParens(lk)}`,
      short: `Расходятся: ${nm(j1.id)} и ${nm(m1.id)}`,
      branch: { joseph: j1.id, mary: m1.id, mt, lk },
    };
    const qj = byId.get(j1.id);
    const qm = byId.get(m1.id);
    if (qj?.mother && qj.mother === qm?.mother) {
      const ref = qj.parentRefs.find((x) => qm.parentRefs.includes(x));
      const [gj, gm] = [gen(j1.id), gen(m1.id)];
      const mother = nm(qj.mother);
      const text = gj && gm ? `${mother} — мать ${gj} и ${gm}${inParens(ref ? refText(ref) : '')}` : `${mother}${inParens(ref ? refText(ref) : '')}`;
      split.mother = { id: qj.mother, ref: ref ?? '', text };
    }
    out.push(split);
    // схождение: у первого общего лица после участка
    if (!joins) return;
    const next = spans[ri + 1];
    const shared = next && next.kind === 'shared' ? jIds.slice(next.j[0], next.j[1] + 1) : [jIds[r.j[1]]];
    const names = shared.slice(0, 2).map(nm).join(' и ');
    const z = jIds[r.j[1]];
    const jz = J[r.j[1]];
    const mz = M[r.m[1]];
    out.push({ at: z, kind: 'join', full: `Сходятся: ${names}${inParens(refIn(jz, 'Мф'), refIn(mz, 'Лк'))}`, short: `Сходятся: ${names}` });
  });
  return out;
}

/** Сетка точек нитей (клетка 32 px): проверка «не на ленте» без перебора всех точек — её зовут для каждой подписи. */
const GRID = 32;
const grids = new WeakMap<readonly Strand[], Map<number, StrandPoint[]>>();
function gridOf(strands: readonly Strand[]): Map<number, StrandPoint[]> {
  let g = grids.get(strands);
  if (g) return g;
  g = new Map();
  for (const st of strands)
    for (const q of st.points) {
      const k = (Math.floor(q.x / GRID) + 4096) * 8192 + Math.floor(q.y / GRID) + 4096;
      const a = g.get(k);
      if (a) a.push(q);
      else g.set(k, [q]);
    }
  grids.set(strands, g);
  return g;
}
/**
 * Прямоугольник не ложится на нити лент (с полем 3 px): подписи лент и выноски не закрывают ленту. dx, dy — сдвиг
 * нитей на экране (нити кэша строятся при одном положении неба и рисуются со сдвигом): сетка строится один раз на кэш.
 */
function offStrands(strands: readonly Strand[], b: Rect, dx = 0, dy = 0): boolean {
  const x0 = b.x - 3 - dx;
  const x1 = b.x + b.w + 3 - dx;
  const y0 = b.y - 3 - dy;
  const y1 = b.y + b.h + 3 - dy;
  const g = gridOf(strands);
  for (let cx = Math.floor(x0 / GRID); cx <= Math.floor(x1 / GRID); cx++)
    for (let cy = Math.floor(y0 / GRID); cy <= Math.floor(y1 / GRID); cy++)
      for (const q of g.get((cx + 4096) * 8192 + cy + 4096) ?? []) if (q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1) return false;
  return true;
}
/** Прямоугольник (px холста) не ложится на нити лент последнего кадра — с полем 3 px (подписи лиц линий, MAP-56). */
export const clearOfRibbons = (v: object, b: Rect): boolean => {
  const c = ribbonCaches.get(v);
  return !c || offStrands(c.strands, b, c.dx, c.dy);
};
/** Первая точка нити с номером не меньше u (точки идут по возрастанию u): двоичный поиск. */
function pointAt(pts: readonly StrandPoint[], u: number): StrandPoint | undefined {
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].u < u) lo = mid + 1;
    else hi = mid;
  }
  return pts[lo];
}
/** Сначала места, свободные от лент; если таких нет — любые. */
const byStrands = (c: { strands: readonly Strand[]; dx: number; dy: number }, boxes: Rect[]) => {
  const off = boxes.map((b) => offStrands(c.strands, b, c.dx, c.dy));
  return [...boxes.filter((_b, i) => off[i]), ...boxes.filter((_b, i) => !off[i])];
};

/** Выноска на небе, по щелчку — синопсис участка (at) или карточка лица (person). */
export interface NoteHit extends Rect {
  kind: 'synopsis' | 'person';
  id: string;
}
const noteHitsOf = new WeakMap<object, NoteHit[]>();
/** Знаки-спутницы у развилок этого кадра: их подписи ставятся после имён лиц линий. */
const beads = new WeakMap<object, { bx: number; by: number; low: number; mr: number; id: string; text: string }[]>();
/** Выноски последнего кадра (src/ui/sky/input.ts: наведение и щелчок). */
export const lineNoteHits = (v: object): NoteHit[] => noteHitsOf.get(v) ?? [];

/**
 * Шаги линий на небе: Лк 3 как второе родословие Иосифа меняет Марию на Иосифа; лица, которых нет на небе, пропускаются —
 * и лица, скрытые набором или свёрткой (J4, J5; этап 11, B1): их нет среди звёзд и на нитях лент (strandSteps), поэтому
 * нет и их имён, номеров у бусин, выносок точек сравнения и знаков матерей. Прежде в небе «набор» с «только линиями»
 * имена всех лиц линий висели на пустом небе без звёзд и лент (снимок 14).
 */
export function skySteps(v: SkyContext, s: SkyState, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }) {
  const fix = (ln: 'joseph' | 'mary') =>
    steps[ln].map((st) => (s.lineFlip && ln === 'mary' && st.id === 'mariya' ? { ...st, id: 'iosif-muzh-marii' } : st)).filter((st) => v.indexOf(st.id) !== undefined && !v.hides(st.id));
  return { joseph: fix('joseph'), mary: fix('mary') };
}

/** Номер лица в родословии, который стоит у бусины, если имени не хватило места (MAP-59): Мф у Иосифа, Лк у Марии. */
export function lineNumber(id: string, j: ReadonlyMap<string, LineStep>, m: ReadonlyMap<string, LineStep>): number | null {
  const a = j.get(id);
  const b = m.get(id);
  if (a && !b) return a.mt ?? a.lk ?? null;
  if (b && !a) return b.lk ?? null;
  return a?.mt ?? b?.lk ?? a?.lk ?? null;
}

/**
 * Номера лица у бусины (решение 39; MAP-70, UX-69): «Мф 17» — номер по Мф 1 у лица линии Иосифа, «Лк 39» — по Лк 3
 * у лица линии по Луке; у общего лица — оба, если они есть (до Авраама у Матфея номеров нет). line — чья лента: золотой
 * номер ставится над нитью, лазурный — под ней; ref — стих шага в своём родословии.
 */
export function lineCounts(id: string, j: ReadonlyMap<string, LineStep>, m: ReadonlyMap<string, LineStep>): { line: 'joseph' | 'mary'; book: 'Мф' | 'Лк'; n: number; ref: string }[] {
  const out: { line: 'joseph' | 'mary'; book: 'Мф' | 'Лк'; n: number; ref: string }[] = [];
  const a = j.get(id);
  const b = m.get(id);
  if (a?.mt) out.push({ line: 'joseph', book: 'Мф', n: a.mt, ref: refIn(a, 'Мф') });
  const lk = b?.lk ?? (a && !b ? a.lk : undefined);
  if (lk) out.push({ line: 'mary', book: 'Лк', n: lk, ref: refIn(b ?? a, 'Лк') });
  return out;
}

/** Просвет вокруг номера у бусины, px: соседние номера не читаются одной строкой. */
const NUMBER_GAP = 1.5;
/** Текст номера: «Мф 17» (неразрывный пробел). */
export const countLabel = (book: 'Мф' | 'Лк', n: number) => `${book}\u00a0${n}`;

/**
 * Лица, чьи имена в режиме «только линии» обязательны и номером не заменяются (решение 39; MAP-59, MAP-70): начало
 * родословия, Ной, Авраам, развилки и схождения лент, Иосиф, Мария и Иисус Христос.
 */
export const KEY_LINE_NAMES = ['adam', 'noy', 'avraam', 'david', 'solomon', 'nafan-syn-davida', 'iekhoniya', 'salafiil', 'zorovavel', 'iosif-muzh-marii', 'mariya', 'iisus'];

/** Номер у бусины на экране (для подсказки при наведении, sky/input.ts): место, лицо, чей счёт, номер и стих шага. */
export interface LineNumberHit extends Rect {
  id: string;
  line: 'joseph' | 'mary';
  book: 'Мф' | 'Лк';
  n: number;
  ref: string;
}
const numberHitsOf = new WeakMap<object, LineNumberHit[]>();
/** Номера у бусин последнего кадра (режим «только линии»). */
export const lineNumberHits = (v: object): LineNumberHit[] => numberHitsOf.get(v) ?? [];

/**
 * Обязательные имена режима «только линии» (решение 39): раньше выносок и подписей лент, кеглем величины, мельче
 * или с выноской; вытесняют прочие подписи. Лицо одной линии — со своей стороны ленты.
 */
export function drawKeyLineNames(v: SkyContext, p: Pass, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }) {
  if (!p.s.onlyLines || !p.s.layers.labels) return;
  const st = skySteps(v, p.s, steps);
  const j = new Set(st.joseph.map((x) => x.id));
  const m = new Set(st.mary.map((x) => x.id));
  const keys = KEY_LINE_NAMES.map((id) => (p.s.lineFlip && id === 'mariya' ? 'iosif-muzh-marii' : id));
  for (const id of new Set(keys)) {
    const i = v.indexOf(id);
    if (i === undefined || p.labeled.has(i) || !v.drawn(i)) continue;
    const sides = lineSidesOf(id, j, m);
    for (const t of [{ leader: false }, { size: T_MAP_S, leader: false }, { size: T_MAP_S, leader: true, overStars: true }] as const)
      if (putLabel(v, p, i, { sides, color: v.pal.ink, alpha: 1, sigla: false, ...t })) break;
  }
}

/** Стороны подписи лица линии: одной линии — со своей стороны ленты (сверху — Иосифа, снизу — по Луке), общего — сбоку. */
const lineSidesOf = (id: string, j: ReadonlySet<string> | ReadonlyMap<string, unknown>, m: ReadonlySet<string> | ReadonlyMap<string, unknown>): Side[] =>
  j.has(id) && m.has(id) ? ['r', 't', 'b', 'l'] : j.has(id) ? ['t', 'r', 'l'] : ['b', 'r', 'l'];

/**
 * Подписи лиц линий в режиме «только линии» (E6; UX-16; MAP-59, MAP-70; решение 39): подписаны все. Золотые (только Мф)
 * — сверху, лазурные (только Лк) — снизу, общие — сбоку или над и под косой. Порядок попыток: имя кеглем величины
 * у звезды → имя мельче (ступень T_MAP_S) → с выноской → номер у бусины «Мф 17» или «Лк 39» цветом своей ленты:
 * золотой — над нитью, лазурный — под ней, на своём погашенном фоне (без куска следа или отвода у цифр). Ставятся до
 * обычных подписей, той же проверкой наложений; обязательные имена (drawKeyLineNames) — раньше всех.
 */
export function drawLineNames(v: SkyContext, p: Pass, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }) {
  const hitsOut: LineNumberHit[] = [];
  numberHitsOf.set(v, hitsOut);
  if (!p.s.onlyLines || !p.s.layers.labels) return;
  const { ctx, cam, pal } = v;
  const st = skySteps(v, p.s, steps);
  const j = new Map(st.joseph.map((x) => [x.id, x]));
  const m = new Map(st.mary.map((x) => [x.id, x]));
  const ids = [...new Set([...j.keys(), ...m.keys()])].sort((a, b) => (byId.get(a)?.magnitude ?? 6) - (byId.get(b)?.magnitude ?? 6));
  // лицо одной линии — со своей стороны ленты, иначе сбоку, но не по другую сторону: там имя читалось бы
  // как лицо другой линии
  let rest = ids;
  const tries: { size?: number; leader: boolean }[] = [{ leader: false }, { size: T_MAP_S, leader: false }, { size: T_MAP_S, leader: true }];
  for (const t of tries) {
    const next: string[] = [];
    for (const id of rest) {
      const i = v.indexOf(id);
      if (i === undefined || p.labeled.has(i)) continue;
      const big = (byId.get(id)?.magnitude ?? 6) <= 1;
      if (!putLabel(v, p, i, { sides: lineSidesOf(id, j, m), color: pal.ink, alpha: 1, leader: t.leader || big, ...(t.size && !big ? { size: t.size } : {}) })) next.push(id);
    }
    rest = next;
  }
  // номер у бусины: «Мф 17» над золотой нитью, «Лк 39» под лазурной (решение 39)
  const font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  const size = mapSize(T_MAP_S, v.coarse);
  const world = ribbonCaches.get(v);
  // цвет своей ленты, для текста — не ниже 4,5 : 1 к небу и полосе эпохи (днём золото темнее, ТЗ § 3.8)
  const color = { joseph: textTone(pal.gold1, [pal.sky, pal.band], pal.ink), mary: textTone(pal.azure1, [pal.sky, pal.band], pal.ink) };
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const id of rest) {
    const i = v.indexOf(id);
    // обязательные имена ставятся раньше всех (drawKeyLineNames); номер у такого лица — только если имени не нашлось места;
    // номер — у нарисованной бусины (этап 11, B1)
    if (i === undefined || !p.starShown(i)) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
    const r = starRadius(byId.get(id)?.magnitude ?? 6, p.zoomScale);
    let any = false;
    for (const c of lineCounts(id, j, m)) {
      const text = countLabel(c.book, c.n);
      const w = ctx.measureText(text).width;
      // над звездой (Мф) или под ней (Лк): по середине, затем со сдвигом вдоль нити и дальше от неё — не сбоку, где
      // между звездой и числом лёг бы кусок следа («−17»)
      const up = c.line === 'joseph';
      const cands: { tx: number; ty: number }[] = [];
      // номер держится у своей бусины: сначала — прямо над или под ней, затем чуть дальше вдоль нити и от неё
      for (const d of [0, 6, 12, 18, 24, 30, 36, 44, 52])
        for (const dx of [-w / 2, 2, -w - 2, w / 2 + 2, -1.5 * w - 2]) {
          const s0 = spot(up ? 't' : 'b', x, y + (up ? -d : d), r, w, size);
          cands.push({ tx: x + dx, ty: s0.ty });
        }
      // последними — сбоку от звезды: след между звездой и числом гасится (ниже), минусом он не читается
      const sideAt = cands.length;
      for (const sd of ['r', 'l'] as const) {
        const q = spot(sd, x, y, r, w, size);
        cands.push({ tx: q.tx, ty: q.ty });
      }
      // соседние номера — с просветом: «Лк 37 Лк 34» не сливаются в строку
      const boxes = cands.map((q) => {
        const b = textBox(q.tx, q.ty, w, size);
        return { ...b, x: b.x - NUMBER_GAP, w: b.w + 2 * NUMBER_GAP };
      });
      // сначала места вне нитей: под номером там гасится фон; на нити — только ореол, лента не прорезается
      const b = claim(v, p, world ? byStrands(world, boxes) : boxes, 'mark', text.replace(/\u00a0/g, ' '), { id });
      if (!b) continue;
      const q = cands[boxes.indexOf(b)];
      // свой погашенный фон: следы и отводы под номером не читаются минусом
      if (!world || offStrands(world.strands, b, world.dx, world.dy)) v.fillGround(b.x + NUMBER_GAP, b.x + b.w - NUMBER_GAP, b.y, b.h);
      // номер сбоку: и след между звездой и числом — полосой цвета фона, если под ней нет нити
      const k = boxes.indexOf(b);
      if (k >= sideAt) {
        const yt = Math.round(y) + 0.5;
        const a = k === sideAt ? x + r + 1.5 : b.x + b.w - NUMBER_GAP;
        const e = k === sideAt ? b.x + NUMBER_GAP : x - r - 1.5;
        const gap = { x: a, y: yt - 2.5, w: e - a, h: 5 };
        if (gap.w > 0 && (!world || offStrands(world.strands, gap, world.dx, world.dy))) v.fillGround(gap.x, gap.x + gap.w, gap.y, gap.h);
      }
      ctx.strokeStyle = pal.halo;
      ctx.lineWidth = 3;
      ctx.strokeText(text, q.tx, q.ty);
      ctx.fillStyle = color[c.line];
      ctx.fillText(text, q.tx, q.ty);
      hitsOut.push({ ...b, id, line: c.line, book: c.book, n: c.n, ref: c.ref });
      any = true;
    }
    if (any) p.labeled.add(i);
  }
}

// ---------- женщины Мф 1 (решение 28; UX-46) ----------

/** Мать лица линии Иосифа, которую Мф 1 называет в стихе его рождения: сын → мать и стих. null — глава ещё грузится. */
let mt1: Map<string, { mother: string; ref: string }> | 'loading' | null = null;
let mt1Promise: Promise<void> | null = null;
/**
 * Загрузить разметку Мф 1 (src/generated/chapters.json; в индекс неба она не входит) и найти женщин Мф 1: мать шага
 * линии Иосифа, если она названа в том же стихе Мф 1, что и рождение сына (Фамарь — Мф 1:3, Раав и Руфь — Мф 1:5),
 * и сама не на линиях.
 */
export function loadMt1(): Promise<void> {
  if (!mt1Promise) {
    mt1 = 'loading';
    mt1Promise = import('../generated/chapters.json')
      .then((mod) => {
        const chapters = ((mod as { default?: unknown }).default ?? mod) as Record<string, { n: number; t: string }[]>;
        const verses = new Map((chapters['Мф 1'] ?? []).map((q) => [q.n, q.t]));
        const onLines = new Set([...lines.joseph.persons, ...lines.mary.persons].map((x) => x.id));
        const out = new Map<string, { mother: string; ref: string }>();
        for (const st of lines.joseph.persons) {
          const ref = st.refs.find((r) => /^Мф 1:\d+$/.test(r));
          const mother = ref ? byId.get(byId.get(st.id)?.mother ?? '') : undefined;
          if (!ref || !mother || onLines.has(mother.id)) continue;
          if (namedAfterOt(verses.get(Number(ref.split(':')[1])) ?? '', [mother.name, ...(mother.alt ?? [])])) out.set(st.id, { mother: mother.id, ref });
        }
        mt1 = out;
      })
      .catch(() => {
        mt1 = new Map();
      });
  }
  return mt1Promise;
}
/** Женщины Мф 1 для неба; глава ещё грузится — null, а когда загрузится, небо просит кадр (cam.onChange). */
export function mt1Mothers(v: SkyContext): Map<string, { mother: string; ref: string }> | null {
  if (mt1 === null) void loadMt1().then(() => v.cam.onChange());
  return mt1 === 'loading' || mt1 === null ? null : mt1;
}
/**
 * Стих называет мать словами «от …» (Мф 1:3 «от Фамари», 1:5 «от Рахавы», «от Руфи») одной из форм имени: основа —
 * имя без конечной гласной или «ь». «От бывшей за Уриею» (1:6) — не имя: Вирсавия и так стоит у развилки.
 */
export function namedAfterOt(verse: string, forms: readonly string[]): boolean {
  const stems = forms.filter(Boolean).map((f) => (f.length >= 4 && /[ьаяйи]$/.test(f) ? f.slice(0, -1) : f));
  if (!stems.length) return false;
  const esc = stems.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // после «от» в тексте главы — неразрывный пробел (типографика Синодального текста при сборке)
  return new RegExp(`(^|[^а-яё])от[\\s\u00a0]+(${esc.join('|')})[а-яё]*`, 'i').test(verse);
}
/** Бусины-спутницы последнего кадра (мать у развилки, женщины Мф 1): где их знак — кольцо выбора ставится там. */
const beadSpots = new WeakMap<object, Map<string, { x: number; y: number }>>();
export const beadAt = (v: object, id: string) => beadSpots.get(v)?.get(id) ?? null;

/**
 * Женщины Мф 1 в режиме «только линии» (решение 28; UX-46): малый знак матери у звезды сына, под косой (или над ней),
 * тонкая точечная выноска к сыну и подпись «Руфь — мать Овида (Мф 1:5)». Знак — ссылка на карточку матери.
 */
export function drawMt1Women(v: SkyContext, p: Pass, _steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }) {
  if (!p.s.onlyLines || !p.s.layers.labels) return;
  const women = mt1Mothers(v);
  if (!women?.size) return;
  const { ctx, cam, pal } = v;
  const hitsOut = noteHitsOf.get(v) ?? [];
  const spots = beadSpots.get(v) ?? new Map<string, { x: number; y: number }>();
  beadSpots.set(v, spots);
  const noteFont = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
  const size = mapSize(T_MAP_S, v.coarse);
  for (const [son, w] of women) {
    const i = v.indexOf(son);
    const mq = byId.get(w.mother);
    // знак матери стоит у звезды сына: сына нет в кадре (скрыт набором) — нет и знака (этап 11, B1; снимок 14: Фамарь)
    if (i === undefined || !mq || !p.starShown(i)) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    if (x < v.letterW + 20 || x > cam.w - 20 || y < v.openTop || y > cam.vp.b) continue;
    const g = gen(son);
    const text = g ? `${mq.name} — мать ${g} (${refText(w.ref)})` : `${mq.name} (${refText(w.ref)})`;
    ctx.font = noteFont;
    const tw = ctx.measureText(text).width;
    const glyph = { ...mq, magnitude: Math.max(mq.magnitude, 4) };
    const gr = starRadius(glyph.magnitude, p.zoomScale) + 2.2;
    let placed = false;
    for (const dy of [18, -18, 26, -26, 34, -34, 46, -46]) {
      const bx = x - 4;
      const by = y + dy;
      const star = { x: bx - gr - 1, y: by - gr - 1, w: 2 * gr + 2, h: 2 * gr + 2 };
      const base = by + size * 0.35;
      for (const tx of [bx + gr + 4, bx - gr - 4 - tw]) {
        const lb = textBox(tx, base, tw, size);
        if (!insideAll(v, [star, lb]) || hitsAny(p, [star, lb])) continue;
        // выноска к сыну и знак
        ctx.strokeStyle = alpha(pal.ink2, 0.9);
        ctx.lineWidth = 1;
        ctx.setLineDash([1.5, 2.5]);
        ctx.beginPath();
        ctx.moveTo(bx, by - Math.sign(dy) * gr);
        ctx.lineTo(x, y + Math.sign(dy) * (starRadius(byId.get(son)?.magnitude ?? 3, p.zoomScale) + 2));
        ctx.stroke();
        ctx.setLineDash([]);
        drawGlyph(ctx, bx, by, personGlyph(glyph, false, undefined, { scale: p.zoomScale, color: pal.ink, halo: pal.sky }));
        p.placer.add(star);
        p.placer.add(lb);
        v.ledger.add('note', text, lb, w.mother);
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.font = noteFont;
        ctx.strokeStyle = pal.halo;
        ctx.lineWidth = 3;
        ctx.strokeText(text, tx, base);
        ctx.fillStyle = pal.ink2;
        ctx.fillText(text, tx, base);
        hitsOut.push({ ...star, kind: 'person', id: w.mother }, { ...lb, kind: 'person', id: w.mother });
        spots.set(w.mother, { x: bx, y: by });
        placed = true;
        break;
      }
      if (placed) break;
    }
  }
  noteHitsOf.set(v, hitsOut);
}
/** Все прямоугольники — в открытом небе. */
const insideAll = (v: SkyContext, rs: Rect[]) => rs.every((b) => b.x > v.letterW + 2 && b.x + b.w < v.cam.w - 4 && b.y >= v.openTop && b.y + b.h <= v.cam.vp.b);
/** Хоть один прямоугольник ложится на занятое, органы неба или нити лент. */
const hitsAny = (p: Pass, rs: Rect[]) => rs.some((b) => hitsReserve(b, p.reserve) || p.placer.clash(b) || (p.offRibbon ? !p.offRibbon(b) : false));

/**
 * Выноски точек сравнения в режиме «только линии» (E6; U2, MAP-23): «Каинан — только у Луки (Лк 3:36)»,
 * «Расходятся: Соломон (Мф 1:6) и Нафан (Лк 3:31)», «Сходятся: Салафиил и Зоровавель (Мф 1:12; Лк 3:27)»…
 * Выноска — ссылка: подчёркнута, по щелчку открывает синопсис участка. У развилки, где первые лица ветвей — сыновья
 * одной матери, — её знак-спутница с подписью (Вирсавия, MAP-29). Ленты подписаны у начала ветвей: «через Соломона
 * (Мф 1)» над золотой, «через Нафана (Лк 3)» под лазурной (UX-16).
 */
export function drawLineNotes(v: SkyContext, p: Pass, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }): NoteHit[] {
  const hitsOut: NoteHit[] = [];
  noteHitsOf.set(v, hitsOut);
  beads.set(v, []);
  beadSpots.set(v, new Map());
  if (!p.s.onlyLines || !p.s.layers.labels) return hitsOut;
  const { ctx, cam, pal } = v;
  const st = skySteps(v, p.s, steps);
  const points = comparePoints(st.joseph, st.mary);
  const world = ribbonCaches.get(v) ?? { strands: [], dx: 0, dy: 0 };
  // выноска и знак матери — у нарисованной звезды (этап 11, B1)
  const at = (id: string) => {
    const i = v.indexOf(id);
    return i === undefined || !p.starShown(i) ? null : { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane), i };
  };
  const size = mapSize(T_UI_S, v.coarse);
  const font = mapFont(T_UI_S, { coarse: v.coarse });
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const inside = (q: { x: number; y: number }) => q.x > v.letterW && q.x < cam.w && q.y > v.openTop && q.y < cam.vp.b;
  const A = BRAID_PX + 4;
  /** Текст с ореолом; underline — подчёркнут как ссылка. */
  const write = (text: string, tx: number, ty: number, w: number, color: string, underline: boolean) => {
    ctx.strokeStyle = pal.halo;
    ctx.lineWidth = 3;
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = color;
    ctx.fillText(text, tx, ty);
    if (underline) {
      ctx.fillRect(tx, ty + 2, w, 1);
    }
  };
  for (const cp of points) {
    const q = at(cp.at);
    if (!q || !inside(q)) continue;
    ctx.font = font;
    const D = A * 2 + 16;
    let placed: { b: Rect; tx: number; ty: number; text: string; w: number } | null = null;
    for (const text of [cp.full, cp.short]) {
      const w = ctx.measureText(text).width;
      // сверху у расхождений и «только у», снизу у схождений — затем все остальные места
      const up = cp.kind !== 'join';
      const gaps = [0, 24, 48, 72, 96];
      const above = gaps.map((k) => -D - k);
      const below = gaps.map((k) => D + size + k);
      const dys = up ? [...above.slice(0, 2), ...below.slice(0, 2), ...above.slice(2), ...below.slice(2)] : [...below.slice(0, 2), ...above.slice(0, 2), ...below.slice(2), ...above.slice(2)];
      const cands: { tx: number; ty: number }[] = [];
      for (const dy of dys) for (const dx of [-w / 2, -w + 8, -8, -w - 28, 28]) cands.push({ tx: q.x + dx, ty: q.y + dy });
      const boxes = cands.map((c) => textBox(c.tx, c.ty, w, size));
      const b = claim(v, p, byStrands(world, boxes), 'note', text);
      if (b) {
        const c = cands[boxes.indexOf(b)];
        placed = { b, tx: c.tx, ty: c.ty, text, w };
        break;
      }
    }
    if (!placed) continue;
    // выноска: от края звезды к ближнему краю подписи
    const r = starRadius(byId.get(cp.at)?.magnitude ?? 3, p.zoomScale) + 3;
    const above = placed.b.y + placed.b.h < q.y;
    const ey = above ? placed.b.y + placed.b.h : placed.b.y;
    const ex = Math.max(placed.b.x + 4, Math.min(placed.b.x + placed.b.w - 4, q.x));
    ctx.strokeStyle = alpha(pal.ink2, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(q.x, q.y + (above ? -r : r));
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.font = font;
    write(placed.text, placed.tx, placed.ty, placed.w, pal.ink, true);
    hitsOut.push({ ...placed.b, kind: 'synopsis', id: cp.at });
    // мать первых лиц ветвей — знак-спутница у развилки
    if (cp.mother && cp.branch) {
      const a = at(cp.branch.joseph);
      const b = at(cp.branch.mary);
      if (a && b && Math.abs(a.y - b.y) > 22) {
        const bx = q.x + (Math.min(a.x, b.x) - q.x) * 0.55;
        const by = (a.y + b.y) / 2;
        const mq = byId.get(cp.mother.id);
        if (mq && bx > q.x + 8) {
          drawGlyph(ctx, bx, by, personGlyph(mq, false, undefined, { scale: p.zoomScale, color: pal.ink, halo: pal.sky }));
          const gr = starRadius(mq.magnitude, p.zoomScale) + 4;
          hitsOut.push({ x: bx - gr, y: by - gr, w: 2 * gr, h: 2 * gr, kind: 'person', id: cp.mother.id });
          // знак занимает место, как звезда: подписи на него не ложатся
          p.placer.add({ x: bx - gr + 2, y: by - gr + 2, w: 2 * gr - 4, h: 2 * gr - 4 }, true);
          // подпись знака — после имён лиц линий (drawBranchLabels)
          beads.set(v, [...(beads.get(v) ?? []), { bx, by, low: Math.max(a.y, b.y), mr: starRadius(mq.magnitude, p.zoomScale) + 5, id: cp.mother.id, text: cp.mother.text }]);
          beadSpots.get(v)?.set(cp.mother.id, { x: bx, y: by });
        }
      }
    }
  }
  ctx.lineWidth = 1;
  return hitsOut;
}

/**
 * Подписи лент у начала ветвей (UX-16, UX-45): «через Соломона (Мф 1)» над золотой нитью, «через Нафана (Лк 3)» под
 * лазурной — на любом масштабе и не только в режиме «только линии»: какая лента чья, сказано на самом небе. Приоритет —
 * выше подписей звёзд величины 2–6 (в режиме «только линии» — раньше имён лиц линий, sky.ts и marks.ts).
 */
export function drawBranchLabels(v: SkyContext, p: Pass, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }) {
  if (!p.s.layers.labels) return;
  const { ctx, cam, pal } = v;
  const world = ribbonCaches.get(v);
  if (!world) return;
  const st = skySteps(v, p.s, steps);
  const noteFont = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
  const noteSize = mapSize(T_MAP_S, v.coarse);
  const inside = (q: { x: number; y: number }) => q.x > v.letterW && q.x < cam.w && q.y > v.openTop && q.y < cam.vp.b;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  // подпись знака-спутницы у развилки: рядом со знаком, а если там тесно — ниже развилки, под лазурной нитью, с выноской
  const hitsOut = noteHitsOf.get(v) ?? [];
  for (const bd of beads.get(v) ?? []) {
    const { bx, by, low, mr } = bd;
    ctx.font = noteFont;
    const w = ctx.measureText(bd.text).width;
    const cands = [
      { tx: bx + mr, ty: by + noteSize * 0.35 },
      { tx: bx - w / 2, ty: by + mr + noteSize },
      { tx: bx - w - mr, ty: by + noteSize * 0.35 },
    ];
    for (const dy of [18, 34, 50, 66]) cands.push({ tx: bx - 8, ty: low + dy }, { tx: bx - w / 2, ty: low + dy }, { tx: bx - w + 8, ty: low + dy });
    const boxes = cands.map((c) => textBox(c.tx, c.ty, w, noteSize));
    const mb = claim(v, p, byStrands(world, boxes), 'note', bd.text, { id: bd.id });
    if (!mb) continue;
    const k = boxes.indexOf(mb);
    const c = cands[k];
    if (k >= 3) {
      ctx.strokeStyle = alpha(pal.ink2, 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by + mr - 2);
      ctx.lineTo(Math.max(mb.x + 4, Math.min(mb.x + mb.w - 4, bx)), mb.y);
      ctx.stroke();
    }
    ctx.strokeStyle = pal.halo;
    ctx.lineWidth = 3;
    ctx.strokeText(bd.text, c.tx, c.ty);
    ctx.fillStyle = pal.ink2;
    ctx.fillText(bd.text, c.tx, c.ty);
    hitsOut.push({ ...mb, kind: 'person', id: bd.id });
  }
  // ветви развилок в лицах линий: у каждой — лица между развилкой и схождением (MAP-80, IX-85, UX-72)
  const branches = branchPersons(st.joseph.map((x) => x.id), st.mary.map((x) => x.id));
  // лицо ветви на небе: не скрыто набором или свёрткой; в окне — его звезда в открытом небе
  const onSky = (id: string) => {
    const i = v.indexOf(id);
    return i !== undefined && v.drawn(i) && !v.hides(id);
  };
  const inWindow = (id: string) => {
    const i = v.indexOf(id);
    return i !== undefined && inside({ x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane) });
  };
  // набор (J4) и сжатые строки (свёртка, J5): подпись ветви — только у первого видимого лица ветви, попавшего в окно
  const strict = !!p.s.guide || p.work || v.rowsKey !== '';
  for (const cp of comparePoints(st.joseph, st.mary)) {
    if (!cp.branch) continue;
    const br = branches.get(cp.at);
    // подпись ветви — только у настоящей развилки, обе ветви которой есть на небе (UX-72)
    if (!br || !br.joseph.some(onSky) || !br.mary.some(onSky)) continue;
    for (const line of ['joseph', 'mary'] as const) {
      const lead = strict ? br[line].find(onSky) : line === 'joseph' ? cp.branch.joseph : cp.branch.mary;
      if (!lead || (strict && !inWindow(lead))) continue;
      const first = line === 'joseph' ? cp.branch.joseph : cp.branch.mary;
      const g = gen(first);
      const book = (line === 'joseph' ? cp.branch.mt : cp.branch.lk).replace(/:.*$/, '');
      if (!g) continue;
      const text = `через ${g}${book ? ` (${book})` : ''}`;
      const sd = world.strands.find((x) => x.line === line);
      if (!sd) continue;
      const k = sd.ids.indexOf(lead);
      if (k < 0) continue;
      // точки ветви у развилки — один раз на подпись (двоичный поиск по номеру лица), в px холста
      const pts: { x: number; y: number }[] = [];
      for (const f of [0.5, 0.3, 0.8, 1.2, 1.6, 2, 2.5, 3]) {
        const q = pointAt(sd.points, k + f);
        if (!q) continue;
        const pt = { x: q.x + world.dx, y: q.y + world.dy };
        if (inside(pt)) pts.push(pt);
      }
      if (!pts.length) continue;
      ctx.font = noteFont;
      const w = ctx.measureText(text).width;
      // вдоль начала ветви: над золотой нитью, под лазурной; ближе к развилке — раньше
      const cands: { tx: number; ty: number }[] = [];
      for (const lift of p.s.onlyLines ? [0, 12, 24, 36, 48] : [0, 12, 24])
        for (const pt of pts) {
          const ty = line === 'joseph' ? pt.y - 10 - lift : pt.y + noteSize + 5 + lift;
          cands.push({ tx: pt.x - w / 2, ty }, { tx: pt.x, ty }, { tx: pt.x - w, ty });
        }
      const boxes = cands.map((c) => textBox(c.tx, c.ty, w, noteSize));
      const lb = claim(v, p, boxes.filter((b) => offStrands(world.strands, b, world.dx, world.dy)), 'note', text);
      if (!lb) continue;
      const c = cands[boxes.indexOf(lb)];
      ctx.strokeStyle = pal.halo;
      ctx.lineWidth = 3;
      ctx.strokeText(text, c.tx, c.ty);
      ctx.fillStyle = pal.ink2;
      ctx.fillText(text, c.tx, c.ty);
    }
  }
  ctx.lineWidth = 1;
}

/**
 * Шаг ленты под указателем (E6; MAP-28): «Иосия → Иехония (Мф 1:11)» у указателя; стих — ссылка шага в своей
 * линии (Мф у линии Иосифа, Лк у линии по Луке).
 */
export function ribbonStepText(h: RibbonHit, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }): string {
  const st = steps[h.line].find((x) => x.id === h.to);
  const ref = refIn(st, h.line === 'joseph' ? 'Мф' : 'Лк') || (st?.refs[0] ? refText(st.refs[0]) : '');
  return `${nm(h.from)} → ${nm(h.to)}${ref ? ` (${ref})` : ''}`;
}

/** Подпись шага наведённой ленты у указателя (E6): после всех подписей, той же проверкой наложений. */
export function drawRibbonStep(v: SkyContext, p: Pass, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }) {
  const h = ribbonHover(v);
  if (!h) return;
  const { ctx, pal } = v;
  const text = ribbonStepText(h, skySteps(v, p.s, steps));
  const size = mapSize(T_UI_S, v.coarse);
  ctx.font = mapFont(T_UI_S, { coarse: v.coarse });
  const w = ctx.measureText(text).width;
  const cands = [
    { tx: h.x + 12, ty: h.y - 12 },
    { tx: h.x + 12, ty: h.y + size + 12 },
    { tx: h.x - w - 12, ty: h.y - 12 },
    { tx: h.x - w - 12, ty: h.y + size + 12 },
  ];
  const boxes = cands.map((c) => textBox(c.tx, c.ty, w, size));
  const b = claim(v, p, boxes, 'note', text, { soft: false });
  if (!b) return;
  const c = cands[boxes.indexOf(b)];
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.halo;
  ctx.lineWidth = 3;
  ctx.strokeText(text, c.tx, c.ty);
  ctx.fillStyle = pal.ink;
  ctx.fillText(text, c.tx, c.ty);
  ctx.lineWidth = 1;
}
