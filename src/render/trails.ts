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
import { starRadius } from './glyphs.ts';
import { mapFont, mapSize, nameSize, T_MAP_S } from './type.ts';
import { claim, textBox } from './labels.ts';
import { branchColor, branchTickAt, GlowBatch, glowLayers, glows } from './branches.ts';
import { branchFrame, FAR, type BranchPaint } from './marks.ts';
import type { Rect } from './rect.ts';
import type { Emphasis, Palette, Pass, SkyContext } from './sky.ts';
import type { LinkFrame, LinkPath, PathStyle } from './links.ts';
import type { LinkKey } from '../engine/linkkey.ts';
import { atlasCoord } from '../engine/layout.ts';
import { unions as ALL_UNIONS } from '../ui/reveal.ts';
import { unionName } from '../ui/linkwords.ts';

/**
 * Растушёвка неуверенного начала и конца следа (этап 12, решение 90): тот же след, плавно тающий к краю, — вместо
 * пунктира (точки на небе значат только толкование и «время не установлено», Г10). start — доля яркости у звезды
 * при оценочном рождении (след проявляется к концу интервала рождения), end — у конца интервала смерти и у конца
 * короткого хвоста после последнего упоминания.
 */
export const TRAIL_FADE = { start: 0.22, end: 0 };
/** Часть следа за разрывом «//» (MAP-51) — бледнее: доля яркости сплошного следа. */
export const TRAIL_PALE = 0.45;
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
  if (!(b > a + 0.5)) return;
  const c = rgbaOf(color);
  if (c) {
    const g = ctx.createLinearGradient(a, 0, b, 0);
    g.addColorStop(0, `rgba(${c.rgb},${+(c.a * k0).toFixed(3)})`);
    g.addColorStop(1, `rgba(${c.rgb},${+(c.a * k1).toFixed(3)})`);
    ctx.strokeStyle = g;
  } else ctx.strokeStyle = color;
  ctx.beginPath();
  gapLine(ctx, a, b, y, cuts);
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
  const { x0, x1, y } = t;
  const cuts = t.cuts;
  ctx.strokeStyle = t.color;
  ctx.lineWidth = t.width;
  if (t.cls === 'epochal') {
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
  if (from > x0 + 0.5) fadeLine(ctx, x0, from, y, t.color, TRAIL_FADE.start, 1, cuts);
  // разрыв (MAP-51): сплошная часть кончается у brk, за знаком «//» — бледнее до конца засвидетельствованного
  const cut = t.brk !== undefined && t.brk > from + 4 && t.brk < solidTo - 4 ? t.brk : null;
  const solidEnd = cut !== null ? cut - BREAK.gap / 2 - 2 : solidTo;
  if (solidEnd > from + 0.5) {
    if (t.dash?.length) ctx.setLineDash(t.dash as number[]);
    ctx.beginPath();
    gapLine(ctx, from, solidEnd, y, cuts);
    ctx.stroke();
    if (t.dash?.length) ctx.setLineDash([]);
  }
  const tail = (!t.known || t.cls === 'estimated') && x1 > solidTo + 0.5;
  if (cut !== null) {
    drawBreak(ctx, cut, y, t.color);
    fadeLine(ctx, cut + BREAK.gap / 2 + 2, solidTo, y, t.color, TRAIL_PALE, TRAIL_PALE, cuts);
  }
  // неизвестная или оценочная смерть: след тает к концу интервала смерти (к концу короткого хвоста)
  if (tail) fadeLine(ctx, solidTo, x1, y, t.color, cut !== null ? TRAIL_PALE : 1, TRAIL_FADE.end, cuts);
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
  out.y = Math.round(cam.sy(n.lane)) + 0.5;
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
  out.y = Math.round(cam.sy(n.lane)) + 0.5;
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
      if (bp) glow.add(bp.color, branchAlpha(bp, p.emph(id), intro), t.x0, t.y, t.x1, t.y);
      else anc.add(pal.ink, intro, t.x0, t.y, t.x1, t.y);
    }
    anc.flush(ctx, bf.theme === 'night');
    glow.flush(ctx, bf.theme === 'night');
  }
  ctx.lineCap = 'butt';
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
      bf.shown.add(n.person);
    } else {
      const e = p.emph(n.person) * intro;
      const a = (ky < 5 ? 0.35 : 0.55) * e * (q.magnitude <= 2 ? 1.25 : 1);
      t.color = alpha(pal.ink2, Math.min(1, a));
      t.width = ky < 5 ? 1 : q.magnitude <= 1 ? 1.6 : 1.2;
      t.dash = undefined;
      t.cuts = p.cuts?.get(i);
    }
    drawLifeTrail(ctx, t);
    if (p.lines && t.x1 > t.x0 + 1 && t.x1 > 0 && t.x0 < cam.w) p.lines.add({ x: t.x0, y: t.y - 1.5, w: t.x1 - t.x0, h: 3 });
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
    const y0 = cam.sy(n.parentLane);
    const y1 = cam.sy(n.lane);
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
            const my = cam.sy(v.nodes[mi2].lane);
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
      const husband = (ri !== undefined ? v.nodes[ri].satelliteOf : null) ?? byId.get(n.person)?.spouses[0]?.id ?? null;
      const q = byId.get(n.person);
      if (!q) continue;
      notes.push({ text: ghostNote(n.person, husband), x: cam.sx(v.X0[i]), y: cam.sy(n.lane), at: 'star', r: starRadius(q.magnitude, p.zoomScale) });
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
    if (!n.satelliteOf) continue;
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
      yH: cam.sy(v.nodes[hi].lane),
      yW: cam.sy(n.lane),
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
    if (!n.ghost) continue;
    const ri = v.indexOf(n.person);
    const husband = (ri !== undefined ? v.nodes[ri].satelliteOf : null) ?? byId.get(n.person)?.spouses[0]?.id ?? null;
    const q = byId.get(n.person);
    if (!q) continue;
    notes.push({ text: ghostNote(n.person, husband), x: cam.sx(v.X0[i]), y: cam.sy(n.lane), at: 'star', r: starRadius(q.magnitude, p.zoomScale) });
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
  const colors = map.keys.slice(0, 16).map((_, i) => branchColor(i, bf.theme));
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
}

