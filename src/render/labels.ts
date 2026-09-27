/**
 * Подписи неба (ТЗ § 3.1, «подписи без наложений»; § 8.5): пороги масштаба, отбор, размещение и рисование подписей звёзд,
 * названия созвездий, проверка резерва и наложений и замер наложений в кадре.
 *
 * Пороги (LabelCache) считаются один раз на размер и масштаб «всего неба»: для каждой подписи — уровень масштаба,
 * начиная с которого она помещается на всех более крупных уровнях. В кадре подписи только отбираются по порогу.
 *
 * Замер (LabelLedger, measureLabels): каждая нарисованная в кадре подпись оставляет прямоугольник — тот же, что
 * проверяет размещение (текст с полем 2 px). Число пересекающихся пар — «наложения». Небо отдаёт замер в атрибут
 * `.sky[data-labels="N/M"]`: N — нарисовано подписей, M — наложений (для проверок этапа 4).
 */
import { KX_MIN } from './camera.ts';
import { starRadius, roleSigla } from './glyphs.ts';
import { alpha } from './color.ts';
import { CONSTELLATION_DIM, DIM, likelyAlpha } from './dim.ts';
import { FRAME_H } from './frame.ts';
import { mapFont, mapSize, nameFont, nameSize, siglaFont, T_MAP_S, T_UI_S } from './type.ts';
import { byId, groupById } from '../data/atlas.ts';
import { cross, hits, type Rect } from './rect.ts';
import type { Pass, SkyContext } from './sky.ts';

/** Сколько самых значимых живых подписать сверх обычных порогов, когда стоит меридиан (D13; IX-34). */
const MERIDIAN_EXTRA = 8;

// ---------- пороги подписей ----------

/** Кэш подписей: пороги масштаба и замеренные ширины имён и сокращений ролей по узлам неба. */
export class LabelCache {
  /** уровень масштаба 2·log2(kx / KX_MIN), с которого подписан узел; Infinity — не подписывается по порогу */
  level = new Float64Array(0);
  /** ширина имени (кегль по величине) — замеряется один раз, а не в каждом кадре */
  nameW = new Float64Array(0);
  /** ширина сокращения роли с отступом; −1 — ещё не замерена */
  siglaW = new Float64Array(0);
  private key = '';

  /** Сбросить пороги: сменился размер холста. */
  invalidate() {
    this.key = '';
  }

  /** Пороги для текущей модели, масштаба времени, высоты холста и масштаба «всего неба». */
  ensure(v: SkyContext) {
    const f = v.cam.fitK;
    const key = `${v.model.id}|${Math.round(v.lambda * 4)}|${v.cam.h}|${v.coarse}|${f ? `${f.kx.toPrecision(3)} ${f.ky.toPrecision(3)}` : ''}`;
    if (key === this.key) return;
    this.key = key;
    const nodes = v.nodes;
    const n = nodes.length;
    this.level = new Float64Array(n).fill(Infinity);
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
        return pa.magnitude - pb.magnitude || Number(nodes[b].spine) - Number(nodes[a].spine) || pb.prominence - pa.prominence;
      });
    const LEVELS = 26;
    const grids: Map<string, number[][]>[] = Array.from({ length: LEVELS }, () => new Map());
    const boxes: number[][] = [];
    const cell = 96;
    for (const i of order) {
      const p = byId.get(nodes[i].person)!;
      const size = nameSize(p.magnitude, v.coarse);
      let found = Infinity;
      const boxAt = (lv: number) => {
        const kx = KX_MIN * Math.pow(2, lv / 2);
        const ky = v.cam.kyFor(kx);
        const r = starRadius(p.magnitude, Math.max(0.7, Math.min(1.2, ky / 18)));
        const x = v.X0[i] * kx + r + 3;
        const y = -nodes[i].lane * ky - 3;
        return [x - 1, y - size, x + widths[i] + 1, y + 2];
      };
      const fits = (lv: number) => {
        const b = boxAt(lv);
        const g = grids[lv];
        const cx0 = Math.floor(b[0] / cell);
        const cx1 = Math.floor(b[2] / cell);
        const cy0 = Math.floor(b[1] / cell);
        const cy1 = Math.floor(b[3] / cell);
        for (let cx = cx0; cx <= cx1; cx++)
          for (let cy = cy0; cy <= cy1; cy++) {
            for (const o of g.get(`${cx},${cy}`) ?? []) if (b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3]) return false;
          }
        return true;
      };
      // минимальный уровень, начиная с которого подпись помещается на всех более крупных уровнях
      for (let lv = LEVELS - 1; lv >= 0; lv--) {
        if (fits(lv)) found = lv;
        else break;
      }
      if (found === Infinity) continue;
      // зоны «пустоты» у очень мелких звёзд на обзоре не подписываем
      const minLv = [0, 2, 5, 8, 10, 12, 13][Math.max(0, Math.min(6, p.magnitude))];
      found = Math.max(found, minLv);
      this.level[i] = found;
      for (let lv = found; lv < LEVELS; lv++) {
        const b = boxAt(lv);
        boxes.push(b);
        const g = grids[lv];
        for (let cx = Math.floor(b[0] / cell); cx <= Math.floor(b[2] / cell); cx++)
          for (let cy = Math.floor(b[1] / cell); cy <= Math.floor(b[3] / cell); cy++) {
            const k = `${cx},${cy}`;
            const a = g.get(k);
            if (a) a.push(b);
            else g.set(k, [b]);
          }
      }
    }
  }
}

