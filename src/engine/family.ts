/**
 * Семейная укладка по времени «Г» (этап 11, решение 80; STAGE11 § 4.2; K3 § 2.2–2.3).
 *
 * Для показов части неба — набор, род лица, созвездия (кроме «все колена»), линии Мессии — строки неба считаются
 * заново, а горизонталь остаётся прежней: те же годы, тот же масштаб времени, что у всего неба. Результат — строка
 * (виртуальная полоса) каждого лица показа; больше — выше на экране, как у полос общей раскладки.
 *
 * Правила:
 *  1. Дом лица. Лицо линии Мессии стоит в коридоре. Жена, у которой в показе есть дети от мужа (или чьих родителей
 *     в показе нет), стоит у мужа. Остальные — у союза своих родителей: у отца, а если его нет — у матери. Муж без
 *     своего дома и без детей в показе (гость: муж дочери рода) стоит у жены.
 *  2. Единица союза — мать и её дети из показа. Порядок — как в «Отчем доме» (этап 15, решение 173; engine/house.ts):
 *     чем позже союз (год до первого ребёнка в показе), тем ближе к родителю; при равенстве — союз с ребёнком линии
 *     Мессии, затем порядок текста (порядок брака, порядок супругов в данных, первый ребёнок). Внутри единицы наружу от родителя — мать, за ней её дети:
 *     младший у матери, старший дальше всех (при равном годе — по порядку перечисления). Поэтому отвод от следа матери
 *     в год рождения и ствол внешней единицы проходят только строки, которые в этот год ещё пусты.
 *  3. Стороны решаются по данным, а не по раскрытому: у лица с двумя союзами с детьми и больше единицы чередуются
 *     выше и ниже следа; у лица с одним союзом, пятью детьми и больше и без матери в показе родитель стоит
 *     посередине — старшие выше, младшие ниже (у каждой половины младший — у родителя). Мать с детьми — всегда по одну
 *     сторону (решение 173: дети связаны со следом матери). В роде лица «оба направления» семьи предков стоят выше, лицо и потомки — ниже.
 *  4. Контур — аккуратное дерево по времени (van der Ploeg): в контур входят зубцы и столбцы стволов; строку после
 *     чужого следа можно занять не раньше чем через REUSE лет.
 *  5. Коридор — лучевой поиск со штрафом за отход от прошлого шага (у лент нет «горба Ламеха»). Притоки — единицы
 *     союзов лиц коридора; лица — от поздних к ранним, стороны чередуются.
 *  6. Устойчивость: прежние блоки ставятся первыми, на свои места, изнутри наружу; выросший блок остаётся на месте,
 *     внешние отодвигаются наружу; стороны единиц запоминаются.
 *  7. Пустые строки убираются.
 *
 * «Песочные часы» (род лица, оба направления; options.focus): союз лица и его потомков — ниже, союз предка, через
 * которого род идёт к лицу, — тоже ниже (цепочка предков сходит к лицу сверху), прочие семьи предков — выше.
 * Скопления (списки без родства, E2; FamilyData.cluster): лица списка, чья родня в показе — в том же списке, стоят
 * блоком своей сетки, как на общей карте, — иначе сотни одновременных имён заняли бы по строке каждое.
 *
 * Модуль чистый: данные — через FamilyData, прежняя укладка — через FamilyPrior.
 */
import type { Graph } from './graph.ts';
import type { Union, Unions } from './unions.ts';

/** Данные, которые нужны укладке. */
export interface FamilyData {
  graph: Graph;
  unions: Unions;
  /** год знака лица (астр.) — там, где звезда стоит на небе */
  t0(id: string): number;
  /** место лица в полосе, годы: от знака (или начала промежутка рождения) до конца следа и места под имя */
  span(id: string): readonly [number, number];
  /** линии Мессии: id по порядку шагов (data/lines) */
  lines: { joseph: readonly string[]; mary: readonly string[] };
  /**
   * Клетка лица в скоплении общей раскладки (список без родства, E2): ключ скопления, строка сетки (0 — верхняя), строк
   * в сетке и её годы. Лица скопления без родни в показе вне своего скопления ставятся одним блоком, как на общей карте.
   */
  cluster?(id: string): { key: string; row: number; rows: number; t0: number; t1: number } | null;
}

/** Прежняя укладка — априорное условие следующего шага (§ 4.2 п. 6). */
export interface FamilyPrior {
  /** строки до сжатия */
  rows: ReadonlyMap<string, number>;
  /** база и сторона блоков: притоки коридора — по id союза, корни — по id лица */
  blocks: ReadonlyMap<string, { base: number; side: 1 | -1 }>;
  /** стороны единиц союзов */
  sides: ReadonlyMap<string, 1 | -1>;
}

