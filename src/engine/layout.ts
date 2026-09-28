/**
 * Раскладка неба (ТЗ § 8.3).
 *
 * Горизонталь — время (астрономические годы; перевод в экранные единицы делает масштаб времени).
 * Вертикаль — полосы (целые числа). Полоса 0 — ось коридора линий Мессии; вверх (+) — сторона Иосифа, вниз (−) — сторона Марии.
 *
 * 1. Коридор: лица обеих линий получают полосы −K…K лучевым поиском в порядке рождения.
 * 2. Остальные лица собираются в «притоки»: поддеревья, прикреплённые к лицу коридора, и отдельные рода без связи с коридором.
 * 3. Внутри притока — аккуратное дерево по времени: дети складываются наружу в обратном порядке рождения
 *    (младший ближе к родителю), каждое поддерево придвигается по контуру занятости до касания.
 *    Отвод к ребёнку пересекает только полосы младших, которые в год его рождения ещё пусты.
 * 4. Притоки ставятся в обратном хронологическом порядке прикрепления, каждый — как можно ближе к коридору,
 *    на ту сторону, где ближе. Поэтому отводы из коридора тоже не пересекают чужих следов.
 * 5. Жена, у которой есть дети от мужа из данных, стоит рядом с мужем; в родной семье остаётся её «призрак».
 *    Приток без родителей, в котором кто-то назван родственником лица коридора словом Писания (kin: «сестра Давида»,
 *    «родственница Марии»), ставится рядом с этим лицом, как прикреплённый, но без отвода (BlockInfo.near; П-8, E5).
 * 6. Списки имён без родства (data/lists.json: храбрые Давида, череды священников, списки возвращения) — не притоки,
 *    а скопления (E2; решение владельца 3): блок из 1–4 строк имён и строки подписи, без следов жизни и без выдуманных дат.
 *    Имена стоят сеткой по столбцам в порядке текста; отец, названный только по сыну («Ира, сын Икеша»), — над сыном.
 *    Ширина сетки — шаг CLUSTER_PITCH лет на столбец, середина — время списка по данным (царствование или служение лица,
 *    «во дни» которого список составлен).
 * 7. Конец рисуемого следа (t1) — честный (A14; ТЗ § 3.1): год смерти, если он следует из данных; если смерть известна
 *    только допустимым интервалом — начало интервала или последнее событие; иначе последнее засвидетельствованное
 *    событие; иначе след не рисуется (t1 = t0). У народов и родов, у умерших младенцами,
 *    у «призраков» жён и у лиц скоплений следа нет. Место в полосе при этом занимается как прежде (с запасом STUB лет
 *    под имя), поэтому честный след не сдвигает раскладку.
 *
 * Здесь же — контуры созвездий (computeOutlines, E8) и атласные координаты (atlasCoord, E9).
 */
import type { Graph } from './graph.ts';
import { fatherOf, motherOf, primaryChildren } from './graph.ts';
import type { ChronoResult } from './chronology.ts';
import type { Person } from '../data/types.ts';
import { compareRefs, parseRef, verseId } from './books.ts';
import { toAstro, toHist } from './years.ts';

export interface LineStep {
  id: string;
  refs: string[];
  flag: string;
  mt?: number;
  lk?: number;
  mtGroup?: number;
}

/**
 * Какой след рисуется у узла (A14; ТЗ § 3.1):
 *  life   — след жизни от t0 до t1 (t1 = t0: ни смерти, ни последнего события в данных — только звезда);
 *  people — народ или род (kind people, clan): без следа, знак «рассеянное скопление»;
 *  infant — умер младенцем: без следа, знак †;
 *  list   — имя в скоплении списка без родства (BlockInfo.cluster): без следа, клетка сетки;
 *  ghost  — «призрак» жены в родной семье: без следа;
 *  epochal — «время не установлено» (ТЗ § 3.1; MAP-52): следа нет, вместо него — скобка через годы засвидетельствованной
 *           деятельности или эпохи (ChronoRow.bLo…bHi; откуда она — PersonChrono.when); знак стоит в её середине (t0).
 *           Скобка «по годам созвездия» (when.by = 'group') — не свидетельство: её не рисуют, только полый знак.
 */
export type TrailKind = 'life' | 'people' | 'infant' | 'list' | 'ghost' | 'epochal';
/** Порядок кодов в atlas.json (узел, 10-е поле); новые коды — только в конец. */
export const TRAIL_KINDS: TrailKind[] = ['life', 'people', 'infant', 'list', 'ghost', 'epochal'];

export interface LayoutNode {
  id: string; // для призрака — `ghost:<id>`
  person: string; // настоящий id лица
  lane: number;
  t0: number; // рождение (астр.); у лица скопления — место клетки сетки, а не год
  t1: number; // конец рисуемого следа (см. п. 7): t1 = t0 — следа нет
  block: number;
  ghost: boolean;
  spine: boolean;
  parentLane: number | null; // полоса, откуда идёт отвод (отец или мать по раскладке)
  layoutParent: string | null; // узел-родитель по раскладке
  satelliteOf: string | null; // для жены рядом с мужем
  trail: TrailKind;
  /**
   * Разрыв следа (MAP-51; решение владельца 24): год, где кончается правдоподобная часть сплошного следа
   * (рождение + предел жизни эпохи; PersonChrono.brk). Дальше до t1 — «//» и пунктир; отвод к ребёнку, родившемуся
   * после brk, — тоже со знаком разрыва. Только у следа life, если brk < t1.
   */
  brk?: number;
}

/** Список имён без родства (data/lists.json). */
export interface ListDef {
  id: string;
  /** заглавие словами отрывка: «Храбрые Давида» */
  name: string;
  /** отрывки списка в синодальных сокращениях данных: «2Цар 23:8-39» */
  refs: string[];
  /** созвездия, из которых берутся лица списка */
  groups: string[];
  /** лицо, во дни которого составлен список: время скопления — его царствование или годы служения */
  during?: string;
}

/**
 * Скопление списка без родства (E2). Все годы — астрономические, полосы — как у узлов.
 * Сетка: rows строк × cols столбцов, заполняется по столбцам сверху вниз в порядке текста; клетка (row, col) стоит в полосе
 * rowLanes[row] на году t0 + (col + 0,5) · pitch (там же — узел лица на небе). Отец, названный в списке только по имени
 * сына («Ира, сын Икеша»), стоит в клетке над сыном того же столбца, и от него к сыну идёт короткий отвод, как в семье.
 * Строка подписи labelLane — над сеткой: скобка «время не установлено» от t0 до t1 и подпись
 * «Храбрые Давида, 2 Цар 23:8–39; 44 имени» (count — лица списка, без отцов, названных только по сыну).
 */
export interface ClusterInfo {
  list: string;
  name: string;
  refs: string[];
  /** лица скопления в порядке клеток (по столбцам) */
  members: string[];
  /** клетки: лицо, строка, столбец; patronym — отец, названный только по сыну */
  cells: { id: string; row: number; col: number; patronym?: boolean }[];
  /** лиц списка (без отцов, названных только по сыну) */
  count: number;
  rows: number;
  cols: number;
  /** ширина столбца сетки, лет */
  pitch: number;
  /** прямоугольник сетки по времени (скобка «время не установлено») */
  t0: number;
  t1: number;
  /** середина — год, к которому список относится по данным (кольцо скопления на обзоре) */
  tc: number;
  /** время списка по данным: царствование или служение лица during, иначе годы служения лиц списка, иначе эпоха */
  span: [number, number];
  /** откуда взято время списка: лицо during, годы служения лиц списка или эпоха */
  spanFrom: { kind: 'during'; id: string } | { kind: 'active' } | { kind: 'epoch'; id: string } | { kind: 'solver' };
  /** полоса подписи и скобки */
  labelLane: number;
  /** полоса каждой строки сетки; строка 0 — верхняя */
  rowLanes: number[];
}

export interface BlockInfo {
  id: number;
  root: string;
  group: string;
  attach: string | null; // лицо коридора, к которому прикреплён приток
  /**
   * Лицо коридора, рядом с которым стоит приток без родителей в данных, потому что Писание называет родство словом
   * («Саруия, сестра Давида», 1 Пар 2:16). Это соседство на карте, а не отвод от родителя (П-8; E5).
   */
  near?: string;
  side: 1 | -1 | 0;
  laneMin: number;
  laneMax: number;
  t0: number;
  t1: number;
  size: number;
  /** блок — скопление списка без родства (E2) */
  cluster?: ClusterInfo;
}

