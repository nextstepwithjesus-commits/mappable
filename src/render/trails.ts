/**
 * Следы жизни и родство на небе (ТЗ § 3.1, «след жизни» и «связи»; A14, E4).
 *
 * След жизни честно показывает меру уверенности (A14; MAP-12, 13, 14):
 *  — смерть известна — сплошной след до неё; у оценочной даты конец тает к краю интервала смерти;
 *  — известно только последнее упоминание — сплошной след до него и тающий хвост 10 px;
 *  — не известно ничего — только тающий хвост 10 px от звезды: условной длительности жизни на небе нет;
 *  — оценочное рождение — начало следа проявляется от звезды до конца интервала рождения (bHi);
 *  — неуверенность — растушёвкой, а не точками (этап 12, решение 90): точки на небе значат только толкование
 *    и «время не установлено» (Г10);
 *  — умерший младенцем, народ или род из таблицы народов, лицо скопления-списка — без следа (знаки — glyphs.ts).
 *
 * «Отчий дом» (этап 15, решения 173, 178, 179; договор 1 — src/engine/stays.ts): след идёт по пребываниям лица. Звезда —
 * в полосе рождения (отчий дом, у матери), между пребываниями — переход: S-кривая (smoothstep по годам) тем же тоном и
 * толщиной, что след; переход — часть следа, а не связь. Выборка перехода одна на всех (bendsOf): рисунок, попадание
 * (sky.ts, hitTrail, trailDist), препятствия подписей (sky.ts, lineObstacles) и пути связей (links.ts, LinkStar.path).
 * На небе (меньше 7 px на год) переходы бледнее (bendAlpha); разрывы под связями — и на переходах (просветы вокруг точки
 * пересечения), а чужой след под переходом прерывается (sky.ts, glideCuts). Жена, живущая в доме мужа с рождения, —
 * бледная доля следа до года прихода в дом (LifeTrail.liveFrom). Знаки легенды «Семья на небе» (решение 180) —
 * drawFamilySample теми же рисовальщиками.
 *
 * Семьи (E4; MAP-15, 16, 20, 22, 73, 74, 76, 80; UX-34):
 *  — дети одной матери, рождённые рядом, — на своей короткой гребёнке: тонкий сплошной ствол от следа отца и зубцы
 *    к звёздам детей; гребёнки разных матерей одного отца сдвинуты на 3 px, у корня гребёнки (у ребёнка, ближайшего
 *    к следу отца) — помета матери «от Лии». Начертанием матери не различаются: штрих на небе значит «потомок
 *    выбранного» и «по толкованию» (MAP-74);
 *  — «годы — по порядку …, выв.»: помета у детей, чей год оценён по порядку перечисления, — только у семьи
 *    выбранного лица и при наведении на гребёнку; ссылка — место, где Писание называет этих детей по порядку
 *    (у сыновей Иакова — рассказ о рождениях Быт 29:32–30:24; 35:16–18; решение 41, MAP-73);
 *  — при выделении рода: предки — сплошной линией 1,5 px, потомки — штрихом, братья и сёстры — своей степенью;
 *    потомки выбранного — ещё и цветом своей ветви со свечением, бледнее с каждым поколением, предки — с мягким
 *    свечением, у первого ребёнка каждой ветви — цветная черта под подписью (решение 69; branches.ts);
 *  — брак — короткий знак «‖» от следа мужа к жене в год первого ребёнка; к дальней жене — знак и тонкая выноска.
 *    Знак занимает место в общей проверке наложений, как подпись, и при столкновении сдвигается (MAP-76);
 *  — призрак жены в её роду — пунктирный отвод и подпись «Рахиль, жена Иакова»;
 *  — в небе «набор» у детей союза, чья точка на небе, отводов и гребёнок нет, у пары с точкой — знака брака: их связь
 *    рисует точка союза (решение 76; plates.ts, Pass.unionKids и unionPairs).
 *
 * drawLifeTrail, drawDescent, drawBracket и drawMarriage рисуют одиночный знак на любом холсте без неба: ими
 * пользуются небо, образец #/specimen и «Как читать карту», чтобы знак в легенде был тем же, что на небе.
 */
import { alpha } from './color.ts';
import { byId, graph, models, type ModelData } from '../data/atlas.ts';
import type { DateClass } from '../engine/chronology.ts';
import { primaryChildren } from '../engine/graph.ts';
import { BOOK_INDEX } from '../engine/books.ts';
import { nameCase } from '../ui/text/ru.ts';
import { refText } from '../engine/kinship.ts';
import { drawGlyph, starRadius, type GlyphOpts } from './glyphs.ts';
import { mapFont, mapSize, nameSize, T_MAP_S } from './type.ts';
import { claim, FAMILY_KY, textBox, type LabelCache } from './labels.ts';
import { branchTickAt, GlowBatch, glowLayers, glows, LINEAGE_GLOW, LINEAGE_WARM } from './branches.ts';
import { branchOrTribeColor } from './light.ts';
import { branchFrame, clipHoles, FAR, ringHoles, selectedRoutes, type BranchPaint } from './marks.ts';
import type { Rect } from './rect.ts';
import type { Emphasis, Palette, Pass, SkyContext } from './sky.ts';
import type { LinkFrame, LinkNode, LinkPath, PathStyle, StubMark } from './links.ts';
import type { LinkKey } from '../engine/linkkey.ts';
import { unions as ALL_UNIONS } from '../ui/reveal.ts';
import { unionName } from '../ui/linkwords.ts';
import { glidesOf, laneAt, marriageKind, smooth, starLaneOf, type MarriageKind, type StayNode } from '../engine/stays.ts';
import { NODE_R_FAMILY, TRAIL_CUT, type NodeLook } from './links.ts';
import { paintJoin, paintUnion } from './plates.ts';
import { drawTentPointer } from './frame.ts';
import { drawStrands, ribbonLook } from './ribbons.ts';
import { buildRibbons } from '../engine/ribbons.ts';
import type { MapTheme } from './branches.ts';

/**
 * Растушёвка неуверенного начала и конца следа (этап 12, решение 90): тот же след, плавно тающий к краю, — вместо
 * пунктира (точки на небе значат только толкование и «время не установлено», Г10). start — доля яркости у звезды
 * при оценочном рождении (след проявляется к концу интервала рождения), end — у конца интервала смерти и у конца
 * короткого хвоста после последнего упоминания.
 */
export const TRAIL_FADE = { start: 0.22, end: 0 };
/** Часть следа за разрывом «//» (MAP-51) — бледнее: доля яркости сплошного следа. */
export const TRAIL_PALE = 0.45;
/**
 * Уровень подробности семьи на небе (этап 15, решение 178; уточняет 135): 0 — небо, 1 — обзор семьи, 2 — семья. Кадр
 * несёт его в Pass.tier (sky.ts), связи — в LinkInput.tier (links.ts).
 */
export type FamilyTier = 0 | 1 | 2;
/** Пороги уровней 178, px на год у середины окна: небо — меньше sky, обзор семьи — до family, семья — от family. */
export const FAMILY_TIER = { sky: 7, family: 24 } as const;
/** Уровень по местному масштабу времени (px на год). */
export const familyTier = (pxYear: number): FamilyTier => (pxYear < FAMILY_TIER.sky ? 0 : pxYear < FAMILY_TIER.family ? 1 : 2);
/**
 * Доля проявления того, что приходит с порогом at (px на год): 0 ниже at / √1,5, 1 выше at · √1,5, между — плавно
 * (ТЗ § 3.1: «переходы плавные, в полосе ×1,5 масштаба»; без мигания и без памяти кадров).
 */
export function tierAlpha(pxYear: number, at: number): number {
  const u = Math.log(pxYear / at) / Math.log(1.5) + 0.5;
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

/** Растушёванный хвост после последнего упоминания, px (MAP-13; ТЗ § 3.1, «коротким пунктиром» — теперь растушёвкой). */
export const TAIL_PX = 10;

/** Разобранные цвета следов: строк цвета на кадр — десятки, следов — тысячи. */
const rgbaMemo = new Map<string, { rgb: string; a: number } | null>();
/** Цвет следа как «r, g, b» и непрозрачность — для растушёвки; null — цвет не разобран (растушёвки нет, линия ровная). */
function rgbaOf(c: string): { rgb: string; a: number } | null {
  let out = rgbaMemo.get(c);
  if (out === undefined) {
    out = parseRgba(c);
    if (rgbaMemo.size > 512) rgbaMemo.clear();
    rgbaMemo.set(c, out);
  }
  return out;
}
function parseRgba(c: string): { rgb: string; a: number } | null {
  const s = c.trim();
  if (s.startsWith('#') && (s.length === 7 || s.length === 4)) {
    const h = s.length === 4 ? s.replace(/[0-9a-f]/gi, (d) => d + d) : s;
    return { rgb: `${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)}`, a: 1 };
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  return m ? { rgb: `${m[1]},${m[2]},${m[3]}`, a: m[4] === undefined ? 1 : Number(m[4]) } : null;
}

/**
 * Растушёванный участок следа [a, b] на высоте y (решение 90): яркость линейно от k0 у a до k1 у b (доли яркости цвета
 * color), с просветами cuts. Одна линия с градиентом вдоль неё — без точек и штриха.
 */
export function fadeLine(ctx: CanvasRenderingContext2D, a: number, b: number, y: number, color: string, k0: number, k1: number, cuts?: readonly number[]) {
  fadeSpan(ctx, { y }, a, b, color, k0, k1, cuts);
}

/** Растушёванный участок [a, b] следа t — по его переходам (решение 173): яркость вдоль x, как у fadeLine. */
function fadeSpan(ctx: CanvasRenderingContext2D, t: Pick<LifeTrail, 'y' | 'bends'>, a: number, b: number, color: string, k0: number, k1: number, cuts?: readonly number[], which = 3) {
  if (!(b > a + 0.5)) return;
  const c = rgbaOf(color);
  if (c) {
    const g = ctx.createLinearGradient(a, 0, b, 0);
    g.addColorStop(0, `rgba(${c.rgb},${+(c.a * k0).toFixed(3)})`);
    g.addColorStop(1, `rgba(${c.rgb},${+(c.a * k1).toFixed(3)})`);
    ctx.strokeStyle = g;
  } else ctx.strokeStyle = color;
  ctx.beginPath();
  trailPath(ctx, t, a, b, cuts, which);
  ctx.stroke();
  ctx.strokeStyle = color;
}

/** Одиночный след жизни в px холста. */
export interface LifeTrail {
  /** звезда: рождение (точечная оценка) */
  x0: number;
  /** конец следа: конец интервала смерти, либо сплошной конец + TAIL_PX, если смерть не известна */
  x1: number;
  y: number;
  /** класс датировки: эпохальный — короткий точечный след «время не установлено» */
  cls: DateClass;
  /** год смерти известен */
  known: boolean;
  /** где кончается сплошная часть: смерть, начало интервала смерти или последнее упоминание */
  solidTo: number;
  /** оценочное рождение: до этой x (bHi) начало следа проявляется от звезды (растушёвка); нет — сплошной от звезды */
  sureFrom?: number;
  /**
   * Разрыв (MAP-51; решение 24): x, где кончается правдоподобная часть следа (рождение + предел жизни эпохи). Дальше —
   * знак «//» и бледный след: сплошная жизнь в 190 и 257 лет — не факт, а растянутое родословие.
   */
  brk?: number;
  color: string;
  width: number;
  /** штрих сплошной части (у следов ветвей его больше нет — решение 94; поле — для образцов) */
  dash?: readonly number[];
  /**
   * Разрывы следа (этап 11, Г7): пары «x, полуширина» — где след пересекает чужая связь (ствол, черта брака, лента),
   * в нём просвет: пересечение не читается узлом.
   */
  cuts?: readonly number[];
  /**
   * тон тающих частей следа (начало при оценочном рождении, хвост, бледная часть за разрывом): у потомка ветви —
   * тон текста, а не цвет ветви — без цветного «хвоста кометы» (решение 170, V-8); нет — тон следа
   */
  fade?: string;
  /**
   * Переходы следа (этап 15, решение 173 «Отчий дом»): лицо рождается в доме отца у матери (y — высота звезды) и плавной
   * S-кривой уходит в полосу своей жизни. Переход — часть следа лица, а не связь: тот же тон и толщина. По порядку x;
   * нет — след прямой на высоте y.
   */
  bends?: Bend[];
  /** доля яркости переходов против следа (решение 178: на обзоре неба переходы бледнее); нет — 1 */
  bendAlpha?: number;
  /**
   * Где след становится «живым» (px холста): жена, живущая в доме мужа с рождения (решение 173, Д7), — с года прихода в
   * дом (NodeRow.wed; в семейной укладке — FamilyResult.since). Доля следа до этой x — бледнее (TRAIL_PALE): её строка
   * ещё не её дом; разрывов и чужих узлов на ней нет (links.ts, LinkStar.from). Нет — след живой от звезды.
   */
  liveFrom?: number;
}

/**
 * Переход следа (решение 173) в px холста: S-кривая (smoothstep по годам, src/engine/stays.ts, laneAt) от (xa, ya)
 * до (xb, yb) ломаной pts = [x0, y0, x1, y1, …] слева направо.
 */
export interface Bend {
  xa: number;
  xb: number;
  ya: number;
  yb: number;
  pts: number[];
}

/** Узел с переходами: у лица больше одного пребывания (договор 1). Без выделения памяти — для проверки всех узлов кадра. */
export const hasGlides = (n: StayNode): boolean => !!n.stays && n.stays.length > 1;

/**
 * Переходы следа узла n в px холста (решение 173): выборка S-кривой laneAt по годам — шаг не крупнее 5 px по большей
 * оси, не меньше 6 и не больше 64 точек на переход. null — переходов нет. Одна и та же выборка у следа, попадания
 * (sky.ts, hitTrail), препятствий подписей и путей связей (links.ts, LinkStar.path).
 */
export function bendsOf(v: Pick<SkyContext, 'cam' | 'xOf'>, n: StayNode): Bend[] | null {
  if (!hasGlides(n)) return null;
  const { cam } = v;
  const out: Bend[] = [];
  for (const g of glidesOf(n)) {
    const xa = cam.sx(v.xOf(g.t0));
    const xb = cam.sx(v.xOf(g.t1));
    // концы — на высотах горизонталей следа (полпикселя, как у trailOf): переход стыкуется с ними без ступеньки
    const ya = Math.round(cam.sy(g.from)) + 0.5;
    const yb = Math.round(cam.sy(g.to)) + 0.5;
    const k = Math.max(6, Math.min(64, Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya)) / 5)));
    const pts: number[] = [];
    for (let j = 0; j <= k; j++) {
      const t = g.t0 + ((g.t1 - g.t0) * j) / k;
      if (j === 0) pts.push(xa, ya);
      else if (j === k) pts.push(xb, yb);
      else pts.push(cam.sx(v.xOf(t)), cam.sy(laneAt(n, t)));
    }
    out.push({ xa, xb, ya, yb, pts });
  }
  return out;
}

/** Высота следа в x (px холста): до первого перехода — звезда, на переходе — по его ломаной, после — его конец. */
export function trailY(t: Pick<LifeTrail, 'y' | 'bends'>, x: number): number {
  const bs = t.bends;
  if (!bs?.length) return t.y;
  let y = t.y;
  for (const g of bs) {
    if (x <= g.xa) return y;
    if (x < g.xb) {
      const p = g.pts;
      for (let k = 0; k + 3 < p.length; k += 2)
        if (x <= p[k + 2]) {
          const w = p[k + 2] - p[k];
          return w > 1e-9 ? p[k + 1] + ((p[k + 3] - p[k + 1]) * (x - p[k])) / w : p[k + 3];
        }
      return g.yb;
    }
    y = g.yb;
  }
  return y;
}

/**
 * Отрезки следа на участке x ∈ [a, b] (px холста): горизонтали пребываний и отрезки ломаных переходов — по порядку.
 * which: 1 — только горизонтали, 2 — только переходы, 3 — всё. Без разрывов: для свечения ветвей, препятствий подписей.
 */
export function trailSegs(t: Pick<LifeTrail, 'y' | 'bends'>, a: number, b: number, fn: (x0: number, y0: number, x1: number, y1: number, bend: boolean) => void, which = 3) {
  if (!(b > a)) return;
  const bs = t.bends;
  if (!bs?.length) {
    if (which & 1) fn(a, t.y, b, t.y, false);
    return;
  }
  let x = a;
  let y = t.y;
  for (const g of bs) {
    if (g.xb <= x) {
      y = g.yb;
      continue;
    }
    if (g.xa >= b) break;
    if (g.xa > x && which & 1) fn(x, y, Math.min(g.xa, b), y, false);
    if (which & 2) {
      const lo = Math.max(x, g.xa);
      const hi = Math.min(b, g.xb);
      const p = g.pts;
      for (let k = 0; k + 3 < p.length; k += 2) {
        const x0 = p[k];
        const x1 = p[k + 2];
        if (x1 <= lo || x0 >= hi) continue;
        const ya = x0 >= lo ? p[k + 1] : p[k + 1] + ((p[k + 3] - p[k + 1]) * (lo - x0)) / (x1 - x0 || 1);
        const yb = x1 <= hi ? p[k + 3] : p[k + 1] + ((p[k + 3] - p[k + 1]) * (hi - x0)) / (x1 - x0 || 1);
        fn(Math.max(x0, lo), ya, Math.min(x1, hi), yb, true);
      }
    }
    x = Math.min(b, g.xb);
    y = g.yb;
    if (x >= b) return;
  }
  if (which & 1) fn(x, y, b, y, false);
}

/**
 * Ломаная нарисованного следа (px холста) от звезды до конца: [x0, y0, x1, y1, …] слева направо — горизонтали
 * пребываний и выборка переходов (решение 173). Для путей связей (links.ts, LinkStar.path): ромб на следе жены в год
 * черты, ствол от следа матери в год рождения, разрывы следа под связями.
 */
export function trailPolyline(t: Pick<LifeTrail, 'x0' | 'x1' | 'y' | 'bends'>): number[] {
  const out: number[] = [];
  trailSegs(t, t.x0, Math.max(t.x0 + 0.01, t.x1), (ax, ay, bx, by) => {
    const n = out.length;
    if (!n || Math.abs(out[n - 2] - ax) > 0.01 || Math.abs(out[n - 1] - ay) > 0.01) out.push(ax, ay);
    out.push(bx, by);
  });
  return out;
}

/**
 * Отрезок ломаной (x0, y0)–(x1, y1) — в текущий путь с просветами: круги радиуса h вокруг точек следа над x разрывов
 * (cuts — пары «x, полуширина»). Вертикаль чужой связи над переходом прерывает его так же, как горизонталь следа (Г7).
 */
function gapSeg(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, holes: readonly number[] | null) {
  if (!holes?.length) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    return;
  }
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return;
  const out: [number, number][] = [];
  for (let k = 0; k + 2 < holes.length; k += 3) {
    // пересечение отрезка с кругом (cx, cy, r): параметры u ∈ [0, 1]
    const fx = x0 - holes[k];
    const fy = y0 - holes[k + 1];
    const r = holes[k + 2];
    const bq = 2 * (fx * dx + fy * dy);
    const cq = fx * fx + fy * fy - r * r;
    const disc = bq * bq - 4 * len2 * cq;
    if (disc <= 0) continue;
    const s = Math.sqrt(disc);
    const u0 = (-bq - s) / (2 * len2);
    const u1 = (-bq + s) / (2 * len2);
    if (u1 <= 0 || u0 >= 1) continue;
    out.push([Math.max(0, u0), Math.min(1, u1)]);
  }
  if (!out.length) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    return;
  }
  out.sort((p, q) => p[0] - q[0]);
  let u = 0;
  for (const [a, b] of out) {
    if (a > u) {
      ctx.moveTo(x0 + dx * u, y0 + dy * u);
      ctx.lineTo(x0 + dx * a, y0 + dy * a);
    }
    u = Math.max(u, b);
  }
  if (u < 1) {
    ctx.moveTo(x0 + dx * u, y0 + dy * u);
    ctx.lineTo(x1, y1);
  }
}

/** Просветы на переходах следа: круги (x, y на следе, полуширина) из разрывов cuts по x. */
function bendHoles(t: Pick<LifeTrail, 'y' | 'bends'>, cuts: readonly number[] | undefined): number[] | null {
  if (!cuts?.length || !t.bends?.length) return null;
  const out: number[] = [];
  for (const g of t.bends)
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const x = cuts[k];
      const h = cuts[k + 1];
      if (x + h < g.xa || x - h > g.xb) continue;
      out.push(x, trailY(t, x), h);
    }
  return out.length ? out : null;
}

/**
 * Участок следа [a, b] (px холста) — в текущий путь: горизонтали пребываний с просветами cuts (gapLine) и ломаные
 * переходов с просветами вокруг точек пересечения. which — как у trailSegs.
 */
export function trailPath(ctx: CanvasRenderingContext2D, t: Pick<LifeTrail, 'y' | 'bends'>, a: number, b: number, cuts?: readonly number[], which = 3) {
  if (!t.bends?.length) {
    if (which & 1) gapLine(ctx, a, b, t.y, cuts);
    return;
  }
  const holes = which & 2 ? bendHoles(t, cuts) : null;
  // ломаная перехода без просветов — одним подпутём: стыки отрезков без зазоров у концов линий
  let px = NaN;
  let py = NaN;
  trailSegs(
    t,
    a,
    b,
    (x0, y0, x1, y1, bend) => {
      if (bend && !holes) {
        if (Math.abs(x0 - px) > 1e-6 || Math.abs(y0 - py) > 1e-6) ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        px = x1;
        py = y1;
        return;
      }
      px = NaN;
      if (bend) gapSeg(ctx, x0, y0, x1, y1, holes);
      else gapLine(ctx, x0, x1, y0, cuts);
    },
    which,
  );
}

