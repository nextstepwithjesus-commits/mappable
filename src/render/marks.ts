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
import { branchColor, branchDash, branchFade, branchFloor, KIN_GOLD, KIN_GOLD_UNDER, type MapTheme } from './branches.ts';
import { claim, putLabel, textBox } from './labels.ts';
import { beadAt, drawBranchLabels, drawKeyLineNames, drawLineNames, drawLineNotes, drawMt1Women } from './ribbons.ts';
import type { LineStep } from '../engine/layout.ts';
import type { Rect } from './rect.ts';
import type { KinStep } from '../engine/kinship.ts';
import type { Emphasis, Pass, SkyContext, SkyState } from './sky.ts';
import { linkShown, trailOf, type LifeTrail, type LinkDraw } from './trails.ts';
import { NODE_R_FAMILY, NODE_R_MAP, routeOver, segmentsOf, type LinkPath, type Seg } from './links.ts';
import { linkKeyString, type LinkKey } from '../engine/linkkey.ts';
import { linkRoles } from '../ui/linkwords.ts';
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

/** Как рисовать потомка по ветви в этом кадре: цвет ветви (#rrggbb), яркость поколения, штрих следа. */
export interface BranchPaint {
  color: string;
  a: number;
  dash: readonly number[];
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
        out = { color, a: branchFade(b.gen, grounds.length ? branchFloor(color, grounds) : 0), dash: branchDash(b.branch), branch: b.branch, gen: b.gen };
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

/** Вид шага пути на небе: кровный и брак — сплошной, по закону — штрих, по термину Писания и по толкованию — точки. */
export type StepLook = 'blood' | 'legal' | 'term';
export function stepLook(st: Pick<KinStep, 'kind' | 'claim' | 'interpretive'>): StepLook {
  if (st.interpretive || st.kind === 'kin') return 'term';
  // брак — сплошной (этап 11, Г10: штрих — только иное происхождение: по закону, усыновление, левират)
  if (st.claim === 'legal' || st.claim === 'adoptive' || st.claim === 'levirate') return 'legal';
  return 'blood';
}
const STEP_DASH: Record<StepLook, number[]> = { blood: [], legal: [6, 3], term: [0.5, 4.5] };

/**
 * Ломаная шага: от родителя вдоль его следа до года рождения ребёнка, затем отводом к ребёнку (как связь на небе);
 * вверх — наоборот; брак и родство по термину — прямой отрезок. a и b — звёзды from и to.
 */
export function stepRoute(kind: KinStep['kind'], a: { x: number; y: number }, b: { x: number; y: number }, trunk?: number | null): { x: number; y: number }[] {
  // ствол связи (src/render/links.ts): путь идёт по нему, а не сквозь звезду ребёнка (этап 11, § 2: «те же маршруты»)
  if (kind === 'down') return trunk != null && trunk < b.x - 1 ? [a, { x: trunk, y: a.y }, { x: trunk, y: b.y }, b] : [a, { x: b.x, y: a.y }, b];
  if (kind === 'up') return trunk != null && trunk < a.x - 1 ? [a, { x: trunk, y: a.y }, { x: trunk, y: b.y }, b] : [a, { x: a.x, y: b.y }, b];
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
 * Путь родства на небе (E5; MAP-18, UX-11): ломаная 2 px цвета --ink на подложке неба; кровные шаги и брак — сплошные,
 * по закону — штрихом, по термину Писания и по толкованию — точками (этап 11, Г10). Рисуется под звёздами: звёзды пути
 * лежат на ломаной, как бусины.
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
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2;
  for (const r of routes) {
    const dash = STEP_DASH[stepLook(r.st)];
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
    const bend = Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) * 0.25 + 12);
    const cx = Math.min(a.x, b.x) - bend;
    const cy = (a.y + b.y) / 2;
    goldArc(v, a, { x: cx, y: cy }, b);
    drawn?.add(`${e.from}>${e.to}:${e.rel}`);
    if (!p.s.layers.labels) continue;
    // середина дуги (t = 0,5) и термин слева от неё
    const mx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x;
    const my = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
    ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
    const w = ctx.measureText(e.rel).width;
    const spots = [{ tx: mx - w - 4, ty: my + size * 0.35 }, { tx: mx + 4, ty: my + size * 0.35 }];
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
}

