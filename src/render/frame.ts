/**
 * Рамка неба (ТЗ § 3.1, «рамка листа»; § 3.4; C4, E7, E9; VIS-21, VIS-23, MAP-09, 30–35, 40, UX-07–10, MOB-08) и то, что
 * привязано к её шкалам:
 *  — линейка лет вверху: один шаг рисок на окно — по самому сжатому месту, подписи прорежены равномерно и стоят у своих
 *    рисок, граница эр — риска во всю высоту линейки, разрыв шкалы после 100 г. — знаком; под рисками — полоса
 *    плотности шкалы: светлее там, где время растянуто (масштаб «по насыщенности»);
 *  — служебная строка под линейкой: названия эпох по их годам (прилипают к левому краю), масштабная линейка
 *    «├─ 50 лет ─┤» справа, подписи черт «завершение канона» и «сегодня»;
 *  — левая кромка: буквы строк атласа (engine/layout.ts, atlasRow); нижняя кромка: номера столбцов атласа между
 *    рисками веков — по ним находится координата указателя «32 П»;
 *  — на самом небе: сетка лет, черты завершения канона и «сегодня», постоянные меридианы событий;
 *  — указатели у края на выбранных лиц за краем окна («→ Давид»).
 * Все функции читают небо через SkyContext и ничего в нём не меняют; надписи рамки пишутся в замер подписей (kind 'frame').
 */
import { alpha } from './color.ts';
import { hits, type Rect } from './rect.ts';
import { mapFont, mapSize, T_MAP_S, T_UI } from './type.ts';
import { T_CANON_END, T_END } from '../engine/timescale.ts';
import { toAstro, toHist } from '../engine/years.ts';
import { atlasColumn, atlasColumnSpan, atlasRow, atlasRowLanes, atlasRowLetter, ATLAS_BAND } from '../engine/layout.ts';
import { byId } from '../data/atlas.ts';
import type { Pass, SkyContext, SkyState } from './sky.ts';

/** Линейка лет вверху рамки. */
export const RULER_H = 26;
/** Служебная строка под линейкой: названия эпох, масштабная линейка, черты канона и «сегодня» (C4, E7). */
export const ROW_H = 18;
/** Верхнее поле рамки целиком: ниже него — открытое небо. */
export const FRAME_H = RULER_H + ROW_H;
/** Нижняя кромка рамки: риски веков и номера столбцов атласа (E9; MAP-40). */
export const BOTTOM_H = 16;
/** Ширина левой кромки с буквами строк; на сенсорном экране шире — буквы там крупнее. */
export const LETTER_W = 18;
export const LETTER_W_TOUCH = 22;
/** Полоса плотности шкалы под рисками линейки, px. */
const DENSITY_H = 3;

// ---------- прежняя координата (до E9) ----------
/** Полос в одной букве прежней левой кромки. Указатель переходит на engine/layout.ts (atlasCoord, ATLAS_BAND). */
export const BAND = 12;
const LETTERS = 'АБВГДЕЖИКЛМНПРСТУФХЦЧШЭЮЯ';
/** Буква полосы band прежней кромки (считая от верхней полосы данных). */
export function bandLetter(band: number): string {
  return LETTERS[band % LETTERS.length] + (band >= LETTERS.length ? String(Math.floor(band / LETTERS.length) + 1) : '');
}
/**
 * Прежняя атласная координата (буквы от верхней полосы данных). На карте теперь — строки от оси коридора
 * (engine/layout.ts, atlasCoord); указатель должен брать координату оттуда же.
 */
export function atlasCoord(t: number, lane: number, laneMax: number): string {
  const col = Math.floor((toHist(t) + 4200) / 100) + 1;
  const band = Math.floor((laneMax - lane + 0.5) / BAND);
  return `${col} ${bandLetter(band)}`;
}

// ---------- линейка лет ----------

export interface YearTick {
  /** год, астрономический */
  t: number;
  /** исторический год (без нулевого) */
  h: number;
  /** подписанная риска (и линия сетки) */
  major: boolean;
}

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
/** Риски не теснее 7 px, подписи — не теснее ширины подписи с полем. */
const TICK_MIN = 7;
const LABEL_MIN = 46;

