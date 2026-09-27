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
 */
import { alpha } from './color.ts';
import { DIM, LIKELY } from './dim.ts';
import { starRadius } from './glyphs.ts';
import { RULER_H, ROW_H } from './frame.ts';
import { mapFont, mapSize, T_MAP_S } from './type.ts';
import { byId, graph } from '../data/atlas.ts';
import { claim, labelStar, textBox } from './labels.ts';
import { drawBranchLabels, drawLineNames, drawLineNotes } from './ribbons.ts';
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
function kinRoutes(v: SkyContext, steps: readonly KinStep[]): { st: KinStep; pts: { x: number; y: number }[] }[] {
  const { cam } = v;
  // лица, скрытые рабочим набором или свёрткой (J4, J5), — без шага: его конец висел бы в пустоте
  const at = (id: string) => {
    const i = v.indexOf(id);
    return i === undefined || v.hides(id) ? null : { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane) };
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
      labelStar(v, p, i, { sides: ['r', 'l', 't', 'b'], color: v.pal.ink, alpha: 1, sigla: true, leader: true, overStars: true, force: first });
      first = false;
    }
  }
  drawKinSteps(v, p);
  drawLineNotes(v, p, steps);
  drawLineNames(v, p, steps);
  drawBranchLabels(v, p, steps);
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
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
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

/**
 * Меридиан года (D13; UX-27, IX-34, MAP-07, MAP-33): черта через ярусы и небо и флажок у линейки неба —
 * «990 г. до Р. Х.: живы 186, наверняка 41». Флажок — лист на служебной строке рамки, справа от черты, у правого края — слева.
 * Возвращает прямоугольник флажка (px холста) или null.
 */
export function drawMeridian(v: SkyContext, s: SkyState): Rect | null {
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
  const text = s.meridianLabel;
  if (!text) return null;
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const w = tw + 12;
  const h = ROW_H - 1;
  let bx = x + 1;
  if (bx + w > cam.w - 2) bx = x - w;
  bx = Math.max(v.letterW + 1, bx);
  const by = RULER_H;
  ctx.fillStyle = pal.sheet;
  ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = pal.ruleStrong;
  ctx.strokeRect(Math.round(bx) + 0.5, by + 0.5, Math.round(w) - 1, h - 1);
  ctx.fillStyle = pal.ink;
  ctx.fillText(text, bx + 6, by + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
  return { x: bx, y: by, w, h };
}