/**
 * Путь рисуется в этом кадре: «всегда» — да; длинная связь целиком ('full') — только раскрытой (наведение, выбор, семья
 * выбранного), её обрывки ('short') — только свёрнутой.
 */
export function linkShown(q: Pick<LinkPath, 'when' | 'union' | 'ks'>, d: Pick<LinkDraw, 'expanded' | 'hover' | 'selected' | 'preview'>): boolean {
  if (q.when === 'always') return true;
  const open = (!!q.union && d.expanded.has(q.union)) || q.ks === d.hover || q.ks === d.selected || d.preview.has(q.ks);
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

/** Цвет ветви у пути к потомкам выбранного (решение 69, § 9): зубец — цветом ребёнка; ствол — общим цветом детей ветви. */
function pathBranch(bf: ReturnType<typeof branchFrame>, p: Pass, q: LinkPath): string | null {
  if (!bf.map || q.kind === 'bar' || q.kind === 'jog' || q.kind === 'clan') return null;
  const c = commonBranch(bf, p, q.ends, 1);
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
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  const box = pathBoxes(d.frame);
  const paths = d.frame.paths;
  for (let i = 0; i < paths.length; i++) {
    // путь вне холста — сразу мимо (из тысяч путей неба на холсте — десятки); рамка — из рамок кадра связей (без
    // сдвига): сдвиг монотонен, поэтому крайние точки те же
    if (box[4 * i + 1] + dx < -4 || box[4 * i] + dx > W + 4 || box[4 * i + 3] + dy < -4 || box[4 * i + 2] + dy > H + 4) continue;
    const q = paths[i];
    if (q.kind === 'ribbon' || !linkShown(q, d)) continue;
    const hot = q.ks === d.hover || d.preview.has(q.ks);
    const a0 = hot || d.lit(q) ? 1 : d.alpha;
    if (a0 <= 0.01) continue;
    const pts = q.pts;
    const e = hot ? 1 : pathEmph(p, q) * p.s.intro;
    ctx.globalAlpha = g0 * a0 * (q.style === 'faint' && !hot ? FAINT_A : 1);
    ctx.strokeStyle = hot ? pal.ink : (pathBranch(bf, p, q) ?? alpha(pal.ink2, Math.min(1, LINK_TONE * e)));
    ctx.lineWidth = hot ? 2 : 1;
    ctx.setLineDash(LINK_DASH[q.style]);
    ctx.beginPath();
    if (q.kind === 'bar') {
      for (const off of [-BAR_GAP / 2, BAR_GAP / 2]) {
        ctx.moveTo(pts[0] + dx + off, pts[1] + dy);
        for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k] + dx + off, pts[k + 1] + dy);
      }
    } else {
      ctx.moveTo(pts[0] + dx, pts[1] + dy);
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k] + dx, pts[k + 1] + dy);
    }
    ctx.stroke();
    if (p.lines)
      for (let k = 0; k + 3 < pts.length; k += 2) {
        const ax = pts[k] + dx;
        const ay = pts[k + 1] + dy;
        const bx = pts[k + 2] + dx;
        const by = pts[k + 3] + dy;
        p.lines.add({ x: Math.min(ax, bx) - 1.5, y: Math.min(ay, by) - 1.5, w: Math.abs(bx - ax) + 3, h: Math.abs(by - ay) + 3 });
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
}

