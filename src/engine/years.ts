/**
 * Годы. В данных — исторические (−1010 = 1010 г. до Р. Х., нулевого года нет).
 * Внутри движка — астрономические (1 г. до Р. Х. = 0), чтобы арифметика не ломалась на границе эр.
 */

import { typo } from '../ui/text/typo.ts';

export const toAstro = (hist: number): number => (hist < 0 ? hist + 1 : hist);
export const toHist = (astro: number): number => {
  const y = Math.round(astro);
  return y <= 0 ? y - 1 : y;
};

/** Прибавить N лет к историческому году (Иисус в 12 лет: −5 + 12 → 8). */
export const addYears = (hist: number, n: number): number => toHist(toAstro(hist) + n);

const NBSP = ' ';
/** Word joiner после «–» в диапазоне: перенос не отрывает конец диапазона («1050–» / «931 гг.»; CARD-25, VIS-03). */
const WJ = '\u2060';

/** «1040 г. до Р. Х.», «30 г. по Р. Х.» */
export function formatYear(astro: number, opts: { approx?: boolean; short?: boolean } = {}): string {
  const h = toHist(astro);
  const pre = opts.approx ? `ок.${NBSP}` : '';
  if (h < 0) return `${pre}${-h}${NBSP}г.${NBSP}до${NBSP}Р.${NBSP}Х.`;
  return `${pre}${h}${NBSP}г.${opts.short ? '' : `${NBSP}по${NBSP}Р.${NBSP}Х.`}`;
}

/**
 * Промежуток: «ок. 1040–970 гг. до Р. Х.», «5 г. до Р. Х. — 30 г. по Р. Х.». Строки годов уже в русской типографике
 * (неразрывные пробелы, U+2060 после «–»): они совпадают с typo() из src/ui/text/typo.ts — это проверяет tests/typo.test.ts.
 */
export function formatSpan(a: number, b: number, approx = false): string {
  const ha = toHist(a);
  const hb = toHist(b);
  const pre = approx ? `ок.${NBSP}` : '';
  if (ha < 0 && hb < 0) return `${pre}${-ha}–${WJ}${-hb}${NBSP}гг.${NBSP}до${NBSP}Р.${NBSP}Х.`;
  if (ha > 0 && hb > 0) return `${pre}${ha}–${WJ}${hb}${NBSP}гг.${NBSP}по${NBSP}Р.${NBSP}Х.`;
  // через эру «ок.» стоит у обоих концов (решение 96; X2 Д10): «ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.»
  return `${formatYear(a, { approx })}${NBSP}— ${formatYear(b, { approx })}`;
}

/** Число лет с правильным словом: 1 год, 2 года, 5 лет. */
export function yearsWord(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return `${n}${NBSP}лет`;
  if (b === 1) return `${n}${NBSP}год`;
  if (b >= 2 && b <= 4) return `${n}${NBSP}года`;
  return `${n}${NBSP}лет`;
}

// ---------- годы лица для показа: паспорт, мини-шкала, § 8, § 13 и § 20 называют одни и те же числа ----------

/** Хронологические сведения о лице, нужные для показа (строка хронологии индекса или результат решателя). */
export interface LifeDates {
  b: number;
  bLo: number;
  bHi: number;
  d: number | null;
  cls: 'exact' | 'calculated' | 'estimated' | 'epochal';
  /** народ или род (CARD-59): год — место в родословии, а не рождение; годов не показывают */
  named?: boolean;
  /**
   * Год смерти выведен из рождения по возрасту при смерти, названному текстом (Иодай — 130 лет): округление оценки
   * рождения сдвигает и смерть, чтобы возраст сохранился. Иначе год смерти — свой (явный год, допустимый интервал,
   * решатель), и округление рождения его не трогает: Иоав убит в 970 г. до Р. Х. вместе с событием § 17, а не
   * «ок. 972» — раньше Давида (CARD-79). undefined у строк прежних сборок — как прежде, смерть по возрасту.
   */
  dAge?: boolean;
  /** Год по числам, но приблизительный по данным (Рождество, Распятие; ChronoRow.bApprox, dApprox): «ок.» без оценки. */
  bApprox?: boolean;
  dApprox?: boolean;
  /** Оценка рождения на границе текста: «не раньше» / «не позже» (ChronoRow.pin). */
  pin?: 'lo' | 'hi';
  /** Интервал смерти (ChronoRow.dLo, dHi): у своего года смерти-оценки — промежуток «между». */
  dLo?: number | null;
  dHi?: number | null;
  /**
   * Свой год смерти закреплён явным годом данных или числами текста (ChronoRow.dFixed): это не оценка, «ок.» нет
   * (Иоав убит в 970 г.). false — год смерти оценён в допустимом интервале (died.range). undefined — прежние строки:
   * закреплён, если интервал смерти не шире 4 лет.
   */
  dFixed?: boolean;
}

