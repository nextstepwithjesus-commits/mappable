/**
 * Полоса времени (ТЗ § 3.4): от сотворения до 2040 г. в истинном масштабе — эпохи, плотность рождений по 25 лет,
 * две линии Мессии схемой развилок, черта «завершение канона», отметка «сегодня», рамка окна неба.
 *
 * Сверху вниз: строка названий эпох (на широкой полосе — две строки лесенкой), ниже — рамка окна; в её поле — бусины
 * рождений двух линий, столбики плотности, черты канона и «сегодня». Рамка не заходит на названия (MAP-43).
 *
 * Щелчок (IX-50): внутри рамки без протяжки — ничего; вне рамки и по названию эпохи — один переход к окну эпохи за
 * 400 мс, без «отдалить — приблизить»; протяжка вне рамки (сдвиг больше 3 px) переносит рамку под указатель и тянет её;
 * двойной щелчок — всё небо. После канона лиц нет: туда ведёт окно конца данных (MOB-06).
 */
import { useEffect, useRef } from 'preact/hooks';
import { effect, signal } from '@preact/signals';
import { lines, type ModelData } from '../data/atlas.ts';
import { model, meridian, theme } from '../state.ts';
import { skyRef, viewTick } from './common.tsx';
import { formatSpan, formatYear, toAstro, toHist } from '../engine/years.ts';
import { readPalette } from '../render/sky.ts';
import { easeOut } from '../render/camera.ts';
import { T_UI_S, coarsePointer, mapFont } from '../render/type.ts';
import { reduced, showAll, showYears, stopFlight, viewForYears } from './sky/view.ts';
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
/** Щелчок ждёт, не двойной ли это щелчок («всё небо»), мс. */
const DBL_MS = 240;
/** Шаг гистограммы плотности, лет. */
export const BIN = 25;
/** Базовые линии строк названий эпох. */
const ROW_Y = [12, 25];
/** Зазор между подписями эпох в строке, px. */
const LABEL_GAP = 6;

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
 * Подписи эпох (MAP-43): каждая — по середине своей эпохи, в первой строке, где она не ложится на соседние; если место
 * занято — сдвигается влево или вправо к ближайшему свободному месту, пока касается своей эпохи. rows — сколько строк,
 * [lo, hi] — поле подписей; taken — уже занятые места (номер строки, начало, конец): края шкалы. Не поместилась ни в одну
 * строку — подписи нет. Два порядка — слева направо и от широких эпох к узким; берётся тот, где подписей больше
 * (при равенстве — где подписаны более широкие эпохи): на широкой полосе подписаны все, на узкой — сначала широкие.
 */