/** px на год около года t при нынешнем масштабе. */
export const rateAt = (v: SkyContext, t: number) => (v.xOf(t + 0.5) - v.xOf(t - 0.5)) * v.cam.kx;

/**
 * Шаг рисок и подписей для участка [a, b] (астр.): по самому сжатому месту — один шаг на весь участок (MAP-30).
 * Края участка у разрыва шкалы (последние годы перед 100 г. и первые после) в замер не входят: там масштаб переходный.
 */
function stepsFor(v: SkyContext, a: number, b: number): { tick: number; label: number } {
  let minRate = Infinity;
  const N = 48;
  const lo = a >= T_CANON_END ? Math.max(a, T_CANON_END + 20) : a;
  const hi = b <= T_CANON_END ? Math.min(b, T_CANON_END - 10) : b;
  const [p, q] = hi > lo ? [lo, hi] : [a, b];
  for (let k = 0; k <= N; k++) minRate = Math.min(minRate, rateAt(v, p + ((q - p) * k) / N));
  const tick = STEPS.find((s) => s * minRate >= TICK_MIN) ?? 2000;
  const label = STEPS.find((s) => s >= tick && s % tick === 0 && s * minRate >= LABEL_MIN) ?? 2000;
  return { tick, label };
}

/** Риски линейки: круглые исторические годы; до канона и после него — свои шаги (после 100 г. шкала сжата). */
export function yearTicks(v: SkyContext): YearTick[] {
  const cam = v.cam;
  const tL = Math.max(v.scale.knots[0], v.tOf(cam.wx(v.letterW)));
  const tR = Math.min(T_END, v.tOf(cam.wx(cam.w)));
  const out: YearTick[] = [];
  const add = (a: number, b: number) => {
    if (!(b > a)) return;
    const { tick, label } = stepsFor(v, a, b);
    for (let h = Math.ceil(toHist(a) / tick) * tick; toAstro(h) <= b; h += tick) {
      if (h === 0) continue;
      const t = toAstro(h);
      if (t < a) continue;
      out.push({ t, h, major: h % label === 0 });
    }
  };
  add(tL, Math.min(tR, T_CANON_END));
  add(Math.max(tL, T_CANON_END + 1), tR);
  return out;
}

/** Черты завершения канона (Откр — ок. 95 г.) и «сегодня»: шкала неба тянется до 2040 г. */
const CANON = 95;
const today = () => new Date().getFullYear();
/** Пояснение на пустом небе после канона (рисует слой подписей, если есть место). */
export const CANON_NOTE = ['После завершения канона новых лиц Писания нет.', 'Родословие приведено к Иисусу Христу (Мф 1:16; Лк 3:23).'];

/**
 * Черты завершения канона и «сегодня» на небе; подписи к ним — в служебной строке рамки (drawFrame), не на данных
 * (C4; MAP-38).
 */
