/**
 * Пошаговое раскрытие родословия на небе (решения владельца 67–72). Небо «набор» показывает только раскрытых лиц;
 * читатель раскрывает родословие шаг за шагом:
 *
 *   лицо (щелчок) → его союзы — «карточки союза» на небе (брак или связь, от которой пошла ветвь) →
 *   союз (щелчок) → оба супруга и все дети этого союза → щелчок по ребёнку → его союзы → …
 *
 * Вверх так же: у раскрытого лица есть союз происхождения (его родители); щелчок по нему раскрывает родителей и братьев.
 *
 * Состояние:
 *  — раскрытые лица — это рабочий набор (src/ui/work.ts, workSet): лицо, с которого начали, или взятое в работу, —
 *    с пометой 'self'; раскрытое через союз — 'family' с of = лицо, от чьего союза его раскрыли. Поэтому панель
 *    «В работе», ссылка с набором и небо «набор» работают как прежде;
 *  — opened — лица, у которых на небе показаны карточки союзов (щёлкнули по лицу);
 *  — expanded — раскрытые союзы: id союза → лицо, от которого раскрыли (родитель — вниз, ребёнок — вверх).
 *    Свёртка союза убирает тех, кого он раскрыл, и всё, что раскрыли от них.
 *
 * Пять начал (решение 68): с Адама, с Иисуса Христа, родословие Иисуса Христа (обе линии), ключевые лица, всё небо.
 * При первом посещении атлас предлагает выбрать начало; дальше открывается как в прошлый раз (память браузера).
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { byId, graph, lineMembership, persons } from '../data/atlas.ts';
import { buildUnions, membersOf, type Union } from '../engine/unions.ts';
import { selected } from '../state.ts';
import { skyMode, workSet, type WorkEntry } from './work.ts';

// ---------- хранилище ----------

const hasWindow = typeof window !== 'undefined';
function read<T>(key: string, d: T): T {
  if (!hasWindow) return d;
  try {
    const v = window.localStorage.getItem(`toledot:${key}`);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}
function write(key: string, v: unknown) {
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(`toledot:${key}`, JSON.stringify(v));
  } catch {
    /* хранилище недоступно — раскрытие просто не запомнится */
  }
}

// ---------- союзы ----------

/** Все союзы атласа (src/engine/unions.ts): по id, по лицу, по происхождению. */
export const unions = buildUnions(graph);
export const unionById = (uid: string): Union | undefined => unions.byId.get(uid);
/** Союзы лица — брак или связь, от которых у него дети (и браки без детей), по порядку текста. */
export const unionsOf = (id: string): Union[] => unions.of.get(id) ?? [];
/** Союзы происхождения лица: его родители (первым — основные, затем «по закону», «по Луке» и т. п.). */
export const originOf = (id: string): Union[] => unions.origin.get(id) ?? [];

// ---------- начало (решение 68) ----------

export type Start = 'adam' | 'jesus' | 'lines' | 'key' | 'all';
export const STARTS: readonly { value: Start; label: string; hint: string }[] = [
  { value: 'adam', label: 'С Адама', hint: 'На небе только Адам. Щёлкните по лицу — появятся его союзы; щёлкните по союзу — его дети.' },
  { value: 'jesus', label: 'С Иисуса Христа', hint: 'На небе только Иисус Христос. Раскрывайте родителей и предков вверх, до Адама.' },
  { value: 'lines', label: 'Родословие Иисуса Христа', hint: 'Обе линии — по Матфею и по Луке — от Адама до Иисуса Христа; остальные ветви раскрываются по щелчку.' },
  { value: 'key', label: 'Ключевые лица', hint: 'Главные лица истории Писания; их ветви раскрываются по щелчку.' },
  { value: 'all', label: 'Всё небо', hint: 'Все 2 660 лиц сразу; ветви и созвездия можно сворачивать.' },
];

/** Выбранное начало; null — ещё не выбирали (первое посещение: атлас предлагает выбрать). */
export const start = signal<Start | null>(((s) => (STARTS.some((x) => x.value === s) ? s : null))(read<Start | null>('start', null)));
if (hasWindow) effect(() => write('start', start.value));
// «дальше открывается как в прошлый раз»: новый сеанс после начала с раскрытием — сразу небо «набор» (режим неба помнится
// в сеансе, src/ui/work.ts; адрес с полями вида задаёт его сам)
if (hasWindow && start.peek() && start.peek() !== 'all' && workSet.peek().size) {
  try {
    if (window.sessionStorage.getItem('toledot:skymode') === null && !/~k1/.test(window.location.hash)) skyMode.value = 'work';
  } catch {
    /* без хранилища сеанса — как было */
  }
}

