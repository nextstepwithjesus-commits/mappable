/**
 * Сжатие полос неба (J4, J5; решение владельца 17): какие лица небо рисует и как полосы раскладки ложатся в строки экрана.
 *
 * Раскладка (engine/layout.ts) не пересчитывается. Во время работы строится монотонное непрерывное отображение
 * «полоса → строка» (Rows) и обратное к нему:
 *  — полоса, в которой есть видимое лицо, — строка высотой 1;
 *  — пустая полоса убирается (высота 0): в режиме «В работе» — любая пустая, в режиме «Всё небо» — только та,
 *    что опустела из-за свёртки (свёрнутые потомки, свёрнутое созвездие);
 *  — между родами (разные притоки раскладки) там, где полосы убраны, — зазор ROW_GAP строки (в небе «набор» с союзами —
 *    REVEAL_GAP);
 *  — свёрнутое созвездие оставляет одну строку-подпись (в самом длинном опустевшем отрезке своих полос).
 * Порядок полос сохраняется, шкала времени прежняя. В режиме «Всё небо» без свёрнутого отображение тождественное:
 * небо не меняется ни на пиксель.
 *
 * Отображением пользуются все: камера неба — RowCamera (cam.sy(полоса) идёт через строку), отрисовка, попадание указателем
 * и перелёт (src/ui/sky/view.ts: rowOf). Вертикаль камеры (laneTop, рамки, «всё небо») — в строках.
 */
import { Camera } from './camera.ts';
import type { Graph } from '../engine/graph.ts';
import type { LinkKey } from '../engine/linkkey.ts';
import type { FamilyUnit } from '../engine/family.ts';

/** Зазор между родами в сжатом небе, в долях строки. */
export const ROW_GAP = 0.6;
/**
 * Зазор между родами в небе «набор» с союзами (решение 76): семью связывают точки союзов и линии к детям, и у большой
 * семьи (двенадцать сыновей Иакова — двенадцать колен, у каждого свой род) прежний зазор растягивал её по высоте, а линии
 * от точек к детям становились круче. Зазор остаётся, но меньше.
 */
export const REVEAL_GAP = 0.3;
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
  return rowsFromSegments(laneMin - 0.5, 1, heights, key, anchor);
}

/**
 * То же по половинам полос (решения 70, 76: место под точки союзов): halves[2j] — высота нижней половины полосы
 * laneMin + j (от её нижнего края до середины, где стоят звёзды), halves[2j + 1] — верхней. Так место под точку союза
 * встаёт между полосой родителя и полосой детей, даже если это соседние полосы: звезда остаётся на середине своей
 * полосы, а место прибавляется только с одной её стороны.
 */
export function rowsFromHalves(laneMin: number, halves: ArrayLike<number>, key: string, anchor = 0): Rows {
  return rowsFromSegments(laneMin - 0.5, 0.5, halves, key, anchor);
}

/** Кусочно-линейное отображение: отрезки полос шириной seg от b0, у каждого своя высота в строках. */
function rowsFromSegments(b0: number, seg: number, heights: ArrayLike<number>, key: string, anchor: number): Rows {
  const n = heights.length;
  const h = Float64Array.from(heights);
  const R = new Float64Array(n + 1);
  for (let j = 0; j < n; j++) R[j + 1] = R[j] + Math.max(0, h[j]);
  const span = n * seg;
  const raw = (x: number) => {
    const u = x - b0;
    if (u <= 0) return R[0] + u;
    if (u >= span) return R[n] + (u - span);
    const j = Math.min(n - 1, Math.floor(u / seg));
    return R[j] + (h[j] * (u - j * seg)) / seg;
  };
  const off = anchor - raw(anchor);
  const row = (x: number) => raw(x) + off;
  const lane = (r: number) => {
    const q = r - off;
    if (q <= R[0]) return b0 + (q - R[0]);
    if (q >= R[n]) return b0 + span + (q - R[n]);
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
    return h[j] > 0 ? b0 + (j + (q - R[j]) / h[j]) * seg : b0 + j * seg;
  };
  return { identity: false, key, row, lane, min: R[0] + off, max: R[n] + off };
}

/**
 * Обрывок наружу (этап 11, § 7; src/engine/lineage.ts, Stub): связь лица показа from с лицом вне показа to. Небо рисует
 * пунктир от звезды или ромба from с подписью в две строки: words — «Ревекка, дочь Вафуила», where — «жена Исаака;
 * в «Патриархах»». key — связь (src/engine/linkkey.ts): щелчок по обрывку выбирает её.
 */
export interface PlanStub {
  from: string;
  to: string;
  key: LinkKey;
  words: string;
  where: string;
}

/**
 * Показ для плана неба (этап 11, § 4–5; src/ui/show.ts, skyShow): что показано и как уложено. Его передаёт небу
 * SkyView вместе с остальным видом (SkyView.show); план (planSky) переводит его в поля SkyPlan.
 */
