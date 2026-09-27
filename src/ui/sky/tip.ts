/**
 * Подсказка неба (E11; IX-06, IX-07, UX-29): где её поставить и когда показать.
 *
 *  — Появляется через 120 мс после наведения; если подсказка только что была видна (указатель перешёл к соседней
 *    звезде), — сразу.
 *  — Ставится по своему настоящему размеру в одно из четырёх положений у звезды: справа снизу, справа сверху,
 *    слева снизу, слева сверху — первое, где она целиком в небе (12 px от краёв), не закрывает выбранное лицо
 *    и органы неба. Звезду под указателем она не закрывает никогда: все положения — снаружи от неё.
 *  — Прячется при любом движении неба (src/ui/sky/input.ts, watchCamera) и при протяжке.
 */
import type { Rect } from '../../render/sky.ts';

/** Задержка появления, мс. */
export const TIP_DELAY = 120;
/** Столько после исчезновения подсказки следующая появляется без задержки, мс. */
export const TIP_WARM = 400;
/** Отступ от краёв неба и зазор до звезды, px. */
export const TIP_MARGIN = 12;
export const TIP_GAP = 8;

export type TipSide = 'se' | 'ne' | 'sw' | 'nw';
export const TIP_SIDES: readonly TipSide[] = ['se', 'ne', 'sw', 'nw'];

const cross = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Место подсказки размера size у предмета anchor (звезда с кольцом, отрезок яруса) в пределах bounds.
 * avoid — чего нельзя закрывать (выбранное лицо), soft — чего лучше не закрывать (органы неба, вступление).
 * sides — допустимые положения по порядку предпочтения (у ярусов — только снизу).
 */
export function placeTip(
  anchor: Rect,
  size: { w: number; h: number },
  bounds: Rect,
  avoid: Rect[] = [],
  soft: Rect[] = [],
  sides: readonly TipSide[] = TIP_SIDES,
): { x: number; y: number; side: TipSide } {
  const at = (s: TipSide) => ({
    x: s === 'se' || s === 'ne' ? anchor.x + anchor.w + TIP_GAP : anchor.x - TIP_GAP - size.w,
    y: s === 'se' || s === 'sw' ? anchor.y + anchor.h + TIP_GAP : anchor.y - TIP_GAP - size.h,
  });
  const inBounds = (r: Rect) => r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h;
  let best: { x: number; y: number; side: TipSide; score: number } | null = null;
  sides.forEach((side, k) => {
    const p = at(side);
    const r = { x: p.x, y: p.y, w: size.w, h: size.h };
    const score = (inBounds(r) ? 0 : 1000) + (avoid.some((a) => cross(r, a)) ? 100 : 0) + soft.filter((a) => cross(r, a)).length * 10 + k;
    if (!best || score < best.score) best = { ...p, side, score };
  });
  const b = best!;
  // нигде не помещается целиком — лучшее положение, сдвинутое внутрь неба
  const x = Math.max(bounds.x, Math.min(bounds.x + bounds.w - size.w, b.x));
  const y = Math.max(bounds.y, Math.min(bounds.y + bounds.h - size.h, b.y));
  return { x, y, side: b.side };
}