export interface LayoutMetrics {
  persons: number;
  lanes: number;
  corridorWidth: number;
  crossings: number;
  corridorCrossings: number;
  dropLength: number;
  blocks: number;
  /** скоплений и лиц в них */
  clusters: number;
  clustered: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  byPerson: Map<string, LayoutNode>;
  blocks: BlockInfo[];
  laneMin: number;
  laneMax: number;
  metrics: LayoutMetrics;
}

type Iv = [number, number];
const GAP = 3; // лет запаса между следами в одной полосе
const STUB = 30; // место в полосе под имя, если конец жизни не известен (рисуемый след при этом не длиннее данных)
const GHOST_LEN = 25; // = GHOST_SPAN
/** Скопление: наименьшее число лиц; меньшие списки остаются отдельными звёздами. */
export const CLUSTER_MIN = 4;
/** Скопление: ширина столбца сетки, лет. */
export const CLUSTER_PITCH = 4;

// ---------- занятость полос ----------
class Occupancy {
  lanes = new Map<number, Iv[]>();
  add(lane: number, iv: Iv) {
    const a = this.lanes.get(lane);
    if (!a) {
      this.lanes.set(lane, [iv]);
      return;
    }
    let lo = 0;
    let hi = a.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (a[m][0] < iv[0]) lo = m + 1;
      else hi = m;
    }
    a.splice(lo, 0, iv);
  }
  collides(lane: number, iv: Iv): boolean {
    const a = this.lanes.get(lane);
    if (!a) return false;
    // первый интервал, начинающийся после конца iv, — дальше смотреть не нужно
    let lo = 0;
    let hi = a.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (a[m][0] <= iv[1]) lo = m + 1;
      else hi = m;
    }
    for (let i = lo - 1; i >= 0; i--) {
      if (a[i][1] >= iv[0]) return true;
      if (i < lo - 64) break; // интервалы короткие, дальше пересечений не бывает
    }
    return false;
  }
}

/** Контур поддерева: смещение полосы → интервалы. */
type Contour = Map<number, Iv[]>;

function contourCollides(acc: Contour, sub: Contour, shift: number): boolean {
  for (const [lane, ivs] of sub) {
    const target = acc.get(lane + shift);
    if (!target) continue;
    for (const a of ivs) for (const b of target) if (a[0] <= b[1] && b[0] <= a[1]) return true;
  }
  return false;
}

function contourMerge(acc: Contour, sub: Contour, shift: number) {
  for (const [lane, ivs] of sub) {
    const l = lane + shift;
    const t = acc.get(l);
    if (t) t.push(...ivs);
    else acc.set(l, [...ivs]);
  }
}

// ---------- списки без родства (E2) ----------

/** Все ссылки лица, кроме примечаний § 24 (они часто ведут к другим лицам). */
function personRefs(p: Person): string[] {
  const out: string[] = [];
  const add = (r?: string[] | string) => {
    if (!r) return;
    for (const x of Array.isArray(r) ? r : [r]) out.push(x);
  };
  add(p.parentRefs);
  for (const s of p.spouses ?? []) add(s.refs);
  for (const k of p.kin ?? []) add(k.refs);
  for (const o of p.otherParents ?? []) add(o.refs);
  const c = p.card;
  if (c) {
    for (const k of ['status', 'lineage', 'withGod', 'laterMentions'] as const) for (const f of c[k] ?? []) add(f.refs);
    for (const a of c.altNames ?? []) add(a.refs);
    for (const m of c.met ?? []) add(m.refs);
    for (const pl of c.places ?? []) add(pl.refs);
    for (const o of c.offices ?? []) add(o.refs);
    for (const e of c.events ?? []) add(e.refs);
    add(c.scripture?.key);
  }
  add(p.chrono?.active?.refs);
  return out;
}

/** Первое упоминание: § 23 «первое упоминание», иначе самая ранняя по канону ссылка лица. */
export function firstRefOf(p: Person): string | null {
  if (p.card?.scripture?.first) return p.card.scripture.first;
  const refs = personRefs(p);
  if (!refs.length) return null;
  return [...refs].sort(compareRefs)[0];
}

/** Стихи отрывков списка: «Книга глава:стих». */
function listVerses(l: ListDef): Set<string> {
  const out = new Set<string>();
  for (const r of l.refs) for (const v of parseRef(r)?.verses ?? []) out.add(verseId(v));
  return out;
}

/** Звено скопления: лицо списка или отец, названный в списке только по сыновьям, с этими сыновьями. */
export interface ClusterUnit {
  father: string | null;
  persons: string[];
}

/**
 * Лица скоплений (E2; правило — в шапке data/lists.json). Лицо входит в список, если:
 *  — его нет на линиях Мессии;
 *  — у него нет детей и супругов в данных, а родители — только отец, названный в списке по сыну («Ира, сын Икеша»):
 *    у такого отца нет своих родителей, супругов и других детей, кроме лиц того же списка, и значимость 1–2;
 *    связь «из сыновей X» (otherParents) — не родство на небе и не мешает;
 *  — значимость 1–2 (у лиц с собственным повествованием — 3 и выше — есть свой след);
 *  — его первое упоминание — в одном из отрывков списка, а созвездие — одно из созвездий списка.
 * Возвращает звенья каждого списка в порядке текста; списки, где лиц меньше CLUSTER_MIN, не возвращаются.
 */