/** Ключевые лица (решение 68): самые яркие звёзды неба (величина 0–1) и главные лица, чья величина меньше. */
const KEY_EXTRA = ['sarra', 'revekka', 'liya', 'rakhil', 'ruf', 'mariya', 'iosif-muzh-marii', 'samuil', 'iliya', 'elisey', 'daniil', 'ezdra', 'neemiya', 'esfir'];
export const KEY_IDS: readonly string[] = [...new Set([...persons.filter((p) => p.magnitude <= 1).map((p) => p.id), ...KEY_EXTRA.filter((id) => byId.has(id))])];
/** Лица обеих линий Мессии (Мф 1, Лк 3; data/lines). */
export const LINE_IDS: readonly string[] = [...new Set([...lineMembership.joseph.keys(), ...lineMembership.mary.keys()])].filter((id) => byId.has(id));

/** Лица, с которых начинается небо при начале s. */
export function startIds(s: Start): readonly string[] {
  if (s === 'adam') return ['adam'];
  if (s === 'jesus') return ['iisus'];
  if (s === 'lines') return LINE_IDS;
  if (s === 'key') return KEY_IDS;
  return [];
}

// ---------- раскрытие ----------

const strs = (v: unknown, ok: (s: string) => boolean) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ok(x)) : []);
const saved = read<{ opened?: unknown; expanded?: unknown }>('reveal', {});
/** Лица, у которых на небе показаны карточки союзов. */
export const opened = signal<string[]>(strs(saved.opened, (x) => byId.has(x)));
/** Раскрытые союзы: id союза → лицо, от которого раскрыли. */
export const expanded = signal<Readonly<Record<string, string>>>(
  saved.expanded && typeof saved.expanded === 'object'
    ? Object.fromEntries(Object.entries(saved.expanded as Record<string, unknown>).filter(([u, f]) => unions.byId.has(u) && typeof f === 'string' && byId.has(f))) as Record<string, string>
    : {},
);
if (hasWindow) effect(() => write('reveal', { opened: opened.value, expanded: expanded.value }));

/** Начать заново с начала s (решение 68): набор — лица начала, союзы свёрнуты; «всё небо» — небо «все лица». */
export function startWith(s: Start) {
  batch(() => {
    start.value = s;
    opened.value = [];
    expanded.value = {};
    if (s === 'all') {
      skyMode.value = 'all';
      return;
    }
    const next = new Map<string, WorkEntry>();
    for (const id of startIds(s)) next.set(id, { via: 'self', of: id });
    workSet.value = next;
    skyMode.value = 'work';
    // с одного лица — сразу его карточка и его союзы: первый шаг раскрытия виден без поиска
    if (s === 'adam' || s === 'jesus') {
      const id = s === 'adam' ? 'adam' : 'iisus';
      opened.value = [id];
      selected.value = id;
    }
  });
}

/** Показать на небе карточки союзов лица (щелчок по лицу в небе «набор»). */
export function openPerson(id: string) {
  if (!byId.has(id) || opened.peek().includes(id)) return;
  opened.value = [...opened.peek(), id];
}
/** Скрыть карточки союзов лица (свёрнутые; раскрытые союзы остаются). */
export function closePerson(id: string) {
  if (!opened.peek().includes(id)) return;
  opened.value = opened.peek().filter((x) => x !== id);
}

/** Раскрыт ли союз: все его лица на небе «набор». */
export const isExpanded = (uid: string) => uid in expanded.value;

/**
 * Раскрыть союз uid от лица from (родитель — вниз, к детям; ребёнок — вверх, к родителям): оба супруга и все дети
 * союза — в набор (помета 'family', of = from; лица, уже бывшие в наборе, остаются со своей пометой), небо — «набор».
 * Возвращает, сколько лиц добавилось.
 */
export function expandUnion(uid: string, from?: string): number {
  const u = unions.byId.get(uid);
  if (!u) return 0;
  const by = from && membersOf(u).includes(from) ? from : (u.a ?? u.b ?? u.kids[0]);
  const next = new Map(workSet.peek());
  let added = 0;
  for (const id of membersOf(u)) {
    if (next.has(id)) continue;
    next.set(id, { via: 'family', of: by });
    added++;
  }
  batch(() => {
    workSet.value = next;
    expanded.value = { ...expanded.peek(), [uid]: by };
    if (skyMode.peek() !== 'work') skyMode.value = 'work';
    if (!opened.peek().includes(by)) opened.value = [...opened.peek(), by];
  });
  return added;
}

