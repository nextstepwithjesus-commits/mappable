/**
 * Древо карточек (решение 73): геометрия — места карточек на полотне, пути связей и камера (сдвиг и масштаб).
 * Модуль чистый: не знает ни о данных, ни о разметке; его проверяет tests/tree-n1.test.ts.
 *
 * Полотно — координаты раскладки src/engine/tree.ts: столбец layer — x = pad + layer · colW, y — середина узла.
 * Камера — {x, y, k}: точка полотна (px, py) видна на экране в (x + px · k, y + py · k).
 */
import { TREE, type TreeEdge, type TreeLayout, type TreeNode } from '../../engine/tree.ts';

// ---------- карточки ----------

/** Ширина карточек при масштабе 1: во всю ширину столбца без промежутка между столбцами. */
export const CARD_W = { person: 260, union: 260, unnamed: 260 } as const;
/** Промежуток между столбцами: связи поворачивают посередине него. */
export const COL_GAP = TREE.colW - CARD_W.person;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Прямоугольник узла на полотне. Союз стоит посередине места лица своего столбца. */
export function nodeBox(n: TreeNode): Box {
  const x0 = TREE.pad + n.layer * TREE.colW;
  const w = CARD_W[n.kind];
  return { x: n.kind === 'union' ? x0 + (CARD_W.person - w) / 2 : x0, y: n.y - n.h / 2, w, h: n.h };
}