// ---------- замер наложений ----------

/** Что за подпись: имя звезды, название созвездия, пояснение на пустом небе, указатель у края. */
export type LabelKind = 'star' | 'group' | 'note' | 'edge';

/** Нарисованная подпись: прямоугольник в px холста, текст и лицо (у имени звезды и указателя). */
export interface LabelBox extends Rect {
  kind: LabelKind;
  text: string;
  id?: string;
}

/** Подписи, нарисованные в последнем кадре (по порядку рисования). */
export class LabelLedger {
  boxes: LabelBox[] = [];
  reset() {
    this.boxes = [];
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

// ---------- названия созвездий ----------

/** Блок созвездия, у которого стоит название рода: его прямоугольник на экране (px холста) и число лиц. */
export interface GroupNameSpot {
  group: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  size: number;
}

/**
 * Названия созвездий — прописными с разрядкой, «прилипают» к левому краю видимой части. Названия не ложатся друг
 * на друга: при столкновении остаётся название более крупного рода. Возвращает их прямоугольники: подписи отметок,
 * пути и меридиана на них не ложатся.
 */
export function drawGroupNames(v: SkyContext, p: Pass, spots: GroupNameSpot[]): Rect[] {
  const { ctx, pal } = v;
  const hl = p.s.highlight;
  const reserve = p.reserve;
  const names: { name: string; x: number; y: number; w: number; size: number }[] = [];
  for (const o of spots) {
    const name = (groupById.get(o.group)?.name ?? o.group).toUpperCase();
    ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
    ctx.letterSpacing = '0.22em';
    const tw = ctx.measureText(name).width;
    ctx.letterSpacing = '0px';
    const y = Math.max(o.minY + 14, Math.min(o.maxY - 6, FRAME_H + 14));
    const x = Math.max(o.minX + 10, v.letterW + 12);
    if (x + tw < o.maxX - 6) names.push({ name, x, y, w: tw, size: o.size });
  }
  const fs = mapSize(T_MAP_S, v.coarse);
  const placed: { x: number; y: number; w: number }[] = [];
  const boxes: Rect[] = [];
  ctx.setLineDash([]);
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  ctx.letterSpacing = '0.22em';
  // при выделении названия гаснут не ниже 0,75: остаются читаемыми (E12; MOB-41)
  ctx.fillStyle = alpha(pal.ink3, hl ? CONSTELLATION_DIM : 0.95);
  for (const c of names.sort((a, b) => b.size - a.size)) {
    if (placed.some((q) => c.x < q.x + q.w + 8 && q.x < c.x + c.w + 8 && Math.abs(c.y - q.y) < fs + 3)) continue;
    // под органами неба и вступлением названия не рисуются (C6)
    if (hits({ x: c.x, y: c.y - fs, w: c.w, h: fs + 4 }, reserve)) continue;
    placed.push(c);
    const box = { x: c.x - 2, y: c.y - fs, w: c.w + 4, h: fs + 4 };
    boxes.push(box);
    v.ledger.add('group', c.name, box);
    ctx.fillText(c.name, c.x, c.y);
  }
  ctx.letterSpacing = '0px';
  return boxes;
}

// ---------- подписи звёзд ----------

type Side = 'r' | 'l' | 't' | 'b';

/** Место подписи шириной w с кеглем size у звезды (x, y) радиуса r: справа, слева, сверху, снизу. */
export function spot(side: Side, x: number, y: number, r: number, w: number, size: number) {
  const tx = side === 'r' ? x + r + 3 : side === 'l' ? x - r - 3 - w : x - w / 2;
  const ty = side === 't' ? y - r - 5 : side === 'b' ? y + r + size + 1 : y - 3;
  return { tx, ty, box: { x: tx - 2, y: ty - size, w: w + 4, h: size + 5 } };
}

/**
 * Подписи звёзд — группами по старшинству; каждая следующая группа не ложится на уже нарисованные (D13, E10; MAP-07):
 *  1) выбранное, второе, наведённое и лицо с фокусом — всегда;
 *  2) отметки поиска — с уточнением, в одном из четырёх положений; путь родства и супруги выбранного;
 *  3) обычные — по заранее вычисленным порогам масштаба;
 *  4) на меридиане — до восьми самых значимых живых сверх порогов.
 * Погашенные выделением подписи держат контраст к небу не ниже 3 : 1 (E12; MOB-41).
 */
export function drawLabels(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  const s = p.s;
  const W = cam.w;
  const ky = cam.ky;
  const hl = s.highlight;
  const reserve = p.reserve;
  const intro = s.intro;
  const lineOnly = s.onlyLines;
  const cache = v.labelCache;
  cache.ensure(v);
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const taken: Rect[] = [];
  const done = new Set<number>();
  const top = v.openTop;
  const bottom = cam.vp.b;
  const clash = (b: Rect, upTo = taken.length) => {
    for (let k = 0; k < upTo; k++) if (cross(b, taken[k])) return true;
    return false;
  };
  const inside = (b: Rect) => b.x > v.letterW + 2 && b.x + b.w < W - 4 && b.y >= top && b.y + b.h <= bottom + 4;
  /**
   * Нарисовать подпись звезды i. sides — положения по порядку предпочтения; check — не ложиться на нарисованные
   * (checkUpTo — только на первые checkUpTo); note — уточнение курсивом после имени (отметки поиска).
   */
  const label = (
    i: number,
    o: { sides: Side[]; check: boolean; checkUpTo?: number; color: string; alpha: number; note?: string; sigla?: boolean },
  ): boolean => {
    const n = v.nodes[i];
    const q = byId.get(n.person)!;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(n.lane);
    // звезда за краем окна не подписывается: для выбранных есть указатели у края (MOB-01)
    if (x < v.letterW || x > W) return false;
    const r = starRadius(q.magnitude, p.zoomScale);
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
    const sig = o.sigla && ky >= 18 && q.roles.length ? roleSigla(q.roles) : '';
    let sigW = 0;
    if (sig) {
      if (!(cache.siglaW[i] >= 0)) {
        ctx.font = siglaFont(q.magnitude, v.coarse);
        cache.siglaW[i] = ctx.measureText(sig).width + 4;
      }
      sigW = cache.siglaW[i];
    }
    let at: ReturnType<typeof spot> | null = null;
    let side: Side = 'r';
    for (const sd of o.sides) {
      const c = spot(sd, x, y, r, nameW + noteW + (sd === 'r' ? sigW : 0), size);
      // под органами неба, колонкой кнопок и вступлением подписи не рисуются (C6)
      if (!inside(c.box) || hits(c.box, reserve)) continue;
      if (o.check && clash(c.box, o.checkUpTo)) continue;
      // отметки, путь и меридиан не ложатся и на названия созвездий
      if (o.check && o.checkUpTo === undefined && hits(c.box, p.nameBoxes)) continue;
      at = c;
      side = sd;
      break;
    }
    if (!at) return false;
    const { tx, ty } = at;
    ctx.globalAlpha = o.alpha;
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
    if (sig && side === 'r') {
      ctx.font = siglaFont(q.magnitude, v.coarse);
      ctx.strokeText(sig, tx + nameW + noteW + 4, ty);
      ctx.fillStyle = pal.ink3;
      ctx.fillText(sig, tx + nameW + noteW + 4, ty);
    }
    ctx.globalAlpha = 1;
    taken.push(at.box);
    v.ledger.add('star', q.name, at.box, q.id);
    done.add(i);
    return true;
  };
  const idx = (id: string | null) => (id ? v.indexOf(id) : undefined);
  const shown = (i: number | undefined): i is number => i !== undefined && !v.nodes[i].ghost && v.drawn(i);

  // 1) обязательные: у правого края — слева от звезды
  for (const id of new Set([s.selected, s.second, s.hovered, s.focus])) {
    const i = idx(id);
    if (!shown(i)) continue;
    label(i, { sides: ['r', 'l'], check: false, color: pal.ink, alpha: 1, sigla: true });
  }
  // 2) отметки поиска — с уточнением (E10); путь родства и супруги выбранного
  for (const id of s.pins) {
    const i = idx(id);
    if (!shown(i) || done.has(i)) continue;
    const q = byId.get(id)!;
    label(i, { sides: ['r', 'l', 'b', 't'], check: true, color: pal.ink, alpha: 1, note: q.disambig || undefined });
  }
  if (hl)
    for (const [id, k] of hl) {
      if (k !== 'path') continue;
      const i = idx(id);
      if (!shown(i) || done.has(i)) continue;
      if (lineOnly && !p.spine.has(id)) continue;
      label(i, { sides: ['r', 'l'], check: true, color: pal.ink, alpha: 1, sigla: true });
    }
  // 3) обычные — по порогам; старшие подписи (группы 1–2) они не перекрывают
  const priority = taken.length;
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.ghost || done.has(i)) continue;
    if (!(p.level >= cache.level[i])) continue;
    const q = byId.get(n.person)!;
    if (lineOnly && !p.spine.has(q.id)) continue;
    const lit = Math.max(0, Math.min(1, intro * 7 - q.magnitude - 0.5));
    if (lit <= 0) continue;
    const bright = q.magnitude <= 2;
    const color = bright ? pal.ink : pal.ink2;
    const k = hl ? hl.get(q.id) : 'self';
    // погашенная подпись — не прозрачнее, чем нужно для контраста 3 : 1
    const floor = bright ? pal.dimInk : pal.dimInk2;
    const a = k === undefined ? Math.max(DIM, floor) : k === 'likely' ? likelyAlpha(floor) : 1;
    label(i, { sides: ['r', 'l'], check: priority > 0, checkUpTo: priority, color, alpha: a * lit, sigla: true });
  }
  // 4) меридиан: самые значимые из живых, кому не хватило порога, — если есть место (IX-34)
  if (s.meridian !== null && hl) {
    const cand: number[] = [];
    for (const i of p.vis) {
      const n = v.nodes[i];
      if (n.ghost || done.has(i)) continue;
      const k = hl.get(n.person);
      if (k !== 'sure' && k !== 'likely') continue;
      const y = cam.sy(n.lane);
      if (y < top || y > bottom) continue;
      cand.push(i);
    }
    const rank = (i: number) => {
      const q = byId.get(v.nodes[i].person)!;
      return q.magnitude * 100 - q.prominence - (hl.get(q.id) === 'sure' ? 50 : 0);
    };
    cand.sort((a, b) => rank(a) - rank(b));
    let added = 0;
    for (const i of cand) {
      if (added >= MERIDIAN_EXTRA) break;
      const q = byId.get(v.nodes[i].person)!;
      const likely = hl.get(q.id) === 'likely';
      if (label(i, { sides: ['r', 'l', 't', 'b'], check: true, color: pal.ink, alpha: likely ? likelyAlpha(pal.dimInk) : 1 })) added++;
    }
  }
}
