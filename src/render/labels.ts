/**
 * Подписи неба (ТЗ § 3.1, «подписи без наложений»; § 8.5; E1; MAP-05…11, 21, UX-33, MOB-01, 02, VIS-40): пороги масштаба,
 * отбор, размещение и рисование подписей звёзд, названий созвездий, скоплений, меридианов событий, «липких» имён следов
 * у левого края; проверка наложений и её замер.
 *
 * Пороги (LabelCache) считаются один раз на размер и масштаб «всего неба»: для каждой подписи — уровень масштаба,
 * начиная с которого она помещается на всех более крупных уровнях в одном из четырёх положений (справа, слева, сверху,
 * снизу), и положение на каждом уровне. В кадре подписи только отбираются по порогу (с гистерезисом 10 %), а на масштабе
 * семьи (полоса от 14 px) кандидаты — все видимые звёзды.
 *
 * Каждая подпись в кадре проходит одну проверку (Placer): не выходит из открытого неба (не срезается кромкой — не рисуется),
 * не ложится на органы неба и оверлеи (резерв: карточки у звезды, подсказка), на указатели у края, на другие подписи
 * любого рода и на чужие звёзды. Порядок — по старшинству: выбранное лицо → отметки, путь, семья выбранного → меридианы
 * событий → скопления → названия созвездий → звёзды по степени интереса → «липкие» имена следов → живые на меридиане.
 *
 * Правила подписи звезды (этап 14, решения 139–144): знаки — истинными фигурами с кольцами состояний (glyphs.ts,
 * glyphExtent; marks.ts, ringOuter), имя — в 3 px от наружного кольца, у царя сбоку не ближе r + 7; чужой знак — жёсткое
 * препятствие (под именем, ближе своего, в строке у начала или конца имени); подписи одной строки — не ближе 0,5 кегля;
 * через середину строки не идут связи, ленты, дуги и маршрут выбранной связи (Pass.onLine); выноска — не длиннее 40 px,
 * не через подписи, выноски, знаки и связи. Нет места — подпись скрыта (LabelLedger.hidden): она встаёт при наведении,
 * фокусе и выборе (явное раскрытие — последним проходом, поверх знаков), экранный диктор читает лицо по списку. Кегль
 * не уменьшается.
 *
 * Замер (LabelLedger, measureLabels): каждая нарисованная в кадре подпись оставляет прямоугольник — тот же, что
 * проверяло размещение. Число пересекающихся пар — «наложения». Небо отдаёт замер в атрибут
 * `.sky[data-labels="N/M"]`: N — нарисовано подписей, M — наложений (для проверок этапа 4); на холсте —
 * `data-named="n/m"`: подписано n из m видимых звёзд.
 */
import { KX_MIN } from './camera.ts';
import { starRadius, roleSigla, type GlyphExt } from './glyphs.ts';
import { alpha } from './color.ts';
import { CONSTELLATION_DIM, DIM, likelyAlpha, WORK_DIM } from './dim.ts';

/** Иисус Христос: подпись — наивысшего приоритета после выбранного (MOB-53). */
const MESSIAH = 'iisus';
import { mapFont, mapSize, nameFontWith, nameSize, siglaFont, textScale, T_MAP_S, T_NOTE, T_UI_S } from './type.ts';
import { byId, graph, groupById, lines } from '../data/atlas.ts';
import { linkRoles } from '../ui/linkwords.ts';
import { primaryChildren, siblings } from '../engine/graph.ts';
import { refText } from '../engine/kinship.ts';
import { BOOK_INDEX, parseRef } from '../engine/books.ts';
import { cross, hits, type Rect } from './rect.ts';
import type { Pass, SkyContext } from './sky.ts';
import { drawMotherNames, hasGlides } from './trails.ts';
import { laneAt, starLaneOf } from '../engine/stays.ts';
import type { NodeRow } from '../data/atlas.ts';

/** Сколько самых значимых живых подписать сверх обычных порогов, когда стоит меридиан (D13; IX-34). */
const MERIDIAN_EXTRA = 8;
/** Узкое небо (решение 144; M2): видимая часть уже стольких px — при выбранном лице подписи только у его рода и лент. */
export const NARROW_SKY = 600;
/** Масштаб семьи: с этой высоты полосы подписываются все звёзды, которым хватает места (E1; MAP-05, UX-33). */
export const FAMILY_KY = 14;
/** Гистерезис порога: подпись, видная в прошлом кадре, гаснет на 10 % масштаба позже, чем появляется (ТЗ § 8.5). */
const HYSTERESIS = 2 * Math.log2(1.1);
/** Уровней масштаба в кэше порогов: 2·log2(kx / KX_MIN) от 0 до 25 (KX_MAX). */
const LEVELS = 26;

// ---------- геометрия подписи звезды ----------

/** Положение подписи у звезды: справа, слева, сверху, снизу. */
export type Side = 'r' | 'l' | 't' | 'b';
const SIDES: Side[] = ['r', 'l', 't', 'b'];

/** Верх и низ строки относительно базовой линии в долях кегля (заглавные и выносные вниз у шрифта имён). */
const ASC = 0.8;
const DESC = 0.24;

/** Зазор от наружного края знака (с кольцами состояний) до текста подписи, px (решение 140). */
export const LABEL_GAP = 3;
/** Наименьший боковой зазор у царя от центра: r + 7 — черта царя не читается тире у конца имени (C9). */
export const KING_SIDE = 7;

/**
 * Место подписи шириной w с кеглем size у звезды (x, y). r — радиус диска или истинные границы знака с кольцами
 * состояний (решение 140: зазор — наружный край наибольшего кольца + 3 px). Справа и слева подпись стоит по середине
 * звезды, не ближе r + 5 от центра, у царя — не ближе r + 7 (черта царя над диском не читается тире; MAP-11, VIS-40, C9).
 * Сверху — выше черты царя и колец, снизу — под диском и кольцами. Прямоугольник — строка с полем 1,5 px: тот же, что
 * проверяется на наложения.
 */
export function spot(side: Side, x: number, y: number, r: number, w: number, size: number, king = false, e?: GlyphExt, m?: { asc: number; desc: number }) {
  const ex = e ?? { l: r, r, t: r + (king ? 3.5 : 0), b: r };
  const sideGap = (d: number) => Math.max(r + (king ? KING_SIDE : 5), d + LABEL_GAP);
  const tx = side === 'r' ? x + sideGap(ex.r) : side === 'l' ? x - sideGap(ex.l) - w : x - w / 2;
  // над знаком и под ним — по настоящим буквам имени (m), если замерены: без выносных низ строки — базовая линия
  const desc = m ? Math.min(DESC * size, Math.max(0, m.desc)) : DESC * size;
  const asc = m ? Math.min(ASC * size, Math.max(0, m.asc)) : ASC * size;
  const ty =
    side === 't'
      ? y - Math.max(r + (king ? 7 : 3.5), ex.t + LABEL_GAP) - desc
      : side === 'b'
        ? y + Math.max(r + 3, ex.b + LABEL_GAP) + asc
        : y + (ASC - DESC) * 0.5 * size;
  return { tx, ty, box: textBox(tx, ty, w, size) };
}

/**
 * Середина строки подписи (решение 141; C4): полоса строчных букв от 0,55 кегля над базовой линией до самой линии —
 * через неё не проходит ни связь, ни лента, ни дуга чужого лица. b — прямоугольник textBox.
 */
export function midBand(b: Rect, size: number): Rect {
  const base = b.y + 1.5 + ASC * size;
  return { x: b.x + 1.5, y: base - 0.55 * size, w: Math.max(0, b.w - 3), h: 0.6 * size };
}

/** Прямоугольник строки с базовой линией ty: поле 1,5 px — ореол подписи. */
export function textBox(tx: number, ty: number, w: number, size: number): Rect {
  return { x: tx - 1.5, y: ty - ASC * size - 1.5, w: w + 3, h: (ASC + DESC) * size + 3 };
}

/** Выноска для звёзд величины 0–1 и лиц линий: подпись отнесена на 14–24 px по диагонали, к ней — тонкая линия (MAP-06). */
const LEADERS: [number, number][] = [[16, -14], [16, 14], [-16, -14], [-16, 14], [24, -22], [24, 22], [-24, -22], [-24, 22]];
/** Отвесные выноски имён лиц линий Мессии под лентой или над ней, px от звезды: за полем косы и её свечения. */
const SPINE_DROP = [14, 20, 26];
/** Дальние выноски — в режиме «В работе» (J4), где подписаны все лица набора: в тесном месте подпись уходит дальше. */
const FAR_LEADERS: [number, number][] = [[36, 0], [-36, 0], [28, -26], [28, 26], [-28, -26], [-28, 26], [38, -12], [38, 12], [-38, -12], [-38, 12]];
/**
 * Выноски последнего прохода (родня выбранного без места по правилам — StarOpts.kin, П1; явно раскрытое имя): веер из 16
 * направлений на 18–40 px — место без чужих знаков ищется вокруг всей звезды, ближние раньше.
 */
const KIN_LEADERS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (const d of [18, 26, 34, 40]) for (let k = 0; k < 16; k++) out.push([Math.round(d * Math.cos((k * Math.PI) / 8)), Math.round(d * Math.sin((k * Math.PI) / 8))]);
  return out;
})();
/** Отрезок от (x, y) к (ax, ay) проходит через прямоугольник a (шаг 3 px). */
function segmentCrosses(a: Rect, x: number, y: number, ax: number, ay: number): boolean {
  const d = Math.hypot(ax - x, ay - y);
  for (let t = 0; t <= d; t += 3) {
    const px = x + ((ax - x) * t) / d;
    const py = y + ((ay - y) * t) / d;
    if (px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h) return true;
  }
  return false;
}
/** Выноски подальше (StarOpts.wide, reach): до 130 px в сторону и 150 px вверх или вниз, ближние раньше; длина — по reach. */
const WIDE_LEADERS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (const dx of [16, 40, 70, 100, 130]) for (const dy of [24, 36, 48, 60, 75, 90, 110, 130, 150]) out.push([-dx, -dy], [-dx, dy], [dx, -dy], [dx, dy]);
  return out.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
})();
function leaderSpot(dx: number, dy: number, x: number, y: number, w: number, size: number) {
  const ax = x + dx;
  const ay = y + dy;
  const tx = dx > 0 ? ax + 2 : ax - 2 - w;
  const ty = ay + (ASC - DESC) * 0.5 * size;
  return { tx, ty, box: textBox(tx, ty, w, size), ax, ay };
}

// ---------- проверка наложений ----------

/**
 * Занятые места кадра: жёсткие (подписи, резерв органов неба, указатели у края) и мягкие (звёзды: подпись не закрывает
 * чужую звезду). Сетка 64 px — проверка без перебора всех прямоугольников.
 */
/**
 * Знак лица в кадре (решение 140): центр, истинные границы с кольцами состояний, непрозрачность и величина. По знакам
 * подписи проверяют принадлежность: имя не ложится на чужой знак, чужой знак не ближе своего, не стоит в строке у имени.
 */
export interface GlyphRef {
  x: number;
  y: number;
  e: GlyphExt;
  id: string;
  /** непрозрачность знака в кадре */
  a: number;
  m: number;
}
/** Прямоугольник знака. */
export const glyphBox = (g: GlyphRef): Rect => ({ x: g.x - g.e.l, y: g.y - g.e.t, w: g.e.l + g.e.r, h: g.e.t + g.e.b });
/** Расстояние между прямоугольниками, px (0 — пересекаются или касаются). */
export function boxGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
/** Знак виден настолько, что имя на нём закрыло бы лицо (как в замере tools/collide.ts: от 0,15). */
export const GLYPH_SEEN = 0.12;
/** Знак яркий: принадлежность имени проверяется по нему (чужой знак ближе своего, в строке у имени). */
export const GLYPH_BRIGHT = 0.45;
/** Чужой знак в строке подписи — не ближе стольких кеглей к её началу или концу (решение 140). */
export const ROW_CLEAR = 0.6;
/** Подписи на одной строке — не ближе стольких кеглей друг к другу (решение 140: «Ардон Хеврон» читалось одним именем). */
export const ROW_GAP = 0.5;
/**
 * У подписи с выноской чужой яркий знак (с кольцом выбора) не ближе стольких px к её рамке (рамка — с полем 1,5 px и
 * высотой строки, так что до букв — 6,5 px и больше): иначе имя читалось бы подписью соседа (решение 140, «у конца
 * выноски чужой знак ближе своего»; порог замера К4 — 6 px до букв).
 */
export const LEADER_CLEAR = 5;
/** Выноска не длиннее 40 px (решение 140, порог К8). */
export const LEADER_MAX = 40;
/** Исключение К8: опорное лицо величины 0 на обзоре без выбранного — выноска до 100 px через пустое небо (MAP-06, MOB-53). */
export const LEADER_WIDE = 100;
/** Исключение К8 для Иисуса Христа (MOB-53): на обзоре без выбранного — выноска до 160 px через пустое небо (знак один такой). */
export const LEADER_MESSIAH = 160;

