/**
 * Рабочий набор сеанса, небо по набору, свёртка и стопка карточек (J3–J6; решение владельца 17: «необходима возможность
 * сворачивать и разворачивать карточки нужных персонажей и их генеалогии, чтобы на атласе были те, с которыми
 * пользователь работает в данной сессии»).
 *
 *  — workSet — лица, с которыми читатель работает: id → откуда взято (само лицо, предок, потомок, семья, звено пути).
 *    Хранится в памяти браузера (localStorage) и переживает перезагрузку; без хранилища всё работает, только не помнится.
 *  — skyMode — что показывает небо: «все лица» или только набор (J4; сжатие полос — src/render/rows.ts).
 *  — foldDesc, foldGroups — свёрнутые потомки лиц и созвездия (J5); помнятся в сеансе (sessionStorage).
 *  — стопка карточек (J6) — в src/ui/stack.ts.
 * Предки и потомки — по графу (src/engine/graph.ts): отцы и матери, дети; связи по толкованию — только по выбору.
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { byId, graph, groupById, lineMembership } from '../data/atlas.ts';
import { siblings } from '../engine/graph.ts';
import { walk } from '../render/rows.ts';
import { selected, focused } from '../state.ts';

// ---------- хранилища ----------

const hasWindow = typeof window !== 'undefined';
function read<T>(store: 'local' | 'session', key: string, d: T): T {
  if (!hasWindow) return d;
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage;
    const v = s.getItem(`toledot:${key}`);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}
function write(store: 'local' | 'session', key: string, v: unknown) {
  if (!hasWindow) return;
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage;
    s.setItem(`toledot:${key}`, JSON.stringify(v));
  } catch {
    /* хранилище недоступно — набор просто не запомнится */
  }
}

// ---------- объём: лицо, предки, потомки, семья ----------

/** Что взять в работу вместе с лицом. gen — поколений (1, 2, 3; null — все); interp — со связями по толкованию. */
export type Scope = { kind: 'self' } | { kind: 'anc' | 'desc'; gen: number | null; interp?: boolean } | { kind: 'family'; interp?: boolean };

/** Откуда лицо в наборе: взято само (self), как предок, потомок или семья лица of, как звено пути от лица of. */
export interface WorkEntry {
  via: 'self' | 'anc' | 'desc' | 'family' | 'path';
  of: string;
  /** поколений от of (у предков и потомков) */
  gen?: number;
}

/**
 * Лица объёма scope у лица id — первым само лицо. Предки и потомки — по отцам и матерям и по иным утверждениям текста
 * о родителях (по Луке, по закону, левиратный брак), но без утверждений уровня «толкование», если не выбрано interp.
 * Семья — родители, супруги, дети, братья и сёстры.
 */
export function scopeIds(id: string, scope: Scope): { id: string; gen?: number }[] {
  const out: { id: string; gen?: number }[] = [{ id }];
  if (scope.kind === 'self') return out;
  if (scope.kind === 'anc' || scope.kind === 'desc') {
    const m = walk(graph, id, scope.kind === 'anc' ? 'up' : 'down', scope.gen, { interp: scope.interp, other: true });
    for (const [x, gen] of m) out.push({ id: x, gen });
    return out;
  }
  const seen = new Set([id]);
  const add = (x: string) => {
    if (seen.has(x) || !byId.has(x)) return;
    seen.add(x);
    out.push({ id: x, gen: 1 });
  };
  const ok = (cert: string) => scope.interp || cert !== 'interpretation';
  for (const e of graph.parentsOf.get(id) ?? []) if ((e.kind === 'father' || e.kind === 'mother') && ok(e.cert)) add(e.parent);
  for (const e of graph.spousesOf.get(id) ?? []) if (ok(e.cert)) add(e.a === id ? e.b : e.a);
  for (const e of graph.childrenOf.get(id) ?? []) if ((e.kind === 'father' || e.kind === 'mother') && ok(e.cert)) add(e.child);
  for (const s of siblings(graph, id)) add(s.id);
  return out;
}