/**
 * Свернуть союз uid: из набора уходят лица, раскрытые через него, и всё, что раскрыли от них (по цепочке of), кроме
 * лиц с пометой 'self' (начало и взятые в работу сами). Их союзы тоже сворачиваются. Возвращает, сколько лиц ушло.
 */
export function collapseUnion(uid: string): number {
  const by = expanded.peek()[uid];
  if (by === undefined) return 0;
  const u = unions.byId.get(uid);
  const set = workSet.peek();
  const gone = new Set<string>();
  // лица союза, раскрытые именно от него: of = by и не само лицо by
  const queue: string[] = [];
  for (const id of u ? membersOf(u) : []) {
    const e = set.get(id);
    if (id !== by && e && e.via === 'family' && e.of === by) {
      gone.add(id);
      queue.push(id);
    }
  }
  // всё, что раскрыли от ушедших
  for (let i = 0; i < queue.length; i++)
    for (const [id, e] of set)
      if (!gone.has(id) && e.via === 'family' && e.of === queue[i]) {
        gone.add(id);
        queue.push(id);
      }
  const next = new Map(set);
  for (const id of gone) next.delete(id);
  const exp: Record<string, string> = {};
  for (const [k, f] of Object.entries(expanded.peek())) if (k !== uid && !gone.has(f)) exp[k] = f;
  batch(() => {
    workSet.value = next;
    expanded.value = exp;
    opened.value = opened.peek().filter((x) => !gone.has(x));
    if (selected.peek() && gone.has(selected.peek()!)) selected.value = by;
  });
  return gone.size;
}

/** Раскрыть или свернуть союз. */
export function toggleUnion(uid: string, from?: string) {
  if (isExpanded(uid)) collapseUnion(uid);
  else expandUnion(uid, from);
}

/**
 * Карточки союзов на небе «набор»: у каждого лица из opened — его союзы и союзы его происхождения; и все раскрытые
 * союзы. from — лицо, у которого карточка стоит (раскрытый союз — от кого раскрыт; иначе родитель, а если родителя нет
 * среди открытых — ребёнок). Каждый союз — один раз.
 */
export interface Plate {
  union: Union;
  from: string;
  /** направление от лица from: 'down' — его союз (к детям), 'up' — союз его происхождения (к родителям) */
  dir: 'down' | 'up';
  open: boolean;
  /** сколько лиц союза уже на небе и сколько всего */
  shown: number;
  total: number;
}
export const plates = computed<Plate[]>(() => {
  const set = workSet.value;
  const exp = expanded.value;
  const out = new Map<string, Plate>();
  const add = (u: Union, from: string, dir: 'down' | 'up') => {
    if (out.has(u.id)) return;
    const members = membersOf(u);
    out.set(u.id, { union: u, from, dir, open: u.id in exp, shown: members.filter((m) => set.has(m)).length, total: members.length });
  };
  for (const [uid, from] of Object.entries(exp)) {
    const u = unions.byId.get(uid);
    if (u) add(u, from, u.kids.includes(from) ? 'up' : 'down');
  }
  for (const id of opened.value) {
    if (!set.has(id)) continue;
    for (const u of unionsOf(id)) add(u, id, 'down');
    for (const u of originOf(id)) add(u, id, 'up');
  }
  return [...out.values()];
});

/** Есть ли у лица нераскрытые союзы — знак «+» у лица в небе «набор», пока его союзы не показаны. */
export function hasHidden(id: string): boolean {
  const set = workSet.value;
  for (const u of [...unionsOf(id), ...originOf(id)]) if (membersOf(u).some((m) => !set.has(m))) return true;
  return false;
}

// ---------- выбранный союз (решение 71) ----------

/** Союз, чья карточка открыта в листе карточки; выбор лица её закрывает. */
export const selectedUnion = signal<string | null>(null);
/** Открыть карточку союза (null — закрыть). */
export function selectUnion(uid: string | null) {
  selectedUnion.value = uid && unions.byId.has(uid) ? uid : null;
}
if (hasWindow)
  effect(() => {
    void selected.value;
    selectedUnion.value = null;
  });