/** Общий прямоугольник нескольких. */
export function unionBox(bs: readonly Box[]): Box | null {
  if (!bs.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of bs) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------- связи ----------

/** Радиус закругления углов связи, px. */
export const EDGE_R = 6;

type Pt = [number, number];

/** Ломаная с закруглёнными углами (радиус r, не больше половины соседних отрезков) — строка пути SVG. */
export function roundedPath(pts: readonly Pt[], r = EDGE_R): string {
  const p = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  if (p.length < 2) return '';
  const f = (v: number) => String(Math.round(v * 100) / 100);
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [ax, ay] = p[i - 1];
    const [bx, by] = p[i];
    const [cx, cy] = p[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 0.5) {
      d += ` L${f(bx)} ${f(by)}`;
      continue;
    }
    const sx = bx - ((bx - ax) / l1) * rr;
    const sy = by - ((by - ay) / l1) * rr;
    const ex = bx + ((cx - bx) / l2) * rr;
    const ey = by + ((cy - by) / l2) * rr;
    d += ` L${f(sx)} ${f(sy)} Q${f(bx)} ${f(by)} ${f(ex)} ${f(ey)}`;
  }
  const last = p[p.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])}`;
}

/**
 * Точки ортогональной связи от правого края a к левому краю b: вправо, поворот посередине промежутка перед b, по
 * вертикали, вправо до b. off — сдвиг параллельной нити (двойная лента линий Мессии): горизонтальные отрезки — вверх
 * на off, вертикальный — в сторону хода (вниз — вправо, вверх — влево), так нити не пересекаются на поворотах.
 * Связь назад или внутри столбца (редкий случай раскладки) обходит карточки петлёй.
 */
export function edgePoints(a: Box, b: Box, off = 0): Pt[] {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  if (x2 - x1 >= 8) {
    // поворот — посередине промежутка перед целью: связи к детям одного союза и от супругов к союзу идут общим стволом
    const gap = Math.min(COL_GAP + (CARD_W.person - CARD_W.union) / 2, x2 - x1);
    const xm = x2 - gap / 2;
    if (Math.abs(y2 - y1) < 0.5) return [
      [x1, y1 - off],
      [x2, y2 - off],
    ];
    const s = Math.sign(y2 - y1);
    return [
      [x1, y1 - off],
      [xm + s * off, y1 - off],
      [xm + s * off, y2 - off],
      [x2, y2 - off],
    ];
  }
  // назад: из правого края вправо, по вертикали между карточками, влево за цель и к её левому краю
  const out = x1 + COL_GAP / 2;
  const back = x2 - COL_GAP / 2;
  const mid = y2 > y1 ? Math.max(a.y + a.h, b.y) + TREE.gap / 2 : Math.min(a.y, b.y + b.h) - TREE.gap / 2;
  return [
    [x1, y1 - off],
    [out + off, y1 - off],
    [out + off, mid - off],
    [back - off, mid - off],
    [back - off, y2 - off],
    [x2, y2 - off],
  ];
}

/** Путь связи e раскладки t (off — сдвиг нити ленты). */
export function edgePath(t: TreeLayout, e: TreeEdge, off = 0): string {
  const a = t.byKey.get(e.from);
  const b = t.byKey.get(e.to);
  if (!a || !b) return '';
  return roundedPath(edgePoints(nodeBox(a), nodeBox(b), off));
}

// ---------- камера ----------

export interface Cam {
  x: number;
  y: number;
  k: number;
}
/** Пределы масштаба (задача N1): 0,3…1,6. */
export const K_MIN = 0.3;
export const K_MAX = 1.6;
export const clampK = (k: number) => Math.max(K_MIN, Math.min(K_MAX, k));
/** Мельче этого камера сама не уходит (раскрытие, первый показ): карточки остаются читаемыми; «Вписать всё» и «−» — до K_MIN. */
export const K_AUTO = 0.6;

/** Масштаб k у точки экрана (sx, sy): точка полотна под ней остаётся на месте. */
export function zoomAt(c: Cam, k: number, sx: number, sy: number): Cam {
  const k2 = clampK(k);
  const f = k2 / c.k;
  return { x: sx - (sx - c.x) * f, y: sy - (sy - c.y) * f, k: k2 };
}

/** Прямоугольник полотна b на экране при камере c. */
export const toScreen = (c: Cam, b: Box): Box => ({ x: c.x + b.x * c.k, y: c.y + b.y * c.k, w: b.w * c.k, h: b.h * c.k });

/**
 * Вписать прямоугольник b в окно w × h с полями m: масштаб — наибольший, при котором b помещается, но не больше kMax;
 * b — посередине окна. left — прижать к левому краю (древо растёт вправо: первое лицо — слева).
 */
export function fitCam(b: Box, w: number, h: number, o: { m?: number; kMax?: number; left?: boolean } = {}): Cam {
  const m = o.m ?? 40;
  const k = clampK(Math.min(o.kMax ?? 1, (w - 2 * m) / Math.max(1, b.w), (h - 2 * m) / Math.max(1, b.h)));
  const x = o.left && b.w * k <= w - 2 * m ? m - b.x * k : (w - b.w * k) / 2 - b.x * k;
  return { x, y: (h - b.h * k) / 2 - b.y * k, k };
}

/**
 * Показать прямоугольник b: камера сдвигается ровно настолько, чтобы b оказался в окне w × h с полями m. Если b не
 * помещается при нынешнем масштабе, масштаб уменьшается у точки экрана pin (раскрывавшая карточка остаётся на месте,
 * пока это возможно), но не меньше kMin (сам древо не мельчит карточки до нечитаемых) и не меньше K_MIN. Если b не
 * помещается и так — виден его левый верхний угол.
 */
export function revealCam(c: Cam, b: Box, w: number, h: number, o: { m?: number; mt?: number; mb?: number; pin?: [number, number]; kMin?: number } = {}): Cam {
  const m = o.m ?? 24;
  // сверху поле может быть шире (строка «Раскрыто N лиц» у кромки), снизу — тоже (лист карточки на телефоне)
  const mt = Math.max(m, o.mt ?? m);
  const mb = Math.max(m, o.mb ?? m);
  let cam = c;
  const fitK = Math.min((w - 2 * m) / Math.max(1, b.w), Math.max(1, h - mb - mt) / Math.max(1, b.h));
  if (fitK < c.k) cam = zoomAt(c, Math.max(Math.min(c.k, o.kMin ?? K_MIN), K_MIN, fitK), o.pin?.[0] ?? w / 2, o.pin?.[1] ?? h / 2);
  const s = toScreen(cam, b);
  const dx = s.w > w - 2 * m ? m - s.x : s.x < m ? m - s.x : s.x + s.w > w - m ? w - m - (s.x + s.w) : 0;
  const dy = s.h > h - mb - mt ? mt - s.y : s.y < mt ? mt - s.y : s.y + s.h > h - mb ? h - mb - (s.y + s.h) : 0;
  return { x: cam.x + dx, y: cam.y + dy, k: cam.k };
}

/** Промежуточная камера: t — доля пути 0…1 (плавный ход без пружин: ease-in-out). */
export function lerpCam(a: Cam, b: Cam, t: number): Cam {
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, k: a.k + (b.k - a.k) * e };
}
