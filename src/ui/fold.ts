/**
 * Шаги карты «набор» (этап 21, решения 197–199): раскрыть шагом вперёд и назад, свернуть потомков, предков и всю карту
 * в одно лицо. Модуль чистый: состояние карты — набор (лицо → откуда взято), раскрытые союзы и лица с показанными ромбами
 * (src/ui/reveal.ts, src/ui/work.ts); функции возвращают новое состояние и ничего не пишут.
 *
 * Правила (решение 198):
 *  — закреплённые лица (помета 'self': начало, найденное поиском, взятое в работу) свёртка не убирает: их убирают явно
 *    («Убрать из набора»). Поэтому «Свернуть потомков Адама» из начала «Адам и Иисус Христос» возвращает начало;
 *  — лицо, у которого сворачивают, всегда остаётся на карте; если оно держалось только на свёрнутом (его раскрыли от
 *    родителя, а свёрнуты предки), оно закрепляется;
 *  — свёртка потомков убирает потомков лица (по отцам и матерям и иным утверждениям текста, без толкований — как у
 *    «с потомками» набора) и супругов лица и его потомков, если у супруга на карте нет своей родни (родителей);
 *  — свёртка предков убирает предков лица;
 *  — после свёртки уходит всё, что больше не связано родством или браком ни с этим лицом, ни с закреплёнными: братья
 *    и сёстры, чьи родители свёрнуты, родня свёрнутой жены. Закреплённое лицо свёрнутой части (Адам при свёртке предков
 *    Каинана) остаётся само, но своей родни из неё (Каина, Авеля) при себе не держит. Остальное остаётся на месте —
 *    свёртка не трогает чужих ветвей;
 *  — раскрытые союзы, у которых ушёл кто-то из лиц, становятся снова свёрнутыми («+N» у ромба).
 *
 * Шаг вперёд (решение 197): у лица один союз — супруг и все дети сразу; союзов несколько — сначала супруги (у каждого
 * ромб своего цвета с «+N»), следующий шаг — все дети. Шаг назад — союз родителей: родители, братья и сёстры.
 */
import type { Graph } from '../engine/graph.ts';
import { membersOf, type Union, type Unions } from '../engine/unions.ts';
import { walk } from '../render/rows.ts';
import type { WorkEntry } from './work.ts';

/** Состояние карты «набор». */
export interface MapState {
  set: ReadonlyMap<string, WorkEntry>;
  /** раскрытые союзы: id союза → лицо, от которого раскрыли */
  expanded: Readonly<Record<string, string>>;
  /** лица, у которых на карте показаны ромбы союзов */
  opened: readonly string[];
}

export interface FoldData {
  graph: Graph;
  unions: Unions;
}

const pinned = (s: MapState, id: string) => s.set.get(id)?.via === 'self';

/** Соседи лица по родству и браку (все утверждения о родителях, кроме толкований — как у свёртки). */
function neighbours(d: FoldData, id: string): string[] {
  const out: string[] = [];
  for (const e of d.graph.parentsOf.get(id) ?? []) if (e.cert !== 'interpretation') out.push(e.parent);
  for (const e of d.graph.childrenOf.get(id) ?? []) if (e.cert !== 'interpretation') out.push(e.child);
  for (const e of d.graph.spousesOf.get(id) ?? []) out.push(e.a === id ? e.b : e.a);
  return out;
}

/** Лица набора, связанные с keep (родством и браком внутри набора). */
function reachable(d: FoldData, ids: ReadonlySet<string>, keep: Iterable<string>): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const k of keep) if (ids.has(k) && !seen.has(k)) {
    seen.add(k);
    queue.push(k);
  }
  for (let i = 0; i < queue.length; i++)
    for (const y of neighbours(d, queue[i]))
      if (ids.has(y) && !seen.has(y)) {
        seen.add(y);
        queue.push(y);
      }
  return seen;
}

/**
 * Новое состояние после того, как из набора ушли gone (у лица id): несвязанные уходят тоже, лицо id и записи, державшиеся
 * на ушедших, перепривязываются, раскрытые союзы с ушедшими лицами сворачиваются, ромбы ушедших и лица id убираются.
 */
function settle(d: FoldData, s: MapState, id: string, gone: Set<string>, anchors: ReadonlySet<string> = new Set()): MapState {
  const left = new Set([...s.set.keys()].filter((x) => !gone.has(x) && !anchors.has(x)));
  left.add(id);
  const keep = [id, ...[...left].filter((x) => pinned(s, x))];
  const conn = reachable(d, left, keep);
  // закреплённые лица свёрнутой части остаются сами по себе, но родню из неё при себе не держат
  for (const a of anchors) conn.add(a);
  const next = new Map<string, WorkEntry>();
  for (const [x, e] of s.set) {
    if (!conn.has(x)) continue;
    if (x === id) next.set(x, e.via === 'self' || conn.has(e.of) || e.of === x ? e : { via: 'self', of: x });
    else next.set(x, conn.has(e.of) || e.via === 'self' ? e : { ...e, of: id });
  }
  if (!next.has(id)) next.set(id, { via: 'self', of: id });
  const expanded: Record<string, string> = {};
  for (const [uid, from] of Object.entries(s.expanded)) {
    const u = d.unions.byId.get(uid);
    if (!u || !next.has(from)) continue;
    if (membersOf(u).every((m) => next.has(m))) expanded[uid] = from;
  }
  return { set: next, expanded, opened: s.opened.filter((x) => x !== id && next.has(x)) };
}

