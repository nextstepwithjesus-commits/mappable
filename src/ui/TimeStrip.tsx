/**
 * Полоса времени (ТЗ § 3.4): от сотворения до 2040 г. в равномерном масштабе — эпохи, плотность рождений по 25 лет,
 * две линии Мессии схемой развилок, черта «завершение канона», отметка «сегодня», рамка окна неба.
 *
 * Сверху вниз: строка названий эпох (на широкой полосе — две строки лесенкой), ниже — рамка окна; в её поле — бусины
 * рождений двух линий, столбики плотности, черты канона и «сегодня». Рамка не заходит на названия (MAP-43).
 *
 * Щелчок (IX-50, IX-78): внутри рамки без протяжки — ничего; вне рамки и по названию эпохи — сразу один переход к окну
 * эпохи за 400 мс, без «отдалить — приблизить»; протяжка вне рамки (сдвиг больше 3 px) переносит рамку под указатель и
 * тянет её; двойной щелчок — всё небо (второй щелчок прерывает переход первого). После канона лиц нет: туда ведёт окно
 * конца данных (MOB-06). Колесо (IX-57; решение 47): масштаб окна у года под указателем, Shift + колесо — сдвиг,
 * Ctrl + Shift + колесо — растяжение одного времени.
 *
 * Подписи (VIS-65, MOB-68): черты границ эпох — только в поле рамки, под строками названий; между названиями — 14 px;
 * «сегодня», канон и пояснение «лиц нет» не ложатся на ручки и края рамки, черты и друг друга (placeLate).
 */
import { useEffect, useRef } from 'preact/hooks';
import { effect, signal } from '@preact/signals';
import { lines, type ModelData } from '../data/atlas.ts';
import { model, meridian, selected, theme } from '../state.ts';
import { grid } from './layout.ts';
import { sheetStop } from './sheet.ts';
import '../styles/chronology.css';
import { skyRef, viewTick } from './common.tsx';
import { dateText, epochSpanText, spanText, toAstro, toHist } from '../engine/years.ts';
import { readPalette } from '../render/sky.ts';
import { easeOut } from '../render/camera.ts';
import { T_UI_S, coarsePointer, mapFont } from '../render/type.ts';
import { markJump, panStep, reduced, showAll, showYears, stopFlight, viewForYears } from './sky/view.ts';
import { classifyWheel, wheelNotches, wheelPixels, wheelStretch, wheelZoom, type WheelKind, type WheelSample } from './sky/input.ts';
import { hoverYear } from './sky/meridian.ts';
import { typo } from './text/typo.ts';

/** Начало полосы — сотворение в текущей модели (в модели чисел в скобках — на ~1 400 лет раньше). */
const startOf = () => toAstro(model.value.epochs[0]?.start ?? -4174) - 10;
let T0 = startOf();
const T1 = 2040;
const TODAY = new Date().getFullYear();
const CANON_END = 95;
/** После этого года (астр.) лиц Писания нет: участок полосы заштрихован (VIS-25; решение 2). */
export const CANON_AFTER = 100;
/** Окно конца данных — около 10 г. до Р. Х. … 100 г. по Р. Х. (астр.): туда ведёт щелчок после канона (MOB-06). */
export const LATE_WINDOW: [number, number] = [-9, 100];
const PAD = 14;
/** Зона захвата края рамки — по 22 px в каждую сторону (44 px, ТЗ § 3.4). */
const GRIP = 22;
/** Рамка уже этого — её тело целиком отдаётся сдвигу, а ручки краёв выносятся наружу (MAP-42). */
const NARROW = 88;
/** Самое узкое окно неба, лет. */
const MIN_YEARS = 20;
/** Ручка края рамки (VIS-25): прямоугольник 6 × 18 px за краем рамки, в 4 px от него. */
const HANDLE_GAP = 4;
const HANDLE_W = 6;
const HANDLE_H = 18;
/** Сдвиг указателя, после которого нажатие — протяжка, а не щелчок (IX-50). */
export const DRAG_PX = 3;
/** То же для касания: палец дрожит сильнее мыши. */
const TOUCH_SLOP = 10;
/** Переход к эпохе (щелчок, PageUp и PageDown): одно движение с замедлением (IX-50). */
export const GLIDE_MS = 400;
/** Шаг гистограммы плотности, лет. */
export const BIN = 25;
/** Базовые линии строк названий эпох. */
const ROW_Y = [12, 25];
/** Зазор между подписями эпох в строке, px: подписи не сливаются во фразу («Возвращение Христос», VIS-65). */
export const LABEL_GAP = 14;
/** Зазор между подписями в поле рамки (канон, «сегодня», пояснение) и до ручек, краёв рамки и черт, px. */
const LATE_GAP = 8;
/** Шаг колеса над полосой (IX-57): щелчок колеса — ширина окна в 1,25 раза у года под указателем. */
export const STRIP_WHEEL = 1.25;
/** Второй щелчок двойного — не дальше стольких мс и px от первого: он прерывает переход и ведёт ко «всему небу» (IX-78). */
export const DBL_MS = 500;
const DBL_PX = 6;

/** Курсор над полосой: над ручками — ew-resize, над рамкой — grab (при протяжке — grabbing), вне рамки — pointer (IX-33). */
export function stripCursor(g: FrameGrip, dragging: boolean): string {
  if (g === 'left' || g === 'right') return 'ew-resize';
  if (g === 'move') return dragging ? 'grabbing' : 'grab';
  return dragging ? 'grabbing' : 'pointer';
}

/**
 * Окно после стрелки на ползунке полосы (role="slider"): стрелки — на 10 % ширины окна, с Shift — на 40 %,
 * Home и End — к началу и концу шкалы. Ширина окна не меняется; окно не выходит за шкалу [lo, hi].
 * PageUp и PageDown полоса отдаёт эпохам (epochStep); здесь они — запасной шаг на 40 %.
 */
export function sliderStep(key: string, shift: boolean, a: number, b: number, lo: number, hi: number): [number, number] | null {
  const w = b - a;
  let na: number;
  if (key === 'ArrowLeft' || key === 'ArrowDown') na = a - w * (shift ? 0.4 : 0.1);
  else if (key === 'ArrowRight' || key === 'ArrowUp') na = a + w * (shift ? 0.4 : 0.1);
  else if (key === 'PageUp') na = a - w * 0.4;
  else if (key === 'PageDown') na = a + w * 0.4;
  else if (key === 'Home') na = lo;
  else if (key === 'End') na = hi - w;
  else return null;
  na = Math.max(Math.min(lo, a), Math.min(Math.max(hi, b) - w, na));
  return [na, na + w];
}

export type FrameGrip = 'move' | 'left' | 'right' | 'new';

/**
 * Что берёт нажатие в точке x полосы при рамке [a, b] (px). У широкой рамки края ловятся на ±22 px, между ними — сдвиг.
 * У узкой (уже 88 px) тело рамки, не меньше 44 px, — сдвиг, а ручки лежат снаружи, по 22 px с каждой стороны.
 */