/** Точка оценки округляется до 5 лет, границы широкого промежутка (полуширина ≥ 50 лет) — до 10. */
export const ESTIMATE_STEP = 5;
const WIDE_STEP = 10;

/** Округлить астрономический год по историческому счёту («ок. 1333» → «ок. 1335»); нулевого года нет. */
export function roundYear(astro: number, step: number): number {
  const h = toHist(astro);
  const r = Math.round(h / step) * step;
  // нулевого года нет: «ок. 1 г. по Р. Х.» округляется до 5 г. по Р. Х., «ок. 2 г. до Р. Х.» — до 5 г. до Р. Х.
  return toAstro(r === 0 ? (h < 0 ? -step : step) : r);
}

/**
 * Годы рождения и смерти в том виде, в каком их показывает карточка. У оценки год рождения округлён; год смерти,
 * выведенный из рождения по возрасту при смерти (dAge), отсчитан от округлённого рождения, чтобы возраст сохранился,
 * а свой год смерти (явный год, допустимый интервал) остаётся как есть: смерть не уходит раньше событий жизни (CARD-79).
 * У лиц класса epochal годов нет: null. У народа и рода (named) года рождения нет (CARD-59; решение владельца 23): null.
 */
export function shownYears(c: LifeDates): { b: number; d: number | null; approx: boolean } | null {
  if (c.cls === 'epochal' || c.named) return null;
  // «ок.» — только у оценки и у года, приблизительного по данным (решение 96; X1 Х8): год по числам текста
  // и реконструкции пишется без «ок.» — «1040–970 гг. до Р. Х.» + «расч.»
  if (c.cls !== 'estimated') return { b: Math.round(c.b), d: c.d === null ? null : Math.round(c.d), approx: !!c.bApprox };
  // округление — внутрь промежутка рождения, границы которого уже учитывают границы текста (решение 101; X1 Х2):
  // сыновья из Быт 46 — не «ок. 1875», через год после входа в Египет
  const b = roundInside(c.b, c.bLo, c.bHi, ESTIMATE_STEP);
  if (c.d === null) return { b, d: null, approx: true };
  return { b, d: c.dAge === false ? Math.max(b, Math.round(c.d)) : b + Math.round(c.d - c.b), approx: true };
}

/**
 * Округлить оценку до step лет, не выходя из [lo; hi] (астр.): ближайший круглый год внутри промежутка, иначе — год
 * без округления (X1 Х2: «если внутри допуска круглого года нет, показывать год без округления»).
 */
export function roundInside(t: number, lo: number, hi: number, step: number): number {
  const r = roundYear(t, step);
  if (!(lo <= hi) || (r >= Math.round(lo) && r <= Math.round(hi))) return r;
  if (lo === hi) return Math.round(t);
  const up = roundYearTo(t, step, 'later');
  const dn = roundYearTo(t, step, 'earlier');
  const inU = up >= Math.round(lo) && up <= Math.round(hi);
  const inD = dn >= Math.round(lo) && dn <= Math.round(hi);
  if (inU && inD) return Math.abs(up - t) <= Math.abs(t - dn) ? up : dn;
  if (inU) return up;
  if (inD) return dn;
  return Math.min(Math.max(Math.round(t), Math.round(lo)), Math.round(hi));
}

/** Округлить астрономический год до step лет в сторону более позднего (later) или более раннего года; нулевого года нет. */
function roundYearTo(astro: number, step: number, dir: 'later' | 'earlier'): number {
  const h = toHist(astro);
  const r = (dir === 'later' ? Math.ceil(h / step) : Math.floor(h / step)) * step;
  return toAstro(r === 0 ? (dir === 'later' ? step : -step) : r);
}