export function drawTimeMarks(v: SkyContext) {
  const { ctx, cam, pal } = v;
  const H = cam.h;
  for (const [t, dashed] of [[CANON, true], [today(), false]] as const) {
    const x = Math.round(cam.sx(v.xOf(t))) + 0.5;
    if (x < v.letterW || x > cam.w) continue;
    ctx.strokeStyle = alpha(pal.ink3, 0.9);
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [3, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x, FRAME_H);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Сетка лет на небе: по подписанным рискам. */
export function drawGrid(v: SkyContext, ticks: YearTick[]) {
  const { ctx, cam, pal } = v;
  ctx.lineWidth = 1;
  ctx.strokeStyle = alpha(pal.rule, 0.4);
  ctx.beginPath();
  for (const t of ticks) {
    if (!t.major) continue;
    const x = Math.round(cam.sx(v.xOf(t.t))) + 0.5;
    ctx.moveTo(x, FRAME_H);
    ctx.lineTo(x, cam.vp.b);
  }
  ctx.stroke();
}

// ---------- постоянные меридианы событий (E7; MAP-32; ТЗ § 3.1) ----------

export interface EventMark {
  /** год, астрономический */
  t: number;
  name: string;
  /** «Исход, 1446 г. до Р. Х. (расч.)» */
  full: string;
  refs: string[];
}

/**
 * Ключевые события ТЗ § 3.1 — из каталога эпох (data/epochs.json: год и стихи события). Потоп и призвание Аврама
 * зависят от модели хронологии: их год — от рождения Ноя (600-й год, Быт 7:6) и Аврама (75 лет, Быт 12:4) в этой модели.
 */
const EVENTS: { epoch: string; match: RegExp; name: string; from?: { id: string; add: number } }[] = [
  { epoch: 'antediluvian', match: /^Потоп/, name: 'Потоп', from: { id: 'noy', add: 600 } },
  { epoch: 'patriarchs', match: /^Аврам в 75 лет/, name: 'Призвание Аврама', from: { id: 'avraam', add: 75 } },
  { epoch: 'exodus', match: /^Исход/, name: 'Исход' },
  { epoch: 'united', match: /^Закладка храма/, name: 'Закладка храма' },
  { epoch: 'judah-alone', match: /^Разрушение Иерусалима/, name: 'Вавилонский плен' },
  { epoch: 'return', match: /^Указ Кира/, name: 'Возвращение из плена' },
  { epoch: 'christ', match: /^Рождество/, name: 'Рождество Христово' },
];

/** «1446 г. до Р. Х.», «30 г. по Р. Х.» */
export function yearText(t: number): string {
  const h = Math.round(toHist(t));
  return h < 0 ? `${-h} г. до Р. Х.` : `${h} г. по Р. Х.`;
}

const eventCache = new Map<string, EventMark[]>();
/** Меридианы событий этой модели. */
export function eventMarks(v: SkyContext): EventMark[] {
  const m = v.model;
  const hit = eventCache.get(m.id);
  if (hit) return hit;
  const out: EventMark[] = [];
  for (const e of EVENTS) {
    const ep = m.epochs.find((x) => x.id === e.epoch);
    const ev = ep?.events?.find((x) => e.match.test(x.text));
    if (!ev) continue;
    let t = toAstro(ev.year);
    const c = e.from ? m.chrono.get(e.from.id) : undefined;
    if (e.from && c && c.cls === 'exact') t = c.b + e.from.add;
    out.push({ t, name: e.name, full: `${e.name}, ${yearText(t)} (расч.)`, refs: ev.refs ?? [] });
  }
  eventCache.set(m.id, out);
  return out;
}

/** Черты меридианов событий через открытое небо: 1 px, точками, контраст к небу не ниже 3 : 1. */
export function drawEventLines(v: SkyContext): { x: number; e: EventMark }[] {
  const { ctx, cam, pal } = v;
  const out: { x: number; e: EventMark }[] = [];
  ctx.strokeStyle = alpha(pal.ink3, pal.lineAlpha);
  ctx.lineWidth = 1;
  ctx.setLineDash([1, 3]);
  ctx.beginPath();
  for (const e of eventMarks(v)) {
    const x = Math.round(cam.sx(v.xOf(e.t))) + 0.5;
    if (x < v.letterW + 2 || x > cam.w - 2) continue;
    ctx.moveTo(x, v.openTop);
    ctx.lineTo(x, cam.vp.b);
    out.push({ x, e });
  }
  ctx.stroke();
  ctx.setLineDash([]);
  return out;
}

// ---------- масштабная линейка ----------

/** «1 год», «2 года», «50 лет» */
export function yearsWord(n: number): string {
  const a = n % 100;
  const b = n % 10;
  return `${n} ${a > 10 && a < 20 ? 'лет' : b === 1 ? 'год' : b >= 2 && b <= 4 ? 'года' : 'лет'}`;
}

/**
 * Масштабная линейка в середине окна (E7; UX-08): круглое число лет и длина его отрезка в px — от 40 до 120 px.
 * approx — шкала в окне неравномерна (масштаб «по насыщенности»): число — «≈».
 */
export function scaleBar(v: SkyContext): { years: number; px: number; approx: boolean } | null {
  const cam = v.cam;
  const [cx] = cam.vpCenter();
  const tC = v.tOf(cam.wx(cx));
  const rate = rateAt(v, tC);
  if (!(rate > 0)) return null;
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const years = [...nice].reverse().find((n) => n * rate <= 120) ?? 1;
  if (years * rate < 12) return null;
  // неравномерность окна: отношение крайних местных масштабов в видимой части канона
  const a = Math.max(v.scale.knots[0], v.tOf(cam.wx(cam.vp.l)));
  const b = Math.min(T_CANON_END, v.tOf(cam.wx(cam.vp.r)));
  let lo = Infinity;
  let hi = 0;
  for (let k = 0; k <= 16 && b > a; k++) {
    const r = rateAt(v, a + ((b - a) * k) / 16);
    lo = Math.min(lo, r);
    hi = Math.max(hi, r);
  }
  return { years, px: years * rate, approx: v.lambda > 0.01 && hi / lo > 1.2 };
}

// ---------- рамка ----------

/**
 * Рамка листа (C4, E7, E9). Все поля непрозрачные, служебные надписи — только в них; каждая надпись — в замере подписей.
 */
export function drawFrame(v: SkyContext, ticks: YearTick[]) {
  const { ctx, cam, pal } = v;
  const W = cam.w;
  const H = cam.h;
  const LW = v.letterW;
  const bottom = cam.vp.b;
  ctx.fillStyle = pal.sky;
  ctx.fillRect(0, 0, W, FRAME_H);
  ctx.fillRect(0, FRAME_H, LW, H - FRAME_H);
  ctx.fillRect(0, bottom, W, Math.min(BOTTOM_H, H - bottom));
  ctx.strokeStyle = pal.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER_H - 0.5);
  ctx.lineTo(W, RULER_H - 0.5);
  ctx.moveTo(0, FRAME_H - 0.5);
  ctx.lineTo(W, FRAME_H - 0.5);
  ctx.moveTo(LW - 0.5, 0);
  ctx.lineTo(LW - 0.5, bottom + BOTTOM_H);
  ctx.moveTo(0, Math.round(bottom) + 0.5);
  ctx.lineTo(W, Math.round(bottom) + 0.5);
  ctx.stroke();

  drawRuler(v, ticks);
  drawServiceRow(v);
  drawRowLetters(v);
  drawColumns(v);
  ctx.textBaseline = 'alphabetic';
}

/** Линейка: полоса плотности, риски, подписи у своих рисок, граница эр, знак разрыва шкалы. */
function drawRuler(v: SkyContext, ticks: YearTick[]) {
  const { ctx, cam, pal } = v;
  const W = cam.w;
  const LW = v.letterW;
  const base = RULER_H - DENSITY_H - 1;
  // полоса плотности шкалы (MAP-31): светлее — время растянуто; после канона — штриховка сжатого времени
  if (v.lambda > 0.01) {
    // истинная шкала равномерна до конца канона: растяжение — отношение местного масштаба к ней
    const k = v.scale.knots;
    const ci = k.indexOf(T_CANON_END);
    const trueRate = ci > 0 ? (v.scale.xTrue[ci] - v.scale.xTrue[0]) / (T_CANON_END - k[0]) : 0;
    const canonRate = (v.xOf(T_CANON_END) - v.xOf(k[0])) / (T_CANON_END - k[0]);
    // шаг 4 px; год у следующего шага — по местному масштабу (без обратного поиска на каждом шаге)
    let t = v.tOf(cam.wx(LW + 2));
    for (let x = LW; x < W; x += 4) {
      if (t > T_CANON_END) break;
      const r = v.xOf(t + 0.5) - v.xOf(t - 0.5);
      if (t >= v.scale.knots[0]) {
        const s = r / (trueRate || canonRate);
        const u = Math.max(0, Math.min(1, 0.5 + Math.log(s) / Math.log(36)));
        ctx.fillStyle = alpha(pal.ink2, (0.08 + 0.62 * u) * Math.min(1, v.lambda));
        ctx.fillRect(x, RULER_H - DENSITY_H - 0.5, 4, DENSITY_H);
      }
      t += r > 0 ? 4 / (r * cam.kx) : 1;
    }
  }
  const xBreak = cam.sx(v.xOf(T_CANON_END));
  if (xBreak < W - 4) {
    ctx.strokeStyle = alpha(pal.ink3, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.max(LW, xBreak) + 2; x < W; x += 4) {
      ctx.moveTo(x, RULER_H - 1);
      ctx.lineTo(x + 3, RULER_H - DENSITY_H - 1);
    }
    ctx.stroke();
  }

  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: v.coarse });
  ctx.fillStyle = pal.ink3;
  ctx.strokeStyle = pal.ink3;
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  const fs = mapSize(T_MAP_S, v.coarse);
  // риски
  ctx.beginPath();
  let lastTick = -Infinity;
  for (const tk of ticks) {
    const x = Math.round(cam.sx(v.xOf(tk.t))) + 0.5;
    if (x < LW + 2 || x > W - 2) continue;
    if (!tk.major && x - lastTick < 5) continue;
    lastTick = x;
    ctx.moveTo(x, base - (tk.major ? 6 : 3));
    ctx.lineTo(x, base);
  }
  ctx.stroke();
  // граница эр: риска во всю высоту линейки
  const xEra = Math.round(cam.sx(v.xOf(1))) + 0.5;
  const eraIn = xEra > LW + 2 && xEra < W - 2;
  if (eraIn) {
    ctx.beginPath();
    ctx.moveTo(xEra, 2);
    ctx.lineTo(xEra, base);
    ctx.stroke();
  }
  // подписи: у своей риски, по центру; не помещается — не рисуется. Пометка эры «до Р. Х.» / «по Р. Х.» — у первой
  // подписи эры, после которой ей хватает места (на сжатом участке она закрыла бы соседнюю подпись), иначе — у последней
  const labels = ticks.filter((t) => t.major);
  const placed: Rect[] = [];
  if (eraIn) {
    const t = 'Р.\u00a0Х.';
    const tw = ctx.measureText(t).width;
    // справа от риски границы: риска во всю высоту не перечёркивает подпись
    const box = { x: xEra + 2, y: 11 - fs / 2 - 1, w: tw + 4, h: fs + 2 };
    // подпись границы — только если не мешает подписям соседних рисок
    const near = labels.some((tk) => {
      const x = cam.sx(v.xOf(tk.t));
      return x > xEra - 30 && x < xEra + tw + 34;
    });
    if (!near && box.x > LW + 4 && box.x + box.w < W - 4) placed.push(box);
  }
  const items = labels
    .map((tk) => {
      const num = String(Math.abs(tk.h));
      const nw = ctx.measureText(num).width;
      return { tk, num, nw, lx: cam.sx(v.xOf(tk.t)) - nw / 2 };
    })
    .filter((q) => q.lx >= LW + 4 && q.lx + q.nw <= W - 4);
  const eraAt = new Map<number, string>();
  for (const [sign, era] of [[-1, '\u00a0до\u00a0Р.\u00a0Х.'], [1, '\u00a0по\u00a0Р.\u00a0Х.']] as const) {
    const group = items.filter((q) => Math.sign(q.tk.h) === sign);
    if (!group.length) continue;
    const k = group.findIndex((q) => {
      const next = items[items.indexOf(q) + 1];
      const tw = ctx.measureText(q.num + era).width;
      // то же правило, что у подписей ниже: следующая подпись — не ближе 10 px к полю этой
      const stop = Math.min(next ? next.lx - 14 : W - 4, ...placed.filter((b) => b.x > q.lx).map((b) => b.x - 12));
      return q.lx + tw <= stop;
    });
    eraAt.set(group[k >= 0 ? k : group.length - 1].tk.h, era);
  }
  let lastEnd = -Infinity;
  for (const q of items) {
    const text = q.num + (eraAt.get(q.tk.h) ?? '');
    const tw = ctx.measureText(text).width;
    const box = { x: q.lx - 2, y: 11 - fs / 2 - 1, w: tw + 4, h: fs + 2 };
    if (q.lx + tw > W - 4 || box.x < lastEnd + 10 || hits(box, placed)) continue;
    ctx.fillText(text, q.lx, 11);
    v.ledger.add('frame', text, box);
    lastEnd = box.x + box.w;
  }
  for (const b of placed) {
    ctx.fillText('Р. Х.', b.x + 2, 11);
    v.ledger.add('frame', 'Р. Х.', b);
  }
}