export interface ShowIn {
  /** ключ показа: небо перестраивается, только если он изменился */
  key: string;
  /** 'map' — строки общей раскладки со свёрткой прочего; 'family' — семейная укладка «Г» (src/engine/family.ts) */
  layout: 'map' | 'family';
  /** лица показа; null — всё небо */
  ids: ReadonlySet<string> | null;
  /** гости — лица вне показа, нужные для союзов (жёны, матери): небо рисует их на 45 % */
  guests: ReadonlySet<string>;
  stubs: readonly PlanStub[];
  /** 'family': виртуальная полоса каждого лица показа и гостя (больше — выше на экране, как полосы раскладки) */
  lanes: ReadonlyMap<string, number> | null;
  /** лицо-опора перехода (§ 10): при смене показа — лицо в фокусе, при раскрытии — лицо, от которого раскрыли */
  anchor: string | null;
  /**
   * 'family': единицы союзов укладки по родителю (src/engine/family.ts, FamilyUnit): союз, мать, дети по году, сторона
   * от строки родителя и год ствола (у внешней единицы — до рождений детей внутренних: ступенька «лестницы союзов»).
   */
  units?: ReadonlyMap<string, readonly FamilyUnit[]> | null;
}

/** Что показывает небо: режим, рабочий набор и свёрнутое (src/ui/work.ts). */
export interface SkyView {
  /**
   * Показ (этап 11; src/ui/show.ts, skyShow). Если он задан, план строится по нему, а mode и set не читаются
   * (они остаются для прежнего вызова без показа).
   */
  show?: ShowIn | null;
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
  /**
   * Место под точки союзов в небе «набор» (решения 70, 76; src/render/plates.ts, plateGaps): у полосы lane со стороны
   * dir (1 — к полосам выше, к верху экрана; −1 — ниже) прибавляется PLATE_ROWS строки — там, где точка стоит у строки
   * одного лица. Точке между строками двух супругов место не нужно.
   */
  gaps?: readonly PlateGap[];
  /** в небе «набор» показаны союзы (точки и линии): зазор между родами — REVEAL_GAP, а не ROW_GAP */
  reveal?: boolean;
}

/** Место под точку союза у полосы лица: сторона dir — 1 (выше, к верху экрана) или −1 (ниже). */
export interface PlateGap {
  lane: number;
  dir: 1 | -1;
}

/**
 * Сколько строк прибавляется под точку союза у строки одного лица (решение 76): полстроки — ромб 9 px стоит между
 * строкой лица и соседней, не задевая их подписей (прежнему прямоугольному знаку союза нужно было полторы).
 */
export const PLATE_ROWS = 0.5;

/** Ключ мест под точки союзов: небо перестраивается, только если они изменились. */
export const gapsKey = (gaps: readonly PlateGap[] | undefined) => (gaps ?? []).map((g) => `${g.lane}${g.dir > 0 ? '+' : '-'}`).sort().join(',');

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
  // Поля этапа 11 (§ 13, стык 2). planSky заполняет их всегда; необязательны они только для начального плана неба,
  // который Sky создаёт до первого planSky (src/render/sky.ts): там их нет — значит, прежняя карта.
  /**
   * Укладка (этап 11, § 4): 'map' — полосы общей раскладки через rows (всё небо, «все колена», ключевые лица);
   * 'family' — семейная укладка «Г»: у каждого узла показа своя виртуальная полоса nodeLane, rows по ним тождественные.
   */
  layout?: 'map' | 'family';
  /**
   * 'family': виртуальная полоса узла по его индексу (больше — выше на экране); NaN — узел не в показе (он же скрыт
   * в hidden). Небо рисует копии узлов с lane = nodeLane[i]. 'map' — null.
   */
  nodeLane?: Float64Array | null;
  /** гости показа (§ 7): лица вне показа, нужные для союзов; небо рисует их на 45 % */
  guests?: ReadonlySet<string>;
  /** обрывки наружу (§ 7) */
  stubs?: readonly PlanStub[];
  /** лицо-опора перехода (§ 10); null — середина экрана */
  anchor?: string | null;
  /** 'family': единицы союзов укладки по родителю (ShowIn.units); 'map' — null */
  units?: ReadonlyMap<string, readonly FamilyUnit[]> | null;
}

/** Поля плана без показа: прежняя карта. */
const MAP_FIELDS = { layout: 'map' as const, nodeLane: null, guests: new Set<string>() as ReadonlySet<string>, stubs: [] as readonly PlanStub[], anchor: null };

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
export function planSky(d: PlanData, v: SkyView): FullPlan {
  const s = v.show;
  if (!s) return { ...planMap(d, v), ...MAP_FIELDS };
  const extra = { guests: s.guests, stubs: s.stubs, anchor: s.anchor };
  if (s.layout === 'family' && s.lanes) return { ...planFamily(d, v, s.lanes, s.key), ...extra, units: s.units ?? null };
  // карта: всё небо или лица показа и гости на полосах общей раскладки (пустые полосы убраны, как в прежнем «наборе»)
  const set = s.ids ? new Set([...s.ids, ...s.guests]) : v.set;
  return { ...planMap(d, { ...v, mode: s.ids ? 'work' : 'all', set }), layout: 'map', nodeLane: null, ...extra };
}

