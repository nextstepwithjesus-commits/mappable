/**
 * «Отчий дом» (этап 15, решение 173; уточняет решение 95 и ТЗ § 8.3) — раскладка семьи на небе.
 *
 * Дом есть у каждого отца, а если отец не назван — у матери. Стопка дома лежит по обе стороны следа хозяина:
 *  — чем позже начинается пребывание в доме (приход жены, рождение ребёнка), тем ближе к отцу; за женой наружу — её
 *    дети, младший у матери. Поэтому черта брака и отвод к ребёнку в год своего события проходят только по ещё пустым
 *    строкам: внутри дома пересечений нет по построению; чужие следы проверяются по занятости неба;
 *  — лицо рождается в доме, его звезда — у матери. Если жизнь лица идёт в другой полосе (родоначальник колена, жена
 *    в доме мужа), его след переходит туда плавной S-кривой в 5–16 лет, не позже 20 лет и не позже первого события там.
 *    Переход — часть следа лица, а не связь;
 *  — жена приходит в дом мужа в год брака (год до первого ребёнка союза); жена без родной семьи в данных живёт в доме
 *    мужа с рождения;
 *  — призрак остаётся только в двух случаях: жена из далёкого рода (переход пересёк бы больше 6 живых следов или
 *    прошёл больше 30 строк) — призрак в родной семье, звезда у мужа; бездетный брак, когда жена живёт не у этого мужа.
 *
 * Конвейер (computeHouseLayout):
 *  1. раскладка первого прохода (computeLayout) — L1;
 *  2. дома лиц коридора на пустом небе (только коридор) — их строки и уход детей из дома;
 *  3. раскладка заново (computeLayout с opts.pre и opts.cut): дома коридора заняты до притоков, место родоначальника
 *     в полосе его колена — с ухода из дома — L2. Опорные лица держит прежнее априорное условие;
 *  4. все дома: коридора — на свои места из шага 2, остальные — по правилу дома; места L2 — «мягкое занятие» со
 *     штрафом (устойчивость);
 *  5. итог: у лиц узлы L2 с полосой жизни (lane), полосой рождения (starLane) и пребываниями (stays,
 *     src/engine/stays.ts); призраки — только по двум правилам; годы черт брака (unionYears).
 *
 * Всё считается при сборке (tools/build-data.ts); в кадре расчётов нет. Модуль чистый.
 */
import type { Graph } from './graph.ts';
import type { ChronoResult } from './chronology.ts';
import { computeLayout, packSpan, type LayoutNode, type LayoutResult, type LineStep } from './layout.ts';
import { buildUnions, type Union, type Unions } from './unions.ts';
import { laneAt as laneAtNode, starLaneOf, type Stay as NodeStay } from './stays.ts';

/** Пребывание плана: полоса, годы, вид (рождение в доме, жена в доме мужа, своя жизнь, лицо коридора) и чей дом. */
export interface HouseStay {
  lane: number;
  t0: number;
  t1: number;
  kind: 'birth' | 'wife' | 'life' | 'fixed';
  house: string | null;
}
export interface HouseGlide {
  id: string;
  t0: number;
  t1: number;
  from: number;
  to: number;
}
export interface HouseGhost {
  id: string;
  house: string;
  union: string;
  lane: number;
  t: number;
}
export interface HouseUnion {
  union: Union;
  anchor: string;
  wife: string | null;
  /** жена живёт в доме (её след у мужа) — иначе призрак или мать не названа */
  resident: boolean;
  side: 1 | -1;
  /** год черты брака (приход жены); null — черты нет (мать не названа) */
  barT: number | null;
  kids: string[];
  ribbonKids: string[];
}
export interface HousePlan {
  stays: Map<string, HouseStay[]>;
  glides: HouseGlide[];
  ghosts: HouseGhost[];
  unions: Map<string, HouseUnion>;
  starLane: Map<string, number>;
  /** нарушения правил дома: отвод или черта пересекли живой чужой след (дом:лицо:сколько) */
  issues: string[];
  houses: number;
  moved: { id: string; from: number; to: number }[];
  reserved: { lane: number; a: number; b: number }[];
  pins: Map<string, number>;
  cuts: Map<string, number>;
  /** призраки жён в далёкой родной семье (узлы-призраки раскладки) */
  natalGhosts: { id: string; lane: number; t: number }[];
}

/** Входы дома: граф, союзы, хронология модели, линии Мессии. */
export interface HouseInput {
  g: Graph;
  U: Unions;
  chrono: ChronoResult;
  lines: { joseph: LineStep[]; mary: LineStep[] };
}

const GAP = 3;
/** зазор пребываний внутри неба второго прохода, лет (у первого прохода — 3) */
const GAP_H = 1.5;
/** лет в доме до перехода (звезда и имя) */
const C_STAY = 6;
/** переход — не короче стольких лет и не длиннее GLIDE_MAX */
export const GLIDE_MIN = 5;
export const GLIDE_MAX = 16;
/** уход сына из отчего дома — не позже стольких лет от рождения */
export const ADULT = 20;
const GHOST_LEN = 12;
/** место под имя после звезды, лет: следа дальше нет — полоса свободна */
const LABEL_ROOM = 12;
/** родной дом жены дальше стольких строк от мужа — переход не рисуется, в родной семье — призрак */
export const FAR_NATAL = 30;
/** …или переход пересёк бы больше стольких живых чужих следов */
export const FAR_CROSS = 6;
/** полоса жизни ребёнка берётся местом рождения, если отвод к ней чист и не длиннее стольких строк (Г11) */
const LONG_ROWS = 30;
/** цена пересечения живого следа отводом или чертой в полосах сдвига */
const CROSS_W = 6;
/** штраф за чужое место первого прохода (ещё не переставленного лица), в полосах сдвига */
const SOFT_W = 4;
/** полоса первого прохода берётся, если она не дальше стольких полос от лучшей */
const PREF_SLACK = 3;

