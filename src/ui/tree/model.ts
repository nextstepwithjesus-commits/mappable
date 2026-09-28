/**
 * Древо карточек (решение 73): что показывает древо и что делают команды карточек.
 *
 *  — Раскладка — src/engine/tree.ts по состоянию раскрытия src/ui/reveal.ts (рабочий набор, opened, expanded): древо
 *    и небо «набор» держат одно состояние.
 *  — «Другие дети» (Быт 5:4 и др.): у раскрытого союза, чей отец «родил сынов и дочерей» (card.childrenNote), под
 *    детьми — пунктирная карточка «Другие сыновья и дочери: имена не названы». В раскладку она входит условным
 *    ребёнком союза (othersId), поэтому встаёт последней в столбце детей без наложений. Мать этих детей текст не
 *    называет — связь к ней пунктиром, на карточке — «мать не названа», если у союза названа жена.
 *  — Команды лица: «Продолжить ветвь» — его союзы (openPerson), «Свернуть ветвь» — свернуть раскрытые от него союзы
 *    и убрать их карточки; «Родители» — союз происхождения с родителями (без братьев и сестёр: они — «Раскрыть
 *    остальных детей»), «Скрыть родителей» — убрать их и всё, что раскрыто от них.
 *  — Подсветка выбранного (решение 69): потомки на древе — цветом ветви (branchMapOf), бледнее по поколениям; путь к
 *    предкам — мягкое светлое свечение; остальное гаснет.
 *  — Ленты: связь родителя и ребёнка, идущих подряд в линии Мф 1 или Лк 3 (data/lines), — золотая и лазурная нити.
 */
import { batch, computed, signal } from '@preact/signals';
import { byId, lines, loadCard, loadedCard, loadedChrono } from '../../data/atlas.ts';
import type { Fact } from '../../data/types.ts';
import { layoutTree, personKey, shownUnions, type TreeInput, type TreeLayout, type TreeNode } from '../../engine/tree.ts';
import type { Union, Unions } from '../../engine/unions.ts';
import { model, selected } from '../../state.ts';
import { collapseUnion, closePerson, expanded, expandUnion, opened, openPerson, originOf, unions, unionsOf } from '../reveal.ts';
import { linkSet, shownSet, workSet, type WorkEntry } from '../work.ts';

// ---------- «другие сыновья и дочери» ----------

const OTHERS = 'others:';
/** Условный ребёнок союза uid — место карточки «Другие сыновья и дочери». */
export const othersId = (uid: string) => `${OTHERS}${uid}`;
export const isOthers = (id: string) => id.startsWith(OTHERS);
export const othersUnion = (id: string) => id.slice(OTHERS.length);

/** Запись § 10 о детях без имён: «родил сынов и дочерей» (Быт 5:4, 11:11…) — у отца. */
const UNNAMED_KIDS = /(сынов|сыновей) и дочерей/;
export function othersNote(fatherCard: { childrenNote?: Fact[] } | null | undefined): Fact | null {
  return fatherCard?.childrenNote?.find((f) => UNNAMED_KIDS.test(f.text) && !/о матери/.test(f.text)) ?? null;
}

/**
 * Союз, у которого стоит карточка «другие дети» отца: единственный союз отца с детьми, иначе его союз без названной
 * матери. Если союзов с детьми несколько и все с матерями — не ставится: текст не говорит, от какого союза эти дети.
 */
export function othersUnionOf(U: Unions, father: string): Union | null {
  const own = (U.of.get(father) ?? []).filter((u) => u.a === father && !u.claim && u.kids.length);
  if (own.length === 1) return own[0];
  return own.find((u) => !u.b) ?? null;
}

/**
 * Вход раскладки с карточками «другие дети»: у раскрытых союзов из withNote — условный ребёнок othersId(uid) в конце
 * детей союза и в наборе. Союзы подменяются копиями; общий объект союзов не меняется.
 */