export function listMembers(g: Graph, lists: ListDef[], spine: Set<string>): Map<string, ClusterUnit[]> {
  const verses = lists.map((l) => ({ l, v: listVerses(l), groups: new Set(l.groups) }));
  const primaryKids = (id: string) => (g.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother');
  // 1. кандидаты: лица списков без детей и супругов (отец пока допускается)
  const cand = new Map<string, { list: string; ref: string }>();
  for (const id of g.order) {
    if (spine.has(id)) continue;
    const p = g.persons.get(id)!;
    if (p.prominence > 2) continue;
    if (motherOf(g, id)) continue;
    if (primaryKids(id).length) continue;
    if ((g.spousesOf.get(id) ?? []).length) continue;
    const first = firstRefOf(p);
    const pr = first ? parseRef(first) : null;
    if (!pr || !pr.verses.length) continue;
    const key = verseId(pr.verses[0]);
    const hit = verses.find((x) => x.groups.has(p.group) && x.v.has(key));
    if (hit) cand.set(id, { list: hit.l.id, ref: first! });
  }
  // 2. отец допускается, только если он назван лишь по сыновьям из того же списка
  const stubFather = (f: string, list: string): boolean => {
    const fp = g.persons.get(f)!;
    if (spine.has(f) || fp.prominence > 2 || fatherOf(g, f) || motherOf(g, f)) return false;
    if ((g.spousesOf.get(f) ?? []).length || cand.has(f)) return false;
    return primaryKids(f).every((e) => cand.get(e.child)?.list === list && fatherOf(g, e.child) === f && !motherOf(g, e.child));
  };
  const units = new Map<string, { unit: ClusterUnit; ref: string }[]>();
  const byFather = new Map<string, { unit: ClusterUnit; ref: string }>();
  for (const [id, c] of cand) {
    const f = fatherOf(g, id);
    if (f && !stubFather(f, c.list)) continue;
    const a = units.get(c.list) ?? [];
    if (f) {
      const u = byFather.get(f);
      if (u) {
        u.unit.persons.push(id);
        continue;
      }
      const nu = { unit: { father: f, persons: [id] }, ref: c.ref };
      byFather.set(f, nu);
      a.push(nu);
    } else a.push({ unit: { father: null, persons: [id] }, ref: c.ref });
    units.set(c.list, a);
  }
  const out = new Map<string, ClusterUnit[]>();
  const order = new Map(g.order.map((x, i) => [x, i]));
  for (const l of lists) {
    const a = units.get(l.id);
    if (!a || a.reduce((s, u) => s + u.unit.persons.length, 0) < CLUSTER_MIN) continue;
    a.sort((x, y) => compareRefs(x.ref, y.ref) || order.get(x.unit.persons[0])! - order.get(y.unit.persons[0])!);
    out.set(l.id, a.map((x) => x.unit));
  }
  return out;
}

/**
 * Клетки сетки: звенья по столбцам сверху вниз; отец и его сыновья — в одном столбце подряд, отец сверху.
 * Строк — по числу клеток (clusterRows), но не меньше самого высокого звена.
 */
export function clusterCells(units: ClusterUnit[]): { rows: number; cols: number; cells: ClusterInfo['cells'] } {
  const height = (u: ClusterUnit) => u.persons.length + (u.father ? 1 : 0);
  const total = units.reduce((s, u) => s + height(u), 0);
  const rows = Math.max(clusterRows(total), ...units.map(height));
  const cells: ClusterInfo['cells'] = [];
  let col = 0;
  let row = 0;
  for (const u of units) {
    if (row + height(u) > rows) {
      col++;
      row = 0;
    }
    if (u.father) cells.push({ id: u.father, row: row++, col, patronym: true });
    for (const id of u.persons) cells.push({ id, row: row++, col });
    if (row >= rows) {
      col++;
      row = 0;
    }
  }
  return { rows, cols: row === 0 ? col : col + 1, cells };
}

/** Строк в сетке скопления: 1–4, чтобы блок занимал мало высоты. */
export function clusterRows(n: number): number {
  return n <= 5 ? 1 : n <= 14 ? 2 : n <= 45 ? 3 : 4;
}

/**
 * Место лица в полосе при раскладке: от рождения до смерти, иначе до последнего события (не короче 8 лет), иначе STUB лет —
 * запас под имя. Рисуемый след короче (п. 7); этим же промежутком меряется насыщенность времени (tools/build-data.ts),
 * чтобы честные следы не меняли масштаб. У лица «время не установлено» (epochal) — вся скобка bLo…bHi и место под имя
 * после знака в её середине (MAP-52).
 */
export function packSpan(c: { b: number; d: number | null; lastAttested: number | null; cls?: string; bLo?: number; bHi?: number; when?: { by: string } }): [number, number] {
  // скобка «по годам созвездия» (when.by = 'group': 1 Пар 4–5, имена без родства и без эпохи) — не свидетельство,
  // а всё время рода, до полутора тысяч лет: её не рисуют, место — только под знак и имя
  if (c.cls === 'epochal' && c.when?.by === 'group') return [c.b, c.b + STUB];
  if (c.cls === 'epochal' && c.bLo !== undefined && c.bHi !== undefined) return [Math.min(c.bLo, c.b), Math.max(c.bHi, c.b + STUB)];
  let end: number;
  if (c.d !== null) end = c.d;
  else if (c.lastAttested !== null) end = Math.max(c.lastAttested, c.b + 8);
  else end = c.b + STUB;
  if (end < c.b + 4) end = c.b + 4;
  return [c.b, end];
}

/** Место «призрака» жены в родной семье. */
export const GHOST_SPAN = 25;

// ---------- основной расчёт ----------
export function computeLayout(
  g: Graph,
  chrono: ChronoResult,
  lines: { joseph: LineStep[]; mary: LineStep[] },
  opts: { corridorK?: number; beam?: number; lists?: ListDef[]; epochs?: { id: string; start: number; end: number }[] } = {},
): LayoutResult {
  const K = opts.corridorK ?? 7;
  const BEAM = opts.beam ?? 64;
  const ch = (id: string) => chrono.persons.get(id)!;

  /** Место в полосе: след и запас под имя (не рисуется); у лица «время не установлено» — скобка. */
  const span = (id: string): Iv => packSpan(ch(id));
  /**
   * Рисуемый след (п. 7): t1 — конец жизни, в которой данные уверены. Смерть только в допустимом интервале
   * (died.range: «в царствование Давида») — сплошной след до начала интервала или до последнего события,
   * дальше неуверенный конец до dHi рисует отрисовка по интервалу смерти (ChronoRow.dLo…dHi).
   */
  const drawn = (id: string): { t1: number; trail: TrailKind; brk?: number } => {
    const d = drawnTrail(id);
    const brk = ch(id).brk;
    return d.trail === 'life' && brk !== undefined && brk < d.t1 ? { ...d, brk } : d;
  };
  const drawnTrail = (id: string): { t1: number; trail: TrailKind } => {
    const c = ch(id);
    const p = g.persons.get(id)!;
    if (p.kind === 'people' || p.kind === 'clan') return { t1: c.b, trail: 'people' };
    if (c.infant) return { t1: c.b, trail: 'infant' };
    if (c.cls === 'epochal') return { t1: c.b, trail: 'epochal' };
    const died = p.chrono?.died;
    const rangeOnly = !!died?.range && died.age === undefined && died.year === undefined;
    if (c.d !== null && !rangeOnly) return { t1: Math.max(c.b, c.d), trail: 'life' };
    if (c.d !== null) return { t1: Math.max(c.b, c.dLo ?? c.b, c.lastAttested ?? -Infinity), trail: 'life' };
    if (c.lastAttested !== null) return { t1: Math.max(c.b, c.lastAttested), trail: 'life' };
    return { t1: c.b, trail: 'life' };
  };
  const padded = (iv: Iv): Iv => [iv[0] - GAP, iv[1] + GAP];

  // --- 1. коридор
  const jIds = lines.joseph.map((s) => s.id).filter((id) => g.persons.has(id));
  const mIds = lines.mary.map((s) => s.id).filter((id) => g.persons.has(id));
  const jSet = new Set(jIds);
  const mSet = new Set(mIds);
  const spine = [...new Set([...jIds, ...mIds])];
  const preds = new Map<string, string[]>();
  const addPred = (seq: string[]) => {
    for (let i = 1; i < seq.length; i++) {
      const a = preds.get(seq[i]) ?? [];
      if (!a.includes(seq[i - 1])) a.push(seq[i - 1]);
      preds.set(seq[i], a);
    }
  };
  addPred(jIds);
  addPred(mIds);
  const spineOrder = [...spine].sort((a, b) => ch(a).b - ch(b).b);
  const idx = new Map(spineOrder.map((id, i) => [id, i]));
  const nL = 2 * K + 1;

  interface State {
    cost: number;
    lanes: Int8Array;
    ends: Float64Array;
  }
  let beam: State[] = [{ cost: 0, lanes: new Int8Array(spineOrder.length), ends: new Float64Array(nL).fill(-Infinity) }];
  for (let i = 0; i < spineOrder.length; i++) {
    const id = spineOrder[i];
    const iv = padded(span(id));
    const inJ = jSet.has(id);
    const inM = mSet.has(id);
    const next: State[] = [];
    for (const st of beam) {
      for (let lane = -K; lane <= K; lane++) {
        if (inJ && !inM && lane < 1) continue;
        if (inM && !inJ && lane > -1) continue;
        const li = lane + K;
        if (st.ends[li] >= iv[0]) continue;
        let cost = st.cost + 0.15 * lane * lane + (inJ && inM ? 0.6 * Math.abs(lane) : 0);
        for (const p of preds.get(id) ?? []) {
          const pi = idx.get(p);
          if (pi === undefined || pi >= i) continue;
          const d = lane - st.lanes[pi];
          cost += d * d;
        }
        const lanes = st.lanes.slice();
        lanes[i] = lane;
        const ends = st.ends.slice();
        ends[li] = iv[1];
        next.push({ cost, lanes, ends });
      }
    }
    if (!next.length) {
      // не хватило полос: расширить нельзя внутри поиска — ставим в наименее занятую
      for (const st of beam) {
        let best = 0;
        for (let li = 0; li < nL; li++) if (st.ends[li] < st.ends[best]) best = li;
        const lanes = st.lanes.slice();
        lanes[i] = best - K;
        const ends = st.ends.slice();
        ends[best] = iv[1];
        next.push({ cost: st.cost + 1000, lanes, ends });
      }
    }
    next.sort((a, b) => a.cost - b.cost);
    beam = next.slice(0, BEAM);
  }
  const corridorLane = new Map<string, number>();
  spineOrder.forEach((id, i) => corridorLane.set(id, beam[0].lanes[i]));

  // --- 2. родитель по раскладке, жёны-спутницы, призраки
  const spineSet = new Set(spine);
  const satelliteOf = new Map<string, string>(); // жена → муж
  for (const id of g.order) {
    if (spineSet.has(id)) continue;
    const p = g.persons.get(id)!;
    if (p.sex !== 'f') continue;
    const spouses = (g.spousesOf.get(id) ?? []).filter((s) => s.b === id).map((s) => s.a);
    if (!spouses.length) continue;
    // муж, от которого есть дети
    let best: string | null = null;
    let bestN = 0;
    for (const h of spouses) {
      const n = (g.childrenOf.get(id) ?? []).filter((e) => fatherOf(g, e.child) === h).length;
      if (n > bestN) { best = h; bestN = n; }
    }
    const natal = fatherOf(g, id) ?? motherOf(g, id);
    if (best && bestN > 0) satelliteOf.set(id, best);
    else if (!natal) satelliteOf.set(id, spouses[0]); // без родной семьи — рядом с мужем
  }
  const layoutParent = new Map<string, string | null>();
  for (const id of g.order) {
    if (spineSet.has(id)) { layoutParent.set(id, null); continue; }
    if (satelliteOf.has(id)) { layoutParent.set(id, satelliteOf.get(id)!); continue; }
    layoutParent.set(id, fatherOf(g, id) ?? motherOf(g, id));
  }
  // защита от циклов (на случай противоречивых данных)
  for (const id of g.order) {
    const seen = new Set<string>([id]);
    let cur = layoutParent.get(id) ?? null;
    while (cur) {
      if (seen.has(cur)) { layoutParent.set(id, null); break; }
      seen.add(cur);
      cur = layoutParent.get(cur) ?? null;
    }
  }
  // призраки: жена-спутница с родной семьёй в данных
  const ghosts: { id: string; person: string; parent: string }[] = [];
  for (const [w] of satelliteOf) {
    const natal = fatherOf(g, w) ?? motherOf(g, w);
    if (natal) ghosts.push({ id: `ghost:${w}`, person: w, parent: natal });
  }

  // списки без родства → скопления (п. 6)
  const clusterUnits = opts.lists?.length ? listMembers(g, opts.lists, spineSet) : new Map<string, ClusterUnit[]>();
  const inCluster = new Map<string, string>();
  for (const [lid, us] of clusterUnits) for (const u of us) for (const id of [...(u.father ? [u.father] : []), ...u.persons]) inCluster.set(id, lid);

  // дети по раскладке: спутницы — первыми, затем дети в обратном порядке рождения
  const kidsOf = new Map<string, string[]>();
  const addKid = (p: string, c: string) => {
    const a = kidsOf.get(p);
    if (a) a.push(c);
    else kidsOf.set(p, [c]);
  };
  for (const id of g.order) {
    const lp = layoutParent.get(id);
    if (lp) addKid(lp, id);
  }
  for (const gh of ghosts) addKid(gh.parent, gh.id);
  const nodeSpan = (nid: string): Iv => {
    if (nid.startsWith('ghost:')) {
      const b = ch(nid.slice(6)).b;
      return [b, b + GHOST_LEN];
    }
    return span(nid);
  };
  // год знака: рождение, у лица «время не установлено» — середина скобки (а не её начало, где начинается место в полосе)
  const birth = (nid: string) => ch(nid.startsWith('ghost:') ? nid.slice(6) : nid).b;
  const isSat = (nid: string) => !nid.startsWith('ghost:') && satelliteOf.has(nid);
  for (const [p, kids] of kidsOf) {
    const order = primaryChildren(g, p);
    kids.sort((a, b) => {
      const sa = isSat(a) ? 0 : 1;
      const sb = isSat(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      if (sa === 0) return birth(a) - birth(b);
      const d = birth(b) - birth(a); // младший — первым (ближе к родителю)
      if (Math.abs(d) > 0.5) return d;
      return order.indexOf(b) - order.indexOf(a);
    });
  }

  // --- 3. аккуратные деревья: относительные смещения
  const relOffset = new Map<string, number>(); // смещение узла относительно родителя по раскладке
  const subtree = (nid: string): Contour => {
    const own: Contour = new Map([[0, [padded(nodeSpan(nid))]]]);
    const kids = spineSet.has(nid) ? [] : (kidsOf.get(nid) ?? []).filter((k) => !spineSet.has(k));
    for (const k of kids) {
      const sub = subtree(k);
      let s = 1;
      while (contourCollides(own, sub, s)) s++;
      relOffset.set(k, s);
      contourMerge(own, sub, s);
    }
    return own;
  };

  // --- 4. коридор в глобальной занятости + огибающая лент
  const occ = new Occupancy();
  for (const id of spine) occ.add(corridorLane.get(id)!, padded(span(id)));
  // ленты идут от рождения к рождению: занимаем промежуточные полосы
  const ribbonSeqs = [jIds, mIds];
  for (const seq of ribbonSeqs) {
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1];
      const b = seq[i];
      const la = corridorLane.get(a)!;
      const lb = corridorLane.get(b)!;
      const ta = ch(a).b;
      const tb = ch(b).b;
      const lo = Math.min(la, lb) - 1;
      const hi = Math.max(la, lb) + 1;
      for (let l = lo; l <= hi; l++) occ.add(l, [Math.min(ta, tb) - GAP, Math.max(ta, tb) + GAP]);
    }
  }

  // --- 5. скопления: время и сетка
  interface ClusterPlan {
    list: ListDef; cells: ClusterInfo['cells']; count: number; rows: number; cols: number; t0: number; t1: number; tc: number;
    span: [number, number]; spanFrom: ClusterInfo['spanFrom']; group: string;
  }
  const plans = new Map<string, ClusterPlan>();
  for (const l of opts.lists ?? []) {
    const units = clusterUnits.get(l.id);
    if (!units) continue;
    const listed = units.flatMap((u) => u.persons);
    const sp = listSpan(g, chrono, l, listed, opts.epochs ?? []);
    const { rows, cols, cells } = clusterCells(units);
    // середина — целый год: при чётном шаге сетки клетки тоже стоят на целых годах (в atlas.json годы целые)
    const tc = Math.round((sp.span[0] + sp.span[1]) / 2);
    const w = cols * CLUSTER_PITCH;
    const groups = new Map<string, number>();
    for (const id of listed) groups.set(g.persons.get(id)!.group, (groups.get(g.persons.get(id)!.group) ?? 0) + 1);
    const group = [...groups].sort((a, b) => b[1] - a[1])[0][0];
    plans.set(l.id, { list: l, cells, count: listed.length, rows, cols, t0: tc - w / 2, t1: tc + w / 2, tc, span: sp.span, spanFrom: sp.from, group });
  }

  // --- 6. притоки и скопления
  interface Pending { root: string | null; cluster: string | null; attach: string | null; near: string | null; t: number }
  const pending: Pending[] = [];
  for (const id of spine) {
    for (const k of kidsOf.get(id) ?? []) if (!spineSet.has(k)) pending.push({ root: k, cluster: null, attach: id, near: null, t: birth(k) });
  }
  /**
   * Лицо коридора, которому кто-то из притока (родоначальник, жена, потомок) — родственник по слову Писания
   * (kin в любую сторону): «Саруия, сестра Давида»; «Елисавета, родственница Марии».
   */
  const kinSpine = (root: string): string | null => {
    const stack = [root];
    while (stack.length) {
      const id = stack.pop()!;
      for (const e of g.kinOf.get(id) ?? []) {
        const o = e.from === id ? e.to : e.from;
        if (spineSet.has(o)) return o;
      }
      for (const k of kidsOf.get(id) ?? []) if (!k.startsWith('ghost:') && !spineSet.has(k)) stack.push(k);
    }
    return null;
  };
  for (const id of g.order) {
    if (spineSet.has(id) || inCluster.has(id)) continue;
    if (!layoutParent.get(id)) pending.push({ root: id, cluster: null, attach: null, near: kinSpine(id), t: birth(id) });
  }
  for (const [lid, pl] of plans) pending.push({ root: null, cluster: lid, attach: null, near: null, t: pl.tc });
  // сначала прикреплённые и стоящие рядом по родству, в обратном хронологическом порядке;
  // затем отдельные рода и скопления — тоже от поздних к ранним
  const loose = (p: Pending) => Number(p.attach === null && p.near === null);
  pending.sort((a, b) => loose(a) - loose(b) || b.t - a.t);

  const nodes: LayoutNode[] = [];
  const byNode = new Map<string, LayoutNode>();
  const blocks: BlockInfo[] = [];
  const groupSide = new Map<string, number>(); // сторона, куда уже ставили этот род
  for (const id of spine) {
    const dr = drawn(id);
    const n: LayoutNode = {
      id, person: id, lane: corridorLane.get(id)!, t0: ch(id).b, t1: dr.t1, block: -1, ghost: false, spine: true,
      parentLane: null, layoutParent: null, satelliteOf: null, trail: dr.trail, ...(dr.brk !== undefined ? { brk: dr.brk } : {}),
    };
    nodes.push(n);
    byNode.set(id, n);
  }

  /** Ближайшее к коридору место для контура: сторона и полоса основания. */
  const findPlace = (contour: Contour, attachLane: number, group: string) => {
    let best: { side: 1 | -1; base: number; score: number } | null = null;
    const sides: (1 | -1)[] = [1, -1];
    for (const side of sides) {
      // на стороне своей ветви коридора начинаем от полосы прикрепления
      let base = side === 1 ? Math.max(attachLane + 1, 1) : Math.min(attachLane - 1, -1);
      for (let guard = 0; guard < 4000; guard++) {
        let ok = true;
        for (const [lane, ivs] of contour) {
          const L = base + side * lane;
          for (const iv of ivs) if (occ.collides(L, iv)) { ok = false; break; }
          if (!ok) break;
        }
        if (ok) break;
        base += side;
      }
      // ближе к месту прикрепления; тот же род — на ту же сторону; при равенстве — сторона Иосифа
      const pref = groupSide.get(group);
      const score = Math.abs(base - attachLane) + (pref !== undefined && pref !== side ? 0.5 : 0) + (side === -1 ? 0.01 : 0);
      if (!best || score < best.score) best = { side, base, score };
    }
    return best!;
  };

  for (const pb of pending) {
    if (pb.cluster) {
      const pl = plans.get(pb.cluster)!;
      // блок: строка подписи и rows строк имён, во всю ширину сетки
      const contour: Contour = new Map();
      for (let k = 0; k <= pl.rows; k++) contour.set(k, [padded([pl.t0, pl.t1])]);
      const { side, base } = findPlace(contour, 0, pl.group);
      groupSide.set(pl.group, side);
      const blockId = blocks.length;
      const lanes = Array.from({ length: pl.rows + 1 }, (_, k) => base + side * k);
      const labelLane = Math.max(...lanes);
      const rowLanes = Array.from({ length: pl.rows }, (_, r) => labelLane - 1 - r);
      for (const L of lanes) occ.add(L, padded([pl.t0, pl.t1]));
      for (const cell of pl.cells) {
        const t = pl.t0 + (cell.col + 0.5) * CLUSTER_PITCH;
        // сын под отцом, названным только по нему: короткий отвод в той же клетке столбца
        const f = cell.patronym ? null : fatherOf(g, cell.id);
        const fn = f ? byNode.get(f) : undefined;
        const n: LayoutNode = {
          id: cell.id, person: cell.id, lane: rowLanes[cell.row], t0: t, t1: t, block: blockId, ghost: false, spine: false,
          parentLane: fn ? fn.lane : null, layoutParent: fn ? f : null, satelliteOf: null, trail: 'list',
        };
        nodes.push(n);
        byNode.set(cell.id, n);
      }
      const members = pl.cells.map((c) => c.id);
      const cluster: ClusterInfo = {
        list: pl.list.id, name: pl.list.name, refs: pl.list.refs, members, cells: pl.cells, count: pl.count,
        rows: pl.rows, cols: pl.cols, pitch: CLUSTER_PITCH, t0: pl.t0, t1: pl.t1, tc: pl.tc, span: pl.span, spanFrom: pl.spanFrom,
        labelLane, rowLanes,
      };
      blocks.push({
        id: blockId, root: members[0], group: pl.group, attach: null, side, laneMin: Math.min(...lanes), laneMax: labelLane,
        t0: pl.t0, t1: pl.t1, size: members.length, cluster,
      });
      continue;
    }
    const root = pb.root!;
    const contour = subtree(root);
    const attachLane = pb.attach ? corridorLane.get(pb.attach)! : pb.near ? corridorLane.get(pb.near)! : 0;
    const group = root.startsWith('ghost:') ? g.persons.get(root.slice(6))!.group : g.persons.get(root)!.group;
    const { side, base } = findPlace(contour, attachLane, group);
    groupSide.set(group, side);
    const blockId = blocks.length;
    let laneMin = Infinity;
    let laneMax = -Infinity;
    let t0 = Infinity;
    let t1 = -Infinity;
    let size = 0;
    // размещение узлов поддерева
    const place = (nid: string, lane: number, parentLane: number | null, lp: string | null) => {
      const iv = nodeSpan(nid);
      const ghost = nid.startsWith('ghost:');
      const person = ghost ? nid.slice(6) : nid;
      const dr = ghost ? { t1: iv[0], trail: 'ghost' as const } : drawn(nid);
      const n: LayoutNode = {
        id: nid, person, lane, t0: ghost ? iv[0] : ch(nid).b, t1: dr.t1, block: blockId, ghost, spine: false,
        parentLane, layoutParent: lp, satelliteOf: !ghost && satelliteOf.has(nid) ? satelliteOf.get(nid)! : null, trail: dr.trail,
        ...('brk' in dr && dr.brk !== undefined ? { brk: dr.brk } : {}),
      };
      nodes.push(n);
      byNode.set(nid, n);
      occ.add(lane, padded(iv));
      laneMin = Math.min(laneMin, lane);
      laneMax = Math.max(laneMax, lane);
      t0 = Math.min(t0, iv[0]);
      t1 = Math.max(t1, iv[1]);
      size++;
      for (const k of (kidsOf.get(nid) ?? []).filter((x) => !spineSet.has(x))) {
        place(k, lane + side * relOffset.get(k)!, lane, nid);
      }
    };
    place(root, base, pb.attach ? attachLane : null, pb.attach);
    blocks.push({ id: blockId, root, group, attach: pb.attach, ...(pb.near ? { near: pb.near } : {}), side, laneMin, laneMax, t0, t1, size });
  }

  // родители коридорных лиц (для отводов внутри коридора)
  for (const id of spine) {
    const n = byNode.get(id)!;
    const f = fatherOf(g, id) ?? motherOf(g, id);
    if (f && byNode.has(f)) { n.parentLane = byNode.get(f)!.lane; n.layoutParent = f; }
  }

  // --- 7. метрики
  // пересечения отводов с рисуемыми следами притоков (коридор пересекается неизбежно и считается отдельно)
  let crossings = 0;
  let corridorCrossings = 0;
  let dropLength = 0;
  const laneNodes = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    const a = laneNodes.get(n.lane);
    if (a) a.push(n);
    else laneNodes.set(n.lane, [n]);
  }
  for (const n of nodes) {
    if (n.parentLane === null || n.satelliteOf) continue;
    const lo = Math.min(n.parentLane, n.lane) + 1;
    const hi = Math.max(n.parentLane, n.lane) - 1;
    dropLength += Math.abs(n.lane - n.parentLane);
    for (let l = lo; l <= hi; l++) {
      for (const o of laneNodes.get(l) ?? []) {
        if (o.t0 < n.t0 && n.t0 < o.t1) {
          if (o.spine) corridorCrossings++;
          else crossings++;
        }
      }
    }
  }
  let laneMin = 0;
  let laneMax = 0;
  for (const n of nodes) {
    laneMin = Math.min(laneMin, n.lane);
    laneMax = Math.max(laneMax, n.lane);
  }
  for (const b of blocks) {
    laneMin = Math.min(laneMin, b.laneMin);
    laneMax = Math.max(laneMax, b.laneMax);
  }
  const corridorWidth = Math.max(...[...corridorLane.values()].map((l) => Math.abs(l)), 0) * 2 + 1;
  const clusters = blocks.filter((b) => b.cluster);
  return {
    nodes,
    byPerson: new Map(nodes.filter((n) => !n.ghost).map((n) => [n.person, n])),
    blocks,
    laneMin,
    laneMax,
    metrics: {
      persons: nodes.filter((n) => !n.ghost).length, lanes: laneMax - laneMin + 1, corridorWidth, crossings, corridorCrossings, dropLength,
      blocks: blocks.length, clusters: clusters.length, clustered: clusters.reduce((s, b) => s + b.size, 0),
    },
  };
}

