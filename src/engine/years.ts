/**
 * Годы. В данных — исторические (−1010 = 1010 г. до Р. Х., нулевого года нет).
 * Внутри движка — астрономические (1 г. до Р. Х. = 0), чтобы арифметика не ломалась на границе эр.
 */

export const toAstro = (hist: number): number => (hist < 0 ? hist + 1 : hist);
export const toHist = (astro: number): number => {
  const y = Math.round(astro);
  return y <= 0 ? y - 1 : y;
};

/** Прибавить N лет к историческому году (Иисус в 12 лет: −5 + 12 → 8). */
export const addYears = (hist: number, n: number): number => toHist(toAstro(hist) + n);

const NBSP = ' ';

/** «1040 г. до Р. Х.», «30 г. по Р. Х.» */
export function formatYear(astro: number, opts: { approx?: boolean; short?: boolean } = {}): string {
  const h = toHist(astro);
  const pre = opts.approx ? `ок.${NBSP}` : '';
  if (h < 0) return `${pre}${-h}${NBSP}г.${NBSP}до${NBSP}Р.${NBSP}Х.`;
  return `${pre}${h}${NBSP}г.${opts.short ? '' : `${NBSP}по${NBSP}Р.${NBSP}Х.`}`;
}

/** Промежуток: «ок. 1040–970 гг. до Р. Х.», «5 г. до Р. Х. — 30 г. по Р. Х.» */
export function formatSpan(a: number, b: number, approx = false): string {
  const ha = toHist(a);
  const hb = toHist(b);
  const pre = approx ? `ок.${NBSP}` : '';
  if (ha < 0 && hb < 0) return `${pre}${-ha}–${-hb}${NBSP}гг.${NBSP}до${NBSP}Р.${NBSP}Х.`;
  if (ha > 0 && hb > 0) return `${pre}${ha}–${hb}${NBSP}гг.${NBSP}по${NBSP}Р.${NBSP}Х.`;
  return `${formatYear(a, { approx })} — ${formatYear(b)}`;
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
