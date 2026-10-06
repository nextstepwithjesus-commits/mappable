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
 * Пять начал (решение 68; этап 11, § 5): «С Адама» и «С Иисуса Христа» — набор с одного лица, его карточка у звезды
 * открыта; «Родословие Иисуса Христа» — показ «линии Мессии»; «Ключевые лица» и «Всё небо» — одноимённые показы
 * (src/ui/show.ts). При первом посещении атлас предлагает выбрать начало; дальше открывается как в прошлый раз.
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { byId, graph, lineMembership, persons } from '../data/atlas.ts';
import { buildUnions, membersOf, type Union } from '../engine/unions.ts';
import { lineFlip, selected } from '../state.ts';
import { num } from './text/typo.ts';
import { linkSet, parseStored, setShowState, show, showRestored, workSet, type Show, type WorkEntry } from './work.ts';
import { STORY_TITLE } from './story/state.ts';
import {
  backHidden, foldAncestors, foldDescendants, foldOnly, forwardHidden, hasShownAncestors, hasShownDescendants, planBack, planForward, stepUnions, type FoldData, type MapState, type PartnerKind, type StepKind,
} from './fold.ts';

// ---------- хранилище ----------

const hasWindow = typeof window !== 'undefined';
/** Своё сохранение — с проверкой схемы (решение 130; src/ui/work.ts, parseStored). */
function read<T>(key: string, d: T): T {
  if (!hasWindow) return d;
  try {
    return parseStored(window.localStorage.getItem(`toledot:${key}`), d);
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

/** «лицо», «лица», «лиц» — по числу. */
const personsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'лицо' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'лица' : 'лиц');

/**
 * Имя показа «линии Мессии» и начала (решение 110): одно во всём атласе — во вступлении, в листе «Показ», в строке
 * показа и в строках «нет в показе «…»».
 */
export const LINES_TITLE = 'Родословие Иисуса Христа (Мф 1, Лк 3)';

export type Start = 'both' | 'adam' | 'jesus' | 'lines' | 'key' | 'all' | 'story';
/** Лица начала «Адам и Иисус Христос» (этап 21, решение 200): два конца родословия, между ними — свёрнутые линии Мессии. */
export const BOTH_IDS: readonly string[] = ['adam', 'iisus'];
export const STARTS: readonly { value: Start; label: string; hint: string }[] = [
  // начало по умолчанию (этап 21, решение 200)
  { value: 'both', label: 'Адам и Иисус Христос', hint: 'Начало и конец родословия; между ними — свёрнутые линии Мессии. «⊕» у звезды раскрывает семью: справа — супруги и дети, слева — родители.' },
  { value: 'adam', label: 'С Адама', hint: 'На небе только Адам и его карточка. «⊕» справа раскрывает жену и детей, и так дальше.' },
  { value: 'jesus', label: 'С Иисуса Христа', hint: 'На небе только Иисус Христос и его карточка. «Родители» раскрывают родословие вверх, до Адама.' },
  { value: 'lines', label: LINES_TITLE, hint: 'Обе линии — по Матфею и по Луке — от Адама до Иисуса Христа.' },
  { value: 'key', label: 'Ключевые лица', hint: 'Главные лица истории Писания; щелчок по звезде открывает карточку и родство.' },
  { value: 'all', label: 'Всё небо', hint: `Все ${num(persons.length)} ${personsWord(persons.length)} на звёздном небе; созвездия можно сворачивать.` },
  // шестое начало (этап 16, решение 187): src/ui/story/story.ts
  { value: 'story', label: STORY_TITLE, hint: 'Восемь шагов по эпохам — от Адама до Иисуса Христа, у каждого шага стих; «Дальше» ведёт небо к следующему шагу.' },
];

/** Выбранное начало; null — ещё не выбирали (первое посещение: атлас предлагает выбрать). */
export const start = signal<Start | null>(((s) => (STARTS.some((x) => x.value === s) ? s : null))(read<Start | null>('start', null)));
if (hasWindow) effect(() => write('start', start.value));
// «дальше открывается как в прошлый раз»: новый сеанс после выбранного начала — тот же показ (src/ui/work.ts, firstShow);
// адрес с полями вида без поля показа его не сбрасывает (src/ui/address.ts)
export const restoreReveal = showRestored && !!start.peek() && start.peek() !== 'all';

/** Ключевые лица (решение 68): самые яркие звёзды неба (величина 0–1) и главные лица, чья величина меньше. */
const KEY_EXTRA = ['sarra', 'revekka', 'liya', 'rakhil', 'ruf', 'mariya', 'iosif-muzh-marii', 'samuil', 'iliya', 'elisey', 'daniil', 'ezdra', 'neemiya', 'esfir'];
export const KEY_IDS: readonly string[] = [...new Set([...persons.filter((p) => p.magnitude <= 1).map((p) => p.id), ...KEY_EXTRA.filter((id) => byId.has(id))])];
/** Лица обеих линий Мессии (Мф 1, Лк 3; data/lines). */
export const LINE_IDS: readonly string[] = [...new Set([...lineMembership.joseph.keys(), ...lineMembership.mary.keys()])].filter((id) => byId.has(id));

/** Набор — нетронутое начало «Адам и Иисус Христос» (решение 200): заменить его можно без вопроса. */
export const untouchedStart = (): boolean => untouched(BOTH_IDS);
/** Набор — нетронутые лица ids: только они, закреплённые, ничего не раскрыто. */
function untouched(ids: readonly string[]): boolean {
  const set = workSet.peek();
  return set.size === ids.length && ids.every((id) => set.get(id)?.via === 'self') && !Object.keys(expanded.peek()).length;
}
/**
 * Начало карты для «К началу»: выбранное начало карты — «С Адама», «С Иисуса Христа»; иначе «Адам и Иисус Христос»
 * (рецензия этапа 21: читатель, начавший с Адама, возвращается к Адаму).
 */
export const mapStart = (): 'both' | 'adam' | 'jesus' => {
  const s = start.peek();
  return s === 'adam' || s === 'jesus' ? s : 'both';
};
/** Карта — нетронутое своё начало: «К началу» ничего бы не изменило. */
export const untouchedMap = (): boolean => untouched(startIds(mapStart()));

/**
 * «К началу» строки шагов (решения 199–200): карта снова со своего начала — «Адам и Иисус Христос», а у начавшего «С
 * Адама» или «С Иисуса Христа» — с него; небо вписывает её (restartTick читает SkyView), диктор называет шаг; вернуть
 * прежнюю карту — «Отменить шаг».
 */
export const restartTick = signal(0);
export function restartMap() {
  const before = workSet.peek().size;
  const s = mapStart();
  batch(() => {
    startWith(s);
    restartTick.value++;
  });
  tell({ kind: 'restart', id: startIds(s)[0], added: [...startIds(s)], removed: Math.max(0, before - startIds(s).length) });
}

/** Лица, с которых начинается небо при начале s. */
export function startIds(s: Start): readonly string[] {
  if (s === 'both') return BOTH_IDS;
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

/** Показ начала s (решение 68; этап 11, § 5). */
export function startShow(s: Start): Show {
  if (s === 'both') return { kind: 'set' };
  if (s === 'lines') return { kind: 'lines' };
  if (s === 'story') return { kind: 'all' };
  if (s === 'key') return { kind: 'key' };
  if (s === 'all') return { kind: 'all' };
  return { kind: 'set' };
}

/**
 * Начать с начала s (решение 68; этап 11, § 5): «С Адама» и «С Иисуса Христа» — набор с одного лица, союзы свёрнуты,
 * лицо выбрано (его карточка у звезды открыта, у ромба союза — «+N»); «Родословие Иисуса Христа», «Ключевые лица»
 * и «Всё небо» — одноимённые показы, набор читателя они не трогают.
 */
export function startWith(s: Start) {
  // рассказ (решение 187): всё небо и первый шаг; модуль рассказа тянет за собой небо — без круга импортов
  if (s === 'story') {
    start.value = s;
    void import('./story/story.ts').then((m) => m.openStory(0));
    return;
  }
  batch(() => {
    start.value = s;
    // «Адам и Иисус Христос» (решение 200): два закреплённых лица, ничего не раскрыто, ничего не выбрано
    if (s === 'both') {
      linkSet.value = null;
      opened.value = [];
      expanded.value = {};
      workSet.value = new Map<string, WorkEntry>(BOTH_IDS.map((id) => [id, { via: 'self', of: id }]));
      selected.value = null;
      setShowState({ kind: 'set' });
      return;
    }
    if (s === 'adam' || s === 'jesus') {
      const id = s === 'adam' ? 'adam' : 'iisus';
      opened.value = [id];
      expanded.value = {};
      workSet.value = new Map<string, WorkEntry>([[id, { via: 'self', of: id }]]);
      selected.value = id;
      setShowState({ kind: 'set' }, { anchor: id });
      return;
    }
    setShowState(startShow(s), { anchor: selected.peek() });
  });
}

/**
 * Союз лица, который раскрывается вместе с лицом (Я27; решение координатора по K2): у лица один союз с детьми — он;
 * союзов с детьми два и больше или ни одного — null (сначала ромбы союзов, потом «+N» у нужного).
 */
export function soleUnion(id: string): Union | null {
  const withKids = unionsOf(id).filter((u) => u.kids.length > 0);
  return withKids.length === 1 ? withKids[0] : null;
}

/**
 * «+» у имени и «Продолжить ветвь» (щелчок по лицу в небе «набор»): на небо — ромбы союзов лица; если союз с детьми
 * у лица один, он сразу раскрывается — дети на небе без второго щелчка по «+N» (Я27: Адам → Ной — не больше 11 действий).
 */
export function openPerson(id: string) {
  if (!byId.has(id)) return;
  const sole = soleUnion(id);
  const open = !opened.peek().includes(id);
  // только в показе «набор»: в других показах ромбов раскрытия нет, и раскрытие не меняет показ
  const grow = !!sole && !(sole.id in expanded.peek()) && workSet.peek().has(id) && show.peek().kind === 'set';
  if (!open && !grow) return;
  batch(() => {
    if (open) opened.value = [...opened.peek(), id];
    if (grow) expandUnion(sole!.id, id);
  });
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
  // опора перехода (§ 10) — ромб союза: он стоит на следе матери, и если мать уже была на небе, держится она — ромб остаётся
  // под щелчком, дети встают вокруг него; иначе — лицо, от которого раскрыли (у его следа стоял свёрнутый ромб)
  const mother = u.b && u.b !== by && workSet.peek().has(u.b) ? u.b : null;
  batch(() => {
    workSet.value = next;
    expanded.value = { ...expanded.peek(), [uid]: by };
    setShowState({ kind: 'set' }, { anchor: mother ?? by, history: show.peek().kind === 'set' ? 'replace' : 'push' });
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
    // свёртка: опора перехода — лицо, у которого свернули (§ 10)
    if (show.peek().kind === 'set') setShowState({ kind: 'set' }, { anchor: by, history: 'replace' });
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
  // карточки союзов раскрытия — только в показе «набор» (этап 11): в других показах союзы рисует само небо
  if (show.value.kind !== 'set') return [];
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
  // союз родителей нераскрытым ромбом у лица больше не ставится (этап 21, решение 197): шаг назад — рукоятка «+» слева
  // от звезды; раскрытый союз родителей — выше, из expanded
  // ромбы союзов лица — союзы его шага вперёд (без «из сыновей» и усыновления; src/ui/fold.ts, stepUnions)
  void lineFlip.value;
  for (const id of opened.value) {
    if (!set.has(id)) continue;
    for (const u of stepUnions(FOLD_DATA, id)) add(u, id, 'down');
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

// ---------- шаги и свёртки карты (этап 21, решения 197–199; правила — src/ui/fold.ts) ----------

/** Данные правил карты; flip — переключатель «Лк 3» (Илий — отец Марии или Иосифа, src/ui/fold.ts, stepUnions). */
const FOLD_DATA: FoldData = {
  graph,
  unions,
  get flip() {
    return lineFlip.peek();
  },
};
/** Состояние карты «набор» сейчас. */
export const mapState = (): MapState => ({ set: workSet.peek(), expanded: expanded.peek(), opened: opened.peek() });
/** Записать состояние карты; опора перехода — лицо, у которого действовали (оно не сдвигается на экране). */
function applyMap(s: MapState, anchor: string) {
  batch(() => {
    workSet.value = s.set;
    expanded.value = s.expanded;
    opened.value = [...s.opened];
    if (selected.peek() && !s.set.has(selected.peek()!)) selected.value = anchor;
    setShowState({ kind: 'set' }, { anchor, history: show.peek().kind === 'set' ? 'replace' : 'push' });
  });
}

/** Что сделал шаг или свёртка — для диктора и строки показа (src/ui/sky/text.ts, mapSayText). */
export interface MapNews {
  kind: StepKind | 'fold-desc' | 'fold-anc' | 'only' | 'restart';
  id: string;
  /** кто появился на карте (шаг) */
  added: string[];
  /** сколько ушло с карты (свёртка) */
  removed: number;
  /** шаг вперёд: кем приходятся раскрытые супруги (src/ui/fold.ts, partnerKind) */
  kinds?: readonly PartnerKind[];
}
/** Последний шаг карты: читает небо (вслух) и строка показа. */
export const mapNews = signal<(MapNews & { n: number }) | null>(null);
const tell = (m: MapNews) => (mapNews.value = { ...m, n: (mapNews.peek()?.n ?? 0) + 1 });

/** Карта «набор» своя (не набор из ссылки, решение 45): шаги и свёртки меняют только свой набор. */
const ownMap = () => !linkSet.peek();

/**
 * Выбранное лицо — на карту (решение 200): найденное поиском, открытое в указателе, ссылкой или по имени в карточке лицо,
 * которого на своей карте нет, встаёт на неё закреплённым — и сразу с рукоятками «+». Только при смене выбора: отмена
 * шага (src/ui/history.ts) не возвращает на карту выбранного, если его нет в отменённом состоянии.
 */
if (hasWindow)
  effect(() => {
    const id = selected.value;
    if (!id || !byId.has(id)) return;
    if (show.peek().kind !== 'set' || linkSet.peek() || workSet.peek().has(id)) return;
    addSelf(id);
  });

/**
 * Шаг вперёд от лица id (решение 197): один союз — супруг и дети сразу; несколько — сначала супруги (и ромбы союзов
 * с «+N»), следующий шаг — все дети. Лицо не на карте — сначала встаёт на неё (закреплённым). Возвращает, что сделано.
 */
export function stepForward(id: string): StepKind {
  if (!byId.has(id) || !ownMap()) return 'none';
  const before = new Set(workSet.peek().keys());
  const state = { ...mapState(), set: before.has(id) ? workSet.peek() : new Map([...workSet.peek(), [id, { via: 'self', of: id }]]) };
  const plan = planForward(FOLD_DATA, state, id);
  if (plan.kind === 'none') return 'none';
  // кем приходятся раскрываемые супруги — для слов диктора («раскрыты наложница и дети», «дети и их мать»)
  const kinds = forwardHidden(FOLD_DATA, state, id).kinds;
  batch(() => {
    if (!before.has(id)) addSelf(id);
    if (plan.kind === 'spouses') {
      const next = new Map(workSet.peek());
      for (const z of plan.spouses) if (!next.has(z)) next.set(z, { via: 'family', of: id });
      workSet.value = next;
      if (!opened.peek().includes(id)) opened.value = [...opened.peek(), id];
      setShowState({ kind: 'set' }, { anchor: id, history: show.peek().kind === 'set' ? 'replace' : 'push' });
    } else for (const uid of plan.unions) expandUnion(uid, id);
  });
  tell({ kind: plan.kind, id, added: [...workSet.peek().keys()].filter((x) => !before.has(x) && x !== id), removed: 0, kinds });
  return plan.kind;
}

/**
 * Что откроет шаг назад от лица (рецензия этапа 21: подсказка называет ровно то, что раскроется): родители — с видом
 * утверждения союза (по Луке, по толкованию, «из сыновей» — предок, усыновление), братья и сёстры — кто ещё родился в
 * этих союзах.
 */
export function backWhat(id: string): { parents: { id: string; claim?: string; interp: boolean }[]; sibs: string[] } {
  const s = mapState();
  const plan = planBack(FOLD_DATA, s, id);
  const parents: { id: string; claim?: string; interp: boolean }[] = [];
  const sibs: string[] = [];
  for (const uid of plan.unions) {
    const u = unions.byId.get(uid);
    if (!u) continue;
    const claim = u.id.includes('~') ? u.claim : undefined;
    for (const p of [u.a, u.b]) if (p && !s.set.has(p) && !parents.some((q) => q.id === p)) parents.push({ id: p, claim, interp: u.kidsCert === 'interpretation' });
    for (const k of u.kids) if (k !== id && !s.set.has(k) && !sibs.includes(k)) sibs.push(k);
  }
  return { parents, sibs };
}

/** Шаг назад от лица id (решение 197): родители, братья и сёстры — на карту. */
export function stepBack(id: string): StepKind {
  if (!byId.has(id) || !ownMap()) return 'none';
  const before = new Set(workSet.peek().keys());
  const plan = planBack(FOLD_DATA, mapState(), id);
  if (plan.kind === 'none') return 'none';
  batch(() => {
    if (!before.has(id)) addSelf(id);
    for (const uid of plan.unions) expandUnion(uid, id);
  });
  tell({ kind: 'parents', id, added: [...workSet.peek().keys()].filter((x) => !before.has(x) && x !== id), removed: 0 });
  return 'parents';
}

/** Лицо — на карту, закреплённым (шаг от лица, которого на карте нет). */
function addSelf(id: string) {
  const next = new Map(workSet.peek());
  next.set(id, { via: 'self', of: id });
  workSet.value = next;
}

/** Свернуть потомков лица на карте (решение 198). Возвращает, сколько лиц ушло. */
export function foldDescendantsOf(id: string): number {
  if (!byId.has(id) || !ownMap()) return 0;
  const s = mapState();
  const next = foldDescendants(FOLD_DATA, s, id);
  const removed = s.set.size - next.set.size;
  applyMap(next, id);
  tell({ kind: 'fold-desc', id, added: [], removed });
  return removed;
}

/** Свернуть предков лица на карте (решение 198). Возвращает, сколько лиц ушло. */
export function foldAncestorsOf(id: string): number {
  if (!byId.has(id) || !ownMap()) return 0;
  const s = mapState();
  const next = foldAncestors(FOLD_DATA, s, id);
  const removed = s.set.size - next.set.size;
  applyMap(next, id);
  tell({ kind: 'fold-anc', id, added: [], removed });
  return removed;
}

/**
 * Свернуть всю карту в лицо id (решение 198): на карте — только оно, небо — «набор». С любого показа, и со всего неба:
 * «Сиф — и только он», дальше раскрывается шагами.
 */
export function foldMapTo(id: string) {
  if (!byId.has(id)) return;
  const removed = Math.max(0, (show.peek().kind === 'set' ? workSet.peek().size : persons.length) - 1);
  batch(() => {
    // набор из ссылки (решение 45) — только просмотр: «только это лицо» начинает свою карту
    linkSet.value = null;
    applyMap(foldOnly(id), id);
    selected.value = id;
  });
  tell({ kind: 'only', id, added: [], removed });
}

/** Шаг вперёд: что он откроет — вид шага, сколько скрыто супругов и детей, кем приходятся скрытые супруги. */
export interface StepForward {
  kind: 'union' | 'spouses' | 'kids';
  spouses: number;
  kids: number;
  kinds: readonly PartnerKind[];
}
/** Что можно сделать с лицом на карте «набор»: для карточки, меню звезды и клавиш (решение 197). */
export interface MapCmds {
  /** шаг вперёд: что он откроет; null — впереди ничего не скрыто */
  forward: StepForward | null;
  /** шаг назад: сколько лиц откроет; 0 — позади ничего не скрыто */
  back: number;
  /** есть ли что свернуть вперёд и назад */
  foldDesc: boolean;
  foldAnc: boolean;
  /** на карте есть ещё кто-то, кроме лица */
  others: boolean;
}
export function mapCmds(id: string): MapCmds {
  const s: MapState = { set: workSet.value, expanded: expanded.value, opened: opened.value };
  const f = forwardHidden(FOLD_DATA, s, id);
  const plan = planForward(FOLD_DATA, s, id);
  return {
    forward: plan.kind === 'none' ? null : { kind: plan.kind as StepForward['kind'], spouses: f.spouses.length, kids: f.kids, kinds: f.kinds },
    back: backHidden(FOLD_DATA, s, id),
    foldDesc: hasShownDescendants(FOLD_DATA, s, id),
    foldAnc: hasShownAncestors(FOLD_DATA, s, id),
    others: [...s.set.keys()].some((x) => x !== id),
  };
}
