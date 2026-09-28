/**
 * Сжатие полос неба (J4, J5; решение владельца 17): какие лица небо рисует и как полосы раскладки ложатся в строки экрана.
 *
 * Раскладка (engine/layout.ts) не пересчитывается. Во время работы строится монотонное непрерывное отображение
 * «полоса → строка» (Rows) и обратное к нему:
 *  — полоса, в которой есть видимое лицо, — строка высотой 1;
 *  — пустая полоса убирается (высота 0): в режиме «В работе» — любая пустая, в режиме «Всё небо» — только та,
 *    что опустела из-за свёртки (свёрнутые потомки, свёрнутое созвездие);
 *  — между родами (разные притоки раскладки) там, где полосы убраны, — зазор ROW_GAP строки;
 *  — свёрнутое созвездие оставляет одну строку-подпись (в самом длинном опустевшем отрезке своих полос).
 * Порядок полос сохраняется, шкала времени прежняя. В режиме «Всё небо» без свёрнутого отображение тождественное:
 * небо не меняется ни на пиксель.
 *
 * Отображением пользуются все: камера неба — RowCamera (cam.sy(полоса) идёт через строку), отрисовка, попадание указателем
 * и перелёт (src/ui/sky/view.ts: rowOf). Вертикаль камеры (laneTop, рамки, «всё небо») — в строках.
 */
import { Camera } from './camera.ts';
import type { Graph } from '../engine/graph.ts';

/** Зазор между родами в сжатом небе, в долях строки. */
export const ROW_GAP = 0.6;
/** Опустевший отрезок не дальше стольких полос от места щелчка — подпись свёрнутого созвездия встаёт в него (UX-51). */
export const FOLD_NEAR = 2;

/** Отображение полос в строки. */
export interface Rows {
  /** тождественное: строка = полоса */
  readonly identity: boolean;
  /** ключ отображения: кэши подписей и лент перестраиваются при его смене */
  readonly key: string;
  /** строка полосы (непрерывно и неубывающе, дробные полосы тоже) */
  row(lane: number): number;
  /** полоса строки: на убранном отрезке — его верхний край */
  lane(row: number): number;
  /** строки от нижнего края нижней полосы данных до верхнего края верхней */
  readonly min: number;
  readonly max: number;
}

/** Тождественное отображение для полос laneMin…laneMax. */
export function identityRows(laneMin: number, laneMax: number): Rows {
  return { identity: true, key: '', row: (l) => l, lane: (r) => r, min: laneMin - 0.5, max: laneMax + 0.5 };
}

/**
 * Отображение по высотам полос: heights[j] — высота полосы laneMin + j в строках (1 — остаётся, 0 — убрана, дробная —
 * зазор или строка-подпись). anchor — полоса, строка которой равна ей самой (сжатое небо не «уезжает» от коридора).
 * Вне полос данных отображение продолжается с наклоном 1.
 */
export function rowsFromHeights(laneMin: number, heights: ArrayLike<number>, key: string, anchor = 0): Rows {
  const n = heights.length;
  const h = Float64Array.from(heights);
  const R = new Float64Array(n + 1);
  for (let j = 0; j < n; j++) R[j + 1] = R[j] + Math.max(0, h[j]);
  const b0 = laneMin - 0.5;
  const raw = (x: number) => {
    const u = x - b0;
    if (u <= 0) return R[0] + u;
    if (u >= n) return R[n] + (u - n);
    const j = Math.floor(u);
    return R[j] + h[j] * (u - j);
  };
  const off = anchor - raw(anchor);
  const row = (x: number) => raw(x) + off;
  const lane = (r: number) => {
    const q = r - off;
    if (q <= R[0]) return b0 + (q - R[0]);
    if (q >= R[n]) return b0 + n + (q - R[n]);
    // наибольшая j с R[j] ≤ q < R[j + 1] (на убранных полосах R не растёт — они пропускаются)
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (R[mid] <= q) lo = mid;
      else hi = mid - 1;
    }
    let j = lo;
    while (j > 0 && h[j] <= 0) j--;
    return h[j] > 0 ? b0 + j + (q - R[j]) / h[j] : b0 + j;
  };
  return { identity: false, key, row, lane, min: R[0] + off, max: R[n] + off };
}