export interface FamilyOptions {
  prior?: FamilyPrior | null;
  /** «песочные часы» (род лица, оба направления): семьи предков лица — выше, его семья и потомки — ниже */
  focus?: string | null;
  /** от стольких детей у единственного союза родитель стоит посередине (по умолчанию 5) */
  center?: number;
  /** чередовать стороны союзов у лица с несколькими союзами (по умолчанию да) */
  alternate?: boolean;
}

export interface FamilyUnit {
  union: Union;
  /** лицо, у чьего следа стоит узел союза */
  parent: string;
  /** супруг у следа родителя: мать (жена), если она стоит в этой семье; у жены без детей в показе — муж-гость */
  wife: string | null;
  /** дети в показе (кроме лиц коридора — их связь рисует лента) */
  kids: string[];
  /** сторона от строки родителя: 1 — выше, −1 — ниже */
  side: 1 | -1;
  /** год ствола: за год до первого ребёнка; у внешней единицы — до рождений детей внутренних (ступенька) */
  trunk: number;
}

export interface FamilyResult {
  /** строка лица после сжатия: 0 … count − 1 */
  rows: Map<string, number>;
  /** число строк */
  count: number;
  /** прежняя укладка для следующего шага */
  prior: FamilyPrior;
  /** единицы союзов по родителю */
  units: Map<string, FamilyUnit[]>;
  /** дом лица: к кому оно приписано (родитель по союзу или муж); null — корень или лицо коридора */
  home: Map<string, string | null>;
  /** лица коридора */
  spine: Set<string>;
  /**
   * Жена в семье мужа (решение 173, «Отчий дом»): год, с которого её строка — в семье мужа (год союза: за год до первого
   * ребёнка в показе; у бездетного — взрослость). До него она в дом мужа ещё не пришла: её доля следа до брака у мужа —
   * не жизнь в доме (рисуется бледно или не рисуется), и черта более раннего союза, стоящего дальше, её не пересекает.
   * Строка за ней закреплена с рождения (под звезду и бледную часть следа).
   */
  since: Map<string, number>;
}

type Iv = [number, number];
/**
 * Занятость строк: строка → отсортированные непересекающиеся отрезки времени плоским массивом [a0, b0, a1, b1, …].
 * Пересечение отрезков — замкнутое (касание — тоже пересечение). Поиск — двоичный: укладка сотен лиц идёт за десятки мс.
 */
type Contour = Map<number, number[]>;
/** Запас по времени у места лица, годы. */
const GAP = 3;
/** Строку после чужого следа занимают не раньше чем через REUSE лет: новое лицо не читается продолжением прежнего. */
export const REUSE = 15;
/** Штраф за каждую занятую строку, которую пересекает черта брака к жене без детей в показе (царица-мать; X3 Д11). */
const HIT_WIFE = 40;
/** Вес пересечения следа лица коридора стволом притока (X3 Д11): втрое тяжелее пересечения прочей занятости. */
const CORRIDOR_HIT = 3;
/** Полоса коридора: от −CORRIDOR_K до +CORRIDOR_K. */
const CORRIDOR_K = 7;
const BEAM = 64;
const pad = (iv: readonly [number, number]): Iv => [iv[0] - GAP, iv[1] + Math.max(GAP, REUSE)];