export function withOthers(inp: TreeInput, withNote: ReadonlySet<string>): TreeInput {
  const ids = inp.expanded.filter((uid) => withNote.has(uid) && inp.unions.byId.has(uid));
  if (!ids.length) return inp;
  const byIdU = new Map(inp.unions.byId);
  const swap = new Map<Union, Union>();
  for (const uid of ids) {
    const u = byIdU.get(uid)!;
    const v = { ...u, kids: [...u.kids, othersId(uid)] };
    byIdU.set(uid, v);
    swap.set(u, v);
  }
  const remap = (m: Map<string, Union[]>) => new Map([...m].map(([k, us]) => [k, us.map((u) => swap.get(u) ?? u)]));
  const origin = remap(inp.unions.origin);
  for (const uid of ids) origin.set(othersId(uid), [byIdU.get(uid)!]);
  return {
    ...inp,
    unions: { byId: byIdU, of: remap(inp.unions.of), origin },
    persons: [...inp.persons, ...ids.map(othersId)],
    birth: (id) => (isOthers(id) ? null : inp.birth(id)),
  };
}

// ---------- тела карточек: «другие дети» и возраст ----------

/** Растёт, когда пришёл том карточек: древо перечитывает записи о детях и возраст. */
export const cardsTick = signal(0);
const asked = new Set<string>();
/** Подгрузить тома карточек лиц древа (записи § 10 о детях без имён, возраст при смерти). */
export function askCards(ids: Iterable<string>) {
  const vols = new Map<string, string>();
  for (const id of ids) {
    const p = byId.get(id);
    if (!p || asked.has(p.volume) || loadedCard(id)) continue;
    vols.set(p.volume, id);
  }
  for (const [vol, id] of vols) {
    asked.add(vol);
    loadCard(id)
      .then(() => cardsTick.value++)
      .catch(() => asked.delete(vol));
  }
}

/** Возраст при смерти по числу текста (Быт 5:5 — 930 лет) или null. */
export function ageAtDeath(id: string): number | null {
  void cardsTick.value;
  const a = loadedChrono(id)?.died?.age;
  return typeof a === 'number' ? a : null;
}

// ---------- раскладка ----------

const birthOf = (id: string) => model.value.chrono.get(id)?.b ?? null;

/**
 * Вход раскладки по состоянию раскрытия (без «других детей»). Лица — набор, который показывает небо «набор»: свой или
 * набор из чужой ссылки (~n…, решение 45), пока его смотрят.
 */
export const treeInput = computed<TreeInput>(() => ({
  unions,
  persons: [...shownSet.value.keys()],
  opened: opened.value,
  expanded: Object.keys(expanded.value),
  birth: birthOf,
}));

/** Раскрытые союзы, у отца которых есть запись о детях без имён (карточка тома уже пришла). */
export const othersUnions = computed<Set<string>>(() => {
  void cardsTick.value;
  const out = new Set<string>();
  for (const uid of treeInput.value.expanded) {
    const u = unions.byId.get(uid);
    if (!u?.a || othersUnionOf(unions, u.a)?.id !== uid) continue;
    if (othersNote(loadedCard(u.a))) out.add(uid);
  }
  return out;
});

/** Раскладка древа. */
export const treeLayout = computed<TreeLayout>(() => layoutTree(withOthers(treeInput.value, othersUnions.value)));

/** Лица на древе (без условных «других детей»). */
export const treePersons = (t: TreeLayout) => t.nodes.filter((n): n is Extract<TreeNode, { kind: 'person' }> => n.kind === 'person' && !isOthers(n.id)).map((n) => n.id);

// ---------- команды лица ----------

export interface PersonCmds {
  /** есть союзы, не показанные на древе */
  more: boolean;
  /** можно свернуть ветвь: показаны союзы лица, раскрытые от него или по его щелчку */
  fold: boolean;
  /** есть союз происхождения, не показанный на древе */
  parents: boolean;
  /** родителей показали от этого лица — их можно скрыть */
  hideParents: boolean;
}