export class Placer {
  private hard = new Map<number, (Rect & { owner?: string; row?: number })[]>();
  private soft = new Map<number, (Rect & { m: number; id?: string })[]>();
  private glyphs = new Map<number, GlyphRef[]>();
  /** выноски кадра — отрезки x0, y0, x1, y1: новая выноска их не пересекает (решение 140) */
  leaders: number[][] = [];
  private static CELL = 64;
  private static keys(r: Rect): number[] {
    const C = Placer.CELL;
    const out: number[] = [];
    const x0 = Math.floor(r.x / C);
    const x1 = Math.floor((r.x + r.w) / C);
    const y0 = Math.floor(r.y / C);
    const y1 = Math.floor((r.y + r.h) / C);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) out.push((cx + 1024) * 4096 + cy + 1024);
    return out;
  }
  /**
   * Занять место; soft — звезда величины m (её подпись может закрыть только намного более яркая). owner — чьё это место:
   * кольцо конца выбранной связи (Д12) закрыто для чужих имён, а своё имя лица встаёт у своей звезды, как прежде.
   */
  add(r: Rect, soft = false, m = 0, owner?: string) {
    if (owner && !soft) r = { ...r, owner } as Rect & { owner: string };
    for (const k of Placer.keys(r)) {
      if (soft) {
        const a = this.soft.get(k);
        const q = { ...r, m };
        if (a) a.push(q);
        else this.soft.set(k, [q]);
      } else {
        const a = this.hard.get(k);
        if (a) a.push(r);
        else this.hard.set(k, [r]);
      }
    }
  }
  /**
   * Прямоугольник ложится на занятое: жёсткое всегда, звёзды — если withSoft; coverFrom — звёзды этой величины и
   * тусклее закрывать можно (яркое имя на обзоре важнее тусклой точки); self — место этого лица (owner) не мешает;
   * softOnly — только звёзды (есть ли в области место без звёзд, drawGroupNames).
   */
  clash(r: Rect, withSoft = true, coverFrom = 99, self?: string, softOnly = false): boolean {
    for (const k of Placer.keys(r)) {
      if (!softOnly) for (const o of this.hard.get(k) ?? []) if (cross(r, o) && !(self && o.owner === self)) return true;
      if (withSoft) for (const o of this.soft.get(k) ?? []) if (o.m < coverFrom && cross(r, o) && !(self && o.id === self)) return true;
    }
    return false;
  }
  /**
   * Сколько звёзд закрывает r, с весом по яркости (7 − величина): для выбора места, где имя прячет меньше всего. Свой
   * знак (self) не в счёт: рамка строки выше букв, и над знаком она заходит на его кольцо, а буквы — нет.
   */
  cover(r: Rect, self?: string): number {
    const seen = new Set<Rect>();
    let sum = 0;
    for (const k of Placer.keys(r))
      for (const o of this.soft.get(k) ?? [])
        if (!seen.has(o) && cross(r, o) && !(self && o.id === self)) {
          seen.add(o);
          sum += 7 - Math.min(6, o.m);
        }
    return sum;
  }
  /** Площадь, которой r ложится на занятые (жёсткие) прямоугольники, px² — для выбора места, где линии под ним короче. */
  overlap(r: Rect): number {
    const seen = new Set<Rect>();
    let sum = 0;
    for (const k of Placer.keys(r))
      for (const o of this.hard.get(k) ?? []) {
        if (seen.has(o) || !cross(r, o)) continue;
        seen.add(o);
        sum += (Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x)) * (Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y));
      }
    return sum;
  }
  /** Сколько занятых (жёстких) прямоугольников пересекает r — для выбора места с наименьшим числом пересечений. */
  count(r: Rect): number {
    const seen = new Set<Rect>();
    for (const k of Placer.keys(r)) for (const o of this.hard.get(k) ?? []) if (!seen.has(o) && cross(r, o)) seen.add(o);
    return seen.size;
  }
  /** Занять место подписи с кеглем size: соседние подписи на её строке встают не ближе ROW_GAP кегля (решение 140). */
  addLabel(r: Rect, size: number) {
    const q = { ...r, row: size };
    for (const k of Placer.keys(r)) {
      const a = this.hard.get(k);
      if (a) a.push(q);
      else this.hard.set(k, [q]);
    }
  }
  /** Подпись r с кеглем size стояла бы на одной строке ближе ROW_GAP кегля к уже поставленной подписи. */
  rowClash(r: Rect, size: number): boolean {
    const pad = ROW_GAP * size;
    const q = { x: r.x - pad, y: r.y, w: r.w + 2 * pad, h: r.h };
    const yc = r.y + r.h / 2;
    for (const k of Placer.keys(q))
      for (const o of this.hard.get(k) ?? []) {
        if (o.row === undefined || !cross(q, o)) continue;
        // одна строка: середины по высоте ближе половины меньшей высоты
        if (Math.abs(o.y + o.h / 2 - yc) >= Math.min(o.h, r.h) / 2) continue;
        const gap = Math.max(o.x - (r.x + r.w), r.x - (o.x + o.w));
        if (gap < ROW_GAP * Math.min(size, o.row)) return true;
      }
    return false;
  }
  /** Занять место знака лица: мягкое (как звезда величины m) и в указателе знаков для правила принадлежности. */
  addGlyph(g: GlyphRef) {
    const b = glyphBox(g);
    this.add({ ...b, id: g.id } as Rect, true, g.m);
    for (const k of Placer.keys(b)) {
      const a = this.glyphs.get(k);
      if (a) a.push(g);
      else this.glyphs.set(k, [g]);
    }
  }
  /** Знаки, чьи прямоугольники заходят в r (каждый один раз). */
  glyphsIn(r: Rect): GlyphRef[] {
    const out: GlyphRef[] = [];
    const C = Placer.CELL;
    const x0 = Math.floor(r.x / C);
    const x1 = Math.floor((r.x + r.w) / C);
    const y0 = Math.floor(r.y / C);
    const y1 = Math.floor((r.y + r.h) / C);
    const multi = x1 > x0 || y1 > y0;
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++)
        for (const g of this.glyphs.get((cx + 1024) * 4096 + cy + 1024) ?? []) {
          // знак в нескольких клетках — один раз
          if (r.x >= g.x + g.e.r || g.x - g.e.l >= r.x + r.w || r.y >= g.y + g.e.b || g.y - g.e.t >= r.y + r.h) continue;
          if (multi && out.includes(g)) continue;
          out.push(g);
        }
    return out;
  }
  /** Знак лица id в кадре. */
  glyphOf(id: string, x: number, y: number): GlyphRef | undefined {
    return this.glyphsIn({ x: x - 0.5, y: y - 0.5, w: 1, h: 1 }).find((g) => g.id === id);
  }
  /**
   * Правило принадлежности (решение 140; C3, C5): подпись r с кеглем size лица own
   *  — не ложится на чужой знак (видный от GLYPH_SEEN);
   *  — без выноски: чужой яркий знак не ближе к подписи, чем свой (с запасом 1 px), и не стоит в строке подписи ближе
   *    ROW_CLEAR кегля к её началу или концу;
   *  — с выноской (leader): у подписи нет чужого яркого знака ближе 6 px и в строке ближе ROW_CLEAR кегля.
   * cover — знаки этой величины и тусклее закрывать можно (только названия и явное раскрытие: выбранное, наведённое).
   */
  owns(r: Rect, own: GlyphRef | undefined, id: string, size: number, leader = false): boolean {
    const dOwn = own ? boxGap(r, glyphBox(own)) : 0;
    const row = ROW_CLEAR * size;
    const pad = Math.max(row, leader ? 6 : dOwn + 1) + 1;
    for (const g of this.glyphsIn({ x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad })) {
      if (g.id === id || g === own) continue;
      const d = boxGap(r, glyphBox(g));
      // знак — жёсткое препятствие для чужой подписи: нет места — уходит подпись, а не знак (решение 140)
      if (d <= 0 && g.a >= GLYPH_SEEN) return false;
      if (g.a < GLYPH_BRIGHT) continue;
      if (leader ? d < LEADER_CLEAR : own && d < dOwn + 1) return false;
      // в строке подписи: середина знака — по высоте строки, у начала или конца имени
      if (g.y >= r.y && g.y <= r.y + r.h && d < row) return false;
    }
    return true;
  }
  /** Отрезок выноски (x0, y0) → (x1, y1) пересекает уже поставленную выноску. */
  crossesLeader(x0: number, y0: number, x1: number, y1: number): boolean {
    return this.leaders.some((q) => segX(x0, y0, x1, y1, q[0], q[1], q[2], q[3]));
  }
}

/**
 * Линии, которые не проходят через середину строки чужого имени (решения 139, 141): маршруты дуг родства, призраков,
 * выбранной связи и пути родства — до раскладки подписей (контракт 1, marks.ts, overlayRoutes). Сетка 32 px; у каждой
 * ломаной — лица, для которых она своя (её концы): своё имя у своей звезды на ней стоять может.
 */
export class LineHits<T = unknown> {
  private grid = new Map<number, { s: number[]; own: ReadonlySet<string>; ref?: T }[]>();
  private static CELL = 32;
  /** Ломаная x0, y0, x1, y1, … (px холста) с полушириной half, своими лицами own и меткой ref. */
  add(pts: readonly number[], own: ReadonlySet<string>, half = 0, ref?: T) {
    const C = LineHits.CELL;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const s = [pts[k], pts[k + 1], pts[k + 2], pts[k + 3], half];
      const x0 = Math.floor((Math.min(s[0], s[2]) - half) / C);
      const x1 = Math.floor((Math.max(s[0], s[2]) + half) / C);
      const y0 = Math.floor((Math.min(s[1], s[3]) - half) / C);
      const y1 = Math.floor((Math.max(s[1], s[3]) + half) / C);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) continue;
      const e = { s, own, ref };
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) {
          const key = (cx + 2048) * 8192 + cy + 2048;
          const a = this.grid.get(key);
          if (a) a.push(e);
          else this.grid.set(key, [e]);
        }
    }
  }
  /**
   * Прямоугольник r пересекает чужую (не лица id) линию; counts — считается ли отрезок с меткой ref (vertical —
   * отвесный): так подпись пропускает погашенные связи и отвесные стволы, которые под ней прервутся.
   */
  crosses(r: Rect, id: string, counts?: (ref: T | undefined, vertical: boolean) => boolean): boolean {
    const C = LineHits.CELL;
    for (let cx = Math.floor(r.x / C); cx <= Math.floor((r.x + r.w) / C); cx++)
      for (let cy = Math.floor(r.y / C); cy <= Math.floor((r.y + r.h) / C); cy++)
        for (const { s, own, ref } of this.grid.get((cx + 2048) * 8192 + cy + 2048) ?? []) {
          if (own.has(id)) continue;
          const h = s[4];
          if (!segRect(s[0], s[1], s[2], s[3], r.x - h, r.y - h, r.x + r.w + h, r.y + r.h + h)) continue;
          if (counts && !counts(ref, Math.abs(s[0] - s[2]) < 0.5)) continue;
          return true;
        }
    return false;
  }
}

/** Отрезок (a, b) задевает прямоугольник [x0, x1] × [y0, y1] (отсечение Лианга — Барски). */
function segRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const P = [-dx, dx, -dy, dy];
  const Q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return false;
      continue;
    }
    const t = Q[i] / P[i];
    if (P[i] < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Лицо, чья подпись под точкой (x, y) px холста (контракт 2, решение 154): рамка подписи звезды, не ниже least px по
 * высоте (касание пальцем). Из нескольких — ближайшая по середине рамки. null — подписи нет.
 */
export function labelAt(boxes: readonly LabelBox[], x: number, y: number, least = 24): string | null {
  let best: string | null = null;
  let bd = Infinity;
  for (const b of boxes) {
    if (b.kind !== 'star' || !b.id) continue;
    const h = Math.max(b.h, least);
    const y0 = b.y + b.h / 2 - h / 2;
    if (x < b.x || x > b.x + b.w || y < y0 || y > y0 + h) continue;
    const d = Math.abs(y - (b.y + b.h / 2)) + Math.abs(x - (b.x + b.w / 2)) / 8;
    if (d < bd) {
      bd = d;
      best = b.id;
    }
  }
  return best;
}

/** Отрезки (a, b) и (c, d) пересекаются (общие концы не в счёт). */
function segX(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(cx, cy, dx, dy, ax, ay);
  const d2 = o(cx, cy, dx, dy, bx, by);
  const d3 = o(ax, ay, bx, by, cx, cy);
  const d4 = o(ax, ay, bx, by, dx, dy);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// ---------- пороги подписей ----------

/** Кэш подписей: пороги масштаба, положения и замеренные ширины имён и сокращений ролей по узлам неба. */
export class LabelCache {
  /** уровень масштаба 2·log2(kx / KX_MIN), с которого подписан узел; Infinity — не подписывается по порогу */
  level = new Float64Array(0);
  /** положение подписи на каждом уровне (номер в SIDES): i·LEVELS + уровень */
  side = new Uint8Array(0);
  /** ширина имени (кегль по величине) — замеряется один раз, а не в каждом кадре */
  nameW = new Float64Array(0);
  /**
   * настоящие верх и низ букв имени от базовой линии, px (measureText: actualBoundingBox): подпись над знаком стоит
   * в 3 px от колец по своим буквам, а не по выносным, которых в имени нет (решение 140); NaN — не замерено
   */
  nameAsc = new Float64Array(0);
  nameDesc = new Float64Array(0);
  /** ширина сокращения роли с отступом; −1 — ещё не замерена */
  siglaW = new Float64Array(0);
  /** место узла в порядке степени интереса (Фурнас): величина, линии Мессии, значимость */
  rank = new Int32Array(0);
  /** узел подписан в прошлом кадре (гистерезис) */
  shown = new Uint8Array(0);
  private key = '';
  /** часть ключа, от которой зависят узлы и шрифты (модель, укладка, строки): без неё прежние пороги неприменимы */
  private core = '';
  /** отложенный пересчёт порогов (смена размера неба: открылась карточка, выбор лица) — после того, как небо постоит */
  private later: ReturnType<typeof setTimeout> | null = null;

  /** Сбросить пороги: догрузился шрифт (ширины имён). Следующий кадр считает их заново. */
  invalidate() {
    this.key = '';
  }

  /**
   * Пороги для текущей модели, масштаба времени, высоты холста и масштаба «всего неба». Смена одного только вида (высота
   * и ширина неба — карточка открылась при выборе, «всё небо», пропорция полос) не пересчитывает пороги в кадре: подписи
   * стоят по прежним, а новые считаются, когда небо постоит (С1: кадр выбора и перелёта — без пересчёта порогов)
   */
  ensure(v: SkyContext) {
    const f = v.cam.fitK;
    // сжатие полос (J4, J5) меняет места звёзд по вертикали: пороги считаются по строкам экрана
    // и пропорция полос (J1): высота строки меняет места подписей по вертикали
    // и лица линий на нитях в режиме «только линии» (MAP-71): узлы кадра — не узлы раскладки
    const core = `${v.model.id}|${Math.round(v.lambda * 4)}|${v.coarse}|${v.rowsKey}|${v.cam.focusLanes}|${v.nodes === v.model.nodes}|${v.nodes.length}|${textScale()}`;
    const key = `${core}|${v.cam.h}|${f ? `${f.kx.toPrecision(3)} ${f.ky.toPrecision(3)}` : ''}|${v.cam.lanes.toFixed(3)}`;
    if (key === this.key) return;
    if (this.key && core === this.core && this.level.length === v.nodes.length) {
      // изменился только вид: пересчёт — когда небо постоит 250 мс (в движении — прежние пороги, Я33)
      if (this.later) clearTimeout(this.later);
      if (typeof setTimeout === 'function' && typeof window !== 'undefined') {
        this.later = setTimeout(() => {
          this.later = null;
          if (v.scaleMoving) return v.cam.onChange();
          this.compute(v, key, core);
          v.cam.onChange();
        }, 250);
        return;
      }
    }
    this.compute(v, key, core);
  }

  private compute(v: SkyContext, key: string, core: string) {
    if (this.later) clearTimeout(this.later);
    this.later = null;
    this.key = key;
    this.core = core;
    const nodes = v.nodes;
    const n = nodes.length;
    this.level = new Float64Array(n).fill(Infinity);
    this.side = new Uint8Array(n * LEVELS);
    this.shown = new Uint8Array(n);
    const ctx = v.ctx;
    const widths = new Float64Array(n);
    this.nameW = widths;
    this.nameAsc = new Float64Array(n).fill(NaN);
    this.nameDesc = new Float64Array(n).fill(NaN);
    this.siglaW = new Float64Array(n).fill(-1);
    // место подписи в порогах — с «†» младенца (MAP-68); ширина имени — шрифтом узла (курсив у лица без времени)
    const full = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = byId.get(nodes[i].person)!;
      if (nodes[i].ghost) continue;
      ctx.font = labelFontOf(v, i);
      const mt = ctx.measureText(p.name);
      widths[i] = mt.width;
      if (Number.isFinite(mt.actualBoundingBoxAscent) && Number.isFinite(mt.actualBoundingBoxDescent)) {
        this.nameAsc[i] = mt.actualBoundingBoxAscent;
        this.nameDesc[i] = mt.actualBoundingBoxDescent;
      }
      full[i] = widths[i] + (infantAt(v, i) ? ctx.measureText(DAGGER).width : 0);
    }
    const order = [...Array(n).keys()]
      .filter((i) => !nodes[i].ghost)
      .sort((a, b) => {
        const pa = byId.get(nodes[a].person)!;
        const pb = byId.get(nodes[b].person)!;
        return pa.magnitude - pb.magnitude || Number(nodes[b].spine) - Number(nodes[a].spine) || pb.prominence - pa.prominence || a - b;
      });
    this.rank = new Int32Array(n).fill(n);
    order.forEach((i, k) => (this.rank[i] = k));
    const grids: Map<number, number[][]>[] = Array.from({ length: LEVELS }, () => new Map());
    const cell = 96;
    const cellKey = (cx: number, cy: number) => cx * 1_000_003 + cy;
    for (const i of order) {
      const p = byId.get(nodes[i].person)!;
      // имена скоплений (E2) подписываются только на масштабе семьи, в сетке
      if (nodes[i].trail === 'list') continue;
      const size = nameSize(p.magnitude, v.coarse);
      const king = p.roles.includes('king') || p.roles.includes('queen');
      const boxAt = (lv: number, sd: Side) => {
        const kx = KX_MIN * Math.pow(2, lv / 2);
        const ky = v.cam.kyFor(kx);
        const r = starRadius(p.magnitude, zoomScaleFor(ky));
        const b = spot(sd, v.X0[i] * kx, -v.rowOf(starLaneOf(nodes[i])) * ky, r, full[i], size, king).box;
        return [b.x, b.y, b.x + b.w, b.y + b.h];
      };
      const fits = (lv: number, b: number[]) => {
        const g = grids[lv];
        for (let cx = Math.floor(b[0] / cell); cx <= Math.floor(b[2] / cell); cx++)
          for (let cy = Math.floor(b[1] / cell); cy <= Math.floor(b[3] / cell); cy++)
            for (const o of g.get(cellKey(cx, cy)) ?? []) if (b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3]) return false;
        return true;
      };
      // минимальный уровень, начиная с которого подпись помещается (в одном из положений) на всех более крупных уровнях
      const chosen = new Int8Array(LEVELS).fill(-1);
      let found = Infinity;
      for (let lv = LEVELS - 1; lv >= 0; lv--) {
        let k = -1;
        for (let s = 0; s < SIDES.length && k < 0; s++) if (fits(lv, boxAt(lv, SIDES[s]))) k = s;
        if (k < 0) break;
        chosen[lv] = k;
        found = lv;
      }
      if (found === Infinity) continue;
      // зоны «пустоты» у очень мелких звёзд на обзоре не подписываем
      // величины проявляются по ступеням: 6-я — к масштабу семьи (полоса 14 px ≈ уровень 10), дальше подписываются все
      const minLv = [0, 2, 4, 6, 8, 9, 10][Math.max(0, Math.min(6, p.magnitude))];
      found = Math.max(found, minLv);
      this.level[i] = found;
      for (let lv = found; lv < LEVELS; lv++) {
        const k = chosen[lv];
        this.side[i * LEVELS + lv] = k;
        const b = boxAt(lv, SIDES[k]);
        const g = grids[lv];
        for (let cx = Math.floor(b[0] / cell); cx <= Math.floor(b[2] / cell); cx++)
          for (let cy = Math.floor(b[1] / cell); cy <= Math.floor(b[3] / cell); cy++) {
            const ck = cellKey(cx, cy);
            const a = g.get(ck);
            if (a) a.push(b);
            else g.set(ck, [b]);
          }
      }
    }
  }
}

