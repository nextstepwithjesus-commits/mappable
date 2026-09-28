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
 * не ложится на органы неба (резерв), на указатели у края, на другие подписи любого рода и на чужие звёзды. Порядок —
 * по старшинству: выбранное лицо → отметки, путь, семья выбранного → меридианы событий → скопления → названия созвездий →
 * звёзды по степени интереса → «липкие» имена следов → живые на меридиане. Что не поместилось, не рисуется.
 *
 * Замер (LabelLedger, measureLabels): каждая нарисованная в кадре подпись оставляет прямоугольник — тот же, что
 * проверяло размещение. Число пересекающихся пар — «наложения». Небо отдаёт замер в атрибут
 * `.sky[data-labels="N/M"]`: N — нарисовано подписей, M — наложений (для проверок этапа 4); на холсте —
 * `data-named="n/m"`: подписано n из m видимых звёзд.
 */
import { KX_MIN } from './camera.ts';
import { starRadius, roleSigla } from './glyphs.ts';
import { alpha } from './color.ts';
import { CONSTELLATION_DIM, DIM, likelyAlpha, WORK_DIM } from './dim.ts';

/** Иисус Христос: подпись — наивысшего приоритета после выбранного (MOB-53). */
const MESSIAH = 'iisus';
import { mapFont, mapSize, nameFontWith, nameSize, siglaFont, textScale, T_MAP_S, T_NOTE, T_UI_S } from './type.ts';
import { byId, graph, groupById, lines } from '../data/atlas.ts';
import { primaryChildren, siblings } from '../engine/graph.ts';
import { refText } from '../engine/kinship.ts';
import { BOOK_INDEX, parseRef } from '../engine/books.ts';
import { cross, hits, type Rect } from './rect.ts';
import type { Pass, SkyContext } from './sky.ts';

/** Сколько самых значимых живых подписать сверх обычных порогов, когда стоит меридиан (D13; IX-34). */
const MERIDIAN_EXTRA = 8;
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

/**
 * Место подписи шириной w с кеглем size у звезды (x, y) радиуса r. Справа и слева подпись стоит по середине звезды,
 * с отступом r + 5: черта царя над диском остаётся над строкой и не читается как тире (MAP-11, VIS-40). Сверху —
 * выше черты царя, снизу — под диском. Прямоугольник — строка с полем 1,5 px: тот же, что проверяется на наложения.
 */
export function spot(side: Side, x: number, y: number, r: number, w: number, size: number, king = false) {
  const gap = r + 5;
  const tx = side === 'r' ? x + gap : side === 'l' ? x - gap - w : x - w / 2;
  const ty =
    side === 't' ? y - r - (king ? 7 : 3.5) - DESC * size : side === 'b' ? y + r + 3 + ASC * size : y + (ASC - DESC) * 0.5 * size;
  return { tx, ty, box: textBox(tx, ty, w, size) };
}

/** Прямоугольник строки с базовой линией ty: поле 1,5 px — ореол подписи. */
export function textBox(tx: number, ty: number, w: number, size: number): Rect {
  return { x: tx - 1.5, y: ty - ASC * size - 1.5, w: w + 3, h: (ASC + DESC) * size + 3 };
}

