/**
 * Рабочий набор сеанса, небо по набору, свёртка и стопка карточек (J3–J6; решение владельца 17: «необходима возможность
 * сворачивать и разворачивать карточки нужных персонажей и их генеалогии, чтобы на атласе были те, с которыми
 * пользователь работает в данной сессии»).
 *
 *  — workSet — лица, с которыми читатель работает: id → откуда взято (само лицо, предок, потомок, семья, звено пути).
 *    Хранится в памяти браузера (localStorage) и переживает перезагрузку; без хранилища всё работает, только не помнится.
 *  — show — показ неба (этап 11, § 5; решение 81): всё небо, линии Мессии, ключевые лица, созвездия, род лица или набор.
 *    Здесь — только сам сигнал и его запись (reveal.ts и show.ts читают его без круга импорта); модель показа —
 *    составы, строка «На небе: …», числа — src/ui/show.ts. Показ «набор» — это workSet (или набор из ссылки, linkSet).
 *  — skyMode — прежний переключатель «все лица | набор» (J4): теперь производный от показа — «все лица» у показа «всё
 *    небо», «набор» у остальных. Запись в него (прежние органы неба) меняет показ.
 *  — foldDesc, foldGroups — свёрнутые потомки лиц и созвездия (J5); помнятся в сеансе (sessionStorage).
 *  — стопка карточек (J6) — в src/ui/stack.ts.
 * Предки и потомки — по графу (src/engine/graph.ts): отцы и матери, дети; связи по толкованию — только по выбору.
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { byId, graph, groupById, lineMembership } from '../data/atlas.ts';
import { siblings } from '../engine/graph.ts';
import type { LineageBy, LineageDir, LinksOut } from '../engine/lineage.ts';
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
/** Лица набора множеством (одно и то же, пока набор не менялся): метки набора на небе «все лица» (SkyView). */
export const workIds = computed<ReadonlySet<string>>(() => new Set(workSet.value.keys()));

// ---------- набор из ссылки (решение 45; IX-69, UX-79) ----------

/**
 * Набор из чужой ссылки (~k1~n…) — временный просмотр (решение 45): небо «набор» показывает его, а свой набор читателя
 * (workSet и память браузера) не меняется, пока читатель не скажет «добавить в мой набор». null — ссылки нет или её набор
 * совпадает со своим. Живёт до «добавить», «вернуться к моему», смены режима неба, правки своего набора и ухода по адресу
 * без набора (src/ui/address.ts).
 */
export const linkSet = signal<ReadonlyMap<string, WorkEntry> | null>(null);
/** Набор, который показывает небо «набор»: из ссылки, пока его смотрят, иначе свой. */
export const shownSet = computed<ReadonlyMap<string, WorkEntry>>(() => linkSet.value ?? workSet.value);
/**
 * Лица на небе множеством: его читает небо (src/render/rows.ts, SkyView). У показа «набор» — набор неба, у показов
 * созвездий, рода, линий и ключевых лиц — их лица с гостями (src/ui/show.ts пишет их в showOn).
 */
export const shownIds = computed<ReadonlySet<string>>(() => {
  const k = show.value.kind;
  const on = showOn.value;
  if (k !== 'set' && k !== 'all' && on) return on;
  return new Set(shownSet.value.keys());
});

/** Совпадают ли наборы по составу. */
export const sameSet = (a: Iterable<string>, b: ReadonlyMap<string, unknown>) => {
  const xs = [...new Set(a)];
  return xs.length === b.size && xs.every((id) => b.has(id));
};

/**
 * Набор из ссылки (ids) при своём наборе mine: null — показывать свой (совпадает по составу), иначе временный набор; лица,
 * которые есть и в своём наборе, сохраняют свою помету.
 */
export function linkSetFor(ids: readonly string[], mine: ReadonlyMap<string, WorkEntry>): Map<string, WorkEntry> | null {
  const ok = ids.filter((id) => byId.has(id));
  if (!ok.length || sameSet(ok, mine)) return null;
  const next = new Map<string, WorkEntry>();
  for (const id of ok) next.set(id, mine.get(id) ?? { via: 'self', of: id });
  return next;
}