/** Масштаб знаков по высоте полосы — один для звёзд, подписей и порогов. */
export const zoomScaleFor = (ky: number) => Math.max(0.7, Math.min(1.25, ky / 18));

// ---------- замер наложений ----------

/**
 * Что за подпись: имя звезды, название созвездия, пояснение на пустом небе, указатель у края, скопление (E2), меридиан
 * события (E7), «липкое» имя следа у левого края (E1), надписи рамки (линейка, служебная строка, кромки), знак
 * свёрнутого (J5), номер лица линии у бусины (mark; MAP-59), точка союза в небе «набор» (plate; решения 70, 76, plates.ts).
 */
export type LabelKind = 'star' | 'group' | 'note' | 'edge' | 'cluster' | 'event' | 'sticky' | 'frame' | 'fold' | 'mark' | 'plate';

/** Нарисованная подпись: прямоугольник в px холста, текст и лицо (у имени звезды и указателя). */
export interface LabelBox extends Rect {
  kind: LabelKind;
  text: string;
  id?: string;
}

/** Подписи, нарисованные в последнем кадре (по порядку рисования). */
export class LabelLedger {
  boxes: LabelBox[] = [];
  /** видимых звёзд, которые можно подписать, и сколько из них подписано (E1: на масштабе семьи — не меньше 90 %) */
  stars = 0;
  named = 0;
  /** в режиме «В работе» (J4) — лица видимых звёзд без подписи (для проверок: все лица набора подписаны) */
  unnamed: string[] = [];
  /**
   * скрытые подписи (контракт 2, решение 140): лица видимых в окне звёзд, чьей подписи по правилам не нашлось места или
   * чья подпись на этом масштабе не положена. Подпись появится при наведении, фокусе или выборе; экранный диктор
   * читает лицо по этому списку. По порядку степени интереса.
   */
  hidden: string[] = [];
  reset() {
    this.boxes = [];
    this.stars = 0;
    this.named = 0;
    this.unnamed = [];
    this.hidden = [];
  }
  add(kind: LabelKind, text: string, r: Rect, id?: string) {
    const b: LabelBox = { kind, text, x: r.x, y: r.y, w: r.w, h: r.h };
    if (id) b.id = id;
    this.boxes.push(b);
  }
}

export interface LabelStats {
  /** прямоугольники нарисованных подписей */
  boxes: LabelBox[];
  /** число пересекающихся пар */
  overlaps: number;
  /** пересекающиеся пары: номера в boxes */
  pairs: [number, number][];
}

/** Замер наложений: какие пары подписей пересекаются. Проход по x — без перебора всех пар. */
export function measureLabels(boxes: readonly LabelBox[]): LabelStats {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].x - boxes[b].x);
  const pairs: [number, number][] = [];
  for (let k = 0; k < order.length; k++) {
    const a = boxes[order[k]];
    for (let j = k + 1; j < order.length; j++) {
      const b = boxes[order[j]];
      if (b.x >= a.x + a.w) break;
      if (cross(a, b)) pairs.push(order[k] < order[j] ? [order[k], order[j]] : [order[j], order[k]]);
    }
  }
  return { boxes: [...boxes], overlaps: pairs.length, pairs };
}

// ---------- общий помощник: подпись в свободном месте ----------

/** Строка в открытом небе: не выходит за кромки (не срезается — не рисуется). */
export function insideSky(v: SkyContext, b: Rect): boolean {
  // у нижнего края — 4 px запаса: кромка листа карточки на телефоне стоит на px-другой выше края окна неба (К6)
  return b.x > v.letterW + 2 && b.x + b.w < v.cam.w - 4 && b.y >= v.openTop && b.y + b.h <= v.cam.vp.b - 4;
}

/**
 * Первое свободное место из candidates: внутри открытого неба, не на резерве и не на занятом. Занимает его и пишет
 * в замер. Для подписей любых слоёв (пути родства, лент, призраков): так они проходят ту же проверку наложений.
 * hold — только держать место, в замер не писать: подпись, погашенная выделением или меридианом, не рисуется, а место
 * остаётся за ней, и соседние подписи при наведении меридиана не переезжают (подписи не мигают; ТЗ § 3.1).
 */
/**
 * Подпись у точки (решение 160: имя матери и подпись союза у ромба): x, y — точка (ромб), near — сколько первых мест стоят
 * у самой точки (дальше — с выноской), person — лицо подписи (его звезда своя, а не чужая).
 */
export interface ClaimAnchor {
  x: number;
  y: number;
  near: number;
  person?: string;
}

/**
 * Правило принадлежности для подписи у точки (решения 140, 160): под рамкой нет чужого знака; у места при самой точке
 * чужой яркий знак не ближе рамки, чем точка; у места на выноске — не ближе LEADER_CLEAR, и сама выноска не идёт через
 * чужой знак. Иначе подпись у ромба читалась бы именем чужой звезды («Лия» у кольца Рахили).
 */
function anchorOwns(p: Pass, b: Rect, a: ClaimAnchor, leader: boolean): boolean {
  const dx = Math.max(0, b.x - a.x, a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - a.y, a.y - (b.y + b.h));
  const dA = Math.hypot(dx, dy);
  const pad = Math.max(leader ? LEADER_CLEAR : dA + 1, 6) + 1;
  for (const g of p.placer.glyphsIn({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad })) {
    if (a.person && g.id === a.person) continue;
    const d = boxGap(b, glyphBox(g));
    if (d <= 0 && g.a >= GLYPH_SEEN) return false;
    if (g.a < GLYPH_BRIGHT) continue;
    if (leader ? d < LEADER_CLEAR : d < dA + 1) return false;
  }
  if (leader) {
    // выноска — от точки к ближнему углу рамки: через чужой знак не идёт
    const ex = Math.max(b.x, Math.min(a.x, b.x + b.w));
    const ey = Math.max(b.y, Math.min(a.y, b.y + b.h));
    const len = Math.hypot(ex - a.x, ey - a.y);
    for (let t = 6; t < len; t += 3) {
      const px = a.x + ((ex - a.x) * t) / len;
      const py = a.y + ((ey - a.y) * t) / len;
      if (p.placer.glyphsIn({ x: px - 1, y: py - 1, w: 2, h: 2 }).some((g) => g.id !== a.person && g.a >= GLYPH_SEEN)) return false;
    }
  }
  return true;
}

export function claim(v: SkyContext, p: Pass, candidates: Rect[], kind: LabelKind, text: string, o: { id?: string; soft?: boolean; coverFrom?: number; hold?: boolean; softInset?: number; anchor?: ClaimAnchor; strict?: boolean } = {}): Rect | null {
  // названия, скопления, пояснения и подписи связей не ложатся на ленты линий Мессии: ленты — главное на небе
  // подписи связей при лентах по маршрутам — по самой ленте (Pass.onRibbon): рамка шага от родителя до ребёнка закрыла бы
  // весь след Давида с ромбами его союзов
  const exact = kind === 'plate' && p.onRibbon;
  const avoid = !exact && (kind === 'group' || kind === 'cluster' || kind === 'note' || kind === 'event' || kind === 'plate') ? p.ribbonBoxes : undefined;
  // соседняя подпись на той же строке — не ближе 0,5 кегля (решение 140: «Авигея Вирсавия» читалось одним именем)
  // (номер лица линии у бусины — «Мф 17» — стоит в своей строке у бусины, его место задаёт лента)
  const row = (b: Rect) => kind !== 'event' && kind !== 'mark' && p.placer.rowClash(b, Math.max(1, (b.h - 3) / (ASC + DESC)));
  // softInset — звёзды проверяются по строке с полем 1 px, а не 2 px рамки (название созвездия: поле рамки — для соседних
  // подписей; прописные с выносом «О» выходят за строку на долю px — поле 1 px их покрывает)
  const k = o.softInset ?? 0;
  const free = (b: Rect) => (k ? !p.placer.clash(b, false) && !((o.soft ?? true) && p.placer.clash({ x: b.x + k, y: b.y + k, w: b.w - 2 * k, h: b.h - 2 * k }, true, o.coverFrom)) : !p.placer.clash(b, o.soft ?? true, o.coverFrom));
  const an = o.anchor;
  const owns = (b: Rect) => !an || anchorOwns(p, b, an, candidates.indexOf(b) >= an.near);
  // название созвездия — с полем 4 px от органов неба и карточек: его разрядка шире строки, и рамка с полем 2 px вставала
  // вплотную к блоку (C6)
  const res = (b: Rect) => (kind === 'group' ? { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 } : b);
  const ok = (b: Rect) => insideSky(v, b) && !hits(res(b), p.reserve) && !hits(b, avoid) && !(exact && p.onRibbon!(b)) && free(b) && !row(b) && owns(b);
  // сначала — место не на чужих линиях связей (этап 11, Я12; sky.ts, Pass.onLink), затем — любое свободное; strict — только
  // не на чужих линиях (подписи у ромбов: линия через имя недопустима, решение 163; тесно — подписи нет, имя — в подсказке)
  const onLink = p.onLink;
  const b = (onLink ? candidates.find((c) => ok(c) && !onLink(c, o.id ?? '')) : undefined) ?? (o.strict && onLink ? undefined : candidates.find(ok));
  if (!b) return null;
  // строка подписи: подписи звёзд на этой же строке встают не ближе 0,5 кегля (решение 140)
  if (kind === 'event') p.placer.add(b);
  else p.placer.addLabel(b, Math.max(1, (b.h - 3) / (ASC + DESC)));
  if (!o.hold) v.ledger.add(kind, text, b, o.id);
  return b;
}

// ---------- подпись звезды ----------

interface StarOpts {
  sides: Side[];
  color: string;
  alpha: number;
  /** уточнение курсивом после имени: отметки поиска — полностью, одноимённые в окне — кратко (MAP-66) */
  note?: string;
  /** сокращение роли после имени на крупном масштабе */
  sigla?: boolean;
  /** выноска, если у звезды места нет (величины 0–1, лица линий) */
  leader?: boolean;
  /** и дальние выноски (режим «В работе»: подписаны все лица набора) */
  far?: boolean;
  /** можно закрыть чужую звезду (выбранное лицо, его семья, отметки) */
  overStars?: boolean;
  /** не проверять занятое (выбранное лицо — первым) */
  force?: boolean;
  /**
   * явное раскрытие (решение 140): выбранное, второе, наведённое, фокус, концы выбранной связи — если места по правилам
   * нет, имя может лечь на чужой знак (но не на подписи)
   */
  reveal?: boolean;
  /**
   * родня первого колена выбранного (решения 137, 144, 146; П1): по правилам места нет — ещё и места вокруг всей звезды
   * (веер выносок до 40 px, над и под ней) без чужого знака под именем и с правилом принадлежности; связи и ленты под
   * серединой строки тогда прерываются. Нет и такого места — подпись в списке скрытых
   */
  kin?: boolean;
  /**
   * верхняя ступень решения 164 (выбранный, родители, супруги, лица лент величины ≤ 1 в его семье): подписан всегда. Нет
   * чистого места — узкое исключение 163: чужая вертикаль разрывается по всей рамке имени + 3 px с каждой стороны
   * («разрыв линии» — защита текста); знак под именем и чужое имя ближе своего — всё равно запрет (решения 140, 160)
   */
  top?: boolean;
  /**
   * масштаб семьи (E1: подписаны все, кому хватает места): по правилам у звезды места нет — ещё и веер выносок вокруг всей
   * звезды до 40 px и отвесные выноски над ней и под ней, по тем же правилам (решения 140, 141)
   */
  fan?: boolean;
  /** по какую сторону звезды можно ставить подпись: −1 — не ниже середины (лицо только линии Иосифа), 1 — не выше (Марии) */
  vertical?: -1 | 1;
  /** погашенная выделением: без полужирного (MOB-41) */
  light?: boolean;
  /** кегль — ступень шкалы вместо кегля величины (лица линий в режиме «только линии», MAP-59) */
  size?: number;
  /** знак свёрнутых потомков «+N» сразу после подписи (UX-60, MAP-63): подчёркнут, как ссылка */
  fold?: string;
  /** звёзды этой величины и тусклее подпись может закрыть (по умолчанию — на две величины тусклее своей; 99 — никакие) */
  cover?: number;
  /** и выноски подальше — до 100 px от звезды, ближние раньше (звёзды величины 0 на обзоре без выбранного; исключение К8) */
  wide?: boolean;
  /** наибольшая длина выноски вместо 40 px (wide — 100 px; Иисус Христос на обзоре без выбранного — 160 px, MOB-53) */
  reach?: number;
  /**
   * место, где имя закрывает меньше всего звёзд (с весом по яркости), не ложится на подписи и ленты и ближе к звезде —
   * вместо первого подходящего по порядку сторон (Иисус Христос, MOB-53)
   */
  least?: boolean;
  /** места, которые в режиме least лучше не занимать ни именем, ни выноской: подписи справа у звёзд величины 0–1 */
  avoid?: Rect[];
  /**
   * в режиме least — только чистые места, по правилам (проход 'soft'): имя читается своим, линии не идут через строку;
   * без прохода поверх знаков (опорное имя на обзоре: его лучше скрыть, чем поставить на гущу коридора, 1129)
   */
  clean?: boolean;
  /**
   * места подписи, которые пробуются раньше сторон: xr — правый край текста, yc — середина строки (px холста). Подпись
   * там — без сокращения роли, как слева от звезды (Иисус Христос на обзоре — слева, на уровне лент; MAP-81)
   */
  places?: { xr: number; yc: number }[];
}

/** Где встала подпись звезды: прямоугольник (тот же, что в замере), базовая линия, положение и знак «+N». */
export interface LabelAt {
  box: Rect;
  tx: number;
  ty: number;
  side: Side | 'x';
  fold?: Rect;
}

let lineSide: Map<string, -1 | 1> | null = null;
/**
 * Лица одной линии Мессии: золотые (только Мф) подписываются над звездой или сбоку, лазурные (только Лк) — под ней или
 * сбоку: подпись по другую сторону ленты читалась бы как лицо другой линии (E6; UX-16).
 */
export function lineSideOf(id: string): -1 | 1 | undefined {
  if (!lineSide) {
    lineSide = new Map();
    const j = new Set(lines.joseph.persons.map((x) => x.id));
    const m = new Set(lines.mary.persons.map((x) => x.id));
    for (const id of j) if (!m.has(id)) lineSide.set(id, -1);
    for (const id of m) if (!j.has(id)) lineSide.set(id, 1);
  }
  return lineSide.get(id);
}

