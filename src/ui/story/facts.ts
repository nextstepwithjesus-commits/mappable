/**
 * Строки шага рассказа из графа (этап 16, решение 187): только данные — союзы и дети опорного лица (ветви, решение 69) и
 * его место на лентах Мессии (data/lines). Имена — в именительном падеже, списком: строка интерфейса не подставляет имя
 * в падеж без склонения (CLAUDE.md). Модуль чистый: тесты зовут его без неба.
 */
import { byId, lines } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { unionsOf } from '../reveal.ts';
import type { Union } from '../../engine/unions.ts';

/** Ветвь опорного лица: союз (мать или отец детей) и дети по порядку данных; i — номер ветви (цвет ветви, решение 69). */
export interface BranchRow {
  kind: 'branch';
  i: number;
  /** другой родитель ветви (жена, наложница, муж) — по союзу; null — не назван или ветвь по ребёнку */
  other: string | null;
  /** дети ветви */
  kids: string[];
  /** стих ветви: союза или, у ветви-ребёнка, его происхождения */
  ref: string | null;
}

/** Лента Мессии у опорного лица: обе ленты через него, расходятся после него, сходятся в нём. */
export interface LineRow {
  kind: 'lines';
  how: 'both' | 'split' | 'join';
  /** лица строки: у «both» и «join» — само лицо; у «split» — следующие лица ленты Иосифа и ленты по Луке */
  ids: string[];
  /** стихи по лицам строки: у «both» и «join» — Мф и Лк лица; у «split» — стих каждого из следующих */
  refs: string[];
}

export type FactRow = BranchRow | LineRow;

/** Союзы лица с детьми (кровные, без «по закону» и «по Луке») — в том же порядке, что ветви неба (engine/unions.ts, branchesOf). */
const ownUnions = (id: string): Union[] => unionsOf(id).filter((u) => !u.claim && u.kids.length > 0);

/** Год рождения лица в нынешней модели — порядок детей, если данные дают их не по порядку. */
const born = (id: string): number => model.peek().chrono.get(id)?.b ?? Infinity;

/**
 * Ветви лица (решение 69): союзов с детьми два и больше — ветвь на союз; один — ветвь на ребёнка. Номер строки — номер
 * ветви на небе (цвет). Дети — по году рождения, при равенстве — по порядку данных.
 */
export function branchRows(id: string): BranchRow[] {
  const own = ownUnions(id);
  const order = (kids: string[]) => kids.filter((k) => byId.has(k)).map((k, j) => ({ k, j })).sort((a, b) => born(a.k) - born(b.k) || a.j - b.j).map((q) => q.k);
  if (own.length > 1)
    return own.map((u, i) => ({ kind: 'branch' as const, i, other: (u.a === id ? u.b : u.a) ?? null, kids: order(u.kids), ref: u.refs[0] ?? null }));
  if (own.length === 1) {
    const u = own[0];
    return u.kids
      .filter((k) => byId.has(k))
      .map((k, i) => ({ kind: 'branch' as const, i, other: null, kids: [k], ref: byId.get(k)?.parentRefs[0] ?? u.refs[0] ?? null }));
  }
  return [];
}

/** Стих лица на ленте: у ленты Иосифа — первый стих Мф (иначе первый стих шага), у ленты по Луке — первый стих Лк. */
function lineRef(steps: readonly { id: string; refs: string[] }[], id: string, book: 'Мф' | 'Лк'): string | null {
  const st = steps.find((s) => s.id === id);
  if (!st) return null;
  return st.refs.find((r) => r.startsWith(`${book} `)) ?? st.refs[0] ?? null;
}

/**
 * Место лица на лентах Мессии (ТЗ § 3.2): общий участок, на котором стоит лицо, — его начало (схождение, если у лент
 * разные предыдущие лица) и конец (расхождение, если разные следующие). Строка «сходятся» — когда схождение в самом
 * лице или в лице кадра (near); «расходятся» — когда расхождение после лица или после лица кадра; иначе «обе ленты».
 * Лица нет на обеих лентах — строк нет.
 */
export function lineRows(id: string, near: readonly string[] = []): LineRow[] {
  const J = lines.joseph.persons;
  const M = lines.mary.persons;
  const jIds = J.map((s) => s.id);
  const mIds = M.map((s) => s.id);
  const ji = jIds.indexOf(id);
  const mi = mIds.indexOf(id);
  if (ji < 0 || mi < 0) return [];
  // общий участок вокруг лица: соседи совпадают
  let a = 0;
  while (ji - a - 1 >= 0 && mi - a - 1 >= 0 && jIds[ji - a - 1] === mIds[mi - a - 1]) a++;
  let b = 0;
  while (ji + b + 1 < jIds.length && mi + b + 1 < mIds.length && jIds[ji + b + 1] === mIds[mi + b + 1]) b++;
  const start = jIds[ji - a];
  const end = jIds[ji + b];
  const js = ji - a;
  const ms = mi - a;
  const je = ji + b;
  const me = mi + b;
  const inFrame = (x: string) => x === id || near.includes(x);
  const out: LineRow[] = [];
  const both = (x: string) => [lineRef(J, x, 'Мф'), lineRef(M, x, 'Лк')].filter((r): r is string => !!r);
  if (js > 0 && ms > 0 && jIds[js - 1] !== mIds[ms - 1] && inFrame(start)) out.push({ kind: 'lines', how: 'join', ids: [start], refs: both(start) });
  if (je + 1 < jIds.length && me + 1 < mIds.length && inFrame(end)) {
    const nj = jIds[je + 1];
    const nm = mIds[me + 1];
    out.push({ kind: 'lines', how: 'split', ids: [nj, nm], refs: [lineRef(J, nj, 'Мф'), lineRef(M, nm, 'Лк')].filter((r): r is string => !!r) });
  }
  if (!out.length) out.push({ kind: 'lines', how: 'both', ids: [id], refs: both(id) });
  return out;
}

/** Строки шага по видам: ветви, ленты. */
export function factRows(focus: string, facts: readonly ('branches' | 'lines')[], near: readonly string[] = []): FactRow[] {
  const out: FactRow[] = [];
  for (const f of facts) {
    if (f === 'branches') out.push(...branchRows(focus));
    else out.push(...lineRows(focus, near));
  }
  return out;
}