export function frameGrip(x: number, a: number, b: number): FrameGrip {
  if (b - a >= NARROW) {
    if (Math.abs(x - a) < GRIP) return 'left';
    if (Math.abs(x - b) < GRIP) return 'right';
    return x > a && x < b ? 'move' : 'new';
  }
  const c = (a + b) / 2;
  const half = Math.max((b - a) / 2, GRIP);
  if (x >= c - half && x <= c + half) return 'move';
  if (x >= c - half - GRIP && x < c - half) return 'left';
  if (x > c + half && x <= c + half + GRIP) return 'right';
  return 'new';
}

/**
 * Вертикальная раскладка полосы высотой H: строки названий эпох (две на полосе от 64 px, иначе одна), низ этих строк —
 * верх рамки окна; средний ряд бусин линий; наибольшая высота столбика плотности.
 */
export function stripRows(H: number) {
  const names = H >= 64 ? 2 : 1;
  const top = names === 2 ? 30 : 16;
  return { names, top, beads: top + 6, histMax: Math.max(6, H - top - 18) };
}

/** Что под указателем: строка названий эпох или поле рамки (с тем, что берёт нажатие). */
export function stripZone(x: number, y: number, a: number, b: number, H: number): 'names' | FrameGrip {
  return y < stripRows(H).top ? 'names' : frameGrip(x, a, b);
}

/** Окно эпохи [start, end] (астр.) для перехода: с полями по 4 % (не меньше 10 лет); после канона — окно конца данных. */
export function epochWindow(e: { start: number; end: number }): [number, number] {
  if (e.start >= CANON_AFTER) return [...LATE_WINDOW];
  const pad = Math.max(10, (e.end - e.start) * 0.04);
  return [e.start - pad, e.end + pad];
}

/**
 * PageUp и PageDown на ползунке (MOB-49): окно предыдущей или следующей эпохи от той, где середина окна [a, b].
 * Эпохи — в астрономических годах, по порядку; после канона лиц нет, туда клавиши не ведут. null — дальше эпох нет.
 */
export function epochStep(dir: -1 | 1, a: number, b: number, eps: readonly { start: number; end: number }[]): [number, number] | null {
  const list = eps.filter((e) => e.start < CANON_AFTER);
  if (!list.length) return null;
  const c = (a + b) / 2;
  let i = list.findIndex((e) => c >= e.start && c < e.end);
  if (i < 0) i = c < list[0].start ? -1 : list.length;
  const j = i + dir;
  return j >= 0 && j < list.length ? epochWindow(list[j]) : null;
}

/** Эпоха, где лежит год t (астр.), в списке эпох модели. */
export function epochAtYear<E extends { start: number; end: number }>(eps: readonly E[], t: number, astro: (y: number) => number = (y) => y): E | null {
  return eps.find((e) => t >= astro(e.start) && t < astro(e.end)) ?? eps.find((e) => t >= astro(e.start) && t <= astro(e.end)) ?? null;
}

export interface LabelItem {
  id: string;
  /** участок эпохи, px */
  x0: number;
  x1: number;
  /** ширина подписи, px */
  w: number;
}
export interface LabelPlace {
  x: number;
  row: number;
}

/**
 * Подписи эпох (MAP-43, VIS-65): каждая — по середине своей эпохи, в первой строке, где она не ложится на соседние; если
 * место занято — сдвигается влево или вправо к ближайшему свободному месту, пока касается своей эпохи. Между подписями
 * строки — не меньше gap px. rows — сколько строк, [lo, hi] — поле подписей; taken — уже занятые места (номер строки,
 * начало, конец): края шкалы. Не поместилась ни в одну строку — подписи нет (название — во флажке над полосой).
 * Три раскладки: слева направо и от широких эпох к узким — от середин; плотная — слева направо, каждая подпись у левого
 * края своих допустимых мест, затем подписи строки сдвигаются к серединам, пока не упрутся в соседа. На полосе в две
 * строки берётся та, где подписей больше (при равенстве — где подписаны более широкие эпохи): подписаны все; на полосе
 * в одну строку — та, где подписаны более широкие эпохи: сначала широкие.
 */
export function placeEpochLabels(
  items: readonly LabelItem[],
  rows: number,
  lo: number,
  hi: number,
  taken: readonly [number, number, number][] = [],
  gap = LABEL_GAP,
): Map<string, LabelPlace> {
  const fixed = (r: number) => taken.filter((t) => t[0] === r).map((t) => [t[1], t[2]] as [number, number]);
  const want = (it: LabelItem) => Math.max(lo, Math.min(hi - it.w, (it.x0 + it.x1) / 2 - it.w / 2));
  // допустимые места подписи: в поле и касаясь своей эпохи
  const range = (it: LabelItem): [number, number] => [Math.max(lo, it.x0 - 2 - it.w), Math.min(hi - it.w, it.x1 + 2)];
  const clear = (occ: [number, number][], x: number, w: number) => !occ.some(([a, b]) => x < b + gap && a - gap < x + w);
  const run = (order: readonly LabelItem[]) => {
    const occ = Array.from({ length: rows }, (_, r) => fixed(r));
    const out = new Map<string, LabelPlace>();
    for (const it of order) {
      const c = want(it);
      const [a0, a1] = range(it);
      const fits = (x: number, r: number) => x >= a0 - 0.01 && x <= a1 + 0.01 && clear(occ[r], x, it.w);
      let best: (LabelPlace & { d: number }) | null = null;
      for (let r = 0; r < rows; r++) {
        for (const x of [c, ...occ[r].flatMap(([a, b]) => [b + gap, a - gap - it.w])]) {
          if (!fits(x, r)) continue;
          // ближе к середине эпохи; нижняя строка — только если в верхней сдвиг больше 12 px
          const d = Math.abs(x - c) + r * 12;
          if (!best || d < best.d) best = { x, row: r, d };
        }
      }
      if (best) {
        occ[best.row].push([best.x, best.x + it.w]);
        out.set(it.id, { x: best.x, row: best.row });
      }
    }
    return out;
  };
  const packed = () => {
    const occ = Array.from({ length: rows }, (_, r) => fixed(r));
    const at = new Map<string, LabelPlace>();
    for (const it of [...items].sort((a, b) => a.x0 + a.x1 - (b.x0 + b.x1))) {
      const [a0, a1] = range(it);
      let best: LabelPlace | null = null;
      for (let r = 0; r < rows; r++) {
        // самое левое свободное место не левее допустимого
        let x = a0;
        for (let k = 0; k <= occ[r].length; k++) {
          const hit = occ[r].find(([a, b]) => x < b + gap && a - gap < x + it.w);
          if (!hit) break;
          x = hit[1] + gap;
        }
        if (x <= a1 + 0.01 && (!best || x < best.x)) best = { x, row: r };
      }
      if (best) {
        occ[best.row].push([best.x, best.x + it.w]);
        at.set(it.id, best);
      }
    }
    // подписи строки — к серединам эпох, справа налево: каждая не заходит на правого соседа и на края шкалы
    for (let r = 0; r < rows; r++) {
      const row = items.filter((it) => at.get(it.id)?.row === r).sort((a, b) => at.get(a.id)!.x - at.get(b.id)!.x);
      const walls = fixed(r);
      let limit = hi;
      for (let i = row.length - 1; i >= 0; i--) {
        const it = row[i];
        const p = at.get(it.id)!;
        const wall = walls.filter(([a]) => a >= p.x + it.w).reduce((m, [a]) => Math.min(m, a - gap), hi);
        const x = Math.max(p.x, Math.min(want(it), range(it)[1], limit - it.w, wall - it.w));
        at.set(it.id, { x, row: r });
        limit = x - gap;
      }
    }
    return at;
  };
  const span = (m: Map<string, LabelPlace>) => items.reduce((s, it) => s + (m.has(it.id) ? it.x1 - it.x0 : 0), 0);
  const better = (a: Map<string, LabelPlace>, b: Map<string, LabelPlace>) =>
    rows > 1
      ? a.size > b.size || (a.size === b.size && span(a) > span(b) + 0.5)
      : span(a) > span(b) + 0.5 || (Math.abs(span(a) - span(b)) <= 0.5 && a.size > b.size);
  let best = run(items);
  for (const m of [run([...items].sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0))), packed()]) if (better(m, best)) best = m;
  return best;
}