/** Знак перед именем умершего младенцем (MAP-68): кеглем подписи, с узким пробелом. */
export const DAGGER = '†\u2009';
/** Узел — умерший младенцем: у подписи — «†» (MAP-68). */
export const infantAt = (v: SkyContext, i: number) => v.nodes[i].trail === 'infant' || !!v.model.chrono.get(v.nodes[i].person)?.infant;
/** Узел — лицо «время не установлено»: подпись курсивом (MAP-52). */
export const epochalAt = (v: SkyContext, i: number) => v.nodes[i].trail === 'epochal';
/** Шрифт имени узла: курсив у лица без своего времени (тот же, по которому замеряются пороги). */
export const labelFontOf = (v: SkyContext, i: number, o: { light?: boolean; size?: number } = {}) =>
  nameFontWith(byId.get(v.nodes[i].person)!.magnitude, v.coarse, { italic: epochalAt(v, i), ...o });
/** Отступ знака «+N» от подписи, px. */
const FOLD_GAP = 5;

/** Зазор между концом подписи и продолжением следа, px (VIS-76): след начинается за подписью, а не у её последней буквы. */
export const KNOCK_GAP = 3;

/**
 * Где погасить свой след под подписью (MAP-56, MOB-76, VIS-76): полоса высотой 5 px по следу от края звезды до конца
 * подписи с зазором KNOCK_GAP — под именем, уточнением и сокращением роли след не читается дефисом («Соломон-ц.»,
 * «Иисус‑Христос»). Подпись справа (у лица без своего времени — и слева: скобка идёт в обе стороны). null — гасить нечего:
 * следа в кадре нет, подпись не на нём, или на обзоре под ней облака (полоса цвета неба прорезала бы их).
 *
 * У лица линии Мессии след лежит поверх ленты (trails.ts, drawSpineTrails): гасится, только если подпись не на ленте
 * (clearOfRibbons), а зазор у звезды — только если и он не на ленте, иначе полоса прорезала бы нить.
 */
export function knockTrail(v: SkyContext, p: Pass, i: number, at: { box: Rect; side: Side | 'x' }, r: number): Rect | null {
  if (at.side !== 'r' && at.side !== 'l') return null;
  const n = v.nodes[i];
  const epochal = epochalAt(v, i);
  if (!(n.trail === 'life' || epochal) || !p.s.layers.lifelines) return null;
  if (at.side === 'l' && !epochal) return null;
  const s = p.s;
  const spine = p.spine.has(n.person);
  // след нарисован: с подробностью кадра, в полную силу у выделенных и в «только линиях», у лиц линий — поверх лент
  const k = s.highlight?.get(n.person);
  const lit = s.onlyLines || k !== undefined || s.pins.has(n.person);
  const drawn = p.detail > 0.01 || lit || (spine && v.cam.ky >= 5);
  // облака обзора: полоса цвета неба оставила бы в них тёмную заплату
  const clouds = !s.onlyLines && !p.work && p.starDetail < 0.99;
  if (!drawn || clouds) return null;
  const x = v.cam.sx(v.X0[i]);
  const yt = Math.round(v.cam.sy(starLaneOf(n))) + 0.5;
  const band = (a: number, b: number): Rect => ({ x: a, y: yt - 2.5, w: b - a, h: 5 });
  const off = spine ? p.offRibbon : undefined;
  if (at.side === 'r') {
    const end = at.box.x + at.box.w + KNOCK_GAP - 1.5;
    if (off && !off(band(at.box.x, end))) return null;
    const near = band(x + r + 1.5, at.box.x);
    const a = !off || near.w <= 0 || off(near) ? near.x : at.box.x;
    return end > a ? band(a, end) : null;
  }
  const a = at.box.x - KNOCK_GAP + 1.5;
  const b = x - r - 1.5;
  if (off && !off(band(a, b))) return null;
  return b > a ? band(a, b) : null;
}

/**
 * Подписать звезду узла i: первое свободное из положений sides, затем — выноска. Рисует имя с ореолом цвета неба,
 * уточнение, сокращение роли и знак «+N»; занимает место, пишет замер и отмечает узел подписанным (p.labeled). Для подписей
 * лиц из других слоёв (лица линий, путь родства) — та же функция.
 *
 * Лицо линии Мессии сначала ищет место вне лент (MAP-56): имя на своей ленте не читается. Подпись справа от звезды
 * гасит под собой свой след полосой цвета фона (MAP-56): между звездой, именем и сокращением роли след не читается дефисом.
 */