/** Какие команды у карточки лица id на древе t. */
export function personCmds(t: TreeLayout, id: string, s = revealState()): PersonCmds {
  const own = unionsOf(id);
  const shownOwn = own.filter((u) => t.byKey.has(u.id));
  const org = originOf(id);
  const shownOrg = org.filter((u) => t.byKey.has(u.id));
  const isOpen = s.opened.includes(id);
  const fold = shownOwn.length > 0 && (isOpen || shownOwn.some((u) => s.expanded[u.id] !== undefined));
  const byMe = (p: string | null) => !!p && s.work.get(p)?.via === 'family' && s.work.get(p)?.of === id;
  const hideParents =
    shownOrg.length > 0 &&
    (org.some((u) => s.expanded[u.id] === id) || org.some((u) => byMe(u.a) || byMe(u.b)) || (isOpen && !own.length));
  return { more: shownOwn.length < own.length, fold, parents: shownOrg.length < org.length, hideParents };
}

/** Состояние раскрытия одним снимком. */
export interface RevealState {
  work: ReadonlyMap<string, WorkEntry>;
  opened: readonly string[];
  expanded: Readonly<Record<string, string>>;
}
export const revealState = (): RevealState => ({ work: shownSet.value, opened: opened.value, expanded: expanded.value });

/**
 * Древо только для просмотра: на нём набор из чужой ссылки (решение 45). Раскрытие правит свой набор, поэтому команд
 * раскрытия нет — как у неба «набор», где при ссылке нет карточек союзов; «Добавить в мой набор» — в строке у кромки.
 */
export const treeReadOnly = computed(() => !!linkSet.value);

/**
 * Лицо, через которое карточка id видна на древе, хотя его нет в наборе (супруг показанного союза): второй супруг
 * или ребёнок этого союза из набора. Нужен, чтобы взять лицо в набор с правильной пометой «раскрыто от».
 */
function viaOf(id: string): string | null {
  const set = workSet.peek();
  for (const u of [...unionsOf(id), ...originOf(id)]) {
    const other = u.a === id ? u.b : u.b === id ? u.a : null;
    if (other && set.has(other)) return other;
    const kid = u.kids.find((k) => set.has(k));
    if (kid) return kid;
    const parent = [u.a, u.b].find((p) => p && p !== id && set.has(p));
    if (parent) return parent;
  }
  return null;
}

/** Взять лицо в набор, если его карточка видна как супруг показанного союза: команды лица работают от набора. */
function ensureIn(id: string) {
  if (workSet.peek().has(id)) return;
  const next = new Map(workSet.peek());
  const via = viaOf(id);
  next.set(id, via ? { via: 'family', of: via } : { via: 'self', of: id });
  workSet.value = next;
}

/** «Продолжить ветвь»: показать союзы лица справа от него. Возвращает, сколько союзов лица на древе после. */
export function continueBranch(id: string): number {
  batch(() => {
    ensureIn(id);
    openPerson(id);
  });
  return unionsOf(id).length;
}

/**
 * «Свернуть ветвь»: свернуть союзы лица, раскрытые на древе (дети уходят вместе со всем, что раскрыто от них), и
 * убрать карточки его союзов. Союз родителей, если он был показан, остаётся: родители берутся в набор от лица.
 */
export function foldBranch(id: string) {
  const before = new Set(shownUnions(treeInput.peek()).map((u) => u.id));
  batch(() => {
    for (const u of unionsOf(id)) if (u.id in expanded.peek()) collapseUnion(u.id);
    closePerson(id);
  });
  const after = new Set(shownUnions(treeInput.peek()).map((u) => u.id));
  if (originOf(id).some((u) => before.has(u.id) && !after.has(u.id)) && workSet.peek().has(id)) showParents(id);
}

