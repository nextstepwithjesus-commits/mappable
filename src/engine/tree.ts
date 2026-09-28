/**
 * Древо (решение 73): родословие карточками, выстроенными слева направо — лица, их союз, дети союза, союзы детей…
 * Раскладка чистая: получает раскрытых лиц, раскрытые союзы и лиц, у которых показаны союзы, и отдаёт узлы с местами
 * и связи. Небо «набор» и древо держат одно состояние раскрытия (src/ui/reveal.ts).
 *
 * Что показывается:
 *  — лица набора (раскрытые);
 *  — союз — если он раскрыт; или лицо, у которого показаны союзы, — его супруг или ребёнок; или у союза раскрыты
 *    хотя бы один родитель и хотя бы один ребёнок (так древо линий Мессии связно, без братьев и сестёр);
 *  — у показанного союза — оба супруга: названный — карточкой лица, неназванный — пустым местом «не названа в Писании»;
 *  — дети союза — только раскрытые; сколько скрыто — hidden.
 *
 * Столбцы: лицо — чётный слой, союз — между родителями и детьми. Порядок в слое — по соседям (барицентр), места —
 * ближе к соседям без наложений (изотонная регрессия с наименьшими промежутками).
 */
import type { Union, Unions } from './unions.ts';

export type TreeNode =
  | { kind: 'person'; key: string; id: string; layer: number; y: number; h: number }
  | { kind: 'union'; key: string; union: Union; layer: number; y: number; h: number; hidden: number; open: boolean }
  | { kind: 'unnamed'; key: string; union: Union; role: 'a' | 'b'; layer: number; y: number; h: number };

export interface TreeEdge {
  from: string;
  to: string;
  /** spouse — супруг к союзу; child — союз к ребёнку; unnamed — пустое место к союзу (пунктир) */
  kind: 'spouse' | 'child' | 'unnamed';
  /** лицо ребёнка (для child) — по нему интерфейс красит ленты и ветви */
  kid?: string;
}

export interface TreeInput {
  unions: Unions;
  /** раскрытые лица по порядку раскрытия (первые — начало) */
  persons: readonly string[];
  /** лица, у которых показаны союзы (и вниз, и вверх) */
  opened: readonly string[];
  /** раскрытые союзы */
  expanded: readonly string[];
  /** год рождения (астрономический) или null — для порядка */
  birth: (id: string) => number | null;
}

export interface TreeLayout {
  nodes: TreeNode[];
  edges: TreeEdge[];
  /** ключ узла → узел */
  byKey: Map<string, TreeNode>;
  width: number;
  height: number;
}

/** Размеры (px в масштабе 1): ширина столбца, высота карточек, промежутки. */
export const TREE = { colW: 300, personH: 104, unionH: 96, unnamedH: 72, gap: 16, groupGap: 36, pad: 40 };

export const personKey = (id: string) => `p:${id}`;
export const unionKey = (uid: string) => uid;
export const unnamedKey = (uid: string, role: 'a' | 'b') => `${uid}#${role}`;

/** Показанные союзы по правилам модуля. */
export function shownUnions(inp: TreeInput): Union[] {
  const P = new Set(inp.persons);
  const opened = new Set(inp.opened);
  const exp = new Set(inp.expanded);
  const out = new Map<string, Union>();
  const consider = (u: Union) => {
    if (out.has(u.id)) return;
    const parentIn = (!!u.a && P.has(u.a)) || (!!u.b && P.has(u.b));
    const kidIn = u.kids.some((k) => P.has(k));
    const byOpenParent = (!!u.a && opened.has(u.a) && P.has(u.a)) || (!!u.b && opened.has(u.b) && P.has(u.b));
    const byOpenKid = u.kids.some((k) => opened.has(k) && P.has(k));
    if (exp.has(u.id) || byOpenParent || byOpenKid || (parentIn && kidIn)) out.set(u.id, u);
  };
  for (const id of inp.persons) {
    for (const u of inp.unions.of.get(id) ?? []) consider(u);
    for (const u of inp.unions.origin.get(id) ?? []) consider(u);
  }
  for (const uid of inp.expanded) {
    const u = inp.unions.byId.get(uid);
    if (u) consider(u);
  }
  return [...out.values()];
}