/** Служебная строка: масштабная линейка справа, подписи черт канона и «сегодня», названия эпох по их годам (E7). */
function drawServiceRow(v: SkyContext) {
  const { ctx, cam, pal } = v;
  const W = cam.w;
  const LW = v.letterW;
  const rowY = RULER_H + ROW_H / 2;
  const fs = mapSize(T_MAP_S, v.coarse);
  const box = (x: number, w: number) => ({ x: x - 2, y: rowY - fs / 2 - 1, w: w + 4, h: fs + 2 });
  const taken: Rect[] = [];
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: v.coarse });
  ctx.textBaseline = 'middle';

  // масштабная линейка «├─ 50 лет ─┤» (UX-08)
  const bar = scaleBar(v);
  let right = W - 8;
  if (bar) {
    const text = `${bar.approx ? '≈ ' : ''}${yearsWord(bar.years)}`;
    const tw = ctx.measureText(text).width;
    const bx1 = W - 10;
    const bx0 = bx1 - bar.px;
    const tx = bx0 - 6 - tw;
    if (tx > LW + 8) {
      ctx.strokeStyle = pal.ink2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(bx0) + 0.5, rowY - 4);
      ctx.lineTo(Math.round(bx0) + 0.5, rowY + 4);
      ctx.moveTo(Math.round(bx0) + 0.5, Math.round(rowY) + 0.5);
      ctx.lineTo(Math.round(bx1) + 0.5, Math.round(rowY) + 0.5);
      ctx.moveTo(Math.round(bx1) + 0.5, rowY - 4);
      ctx.lineTo(Math.round(bx1) + 0.5, rowY + 4);
      ctx.stroke();
      ctx.fillStyle = pal.ink2;
      ctx.fillText(text, tx, rowY);
      const b = box(tx, bx1 - tx);
      v.ledger.add('frame', text, b);
      taken.push(b);
      right = tx - 12;
    }
  }
  // черты канона и «сегодня» — у своих черт
  ctx.fillStyle = pal.ink3;
  for (const [t, label] of [[CANON, 'завершение канона'], [today(), 'сегодня']] as const) {
    const x = cam.sx(v.xOf(t)) + 4;
    const tw = ctx.measureText(label).width;
    const b = box(x, tw);
    if (x < LW + 8 || x + tw > right || hits(b, taken)) continue;
    ctx.fillText(label, x, rowY);
    v.ledger.add('frame', label, b);
    taken.push(b);
  }
  // эпохи: граница — короткая черта, название — у начала эпохи или у левого края, если начало за краем (MAP-35, UX-10)
  ctx.strokeStyle = alpha(pal.rule, 1);
  ctx.beginPath();
  const eps = v.model.epochs.map((e) => ({ e, a: cam.sx(v.xOf(toAstro(e.start))), b: cam.sx(v.xOf(toAstro(e.end))) }));
  for (const { a } of eps) {
    if (a <= LW + 1 || a >= W - 1) continue;
    ctx.moveTo(Math.round(a) + 0.5, RULER_H + 3);
    ctx.lineTo(Math.round(a) + 0.5, FRAME_H - 3);
  }
  ctx.stroke();
  ctx.fillStyle = pal.ink2;
  // при ярусах эпох названия эпох — в их первом ярусе (tiers.ts), здесь не повторяются
  const tiers = v.openTop > FRAME_H + 20;
  for (const { e, a, b } of tiers ? [] : eps) {
    const x0 = Math.max(a, LW) + 6;
    const x1 = Math.min(b, right + 12, W) - 6;
    if (x1 - x0 < 16) continue;
    for (const text of [e.name, e.short]) {
      const tw = ctx.measureText(text).width;
      if (x0 + tw > x1) continue;
      const bx = box(x0, tw);
      if (hits(bx, taken)) continue;
      ctx.fillText(text, x0, rowY);
      v.ledger.add('frame', text, bx);
      taken.push(bx);
      break;
    }
  }
}