/** «Добавить в мой набор» (решение 45): лица ссылки — в свой набор (свои пометы остаются), просмотр ссылки кончается. */
export function adoptLinkSet(): number {
  const l = linkSet.peek();
  if (!l) return 0;
  const next = new Map(workSet.peek());
  let added = 0;
  for (const [id, e] of l)
    if (!next.has(id)) {
      next.set(id, e);
      added++;
    }
  batch(() => {
    linkSet.value = null;
    workSet.value = next;
  });
  return added;
}

/**
 * «Вернуться к моему» (решение 45): небо снова показывает свой набор, набор ссылки уходит из адреса. Свой набор пуст —
 * небо показывает все лица, а не пустую карту (UX-79).
 */
export function leaveLinkSet() {
  batch(() => {
    linkSet.value = null;
    if (!workSet.peek().size) setShowState({ kind: 'all' });
  });
}

/**
 * Строка у кромки неба при ссылке «набор» и пустом своём наборе (UX-79): небо показывает все лица, строка объясняет почему.
 * Снимается командой «скрыть», сменой режима неба и первым лицом, взятым в работу.
 */
export const workNotice = signal<string | null>(null);
export const EMPTY_LINK_NOTICE = 'Ссылка открыта в режиме «набор», но ваш набор пуст: показаны все лица';

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

/** Убрать лицо из набора. */
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

// ---------- показ (этап 11, § 5; решение 81) ----------

/**
 * Показ неба: что на нём сейчас. Одновременно действует один показ; поверх него — фокус (лицо, союз, связь).
 *  all     — всё небо (общая раскладка, карта);
 *  lines   — линии Мессии (Мф 1, Лк 3), семейная укладка «Г» с коридором;
 *  key     — ключевые лица (src/ui/reveal.ts, KEY_IDS), карта со свёрткой прочего;
 *  groups  — созвездия (список id data/groups.json) и связи наружу: обрывками, с роднёй вне созвездия, без связей;
 *  lineage — род лица: предки, потомки или оба; поколений 1–3 или все (null); по отцам или по крови;
 *  set     — набор (раскрыто вручную): рабочий набор workSet или набор из ссылки linkSet.
 */
export type Show =
  | { kind: 'all' }
  | { kind: 'lines' }
  | { kind: 'key' }
  | { kind: 'groups'; groups: readonly string[]; links: LinksOut }
  | { kind: 'lineage'; id: string; dir: LineageDir; gen: 1 | 2 | 3 | null; by: LineageBy }
  | { kind: 'set' };
export type ShowKind = Show['kind'];
export type { LinksOut, LineageDir, LineageBy };

/**
 * Ключ показа — он же поле «~v» адреса (src/ui/address.ts): «a» — всё небо, «l» — линии Мессии, «k» — ключевые лица,
 * «s» — набор, «g.nahorites.judah» — созвездия, «r.iuda.d.0.f» — род лица (направление a | d | b, поколений 0 — все,
 * по отцам f | по крови b). Связи наружу у созвездий — отдельным полем «~x» (showLinksField).
 */
export function showKey(s: Show): string {
  switch (s.kind) {
    case 'all':
      return 'a';
    case 'lines':
      return 'l';
    case 'key':
      return 'k';
    case 'set':
      return 's';
    case 'groups':
      return ['g', ...s.groups].join('.');
    case 'lineage':
      return ['r', s.id, s.dir === 'up' ? 'a' : s.dir === 'down' ? 'd' : 'b', String(s.gen ?? 0), s.by === 'father' ? 'f' : 'b'].join('.');
  }
}
/** Поле «~x»: связи наружу у показа созвездий — 0 без связей, 1 обрывками (по умолчанию, не пишется), 2 с роднёй. */
export const showLinksField = (s: Show): string | null => (s.kind === 'groups' && s.links !== 'stubs' ? (s.links === 'none' ? '0' : '2') : null);