// ---------- рабочий набор (J3) ----------

function readWork(): Map<string, WorkEntry> {
  const raw = read<[string, WorkEntry][]>('local', 'work', []);
  const m = new Map<string, WorkEntry>();
  if (!Array.isArray(raw)) return m;
  for (const row of raw) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || !byId.has(row[0])) continue;
    const e = row[1];
    m.set(row[0], e && typeof e === 'object' && typeof e.via === 'string' && typeof e.of === 'string' ? e : { via: 'self', of: row[0] });
  }
  return m;
}

/** Рабочий набор: id лица → откуда взято. Порядок — порядок добавления. */
export const workSet = signal<ReadonlyMap<string, WorkEntry>>(readWork());
if (hasWindow) effect(() => write('local', 'work', [...workSet.value]));

export const inWork = (id: string) => workSet.value.has(id);
/** Лица набора множеством (одно и то же, пока набор не менялся): его читает небо (src/render/rows.ts, SkyView). */
export const workIds = computed<ReadonlySet<string>>(() => new Set(workSet.value.keys()));

/** Взять в работу лицо id с объёмом scope; лица, уже бывшие в наборе, остаются со своей пометой. Возвращает, сколько добавлено. */
export function addToWork(id: string, scope: Scope = { kind: 'self' }): number {
  if (!byId.has(id)) return 0;
  const next = new Map(workSet.peek());
  let added = 0;
  const via: WorkEntry['via'] = scope.kind === 'self' ? 'self' : scope.kind;
  for (const x of scopeIds(id, scope)) {
    if (x.id === id) {
      // лицо, взятое прежде как чужой родственник, теперь взято само
      const was = next.get(id);
      if (!was) added++;
      if (!was || was.via !== 'self') next.set(id, { via: 'self', of: id });
      continue;
    }
    if (next.has(x.id)) continue;
    next.set(x.id, { via, of: id, gen: x.gen });
    added++;
  }
  workSet.value = next;
  return added;
}

/** Взять в работу путь родства (J3, «Родство»): все лица пути, звенья помечены первым лицом пути. */
export function addPath(ids: readonly string[]): number {
  const next = new Map(workSet.peek());
  let added = 0;
  const of = ids[0];
  for (const id of ids) {
    if (!byId.has(id) || next.has(id)) continue;
    next.set(id, id === of ? { via: 'self', of: id } : { via: 'path', of });
    added++;
  }
  workSet.value = next;
  return added;
}

/** Убрать лицо из работы. */
export function removeFromWork(id: string) {
  if (!workSet.peek().has(id)) return;
  const next = new Map(workSet.peek());
  next.delete(id);
  workSet.value = next;
}

/** Сколько лиц взято вместе с лицом id (его предки, потомки, семья, путь от него). */
export function lineOf(id: string): string[] {
  const out: string[] = [];
  for (const [x, e] of workSet.value) if (x !== id && e.of === id && e.via !== 'self') out.push(x);
  return out;
}

/** Убрать лицо вместе с родословной, взятой с ним (предки, потомки, семья, путь). */
export function removeWithLine(id: string) {
  const next = new Map(workSet.peek());
  for (const x of lineOf(id)) next.delete(x);
  next.delete(id);
  workSet.value = next;
}

export function clearWork() {
  workSet.value = new Map();
}

/** Лица набора в порядке рождения (у лиц без года — в конце, по порядку добавления). */
export function workOrder(birth: (id: string) => number | null): string[] {
  const ids = [...workSet.value.keys()];
  const at = new Map(ids.map((id, i) => [id, i]));
  return ids.sort((a, b) => {
    const ba = birth(a);
    const bb = birth(b);
    if (ba !== null && bb !== null && ba !== bb) return ba - bb;
    if (ba === null && bb !== null) return 1;
    if (bb === null && ba !== null) return -1;
    return at.get(a)! - at.get(b)!;
  });
}

// ---------- небо по набору (J4) ----------