/** Левая кромка: буквы строк атласа по центру видимой части строки; черта — граница строк (E9; UX-07, MOB-08). */
function drawRowLetters(v: SkyContext) {
  const { ctx, cam, pal } = v;
  const LW = v.letterW;
  const top = v.openTop;
  const bottom = cam.vp.b;
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  ctx.fillStyle = pal.ink3;
  ctx.strokeStyle = alpha(pal.rule, 0.9);
  ctx.textBaseline = 'middle';
  const fs = mapSize(T_MAP_S, v.coarse);
  const r0 = atlasRow(cam.wLane(top));
  const r1 = atlasRow(cam.wLane(bottom));
  // строка ниже кегля (всё небо на телефоне под листом карточки): буква у каждой k-й строки, черты — у них же
  const rowH = ATLAS_BAND * cam.ky;
  const every = rowH >= fs + 4 ? 1 : [2, 3, 5].find((k) => k * rowH >= fs + 6) ?? 8;
  ctx.beginPath();
  const letters: { t: string; x: number; y: number; w: number }[] = [];
  for (let r = r0; r <= r1; r++) {
    const [lo, hi] = atlasRowLanes(r);
    const y0 = cam.sy(hi + 0.5);
    const y1 = cam.sy(lo - 0.5);
    const shown = ((r % every) + every) % every === 0;
    if (y1 > top && y1 < bottom && (every === 1 || shown || rowH >= 5)) {
      ctx.moveTo(every === 1 || shown ? 0 : LW - 5, Math.round(y1) + 0.5);
      ctx.lineTo(LW, Math.round(y1) + 0.5);
    }
    if (!shown) continue;
    // буква — по середине видимой части строки; у прореженных — у верха строки, где она помещается
    const a = Math.max(y0, top);
    const b = Math.min(every === 1 ? y1 : y0 + Math.max(rowH, fs + 6), bottom);
    if (b - a < fs + 4) continue;
    const t = atlasRowLetter(r);
    const w = ctx.measureText(t).width;
    letters.push({ t, x: Math.max(1, (LW - w) / 2), y: every === 1 ? (a + b) / 2 : a + fs / 2 + 2, w });
  }
  ctx.stroke();
  for (const l of letters) {
    ctx.fillText(l.t, l.x, l.y);
    v.ledger.add('frame', l.t, { x: l.x - 1, y: l.y - fs / 2 - 1, w: l.w + 2, h: fs + 2 });
  }
}

