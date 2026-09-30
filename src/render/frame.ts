/**
 * Рамка неба (ТЗ § 3.1, «рамка листа»; § 3.4; C4, E7, E9; VIS-21, VIS-23, MAP-09, 30–35, 40, UX-07–10, MOB-08) и то, что
 * привязано к её шкалам:
 *  — линейка лет вверху: один шаг рисок на окно — по самому сжатому месту, подписи прорежены равномерно и стоят у своих
 *    рисок, граница эр — риска во всю высоту линейки, разрыв шкалы после 100 г. — знаком; под рисками — полоса
 *    плотности шкалы: светлее там, где время растянуто (масштаб «сжатый по плотности лиц»);
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
import { dateText, toAstro, toHist } from '../engine/years.ts';
import { atlasColumn, atlasColumnSpan, atlasRow, atlasRowLanes, atlasRowLetter, ATLAS_BAND } from '../engine/layout.ts';
import { byId, groupById, models } from '../data/atlas.ts';
import { rulerScale as rulerScaleSignal } from '../state.ts';
import { nameCase } from '../ui/text/ru.ts';
import type { Pass, SkyContext, SkyState } from './sky.ts';

/** Линейка лет вверху рамки. */
export const RULER_H = 26;
/** Служебная строка под линейкой: названия эпох, масштабная линейка, черты канона и «сегодня» (C4, E7). */
export const ROW_H = 18;
/** Верхнее поле рамки целиком: ниже него — открытое небо. */
export const FRAME_H = RULER_H + ROW_H;
/** Нижняя кромка рамки: риски веков и номера столбцов атласа (E9; MAP-40). */
export const BOTTOM_H = 16;
/**
 * Ширина левой кромки с буквами строк — на две литеры («Ю», «А2» ниже «Я»; UX-07); на сенсорном экране шире — буквы
 * там крупнее.
 */
export const LETTER_W = 22;
export const LETTER_W_TOUCH = 26;
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

// ---------- шкала лет линейки (ТЗ § 3.4; этап 13, решение 102): «Вид» → «Шкала» ----------

/**
 * Шкала подписей линейки: ad — «до / по Р. Х.»; am — лет от сотворения Адама по числам Быт 5; 11 выбранной модели
 * (расч.); byz — византийская эра, от 5508 г. до Р. Х. (справ.). Выбор — src/state.ts, rulerScale.
 */
export type RulerScale = 'ad' | 'am' | 'byz';
/** Шкала линейки сейчас. */
export const rulerScale = (_v?: SkyContext): RulerScale => rulerScaleSignal.peek() as RulerScale;
/** Византийская эра: 1 г. по Р. Х. — 5509 г. от сотворения мира (начало эры — 5508 г. до Р. Х.). */
export const BYZ_OFFSET = 5508;
/** Год сотворения Адама в модели неба (астр.): у модели по умолчанию — 4174 г. до Р. Х. */
export function creationYear(v: Pick<SkyContext, 'model'>): number {
  return v.model.chrono.get('adam')?.b ?? toAstro(v.model.epochs[0]?.start ?? -4174);
}
/** Подпись года на шкале: ad — исторический год (−1446), am — лет от сотворения, byz — год византийской эры. */
export function scaleValue(v: Pick<SkyContext, 'model'>, t: number, scale: RulerScale = rulerScale()): number {
  if (scale === 'ad') return toHist(t);
  return Math.round(t + (scale === 'am' ? -creationYear(v) : BYZ_OFFSET));
}
/** Год (астр.) подписи value шкалы scale. */
function scaleTime(v: Pick<SkyContext, 'model'>, value: number, scale: RulerScale): number {
  if (scale === 'ad') return toAstro(value);
  return value - (scale === 'am' ? -creationYear(v) : BYZ_OFFSET);
}
/** Эра подписи: ad — знак года; у лет от сотворения и византийской эры одна эра. */
const eraSign = (h: number, scale: RulerScale) => (scale === 'ad' ? Math.sign(h) : 1);
/** Слова эр шкалы — у первой нарисованной подписи каждой эры. */
function eraWords(scale: RulerScale): [number, string][] {
  if (scale === 'am') return [[1, '\u00a0от\u00a0сотворения']];
  if (scale === 'byz') return [[1, '\u00a0от\u00a0с.\u00a0м. (визант.)']];
  return [
    [-1, '\u00a0до\u00a0Р.\u00a0Х.'],
    [1, '\u00a0по\u00a0Р.\u00a0Х.'],
  ];
}

