/**
 * Нумерация Псалмов: синодальная ↔ западная (KJV) по главам — своя таблица приложения (09 § 3.5 п. 4).
 * Сверяется с `base/versification/synodal-kjv.json` в тесте (таблица JSword в приложение не входит, 09 § 5.5).
 *
 * Перенесено копией из пробы П-Т3 (`prototypes/П-Т3/core/`, 11 октября 2026) по 10 § 3.1 п. 4: тесты — `tests/core-search.test.ts`;
 * рецензия переноса по правилам продукта (данные и интерфейс) ещё не проведена — до неё код не меняет поведения пробы.
 */

/** Синодальный псалом → западные (KJV) номера. Пс 9 = 9–10; 113 = 114–115; 114 и 115 = 116; 146 и 147 = 147. */
export function psSynToKjv(ch: number): number[] {
  if (ch <= 8) return [ch];
  if (ch === 9) return [9, 10];
  if (ch <= 112) return [ch + 1];
  if (ch === 113) return [114, 115];
  if (ch === 114 || ch === 115) return [116];
  if (ch <= 145) return [ch + 1];
  if (ch === 146 || ch === 147) return [147];
  return [ch];
}

/** Западный (KJV) псалом → синодальные номера. */
export function psKjvToSyn(ch: number): number[] {
  if (ch <= 8) return [ch];
  if (ch === 9 || ch === 10) return [9];
  if (ch <= 113) return [ch - 1];
  if (ch === 114 || ch === 115) return [113];
  if (ch === 116) return [114, 115];
  if (ch <= 146) return [ch - 1];
  if (ch === 147) return [146, 147];
  return [ch];
}