export function placeEpochLabels(items: readonly LabelItem[], rows: number, lo: number, hi: number, taken: readonly [number, number, number][] = []): Map<string, LabelPlace> {
  const run = (order: readonly LabelItem[]) => {
    const occ: [number, number][][] = Array.from({ length: rows }, (_, r) => taken.filter((t) => t[0] === r).map((t) => [t[1], t[2]] as [number, number]));
    const out = new Map<string, LabelPlace>();
    for (const it of order) {
      const want = Math.max(lo, Math.min(hi - it.w, (it.x0 + it.x1) / 2 - it.w / 2));
      // подпись в поле, касается своей эпохи и не ложится на занятые места строки
      const fits = (x: number, r: number) =>
        x >= lo - 0.01 && x + it.w <= hi + 0.01 && x <= it.x1 + 2 && x + it.w >= it.x0 - 2 && !occ[r].some(([a, b]) => x < b + LABEL_GAP && a - LABEL_GAP < x + it.w);
      let best: (LabelPlace & { d: number }) | null = null;
      for (let r = 0; r < rows; r++) {
        for (const x of [want, ...occ[r].flatMap(([a, b]) => [b + LABEL_GAP, a - LABEL_GAP - it.w])]) {
          if (!fits(x, r)) continue;
          // ближе к середине эпохи; нижняя строка — только если в верхней сдвиг больше 12 px
          const d = Math.abs(x - want) + r * 12;
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
  const span = (m: Map<string, LabelPlace>) => items.reduce((s, it) => s + (m.has(it.id) ? it.x1 - it.x0 : 0), 0);
  const inOrder = run(items);
  const byWidth = run([...items].sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0)));
  return byWidth.size > inOrder.size || (byWidth.size === inOrder.size && span(byWidth) > span(inOrder) + 0.5) ? byWidth : inOrder;
}

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
  return `${formatYear(t)}: ${n ? `${birthsWord(n)} за ${BIN} лет` : `за ${BIN} лет рождений нет`}`;
}

/** Переход к окну лет [a, b] одним движением с замедлением (IX-50): без «отдалить — приблизить» ван Вейка. */
function glideYears(a: number, b: number) {
  const s = skyRef.current;
  const v = viewForYears(a, b);
  if (!s || !v) return;
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
    /** указатель над столбиками: флажок года называет число рождений (MAP-45) */
    let overHist = false;

    /** Поле разметки для проверок приёмки — только если значение сменилось. */
    const setData = (k: string, v: string | null) => {
      const d = wrap.current!.dataset;
      if (v === null) {
        if (k in d) delete d[k];
      } else if (d[k] !== v) d[k] = v;
    };
    const draw = () => {
      if (!W || !H) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = pal.sky;
      ctx.fillRect(0, 0, W, H);
      const L = stripRows(H);
      const eps = model.value.epochs;
      const v = view();
      // эпохи: чередование тона и черты границ
      eps.forEach((e, i) => {
        const a = xOf(toAstro(e.start));
        const b = xOf(toAstro(e.end));
        ctx.fillStyle = i % 2 ? pal.band : pal.sky;
        ctx.fillRect(a, 0, b - a, H);
        ctx.strokeStyle = pal.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(a) + 0.5, 0);
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
        eps.map((e) => ({ id: e.id, x0: xOf(toAstro(e.start)), x1: xOf(toAstro(e.end)), w: ctx.measureText(e.short).width })),
        L.names,
        2,
        W - 2,
        [[0, PAD, PAD + sw], [0, W - PAD - ew, W - PAD]],
      );
      // подписано эпох из всех — для проверок приёмки (tools/accept/strip.ts)
      setData('epochLabels', `${places.size}/${eps.length}`);
      ctx.fillStyle = pal.ink3;
      ctx.fillText(startLabel, PAD, ROW_Y[0]);
      ctx.fillText(endLabel, W - PAD - ew, ROW_Y[0]);
      for (const e of eps) {
        const at = places.get(e.id);
        if (!at) continue;
        ctx.fillStyle = e.id === hotEpoch ? pal.ink : pal.ink3;
        ctx.fillText(e.short, at.x, ROW_Y[at.row]);
      }
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
      // ручки рамки окна (где они будут нарисованы ниже): подписи канона и «сегодня» их обходят
      const grips: { x: number; w: number }[] = [];
      const handleX = (a: number, b: number) => {
        const c = (a + b) / 2;
        const half = b - a >= NARROW ? (b - a) / 2 : Math.max((b - a) / 2, GRIP / 2);
        return (['left', 'right'] as const).map((side) => {
          const edge = side === 'left' ? Math.min(a, c - half) : Math.max(b, c + half);
          return { side, x: Math.round(side === 'left' ? edge - HANDLE_GAP - HANDLE_W : edge + HANDLE_GAP) };
        });
      };
      if (v) for (const h of handleX(xOf(v.a), xOf(v.b))) grips.push({ x: h.x - 2, w: HANDLE_W + 4 });
      const onGrip = (lx: number, tw: number) => grips.some((h) => lx < h.x + h.w + 2 && h.x - 2 < lx + tw);
      // завершение канона и «сегодня»: черты в поле рамки, подписи Jost внизу на подложке неба
      const bottomY = H - 6;
      const mark = (t: number, label: string, dashed: boolean, side: 'right' | 'left', maxEnd = Infinity) => {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.strokeStyle = pal.ink2;
        ctx.setLineDash(dashed ? [2, 2] : []);
        ctx.beginPath();
        ctx.moveTo(x, L.top);
        ctx.lineTo(x, H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = font();
        const tw = ctx.measureText(label).width;
        // подпись — со стороны side от черты, чтобы черта не перечёркивала слово; ручку рамки подпись обходит справа
        let lx = side === 'right' && x + 4 + tw <= W - 4 ? x + 4 : x - tw - 4;
        for (const g of grips) if (onGrip(lx, tw)) lx = Math.max(lx, g.x + g.w + 4);
        if (lx + tw < Math.min(maxEnd, W - 2) && lx >= 2 && !onGrip(lx, tw)) {
          ctx.fillStyle = pal.sky;
          ctx.fillRect(lx - 2, bottomY - 10, tw + 4, 14);
          ctx.fillStyle = pal.ink2;
          ctx.fillText(label, lx, bottomY);
          return { lx, tw };
        }
        return null;
      };
      const today = mark(TODAY, 'сегодня', false, 'left');
      mark(CANON_END, W < 700 ? 'канон' : 'завершение канона', true, 'right', today ? today.lx - 8 : Infinity);
      // после канона лиц нет: пояснение посреди заштрихованного участка (MOB-06)
      {
        ctx.font = font();
        const room = xe - xc - 12;
        const note = ['После завершения канона лиц нет', 'После канона лиц нет', 'Лиц нет'].find((s) => ctx.measureText(s).width <= room);
        // под верхом рамки, над подписями канона и «сегодня»: лент и столбиков после канона нет
        const ny = L.top + 13;
        setData('canonNote', note ?? null);
        if (note) {
          const tw = ctx.measureText(note).width;
          const lx = xc + (xe - xc - tw) / 2;
          ctx.fillStyle = pal.sky;
          ctx.fillRect(lx - 3, ny - 10, tw + 6, 14);
          ctx.fillStyle = pal.ink2;
          ctx.fillText(note, lx, ny);
        }
      }
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
        const hy = Math.round(L.top + (H - L.top - HANDLE_H) / 2);
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
        // ползунок для клавиатуры и диктора (MOB-35, MOB-49): середина окна, окно словами и эпоха середины
        const mid = (v.a + v.b) / 2;
        const ep = epochAtYear(eps, mid, toAstro);
        cv.setAttribute('aria-valuenow', String(toHist(mid)));
        cv.setAttribute('aria-valuetext', typo(`Окно карты: ${formatSpan(Math.max(T0, v.a), Math.min(T1, v.b))}${ep ? `; эпоха — ${ep.name}` : ''}`));
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
        const label = overHist && i >= 0 && i < hist.length ? histFlag(t, hist[i]) : formatYear(t);
        ctx.font = font(500);
        const tw = ctx.measureText(label).width;
        // подпись — справа от черты; если там ручка рамки или край — слева: ручку подпись не закрывает
        const over = (lx: number) => grips.some((h) => lx < h.x + h.w && h.x < lx + tw + 6);
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
    let epochTimer = 0;
    const setCursor = () => {
      cv.style.cursor = grip ? stripCursor(grip, dragging) : '';
    };
    const epochAtX = (x: number) => epochAtYear(model.value.epochs, tOf(x), toAstro);
    /** Эпоха, к которой поведёт щелчок в точке: над названиями — всегда, в поле рамки — только вне рамки. */
    const clickEpoch = (zone: 'names' | FrameGrip, x: number) => (zone === 'names' || zone === 'new' ? epochAtX(x) : null);
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      // нажатие на полосе прерывает перелёт (D4) и отложенный щелчок по эпохе
      stopFlight();
      clearTimeout(epochTimer);
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
        if (g !== grip || (ep?.id ?? null) !== hotEpoch || inHist !== overHist) {
          grip = g;
          hotEpoch = ep?.id ?? null;
          overHist = inHist;
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
        // щелчок вне рамки или по названию — переход к эпохе (IX-50); внутри рамки — ничего.
        // Чуть позже, чтобы двойной щелчок успел стать «всем небом».
        const ep = clickEpoch(drag.zone, drag.x0);
        if (ep) {
          const [a, b] = epochWindow(astroEpoch(ep));
          clearTimeout(epochTimer);
          epochTimer = window.setTimeout(() => glideYears(a, b), DBL_MS);
        }
      }
      drag = null;
      dragging = false;
      setCursor();
    };
    const onDbl = () => {
      // двойной щелчок — всё небо (UX-28)
      clearTimeout(epochTimer);
      showAll();
    };
    const onLeave = () => {
      if (!drag) {
        hoverYear(null);
        if (grip || hotEpoch || overHist) {
          grip = null;
          hotEpoch = null;
          overHist = false;
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
    cv.addEventListener('keydown', onKey);
    return () => {
      ro.disconnect();
      off1();
      off2();
      off3();
      clearTimeout(epochTimer);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
      cv.removeEventListener('pointerleave', onLeave);
      cv.removeEventListener('dblclick', onDbl);
      cv.removeEventListener('keydown', onKey);
    };
  }, []);
  const epochs = model.value.epochs;
  return (
    <div class="strip" ref={wrap}>
      {/* ползунок окна карты: стрелки — сдвиг на 10 % (Shift — на 40 %), PageUp и PageDown — эпохи, Home и End — края шкалы */}
      <canvas
        ref={ref}
        tabIndex={0}
        role="slider"
        aria-label="Полоса времени от сотворения до 2040 года: окно карты"
        aria-valuemax={2040}
        aria-orientation="horizontal"
        aria-describedby="strip-help"
        title="Тяните рамку или её края; щелчок вне рамки или по названию эпохи — переход к эпохе, двойной щелчок — всё небо. Столбики — рождения за 25 лет, без лиц, чьё время не установлено"
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
              {typo(`${e.name}, ${formatSpan(toAstro(e.start), toAstro(e.end))}`)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
