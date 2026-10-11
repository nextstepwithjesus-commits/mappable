/**
 * Пиксельные места леса — при показе, от измеренной ширины подписей (09 § 3.3; 03 § 3.3 п. 1).
 * Скелет — аккуратное дерево по контурам (Reingold — Tilford с переменной шириной узлов):
 * дети ставятся слева направо как можно ближе, не меняя порядка; родитель — над серединой детей.
 * Без DOM: ширины приходят функцией (в рабочем потоке — measureText в OffscreenCanvas).
 */
import type { Forest } from './forest.ts';

export interface Metrics {
  /** Ширина подписи лица (имя и вторая строка — большая из двух), px при текущем размере текста. */
  personText: (p: number) => number;
  /** Ширина подписи отсыла «Ревекка — жена Исаака». */
  refText: (node: number) => number;
  /** Ширина заголовка полки. */
  shelfText: (s: number) => number;
  /** Масштаб размера текста (1 — «Обычный», 2 — 200 %): шаг рядов и отступы растут вместе с текстом. */
  textScale: number;
}

export const BASE = {
  rowH: 72, // шаг рядов (03-числа.py, ч. 18)
  glyph: 5, // половина знака 10 px
  nameGap: 12, // начало имени — 12 px от центра знака (03 § 3.8.2)
  padR: 8,
  sibGap: 24, // промежуток между соседями (03, приложение А: «имя + 24 px»)
  spouseGap: 16,
  treeGap: 48,
  shelfGap: 2, // в рядах
};

/** Типы подписей в геометрии. */
export const LABEL_PERSON = 0, LABEL_REF = 1, LABEL_SHELF = 2;

export interface Geometry {
  width: number;
  height: number;
  rowH: number;
  /** Подписи: лица (по одной на лицо в лесу), отсылы, заголовки полок. Места — левый верх, px при масштабе 1. */
  labels: { x: Float32Array; y: Float32Array; w: Float32Array; kind: Uint8Array; ref: Int32Array; count: number };
  /** Номер подписи лица по номеру лица (−1 — лица нет в лесу). */
  labelOfPerson: Int32Array;
  /** Отрезки линий x1, y1, x2, y2. */
  segs: Float32Array;
  segCount: number;
}

interface Contour { top: number; l: number[]; r: number[] }