export type SkyMode = 'all' | 'work';
/** Что показывает небо: все лица или только рабочий набор. Помнится в сеансе и пишется в адрес (k1; решение 34). */
export const skyMode = signal<SkyMode>(read<SkyMode>('session', 'skymode', 'all') === 'work' ? 'work' : 'all');
if (hasWindow) effect(() => write('session', 'skymode', skyMode.value));

/**
 * Переключатель неба «все лица | набор» (решение 26; IX-59): одно слово — одно действие. Панель «В работе: N»
 * открывает верхняя строка, «В наборе ▾» — кнопка карточки; переключатель только выбирает, что на небе.
 */
export const SKY_MODES: readonly { value: SkyMode; label: string }[] = [
  { value: 'all', label: 'все лица' },
  { value: 'work', label: 'набор' },
];

/** Набор не длиннее стольких лиц передаётся ссылкой — списком id (решение 34; IX-67); длиннее — только режим. */
export const WORK_URL_MAX = 12;

// ---------- свёртка (J5) ----------

const folds0 = read<{ desc?: unknown; groups?: unknown }>('session', 'folds', {});
const strings = (v: unknown, ok: (s: string) => boolean) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ok(x)) : []);
/** Лица, у которых на небе свёрнуты потомки. */
export const foldDesc = signal<string[]>(strings(folds0.desc, (x) => byId.has(x)));
/** Свёрнутые созвездия. */
export const foldGroups = signal<string[]>(strings(folds0.groups, (x) => groupById.has(x)));
if (hasWindow) effect(() => write('session', 'folds', { desc: foldDesc.value, groups: foldGroups.value }));

/** Есть ли у лица дети (по отцам и матерям) — есть ли что сворачивать. */
export const hasDescendants = (id: string) => (graph.childrenOf.get(id) ?? []).some((e) => e.kind === 'father' || e.kind === 'mother');

/** Свернуть (on = true) или развернуть потомков лица; без on — переключить. */
export function foldDescOf(id: string, on?: boolean) {
  const cur = foldDesc.peek();
  const has = cur.includes(id);
  const want = on ?? !has;
  if (want === has || (want && !hasDescendants(id))) return;
  foldDesc.value = want ? [...cur, id] : cur.filter((x) => x !== id);
}
/** Свернуть или развернуть созвездие. */
export function foldGroupOf(g: string, on?: boolean) {
  const cur = foldGroups.peek();
  const has = cur.includes(g);
  const want = on ?? !has;
  if (want === has || !groupById.has(g)) return;
  foldGroups.value = want ? [...cur, g] : cur.filter((x) => x !== g);
}
export function unfoldAll() {
  batch(() => {
    foldDesc.value = [];
    foldGroups.value = [];
  });
}

/** Созвездие лица и все, внутри которых оно лежит (дом → колено). */
function groupChain(g: string | undefined): string[] {
  const out: string[] = [];
  for (let x = g, k = 0; x && k < 8; x = groupById.get(x)?.parent, k++) out.push(x);
  return out;
}
const onLines = (id: string) => lineMembership.joseph.has(id) || lineMembership.mary.has(id);

/**
 * Свёртки, которые прячут лицо id: свёрнутые потомки его предков и свёрнутые созвездия, в которых оно лежит.
 * Лица линий Мессии свёртка не прячет (src/render/rows.ts, planSky).
 */
export function foldsHiding(id: string): { desc: string[]; groups: string[] } {
  if (onLines(id)) return { desc: [], groups: [] };
  const anc = walk(graph, id, 'up', null, { other: true });
  const chain = groupChain(byId.get(id)?.group);
  return { desc: foldDesc.peek().filter((r) => anc.has(r)), groups: foldGroups.peek().filter((g) => chain.includes(g)) };
}

// выбранное лицо не прячется свёрткой: ссылка или поиск на свёрнутое лицо разворачивает то, что его прячет
if (hasWindow)
  effect(() => {
    const id = selected.value;
    if (!id) return;
    const f = foldsHiding(id);
    if (!f.desc.length && !f.groups.length) return;
    batch(() => {
      if (f.desc.length) foldDesc.value = foldDesc.peek().filter((x) => !f.desc.includes(x));
      if (f.groups.length) foldGroups.value = foldGroups.peek().filter((x) => !f.groups.includes(x));
    });
  });

