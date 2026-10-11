/**
 * Пространственный индекс геометрии: равномерная сетка ячеек со списками (CSR).
 * Нужен, чтобы строить только видимое с запасом (09 § 3.2.1 п. 2): запрос окна — O(ячеек окна + найденного).
 */
import type { Geometry } from './layout.ts';

export interface Grid {
  cell: number;
  cols: number;
  rows: number;
  /** Подписи: начало списка ячейки и номера. */
  lStart: Uint32Array;
  lItems: Uint32Array;
  /** Отрезки. */
  sStart: Uint32Array;
  sItems: Uint32Array;
}

function csr(cols: number, rows: number, count: number, cellsOf: (i: number, emit: (c: number) => void) => void) {
  const n = cols * rows;
  const cnt = new Uint32Array(n + 1);
  for (let i = 0; i < count; i++) cellsOf(i, (c) => cnt[c + 1]++);
  for (let c = 0; c < n; c++) cnt[c + 1] += cnt[c];
  const pos = cnt.slice(0, n);
  const items = new Uint32Array(cnt[n]);
  for (let i = 0; i < count; i++) cellsOf(i, (c) => (items[pos[c]++] = i));
  return { start: cnt, items };
}

export function buildGrid(g: Geometry, cell = 512): Grid {
  const cols = Math.max(1, Math.ceil(g.width / cell) + 1), rows = Math.max(1, Math.ceil(g.height / cell) + 1);
  const clampC = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
  const clampR = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
  const rect = (x0: number, y0: number, x1: number, y1: number, emit: (c: number) => void) => {
    for (let r = clampR(y0); r <= clampR(y1); r++) for (let c = clampC(x0); c <= clampC(x1); c++) emit(r * cols + c);
  };
  const L = g.labels;
  const lab = csr(cols, rows, L.count, (i, e) => rect(L.x[i], L.y[i], L.x[i] + L.w[i], L.y[i] + g.rowH * 0.5, e));
  const S = g.segs;
  const seg = csr(cols, rows, g.segCount, (i, e) =>
    rect(Math.min(S[4 * i], S[4 * i + 2]), Math.min(S[4 * i + 1], S[4 * i + 3]), Math.max(S[4 * i], S[4 * i + 2]), Math.max(S[4 * i + 1], S[4 * i + 3]), e));
  return { cell, cols, rows, lStart: lab.start, lItems: lab.items, sStart: seg.start, sItems: seg.items };
}

/** Номера подписей и отрезков в прямоугольнике (px при масштабе 1). Без повторов. */
export function query(grid: Grid, x0: number, y0: number, x1: number, y1: number, seenL: Uint8Array, seenS: Uint8Array) {
  const c0 = Math.max(0, Math.floor(x0 / grid.cell)), c1 = Math.min(grid.cols - 1, Math.floor(x1 / grid.cell));
  const r0 = Math.max(0, Math.floor(y0 / grid.cell)), r1 = Math.min(grid.rows - 1, Math.floor(y1 / grid.cell));
  const labels: number[] = [], segs: number[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const cell = r * grid.cols + c;
    for (let j = grid.lStart[cell]; j < grid.lStart[cell + 1]; j++) { const i = grid.lItems[j]; if (!seenL[i]) { seenL[i] = 1; labels.push(i); } }
    for (let j = grid.sStart[cell]; j < grid.sStart[cell + 1]; j++) { const i = grid.sItems[j]; if (!seenS[i]) { seenS[i] = 1; segs.push(i); } }
  }
  for (const i of labels) seenL[i] = 0;
  for (const i of segs) seenS[i] = 0;
  return { labels, segs };
}