/**
 * Время списка по данным (астр.): царствование или служение лица during; иначе объединение годов служения лиц списка;
 * иначе эпоха большинства лиц; иначе середина оценок решателя.
 */
function listSpan(
  g: Graph,
  chrono: ChronoResult,
  l: ListDef,
  members: string[],
  epochs: { id: string; start: number; end: number }[],
): { span: [number, number]; from: ClusterInfo['spanFrom'] } {
  const dur = l.during ? g.persons.get(l.during) : undefined;
  if (dur) {
    const reign = dur.chrono?.reign ?? [];
    if (reign.length) return { span: [toAstro(Math.min(...reign.map((r) => r.start))), toAstro(Math.max(...reign.map((r) => r.end)))], from: { kind: 'during', id: dur.id } };
    const a = dur.chrono?.active;
    if (a) return { span: [toAstro(a.from), toAstro(a.to)], from: { kind: 'during', id: dur.id } };
    const c = chrono.persons.get(dur.id);
    if (c) return { span: [c.b + 20, c.d ?? c.lastAttested ?? c.b + 50], from: { kind: 'during', id: dur.id } };
  }
  const act = members.map((id) => g.persons.get(id)!.chrono?.active).filter((a) => !!a);
  if (act.length * 2 >= members.length) {
    return { span: [toAstro(Math.min(...act.map((a) => a!.from))), toAstro(Math.max(...act.map((a) => a!.to)))], from: { kind: 'active' } };
  }
  const eps = new Map<string, number>();
  for (const id of members) {
    const e = g.persons.get(id)!.chrono?.epoch;
    if (e) eps.set(e, (eps.get(e) ?? 0) + 1);
  }
  const top = [...eps].sort((a, b) => b[1] - a[1])[0];
  const ep = top && epochs.find((e) => e.id === top[0]);
  if (ep) return { span: [toAstro(ep.start), toAstro(ep.end)], from: { kind: 'epoch', id: ep.id } };
  const bs = members.map((id) => chrono.persons.get(id)!.b).sort((a, b) => a - b);
  const m = bs[bs.length >> 1];
  return { span: [m, m + 30], from: { kind: 'solver' } };
}

