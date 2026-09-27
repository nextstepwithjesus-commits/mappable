/** Прямоугольники в px холста: подписи, резерв органов неба, указатели у края, флажок меридиана. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Прямоугольники пересекаются (касание краями — не пересечение). */
export const cross = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Прямоугольник заходит хотя бы в один из rs (резерв органов неба, занятые места). */
export const hits = (a: Rect, rs: Rect[] | undefined) => !!rs && rs.some((r) => cross(a, r));