const nameOf = (id: string) => byId.get(id)?.name ?? id;
/** «Симеон, 23 Б»: имя и атласная координата лица на общей раскладке (ТЗ § 3.1, как в указателе). */
function nameAt(v: SkyContext, id: string): string {
  const i = v.indexOf(id);
  const n = i === undefined ? undefined : v.model.nodes[i];
  return n ? `${nameOf(id)}, ${atlasCoord(n.t0, n.lane)}` : nameOf(id);
}
/** Родство дочери (сына), стоящей у мужа (§ 4.2 п. 1): «дочь Ревекка — жена Исаака»; падеж — ru.ts, без него — через тире. */
function kidAway(kid: string, parent: string): string {
  const k = byId.get(kid);
  if (!k) return '';
  const word = k.sex === 'f' ? 'дочь' : 'сын';
  const spouse = (unionsOfKid(kid).find((u) => u.a && u.b && (u.a === kid || u.b === kid)) ?? null);
  const other = spouse ? (spouse.a === kid ? spouse.b : spouse.a) : null;
  const o = other ? byId.get(other) : undefined;
  if (!o) return `${word} ${k.name}`;
  const gen = nameCase(o.name, o.sex, 'gen', o.unnamed, o.alt);
  const role = k.sex === 'f' ? 'жена' : 'муж';
  void parent;
  return gen ? `${word} ${k.name} — ${role} ${gen}` : `${word} ${k.name}; ${role} — ${o.name}`;
}
/** Сторона ребёнка у обрывка к родной семье: «дочь Вафуила»; без падежа — «отец — Вафуил». */
function kidOf(kid: string, parent: string): string {
  const k = byId.get(kid);
  const q = byId.get(parent);
  if (!k || !q) return '';
  const gen = nameCase(q.name, q.sex, 'gen', q.unnamed, q.alt);
  if (gen) return `${k.sex === 'f' ? 'дочь' : 'сын'} ${gen}`;
  return `${q.sex === 'f' ? 'мать' : 'отец'} — ${q.name}`;
}
const unionsOfKid = (id: string) => ALL_UNIONS.of.get(id) ?? [];

/** Перечень целей обрывка: до трёх имён с координатами, дальше — «ещё N». */
function targetsText(v: SkyContext, ids: readonly string[]): string {
  const head = ids.slice(0, 3).map((id) => nameAt(v, id));
  return ids.length > 3 ? `${head.join('; ')}; ещё ${ids.length - 3}` : head.join('; ');
}

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
  // поле подписи — с запасом над строкой: курсив малого кегля не встаёт вплотную к органам неба и соседним подписям
  const boxes = cands.map((c) => {
    const b = textBox(c.tx, c.ty, w, size);
    return { x: b.x, y: b.y - 5, w: b.w, h: b.h + 5 };
  });
  const b = claim(v, p, boxes, 'plate', t.text, { id: t.id, hold });
  if (!b || hold) return null;
  const c = cands[boxes.indexOf(b)];
  const g0 = ctx.globalAlpha;
  ctx.globalAlpha = g0 * a;
  drawFamilyText(ctx, { halo: v.pal.halo, ink3: v.pal.ink2 }, t.text, c.tx, c.ty, v.coarse);
  ctx.globalAlpha = g0;
  return b;
}