export function layoutForest(f: Forest, m: Metrics): Geometry {
  const s = m.textScale;
  const rowH = BASE.rowH * s;
  const sib = BASE.sibGap * s, spouse = BASE.spouseGap * s, tree = BASE.treeGap * s;
  const lead = BASE.glyph + BASE.nameGap * s; // от левого края узла до начала имени
  const pw = new Float64Array(f.persons.length);
  for (let p = 0; p < pw.length; p++) pw[p] = lead + m.personText(p) + BASE.padR * s;
  const nodes = f.nodes;
  const nw = new Float64Array(nodes.length); // ширина узла
  const inner: number[][] = nodes.map((n) => {
    if (n.kind === 'ref') { nw[n.key] = lead + m.refText(n.key) + BASE.padR * s; return [0]; }
    const xs: number[] = [];
    let x = 0;
    for (const p of n.persons) { xs.push(x); x += pw[p] + spouse; }
    nw[n.key] = x - spouse;
    return xs;
  });
  const rel = new Float64Array(nodes.length); // левый край узла относительно левого края родителя

  // контур поддерева: для каждого ряда — крайние левая и правая точки относительно левого края корня
  const layout = (k: number): Contour => {
    const n = nodes[k];
    if (!n.children.length) return { top: n.row, l: [0], r: [nw[k]] };
    let acc: Contour | null = null;
    const offs: number[] = [];
    const subs: Contour[] = [];
    for (const c of n.children) {
      const cc = layout(c);
      subs.push(cc);
      let off = 0;
      if (acc) {
        off = -Infinity;
        const from = Math.max(acc.top, cc.top), to = Math.min(acc.top + acc.l.length, cc.top + cc.l.length);
        for (let r = from; r < to; r++) off = Math.max(off, acc.r[r - acc.top] + sib - cc.l[r - cc.top]);
        if (off === -Infinity) off = Math.max(...acc.r) + sib;
        acc = merge(acc, cc, off);
      } else acc = merge(null, cc, 0);
      offs.push(off);
    }
    const g = (i: number) => offs[i] + BASE.glyph; // центр знака главы ребёнка
    const center = (g(0) + g(offs.length - 1)) / 2;
    const left = center - BASE.glyph;
    n.children.forEach((c, i) => (rel[c] = offs[i] - left));
    const out: Contour = { top: n.row, l: [0], r: [nw[k]] };
    return merge(out, acc!, -left);
  };

  const shelfTitleH = 28 * s;
  const lx = new Float32Array(f.persons.length + nodes.length + f.shelves.length);
  const ly = new Float32Array(lx.length), lw = new Float32Array(lx.length);
  const lkind = new Uint8Array(lx.length), lref = new Int32Array(lx.length);
  let lc = 0;
  const labelOfPerson = new Int32Array(f.persons.length).fill(-1);
  const absX = new Float64Array(nodes.length);
  const absY = new Float64Array(nodes.length); // верх ряда
  const segs: number[] = [];

  let y0 = 0;
  let maxW = 0;
  f.shelves.forEach((shelf, si) => {
    const title = lc++;
    lx[title] = 0; ly[title] = y0; lw[title] = m.shelfText(si); lkind[title] = LABEL_SHELF; lref[title] = si;
    const top = y0 + shelfTitleH;
    const place = (root: number, x: number, yTop: number) => {
      const st: [number, number][] = [[root, x]];
      while (st.length) {
        const [k, xx] = st.pop()!;
        absX[k] = xx; absY[k] = yTop + nodes[k].row * rowH;
        for (const c of nodes[k].children) st.push([c, xx + rel[c]]);
      }
    };
    if (si === 0) {
      // главный лес: деревья острова по контурам, как соседи
      let acc: Contour | null = null;
      const offs: number[] = [];
      for (const r of shelf.roots) {
        const cc = layout(r);
        let off = 0;
        if (acc) {
          off = -Infinity;
          const from = Math.max(acc.top, cc.top), to = Math.min(acc.top + acc.l.length, cc.top + cc.l.length);
          for (let q = from; q < to; q++) off = Math.max(off, acc.r[q - acc.top] + tree - cc.l[q - cc.top]);
          if (off === -Infinity) off = Math.max(...acc.r) + tree;
        }
        acc = merge(acc, cc, off);
        offs.push(off);
      }
      const minL = acc ? Math.min(...acc.l) : 0;
      shelf.roots.forEach((r, i) => place(r, offs[i] - minL, top));
      maxW = acc ? Math.max(...acc.r) - minL : 0;
      y0 = top + shelf.rows * rowH + BASE.shelfGap * rowH;
    } else {
      // полка островов: укладка прямоугольниками по строкам, ширина — как у главного леса
      const limit = Math.max(maxW, 1200 * s);
      let x = 0, lineTop = top, lineRows = 0;
      for (const r of shelf.roots) {
        const cc = layout(r);
        const minL = Math.min(...cc.l), w = Math.max(...cc.r) - minL, rows = cc.top + cc.l.length;
        if (x > 0 && x + w > limit) { lineTop += (lineRows + 1) * rowH; x = 0; lineRows = 0; }
        place(r, x - minL, lineTop);
        x += w + tree;
        lineRows = Math.max(lineRows, rows);
      }
      y0 = lineTop + lineRows * rowH + BASE.shelfGap * rowH;
    }
  });

  // подписи и линии
  const gy = 10 * s; // центр знака — середина строки имени 20 px
  for (const n of nodes) {
    const x = absX[n.key], y = absY[n.key];
    if (n.kind === 'ref') {
      const i = lc++;
      lx[i] = x; ly[i] = y; lw[i] = nw[n.key]; lkind[i] = LABEL_REF; lref[i] = n.key;
    } else {
      n.persons.forEach((p, j) => {
        const i = lc++;
        lx[i] = x + inner[n.key][j]; ly[i] = y; lw[i] = pw[p]; lkind[i] = LABEL_PERSON; lref[i] = p;
        labelOfPerson[p] = i;
      });
      // черта союза: от знака главы к знаку каждой жены
      // (от конца подписи предыдущего лица до знака жены — черта не перечёркивает имена)
      for (let j = 1; j < n.persons.length; j++) segs.push(x + inner[n.key][j - 1] + pw[n.persons[j - 1]] - BASE.padR * s + 2, y + gy, x + inner[n.key][j] + BASE.glyph - BASE.glyph - 1, y + gy);
    }
    if (n.children.length) {
      const px = x + BASE.glyph, py = y + gy + BASE.glyph + 2;
      const bus = y + rowH - 14 * s;
      let minX = px, maxX = px;
      for (const c of n.children) {
        const cx = absX[c] + BASE.glyph;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        segs.push(cx, bus, cx, absY[c] + gy - BASE.glyph - 2);
      }
      segs.push(px, py, px, bus);
      if (maxX > minX) segs.push(minX, bus, maxX, bus);
    }
  }
  let width = 0;
  for (let i = 0; i < lc; i++) width = Math.max(width, lx[i] + lw[i]);
  return {
    width, height: y0, rowH,
    labels: { x: lx.slice(0, lc), y: ly.slice(0, lc), w: lw.slice(0, lc), kind: lkind.slice(0, lc), ref: lref.slice(0, lc), count: lc },
    labelOfPerson, segs: Float32Array.from(segs), segCount: segs.length / 4,
  };
}

function merge(a: Contour | null, b: Contour, off: number): Contour {
  if (!a) return { top: b.top, l: b.l.map((v) => v + off), r: b.r.map((v) => v + off) };
  const top = Math.min(a.top, b.top), end = Math.max(a.top + a.l.length, b.top + b.l.length);
  const l: number[] = new Array(end - top), r: number[] = new Array(end - top);
  for (let q = top; q < end; q++) {
    const ia = q - a.top, ib = q - b.top;
    const ha = ia >= 0 && ia < a.l.length, hb = ib >= 0 && ib < b.l.length;
    l[q - top] = ha && hb ? Math.min(a.l[ia], b.l[ib] + off) : ha ? a.l[ia] : b.l[ib] + off;
    r[q - top] = ha && hb ? Math.max(a.r[ia], b.r[ib] + off) : ha ? a.r[ia] : b.r[ib] + off;
  }
  return { top, l, r };
}
