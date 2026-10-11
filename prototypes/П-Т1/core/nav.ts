/**
 * Фокус по графу данных (09 § 3.2.3 п. 1): стрелки ходят по рёбрам леса, а не по элементам DOM.
 * ↑ — родитель раскладки; ↓ — первый ребёнок; ← → — соседи в ряду семьи (глава, жёны, братья и сёстры).
 */
import type { Forest } from './forest.ts';

export type Dir = 'up' | 'down' | 'left' | 'right';

/** Лица ряда семьи по порядку текста: блоки детей родителя (главы и жёны); у корней — корни полки. */
function siblingRow(f: Forest, p: number): number[] {
  const node = f.nodes[f.nodeOf[p]];
  const list = node.parent >= 0
    ? f.nodes[node.parent].children
    : f.shelves[node.shelf].roots;
  return list.flatMap((k) => (f.nodes[k].kind === 'block' ? f.nodes[k].persons : []));
}

export function step(f: Forest, p: number, dir: Dir): number {
  if (p < 0 || f.nodeOf[p] < 0) return p;
  const node = f.nodes[f.nodeOf[p]];
  if (dir === 'up') {
    const lp = f.layoutParent[p];
    if (lp >= 0 && f.nodeOf[lp] >= 0) return lp;
    return node.parent >= 0 ? f.nodes[node.parent].persons[0] : p;
  }
  if (dir === 'down') {
    const first = node.children.map((k) => f.nodes[k]).find((n) => n.kind === 'block');
    return first ? first.persons[0] : p;
  }
  const row = siblingRow(f, p);
  const i = row.indexOf(p);
  const j = dir === 'left' ? i - 1 : i + 1;
  return j >= 0 && j < row.length ? row[j] : p;
}

/** Уровень, число и место в наборе — от данных, даже если построена часть кнопок (09 § 3.2.3 п. 5). */
export function treePos(f: Forest, p: number) {
  const node = f.nodes[f.nodeOf[p]];
  const row = siblingRow(f, p);
  return { level: node.row + 1, setsize: row.length, posinset: row.indexOf(p) + 1 };
}