/** «Родители»: союз происхождения с родителями — родители в набор (от лица id), братья и сёстры — нет. */
export function showParents(id: string): number {
  let added = 0;
  batch(() => {
    ensureIn(id);
    const next = new Map(workSet.peek());
    for (const u of originOf(id))
      for (const p of [u.a, u.b])
        if (p && !next.has(p)) {
          next.set(p, { via: 'family', of: id });
          added++;
        }
    if (added) workSet.value = next;
  });
  return added;
}

/**
 * «Скрыть родителей»: свернуть союзы происхождения, раскрытые от лица, убрать родителей, взятых от него, и всё, что
 * раскрыто от них (по цепочке «раскрыто от»); если союзы родителей были видны только потому, что у лица показаны
 * союзы, а своих союзов у него нет, — убрать и это.
 */
export function hideParents(id: string) {
  batch(() => {
    for (const u of originOf(id)) if (expanded.peek()[u.id] === id) collapseUnion(u.id);
    const set = workSet.peek();
    const gone = new Set<string>();
    for (const u of originOf(id))
      for (const p of [u.a, u.b]) {
        const e = p ? set.get(p) : undefined;
        if (p && e && e.via === 'family' && e.of === id) gone.add(p);
      }
    const queue = [...gone];
    for (let i = 0; i < queue.length; i++)
      for (const [x, e] of set)
        if (!gone.has(x) && x !== id && e.via === 'family' && e.of === queue[i]) {
          gone.add(x);
          queue.push(x);
        }
    if (gone.size) {
      const next = new Map(set);
      for (const x of gone) next.delete(x);
      workSet.value = next;
      const exp: Record<string, string> = {};
      for (const [k, f] of Object.entries(expanded.peek())) if (!gone.has(f)) exp[k] = f;
      expanded.value = exp;
      opened.value = opened.peek().filter((x) => !gone.has(x));
      if (selected.peek() && gone.has(selected.peek()!)) selected.value = id;
    }
    if (opened.peek().includes(id) && !unionsOf(id).length) closePerson(id);
  });
}

/** Супруг союза, от которого его раскрывают на древе: первый названный супруг в наборе, иначе первый названный. */
export function unionFrom(u: Union): string | undefined {
  const set = workSet.peek();
  return [u.a, u.b].find((p): p is string => !!p && set.has(p)) ?? u.kids.find((k) => set.has(k)) ?? u.a ?? u.b ?? undefined;
}

/** Раскрыть детей союза от первого раскрытого супруга. Возвращает, сколько лиц добавилось. */
export function openKids(u: Union): number {
  return expandUnion(u.id, unionFrom(u));
}
export const closeKids = (u: Union) => collapseUnion(u.id);

/** Сколько детей союза видно на древе (без «других детей»). */
export const kidsShown = (t: TreeLayout, u: Union) => u.kids.filter((k) => t.byKey.has(personKey(k))).length;

// ---------- линии Мессии ----------

const lineIdx = (l: { persons: { id: string; flag: string }[] }) => new Map(l.persons.map((s, i) => [s.id, i]));
const LINE = { joseph: lineIdx(lines.joseph), mary: lineIdx(lines.mary) };
const STEP_FLAG = { joseph: new Map(lines.joseph.persons.map((s) => [s.id, s.flag])), mary: new Map(lines.mary.persons.map((s) => [s.id, s.flag])) };

/** Идёт ли ребёнок kid сразу за родителем parent в линии (Мф 1 — joseph, Лк 3 — mary). */
export function lineStep(line: 'joseph' | 'mary', parent: string, kid: string): boolean {
  const m = LINE[line];
  const a = m.get(parent);
  const b = m.get(kid);
  return a !== undefined && b !== undefined && b === a + 1;
}
/** Звено линии по толкованию (Илий — Мария, Нирий — Салафиил, Каинан): нить разреженная. */
export const lineInterp = (line: 'joseph' | 'mary', kid: string) => STEP_FLAG[line].get(kid) === 'interpretation';

/** На каких линиях лицо (для знака на карточке). */
export const onLines = (id: string) => ({ mt: LINE.joseph.has(id), lk: LINE.mary.has(id) });

