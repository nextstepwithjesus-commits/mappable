/**
 * Годы (09 § 3.3; 04 § 3.1): годы в данных исторические — −1010 значит 1010 г. до Р. Х., нулевого года нет: после
 * 1 г. до Р. Х. идёт 1 г. по Р. Х. Ядро считает в астрономических годах (−1010 → −1009, 1 г. до Р. Х. → 0) и переводит
 * обратно только для показа. Ядро без DOM.
 */

/** Исторический год: целое, не ноль. */
export function isYear(y: number): boolean {
  return Number.isInteger(y) && y !== 0;
}

function need(y: number): void {
  if (!isYear(y)) throw new RangeError(`год ${y}: нулевого года нет, год — целое число`);
}

/** Исторический год → астрономический: −1 (1 г. до Р. Х.) → 0, −1010 → −1009; годы по Р. Х. не меняются. */
export function toAstro(y: number): number {
  need(y);
  return y < 0 ? y + 1 : y;
}

/** Астрономический год → исторический: 0 → −1, −1009 → −1010. */
export function fromAstro(a: number): number {
  if (!Number.isInteger(a)) throw new RangeError(`астрономический год ${a} — не целое`);
  return a <= 0 ? a - 1 : a;
}

/** Сколько лет от года `a` до года `b` (исторические годы): от 1 г. до Р. Х. до 1 г. по Р. Х. — 1 год. */
export function yearsBetween(a: number, b: number): number {
  return toAstro(b) - toAstro(a);
}

/** Год через `n` лет после года `y` (исторические годы): 1 г. до Р. Х. + 1 = 1 г. по Р. Х. */
export function addYears(y: number, n: number): number {
  if (!Number.isInteger(n)) throw new RangeError(`число лет ${n} — не целое`);
  return fromAstro(toAstro(y) + n);
}

/** Сравнение исторических лет по времени. */
export const compareYears = (a: number, b: number): number => toAstro(a) - toAstro(b);

const NB = '\u00A0';
/** Эра с неразрывными пробелами (08 § 3.3.3: после однобуквенных слов — U+00A0): «до Р. Х.», «по Р. Х.». */
const era = (y: number) => (y < 0 ? `до${NB}Р.${NB}Х.` : `по${NB}Р.${NB}Х.`);

/**
 * Подпись года для показа: «1010 г. до Р. Х.», «30 г. по Р. Х.» — с неразрывными пробелами, без знака минус (04 § 3.1).
 * `era: false` — без эры (эра пишется у оси, а не у каждой метки): «1010».
 */
export function yearLabel(y: number, opts: { era?: boolean } = {}): string {
  need(y);
  const n = String(Math.abs(y));
  if (opts.era === false) return n;
  return `${n}${NB}г. ${era(y)}`;
}

/** Год или промежуток по модели 02 § 4.1: `{earliest, latest, words}` (одно число, когда они равны). */
export interface YearSpan {
  earliest: number;
  latest: number;
  /** Слова источника: «28/29» — показываются как есть. */
  words?: string;
}

/**
 * Подпись промежутка лет (02 § 4.1; 04 § 3.1): «1010–970 гг. до Р. Х.», «28–33 гг. по Р. Х.», «4 г. до Р. Х. – 30 г. по Р. Х.»
 * (через эру — тире с пробелами), «28/29 г. по Р. Х.» по словам источника; `about` — «около …»; `calc` — пометка «расч.»
 * (год посчитан по модели, 04 § 3.8). Одна подпись на все инструменты (рецензия интерфейса, № 7).
 */
export function yearSpanLabel(s: YearSpan, opts: { about?: boolean; calc?: boolean } = {}): string {
  need(s.earliest);
  need(s.latest);
  if (compareYears(s.earliest, s.latest) > 0) throw new RangeError(`промежуток ${s.earliest}…${s.latest}: начало позже конца`);
  let body: string;
  if (s.words) body = `${s.words}${NB}г. ${era(s.latest)}`;
  else if (s.earliest === s.latest) body = yearLabel(s.earliest);
  else if (Math.sign(s.earliest) === Math.sign(s.latest)) body = `${Math.abs(s.earliest)}–${Math.abs(s.latest)}${NB}гг. ${era(s.latest)}`;
  else body = `${yearLabel(s.earliest)} – ${yearLabel(s.latest)}`;
  return `${opts.about ? `около${NB}` : ''}${body}${opts.calc ? ', расч.' : ''}`;
}

/** Счёт до Авраама (04 § 3.1): «930 лет от сотворения Адама» — с согласованием «год / года / лет». */
export function fromAdamLabel(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`лет от сотворения Адама: ${n}`);
  const d = n % 10;
  const dd = n % 100;
  const w = d === 1 && dd !== 11 ? 'год' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'года' : 'лет';
  return `${n}${NB}${w} от сотворения Адама`;
}

/** Пояснение столбца года в выгрузке (рецензия интерфейса, № 7): год в выгрузке — астрономический. */
export const YEAR_ISO_NOTE = 'год — астрономический (ISO 8601): −1009 = 1010 г. до Р. Х.; 0 = 1 г. до Р. Х.; 1 = 1 г. по Р. Х.';

/** Год ISO 8601 / EDTF для выгрузки (09 § 9.4): астрономический, четыре цифры со знаком у отрицательных: −1010 → «-1009». */
export function yearIso(y: number): string {
  const a = toAstro(y);
  const s = String(Math.abs(a)).padStart(4, '0');
  return a < 0 ? `-${s}` : s;
}
