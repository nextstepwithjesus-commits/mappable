/**
 * Отметки на небе: выделение рода (яркость лиц), путь родства, кольца выбранного, второго лица, фокуса клавиатуры
 * и наведённой звезды, отметки одноимённых (E10), меридиан года с флажком (D13).
 *
 * Выделение (ТЗ § 3.1: «остальное небо гаснет до 25 %»; E4, E5; MAP-20, UX-34):
 *  — выбранное лицо, предки и потомки — полная яркость, после третьего поколения — 70 %;
 *  — братья и сёстры — своя степень (SIB);
 *  — путь родства — полная яркость; сам путь — ломаная с подписями шагов (drawKinPath);
 *  — группа лиц панели (главы, участок синопсиса) — полная яркость (skyGroup);
 *  — остальное небо — DIM (src/render/dim.ts).
 *
 * Этап 12: выбранная связь — жёлтым целиком, от звёзд родителей по их следам через ромб союза до ребёнка (решение 88;
 * selectedRoutes); дуги родства словами Писания и дуги к призраку жены у лица под указателем и у выбранного —
 * золотистым пунктиром (решение 89; goldArc, drawKinArcs).
 *
 * Ветви выбранного лица (решение 69): потомки по союзам или по детям (branchMapOf, с кэшем по лицу и модели) — цветом
 * своей ветви со свечением, бледнее с каждым поколением; предки — мягким свечением (branchFrame; цвета и свечение —
 * src/render/branches.ts, рисуют следы и отводы — src/render/trails.ts).
 */
import { alpha } from './color.ts';
import { DIM, LIKELY } from './dim.ts';
import { starRadius } from './glyphs.ts';
import { RULER_H, ROW_H } from './frame.ts';
import { mapFont, mapSize, T_MAP_S } from './type.ts';
import { byId, graph } from '../data/atlas.ts';
import { branchesOf, type Branch } from '../engine/unions.ts';
import { unions } from '../ui/reveal.ts';
import { branchColor, branchFade, branchFloor, KIN_GOLD, KIN_GOLD_UNDER, type MapTheme } from './branches.ts';
import { claim, putLabel, textBox } from './labels.ts';
import { beadAt, drawBranchLabels, drawKeyLineNames, drawLineNames, drawLineNotes, drawMt1Women } from './ribbons.ts';
import type { LineStep } from '../engine/layout.ts';
import type { Rect } from './rect.ts';
import type { KinStep } from '../engine/kinship.ts';
import type { Emphasis, Pass, SkyContext, SkyState } from './sky.ts';
import { linkShown, trailOf, type LifeTrail, type LinkDraw } from './trails.ts';
import { kidStyle, mainUnion, NODE_R_FAMILY, NODE_R_MAP, otherReading, routeOver, segmentsOf, TRUNK_LEAD, type LinkPath, type Seg } from './links.ts';
import { LINK_DASH } from './trails.ts';
import { linkKeyString, type LinkKey } from '../engine/linkkey.ts';
import { linkRoles } from '../ui/linkwords.ts';
import { GHOST_WORD, putLinkGhosts, type GhostWhy, type LinkGhost } from '../ui/linkstate.ts';
import { foldsHiding } from '../ui/work.ts';
import { LINK_YELLOW, nodeLook, paintUnion } from './plates.ts';

/** Братья и сёстры выбранного лица: ярче погашенного неба, бледнее рода по прямой (UX-34). */
export const SIB = 0.72;
/** Предки и потомки дальше третьего поколения (MAP-20). */
export const FAR = 0.7;
/** С какого поколения род гаснет до FAR. */
export const FAR_FROM = 4;

/**
 * Яркость лица при выделении: без выделения — 1; выбранное, род до третьего поколения, путь, группа и «наверняка»
 * живые — 1; дальние предки и потомки — FAR; братья и сёстры — SIB; «вероятно» живые — LIKELY; остальное — DIM.
 */
export function emphasis(hl: Map<string, Emphasis> | null, depth?: Map<string, number> | null): (id: string) => number {
  return (id: string) => {
    if (!hl) return 1;
    const k = hl.get(id);
    if (k === undefined) return DIM;
    if (k === 'likely') return LIKELY;
    if (k === 'sib') return SIB;
    if ((k === 'anc' || k === 'desc') && (depth?.get(id) ?? 0) >= FAR_FROM) return FAR;
    return 1;
  };
}

/** Выделение и число поколений от выбранного лица (у предков и потомков). */
export interface Highlight {
  hl: Map<string, Emphasis>;
  depth: Map<string, number> | null;
}

/**
 * Род выбранного лица (E4): предки и потомки по всем утверждениям о родителях, с числом поколений (в ширину: самое
 * короткое), братья и сёстры — дети его родителей по прямым связям (без пропуска поколений), супруги — 'path'.
 */
export function familyHighlight(id: string): Highlight {
  const hl = new Map<string, Emphasis>([[id, 'self']]);
  const depth = new Map<string, number>([[id, 0]]);
  const walk = (dir: 'up' | 'down') => {
    let front = [id];
    for (let gen = 1; front.length; gen++) {
      const next: string[] = [];
      for (const x of front) {
        const edges = dir === 'up' ? graph.parentsOf.get(x) : graph.childrenOf.get(x);
        for (const e of edges ?? []) {
          const y = dir === 'up' ? e.parent : e.child;
          if (hl.has(y)) continue;
          hl.set(y, dir === 'up' ? 'anc' : 'desc');
          depth.set(y, gen);
          next.push(y);
        }
      }
      front = next;
    }
  };
  walk('up');
  walk('down');
  const direct = (k: string) => k === 'father' || k === 'mother';
  for (const e of graph.parentsOf.get(id) ?? []) {
    if (!direct(e.kind) || e.gap) continue;
    for (const c of graph.childrenOf.get(e.parent) ?? []) if (direct(c.kind) && !c.gap && !hl.has(c.child)) hl.set(c.child, 'sib');
  }
  for (const s of graph.spousesOf.get(id) ?? []) {
    const o = s.a === id ? s.b : s.a;
    if (!hl.has(o)) hl.set(o, 'path');
  }
  return { hl, depth };
}

/**
 * Выделение неба по состоянию: группа панели (главы, участок синопсиса) — лица группы и выбранное; путь родства —
 * лица пути, концы и выбранное; иначе — род выбранного лица. Нет выбранного и группы — выделения нет.
 */
export function highlightFor(id: string | null, path: readonly string[] | null, group?: readonly string[] | null): Highlight | null {
  if (group?.length) {
    const m = new Map<string, Emphasis>(group.map((g) => [g, 'group']));
    if (id) m.set(id, 'self');
    return { hl: m, depth: null };
  }
  if (!id) return null;
  if (path && path.length) {
    const m = new Map<string, Emphasis>();
    for (const p of path) m.set(p, 'path');
    m.set(path[0], 'self');
    m.set(path[path.length - 1], 'self');
    m.set(id, 'self');
    return { hl: m, depth: null };
  }
  return familyHighlight(id);
}

// ---------- ветви выбранного лица (решение 69) ----------

/** Ветви потомков лица: ключи ветвей (союз или ребёнок), ветвь и поколение каждого потомка, дети каждой ветви. */
export interface BranchMap {
  id: string;
  /** ключи ветвей по порядку: id союза (союзов с детьми два и больше) или id ребёнка */
  keys: string[];
  /** потомок → ветвь, поколение (1 — дети), союз */
  desc: Map<string, Branch>;
  /** дети каждой ветви (первое поколение) по порядку данных: метка ветви — у первого, чья подпись на небе */
  heads: string[][];
}
/** Без предела поколений: цвет тянется по всей ветви вниз (у Адама — через всё небо). */
const ALL_GENERATIONS = 1000;
/** Сколько последних выбранных лиц помнит кэш ветвей. */
const BRANCH_CACHE = 16;
const branchCache = new Map<string, BranchMap>();

/**
 * Ветви потомков лица id (src/engine/unions.ts, branchesOf по союзам атласа src/ui/reveal.ts) — с кэшем по лицу и модели
 * хронологии: у Адама обход идёт почти через всё небо, а кадр при панорамировании рисуется десятки раз в секунду.
 */
export function branchMapOf(id: string, model = ''): BranchMap {
  const key = `${id}|${model}`;
  const hit = branchCache.get(key);
  if (hit) {
    branchCache.delete(key);
    branchCache.set(key, hit);
    return hit;
  }
  const { desc, keys } = branchesOf(unions, graph, id, ALL_GENERATIONS);
  const heads = keys.map(() => [] as string[]);
  for (const [k, b] of desc) if (b.gen === 1) heads[b.branch].push(k);
  const out: BranchMap = { id, keys, desc, heads };
  branchCache.set(key, out);
  if (branchCache.size > BRANCH_CACHE) branchCache.delete(branchCache.keys().next().value!);
  return out;
}

