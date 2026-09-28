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
import { BRAID_PX, buildRibbons, runSpans, type Strand, type StrandPoint } from '../engine/ribbons.ts';
import type { LineStep } from '../engine/layout.ts';
import { refText } from '../engine/kinship.ts';
import { byId, lines } from '../data/atlas.ts';
import { nameCase } from '../ui/text/ru.ts';
import type { Palette, Pass, SkyContext, SkyState } from './sky.ts';
import { alpha, hexToRgb } from './color.ts';
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

type Part = 'all' | 'solid' | 'weak';

/**
 * Путь нити от from до to (включительно) с отсечением по видимой полосе [x0, x1].
 * part: 'solid' — только сплошные отрезки, 'weak' — только отрезки звеньев по толкованию.
 * Отрезок i → i+1 считается «по толкованию», если такова его конечная точка (так их размечает геометрия).
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
  for (let i = start; i < end; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const take = part === 'all' || (part === 'weak') === b.weak;
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
  };

  // основные нити: сначала Мария, потом Иосиф
  for (const p of prepared) layer(p, 0, p.st.points.length);
  // плетение: там, где Иосиф «под» Марией, Мария рисуется поверх ещё раз. Тугая коса (braid ≤ BRAID_PX, MAP-60) —
  // без плетения: нити перекрываются почти везде, и конец участка «поверх» читался бы ступенькой на нити (MAP-57)
  const mary = prepared.find((p) => p.st.line === 'mary');
  const weave = !(o.braid !== undefined && o.braid <= BRAID_PX);
  if (mary && weave) for (const [a, b] of mary.st.over) layer(mary, a, b, true);

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
  x0: number;
  laneTop: number;
  strands: Strand[];
  grads: Map<string, CanvasGradient>;
  /** сдвиг последнего кадра: экранная точка = точка нити + (dx, dy) */
  dx: number;
  dy: number;
}
const ribbonCaches = new WeakMap<object, RibbonCache>();
/** Запас построения за краем холста, px: пока сдвиг меньше, нити не перестраиваются. */
const RIBBON_MARGIN = 240;
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
export function drawSkyRibbons(v: SkyContext, s: SkyState, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }): Strand[] {
  const { ctx, cam, pal } = v;
  const project = (id: string) => {
    const i = v.indexOf(id);
    if (i === undefined) return null;
    return { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane) };
  };
  // ориентир режима «набор» (J4; MAP-64): нить идёт только через лица линий, которые видны; звено, за которым скрыты
  // лица, — разреженной нитью, как звено по толкованию (скрытые лица сжатием строк стянуты в одну строку — через них
  // нить делала бы петлю)
  const weakOf = (ln: 'joseph' | 'mary') => {
    const out: { id: string; weak: boolean }[] = [];
    let skipped = false;
    for (const raw of steps[ln]) {
      const st = s.lineFlip && ln === 'mary' && raw.id === 'mariya' ? { ...raw, id: 'iosif-muzh-marii' } : raw;
      if (v.indexOf(st.id) === undefined) continue;
      if (s.guide && v.hides(st.id)) {
        skipped = out.length > 0;
        continue;
      }
      out.push({ id: st.id, weak: skipped || st.flag === 'interpretation' || st.flag === 'luke-only' || (ln === 'mary' && st.id === 'salafiil') });
      skipped = false;
    }
    return out;
  };
  const ky = cam.ky;
  const boost = s.onlyLines ? 1.35 : 1;
  // коса — тугая, амплитуда в px постоянна (MAP-60, MAP-62)
  const A = BRAID_PX;
  // нити строятся заново только при смене масштаба, модели, режима или размера холста и при сдвиге дальше запаса;
  // при протяжке неба они рисуются со сдвигом (NFR-1: 60 кадров/с)
  // и при смене сжатия полос (J4, J5; src/render/rows.ts): нити идут через строки, а не через полосы
  const key = `${v.model.id}|${v.lambda}|${cam.kx}|${ky}|${s.lineFlip}|${s.onlyLines}|${cam.w}|${cam.h}|${v.rowsKey}|${!!s.guide}`;
  let c = ribbonCaches.get(v);
  if (!c || c.key !== key || Math.abs((c.x0 - cam.x0) * cam.kx) > RIBBON_MARGIN - 40) {
    const strands = buildRibbons({ joseph: weakOf('joseph'), mary: weakOf('mary'), project, amplitude: A, meander: A * 0.5, clip: [-RIBBON_MARGIN, cam.w + RIBBON_MARGIN] });
    c = { key, x0: cam.x0, laneTop: cam.laneTop, strands, grads: new Map(), dx: 0, dy: 0 };
    ribbonCaches.set(v, c);
  }
  c.dx = (c.x0 - cam.x0) * cam.kx;
  c.dy = (cam.laneTop - c.laneTop) * ky;
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
  drawStrands(ctx, strands, core, ribbonLook(pal, !!hl || !!s.guide), cam.w, hover ? null : flow, { clip, grads: c.grads, braid: A });
  // участки группы панели и пути родства — в полную силу поверх погашенных лент
  if (hl) {
    const lit = (id: string) => {
      const k = hl.get(id);
      return k === 'group' || k === 'path' || k === 'self';
    };
    const parts = strands.flatMap((st) => litRanges(st, lit).map(([a, b]) => sliceStrand(st, a, b)));
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

/** Шаги линий на небе: Лк 3 как второе родословие Иосифа меняет Марию на Иосифа; лица, которых нет на небе, пропускаются. */
export function skySteps(v: SkyContext, s: SkyState, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }) {
  const fix = (ln: 'joseph' | 'mary') =>
    steps[ln].map((st) => (s.lineFlip && ln === 'mary' && st.id === 'mariya' ? { ...st, id: 'iosif-muzh-marii' } : st)).filter((st) => v.indexOf(st.id) !== undefined);
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
 * Подписи лиц линий в режиме «только линии» (E6; UX-16; MAP-59): подписаны все. Золотые (только Мф) — сверху, лазурные
 * (только Лк) — снизу, общие — сбоку или над и под косой. Порядок попыток: имя кеглем величины у звезды → имя мельче
 * (ступень T_MAP_S) → с выноской → номер у бусины по Мф 1 или Лк 3 (имя — в подсказке при наведении). Ставятся до
 * обычных подписей, той же проверкой наложений.
 */
export function drawLineNames(v: SkyContext, p: Pass, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }) {
  if (!p.s.onlyLines || !p.s.layers.labels) return;
  const { ctx, cam, pal } = v;
  const st = skySteps(v, p.s, steps);
  const j = new Map(st.joseph.map((x) => [x.id, x]));
  const m = new Map(st.mary.map((x) => [x.id, x]));
  const ids = [...new Set([...j.keys(), ...m.keys()])].sort((a, b) => (byId.get(a)?.magnitude ?? 6) - (byId.get(b)?.magnitude ?? 6));
  // лицо одной линии — со своей стороны ленты, иначе сбоку, но не по другую сторону: там имя читалось бы
  // как лицо другой линии
  const sidesOf = (id: string): Side[] => (j.has(id) && m.has(id) ? ['r', 't', 'b', 'l'] : j.has(id) ? ['t', 'r', 'l'] : ['b', 'r', 'l']);
  let rest = ids;
  const tries: { size?: number; leader: boolean }[] = [{ leader: false }, { size: T_MAP_S, leader: false }, { size: T_MAP_S, leader: true }];
  for (const t of tries) {
    const next: string[] = [];
    for (const id of rest) {
      const i = v.indexOf(id);
      if (i === undefined || p.labeled.has(i)) continue;
      const big = (byId.get(id)?.magnitude ?? 6) <= 1;
      if (!putLabel(v, p, i, { sides: sidesOf(id), color: pal.ink, alpha: 1, leader: t.leader || big, ...(t.size && !big ? { size: t.size } : {}) })) next.push(id);
    }
    rest = next;
  }
  // номер у бусины
  const font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: v.coarse });
  const size = mapSize(T_MAP_S, v.coarse);
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const id of rest) {
    const i = v.indexOf(id);
    const n = lineNumber(id, j, m);
    if (i === undefined || n === null) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
    const text = String(n);
    const w = ctx.measureText(text).width;
    const r = starRadius(byId.get(id)?.magnitude ?? 6, p.zoomScale);
    // у бусины: со своей стороны ленты, затем чуть дальше от неё
    const own = j.has(id) && m.has(id) ? 0 : j.has(id) ? -1 : 1;
    const spots = sidesOf(id).map((sd) => spot(sd, x, y, r, w, size));
    if (own) for (const d of [8, 16]) spots.push({ ...spot(own < 0 ? 't' : 'b', x, y + own * d, r, w, size) });
    // номер не спутать с лицом другой линии (у Мф и Лк свои номера), поэтому последним — и по другую сторону
    if (own) spots.push(spot(own < 0 ? 'b' : 't', x, y, r, w, size));
    const b = claim(v, p, spots.map((q) => q.box), 'mark', text, { id });
    if (!b) continue;
    const c = spots.find((q) => q.box === b)!;
    ctx.strokeStyle = pal.halo;
    ctx.lineWidth = 3;
    ctx.strokeText(text, c.tx, c.ty);
    ctx.fillStyle = pal.ink2;
    ctx.fillText(text, c.tx, c.ty);
    p.labeled.add(i);
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
    if (i === undefined || !mq) continue;
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
  const at = (id: string) => {
    const i = v.indexOf(id);
    return i === undefined ? null : { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane), i };
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
  for (const cp of comparePoints(st.joseph, st.mary)) {
    if (!cp.branch) continue;
    for (const line of ['joseph', 'mary'] as const) {
      const first = line === 'joseph' ? cp.branch.joseph : cp.branch.mary;
      const g = gen(first);
      const book = (line === 'joseph' ? cp.branch.mt : cp.branch.lk).replace(/:.*$/, '');
      if (!g) continue;
      const text = `через ${g}${book ? ` (${book})` : ''}`;
      const sd = world.strands.find((x) => x.line === line);
      if (!sd) continue;
      const k = sd.ids.indexOf(first);
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