// стопка карточек (J6) — src/ui/stack.ts; имена оставлены здесь для прежних импортов
export { STACK_MAX, cardStack, cardFolded, pushCard, dropCard } from './stack.ts';

// ---------- клавиши (J3, J5; IX-51, MOB-55) ----------

/**
 * Лицо, к которому относится клавиша неба (IX-51): звезда с кольцом клавиатуры; иначе звезда, чья подсказка сейчас видна
 * (tip — её id, src/ui/sky/Tip.tsx); иначе выбранное лицо. Звезда под указателем без видимой подсказки клавишу не берёт:
 * читатель работает с карточкой, мышь просто лежит на небе.
 */
export const keyTarget = (tip: string | null = null) => focused.peek() ?? tip ?? selected.peek();

/** Число лиц словами: «5 лиц», «1 лицо». */
const persons = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'лицо' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'лица' : 'лиц'}`;
/** Глагол по роду лица: «взят» и «взята», «убран» и «убрана». */
const bySex = (id: string, m: string, f: string) => (byId.get(id)?.sex === 'f' ? f : m);

/**
 * Что сказала клавиша набора — для живой области (IX-51, MOB-55, WCAG 4.1.3). Имя — в начале строки, в именительном
 * падеже: «Иессей взят в работу; в наборе 5 лиц», «Руфь убрана из работы; набор пуст», «Давид: потомки свёрнуты, скрыто 62 лица».
 */
export function workKeyText(
  r: { kind: 'take' | 'drop'; id: string; size: number } | { kind: 'fold' | 'unfold'; id: string; hidden?: number },
): string {
  const name = byId.get(r.id)?.name ?? r.id;
  if ('size' in r) {
    if (r.kind === 'take') return `${name} ${bySex(r.id, 'взят', 'взята')} в работу; в наборе ${persons(r.size)}`;
    return `${name} ${bySex(r.id, 'убран', 'убрана')} из работы; ${r.size ? `в наборе ${persons(r.size)}` : 'набор пуст'}`;
  }
  if (r.kind === 'unfold') return `${name}: потомки развёрнуты`;
  return `${name}: потомки свёрнуты${r.hidden ? `, скрыто ${persons(r.hidden)}` : ''}`;
}

/** Свёртка созвездия вслух (UX-51): «Созвездие «Дом Саулов» свёрнуто: скрыто 65 лиц»; развёрнуто — без счёта. */
export function groupFoldText(name: string, on: boolean, count: number): string {
  return on ? `Созвездие «${name}» свёрнуто${count ? `: скрыто ${persons(count)}` : ''}` : `Созвездие «${name}» развёрнуто`;
}

export type WorkKeyResult = { kind: 'take' | 'drop'; id: string; size: number } | { kind: 'fold' | 'unfold'; id: string };

/**
 * Клавиши рабочего набора (по физическим клавишам, KeyboardEvent.code, — и на русской раскладке):
 * D («В») — взять лицо в работу или убрать из работы; C («С») — свернуть или развернуть его потомков на небе.
 * id — лицо клавиши (keyTarget). Возвращает, что сделано (для объявления), или null, если клавиша не про набор.
 */
export function workKey(code: string, id: string | null = keyTarget()): WorkKeyResult | null {
  if (!id || !byId.has(id)) return null;
  if (code === 'KeyD') {
    if (workSet.peek().has(id)) {
      removeFromWork(id);
      return { kind: 'drop', id, size: workSet.peek().size };
    }
    addToWork(id);
    return { kind: 'take', id, size: workSet.peek().size };
  }
  if (code === 'KeyC') {
    if (!hasDescendants(id) && !foldDesc.peek().includes(id)) return null;
    foldDescOf(id);
    return { kind: foldDesc.peek().includes(id) ? 'fold' : 'unfold', id };
  }
  return null;
}