/** Как рисовать потомка по ветви в этом кадре: цвет ветви (#rrggbb), яркость поколения (штриха у ветвей нет, решение 94). */
export interface BranchPaint {
  color: string;
  a: number;
  branch: number;
  gen: number;
}
/** Ветви выбранного лица в кадре: цвет потомков, свечение предков, что нарисовано цветом. */
export interface BranchFrame {
  map: BranchMap | null;
  theme: MapTheme;
  /** потомок выбранного по ветви (в выделении рода — 'desc'): как его рисовать; иначе null */
  paint(id: string): BranchPaint | null;
  /** предок выбранного (в выделении рода — 'anc'): мягкое свечение */
  ancestor(id: string): boolean;
  /** лица, нарисованные в этом кадре цветом ветви (для проверок приёмки: canvas[data-branches]) */
  shown: Set<string>;
}
const HEX6 = /^#[0-9a-f]{6}$/i;
const branchFrames = new WeakMap<object, BranchFrame>();

/**
 * Ветви выбранного лица для кадра (решение 69): только при выделении рода выбранного (не путь родства, не группа,
 * не отметки). Кадр узнаётся по его Placer — он один на кадр и общий для проходов слоёв.
 */
export function branchFrame(v: Pick<SkyContext, 'pal' | 'model'>, p: Pick<Pass, 's' | 'placer'>): BranchFrame {
  const key = (p.placer as object | undefined) ?? p;
  const was = branchFrames.get(key);
  if (was) return was;
  const s = p.s;
  const hl = s.highlight;
  const sel = s.selected;
  const theme: MapTheme = v.pal?.glow ? 'night' : 'day';
  const on = !!sel && !!hl && hl.get(sel) === 'self';
  const map = on ? branchMapOf(sel!, v.model?.id ?? '') : null;
  const grounds = [v.pal?.sky, v.pal?.band].filter((c): c is string => !!c && HEX6.test(c.trim()));
  const byBranch = new Map<number, BranchPaint>();
  const f: BranchFrame = {
    map,
    theme,
    paint(id) {
      if (!map || hl!.get(id) !== 'desc') return null;
      const b = map.desc.get(id);
      if (!b) return null;
      const k = b.branch * 64 + Math.min(63, b.gen);
      let out = byBranch.get(k);
      if (!out) {
        const color = branchColor(b.branch, theme);
        out = { color, a: branchFade(b.gen, grounds.length ? branchFloor(color, grounds) : 0), branch: b.branch, gen: b.gen };
        byBranch.set(k, out);
      }
      return out;
    },
    ancestor: (id) => !!map && hl!.get(id) === 'anc',
    shown: new Set(),
  };
  branchFrames.set(key, f);
  return f;
}

// ---------- путь родства (E5) ----------

/**
 * Вид шага пути на небе по словарю начертаний (этап 13, решение 94; X3 Д13): кровный и брак — сплошной; иное
 * происхождение (по закону, по Луке, усыновление, левират, предок, иное прочтение) — штрих; толкование — точки цвета
 * текста; родство словом Писания («сестра», «брат») — золотистые точки по дуге, как дуга семьи у звезды.
 */
export type StepLook = 'blood' | 'legal' | 'term' | 'interp';
const OTHER_ORIGIN = new Set(['legal', 'adoptive', 'levirate', 'by-luke', 'ancestor', 'alternative']);
export function stepLook(st: Pick<KinStep, 'kind' | 'claim' | 'interpretive'>): StepLook {
  if (st.interpretive) return 'interp';
  if (st.kind === 'kin') return 'term';
  // брак — сплошной (этап 11, Г10: штрих — только иное происхождение)
  if (OTHER_ORIGIN.has(st.claim)) return 'legal';
  return 'blood';
}
export const STEP_DASH: Record<StepLook, number[]> = { blood: [], legal: [6, 3], term: [0.5, 4.5], interp: [0.5, 4.5] };

/**
 * Ломаная шага: от родителя вдоль его следа до года рождения ребёнка, затем отводом к ребёнку (как связь на небе);
 * вверх — наоборот; брак и родство по термину — прямой отрезок. a и b — звёзды from и to.
 */
export function stepRoute(kind: KinStep['kind'], a: { x: number; y: number }, b: { x: number; y: number }, trunk?: number | null): { x: number; y: number }[] {
  // ствол связи (src/render/links.ts): путь идёт по нему, а не сквозь звезду ребёнка (этап 11, § 2: «те же маршруты»)
  if (kind === 'down') return trunk != null && trunk < b.x - 1 ? [a, { x: trunk, y: a.y }, { x: trunk, y: b.y }, b] : [a, { x: b.x, y: a.y }, b];
  if (kind === 'up') return trunk != null && trunk < a.x - 1 ? [a, { x: trunk, y: a.y }, { x: trunk, y: b.y }, b] : [a, { x: a.x, y: b.y }, b];
  // родство словом Писания — по той же дуге, что золотистая дуга семьи (решение 94; К5)
  if (kind === 'kin' && Math.hypot(b.x - a.x, b.y - a.y) > 1) {
    const pts = arcPolyline(a, kinArcCtrl(a, b), b);
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < pts.length; k += 2) out.push({ x: pts[k], y: pts[k + 1] });
    out[0] = a;
    out[out.length - 1] = b;
    return out;
  }
  return [a, b];
}

/** x ствола связи «родитель → ребёнок» в кадре (px холста): начало зубца к ребёнку; null — зубца нет (лента, связи не нарисованы). */
export function trunkOf(d: LinkDraw | null | undefined, parent: string, kid: string): number | null {
  if (!d) return null;
  for (const q of d.frame.paths) {
    if (q.kind !== 'tooth' || q.ends[q.ends.length - 1] !== kid || !q.ends.includes(parent) || !linkShown(q, d)) continue;
    return q.pts[0] + d.dx;
  }
  return null;
}

/** Места подписи шага: у середин колен, от длинного к короткому; справа и слева от вертикали, над и под горизонталью. */
function stepSpot(route: { x: number; y: number }[], w: number, size: number): { tx: number; ty: number }[] {
  const legs: { a: { x: number; y: number }; b: { x: number; y: number }; l: number }[] = [];
  for (let k = 0; k + 1 < route.length; k++) legs.push({ a: route[k], b: route[k + 1], l: Math.hypot(route[k + 1].x - route[k].x, route[k + 1].y - route[k].y) });
  legs.sort((p, q) => q.l - p.l);
  const out: { tx: number; ty: number }[] = [];
  for (const { a, b, l } of legs) {
    if (l < 4) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (Math.abs(b.y - a.y) >= Math.abs(b.x - a.x)) out.push({ tx: mx + 5, ty: my + size * 0.35 }, { tx: mx - 5 - w, ty: my + size * 0.35 });
    else out.push({ tx: mx - w / 2, ty: my - 5 }, { tx: mx - w / 2, ty: my + size + 3 });
  }
  return out;
}

/** Ломаные шагов пути в px холста: только шаги, оба конца которых есть на небе. */
export function kinRoutes(v: SkyContext, steps: readonly KinStep[], d?: LinkDraw | null): { st: KinStep; pts: { x: number; y: number }[] }[] {
  const { cam } = v;
  // лица, скрытые рабочим набором или свёрткой (J4, J5), и лица не на линиях в режиме «только линии» — без шага: его конец
  // висел бы в пустоте, где звезды нет (этап 11, B1: путь «Руфь — Давид» шёл от Овида к пустому месту Руфи)
  const at = (id: string) => {
    const i = v.indexOf(id);
    return i === undefined || v.hides(id) || !v.drawn(i) ? null : { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane) };
  };
  const out: { st: KinStep; pts: { x: number; y: number }[] }[] = [];
  for (const st of steps) {
    const a = at(st.from);
    const b = at(st.to);
    if (!a || !b) continue;
    const trunk = st.kind === 'down' ? trunkOf(d, st.from, st.to) : st.kind === 'up' ? trunkOf(d, st.to, st.from) : null;
    out.push({ st, pts: stepRoute(st.kind, a, b, trunk) });
  }
  return out;
}

/**
 * Путь родства на небе (E5; MAP-18, UX-11): ломаная 2 px на подложке неба; кровные шаги и брак — сплошные цвета --ink,
 * иное происхождение — штрихом, толкование — точками цвета текста, родство словом Писания — золотистыми точками по дуге
 * (этап 13, решение 94). Рисуется под звёздами: звёзды пути лежат на ломаной, как бусины.
 */