interface Ent {
  a: number;
  b: number;
  o: string;
  la: number;
  lb: number;
  /** место первого прохода у лица, которое второй проход ставит заново: не занято, но чужому — штраф */
  soft?: boolean;
}
/** Занятость неба по полосам: место (с запасом) и живой (рисуемый) отрезок. */
class Occ {
  m = new Map<number, Ent[]>();
  add(l: number, a: number, b: number, o: string, live?: [number, number]) {
    const e: Ent = { a, b, o, la: live ? live[0] : NaN, lb: live ? live[1] : NaN };
    const arr = this.m.get(l);
    if (arr) arr.push(e);
    else this.m.set(l, [e]);
  }
  remove(o: string) {
    for (const [l, arr] of this.m) {
      const k = arr.filter((e) => e.o !== o);
      if (k.length !== arr.length) this.m.set(l, k);
    }
  }
  free(l: number, a: number, b: number, ignore: string): boolean {
    for (const e of this.m.get(l) ?? []) if (!e.soft && e.o !== ignore && e.a <= b && a <= e.b) return false;
    return true;
  }
  /** сколько чужих мест первого прохода (ещё не переставленных лиц) задевает [a; b] в полосе l */
  soft(l: number, a: number, b: number, self: string): number {
    let c = 0;
    for (const e of this.m.get(l) ?? []) if (e.soft && e.o !== self && e.a <= b && a <= e.b) c++;
    return c;
  }
  soften(o: string) {
    for (const arr of this.m.values()) for (const e of arr) if (e.o === o) e.soft = true;
  }
  removeSoft(o: string) {
    for (const [l, arr] of this.m) {
      const k = arr.filter((e) => !(e.soft && e.o === o));
      if (k.length !== arr.length) this.m.set(l, k);
    }
  }
  /** чей живой след (или звезда) стоит в полосе l в год t; null — никого */
  liveAt(l: number, t: number, ignore: ReadonlySet<string>): string | null {
    for (const e of this.m.get(l) ?? []) if (!e.soft && !ignore.has(e.o) && e.la <= t + 0.5 && t - 0.5 <= e.lb) return e.o;
    return null;
  }
}

/** Год бездетного брака: данных нет — взрослость младшего из супругов, не позже конца жизни обоих. */
const childlessYear = (bh: number, bw: number, eh: number, ew: number) => Math.min(Math.max(bh, bw) + ADULT, eh - 1, ew - 1);

/**
 * План домов поверх раскладки L. only: 'spine' — только дома лиц коридора на пустом небе (шаг 2 конвейера);
 * pin — места шага 2 (дом|лицо → полоса), которые дома коридора сохраняют на шаге 4.
 */