/** Выноска для звёзд величины 0–1 и лиц линий: подпись отнесена на 14–24 px по диагонали, к ней — тонкая линия (MAP-06). */
const LEADERS: [number, number][] = [[16, -14], [16, 14], [-16, -14], [-16, 14], [24, -22], [24, 22], [-24, -22], [-24, 22]];
/** Дальние выноски — в режиме «В работе» (J4), где подписаны все лица набора: в тесном месте подпись уходит дальше. */
const FAR_LEADERS: [number, number][] = [[40, 0], [-40, 0], [36, -34], [36, 34], [-36, -34], [-36, 34], [60, -18], [60, 18], [-60, -18], [-60, 18]];
/** Отрезок от звезды (x, y) к (ax, ay), без первых skip px, не пересекает занятых подписями мест (шаг 3 px). */
function segmentClear(pl: Placer, x: number, y: number, ax: number, ay: number, skip: number): boolean {
  const d = Math.hypot(ax - x, ay - y);
  for (let t = skip; t <= d; t += 3) {
    const px = x + ((ax - x) * t) / d;
    const py = y + ((ay - y) * t) / d;
    if (pl.clash({ x: px - 0.5, y: py - 0.5, w: 1, h: 1 }, false)) return false;
  }
  return true;
}
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
/** Выноски подальше (StarOpts.wide): до 100 px в сторону и 90 px вверх или вниз, ближние раньше. */
const WIDE_LEADERS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (const dx of [16, 40, 70, 100]) for (const dy of [24, 36, 48, 60, 75, 90]) out.push([-dx, -dy], [-dx, dy], [dx, -dy], [dx, dy]);
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
export class Placer {
  private hard = new Map<number, Rect[]>();
  private soft = new Map<number, (Rect & { m: number })[]>();
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
  /** Занять место; soft — звезда величины m (её подпись может закрыть только намного более яркая). */
  add(r: Rect, soft = false, m = 0) {
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
   * тусклее закрывать можно (яркое имя на обзоре важнее тусклой точки).
   */
  clash(r: Rect, withSoft = true, coverFrom = 99): boolean {
    for (const k of Placer.keys(r)) {
      for (const o of this.hard.get(k) ?? []) if (cross(r, o)) return true;
      if (withSoft) for (const o of this.soft.get(k) ?? []) if (o.m < coverFrom && cross(r, o)) return true;
    }
    return false;
  }
  /** Сколько звёзд закрывает r, с весом по яркости (7 − величина): для выбора места, где имя прячет меньше всего. */
  cover(r: Rect): number {
    const seen = new Set<Rect>();
    let sum = 0;
    for (const k of Placer.keys(r))
      for (const o of this.soft.get(k) ?? [])
        if (!seen.has(o) && cross(r, o)) {
          seen.add(o);
          sum += 7 - Math.min(6, o.m);
        }
    return sum;
  }
  /** Сколько занятых (жёстких) прямоугольников пересекает r — для выбора места с наименьшим числом пересечений. */
  count(r: Rect): number {
    const seen = new Set<Rect>();
    for (const k of Placer.keys(r)) for (const o of this.hard.get(k) ?? []) if (!seen.has(o) && cross(r, o)) seen.add(o);
    return seen.size;
  }
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
  /** ширина сокращения роли с отступом; −1 — ещё не замерена */
  siglaW = new Float64Array(0);
  /** место узла в порядке степени интереса (Фурнас): величина, линии Мессии, значимость */
  rank = new Int32Array(0);
  /** узел подписан в прошлом кадре (гистерезис) */
  shown = new Uint8Array(0);
  private key = '';

  /** Сбросить пороги: сменился размер холста. */
  invalidate() {
    this.key = '';
  }

  /** Пороги для текущей модели, масштаба времени, высоты холста и масштаба «всего неба». */
  ensure(v: SkyContext) {
    const f = v.cam.fitK;
    // сжатие полос (J4, J5) меняет места звёзд по вертикали: пороги считаются по строкам экрана
    // и пропорция полос (J1): высота строки меняет места подписей по вертикали
    // и лица линий на нитях в режиме «только линии» (MAP-71): узлы кадра — не узлы раскладки
    const key = `${v.model.id}|${Math.round(v.lambda * 4)}|${v.cam.h}|${v.coarse}|${f ? `${f.kx.toPrecision(3)} ${f.ky.toPrecision(3)}` : ''}|${v.rowsKey}|${v.cam.lanes.toFixed(3)}|${v.cam.focusLanes}|${v.nodes === v.model.nodes}|${textScale()}`;
    if (key === this.key) return;
    this.key = key;
    const nodes = v.nodes;
    const n = nodes.length;
    this.level = new Float64Array(n).fill(Infinity);
    this.side = new Uint8Array(n * LEVELS);
    this.shown = new Uint8Array(n);
    const ctx = v.ctx;
    const widths = new Float64Array(n);
    this.nameW = widths;
    this.siglaW = new Float64Array(n).fill(-1);
    // место подписи в порогах — с «†» младенца (MAP-68); ширина имени — шрифтом узла (курсив у лица без времени)
    const full = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = byId.get(nodes[i].person)!;
      if (nodes[i].ghost) continue;
      ctx.font = labelFontOf(v, i);
      widths[i] = ctx.measureText(p.name).width;
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
        const b = spot(sd, v.X0[i] * kx, -v.rowOf(nodes[i].lane) * ky, r, full[i], size, king).box;
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
 * свёрнутого (J5), номер лица линии у бусины (mark; MAP-59), картуш союза в небе «набор» (plate; решение 70, plates.ts).
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
  reset() {
    this.boxes = [];
    this.stars = 0;
    this.named = 0;
    this.unnamed = [];
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
  return b.x > v.letterW + 2 && b.x + b.w < v.cam.w - 4 && b.y >= v.openTop && b.y + b.h <= v.cam.vp.b;
}

/**
 * Первое свободное место из candidates: внутри открытого неба, не на резерве и не на занятом. Занимает его и пишет
 * в замер. Для подписей любых слоёв (пути родства, лент, призраков): так они проходят ту же проверку наложений.
 */
export function claim(v: SkyContext, p: Pass, candidates: Rect[], kind: LabelKind, text: string, o: { id?: string; soft?: boolean; coverFrom?: number } = {}): Rect | null {
  // названия, скопления и пояснения не ложатся на ленты линий Мессии: ленты — главное на небе
  const avoid = kind === 'group' || kind === 'cluster' || kind === 'note' || kind === 'event' ? p.ribbonBoxes : undefined;
  for (const b of candidates) {
    if (!insideSky(v, b) || hits(b, p.reserve) || hits(b, avoid) || p.placer.clash(b, o.soft ?? true, o.coverFrom)) continue;
    p.placer.add(b);
    v.ledger.add(kind, text, b, o.id);
    return b;
  }
  return null;
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
  /** и выноски подальше — до ~100 px от звезды, ближние раньше (Иисус Христос на обзоре, MOB-53) */
  wide?: boolean;
  /**
   * место, где имя закрывает меньше всего звёзд (с весом по яркости), не ложится на подписи и ленты и ближе к звезде —
   * вместо первого подходящего по порядку сторон (Иисус Христос, MOB-53)
   */
  least?: boolean;
  /** места, которые в режиме least лучше не занимать ни именем, ни выноской: подписи справа у звёзд величины 0–1 */
  avoid?: Rect[];
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
  const yt = Math.round(v.cam.sy(n.lane)) + 0.5;
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
  const { ctx, cam, pal } = v;
  const n = v.nodes[i];
  const q = byId.get(n.person)!;
  const x = cam.sx(v.X0[i]);
  const y = cam.sy(n.lane);
  // звезда за краем окна не подписывается: для выбранных есть указатели у края (MOB-01)
  if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) return null;
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
  // на обзоре и в масштабе эпохи имя может закрыть звезду на две величины тусклее; на масштабе семьи — ни одной
  const coverFrom = o.cover ?? (cam.ky < FAMILY_KY ? q.magnitude + 2 : 99);
  // проходы: (лицо линии) не на лентах → не на звёздах и подписях → не на подписях → (выбранное лицо) где угодно
  type Mode = 'clear' | 'soft' | 'hard' | 'none';
  const offRibbon = p.offRibbon;
  const ok = (b: Rect, m: Mode) =>
    insideSky(v, b) && !hits(b, p.reserve) && (m === 'none' || !p.placer.clash(b, m === 'soft' || m === 'clear', coverFrom)) && (m !== 'clear' || offRibbon!(b));
  let at: { tx: number; ty: number; box: Rect; ax?: number; ay?: number; side: Side | 'x' } | null = null;
  const base: Mode[] = o.force ? ['soft', 'hard', 'none'] : o.overStars ? ['soft', 'hard'] : ['soft'];
  const passes: Mode[] = offRibbon && p.spine.has(q.id) ? ['clear', ...base] : base;
  const vert = o.vertical ?? lineSideOf(q.id);
  const sides = vert === -1 ? o.sides.filter((x) => x !== 'b') : vert === 1 ? o.sides.filter((x) => x !== 't') : o.sides;
  const all = [...LEADERS, ...(o.far ? FAR_LEADERS : []), ...(o.wide ? WIDE_LEADERS : [])];
  const leaders = vert ? all.filter(([, dy]) => Math.sign(dy) === vert || dy === 0) : all;
  if (o.least) {
    let best = Infinity;
    const cands: { tx: number; ty: number; box: Rect; ax?: number; ay?: number; side: Side | 'x'; far: number }[] = [
      ...sides.map((sd) => ({ ...spot(sd, x, y, r, textW + (sd === 'r' ? sigW : 0) + foldW, size, king), side: sd, far: 0 })),
      ...(o.leader ? leaders.map(([dx, dy]) => ({ ...leaderSpot(dx, dy, x, y, textW + foldW, size), side: 'x' as const, far: Math.hypot(dx, dy) })) : []),
    ];
    for (const c of cands) {
      if (!ok(c.box, 'hard')) continue;
      if (c.far > 52 && !segmentClear(p.placer, x, y, c.ax!, c.ay!, r + 2)) continue;
      // звёзды под именем, лента под ним (MAP-56), длина выноски и места имён ярких звёзд под именем или выноской
      let score = p.placer.cover(c.box) + (offRibbon && !offRibbon(c.box) ? 6 : 0) + c.far / 12;
      for (const a of o.avoid ?? []) if (cross(c.box, a) || (c.side === 'x' && segmentCrosses(a, x, y, c.ax!, c.ay!))) score += 12;
      if (score < best) {
        best = score;
        at = c;
      }
    }
  }
  for (const soft of o.least ? [] : passes) {
    for (const q of o.places ?? []) {
      const tx = q.xr - textW - foldW;
      const ty = q.yc + (ASC - DESC) * 0.5 * size;
      const box = textBox(tx, ty, textW + foldW, size);
      if (ok(box, soft)) {
        at = { tx, ty, box, side: 'l' };
        break;
      }
    }
    if (at) break;
    for (const sd of sides) {
      const c = spot(sd, x, y, r, textW + (sd === 'r' ? sigW : 0) + foldW, size, king);
      if (ok(c.box, soft)) {
        at = { ...c, side: sd };
        break;
      }
    }
    if (!at && o.leader)
      for (const [dx, dy] of leaders) {
        const c = leaderSpot(dx, dy, x, y, textW + foldW, size);
        // длинная выноска (wide) не пересекает чужие подписи: по ней читалось бы, чья это подпись
        if (ok(c.box, soft) && (Math.abs(dx) <= 40 && Math.abs(dy) <= 34 ? true : segmentClear(p.placer, x, y, c.ax, c.ay, r + 2))) {
          at = { ...c, side: 'x' };
          break;
        }
      }
    if (at) break;
  }
  if (!at) return null;
  const { tx, ty } = at;
  const knock = knockTrail(v, p, i, at, r);
  if (knock) v.fillGround(knock.x, knock.x + knock.w, knock.y, knock.h);
  ctx.globalAlpha = o.alpha;
  if (at.side === 'x') {
    // выноска: от края звезды к углу подписи
    const d = Math.hypot(at.ax! - x, at.ay! - y) || 1;
    ctx.strokeStyle = alpha(pal.ink2, 0.8);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + ((at.ax! - x) / d) * (r + 2), y + ((at.ay! - y) / d) * (r + 2));
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
  p.placer.add(at.box);
  // длинная выноска занимает свой путь: следующие подписи её не перекрывают
  if (at.side === 'x' && Math.hypot(at.ax! - x, at.ay! - y) > 52) {
    const d = Math.hypot(at.ax! - x, at.ay! - y);
    for (let t = r + 2; t < d; t += 4) p.placer.add({ x: x + ((at.ax! - x) * t) / d - 1, y: y + ((at.ay! - y) * t) / d - 1, w: 2, h: 2 });
  }
  v.ledger.add('star', q.name, at.box, q.id);
  p.labeled.add(i);
  if (note && p.shown) p.shown.noted.push(`${q.name}#${note}`);
  return { box: at.box, tx, ty, side: at.side, fold };
}

/** Ближайшая семья лица: родители, супруги, дети, братья и сёстры (E1; MAP-21, UX-33). */
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
    if (n.ghost || !v.drawn(i) || p.starAlpha(i) <= 0.5) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(n.lane);
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
  const fold = desc ?? p.revealText?.get(q.id);
  const color = epochalAt(v, i) && o.color === v.pal.ink && o.alpha < 1 ? v.pal.ink2 : o.color;
  const note = o.note ?? (p.namesakes?.get(q.id) || undefined);
  const at = labelStar(v, p, i, { ...o, color, ...(note ? { note } : {}), ...(fold ? { fold } : {}) });
  if (at?.fold && p.foldHits) p.foldHits.push({ ...at.fold, kind: desc ? 'desc' : 'reveal', id: q.id });
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

  // 1) обязательные: у правого края — слева от звезды; выбранное — первым и без проверки
  let first = true;
  for (const id of new Set([s.selected, s.second, s.hovered, s.focus])) {
    const i = idx(id);
    if (!shown(i)) continue;
    putLabel(v, p, i, { sides: ['r', 'l', 't', 'b'], color: pal.ink, alpha: 1, sigla: true, leader: true, overStars: true, force: first });
    first = false;
  }
  // Иисус Христос — к Нему сходятся ленты: подписан на любом масштабе, где видна звезда (MOB-53). Сначала — место, где
  // имя не закрывает ни одной звезды, в том числе с выноской подальше: на обзоре телефона слева от звезды — гуща царей
  // Иудеи, имя поверх неё прятало бы их звёзды и перехватывало касание. Нет такого места — слева или с выноской поверх
  // тусклых звёзд
  const ij = idx(MESSIAH);
  if (shown(ij)) {
    const o = { sides: ['r', 'l', 't', 'b'] as Side[], color: pal.ink, alpha: dimOf(ij).alpha, sigla: true, leader: true };
    // места имён звёзд величины 0–1 справа от них: имя Христа и его выноска их не занимают (Давид, Авраам на обзоре)
    const avoid: Rect[] = [];
    for (const i of p.vis) {
      const q = byId.get(v.nodes[i].person)!;
      if (i === ij || q.magnitude > 1 || !shown(i) || !(cache.nameW[i] > 0)) continue;
      const x = cam.sx(v.X0[i]);
      const y = cam.sy(v.nodes[i].lane);
      if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
      avoid.push(spot('r', x, y, starRadius(q.magnitude, p.zoomScale), cache.nameW[i], nameSize(q.magnitude, v.coarse)).box);
    }
    // на обзоре — первым и слева от звезды, на уровне лент: над ними, затем под ними (MAP-81); соседи уступают место
    const jx = cam.sx(v.X0[ij]);
    const jy = cam.sy(v.nodes[ij].lane);
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
      if (!putLabel(v, p, ij, { ...o, far: true, wide: true, least: true, avoid })) putLabel(v, p, ij, { ...o, overStars: true });
  }
  // свёрнутые потомки: «+N» у подписи лица — обязательная подпись (MAP-63, UX-60)
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
    putLabel(v, p, i, { sides: SIDES, color: pal.ink, alpha: 1, note: q.disambig ? `, ${q.disambig}` : undefined, leader: true, overStars: true });
  }
  if (hl)
    for (const [id, k] of hl) {
      if (k !== 'path') continue;
      const i = idx(id);
      if (!shown(i) || (lineOnly && !p.spine.has(id))) continue;
      putLabel(v, p, i, { sides: SIDES, color: pal.ink, alpha: 1, sigla: true, leader: true, overStars: true });
    }
  if (s.selected && !s.pins.size)
    for (const id of familyOf(s.selected)) {
      const i = idx(id);
      if (!shown(i) || (lineOnly && !p.spine.has(id))) continue;
      putLabel(v, p, i, { sides: SIDES, color: pal.ink, alpha: 1, sigla: true, leader: true, overStars: true });
    }
  // рабочий набор (J4): в режиме «В работе» подписаны все лица набора — по степени интереса, с выноской, если у звезды тесно;
  // погашенные выделением — не ниже 70 % (MAP-64) и 4,5 : 1 (решение 31)
  if (p.work) {
    const all = p.vis.filter((i) => !v.nodes[i].ghost && !p.labeled.has(i) && v.drawn(i)).sort((a, b) => cache.rank[a] - cache.rank[b]);
    for (const i of all) {
      const q = byId.get(v.nodes[i].person)!;
      const d = dimOf(i);
      putLabel(v, p, i, { sides: SIDES, color: q.magnitude <= 2 ? pal.ink : pal.ink2, alpha: d.alpha, light: d.light, sigla: true, leader: true, far: true, overStars: true });
    }
  }
  // 3) обычные — по порогам (на масштабе семьи — все); старшие подписи они не перекрывают. Звёзды величины 0–1 —
  // раньше меридианов событий, скоплений и названий созвездий, остальные — после
  const family = cam.ky >= FAMILY_KY;
  const lv = Math.max(0, Math.min(LEVELS - 1, Math.floor(p.level)));
  const cand: number[] = [];
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.ghost || p.labeled.has(i)) continue;
    if (lineOnly && !p.spine.has(n.person)) continue;
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
    if (putLabel(v, p, i, { sides, color, alpha: d.alpha * lit, light: d.light, sigla: true, leader })) now[i] = 1;
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
      const y = cam.sy(n.lane);
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

  // замер: сколько видимых звёзд подписано (E1)
  let stars = 0;
  let named = 0;
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.ghost || !v.drawn(i) || p.starAlpha(i) <= 0.5) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(n.lane);
    if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
    if (hits({ x: x - 1, y: y - 1, w: 2, h: 2 }, p.reserve)) continue;
    stars++;
    if (p.labeled.has(i)) named++;
    else if (p.work) v.ledger.unnamed.push(n.person);
  }
  v.ledger.stars = stars;
  v.ledger.named = named;
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
    const y = cam.sy(n.lane);
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
    const y = Math.round(cam.sy(n.lane)) + 0.5;
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
/** Название созвездия на средней линии области может лечь на звёзды 4–6-й величины (точки), но не ярче. */
export const GROUP_COVER_FROM = 4;
/** Видимая область созвездия, у которой название обязательно (MAP-58): не меньше стольких px. */
export const GROUP_AREA_MIN: [number, number] = [150, 60];