export function labelStar(v: SkyContext, p: Pass, i: number, o: StarOpts): LabelAt | null {
  if (p.labeled.has(i)) return null;
  // подпись — только у звезды, нарисованной в этом кадре в полную силу (этап 11, B1): та же проверка, что у звёзд (sky.ts,
  // starShown). Иначе имя лица, скрытого набором, висело бы на пустом небе («набор» и «только линии», снимок 14)
  if (!p.starShown(i) || p.starAlpha(i) <= 0.5) return null;
  const { ctx, cam, pal } = v;
  const n = v.nodes[i];
  const q = byId.get(n.person)!;
  const x = cam.sx(v.X0[i]);
  // подпись — у звезды, в полосе рождения (решение 173)
  const y = cam.sy(starLaneOf(n));
  // звезда за краем окна не подписывается: для выбранных есть указатели у края (MOB-01); звезда под органами неба и
  // карточкой — тоже: имя у невидимой звезды читалось бы подписью соседней (К4: «Аса» у кнопок масштаба на телефоне)
  if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) return null;
  if (hits({ x: x - 1, y: y - 1, w: 2, h: 2 }, p.reserve)) return null;
  const cache = v.labelCache;
  const r = starRadius(q.magnitude, p.zoomScale);
  const king = q.roles.includes('king') || q.roles.includes('queen');
  const plain = !o.light && !o.size;
  const nf = labelFontOf(v, i, { light: o.light, size: o.size });
  let nameW = plain ? cache.nameW[i] : 0;
  if (!(nameW > 0)) {
    ctx.font = nf;
    nameW = ctx.measureText(q.name).width;
  }
  // «†» младенца — кеглем подписи перед именем (MAP-68)
  const infant = infantAt(v, i);
  let dagW = 0;
  if (infant) {
    ctx.font = nf;
    dagW = ctx.measureText(DAGGER).width;
  }
  const size = o.size ? mapSize(o.size, v.coarse) : nameSize(q.magnitude, v.coarse);
  const note = o.note ?? '';
  const noteFont = mapFont(T_UI_S, { italic: true, coarse: v.coarse });
  let noteW = 0;
  if (note) {
    ctx.font = noteFont;
    noteW = ctx.measureText(note).width;
  }
  // сокращение роли не повторяет уточнение («Ирод, царь…» — без «ц.»; решение 43)
  const roles = note ? rolesUnnamed(q.roles, note) : q.roles;
  const sig = o.sigla && cam.ky >= 18 && roles.length ? roleSigla(roles) : '';
  let sigW = 0;
  if (sig && roles.length !== q.roles.length) {
    ctx.font = siglaFont(q.magnitude, v.coarse);
    sigW = ctx.measureText(sig).width + 4;
  } else if (sig) {
    if (!(cache.siglaW[i] >= 0)) {
      ctx.font = siglaFont(q.magnitude, v.coarse);
      cache.siglaW[i] = ctx.measureText(sig).width + 4;
    }
    sigW = cache.siglaW[i];
  }
  const foldW = o.fold ? FOLD_GAP + foldMarkWidth(ctx, v.coarse, '', o.fold).cw : 0;
  const textW = dagW + nameW + noteW;
  // кольца и истинные границы знака (решение 140): знак кадра с кольцами состояний (sky.ts, p.placer.addGlyph)
  const own = p.placer.glyphOf(q.id, x, y);
  const ext = own?.e;
  // буквы имени — по замеру (кэш порогов) у обычного начертания и без уточнения: уточнение и «†» строку не опускают ниже
  let mtr = plain && !note && !infant && Number.isFinite(cache.nameAsc[i]) ? { asc: cache.nameAsc[i], desc: cache.nameDesc[i] } : undefined;
  if (!mtr) {
    // начертание не обычное (погашенная, ступень шкалы) или с уточнением и «†»: замер всей строки
    ctx.font = nf;
    const a = ctx.measureText(`${infant ? DAGGER : ''}${q.name}`);
    let asc = a.actualBoundingBoxAscent;
    let desc = a.actualBoundingBoxDescent;
    if (note && Number.isFinite(asc)) {
      ctx.font = noteFont;
      const b = ctx.measureText(note);
      asc = Math.max(asc, b.actualBoundingBoxAscent);
      desc = Math.max(desc, b.actualBoundingBoxDescent);
    }
    if (Number.isFinite(asc) && Number.isFinite(desc)) mtr = { asc, desc };
  }
  const sp = (sd: Side, w: number) => spot(sd, x, y, r, w, size, king, ext, mtr);
  // выноска — от наружного края знака с кольцами, не длиннее LEADER_MAX (решение 140, К8)
  const lead0 = Math.max(r + 2, ext ? Math.max(ext.l, ext.r, ext.t, ext.b) + 1 : 0);
  // (выноски подальше — StarOpts.wide — только звёздам величины 0 на обзоре, когда ближе места нет: MAP-06, MOB-53)
  const short = ([dx, dy]: [number, number]) => Math.hypot(dx, dy) - lead0 <= (o.reach ?? (o.wide ? LEADER_WIDE : LEADER_MAX)) && Math.hypot(dx, dy) > lead0 + 3;
  // явное раскрытие (выбранное, наведённое, фокус, концы связи): имя может лечь на чужой знак, если иначе места нет
  const reveal = !!o.force || !!o.reveal;
  // проходы: (лицо линии) не на лентах → без линий связей по всей строке → с правилами → (раскрытие) поверх знаков →
  // (выбранное лицо) где угодно. Правила (решения 140, 141): чужой знак не под именем и не ближе своего, в строке у имени
  // нет чужого знака, соседняя подпись на строке не ближе 0,5 кегля, через середину строки не идут связи, ленты и дуги
  // 'fan' — те же правила, что у 'soft', но места вокруг всей звезды (веер выносок, отвесные выноски)
  // 'cut' — верхняя ступень 164 без чистого места: принадлежность и знаки — как в 'kin', линия под именем разрывается
  type Mode = 'clear' | 'free' | 'soft' | 'lane' | 'fan' | 'kin' | 'cut' | 'hard' | 'none';
  const offRibbon = p.offRibbon;
  const onLink = p.onLink;
  const onLine = p.onLine;
  // 'lane' — как 'soft', но лента под серединой строки допустима: лицо линии Мессии стоит на своей ленте
  const strict = (m: Mode) => m === 'clear' || m === 'free' || m === 'soft' || m === 'lane' || m === 'fan';
  // одни и те же места проверяются в нескольких проходах: принадлежность и линии — один раз на место
  const memo = new Map<string, boolean>();
  const once = (k: string, f: () => boolean) => {
    let r = memo.get(k);
    if (r === undefined) memo.set(k, (r = f()));
    return r;
  };
  const key = (b: Rect) => `${b.x.toFixed(1)},${b.y.toFixed(1)},${b.w.toFixed(1)}`;
  /** правило принадлежности: имя читается подписью своей звезды */
  const owned = (b: Rect, leader: boolean) => once(`o${key(b)}${leader ? 'x' : ''}`, () => p.placer.owns(b, own, q.id, size, leader));
  /** через середину строки идут связи, ленты, дуги (lane — своя лента допустима) */
  // связи и маршруты — по всей строке (рамка без поля ореола), ленты — по середине строки (решение 163)
  const crossed = (b: Rect, lane: boolean) =>
    once(`l${key(b)}${lane ? 'r' : ''}`, () => !!onLine?.({ x: b.x + 1.5, y: b.y + 1.5, w: Math.max(0, b.w - 3), h: Math.max(0, b.h - 3) }, q.id, !lane, false, midBand(b, size)));
  // правила места (решения 140, 141, 163): имя читается своим, через строку не идут связи и маршруты, через её середину —
  // ленты; на чужой вертикали имя не стоит ни на каком масштабе (разрыв под ореолом не оправдывает пересечения)
  const rules = (b: Rect, m: Mode, leader: boolean) => owned(b, leader) && !crossed(b, m === 'lane');
  // явно раскрытое имя без правил: чужая звезда у имени — хуже, чем линия под ним (её под раскрытым именем прервёт разрыв)
  const ruleCost = (b: Rect, leader: boolean) => (owned(b, leader) ? 0 : 0.6) + (crossed(b, false) ? 0.5 : 0);
  const ok = (b: Rect, m: Mode, leader = false) =>
    insideSky(v, b) &&
    !hits(b, p.reserve) &&
    (m === 'none' ||
      (!p.placer.clash(b, m === 'kin' || m === 'cut' || (m === 'hard' && o.cover !== undefined), m === 'kin' || m === 'cut' ? 99 : (o.cover ?? 99), q.id) &&
        !p.placer.rowClash(b, size) &&
        (!strict(m) || rules(b, m, leader)) &&
        (m !== 'clear' || offRibbon!(b)) &&
        ((m !== 'free' && m !== 'clear') || !onLink?.(b, q.id))));
  /** Путь выноски свободен (решение 140): не через подписи и кольца, чужие знаки, выноски и линии связей. */
  const leadClear = (ax: number, ay: number, m: Mode) => {
    // выноска длиннее 40 px (StarOpts.wide; исключение К8 для звёзд величины 0 на обзоре) — только по правилам: через
    // пустое небо, мимо выносок, связей и лент, у её конца нет чужого знака ближе своего
    if (!strict(m) && Math.hypot(ax - x, ay - y) - lead0 > LEADER_MAX) return false;
    if (m === 'none') return true;
    const d = Math.hypot(ax - x, ay - y) || 1;
    const ux = (ax - x) / d;
    const uy = (ay - y) / d;
    if (p.placer.crossesLeader(x + ux * lead0, y + uy * lead0, ax, ay)) return false;
    for (let t = lead0; t <= d; t += 3) {
      const pt = { x: x + ux * t - 1, y: y + uy * t - 1, w: 2, h: 2 };
      if (p.placer.clash(pt, false, 99, q.id)) return false;
      // выноска лица линии Мессии выходит из звезды на его ленте: лента у её начала — своя
      // (дальняя выноска лица линии и на своём проходе 'lane' ленты не пересекает — только у своей звезды: до 14 px от знака)
      if (strict(m) && (p.placer.glyphsIn(pt).some((g) => g.id !== q.id && g.a >= GLYPH_SEEN) || onLine?.(pt, q.id, (m !== 'lane' || (!!o.wide && d - lead0 > LEADER_MAX)) && !(spineName && t < lead0 + (o.wide ? 14 : 8)), false))) return false;
      // родня без места по правилам: выноска всё равно не идёт через чужой знак; выноска не пересекает связи (решение 163)
      if ((m === 'kin' || m === 'cut') && p.placer.glyphsIn(pt).some((g) => g.id !== q.id && g.a >= GLYPH_SEEN)) return false;
      if ((m === 'kin' || m === 'cut' || m === 'hard') && onLine?.(pt, q.id, false)) return false;
    }
    return true;
  };
  /** Места последних проходов (раскрытие, родня, веер): стороны, со сдвигом над и под знаком, выноски и отвесные выноски. */
  const wideCands = () => {
    // над знаком и под ним — ещё и со сдвигом: имя кончается или начинается над знаком (место между соседями по строке)
    const shifted = sides
      .filter((sd) => sd === 't' || sd === 'b')
      .flatMap((sd) => {
        const c = sp(sd, textW + foldW);
        const d = c.box.w / 2 - r - 2;
        return d > 4 ? [-d, d].map((k) => ({ tx: c.tx + k, ty: c.ty, box: { ...c.box, x: c.box.x + k }, side: sd, far: 4 })) : [];
      });
    const cands: { tx: number; ty: number; box: Rect; ax?: number; ay?: number; side: Side | 'x'; far: number }[] = [
      ...sides.map((sd) => ({ ...sp(sd, textW + (sd === 'r' ? sigW : 0) + foldW), side: sd, far: 0 })),
      ...shifted,
      ...(o.leader ? [...leaders, ...(v.viewMoving ? [] : KIN_LEADERS.filter(short))].map(([dx, dy]) => ({ ...leaderSpot(dx, dy, x, y, textW + foldW, size), side: 'x' as const, far: Math.hypot(dx, dy) })) : []),
      // имя по центру над звездой или под ней на отвесной выноске (как у лиц линий, SPINE_DROP), до 40 px
      ...(o.leader && !v.viewMoving
        ? [14, 20, 26, 32, 38].filter((d) => d - lead0 <= LEADER_MAX && d > lead0 + 3).flatMap((d) =>
            ([1, -1] as const)
              .filter((dir) => !vert || dir === vert)
              .map((dir) => {
                const w = textW + foldW;
                const ay = y + dir * d;
                const ty = dir > 0 ? ay + 2 + (mtr ? mtr.asc : ASC * size) : ay - 2 - (mtr ? mtr.desc : DESC * size);
                return { tx: x - w / 2, ty, box: textBox(x - w / 2, ty, w, size), ax: x, ay, side: 'x' as const, far: d };
              }),
          )
        : []),
    ];
    return cands;
  };
  let at: { tx: number; ty: number; box: Rect; ax?: number; ay?: number; side: Side | 'x' } | null = null;
  /** проход, в котором встала подпись: в строгих (кроме «на ленте») под серединой строки гасятся следы, декор и погашенные связи */
  let mode: Mode = 'none';
  const free: Mode[] = onLink ? ['free'] : [];
  const spineName = p.spine.has(q.id);
  // своя лента под серединой имени — только в показе «только линии» (там ленты под всеми именами); на обычном небе имя
  // лица линии — над своей лентой или под ней, а не на ней (решение 172; R2-16: Мария на своей лазурной ленте)
  const lane: Mode[] = spineName && p.s.onlyLines ? ['lane'] : [];
  // в движении (перелёт, колесо, протяжка) — без прохода по вееру мест: кадр движения короче 20 мс (С1), веер — в покое
  const fan: Mode[] = v.viewMoving ? [] : ['fan'];
  const cut: Mode[] = o.top && !v.viewMoving ? ['cut'] : [];
  const base: Mode[] = o.force
    ? [...free, 'soft', ...lane, ...cut, 'hard', 'none']
    : reveal
      ? [...free, 'soft', ...lane, ...cut, 'hard']
      : o.kin
        ? [...free, 'soft', ...lane, ...fan, 'kin', ...cut]
        : o.fan
          ? [...free, 'soft', ...lane, ...fan]
          : [...free, 'soft', ...lane];
  const passes: Mode[] = offRibbon && spineName ? ['clear', ...base] : base;
  const vert = o.vertical ?? lineSideOf(q.id);
  const sides = vert === -1 ? o.sides.filter((x) => x !== 'b') : vert === 1 ? o.sides.filter((x) => x !== 't') : o.sides;
  const all = [...LEADERS, ...(o.far ? FAR_LEADERS : []), ...(o.wide ? WIDE_LEADERS : [])].filter(short);
  const leaders = vert ? all.filter(([, dy]) => Math.sign(dy) === vert || dy === 0) : all;
  if (o.least) {
    for (const m of (o.clean ? ['soft'] : ['soft', 'hard']) as Mode[]) {
      let best = Infinity;
      const cands: { tx: number; ty: number; box: Rect; ax?: number; ay?: number; side: Side | 'x'; far: number }[] = [
        ...sides.map((sd) => ({ ...sp(sd, textW + (sd === 'r' ? sigW : 0) + foldW), side: sd, far: 0 })),
        ...(o.leader ? leaders.map(([dx, dy]) => ({ ...leaderSpot(dx, dy, x, y, textW + foldW, size), side: 'x' as const, far: Math.hypot(dx, dy) })) : []),
      ];
      for (const c of cands) {
        if (!ok(c.box, m, c.side === 'x')) continue;
        if (c.side === 'x' && !leadClear(c.ax!, c.ay!, m)) continue;
        // звёзды под именем, лента под ним (MAP-56), длина выноски и места имён ярких звёзд под именем или выноской
        let score = p.placer.cover(c.box, q.id) + (offRibbon && !offRibbon(c.box) ? 6 : 0) + c.far / 12;
        for (const a of o.avoid ?? []) if (cross(c.box, a) || (c.side === 'x' && segmentCrosses(a, x, y, c.ax!, c.ay!))) score += 12;
        if (score < best) {
          best = score;
          at = c;
        }
      }
      if (at) {
        mode = m;
        break;
      }
    }
  }
  for (const soft of o.least ? [] : passes) {
    mode = soft;
    for (const q of o.places ?? []) {
      const tx = q.xr - textW - foldW;
      const ty = q.yc + (ASC - DESC) * 0.5 * size;
      const box = textBox(tx, ty, textW + foldW, size);
      if (ok(box, soft)) {
        // место у лент, а не у звезды (MAP-81): короткая выноска от звезды к концу имени держит принадлежность (решение 140)
        at = { tx, ty, box, side: 'x', ax: q.xr + 2, ay: q.yc };
        break;
      }
    }
    if (at) break;
    // явное раскрытие поверх знаков ('hard'): из допустимых мест — то, где под именем меньше знаков (с весом по яркости);
    // знаки при этом рисуются, подпись лежит поверх только пока раскрыта (решение 140). Родня выбранного ('kin') — только
    // места без чужих знаков: из них — где имя читается своим лучше всего
    if (soft === 'hard' || soft === 'kin' || soft === 'fan' || soft === 'cut') {
      let best = Infinity;
      const cands = wideCands();
      for (const c of cands) {
        // 'fan' — по правилам (принадлежность, линии, путь выноски); ближнее место — раньше
        if (!ok(c.box, soft, c.side === 'x') || (c.side === 'x' && !leadClear(c.ax!, c.ay!, soft))) continue;
        // родня: имя читается своим и не стоит на чужой линии (правила — запрет и здесь, решения 140, 163); верхняя
        // ступень ('cut') — читается своим, а линия под ним разрывается
        if (soft === 'kin' && !rules(c.box, 'soft', c.side === 'x')) continue;
        if (soft === 'cut' && !owned(c.box, c.side === 'x')) continue;
        // меньше знаков под именем; при равном — место, где имя читается своим (правила принадлежности и линий)
        const score = p.placer.cover(c.box, q.id) + c.far / 40 + ruleCost(c.box, c.side === 'x');
        if (score < best) {
          best = score;
          at = c;
        }
      }
      if (at) break;
      continue;
    }
    // поверх занятого (выбранное лицо, места нет): та сторона, где под именем меньше занятого — ромбов союзов, подписей
    if (soft === 'none') {
      let best = Infinity;
      // те же места, что у раскрытия (выноски не через чужие знаки и связи): меньше всего чужих знаков (с весом по
      // яркости), затем — где имя читается своим и не стоит на линии, затем — меньше занятого подписями, ближе к звезде
      for (const c of wideCands()) {
        if (!ok(c.box, soft) || (c.side === 'x' && !leadClear(c.ax!, c.ay!, 'hard'))) continue;
        const o = p.placer.cover(c.box, q.id) * 1000 + ruleCost(c.box, c.side === 'x') * 500 + p.placer.overlap(c.box) + c.far;
        if (o < best) {
          best = o;
          at = c;
        }
      }
      if (at) break;
    }
    for (const sd of sides) {
      const c = sp(sd, textW + (sd === 'r' ? sigW : 0) + foldW);
      if (ok(c.box, soft)) {
        at = { ...c, side: sd };
        break;
      }
    }
    if (!at && o.leader)
      for (const [dx, dy] of leaders) {
        const c = leaderSpot(dx, dy, x, y, textW + foldW, size);
        if (ok(c.box, soft, true) && leadClear(c.ax, c.ay, soft)) {
          at = { ...c, side: 'x' };
          break;
        }
      }
    // лицо линии Мессии: имя под лентой или над ней, отвесной выноской за поле косы (решение 141: лента не идёт через
    // середину строки) — по свою сторону ленты (E6; UX-16)
    if (!at && spineName && (soft === 'clear' || soft === 'soft'))
      for (const d of SPINE_DROP) {
        for (const dir of [1, -1] as const) {
          if (vert && dir !== vert) continue;
          const w = textW + foldW;
          const ay = y + dir * d;
          const ty = dir > 0 ? ay + 2 + (mtr ? mtr.asc : ASC * size) : ay - 2 - (mtr ? mtr.desc : DESC * size);
          const c = { tx: x - w / 2, ty, box: textBox(x - w / 2, ty, w, size), ax: x, ay };
          if (ok(c.box, soft, true) && leadClear(c.ax, c.ay, soft)) {
            at = { ...c, side: 'x' };
            break;
          }
        }
        if (at) break;
      }
    if (at) break;
  }
  if (!at) return null;
  const { tx, ty } = at;
  const knock = knockTrail(v, p, i, at, r);
  if (knock) v.fillGround(knock.x, knock.x + knock.w, knock.y, knock.h);
  // разрыв под текстом (решения 139, 141): следы, сетка, контуры, меридианы и погашенные связи под серединой строки
  // гасятся цветом фона — звёзды рисуются после подписей и не гаснут; связи, ленты и дуги через середину строки не идут
  // (лицо линии Мессии на своей ленте — и лента под серединой его имени прерывается, как след: инвариант 15). Явно
  // раскрытое имя (выбранное, наведённое, фокус), вставшее без правил: и связи под его серединой прерываются
  const kn = (strict(mode) || mode === 'kin' ? p.knock : undefined) ?? (reveal || mode === 'kin' ? p.knockReveal : undefined);
  // верхняя ступень 164 на чужой линии ('cut', и раскрытое имя поверх линии): разрыв по всей рамке + 3 px (исключение 163)
  if (o.top && !strict(mode) && mode !== 'kin' && crossed(at.box, false) && p.knockReveal) {
    p.knockReveal({ x: at.box.x - 3, y: at.box.y - 3, w: at.box.w + 6, h: at.box.h + 6 });
    p.cutNames?.push(q.id);
  } else if (kn) kn(midBand(at.box, size));
  ctx.globalAlpha = o.alpha;
  if (at.side === 'x') {
    // выноска: от края звезды к углу подписи
    const d = Math.hypot(at.ax! - x, at.ay! - y) || 1;
    ctx.strokeStyle = alpha(pal.ink2, 0.8);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + ((at.ax! - x) / d) * lead0, y + ((at.ay! - y) / d) * lead0);
    ctx.lineTo(at.ax!, at.ay!);
    ctx.stroke();
  }
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.halo;
  ctx.lineWidth = 3;
  ctx.font = nf;
  ctx.fillStyle = o.color;
  if (infant) {
    ctx.strokeText(DAGGER, tx, ty);
    ctx.fillText(DAGGER, tx, ty);
  }
  ctx.strokeText(q.name, tx + dagW, ty);
  ctx.fillText(q.name, tx + dagW, ty);
  if (note) {
    ctx.font = noteFont;
    ctx.strokeText(note, tx + dagW + nameW, ty);
    ctx.fillStyle = pal.ink2;
    ctx.fillText(note, tx + dagW + nameW, ty);
  }
  let end = tx + textW;
  // лицо линии, чья подпись справа легла на ленту: сокращение роли не пишется — между именем и ним читался бы след (MAP-56)
  const onRibbon = p.spine.has(q.id) && !!offRibbon && !offRibbon(at.box);
  if (sig && at.side === 'r' && !onRibbon) {
    ctx.font = siglaFont(q.magnitude, v.coarse);
    ctx.strokeText(sig, end + 4, ty);
    ctx.fillStyle = pal.ink3;
    ctx.fillText(sig, end + 4, ty);
    end += sigW;
  }
  let fold: Rect | undefined;
  if (o.fold) {
    ctx.globalAlpha = 1;
    drawFoldMark(ctx, pal, v.coarse, end + FOLD_GAP, ty, '', o.fold);
    fold = { x: end + FOLD_GAP - 2, y: at.box.y, w: foldW - FOLD_GAP + 4, h: at.box.h };
  }
  ctx.globalAlpha = 1;
  p.placer.addLabel(at.box, size);
  // выноска занимает свой путь: следующие подписи и выноски её не перекрывают (решение 140)
  if (at.side === 'x') {
    const d = Math.hypot(at.ax! - x, at.ay! - y) || 1;
    const ux = (at.ax! - x) / d;
    const uy = (at.ay! - y) / d;
    p.placer.leaders.push([x + ux * lead0, y + uy * lead0, at.ax!, at.ay!]);
    for (let t = lead0; t < d; t += 4) p.placer.add({ x: x + ux * t - 1, y: y + uy * t - 1, w: 2, h: 2 });
  }
  v.ledger.add('star', q.name, at.box, q.id);
  p.labeled.add(i);
  if (note && p.shown) p.shown.noted.push(`${q.name}#${note}`);
  return { box: at.box, tx, ty, side: at.side, fold };
}

/** Ближайшая семья лица: родители, супруги, дети, братья и сёстры (E1; MAP-21, UX-33). */
/**
 * Линия своя для лица (решение 163: препятствие — чужая вертикаль): ключ связи «u.отец.мать._», «k.отец.мать._.ребёнок»,
 * «s.отец.мать._.супруг» — своя, если лицо — супруг союза, его ребёнок по этой связи или ребёнок этих родителей. Ствол
 * своих детей и ствол родителей к нему самому имя не зачёркивают: они кончаются у его звезды.
 */
export function ownLink(ks: string, id: string): boolean {
  const k = ks.split('.');
  if (k.length < 3 || !(k[0] === 'u' || k[0] === 'k' || k[0] === 's')) return false;
  const [a, b] = [k[1], k[2]];
  if (a === id || b === id || (k.length > 4 && k[4] === id && k[0] === 'k')) return true;
  // черта брака родителей — не линия ребёнка: имя на ней читалось бы супругом (Г4; MAP-76)
  if (k[0] === 's') return false;
  const q = byId.get(id);
  if (!q) return false;
  // союз его родителей: отец и мать — те же (неназванный — «_»)
  return (q.father ? q.father === a : a === '_') && (q.mother ? q.mother === b : b === '_') && !!(q.father || q.mother);
}

/** Ступень лица семьи выбранного id (решение 164): 0 — родители и супруги, 1 — лица лент величины ≤ 1, 2 — дети, 3 — прочие. */
export function familyTier(id: string, spine: ReadonlySet<string>): (x: string) => number {
  const parents = new Set((graph.parentsOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.parent));
  const mates = new Set((graph.spousesOf.get(id) ?? []).map((e) => (e.a === id ? e.b : e.a)));
  const kids = new Set(primaryChildren(graph, id));
  return (x: string) => (parents.has(x) || mates.has(x) ? 0 : spine.has(x) && (byId.get(x)?.magnitude ?? 9) <= 1 ? 1 : kids.has(x) ? 2 : 3);
}

/**
 * Семья выбранного в порядке права на место подписи (решение 164; R1-05, V-14): родители и супруги → лица линий Мессии
 * величины ≤ 1 (Соломон и Нафан у Давида, Иуда у Иакова) → дети по степени интереса → прочие (братья и сёстры) по ней же.
 * Тесно (1024, телефон) — без подписи остаются младшие, а не главные лица семьи.
 */
export function familyOrder(id: string, spine: ReadonlySet<string>, rank: (id: string) => number): string[] {
  const tier = familyTier(id, spine);
  const all = familyOf(id);
  const at = new Map(all.map((x, k) => [x, k]));
  return all.sort((a, b) => tier(a) - tier(b) || (tier(a) >= 2 ? rank(a) - rank(b) : 0) || at.get(a)! - at.get(b)!);
}

export function familyOf(id: string): string[] {
  const out = new Set<string>();
  for (const e of graph.parentsOf.get(id) ?? []) if (e.kind === 'father' || e.kind === 'mother') out.add(e.parent);
  for (const e of graph.spousesOf.get(id) ?? []) out.add(e.a === id ? e.b : e.a);
  for (const c of primaryChildren(graph, id)) out.add(c);
  for (const s of siblings(graph, id)) out.add(s.id);
  out.delete(id);
  return [...out];
}