// ---------- атласные координаты (ТЗ § 3.7, § 8.3 п. 5; E9; решение владельца 5) ----------
//
// Столбцы — века от 4200 г. до Р. Х.: столбец 1 — 4200–4101 гг. до Р. Х., …, 42 — 100–1 гг. до Р. Х., 43 — 1–100 гг. по Р. Х.
// Номер зависит только от года, поэтому один и тот же во всех моделях хронологии и во всех выпусках. Годы раньше
// 4200 г. до Р. Х. бывают только в модели чисел в скобках Быт 5 и 11; их столбцы — 0, −1, … (на линейке так и подписываются).
//
// Строки — полосы по ATLAS_BAND = 15, отсчитанные от оси коридора, а не от края неба: строка «П» — полосы −7…7 (ось линий
// Мессии посередине), выше — «Н», «М», …, «А» (полосы 173…187), ниже — «Р», «С», …, «Я» (−187…−173). Добавленное или
// убранное у края лицо не сдвигает буквы остальных; 25 букв покрывают всё небо во всех моделях (после скоплений E2 —
// полосы от −174 до 178). За пределами «А»…«Я» буква повторяется с номером круга: «Я0» — над «А», «А2» — под «Я».

export const ATLAS_LETTERS = 'АБВГДЕЖИКЛМНПРСТУФХЦЧШЭЮЯ';
export const ATLAS_BAND = 15;
/** Столбец атласа, лет. */
export const ATLAS_COL_YEARS = 100;
/** Начало столбца 1: 4200 г. до Р. Х. (исторический год). */
export const ATLAS_COL_ORIGIN = -4200;
/** Номер строки оси коридора (буква «П»). */
const AXIS_ROW = Math.floor(ATLAS_LETTERS.length / 2);