/** Показ по ключу (поле «~v») и полю «~x»; null — ключ не разобран или называет несуществующее лицо или созвездие. */
export function parseShow(v: string, x?: string | null): Show | null {
  const f = v.split('.');
  switch (f[0]) {
    case 'a':
      return f.length === 1 ? { kind: 'all' } : null;
    case 'l':
      return f.length === 1 ? { kind: 'lines' } : null;
    case 'k':
      return f.length === 1 ? { kind: 'key' } : null;
    case 's':
      return f.length === 1 ? { kind: 'set' } : null;
    case 'g': {
      const gs = [...new Set(f.slice(1))].filter((g) => groupById.has(g));
      if (!gs.length) return null;
      const links: LinksOut = x === '0' ? 'none' : x === '2' ? 'kin' : 'stubs';
      return { kind: 'groups', groups: gs, links };
    }
    case 'r': {
      if (f.length !== 5 || !byId.has(f[1])) return null;
      const dir: LineageDir | null = f[2] === 'a' ? 'up' : f[2] === 'd' ? 'down' : f[2] === 'b' ? 'both' : null;
      const n = Number(f[3]);
      const gen = n === 0 ? null : n === 1 || n === 2 || n === 3 ? (n as 1 | 2 | 3) : undefined;
      const by: LineageBy | null = f[4] === 'f' ? 'father' : f[4] === 'b' ? 'blood' : null;
      if (!dir || gen === undefined || !by) return null;
      return { kind: 'lineage', id: f[1], dir, gen, by };
    }
    default:
      return null;
  }
}
/** Один и тот же показ. */
export const sameShow = (a: Show, b: Show) => showKey(a) === showKey(b) && showLinksField(a) === showLinksField(b);

/** Показ, сохранённый в этом сеансе; null — новый сеанс. */
const showSaved: Show | null = ((v) =>
  v && typeof v === 'object' && typeof (v as { k?: unknown }).k === 'string' ? parseShow((v as { k: string }).k, (v as { x?: string }).x ?? null) : null)(
  read<unknown>('session', 'show', null),
);
/** Режим неба, сохранённый в сеансе до этапа 11 (не перезаписывается): показ «набор» или «всё небо». */
const modeSaved = ((m) => (m === 'work' || m === 'all' ? m : null))(read<string | null>('session', 'skymode', null));
/**
 * Первый показ: сохранённый в этом сеансе; в новом сеансе — «как в прошлый раз» (решение 68) по выбранному началу
 * (src/ui/reveal.ts, start): набор, если он не пуст, линии Мессии, ключевые лица, иначе всё небо.
 */
function firstShow(): Show {
  if (showSaved) {
    // прежний ключ режима записан позже показа (его ставят сценарии и прежние страницы): при расхождении верен он
    const m = showSaved.kind === 'all' ? 'all' : 'work';
    if (modeSaved && modeSaved !== m) return modeSaved === 'work' ? { kind: 'set' } : { kind: 'all' };
    return showSaved;
  }
  if (modeSaved) return modeSaved === 'work' ? { kind: 'set' } : { kind: 'all' };
  const st = read<string | null>('local', 'start', null);
  if ((st === 'adam' || st === 'jesus') && workSet.peek().size > 0) return { kind: 'set' };
  if (st === 'lines') return { kind: 'lines' };
  if (st === 'key') return { kind: 'key' };
  return { kind: 'all' };
}
/** Показ неба. Пишут его setShow (src/ui/show.ts), начала (src/ui/reveal.ts, startWith) и адрес; читают все. */
export const show = signal<Show>(firstShow());
/** Новый сеанс продолжен по памяти браузера (решение 68): показ не из этого сеанса и не «всё небо». */
export const showRestored = hasWindow && !showSaved && !modeSaved && show.peek().kind !== 'all';
if (hasWindow)
  effect(() => {
    const s = show.value;
    const x = showLinksField(s);
    write('session', 'show', x ? { k: showKey(s), x } : { k: showKey(s) });
    // и прежний ключ режима неба — для прежних страниц и сценариев, которые его читают и пишут
    write('session', 'skymode', s.kind === 'all' ? 'all' : 'work');
  });

