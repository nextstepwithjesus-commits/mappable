/**
 * Затемнение при выделении (ТЗ § 3.1: «остальное небо гаснет до 25 %»; E12, MOB-41):
 *  — звёзды, следы и связи вне выделения — 22 % яркости;
 *  — «вероятно» живые на меридиане — 60 % (MAP-33): бледнее, чем «наверняка», но ярче погашенных;
 *  — погашенные подписи держат контраст к небу не ниже 3 : 1 (DIM_LABEL_CONTRAST), а не гаснут вместе со звёздами;
 *  — названия созвездий при выделении — не ниже 0,75 (CONSTELLATION_DIM).
 * Числа проверяют tests/sky-wave3b.test.ts и npm run -s contrast (tools/contrast.ts) в обеих темах.
 */
import { hexToRgb } from './color.ts';
import { contrast } from '../ui/contrast.ts';

export const DIM = 0.22;
export const LIKELY = 0.6;
export const DIM_LABEL_CONTRAST = 3;
export const CONSTELLATION_DIM = 0.75;

/**
 * Непрозрачность подписи «вероятно» при пороге погашенной floor: не меньше 0,6 и заметно ярче погашенной — на треть пути
 * от порога к полной яркости. Иначе в дневной теме, где порог 3 : 1 у --ink-2 выше 0,6, «вероятно» и погашенные совпали бы.
 */
export const likelyAlpha = (floor: number) => Math.max(LIKELY, floor + (1 - floor) * 0.35);

const HEX = /^#[0-9a-f]{6}$/i;
/** Цвет fg с непрозрачностью a поверх bg — так, как его смешивает холст (#rrggbb). */
export function over(fg: string, bg: string, a: number): string {
  const F = hexToRgb(fg);
  const B = hexToRgb(bg);
  return `#${[0, 1, 2].map((k) => Math.round(B[k] + (F[k] - B[k]) * a).toString(16).padStart(2, '0')).join('')}`;
}
/**
 * Наименьшая непрозрачность цвета fg поверх bg, при которой контраст к bg не ниже min (с запасом 0,05 на округление
 * смешения холстом). Цвет, которому и при полной непрозрачности не хватает контраста, получает 1.
 */
export function alphaForContrast(fg: string, bg: string, min: number): number {
  if (!HEX.test(fg.trim()) || !HEX.test(bg.trim())) return 0.5;
  const need = min + 0.05;
  if (contrast(over(fg, bg, 1), bg) < need) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (contrast(over(fg, bg, m), bg) >= need) hi = m;
    else lo = m;
  }
  return hi;
}