export function planHouses(H: HouseInput, L: LayoutResult, opts: { only?: 'spine'; pin?: ReadonlyMap<string, number>; tooth?: boolean } = {}): HousePlan {
  const { g, U, chrono } = H;
  const ch = (id: string) => chrono.persons.get(id)!;
  const node = new Map<string, LayoutNode>();
  const ghostNode = new Map<string, LayoutNode>();
  for (const n of L.nodes) (n.ghost ? ghostNode : node).set(n.person, n);
  const spine = new Set(L.nodes.filter((n) => n.spine).map((n) => n.person));
  const span = (id: string): [number, number] => packSpan(spine.has(id) ? { ...ch(id), mark: undefined } : ch(id));
  const live = (n: LayoutNode): [number, number] => [n.t0 - 0.5, Math.max(n.t1, n.t0 + 0.5)];
  const end = (id: string) => span(id)[1];
  const b = (id: string) => ch(id).b;

  // ---------- занятость первого прохода ----------
  const occ = new Occ();
  for (const n of L.nodes) {
    if (opts.only === 'spine' && !n.spine) continue;
    if (n.ghost) {
      occ.add(n.lane, n.t0 - GAP, n.t0 + 25 + GAP, `ghost:${n.person}`, [n.t0 - 0.5, n.t0 + 0.5]);
      continue;
    }
    if (n.trail === 'list') continue;
    const s = span(n.person);
    occ.add(n.lane, s[0] - GAP, s[1] + GAP, n.person, live(n));
  }
  for (const bl of L.blocks) {
    if (!bl.cluster || opts.only === 'spine') continue;
    for (let l = bl.laneMin; l <= bl.laneMax; l++) occ.add(l, bl.t0 - GAP, bl.t1 + GAP, `cluster:${bl.id}`);
  }
  // ленты: промежуточные полосы шага (как в layout.ts, шаг 4) — не следы
  const lineIds = (seq: { id: string }[]) => seq.map((s) => s.id).filter((id) => node.has(id));
  for (const seq of [lineIds(H.lines.joseph), lineIds(H.lines.mary)])
    for (let i = 1; i < seq.length; i++) {
      const [a, c] = [node.get(seq[i - 1])!, node.get(seq[i])!];
      for (let l = Math.min(a.lane, c.lane) - 1; l <= Math.max(a.lane, c.lane) + 1; l++) occ.add(l, Math.min(b(a.person), b(c.person)) - GAP, Math.max(b(a.person), b(c.person)) + GAP, 'ribbon');
    }

  // ---------- роли лиц ----------
  const natalUnion = (id: string): Union | null => {
    const u = U.origin.get(id)?.[0];
    return u && !u.claim && (u.a || u.b) ? u : null;
  };
  const anchorOf = (u: Union) => u.a ?? u.b!;
  const ownUnions = (id: string) => (U.of.get(id) ?? []).filter((u) => !u.claim && u.kids.length && (u.a === id || (u.a === null && u.b === id)));
  const wifeUnions = (id: string) => (U.of.get(id) ?? []).filter((u) => !u.claim && u.kids.length && u.b === id && u.a !== null);
  const firstKid = (u: Union) => Math.min(...u.kids.map(b));
  const marriageT = (h: string, w: string) => childlessYear(b(h), b(w), end(h), end(w));

  interface Plan0 { t0: number; t1: number; kind: HouseStay['kind']; house: string | null; lane: number | null; union?: string }
  const plan0 = new Map<string, Plan0[]>();
  /** мать, которая и дочь того же дома (дочери Лота): её дети висят на её следе в доме отца */
  const mergedMother = new Set<string>();
  /** жёны из далёкого рода: их призрак первого прохода остаётся в родной семье */
  const natalGhosts = new Set<string>();
  for (const id of g.order) {
    if (spine.has(id)) {
      const n = node.get(id);
      if (n) plan0.set(id, [{ t0: b(id), t1: end(id), kind: 'fixed', house: null, lane: n.lane }]);
      continue;
    }
    const n = node.get(id);
    if (!n || n.trail === 'list') continue;
    const nu = natalUnion(id);
    const natal = nu ? anchorOf(nu) : null;
    const wives = wifeUnions(id).filter((u) => {
      if (u.a === natal) {
        mergedMother.add(u.id);
        return false;
      }
      return true;
    });
    wives.sort((x, y) => firstKid(x) - firstKid(y));
    const own = ownUnions(id);
    const stays: Plan0[] = [];
    // жена из далёкого рода: в родной семье остаётся её призрак (как в первом проходе), звезда — у мужа; переход —
    // только из близкого родного дома (не дальше FAR_NATAL строк от мужа и не через FAR_CROSS живых чужих следов)
    const gh = ghostNode.get(id);
    const husband = wives[0]?.a ?? null;
    let farNatal = false;
    if (gh && husband && node.has(husband)) {
      const hl = node.get(husband)!.lane;
      const ta = firstKid(wives[0]) - 1;
      let c = 0;
      for (let k = Math.min(gh.lane, hl) + 1; k < Math.max(gh.lane, hl); k++) if (occ.liveAt(k, ta, new Set([id, husband, 'ribbon']))) c++;
      farNatal = c > FAR_CROSS || Math.abs(gh.lane - hl) > FAR_NATAL;
    }
    if (farNatal) natalGhosts.add(id);
    if (natal && node.has(natal) && !farNatal) stays.push({ t0: b(id), t1: NaN, kind: 'birth', house: natal, lane: null });
    for (const u of wives) stays.push({ t0: firstKid(u) - 1, t1: NaN, kind: 'wife', house: u.a!, lane: null, union: u.id });
    // бездетная жена без родной семьи — приходит в дом первого мужа в год брака (Азува у Халева)
    if (!stays.length && g.persons.get(id)!.sex === 'f') {
      const sp = (U.of.get(id) ?? []).find((u) => u.b === id && u.a && !u.claim && node.has(u.a));
      if (sp) stays.push({ t0: marriageT(sp.a!, id), t1: NaN, kind: 'wife', house: sp.a!, lane: null, union: sp.id });
    }
    // своя жизнь: у лица со своим домом (дети), кроме жён — в полосе раскладки; уход из отчего дома — по взрослении
    // (ADULT лет), не позже своего первого союза: переходы идут раньше чужих домов следующего поколения
    if (own.length && !wives.length) {
      // свой дом начинается с первого союза: первый ребёнок или бездетный брак (Исав и Иегудифа)
      const childless = (U.of.get(id) ?? []).filter((u) => !u.claim && !u.kids.length && u.a === id && u.b && node.has(u.b)).map((u) => marriageT(id, u.b!) + 1);
      const first = Math.min(...own.map(firstKid), ...childless);
      const leave = Math.min(first - 2, b(id) + ADULT);
      stays.push({ t0: stays.length ? Math.max(leave, b(id) + C_STAY + GLIDE_MIN) : b(id), t1: NaN, kind: 'life', house: null, lane: n.lane });
    }
    if (!stays.length) continue; // корень без семьи: как в первом проходе
    stays[0].t0 = b(id);
    stays.sort((x, y) => x.t0 - y.t0);
    for (let k = 0; k < stays.length; k++) stays[k].t1 = k + 1 < stays.length ? stays[k + 1].t0 : end(id);
    // слишком короткие пребывания (оценки годов): не короче года
    for (const s of stays) if (s.t1 < s.t0 + 1) s.t1 = s.t0 + 1;
    plan0.set(id, stays);
  }

  // снять с неба всё, что второй проход ставит заново: лица с домом рождения или с пребыванием жены, их призраки
  for (const [id, st] of plan0) {
    if (spine.has(id)) continue;
    if (opts.only === 'spine') continue;
    occ.soften(id);
    if (!natalGhosts.has(id)) occ.remove(`ghost:${id}`);
    for (const s of st) if (s.lane !== null) occ.add(s.lane!, s.t0 - GAP_H, (s.t1 >= end(id) - 0.5 ? Math.max(Math.min(s.t1, Math.max(node.get(id)!.t1, s.t0 + LABEL_ROOM)), s.t0) : s.t1) + GAP_H, id, [s.t0 - 0.5, Math.max(s.t0 + 0.5, Math.min(s.t1, node.get(id)!.t1))]);
  }

  // ---------- дома ----------
  const anchors = new Set<string>();
  for (const u of U.byId.values()) if (!u.claim && u.kids.length && (u.a ?? u.b) && node.has(anchorOf(u)) && (opts.only !== 'spine' || spine.has(anchorOf(u)))) anchors.add(anchorOf(u));
  // дома лиц коридора — первыми (это хребет неба), затем остальные по времени
  const order = [...anchors].sort((x, y) => Number(!spine.has(x)) - Number(!spine.has(y)) || b(x) - b(y));
  /** реестр связей домов: полоса → (год, чья связь) */
  const linkReg = new Map<number, { t: number; o: string }[]>();
  const unionsOut = new Map<string, HouseUnion>();
  /** занятое домами (для второго прохода раскладки: дома коридора — раньше притоков) */
  const reserved: { lane: number; a: number; b: number }[] = [];
  const pins = new Map<string, number>();
  const ghosts: HouseGhost[] = [];
  const issues: string[] = [];
  const stayOf = (id: string, kind: HouseStay['kind'], house: string | null, union?: string) =>
    (plan0.get(id) ?? []).find((s) => s.kind === kind && s.house === house && (union === undefined || s.union === union || s.kind !== 'wife'));
  /** полоса лица в год t по уже известным пребываниям (иначе — полоса первого прохода) */
  const laneAt = (id: string, t: number): number => {
    const st = plan0.get(id);
    if (st) {
      let best: Plan0 | null = null;
      for (const s of st) if (s.lane !== null && s.t0 <= t + 1e-6) best = s;
      if (best) return best.lane!;
      const any = st.find((s) => s.lane !== null);
      if (any) return any.lane!;
    }
    return node.get(id)!.lane;
  };

  /** место пребывания [t0; t1] в полосе: последнее пребывание — до конца рисуемого следа и места под имя */
  const rsv = (id: string, t0: number, t1: number): [number, number] =>
    t1 >= end(id) - 0.5 ? [t0, Math.min(t1, Math.max(node.get(id)?.t1 ?? t0, t0 + LABEL_ROOM))] : [t0, Math.max(t0 + C_STAY, t1 - GLIDE_MIN)];
  /** живой (рисуемый) отрезок пребывания */
  const lv = (id: string, t0: number, t1: number): [number, number] => [t0 - 0.5, Math.min(t1, Math.max(node.get(id)?.t1 ?? t0, t0 + 0.5))];
  for (const A of order) {
    const us = (U.of.get(A) ?? []).filter((u) => !u.claim && (u.a === A || (u.a === null && u.b === A)));
    const withKids = us.filter((u) => u.kids.length);
    if (!withKids.length) continue;
    const t = Math.min(...withKids.map(firstKid));
    const aLane = laneAt(A, t);
    // дом одной матери вне коридора — аккуратное дерево первого прохода (вложенные поддеревья), если его отводы чисты;
    // дом многожёнца и дом лица коридора — стопка по матерям
    const tidy = !spine.has(A) && withKids.length < 2;
    const longRows = tidy ? LONG_ROWS : 8;
    type Slot = { id: string; kind: 'wife' | 'kid' | 'ghost'; ev: number; live: [number, number]; reserve: [number, number]; linkT: number; from: 'anchor' | string; pref: number | null; union: string; fixed?: number };
    interface Group { ev: number; side: 1 | -1; slots: Slot[] }
    const groups: Group[] = [];
    const sideVotes = (ids: string[]) => ids.reduce((s, k) => s + Math.sign((node.get(k)?.lane ?? aLane) - aLane), 0);
    let balance = 0;
    const pickSide = (v: number, fallback: number): 1 | -1 => {
      const s = v !== 0 ? Math.sign(v) : fallback !== 0 ? Math.sign(fallback) : balance <= 0 ? 1 : -1;
      return s > 0 ? 1 : -1;
    };
    /**
     * Сколько живых следов пересекла бы связь в год t от полосы from до ближайшей полосы стороны sd, свободной на
     * [a; b] (оценка до постановки: решение 173, Д3 — при выборе стороны дома важны и переходы, и пересечения).
     */
    const probe = (from: number, a: number, b2: number, t: number, sd: 1 | -1, ignore: ReadonlySet<string>): number => {
      for (let d = 1; d <= 60; d++) {
        const l = from + sd * d;
        if (!occ.free(l, a - GAP, b2 + GAP_H, '')) continue;
        let c = 0;
        for (let k = Math.min(from, l) + 1; k < Math.max(from, l); k++) if (occ.liveAt(k, t, ignore)) c++;
        return c;
      }
      return 0;
    };
    /** Разность пересечений сторон: X(−1) − X(+1) (больше нуля — сторона +1 чище). */
    const crossVote = (xs: { from: number; a: number; b: number; t: number }[], ignore: ReadonlySet<string>) =>
      xs.reduce((q, x) => q + probe(x.from, x.a, x.b, x.t, -1, ignore) - probe(x.from, x.a, x.b, x.t, 1, ignore), 0);
    /**
     * Ребёнок дома. Его строка свободна от чужих следов на всём пути зубца — от ствола до звезды (решение 175: дети
     * одной матери ближе 40 px — на одном стволе, первое гнездо — на колонне союза): у названной матери место — с года
     * черты брака, а не с рождения (у «мать не названа» отводы — от следа отца каждый в свой год).
     */
    const kidSlot = (k: string, u: Union, from: 'anchor' | string): Slot | null => {
      const st = stayOf(k, 'birth', A);
      if (!st) return null;
      const r = rsv(k, b(k), st.t1);
      // путь зубца — ровно с года черты (запас GAP у места ребёнка — с рождения, как прежде)
      const tooth = from === 'anchor' || !opts.tooth ? b(k) : Math.min(b(k), firstKid(u) - 1 + GAP);
      return { id: k, kind: 'kid', ev: b(k), live: lv(k, b(k), r[1]), reserve: [tooth, r[1]], linkT: b(k), from, pref: node.get(k)?.lane ?? null, union: u.id };
    };
    for (const u of us) {
      const W = u.a === A ? u.b : null;
      const ribbonKids = u.kids.filter((k) => spine.has(k));
      const plain = u.kids.filter((k) => !spine.has(k));
      const merged = mergedMother.has(u.id);
      const wst = W && !merged ? stayOf(W, 'wife', A, u.id) : undefined;
      const fixedWife = W && spine.has(W) ? node.get(W)!.lane : undefined;
      const hu: HouseUnion = { union: u, anchor: A, wife: W, resident: !!wst || fixedWife !== undefined || merged, side: 1, barT: null, kids: plain, ribbonKids };
      unionsOut.set(u.id, hu);
      if (!u.kids.length) {
        // бездетный брак: жена живёт в этом доме (с рождения) — слот жены; иначе призрак у мужа
        if (!W || !node.has(W)) continue;
        const m = marriageT(A, W);
        if (wst) {
          const side = pickSide(Math.sign((node.get(W)?.lane ?? aLane) - aLane), 0);
          hu.side = side;
          hu.barT = m;
          groups.push({ ev: wst.t0, side, slots: [{ id: W, kind: 'wife', ev: wst.t0, live: lv(W, wst.t0, wst.t1), reserve: rsv(W, wst.t0, wst.t1), linkT: m, from: 'anchor', pref: node.get(W)?.lane ?? null, union: u.id }] });
        } else {
          hu.barT = m;
          const side = pickSide(Math.sign(laneAt(W, m) - aLane), 0);
          hu.side = side;
          groups.push({ ev: m, side, slots: [{ id: W, kind: 'ghost', ev: m, live: [m - 0.5, m + 0.5], reserve: [m, m + GHOST_LEN], linkT: m, from: 'anchor', pref: null, union: u.id }] });
        }
        balance += hu.side;
        continue;
      }
      if (W && (wst || fixedWife !== undefined)) {
        // сторона — та, где короче переходы: детей к полосам их жизни и жены из родного дома (приходит переходом —
        // откуда; живёт в доме с рождения — неважно)
        const glidesIn = !!wst && wst.t0 > b(W) + 0.01;
        const from0 = glidesIn ? laneAt(W, wst!.t0 - 1) : aLane;
        const lenAt = (sd: number) => plain.reduce((q, k, i) => q + Math.abs((node.get(k)?.lane ?? aLane) - (aLane + sd * (2 + i))), 0) + 2 * Math.abs(from0 - (aLane + sd));
        // и пересечения: черта брака в год прихода не через живые следы (царица-мать у царя в коридоре: Наама у Соломона)
        const barX = wst ? crossVote([{ from: aLane, a: wst.t0, b: Math.min(wst.t1, wst.t0 + LABEL_ROOM), t: firstKid(u) - 1 }], new Set([A, W, 'ribbon'])) : 0;
        const vote = lenAt(-1) - lenAt(1) + CROSS_W * barX;
        const side = pickSide(vote, (node.get(W)?.lane ?? aLane) - aLane);
        hu.side = side;
        hu.barT = firstKid(u) - 1;
        const slots: Slot[] = [];
        if (fixedWife !== undefined) slots.push({ id: W, kind: 'wife', ev: b(W), live: [b(W), end(W)], reserve: [b(W), end(W)], linkT: hu.barT, from: 'anchor', pref: fixedWife, union: u.id, fixed: fixedWife });
        else slots.push({ id: W, kind: 'wife', ev: wst!.t0, live: lv(W, wst!.t0, wst!.t1), reserve: rsv(W, wst!.t0, wst!.t1), linkT: hu.barT, from: 'anchor', pref: node.get(W)?.lane ?? null, union: u.id });
        const ks = plain.map((k) => kidSlot(k, u, W)).filter((x): x is Slot => !!x).sort((x, y) => y.ev - x.ev);
        groups.push({ ev: slots[0].ev, side, slots: [...slots, ...ks] });
        balance += side;
      } else {
        // мать не названа (или она — дочь того же дома): дети прямо у следа отца (или у её следа в доме)
        if (merged && W) hu.barT = firstKid(u) - 1;
        const from = merged && W ? W : 'anchor';
        const ks = plain.map((k) => kidSlot(k, u, from)).filter((x): x is Slot => !!x);
        // и пересечения: отводы от следа отца в годы рождений не через живые следы (дом Фарры — не через коридор)
        const kidX = merged ? 0 : crossVote(plain.map((k) => ({ from: aLane, a: b(k), b: b(k) + C_STAY, t: b(k) })), new Set([A, ...plain, 'ribbon']));
        const vote = 3 * ribbonKids.reduce((q, k) => q + Math.sign(node.get(k)!.lane - aLane), 0) + (merged && W ? 4 * Math.sign(laneAt(W, t) - aLane) : sideVotes(plain)) + CROSS_W * kidX;
        const side = pickSide(vote, 0);
        hu.side = side;
        // дети без названной матери — каждый своей связью от следа отца; группой на одной стороне
        for (const s of ks) groups.push({ ev: s.ev, side, slots: [s] });
        if (ks.length) balance += side;
      }
    }
    // постановка: от позднего события к раннему. Каждое — в ближайшую полосу своей стороны (ребёнок — за матерью), где
    // место свободно на всё пребывание, своя связь в год события не пересекает живых следов, а уже поставленные связи
    // (этого дома и прежних) не пересекают его след. Так позднее встаёт ближе, а раннее — дальше или в полосу, которая
    // освободится до позднего события (полосы переиспользуются по времени)
    const placed = new Map<string, number>();
    // порядок — по году своей связи (черта брака, рождение): позже связь — ближе к отцу
    const gs = [...groups].sort((x, y) => y.slots[0].linkT - x.slots[0].linkT || y.ev - x.ev);
    /** цена полосы l для слота s (связь от fromLane): пересечённые живые следы и поставленные связи, удаление */
    const slotCost = (s: Slot, fromLane: number, l: number, extra: ReadonlyMap<number, number[]> | null) => {
      const ignore = new Set([s.id, A, ...(s.from !== 'anchor' ? [s.from] : []), 'ribbon']);
      let c = 0;
      for (let k = Math.min(fromLane, l) + 1; k < Math.max(fromLane, l); k++) if (occ.liveAt(k, s.linkT, ignore)) c++;
      for (const e of linkReg.get(l) ?? []) if (e.t >= s.live[0] && e.t <= s.live[1] && e.o !== s.id) c++;
      for (const tt of extra?.get(l) ?? []) if (tt >= s.live[0] && tt <= s.live[1]) c++;
      const soft = occ.soft(l, s.reserve[0] - GAP, s.reserve[1] + GAP_H, s.id);
      return { x: c, cost: CROSS_W * c + Math.abs(l - fromLane) + SOFT_W * soft };
    };
    const okFree = (s: Slot, l: number) => occ.free(l, s.reserve[0] - GAP, s.reserve[1] + GAP_H, s.id);
    /** дети матери: ближе к ней младший, каждый — в ближайшую свободную полосу дальше предыдущего */
    const kidsFrom = (q: Group, wl: number, kids: Slot[]) => {
      const out: { s: Slot; l: number; x: number }[] = [];
      const extra = new Map<number, number[]>();
      let cur = wl;
      let cost = 0;
      for (const s of kids) {
        let best: { l: number; x: number; cost: number } | null = null;
        if (tidy && s.pref !== null && (s.pref - cur) * q.side > 0 && okFree(s, s.pref)) {
          const c = slotCost(s, wl, s.pref, extra);
          if (c.x === 0 && Math.abs(s.pref - wl) <= longRows) best = { l: s.pref, x: 0, cost: c.cost };
        }
        for (let d = 1; d <= 60 && !(best && tidy && best.l === s.pref); d++) {
          const l = cur + q.side * d;
          if (best && d > best.cost) break;
          if (!okFree(s, l)) continue;
          const c = slotCost(s, wl, l, extra);
          if (!best || c.cost < best.cost) best = { l, x: c.x, cost: c.cost };
        }
        if (!best) return null;
        out.push({ s, l: best.l, x: best.x });
        cost += best.cost;
        // своя связь (отвод матери) — для следующих братьев
        for (let k = Math.min(wl, best.l) + 1; k < Math.max(wl, best.l); k++) (extra.get(k) ?? extra.set(k, []).get(k)!).push(s.linkT);
        cur = best.l;
      }
      return { out, cost };
    };
    const commit = (s: Slot, l: number, fromLane: number, x: number) => {
      if (x) issues.push(`${A}:${s.id}:${x}`);
      if (s.kind !== 'ghost') occ.removeSoft(s.id);
      placed.set(s.id, l);
      pins.set(`${A}|${s.id}`, l);
      reserved.push({ lane: l, a: s.reserve[0] - GAP, b: s.reserve[1] + GAP_H });
      for (let k = Math.min(fromLane, l) + 1; k < Math.max(fromLane, l); k++) (linkReg.get(k) ?? linkReg.set(k, []).get(k)!).push({ t: s.linkT, o: s.id });
      if (s.kind === 'ghost') {
        ghosts.push({ id: s.id, house: A, union: s.union, lane: l, t: s.ev });
        occ.add(l, s.reserve[0] - GAP, s.reserve[1] + GAP_H, `ghost:${s.id}@${A}`, s.live);
      } else {
        occ.add(l, s.reserve[0] - GAP, s.reserve[1] + GAP_H, s.id, s.live);
        const st = s.kind === 'wife' ? stayOf(s.id, 'wife', A, s.union) : stayOf(s.id, 'birth', A);
        if (st) st.lane = l;
      }
    };
    /** блок семьи: строки между матерью и дальним ребёнком на время рождений — не для чужих */
    const reserveSpan = (head: Slot, wl: number, kids: { s: Slot; l: number }[]) => {
      if (!kids.length) return;
      const lanes = [wl, ...kids.map((k) => k.l)];
      const lo = Math.min(...lanes);
      const hi = Math.max(...lanes);
      const t0 = head.linkT;
      const t1 = Math.max(...kids.map((k) => k.s.linkT)) + 1;
      for (let l = lo + 1; l < hi; l++) if (!lanes.includes(l)) {
        occ.add(l, t0, t1, `span:${head.union}`);
        reserved.push({ lane: l, a: t0, b: t1 });
      }
    };
    for (const q of gs) {
      const head = q.slots[0];
      if (head.fixed !== undefined) {
        placed.set(head.id, head.fixed);
        const r = kidsFrom(q, head.fixed, q.slots.slice(1));
        if (r) for (const k of r.out) commit(k.s, k.l, head.fixed, k.x);
        continue;
      }
      if (head.kind !== 'wife') {
        // ребёнок без названной матери, призрак: от следа отца (или матери-дочери дома) — в ближайшую полосу
        const fromLane = head.from === 'anchor' ? aLane : (placed.get(head.from) ?? laneAt(head.from, head.linkT));
        const pinS = opts.pin?.get(`${A}|${head.id}`);
        if (pinS !== undefined && okFree(head, pinS)) {
          commit(head, pinS, fromLane, 0);
          continue;
        }
        let best: { l: number; x: number; cost: number } | null = null;
        for (let d = 1; d <= 90; d++) {
          const l = fromLane + q.side * d;
          if (best && d > best.cost) break;
          if (!okFree(head, l)) continue;
          const c = slotCost(head, fromLane, l, null);
          if (!best || c.cost < best.cost) best = { l, x: c.x, cost: c.cost };
        }
        if (head.pref !== null && (head.pref - fromLane) * q.side > 0 && okFree(head, head.pref)) {
          const c = slotCost(head, fromLane, head.pref, null);
          if ((c.x === 0 && Math.abs(head.pref - fromLane) <= longRows) || (best && c.cost <= best.cost + PREF_SLACK)) best = { l: head.pref, x: c.x, cost: c.cost };
        }
        if (!best) for (let d = 91; !best && d <= 400; d++) if (okFree(head, fromLane + q.side * d)) best = { l: fromLane + q.side * d, x: 0, cost: 0 };
        commit(head, best!.l, fromLane, best!.x);
        continue;
      }
      // жена и её дети — одним блоком: перебор полосы жены (сначала её прежняя), дети — следом наружу
      const kids = q.slots.slice(1);
      let best: { wl: number; wx: number; total: number; kids: { s: Slot; l: number; x: number }[] } | null = null;
      const cands: number[] = [];
      const pinW = opts.pin?.get(`${A}|${head.id}`);
      if (pinW !== undefined && okFree(head, pinW)) {
        // закреплено шагом 2 (дома коридора): дети — тоже на свои места
        const ks = kids.map((k) => ({ s: k, l: opts.pin!.get(`${A}|${k.id}`) }));
        if (ks.every((k) => k.l !== undefined && okFree(k.s, k.l))) {
          commit(head, pinW, aLane, 0);
          for (const k of ks) commit(k.s, k.l!, pinW, 0);
          reserveSpan(head, pinW, ks.map((k) => ({ s: k.s, l: k.l! })));
          continue;
        }
      }
      if (head.pref !== null && (head.pref - aLane) * q.side > 0) cands.push(head.pref);
      for (let d = 1; d <= 70; d++) cands.push(aLane + q.side * d);
      for (const wl of cands) {
        if (best && Math.abs(wl - aLane) > best.total) break;
        if (!okFree(head, wl)) continue;
        const w = slotCost(head, aLane, wl, null);
        const r = kidsFrom(q, wl, kids);
        if (!r) continue;
        const far = r.out.length ? Math.abs(r.out[r.out.length - 1].l - wl) : 0;
        // лишние строки внутри блока — чужие следы между матерью и детьми
        const total = w.cost + r.cost + 2 * Math.max(0, far - r.out.length) - (wl === head.pref ? PREF_SLACK : 0);
        if (!best || total < best.total) best = { wl, wx: w.x, total, kids: r.out };
      }
      if (!best) {
        for (let d = 71; !best && d <= 400; d++) if (okFree(head, aLane + q.side * d)) best = { wl: aLane + q.side * d, wx: 0, total: 0, kids: kidsFrom(q, aLane + q.side * d, kids)?.out ?? [] };
      }
      commit(head, best!.wl, aLane, best!.wx);
      for (const k of best!.kids) commit(k.s, k.l, best!.wl, k.x);
      reserveSpan(head, best!.wl, best!.kids);
    }
  }

  // ---------- бездетные браки мужей без своего дома (Ир и Онан с Фамарью; Урия с Вирсавией) ----------
  // жена живёт не у него: у его следа — её призрак (полый знак), черта брака к нему. Её след рядом (не дальше двух
  // строк, ничего живого между) — черта прямо к её следу, без призрака
  if (opts.only !== 'spine')
    for (const u of U.byId.values()) {
      if (u.claim || u.kids.length || !u.a || !u.b || unionsOut.has(u.id)) continue;
      if (!node.has(u.a) || !node.has(u.b) || spine.has(u.b)) continue;
      const m = marriageT(u.a, u.b);
      const hl = laneAt(u.a, m);
      const wl = laneAt(u.b, m);
      const between = (lo: number, hi: number) => {
        let c = 0;
        for (let k = lo + 1; k < hi; k++) if (occ.liveAt(k, m, new Set([u.a!, u.b!, 'ribbon']))) c++;
        return c;
      };
      const hu: HouseUnion = { union: u, anchor: u.a, wife: u.b, resident: false, side: wl > hl ? 1 : -1, barT: m, kids: [], ribbonKids: [] };
      if (Math.abs(wl - hl) <= 2 && between(Math.min(wl, hl), Math.max(wl, hl)) === 0) {
        hu.resident = true;
        unionsOut.set(u.id, hu);
        continue;
      }
      const side: 1 | -1 = wl > hl ? 1 : -1;
      let gl: number | null = null;
      for (const sd of [side, -side as 1 | -1])
        for (let d = 1; d <= 6 && gl === null; d++) if (occ.free(hl + sd * d, m - GAP_H, m + GHOST_LEN + GAP_H, '') && between(Math.min(hl, hl + sd * d), Math.max(hl, hl + sd * d)) === 0) gl = hl + sd * d;
      if (gl === null) continue;
      occ.add(gl, m - GAP_H, m + GHOST_LEN + GAP_H, `ghost:${u.b}@${u.a}`, [m - 0.5, m + 0.5]);
      ghosts.push({ id: u.b, house: u.a, union: u.id, lane: gl, t: m });
      hu.side = gl > hl ? 1 : -1;
      unionsOut.set(u.id, hu);
    }

  // ---------- пребывания, переходы ----------
  const stays = new Map<string, HouseStay[]>();
  const glides: HouseGlide[] = [];
  const starLane = new Map<string, number>();
  const moved: { id: string; from: number; to: number }[] = [];
  for (const [id, st] of plan0) {
    const out: HouseStay[] = [];
    for (const s of st) {
      const lane = s.lane ?? node.get(id)!.lane;
      const prev = out[out.length - 1];
      if (prev && prev.lane === lane) {
        prev.t1 = s.t1;
        continue;
      }
      out.push({ lane, t0: s.t0, t1: s.t1, kind: s.kind, house: s.house });
    }
    for (let k = 1; k < out.length; k++) {
      const p = out[k - 1];
      const q = out[k];
      const dist = Math.abs(q.lane - p.lane);
      // переход 5–16 лет: тем шире, чем дальше; кончается в год прихода (не позже первого события там)
      const dur = Math.max(GLIDE_MIN, Math.min(GLIDE_MAX, 4 + 0.35 * dist));
      let g0 = Math.max(p.t0 + C_STAY, q.t0 - dur);
      if (q.t0 - g0 < 2) g0 = Math.max(p.t0 + 0.5, q.t0 - 2);
      p.t1 = g0;
      glides.push({ id, t0: g0, t1: q.t0, from: p.lane, to: q.lane });
    }
    stays.set(id, out);
    starLane.set(id, out[0].lane);
    const n = node.get(id);
    if (n && out[0].lane !== n.lane) moved.push({ id, from: n.lane, to: out[0].lane });
  }
  for (const [u, hu] of unionsOut) if (!hu.union.kids.length && !ghosts.some((q) => q.union === u) && !hu.resident) unionsOut.delete(u);
  // уход из дома: с этого года нужна полоса жизни раскладки (Infinity — не нужна: лицо живёт в доме)
  const cuts = new Map<string, number>();
  for (const hu of unionsOut.values()) {
    for (const k of hu.kids) {
      const st = stays.get(k);
      if (!st) continue;
      const life = st.find((q) => q.kind === 'life');
      cuts.set(k, life ? Math.min(...glides.filter((q) => q.id === k).map((q) => q.t0), life.t0) : Infinity);
    }
    if (hu.wife && hu.resident && !spine.has(hu.wife) && stays.get(hu.wife)?.every((q) => q.kind !== 'life')) cuts.set(hu.wife, Infinity);
  }
  return {
    reserved, pins, cuts, stays, glides, ghosts, unions: unionsOut, starLane, issues, houses: order.length, moved,
    natalGhosts: [...natalGhosts].filter((id) => ghostNode.has(id)).map((id) => ({ id, lane: ghostNode.get(id)!.lane, t: ghostNode.get(id)!.t0 })),
  };
}