/**
 * Возможный промежуток года рождения оценки, концы округлены до 5 (10) лет внутрь промежутка: округление наружу
 * вывело бы край за границу из данных (Мицраим «после Потопа»: 2517 → 2520 — уже до Потопа; Валаам убит в 1406 г.,
 * и «1405» было бы рождением после смерти, MAP-53). Узкий промежуток, внутри которого круглого года нет, — до
 * ближайших круглых лет. Показанный год оценки всегда внутри промежутка.
 */
export function shownBirthRange(c: LifeDates): [number, number] {
  const step = (c.bHi - c.bLo) / 2 >= 50 ? WIDE_STEP : ESTIMATE_STEP;
  const b = shownYears(c)?.b ?? c.b;
  let lo = roundYearTo(c.bLo, step, 'later');
  let hi = roundYearTo(c.bHi, step, 'earlier');
  if (lo > hi) {
    lo = roundYear(c.bLo, step);
    hi = roundYear(c.bHi, step);
  }
  return [Math.min(lo, b), Math.max(hi, b)];
}

/**
 * Годы жизни для паспорта и перечней — то же, что lifeText (словарь 96; прежнее имя оставлено для вызывающих):
 * «2166–1991 гг. до Р. Х.», «ок. 1045–975 гг. до Р. Х.», «род. между 45 и 20 гг. до Р. Х.».
 */
export function lifeSpanText(c: LifeDates, opts: { people?: boolean } = {}): string {
  return lifeText(c, opts);
}

/** Короткая подпись года для шкалы: «ок. 1335», «2166 до Р. Х.»; эра — только если просят. */
export function shortYear(astro: number, approx: boolean, era: boolean): string {
  const h = toHist(astro);
  return `${approx ? `ок.${NBSP}` : ''}${Math.abs(h)}${era ? (h < 0 ? `${NBSP}до${NBSP}Р.${NBSP}Х.` : `${NBSP}по${NBSP}Р.${NBSP}Х.`) : ''}`;
}

// ======================================================================================================================
// Словарь дат (этап 13, решение 96; X2 § 2.1, X1 Х8; контракт 4). Годы на экране пишут только эти функции.
//
// | запись                                   | когда                                                              |
// | «80 лет», «в 27-й год Иеровоама»          | число сказано в Писании — пишет вызывающий, при нём стих, пометы нет |
// | «1446 г. до Р. Х.» + «расч.»              | год вычислен от опоры по числам текста или реконструкции; без «ок.» |
// | «ок. 30 г. до Р. Х.»                      | только оценка с промежутком не шире 10 лет (или bApprox/dApprox)    |
// | «между 45 и 20 гг. до Р. Х.»              | оценка с промежутком шире 10 лет                                    |
// | «не позже 1876 г. до Р. Х.»               | оценка на границе текста (pin)                                      |
// | «ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.»  | через эру — «ок.» и эра у каждого конца                             |
// | «последнее упоминание — 30 г. по Р. Х.»   | о смерти Писание молчит (стих — рядом, ChronoRow.lastRef)           |
// ======================================================================================================================

/** Оценка с промежутком не шире этого (лет) пишется «ок. X», шире — «между X и Y» (решение 96). */
export const EST_NARROW = 10;

/** Год для показа (астрономический) и его вид. */
export interface DateVal {
  /** точка — астрономический год */
  t: number;
  /** оценка по поколениям, эпохе, встрече (иначе — год по числам текста, реконструкции или явный год данных) */
  est?: boolean;
  /** промежуток оценки (астр.); без него оценка узкая — «ок. X» */
  lo?: number;
  hi?: number;
  /** год по числам, но приблизительный по данным: «ок.» без оценки (Рождество — «ок. 5 г. до Р. Х.») */
  approx?: boolean;
  /** оценка на границе текста: 'lo' — «не раньше», 'hi' — «не позже» */
  pin?: 'lo' | 'hi';
}

const eraOf = (astro: number) => (toHist(astro) < 0 ? -1 : 1);
const ERA_BC = `до${NBSP}Р.${NBSP}Х.`;
const ERA_AD = `по${NBSP}Р.${NBSP}Х.`;
const eraWord = (astro: number) => (eraOf(astro) < 0 ? ERA_BC : ERA_AD);
const num = (astro: number) => String(Math.abs(toHist(astro)));

