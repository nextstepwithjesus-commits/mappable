/**
 * Свой порог раскрытия созвездия (этап 16, решение 185): «просторные раскрываются раньше».
 *
 * Простор созвездия — площадь его контура (кольца раскладки, ModelData.outlines) в мировых единицах «по насыщенности»
 * (по горизонтали — масштаб неба по умолчанию, по вертикали — полосы) на одно его лицо. Множитель раскрытия — корень из
 * простора, делённого на медиану всех созвездий, в пределах REVEAL_RANGE: у тесного созвездия (таблицы Быт 10) — 0,6,
 * у просторного (Двор, Левий) — до 1,6. Небо умножает на него высоту строки в кривой раскрытия звёзд и подписей:
 * revealAt(ky · множитель) — звёзды созвездия проявляются, когда «своя» высота строки проходит 4 → 6 px.
 *
 * Фокус созвездия (решение 185) — раскрытие 1 у созвездия в фокусе и у вложенных в него, 0 у остальных (они — свет).
 * Модуль чистый: его зовут небо (src/render/sky.ts, labels.ts — исполнитель L) и тесты.
 */
import { groupById } from '../../data/atlas.ts';
import { hydrateScale, timeToX } from '../../engine/timescale.ts';
import type { Outline } from '../../engine/layout.ts';

/** Пределы множителя раскрытия. */
export const REVEAL_RANGE: readonly [number, number] = [0.6, 1.6];
/** Кривая раскрытия по высоте строки, px: от 4 (скрыто) до 6 (раскрыто) — та же, что у неба (Pass.detail). */
export const REVEAL_KY: readonly [number, number] = [4, 6];

const factorsMemo = new WeakMap<readonly Outline[], Map<string, number>>();

/**
 * Множители раскрытия созвездий модели: id созвездия → множитель (REVEAL_RANGE). Созвездие без контура — 1 (его
 * вложенное или родительское созвездие решает groupReveal).
 */
export function revealFactors(outlines: readonly Outline[], scale: { knots: number[]; xTrue: number[]; xDense: number[] }): Map<string, number> {
  const memo = factorsMemo.get(outlines);
  if (memo) return memo;
  const ts = hydrateScale(scale);
  const acc = new Map<string, { A: number; n: number }>();
  for (const o of outlines) {
    let A = 0;
    for (const ring of o.rings) {
      const n = ring.length;
      for (let k = 0; k < n; k++) {
        const [t0, l0] = ring[k];
        const [t1, l1] = ring[(k + 1) % n];
        A += timeToX(ts, t0, 1) * l1 - timeToX(ts, t1, 1) * l0;
      }
    }
    const a = acc.get(o.group) ?? { A: 0, n: 0 };
    a.A += Math.abs(A / 2);
    a.n += o.size;
    acc.set(o.group, a);
  }
  const per = [...acc.values()].filter((a) => a.n > 0 && a.A > 0).map((a) => a.A / a.n).sort((x, y) => x - y);
  const med = per[Math.floor(per.length / 2)] || 1;
  const out = new Map<string, number>();
  for (const [g, a] of acc) {
    if (!(a.n > 0 && a.A > 0)) continue;
    out.set(g, Math.max(REVEAL_RANGE[0], Math.min(REVEAL_RANGE[1], Math.sqrt(a.A / a.n / med))));
  }
  factorsMemo.set(outlines, out);
  return out;
}

/** Множитель созвездия gid: свой, иначе — ближайшего родительского; нет — 1. */
export function revealFactor(factors: ReadonlyMap<string, number>, gid: string): number {
  for (let g = groupById.get(gid), k = 0; g && k < 8; g = g.parent ? groupById.get(g.parent) : undefined, k++) {
    const f = factors.get(g.id);
    if (f !== undefined) return f;
  }
  return 1;
}

/** Плавная ступень 0…1. */
const smooth = (u: number) => {
  const x = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return x * x * (3 - 2 * x);
};

/** Созвездие gid — в фокусе focus или вложено в него. */
export function inFocus(gid: string, focus: string | null): boolean {
  if (!focus) return false;
  for (let g = groupById.get(gid), k = 0; g && k < 8; g = g.parent ? groupById.get(g.parent) : undefined, k++) if (g.id === focus) return true;
  return false;
}

/**
 * Раскрытие созвездия gid (0…1) при высоте строки ky, px: фокус — 1 у созвездия фокуса и вложенных, 0 у прочих; без
 * фокуса — кривая REVEAL_KY по «своей» высоте строки ky · множитель.
 */
export function groupReveal(gid: string, ky: number, factors: ReadonlyMap<string, number>, focus: string | null = null): number {
  if (focus) return inFocus(gid, focus) ? 1 : 0;
  const k = ky * revealFactor(factors, gid);
  return smooth((k - REVEAL_KY[0]) / (REVEAL_KY[1] - REVEAL_KY[0]));
}