/**
 * Подписи связей (после подписей звёзд, если есть место): цели обрывков длинных связей и родовых черт — «Симеон, 23 Б;
 * Левий, 23 В», «Иаков, 22 П» (Г11, Г12; ТЗ § 3.1); обрывок дочери, стоящей у мужа, — «дочь Ревекка — жена Исаака»
 * (§ 4.2 п. 1); имя матери у ромба на следе отца, если союзов с детьми два и больше (Г8), и «Сиф и его жена» у ромба
 * союза с неназванной женой (решение 75). Имя второго супруга у ромба бездетного брака (этап 13, К6) — вторым проходом,
 * late, после подписей звёзд: оно не отнимает места у имён звёзд. Для проверок пишет canvas[data-link-texts]: «текст@x,y»
 * через «|» (оба прохода вместе).
 */
export function drawLinkLabels(v: SkyContext, p: Pass, d: LinkDraw, late = false) {
  const { cam } = v;
  const out: string[] = [];
  const onScreen = (x: number, y: number) => x > v.letterW && x < cam.w && y > v.openTop && y < cam.vp.b;
  // имя матери у ромба — раньше подписей обрывков (этап 13): после укладки по матерям (решение 95) дети Давида стоят у
  // своих матерей далеко от него, и подписи обрывков «Авессалом, 32 Н» у ромбов его следа занимали место имён матерей
  for (const n of d.frame.nodes) {
    if (n.mother === null || n.kind !== 'union' || !!n.late !== late) continue;
    const x = n.x + d.dx;
    const y = n.y + d.dy;
    if (!onScreen(x, y)) continue;
    // имя матери — только у союза в полную силу: погашенный выделением союз (и «вероятно» живые на меридиане) подписи не
    // получает — бледная подпись не держала бы контраста 4,5 : 1; её место остаётся за ней (соседи не переезжают)
    const a = Math.min(1, p.emph(n.owner), p.emph(n.from), n.mother ? p.emph(n.mother) : 1);
    if (!(d.alpha > 0.5 || d.expanded.has(n.union))) continue;
    const u = ALL_UNIONS.byId.get(n.union);
    const text = n.mother ? nameOf(n.mother) : u ? unionName(u) : '';
    if (!text) continue;
    const b = putLinkText(v, p, { text, x: x + 5, y, dir: 0, right: true, id: n.union, side2: true }, 1, a < 0.99);
    if (b) out.push(`${text}@${Math.round(x)},${Math.round(y)}`);
  }
  for (const st of late ? [] : d.frame.stubs) {
    const lit = st.targets.every((id) => p.emph(id) > 0.5);
    if (st.kind !== 'kid' && !linkShown({ when: 'short', union: st.union, ks: st.ks }, d)) continue;
    const a = lit ? 1 : d.alpha;
    if (a < 0.5) continue;
    const x = st.x + d.dx;
    const y = st.y + d.dy;
    if (!onScreen(x, y)) continue;
    const parent = st.side === 'child' ? st.targets[0] : null;
    let text: string;
    if (st.kind === 'kid') {
      const kid = st.key.kind === 'child' ? st.key.child : st.targets[0];
      const par = st.side === 'child' ? st.targets[0] : null;
      text = st.side === 'parent' ? kidAway(kid, '') : par ? kidOf(kid, par) : '';
    } else text = st.side === 'parent' ? targetsText(v, st.targets) : parent ? nameAt(v, parent) : '';
    if (!text) continue;
    // подпись обрывка — в полную силу или никак: бледная подпись не держала бы контраста 4,5 : 1; погашенная держит место
    const e = Math.min(1, Math.max(...st.targets.map((id) => p.emph(id))));
    const hold = e < 0.99 && !lit;
    const b = putLinkText(v, p, { text, x, y, dir: st.dir, right: st.side === 'parent' || st.dir !== 0, id: st.union ?? st.ks }, 1, hold);
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
    const y = cam.sy(n.lane);
    if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
    // куда смотрит обрывок: к строке лица вне показа на общей раскладке; несколько обрывков одного лица — веером
    const j = v.indexOf(st.to);
    const lf = v.model.nodes[i].lane;
    const lt = j === undefined ? lf : v.model.nodes[j].lane;
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