/** Изотонная регрессия с наименьшими промежутками: y ближе к желаемым d, y[i+1] − y[i] ≥ g[i]. */
function separate(d: number[], g: number[]): number[] {
  const n = d.length;
  if (!n) return [];
  const off = [0];
  for (let i = 1; i < n; i++) off.push(off[i - 1] + g[i - 1]);
  // z = y − off не убывает: PAVA
  const blocks: { sum: number; n: number }[] = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ sum: d[i] - off[i], n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sum / a.n <= b.sum / b.n) break;
      a.sum += b.sum;
      a.n += b.n;
      blocks.pop();
    }
  }
  const z: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) z.push(b.sum / b.n);
  return z.map((v, i) => v + off[i]);
}

export function layoutTree(inp: TreeInput): TreeLayout {
  const shown = shownUnions(inp);
  const P = new Set(inp.persons);
  const nodes = new Map<string, TreeNode>();
  const adj = new Map<string, Set<string>>();
  const edges: TreeEdge[] = [];
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  const addPerson = (id: string) => {
    const k = personKey(id);
    if (!nodes.has(k)) nodes.set(k, { kind: 'person', key: k, id, layer: 0, y: 0, h: TREE.personH });
    return k;
  };
  for (const id of inp.persons) addPerson(id);
  const exp = new Set(inp.expanded);
  for (const u of shown) {
    const uk = unionKey(u.id);
    const kidsIn = u.kids.filter((k) => P.has(k));
    nodes.set(uk, { kind: 'union', key: uk, union: u, layer: 0, y: 0, h: TREE.unionH, hidden: u.kids.length - kidsIn.length, open: exp.has(u.id) });
    for (const role of ['a', 'b'] as const) {
      const pid = u[role];
      // у союза «иного рода» (по закону, по Луке) второе место не нужно: он про одного родителя
      if (!pid && u.claim && u.claim !== 'legal') continue;
      if (pid) {
        const pk = addPerson(pid);
        edges.push({ from: pk, to: uk, kind: 'spouse' });
        link(pk, uk);
      } else {
        const nk = unnamedKey(u.id, role);
        nodes.set(nk, { kind: 'unnamed', key: nk, union: u, role, layer: 0, y: 0, h: TREE.unnamedH });
        edges.push({ from: nk, to: uk, kind: 'unnamed' });
        link(nk, uk);
      }
    }
    for (const k of kidsIn) {
      const pk = personKey(k);
      edges.push({ from: uk, to: pk, kind: 'child', kid: k });
      link(uk, pk);
    }
  }

  // ---------- слои: обход от начала; лицо — чётный слой, союз — нечётный ----------
  const layerOf = new Map<string, number>();
  const birthOf = (k: string): number => {
    const n = nodes.get(k)!;
    if (n.kind === 'person') return inp.birth(n.id) ?? 1e9;
    const u = n.union;
    const ys = u.kids.map((x) => inp.birth(x)).filter((y): y is number => y !== null);
    return ys.length ? Math.min(...ys) : 1e9;
  };
  const order = [...inp.persons.map(personKey), ...[...nodes.keys()].filter((k) => !inp.persons.includes(k.slice(2)))];
  const edgeDir = new Map<string, number>(); // ключ «a>b» → сдвиг слоя от a к b
  for (const e of edges) {
    // супруг → союз: +1; союз → ребёнок: +1
    edgeDir.set(`${e.from}>${e.to}`, 1);
    edgeDir.set(`${e.to}>${e.from}`, -1);
  }
  for (const start of order) {
    if (layerOf.has(start)) continue;
    // компонента: обход в ширину
    const comp: string[] = [start];
    layerOf.set(start, 0);
    for (let i = 0; i < comp.length; i++) {
      const a = comp[i];
      for (const b of adj.get(a) ?? []) {
        if (layerOf.has(b)) continue;
        layerOf.set(b, layerOf.get(a)! + (edgeDir.get(`${a}>${b}`) ?? 0));
        comp.push(b);
      }
    }
    // компонента начинается со слоя 0
    const min = Math.min(...comp.map((k) => layerOf.get(k)!));
    for (const k of comp) layerOf.set(k, layerOf.get(k)! - min);
  }
  for (const [k, n] of nodes) n.layer = layerOf.get(k) ?? 0;

  // ---------- порядок в слоях: компоненты по порядку, в слое — по рождению, затем барицентр ----------
  const comps = new Map<string, number>();
  {
    let c = 0;
    for (const start of order) {
      if (comps.has(start)) continue;
      const stack = [start];
      comps.set(start, c);
      while (stack.length) {
        const a = stack.pop()!;
        for (const b of adj.get(a) ?? [])
          if (!comps.has(b)) {
            comps.set(b, c);
            stack.push(b);
          }
      }
      c++;
    }
  }
  const layers: string[][] = [];
  for (const [k, n] of nodes) (layers[n.layer] ??= []).push(k);
  for (const L of layers) if (L) L.sort((a, b) => comps.get(a)! - comps.get(b)! || birthOf(a) - birthOf(b) || a.localeCompare(b));
  const pos = new Map<string, number>();
  const reindex = () => layers.forEach((L) => L?.forEach((k, i) => pos.set(k, i)));
  reindex();
  const bary = (k: string, side: number) => {
    const n = nodes.get(k)!;
    const xs = [...(adj.get(k) ?? [])].filter((b) => nodes.get(b)!.layer === n.layer + side).map((b) => pos.get(b)!);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  };
  for (let it = 0; it < 4; it++) {
    for (const [dir, range] of [
      [-1, layers.map((_, i) => i)],
      [1, layers.map((_, i) => layers.length - 1 - i)],
    ] as const) {
      for (const li of range) {
        const L = layers[li];
        if (!L) continue;
        const key = new Map(L.map((k) => [k, bary(k, dir) ?? pos.get(k)!]));
        L.sort((a, b) => comps.get(a)! - comps.get(b)! || key.get(a)! - key.get(b)! || birthOf(a) - birthOf(b));
        L.forEach((k, i) => pos.set(k, i));
      }
    }
  }

  // ---------- места по вертикали ----------
  const Y = new Map<string, number>();
  const gapAfter = (L: string[], i: number) => {
    const a = nodes.get(L[i])!;
    const b = nodes.get(L[i + 1])!;
    const g = comps.get(L[i]) !== comps.get(L[i + 1]) ? TREE.groupGap * 2 : TREE.gap;
    return a.h / 2 + b.h / 2 + g;
  };
  // сначала — подряд
  for (const L of layers) {
    if (!L) continue;
    let y = 0;
    L.forEach((k, i) => {
      if (i) y += gapAfter(L, i - 1);
      Y.set(k, y);
    });
  }
  // затем — к соседям, по слоям вперёд и назад
  for (let it = 0; it < 6; it++) {
    const dirs = it % 2 ? [...layers.keys()].reverse() : [...layers.keys()];
    for (const li of dirs) {
      const L = layers[li];
      if (!L?.length) continue;
      const want = L.map((k) => {
        const nb = [...(adj.get(k) ?? [])].filter((b) => Y.has(b));
        return nb.length ? nb.reduce((s, b) => s + Y.get(b)!, 0) / nb.length : Y.get(k)!;
      });
      const gs = L.slice(0, -1).map((_, i) => gapAfter(L, i));
      separate(want, gs).forEach((y, i) => Y.set(L[i], y));
    }
  }
  let top = Infinity;
  let bottom = -Infinity;
  for (const [k, n] of nodes) {
    n.y = Y.get(k) ?? 0;
    top = Math.min(top, n.y - n.h / 2);
    bottom = Math.max(bottom, n.y + n.h / 2);
  }
  if (!Number.isFinite(top)) top = bottom = 0;
  for (const n of nodes.values()) n.y = n.y - top + TREE.pad;
  const maxLayer = Math.max(0, ...[...nodes.values()].map((n) => n.layer));
  return {
    nodes: [...nodes.values()],
    edges,
    byKey: nodes,
    width: (maxLayer + 1) * TREE.colW + TREE.pad * 2,
    height: bottom - top + TREE.pad * 2,
  };
}
