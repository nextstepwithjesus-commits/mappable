/**
 * Камера при родной прокрутке (09 § 3.2.2): масштаб — пересчёт мест и размера содержимого
 * с сохранением точки якоря (08 § 6.2; 03 § 7.9: погрешность ≤ 1 px).
 * Состояние хранится дробным: прокрутка браузера округляет, а якорь считается от дробных чисел,
 * поэтому ошибка не копится от шага к шагу щипка.
 */
export interface Camera {
  k: number;
  /** Прокрутка контейнера, px (дробная). */
  sx: number;
  sy: number;
}

export interface Viewport { w: number; h: number }

/** Запас слева и сверху — поле шириной и высотой в окно (03 § 3.3: «запас прокрутки слева»). */
export const pad = (v: Viewport) => ({ x: v.w, y: v.h });

export function contentSize(geomW: number, geomH: number, k: number, v: Viewport) {
  const p = pad(v);
  return { w: Math.ceil(geomW * k + 2 * p.x), h: Math.ceil(geomH * k + 2 * p.y) };
}

/** Точка рисунка (px при масштабе 1) под точкой окна f. */
export function worldAt(c: Camera, v: Viewport, fx: number, fy: number) {
  const p = pad(v);
  return { x: (c.sx + fx - p.x) / c.k, y: (c.sy + fy - p.y) / c.k };
}

/** Точка окна, где стоит точка рисунка. */
export function screenOf(c: Camera, v: Viewport, wx: number, wy: number) {
  const p = pad(v);
  return { x: wx * c.k + p.x - c.sx, y: wy * c.k + p.y - c.sy };
}

/** Новый масштаб с якорем: точка рисунка под f остаётся под f. */
export function zoomAt(c: Camera, v: Viewport, k2: number, fx: number, fy: number): Camera {
  const w = worldAt(c, v, fx, fy);
  const p = pad(v);
  return { k: k2, sx: w.x * k2 + p.x - fx, sy: w.y * k2 + p.y - fy };
}

export function clampK(k: number, min: number, max: number) {
  return Math.min(max, Math.max(min, k));
}

/** Прокрутка, при которой прямоугольник (px при масштабе 1) виден с полем margin, — «не дальше, чем нужно» (08 § 6.1 п. 7). */
export function reveal(c: Camera, v: Viewport, r: { x: number; y: number; w: number; h: number }, margin: number): Camera {
  const p = pad(v);
  const x0 = r.x * c.k + p.x, x1 = (r.x + r.w) * c.k + p.x, y0 = r.y * c.k + p.y, y1 = (r.y + r.h) * c.k + p.y;
  let { sx, sy } = c;
  if (x0 - margin < sx) sx = x0 - margin;
  else if (x1 + margin > sx + v.w) sx = Math.min(x0 - margin, x1 + margin - v.w);
  if (y0 - margin < sy) sy = y0 - margin;
  else if (y1 + margin > sy + v.h) sy = Math.min(y0 - margin, y1 + margin - v.h);
  return { k: c.k, sx, sy };
}
