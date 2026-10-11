/**
 * Лес Генеалогии: порядок, ряды, острова и полки — то, что не зависит от шрифта (09 § 3.3; 03 § 3.3 п. 1).
 * Пикселей здесь нет: места считает layout.ts от измеренной ширины подписей.
 *
 * Правила взяты из 03 § 3.3 и повторяют счёт `docs/app/data/03-числа.py` (родитель раскладки, ряды, острова):
 * - родитель раскладки — ребро «natural» с достоверностью «сказано» или «вывод», действующее при прочтениях
 *   по умолчанию; отец, без отца — мать; без такого ребра — предок по ребру «ancestor»;
 * - ребро с тождеством «предположительно» не рисуется;
 * - жена стоит у мужа (у первого по тексту), в своей семье — отсыл; союз с отцом (дочери Лота) — исключение;
 * - острова — связные части по рёбрам раскладки и союзам; остров ставится на полку области с контуром.
 *
 * Упрощения пробы (записаны в README): гребёнка «больше 8 детей», свёртка союзов «больше трёх» на холсте
 * и отсылы рёбер другого места не строятся — лес от этого только шире, то есть проба строже продукта.
 */
import type { IndexPackage, Sex } from './types.ts';

export interface Person {
  idx: number;
  id: string;
  name: string;
  sex?: Sex;
  kind: string;
  prom: number;
  /** Вторая строка: короткое уточнение тёзки до первой запятой, не длиннее 24 знаков (03 § 3.8.4). */
  note?: string;
}

export type NodeKind = 'block' | 'ref';

/** Узел раскладки: блок лица (лицо и жёны, что стоят у него) или отсыл. */
export interface FNode {
  key: number;
  kind: NodeKind;
  /** Лица блока слева направо: глава, затем жёны в порядке текста. У отсыла — одно лицо (жена из другой строки). */
  persons: number[];
  /** Всего союзов главы (для строки «N союзов»). */
  unions: number;
  /** Для отсыла — номер лица-мужа, у которого жена стоит (подпись «Ревекка — жена Исаака»). */
  refHusband?: number;
  children: number[];
  parent: number;
  /** Ряд от верха полки (у главного леса — от Адама). */
  row: number;
  shelf: number;
  island: number;
}

export interface Shelf {
  name: string;
  /** Корни деревьев полки слева направо. */
  roots: number[];
  rows: number;
  /** Ряды у полки — «ряды схемы» (главный лес) или без номеров (острова). */
  numbered: boolean;
}

export interface Forest {
  persons: Person[];
  nodes: FNode[];
  shelves: Shelf[];
  /** Номер узла, где стоит лицо (у жены — блок мужа). */
  nodeOf: Int32Array;
  /** Родитель раскладки (номер лица или −1). */
  layoutParent: Int32Array;
  /** Число связных частей (островов), включая главный лес. */
  islands: number;
  islandSize: number[];
  stats: { layoutNatural: number; ancestorOnly: number; inForest: number; refs: number };
}

const CONTOUR_KINDS = new Set(['tribe', 'house', 'nation']);
const OTHER_SHELF = 'Другие семьи';

export function shortNote(d?: string): string | undefined {
  if (!d) return undefined;
  const first = d.split(',')[0].trim();
  return first.length <= 24 ? first : first.slice(0, 23).trimEnd() + '…';
}

