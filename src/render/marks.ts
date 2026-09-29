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
import { branchColor, branchDash, branchFade, branchFloor, type MapTheme } from './branches.ts';
import { claim, putLabel, textBox } from './labels.ts';
import { beadAt, drawBranchLabels, drawKeyLineNames, drawLineNames, drawLineNotes, drawMt1Women } from './ribbons.ts';
import type { LineStep } from '../engine/layout.ts';
import type { Rect } from './rect.ts';
import type { KinStep } from '../engine/kinship.ts';
import type { Emphasis, Pass, SkyContext, SkyState } from './sky.ts';

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

/** Вид шага пути на небе: кровный — сплошной, по закону и брак — штрих, по термину Писания и по толкованию — точки. */
export type StepLook = 'blood' | 'legal' | 'term';
export function stepLook(st: Pick<KinStep, 'kind' | 'claim' | 'interpretive'>): StepLook {
  if (st.interpretive || st.kind === 'kin') return 'term';
  if (st.kind === 'spouse' || st.claim === 'legal' || st.claim === 'adoptive' || st.claim === 'levirate') return 'legal';
  return 'blood';
}
const STEP_DASH: Record<StepLook, number[]> = { blood: [], legal: [6, 3], term: [0.5, 4.5] };

/**
 * Ломаная шага: от родителя вдоль его следа до года рождения ребёнка, затем отводом к ребёнку (как связь на небе);
 * вверх — наоборот; брак и родство по термину — прямой отрезок. a и b — звёзды from и to.
 */
export function stepRoute(kind: KinStep['kind'], a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number }[] {
  if (kind === 'down') return [a, { x: b.x, y: a.y }, b];
  if (kind === 'up') return [a, { x: a.x, y: b.y }, b];
  return [a, b];
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
export function kinRoutes(v: SkyContext, steps: readonly KinStep[]): { st: KinStep; pts: { x: number; y: number }[] }[] {
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
    if (a && b) out.push({ st, pts: stepRoute(st.kind, a, b) });
  }
  return out;
}

/**
 * Путь родства на небе (E5; MAP-18, UX-11): ломаная 2 px цвета --ink на подложке неба; кровные шаги сплошные,
 * по закону и брак — штрихом, по термину Писания и по толкованию — точками. Рисуется под звёздами: звёзды пути
 * лежат на ломаной, как бусины.
 */
export function drawKinPath(v: SkyContext, p: Pass) {
  const steps = p.s.kinSteps;
  if (!steps?.length) return;
  const { ctx, pal } = v;
  const routes = kinRoutes(v, steps);
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
  for (const r of kinRoutes(v, steps)) {
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
  // призрак жены: дуга от знака в родном роду к её месту у мужа
  if (s.layers.ghosts && cam.ky >= 5)
    for (const id of new Set([s.hovered, s.selected])) {
      if (!id) continue;
      const gi = v.indexOf(`ghost:${id}`);
      const ri = v.indexOf(id);
      if (gi === undefined || ri === undefined || !v.drawn(gi) || !v.drawn(ri)) continue;
      const a = { x: cam.sx(v.X0[gi]), y: cam.sy(v.nodes[gi].lane) };
      const b = { x: cam.sx(v.X0[ri]), y: cam.sy(v.nodes[ri].lane) };
      const bend = Math.min(160, Math.abs(b.y - a.y) * 0.25 + 30);
      ctx.save();
      ctx.strokeStyle = alpha(pal.ink2, 0.9);
      ctx.lineWidth = 1;
      ctx.setLineDash([1.5, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(Math.min(a.x, b.x) - bend, (a.y + b.y) / 2, b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  // родство по термину Писания (MAP-17): наведённое лицо — точечная дуга к названному родственнику и термин
  // («сестра»); это соседство по слову Писания, не утверждение о родителях (П-8)
  if (s.hovered && cam.ky >= 5) drawKinArcs(v, p, s.hovered);
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
 * Дуги родства по термину Писания у лица id (MAP-17): к каждому названному родственнику на небе — точечная дуга,
 * у дуги — термин (кем приходится лицо у начала дуги: «Саруия — сестра Давида»). Подпись — той же проверкой наложений.
 */
export function drawKinArcs(v: SkyContext, p: Pass, id: string) {
  const { ctx, cam, pal } = v;
  const at = (x: string) => {
    const i = v.indexOf(x);
    return i === undefined || !v.drawn(i) ? null : { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane) };
  };
  const size = mapSize(T_MAP_S, v.coarse);
  for (const e of graph.kinOf.get(id) ?? []) {
    const a = at(e.from);
    const b = at(e.to);
    if (!a || !b) continue;
    const bend = Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) * 0.25 + 12);
    const cx = Math.min(a.x, b.x) - bend;
    const cy = (a.y + b.y) / 2;
    ctx.save();
    ctx.strokeStyle = alpha(pal.ink2, 0.9);
    ctx.lineWidth = 1;
    ctx.setLineDash([1.5, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);
    ctx.stroke();
    ctx.restore();
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
    ctx.fillStyle = pal.ink2;
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