/** Шаг округления концов промежутка оценки: 5 лет, у широкого (полуширина ≥ 50) — 10. */
const stepFor = (lo: number, hi: number) => ((hi - lo) / 2 >= 50 ? WIDE_STEP : ESTIMATE_STEP);

/** Оценка широкая — пишется «между»: промежуток, округлённый внутрь, шире EST_NARROW лет. */
export function isWide(v: DateVal): boolean {
  if (!v.est || v.lo === undefined || v.hi === undefined) return false;
  const [a, b] = wideEnds(v);
  return b - a > EST_NARROW;
}

/** Концы широкого промежутка, округлённые внутрь (5 или 10 лет); узкий промежуток без круглых лет — как есть. */
export function wideEnds(v: DateVal): [number, number] {
  const lo = Math.min(v.lo!, v.t);
  const hi = Math.max(v.hi!, v.t);
  const step = stepFor(lo, hi);
  // конец на границе текста (pin) не округляется: «между 1950 и 1876» (Быт 46:11), а не «…и 1880»
  let a = v.pin === 'lo' ? Math.round(lo) : roundYearTo(lo, step, 'later');
  let b = v.pin === 'hi' ? Math.round(hi) : roundYearTo(hi, step, 'earlier');
  if (a > b) {
    a = Math.round(lo);
    b = Math.round(hi);
  }
  return [a, b];
}

/** Показанный год точки: у оценки — округлённый внутрь промежутка, у года по числам — как есть. */
export function shownPoint(v: DateVal): number {
  if (!v.est) return Math.round(v.t);
  if (v.pin === 'hi' && v.hi !== undefined) return Math.round(v.hi);
  if (v.pin === 'lo' && v.lo !== undefined) return Math.round(v.lo);
  return roundInside(v.t, v.lo ?? -Infinity, v.hi ?? Infinity, ESTIMATE_STEP);
}

/**
 * Один год словами словаря: «1446 г. до Р. Х.», «ок. 30 г. до Р. Х.», «между 45 и 20 гг. до Р. Х.»,
 * «не позже 1876 г. до Р. Х.», «между 5 г. до Р. Х. и 10 г. по Р. Х.». era: false — без эры (в строке, где эра
 * стоит один раз в конце).
 */
export function dateText(v: DateVal, opts: { era?: boolean } = {}): string {
  const era = opts.era !== false;
  if (isWide(v)) {
    const [a, b] = wideEnds(v);
    if (eraOf(a) !== eraOf(b)) return `между ${num(a)}${NBSP}г.${NBSP}${eraWord(a)} и${NBSP}${num(b)}${NBSP}г.${NBSP}${eraWord(b)}`;
    return `между ${num(a)}${NBSP}и${NBSP}${num(b)}${era ? `${NBSP}гг.${NBSP}${eraWord(b)}` : ''}`;
  }
  const t = shownPoint(v);
  const pre = v.est && v.pin === 'hi' ? `не${NBSP}позже ` : v.est && v.pin === 'lo' ? `не${NBSP}раньше ` : v.est || v.approx ? `ок.${NBSP}` : '';
  return `${pre}${num(t)}${era ? `${NBSP}г.${NBSP}${eraWord(t)}` : ''}`;
}

/** «ок.» перед числом конца промежутка («ок. 1045»), без эры и «г.»; широкая оценка сюда не попадает. */
const endNum = (v: DateVal) => {
  const t = shownPoint(v);
  const pre = v.est && v.pin === 'hi' ? `не${NBSP}позже ` : v.est && v.pin === 'lo' ? `не${NBSP}раньше ` : v.est || v.approx ? `ок.${NBSP}` : '';
  return { t, pre, s: `${pre}${num(t)}` };
};

/**
 * Промежуток от a до b: «1040–970 гг. до Р. Х.», «ок. 1045–975 гг. до Р. Х.», «6 г. до Р. Х. — 30 г. по Р. Х.»,
 * «ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.». Концы разного вида в одной эре — каждый со своей пометой:
 * «ок. 1045 г. — 970 г. до Р. Х.». Широкая оценка у конца — «между…» у этого конца. Один показанный год — одна дата.
 */