// ---------- подписи в поле рамки после канона (MOB-68, VIS-65) ----------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const LATE_H = 14;
export interface LateText {
  text: string;
  w: number;
}
export interface LatePlaced {
  text: string;
  x: number;
  /** базовая линия текста */
  base: number;
  /** прямоугольник подписи с подложкой */
  box: Box;
}
export interface LateInput {
  W: number;
  H: number;
  /** верх поля рамки (stripRows) */
  top: number;
  /** черты «завершение канона» и «сегодня», px */
  canonX: number;
  todayX: number;
  /** заштрихованный участок после канона, px */
  hatch: [number, number];
  /** края рамки окна, px; null — окна ещё нет */
  frame: [number, number] | null;
  /** ручки рамки */
  grips: readonly Box[];
  /** подпись черты канона: полная и краткая */
  canon: readonly LateText[];
  today: LateText;
  /** пояснение «лиц нет»: от длинного к короткому */
  note: readonly LateText[];
}
/**
 * Строки подписей поля рамки: нижняя — канон и «сегодня» (одна строка, MOB-68); пояснение — строкой выше, если она
 * помещается над нижней с зазором 4 px (полоса 56 px и выше), иначе в той же нижней строке (полоса 44 px).
 */
export function lateRows(H: number, top: number): { bottom: { y: number; base: number }; note: { y: number; base: number } } {
  const bottom = { y: H - 16, base: H - 6 };
  return { bottom, note: top + 3 + LATE_H + 4 <= bottom.y ? { y: top + 3, base: top + 13 } : bottom };
}
/** Подпись канона — не дальше 60 px от своей черты (её может отделять край рамки с ручкой), «сегодня» — не дальше 30 px. */
const CANON_NEAR = 60;
const TODAY_NEAR = 30;

/**
 * Подписи поля рамки после канона (MOB-68, VIS-65): «сегодня» — у своей черты справа, подпись канона — справа от своей
 * черты (над штриховкой, не на столбиках), пояснение «После завершения канона лиц нет» — в самой широкой свободной части
 * штриховки вне рамки. Ни одна подпись не ложится на ручки и края рамки, на черты канона и «сегодня» и на другие подписи
 * (зазор 8 px). На полосе 44 px все три — в одной нижней строке (lateRows); что не помещается — не рисуется.
 * Подпись канона уходит от своей черты не дальше 60 px (иначе берётся краткая), «сегодня» — не дальше 30 px.
 */
export function placeLate(o: LateInput): { today: LatePlaced | null; canon: LatePlaced | null; note: LatePlaced | null } {
  const rows = lateRows(o.H, o.top);
  const placed: LatePlaced[] = [];
  /** занятые участки строки [y, y + 14): ручки, края рамки, черты, подписи; body — и тело рамки */
  const blocked = (y: number, body: boolean): [number, number][] => {
    const out: [number, number][] = [];
    for (const g of o.grips) if (g.y < y + LATE_H && y < g.y + g.h) out.push([g.x - 2, g.x + g.w + 2]);
    if (o.frame) {
      const [a, b] = o.frame;
      if (body) out.push([a - 2, b + 2]);
      else out.push([a - 2, a + 2], [b - 2, b + 2]);
    }
    out.push([o.canonX - 2, o.canonX + 2], [o.todayX - 2, o.todayX + 2]);
    for (const p of placed) if (p.box.y < y + LATE_H && y < p.box.y + p.box.h) out.push([p.box.x - LATE_GAP, p.box.x + p.box.w + LATE_GAP]);
    return out;
  };
  const free = (bl: [number, number][], x: number, w: number) => x >= 2 && x + w <= o.W - 2 && !bl.some(([a, b]) => x - 2 < b && a < x + w + 2);
  const put = (t: LateText, x: number, row: { y: number; base: number }): LatePlaced => {
    const p = { text: t.text, x, base: row.base, box: { x: x - 2, y: row.y, w: t.w + 4, h: LATE_H } };
    placed.push(p);
    return p;
  };
  // «сегодня» — ближе всего к своей черте: слева или справа от неё, иначе по ту сторону ручки или края рамки
  const row = rows.bottom;
  let today: LatePlaced | null = null;
  {
    const bl = blocked(row.y, false);
    // ближний край подписи — не дальше 30 px от черты: иначе между ними встаёт ручка или край рамки, и подпись читалась бы
    // как чужая; тогда подписи нет (черта остаётся)
    const near = (x: number) => Math.max(x - o.todayX, o.todayX - (x + o.today.w)) <= TODAY_NEAR;
    const xs = [o.todayX - 4 - o.today.w, o.todayX + 4, ...bl.flatMap(([a, b]) => [b + 2, a - 2 - o.today.w])].filter((x) => near(x) && free(bl, x, o.today.w));
    xs.sort((a, b) => Math.abs(a + o.today.w / 2 - o.todayX) - Math.abs(b + o.today.w / 2 - o.todayX));
    if (xs.length) today = put(o.today, xs[0], row);
  }
  // канон — справа от черты, не правее «сегодня»
  let canon: LatePlaced | null = null;
  {
    const bl = blocked(row.y, false);
    const pick = (t: LateText, far: number) => {
      const xs = [o.canonX + 4, ...bl.map(([, b]) => b + 2)].filter((x) => x >= o.canonX + 3 && x - o.canonX <= far && free(bl, x, t.w) && (!today || x + t.w + 2 + LATE_GAP <= today.box.x));
      return xs.length ? Math.min(...xs) : null;
    };
    for (const t of o.canon) {
      const x = pick(t, CANON_NEAR);
      if (x !== null) {
        canon = put(t, x, row);
        break;
      }
    }
  }
  // пояснение — в самой широкой свободной части штриховки вне рамки
  let note: LatePlaced | null = null;
  {
    const nr = rows.note;
    const bl = blocked(nr.y, true).sort((a, b) => a[0] - b[0]);
    const lo = Math.max(o.hatch[0] + 6, 2);
    const hi = Math.min(o.hatch[1] - 6, o.W - 2);
    const gaps: [number, number][] = [];
    let x = lo;
    for (const [a, b] of bl) {
      if (b <= x) continue;
      if (a > x) gaps.push([x, Math.min(a, hi)]);
      x = Math.max(x, b);
      if (x >= hi) break;
    }
    if (x < hi) gaps.push([x, hi]);
    const wide = gaps.filter(([a, b]) => b > a).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
    if (wide) {
      // подложка шире текста на 2 px с каждой стороны, от краёв свободного участка ещё по 2 px
      const room = wide[1] - wide[0] - 8;
      const t = o.note.find((n) => n.w <= room);
      if (t) note = put(t, (wide[0] + wide[1] - t.w) / 2, nr);
    }
  }
  return { today, canon, note };
}