/** Что показывает небо: режим, рабочий набор и свёрнутое (src/ui/work.ts). */
export interface SkyView {
  mode: 'all' | 'work';
  /** лица рабочего набора (в режиме «В работе» небо рисует только их) */
  set: ReadonlySet<string>;
  /** лица, у которых свёрнуты потомки */
  foldDesc: readonly string[];
  /** свёрнутые созвездия */
  foldGroups: readonly string[];
  /**
   * Где читатель свернул созвездие (UX-51): созвездие → полоса раскладки, у которой щёлкнули по его названию. Строка-подпись
   * «+N» встаёт в опустевший отрезок полос, ближайший к ней, а не в самый длинный: место работы не теряется.
   */
  foldAt?: ReadonlyMap<string, number>;
}

/** Узел неба в той мере, в какой он нужен плану. */
export interface PlanNode {
  person: string;
  lane: number;
  block: number;
  ghost: boolean;
  spine: boolean;
  satelliteOf: string | null;
}

/** Знак свёрнутого на небе: «+N» справа от следа лица или строка-подпись созвездия. */
export interface FoldMark {
  kind: 'desc' | 'group';
  /** лицо (потомки) или созвездие */
  id: string;
  /** скрытых лиц */
  count: number;
  /** у созвездия — полоса строки-подписи, годы его начала и последнего рождения (знак — в окнах, куда они приходятся) */
  lane?: number;
  t0?: number;
  t1?: number;
}

/** План неба: какие узлы скрыты, отображение полос и знаки свёрнутого. */
export interface SkyPlan {
  /** 1 — узел не рисуется и не ловит указатель; null — скрытых нет */
  hidden: Uint8Array | null;
  /** лица, все узлы которых скрыты */
  hiddenPersons: ReadonlySet<string>;
  rows: Rows;
  marks: FoldMark[];
  mode: 'all' | 'work';
}

/**
 * Потомки (dir = 'down') или предки ('up') лица по графу: отцы и матери, дети. gen — число поколений (null — все);
 * interp — со связями по толкованию (иначе утверждения с уровнем «толкование» пропускаются); other — с иными
 * утверждениями о родителях (по Луке, по закону, левиратный брак, «предок»), не только с основными отцом и матерью.
 * Возвращает лица без самого id, с числом поколений (в ширину: самое короткое).
 */
export function walk(g: Graph, id: string, dir: 'up' | 'down', gen: number | null, o: { interp?: boolean; other?: boolean } = {}): Map<string, number> {
  const out = new Map<string, number>();
  let front = [id];
  for (let k = 1; front.length && (gen === null || k <= gen); k++) {
    const next: string[] = [];
    for (const x of front) {
      const edges = dir === 'up' ? g.parentsOf.get(x) : g.childrenOf.get(x);
      for (const e of edges ?? []) {
        if (!o.interp && e.cert === 'interpretation') continue;
        if (!o.other && e.kind !== 'father' && e.kind !== 'mother') continue;
        const y = dir === 'up' ? e.parent : e.child;
        if (y === id || out.has(y)) continue;
        out.set(y, k);
        next.push(y);
      }
    }
    front = next;
  }
  return out;
}

/**
 * Созвездие узла — как у контуров раскладки (engine/layout.ts, regionGroup): лица коридора, скоплений и призраки —
 * вне созвездий, жена-спутница — в созвездии мужа. Призрак жены лежит в своём роду — его созвездие по самой жене.
 */
export function nodeGroup(n: PlanNode, groupOf: (id: string) => string | undefined, cluster: (block: number) => boolean): string | null {
  if (n.spine) return null;
  if (n.ghost) return groupOf(n.person) ?? null;
  if (n.block >= 0 && cluster(n.block)) return null;
  if (n.satelliteOf) return groupOf(n.satelliteOf) ?? null;
  return groupOf(n.person) ?? null;
}

/** Данные атласа, которые нужны плану (передаются явно: план проверяется тестами без неба). */
export interface PlanData {
  graph: Graph;
  nodes: readonly PlanNode[];
  laneMin: number;
  laneMax: number;
  /** годы начала узлов (для места строки-подписи созвездия) */
  t0: (i: number) => number;
  groupOf: (id: string) => string | undefined;
  /** созвездие-родитель (дом → колено) */
  parentGroup: (g: string) => string | undefined;
  cluster: (block: number) => boolean;
  /** яркость лица узла: меньше — ярче (величина звезды); по ней выбирается место подписи свёрнутого созвездия */
  rank?: (i: number) => number;
}

/** Созвездие g или вложенное в него (дом внутри колена). */
function within(g: string | null, top: string, parentGroup: (g: string) => string | undefined): boolean {
  for (let x: string | undefined = g ?? undefined, k = 0; x && k < 8; x = parentGroup(x), k++) if (x === top) return true;
  return false;
}