/** Номер столбца по году (астр.). */
export function atlasColumn(t: number): number {
  const h = toHist(Math.floor(t));
  // исторические годы без нулевого: −4200…−4101 → 1, …, −100…−1 → 42, 1…100 → 43
  const fromOrigin = h < 0 ? h - ATLAS_COL_ORIGIN : h - ATLAS_COL_ORIGIN - 1;
  return Math.floor(fromOrigin / ATLAS_COL_YEARS) + 1;
}

/** Годы столбца (астр.): [начало, конец) — для рисок и номеров на линейке. */
export function atlasColumnSpan(col: number): [number, number] {
  const h0 = ATLAS_COL_ORIGIN + (col - 1) * ATLAS_COL_YEARS; // первый исторический год столбца, если бы нулевой год был
  const start = h0 >= 0 ? h0 + 1 : h0;
  const astro = toAstro(start);
  return [astro, astro + ATLAS_COL_YEARS];
}

const HALF_BAND = Math.floor(ATLAS_BAND / 2);

/** Номер строки по полосе: 0 — «А» (верхняя), AXIS_ROW — «П» (ось коридора), растёт вниз. */
export function atlasRow(lane: number): number {
  return AXIS_ROW - Math.floor((Math.round(lane) + HALF_BAND) / ATLAS_BAND);
}

/** Полосы строки: [нижняя, верхняя] включительно. */
export function atlasRowLanes(row: number): [number, number] {
  const k = AXIS_ROW - row;
  return [k * ATLAS_BAND - HALF_BAND, k * ATLAS_BAND + ATLAS_BAND - 1 - HALF_BAND];
}

/** Буква строки: «П»; за пределами алфавита — с номером круга: ниже «Я» — «А2», «Б2», …; выше «А» — «Я0», «Ю0», … */
export function atlasRowLetter(row: number): string {
  const n = ATLAS_LETTERS.length;
  const i = ((row % n) + n) % n;
  const lap = Math.floor(row / n); // 0 — основной круг; 1 — ниже «Я»; −1 — выше «А»
  return ATLAS_LETTERS[i] + (lap === 0 ? '' : String(lap + 1));
}

/** Атласная координата: «27 У». t — год (астр.), lane — полоса. */
export function atlasCoord(t: number, lane: number): string {
  return `${atlasColumn(t)} ${atlasRowLetter(atlasRow(lane))}`;
}

// ---------- контуры созвездий (E8; MAP-41, 08, 36) ----------
//
// Один сглаженный контур на созвездие (на каждую его связную часть) вместо ступенчатого пунктира каждого притока.
// Считается при сборке, после масштаба времени, на растре в мировых единицах режима «по насыщенности» (он — при первом
// показе): клетка — OUTLINE_CX единиц по горизонтали и полполосы по вертикали. Шаги:
//  1. клетки, занятые звёздами и рисуемыми следами лиц созвездия (с полями), — «своё»; звёзды и следы других созвездий,
//     коридора и скоплений — «чужое»;
//  2. замыкание (расширение и сужение прямоугольником) сливает близкие притоки одного рода и закрывает щели;
//     чужие клетки из области вычитаются, свои — возвращаются;
//  3. связные части, в которых меньше OUTLINE_MIN лиц, отбрасываются (у одиночных притоков контура нет);
//  4. область размывается гауссовым ядром и обводится изолинией 0,5 (марширующие квадраты) — контур гладкий,
//     без ступенек; затем упрощается (Дуглас — Пекер) и переводится в годы.
// Вершины контура — (год, полоса); при другом масштабе времени отрисовка переводит их тем же timeToX: монотонное
// преобразование не выводит звёзды из области.
//
// Область — звёзды и первые CORE_YEARS лет следа (не весь след: иначе контур обводит длинные жизни «сосисками», MAP-58).
// Место для названия (slots) — пустые участки внутри области высотой в 2, 3 и 1 полосу, по нескольку на высоту: ни звезды,
// ни следа, ни места под имя звезды. Если название не помещается ни в один участок в окне, его не рисуют (MAP-08).

/** Контур созвездия: одна связная часть. Годы — астрономические, полосы — как у узлов. */
export interface Outline {
  group: string;
  /**
   * Созвездие, внутри которого лежит это (дом внутри колена: «Дом Давидов» — в «Колене Иудином», «Священники,
   * сыны Аароновы» — в «Колене Левиином»). Контур колена обводит и лиц его домов; контур дома — вложенный.
   */
  parent?: string;
  /** лиц созвездия внутри */
  size: number;
  /** кольца (внешнее и дыры) — замкнутые ломаные [год, полоса]; последняя вершина не повторяет первую */
  rings: [number, number][][];
  /** пустые места под название: середина по полосе, высота в полосах, годы начала и конца; лучшие — первыми */
  slots: { lane: number; h: number; t0: number; t1: number }[];
}

/** Лиц в связной части, меньше — контур не строится. */
export const OUTLINE_MIN = 5;
/** Сколько лет следа от рождения входит в область созвездия: дальше след — линия поверх неба (MAP-58). */
const CORE_YEARS = 30;
/** Мест под название на каждую высоту (2, 3, 1 полоса) и наименьшая длина места, клеток. */
const SLOTS_PER_H = 8;
const SLOT_MIN = 4;
/** Ширина клетки растра, мировых единиц (≈ 2–4 px на масштабе эпохи). */
const OUTLINE_CX = 100;
/** Клеток растра на полосу. */
const OUTLINE_RY = 2;