export function drawKinPath(v: SkyContext, p: Pass) {
  const steps = p.s.kinSteps;
  if (!steps?.length) return;
  const { ctx, pal } = v;
  const routes = kinRoutes(v, steps, p.links);
  if (!routes.length) return;
  ctx.save();
  ctx.lineJoin = 'round';
  const trace = (pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  };
  // подложка цвета неба: путь отделяется от следов и отводов
  ctx.strokeStyle = pal.halo;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const r of routes) {
    trace(r.pts);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  const gold = KIN_GOLD[pal.glow ? 'night' : 'day'];
  for (const r of routes) {
    const look = stepLook(r.st);
    const dash = STEP_DASH[look];
    // слово Писания — золотистыми точками, как дуга семьи; толкование — точками цвета текста; иное происхождение — штрих
    ctx.strokeStyle = look === 'term' ? gold : pal.ink;
    ctx.setLineDash(dash);
    ctx.lineCap = dash.length ? 'round' : 'butt';
    trace(r.pts);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Подписи шагов пути (E5): курсивом, кем следующее лицо приходится предыдущему («мать», «брат»), у середины
 * самого длинного колена шага. Повторяющийся термин («сын», «сын»…) подписывается у первого шага серии.
 * Проходят ту же проверку наложений, что подписи звёзд (labels.ts, claim), и ставятся после них.
 */
export function drawKinSteps(v: SkyContext, p: Pass) {
  const steps = p.s.kinSteps;
  if (!steps?.length || !p.s.layers.labels) return;
  const { ctx, pal } = v;
  const size = mapSize(T_MAP_S, v.coarse);
  ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  let prev = '';
  for (const r of kinRoutes(v, steps, p.links)) {
    const text = r.st.term;
    const key = `${text}|${stepLook(r.st)}`;
    if (!text || key === prev) continue;
    prev = key;
    const w = ctx.measureText(text).width;
    const spots = stepSpot(r.pts, w, size);
    const boxes = spots.map((c) => textBox(c.tx, c.ty, w, size));
    const b = claim(v, p, boxes, 'note', text);
    if (!b) continue;
    const c = spots[boxes.indexOf(b)];
    ctx.strokeStyle = pal.halo;
    ctx.lineWidth = 3;
    ctx.strokeText(text, c.tx, c.ty);
    ctx.fillStyle = pal.ink;
    ctx.fillText(text, c.tx, c.ty);
  }
  ctx.lineWidth = 1;
}

/**
 * Подписи, которые идут раньше обычных подписей звёзд (E5, E6): при пути родства и в режиме «только линии» —
 * сначала выбранное, второе, наведённое лицо и лицо с фокусом (как у подписей звёзд: выбранное — первым и без
 * проверки), затем подписи шагов пути; в режиме «только линии» — выноски точек сравнения и подписи лиц линий.
 * Обычные подписи (labels.ts) потом не ложатся на них.
 */
export function drawLeadNotes(v: SkyContext, p: Pass, steps: { joseph: readonly LineStep[]; mary: readonly LineStep[] }) {
  const s = p.s;
  if (s.layers.labels && (s.onlyLines || s.kinSteps?.length)) {
    // ширины имён и пороги — те же, что у подписей звёзд
    v.labelCache.ensure(v);
    let first = true;
    for (const id of new Set([s.selected, s.second, s.hovered, s.focus])) {
      const i = id ? v.indexOf(id) : undefined;
      if (i === undefined || v.nodes[i].ghost || !v.drawn(i) || p.starAlpha(i) <= 0.5) continue;
      putLabel(v, p, i, { sides: ['r', 'l', 't', 'b'], color: v.pal.ink, alpha: 1, sigla: true, leader: true, overStars: true, force: first });
      first = false;
    }
  }
  drawKinSteps(v, p);
  // обязательные имена «только линий» (решение 39: Адам, Ной, Авраам, Давид, Соломон, Нафан…) — раньше выносок и подписей лент
  drawKeyLineNames(v, p, steps);
  drawLineNotes(v, p, steps);
  // подписи лент «через Соломона (Мф 1)» — раньше имён лиц линий (UX-45): имя, которому не хватит места, встанет
  // мельче или номером у бусины (MAP-59); женщины Мф 1 — малыми знаками у сыновей (решение 28)
  if (p.s.onlyLines) drawBranchLabels(v, p, steps);
  drawMt1Women(v, p, steps);
  drawLineNames(v, p, steps);
}

// ---------- рабочий набор на небе (IX-51) ----------

/**
 * Метка члена набора (IX-51, IX-77): уголок 5 × 5 px над-справа от знака — горизонталь и вертикаль толщиной 1,25 px,
 * как угол рамки выделения. Черта над знаком значит «царь» (ТЗ § 3.1), поэтому метка набора — другой формы.
 */
export const WORK_MARK = { w: 5, h: 5, line: 1.25 };
/** С какой высоты строки метки набора видны: ниже они сливаются со знаками. */
export const WORK_MARK_KY = 8;
/** Отклик звезды на клавишу набора, мс (IX-51; SkyView, WORK_FLASH_MS). */
export const WORK_FLASH_MS = 300;

/**
 * Место метки набора у звезды (x, y) радиуса r: над-справа, прямоугольник уголка. Низ уголка — выше строки подписи
 * справа от звезды (она стоит по середине звезды, до 9 px вверх), чтобы подпись оставалась на своём месте; у царя — ещё
 * и выше его черты и правее её конца: уголок не касается черты.
 */
export function workMarkAt(x: number, y: number, r: number, king = false): { x: number; y: number; w: number; h: number } {
  const bottom = king ? y - r - 5.5 : y - Math.max(r + 1.5, 9.5);
  return { x: x + r + (king ? 3.5 : 1.5), y: bottom - WORK_MARK.h, w: WORK_MARK.w, h: WORK_MARK.h };
}
/** Две полосы уголка «┐»: верхняя и правая (px холста). */
export function workMarkBars(x: number, y: number, r: number, king = false): { x: number; y: number; w: number; h: number }[] {
  const m = workMarkAt(x, y, r, king);
  const t = WORK_MARK.line;
  return [
    { x: m.x, y: m.y, w: m.w, h: t },
    { x: m.x + m.w - t, y: m.y, w: t, h: m.h },
  ];
}

/**
 * Метки членов рабочего набора в режиме «все лица» (IX-51, IX-77): уголок 5 × 5 px над-справа от знака тоном --ink,
 * без цвета (цвет — только у лент), при высоте строки от 8 px. Рисуются вместе со звёздами; их места занимаются до
 * подписей. Этой же функцией метку рисует «Как читать карту».
 */
export function drawWorkMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, king = false) {
  ctx.fillStyle = color;
  for (const b of workMarkBars(x, y, r, king)) ctx.fillRect(b.x, b.y, b.w, b.h);
}
export function drawWorkMarks(v: SkyContext, p: Pass) {
  const set = p.s.workMarks;
  if (!set?.size || v.cam.ky < WORK_MARK_KY) return;
  const { ctx, cam, pal } = v;
  for (const id of set) {
    const i = v.indexOf(id);
    if (i === undefined || !v.drawn(i) || p.starAlpha(i) <= 0.5) continue;
    const q = byId.get(id);
    if (!q) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    if (x < v.letterW || x > cam.w || y < v.openTop || y > cam.vp.b) continue;
    const r = starRadius(q.magnitude, p.zoomScale) + (q.sex === 'f' ? 2.2 : 0);
    const king = q.roles.includes('king') || q.roles.includes('queen');
    ctx.globalAlpha = Math.max(0.7, p.emph(id));
    drawWorkMark(ctx, x, y, r, pal.ink, king);
    ctx.globalAlpha = 1;
    const m = workMarkAt(x, y, r, king);
    // подпись на метку не ложится
    p.placer.add({ x: m.x - 1, y: m.y - 1, w: m.w + 2, h: m.h + 2 });
    if (p.shown) p.shown.workMarks++;
  }
}

/**
 * Кольца: выбранные — кольцо цвета фокуса; фокус клавиатуры — такое же кольцо, а у выбранной звезды — второе, снаружи;
 * наведённая звезда — тонкое кольцо (E11; IX-06); отмеченные одноимённые — сплошное кольцо (E10; UX-31: пунктир читался
 * как знак народа). У жены с «призраком» в родном роду наведение и выбор проводят к призраку точечную дугу (MAP-15).
 */
export function drawRings(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  const s = p.s;
  const ring = (id: string, out: number, width = 2, color = pal.focus, gap?: number) => {
    const i = v.indexOf(id);
    // скрытое набором или свёрткой (J4, J5) — без кольца
    if (i === undefined || v.hides(id)) return;
    const q = byId.get(id)!;
    // звезды нет на небе (режим «только линии»): кольцо — у её знака-спутницы (мать у развилки, женщины Мф 1; UX-46),
    // а без знака — не рисуется: пустое кольцо читалось бы как сбой
    const bead = v.drawn(i) ? null : beadAt(v, id);
    if (!v.drawn(i) && !bead) return;
    const x = bead ? bead.x : cam.sx(v.X0[i]);
    const y = bead ? bead.y : cam.sy(v.nodes[i].lane);
    const r = starRadius(q.magnitude, p.zoomScale) + (gap ?? (q.sex === 'f' ? 6.5 : 5)) + out;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  // призрак жены: дуга от знака в родном роду к её месту у мужа — золотистым пунктиром семьи (решение 89)
  const ghosts: string[] = [];
  const drawn = new Set<string>();
  if (s.layers.ghosts && cam.ky >= 5)
    for (const id of new Set([s.hovered, s.selected])) {
      if (!id) continue;
      const gi = v.indexOf(`ghost:${id}`);
      const ri = v.indexOf(id);
      if (gi === undefined || ri === undefined || !v.drawn(gi) || !v.drawn(ri)) continue;
      const a = { x: cam.sx(v.X0[gi]), y: cam.sy(v.nodes[gi].lane) };
      const b = { x: cam.sx(v.X0[ri]), y: cam.sy(v.nodes[ri].lane) };
      const bend = Math.min(160, Math.abs(b.y - a.y) * 0.25 + 30);
      goldArc(v, a, { x: Math.min(a.x, b.x) - bend, y: (a.y + b.y) / 2 }, b);
      ghosts.push(`ghost>${id}`);
    }
  // родство по термину Писания (MAP-17): у лица под указателем и у выбранного — золотистая точечная дуга к названному
  // родственнику и термин («сестра»); это соседство по слову Писания, не утверждение о родителях (П-8; решение 89)
  const seen = new Set<string>();
  if (cam.ky >= 5) for (const id of new Set([s.hovered, s.selected])) if (id) drawKinArcs(v, p, id, seen, drawn);
  // золотистые дуги кадра — для проверок приёмки (canvas[data-kin-arcs]): «от>к:слово» и «ghost>лицо»
  const ds = (ctx.canvas as { dataset?: DOMStringMap } | undefined)?.dataset;
  if (ds) {
    const t = [...ghosts, ...drawn].join('|');
    if (ds.kinArcs !== t) ds.kinArcs = t;
  }
  drawPersonGhosts(v, p);
  for (const id of [s.selected, s.second]) if (id) ring(id, 0);
  // отклик на клавишу набора (IX-51): однократная обводка 300 мс — расходится и гаснет; при ослабленном движении — стоит
  const fl = s.workFlash;
  if (fl) {
    const t = ((typeof performance !== 'undefined' ? performance.now() : fl.at) - fl.at) / WORK_FLASH_MS;
    if (t >= 0 && t < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ring(fl.id, s.reduced ? 3 : 2 + 6 * t, 1.5, pal.ink);
      ctx.restore();
    }
  }
  if (s.focus) ring(s.focus, s.focus === s.selected || s.focus === s.second ? 4 : 0);
  // наведённая звезда — тонкое кольцо: звезда отвечает на указатель
  if (s.hovered && s.hovered !== s.selected && s.hovered !== s.second && s.hovered !== s.focus) {
    const i = v.indexOf(s.hovered);
    if (i !== undefined && v.drawn(i)) ring(s.hovered, 0, 1, pal.ink, byId.get(s.hovered)!.sex === 'f' ? 6.2 : 4);
  }
  // отмеченные одноимённые
  for (const id of s.pins) {
    const i = v.indexOf(id);
    if (i === undefined || !v.drawn(i)) continue;
    ring(id, 0, 1.5, pal.ink, byId.get(id)!.sex === 'f' ? 8.5 : 7);
  }
}

/**
 * Золотистая точечная дуга семьи (этап 12, решение 89): кривая Безье a → c → b точками цвета KIN_GOLD. Ночью — со слабым
 * свечением, днём — на бледно-золотой подложке: дугу видно и на тёмном, и на светлом небе. Жёлтый выбранной связи —
 * другой: сплошной, лимонный и толще.
 */
export function goldArc(v: Pick<SkyContext, 'ctx' | 'pal'>, a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }) {
  const { ctx, pal } = v;
  const night = !!pal.glow;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.strokeStyle = night ? alpha(KIN_GOLD.night, 0.16) : alpha(KIN_GOLD_UNDER.color, KIN_GOLD_UNDER.a);
  ctx.lineWidth = night ? 4 : KIN_GOLD_UNDER.width;
  trace();
  ctx.strokeStyle = KIN_GOLD[night ? 'night' : 'day'];
  ctx.lineWidth = 1.5;
  ctx.setLineDash([0.1, 3.4]);
  trace();
  ctx.restore();
}

/**
 * Дуги родства по термину Писания у лица id (MAP-17): к каждому названному родственнику на небе — золотистая точечная
 * дуга (решение 89), у дуги — термин (кем приходится лицо у начала дуги: «Саруия — сестра Давида») тем же цветом.
 * Подпись — той же проверкой наложений. seen — уже нарисованные дуги (у наведённого и выбранного одна дуга — один раз).
 */
export function drawKinArcs(v: SkyContext, p: Pass, id: string, seen: Set<string> = new Set(), drawn?: Set<string>) {
  const { ctx, cam, pal } = v;
  const at = (x: string) => {
    const i = v.indexOf(x);
    return i === undefined || !v.drawn(i) ? null : { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane) };
  };
  const size = mapSize(T_MAP_S, v.coarse);
  const gold = KIN_GOLD[pal.glow ? 'night' : 'day'];
  for (const e of graph.kinOf.get(id) ?? []) {
    const k = `${e.from}|${e.to}|${e.rel}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const a = at(e.from);
    const b = at(e.to);
    if (!a || !b) continue;
    const { x: cx, y: cy } = kinArcCtrl(a, b);
    goldArc(v, a, { x: cx, y: cy }, b);
    drawn?.add(`${e.from}>${e.to}:${e.rel}`);
    if (!p.s.layers.labels) continue;
    // термин — у середины дуги (t = 0,5), слева или справа от неё; если там тесно — у других точек дуги
    ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
    const w = ctx.measureText(e.rel).width;
    const spots: { tx: number; ty: number }[] = [];
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const mx = (1 - t) * (1 - t) * a.x + 2 * t * (1 - t) * cx + t * t * b.x;
      const my = (1 - t) * (1 - t) * a.y + 2 * t * (1 - t) * cy + t * t * b.y;
      spots.push({ tx: mx - w - 4, ty: my + size * 0.35 }, { tx: mx + 4, ty: my + size * 0.35 });
    }
    const boxes = spots.map((q) => textBox(q.tx, q.ty, w, size));
    const got = claim(v, p, boxes, 'note', e.rel);
    if (!got) continue;
    const q = spots[boxes.indexOf(got)];
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = pal.halo;
    ctx.lineWidth = 3;
    ctx.strokeText(e.rel, q.tx, q.ty);
    ctx.fillStyle = gold;
    ctx.fillText(e.rel, q.tx, q.ty);
    ctx.lineWidth = 1;
  }
}

/** Флажок меридиана: прямоугольник на служебной строке рамки (px холста), текст и x черты. */
export interface MeridianFlag extends Rect {
  text: string;
  /** x черты меридиана */
  lx: number;
}

/**
 * Где встанет флажок меридиана (D13; MAP-33): лист на служебной строке рамки, справа от черты, у правого края — слева.
 * Место считается до рамки: служебная строка (frame.ts, drawServiceRow) обходит флажок — название эпохи под ним
 * сдвигается, а не закрывается. null — меридиана нет, черта за краем или без подписи.
 */
export function meridianFlagAt(v: SkyContext, s: SkyState): MeridianFlag | null {
  if (s.meridian === null || !s.meridianLabel) return null;
  const { ctx, cam } = v;
  const x = Math.round(cam.sx(v.xOf(s.meridian))) + 0.5;
  if (x < v.letterW || x > cam.w) return null;
  const text = s.meridianLabel;
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  const w = ctx.measureText(text).width + 12;
  let bx = x + 1;
  if (bx + w > cam.w - 2) bx = x - w;
  bx = Math.max(v.letterW + 1, bx);
  return { x: bx, y: RULER_H, w, h: ROW_H - 1, text, lx: x };
}

/**
 * Меридиан года (D13; UX-27, IX-34, MAP-07, MAP-33): черта через ярусы и небо и флажок у линейки неба —
 * «990 г. до Р. Х.: живы 186, наверняка 41». Флажок — лист на служебной строке рамки (meridianFlagAt); он в замере
 * подписей, как надписи рамки. Возвращает прямоугольник флажка (px холста) или null.
 */
export function drawMeridian(v: SkyContext, s: SkyState, flag: MeridianFlag | null = meridianFlagAt(v, s)): Rect | null {
  if (s.meridian === null) return null;
  const { ctx, cam, pal } = v;
  const x = Math.round(cam.sx(v.xOf(s.meridian))) + 0.5;
  if (x < v.letterW || x > cam.w) return null;
  ctx.strokeStyle = alpha(pal.ink, 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, RULER_H);
  ctx.lineTo(x, cam.h);
  ctx.stroke();
  if (!flag) return null;
  const { x: bx, y: by, w, h, text } = flag;
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.sheet;
  ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = pal.ruleStrong;
  ctx.strokeRect(Math.round(bx) + 0.5, by + 0.5, Math.round(w) - 1, h - 1);
  ctx.fillStyle = pal.ink;
  ctx.fillText(text, bx + 6, by + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
  v.ledger.add('frame', text, { x: bx, y: by, w, h });
  return { x: bx, y: by, w, h };
}

// ---------- выбранная связь (этап 11, § 8; решения 83, 84) ----------

/** Выбранная связь в последнем кадре: для карточки связи (linkAnchor) и проверок приёмки (canvas[data-link-sel]). */
export interface SelectedLinkInfo {
  /** запись ключа (linkKeyString) */
  ks: string;
  /** концы: лицо, роль, на экране ли (кольцо) или у края (указатель); x, y — центр кольца или указателя, px холста */
  ends: { id: string; role: string; x: number; y: number; on: boolean }[];
  /** точка карточки связи: середина нарисованного пути в окне, px холста; null — пути в окне нет */
  x: number | null;
  y: number | null;
  /** отрезков пути в кадре */
  segs: number;
  /** ломаные пути (px холста, до десятых): вся выбранная связь — от звёзд родителей через узел союза до ребёнка (решение 88) */
  routes: number[][];
  /** указатели у края: щелчок — перелёт к лицу (src/ui/sky/input.ts, как указатели frame.ts) */
  edges: (Rect & { id: string })[];
  /**
   * призраки концов, скрытых показом или свёрткой (К3): место кольца и поле подписи; щелчок — «показать» (лицо встаёт
   * временным гостем, src/ui/show.ts, showGuest). why — причина (src/ui/linkstate.ts, GhostWhy)
   */
  ghosts: (Rect & { id: string; role: string; why: GhostWhy; cx: number; cy: number })[];
}

/** Призрак конца выбранной связи (К3): лицо, место кольца (px) и радиус его знака. */
/** Призраки родни выбранного лица и лица под указателем в этом кадре (К3, К5): поля попадания, как у призраков связи. */
const personGhostHits = new WeakMap<object, SelectedLinkInfo['ghosts']>();
export const personGhosts = (v: object): SelectedLinkInfo['ghosts'] => personGhostHits.get(v) ?? [];

/**
 * К3, К5 (этап 13, X3 § 2.1): у выбранного лица и у лица под указателем скрытые показом или свёрткой родители и родня
 * словами Писания встают призраками — пунктирное кольцо в год лица, на полстроки от него (на общей раскладке — в сторону
 * его настоящей полосы, в семейной — родители выше, родня ниже), подпись «Илий, отец — вне показа». К родителю — короткая
 * линия начертанием союза (толкование — точки, иное происхождение — штрих), к родне — золотистая дуга с обрывком к
 * призраку. Супругов и детей правило не касается: скрытые дети — «+N» у ромба, союз — ромб на следе (К6). Щелчок по
 * призраку показывает лицо гостем (src/ui/sky/input.ts), как у призраков выбранной связи; призраки её концов не
 * повторяются. Только призраки в окне: указатели у кромки — у концов выбранной связи.
 */
function drawPersonGhosts(v: SkyContext, p: Pass) {
  const out: SelectedLinkInfo['ghosts'] = [];
  personGhostHits.set(v, out);
  const s = p.s;
  const { cam, ctx, pal } = v;
  if (cam.ky < 5 || !s.layers.ghosts) return;
  const vp = cam.vp;
  const taken = new Set(s.link ? selectedRoutes(v, p.links, s.link).ghosts.map((g) => g.id) : []);
  const family = p.links?.frame.layout === 'family';
  const spots: GhostSpot[] = [];
  const hidden = (id: string) => {
    const i = v.indexOf(id);
    return i !== undefined && (!v.drawn(i) || v.hides(id));
  };
  const why = (id: string): GhostWhy => {
    const f = foldsHiding(id);
    return f.desc.length || f.groups.length ? 'folded' : 'show';
  };
  const ink = pal.ink2;
  for (const id of new Set([s.selected, s.hovered])) {
    if (!id) continue;
    const i = v.indexOf(id);
    if (i === undefined || !v.drawn(i) || v.hides(id)) continue;
    const at = { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane) };
    const place = (gid: string, up: boolean): GhostSpot | null => {
      const gi = v.indexOf(gid);
      const q = byId.get(gid);
      if (gi === undefined || !q) return null;
      const x = cam.sx(v.X0[gi]);
      const real = family ? NaN : cam.sy(v.nodes[gi].lane);
      const dir = Number.isFinite(real) && Math.abs(real - at.y) > 0.5 ? Math.sign(real - at.y) : up ? -1 : 1;
      const step = Math.max(6, cam.ky * 0.5);
      const r = starRadius(q.magnitude, 1) + (q.sex === 'f' ? 2.2 : 0);
      // между строк, на полстроки от лица; если там уже что-то есть (другой призрак, звезда, подпись, «+N» разрыва
      // ленты) — ещё на строку дальше, затем по другую сторону
      const free = (y: number) => {
        const R = r + 4;
        return !spots.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 8) && !p.placer.clash({ x: x - R, y: y - R, w: 2 * R, h: 2 * R }, true);
      };
      const tries = [1, 3, 5, -1, -3, -5].map((k) => at.y + dir * k * step);
      const y = tries.find(free) ?? tries[0];
      // призрак за краем окна не рисуется: указатели у кромки — у концов выбранной связи (К2)
      if (!(x >= vp.l && x <= vp.r && y >= v.openTop && y <= vp.b)) return null;
      const g = { id: gid, x, y, r };
      spots.push(g);
      return g;
    };
    // родители — из союза происхождения (другое прочтение Лк 3:23 не рисуется, решение 107)
    const u = mainUnion(unions, id);
    if (u && !otherReading(u, s.lineFlip))
      for (const par of [u.a, u.b]) {
        if (!par || !hidden(par) || taken.has(par)) continue;
        const g = place(par, true);
        const q = byId.get(par);
        if (!g || !q) continue;
        taken.add(par);
        const xs = Math.max(g.x + 2, at.x - TRUNK_LEAD);
        ctx.save();
        ctx.strokeStyle = alpha(ink, 0.9);
        ctx.lineWidth = 1;
        ctx.setLineDash(LINK_DASH[kidStyle(u)]);
        ctx.beginPath();
        ctx.moveTo(g.x + g.r + 3, g.y);
        ctx.lineTo(xs, g.y);
        ctx.lineTo(xs, at.y);
        ctx.lineTo(at.x, at.y);
        ctx.stroke();
        ctx.restore();
        out.push(...drawGhostEnd(v, p, g, q.name, q.sex === 'f' ? 'мать' : 'отец', why(par), ink));
      }
    // родня словами Писания (К5): обрывок золотистой дуги к призраку
    for (const e of graph.kinOf.get(id) ?? []) {
      const other = e.from === id ? e.to : e.from;
      if (!hidden(other) || taken.has(other)) continue;
      const g = place(other, false);
      const q = byId.get(other);
      if (!g || !q) continue;
      taken.add(other);
      const [a, b] = e.from === id ? [at, g] : [g, at];
      goldArc(v, a, kinArcCtrl(a, b), b);
      // термин — кем приходится призрак (у начала дуги), иначе — только имя
      out.push(...drawGhostEnd(v, p, g, q.name, e.from === other ? e.rel : '', why(other), ink));
    }
  }
}

export interface GhostSpot {
  id: string;
  x: number;
  y: number;
  r: number;
}

/**
 * Ломаные выбранной связи: весь путь (рисуется жёлтым) и его ядро — путь самой связи без хвостов к родителям (к середине
 * ядра встаёт карточка связи); ghosts — призраки концов, скрытых показом или свёрткой (этап 13, решение 93, К3): жёлтое
 * идёт от призрака, а не от чужой звезды.
 */
export interface SelectedRoutes {
  all: number[][];
  core: number[][];
  ghosts: GhostSpot[];
}

/** Вершина дуги родства (золотистая дуга, drawKinArcs): кривая a → c → b. */
export function kinArcCtrl(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  const bend = Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) * 0.25 + 12);
  return { x: Math.min(a.x, b.x) - bend, y: (a.y + b.y) / 2 };
}

/** Дуга a → c → b ломаной (для жёлтого выбранной дуги родства по той же кривой, К5): не реже, чем через 6 px. */
export function arcPolyline(a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }): number[] {
  const len = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
  const n = Math.max(8, Math.min(96, Math.ceil(len / 6)));
  const out: number[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    out.push(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y);
  }
  return out;
}

/** Кэш путей выбранной связи по кадру связей: пути — в px кадра (при сдвиге неба кадр тот же). */
const routeCache = new WeakMap<object, Map<string, SelectedRoutes>>();

/**
 * Ломаные выбранной связи в px холста (этап 12, решение 88 — связь целиком): «союз → ребёнок» — от звезды каждого
 * названного родителя на небе по его следу (и по лестнице союзов) до узла союза, от узла по стволу и зубцу до звезды
 * ребёнка; у ребёнка линии Мессии — лента шага; союз целиком — все его линии и пути обоих родителей к узлу; черта брака —
 * пути обоих супругов к узлу. Путь идёт по нарисованным линиям (links.ts, routeOver); родитель, у которого до узла
 * нарисованной линии нет (мать стоит далеко, Г8), — по своему следу до столбца узла и оттуда к узлу.
 */
export function selectedRoute(v: SkyContext, d: LinkDraw | null | undefined, key: LinkKey): number[][] {
  return selectedRoutes(v, d, key).all;
}

export function selectedRoutes(v: SkyContext, d: LinkDraw | null | undefined, key: LinkKey): SelectedRoutes {
  const none: SelectedRoutes = { all: [], core: [], ghosts: [] };
  if (!d) return none;
  const ks = linkKeyString(key) ?? '';
  let byKs = routeCache.get(d.frame);
  if (!byKs) routeCache.set(d.frame, (byKs = new Map()));
  let got = byKs.get(ks);
  if (!got) {
    got = frameRoutes(v, d, key, ks);
    if (byKs.size > 8) byKs.clear();
    byKs.set(ks, got);
  }
  const shift = (pts: readonly number[]) => pts.map((q, k) => q + (k % 2 ? d.dy : d.dx));
  return { all: got.all.map(shift), core: got.core.map(shift), ghosts: got.ghosts.map((g) => ({ ...g, x: g.x + d.dx, y: g.y + d.dy })) };
}

/** Пути выбранной связи в px кадра связей. */
function frameRoutes(v: SkyContext, d: LinkDraw, key: LinkKey, ks: string): SelectedRoutes {
  const all: number[][] = [];
  const core: number[][] = [];
  const ghosts: GhostSpot[] = [];
  const paths = d.frame.paths.filter((q) => linkShown(q, d));
  const t: LifeTrail = { x0: 0, x1: 0, y: 0, cls: 'exact', known: true, solidTo: 0, color: '', width: 1 };
  /** звезда лица в px кадра и конец её следа; null — звезды на небе нет */
  const star = (id: string) => {
    const i = v.indexOf(id);
    if (i === undefined || !v.drawn(i) || v.hides(id)) return null;
    const x = v.cam.sx(v.X0[i]) - d.dx;
    const y = v.cam.sy(v.nodes[i].lane) - d.dy;
    const tr = trailOf(v, i, t);
    return { x, y, x1: tr ? Math.max(tr.x0, tr.x1) - d.dx : x };
  };
  /**
   * Призрак конца id (К3): x — его настоящий год, по вертикали — на полстроки от видимого конца at в сторону его
   * настоящей полосы (в семейной укладке её нет: родители — выше, дети и прочие — ниже), между строк.
   */
  const ghostOf = (id: string, at: { x: number; y: number }, side: 'from' | 'to'): GhostSpot | null => {
    const i = v.indexOf(id);
    const q = byId.get(id);
    if (i === undefined || !q) return null;
    const x = v.cam.sx(v.X0[i]) - d.dx;
    const real = d.frame.layout === 'family' ? NaN : v.cam.sy(v.nodes[i].lane) - d.dy;
    const dir = Number.isFinite(real) && Math.abs(real - at.y) > 0.5 ? Math.sign(real - at.y) : side === 'from' ? -1 : 1;
    const g = { id, x, y: at.y + dir * Math.max(6, v.cam.ky * 0.5), r: starRadius(q.magnitude, 1) + (q.sex === 'f' ? 2.2 : 0) };
    ghosts.push(g);
    return g;
  };
  /** Путь между старшим (левее) и младшим концом: по строке старшего до столбца младшего, ступенькой к нему. */
  const join = (a: { x: number; y: number }, b: { x: number; y: number }): number[] => {
    const [o, y] = a.x <= b.x ? [a, b] : [b, a];
    const xs = Math.max(o.x + 2, y.x - TRUNK_LEAD);
    return Math.abs(o.y - y.y) < 0.5 ? [o.x, o.y, y.x, y.y] : [o.x, o.y, xs, o.y, xs, y.y, y.x, y.y];
  };
  const roles = linkRoles(key);
  if (key.kind === 'step' || key.kind === 'span') {
    for (const q of paths) if (q.kind === 'ribbon' && q.ks === ks) all.push([...q.pts]);
    // шаг, родитель которого скрыт показом (К4: r.m.mariya в «ключевых лицах»), — не по ленте: призрак родителя и
    // короткое жёлтое от него к ребёнку
    if (!all.length && key.kind === 'step') {
      const ends = roles.map((e) => ({ e, s: star(e.id) }));
      const seen = ends.find((q) => q.s)?.s;
      if (seen)
        for (const { e, s: at } of ends) {
          if (at) continue;
          const g = ghostOf(e.id, seen, e.side);
          if (g) all.push(join(g, seen));
        }
    }
    return { all, core: all, ghosts };
  }
  if (key.kind === 'kin') {
    const a = star(key.a);
    const b = star(key.b);
    // дуга родства — жёлтым по той же кривой, что золотистая дуга (К5); скрытый конец — призрак, обрывок дуги к нему
    const ga = a ? null : b ? ghostOf(key.a, b, 'from') : null;
    const gb = b ? null : a ? ghostOf(key.b, a, 'to') : null;
    const pa = a ?? ga;
    const pb = b ?? gb;
    if (pa && pb) all.push(arcPolyline(pa, kinArcCtrl(pa, pb), pb));
    return { all, core: all, ghosts };
  }
  const u = key.union;
  const un = unions.byId.get(u);
  const node = d.frame.nodes.find((m) => m.union === u && m.kind === 'union') ?? null;
  const own = paths.filter((q) => q.union === u && q.kind !== 'ribbon');
  const segs = (qs: readonly LinkPath[]): Seg[] => qs.flatMap((q) => segmentsOf(q));
  /** след лица по его строке — от звезды вправо до конца следа или до дальней точки линий на этой строке */
  const trailSeg = (s: { x: number; y: number; x1: number }, among: readonly Seg[]): Seg => {
    let x1 = s.x1;
    for (const g of among)
      for (const [x, y] of [[g[0], g[1]], [g[2], g[3]]]) if (Math.abs(y - s.y) < 0.8 && x > x1) x1 = x;
    return [s.x, s.y, Math.max(s.x, x1), s.y];
  };
  /** путь родителя id от его звезды до узла союза: по нарисованным линиям, иначе — по своему следу до столбца узла и к узлу */
  const parentRoute = (id: string): number[] | null => {
    const s = star(id);
    if (!s || !node) return null;
    const ladder = paths.filter((q) => q.union !== u && q.kind !== 'ribbon' && q.kind !== 'tooth' && q.kind !== 'stub' && (q.ends[0] === id || (q.kind === 'bar' && q.ends.includes(id))));
    const base = [...segs(own), ...segs(ladder)];
    const r = routeOver([...base, trailSeg(s, base)], { x: s.x, y: s.y }, node);
    if (r) return r;
    if (Math.abs(node.y - s.y) < 0.5) return [s.x, s.y, node.x, s.y];
    return node.x > s.x ? [s.x, s.y, node.x, s.y, node.x, node.y] : null;
  };
  const parents = un ? [un.a, un.b].filter((x): x is string => !!x) : [];
  /** Скрытый родитель или супруг (К3, К6): призрак у узла союза — или, если узла нет, у видимого конца связи. */
  const ghostRoutes = (hidden: readonly string[], anchor: { x: number; y: number } | null) => {
    if (!anchor) return;
    for (const id of hidden) {
      const g = ghostOf(id, anchor, 'from');
      if (!g) continue;
      all.push(node ? [g.x, g.y, Math.max(g.x, node.x), g.y, Math.max(g.x, node.x), node.y] : join(g, anchor));
    }
  };
  const firstSeen = (ids: readonly string[]) => {
    for (const id of ids) {
      const q = star(id);
      if (q) return q;
    }
    return null;
  };
  if (key.kind === 'union' || key.kind === 'spouse') {
    for (const q of paths) if (key.kind === 'union' ? q.union === u : q.ks === ks) core.push([...q.pts]);
    all.push(...core);
    for (const id of parents) {
      const r = parentRoute(id);
      if (r) all.push(r);
    }
    ghostRoutes(parents.filter((id) => !star(id)), node ?? firstSeen([...parents, ...(un?.kids ?? [])]));
    return { all, core, ghosts };
  }
  // союз → ребёнок: лента шага или путь от узла по стволу и зубцу к ребёнку; пути родителей к узлу
  const kid = key.child;
  const rib = paths.filter((q) => q.kind === 'ribbon' && q.ends[1] === kid && q.union === u);
  for (const q of rib) core.push([...q.pts]);
  const tooth = own.find((q) => q.ks === ks && q.kind === 'tooth') ?? own.find((q) => q.ks === ks);
  if (tooth) {
    const end = { x: tooth.pts[tooth.pts.length - 2], y: tooth.pts[tooth.pts.length - 1] };
    const ownerStar = node ? star(node.owner) : null;
    const base = segs(own);
    const r = node ? routeOver(ownerStar ? [...base, trailSeg(ownerStar, base)] : base, end, node) : null;
    if (r) core.push(r);
    else {
      // узла в кадре нет: зубец и ствол до строки ребёнка, как прежде
      core.push([...tooth.pts]);
      const x = tooth.pts[0];
      for (const q of own) if (q.kind === 'trunk' && Math.abs(q.pts[0] - x) < 0.5) core.push([...q.pts]);
    }
  }
  all.push(...core);
  // родитель шага ленты ведёт к ребёнку лентой: его путь к узлу — в ней
  const byRibbon = new Set(rib.map((q) => q.ends[0]));
  for (const id of parents) {
    if (byRibbon.has(id)) continue;
    const r = parentRoute(id);
    if (r) all.push(r);
  }
  // скрытые концы (К3): родители — призраками у узла союза (или у ребёнка, если узла в кадре нет); ребёнок — у узла или
  // у видимого родителя
  const kidStar = star(kid);
  ghostRoutes(parents.filter((id) => !star(id)), node ?? kidStar);
  if (!kidStar) {
    const at = node ?? firstSeen(parents);
    const g = at ? ghostOf(kid, at, 'to') : null;
    if (g && at) all.push(join(at, g));
  }
  return { all, core, ghosts };
}

/**
 * Призрак конца выбранной связи (К3): пунктирное кольцо «лицо нарисовано не здесь» размером его знака, внутри — цвет
 * неба (жёлтое к нему кончается у кольца), рядом курсивом «Илий, отец — вне показа». Подпись — через общую проверку
 * наложений (Д12): не ложится на имена. Конец за краем окна — указатель у кромки с тем же текстом (К2). Возвращает поля
 * попадания (щелчок — «показать»): кольцо, затем подпись — каждое своё, не общий прямоугольник, который накрыл бы звезду
 * между ними; пусто — призрак вне холста и указателя нет.
 */
function drawGhostEnd(v: SkyContext, p: Pass, g: GhostSpot, name: string, role: string, why: GhostWhy, ink: string): SelectedLinkInfo['ghosts'] {
  const { ctx, cam, pal } = v;
  const vp = cam.vp;
  const size = mapSize(T_MAP_S, v.coarse);
  const text = `${role ? `${name}, ${role}` : name} — ${GHOST_WORD[why]}`;
  const least = v.coarse ? 44 : 24;
  const on = g.x >= vp.l && g.x <= vp.r && g.y >= v.openTop && g.y <= vp.b;
  if (!on) {
    // указатель у кромки (К2): «‹ Илий, отец — вне показа»
    const left = g.x < vp.l;
    const right = g.x > vp.r;
    const t = left ? `‹ ${text}` : right ? `${text} ›` : g.y < v.openTop ? `↑ ${text}` : `↓ ${text}`;
    ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
    const w = ctx.measureText(t).width;
    const tx = left ? v.letterW + 6 : right ? vp.r - 6 - w : Math.max(v.letterW + 6, Math.min(vp.r - 6 - w, g.x - w / 2));
    const ty = left || right ? Math.max(v.openTop + size + 4, Math.min(vp.b - 6, g.y + size * 0.35)) : g.y < v.openTop ? v.openTop + size + 6 : vp.b - 8;
    const box = textBox(tx, ty, w, size);
    ctx.save();
    ctx.fillStyle = pal.glow ? alpha(pal.sky, 0.85) : alpha(LINK_YELLOW.day, 0.9);
    ctx.fillRect(box.x - 3, box.y - 1, box.w + 6, box.h + 2);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink;
    ctx.fillText(t, tx, ty);
    ctx.restore();
    p.placer.add(box);
    v.ledger.add('edge', t, box, g.id);
    return [{ x: box.x - 3, y: box.y - Math.max(0, (least - box.h) / 2), w: box.w + 6, h: Math.max(box.h, least), id: g.id, role, why, cx: g.x, cy: g.y }];
  }
  const r = g.r + 3;
  ctx.save();
  ctx.fillStyle = pal.sky;
  ctx.beginPath();
  ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([2, 2]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  const ring = { x: g.x - r - 1, y: g.y - r - 1, w: 2 * r + 2, h: 2 * r + 2 };
  p.placer.add(ring);
  let label: Rect | null = null;
  if (p.s.layers.labels) {
    ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
    const w = ctx.measureText(text).width;
    // справа, слева, над кольцом, под ним — и на строку выше и ниже справа и слева
    const spots = [
      { tx: g.x + r + 4, ty: g.y + size * 0.35 },
      { tx: g.x - r - 4 - w, ty: g.y + size * 0.35 },
      { tx: g.x - w / 2, ty: g.y - r - 4 },
      { tx: g.x - w / 2, ty: g.y + r + 3 + size * 0.8 },
      { tx: g.x + r + 2, ty: g.y - r - 4 },
      { tx: g.x - r - 2 - w, ty: g.y - r - 4 },
      { tx: g.x + r + 2, ty: g.y + r + 3 + size * 0.8 },
      { tx: g.x - r - 2 - w, ty: g.y + r + 3 + size * 0.8 },
      // и ещё на строку дальше: у тесной семьи (Давид, Иессей) ближние места заняты именами
      { tx: g.x - w / 2, ty: g.y - r - 6 - size },
      { tx: g.x - r - 2 - w, ty: g.y - r - 6 - size },
      { tx: g.x + r + 2, ty: g.y - r - 6 - size },
      { tx: g.x - w / 2, ty: g.y + r + 5 + size * 1.8 },
    ];
    const boxes = spots.map((c) => textBox(c.tx, c.ty, w, size));
    const b = claim(v, p, boxes, 'mark', text, { id: g.id }) ?? null;
    if (b) {
      const c = spots[boxes.indexOf(b)];
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pal.halo;
      ctx.lineWidth = 3;
      ctx.strokeText(text, c.tx, c.ty);
      ctx.fillStyle = ink;
      ctx.fillText(text, c.tx, c.ty);
      ctx.restore();
      label = b;
    }
  }
  // поле не меньше least × least (касание — 44): кольцо — по центру, подпись — по высоте
  const grow = (h: Rect): Rect => ({
    x: h.w < least ? h.x - (least - h.w) / 2 : h.x,
    y: h.h < least ? h.y - (least - h.h) / 2 : h.y,
    w: Math.max(h.w, least),
    h: Math.max(h.h, least),
  });
  return [ring, ...(label ? [label] : [])].map((h) => ({ ...grow(h), id: g.id, role, why, cx: g.x, cy: g.y }));
}

/** Места колец и ролей концов выбранной связи в этом кадре (Д12): заняты раньше подписей звёзд. */
const endPlaces = new WeakMap<object, Map<string, { tx: number; ty: number } | null>>();
/** Поля колец (у звёзд и призраков) и ролей концов выбранной связи этого кадра, px холста (Д12; для проверок). */
const endRects = new WeakMap<object, { id: string; kind: 'ring' | 'role'; box: Rect }[]>();
export const selectedEndRects = (v: object) => endRects.get(v) ?? [];
/** Радиус кольца конца выбранной связи у звезды лица. */
const endRing = (q: { magnitude: number; sex: string }, zoom: number) => starRadius(q.magnitude, zoom) + (q.sex === 'f' ? 6.5 : 5);

/**
 * Д12: кольца концов выбранной связи и их роли («отец», «дочь») проходят общую проверку наложений раньше подписей звёзд:
 * чужое имя не ложится ни на кольцо, ни на роль (своё имя лица стоит у своей звезды, как прежде: место кольца — его,
 * Placer owner). Кольца призраков — тоже. Место роли, не нашедшей места, — null: роль не рисуется (она есть в карточке
 * связи), а не ложится на имя.
 */
export function reserveSelectedLink(v: SkyContext, p: Pass) {
  endPlaces.delete(v);
  endRects.delete(v);
  const key = p.s.link;
  if (!key) return;
  const rects: { id: string; kind: 'ring' | 'role'; box: Rect }[] = [];
  const { cam } = v;
  const vp = cam.vp;
  const size = mapSize(T_MAP_S, v.coarse);
  const out = new Map<string, { tx: number; ty: number } | null>();
  for (const g of selectedRoutes(v, p.links, key).ghosts) {
    if (g.x < vp.l || g.x > vp.r || g.y < v.openTop || g.y > vp.b) continue;
    const r = g.r + 3;
    const ring = { x: g.x - r - 1, y: g.y - r - 1, w: 2 * r + 2, h: 2 * r + 2 };
    p.placer.add(ring, false, 0, g.id);
    rects.push({ id: g.id, kind: 'ring', box: ring });
  }
  for (const e of linkRoles(key)) {
    const i = v.indexOf(e.id);
    const q = byId.get(e.id);
    if (!q || i === undefined || !v.drawn(i) || v.hides(e.id)) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    if (x < vp.l || x > vp.r || y < v.openTop || y > vp.b) continue;
    const r = endRing(q, p.zoomScale);
    const ring = { x: x - r - 2, y: y - r - 2, w: 2 * r + 4, h: 2 * r + 4 };
    p.placer.add(ring, false, 0, e.id);
    rects.push({ id: e.id, kind: 'ring', box: ring });
    if (!e.role || !p.s.layers.labels) continue;
    v.ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
    const w = v.ctx.measureText(e.role).width;
    // под звездой, над ней, справа, слева — и на строку дальше
    const spots = [
      { tx: x - w / 2, ty: y + r + 3 + size * 0.8 },
      { tx: x - w / 2, ty: y - r - 4 },
      { tx: x + r + 4, ty: y + size * 0.3 },
      { tx: x - r - 4 - w, ty: y + size * 0.3 },
      { tx: x - w / 2, ty: y + r + 5 + size * 1.8 },
      { tx: x - w / 2, ty: y - r - 6 - size },
    ];
    const boxes = spots.map((c) => textBox(c.tx, c.ty, w, size));
    const b = claim(v, p, boxes, 'mark', e.role, { id: e.id });
    out.set(e.id, b ? spots[boxes.indexOf(b)] : null);
    if (b) rects.push({ id: e.id, kind: 'role', box: b });
  }
  endPlaces.set(v, out);
  endRects.set(v, rects);
}

/**
 * Выбранная связь (§ 8): путь — жёлтым (ночью #F2E600 2,5 px со свечением 5 и 9 px; днём — маркер #FCDA2D 9 px под
 * линией --ink 2,2 px), на концах — кольца с ролями курсивом («отец», «мать», «сын»); конец за краем — указатель у кромки
 * «‹ Иаков, отец». Рисуется поверх неба. Возвращает место связи в кадре (null — связь не выбрана).
 */
export function drawSelectedLink(v: SkyContext, p: Pass): SelectedLinkInfo | null {
  const key = p.s.link;
  if (!key) {
    putLinkGhosts([]);
    return null;
  }
  const { ctx, cam, pal } = v;
  const night = !!pal.glow;
  const { all: routes, core, ghosts: spots } = selectedRoutes(v, p.links, key);
  const roles = linkRoles(key);
  ctx.save();
  // путь идёт по следам концов, а на следе у звезды стоит имя: жёлтый подписей не закрывает (Я24) — под подписью он
  // прерывается, как след (labels.ts, knockTrail)
  const hit = (b: Rect) =>
    routes.some((r) => {
      for (let k = 0; k + 3 < r.length; k += 2) {
        const x0 = Math.min(r[k], r[k + 2]) - 2;
        const x1 = Math.max(r[k], r[k + 2]) + 2;
        const y0 = Math.min(r[k + 1], r[k + 3]) - 2;
        const y1 = Math.max(r[k + 1], r[k + 3]) + 2;
        if (x1 >= b.x && x0 <= b.x + b.w && y1 >= b.y && y0 <= b.y + b.h) return true;
      }
      return false;
    });
  // и ромбов других союзов на пути (лестница союзов идёт мимо них); свой ромб — поверх пути, жёлтым (решение 87)
  const own = key.kind === 'child' || key.kind === 'union' || key.kind === 'spouse' ? key.union : null;
  const holes = routes.length ? v.ledger.boxes.filter((b) => (b.kind === 'star' || (b.kind === 'plate' && !(b.text === '' && b.id === own))) && hit(b)) : [];
  if (holes.length && typeof ctx.clip === 'function') {
    ctx.beginPath();
    ctx.rect(-10, -10, cam.w + 20, cam.h + 20);
    for (const h of holes) ctx.rect(h.x - 1, h.y - 1, h.w + 2, h.h + 2);
    ctx.clip('evenodd');
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // все ломаные связи — одним путём на слой: где пути родителей идут по общему стволу, свечение не складывается
  const trace = () => {
    ctx.beginPath();
    for (const pts of routes) {
      ctx.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
    }
    ctx.stroke();
  };
  const layers: [string, number][] = night
    ? [[alpha(LINK_YELLOW.night, 0.16), 9], [alpha(LINK_YELLOW.night, 0.3), 5], [LINK_YELLOW.night, 2.5]]
    : [[alpha(LINK_YELLOW.day, 0.9), 9], [pal.ink, 2.2]];
  if (routes.length)
    for (const [color, w] of layers) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      trace();
    }
  ctx.restore();
  // ромб союза выбранной связи — поверх пути, жёлтым (решение 87: ромб берёт цвет своих линий)
  const d = p.links;
  if (own && d && routes.length) {
    const R = d.frame.layout === 'family' ? NODE_R_FAMILY : NODE_R_MAP;
    for (const n of d.frame.nodes) {
      if (n.union !== own || n.kind !== 'union') continue;
      const x = n.x + d.dx;
      const y = n.y + d.dy;
      if (x - R < v.letterW || x + R > cam.w || y - R < v.openTop || y + R > cam.vp.b) continue;
      const look = nodeLook(v, p, n, true);
      paintUnion(ctx, x, y, R, { open: n.open, halo: pal.sky, theme: night ? 'night' : 'day', a: 1, color: look.color, edge: look.edge });
    }
  }
  // середина пути в окне: к ней встаёт карточка связи
  let sx = 0;
  let sy = 0;
  let n = 0;
  const vp = cam.vp;
  for (const r of core.length ? core : routes)
    for (let k = 0; k + 1 < r.length; k += 2)
      if (r[k] >= vp.l && r[k] <= vp.r && r[k + 1] >= vp.t && r[k + 1] <= vp.b) {
        sx += r[k];
        sy += r[k + 1];
        n++;
      }
  // концы: кольца на экране, указатели у кромки за краем
  const ends: SelectedLinkInfo['ends'] = [];
  const edges: SelectedLinkInfo['edges'] = [];
  const size = mapSize(T_MAP_S, v.coarse);
  const ink = night ? LINK_YELLOW.night : pal.ink;
  const ghosts: LinkGhost[] = [];
  const ghostHits: SelectedLinkInfo['ghosts'] = [];
  const ks = linkKeyString(key) ?? '';
  for (const e of roles) {
    const i = v.indexOf(e.id);
    const q = byId.get(e.id);
    if (!q) continue;
    if (i === undefined || !v.drawn(i) || v.hides(e.id)) {
      // конец не нарисован: вне показа или спрятан свёрткой (К3) — призрак: пунктирное кольцо «лицо нарисовано не
      // здесь» в его год, подпись «Илий, отец — вне показа»
      const f = foldsHiding(e.id);
      const why: GhostWhy = f.desc.length || f.groups.length ? 'folded' : 'show';
      ghosts.push({ id: e.id, role: e.role, why, ks });
      const g = spots.find((x) => x.id === e.id);
      if (g) {
        ghostHits.push(...drawGhostEnd(v, p, g, q.name, e.role, why, ink));
      }
      continue;
    }
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    const on = x >= vp.l && x <= vp.r && y >= v.openTop && y <= vp.b;
    if (on) {
      const r = endRing(q, p.zoomScale);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = night ? LINK_YELLOW.night : pal.ink;
      if (!night) {
        ctx.strokeStyle = alpha(LINK_YELLOW.day, 0.9);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = 1.6;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // роль курсивом — под звездой, иначе над ней или сбоку: место занято до подписей звёзд (Д12, reserveSelectedLink)
      const c = e.role && p.s.layers.labels ? endPlaces.get(v)?.get(e.id) : null;
      if (c) {
        ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
        ctx.save();
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = pal.halo;
        ctx.lineWidth = 3;
        ctx.strokeText(e.role, c.tx, c.ty);
        ctx.fillStyle = ink;
        ctx.fillText(e.role, c.tx, c.ty);
        ctx.restore();
      }
      ends.push({ id: e.id, role: e.role, x, y, on: true });
      continue;
    }
    // указатель у кромки: «‹ Иаков, отец» слева, «Иаков, отец ›» справа, «↑ …» и «↓ …» сверху и снизу
    const text0 = e.role ? `${q.name}, ${e.role}` : q.name;
    const left = x < vp.l;
    const right = x > vp.r;
    const text = left ? `‹ ${text0}` : right ? `${text0} ›` : y < v.openTop ? `↑ ${text0}` : `↓ ${text0}`;
    ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
    const w = ctx.measureText(text).width;
    const tx = left ? v.letterW + 6 : right ? vp.r - 6 - w : Math.max(v.letterW + 6, Math.min(vp.r - 6 - w, x - w / 2));
    const ty = left || right ? Math.max(v.openTop + size + 4, Math.min(vp.b - 6, y + size * 0.35)) : y < v.openTop ? v.openTop + size + 6 : vp.b - 8;
    const box = textBox(tx, ty, w, size);
    ctx.save();
    ctx.fillStyle = night ? alpha(pal.sky, 0.85) : alpha(LINK_YELLOW.day, 0.9);
    ctx.fillRect(box.x - 3, box.y - 1, box.w + 6, box.h + 2);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink;
    ctx.fillText(text, tx, ty);
    ctx.restore();
    p.placer.add(box);
    const least = v.coarse ? 44 : 24;
    const hit = { x: box.x - 3, y: box.y - Math.max(0, (least - box.h) / 2), w: box.w + 6, h: Math.max(box.h, least), id: e.id };
    edges.push(hit);
    ends.push({ id: e.id, role: e.role, x: tx + w / 2, y: ty - size * 0.35, on: false });
    ghosts.push({ id: e.id, role: e.role, why: 'edge', ks });
  }
  putLinkGhosts(ghosts);
  return { ks, ghosts: ghostHits, ends, x: n ? sx / n : null, y: n ? sy / n : null, segs: routes.length, routes: routes.map((r) => r.map((q) => Math.round(q * 10) / 10)), edges };
}