export interface Ribbon {
  joseph: boolean;
  mary: boolean;
  /** звено по толкованию — нить разреженная */
  interp: boolean;
}

/**
 * Ленты связи e: союз → ребёнок — если родитель союза и ребёнок идут подряд в линии; лицо → союз — если после лица в
 * линии идёт один из детей этого союза (лента продолжается и до раскрытия детей: видно, куда идёт линия).
 */
export function ribbonOf(t: TreeLayout, e: { from: string; to: string; kind: string }): Ribbon | null {
  const a = t.byKey.get(e.from);
  const b = t.byKey.get(e.to);
  if (!a || !b) return null;
  const r: Ribbon = { joseph: false, mary: false, interp: false };
  if (e.kind === 'child' && a.kind === 'union' && b.kind === 'person') {
    for (const l of ['joseph', 'mary'] as const)
      if ([a.union.a, a.union.b].some((p) => p && lineStep(l, p, b.id))) {
        r[l] = true;
        if (lineInterp(l, b.id)) r.interp = true;
      }
  } else if (e.kind === 'spouse' && a.kind === 'person' && b.kind === 'union') {
    for (const l of ['joseph', 'mary'] as const)
      for (const k of b.union.kids)
        if (lineStep(l, a.id, k)) {
          r[l] = true;
          if (lineInterp(l, k)) r.interp = true;
        }
  }
  return r.joseph || r.mary ? r : null;
}

// ---------- подсветка выбранного ----------

export type Glow =
  /** потомок выбранного: ветвь branch (номер), поколение gen (1 — дети) */
  | { kind: 'desc'; branch: number; gen: number }
  /** связь выбранного с его союзом, когда ветви — дети одного союза: общая для всех ветвей */
  | { kind: 'self' }
  /** путь к предкам */
  | { kind: 'anc' };

export interface Highlight {
  /** ключ узла → подсветка; выбранный — { kind: 'self' } */
  nodes: Map<string, Glow>;
  /** номер связи в t.edges → подсветка; нет в карте — связь гаснет */
  edges: Map<number, Glow>;
}

/**
 * Подсветка выбранного лица sel на древе t. ветви — из branchesOf (src/engine/unions.ts): desc — потомок → ветвь и
 * поколение, keys — ключи ветвей (id союзов, если ветви — союзы, иначе id детей). Потомки, до которых древо дошло
 * путём вне этой карты (союз «по закону» и т. п.), берут ветвь родителя на древе; дети выбранного — свою по порядку.
 */
