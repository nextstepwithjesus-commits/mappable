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

/**
 * Подпись года для показа: «1010 г. до Р. Х.», «30 г. по Р. Х.». Знака минус нет (04 § 3.1). `era: false` — без эры
 * (эра пишется у оси, а не у каждой метки): «1010».
 */
export function yearLabel(y: number, opts: { era?: boolean } = {}): string {
  need(y);
  const n = String(Math.abs(y));
  if (opts.era === false) return n;
  return y < 0 ? `${n} г. до Р. Х.` : `${n} г. по Р. Х.`;
}

/** Год ISO 8601 / EDTF для выгрузки (09 § 9.4): астрономический, четыре цифры со знаком у отрицательных: −1010 → «-1009». */
export function yearIso(y: number): string {
  const a = toAstro(y);
  const s = String(Math.abs(a)).padStart(4, '0');
  return a < 0 ? `-${s}` : s;
}