export function spanText(a: DateVal, b: DateVal): string {
  if (isWide(a) || isWide(b)) {
    const x = dateText(a, { era: false });
    const y = dateText(b, { era: false });
    const ea = eraOf(isWide(a) ? wideEnds(a)[1] : shownPoint(a));
    const eb = eraOf(isWide(b) ? wideEnds(b)[0] : shownPoint(b));
    if (ea === eb) return `${x}${NBSP}— ${y}${NBSP}гг.${NBSP}${eraWord(shownPoint(b))}`;
    return `${dateText(a)}${NBSP}— ${dateText(b)}`;
  }
  const A = endNum(a);
  const B = endNum(b);
  if (A.t === B.t && A.pre === B.pre) return dateText(a);
  if (eraOf(A.t) !== eraOf(B.t)) return `${dateText(a)}${NBSP}— ${dateText(b)}`;
  if (A.pre === B.pre) return `${A.pre}${num(A.t)}–${WJ}${num(B.t)}${NBSP}гг.${NBSP}${eraWord(B.t)}`;
  return `${A.s}${NBSP}г.${NBSP}— ${B.s}${NBSP}г.${NBSP}${eraWord(B.t)}`;
}

/** Даты рождения и смерти лица для словаря; null — лет нет (время не установлено, народ или род). */
export function lifeDates(c: LifeDates): { birth: DateVal; death: DateVal | null } | null {
  if (c.cls === 'epochal' || c.named) return null;
  const est = c.cls === 'estimated';
  const birth: DateVal = est ? { t: c.b, est: true, lo: Math.min(c.bLo, c.b), hi: Math.max(c.bHi, c.b), ...(c.pin ? { pin: c.pin } : {}) } : { t: c.b, ...(c.bApprox ? { approx: true } : {}) };
  if (c.d === null) return { birth, death: null };
  let death: DateVal;
  if (c.dAge === false) {
    // свой год смерти (явный год, допустимый интервал): не сдвигается округлением рождения (CARD-79)
    const lo = c.dLo ?? c.d;
    const hi = c.dHi ?? c.d;
    const fixed = c.dFixed ?? hi - lo <= 4;
    death = fixed ? { t: c.d, ...(c.dApprox ? { approx: true } : {}) } : { t: c.d, est: true, lo, hi };
  } else if (!est) death = { t: c.d, ...(c.dApprox || c.bApprox ? { approx: true } : {}) };
  else {
    // смерть по возрасту, названному текстом: промежуток рождения, сдвинутый на возраст; показанный год — от показанного
    // рождения, чтобы возраст сохранился
    const age = c.d - c.b;
    death = isWide(birth) ? { t: birth.t + age, est: true, lo: birth.lo! + age, hi: birth.hi! + age } : { t: shownPoint(birth) + Math.round(age), est: true, lo: shownPoint(birth) + Math.round(age), hi: shownPoint(birth) + Math.round(age) };
  }
  return { birth, death };
}

/**
 * Строка «Годы» паспорта и перечней по словарю: «1040–970 гг. до Р. Х.», «ок. 1045–975 гг. до Р. Х.»,
 * «род. между 45 и 20 гг. до Р. Х.», «род. между 1445 и 1410, ум. между 1335 и 1300 гг. до Р. Х.»,
 * «род. 1040 г. до Р. Х.». people — народ или род (без «род.»). Пустая строка — годы не установлены.
 */
export function lifeText(c: LifeDates, opts: { people?: boolean } = {}): string {
  const ld = lifeDates(c);
  if (!ld) return '';
  const { birth, death } = ld;
  const born = opts.people ? '' : `род.${NBSP}`;
  if (!death) return `${born}${dateText(birth)}`;
  if (isWide(birth) || isWide(death)) {
    const bEnd = isWide(birth) ? wideEnds(birth)[0] : shownPoint(birth);
    const dEnd = isWide(death) ? wideEnds(death)[1] : shownPoint(death);
    if (eraOf(bEnd) === eraOf(dEnd)) {
      const tail = isWide(death) ? `${NBSP}гг.` : `${NBSP}г.`;
      return `${born}${dateText(birth, { era: false })}, ум. ${dateText(death, { era: false })}${tail}${NBSP}${eraWord(dEnd)}`;
    }
    return `${born}${dateText(birth)}, ум. ${dateText(death)}`;
  }
  return spanText(birth, death);
}