// ---------- итог: раскладка с домами ----------

export type LayoutOptions = NonNullable<Parameters<typeof computeLayout>[3]>;

/** Раскладка с домами: узлы с пребываниями, годы черт брака, сводка плана. */
export interface HouseLayout extends LayoutResult {
  /** id союза → год черты брака (астр., целый) — тот же, что у плана дома (engine/stays.ts, unionYear) */
  unionYears: Map<string, number>;
  /** план дома (для проверок и отчёта) */
  plan: HousePlan;
  /** время расчёта, мс: первый проход, дома коридора и второй проход, все дома */
  ms: { first: number; second: number; houses: number };
}

/**
 * Конвейер «Отчего дома» (решение 173): первый проход раскладки, дома лиц коридора, второй проход раскладки
 * (opts.pre, opts.cut), все дома и итог (applyHouses).
 */
export function computeHouseLayout(g: Graph, chrono: ChronoResult, lines: { joseph: LineStep[]; mary: LineStep[] }, opts: LayoutOptions = {}): HouseLayout {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const T0 = now();
  const H: HouseInput = { g, U: buildUnions(g), chrono, lines };
  const L1 = computeLayout(g, chrono, lines, opts);
  const T1 = now();
  const P0 = planHouses(H, L1, { only: 'spine' });
  const L2 = computeLayout(g, chrono, lines, { ...opts, pre: P0.reserved, cut: P0.cuts });
  const T2 = now();
  // путь зубца (строка ребёнка свободна от черты брака матери до звезды) — в итоговом плане: дома коридора остаются на
  // местах шага 2, а чужие дома обходят зубцы
  const P = planHouses(H, L2, { pin: P0.pins, tooth: true });
  const out = applyHouses(H, L2, P);
  return { ...out, ms: { first: T1 - T0, second: T2 - T1, houses: now() - T2 } };
}

