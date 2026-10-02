/**
 * Отрисовка врезки «Семья созвездием» (этап 16, решение 186) — Canvas 2D, тот же язык знаков, что у неба:
 * диск, кольцо жены, скопление народа, черта царя, † младенца (src/render/glyphs.ts), ромб союза из двух половин
 * (решение 87; UNION_COLORS), начертание черты брака по виду союза (решение 174), ленты Мессии золотом и лазурью,
 * родство словами Писания — золотистым (решение 89).
 *
 * Огонёк: ночью у звезды ореол цвета её ветви (решение 69), сила — по величине (решение 186: «сила огонька —
 * величина»); днём ореола нет — величину несёт диск. Ореол — данные, а не украшение (ТЗ § 5.6).
 *
 * Модуль чистый: раскладку даёт src/engine/famplot.ts, цвета темы и ветвей — вызывающий (InsetLook).
 */
import type { FontKey, Ink, Plot, Prim } from '../engine/famplot.ts';
import { fontPx } from '../engine/famplot.ts';
import { alpha } from './color.ts';
import { FONT_SANS, FONT_SERIF, mapSize } from './type.ts';

export interface InsetLook {
  night: boolean;
  sky: string;
  /** фон врезки и карточки источника (токен «Глубина») */
  deep: string;
  ink: string;
  ink2: string;
  ink3: string;
  kin: string;
  mt: [string, string];
  lk: [string, string];
  husband: string;
  wife: string;
  /** цвет ветви i выбранного лица (решения 69, 183: цвет ветви опорного лица) */
  branch: (i: number) => string;
  coarse: boolean;
}

const WEIGHT: Record<FontKey, string> = { name: '520', kid: '420', kidStrong: '600', focal: '620', word: 'italic 400', small: '400', sib: '420', note: '400' };
/** Строка ctx.font для ключа шрифта врезки (кегль — шкала холста с масштабом текста браузера, решение 57). */
export function insetFont(f: FontKey, coarse: boolean): string {
  return `${WEIGHT[f]} ${mapSize(fontPx(f), coarse)}px ${f === 'small' ? FONT_SANS : FONT_SERIF}`;
}

/** Ширина строки шрифта f — мерило для раскладки (src/engine/famplot.ts, Geom.measure). */
export function insetMeasure(ctx: CanvasRenderingContext2D, coarse: boolean): (s: string, f: FontKey) => number {
  const memo = new Map<string, number>();
  return (s, f) => {
    const key = `${f}|${s}`;
    let w = memo.get(key);
    if (w === undefined) {
      ctx.font = insetFont(f, coarse);
      w = ctx.measureText(s).width;
      memo.set(key, w);
    }
    return w;
  };
}

function inkColor(L: InsetLook, ink: Ink): string {
  switch (ink) {
    case 'ink':
      return L.ink;
    case 'ink2':
      return L.ink2;
    case 'ink3':
      return L.ink3;
    case 'kin':
      return L.kin;
    default:
      return L.branch(Number(ink.slice(1)));
  }
}

/** Смешение двух цветов #rrggbb. */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return a;
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export interface FrameOpts {
  /** прямоугольник неба, который гаснет (видимая часть холста) */
  sky: { x: number; y: number; w: number; h: number };
  /** область семьи на небе — «окно» в погашенном небе, пунктирная рамка и выноски */
  region: { x: number; y: number; w: number; h: number } | null;
  /** прямоугольник врезки */
  inset: { x: number; y: number; w: number; h: number };
  /** доля перехода 0…1: небо гаснет постепенно */
  t: number;
  /** телефон: врезка во всё небо, без рамки области */
  sheet: boolean;
}