export function highlightOf(
  t: TreeLayout,
  sel: string,
  br: { desc: ReadonlyMap<string, { branch: number; gen: number }>; keys: readonly string[] },
): Highlight | null {
  const sk = personKey(sel);
  if (!t.byKey.has(sk)) return null;
  const nodes = new Map<string, Glow>([[sk, { kind: 'self' }]]);
  const edges = new Map<number, Glow>();
  const out = new Map<string, number[]>();
  const into = new Map<string, number[]>();
  t.edges.forEach((e, i) => {
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(i);
    (into.get(e.to) ?? into.set(e.to, []).get(e.to)!).push(i);
  });
  // ветви — союзы выбранного (Сарра, Агарь, Хеттура) или его дети (Сим, Хам, Иафет)
  const byUnion = br.keys.some((k) => unions.byId.has(k));

  // вниз: выбранный → его союзы → дети → их союзы …
  const queue: string[] = [sk];
  let extra = br.keys.length;
  for (let q = 0; q < queue.length; q++) {
    const pk = queue[q];
    const pg = nodes.get(pk)!;
    for (const i of out.get(pk) ?? []) {
      const e = t.edges[i];
      if (e.kind !== 'spouse') continue;
      const un = t.byKey.get(e.to);
      if (!un || un.kind !== 'union' || nodes.has(e.to)) continue;
      // союз выбранного: ветвь — сам союз (если ветви — союзы), иначе общая связь
      let g: Glow;
      if (pg.kind === 'self') {
        const b = byUnion ? br.keys.indexOf(un.union.id) : -1;
        g = b >= 0 ? { kind: 'desc', branch: b, gen: 1 } : { kind: 'self' };
      } else g = pg;
      nodes.set(e.to, g);
      edges.set(i, g);
      // второй супруг союза: его связь — тем же цветом (пустое место — пунктиром), сам он не потомок
      for (const j of into.get(e.to) ?? []) edges.set(j, g);
      for (const j of out.get(e.to) ?? []) {
        const c = t.edges[j];
        if (c.kind !== 'child' || nodes.has(c.to)) continue;
        const kid = c.kid ?? '';
        const d = br.desc.get(kid);
        let kg: Glow;
        // «другие сыновья и дочери» — не ветвь: тем же светом, что союз
        if (isOthers(kid)) kg = g;
        else if (d) kg = { kind: 'desc', branch: d.branch, gen: d.gen };
        else if (g.kind === 'desc') kg = { kind: 'desc', branch: g.branch, gen: g.gen + (pg.kind === 'self' ? 0 : 1) };
        else kg = { kind: 'desc', branch: extra++, gen: 1 };
        nodes.set(c.to, kg);
        edges.set(j, kg);
        if (!isOthers(kid)) queue.push(c.to);
      }
    }
  }

  // вверх: союз, где выбранный — ребёнок, → его супруги → их союзы происхождения …
  const up: string[] = [sk];
  for (let q = 0; q < up.length; q++) {
    for (const i of into.get(up[q]) ?? []) {
      const e = t.edges[i];
      if (e.kind !== 'child') continue;
      edges.set(i, { kind: 'anc' });
      if (nodes.has(e.from)) continue;
      nodes.set(e.from, { kind: 'anc' });
      for (const j of into.get(e.from) ?? []) {
        const s = t.edges[j];
        edges.set(j, { kind: 'anc' });
        if (s.kind === 'spouse' && !nodes.has(s.from)) {
          nodes.set(s.from, { kind: 'anc' });
          up.push(s.from);
        }
      }
    }
  }
  return { nodes, edges };
}

// ---------- клавиатура: соседи по связи и по столбцу ----------

/** Узлы в порядке Tab: по столбцам слева направо, в столбце — сверху вниз. */
export function tabOrder(t: TreeLayout): TreeNode[] {
  return [...t.nodes].sort((a, b) => a.layer - b.layer || a.y - b.y);
}

/**
 * Сосед узла key в сторону dir: ←/→ — по связи в соседний столбец (ближайший по высоте, если их несколько; если связей
 * в эту сторону нет — ближайший узел соседнего столбца), ↑/↓ — соседний узел того же столбца.
 */
export function neighbor(t: TreeLayout, key: string, dir: 'left' | 'right' | 'up' | 'down'): string | null {
  const n = t.byKey.get(key);
  if (!n) return null;
  if (dir === 'up' || dir === 'down') {
    const col = t.nodes.filter((m) => m.layer === n.layer).sort((a, b) => a.y - b.y);
    const i = col.indexOf(n) + (dir === 'down' ? 1 : -1);
    return col[i]?.key ?? null;
  }
  const side = dir === 'right' ? 1 : -1;
  const linked = t.edges
    .flatMap((e) => (e.from === key ? [e.to] : e.to === key ? [e.from] : []))
    .map((k) => t.byKey.get(k)!)
    .filter((m) => m && Math.sign(m.layer - n.layer) === side);
  const pool = linked.length ? linked : t.nodes.filter((m) => m.layer === n.layer + side);
  let best: TreeNode | null = null;
  for (const m of pool) if (!best || Math.abs(m.y - n.y) < Math.abs(best.y - n.y) || (Math.abs(m.y - n.y) === Math.abs(best.y - n.y) && m.layer === n.layer + side)) best = m;
  return best?.key ?? null;
}