/**
 * id узла-призрака: в родной семье — «ghost:<лицо>», у мужа (бездетный брак, жена живёт не у него) —
 * «ghost:<лицо>@<муж>».
 */
export const ghostId = (person: string, husband?: string | null) => (husband ? `ghost:${person}@${husband}` : `ghost:${person}`);

/** Целый год: пребывания и переходы в индексе неба — целыми годами (tools/build-data.ts). */
const yr = (x: number) => Math.round(x);

/**
 * План — в узлы раскладки: полоса жизни (последнее пребывание), полоса рождения, пребывания с целыми годами;
 * призраки — только по двум правилам 173 (далёкая родная семья, бездетный брак у мужа, у которого жена не живёт);
 * полоса родителя — где его след в год рождения ребёнка; годы черт брака.
 */
export function applyHouses(H: HouseInput, L: LayoutResult, P: HousePlan): Omit<HouseLayout, 'ms'> {
  const { chrono } = H;
  const keepGhost = new Set(P.natalGhosts.map((q) => q.id));
  const nodes: LayoutNode[] = [];
  for (const n0 of L.nodes) {
    if (n0.ghost) {
      if (keepGhost.has(n0.person)) nodes.push({ ...n0 });
      continue;
    }
    const n: LayoutNode = { ...n0 };
    const st = P.stays.get(n.person);
    if (st && !n.spine) {
      // целые годы; переход не короче года (после округления), пребывание — не короче нуля
      const out: NodeStay[] = st.map((s) => ({ lane: s.lane, t0: yr(s.t0), t1: yr(s.t1) }));
      for (let k = 1; k < out.length; k++) {
        if (out[k].t0 <= out[k - 1].t1) out[k - 1].t1 = out[k].t0 - 1;
        if (out[k - 1].t1 < out[k - 1].t0) out[k - 1].t0 = out[k - 1].t1;
      }
      // последнее пребывание — до конца рисуемого следа (как его восстанавливает src/data/atlas.ts)
      const last = out[out.length - 1];
      last.t1 = Math.max(yr(n.t1), last.t0);
      // первое — с рождения по хронологии (у знака у первого свидетельства t0 узла — позже)
      out[0].t0 = yr(chrono.persons.get(n.person)?.b ?? n.t0);
      n.lane = last.lane;
      if (out.length > 1) {
        n.starLane = out[0].lane;
        n.stays = out;
      }
      // жена в доме мужа с рождения (Д7, далёкий род): год прихода — год её первой черты брака в этом доме
      if (st[0].kind === 'wife' && st[0].house) {
        const ys = [...P.unions.values()].filter((u) => u.anchor === st[0].house && u.wife === n.person && u.resident && u.barT !== null).map((u) => u.barT!);
        if (ys.length) n.wed = yr(Math.min(...ys));
      }
    }
    nodes.push(n);
  }
  const byPerson = new Map(nodes.filter((n) => !n.ghost).map((n) => [n.person, n]));
  // призраки бездетных браков — у мужа (решение 173): id «ghost:<лицо>@<муж>» (у Мелхолы их два — у Давида и у
  // Фалтия), satelliteOf — муж; призрак в родной семье — прежний «ghost:<лицо>» без satelliteOf
  for (const gh of P.ghosts) {
    const h = byPerson.get(gh.house);
    if (!h) continue;
    nodes.push({
      id: ghostId(gh.id, gh.house), person: gh.id, lane: gh.lane, t0: yr(gh.t), t1: yr(gh.t), block: h.block, ghost: true, spine: false,
      parentLane: Math.round(laneAtNode(h, gh.t)), layoutParent: gh.house, satelliteOf: gh.house, trail: 'ghost',
    });
  }
  // полоса родителя — где его след в год рождения ребёнка (отвод по раскладке)
  for (const n of nodes) {
    if (n.parentLane === null || !n.layoutParent) continue;
    const p = byPerson.get(n.layoutParent);
    if (!p) continue;
    const t = n.ghost ? n.t0 : (chrono.persons.get(n.person)?.b ?? n.t0);
    n.parentLane = Math.round(laneAtNode(p, t));
  }
  // годы черт брака: оба супруга на небе, у союза есть черта (жена в доме, призрак, черта к её следу рядом)
  const unionYears = new Map<string, number>();
  for (const [uid, hu] of P.unions) {
    const u = hu.union;
    if (!u.a || !u.b || !byPerson.has(u.a) || !byPerson.has(u.b)) continue;
    const t = hu.barT ?? (u.kids.length ? Math.min(...u.kids.map((k) => chrono.persons.get(k)!.b)) - 1 : null);
    if (t !== null && Number.isFinite(t)) unionYears.set(uid, yr(t));
  }
  let laneMin = L.laneMin;
  let laneMax = L.laneMax;
  for (const n of nodes) {
    for (const l of [n.lane, ...(n.stays ?? []).map((s) => s.lane)]) {
      laneMin = Math.min(laneMin, l);
      laneMax = Math.max(laneMax, l);
    }
  }
  const metrics = { ...L.metrics, lanes: laneMax - laneMin + 1, ...houseMetrics(H, nodes, byPerson), glides: P.glides.length, ghosts: nodes.filter((n) => n.ghost).length };
  return { ...L, nodes, byPerson, laneMin, laneMax, metrics, unionYears, plan: P };
}