/** Не больше стольких слов в уточнении одноимённого на небе (решение 43; MAP-72). */
export const NOTE_WORDS = 3;
const KIN_WORD = /^(сын|дочь|мать|отец|жена|муж|брат|сестра|внук|внучка|племянник|родственница?)$/i;
/** Первое слово оборота с предлогом: такое уточнение пишется без запятой — «Иосиф из Аримафеи», «Миха с горы Ефремовой». */
const PREP_WORD = /^(из|от|с|со|в|во|на|при|у)$/i;
/** Уточнение из одного названия роли («царь», «левит»): роль и так видна сокращением, лиц оно не различает. */
const BARE_ROLE = /^(царь|царица|пророк|пророчица|первосвященник|священник|левит|судья|апостол|патриарх|певец|привратник)$/i;
/** Слова, которыми уточнение называет роль: сокращение этой роли после имени тогда не пишется (решение 43). */
const ROLE_NAMED: Record<string, RegExp> = {
  king: /(^|[^а-яё])цар(ь|я|ю|ём|е)([^а-яё]|$)/i,
  queen: /(^|[^а-яё])цариц/i,
  prophet: /(^|[^а-яё])пророк/i,
  'high-priest': /первосвящен/i,
  priest: /(^|[^а-яё])священ/i,
  judge: /(^|[^а-яё])суд(ья|ьи|ей|ью)([^а-яё]|$)/i,
  apostle: /(^|[^а-яё])апостол/i,
  patriarch: /(^|[^а-яё])патриарх/i,
  levite: /(^|[^а-яё])левит([^а-яё]|$)/i,
};
/** Роли лица без тех, которые уже названы в уточнении note (сокращение роли не повторяет уточнение). */
export function rolesUnnamed(roles: readonly string[], note: string): string[] {
  return roles.filter((r) => !ROLE_NAMED[r]?.test(note));
}

const words = (x: string) => x.split(/\s+/).filter(Boolean);
/** «1 Пар 4:9» и «1Пар 4:9» → разбор ссылки (коды книг — без пробела после номера). */
const refOf = (raw: string) => parseRef(raw.trim().replace(/^([1-4])\s+(?=[А-ЯЁа-яё])/, '$1'));

/** Ссылки индекса, где лицо названо: в скобках уточнения, в утверждениях о его родителях, браках, родстве и детях. */
function refsOf(id: string): string[] {
  const q = byId.get(id);
  if (!q) return [];
  const out: string[] = [];
  for (const m of q.disambig.matchAll(/\(([^)]*)\)/g)) for (const r of m[1].split(/;\s*/)) if (refOf(r)) out.push(r);
  for (const e of graph.parentsOf.get(id) ?? []) out.push(...e.refs);
  // у детей — только прямые утверждения: «предок» (op ancestor) называет потомка, а не его далёкого предка
  for (const e of graph.childrenOf.get(id) ?? []) if (e.claim !== 'ancestor' && !e.gap) out.push(...e.refs);
  for (const e of graph.spousesOf.get(id) ?? []) out.push(...e.refs);
  for (const e of graph.kinOf.get(id) ?? []) out.push(...e.refs);
  for (const r of q.reign) for (const y of r.sync ?? []) out.push(...y.refs);
  return out;
}
const firstMemo = new Map<string, { book: string; c: number; v: number } | null>();
/** Самая ранняя в каноническом порядке ссылка из refsOf: книга, глава, стих. */
function firstRef(id: string): { book: string; c: number; v: number } | null {
  if (firstMemo.has(id)) return firstMemo.get(id)!;
  let best: { b: number; c: number; v: number; book: string } | null = null;
  for (const raw of refsOf(id)) {
    const r = refOf(raw);
    if (!r) continue;
    const b = BOOK_INDEX.get(r.book) ?? 99;
    const c = r.verses[0]?.chapter ?? r.chapterOnly ?? 0;
    const v = r.verses[0]?.verse ?? 0;
    if (!best || b < best.b || (b === best.b && (c < best.c || (c === best.c && v < best.v)))) best = { b, c, v, book: r.book };
  }
  firstMemo.set(id, best);
  return best;
}
/**
 * Глава первого упоминания лица в данных атласа (решение 43): самая ранняя в каноническом порядке из ссылок refsOf —
 * «Мф 2», «2 Пар 26» (с неразрывными пробелами); verse — со стихом, «Неем 12:34». null — ссылок нет.
 */
export function firstChapter(id: string, verse = false): string | null {
  const r = firstRef(id);
  return r ? refText(verse && r.v ? `${r.book} ${r.c}:${r.v}` : `${r.book} ${r.c}`) : null;
}

/**
 * Краткое уточнение одноимённого на небе (решение 43; MAP-66, MAP-72) — не больше трёх слов и только из данных:
 *  — «он же X» — «(X)»: «Озия (Азария)»;
 *  — часть уточнения до первой запятой, если в ней не больше трёх слов: «, сын Навата», «, «знаменитее своих братьев»»;
 *    часть из одного названия роли («царь», «левит») лиц не различает — тогда следующая часть, если и в ней не больше
 *    трёх слов («Иаков, сын Зеведеев»);
 *  — иначе глава первого упоминания (id лица): «Ирод (Мф 2)»;
 *  — иначе уточнения нет: обрывков («Озия, он же», «Азария, второй сын») не бывает.
 * Прозвище одним словом с прописной и оборот с предлогом — без запятой: «Мария Магдалина», «Иосиф из Аримафеи».
 * Ссылки в скобках в текст уточнения не входят. Возвращается с разделителем.
 */
export function shortNote(disambig: string, id?: string): string | null {
  const parts = disambig
    .replace(/\([^)]*\)/g, '')
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const aka = /^(он|она)\s+же\s+(.+)$/i.exec(parts[0] ?? '');
  if (aka && words(aka[2]).length <= NOTE_WORDS) return ` (${aka[2]})`;
  const fit = (x: string | undefined) => !!x && words(x).length <= NOTE_WORDS && !/^(он|она)\s+же\s/i.test(x);
  const pick = fit(parts[0]) && !BARE_ROLE.test(parts[0]) ? parts[0] : BARE_ROLE.test(parts[0] ?? '') && fit(parts[1]) ? parts[1] : null;
  if (pick) {
    const w = words(pick);
    const bare = (w.length === 1 && /^[А-ЯЁ]/.test(pick) && !KIN_WORD.test(pick)) || PREP_WORD.test(w[0]);
    return bare ? ` ${pick}` : `, ${pick}`;
  }
  const ch = id ? firstChapter(id) : null;
  return ch ? ` (${ch})` : null;
}

/**
 * Одноимённые в окне (MAP-66; решения 29, 43): лица, чьё имя в окне носят две звезды и больше, → краткое уточнение
 * подписи. Если у двух одноимённых уточнения совпали («Иаков, апостол»), оба получают главу первого упоминания.
 * Лицо без уточнения — с пустой строкой: его подпись всё равно не спутать, если уточнения есть у остальных.
 */
export function namesakesInView(v: SkyContext, p: Pass): Map<string, string> {
  const { cam } = v;
  const byName = new Map<string, string[]>();
  for (const i of p.vis) {
    const n = v.nodes[i];
    // (звёзды, собранные в скопление старшего, не нарисованы: их называет «+N» его подписи — не скрытые подписи)
    if (n.ghost || !v.drawn(i) || !p.starShown(i) || p.starAlpha(i) <= 0.5) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(starLaneOf(n));
    if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
    const name = byId.get(n.person)!.name;
    const a = byName.get(name);
    if (a) a.push(n.person);
    else byName.set(name, [n.person]);
  }
  const out = new Map<string, string>();
  const dup = (notes: string[], k: number) => !!notes[k] && notes.some((x, j) => j !== k && x === notes[k]);
  for (const ids of byName.values()) {
    if (ids.length < 2) continue;
    let notes = ids.map((id) => shortNote(byId.get(id)!.disambig, id) ?? '');
    // совпавшие уточнения — глава первого упоминания, а если и она общая («Неем 12») — со стихом
    notes = notes.map((n, k) => (dup(notes, k) && firstChapter(ids[k]) ? ` (${firstChapter(ids[k])})` : n));
    notes = notes.map((n, k) => (dup(notes, k) && firstChapter(ids[k], true) ? ` (${firstChapter(ids[k], true)})` : n));
    ids.forEach((id, k) => out.set(id, notes[k]));
  }
  return out;
}

/**
 * Подпись звезды с тем, что ей положено в этом кадре: краткое уточнение одноимённого (MAP-66, MAP-72), знак свёрнутых
 * потомков «+N» (UX-60; его прямоугольник — в p.foldHits), у лица «время не установлено» — цвет --ink-2 (MAP-52).
 * Уточнение одноимённого не снимается (решение 43): не поместилось с ним — подписи нет, а место остаётся более
 * значимому из одноимённых (подписи идут по степени интереса).
 */
export function putLabel(v: SkyContext, p: Pass, i: number, o: StarOpts): LabelAt | null {
  if (p.labeled.has(i)) return null;
  const q = byId.get(v.nodes[i].person)!;
  // «+N» свёрнутых потомков; в небе «набор» — «+» у лица с нераскрытыми союзами (решение 70)
  const desc = p.foldText?.get(q.id);
  // скопление семьи на обзоре (решение 142): «+N» у подписи старшего — щелчок открывает «Ближайшую родню»
  const pile = desc ? undefined : p.pileText?.get(q.id);
  const fold = desc ?? pile ?? p.revealText?.get(q.id);
  const color = epochalAt(v, i) && o.color === v.pal.ink && o.alpha < 1 ? v.pal.ink2 : o.color;
  const note = o.note ?? (p.namesakes?.get(q.id) || undefined);
  const at = labelStar(v, p, i, { ...o, color, ...(note ? { note } : {}), ...(fold ? { fold } : {}) });
  if (at?.fold && p.foldHits) p.foldHits.push({ ...at.fold, kind: desc ? 'desc' : pile ? 'pile' : 'reveal', id: q.id });
  return at;
}

/**
 * Подписи звёзд — группами по старшинству; каждая следующая группа не ложится на уже занятое (D13, E1, E10; MAP-07):
 *  1) выбранное, второе, наведённое и лицо с фокусом; Иисус Христос (MOB-53); лица со свёрнутыми потомками — с «+N»,
 *     он вытесняет соседей (MAP-63, UX-60);
 *  2) отметки поиска — с уточнением; путь родства и супруги выбранного; семья выбранного — родители, супруги, дети,
 *     братья и сёстры (E1; MAP-21);
 *  3) обычные — по заранее вычисленным порогам масштаба, на масштабе семьи — все, кому хватает места;
 *  4) «липкие» имена следов, уходящих за левый край (E1; MAP-10);
 *  5) на меридиане — до восьми самых значимых живых сверх порогов.
 * Между группами 2 и 3 размещаются меридианы событий, скопления и названия созвездий (sky.ts, labelLayer).
 * У одноимённых в окне — краткое уточнение (MAP-66). Погашенные выделением подписи держат контраст не ниже 4,5 : 1
 * к самому светлому фону (решение 31; MOB-41) и теряют полужирный.
 */