/** Погашенное небо, рамка области с выносками, фон и двойная рамка врезки (условность врезок звёздных атласов). */
export function drawInsetFrame(ctx: CanvasRenderingContext2D, L: InsetLook, o: FrameOpts) {
  const { sky, region, inset: R } = o;
  ctx.save();
  // небо гаснет до ~45 % (ТЗ § 3.1: остальное небо гаснет); область семьи остаётся видна
  ctx.fillStyle = alpha(L.sky, (L.night ? 0.55 : 0.6) * o.t);
  ctx.beginPath();
  ctx.rect(sky.x, sky.y, sky.w, sky.h);
  if (region && !o.sheet) ctx.rect(region.x + region.w, region.y, -region.w, region.h);
  ctx.fill('evenodd');
  if (region && !o.sheet && o.t >= 1) {
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = alpha(L.ink, 0.9);
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(region.x) + 0.5, Math.round(region.y) + 0.5, Math.round(region.w), Math.round(region.h));
    ctx.strokeStyle = alpha(L.ink3, 0.7);
    ctx.lineWidth = 0.8;
    const right = region.x + region.w < R.x;
    const ex = right ? region.x + region.w : region.x;
    const ix = right ? R.x : R.x + R.w;
    ctx.beginPath();
    ctx.moveTo(ex, region.y);
    ctx.lineTo(ix, R.y);
    ctx.moveTo(ex, region.y + region.h);
    ctx.lineTo(ix, R.y + R.h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** Фон и рамка врезки в прямоугольнике R (после перехода — на своём месте; во время — в промежуточном). */
export function drawInsetBack(ctx: CanvasRenderingContext2D, L: InsetLook, R: { x: number; y: number; w: number; h: number }, sheet: boolean) {
  ctx.save();
  ctx.fillStyle = alpha(L.sky, sheet ? 1 : 0.96);
  ctx.fillRect(R.x, R.y, R.w, R.h);
  if (!sheet) {
    ctx.strokeStyle = alpha(L.ink3, 0.75);
    ctx.lineWidth = 1;
    ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    ctx.strokeStyle = alpha(L.ink3, 0.35);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(R.x + 3.5, R.y + 3.5, R.w - 7, R.h - 7);
  }
  ctx.restore();
}

/** Звёзды, черты, ромбы, пыль внуков и подписи раскладки. focus — лицо с кольцом фокуса клавиатуры. */
export function drawPlot(ctx: CanvasRenderingContext2D, plot: Plot, L: InsetLook, focus: string | null = null, hover: string | null = null) {
  for (const p of plot.prims) drawPrim(ctx, p, L);
  const ring = (id: string | null, solid: boolean) => {
    const q = id ? plot.at.get(id) : null;
    if (!q) return;
    ctx.save();
    ctx.strokeStyle = L.ink;
    ctx.lineWidth = solid ? 2 : 1;
    if (!solid) ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.r + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
  if (hover && hover !== focus) ring(hover, false);
  ring(focus, true);
}

function path(ctx: CanvasRenderingContext2D, p: Extract<Prim, { t: 'line' }>, off: number) {
  const L = Math.hypot(p.x1 - p.x0, p.y1 - p.y0) || 1;
  const nx = (-(p.y1 - p.y0) / L) * off;
  const ny = ((p.x1 - p.x0) / L) * off;
  ctx.beginPath();
  ctx.moveTo(p.x0 + nx, p.y0 + ny);
  if (p.c1 && p.c2) ctx.bezierCurveTo(p.c1[0] + nx, p.c1[1] + ny, p.c2[0] + nx, p.c2[1] + ny, p.x1 + nx, p.y1 + ny);
  else if (p.c1) ctx.quadraticCurveTo(p.c1[0] + nx, p.c1[1] + ny, p.x1 + nx, p.y1 + ny);
  else ctx.lineTo(p.x1 + nx, p.y1 + ny);
}

function drawPrim(ctx: CanvasRenderingContext2D, p: Prim, L: InsetLook) {
  ctx.save();
  ctx.globalAlpha = p.a;
  if (p.t === 'line') {
    const st = p.style;
    const w = p.w;
    const color = st === 'mt' ? L.mt[0] : st === 'lk' ? L.lk[0] : inkColor(L, p.ink);
    ctx.lineCap = 'round';
    // свечение лучей ветвей и лент — ночью, вдвое слабее лент (решение 170)
    if (p.glow && L.night && (st === 'ray' || st === 'mt' || st === 'lk')) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = p.a * (st === 'ray' ? 0.09 : 0.22);
      ctx.strokeStyle = color;
      ctx.lineWidth = st === 'ray' ? 4.5 : 6;
      path(ctx, p, p.off ?? 0);
      ctx.stroke();
      ctx.restore();
    }
    if (st === 'mt' || st === 'lk') {
      const cs = st === 'mt' ? L.mt : L.lk;
      const g = ctx.createLinearGradient(p.x0, p.y0, p.x1, p.y1);
      g.addColorStop(0, cs[0]);
      g.addColorStop(1, cs[1]);
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      path(ctx, p, p.off ?? 0);
      ctx.stroke();
    } else {
      ctx.strokeStyle = color;
      if (st === 'double' || st === 'dashdouble') {
        if (st === 'dashdouble') ctx.setLineDash([5, 3.5]);
        ctx.lineWidth = w * 0.9;
        path(ctx, p, -1.8);
        ctx.stroke();
        path(ctx, p, 1.8);
        ctx.stroke();
      } else if (st === 'single' || st === 'ray') {
        ctx.lineWidth = w;
        path(ctx, p, 0);
        ctx.stroke();
      } else if (st === 'thin') {
        ctx.lineWidth = 0.7;
        ctx.globalAlpha = p.a * 0.85;
        path(ctx, p, 0);
        ctx.stroke();
      } else if (st === 'kin' || st === 'dotted') {
        ctx.setLineDash([1.4, 3.2]);
        ctx.lineWidth = 1.3;
        path(ctx, p, 0);
        ctx.stroke();
      }
    }
  } else if (p.t === 'star') {
    const r = p.r;
    const hue = p.ink ? inkColor(L, p.ink) : null;
    if (L.night) {
      // огонёк: ореол цвета ветви (или белый у предков и братьев), сила — величина звезды
      const R = r * (2.6 + 3.2 * p.glow);
      const c = hue ?? '#ffffff';
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
      g.addColorStop(0, alpha(c, 0.55 * p.glow));
      g.addColorStop(0.25, alpha(c, 0.22 * p.glow));
      g.addColorStop(1, alpha(c, 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const core = hue ? (L.night ? mix(hue, '#ffffff', 0.45) : hue) : L.ink;
    // подложка цвета неба — звезда отделяется от линий
    ctx.fillStyle = L.sky;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + (p.sex === 'f' ? 3.6 : 1.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = core;
    ctx.strokeStyle = core;
    if (p.people) {
      for (let q = 0; q < 5; q++) {
        const a = -Math.PI / 2 + (2 * Math.PI * q) / 5;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sex === 'f' ? r * 0.82 : r, 0, Math.PI * 2);
      ctx.fill();
      if (p.sex === 'f') {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.82 + 2.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (p.king) {
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const yy = p.y - r - (p.sel ? 10 : 4.5);
      ctx.moveTo(p.x - r - 1.5, yy);
      ctx.lineTo(p.x + r + 1.5, yy);
      ctx.stroke();
    }
    if (p.infant) {
      ctx.font = `400 12px ${FONT_SERIF}`;
      ctx.textAlign = 'right';
      ctx.fillText('†', p.x - r - 4, p.y + 4);
    }
    if (p.sel) {
      ctx.strokeStyle = L.ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (p.t === 'diamond') {
    const s = p.s;
    ctx.fillStyle = L.sky;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s - 2);
    ctx.lineTo(p.x + s + 2, p.y);
    ctx.lineTo(p.x, p.y + s + 2);
    ctx.lineTo(p.x - s - 2, p.y);
    ctx.closePath();
    ctx.fill();
    const half = (side: number, col: string, hollow: boolean) => {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x + side * s, p.y);
      ctx.lineTo(p.x, p.y + s);
      ctx.closePath();
      if (hollow) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = col;
        ctx.fill();
      }
    };
    half(-1, L.husband, p.hollowAll);
    half(1, L.wife, p.hollowAll || p.hollowWife);
    if (p.ring) {
      ctx.strokeStyle = L.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (p.t === 'dot') {
    ctx.fillStyle = inkColor(L, p.ink);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.t === 'label') {
    const line = (runs: typeof p.runs, y: number) => {
      let w = 0;
      for (const r of runs) {
        ctx.font = insetFont(r.font, L.coarse);
        w += ctx.measureText(r.s).width;
      }
      let x = p.align === 'right' ? p.x - w : p.align === 'center' ? p.x - w / 2 : p.x;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      for (const r of runs) {
        ctx.font = insetFont(r.font, L.coarse);
        ctx.fillStyle = inkColor(L, r.ink);
        ctx.fillText(r.s, x, y);
        x += ctx.measureText(r.s).width;
      }
    };
    line(p.runs, p.y);
    if (p.sub) line(p.sub, p.y + 15);
  }
  ctx.restore();
}