/**
 * Связи семьи на небе с домами: от следа матери (не названа или не на небе — отца) в год рождения к звезде ребёнка
 * (у жены из далёкого рода — к её призраку в родной семье). Дети-лица коридора — шаги лент, не связи. Пересечения — живые
 * (рисуемые) чужие следы в промежуточных строках в год рождения: следы лиц коридора — corridorCrossings, остальные —
 * crossings.
 */
export function houseMetrics(H: HouseInput, nodes: readonly LayoutNode[], byPerson: ReadonlyMap<string, LayoutNode>) {
  const { U, chrono } = H;
  const live = new Map<number, { a: number; b: number; id: string; spine: boolean }[]>();
  const add = (lane: number, a: number, b: number, id: string, spine: boolean) => (live.get(lane) ?? live.set(lane, []).get(lane)!).push({ a, b, id, spine });
  for (const n of nodes) {
    if (n.ghost || n.trail === 'list') continue;
    const drawn = Math.max(n.t1, n.t0 + 0.5);
    if (!n.stays) add(n.lane, n.t0 - 0.5, drawn, n.person, n.spine);
    else for (const s of n.stays) if (s.t0 < drawn) add(s.lane, Math.max(s.t0, n.t0) - 0.5, Math.min(s.t1, drawn), n.person, n.spine);
  }
  const natalGhost = new Map(nodes.filter((n) => n.ghost && !n.satelliteOf).map((n) => [n.person, n]));
  let links = 0;
  let links8 = 0;
  let linkMax = 0;
  let crossings = 0;
  let corridorCrossings = 0;
  let dropLength = 0;
  for (const u of U.byId.values()) {
    if (u.claim || !u.kids.length) continue;
    const src = (u.b && byPerson.get(u.b)) || (u.a && byPerson.get(u.a)) || null;
    if (!src) continue;
    for (const k of u.kids) {
      const kn = byPerson.get(k);
      if (!kn || kn.spine || kn.trail === 'list') continue;
      const tb = chrono.persons.get(k)?.b ?? kn.t0;
      const from = Math.round(laneAtNode(src, tb));
      const to = natalGhost.get(k)?.lane ?? starLaneOf(kn);
      const d = Math.abs(to - from);
      links++;
      if (d > 8) links8++;
      linkMax = Math.max(linkMax, d);
      dropLength += d;
      for (let l = Math.min(from, to) + 1; l < Math.max(from, to); l++)
        for (const e of live.get(l) ?? []) {
          if (e.id === k || e.id === u.a || e.id === u.b || !(e.a <= tb && tb <= e.b)) continue;
          if (e.spine) corridorCrossings++;
          else crossings++;
        }
    }
  }
  return { links, links8, linkMax, crossings, corridorCrossings, dropLength };
}