export function drawStarLabels(v: SkyContext, p: Pass, between?: () => void) {
  const { cam, pal } = v;
  const s = p.s;
  const hl = s.highlight;
  const lineOnly = s.onlyLines;
  const cache = v.labelCache;
  cache.ensure(v);
  const idx = (id: string | null) => (id ? v.indexOf(id) : undefined);
  const shown = (i: number | undefined): i is number => i !== undefined && !v.nodes[i].ghost && v.drawn(i) && p.starAlpha(i) > 0.5;
  /** Непрозрачность и начертание подписи по выделению: погашенная — не ниже 4,5 : 1 и без полужирного. */
  const dimOf = (i: number): { alpha: number; light: boolean } => {
    const q = byId.get(v.nodes[i].person)!;
    const k = hl ? hl.get(q.id) : 'self';
    const floor = q.magnitude <= 2 ? pal.dimInk : pal.dimInk2;
    if (k === undefined) return { alpha: p.work ? Math.max(WORK_DIM, floor) : Math.max(DIM, floor), light: true };
    return { alpha: k === 'likely' ? likelyAlpha(floor) : 1, light: false };
  };

  // верхняя ступень 164 у выбранного: родители, супруги, лица лент величины ≤ 1 — подписаны всегда (исключение 163 — разрыв)
  const topOf = s.selected ? familyTier(s.selected, p.spine) : () => 9;
  // 1) обязательные: у правого края — слева от звезды; выбранное — первым и без проверки; концы выбранной связи (§ 8, Я24)
  let first = true;
  const ends = s.link ? linkRoles(s.link).map((e) => e.id) : [];
  for (const id of new Set([s.selected, s.second, s.hovered, s.focus, ...ends])) {
    const i = idx(id);
    if (!shown(i)) continue;
    putLabel(v, p, i, { sides: ['r', 'l', 't', 'b'], color: pal.ink, alpha: 1, sigla: true, leader: true, far: true, overStars: true, force: first, reveal: true, top: id === s.selected || topOf(id!) <= 1 });
    first = false;
  }
  // имена матерей у ромбов выбранного — обязательный ярус сразу после него (решение 137, Г4; trails.ts): выноской до 40 px
  drawMotherNames(v, p, p.links);
  // Иисус Христос — к Нему сходятся ленты: подписан на любом масштабе, где видна звезда и есть место (MOB-53). Сначала —
  // место, где имя не закрывает ни одной звезды, в том числе с выноской подальше: на обзоре телефона слева от звезды —
  // гуща царей Иудеи, имя поверх неё прятало бы их звёзды и перехватывало касание. Нет такого места — слева или
  // с выноской поверх тусклых звёзд, но не на обзоре: там такое место ложится на гущу коридора (знаки, нити, переходы),
  // и опорное имя лучше скрыть, чем поставить на гущу (1129); имя встаёт при наведении и в списке скрытых
  const ij = idx(MESSIAH);
  let messiahOut = -1;
  if (shown(ij)) {
    const o = { sides: ['r', 'l', 't', 'b'] as Side[], color: pal.ink, alpha: dimOf(ij).alpha, sigla: true, leader: true };
    // места имён звёзд величины 0–1 справа от них: имя Христа и его выноска их не занимают (Давид, Авраам на обзоре)
    const avoid: Rect[] = [];
    for (const i of p.vis) {
      const q = byId.get(v.nodes[i].person)!;
      if (i === ij || q.magnitude > 1 || !shown(i) || !(cache.nameW[i] > 0)) continue;
      const x = cam.sx(v.X0[i]);
      const y = cam.sy(starLaneOf(v.nodes[i]));
      if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
      avoid.push(spot('r', x, y, starRadius(q.magnitude, p.zoomScale), cache.nameW[i], nameSize(q.magnitude, v.coarse)).box);
    }
    // на обзоре — первым и слева от звезды, на уровне лент: над ними, затем под ними (MAP-81); соседи уступают место
    const jx = cam.sx(v.X0[ij]);
    const jy = cam.sy(starLaneOf(v.nodes[ij]));
    const R = starRadius(0, p.zoomScale) * 2.4;
    const half = ((ASC + DESC) * nameSize(0, v.coarse)) / 2;
    // строка — над лентами (нити косы и их поле — до 6 px от оси), затем под ними
    const places = [9, 16].flatMap((d) => [
      { xr: jx - R - 4, yc: jy - half - d },
      { xr: jx - R - 4, yc: jy + half + d },
    ]);
    const overview = p.starDetail < 0.99;
    // не закрывая звёзд ярче 4-й величины (MOB-53: на обзоре телефона слева — гуща царей Иудеи)
    if (!(overview && putLabel(v, p, ij, { ...o, places, sides: [], leader: false, cover: 4 })))
      // на обзоре — только чистое место: ни звезды под именем, ни чужой линии через строку (1129)
      if (!putLabel(v, p, ij, { ...o, far: true, wide: overview && !s.selected, reach: overview && !s.selected ? LEADER_MESSIAH : undefined, least: true, avoid, cover: overview ? 99 : 4, clean: overview })) {
        if (!overview) putLabel(v, p, ij, { ...o, overStars: true, reveal: true, cover: 4 });
        // на обзоре имя скрыто, и обычный ярус его не ставит: он закрыл бы погашенные знаки (у величины 0 — до 2-й)
        else messiahOut = ij;
      }
  }
  // свёрнутые потомки: «+N» у подписи лица — обязательная подпись (MAP-63, UX-60). «+N» скопления семьи (решение 142)
  // встаёт в подпись старшего, если она положена ему и без того: десятки «+1» по всему роду были бы шумом
  for (const id of p.foldText?.keys() ?? []) {
    const i = idx(id);
    if (!shown(i)) continue;
    putLabel(v, p, i, { sides: SIDES, color: pal.ink, alpha: 1, sigla: true, leader: true, overStars: true });
  }
  // 2) отметки поиска — с уточнением (E10); путь родства и супруги выбранного; семья выбранного
  for (const id of s.pins) {
    const i = idx(id);
    if (!shown(i)) continue;
    const q = byId.get(id)!;
    putLabel(v, p, i, { sides: SIDES, color: pal.ink, alpha: 1, note: q.disambig ? `, ${q.disambig}` : undefined, leader: true, far: true, overStars: true });
  }
  if (hl)
    for (const [id, k] of hl) {
      if (k !== 'path') continue;
      const i = idx(id);
      if (!shown(i) || (lineOnly && !p.spine.has(id))) continue;
      putLabel(v, p, i, { sides: SIDES, color: pal.ink, alpha: 1, sigla: true, leader: true, far: true, overStars: true });
    }
  // семья выбранного — раньше всех прочих (решения 137, 144, 146): тесно — выноской до 40 px, затем — место без чужих
  // знаков, где имя читается своим лучше всего (StarOpts.kin)
  if (s.selected && !s.pins.size)
    for (const id of familyOrder(s.selected, p.spine, (x) => cache.rank[idx(x) ?? -1] ?? 1e9)) {
      const i = idx(id);
      if (!shown(i) || (lineOnly && !p.spine.has(id))) continue;
      const ko: StarOpts = { sides: SIDES, color: pal.ink, alpha: 1, sigla: true, leader: true, far: true, overStars: true, kin: true, top: topOf(id) <= 1 };
      // нет места и так — имя без уточнения одноимённого («Фамарь» вместо «Фамарь, дочь Давида»): у выбранного его
      // родня узнаётся по связи, полное имя — в подсказке и карточке (П1: не тишина)
      if (!putLabel(v, p, i, ko) && p.namesakes?.get(id)) putLabel(v, p, i, { ...ko, note: '' });
    }
  // рабочий набор (J4): в режиме «В работе» подписаны все лица набора — по степени интереса, с выноской, если у звезды тесно;
  // погашенные выделением — не ниже 70 % (MAP-64) и 4,5 : 1 (решение 31)
  if (p.work) {
    const all = p.vis.filter((i) => !v.nodes[i].ghost && !p.labeled.has(i) && v.drawn(i)).sort((a, b) => cache.rank[a] - cache.rank[b]);
    for (const i of all) {
      const q = byId.get(v.nodes[i].person)!;
      const d = dimOf(i);
      // в показе линий каждая звезда — бусина линии: имя, которому не нашлось места ни у звезды, ни номером у бусины
      // (ribbons.ts, drawLineNames), не ложится на соседние бусины — иначе оно прячет лицо линии (этап 13, Я12)
      putLabel(v, p, i, { sides: SIDES, color: q.magnitude <= 2 ? pal.ink : pal.ink2, alpha: d.alpha, light: d.light, sigla: true, leader: true, far: true, overStars: !lineOnly });
    }
  }
  // 3) обычные — по порогам (на масштабе семьи — все); старшие подписи они не перекрывают. Звёзды величины 0–1 —
  // раньше меридианов событий, скоплений и названий созвездий, остальные — после
  const family = cam.ky >= FAMILY_KY;
  const lv = Math.max(0, Math.min(LEVELS - 1, Math.floor(p.level)));
  // узкое небо при выбранном лице (решение 144; M2): подписи вне рода выбранного и лент не ставятся — место семье
  const narrow = !!s.selected && !!hl && !p.work && cam.vp.r - cam.vp.l < NARROW_SKY;
  const cand: number[] = [];
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.ghost || p.labeled.has(i) || i === messiahOut) continue;
    if (lineOnly && !p.spine.has(n.person)) continue;
    if (narrow && !hl!.has(n.person) && !p.spine.has(n.person) && !s.pins.has(n.person)) continue;
    if (p.starAlpha(i) <= 0.5) continue;
    const need = cache.level[i] - (cache.shown[i] ? HYSTERESIS : 0);
    // звёзды величины 0 (Авраам, Иаков, Давид…) — кандидаты на любом масштабе: тесно у звезды — с выноской (MAP-06)
    if (!family && !(p.level >= need) && byId.get(n.person)!.magnitude > 0) continue;
    cand.push(i);
  }
  cand.sort((a, b) => cache.rank[a] - cache.rank[b]);
  const now = new Uint8Array(cache.shown.length);
  let hooked = false;
  for (const i of cand) {
    const q = byId.get(v.nodes[i].person)!;
    if (!hooked && q.magnitude > 1) {
      hooked = true;
      between?.();
    }
    // подписи зажигаются вслед за звёздами; после зажигания — все в полную силу (и величины 6 тоже)
    const lit = Math.max(0, Math.min(1, s.intro * 7.5 - q.magnitude - 0.5));
    if (lit <= 0) continue;
    const bright = q.magnitude <= 2;
    // лицо «время не установлено» — курсивом --ink-2 (MAP-52)
    const color = bright && !epochalAt(v, i) ? pal.ink : pal.ink2;
    // погашенная подпись — не ниже 4,5 : 1 к самому светлому фону и без полужирного (решение 31)
    const d = dimOf(i);
    const pref = cache.level[i] <= p.level ? SIDES[cache.side[i * LEVELS + lv]] : 'r';
    const sides: Side[] = [pref, ...SIDES.filter((x) => x !== pref)];
    const leader = family || q.magnitude <= 1 || p.spine.has(q.id);
    // на масштабе семьи подписаны все, кому хватает места (E1: не меньше 90 %) — и дальними выносками, как в наборе: у края
    // узкого неба (телефон) ближние места уходят за край или на название созвездия; звёзды величины 0–1 — и на обзоре
    // (MAP-06): выноска не длиннее 40 px (решение 140)
    const so: StarOpts = { sides, color, alpha: d.alpha * lit, light: d.light, sigla: true, leader, far: family || q.magnitude <= 1 || p.spine.has(q.id), fan: family };
    // звезда величины 0 на обзоре без выбранного (MAP-06; исключение К8): у звезды тесно — выноской до 100 px через пустое
    // небо (знак не закрывается, выноска не пересекает выносок, связей и лент)
    if (putLabel(v, p, i, so) || (q.magnitude === 0 && !family && !s.selected && !v.viewMoving && p.starDetail < 0.99 && putLabel(v, p, i, { ...so, wide: true }))) now[i] = 1;
  }
  if (!hooked) between?.();
  cache.shown = now;

  // 4) «липкие» имена следов, уходящих за левый край (MAP-10): курсив, --ink-2, со знаком «‹»
  if (p.detail > 0.5 && !lineOnly) stickyNames(v, p);

  // 5) меридиан: самые значимые из живых, кому не хватило порога, — если есть место (IX-34)
  if (s.meridian !== null && hl) {
    const top = v.openTop;
    const bottom = cam.vp.b;
    const extra: number[] = [];
    for (const i of p.vis) {
      const n = v.nodes[i];
      if (n.ghost || p.labeled.has(i)) continue;
      const k = hl.get(n.person);
      if (k !== 'sure' && k !== 'likely') continue;
      const y = cam.sy(starLaneOf(n));
      if (y < top || y > bottom) continue;
      extra.push(i);
    }
    const rank = (i: number) => {
      const q = byId.get(v.nodes[i].person)!;
      return q.magnitude * 100 - q.prominence - (hl.get(q.id) === 'sure' ? 50 : 0);
    };
    extra.sort((a, b) => rank(a) - rank(b));
    let added = 0;
    for (const i of extra) {
      if (added >= MERIDIAN_EXTRA) break;
      const q = byId.get(v.nodes[i].person)!;
      const likely = hl.get(q.id) === 'likely';
      if (putLabel(v, p, i, { sides: SIDES, color: pal.ink, alpha: likely ? likelyAlpha(pal.dimInk) : 1 })) added++;
    }
  }

  // замер: сколько видимых звёзд подписано (E1); неподписанные — скрытые подписи (контракт 2)
  let stars = 0;
  let named = 0;
  const hidden: number[] = [];
  for (const i of p.vis) {
    const n = v.nodes[i];
    // звёзды, собранные в скопление старшего при выбранном, не нарисованы: их называет «+N» его подписи — не скрытые
    // подписи; прореженные без выбранного (решение 142) — в скрытых: знак не нарисован, имя читает диктор
    const thin = !!p.thinned?.has(i);
    if (n.ghost || !v.drawn(i) || p.starAlpha(i) <= 0.5 || (!thin && !p.starShown(i))) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(starLaneOf(n));
    if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
    if (thin) {
      hidden.push(i);
      continue;
    }
    // звезда под органами неба и карточкой: в счёт подписанных не входит, но в списке скрытых — её имя читает диктор
    // и называет строка «Без подписи на небе» карточки у звезды (решения 140, 153)
    if (hits({ x: x - 1, y: y - 1, w: 2, h: 2 }, p.reserve)) {
      if (!p.labeled.has(i)) hidden.push(i);
      continue;
    }
    stars++;
    if (p.labeled.has(i)) named++;
    else {
      if (p.work) v.ledger.unnamed.push(n.person);
      hidden.push(i);
    }
  }
  v.ledger.stars = stars;
  v.ledger.named = named;
  hidden.sort((a, b) => cache.rank[a] - cache.rank[b]);
  v.ledger.hidden = hidden.map((i) => v.nodes[i].person);
}

/** «Липкие» имена: у следа, звезда которого за левым краем, имя стоит у края над следом (MAP-10). */
function stickyNames(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  const left = cam.vp.l + 4;
  const font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
  const size = mapSize(T_MAP_S, v.coarse);
  const hl = p.s.highlight;
  const list: number[] = [];
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.ghost || n.trail !== 'life' || p.labeled.has(i)) continue;
    const x0 = cam.sx(v.X0[i]);
    const x1 = cam.sx(v.X1[i]);
    if (x0 >= cam.vp.l || x1 < left + 60) continue;
    // след у левого края — в полосе того года (решение 173: пребывание или переход)
    const y = trailYAt(v, n, left);
    if (y < v.openTop || y > cam.vp.b) continue;
    list.push(i);
  }
  list.sort((a, b) => v.labelCache.rank[a] - v.labelCache.rank[b]);
  ctx.font = font;
  for (const i of list) {
    const n = v.nodes[i];
    const q = byId.get(n.person)!;
    const text = `‹ ${q.name}`;
    const w = ctx.measureText(text).width;
    const x1 = cam.sx(v.X1[i]);
    if (left + w + 8 > x1) continue;
    const y = Math.round(trailYAt(v, n, left)) + 0.5;
    // подпись лежит на следе: под ней след не переходит в другую полосу
    if (hasGlides(n) && Math.abs(trailYAt(v, n, left + w + 8) - y) > 1) continue;
    const ty = y - 3;
    const b = claim(v, p, [textBox(left, ty, w, size)], 'sticky', q.name, { id: q.id });
    if (!b) continue;
    const k = hl ? hl.get(q.id) : 'self';
    ctx.globalAlpha = k === undefined ? Math.max(DIM, pal.dimInk2) : 1;
    ctx.strokeStyle = pal.halo;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, left, ty);
    ctx.fillStyle = pal.ink2;
    ctx.fillText(text, left, ty);
    ctx.globalAlpha = 1;
    p.labeled.add(i);
  }
}

/** Высота следа узла n над x (px холста): полоса в год под x (договор 1, src/engine/stays.ts, laneAt). */
function trailYAt(v: Pick<SkyContext, 'cam' | 'tOf'>, n: NodeRow, x: number): number {
  return v.cam.sy(hasGlides(n) ? laneAt(n, v.tOf(v.cam.wx(x))) : n.lane);
}

// ---------- названия созвездий ----------

/**
 * Где может стоять название созвездия: пустые места внутри контура (E8, слоты раскладки) в px холста — отрезок по x
 * и середина по y с высотой; лучшие — первыми. size — лиц в созвездии (при нехватке места остаётся более крупное).
 */
export interface GroupNameSpot {
  group: string;
  size: number;
  /** места под название: [x0, x1] по горизонтали, yc — середина, h — высота места в px */
  slots: { x0: number; x1: number; yc: number; h: number }[];
  /** рамка контура на экране: на обзоре название ставится и по её середине */
  box?: { x0: number; x1: number; y0: number; y1: number };
  /** отрезки по y, где контур пересекает левый край открытого неба: название «прилипает» к левому полю (E8) */
  edge?: [number, number][];
  /** кольца контура в px холста (MAP-58): по ним ищется средняя линия видимой части области */
  poly?: { x: Float64Array; y: Float64Array }[];
}

/** Отрезки по y внутри колец на вертикали x (чётно-нечётное правило), по возрастанию. */
export function ringSpans(poly: { x: Float64Array; y: Float64Array }[], x: number): [number, number][] {
  const ys: number[] = [];
  for (const r of poly) {
    const n = r.x.length;
    for (let k = 0; k < n; k++) {
      const x1 = r.x[k];
      const x2 = r.x[(k + 1) % n];
      if ((x1 - x) * (x2 - x) < 0) ys.push(r.y[k] + ((r.y[(k + 1) % n] - r.y[k]) * (x - x1)) / (x2 - x1));
    }
  }
  ys.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < ys.length; k += 2) out.push([ys[k], ys[k + 1]]);
  return out;
}
/** Общая часть отрезков двух списков. */
function spanAnd(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) if (Math.min(a1, b1) > Math.max(a0, b0)) out.push([Math.max(a0, b0), Math.min(a1, b1)]);
  return out;
}
/**
 * Название созвездия не ложится ни на одну звезду (решение 140, К2: тусклая звезда — тоже лицо): прежде оно могло закрыть
 * звёзды 4–6-й величины. Места нет — на этом участке названия нет, оно повторится дальше по средней линии области.
 */
export const GROUP_COVER_FROM = 99;
/** Видимая область созвездия, у которой название обязательно (MAP-58): не меньше стольких px. */
export const GROUP_AREA_MIN: [number, number] = [150, 60];

/** Название созвездия прописными с разрядкой (единственное место, где прописные допустимы, — ТЗ § 5.6). */
export const groupName = (group: string) => (groupById.get(group)?.name ?? group).toUpperCase();

/** Разрядка названий созвездий; поуже — последнее место на крупной области, где обычной разрядке нет места между звёзд. */
const GROUP_SPACING = '0.22em';
const GROUP_SPACING_TIGHT = '0.1em';
/** Название созвездия повторяется не чаще, чем через столько px (ТЗ § 3.1: «через каждые ~1 200 px»). */
export const GROUP_REPEAT_PX = 1200;
/**
 * Названия созвездий — прописными с разрядкой, в пустом месте внутри контура (E8; MAP-08, 41, 58): середина места, если
 * название там помещается целиком, и не ложится на подписи, звёзды, органы неба, следы и стволы скоб; место уходит за
 * левый край — название «прилипает» к левому полю. Повторяется через ~1 200 px; нет места — не рисуется. Возвращает их
 * прямоугольники.
 */