/** Прямоугольники пересекаются (края касаются — не пересекаются). */
export const boxesCross = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Ряд бусины на схеме линий: общая для обеих линий, только линия Иосифа (Мф 1) или только линия по Луке. */
export type BeadRow = 'both' | 'joseph' | 'mary';

/**
 * Схема развилок двух линий Мессии (MAP-44, VIS-25): у каждой линии — лица по порядку и ряд каждого. Где линии
 * совпадают — один ряд, где расходятся — два: Иосифа выше, по Луке ниже.
 */
export function lineBeads(joseph: readonly string[], mary: readonly string[]): { joseph: { id: string; row: BeadRow }[]; mary: { id: string; row: BeadRow }[] } {
  const inJ = new Set(joseph);
  const inM = new Set(mary);
  return {
    joseph: joseph.map((id) => ({ id, row: inM.has(id) ? 'both' : 'joseph' })),
    mary: mary.map((id) => ({ id, row: inJ.has(id) ? 'both' : 'mary' })),
  };
}

/**
 * Число рождений по BIN лет от t0 до t1 (MAP-45): только лица со звездой в год рождения. Без лиц «время не установлено»
 * (скобка вместо звезды), без имён из списков без родства (скопления) и без народов и родов: у них нет года рождения.
 */
export function birthBins(m: Pick<ModelData, 'chrono' | 'nodeByPerson'>, t0: number, t1: number, step = BIN): number[] {
  const bins = new Array(Math.max(0, Math.ceil((t1 - t0) / step))).fill(0);
  for (const [id, c] of m.chrono) {
    if (c.cls === 'epochal' || c.named) continue;
    const trail = m.nodeByPerson.get(id)?.trail;
    if (!trail || trail === 'list' || trail === 'epochal' || trail === 'people') continue;
    const i = Math.floor((c.b - t0) / step);
    if (i >= 0 && i < bins.length) bins[i]++;
  }
  return bins;
}

/** «1 рождение», «3 рождения», «25 рождений». */
export function birthsWord(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const w = a > 10 && a < 20 ? 'рождений' : b === 1 ? 'рождение' : b >= 2 && b <= 4 ? 'рождения' : 'рождений';
  return `${n} ${w}`;
}

/** Подпись флажка года над столбиками: год и число рождений в его 25-летии (MAP-45). */
export function histFlag(t: number, n: number): string {
  return `${dateText({ t })}: ${n ? `${birthsWord(n)} за ${BIN} лет` : `за ${BIN} лет рождений нет`}`;
}

/**
 * Второй щелчок двойного (IX-78): не позже DBL_MS после первого и не дальше 6 px от него. Первый щелчок уже начал переход
 * к эпохе; нажатие второго его прервало, а двойной щелчок ведёт ко всему небу — второй щелчок перехода не начинает.
 */
export function isSecondClick(prev: { t: number; x: number } | null, t: number, x: number): boolean {
  return !!prev && t - prev.t <= DBL_MS && Math.abs(x - prev.x) <= DBL_PX;
}

/** Что делает колесо над полосой (IX-57; решение 47): масштаб окна, сдвиг, растяжение одного времени, щипок. */
export type StripWheel = { kind: 'zoom' | 'stretch' | 'pinch'; f: number } | { kind: 'shift'; px: number };
/**
 * Колесо над полосой по виду прокрутки (classifyWheel) и клавишам; dx, dy — px. f — во сколько раз крупнее станет небо
 * (ширина окна — в 1 / f раз): щелчок колеса — 1,25; px — сдвиг окна в px неба (вправо — позже). null — ничего.
 */
export function stripWheel(kind: WheelKind, shift: boolean, ctrl: boolean, dx: number, dy: number): StripWheel | null {
  const along = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
  if (kind === 'pinch') return dy ? { kind: 'pinch', f: Math.exp(-dy * 0.01) } : null;
  const step = () => {
    const n = wheelNotches(along);
    return n > 0 ? Math.pow(STRIP_WHEEL, -Math.sign(along) * n) : null;
  };
  if (shift && ctrl) {
    const f = step();
    return f ? { kind: 'stretch', f } : null;
  }
  if (shift) return along ? { kind: 'shift', px: along } : null;
  // тачпад: прокрутка вбок — сдвиг, вдоль — масштаб
  if (kind === 'trackpad' && Math.abs(dx) > Math.abs(dy)) return { kind: 'shift', px: dx };
  const f = step();
  return f ? { kind: 'zoom', f } : null;
}

/** Переход к окну лет [a, b] одним движением с замедлением (IX-50): без «отдалить — приблизить» ван Вейка. */
function glideYears(a: number, b: number) {
  const s = skyRef.current;
  const v = viewForYears(a, b);
  if (!s || !v) return;
  // переход к эпохе — прыжок окна: новая запись истории, когда небо встанет (этап 14, решение 147)
  markJump();
  stopFlight();
  s.cam.animateTo(s.cam.constrain(v), GLIDE_MS, skyRef.redraw, reduced(), easeOut);
  skyRef.redraw();
}

/** Эпоха, чья кнопка в списке для диктора в фокусе (MOB-49): полоса обводит её рамкой. */
const focusedEpoch = signal<string | null>(null);

/** Окно эпохи в годах модели (астр.). */
const astroEpoch = (e: { start: number; end: number }) => ({ start: toAstro(e.start), end: toAstro(e.end) });