/**
 * Нижняя кромка: риски веков — границы столбцов атласа (100 лет от 4200 г. до Р. Х.) и номера столбцов по центру их
 * видимой части; на узких столбцах — каждый k-й номер, равномерно (E9; MAP-34, 40). После канона столбцов нет.
 */
function drawColumns(v: SkyContext) {
  const { ctx, cam, pal } = v;
  const LW = v.letterW;
  const W = cam.w;
  const y0 = Math.round(cam.vp.b) + 0.5;
  if (y0 + BOTTOM_H > cam.h + 1) return;
  const tL = Math.max(v.scale.knots[0], v.tOf(cam.wx(LW)));
  const tR = Math.min(T_CANON_END, v.tOf(cam.wx(W)));
  if (!(tR > tL)) return;
  const c0 = atlasColumn(tL);
  const c1 = atlasColumn(tR - 0.001);
  const cols: { c: number; a: number; b: number }[] = [];
  for (let c = c0; c <= c1; c++) {
    const [s, e] = atlasColumnSpan(c);
    cols.push({ c, a: cam.sx(v.xOf(s)), b: cam.sx(v.xOf(e)) });
  }
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: v.coarse });
  ctx.textBaseline = 'middle';
  const fs = mapSize(T_MAP_S, v.coarse);
  // шаг номеров — по самому узкому столбцу окна
  const minW = Math.min(...cols.map((q) => q.b - q.a));
  const need = ctx.measureText('44').width + 8;
  const every = [1, 2, 5, 10].find((k) => k * minW >= need) ?? 20;
  ctx.strokeStyle = alpha(pal.ink3, 0.8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const q of cols) {
    if (q.a > LW + 1 && q.a < W - 1 && (minW >= 5 || (q.c - 1) % every === 0)) {
      ctx.moveTo(Math.round(q.a) + 0.5, y0);
      ctx.lineTo(Math.round(q.a) + 0.5, y0 + 5);
    }
  }
  ctx.stroke();
  ctx.fillStyle = pal.ink3;
  const ym = y0 + BOTTOM_H / 2 + 0.5;
  // номер — по центру видимой части своего столбца; у прореженных номеров есть и место соседних столбцов без номера
  const spare = (every - 1) * minW;
  let lastEnd = -Infinity;
  for (const q of cols) {
    if (every > 1 && (q.c - 1) % every !== 0) continue;
    const a = Math.max(q.a, LW + 2);
    const b = Math.min(q.b, W - 2);
    const t = String(q.c);
    const w = ctx.measureText(t).width;
    if (b - a + spare < w + 4) continue;
    const x = Math.max(LW + 3, Math.min(W - 3 - w, (a + b) / 2 - w / 2));
    if (x < lastEnd + 4) continue;
    lastEnd = x + w;
    ctx.fillText(t, x, ym);
    v.ledger.add('frame', t, { x: x - 1, y: ym - fs / 2 - 1, w: w + 2, h: fs + 2 });
  }
}