/** Знак разрыва «//» на горизонтальном следе у x: два косых штриха через след, между ними — просвет 3 px. */
export const BREAK = { gap: 3, h: 4, slant: 3 };
export function drawBreak(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.strokeStyle = color;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const dx of [-BREAK.gap / 2, BREAK.gap / 2]) {
    ctx.moveTo(x + dx - BREAK.slant / 2, y + BREAK.h);
    ctx.lineTo(x + dx + BREAK.slant / 2, y - BREAK.h);
  }
  ctx.stroke();
}

/**
 * Горизонталь [a, b] на высоте y — с просветами cuts (пары «x, полуширина»): отрезки добавляются в текущий путь.
 * Разрыв (Г7) — просвет в следе там, где его пересекает чужая связь.
 */
export function gapLine(ctx: CanvasRenderingContext2D, a: number, b: number, y: number, cuts?: readonly number[]) {
  if (b <= a) return;
  if (!cuts?.length) {
    ctx.moveTo(a, y);
    ctx.lineTo(b, y);
    return;
  }
  const gaps: [number, number][] = [];
  for (let k = 0; k + 1 < cuts.length; k += 2) if (cuts[k] + cuts[k + 1] > a && cuts[k] - cuts[k + 1] < b) gaps.push([cuts[k] - cuts[k + 1], cuts[k] + cuts[k + 1]]);
  gaps.sort((p, q) => p[0] - q[0]);
  let x = a;
  for (const [g0, g1] of gaps) {
    if (g0 > x) {
      ctx.moveTo(x, y);
      ctx.lineTo(Math.min(g0, b), y);
    }
    x = Math.max(x, g1);
    if (x >= b) return;
  }
  if (b > x) {
    ctx.moveTo(x, y);
    ctx.lineTo(b, y);
  }
}

/**
 * След жизни (решение 90): оценочное рождение — начало следа проявляется от звезды до sureFrom (конец интервала
 * рождения), дальше сплошной до solidTo; если смерть не известна или дата оценочная — до x1 след тает к краю. За разрывом
 * «//» — бледнее. Точек и пунктира на следе нет; эпохальная дата («время не установлено») — точечный след не длиннее 60 px.
 */
export function drawLifeTrail(ctx: CanvasRenderingContext2D, t: LifeTrail) {
  const lf = t.liveFrom;
  if (lf !== undefined && lf > t.x0 + 0.5) {
    // доля следа до прихода в дом мужа — бледнее (решение 173, Д7): тот же след двумя проходами с вырезом по x
    const g = ctx.globalAlpha;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-1e5, -1e5, lf + 1e5, 2e5);
    ctx.clip();
    ctx.globalAlpha = g * TRAIL_PALE;
    trailPasses(ctx, t);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(lf, -1e5, 2e5, 2e5);
    ctx.clip();
    trailPasses(ctx, t);
    ctx.restore();
    return;
  }
  trailPasses(ctx, t);
}

/** След с переходами: горизонтали и переходы (бледнее на обзоре неба, решение 178). */
function trailPasses(ctx: CanvasRenderingContext2D, t: LifeTrail) {
  const ba = t.bendAlpha ?? 1;
  if (!t.bends?.length || ba >= 0.999) return lifeTrailPass(ctx, t, 3);
  // переходы бледнее следа (решение 178): горизонтали и переходы — двумя проходами
  lifeTrailPass(ctx, t, 1);
  if (ba <= 0.01) return;
  const g = ctx.globalAlpha;
  ctx.globalAlpha = g * ba;
  lifeTrailPass(ctx, t, 2);
  ctx.globalAlpha = g;
}

/** Проход следа: which — 1 горизонтали пребываний, 2 переходы, 3 всё (trailSegs). */
function lifeTrailPass(ctx: CanvasRenderingContext2D, t: LifeTrail, which: number) {
  const { x0, x1, y } = t;
  const cuts = t.cuts;
  ctx.strokeStyle = t.color;
  ctx.lineWidth = t.width;
  if (t.cls === 'epochal') {
    if (!(which & 1)) return;
    ctx.setLineDash([1, 4]);
    ctx.beginPath();
    gapLine(ctx, x0, Math.min(x1, x0 + 60), y, cuts);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const solidTo = Math.max(x0, t.solidTo);
  // оценочное рождение: начало следа до bHi проявляется от звезды (но не дальше засвидетельствованного)
  const from = Math.max(x0, Math.min(t.sureFrom ?? x0, solidTo));
  const fc = t.fade ?? t.color;
  if (from > x0 + 0.5) fadeSpan(ctx, t, x0, from, fc, TRAIL_FADE.start, 1, cuts, which);
  // разрыв (MAP-51): сплошная часть кончается у brk, за знаком «//» — бледнее до конца засвидетельствованного
  const cut = t.brk !== undefined && t.brk > from + 4 && t.brk < solidTo - 4 ? t.brk : null;
  const solidEnd = cut !== null ? cut - BREAK.gap / 2 - 2 : solidTo;
  if (solidEnd > from + 0.5) {
    if (t.dash?.length) ctx.setLineDash(t.dash as number[]);
    ctx.strokeStyle = t.color;
    ctx.beginPath();
    trailPath(ctx, t, from, solidEnd, cuts, which);
    ctx.stroke();
    if (t.dash?.length) ctx.setLineDash([]);
  }
  const tail = (!t.known || t.cls === 'estimated') && x1 > solidTo + 0.5;
  if (cut !== null) {
    if (which & 1) drawBreak(ctx, cut, trailY(t, cut), t.color);
    fadeSpan(ctx, t, cut + BREAK.gap / 2 + 2, solidTo, fc, TRAIL_PALE, TRAIL_PALE, cuts, which);
  }
  // неизвестная или оценочная смерть: след тает к концу интервала смерти (к концу короткого хвоста)
  if (tail) fadeSpan(ctx, t, solidTo, x1, fc, cut !== null ? TRAIL_PALE : 1, TRAIL_FADE.end, cuts, which);
}

/**
 * След узла i в px холста или null, если следа нет: призрак, народ или род, умерший младенцем, лицо скопления.
 * Концы берутся из данных раскладки (NodeRow.t1 — конец уверенной жизни, trail — вид следа) и хронологии
 * (bHi — конец интервала рождения, dHi — конец интервала смерти).
 */
export function trailOf(v: SkyContext, i: number, out: LifeTrail): LifeTrail | null {
  const n = v.nodes[i];
  if (n.ghost) return null;
  if (n.trail && n.trail !== 'life') return null;
  const q = byId.get(n.person);
  if (!q || q.kind === 'people' || q.kind === 'clan') return null;
  const c = v.model.chrono.get(n.person);
  if (!c || c.infant) return null;
  const { cam } = v;
  const x0 = cam.sx(v.X0[i]);
  const sure = Math.max(x0, cam.sx(v.X1[i]));
  const known = c.d !== null;
  const loose = c.cls === 'estimated' || c.cls === 'epochal';
  out.x0 = x0;
  // звезда — в полосе рождения (решение 173), дальше след идёт по пребываниям и переходам
  out.y = Math.round(cam.sy(starLaneOf(n))) + 0.5;
  out.bends = hasGlides(n) ? (bendsOf(v, n) ?? undefined) : undefined;
  out.bendAlpha = undefined;
  // жена в доме мужа с рождения (решение 173, Д7): живой след — с года прихода в дом
  const live = v.liveYear?.(i) ?? null;
  out.liveFrom = live !== null && live > n.t0 ? cam.sx(v.xOf(live)) : undefined;
  out.cls = c.cls;
  out.known = known;
  out.solidTo = sure;
  out.x1 = known ? (loose && c.dHi !== null && c.dHi > n.t1 ? Math.max(sure, cam.sx(v.xOf(c.dHi))) : sure) : sure + TAIL_PX;
  out.sureFrom = loose && c.bHi > n.t0 ? cam.sx(v.xOf(c.bHi)) : undefined;
  out.brk = n.brk !== null && n.brk < n.t1 ? cam.sx(v.xOf(n.brk)) : undefined;
  return out;
}

// ---------- «время не установлено» (MAP-52; решение 24) ----------

/** Скобка лица без своего времени: годы засвидетельствованной деятельности или эпохи, x0…x1 в px, на высоте y. */
export interface EpochBracket {
  x0: number;
  x1: number;
  y: number;
  color: string;
}
/** Засечки скобки — на столько px вверх и вниз от строки. */
export const BRACKET_TICK = 3;
/** Пунктир скобки: редкие точки — время не установлено, не след жизни. */
export const BRACKET_DOTS = [1, 3];

/**
 * Скобка «время не установлено» (ТЗ § 3.1): редкий пунктир через годы, когда лицо засвидетельствовано (встреча,
 * годы брата, эпоха главы), с засечками на концах. Полый знак лица стоит в её середине (glyphs.ts). Той же функцией
 * скобку рисуют «Как читать карту» и образец.
 */
export function drawEpochBracket(ctx: CanvasRenderingContext2D, b: EpochBracket) {
  const x0 = Math.round(b.x0) + 0.5;
  const x1 = Math.round(b.x1) + 0.5;
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 1;
  ctx.setLineDash(BRACKET_DOTS);
  ctx.beginPath();
  ctx.moveTo(x0, b.y);
  ctx.lineTo(x1, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const x of [x0, x1]) {
    ctx.moveTo(x, b.y - BRACKET_TICK);
    ctx.lineTo(x, b.y + BRACKET_TICK);
  }
  ctx.stroke();
}

/**
 * Скобка узла i в px холста или null: только у лица «время не установлено» (trail 'epochal'), и не по годам созвездия
 * (when.by = 'group' — это не свидетельство, K1: только полый знак).
 */
export function bracketOf(v: SkyContext, i: number, out: EpochBracket): EpochBracket | null {
  const n = v.nodes[i];
  if (n.ghost || n.trail !== 'epochal') return null;
  const c = v.model.chrono.get(n.person);
  if (!c || c.when?.by === 'group' || !(c.bHi > c.bLo)) return null;
  const { cam } = v;
  out.x0 = cam.sx(v.xOf(c.bLo));
  out.x1 = cam.sx(v.xOf(c.bHi));
  out.y = Math.round(cam.sy(starLaneOf(n))) + 0.5;
  return out;
}

/** Одиночный отвод от следа родителя (y0) к ребёнку (y1) в px холста. */
export interface Descent {
  x: number;
  y0: number;
  y1: number;
  color: string;
  /** отвод к призраку жены — пунктир */
  ghost?: boolean;
  /** узелок матери на отводе: высота её следа и цвет */
  mother?: { y: number; color: string };
  /** хронологическое напряжение: знак разрыва посередине отвода этим цветом */
  tension?: string;
}

/** Знак разрыва (хронологическое напряжение) на вертикали x в высоте ym. */
function drawTension(ctx: CanvasRenderingContext2D, x: number, ym: number, color: string) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 4, ym + 1);
  ctx.lineTo(x + 4, ym - 3);
  ctx.moveTo(x - 4, ym + 4);
  ctx.lineTo(x + 4, ym);
  ctx.stroke();
}

/** Отвод: вертикаль x от y0 до y1, узелок матери, знак разрыва. Толщину линии задаёт вызывающий (на небе — 1 px). */
export function drawDescent(ctx: CanvasRenderingContext2D, d: Descent) {
  const { x, y0, y1 } = d;
  ctx.strokeStyle = d.color;
  if (d.ghost) ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  if (d.ghost) ctx.setLineDash([]);
  if (d.mother) {
    ctx.fillStyle = d.mother.color;
    ctx.fillRect(x - 1.5, d.mother.y - 1.5, 3, 3);
  }
  if (d.tension) drawTension(ctx, x, (y0 + y1) / 2, d.tension);
}

/**
 * Гребёнки разных матерей одного отца сдвинуты на столько px друг от друга (MAP-74): у каждой матери — своя гребёнка
 * на уровне её детей. Начертание у всех одно — тонкое сплошное: штрих на небе значит «потомок выбранного»
 * и «по толкованию», а не мать.
 */
export const COMB_SHIFT = 3;

/** Скоба (гребёнка) пары «отец — мать»: ствол x от следа родителя y0 до дальнего ребёнка и зубцы к звёздам детей. */
export interface Bracket {
  x: number;
  y0: number;
  kids: { x: number; y: number }[];
  color: string;
  /** штрих связи при выделении рода (LINK_STYLE: потомки выбранного); у гребёнок матерей штриха нет (MAP-74) */
  dash?: readonly number[];
  /** узелок матери на стволе */
  mother?: { y: number; color: string };
}

/** Скоба: ствол и зубцы. Толщину линии задаёт вызывающий. */
export function drawBracket(ctx: CanvasRenderingContext2D, b: Bracket) {
  let lo = b.y0;
  let hi = b.y0;
  for (const k of b.kids) {
    lo = Math.min(lo, k.y);
    hi = Math.max(hi, k.y);
  }
  ctx.strokeStyle = b.color;
  if (b.dash?.length) ctx.setLineDash(b.dash as number[]);
  ctx.beginPath();
  ctx.moveTo(b.x, lo);
  ctx.lineTo(b.x, hi);
  for (const k of b.kids) {
    if (Math.abs(k.x - b.x) < 0.75) continue;
    ctx.moveTo(b.x, k.y);
    ctx.lineTo(k.x, k.y);
  }
  ctx.stroke();
  if (b.dash?.length) ctx.setLineDash([]);
  if (b.mother) {
    ctx.fillStyle = b.mother.color;
    ctx.fillRect(b.x - 1.5, b.mother.y - 1.5, 3, 3);
  }
}

/** Брак: от следа мужа (yH) к жене (yW) в x — знак «‖»; к дальней жене — знак 8 px и тонкая выноска (MAP-22). */
export interface Marriage {
  x: number;
  yH: number;
  yW: number;
  color: string;
  /** до какой высоты от следа мужа рисуется двойная черта: ближе — вся, дальше — 8 px и выноска */
  near: number;
  /**
   * к дальней жене: где на выноске начинается знак 8 px (по умолчанию — у следа мужа). Знак, которому у следа мужа
   * нет места, сдвигается вдоль выноски (MAP-76); выноска тогда идёт и от следа мужа до знака.
   */
  from?: number;
  /** промежутки по y, где выноска не рисуется: под подписями, как под их ореолом (MAP-76) */
  skip?: [number, number][];
}

export function drawMarriage(ctx: CanvasRenderingContext2D, m: Marriage) {
  const dir = Math.sign(m.yW - m.yH) || 1;
  const far = Math.abs(m.yW - m.yH) > m.near;
  const y0 = far ? (m.from ?? m.yH) : m.yH;
  const yS = far ? y0 + dir * 8 : m.yW;
  ctx.strokeStyle = m.color;
  ctx.beginPath();
  ctx.moveTo(m.x - 1.5, y0);
  ctx.lineTo(m.x - 1.5, yS);
  ctx.moveTo(m.x + 1.5, y0);
  ctx.lineTo(m.x + 1.5, yS);
  ctx.stroke();
  if (far) {
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    const line = (a: number, b: number) => {
      let from = Math.min(a, b);
      const to = Math.max(a, b);
      for (const [s0, s1] of [...(m.skip ?? [])].sort((p, q) => p[0] - q[0])) {
        if (s1 <= from || s0 >= to) continue;
        if (s0 > from) {
          ctx.moveTo(m.x, from);
          ctx.lineTo(m.x, s0);
        }
        from = Math.max(from, s1);
      }
      if (to > from) {
        ctx.moveTo(m.x, from);
        ctx.lineTo(m.x, to);
      }
    };
    if (y0 !== m.yH) line(m.yH, y0);
    line(yS, m.yW);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Непрозрачность потомка по ветви выбранного (решение 69): яркость его поколения (branches.ts, branchFade); наведённая
 * семья гасит чужих детей (FAMILY_HOVER_DIM) — ветвь гаснет в той же доле; зажигание неба при загрузке. Шаг 0,01:
 * строк цвета на кадр — десятки.
 */
export function branchAlpha(bp: Pick<BranchPaint, 'a'>, emph: number, intro = 1): number {
  return Math.round(Math.min(1, bp.a * Math.min(1, emph / FAR) * intro) * 100) / 100;
}

/**
 * Яркость переходов против следа (решения 173, 178): на небе (меньше 7 px на год) — BEND_SKY, к обзору семьи — плавно
 * в полную силу (полоса ×1,5 масштаба).
 */
export const BEND_SKY = 0.45;
export const bendAlpha = (p: Pick<Pass, 'pxYear'>): number => BEND_SKY + (1 - BEND_SKY) * tierAlpha(p.pxYear ?? FAMILY_TIER.family, FAMILY_TIER.sky);

/**
 * Следы жизни видимых лиц (слой «следы жизни»). На обзоре (полоса ниже 5 px) — тоньше и бледнее. Потомки выбранного
 * лица — цветом своей ветви со свечением, предки — с мягким свечением (решение 69; branches.ts).
 */
export function drawTrails(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  const ky = cam.ky;
  const intro = p.s.intro;
  // один объект на весь слой: следов в кадре тысячи
  const t: LifeTrail = { x0: 0, x1: 0, y: 0, cls: 'exact', known: true, solidTo: 0, color: '', width: 1 };
  // ветви выбранного лица (решение 69): свечение потомков цветом ветви и предков — мягким светом — под следами
  const bf = branchFrame(v, p);
  if (bf.map) {
    const glow = new GlowBatch(glowLayers('branch', bf.theme, ky < 5));
    const anc = new GlowBatch(glowLayers('ancestor', bf.theme, ky < 5));
    for (const i of p.vis) {
      const id = v.nodes[i].person;
      const bp = bf.paint(id);
      if (bp ? !glows(bp.gen, ky < 5) : !bf.ancestor(id)) continue;
      if (!trailOf(v, i, t) || t.x1 < -8 || t.x0 > cam.w + 8) continue;
      // свечение ветви — только под сплошной частью следа: тающий хвост не светится (решение 170, V-8); по переходам
      // следа — тоже (решение 173: переход — часть следа)
      if (bp) {
        const a = branchAlpha(bp, p.emph(id), intro);
        trailSegs(t, t.x0, Math.max(t.x0, Math.min(t.x1, t.solidTo)), (x0, y0, x1, y1) => glow.add(bp.color, a, x0, y0, x1, y1));
      } else trailSegs(t, t.x0, t.x1, (x0, y0, x1, y1) => anc.add(pal.ink, intro, x0, y0, x1, y1));
    }
    anc.flush(ctx, bf.theme === 'night');
    glow.flush(ctx, bf.theme === 'night');
  }
  ctx.lineCap = 'butt';
  const hov = p.s.hovered;
  for (const i of p.vis) {
    if (!trailOf(v, i, t)) continue;
    const n = v.nodes[i];
    const q = byId.get(n.person)!;
    const bp = bf.paint(n.person);
    if (bp) {
      // потомок выбранного — цветом своей ветви, бледнее с каждым поколением (решение 69)
      t.color = alpha(bp.color, branchAlpha(bp, p.emph(n.person), intro));
      t.width = ky < 5 ? 1.2 : q.magnitude <= 1 ? 1.8 : 1.5;
      t.dash = undefined;
      t.cuts = p.cuts?.get(i);
      // тающие части — тоном текста: цвет ветви ровный, без цветного хвоста (решение 170, V-8)
      const e = p.emph(n.person) * intro;
      t.fade = alpha(pal.ink2, Math.min(1, (ky < 5 ? 0.35 : 0.55) * e * (q.magnitude <= 2 ? 1.25 : 1)));
      bf.shown.add(n.person);
    } else if (n.person === hov) {
      // наведённое лицо (решение 179): весь его след — со звезды через переходы до конца — ярче и на полпикселя толще
      t.color = alpha(pal.ink, Math.min(1, 0.85 * intro));
      t.width = (ky < 5 ? 1 : q.magnitude <= 1 ? 1.6 : 1.2) + 0.5;
      t.dash = undefined;
      t.cuts = p.cuts?.get(i);
      t.fade = undefined;
    } else {
      const e = p.emph(n.person) * intro;
      const a = (ky < 5 ? 0.35 : 0.55) * e * (q.magnitude <= 2 ? 1.25 : 1);
      t.color = alpha(pal.ink2, Math.min(1, a));
      t.width = ky < 5 ? 1 : q.magnitude <= 1 ? 1.6 : 1.2;
      t.dash = undefined;
      t.cuts = p.cuts?.get(i);
      t.fade = undefined;
    }
    // переходы (решение 173): на небе — бледнее следа, на обзоре семьи и ближе — в полную силу (решение 178); у выделенных —
    // как сам след
    if (t.bends) t.bendAlpha = bp || n.person === hov || p.s.highlight?.has(n.person) ? 1 : bendAlpha(p);
    drawLifeTrail(ctx, t);
    if (p.lines && t.x1 > t.x0 + 1 && t.x1 > 0 && t.x0 < cam.w) {
      const lines = p.lines;
      if (!t.bends) lines.add({ x: t.x0, y: t.y - 1.5, w: t.x1 - t.x0, h: 3 });
      else trailSegs(t, t.x0, t.x1, (x0, y0, x1, y1) => lines.add({ x: Math.min(x0, x1), y: Math.min(y0, y1) - 1.5, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) + 3 }));
    }
    if (p.shown && t.brk !== undefined && t.brk > v.letterW && t.brk < cam.w && t.y > v.openTop && t.y < cam.vp.b) p.shown.breaks.add(n.person);
  }
  // лица «время не установлено» — скобкой вместо следа (MAP-52)
  const b: EpochBracket = { x0: 0, x1: 0, y: 0, color: '' };
  for (const i of p.vis) {
    if (!bracketOf(v, i, b)) continue;
    if (b.x1 < -4 || b.x0 > cam.w + 4) continue;
    const e = p.emph(v.nodes[i].person) * intro;
    b.color = alpha(pal.ink2, Math.min(1, (ky < 5 ? 0.45 : 0.7) * e));
    drawEpochBracket(ctx, b);
    if (p.shown && b.y > v.openTop && b.y < cam.vp.b) p.shown.brackets.add(v.nodes[i].person);
  }
}

/**
 * Следы лиц линий Мессии поверх лент (E6; MAP-28): тонкой линией цвета --ink 60 %, чтобы лента не закрывала,
 * сколько жил Авраам, Иаков, Давид. Рисуется после лент.
 */
export function drawSpineTrails(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  if (cam.ky < 5) return;
  const t: LifeTrail = { x0: 0, x1: 0, y: 0, cls: 'exact', known: true, solidTo: 0, color: '', width: 1 };
  ctx.lineCap = 'butt';
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (!p.spine.has(n.person) || !trailOf(v, i, t)) continue;
    t.color = alpha(pal.ink, 0.6 * p.emph(n.person) * p.s.intro);
    t.width = 1;
    t.cuts = p.cuts?.get(i);
    drawLifeTrail(ctx, t);
  }
}