/** Название созвездия прописными с разрядкой (единственное место, где прописные допустимы, — ТЗ § 5.6). */
export const groupName = (group: string) => (groupById.get(group)?.name ?? group).toUpperCase();

/** Название созвездия повторяется не чаще, чем через столько px (ТЗ § 3.1: «через каждые ~1 200 px»). */
export const GROUP_REPEAT_PX = 1200;
/**
 * Названия созвездий — прописными с разрядкой, в пустом месте внутри контура (E8; MAP-08, 41, 58): середина места, если
 * название там помещается целиком, и не ложится на подписи, звёзды, органы неба, следы и стволы скоб; место уходит за
 * левый край — название «прилипает» к левому полю. Повторяется через ~1 200 px; нет места — не рисуется. Возвращает их
 * прямоугольники.
 */
export function drawGroupNames(v: SkyContext, p: Pass, spots: GroupNameSpot[]): (Rect & { group: string })[] {
  const { ctx, pal } = v;
  const hl = p.s.highlight;
  const fs = mapSize(T_MAP_S, v.coarse);
  // у каждого прямоугольника — созвездие: по названию открывается меню «Свернуть созвездие» (J5; src/ui/sky/input.ts)
  const boxes: (Rect & { group: string })[] = [];
  const done = new Set<string>();
  /** x начала названий созвездия в этом кадре: следующее — не ближе GROUP_REPEAT_PX (ТЗ § 3.1) */
  const placed = new Map<string, number[]>();
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  ctx.letterSpacing = '0.22em';
  ctx.textBaseline = 'alphabetic';
  // при выделении названия гаснут не ниже 0,75 и не ниже 4,5 : 1 к самому светлому фону (E12; MOB-41; решение 31)
  ctx.fillStyle = alpha(pal.ink3, hl ? Math.max(CONSTELLATION_DIM, pal.dimInk3) : 0.95);
  const L = v.letterW + 8;
  const R = v.cam.w - 8;
  // на обзоре следов нет (облака): название может выходить за пустое место — по средней линии области, лишь бы
  // не ложилось на звёзды, подписи и органы неба
  const low = p.detail < 0.5;
  const at = (xc: number, yc: number, tw: number) => {
    const x = Math.max(L, Math.min(R - tw, xc - tw / 2));
    const y = yc + (ASC - DESC) * 0.5 * fs;
    return { x, y, box: { x: x - 2, y: y - ASC * fs - 2, w: tw + 4, h: (ASC + DESC) * fs + 4 } };
  };
  for (const o of [...spots].sort((a, b) => b.size - a.size)) {
    const name = groupName(o.group);
    const tw = ctx.measureText(name).width;
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
      const got = claim(v, p, [c.box], 'group', name, knock ? { coverFrom: cover } : {});
      if (!got) return false;
      if (knock) {
        // следы и стволы скоб под названием гасятся цветом фона; тусклые звёзды возвращаются поверх, и название пишется
        // с ореолом — звезда видна между буквами
        v.fillGround(got.x, got.x + got.w, got.y, got.h);
        v.restars(p, got);
        ctx.strokeStyle = pal.halo;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(name, c.x, c.y);
      }
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
      const hh = (ASC + DESC) * fs + 6;
      /**
       * Места по средней линии области: название целиком внутри контура (inner — по трём вертикалям: у краёв и
       * в середине названия) или, если так не нашлось, только его середина (область узка или изрезана).
       */
      const scan = (whole: boolean, cover = GROUP_COVER_FROM) => {
        const stepX = Math.max(24, (vx1 - vx0 - (whole ? tw : 0)) / 24);
        const rest: (ReturnType<typeof at> & { lines: number })[] = [];
        const x0 = whole ? vx0 + tw / 2 + 4 : vx0 + 8;
        const x1 = whole ? vx1 - tw / 2 - 4 : vx1 - 8;
        for (let xc = x0; xc <= x1; xc += stepX) {
          if (!far(at(xc, 0, tw).x)) continue;
          const spans = whole ? spanAnd(spanAnd(ringSpans(o.poly!, xc - tw / 2), ringSpans(o.poly!, xc)), ringSpans(o.poly!, xc + tw / 2)) : ringSpans(o.poly!, xc);
          const inner = spans.map(([a, b]) => [Math.max(a, v.openTop), Math.min(b, v.cam.vp.b)] as [number, number]).filter(([a, b]) => b - a >= hh);
          for (const [a, b] of inner)
            for (let yc = a + hh / 2; yc <= b - hh / 2; yc += 6) {
              const c = at(xc, yc, tw);
              // подписи и звёзды ярче 4-й величины под названием недопустимы — такие места сразу отбрасываются
              if (p.placer.clash(c.box, true, cover)) continue;
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
      if (big && vx1 - vx0 >= tw + 8) scan(true);
      if (big && xs.length === 0) scan(false);
      // и последним — поверх звёзд 3-й величины: они возвращаются поверх заливки, название пишется с ореолом
      if (big && xs.length === 0) scan(false, GROUP_COVER_FROM - 1);
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