/**
 * План неба по режиму, набору и свёрнутому. Свёрнутые потомки — все потомки лица по отцам и матерям и по иным
 * утверждениям текста о родителях (без толкований; как «с потомками» рабочего набора), кроме лиц линий Мессии (хребет
 * неба и ленты остаются); вместе с ними — жёны-спутницы скрытых мужей. Свёрнутое созвездие — его лица
 * и лица вложенных в него домов, кроме лиц линий Мессии и скоплений. В режиме «В работе» видны только лица набора
 * (без призраков).
 */
export function planSky(d: PlanData, v: SkyView): SkyPlan {
  const { nodes, laneMin, laneMax } = d;
  const N = nodes.length;
  const work = v.mode === 'work';
  if (!work && !v.foldDesc.length && !v.foldGroups.length)
    return { hidden: null, hiddenPersons: new Set(), rows: identityRows(laneMin, laneMax), marks: [], mode: 'all' };

  const hidden = new Uint8Array(N);
  const marks: FoldMark[] = [];
  // свёрнутые потомки
  const byDesc = new Map<string, Set<string>>();
  for (const root of v.foldDesc) {
    const ds = new Set(walk(d.graph, root, 'down', null, { other: true }).keys());
    byDesc.set(root, ds);
  }
  const folded = new Uint8Array(N);
  const groupsOf = new Map<string, number[]>();
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    if (n.spine) continue;
    for (const ds of byDesc.values()) if (ds.has(n.person) || (!!n.satelliteOf && ds.has(n.satelliteOf))) folded[i] = 1;
    if (v.foldGroups.length) {
      const g = nodeGroup(n, d.groupOf, d.cluster);
      for (const top of v.foldGroups)
        if (within(g, top, d.parentGroup)) {
          folded[i] = 1;
          const a = groupsOf.get(top);
          if (a) a.push(i);
          else groupsOf.set(top, [i]);
        }
    }
  }
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    hidden[i] = folded[i] || (work && (n.ghost || !v.set.has(n.person))) ? 1 : 0;
  }
  // сколько лиц скрыто каждой свёрткой (в режиме «В работе» — из набора)
  const counts = (ids: Iterable<number>) => {
    const ps = new Set<string>();
    for (const i of ids) {
      const n = nodes[i];
      if (n.ghost) continue;
      if (work && !v.set.has(n.person)) continue;
      ps.add(n.person);
    }
    return ps.size;
  };
  for (const [root, ds] of byDesc) {
    const idx: number[] = [];
    for (let i = 0; i < N; i++) if (folded[i] && (ds.has(nodes[i].person) || (!!nodes[i].satelliteOf && ds.has(nodes[i].satelliteOf!)))) idx.push(i);
    const count = counts(idx);
    if (count) marks.push({ kind: 'desc', id: root, count });
  }

  // полосы: занятые, видимые, род видимого узла
  const L = laneMax - laneMin + 1;
  const occupied = new Uint8Array(L);
  const shown = new Uint8Array(L);
  const block = new Int32Array(L).fill(-2);
  for (let i = 0; i < N; i++) {
    const j = nodes[i].lane - laneMin;
    if (j < 0 || j >= L) continue;
    occupied[j] = 1;
    if (!hidden[i]) {
      shown[j] = 1;
      if (block[j] === -2) block[j] = nodes[i].block;
    }
  }
  const h = new Float64Array(L);
  for (let j = 0; j < L; j++) h[j] = shown[j] || (!work && !occupied[j]) ? 1 : 0;
  // строки-подписи свёрнутых созвездий: самый длинный опустевший отрезок полос созвездия
  const labelAt = new Set<number>();
  for (const top of v.foldGroups) {
    const idx = groupsOf.get(top) ?? [];
    const count = counts(idx);
    if (!count) continue;
    let lo = Infinity;
    let hi = -Infinity;
    let t0 = Infinity;
    let t1 = -Infinity;
    for (const i of idx) {
      lo = Math.min(lo, nodes[i].lane);
      hi = Math.max(hi, nodes[i].lane);
      t0 = Math.min(t0, d.t0(i));
      t1 = Math.max(t1, d.t0(i));
    }
    // глава созвездия: самое яркое лицо (при равенстве — раньше родившееся); подпись встаёт на его место
    let head = -1;
    for (const i of idx) {
      if (nodes[i].ghost) continue;
      const r = d.rank?.(i) ?? 0;
      if (head < 0 || r < (d.rank?.(head) ?? 0) || (r === (d.rank?.(head) ?? 0) && d.t0(i) < d.t0(head))) head = i;
    }
    // отрезок для подписи: ближайший к месту щелчка (UX-51), иначе самый длинный
    const pref = v.foldAt?.get(top);
    const away = (r: [number, number]) => (pref === undefined ? 0 : pref < r[0] ? r[0] - pref : pref > r[1] ? pref - r[1] : 0);
    let best: [number, number] | null = null;
    for (let l = lo; l <= hi; l++) {
      if (h[l - laneMin] !== 0 || labelAt.has(l)) continue;
      let e = l;
      while (e + 1 <= hi && h[e + 1 - laneMin] === 0 && !labelAt.has(e + 1)) e++;
      const run: [number, number] = [l, e];
      if (!best || away(run) < away(best) || (away(run) === away(best) && e - l > best[1] - best[0])) best = run;
      l = e;
    }
    // опустевших полос у места щелчка нет (их делят лица других родов): подпись — на самой полосе щелчка, а не за сотню
    // строк от места работы (UX-51)
    if (best && pref !== undefined && away(best) > FOLD_NEAR) best = null;
    let lane: number;
    if (best) {
      const len = best[1] - best[0] + 1;
      for (let l = best[0]; l <= best[1]; l++) {
        h[l - laneMin] = 1 / len;
        labelAt.add(l);
      }
      // подпись — у места щелчка, если оно в этом отрезке; иначе посередине отрезка
      lane = pref !== undefined && pref >= best[0] - 0.5 && pref <= best[1] + 0.5 ? pref : (best[0] + best[1]) / 2;
    } else if (pref !== undefined) lane = pref;
    else if (head >= 0) {
      // ни одна полоса не опустела (их делят лица других эпох): подпись — на месте главы созвездия
      lane = nodes[head].lane;
      t0 = d.t0(head);
    } else lane = Math.round((lo + hi) / 2);
    marks.push({ kind: 'group', id: top, count, lane, t0, t1: Math.max(t0, t1) });
  }
  // зазоры между родами там, где полосы убраны
  let prev = -1;
  for (let j = 0; j < L; j++) {
    if (h[j] === 0) continue;
    if (prev >= 0 && j - prev > 1 && shown[j] && shown[prev] && block[j] !== block[prev]) {
      const k = j - prev - 1;
      for (let q = prev + 1; q < j; q++) h[q] = ROW_GAP / k;
    }
    prev = j;
  }
  let same = true;
  for (let j = 0; j < L && same; j++) if (h[j] !== 1) same = false;
  const key = `${v.mode}|${v.foldDesc.join(',')}|${v.foldGroups.join(',')}|${work ? v.set.size : 0}|${hash(h)}`;
  const rows = same ? identityRows(laneMin, laneMax) : rowsFromHeights(laneMin, h, key, anchorLane(h, laneMin));
  const hiddenPersons = new Set<string>();
  const seen = new Map<string, boolean>();
  for (let i = 0; i < N; i++) {
    const p = nodes[i].person;
    seen.set(p, (seen.get(p) ?? true) && !!hidden[i]);
  }
  for (const [p, all] of seen) if (all) hiddenPersons.add(p);
  return { hidden, hiddenPersons, rows, marks, mode: v.mode };
}

/** Полоса-якорь сжатого неба: 0 (ось коридора), если она осталась, иначе ближайшая оставшаяся. */
function anchorLane(h: Float64Array, laneMin: number): number {
  const z = -laneMin;
  for (let d = 0; d < h.length; d++) {
    if (z - d >= 0 && z - d < h.length && h[z - d] >= 1) return z - d + laneMin;
    if (z + d >= 0 && z + d < h.length && h[z + d] >= 1) return z + d + laneMin;
  }
  return 0;
}

function hash(h: Float64Array): string {
  let x = 2166136261;
  for (let j = 0; j < h.length; j++) {
    x ^= Math.round(h[j] * 1000);
    x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(36);
}

/**
 * Камера неба со сжатием полос: вертикаль камеры — строки, cam.sy(полоса) проводит полосу через отображение rows.
 * Всё, что рисует и ловит указатель по cam.sy(n.lane), получает сжатие без правок; тождественное отображение —
 * прежняя камера.
 */
export class RowCamera extends Camera {
  rows: Rows = identityRows(-1, 1);
  sy(lane: number): number {
    const r = this.rows;
    return super.sy(r.identity ? lane : r.row(lane));
  }
}