// ---------- семьи ----------

/** Вид связи родитель → ребёнок при выделении рода. */
export type LinkKind = 'base' | 'anc' | 'desc' | 'sib' | 'lit';

/**
 * Вид связи по степеням выделения родителя и ребёнка: предки — к выбранному лицу по восходящей, потомки — от него,
 * братья и сёстры — от общего родителя-предка; остальные выделенные (путь, группа) — «lit».
 */
export function linkKind(kp: Emphasis | undefined, kc: Emphasis | undefined): LinkKind {
  if (kp === undefined || kc === undefined) return 'base';
  if (kp === 'anc' && (kc === 'anc' || kc === 'self')) return 'anc';
  if ((kp === 'self' || kp === 'desc') && kc === 'desc') return 'desc';
  if (kp === 'anc' && kc === 'sib') return 'sib';
  if (kp === 'sure' || kp === 'likely' || kc === 'sure' || kc === 'likely') return 'base';
  return 'lit';
}

/** Начертание связи при выделении (MAP-20): предки сплошные 1,5 px, потомки штрихом [4, 3], братья и сёстры — 1 px. */
export const LINK_STYLE: Record<Exclude<LinkKind, 'base'>, { width: number; dash: number[] }> = {
  anc: { width: 1.5, dash: [] },
  desc: { width: 1.5, dash: [4, 3] },
  sib: { width: 1, dash: [] },
  lit: { width: 1, dash: [] },
};

/**
 * Дети одной матери — на одной гребёнке (MAP-74), пока между ними не родился ребёнок другой матери того же отца
 * и пока гребёнка не длиннее COMB_SPAN px: зубцы короткие и не читаются как след жизни. Дальше — новая гребёнка той
 * же матери, со своей пометой.
 */
const COMB_SPAN = 96;
/** С какой высоты полосы у гребёнок появляется помета матери «от Лии». */
const NOTE_KY = 14;

/**
 * Что под указателем у семьи (src/ui/sky/input.ts, familyAt): гребёнка отца parent и матери mother, её помета
 * или помета порядка перечисления. kids — дети этой гребёнки (у пометы матери — все её дети от этого отца в кадре,
 * у пометы порядка — все дети, чей год оценён по порядку).
 */
export interface FamilyHit {
  kind: 'comb' | 'mother' | 'order';
  parent: string;
  mother: string | null;
  kids: string[];
  /** место, где Писание называет этих детей по порядку (orderListing): «Быт 29:32–30:24; 35:16–18» */
  source?: string;
}

/** Подпись, которую небо ставит после подписей звёзд, если есть место: «от Лии», «Рахиль, жена Иакова», порядок. */
export interface FamilyText {
  text: string;
  /** точка привязки: ствол гребёнки у её корня или звезда призрака */
  x: number;
  y: number;
  /** где ставить: у корня гребёнки (помета матери), справа от звезды (призрак) или у детей (порядок перечисления) */
  at: 'root' | 'star' | 'kids';
  /** радиус звезды (для at = 'star') */
  r?: number;
  /**
   * Дети, у которых помета может встать, если у корня места нет (MAP-55): звёзды детей в px холста — слева от звезды
   * или под ней, по порядку.
   */
  kids?: { x: number; y: number; r: number; id?: string }[];
  /** что помета объясняет: наведение на неё высвечивает гребёнку (familyAt) */
  hit?: FamilyHit;
  /**
   * ствол гребёнки от следа отца (y0) до корня (y1): если корень за краем окна, помета встаёт у видимой части ствола —
   * ближе к корню, не у следа отца
   */
  stem?: { y0: number; y1: number };
}

/**
 * Знак брака, который ставится после подписей звёзд через общую проверку наложений (MAP-76): x — желательное место
 * (год первого ребёнка), xMin — не левее (правее звезды жены).
 */
export interface MarriageMark {
  at: 'marriage';
  x: number;
  xMin: number;
  yH: number;
  yW: number;
  near: number;
  color: string;
  /** непрозрачность слоя связей в этом кадре (подробность кадра, sky.ts layer) */
  alpha: number;
  wife: string;
}

/** То, что drawDescents откладывает до подписей звёзд: пометы семей и знаки брака (drawFamilyNotes). */
export type FamilyNote = FamilyText | MarriageMark;

type Kid = { i: number; x: number; y: number; id: string };
type Group = { parent: string; mother: string | null; y0: number; kids: Kid[] };

/** Год первого общего ребёнка пары (для знака брака): по модели и паре «муж|жена». */
const firstChildCache = new WeakMap<ModelData, Map<string, number | null>>();
function firstChild(m: ModelData, husband: string, wife: string): number | null {
  let c = firstChildCache.get(m);
  if (!c) firstChildCache.set(m, (c = new Map()));
  const key = `${husband}|${wife}`;
  if (c.has(key)) return c.get(key)!;
  let best: number | null = null;
  for (const e of graph.childrenOf.get(wife) ?? []) {
    if (e.kind !== 'mother') continue;
    if (byId.get(e.child)?.father !== husband) continue;
    const b = m.chrono.get(e.child)?.b;
    if (b !== undefined && (best === null || b < best)) best = b;
  }
  c.set(key, best);
  return best;
}

/** «от Лии»: имя матери в родительном падеже; если склонение ненадёжно — пометы нет. */
export function motherNote(id: string): string | null {
  const q = byId.get(id);
  if (!q) return null;
  const g = nameCase(q.name, q.sex, 'gen', q.unnamed);
  return g ? `от ${g}` : null;
}

// ---------- порядок перечисления (MAP-54, MAP-73; решение 41) ----------

/** Ссылка родства в числах: книга, начало и конец (главы и стихи). */
interface RefPos {
  book: string;
  c: number;
  v: number;
  c2: number;
  v2: number;
}
const REF = /^(\S+) (\d+):(\d+)(?:-(\d+)(?::(\d+))?)?/;
function refPos(r: string): RefPos | null {
  const m = REF.exec(r);
  if (!m || !BOOK_INDEX.has(m[1])) return null;
  const c = Number(m[2]);
  const v = Number(m[3]);
  if (m[5]) return { book: m[1], c, v, c2: Number(m[4]), v2: Number(m[5]) };
  return { book: m[1], c, v, c2: c, v2: m[4] ? Number(m[4]) : v };
}
const startOf = (r: RefPos) => r.c * 1000 + r.v;
const endOf = (r: RefPos) => r.c2 * 1000 + r.v2;

/** Место, где Писание называет детей по порядку: ссылки (синодальные сокращения) и они же для показа. */
export interface OrderListing {
  /** «Быт 29:32-30:24», «Быт 35:16-18» */
  refs: string[];
  /** «Быт 29:32–30:24; 35:16–18» — неразрывные пробелы, тире в промежутках */
  text: string;
  /** дети, которых это место называет по порядку */
  ids: string[];
}

/**
 * Дети родителя, чей порядок держит решатель (engine/chronology.ts, siblingPairs): с номером порядка в данных или
 * с годом, оценённым по порядку; без народов и родов и без потомков через пропуск поколений. По порядку рождения.
 */
function orderedKids(parent: string, m: ModelData): string[] {
  const gap = new Set((graph.childrenOf.get(parent) ?? []).filter((e) => e.gap).map((e) => e.child));
  return primaryChildren(graph, parent).filter((k) => {
    const q = byId.get(k);
    return !!q && q.kind !== 'people' && q.kind !== 'clan' && !gap.has(k) && (q.order !== null || !!m.chrono.get(k)?.byOrder);
  });
}

/**
 * Место перечисления: книга, в которой дети (kids — по порядку рождения) названы в том же порядке. У ребёнка в книге
 * бывает несколько ссылок (рассказ о рождении и перечень: Рувим — Быт 29:32 и 35:23; жена в одном стихе, дети в другом:
 * Тувалкаин — Быт 4:19 и 4:22): каждому ребёнку берётся та из них, при которой цепочка детей по порядку стихов длиннее,
 * а стихов в ней больше (DG 2.3.6: место — стихи, где дети названы, а не первая ссылка ребёнка). Лучше та книга, где
 * цепочка длиннее, затем та, где у детей больше разных стихов (стихи сами задают порядок: рассказ о рождениях
 * Быт 29:32–30:24 лучше перечня 1 Пар 2:1–2, где сыновья Иакова названы в двух стихах и в другом порядке), затем первая
 * по канону. must — ребёнок, который обязательно входит в цепочку. Промежуток стихов — от первого до последнего стиха
 * выбранных ссылок детей цепочки.
 */
export function listingOf(kids: readonly string[], must?: string): OrderListing | null {
  const refs = kids.map((k) => (byId.get(k)?.parentRefs ?? []).map(refPos).filter((r): r is RefPos => !!r));
  const books = new Set(refs.flatMap((rs) => rs.map((r) => r.book)));
  const mi = must === undefined ? -1 : kids.indexOf(must);
  if (must !== undefined && mi < 0) return null;
  let best: { book: string; len: number; dist: number; chain: { i: number; r: RefPos }[] } | null = null;
  for (const book of books) {
    // состояния: ребёнок i с одной из своих ссылок в книге; цепочка — по неубывающему началу стиха
    const st: { i: number; r: RefPos; len: number; dist: number; jumps: number; first: number; prev: number }[] = [];
    refs.forEach((rs, i) => {
      for (const r of rs) if (r.book === book) st.push({ i, r, len: 0, dist: 0, jumps: 0, first: 0, prev: -1 });
    });
    if (mi >= 0 && !st.some((q) => q.i === mi)) continue;
    const w = (q: { i: number }) => (q.i === mi ? 1000 : 1);
    // соседние места цепочки — одно перечисление (тот же или следующий стих, в пределах 4 стихов): иначе — скачок; при
    // равной длине цепочки лучше та, где скачков меньше (одно место, а не россыпь по главам: 1 Пар 3:5–8, а не 3:5; 14:4–7)
    const near = (a: RefPos, b: RefPos) => startOf(b) <= endOf(a) + 1 || (b.c === a.c2 && b.v <= a.v2 + 4) || (b.c === a.c2 + 1 && b.v <= 4);
    // порядок цепочек: длиннее; раньше начало (первое место, где дети названы: рассказ о рождениях Быт 38, а не список
    // Быт 46:12; 1 Пар 3:5, а не 14:4); меньше скачков (одно перечисление, а не россыпь: 1 Пар 3:5–8, а не 3:5; 14:4–7);
    // больше разных стихов (дети названы своими стихами: у Циллы — 4:19 и 4:22, а не 4:19 дважды)
    type S = { len: number; jumps: number; first: number; dist: number };
    const better = (x: S, y: S) => x.len > y.len || (x.len === y.len && (x.first < y.first || (x.first === y.first && (x.jumps < y.jumps || (x.jumps === y.jumps && x.dist > y.dist)))));
    for (let a = 0; a < st.length; a++) {
      const qa = st[a];
      qa.len = w(qa);
      qa.dist = 0;
      qa.jumps = 0;
      qa.first = startOf(qa.r);
      qa.prev = -1;
      for (let b = 0; b < a; b++) {
        const qb = st[b];
        if (qb.i >= qa.i || startOf(qb.r) > startOf(qa.r)) continue;
        const cand = { len: qb.len + w(qa), jumps: qb.jumps + (near(qb.r, qa.r) ? 0 : 1), first: qb.first, dist: qb.dist + (startOf(qb.r) < startOf(qa.r) ? 1 : 0) };
        if (better(cand, qa)) {
          Object.assign(qa, cand);
          qa.prev = b;
        }
      }
    }
    let e = -1;
    for (let a = 0; a < st.length; a++) if (e < 0 || better(st[a], st[e])) e = a;
    if (e < 0) continue;
    // must — в цепочке обязательно (вес 1000): без него цепочка не годится
    const chain: { i: number; r: RefPos }[] = [];
    for (let a = e; a >= 0; a = st[a].prev) chain.unshift({ i: st[a].i, r: st[a].r });
    if (mi >= 0 && !chain.some((q) => q.i === mi)) continue;
    if (chain.length < 2) continue;
    const len = chain.length;
    const dist = st[e].dist;
    const wins = !best || len > best.len || (len === best.len && (dist > best.dist || (dist === best.dist && BOOK_INDEX.get(book)! < BOOK_INDEX.get(best.book)!)));
    if (wins) best = { book, len, dist, chain };
  }
  if (!best) return null;
  // стихи — промежутками: от начала первой ссылки цепочки; соседние (через 4 стиха и меньше, и через границу главы) сливаются
  const own = best.chain.flatMap((q) => {
    // у ребёнка — и его ссылки в этой книге раньше выбранной (жена в одном стихе, дети в следующем: Быт 4:19 и 4:22)
    const rs = refs[q.i].filter((r) => r.book === best!.book && startOf(r) <= startOf(q.r) && startOf(q.r) - startOf(r) <= 4);
    return rs.length ? rs : [q.r];
  });
  const parts: RefPos[] = [];
  for (const r of [...own].sort((a, b) => startOf(a) - startOf(b))) {
    const cur = parts[parts.length - 1];
    const join = cur && (startOf(r) <= endOf(cur) + 1 || (r.c === cur.c2 && r.v <= cur.v2 + 4) || (r.c === cur.c2 + 1 && r.v <= 4));
    if (!join) parts.push({ ...r });
    else if (endOf(r) > endOf(cur)) {
      cur.c2 = r.c2;
      cur.v2 = r.v2;
    }
  }
  const span = (r: RefPos) => `${r.c}:${r.v}${r.c2 !== r.c ? `-${r.c2}:${r.v2}` : r.v2 !== r.v ? `-${r.v2}` : ''}`;
  const out = parts.map((r) => `${best!.book} ${span(r)}`);
  // refText — только с книгой: без книги «35:16-18» он принял бы «3» за номер книги
  const text = parts.map((r, k) => (k === 0 ? refText(`${best!.book} ${span(r)}`) : span(r).replace(/-/g, '–'))).join('; ');
  return { refs: out, text, ids: [...new Set(best.chain.map((q) => kids[q.i]))] };
}

/** Место перечисления семьи родителя (по модели): кэш на модель. */
const familyCache = new WeakMap<ModelData, Map<string, OrderListing | null>>();
function familyListing(parent: string, m: ModelData, must?: string): OrderListing | null {
  let c = familyCache.get(m);
  if (!c) familyCache.set(m, (c = new Map()));
  const key = `${parent}|${must ?? ''}`;
  if (c.has(key)) return c.get(key)!;
  let kids = orderedKids(parent, m);
  let got = listingOf(kids, must);
  // перечня всех детей нет — только тех, чей год оценён по порядку
  if (!got) {
    kids = kids.filter((k) => m.chrono.get(k)?.byOrder);
    got = listingOf(kids, must);
  }
  c.set(key, got);
  return got;
}

/**
 * Место перечисления для лица, чей год оценён по порядку перечисления братьев и сестёр (ChronoRow.byOrder): ссылка,
 * которую подсказка ребёнка пишет в строке «год оценён по порядку перечисления (ссылка), выв.» (решение 41;
 * src/ui/sky/Tip.tsx). У сыновей Иакова — рассказ о рождениях Быт 29:32–30:24; 35:16–18. null — год оценён не по
 * порядку или место не найдено.
 */
export function orderListing(id: string, m: ModelData = models[0]): OrderListing | null {
  if (!m.chrono.get(id)?.byOrder) return null;
  const q = byId.get(id);
  if (!q) return null;
  for (const par of [q.father, q.mother]) {
    if (!par) continue;
    const got = familyListing(par, m, id);
    if (got) return got;
  }
  return null;
}
/** Текст ссылки orderListing: «Быт 29:32–30:24; 35:16–18» или null. */
export const orderSource = (id: string, m: ModelData = models[0]): string | null => orderListing(id, m)?.text ?? null;

/**
 * «годы — по порядку 1 Пар 3:1–9, выв.» (MAP-54, MAP-73): помета у детей ids, чей год оценён по порядку перечисления.
 * Ссылка — место, где Писание называет их по порядку (listingOf). null — такого места нет.
 */
export function orderNote(ids: readonly string[]): string | null {
  const kids = [...ids].sort((a, b) => (byId.get(a)?.order ?? 999) - (byId.get(b)?.order ?? 999));
  const got = listingOf(kids);
  return got ? `годы — по порядку ${got.text}, выв.` : null;
}

/** «Рахиль, жена Иакова»: подпись призрака жены; если склонение имени мужа ненадёжно — только имя. */
export function ghostNote(id: string, husband: string | null): string {
  const q = byId.get(id);
  if (!q) return id;
  const h = husband ? byId.get(husband) : undefined;
  const g = h ? nameCase(h.name, h.sex, 'gen', h.unnamed) : null;
  return g ? `${q.name}, ${q.sex === 'f' ? 'жена' : 'муж'} ${g}` : q.name;
}

// ---------- наведение на гребёнку (MAP-73, MAP-74) ----------

/** Гребёнка кадра в px холста: ствол x от lo до hi и зубцы к звёздам детей. */
interface CombShape {
  parent: string;
  mother: string | null;
  x: number;
  lo: number;
  hi: number;
  teeth: { x: number; y: number }[];
  kids: string[];
}
/** Гребёнки и пометы последнего кадра: для familyAt. Кадр узнаётся по его Placer (один на кадр, общий для проходов). */
const frames = new WeakMap<object, { placer: object; combs: CombShape[]; boxes: { r: Rect; hit: FamilyHit }[] }>();
function frameOf(v: object, p: Pass) {
  let f = frames.get(v);
  if (!f || f.placer !== p.placer) frames.set(v, (f = { placer: p.placer, combs: [], boxes: [] }));
  return f;
}

/**
 * Семья под указателем (px холста): помета матери или порядка, затем гребёнка — ствол или зубец ближе r px.
 * Для src/ui/sky/input.ts: наведение высвечивает гребёнку матери и показывает помету порядка (решение 41).
 */
export function familyAt(v: object, x: number, y: number, r = 4): FamilyHit | null {
  const f = frames.get(v);
  if (!f) return null;
  for (const b of f.boxes) if (x >= b.r.x && x <= b.r.x + b.r.w && y >= b.r.y && y <= b.r.y + b.r.h) return b.hit;
  let best: CombShape | null = null;
  let bd = r;
  for (const c of f.combs) {
    if (y >= c.lo - r && y <= c.hi + r) {
      const d = Math.abs(x - c.x);
      if (d <= bd) {
        bd = d;
        best = c;
      }
    }
    for (const t of c.teeth) {
      const d = Math.abs(y - t.y);
      if (d <= bd && x >= Math.min(c.x, t.x) - r && x <= Math.max(c.x, t.x) + r) {
        bd = d;
        best = c;
      }
    }
  }
  return best ? { kind: 'comb', parent: best.parent, mother: best.mother, kids: best.kids } : null;
}

/** Гребёнки последнего кадра (px холста): отец, мать, ствол x от lo до hi, дети — для проверок (tests/family-l3). */
export const familyCombs = (v: object): readonly { parent: string; mother: string | null; x: number; lo: number; hi: number; kids: string[] }[] => frames.get(v)?.combs ?? [];

const hovers = new WeakMap<object, FamilyHit | null>();
/** Запомнить семью под указателем (src/ui/sky/input.ts); true — изменилась, нужен кадр. */
export function setFamilyHover(v: object, h: FamilyHit | null): boolean {
  const was = hovers.get(v) ?? null;
  hovers.set(v, h);
  return (was?.parent ?? null) !== (h?.parent ?? null) || (was?.mother ?? null) !== (h?.mother ?? null) || (was?.kind ?? null) !== (h?.kind ?? null);
}
/** Семья под указателем: её гребёнка ярче, гребёнки других матерей того же отца — бледнее, помета порядка видна. */
export const familyHover = (v: object): FamilyHit | null => hovers.get(v) ?? null;