/** Лицо-опора перехода при смене показа (§ 10): его строка на экране не сдвигается; null — выбранное лицо или середина. */
export const showAnchor = signal<string | null>(null);
/** Как записать ближайшую смену показа в историю (src/ui/address.ts): 'push' — новой записью, 'replace' — в ту же. */
export const showHistory = { mode: 'push' as 'push' | 'replace' };

/**
 * Сменить показ (низкий уровень; модель — src/ui/show.ts, setShow). anchor — лицо-опора перехода; history — как записать
 * смену в историю. Тот же показ не перезаписывается.
 */
export function setShowState(s: Show, o: { anchor?: string | null; history?: 'push' | 'replace' } = {}) {
  batch(() => {
    showAnchor.value = o.anchor ?? null;
    // способ записи — только у настоящей смены показа: иначе он достался бы следующей записи (выбору лица)
    if (sameShow(s, show.peek())) return;
    showHistory.mode = o.history ?? 'push';
    show.value = s;
  });
}

/**
 * Лица показа (кроме «всего неба» и набора) вместе с гостями: их пишет src/ui/show.ts, читает shownIds — чтобы прежнее
 * небо (режим «набор» в src/render/rows.ts) показывало состав показа, пока небо не перешло на поле show плана.
 */
export const showOn = signal<ReadonlySet<string> | null>(null);

// ---------- небо по набору (J4) ----------

export type SkyMode = 'all' | 'work';
/** Режим неба, сохранённый в этом сеансе до этапа 11; null — новый сеанс или показ помнится сам. */
export const skyModeSaved = modeSaved;
/**
 * Прежний переключатель неба (J4): производный от показа — «all» у всего неба, «work» у остальных показов. Запись в него
 * (прежние органы неба) меняет показ: «all» — всё небо, «work» — набор.
 */
export const skyMode = signal<SkyMode>(show.peek().kind === 'all' ? 'all' : 'work');
effect(() => {
  const m: SkyMode = show.value.kind === 'all' ? 'all' : 'work';
  if (skyMode.peek() !== m) skyMode.value = m;
});
effect(() => {
  const m = skyMode.value;
  const k = show.peek().kind;
  if (m === 'all' && k !== 'all') setShowState({ kind: 'all' });
  else if (m === 'work' && k === 'all') setShowState({ kind: 'set' });
});
// набор из ссылки — просмотр в показе «набор»: ушли с него — просмотр кончился (IX-69). Строка UX-79 — до перехода
// в «набор» или первого лица, взятого в работу
if (hasWindow)
  effect(() => {
    const k = show.value.kind;
    const n = workSet.value.size;
    if (k !== 'set' && linkSet.peek()) linkSet.value = null;
    if ((k === 'set' || n > 0) && workNotice.peek()) workNotice.value = null;
  });

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
 * падеже: «Иессей добавлен в набор; в наборе 5 лиц», «Руфь убрана из набора; набор пуст», «Давид: потомки свёрнуты,
 * скрыто 62 лица». Одно слово — одно понятие: «набор» (этап 11, решение 81; слов «В работе» в интерфейсе нет).
 */
export function workKeyText(
  r: { kind: 'take' | 'drop'; id: string; size: number } | { kind: 'fold' | 'unfold'; id: string; hidden?: number },
): string {
  const name = byId.get(r.id)?.name ?? r.id;
  if ('size' in r) {
    if (r.kind === 'take') return `${name} ${bySex(r.id, 'добавлен', 'добавлена')} в набор; в наборе ${persons(r.size)}`;
    return `${name} ${bySex(r.id, 'убран', 'убрана')} из набора; ${r.size ? `в наборе ${persons(r.size)}` : 'набор пуст'}`;
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
 * D («В») — добавить лицо в набор или убрать из набора; C («С») — свернуть или развернуть его потомков на небе.
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
