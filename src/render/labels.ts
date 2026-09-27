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
import { CONSTELLATION_DIM, DIM, likelyAlpha } from './dim.ts';
import { mapFont, mapSize, nameFont, nameSize, siglaFont, T_MAP_S, T_NOTE, T_UI_S } from './type.ts';
import { byId, graph, groupById, lines } from '../data/atlas.ts';
import { primaryChildren, siblings } from '../engine/graph.ts';
import { refText } from '../engine/kinship.ts';
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
    const key = `${v.model.id}|${Math.round(v.lambda * 4)}|${v.cam.h}|${v.coarse}|${f ? `${f.kx.toPrecision(3)} ${f.ky.toPrecision(3)}` : ''}|${v.rowsKey}`;
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
    for (let i = 0; i < n; i++) {
      const p = byId.get(nodes[i].person)!;
      if (nodes[i].ghost) continue;
      ctx.font = nameFont(p.magnitude, v.coarse);
      widths[i] = ctx.measureText(p.name).width;
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
        const b = spot(sd, v.X0[i] * kx, -v.rowOf(nodes[i].lane) * ky, r, widths[i], size, king).box;
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
 * события (E7), «липкое» имя следа у левого края (E1), надписи рамки (линейка, служебная строка, кромки).
 */
export type LabelKind = 'star' | 'group' | 'note' | 'edge' | 'cluster' | 'event' | 'sticky' | 'frame' | 'fold';

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
export function claim(v: SkyContext, p: Pass, candidates: Rect[], kind: LabelKind, text: string, o: { id?: string; soft?: boolean } = {}): Rect | null {
  // названия, скопления и пояснения не ложатся на ленты линий Мессии: ленты — главное на небе
  const avoid = kind === 'group' || kind === 'cluster' || kind === 'note' || kind === 'event' ? p.ribbonBoxes : undefined;
  for (const b of candidates) {
    if (!insideSky(v, b) || hits(b, p.reserve) || hits(b, avoid) || p.placer.clash(b, o.soft ?? true)) continue;
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
  /** уточнение курсивом после имени (отметки поиска) */
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

/**
 * Подписать звезду узла i: первое свободное из положений sides, затем — выноска. Рисует имя с ореолом цвета неба,
 * уточнение и сокращение роли; занимает место, пишет замер и отмечает узел подписанным (p.labeled). Для подписей лиц
 * из других слоёв (лица линий, путь родства) — та же функция.
 */
export function labelStar(v: SkyContext, p: Pass, i: number, o: StarOpts): boolean {
  if (p.labeled.has(i)) return true;
  const { ctx, cam, pal } = v;
  const n = v.nodes[i];
  const q = byId.get(n.person)!;
  const x = cam.sx(v.X0[i]);
  const y = cam.sy(n.lane);
  // звезда за краем окна не подписывается: для выбранных есть указатели у края (MOB-01)
  if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) return false;
  const cache = v.labelCache;
  const r = starRadius(q.magnitude, p.zoomScale);
  const king = q.roles.includes('king') || q.roles.includes('queen');
  const nf = nameFont(q.magnitude, v.coarse);
  let nameW = cache.nameW[i];
  if (!(nameW > 0)) {
    ctx.font = nf;
    nameW = ctx.measureText(q.name).width;
  }
  const size = nameSize(q.magnitude, v.coarse);
  const note = o.note ? `, ${o.note}` : '';
  const noteFont = mapFont(T_UI_S, { italic: true, coarse: v.coarse });
  let noteW = 0;
  if (note) {
    ctx.font = noteFont;
    noteW = ctx.measureText(note).width;
  }
  const sig = o.sigla && cam.ky >= 18 && q.roles.length ? roleSigla(q.roles) : '';
  let sigW = 0;
  if (sig) {
    if (!(cache.siglaW[i] >= 0)) {
      ctx.font = siglaFont(q.magnitude, v.coarse);
      cache.siglaW[i] = ctx.measureText(sig).width + 4;
    }
    sigW = cache.siglaW[i];
  }
  // на обзоре и в масштабе эпохи имя может закрыть звезду на две величины тусклее; на масштабе семьи — ни одной
  const coverFrom = cam.ky < FAMILY_KY ? q.magnitude + 2 : 99;
  // проходы: не на звёздах и подписях → не на подписях → (выбранное лицо) где угодно в открытом небе
  type Mode = 'soft' | 'hard' | 'none';
  const ok = (b: Rect, m: Mode) => insideSky(v, b) && !hits(b, p.reserve) && (m === 'none' || !p.placer.clash(b, m === 'soft', coverFrom));
  let at: { tx: number; ty: number; box: Rect; ax?: number; ay?: number; side: Side | 'x' } | null = null;
  const passes: Mode[] = o.force ? ['soft', 'hard', 'none'] : o.overStars ? ['soft', 'hard'] : ['soft'];
  const vert = o.vertical ?? lineSideOf(q.id);
  const sides = vert === -1 ? o.sides.filter((x) => x !== 'b') : vert === 1 ? o.sides.filter((x) => x !== 't') : o.sides;
  const all = o.far ? [...LEADERS, ...FAR_LEADERS] : LEADERS;
  const leaders = vert ? all.filter(([, dy]) => Math.sign(dy) === vert || dy === 0) : all;
  for (const soft of passes) {
    for (const sd of sides) {
      const c = spot(sd, x, y, r, nameW + noteW + (sd === 'r' ? sigW : 0), size, king);
      if (ok(c.box, soft)) {
        at = { ...c, side: sd };
        break;
      }
    }
    if (!at && o.leader)
      for (const [dx, dy] of leaders) {
        const c = leaderSpot(dx, dy, x, y, nameW + noteW, size);
        if (ok(c.box, soft)) {
          at = { ...c, side: 'x' };
          break;
        }
      }
    if (at) break;
  }
  if (!at) return false;
  const { tx, ty } = at;
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
  ctx.strokeText(q.name, tx, ty);
  ctx.fillStyle = o.color;
  ctx.fillText(q.name, tx, ty);
  if (note) {
    ctx.font = noteFont;
    ctx.strokeText(note, tx + nameW, ty);
    ctx.fillStyle = pal.ink2;
    ctx.fillText(note, tx + nameW, ty);
  }
  if (sig && at.side === 'r') {
    ctx.font = siglaFont(q.magnitude, v.coarse);
    ctx.strokeText(sig, tx + nameW + noteW + 4, ty);
    ctx.fillStyle = pal.ink3;
    ctx.fillText(sig, tx + nameW + noteW + 4, ty);
  }
  ctx.globalAlpha = 1;
  p.placer.add(at.box);
  v.ledger.add('star', q.name, at.box, q.id);
  p.labeled.add(i);
  return true;
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

/**
 * Подписи звёзд — группами по старшинству; каждая следующая группа не ложится на уже занятое (D13, E1, E10; MAP-07):
 *  1) выбранное, второе, наведённое и лицо с фокусом;
 *  2) отметки поиска — с уточнением; путь родства и супруги выбранного; семья выбранного — родители, супруги, дети,
 *     братья и сёстры (E1; MAP-21);
 *  3) обычные — по заранее вычисленным порогам масштаба, на масштабе семьи — все, кому хватает места;
 *  4) «липкие» имена следов, уходящих за левый край (E1; MAP-10);
 *  5) на меридиане — до восьми самых значимых живых сверх порогов.
 * Между группами 2 и 3 размещаются меридианы событий, скопления и названия созвездий (sky.ts, labelLayer).
 * Погашенные выделением подписи держат контраст к небу не ниже 3 : 1 (E12; MOB-41).
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

  // 1) обязательные: у правого края — слева от звезды; выбранное — первым и без проверки
  let first = true;
  for (const id of new Set([s.selected, s.second, s.hovered, s.focus])) {
    const i = idx(id);
    if (!shown(i)) continue;
    labelStar(v, p, i, { sides: ['r', 'l', 't', 'b'], color: pal.ink, alpha: 1, sigla: true, leader: true, overStars: true, force: first });
    first = false;
  }
  // 2) отметки поиска — с уточнением (E10); путь родства и супруги выбранного; семья выбранного
  for (const id of s.pins) {
    const i = idx(id);
    if (!shown(i)) continue;
    const q = byId.get(id)!;
    labelStar(v, p, i, { sides: SIDES, color: pal.ink, alpha: 1, note: q.disambig || undefined, leader: true, overStars: true });
  }
  if (hl)
    for (const [id, k] of hl) {
      if (k !== 'path') continue;
      const i = idx(id);
      if (!shown(i) || (lineOnly && !p.spine.has(id))) continue;
      labelStar(v, p, i, { sides: SIDES, color: pal.ink, alpha: 1, sigla: true, leader: true, overStars: true });
    }
  if (s.selected && !s.pins.size)
    for (const id of familyOf(s.selected)) {
      const i = idx(id);
      if (!shown(i) || (lineOnly && !p.spine.has(id))) continue;
      labelStar(v, p, i, { sides: SIDES, color: pal.ink, alpha: 1, sigla: true, leader: true, overStars: true });
    }
  // рабочий набор (J4): в режиме «В работе» подписаны все лица набора — по степени интереса, с выноской, если у звезды тесно;
  // погашенные выделением — не прозрачнее, чем нужно для контраста 3 : 1
  if (p.work) {
    const all = p.vis.filter((i) => !v.nodes[i].ghost && !p.labeled.has(i) && v.drawn(i)).sort((a, b) => cache.rank[a] - cache.rank[b]);
    for (const i of all) {
      const q = byId.get(v.nodes[i].person)!;
      const k = hl ? hl.get(q.id) : 'self';
      const a = k === undefined ? Math.max(DIM, q.magnitude <= 2 ? pal.dimInk : pal.dimInk2) : 1;
      labelStar(v, p, i, { sides: SIDES, color: q.magnitude <= 2 ? pal.ink : pal.ink2, alpha: a, sigla: true, leader: true, far: true, overStars: true });
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
    if (!family && !(p.level >= need)) continue;
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
    const color = bright ? pal.ink : pal.ink2;
    const k = hl ? hl.get(q.id) : 'self';
    // погашенная подпись — не прозрачнее, чем нужно для контраста 3 : 1
    const floor = bright ? pal.dimInk : pal.dimInk2;
    const a = k === undefined ? Math.max(DIM, floor) : k === 'likely' ? likelyAlpha(floor) : 1;
    const pref = cache.level[i] <= p.level ? SIDES[cache.side[i * LEVELS + lv]] : 'r';
    const sides: Side[] = [pref, ...SIDES.filter((x) => x !== pref)];
    const leader = family || q.magnitude <= 1 || p.spine.has(q.id);
    if (labelStar(v, p, i, { sides, color, alpha: a * lit, sigla: true, leader })) now[i] = 1;
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
      if (labelStar(v, p, i, { sides: SIDES, color: pal.ink, alpha: likely ? likelyAlpha(pal.dimInk) : 1 })) added++;
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
}

/** Название созвездия прописными с разрядкой (единственное место, где прописные допустимы, — ТЗ § 5.6). */
export const groupName = (group: string) => (groupById.get(group)?.name ?? group).toUpperCase();

/**
 * Названия созвездий — прописными с разрядкой, в пустом месте внутри контура (E8; MAP-08, 41): середина места, если
 * название там помещается целиком, и не ложится на подписи, звёзды, органы неба; нет места — не рисуется. Каждое
 * созвездие — один раз на экран. Возвращает их прямоугольники.
 */
export function drawGroupNames(v: SkyContext, p: Pass, spots: GroupNameSpot[]): (Rect & { group: string })[] {
  const { ctx, pal } = v;
  const hl = p.s.highlight;
  const fs = mapSize(T_MAP_S, v.coarse);
  // у каждого прямоугольника — созвездие: по названию открывается меню «Свернуть созвездие» (J5; src/ui/sky/input.ts)
  const boxes: (Rect & { group: string })[] = [];
  const done = new Set<string>();
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  ctx.letterSpacing = '0.22em';
  ctx.textBaseline = 'alphabetic';
  // при выделении названия гаснут не ниже 0,75: остаются читаемыми (E12; MOB-41)
  ctx.fillStyle = alpha(pal.ink3, hl ? CONSTELLATION_DIM : 0.95);
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
    if (done.has(o.group)) continue;
    const name = groupName(o.group);
    const tw = ctx.measureText(name).width;
    const cands: ReturnType<typeof at>[] = [];
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
      if (sl.h + v.cam.ky >= fs + 4 && b - a >= tw + 16) cands.push(at((a + b) / 2, sl.yc, tw));
      else if (fitsLow && b > a) cands.push(at((a + b) / 2, sl.yc, tw));
    }
    // созвездие уходит за левый край: название — у левого поля, по середине области на краю
    for (const [y0, y1] of [...(o.edge ?? [])].sort((a, b) => b[1] - b[0] - (a[1] - a[0])))
      if (y1 - y0 >= fs + 6) cands.push(at(L + 4 + tw / 2, (y0 + y1) / 2, tw));
    const got = claim(v, p, cands.map((c) => c.box), 'group', name);
    if (!got) continue;
    const c = cands.find((q) => q.box === got)!;
    ctx.fillText(name, c.x, c.y);
    boxes.push({ ...got, group: o.group });
    done.add(o.group);
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
