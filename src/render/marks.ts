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
import { branchColor, branchFade, branchFloor, KIN_GOLD, type MapTheme } from './branches.ts';
import { claim, putLabel, textBox } from './labels.ts';
import { beadAt, drawBranchLabels, drawKeyLineNames, drawLineNames, drawLineNotes, drawMt1Women } from './ribbons.ts';
import type { LineStep } from '../engine/layout.ts';
import type { Rect } from './rect.ts';
import { genitive, type KinStep } from '../engine/kinship.ts';
import type { Emphasis, Pass, SkyContext, SkyState } from './sky.ts';
import { linkShown, trailOf, type LifeTrail, type LinkDraw } from './trails.ts';
import { kidStyle, mainUnion, NODE_R_FAMILY, NODE_R_MAP, otherReading, routeOver, segmentsOf, TRUNK_LEAD, type LinkPath, type Seg } from './links.ts';
import { LINK_DASH } from './trails.ts';
import { linkKeyString, type LinkKey } from '../engine/linkkey.ts';
import { childRole, linkMarks, linkRoles } from '../ui/linkwords.ts';
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
  // тот же объект для того же лица, пока данные те же: кадр за кадром выделение одно (ярусы связей держатся по нему; С1)
  const was = familyMemo.get(id);
  if (was && was.graph === graph && was.unions === unions) return was.h;
  const h = familyHighlightOf(id);
  if (familyMemo.size >= 16) familyMemo.delete(familyMemo.keys().next().value!);
  familyMemo.set(id, { graph, unions, h });
  return h;
}
const familyMemo = new Map<string, { graph: object; unions: object; h: Highlight }>();
function familyHighlightOf(id: string): Highlight {
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
  // этап 14 (решение 137, G4): второй родитель союза с детьми, не записанный супругом (Фамарь у Иуды, дочери Лота,
  // царицы-матери), — тоже в выделении: мать детей выбранного не гаснет в фон, союз с ней горит целиком
  for (const u of unions.of.get(id) ?? []) {
    if (!u.kids.length || u.id.includes('~')) continue;
    for (const o of [u.a, u.b]) if (o && o !== id && !hl.has(o)) hl.set(o, 'path');
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

/** Потомки других ветвей при наведённом ромбе гаснут до стольких (решение 172, R1-09; как дети другой матери, MAP-74). */
export const UNION_HOVER_DIM = 0.4;
/**
 * Яркость с наведённым ромбом союза (решение 172, R1-09): у родителя с несколькими союзами с детьми его потомки по
 * другим союзам (ветви решения 69) гаснут до UNION_HOVER_DIM — видно, какие дети от этой матери. Родитель — выбранное
 * лицо, если он супруг в этом союзе, иначе отец союза. Небо (sky.ts) вкладывает её в цепочку яркости.
 */
export function unionHoverDim(s: Pick<SkyState, 'plateMarks' | 'selected' | 'model'>, f: (id: string) => number): (id: string) => number {
  const uid = s.plateMarks?.hover;
  if (!uid) return f;
  const u = unions.byId.get(uid);
  if (!u || !u.kids.length) return f;
  const par = s.selected && (u.a === s.selected || u.b === s.selected) ? s.selected : (u.a ?? u.b);
  if (!par) return f;
  const bm = branchMapOf(par, s.model?.id ?? '');
  const k = bm.keys.indexOf(uid);
  // ветви по детям (союз с детьми один) — гасить нечего
  if (k < 0) return f;
  return (id) => {
    const b = bm.desc.get(id);
    return b && b.branch !== k ? Math.min(UNION_HOVER_DIM, f(id)) : f(id);
  };
}

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
// этап 14, решение 138: родство словом Писания — сплошной золотистой линией по дуге; точки — только толкование
export const STEP_DASH: Record<StepLook, number[]> = { blood: [], legal: [6, 3], term: [], interp: [0.5, 4.5] };

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
/**
 * Слои активной связи (выбранная связь, путь родства; решения 88, 167): ночью — жёлтый со свечением, днём — линия цвета
 * текста на жёлтой подложке. Цвет и ширина слоёв, снизу вверх.
 */
export function activeLayers(pal: SkyContext['pal']): [string, number][] {
  return pal.glow ? [[alpha(LINK_YELLOW.night, 0.16), 9], [alpha(LINK_YELLOW.night, 0.3), 5], [LINK_YELLOW.night, 2.5]] : [[alpha(LINK_YELLOW.day, 0.9), 9], [pal.ink, 2.2]];
}

export function drawKinPath(v: SkyContext, p: Pass) {
  const steps = p.s.kinSteps;
  if (!steps?.length) return;
  const { ctx, pal, cam } = v;
  const routes = kinRoutes(v, steps, p.links);
  if (!routes.length) return;
  // путь — одним видом активной связи (решение 167, R2-1): «мать» и «брат» не разными цветами; толкование — точками
  // верхнего слоя, иное происхождение — штрихом (словарь начертаний, решение 94); у кольца выбранного путь обрезан
  const hole = ringHoles(v, p);
  clipHoles(ctx, cam, hole);
  ctx.lineJoin = 'round';
  const trace = (pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  };
  const layers = activeLayers(pal);
  layers.forEach(([color, w], i) => {
    const top = i === layers.length - 1;
    for (const r of routes) {
      const look = stepLook(r.st);
      const dash = top && look !== 'term' ? STEP_DASH[look] : [];
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.setLineDash(dash);
      ctx.lineCap = dash.length ? 'round' : top ? 'butt' : 'round';
      trace(r.pts);
      ctx.stroke();
    }
  });
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
export function drawRings(v: SkyContext, p: Pass, o: OverlayOpts = {}) {
  const { ctx, cam, pal } = v;
  const s = p.s;
  const scope = overlayScope(v, p, o);
  const ring = (id: string, out: number, width = 2, color = pal.focus, gap?: number) => {
    const at = ringCenter(v, id);
    if (!at) return;
    const q = byId.get(id)!;
    const r = starRadius(q.magnitude, p.zoomScale) + (gap ?? ringGap(q)) + out;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  // призрак жены: дуга от знака в родном роду к её месту у мужа — золотистой дугой семьи (решение 89)
  const ghosts: string[] = [];
  const drawn = new Set<string>();
  // в режиме «Родство» гаснут все дуги, не входящие в путь (решение 167, R2-1): путь — одним видом активной связи
  const arcs = !s.kinSteps?.length;
  // дуги и связи обрезаются у кольца выбранного (+2 px; решение 167, V-5)
  const hole = ringHoles(v, p);
  if (hole.length) clipHoles(ctx, cam, hole);
  for (const w of arcs ? wifeArcs(v, p) : []) {
    goldArc(v, w.a, w.c, w.b);
    ghosts.push(`ghost>${w.id}`);
  }
  // родство по термину Писания (MAP-17): у лица под указателем и у выбранного — золотистая дуга к названному
  // родственнику и термин («сестра»); это соседство по слову Писания, не утверждение о родителях (П-8; решение 89)
  const seen = new Set<string>();
  if (arcs && cam.ky >= 5) for (const id of new Set([s.hovered, s.selected])) if (id) drawKinArcs(v, p, id, seen, drawn, scope.say);
  // золотистые дуги кадра — для проверок приёмки (canvas[data-kin-arcs]): «от>к:слово» и «ghost>лицо»
  const ds = (ctx.canvas as { dataset?: DOMStringMap } | undefined)?.dataset;
  if (ds) {
    const t = [...ghosts, ...drawn].join('|');
    if (ds.kinArcs !== t) ds.kinArcs = t;
  }
  if (arcs) drawPersonGhosts(v, p, scope.say);
  else personGhostHits.set(v, []);
  if (hole.length) ctx.restore();
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
  // фокус клавиатуры (этап 14, решение 149; M5) — угловые скобки, а не второе кольцо: по форме отличается от выбора
  if (s.focus) {
    const at = ringCenter(v, s.focus);
    const q = byId.get(s.focus);
    if (at && q) focusBrackets(ctx, at.x, at.y, focusHalf(q, p.zoomScale, s.focus === s.selected || s.focus === s.second), pal.ink);
  }
  // наведённая звезда — тонкое кольцо: звезда отвечает на указатель
  if (s.hovered && s.hovered !== s.selected && s.hovered !== s.second && s.hovered !== s.focus) {
    const i = v.indexOf(s.hovered);
    if (i !== undefined && v.drawn(i)) ring(s.hovered, 0, 1, pal.ink, HOVER_GAP[byId.get(s.hovered)!.sex === 'f' ? 'f' : 'm']);
  }
  // отмеченные одноимённые
  for (const id of s.pins) {
    const i = v.indexOf(id);
    if (i === undefined || !v.drawn(i)) continue;
    ring(id, 0, 1.5, pal.ink, PIN_GAP[byId.get(id)!.sex === 'f' ? 'f' : 'm']);
  }
  scope.end();
}

// ---------- слой поверх подписей до рисования (этап 14, решение 139; STAGE14 § 5, контракт 1) ----------

/** Знак фокуса клавиатуры (решение 149): четыре уголка — длина плеча, толщина, зазор снаружи кольца выбора, px. */
export const FOCUS_MARK = { arm: 5, line: 1.5, gap: 2.5 };

/**
 * Полусторона квадрата уголков фокуса у знака q: снаружи кольца выбора (у выбранного) или вокруг звезды — с зазором
 * кольца выбора (у невыбранного), px.
 */
export function focusHalf(q: { magnitude: number; sex: string }, zoom: number, selected: boolean): number {
  const r = starRadius(q.magnitude, zoom);
  return selected ? r + ringGap(q) + 1 + FOCUS_MARK.gap : r + ringGap(q);
}

/** Угловые скобки фокуса клавиатуры вокруг точки (x, y): квадрат полусторона h, четыре уголка (решение 149; M5). */
export function focusBrackets(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  const a = Math.min(FOCUS_MARK.arm, h);
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = FOCUS_MARK.line;
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const cx = x + sx * h;
    const cy = y + sy * h;
    ctx.moveTo(cx - sx * a, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy - sy * a);
  }
  ctx.stroke();
  ctx.restore();
}

/** Зазор кольца выбора, фокуса и конца связи от края знака, px: у женщины — за её кольцом. */
const ringGap = (q: { sex: string }) => (q.sex === 'f' ? 6.5 : 5);
/** Зазор тонкого кольца наведения и сплошного кольца отмеченного одноимённого. */
const HOVER_GAP = { f: 6.2, m: 4 } as const;
const PIN_GAP = { f: 8.5, m: 7 } as const;

/**
 * Где у лица кольцо: звезда на небе — её центр; звезды нет (режим «только линии») — знак-спутница (мать у развилки,
 * женщины Мф 1; UX-46); скрыто набором или свёрткой (J4, J5) — null: пустое кольцо читалось бы как сбой.
 */
function ringCenter(v: SkyContext, id: string): { x: number; y: number } | null {
  const i = v.indexOf(id);
  if (i === undefined || v.hides(id)) return null;
  if (v.drawn(i)) return { x: v.cam.sx(v.X0[i]), y: v.cam.sy(v.nodes[i].lane) };
  return beadAt(v, id);
}

/**
 * Наружный радиус наибольшего кольца лица id в этом кадре — от центра знака до внешнего края линии кольца, px: выбор
 * и второе лицо, фокус клавиатуры (у выбранного — снаружи), наведение, отметка одноимённых, отклик набора, конец
 * выбранной связи. 0 — колец у лица нет. Подписи (labels.ts) держат зазор от него (решение 140); числа — те же, что у
 * drawRings и drawSelectedLink.
 */
export function ringOuter(v: SkyContext, p: Pass, id: string): number {
  const q = byId.get(id);
  if (!q) return 0;
  const s = p.s;
  const r0 = starRadius(q.magnitude, p.zoomScale);
  const f = q.sex === 'f' ? 'f' : 'm';
  let out = 0;
  const take = (gap: number, extra: number, width: number) => {
    out = Math.max(out, r0 + gap + extra + width / 2);
  };
  if (id === s.selected || id === s.second) take(ringGap(q), 0, 2);
  if (id === s.focus) out = Math.max(out, focusHalf(q, p.zoomScale, s.focus === s.selected || s.focus === s.second) + FOCUS_MARK.line / 2);
  if (id === s.hovered && id !== s.selected && id !== s.second && id !== s.focus) take(HOVER_GAP[f], 0, 1);
  if (s.pins.has(id)) take(PIN_GAP[f], 0, 1.5);
  if (s.workFlash?.id === id) take(ringGap(q), s.reduced ? 3 : 8, 1.5);
  if (s.link && selectedEnds(v, p).some((e) => e.id === id && e.drawn && e.on)) take(ringGap(q), 0, v.pal.glow ? 2 : 5);
  return out;
}

/** Зазор линий от кольца выбранного, px (решение 167, V-5): дуги и связи не входят в кольцо. */
export const RING_CLEAR = 2;
/** Круги, внутри которых линии слоя не рисуются: кольца выбранного и второго лица (+RING_CLEAR), px холста. */
export function ringHoles(v: SkyContext, p: Pass): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  for (const id of [p.s.selected, p.s.second]) {
    if (!id) continue;
    const at = ringCenter(v, id);
    const r = ringOuter(v, p, id);
    if (at && r > 0) out.push({ x: at.x, y: at.y, r: r + RING_CLEAR });
  }
  return out;
}
/** ctx.save() и вырез кругов holes из области рисования (evenodd); снять — ctx.restore(). */
export function clipHoles(ctx: CanvasRenderingContext2D, cam: { w: number; h: number }, holes: readonly { x: number; y: number; r: number }[]) {
  ctx.save();
  if (typeof ctx.clip !== 'function') return;
  ctx.beginPath();
  ctx.rect(-10, -10, cam.w + 20, cam.h + 20);
  for (const h of holes) {
    ctx.moveTo(h.x + h.r, h.y);
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
  }
  ctx.clip('evenodd');
}

/** Как рисовать слой поверх подписей (sky.ts): вырезы по подписям, текст — отдельным проходом, указатели у края. */
export interface OverlayOpts {
  /** прямоугольники текста (px холста): линии и кольца слоя под ними прерываются (решение 139); текст слоя не режется */
  cuts?: readonly Rect[];
  /**
   * текст слоя (термины дуг, роли концов, подписи призраков, указатели у края) — не сразу, а в drawOverlayText: весь
   * текст — последним проходом холста (решение 143). Место текста занимается сразу (claim), рисуется — позже
   */
  deferText?: boolean;
  /** указатели у края к концам выбранной связи рисует marks.ts (по умолчанию); false — их рисует рамка (frame.ts, контракт 4) */
  edges?: boolean;
}

/** Отложенный текст слоя поверх подписей по кадрам (ключ — Placer кадра: он один на кадр и общий для копий Pass). */
const textQueue = new WeakMap<object, (() => void)[]>();

/** Нарисовать отложенный текст слоя (OverlayOpts.deferText) этого кадра — после всех подписей (решение 143). */
export function drawOverlayText(_v: SkyContext, p: Pass) {
  const q = textQueue.get(p.placer);
  if (!q) return;
  textQueue.delete(p.placer);
  for (const f of q) f();
}

/**
 * Рамка слоя поверх подписей: вырезы (clip evenodd по прямоугольникам текста, как у жёлтого пути с решения 88) и куда
 * идёт текст слоя — сразу, после снятия выреза или в очередь drawOverlayText.
 */
function overlayScope(v: SkyContext, p: Pass, o: OverlayOpts): { say: (f: () => void) => void; end: () => void } {
  const { ctx, cam } = v;
  const cuts = o.cuts?.length && typeof ctx.clip === 'function' ? o.cuts : null;
  const later: (() => void)[] = [];
  let queue: (() => void)[] | null = null;
  if (o.deferText) {
    queue = textQueue.get(p.placer) ?? [];
    textQueue.set(p.placer, queue);
  }
  if (cuts) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-10, -10, cam.w + 20, cam.h + 20);
    for (const h of cuts) ctx.rect(h.x - 1, h.y - 1, h.w + 2, h.h + 2);
    ctx.clip('evenodd');
  }
  return {
    say: (f) => {
      if (queue) queue.push(f);
      else if (cuts) later.push(f);
      else f();
    },
    end: () => {
      if (cuts) ctx.restore();
      for (const f of later) f();
    },
  };
}