export function TimeStrip() {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let pal = readPalette();
    // все подписи полосы — Jost 12 (VIS-25); на сенсорном экране не мельче 12,5 px (B2; MOB-42)
    let coarse = coarsePointer();
    const font = (weight = 450) => mapFont(T_UI_S, { sans: true, weight, coarse });
    const xOf = (t: number) => PAD + ((t - T0) / (T1 - T0)) * (W - PAD * 2);
    const tOf = (x: number) => T0 + ((x - PAD) / (W - PAD * 2)) * (T1 - T0);
    let hist: number[] = [];
    const buildHist = () => {
      T0 = startOf();
      hist = birthBins(model.value, T0, T1);
    };
    buildHist();

    /** Окно неба в годах (астр.): видимая часть неба — без левой кромки, панели и листа карточки. */
    const view = () => {
      const s = skyRef.current;
      if (!s || !s.model) return null;
      const { l, r } = s.cam.vp;
      return { a: s.tOf(s.cam.wx(l)), b: s.tOf(s.cam.wx(r)) };
    };
    // что под указателем: для курсора, ручки и эпохи, которые подсвечивать
    let grip: FrameGrip | null = null;
    let dragging = false;
    /** эпоха, к которой поведёт щелчок под указателем (IX-50): подсвечена */
    let hotEpoch: string | null = null;
    /** Эпоха середины окна неба (этап 16, решение 188): её название — начертанием и чертой под ним. */
    let curEpoch: string | null = null;
    /** указатель над столбиками: флажок года называет число рождений (MAP-45) */
    let overHist = false;
    /** указатель над строкой названий: флажок называет эпоху, если её подписи на полосе нет (VIS-65) */
    let overNames = false;
    /** эпохи, подписанные на полосе в последнем кадре */
    let labeled = new Set<string>();

    /** Поле разметки для проверок приёмки — только если значение сменилось. */
    const setData = (k: string, v: string | null) => {
      const d = wrap.current!.dataset;
      if (v === null) {
        if (k in d) delete d[k];
      } else if (d[k] !== v) d[k] = v;
    };
    /**
     * Подложка полосы — то, что не зависит от окна неба и меридиана: эпохи, штриховка после канона, эпоха под
     * указателем и в фокусе, названия эпох и края шкалы. Рисуется в свой холст один раз на размер, тему, модель и
     * подсветку эпохи и в каждом кадре переносится целиком (NFR-1: полоса перерисовывается в каждом кадре неба). Подложка
     * непрозрачна и переносится один к одному — пиксели те же, что при рисовании прямо на полосе.
     */
    let base: { key: string; model: unknown; cv: HTMLCanvasElement; texts: (Box & { t: string })[]; labeled: Set<string>; epochLabels: string } | null = null;
    const paintBase = (L: ReturnType<typeof stripRows>): NonNullable<typeof base> => {
      const bcv = base?.cv ?? document.createElement('canvas');
      if (bcv.width !== cv.width) bcv.width = cv.width;
      if (bcv.height !== cv.height) bcv.height = cv.height;
      const ctx = bcv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = pal.sky;
      ctx.fillRect(0, 0, W, H);
      const eps = model.value.epochs;
      // эпохи: чередование тона; черты границ — только в поле рамки, под строками названий: черта не пересекает
      // подпись (VIS-65)
      eps.forEach((e, i) => {
        const a = xOf(toAstro(e.start));
        const b = xOf(toAstro(e.end));
        ctx.fillStyle = i % 2 ? pal.band : pal.sky;
        ctx.fillRect(a, 0, b - a, H);
        ctx.strokeStyle = pal.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(a) + 0.5, L.top);
        ctx.lineTo(Math.round(a) + 0.5, H);
        ctx.stroke();
      });
      // после канона лиц нет: штриховка 45° линией 1 px с шагом 6 px (VIS-25; решение 2)
      const xc = Math.max(0, xOf(CANON_AFTER));
      const xe = Math.min(W, xOf(T1));
      if (xe > xc) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(xc, L.top, xe - xc, H - L.top);
        ctx.clip();
        ctx.strokeStyle = pal.rule;
        ctx.beginPath();
        for (let k = xc - H; k < xe; k += 6) {
          ctx.moveTo(k, H);
          ctx.lineTo(k + H, 0);
        }
        ctx.stroke();
        ctx.restore();
      }
      // эпоха под указателем — светлее (IX-50)
      const hot = hotEpoch ? eps.find((e) => e.id === hotEpoch) : null;
      if (hot) {
        const a = xOf(toAstro(hot.start));
        const b = xOf(toAstro(hot.end));
        ctx.fillStyle = pal.ink;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(a, 0, b - a, H);
        ctx.globalAlpha = 1;
      }
      // эпоха из списка для диктора с фокусом — рамкой 2 px на полосе (MOB-49): фокус виден и зрячему
      const focusEp = focusedEpoch.value ? eps.find((e) => e.id === focusedEpoch.value) : null;
      if (focusEp) {
        const a = Math.max(1, xOf(toAstro(focusEp.start)));
        const b = Math.min(W - 1, xOf(toAstro(focusEp.end)));
        ctx.strokeStyle = pal.focus;
        ctx.lineWidth = 2;
        ctx.strokeRect(a, 1, Math.max(2, b - a), H - 2);
        ctx.lineWidth = 1;
      }
      // названия эпох: все, что помещаются, лесенкой в одну-две строки; края шкалы — в первой строке (MAP-43)
      ctx.font = font();
      ctx.textBaseline = 'alphabetic';
      const startLabel = `${-toHist(T0 + 10)} до Р. Х.`;
      const endLabel = '2040';
      const sw = ctx.measureText(startLabel).width;
      const ew = ctx.measureText(endLabel).width;
      const places = placeEpochLabels(
        // текущая эпоха набрана полужирным — её ширина по своему начертанию (решение 188)
        eps.map((e) => {
          ctx.font = e.id === curEpoch ? font(600) : font();
          return { id: e.id, x0: xOf(toAstro(e.start)), x1: xOf(toAstro(e.end)), w: ctx.measureText(e.short).width };
        }),
        L.names,
        2,
        W - 2,
        [[0, PAD, PAD + sw], [0, W - PAD - ew, W - PAD]],
      );
      ctx.font = font();
      // прямоугольники текста полосы — для проверки наложений (tools/accept/strip3.ts): строка названий — от 10 px над
      // базовой линией до 3 px под ней
      const texts: (Box & { t: string })[] = [];
      const nameBox = (t: string, x: number, base: number, w: number) => texts.push({ t, x, y: base - 10, w, h: 13 });
      ctx.fillStyle = pal.ink3;
      ctx.fillText(startLabel, PAD, ROW_Y[0]);
      ctx.fillText(endLabel, W - PAD - ew, ROW_Y[0]);
      nameBox(startLabel, PAD, ROW_Y[0], sw);
      nameBox(endLabel, W - PAD - ew, ROW_Y[0], ew);
      for (const e of eps) {
        const at = places.get(e.id);
        if (!at) continue;
        const cur = e.id === curEpoch;
        // текущая эпоха (решение 188) — начертанием и чертой 2 px под названием, тоном текста; не степпер из кружков
        ctx.font = cur ? font(600) : font();
        ctx.fillStyle = cur || e.id === hotEpoch ? pal.ink : pal.ink3;
        ctx.fillText(e.short, at.x, ROW_Y[at.row]);
        const w = ctx.measureText(e.short).width;
        if (cur) ctx.fillRect(at.x, ROW_Y[at.row] + 2, w, 2);
        nameBox(e.short, at.x, ROW_Y[at.row], w);
      }
      ctx.font = font();
      // подписано эпох из всех — для проверок приёмки (tools/accept/strip.ts)
      return { key: '', model: null, cv: bcv, texts, labeled: new Set(places.keys()), epochLabels: `${places.size}/${eps.length}` };
    };
    const draw = () => {
      if (!W || !H) return;
      const L = stripRows(H);
      const eps = model.value.epochs;
      const v = view();
      curEpoch = v ? (epochAtYear(eps, (v.a + v.b) / 2, toAstro)?.id ?? null) : null;
      const baseKey = [cv.width, cv.height, W, H, dpr, T0, font(), pal.sky, pal.band, pal.rule, pal.ink, pal.ink3, pal.focus, hotEpoch, focusedEpoch.value, curEpoch].join('|');
      if (!base || base.key !== baseKey || base.model !== model.value) base = { ...paintBase(L), key: baseKey, model: model.value };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base.cv, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = font();
      ctx.textBaseline = 'alphabetic';
      const xc = Math.max(0, xOf(CANON_AFTER));
      const xe = Math.min(W, xOf(T1));
      setData('epochLabels', base.epochLabels);
      labeled = base.labeled;
      const texts: (Box & { t: string })[] = [...base.texts];
      // плотность рождений; вне окна неба — бледнее (VIS-25)
      const max = Math.max(1, ...hist);
      ctx.fillStyle = pal.ink3;
      hist.forEach((n, i) => {
        if (!n) return;
        const t = T0 + i * BIN;
        const x = xOf(t);
        const w = Math.max(1, xOf(t + BIN) - x - 0.3);
        const h = Math.max(1, Math.sqrt(n / max) * L.histMax);
        ctx.globalAlpha = v && t + BIN > v.a && t < v.b ? 1 : 0.55;
        ctx.fillRect(x, H - 3 - h, w, h);
      });
      ctx.globalAlpha = 1;
      // две линии Мессии — схема развилок: бусины рождений, где линии совпадают — один ряд, где расходятся — два
      const chrono = model.value.chrono;
      const beads = lineBeads(
        lines.joseph.persons.map((p) => p.id),
        lines.mary.persons.map((p) => p.id),
      );
      const yM = L.beads;
      const threadY = (row: BeadRow, line: 'joseph' | 'mary') => (row === 'both' ? (line === 'joseph' ? yM - 1 : yM + 1) : line === 'joseph' ? yM - 5 : yM + 5);
      for (const line of ['joseph', 'mary'] as const) {
        const color = line === 'joseph' ? pal.gold1 : pal.azure1;
        const pts = beads[line].map((q) => ({ ...q, b: chrono.get(q.id)?.b })).filter((q): q is { id: string; row: BeadRow; b: number } => q.b !== undefined);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        pts.forEach((q, i) => {
          const x = xOf(q.b);
          const y = threadY(q.row, line) + 0.5;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        for (const q of pts) {
          const x = Math.round(xOf(q.b)) - 1;
          // общая бусина — две половины в одном ряду: золотая сверху, лазурная снизу
          const y = q.row === 'both' ? (line === 'joseph' ? yM - 2 : yM) : line === 'joseph' ? yM - 6 : yM + 4;
          ctx.fillRect(x, y, 2, 2);
        }
      }
      // ручки рамки окна (где они будут нарисованы ниже): подписи поля рамки их обходят
      const handleX = (a: number, b: number) => {
        const c = (a + b) / 2;
        const half = b - a >= NARROW ? (b - a) / 2 : Math.max((b - a) / 2, GRIP / 2);
        return (['left', 'right'] as const).map((side) => {
          const edge = side === 'left' ? Math.min(a, c - half) : Math.max(b, c + half);
          return { side, x: Math.round(side === 'left' ? edge - HANDLE_GAP - HANDLE_W : edge + HANDLE_GAP) };
        });
      };
      const hy = Math.round(L.top + (H - L.top - HANDLE_H) / 2);
      const grips: Box[] = v ? handleX(xOf(v.a), xOf(v.b)).map((h) => ({ x: h.x, y: hy, w: HANDLE_W, h: HANDLE_H })) : [];
      // завершение канона и «сегодня»: черты в поле рамки (ниже строк названий)
      const xCanon = Math.round(xOf(CANON_END)) + 0.5;
      const xToday = Math.round(xOf(TODAY)) + 0.5;
      ctx.strokeStyle = pal.ink2;
      for (const [x, dashed] of [[xToday, false], [xCanon, true]] as const) {
        ctx.setLineDash(dashed ? [2, 2] : []);
        ctx.beginPath();
        ctx.moveTo(x, L.top);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // подписи поля рамки (MOB-68): «сегодня», канон и пояснение «лиц нет» — вне ручек, краёв рамки, черт и друг друга;
      // пояснение — в свободной части штриховки вне рамки; не помещается — не рисуется
      ctx.font = font();
      const tx = (text: string): LateText => ({ text, w: ctx.measureText(text).width });
      const late = placeLate({
        W,
        H,
        top: L.top,
        canonX: xCanon,
        todayX: xToday,
        hatch: [xc, xe],
        frame: v ? [xOf(v.a), xOf(v.a) + Math.max(3, xOf(v.b) - xOf(v.a))] : null,
        grips,
        canon: (W < 700 ? ['канон'] : ['завершение канона', 'канон']).map(tx),
        today: tx('сегодня'),
        note: ['После завершения канона лиц нет', 'После канона лиц нет', 'Лиц нет'].map(tx),
      });
      for (const p of [late.today, late.canon, late.note]) {
        if (!p) continue;
        ctx.fillStyle = pal.sky;
        ctx.fillRect(p.box.x, p.box.y, p.box.w, p.box.h);
        ctx.fillStyle = pal.ink2;
        ctx.fillText(p.text, p.x, p.base);
        texts.push({ t: p.text, ...p.box });
      }
      setData('canonNote', late.note?.text ?? null);
      // текст и ручки полосы — для проверки наложений (MOB-68)
      setData('texts', JSON.stringify(texts.map((b) => [b.t, Math.round(b.x * 10) / 10, Math.round(b.y), Math.round(b.w * 10) / 10, b.h])));
      setData('grips', JSON.stringify(grips.map((g) => [g.x, g.y, g.w, g.h])));
      // окно неба: рамка — под строкой названий, ручки — прямоугольники 6 × 18 за краями (VIS-25)
      if (v) {
        const a = xOf(v.a);
        const b = xOf(v.b);
        const top = L.top + 0.5;
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(Math.round(a) + 0.5, top, Math.max(3, b - a), H - top - 1.5);
        ctx.lineWidth = 1;
        ctx.fillStyle = pal.ink;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(a, top, Math.max(3, b - a), H - top - 1);
        ctx.globalAlpha = 1;
        for (const h of handleX(a, b)) {
          const hotGrip = grip === h.side;
          ctx.fillStyle = pal.sheet;
          ctx.fillRect(h.x, hy, HANDLE_W, HANDLE_H);
          ctx.strokeStyle = hotGrip ? pal.ink : pal.ink2;
          ctx.lineWidth = hotGrip ? 2 : 1;
          ctx.strokeRect(h.x + (hotGrip ? 1 : 0.5), hy + (hotGrip ? 1 : 0.5), HANDLE_W - (hotGrip ? 2 : 1), HANDLE_H - (hotGrip ? 2 : 1));
          ctx.lineWidth = 1;
        }
        // окно в годах — для проверок приёмки (tools/accept.ts)
        wrap.current!.dataset.window = `${v.a.toFixed(1)} ${v.b.toFixed(1)}`;
        // эпоха середины окна — её название выделено (решение 188); для проверок приёмки (tools/accept/story16.ts)
        wrap.current!.dataset.epoch = curEpoch ?? '';
        // ползунок для клавиатуры и диктора (MOB-35, MOB-49): середина окна, окно словами и эпоха середины
        const mid = (v.a + v.b) / 2;
        const ep = epochAtYear(eps, mid, toAstro);
        cv.setAttribute('aria-valuenow', String(toHist(mid)));
        cv.setAttribute('aria-valuetext', typo(`Окно карты: ${spanText({ t: Math.max(T0, v.a) }, { t: Math.min(T1, v.b) })}${ep ? `; эпоха — ${ep.name}` : ''}`));
      }
      // меридиан: черта через полосу, флажок года — под строкой названий; над столбиками — с числом рождений
      if (meridian.value !== null) {
        const t = meridian.value;
        const x = Math.round(xOf(t)) + 0.5;
        ctx.strokeStyle = pal.ink;
        ctx.beginPath();
        ctx.moveTo(x, L.top);
        ctx.lineTo(x, H);
        ctx.stroke();
        const i = Math.floor((t - T0) / BIN);
        // над строкой названий — эпоха без подписи на полосе называется во флажке (VIS-65: не третьей строкой)
        const unnamed = overNames ? epochAtYear(eps, t, toAstro) : null;
        const label =
          overHist && i >= 0 && i < hist.length
            ? histFlag(t, hist[i])
            : unnamed && !labeled.has(unnamed.id)
              ? typo(`${unnamed.name}: ${dateText({ t })}`)
              : dateText({ t });
        ctx.font = font(500);
        const tw = ctx.measureText(label).width;
        // подпись — справа от черты; если там ручка рамки или край — слева: ручку подпись не закрывает
        const over = (lx: number) => grips.some((h) => lx < h.x + h.w + 2 && h.x - 2 < lx + tw + 6);
        let lx = Math.min(W - tw - 10, x + 4);
        if (over(lx) || lx < x) lx = Math.max(2, x - tw - 10);
        const fy = L.top + 2;
        ctx.fillStyle = pal.sky;
        ctx.fillRect(lx, fy, tw + 6, 15);
        ctx.fillStyle = pal.ink;
        ctx.fillText(label, lx + 3, fy + 11);
        setData('flag', label);
      } else setData('flag', null);
    };

    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      coarse = coarsePointer();
      W = r.width;
      H = r.height;
      // размер холста — по полосе (CSS: position absolute, inset 0); ширину в px холсту не задаём:
      // при сужении окна и повороте телефона полоса следует за сеткой (MOB-44)
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap.current!);
    const off1 = effect(() => {
      void viewTick.value;
      void meridian.value;
      void focusedEpoch.value;
      draw();
    });
    const off2 = effect(() => {
      void model.value;
      buildHist();
      cv.setAttribute('aria-valuemin', String(toHist(T0)));
      draw();
    });
    const off3 = effect(() => {
      void theme.value;
      requestAnimationFrame(() => {
        pal = readPalette();
        draw();
      });
    });

    // ---------- взаимодействие: тянуть окно, растягивать края, щелчок по эпохе, клавиши ----------
    /** zone — что взяло нажатие; x0 — где нажали; a, b — окно, от которого считается протяжка */
    let drag: { zone: 'names' | FrameGrip; x0: number; x: number; a: number; b: number; moved: boolean; slop: number } | null = null;
    /** Окно неба [ta, tb] лет сразу (протяжка, клавиши); clamp — не шире шкалы. */
    const setView = (ta: number, tb: number, clamp = true) => {
      const a = clamp ? Math.max(T0, ta) : ta;
      const b = clamp ? Math.min(T1, tb) : tb;
      if (!(b > a)) return;
      showYears(a, b, false);
    };
    /** Сдвиг окна без изменения его ширины: у краёв шкалы окно упирается, а не сжимается. */
    const shiftView = (a: number, b: number, dt: number) => {
      const lo = Math.min(T0, a);
      const hi = Math.max(T1, b);
      const na = Math.max(lo, Math.min(hi - (b - a), a + dt));
      setView(na, na + (b - a), false);
    };
    /** прошлый щелчок по полосе: второй щелчок двойного перехода не начинает (IX-78) */
    let lastClick: { t: number; x: number } | null = null;
    /** прошлое событие колеса: мышь или тачпад (classifyWheel) */
    let lastWheel: { t: number; kind: WheelKind } | null = null;
    const setCursor = () => {
      cv.style.cursor = grip ? stripCursor(grip, dragging) : '';
    };
    const epochAtX = (x: number) => epochAtYear(model.value.epochs, tOf(x), toAstro);
    /** Эпоха, к которой поведёт щелчок в точке: над названиями — всегда, в поле рамки — только вне рамки. */
    const clickEpoch = (zone: 'names' | FrameGrip, x: number) => (zone === 'names' || zone === 'new' ? epochAtX(x) : null);
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      // нажатие на полосе прерывает перелёт (D4) и переход к эпохе
      stopFlight();
      // во время протяжки меридиана нет (D13)
      hoverYear(null);
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const v = view();
      if (!v) return;
      const zone = stripZone(x, e.clientY - r.top, xOf(v.a), xOf(v.b), H);
      // палец дрожит сильнее мыши: касание становится протяжкой со сдвига больше 10 px
      drag = { zone, x0: x, x, a: v.a, b: v.b, moved: false, slop: e.pointerType === 'touch' ? TOUCH_SLOP : DRAG_PX };
      dragging = zone !== 'names' && zone !== 'new';
      grip = zone === 'names' ? 'new' : zone;
      setCursor();
    };
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (!drag) {
        const v = view();
        const zone = v ? stripZone(x, y, xOf(v.a), xOf(v.b), H) : null;
        const g: FrameGrip | null = zone === 'names' ? 'new' : zone;
        // над ручкой — ширина окна, а не год: меридиан с подписью закрыл бы ручку
        // меридиан — через 250 мс и не над ручками (D13; src/ui/sky/meridian.ts)
        hoverYear(g === 'left' || g === 'right' ? null : tOf(x));
        const ep = zone ? clickEpoch(zone, x) : null;
        const inHist = zone !== null && zone !== 'names' && y > stripRows(H).beads + 7;
        const inNames = zone === 'names';
        if (g !== grip || (ep?.id ?? null) !== hotEpoch || inHist !== overHist || inNames !== overNames) {
          grip = g;
          hotEpoch = ep?.id ?? null;
          overHist = inHist;
          overNames = inNames;
          draw();
        }
        setCursor();
        return;
      }
      hoverYear(null);
      if (!drag.moved) {
        if (Math.abs(x - drag.x0) <= drag.slop) return;
        drag.moved = true;
        hotEpoch = null;
        if (drag.zone === 'names' || drag.zone === 'new') {
          // протяжка вне рамки: середина рамки — под указатель, дальше рамка идёт за ним (IX-32, IX-50)
          const w = drag.b - drag.a;
          const to = Math.max(Math.min(T0, drag.a), Math.min(Math.max(T1, drag.b) - w, tOf(x) - w / 2));
          drag = { ...drag, zone: 'move', x, a: to, b: to + w };
          dragging = true;
          grip = 'move';
          setCursor();
          setView(to, to + w, false);
          return;
        }
      }
      const dt = tOf(x) - tOf(drag.x);
      if (drag.zone === 'move') shiftView(drag.a, drag.b, dt);
      else if (drag.zone === 'left') setView(Math.min(drag.a + dt, drag.b - MIN_YEARS), drag.b);
      else if (drag.zone === 'right') setView(drag.a, Math.max(drag.b + dt, drag.a + MIN_YEARS));
    };
    const onUp = (e: PointerEvent) => {
      if (drag && !drag.moved && e.type === 'pointerup') {
        // щелчок вне рамки или по названию — переход к эпохе сразу (IX-50, IX-78); внутри рамки — ничего.
        // Второй щелчок двойного перехода не начинает: его нажатие уже прервало первый, двойной щелчок ведёт ко всему небу.
        const now = performance.now();
        const second = isSecondClick(lastClick, now, drag.x0);
        lastClick = second ? null : { t: now, x: drag.x0 };
        const ep = second ? null : clickEpoch(drag.zone, drag.x0);
        if (ep) {
          const [a, b] = epochWindow(astroEpoch(ep));
          glideYears(a, b);
        }
      }
      drag = null;
      dragging = false;
      setCursor();
    };
    const onDbl = () => {
      // двойной щелчок — всё небо (UX-28)
      lastClick = null;
      showAll();
    };
    /**
     * Колесо над полосой (IX-57; решение 47 — та же схема, что у неба): колесо — ширина окна в 1,25 раза за щелчок у года
     * под указателем; Shift + колесо и прокрутка тачпада вбок — сдвиг окна по времени; Ctrl + Shift + колесо — растяжение
     * одного времени; щипок тачпада — масштаб. Alt + колесо (высота строк) — только над небом.
     */
    const onWheel = (e: WheelEvent) => {
      const s = skyRef.current;
      const v = view();
      if (!s || !v || e.altKey) return;
      e.preventDefault();
      lastClick = null;
      hoverYear(null);
      const r = cv.getBoundingClientRect();
      const t = Math.max(T0, Math.min(T1, tOf(e.clientX - r.left)));
      const sample: WheelSample = { deltaMode: e.deltaMode, deltaX: e.deltaX, deltaY: e.deltaY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, t: performance.now() };
      const kind = classifyWheel(sample, lastWheel);
      lastWheel = { t: sample.t, kind };
      const vp = s.cam.vp;
      const act = stripWheel(kind, e.shiftKey, e.ctrlKey, wheelPixels(e.deltaX, e.deltaMode, vp.b - vp.t), wheelPixels(e.deltaY, e.deltaMode, vp.b - vp.t));
      if (!act) return;
      // точка неба, которая остаётся на месте, — год под указателем (он может быть и вне окна: окно идёт к нему)
      const ax = s.cam.sx(s.xOf(t));
      const ay = (vp.t + vp.b) / 2;
      if (act.kind === 'shift') panStep(-act.px, 0);
      else if (act.kind === 'stretch') wheelStretch('time', act.f, ax, ay);
      else if (act.kind === 'pinch') {
        stopFlight();
        s.cam.zoomAt(ax, ay, act.f);
        skyRef.redraw();
      } else wheelZoom(act.f, ax, ay);
    };
    const onLeave = () => {
      if (!drag) {
        hoverYear(null);
        if (grip || hotEpoch || overHist || overNames) {
          grip = null;
          hotEpoch = null;
          overHist = false;
          overNames = false;
          draw();
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const v = view();
      if (!v || e.ctrlKey || e.metaKey || e.altKey) return;
      // PageUp и PageDown — к предыдущей и следующей эпохе (MOB-49); aria-valuetext называет эпоху
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        const to = epochStep(e.key === 'PageUp' ? -1 : 1, v.a, v.b, model.value.epochs.map(astroEpoch));
        if (to) glideYears(to[0], to[1]);
        return;
      }
      const next = sliderStep(e.key, e.shiftKey, v.a, v.b, T0, T1);
      if (!next) return;
      e.preventDefault();
      stopFlight();
      setView(next[0], next[1], false);
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('dblclick', onDbl);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('keydown', onKey);
    return () => {
      ro.disconnect();
      off1();
      off2();
      off3();
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
      cv.removeEventListener('pointerleave', onLeave);
      cv.removeEventListener('dblclick', onDbl);
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('keydown', onKey);
    };
  }, []);
  const epochs = model.value.epochs;
  // телефон, лист карточки во весь экран (решение 123): полоса свёрнута в тонкую строку возврата — касание опускает лист
  // на 55 %, и небо с полосой снова видны. Холст остаётся в разметке (размер и состояние не теряются), но скрыт
  const thin = grid.value.phone && !!selected.value && sheetStop.value === 'full';
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('strip-thin', thin);
    return () => document.documentElement.classList.remove('strip-thin');
  }, [thin]);
  return (
    <div class={thin ? 'strip thin' : 'strip'} ref={wrap}>
      {thin && (
        <button type="button" class="strip-back" onClick={() => (sheetStop.value = 'half')} title="Опустить карточку: небо и полоса времени снова видны">
          ‹ Небо и время
        </button>
      )}
      {/* ползунок окна карты: стрелки — сдвиг на 10 % (Shift — на 40 %), PageUp и PageDown — эпохи, Home и End — края шкалы */}
      <canvas
        ref={ref}
        tabIndex={0}
        role="slider"
        aria-label="Полоса времени от сотворения до 2040 года: окно карты"
        aria-valuemax={2040}
        aria-orientation="horizontal"
        aria-describedby="strip-help"
        title="Тяните рамку или её края; щелчок вне рамки или по названию эпохи — переход к эпохе, двойной щелчок — всё небо; колесо — ширина окна у года под указателем, Shift + колесо — сдвиг. Столбики — рождения за 25 лет, без лиц, чьё время не установлено"
      />
      <p id="strip-help" class="visually-hidden">
        Стрелки влево и вправо сдвигают окно карты, с Shift — дальше; PageUp и PageDown — к предыдущей и следующей эпохе;
        Home и End — к началу и концу шкалы; плюс и минус меняют ширину окна. Столбики полосы — число рождений за 25 лет,
        без лиц, чьё время не установлено.
      </p>
      {/* эпохи — и списком для диктора; с Tab их нет: эпохи листают PageUp и PageDown на ползунке (MOB-49) */}
      <ul class="visually-hidden" aria-label="Эпохи на полосе времени">
        {epochs.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              tabIndex={-1}
              onFocus={() => (focusedEpoch.value = e.id)}
              onBlur={() => (focusedEpoch.value = null)}
              onClick={() => {
                const [a, b] = epochWindow(astroEpoch(e));
                glideYears(a, b);
              }}
            >
              {typo(`${e.name}, ${epochSpanText(e)}`)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