export function drawGroupNames(v: SkyContext, p: Pass, spots: GroupNameSpot[], noRoom?: Set<string>): (Rect & { group: string })[] {
  const { ctx, pal } = v;
  const hl = p.s.highlight;
  const fs = mapSize(T_MAP_S, v.coarse);
  // у каждого прямоугольника — созвездие: по названию открывается меню «Свернуть созвездие» (J5; src/ui/sky/input.ts)
  const boxes: (Rect & { group: string })[] = [];
  const done = new Set<string>();
  /** x начала названий созвездия в этом кадре: следующее — не ближе GROUP_REPEAT_PX (ТЗ § 3.1) */
  const placed = new Map<string, number[]>();
  /** в просмотренной области нашлось место без звёзд под буквами названия */
  let starFree = false;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  ctx.letterSpacing = GROUP_SPACING;
  ctx.textBaseline = 'alphabetic';
  // при выделении названия гаснут не ниже 0,75 и не ниже 4,5 : 1 к самому светлому фону (E12; MOB-41; решение 31)
  ctx.fillStyle = alpha(pal.ink3, hl ? Math.max(CONSTELLATION_DIM, pal.dimInk3) : 0.95);
  const L = v.letterW + 8;
  const R = v.cam.w - 8;
  // на обзоре следов нет (облака): название может выходить за пустое место — по средней линии области, лишь бы
  // не ложилось на звёзды, подписи и органы неба
  const low = p.detail < 0.5;
  // рамка — по очертанию букв названия, если оно выше строки: «Й» с крышкой и «Д», «Ц» с хвостами выходят за ASC и DESC,
  // и рамка по строке пропускала погашенный знак под крышкой (1132: «ДВОР И ВОЙСКО ЦАРЕЙ» на знаке Даниила)
  let ink = { a: ASC * fs, d: DESC * fs };
  const inkOf = (name: string) => {
    const m = ctx.measureText(name);
    const a = m.actualBoundingBoxAscent;
    const d = m.actualBoundingBoxDescent;
    return { a: Math.max(ASC * fs, Number.isFinite(a) ? a : 0), d: Math.max(DESC * fs, Number.isFinite(d) ? d : 0) };
  };
  const at = (xc: number, yc: number, tw: number) => {
    const x = Math.max(L, Math.min(R - tw, xc - tw / 2));
    const y = yc + (ASC - DESC) * 0.5 * fs;
    return { x, y, box: { x: x - 2, y: y - ink.a - 2, w: tw + 4, h: ink.a + ink.d + 4 } };
  };
  for (const o of [...spots].sort((a, b) => b.size - a.size)) {
    const name = groupName(o.group);
    let tw = ctx.measureText(name).width;
    ink = inkOf(name);
    const cands: ReturnType<typeof at>[] = [];
    // место, уходящее за левый край, — название «прилипает» к левому полю (MAP-58), как имена следов
    const sticky: ReturnType<typeof at>[] = [];
    // на обзоре — по средней линии области (ТЗ § 3.1), если название не шире области больше чем на треть
    const bw = o.box ? Math.min(o.box.x1, R) - Math.max(o.box.x0, L) : 0;
    const fitsLow = low && !!o.box && tw <= bw * 1.35;
    if (fitsLow) {
      const yc = (o.box!.y0 + o.box!.y1) / 2;
      const xc = (Math.max(o.box!.x0, L) + Math.min(o.box!.x1, R)) / 2;
      for (const dy of [0, -fs - 4, fs + 4]) cands.push(at(xc, yc + dy, tw));
    }
    for (const sl of o.slots) {
      // видимая часть места; название — в её середине, если помещается с полями
      const a = Math.max(sl.x0, L);
      const b = Math.min(sl.x1, R);
      // место в целых полосах: строка может занять и по полполосы сверху и снизу — там следов нет (след — по середине полосы)
      const tall = sl.h + v.cam.ky >= fs + 4;
      if (tall && sl.x0 < L && b - L >= tw + 12) sticky.push(at(L + 4 + tw / 2, sl.yc, tw));
      if (tall && b - a >= tw + 16) cands.push(at((a + b) / 2, sl.yc, tw));
      else if (fitsLow && b > a) cands.push(at((a + b) / 2, sl.yc, tw));
    }
    // созвездие уходит за левый край: название — у левого поля, по середине области на краю (последним: там могут быть следы)
    const edge: ReturnType<typeof at>[] = [];
    for (const [y0, y1] of [...(o.edge ?? [])].sort((a, b) => b[1] - b[0] - (a[1] - a[0])))
      if (y1 - y0 >= fs + 6) edge.push(at(L + 4 + tw / 2, (y0 + y1) / 2, tw));
    // название повторяется через ~1 200 px (ТЗ § 3.1). Сначала — пустые места (без линий), затем левое поле и средняя
    // линия области; у них линии под названием гасятся цветом фона: ни следы, ни стволы скоб его не перечёркивают (MAP-08)
    const xs = placed.get(o.group) ?? [];
    const far = (x: number, _y?: number) => !xs.some((q) => Math.abs(q - x) < GROUP_REPEAT_PX);
    const clean = [...sticky, ...cands.sort((a, b) => a.x - b.x)].filter((c) => !p.lines?.clash(c.box, false));
    const put = (c: ReturnType<typeof at>, knock: boolean, cover = GROUP_COVER_FROM): boolean => {
      if (!far(c.x, c.box.y + c.box.h / 2)) return false;
      const got = claim(v, p, [c.box], 'group', name, knock ? { coverFrom: cover, softInset: 1 } : { softInset: 1 });
      if (!got) return false;
      // под названием контуры, меридианы событий, следы и стволы скоб прерываются (решение 170; V-4): рамка гасится цветом
      // фона (на обзоре — не по облакам: там только ореол), название пишется с ореолом; звёзд под ним нет (решение 140)
      if (knock || !low) v.fillGround(got.x, got.x + got.w, got.y, got.h);
      ctx.strokeStyle = pal.halo;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(name, c.x, c.y);
      ctx.fillText(name, c.x, c.y);
      boxes.push({ ...got, group: o.group });
      xs.push(c.x);
      done.add(o.group);
      return true;
    };
    for (const c of clean) put(c, false);
    for (const c of edge) put(c, true);
    // средняя линия видимой части области (MAP-58): у области крупнее 150 × 60 px название обязательно; место —
    // внутри контура, не на звёздах и подписях. Меньше линий под названием — лучше, при равенстве — левее (ближе
    // к «липкому» месту). Места ищутся только там, куда название ещё можно поставить (не ближе 1 200 px к уже
    // поставленному): место без линий берётся сразу, остальные — после просмотра всей области
    placed.set(o.group, xs);
    if (!low && o.poly && o.box) {
      const vx0 = Math.max(o.box.x0, L);
      const vx1 = Math.min(o.box.x1, R);
      const vy0 = Math.max(o.box.y0, v.openTop);
      const vy1 = Math.min(o.box.y1, v.cam.vp.b);
      const hh = ink.a + ink.d + 6;
      /**
       * Места по средней линии области: название целиком внутри контура (inner — по трём вертикалям: у краёв и
       * в середине названия) или, если так не нашлось, только его середина (область узка или изрезана).
       */
      const scan = (whole: boolean, cover = GROUP_COVER_FROM, loose = false) => {
        const stepX = Math.max(12, (vx1 - vx0 - (whole ? tw : 0)) / 48);
        const rest: (ReturnType<typeof at> & { lines: number })[] = [];
        const x0 = whole ? vx0 + tw / 2 + 4 : vx0 + 8;
        const x1 = whole ? vx1 - tw / 2 - 4 : vx1 - 8;
        // loose — середина названия в контуре и по вертикали: строка может выйти за контур на полвысоты
        const pad = loose ? 0 : hh / 2;
        for (let xc = x0; xc <= x1; xc += stepX) {
          if (!far(at(xc, 0, tw).x)) continue;
          const spans = whole ? spanAnd(spanAnd(ringSpans(o.poly!, xc - tw / 2), ringSpans(o.poly!, xc)), ringSpans(o.poly!, xc + tw / 2)) : ringSpans(o.poly!, xc);
          const inner = spans
            .map(([a, b]) => [Math.max(a, v.openTop + (loose ? hh / 2 : 0)), Math.min(b, v.cam.vp.b - (loose ? hh / 2 : 0))] as [number, number])
            .filter(([a, b]) => b - a >= (loose ? 1 : hh));
          for (const [a, b] of inner)
            for (let yc = a + pad; yc <= b - pad; yc += loose ? 3 : 6) {
              const c = at(xc, yc, tw);
              // подписи и звёзды ярче 4-й величины под названием недопустимы — такие места сразу отбрасываются
              if (p.placer.clash({ x: c.box.x + 1, y: c.box.y + 1, w: c.box.w - 2, h: c.box.h - 2 }, true, cover, undefined, true)) continue;
              starFree = true;
              if (p.placer.clash(c.box, false)) continue;
              const lines = p.lines ? p.lines.count(c.box) : 0;
              if (lines === 0 && put(c, true, cover)) return;
              if (lines > 0) rest.push({ ...c, lines });
            }
        }
        rest.sort((a, b) => a.lines - b.lines || a.x - b.x);
        for (const c of rest) if (put(c, true, cover)) return;
      };
      // у области крупнее 150 × 60 px название обязательно (MAP-58): целиком внутри контура, иначе — серединой в нём
      const big = vx1 - vx0 >= GROUP_AREA_MIN[0] && vy1 - vy0 >= GROUP_AREA_MIN[1];
      // было ли в области место без звёзд (по буквам) хоть при одной разрядке: нет — название на этом участке не ставится
      // (решение 140), и область помечается «нет места без звёзд» (noRoom; canvas[data-group-areas] «:3»)
      starFree = false;
      if (big && vx1 - vx0 >= tw + 8) scan(true);
      if (big && xs.length === 0) scan(false);
      // область тесна (ромбы союзов, подписи событий): середина названия — в контуре, строка может выйти за него на полвысоты
      // (этап 13: название у крупной области обязательно, MAP-58; звёзды название не закрывает и здесь — решение 140)
      if (big && xs.length === 0) scan(false, GROUP_COVER_FROM, true);
      // и последним — с разрядкой поуже (0,1 em вместо 0,22 em: разрядка остаётся): название короче, место между звёзд
      // находится чаще (решение 140: название звёзд не закрывает, а не уходит с крупной области без нужды)
      if (big && xs.length === 0) {
        ctx.letterSpacing = GROUP_SPACING_TIGHT;
        tw = ctx.measureText(name).width;
        scan(false);
        if (xs.length === 0) scan(false, GROUP_COVER_FROM, true);
        ctx.letterSpacing = GROUP_SPACING;
      }
      if (big && xs.length === 0 && !starFree) noRoom?.add(o.group);
    }
  }
  ctx.letterSpacing = '0px';
  ctx.restore();
  return boxes;
}

// ---------- знак свёрнутого (J5) ----------

/** Ширины знака свёрнутого: название созвездия с разрядкой и отступом (nw) и «+N» (cw). */
export function foldMarkWidth(ctx: CanvasRenderingContext2D, coarse: boolean, name: string, count: string): { nw: number; cw: number } {
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse });
  ctx.letterSpacing = '0.22em';
  const nw = name ? ctx.measureText(name).width + 6 : 0;
  ctx.letterSpacing = '0px';
  return { nw, cw: ctx.measureText(count).width };
}

/**
 * Знак свёрнутого (J5): «+N» — сколько лиц скрыто, подчёркнут, как ссылка неба (щелчок разворачивает); у свёрнутого
 * созвездия перед ним — название прописными с разрядкой, как у названий созвездий. x и baseline — начало и базовая
 * линия строки. Этой же функцией знак рисуют небо и «Как читать карту».
 */
export function drawFoldMark(ctx: CanvasRenderingContext2D, pal: { ink2: string; ink3: string; halo: string }, coarse: boolean, x: number, baseline: number, name: string, count: string) {
  const { nw, cw } = foldMarkWidth(ctx, coarse, name, count);
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  if (name) {
    ctx.letterSpacing = '0.22em';
    ctx.fillStyle = pal.ink3;
    ctx.fillText(name, x, baseline);
    ctx.letterSpacing = '0px';
  }
  ctx.strokeStyle = pal.halo;
  ctx.lineWidth = 3;
  ctx.strokeText(count, x + nw, baseline);
  ctx.fillStyle = pal.ink2;
  ctx.fillText(count, x + nw, baseline);
  ctx.fillRect(Math.round(x + nw), Math.round(baseline + 2), Math.round(cw), 1);
}

// ---------- скопления, меридианы событий, пояснения ----------

/** «44 имени», «21 имя», «37 имён». */
export function namesCount(n: number): string {
  const a = n % 100;
  const b = n % 10;
  const w = a > 10 && a < 20 ? 'имён' : b === 1 ? 'имя' : b >= 2 && b <= 4 ? 'имени' : 'имён';
  return `${n} ${w}`;
}

/** Подпись скопления списка (E2): «Храбрые Давида, 2 Цар 23:8–39; 44 имени». */
export function clusterText(c: { name: string; refs: string[]; count: number }): string {
  return `${c.name}, ${c.refs.map(refText).join('; ')}; ${namesCount(c.count)}`;
}
/** Короткая подпись скопления, если полной нет места: «Храбрые Давида; 44 имени». */
export function clusterShort(c: { name: string; count: number }): string {
  return `${c.name}; ${namesCount(c.count)}`;
}

/**
 * Подпись у знака скопления или над его сеткой: справа, слева, сверху или снизу от anchor (прямоугольник знака).
 * Возвращает прямоугольник или null, если места нет.
 */
export function drawClusterLabel(v: SkyContext, p: Pass, text: string, anchor: Rect, a: number, prefer: 'side' | 'above' = 'side'): Rect | null {
  const { ctx, pal } = v;
  const font = mapFont(T_UI_S, { italic: true, coarse: v.coarse });
  const size = mapSize(T_UI_S, v.coarse);
  ctx.font = font;
  const w = ctx.measureText(text).width;
  const ym = anchor.y + anchor.h / 2 + (ASC - DESC) * 0.5 * size;
  const right = { tx: anchor.x + anchor.w + 6, ty: ym };
  const left = { tx: anchor.x - 6 - w, ty: ym };
  const above = { tx: anchor.x, ty: anchor.y - 3 - DESC * size };
  const below = { tx: anchor.x, ty: anchor.y + anchor.h + 3 + ASC * size };
  const order = prefer === 'above' ? [above, below, right, left] : [right, left, above, below];
  const cands = order.map((c) => ({ c, box: textBox(c.tx, c.ty, w, size) }));
  const got = claim(v, p, cands.map((c) => c.box), 'cluster', text);
  if (!got) return null;
  const c = cands.find((q) => q.box === got)!.c;
  ctx.globalAlpha = a;
  ctx.strokeStyle = pal.halo;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, c.tx, c.ty);
  ctx.fillStyle = pal.ink2;
  ctx.fillText(text, c.tx, c.ty);
  ctx.globalAlpha = 1;
  return got;
}

/**
 * Подпись меридиана события (E7; MAP-32): повёрнутая строка вдоль черты у верхнего края открытого неба (или у нижнего),
 * «Исход, 1446 г. до Р. Х. (расч.)»; не помещается — только название; нет места — не рисуется.
 */
export function drawEventLabel(v: SkyContext, p: Pass, x: number, full: string, short: string): Rect | null {
  const { ctx, cam, pal } = v;
  const font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
  const fs = mapSize(T_MAP_S, v.coarse);
  ctx.font = font;
  // на обзоре и на узком небе — только название: год читается по линейке, а строка не закрывает небо
  const texts = p.detail < 0.5 || cam.w < 720 ? [short] : [full, short];
  for (const text of texts) {
    const tw = ctx.measureText(text).width;
    // у верхнего края, у нижнего, затем — первое свободное место вдоль черты
    const ys = [v.openTop + 6, cam.vp.b - 6 - tw];
    for (let y = v.openTop + 30; y < cam.vp.b - 6 - tw; y += 24) ys.push(y);
    for (const y0 of ys) {
      const box = { x: x + 1.5, y: y0 - 1.5, w: (ASC + DESC) * fs + 3, h: tw + 3 };
      if (!claim(v, p, [box], 'event', text)) continue;
      ctx.save();
      ctx.translate(x + 3 + ASC * fs, y0 + tw);
      ctx.rotate(-Math.PI / 2);
      ctx.strokeStyle = pal.halo;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = pal.ink3;
      ctx.fillText(text, 0, 0);
      ctx.restore();
      return box;
    }
  }
  return null;
}

/** Пояснение на пустом небе после канона (две строки по центру пустого места); нет места — не рисуется. */
export function drawNote(v: SkyContext, p: Pass, lines: string[], cx: number, cy: number, minX: number): Rect | null {
  const { ctx, pal } = v;
  ctx.font = mapFont(T_NOTE, { italic: true, coarse: v.coarse });
  const fs = mapSize(T_NOTE, v.coarse);
  const ws = lines.map((l) => ctx.measureText(l).width);
  const w = Math.max(...ws);
  const lh = fs + 10;
  const box = { x: cx - w / 2 - 2, y: cy - lh * (lines.length / 2) - 2, w: w + 4, h: lh * lines.length + 4 };
  if (box.x <= minX) return null;
  if (!claim(v, p, [box], 'note', lines[0], { soft: false })) return null;
  ctx.fillStyle = pal.ink3;
  ctx.textBaseline = 'alphabetic';
  lines.forEach((l, k) => ctx.fillText(l, cx - ws[k] / 2, box.y + 2 + lh * k + ASC * fs + 4));
  return box;
}