export function buildForest(pkg: IndexPackage): Forest {
  const idxOf = new Map<string, number>();
  const persons: Person[] = pkg.actors.map((a, i) => {
    idxOf.set(a.id, i);
    return { idx: i, id: a.id, name: a.n, sex: a.s, kind: a.k, prom: a.p ?? 1, note: shortNote(a.d) };
  });
  const N = persons.length;
  const def = new Map(pkg.readings.map((r) => [r.id, r.d]));
  const active = (o: (typeof pkg.origins)[number]) => !o.rs || (o.ri ?? []).includes(def.get(o.rs) ?? '');
  const drawn = pkg.origins.filter((o) => o.id?.d !== 'possible');

  // 1. Родитель раскладки (03 § 3.3 п. 1)
  const lp = new Int32Array(N).fill(-1);
  const lpOrigin = new Int32Array(N).fill(-1); // номер ребра в pkg.origins — для порядка детей
  const originIndex = new Map(pkg.origins.map((o, i) => [o, i]));
  let layoutNatural = 0;
  for (const o of drawn) {
    if (!o.p || !active(o)) continue;
    const c = idxOf.get(o.c), p = idxOf.get(o.p);
    if (c === undefined || p === undefined || c === p) continue;
    if (o.k === 'natural' && (o.ce === undefined || o.ce === 'inference')) {
      if (o.r === 'f' || lp[c] < 0) {
        if (lp[c] < 0) layoutNatural++;
        lp[c] = p;
        lpOrigin[c] = originIndex.get(o)!;
      }
    }
  }
  let ancestorOnly = 0;
  for (const o of drawn) {
    if (!o.p || o.k !== 'ancestor') continue;
    const c = idxOf.get(o.c), p = idxOf.get(o.p);
    if (c === undefined || p === undefined || c === p || lp[c] >= 0) continue;
    lp[c] = p;
    lpOrigin[c] = originIndex.get(o)!;
    ancestorOnly++;
  }
  // разрыв циклов (при ошибке данных): идём вверх, повтор — обрываем ребро
  for (let i = 0; i < N; i++) {
    const seen = new Set<number>([i]);
    let x = lp[i];
    while (x >= 0) {
      if (seen.has(x)) { lp[i] = -1; break; }
      seen.add(x);
      x = lp[x];
    }
  }

  // лица Генеалогии: в любом ребре с родителем или в союзе (как 03-числа.py: по всем рёбрам)
  const inG = new Uint8Array(N);
  for (const o of pkg.origins) {
    if (!o.p) continue;
    const c = idxOf.get(o.c), p = idxOf.get(o.p);
    if (c !== undefined && p !== undefined) inG[c] = inG[p] = 1;
  }
  const unions = pkg.unions
    .map((u) => ({ h: idxOf.get(u.h) ?? -1, w: idxOf.get(u.w) ?? -1 }))
    .filter((u) => u.h >= 0 && u.w >= 0 && u.h !== u.w);
  for (const u of unions) inG[u.h] = inG[u.w] = 1;

  // 2. Жена стоит у мужа (первого по тексту); союз с собственным отцом — исключение
  const husbandAt = new Int32Array(N).fill(-1);
  const unionCount = new Int32Array(N);
  const wivesOf = new Map<number, number[]>();
  for (const u of unions) unionCount[u.h]++;
  for (const u of unions) {
    if (husbandAt[u.w] >= 0 || husbandAt[u.h] >= 0 || lp[u.w] === u.h) continue;
    // муж не может стоять у жены, если она сама у кого-то стоит; жена-глава чужих жён не бывает
    if (wivesOf.has(u.w)) continue;
    // муж — потомок жены по раскладке: блок дал бы цикл; оставляем жену в своей семье
    let x = lp[u.h], cyc = false;
    while (x >= 0) { if (x === u.w) { cyc = true; break; } x = lp[x]; }
    if (cyc) continue;
    husbandAt[u.w] = u.h;
    if (!wivesOf.has(u.h)) wivesOf.set(u.h, []);
    wivesOf.get(u.h)!.push(u.w);
  }

  // 3. Узлы: блоки глав и отсылы
  const nodes: FNode[] = [];
  const nodeOf = new Int32Array(N).fill(-1);
  const mk = (kind: NodeKind, ps: number[], extra: Partial<FNode> = {}): number => {
    const key = nodes.length;
    nodes.push({ key, kind, persons: ps, unions: 0, children: [], parent: -1, row: 0, shelf: 0, island: -1, ...extra });
    return key;
  };
  for (let i = 0; i < N; i++) {
    if (!inG[i] || husbandAt[i] >= 0) continue;
    const k = mk('block', [i, ...(wivesOf.get(i) ?? [])], { unions: unionCount[i] });
    for (const p of nodes[k].persons) nodeOf[p] = k;
  }
  // мать ребёнка — для порядка по союзам
  const motherOf = new Int32Array(N).fill(-1);
  for (const o of drawn) {
    if (o.r !== 'm' || !o.p || !active(o)) continue;
    const c = idxOf.get(o.c), p = idxOf.get(o.p);
    if (c !== undefined && p !== undefined && motherOf[c] < 0) motherOf[c] = p;
  }
  type Kid = { node: number; union: number; order: number; origin: number };
  const kids = new Map<number, Kid[]>();
  const addKid = (parentNode: number, kid: Kid) => {
    if (!kids.has(parentNode)) kids.set(parentNode, []);
    kids.get(parentNode)!.push(kid);
  };
  const orderOf = (c: number) => {
    const oi = lpOrigin[c];
    return oi >= 0 ? (pkg.origins[oi].or ?? 1e6) : 1e6;
  };
  const unionRank = (head: number, c: number) => {
    const ws = nodes[nodeOf[head]]?.persons ?? [];
    const m = motherOf[c];
    const r = m >= 0 ? ws.indexOf(m) : -1;
    return r < 0 ? 1e3 : r;
  };
  let refs = 0;
  for (let c = 0; c < N; c++) {
    if (!inG[c] || lp[c] < 0) continue;
    const pn = nodeOf[lp[c]];
    if (pn < 0) continue;
    const head = nodes[pn].persons[0];
    const kid = { union: unionRank(head, c), order: orderOf(c), origin: lpOrigin[c] };
    if (husbandAt[c] >= 0) {
      // жена в своей семье — отсыл (03 § 3.3: «Ревекка — жена Исаака»)
      const r = mk('ref', [c], { refHusband: husbandAt[c] });
      refs++;
      addKid(pn, { node: r, ...kid });
    } else {
      addKid(pn, { node: nodeOf[c], ...kid });
    }
  }
  for (const [pn, ks] of kids) {
    ks.sort((a, b) => a.union - b.union || a.order - b.order || a.origin - b.origin);
    nodes[pn].children = ks.map((k) => k.node);
    for (const k of ks) nodes[k.node].parent = pn;
  }

  // 4. Острова: связные части по рёбрам раскладки и союзам
  const uf = new Int32Array(N).map((_, i) => i);
  const find = (x: number): number => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
  const join = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) uf[a] = b; };
  for (let c = 0; c < N; c++) if (lp[c] >= 0 && inG[c]) join(c, lp[c]);
  for (const u of unions) join(u.h, u.w);
  const compId = new Map<number, number>();
  const compSize: number[] = [];
  const compOf = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (!inG[i]) continue;
    const r = find(i);
    if (!compId.has(r)) { compId.set(r, compSize.length); compSize.push(0); }
    compOf[i] = compId.get(r)!;
    compSize[compOf[i]]++;
  }
  for (const n of nodes) n.island = compOf[n.persons[0]];

  // 5. Ряды: глубина от корня; деревья одного острова выравниваются по отсылам (ряд жены = ряд мужа)
  const depth = new Int32Array(nodes.length).fill(-1);
  const rootOf = new Int32Array(nodes.length).fill(-1);
  const roots = nodes.filter((n) => n.parent < 0).map((n) => n.key);
  for (const r of roots) {
    const st = [r];
    depth[r] = 0; rootOf[r] = r;
    while (st.length) {
      const x = st.pop()!;
      for (const c of nodes[x].children) { depth[c] = depth[x] + 1; rootOf[c] = r; st.push(c); }
    }
  }
  const offset = new Map<number, number>(); // корень → сдвиг ряда внутри острова
  const adam = idxOf.get('adam');
  const mainIsland = adam !== undefined && inG[adam] ? compOf[adam] : 0;
  const byIsland = new Map<number, number[]>();
  for (const r of roots) {
    const isl = nodes[r].island;
    if (!byIsland.has(isl)) byIsland.set(isl, []);
    byIsland.get(isl)!.push(r);
  }
  // связи «один ряд»: отсыл жены и блок её мужа; союз, чьи супруги стоят в разных деревьях (Руфь у Махлона и Вооз)
  const links = new Map<number, [number, number][]>(); // корень → [узел в этом дереве, узел в другом дереве]
  const link = (a: number, b: number) => {
    const ra = rootOf[a], rb = rootOf[b];
    if (ra < 0 || rb < 0 || ra === rb) return;
    if (!links.has(ra)) links.set(ra, []);
    if (!links.has(rb)) links.set(rb, []);
    links.get(ra)!.push([a, b]);
    links.get(rb)!.push([b, a]);
  };
  for (const n of nodes) if (n.kind === 'ref') link(n.key, nodeOf[n.refHusband!]);
  for (const u of unions) if (nodeOf[u.h] >= 0 && nodeOf[u.w] >= 0) link(nodeOf[u.h], nodeOf[u.w]);
  for (const [isl, rs] of byIsland) {
    // первым — дерево Адама (главный лес) или самое большое дерево острова
    const size = (r: number) => { let s = 0; const st = [r]; while (st.length) { const x = st.pop()!; s++; st.push(...nodes[x].children); } return s; };
    const sized = rs.map((r) => ({ r, s: size(r) }));
    sized.sort((a, b) => b.s - a.s || a.r - b.r);
    if (isl === mainIsland && adam !== undefined) {
      const ai = sized.findIndex((x) => x.r === nodeOf[adam]);
      if (ai > 0) sized.unshift(...sized.splice(ai, 1));
    }
    offset.set(sized[0].r, 0);
    let progress = true;
    while (progress) {
      progress = false;
      for (const { r } of sized) {
        if (offset.has(r)) continue;
        for (const [mine, other] of links.get(r) ?? []) {
          const or = rootOf[other];
          if (!offset.has(or)) continue;
          offset.set(r, offset.get(or)! + depth[other] - depth[mine]);
          progress = true;
          break;
        }
      }
    }
    for (const { r } of sized) if (!offset.has(r)) offset.set(r, 0);
    const min = Math.min(...sized.map(({ r }) => offset.get(r)!));
    for (const { r } of sized) offset.set(r, offset.get(r)! - Math.min(0, min));
    byIsland.set(isl, sized.map((x) => x.r));
  }
  for (const n of nodes) n.row = depth[n.key] + offset.get(rootOf[n.key])!;

  // 6. Полки: главный лес; острова — на полку области с контуром (сама, объемлющая), иначе «Другие семьи»
  const areas = new Map(pkg.areas.map((a) => [a.id, a]));
  const hasContour = (id: string) => { const a = areas.get(id); return !!a && CONTOUR_KINDS.has(a.k) && !!a.f; };
  const contourOf = (id: string): string | undefined => {
    let a = areas.get(id);
    const seen = new Set<string>();
    while (a && !seen.has(a.id)) { if (hasContour(a.id)) return a.id; seen.add(a.id); a = a.pa ? areas.get(a.pa) : undefined; }
    return undefined;
  };
  const areaOf = new Map<number, string>();
  for (const m of pkg.members) { const i = idxOf.get(m[0]); if (i !== undefined && !areaOf.has(i)) areaOf.set(i, m[1]); }
  const shelfName = new Map<number, string>();
  const areaCount = new Map<number, Map<string, number>>();
  for (const [i, a] of areaOf) {
    const isl = compOf[i];
    if (isl < 0) continue;
    if (!areaCount.has(isl)) areaCount.set(isl, new Map());
    const m = areaCount.get(isl)!;
    m.set(a, (m.get(a) ?? 0) + 1);
  }
  for (const isl of byIsland.keys()) {
    if (isl === mainIsland) continue;
    const cnt = areaCount.get(isl) ?? new Map<string, number>();
    const top = [...cnt].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    const c = top ? contourOf(top[0]) : undefined;
    shelfName.set(isl, c ? areas.get(c)!.n : OTHER_SHELF);
  }
  const shelves: Shelf[] = [{ name: 'Главный лес', roots: byIsland.get(mainIsland) ?? [], rows: 0, numbered: true }];
  const order = [...pkg.areas.filter((a) => hasContour(a.id)).map((a) => a.n), OTHER_SHELF];
  for (const name of order) {
    const isls = [...shelfName].filter(([, n]) => n === name).map(([i]) => i);
    if (!isls.length) continue;
    isls.sort((a, b) => compSize[b] - compSize[a] || a - b);
    shelves.push({ name, roots: isls.flatMap((i) => byIsland.get(i)!), rows: 0, numbered: false });
  }
  shelves.forEach((s, si) => {
    let rows = 0;
    for (const r of s.roots) {
      const st = [r];
      while (st.length) { const x = st.pop()!; nodes[x].shelf = si; rows = Math.max(rows, nodes[x].row + 1); st.push(...nodes[x].children); }
    }
    s.rows = rows;
  });

  return {
    persons, nodes, shelves, nodeOf, layoutParent: lp, islands: compSize.length, islandSize: compSize,
    stats: { layoutNatural, ancestorOnly, inForest: inG.reduce((s, x) => s + x, 0), refs },
  };
}

/** Ряд схемы от корня по родителю раскладки (как row() в 03-числа.py). */
export function rowByParent(f: Forest, id: string): { row: number; root: string } {
  let x = f.persons.findIndex((p) => p.id === id);
  let d = 0;
  while (f.layoutParent[x] >= 0) { x = f.layoutParent[x]; d++; }
  return { row: d, root: f.persons[x].id };
}