/**
 * Риски линейки: круглые годы шкалы (до / по Р. Х., лет от сотворения, византийской эры); до канона и после него —
 * свои шаги (после 100 г. шкала сжата). h — подпись риски: исторический год или год шкалы.
 */
export function yearTicks(v: SkyContext): YearTick[] {
  const cam = v.cam;
  const scale = rulerScale(v);
  const tL = Math.max(v.scale.knots[0], v.tOf(cam.wx(v.letterW)));
  const tR = Math.min(T_END, v.tOf(cam.wx(cam.w)));
  const out: YearTick[] = [];
  const add = (a: number, b: number) => {
    if (!(b > a)) return;
    const { tick, label } = stepsFor(v, a, b);
    for (let h = Math.ceil(scaleValue(v, a, scale) / tick) * tick; scaleTime(v, h, scale) <= b; h += tick) {
      // нулевого года нет; до сотворения и до начала византийской эры подписей нет
      if (scale === 'ad' ? h === 0 : h < 0) continue;
      const t = scaleTime(v, h, scale);
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
 * Ключевые события ТЗ § 3.1 — из каталога эпох этой модели (ModelData.epochs: год и стихи события). Годы событий,
 * заданные числами Писания (Потоп, призвание Аврама), каталог уже пересчитал для модели (engine/epochs.ts; CARD-60).
 */
const EVENTS: { epoch: string; match: RegExp; name: string; approx?: boolean }[] = [
  { epoch: 'antediluvian', match: /^Потоп/, name: 'Потоп' },
  { epoch: 'patriarchs', match: /^Аврам в 75 лет/, name: 'Призвание Аврама' },
  { epoch: 'exodus', match: /^Исход/, name: 'Исход' },
  { epoch: 'united', match: /^Закладка храма/, name: 'Закладка храма' },
  { epoch: 'judah-alone', match: /^Разрушение Иерусалима/, name: 'Вавилонский плен' },
  { epoch: 'return', match: /^Указ Кира/, name: 'Возвращение из плена' },
  // год Рождества — не по числам текста, а по внешней опоре (смерть Ирода, 4 г. до Р. Х.): «ок. 5 г. до Р. Х.» (решение
  // 102; «О хронологии» — почему Рождество раньше отметки «Р. Х.»)
  { epoch: 'christ', match: /^Рождество/, name: 'Рождество Христово', approx: true },
];

/** «1446 г. до Р. Х.», «30 г. по Р. Х.» — словарём дат (engine/years.ts, dateText; решение 96). */
export function yearText(t: number): string {
  return dateText({ t });
}

const eventCache = new Map<string, EventMark[]>();
/**
 * Меридианы событий этой модели. Подпись: «Исход, 1446 г. до Р. Х. (расч.)», «Рождество Христово, ок. 5 г. до Р. Х.».
 * В модели не по умолчанию у Исхода — «во всех моделях» (решение 102): модель меняет только годы до Исхода.
 */
export function eventMarks(v: SkyContext): EventMark[] {
  const m = v.model;
  const hit = eventCache.get(m.id);
  if (hit) return hit;
  const out: EventMark[] = [];
  for (const e of EVENTS) {
    const ep = m.epochs.find((x) => x.id === e.epoch);
    const ev = ep?.events?.find((x) => e.match.test(x.text));
    if (!ev) continue;
    const t = toAstro(ev.year);
    const year = dateText({ t, ...(e.approx ? { approx: true } : {}) });
    const note = e.approx ? '' : e.name === 'Исход' && m.id !== models[0]?.id ? ' (расч.; во всех моделях — 3 Цар 6:1)' : ' (расч.)';
    out.push({ t, name: e.name, full: `${e.name}, ${year}${note}`, refs: ev.refs ?? [] });
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
 * approx — шкала в окне неравномерна (масштаб «сжатый по плотности лиц»): число — «≈».
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
 * Что ещё пишет служебная строка справа (решение 30): свёрнутое. folds — знаки свёрнутого неба (src/render/rows.ts,
 * planSky): «колено Иудино (358)», «потомки Давида (62)».
 */
export interface ServiceExtra {
  /**
   * @deprecated Модель хронологии больше не пишется в служебной строке (этап 13, решение 102): её называет строка показа
   * (src/ui/modelinfo.ts, modelBar). Поле читается только прежними вызовами и ничего не рисует.
   */
  model?: string | null;
  folds?: readonly { kind: 'desc' | 'group'; id: string; count: number }[];
  /** флажок меридиана на служебной строке (marks.ts, meridianFlagAt): надписи строки его обходят (MAP-33) */
  flag?: Rect | null;
}
/** Команда в служебной строке: прямоугольник (px холста) и что она разворачивает — одно свёрнутое или всё. */
export type ServiceHit = Rect & { kind: 'desc' | 'group' | 'all'; id: string };

/**
 * Рамка листа (C4, E7, E9). Все поля непрозрачные, служебные надписи — только в них; каждая надпись — в замере подписей.
 * Возвращает команды служебной строки («Свёрнуто: … — развернуть»).
 */
export function drawFrame(v: SkyContext, ticks: YearTick[], extra: ServiceExtra = {}): ServiceHit[] {
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
  const cmds = drawServiceRow(v, extra);
  drawRowLetters(v);
  drawColumns(v);
  ctx.textBaseline = 'alphabetic';
  return cmds;
}

/** Первое слово названия созвездия — нарицательное: в строке «Свёрнуто: колено Иудино» оно пишется со строчной. */
const COMMON = /^(Колено|Дом|Род|Сыны|Цари|Священники|Двор|Плен|Церковь|Апостолы|Прочие|Родословие|Патриархи|Хорреи|Измаильтяне|От)(\s|$)/;
/** Название созвездия в строке: «колено Иудино», «Моав». */
export function groupInLine(name: string): string {
  return COMMON.test(name) ? name[0].toLowerCase() + name.slice(1) : name;
}
/**
 * Пункт строки «Свёрнуто: …» (решение 30): «колено Иудино (358)»; потомки — «потомки Давида (62)», если имя надёжно
 * склоняется, иначе «Давид — потомки (62)» (имя не подставляется в падеж без склонения).
 */
export function foldItemText(f: { kind: 'desc' | 'group'; id: string; count: number }): string {
  if (f.kind === 'group') return `${groupInLine(groupById.get(f.id)?.name ?? f.id)} (${f.count})`;
  const q = byId.get(f.id);
  const g = q ? nameCase(q.name, q.sex, 'gen', q.unnamed) : null;
  return g ? `потомки ${g} (${f.count})` : `${q?.name ?? f.id} — потомки (${f.count})`;
}

/** Линейка: полоса плотности, риски, подписи у своих рисок, граница эр, знак разрыва шкалы. */
function drawRuler(v: SkyContext, ticks: YearTick[]) {
  const { ctx, cam, pal } = v;
  const W = cam.w;
  const LW = v.letterW;
  const base = RULER_H - DENSITY_H - 1;
  // полоса плотности шкалы (MAP-31): светлее — время растянуто; после канона — штриховка сжатого времени
  if (v.lambda > 0.01) {
    // равномерная шкала — до конца канона: растяжение — отношение местного масштаба к ней
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
  // граница эр: риска во всю высоту линейки (у шкалы «до / по Р. Х.»)
  const scale = rulerScale(v);
  const xEra = Math.round(cam.sx(v.xOf(1))) + 0.5;
  const eraIn = xEra > LW + 2 && xEra < W - 2 && scale === 'ad';
  if (eraIn) {
    ctx.beginPath();
    ctx.moveTo(xEra, 2);
    ctx.lineTo(xEra, base);
    ctx.stroke();
  }
  // подписи: у своей риски, по центру; не помещается — не рисуется. Эра («до Р. Х.», «по Р. Х.», «от сотворения») —
  // в каждом окне, у первой нарисованной подписи каждой эры (этап 13, решение 102; П22): если подписи с эрой тесно,
  // уступает соседний круглый год, а не эра; если эре нет места ни у одной подписи — она стоит одна в свободном месте
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
  type Item = (typeof items)[number];
  const boxOf = (q: Item, text: string) => ({ x: q.lx - 2, y: 11 - fs / 2 - 1, w: ctx.measureText(text).width + 4, h: fs + 2 });
  // 1) числа без эры — слева направо, не теснее 10 px
  let lastEnd = -Infinity;
  const chosen: { q: Item; text: string; box: Rect }[] = [];
  for (const q of items) {
    const box = boxOf(q, q.num);
    if (box.x < lastEnd + 10 || hits(box, placed)) continue;
    chosen.push({ q, text: q.num, box });
    lastEnd = box.x + box.w;
  }
  // 2) эра — у первой из нарисованных подписей своей эры, где она помещается; соседи справа уступают ей место
  const eras = eraWords(scale);
  const alone: { text: string; sign: number }[] = [];
  for (const [sign, era] of eras) {
    const own = chosen.filter((c) => eraSign(c.q.tk.h, scale) === sign);
    if (!own.length) continue;
    let done = false;
    for (const c of own) {
      const text = c.q.num + era;
      const box = boxOf(c.q, text);
      if (box.x + box.w > W - 4 || hits(box, placed)) continue;
      const k = chosen.indexOf(c);
      // левый сосед не задет (подпись растёт вправо); правые соседи ближе 10 px — уступают
      if (k > 0 && chosen[k - 1].box.x + chosen[k - 1].box.w + 10 > box.x) continue;
      c.text = text;
      c.box = box;
      for (let j = k + 1; j < chosen.length && chosen[j].box.x < box.x + box.w + 10; ) chosen.splice(j, 1);
      done = true;
      break;
    }
    if (!done) alone.push({ text: era.trim(), sign });
  }
  const written: Rect[] = [];
  for (const c of chosen) {
    ctx.fillText(c.text, c.q.lx, 11);
    v.ledger.add('frame', c.text, c.box);
    written.push(c.box);
  }
  // эра без подписи рядом: одна, в свободном промежутке линейки — у своих подписей
  const aloneShown: string[] = [];
  for (const a of alone) {
    const tw = ctx.measureText(a.text).width;
    const own = chosen.filter((c) => eraSign(c.q.tk.h, scale) === a.sign).map((c) => c.box);
    const taken = [...written, ...placed].sort((p, q) => p.x - q.x);
    const gaps: [number, number][] = [];
    let at = LW + 4;
    for (const b of taken) {
      if (b.x - 10 > at) gaps.push([at, b.x - 10]);
      at = Math.max(at, b.x + b.w + 10);
    }
    if (W - 4 > at) gaps.push([at, W - 4]);
    const mid = own.length ? (own[0].x + own[own.length - 1].x + own[own.length - 1].w) / 2 : (LW + W) / 2;
    const fit = gaps.filter(([p, q]) => q - p >= tw + 4).sort((g, h) => Math.abs((g[0] + g[1]) / 2 - mid) - Math.abs((h[0] + h[1]) / 2 - mid))[0];
    if (!fit) continue;
    const x = Math.max(fit[0] + 2, Math.min(fit[1] - tw - 2, mid - tw / 2));
    const box = { x: x - 2, y: 11 - fs / 2 - 1, w: tw + 4, h: fs + 2 };
    ctx.fillText(a.text, x, 11);
    v.ledger.add('frame', a.text, box);
    written.push(box);
    aloneShown.push(a.text);
  }
  for (const b of placed) {
    ctx.fillText('Р. Х.', b.x + 2, 11);
    v.ledger.add('frame', 'Р. Х.', b);
  }
  // подписи линейки — для проверок приёмки (tools/accept/time13.ts, П22): «1000 до Р. Х.|950|900…»
  const cv = (ctx as { canvas?: unknown }).canvas as HTMLCanvasElement | undefined;
  if (cv && typeof cv === 'object' && cv.dataset) {
    const ruler = [...chosen.map((c) => c.text), ...aloneShown, ...placed.map(() => 'Р. Х.')].join('|');
    if (cv.dataset.ruler !== ruler) cv.dataset.ruler = ruler;
  }
  // подпись полосы плотности (MAP-31) — один раз, в самом широком промежутке между подписями лет над полосой
  if (v.lambda > 0.01) densityCaption(v, [...written, ...placed], Math.min(W - 4, xBreak));
}

/**
 * Подсказка отметки «Р. Х.» на линейке (решение 102; X2 § 2.6): почему меридиан «Рождество Христово» стоит левее неё.
 * Показывает её input.ts при наведении на надпись «Р. Х.» (ledger, kind 'frame').
 */
export const ERA_NOTE =
  'Р. Х. — начало счёта лет «от Рождества Христова»: 1 г. до Р. Х. и сразу 1 г. по Р. Х., нулевого года нет. Само Рождество — ок. 5 г. до Р. Х.: Иисус родился «во дни царя Ирода» (Мф 2:1), а Ирод умер в 4 г. до Р. Х. Подробнее — «О хронологии».';

/** Подпись полосы плотности шкалы: что значит её светлота (MAP-31). Короче — если длинная не помещается. */
export const DENSITY_CAPTIONS = ['полоса: светлее — время растянуто', 'светлее — время растянуто'];

/**
 * Подпись полосы плотности под рисками (MAP-31): курсивом --ink-3 в строке лет, в самом широком промежутке между
 * подписями лет, пока полоса идёт (до конца канона). Нет места — не пишется.
 */
function densityCaption(v: SkyContext, taken: Rect[], xEnd: number) {
  const { ctx, pal } = v;
  const fs = mapSize(T_MAP_S, v.coarse);
  ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
  const xs = taken.map((b) => [b.x, b.x + b.w] as const).sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let at = v.letterW + 4;
  for (const [a, b] of xs) {
    if (a > at) gaps.push([at, Math.min(a, xEnd)]);
    at = Math.max(at, b);
  }
  if (xEnd > at) gaps.push([at, xEnd]);
  gaps.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
  const g = gaps[0];
  if (g)
    for (const text of DENSITY_CAPTIONS) {
      const tw = ctx.measureText(text).width;
      if (g[1] - g[0] < tw + 24) continue;
      const x = g[0] + 12;
      ctx.fillStyle = pal.ink3;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, 11);
      v.ledger.add('frame', text, { x: x - 2, y: 11 - fs / 2 - 1, w: tw + 4, h: fs + 2 });
      break;
    }
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: v.coarse });
}

/**
 * Служебная строка: масштабная линейка справа, левее — модель хронологии, если она не по умолчанию (решение 35), и
 * «Свёрнуто: … — развернуть» (решение 30; пункты и «развернуть» подчёркнуты — это команды), подписи черт канона
 * и «сегодня», названия эпох по их годам (E7).
 */
function drawServiceRow(v: SkyContext, extra: ServiceExtra): ServiceHit[] {
  const { ctx, cam, pal } = v;
  const W = cam.w;
  const LW = v.letterW;
  const rowY = RULER_H + ROW_H / 2;
  const fs = mapSize(T_MAP_S, v.coarse);
  const box = (x: number, w: number) => ({ x: x - 2, y: rowY - fs / 2 - 1, w: w + 4, h: fs + 2 });
  // флажок меридиана (MAP-33) — занятое место строки: названия эпох и подписи черт его обходят
  const taken: Rect[] = extra.flag ? [extra.flag] : [];
  /** Левый край строки шириной w, которая кончается не правее xr и не ложится на занятое: сдвиг влево за помеху. */
  const leftOf = (xr: number, w: number): number => {
    let x = xr - w;
    for (let k = 0; k < 6; k++) {
      const hit = taken.find((t) => hits(box(x, w), [t]));
      if (!hit) break;
      x = hit.x - 12 - w;
    }
    return x;
  };
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: v.coarse });
  ctx.textBaseline = 'middle';

  // «сегодня» — первым: оно подписано всегда (MAP-78; ТЗ § 11.2, п. 7), справа от черты, а если справа нет места — слева
  const marks = markLabels(v);
  const today = marks.find((m) => m.label === 'сегодня');
  if (today) placeMark(v, today, box, taken, W - 4);

  // масштабная линейка «масштаб ├──┤ 20 лет» (UX-08; этап 13, X2 § 2.6): у правого края, левее «сегодня», если подпись
  // черты там; слово «масштаб» слева — чтобы число не читалось вместе с названием эпохи («Христос ≈ 50 лет»), и не
  // ближе 24 px к названию эпохи (место слева от «масштаб» занято)
  const bar = scaleBar(v);
  let right = W - 8;
  if (bar) {
    const word = 'масштаб';
    const text = `${bar.approx ? '≈\u00a0' : ''}${yearsWord(bar.years)}`;
    const ww = ctx.measureText(word).width;
    const tw = ctx.measureText(text).width;
    const full = ww + 6 + bar.px + 6 + tw;
    const x0 = leftOf(W - 10, full);
    const bx0 = x0 + ww + 6;
    const bx1 = bx0 + bar.px;
    if (x0 > LW + 8) {
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
      ctx.fillStyle = pal.ink3;
      ctx.fillText(word, x0, rowY);
      ctx.fillStyle = pal.ink2;
      ctx.fillText(text, bx1 + 6, rowY);
      v.ledger.add('frame', word, box(x0, ww));
      v.ledger.add('frame', text, box(bx1 + 6, tw));
      // занятое место — с полем 22 px слева: название эпохи встаёт не ближе 24 px
      taken.push(box(x0 - 22, full + 22));
      right = x0 - 24;
    }
  }
  const cmds: ServiceHit[] = [];
  // модели хронологии здесь больше нет (этап 13, решение 102): её называет строка показа у кромки неба
  // (src/ui/modelinfo.ts, modelBar) — в строке эпох она читалась как ещё одна эпоха
  // свёрнутое (решение 30): «Свёрнуто: колено Иудино (358), потомки Давида (62) — развернуть»; тесно — первые пункты
  // и «ещё N»; каждый пункт разворачивает своё, «развернуть» — всё
  const folds = extra.folds ?? [];
  if (folds.length) {
    const items = folds.map(foldItemText);
    for (let k = items.length; k >= 1; k--) {
      const rest = items.length - k;
      const parts: { t: string; hit?: { kind: 'desc' | 'group' | 'all'; id: string } }[] = [{ t: 'Свёрнуто: ' }];
      items.slice(0, k).forEach((t, j) => {
        if (j) parts.push({ t: ', ' });
        parts.push({ t, hit: { kind: folds[j].kind, id: folds[j].id } });
      });
      if (rest) parts.push({ t: ` и ещё ${rest}` });
      parts.push({ t: ' — ' }, { t: 'развернуть', hit: { kind: 'all', id: '' } });
      const ws = parts.map((q) => ctx.measureText(q.t).width);
      const tw = ws.reduce((a, b) => a + b, 0);
      const x0 = leftOf(right, tw);
      if (x0 < LW + 8 && k > 1) continue;
      if (x0 < LW + 8) break;
      let x = x0;
      parts.forEach((q, j) => {
        ctx.fillStyle = q.hit ? pal.ink : pal.ink2;
        ctx.fillText(q.t, x, rowY);
        if (q.hit) {
          ctx.fillRect(Math.round(x), Math.round(rowY + fs / 2), Math.round(ws[j]), 1);
          cmds.push({ x: x - 2, y: RULER_H, w: ws[j] + 4, h: ROW_H, ...q.hit });
        }
        x += ws[j];
      });
      const b = box(x0, tw);
      v.ledger.add('frame', parts.map((q) => q.t).join(''), b);
      taken.push(b);
      right = x0 - 14;
      break;
    }
  }
  // черта завершения канона — у своей черты: справа, а у правого края — слева (MAP-78)
  for (const m of marks) if (m !== today) placeMark(v, m, box, taken, right + 12);
  // эпохи: граница — короткая черта, название — у начала эпохи или у левого края, если начало за краем (MAP-35, UX-10);
  // под флажком меридиана и другой надписью строки — сразу за ней, в пределах эпохи (MAP-33)
  ctx.strokeStyle = alpha(pal.rule, 1);
  ctx.beginPath();
  const eps = v.model.epochs.map((e) => ({ e, a: cam.sx(v.xOf(toAstro(e.start))), b: cam.sx(v.xOf(toAstro(e.end))) }));
  for (const { a } of eps) {
    if (a <= LW + 1 || a >= W - 1) continue;
    ctx.moveTo(Math.round(a) + 0.5, RULER_H + 3);
    ctx.lineTo(Math.round(a) + 0.5, FRAME_H - 3);
  }
  ctx.stroke();
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: v.coarse });
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink2;
  // при ярусах эпох названия эпох — в их первом ярусе (tiers.ts), здесь не повторяются
  const tiers = v.openTop > FRAME_H + 20;
  // имена одного вида в строке (этап 13, решение 99): полные, если полное помещается у каждой эпохи, где помещается
  // краткое; иначе — у всех краткие. Краткое имя — узнаваемое сокращение полного (data/epochs.json, short)
  const spans = (tiers ? [] : eps)
    .map(({ e, a, b }) => ({ e, x0: Math.max(a, LW) + 6, x1: Math.min(b, W) - 6 }))
    .filter((q) => q.x1 - q.x0 >= 16);
  const place = (full: boolean, dry: boolean): boolean => {
    const mine: Rect[] = [];
    let all = true;
    for (const { e, x0, x1 } of spans) {
      const text = full ? e.name : e.short;
      const tw = ctx.measureText(text).width;
      // места: начало эпохи, затем — сразу за каждой помехой строки внутри эпохи
      const busy = [...taken, ...mine];
      const starts = [x0, ...busy.filter((t) => t.x + t.w > x0 && t.x < x1).map((t) => t.x + t.w + 8)].filter((x) => x >= x0).sort((p, q) => p - q);
      const x = starts.find((x) => x + tw <= x1 && !hits(box(x, tw), busy));
      if (x === undefined) {
        // эпоха, где не помещается и краткое имя, выбор вида не решает
        const sw = ctx.measureText(e.short).width;
        if (full && starts.some((xs) => xs + sw <= x1 && !hits(box(xs, sw), busy))) all = false;
        continue;
      }
      const bx = box(x, tw);
      mine.push(bx);
      if (dry) continue;
      ctx.fillText(text, x, rowY);
      v.ledger.add('frame', text, bx);
      taken.push(bx);
    }
    return all;
  };
  place(place(true, true), false);
  return cmds;
}