/**
 * Связи родитель → ребёнок (слой «связи»; на обзоре их нет): гребёнки детей одной матери, отводы, узелки матерей,
 * знаки разрыва при напряжении, отводы к призракам. Возвращает то, что ставится после подписей звёзд
 * (drawFamilyNotes): пометы матерей и порядка, подписи призраков и знаки брака.
 */
export function drawDescents(v: SkyContext, p: Pass): FamilyNote[] {
  const { ctx, cam, pal } = v;
  const s = p.s;
  const L = s.layers;
  const hl = s.highlight;
  const intro = s.intro;
  const notes: FamilyNote[] = [];
  const frame = frameOf(v, p);
  const hover = familyHover(v);
  const d: Descent = { x: 0, y0: 0, y1: 0, color: '', ghost: false, mother: undefined, tension: undefined };
  // ветви выбранного лица (решение 69): свечение отводов к потомкам и предкам — после всех отводов, одним путём на цвет
  const bf = branchFrame(v, p);
  const glow = bf.map ? new GlowBatch(glowLayers('branch', bf.theme, cam.ky < 5)) : null;
  const anc = bf.map ? new GlowBatch(glowLayers('ancestor', bf.theme, cam.ky < 5)) : null;
  // узкие строки (решение 25; MAP-61): связи — 0,5 px, чтобы не заливать небо сеткой вертикалей
  const base = cam.ky < 6 ? 0.5 : 1;
  ctx.lineWidth = base;
  const groups = new Map<string, Group>();
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.parentLane === null || n.satelliteOf) continue;
    if (n.ghost && !L.ghosts) continue;
    // ребёнок или родитель не показан (набор, свёртка, «только линии»): отвода нет — он висел бы в пустоте
    if (!v.drawn(i)) continue;
    const pi = n.layoutParent ? v.indexOf(n.layoutParent) : undefined;
    if (pi !== undefined && !v.drawn(pi)) continue;
    // родитель скрыт рабочим набором или свёрткой (J4, J5): связь не рисуется — её конец висел бы в пустоте
    if (n.layoutParent && v.hides(n.layoutParent)) continue;
    // отвод — от следа родителя в год рождения ребёнка к звезде ребёнка (полоса рождения; решение 173)
    const y0 = pi !== undefined ? cam.sy(laneAt(v.nodes[pi], n.born ?? n.t0)) : cam.sy(n.parentLane);
    const y1 = cam.sy(starLaneOf(n));
    // у лица со знаком у первого свидетельства (решение 38; MAP-69) отвод приходит в оценку рождения — внутрь полосы
    // промежутка рождения, а не в год знака: иначе он висел бы за концом следа родителя
    const x = Math.round(cam.sx(n.born !== null && n.born !== undefined ? v.xOf(n.born) : v.X0[i])) + 0.5;
    if (n.ghost) {
      // призрак жены в её роду — пунктирный отвод
      const e = Math.min(p.emph(n.person), n.layoutParent ? p.emph(n.layoutParent) : 1) * intro;
      d.x = x;
      d.y0 = y0;
      d.y1 = y1;
      d.color = alpha(pal.ink3, 0.75 * e);
      d.ghost = true;
      d.mother = undefined;
      d.tension = undefined;
      drawDescent(ctx, d);
      continue;
    }
    const q = byId.get(n.person);
    const par = n.layoutParent ?? '';
    const other = !q ? null : par === q.father ? q.mother : par === q.mother ? q.father : q.mother;
    const key = `${par}|${other ?? ''}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { parent: par, mother: other && byId.get(other)?.sex === 'f' ? other : null, y0, kids: [] }));
    g.kids.push({ i, x, y: y1, id: n.person });
  }
  const byParent = new Map<string, Group[]>();
  for (const g of groups.values()) {
    g.kids.sort((a, b) => a.x - b.x);
    const a = byParent.get(g.parent);
    if (a) a.push(g);
    else byParent.set(g.parent, [g]);
  }
  const knot = { y: 0, color: '' };
  const radius = (id: string) => starRadius(byId.get(id)?.magnitude ?? 6, p.zoomScale);
  for (const [, gs] of byParent) {
    gs.sort((a, b) => a.kids[0].x - b.kids[0].x);
    const mothers = gs.filter((g) => g.mother).length;
    const trunks: { x: number; lo: number; hi: number }[] = [];
    // годы рождения детей других матерей того же отца: они разбивают гребёнку матери
    const born = gs.flatMap((g) => g.kids.map((k) => ({ x: k.x, g })));
    for (const g of gs) {
      // гребёнки матери: соседние по рождению дети — на одной, пока зубцы короткие (MAP-74)
      const combs: Kid[][] = [];
      for (const k of g.kids) {
        const last = combs[combs.length - 1];
        const prev = last?.[last.length - 1];
        const between = !!prev && born.some((b) => b.g !== g && b.x > prev.x && b.x < k.x);
        if (last && !between && k.x - last[0].x <= COMB_SPAN) last.push(k);
        else combs.push([k]);
      }
      // наведённая гребёнка (помета матери, ствол): её мать — ярче, другие матери того же отца — бледнее;
      // помета порядка — все гребёнки этого отца ярче
      const hovered = !!hover && hover.parent === g.parent;
      const mine = hovered && (hover!.kind === 'order' || hover!.mother === g.mother);
      for (const all of combs) {
        // небо «набор» (решение 76): связь детей союза с точкой на небе рисует точка (plates.ts) — отвода и гребёнки нет
        const cl = p.unionKids ? all.filter((k) => !p.unionKids!.has(k.id)) : all;
        if (!cl.length) continue;
        let lo = g.y0;
        let hi = g.y0;
        for (const k of cl) {
          lo = Math.min(lo, k.y);
          hi = Math.max(hi, k.y);
        }
        // гребёнки разных матерей не сливаются: сдвиг на 3 px
        let x = cl[0].x;
        while (trunks.some((t) => Math.abs(t.x - x) < COMB_SHIFT - 0.5 && t.lo < hi && lo < t.hi)) x -= COMB_SHIFT;
        trunks.push({ x, lo, hi });
        frame.combs.push({ parent: g.parent, mother: g.mother, x, lo, hi, teeth: cl.map((k) => ({ x: k.x, y: k.y })), kids: cl.map((k) => k.id) });
        // ствол и зубцы — линии кадра: названия созвездий на них не ложатся (MAP-08)
        if (p.lines && hi > lo + 1 && x > -4 && x < cam.w + 4) p.lines.add({ x: x - 1.5, y: lo, w: 3, h: hi - lo });
        if (p.lines) for (const k of cl) if (Math.abs(k.x - x) > 1) p.lines.add({ x: Math.min(x, k.x), y: k.y - 1.5, w: Math.abs(k.x - x), h: 3 });
        const eP = g.parent ? p.emph(g.parent) : 1;
        const eBase = Math.min(eP, ...cl.map((k) => p.emph(k.id))) * intro;
        const color = mine ? alpha(pal.ink2, Math.min(1, intro)) : alpha(pal.ink3, 0.75 * eBase * (hovered ? 0.4 : 1));
        // узелок матери на стволе
        let mother: typeof knot | undefined;
        if (g.mother) {
          const mi2 = v.indexOf(g.mother);
          if (mi2 !== undefined && !v.hides(g.mother)) {
            const my = cam.sy(laneAt(v.nodes[mi2], v.nodes[cl[0].i].t0));
            if (my > lo + 1 && my < hi - 1 && my !== g.y0) {
              knot.y = my;
              knot.color = alpha(pal.ink2, 0.9 * eBase);
              mother = knot;
            }
          }
        }
        // выделенный род: связи к выделенным детям — своим начертанием (предки, потомки, братья), остальные — как обычно
        const kp = hl ? hl.get(g.parent) : undefined;
        const lit = hl ? cl.filter((k) => linkKind(kp, hl.get(k.id)) !== 'base') : [];
        const plain = lit.length ? cl.filter((k) => !lit.includes(k)) : cl;
        if (mine) ctx.lineWidth = base + 0.5;
        if (plain.length === 1 && Math.abs(x - plain[0].x) < 0.75) {
          d.x = x;
          d.y0 = g.y0;
          d.y1 = plain[0].y;
          d.color = color;
          d.ghost = false;
          d.mother = mother;
          d.tension = undefined;
          drawDescent(ctx, d);
        } else if (plain.length) drawBracket(ctx, { x, y0: g.y0, kids: plain, color, mother });
        ctx.lineWidth = base;
        for (const k of lit) {
          const lk = linkKind(kp, hl!.get(k.id)) as Exclude<LinkKind, 'base'>;
          const st = LINK_STYLE[lk];
          ctx.lineWidth = st.width;
          // ветви выбранного лица (решение 69): отвод к потомку — цветом его ветви (штрих остаётся), к предку — со
          // свечением; свечение ложится одним путём после всех отводов
          const bp = lk === 'desc' ? bf.paint(k.id) : null;
          let color = alpha(pal.ink2, Math.min(1, p.emph(k.id) * intro));
          if (bp) {
            const a = branchAlpha(bp, p.emph(k.id), intro);
            color = alpha(bp.color, a);
            if (glows(bp.gen, cam.ky < 5)) {
              glow!.add(bp.color, a, x, g.y0, x, k.y);
              if (Math.abs(k.x - x) >= 0.75) glow!.add(bp.color, a, x, k.y, k.x, k.y);
            }
            bf.shown.add(k.id);
          } else if (lk === 'anc' && anc) {
            anc.add(pal.ink, intro, x, g.y0, x, k.y);
            if (Math.abs(k.x - x) >= 0.75) anc.add(pal.ink, intro, x, k.y, k.x, k.y);
          }
          drawBracket(ctx, { x, y0: g.y0, kids: [k], color, dash: st.dash, mother: plain.length ? undefined : mother });
          ctx.lineWidth = base;
        }
        // хронологическое напряжение: знак разрыва на стволе; ребёнок родился после разрыва следа родителя (MAP-51) —
        // тот же знак: между ними, вероятно, не все поколения
        const pi = g.parent ? v.indexOf(g.parent) : undefined;
        const brk = pi !== undefined ? v.nodes[pi].brk : null;
        const torn = L.tensions && s.tensionPersons.has(g.parent);
        for (const k of cl)
          if ((torn && s.tensionPersons.has(k.id)) || (brk !== null && v.nodes[k.i].t0 > brk))
            drawTension(ctx, x, (g.y0 + k.y) / 2, alpha(pal.ink, 0.9 * Math.min(eP, p.emph(k.id)) * intro));
        // помета матери — у корня гребёнки: у ребёнка, ближайшего к следу отца, а не у следа отца (на лентах у хребта;
        // MAP-74, MAP-80); когда у отца дети от разных матерей
        if (mothers >= 2 && g.mother && cam.ky >= NOTE_KY) {
          const text = motherNote(g.mother);
          const byNear = [...cl].sort((a, b) => Math.abs(a.y - g.y0) - Math.abs(b.y - g.y0));
          const root = byNear[0];
          if (text)
            notes.push({
              text, x, y: root.y, at: 'root',
              kids: byNear.map((k) => ({ x: k.x, y: k.y, r: radius(k.id) })),
              hit: { kind: 'mother', parent: g.parent, mother: g.mother, kids: g.kids.map((k) => k.id) },
              stem: { y0: g.y0, y1: root.y },
            });
        }
      }
    }
  }
  if (anc) anc.flush(ctx, bf.theme === 'night');
  if (glow) glow.flush(ctx, bf.theme === 'night');
  // порядок братьев по перечислению (MAP-54; решение 41): «годы — по порядку …, выв.» — у детей, чей год оценён
  // по порядку, только в семье выбранного лица (его дети, его братья и сёстры) и у наведённой гребёнки
  const own = new Set<string>();
  if (s.selected) {
    own.add(s.selected);
    const q = byId.get(s.selected);
    if (q?.father) own.add(q.father);
    if (q?.mother) own.add(q.mother);
  }
  if (hover) own.add(hover.parent);
  if (cam.ky >= NOTE_KY)
    for (const [par, gs] of byParent) {
      if (!own.has(par)) continue;
      const kids = gs.flatMap((g) => g.kids).filter((k) => v.model.chrono.get(k.id)?.byOrder);
      if (kids.length < 2) continue;
      const got = familyListing(par, v.model);
      if (!got) continue;
      kids.sort((a, b) => a.x - b.x);
      notes.push({
        text: `годы — по порядку ${got.text}, выв.`, x: kids[0].x, y: kids[0].y, at: 'kids',
        kids: kids.map((k) => ({ x: k.x, y: k.y, r: radius(k.id), id: k.id })),
        hit: { kind: 'order', parent: par, mother: null, kids: kids.map((k) => k.id), source: got.text },
      });
    }
  collectMarriages(v, p, notes);
  // подписи призраков жён — на масштабе семьи
  if (L.ghosts && cam.ky >= 12)
    for (const i of p.vis) {
      const n = v.nodes[i];
      if (!n.ghost) continue;
      const ri = v.indexOf(n.person);
      const husband = n.satelliteOf ?? (ri !== undefined ? v.nodes[ri].satelliteOf : null) ?? byId.get(n.person)?.spouses[0]?.id ?? null;
      const q = byId.get(n.person);
      if (!q) continue;
      notes.push({ text: ghostNote(n.person, husband), x: cam.sx(v.X0[i]), y: cam.sy(starLaneOf(n)), at: 'star', r: starRadius(q.magnitude, p.zoomScale) });
    }
  return notes;
}

/**
 * Брак (MAP-22): знак «‖» от следа мужа к жене-спутнице в год первого общего ребёнка (или рядом со звездой жены,
 * если детей нет). Жена ближе трёх полос — знак во всю высоту; дальше — знак 8 px и тонкая выноска. Супруги
 * выбранного лица — ярко. Знак ставится после подписей звёзд (drawFamilyNotes): он занимает место, как подпись (MAP-76).
 */
function collectMarriages(v: SkyContext, p: Pass, out: FamilyNote[]) {
  const { ctx, cam, pal } = v;
  const hl = p.s.highlight;
  for (const i of p.vis) {
    const n = v.nodes[i];
    // призрак бездетного брака (решение 173) — без знака «‖»: его брак рисует черта союза (links.ts, LinkPath.childless)
    if (!n.satelliteOf || n.ghost) continue;
    // пара с точкой союза на небе «набор» (решение 76): супругов соединяют скобки к точке — знака «‖» нет
    if (p.unionPairs?.has(`${n.satelliteOf}|${n.person}`)) continue;
    const hi = v.indexOf(n.satelliteOf);
    if (hi === undefined || v.hides(n.satelliteOf)) continue;
    const fc = firstChild(v.model, n.satelliteOf, n.person);
    const xw = cam.sx(v.X0[i]);
    const x = fc !== null ? cam.sx(v.xOf(fc)) - 6 : Math.max(xw, cam.sx(v.X0[hi])) + 12;
    const lit = !!hl && hl.has(n.person) && hl.has(n.satelliteOf);
    const e = Math.min(p.emph(n.person), p.emph(n.satelliteOf)) * p.s.intro;
    out.push({
      at: 'marriage',
      x: Math.max(x, xw + 6),
      xMin: xw + 6,
      yH: cam.sy(laneAt(v.nodes[hi], fc ?? n.t0)),
      yW: cam.sy(laneAt(n, fc ?? n.t0)),
      near: cam.ky * 3.2,
      color: lit ? alpha(pal.ink, Math.min(1, e)) : alpha(pal.ink3, 0.8 * e),
      alpha: ctx.globalAlpha,
      wife: n.person,
    });
  }
}

/**
 * Места знака брака (MAP-76): у года первого ребёнка, затем правее и левее вдоль следов. Ближней жене — сначала знак
 * во всю высоту; где он лёг бы на подпись — знак 8 px с выноской, как у дальней. Знак 8 px сдвигается вдоль выноски:
 * от следа мужа, затем от жены.
 */
function marriageSpots(m: MarriageMark): { x: number; from?: number; box: Rect }[] {
  const out: { x: number; from?: number; box: Rect }[] = [];
  const dir = Math.sign(m.yW - m.yH) || 1;
  const gap = Math.abs(m.yW - m.yH);
  const far = gap > m.near;
  const xs = [0, 6, 12, 18, 24, 30, -6, -12].map((dx) => Math.round(m.x + dx) + 0.5).filter((x) => x >= m.xMin);
  if (!far) for (const x of xs) out.push({ x, box: { x: x - 2.5, y: Math.min(m.yH, m.yW), w: 5, h: gap } });
  if (gap < 12) return out;
  for (const x of xs) {
    const froms: number[] = [];
    for (let k = 0; k * 8 + 8 <= gap - 2 && k < 6; k++) froms.push(m.yH + dir * k * 8, m.yW - dir * (k * 8 + 8));
    for (const from of froms) out.push({ x, from, box: { x: x - 2.5, y: Math.min(from, from + dir * 8), w: 5, h: 8 } });
  }
  return out;
}

/**
 * Пометы семей после подписей звёзд (E4): «от Лии» у корня гребёнки, «годы — по порядку …» у детей, «Рахиль, жена
 * Иакова» у призрака, знаки брака. Проходят ту же проверку наложений, что подписи звёзд (labels.ts, claim): ставятся
 * только на свободное место и попадают в замер подписей. Пометы — сначала там, где не легли бы на линии кадра.
 */
export function drawFamilyNotes(v: SkyContext, p: Pass, notes: readonly FamilyNote[]) {
  drawBranchTicks(v, p);
  placeNotes(v, p, notes);
}

/**
 * Подписи призраков жён на масштабе семьи — «Рахиль, жена Иакова» (ТЗ § 3.1, UX-34): призрак в родном роду читается
 * как та же жена. Этап 11 убрал с неба пометы гребёнок (Г8, Г9), подписи призраков остаются; ставятся после подписей звёзд.
 */
export function drawGhostNotes(v: SkyContext, p: Pass) {
  const { cam } = v;
  if (!p.s.layers.ghosts || cam.ky < 12) return;
  const notes: FamilyNote[] = [];
  for (const i of p.vis) {
    const n = v.nodes[i];
    // призраки и их подписи — на масштабе семьи (решение 178); у выделенных (семья выбранного) — и раньше
    const k = p.s.highlight?.get(n.person);
    if (!n.ghost || !(p.tier >= 2 || (k !== undefined && k !== 'sure' && k !== 'likely')) || p.starAlpha(i) < 0.5) continue;
    const ri = v.indexOf(n.person);
    const husband = n.satelliteOf ?? (ri !== undefined ? v.nodes[ri].satelliteOf : null) ?? byId.get(n.person)?.spouses[0]?.id ?? null;
    const q = byId.get(n.person);
    if (!q) continue;
    notes.push({ text: ghostNote(n.person, husband), x: cam.sx(v.X0[i]), y: cam.sy(starLaneOf(n)), at: 'star', r: starRadius(q.magnitude, p.zoomScale) });
  }
  placeNotes(v, p, notes);
}

function placeNotes(v: SkyContext, p: Pass, notes: readonly FamilyNote[]) {
  if (!notes.length) return;
  const { ctx, pal } = v;
  const frame = frameOf(v, p);
  // знаки брака: место — через общую проверку наложений; не нашлось — знака нет, как нет и подписи (MAP-76)
  ctx.lineWidth = 1;
  for (const m of notes) {
    if (m.at !== 'marriage') continue;
    const spots = marriageSpots(m);
    const b = claim(v, p, spots.map((q) => q.box), 'mark', '‖', { id: m.wife });
    if (!b) continue;
    const q = spots[spots.findIndex((c) => c.box === b)];
    // выноска проходит под подписями: где она пересекла бы подпись, её нет (как под ореолом подписи)
    const skip: [number, number][] = v.ledger.boxes.filter((l) => l !== v.ledger.boxes[v.ledger.boxes.length - 1] && q.x >= l.x && q.x <= l.x + l.w).map((l) => [l.y, l.y + l.h]);
    const was = ctx.globalAlpha;
    ctx.globalAlpha = m.alpha;
    drawMarriage(ctx, { x: q.x, yH: m.yH, yW: m.yW, color: m.color, near: q.from === undefined ? m.near : 0, from: q.from, skip });
    ctx.globalAlpha = was;
  }
  if (!p.s.layers.labels) return;
  const size = mapSize(T_MAP_S, v.coarse);
  for (const nt of notes) {
    if (nt.at === 'marriage') continue;
    ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
    const w = ctx.measureText(nt.text).width;
    const r = nt.r ?? 3;
    const cands: { tx: number; ty: number }[] = [];
    if (nt.at === 'star') cands.push({ tx: nt.x + r + 4, ty: nt.y + size * 0.35 }, { tx: nt.x - r - 4 - w, ty: nt.y + size * 0.35 }, { tx: nt.x - w / 2, ty: nt.y + r + size + 1 });
    // у корня гребёнки: слева от ствола (и от звезды ребёнка, если она на стволе), на строке ребёнка
    else if (nt.at === 'root') {
      const k0 = nt.kids?.[0];
      cands.push({ tx: Math.min(nt.x - 4, k0 ? k0.x - k0.r - 5 : Infinity) - w, ty: nt.y + size * 0.35 });
    }
    // небо «набор» (решение 76): к детям слева идут линии от точки союза, помета слева от звезды легла бы на них и на
    // скобку от матери. Сперва — под подписью нижнего из детей и над подписью верхнего, от начала подписи (помета
    // читается как примечание к детям и не заходит в пучок линий), затем там же, но кончаясь у звезды, затем — у каждого
    // ребёнка под подписью и над ней
    const kin = nt.at === 'kids' && p.unionKids?.size ? (nt.kids ?? []) : [];
    const toUnionKids = kin.length > 0 && kin.every((k) => !!k.id && p.unionKids!.has(k.id));
    if (toUnionKids) {
      const byY = [...kin].sort((a, b) => a.y - b.y);
      // полувысота подписи ребёнка (labels.ts, spot и textBox: ±0,52 кегля и ореол) — помета встаёт вплотную под ней
      // или над ней
      const half = (k: (typeof byY)[number]) => Math.max(k.r, 0.52 * nameSize(byId.get(k.id ?? '')?.magnitude ?? 6, v.coarse) + 1.5) + 1.5;
      const under = (k: (typeof byY)[number], left = false) => ({ tx: left ? k.x - k.r - 4 - w : k.x + k.r + 4, ty: k.y + half(k) + 0.8 * size + 1.5 });
      const over = (k: (typeof byY)[number], left = false) => ({ tx: left ? k.x - k.r - 4 - w : k.x + k.r + 4, ty: k.y - half(k) - 0.24 * size - 1.5 });
      const bottom = byY[byY.length - 1];
      const top = byY[0];
      // линии от точки приходят к верхнему ребёнку снизу, к нижнему — сверху: над верхним и под нижним свободно и слева
      cands.push(under(bottom), over(top), over(top, true), under(bottom, true));
      for (const k of byY) cands.push(under(k), over(k));
    }
    // у детей (MAP-55): слева от звезды, под ней, над ней — у первого, затем у следующих
    for (const k of nt.kids ?? [])
      cands.push(
        { tx: k.x - k.r - 5 - w, ty: k.y + size * 0.35 },
        { tx: k.x - w / 2, ty: k.y + k.r + size + 2 },
        { tx: k.x - w - 2, ty: k.y + k.r + size + 2 },
        { tx: k.x - w / 2, ty: k.y - k.r - 5 },
      );
    // корень за краем окна: у видимой части ствола, от края к следу отца, но не у самого следа (там ленты, MAP-80)
    if (nt.stem) {
      const { y0, y1 } = nt.stem;
      const dir = Math.sign(y1 - y0) || 1;
      const top = v.openTop + size + 2;
      const bottom = v.cam.vp.b - 4;
      const from = Math.max(top, Math.min(bottom, y1 - dir * 2));
      for (let k = 0; k < 8; k++) {
        const ty = from - dir * k * (size + 4);
        if ((ty - y0) * dir < size + 6 || ty < top || ty > bottom) break;
        cands.push({ tx: nt.x - 4 - w, ty }, { tx: nt.x + 4, ty });
      }
    }
    const all = cands.map((c) => ({ c, box: textBox(c.tx, c.ty, w, size) }));
    // у корня гребёнки — первым (там помету читают как пометку ребёнка; ореол гасит под ней чужой ствол), дальше —
    // сначала места, где помета не ложится на следы и стволы
    const first = nt.at === 'root' ? all.slice(0, 1) : [];
    const rest = all.slice(first.length);
    const clean = p.lines ? rest.filter((q) => !p.lines!.clash(q.box, false)) : rest;
    // чистого места нет — сначала там, где линии под пометой короче (в небе «набор» к детям идут косые линии от точки
    // союза: помета на такой линии закрыла бы её почти целиком). У детей союза с точкой — только чистое место: помета
    // с ореолом легла бы поверх цветной линии к ребёнку или скобки от матери; нет места — пометы нет (год ребёнка
    // объясняет подсказка звезды и карточка, § 8)
    const dirty = toUnionKids ? [] : rest.filter((q) => !clean.includes(q));
    if (p.lines && p.unionKids?.size) {
      const area = new Map(dirty.map((q) => [q, p.lines!.overlap(q.box)]));
      dirty.sort((a, b) => area.get(a)! - area.get(b)!);
    }
    const order = [...first, ...clean, ...dirty];
    const b = claim(v, p, order.map((q) => q.box), 'note', nt.text);
    if (!b) continue;
    const c = order.find((q) => q.box === b)!.c;
    if (nt.hit) frame.boxes.push({ r: b, hit: nt.hit });
    drawFamilyText(ctx, pal, nt.text, c.tx, c.ty, v.coarse);
  }
  ctx.lineWidth = 1;
}

/**
 * Метки ветвей (решение 69): когда у выбранного лица ветвей две и больше, под началом подписи первого ребёнка каждой
 * ветви — короткая черта цвета ветви (branches.ts, branchTickAt). Черта лежит в прямоугольнике самой подписи и места
 * не занимает; нет подписи ни у одного ребёнка ветви — нет и метки. Рисуется после подписей звёзд. Для проверок
 * приёмки (tools/accept/colors4.ts) кадр пишет canvas[data-branches]: выбранное лицо, число ветвей, сколько лиц
 * нарисовано цветом, метки и ветви лиц первых трёх поколений в кадре.
 */
export function drawBranchTicks(v: SkyContext, p: Pass) {
  const bf = branchFrame(v, p);
  const map = bf.map;
  const ticks: Record<string, number> = {};
  if (map && map.keys.length >= 2 && p.s.layers.labels) {
    const boxes = new Map<string, Rect>();
    for (const b of v.ledger.boxes) if (b.kind === 'star' && b.id && !boxes.has(b.id)) boxes.set(b.id, b);
    const { ctx } = v;
    map.heads.forEach((kids, branch) => {
      const id = kids.find((k) => boxes.has(k) && bf.paint(k));
      if (!id) return;
      const bp = bf.paint(id)!;
      const r = branchTickAt(boxes.get(id)!);
      ctx.fillStyle = alpha(bp.color, Math.min(1, p.s.intro));
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ticks[id] = branch;
    });
  }
  const ds = (v.ctx.canvas as { dataset?: DOMStringMap } | undefined)?.dataset;
  if (!ds) return;
  if (!map || !bf.shown.size) {
    if (ds.branches !== undefined) delete ds.branches;
    return;
  }
  const gen: Record<string, [number, number]> = {};
  let n = 0;
  for (const id of bf.shown) {
    const b = map.desc.get(id);
    if (!b || b.gen > 3 || n >= 80) continue;
    gen[id] = [b.branch, b.gen];
    n++;
  }
  const colors = map.keys.slice(0, 16).map((_, i) => branchOrTribeColor(map.id, map.keys, i, bf.theme));
  const out = JSON.stringify({ sel: map.id, n: map.keys.length, shown: bf.shown.size, ticks, colors, gen });
  if (ds.branches !== out) ds.branches = out;
}

/**
 * Помета семьи («от Лии», «годы — по порядку …», «Рахиль, жена Иакова»): курсив малого кегля карты с ореолом цвета
 * неба, базовая линия ty. Той же функцией помету рисует образец в «Как читать карту».
 */
export function drawFamilyText(ctx: CanvasRenderingContext2D, pal: Pick<Palette, 'halo' | 'ink3'>, text: string, tx: number, ty: number, coarse = false) {
  ctx.font = mapFont(T_MAP_S, { italic: true, coarse });
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.halo;
  ctx.lineWidth = 3;
  ctx.strokeText(text, tx, ty);
  ctx.fillStyle = pal.ink3;
  ctx.fillText(text, tx, ty);
}

// ---------- связи кадра (этап 11, § 2; геометрия — src/render/links.ts) ----------

/**
 * Связи кадра и что из них рисуется (sky.ts, linksFor): длинные связи — целиком или обрывками (Г11), наведённая
 * и подсвеченные строкой «Родство» — полной яркостью и на 1 px толще (§ 8), выбранную рисует marks.ts поверх неба.
 */
export interface LinkDraw {
  frame: LinkFrame;
  /** сдвиг неба с построения связей, px холста */
  dx: number;
  dy: number;
  /** союзы, чьи длинные связи и родовые черты видны целиком: наведённая и выбранная связь, семья выбранного (Г11) */
  expanded: ReadonlySet<string>;
  /** записи ключей (linkKeyString): связь под указателем, подсвеченные строкой «Родство», выбранная */
  hover: string;
  preview: ReadonlySet<string>;
  selected: string;
  /** подробность кадра по времени: связи проявляются с ней (семантическое увеличение, E3) */
  alpha: number;
  /** путь выделен (семья выбранного, путь родства, «только линии»): в полную силу при любой подробности */
  lit: (q: LinkPath) => boolean;
  /**
   * ярус и видимость пути в этом кадре (этап 14, решение 135; linkLooks): ставит небо (sky.ts, linksFor); без него — по
   * прежнему правилу (подробность кадра или выделение)
   */
  look?: (q: LinkPath) => LinkLook;
  /**
   * союзы, чьи длинные связи целиком помещаются в окне (оба конца на экране): рисуются целиком, без обрывков и координат
   * (этап 14, решение 136, G7); ставит linkLooks по окну кадра с гистерезисом 10 %
   */
  inView?: ReadonlySet<string>;
}

// ---------- ярусы связей (этап 14, решение 135; уточняет решение 25) ----------

/**
 * Ярус связи: 0 — главный (родители, союзы и дети выбранного, выбранная связь, путь родства), 1 — второй (род выбранного
 * со второго поколения и связи структурных лиц: величина ≤ 2, лица лент), 2 — контекстный (остальные).
 */
export type LinkTier = 0 | 1 | 2;
export interface LinkLook {
  tier: LinkTier;
  /** непрозрачность по ярусу и порогу подписи: 0 — путь не рисуется, не ловится и разрывов не даёт */
  a: number;
}
/** Зубец короче этого (px) на пересечениях не прерывается — прерывается пересекающая линия (решение 166). */
export const SHORT_TOOTH = 40;
const shortTooth = (q: LinkPath) => {
  if (q.kind !== 'tooth' || q.pts.length < 4) return false;
  let len = 0;
  for (let k = 0; k + 3 < q.pts.length; k += 2) len += Math.hypot(q.pts[k + 2] - q.pts[k], q.pts[k + 3] - q.pts[k + 1]);
  return len < SHORT_TOOTH;
};
/** Толщина линии яруса, px: главный — 1,75 с ореолом цвета неба, второй и контекстный — 1 (G10). */
export const TIER_WIDTH: Readonly<Record<LinkTier, number>> = { 0: 1.75, 1: 1, 2: 1 };
/** Ореол главного яруса — с каждой стороны линии, px. */
export const TIER_HALO = 1.5;
/** Структурное лицо (второй ярус и на обзоре): величина не больше этой или лицо линий Мессии. */
export const STRUCT_MAG = 2;
/** Уровень порога подписи для лиц без порога (скопления-списки, «не подписывается по порогу»): масштаб семьи. */
const NO_LEVEL = 10;
/** Связь проявляется по порогу подписи своего лица в полосе уровней (2·log2 масштаба) — плавно, без мигания. */
const TIER_RAMP = 0.4;

/**
 * Ярусы связей кадра (решение 135): функция «путь → ярус и непрозрачность». Главный и род выбранного — в полную силу на
 * любом масштабе; остальные (структурные и контекстные) видны, когда на этом масштабе видна подпись их лица — ребёнка
 * связи (у черты брака — второго супруга): пороги подписей уже посчитаны (labels.ts, LabelCache), поэтому гребёнки
 * списков 1 Пар уходят вместе с именами, а структура остаётся. Режим «В работе» — всё в полную силу. Одна проверка
 * порога на путь, с памятью на кадр.
 */
export function linkLooks(v: SkyContext, p: Pass, d: Pick<LinkDraw, 'lit' | 'selected'> & Partial<Pick<LinkDraw, 'frame' | 'dx' | 'dy' | 'inView'>>): (q: LinkPath) => LinkLook {
  const s = p.s;
  if (d.frame) d.inView = unionsInView(v, d as Pick<LinkDraw, 'frame' | 'dx' | 'dy'>);
  const sel = s.selected;
  // прямые связи выбранного: его союзы целиком; союз его родителей — путь к нему и черта брака; так же шаги пути родства
  const mainU = new Set<string>();
  const toKid = new Map<string, Set<string>>();
  const kidOfU = (u: string, kid: string) => (toKid.get(u) ?? toKid.set(u, new Set()).get(u)!).add(kid);
  if (sel && s.highlight?.get(sel) === 'self') {
    for (const u of ALL_UNIONS.of.get(sel) ?? []) mainU.add(u.id);
    for (const u of ALL_UNIONS.origin.get(sel) ?? []) kidOfU(u.id, sel);
  }
  for (const st of s.kinSteps ?? []) {
    if (st.kind !== 'up' && st.kind !== 'down') continue;
    const [par, kid] = st.kind === 'down' ? [st.from, st.to] : [st.to, st.from];
    for (const u of ALL_UNIONS.origin.get(kid) ?? []) if (u.a === par || u.b === par) kidOfU(u.id, kid);
  }
  const link = s.link;
  if (link && (link.kind === 'child' || link.kind === 'union' || link.kind === 'spouse')) mainU.add(link.union);
  const work = p.work;
  let cache: LabelCache | null = null;
  if (!work) {
    v.labelCache.ensure(v);
    cache = v.labelCache;
  }
  const level = p.level;
  /**
   * доля видимости подписи лица на этом масштабе (0…1): линия проявляется плавно в полосе уровней до порога подписи —
   * без мигания и без памяти кадров (два одинаковых кадра одинаковы)
   */
  const shown = (id: string): number => {
    const i = v.indexOf(id);
    if (i === undefined || !v.drawn(i)) return 0;
    const L0 = cache ? cache.level[i] : 0;
    const L = Number.isFinite(L0) ? L0 : NO_LEVEL;
    return Math.max(0, Math.min(1, (level - (L - TIER_RAMP)) / TIER_RAMP));
  };
  const structural = (id: string) => {
    const q = byId.get(id);
    return !!q && (q.magnitude <= STRUCT_MAG || p.spine.has(id));
  };
  /** лица, по чьим подписям видна связь: ребёнок; у ствола — дети союза на нём; у черты брака — второй супруг */
  const subjects = (q: LinkPath): string[] => {
    if (q.key.kind === 'child') return [q.key.child];
    if (q.key.kind === 'spouse') return q.ends.slice(0, 1);
    const u = q.union ? ALL_UNIONS.byId.get(q.union) : undefined;
    if (!u) return q.ends.slice(-1);
    const kids = q.ends.filter((e) => e !== u.a && e !== u.b);
    if (kids.length) return kids;
    const onSky = u.kids.filter((k) => v.indexOf(k) !== undefined);
    // бездетный брак — по подписям супругов
    return onSky.length ? onSky : [u.a, u.b].filter((x): x is string => !!x);
  };
  const memo = new Map<LinkPath, LinkLook>();
  // ярус пути и лица, по чьим подписям он виден, от масштаба не зависят: они держатся на сборку кадра (и на её копии,
  // пересчитанные движением масштаба; С1), пока выбор, путь родства и выбранная связь те же; от масштаба — только доля
  // видимости подписи, она считается каждый кадр
  const held = d.frame?.stamp ? heldClasses(d.frame, `${work ? 1 : 0}|${sel ?? ''}|${idOf(s.highlight)}|${idOf(s.kinSteps)}|${idOf(link)}|${d.selected}`) : null;
  const classOf = (q: LinkPath): PathClass => {
    const kids = q.union ? toKid.get(q.union) : undefined;
    const main = (!!q.union && mainU.has(q.union)) || (!!d.selected && q.ks === d.selected) || (!!kids && (q.kind === 'bar' || q.ends.some((e) => kids.has(e))));
    if (main) return { tier: 0, subj: null };
    if (d.lit(q)) return { tier: 1, subj: null };
    const subj = subjects(q);
    return { tier: subj.some(structural) ? 1 : 2, subj };
  };
  return (q) => {
    const got = memo.get(q);
    if (got) return got;
    const k = held ? held.index(q) : -1;
    let c = k >= 0 ? held!.classes[k] : undefined;
    if (!c) {
      c = classOf(q);
      if (k >= 0) held!.classes[k] = c;
    }
    let out: LinkLook;
    // путь рода выбранного (lineageOf) — в полную силу на любом масштабе: его видят и рисование, и подписи (препятствие),
    // и разрывы пересечений
    if (!c.subj || work || lineageOf(p, q)) out = { tier: c.tier, a: 1 };
    else {
      // по порогам подписей лиц связи, как на этапе 14 (решение 190: уровни подробности 178 сняты вместе с «Отчим домом»)
      let a = 0;
      for (const id of c.subj) a = Math.max(a, shown(id));
      out = { tier: c.tier, a };
    }
    memo.set(q, out);
    return out;
  };
}

/** Ярус пути без доли видимости: главный и род выбранного (subj = null) — в полную силу, прочие — по подписям subj. */
interface PathClass {
  tier: LinkTier;
  subj: string[] | null;
}
/** Номер объекта для ключа кэша (выбор, путь родства, выбранная связь — новые объекты при смене). */
const ids = new WeakMap<object, number>();
let idNext = 1;
const idOf = (o: object | null | undefined) => (o ? (ids.get(o) ?? (ids.set(o, idNext++), idNext - 1)) : 0);
/** Ярусы путей сборки (по знаку stamp) при одном ключе: номер пути → класс; номер пути в кадре — по его положению. */
const heldCache = new WeakMap<object, { key: string; classes: (PathClass | undefined)[] }>();
function heldClasses(f: LinkFrame, key: string): { classes: (PathClass | undefined)[]; index: (q: LinkPath) => number } {
  let h = heldCache.get(f.stamp!);
  if (!h || h.key !== key) heldCache.set(f.stamp!, (h = { key, classes: [] }));
  return { classes: h.classes, index: (q) => (q.n !== undefined && f.paths[q.n] === q ? q.n : -1) };
}

/** Союзы, чей дальний ход задевает чужую звезду (links.ts, markBlocked): по окну не раскрываются. */
const blockedCache = new WeakMap<object, Set<string>>();
function blockedUnions(f: LinkFrame): Set<string> {
  // на сборку: копии, пересчитанные движением масштаба, — те же пути (С1)
  const key = f.stamp ?? f;
  let b = blockedCache.get(key);
  if (!b) {
    b = new Set();
    for (const q of f.paths) if (q.blocked && q.union) b.add(q.union);
    blockedCache.set(key, b);
  }
  return b;
}

/** Союзы, чьи длинные связи были целиком в окне в прошлом кадре (гистерезис 10 %). */
const wasInView = new Set<string>();

/**
 * Союзы с длинными связями (обрывки Г11, длинная черта брака), у которых все концы обрывков в окне неба: их связи —
 * целиком (решение 136, G7: читатель не ищет по координате лицо, которое стоит в 200 px). Окно — видимая часть неба;
 * союз, уже раскрытый так, держится, пока концы не уйдут за край дальше 10 % окна (гистерезис, как у подписей).
 */
/** Правило окна (решение 136) — включено; перепись «всего неба» на холсте во всё небо его выключает (там окно — всё небо). */
export const windowRule = { on: true };

function unionsInView(v: SkyContext, d: Pick<LinkDraw, 'frame' | 'dx' | 'dy'>): Set<string> {
  if (!windowRule.on) return new Set();
  const blocked = blockedUnions(d.frame);
  const vp = v.cam.vp;
  const w = vp.r - vp.l;
  const h = vp.b - Math.max(vp.t, v.openTop);
  const out = new Set<string>();
  const bad = new Set<string>();
  for (const st of d.frame.stubs) {
    if (!st.union || st.kind === 'kid') continue;
    if (bad.has(st.union) || blocked.has(st.union)) continue;
    const m = wasInView.has(st.union) ? 0.1 : -0.05;
    const x = st.x + d.dx;
    const y = st.y + d.dy;
    if (x >= vp.l - m * w && x <= vp.r + m * w && y >= Math.max(vp.t, v.openTop) - m * h && y <= vp.b + m * h) out.add(st.union);
    else bad.add(st.union);
  }
  for (const u of bad) out.delete(u);
  wasInView.clear();
  for (const u of out) wasInView.add(u);
  return out;
}

/** Ярус и видимость пути: по d.look, а без него — по прежнему правилу (подробность кадра или выделение). */
const lookCache = new WeakMap<object, (q: LinkPath) => LinkLook>();
export function lookOf(v: SkyContext, p: Pass, d: LinkDraw): (q: LinkPath) => LinkLook {
  if (d.look) return d.look;
  let f = lookCache.get(d);
  if (!f) lookCache.set(d, (f = linkLooks(v, p, d)));
  return f;
}

// ---------- след родителя до узла — тоже связь (этап 14, решение 159) ----------

/**
 * Станции связей на участке следа родителя: x узлов его союзов на этом участке (горизонталь одного пребывания, решение
 * 173), px кадра связей.
 */
interface TrailStations {
  person: string;
  /** начало участка: звезда родителя (первое пребывание) или конец перехода в это пребывание, px кадра */
  x: number;
  y: number;
  /** радиус знака у звезды (первое пребывание); у пребывания после перехода — 0 */
  r: number;
  /** союзы по порядку x станций */
  st: { x: number; union: string }[];
}
const stationCache = new WeakMap<LinkFrame, Map<number, TrailStations[]>>();

/**
 * Станции связей на следах родителей кадра (решение 159): у каждого родителя — x узлов его союзов на его следе и начал
 * линий его союзов на его строке (черта брака к узлу на следе жены, ступенька лестницы союзов). След с переходами
 * (решение 173) делится на участки по пребываниям: станции считаются на своём участке, от его начала. Один раз на кадр
 * связей, по строкам.
 */
function stationsOf(v: SkyContext, d: LinkDraw): Map<number, TrailStations[]> {
  let m = stationCache.get(d.frame);
  if (m) return m;
  m = new Map();
  const { cam } = v;
  const per = new Map<string, TrailStations>();
  const shapes = new Map<string, { x: number; y: number; r: number; bends: Bend[] | null } | null>();
  const shapeOf = (id: string) => {
    if (shapes.has(id)) return shapes.get(id)!;
    const i = v.indexOf(id);
    const q = byId.get(id);
    let out: { x: number; y: number; r: number; bends: Bend[] | null } | null = null;
    if (i !== undefined && q && v.drawn(i) && !v.hides(id)) {
      const n = v.nodes[i];
      // переходы — в px кадра связей (без сдвига кадра)
      const bends = bendsOf(v, n)?.map((g) => ({ xa: g.xa - d.dx, xb: g.xb - d.dx, ya: g.ya - d.dy, yb: g.yb - d.dy, pts: g.pts.map((c, k) => c - (k % 2 ? d.dy : d.dx)) })) ?? null;
      out = { x: cam.sx(v.X0[i]) - d.dx, y: cam.sy(starLaneOf(n)) - d.dy, r: starRadius(q.magnitude, 1) + (q.sex === 'f' ? 2.2 : 0), bends };
    }
    shapes.set(id, out);
    return out;
  };
  /** участок следа лица id над x на высоте y (px кадра): его станции; null — там не горизонталь его следа */
  const of = (id: string, x: number, y: number): TrailStations | null => {
    const sh = shapeOf(id);
    if (!sh) return null;
    let x0 = sh.x;
    let y0 = sh.y;
    let first = true;
    for (const g of sh.bends ?? []) {
      if (x < g.xa) break;
      if (x <= g.xb) return null;
      x0 = g.xb;
      y0 = g.yb;
      first = false;
    }
    if (Math.abs(y - y0) >= 0.75) return null;
    const key = `${id}@${Math.round(y0 * 4)}`;
    let t = per.get(key);
    if (!t) per.set(key, (t = { person: id, x: x0, y: y0, r: first ? sh.r : 0, st: [] }));
    return t;
  };
  const add = (t: TrailStations, x: number, union: string) => {
    // у союза с несколькими гнёздами (ромб ◆ и узлы • дальше по следу) станция — последняя: след до неё — тоже путь
    // этого союза (к детям следующих гнёзд)
    const was = t.st.find((q) => q.union === union);
    if (was) was.x = Math.max(was.x, x);
    else t.st.push({ x, union });
  };
  for (const n of d.frame.nodes) {
    // узел союза, чью связь рисует только лента (станция маршрута ленты, решение 79): след до него — это шаг ленты, а
    // не связь союза; её ловит нарисованная нить (ribbons.ts, ribbonAt)
    if (n.kind !== 'union' || d.frame.ribbonOnly?.has(n.union)) continue;
    const t = of(n.owner, n.x, n.y);
    if (t && n.x > t.x) add(t, n.x, n.union);
  }
  for (const q of d.frame.paths) {
    if (!q.union || q.kind === 'ribbon' || q.when === 'full') continue;
    const u = ALL_UNIONS.byId.get(q.union);
    if (!u) continue;
    for (const par of [u.a, u.b]) {
      if (!par) continue;
      for (let k = 0; k + 1 < q.pts.length; k += 2) {
        const t = of(par, q.pts[k], q.pts[k + 1]);
        if (t && q.pts[k] > t.x + t.r) add(t, q.pts[k], q.union);
      }
    }
  }
  for (const t of per.values()) {
    if (!t.st.length) continue;
    t.st.sort((a, b) => a.x - b.x);
    const k = Math.round(t.y);
    (m.get(k) ?? m.set(k, []).get(k)!).push(t);
  }
  stationCache.set(d.frame, m);
  return m;
}

/**
 * Связи по участку следа родителя под точкой (решение 159; x, y — px холста, r — допуск, как у связей): от звезды (или
 * от прежнего узла) до узла союза след родителя — это его путь к союзу (по нему идёт жёлтое выбранной связи, решение
 * 88). Возвращает лицо и ключи связей, чьи узлы дальше по следу (по порядку): одна — подсказка и выбор этой связи;
 * несколько — «Связи дальше по следу» и «Какая связь?». За последним узлом — null: там жизнь лица. Ключ — связь
 * «союз → ребёнок», если у союза один ребёнок на небе, иначе союз целиком.
 */
export function trailLinksAt(v: SkyContext, d: LinkDraw | null | undefined, x: number, y: number, r = 6): { person: string; keys: LinkKey[] } | null {
  if (!d) return null;
  const fx = x - d.dx;
  const fy = y - d.dy;
  const rows = stationsOf(v, d);
  let best: { t: TrailStations; dy: number } | null = null;
  for (let k = Math.floor(fy - r) - 1; k <= Math.ceil(fy + r) + 1; k++)
    for (const t of rows.get(k) ?? []) {
      const dy = Math.abs(t.y - fy);
      if (dy > r || fx < t.x + t.r + 2 || fx > t.st[t.st.length - 1].x - 1) continue;
      if (!best || dy < best.dy) best = { t, dy };
    }
  if (!best) return null;
  // участок следа, по которому идёт маршрут ленты (от звезды до узла шага; на масштабе семьи), — шаг ленты: лента и
  // есть связь (решение 79), её ловит нарисованная нить, а не союз по следу
  if (v.routeFactor >= 0.5)
    for (const [pk, vv] of d.frame.via) if (pk.startsWith(`${best.t.person}>`) && fx <= vv.x + 1) return null;
  const keys: LinkKey[] = [];
  for (const s of best.t.st) {
    if (s.x < fx) continue;
    const u = ALL_UNIONS.byId.get(s.union);
    // связь, не нарисованная в этом кадре (ярус погашен), — не цель
    if (!u || !unionOn(d, u.id, best.t.person, best.t.person)) continue;
    const kids = u.kids.filter((k) => {
      const i = v.indexOf(k);
      return i !== undefined && v.drawn(i) && !v.hides(k);
    });
    keys.push(kids.length === 1 ? { kind: 'child', union: u.id, child: kids[0] } : { kind: 'union', union: u.id });
  }
  return keys.length ? { person: best.t.person, keys } : null;
}

/** Пути кадра связей по союзам (один раз на кадр связей). */
const byUnionCache = new WeakMap<LinkFrame, Map<string, LinkPath[]>>();
export function pathsOfUnion(f: LinkFrame, u: string): readonly LinkPath[] {
  let m = byUnionCache.get(f);
  if (!m) {
    m = new Map();
    for (const q of f.paths) if (q.union && q.kind !== 'ribbon') (m.get(q.union) ?? m.set(q.union, []).get(q.union)!).push(q);
    byUnionCache.set(f, m);
  }
  return m.get(u) ?? [];
}

/**
 * Видимость узла союза в этом кадре (решение 135): как у самой видимой его линии — наведённой, выделенной или по ярусу;
 * союз без своих линий (станция ленты, бездетный брак) — по своим лицам: по ярусу их связи «союз».
 */
export function unionAlpha(v: SkyContext, p: Pass, d: LinkDraw, u: string): { a: number; tier: LinkTier } {
  const look = lookOf(v, p, d);
  let a = 0;
  let tier: LinkTier = 2;
  const qs = pathsOfUnion(d.frame, u);
  for (const q of qs) {
    if (!linkShown(q, d)) continue;
    if (q.ks === d.hover || d.preview.has(q.ks)) return { a: 1, tier: 0 };
    const l = look(q);
    if (l.a > a) a = l.a;
    if (l.a > 0.01 && l.tier < tier) tier = l.tier;
  }
  if (!qs.length) {
    const un = ALL_UNIONS.byId.get(u);
    if (un) {
      const l = look({ key: { kind: 'union', union: u }, ks: `u:${u}`, kind: 'trunk', style: 'solid', pts: [], ends: [un.a, un.b, ...un.kids].filter((x): x is string => !!x), union: u, when: 'always', cuts: [] });
      return { a: l.a, tier: l.tier };
    }
  }
  return { a, tier };
}

/** Путь обрывка у подписи обрывка (тот же ключ, конец в точке подписи): подпись видна, только когда виден он (G6). */
const stubPathCache = new WeakMap<LinkFrame, Map<string, LinkPath>>();
export function stubPathOf(f: LinkFrame, st: StubMark): LinkPath | null {
  // у сборки — по номерам (обрывок → путь): копии, пересчитанные движением масштаба, его делят (С1)
  if (f.stamp && st.n !== undefined && f.stubs[st.n] === st) {
    let byN = stubIndexCache.get(f.stamp);
    if (!byN) {
      const m = stubMap(f);
      byN = f.stubs.map((s) => m.get(`${s.ks}@${Math.round(s.x)},${Math.round(s.y)}`)?.n ?? -1);
      stubIndexCache.set(f.stamp, byN);
    }
    const k = byN[st.n];
    return k >= 0 ? (f.paths[k] ?? null) : null;
  }
  return stubMap(f).get(`${st.ks}@${Math.round(st.x)},${Math.round(st.y)}`) ?? null;
}
const stubIndexCache = new WeakMap<object, number[]>();
function stubMap(f: LinkFrame): Map<string, LinkPath> {
  let m = stubPathCache.get(f);
  if (!m) {
    m = new Map();
    for (const q of f.paths) {
      if (q.kind !== 'stub' && !(q.kind === 'clan' && q.when !== 'full')) continue;
      for (let k = 0; k + 1 < q.pts.length; k += 2) m.set(`${q.ks}@${Math.round(q.pts[k])},${Math.round(q.pts[k + 1])}`, q);
    }
    stubPathCache.set(f, m);
  }
  return m;
}

/** Узел союза нарисован в этом кадре по ярусу его линий (для переписи и проверок; без кадра — прежнее правило). */
export function unionOn(d: LinkDraw, u: string, owner: string, from: string): boolean {
  const f = d.look ?? lookCache.get(d);
  if (!f) return d.alpha > 0.01 || d.lit({ ends: [owner, from] } as unknown as LinkPath);
  const qs = pathsOfUnion(d.frame, u);
  if (!qs.length) return true;
  if (d.lit({ ends: [owner, from] } as unknown as LinkPath)) return true;
  let a = 0;
  for (const q of qs) {
    if (!linkShown(q, d)) continue;
    if (q.ks === d.hover || d.preview.has(q.ks)) return true;
    const l = f(q);
    if (l.tier === 0 && l.a > 0.01) return true;
    a = Math.max(a, l.a);
  }
  // как у знака (plates.ts, drawLinkNodes): на обзоре ромбы проявляются с подробностью кадра
  return Math.min(a, d.alpha) > 0.01;
}

/**
 * Путь нарисован в этом кадре: по правилу длинных связей (linkShown) и ярусу (решение 135). Без d.look — прежнее правило:
 * при подробности кадра или выделенным. Им пользуются попадание, разрывы следов, журнал кадра и перепись.
 */
export function linkOn(q: LinkPath, d: LinkDraw): boolean {
  if (!linkShown(q, d)) return false;
  if (q.ks === d.hover || d.preview.has(q.ks)) return true;
  const f = d.look ?? lookCache.get(d);
  return f ? f(q).a > 0.01 : d.alpha > 0.01 || d.lit(q);
}

/**
 * Путь рисуется в этом кадре: «всегда» — да; длинная связь целиком ('full') — только раскрытой (наведение, выбор, семья
 * выбранного), её обрывки ('short') — только свёрнутой.
 */
export function linkShown(q: Pick<LinkPath, 'when' | 'union' | 'ks'>, d: Pick<LinkDraw, 'expanded' | 'hover' | 'selected' | 'preview' | 'inView'>): boolean {
  if (q.when === 'always') return true;
  const open = (!!q.union && (d.expanded.has(q.union) || !!d.inView?.has(q.union))) || q.ks === d.hover || q.ks === d.selected || d.preview.has(q.ks);
  return q.when === 'full' ? open : !open;
}

/** Начертание связи (Г10): сплошная — Писание; штрих [5, 3] — иное происхождение; точки [1, 3] — толкование. */
export const LINK_DASH: Record<PathStyle, number[]> = { solid: [], dash: [5, 3], dots: [1, 3], faint: [] };
/** Радиус кольца-призрака на конце обрывка наружу показа (К8), px. */
export const STUB_GHOST_R = 3.5;
/** Бледная сплошная (родовая черта народа, Г12; решение 94): доля непрозрачности обычной линии. */
export const FAINT_A = 0.5;
/** Черта брака «‖»: две черты 1 px, между осями 3,2 px (K1 § 2.2). */
export const BAR_GAP = 3.2;
/**
 * Черта брака по виду союза (решение 174; links.ts, LinkPath.bar): жена — двойная «‖», наложница — одинарная «|»,
 * левират — двойная штрихом (штрих — «по закону», решение 138: начертание даёт style 'dash'), брак в Писании не назван
 * (союз виден только через детей: Иуда и Фамарь, Лот и дочери) — тонкая одинарная. Без вида — «‖», как прежде.
 */
export const barOffsets = (q: Pick<LinkPath, 'kind' | 'bar'>): number[] => (q.kind !== 'bar' ? [0] : q.bar === 'concubine' || q.bar === 'none' ? [0] : [-BAR_GAP / 2, BAR_GAP / 2]);
/** Тонкая черта «брак не назван» — доля толщины линии яруса. */
export const BAR_THIN = 0.6;
export const barWidth = (q: Pick<LinkPath, 'kind' | 'bar'>): number => (q.kind === 'bar' && q.bar === 'none' ? BAR_THIN : 1);
/** Тон связи — --ink-2 с этой непрозрачностью (тон следа — 0,55): стволы и зубцы читаются чуть яснее следов. */
export const LINK_TONE = 0.72;

/** Яркость пути по его концам: первый конец — узел (родитель), дальше — второй родитель и дети; путь — как слабейшая сторона. */
function pathEmph(p: Pass, q: Pick<LinkPath, 'ends'>): number {
  const e = q.ends;
  if (!e.length) return 1;
  if (e.length === 1) return p.emph(e[0]);
  let rest = 0;
  for (let k = 1; k < e.length; k++) rest = Math.max(rest, p.emph(e[k]));
  return Math.min(p.emph(e[0]), rest);
}

/**
 * Общий цвет ветви у лиц ids (решение 69): цвет (#rrggbb) и яркость, если все потомки выбранного среди них — одной ветви;
 * null — среди них нет потомков выбранного или ветви разные. Им красятся ствол союза и его ромб (решение 87).
 */
export function commonBranch(bf: ReturnType<typeof branchFrame>, p: Pass, ids: readonly string[], from = 0): { color: string; a: number } | null {
  if (!bf.map) return null;
  let color: string | null = null;
  let a = 0;
  for (let k = from; k < ids.length; k++) {
    const id = ids[k];
    const bp = bf.paint(id);
    if (!bp) continue;
    if (color && color !== bp.color) return null;
    color = bp.color;
    a = Math.max(a, branchAlpha(bp, p.emph(id), p.s.intro));
  }
  return color ? { color, a } : null;
}

/**
 * Путь рода выбранного (просьба владельца 3 октября: подсветка «как лампочка» — горит вся генеалогия, без серых кусков):
 * 'desc' — путь союза, где родитель — выбранный или его потомок, к детям-потомкам (черта брака, ствол, шина, зубец);
 * 'anc' — путь союза предков к предку или к самому выбранному. Второй супруг союза потомка (невестка, зять) в выделение
 * рода не входит — прежде из-за него ствол и шина союза гасли («половина светится, половина нет»).
 */
export function lineageOf(p: Pick<Pass, 's'>, q: Pick<LinkPath, 'union' | 'key' | 'ends'>): 'desc' | 'anc' | null {
  const hl = p.s.highlight;
  const sel = p.s.selected;
  if (!hl || !sel || hl.get(sel) !== 'self' || !q.union) return null;
  const u = ALL_UNIONS.byId.get(q.union);
  if (!u) return null;
  const pa = u.a ? hl.get(u.a) : undefined;
  const pb = u.b ? hl.get(u.b) : undefined;
  const kids = q.key.kind === 'child' ? [q.key.child] : q.key.kind === 'spouse' ? u.kids : q.ends.filter((e) => e !== u.a && e !== u.b);
  const served = kids.length ? kids : u.kids;
  if ((pa === 'self' || pa === 'desc' || pb === 'self' || pb === 'desc') && served.some((k) => hl.get(k) === 'desc')) return 'desc';
  if ((pa === 'anc' || pb === 'anc') && served.some((k) => hl.get(k) === 'anc' || hl.get(k) === 'self')) return 'anc';
  // бездетный брак выбранного — его черта тоже горит
  if (q.key.kind === 'spouse' && (pa === 'self' || pb === 'self')) return 'desc';
  return null;
}

/**
 * Пути супругов и родителей выбранного лица к ромбам союзов (просьба владельца 3 октября: «где его жёны, где дети»).
 * Звезда жены стоит в её родной семье, а ромб союза — на её следе, в год брака или первого ребёнка. Прежде путь от звезды
 * жены до ромба был её обычным следом и не загорался: жена читалась отдельно от мужа. Теперь у каждого союза выбранного
 * горит путь второго супруга от его звезды по его следу до ромба — цветом ветви союза (как черта брака и дети союза);
 * у союза родителей — пути отца и матери к ромбу, светом рода. Свечение — как у линий рода; рисуется до звёзд и с вырезами
 * под подписями (sky.ts). Возвращает, чьи пути нарисованы: «spouse:id», «parent:id» — для проверок.
 */
export function drawFamilyRoutes(v: SkyContext, p: Pass): string[] {
  const sel = p.s.selected;
  const d = p.links;
  const hl = p.s.highlight;
  if (!sel || !d || !hl || hl.get(sel) !== 'self') return [];
  const { ctx, pal } = v;
  const bf = branchFrame(v, p);
  const night = bf.theme === 'night';
  const lamp = alpha(pal.ink, p.s.intro);
  const warm = night ? pal.ink : LINEAGE_WARM;
  const items: { route: number[]; color: string; glow: string; a: number; tag: string }[] = [];
  for (const u of ALL_UNIONS.of.get(sel) ?? []) {
    const other = u.a === sel ? u.b : u.a;
    if (!other || v.hides(other)) continue;
    const r = selectedRoutes(v, d, { kind: 'spouse', union: u.id, person: other }).parents?.get(other);
    if (!r || r.length < 4) continue;
    const br = u.kids.length ? commonBranch(bf, p, u.kids) : null;
    items.push({ route: r, color: br ? alpha(br.color, br.a) : lamp, glow: br ? br.color : warm, a: br ? br.a : p.s.intro, tag: `spouse:${other}` });
  }
  for (const u of ALL_UNIONS.origin.get(sel) ?? []) {
    const rs = selectedRoutes(v, d, { kind: 'union', union: u.id }).parents;
    for (const id of [u.a, u.b]) {
      const r = id && !v.hides(id) ? rs?.get(id) : undefined;
      if (!r || r.length < 4) continue;
      items.push({ route: r, color: lamp, glow: warm, a: p.s.intro, tag: `parent:${id}` });
    }
  }
  if (!items.length) return [];
  const glow = new GlowBatch(LINEAGE_GLOW[bf.theme]);
  for (const it of items) for (let k = 0; k + 3 < it.route.length; k += 2) glow.add(it.glow, it.a, it.route[k], it.route[k + 1], it.route[k + 2], it.route[k + 3]);
  glow.flush(ctx, night);
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = TIER_WIDTH[0];
  for (const it of items) {
    ctx.strokeStyle = it.color;
    ctx.beginPath();
    ctx.moveTo(it.route[0], it.route[1]);
    for (let k = 2; k + 1 < it.route.length; k += 2) ctx.lineTo(it.route[k], it.route[k + 1]);
    ctx.stroke();
  }
  ctx.restore();
  return items.map((it) => it.tag);
}

/**
 * Цвет ветви у пути к потомкам выбранного (решение 69, § 9): зубец — цветом ребёнка; ствол, шина и черта брака — общим
 * цветом детей-потомков, которых путь ведёт (у черты — всех детей союза); разные ветви — null (путь горит светом рода).
 */
function pathBranchOf(bf: ReturnType<typeof branchFrame>, p: Pass, q: LinkPath): { color: string; a: number } | null {
  if (!bf.map || q.kind === 'clan') return null;
  if (q.kind === 'bar' || q.key.kind === 'spouse') {
    const u = q.union ? ALL_UNIONS.byId.get(q.union) : undefined;
    return u && u.kids.length ? commonBranch(bf, p, u.kids) : null;
  }
  return commonBranch(bf, p, q.ends, 1);
}
function pathBranch(bf: ReturnType<typeof branchFrame>, p: Pass, q: LinkPath): string | null {
  const c = pathBranchOf(bf, p, q);
  return c ? alpha(c.color, c.a) : null;
}

/**
 * Рамки путей кадра связей: x0, x1, y0, y1 точек пути i без сдвига кадра — в [4i … 4i + 3]. Кадр связей строится на всё
 * небо и при сдвиге неба не меняется (пересчёт масштаба даёт новый кадр), поэтому рамки считаются один раз на кадр
 * связей, а не в каждом кадре неба по всем точкам всех путей (NFR-1).
 */
const frameBoxes = new WeakMap<LinkDraw['frame'], Float64Array>();
function pathBoxes(f: LinkDraw['frame']): Float64Array {
  let b = frameBoxes.get(f);
  if (b) return b;
  b = new Float64Array(f.paths.length * 4);
  f.paths.forEach((q, i) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const pts = q.pts;
    for (let k = 0; k < pts.length; k += 2) {
      x0 = Math.min(x0, pts[k]);
      x1 = Math.max(x1, pts[k]);
      y0 = Math.min(y0, pts[k + 1]);
      y1 = Math.max(y1, pts[k + 1]);
    }
    b![4 * i] = x0;
    b![4 * i + 1] = x1;
    b![4 * i + 2] = y0;
    b![4 * i + 3] = y1;
  });
  frameBoxes.set(f, b);
  return b;
}

/**
 * Связи кадра (§ 2): стволы, зубцы, черты брака «‖», ступеньки лестницы союзов, родовые черты и обрывки. Тоном текста;
 * у потомков выбранного — цветом ветви (§ 9); наведённая — --ink полной яркостью и на 1 px толще (§ 8). Ленты рисует
 * ribbons.ts, узлы — plates.ts (drawLinkNodes), выбранную связь — marks.ts. Линии занимают место в p.lines: названия
 * созвездий на них не ложатся.
 */
export function drawLinks(v: SkyContext, p: Pass, d: LinkDraw) {
  const { ctx, cam, pal } = v;
  const bf = branchFrame(v, p);
  const g0 = ctx.globalAlpha;
  const { dx, dy } = d;
  const W = cam.w;
  const H = cam.h;
  const look = lookOf(v, p, d);
  // связи обрезаются у кольца выбранного (+2 px; решение 167, V-5)
  clipHoles(ctx, cam, ringHoles(v, p));
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  const box = pathBoxes(d.frame);
  const paths = d.frame.paths;
  // ранг пути для разрывов связь × связь (решение 134): наведённая — выше всех, затем по ярусу; невидимый — не режет
  const rank = (q: LinkPath): number => {
    if (q.ks === d.hover || d.preview.has(q.ks)) return -1;
    if (!linkShown(q, d)) return 99;
    const l = look(q);
    return l.a <= 0.01 ? 99 : l.tier;
  };
  /** разрывы пути под линиями выше по ярусу: номер отрезка → пары «доля длины, полуширина» */
  const gapsOf = (q: LinkPath, r: number): Map<number, [number, number][]> | null => {
    const xc = q.xcuts;
    // короткий зубец (до ребёнка, < 40 px) не режется: прерванный, он читался бы штрихом «иное происхождение» (решение
    // 166, R1-07) — прерывается пересекающая его линия («мостик»)
    if (!xc || shortTooth(q)) return null;
    let out: Map<number, [number, number][]> | null = null;
    for (let k = 0; k + 3 < xc.length; k += 4) {
      const o = paths[xc[k + 3]];
      if (!o) continue;
      const ro = rank(o);
      if (ro === 99) continue;
      // равные ярусы — прерывается горизонталь (как след под вертикалью, Г7); под коротким зубцом — всегда эта линия
      const seg = xc[k];
      const horiz = Math.abs(q.pts[2 * seg + 1] - q.pts[2 * seg + 3]) < 0.5;
      if (!(ro < r || (ro === r && horiz) || shortTooth(o))) continue;
      out ??= new Map();
      (out.get(seg) ?? out.set(seg, []).get(seg)!).push([xc[k + 1], xc[k + 2]]);
    }
    return out;
  };
  /** ломаная пути со сдвигом off (черта брака «‖») и разрывами */
  const trace = (q: LinkPath, gaps: Map<number, [number, number][]> | null, off: number) => {
    const pts = q.pts;
    let pen = false;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const ax = pts[k] + dx + off;
      const ay = pts[k + 1] + dy;
      const bx = pts[k + 2] + dx + off;
      const by = pts[k + 3] + dy;
      const g = gaps?.get(k / 2);
      if (!g) {
        if (!pen) ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        pen = true;
        continue;
      }
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 0.01) continue;
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      let at = 0;
      for (const [t, h] of [...g].sort((m, n) => m[0] - n[0])) {
        const e = t * len - h;
        if (e > at) {
          if (!pen) ctx.moveTo(ax + ux * at, ay + uy * at);
          ctx.lineTo(ax + ux * e, ay + uy * e);
        }
        at = Math.max(at, t * len + h);
        pen = false;
      }
      if (at < len) {
        ctx.moveTo(ax + ux * at, ay + uy * at);
        ctx.lineTo(bx, by);
        pen = true;
      } else pen = false;
    }
  };
  const offsets = barOffsets;
  // путь рода выбранного (lineageOf): в полную силу, главной толщиной, цветом ветви или светом рода, со свечением под
  // линией — сперва свечение всех путей рода кадра (под всеми линиями), потом сами линии
  const night = bf.theme === 'night';
  const lineInk = pal.ink;
  const lin = new Map<LinkPath, { color: string; a: number }>();
  {
    const glow = new GlowBatch(LINEAGE_GLOW[bf.theme]);
    for (let i = 0; i < paths.length; i++) {
      if (box[4 * i + 1] + dx < -4 || box[4 * i] + dx > W + 4 || box[4 * i + 3] + dy < -4 || box[4 * i + 2] + dy > H + 4) continue;
      const q = paths[i];
      if (q.kind === 'ribbon' || !linkShown(q, d)) continue;
      const kind = lineageOf(p, q);
      if (!kind) continue;
      const br = kind === 'desc' ? pathBranchOf(bf, p, q) : null;
      const a = br ? br.a : p.s.intro;
      lin.set(q, { color: br ? alpha(br.color, br.a) : alpha(lineInk, p.s.intro), a });
      const gc = br ? br.color : night ? lineInk : LINEAGE_WARM;
      // свечение — по средней линии пути (у двойной черты брака — между её штрихами): оно шире самой линии
      for (let k = 0; k + 3 < q.pts.length; k += 2) glow.add(gc, a, q.pts[k] + dx, q.pts[k + 1] + dy, q.pts[k + 2] + dx, q.pts[k + 3] + dy);
    }
    glow.flush(ctx, night);
    // замер для проверок (tools/accept/light16.ts, 1246): пути рода кадра по видам — «вид:всего/цветом ветви»
    const ds = (ctx.canvas as { dataset?: DOMStringMap } | undefined)?.dataset;
    if (ds) {
      const by = new Map<string, [number, number]>();
      for (const [q, l] of lin) {
        const k = `${lineageOf(p, q)}.${q.kind}`;
        const c = by.get(k) ?? [0, 0];
        c[0]++;
        if (l.color !== alpha(lineInk, p.s.intro)) c[1]++;
        by.set(k, c);
      }
      const out = [...by].sort().map(([k, [n, c]]) => `${k}:${n}/${c}`).join(' ');
      if (out) ds.lineage = out;
      else if (ds.lineage !== undefined) delete ds.lineage;
    }
  }
  // главный ярус — после остальных: с ореолом цвета неба поверх контекста (решение 135)
  const main: { q: LinkPath; a: number; gaps: Map<number, [number, number][]> | null; color: string }[] = [];
  for (let i = 0; i < paths.length; i++) {
    // путь вне холста — сразу мимо (из тысяч путей неба на холсте — десятки); рамка — из рамок кадра связей (без
    // сдвига): сдвиг монотонен, поэтому крайние точки те же
    if (box[4 * i + 1] + dx < -4 || box[4 * i] + dx > W + 4 || box[4 * i + 3] + dy < -4 || box[4 * i + 2] + dy > H + 4) continue;
    const q = paths[i];
    if (q.kind === 'ribbon' || !linkShown(q, d)) continue;
    const hot = q.ks === d.hover || d.preview.has(q.ks);
    const l = look(q);
    const ln = lin.get(q);
    const a0 = hot || ln ? 1 : l.a;
    if (a0 <= 0.01) continue;
    const gaps = gapsOf(q, hot ? -1 : l.tier);
    const e = hot ? 1 : pathEmph(p, q) * p.s.intro;
    const tone = hot ? pal.ink : ln ? ln.color : (pathBranch(bf, p, q) ?? (l.tier === 0 ? alpha(pal.ink, Math.min(1, e)) : alpha(pal.ink2, Math.min(1, LINK_TONE * e))));
    if (p.lines)
      for (let k = 0; k + 3 < q.pts.length; k += 2) {
        const ax = q.pts[k] + dx;
        const ay = q.pts[k + 1] + dy;
        const bx = q.pts[k + 2] + dx;
        const by = q.pts[k + 3] + dy;
        p.lines.add({ x: Math.min(ax, bx) - 1.5, y: Math.min(ay, by) - 1.5, w: Math.abs(bx - ax) + 3, h: Math.abs(by - ay) + 3 });
      }
    const a = g0 * a0 * (q.style === 'faint' && !hot ? FAINT_A : 1);
    if (l.tier === 0 && !hot) {
      main.push({ q, a, gaps, color: tone });
      continue;
    }
    ctx.globalAlpha = a;
    ctx.strokeStyle = tone;
    ctx.lineWidth = (hot ? 2 : ln ? TIER_WIDTH[0] : TIER_WIDTH[l.tier]) * barWidth(q);
    ctx.setLineDash(LINK_DASH[q.style]);
    ctx.beginPath();
    for (const off of offsets(q)) trace(q, gaps, off);
    ctx.stroke();
  }
  if (main.length) {
    // ореол цвета неба: прямые связи выбранного отделены от фона (G10)
    ctx.setLineDash([]);
    ctx.strokeStyle = pal.halo;
    for (const m of main) {
      ctx.globalAlpha = m.a;
      ctx.lineWidth = TIER_WIDTH[0] * barWidth(m.q) + 2 * TIER_HALO;
      ctx.beginPath();
      for (const off of offsets(m.q)) trace(m.q, m.gaps, off);
      ctx.stroke();
    }
    for (const m of main) {
      ctx.globalAlpha = m.a;
      ctx.lineWidth = TIER_WIDTH[0] * barWidth(m.q);
      ctx.strokeStyle = m.color;
      ctx.setLineDash(LINK_DASH[m.q.style]);
      ctx.beginPath();
      for (const off of offsets(m.q)) trace(m.q, m.gaps, off);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = g0;
}

/** Подпись обрывка или узла на небе: текст, точка привязки и куда от неё ставить. */
interface LinkText {
  text: string;
  x: number;
  y: number;
  /** −1 — над точкой, 1 — под ней, 0 — справа (или слева, если right = false) */
  dir: -1 | 0 | 1;
  right: boolean;
  /** чья подпись: союз связи (или запись ключа) — на своих линиях подпись может лежать, на чужих — нет (Я12) */
  id?: string;
  /** можно и по другую сторону точки (над следом и под ним): имя матери у ромба */
  side2?: boolean;
  /** обязательная подпись (имя матери у ромба выбранного, решение 137): тесно — выноской не длиннее LEADER_MAX */
  leader?: boolean;
  /** тон текста (по умолчанию --ink-2) */
  ink?: string;
  /** лицо подписи (мать у ромба, супруг у ромба бездетного брака): его знак у точки — не чужой (решение 160) */
  person?: string;
  /** x самой точки (середина ромба), если подпись отодвинута от неё (x): по ней — правило принадлежности (решение 160) */
  ax?: number;
}

/** Выноска подписи связи — не длиннее (решение 140, К8). */
export const LINK_LEADER_MAX = 40;

const nameOf = (id: string) => byId.get(id)?.name ?? id;
/**
 * Поставить подпись связи в свободное место у точки и нарисовать её (курсив малого кегля карты, тоном --ink-2); hold —
 * погашенная выделением: только держит своё место (labels.ts, claim).
 */
function putLinkText(v: SkyContext, p: Pass, t: LinkText, a: number, hold = false): Rect | null {
  const { ctx } = v;
  const size = mapSize(T_MAP_S, v.coarse);
  ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
  const w = ctx.measureText(t.text).width;
  const cands: { tx: number; ty: number }[] = [];
  const mid = (0.72 - 0.22) * 0.5 * size;
  if (t.dir === 0) {
    if (t.right) cands.push({ tx: t.x + 4, ty: t.y + mid }, { tx: t.x + 4, ty: t.y - 5 }, { tx: t.x + 4, ty: t.y + size + 3 });
    else cands.push({ tx: t.x - 4 - w, ty: t.y + mid }, { tx: t.x - 4 - w, ty: t.y - 5 }, { tx: t.x - 4 - w, ty: t.y + size + 3 });
    // у ромба в тесном ряду узлов (Давид: семь союзов) — и по другую сторону, над следом и под ним
    if (t.side2) {
      const ox = t.right ? t.x - 12 - w : t.x + 12;
      cands.push({ tx: ox, ty: t.y - 5 }, { tx: ox, ty: t.y + size + 3 });
      // след лица линий Мессии несёт ленту: имя — за её полосой
      for (const dy of [12, 20]) cands.push({ tx: t.x + 4, ty: t.y - 5 - dy }, { tx: t.x + 4, ty: t.y + size + 3 + dy });
    }
  } else {
    const ty = t.dir < 0 ? t.y - 4 : t.y + size + 2;
    cands.push({ tx: t.x + 4, ty }, { tx: t.x - 4 - w, ty }, { tx: t.x - w / 2, ty: t.dir < 0 ? ty - 4 : ty + 4 });
  }
  const near = cands.length;
  // обязательная — дальше по сторонам, с выноской к точке (не длиннее 40 px)
  if (t.leader) {
    // сетка мест вокруг точки — по длине выноски: ближние первыми (тесный ряд ромбов Давида на узком небе)
    const more: { tx: number; ty: number; l: number }[] = [];
    for (let dy = 10; dy <= 38; dy += 4)
      for (const sgn of [-1, 1])
        for (let dx = -36; dx <= 36; dx += 6)
          for (const right of [true, false]) {
            const ty = sgn < 0 ? t.y - dy : t.y + dy + size * 0.7;
            const tx = right ? t.x + 8 + dx : t.x - 8 - w + dx;
            const cx = right ? tx : tx + w;
            const l = Math.hypot(cx - t.x, ty - size * 0.35 - t.y);
            if (l <= LINK_LEADER_MAX) more.push({ tx, ty, l });
          }
    more.sort((a, b) => a.l - b.l);
    for (const m of more) cands.push({ tx: m.tx, ty: m.ty });
  }
  // поле подписи — с запасом над строкой: курсив малого кегля не встаёт вплотную к органам неба и соседним подписям
  const boxes = cands.map((c) => {
    const b = textBox(c.tx, c.ty, w, size);
    return { x: b.x, y: b.y - 5, w: b.w, h: b.h + 5 };
  });
  // правило принадлежности (решения 140, 160): подпись у точки — ближе к ней, чем к чужому знаку; места с номера near —
  // на выноске; не прошло ни одно — подписи нет. Ромб союза снова на следе отца (решение 190, как на этапе 14): мать
  // узнаётся только по имени у ромба, поэтому строгий запрет чужой линии через подпись (этап 15, ромб на следе жены) снят
  const b = claim(v, p, boxes, 'plate', t.text, { id: t.id, hold, anchor: { x: t.ax ?? t.x, y: t.y, near, person: t.person } });
  if (!b || hold) return null;
  const k = boxes.indexOf(b);
  const c = cands[k];
  const g0 = ctx.globalAlpha;
  ctx.globalAlpha = g0 * a;
  if (k >= near) {
    // выноска: от края знака у точки к ближнему углу подписи, тонкой линией тона подписи
    const ex = c.tx > t.x ? c.tx - 2 : c.tx + w + 2;
    const ey = c.ty - size * 0.35;
    const len = Math.hypot(ex - t.x, ey - t.y) || 1;
    ctx.save();
    ctx.strokeStyle = alpha(t.ink ?? v.pal.ink2, 0.8);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(t.x + ((ex - t.x) / len) * 6, t.y + ((ey - t.y) / len) * 6);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }
  drawFamilyText(ctx, { halo: v.pal.halo, ink3: t.ink ?? v.pal.ink2 }, t.text, c.tx, c.ty, v.coarse);
  ctx.globalAlpha = g0;
  return b;
}

/** Союзы, чьи имена матерей уже поставлены в этом кадре обязательным ярусом (ключ — Placer кадра). */
const motherPlaced = new WeakMap<object, Set<string>>();
/** Имя у ромба в кадре: лицо и точка ромба (unionLabel, said). */
interface NodeName {
  id: string;
  x: number;
  y: number;
}
/** имена у ромбов этого кадра (по Placer прохода): соседний ромб того же лица имени не повторяет */
const nodeNames = new WeakMap<object, NodeName[]>();

/**
 * Имена матерей у ромбов выбранного лица — обязательный ярус подписей (этап 14, решение 137; G3): ставятся раньше имён
 * звёзд (кроме выбранного), тесно — выноской до 40 px; погашенным союз выбранного не бывает. Ответ «от какой жены какие
 * дети» — словом, а не только цветом ветви. Зовёт небо (sky.ts или labels.ts) до обычных подписей; drawLinkLabels их не
 * повторяет. Возвращает союзы с поставленным именем.
 */
/**
 * Ромб союза на небе (решение 170, V-2): пока имена семьи не видны (строка общей раскладки ниже FAMILY_KY), ромбы — только
 * у союзов выбранного и второго лица, наведённого лица и выбранной или наведённой связи; на масштабе семьи и в семейной
 * укладке — все (по ярусу их линий, unionAlpha). Подписи у ромбов — по тому же правилу.
 */
export function nodeOnSky(v: SkyContext, p: Pass, d: Pick<LinkDraw, 'frame' | 'hover' | 'selected' | 'preview'>, union: string): boolean {
  if (d.frame.layout !== 'map' || v.cam.ky >= FAMILY_KY) return true;
  const s = p.s;
  const marks = s.plateMarks;
  if (marks && (marks.hover === union || marks.selected === union || marks.focus === union)) return true;
  const u = ALL_UNIONS.byId.get(union);
  if (!u) return false;
  for (const id of [s.selected, s.second, s.hovered]) if (id && (u.a === id || u.b === id || u.kids.includes(id))) return true;
  const ks = `u.${union}`;
  return [d.hover, d.selected, ...d.preview].some((k) => !!k && (k === ks || k.split('.').slice(1, 4).join('.') === union));
}

/**
 * Её собственное имя у ромба не нужно (решения 160, 173): звезда жены видна в кадре ближе стольких px и стоит в том же
 * доме, что ромб (на той же строке её следа) — имя ставит ярус семьи. Звезда в другом доме (жена пришла в дом мужа
 * переходом) или дальше — имя у ромба нужно: по нему читается, чья это черта.
 */
export const OWN_NAME_NEAR = 120;
function ownStarNear(v: SkyContext, id: string, x: number, y: number): boolean {
  const { cam } = v;
  const i = v.indexOf(id);
  if (i === undefined || !v.drawn(i)) return false;
  const sx = cam.sx(v.X0[i]);
  const sy = cam.sy(starLaneOf(v.nodes[i]));
  if (sx < v.letterW || sx > cam.w || sy < v.openTop || sy > cam.vp.b) return false;
  // ромб — на её следе в год черты: если след там уже в другой строке, звезда — в отчем доме
  if (hasGlides(v.nodes[i]) && Math.abs(sy - y) > 1.5) return false;
  return Math.hypot(sx - x, sy - y) < OWN_NAME_NEAR;
}

/** Слово вида союза у ромба на масштабе семьи (решение 174): «Валла, наложница», «Онан, левират». */
export const KIND_WORD: Readonly<Partial<Record<MarriageKind, string>>> = { concubine: 'наложница', levirate: 'левират', none: 'брак не назван' };

/**
 * Подпись у ромба союза (решения 160, 173, 174): кто и что. Ромб на следе отца (мать не на небе или не названа) — имя матери
 * из узла (LinkNode.mother; '' — «мать не названа», название союза). Ромб на следе жены:
 *  — её имя, если её звезда в другом доме (пришла переходом) или дальше 120 px (ownStarNear); рядом — имени нет (мужей
 *    повторного брака называют сами черты от их следов);
 *  — на масштабе семьи (решение 178) и у союзов выбранного — слово вида: «Валла, наложница», «Онан, левират»; без имени —
 *    одно слово.
 * Имя, уже написанное в кадре у соседнего ромба ближе 120 px (said), не повторяется: у трёх союзов Фамари на её следе —
 * одно «Фамарь, брак не назван», дальше одно слово вида («левират») или ничего: повтор имени занимал место имён детей.
 * null — подписи нет. person — лицо, названное подписью (его знак у ромба — не чужой, решение 160); у одного слова вида
 * его нет: слово — подпись ромба, и её звезда ближе ромба читалась бы чужой (К4). whose — чья подпись (её погашение).
 */
export function unionLabel(v: SkyContext, n: Pick<LinkNode, 'kind' | 'union' | 'owner' | 'mother'>, x: number, y: number, words: boolean, said?: readonly NodeName[]): { text: string; person: string | undefined; whose: string | undefined } | null {
  if (n.kind !== 'union') return null;
  const u = ALL_UNIONS.byId.get(n.union);
  const near = (id: string) => ownStarNear(v, id, x, y) || !!said?.some((q) => q.id === id && Math.hypot(q.x - x, q.y - y) < OWN_NAME_NEAR);
  if (n.mother !== null) {
    if (n.mother && near(n.mother)) return null;
    const text = n.mother ? nameOf(n.mother) : u ? unionName(u) : '';
    return text ? { text, person: n.mother || undefined, whose: n.mother || undefined } : null;
  }
  if (!u || !u.a || !u.b || n.owner !== u.b) return null;
  const wife = u.b;
  const who = near(wife) ? null : wife;
  const word = words ? KIND_WORD[marriageKind(u)] : undefined;
  if (!who && !word) return null;
  const text = who ? (word ? `${nameOf(who)}, ${word}` : nameOf(who)) : word!;
  return { text, person: who ?? undefined, whose: wife };
}

export function drawMotherNames(v: SkyContext, p: Pass, d: LinkDraw | null | undefined): Set<string> {
  const done = new Set<string>();
  motherPlaced.set(p.placer, done);
  const said: NodeName[] = [];
  nodeNames.set(p.placer, said);
  const sel = p.s.selected;
  if (!d || !sel || !p.s.layers.labels || (d.frame.layout === 'map' && v.genRoom < 0.5)) return done;
  const mine = new Set((ALL_UNIONS.of.get(sel) ?? []).map((u) => u.id));
  if (!mine.size) return done;
  const { cam } = v;
  const out: string[] = [];
  for (const n of d.frame.nodes) {
    // обязательный ярус — только настоящие имена; пояснение «Давид (мать не названа)» — обычным ярусом подписей союза после
    // имён детей (drawLinkLabels): имя ребёнка выбранного важнее пояснения
    if (n.mother === '' || n.kind !== 'union' || !mine.has(n.union)) continue;
    const x = n.x + d.dx;
    const y = n.y + d.dy;
    if (!(x > v.letterW && x < cam.w && y > v.openTop && y < cam.vp.b)) continue;
    // её звезда видна рядом и в том же доме — имя у ромба повторило бы её подпись и спорило бы с ней (решения 160, 173);
    // у союзов выбранного — со словом вида (решение 174)
    const lab = unionLabel(v, n, x, y, true, said);
    // одно слово вида («наложница») — не имя: оно идёт обычным ярусом после подписей звёзд (drawLinkLabels), иначе заняло
    // бы место имени самой жены, а супруги выбранного подписаны всегда (решение 164)
    if (!lab?.person) continue;
    const text = lab.text;
    const b = putLinkText(v, p, { text, x: x + 5, ax: x, y, dir: 0, right: true, id: n.union, side2: true, leader: true, ink: v.pal.ink, person: lab.person }, 1);
    if (b) {
      if (lab.person) said.push({ id: lab.person, x, y });
      done.add(n.union);
      out.push(`${text}@${Math.round(x)},${Math.round(y)}`);
    }
  }
  const ds = (v.ctx.canvas as { dataset?: DOMStringMap } | undefined)?.dataset;
  if (ds) {
    const t = out.join('|');
    if (ds.motherNames !== t) ds.motherNames = t;
  }
  return done;
}

/**
 * Подписи у ромбов союзов (после подписей звёзд, если есть место; unionLabel): имя жены у ромба на её следе, если её
 * звезда в другом доме или дальше 120 px (решения 160, 173), на масштабе семьи — со словом вида союза (решение 174); имя
 * матери у ромба на следе отца, если её нет на небе (Г8), и «Сиф и его жена» у ромба союза с неназванной женой (решение
 * 75). Обрывков связей и их подписей больше нет (решение 176): связь видна целиком, конец за краем называет указатель
 * шатра (frame.ts). Имя у ромба бездетного брака (этап 13, К6) — вторым проходом, late, после подписей звёзд. Для
 * проверок пишет canvas[data-link-texts]: «текст@x,y» через «|» (оба прохода вместе).
 */
export function drawLinkLabels(v: SkyContext, p: Pass, d: LinkDraw, late = false) {
  const { cam } = v;
  const out: string[] = [];
  const onScreen = (x: number, y: number) => x > v.letterW && x < cam.w && y > v.openTop && y < cam.vp.b;
  // имя матери у ромба — раньше подписей обрывков (этап 13): после укладки по матерям (решение 95) дети Давида стоят у
  // своих матерей далеко от него, и подписи обрывков «Авессалом, 32 Н» у ромбов его следа занимали место имён матерей
  const placed = motherPlaced.get(p.placer);
  let said = nodeNames.get(p.placer);
  if (!said) nodeNames.set(p.placer, (said = []));
  // ромбов на «всех лицах» теснее поколения в 18 px нет (plates.ts, genRoom) — нет и имён у них (G6: подпись без знака)
  const noNodes = d.frame.layout === 'map' && v.genRoom < 0.5;
  // слова вида союза — на масштабе семьи (решения 174, 178) и у союзов выбранного (одно слово без имени — отсюда, после
  // подписей звёзд: drawMotherNames его не ставит)
  const sel = p.s.selected;
  const mine = new Set(sel ? (ALL_UNIONS.of.get(sel) ?? []).map((u) => u.id) : []);
  for (const n of noNodes ? [] : d.frame.nodes) {
    const words = p.tier >= 2 || mine.has(n.union);
    if (n.kind !== 'union' || !!n.late !== late || placed?.has(n.union)) continue;
    const x = n.x + d.dx;
    const y = n.y + d.dy;
    if (!onScreen(x, y)) continue;
    // имя матери — только у союза в полную силу: погашенный выделением союз (и «вероятно» живые на меридиане) подписи не
    // получает — бледная подпись не держала бы контраста 4,5 : 1; её место остаётся за ней (соседи не переезжают)
    // имя у ромба — там, где виден сам ромб (ярус его линий, решение 135, и подробность кадра — как у знака), или у
    // раскрытого союза
    if (!(Math.min(unionAlpha(v, p, d, n.union).a, d.alpha) > 0.5 || d.expanded.has(n.union))) continue;
    if (!nodeOnSky(v, p, d, n.union)) continue;
    const lab = unionLabel(v, n, x, y, words, said);
    if (!lab) continue;
    const a = Math.min(1, p.emph(n.owner), p.emph(n.from), lab.whose ? p.emph(lab.whose) : 1);
    const text = lab.text;
    const b = putLinkText(v, p, { text, x: x + 5, ax: x, y, dir: 0, right: true, id: n.union, side2: true, person: lab.person }, 1, a < 0.99);
    if (b && lab.person) said.push({ id: lab.person, x, y });
    if (b) out.push(`${text}@${Math.round(x)},${Math.round(y)}`);
  }
  // первый проход запоминает свои подписи, второй пишет все вместе
  if (!late) {
    firstTexts = out;
    return;
  }
  const ds = (v.ctx.canvas as { dataset?: DOMStringMap } | undefined)?.dataset;
  if (ds) {
    const s = [...firstTexts, ...out].join('|');
    if (ds.linkTexts !== s) ds.linkTexts = s;
  }
  firstTexts = [];
}
let firstTexts: string[] = [];

/** Обрывок наружу показа (§ 7), px холста: щелчок по нему открывает карточку того лица (src/ui/sky/input.ts). */
export interface PlanStubHit extends Rect {
  from: string;
  to: string;
  key: LinkKey;
}

/**
 * Обрывки наружу показа (§ 7; план неба Q2, SkyPlan.stubs; К8 этапа 13): сплошная черта от звезды лица показа в сторону
 * лица вне показа, на конце — пунктирное кольцо-призрак, и подпись в две строки — «Ревекка, дочь Вафуила» / «жена Исаака;
 * в «Патриархах»». Возвращает поля попадания (подпись и черта; не меньше 24 × 24, на касании 44 × 44).
 */
export function drawPlanStubs(v: SkyContext, p: Pass, stubs: readonly { from: string; to: string; key: LinkKey; words: string; where: string }[]): PlanStubHit[] {
  const { ctx, cam, pal } = v;
  const out: PlanStubHit[] = [];
  if (!stubs.length) return out;
  const size = mapSize(T_MAP_S, v.coarse);
  const lh = size + 3;
  const log: string[] = [];
  const least = v.coarse ? 44 : 24;
  const seen = new Map<string, number>();
  for (const st of stubs) {
    const i = v.indexOf(st.from);
    if (i === undefined || !v.drawn(i)) continue;
    const n = v.nodes[i];
    const q = byId.get(st.from);
    if (!q) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(starLaneOf(n));
    if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
    // куда смотрит обрывок: к строке лица вне показа на общей раскладке; несколько обрывков одного лица — веером
    const j = v.indexOf(st.to);
    const lf = starLaneOf(v.model.nodes[i]);
    const lt = j === undefined ? lf : starLaneOf(v.model.nodes[j]);
    const dir = lt > lf ? -1 : 1;
    const k = seen.get(`${st.from}${dir}`) ?? 0;
    seen.set(`${st.from}${dir}`, k + 1);
    const r = starRadius(q.magnitude, p.zoomScale) + (q.sex === 'f' ? 2.2 : 0);
    const sx = Math.round(x + r + 6 + k * 10) + 0.5;
    const ey = y + dir * 18;
    // обрывок наружу показа (К8, решение 93): короткая сплошная черта связи и на конце — пунктирное кольцо-призрак
    // («лицо нарисовано не здесь»); точки на связях значат только толкование (решение 94)
    ctx.save();
    const tone = alpha(pal.ink2, Math.min(1, LINK_TONE * p.emph(st.from)));
    ctx.strokeStyle = tone;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x + r + 2, y);
    ctx.lineTo(sx, y);
    ctx.lineTo(sx, ey - dir * STUB_GHOST_R);
    ctx.stroke();
    ctx.setLineDash([1.5, 1.5]);
    ctx.beginPath();
    ctx.arc(sx, ey, STUB_GHOST_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
    const w = Math.max(ctx.measureText(st.words).width, st.where ? ctx.measureText(st.where).width : 0);
    const h = st.where ? 2 * lh : lh;
    const top = dir < 0 ? ey - 3 - h : ey + 3;
    const cands = [{ x: sx + 3, y: top }, { x: sx - 3 - w, y: top }];
    const boxes = cands.map((c) => ({ x: c.x - 1.5, y: c.y - 1.5, w: w + 3, h: h + 3 }));
    const b = claim(v, p, boxes, 'plate', st.words, { id: st.to });
    if (!b) continue;
    const c = cands[boxes.indexOf(b)];
    drawFamilyText(ctx, { halo: pal.halo, ink3: pal.ink2 }, st.words, c.x, c.y + size * 0.8, v.coarse);
    if (st.where) drawFamilyText(ctx, { halo: pal.halo, ink3: pal.ink3 }, st.where, c.x, c.y + lh + size * 0.8, v.coarse);
    // поле попадания: подпись и пунктир, не меньше least × least
    const hx0 = Math.min(b.x, sx - 4);
    const hx1 = Math.max(b.x + b.w, sx + 4);
    const hy0 = Math.min(b.y, y, ey);
    const hy1 = Math.max(b.y + b.h, y, ey);
    const gw = Math.max(0, (least - (hx1 - hx0)) / 2);
    const gh = Math.max(0, (least - (hy1 - hy0)) / 2);
    out.push({ x: hx0 - gw, y: hy0 - gh, w: hx1 - hx0 + 2 * gw, h: hy1 - hy0 + 2 * gh, from: st.from, to: st.to, key: st.key });
    log.push(`${st.from}>${st.to}@${Math.round(sx)},${Math.round(ey)}`);
  }
  const ds = (ctx.canvas as { dataset?: DOMStringMap } | undefined)?.dataset;
  if (ds) {
    const s = log.join(' ');
    if (ds.planStubs !== s) ds.planStubs = s;
  }
  return out;
}

// ---------- легенда «Семья на небе» (этап 15, решение 180) ----------

/**
 * Путь связи без разрывов — тем же начертанием, что у drawLinks: черта брака по виду союза (barOffsets, barWidth), штрих
 * и точки по словарю (LINK_DASH). Для образцов легенды «Семья на небе» и образца #/specimen.
 */
export function strokeLinkPath(ctx: CanvasRenderingContext2D, q: Pick<LinkPath, 'kind' | 'bar' | 'style' | 'pts'>, color: string, width: number = TIER_WIDTH[1]) {
  const pts = q.pts;
  if (pts.length < 4) return;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = color;
  ctx.lineWidth = width * barWidth(q);
  ctx.setLineDash(LINK_DASH[q.style]);
  ctx.beginPath();
  for (const off of barOffsets(q)) {
    ctx.moveTo(pts[0] + off, pts[1]);
    for (let k = 2; k + 1 < pts.length; k += 2) ctx.lineTo(pts[k] + off, pts[k + 1]);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Переход для образца: S-кривая (smoothstep) от (xa, ya) до (xb, yb) — та же форма и та же выборка, что у bendsOf
 * (там — по годам, здесь — по x, в образце время линейно).
 */
export function sampleBend(xa: number, xb: number, ya: number, yb: number): Bend {
  const k = Math.max(6, Math.min(64, Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya)) / 5)));
  const pts: number[] = [];
  for (let j = 0; j <= k; j++) pts.push(xa + ((xb - xa) * j) / k, ya + (yb - ya) * smooth(j / k));
  return { xa, xb, ya, yb, pts };
}

/** Знаки легенды «Семья на небе» (решение 180), по порядку легенды. */
export type FamilySign = 'glide' | 'unions' | 'nomother' | 'kids' | 'ghost' | 'tent' | 'station' | 'cross';
export const FAMILY_SIGNS: readonly FamilySign[] = ['glide', 'unions', 'nomother', 'kids', 'ghost', 'tent', 'station', 'cross'];

/**
 * Образец знака «Семьи на небе» (решение 180; src/ui/panels/Legend.tsx, src/ui/Specimen.tsx): те же рисовальщики и тона,
 * что у неба, — след с переходом (drawLifeTrail), знак лица (drawGlyph), черта брака и отводы (strokeLinkPath — правила
 * drawLinks), ромб союза по виду (plates.ts, paintUnion), точка гнезда (paintJoin), ленты (drawStrands), указатель шатра
 * (frame.ts), подпись-помета (drawFamilyText). Пиксели CSS, w × h; фон — небо (правило .legend-sample).
 */
export function drawFamilySample(ctx: CanvasRenderingContext2D, pal: Palette, w: number, h: number, sign: FamilySign) {
  const px = (v: number) => Math.round(v) + 0.5;
  const theme: MapTheme = pal.glow ? 'night' : 'day';
  const trailTone = alpha(pal.ink2, 0.55 * 1.25);
  const linkTone = alpha(pal.ink2, LINK_TONE);
  const R = NODE_R_FAMILY;
  const life = (x0: number, x1: number, y: number, o: Partial<LifeTrail> = {}) =>
    drawLifeTrail(ctx, { x0, x1, y, cls: 'exact', known: true, solidTo: x1, color: trailTone, width: 1.2, ...o });
  const star = (x: number, y: number, sex: 'm' | 'f' = 'm', magnitude = 3, o: Partial<GlyphOpts> = {}) =>
    drawGlyph(ctx, x, y, { sex, kind: 'person', magnitude, color: pal.ink, halo: pal.sky, ...o });
  const person = (x: number, y: number, x1: number, sex: 'm' | 'f' = 'm', t: Partial<LifeTrail> = {}) => {
    life(x, x1, y, t);
    star(x, y, sex);
  };
  const link = (pts: number[], o: Partial<Pick<LinkPath, 'kind' | 'bar' | 'style'>> = {}) =>
    strokeLinkPath(ctx, { kind: o.kind ?? 'trunk', bar: o.bar, style: o.style ?? 'solid', pts }, linkTone);
  const union = (x: number, y: number, look?: NodeLook) => paintUnion(ctx, x, y, R, { open: true, halo: pal.sky, theme, a: 1, look });
  /** черта брака от следа мужа (yH) к ромбу на следе жены (yW) */
  const bar = (x: number, yH: number, yW: number, kind: MarriageKind, look: NodeLook = kind) => {
    link([x, yH, x, yW - Math.sign(yW - yH) * R], { kind: 'bar', bar: kind, style: kind === 'levirate' ? 'dash' : 'solid' });
    union(x, yW, look);
  };
  const note = (text: string, x: number, y: number) => drawFamilyText(ctx, pal, text, x, y);
  ctx.save();
  ctx.lineCap = 'butt';
  switch (sign) {
    case 'glide': {
      // лицо рождается в доме отца (звезда наверху), его след плавно переходит в полосу жизни; чужой след под переходом
      // прерывается
      const top = px(h * 0.24);
      const mid = px(h * 0.52);
      const low = px(h * 0.8);
      const xa = Math.round(w * 0.36);
      const xb = Math.round(w * 0.62);
      const g = sampleBend(xa, xb, top, low);
      const xc = (xa + xb) / 2;
      life(8, w - 8, mid, { cuts: [xc, TRAIL_CUT] });
      person(16, top, w - 8, 'm', { bends: [g] });
      break;
    }
    case 'unions': {
      // четыре союза: жена, наложница, левират, брак не назван — черта от мужа (сверху) к ромбу на следе жены
      const kinds: [MarriageKind, string][] = [['wife', 'жена'], ['concubine', 'наложница'], ['levirate', 'левират'], ['none', 'брак не назван']];
      const top = px(10);
      const low = px(h - 26);
      const cw = w / kinds.length;
      kinds.forEach(([kind, cap], k) => {
        const x0 = k * cw;
        const x = px(x0 + cw * 0.42);
        life(x0 + 6, x0 + cw - 8, top);
        life(x0 + 6, x0 + cw - 8, low);
        bar(x, top, low, kind);
        note(cap, x0 + 6, h - 6);
      });
      break;
    }
    case 'nomother': {
      // мать не названа: половина ромба на следе отца, ствол и зубцы — от следа отца
      const top = px(h * 0.22);
      const k1 = px(h * 0.56);
      const k2 = px(h * 0.84);
      const x = px(w * 0.3);
      person(14, top, w - 8);
      link([x, top + R, x, k2]);
      link([x, k1, x + 14, k1]);
      link([x, k2, x + 30, k2]);
      union(x, top, 'no-mother');
      star(x + 18, k1);
      star(x + 34, k2);
      break;
    }
    case 'kids': {
      // дети — от следа матери: ствол в год рождения и зубец к звезде; следующее гнездо — точка на её следе
      const top = px(h * 0.14);
      const mo = px(h * 0.42);
      const k1 = px(h * 0.66);
      const k2 = px(h * 0.88);
      const xu = px(w * 0.24);
      const xj = px(w * 0.62);
      person(14, top, w - 8);
      person(30, mo, w - 8, 'f');
      bar(xu, top, mo, 'wife');
      link([xu, mo + R, xu, k2]);
      link([xu, k1, xu + 12, k1]);
      link([xu, k2, xu + 30, k2]);
      star(xu + 16, k1);
      star(xu + 34, k2, 'f');
      link([xj, mo, xj, k1, xj + 12, k1]);
      paintJoin(ctx, xj, mo, pal.ink, pal.sky);
      star(xj + 16, k1);
      break;
    }
    case 'ghost': {
      // призрак: бездетный брак у мужа — черта к ромбу и полый пунктирный знак жены «лицо нарисовано не здесь»
      const top = px(h * 0.26);
      const low = px(h * 0.74);
      const x = px(w * 0.42);
      person(14, top, w - 8);
      bar(x, top, low, 'wife');
      star(x + 16, low, 'f', 3, { ghost: true });
      note('Мелхола, жена Давида', x + 26, low + 4);
      break;
    }
    case 'tent': {
      // указатель шатра (решение 176): мать и её дети за краем окна — одна строка у кромки на союз и сторону; черта брака
      // идёт к кромке целиком
      const low = px(h * 0.8);
      const x = px(w * 0.22);
      person(14, low, w - 8);
      link([x, low, x, 0], { kind: 'bar', bar: 'wife' });
      drawTentPointer(ctx, pal, x + 10, 15, 'up', 'Лия: Рувим, Симеон, Левий');
      break;
    }
    case 'station': {
      // станция ленты: шаг ленты уходит со следа отца у черты брака матери ребёнка — у Давида ленты к Соломону и
      // Нафану расходятся у черты Вирсавии
      const yF = px(h * 0.4);
      const yM = px(h * 0.78);
      const xu = Math.round(w * 0.42);
      const at: Record<string, [number, number]> = { g: [10, yF], f: [xu, yF], s: [w - 24, px(h * 0.14)], n: [w - 24, px(h * 0.9)] };
      const project = (id: string) => ({ x: at[id][0], y: at[id][1] });
      life(xu + 10, w - 8, yF);
      person(xu - 34, yM, w - 8, 'f');
      bar(px(xu), yF, yM, 'wife');
      const strands = buildRibbons({ joseph: ['g', 'f', 's'].map((id) => ({ id, weak: false })), mary: ['g', 'f', 'n'].map((id) => ({ id, weak: false })), project, amplitude: 3, meander: 0 });
      drawStrands(ctx, strands, 2.4, ribbonLook(pal), w);
      star(at.s[0], at.s[1], 'm', 2);
      star(at.n[0], at.n[1], 'm', 2);
      break;
    }
    case 'cross': {
      // пересечение — не соединение: под чужой вертикалью след прерывается; соединение — ромб на следе и зубец у звезды
      const top = px(h * 0.18);
      const mid = px(h * 0.5);
      const low = px(h * 0.84);
      const x1 = px(w * 0.28);
      const x2 = px(w * 0.68);
      person(10, top, w * 0.5);
      life(8, w - 8, mid, { cuts: [x1, TRAIL_CUT] });
      link([x1, top, x1, low, x1 + 14, low]);
      star(x1 + 18, low);
      link([x2, mid + R, x2, low, x2 + 14, low]);
      union(x2, mid, 'no-mother');
      star(x2 + 18, low);
      break;
    }
  }
  ctx.restore();
}
