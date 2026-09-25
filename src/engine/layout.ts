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
 */
import type { Graph } from './graph.ts';
import { fatherOf, motherOf, primaryChildren } from './graph.ts';
import type { ChronoResult } from './chronology.ts';

export interface LineStep {
  id: string;
  refs: string[];
  flag: string;
  mt?: number;
  lk?: number;
  mtGroup?: number;
}

export interface LayoutNode {
  id: string; // для призрака — `ghost:<id>`
  person: string; // настоящий id лица
  lane: number;
  t0: number; // начало следа (рождение, астр.)
  t1: number; // конец рисуемого следа
  block: number;
  ghost: boolean;
  spine: boolean;
  parentLane: number | null; // полоса, откуда идёт отвод (отец или мать по раскладке)
  layoutParent: string | null; // узел-родитель по раскладке
  satelliteOf: string | null; // для жены рядом с мужем
}

export interface BlockInfo {
  id: number;
  root: string;
  group: string;
  attach: string | null; // лицо коридора, к которому прикреплён приток
  side: 1 | -1 | 0;
  laneMin: number;
  laneMax: number;
  t0: number;
  t1: number;
  size: number;
}

export interface LayoutMetrics {
  persons: number;
  lanes: number;
  corridorWidth: number;
  crossings: number;
  corridorCrossings: number;
  dropLength: number;
  blocks: number;
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
const STUB = 30; // рисуемая длина следа, если конец жизни не известен
const GHOST_LEN = 25;

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

// ---------- основной расчёт ----------
export function computeLayout(
  g: Graph,
  chrono: ChronoResult,
  lines: { joseph: LineStep[]; mary: LineStep[] },
  opts: { corridorK?: number; beam?: number } = {},
): LayoutResult {
  const K = opts.corridorK ?? 7;
  const BEAM = opts.beam ?? 64;
  const ch = (id: string) => chrono.persons.get(id)!;

  const span = (id: string): Iv => {
    const c = ch(id);
    let end: number;
    if (c.d !== null) end = c.d;
    else if (c.lastAttested !== null) end = Math.max(c.lastAttested, c.b + 8);
    else end = c.b + STUB;
    if (end < c.b + 4) end = c.b + 4;
    return [c.b, end];
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
  const birth = (nid: string) => nodeSpan(nid)[0];
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
  const contourCache = new Map<string, Contour>();
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
    contourCache.set(nid, own);
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

  // --- 5. притоки
  interface Pending { root: string; attach: string | null; t: number }
  const pending: Pending[] = [];
  for (const id of spine) {
    for (const k of kidsOf.get(id) ?? []) if (!spineSet.has(k)) pending.push({ root: k, attach: id, t: birth(k) });
  }
  for (const id of g.order) {
    if (spineSet.has(id)) continue;
    if (!layoutParent.get(id)) pending.push({ root: id, attach: null, t: birth(id) });
  }
  // сначала прикреплённые, в обратном хронологическом порядке; затем отдельные рода — тоже от поздних к ранним
  pending.sort((a, b) => Number(a.attach === null) - Number(b.attach === null) || b.t - a.t);

  const nodes: LayoutNode[] = [];
  const byNode = new Map<string, LayoutNode>();
  const blocks: BlockInfo[] = [];
  const groupSide = new Map<string, number>(); // сторона, куда уже ставили этот род
  for (const id of spine) {
    const iv = span(id);
    const n: LayoutNode = {
      id, person: id, lane: corridorLane.get(id)!, t0: iv[0], t1: iv[1], block: -1, ghost: false, spine: true,
      parentLane: null, layoutParent: null, satelliteOf: null,
    };
    nodes.push(n);
    byNode.set(id, n);
  }

  for (const pb of pending) {
    const contour = subtree(pb.root);
    const attachLane = pb.attach ? corridorLane.get(pb.attach)! : 0;
    const group = pb.root.startsWith('ghost:') ? g.persons.get(pb.root.slice(6))!.group : g.persons.get(pb.root)!.group;
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
    const { side, base } = best!;
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
      const n: LayoutNode = {
        id: nid, person, lane, t0: iv[0], t1: iv[1], block: blockId, ghost, spine: false,
        parentLane, layoutParent: lp, satelliteOf: !ghost && satelliteOf.has(nid) ? satelliteOf.get(nid)! : null,
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
    place(pb.root, base, pb.attach ? attachLane : null, pb.attach);
    blocks.push({ id: blockId, root: pb.root, group, attach: pb.attach, side, laneMin, laneMax, t0, t1, size });
  }

  // родители коридорных лиц (для отводов внутри коридора)
  for (const id of spine) {
    const n = byNode.get(id)!;
    const f = fatherOf(g, id) ?? motherOf(g, id);
    if (f && byNode.has(f)) { n.parentLane = byNode.get(f)!.lane; n.layoutParent = f; }
  }

  // --- 6. метрики
  // пересечения отводов со следами притоков (коридор пересекается неизбежно и считается отдельно)
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
  const corridorWidth = Math.max(...[...corridorLane.values()].map((l) => Math.abs(l)), 0) * 2 + 1;
  return {
    nodes,
    byPerson: new Map(nodes.filter((n) => !n.ghost).map((n) => [n.person, n])),
    blocks,
    laneMin,
    laneMax,
    metrics: { persons: nodes.filter((n) => !n.ghost).length, lanes: laneMax - laneMin + 1, corridorWidth, crossings, corridorCrossings, dropLength, blocks: blocks.length },
  };
}