// ---------- указатели у края ----------

/** Указатель у края: прямоугольник в px холста и лицо, к которому он ведёт. */
export interface EdgeHit extends Rect {
  id: string;
  /** текст и место текста */
  label: string;
  lx: number;
  ly: number;
}

/**
 * Указатели на выбранных за краем экрана («→ Давид»): по щелчку — перелёт. Не заходят под органы неба (C4; MAP-37).
 * Места считаются до подписей звёзд, чтобы подписи на них не ложились; рисуются последними (paintWayfinding).
 */
export function placeWayfinding(v: SkyContext, s: SkyState, p: Pass | null): EdgeHit[] {
  const { ctx, cam } = v;
  const W = cam.w;
  const top = v.openTop;
  const bottom = cam.vp.b;
  const out: EdgeHit[] = [];
  const placed: Rect[] = [];
  for (const id of [s.selected, s.second]) {
    if (!id) continue;
    const i = v.indexOf(id);
    if (i === undefined) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    const inside = x > v.letterW && x < W && y > top && y < bottom;
    if (inside) continue;
    const name = byId.get(id)!.name;
    let arrow = '';
    if (y < top) arrow = '↑';
    else if (y > bottom) arrow = '↓';
    else if (x < v.letterW) arrow = '←';
    else arrow = '→';
    const label = `${arrow} ${name}`;
    ctx.font = mapFont(T_UI, { sans: true, weight: 500, coarse: v.coarse });
    const tw = ctx.measureText(label).width;
    let lx = Math.max(v.letterW + 6, Math.min(W - tw - 10, x - tw / 2));
    let ly = Math.max(top + 18, Math.min(bottom - 10, y));
    // под органами неба, колонкой кнопок, вступлением и другим указателем — сдвиг вверх или вниз, затем влево
    const box = () => ({ x: lx - 5, y: ly - 13, w: tw + 10, h: 18 });
    const taken = [...(s.reserve ?? []), ...placed];
    for (let k = 0; k < 6 && hits(box(), taken); k++) {
      const r = taken.find((q) => hits(box(), [q]))!;
      const up = r.y - 8;
      const down = r.y + r.h + 18;
      if (up - 13 >= top + 4 && (Math.abs(up - ly) <= Math.abs(down - ly) || down > bottom - 4)) ly = up;
      else if (down <= bottom - 4) ly = down;
      else lx = Math.max(v.letterW + 6, r.x - tw - 16);
    }
    const b = box();
    out.push({ ...b, id, label, lx, ly });
    placed.push(b);
    p?.placer.add(b);
  }
  return out;
}

/** Нарисовать указатели у края (после рамки и ярусов) и записать их в замер. */
export function paintWayfinding(v: SkyContext, edges: EdgeHit[]) {
  const { ctx, pal } = v;
  ctx.font = mapFont(T_UI, { sans: true, weight: 500, coarse: v.coarse });
  ctx.textBaseline = 'alphabetic';
  for (const e of edges) {
    ctx.fillStyle = pal.sky;
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.strokeStyle = pal.ruleStrong;
    ctx.lineWidth = 1;
    ctx.strokeRect(e.x - 0.5, e.y - 0.5, e.w + 1, e.h + 1);
    ctx.fillStyle = pal.ink;
    ctx.fillText(e.label, e.lx, e.ly);
    v.ledger.add('edge', e.label, { x: e.x, y: e.y, w: e.w, h: e.h }, e.id);
  }
}

/** Указатели у края: место и рисунок разом (для тех, кто рисует небо без слоя подписей). */
export function drawWayfinding(v: SkyContext, s: SkyState): EdgeHit[] {
  const e = placeWayfinding(v, s, null);
  paintWayfinding(v, e);
  return e;
}