/** Созвездие лица на небе: лица коридора, скоплений и призраки — вне созвездий; жена-спутница — в созвездии мужа. */
function regionGroup(g: Graph, n: LayoutNode, blocks: BlockInfo[]): string | null {
  if (n.spine || n.ghost) return null;
  if (n.block >= 0 && blocks[n.block]?.cluster) return null;
  if (n.satelliteOf) return g.persons.get(n.satelliteOf)?.group ?? null;
  return g.persons.get(n.person)?.group ?? null;
}

export function computeOutlines(
  g: Graph,
  layout: LayoutResult,
  toX: (t: number) => number,
  toT: (x: number) => number,
  /** дом → колено (data/groups.json, parent) */
  parents: Record<string, string> = {},
): Outline[] {
  // отпечатки узлов в мировых единицах
  // core — сколько следа входит в область: звезда и первые CORE_YEARS лет жизни; дальше след — линия, а не область
  // (MAP-58: длинные следы давали контурам «сосиски»)
  interface Foot { x0: number; x1: number; core: number; lane: number; group: string | null }
  const foots: Foot[] = layout.nodes.map((n) => {
    const x0 = toX(n.t0);
    const x1 = Math.max(toX(n.t1), x0);
    return { x0, x1, core: Math.min(x1, Math.max(x0, toX(n.t0 + CORE_YEARS))), lane: n.lane, group: regionGroup(g, n, layout.blocks) };
  });
  // скопления — прямоугольником целиком (подпись и сетка)
  for (const b of layout.blocks) {
    if (!b.cluster) continue;
    for (let l = b.laneMin; l <= b.laneMax; l++) foots.push({ x0: toX(b.cluster.t0), x1: toX(b.cluster.t1), core: toX(b.cluster.t1), lane: l, group: null });
  }
  // область колена включает его дома; у дома — своя, вложенная
  const byGroup = new Map<string, Foot[]>();
  const add = (gid: string, f: Foot) => {
    const a = byGroup.get(gid);
    if (a) a.push(f);
    else byGroup.set(gid, [f]);
  };
  for (const f of foots) {
    if (!f.group) continue;
    add(f.group, f);
    if (parents[f.group]) add(parents[f.group], f);
  }
  const belongs = (f: Foot, gid: string) => f.group === gid || (!!f.group && parents[f.group] === gid);
  const PAD_L = 150;
  const PAD_R = 300;
  const NAME = 700; // место под имя звезды справа от неё — для поиска пустых мест под название
  const RX = 12; // замыкание: клеток по горизонтали (≈ 1 200 единиц мира)
  const RY = 6; // и по вертикали (три полосы)
  const M = RX + 6; // поле растра вокруг рамки созвездия
  const out: Outline[] = [];

  for (const [group, own] of [...byGroup].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (own.length < OUTLINE_MIN) continue;
    let xMin = Infinity, xMax = -Infinity, lMin = Infinity, lMax = -Infinity;
    for (const f of own) {
      xMin = Math.min(xMin, f.x0 - PAD_L);
      xMax = Math.max(xMax, f.core + PAD_R);
      lMin = Math.min(lMin, f.lane);
      lMax = Math.max(lMax, f.lane);
    }
    const gx0 = Math.floor(xMin / OUTLINE_CX) - M;
    const gx1 = Math.ceil(xMax / OUTLINE_CX) + M;
    const gl0 = lMin - (M >> 1); // полоса нижнего края растра
    const W = gx1 - gx0 + 1;
    const H = (lMax - lMin + M + 1) * OUTLINE_RY + 1;
    const cellX = (x: number) => Math.floor(x / OUTLINE_CX) - gx0;
    const cellY = (lane: number) => Math.floor((lane - gl0) * OUTLINE_RY); // строка j покрывает полосы [gl0 + j/RY, …)
    const mark = (mask: Uint8Array, x0: number, x1: number, l0: number, l1: number) => {
      const i0 = Math.max(0, cellX(x0));
      const i1 = Math.min(W - 1, cellX(x1));
      const j0 = Math.max(0, cellY(l0));
      const j1 = Math.min(H - 1, cellY(l1) - (Number.isInteger((l1 - gl0) * OUTLINE_RY) ? 1 : 0));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) mask[j * W + i] = 1;
    };
    const ownCore = new Uint8Array(W * H);
    const foreign = new Uint8Array(W * H);
    const busy = new Uint8Array(W * H); // для мест под название: все звёзды, следы и имена
    for (const f of own) mark(ownCore, f.x0 - PAD_L, f.core + PAD_R, f.lane - 0.5, f.lane + 0.5);
    const inBox = (f: Foot) => f.x1 >= (gx0 - 1) * OUTLINE_CX && f.x0 <= (gx1 + 1) * OUTLINE_CX && f.lane >= gl0 - 1 && f.lane <= gl0 + H / OUTLINE_RY + 1;
    // свои следы (и хвосты за core) — «занятое» для мест под название, как и прежде
    for (const f of foots) {
      if (!inBox(f)) continue;
      if (!belongs(f, group)) mark(foreign, f.x0 - 60, f.x1 + 120, f.lane - 0.5, f.lane + 0.5);
      mark(busy, f.x0 - 100, Math.max(f.x1, f.x0 + NAME) + 100, f.lane - 0.5, f.lane + 0.5);
    }
    // 2. замыкание, вычитание чужого
    const closed = erode(dilate(ownCore, W, H, RX, RY), W, H, RX, RY);
    const mask = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) mask[k] = ownCore[k] || (closed[k] && !foreign[k]) ? 1 : 0;
    // 3. связные части
    const comp = new Int32Array(W * H).fill(-1);
    let nc = 0;
    const stack: number[] = [];
    for (let k = 0; k < W * H; k++) {
      if (!mask[k] || comp[k] >= 0) continue;
      comp[k] = nc;
      stack.push(k);
      while (stack.length) {
        const q = stack.pop()!;
        const qi = q % W;
        const qj = (q - qi) / W;
        const nb = [qi > 0 ? q - 1 : -1, qi < W - 1 ? q + 1 : -1, qj > 0 ? q - W : -1, qj < H - 1 ? q + W : -1];
        for (const r of nb) if (r >= 0 && mask[r] && comp[r] < 0) { comp[r] = nc; stack.push(r); }
      }
      nc++;
    }
    const sizes = new Array<number>(nc).fill(0);
    for (const f of own) {
      const i = cellX(f.x0);
      const j = cellY(f.lane);
      if (i >= 0 && i < W && j >= 0 && j < H && comp[j * W + i] >= 0) sizes[comp[j * W + i]]++;
    }
    for (let c = 0; c < nc; c++) {
      if (sizes[c] < OUTLINE_MIN) continue;
      const part = new Float32Array(W * H);
      for (let k = 0; k < W * H; k++) if (comp[k] === c) part[k] = 1;
      // 4. сглаживание и изолиния
      const field = blur(part, W, H, 2.0);
      // свои следы — внутри, а звёзды — с запасом в клетку: упрощение контура не срежет звезду на мысу
      for (let k = 0; k < W * H; k++) if (comp[k] === c && ownCore[k] && field[k] < 0.55) field[k] = 0.55;
      for (const f of own) {
        const i0 = cellX(f.x0);
        const j0 = cellY(f.lane);
        if (i0 < 0 || i0 >= W || j0 < 0 || j0 >= H || comp[j0 * W + i0] !== c) continue;
        for (let j = Math.max(0, j0 - 2); j <= Math.min(H - 1, j0 + 1); j++)
          for (let i = Math.max(0, i0 - 1); i <= Math.min(W - 1, i0 + 1); i++) if (field[j * W + i] < 0.7) field[j * W + i] = 0.7;
      }
      const rings = isolines(field, W, H, 0.5)
        .map((r) => simplify(r, 0.35))
        .filter((r) => r.length >= 4 && Math.abs(area(r)) >= 6);
      if (!rings.length) continue;
      const toWorld = (p: [number, number]): [number, number] => {
        const t = toT((p[0] + gx0 + 0.5) * OUTLINE_CX);
        const lane = gl0 + (p[1] + 0.5) / OUTLINE_RY;
        return [Math.round(t * 10) / 10, Math.round(lane * 20) / 20];
      };
      // места под название: пустые участки внутри части высотой 2, 3 и 1 полоса — по нескольку на высоту, не
      // перекрываясь, самые длинные первыми: на масштабе эпохи в окне оказывается хотя бы одно, а на широком — несколько,
      // и название повторяется по области (MAP-58; ТЗ § 3.1)
      const slots: Outline['slots'] = [];
      const took: { j0: number; j1: number; i0: number; i1: number }[] = [];
      for (const h of [2, 3, 1]) {
        const rowsN = h * OUTLINE_RY;
        const runs: { j: number; i0: number; i1: number }[] = [];
        for (let j = 0; j + rowsN <= H; j++) {
          let run = 0;
          for (let i = 0; i <= W; i++) {
            let free = i < W;
            for (let q = 0; q < rowsN && free; q++) {
              const k = (j + q) * W + i;
              if (field[k] < 0.6 || busy[k]) free = false; // внутри сглаженного контура, с запасом
            }
            if (free) run++;
            else {
              if (run >= SLOT_MIN) runs.push({ j, i0: i - run, i1: i - 1 });
              run = 0;
            }
          }
        }
        runs.sort((a, b) => b.i1 - b.i0 - (a.i1 - a.i0) || a.j - b.j || a.i0 - b.i0);
        let k = 0;
        for (const r of runs) {
          if (k >= SLOTS_PER_H) break;
          const j1 = r.j + rowsN - 1;
          if (took.some((q) => r.i0 <= q.i1 && q.i0 <= r.i1 && r.j <= q.j1 && q.j0 <= j1)) continue;
          took.push({ j0: r.j, j1, i0: r.i0, i1: r.i1 });
          const t0 = toT((r.i0 + gx0) * OUTLINE_CX);
          const t1 = toT((r.i1 + 1 + gx0) * OUTLINE_CX);
          slots.push({ lane: Math.round((gl0 + (r.j + rowsN / 2) / OUTLINE_RY) * 20) / 20, h, t0: Math.round(t0 * 10) / 10, t1: Math.round(t1 * 10) / 10 });
          k++;
        }
      }
      out.push({ group, ...(parents[group] ? { parent: parents[group] } : {}), size: sizes[c], rings: rings.map((r) => r.map(toWorld)), slots });
    }
  }
  return out;
}