/** «последнее упоминание — 30 г. по Р. Х.»: о смерти Писание молчит; стих — ChronoRow.lastRef, рядом. */
export function lastText(last: number): string {
  return `последнее упоминание${NBSP}— ${dateText({ t: last })}`;
}

/** Годы лица в другой модели: «в модели «Краткое пребывание» — 1951–1776 гг. до Р. Х.» (решения 96, 102). */
export function modelYearsText(c: LifeDates, modelShort: string): string {
  const t = lifeText(c);
  return t ? `в${NBSP}модели «${modelShort}»${NBSP}— ${t}` : '';
}

/**
 * Границы эпохи: «1406–1375 гг. до Р. Х.», «1406 г. — ок. 1375 г. до Р. Х.»; «ок.» — только у оценочной границы
 * (Epoch.startEst, endEst): одно правило для листа «Эпохи», § 13, подсказки и ярусов (решение 99). Годы — исторические.
 */
export function epochSpanText(e: { start: number; end: number; startEst?: boolean; endEst?: boolean }): string {
  return spanText({ t: toAstro(e.start), ...(e.startEst ? { approx: true } : {}) }, { t: toAstro(e.end), ...(e.endEst ? { approx: true } : {}) });
}

/** Основание года — вид (engine/chronology.ts, YearBasis); тип повторён здесь, чтобы years.ts не зависел от решателя. */
export interface BasisLike {
  kind: string;
  ids?: string[];
  gens?: [number, number];
  ref?: string;
  anchor?: string;
}

const BASIS_WORDS: Record<string, string> = {
  numbers: 'год вычислен по числам текста от опоры 967 г. до Р. Х. (4-й год Соломона, 3 Цар 6:1)',
  reign: 'год по реконструкции царствований Тиле — Янга от опоры 967 г. до Р. Х.; числа текста — отдельно',
  year: 'год по внешней опоре или датированному событию (см. «О хронологии»)',
  kin: 'оценка по поколениям от ближайших родственников с известными годами',
  order: 'оценка по поколениям; из порядка перечисления братьев и сестёр следует только очерёдность, не год',
  active: 'оценка по засвидетельствованным годам деятельности',
  met: 'оценка по годам лица, с которым была встреча по тексту',
  mention: 'оценка по эпохе книги и главы, где лицо названо впервые',
  epoch: 'оценка по эпохе, к которой лицо отнесено по тексту',
  bounds: 'оценка по границам текста «не раньше» и «не позже»',
  group: 'оценка по годам датированных лиц того же рода',
  interp: 'оценка по числу, понимаемому по толкованию',
  people: 'место народа или рода в родословии, а не год рождения',
};

/**
 * Пояснение пометы «расч.» — своё у каждого лица (решение 96; X1 Х8): откуда год, промежуток оценки, зависит ли год
 * от модели. dep — годы лица меняются между моделями (IdxPerson.modelDep); model — краткое имя текущей модели.
 * «по числам текста … модель «Основной текст»», «по реконструкции … одинаково во всех моделях», «оценка по поколениям;
 * промежуток — между 1445 и 1410 гг. до Р. Х.; одинаково во всех моделях».
 */
export function markTitle(c: LifeDates & { basis?: BasisLike }, o: { dep: boolean; model: string }): string {
  const kind = c.basis?.kind ?? (c.named ? 'people' : c.cls === 'exact' ? 'numbers' : c.cls === 'calculated' ? 'reign' : 'kin');
  const parts = [BASIS_WORDS[kind] ?? BASIS_WORDS.kin];
  if (c.cls === 'estimated' || c.cls === 'epochal') {
    const lo = Math.min(c.bLo, c.b);
    const hi = Math.max(c.bHi, c.b);
    const v: DateVal = { t: c.b, est: true, lo, hi };
    if (isWide(v)) parts.push(`промежуток — ${dateText(v)}`);
    else if (Math.round(hi) > Math.round(lo)) parts.push(`промежуток — ${formatSpan(lo, hi)}`);
  }
  parts.push(o.dep ? `год зависит от модели хронологии, сейчас — «${o.model}»` : 'одинаково во всех моделях хронологии');
  return typo(parts.join('; '));
}