/** Ломаные выбранной связи: весь путь (рисуется жёлтым) и его ядро — путь самой связи без хвостов к родителям (к середине ядра встаёт карточка связи). */
export interface SelectedRoutes {
  all: number[][];
  core: number[][];
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
  const none: SelectedRoutes = { all: [], core: [] };
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
  return { all: got.all.map(shift), core: got.core.map(shift) };
}

/** Пути выбранной связи в px кадра связей. */
function frameRoutes(v: SkyContext, d: LinkDraw, key: LinkKey, ks: string): SelectedRoutes {
  const all: number[][] = [];
  const core: number[][] = [];
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
  if (key.kind === 'step') {
    for (const q of paths) if (q.kind === 'ribbon' && q.ks === ks) all.push([...q.pts]);
    return { all, core: all };
  }
  if (key.kind === 'kin') {
    const a = star(key.a);
    const b = star(key.b);
    if (a && b) all.push([a.x, a.y, b.x, b.y]);
    return { all, core: all };
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
  if (key.kind === 'union') {
    for (const q of paths) if (q.union === u) core.push([...q.pts]);
    all.push(...core);
    for (const id of parents) {
      const r = parentRoute(id);
      if (r) all.push(r);
    }
    return { all, core };
  }
  if (key.kind === 'spouse') {
    for (const q of paths) if (q.ks === ks) core.push([...q.pts]);
    all.push(...core);
    for (const id of parents) {
      const r = parentRoute(id);
      if (r) all.push(r);
    }
    return { all, core };
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
  return { all, core };
}

/**
 * Выбранная связь (§ 8): путь — жёлтым (ночью #F2E600 2,5 px со свечением 5 и 9 px; днём — маркер #FCDA2D 9 px под
 * линией --ink 2,2 px), на концах — кольца с ролями курсивом («отец», «мать», «сын»); конец за краем — указатель у кромки
 * «‹ Иаков, отец». Рисуется поверх неба. Возвращает место связи в кадре (null — связь не выбрана).
 */
export function drawSelectedLink(v: SkyContext, p: Pass): SelectedLinkInfo | null {
  const key = p.s.link;
  if (!key) return null;
  const { ctx, cam, pal } = v;
  const night = !!pal.glow;
  const { all: routes, core } = selectedRoutes(v, p.links, key);
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
  for (const e of roles) {
    const i = v.indexOf(e.id);
    const q = byId.get(e.id);
    if (i === undefined || !q || !v.drawn(i)) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    const on = x >= vp.l && x <= vp.r && y >= v.openTop && y <= vp.b;
    if (on) {
      const r = starRadius(q.magnitude, p.zoomScale) + (q.sex === 'f' ? 6.5 : 5);
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
      // роль курсивом — под звездой, иначе над ней или справа
      if (e.role && p.s.layers.labels) {
        ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
        const w = ctx.measureText(e.role).width;
        const spots = [
          { tx: x - w / 2, ty: y + r + 3 + size * 0.8 },
          { tx: x - w / 2, ty: y - r - 4 },
          { tx: x + r + 4, ty: y + size * 0.3 },
          { tx: x - r - 4 - w, ty: y + size * 0.3 },
        ];
        const boxes = spots.map((c) => textBox(c.tx, c.ty, w, size));
        const b = claim(v, p, boxes, 'mark', e.role, { id: e.id }) ?? boxes[0];
        const c = spots[boxes.indexOf(b)];
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
  }
  return { ks: linkKeyString(key) ?? '', ends, x: n ? sx / n : null, y: n ? sy / n : null, segs: routes.length, routes: routes.map((r) => r.map((q) => Math.round(q * 10) / 10)), edges };
}