/** Расширение прямоугольником (2rx+1)×(2ry+1): раздельно по строкам и столбцам. */
function dilate(m: Uint8Array, W: number, H: number, rx: number, ry: number): Uint8Array {
  const a = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    let last = -Infinity;
    for (let i = 0; i < W; i++) if (m[j * W + i]) last = i;
      else if (i - last <= rx) a[j * W + i] = 1;
    last = Infinity;
    for (let i = W - 1; i >= 0; i--) {
      if (m[j * W + i]) { last = i; a[j * W + i] = 1; }
      else if (last - i <= rx) a[j * W + i] = 1;
    }
  }
  const b = new Uint8Array(W * H);
  for (let i = 0; i < W; i++) {
    let last = -Infinity;
    for (let j = 0; j < H; j++) if (a[j * W + i]) last = j;
      else if (j - last <= ry) b[j * W + i] = 1;
    last = Infinity;
    for (let j = H - 1; j >= 0; j--) {
      if (a[j * W + i]) { last = j; b[j * W + i] = 1; }
      else if (last - j <= ry) b[j * W + i] = 1;
    }
  }
  return b;
}

/** Сужение — расширение дополнения. */
function erode(m: Uint8Array, W: number, H: number, rx: number, ry: number): Uint8Array {
  const inv = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) inv[k] = m[k] ? 0 : 1;
  const d = dilate(inv, W, H, rx, ry);
  for (let k = 0; k < W * H; k++) d[k] = d[k] ? 0 : 1;
  return d;
}

/** Гауссово размытие, раздельное. */
function blur(m: Float32Array, W: number, H: number, sigma: number): Float32Array {
  const R = Math.ceil(sigma * 3);
  const k: number[] = [];
  let s = 0;
  for (let d = -R; d <= R; d++) { const w = Math.exp(-(d * d) / (2 * sigma * sigma)); k.push(w); s += w; }
  for (let d = 0; d < k.length; d++) k[d] /= s;
  const a = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      let v = 0;
      for (let d = -R; d <= R; d++) { const ii = i + d; if (ii >= 0 && ii < W) v += k[d + R] * m[j * W + ii]; }
      a[j * W + i] = v;
    }
  const b = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      let v = 0;
      for (let d = -R; d <= R; d++) { const jj = j + d; if (jj >= 0 && jj < H) v += k[d + R] * a[jj * W + i]; }
      b[j * W + i] = v;
    }
  return b;
}

/**
 * Изолинии поля на уровне level (марширующие квадраты): замкнутые ломаные в координатах клеток (i, j).
 * Поле за краем растра считается нулевым, поэтому все линии замкнуты.
 */
function isolines(f: Float32Array, W: number, H: number, level: number): [number, number][][] {
  const v = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : f[j * W + i]);
  // рёбра: ключ — «i,j,h» (горизонтальное ребро от (i,j) к (i+1,j)) или «i,j,v» (вертикальное от (i,j) к (i,j+1))
  const point = (key: string): [number, number] => {
    const [si, sj, d] = key.split(',');
    const i = Number(si);
    const j = Number(sj);
    const a = v(i, j);
    const b = d === 'h' ? v(i + 1, j) : v(i, j + 1);
    const t = a === b ? 0.5 : (level - a) / (b - a);
    return d === 'h' ? [i + t, j] : [i, j + t];
  };
  const next = new Map<string, string>(); // ребро → следующее ребро по обходу (область слева)
  for (let j = -1; j < H; j++)
    for (let i = -1; i < W; i++) {
      const a = v(i, j) >= level ? 1 : 0; // (i, j)
      const b = v(i + 1, j) >= level ? 1 : 0; // (i+1, j)
      const c = v(i + 1, j + 1) >= level ? 1 : 0; // (i+1, j+1)
      const d = v(i, j + 1) >= level ? 1 : 0; // (i, j+1)
      const code = a | (b << 1) | (c << 2) | (d << 3);
      if (code === 0 || code === 15) continue;
      const top = `${i},${j},h`;
      const right = `${i + 1},${j},v`;
      const bottom = `${i},${j + 1},h`;
      const left = `${i},${j},v`;
      const seg = (from: string, to: string) => next.set(from, to);
      const center = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 >= level;
      switch (code) {
        case 1: seg(left, top); break;
        case 2: seg(top, right); break;
        case 3: seg(left, right); break;
        case 4: seg(right, bottom); break;
        case 5: if (center) { seg(left, bottom); seg(right, top); } else { seg(left, top); seg(right, bottom); } break;
        case 6: seg(top, bottom); break;
        case 7: seg(left, bottom); break;
        case 8: seg(bottom, left); break;
        case 9: seg(bottom, top); break;
        case 10: if (center) { seg(top, left); seg(bottom, right); } else { seg(top, right); seg(bottom, left); } break;
        case 11: seg(bottom, right); break;
        case 12: seg(right, left); break;
        case 13: seg(right, top); break;
        case 14: seg(top, left); break;
      }
    }
  const rings: [number, number][][] = [];
  const seen = new Set<string>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const ring: [number, number][] = [];
    let e: string | undefined = start;
    while (e !== undefined && !seen.has(e)) {
      seen.add(e);
      ring.push(point(e));
      e = next.get(e);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/** Площадь кольца со знаком (в клетках). */
function area(r: [number, number][]): number {
  let s = 0;
  for (let k = 0; k < r.length; k++) {
    const [x0, y0] = r[k];
    const [x1, y1] = r[(k + 1) % r.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** Упрощение замкнутой ломаной (Дуглас — Пекер) с допуском eps клеток; полполосы по вертикали — одна клетка. */
function simplify(r: [number, number][], eps: number): [number, number][] {
  if (r.length < 8) return r;
  // разрезаем кольцо в двух далёких точках и упрощаем половины
  let far = 0;
  let best = -1;
  for (let k = 1; k < r.length; k++) {
    const d = (r[k][0] - r[0][0]) ** 2 + (r[k][1] - r[0][1]) ** 2;
    if (d > best) { best = d; far = k; }
  }
  const dp = (pts: [number, number][]): [number, number][] => {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0];
    const [bx, by] = pts[pts.length - 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let dmax = -1;
    let idx = 0;
    for (let k = 1; k < pts.length - 1; k++) {
      const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / len;
      if (d > dmax) { dmax = d; idx = k; }
    }
    if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
    const a = dp(pts.slice(0, idx + 1));
    const b = dp(pts.slice(idx));
    return [...a.slice(0, -1), ...b];
  };
  const a = dp(r.slice(0, far + 1));
  const b = dp([...r.slice(far), r[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
