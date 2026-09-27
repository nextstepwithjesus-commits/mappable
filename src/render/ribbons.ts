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
import type { Strand, StrandPoint } from '../engine/ribbons.ts';
import type { Palette } from './sky.ts';
import { hexToRgb } from './color.ts';

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

/** Вид лент по палитре темы; highlight — выделен род (небо гаснет). Для неба, легенды и образца. */
export function ribbonLook(pal: Palette, highlight = false): RibbonLook {
  return {
    night: pal.glow, sky: pal.sky, halo: pal.halo, gold: [pal.gold1, pal.gold2], azure: [pal.azure1, pal.azure2],
    dim: ribbonDim(highlight, pal.glow), glow: pal.ribbonGlow, tone: pal.ribbonTone,
  };
}

type Rgb = [number, number, number];
const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: Rgb, a = 1) => (a >= 1 ? `rgb(${c.map(Math.round).join(',')})` : `rgba(${c.map(Math.round).join(',')},${a})`);

type Part = 'all' | 'solid' | 'weak';

/**
 * Путь нити от from до to (включительно) с отсечением по видимой полосе [x0, x1].
 * part: 'solid' — только сплошные отрезки, 'weak' — только отрезки звеньев по толкованию.
 * Отрезок i → i+1 считается «по толкованию», если такова его конечная точка (так их размечает геометрия).
 */
export function tracePath(ctx: CanvasRenderingContext2D, pts: StrandPoint[], from: number, to: number, part: Part, x0: number, x1: number): boolean {
  ctx.beginPath();
  let pen = false;
  let any = false;
  const end = Math.min(to, pts.length - 1);
  for (let i = Math.max(0, from); i < end; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const take = part === 'all' || (part === 'weak') === b.weak;
    if (!take || Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1) {
      pen = false;
      continue;
    }
    if (!pen) {
      ctx.moveTo(a.x, a.y);
      pen = true;
    }
    ctx.lineTo(b.x, b.y);
    any = true;
  }
  return any;
}

/**
 * Опоры цвета вдоль нити: (x, t) в точках, где начинается новое поколение (t — место лица в линии, 0…1).
 * x приводится к неубывающему, чтобы градиент был определён.
 */
export function colorKnots(pts: StrandPoint[]): { x: number; t: number }[] {
  const out: { x: number; t: number }[] = [];
  let maxX = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && i < pts.length - 1 && pts[i].t === pts[i - 1].t) continue;
    maxX = Math.max(maxX, pts[i].x);
    out.push({ x: maxX, t: pts[i].t });
  }
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
export function drawStrands(ctx: CanvasRenderingContext2D, strands: Strand[], core: number, look: RibbonLook, width: number, flow: number | null = null) {
  const x0 = -24;
  const x1 = width + 24;
  const sky = hexToRgb(look.sky);
  const ends = (line: Strand['line']): [Rgb, Rgb] => {
    const [a, b] = line === 'joseph' ? look.gold : look.azure;
    return [hexToRgb(a), hexToRgb(b)];
  };
  const coreW = look.night ? core : core + DAY_CORE_PLUS;
  const gapW = look.night ? core + 2.2 : Math.max(DAY_HALO_MIN, core + 3.4);
  const toneW = gapW + 1;

  const prepared = strands.map((st) => {
    const [c1, c2] = ends(st.line);
    const knots = colorKnots(st.points);
    const at = (t: number) => lerp3(c1, c2, t);
    const paint = (a: number) => strandGradient(ctx, knots, x0, x1, (t) => css(at(t), a));
    return {
      st,
      paint,
      /** непрозрачный цвет нити, смешанный с небом при гашении */
      solid: strandGradient(ctx, knots, x0, x1, (t) => css(lerp3(sky, at(t), look.dim))),
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

  const layer = (p: (typeof prepared)[number], from: number, to: number) => {
    const pts = p.st.points;
    // подложка: зазор в плетении ночью, светлый ореол днём
    ctx.lineCap = 'round';
    if (tracePath(ctx, pts, from, to, 'all', x0, x1)) {
      ctx.strokeStyle = look.night ? look.sky : look.halo;
      ctx.lineWidth = gapW;
      ctx.stroke();
    }
    // тон своего цвета под дневной нитью
    if (p.tone && tracePath(ctx, pts, from, to, 'solid', x0, x1)) {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = p.tone;
      ctx.lineWidth = toneW;
      ctx.stroke();
    }
    // нить
    ctx.lineCap = 'round';
    const solid = p.solid;
    if (tracePath(ctx, pts, from, to, 'solid', x0, x1)) {
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
  };

  // основные нити: сначала Мария, потом Иосиф
  for (const p of prepared) layer(p, 0, p.st.points.length);
  // плетение: там, где Иосиф «под» Марией, Мария рисуется поверх ещё раз
  const mary = prepared.find((p) => p.st.line === 'mary');
  if (mary) for (const [a, b] of mary.st.over) layer(mary, a, b);

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