/** Дуга к призраку жены в родном роду у наведённого и выбранного лица (MAP-15): начало, вершина, конец, px холста. */
function wifeArcs(v: SkyContext, p: Pass): { id: string; a: { x: number; y: number }; c: { x: number; y: number }; b: { x: number; y: number } }[] {
  const { cam } = v;
  const s = p.s;
  const out: ReturnType<typeof wifeArcs> = [];
  if (!s.layers.ghosts || cam.ky < 5) return out;
  for (const id of new Set([s.hovered, s.selected])) {
    if (!id) continue;
    const gi = v.indexOf(`ghost:${id}`);
    const ri = v.indexOf(id);
    if (gi === undefined || ri === undefined || !v.drawn(gi) || !v.drawn(ri)) continue;
    const a = { x: cam.sx(v.X0[gi]), y: cam.sy(v.nodes[gi].lane) };
    const b = { x: cam.sx(v.X0[ri]), y: cam.sy(v.nodes[ri].lane) };
    const bend = Math.min(160, Math.abs(b.y - a.y) * 0.25 + 30);
    out.push({ id, a, c: { x: Math.min(a.x, b.x) - bend, y: (a.y + b.y) / 2 }, b });
  }
  return out;
}

/** Дуги родства словами Писания у наведённого и выбранного лица (MAP-17): ребро, начало, вершина, конец — px холста. */
interface KinArc {
  e: { from: string; to: string; rel: string };
  a: { x: number; y: number };
  c: { x: number; y: number };
  b: { x: number; y: number };
  /** ломаная дуги px холста; у обрывка — только его начало у лица в окне */
  pts: number[];
  /** обрывок к лицу вне окна (решение 167): лицо, конец обрывка и куда смотрит указатель */
  stub: { other: string; x: number; y: number; arrow: string } | null;
}
/** Обрывок дуги родства к лицу вне окна — длиной, px (решение 167, R1-08). */
const KIN_STUB = 28;
function kinArcs(v: SkyContext, id: string, seen: Set<string>): KinArc[] {
  const { cam } = v;
  const vp = cam.vp;
  const at = (x: string) => {
    const i = v.indexOf(x);
    return i === undefined || !v.drawn(i) ? null : { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane) };
  };
  const inWin = (q: { x: number; y: number }) => q.x >= Math.max(vp.l, v.letterW) && q.x <= vp.r && q.y >= v.openTop && q.y <= vp.b;
  const out: KinArc[] = [];
  for (const e of graph.kinOf.get(id) ?? []) {
    const k = `${e.from}|${e.to}|${e.rel}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const a = at(e.from);
    const b = at(e.to);
    if (!a || !b) continue;
    const c = kinArcCtrl(a, b);
    const full = arcPolyline(a, c, b);
    const ia = inWin(a);
    const ib = inWin(b);
    if (ia && ib) {
      out.push({ e, a, c, b, pts: full, stub: null });
      continue;
    }
    if (!ia && !ib) continue;
    // к лицу вне окна — обрывком у лица в окне: начало дуги на KIN_STUB px и указатель «↑ Ионафан, дядя» (R1-08)
    const pts = ia ? full : reversePts(full);
    const stub: number[] = [pts[0], pts[1]];
    let len = 0;
    for (let k = 2; k + 1 < pts.length && len < KIN_STUB; k += 2) {
      len += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
      stub.push(pts[k], pts[k + 1]);
    }
    const far = ia ? b : a;
    const near = ia ? a : b;
    const dx = far.x - near.x;
    const dy = far.y - near.y;
    const arrow = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? '↑' : '↓') : dx < 0 ? '←' : '→';
    out.push({ e, a, c, b, pts: stub, stub: { other: ia ? e.to : e.from, x: stub[stub.length - 2], y: stub[stub.length - 1], arrow } });
  }
  return out;
}
const reversePts = (pts: number[]) => {
  const out: number[] = [];
  for (let k = pts.length - 2; k >= 0; k -= 2) out.push(pts[k], pts[k + 1]);
  return out;
};

/** Маршрут слоя поверх подписей: ломаная px холста, известная до раскладки подписей (решение 139). */
export interface OverlayRoute {
  /**
   * ghost — дуга к призраку жены; kin — дуга родства словом Писания; parent — линия к призраку скрытого родителя (К3);
   * kinGhost — дуга к призраку родни (К5); link — выбранная связь; path — путь родства (рисуется под звёздами)
   */
  kind: 'ghost' | 'kin' | 'parent' | 'kinGhost' | 'link' | 'path';
  /** чей маршрут: лицо, у которого он нарисован; у выбранной связи — запись её ключа */
  id: string;
  /** x0, y0, x1, y1, … — px холста; дуги — ломаной не реже 6 px */
  pts: number[];
  /** полная ширина нарисованного с подложкой или свечением, px: подпись держится дальше половины */
  w: number;
}

/**
 * Маршруты дуг родства, призраков «вне показа», выбранной связи и пути родства этого кадра — до рисования, чтобы подписи
 * их обходили (решение 139; контракт 1 S1 → S2). Те же ломаные рисуют drawRings, drawSelectedLink и drawKinPath; места
 * призраков считаются один раз на кадр (ghostPlan) — до подписей, если их спросили раньше подписей.
 */
export function overlayRoutes(v: SkyContext, p: Pass): OverlayRoute[] {
  const s = p.s;
  const out: OverlayRoute[] = [];
  const goldW = KIN_ARC_W + 1;
  // в режиме «Родство» гаснут все дуги, кроме пути (решение 167): ни дуг семьи, ни призраков родни
  const arcs = !s.kinSteps?.length;
  if (arcs) for (const w of wifeArcs(v, p)) out.push({ kind: 'ghost', id: w.id, pts: arcPolyline(w.a, w.c, w.b), w: goldW });
  if (arcs && v.cam.ky >= 5) {
    const seen = new Set<string>();
    for (const id of new Set([s.hovered, s.selected])) if (id) for (const k of kinArcs(v, id, seen)) out.push({ kind: 'kin', id, pts: k.pts, w: goldW });
  }
  if (arcs) for (const g of ghostPlan(v, p)) out.push({ kind: g.kind === 'parent' ? 'parent' : 'kinGhost', id: g.of, pts: g.pts, w: g.kind === 'parent' ? 1 : goldW });
  if (s.link) {
    const ks = linkKeyString(s.link) ?? '';
    for (const r of selectedRoutes(v, p.links, s.link).all) if (r.length >= 4) out.push({ kind: 'link', id: ks, pts: r, w: 9 });
  }
  if (s.kinSteps?.length)
    for (const r of kinRoutes(v, s.kinSteps, p.links)) {
      const pts: number[] = [];
      for (const q of r.pts) pts.push(q.x, q.y);
      out.push({ kind: 'path', id: r.st.from, pts, w: 5 });
    }
  return out;
}

/**
 * Кольца призраков этого кадра (родня вне показа у выбранного и наведённого лица, концы выбранной связи вне показа):
 * центр и наружный радиус пунктирного кольца, px холста — до рисования, как overlayRoutes. Только в окне неба.
 */
export function overlayRings(v: SkyContext, p: Pass): { id: string; x: number; y: number; r: number }[] {
  const vp = v.cam.vp;
  const inWin = (g: GhostSpot) => g.x >= vp.l && g.x <= vp.r && g.y >= v.openTop && g.y <= vp.b;
  const out: { id: string; x: number; y: number; r: number }[] = [];
  for (const g of ghostPlan(v, p)) if (inWin(g.g)) out.push({ id: g.g.id, x: g.g.x, y: g.g.y, r: g.g.r + 3.75 });
  if (p.s.link) for (const g of selectedRoutes(v, p.links, p.s.link).ghosts) if (inWin(g)) out.push({ id: g.id, x: g.x, y: g.y, r: g.r + 3.75 });
  return out;
}

/** Толщина золотистой дуги семьи, px (решение 138: сплошная тонкая; жёлтое выбранной связи — 2,5 px со свечением). */
export const KIN_ARC_W = 1.25;

/**
 * Золотистая дуга семьи (этап 12, решение 89; этап 14, решение 138): кривая Безье a → c → b сплошной тонкой линией цвета
 * KIN_GOLD — родство словом Писания; точки на небе значат только толкование (без исключений). Ночью — со слабым
 * свечением, днём — на бледно-золотой подложке: дугу видно и на тёмном, и на светлом небе. Жёлтый выбранной связи —
 * другой: лимонный, толще и со свечением.
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
  // без свечения и без дневной подложки (решение 167, V-1, V-11): дуга — контекст, а не активный путь
  ctx.strokeStyle = KIN_GOLD[night ? 'night' : 'day'];
  ctx.lineWidth = KIN_ARC_W;
  ctx.setLineDash([]);
  trace();
  ctx.restore();
}

/**
 * Дуги родства по термину Писания у лица id (MAP-17): к каждому названному родственнику на небе — золотистая точечная
 * дуга (решение 89), у дуги — термин (кем приходится лицо у начала дуги: «Саруия — сестра Давида») тем же цветом.
 * Подпись — той же проверкой наложений. seen — уже нарисованные дуги (у наведённого и выбранного одна дуга — один раз).
 */
export function drawKinArcs(v: SkyContext, p: Pass, id: string, seen: Set<string> = new Set(), drawn?: Set<string>, say: (f: () => void) => void = (f) => f()) {
  const { ctx, pal } = v;
  const size = mapSize(T_MAP_S, v.coarse);
  const gold = KIN_GOLD[pal.glow ? 'night' : 'day'];
  for (const k of kinArcs(v, id, seen)) {
    const { e, a, c, b } = k;
    if (k.stub) goldLine(v, k.pts);
    else goldArc(v, a, c, b);
    drawn?.add(`${e.from}>${e.to}:${e.rel}`);
    if (!p.s.layers.labels) continue;
    // подписи дуг — прямым начертанием (Jost), а не курсивом ролей выбранной связи (решение 167, V-1)
    ctx.font = mapFont(T_MAP_S, { sans: true, coarse: v.coarse });
    // обрывок к лицу вне окна: «↑ Ионафан, дядя» (это лицо — дядя), «↑ сестра Давида» (лицо в окне — сестра) — у конца
    const text = k.stub ? (k.stub.other === e.from ? `${k.stub.arrow} ${nameOf(e.from)}, ${e.rel}` : `${k.stub.arrow} ${e.rel} ${genitive(nameOf(e.to), byId.get(e.to)?.sex === 'f' ? 'f' : 'm')}`) : e.rel;
    const w = ctx.measureText(text).width;
    const spots: { tx: number; ty: number }[] = [];
    if (k.stub) {
      const { x, y } = k.stub;
      spots.push({ tx: x + 4, ty: y + size * 0.35 }, { tx: x - w - 4, ty: y + size * 0.35 }, { tx: x - w / 2, ty: y - 5 }, { tx: x - w / 2, ty: y + size + 3 });
    } else
      // термин — у середины дуги (t = 0,5), слева или справа от неё; если там тесно — у других точек дуги
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const mx = (1 - t) * (1 - t) * a.x + 2 * t * (1 - t) * c.x + t * t * b.x;
        const my = (1 - t) * (1 - t) * a.y + 2 * t * (1 - t) * c.y + t * t * b.y;
        spots.push({ tx: mx - w - 4, ty: my + size * 0.35 }, { tx: mx + 4, ty: my + size * 0.35 });
      }
    const boxes = spots.map((q) => textBox(q.tx, q.ty, w, size));
    const got = claim(v, p, boxes, 'note', text);
    if (!got) continue;
    const q = spots[boxes.indexOf(got)];
    const font = ctx.font;
    say(() => {
      ctx.save();
      ctx.font = font;
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pal.halo;
      ctx.lineWidth = 3;
      ctx.strokeText(text, q.tx, q.ty);
      ctx.fillStyle = gold;
      ctx.fillText(text, q.tx, q.ty);
      ctx.restore();
    });
  }
}
const nameOf = (id: string) => byId.get(id)?.name ?? id;

/** Обрывок золотистой дуги (решение 167): та же линия, что goldArc, по ломаной px холста. */
function goldLine(v: Pick<SkyContext, 'ctx' | 'pal'>, pts: readonly number[]) {
  const { ctx, pal } = v;
  if (pts.length < 4) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.strokeStyle = KIN_GOLD[pal.glow ? 'night' : 'day'];
  ctx.lineWidth = KIN_ARC_W;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let k = 2; k + 1 < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
  ctx.stroke();
  ctx.restore();
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
  /** союзы чужих ромбов под путём: жёлтое под ними прерывается (решение 166) */
  nodeHoles?: string[];
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
function drawPersonGhosts(v: SkyContext, p: Pass, say: (f: () => void) => void = (f) => f()) {
  const out: SelectedLinkInfo['ghosts'] = [];
  personGhostHits.set(v, out);
  const { ctx, pal } = v;
  const ink = pal.ink2;
  for (const g of ghostPlan(v, p)) {
    if (g.kind === 'parent') {
      ctx.save();
      ctx.strokeStyle = alpha(ink, 0.9);
      ctx.lineWidth = 1;
      ctx.setLineDash(g.dash);
      ctx.beginPath();
      ctx.moveTo(g.pts[0], g.pts[1]);
      for (let k = 2; k < g.pts.length; k += 2) ctx.lineTo(g.pts[k], g.pts[k + 1]);
      ctx.stroke();
      ctx.restore();
    } else if (g.arc) goldArc(v, g.arc.a, g.arc.c, g.arc.b);
    out.push(...drawGhostEnd(v, p, g.g, g.name, g.role, g.why, ink, say));
  }
}

/** Призрак родни у выбранного или наведённого лица (К3, К5): где он, к кому, как к нему ведёт линия. */
interface GhostItem {
  /** parent — скрытый родитель (линия начертанием союза); kin — родня словами Писания (золотистая дуга) */
  kind: 'parent' | 'kin';
  /** лицо, у которого призрак */
  of: string;
  g: GhostSpot;
  name: string;
  role: string;
  why: GhostWhy;
  /** маршрут линии к призраку, px холста (у дуги — ломаной) */
  pts: number[];
  /** начертание линии к родителю (LINK_DASH союза) */
  dash: number[];
  /** дуга к родне: начало, вершина, конец */
  arc?: { a: { x: number; y: number }; c: { x: number; y: number }; b: { x: number; y: number } };
}

/** Места призраков родни этого кадра (ключ — Placer кадра): считаются один раз — до подписей, если их спросили раньше. */
const ghostPlans = new WeakMap<object, GhostItem[]>();

/**
 * Места призраков родни у выбранного и наведённого лица (К3, К5): между строк на полстроки от лица — в сторону его
 * настоящей полосы, если там свободно (другой призрак, звезда, занятое место), иначе дальше или по другую сторону.
 * Считается один раз на кадр: overlayRoutes спрашивает до подписей — тогда подписи обходят призраки, а не наоборот.
 */
function ghostPlan(v: SkyContext, p: Pass): GhostItem[] {
  const was = ghostPlans.get(p.placer);
  if (was) return was;
  const plan: GhostItem[] = [];
  ghostPlans.set(p.placer, plan);
  const s = p.s;
  const { cam } = v;
  if (cam.ky < 5 || !s.layers.ghosts) return plan;
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
      // кольцо призрака — занятое место кадра: подписи, поставленные после плана, на него не ложатся
      const R = r + 4;
      p.placer.add({ x: x - R, y: y - R, w: 2 * R, h: 2 * R });
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
        plan.push({ kind: 'parent', of: id, g, name: q.name, role: q.sex === 'f' ? 'мать' : 'отец', why: why(par), pts: [g.x + g.r + 3, g.y, xs, g.y, xs, at.y, at.x, at.y], dash: LINK_DASH[kidStyle(u)] });
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
      const c = kinArcCtrl(a, b);
      // термин — кем приходится призрак (у начала дуги), иначе — только имя
      plan.push({ kind: 'kin', of: id, g, name: q.name, role: e.from === other ? e.rel : '', why: why(other), pts: arcPolyline(a, c, b), dash: [], arc: { a, c, b } });
    }
  }
  return plan;
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

/**
 * Пути выбранной связи в px кадра связей. Чужие ромбы на пути не обходятся (решение 166, R1-10: П-образные вырезы
 * читались заходом в те союзы): жёлтое идёт прямо поверх, а под чужим ромбом прерывается (drawSelectedLink, holes).
 */
function frameRoutes(v: SkyContext, d: LinkDraw, key: LinkKey, ks: string): SelectedRoutes {
  return baseRoutes(v, d, key, ks);
}

function baseRoutes(v: SkyContext, d: LinkDraw, key: LinkKey, ks: string): SelectedRoutes {
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
function drawGhostEnd(v: SkyContext, p: Pass, g: GhostSpot, name: string, role: string, why: GhostWhy, ink: string, say: (f: () => void) => void = (f) => f()): SelectedLinkInfo['ghosts'] {
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
    const font = ctx.font;
    say(() => {
      ctx.save();
      ctx.font = font;
      ctx.fillStyle = pal.glow ? alpha(pal.sky, 0.85) : alpha(LINK_YELLOW.day, 0.9);
      ctx.fillRect(box.x - 3, box.y - 1, box.w + 6, box.h + 2);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = ink;
      ctx.fillText(t, tx, ty);
      ctx.restore();
    });
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
      const font = ctx.font;
      say(() => {
        ctx.save();
        ctx.font = font;
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = pal.halo;
        ctx.lineWidth = 3;
        ctx.strokeText(text, c.tx, c.ty);
        ctx.fillStyle = ink;
        ctx.fillText(text, c.tx, c.ty);
        ctx.restore();
      });
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
const endPlaces = new WeakMap<object, Map<string, { tx: number; ty: number; text: string } | null>>();
/** Поля колец (у звёзд и призраков) и ролей концов выбранной связи этого кадра, px холста (Д12; для проверок). */
const endRects = new WeakMap<object, { id: string; kind: 'ring' | 'role'; box: Rect }[]>();
export const selectedEndRects = (v: object) => endRects.get(v) ?? [];
/** Радиус кольца конца выбранной связи у звезды лица. */
const endRing = (q: { magnitude: number; sex: string }, zoom: number) => starRadius(q.magnitude, zoom) + ringGap(q);

/** Конец выбранной связи в этом кадре (контракт 4 S1 → S3: указатели у края; решение 137, M4). */
export interface SelectedEnd {
  id: string;
  /** роль на кольце: «отец», «мать», «сын», «наложница», «сестра»; '' — роли нет */
  role: string;
  /** from — старшая сторона (родители, супруг), to — младшая (ребёнок, дети союза) */
  side: 'from' | 'to';
  /** ребёнок выбранного союза: ключ союза детей не называет, но они — его концы (M4) */
  kid: boolean;
  /** звезда лица нарисована (не скрыта показом или свёрткой); иначе — призрак (GhostSpot) */
  drawn: boolean;
  /** в окне неба (под рамкой и над листом): кольцо; иначе — указатель у края */
  on: boolean;
  /** центр кольца — звезды или призрака, px холста; null — ни звезды, ни призрака */
  x: number | null;
  y: number | null;
  /** в тесной группе (чужая звезда ближе END_CROWD): у кольца — «Валла, мать», а не «мать» (G9) */
  crowd: boolean;
}

/** Чужая звезда ближе стольких px к концу выбранной связи — роль у его кольца пишется с именем (G9). */
export const END_CROWD = 28;

/** Тесные концы выбранной связи по кадру связей (масштаб) и ключу: при сдвиге неба соседство то же. */
const crowdCache = new WeakMap<object, Map<string, Set<string>>>();

function crowdedEnds(v: SkyContext, p: Pass, ks: string, ids: readonly string[]): Set<string> {
  const f = (p.links?.frame as object | undefined) ?? null;
  const memo = f ? crowdCache.get(f) : undefined;
  const hit = memo?.get(ks);
  if (hit) return hit;
  const { cam } = v;
  const mine = new Set(ids);
  const at = new Map<string, { x: number; y: number }>();
  for (const id of ids) {
    const i = v.indexOf(id);
    if (i !== undefined && v.drawn(i) && !v.hides(id)) at.set(id, { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane) });
  }
  const out = new Set<string>();
  if (at.size) {
    const pts = [...at.entries()];
    for (let i = 0; i < v.nodes.length; i++) {
      const n = v.nodes[i];
      if (n.ghost || mine.has(n.person) || !v.drawn(i)) continue;
      const x = cam.sx(v.X0[i]);
      const y = cam.sy(n.lane);
      for (const [id, q] of pts) if (!out.has(id) && Math.abs(q.x - x) < END_CROWD && Math.abs(q.y - y) < END_CROWD && Math.hypot(q.x - x, q.y - y) < END_CROWD) out.add(id);
    }
  }
  if (f) {
    const m = memo ?? new Map<string, Set<string>>();
    if (m.size > 8) m.clear();
    m.set(ks, out);
    crowdCache.set(f, m);
  }
  return out;
}

/**
 * Концы выбранной связи этого кадра с ролями и местами (контракт 4 S1 → S3; решение 137): у союза целиком — и его
 * дети на небе (M4: «Иаков и Зелфа» — Гад и Асир, сыновья), у остальных ключей — концы linkRoles. Конец на экране —
 * кольцо с ролью, за краем окна или под листом — указатель у края, скрытый показом — призрак (selectedRoutes). Пусто —
 * связь не выбрана.
 */
const endsCache = new WeakMap<object, SelectedEnd[]>();
export function selectedEnds(v: SkyContext, p: Pass): SelectedEnd[] {
  const key = p.s.link;
  if (!key) return [];
  const was = endsCache.get(p.placer);
  if (was) return was;
  const out = frameEnds(v, p, key);
  endsCache.set(p.placer, out);
  return out;
}

function frameEnds(v: SkyContext, p: Pass, key: LinkKey): SelectedEnd[] {
  const { cam } = v;
  const vp = cam.vp;
  const ends: { id: string; role: string; side: 'from' | 'to'; kid: boolean }[] = linkRoles(key).map((e) => ({ ...e, kid: false }));
  if (key.kind === 'union') {
    const u = unions.byId.get(key.union);
    if (u)
      for (const k of u.kids) {
        const i = v.indexOf(k);
        if (i === undefined || !v.drawn(i) || v.hides(k) || ends.some((e) => e.id === k)) continue;
        ends.push({ id: k, role: childRole(u, k), side: 'to', kid: true });
      }
  }
  const ks = linkKeyString(key) ?? '';
  const crowd = crowdedEnds(v, p, ks, ends.map((e) => e.id));
  const ghosts = selectedRoutes(v, p.links, key).ghosts;
  return ends.map((e) => {
    const i = v.indexOf(e.id);
    const drawn = i !== undefined && v.drawn(i) && !v.hides(e.id);
    const g = drawn ? null : (ghosts.find((q) => q.id === e.id) ?? null);
    const x = drawn ? cam.sx(v.X0[i!]) : g ? g.x : null;
    const y = drawn ? cam.sy(v.nodes[i!].lane) : g ? g.y : null;
    const on = x !== null && y !== null && x >= vp.l && x <= vp.r && y >= v.openTop && y <= vp.b;
    return { ...e, drawn, on, x, y, crowd: drawn && crowd.has(e.id) };
  });
}

/**
 * Текст роли у кольца конца: в тесной группе — с именем («Валла, мать», G9); у младшего конца связи по выводу или по
 * толкованию — и помета уровня («сын, выв.»; решение 138: «вывод» — помета у выбранной связи).
 */
function roleText(e: Pick<SelectedEnd, 'id' | 'role' | 'crowd' | 'side' | 'kid'>, key: LinkKey): string {
  let t = e.role && e.crowd ? `${byId.get(e.id)?.name ?? e.id}, ${e.role}` : e.role;
  if (t && e.side === 'to' && !e.kid && (key.kind === 'child' || key.kind === 'step' || key.kind === 'kin')) {
    const m = linkMarks(key).filter((x) => x === 'выв.' || x === 'толк.');
    if (m.length) t = `${t}, ${m.join(', ')}`;
  }
  return t;
}

/**
 * Д12: кольца концов выбранной связи и их роли («отец», «дочь») проходят общую проверку наложений раньше подписей звёзд:
 * чужое имя не ложится ни на кольцо, ни на роль (своё имя лица стоит у своей звезды, как прежде: место кольца — его,
 * Placer owner). Кольца призраков — тоже. Место роли, не нашедшей места, — null: роль не рисуется (она есть в карточке
 * связи), а не ложится на имя. Этап 14 (M4, решение 137): дети выбранного союза — концы с кольцом и ролью.
 */
export function reserveSelectedLink(v: SkyContext, p: Pass) {
  endPlaces.delete(v);
  endRects.delete(v);
  const key = p.s.link;
  if (!key) return;
  const rects: { id: string; kind: 'ring' | 'role'; box: Rect }[] = [];
  const size = mapSize(T_MAP_S, v.coarse);
  const out = new Map<string, { tx: number; ty: number; text: string } | null>();
  const vp = v.cam.vp;
  for (const g of selectedRoutes(v, p.links, key).ghosts) {
    if (g.x < vp.l || g.x > vp.r || g.y < v.openTop || g.y > vp.b) continue;
    const r = g.r + 3;
    const ring = { x: g.x - r - 1, y: g.y - r - 1, w: 2 * r + 2, h: 2 * r + 2 };
    p.placer.add(ring, false, 0, g.id);
    rects.push({ id: g.id, kind: 'ring', box: ring });
  }
  for (const e of selectedEnds(v, p)) {
    const q = byId.get(e.id);
    if (!q || !e.drawn || !e.on || e.x === null || e.y === null) continue;
    const { x, y } = e;
    const r = endRing(q, p.zoomScale);
    const ring = { x: x - r - 2, y: y - r - 2, w: 2 * r + 4, h: 2 * r + 4 };
    p.placer.add(ring, false, 0, e.id);
    rects.push({ id: e.id, kind: 'ring', box: ring });
    const text = roleText(e, key);
    if (!text || !p.s.layers.labels) continue;
    v.ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
    const w = v.ctx.measureText(text).width;
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
    const b = claim(v, p, boxes, 'mark', text, { id: e.id });
    out.set(e.id, b ? { ...spots[boxes.indexOf(b)], text } : null);
    if (b) rects.push({ id: e.id, kind: 'role', box: b });
  }
  endPlaces.set(v, out);
  endRects.set(v, rects);
}

/** «Дети союза» у края одним указателем (M4): «сыновья: Гад и Асир», «дети: Гад, Асир и ещё 3». */
function kidsPointer(es: readonly SelectedEnd[]): string {
  const names = es.map((e) => byId.get(e.id)?.name ?? e.id);
  if (es.length === 1) return es[0].role ? `${names[0]}, ${es[0].role}` : names[0];
  const roles = new Set(es.map((e) => e.role));
  const word = roles.size === 1 && roles.has('сын') ? 'сыновья' : roles.size === 1 && roles.has('дочь') ? 'дочери' : 'дети';
  return es.length === 2 ? `${word}: ${names[0]} и ${names[1]}` : `${word}: ${names[0]}, ${names[1]} и ещё ${es.length - 2}`;
}

/**
 * Выбранная связь (§ 8): путь — жёлтым (ночью #F2E600 2,5 px со свечением 5 и 9 px; днём — маркер #FCDA2D 9 px под
 * линией --ink 2,2 px), на концах — кольца с ролями курсивом («отец», «мать», «сын»); конец за краем — указатель у кромки
 * «‹ Иаков, отец». Рисуется поверх неба. Возвращает место связи в кадре (null — связь не выбрана). Этап 14: дети
 * выбранного союза — концы (M4); жёлтое прерывается под чужими ромбами и именами, у конца в тесной группе — «Валла, мать»
 * (G9); o — вырезы по тексту и отложенный текст (решения 139, 143).
 */
export function drawSelectedLink(v: SkyContext, p: Pass, o: OverlayOpts = {}): SelectedLinkInfo | null {
  const key = p.s.link;
  if (!key) {
    putLinkGhosts([]);
    return null;
  }
  const { ctx, cam, pal } = v;
  const night = !!pal.glow;
  const { all: routes, core, ghosts: spots } = selectedRoutes(v, p.links, key);
  const ends0 = selectedEnds(v, p);
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
  const holes = routes.length ? v.ledger.boxes.filter((b) => b.kind !== 'frame' && b.kind !== 'edge' && !(b.kind === 'plate' && b.text === '' && b.id === own) && hit(b)) : [];
  // чужие ромбы под путём (решение 166): жёлтое под ними прерывается — для проверок (SelectedLinkInfo.nodeHoles)
  const nodeHoles = holes.filter((b) => b.kind === 'plate' && b.text === '' && !!b.id).map((b) => b.id!);
  const scope = overlayScope(v, p, { ...o, cuts: [...(o.cuts ?? []), ...holes] });
  // у кольца выбранного лица путь обрезан (+2 px; решение 167, V-5)
  clipHoles(ctx, cam, ringHoles(v, p));
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
  const layers = activeLayers(pal);
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
  const say = scope.say;
  /** указатель у кромки: «‹ Иаков, отец» слева, «Иаков, отец ›» справа, «↑ …» и «↓ …» сверху и снизу */
  const pointer = (id: string, x: number, y: number, text0: string): { tx: number; ty: number; w: number } => {
    const left = x < vp.l;
    const right = x > vp.r;
    const text = left ? `‹ ${text0}` : right ? `${text0} ›` : y < v.openTop ? `↑ ${text0}` : `↓ ${text0}`;
    ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
    const font = ctx.font;
    const w = ctx.measureText(text).width;
    const tx = left ? v.letterW + 6 : right ? vp.r - 6 - w : Math.max(v.letterW + 6, Math.min(vp.r - 6 - w, x - w / 2));
    const ty = left || right ? Math.max(v.openTop + size + 4, Math.min(vp.b - 6, y + size * 0.35)) : y < v.openTop ? v.openTop + size + 6 : vp.b - 8;
    const box = textBox(tx, ty, w, size);
    if (o.edges !== false) {
      say(() => {
        ctx.save();
        ctx.font = font;
        ctx.fillStyle = night ? alpha(pal.sky, 0.85) : alpha(LINK_YELLOW.day, 0.9);
        ctx.fillRect(box.x - 3, box.y - 1, box.w + 6, box.h + 2);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = ink;
        ctx.fillText(text, tx, ty);
        ctx.restore();
      });
      p.placer.add(box);
      const least = v.coarse ? 44 : 24;
      edges.push({ x: box.x - 3, y: box.y - Math.max(0, (least - box.h) / 2), w: box.w + 6, h: Math.max(box.h, least), id });
    }
    return { tx, ty, w };
  };
  // дети союза за краем — по сторонам одним указателем на сторону (M4)
  const kidsOff = new Map<string, SelectedEnd[]>();
  for (const e of ends0) {
    const q = byId.get(e.id);
    if (!q) continue;
    if (!e.drawn) {
      // конец не нарисован: вне показа или спрятан свёрткой (К3) — призрак: пунктирное кольцо «лицо нарисовано не
      // здесь» в его год, подпись «Илий, отец — вне показа»
      const f = foldsHiding(e.id);
      const why: GhostWhy = f.desc.length || f.groups.length ? 'folded' : 'show';
      ghosts.push({ id: e.id, role: e.role, why, ks });
      const g = spots.find((x) => x.id === e.id);
      if (g) ghostHits.push(...drawGhostEnd(v, p, g, q.name, e.role, why, ink, say));
      continue;
    }
    const x = e.x!;
    const y = e.y!;
    if (e.on) {
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
        const font = ctx.font;
        say(() => {
          ctx.save();
          ctx.font = font;
          ctx.textBaseline = 'alphabetic';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = pal.halo;
          ctx.lineWidth = 3;
          ctx.strokeText(c.text, c.tx, c.ty);
          ctx.fillStyle = ink;
          ctx.fillText(c.text, c.tx, c.ty);
          ctx.restore();
        });
      }
      ends.push({ id: e.id, role: e.role, x, y, on: true });
      continue;
    }
    ghosts.push({ id: e.id, role: e.role, why: 'edge', ks });
    if (e.kid) {
      const side = x < vp.l ? 'l' : x > vp.r ? 'r' : y < v.openTop ? 't' : 'b';
      const a = kidsOff.get(side);
      if (a) a.push(e);
      else kidsOff.set(side, [e]);
      continue;
    }
    const at = pointer(e.id, x, y, e.role ? `${q.name}, ${e.role}` : q.name);
    ends.push({ id: e.id, role: e.role, x: at.tx + at.w / 2, y: at.ty - size * 0.35, on: false });
  }
  for (const es of kidsOff.values()) {
    const first = es[0];
    const at = pointer(first.id, first.x!, first.y!, kidsPointer(es));
    for (const e of es) ends.push({ id: e.id, role: e.role, x: at.tx + at.w / 2, y: at.ty - size * 0.35, on: false });
  }
  scope.end();
  putLinkGhosts(ghosts);
  return { ks, ghosts: ghostHits, ends, x: n ? sx / n : null, y: n ? sy / n : null, segs: routes.length, routes: routes.map((r) => r.map((q) => Math.round(q * 10) / 10)), edges, nodeHoles };
}