/** Подписи черт на служебной строке: «завершение канона» и «сегодня» — где их черты в окне. */
function markLabels(v: SkyContext): { label: string; x: number }[] {
  const out: { label: string; x: number }[] = [];
  for (const [t, label] of [[CANON, 'завершение канона'], [today(), 'сегодня']] as const) {
    const x = v.cam.sx(v.xOf(t));
    if (x >= v.letterW && x <= v.cam.w) out.push({ label, x });
  }
  return out;
}

/**
 * Подпись черты (MAP-78): справа от неё, если помещается до xr и не ложится на занятое, иначе слева от неё. Рисует,
 * пишет в замер и занимает место. false — места нет ни с одной стороны.
 */
function placeMark(v: SkyContext, m: { label: string; x: number }, box: (x: number, w: number) => Rect, taken: Rect[], xr: number): boolean {
  const { ctx, pal } = v;
  const tw = ctx.measureText(m.label).width;
  for (const x of [m.x + 4, m.x - 4 - tw]) {
    const b = box(x, tw);
    if (x < v.letterW + 8 || x + tw > Math.min(xr, v.cam.w - 4) || hits(b, taken)) continue;
    ctx.fillStyle = pal.ink3;
    ctx.fillText(m.label, x, RULER_H + ROW_H / 2);
    v.ledger.add('frame', m.label, b);
    taken.push(b);
    return true;
  }
  return false;
}

/**
 * Левая кромка: буквы строк атласа по центру видимой части строки; черта — граница строк (E9; UX-07, MOB-08). Над «А»
 * строк нет: там поле остаётся пустым.
 */
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
  // вертикаль камеры — строки; буквы — по полосам под ними (сжатие полос J4, J5: убранные строки атласа без буквы)
  const r0 = atlasRow(v.laneOf(cam.wLane(top)));
  const r1 = atlasRow(v.laneOf(cam.wLane(bottom)));
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
    // над «А» строк атласа нет (UX-07: «Я0 Ю0» выглядели сбоем) — поле без буквы
    if (r < 0) continue;
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
    // лицо скрыто рабочим набором или свёрткой (J4, J5): указывать некуда
    if (i === undefined || v.hides(id)) continue;
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