/** Свернуть потомков лица id (решение 198). */
export function foldDescendants(d: FoldData, s: MapState, id: string): MapState {
  const desc = new Set(walk(d.graph, id, 'down', null, { other: true }).keys());
  const gone = new Set<string>();
  const anchors = new Set<string>();
  for (const x of s.set.keys()) if (desc.has(x)) (pinned(s, x) ? anchors : gone).add(x);
  // супруги лица и его потомков — с ними, если своей родни на карте у них нет
  for (const y of [id, ...desc]) {
    if (!s.set.has(y) && y !== id) continue;
    for (const e of d.graph.spousesOf.get(y) ?? []) {
      const z = e.a === y ? e.b : e.a;
      if (!s.set.has(z) || gone.has(z) || z === id || pinned(s, z) || desc.has(z)) continue;
      const kin = (d.graph.parentsOf.get(z) ?? []).some((p) => s.set.has(p.parent) && !gone.has(p.parent));
      if (!kin) gone.add(z);
    }
  }
  return settle(d, s, id, gone, anchors);
}

/** Свернуть предков лица id (решение 198). */
export function foldAncestors(d: FoldData, s: MapState, id: string): MapState {
  const anc = new Set(walk(d.graph, id, 'up', null, { other: true }).keys());
  const gone = new Set<string>();
  const anchors = new Set<string>();
  for (const x of s.set.keys()) if (anc.has(x)) (pinned(s, x) ? anchors : gone).add(x);
  return settle(d, s, id, gone, anchors);
}

/** Свернуть всю карту в лицо id: на карте только оно (решение 198). */
export function foldOnly(id: string): MapState {
  return { set: new Map([[id, { via: 'self', of: id }]]), expanded: {}, opened: [] };
}

/** Есть ли на карте потомки лица или его супруги — есть ли что сворачивать вперёд. */
export function hasShownDescendants(d: FoldData, s: MapState, id: string): boolean {
  if (!s.set.has(id)) return false;
  const desc = walk(d.graph, id, 'down', null, { other: true });
  for (const x of desc.keys()) if (s.set.has(x) && !pinned(s, x)) return true;
  for (const e of d.graph.spousesOf.get(id) ?? []) {
    const z = e.a === id ? e.b : e.a;
    if (s.set.has(z) && !pinned(s, z) && !(d.graph.parentsOf.get(z) ?? []).some((p) => s.set.has(p.parent))) return true;
  }
  return false;
}

/** Есть ли на карте предки лица — есть ли что сворачивать назад. */
export function hasShownAncestors(d: FoldData, s: MapState, id: string): boolean {
  if (!s.set.has(id)) return false;
  for (const x of walk(d.graph, id, 'up', null, { other: true }).keys()) if (s.set.has(x) && !pinned(s, x)) return true;
  return false;
}

/** Супруг лица id в союзе u (другое лицо союза); null — не назван. */
export const partnerOf = (u: Union, id: string): string | null => (u.a === id ? u.b : u.b === id ? u.a : null);

/** Что скрыто впереди лица: супруги и дети его союзов не на карте. */
export function forwardHidden(d: FoldData, s: MapState, id: string): { spouses: string[]; kids: number; unions: Union[] } {
  const unions = d.unions.of.get(id) ?? [];
  const spouses: string[] = [];
  let kids = 0;
  for (const u of unions) {
    const p = partnerOf(u, id);
    if (p && !s.set.has(p) && !spouses.includes(p)) spouses.push(p);
    for (const k of u.kids) if (!s.set.has(k)) kids++;
  }
  return { spouses, kids, unions };
}

/** Что скрыто позади лица: родители, братья и сёстры в его союзах происхождения не на карте. */
export function backHidden(d: FoldData, s: MapState, id: string): number {
  let n = 0;
  for (const u of d.unions.origin.get(id) ?? []) for (const m of membersOf(u)) if (m !== id && !s.set.has(m)) n++;
  return n;
}

export type StepKind = 'union' | 'spouses' | 'kids' | 'parents' | 'none';

/**
 * Шаг вперёд от лица id (решение 197): один союз — он раскрывается целиком; союзов несколько и не все супруги на карте —
 * на карту супруги (помета 'family' от id) и ромбы союзов; иначе — все союзы целиком («Все дети»). Раскрытие союза здесь —
 * только его запись; лица союза добавляет expand (src/ui/reveal.ts, expandUnion), чтобы опора перехода и объявление были
 * те же, что у «+N» ромба.
 */
export function planForward(d: FoldData, s: MapState, id: string): { kind: StepKind; unions: string[]; spouses: string[] } {
  const h = forwardHidden(d, s, id);
  if (!h.spouses.length && !h.kids) return { kind: 'none', unions: [], spouses: [] };
  const open = (u: Union) => membersOf(u).some((m) => !s.set.has(m));
  if (h.unions.length === 1) return { kind: 'union', unions: open(h.unions[0]) ? [h.unions[0].id] : [], spouses: [] };
  if (h.spouses.length) return { kind: 'spouses', unions: [], spouses: h.spouses };
  return { kind: 'kids', unions: h.unions.filter(open).map((u) => u.id), spouses: [] };
}

/** Шаг назад от лица id (решение 197): союзы происхождения, где кто-то не на карте, — целиком. */
export function planBack(d: FoldData, s: MapState, id: string): { kind: StepKind; unions: string[] } {
  const us = (d.unions.origin.get(id) ?? []).filter((u) => membersOf(u).some((m) => m !== id && !s.set.has(m)));
  return us.length ? { kind: 'parents', unions: us.map((u) => u.id) } : { kind: 'none', unions: [] };
}
