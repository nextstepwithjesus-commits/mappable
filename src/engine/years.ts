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
  return `${formatYear(a, { approx })}${NBSP}— ${formatYear(b)}`;
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
 * Годы рождения и смерти в том виде, в каком их показывает карточка. У оценки год рождения округлён,
 * год смерти (если известен возраст) отсчитан от округлённого рождения, чтобы возраст при смерти сохранился.
 * У лиц класса epochal годов нет: null.
 */
export function shownYears(c: LifeDates): { b: number; d: number | null; approx: boolean } | null {
  if (c.cls === 'epochal') return null;
  if (c.cls !== 'estimated') return { b: Math.round(c.b), d: c.d === null ? null : Math.round(c.d), approx: c.cls !== 'exact' };
  const b = roundYear(c.b, ESTIMATE_STEP);
  return { b, d: c.d === null ? null : b + Math.round(c.d - c.b), approx: true };
}

/**
 * Возможный промежуток года рождения оценки, концы округлены до ближайших 5 (10) лет: округление наружу
 * вывело бы край за границу из данных (Мицраим «после Потопа»: 2517 → 2520 — уже до Потопа).
 * Показанный год оценки всегда внутри промежутка.
 */
export function shownBirthRange(c: LifeDates): [number, number] {
  const step = (c.bHi - c.bLo) / 2 >= 50 ? WIDE_STEP : ESTIMATE_STEP;
  const b = shownYears(c)?.b ?? c.b;
  return [Math.min(roundYear(c.bLo, step), b), Math.max(roundYear(c.bHi, step), b)];
}

/**
 * Годы жизни для паспорта и перечней: «2166–1991 гг. до Р. Х.», «ок. 1040–970 гг. до Р. Х.», «род. ок. 1335 г. до Р. Х.».
 * people — народ или род из родословия: «рождения» нет, только время в родословии. Пустая строка — годы не установлены.
 */
export function lifeSpanText(c: LifeDates, opts: { people?: boolean } = {}): string {
  const y = shownYears(c);
  if (!y) return '';
  if (y.d !== null) return formatSpan(y.b, y.d, y.approx);
  return `${opts.people ? '' : `род.${NBSP}`}${formatYear(y.b, { approx: y.approx })}`;
}

/** Короткая подпись года для шкалы: «ок. 1335», «2166 до Р. Х.»; эра — только если просят. */
export function shortYear(astro: number, approx: boolean, era: boolean): string {
  const h = toHist(astro);
  return `${approx ? `ок.${NBSP}` : ''}${Math.abs(h)}${era ? (h < 0 ? `${NBSP}до${NBSP}Р.${NBSP}Х.` : `${NBSP}по${NBSP}Р.${NBSP}Х.`) : ''}`;
}
