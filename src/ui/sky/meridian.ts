/**
 * Меридиан года (D13; UX-27, IX-34, MAP-07, MAP-33): при наведении на линейку неба или на полосу времени через всё небо
 * проходит черта года, живые в этот год светятся, у линейки — флажок «990 г. до Р. Х.: живы 186, наверняка 41».
 *
 * Меридиан появляется, только когда указатель задержался над шкалой 250 мс: проход мимо линейки к звезде или к рамке
 * полосы не гасит небо. Появившись, он следует за указателем без задержки. Во время протяжки (неба или рамки полосы)
 * меридиана нет. Обоим источникам — линейке неба (src/ui/sky/input.ts) и полосе времени (src/ui/TimeStrip.tsx) —
 * одно правило: hoverYear(год) при наведении, hoverYear(null) при уходе и нажатии.
 */
import { meridian } from '../../state.ts';

/** Задержка появления меридиана, мс. */
export const MERIDIAN_DELAY = 250;

let timer: ReturnType<typeof setTimeout> | 0 = 0;
let pending: number | null = null;

/** Указатель над шкалой в году t (астр.); null — ушёл со шкалы, нажал или тянет: меридиан снимается сразу. */
export function hoverYear(t: number | null) {
  if (t === null) {
    clearTimeout(timer);
    timer = 0;
    pending = null;
    if (meridian.peek() !== null) meridian.value = null;
    return;
  }
  if (meridian.peek() !== null) {
    meridian.value = t;
    return;
  }
  pending = t;
  if (!timer)
    timer = setTimeout(() => {
      timer = 0;
      if (pending !== null) meridian.value = pending;
      pending = null;
    }, MERIDIAN_DELAY);
}