/** Номер первого отрезка строки, конец которого не раньше t. */
function firstEnd(arr: number[], t: number): number {
  let lo = 0;
  let hi = arr.length >> 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[2 * mid + 1] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
/** Пересекает ли отрезок [a; b] занятое в строке. */
function hit(arr: number[] | undefined, a: number, b: number): boolean {
  if (!arr) return false;
  const i = firstEnd(arr, a);
  return 2 * i < arr.length && arr[2 * i] <= b;
}
/** Занять отрезок [a; b] строки lane (с соседями, которых он касается, сливается). */
function addIv(c: Contour, lane: number, a: number, b: number) {
  const arr = c.get(lane);
  if (!arr) {
    c.set(lane, [a, b]);
    return;
  }
  const lo = firstEnd(arr, a);
  let i = lo;
  let na = a;
  let nb = b;
  while (2 * i < arr.length && arr[2 * i] <= b) {
    if (arr[2 * i] < na) na = arr[2 * i];
    if (arr[2 * i + 1] > nb) nb = arr[2 * i + 1];
    i++;
  }
  arr.splice(2 * lo, 2 * (i - lo), na, nb);
}
function collides(acc: Contour, sub: Contour, shift: number): boolean {
  for (const [lane, ivs] of sub) {
    const t = acc.get(lane + shift);
    if (!t) continue;
    for (let k = 0; k < ivs.length; k += 2) if (hit(t, ivs[k], ivs[k + 1])) return true;
  }
  return false;
}
function merge(acc: Contour, sub: Contour, shift: number) {
  for (const [lane, ivs] of sub) for (let k = 0; k < ivs.length; k += 2) addIv(acc, lane + shift, ivs[k], ivs[k + 1]);
}

interface Unit {
  u: Union;
  p: string;
  wife: string | null;
  kids: string[];
  tu: number;
}

/**
 * Семейная укладка лиц S. Лица S — лица показа и гости; у каждого получается своя строка.
 */
export function familyLayout(S0: ReadonlySet<string>, d: FamilyData, o: FamilyOptions = {}): FamilyResult {
  const { graph: g, unions: U } = d;
  const prior = o.prior ?? null;
  // скопления: списочные лица, вся родня которых в показе — в том же скоплении, стоят блоком своей сетки
  const clustered = new Map<string, { key: string; row: number; rows: number; t0: number; t1: number }>();
  if (d.cluster)
    for (const id of S0) {
      const c = d.cluster(id);
      if (c) clustered.set(id, c);
    }
  for (const [id, c] of [...clustered]) {
    const kin = [
      ...(g.parentsOf.get(id) ?? []).map((e) => e.parent),
      ...(g.childrenOf.get(id) ?? []).map((e) => e.child),
      ...(g.spousesOf.get(id) ?? []).map((e) => (e.a === id ? e.b : e.a)),
    ];
    if (kin.some((x) => S0.has(x) && clustered.get(x)?.key !== c.key)) clustered.delete(id);
  }
  // родня, оставшаяся в скоплении, тянет за собой: лицо, чья родня ушла из скопления, уходит тоже (до неподвижной точки)
  for (let changed = true; changed; ) {
    changed = false;
    for (const [id, c] of [...clustered]) {
      const kin = [...(g.parentsOf.get(id) ?? []).map((e) => e.parent), ...(g.childrenOf.get(id) ?? []).map((e) => e.child)];
      if (kin.some((x) => S0.has(x) && clustered.get(x)?.key !== c.key)) {
        clustered.delete(id);
        changed = true;
      }
    }
  }
  const S: ReadonlySet<string> = clustered.size ? new Set([...S0].filter((id) => !clustered.has(id))) : S0;
  const T0 = (id: string) => d.t0(id);
  const spineAll = new Set([...d.lines.joseph, ...d.lines.mary]);
  const spine = new Set([...S].filter((id) => spineAll.has(id)));
  const ORD = new Map(g.order.map((id, i) => [id, i]));
  /** Порядок детей в группе: по году рождения, при равенстве — по порядку перечисления, затем по данным. */
  const kidOrder = (a: string, b: string) =>
    T0(a) - T0(b) || (g.persons.get(a)?.order ?? 99) - (g.persons.get(b)?.order ?? 99) || (ORD.get(a) ?? 0) - (ORD.get(b) ?? 0);
  const spanOf = (id: string): Iv => {
    const sp = d.span(id);
    const t = T0(id);
    return [Math.min(sp[0], t), Math.max(sp[1], t + 4)];
  };

  // ---------- союзы, дома лиц, единицы ----------
  /** Союзы показа: без утверждений иного рода (законный отец остаётся), с родителем в показе и ребёнком или супругом в нём. */
  const shown: Union[] = [];
  for (const u of U.byId.values()) {
    if (u.claim && u.claim !== 'legal') continue;
    const par = (!!u.a && S.has(u.a)) || (!!u.b && S.has(u.b));
    if (!par) continue;
    if (u.kids.some((k) => S.has(k)) || (u.a && u.b && S.has(u.a) && S.has(u.b))) shown.push(u);
  }
  /** Родитель союза, у чьего следа стоит узел: муж, иначе жена. */
  const primaryOf = (u: Union) => (u.a && S.has(u.a) ? u.a : u.b && S.has(u.b) ? u.b : null);
  const home = new Map<string, string | null>();
  // жёны: к мужу, если у пары есть дети в показе или если родителей жены в показе нет
  const wifeOf = new Map<string, string>();
  for (const u of shown) {
    if (!u.a || !u.b || !S.has(u.a) || !S.has(u.b) || spine.has(u.b)) continue;
    const hasKids = u.kids.some((k) => S.has(k));
    const natal = U.origin.get(u.b)?.find((x) => !x.claim && ((x.a && S.has(x.a)) || (x.b && S.has(x.b))));
    const prev = wifeOf.get(u.b);
    if ((hasKids || !natal) && (!prev || hasKids)) wifeOf.set(u.b, u.a);
  }
  for (const id of S) {
    if (spine.has(id)) {
      home.set(id, null);
      continue;
    }
    const w = wifeOf.get(id);
    if (w) {
      home.set(id, w);
      continue;
    }
    const x = U.origin.get(id)?.find((y) => (!y.claim || y.claim === 'legal') && ((y.a && S.has(y.a)) || (y.b && S.has(y.b))));
    home.set(id, x ? primaryOf(x) : null);
  }
  // защита от циклов (жена у мужа, муж у отца жены…)
  for (const id of S) {
    const seen = new Set([id]);
    for (let c = home.get(id); c; c = home.get(c) ?? null) {
      if (seen.has(c)) {
        home.set(id, null);
        break;
      }
      seen.add(c);
    }
  }
  const units = new Map<string, Unit[]>();
  const addU = (p: string, x: Unit) => {
    const a = units.get(p);
    if (a) a.push(x);
    else units.set(p, [x]);
  };
  for (const u of shown) {
    const p = primaryOf(u)!;
    const other = u.a === p ? u.b : u.a;
    const wife = other && S.has(other) && home.get(other) === p ? other : null;
    const kids = u.kids.filter((k) => S.has(k) && !spine.has(k) && home.get(k) === p);
    const anyKids = u.kids.filter((k) => S.has(k));
    if (!wife && !kids.length && !anyKids.length) continue;
    const tu = anyKids.length ? Math.min(...anyKids.map(T0)) - 1 : T0(wife ?? p) + 20;
    addU(p, { u, p, wife, kids, tu });
  }
  // жёны у мужа без союза в показе — отдельная единица без детей
  for (const [w, h] of wifeOf) {
    if ((units.get(h) ?? []).some((x) => x.wife === w)) continue;
    const u = U.of.get(h)?.find((x) => x.b === w);
    if (!u) continue;
    addU(h, { u, p: h, wife: w, kids: [], tu: T0(w) + 20 });
  }
  // муж без своего дома и без своих единиц (гость показа: муж дочери рода, их детей в показе нет) — у жены, как жена
  // у мужа: иначе он стоял бы корнем в чужих строках, далеко от неё (Иодай у Иосавеф в «потомках Иуды»)
  for (const id of S) {
    if (home.get(id) || spine.has(id) || units.has(id)) continue;
    const u = (U.of.get(id) ?? []).find((x) => (!x.claim || x.claim === 'legal') && x.a === id && !!x.b && S.has(x.b) && !x.kids.some((k) => S.has(k)));
    if (!u) continue;
    const w = u.b!;
    let loop = false;
    for (let c: string | null | undefined = w; c; c = home.get(c)) if (c === id) loop = true;
    if (loop) continue;
    home.set(id, w);
    addU(w, { u, p: w, wife: id, kids: [], tu: T0(id) + 20 });
  }
  // порядок единиц — как в «Отчем доме» (решение 173): позже союз — ближе к родителю; при равенстве — союз с ребёнком
  // линии Мессии (у его черты расходятся ленты, решение 177), затем порядок текста
  const lineKid = (x: Unit) => (x.u.kids.some((k) => S.has(k) && spine.has(k)) ? 0 : 1);
  for (const [p, a] of units) {
    const ord = (U.of.get(p) ?? []).map((u) => u.id);
    a.sort((x, y) => y.tu - x.tu || lineKid(x) - lineKid(y) || (ord.indexOf(x.u.id) + 1 || 999) - (ord.indexOf(y.u.id) + 1 || 999));
  }

  // ---------- «песочные часы» ----------
  // род лица «оба направления»: семьи предков — выше, лицо и потомки — ниже. Союз самого лица и его потомков — вниз;
  // союз предка, через который род идёт к лицу, — тоже вниз (цепочка предков сходит к лицу сверху); прочие семьи
  // предков — вверх
  const focusAnc = new Set<string>();
  const focusDesc = new Set<string>();
  if (o.focus && S.has(o.focus)) {
    const up = [o.focus];
    while (up.length) {
      const x = up.pop()!;
      for (const e of g.parentsOf.get(x) ?? [])
        if ((e.kind === 'father' || e.kind === 'mother') && !focusAnc.has(e.parent)) {
          focusAnc.add(e.parent);
          up.push(e.parent);
        }
    }
    focusDesc.add(o.focus);
    const dn = [o.focus];
    while (dn.length) {
      const x = dn.pop()!;
      for (const e of g.childrenOf.get(x) ?? [])
        if ((e.kind === 'father' || e.kind === 'mother') && !focusDesc.has(e.child)) {
          focusDesc.add(e.child);
          dn.push(e.child);
        }
    }
  }
  const onPath = (x: string | null) => !!x && (focusAnc.has(x) || x === o.focus);
  /** Сторона единицы в «песочных часах»; 0 — правило обычное. */
  const focusSideOf = (un: Unit): 1 | -1 | 0 => {
    if (!o.focus) return 0;
    // путь идёт через ребёнка этой единицы (не через коридор: его дети в единицу не входят) — вниз, к лицу
    if (focusDesc.has(un.p) || un.kids.some(onPath)) return -1;
    return focusAnc.has(un.p) ? 1 : 0;
  };
  const alternate = (o.alternate ?? true) && !o.focus;
  const CENTER = o.center ?? 5;

  // ---------- коридор ----------
  const corr = corridorRows(S, d, spanOf, prior?.rows);

  const unitSide = new Map<string, 1 | -1>();
  const trunkT = new Map<string, number>();
  const rel = new Map<string, Map<string, number>>();
  const firstOf = (un: Unit) => (un.kids.length ? Math.min(...un.kids.map(T0)) : Infinity);
  /**
   * Единица союза как контур относительно строки родителя: жена (если стоит здесь), дети; у каждого ребёнка — зубец
   * от ствола до звезды; ствол — строки 1…последняя в год tu. start — первое свободное смещение.
   */
  const unitContour = (un: Unit, s: 1 | -1, tu: number, acc: Contour, start: number, pos: Map<string, number>): number => {
    // наружу от родителя (решение 173): мать, за ней дети — младший у матери, старший дальше всех; по обе стороны
    // одинаково. Отвод к старшему в год его рождения проходит строки младших, ещё не рождённых
    const kids = [...un.kids].sort(kidOrder).reverse();
    const members = [...(un.wife ? [un.wife] : []), ...kids];
    let prev = start;
    for (const m of members) {
      const sub = blockOf(m, s, false);
      if (m !== un.wife) addIv(sub, 0, tu - GAP, T0(m));
      else addIv(sub, 0, tu - GAP, tu + GAP);
      let off = prev + 1;
      while (collides(acc, sub, s * off)) off++;
      merge(acc, sub, s * off);
      for (const [q, r] of rel.get(m)!) pos.set(q, r + s * off);
      prev = off;
    }
    for (let k = 1; k <= prev; k++) addIv(acc, s * k, tu - GAP, tu + GAP);
    return prev;
  };
  /**
   * Блок лица p: строка 0 — само p, единицы союзов — в порядке текста, ближе первая; у лица с двумя союзами и больше
   * (верхний уровень) — по обе стороны поочерёдно, сторона единицы помнится между шагами.
   */
  const blockOf = (p: string, side: 1 | -1, top: boolean): Contour => {
    const acc: Contour = new Map([[0, pad(spanOf(p))]]);
    const pos = new Map<string, number>([[p, 0]]);
    const us = units.get(p) ?? [];
    const last = new Map<number, number>([
      [1, 0],
      [-1, 0],
    ]);
    const inner = new Map<number, number>([
      [1, Infinity],
      [-1, Infinity],
    ]);
    // решение «посередине» — по данным: у лица один союз с детьми во всём атласе и в нём от CENTER детей (иначе раскрытие
    // второго союза переставляло бы первый)
    const dataUnions = (U.of.get(p) ?? []).filter((u) => !u.claim && u.kids.length);
    if (CENTER && us.length === 1 && !us[0].wife && dataUnions.length === 1 && dataUnions[0].kids.length >= CENTER && !focusSideOf(us[0])) {
      const un = us[0];
      const kids = [...un.kids].sort(kidOrder);
      const h = Math.ceil(kids.length / 2);
      const older: Unit = { ...un, kids: kids.slice(0, h) };
      const younger: Unit = { ...un, wife: null, kids: kids.slice(h) };
      unitSide.set(un.u.id, 1);
      trunkT.set(un.u.id, un.tu);
      unitContour(older, 1, un.tu, acc, 0, pos);
      unitContour(younger, -1, un.tu, acc, 0, pos);
      rel.set(p, pos);
      return acc;
    }
    us.forEach((un, i) => {
      let s: 1 | -1 = side;
      const dIdx = dataUnions.findIndex((x) => x.id === un.u.id);
      const at = dIdx >= 0 ? dIdx : i;
      const fs = focusSideOf(un);
      if (fs) s = fs;
      else if (alternate && top && dataUnions.length > 1) s = prior?.sides.get(un.u.id) ?? ((at % 2 ? -side : side) as 1 | -1);
      unitSide.set(un.u.id, s);
      // ствол внешней единицы — до рождений детей внутренних (он проходит их строки) и левее их стволов
      const tu = Math.min(un.tu, inner.get(s)! - 2);
      trunkT.set(un.u.id, tu);
      const prev = unitContour(un, s, tu, acc, last.get(s)!, pos);
      last.set(s, prev);
      inner.set(s, Math.min(inner.get(s)!, firstOf(un), tu));
    });
    rel.set(p, pos);
    return acc;
  };

  // общая занятость: коридор и полосы лент между соседними лицами линий
  const occ: Contour = new Map();
  for (const [id, l] of corr) {
    const iv = pad(spanOf(id));
    addIv(occ, l, iv[0], iv[1]);
  }
  /** полосы лент между соседними лицами линий: занятость, но не след — ствол через них не пересекает ничьей жизни */
  const bands: Contour = new Map();
  for (const seq of [d.lines.joseph, d.lines.mary]) {
    const f = seq.filter((id) => corr.has(id));
    for (let i = 1; i < f.length; i++) {
      const la = corr.get(f[i - 1])!;
      const lb = corr.get(f[i])!;
      const a = T0(f[i - 1]);
      const b = T0(f[i]);
      for (let l = Math.min(la, lb); l <= Math.max(la, lb); l++) {
        addIv(occ, l, Math.min(a, b) - GAP, Math.max(a, b) + GAP);
        addIv(bands, l, Math.min(a, b) - GAP, Math.max(a, b) + GAP);
      }
    }
  }
  const rows = new Map<string, number>(corr);
  const blocks = new Map<string, { base: number; side: 1 | -1 }>();
  const fits = (c: Contour, base: number) => !collides(occ, c, base);
  /** проходы стволов притоков (мягкие места) */
  const pass: Contour = new Map();
  const passHits = (c: Contour, base: number) => {
    let n = 0;
    for (const [lane, ivs] of c) {
      const t = pass.get(lane + base);
      if (t) for (let k = 0; k < ivs.length; k += 2) if (hit(t, ivs[k], ivs[k + 1])) n++;
    }
    return n;
  };
  const busyAt = (c: Contour, r: number, t: number) => {
    const arr = c.get(r);
    if (!arr) return false;
    const i = firstEnd(arr, t);
    return 2 * i < arr.length && arr[2 * i] + GAP <= t && t <= arr[2 * i + 1] - GAP;
  };
  /**
   * Сколько занятых мест пересекает ствол от строки from до строки to (не включая обе) в год t: следы и ступени притоков
   * — в полную меру; след лица коридора — втрое (CORRIDOR_HIT); полоса ленты, где следа нет, — треть (этап 13, X3 Д11:
   * черта брака царя через след отца хуже, чем через полосу ленты).
   */
  const trunkHits = (from: number, to: number, t: number) => {
    let n = 0;
    const s = Math.sign(to - from);
    for (let r = from + s; r !== to; r += s) {
      if (!busyAt(occ, r, t)) continue;
      n += lives(r, t) ? CORRIDOR_HIT : busyAt(bands, r, t) ? 1 / 3 : 1;
    }
    return n;
  };
  /** жизни лиц коридора по строкам: в строке r в год t — след лица коридора, а не только полоса ленты */
  const livesC: Contour = new Map();
  for (const [id, l] of corr) addIv(livesC, l, T0(id), spanOf(id)[1]);
  const lives = (r: number, t: number) => hit(livesC.get(r), t, t);
  const had = (k: string) => (prior?.blocks.has(k) ? 1 : 0);

  // притоки коридора: каждая единица союза лица коридора — отдельный блок у его строки. Лица — от поздних к ранним
  // (ствол раннего проходит строки поздних до их рождений); у одного лица — порядок текста, стороны чередуются
  const tribsBy = new Map<string, Unit[]>();
  for (const c of corr.keys()) {
    const us = (units.get(c) ?? []).filter((un) => un.kids.length || un.wife);
    if (us.length) tribsBy.set(c, us);
  }
  const lastTu = (c: string) => Math.max(...tribsBy.get(c)!.map((u) => u.tu));
  const persons = [...tribsBy.keys()].sort((a, b) => lastTu(b) - lastTu(a));
  // устойчивость: лица, чьи блоки уже стояли, — первыми (изнутри наружу), затем новые
  const hadP = (c: string) => (tribsBy.get(c)!.some((un) => prior?.blocks.has(un.u.id)) ? 1 : 0);
  const distP = (c: string) =>
    Math.min(
      ...tribsBy.get(c)!.map((un) => {
        const pb = prior?.blocks.get(un.u.id);
        return pb ? Math.abs(pb.base - corr.get(c)!) : 1e9;
      }),
    );
  persons.sort((a, b) => hadP(b) - hadP(a) || (hadP(a) ? distP(a) - distP(b) : 0));
  for (const c of persons) {
    const cr = corr.get(c)!;
    const inner = new Map<number, number>([
      [1, Infinity],
      [-1, Infinity],
    ]);
    let lastS: 1 | -1 | 0 = 0;
    for (const un of tribsBy.get(c)!) {
      const key = un.u.id;
      const pr = prior?.blocks.get(key);
      const pref: 1 | -1 | 0 = pr ? pr.side : lastS ? (-lastS as 1 | -1) : 0;
      let best: { base: number; side: 1 | -1; acc: Contour; pos: Map<string, number>; tu: number; score: number } | null = null;
      const fs = focusSideOf(un);
      for (const s of (pr ? [pr.side] : fs ? [fs] : [1, -1]) as (1 | -1)[]) {
        const tu0 = Math.min(un.tu, inner.get(s)! - 2);
        const acc: Contour = new Map();
        const pos = new Map<string, number>();
        unitContour(un, s, tu0, acc, 0, pos);
        let k = pr && pr.side === s ? pr.base - cr : 0;
        if (k * s < 0) k = 0;
        let found = 0;
        for (let guard = 0; guard < 4000 && found < 12; guard++, k += s) {
          if (!fits(acc, cr + k)) continue;
          found++;
          const firstRow = cr + k + s;
          const hits = trunkHits(cr, firstRow, tu0);
          // черта брака царя с царицей-матерью (единица без детей в показе: сын — в коридоре) не пересекает коридор:
          // её место — по другую сторону, даже если там дальше (этап 13, X3 Д11)
          const hitW = un.kids.length ? 3 : HIT_WIFE;
          const score: number = Math.abs(k) + hitW * hits + 3 * passHits(acc, cr + k) + (pref && pref !== s ? 1.5 : 0) + (pr && pr.side === s && pr.base === cr + k ? -100 : 0);
          if (!best || score < best.score) best = { base: cr + k, side: s, acc, pos, tu: tu0, score };
        }
      }
      if (!best) continue;
      // «мать не названа» у лица коридора (решение 175: отводы — от следа отца): ствол в год до первого ребёнка прошёл
      // бы живые следы лиц коридора между отцом и детьми (Нафан и Соломон — у сыновей Давида, рождённых в Иерусалиме);
      // ствол — раньше их рождений (ступень), дальше — зубцы по строкам детей, где в эти годы пусто
      if (!un.wife && un.kids.length) {
        const far = Math.max(...[...best.pos.values()].map((r) => Math.abs(r))) * best.side + best.base;
        const lo = Math.min(cr, far);
        const hi = Math.max(cr, far);
        const lastKid = Math.max(...un.kids.map(T0));
        let t = best.tu;
        for (const [q, r] of corr) if (r > lo && r < hi && T0(q) <= lastKid && T0(q) > t - GAP) t = Math.min(t, T0(q) - 2);
        best.tu = Math.max(t, T0(c) + 13);
      }
      unitSide.set(key, best.side);
      trunkT.set(key, best.tu);
      merge(occ, best.acc, best.base);
      for (let r = cr + best.side; r !== best.base + best.side; r += best.side) addIv(pass, r, best.tu - 1, best.tu + 1);
      for (const [q, r] of best.pos) rows.set(q, best.base + r);
      blocks.set(key, { base: best.base, side: best.side });
      lastS = best.side;
      inner.set(best.side, Math.min(inner.get(best.side)!, best.tu, ...un.kids.map(T0)));
    }
  }
  // корни вне коридора: на прежнем месте или на ближайшем свободном у оси
  const roots = [...S].filter((id) => !home.get(id) && !corr.has(id)).sort((a, b) => had(b) - had(a) || T0(b) - T0(a) || (ORD.get(a) ?? 0) - (ORD.get(b) ?? 0));
  for (const r of roots) {
    const c = blockOf(r, 1, true);
    const pr = prior?.blocks.get(r);
    let base = pr?.base ?? 0;
    if (!pr || !fits(c, base)) {
      const at = pr?.base ?? 0;
      for (let dd = 0; dd < 4000; dd++) {
        if (fits(c, at + dd)) {
          base = at + dd;
          break;
        }
        if (fits(c, at - dd)) {
          base = at - dd;
          break;
        }
      }
    }
    merge(occ, c, base);
    for (const [q, rr] of rel.get(r)!) rows.set(q, base + rr);
    blocks.set(r, { base, side: 1 });
  }
  // скопления: сетка — блоком, строки сетки сохраняются (верхняя строка — выше), время — прямоугольник сетки
  const byCluster = new Map<string, string[]>();
  for (const [id, c] of clustered) {
    const a = byCluster.get(c.key);
    if (a) a.push(id);
    else byCluster.set(c.key, [id]);
  }
  const clusterKeys = [...byCluster.keys()].sort((a, b) => had(`cl:${b}`) - had(`cl:${a}`) || clustered.get(byCluster.get(b)![0])!.t0 - clustered.get(byCluster.get(a)![0])!.t0);
  for (const key of clusterKeys) {
    const ids = byCluster.get(key)!;
    const c0 = clustered.get(ids[0])!;
    const offs = new Map(ids.map((id) => [id, c0.rows - 1 - clustered.get(id)!.row]));
    const c: Contour = new Map();
    for (const off of new Set(offs.values())) addIv(c, off, c0.t0 - GAP, c0.t1 + Math.max(GAP, REUSE));
    const pr = prior?.blocks.get(`cl:${key}`);
    const at = pr?.base ?? 0;
    let base = at;
    for (let dd = 0; dd < 4000; dd++) {
      if (fits(c, at + dd)) {
        base = at + dd;
        break;
      }
      if (fits(c, at - dd)) {
        base = at - dd;
        break;
      }
    }
    merge(occ, c, base);
    for (const [id, off] of offs) rows.set(id, base + off);
    blocks.set(`cl:${key}`, { base, side: 1 });
  }
  // лица, не попавшие ни в один блок (не должно случаться): отдельной строкой сверху
  let top = Math.max(0, ...rows.values());
  for (const id of S0) if (!rows.has(id)) rows.set(id, ++top);

  // пустые строки убираются
  const used = [...new Set(rows.values())].sort((a, b) => a - b);
  const at = new Map(used.map((r, i) => [r, i]));
  const out = new Map<string, number>();
  for (const [id, r] of rows) out.set(id, at.get(r)!);

  const unitsOut = new Map<string, FamilyUnit[]>();
  for (const [p, us] of units)
    unitsOut.set(
      p,
      us.map((un) => ({ union: un.u, parent: p, wife: un.wife, kids: [...un.kids].sort(kidOrder), side: unitSide.get(un.u.id) ?? 1, trunk: trunkT.get(un.u.id) ?? un.tu })),
    );
  // жена в семье мужа — с года союза (решение 173)
  const since = new Map<string, number>();
  for (const us of units.values())
    for (const un of us) if (un.wife && home.get(un.wife) === un.p) since.set(un.wife, Math.min(since.get(un.wife) ?? Infinity, un.tu));
  return { rows: out, count: used.length, prior: { rows, blocks, sides: unitSide }, units: unitsOut, home, spine, since };
}

/**
 * Коридор: строки лиц линий Мессии из показа лучевым поиском в порядке рождения. Штраф — квадрат отхода от строки
 * прежнего шага своей линии (у лент нет «горба Ламеха»), малый штраф за удаление от оси и за отход от прежней укладки.
 * Ветвь Иосифа — не ниже +1, ветвь Марии — не выше −1, общие лица тяготеют к оси. Места лиц в одной строке
 * не пересекаются.
 */
function corridorRows(S: ReadonlySet<string>, d: FamilyData, spanOf: (id: string) => Iv, prior?: ReadonlyMap<string, number>): Map<string, number> {
  const K = CORRIDOR_K;
  const W = 2 * K + 1;
  const j = d.lines.joseph.filter((id) => S.has(id));
  const m = d.lines.mary.filter((id) => S.has(id));
  const jS = new Set(j);
  const mS = new Set(m);
  const order = [...new Set([...j, ...m])].sort((a, b) => d.t0(a) - d.t0(b));
  // прежний шаг лица в каждой линии: у лица линии это последнее лицо той же линии, уже поставленное (линия идёт от отца
  // к сыну, а порядок — по году рождения), поэтому в состоянии хранится только строка последнего лица каждой линии
  const predJ = new Map<string, boolean>();
  const predM = new Map<string, boolean>();
  for (let i = 1; i < j.length; i++) predJ.set(j[i], true);
  for (let i = 1; i < m.length; i++) predM.set(m[i], true);
  /** состояние луча: цена, строка лица, прежнее состояние (цепочка — для ответа), концы строк, строки последних лиц линий */
  interface St {
    cost: number;
    lane: number;
    prev: St | null;
    ends: Float64Array;
    lastJ: number;
    lastM: number;
  }
  const NONE = -99;
  let beam: St[] = [{ cost: 0, lane: 0, prev: null, ends: new Float64Array(W).fill(-Infinity), lastJ: NONE, lastM: NONE }];
  for (const id of order) {
    const iv = pad(spanOf(id));
    const inJ = jS.has(id);
    const inM = mS.has(id);
    const pr = prior?.get(id);
    const next: St[] = [];
    for (const st of beam)
      for (let lane = -K; lane <= K; lane++) {
        if (inJ && !inM && lane < 1) continue;
        if (inM && !inJ && lane > -1) continue;
        if (st.ends[lane + K] >= iv[0]) continue;
        let cost = st.cost + 0.15 * lane * lane + (inJ && inM ? 0.6 * Math.abs(lane) : 0);
        // штраф за отход от прежнего шага своей линии: у лент нет «горба»
        if (predJ.has(id) && st.lastJ !== NONE) cost += (lane - st.lastJ) ** 2;
        if (predM.has(id) && st.lastM !== NONE && !(predJ.has(id) && st.lastJ === st.lastM)) cost += (lane - st.lastM) ** 2;
        if (pr !== undefined) cost += 4 * (lane - pr) ** 2;
        next.push({ cost, lane, prev: st, ends: st.ends, lastJ: inJ ? lane : st.lastJ, lastM: inM ? lane : st.lastM });
      }
    if (!next.length)
      for (const st of beam) {
        let best = 0;
        for (let li = 0; li < W; li++) if (st.ends[li] < st.ends[best]) best = li;
        next.push({ cost: st.cost + 1000, lane: best - K, prev: st, ends: st.ends, lastJ: inJ ? best - K : st.lastJ, lastM: inM ? best - K : st.lastM });
      }
    next.sort((a, b) => a.cost - b.cost);
    beam = next.slice(0, BEAM);
    // концы строк копируются только у состояний, оставшихся в луче
    for (const st of beam) {
      const e = st.ends.slice();
      e[st.lane + K] = iv[1];
      st.ends = e;
    }
  }
  const out = new Map<string, number>();
  let st: St | null = beam[0] ?? null;
  for (let i = order.length - 1; i >= 0 && st; i--, st = st.prev) out.set(order[i], st.lane);
  for (const id of order) if (!out.has(id)) out.set(id, 0);
  return out;
}