/** План без показа или по показу на карте: прежняя раскладка, скрытые узлы и сжатие полос. */
type MapPlan = Omit<SkyPlan, 'layout' | 'nodeLane' | 'guests' | 'stubs' | 'anchor'>;
/** План, который строит planSky: поля этапа 11 заполнены. */
export type FullPlan = Required<Pick<SkyPlan, 'layout' | 'nodeLane' | 'guests' | 'stubs' | 'anchor'>> & SkyPlan;

function planMap(d: PlanData, v: SkyView): MapPlan {
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
  const gap = work && v.reveal ? REVEAL_GAP : ROW_GAP;
  let prev = -1;
  for (let j = 0; j < L; j++) {
    if (h[j] === 0) continue;
    if (prev >= 0 && j - prev > 1 && shown[j] && shown[prev] && block[j] !== block[prev]) {
      const k = j - prev - 1;
      for (let q = prev + 1; q < j; q++) h[q] = gap / k;
    }
    prev = j;
  }
  let same = true;
  for (let j = 0; j < L && same; j++) if (h[j] !== 1) same = false;
  // место под точки союзов (решения 70, 76): только в небе «набор», у полос видимых лиц — половины полос
  const gaps = work ? (v.gaps ?? []).filter((g) => g.lane >= laneMin && g.lane <= laneMax && h[g.lane - laneMin] > 0) : [];
  let rows: Rows;
  if (gaps.length) {
    const halves = new Float64Array(2 * L);
    for (let j = 0; j < L; j++) halves[2 * j] = halves[2 * j + 1] = h[j] / 2;
    const seen = new Set<string>();
    for (const g of gaps) {
      const k = `${g.lane}${g.dir}`;
      if (seen.has(k)) continue;
      seen.add(k);
      halves[2 * (g.lane - laneMin) + (g.dir > 0 ? 1 : 0)] += PLATE_ROWS;
    }
    const key = `${v.mode}|${v.foldDesc.join(',')}|${v.foldGroups.join(',')}|${v.set.size}|${hash(halves)}|g`;
    rows = rowsFromHalves(laneMin, halves, key, anchorLane(h, laneMin));
  } else {
    const key = `${v.mode}|${v.foldDesc.join(',')}|${v.foldGroups.join(',')}|${work ? v.set.size : 0}|${hash(h)}`;
    rows = same ? identityRows(laneMin, laneMax) : rowsFromHeights(laneMin, h, key, anchorLane(h, laneMin));
  }
  const hiddenPersons = new Set<string>();
  const seen = new Map<string, boolean>();
  for (let i = 0; i < N; i++) {
    const p = nodes[i].person;
    seen.set(p, (seen.get(p) ?? true) && !!hidden[i]);
  }
  for (const [p, all] of seen) if (all) hiddenPersons.add(p);
  return { hidden, hiddenPersons, rows, marks, mode: v.mode };
}

/**
 * План семейной укладки «Г» (этап 11, § 4.2): лица показа и гости стоят на своих виртуальных полосах lanes (их считает
 * src/engine/family.ts), остальные узлы и призраки скрыты. Строки тождественные по виртуальным полосам; ключ строк —
 * по показу, чтобы кэши подписей и лент перестраивались при смене укладки. Свёрнутые потомки (J5) в укладку не входят
 * (src/ui/show.ts), здесь — только их счёт для «+N».
 */
function planFamily(d: PlanData, v: SkyView, lanes: ReadonlyMap<string, number>, key: string): MapPlan & { layout: 'family'; nodeLane: Float64Array } {
  const { nodes } = d;
  const N = nodes.length;
  const hidden = new Uint8Array(N);
  const nodeLane = new Float64Array(N).fill(NaN);
  let lo = Infinity;
  let hi = -Infinity;
  const all = new Map<string, boolean>();
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    const l = n.ghost ? undefined : lanes.get(n.person);
    if (l === undefined || !Number.isFinite(l)) hidden[i] = 1;
    else {
      nodeLane[i] = l;
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
    all.set(n.person, (all.get(n.person) ?? true) && !!hidden[i]);
  }
  const hiddenPersons = new Set<string>();
  for (const [p, h] of all) if (h) hiddenPersons.add(p);
  const marks: FoldMark[] = [];
  for (const root of v.foldDesc) {
    if (!lanes.has(root)) continue;
    let count = 0;
    for (const x of walk(d.graph, root, 'down', null, { other: true }).keys()) if (!lanes.has(x) && all.has(x)) count++;
    if (count) marks.push({ kind: 'desc', id: root, count });
  }
  if (!(lo <= hi)) lo = hi = 0;
  const rows: Rows = { ...identityRows(lo, hi), key: `f|${key}` };
  return { hidden, hiddenPersons, rows, marks, mode: 'work', layout: 'family', nodeLane };
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
